"""Async CardDAV client (RFC 6352), implemented directly on httpx.

caldav provides no CardDAV support, and the address-book protocol is shallow:
discovery via PROPFIND, listing via the ``addressbook-query`` REPORT, and
per-card CRUD via GET/PUT/DELETE on ``.vcf`` resources.
"""

from __future__ import annotations

import re
from types import TracebackType
from urllib.parse import quote, urljoin

import httpx
from lxml import etree

from . import stats, vcard
from .ical import new_uid
from .errors import (
    AuthError,
    ConflictError,
    NotFoundError,
    PreconditionFailedError,
    UpstreamError,
)
from .models import AddressBookOut, ContactBase, ContactCreate, ContactOut
from .store import Account

DAV = "DAV:"
CARD = "urn:ietf:params:xml:ns:carddav"

_CURRENT_USER_PRINCIPAL = (
    '<d:propfind xmlns:d="DAV:"><d:prop>'
    "<d:current-user-principal/></d:prop></d:propfind>"
)
_ADDRESSBOOK_HOME = (
    f'<d:propfind xmlns:d="DAV:" xmlns:c="{CARD}"><d:prop>'
    "<c:addressbook-home-set/></d:prop></d:propfind>"
)
_LIST_ADDRESSBOOKS = (
    f'<d:propfind xmlns:d="DAV:" xmlns:c="{CARD}"><d:prop>'
    "<d:resourcetype/><d:displayname/>"
    "<c:addressbook-description/></d:prop></d:propfind>"
)
_ADDRESSBOOK_QUERY = (
    f'<c:addressbook-query xmlns:d="DAV:" xmlns:c="{CARD}"><d:prop>'
    "<d:getetag/><c:address-data/></d:prop></c:addressbook-query>"
)


def _q(tag: str, ns: str = DAV) -> str:
    return f"{{{ns}}}{tag}"


def _collection_id(url: str) -> str:
    return quote(url.rstrip("/").rsplit("/", 1)[-1], safe="")


def _slug(name: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", name.strip().lower()).strip("-")
    return slug or "addressbook"


class CardDavSession:
    """A short-lived CardDAV connection bound to one account."""

    def __init__(self, account: Account, timeout: int) -> None:
        base = account.server
        self._base = base if base.endswith("/") else base + "/"
        self._client = httpx.AsyncClient(
            auth=(account.username, account.password),
            timeout=timeout,
            follow_redirects=True,
            headers={"User-Agent": "pimpumpam"},
        )
        # Time every upstream request (httpx: request(method, url, ...); get/put
        # route through request() too).
        stats.register()
        self._client.request = stats.instrument(self._client.request, "carddav", 0)
        self._home: str | None = None
        self._ab_urls: dict[str, str] | None = None

    async def __aenter__(self) -> CardDavSession:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        await self.close()

    async def close(self) -> None:
        await self._client.aclose()

    # -- low-level transport ------------------------------------------------- #
    async def _dav(
        self,
        method: str,
        url: str,
        *,
        body: str | None = None,
        depth: int | None = None,
        headers: dict[str, str] | None = None,
    ) -> httpx.Response:
        request_headers = {"Content-Type": "application/xml; charset=utf-8"}
        if depth is not None:
            request_headers["Depth"] = str(depth)
        if headers:
            request_headers.update(headers)
        try:
            return await self._client.request(
                method, url, content=body, headers=request_headers
            )
        except httpx.HTTPError as exc:
            raise UpstreamError(f"CardDAV request failed: {exc}") from exc

    @staticmethod
    def _check(response: httpx.Response) -> None:
        if response.status_code in (401, 403):
            raise AuthError("upstream rejected credentials")
        if response.status_code >= 400:
            raise UpstreamError(
                f"upstream returned {response.status_code}: {response.text[:200]}"
            )

    # -- discovery ----------------------------------------------------------- #
    async def _propfind_href(
        self, url: str, body: str, container: str, container_ns: str = DAV
    ) -> str | None:
        response = await self._dav("PROPFIND", url, body=body, depth=0)
        if response.status_code >= 400:
            return None
        tree = etree.fromstring(response.content)
        element = tree.find(f".//{_q(container, container_ns)}/{_q('href')}")
        if element is None or not element.text:
            return None
        return urljoin(str(response.url), element.text)

    async def _home_set(self) -> str:
        if self._home is not None:
            return self._home
        principal = await self._propfind_href(
            self._base, _CURRENT_USER_PRINCIPAL, "current-user-principal"
        )
        if principal is None:
            principal = (
                await self._propfind_href(
                    urljoin(self._base, "/.well-known/carddav"),
                    _CURRENT_USER_PRINCIPAL,
                    "current-user-principal",
                )
                or self._base
            )
        home = await self._propfind_href(
            principal, _ADDRESSBOOK_HOME, "addressbook-home-set", CARD
        )
        self._home = home or principal
        return self._home

    # -- address books ------------------------------------------------------- #
    async def list_addressbooks(self) -> list[AddressBookOut]:
        home = await self._home_set()
        response = await self._dav("PROPFIND", home, body=_LIST_ADDRESSBOOKS, depth=1)
        self._check(response)
        tree = etree.fromstring(response.content)
        books: list[AddressBookOut] = []
        cache: dict[str, str] = {}
        for resp in tree.findall(_q("response")):
            href_el = resp.find(_q("href"))
            if href_el is None or not href_el.text:
                continue
            resourcetype = resp.find(f".//{_q('resourcetype')}")
            is_addressbook = (
                resourcetype is not None
                and resourcetype.find(_q("addressbook", CARD)) is not None
            )
            if not is_addressbook:
                continue
            url = urljoin(str(response.url), href_el.text)
            book_id = _collection_id(url)
            cache[book_id] = url if url.endswith("/") else url + "/"
            books.append(
                AddressBookOut(
                    id=book_id,
                    display_name=resp.findtext(f".//{_q('displayname')}") or None,
                    description=resp.findtext(f".//{_q('addressbook-description', CARD)}")
                    or None,
                    url=url,
                )
            )
        self._ab_urls = cache
        return books

    async def _addressbook_url(self, addressbook_id: str) -> str:
        if self._ab_urls is None:
            await self.list_addressbooks()
        assert self._ab_urls is not None
        url = self._ab_urls.get(addressbook_id)
        if url is None:
            raise NotFoundError(f"address book '{addressbook_id}' not found")
        return url

    async def create_addressbook(
        self, display_name: str, description: str | None
    ) -> AddressBookOut:
        home = await self._home_set()
        book_id = _slug(display_name)
        url = urljoin(home, book_id + "/")
        desc = (
            f"<c:addressbook-description>{description}</c:addressbook-description>"
            if description
            else ""
        )
        body = (
            f'<d:mkcol xmlns:d="DAV:" xmlns:c="{CARD}"><d:set><d:prop>'
            "<d:resourcetype><d:collection/><c:addressbook/></d:resourcetype>"
            f"<d:displayname>{display_name}</d:displayname>{desc}"
            "</d:prop></d:set></d:mkcol>"
        )
        response = await self._dav("MKCOL", url, body=body)
        if response.status_code == 405:
            raise ConflictError(f"address book '{book_id}' already exists")
        self._check(response)
        self._ab_urls = None  # invalidate cache
        return AddressBookOut(
            id=book_id, display_name=display_name, description=description, url=url
        )

    async def delete_addressbook(self, addressbook_id: str) -> None:
        url = await self._addressbook_url(addressbook_id)
        response = await self._dav("DELETE", url)
        self._check(response)
        self._ab_urls = None

    # -- contacts ------------------------------------------------------------ #
    @staticmethod
    def _vcf_name(uid: str) -> str:
        return quote(uid, safe="") + ".vcf"

    async def list_contacts(self, addressbook_id: str) -> list[ContactOut]:
        url = await self._addressbook_url(addressbook_id)
        response = await self._dav("REPORT", url, body=_ADDRESSBOOK_QUERY, depth=1)
        self._check(response)
        tree = etree.fromstring(response.content)
        contacts: list[ContactOut] = []
        for resp in tree.findall(_q("response")):
            data = resp.find(f".//{_q('address-data', CARD)}")
            if data is None or not (data.text or "").strip():
                continue
            contacts.append(vcard.parse_vcard(data.text))
        return contacts

    async def get_contact(
        self, addressbook_id: str, uid: str
    ) -> tuple[ContactOut, str | None]:
        base = await self._addressbook_url(addressbook_id)
        response = await self._client.get(urljoin(base, self._vcf_name(uid)))
        if response.status_code == 404:
            raise NotFoundError(f"contact '{uid}' not found")
        self._check(response)
        return vcard.parse_vcard(response.text), response.headers.get("ETag")

    async def create_contact(
        self, addressbook_id: str, data: ContactCreate
    ) -> tuple[ContactOut, str | None]:
        base = await self._addressbook_url(addressbook_id)
        uid = data.uid or new_uid()
        url = urljoin(base, self._vcf_name(uid))
        response = await self._client.put(
            url,
            content=vcard.build_vcard(data, uid),
            headers={
                "Content-Type": "text/vcard; charset=utf-8",
                "If-None-Match": "*",
            },
        )
        if response.status_code == 412:
            raise ConflictError(f"contact '{uid}' already exists")
        self._check(response)
        return await self.get_contact(addressbook_id, uid)

    async def update_contact(
        self,
        addressbook_id: str,
        uid: str,
        data: ContactBase,
        if_match: str | None = None,
    ) -> tuple[ContactOut, str | None]:
        base = await self._addressbook_url(addressbook_id)
        await self.get_contact(addressbook_id, uid)  # 404 if absent
        url = urljoin(base, self._vcf_name(uid))
        headers = {"Content-Type": "text/vcard; charset=utf-8"}
        if if_match:
            headers["If-Match"] = if_match
        response = await self._client.put(
            url, content=vcard.build_vcard(data, uid), headers=headers
        )
        if response.status_code == 412:
            raise PreconditionFailedError("contact was modified by someone else")
        self._check(response)
        return await self.get_contact(addressbook_id, uid)

    async def delete_contact(
        self, addressbook_id: str, uid: str, if_match: str | None = None
    ) -> None:
        base = await self._addressbook_url(addressbook_id)
        url = urljoin(base, self._vcf_name(uid))
        headers = {"If-Match": if_match} if if_match else None
        response = await self._client.request("DELETE", url, headers=headers)
        if response.status_code == 404:
            raise NotFoundError(f"contact '{uid}' not found")
        if response.status_code == 412:
            raise PreconditionFailedError("contact was modified by someone else")
        self._check(response)

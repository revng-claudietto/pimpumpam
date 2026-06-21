"""Contact (vCard) endpoints.

Reads return an ``ETag`` header; ``PUT``/``DELETE`` honour ``If-Match`` for
optimistic concurrency (a mismatch yields ``412``).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, Response, status

from ..carddav_client import CardDavSession
from ..deps import carddav_session
from ..models import ContactBase, ContactCreate, ContactOut

router = APIRouter(
    prefix="/accounts/{account_id}/addressbooks/{addressbook_id}/contacts",
    tags=["contacts"],
)


@router.get("", response_model=list[ContactOut])
async def list_contacts(
    addressbook_id: str, session: CardDavSession = Depends(carddav_session)
) -> list[ContactOut]:
    return await session.list_contacts(addressbook_id)


@router.post("", response_model=ContactOut, status_code=status.HTTP_201_CREATED)
async def create_contact(
    addressbook_id: str,
    payload: ContactCreate,
    response: Response,
    session: CardDavSession = Depends(carddav_session),
) -> ContactOut:
    contact, etag = await session.create_contact(addressbook_id, payload)
    if etag:
        response.headers["ETag"] = etag
    return contact


@router.get("/{uid}", response_model=ContactOut)
async def get_contact(
    addressbook_id: str,
    uid: str,
    response: Response,
    session: CardDavSession = Depends(carddav_session),
) -> ContactOut:
    contact, etag = await session.get_contact(addressbook_id, uid)
    if etag:
        response.headers["ETag"] = etag
    return contact


@router.put("/{uid}", response_model=ContactOut)
async def update_contact(
    addressbook_id: str,
    uid: str,
    payload: ContactBase,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    session: CardDavSession = Depends(carddav_session),
) -> ContactOut:
    contact, etag = await session.update_contact(
        addressbook_id, uid, payload, if_match
    )
    if etag:
        response.headers["ETag"] = etag
    return contact


@router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contact(
    addressbook_id: str,
    uid: str,
    if_match: str | None = Header(default=None, alias="If-Match"),
    session: CardDavSession = Depends(carddav_session),
) -> None:
    await session.delete_contact(addressbook_id, uid, if_match)

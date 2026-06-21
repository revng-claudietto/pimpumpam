"""Async CalDAV operations, built on caldav's ``AsyncDAVClient``.

Calendars are addressed by ``id`` — the last path segment of their collection
URL — which is resolved against the principal's calendar list (cached per
session).
"""

from __future__ import annotations

import asyncio
import datetime as dt
from types import TracebackType
from typing import Any
from urllib.parse import unquote
from xml.sax.saxutils import escape as xml_escape

from caldav.async_davclient import AsyncDAVClient
from caldav.lib import error as dav_error
from lxml import etree

APPLE_NS = "http://apple.com/ns/ical/"


def _normalize_color(color: str) -> str:
    """Apple calendar-color expects #RRGGBBAA; pad a 6-digit hex with alpha."""
    if len(color) == 7 and color.startswith("#"):
        return color + "FF"
    return color

from . import ical, stats
from .errors import (
    AuthError,
    NotFoundError,
    PreconditionFailedError,
    UpstreamError,
)
from .models import (
    CalendarOut,
    EventBase,
    EventCreate,
    Occurrence,
    TodoBase,
    TodoCreate,
    TodoOut,
)
from .store import Account


def _calendar_id(url: object) -> str:
    return unquote(str(url).rstrip("/").rsplit("/", 1)[-1])


class CalDavSession:
    """A short-lived CalDAV connection bound to one account."""

    def __init__(self, account: Account, timeout: int) -> None:
        self._client = AsyncDAVClient(
            url=account.server,
            username=account.username,
            password=account.password,
            timeout=timeout,
            require_tls=account.server.lower().startswith("https"),
        )
        # Time every upstream request (caldav: request(url, method, ...)).
        stats.register()
        self._client.request = stats.instrument(self._client.request, "caldav", 1)
        self._principal: Any = None
        self._cal_cache: dict[str, Any] = {}

    async def __aenter__(self) -> CalDavSession:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        await self.close()

    async def close(self) -> None:
        await self._client.close()

    # -- helpers ------------------------------------------------------------- #
    @staticmethod
    async def _guard(awaitable: Any) -> Any:
        """Run a caldav-library coroutine, mapping its errors to AppError.

        Central choke point so every CalDAV operation reports a clean status
        (502/401/404) instead of leaking a raw DAVError as a 500.
        """
        try:
            return await awaitable
        except dav_error.AuthorizationError as exc:
            raise AuthError("upstream rejected credentials") from exc
        except dav_error.NotFoundError as exc:
            raise NotFoundError("resource not found") from exc
        except dav_error.DAVError as exc:
            raise UpstreamError(f"upstream error: {exc}") from exc

    async def _get_principal(self) -> Any:
        if self._principal is None:
            self._principal = await self._guard(self._client.principal())
        return self._principal

    async def _calendar(self, calendar_id: str) -> Any:
        if calendar_id in self._cal_cache:
            return self._cal_cache[calendar_id]
        principal = await self._get_principal()
        for cal in await self._guard(principal.calendars()):
            if _calendar_id(cal.url) == calendar_id:
                self._cal_cache[calendar_id] = cal
                return cal
        raise NotFoundError(f"calendar '{calendar_id}' not found")

    async def _proppatch(self, url: object, props_xml: str) -> None:
        body = (
            f'<d:propertyupdate xmlns:d="DAV:" xmlns:c="{APPLE_NS}">'
            f"<d:set><d:prop>{props_xml}</d:prop></d:set></d:propertyupdate>"
        )
        response = await self._client.request(
            str(url),
            method="PROPPATCH",
            body=body,
            headers={"Content-Type": "application/xml; charset=utf-8"},
        )
        if response.status >= 400:
            raise UpstreamError(f"PROPPATCH failed: {response.status}")

    async def _calendar_color(self, url: object) -> str | None:
        body = (
            f'<d:propfind xmlns:d="DAV:" xmlns:c="{APPLE_NS}">'
            "<d:prop><c:calendar-color/></d:prop></d:propfind>"
        )
        response = await self._client.request(
            str(url),
            method="PROPFIND",
            body=body,
            headers={"Content-Type": "application/xml; charset=utf-8", "Depth": "0"},
        )
        if response.status >= 400:
            return None
        raw = response.raw
        data = raw if isinstance(raw, bytes) else str(raw).encode("utf-8")
        try:
            tree = etree.fromstring(data)
        except etree.XMLSyntaxError:
            return None
        element = tree.find(f".//{{{APPLE_NS}}}calendar-color")
        if element is None or not (element.text or "").strip():
            return None
        return element.text.strip()

    async def _calendar_out(self, cal: Any) -> CalendarOut:
        # The three properties are independent reads — fetch them concurrently.
        async def display_name() -> str | None:
            try:
                return await cal.get_display_name()
            except dav_error.DAVError:
                return None

        async def components() -> list[str]:
            try:
                return list(await cal.get_supported_components() or [])
            except dav_error.DAVError:
                return []

        name, comps, color = await asyncio.gather(
            display_name(), components(), self._calendar_color(cal.url)
        )
        return CalendarOut(
            id=_calendar_id(cal.url),
            display_name=name or None,
            color=color,
            components=comps,
            url=str(cal.url),
        )

    # -- calendars ----------------------------------------------------------- #
    async def list_calendars(self) -> list[CalendarOut]:
        principal = await self._get_principal()
        cals = await self._guard(principal.calendars())
        return list(await asyncio.gather(*(self._calendar_out(c) for c in cals)))

    async def create_calendar(
        self, display_name: str, components: list[str], color: str | None = None
    ) -> CalendarOut:
        principal = await self._get_principal()
        kwargs: dict[str, Any] = {"name": display_name}
        if components:
            kwargs["supported_calendar_component_set"] = components
        cal = await self._guard(principal.make_calendar(**kwargs))
        if color:
            await self._proppatch(
                cal.url, f"<c:calendar-color>{_normalize_color(color)}</c:calendar-color>"
            )
        self._cal_cache.clear()
        return await self._calendar_out(cal)

    async def update_calendar(
        self,
        calendar_id: str,
        display_name: str | None = None,
        color: str | None = None,
    ) -> CalendarOut:
        cal = await self._calendar(calendar_id)
        props = ""
        if color is not None:
            props += f"<c:calendar-color>{_normalize_color(color)}</c:calendar-color>"
        if display_name is not None:
            props += f"<d:displayname>{xml_escape(display_name)}</d:displayname>"
        if props:
            await self._proppatch(cal.url, props)
        self._cal_cache.pop(calendar_id, None)
        return await self._calendar_out(await self._calendar(calendar_id))

    async def delete_calendar(self, calendar_id: str) -> None:
        cal = await self._calendar(calendar_id)
        await self._guard(cal.delete())
        self._cal_cache.pop(calendar_id, None)

    # -- events -------------------------------------------------------------- #
    async def list_occurrences(
        self, calendar_id: str, start: dt.datetime, end: dt.datetime
    ) -> list[Occurrence]:
        cal = await self._calendar(calendar_id)
        events = await self._guard(cal.search(start=start, end=end, event=True))
        occurrences: list[Occurrence] = []
        for event in events:
            occurrences.extend(
                ical.expand_occurrences(event.icalendar_instance, start, end)
            )
        occurrences.sort(key=lambda o: (o.start is None, o.start))
        return occurrences

    async def list_events(self, calendar_id: str) -> list[EventBase]:
        """All master events (un-expanded) in a calendar, for the events list."""
        cal = await self._calendar(calendar_id)
        events = await self._guard(cal.events())
        out: list[EventBase] = []
        for event in events:
            try:
                out.append(ical.event_from_calendar(event.icalendar_instance))
            except UpstreamError:
                continue
        return out

    async def _event_by_uid(self, cal: Any, uid: str) -> Any:
        try:
            return await cal.event_by_uid(uid)
        except dav_error.NotFoundError as exc:
            raise NotFoundError(f"event '{uid}' not found") from exc
        except dav_error.DAVError as exc:
            raise UpstreamError(f"upstream error: {exc}") from exc

    async def _resource_etag(self, url: object) -> str | None:
        # HEAD: we only need the ETag header, not the body.
        response = await self._client.request(str(url), method="HEAD")
        return response.headers.get("ETag")

    async def _conditional_put(
        self, url: object, body: str, if_match: str | None
    ) -> str | None:
        headers = {"Content-Type": "text/calendar; charset=utf-8"}
        if if_match:
            headers["If-Match"] = if_match
        response = await self._client.request(
            str(url), method="PUT", body=body, headers=headers
        )
        if response.status == 412:
            raise PreconditionFailedError("event was modified by someone else")
        if response.status >= 400:
            raise UpstreamError(f"upstream returned {response.status}")
        return response.headers.get("ETag")

    async def _conditional_delete(self, url: object, if_match: str | None) -> None:
        headers = {"If-Match": if_match} if if_match else {}
        response = await self._client.request(
            str(url), method="DELETE", headers=headers
        )
        if response.status == 412:
            raise PreconditionFailedError("event was modified by someone else")
        if response.status >= 400 and response.status != 404:
            raise UpstreamError(f"upstream returned {response.status}")

    async def get_event(
        self, calendar_id: str, uid: str
    ) -> tuple[EventBase, str | None]:
        cal = await self._calendar(calendar_id)
        event = await self._event_by_uid(cal, uid)
        out = ical.event_from_calendar(event.icalendar_instance)
        return out, await self._resource_etag(event.url)

    async def create_event(
        self, calendar_id: str, data: EventCreate
    ) -> tuple[EventBase, str | None]:
        cal = await self._calendar(calendar_id)
        uid = data.uid or ical.new_uid()
        await self._guard(cal.save_event(ical.build_event_ical(data, uid)))
        return await self.get_event(calendar_id, uid)

    async def update_event(
        self, calendar_id: str, uid: str, data: EventBase, if_match: str | None = None
    ) -> tuple[EventBase, str | None]:
        cal = await self._calendar(calendar_id)
        event = await self._event_by_uid(cal, uid)
        body = ical.build_event_ical(data, uid)
        etag = await self._conditional_put(event.url, body, if_match)
        if etag is None:  # some servers omit ETag on PUT
            etag = await self._resource_etag(event.url)
        return ical.parse_event(body), etag

    async def delete_event(
        self, calendar_id: str, uid: str, if_match: str | None = None
    ) -> None:
        cal = await self._calendar(calendar_id)
        event = await self._event_by_uid(cal, uid)
        await self._conditional_delete(event.url, if_match)

    # -- single-instance edits of a recurring series ------------------------- #
    async def cancel_occurrence(
        self,
        calendar_id: str,
        uid: str,
        recurrence_id: dt.datetime,
        if_match: str | None = None,
    ) -> None:
        cal = await self._calendar(calendar_id)
        event = await self._event_by_uid(cal, uid)
        calendar = event.icalendar_instance
        ical.add_exdate(calendar, recurrence_id)
        await self._conditional_put(
            event.url, calendar.to_ical().decode("utf-8"), if_match
        )

    async def override_occurrence(
        self,
        calendar_id: str,
        uid: str,
        recurrence_id: dt.datetime,
        data: EventBase,
        if_match: str | None = None,
    ) -> tuple[Occurrence, str | None]:
        cal = await self._calendar(calendar_id)
        event = await self._event_by_uid(cal, uid)
        calendar = event.icalendar_instance
        ical.set_override(calendar, recurrence_id, data, uid)
        etag = await self._conditional_put(
            event.url, calendar.to_ical().decode("utf-8"), if_match
        )
        if etag is None:  # some servers omit ETag on PUT
            etag = await self._resource_etag(event.url)
        return ical.override_view(recurrence_id, data, uid), etag

    # -- todos --------------------------------------------------------------- #
    async def list_todos(
        self, calendar_id: str, include_completed: bool
    ) -> list[TodoOut]:
        cal = await self._calendar(calendar_id)
        todos = await self._guard(cal.todos(include_completed=include_completed))
        return [ical.todo_from_calendar(t.icalendar_instance) for t in todos]

    async def _todo_by_uid(self, cal: Any, uid: str) -> Any:
        try:
            return await cal.todo_by_uid(uid)
        except dav_error.NotFoundError as exc:
            raise NotFoundError(f"todo '{uid}' not found") from exc
        except dav_error.DAVError as exc:
            raise UpstreamError(f"upstream error: {exc}") from exc

    async def get_todo(self, calendar_id: str, uid: str) -> TodoOut:
        cal = await self._calendar(calendar_id)
        todo = await self._todo_by_uid(cal, uid)
        return ical.todo_from_calendar(todo.icalendar_instance)

    async def create_todo(self, calendar_id: str, data: TodoCreate) -> TodoOut:
        cal = await self._calendar(calendar_id)
        uid = data.uid or ical.new_uid()
        await self._guard(cal.save_todo(ical.build_todo_ical(data, uid)))
        return await self.get_todo(calendar_id, uid)

    async def update_todo(self, calendar_id: str, uid: str, data: TodoBase) -> TodoOut:
        cal = await self._calendar(calendar_id)
        todo = await self._todo_by_uid(cal, uid)
        todo.data = ical.build_todo_ical(data, uid)
        await self._guard(todo.save())
        return await self.get_todo(calendar_id, uid)

    async def delete_todo(self, calendar_id: str, uid: str) -> None:
        cal = await self._calendar(calendar_id)
        todo = await self._todo_by_uid(cal, uid)
        await self._guard(todo.delete())

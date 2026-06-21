"""Event endpoints.

The collection ``GET`` returns concrete occurrences expanded over a date range;
the per-UID resource exposes the underlying object (including its ``rrule``) so a
recurring series can be created and edited. A single instance of a series can be
modified or cancelled through the ``occurrences`` sub-resource.

Single-object writes support optimistic concurrency: reads return an ``ETag``
header, and ``PUT``/``DELETE`` honour ``If-Match`` (a mismatch yields ``412``).
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status

from ..caldav_client import CalDavSession
from ..deps import caldav_session
from ..models import EventBase, EventCreate, EventOut, Occurrence

router = APIRouter(
    prefix="/accounts/{account_id}/calendars/{calendar_id}/events",
    tags=["events"],
)


def _parse_recurrence_id(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=422, detail=f"invalid recurrence_id: {value!r}"
        ) from exc


@router.get("", response_model=list[Occurrence])
async def list_occurrences(
    calendar_id: str,
    start: datetime = Query(..., description="Range start (inclusive, ISO 8601)"),
    end: datetime = Query(..., description="Range end (exclusive, ISO 8601)"),
    session: CalDavSession = Depends(caldav_session),
) -> list[Occurrence]:
    return await session.list_occurrences(calendar_id, start, end)


@router.post("", response_model=EventOut, status_code=status.HTTP_201_CREATED)
async def create_event(
    calendar_id: str,
    payload: EventCreate,
    response: Response,
    session: CalDavSession = Depends(caldav_session),
) -> EventBase:
    event, etag = await session.create_event(calendar_id, payload)
    if etag:
        response.headers["ETag"] = etag
    return event


@router.get("/all", response_model=list[EventOut])
async def list_all_events(
    calendar_id: str, session: CalDavSession = Depends(caldav_session)
) -> list[EventBase]:
    # All master events (un-expanded) — for the searchable Events list.
    return await session.list_events(calendar_id)


@router.get("/{uid}", response_model=EventOut)
async def get_event(
    calendar_id: str,
    uid: str,
    response: Response,
    session: CalDavSession = Depends(caldav_session),
) -> EventBase:
    event, etag = await session.get_event(calendar_id, uid)
    if etag:
        response.headers["ETag"] = etag
    return event


@router.put("/{uid}", response_model=EventOut)
async def update_event(
    calendar_id: str,
    uid: str,
    payload: EventBase,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    session: CalDavSession = Depends(caldav_session),
) -> EventBase:
    event, etag = await session.update_event(calendar_id, uid, payload, if_match)
    if etag:
        response.headers["ETag"] = etag
    return event


@router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    calendar_id: str,
    uid: str,
    if_match: str | None = Header(default=None, alias="If-Match"),
    session: CalDavSession = Depends(caldav_session),
) -> None:
    await session.delete_event(calendar_id, uid, if_match)


@router.put("/{uid}/occurrences/{recurrence_id}", response_model=Occurrence)
async def override_occurrence(
    calendar_id: str,
    uid: str,
    recurrence_id: str,
    payload: EventBase,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    session: CalDavSession = Depends(caldav_session),
) -> Occurrence:
    rid = _parse_recurrence_id(recurrence_id)
    occurrence, etag = await session.override_occurrence(
        calendar_id, uid, rid, payload, if_match
    )
    if etag:
        response.headers["ETag"] = etag
    return occurrence


@router.delete(
    "/{uid}/occurrences/{recurrence_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def cancel_occurrence(
    calendar_id: str,
    uid: str,
    recurrence_id: str,
    if_match: str | None = Header(default=None, alias="If-Match"),
    session: CalDavSession = Depends(caldav_session),
) -> None:
    rid = _parse_recurrence_id(recurrence_id)
    await session.cancel_occurrence(calendar_id, uid, rid, if_match)

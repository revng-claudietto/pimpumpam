"""Calendar collection endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, status

from ..caldav_client import CalDavSession
from ..deps import caldav_session
from ..models import CalendarCreate, CalendarOut, CalendarUpdate

router = APIRouter(prefix="/accounts/{account_id}/calendars", tags=["calendars"])


@router.get("", response_model=list[CalendarOut])
async def list_calendars(
    session: CalDavSession = Depends(caldav_session),
) -> list[CalendarOut]:
    return await session.list_calendars()


@router.post("", response_model=CalendarOut, status_code=status.HTTP_201_CREATED)
async def create_calendar(
    payload: CalendarCreate, session: CalDavSession = Depends(caldav_session)
) -> CalendarOut:
    return await session.create_calendar(
        payload.display_name, payload.components, payload.color
    )


@router.patch("/{calendar_id}", response_model=CalendarOut)
async def update_calendar(
    calendar_id: str,
    payload: CalendarUpdate,
    session: CalDavSession = Depends(caldav_session),
) -> CalendarOut:
    return await session.update_calendar(
        calendar_id, payload.display_name, payload.color
    )


@router.delete("/{calendar_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_calendar(
    calendar_id: str, session: CalDavSession = Depends(caldav_session)
) -> None:
    await session.delete_calendar(calendar_id)

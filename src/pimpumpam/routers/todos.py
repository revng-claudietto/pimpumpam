"""Todo (VTODO) endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status

from ..caldav_client import CalDavSession
from ..deps import caldav_session
from ..models import TodoBase, TodoCreate, TodoOut

router = APIRouter(
    prefix="/accounts/{account_id}/calendars/{calendar_id}/todos",
    tags=["todos"],
)


@router.get("", response_model=list[TodoOut])
async def list_todos(
    calendar_id: str,
    include_completed: bool = Query(default=False),
    session: CalDavSession = Depends(caldav_session),
) -> list[TodoOut]:
    return await session.list_todos(calendar_id, include_completed)


@router.post("", response_model=TodoOut, status_code=status.HTTP_201_CREATED)
async def create_todo(
    calendar_id: str,
    payload: TodoCreate,
    session: CalDavSession = Depends(caldav_session),
) -> TodoOut:
    return await session.create_todo(calendar_id, payload)


@router.get("/{uid}", response_model=TodoOut)
async def get_todo(
    calendar_id: str, uid: str, session: CalDavSession = Depends(caldav_session)
) -> TodoOut:
    return await session.get_todo(calendar_id, uid)


@router.put("/{uid}", response_model=TodoOut)
async def update_todo(
    calendar_id: str,
    uid: str,
    payload: TodoBase,
    session: CalDavSession = Depends(caldav_session),
) -> TodoOut:
    return await session.update_todo(calendar_id, uid, payload)


@router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_todo(
    calendar_id: str, uid: str, session: CalDavSession = Depends(caldav_session)
) -> None:
    await session.delete_todo(calendar_id, uid)

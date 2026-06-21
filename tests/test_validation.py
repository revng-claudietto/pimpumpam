"""Request-body validation at the API boundary."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_event_requires_summary_and_start(
    client: TestClient, calendar: tuple[str, str]
) -> None:
    account, calendar_id = calendar
    base = f"/accounts/{account}/calendars/{calendar_id}/events"
    assert client.post(base, json={"start": "2026-06-22T09:00:00Z"}).status_code == 422
    assert client.post(base, json={"summary": "No start"}).status_code == 422


def test_todo_priority_bounds(client: TestClient, calendar: tuple[str, str]) -> None:
    account, calendar_id = calendar
    base = f"/accounts/{account}/calendars/{calendar_id}/todos"
    assert client.post(base, json={"summary": "x", "priority": 50}).status_code == 422
    assert (
        client.post(base, json={"summary": "x", "percent_complete": 150}).status_code
        == 422
    )

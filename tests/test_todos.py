"""Todo (VTODO) CRUD."""

from __future__ import annotations

from fastapi.testclient import TestClient


def _todos_url(account: str, calendar_id: str) -> str:
    return f"/accounts/{account}/calendars/{calendar_id}/todos"


def test_create_list_complete_delete_todo(
    client: TestClient, calendar: tuple[str, str]
) -> None:
    account, calendar_id = calendar
    base = _todos_url(account, calendar_id)

    created = client.post(
        base,
        json={
            "summary": "Write tests",
            "due": "2026-06-30T17:00:00Z",
            "priority": 1,
        },
    )
    assert created.status_code == 201, created.text
    uid = created.json()["uid"]
    assert created.json()["priority"] == 1

    listing = client.get(base).json()
    assert any(t["uid"] == uid for t in listing)

    # Mark complete.
    updated = client.put(
        f"{base}/{uid}",
        json={
            "summary": "Write tests",
            "status": "COMPLETED",
            "percent_complete": 100,
            "completed": "2026-06-20T12:00:00Z",
        },
    )
    assert updated.status_code == 200
    assert updated.json()["status"] == "COMPLETED"
    assert updated.json()["percent_complete"] == 100

    # Completed todos are hidden by default, shown when requested.
    assert all(t["uid"] != uid for t in client.get(base).json())
    with_done = client.get(base, params={"include_completed": "true"}).json()
    assert any(t["uid"] == uid for t in with_done)

    assert client.delete(f"{base}/{uid}").status_code == 204


def test_get_unknown_todo_404(client: TestClient, calendar: tuple[str, str]) -> None:
    account, calendar_id = calendar
    assert client.get(f"{_todos_url(account, calendar_id)}/missing").status_code == 404

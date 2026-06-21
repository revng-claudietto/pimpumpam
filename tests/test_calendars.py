"""Calendar collection behaviour."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient


def test_create_list_delete_calendar(client: TestClient, account: str) -> None:
    name = f"cal-{uuid.uuid4().hex[:8]}"
    created = client.post(
        f"/accounts/{account}/calendars",
        json={"display_name": name, "components": ["VEVENT"]},
    )
    assert created.status_code == 201, created.text
    calendar_id = created.json()["id"]

    listing = client.get(f"/accounts/{account}/calendars").json()
    match = next((c for c in listing if c["id"] == calendar_id), None)
    assert match is not None
    assert match["display_name"] == name
    assert "VEVENT" in match["components"]

    assert (
        client.delete(f"/accounts/{account}/calendars/{calendar_id}").status_code
        == 204
    )
    after = client.get(f"/accounts/{account}/calendars").json()
    assert all(c["id"] != calendar_id for c in after)


def test_event_op_on_unknown_calendar_404(client: TestClient, account: str) -> None:
    response = client.get(
        f"/accounts/{account}/calendars/nope/events",
        params={"start": "2026-06-01T00:00:00Z", "end": "2026-07-01T00:00:00Z"},
    )
    assert response.status_code == 404

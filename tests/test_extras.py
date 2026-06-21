"""Calendar color (Apple calendar-color) and event attendees, on both backends."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient


def test_calendar_color_create_patch_read(client: TestClient, account: str) -> None:
    name = f"cal-{uuid.uuid4().hex[:8]}"
    created = client.post(
        f"/accounts/{account}/calendars",
        json={"display_name": name, "components": ["VEVENT"], "color": "#2f6fed"},
    )
    assert created.status_code == 201, created.text
    cid = created.json()["id"]
    assert (created.json()["color"] or "").lower().startswith("#2f6fed")

    listed = client.get(f"/accounts/{account}/calendars").json()
    match = next(c for c in listed if c["id"] == cid)
    assert (match["color"] or "").lower().startswith("#2f6fed")

    patched = client.patch(
        f"/accounts/{account}/calendars/{cid}", json={"color": "#22a565"}
    )
    assert patched.status_code == 200
    assert (patched.json()["color"] or "").lower().startswith("#22a565")


def test_event_attendees_roundtrip(
    client: TestClient, calendar: tuple[str, str]
) -> None:
    account, calendar_id = calendar
    base = f"/accounts/{account}/calendars/{calendar_id}/events"
    created = client.post(
        base,
        json={
            "summary": "Planning",
            "start": "2026-06-22T09:00:00Z",
            "end": "2026-06-22T10:00:00Z",
            "attendees": [
                {"email": "ana@example.com", "name": "Ana Vidal", "status": "accepted"},
                {
                    "email": "sam@example.com",
                    "name": "Sam Okonkwo",
                    "status": "tentative",
                    "role": "opt-participant",
                },
            ],
        },
    )
    assert created.status_code == 201, created.text
    uid = created.json()["uid"]

    got = client.get(f"{base}/{uid}").json()
    attendees = {a["email"]: a for a in got["attendees"]}
    assert set(attendees) == {"ana@example.com", "sam@example.com"}
    assert attendees["ana@example.com"]["name"] == "Ana Vidal"
    assert attendees["ana@example.com"]["status"] == "ACCEPTED"
    assert attendees["sam@example.com"]["role"] == "OPT-PARTICIPANT"


def test_event_alarms_roundtrip(client: TestClient, calendar: tuple[str, str]) -> None:
    account, calendar_id = calendar
    base = f"/accounts/{account}/calendars/{calendar_id}/events"
    created = client.post(
        base,
        json={
            "summary": "Reminder me",
            "start": "2026-06-22T09:00:00Z",
            "end": "2026-06-22T09:30:00Z",
            "alarms": [{"trigger": "-PT15M", "description": "Heads up"}],
        },
    )
    assert created.status_code == 201, created.text
    uid = created.json()["uid"]

    got = client.get(f"{base}/{uid}").json()
    assert len(got["alarms"]) == 1
    assert got["alarms"][0]["trigger"] == "-PT15M"
    assert got["alarms"][0]["action"] == "DISPLAY"

    # And the alarm rides along on expanded occurrences (for notifications).
    occ = client.get(
        base, params={"start": "2026-06-01T00:00:00Z", "end": "2026-07-01T00:00:00Z"}
    ).json()
    mine = next(o for o in occ if o["summary"] == "Reminder me")
    assert mine["alarms"][0]["trigger"] == "-PT15M"

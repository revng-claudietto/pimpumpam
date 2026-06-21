"""Single-event CRUD and range listing."""

from __future__ import annotations

from fastapi.testclient import TestClient


def _events_url(account: str, calendar_id: str) -> str:
    return f"/accounts/{account}/calendars/{calendar_id}/events"


def test_create_get_update_delete_event(
    client: TestClient, calendar: tuple[str, str]
) -> None:
    account, calendar_id = calendar
    base = _events_url(account, calendar_id)

    created = client.post(
        base,
        json={
            "summary": "Standup",
            "start": "2026-06-22T09:00:00Z",
            "end": "2026-06-22T09:15:00Z",
            "location": "Room 1",
        },
    )
    assert created.status_code == 201, created.text
    uid = created.json()["uid"]
    assert created.json()["summary"] == "Standup"

    fetched = client.get(f"{base}/{uid}")
    assert fetched.status_code == 200
    assert fetched.json()["location"] == "Room 1"

    updated = client.put(
        f"{base}/{uid}",
        json={
            "summary": "Standup (moved)",
            "start": "2026-06-22T10:00:00Z",
            "end": "2026-06-22T10:15:00Z",
        },
    )
    assert updated.status_code == 200
    assert updated.json()["summary"] == "Standup (moved)"
    assert updated.json()["start"].startswith("2026-06-22T10:00")

    assert client.delete(f"{base}/{uid}").status_code == 204
    assert client.get(f"{base}/{uid}").status_code == 404


def test_get_unknown_event_404(client: TestClient, calendar: tuple[str, str]) -> None:
    account, calendar_id = calendar
    assert client.get(f"{_events_url(account, calendar_id)}/missing").status_code == 404


def test_range_listing_returns_occurrences(
    client: TestClient, calendar: tuple[str, str]
) -> None:
    account, calendar_id = calendar
    base = _events_url(account, calendar_id)
    client.post(
        base,
        json={
            "summary": "One-off",
            "start": "2026-06-25T14:00:00Z",
            "end": "2026-06-25T15:00:00Z",
        },
    )
    listing = client.get(
        base,
        params={"start": "2026-06-01T00:00:00Z", "end": "2026-07-01T00:00:00Z"},
    )
    assert listing.status_code == 200
    summaries = [o["summary"] for o in listing.json()]
    assert "One-off" in summaries
    # A non-recurring event has no recurrence id.
    one_off = next(o for o in listing.json() if o["summary"] == "One-off")
    assert one_off["recurrence_id"] is None


def test_all_day_event(client: TestClient, calendar: tuple[str, str]) -> None:
    account, calendar_id = calendar
    base = _events_url(account, calendar_id)
    created = client.post(
        base,
        json={
            "summary": "Holiday",
            "start": "2026-12-25T00:00:00Z",
            "all_day": True,
        },
    )
    assert created.status_code == 201
    assert created.json()["all_day"] is True

    listing = client.get(
        base,
        params={"start": "2026-12-01T00:00:00Z", "end": "2027-01-01T00:00:00Z"},
    ).json()
    holiday = next(o for o in listing if o["summary"] == "Holiday")
    assert holiday["all_day"] is True


def test_range_query_requires_bounds(
    client: TestClient, calendar: tuple[str, str]
) -> None:
    account, calendar_id = calendar
    assert client.get(_events_url(account, calendar_id)).status_code == 422


def test_list_all_events_returns_unexpanded_masters(
    client: TestClient, calendar: tuple[str, str]
) -> None:
    account, calendar_id = calendar
    base = _events_url(account, calendar_id)
    client.post(
        base,
        json={
            "summary": "Weekly",
            "start": "2026-06-01T09:00:00Z",
            "end": "2026-06-01T09:30:00Z",
            "rrule": "FREQ=WEEKLY;BYDAY=MO",
        },
    )
    client.post(
        base,
        json={"summary": "One-off", "start": "2026-06-25T14:00:00Z"},
    )
    # The events list is un-expanded: one row per event, with the rrule intact.
    events = client.get(f"{base}/all").json()
    by_summary = {e["summary"]: e for e in events}
    assert set(by_summary) == {"Weekly", "One-off"}
    assert by_summary["Weekly"]["rrule"] == "FREQ=WEEKLY;BYDAY=MO"

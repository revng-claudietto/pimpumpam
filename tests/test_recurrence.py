"""Recurring events: server-side expansion + RRULE round-trip for edits."""

from __future__ import annotations

from fastapi.testclient import TestClient


def _events_url(account: str, calendar_id: str) -> str:
    return f"/accounts/{account}/calendars/{calendar_id}/events"


def test_weekly_recurrence_expands_to_occurrences(
    client: TestClient, calendar: tuple[str, str]
) -> None:
    account, calendar_id = calendar
    base = _events_url(account, calendar_id)

    created = client.post(
        base,
        json={
            "summary": "Weekly sync",
            "start": "2026-06-01T09:00:00Z",  # a Monday
            "end": "2026-06-01T09:30:00Z",
            "rrule": "FREQ=WEEKLY;BYDAY=MO",
        },
    )
    assert created.status_code == 201, created.text
    uid = created.json()["uid"]

    # The single-object resource exposes the RRULE (needed to edit the series).
    assert created.json()["rrule"] == "FREQ=WEEKLY;BYDAY=MO"
    assert client.get(f"{base}/{uid}").json()["rrule"] == "FREQ=WEEKLY;BYDAY=MO"

    # June 2026 has Mondays on the 1st, 8th, 15th, 22nd, 29th -> 5 occurrences.
    occurrences = client.get(
        base,
        params={"start": "2026-06-01T00:00:00Z", "end": "2026-07-01T00:00:00Z"},
    ).json()
    sync = [o for o in occurrences if o["summary"] == "Weekly sync"]
    assert len(sync) == 5
    assert all(o["recurrence_id"] is not None for o in sync)
    starts = sorted(o["start"][:10] for o in sync)
    assert starts == [
        "2026-06-01",
        "2026-06-08",
        "2026-06-15",
        "2026-06-22",
        "2026-06-29",
    ]


def test_range_clips_recurrence(
    client: TestClient, calendar: tuple[str, str]
) -> None:
    account, calendar_id = calendar
    base = _events_url(account, calendar_id)
    client.post(
        base,
        json={
            "summary": "Daily",
            "start": "2026-06-01T08:00:00Z",
            "end": "2026-06-01T08:30:00Z",
            "rrule": "FREQ=DAILY;COUNT=10",
        },
    )
    # Only three days fall inside this window.
    occurrences = client.get(
        base,
        params={"start": "2026-06-03T00:00:00Z", "end": "2026-06-06T00:00:00Z"},
    ).json()
    daily = [o for o in occurrences if o["summary"] == "Daily"]
    assert {o["start"][:10] for o in daily} == {
        "2026-06-03",
        "2026-06-04",
        "2026-06-05",
    }


def test_edit_recurrence_rule(client: TestClient, calendar: tuple[str, str]) -> None:
    account, calendar_id = calendar
    base = _events_url(account, calendar_id)
    created = client.post(
        base,
        json={
            "summary": "Changing",
            "start": "2026-06-01T09:00:00Z",
            "end": "2026-06-01T09:30:00Z",
            "rrule": "FREQ=DAILY;COUNT=3",
        },
    )
    uid = created.json()["uid"]
    client.put(
        f"{base}/{uid}",
        json={
            "summary": "Changing",
            "start": "2026-06-01T09:00:00Z",
            "end": "2026-06-01T09:30:00Z",
            "rrule": "FREQ=WEEKLY;COUNT=3",
        },
    )
    assert client.get(f"{base}/{uid}").json()["rrule"] == "FREQ=WEEKLY;COUNT=3"

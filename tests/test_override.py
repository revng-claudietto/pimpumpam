"""Recurrence overrides: cancel one instance (EXDATE) and modify one
instance (RECURRENCE-ID), on both DAV backends."""

from __future__ import annotations

from urllib.parse import quote

from fastapi.testclient import TestClient

# A weekly Monday series across June 2026 (Mondays: 1, 8, 15, 22, 29).
_SERIES = {
    "summary": "Weekly sync",
    "start": "2026-06-01T09:00:00Z",
    "end": "2026-06-01T09:30:00Z",
    "rrule": "FREQ=WEEKLY;BYDAY=MO",
}
_JUNE = {"start": "2026-06-01T00:00:00Z", "end": "2026-07-01T00:00:00Z"}


def _events_url(account: str, calendar_id: str) -> str:
    return f"/accounts/{account}/calendars/{calendar_id}/events"


def _starts(client: TestClient, base: str) -> list[str]:
    occ = client.get(base, params=_JUNE).json()
    return sorted(o["start"][:10] for o in occ if o["summary"] or True)


def test_cancel_single_occurrence(
    client: TestClient, calendar: tuple[str, str]
) -> None:
    account, calendar_id = calendar
    base = _events_url(account, calendar_id)
    uid = client.post(base, json=_SERIES).json()["uid"]

    assert _starts(client, base) == [
        "2026-06-01",
        "2026-06-08",
        "2026-06-15",
        "2026-06-22",
        "2026-06-29",
    ]

    rid = quote("2026-06-15T09:00:00+00:00", safe="")
    cancelled = client.delete(f"{base}/{uid}/occurrences/{rid}")
    assert cancelled.status_code == 204

    # The 15th is gone; the rest remain.
    assert _starts(client, base) == [
        "2026-06-01",
        "2026-06-08",
        "2026-06-22",
        "2026-06-29",
    ]


def test_override_single_occurrence(
    client: TestClient, calendar: tuple[str, str]
) -> None:
    account, calendar_id = calendar
    base = _events_url(account, calendar_id)
    uid = client.post(base, json=_SERIES).json()["uid"]

    # Move just the 15th to 14:00 and rename it.
    rid = quote("2026-06-15T09:00:00+00:00", safe="")
    response = client.put(
        f"{base}/{uid}/occurrences/{rid}",
        json={
            "summary": "Moved sync",
            "start": "2026-06-15T14:00:00Z",
            "end": "2026-06-15T15:00:00Z",
        },
    )
    assert response.status_code == 200
    assert response.json()["summary"] == "Moved sync"

    occurrences = client.get(base, params=_JUNE).json()
    by_date = {o["start"][:10]: o for o in occurrences}
    # The whole series is still present (count unchanged)...
    assert len(occurrences) == 5
    # ...but the 15th is now the overridden instance.
    moved = by_date["2026-06-15"]
    assert moved["summary"] == "Moved sync"
    assert moved["start"].startswith("2026-06-15T14:00")
    # Other instances keep the original summary.
    assert by_date["2026-06-08"]["summary"] == "Weekly sync"

"""Data-fidelity edge cases on the normalized round-trip."""

from __future__ import annotations

from datetime import datetime

from fastapi.testclient import TestClient


def _events_url(account: str, calendar_id: str) -> str:
    return f"/accounts/{account}/calendars/{calendar_id}/events"


def test_non_utc_timezone_preserves_instant(
    client: TestClient, calendar: tuple[str, str]
) -> None:
    account, calendar_id = calendar
    base = _events_url(account, calendar_id)
    created = client.post(
        base,
        json={
            "summary": "Berlin call",
            "start": "2026-06-22T09:00:00+02:00",  # == 07:00:00Z
            "end": "2026-06-22T10:00:00+02:00",
        },
    )
    assert created.status_code == 201
    got = client.get(f"{base}/{created.json()['uid']}").json()
    # Representation may normalize to UTC; the instant must be identical.
    assert datetime.fromisoformat(got["start"]) == datetime.fromisoformat(
        "2026-06-22T09:00:00+02:00"
    )


def test_update_drops_omitted_optional_field(
    client: TestClient, calendar: tuple[str, str]
) -> None:
    account, calendar_id = calendar
    base = _events_url(account, calendar_id)
    uid = client.post(
        base,
        json={
            "summary": "With location",
            "start": "2026-06-22T09:00:00Z",
            "end": "2026-06-22T09:30:00Z",
            "location": "Room 1",
        },
    ).json()["uid"]
    assert client.get(f"{base}/{uid}").json()["location"] == "Room 1"

    # PUT replaces the resource; omitting location clears it.
    client.put(
        f"{base}/{uid}",
        json={
            "summary": "With location",
            "start": "2026-06-22T09:00:00Z",
            "end": "2026-06-22T09:30:00Z",
        },
    )
    assert client.get(f"{base}/{uid}").json()["location"] is None


def test_explicit_uid_is_honored(
    client: TestClient, calendar: tuple[str, str]
) -> None:
    account, calendar_id = calendar
    base = _events_url(account, calendar_id)
    created = client.post(
        base,
        json={
            "uid": "my-custom-uid",
            "summary": "Pinned",
            "start": "2026-06-22T09:00:00Z",
            "end": "2026-06-22T09:30:00Z",
        },
    )
    assert created.json()["uid"] == "my-custom-uid"
    assert client.get(f"{base}/my-custom-uid").status_code == 200


def test_contact_full_field_roundtrip(
    client: TestClient, addressbook: tuple[str, str]
) -> None:
    account, book_id = addressbook
    base = f"/accounts/{account}/addressbooks/{book_id}/contacts"
    uid = client.post(
        base,
        json={
            "full_name": "Bob Builder",
            "first_name": "Bob",
            "last_name": "Builder",
            "title": "Foreman",
            "note": "Can he fix it?",
            "url": "https://example.com/bob",
        },
    ).json()["uid"]
    got = client.get(f"{base}/{uid}").json()
    assert got["first_name"] == "Bob"
    assert got["last_name"] == "Builder"
    assert got["title"] == "Foreman"
    assert got["note"] == "Can he fix it?"
    assert got["url"] == "https://example.com/bob"
    # The normalized API never exposes the raw vCard payload.
    assert "_raw" not in got and "vcard" not in got

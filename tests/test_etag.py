"""Optimistic concurrency via ETag / If-Match, on both DAV backends."""

from __future__ import annotations

from fastapi.testclient import TestClient

def _event(summary: str) -> dict[str, str]:
    # Distinct content per write: some servers (Xandikos) derive the ETag from a
    # content hash, so a byte-identical re-PUT would legitimately keep the ETag.
    return {
        "summary": summary,
        "start": "2026-06-22T09:00:00Z",
        "end": "2026-06-22T09:30:00Z",
    }


def _events_url(account: str, calendar_id: str) -> str:
    return f"/accounts/{account}/calendars/{calendar_id}/events"


def test_event_etag_round_trip_and_conflict(
    client: TestClient, calendar: tuple[str, str]
) -> None:
    account, calendar_id = calendar
    base = _events_url(account, calendar_id)

    created = client.post(base, json=_event("v0"))
    assert created.status_code == 201
    etag0 = created.headers.get("ETag")
    assert etag0, "create must return an ETag"
    uid = created.json()["uid"]

    # GET exposes the same ETag.
    got = client.get(f"{base}/{uid}")
    assert got.headers.get("ETag") == etag0

    # Correct If-Match succeeds and rotates the ETag (content changes).
    ok = client.put(f"{base}/{uid}", headers={"If-Match": etag0}, json=_event("v1"))
    assert ok.status_code == 200
    etag1 = ok.headers.get("ETag")
    assert etag1 and etag1 != etag0

    # A stale If-Match is rejected.
    stale = client.put(f"{base}/{uid}", headers={"If-Match": etag0}, json=_event("v2"))
    assert stale.status_code == 412

    # Without If-Match it is last-write-wins.
    assert client.put(f"{base}/{uid}", json=_event("v3")).status_code == 200


def test_event_conditional_delete(
    client: TestClient, calendar: tuple[str, str]
) -> None:
    account, calendar_id = calendar
    base = _events_url(account, calendar_id)
    created = client.post(base, json=_event("d0"))
    uid = created.json()["uid"]
    stale_etag = created.headers["ETag"]

    # Mutate (with different content) so the stored ETag changes.
    client.put(f"{base}/{uid}", json=_event("d1"))

    # Deleting with the stale ETag is refused...
    assert (
        client.delete(f"{base}/{uid}", headers={"If-Match": stale_etag}).status_code
        == 412
    )
    # ...but succeeds with the current one.
    current = client.get(f"{base}/{uid}").headers["ETag"]
    assert (
        client.delete(f"{base}/{uid}", headers={"If-Match": current}).status_code == 204
    )


def test_contact_etag_round_trip_and_conflict(
    client: TestClient, addressbook: tuple[str, str]
) -> None:
    account, book_id = addressbook
    base = f"/accounts/{account}/addressbooks/{book_id}/contacts"

    created = client.post(base, json={"full_name": "Eve"})
    assert created.status_code == 201
    etag0 = created.headers.get("ETag")
    assert etag0, "create must return an ETag"
    uid = created.json()["uid"]

    assert client.get(f"{base}/{uid}").headers.get("ETag") == etag0

    ok = client.put(
        f"{base}/{uid}", headers={"If-Match": etag0}, json={"full_name": "Eve 2"}
    )
    assert ok.status_code == 200
    etag1 = ok.headers.get("ETag")
    assert etag1 and etag1 != etag0

    stale = client.put(
        f"{base}/{uid}", headers={"If-Match": etag0}, json={"full_name": "Eve 3"}
    )
    assert stale.status_code == 412

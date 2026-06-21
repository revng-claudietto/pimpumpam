"""Upstream error mapping: conflicts (409) and auth failures (502)."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_duplicate_contact_conflicts(
    client: TestClient, addressbook: tuple[str, str]
) -> None:
    account, book_id = addressbook
    base = f"/accounts/{account}/addressbooks/{book_id}/contacts"
    payload = {"uid": "dup-1", "full_name": "Dup"}
    assert client.post(base, json=payload).status_code == 201
    # Second create with the same UID is rejected (If-None-Match: *).
    assert client.post(base, json=payload).status_code == 409


def test_duplicate_addressbook_conflicts(client: TestClient, account: str) -> None:
    body = {"display_name": "Shared Book"}
    first = client.post(f"/accounts/{account}/addressbooks", json=body)
    assert first.status_code == 201
    # Same display name -> same slug -> MKCOL on an existing collection.
    assert client.post(f"/accounts/{account}/addressbooks", json=body).status_code == 409


def test_bad_upstream_credentials_map_to_502(
    client: TestClient, radicale: dict[str, str]
) -> None:
    bad = client.post(
        "/accounts",
        json={
            "server": radicale["url"],
            "username": radicale["username"],
            "password": "wrong-password",
        },
    ).json()["id"]
    # The account is stored fine; the failure surfaces when we talk upstream.
    response = client.get(f"/accounts/{bad}/calendars")
    assert response.status_code == 502

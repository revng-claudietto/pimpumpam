"""Address book collection behaviour (CardDAV)."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient


def test_create_list_delete_addressbook(client: TestClient, account: str) -> None:
    name = f"ab-{uuid.uuid4().hex[:8]}"
    created = client.post(
        f"/accounts/{account}/addressbooks",
        json={"display_name": name, "description": "friends"},
    )
    assert created.status_code == 201, created.text
    book_id = created.json()["id"]

    listing = client.get(f"/accounts/{account}/addressbooks").json()
    match = next((b for b in listing if b["id"] == book_id), None)
    assert match is not None
    assert match["display_name"] == name

    assert (
        client.delete(f"/accounts/{account}/addressbooks/{book_id}").status_code == 204
    )
    after = client.get(f"/accounts/{account}/addressbooks").json()
    assert all(b["id"] != book_id for b in after)

"""Contact (vCard) CRUD."""

from __future__ import annotations

from fastapi.testclient import TestClient


def _contacts_url(account: str, book_id: str) -> str:
    return f"/accounts/{account}/addressbooks/{book_id}/contacts"


def test_create_get_update_delete_contact(
    client: TestClient, addressbook: tuple[str, str]
) -> None:
    account, book_id = addressbook
    base = _contacts_url(account, book_id)

    created = client.post(
        base,
        json={
            "full_name": "Alice Example",
            "first_name": "Alice",
            "last_name": "Example",
            "organization": "Acme",
            "emails": [{"type": "work", "value": "alice@example.com"}],
            "phones": [{"type": "cell", "value": "+15551234567"}],
            "birthday": "1990-04-01",
        },
    )
    assert created.status_code == 201, created.text
    uid = created.json()["uid"]
    body = created.json()
    assert body["full_name"] == "Alice Example"
    assert body["emails"][0]["value"] == "alice@example.com"

    fetched = client.get(f"{base}/{uid}").json()
    assert fetched["organization"] == "Acme"
    assert fetched["phones"][0]["value"] == "+15551234567"
    assert fetched["birthday"] == "1990-04-01"

    listing = client.get(base).json()
    assert any(c["uid"] == uid for c in listing)

    updated = client.put(
        f"{base}/{uid}",
        json={
            "full_name": "Alice Cooper",
            "emails": [{"type": "home", "value": "alice@home.example"}],
        },
    )
    assert updated.status_code == 200
    assert updated.json()["full_name"] == "Alice Cooper"
    assert updated.json()["emails"][0]["value"] == "alice@home.example"

    assert client.delete(f"{base}/{uid}").status_code == 204
    assert client.get(f"{base}/{uid}").status_code == 404


def test_get_unknown_contact_404(
    client: TestClient, addressbook: tuple[str, str]
) -> None:
    account, book_id = addressbook
    assert client.get(f"{_contacts_url(account, book_id)}/missing").status_code == 404

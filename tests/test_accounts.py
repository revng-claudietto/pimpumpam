"""Account registry behaviour."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_health(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok"}


def test_create_lists_and_hides_password(
    client: TestClient, radicale: dict[str, str]
) -> None:
    response = client.post(
        "/accounts",
        json={
            "server": radicale["url"],
            "username": radicale["username"],
            "password": radicale["password"],
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["id"].startswith("acc_")
    assert body["username"] == radicale["username"]
    # The password must never be echoed back.
    assert "password" not in body

    listing = client.get("/accounts").json()
    assert any(a["id"] == body["id"] for a in listing)

    fetched = client.get(f"/accounts/{body['id']}")
    assert fetched.status_code == 200
    assert "password" not in fetched.json()


def test_get_unknown_account_404(client: TestClient) -> None:
    assert client.get("/accounts/acc_does_not_exist").status_code == 404


def test_delete_account(client: TestClient, account: str) -> None:
    assert client.delete(f"/accounts/{account}").status_code == 204
    assert client.get(f"/accounts/{account}").status_code == 404
    assert client.delete(f"/accounts/{account}").status_code == 404


def test_invalid_server_url_rejected(client: TestClient) -> None:
    response = client.post(
        "/accounts",
        json={"server": "not-a-url", "username": "u", "password": "p"},
    )
    assert response.status_code == 422

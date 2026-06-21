"""Shared test fixtures.

Real DAV servers are launched as subprocesses (pure Python, no Docker). Tests
that use the ``account`` / ``calendar`` / ``addressbook`` fixtures run against
*both* Radicale and Xandikos via the parametrized ``backend`` fixture.
"""

from __future__ import annotations

import http.client
import os
import pathlib
import socket
import subprocess
import sys
import tempfile
import time
import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from pimpumpam.app import create_app
from pimpumpam.config import Settings

RADICALE_USER = "testuser"
RADICALE_PASS = "testpass"


def _free_port() -> int:
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port: int = sock.getsockname()[1]
    sock.close()
    return port


def _wait_until_up(port: int, timeout: float = 20.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            conn = http.client.HTTPConnection("127.0.0.1", port, timeout=1)
            conn.request("GET", "/")
            conn.getresponse()
            conn.close()
            return
        except OSError:
            time.sleep(0.1)
    raise RuntimeError(f"server did not start on port {port}")


@pytest.fixture(scope="session")
def _radicale_server() -> Iterator[dict[str, str]]:
    tmp = tempfile.mkdtemp(prefix="pimpumpam-radicale-")
    port = _free_port()
    users = os.path.join(tmp, "users")
    pathlib.Path(users).write_text(f"{RADICALE_USER}:{RADICALE_PASS}\n")
    config = os.path.join(tmp, "config")
    pathlib.Path(config).write_text(
        f"""
[server]
hosts = 127.0.0.1:{port}
[auth]
type = htpasswd
htpasswd_filename = {users}
htpasswd_encryption = plain
[storage]
filesystem_folder = {os.path.join(tmp, "collections")}
[rights]
type = owner_only
[logging]
level = error
"""
    )
    proc = subprocess.Popen(
        [sys.executable, "-m", "radicale", "--config", config],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        _wait_until_up(port)
        yield {
            "name": "radicale",
            "url": f"http://127.0.0.1:{port}/",
            "username": RADICALE_USER,
            "password": RADICALE_PASS,
        }
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


@pytest.fixture(scope="session")
def _xandikos_server() -> Iterator[dict[str, str]]:
    tmp = tempfile.mkdtemp(prefix="pimpumpam-xandikos-")
    port = _free_port()
    proc = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "xandikos.web",
            "-d",
            tmp,
            "-p",
            str(port),
            "-l",
            "127.0.0.1",
            "--defaults",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        _wait_until_up(port)
        # Xandikos has no auth; credentials are accepted but ignored.
        yield {
            "name": "xandikos",
            "url": f"http://127.0.0.1:{port}/",
            "username": "user",
            "password": "ignored",
        }
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


@pytest.fixture(params=["radicale", "xandikos"])
def backend(request: pytest.FixtureRequest) -> dict[str, str]:
    """A DAV backend; each value parametrizes the test over both servers."""
    return request.getfixturevalue(f"_{request.param}_server")


@pytest.fixture
def radicale(_radicale_server: dict[str, str]) -> dict[str, str]:
    """Radicale specifically (for backend-specific tests, e.g. auth)."""
    return _radicale_server


@pytest.fixture
def client(tmp_path: pathlib.Path) -> Iterator[TestClient]:
    settings = Settings(
        db_path=str(tmp_path / "pimpumpam.db"),
        request_timeout=30,
    )
    with TestClient(create_app(settings)) as test_client:
        yield test_client


@pytest.fixture
def account(client: TestClient, backend: dict[str, str]) -> str:
    response = client.post(
        "/accounts",
        json={
            "server": backend["url"],
            "username": backend["username"],
            "password": backend["password"],
            "display_name": backend["name"],
        },
    )
    assert response.status_code == 201, response.text
    account_id: str = response.json()["id"]
    return account_id


@pytest.fixture
def calendar(client: TestClient, account: str) -> tuple[str, str]:
    name = f"cal-{uuid.uuid4().hex[:8]}"
    response = client.post(
        f"/accounts/{account}/calendars",
        json={"display_name": name, "components": ["VEVENT", "VTODO"]},
    )
    assert response.status_code == 201, response.text
    return account, response.json()["id"]


@pytest.fixture
def addressbook(client: TestClient, account: str) -> tuple[str, str]:
    name = f"ab-{uuid.uuid4().hex[:8]}"
    response = client.post(
        f"/accounts/{account}/addressbooks",
        json={"display_name": name},
    )
    assert response.status_code == 201, response.text
    return account, response.json()["id"]

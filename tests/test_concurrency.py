"""Concurrency: many simultaneous requests are served on the one event loop.

The TestClient runs the ASGI app in a single event loop; firing requests from a
thread pool drives concurrent in-flight requests through it, each opening and
closing its own upstream DAV session on that same loop.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient


def test_concurrent_event_creates(
    client: TestClient, calendar: tuple[str, str]
) -> None:
    account, calendar_id = calendar
    base = f"/accounts/{account}/calendars/{calendar_id}/events"

    def create(i: int) -> int:
        return client.post(
            base,
            json={
                "uid": f"concurrent-{i}",
                "summary": f"Event {i}",
                "start": "2026-06-22T09:00:00Z",
                "end": "2026-06-22T09:30:00Z",
            },
        ).status_code

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(create, range(8)))

    assert results == [201] * 8

    listed = client.get(
        base,
        params={"start": "2026-06-01T00:00:00Z", "end": "2026-07-01T00:00:00Z"},
    ).json()
    uids = {o["uid"] for o in listed}
    assert {f"concurrent-{i}" for i in range(8)} <= uids

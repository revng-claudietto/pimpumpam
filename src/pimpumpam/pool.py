"""Per-account session pool.

caldav's first request on a fresh client pays a ~1s penalty (DAV discovery via
``principal()`` over its HTTP/3-probing backend). Creating a session per request
therefore paid that cost on *every* call. The pool keeps one long-lived
CalDAV/CardDAV session per account, reused across requests on the single event
loop, so discovery happens once. Sessions are closed on shutdown or when an
account is removed.
"""

from __future__ import annotations

import asyncio

from .caldav_client import CalDavSession
from .carddav_client import CardDavSession
from .config import Settings
from .store import Account


class SessionPool:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._caldav: dict[str, CalDavSession] = {}
        self._carddav: dict[str, CardDavSession] = {}
        self._lock = asyncio.Lock()

    async def caldav(self, account: Account) -> CalDavSession:
        existing = self._caldav.get(account.id)
        if existing is not None:
            return existing
        async with self._lock:
            existing = self._caldav.get(account.id)
            if existing is None:
                existing = CalDavSession(account, self._settings.request_timeout)
                self._caldav[account.id] = existing
            return existing

    async def carddav(self, account: Account) -> CardDavSession:
        existing = self._carddav.get(account.id)
        if existing is not None:
            return existing
        async with self._lock:
            existing = self._carddav.get(account.id)
            if existing is None:
                existing = CardDavSession(account, self._settings.request_timeout)
                self._carddav[account.id] = existing
            return existing

    async def evict(self, account_id: str) -> None:
        cal = self._caldav.pop(account_id, None)
        card = self._carddav.pop(account_id, None)
        if cal is not None:
            await cal.close()
        if card is not None:
            await card.close()

    async def close(self) -> None:
        for session in list(self._caldav.values()):
            await session.close()
        for session in list(self._carddav.values()):
            await session.close()
        self._caldav.clear()
        self._carddav.clear()

"""Persistent multi-account registry backed by SQLite.

Account credentials are stored as-is: the app replays them to the upstream DAV
server on every request, so they cannot be hashed. SQLite calls are synchronous,
so they run in a worker thread and are serialized with an asyncio lock to keep
the single shared connection safe.
"""

from __future__ import annotations

import asyncio
import secrets
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone

_SCHEMA = """
CREATE TABLE IF NOT EXISTS accounts (
    id            TEXT PRIMARY KEY,
    server        TEXT NOT NULL,
    username      TEXT NOT NULL,
    password      TEXT NOT NULL,
    display_name  TEXT,
    created_at    TEXT NOT NULL
);
"""


@dataclass(frozen=True)
class Account:
    """A backend account with its credentials."""

    id: str
    server: str
    username: str
    password: str
    display_name: str | None
    created_at: str


class Store:
    def __init__(self, db_path: str) -> None:
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute(_SCHEMA)
        self._conn.commit()
        self._lock = asyncio.Lock()

    def close(self) -> None:
        self._conn.close()

    # -- internal sync helpers (run inside a worker thread) ------------------ #
    def _row_to_account(self, row: sqlite3.Row) -> Account:
        return Account(
            id=row["id"],
            server=row["server"],
            username=row["username"],
            password=row["password"],
            display_name=row["display_name"],
            created_at=row["created_at"],
        )

    def _insert(self, account: Account) -> None:
        self._conn.execute(
            "INSERT INTO accounts (id, server, username, password, display_name, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (
                account.id,
                account.server,
                account.username,
                account.password,
                account.display_name,
                account.created_at,
            ),
        )
        self._conn.commit()

    def _select_one(self, account_id: str) -> Account | None:
        row = self._conn.execute(
            "SELECT * FROM accounts WHERE id = ?", (account_id,)
        ).fetchone()
        return self._row_to_account(row) if row else None

    def _select_all(self) -> list[Account]:
        rows = self._conn.execute(
            "SELECT * FROM accounts ORDER BY created_at"
        ).fetchall()
        return [self._row_to_account(r) for r in rows]

    def _delete(self, account_id: str) -> bool:
        cur = self._conn.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
        self._conn.commit()
        return cur.rowcount > 0

    # -- public async API ---------------------------------------------------- #
    async def add(
        self,
        *,
        server: str,
        username: str,
        password: str,
        display_name: str | None,
    ) -> Account:
        account = Account(
            id="acc_" + secrets.token_hex(8),
            server=server,
            username=username,
            password=password,
            display_name=display_name,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        async with self._lock:
            await asyncio.to_thread(self._insert, account)
        return account

    async def get(self, account_id: str) -> Account | None:
        async with self._lock:
            return await asyncio.to_thread(self._select_one, account_id)

    async def list(self) -> list[Account]:
        async with self._lock:
            return await asyncio.to_thread(self._select_all)

    async def delete(self, account_id: str) -> bool:
        async with self._lock:
            return await asyncio.to_thread(self._delete, account_id)

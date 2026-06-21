"""FastAPI dependencies.

Upstream DAV sessions are long-lived and pooled per account (see ``pool.py``):
the dependency hands back the account's existing session rather than opening one
per request. Everything still runs on uvicorn's single event loop.
"""

from __future__ import annotations

from fastapi import Depends, Request

from .caldav_client import CalDavSession
from .carddav_client import CardDavSession
from .config import Settings
from .errors import NotFoundError
from .pool import SessionPool
from .store import Account, Store


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_store(request: Request) -> Store:
    return request.app.state.store


def get_pool(request: Request) -> SessionPool:
    return request.app.state.pool


async def get_account(
    account_id: str, store: Store = Depends(get_store)
) -> Account:
    account = await store.get(account_id)
    if account is None:
        raise NotFoundError(f"account '{account_id}' not found")
    return account


# Sessions are pooled per account (see pool.py), so they are reused across
# requests rather than opened and closed each call.
async def caldav_session(
    account: Account = Depends(get_account),
    pool: SessionPool = Depends(get_pool),
) -> CalDavSession:
    return await pool.caldav(account)


async def carddav_session(
    account: Account = Depends(get_account),
    pool: SessionPool = Depends(get_pool),
) -> CardDavSession:
    return await pool.carddav(account)

"""Account registry endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, status

from ..deps import get_account, get_pool, get_store
from ..errors import NotFoundError
from ..models import AccountCreate, AccountOut
from ..pool import SessionPool
from ..store import Account, Store

router = APIRouter(prefix="/accounts", tags=["accounts"])


def _to_out(account: Account) -> AccountOut:
    return AccountOut(
        id=account.id,
        server=account.server,
        username=account.username,
        display_name=account.display_name,
        created_at=account.created_at,
    )


@router.post("", response_model=AccountOut, status_code=status.HTTP_201_CREATED)
async def create_account(
    payload: AccountCreate, store: Store = Depends(get_store)
) -> AccountOut:
    account = await store.add(
        server=str(payload.server),
        username=payload.username,
        password=payload.password,
        display_name=payload.display_name,
    )
    return _to_out(account)


@router.get("", response_model=list[AccountOut])
async def list_accounts(store: Store = Depends(get_store)) -> list[AccountOut]:
    return [_to_out(a) for a in await store.list()]


@router.get("/{account_id}", response_model=AccountOut)
async def get_account_route(account: Account = Depends(get_account)) -> AccountOut:
    return _to_out(account)


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    account_id: str,
    store: Store = Depends(get_store),
    pool: SessionPool = Depends(get_pool),
) -> None:
    if not await store.delete(account_id):
        raise NotFoundError(f"account '{account_id}' not found")
    await pool.evict(account_id)

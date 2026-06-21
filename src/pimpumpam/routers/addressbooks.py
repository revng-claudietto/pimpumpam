"""Address book collection endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, status

from ..carddav_client import CardDavSession
from ..deps import carddav_session
from ..models import AddressBookCreate, AddressBookOut

router = APIRouter(prefix="/accounts/{account_id}/addressbooks", tags=["addressbooks"])


@router.get("", response_model=list[AddressBookOut])
async def list_addressbooks(
    session: CardDavSession = Depends(carddav_session),
) -> list[AddressBookOut]:
    return await session.list_addressbooks()


@router.post("", response_model=AddressBookOut, status_code=status.HTTP_201_CREATED)
async def create_addressbook(
    payload: AddressBookCreate, session: CardDavSession = Depends(carddav_session)
) -> AddressBookOut:
    return await session.create_addressbook(payload.display_name, payload.description)


@router.delete("/{addressbook_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_addressbook(
    addressbook_id: str, session: CardDavSession = Depends(carddav_session)
) -> None:
    await session.delete_addressbook(addressbook_id)

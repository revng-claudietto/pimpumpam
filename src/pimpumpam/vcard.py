"""Conversion between the JSON contact models and vCard (RFC 6350), via vobject."""

from __future__ import annotations

from datetime import date
from typing import Any

import vobject

from .models import ContactBase, ContactOut, TypedValue


def _type_param(component: Any) -> str | None:
    """Return the first TYPE parameter of a vCard property, if any."""
    types = component.params.get("TYPE")
    if types:
        return types[0]
    return None


def build_vcard(data: ContactBase, uid: str) -> str:
    card = vobject.vCard()
    card.add("uid").value = uid
    card.add("fn").value = data.full_name
    n = card.add("n")
    n.value = vobject.vcard.Name(
        family=data.last_name or "",
        given=data.first_name or "",
    )
    for email in data.emails:
        prop = card.add("email")
        prop.value = email.value
        if email.type:
            prop.type_param = email.type
    for phone in data.phones:
        prop = card.add("tel")
        prop.value = phone.value
        if phone.type:
            prop.type_param = phone.type
    if data.organization:
        card.add("org").value = [data.organization]
    if data.title:
        card.add("title").value = data.title
    if data.note:
        card.add("note").value = data.note
    if data.birthday:
        card.add("bday").value = data.birthday.isoformat()
    if data.url:
        card.add("url").value = data.url
    return card.serialize()


def parse_vcard(text: str) -> ContactOut:
    card = vobject.readOne(text)

    uid = card.uid.value if hasattr(card, "uid") else ""
    full_name = card.fn.value if hasattr(card, "fn") else ""

    first_name: str | None = None
    last_name: str | None = None
    if hasattr(card, "n"):
        name = card.n.value
        first_name = (name.given or None) or None
        last_name = (name.family or None) or None

    emails = [
        TypedValue(type=_type_param(e), value=e.value)
        for e in getattr(card, "email_list", [])
    ]
    phones = [
        TypedValue(type=_type_param(t), value=t.value)
        for t in getattr(card, "tel_list", [])
    ]

    organization: str | None = None
    if hasattr(card, "org") and card.org.value:
        org_value = card.org.value
        organization = org_value[0] if isinstance(org_value, list) else str(org_value)

    title = card.title.value if hasattr(card, "title") else None
    note = card.note.value if hasattr(card, "note") else None
    url = card.url.value if hasattr(card, "url") else None

    birthday: date | None = None
    if hasattr(card, "bday"):
        try:
            birthday = date.fromisoformat(card.bday.value[:10])
        except (ValueError, TypeError):
            birthday = None

    return ContactOut(
        uid=uid,
        full_name=full_name,
        first_name=first_name,
        last_name=last_name,
        organization=organization,
        title=title,
        emails=emails,
        phones=phones,
        note=note,
        birthday=birthday,
        url=url,
    )

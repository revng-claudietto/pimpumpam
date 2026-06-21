"""Pydantic models — the normalized JSON surface of the API.

iCalendar / vCard payloads never cross this boundary; everything is mapped to
and from these models.
"""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field, HttpUrl


# --------------------------------------------------------------------------- #
# Accounts                                                                     #
# --------------------------------------------------------------------------- #
class AccountCreate(BaseModel):
    server: HttpUrl = Field(..., description="Base URL of the CalDAV/CardDAV server")
    username: str
    password: str = Field(..., description="Password or app-specific password")
    display_name: str | None = None


class AccountOut(BaseModel):
    id: str
    server: str
    username: str
    display_name: str | None = None
    created_at: str


# --------------------------------------------------------------------------- #
# Calendars                                                                    #
# --------------------------------------------------------------------------- #
class CalendarCreate(BaseModel):
    display_name: str
    components: list[str] = Field(
        default_factory=lambda: ["VEVENT", "VTODO"],
        description="Component types the calendar should hold, e.g. VEVENT, VTODO",
    )
    color: str | None = Field(
        default=None, description="Hex color, e.g. '#2f6fed' (Apple calendar-color)"
    )


class CalendarUpdate(BaseModel):
    display_name: str | None = None
    color: str | None = None


class CalendarOut(BaseModel):
    id: str
    display_name: str | None = None
    description: str | None = None
    color: str | None = None
    components: list[str] = Field(default_factory=list)
    url: str


# --------------------------------------------------------------------------- #
# Events                                                                       #
# --------------------------------------------------------------------------- #
class Occurrence(BaseModel):
    """A single concrete instance of an event within a queried date range."""

    uid: str
    recurrence_id: str | None = Field(
        default=None,
        description="Identifies which instance of a recurring series this is",
    )
    summary: str | None = None
    description: str | None = None
    location: str | None = None
    start: datetime | None = None
    end: datetime | None = None
    all_day: bool = False
    status: str | None = None
    alarms: list["Alarm"] = Field(default_factory=list)


class Attendee(BaseModel):
    email: str
    name: str | None = None
    status: str | None = Field(
        default=None,
        description="PARTSTAT: NEEDS-ACTION | ACCEPTED | DECLINED | TENTATIVE",
    )
    role: str | None = Field(
        default=None, description="ROLE: REQ-PARTICIPANT | OPT-PARTICIPANT | CHAIR"
    )


class Alarm(BaseModel):
    trigger: str = Field(
        ...,
        description="VALARM trigger: a relative duration like '-PT15M' (15 min "
        "before start) or an absolute ISO 8601 datetime",
    )
    action: str = "DISPLAY"
    description: str | None = None


class EventBase(BaseModel):
    summary: str
    start: datetime
    end: datetime | None = None
    all_day: bool = False
    description: str | None = None
    location: str | None = None
    status: str | None = None
    rrule: str | None = Field(
        default=None,
        description="RFC 5545 recurrence rule, e.g. 'FREQ=WEEKLY;BYDAY=MO'",
    )
    attendees: list[Attendee] = Field(default_factory=list)
    alarms: list[Alarm] = Field(default_factory=list)


class EventCreate(EventBase):
    uid: str | None = None


class EventOut(EventBase):
    uid: str


# --------------------------------------------------------------------------- #
# Todos                                                                        #
# --------------------------------------------------------------------------- #
class TodoBase(BaseModel):
    summary: str
    description: str | None = None
    status: str | None = Field(
        default=None,
        description="NEEDS-ACTION | IN-PROCESS | COMPLETED | CANCELLED",
    )
    start: datetime | None = None
    due: datetime | None = None
    completed: datetime | None = None
    priority: int | None = Field(default=None, ge=0, le=9)
    percent_complete: int | None = Field(default=None, ge=0, le=100)


class TodoCreate(TodoBase):
    uid: str | None = None


class TodoOut(TodoBase):
    uid: str


# --------------------------------------------------------------------------- #
# Address books                                                                #
# --------------------------------------------------------------------------- #
class AddressBookCreate(BaseModel):
    display_name: str
    description: str | None = None


class AddressBookOut(BaseModel):
    id: str
    display_name: str | None = None
    description: str | None = None
    url: str


# --------------------------------------------------------------------------- #
# Contacts                                                                     #
# --------------------------------------------------------------------------- #
class TypedValue(BaseModel):
    type: str | None = None
    value: str


class ContactBase(BaseModel):
    full_name: str = Field(..., description="Formatted name (vCard FN)")
    first_name: str | None = None
    last_name: str | None = None
    organization: str | None = None
    title: str | None = None
    emails: list[TypedValue] = Field(default_factory=list)
    phones: list[TypedValue] = Field(default_factory=list)
    note: str | None = None
    birthday: date | None = None
    url: str | None = None


class ContactCreate(ContactBase):
    uid: str | None = None


class ContactOut(ContactBase):
    uid: str


# Occurrence references Alarm, which is defined after it.
Occurrence.model_rebuild()

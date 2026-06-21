"""Conversion between the JSON models and iCalendar (RFC 5545).

The REST layer never sees iCalendar text; everything is funnelled through the
functions here. Recurring series are expanded into concrete occurrences with
``recurring-ical-events``.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

import recurring_ical_events
from icalendar import Alarm as IAlarm
from icalendar import Calendar as ICalendar
from icalendar import Event as IEvent
from icalendar import Todo as ITodo
from icalendar import vCalAddress, vDuration, vRecur, vText
from icalendar.cal import Component

from .errors import UpstreamError
from .models import (
    Alarm,
    Attendee,
    EventBase,
    EventOut,
    Occurrence,
    TodoBase,
    TodoOut,
)

_PRODID = "-//pimpumpam//EN"


def new_uid() -> str:
    """Generate a globally-unique iCalendar UID."""
    return f"{uuid.uuid4().hex}@pimpumpam"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_aware(value: datetime) -> datetime:
    """Treat naive datetimes as UTC (floating times are not supported)."""
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _as_utc(value: datetime) -> datetime:
    """Normalize to UTC before serializing.

    icalendar drops a fixed-offset ``datetime.timezone`` to a floating time, so
    we convert to UTC here to preserve the instant (emitted with a ``Z`` suffix).
    """
    return _ensure_aware(value).astimezone(timezone.utc)


def _opt_str(value: object | None) -> str | None:
    return str(value) if value is not None else None


def _decode_dt(prop: object | None) -> tuple[datetime | None, bool]:
    """Return ``(datetime, is_all_day)`` from an iCalendar date/datetime property."""
    if prop is None:
        return None, False
    value = getattr(prop, "dt", None)
    if isinstance(value, datetime):  # note: datetime is a subclass of date
        return _ensure_aware(value), False
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day, tzinfo=timezone.utc), True
    return None, False


def _rrule_str(value: object | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, list):  # multiple RRULEs — surface the first
        value = value[0]
    return value.to_ical().decode("utf-8")  # type: ignore[union-attr]


def _master_component(cal: ICalendar, name: str) -> Component | None:
    """Return the master component (the one without a RECURRENCE-ID), or None.

    An object that has only RECURRENCE-ID overrides and no master is malformed;
    callers raise rather than treat an override as the series master.
    """
    for comp in cal.walk(name):
        if comp.get("recurrence-id") is None:
            return comp
    return None


def _is_recurring(comp: Component | None) -> bool:
    return comp is not None and ("rrule" in comp or "rdate" in comp)


def _add_attendees(component: Component, attendees: list[Attendee]) -> None:
    for attendee in attendees:
        address = vCalAddress(f"mailto:{attendee.email}")
        if attendee.name:
            address.params["CN"] = vText(attendee.name)
        if attendee.status:
            address.params["PARTSTAT"] = vText(attendee.status.upper())
        if attendee.role:
            address.params["ROLE"] = vText(attendee.role.upper())
        component.add("attendee", address)


def _attendees_from_component(comp: Component) -> list[Attendee]:
    raw = comp.get("attendee")
    if raw is None:
        return []
    items = raw if isinstance(raw, list) else [raw]
    result: list[Attendee] = []
    for item in items:
        value = str(item)
        email = value.split(":", 1)[1] if ":" in value else value
        params = getattr(item, "params", {})
        result.append(
            Attendee(
                email=email,
                name=_opt_str(params.get("CN")),
                status=_opt_str(params.get("PARTSTAT")),
                role=_opt_str(params.get("ROLE")),
            )
        )
    return result


def _format_duration(td: timedelta) -> str:
    total = int(td.total_seconds())
    sign = "-" if total < 0 else ""
    total = abs(total)
    days, rem = divmod(total, 86400)
    hours, rem = divmod(rem, 3600)
    minutes, seconds = divmod(rem, 60)
    out = "P"
    if days:
        out += f"{days}D"
    if hours or minutes or seconds or out == "P":
        out += "T"
        if hours:
            out += f"{hours}H"
        if minutes:
            out += f"{minutes}M"
        if seconds or out == "PT":
            out += f"{seconds}S"
    return sign + out


def _trigger_value(trigger: str) -> object:
    stripped = trigger.lstrip("+-")
    if stripped.startswith("P"):  # ISO 8601 duration
        return vDuration.from_ical(trigger)
    return datetime.fromisoformat(trigger)  # absolute datetime


def _add_alarms(component: Component, alarms: list[Alarm]) -> None:
    for alarm in alarms:
        valarm = IAlarm()
        valarm.add("action", (alarm.action or "DISPLAY").upper())
        valarm.add("trigger", _trigger_value(alarm.trigger))
        valarm.add("description", alarm.description or "Reminder")
        component.add_component(valarm)


def _alarms_from_component(comp: Component) -> list[Alarm]:
    result: list[Alarm] = []
    for sub in comp.subcomponents:
        if sub.name != "VALARM":
            continue
        trigger = sub.get("trigger")
        value = getattr(trigger, "dt", None)
        if isinstance(value, timedelta):
            trigger_str = _format_duration(value)
        elif isinstance(value, datetime):
            trigger_str = _ensure_aware(value).isoformat()
        else:
            continue
        result.append(
            Alarm(
                trigger=trigger_str,
                action=_opt_str(sub.get("action")) or "DISPLAY",
                description=_opt_str(sub.get("description")),
            )
        )
    return result


# --------------------------------------------------------------------------- #
# Events                                                                       #
# --------------------------------------------------------------------------- #
def _populate_vevent(ev: IEvent, data: EventBase) -> None:
    """Set the fields shared by a master event and a single-instance override."""
    if data.all_day:
        ev.add("dtstart", data.start.date())
        if data.end is not None:
            ev.add("dtend", data.end.date())
    else:
        ev.add("dtstart", _as_utc(data.start))
        if data.end is not None:
            ev.add("dtend", _as_utc(data.end))
    ev.add("summary", data.summary)
    if data.description:
        ev.add("description", data.description)
    if data.location:
        ev.add("location", data.location)
    if data.status:
        ev.add("status", data.status.upper())
    _add_attendees(ev, data.attendees)
    _add_alarms(ev, data.alarms)


def build_event_ical(data: EventBase, uid: str) -> str:
    cal = ICalendar()
    cal.add("prodid", _PRODID)
    cal.add("version", "2.0")
    ev = IEvent()
    ev.add("uid", uid)
    ev.add("dtstamp", _now())
    _populate_vevent(ev, data)
    if data.rrule:
        ev.add("rrule", vRecur.from_ical(data.rrule))
    cal.add_component(ev)
    return cal.to_ical().decode("utf-8")


def event_from_calendar(cal: ICalendar) -> EventOut:
    comp = _master_component(cal, "VEVENT")
    if comp is None:
        raise UpstreamError("calendar object contains no VEVENT")
    start, start_all_day = _decode_dt(comp.get("dtstart"))
    end, end_all_day = _decode_dt(comp.get("dtend"))
    if start is None:
        raise UpstreamError("VEVENT has no DTSTART")
    return EventOut(
        uid=str(comp.get("uid")),
        summary=str(comp.get("summary") or ""),
        start=start,
        end=end,
        all_day=start_all_day or end_all_day,
        description=_opt_str(comp.get("description")),
        location=_opt_str(comp.get("location")),
        status=_opt_str(comp.get("status")),
        rrule=_rrule_str(comp.get("rrule")),
        attendees=_attendees_from_component(comp),
        alarms=_alarms_from_component(comp),
    )


def _occurrence(comp: Component, recurring: bool) -> Occurrence:
    start, start_all_day = _decode_dt(comp.get("dtstart"))
    end, end_all_day = _decode_dt(comp.get("dtend"))
    # recurring-ical-events stamps a RECURRENCE-ID on every occurrence it emits,
    # so it is only meaningful when the source series is genuinely recurring.
    if recurring:
        rid_dt, _ = _decode_dt(comp.get("recurrence-id"))
        anchor = rid_dt or start
        recurrence_id: str | None = anchor.isoformat() if anchor else None
    else:
        recurrence_id = None
    return Occurrence(
        uid=str(comp.get("uid")),
        recurrence_id=recurrence_id,
        summary=_opt_str(comp.get("summary")),
        description=_opt_str(comp.get("description")),
        location=_opt_str(comp.get("location")),
        start=start,
        end=end,
        all_day=start_all_day or end_all_day,
        status=_opt_str(comp.get("status")),
        alarms=_alarms_from_component(comp),
    )


def expand_occurrences(cal: ICalendar, start: datetime, end: datetime) -> list[Occurrence]:
    """Expand a calendar object into concrete occurrences within ``[start, end)``."""
    recurring = _is_recurring(_master_component(cal, "VEVENT"))
    query = recurring_ical_events.of(cal, keep_recurrence_attributes=True)
    return [_occurrence(comp, recurring) for comp in query.between(start, end)]


def parse_event(text: str) -> EventOut:
    """Parse an iCalendar document back into an :class:`EventOut`."""
    return event_from_calendar(ICalendar.from_ical(text))


# --- single-instance edits on a recurring series --------------------------- #
def add_exdate(cal: ICalendar, recurrence_id: datetime) -> None:
    """Cancel one occurrence by adding an EXDATE to the master component."""
    master = _master_component(cal, "VEVENT")
    if master is None:
        raise UpstreamError("calendar object contains no VEVENT")
    _, all_day = _decode_dt(master.get("dtstart"))
    anchor = _as_utc(recurrence_id)
    master.add("exdate", anchor.date() if all_day else anchor)


def set_override(
    cal: ICalendar, recurrence_id: datetime, data: EventBase, uid: str
) -> None:
    """Add or replace a RECURRENCE-ID override component for one instance."""
    anchor = _as_utc(recurrence_id)
    for comp in list(cal.subcomponents):
        if comp.name == "VEVENT":
            existing, _ = _decode_dt(comp.get("recurrence-id"))
            if existing is not None and existing == anchor:
                cal.subcomponents.remove(comp)
    override = IEvent()
    override.add("uid", uid)
    override.add("dtstamp", _now())
    override.add("recurrence-id", anchor)
    _populate_vevent(override, data)
    cal.add_component(override)


def override_view(recurrence_id: datetime, data: EventBase, uid: str) -> Occurrence:
    """The :class:`Occurrence` a just-written override resolves to."""
    return Occurrence(
        uid=uid,
        recurrence_id=_as_utc(recurrence_id).isoformat(),
        summary=data.summary,
        description=data.description,
        location=data.location,
        start=_as_utc(data.start),
        end=_as_utc(data.end) if data.end is not None else None,
        all_day=data.all_day,
        status=data.status,
    )


# --------------------------------------------------------------------------- #
# Todos                                                                        #
# --------------------------------------------------------------------------- #
def build_todo_ical(data: TodoBase, uid: str) -> str:
    cal = ICalendar()
    cal.add("prodid", _PRODID)
    cal.add("version", "2.0")
    td = ITodo()
    td.add("uid", uid)
    td.add("dtstamp", _now())
    td.add("summary", data.summary)
    if data.description:
        td.add("description", data.description)
    if data.status:
        td.add("status", data.status.upper())
    if data.start is not None:
        td.add("dtstart", _as_utc(data.start))
    if data.due is not None:
        td.add("due", _as_utc(data.due))
    if data.completed is not None:
        td.add("completed", _as_utc(data.completed))
    if data.priority is not None:
        td.add("priority", data.priority)
    if data.percent_complete is not None:
        td.add("percent-complete", data.percent_complete)
    cal.add_component(td)
    return cal.to_ical().decode("utf-8")


def _opt_int(value: object | None) -> int | None:
    return int(value) if value is not None else None  # type: ignore[arg-type]


def todo_from_calendar(cal: ICalendar) -> TodoOut:
    comp = _master_component(cal, "VTODO")
    if comp is None:
        raise UpstreamError("calendar object contains no VTODO")
    start, _ = _decode_dt(comp.get("dtstart"))
    due, _ = _decode_dt(comp.get("due"))
    completed, _ = _decode_dt(comp.get("completed"))
    return TodoOut(
        uid=str(comp.get("uid")),
        summary=str(comp.get("summary") or ""),
        description=_opt_str(comp.get("description")),
        status=_opt_str(comp.get("status")),
        start=start,
        due=due,
        completed=completed,
        priority=_opt_int(comp.get("priority")),
        percent_complete=_opt_int(comp.get("percent-complete")),
    )

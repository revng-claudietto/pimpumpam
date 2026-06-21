// Client-side iCalendar/vCard previews — "generated live from the fields".
// The API is normalized JSON only; these are read-only previews, not sent.

import type { Alarm, Attendee, TypedValue } from "../api/types";
import { toDateInput } from "./date";

// Reminder presets: label -> VALARM trigger ("" means no reminder).
export const REMINDERS: { label: string; trigger: string }[] = [
  { label: "No reminder", trigger: "" },
  { label: "At time of event", trigger: "-PT0S" },
  { label: "5 minutes before", trigger: "-PT5M" },
  { label: "15 minutes before", trigger: "-PT15M" },
  { label: "30 minutes before", trigger: "-PT30M" },
  { label: "1 hour before", trigger: "-PT1H" },
  { label: "1 day before", trigger: "-P1D" },
];

function utcStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}00Z`
  );
}

export interface EventPreview {
  summary: string;
  allDay: boolean;
  start: Date;
  end: Date;
  rrule: string | null;
  location: string;
  notes: string;
  attendees: Attendee[];
  alarms: Alarm[];
}

export function buildEventIcs(e: EventPreview): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//pimpumpam//EN", "BEGIN:VEVENT", "UID:(generated on save)"];
  if (e.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${toDateInput(e.start).replace(/-/g, "")}`);
    lines.push(`DTEND;VALUE=DATE:${toDateInput(e.end).replace(/-/g, "")}`);
  } else {
    lines.push(`DTSTART:${utcStamp(e.start)}`);
    lines.push(`DTEND:${utcStamp(e.end)}`);
  }
  lines.push(`SUMMARY:${e.summary}`);
  if (e.rrule) lines.push(`RRULE:${e.rrule}`);
  if (e.location) lines.push(`LOCATION:${e.location}`);
  if (e.notes) lines.push(`DESCRIPTION:${e.notes.replace(/\n/g, "\\n")}`);
  for (const a of e.attendees) {
    const params = [
      a.name ? `CN=${a.name}` : "",
      a.status ? `PARTSTAT=${a.status.toUpperCase()}` : "",
    ].filter(Boolean);
    lines.push(`ATTENDEE${params.length ? ";" + params.join(";") : ""}:mailto:${a.email}`);
  }
  for (const al of e.alarms) {
    lines.push(
      "BEGIN:VALARM",
      `ACTION:${(al.action ?? "DISPLAY").toUpperCase()}`,
      `TRIGGER:${al.trigger}`,
      `DESCRIPTION:${al.description ?? e.summary}`,
      "END:VALARM",
    );
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\n");
}

export interface ContactPreview {
  full_name: string;
  organization: string;
  title: string;
  emails: TypedValue[];
  phones: TypedValue[];
  note: string;
}

export function buildContactVcard(c: ContactPreview): string {
  const lines = ["BEGIN:VCARD", "VERSION:3.0", "UID:(generated on save)", `FN:${c.full_name}`];
  if (c.organization) lines.push(`ORG:${c.organization}`);
  if (c.title) lines.push(`TITLE:${c.title}`);
  for (const e of c.emails) lines.push(`EMAIL${e.type ? `;TYPE=${e.type}` : ""}:${e.value}`);
  for (const p of c.phones) lines.push(`TEL${p.type ? `;TYPE=${p.type}` : ""}:${p.value}`);
  if (c.note) lines.push(`NOTE:${c.note.replace(/\n/g, "\\n")}`);
  lines.push("END:VCARD");
  return lines.join("\n");
}

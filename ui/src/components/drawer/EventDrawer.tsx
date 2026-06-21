import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api/client";
import type { Alarm, Attendee, EventInput, EventOut } from "../../api/types";
import { useStore } from "../../state/store";
import { roundedNow, toDateInput, toLocalInput } from "../../utils/date";
import { buildEventIcs, REMINDERS } from "../../utils/ics";
import { emptyRecurrence, fromRRule, type Recurrence, toRRule } from "../../utils/rrule";
import { colorForId } from "../../theme";
import { fieldLabel, ghostBtn, input as inputStyle, primaryBtn } from "../Modal";
import { swatch } from "../Sidebar";
import { seg, segGroup } from "../Topbar";
import { Drawer, titleInput } from "./Drawer";
import { RecurrenceBuilder } from "./RecurrenceBuilder";

type Scope = "this" | "all";

interface Form {
  summary: string;
  calendarId: string;
  allDay: boolean;
  start: Date;
  end: Date;
  recurrence: Recurrence;
  location: string;
  notes: string;
  attendees: Attendee[];
  alarms: Alarm[];
}

function defaultForm(calendarId: string, seedStart?: string): Form {
  const start = seedStart ? new Date(seedStart) : roundedNow();
  return {
    summary: "",
    calendarId,
    allDay: false,
    start,
    end: new Date(start.getTime() + 3600000),
    recurrence: emptyRecurrence(),
    location: "",
    notes: "",
    attendees: [],
    alarms: [],
  };
}

function formFromEvent(ev: EventOut, calendarId: string): Form {
  return {
    summary: ev.summary,
    calendarId,
    allDay: ev.all_day,
    start: ev.start ? new Date(ev.start) : roundedNow(),
    end: ev.end ? new Date(ev.end) : roundedNow(),
    recurrence: fromRRule(ev.rrule),
    location: ev.location ?? "",
    notes: ev.description ?? "",
    attendees: ev.attendees ?? [],
    alarms: ev.alarms ?? [],
  };
}

export function EventDrawer() {
  const {
    eventCtx, accountId, calendars, closeDrawer, saveEvent, deleteEvent,
    overrideOccurrence, cancelOccurrence, loadOccurrences,
  } = useStore();
  const ctx = eventCtx!;
  const isEdit = ctx.mode === "edit";
  const isRecurringInstance = isEdit && !!ctx.recurrenceId;

  const [scope, setScope] = useState<Scope>(isRecurringInstance ? "this" : "all");
  const [form, setForm] = useState<Form | null>(null);
  const [etag, setEtag] = useState<string | undefined>(undefined);
  const [raw, setRaw] = useState(false);
  const [busy, setBusy] = useState(false);
  // Once the user edits, a late background refetch must not clobber their input.
  const touched = useRef(false);

  // Seed the form: create → defaults; edit "this" → from the occurrence seed;
  // edit "all" (or a non-recurring event) → fetch the master object.
  useEffect(() => {
    let alive = true;
    touched.current = false;
    if (!isEdit) {
      setForm(defaultForm(ctx.calendarId, ctx.seedStart));
      return;
    }
    if (scope === "this" && ctx.seed) {
      const start = ctx.seed.start ? new Date(ctx.seed.start) : roundedNow();
      setForm({
        summary: ctx.seed.summary,
        calendarId: ctx.calendarId,
        allDay: ctx.seed.all_day,
        start,
        end: ctx.seed.end ? new Date(ctx.seed.end) : new Date(start.getTime() + 3600000),
        recurrence: emptyRecurrence(),
        location: ctx.seed.location ?? "",
        notes: "",
        attendees: [],
        alarms: ctx.seed.alarms,
      });
      return;
    }
    // Render instantly from the list event if we have it; the fetch below only
    // refreshes the ETag (and the form, unless the user already started editing).
    if (ctx.fullEvent) setForm(formFromEvent(ctx.fullEvent, ctx.calendarId));
    if (!ctx.uid || !accountId) return;
    const holder: { etag?: string } = {};
    api.getEvent(accountId, ctx.calendarId, ctx.uid, holder).then((ev) => {
      if (!alive) return;
      setEtag(holder.etag);
      if (!touched.current) setForm(formFromEvent(ev, ctx.calendarId));
    });
    return () => {
      alive = false;
    };
  }, [isEdit, scope, ctx.uid, ctx.calendarId, ctx.seedStart, accountId]);

  const patch = (p: Partial<Form>) => {
    touched.current = true;
    setForm((f) => (f ? { ...f, ...p } : f));
  };

  const icsPreview = useMemo(
    () =>
      form
        ? buildEventIcs({
            summary: form.summary,
            allDay: form.allDay,
            start: form.start,
            end: form.end,
            rrule: scope === "all" ? toRRule(form.recurrence) : null,
            location: form.location,
            notes: form.notes,
            attendees: form.attendees,
            alarms: form.alarms,
          })
        : "",
    [form, scope],
  );

  if (!form) {
    return (
      <Drawer title="Loading…" onClose={closeDrawer} testid="event-drawer">
        <div style={{ color: "var(--muted)" }}>Loading…</div>
      </Drawer>
    );
  }

  const buildInput = (): EventInput => ({
    summary: form.summary || "(untitled)",
    start: form.allDay ? `${toDateInput(form.start)}T00:00:00` : form.start.toISOString(),
    end: form.allDay ? `${toDateInput(form.end)}T00:00:00` : form.end.toISOString(),
    all_day: form.allDay,
    location: form.location || null,
    description: form.notes || null,
    rrule: scope === "all" ? toRRule(form.recurrence) : null,
    attendees: form.attendees,
    alarms: form.alarms,
  });

  const onSave = async () => {
    setBusy(true);
    try {
      const body = buildInput();
      if (isRecurringInstance && scope === "this" && ctx.uid && ctx.recurrenceId) {
        await overrideOccurrence(ctx.calendarId, ctx.uid, ctx.recurrenceId, body);
      } else if (isEdit && ctx.uid && form.calendarId !== ctx.calendarId && accountId) {
        await api.createEvent(accountId, form.calendarId, { ...body, uid: ctx.uid });
        await api.deleteEvent(accountId, ctx.calendarId, ctx.uid);
        await loadOccurrences();
      } else {
        await saveEvent(form.calendarId, body, isEdit ? ctx.uid : undefined, etag);
      }
      closeDrawer();
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!ctx.uid) return;
    setBusy(true);
    try {
      if (isRecurringInstance && scope === "this" && ctx.recurrenceId) {
        await cancelOccurrence(ctx.calendarId, ctx.uid, ctx.recurrenceId);
      } else {
        await deleteEvent(ctx.calendarId, ctx.uid);
      }
      closeDrawer();
    } finally {
      setBusy(false);
    }
  };

  const dtType = form.allDay ? "date" : "datetime-local";
  const dtValue = (d: Date) => (form.allDay ? toDateInput(d) : toLocalInput(d));
  const reminder = form.alarms[0]?.trigger ?? "";

  return (
    <Drawer
      title={isEdit ? "Edit event" : "New event"}
      onClose={closeDrawer}
      testid="event-drawer"
      headerExtra={
        <div style={segGroup}>
          <button data-testid="drawer-form-tab" onClick={() => setRaw(false)} style={seg(!raw)}>Form</button>
          <button data-testid="drawer-raw-tab" onClick={() => setRaw(true)} style={seg(raw)}>Raw</button>
        </div>
      }
      footer={
        <>
          {isEdit && (
            <button data-testid="event-delete" onClick={onDelete} style={{ ...ghostBtn, color: "#dc4b3e" }}>
              {isRecurringInstance && scope === "this" ? "Delete this" : "Delete"}
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={closeDrawer} style={ghostBtn}>Cancel</button>
          <button data-testid="event-save" onClick={onSave} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      {raw ? (
        <div>
          <div style={fieldLabel}>iCalendar (preview)</div>
          <textarea data-testid="event-raw" readOnly value={icsPreview} style={{ width: "100%", height: 420, padding: 13, border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--surface-2)", fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.65, resize: "vertical", whiteSpace: "pre" }} />
          <div style={{ marginTop: 8, fontFamily: "var(--meta-font)", fontSize: 10, color: "var(--muted)" }}>
            Generated live from the fields. The server stores normalized data.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {isRecurringInstance && (
            <div data-testid="recur-scope" style={segGroup}>
              <button data-testid="scope-this" onClick={() => setScope("this")} style={{ ...seg(scope === "this"), flex: 1 }}>This event</button>
              <button data-testid="scope-all" onClick={() => setScope("all")} style={{ ...seg(scope === "all"), flex: 1 }}>All events</button>
            </div>
          )}

          <input data-testid="event-title" value={form.summary} onChange={(e) => patch({ summary: e.target.value })} placeholder="Event title" style={titleInput} />

          <div>
            <div style={fieldLabel}>Calendar</div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 11px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-2)" }}>
              <span style={swatch(calendars.find((c) => c.id === form.calendarId)?.color ?? colorForId(form.calendarId))} />
              <select data-testid="event-calendar" value={form.calendarId} disabled={scope === "this"} onChange={(e) => patch({ calendarId: e.target.value })} style={{ flex: 1, background: "transparent", border: "none", fontSize: 13.5, fontWeight: 500 }}>
                {calendars.map((c) => (
                  <option key={c.id} value={c.id}>{c.display_name ?? c.id}</option>
                ))}
              </select>
            </div>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, fontWeight: 500, cursor: "pointer" }}>
            <input type="checkbox" data-testid="event-allday" checked={form.allDay} onChange={(e) => patch({ allDay: e.target.checked })} /> All day
          </label>

          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={fieldLabel}>Starts</div>
              <input type={dtType} data-testid="event-start" value={dtValue(form.start)} onChange={(e) => patch({ start: new Date(e.target.value) })} style={{ ...inputStyle, fontFamily: "var(--meta-font)" }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={fieldLabel}>Ends</div>
              <input type={dtType} data-testid="event-end" value={dtValue(form.end)} onChange={(e) => patch({ end: new Date(e.target.value) })} style={{ ...inputStyle, fontFamily: "var(--meta-font)" }} />
            </div>
          </div>

          {scope === "all" && (
            <RecurrenceBuilder value={form.recurrence} onChange={(recurrence) => patch({ recurrence })} />
          )}

          <div>
            <div style={fieldLabel}>Reminder</div>
            <select
              data-testid="event-reminder"
              value={reminder}
              onChange={(e) =>
                patch({ alarms: e.target.value ? [{ trigger: e.target.value, action: "DISPLAY" }] : [] })
              }
              style={{ ...inputStyle }}
            >
              {REMINDERS.map((r) => (
                <option key={r.label} value={r.trigger}>{r.label}</option>
              ))}
            </select>
          </div>

          <div>
            <div style={fieldLabel}>Location</div>
            <input data-testid="event-location" value={form.location} onChange={(e) => patch({ location: e.target.value })} placeholder="Add location or URL" style={inputStyle} />
          </div>

          <Attendees value={form.attendees} onChange={(attendees) => patch({ attendees })} />

          <div>
            <div style={fieldLabel}>Notes</div>
            <textarea data-testid="event-notes" value={form.notes} onChange={(e) => patch({ notes: e.target.value })} placeholder="Add notes" style={{ ...inputStyle, height: 74, resize: "vertical" }} />
          </div>
        </div>
      )}
    </Drawer>
  );
}

function Attendees({ value, onChange }: { value: Attendee[]; onChange: (a: Attendee[]) => void }) {
  const [text, setText] = useState("");
  const add = () => {
    const t = text.trim();
    if (!t) return;
    const m = t.match(/^(.*)<(.+)>$/);
    const attendee: Attendee = m ? { name: m[1].trim() || null, email: m[2].trim() } : { email: t };
    onChange([...value, attendee]);
    setText("");
  };
  return (
    <div>
      <div style={fieldLabel}>Attendees</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {value.map((a, i) => (
          <span key={`${a.email}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 8px 5px 9px", borderRadius: 999, background: "var(--surface-2)", border: "1px solid var(--border)", fontSize: 12 }}>
            {a.name ?? a.email}
            <button onClick={() => onChange(value.filter((_, j) => j !== i))} style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1 }}>×</button>
          </span>
        ))}
      </div>
      <input
        data-testid="event-attendee-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        placeholder="email or Name <email>, then Enter"
        style={inputStyle}
      />
    </div>
  );
}

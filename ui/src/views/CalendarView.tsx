import { useEffect } from "react";
import { seg, segGroup } from "../components/Topbar";
import { AgendaView } from "../components/calendar/AgendaView";
import { EventsListView } from "../components/calendar/EventsListView";
import { MonthView } from "../components/calendar/MonthView";
import { TimeGridView } from "../components/calendar/TimeGridView";
import { useStore, type CalView } from "../state/store";
import { addDays, MONTHS, roundedNow, startOfWeek, toLocalInput } from "../utils/date";

const VIEWS: { id: CalView; label: string }[] = [
  { id: "month", label: "Month" },
  { id: "week", label: "Week" },
  { id: "day", label: "Day" },
  { id: "agenda", label: "Agenda" },
  { id: "list", label: "Events" },
];

function headerLabel(view: CalView, cursor: Date, weeksCount: number): string {
  if (view === "month") return `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
  if (view === "day")
    return cursor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const start = startOfWeek(cursor);
  const end = addDays(start, (view === "agenda" ? weeksCount * 7 : 7) - 1);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, { ...opts, year: "numeric" })}`;
}

const navBtn = {
  width: 32,
  height: 32,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  fontSize: 15,
};

export function CalendarView() {
  const {
    view, setView, cursor, weeksCount, setWeeksCount,
    goToday, goPrev, goNext, accountId, enabledCalendars, calendars,
    loadOccurrences, loadAllEvents, allEvents, eventSearch, setEventSearch,
    openEventDrawer, focusDay, moveFocus, drawerKind,
  } = useStore();

  const defaultCalendar =
    calendars.find((c) => enabledCalendars.includes(c.id))?.id;
  const isList = view === "list";
  const isGrid = view === "month" || view === "week" || view === "day";

  useEffect(() => {
    if (!isList) void loadOccurrences();
  }, [view, cursor, weeksCount, enabledCalendars, accountId, isList, loadOccurrences]);

  // The events list isn't range-bound; (re)load it only on entry / collection
  // change (it's also warmed at startup, so opening the tab is usually instant).
  useEffect(() => {
    if (isList) void loadAllEvents();
  }, [isList, enabledCalendars, accountId, loadAllEvents]);

  // Arrow keys move the focused day in the grid views; Enter creates an event
  // there. Crossing the period edge rolls to the next/previous month or week.
  useEffect(() => {
    if (!isGrid) return;
    const onKey = (e: KeyboardEvent) => {
      if (drawerKind) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        moveFocus(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        moveFocus(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveFocus(-7);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        moveFocus(7);
      } else if (e.key === "Enter" && defaultCalendar) {
        e.preventDefault();
        openEventDrawer({
          mode: "create",
          calendarId: defaultCalendar,
          seedStart: toLocalInput(new Date(focusDay.getFullYear(), focusDay.getMonth(), focusDay.getDate(), 9, 0)),
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isGrid, drawerKind, moveFocus, focusDay, defaultCalendar, openEventDrawer]);

  return (
    <div data-testid="calendar-view" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* toolbar */}
      <div style={{ height: 52, flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "0 14px", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
        <div style={segGroup}>
          {VIEWS.map((v) => (
            <button key={v.id} data-testid={`view-${v.id}`} onClick={() => setView(v.id)} style={seg(view === v.id)}>
              {v.label}
            </button>
          ))}
        </div>
        {!isList && (
          <>
            <button data-testid="today" onClick={goToday} style={{ padding: "7px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-2)", fontSize: 12.5, fontWeight: 500 }}>
              Today
            </button>
            <div style={{ display: "flex" }}>
              <button data-testid="prev" onClick={goPrev} style={{ ...navBtn, borderRight: "none", borderRadius: "var(--radius-sm) 0 0 var(--radius-sm)" }}>‹</button>
              <button data-testid="next" onClick={goNext} style={{ ...navBtn, borderRadius: "0 var(--radius-sm) var(--radius-sm) 0" }}>›</button>
            </div>
            <div data-testid="header-label" style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>
              {headerLabel(view, cursor, weeksCount)}
            </div>
            {view === "agenda" && (
              <div className="hide-sm" style={{ display: "flex", alignItems: "center", gap: 7, marginLeft: 4, padding: "4px 4px 4px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--surface-2)" }}>
                <span style={{ fontFamily: "var(--meta-font)", fontSize: 10, color: "var(--muted)" }}>weeks</span>
                <button onClick={() => setWeeksCount(weeksCount - 1)} style={stepBtn}>−</button>
                <span style={{ fontFamily: "var(--meta-font)", fontSize: 12, fontWeight: 600, minWidth: 14, textAlign: "center" }}>{weeksCount}</span>
                <button onClick={() => setWeeksCount(weeksCount + 1)} style={stepBtn}>+</button>
              </div>
            )}
          </>
        )}
        {isList && (
          <div style={{ display: "flex", alignItems: "center", gap: 9, flex: 1, maxWidth: 420 }}>
            <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
              <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 13, pointerEvents: "none" }}>⌕</span>
              <input
                data-testid="event-search"
                value={eventSearch}
                onChange={(e) => setEventSearch(e.target.value)}
                placeholder="Search all events…"
                style={{ width: "100%", padding: "8px 11px 8px 30px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-2)", fontSize: 13 }}
              />
            </div>
            <span data-testid="event-count" style={{ fontFamily: "var(--meta-font)", fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
              {allEvents.length} events
            </span>
          </div>
        )}
        <div style={{ flex: 1 }} />
        <button
          data-testid="new-event"
          disabled={!defaultCalendar}
          onClick={() =>
            defaultCalendar &&
            openEventDrawer({ mode: "create", calendarId: defaultCalendar, seedStart: toLocalInput(roundedNow()) })
          }
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: "var(--radius-sm)", background: "var(--accent)", color: "#fff", fontSize: 12.5, fontWeight: 600, opacity: defaultCalendar ? 1 : 0.5, boxShadow: "0 1px 2px rgba(47,111,237,.4)" }}
        >
          <span style={{ fontSize: 15, lineHeight: 1 }}>+</span>
          <span className="hide-sm">New event</span>
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        {view === "month" && <MonthView defaultCalendar={defaultCalendar} />}
        {view === "week" && <TimeGridView days={7} defaultCalendar={defaultCalendar} />}
        {view === "day" && <TimeGridView days={1} defaultCalendar={defaultCalendar} />}
        {view === "agenda" && <AgendaView />}
        {view === "list" && <EventsListView />}
      </div>
    </div>
  );
}

const stepBtn = {
  width: 22,
  height: 22,
  borderRadius: "var(--radius-sm)",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  fontSize: 14,
  lineHeight: 1,
};

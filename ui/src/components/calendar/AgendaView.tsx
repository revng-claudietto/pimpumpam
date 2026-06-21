import type { CSSProperties } from "react";
import { useStore } from "../../state/store";
import { addDays, mondayDayName, sameDay, startOfWeek } from "../../utils/date";
import { useListNav } from "../../utils/listnav";
import { eventsForDay, key, occEnd, occStart } from "../../utils/occurrences";

export function AgendaView() {
  const { cursor, weeksCount, occurrences, openOccurrenceEditor } = useStore();
  const start = startOfWeek(cursor);
  const days = Array.from({ length: weeksCount * 7 }, (_, i) => addDays(start, i));
  const today = new Date();

  // Group by day, assigning each item a flat index for keyboard navigation.
  let running = 0;
  const groups = days
    .map((day) => ({ day, items: eventsForDay(occurrences, day) }))
    .filter((g) => g.items.length > 0)
    .map((g) => {
      const startIndex = running;
      running += g.items.length;
      return { ...g, startIndex };
    });
  const flat = groups.flatMap((g) => g.items);

  const { index, setIndex, onKeyDown, containerRef } = useListNav(
    flat.length,
    (i) => openOccurrenceEditor(flat[i]),
  );

  if (groups.length === 0) {
    return (
      <div data-testid="agenda-empty" style={{ padding: 60, textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
        No events in this range.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      style={{ height: "100%", width: "100%", overflow: "auto", padding: "8px 0", outline: "none" }}
      data-testid="agenda-list"
    >
      {groups.map(({ day, items, startIndex }) => {
        const isToday = sameDay(day, today);
        return (
          <div key={day.toISOString()}>
            <div style={{ display: "flex", padding: "10px 18px 6px", gap: 14, alignItems: "baseline", background: isToday ? "var(--today)" : "transparent" }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: isToday ? "var(--accent)" : "var(--text)" }}>{day.getDate()}</div>
              <div style={{ fontFamily: "var(--meta-font)", fontSize: 11, color: "var(--muted)", textTransform: "var(--label-transform)" as CSSProperties["textTransform"], letterSpacing: "var(--label-spacing)" }}>
                {mondayDayName(day)} · {day.toLocaleString(undefined, { month: "short" })}
              </div>
            </div>
            {items.map((ev, j) => {
              const idx = startIndex + j;
              const selected = idx === index;
              return (
                <div
                  key={key(ev)}
                  data-testid="agenda-item"
                  data-nav-index={idx}
                  onClick={() => setIndex(idx)}
                  onDoubleClick={() => openOccurrenceEditor(ev)}
                  style={{ display: "flex", gap: 14, alignItems: "center", margin: "2px 14px", padding: "11px 14px", borderRadius: "var(--radius)", background: selected ? "var(--accent-soft)" : "var(--surface)", border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`, cursor: "pointer" }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: ev.color, flex: "none" }} />
                  <div style={{ fontFamily: "var(--meta-font)", fontSize: 12, color: "var(--muted)", width: 104, flex: "none" }}>
                    {ev.all_day
                      ? "all-day"
                      : `${occStart(ev).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} – ${occEnd(ev).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ev.summary}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ev.location ?? ""}</div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

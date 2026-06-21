import type { CSSProperties } from "react";
import { useStore, type EnrichedOccurrence } from "../../state/store";
import { mondayDayName, sameDay, startOfWeek, toLocalInput } from "../../utils/date";
import { eventsForDay, key, occEnd, occStart } from "../../utils/occurrences";

const HOUR = 44;
const DAY_H = HOUR * 24;

function minutesOf(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

// Greedy lane assignment so overlapping events sit side by side.
function layout(events: EnrichedOccurrence[]): { ev: EnrichedOccurrence; lane: number; lanes: number }[] {
  const timed = events.filter((e) => !e.all_day);
  const laneEnds: number[] = [];
  const placed = timed.map((ev) => {
    const s = occStart(ev).getTime();
    const e = occEnd(ev).getTime();
    let lane = laneEnds.findIndex((end) => end <= s);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(e);
    } else {
      laneEnds[lane] = e;
    }
    return { ev, lane, start: s, end: e };
  });
  const lanes = Math.max(1, laneEnds.length);
  return placed.map((p) => ({ ev: p.ev, lane: p.lane, lanes }));
}

export function TimeGridView({
  days,
  defaultCalendar,
}: {
  days: number;
  defaultCalendar?: string;
}) {
  const { cursor, focusDay, occurrences, openEventDrawer, openOccurrenceEditor, setFocusDay } = useStore();
  const start = days === 1 ? cursor : startOfWeek(cursor);
  const columns = Array.from({ length: days }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
  const today = new Date();
  const hours = Array.from({ length: 23 }, (_, i) => i + 1);

  return (
    <div style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* column headers */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "var(--surface)", flex: "none" }}>
        <div style={{ width: 58, flex: "none" }} />
        {columns.map((d) => {
          const isToday = sameDay(d, today);
          const isFocus = sameDay(d, focusDay);
          return (
            <div key={d.toISOString()} style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderLeft: "1px solid var(--grid)", background: isToday ? "var(--today)" : "transparent", borderTop: `2px solid ${isFocus ? "var(--accent)" : "transparent"}` }}>
              <div style={{ fontFamily: "var(--meta-font)", fontSize: 10, color: "var(--muted)", textTransform: "var(--label-transform)" as CSSProperties["textTransform"], letterSpacing: "var(--label-spacing)" }}>
                {mondayDayName(d)}
              </div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: isToday ? 700 : 500,
                  color: isToday ? "var(--accent)" : "var(--text)",
                  width: 28,
                  height: 28,
                  lineHeight: "28px",
                  margin: "2px auto 0",
                }}
              >
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* all-day row */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "var(--surface)", flex: "none", minHeight: 30, maxHeight: 84, overflow: "auto" }}>
        <div style={{ width: 58, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--meta-font)", fontSize: 9, color: "var(--muted)" }}>
          all-day
        </div>
        {columns.map((d) => (
          <div key={d.toISOString()} style={{ flex: 1, borderLeft: "1px solid var(--grid)", padding: 3, display: "flex", flexDirection: "column", gap: 2, background: sameDay(d, today) ? "var(--today)" : "transparent" }}>
            {eventsForDay(occurrences, d).filter((e) => e.all_day).map((ev) => (
              <div
                key={key(ev)}
                onClick={() => openOccurrenceEditor(ev)}
                style={{ fontSize: 11.5, padding: "2px 6px", borderRadius: 5, background: ev.color, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer" }}
              >
                {ev.summary}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* hour grid */}
      <div style={{ flex: 1, overflow: "auto", background: "var(--surface)", minHeight: 0 }}>
        <div style={{ display: "flex", position: "relative", height: DAY_H }}>
          <div style={{ width: 58, flex: "none", position: "relative" }}>
            {hours.map((h) => (
              <div
                key={h}
                style={{ position: "absolute", top: h * HOUR - 7, right: 8, fontFamily: "var(--meta-font)", fontSize: 10, color: "var(--muted)" }}
              >
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          <div style={{ flex: 1, display: "flex" }}>
            {columns.map((d) => {
              const placed = layout(eventsForDay(occurrences, d));
              const isToday = sameDay(d, today);
              const nowTop = (minutesOf(today) / 60) * HOUR;
              return (
                <div
                  key={d.toISOString()}
                  onClick={() => setFocusDay(d)}
                  onDoubleClick={(e) => {
                    if (!defaultCalendar) return;
                    const y = (e.nativeEvent as MouseEvent).offsetY;
                    const hour = Math.max(0, Math.min(23, Math.floor(y / HOUR)));
                    const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, 0);
                    openEventDrawer({ mode: "create", calendarId: defaultCalendar, seedStart: toLocalInput(at) });
                  }}
                  style={{
                    flex: 1,
                    position: "relative",
                    borderLeft: "1px solid var(--grid)",
                    background:
                      (isToday ? "linear-gradient(var(--today), var(--today))," : "") +
                      "repeating-linear-gradient(to bottom, var(--grid) 0, var(--grid) 1px, transparent 1px, transparent " + HOUR + "px)",
                  }}
                >
                  {isToday && (
                    <div style={{ position: "absolute", left: 0, right: 0, top: nowTop, height: 2, background: "#dc4b3e", zIndex: 3 }} />
                  )}
                  {placed.map(({ ev, lane, lanes }) => {
                    const top = (minutesOf(occStart(ev)) / 60) * HOUR;
                    const height = Math.max(18, ((occEnd(ev).getTime() - occStart(ev).getTime()) / 3600000) * HOUR);
                    const width = 100 / lanes;
                    return (
                      <div
                        key={key(ev)}
                        onClick={(e) => {
                          e.stopPropagation();
                          openOccurrenceEditor(ev);
                        }}
                        onDoubleClick={(e) => e.stopPropagation()}
                        style={{
                          position: "absolute",
                          top,
                          height: height - 2,
                          left: `calc(${lane * width}% + 2px)`,
                          width: `calc(${width}% - 4px)`,
                          background: ev.color,
                          color: "#fff",
                          borderRadius: 6,
                          padding: "3px 6px",
                          overflow: "hidden",
                          boxShadow: "0 1px 2px rgba(0,0,0,.18)",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {ev.summary}
                        </div>
                        <div style={{ fontFamily: "var(--meta-font)", fontSize: 10, opacity: 0.85 }}>
                          {occStart(ev).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

import type { CSSProperties } from "react";
import { useStore } from "../../state/store";
import {
  addDays,
  DAY_NAMES,
  sameDay,
  startOfMonth,
  startOfWeek,
  toLocalInput,
} from "../../utils/date";
import { eventsForDay, key, occStart } from "../../utils/occurrences";

const headRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
  flex: "none",
  borderBottom: "1px solid var(--border)",
  background: "var(--surface)",
  position: "sticky",
  top: 0,
  zIndex: 2,
};

export function MonthView({ defaultCalendar }: { defaultCalendar?: string }) {
  const { cursor, focusDay, occurrences, openEventDrawer, openOccurrenceEditor, setFocusDay } = useStore();
  const monthStart = startOfMonth(cursor);
  const gridStart = startOfWeek(monthStart);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const today = new Date();

  return (
    <div style={{ height: "100%", width: "100%", overflow: "auto", display: "flex", flexDirection: "column" }}>
      <div style={headRow}>
        {DAY_NAMES.map((d) => (
          <div
            key={d}
            style={{
              padding: "9px 10px",
              fontFamily: "var(--meta-font)",
              fontSize: 10,
              fontWeight: 600,
              color: "var(--muted)",
              textTransform: "var(--label-transform)" as CSSProperties["textTransform"],
              letterSpacing: "var(--label-spacing)",
            }}
          >
            {d}
          </div>
        ))}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gridAutoRows: "minmax(96px, 1fr)",
          flex: 1,
        }}
        data-testid="month-grid"
      >
        {cells.map((day) => {
          const inMonth = day.getMonth() === cursor.getMonth();
          const isToday = sameDay(day, today);
          const isFocus = sameDay(day, focusDay);
          const items = eventsForDay(occurrences, day);
          return (
            <div
              key={day.toISOString()}
              onClick={() => setFocusDay(day)}
              onDoubleClick={() =>
                defaultCalendar &&
                openEventDrawer({
                  mode: "create",
                  calendarId: defaultCalendar,
                  seedStart: toLocalInput(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0)),
                })
              }
              style={{
                borderRight: "1px solid var(--grid)",
                borderBottom: "1px solid var(--grid)",
                background: isToday ? "var(--today)" : inMonth ? "var(--surface)" : "var(--bg)",
                boxShadow: isFocus ? "inset 0 0 0 2px var(--accent)" : undefined,
                minHeight: 0,
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "flex-end", padding: "5px 7px 3px" }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: isToday ? 700 : 500,
                    color: isToday ? "var(--accent)" : inMonth ? "var(--text)" : "var(--muted)",
                    padding: "0 3px",
                  }}
                >
                  {day.getDate()}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0 4px 4px" }}>
                {items.slice(0, 3).map((ev) => (
                  <div
                    key={key(ev)}
                    onClick={(e) => {
                      e.stopPropagation();
                      openOccurrenceEditor(ev);
                    }}
                    onDoubleClick={(e) => e.stopPropagation()}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "1px 5px",
                      borderRadius: 5,
                      fontSize: 11.5,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      background: ev.all_day ? ev.color : "transparent",
                      color: ev.all_day ? "#fff" : "var(--text)",
                    }}
                  >
                    {!ev.all_day && (
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: ev.color, flex: "none" }} />
                    )}
                    {!ev.all_day && (
                      <span style={{ fontFamily: "var(--meta-font)", fontSize: 10, color: "var(--muted)" }}>
                        {occStart(ev).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{ev.summary}</span>
                  </div>
                ))}
                {items.length > 3 && (
                  <div style={{ fontFamily: "var(--meta-font)", fontSize: 10, color: "var(--muted)", padding: "1px 4px" }}>
                    +{items.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

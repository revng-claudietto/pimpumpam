import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type EnrichedEvent, useStore } from "../../state/store";
import { mondayDayName, timeLabel } from "../../utils/date";
import { occEnd, occStart } from "../../utils/occurrences";
import { fromRRule, summarize } from "../../utils/rrule";

// Fixed row height lets us virtualize: only the rows in view are rendered, so a
// calendar with thousands of events stays cheap to scroll and key through.
const ROW_H = 56;
const OVERSCAN = 8;

const headCell: CSSProperties = {
  fontFamily: "var(--meta-font)",
  fontSize: 10,
  fontWeight: 600,
  color: "var(--muted)",
  textTransform: "var(--label-transform)" as CSSProperties["textTransform"],
  letterSpacing: "var(--label-spacing)",
};

function dateLabel(d: Date): string {
  return `${mondayDayName(d)} ${d.getDate()} ${d.toLocaleString(undefined, { month: "short" })} ${d.getFullYear()}`;
}

export function EventsListView() {
  const { allEvents, eventSearch, openEventDrawer } = useStore();
  const q = eventSearch.trim().toLowerCase();

  const rows = useMemo(() => {
    const match = (e: EnrichedEvent): boolean => {
      if (!q) return true;
      const hay = [
        e.summary,
        e.location ?? "",
        e.description ?? "",
        e.calendarName,
        ...(e.attendees ?? []).map((a) => `${a.name ?? ""} ${a.email}`),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    };
    return allEvents.filter(match).sort((a, b) => occStart(a).getTime() - occStart(b).getTime());
  }, [allEvents, q]);

  const now = Date.now();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(800);
  const [sel, setSel] = useState(-1);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewportH(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setSel((s) => (s >= rows.length ? rows.length - 1 : s));
  }, [rows.length]);

  const open = (e: EnrichedEvent) =>
    openEventDrawer({ mode: "edit", calendarId: e.calendarId, uid: e.uid, fullEvent: e });

  const scrollToIndex = (i: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const top = i * ROW_H;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_H - el.clientHeight;
  };

  const move = (d: number) =>
    setSel((s) => {
      const n = s < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, s + d));
      scrollToIndex(n);
      return n;
    });

  if (rows.length === 0) {
    return (
      <div data-testid="events-empty" style={{ padding: 60, textAlign: "center", color: "var(--muted)", fontSize: 14, width: "100%" }}>
        {allEvents.length === 0 ? "No events." : "No events match your search."}
      </div>
    );
  }

  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((scrollTop + viewportH) / ROW_H) + OVERSCAN);
  const visible: EnrichedEvent[] = [];
  for (let i = first; i < last; i++) visible.push(rows[i]);

  return (
    <div style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center", padding: "8px 16px", borderBottom: "1px solid var(--border)", background: "var(--surface-2)", flex: "none" }}>
        <span style={{ width: 10, flex: "none" }} />
        <div style={{ width: 150, flex: "none", ...headCell }}>Date</div>
        <div style={{ flex: 1, ...headCell }}>Event</div>
        <div style={{ width: 128, flex: "none", ...headCell }}>Time</div>
      </div>

      <div
        ref={scrollRef}
        data-testid="events-list"
        tabIndex={0}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            move(1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            move(-1);
          } else if (e.key === "Enter" && sel >= 0) {
            e.preventDefault();
            open(rows[sel]);
          }
        }}
        style={{ flex: 1, overflow: "auto", outline: "none", minHeight: 0 }}
      >
        <div style={{ height: rows.length * ROW_H, position: "relative" }}>
          {visible.map((e, k) => {
            const i = first + k;
            const selected = i === sel;
            const start = occStart(e);
            const past = occEnd(e).getTime() < now;
            const recur = e.rrule ? summarize(fromRRule(e.rrule)) : null;
            const sub = [e.calendarName, e.location].filter(Boolean).join(" · ");
            return (
              <div
                key={`${e.calendarId}:${e.uid}`}
                data-testid={`event-row-${e.uid}`}
                onClick={() => setSel(i)}
                onDoubleClick={() => open(e)}
                style={{ position: "absolute", top: i * ROW_H, left: 0, right: 0, height: ROW_H, boxSizing: "border-box", display: "flex", gap: 14, alignItems: "center", padding: "0 16px", borderBottom: "1px solid var(--grid)", borderLeft: `3px solid ${selected ? "var(--accent)" : "transparent"}`, background: selected ? "var(--accent-soft)" : "transparent", cursor: "pointer", opacity: past ? 0.55 : 1 }}
              >
                <span style={{ width: 10, height: 10, borderRadius: 3, background: e.color, flex: "none" }} />
                <div style={{ width: 150, flex: "none", fontFamily: "var(--meta-font)", fontSize: 12.5, color: "var(--muted)", whiteSpace: "nowrap" }}>
                  {dateLabel(start)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {e.summary || "(untitled)"}
                    </span>
                    {recur && (
                      <span title={recur} style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: 4, padding: "1px 7px", borderRadius: 999, background: "var(--accent-soft)", color: "var(--accent)", fontFamily: "var(--meta-font)", fontSize: 10, fontWeight: 600 }}>
                        ↻ {recur}
                      </span>
                    )}
                  </div>
                  {sub && (
                    <div style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 1 }}>
                      {sub}
                    </div>
                  )}
                </div>
                <div style={{ width: 128, flex: "none", fontFamily: "var(--meta-font)", fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
                  {e.all_day ? "All day" : `${timeLabel(start)} – ${timeLabel(occEnd(e))}`}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

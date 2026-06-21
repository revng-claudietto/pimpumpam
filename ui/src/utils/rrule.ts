// A small model for the recurrence builder, plus conversion to/from an RFC 5545
// RRULE string (the backend's `rrule` field).

export type Freq = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export type EndType = "never" | "count" | "until";

export const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

export interface Recurrence {
  freq: Freq;
  interval: number;
  byday: string[];
  bymonthday: number | null;
  endType: EndType;
  count: number | null;
  until: string | null; // YYYY-MM-DD
}

export function emptyRecurrence(): Recurrence {
  return {
    freq: "NONE",
    interval: 1,
    byday: [],
    bymonthday: null,
    endType: "never",
    count: null,
    until: null,
  };
}

export function toRRule(r: Recurrence): string | null {
  if (r.freq === "NONE") return null;
  const parts = [`FREQ=${r.freq}`];
  if (r.interval > 1) parts.push(`INTERVAL=${r.interval}`);
  if (r.freq === "WEEKLY" && r.byday.length) parts.push(`BYDAY=${r.byday.join(",")}`);
  if (r.freq === "MONTHLY" && r.bymonthday)
    parts.push(`BYMONTHDAY=${r.bymonthday}`);
  if (r.endType === "count" && r.count) parts.push(`COUNT=${r.count}`);
  if (r.endType === "until" && r.until)
    parts.push(`UNTIL=${r.until.replace(/-/g, "")}T000000Z`);
  return parts.join(";");
}

export function fromRRule(rule: string | null | undefined): Recurrence {
  const r = emptyRecurrence();
  if (!rule) return r;
  for (const part of rule.split(";")) {
    const [k, v] = part.split("=");
    if (!v) continue;
    switch (k.toUpperCase()) {
      case "FREQ":
        r.freq = v.toUpperCase() as Freq;
        break;
      case "INTERVAL":
        r.interval = Math.max(1, parseInt(v, 10) || 1);
        break;
      case "BYDAY":
        r.byday = v.split(",").map((x) => x.toUpperCase());
        break;
      case "BYMONTHDAY":
        r.bymonthday = parseInt(v, 10) || null;
        break;
      case "COUNT":
        r.count = parseInt(v, 10) || null;
        r.endType = "count";
        break;
      case "UNTIL":
        r.until = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
        r.endType = "until";
        break;
    }
  }
  return r;
}

export function summarize(r: Recurrence): string {
  if (r.freq === "NONE") return "Does not repeat";
  const unit = { DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" }[
    r.freq
  ];
  let s = r.interval > 1 ? `Every ${r.interval} ${unit}s` : `Every ${unit}`;
  if (r.freq === "WEEKLY" && r.byday.length) s += ` on ${r.byday.join(", ")}`;
  if (r.freq === "MONTHLY" && r.bymonthday) s += ` on day ${r.bymonthday}`;
  if (r.endType === "count" && r.count) s += `, ${r.count} times`;
  if (r.endType === "until" && r.until) s += `, until ${r.until}`;
  return s;
}

export function unitLabel(freq: Freq, interval: number): string {
  const base = { NONE: "", DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" }[
    freq
  ];
  return interval > 1 ? `${base}s` : base;
}

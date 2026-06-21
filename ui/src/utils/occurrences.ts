import type { EnrichedOccurrence } from "../state/store";
import { sameDay, startOfDay } from "./date";

// Minimal shape shared by occurrences and master events for date math.
export interface TimeSpan {
  start: string | null;
  end: string | null;
  all_day: boolean;
}

export function occStart(o: TimeSpan): Date {
  if (!o.start) return new Date(NaN);
  if (o.all_day) {
    const [y, m, d] = o.start.slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(o.start);
}

export function occEnd(o: TimeSpan): Date {
  const start = occStart(o);
  if (!o.end) return new Date(start.getTime() + (o.all_day ? 86400000 : 3600000));
  if (o.all_day) {
    const [y, m, d] = o.end.slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(o.end);
}

export function onDay(o: EnrichedOccurrence, day: Date): boolean {
  const start = occStart(o);
  if (o.all_day) {
    const d0 = startOfDay(start).getTime();
    const d1 = startOfDay(occEnd(o)).getTime();
    const dd = startOfDay(day).getTime();
    return dd >= d0 && dd < Math.max(d1, d0 + 86400000);
  }
  return sameDay(start, day);
}

export function eventsForDay(
  list: EnrichedOccurrence[],
  day: Date,
): EnrichedOccurrence[] {
  return list
    .filter((o) => onDay(o, day))
    .sort((a, b) => occStart(a).getTime() - occStart(b).getTime());
}

export function key(o: EnrichedOccurrence): string {
  return `${o.calendarId}:${o.uid}:${o.recurrence_id ?? o.start ?? ""}`;
}

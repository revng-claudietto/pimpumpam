// Desktop notifications for event alarms (VALARM).
//
// Periodically scans the next 24h of occurrences across enabled calendars and
// schedules a Notification at each alarm time. Works in the browser and inside
// Electron (the renderer's Web Notification API).

import { api } from "./api/client";
import type { Occurrence } from "./api/types";
import { useStore } from "./state/store";

const scheduled = new Set<string>();
const timers: number[] = [];

// Parse an ISO 8601 duration ("-PT15M", "-P1D") to a millisecond offset
// (negative = before the event start).
export function triggerToMs(trigger: string): number {
  const m = trigger.match(
    /^([+-]?)P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/,
  );
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  const [, , d, h, mi, s] = m;
  const seconds = +(d || 0) * 86400 + +(h || 0) * 3600 + +(mi || 0) * 60 + +(s || 0);
  return sign * seconds * 1000;
}

function notifySupported(): boolean {
  return typeof Notification !== "undefined";
}

async function scan(): Promise<void> {
  if (!notifySupported() || Notification.permission !== "granted") return;
  const { accountId, calendars, enabledCalendars } = useStore.getState();
  if (!accountId) return;

  const now = new Date();
  const end = new Date(now.getTime() + 24 * 3600 * 1000);
  const active = calendars.filter((c) => enabledCalendars.includes(c.id));
  const lists = await Promise.all(
    active.map((c) =>
      api
        .listOccurrences(accountId, c.id, now.toISOString(), end.toISOString())
        .catch(() => [] as Occurrence[]),
    ),
  );

  for (const occ of lists.flat()) {
    if (!occ.start || !occ.alarms?.length) continue;
    const start = new Date(occ.start).getTime();
    for (const alarm of occ.alarms) {
      const fireAt = start + triggerToMs(alarm.trigger);
      if (fireAt < Date.now() || fireAt > end.getTime()) continue;
      const k = `${occ.uid}:${occ.recurrence_id ?? occ.start}:${alarm.trigger}`;
      if (scheduled.has(k)) continue;
      scheduled.add(k);
      const id = window.setTimeout(
        () => {
          new Notification(occ.summary || "Event", {
            body: alarm.description || occ.location || "",
          });
        },
        Math.max(0, fireAt - Date.now()),
      );
      timers.push(id);
    }
  }
}

export function startNotifications(): () => void {
  if (notifySupported() && Notification.permission === "default") {
    void Notification.requestPermission();
  }
  void scan();
  const interval = window.setInterval(() => void scan(), 5 * 60 * 1000);
  return () => {
    window.clearInterval(interval);
    timers.forEach((t) => clearTimeout(t));
  };
}

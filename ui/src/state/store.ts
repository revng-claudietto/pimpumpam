import { create } from "zustand";
import { api, ApiError } from "../api/client";
import type {
  Account,
  AddressBook,
  Alarm,
  Calendar,
  Contact,
  ContactInput,
  EventInput,
  EventOut,
  Occurrence,
} from "../api/types";
import { applyTheme, colorForId, type Direction, type Theme } from "../theme";
import { addDays, addMonths, startOfDay, startOfMonth, startOfWeek } from "../utils/date";

export type Tab = "calendar" | "contacts";
export type CalView = "month" | "week" | "day" | "agenda" | "list";

export interface EnrichedOccurrence extends Occurrence {
  calendarId: string;
  color: string;
}

export interface EnrichedEvent extends EventOut {
  calendarId: string;
  color: string;
  calendarName: string;
}

export interface EventDrawerCtx {
  mode: "create" | "edit";
  calendarId: string;
  uid?: string;
  seedStart?: string; // local input value for a new event
  allDay?: boolean;
  // When editing one instance of a recurring series:
  recurrenceId?: string;
  // The full master event (from the Events list), so the drawer renders the
  // form instantly instead of waiting on a round-trip to refetch it.
  fullEvent?: EventOut;
  seed?: {
    summary: string;
    start: string | null;
    end: string | null;
    all_day: boolean;
    location: string | null;
    alarms: Alarm[];
  };
}

export interface EnrichedContact extends Contact {
  book: string;
}

export interface ContactDrawerCtx {
  mode: "create" | "edit";
  book: string;
  uid?: string;
}

// Fetch each enabled collection in parallel and flatten; a failed collection
// contributes nothing rather than failing the whole load.
async function gatherEnabled<C, R>(
  active: C[],
  perItem: (c: C) => Promise<R[]>,
): Promise<R[]> {
  const lists = await Promise.all(
    active.map((c) => perItem(c).catch(() => [] as R[])),
  );
  return lists.flat();
}

function calendarColors(calendars: Calendar[]): Map<string, string> {
  return new Map(calendars.map((c) => [c.id, c.color ?? colorForId(c.id)]));
}

function visibleRange(
  view: CalView,
  cursor: Date,
  weeksCount: number,
): [Date, Date] {
  if (view === "month") {
    const s = startOfWeek(startOfMonth(cursor));
    return [s, addDays(s, 42)];
  }
  if (view === "week") {
    const s = startOfWeek(cursor);
    return [s, addDays(s, 7)];
  }
  if (view === "day") {
    const s = startOfDay(cursor);
    return [s, addDays(s, 1)];
  }
  const s = startOfWeek(cursor);
  return [s, addDays(s, weeksCount * 7)];
}

const LS = {
  theme: "pimpumpam.theme",
  direction: "pimpumpam.direction",
  account: "pimpumpam.account",
  tab: "pimpumpam.tab",
  view: "pimpumpam.view",
};

function readPref<T extends string>(key: string, fallback: T): T {
  return (localStorage.getItem(key) as T | null) ?? fallback;
}

interface State {
  // preferences
  theme: Theme;
  direction: Direction;
  tab: Tab;
  helpOpen: boolean;

  // data
  accounts: Account[];
  accountId: string | null;
  calendars: Calendar[];
  addressbooks: AddressBook[];
  enabledCalendars: string[];
  enabledBooks: string[];

  // calendar view
  view: CalView;
  cursor: Date;
  focusDay: Date; // keyboard-navigated day in the grid views
  weeksCount: number;
  occurrences: EnrichedOccurrence[];
  occLoading: boolean;
  allEvents: EnrichedEvent[];
  eventSearch: string;

  // contacts
  contacts: EnrichedContact[];
  contactSearch: string;
  selected: { book: string; uid: string } | null;

  // drawer
  drawerKind: "event" | "contact" | null;
  eventCtx: EventDrawerCtx | null;
  contactCtx: ContactDrawerCtx | null;

  // status
  loading: boolean;
  error: string | null;

  // actions
  init: () => Promise<void>;
  toggleTheme: () => void;
  setDirection: (d: Direction) => void;
  setTab: (t: Tab) => void;
  setHelp: (open: boolean) => void;
  setAccount: (id: string) => Promise<void>;
  addAccount: (input: {
    server: string;
    username: string;
    password: string;
  }) => Promise<void>;
  loadAccounts: () => Promise<void>;
  loadCollections: () => Promise<void>;
  toggleCalendar: (id: string) => void;
  toggleBook: (id: string) => void;
  createCalendar: (displayName: string, color: string) => Promise<void>;
  updateCalendar: (id: string, displayName: string, color: string) => Promise<void>;
  deleteCalendar: (id: string) => Promise<void>;
  createBook: (displayName: string) => Promise<void>;

  // calendar actions
  setView: (v: CalView) => void;
  goToday: () => void;
  goPrev: () => void;
  goNext: () => void;
  moveFocus: (deltaDays: number) => void;
  setFocusDay: (d: Date) => void;
  setWeeksCount: (n: number) => void;
  loadOccurrences: () => Promise<void>;
  loadAllEvents: () => Promise<void>;
  setEventSearch: (q: string) => void;

  // drawer actions
  openEventDrawer: (ctx: EventDrawerCtx) => void;
  openOccurrenceEditor: (ev: EnrichedOccurrence) => void;
  closeDrawer: () => void;
  saveEvent: (
    calendarId: string,
    input: EventInput,
    uid?: string,
    ifMatch?: string,
  ) => Promise<void>;
  deleteEvent: (calendarId: string, uid: string) => Promise<void>;
  overrideOccurrence: (
    calendarId: string,
    uid: string,
    recurrenceId: string,
    input: EventInput,
  ) => Promise<void>;
  cancelOccurrence: (
    calendarId: string,
    uid: string,
    recurrenceId: string,
  ) => Promise<void>;

  // contacts actions
  loadContacts: () => Promise<void>;
  setContactSearch: (q: string) => void;
  selectContact: (book: string, uid: string) => void;
  openContactDrawer: (ctx: ContactDrawerCtx) => void;
  saveContact: (
    book: string,
    input: ContactInput,
    uid?: string,
    ifMatch?: string,
  ) => Promise<void>;
  deleteContact: (book: string, uid: string) => Promise<void>;
}

export const useStore = create<State>((set, get) => ({
  theme: readPref<Theme>(LS.theme, "dark"),
  direction: readPref<Direction>(LS.direction, "calm"),
  tab: readPref<Tab>(LS.tab, "calendar"),
  helpOpen: false,

  accounts: [],
  accountId: null,
  calendars: [],
  addressbooks: [],
  enabledCalendars: [],
  enabledBooks: [],

  view: readPref<CalView>(LS.view, "week"),
  cursor: startOfDay(new Date()),
  focusDay: startOfDay(new Date()),
  weeksCount: 4,
  occurrences: [],
  occLoading: false,
  allEvents: [],
  eventSearch: "",

  contacts: [],
  contactSearch: "",
  selected: null,

  drawerKind: null,
  eventCtx: null,
  contactCtx: null,

  loading: false,
  error: null,

  init: async () => {
    applyTheme(get().theme, get().direction);
    await get().loadAccounts();
  },

  toggleTheme: () => {
    const theme: Theme = get().theme === "dark" ? "light" : "dark";
    localStorage.setItem(LS.theme, theme);
    applyTheme(theme, get().direction);
    set({ theme });
  },

  setDirection: (direction) => {
    localStorage.setItem(LS.direction, direction);
    applyTheme(get().theme, direction);
    set({ direction });
  },

  setTab: (tab) => {
    localStorage.setItem(LS.tab, tab);
    set({ tab });
  },
  setHelp: (helpOpen) => set({ helpOpen }),

  loadAccounts: async () => {
    set({ loading: true, error: null });
    try {
      const accounts = await api.listAccounts();
      const stored = localStorage.getItem(LS.account);
      const accountId =
        accounts.find((a) => a.id === stored)?.id ?? accounts[0]?.id ?? null;
      set({ accounts, accountId });
      if (accountId) await get().loadCollections();
    } catch (e) {
      set({ error: errMessage(e) });
    } finally {
      set({ loading: false });
    }
  },

  setAccount: async (id) => {
    localStorage.setItem(LS.account, id);
    set({ accountId: id });
    await get().loadCollections();
  },

  addAccount: async (input) => {
    set({ loading: true, error: null });
    try {
      const account = await api.createAccount(input);
      localStorage.setItem(LS.account, account.id);
      set((s) => ({ accounts: [...s.accounts, account], accountId: account.id }));
      await get().loadCollections();
    } catch (e) {
      set({ error: errMessage(e) });
      throw e;
    } finally {
      set({ loading: false });
    }
  },

  loadCollections: async () => {
    const account = get().accountId;
    if (!account) return;
    set({ loading: true, error: null });
    try {
      const [calendars, addressbooks] = await Promise.all([
        api.listCalendars(account),
        api.listAddressBooks(account),
      ]);
      set({
        calendars,
        addressbooks,
        enabledCalendars: calendars.map((c) => c.id),
        enabledBooks: addressbooks.map((b) => b.id),
      });
      // Warm the events list and contacts in the background so those tabs are
      // already populated when opened (the events REPORT is the slow part).
      void get().loadAllEvents();
      void get().loadContacts();
    } catch (e) {
      set({ error: errMessage(e) });
    } finally {
      set({ loading: false });
    }
  },

  toggleCalendar: (id) =>
    set((s) => ({ enabledCalendars: toggle(s.enabledCalendars, id) })),
  toggleBook: (id) => set((s) => ({ enabledBooks: toggle(s.enabledBooks, id) })),

  createCalendar: async (displayName, color) => {
    const account = get().accountId;
    if (!account) return;
    try {
      await api.createCalendar(account, {
        display_name: displayName,
        components: ["VEVENT", "VTODO"],
        color,
      });
      await get().loadCollections();
    } catch (e) {
      set({ error: errMessage(e) });
      throw e;
    }
  },

  updateCalendar: async (id, displayName, color) => {
    const account = get().accountId;
    if (!account) return;
    try {
      await api.updateCalendar(account, id, { display_name: displayName, color });
      await get().loadCollections();
    } catch (e) {
      set({ error: errMessage(e) });
      throw e;
    }
  },

  deleteCalendar: async (id) => {
    const account = get().accountId;
    if (!account) return;
    try {
      await api.deleteCalendar(account, id);
      await get().loadCollections();
    } catch (e) {
      set({ error: errMessage(e) });
      throw e;
    }
  },

  createBook: async (displayName) => {
    const account = get().accountId;
    if (!account) return;
    try {
      await api.createAddressBook(account, displayName);
      await get().loadCollections();
    } catch (e) {
      set({ error: errMessage(e) });
      throw e;
    }
  },

  setView: (view) => {
    localStorage.setItem(LS.view, view);
    set({ view });
  },
  goToday: () => set({ cursor: startOfDay(new Date()), focusDay: startOfDay(new Date()) }),
  setWeeksCount: (n) => set({ weeksCount: Math.max(1, Math.min(12, n)) }),
  goPrev: () => set((s) => ({ cursor: shiftCursor(s.view, s.cursor, s.weeksCount, -1) })),
  goNext: () => set((s) => ({ cursor: shiftCursor(s.view, s.cursor, s.weeksCount, 1) })),

  // Move the keyboard-focused day; rolls the visible period when it crosses the
  // edge (e.g. ArrowDown on the last week of the month shows the next month).
  moveFocus: (deltaDays) =>
    set((s) => {
      const focusDay = addDays(s.focusDay, deltaDays);
      let cursor = s.cursor;
      if (s.view === "month") {
        if (focusDay.getMonth() !== s.cursor.getMonth() || focusDay.getFullYear() !== s.cursor.getFullYear())
          cursor = startOfMonth(focusDay);
      } else if (s.view === "week" || s.view === "day") {
        cursor = focusDay;
      }
      return { focusDay, cursor };
    }),

  setFocusDay: (d) => set({ focusDay: startOfDay(d) }),

  loadOccurrences: async () => {
    const { accountId, calendars, enabledCalendars, view, cursor, weeksCount } = get();
    if (!accountId) return;
    const active = calendars.filter((c) => enabledCalendars.includes(c.id));
    const colors = calendarColors(calendars);
    const [start, end] = visibleRange(view, cursor, weeksCount);
    set({ occLoading: true });
    try {
      const occurrences = await gatherEnabled(active, (c) =>
        api
          .listOccurrences(accountId, c.id, start.toISOString(), end.toISOString())
          .then((occ) =>
            occ.map((o) => ({ ...o, calendarId: c.id, color: colors.get(c.id)! })),
          ),
      );
      set({ occurrences });
    } finally {
      set({ occLoading: false });
    }
  },

  loadAllEvents: async () => {
    const { accountId, calendars, enabledCalendars } = get();
    if (!accountId) return;
    const active = calendars.filter((c) => enabledCalendars.includes(c.id));
    const colors = calendarColors(calendars);
    const allEvents = await gatherEnabled(active, (c) =>
      api.listEvents(accountId, c.id).then((events) =>
        events.map((e) => ({
          ...e,
          calendarId: c.id,
          color: colors.get(c.id)!,
          calendarName: c.display_name ?? c.id,
        })),
      ),
    );
    set({ allEvents });
  },

  setEventSearch: (eventSearch) => set({ eventSearch }),

  openEventDrawer: (eventCtx) => set({ drawerKind: "event", eventCtx }),

  // Open the editor for a calendar/agenda occurrence, attaching the full master
  // event from the preloaded list so the drawer renders instantly (no refetch).
  openOccurrenceEditor: (ev) => {
    const fullEvent = get().allEvents.find(
      (e) => e.calendarId === ev.calendarId && e.uid === ev.uid,
    );
    set({
      drawerKind: "event",
      eventCtx: {
        mode: "edit",
        calendarId: ev.calendarId,
        uid: ev.uid,
        recurrenceId: ev.recurrence_id ?? undefined,
        fullEvent,
        seed: {
          summary: ev.summary ?? "",
          start: ev.start,
          end: ev.end,
          all_day: ev.all_day,
          location: ev.location,
          alarms: ev.alarms,
        },
      },
    });
  },

  closeDrawer: () => set({ drawerKind: null, eventCtx: null, contactCtx: null }),

  saveEvent: async (calendarId, input, uid, ifMatch) => {
    const account = get().accountId;
    if (!account) return;
    if (uid) await api.updateEvent(account, calendarId, uid, input, ifMatch);
    else await api.createEvent(account, calendarId, input);
    await get().loadOccurrences();
  },

  deleteEvent: async (calendarId, uid) => {
    const account = get().accountId;
    if (!account) return;
    await api.deleteEvent(account, calendarId, uid);
    await get().loadOccurrences();
  },

  overrideOccurrence: async (calendarId, uid, recurrenceId, input) => {
    const account = get().accountId;
    if (!account) return;
    await api.overrideOccurrence(account, calendarId, uid, recurrenceId, input);
    await get().loadOccurrences();
  },

  cancelOccurrence: async (calendarId, uid, recurrenceId) => {
    const account = get().accountId;
    if (!account) return;
    await api.cancelOccurrence(account, calendarId, uid, recurrenceId);
    await get().loadOccurrences();
  },

  loadContacts: async () => {
    const { accountId, addressbooks, enabledBooks } = get();
    if (!accountId) return;
    const active = addressbooks.filter((b) => enabledBooks.includes(b.id));
    const contacts = (
      await gatherEnabled(active, (b) =>
        api.listContacts(accountId, b.id).then((cs) => cs.map((c) => ({ ...c, book: b.id }))),
      )
    ).sort((a, b) => a.full_name.localeCompare(b.full_name));
    set((s) => ({
      contacts,
      selected:
        s.selected && contacts.some((c) => c.uid === s.selected!.uid)
          ? s.selected
          : contacts[0]
            ? { book: contacts[0].book, uid: contacts[0].uid }
            : null,
    }));
  },

  setContactSearch: (contactSearch) => set({ contactSearch }),
  selectContact: (book, uid) => set({ selected: { book, uid } }),
  openContactDrawer: (contactCtx) => set({ drawerKind: "contact", contactCtx }),

  saveContact: async (book, input, uid, ifMatch) => {
    const account = get().accountId;
    if (!account) return;
    if (uid) await api.updateContact(account, book, uid, input, ifMatch);
    else await api.createContact(account, book, input);
    await get().loadContacts();
  },

  deleteContact: async (book, uid) => {
    const account = get().accountId;
    if (!account) return;
    await api.deleteContact(account, book, uid);
    set({ selected: null });
    await get().loadContacts();
  },
}));

function shiftCursor(
  view: CalView,
  cursor: Date,
  weeksCount: number,
  dir: number,
): Date {
  if (view === "month") return addMonths(cursor, dir);
  if (view === "week") return addDays(cursor, 7 * dir);
  if (view === "day") return addDays(cursor, dir);
  return addDays(cursor, weeksCount * 7 * dir);
}

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function errMessage(e: unknown): string {
  if (e instanceof ApiError) return e.detail;
  if (e instanceof Error) return e.message;
  return String(e);
}

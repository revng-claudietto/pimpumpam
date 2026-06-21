// Typed client for the pimpumpam REST API.
//
// One configurable base URL is the single seam between dev (Vite proxy →
// same-origin), production (FastAPI serves the build), and Electron (the
// spawned Python API origin).

import type {
  Account,
  AccountCreate,
  AddressBook,
  Calendar,
  CalendarCreate,
  CalendarUpdate,
  Contact,
  ContactInput,
  EventInput,
  EventOut,
  Occurrence,
  Todo,
} from "./types";

const BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`${status}: ${detail}`);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | undefined>;
  /** Capture the response ETag into this object's `etag` field. */
  etagInto?: { etag?: string };
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = new URL(BASE + path, window.location.origin);
  for (const [key, value] of Object.entries(opts.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  const response = await fetch(url.toString(), {
    method: opts.method ?? "GET",
    headers: {
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (opts.etagInto) {
    const etag = response.headers.get("ETag");
    if (etag) opts.etagInto.etag = etag;
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    const detail =
      (data && typeof data === "object" && "detail" in data
        ? String((data as { detail: unknown }).detail)
        : undefined) ?? response.statusText;
    throw new ApiError(response.status, detail);
  }
  return data as T;
}

const enc = encodeURIComponent;

export const api = {
  health: () => request<{ status: string }>("/health"),

  // -- accounts --
  listAccounts: () => request<Account[]>("/accounts"),
  createAccount: (body: AccountCreate) =>
    request<Account>("/accounts", { method: "POST", body }),
  deleteAccount: (id: string) =>
    request<void>(`/accounts/${enc(id)}`, { method: "DELETE" }),

  // -- calendars --
  listCalendars: (account: string) =>
    request<Calendar[]>(`/accounts/${enc(account)}/calendars`),
  createCalendar: (account: string, body: CalendarCreate) =>
    request<Calendar>(`/accounts/${enc(account)}/calendars`, {
      method: "POST",
      body,
    }),
  updateCalendar: (account: string, id: string, body: CalendarUpdate) =>
    request<Calendar>(`/accounts/${enc(account)}/calendars/${enc(id)}`, {
      method: "PATCH",
      body,
    }),
  deleteCalendar: (account: string, id: string) =>
    request<void>(`/accounts/${enc(account)}/calendars/${enc(id)}`, {
      method: "DELETE",
    }),

  // -- events --
  listOccurrences: (account: string, cal: string, start: string, end: string) =>
    request<Occurrence[]>(
      `/accounts/${enc(account)}/calendars/${enc(cal)}/events`,
      { query: { start, end } },
    ),
  listEvents: (account: string, cal: string) =>
    request<EventOut[]>(
      `/accounts/${enc(account)}/calendars/${enc(cal)}/events/all`,
    ),
  getEvent: (
    account: string,
    cal: string,
    uid: string,
    etagInto?: { etag?: string },
  ) =>
    request<EventOut>(
      `/accounts/${enc(account)}/calendars/${enc(cal)}/events/${enc(uid)}`,
      { etagInto },
    ),
  createEvent: (account: string, cal: string, body: EventInput) =>
    request<EventOut>(
      `/accounts/${enc(account)}/calendars/${enc(cal)}/events`,
      { method: "POST", body },
    ),
  updateEvent: (
    account: string,
    cal: string,
    uid: string,
    body: EventInput,
    ifMatch?: string,
  ) =>
    request<EventOut>(
      `/accounts/${enc(account)}/calendars/${enc(cal)}/events/${enc(uid)}`,
      { method: "PUT", body, headers: ifMatch ? { "If-Match": ifMatch } : {} },
    ),
  deleteEvent: (account: string, cal: string, uid: string, ifMatch?: string) =>
    request<void>(
      `/accounts/${enc(account)}/calendars/${enc(cal)}/events/${enc(uid)}`,
      { method: "DELETE", headers: ifMatch ? { "If-Match": ifMatch } : {} },
    ),
  cancelOccurrence: (account: string, cal: string, uid: string, rid: string) =>
    request<void>(
      `/accounts/${enc(account)}/calendars/${enc(cal)}/events/${enc(uid)}/occurrences/${enc(rid)}`,
      { method: "DELETE" },
    ),
  overrideOccurrence: (
    account: string,
    cal: string,
    uid: string,
    rid: string,
    body: EventInput,
  ) =>
    request<Occurrence>(
      `/accounts/${enc(account)}/calendars/${enc(cal)}/events/${enc(uid)}/occurrences/${enc(rid)}`,
      { method: "PUT", body },
    ),

  // -- todos --
  listTodos: (account: string, cal: string, includeCompleted = false) =>
    request<Todo[]>(`/accounts/${enc(account)}/calendars/${enc(cal)}/todos`, {
      query: { include_completed: String(includeCompleted) },
    }),

  // -- address books --
  listAddressBooks: (account: string) =>
    request<AddressBook[]>(`/accounts/${enc(account)}/addressbooks`),
  createAddressBook: (account: string, display_name: string) =>
    request<AddressBook>(`/accounts/${enc(account)}/addressbooks`, {
      method: "POST",
      body: { display_name },
    }),
  deleteAddressBook: (account: string, id: string) =>
    request<void>(`/accounts/${enc(account)}/addressbooks/${enc(id)}`, {
      method: "DELETE",
    }),

  // -- contacts --
  listContacts: (account: string, book: string) =>
    request<Contact[]>(
      `/accounts/${enc(account)}/addressbooks/${enc(book)}/contacts`,
    ),
  getContact: (
    account: string,
    book: string,
    uid: string,
    etagInto?: { etag?: string },
  ) =>
    request<Contact>(
      `/accounts/${enc(account)}/addressbooks/${enc(book)}/contacts/${enc(uid)}`,
      { etagInto },
    ),
  createContact: (account: string, book: string, body: ContactInput) =>
    request<Contact>(
      `/accounts/${enc(account)}/addressbooks/${enc(book)}/contacts`,
      { method: "POST", body },
    ),
  updateContact: (
    account: string,
    book: string,
    uid: string,
    body: ContactInput,
    ifMatch?: string,
  ) =>
    request<Contact>(
      `/accounts/${enc(account)}/addressbooks/${enc(book)}/contacts/${enc(uid)}`,
      { method: "PUT", body, headers: ifMatch ? { "If-Match": ifMatch } : {} },
    ),
  deleteContact: (account: string, book: string, uid: string) =>
    request<void>(
      `/accounts/${enc(account)}/addressbooks/${enc(book)}/contacts/${enc(uid)}`,
      { method: "DELETE" },
    ),
};

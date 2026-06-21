# pimpumpam

A **REST application that is itself a full CalDAV + CardDAV client** (`pimpumpam`),
plus a **React desktop UI** on top of it. The backend talks DAV to
upstream servers and exposes a clean, normalized JSON API — no iCalendar or vCard
ever crosses the wire; the UI talks only to that JSON API.

## Architecture

```
Electron / browser
   └─ React UI (ui/)
        └─ HTTP/JSON ─► FastAPI (async, src/pimpumpam)
                          ├─► CalDAV  (caldav AsyncDAVClient)  ─► upstream servers
                          └─► CardDAV (httpx async client)     ─► (Radicale, Xandikos, iCloud, …)
```

The backend can also **serve the built UI** at `/`, so the whole app runs as one
origin (and one process inside Electron).

- **FastAPI**, fully async. Every upstream session is created, used, and closed
  inside the same request task, so all `await`s run on uvicorn's **single event
  loop** — no DAV client ever spawns or binds to a second loop. SQLite is the
  only blocking I/O and is offloaded to a worker thread.
- **CalDAV** uses the [`caldav`](https://pypi.org/project/caldav/) library's
  `AsyncDAVClient`, plus `icalendar` + `recurring-ical-events`.
- **CardDAV** — `caldav` has no CardDAV support, so it is implemented directly on
  `httpx` (PROPFIND / REPORT / MKCOL / PUT / GET / DELETE) with `vobject` for the
  vCard payloads. The DAV layer is shallow; this is a few hundred lines.

## Design decisions

| Area | Choice |
|------|--------|
| API shape | **Normalized JSON only.** iCalendar/vCard are never exposed. Properties the models don't cover are dropped on round-trip. |
| Accounts | **Persistent multi-account registry** in SQLite. Credentials are stored as-is — they must be replayed to the upstream server, so they can't be hashed; keep the DB file private. |
| Recurrence | The calendar-view listing (`GET …/events?start&end`) returns **expanded occurrences**. The single-event resource (`…/events/{uid}`) exposes the `rrule` so a series can be **created and edited**. A single instance can be **modified or cancelled** via the `occurrences/{recurrence_id}` sub-resource (RECURRENCE-ID override / EXDATE). |
| Concurrency | Single-object reads return an **`ETag`** header; `PUT`/`DELETE` honour **`If-Match`** — a stale value yields `412`. Omit `If-Match` for last-write-wins. |
| Auth to upstream | Basic auth (works for Radicale/Nextcloud/Fastmail/iCloud app-passwords). OAuth2 (Google) is not wired up. |

## API

```
POST   /accounts                                    register a backend account
GET    /accounts                                     list accounts (no passwords)
GET    /accounts/{id}
DELETE /accounts/{id}

GET    /accounts/{id}/calendars
POST   /accounts/{id}/calendars
DELETE /accounts/{id}/calendars/{cal}

GET    /accounts/{id}/calendars/{cal}/events?start=&end=   expanded occurrences
POST   /accounts/{id}/calendars/{cal}/events              create (accepts rrule)
GET    /accounts/{id}/calendars/{cal}/events/{uid}
PUT    /accounts/{id}/calendars/{cal}/events/{uid}                (ETag / If-Match)
DELETE /accounts/{id}/calendars/{cal}/events/{uid}                (If-Match)
PUT    /accounts/{id}/calendars/{cal}/events/{uid}/occurrences/{recurrence_id}  override one instance
DELETE /accounts/{id}/calendars/{cal}/events/{uid}/occurrences/{recurrence_id}  cancel one instance

GET    /accounts/{id}/calendars/{cal}/todos?include_completed=
POST   /accounts/{id}/calendars/{cal}/todos
GET|PUT|DELETE /accounts/{id}/calendars/{cal}/todos/{uid}

GET    /accounts/{id}/addressbooks
POST   /accounts/{id}/addressbooks
DELETE /accounts/{id}/addressbooks/{ab}

GET    /accounts/{id}/addressbooks/{ab}/contacts
POST   /accounts/{id}/addressbooks/{ab}/contacts
GET|PUT|DELETE /accounts/{id}/addressbooks/{ab}/contacts/{uid}
```

Interactive docs at `/docs` once running.

## Running

```bash
uv run pimpumpam            # serves on 127.0.0.1:8000
# or
uv run uvicorn pimpumpam.app:app --reload
```

Configuration (env, prefix `PIMPUMPAM_`): `DB_PATH`, `REQUEST_TIMEOUT`, `HOST`,
`PORT`.

## Frontend (`ui/`, React + Vite + TS)

A faithful build of the *pimpumpam* design: calendar (Month/Week/Day/Agenda),
event drawer with a recurrence builder and attendees, contacts list/detail and a
contact drawer, live iCal/vCard previews, light/dark × Calm/Sharp theming, and a
help overlay. The API client has a single configurable base URL — the seam shared
by dev (Vite proxy), production (FastAPI serves the build), and Electron.

The Node/pnpm toolchain comes from the flake (`nix develop`). The UI is built by
a **nixpkgs pnpm derivation** — never a manual `pnpm build`.

```bash
nix develop -c bash -c 'cd ui && pnpm dev'   # live-reload dev (proxies the API to :8000)
```

Event **reminders (VALARM)** round-trip through the API, and the UI schedules a
**desktop notification** at each alarm time (Web Notifications, works in Electron
too). A recurring event can be edited per-instance: the drawer offers **"This
event" vs "All events"** (RECURRENCE-ID override / EXDATE under the hood).

## Desktop (Electron)

`electron/main.js` spawns the bundled Python backend, waits for `/health`, then
opens a window onto it — the API and UI ship as one app.

- `nix run .#desktop` runs it directly (backend + UI via nix).
- `nix build .#desktop` produces `result/bin/pimpumpam-desktop`: a single
  executable that boots the backend (which serves the UI) and opens the window —
  the whole app from one nix derivation.

```bash
nix build .#desktop
./result/bin/pimpumpam-desktop
```

## Tests

- **Backend:** spins up real **Radicale** *and* **Xandikos** as subprocesses
  (pure Python, **no Docker**); every DAV test runs against both, so interop
  differences are exercised (e.g. Radicale rotates ETags per write, Xandikos uses
  a content-hash ETag — the client handles both).
- **End-to-end:** Playwright drives a real Chromium (from nixpkgs, pinned to
  match) against the full stack (UI + backend + Radicale), covering connect →
  calendar → recurring event → single-instance edit → reminder → contacts.
- **Recorded:** `nix build .#e2e-videos` runs the E2E entirely in the sandbox and
  outputs `.webm` recordings to `./result/`.

```bash
uv run pytest                                    # backend, 71 tests, both servers
nix develop -c bash -c 'cd ui && pnpm e2e'       # Playwright end-to-end
nix build .#e2e-videos && ls result/             # recorded run -> *.webm
```

## Nix

```bash
nix run .#ui           # ▶ backend + built UI on one URL (prints it)  ← start here
nix run .#desktop      # the Electron desktop app (backend bundled)
nix run               #  the REST API alone
nix build .#ui         # the built frontend (dist) as a derivation
nix build .#server     # the API venv (-> result/bin/pimpumpam)
nix build .#e2e-videos # run the E2E in-sandbox, emit video recordings
nix develop            # dev shell: uv + node + pnpm + locked deps
```

The Python side is built with **uv2nix** (reads `pyproject.toml` + `uv.lock`,
prefers wheels); the frontend with the **nixpkgs pnpm** infrastructure
(`fetchPnpmDeps` + `pnpmConfigHook`).

## Known limitations / next steps

- No OAuth2 — Google CalDAV/CardDAV would need a token flow added to the account model.
- Sync-tokens (RFC 6578) are not exposed; listings are live queries.
- Todos do not yet expose ETags (events and contacts do).
- Desktop packaging is the `.#desktop` nix derivation (Linux); no standalone
  installers (AppImage/`.dmg`/`.exe`) are produced yet.

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { useStore, type EnrichedContact } from "../state/store";
import { COLOR_PALETTE } from "../theme";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return COLOR_PALETTE[Math.abs(h) % COLOR_PALETTE.length];
}

function avatar(seed: string, size: number): CSSProperties {
  return {
    width: size,
    height: size,
    flex: "none",
    borderRadius: "50%",
    background: avatarColor(seed),
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: size * 0.4,
  };
}

const labelMeta: CSSProperties = {
  width: 120,
  flex: "none",
  fontFamily: "var(--meta-font)",
  fontSize: 11,
  color: "var(--muted)",
  textTransform: "var(--label-transform)" as CSSProperties["textTransform"],
  letterSpacing: "var(--label-spacing)",
  paddingTop: 2,
};

function sub(c: EnrichedContact): string {
  return c.organization ?? c.emails[0]?.value ?? "";
}

export function ContactsView() {
  const {
    accountId, enabledBooks, addressbooks, contacts, contactSearch, setContactSearch,
    selected, selectContact, loadContacts, openContactDrawer, deleteContact,
  } = useStore();

  useEffect(() => {
    void loadContacts();
  }, [enabledBooks, accountId, loadContacts]);

  const defaultBook = addressbooks.find((b) => enabledBooks.includes(b.id))?.id;
  const q = contactSearch.toLowerCase();
  const list = contacts.filter(
    (c) =>
      !q ||
      c.full_name.toLowerCase().includes(q) ||
      (c.organization ?? "").toLowerCase().includes(q) ||
      c.emails.some((e) => e.value.toLowerCase().includes(q)),
  );
  const current = selected ? contacts.find((c) => c.uid === selected.uid && c.book === selected.book) : undefined;

  const selIndex = list.findIndex((c) => c.uid === selected?.uid && c.book === selected?.book);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selected) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-testid="contact-${selected.uid}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <div data-testid="contacts-view" style={{ display: "flex", height: "100%", minHeight: 0, width: "100%" }}>
      <div className="contact-list" style={{ width: 296, flex: "none", borderRight: "1px solid var(--border)", background: "var(--surface)", display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ padding: "11px 12px", display: "flex", gap: 8, borderBottom: "1px solid var(--border)" }}>
          <input
            data-testid="contact-search"
            value={contactSearch}
            onChange={(e) => setContactSearch(e.target.value)}
            placeholder="Search contacts…"
            style={{ flex: 1, minWidth: 0, padding: "8px 11px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-2)", fontSize: 13 }}
          />
          <button
            data-testid="new-contact"
            disabled={!defaultBook}
            onClick={() => defaultBook && openContactDrawer({ mode: "create", book: defaultBook })}
            title="New contact"
            style={{ width: 36, flex: "none", borderRadius: "var(--radius-sm)", background: "var(--accent)", color: "#fff", fontSize: 18, lineHeight: 1, opacity: defaultBook ? 1 : 0.5 }}
          >
            +
          </button>
        </div>
        <div
          ref={listRef}
          tabIndex={0}
          data-testid="contact-list-items"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              const c = list[selIndex < 0 ? 0 : Math.min(list.length - 1, selIndex + 1)];
              if (c) selectContact(c.book, c.uid);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              const c = list[selIndex < 0 ? 0 : Math.max(0, selIndex - 1)];
              if (c) selectContact(c.book, c.uid);
            } else if (e.key === "Enter" && current) {
              e.preventDefault();
              openContactDrawer({ mode: "edit", book: current.book, uid: current.uid });
            }
          }}
          style={{ flex: 1, overflow: "auto", padding: "6px 8px", outline: "none" }}
        >
          {list.map((c) => {
            const active = selected?.uid === c.uid && selected?.book === c.book;
            return (
              <div
                key={`${c.book}:${c.uid}`}
                data-testid={`contact-${c.uid}`}
                onClick={() => selectContact(c.book, c.uid)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 9px", borderRadius: "var(--radius-sm)", cursor: "pointer", background: active ? "var(--accent-soft)" : "transparent" }}
              >
                <span style={avatar(c.full_name, 32)}>{initials(c.full_name)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.full_name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub(c)}</div>
                </div>
              </div>
            );
          })}
          {list.length === 0 && (
            <div style={{ padding: 14, color: "var(--muted)", fontSize: 12.5 }}>No contacts.</div>
          )}
        </div>
        <div style={{ padding: "9px 14px", borderTop: "1px solid var(--border)", fontFamily: "var(--meta-font)", fontSize: 10, color: "var(--muted)" }}>
          {list.length} contacts
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", minWidth: 0 }}>
        {current ? (
          <div data-testid="contact-detail" style={{ maxWidth: 680, margin: "0 auto", padding: "34px 34px 60px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 26 }}>
              <span style={avatar(current.full_name, 64)}>{initials(current.full_name)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}>{current.full_name}</div>
                <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 2 }}>
                  {[current.title, current.organization].filter(Boolean).join(" · ")}
                </div>
              </div>
              <button data-testid="contact-edit" onClick={() => openContactDrawer({ mode: "edit", book: current.book, uid: current.uid })} style={{ padding: "9px 16px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", fontSize: 13, fontWeight: 600 }}>
                Edit
              </button>
              <button data-testid="contact-delete" onClick={() => deleteContact(current.book, current.uid)} title="Delete" style={{ width: 38, height: 38, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "#dc4b3e", fontSize: 16 }}>
                🗑
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {field("Emails", current.emails.map((e) => `${e.value}${e.type ? `  (${e.type})` : ""}`).join("\n"))}
              {field("Phones", current.phones.map((p) => `${p.value}${p.type ? `  (${p.type})` : ""}`).join("\n"))}
              {current.note && field("Note", current.note)}
              {current.birthday && field("Birthday", current.birthday)}
              {current.url && field("URL", current.url)}
            </div>

            <div style={{ marginTop: 22, border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
              <div style={{ padding: "9px 13px", background: "var(--surface-2)", fontFamily: "var(--meta-font)", fontSize: 10, color: "var(--muted)", textTransform: "var(--label-transform)" as CSSProperties["textTransform"], letterSpacing: "var(--label-spacing)", borderBottom: "1px solid var(--border)" }}>
                CardDAV metadata
              </div>
              <div style={{ padding: "12px 13px", fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--muted)", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                {`UID:  ${current.uid}\nBook: ${current.book}`}
              </div>
            </div>
          </div>
        ) : (
          <div data-testid="contact-empty" style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: 14 }}>
            Select a contact
          </div>
        )}
      </div>
    </div>
  );
}

function field(label: string, value: string) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 16, padding: "13px 4px", borderTop: "1px solid var(--border)" }}>
      <div style={labelMeta}>{label}</div>
      <div style={{ flex: 1, fontSize: 14, whiteSpace: "pre-wrap" }}>{value}</div>
    </div>
  );
}

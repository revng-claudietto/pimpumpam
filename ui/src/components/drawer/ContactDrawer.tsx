import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import type { ContactInput, TypedValue } from "../../api/types";
import { useStore } from "../../state/store";
import { buildContactVcard } from "../../utils/ics";
import { fieldLabel, ghostBtn, input as inputStyle, primaryBtn } from "../Modal";
import { seg, segGroup } from "../Topbar";
import { Drawer, titleInput } from "./Drawer";

interface CForm {
  full_name: string;
  organization: string;
  title: string;
  emails: TypedValue[];
  phones: TypedValue[];
  note: string;
  book: string;
}

const EMAIL_TYPES = ["work", "home", "other"];
const PHONE_TYPES = ["mobile", "work", "home"];

function emptyForm(book: string): CForm {
  return { full_name: "", organization: "", title: "", emails: [], phones: [], note: "", book };
}

export function ContactDrawer() {
  const { contactCtx, accountId, addressbooks, closeDrawer, saveContact, deleteContact, loadContacts } = useStore();
  const ctx = contactCtx!;
  const isEdit = ctx.mode === "edit";
  const [form, setForm] = useState<CForm | null>(null);
  const [etag, setEtag] = useState<string | undefined>(undefined);
  const [raw, setRaw] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!isEdit || !ctx.uid || !accountId) {
      setForm(emptyForm(ctx.book));
      return;
    }
    const holder: { etag?: string } = {};
    api.getContact(accountId, ctx.book, ctx.uid, holder).then((c) => {
      if (!alive) return;
      setEtag(holder.etag);
      setForm({
        full_name: c.full_name,
        organization: c.organization ?? "",
        title: c.title ?? "",
        emails: c.emails,
        phones: c.phones,
        note: c.note ?? "",
        book: ctx.book,
      });
    });
    return () => {
      alive = false;
    };
  }, [isEdit, ctx.uid, ctx.book, accountId]);

  const patch = (p: Partial<CForm>) => setForm((f) => (f ? { ...f, ...p } : f));

  const vcardPreview = useMemo(
    () => (form ? buildContactVcard(form) : ""),
    [form],
  );

  if (!form) {
    return (
      <Drawer title="Loading…" onClose={closeDrawer} testid="contact-drawer">
        <div style={{ color: "var(--muted)" }}>Loading…</div>
      </Drawer>
    );
  }

  const buildInput = (): ContactInput => ({
    full_name: form.full_name || "(no name)",
    organization: form.organization || null,
    title: form.title || null,
    emails: form.emails.filter((e) => e.value),
    phones: form.phones.filter((p) => p.value),
    note: form.note || null,
  });

  const onSave = async () => {
    setBusy(true);
    try {
      const body = buildInput();
      if (isEdit && ctx.uid && form.book !== ctx.book && accountId) {
        await api.createContact(accountId, form.book, { ...body, uid: ctx.uid });
        await api.deleteContact(accountId, ctx.book, ctx.uid);
        await loadContacts();
      } else {
        await saveContact(form.book, body, isEdit ? ctx.uid : undefined, etag);
      }
      closeDrawer();
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!ctx.uid) return;
    setBusy(true);
    try {
      await deleteContact(ctx.book, ctx.uid);
      closeDrawer();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      title={isEdit ? "Edit contact" : "New contact"}
      onClose={closeDrawer}
      testid="contact-drawer"
      headerExtra={
        <div style={segGroup}>
          <button onClick={() => setRaw(false)} style={seg(!raw)}>Form</button>
          <button onClick={() => setRaw(true)} style={seg(raw)}>Raw</button>
        </div>
      }
      footer={
        <>
          {isEdit && <button data-testid="contact-drawer-delete" onClick={onDelete} style={{ ...ghostBtn, color: "#dc4b3e" }}>Delete</button>}
          <div style={{ flex: 1 }} />
          <button onClick={closeDrawer} style={ghostBtn}>Cancel</button>
          <button data-testid="contact-save" onClick={onSave} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      {raw ? (
        <div>
          <div style={fieldLabel}>vCard (preview)</div>
          <textarea data-testid="contact-raw" readOnly value={vcardPreview} style={{ width: "100%", height: 420, padding: 13, border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--surface-2)", fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.65, resize: "vertical", whiteSpace: "pre" }} />
          <div style={{ marginTop: 8, fontFamily: "var(--meta-font)", fontSize: 10, color: "var(--muted)" }}>Generated live from the fields.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <input data-testid="contact-fullname" value={form.full_name} onChange={(e) => patch({ full_name: e.target.value })} placeholder="Full name" style={titleInput} />

          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={fieldLabel}>Organization</div>
              <input data-testid="contact-org" value={form.organization} onChange={(e) => patch({ organization: e.target.value })} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={fieldLabel}>Title</div>
              <input data-testid="contact-title" value={form.title} onChange={(e) => patch({ title: e.target.value })} style={inputStyle} />
            </div>
          </div>

          <TypedList label="Email" testid="email" types={EMAIL_TYPES} placeholder="name@example.com" items={form.emails} onChange={(emails) => patch({ emails })} />
          <TypedList label="Phone" testid="phone" types={PHONE_TYPES} placeholder="+1 555 000 0000" items={form.phones} onChange={(phones) => patch({ phones })} />

          <div>
            <div style={fieldLabel}>Address book</div>
            <select data-testid="contact-book" value={form.book} onChange={(e) => patch({ book: e.target.value })} style={{ ...inputStyle }}>
              {addressbooks.map((b) => (
                <option key={b.id} value={b.id}>{b.display_name ?? b.id}</option>
              ))}
            </select>
          </div>

          <div>
            <div style={fieldLabel}>Note</div>
            <textarea data-testid="contact-note" value={form.note} onChange={(e) => patch({ note: e.target.value })} style={{ ...inputStyle, height: 70, resize: "vertical" }} />
          </div>
        </div>
      )}
    </Drawer>
  );
}

function TypedList({
  label, testid, types, placeholder, items, onChange,
}: {
  label: string;
  testid: string;
  types: string[];
  placeholder: string;
  items: TypedValue[];
  onChange: (items: TypedValue[]) => void;
}) {
  const update = (i: number, patch: Partial<TypedValue>) =>
    onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  return (
    <div>
      <div style={fieldLabel}>{label}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: "flex", gap: 7 }}>
            <select value={it.type ?? types[0]} onChange={(e) => update(i, { type: e.target.value })} style={{ width: 92, flex: "none", padding: 8, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-2)", fontSize: 12 }}>
              {types.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input data-testid={`${testid}-value-${i}`} value={it.value} onChange={(e) => update(i, { value: e.target.value })} placeholder={placeholder} style={{ flex: 1, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-2)", fontSize: 13 }} />
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} style={{ width: 34, flex: "none", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--muted)", fontSize: 15 }}>×</button>
          </div>
        ))}
      </div>
      <button data-testid={`add-${testid}`} onClick={() => onChange([...items, { type: types[0], value: "" }])} style={{ marginTop: 7, fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>
        + Add {label.toLowerCase()}
      </button>
    </div>
  );
}

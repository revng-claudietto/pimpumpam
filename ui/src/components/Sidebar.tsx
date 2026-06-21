import type { CSSProperties } from "react";
import { useStore } from "../state/store";
import { colorForId } from "../theme";

const labelMeta: CSSProperties = {
  fontFamily: "var(--meta-font)",
  fontSize: 11,
  letterSpacing: "var(--label-spacing)",
  textTransform: "var(--label-transform)" as CSSProperties["textTransform"],
  color: "var(--muted)",
  fontWeight: 600,
};

function row(): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "8px 9px",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
  };
}

export function swatch(color: string): CSSProperties {
  return { width: 11, height: 11, borderRadius: 3, background: color, flex: "none" };
}

export function Sidebar({
  onNewCollection,
  onEditCalendar,
}: {
  onNewCollection: () => void;
  onEditCalendar: (id: string) => void;
}) {
  const {
    tab,
    calendars,
    addressbooks,
    enabledCalendars,
    enabledBooks,
    toggleCalendar,
    toggleBook,
  } = useStore();

  const isCalendar = tab === "calendar";
  const items = isCalendar
    ? calendars.map((c) => ({
        id: c.id,
        name: c.display_name ?? c.id,
        color: c.color ?? colorForId(c.id),
        meta: c.components.join(" · ") || "calendar",
        enabled: enabledCalendars.includes(c.id),
      }))
    : addressbooks.map((b) => ({
        id: b.id,
        name: b.display_name ?? b.id,
        color: colorForId(b.id),
        meta: "address book",
        enabled: enabledBooks.includes(b.id),
      }));
  const onToggle = isCalendar ? toggleCalendar : toggleBook;

  return (
    <div
      className="sidebar"
      style={{
        width: 238,
        flex: "none",
        borderRight: "1px solid var(--border)",
        background: "var(--surface)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <div
        style={{
          padding: "15px 14px 9px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={labelMeta}>{isCalendar ? "Calendars" : "Address books"}</span>
        <button
          data-testid="new-collection"
          onClick={onNewCollection}
          title="New"
          style={{
            width: 24,
            height: 24,
            borderRadius: "var(--radius-sm)",
            color: "var(--muted)",
            fontSize: 17,
            lineHeight: 1,
          }}
        >
          +
        </button>
      </div>

      <div style={{ overflow: "auto", padding: "0 8px 12px", flex: 1 }} data-testid="collection-list">
        {items.map((c) => (
          <label key={c.id} data-testid={`collection-${c.id}`} style={row()}>
            <input
              type="checkbox"
              checked={c.enabled}
              onChange={() => onToggle(c.id)}
            />
            <span style={swatch(c.color)} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {c.name}
              </div>
              <div
                style={{
                  fontFamily: "var(--meta-font)",
                  fontSize: 10,
                  color: "var(--muted)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {c.meta}
              </div>
            </div>
            {isCalendar && (
              <button
                data-testid={`edit-calendar-${c.id}`}
                title="Edit calendar"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onEditCalendar(c.id);
                }}
                className="row-edit"
                style={{
                  flex: "none",
                  width: 22,
                  height: 22,
                  borderRadius: "var(--radius-sm)",
                  color: "var(--muted)",
                  fontSize: 13,
                  lineHeight: 1,
                }}
              >
                ⋯
              </button>
            )}
          </label>
        ))}
        {items.length === 0 && (
          <div style={{ padding: 14, color: "var(--muted)", fontSize: 12.5 }}>
            {isCalendar ? "No calendars yet." : "No address books yet."}
          </div>
        )}
      </div>

      <div
        style={{
          padding: "11px 14px",
          borderTop: "1px solid var(--border)",
          fontFamily: "var(--meta-font)",
          fontSize: 10,
          color: "var(--muted)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22a565" }} />
        {items.length} {isCalendar ? "calendars" : "address books"}
      </div>
    </div>
  );
}

import { useState } from "react";
import { useStore } from "../state/store";
import { COLOR_PALETTE } from "../theme";
import { fieldLabel, ghostBtn, input, Modal, primaryBtn } from "./Modal";

export function CalendarEditModal({
  calendarId,
  onClose,
}: {
  calendarId: string;
  onClose: () => void;
}) {
  const { calendars, updateCalendar, deleteCalendar } = useStore();
  const cal = calendars.find((c) => c.id === calendarId);
  const [name, setName] = useState(cal?.display_name ?? "");
  const [color, setColor] = useState(cal?.color ?? COLOR_PALETTE[0]);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!cal) {
    onClose();
    return null;
  }

  const save = async () => {
    setBusy(true);
    try {
      await updateCalendar(cal.id, name, color);
      onClose();
    } catch {
      /* error surfaced via store */
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteCalendar(cal.id);
      onClose();
    } catch {
      /* error surfaced via store */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Edit calendar" onClose={onClose} testid="edit-calendar-modal">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div style={fieldLabel}>Name</div>
          <input
            data-testid="edit-calendar-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={cal.id}
            style={input}
            autoFocus
          />
        </div>
        <div>
          <div style={fieldLabel}>Color</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {COLOR_PALETTE.map((c) => (
              <button
                key={c}
                data-testid={`edit-color-${c}`}
                onClick={() => setColor(c)}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: c,
                  border:
                    c === color
                      ? "2px solid var(--text)"
                      : "2px solid transparent",
                }}
              />
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          {confirmDelete ? (
            <button
              data-testid="calendar-delete-confirm"
              onClick={remove}
              disabled={busy}
              style={{ ...ghostBtn, color: "#dc4b3e", borderColor: "#dc4b3e" }}
            >
              {busy ? "Deleting…" : "Confirm delete"}
            </button>
          ) : (
            <button
              data-testid="calendar-delete"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              style={{ ...ghostBtn, color: "#dc4b3e" }}
            >
              Delete
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={ghostBtn}>
            Cancel
          </button>
          <button
            data-testid="edit-calendar-save"
            onClick={save}
            disabled={busy || !name}
            style={{ ...primaryBtn, opacity: busy || !name ? 0.6 : 1 }}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

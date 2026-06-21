import { useState } from "react";
import { useStore } from "../state/store";
import { COLOR_PALETTE } from "../theme";
import { fieldLabel, ghostBtn, input, Modal, primaryBtn } from "./Modal";

export function NewCollectionModal({ onClose }: { onClose: () => void }) {
  const { tab, createCalendar, createBook } = useStore();
  const isCalendar = tab === "calendar";
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLOR_PALETTE[0]);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      if (isCalendar) await createCalendar(name, color);
      else await createBook(name);
      onClose();
    } catch {
      /* error surfaced via store */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={isCalendar ? "New calendar" : "New address book"}
      onClose={onClose}
      testid="new-collection-modal"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div style={fieldLabel}>Name</div>
          <input
            data-testid="collection-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isCalendar ? "Work" : "Friends"}
            style={input}
            autoFocus
          />
        </div>
        {isCalendar && (
          <div>
            <div style={fieldLabel}>Color</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  data-testid={`color-${c}`}
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
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 9 }}>
          <button onClick={onClose} style={ghostBtn}>
            Cancel
          </button>
          <button
            data-testid="collection-save"
            onClick={save}
            disabled={busy || !name}
            style={{ ...primaryBtn, opacity: busy || !name ? 0.6 : 1 }}
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

import { Modal } from "./Modal";

const ROWS: { desc: string; keys: string }[] = [
  { desc: "Switch to Calendar / Contacts", keys: "1 / 2" },
  { desc: "Today", keys: "t" },
  { desc: "Previous / next period", keys: "← / →" },
  { desc: "Month / Week / Day / Agenda", keys: "m / w / d / a" },
  { desc: "New event / contact", keys: "n" },
  { desc: "Toggle theme", keys: "shift+d" },
  { desc: "Close drawer / modal", keys: "esc" },
  { desc: "Keyboard shortcuts", keys: "?" },
];

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} testid="help-modal">
      <div style={{ display: "flex", flexDirection: "column" }}>
        {ROWS.map((r) => (
          <div
            key={r.desc}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "8px 0",
              borderBottom: "1px solid var(--grid)",
            }}
          >
            <span style={{ fontSize: 13.5 }}>{r.desc}</span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11.5,
                color: "var(--muted)",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 5,
                padding: "3px 8px",
              }}
            >
              {r.keys}
            </span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

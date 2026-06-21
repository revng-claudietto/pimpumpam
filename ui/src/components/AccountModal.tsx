import { useState } from "react";
import { useStore } from "../state/store";
import { fieldLabel, ghostBtn, input, Modal, primaryBtn } from "./Modal";

export function AccountModal({ onClose }: { onClose: () => void }) {
  const { accounts, accountId, setAccount, addAccount, error } = useStore();
  const [server, setServer] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const connect = async () => {
    setBusy(true);
    try {
      await addAccount({ server, username, password });
      onClose();
    } catch {
      /* error surfaced via store */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Accounts" onClose={onClose} testid="account-modal">
      {accounts.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={fieldLabel}>Connected</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {accounts.map((a) => (
              <button
                key={a.id}
                data-testid={`account-option-${a.id}`}
                onClick={() => {
                  void setAccount(a.id);
                  onClose();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "9px 11px",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  background:
                    a.id === accountId ? "var(--accent-soft)" : "var(--surface-2)",
                  textAlign: "left",
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{a.username}</div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{a.server}</div>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={fieldLabel}>Add account</div>
        <input
          data-testid="account-server"
          value={server}
          onChange={(e) => setServer(e.target.value)}
          placeholder="https://dav.example.com/"
          style={input}
        />
        <input
          data-testid="account-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="username"
          style={input}
        />
        <input
          data-testid="account-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password / app-specific password"
          style={input}
        />
        {error && (
          <div data-testid="account-error" style={{ color: "#dc4b3e", fontSize: 12.5 }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 9 }}>
          <button onClick={onClose} style={ghostBtn}>
            Cancel
          </button>
          <button
            data-testid="account-connect"
            onClick={connect}
            disabled={busy || !server || !username}
            style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "Connecting…" : "Connect"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

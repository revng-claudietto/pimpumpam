import type { CSSProperties } from "react";
import { useStore } from "../state/store";

export function seg(active: boolean): CSSProperties {
  return {
    padding: "6px 12px",
    borderRadius: "var(--radius-sm)",
    fontSize: 12.5,
    fontWeight: 600,
    whiteSpace: "nowrap",
    background: active ? "var(--surface)" : "transparent",
    color: active ? "var(--text)" : "var(--muted)",
    border: active ? "1px solid var(--border)" : "1px solid transparent",
  };
}

export const segGroup: CSSProperties = {
  display: "flex",
  gap: 2,
  padding: 3,
  background: "var(--surface-2)",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
};

const iconBtn: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 1,
};

function hostOf(server: string | undefined): string {
  if (!server) return "No account";
  try {
    return new URL(server).host;
  } catch {
    return server;
  }
}

export function Topbar({ onAccount }: { onAccount: () => void }) {
  const {
    accounts,
    accountId,
    tab,
    setTab,
    direction,
    setDirection,
    theme,
    toggleTheme,
    setHelp,
  } = useStore();
  const account = accounts.find((a) => a.id === accountId);

  return (
    <div
      style={{
        height: 54,
        flex: "none",
        display: "flex",
        alignItems: "center",
        gap: 13,
        padding: "0 14px",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
        zIndex: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: "var(--radius-sm)",
            background: "var(--accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          ◆
        </div>
        <div style={{ fontWeight: 600, fontSize: 14, letterSpacing: "-0.01em" }}>
          pimpumpam
        </div>
      </div>

      <button
        data-testid="account-pill"
        onClick={onAccount}
        className="hide-sm"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "5px 11px",
          border: "1px solid var(--border)",
          borderRadius: 999,
          background: "var(--surface-2)",
          fontFamily: "var(--meta-font)",
          fontSize: 11.5,
          color: "var(--text)",
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: account ? "#22a565" : "var(--muted)",
            boxShadow: account ? "0 0 0 3px rgba(34,165,101,.18)" : "none",
          }}
        />
        {hostOf(account?.server)}
      </button>

      <div style={segGroup}>
        {(["calendar", "contacts"] as const).map((t) => (
          <button
            key={t}
            data-testid={`tab-${t}`}
            onClick={() => setTab(t)}
            style={seg(tab === t)}
          >
            {t === "calendar" ? "Calendar" : "Contacts"}
          </button>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      <div className="hide-sm" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontFamily: "var(--meta-font)",
            fontSize: 10,
            color: "var(--muted)",
            textTransform: "var(--label-transform)" as CSSProperties["textTransform"],
            letterSpacing: "var(--label-spacing)",
          }}
        >
          style
        </span>
        <div style={segGroup}>
          {(["calm", "sharp"] as const).map((d) => (
            <button
              key={d}
              data-testid={`dir-${d}`}
              onClick={() => setDirection(d)}
              style={seg(direction === d)}
            >
              {d === "calm" ? "Calm" : "Sharp"}
            </button>
          ))}
        </div>
      </div>

      <button
        data-testid="theme-toggle"
        onClick={toggleTheme}
        title="Toggle theme"
        style={{ ...iconBtn, fontSize: 15 }}
      >
        {theme === "dark" ? "☀" : "☾"}
      </button>
      <button
        data-testid="help-button"
        onClick={() => setHelp(true)}
        title="Keyboard shortcuts"
        style={{ ...iconBtn, fontSize: 13, fontWeight: 700 }}
      >
        ?
      </button>
    </div>
  );
}

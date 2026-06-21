import type { CSSProperties, ReactNode } from "react";

export function Modal({
  title,
  onClose,
  children,
  width = 440,
  testid,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  testid?: string;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        background: "var(--scrim)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        data-testid={testid}
        onClick={(e) => e.stopPropagation()}
        style={{
          width,
          maxWidth: "100%",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          boxShadow: "var(--shadow)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "16px 18px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700 }}>{title}</div>
          <button
            onClick={onClose}
            style={{ fontSize: 19, color: "var(--muted)", lineHeight: 1 }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: "16px 18px" }}>{children}</div>
      </div>
    </div>
  );
}

export const fieldLabel: CSSProperties = {
  fontFamily: "var(--meta-font)",
  fontSize: 10,
  color: "var(--muted)",
  textTransform: "var(--label-transform)" as CSSProperties["textTransform"],
  letterSpacing: "var(--label-spacing)",
  marginBottom: 6,
};

export const input: CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--surface-2)",
  fontSize: 13.5,
};

export const primaryBtn: CSSProperties = {
  padding: "9px 18px",
  borderRadius: "var(--radius-sm)",
  background: "var(--accent)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 700,
  boxShadow: "0 1px 2px rgba(47,111,237,.4)",
};

export const ghostBtn: CSSProperties = {
  padding: "9px 16px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--surface)",
  fontSize: 13,
  fontWeight: 600,
};

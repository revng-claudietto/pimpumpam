import type { CSSProperties, ReactNode } from "react";

export function Drawer({
  title,
  onClose,
  headerExtra,
  children,
  footer,
  testid,
}: {
  title: string;
  onClose: () => void;
  headerExtra?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  testid?: string;
}) {
  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "var(--scrim)", zIndex: 40 }}
      />
      <div
        className="drawer-panel"
        data-testid={testid}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: 460,
          maxWidth: "100%",
          background: "var(--surface)",
          borderLeft: "1px solid var(--border)",
          boxShadow: "var(--shadow)",
          zIndex: 41,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            height: 54,
            flex: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>{title}</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {headerExtra}
            <button
              data-testid="drawer-close"
              onClick={onClose}
              style={{ width: 32, height: 32, borderRadius: "var(--radius-sm)", fontSize: 19, color: "var(--muted)", lineHeight: 1 }}
            >
              ×
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "18px 16px" }}>{children}</div>
        {footer && (
          <div style={footerStyle}>{footer}</div>
        )}
      </div>
    </>
  );
}

const footerStyle: CSSProperties = {
  flex: "none",
  display: "flex",
  gap: 9,
  alignItems: "center",
  padding: "13px 16px",
  borderTop: "1px solid var(--border)",
};

export const titleInput: CSSProperties = {
  width: "100%",
  padding: "10px 0",
  border: "none",
  borderBottom: "2px solid var(--border)",
  background: "transparent",
  fontSize: 19,
  fontWeight: 600,
};

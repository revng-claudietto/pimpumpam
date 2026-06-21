// Theme tokens, mirrored from the pimpumpam design (light/dark × calm/sharp).

export type Theme = "light" | "dark";
export type Direction = "calm" | "sharp";

// Palette used to color calendars/address books that have no server color.
export const COLOR_PALETTE = [
  "#2f6fed",
  "#d4663a",
  "#22a565",
  "#7a5af0",
  "#c0397b",
  "#d99a1c",
  "#dc4b3e",
  "#1f8a5b",
  "#5a6acf",
];

export function colorForIndex(index: number): string {
  return COLOR_PALETTE[index % COLOR_PALETTE.length];
}

// Deterministic fallback color derived from the collection id, so a calendar
// without a server color keeps the same swatch regardless of fetch order
// (array-index fallbacks shift when the server returns calendars reordered).
export function colorForId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return COLOR_PALETTE[Math.abs(h) % COLOR_PALETTE.length];
}

export function themeVars(
  theme: Theme,
  direction: Direction,
): Record<string, string> {
  const dark = theme === "dark";
  const sharp = direction === "sharp";
  const p = dark
    ? {
        bg: "#0f1115",
        surface: "#171a1f",
        s2: "#1f242b",
        text: "#e7e9ec",
        muted: "#9aa1ab",
        border: "#272d35",
        bstrong: "#3a414b",
        grid: "#22272f",
        scrim: "rgba(0,0,0,.58)",
        accSoft: "rgba(78,142,255,.20)",
        today: "rgba(78,142,255,.13)",
      }
    : {
        bg: "#f3f4f6",
        surface: "#ffffff",
        s2: "#f3f4f7",
        text: "#1a1d22",
        muted: "#6b7280",
        border: "#e6e8ec",
        bstrong: "#d4d8df",
        grid: "#ededf1",
        scrim: "rgba(18,22,28,.40)",
        accSoft: "rgba(47,111,237,.10)",
        today: "rgba(47,111,237,.07)",
      };
  const acc = dark ? "#4e8eff" : "#2f6fed";
  return {
    "--bg": p.bg,
    "--surface": p.surface,
    "--surface-2": p.s2,
    "--text": p.text,
    "--muted": p.muted,
    "--border": p.border,
    "--border-strong": p.bstrong,
    "--grid": p.grid,
    "--scrim": p.scrim,
    "--accent": acc,
    "--accent-soft": p.accSoft,
    "--today": p.today,
    "--radius": sharp ? "3px" : "11px",
    "--radius-sm": sharp ? "2px" : "7px",
    "--font": '"Helvetica Neue", Helvetica, Arial, system-ui, sans-serif',
    "--font-mono":
      'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace',
    "--meta-font": sharp
      ? 'ui-monospace, "SF Mono", Menlo, monospace'
      : '"Helvetica Neue", Helvetica, Arial, sans-serif',
    "--label-transform": sharp ? "uppercase" : "none",
    "--label-spacing": sharp ? "0.05em" : "0",
    "--shadow": dark
      ? "0 1px 2px rgba(0,0,0,.5), 0 18px 44px rgba(0,0,0,.55)"
      : "0 1px 2px rgba(16,20,28,.06), 0 16px 42px rgba(16,20,28,.13)",
  };
}

export function applyTheme(theme: Theme, direction: Direction): void {
  const vars = themeVars(theme, direction);
  const root = document.documentElement;
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
}

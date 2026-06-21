import { type KeyboardEvent, useEffect, useRef, useState } from "react";

// Keyboard-navigable selection for a flat list rendered inside `containerRef`.
// Each navigable row must carry `data-nav-index={i}` so the active row can be
// scrolled into view. Single click selects (caller wires onClick -> setIndex);
// arrow keys move the selection; Enter activates the current row.
export function useListNav(count: number, onActivate: (i: number) => void) {
  const [index, setIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep the selection in range when the list shrinks (e.g. filtering).
  useEffect(() => {
    setIndex((i) => (i >= count ? count - 1 : i));
  }, [count]);

  useEffect(() => {
    if (index < 0) return;
    containerRef.current
      ?.querySelector<HTMLElement>(`[data-nav-index="${index}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => (i < 0 ? 0 : Math.min(count - 1, i + 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => (i < 0 ? 0 : Math.max(0, i - 1)));
    } else if (e.key === "Enter" && index >= 0) {
      e.preventDefault();
      onActivate(index);
    }
  };

  return { index, setIndex, onKeyDown, containerRef };
}

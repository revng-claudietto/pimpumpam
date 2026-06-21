import { useState } from "react";
import { fieldLabel } from "../Modal";
import {
  type Freq,
  type Recurrence,
  fromRRule,
  summarize,
  toRRule,
  unitLabel,
  WEEKDAYS,
} from "../../utils/rrule";

const FREQS: { id: Freq; label: string }[] = [
  { id: "NONE", label: "Does not repeat" },
  { id: "DAILY", label: "Daily" },
  { id: "WEEKLY", label: "Weekly" },
  { id: "MONTHLY", label: "Monthly" },
  { id: "YEARLY", label: "Yearly" },
];

const numInput = {
  width: 64,
  padding: "7px 9px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--surface)",
  fontSize: 13,
};

export function RecurrenceBuilder({
  value,
  onChange,
}: {
  value: Recurrence;
  onChange: (r: Recurrence) => void;
}) {
  const [rawMode, setRawMode] = useState(false);
  const [rawText, setRawText] = useState(toRRule(value) ?? "");
  const set = (patch: Partial<Recurrence>) => onChange({ ...value, ...patch });

  return (
    <div>
      <div style={fieldLabel}>Repeat</div>
      <select
        data-testid="recur-freq"
        value={value.freq}
        onChange={(e) => set({ freq: e.target.value as Freq })}
        style={{ width: "100%", padding: "9px 11px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-2)", fontSize: 13.5 }}
      >
        {FREQS.map((f) => (
          <option key={f.id} value={f.id}>{f.label}</option>
        ))}
      </select>

      {value.freq !== "NONE" && (
        <div style={{ marginTop: 9, display: "flex", flexDirection: "column", gap: 11, padding: 12, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-2)" }}>
          {!rawMode && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <span>Every</span>
                <input
                  type="number"
                  min={1}
                  data-testid="recur-interval"
                  value={value.interval}
                  onChange={(e) => set({ interval: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                  style={numInput}
                />
                <span>{unitLabel(value.freq, value.interval)}</span>
              </div>

              {value.freq === "WEEKLY" && (
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {WEEKDAYS.map((d) => {
                    const on = value.byday.includes(d);
                    return (
                      <button
                        key={d}
                        data-testid={`byday-${d}`}
                        onClick={() =>
                          set({ byday: on ? value.byday.filter((x) => x !== d) : [...value.byday, d] })
                        }
                        style={{
                          padding: "6px 9px",
                          borderRadius: "var(--radius-sm)",
                          fontSize: 12,
                          fontWeight: 600,
                          border: "1px solid var(--border)",
                          background: on ? "var(--accent)" : "var(--surface)",
                          color: on ? "#fff" : "var(--text)",
                        }}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              )}

              {value.freq === "MONTHLY" && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <span>On day</span>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    data-testid="recur-monthday"
                    value={value.bymonthday ?? ""}
                    onChange={(e) => set({ bymonthday: parseInt(e.target.value, 10) || null })}
                    style={numInput}
                  />
                  <span style={{ color: "var(--muted)" }}>of the month</span>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, flexWrap: "wrap" }}>
                <span style={{ color: "var(--muted)" }}>Ends</span>
                <select
                  data-testid="recur-end"
                  value={value.endType}
                  onChange={(e) => set({ endType: e.target.value as Recurrence["endType"] })}
                  style={{ padding: "7px 9px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", fontSize: 13 }}
                >
                  <option value="never">Never</option>
                  <option value="count">After…</option>
                  <option value="until">On date…</option>
                </select>
                {value.endType === "count" && (
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="number" min={1} value={value.count ?? ""} onChange={(e) => set({ count: parseInt(e.target.value, 10) || null })} style={{ ...numInput, width: 60 }} />
                    times
                  </span>
                )}
                {value.endType === "until" && (
                  <input type="date" value={value.until ?? ""} onChange={(e) => set({ until: e.target.value || null })} style={{ padding: "7px 9px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", fontFamily: "var(--meta-font)", fontSize: 13 }} />
                )}
              </div>
            </>
          )}

          {rawMode && (
            <textarea
              data-testid="recur-raw"
              value={rawText}
              onChange={(e) => {
                setRawText(e.target.value);
                onChange(fromRRule(e.target.value));
              }}
              placeholder="FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR"
              style={{ width: "100%", height: 66, padding: "9px 11px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", fontFamily: "var(--font-mono)", fontSize: 12, resize: "vertical" }}
            />
          )}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 9 }}>
            <code style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--muted)", wordBreak: "break-all" }}>
              {toRRule(value) ?? "—"}
            </code>
            <button
              onClick={() => {
                setRawText(toRRule(value) ?? "");
                setRawMode((m) => !m);
              }}
              style={{ flex: "none", fontSize: 11.5, color: "var(--accent)", fontWeight: 600, whiteSpace: "nowrap" }}
            >
              {rawMode ? "Use builder" : "Edit raw"}
            </button>
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>{summarize(value)}</div>
        </div>
      )}
    </div>
  );
}

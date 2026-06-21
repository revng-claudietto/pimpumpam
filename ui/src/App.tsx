import { useEffect, useState } from "react";
import { AccountModal } from "./components/AccountModal";
import { CalendarEditModal } from "./components/CalendarEditModal";
import { HelpModal } from "./components/HelpModal";
import { NewCollectionModal } from "./components/NewCollectionModal";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { ContactDrawer } from "./components/drawer/ContactDrawer";
import { EventDrawer } from "./components/drawer/EventDrawer";
import { startNotifications } from "./notifications";
import { useStore } from "./state/store";
import { CalendarView } from "./views/CalendarView";
import { ContactsView } from "./views/ContactsView";

type ModalKind = "account" | "new" | null;

function isTyping(el: EventTarget | null): boolean {
  const tag = (el as HTMLElement | null)?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function App() {
  const {
    init,
    tab,
    setTab,
    toggleTheme,
    accountId,
    helpOpen,
    setHelp,
    drawerKind,
    closeDrawer,
  } = useStore();
  const [modal, setModal] = useState<ModalKind>(null);
  const [editCalendar, setEditCalendar] = useState<string | null>(null);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => startNotifications(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape leaves edit/help/modal even from inside a field.
      if (e.key === "Escape") {
        setModal(null);
        setHelp(false);
        closeDrawer();
        return;
      }
      // Ctrl+PageUp/PageDown cycle the top-level tabs (works while typing too).
      if (e.ctrlKey && (e.key === "PageUp" || e.key === "PageDown")) {
        e.preventDefault();
        const order = ["calendar", "contacts"] as const;
        const i = order.indexOf(tab);
        setTab(order[(i + (e.key === "PageDown" ? 1 : order.length - 1)) % order.length]);
        return;
      }
      if (isTyping(e.target)) return;
      if (e.key === "?") return setHelp(true);
      if (e.key === "1") return setTab("calendar");
      if (e.key === "2") return setTab("contacts");
      if (e.key === "d" && e.shiftKey) return toggleTheme();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setTab, setHelp, toggleTheme, closeDrawer, tab]);

  return (
    <div
      data-testid="app"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: "var(--font)",
      }}
    >
      <Topbar onAccount={() => setModal("account")} />

      <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
        <Sidebar
          onNewCollection={() => setModal("new")}
          onEditCalendar={(id) => setEditCalendar(id)}
        />
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            minHeight: 0,
            background: "var(--bg)",
          }}
        >
          {!accountId ? (
            <div
              data-testid="no-account"
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 14,
                color: "var(--muted)",
              }}
            >
              <div style={{ fontSize: 15 }}>No account connected.</div>
              <button
                data-testid="connect-cta"
                onClick={() => setModal("account")}
                style={{
                  padding: "9px 18px",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--accent)",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                Connect a CalDAV / CardDAV server
              </button>
            </div>
          ) : tab === "calendar" ? (
            <CalendarView />
          ) : (
            <ContactsView />
          )}
        </div>

        {drawerKind === "event" && <EventDrawer />}
        {drawerKind === "contact" && <ContactDrawer />}
        {helpOpen && <HelpModal onClose={() => setHelp(false)} />}
        {modal === "account" && <AccountModal onClose={() => setModal(null)} />}
        {modal === "new" && <NewCollectionModal onClose={() => setModal(null)} />}
        {editCalendar && (
          <CalendarEditModal
            calendarId={editCalendar}
            onClose={() => setEditCalendar(null)}
          />
        )}
      </div>
    </div>
  );
}

import { expect, type Page, test } from "@playwright/test";

const RAD_PORT = process.env.E2E_RAD_PORT ?? "5232";
const RADICALE = `http://127.0.0.1:${RAD_PORT}/`;

// Set a React controlled input's value robustly: write via the native setter,
// bust React's internal value tracker, then dispatch a bubbling input event so
// onChange fires. (Plain fill()/typing does not reliably reach onChange in the
// fully-sandboxed chromium used by the e2e-videos derivation.)
async function type(page: Page, testid: string, value: string): Promise<void> {
  const el = page.getByTestId(testid);
  await el.click();
  await el.evaluate((node, val) => {
    const input = node as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
    setter?.call(input, val);
    (input as unknown as { _valueTracker?: { setValue(v: string): void } })._valueTracker?.setValue("");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
  await expect(el).toHaveValue(value);
}

test("connect, create a calendar + event, then a contact", async ({ page }) => {
  await page.goto("/");

  // No account yet.
  await expect(page.getByTestId("no-account")).toBeVisible();

  // Connect to the Radicale backend.
  await page.getByTestId("connect-cta").click();
  await type(page, "account-server", RADICALE);
  await type(page, "account-username", "testuser");
  await type(page, "account-password", "testpass");
  await page.getByTestId("account-connect").click();

  // The account pill now shows the host, and the calendar view is up.
  await expect(page.getByTestId("account-pill")).toContainText(`127.0.0.1:${RAD_PORT}`);
  await expect(page.getByTestId("calendar-view")).toBeVisible();

  // Create a calendar.
  await page.getByTestId("new-collection").click();
  await type(page, "collection-name", "Work");
  await page.getByTestId("color-#22a565").click();
  await page.getByTestId("collection-save").click();
  await expect(page.getByTestId("collection-list")).toContainText("Work");

  // Create a recurring event.
  await page.getByTestId("new-event").click();
  await type(page, "event-title", "Team Sync");
  await type(page, "event-location", "Room 2");
  await page.getByTestId("recur-freq").selectOption("WEEKLY");
  await page.getByTestId("byday-MO").click();
  await page.getByTestId("event-save").click();

  // The event shows up on the calendar (agenda view is unambiguous).
  await page.getByTestId("view-agenda").click();
  await expect(page.getByTestId("agenda-list")).toContainText("Team Sync");

  // Re-open it (double-click; single click only selects the row): it's
  // recurring, so the drawer offers This/All scope.
  await page.getByTestId("agenda-item").filter({ hasText: "Team Sync" }).first().dblclick();
  await expect(page.getByTestId("recur-scope")).toBeVisible();

  // "All events" shows the series; confirm the RRULE round-tripped.
  await page.getByTestId("scope-all").click();
  await expect(page.getByTestId("event-location")).toHaveValue("Room 2");
  await expect(page.getByTestId("recur-freq")).toHaveValue("WEEKLY");
  await page.getByTestId("drawer-raw-tab").click();
  await expect(page.getByTestId("event-raw")).toContainText("RRULE:FREQ=WEEKLY");

  // Edit just this one instance, and add a reminder (VALARM).
  await page.getByTestId("drawer-form-tab").click();
  await page.getByTestId("scope-this").click();
  await type(page, "event-title", "Team Sync 1x");
  await page.getByTestId("event-reminder").selectOption("-PT15M");
  await page.getByTestId("drawer-raw-tab").click();
  await expect(page.getByTestId("event-raw")).toContainText("TRIGGER:-PT15M");
  await page.getByTestId("drawer-form-tab").click();
  await page.getByTestId("event-save").click();

  // The overridden instance shows the new title; the series remains.
  await expect(page.getByTestId("agenda-list")).toContainText("Team Sync 1x");
  await expect(page.getByTestId("agenda-list")).toContainText("Team Sync");

  // Events view: a searchable flat list of (un-expanded) master events.
  await page.getByTestId("view-list").click();
  await expect(page.getByTestId("events-list")).toContainText("Team Sync");
  await type(page, "event-search", "room 2"); // matches by location
  await expect(page.getByTestId("events-list")).toContainText("Team Sync");
  await type(page, "event-search", "zzzznope");
  await expect(page.getByTestId("events-empty")).toBeVisible();
  await type(page, "event-search", "");

  // Switch to Contacts, create an address book + contact.
  await page.getByTestId("tab-contacts").click();
  await expect(page.getByTestId("contacts-view")).toBeVisible();

  await page.getByTestId("new-collection").click();
  await type(page, "collection-name", "People");
  await page.getByTestId("collection-save").click();
  await expect(page.getByTestId("collection-list")).toContainText("People");

  await page.getByTestId("new-contact").click();
  await type(page, "contact-fullname", "Ada Lovelace");
  await type(page, "contact-org", "Analytical Engines");
  await page.getByTestId("add-email").click();
  await type(page, "email-value-0", "ada@example.com");
  await page.getByTestId("contact-save").click();

  // It appears in the list and the detail pane.
  await expect(page.getByTestId("contact-list-items")).toContainText("Ada Lovelace");
  await page.getByText("Ada Lovelace").first().click();
  await expect(page.getByTestId("contact-detail")).toContainText("ada@example.com");
  await expect(page.getByTestId("contact-detail")).toContainText("Analytical Engines");
});

test("theme toggle updates the document tokens", async ({ page }) => {
  await page.goto("/");
  const bgBefore = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--bg"),
  );
  await page.getByTestId("theme-toggle").click();
  const bgAfter = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--bg"),
  );
  expect(bgAfter.trim()).not.toEqual(bgBefore.trim());
});

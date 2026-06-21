import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const UI_PORT = process.env.E2E_UI_PORT ?? "8099";

// How to launch the backend stack (Radicale + API serving the built UI).
// Overridable so the nix `e2e-videos` derivation can run it without uv.
const SERVER_CMD = process.env.E2E_SERVER_CMD ?? "uv run python ui/e2e/stack.py";
const SERVER_CWD = process.env.E2E_SERVER_CWD ?? repo;

// A larger viewport at 2× scale, with the video recorded at the full viewport
// size (Playwright otherwise downscales recordings to fit 800×800).
const VIEWPORT = { width: 1600, height: 1000 };

export default defineConfig({
  testDir: "./e2e",
  // Headroom for the one-time cold caldav discovery on first connect.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://127.0.0.1:${UI_PORT}`,
    headless: true,
    // No --disable-dev-shm-usage: /dev/shm is a real tmpfs (incl. the nix build
    // sandbox), so Chromium can use it directly.
    launchOptions: { args: ["--no-sandbox"] },
    trace: "retain-on-failure",
    viewport: VIEWPORT,
    // Record at full viewport resolution (no downscaling) when E2E_VIDEO is set.
    video: process.env.E2E_VIDEO
      ? { mode: "on", size: VIEWPORT }
      : "retain-on-failure",
  },
  webServer: {
    command: SERVER_CMD,
    cwd: SERVER_CWD,
    url: `http://127.0.0.1:${UI_PORT}/health`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: VIEWPORT, deviceScaleFactor: 2 },
    },
  ],
});

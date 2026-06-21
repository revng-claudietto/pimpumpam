// Electron main process: spawn the bundled Python REST backend (which also
// serves the built UI), wait for it, then open a window onto it.

const { app, BrowserWindow } = require("electron");
const { spawn } = require("node:child_process");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

const resource = (...p) => path.join(process.resourcesPath, ...p);

// Keep Chromium's sandbox ON. The renderer obtains its shared memory as an fd
// brokered from the (un-chrooted) browser process, which works even inside the
// sandbox's chroot-to-/proc/self/fdinfo. Passing --no-sandbox disables that
// broker, so the renderer instead tries to create shm by path inside the empty
// chroot — that open() fails with ESRCH and the renderer crashes to a blank
// page. The sandbox needs unprivileged user namespaces; on hosts where those
// are disabled, run the browser build (`nix run .#ui`) instead.
//
// Route shm to /tmp instead of /dev/shm so hosts with a tiny /dev/shm (the 64MB
// container default) don't run out; harmless on normal machines.
app.commandLine.appendSwitch("disable-dev-shm-usage");

let server = null;
const SMOKE = process.env.PIMPUMPAM_DESKTOP_SMOKE === "1";
if (SMOKE) app.commandLine.appendSwitch("disable-gpu");

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

function waitForHealth(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(
        { host: "127.0.0.1", port, path: "/health", timeout: 1000 },
        (res) => {
          res.resume();
          resolve();
        },
      );
      req.on("error", () => {
        if (Date.now() > deadline) reject(new Error("backend did not become healthy"));
        else setTimeout(tick, 200);
      });
      req.on("timeout", () => req.destroy());
    };
    tick();
  });
}

async function startBackend() {
  const port = process.env.PIMPUMPAM_PORT
    ? Number(process.env.PIMPUMPAM_PORT)
    : await freePort();

  // In a packaged build the backend binary and UI are bundled as resources;
  // in dev / nix the launcher sets these via env.
  const packaged = app.isPackaged;
  const exe = process.platform === "win32" ? "pimpumpam.exe" : "pimpumpam";
  const bin =
    process.env.PIMPUMPAM_SERVER_BIN || (packaged ? resource("backend", exe) : "pimpumpam");
  const staticDir =
    process.env.PIMPUMPAM_STATIC_DIR || (packaged ? resource("ui") : undefined);

  server = spawn(bin, [], {
    stdio: "inherit",
    env: {
      ...process.env,
      ...(staticDir ? { PIMPUMPAM_STATIC_DIR: staticDir } : {}),
      PIMPUMPAM_HOST: "127.0.0.1",
      PIMPUMPAM_PORT: String(port),
    },
  });
  server.on("exit", (code) => console.log(`[pimpumpam] backend exited (${code})`));
  await waitForHealth(port, 30000);
  return port;
}

async function createWindow(port) {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    backgroundColor: "#f3f4f6",
    webPreferences: { contextIsolation: true },
  });
  win.webContents.on("did-finish-load", () => {
    console.log(`[pimpumpam] window loaded http://127.0.0.1:${port}/`);
    if (SMOKE) setTimeout(() => app.quit(), 1500);
  });
  win.webContents.on("did-fail-load", (_e, code, desc) => {
    console.error(`[pimpumpam] load failed (${code}): ${desc}`);
    if (SMOKE) app.quit();
  });
  try {
    await win.loadURL(`http://127.0.0.1:${port}/`);
  } catch (err) {
    console.error("[pimpumpam] loadURL error", err);
    if (SMOKE) app.quit();
  }
}

app.whenReady().then(async () => {
  let port;
  try {
    port = await startBackend();
  } catch (err) {
    console.error("[pimpumpam]", err);
    app.quit();
    return;
  }
  await createWindow(port);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(port);
  });
});

app.on("window-all-closed", () => {
  if (server) server.kill();
  app.quit();
});

app.on("quit", () => {
  if (server) server.kill();
});

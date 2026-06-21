"""E2E stack launcher for Playwright.

Starts a Radicale server and the FastAPI backend (serving the built UI) so the
whole app can be driven through a browser. Run via ``uv run python``; kept in
the foreground (uvicorn) so Playwright can detect readiness on /health.
"""

from __future__ import annotations

import atexit
import os
import pathlib
import shlex
import signal
import subprocess
import sys
import tempfile
import time
import http.client

REPO = pathlib.Path(__file__).resolve().parents[2]
# The built UI to serve; overridable so a nix build can point at its dist output.
UI_DIST = pathlib.Path(os.environ.get("PIMPUMPAM_STATIC_DIR", str(REPO / "ui" / "dist")))
RAD_PORT = int(os.environ.get("E2E_RAD_PORT", "5232"))
UI_PORT = int(os.environ.get("E2E_UI_PORT", "8099"))


def wait(port: int, timeout: float = 30.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            conn = http.client.HTTPConnection("127.0.0.1", port, timeout=1)
            conn.request("GET", "/")
            conn.getresponse()
            conn.close()
            return
        except OSError:
            time.sleep(0.1)
    raise SystemExit(f"server on {port} did not start")


def main() -> None:
    if not UI_DIST.is_dir():
        raise SystemExit(f"built UI not found at {UI_DIST} (run `pnpm build` first)")

    tmp = tempfile.mkdtemp(prefix="pimpumpam-e2e-")
    users = os.path.join(tmp, "users")
    pathlib.Path(users).write_text("testuser:testpass\n")
    config = os.path.join(tmp, "config")
    pathlib.Path(config).write_text(
        f"""
[server]
hosts = 127.0.0.1:{RAD_PORT}
[auth]
type = htpasswd
htpasswd_filename = {users}
htpasswd_encryption = plain
[storage]
filesystem_folder = {os.path.join(tmp, "collections")}
[rights]
type = owner_only
[logging]
level = error
"""
    )

    # Radicale: a standalone binary (RADICALE_CMD) if provided, else this venv.
    radicale_cmd = os.environ.get("RADICALE_CMD")
    argv = (
        shlex.split(radicale_cmd) if radicale_cmd else [sys.executable, "-m", "radicale"]
    ) + ["--config", config]
    radicale = subprocess.Popen(
        argv, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )

    def cleanup() -> None:
        radicale.terminate()

    atexit.register(cleanup)
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    wait(RAD_PORT)

    env = {
        **os.environ,
        "PIMPUMPAM_STATIC_DIR": str(UI_DIST),
        "PIMPUMPAM_DB_PATH": os.path.join(tmp, "pimpumpam.db"),
    }
    uvicorn = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "pimpumpam.app:app", "--host", "127.0.0.1", "--port", str(UI_PORT)],
        env=env,
    )
    try:
        uvicorn.wait()
    finally:
        uvicorn.terminate()
        cleanup()


if __name__ == "__main__":
    main()

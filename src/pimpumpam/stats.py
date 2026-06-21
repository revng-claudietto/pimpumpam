"""Lightweight timing of upstream DAV requests, dumped at process exit.

Every CalDAV/CardDAV HTTP call funnels through one ``request`` method per client;
:func:`instrument` wraps it to record how long the upstream server took (the
elapsed wall time, recorded even when the call raises, e.g. a read timeout).
A summary is printed on shutdown so a slow server is easy to spot.
"""

from __future__ import annotations

import atexit
import sys
import threading
import time
from collections import defaultdict
from typing import Any, Awaitable, Callable, TextIO

_lock = threading.Lock()
_samples: dict[str, list[float]] = defaultdict(list)
_errors: dict[str, int] = defaultdict(int)
_registered = False
_dumped = False


def record(op: str, seconds: float, *, failed: bool = False) -> None:
    with _lock:
        _samples[op].append(seconds)
        if failed:
            _errors[op] += 1


def instrument(
    fn: Callable[..., Awaitable[Any]], prefix: str, method_index: int
) -> Callable[..., Awaitable[Any]]:
    """Wrap a client ``request(...)`` coroutine to time it, keyed by HTTP method.

    ``method_index`` is the positional index of the method argument (caldav:
    ``request(url, method, ...)`` -> 1; httpx: ``request(method, url, ...)`` -> 0).
    """

    async def wrapped(*args: Any, **kwargs: Any) -> Any:
        method = kwargs.get("method")
        if method is None and len(args) > method_index:
            method = args[method_index]
        op = f"{prefix}:{method or 'GET'}"
        t0 = time.perf_counter()
        failed = False
        try:
            return await fn(*args, **kwargs)
        except BaseException:
            failed = True
            raise
        finally:
            record(op, time.perf_counter() - t0, failed=failed)

    return wrapped


def _pct(vals: list[float], p: float) -> float:
    if not vals:
        return 0.0
    k = (len(vals) - 1) * p
    lo = int(k)
    hi = min(lo + 1, len(vals) - 1)
    return vals[lo] + (vals[hi] - vals[lo]) * (k - lo)


def dump(out: TextIO | None = None) -> None:
    global _dumped
    out = out or sys.stderr
    with _lock:
        if _dumped or not _samples:
            return
        _dumped = True
        rows = []
        for op, raw in sorted(_samples.items()):
            v = sorted(raw)
            rows.append(
                (op, len(v), _errors.get(op, 0), sum(v), v[0], _pct(v, 0.5), _pct(v, 0.95), v[-1])
            )
    print("\n=== upstream DAV request timing (seconds) ===", file=out)
    print(
        f"{'op':<18}{'n':>6}{'err':>5}{'total':>9}{'min':>8}{'p50':>8}{'p95':>8}{'max':>8}",
        file=out,
    )
    for op, n, err, total, mn, p50, p95, mx in rows:
        print(
            f"{op:<18}{n:>6}{err:>5}{total:>9.2f}{mn:>8.3f}{p50:>8.3f}{p95:>8.3f}{mx:>8.3f}",
            file=out,
        )
    print(
        f"{'TOTAL':<18}{sum(r[1] for r in rows):>6}{sum(r[2] for r in rows):>5}"
        f"{sum(r[3] for r in rows):>9.2f}",
        file=out,
    )
    print("=============================================", file=out)
    out.flush()


def register() -> None:
    """Arrange for :func:`dump` to run at interpreter exit (idempotent)."""
    global _registered
    with _lock:
        if _registered:
            return
        _registered = True
    atexit.register(dump)

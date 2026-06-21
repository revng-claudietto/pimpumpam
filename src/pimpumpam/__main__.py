"""Console entrypoint: ``python -m pimpumpam`` / ``pimpumpam``."""

from __future__ import annotations

import os


def main() -> None:
    import uvicorn

    uvicorn.run(
        "pimpumpam.app:app",
        host=os.environ.get("PIMPUMPAM_HOST", "127.0.0.1"),
        port=int(os.environ.get("PIMPUMPAM_PORT", "8000")),
        # A single worker → one process with one event loop, which all the
        # async DAV clients share.
        workers=1,
    )


if __name__ == "__main__":
    main()

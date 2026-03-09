import os
import sys

import requests


def main() -> int:
    url = os.environ.get("VERIFY_URL") or "http://127.0.0.1:8001/api/config"
    origin = os.environ.get("VERIFY_ORIGIN") or "http://aicodelab.cc:3000"
    r = requests.get(url, headers={"Origin": origin}, timeout=10)
    allow = (r.headers.get("access-control-allow-origin") or "").strip()
    if allow not in (origin, "*"):
        sys.stderr.write(f"cors_failed status={r.status_code} allow_origin={allow!r}\n")
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

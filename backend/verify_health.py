import os
import sys

import requests


def main() -> int:
    url = os.environ.get("VERIFY_URL") or "http://127.0.0.1:8000/health"
    r = requests.get(url, timeout=10)
    if r.status_code != 200:
        sys.stderr.write(f"health_failed status={r.status_code}\n")
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

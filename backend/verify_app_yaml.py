import os

import yaml


def main() -> int:
    p = os.path.join(os.path.dirname(__file__), "config", "app.yaml")
    with open(p, "r", encoding="utf-8") as f:
        yaml.safe_load(f)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

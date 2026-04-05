import json
import os
import sys
import urllib.error
import urllib.request


PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


def main() -> int:
    url = "http://127.0.0.1:8080/api/hardware/onpremise/assets?page_size=5"
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            body = resp.read().decode("utf-8", "replace")
            print("STATUS", resp.status)
            print(body)
            return 0
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        print("STATUS", exc.code)
        print(body)
        return 1
    except Exception as exc:
        print("EXC", type(exc).__name__, str(exc))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

import os
import sys
from typing import Any

import requests


def _head(text: str, n: int = 240) -> str:
    text = text or ""
    text = text.replace("\r\n", "\n").replace("\n", " ")
    return text[:n]


def _safe_headers(headers: Any) -> dict:
    # Avoid dumping large/irrelevant headers; focus on auth/cookie behavior.
    out = {}
    for k in ["Set-Cookie", "Location", "Content-Type"]:
        v = headers.get(k)
        if v:
            out[k] = v
    return out


def main() -> int:
    base = os.environ.get("BLOSSOM_BASE", "http://127.0.0.1:8080").rstrip("/")
    emp_no = os.environ.get("BLOSSOM_EMP_NO", "ADMIN")
    password = os.environ.get("BLOSSOM_PASSWORD", "Passw0rd")

    s = requests.Session()

    r0 = s.get(f"{base}/login", allow_redirects=True, timeout=10)
    print("GET /login", r0.status_code, "final_url", r0.url)

    r = s.post(
        f"{base}/login",
        data={"employee_id": emp_no, "password": password},
        allow_redirects=True,
        timeout=10,
    )

    print("POST /login final", r.status_code, "final_url", r.url)
    print("history", [h.status_code for h in r.history])
    print("history_urls", [h.headers.get("Location") for h in r.history])
    print("final_headers", _safe_headers(r.headers))
    print("cookies", s.cookies.get_dict())
    print("final_body_head", _head(r.text))

    probe = s.get(f"{base}/api/prj/projects?page=1&page_size=1", timeout=10)
    print("probe /api/prj/projects", probe.status_code, "headers", _safe_headers(probe.headers))
    print("probe_body_head", _head(probe.text))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

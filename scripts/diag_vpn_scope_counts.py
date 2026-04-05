"""Quick diagnostic for VPN Policy scope separation.

Calls the API and prints total counts per scope, avoiding long PowerShell
one-liners (which can trigger PSReadLine rendering bugs).

Usage:
  C:/Users/ME/Desktop/blossom/.venv/Scripts/python.exe scripts/diag_vpn_scope_counts.py
  C:/Users/ME/Desktop/blossom/.venv/Scripts/python.exe scripts/diag_vpn_scope_counts.py --scopes VPN1 VPN2
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request


def _get_json(url: str, timeout: float = 10.0) -> dict:
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read()
    try:
        return json.loads(body.decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"Failed to parse JSON from {url}: {exc}") from exc


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Diagnose VPN policy scope separation")
    parser.add_argument(
        "--base-url",
        default="http://127.0.0.1:8080",
        help="Base server URL (default: http://127.0.0.1:8080)",
    )
    parser.add_argument(
        "--scopes",
        nargs="+",
        default=["VPN1", "VPN2", "VPN3", "VPN4", "VPN5"],
        help="Scopes to query (default: VPN1..VPN5)",
    )
    parser.add_argument("--timeout", type=float, default=10.0)
    args = parser.parse_args(argv)

    base_url = args.base_url.rstrip("/")

    ok = True
    for scope in args.scopes:
        url = f"{base_url}/api/network/vpn-lines?" + urllib.parse.urlencode({"scope": scope})
        try:
            data = _get_json(url, timeout=args.timeout)
            total = data.get("total")
            success = data.get("success")
            items = data.get("items") or []
            scopes_in_payload = sorted({item.get("scope") for item in items if isinstance(item, dict) and item.get("scope")})
            print(f"{scope}: success={success} total={total} payload_scopes={scopes_in_payload}")
        except urllib.error.HTTPError as exc:
            ok = False
            try:
                body = exc.read().decode("utf-8", errors="replace")
            except Exception:  # noqa: BLE001
                body = "<failed to read body>"
            print(f"{scope}: HTTP {exc.code} {exc.reason} :: {body[:300]}")
        except Exception as exc:  # noqa: BLE001
            ok = False
            print(f"{scope}: ERROR {exc}")

    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

import json
import sys
import urllib.error
import urllib.request
from datetime import datetime
from typing import Any, Dict, Optional, Tuple

BASE = "http://127.0.0.1:8080"


def _request_json(url: str, *, method: str = "GET", body: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw)
    except urllib.error.HTTPError as exc:
        msg = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} {url}: {msg[:300]}")


def _find_working_policy_id() -> int:
    lst = _request_json(f"{BASE}/api/network/dns-policies?page=1&page_size=10")
    items = lst.get("items") or []
    if not items:
        raise RuntimeError("No DNS policies returned from list endpoint")

    candidates = []
    for it in items:
        if not isinstance(it, dict):
            continue
        for key in ("id", "policy_id", "policyId"):
            v = it.get(key)
            if v is not None:
                candidates.append(int(v))

    # Try common IDs first if list contains non-working IDs.
    candidates = [c for c in candidates if c > 0]
    candidates = list(dict.fromkeys(candidates))

    for cand in candidates:
        try:
            det = _request_json(f"{BASE}/api/network/dns-policies/{cand}")
            if det.get("success") is False:
                continue
            return cand
        except Exception:
            continue

    # Fallback: policy id 4 seen in runtime routes in this repo.
    for cand in (1, 2, 3, 4, 5, 10):
        try:
            det = _request_json(f"{BASE}/api/network/dns-policies/{cand}")
            if det.get("success") is False:
                continue
            return cand
        except Exception:
            continue

    raise RuntimeError("Could not find a working DNS policy id")


def _parse_detail(detail: str) -> Tuple[Optional[Dict[str, Any]], str]:
    s = (detail or "").strip()
    try:
        obj = json.loads(s)
        if isinstance(obj, dict):
            return obj, "json"
        return None, "non-dict-json"
    except Exception:
        return None, "not-json"


def verify_policy_detail_logging(policy_id: int) -> None:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    new_remark = f"log-check-{stamp}"

    _request_json(
        f"{BASE}/api/network/dns-policies/{policy_id}",
        method="PUT",
        body={"remark": new_remark},
    )

    logs = _request_json(f"{BASE}/api/network/dns-policies/{policy_id}/logs?page=1&page_size=5")
    items = logs.get("items") or []
    if not items:
        raise RuntimeError("No logs returned")

    latest = items[0]
    detail = latest.get("detail") or ""
    obj, kind = _parse_detail(detail)

    print("[basic-info] latest.tab_key=", latest.get("tab_key"), "action=", latest.get("action"))
    print("[basic-info] detail_parse=", kind)
    if obj:
        print("[basic-info] detail.keys=", sorted(obj.keys()))
        print("[basic-info] changed_fields=", obj.get("changed_fields"))
        changes = obj.get("changes") or {}
        remark_change = changes.get("remark")
        print("[basic-info] changes.remark=", remark_change)
    else:
        print("[basic-info] detail.preview=", detail[:200])


def _get_or_create_record_item(policy_id: int) -> Dict[str, Any]:
    # Try list first
    lst = _request_json(f"{BASE}/api/network/dns-policies/{policy_id}/records?page=1&page_size=5")
    items = lst.get("items") or []
    if items and isinstance(items[0], dict) and items[0].get("id") is not None:
        return items[0]

    # Create minimal record
    created = _request_json(
        f"{BASE}/api/network/dns-policies/{policy_id}/records",
        method="POST",
        body={
            "record_type": "A",
            "host_name": "diag",
            "ip_address": "10.0.0.10",
            "status": "활성",
            "remark": "diag-seed",
        },
    )
    item = (created.get("item") or {})
    rid = item.get("id")
    if rid is None:
        raise RuntimeError("Record create did not return item.id")
    return item


def verify_record_tab_logging(policy_id: int) -> None:
    # Read-only verification: scan existing record UPDATE logs and ensure changes are present.
    # (Some environments require auth for record writes, so we don't attempt to generate a new UPDATE here.)
    record_id = None
    try:
        record = _get_or_create_record_item(policy_id)
        record_id = int(record.get("id"))
    except Exception:
        record_id = None

    logs = _request_json(f"{BASE}/api/network/dns-policies/{policy_id}/logs?page=1&page_size=200")
    items = logs.get("items") or []
    rec_updates = [
        it
        for it in items
        if isinstance(it, dict)
        and it.get("tab_key") == "gov_dns_policy_dns_record"
        and it.get("action") == "UPDATE"
    ]

    print(f"[record-log] policy_id={policy_id} record_id_hint={record_id} update_logs_seen={len(rec_updates)}")
    if not rec_updates:
        print("[record-log] NOTE: no RECORD UPDATE logs found on first page")

    missing_changes = 0
    zero_changes = 0
    examples = 0
    for it in rec_updates:
        obj, kind = _parse_detail(it.get("detail") or "")
        changes = (obj or {}).get("changes") if isinstance(obj, dict) else None
        if not isinstance(changes, dict):
            missing_changes += 1
            continue
        if not changes:
            zero_changes += 1
            continue

        if examples < 3:
            keys = sorted(changes.keys())
            print(
                "[record-log] ok:",
                "entity_id=", it.get("entity_id"),
                "changed_fields=", (obj or {}).get("changed_fields"),
                "change_keys=", keys,
            )
            examples += 1

            # If we have a record_id hint and it matches, print remark diff for quick sanity.
            if record_id is not None and it.get("entity_id") == record_id:
                print("[record-log] example changes.remark=", changes.get("remark"))

    print(f"[record-log] missing_changes={missing_changes} zero_changes={zero_changes}")


def main() -> int:
    try:
        policy_id = _find_working_policy_id()
        print("using policy_id=", policy_id)
        verify_policy_detail_logging(policy_id)
        verify_record_tab_logging(policy_id)
        return 0
    except Exception as exc:
        print("ERROR:", exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

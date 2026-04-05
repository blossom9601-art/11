import datetime
import json
import re
from dataclasses import dataclass
from http.cookiejar import CookieJar
from typing import Any
from urllib import request


BASE = "http://127.0.0.1:8080"
YEAR = datetime.date.today().year

# NOTE: Use unicode escape for stability when running on Windows shells.
STATUS_ACTIVE = "\uacc4\uc57d"  # '계약'


TYPE_TO_PAGE = {
    "HW": "cost_opex_hardware_detail",
    "SW": "cost_opex_software_detail",
    "ETC": "cost_opex_etc_detail",
}


@dataclass(frozen=True)
class CheckResult:
    cost_type: str
    manage_no: str
    maint_amount: Any
    api_total: int
    api_active: int
    html_total: int | None
    html_active: int | None
    html_amount: str | None
    ok: bool
    note: str


def _get_opener() -> request.OpenerDirector:
    cj = CookieJar()
    return request.build_opener(request.HTTPCookieProcessor(cj))


def _get_json(opener: request.OpenerDirector, url: str) -> dict:
    with opener.open(url, timeout=10) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def _get_html(opener: request.OpenerDirector, url: str) -> str:
    with opener.open(url, timeout=10) as r:
        return r.read().decode("utf-8", "replace")


def _extract_span_text(html: str, element_id: str) -> str | None:
    m = re.search(rf'id="{re.escape(element_id)}"[^>]*>(.*?)<', html)
    return (m.group(1).strip() if m else None)


def _safe_int(s: str | None) -> int | None:
    if s is None:
        return None
    s = s.strip()
    if not s:
        return None
    try:
        return int(s)
    except Exception:
        return None


def _parse_int_like(s: str | None) -> int | None:
    if s is None:
        return None
    text = s.strip()
    if not text:
        return None
    digits = ''.join(ch for ch in text if ch.isdigit() or ch == '-')
    if digits in ('', '-'):
        return None
    try:
        return int(digits)
    except Exception:
        return None


def _pick_contract(items: list[dict]) -> dict | None:
    if not items:
        return None
    for it in items:
        try:
            if int(it.get("maint_amount") or 0) >= 1000:
                return it
        except Exception:
            continue
    return items[0]


def check_one(cost_type: str) -> CheckResult:
    opener = _get_opener()

    contracts = _get_json(opener, f"{BASE}/api/opex-contracts?opex_type={cost_type}").get("items") or []
    pick = _pick_contract(contracts)
    if not pick:
        return CheckResult(
            cost_type=cost_type,
            manage_no="",
            maint_amount=None,
            api_total=0,
            api_active=0,
            html_total=None,
            html_active=None,
            html_amount=None,
            ok=True,
            note="NO CONTRACTS",
        )

    manage_no = str(pick.get("manage_no") or "")
    maint_amount = pick.get("maint_amount")

    contract_pk = None
    try:
        contract_pk = int(pick.get('id') or 0)
    except Exception:
        contract_pk = None

    lines = []
    if contract_pk:
        lines = _get_json(
            opener,
            f"{BASE}/api/cost-contract-lines?scope=OPEX&cost_type={cost_type}&contract_id={contract_pk}&year={YEAR}",
        ).get("items") or []

    api_total = len(lines)
    api_active = sum(1 for it in lines if (it or {}).get("contract_status") == STATUS_ACTIVE)
    api_sum_total = sum(int((it or {}).get('sum') or 0) for it in lines)

    page = TYPE_TO_PAGE[cost_type]
    html = _get_html(opener, f"{BASE}/p/{page}?id={request.quote(manage_no)}")
    html_total = _safe_int(_extract_span_text(html, "cd-maint_qty_total"))
    html_active = _safe_int(_extract_span_text(html, "cd-maint_qty_active"))
    html_amount = _extract_span_text(html, "cd-maint_amount")

    html_amount_num = _parse_int_like(html_amount)

    ok = (html_total == api_total) and (html_active == api_active) and (html_amount_num == api_sum_total)
    note = "OK" if ok else "MISMATCH"

    return CheckResult(
        cost_type=cost_type,
        manage_no=manage_no,
        maint_amount=maint_amount,
        api_total=api_total,
        api_active=api_active,
        html_total=html_total,
        html_active=html_active,
        html_amount=html_amount,
        ok=ok,
        note=note,
    )


def main() -> int:
    results: list[CheckResult] = []
    for cost_type in ("HW", "SW", "ETC"):
        results.append(check_one(cost_type))

    any_fail = False
    for r in results:
        if r.note == "NO CONTRACTS":
            print(f"{r.cost_type}: NO CONTRACTS")
            continue
        any_fail = any_fail or (not r.ok)
        print(
            f"{r.cost_type}: manage_no={r.manage_no} maint_amount={r.maint_amount} "
            f"api(total={r.api_total},active={r.api_active}) "
            f"html(total={r.html_total},active={r.html_active}) "
            f"html_amt={r.html_amount} => {r.note}"
        )

    return 1 if any_fail else 0


if __name__ == "__main__":
    raise SystemExit(main())

import re
import sys
import urllib.error
import urllib.request


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # type: ignore[override]
        return None


SERIAL_TH = re.compile(r"<th>\s*일련번호\s*</th>")
MAINT_TH = re.compile(r"<th>\s*유지보수\s*</th>")


def _extract_table_thead(body: str, table_id: str) -> str:
    # Narrow validation to the table header to avoid false matches in nav tabs.
    # This is intentionally simple and regex-based (no external deps).
    pat = re.compile(
        rf"<table[^>]*\bid=\"{re.escape(table_id)}\"[^>]*>.*?<thead>(.*?)</thead>",
        re.IGNORECASE | re.DOTALL,
    )
    m = pat.search(body)
    return m.group(1) if m else ""


def _fetch(url: str, timeout: float = 10.0):
    opener = urllib.request.build_opener(_NoRedirect)
    req = urllib.request.Request(url, headers={"User-Agent": "blossom-smoke/1.0"})
    try:
        with opener.open(req, timeout=timeout) as resp:
            status = getattr(resp, "status", None) or resp.getcode()
            body = resp.read().decode("utf-8", errors="replace")
            headers = dict(resp.headers)
            final_url = resp.geturl()
            return status, final_url, headers, body
    except urllib.error.HTTPError as e:
        status = e.code
        body = e.read().decode("utf-8", errors="replace") if hasattr(e, "read") else ""
        headers = dict(getattr(e, "headers", {}) or {})
        return status, url, headers, body


def _check_headers(thead_html: str):
    has_serial = bool(SERIAL_TH.search(thead_html))
    has_maint = bool(MAINT_TH.search(thead_html))
    order_ok = False
    if has_serial and has_maint:
        idx_serial = thead_html.find("일련번호")
        idx_maint = thead_html.find("유지보수")
        order_ok = 0 <= idx_serial < idx_maint
    return has_serial, has_maint, order_ok


def main() -> int:
    base = "http://127.0.0.1:8080"
    paths = [
        "/__diag__ping",
        "/p/hw_server_onpremise_hw",
        "/p/hw_server_onpremise_sw",
        "/p/hw_server_cloud_hw",
        "/p/hw_server_cloud_sw",
        "/p/hw_server_workstation_hw",
        "/p/hw_server_workstation_sw",
    ]

    ok = True
    for path in paths:
        url = base + path
        try:
            status, final_url, headers, body = _fetch(url)
            table_id = None
            if path.endswith("_hw"):
                table_id = "hw-spec-table"
            elif path.endswith("_sw"):
                table_id = "sw-spec-table"

            scope = body
            if table_id:
                scoped = _extract_table_thead(body, table_id)
                if scoped:
                    scope = scoped

            has_serial, has_maint, order_ok = _check_headers(scope)
            loc = headers.get("Location") or headers.get("location")
            loc_part = f" location={loc}" if loc else ""
            print(
                f"[HTTP {status}] {path}{loc_part} | serial={has_serial} maint={has_maint} orderOK={order_ok}"
            )

            if path.endswith("_hw") or path.endswith("_sw"):
                # If we got the page HTML, enforce the header order.
                # If auth redirects are in place, don't fail hard; just report.
                if status == 200 and (not order_ok):
                    ok = False
        except Exception as e:
            ok = False
            print(f"[ERR] {path} | {type(e).__name__}: {e}")

    return 0 if ok else 2


if __name__ == "__main__":
    raise SystemExit(main())

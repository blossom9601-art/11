from __future__ import annotations

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8080"
EMP_NO = "ADMIN"
PASSWORD = "admin"
ASSET_ID = 27


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        console_logs: list[dict] = []
        page_errors: list[str] = []
        js_headers: dict | None = None
        js_request_types: list[str] = []

        def on_console(msg):
            try:
                console_logs.append({"type": msg.type, "text": msg.text})
            except Exception:
                pass

        def on_page_error(err):
            try:
                page_errors.append(str(err))
            except Exception:
                pass

        def on_response(resp):
            nonlocal js_headers
            try:
                if "/static/js/2.hardware/2-1.server/2-1-1.onpremise/2.onpremise_detail.js" in resp.url:
                    js_headers = dict(resp.headers or {})
            except Exception:
                pass

        def on_request(req):
            try:
                if "/static/js/2.hardware/2-1.server/2-1-1.onpremise/2.onpremise_detail.js" in req.url:
                    js_request_types.append(req.resource_type)
            except Exception:
                pass

        page.on("console", on_console)
        page.on("pageerror", on_page_error)
        page.on("response", on_response)
        page.on("request", on_request)

        page.goto(f"{BASE}/login", wait_until="domcontentloaded")
        page.fill('input[name="employee_id"]', EMP_NO)
        page.fill('input[name="password"]', PASSWORD)
        page.click('button[type="submit"], input[type="submit"]')
        page.wait_for_timeout(300)

        resp = page.goto(
            f"{BASE}/p/hw_server_onpremise_detail?asset_id={ASSET_ID}&debug=1",
            wait_until="domcontentloaded",
        )
        headers = resp.headers if resp else {}
        print("status:", resp.status if resp else None)
        print("content-security-policy:", headers.get("content-security-policy"))
        print(
            "meta http-equiv CSP:",
            page.evaluate(
                """() => {
                    const m = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
                    return m ? m.content : null;
                }"""
            ),
        )
        print("typeof fetch:", page.evaluate("() => typeof fetch"))

        sanity = page.evaluate(
            """() => {
                try { new Function('(function(){'); return { ok: true }; }
                catch(e){ return { ok: false, name: e && e.name, message: e && e.message }; }
            }"""
        )
        print("sanity_new_function:", sanity)

        print(
            "bundle marker:",
            page.evaluate(
                """() => ({
                    evalCount: window.__onpremise_detail_js_eval || 0,
                    last: window.__onpremise_detail_js_last || null,
                    descEval: Object.getOwnPropertyDescriptor(window, '__onpremise_detail_js_eval') || null,
                    descLast: Object.getOwnPropertyDescriptor(window, '__onpremise_detail_js_last') || null,
                })"""
            ),
        )

        compile_check = page.evaluate(
            """async () => {
                const s = document.querySelector('script[src*="2-1-1.onpremise/2.onpremise_detail.js"]');
                const src = s ? s.src : null;
                if (!src) return { ok: false, reason: 'no-script-tag' };
                const txt = await fetch(src).then(r => r.text());
                const hasMarker = txt.includes('__onpremise_detail_js_eval');
                try {
                    // Compile only (do not execute)
                    new Function(txt);
                    return { ok: true, bytes: txt.length, hasMarker };
                } catch (e) {
                    return { ok: false, bytes: txt.length, hasMarker, name: e && e.name, message: e && e.message, stack: e && e.stack };
                }
            }"""
        )
        print("compile_check:", compile_check)

        script_meta = page.evaluate(
            """() => {
                const all = Array.from(document.scripts || []).map(s => ({
                    src: s.src || null,
                    type: s.type || '',
                    async: !!s.async,
                    defer: !!s.defer,
                    noModule: !!s.noModule,
                }));
                return all.filter(x => x.src && x.src.includes('2-1-1.onpremise/2.onpremise_detail.js'))[0] || null;
            }"""
        )
        print("script_tag:", script_meta)

        print("js bundle response headers:", js_headers)
        print("js request types:", js_request_types)
        print("page_errors:", page_errors)
        print("console_logs_tail:", console_logs[-20:])

        browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

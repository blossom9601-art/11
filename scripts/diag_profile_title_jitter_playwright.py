"""Headless verification via Playwright.

Modes:
- profile_jitter (default): /settings/profile title jitter check.
- onpremise_detail: open on-premise detail page and verify data loads client-side.
- onpremise_hw: open on-premise hardware tab and verify components load client-side.
- tab61_contract: verify Tab61 contract header action icon placement after SPA navigation.

Run:
    C:/Users/ME/Desktop/blossom/.venv/Scripts/python.exe scripts/diag_profile_title_jitter_playwright.py
    C:/Users/ME/Desktop/blossom/.venv/Scripts/python.exe scripts/diag_profile_title_jitter_playwright.py --mode onpremise_detail
    C:/Users/ME/Desktop/blossom/.venv/Scripts/python.exe scripts/diag_profile_title_jitter_playwright.py --mode onpremise_hw
    C:/Users/ME/Desktop/blossom/.venv/Scripts/python.exe scripts/diag_profile_title_jitter_playwright.py --mode tab61_contract

Notes:
- This is a dev-only diagnostic script.
"""

from __future__ import annotations

import json
import os
import sys
import time
import argparse
import urllib.parse
import urllib.request
import logging
from dataclasses import asdict, dataclass
from pathlib import Path

# Allow running this file directly (sys.path[0] becomes scripts/)
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


@dataclass
class Snapshot:
    label: str
    ts: float
    url: str
    dpr: float
    window_inner_width: int
    doc_client_width: int
    scrollbar_w: int
    editing: bool
    title_rect: dict
    header_rect: dict
    computed: dict


@dataclass
class Tab61Snapshot:
    label: str
    ts: float
    url: str
    body_class: str
    detail_styles: list[str]
    basic_edit_rect: dict | None
    row_add_rect: dict | None
    pane_rect: dict | None
    h3_rect: dict | None
    actions_rect: dict | None
    year_select_rect: dict | None
    year_wrap_rect: dict | None
    year_wrap_in_actions: bool
    action_buttons: list[dict]
    computed: dict | None


def _ensure_admin_user() -> None:
    from app import create_app, db
    from app.models import AuthUser

    app = create_app()
    with app.app_context():
        emp_no = os.environ.get("BLOSSOM_DIAG_EMP_NO", "ADMIN")
        password = os.environ.get("BLOSSOM_DIAG_PASSWORD", "admin")
        email = os.environ.get("BLOSSOM_DIAG_EMAIL", "admin@local")

        user = AuthUser.query.filter_by(emp_no=emp_no).first()
        if user is None:
            user = AuthUser(emp_no=emp_no, email=email, role="admin", status="active")
            user.set_password(password)
            db.session.add(user)
            db.session.commit()
        else:
            # Ensure user is active and password is known for deterministic automation
            changed = False
            if getattr(user, "status", None) != "active":
                user.status = "active"
                changed = True
            try:
                user.set_password(password)
                changed = True
            except Exception:
                pass
            if changed:
                db.session.commit()


def _http_get_json(url: str, timeout: float = 10.0):
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    return json.loads(raw)


def _diag_tab61_contract(*, base_url: str, emp_no: str, password: str) -> int:
    """Open a cost detail page, then click to Tab61(contract) via SPA and verify header action placement."""

    from playwright.sync_api import sync_playwright

    snapshots: list[Tab61Snapshot] = []

    def take_snapshot(page, label: str) -> None:
        payload = page.evaluate(
            """() => {
            const r = (el) => {
                if (!el) return null;
                const b = el.getBoundingClientRect();
                return { x: Math.round(b.x*100)/100, y: Math.round(b.y*100)/100, w: Math.round(b.width*100)/100, h: Math.round(b.height*100)/100 };
            };

            const basicEdit = document.querySelector('#detail-edit-open');
            const rowAdd = document.querySelector('#hw-row-add');
            const pane = document.querySelector('.server-detail-pane.active') || document.querySelector('.server-detail-pane#basic');
            const yearSelect = document.querySelector('#hw-year-select');
            const yearWrap = yearSelect ? yearSelect.closest('.page-size-selector') : null;

            const actionCandidates = Array.from(document.querySelectorAll('.detail-header-actions')).map(el => {
                const btns = Array.from(el.querySelectorAll('button.add-btn-icon'));
                const btnIds = btns.map(b => b.id || '').filter(Boolean);
                return {
                    el,
                    rect: r(el),
                    btnCount: btns.length,
                    btnIds,
                    tag: el.tagName || null,
                    className: el.className || null,
                };
            });
            actionCandidates.sort((a,b) => (b.btnCount - a.btnCount));
            const best = actionCandidates.length ? actionCandidates[0] : null;
            const actions = best ? best.el : null;
            const fallbackH3 = (
                document.querySelector('.page-tab71-opex .detail-section h3.has-header-actions')
                || document.querySelector('.detail-section h3.has-header-actions')
                || null
            );
            const h3 = actions ? (actions.closest('h3') || fallbackH3) : fallbackH3;

            const buttons = actions ? Array.from(actions.querySelectorAll('button.add-btn-icon')).map(btn => {
                const img = btn.querySelector('img');
                const cs = getComputedStyle(btn);
                return {
                    id: btn.id || null,
                    title: btn.getAttribute('title') || null,
                    aria: btn.getAttribute('aria-label') || null,
                    rect: r(btn),
                    imgAlt: img ? img.getAttribute('alt') : null,
                    computed: { position: cs.position, display: cs.display }
                };
            }) : [];

            const detailLinks = Array.from(document.querySelectorAll('head link[rel="stylesheet"][href]'))
                .map(el => el.getAttribute('href') || '')
                .filter(h => h.includes('/static/css/detail.css') || h.includes('/static/css/detail5.css'));

            const csActions = actions ? getComputedStyle(actions) : null;
            const csH3 = h3 ? getComputedStyle(h3) : null;
            return {
                url: location.href,
                bodyClass: document.body ? (document.body.className || '') : '',
                detailLinks,
                debug: {
                    candidates: actionCandidates.map(c => ({ btnCount: c.btnCount, btnIds: c.btnIds, rect: c.rect, tag: c.tag, className: c.className })).slice(0, 5),
                },
                basicEditRect: r(basicEdit),
                rowAddRect: r(rowAdd),
                paneRect: r(pane),
                h3Rect: r(h3),
                actionsRect: r(actions),
                yearSelectRect: r(yearSelect),
                yearWrapRect: r(yearWrap),
                yearWrapInActions: !!(actions && yearWrap && actions.contains(yearWrap)),
                buttons,
                computed: {
                    h3: csH3 ? {
                        position: csH3.position,
                        paddingTop: csH3.paddingTop,
                        paddingRight: csH3.paddingRight,
                        minHeight: csH3.minHeight,
                        lineHeight: csH3.lineHeight,
                    } : null,
                    actions: csActions ? {
                        position: csActions.position,
                        top: csActions.top,
                        right: csActions.right,
                        transform: csActions.transform,
                        display: csActions.display,
                        gap: csActions.gap,
                        alignItems: csActions.alignItems,
                        flexWrap: csActions.flexWrap,
                    } : null,
                }
            };
        }"""
        )

        snapshots.append(
            Tab61Snapshot(
                label=label,
                ts=time.time(),
                url=payload.get("url") or "",
                body_class=payload.get("bodyClass") or "",
                detail_styles=list(payload.get("detailLinks") or []),
                basic_edit_rect=payload.get("basicEditRect"),
                row_add_rect=payload.get("rowAddRect"),
                pane_rect=payload.get("paneRect"),
                h3_rect=payload.get("h3Rect"),
                actions_rect=payload.get("actionsRect"),
                year_select_rect=payload.get("yearSelectRect"),
                year_wrap_rect=payload.get("yearWrapRect"),
                year_wrap_in_actions=bool(payload.get("yearWrapInActions")),
                action_buttons=list(payload.get("buttons") or []),
                computed=payload.get("computed"),
            )
        )

    def rect_contains(outer: dict | None, inner: dict | None, tol: float = 1.0) -> bool:
        if not outer or not inner:
            return False
        try:
            return (
                float(inner["x"]) >= float(outer["x"]) - tol
                and float(inner["y"]) >= float(outer["y"]) - tol
                and float(inner["x"]) + float(inner["w"]) <= float(outer["x"]) + float(outer["w"]) + tol
                and float(inner["y"]) + float(inner["h"]) <= float(outer["y"]) + float(outer["h"]) + tol
            )
        except Exception:
            return False

    def summarize(s: Tab61Snapshot) -> dict:
        h3 = s.h3_rect
        act = s.actions_rect
        return {
            "label": s.label,
            "url": s.url,
            "body_class": s.body_class,
            "detail_styles": s.detail_styles,
            "buttons": len(s.action_buttons),
            "basic_edit": s.basic_edit_rect,
            "row_add": s.row_add_rect,
            "h3": h3,
            "actions": act,
        }

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        page = context.new_page()

        def wait_stable_layout() -> None:
            # Reduce flakiness from async font loading / late layout shifts.
            try:
                page.wait_for_load_state("networkidle", timeout=10000)
            except Exception:
                pass
            try:
                page.evaluate("""() => (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve()""")
            except Exception:
                pass
            page.wait_for_timeout(300)

        # Login
        page.goto(f"{base_url}/login", wait_until="domcontentloaded")
        page.fill('input[name="employee_id"]', emp_no)
        page.fill('input[name="password"]', password)
        page.click('button[type="submit"], input[type="submit"]')
        page.wait_for_timeout(400)

        # Pick a deterministic HW contract via API, but be resilient to items that
        # redirect away from the detail page (missing/invalid context).
        resp = context.request.get(f"{base_url}/api/opex-contracts?opex_type=HW")
        if not resp.ok:
            raise SystemExit(f"Failed to fetch opex contracts: HTTP {resp.status}")
        data = resp.json()
        items = data.get("items") if isinstance(data, dict) else None
        if not isinstance(items, list) or not items:
            raise SystemExit("No opex contracts found to run tab61 diagnostic")
        # Start from detail page (usually detail5.css), then SPA-click to contract page.
        start_url = f"{base_url}/p/cost_opex_hardware_detail?debug=1"

        def try_open_with_item(item: dict) -> bool:
            manage_no = (item.get("manage_no") or "").strip()
            token = (item.get("page_token") or "").strip()
            if not manage_no and not token:
                return False

            def set_ctx(key: str) -> bool:
                ctx_payload: dict[str, str] = {"key": key}
                if token:
                    ctx_payload["token"] = token
                else:
                    ctx_payload["manage_no"] = manage_no
                ctx_resp = context.request.post(
                    f"{base_url}/api/cost/detail-context",
                    data=json.dumps(ctx_payload),
                    headers={"Content-Type": "application/json", "Accept": "application/json"},
                )
                return bool(ctx_resp.ok)

            # Some pages require per-page context keys; set both to avoid redirects.
            if not set_ctx("cost_opex_hardware_detail"):
                return False
            if not set_ctx("cost_opex_hardware_contract"):
                return False

            page.goto(start_url, wait_until="domcontentloaded")
            try:
                page.wait_for_selector('main.main-content', timeout=20000)
                page.wait_for_selector('.server-detail-tabs', timeout=5000)
                page.wait_for_selector('#detail-edit-open', timeout=5000)
                return True
            except Exception:
                return False

        opened = False
        for item in items[:15]:
            if not isinstance(item, dict):
                continue
            if try_open_with_item(item):
                opened = True
                break
        if not opened:
            raise SystemExit("Failed to open a cost detail page with tabs; no suitable opex HW contract context found")

        wait_stable_layout()
        take_snapshot(page, "detail_before_spa")

        # Click contract tab (SPA partial navigation: swaps <main> only)
        contract_sel = '.server-detail-tabs a.server-detail-tab-btn[href*="cost_opex_hardware_contract"]'
        page.wait_for_selector(contract_sel, timeout=20000)
        page.click(contract_sel)
        # Wait for content that exists on contract tab
        page.wait_for_selector('#hw-row-add', timeout=20000)
        # Ensure the header action CSS is actually applied (prevents flaky captures).
        page.wait_for_function(
            """() => {
            const btn = document.querySelector('#hw-row-add');
            const actions = (
                document.querySelector('.server-detail-pane.active .detail-header-actions')
                || document.querySelector('.server-detail-pane#basic .detail-header-actions')
                || document.querySelector('.detail-header-actions')
            );
            if (!btn || !actions) return false;
            const csBtn = getComputedStyle(btn);
            const csActions = getComputedStyle(actions);
            return (
                csBtn.width === '44px' && csBtn.height === '44px'
                && csActions.position === 'absolute'
            );
        }""",
            timeout=20000,
        )
        wait_stable_layout()
        take_snapshot(page, "contract_after_spa")

        out_dir = ROOT / "_tmp_playwright"
        try:
            out_dir.mkdir(parents=True, exist_ok=True)
        except Exception:
            out_dir = ROOT

        png_path = out_dir / "tab61_contract_after_spa.png"
        page.screenshot(path=str(png_path), full_page=False)

        browser.close()

    report = {
        "mode": "tab61_contract",
        "screenshot": str(png_path),
        "snapshots": [asdict(s) for s in snapshots],
        "summary": [summarize(s) for s in snapshots],
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))

    # Assertions: "행 추가" 버튼이 "기본정보 수정" 버튼과 동일 좌표(top/right)로 배치되어야 함.
    snap = next((s for s in snapshots if s.label == "contract_after_spa"), snapshots[-1] if snapshots else None)
    if not snap:
        print("FAIL: no snapshot")
        return 2

    base = next((s for s in snapshots if s.label == "detail_before_spa"), None)
    if not base or not base.basic_edit_rect:
        print("FAIL: missing basic edit button rect (#detail-edit-open)")
        return 2
    if not snap.row_add_rect:
        print("FAIL: missing row add button rect (#hw-row-add)")
        return 2

    if not base.pane_rect or not snap.pane_rect:
        print("FAIL: missing pane rect")
        return 2

    # Compare placement relative to the active pane (white bordered detail box).
    # Requirement: Tab61 '행 추가' occupies the same top-right slot as the Basic tab edit icon.
    base_top_off = float(base.basic_edit_rect["y"]) - float(base.pane_rect["y"])
    base_right_off = (float(base.pane_rect["x"]) + float(base.pane_rect["w"])) - (
        float(base.basic_edit_rect["x"]) + float(base.basic_edit_rect["w"])
    )
    add_top_off = float(snap.row_add_rect["y"]) - float(snap.pane_rect["y"])
    add_right_off = (float(snap.pane_rect["x"]) + float(snap.pane_rect["w"])) - (
        float(snap.row_add_rect["x"]) + float(snap.row_add_rect["w"])
    )

    dy = round(add_top_off - base_top_off, 2)
    dr = round(add_right_off - base_right_off, 2)
    tol = 0.6
    expected = 20.0
    if abs(dy) > tol or abs(dr) > tol:
        print("FAIL: row-add not aligned with basic edit (pane-relative)")
        print(
            json.dumps(
                {
                    "base": {"top_off": round(base_top_off, 2), "right_off": round(base_right_off, 2)},
                    "add": {"top_off": round(add_top_off, 2), "right_off": round(add_right_off, 2)},
                    "dy": dy,
                    "dr": dr,
                    "tol": tol,
                },
                ensure_ascii=False,
            )
        )
        return 2
    if abs(base_top_off - expected) > 1.5 or abs(base_right_off - expected) > 1.5:
        print("WARN: basic edit offsets differ from expected 20px")
        print(json.dumps({"base_top_off": round(base_top_off, 2), "base_right_off": round(base_right_off, 2)}, ensure_ascii=False))

    if len(snap.action_buttons) != 5:
        print(f"FAIL: expected 5 icon buttons, got {len(snap.action_buttons)}")
        return 2

    # Year selector should remain in the legacy header area (not grouped into the top-right icon bar).
    if not snap.year_select_rect:
        print("FAIL: missing year selector (#hw-year-select)")
        return 2
    if snap.year_wrap_in_actions:
        print("FAIL: year selector is inside icon actions group")
        return 2

    # Ensure the year selector does not overlap the icon action bar.
    if snap.actions_rect and snap.year_wrap_rect:
        ax1 = float(snap.actions_rect["x"])
        ay1 = float(snap.actions_rect["y"])
        ax2 = ax1 + float(snap.actions_rect["w"])
        ay2 = ay1 + float(snap.actions_rect["h"])
        yx1 = float(snap.year_wrap_rect["x"])
        yy1 = float(snap.year_wrap_rect["y"])
        yx2 = yx1 + float(snap.year_wrap_rect["w"])
        yy2 = yy1 + float(snap.year_wrap_rect["h"])
        ix = max(0.0, min(ax2, yx2) - max(ax1, yx1))
        iy = max(0.0, min(ay2, yy2) - max(ay1, yy1))
        if ix * iy > 0.0:
            print("FAIL: year selector overlaps icon actions")
            print(
                json.dumps(
                    {"actions": snap.actions_rect, "year": snap.year_wrap_rect, "overlap": {"w": round(ix, 2), "h": round(iy, 2)}},
                    ensure_ascii=False,
                )
            )
            return 2

    print("OK: Tab61 '행 추가' 버튼이 '기본정보 수정'과 동일 좌표로 정렬됨")
    return 0


def _diag_profile_jitter(*, base_url: str, emp_no: str, password: str) -> int:
    from playwright.sync_api import sync_playwright

    snapshots: list[Snapshot] = []

    def take_snapshot(page, label: str) -> None:
        payload = page.evaluate(
            """() => {
            const titleEl = document.querySelector('#tab-overview .card .card-header .card-title');
            const headerEl = document.querySelector('#tab-overview .card .card-header');
            const card = document.querySelector('#tab-overview .card');
            const r = (el) => {
                if (!el) return null;
                const b = el.getBoundingClientRect();
                return { x: Math.round(b.x*100)/100, y: Math.round(b.y*100)/100, w: Math.round(b.width*100)/100, h: Math.round(b.height*100)/100 };
            };
            const cs = titleEl ? getComputedStyle(titleEl) : null;
            const docEl = document.documentElement;
            const innerW = window.innerWidth;
            const clientW = docEl.clientWidth;
            return {
                url: location.href,
                dpr: window.devicePixelRatio,
                innerW,
                clientW,
                scrollbarW: innerW - clientW,
                editing: !!(card && card.classList.contains('editing')),
                titleRect: r(titleEl),
                headerRect: r(headerEl),
                computed: cs ? {
                    letterSpacing: cs.letterSpacing,
                    fontKerning: cs.fontKerning,
                    textRendering: cs.textRendering,
                    textShadow: cs.textShadow,
                    font: cs.font,
                    transform: cs.transform,
                    webkitFontSmoothing: cs.webkitFontSmoothing || null,
                } : null,
            };
        }"""
        )

        snapshots.append(
            Snapshot(
                label=label,
                ts=time.time(),
                url=payload["url"],
                dpr=float(payload["dpr"]),
                window_inner_width=int(payload["innerW"]),
                doc_client_width=int(payload["clientW"]),
                scrollbar_w=int(payload["scrollbarW"]),
                editing=bool(payload["editing"]),
                title_rect=payload["titleRect"],
                header_rect=payload["headerRect"],
                computed=payload["computed"],
            )
        )

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Login
        page.goto(f"{base_url}/login", wait_until="domcontentloaded")
        page.fill('input[name="employee_id"]', emp_no)
        page.fill('input[name="password"]', password)
        page.click('button[type="submit"], input[type="submit"]')
        page.wait_for_timeout(300)

        # Navigate to profile settings
        page.goto(f"{base_url}/settings/profile", wait_until="domcontentloaded")
        page.wait_for_timeout(300)

        take_snapshot(page, "before_click")

        # Click edit (pencil)
        page.click('#btn-edit-profile')
        page.wait_for_timeout(50)
        take_snapshot(page, "after_click_50ms")
        page.wait_for_timeout(200)
        take_snapshot(page, "after_click_250ms")

        # Click save (same button)
        page.click('#btn-edit-profile')
        page.wait_for_timeout(50)
        take_snapshot(page, "after_save_50ms")
        page.wait_for_timeout(250)
        take_snapshot(page, "after_save_300ms")

        browser.close()

    print(json.dumps([asdict(s) for s in snapshots], ensure_ascii=False, indent=2))

    # Summarize deltas
    def _delta(a: Snapshot, b: Snapshot) -> dict:
        def _dw(x, y):
            if x is None or y is None:
                return None
            return round(float(y) - float(x), 2)

        return {
            "from": a.label,
            "to": b.label,
            "scrollbar_w": _dw(a.scrollbar_w, b.scrollbar_w),
            "title_x": _dw(
                a.title_rect.get("x") if a.title_rect else None, b.title_rect.get("x") if b.title_rect else None
            ),
            "title_w": _dw(
                a.title_rect.get("w") if a.title_rect else None, b.title_rect.get("w") if b.title_rect else None
            ),
            "header_w": _dw(
                a.header_rect.get("w") if a.header_rect else None, b.header_rect.get("w") if b.header_rect else None
            ),
            "letterSpacing": (a.computed or {}).get("letterSpacing") if a.computed else None,
        }

    if len(snapshots) >= 2:
        print("\n--- deltas ---")
        for i in range(1, len(snapshots)):
            print(json.dumps(_delta(snapshots[i - 1], snapshots[i]), ensure_ascii=False))

    return 0


def _diag_onpremise_detail(*, base_url: str, emp_no: str, password: str) -> int:
    from playwright.sync_api import sync_playwright

    # Pick a deterministic candidate asset_id (first item).
    api_list = f"{base_url}/api/hardware/onpremise/assets?page_size=1"
    payload = _http_get_json(api_list)
    items = payload.get("items") if isinstance(payload, dict) else None
    if not isinstance(items, list) or not items:
        raise SystemExit(f"No onpremise assets found via API: {api_list}")

    item0 = items[0]
    asset_id = item0.get("id") or item0.get("asset_id")
    if not asset_id:
        raise SystemExit(f"API item has no id: {item0}")
    asset_id = int(asset_id)

    target_url = f"{base_url}/p/hw_server_onpremise_detail?asset_id={asset_id}&debug=1"
    api_detail_prefix = f"/api/hardware/onpremise/assets/{asset_id}"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        onprem_js_substr = "/static/js/2.hardware/2-1.server/2-1-1.onpremise/2.onpremise_detail.js"
        seen = {"detail_api": False, "onprem_js": False}
        detail_resp = {"status": None, "content_type": None, "ok": None}
        js_resp = {"status": None, "content_type": None, "ok": None}
        page_errors: list[str] = []
        console_logs: list[dict] = []

        def on_request(req):
            try:
                url = req.url
                if api_detail_prefix in url:
                    seen["detail_api"] = True
                if onprem_js_substr in url:
                    seen["onprem_js"] = True
            except Exception:
                pass

        def on_response(resp):
            try:
                url = resp.url
                if api_detail_prefix in url:
                    detail_resp["status"] = resp.status
                    detail_resp["ok"] = resp.ok
                    try:
                        detail_resp["content_type"] = (resp.headers or {}).get("content-type")
                    except Exception:
                        detail_resp["content_type"] = None
                if onprem_js_substr in url:
                    js_resp["status"] = resp.status
                    js_resp["ok"] = resp.ok
                    try:
                        js_resp["content_type"] = (resp.headers or {}).get("content-type")
                    except Exception:
                        js_resp["content_type"] = None
            except Exception:
                pass

        def on_page_error(err):
            try:
                page_errors.append(str(err))
            except Exception:
                pass

        def on_console(msg):
            try:
                console_logs.append({"type": msg.type, "text": msg.text})
            except Exception:
                pass

        page.on("request", on_request)
        page.on("response", on_response)
        page.on("pageerror", on_page_error)
        page.on("console", on_console)

        # Login
        page.goto(f"{base_url}/login", wait_until="domcontentloaded")
        page.fill('input[name="employee_id"]', emp_no)
        page.fill('input[name="password"]', password)
        page.click('button[type="submit"], input[type="submit"]')
        page.wait_for_timeout(300)

        # Navigate to onpremise detail
        page.goto(target_url, wait_until="domcontentloaded")

        # Wait for the detail API call (best-effort)
        try:
            page.wait_for_response(lambda r: api_detail_prefix in r.url and r.ok, timeout=5000)
        except Exception:
            pass
        page.wait_for_timeout(500)

        snapshot = page.evaluate(
            """() => {
            const q = (sel) => document.querySelector(sel);
            const text = (el) => el && el.textContent ? el.textContent.trim() : '';
                        const hasLoginForm = !!(q('input[name="employee_id"]') && q('input[name="password"]'));
                        const hasOnpremScript = !!q('script[src*="2-1-1.onpremise/2.onpremise_detail.js"]');
                        const onpremScriptSrc = (q('script[src*="2-1-1.onpremise/2.onpremise_detail.js"]') || {}).src || '';
            const getByLabel = (label) => {
              const rows = document.querySelectorAll('.basic-info-grid .info-row');
              for (const row of rows){
                const lab = row.querySelector('label');
                if (!lab) continue;
                if (text(lab) !== label) continue;
                const target = row.querySelector('.info-value') || row.querySelector('.toggle-badge') || row.querySelector('.status-pill .status-text') || row.querySelector('.num-badge') || row.querySelector('.ox-badge');
                return text(target);
              }
              return '';
            };
            return {
              url: location.href,
                            title: document.title,
                            hasLoginForm,
                            hasOnpremScript,
                            onpremScriptSrc,
              h1: text(q('.page-header h1')),
              p: text(q('.page-header p')),
              vendor: getByLabel('시스템 제조사'),
              model: getByLabel('시스템 모델명'),
              manageIp: getByLabel('관리 IP'),
              workName: getByLabel('업무 이름'),
              systemName: getByLabel('시스템 이름'),
              workStatus: getByLabel('업무 상태'),
            };
        }"""
        )

        browser.close()

    report = {
        "asset_id": asset_id,
        "seen_detail_api": seen["detail_api"],
        "seen_onprem_js": seen["onprem_js"],
        "js_response": js_resp,
        "detail_response": detail_resp,
        "page_errors": page_errors,
        "console_logs_tail": console_logs[-30:],
        **snapshot,
    }

    # Validate: at least some values are populated.
    def nonempty(v: str) -> bool:
        if v is None:
            return False
        s = str(v).strip()
        return bool(s) and s != "-"

    ok_any = any(
        nonempty(snapshot.get(k))
        for k in ("h1", "p", "vendor", "model", "manageIp", "workName", "systemName", "workStatus")
    )
    if not ok_any:
        print("FAIL: onpremise detail headless check")
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 2

    print("OK: onpremise detail headless check")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


def _diag_onpremise_hw(*, base_url: str, emp_no: str, password: str) -> int:
    from playwright.sync_api import sync_playwright

    # Pick a deterministic candidate asset_id (first item).
    api_list = f"{base_url}/api/hardware/onpremise/assets?page_size=1"
    payload = _http_get_json(api_list)
    items = payload.get("items") if isinstance(payload, dict) else None
    if not isinstance(items, list) or not items:
        raise SystemExit(f"No onpremise assets found via API: {api_list}")

    item0 = items[0]
    asset_id = item0.get("id") or item0.get("asset_id")
    if not asset_id:
        raise SystemExit(f"API item has no id: {item0}")
    asset_id = int(asset_id)

    target_url = f"{base_url}/p/hw_server_onpremise_hw?asset_id={asset_id}&debug=1"
    api_components_prefix = f"/api/hardware/assets/{asset_id}/components"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        onprem_js_substr = "/static/js/2.hardware/2-1.server/2-1-1.onpremise/2.onpremise_detail.js"
        seen = {"components_api": False, "onprem_js": False}
        components_resp = {"status": None, "content_type": None, "ok": None}
        js_resp = {"status": None, "content_type": None, "ok": None}
        last_components_req_url: str | None = None
        last_components_resp_url: str | None = None
        request_failed: list[dict] = []
        page_errors: list[str] = []
        console_logs: list[dict] = []

        def on_request(req):
            try:
                url = req.url
                if api_components_prefix in url:
                    seen["components_api"] = True
                    nonlocal last_components_req_url
                    last_components_req_url = url
                if onprem_js_substr in url:
                    seen["onprem_js"] = True
            except Exception:
                pass

        def on_response(resp):
            try:
                url = resp.url
                if api_components_prefix in url:
                    nonlocal last_components_resp_url
                    last_components_resp_url = url
                    components_resp["status"] = resp.status
                    components_resp["ok"] = resp.ok
                    try:
                        components_resp["content_type"] = (resp.headers or {}).get("content-type")
                    except Exception:
                        components_resp["content_type"] = None
                if onprem_js_substr in url:
                    js_resp["status"] = resp.status
                    js_resp["ok"] = resp.ok
                    try:
                        js_resp["content_type"] = (resp.headers or {}).get("content-type")
                    except Exception:
                        js_resp["content_type"] = None
            except Exception:
                pass

        def on_page_error(err):
            try:
                page_errors.append(str(err))
            except Exception:
                pass

        def on_console(msg):
            try:
                console_logs.append({"type": msg.type, "text": msg.text})
            except Exception:
                pass

        def on_request_failed(req):
            try:
                request_failed.append(
                    {
                        "url": req.url,
                        "failure": getattr(req, "failure", None) or None,
                    }
                )
            except Exception:
                pass

        page.on("request", on_request)
        page.on("response", on_response)
        page.on("requestfailed", on_request_failed)
        page.on("pageerror", on_page_error)
        page.on("console", on_console)

        # Login
        page.goto(f"{base_url}/login", wait_until="domcontentloaded")
        page.fill('input[name="employee_id"]', emp_no)
        page.fill('input[name="password"]', password)
        page.click('button[type="submit"], input[type="submit"]')
        page.wait_for_timeout(300)

        # Navigate to onpremise hw tab
        page.goto(target_url, wait_until="domcontentloaded")

        # Give the page a chance to complete any async fetches.
        try:
            page.wait_for_load_state("networkidle", timeout=15000)
        except Exception:
            pass

        # Wait for the components API call (best-effort)
        try:
            page.wait_for_response(lambda r: api_components_prefix in r.url, timeout=15000)
        except Exception:
            pass
        page.wait_for_timeout(800)

        snapshot = page.evaluate(
            """() => {
            const q = (sel) => document.querySelector(sel);
            const text = (el) => el && el.textContent ? el.textContent.trim() : '';
            const hasLoginForm = !!(q('input[name="employee_id"]') && q('input[name="password"]'));
            const hasOnpremScript = !!q('script[src*="2-1-1.onpremise/2.onpremise_detail.js"]');
            const onpremScriptSrc = (q('script[src*="2-1-1.onpremise/2.onpremise_detail.js"]') || {}).src || '';
            const tbody = q('#hw-spec-table tbody');
            const rowCount = tbody ? tbody.querySelectorAll('tr').length : 0;
            const emptyEl = q('#hw-empty');
            const emptyShown = !!emptyEl && (emptyEl.style.display !== 'none');
            return {
              url: location.href,
              title: document.title,
              hasLoginForm,
              hasOnpremScript,
              onpremScriptSrc,
              h1: text(q('.page-header h1')),
              p: text(q('.page-header p')),
              tableRows: rowCount,
              emptyShown,
              paginationInfo: text(q('#hw-pagination-info')),
              jsEval: window.__onpremise_detail_js_eval || 0,
            };
        }"""
        )

        browser.close()

    report = {
        "asset_id": asset_id,
        "seen_components_api": seen["components_api"],
        "seen_onprem_js": seen["onprem_js"],
        "components_request_url": last_components_req_url,
        "components_response_url": last_components_resp_url,
        "js_response": js_resp,
        "components_response": components_resp,
        "request_failed": request_failed,
        "page_errors": page_errors,
        "console_logs_tail": console_logs[-30:],
        **snapshot,
    }

    def nonempty(v: str) -> bool:
        if v is None:
            return False
        s = str(v).strip()
        return bool(s) and s != "-"

    header_ok = nonempty(snapshot.get("h1")) or nonempty(snapshot.get("p"))
    table_ok = (snapshot.get("tableRows") is not None) and (
        int(snapshot.get("tableRows") or 0) > 0 or bool(snapshot.get("emptyShown"))
    )
    api_ok = (
        bool(report.get("seen_components_api"))
        and (report.get("components_response") or {}).get("status") is not None
        and bool((report.get("components_response") or {}).get("ok"))
    )

    # If there are no components, API should still be called and empty state should show.
    ok = api_ok and header_ok and table_ok and not bool(snapshot.get("hasLoginForm"))
    if not ok:
        print("FAIL: onpremise hw tab headless check")
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 2

    print("OK: onpremise hw tab headless check")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


def main() -> int:
    # Keep output readable (some app init paths enable verbose SQL logs)
    for name in ("sqlalchemy", "sqlalchemy.engine", "sqlalchemy.engine.Engine"):
        try:
            logging.getLogger(name).setLevel(logging.WARNING)
        except Exception:
            pass

    parser = argparse.ArgumentParser(add_help=True)
    parser.add_argument(
        "--mode",
        default=os.environ.get("BLOSSOM_DIAG_MODE", "profile_jitter"),
        choices=["profile_jitter", "onpremise_detail", "onpremise_hw", "tab61_contract"],
        help="diagnostic mode",
    )
    args = parser.parse_args()

    # Import here so the script fails fast if playwright isn't installed.
    base_url = os.environ.get("BLOSSOM_BASE_URL", "http://127.0.0.1:8080")
    emp_no = os.environ.get("BLOSSOM_DIAG_EMP_NO", "ADMIN")
    password = os.environ.get("BLOSSOM_DIAG_PASSWORD", "admin")

    _ensure_admin_user()

    if args.mode == "onpremise_detail":
        return _diag_onpremise_detail(base_url=base_url, emp_no=emp_no, password=password)

    if args.mode == "onpremise_hw":
        return _diag_onpremise_hw(base_url=base_url, emp_no=emp_no, password=password)

    if args.mode == "tab61_contract":
        return _diag_tab61_contract(base_url=base_url, emp_no=emp_no, password=password)

    return _diag_profile_jitter(base_url=base_url, emp_no=emp_no, password=password)


if __name__ == "__main__":
    raise SystemExit(main())

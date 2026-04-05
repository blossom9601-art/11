import json
import os
import time
import urllib.parse
import urllib.request
from urllib.error import HTTPError

BASE = 'http://127.0.0.1:8080'


def _get(path: str, accept: str = 'application/json', timeout: int = 20):
    url = BASE + path
    req = urllib.request.Request(url, headers={'Accept': accept})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
            return resp.status, resp.headers.get('Content-Type', ''), body
    except HTTPError as e:
        body = e.read()
        return e.code, e.headers.get('Content-Type', ''), body


def _get_text(path: str, timeout: int = 20):
    status, ctype, body = _get(path, accept='text/html, */*', timeout=timeout)
    return status, ctype, body.decode('utf-8', errors='replace')


def _get_json(path: str):
    status, ctype, body = _get(path, accept='application/json')
    text = body.decode('utf-8', errors='replace')
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        raise AssertionError(f'Non-JSON response for {path}: content-type={ctype!r} body(head)={text[:200]!r}')
    return status, data


def _post_json(path: str, payload: dict):
    url = BASE + path
    raw = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=raw,
        headers={
            'Accept': 'application/json',
            'Content-Type': 'application/json; charset=utf-8',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read().decode('utf-8', errors='replace')
            return resp.status, json.loads(body)
    except HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        try:
            return e.code, json.loads(body)
        except json.JSONDecodeError:
            return e.code, {'raw': body}


def _coerce_int(v):
    try:
        n = int(v)
        return n if n > 0 else None
    except Exception:
        return None


def _ensure_actor_user_id():
    st, data = _get_json('/api/session/me')
    if st != 200:
        return None
    uid = _coerce_int((((data or {}).get('user') or {}).get('id')))
    return uid


def _ensure_line_for_scope(scope: str, actor_user_id: int | None):
    qs = urllib.parse.urlencode({'scope': scope})
    st, data = _get_json(f'/api/network/vpn-lines?{qs}')
    if st != 200:
        return None, f'GET /api/network/vpn-lines?scope={scope} status={st}'

    items = (data or {}).get('items') or []
    if items:
        line_id = _coerce_int(items[0].get('id'))
        if line_id:
            return line_id, f'found existing line_id={line_id}'
        return None, f'lines returned but missing id keys={list(items[0].keys())}'

    if not actor_user_id:
        return None, 'no lines; cannot auto-create (missing /api/session/me user id)'

    # Create partner
    partner_name = f'SMOKE {scope} ORG {time.time_ns()}'
    stp, dp = _post_json(
        '/api/network/vpn-partners',
        {
            'org_name': partner_name,
            'partner_type': 'DEFAULT',
            'note': 'auto-created by scripts/_smoke_check_vpn_policy_scopes_http.py',
            'created_by_user_id': actor_user_id,
        },
    )
    if stp not in (200, 201):
        msg = (dp or {}).get('message') or (dp or {}).get('raw')
        return None, f'partner create failed status={stp} message={msg}'

    partner = (dp or {}).get('item') or {}
    partner_id = _coerce_int(partner.get('id'))
    if not partner_id:
        return None, f'partner create ok but missing id keys={list(partner.keys())}'

    # Create line
    stl, dl = _post_json(
        '/api/network/vpn-lines',
        {
            'vpn_partner_id': partner_id,
            'scope': scope,
            'status': '운영',
            'line_speed': '100Mbps',
            'line_count': 1,
            'protocol': 'IPSec',
            'manager': 'SMOKE',
            'cipher': 'AES-256',
            'note': 'auto-created by scripts/_smoke_check_vpn_policy_scopes_http.py',
            'created_by_user_id': actor_user_id,
        },
    )
    if stl not in (200, 201):
        msg = (dl or {}).get('message') or (dl or {}).get('raw')
        return None, f'line create failed status={stl} message={msg}'

    line = (dl or {}).get('item') or {}
    line_id = _coerce_int(line.get('id'))
    if not line_id:
        return None, f'line create ok but missing id keys={list(line.keys())}'

    return line_id, f'auto-created line_id={line_id} partner_id={partner_id}'


def main() -> int:
    checks: list[tuple[str, bool, str]] = []

    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    log_path = os.path.join(repo_root, 'smoke_vpn_policy_scopes_http_latest.txt')

    def ok(label: str, detail: str = ''):
        checks.append((label, True, detail))

    def bad(label: str, detail: str = ''):
        checks.append((label, False, detail))

    actor_user_id = None
    try:
        actor_user_id = _ensure_actor_user_id()
        if actor_user_id:
            ok('GET /api/session/me', f'user_id={actor_user_id}')
        else:
            # Not a hard failure: we can still validate existing lines/pages.
            ok('GET /api/session/me', 'no user id (auto-create disabled)')
    except Exception as e:
        ok('GET /api/session/me', f'unavailable (auto-create disabled): {type(e).__name__}: {e}')

    scopes = ['VPN2', 'VPN3', 'VPN4', 'VPN5']

    for scope in scopes:
        line_id, detail = _ensure_line_for_scope(scope, actor_user_id)
        if not line_id:
            bad(f'Ensure line for {scope}', detail)
            continue
        ok(f'Ensure line for {scope}', detail)

        st_line, d_line = _get_json(f'/api/network/vpn-lines/{line_id}')
        if st_line != 200 or not (d_line or {}).get('success'):
            bad(f'GET /api/network/vpn-lines/{line_id}', f'status={st_line}')
            continue

        line = (d_line or {}).get('item') or {}
        partner_id = _coerce_int(line.get('vpn_partner_id') or line.get('partner_id'))
        protocol = (line.get('protocol') or '').strip()
        if not partner_id:
            bad(f'GET /api/network/vpn-lines/{line_id}', f'missing vpn_partner_id keys={list(line.keys())}')
            continue

        st_partner, d_partner = _get_json(f'/api/network/vpn-partners/{partner_id}')
        if st_partner != 200 or not (d_partner or {}).get('success'):
            bad(f'GET /api/network/vpn-partners/{partner_id}', f'status={st_partner}')
            continue
        partner = (d_partner or {}).get('item') or {}
        org_name = (partner.get('org_name') or '').strip()

        # List page should render
        list_key = f'gov_vpn_policy{scope[-1]}'
        st, _ct, _html = _get_text(f'/p/{list_key}')
        if st != 200:
            bad(f'GET /p/{list_key}', f'status={st}')
        else:
            ok(f'GET /p/{list_key}')

        # Detail/tabs should:
        # - render header org_name / protocol server-side
        # - preserve vpn_line_id in all tab hrefs
        tab_keys = [
            f'gov_vpn_policy{scope[-1]}_detail',
            f'gov_vpn_policy{scope[-1]}_manager',
            f'gov_vpn_policy{scope[-1]}_communication',
            f'gov_vpn_policy{scope[-1]}_vpn_policy',
            f'gov_vpn_policy{scope[-1]}_task',
            f'gov_vpn_policy{scope[-1]}_log',
            f'gov_vpn_policy{scope[-1]}_file',
        ]
        q = urllib.parse.urlencode({'vpn_line_id': line_id})
        expected_links = [f'/p/{k}?{q}' for k in tab_keys]

        for k in tab_keys:
            stp, _ct, html = _get_text(f'/p/{k}?{q}')
            if stp != 200:
                bad(f'GET /p/{k}', f'status={stp}')
                continue

            # Header correctness (best-effort: must include org/protocol)
            if org_name and org_name not in html:
                bad(f'Header org_name on {k}', f'missing {org_name!r}')
            else:
                ok(f'Header org_name on {k}', org_name)

            if protocol and protocol not in html:
                bad(f'Header protocol on {k}', f'missing {protocol!r}')
            else:
                ok(f'Header protocol on {k}', protocol)

            # Query propagation across tabs
            missing = [href for href in expected_links if href not in html]
            if missing:
                bad(f'Tab query propagation on {k}', f'missing {len(missing)}/{len(expected_links)} links')
            else:
                ok(f'Tab query propagation on {k}', f'{len(expected_links)} links ok')

    failed = [c for c in checks if not c[1]]
    lines = []
    lines.append(f'VPN policy scopes HTTP smoke check @ {time.strftime("%Y-%m-%d %H:%M:%S") }')
    lines.append(f'BASE={BASE}')
    lines.append('')

    for label, ok_, detail in checks:
        status = 'OK ' if ok_ else 'FAIL'
        lines.append(f'[{status}] {label}' + (f' :: {detail}' if detail else ''))

    lines.append('')
    lines.append(f'TOTAL={len(checks)} FAIL={len(failed)}')

    with open(log_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')

    # Print tail summary
    print('\n'.join(lines[-25:]))

    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main())

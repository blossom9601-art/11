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


def _write_log(path: str, checks: list[tuple[str, bool, str]]):
    lines = []
    lines.append(f'BASE={BASE}')
    lines.append(f'ts={time.strftime("%Y-%m-%d %H:%M:%S")}')
    lines.append('')
    ok_cnt = 0
    for label, ok, detail in checks:
        if ok:
            ok_cnt += 1
        lines.append(f"{'OK ' if ok else 'BAD'}  {label}  {detail}".rstrip())
    lines.append('')
    lines.append(f'SUMMARY: {ok_cnt}/{len(checks)} passed')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')


def main() -> int:
    checks: list[tuple[str, bool, str]] = []
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    log_path = os.path.join(repo_root, 'smoke_tab05_accounts_http_latest.txt')

    def ok(label: str, detail: str = ''):
        checks.append((label, True, detail))

    def bad(label: str, detail: str = ''):
        checks.append((label, False, detail))

    # 0) Server up + global JS markers (ensures code is deployed)
    st_js, _, js = _get_text('/static/js/blossom.js')
    if st_js != 200:
        bad('GET /static/js/blossom.js (server up)', f'status={st_js}')
        _write_log(log_path, checks)
        print(f'[smoke-tab05] FAIL -> {log_path}')
        return 1
    ok('GET /static/js/blossom.js (server up)')

    required = ['function withAssetContext', 'decorateDetailTabLinks']
    missing = [m for m in required if m not in js]
    if missing:
        bad('blossom.js contains URL propagation', f'missing={missing}')
    else:
        ok('blossom.js contains URL propagation')

    st_t, _, tjs = _get_text('/static/js/tab05_account_global_api.js')
    if st_t != 200:
        bad('GET /static/js/tab05_account_global_api.js', f'status={st_t}')
    else:
        required2 = ['rememberContext', 'tab05:lastContext']
        missing2 = [m for m in required2 if m not in tjs]
        if missing2:
            bad('tab05_account_global_api.js contains localStorage fallback', f'missing={missing2}')
        else:
            ok('tab05_account_global_api.js contains localStorage fallback')

    # 2) Representative tab05-account pages + API GET.
    # We use asset_id=1 intentionally: the API should return success:true with an empty list when nothing exists.
    reps = [
        ('sw_os_unix_account', 'unix', 1),
        ('hw_network_l2_account', 'l2', 1),
        ('hw_security_firewall_account', 'firewall', 1),
        ('sw_db_rdbms_account', 'rdbms', 1),
        ('sw_middleware_web_account', 'web', 1),
    ]

    for key, scope, asset_id in reps:
        # system_key is required to prevent cross-system account sharing.
        qs = urllib.parse.urlencode({'asset_scope': scope, 'asset_id': str(asset_id), 'system_key': key})
        stp, ctp, html = _get_text(f'/p/{key}?{qs}')
        if stp != 200:
            bad(f'GET /p/{key}', f'status={stp}')
        else:
            # Ensure this is actually a tab05-account page with the expected table.
            if 'id="am-spec-table"' not in html:
                bad(f'GET /p/{key} has am-spec-table', f'content-type={ctp.split(";")[0]}')
            else:
                ok(f'GET /p/{key} has am-spec-table', f'bytes={len(html)}')

            # Header include should inject the global script.
            if '/static/js/tab05_account_global_api.js' not in html:
                bad(f'GET /p/{key} includes tab05 global script', 'missing script tag')
            else:
                ok(f'GET /p/{key} includes tab05 global script')

        st_api, data = _get_json(f'/api/asset-accounts?{qs}')
        if st_api != 200:
            bad(f'GET /api/asset-accounts ({scope}:{asset_id})', f'status={st_api} body={data!r}')
        else:
            if not (data or {}).get('success'):
                bad(f'GET /api/asset-accounts ({scope}:{asset_id}) success', f'body={data!r}')
            elif 'items' not in data:
                bad(f'GET /api/asset-accounts ({scope}:{asset_id}) items', f'keys={list((data or {}).keys())}')
            else:
                ok(f'GET /api/asset-accounts ({scope}:{asset_id})', f'items={len(data.get("items") or [])}')

    passed = sum(1 for _, okv, _ in checks if okv)
    _write_log(log_path, checks)

    if passed != len(checks):
        print(f'[smoke-tab05] FAIL {passed}/{len(checks)} -> {log_path}')
        return 1

    print(f'[smoke-tab05] OK {passed}/{len(checks)} -> {log_path}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

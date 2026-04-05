import json
import os
import sys
import time
import urllib.request
from urllib.error import HTTPError

BASE = 'http://127.0.0.1:8080'


def _req_json(method: str, path: str, payload: dict | None = None, timeout: int = 20):
    url = BASE + path
    data = None
    headers = {'Accept': 'application/json'}
    if payload is not None:
        data = json.dumps(payload).encode('utf-8')
        headers['Content-Type'] = 'application/json; charset=utf-8'
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode('utf-8', errors='replace')
            return resp.status, json.loads(raw)
    except HTTPError as e:
        raw = e.read().decode('utf-8', errors='replace')
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, {'raw': raw}


def _get_first_asset_id(list_path: str) -> int | None:
    st, data = _req_json('GET', list_path)
    if st != 200 or not isinstance(data, dict):
        return None
    items = data.get('items') or []
    if not items:
        return None
    first = items[0]
    if not isinstance(first, dict):
        return None
    aid = first.get('id') or first.get('asset_id')
    try:
        n = int(aid)
        return n if n > 0 else None
    except (TypeError, ValueError):
        return None


def _smoke_one(category: str, assets_list_path: str) -> list[tuple[str, bool, str]]:
    checks: list[tuple[str, bool, str]] = []

    def ok(label: str, detail: str = ''):
        checks.append((label, True, detail))

    def bad(label: str, detail: str = ''):
        checks.append((label, False, detail))

    asset_id = _get_first_asset_id(assets_list_path)
    if not asset_id:
        ok(f'{category}: assets empty', 'skip')
        return checks

    list_path = f'/api/hardware/server/backup-policies?asset_category={category}&asset_id={asset_id}'
    st0, d0 = _req_json('GET', list_path)
    if st0 != 200 or not (isinstance(d0, dict) and d0.get('success') is True):
        bad(f'{category}: GET backup policies', f'status={st0} body={d0!r}')
        return checks

    before_total = int(d0.get('total') or 0)
    ok(f'{category}: GET backup policies', f'asset_id={asset_id} total={before_total}')

    nonce = time.time_ns()
    create_payload = {
        'asset_category': category,
        'asset_id': asset_id,
        'policy_name': f'SMOKE_POLICY_{nonce}',
        'backup_directory': f'/smoke/{nonce}',
        'library': 'SMOKE',
        'data': 'SMOKE',
        'grade': '1등급',
        'retention': '7d',
        'offsite_yn': 'O',
        'media': 'TAPE',
        'schedule': 'DAILY',
        'start_time': '01:23',
    }

    st1, d1 = _req_json('POST', '/api/hardware/server/backup-policies', create_payload)
    if st1 not in (200, 201) or not (isinstance(d1, dict) and d1.get('success') is True):
        bad(f'{category}: POST backup policy', f'status={st1} body={d1!r}')
        return checks

    item = (d1.get('item') or {}) if isinstance(d1, dict) else {}
    policy_id = item.get('id')
    if not policy_id:
        bad(f'{category}: POST backup policy', f'created but missing id keys={list(item.keys())}')
        return checks

    ok(f'{category}: POST backup policy', f'policy_id={policy_id}')

    st2, d2 = _req_json(
        'PUT',
        f'/api/hardware/server/backup-policies/{int(policy_id)}',
        {'policy_name': f'SMOKE_POLICY_UPDATED_{nonce}'},
    )
    if st2 != 200 or not (isinstance(d2, dict) and d2.get('success') is True):
        bad(f'{category}: PUT backup policy', f'status={st2} body={d2!r}')
    else:
        ok(f'{category}: PUT backup policy', 'ok')

    st3, d3 = _req_json('DELETE', f'/api/hardware/server/backup-policies/{int(policy_id)}')
    if st3 != 200 or not (isinstance(d3, dict) and d3.get('success') is True):
        bad(f'{category}: DELETE backup policy', f'status={st3} body={d3!r}')
    else:
        ok(f'{category}: DELETE backup policy', 'ok')

    st4, d4 = _req_json('GET', list_path)
    if st4 != 200 or not (isinstance(d4, dict) and d4.get('success') is True):
        bad(f'{category}: GET backup policies (after)', f'status={st4} body={d4!r}')
    else:
        after_total = int(d4.get('total') or 0)
        if after_total != before_total:
            bad(f'{category}: total restored', f'before={before_total} after={after_total}')
        else:
            ok(f'{category}: total restored', f'total={after_total}')

    return checks


def main() -> int:
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    log_path = os.path.join(repo_root, 'smoke_hw_server_tab03_backup_http_latest.txt')

    all_checks: list[tuple[str, bool, str]] = []
    all_checks += _smoke_one('ON_PREMISE', '/api/hardware/onpremise/assets')
    all_checks += _smoke_one('CLOUD', '/api/hardware/cloud/assets')
    all_checks += _smoke_one('WORKSTATION', '/api/hardware/workstation/assets')

    passed = sum(1 for _, ok, _ in all_checks if ok)
    total = len(all_checks)

    lines = []
    lines.append(f'BASE={BASE}')
    lines.append(f'checks={passed}/{total}')
    for label, okv, detail in all_checks:
        lines.append(f"[{'OK' if okv else 'FAIL'}] {label} {detail}".rstrip())

    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    with open(log_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')

    print('\n'.join(lines))
    return 0 if passed == total else 2


if __name__ == '__main__':
    raise SystemExit(main())

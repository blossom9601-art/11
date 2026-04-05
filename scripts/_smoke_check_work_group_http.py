import json
import os
import sys
import time
import urllib.request
from urllib.error import HTTPError, URLError

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


def main() -> int:
    checks: list[tuple[str, bool, str]] = []
    errors: list[str] = []

    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    log_path = os.path.join(repo_root, 'smoke_work_group_http_latest.txt')

    def ok(label: str, detail: str = ''):
        checks.append((label, True, detail))

    def bad(label: str, detail: str = ''):
        checks.append((label, False, detail))

    gid = None
    created_smoke_gid = None
    created_smoke_status_id = None
    created_smoke_division_id = None
    created_smoke_dept_id = None
    try:
        st, data = _get_json('/api/work-groups')
        if st != 200:
            bad('GET /api/work-groups', f'status={st}')
        else:
            items = data.get('items') or []
            if not items:
                # Dev DB may be empty; create a temporary record so we can exercise scoped APIs.
                try:
                    unique_code = f"SMOKE_{time.time_ns()}"

                    # Work Group has FK constraints; pick existing codes from APIs.
                    status_code = None
                    division_code = None
                    dept_code = None

                    sts, ds = _get_json('/api/work-statuses')
                    if sts == 200:
                        s_items = (ds.get('items') or []) if isinstance(ds, dict) else []
                        if not s_items:
                            stc, dc = _post_json(
                                '/api/work-statuses',
                                {
                                    'status_code': f"SMOKE_STATUS_{time.time_ns()}",
                                    'status_name': 'SMOKE: Status',
                                    'description': 'auto-created by scripts/_smoke_check_work_group_http.py',
                                },
                            )
                            if stc in (200, 201):
                                item = (dc or {}).get('item') or {}
                                created_smoke_status_id = item.get('id')
                                s_items = [item]
                        if s_items:
                            s0 = s_items[0]
                            status_code = s0.get('status_code') or s0.get('work_status_code')

                    std, dd = _get_json('/api/work-divisions')
                    if std == 200:
                        d_items = (dd.get('items') or []) if isinstance(dd, dict) else []
                        if not d_items:
                            stc, dc = _post_json(
                                '/api/work-divisions',
                                {
                                    'division_code': f"SMOKE_DIV_{time.time_ns()}",
                                    'division_name': 'SMOKE: Division',
                                    'description': 'auto-created by scripts/_smoke_check_work_group_http.py',
                                },
                            )
                            if stc in (200, 201):
                                item = (dc or {}).get('item') or {}
                                created_smoke_division_id = item.get('id')
                                d_items = [item]
                        if d_items:
                            d0 = d_items[0]
                            division_code = d0.get('division_code') or d0.get('work_division_code')

                    sdept, ddept = _get_json('/api/org-departments')
                    if sdept == 200:
                        dept_items = (ddept.get('items') or []) if isinstance(ddept, dict) else []
                        if not dept_items:
                            stc, dc = _post_json(
                                '/api/org-departments',
                                {
                                    'dept_code': f"SMOKE_DEPT_{time.time_ns()}",
                                    'dept_name': 'SMOKE: Department',
                                    'description': 'auto-created by scripts/_smoke_check_work_group_http.py',
                                },
                            )
                            if stc in (200, 201):
                                item = (dc or {}).get('item') or {}
                                created_smoke_dept_id = item.get('id')
                                dept_items = [item]
                        if dept_items:
                            dept0 = dept_items[0]
                            dept_code = dept0.get('dept_code')

                    if not (status_code and division_code and dept_code):
                        bad(
                            'POST /api/work-groups',
                            'no items; cannot auto-create (missing FK codes from work-statuses/work-divisions/org-departments)',
                        )
                        raise RuntimeError('Missing FK codes for work group create')

                    payload = {
                        'group_name': 'SMOKE: Work Group',
                        'status_code': status_code,
                        'division_code': division_code,
                        'dept_code': dept_code,
                        'group_code': unique_code,
                        'description': 'auto-created by scripts/_smoke_check_work_group_http.py',
                    }
                    stc, dc = _post_json('/api/work-groups', payload)
                    if stc not in (200, 201):
                        msg = None
                        if isinstance(dc, dict):
                            msg = dc.get('message') or dc.get('raw')
                        bad('POST /api/work-groups', f'status={stc}' + (f" message={msg}" if msg else ''))
                    else:
                        item = (dc or {}).get('item') or {}
                        created_smoke_gid = item.get('id') or item.get('group_id')
                        gid = created_smoke_gid
                        if gid is None:
                            bad('POST /api/work-groups', f'created but cannot find id in keys={list(item.keys())}')
                        else:
                            ok('POST /api/work-groups', f'created gid={gid}')
                except Exception as e:
                    bad('GET /api/work-groups', f'no items; auto-create failed: {type(e).__name__}: {e}')
            else:
                first = items[0]
                gid = first.get('id') or first.get('group_id')
                if gid is None:
                    bad('GET /api/work-groups', f'cannot find id in keys={list(first.keys())}')
                else:
                    ok('GET /api/work-groups', f'items={len(items)} gid={gid}')

        if gid is not None:
            api_paths = [
                f'/api/work-groups/{gid}',
                f'/api/work-groups/{gid}/managers',
                f'/api/work-groups/{gid}/change-logs?limit=20',
                f'/api/work-groups/{gid}/wrk/reports?limit=20',
                f'/api/work-groups/{gid}/maintenance/systems?year=2025',
                f'/api/work-groups/{gid}/files?kind=diagram',
                f'/api/work-groups/{gid}/files?kind=attachment',
            ]
            for p in api_paths:
                st2, d2 = _get_json(p)
                if st2 != 200:
                    bad(f'GET {p}', f'status={st2}')
                    continue
                detail = ''
                if isinstance(d2, dict) and 'total' in d2:
                    detail = f"total={d2.get('total')}"
                ok(f'GET {p}', detail)

        page_paths = [
            '/p/cat_business_group',
            '/p/cat_business_group_detail',
            '/p/cat_business_group_manager',
            '/p/cat_business_group_system',
            '/p/cat_business_group_maintenance',
            '/p/cat_business_group_task',
            '/p/cat_business_group_log',
            '/p/cat_business_group_file',
        ]
        for p in page_paths:
            try:
                st3, ctype3, body3 = _get(p, accept='text/html')
                if st3 != 200:
                    bad(f'GET {p}', f'status={st3}')
                    continue
                ok(f'GET {p}', f'content-type={ctype3.split(";")[0]} bytes={len(body3)}')
            except HTTPError as e:
                bad(f'GET {p}', f'HTTPError status={e.code}')

        # Best-effort cleanup of the temporary record.
        if created_smoke_gid is not None:
            try:
                std, dd = _post_json('/api/work-groups/bulk-delete', {'ids': [created_smoke_gid]})
                if std != 200:
                    bad('POST /api/work-groups/bulk-delete', f'status={std}')
                else:
                    ok('POST /api/work-groups/bulk-delete', f"deleted={dd.get('deleted')}")
            except Exception as e:
                bad('POST /api/work-groups/bulk-delete', f'{type(e).__name__}: {e}')

        if created_smoke_status_id is not None:
            try:
                std, dd = _post_json('/api/work-statuses/bulk-delete', {'ids': [created_smoke_status_id]})
                if std == 200:
                    ok('POST /api/work-statuses/bulk-delete', f"deleted={dd.get('deleted')}")
                else:
                    bad('POST /api/work-statuses/bulk-delete', f'status={std}')
            except Exception as e:
                bad('POST /api/work-statuses/bulk-delete', f'{type(e).__name__}: {e}')

        if created_smoke_division_id is not None:
            try:
                std, dd = _post_json('/api/work-divisions/bulk-delete', {'ids': [created_smoke_division_id]})
                if std == 200:
                    ok('POST /api/work-divisions/bulk-delete', f"deleted={dd.get('deleted')}")
                else:
                    bad('POST /api/work-divisions/bulk-delete', f'status={std}')
            except Exception as e:
                bad('POST /api/work-divisions/bulk-delete', f'{type(e).__name__}: {e}')

        if created_smoke_dept_id is not None:
            try:
                std, dd = _post_json('/api/org-departments/bulk-delete', {'ids': [created_smoke_dept_id]})
                if std == 200:
                    ok('POST /api/org-departments/bulk-delete', f"deleted={dd.get('deleted')}")
                else:
                    bad('POST /api/org-departments/bulk-delete', f'status={std}')
            except Exception as e:
                bad('POST /api/org-departments/bulk-delete', f'{type(e).__name__}: {e}')

    except (HTTPError, URLError) as e:
        msg = f'{type(e).__name__}: {e}'
        errors.append(msg)
        bad('HTTP request failed', msg)
    except Exception as e:
        msg = f'{type(e).__name__}: {e}'
        errors.append(msg)
        bad('Unhandled exception', msg)

    failed = [c for c in checks if not c[1]]

    lines: list[str] = []
    lines.append('=== Work Group smoke check ===')
    for label, success, detail in checks:
        prefix = 'OK  ' if success else 'FAIL'
        lines.append(f"{prefix} {label}{(' -> ' + detail) if detail else ''}")

    if failed:
        lines.append(f"\nFAILED: {len(failed)}/{len(checks)} checks")
    else:
        lines.append(f"\nPASSED: {len(checks)}/{len(checks)} checks")

    # Always write a stable log file for inspection.
    try:
        with open(log_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(lines) + '\n')
            if errors:
                f.write('\n[errors]\n')
                for e in errors:
                    f.write(e + '\n')
    except Exception:
        pass

    print('\n'.join(lines))
    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main())

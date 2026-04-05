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


def _delete(path: str):
    url = BASE + path
    req = urllib.request.Request(url, headers={'Accept': 'application/json'}, method='DELETE')
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read().decode('utf-8', errors='replace')
            try:
                return resp.status, json.loads(body)
            except json.JSONDecodeError:
                return resp.status, {'raw': body}
    except HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        try:
            return e.code, json.loads(body)
        except json.JSONDecodeError:
            return e.code, {'raw': body}


def _post_multipart_upload(file_name: str, content: bytes, mime: str = 'application/octet-stream'):
    # Minimal multipart/form-data encoder for /api/uploads (expects form field name: file)
    boundary = f'----blossom-smoke-{time.time_ns()}'
    parts = []

    parts.append(f'--{boundary}\r\n'.encode('utf-8'))
    parts.append(
        (
            'Content-Disposition: form-data; name="file"; filename="%s"\r\n' % file_name
        ).encode('utf-8')
    )
    parts.append((f'Content-Type: {mime}\r\n\r\n').encode('utf-8'))
    parts.append(content)
    parts.append(b'\r\n')
    parts.append((f'--{boundary}--\r\n').encode('utf-8'))

    body = b''.join(parts)
    url = BASE + '/api/uploads'
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            'Accept': 'application/json',
            'Content-Type': f'multipart/form-data; boundary={boundary}',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            text = resp.read().decode('utf-8', errors='replace')
            return resp.status, json.loads(text)
    except HTTPError as e:
        text = e.read().decode('utf-8', errors='replace')
        try:
            return e.code, json.loads(text)
        except json.JSONDecodeError:
            return e.code, {'raw': text}


def main() -> int:
    checks: list[tuple[str, bool, str]] = []
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    log_path = os.path.join(repo_root, 'smoke_tab15_files_http_latest.txt')

    def ok(label: str, detail: str = ''):
        checks.append((label, True, detail))

    def bad(label: str, detail: str = ''):
        checks.append((label, False, detail))

    # Representative page keys that use tab15-file UI.
    # Not all may be enabled in every environment, so we treat missing pages as non-fatal.
    scope_keys = [
        'hw_server_onpremise_file',
        'hw_security_ips_file',
        'cat_hw_server_file',
        'cat_vendor_manufacturer_file',
        'gov_vpn_policy_file',
    ]

    smoke_owner = f'SMOKE_TAB15_{time.time_ns()}'

    # 1) Upload
    st_up, up = _post_multipart_upload('smoke_tab15.txt', b'hello tab15-file')
    if st_up not in (200, 201):
        msg = (up or {}).get('error') or (up or {}).get('message') or (up or {}).get('raw')
        bad('POST /api/uploads', f'status={st_up} message={msg}')
        _write_log(log_path, checks)
        return 1
    upload_token = (up or {}).get('id')
    if not upload_token:
        bad('POST /api/uploads', f'missing id keys={list((up or {}).keys())}')
        _write_log(log_path, checks)
        return 1
    ok('POST /api/uploads', f'upload_token={upload_token}')

    # 2) For each scope key: create diagram + attachment, list, delete
    for scope in scope_keys:
        # Best-effort HTML page render check
        q = urllib.parse.urlencode({'id': smoke_owner})
        stp, ct, html = _get_text(f'/p/{scope}?{q}')
        if stp == 200:
            ok(f'GET /p/{scope}', f'content-type={ct.split(";")[0]} bytes={len(html)}')
        else:
            ok(f'GET /p/{scope}', f'status={stp} (non-fatal)')

        # Diagram (primary)
        st_d, d = _post_json(
            '/api/tab15-files',
            {
                'scope_key': scope,
                'owner_key': smoke_owner,
                'entry_type': 'DIAGRAM',
                'upload_token': upload_token,
                'file_name': f'{scope}_diagram.png',
                'file_size': int((up or {}).get('size') or 0),
                'mime_type': 'image/png',
                'is_primary': True,
                'kind': 'diagram',
                'description': 'smoke diagram',
            },
        )
        if st_d not in (200, 201) or not (d or {}).get('success'):
            msg = (d or {}).get('message') or (d or {}).get('raw')
            bad(f'POST /api/tab15-files DIAGRAM ({scope})', f'status={st_d} message={msg}')
            continue
        diagram_item = (d or {}).get('item') or {}
        diagram_id = diagram_item.get('id')
        ok(f'POST /api/tab15-files DIAGRAM ({scope})', f'id={diagram_id}')

        # Attachment
        st_a, a = _post_json(
            '/api/tab15-files',
            {
                'scope_key': scope,
                'owner_key': smoke_owner,
                'entry_type': 'ATTACHMENT',
                'upload_token': upload_token,
                'file_name': f'{scope}_attach.txt',
                'file_size': int((up or {}).get('size') or 0),
                'mime_type': 'text/plain',
                'is_primary': False,
                'kind': 'attachment',
                'description': 'smoke attachment',
            },
        )
        if st_a not in (200, 201) or not (a or {}).get('success'):
            msg = (a or {}).get('message') or (a or {}).get('raw')
            bad(f'POST /api/tab15-files ATTACHMENT ({scope})', f'status={st_a} message={msg}')
            continue
        attach_item = (a or {}).get('item') or {}
        attach_id = attach_item.get('id')
        ok(f'POST /api/tab15-files ATTACHMENT ({scope})', f'id={attach_id}')

        # List
        qs = urllib.parse.urlencode({'scope_key': scope, 'owner_key': smoke_owner})
        st_l, l = _get_json(f'/api/tab15-files?{qs}')
        if st_l != 200 or not (l or {}).get('success'):
            bad(f'GET /api/tab15-files ({scope})', f'status={st_l}')
        else:
            items = (l or {}).get('items') or []
            ok(f'GET /api/tab15-files ({scope})', f'items={len(items)}')

        # Delete (entries); this also deletes upload (delete_upload=1). Use non-fatal handling for shared token.
        if attach_id:
            stx, dx = _delete(f'/api/tab15-files/{attach_id}?delete_upload=1')
            if stx != 200 or not (dx or {}).get('success'):
                bad(f'DELETE /api/tab15-files/{attach_id} ({scope})', f'status={stx}')
            else:
                ok(f'DELETE /api/tab15-files/{attach_id} ({scope})')
        if diagram_id:
            stx, dx = _delete(f'/api/tab15-files/{diagram_id}?delete_upload=1')
            if stx != 200 or not (dx or {}).get('success'):
                bad(f'DELETE /api/tab15-files/{diagram_id} ({scope})', f'status={stx}')
            else:
                ok(f'DELETE /api/tab15-files/{diagram_id} ({scope})')

    # Cleanup: best-effort delete upload token (might already be gone)
    st_del, dd = _delete(f'/api/uploads/{urllib.parse.quote(str(upload_token))}')
    if st_del in (200, 404):
        ok('DELETE /api/uploads/<token>', f'status={st_del}')
    else:
        bad('DELETE /api/uploads/<token>', f'status={st_del} body={(dd or {}).get("raw") or dd}')

    _write_log(log_path, checks)

    failed = [c for c in checks if not c[1]]
    return 0 if not failed else 1


def _write_log(path: str, checks: list[tuple[str, bool, str]]):
    lines = []
    ok_count = sum(1 for _l, ok, _d in checks if ok)
    bad_count = sum(1 for _l, ok, _d in checks if not ok)
    lines.append(f'Tab15-file HTTP smoke check: ok={ok_count} bad={bad_count}')
    lines.append('')
    for label, ok, detail in checks:
        status = 'OK ' if ok else 'BAD'
        if detail:
            lines.append(f'[{status}] {label} :: {detail}')
        else:
            lines.append(f'[{status}] {label}')
    with open(path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')


if __name__ == '__main__':
    raise SystemExit(main())

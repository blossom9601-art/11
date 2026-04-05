import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


BASE = 'http://127.0.0.1:8080'


def _cookie_opener():
    jar = urllib.request.HTTPCookieProcessor()
    opener = urllib.request.build_opener(jar)
    return opener


def _req(opener, method: str, path: str, *, form=None, json_body=None, timeout=10, headers=None):
    url = BASE + path
    data = None
    hdrs = dict(headers or {})

    if form is not None:
        data = urllib.parse.urlencode(form).encode('utf-8')
        hdrs.setdefault('Content-Type', 'application/x-www-form-urlencoded')

    if json_body is not None:
        data = json.dumps(json_body).encode('utf-8')
        hdrs.setdefault('Content-Type', 'application/json')

    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with opener.open(req, timeout=timeout) as resp:
            body = resp.read().decode('utf-8', 'replace')
            return resp.status, body, dict(resp.headers)
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', 'replace')
        return e.code, body, dict(getattr(e, 'headers', {}) or {})


def _get_json(opener, method: str, path: str, *, json_body=None):
    status, body, headers = _req(opener, method, path, json_body=json_body)
    try:
        return status, json.loads(body), headers
    except Exception:
        return status, {'_raw': body}, headers


def login(opener, employee_id: str, password: str) -> tuple[int, str]:
    # Hit login page first (some apps set cookies)
    _req(opener, 'GET', '/login')

    status, body, _headers = _req(
        opener,
        'POST',
        '/login',
        form={'employee_id': employee_id, 'password': password},
        headers={'Referer': BASE + '/login'},
    )

    # urllib typically follows redirects automatically, so response codes can vary.
    # We'll validate authentication by attempting a write API call later.
    return status, body


def main():
    emp = os.environ.get('BLOSSOM_EMPLOYEE_ID', '').strip()
    pw = os.environ.get('BLOSSOM_PASSWORD', '').strip()
    if not emp or not pw:
        print('Set env vars BLOSSOM_EMPLOYEE_ID and BLOSSOM_PASSWORD to run this smoke check.')
        return 2

    opener = _cookie_opener()

    login_status, _login_body = login(opener, emp, pw)
    print('[INFO] login attempted; status=', login_status)

    # Pick a vendor id from APIs
    status, vendors, _ = _get_json(opener, 'GET', '/api/vendor-manufacturers')
    if status != 200 or not vendors.get('success') or not vendors.get('items'):
        print('[WARN] cannot fetch vendor manufacturers; status=', status)
        return 1

    vid = int(vendors['items'][0]['id'])

    # Create -> Update -> Delete
    payload = {
        'vendor_kind': 'manufacturer',
        'vendor_id': vid,
        'category': '서버',
        'model': 'SMOKE-HW-AUTH',
        'type': '서버',
        'qty': 1,
        'remark': 'smoke',
    }

    status, created, _ = _get_json(opener, 'POST', '/api/vendor-hardware', json_body=payload)
    if status in (401, 403):
        print('[FAIL] write API unauthorized after login (check credentials/session). status=', status)
        return 1
    if status not in (200, 201) or not created.get('success'):
        print('[FAIL] POST /api/vendor-hardware status=', status, 'body=', created)
        return 1

    item_id = created['item']['id']
    print('[OK] POST id=', item_id)

    payload['remark'] = 'smoke-updated'
    status, updated, _ = _get_json(opener, 'PUT', f'/api/vendor-hardware/{item_id}', json_body=payload)
    if status != 200 or not updated.get('success'):
        print('[FAIL] PUT status=', status, 'body=', updated)
        return 1
    print('[OK] PUT')

    status, deleted, _ = _get_json(opener, 'DELETE', f'/api/vendor-hardware/{item_id}')
    if status != 200 or not deleted.get('success'):
        print('[FAIL] DELETE status=', status, 'body=', deleted)
        return 1
    print('[OK] DELETE')

    return 0


if __name__ == '__main__':
    raise SystemExit(main())

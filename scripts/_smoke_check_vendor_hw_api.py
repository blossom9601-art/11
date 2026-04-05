import json
import sys
import urllib.error
import urllib.request

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


BASE = 'http://127.0.0.1:8080'


def _req(method: str, path: str, payload=None, timeout=10):
    url = BASE + path
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode('utf-8', 'replace')
            return resp.status, body
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', 'replace')
        return e.code, body


def _get_json(method: str, path: str, payload=None):
    status, body = _req(method, path, payload)
    try:
        return status, json.loads(body)
    except Exception:
        return status, {'_raw': body}


def _pick_vendor_id(kind: str):
    if kind == 'manufacturer':
        status, data = _get_json('GET', '/api/vendor-manufacturers')
    else:
        status, data = _get_json('GET', '/api/vendor-maintenance')

    if status != 200 or not isinstance(data, dict) or not data.get('success'):
        print(f'[WARN] cannot list vendors for {kind}: status={status} data={data}')
        return None

    items = data.get('items') or []
    if not items:
        print(f'[WARN] no vendors returned for {kind}; skipping')
        return None

    vid = items[0].get('id')
    try:
        return int(vid)
    except Exception:
        print(f'[WARN] vendor id not int for {kind}: {vid!r}')
        return None


def _try_api_crud(kind: str, vendor_id: int):
    print(f'\n=== vendor-hardware API smoke: {kind} vendor_id={vendor_id} ===')

    status, data = _get_json('GET', f'/api/vendor-hardware?vendor_kind={kind}&vendor_id={vendor_id}')
    print('[GET] status=', status, 'total=', (data.get('total') if isinstance(data, dict) else None))

    # Create
    if kind == 'manufacturer':
        payload = {
            'vendor_kind': kind,
            'vendor_id': vendor_id,
            'category': '서버',
            'model': 'SMOKE-HW-MODEL',
            'type': '서버',
            'qty': 2,
            'remark': 'smoke',
        }
    else:
        payload = {
            'vendor_kind': kind,
            'vendor_id': vendor_id,
            'status': '가동',
            'category': '서버',
            'model': 'SMOKE-HW-MODEL',
            'type': '서버',
            'mgmt_no': 'SMOKE-MGMT',
            'serial_no': 'SMOKE-SERIAL',
            'remark': 'smoke',
        }

    status, created = _get_json('POST', '/api/vendor-hardware', payload)
    if status in (401, 403):
        print('[POST] blocked by auth (expected). status=', status)
        return False
    if status not in (200, 201) or not isinstance(created, dict) or not created.get('success'):
        print('[POST] FAILED status=', status, 'body=', created)
        return False

    item = created.get('item') or {}
    item_id = item.get('id')
    print('[POST] status=', status, 'id=', item_id)

    # Update
    patch = dict(payload)
    patch['remark'] = 'smoke-updated'
    status, updated = _get_json('PUT', f'/api/vendor-hardware/{item_id}', patch)
    ok_update = status == 200 and isinstance(updated, dict) and updated.get('success')
    print('[PUT] status=', status, 'ok=', ok_update)

    # Delete
    status, deleted = _get_json('DELETE', f'/api/vendor-hardware/{item_id}')
    ok_delete = status == 200 and isinstance(deleted, dict) and deleted.get('success')
    print('[DELETE] status=', status, 'ok=', ok_delete)

    # Re-list
    status, data2 = _get_json('GET', f'/api/vendor-hardware?vendor_kind={kind}&vendor_id={vendor_id}')
    print('[GET after] status=', status, 'total=', (data2.get('total') if isinstance(data2, dict) else None))
    return True


def _service_fallback(kind: str, vendor_id: int):
    print(f'\n=== service fallback CRUD: {kind} vendor_id={vendor_id} ===')
    from app import create_app
    from app.services.vendor_hardware_service import (
        list_vendor_hardware,
        create_vendor_hardware,
        update_vendor_hardware,
        delete_vendor_hardware,
    )

    app = create_app()
    app.app_context().push()

    before = list_vendor_hardware(vendor_kind=kind, vendor_id=vendor_id)
    print('[svc list] before total=', len(before))

    if kind == 'manufacturer':
        payload = {
            'vendor_kind': kind,
            'vendor_id': vendor_id,
            'category': '서버',
            'model': 'SMOKE-HW-MODEL-SVC',
            'type': '서버',
            'qty': 2,
            'remark': 'smoke',
        }
    else:
        payload = {
            'vendor_kind': kind,
            'vendor_id': vendor_id,
            'status': '가동',
            'category': '서버',
            'model': 'SMOKE-HW-MODEL-SVC',
            'type': '서버',
            'mgmt_no': 'SMOKE-MGMT',
            'serial_no': 'SMOKE-SERIAL',
            'remark': 'smoke',
        }

    created = create_vendor_hardware(payload, actor='system')
    item_id = created['id']
    print('[svc create] id=', item_id)

    status, api_mid = _get_json('GET', f'/api/vendor-hardware?vendor_kind={kind}&vendor_id={vendor_id}')
    mid_total = api_mid.get('total') if isinstance(api_mid, dict) else None
    mid_items = api_mid.get('items') if isinstance(api_mid, dict) else None
    mid_has_id = False
    try:
        mid_has_id = any(int(it.get('id')) == int(item_id) for it in (mid_items or []) if isinstance(it, dict) and it.get('id') is not None)
    except Exception:
        mid_has_id = False
    print('[GET api after create] status=', status, 'total=', mid_total, 'has_id=', mid_has_id)

    created['remark'] = 'smoke-updated'
    updated = update_vendor_hardware(item_id, created, actor='system')
    print('[svc update] ok=', bool(updated))

    ok_del = delete_vendor_hardware(item_id, actor='system')
    print('[svc delete] ok=', ok_del)

    after = list_vendor_hardware(vendor_kind=kind, vendor_id=vendor_id)
    print('[svc list] after total=', len(after))

    # confirm API sees it
    status, data = _get_json('GET', f'/api/vendor-hardware?vendor_kind={kind}&vendor_id={vendor_id}')
    print('[GET api after svc] status=', status, 'total=', (data.get('total') if isinstance(data, dict) else None))


def main():
    kinds = [('manufacturer', _pick_vendor_id('manufacturer')), ('maintenance', _pick_vendor_id('maintenance'))]
    did_any = False
    for kind, vendor_id in kinds:
        if not vendor_id:
            continue
        did_any = True
        ok = _try_api_crud(kind, vendor_id)
        if not ok:
            _service_fallback(kind, vendor_id)

    if not did_any:
        print('[WARN] No vendor ids found; nothing to test.')
        return 2
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

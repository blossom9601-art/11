import json
import argparse
import sys
import time
import urllib.error
import urllib.request

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

BASE = 'http://127.0.0.1:8080'


def _log(enabled: bool, msg: str):
    if enabled:
        print(msg)


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


def _assert(cond: bool, msg: str):
    if not cond:
        raise AssertionError(msg)


def _find_vendor_item(items, vendor_id: int):
    for it in items or []:
        if isinstance(it, dict) and it.get('id') == vendor_id:
            return it
    return None


def _get_sw_count(kind: str, vendor_id: int) -> int:
    if kind == 'manufacturer':
        status, data = _get_json('GET', f'/api/vendor-manufacturers?q={vendor_id}')
    else:
        status, data = _get_json('GET', f'/api/vendor-maintenance?q={vendor_id}')

    _assert(status == 200 and isinstance(data, dict) and data.get('success'), f'list vendors failed: status={status} data={data}')
    item = _find_vendor_item(data.get('items') or [], vendor_id)
    if not item:
        # fallback: list without q
        if kind == 'manufacturer':
            status, data = _get_json('GET', '/api/vendor-manufacturers')
        else:
            status, data = _get_json('GET', '/api/vendor-maintenance')
        _assert(status == 200 and isinstance(data, dict) and data.get('success'), f'list vendors failed(2): status={status} data={data}')
        item = _find_vendor_item(data.get('items') or [], vendor_id)

    _assert(bool(item), f'cannot find vendor id={vendor_id} in list response')
    raw = item.get('software_qty')
    try:
        return int(raw or 0)
    except Exception:
        return 0


def _create_vendor(kind: str):
    ts = int(time.time() * 1000)
    if kind == 'manufacturer':
        payload = {
            'manufacturer_code': f'SMOKE-MF-{ts}',
            'manufacturer_name': f'SMOKE 제조사 {ts}',
            'remark': 'smoke',
        }
        status, data = _get_json('POST', '/api/vendor-manufacturers', payload)
    else:
        payload = {
            'maintenance_code': f'SMOKE-MT-{ts}',
            'maintenance_name': f'SMOKE 유지보수사 {ts}',
            'remark': 'smoke',
        }
        status, data = _get_json('POST', '/api/vendor-maintenance', payload)

    _assert(status in (200, 201) and isinstance(data, dict) and data.get('success'), f'create vendor failed: status={status} data={data}')
    item = data.get('item') or {}
    vendor_id = item.get('id')
    _assert(isinstance(vendor_id, int) and vendor_id > 0, f'bad vendor_id: {vendor_id!r}')
    return vendor_id


def _delete_vendor(kind: str, vendor_id: int):
    payload = {'ids': [vendor_id]}
    if kind == 'manufacturer':
        status, data = _get_json('POST', '/api/vendor-manufacturers/bulk-delete', payload)
    else:
        status, data = _get_json('POST', '/api/vendor-maintenance/bulk-delete', payload)
    _assert(status == 200 and isinstance(data, dict) and data.get('success'), f'delete vendor failed: status={status} data={data}')


def _test_manufacturer(vendor_id: int, verbose: bool):
    _log(verbose, f'\n=== tab44 manufacturer software CRUD vendor_id={vendor_id} ===')

    status, data = _get_json('GET', f'/api/vendor-manufacturers/{vendor_id}/software')
    _assert(status == 200 and data.get('success') and data.get('total') == 0, f'initial list not empty: {status} {data}')
    _assert(_get_sw_count('manufacturer', vendor_id) == 0, 'initial sw_count must be 0')

    payload = {
        'category': 'OS',
        'model': 'SMOKE-SW-MODEL',
        'type': 'Server',
        'qty': 2,
        'remark': 'smoke',
    }
    status, created = _get_json('POST', f'/api/vendor-manufacturers/{vendor_id}/software', payload)
    _assert(status in (200, 201) and created.get('success'), f'create software failed: {status} {created}')
    item = created.get('item') or {}
    sw_id = item.get('id')
    _assert(isinstance(sw_id, int) and sw_id > 0, f'bad sw_id: {sw_id!r}')

    status, listed = _get_json('GET', f'/api/vendor-manufacturers/{vendor_id}/software')
    _assert(status == 200 and listed.get('success') and listed.get('total') == 1, f'list after create failed: {status} {listed}')
    _assert(_get_sw_count('manufacturer', vendor_id) == 2, 'sw_count must be SUM(qty)=2 after create')

    patch = dict(payload)
    patch['qty'] = 3
    patch['remark'] = 'smoke-updated'
    status, updated = _get_json('PUT', f'/api/vendor-manufacturers/{vendor_id}/software/{sw_id}', patch)
    _assert(status == 200 and updated.get('success'), f'update software failed: {status} {updated}')
    _assert(_get_sw_count('manufacturer', vendor_id) == 3, 'sw_count must be SUM(qty)=3 after update')

    status, deleted = _get_json('DELETE', f'/api/vendor-manufacturers/{vendor_id}/software/{sw_id}')
    _assert(status == 200 and deleted.get('success'), f'delete software failed: {status} {deleted}')

    status, listed2 = _get_json('GET', f'/api/vendor-manufacturers/{vendor_id}/software')
    _assert(status == 200 and listed2.get('success') and listed2.get('total') == 0, f'list after delete failed: {status} {listed2}')
    _assert(_get_sw_count('manufacturer', vendor_id) == 0, 'sw_count must be 0 after delete')

    _log(verbose, '[OK] manufacturer tab44 software CRUD + sw_count')


def _test_maintenance(vendor_id: int, verbose: bool):
    _log(verbose, f'\n=== tab44 maintenance software CRUD vendor_id={vendor_id} ===')

    status, data = _get_json('GET', f'/api/vendor-maintenance/{vendor_id}/software')
    _assert(status == 200 and data.get('success') and data.get('total') == 0, f'initial list not empty: {status} {data}')
    _assert(_get_sw_count('maintenance', vendor_id) == 0, 'initial sw_count must be 0')

    payload = {
        'status': '유지보수',
        'category': 'OS',
        'model': 'SMOKE-SW-MODEL',
        'type': 'Server',
        'mgmt_no': 'SMOKE-MGMT',
        'serial_no': 'SMOKE-SERIAL',
        'remark': 'smoke',
    }
    status, created = _get_json('POST', f'/api/vendor-maintenance/{vendor_id}/software', payload)
    _assert(status in (200, 201) and created.get('success'), f'create software failed: {status} {created}')
    item = created.get('item') or {}
    sw_id = item.get('id')
    _assert(isinstance(sw_id, int) and sw_id > 0, f'bad sw_id: {sw_id!r}')

    status, listed = _get_json('GET', f'/api/vendor-maintenance/{vendor_id}/software')
    _assert(status == 200 and listed.get('success') and listed.get('total') == 1, f'list after create failed: {status} {listed}')
    _assert(_get_sw_count('maintenance', vendor_id) == 1, 'sw_count must be COUNT(rows)=1 after create')

    patch = dict(payload)
    patch['remark'] = 'smoke-updated'
    status, updated = _get_json('PUT', f'/api/vendor-maintenance/{vendor_id}/software/{sw_id}', patch)
    _assert(status == 200 and updated.get('success'), f'update software failed: {status} {updated}')
    _assert(_get_sw_count('maintenance', vendor_id) == 1, 'sw_count must stay 1 after update')

    status, deleted = _get_json('DELETE', f'/api/vendor-maintenance/{vendor_id}/software/{sw_id}')
    _assert(status == 200 and deleted.get('success'), f'delete software failed: {status} {deleted}')

    status, listed2 = _get_json('GET', f'/api/vendor-maintenance/{vendor_id}/software')
    _assert(status == 200 and listed2.get('success') and listed2.get('total') == 0, f'list after delete failed: {status} {listed2}')
    _assert(_get_sw_count('maintenance', vendor_id) == 0, 'sw_count must be 0 after delete')

    _log(verbose, '[OK] maintenance tab44 software CRUD + sw_count')


def main(argv=None):
    parser = argparse.ArgumentParser(description='Smoke check: vendor tab44 software CRUD (HTTP)')
    parser.add_argument('--quiet', action='store_true', help='Reduce output (print only final PASS/FAIL unless error)')
    args = parser.parse_args(argv)

    verbose = not args.quiet

    # Manufacturer
    mf_id = _create_vendor('manufacturer')
    try:
        _test_manufacturer(mf_id, verbose=verbose)
    finally:
        _delete_vendor('manufacturer', mf_id)

    # Maintenance
    mt_id = _create_vendor('maintenance')
    try:
        _test_maintenance(mt_id, verbose=verbose)
    finally:
        _delete_vendor('maintenance', mt_id)

    print('PASSED: vendor tab44 software (HTTP)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

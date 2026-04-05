import json
import logging
import os
import sys

# Ensure repo root is importable when executed from VS Code tasks.
_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from app import create_app

# Reduce SQLAlchemy echo noise (DevelopmentConfig enables echo).
logging.getLogger('sqlalchemy.engine').setLevel(logging.WARNING)
logging.getLogger('sqlalchemy.engine.Engine').setLevel(logging.WARNING)

_OUT_PATH = os.path.abspath(os.path.join(_ROOT, '_tmp_dump_ids_ips_api_out.txt'))
_lines: list[str] = []


def log(*parts: object) -> None:
    msg = ' '.join(str(p) for p in parts)
    _lines.append(msg)
    print(msg)


def dump(endpoint: str) -> None:
    app = create_app('development')
    app.testing = True

    with app.test_client() as c:
        res = c.get(endpoint, headers={'Accept': 'application/json'})
        log('\n=== GET', endpoint, 'status=', res.status_code, '===')
        try:
            data = res.get_json(force=True)
        except Exception:
            log(res.data[:2000])
            return

        # Print a compact summary plus the first item keys.
        log('success:', data.get('success'))
        items = data.get('items') or data.get('rows') or data.get('data') or []
        if isinstance(items, dict):
            # some APIs wrap pagination
            items = items.get('items') or items.get('rows') or []
        log('items_count:', len(items) if isinstance(items, list) else type(items))
        if isinstance(items, list) and items:
            first = items[0]
            log('first.id:', first.get('id') or first.get('asset_id'))
            log('first.keys:', ', '.join(sorted(first.keys()))[:1000])
        else:
            log('items:', type(items), items)


def dump_detail(base: str, asset_id: int) -> None:
    app = create_app('development')
    app.testing = True

    with app.test_client() as c:
        endpoint = f"{base}/{asset_id}"
        res = c.get(endpoint, headers={'Accept': 'application/json'})
        log('\n=== GET', endpoint, 'status=', res.status_code, '===')
        try:
            data = res.get_json(force=True)
        except Exception:
            log(res.data[:2000])
            return
        log('success:', data.get('success'))
        item = data.get('item') or {}
        log('item.id:', item.get('id') or item.get('asset_id'))
        log('item.keys:', ', '.join(sorted(item.keys()))[:1000])
        # Print representative fields expected by detail pages.
        for k in [
            'work_name','system_name','system_ip','mgmt_ip','manage_ip',
            'work_status','work_status_name','work_status_color','work_status_token',
            'manufacturer_name','vendor','vendor_name','server_model_name','model_name','model',
            'center_name','rack_name','slot','u_size',
            'system_dept_name','system_owner_name','service_dept_name','service_owner_name',
            'cia_confidentiality','cia_integrity','cia_availability',
            'security_score','system_grade','core_flag','dr_built','svc_redundancy',
        ]:
            if k in item:
                log(f"  {k} = {item.get(k)!r}")


if __name__ == '__main__':
    # list endpoints
    dump('/api/hardware/security/ids/assets')
    dump('/api/hardware/security/ips/assets')

    # if we can get an ID from list, also dump detail
    app = create_app('development')
    app.testing = True
    with app.test_client() as c:
        for base in ['/api/hardware/security/ids/assets', '/api/hardware/security/ips/assets']:
            res = c.get(base, headers={'Accept': 'application/json'})
            data = res.get_json(force=True)
            items = data.get('items') or data.get('rows') or data.get('data') or []
            if isinstance(items, dict):
                items = items.get('items') or items.get('rows') or []
            if isinstance(items, list) and items:
                asset_id = items[0].get('id') or items[0].get('asset_id')
                if asset_id:
                    dump_detail(base, int(asset_id))

    try:
        with open(_OUT_PATH, 'w', encoding='utf-8') as f:
            f.write('\n'.join(_lines) + '\n')
        log('\n[written]', _OUT_PATH)
    except Exception as e:
        log('failed to write output file:', e)

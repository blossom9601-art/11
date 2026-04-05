import sys
import requests


def main() -> int:
    base = 'http://127.0.0.1:8080'

    vendors = requests.get(base + '/api/vendor-manufacturers', timeout=10).json().get('items', [])
    if not vendors:
        print('No vendor-manufacturers rows found; cannot run diag safely')
        return 2

    manufacturer_code = vendors[0]['manufacturer_code']

    create_payload = {
        'model_name': '_diag_model',
        'manufacturer_code': manufacturer_code,
        'form_factor': '서버',
        'release_date': '2024-01-01',
        'eosl_date': '2026-12-30',
        'server_count': 1,
        'remark': '_diag',
    }

    create_res = requests.post(base + '/api/hw-server-types', json=create_payload, timeout=10)
    print('create', create_res.status_code)
    print(create_res.text)
    create_res.raise_for_status()
    rec_id = create_res.json()['item']['id']

    update_payload = {'eosl': '2027-01-02'}
    update_res = requests.put(base + f'/api/hw-server-types/{rec_id}', json=update_payload, timeout=10)
    print('update', update_res.status_code)
    print(update_res.text)
    update_res.raise_for_status()

    items = requests.get(base + '/api/hw-server-types?include_deleted=1', timeout=10).json().get('items', [])
    row = next((x for x in items if x.get('id') == rec_id), None)
    print('persisted eosl_date:', (row or {}).get('eosl_date'))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

import json
import sys
import urllib.error
import urllib.request

BASE = 'http://127.0.0.1:8080/api/datacenter/data-deletion-systems'


def http(method: str, url: str, payload=None, timeout: int = 20):
    data = None
    headers = {'Accept': 'application/json'}
    if payload is not None:
        data = json.dumps(payload).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode('utf-8')
            return resp.status, body
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        return e.code, body


def main() -> int:
    create_payload = {
        'business_status': '운영',
        'business_name': '업무A',
        'system_name': '시스템A',
        'system_ip': '10.0.0.10',
        'manage_ip': '192.168.0.10',
        'vendor': 'HPE',
        'model': 'DL360',
        'serial': 'SN-TEST-001',
        'place': '센터1',
        'location': 'RACK-01',
        'system_owner_dept': 'IT',
        'service_owner_dept': 'OPS',
        'system_owner': 0,
        'service_owner': 0,
    }

    status, body = http('POST', BASE, create_payload)
    print('POST', status)
    if status not in (200, 201):
        print(body)
        return 1

    created = json.loads(body)
    system_id = created.get('item', {}).get('id')
    print('created.id', system_id)

    status, _ = http('GET', BASE)
    print('LIST', status)

    status, _ = http('GET', f'{BASE}/{system_id}')
    print('DETAIL', status)

    status, _ = http('PUT', f'{BASE}/{system_id}', {'system_name': '시스템A-수정'})
    print('PUT', status)

    status, _ = http('DELETE', f'{BASE}/{system_id}')
    print('DELETE', status)

    ids = []
    for i in range(2):
        status, body = http('POST', BASE, {**create_payload, 'serial': f'SN-TEST-BULK-{i}'})
        print('POST(bulk item)', i, status)
        if status not in (200, 201):
            print(body)
            return 1
        ids.append(json.loads(body).get('item', {}).get('id'))

    status, body = http('POST', f'{BASE}/bulk-delete', {'ids': ids})
    print('BULK-DELETE', status)
    print(body)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

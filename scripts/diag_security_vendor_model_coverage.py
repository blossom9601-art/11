import json
import sys
import urllib.error
import urllib.request


def fetch_json(url: str, *, timeout: int = 10):
    req = urllib.request.Request(url, headers={'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        body = response.read().decode('utf-8', 'replace')
        status = getattr(response, 'status', None)
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        raise ValueError(f'Non-JSON response from {url} (status={status}): {body[:200]}')
    return status, data


def unwrap_items(data):
    if isinstance(data, dict) and isinstance(data.get('items'), list):
        return data['items']
    if isinstance(data, list):
        return data
    return []


def main() -> int:
    base = 'http://127.0.0.1:8080'
    try:
        st_status, st_data = fetch_json(f'{base}/api/hw-server-types')
        vm_status, vm_data = fetch_json(f'{base}/api/vendor-manufacturers')
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', 'replace')
        print('HTTP_ERROR', e.code)
        print(body[:500])
        return 2
    except Exception as e:
        print('ERROR', type(e).__name__, e)
        return 3

    server_types = [it for it in unwrap_items(st_data) if isinstance(it, dict)]
    vendors = [it for it in unwrap_items(vm_data) if isinstance(it, dict)]

    vendor_name_by_code = {}
    for v in vendors:
        code = (v.get('manufacturer_code') or '').strip()
        name = (v.get('manufacturer_name') or '').strip()
        if code:
            vendor_name_by_code[code] = name or code

    security_form_factors = ['FW', 'VPN', 'IDS', 'IPS', 'HSM', 'KMS', 'WIPS', 'ETC']

    print('HW_SERVER_TYPES_STATUS', st_status)
    print('HW_SERVER_TYPES_COUNT', len(server_types))
    print('VENDOR_MANUFACTURERS_STATUS', vm_status)
    print('VENDOR_MANUFACTURERS_COUNT', len(vendors))
    print('')

    for ff in security_form_factors:
        target = ff.strip().lower()
        models = [
            it for it in server_types
            if str(it.get('form_factor') or it.get('hw_type') or '').strip().lower() == target
        ]
        vendor_codes = sorted({(m.get('manufacturer_code') or '').strip() for m in models} - {''})
        vendor_names = [vendor_name_by_code.get(code, code) for code in vendor_codes]

        print(f'[{ff}] MODELS={len(models)} VENDORS={len(vendor_codes)}')
        if not models:
            print('  !! WARNING: No models for this form_factor. Vendor/model dropdowns will be empty by design.')
            continue
        if not vendor_codes:
            print('  !! WARNING: Models exist but manufacturer_code is missing on them.')
            continue

        preview = vendor_names[:12]
        if preview:
            print('  vendors:', ', '.join(preview) + (' ...' if len(vendor_names) > len(preview) else ''))

    return 0


if __name__ == '__main__':
    raise SystemExit(main())

import json
import sys
import urllib.error
import urllib.request


def main() -> int:
    url = 'http://127.0.0.1:8080/api/hw-server-types'
    try:
        with urllib.request.urlopen(url, timeout=10) as response:
            body = response.read().decode('utf-8', 'replace')
            status = getattr(response, 'status', None)
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', 'replace')
        status = e.code
    except Exception as e:
        print('ERROR', type(e).__name__, e)
        return 2

    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        print('STATUS', status)
        print('NON_JSON_RESPONSE')
        print(body[:500])
        return 3

    items = []
    if isinstance(data, dict) and isinstance(data.get('items'), list):
        items = data['items']
    elif isinstance(data, list):
        items = data

    form_factors = sorted({(it.get('form_factor') or '').strip() for it in items if isinstance(it, dict)} - {''})

    print('STATUS', status)
    print('COUNT', len(items))
    print('FORM_FACTORS', len(form_factors))
    for ff in form_factors:
        print('-', ff)

    return 0


if __name__ == '__main__':
    raise SystemExit(main())

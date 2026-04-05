import json
import sys
import urllib.error
import urllib.request


def main(argv: list[str]) -> int:
    line_id = int(argv[1]) if len(argv) > 1 else 83
    url = f'http://127.0.0.1:8080/api/network/leased-lines/{line_id}/tasks'

    req = urllib.request.Request(url, method='GET', headers={'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode('utf-8', errors='replace')
            print('status=', resp.status)
            print(body)
            return 0
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        print('status=', e.code)
        print(body)
        return 0
    except Exception as e:
        print('request failed:', repr(e))
        return 2


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))

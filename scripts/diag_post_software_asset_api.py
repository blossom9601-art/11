import argparse
import json
import sys
import urllib.error
import urllib.request


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', required=True)
    parser.add_argument('--asset-name', required=True)
    parser.add_argument('--work-status-code')
    args = parser.parse_args()

    payload = {'asset_name': args.asset_name}
    if args.work_status_code is not None:
        payload['work_status_code'] = args.work_status_code

    body = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        args.url,
        data=body,
        headers={'Content-Type': 'application/json'},
        method='POST',
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            print('STATUS', resp.status)
            print(resp.read().decode('utf-8', errors='replace'))
            return 0
    except urllib.error.HTTPError as e:
        print('STATUS', e.code)
        print(e.read().decode('utf-8', errors='replace'))
        return 0


if __name__ == '__main__':
    raise SystemExit(main())

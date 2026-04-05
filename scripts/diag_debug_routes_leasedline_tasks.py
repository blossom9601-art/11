import json
import sys
import urllib.request


def main() -> int:
    url = 'http://127.0.0.1:8080/debug/routes'
    try:
        raw = urllib.request.urlopen(url, timeout=10).read().decode('utf-8', errors='replace')
    except Exception as e:
        print('failed to fetch', url)
        print(repr(e))
        return 2

    try:
        data = json.loads(raw)
    except Exception as e:
        print('failed to parse JSON from', url)
        print(repr(e))
        print('head:', raw[:400])
        return 3

    if isinstance(data, dict) and isinstance(data.get('rules'), list):
        raw_rules = data.get('rules')
    elif isinstance(data, list):
        raw_rules = data
    else:
        print('unexpected JSON shape:', type(data))
        if isinstance(data, dict):
            print('keys:', sorted(list(data.keys()))[:50])
        return 4

    rules = [r for r in raw_rules if isinstance(r, dict) and 'rule' in r]
    leased = [r for r in rules if 'leased-lines' in str(r.get('rule', ''))]

    print('total_rules=', len(rules))
    print('leased_lines_rules=', len(leased))

    for r in leased:
        methods = ','.join(r.get('methods') or [])
        print(methods, r.get('rule'))

    leased_tasks = [
        r
        for r in rules
        if ('leased' in str(r.get('rule', ''))) and ('task' in str(r.get('rule', '')))
    ]
    print('leased_*task*_rules=', len(leased_tasks))
    for r in leased_tasks[:50]:
        methods = ','.join(r.get('methods') or [])
        print(methods, r.get('rule'))

    print('has_list_tasks=', any(r.get('rule') == '/api/network/leased-lines/<int:line_id>/tasks' for r in leased))
    print('has_put_task=', any(r.get('rule') == '/api/network/leased-lines/<int:line_id>/tasks/<int:task_id>' for r in leased))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

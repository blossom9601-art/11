import json
from collections import Counter, defaultdict

with open('_qa_crud_results.json', encoding='utf-8') as f:
    data = json.load(f)

results = data.get('results', [])
summary = data.get('summary', {})
print('SUMMARY:', summary)

failures = [r for r in results if r.get('status') == 'FAIL']
warns = [r for r in results if r.get('status') == 'WARN']
oks = [r for r in results if r.get('status') == 'OK']

print('\nFAIL_COUNT_BY_MENU')
for menu, cnt in Counter(r['menu'] for r in failures).most_common():
    print(f'- {menu}: {cnt}')

print('\nFAIL_DETAILS')
for i, r in enumerate(failures, 1):
    note = r.get('note', '')
    print(f'{i:02d}. {r.get("menu")} | {r.get("action")} | {r.get("api")} | {note}')

print('\nWARN_DETAILS')
for i, r in enumerate(warns, 1):
    note = r.get('note', '')
    print(f'{i:02d}. {r.get("menu")} | {r.get("action")} | {r.get("api")} | {note}')

# 메뉴별 상태 요약: 핵심 액션 판정
menu_actions = defaultdict(lambda: {'OK': 0, 'FAIL': 0, 'WARN': 0})
for r in results:
    menu = r.get('menu')
    st = r.get('status')
    if menu and st in ('OK', 'FAIL', 'WARN'):
        menu_actions[menu][st] += 1

print('\nMENU_STATUS_SUMMARY')
for menu in sorted(menu_actions.keys()):
    s = menu_actions[menu]
    print(f'- {menu}: OK={s["OK"]}, FAIL={s["FAIL"]}, WARN={s["WARN"]}')

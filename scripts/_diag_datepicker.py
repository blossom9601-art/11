"""Quick diagnostic: check flatpickr integration for data_deletion_list page."""
import re

js_path = 'static/js/6.datacenter/6-2.erasure/6-2-1.data_deletion_list/1.data_deletion_list.js'
html_path = 'app/templates/6.datacenter/6-2.erasure/6-2-1.data_deletion_list/1.data_deletion_list.html'

with open(js_path, encoding='utf-8') as f:
    js = f.read()

print('=== JS: flatpickr functions ===')
print('ensureFlatpickr defined:', 'async function ensureFlatpickr()' in js)
print('initDatePickers defined:', 'async function initDatePickers(formId)' in js)

for i, line in enumerate(js.split('\n'), 1):
    if 'initDatePickers(' in line and 'function ' not in line:
        print(f'  call at line {i}: {line.strip()[:80]}')

print()
with open(html_path, encoding='utf-8') as f:
    html = f.read()

print('=== HTML: work_date inputs ===')
for m in re.finditer(r'name="work_date"[^>]*>', html):
    ctx = html[max(0, m.start()-30):m.end()]
    print(f'  found: ...{ctx}')

print()
print('Has type="date":', bool(re.search(r'type="date".*work_date|work_date.*type="date"', html)))

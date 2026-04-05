import sys

errors = []
for name, path in [('tab21', 'static/js/_detail/tab21-frontbay.js'), ('tab22', 'static/js/_detail/tab22-rearbay.js')]:
    text = open(path, encoding='utf-8').read()
    checks = [
        ('no spec col', 'hasSpecCol = false' in text),
        ('work_name render', 'data-col="work_name"' in text),
        ('system_name render', 'data-col="system_name"' in text),
        ('no fw col', 'data-col="fw"' not in text),
        ('no spec render', 'data-col="spec"' not in text),
        ('fetchWorkGroups', 'function fetchWorkGroups' in text),
        ('fetchSystems', 'function fetchSystems' in text),
        ('bay-work-select', 'bay-work-select' in text),
        ('placeholder type', "disabled>유형</option>" in text),
        ('placeholder space', "disabled>공간</option>" in text),
        ('no old placeholder', '유형 선택 (필수)' not in text),
        ('csv work header', '업무명' in text),
        ('csv system header', '시스템명' in text),
    ]
    for label, ok in checks:
        status = 'OK' if ok else 'FAIL'
        if not ok: errors.append(name + ': ' + label)
        print(name + ': ' + label + ' = ' + status)

for name, path in [('tab21-html', 'app/templates/layouts/tab21-frontbay-shared.html'), ('tab22-html', 'app/templates/layouts/tab22-rearbay-shared.html')]:
    text = open(path, encoding='utf-8').read()
    checks = [
        ('업무명 th', '<th>업무명</th>' in text),
        ('시스템명 th', '<th>시스템명</th>' in text),
        ('no 용량 th', '<th>용량</th>' not in text),
        ('no 펌웨어 th', '<th>펌웨어</th>' not in text),
        ('v=1.1.0', 'v=1.1.0' in text),
    ]
    for label, ok in checks:
        status = 'OK' if ok else 'FAIL'
        if not ok: errors.append(name + ': ' + label)
        print(name + ': ' + label + ' = ' + status)

if errors:
    print('FAILED:', errors)
    sys.exit(1)
else:
    print('\nAll checks passed!')

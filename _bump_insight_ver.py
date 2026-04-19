import re
files = [
    r'app/templates/5.insight/5-1.insight/5-1-2.security/1.security_list.html',
    r'app/templates/5.insight/5-1.insight/5-1-3.report/1.report_list.html',
    r'app/templates/5.insight/5-1.insight/5-1-4.technical/1.technical_list.html',
]
for f in files:
    t = open(f, encoding='utf-8').read()
    t2 = t.replace('insight_list_common.js?v=20260417"', 'insight_list_common.js?v=20260417b"')
    with open(f, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(t2)
    print('Done:', f)

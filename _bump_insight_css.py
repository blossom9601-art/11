"""Bump insight.css version from 20260412_6 to 20260412_8 in all HTML templates"""
import re, os

root = r'C:\Users\ME\Desktop\blossom'
old = 'insight.css?v=20260412_6'
new = 'insight.css?v=20260412_8'

files = [
    r'app\templates\5.insight\5-1.insight\5-1-1.trend\1.trend_list.html',
    r'app\templates\5.insight\5-1.insight\5-1-2.security\1.security_list.html',
    r'app\templates\5.insight\5-1.insight\5-1-3.report\1.report_list.html',
    r'app\templates\5.insight\5-1.insight\5-1-4.technical\1.technical_list.html',
    r'app\templates\5.insight\5-2.blog\5-2-1.it_blog\1.blog_list.html',
    r'app\templates\5.insight\5-2.blog\5-2-1.it_blog\2.blog_detail.html',
]

for f in files:
    path = os.path.join(root, f)
    text = open(path, encoding='utf-8').read()
    if old in text:
        text = text.replace(old, new)
        with open(path, 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(text)
        print(f'OK: {f}')
    else:
        print(f'SKIP: {f}')

print('\nDone.')

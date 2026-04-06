"""Verify FK cache patch integrity."""
import glob

files = glob.glob('static/js/2.hardware/**/*_list.js', recursive=True)
for f in sorted(files):
    text = open(f, encoding='utf-8').read()
    has_patch = 'window.__blsFkCache' in text
    fffd_count = text.count('\ufffd')
    has_korean = any(kw in text for kw in ['센터', '부서', '담당자'])
    status = 'OK' if has_patch and has_korean else 'PROBLEM'
    extra = f' (fffd={fffd_count} in comments)' if fffd_count > 0 else ''
    print(f'  {status}: {f}{extra}')
print(f'\nTotal: {len(files)} files checked')

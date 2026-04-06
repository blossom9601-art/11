"""Basic brace-balance check for all patched JS files."""
import glob

files = glob.glob('static/js/2.hardware/**/*_list.js', recursive=True)
files.append('static/js/blossom.js')
ok = 0
for f in sorted(files):
    text = open(f, encoding='utf-8').read()
    if text.count('{') != text.count('}'):
        print(f'  WARN brace mismatch: {f}')
    elif text.count('(') != text.count(')'):
        print(f'  WARN paren mismatch: {f}')
    else:
        ok += 1
print(f'\n{ok}/{len(files)} files balanced')

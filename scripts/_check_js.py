import sys

path = 'static/js/_detail/tab04-interface.js'
text = open(path, encoding='utf-8').read()

stack = []
pairs = {'{': '}', '(': ')', '[': ']'}
in_str = False
esc = False
q = None
line_no = 1
skip_until = -1

for i, c in enumerate(text):
    if i < skip_until:
        if c == '\n':
            line_no += 1
        continue
    if c == '\n':
        line_no += 1
    if esc:
        esc = False
        continue
    if c == '\\' and in_str:
        esc = True
        continue
    if in_str:
        if c == q:
            in_str = False
        continue
    if c in ('"', "'", '`'):
        in_str = True
        q = c
        continue
    if c == '/' and i + 1 < len(text):
        nc = text[i + 1]
        if nc == '/':
            idx = text.find('\n', i + 2)
            if idx == -1:
                break
            skip_until = idx
            continue
        if nc == '*':
            idx = text.find('*/', i + 2)
            if idx == -1:
                break
            skip_until = idx + 2
            continue
    if c in ('{', '(', '['):
        stack.append((c, line_no, i))
    elif c in ('}', ')', ']'):
        if not stack:
            print(f'Unmatched close {c!r} at line {line_no}')
            sys.exit(1)
        top, tl, ti = stack[-1]
        if pairs.get(top) == c:
            stack.pop()
        else:
            print(f'Mismatch at line {line_no}: expected {pairs[top]!r} (opened at line {tl}) but got {c!r}')
            sys.exit(1)

if stack:
    print(f'Unclosed: {len(stack)} open. Last: {stack[-1][0]!r} at line {stack[-1][1]}')
    sys.exit(1)

print('JS bracket balance OK')

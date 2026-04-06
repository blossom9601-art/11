import sys
t = open('static/js/_detail/tab04-interface.js', encoding='utf-8').read()
print('{=' + str(t.count('{')) + ' }=' + str(t.count('}'))
    + ' (=' + str(t.count('(')) + ' )=' + str(t.count(')'))
    + ' [=' + str(t.count('[')) + ' ]=' + str(t.count(']')))

# String-aware bracket check
lines = t.split('\n')
stack = []
for i, line in enumerate(lines, 1):
    j = 0
    in_sq = False
    in_dq = False
    in_tmpl = False
    while j < len(line):
        ch = line[j]
        # Skip escaped chars
        if j + 1 < len(line) and ch == '\\':
            j += 2
            continue
        # Track string state
        if ch == "'" and not in_dq and not in_tmpl:
            in_sq = not in_sq
            j += 1
            continue
        if ch == '"' and not in_sq and not in_tmpl:
            in_dq = not in_dq
            j += 1
            continue
        if ch == '`' and not in_sq and not in_dq:
            in_tmpl = not in_tmpl
            j += 1
            continue
        # Skip line comments
        if not in_sq and not in_dq and not in_tmpl and ch == '/' and j+1 < len(line) and line[j+1] == '/':
            break
        # Skip block comment start (simple: just skip rest of line if /*)
        if not in_sq and not in_dq and not in_tmpl and ch == '/' and j+1 < len(line) and line[j+1] == '*':
            break
        if in_sq or in_dq or in_tmpl:
            j += 1
            continue
        if ch in '({[':
            stack.append((ch, i))
        elif ch in ')}]':
            expected = {'(': ')', '{': '}', '[': ']'}
            if not stack:
                print(f'ERROR: Extra closing {ch!r} at line {i}, no matching opener')
                break
            top_ch, top_line = stack[-1]
            if expected.get(top_ch) == ch:
                stack.pop()
            else:
                print(f'MISMATCH at line {i}: expected {expected[top_ch]!r} (opened at line {top_line}) but got {ch!r}')
                # Attempt recovery: pop until we find the match
                found = False
                for k in range(len(stack)-1, -1, -1):
                    if expected.get(stack[k][0]) == ch:
                        # everything between k+1 and top was unclosed
                        for m in range(len(stack)-1, k, -1):
                            uc = stack[m]
                            print(f'  -> Unclosed {uc[0]!r} opened at line {uc[1]}')
                        stack = stack[:k]
                        found = True
                        break
                if not found:
                    print(f'  -> Could not find matching opener for {ch!r}')
                break
        j += 1

if stack:
    print(f'\nUnclosed at end: {len(stack)} items')
    for ch, ln in stack[-5:]:
        print(f'  {ch!r} opened at line {ln}')
else:
    print('\nAll brackets balanced!')

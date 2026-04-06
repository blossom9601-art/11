#!/usr/bin/env python3
"""Quick bracket-balance check for a JS file."""
import sys

text = open(sys.argv[1], encoding='utf-8').read()
stack = []
pairs = {'{': '}', '(': ')', '[': ']'}
opens = set(pairs.keys())
closes = set(pairs.values())
in_str = False
esc = False
q = None

for i, c in enumerate(text):
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
    if c in opens:
        stack.append((c, i))
    elif c in closes:
        if not stack:
            print(f'Unmatched close {c!r} at pos {i}')
            sys.exit(1)
        top, _ = stack[-1]
        if pairs.get(top) == c:
            stack.pop()
        else:
            print(f'Mismatch: expected {pairs[top]!r} but got {c!r} at pos {i}')
            sys.exit(1)

if stack:
    print(f'Unclosed: {len(stack)} open brackets. Last: {stack[-1][0]!r} at pos {stack[-1][1]}')
    sys.exit(1)
else:
    print('JS bracket balance OK')

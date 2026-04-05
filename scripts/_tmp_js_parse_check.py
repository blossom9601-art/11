import os
import sys

import esprima

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

def check(path: str) -> int:
    full = os.path.join(ROOT, path)
    with open(full, 'r', encoding='utf-8') as f:
        src = f.read()
    try:
        esprima.parseScript(src, tolerant=False)
        print('[OK]', path)
        return 0
    except Exception as e:
        # esprima error message usually includes line/column
        print('[FAIL]', path)
        print(str(e))
        # show nearby lines if possible
        msg = str(e)
        line = None
        col = None
        for token in ['Line ', 'line ']:
            if token in msg:
                try:
                    rest = msg.split(token, 1)[1]
                    num = ''
                    for ch in rest:
                        if ch.isdigit():
                            num += ch
                        else:
                            break
                    if num:
                        line = int(num)
                except Exception:
                    pass
        # handle common '(line X, column Y)'
        if '(line' in msg and 'column' in msg:
            try:
                seg = msg.split('(line', 1)[1]
                line = int(seg.split(',', 1)[0].strip())
                col = int(seg.split('column', 1)[1].split(')')[0].strip())
            except Exception:
                pass

        if line:
            lines = src.splitlines()
            lo = max(1, line - 3)
            hi = min(len(lines), line + 3)
            print(f'-- context {lo}-{hi} (error line {line}{" col "+str(col) if col else ""}) --')
            for i in range(lo, hi + 1):
                prefix = '>>' if i == line else '  '
                print(f'{prefix} {i:5d}: {lines[i-1]}')
        return 1


def main() -> int:
    # Optional file arguments: allow targeted checks from VS Code tasks.
    paths = [p for p in sys.argv[1:] if p and not p.startswith('-')]
    if not paths:
        paths = [
            'static/js/2.hardware/2-5.security/2-5-3.ids/2.ids_detail.js',
            'static/js/2.hardware/2-5.security/2-5-4.ips/2.ips_detail.js',
        ]
    failures = 0
    for p in paths:
        failures += check(p)
    return 1 if failures else 0


if __name__ == '__main__':
    raise SystemExit(main())

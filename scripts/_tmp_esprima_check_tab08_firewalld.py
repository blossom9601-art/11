import os
import esprima

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))


def main() -> int:
    path = 'static/js/_detail/tab08-firewalld.js'
    full = os.path.join(ROOT, path)
    with open(full, 'r', encoding='utf-8') as f:
        src = f.read()
    try:
        esprima.parseScript(src, tolerant=False)
        print('[OK]', path)
        return 0
    except Exception as e:
        print('[FAIL]', path)
        print(str(e))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())

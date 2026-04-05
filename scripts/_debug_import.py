import os, sys
print('CWD:', os.getcwd())
print('sys.path[0]:', sys.path[0])
print('has app dir:', os.path.isdir('app'))
try:
    import app
    print('import app: OK')
except Exception as e:
    print('import app: FAIL ->', repr(e))

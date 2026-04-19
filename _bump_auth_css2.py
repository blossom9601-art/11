import re

targets = {
    'app/templates/authentication/11-3.admin/11-3-3.setting/3.security.html': '1.0.26',
    'app/templates/authentication/11-3.admin/11-3-3.setting/1.setting.html': '1.0.24',
    'app/templates/authentication/11-3.admin/11-3-3.setting/10.brand.html': '1.0.24',
    'app/templates/authentication/11-3.admin/11-3-3.setting/11.file_management.html': '1.0.26',
}

NEW_VER = '1.0.27'

for path, old_ver in targets.items():
    text = open(path, encoding='utf-8').read()
    old = f'authentication.css?v={old_ver}'
    new = f'authentication.css?v={NEW_VER}'
    if old in text:
        new_text = text.replace(old, new, 1)
        with open(path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(new_text)
        # verify
        check = open(path, encoding='utf-8').read()
        ok = new in check and '\ufffd' not in check
        print(f'OK  {path}' if ok else f'ERR {path}')
    elif new in text:
        print(f'SKIP {path} (already {NEW_VER})')
    else:
        print(f'MISS {path} (expected v={old_ver})')

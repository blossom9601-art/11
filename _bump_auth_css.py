import re

targets = [
    'app/templates/authentication/11-3.admin/11-3-3.setting/3.security.html',
    'app/templates/authentication/11-3.admin/11-3-3.setting/1.setting.html',
    'app/templates/authentication/11-3.admin/11-3-3.setting/10.brand.html',
    'app/templates/authentication/11-3.admin/11-3-3.setting/11.file_management.html',
]

for path in targets:
    text = open(path, encoding='utf-8').read()
    new_text = re.sub(
        r'authentication\.css\?v=[^"]+',
        'authentication.css?v=1.0.27',
        text
    )
    if new_text != text:
        with open(path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(new_text)
        print('bumped:', path)
    else:
        print('skip:  ', path)

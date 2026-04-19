import glob, os
for f in sorted(glob.glob('app/templates/authentication/11-3.admin/**/*.html', recursive=True)):
    if '_role_form' in f:
        continue
    text = open(f, encoding='utf-8').read()
    has_tab = 'admin_file_management_settings' in text
    cnt = text.count('system-tab-btn')
    name = os.path.basename(f)
    status = 'OK' if has_tab else 'MISS'
    print(f'{status} tabs={cnt:2d}  {name}')

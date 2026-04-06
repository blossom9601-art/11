"""Add SPA shell checks to remaining admin page routes in auth.py."""
import re

FPATH = r'c:\Users\ME\Desktop\blossom\app\routes\auth.py'
text = open(FPATH, encoding='utf-8').read()

# Pattern: admin routes that render a template without SPA shell check
# These all follow the same pattern:
#   return redirect(url_for('auth.login'))
#   return render_template('authentication/11-3.admin/...')
ADMIN_PAGES = [
    # (template substring, current_key)
    ('8.sessions.html', 'admin_sessions'),
    ('2.mail.html', 'admin_mail'),
    ('4.quality_type.html', 'admin_quality_type'),
    ('5.change_log.html', 'admin_change_log'),
    ('6.info_message.html', 'admin_info_message'),
    ('7.version.html', 'admin_version'),
    ('9.page_tab.html', 'admin_page_tab'),
    ('10.brand.html', 'admin_brand'),
]

count = 0
for tmpl_sub, key in ADMIN_PAGES:
    # Find the pattern: redirect to login followed by template render
    # We need to insert the SPA check between the redirect and the render_template
    old_pattern = f"    return render_template('authentication/11-3.admin/"
    # Find the specific line
    lines = text.split('\n')
    new_lines = []
    for i, line in enumerate(lines):
        if tmpl_sub in line and old_pattern.rstrip() in line and 'spa_shell' not in line:
            # Insert SPA shell check before this line
            indent = '    '
            new_lines.append(f"{indent}_xhr = request.headers.get('X-Requested-With', '')")
            new_lines.append(f"{indent}if _xhr not in ('blossom-spa', 'blossom-spa-prefetch', 'XMLHttpRequest'):")
            new_lines.append(f"{indent}    return render_template('layouts/spa_shell.html', current_key='{key}', menu_code=None)")
            new_lines.append(line)
            count += 1
        else:
            new_lines.append(line)
    text = '\n'.join(new_lines)

with open(FPATH, 'w', encoding='utf-8', newline='\n') as f:
    f.write(text)

print(f'Added SPA shell checks to {count} admin page routes')

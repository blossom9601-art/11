"""Add _login_at and _last_active to all test session setups that set user_id.

This fixes pre-existing test failures caused by the _check_session_expiry
before_request hook clearing sessions that have user_id but no _login_at.
"""
import re
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TESTS = os.path.join(BASE, 'tests')

# Pattern: any line like   sess['user_id'] = ... or sess["user_id"] = ...
# We'll add _login_at right after it (if not already present nearby)
LOGIN_AT_LINE = "        sess['_login_at'] = __import__('datetime').datetime.utcnow().isoformat()\n"

# Files and their patterns
FILES_WITH_HELPER = {
    # file: (function pattern to find, insert after user_id line)
    'test_blog_comments_api.py': 'helper',
    'test_blog_likes_api.py': 'helper',
    'test_blog_comment_likes_api.py': 'helper',
    'test_blog_list_likes_fields_api.py': 'helper',
    'test_settings_password_change_api.py': 'helper',
    'test_prj_project_api.py': 'helper',
    'test_prj_project_tabs_api.py': 'helper',
    'test_svc_ticket_api.py': 'helper',
    'test_data_delete_system_api.py': 'inline',
    'test_data_delete_register_api.py': 'inline',
    'test_info_message_api.py': 'inline',
    'test_calendar_schedule_api.py': 'inline',
}

modified = []
for fname, kind in FILES_WITH_HELPER.items():
    fpath = os.path.join(TESTS, fname)
    if not os.path.isfile(fpath):
        print(f'SKIP (not found): {fname}')
        continue

    text = open(fpath, encoding='utf-8').read()
    if '_login_at' in text:
        print(f'SKIP (already has _login_at): {fname}')
        continue

    # Strategy: after every line that sets sess[...]['user_id'], insert _login_at
    lines = text.split('\n')
    new_lines = []
    changed = False
    for i, line in enumerate(lines):
        new_lines.append(line)
        # Match: sess['user_id'] = ... or sess["user_id"] = ... or session_tx['user_id'] = ...
        stripped = line.strip()
        if re.match(r'''(sess|session_tx)\s*\[\s*['"]user_id['"]\s*\]\s*=''', stripped):
            # Determine indentation
            indent = line[:len(line) - len(line.lstrip())]
            new_lines.append(f"{indent}{stripped.split('[')[0].split('=')[0].strip().split(']')[0]}")
            # Actually, let's be more precise - use the variable name from the line
            m = re.match(r'(\s*)([\w]+)\s*\[', line)
            if m:
                indent = m.group(1)
                var = m.group(2)
                # Remove the bad line we just added
                new_lines.pop()
                new_lines.append(f"{indent}{var}['_login_at'] = __import__('datetime').datetime.utcnow().isoformat()")
                changed = True
            else:
                new_lines.pop()  # remove bad line

    if changed:
        with open(fpath, 'w', encoding='utf-8', newline='\n') as f:
            f.write('\n'.join(new_lines))
        modified.append(fname)
        print(f'FIXED: {fname}')
    else:
        print(f'NO CHANGE: {fname}')

print(f'\nModified {len(modified)} files: {modified}')

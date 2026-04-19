"""
설정 페이지 탭에 '파일관리' 탭 추가.
보안관리 탭 뒤에 파일관리 탭을 삽입한다.
11.file_management.html 은 이미 포함되어 있으므로 제외.
"""
import os, re

BASE = 'app/templates/authentication/11-3.admin'

# 수정 대상 파일 목록 (파일관리 탭이 없는 12개)
targets = [
    f'{BASE}/11-3-3.setting/1.setting.html',
    f'{BASE}/11-3-3.setting/2.mail.html',
    f'{BASE}/11-3-3.setting/3.security.html',
    f'{BASE}/11-3-3.setting/4.quality_type.html',
    f'{BASE}/11-3-3.setting/5.change_log.html',
    f'{BASE}/11-3-3.setting/6.info_message.html',
    f'{BASE}/11-3-3.setting/7.version.html',
    f'{BASE}/11-3-3.setting/8.sessions.html',
    f'{BASE}/11-3-3.setting/9.page_tab.html',
    f'{BASE}/11-3-3.setting/10.brand.html',
    f'{BASE}/11-3-1.user/1.user_list.html',
    f'{BASE}/11-3-2.role/1.role_list.html',
]

FILE_MGMT_TAB = '\t\t\t\t<a class="system-tab-btn" role="tab" aria-selected="false" href="{{ url_for(\'auth.admin_file_management_settings\') }}">파일관리</a>'

count = 0
for path in targets:
    if not os.path.exists(path):
        print(f'SKIP (not found): {path}')
        continue

    text = open(path, encoding='utf-8').read()

    # 이미 파일관리 탭이 있으면 스킵
    if 'admin_file_management_settings' in text:
        print(f'SKIP (already has tab): {path}')
        continue

    # 보안관리 탭 라인 뒤에 파일관리 탭 삽입
    # 패턴: 보안관리 탭 라인 끝 → 다음 줄에 파일관리 삽입
    security_pattern = r"(.*admin_security_settings.*보안관리.*</a>)"
    match = re.search(security_pattern, text)
    if not match:
        print(f'WARN (no 보안관리 tab found): {path}')
        continue

    insert_pos = match.end()
    text = text[:insert_pos] + '\n' + FILE_MGMT_TAB + text[insert_pos:]

    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    count += 1
    print(f'UPDATED: {path}')

print(f'\nDone. Updated {count} files.')

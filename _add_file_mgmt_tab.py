"""설정 탭 네비게이션에 '파일관리' 탭 추가 (보안관리 뒤)"""
import re, os

BASE = r'C:\Users\ME\Desktop\blossom\app\templates\authentication\11-3.admin'

# 파일관리 탭이 없는 모든 HTML 파일
targets = [
    r'11-3-3.setting\1.setting.html',
    r'11-3-3.setting\2.mail.html',
    r'11-3-3.setting\3.security.html',
    r'11-3-3.setting\4.quality_type.html',
    r'11-3-3.setting\5.change_log.html',
    r'11-3-3.setting\6.info_message.html',
    r'11-3-3.setting\7.version.html',
    r'11-3-3.setting\8.sessions.html',
    r'11-3-3.setting\9.page_tab.html',
    r'11-3-3.setting\10.brand.html',
    r'11-3-2.role\1.role_list.html',
    r'11-3-1.user\1.user_list.html',
]

FILE_MGMT_TAB = '''\t\t\t\t<a class="system-tab-btn" role="tab" aria-selected="false" href="{{ url_for('auth.admin_file_management_settings') }}">파일관리</a>'''

# 보안관리 탭 뒤에 파일관리 탭을 삽입
SECURITY_TAB_RE = re.compile(
    r"(.*admin_security_settings.*보안관리.*</a>)\s*\n",
    re.UNICODE
)

modified = 0
skipped = 0

for rel in targets:
    fpath = os.path.join(BASE, rel)
    if not os.path.exists(fpath):
        print(f'[MISS] {rel}')
        continue

    text = open(fpath, encoding='utf-8').read()
    
    # 이미 파일관리 탭이 있으면 스킵
    if 'admin_file_management_settings' in text:
        print(f'[SKIP] {rel} (이미 있음)')
        skipped += 1
        continue
    
    # 보안관리 탭 줄 뒤에 삽입
    m = SECURITY_TAB_RE.search(text)
    if not m:
        print(f'[WARN] {rel} - 보안관리 탭 미발견')
        continue
    
    insert_pos = m.end()
    new_text = text[:insert_pos] + FILE_MGMT_TAB + '\n' + text[insert_pos:]
    
    with open(fpath, 'w', encoding='utf-8', newline='\n') as f:
        f.write(new_text)
    
    # 검증
    verify = open(fpath, encoding='utf-8').read()
    if 'admin_file_management_settings' in verify and '\ufffd' not in verify:
        print(f'[OK  ] {rel}')
        modified += 1
    else:
        print(f'[FAIL] {rel} - 검증 실패!')

print(f'\n완료: {modified}개 수정, {skipped}개 스킵')

import re

path = r'c:\Users\ME\Desktop\blossom\app\templates\authentication\11-3.admin\11-3-3.setting\1.setting.html'
text = open(path, encoding='utf-8').read()

# CSS version bump
text = text.replace('authentication.css?v=1.0.30', 'authentication.css?v=1.0.31')

# JS version bump
text = re.sub(r'1\.setting\.js\?v=\S+', '1.setting.js?v=20260419_session', text)

# Insert session policy section before setting-actions in mfa-settings-form
old_actions = (
    '\t\t\t\t\t\t<div class="setting-actions">\n'
    '\t\t\t\t\t\t\t<div class="action-buttons">\n'
    '\t\t\t\t\t\t\t\t<button type="submit" class="btn-save" id="mfa-save-btn">'
)

new_section = (
    '\t\t\t\t\t\t<!-- ── 세션 보안 정책 ── -->\n'
    '\t\t\t\t\t\t<h3 class="mfa-methods-title">세션 보안 정책</h3>\n'
    '\t\t\t\t\t\t<div class="cp-policy-grid">\n'
    '\t\t\t\t\t\t\t<div class="form-row">\n'
    '\t\t\t\t\t\t\t\t<label for="mfa-session-timeout">로그인 세션 유효 시간 (시간)</label>\n'
    '\t\t\t\t\t\t\t\t<input type="number" id="mfa-session-timeout" name="session_timeout_hours" class="form-input" min="1" max="720" value="8">\n'
    '\t\t\t\t\t\t\t\t<span class="helper-text">로그인 후 세션이 유지되는 시간</span>\n'
    '\t\t\t\t\t\t\t</div>\n'
    '\t\t\t\t\t\t\t<div class="form-row">\n'
    '\t\t\t\t\t\t\t\t<label for="mfa-idle-timeout">비활성 자동 로그아웃 (분)</label>\n'
    '\t\t\t\t\t\t\t\t<input type="number" id="mfa-idle-timeout" name="idle_timeout_minutes" class="form-input" min="5" max="480" value="60">\n'
    '\t\t\t\t\t\t\t\t<span class="helper-text">입력 없을 때 자동 로그아웃 대기 시간</span>\n'
    '\t\t\t\t\t\t\t</div>\n'
    '\t\t\t\t\t\t</div>\n'
    '\t\t\t\t\t\t<div class="setting-actions">\n'
    '\t\t\t\t\t\t\t<div class="action-buttons">\n'
    '\t\t\t\t\t\t\t\t<button type="submit" class="btn-save" id="mfa-save-btn">'
)

if old_actions in text:
    text = text.replace(old_actions, new_section, 1)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    print('OK')
else:
    print('NOT FOUND')
    idx = text.find('mfa-save-btn')
    print('mfa-save-btn at', idx)
    print(repr(text[idx-200:idx+50]))

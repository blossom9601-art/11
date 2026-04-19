import re

path = r'c:\Users\ME\Desktop\blossom\app\templates\authentication\11-3.admin\11-3-3.setting\1.setting.html'
text = open(path, encoding='utf-8').read()

old = (
    '\t\t\t\t\t\t<div class="form-grid single-col">\n'
    '\t\t\t\t\t\t\t<div class="form-row">\n'
    '\t\t\t\t\t\t\t\t<label for="cp-code-length">코드 길이 (자릿수)</label>\n'
    '\t\t\t\t\t\t\t\t<select id="cp-code-length" name="code_length" class="form-input">\n'
    '\t\t\t\t\t\t\t\t\t<option value="4">4자리</option>\n'
    '\t\t\t\t\t\t\t\t\t<option value="6" selected>6자리</option>\n'
    '\t\t\t\t\t\t\t\t\t<option value="8">8자리</option>\n'
    '\t\t\t\t\t\t\t\t</select>\n'
    '\t\t\t\t\t\t\t</div>\n'
    '\t\t\t\t\t\t\t<div class="form-row">\n'
    '\t\t\t\t\t\t\t\t<label for="cp-code-ttl">코드 유효 시간 (초)</label>\n'
    '\t\t\t\t\t\t\t\t<input type="number" id="cp-code-ttl" name="code_ttl_seconds" class="form-input" min="60" max="600" value="300">\n'
    '\t\t\t\t\t\t\t\t<span class="helper-text">기본 300초 (5분)</span>\n'
    '\t\t\t\t\t\t\t</div>\n'
    '\t\t\t\t\t\t\t<div class="form-row">\n'
    '\t\t\t\t\t\t\t\t<label for="cp-resend-wait">재발송 대기 시간 (초)</label>\n'
    '\t\t\t\t\t\t\t\t<input type="number" id="cp-resend-wait" name="resend_wait_seconds" class="form-input" min="10" max="300" value="60">\n'
    '\t\t\t\t\t\t\t\t<span class="helper-text">같은 사용자에게 재발송까지 최소 대기 시간</span>\n'
    '\t\t\t\t\t\t\t</div>\n'
    '\t\t\t\t\t\t\t<div class="form-row">\n'
    '\t\t\t\t\t\t\t\t<label for="cp-max-daily">일일 최대 발송 횟수</label>\n'
    '\t\t\t\t\t\t\t\t<input type="number" id="cp-max-daily" name="max_daily_attempts" class="form-input" min="1" max="100" value="10">\n'
    '\t\t\t\t\t\t\t\t<span class="helper-text">사용자 1인당 하루 최대 코드 발송 수</span>\n'
    '\t\t\t\t\t\t\t</div>\n'
    '\t\t\t\t\t\t\t<div class="form-row">\n'
    '\t\t\t\t\t\t\t\t<label for="cp-max-fail">입력 실패 허용 횟수</label>\n'
    '\t\t\t\t\t\t\t\t<input type="number" id="cp-max-fail" name="max_fail_count" class="form-input" min="1" max="20" value="5">\n'
    '\t\t\t\t\t\t\t\t<span class="helper-text">초과 시 해당 코드를 무효화합니다</span>\n'
    '\t\t\t\t\t\t\t</div>\n'
    '\t\t\t\t\t\t</div>\n'
)

new = (
    '\t\t\t\t\t\t<div class="cp-policy-grid">\n'
    '\t\t\t\t\t\t\t<div class="form-row cp-full">\n'
    '\t\t\t\t\t\t\t\t<label for="cp-code-length">코드 길이 (자릿수)</label>\n'
    '\t\t\t\t\t\t\t\t<select id="cp-code-length" name="code_length" class="form-input">\n'
    '\t\t\t\t\t\t\t\t\t<option value="4">4자리</option>\n'
    '\t\t\t\t\t\t\t\t\t<option value="6" selected>6자리</option>\n'
    '\t\t\t\t\t\t\t\t\t<option value="8">8자리</option>\n'
    '\t\t\t\t\t\t\t\t</select>\n'
    '\t\t\t\t\t\t\t</div>\n'
    '\t\t\t\t\t\t\t<div class="form-row">\n'
    '\t\t\t\t\t\t\t\t<label for="cp-code-ttl">코드 유효 시간 (초)</label>\n'
    '\t\t\t\t\t\t\t\t<input type="number" id="cp-code-ttl" name="code_ttl_seconds" class="form-input" min="60" max="600" value="300">\n'
    '\t\t\t\t\t\t\t\t<span class="helper-text">기본 300초 (5분)</span>\n'
    '\t\t\t\t\t\t\t</div>\n'
    '\t\t\t\t\t\t\t<div class="form-row">\n'
    '\t\t\t\t\t\t\t\t<label for="cp-resend-wait">재발송 대기 시간 (초)</label>\n'
    '\t\t\t\t\t\t\t\t<input type="number" id="cp-resend-wait" name="resend_wait_seconds" class="form-input" min="10" max="300" value="60">\n'
    '\t\t\t\t\t\t\t\t<span class="helper-text">재발송까지 최소 대기 시간</span>\n'
    '\t\t\t\t\t\t\t</div>\n'
    '\t\t\t\t\t\t\t<div class="form-row">\n'
    '\t\t\t\t\t\t\t\t<label for="cp-max-daily">일일 최대 발송 횟수</label>\n'
    '\t\t\t\t\t\t\t\t<input type="number" id="cp-max-daily" name="max_daily_attempts" class="form-input" min="1" max="100" value="10">\n'
    '\t\t\t\t\t\t\t\t<span class="helper-text">하루 최대 코드 발송 수</span>\n'
    '\t\t\t\t\t\t\t</div>\n'
    '\t\t\t\t\t\t\t<div class="form-row">\n'
    '\t\t\t\t\t\t\t\t<label for="cp-max-fail">입력 실패 허용 횟수</label>\n'
    '\t\t\t\t\t\t\t\t<input type="number" id="cp-max-fail" name="max_fail_count" class="form-input" min="1" max="20" value="5">\n'
    '\t\t\t\t\t\t\t\t<span class="helper-text">초과 시 해당 코드 무효화</span>\n'
    '\t\t\t\t\t\t\t</div>\n'
    '\t\t\t\t\t\t</div>\n'
)

if old in text:
    text = text.replace(old, new, 1)
    text = text.replace('authentication.css?v=1.0.29', 'authentication.css?v=1.0.30')
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    print('OK')
else:
    print('NOT FOUND')
    idx = text.find('form-grid single-col')
    print('idx:', idx)
    if idx >= 0:
        print(repr(text[idx-50:idx+100]))

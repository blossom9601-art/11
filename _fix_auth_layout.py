import re

path = r'app/templates/authentication/11-3.admin/11-3-3.setting/1.setting.html'
text = open(path, encoding='utf-8').read()

# 목표: settings-col-stack 안에 SMS → 사내OTP → 코드정책 순으로 배치
# 현재 구조:
#   <div class="settings-col-stack">
#     <section id="sms-settings-card">...</section>
#     <section id="code-policy-card">...</section>
#   </div>
#   <section id="company-otp-settings-card">...</section>
# 목표 구조:
#   <div class="settings-col-stack">
#     <section id="sms-settings-card">...</section>
#     <section id="company-otp-settings-card">...</section>
#     <section id="code-policy-card">...</section>
#   </div>

# Step 1: company-otp 섹션 전체를 추출
cotp_match = re.search(
    r'(<section class="setting-card" id="company-otp-settings-card".*?</section>)',
    text, re.DOTALL
)
if not cotp_match:
    print('ERROR: company-otp-settings-card not found')
    exit(1)
cotp_block = cotp_match.group(1)

# Step 2: code-policy 섹션 전체를 추출
cp_match = re.search(
    r'(<section class="setting-card" id="code-policy-card".*?</section>)',
    text, re.DOTALL
)
if not cp_match:
    print('ERROR: code-policy-card not found')
    exit(1)
cp_block = cp_match.group(1)

# Step 3: settings-col-stack 닫힘 </div> 이후에 company-otp가 단독으로 있는 부분을 찾아
#         settings-col-stack 을 SMS + company-otp + code-policy 로 재구성

# 먼저 settings-col-stack 블록을 찾아서 교체
stack_match = re.search(
    r'(<div class="settings-col-stack">.*?</div>)\s*\n\s*(<section class="setting-card" id="company-otp-settings-card".*?</section>)',
    text, re.DOTALL
)
if not stack_match:
    print('ERROR: settings-col-stack + company-otp pattern not found')
    exit(1)

# SMS 섹션을 stack에서 추출
sms_match = re.search(
    r'(<section class="setting-card" id="sms-settings-card".*?</section>)',
    text, re.DOTALL
)
if not sms_match:
    print('ERROR: sms-settings-card not found')
    exit(1)
sms_block = sms_match.group(1)

# 새 stack 구성: SMS + company-otp + code-policy
new_stack = (
    '\t\t\t\t<div class="settings-col-stack">\n'
    '\t\t\t\t' + sms_block.strip() + '\n\n'
    '\t\t\t\t' + cotp_block.strip() + '\n\n'
    '\t\t\t\t' + cp_block.strip() + '\n'
    '\t\t\t\t</div>'
)

# 현재 match 전체(settings-col-stack + standalone company-otp)를 new_stack으로 교체
old_section = stack_match.group(0)
text2 = text.replace(old_section, new_stack, 1)

if text2 == text:
    print('ERROR: no change made')
    exit(1)

# CSS 버전 업
text2 = text2.replace('authentication.css?v=1.0.32', 'authentication.css?v=1.0.33')
# JS 버전 업
text2 = text2.replace('1.setting.js?v=20260419_session', '1.setting.js?v=20260419b')

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(text2)
print('OK - layout restructured')

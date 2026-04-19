import re

# ── HTML 수정 ──
path_html = r'app/templates/authentication/11-3.admin/11-3-3.setting/1.setting.html'
text = open(path_html, encoding='utf-8').read()

old_form = '''					<form id="company-otp-config-form" class="setting-form" autocomplete="off">
						<div class="form-grid single-col">
							<div class="form-row">
								<label for="cotp-provider">OTP 솔루션<span class="required">*</span></label>
								<select id="cotp-provider" name="provider" class="form-input">
									<option value="initech">이니텍 (INISAFE OTP)</option>
									<option value="dreamsecurity">드림시큐리티 (MagicOTP)</option>
									<option value="miraetech">미래테크 (SafeOTP)</option>
								</select>
							</div>
							<div class="form-row">
								<label for="cotp-endpoint">API Endpoint<span class="required">*</span></label>
								<input type="url" id="cotp-endpoint" name="api_endpoint" class="form-input" placeholder="https://otp.company.co.kr" required>
							</div>
							<div class="form-row">
								<label for="cotp-api-key">API Key / Client ID<span class="required">*</span></label>
								<input type="text" id="cotp-api-key" name="api_key" class="form-input" placeholder="API Key 또는 Client ID" required>
							</div>
							<div class="form-row">
								<label for="cotp-api-secret">API Secret</label>
								<input type="password" id="cotp-api-secret" name="api_secret" class="form-input" placeholder="API Secret (선택)">
							</div>
							<div class="form-row">
								<label for="cotp-server-code">서버 식별 코드 (CP Code)</label>
								<input type="text" id="cotp-server-code" name="server_code" class="form-input" placeholder="OTP 서버 CP 코드">
							</div>
							<div class="form-row">
								<label for="cotp-timeout">타임아웃 (초)</label>
								<input type="number" id="cotp-timeout" name="timeout" class="form-input" min="1" max="30" value="5">
							</div>
						</div>'''

new_form = '''					<form id="company-otp-config-form" class="setting-form" autocomplete="off">
						<div class="cp-policy-grid">
							<div class="form-row cp-full">
								<label for="cotp-provider">OTP 솔루션<span class="required">*</span></label>
								<select id="cotp-provider" name="provider" class="form-input">
									<option value="initech">이니텍 (INISAFE OTP)</option>
									<option value="dreamsecurity">드림시큐리티 (MagicOTP)</option>
									<option value="miraetech">미래테크 (SafeOTP)</option>
								</select>
							</div>
							<div class="form-row cp-full">
								<label for="cotp-endpoint">API Endpoint<span class="required">*</span></label>
								<input type="url" id="cotp-endpoint" name="api_endpoint" class="form-input" placeholder="https://otp.company.co.kr" required>
							</div>
							<div class="form-row">
								<label for="cotp-api-key">API Key / Client ID<span class="required">*</span></label>
								<input type="text" id="cotp-api-key" name="api_key" class="form-input" placeholder="API Key 또는 Client ID" required>
							</div>
							<div class="form-row">
								<label for="cotp-api-secret">API Secret</label>
								<input type="password" id="cotp-api-secret" name="api_secret" class="form-input" placeholder="API Secret (선택)">
							</div>
							<div class="form-row">
								<label for="cotp-timeout">타임아웃 (초)</label>
								<input type="number" id="cotp-timeout" name="timeout" class="form-input" min="1" max="30" value="5">
								<span class="helper-text">OTP 서버 응답 대기 시간</span>
							</div>
						</div>'''

if old_form in text:
    text = text.replace(old_form, new_form)
    # CSS 버전 업
    text = text.replace('authentication.css?v=1.0.33', 'authentication.css?v=1.0.34')
    with open(path_html, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    print('HTML OK')
else:
    print('HTML ERROR: old_form not found')

# ── JS 수정 ──
path_js = r'static/js/authentication/11-3.admin/11-3-3.setting/1.setting.js'
js = open(path_js, encoding='utf-8').read()

old_load = "\t\t\tform.server_code.value = cfg.server_code || '';\n\t\t\tform.timeout.value"
new_load = "\t\t\tform.timeout.value"

old_payload = "\t\t\t\tserver_code: form.server_code.value.trim(), timeout: Number(form.timeout.value) || 5, enabled: true"
new_payload = "\t\t\t\ttimeout: Number(form.timeout.value) || 5, enabled: true"

changed = False
if old_load in js:
    js = js.replace(old_load, new_load)
    changed = True
    print('JS load OK')
else:
    print('JS load ERROR: not found')

if old_payload in js:
    js = js.replace(old_payload, new_payload)
    print('JS payload OK')
else:
    print('JS payload ERROR: not found')

if changed:
    with open(path_js, 'w', encoding='utf-8', newline='\n') as f:
        f.write(js)
    print('JS saved')

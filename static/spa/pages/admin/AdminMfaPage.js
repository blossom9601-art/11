/* AdminMfaPage — MFA 설정 */
import { api } from '../../shared/api-client.js';
import { esc } from '../../shared/dom-utils.js';

export default class AdminMfaPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el = null;
    this._data = {};
  }

  async mount(container) {
    this._el = container;
    await this._load();
  }

  unmount() {}

  async _load() {
    const res = await api.get('/admin/auth/mfa/config', { showError: false });
    this._data = res || {};
    this._render();
  }

  _render() {
    const d = this._data;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">MFA 인증 설정</h2>
          <span class="spa-badge ${d.enabled ? 'spa-badge--success' : 'spa-badge--muted'}">${d.enabled ? '활성' : '비활성'}</span>
        </div>
        <form id="adm-mfa-form" class="spa-admin-form">
          <fieldset class="spa-fieldset">
            <legend>기본 설정</legend>
            <div class="spa-form-grid">
              <label class="spa-form-check"><input type="checkbox" name="enabled" ${d.enabled ? 'checked' : ''}> MFA 활성화</label>
              <label>기본 인증 방식 <select class="spa-input" name="default_type">
                <option value="totp" ${d.default_type === 'totp' ? 'selected' : ''}>TOTP (앱)</option>
                <option value="email" ${d.default_type === 'email' ? 'selected' : ''}>이메일</option>
                <option value="sms" ${d.default_type === 'sms' ? 'selected' : ''}>SMS</option>
                <option value="company_otp" ${d.default_type === 'company_otp' ? 'selected' : ''}>사내 OTP</option>
              </select></label>
              <label>코드 길이 <input class="spa-input" name="code_length" type="number" value="${d.code_length || 6}"></label>
              <label>코드 유효시간(초) <input class="spa-input" name="code_ttl_seconds" type="number" value="${d.code_ttl_seconds || 300}"></label>
              <label>유예 기간(일) <input class="spa-input" name="grace_period_days" type="number" value="${d.grace_period_days || 0}"></label>
              <label>기기 기억(일) <input class="spa-input" name="remember_device_days" type="number" value="${d.remember_device_days || 0}"></label>
            </div>
          </fieldset>

          <fieldset class="spa-fieldset">
            <legend>인증 방식 활성화</legend>
            <div class="spa-form-grid">
              <label class="spa-form-check"><input type="checkbox" name="totp_enabled" ${d.totp_enabled ? 'checked' : ''}> TOTP (인증 앱)</label>
              <label class="spa-form-check"><input type="checkbox" name="email_enabled" ${d.email_enabled ? 'checked' : ''}> 이메일 인증</label>
              <label class="spa-form-check"><input type="checkbox" name="sms_enabled" ${d.sms_enabled ? 'checked' : ''}> SMS 인증</label>
              <label class="spa-form-check"><input type="checkbox" name="company_otp_enabled" ${d.company_otp_enabled ? 'checked' : ''}> 사내 OTP</label>
              <label class="spa-form-check"><input type="checkbox" name="allow_user_choice" ${d.allow_user_choice ? 'checked' : ''}> 사용자 선택 허용</label>
            </div>
          </fieldset>

          <div class="spa-form-actions">
            <button type="submit" class="spa-btn spa-btn--primary">저장</button>
          </div>
        </form>
      </div>`;

    this._el.querySelector('#adm-mfa-form').addEventListener('submit', (e) => this._save(e));
  }

  async _save(e) {
    e.preventDefault();
    const form = e.target;
    const payload = {};
    form.querySelectorAll('input.spa-input, select.spa-input').forEach(el => {
      if (el.type === 'number') payload[el.name] = parseInt(el.value) || 0;
      else payload[el.name] = el.value;
    });
    form.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      payload[cb.name] = cb.checked;
    });
    await api.put('/admin/auth/mfa/config', payload);
    await this._load();
  }
}

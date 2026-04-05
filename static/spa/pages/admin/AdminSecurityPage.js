/* AdminSecurityPage — 보안정책 관리 */
import { api } from '../../shared/api-client.js';
import { esc } from '../../shared/dom-utils.js';

export default class AdminSecurityPage {
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
    const res = await api.get('/admin/auth/security-policy', { showError: false });
    this._data = res || {};
    this._render();
  }

  _render() {
    const d = this._data;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">보안 정책</h2>
          <button class="spa-btn" id="adm-sec-defaults">기본값 복원</button>
        </div>
        <form id="adm-sec-form" class="spa-admin-form">
          <fieldset class="spa-fieldset">
            <legend>비밀번호 정책</legend>
            <div class="spa-form-grid">
              <label>최소 길이 <input class="spa-input" name="min_length" type="number" value="${d.min_length ?? 8}"></label>
              <label>최대 길이 <input class="spa-input" name="max_length" type="number" value="${d.max_length ?? 20}"></label>
              <label>만료 주기(일) <input class="spa-input" name="expiry_days" type="number" value="${d.expiry_days ?? 90}"></label>
              <label>이전 비밀번호 제한 <input class="spa-input" name="history" type="number" value="${d.history ?? 3}"></label>
              <label class="spa-form-check"><input type="checkbox" name="require_uppercase" ${d.require_uppercase ? 'checked' : ''}> 대문자 필수</label>
              <label class="spa-form-check"><input type="checkbox" name="require_number" ${d.require_number ? 'checked' : ''}> 숫자 필수</label>
              <label class="spa-form-check"><input type="checkbox" name="require_symbol" ${d.require_symbol ? 'checked' : ''}> 특수문자 필수</label>
              <label class="spa-form-check"><input type="checkbox" name="block_common_passwords" ${d.block_common_passwords ? 'checked' : ''}> 취약 비밀번호 차단</label>
              <label class="spa-form-check"><input type="checkbox" name="block_user_id" ${d.block_user_id ? 'checked' : ''}> 사용자 ID 포함 금지</label>
              <label class="spa-form-check"><input type="checkbox" name="block_keyboard_patterns" ${d.block_keyboard_patterns ? 'checked' : ''}> 키보드 패턴 금지</label>
            </div>
          </fieldset>

          <fieldset class="spa-fieldset">
            <legend>잠금 정책</legend>
            <div class="spa-form-grid">
              <label>실패 잠금 횟수 <input class="spa-input" name="fail_lock_threshold" type="number" value="${d.fail_lock_threshold ?? 5}"></label>
              <label>잠금 유지(분) <input class="spa-input" name="lock_duration_minutes" type="number" value="${d.lock_duration_minutes ?? 30}"></label>
            </div>
          </fieldset>

          <fieldset class="spa-fieldset">
            <legend>세션 정책</legend>
            <div class="spa-form-grid">
              <label>유휴 시간(분) <input class="spa-input" name="idle_minutes" type="number" value="${d.idle_minutes ?? 30}"></label>
              <label>절대 만료(시간) <input class="spa-input" name="absolute_hours" type="number" value="${d.absolute_hours ?? 8}"></label>
              <label>동시 접속 수 <input class="spa-input" name="max_sessions" type="number" value="${d.max_sessions ?? 3}"></label>
              <label class="spa-form-check"><input type="checkbox" name="notify_new_login" ${d.notify_new_login ? 'checked' : ''}> 새 기기 접속 알림</label>
              <label class="spa-form-check"><input type="checkbox" name="logout_on_browser_close" ${d.logout_on_browser_close ? 'checked' : ''}> 브라우저 종료 시 로그아웃</label>
            </div>
          </fieldset>

          ${d.banned_password_list ? `
          <fieldset class="spa-fieldset">
            <legend>금칙어 목록 (${d.banned_password_list.length}개)</legend>
            <textarea class="spa-input" name="banned_words" rows="3" style="width:100%">${esc((d.banned_password_list||[]).join(', '))}</textarea>
          </fieldset>` : ''}

          ${d.recent_changes && d.recent_changes.length ? `
          <fieldset class="spa-fieldset">
            <legend>최근 변경 이력</legend>
            <div style="overflow-x:auto"><table class="spa-dt-table"><thead><tr><th>필드</th><th>이전</th><th>변경</th><th>변경자</th><th>일시</th></tr></thead>
            <tbody>${d.recent_changes.map(c => `<tr><td>${esc(c.field)}</td><td>${esc(c.old)}</td><td>${esc(c.new)}</td><td>${esc(c.by)}</td><td>${esc(c.at)}</td></tr>`).join('')}</tbody></table></div>
          </fieldset>` : ''}

          <div class="spa-form-actions">
            <button type="submit" class="spa-btn spa-btn--primary">저장</button>
          </div>
        </form>
      </div>`;

    this._el.querySelector('#adm-sec-form').addEventListener('submit', (e) => this._save(e));
    this._el.querySelector('#adm-sec-defaults').addEventListener('click', () => this._restoreDefaults());
  }

  async _save(e) {
    e.preventDefault();
    const form = e.target;
    const payload = {};
    form.querySelectorAll('input[type="number"]').forEach(inp => {
      payload[inp.name] = parseInt(inp.value) || 0;
    });
    form.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      payload[cb.name] = cb.checked ? 1 : 0;
    });
    const bw = form.querySelector('[name="banned_words"]');
    if (bw) payload.banned_words = bw.value;
    await api.put('/admin/auth/security-policy', payload);
    await this._load();
  }

  async _restoreDefaults() {
    if (!confirm('보안 정책을 기본값으로 복원하시겠습니까?')) return;
    await api.post('/admin/auth/security-policy/defaults');
    await this._load();
  }
}

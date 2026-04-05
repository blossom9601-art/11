/* AdminMailPage — SMTP 메일 설정 */
import { api } from '../../shared/api-client.js';
import { esc } from '../../shared/dom-utils.js';

export default class AdminMailPage {
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
    const res = await api.get('/admin/auth/mail/config', { showError: false });
    this._data = res || {};
    this._render();
  }

  _render() {
    const d = this._data;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">메일(SMTP) 설정</h2>
          <span class="spa-badge ${d.configured ? 'spa-badge--success' : 'spa-badge--warning'}">${d.configured ? '설정 완료' : '미설정'}</span>
        </div>
        <form id="adm-mail-form" class="spa-admin-form">
          <div class="spa-form-grid">
            <label>SMTP 서버 <input class="spa-input" name="host" value="${esc(d.host || '')}"></label>
            <label>포트 <input class="spa-input" name="port" type="number" value="${d.port || 587}"></label>
            <label>암호화 <select class="spa-input" name="encryption">
              <option value="STARTTLS" ${d.encryption === 'STARTTLS' ? 'selected' : ''}>STARTTLS</option>
              <option value="SSL" ${d.encryption === 'SSL' ? 'selected' : ''}>SSL</option>
              <option value="NONE" ${d.encryption === 'NONE' ? 'selected' : ''}>없음</option>
            </select></label>
            <label class="spa-form-check"><input type="checkbox" name="use_auth" ${d.use_auth !== false ? 'checked' : ''}> 인증 사용</label>
            <label>사용자명 <input class="spa-input" name="username" value="${esc(d.username || '')}"></label>
            <label>비밀번호 <input class="spa-input" name="password" type="password" value="${esc(d.password || '')}"></label>
            <label>보낸 사람 이름 <input class="spa-input" name="from_name" value="${esc(d.from_name || 'Blossom')}"></label>
            <label>보낸 사람 이메일 <input class="spa-input" name="from_email" value="${esc(d.from_email || '')}"></label>
            <label>회신 주소 <input class="spa-input" name="reply_to" value="${esc(d.reply_to || '')}"></label>
            <label class="spa-form-check"><input type="checkbox" name="verify_cert" ${d.verify_cert !== false ? 'checked' : ''}> 인증서 검증</label>
          </div>
          <div class="spa-form-actions">
            <button type="submit" class="spa-btn spa-btn--primary">저장</button>
            <button type="button" class="spa-btn" id="adm-mail-test">테스트 발송</button>
          </div>
        </form>
      </div>`;

    this._el.querySelector('#adm-mail-form').addEventListener('submit', (e) => this._save(e));
    this._el.querySelector('#adm-mail-test').addEventListener('click', () => this._test());
  }

  async _save(e) {
    e.preventDefault();
    const form = e.target;
    const payload = {};
    form.querySelectorAll('input.spa-input, select.spa-input').forEach(el => {
      payload[el.name] = el.value;
    });
    form.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      payload[cb.name] = cb.checked;
    });
    await api.put('/admin/auth/mail/config', payload);
    await this._load();
  }

  async _test() {
    const res = await api.post('/admin/auth/mail/test', { mode: 'connection' });
    alert(res.message || res.error || 'SMTP 테스트 완료');
  }
}

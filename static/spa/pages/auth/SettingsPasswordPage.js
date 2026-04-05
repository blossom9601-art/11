/* ============================================================
 *  SettingsPasswordPage — 비밀번호 변경
 * ============================================================ */

import { api }   from '../../shared/api-client.js';
import { Toast } from '../../widgets/Toast.js';

export default class SettingsPasswordPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el = null;
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">비밀번호 변경</h2>
        </div>
        <form id="pw-form" class="spa-form" style="max-width:400px">
          <div class="spa-form-group">
            <label class="spa-form-label">현재 비밀번호</label>
            <input class="spa-form-input" name="current_password" type="password" autocomplete="current-password" required />
          </div>
          <div class="spa-form-group">
            <label class="spa-form-label">새 비밀번호</label>
            <input class="spa-form-input" name="new_password" type="password" minlength="8" autocomplete="new-password" required />
            <small class="spa-form-hint">영문+숫자+특수문자 조합, 8자 이상</small>
          </div>
          <div class="spa-form-group">
            <label class="spa-form-label">새 비밀번호 확인</label>
            <input class="spa-form-input" name="confirm_password" type="password" minlength="8" autocomplete="new-password" required />
          </div>
          <div style="display:flex;gap:8px;margin-top:16px">
            <button type="submit" class="spa-btn spa-btn--primary">변경하기</button>
            <button type="button" id="btn-back" class="spa-btn spa-btn--ghost">돌아가기</button>
          </div>
        </form>
      </div>`;

    this._el.querySelector('#btn-back').addEventListener('click', () => this._router.navigate('/profile'));
    this._el.querySelector('#pw-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this._handleSubmit();
    });
  }

  unmount() {}

  async _handleSubmit() {
    const form = this._el.querySelector('#pw-form');
    const fd = new FormData(form);
    if (fd.get('new_password') !== fd.get('confirm_password')) {
      Toast.error('새 비밀번호가 일치하지 않습니다.');
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const res = await api.post('/settings/password', {
        current_password: fd.get('current_password'),
        new_password: fd.get('new_password'),
        confirm_password: fd.get('confirm_password'),
      });
      if (res.status === 'ok') {
        Toast.success('비밀번호가 변경되었습니다.');
        this._router.navigate('/profile');
      } else {
        Toast.error(res.message || '변경 실패');
      }
    } catch(err) {
      /* settings/password returns 400 with JSON on validation error */
      if (err && err.message) Toast.error(err.message);
      else Toast.error('서버 오류');
    } finally {
      btn.disabled = false;
    }
  }
}

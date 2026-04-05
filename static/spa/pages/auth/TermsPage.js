/* ============================================================
 *  TermsPage — 서비스 이용약관 동의
 * ============================================================ */

import { esc }      from '../../shared/dom-utils.js';
import { api }      from '../../shared/api-client.js';
import { AppStore } from '../../shared/app-store.js';
import { Toast }    from '../../widgets/Toast.js';

export default class TermsPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el = null;
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `
      <div class="spa-login-page">
        <div class="spa-login-card" style="max-width:560px">
          <h2 class="spa-login-card__title">서비스 이용약관</h2>
          <div id="terms-content" class="spa-terms-content" style="max-height:320px;overflow-y:auto;border:1px solid var(--spa-gray-200);border-radius:var(--spa-radius);padding:16px;margin-bottom:16px;font-size:13px;line-height:1.7;color:var(--spa-gray-600)">
            약관 내용을 불러오는 중...
          </div>
          <form id="terms-form">
            <label class="spa-form-check">
              <input type="checkbox" name="terms_agree" required />
              <span>상기 서비스 이용약관에 동의합니다</span>
            </label>
            <button type="submit" class="spa-btn spa-btn--primary" style="width:100%;margin-top:16px">동의 및 계속</button>
          </form>
        </div>
      </div>`;

    this._loadTerms();

    this._el.querySelector('#terms-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this._handleAgree();
    });
  }

  unmount() {}

  async _loadTerms() {
    try {
      const res = await api.get('/api/auth/terms-content');
      if (res.success && res.content) {
        this._el.querySelector('#terms-content').innerHTML = res.content;
      } else {
        this._el.querySelector('#terms-content').textContent = '약관 내용이 준비되지 않았습니다. 관리자에게 문의하세요.';
      }
    } catch {
      this._el.querySelector('#terms-content').textContent = '약관을 불러올 수 없습니다.';
    }
  }

  async _handleAgree() {
    const btn = this._el.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const res = await api.post('/api/auth/terms-agree');
      if (res.success) {
        Toast.success('약관에 동의되었습니다.');
        this._router.navigate('/');
      } else {
        Toast.error(res.error || '약관 동의 처리 실패');
      }
    } catch {
      Toast.error('서버 오류');
    } finally {
      btn.disabled = false;
    }
  }
}

/* ============================================================
 *  ResetPasswordPage — 비밀번호 찾기
 * ============================================================ */

import { esc }   from '../../shared/dom-utils.js';
import { api }   from '../../shared/api-client.js';
import { Toast } from '../../widgets/Toast.js';

export default class ResetPasswordPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el = null;
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `
      <div class="spa-login-page">
        <div class="spa-login-card">
          <h2 class="spa-login-card__title">비밀번호 찾기</h2>
          <p style="text-align:center;color:var(--spa-gray-500);margin-bottom:24px">등록된 사번과 이메일을 입력하세요</p>
          <form id="reset-form">
            <div class="spa-form-group">
              <label class="spa-form-label">사번</label>
              <input class="spa-form-input" name="emp_no" type="text" required />
            </div>
            <div class="spa-form-group">
              <label class="spa-form-label">이메일</label>
              <input class="spa-form-input" name="email" type="email" required />
            </div>
            <button type="submit" class="spa-btn spa-btn--primary" style="width:100%;margin-top:8px">재설정 링크 전송</button>
          </form>
          <div style="text-align:center;margin-top:16px;font-size:13px">
            <a href="/spa/login" data-link>로그인으로 돌아가기</a>
          </div>
        </div>
      </div>`;

    this._el.querySelector('#reset-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this._handleSubmit();
    });
    this._el.querySelectorAll('[data-link]').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        this._router.navigate(a.getAttribute('href').replace('/spa', ''));
      });
    });
  }

  unmount() {}

  async _handleSubmit() {
    const form = this._el.querySelector('#reset-form');
    const fd = new FormData(form);
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;

    try {
      const res = await api.post('/api/auth/reset-password', {
        emp_no: fd.get('emp_no'),
        email: fd.get('email'),
      });
      if (res.success) {
        Toast.success('비밀번호 재설정 링크가 이메일로 전송되었습니다.');
        this._router.navigate('/login');
      } else {
        Toast.error(res.error || res.message || '정보를 확인해주세요.');
      }
    } catch {
      Toast.error('서버 오류');
    } finally {
      btn.disabled = false;
    }
  }
}

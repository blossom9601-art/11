/* ============================================================
 *  RegisterPage — 회원가입
 * ============================================================ */

import { esc }   from '../../shared/dom-utils.js';
import { api }   from '../../shared/api-client.js';
import { Toast } from '../../widgets/Toast.js';

export default class RegisterPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el = null;
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `
      <div class="spa-login-page">
        <div class="spa-login-card">
          <h2 class="spa-login-card__title">회원가입</h2>
          <form id="register-form">
            <div class="spa-form-group">
              <label class="spa-form-label">사번 <small>(숫자 8자리)</small></label>
              <input class="spa-form-input" name="emp_no" type="text" maxlength="8" pattern="[0-9]{8}" required />
            </div>
            <div class="spa-form-group">
              <label class="spa-form-label">이메일</label>
              <input class="spa-form-input" name="email" type="email" required />
            </div>
            <div class="spa-form-group">
              <label class="spa-form-label">비밀번호</label>
              <input class="spa-form-input" name="password" type="password" minlength="8" required />
              <small class="spa-form-hint">영문+숫자+특수문자 조합 8자 이상</small>
            </div>
            <div class="spa-form-group">
              <label class="spa-form-label">비밀번호 확인</label>
              <input class="spa-form-input" name="password_confirm" type="password" minlength="8" required />
            </div>
            <div class="spa-form-group">
              <label class="spa-form-check">
                <input type="checkbox" name="terms_agree" required />
                <span>서비스 이용약관에 동의합니다</span>
              </label>
            </div>
            <button type="submit" class="spa-btn spa-btn--primary" style="width:100%;margin-top:8px">가입하기</button>
          </form>
          <div style="text-align:center;margin-top:16px;font-size:13px">
            <span>이미 계정이 있으신가요?</span>
            <a href="/spa/login" data-link>로그인</a>
          </div>
        </div>
      </div>`;

    this._el.querySelector('#register-form').addEventListener('submit', (e) => {
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
    const form = this._el.querySelector('#register-form');
    const fd = new FormData(form);
    const pw = fd.get('password');
    const pwc = fd.get('password_confirm');

    if (pw !== pwc) {
      Toast.error('비밀번호가 일치하지 않습니다.');
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const res = await api.post('/api/auth/register', {
        emp_no: fd.get('emp_no'),
        email: fd.get('email'),
        password: pw,
        password_confirm: pwc,
        terms_agree: fd.get('terms_agree') ? true : false,
      });
      if (res.success) {
        Toast.success('회원가입이 완료되었습니다. 로그인해주세요.');
        this._router.navigate('/login');
      } else {
        Toast.error(res.error || res.message || '회원가입 실패');
      }
    } catch {
      Toast.error('서버 오류');
    } finally {
      btn.disabled = false;
    }
  }
}

/* ============================================================
 *  LoginPage — 로그인 (MFA 지원)
 * ============================================================ */

import { esc }      from '../../shared/dom-utils.js';
import { api }      from '../../shared/api-client.js';
import { AppStore } from '../../shared/app-store.js';
import { Toast }    from '../../widgets/Toast.js';

export default class LoginPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el = null;
    this._mfaMode = false;
    this._pendingEmpNo = '';
  }

  async mount(container) {
    this._el = container;
    this._renderLogin();
  }

  unmount() {}

  _renderLogin() {
    this._el.innerHTML = `
      <div class="spa-login-page">
        <div class="spa-login-card">
          <h2 class="spa-login-card__title">Blossom</h2>
          <p style="text-align:center;color:var(--spa-gray-500);margin-bottom:24px">IT 자산관리 시스템</p>
          <form id="login-form">
            <div class="spa-form-group">
              <label class="spa-form-label">사번</label>
              <input class="spa-form-input" name="emp_no" type="text" autocomplete="username" required />
            </div>
            <div class="spa-form-group">
              <label class="spa-form-label">비밀번호</label>
              <input class="spa-form-input" name="password" type="password" autocomplete="current-password" required />
            </div>
            <button type="submit" class="spa-btn spa-btn--primary" style="width:100%;margin-top:8px">로그인</button>
          </form>
          <div style="text-align:center;margin-top:16px;font-size:13px">
            <a href="/spa/register" data-link>회원가입</a>
            <span style="margin:0 8px;color:var(--spa-gray-300)">|</span>
            <a href="/spa/reset-password" data-link>비밀번호 찾기</a>
          </div>
        </div>
      </div>`;

    this._el.querySelector('#login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this._handleLogin();
    });

    /* SPA 내부 링크 */
    this._el.querySelectorAll('[data-link]').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        this._router.navigate(a.getAttribute('href').replace('/spa', ''));
      });
    });
  }

  _renderMfa() {
    this._el.innerHTML = `
      <div class="spa-login-page">
        <div class="spa-login-card">
          <h2 class="spa-login-card__title">2차 인증</h2>
          <p style="text-align:center;color:var(--spa-gray-500);margin-bottom:24px">인증 코드를 입력하세요</p>
          <form id="mfa-form">
            <div class="spa-form-group">
              <label class="spa-form-label">인증 코드</label>
              <input class="spa-form-input" name="code" type="text" inputmode="numeric" maxlength="8" autocomplete="one-time-code" required />
            </div>
            <button type="submit" class="spa-btn spa-btn--primary" style="width:100%;margin-top:8px">인증 확인</button>
          </form>
          <div style="text-align:center;margin-top:12px">
            <button id="mfa-resend" class="spa-btn spa-btn--ghost" style="font-size:13px">코드 재전송</button>
          </div>
        </div>
      </div>`;

    this._el.querySelector('#mfa-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this._handleMfaVerify();
    });
    this._el.querySelector('#mfa-resend').addEventListener('click', () => this._handleMfaSend());
  }

  async _handleLogin() {
    const form = this._el.querySelector('#login-form');
    const fd = new FormData(form);
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;

    try {
      const res = await api.post('/api/auth/login', {
        emp_no: fd.get('emp_no'),
        password: fd.get('password'),
      });

      if (res.mfa_required) {
        this._mfaMode = true;
        this._pendingEmpNo = res.emp_no || fd.get('emp_no');
        this._renderMfa();
        await this._handleMfaSend();
        return;
      }

      if (res.success) {
        AppStore.set('auth', { isLoggedIn: true, user: res.item || res.user });
        if (res.terms_required) {
          this._router.navigate('/terms');
        } else {
          this._router.navigate('/');
        }
      } else {
        Toast.error(res.error || res.message || '로그인 실패');
      }
    } catch (err) {
      Toast.error('서버 연결 오류');
    } finally {
      btn.disabled = false;
    }
  }

  async _handleMfaSend() {
    try {
      await api.post('/api/mfa/send-code', {
        emp_no: this._pendingEmpNo,
        mfa_type: 'email',
      });
      Toast.success('인증 코드가 전송되었습니다.');
    } catch {
      Toast.error('코드 전송 실패');
    }
  }

  async _handleMfaVerify() {
    const form = this._el.querySelector('#mfa-form');
    const code = form.querySelector('input[name="code"]').value.trim();
    if (!code) return;

    try {
      const res = await api.post('/api/mfa/verify', {
        emp_no: this._pendingEmpNo,
        code,
        mfa_type: 'email',
      });
      if (res.verified) {
        /* MFA 인증 후 세션 완료 → me 재조회 */
        const me = await api.get('/api/auth/me');
        if (me.success && me.item) {
          AppStore.set('auth', { isLoggedIn: true, user: me.item });
        }
        this._router.navigate(res.redirect || '/');
      } else {
        Toast.error(res.error || '인증 코드가 올바르지 않습니다.');
      }
    } catch {
      Toast.error('인증 확인 실패');
    }
  }
}

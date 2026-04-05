/* ============================================================
 *  ProfilePage — 내 프로필
 * ============================================================ */

import { esc }         from '../../shared/dom-utils.js';
import { api }         from '../../shared/api-client.js';
import { AppStore }    from '../../shared/app-store.js';
import { Toast }       from '../../widgets/Toast.js';
import { fetchQuery }  from '../../shared/bq.js';

export default class ProfilePage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el = null;
    this._user = null;
    this._editing = false;
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = '<div class="spa-page"><div class="spa-loading-inline"></div></div>';

    try {
      const res = await fetchQuery(['auth', 'profile'], () => api.get('/api/auth/profile'));
      if (res.success && res.item) {
        this._user = res.item;
        this._render();
      } else {
        this._el.innerHTML = '<div class="spa-page"><p class="spa-text-muted">프로필을 불러올 수 없습니다.</p></div>';
      }
    } catch {
      this._el.innerHTML = '<div class="spa-page"><p class="spa-text-muted">서버 오류</p></div>';
    }
  }

  unmount() {}

  _render() {
    const u = this._user;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">내 프로필</h2>
          <div>
            <button id="btn-edit" class="spa-btn spa-btn--outline">수정</button>
            <button id="btn-pw" class="spa-btn spa-btn--ghost">비밀번호 변경</button>
          </div>
        </div>
        <div class="spa-profile-card">
          <div class="spa-profile-avatar">
            <img src="${esc(u.profile_image || '/static/image/svg/profil/free-icon-bussiness-man.svg')}" alt="프로필" />
          </div>
          <div class="spa-profile-info">
            <div class="spa-profile-row"><span class="spa-profile-label">사번</span><span>${esc(u.emp_no)}</span></div>
            <div class="spa-profile-row"><span class="spa-profile-label">이름</span><span>${esc(u.name || '-')}</span></div>
            <div class="spa-profile-row"><span class="spa-profile-label">이메일</span><span>${esc(u.email || '-')}</span></div>
            <div class="spa-profile-row"><span class="spa-profile-label">역할</span><span>${esc(u.role || '-')}</span></div>
            <div class="spa-profile-row"><span class="spa-profile-label">부서</span><span>${esc(u.department || '-')}</span></div>
            <div class="spa-profile-row"><span class="spa-profile-label">회사</span><span>${esc(u.company || '-')}</span></div>
            <div class="spa-profile-row"><span class="spa-profile-label">내선번호</span><span>${esc(u.ext_phone || '-')}</span></div>
            <div class="spa-profile-row"><span class="spa-profile-label">휴대폰</span><span>${esc(u.mobile_phone || '-')}</span></div>
            <div class="spa-profile-row"><span class="spa-profile-label">직무</span><span>${esc(u.job || '-')}</span></div>
            <div class="spa-profile-row"><span class="spa-profile-label">최근 로그인</span><span>${esc(u.last_login_at || '-')}</span></div>
          </div>
        </div>
      </div>`;

    this._el.querySelector('#btn-edit').addEventListener('click', () => this._renderEditForm());
    this._el.querySelector('#btn-pw').addEventListener('click', () => this._router.navigate('/settings/password'));
  }

  _renderEditForm() {
    const u = this._user;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">프로필 수정</h2>
        </div>
        <form id="profile-form" class="spa-form" style="max-width:480px">
          <div class="spa-form-group"><label class="spa-form-label">이름</label>
            <input class="spa-form-input" name="name" value="${esc(u.name || '')}" /></div>
          <div class="spa-form-group"><label class="spa-form-label">닉네임</label>
            <input class="spa-form-input" name="nickname" value="${esc(u.nickname || '')}" /></div>
          <div class="spa-form-group"><label class="spa-form-label">이메일</label>
            <input class="spa-form-input" name="email" type="email" value="${esc(u.email || '')}" /></div>
          <div class="spa-form-group"><label class="spa-form-label">내선번호</label>
            <input class="spa-form-input" name="ext_phone" value="${esc(u.ext_phone || '')}" /></div>
          <div class="spa-form-group"><label class="spa-form-label">휴대폰</label>
            <input class="spa-form-input" name="mobile_phone" value="${esc(u.mobile_phone || '')}" /></div>
          <div class="spa-form-group"><label class="spa-form-label">직무</label>
            <input class="spa-form-input" name="job" value="${esc(u.job || '')}" /></div>
          <div class="spa-form-group"><label class="spa-form-label">모토</label>
            <input class="spa-form-input" name="motto" value="${esc(u.motto || '')}" /></div>
          <div style="display:flex;gap:8px;margin-top:16px">
            <button type="submit" class="spa-btn spa-btn--primary">저장</button>
            <button type="button" id="btn-cancel" class="spa-btn spa-btn--ghost">취소</button>
          </div>
        </form>
      </div>`;

    this._el.querySelector('#btn-cancel').addEventListener('click', () => this._render());
    this._el.querySelector('#profile-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this._handleSave();
    });
  }

  async _handleSave() {
    const form = this._el.querySelector('#profile-form');
    const fd = new FormData(form);
    const payload = {};
    for (const [k, v] of fd.entries()) payload[k] = v;

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const res = await api.put('/api/auth/profile', payload);
      if (res.success) {
        Toast.success('프로필이 저장되었습니다.');
        Object.assign(this._user, payload);
        this._render();
      } else {
        Toast.error(res.error || '저장 실패');
      }
    } catch {
      Toast.error('서버 오류');
    } finally {
      btn.disabled = false;
    }
  }
}

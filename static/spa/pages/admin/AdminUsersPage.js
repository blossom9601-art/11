/* AdminUsersPage — 사용자 관리 */
import { api } from '../../shared/api-client.js';
import { esc } from '../../shared/dom-utils.js';

export default class AdminUsersPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el = null;
    this._users = [];
    this._search = '';
  }

  async mount(container) {
    this._el = container;
    await this._load();
  }

  unmount() {}

  async _load() {
    const res = await api.get('/admin/auth/locked?format=json', { showError: false });
    this._users = res.users || [];
    this._render();
  }

  _filtered() {
    const q = this._search.toLowerCase();
    if (!q) return this._users;
    return this._users.filter(u =>
      (u.emp_no||'').toLowerCase().includes(q) ||
      (u.name||'').toLowerCase().includes(q) ||
      (u.department||'').toLowerCase().includes(q) ||
      (u.email||'').toLowerCase().includes(q)
    );
  }

  _render() {
    const rows = this._filtered();
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">사용자 관리</h2>
          <div class="spa-page-header__actions">
            <input type="text" class="spa-input" id="adm-user-search" placeholder="이름/사번/부서 검색..." value="${esc(this._search)}" style="width:220px">
            <button class="spa-btn spa-btn--outline" id="adm-user-export">CSV 내보내기</button>
            <button class="spa-btn spa-btn--primary" id="adm-user-add">+ 사용자 추가</button>
          </div>
        </div>
        <div class="spa-admin-table-wrap">
          <table class="spa-dt-table">
            <thead>
              <tr>
                <th>사번</th><th>이름</th><th>부서</th><th>이메일</th>
                <th>역할</th><th>상태</th><th>최근 로그인</th><th>작업</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length === 0 ? '<tr><td colspan="8" class="spa-text-muted" style="text-align:center">사용자가 없습니다.</td></tr>' :
                rows.map(u => `<tr>
                  <td>${esc(u.emp_no)}</td>
                  <td>${esc(u.name)}</td>
                  <td>${esc(u.department)}</td>
                  <td>${esc(u.email)}</td>
                  <td><span class="spa-badge spa-badge--${u.role === 'ADMIN' ? 'danger' : 'info'}">${esc(u.role)}</span></td>
                  <td>${u.locked ? '<span class="spa-badge spa-badge--danger">잠김</span>' :
                       u.employment_status === '퇴직' ? '<span class="spa-badge spa-badge--muted">퇴직</span>' :
                       '<span class="spa-badge spa-badge--success">활성</span>'}</td>
                  <td>${esc(u.last_login_at)}</td>
                  <td class="spa-admin-actions">
                    <button class="spa-btn spa-btn--sm spa-btn--outline" data-edit="${esc(u.emp_no)}">편집</button>
                    <button class="spa-btn spa-btn--sm spa-btn--outline" data-reset="${esc(u.emp_no)}">PW초기화</button>
                    <button class="spa-btn spa-btn--sm spa-btn--danger-outline" data-del="${esc(u.emp_no)}">삭제</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div id="adm-user-modal" class="spa-modal" style="display:none">
        <div class="spa-modal__backdrop"></div>
        <div class="spa-modal__content">
          <h3 id="adm-user-modal-title">사용자 추가</h3>
          <form id="adm-user-form">
            <div class="spa-form-grid">
              <label>사번 <input class="spa-input" name="emp_no" required></label>
              <label>이름 <input class="spa-input" name="name" required></label>
              <label>이메일 <input class="spa-input" name="email" type="email" required></label>
              <label>부서 <input class="spa-input" name="department"></label>
              <label>회사 <input class="spa-input" name="company"></label>
              <label>역할 <select class="spa-input" name="role">
                <option value="USER">USER</option>
                <option value="TEAM_LEADER">TEAM_LEADER</option>
                <option value="APPROVER">APPROVER</option>
                <option value="ADMIN">ADMIN</option>
              </select></label>
              <label>내선번호 <input class="spa-input" name="ext_phone"></label>
              <label>휴대폰 <input class="spa-input" name="mobile_phone"></label>
              <label>직무 <input class="spa-input" name="job"></label>
              <label>재직상태 <select class="spa-input" name="employment_status">
                <option value="재직">재직</option>
                <option value="휴직">휴직</option>
                <option value="퇴직">퇴직</option>
              </select></label>
            </div>
            <div class="spa-modal__footer">
              <button type="button" class="spa-btn" id="adm-user-cancel">취소</button>
              <button type="submit" class="spa-btn spa-btn--primary" id="adm-user-save">저장</button>
            </div>
          </form>
        </div>
      </div>`;

    // Events
    this._el.querySelector('#adm-user-search').addEventListener('input', (e) => {
      this._search = e.target.value;
      this._render();
    });
    this._el.querySelector('#adm-user-export')?.addEventListener('click', () => this._exportCsv());
    this._el.querySelector('#adm-user-add').addEventListener('click', () => this._openModal());
    this._el.querySelector('#adm-user-cancel').addEventListener('click', () => this._closeModal());
    this._el.querySelector('.spa-modal__backdrop').addEventListener('click', () => this._closeModal());
    this._el.querySelector('#adm-user-form').addEventListener('submit', (e) => this._handleSubmit(e));

    this._el.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => this._openModal(btn.dataset.edit));
    });
    this._el.querySelectorAll('[data-reset]').forEach(btn => {
      btn.addEventListener('click', () => this._resetPassword(btn.dataset.reset));
    });
    this._el.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', () => this._deleteUser(btn.dataset.del));
    });
  }

  _openModal(empNo) {
    const modal = this._el.querySelector('#adm-user-modal');
    const form = this._el.querySelector('#adm-user-form');
    const title = this._el.querySelector('#adm-user-modal-title');
    form.reset();
    if (empNo) {
      title.textContent = '사용자 편집';
      const u = this._users.find(x => x.emp_no === empNo);
      if (u) {
        form.emp_no.value = u.emp_no;
        form.emp_no.readOnly = true;
        form.name.value = u.name || '';
        form.email.value = u.email || '';
        form.department.value = u.department || '';
        form.company.value = u.company || '';
        form.role.value = u.role || 'USER';
        form.ext_phone.value = u.ext_phone || '';
        form.mobile_phone.value = u.mobile_phone || '';
        form.job.value = u.job || '';
        form.employment_status.value = u.employment_status || '재직';
      }
      form.dataset.mode = 'edit';
    } else {
      title.textContent = '사용자 추가';
      form.emp_no.readOnly = false;
      form.dataset.mode = 'create';
    }
    modal.style.display = '';
  }

  _closeModal() {
    this._el.querySelector('#adm-user-modal').style.display = 'none';
  }

  async _handleSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const mode = form.dataset.mode;
    const url = mode === 'edit' ? '/admin/auth/update' : '/admin/auth/create';
    const res = await api.post(url, fd);
    if (res.status === 'ok' || res.emp_no) {
      this._closeModal();
      await this._load();
    }
  }

  async _resetPassword(empNo) {
    if (!confirm(`${empNo}의 비밀번호를 초기화하시겠습니까?`)) return;
    const fd = new FormData();
    fd.append('emp_no', empNo);
    const res = await api.post('/api/admin/password-reset', fd);
    if (res.success) {
      alert(`초기화 완료. 새 비밀번호: ${res.new_password}`);
    }
  }

  async _deleteUser(empNo) {
    if (!confirm(`${empNo} 사용자를 삭제하시겠습니까?`)) return;
    const fd = new FormData();
    fd.append('emp_nos', empNo);
    const res = await api.post('/admin/auth/delete', fd);
    if (res.status === 'ok') {
      await this._load();
    }
  }

  _exportCsv() {
    const rows = this._filtered();
    const header = ['사번','이름','부서','이메일','역할','상태','최근로그인'];
    const lines = rows.map(u =>
      [u.emp_no, u.name, u.department, u.email, u.role, u.employment_status || (u.locked ? '잠금' : '활성'), u.last_login]
        .map(v => `"${String(v||'').replace(/"/g,'""')}"`)
        .join(',')
    );
    const csv = '\uFEFF' + header.join(',') + '\n' + lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = '사용자목록.csv'; a.click(); URL.revokeObjectURL(a.href);
  }
}

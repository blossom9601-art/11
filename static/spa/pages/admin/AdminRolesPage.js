/* AdminRolesPage — 역할/권한 관리 */
import { api } from '../../shared/api-client.js';
import { esc } from '../../shared/dom-utils.js';

const PERM_SECTIONS = [
  'dashboard','hardware','software','governance','datacenter','cost','project','category','insight'
];

export default class AdminRolesPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el = null;
    this._roles = [];
    this._editing = null;
  }

  async mount(container) {
    this._el = container;
    await this._load();
  }

  unmount() {}

  async _load() {
    const res = await api.get('/admin/auth/groups/list', { showError: false });
    this._roles = res.roles || [];
    this._render();
  }

  _render() {
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">역할 / 권한 관리</h2>
          <button class="spa-btn spa-btn--primary" id="adm-role-add">+ 역할 생성</button>
        </div>
        <div class="spa-admin-cards">
          ${this._roles.length === 0 ? '<p class="spa-text-muted">등록된 역할이 없습니다.</p>' :
            this._roles.map(r => `
              <div class="spa-admin-role-card" data-id="${r.id}">
                <div class="spa-admin-role-header">
                  <h4>${esc(r.name)}</h4>
                  <span class="spa-badge spa-badge--info">${r.user_count || 0}명</span>
                </div>
                <p class="spa-text-muted">${esc(r.description || '설명 없음')}</p>
                <div class="spa-admin-role-perms">
                  ${PERM_SECTIONS.map(s => {
                    const p = (r.permissions || {})[s] || {};
                    return `<span class="spa-perm-chip ${p.read || p.write ? 'active' : ''}">${s.slice(0,4)} ${p.write ? 'RW' : p.read ? 'R' : '-'}</span>`;
                  }).join('')}
                </div>
                <div class="spa-admin-role-actions">
                  <button class="spa-btn spa-btn--sm spa-btn--outline" data-edit-role="${r.id}">편집</button>
                  <button class="spa-btn spa-btn--sm spa-btn--danger-outline" data-del-role="${r.name}">삭제</button>
                </div>
              </div>
            `).join('')}
        </div>
      </div>
      <div id="adm-role-modal" class="spa-modal" style="display:none">
        <div class="spa-modal__backdrop"></div>
        <div class="spa-modal__content" style="max-width:600px">
          <h3 id="adm-role-modal-title">역할 생성</h3>
          <form id="adm-role-form">
            <label>역할명 <input class="spa-input" name="role_name" required></label>
            <label>설명 <input class="spa-input" name="role_desc"></label>
            <h4 style="margin-top:16px">권한 설정</h4>
            <div class="spa-perm-grid">
              ${PERM_SECTIONS.map(s => `
                <div class="spa-perm-row">
                  <span>${s}</span>
                  <label><input type="checkbox" name="perm_${s}_read"> 읽기</label>
                  <label><input type="checkbox" name="perm_${s}_write"> 쓰기</label>
                </div>`).join('')}
            </div>
            <div class="spa-modal__footer">
              <button type="button" class="spa-btn" id="adm-role-cancel">취소</button>
              <button type="submit" class="spa-btn spa-btn--primary">저장</button>
            </div>
          </form>
        </div>
      </div>`;

    this._el.querySelector('#adm-role-add').addEventListener('click', () => this._openRoleModal());
    this._el.querySelector('#adm-role-cancel')?.addEventListener('click', () => this._closeRoleModal());
    this._el.querySelector('.spa-modal__backdrop')?.addEventListener('click', () => this._closeRoleModal());
    this._el.querySelector('#adm-role-form').addEventListener('submit', (e) => this._saveRole(e));
    this._el.querySelectorAll('[data-edit-role]').forEach(btn => {
      btn.addEventListener('click', () => this._openRoleModal(parseInt(btn.dataset.editRole)));
    });
    this._el.querySelectorAll('[data-del-role]').forEach(btn => {
      btn.addEventListener('click', () => this._deleteRole(btn.dataset.delRole));
    });
  }

  _openRoleModal(roleId) {
    const modal = this._el.querySelector('#adm-role-modal');
    const form = this._el.querySelector('#adm-role-form');
    const title = this._el.querySelector('#adm-role-modal-title');
    form.reset();
    if (roleId) {
      this._editing = roleId;
      title.textContent = '역할 편집';
      const r = this._roles.find(x => x.id === roleId);
      if (r) {
        form.role_name.value = r.name;
        form.role_desc.value = r.description || '';
        PERM_SECTIONS.forEach(s => {
          const p = (r.permissions || {})[s] || {};
          const readCb = form.querySelector(`[name="perm_${s}_read"]`);
          const writeCb = form.querySelector(`[name="perm_${s}_write"]`);
          if (readCb) readCb.checked = !!p.read;
          if (writeCb) writeCb.checked = !!p.write;
        });
      }
    } else {
      this._editing = null;
      title.textContent = '역할 생성';
    }
    modal.style.display = '';
  }

  _closeRoleModal() {
    this._el.querySelector('#adm-role-modal').style.display = 'none';
    this._editing = null;
  }

  async _saveRole(e) {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    // Add permission checkboxes
    PERM_SECTIONS.forEach(s => {
      fd.set(`perm_${s}_read`, form.querySelector(`[name="perm_${s}_read"]`)?.checked ? '1' : '0');
      fd.set(`perm_${s}_write`, form.querySelector(`[name="perm_${s}_write"]`)?.checked ? '1' : '0');
    });
    if (this._editing) {
      await api.post(`/admin/auth/group/${this._editing}/update`, fd);
    } else {
      await api.post('/admin/auth/group/create', fd);
    }
    this._closeRoleModal();
    await this._load();
  }

  async _deleteRole(name) {
    if (!confirm(`"${name}" 역할을 삭제하시겠습니까?`)) return;
    const fd = new FormData();
    fd.append('roles', name);
    await api.post('/admin/auth/groups/delete', fd);
    await this._load();
  }
}

/* WorkGroupPage — 작업 그룹 관리 */
import { api } from '../../shared/api-client.js';
import { esc } from '../../shared/dom-utils.js';
import { Modal } from '../../widgets/Modal.js';

export default class WorkGroupPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el = null;
    this._groups = [];
    this._search = '';
    this._selectedId = null;
    this._managers = [];
  }

  async mount(container) {
    this._el = container;
    await this._load();
  }

  unmount() {}

  async _load() {
    try {
      const res = await api.get(`/api/work-groups?search=${encodeURIComponent(this._search)}`, { showError: false });
      this._groups = res.items || res.rows || [];
    } catch {
      this._groups = [];
    }
    this._render();
  }

  _render() {
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">작업 그룹</h2>
          <div class="spa-page-header__actions">
            <input type="text" class="spa-input" id="wg-search" placeholder="그룹 검색..." value="${esc(this._search)}" style="width:200px">
            <button class="spa-btn spa-btn--outline" id="wg-export">CSV 내보내기</button>
            <button class="spa-btn spa-btn--primary" id="wg-add">+ 그룹 추가</button>
          </div>
        </div>

        <div class="spa-split-layout">
          <div class="spa-split-left">
            ${this._groups.length === 0 ? '<div class="spa-empty">등록된 그룹이 없습니다.</div>' :
              `<div class="spa-list">${this._groups.map(g => `
                <div class="spa-list-item ${this._selectedId == g.id ? 'active' : ''}" data-gid="${g.id}">
                  <div class="spa-list-item__title">${esc(g.group_name||g.name||'')}</div>
                  <div class="spa-list-item__sub">${esc(g.group_code||'')} · ${esc(g.department_name||'')}</div>
                </div>`).join('')}</div>`}
          </div>
          <div class="spa-split-right" id="wg-detail">
            ${this._selectedId ? '' : '<div class="spa-empty">그룹을 선택하세요.</div>'}
          </div>
        </div>
      </div>`;

    this._el.querySelector('#wg-search')?.addEventListener('input', e => {
      this._search = e.target.value;
      this._load();
    });
    this._el.querySelector('#wg-export')?.addEventListener('click', () => this._exportCsv());
    this._el.querySelector('#wg-add')?.addEventListener('click', () => this._addGroup());
    this._el.querySelectorAll('[data-gid]').forEach(el => {
      el.addEventListener('click', () => {
        this._selectedId = el.dataset.gid;
        this._loadDetail();
      });
    });

    if (this._selectedId) this._loadDetail();
  }

  async _loadDetail() {
    const box = this._el.querySelector('#wg-detail');
    if (!box) return;
    try {
      const res = await api.get(`/api/work-groups/${this._selectedId}`, { showError: false });
      const g = res.item || res;
      const mgRes = await api.get(`/api/work-groups/${this._selectedId}/managers`, { showError: false });
      this._managers = mgRes.items || mgRes.rows || [];

      box.innerHTML = `
        <div class="spa-detail-card">
          <div class="spa-detail-row"><span class="spa-detail-label">그룹코드</span><span class="spa-detail-value">${esc(g.group_code||'')}</span></div>
          <div class="spa-detail-row"><span class="spa-detail-label">그룹명</span><span class="spa-detail-value">${esc(g.group_name||g.name||'')}</span></div>
          <div class="spa-detail-row"><span class="spa-detail-label">부서</span><span class="spa-detail-value">${esc(g.department_name||'')}</span></div>
          <div class="spa-detail-row"><span class="spa-detail-label">상태</span><span class="spa-detail-value">${esc(g.status||'')}</span></div>
        </div>

        <h4 style="margin:1.5rem 0 0.75rem">담당자 (${this._managers.length})</h4>
        <div class="spa-admin-table-wrap">
          <table class="spa-dt-table">
            <thead><tr><th>이름</th><th>역할</th><th>소속</th><th>전화</th><th>이메일</th><th>작업</th></tr></thead>
            <tbody>${this._managers.length === 0 ? '<tr><td colspan="6" class="spa-text-muted" style="text-align:center">담당자가 없습니다.</td></tr>' :
              this._managers.map(m => `<tr>
                <td>${esc(m.name||'')}</td>
                <td>${esc(m.role||'')}</td>
                <td>${esc(m.org||'')}</td>
                <td>${esc(m.phone||'')}</td>
                <td>${esc(m.email||'')}</td>
                <td><button class="spa-btn spa-btn--sm spa-btn--danger-outline" data-del-mgr="${m.id}">삭제</button></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <button class="spa-btn spa-btn--outline spa-btn--sm" id="wg-add-mgr" style="margin-top:0.5rem">+ 담당자 추가</button>`;

      box.querySelectorAll('[data-del-mgr]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('담당자를 삭제하시겠습니까?')) return;
          try {
            await api.delete(`/api/work-groups/${this._selectedId}/managers/${btn.dataset.delMgr}`);
            await this._loadDetail();
          } catch { /* handled */ }
        });
      });
      box.querySelector('#wg-add-mgr')?.addEventListener('click', () => this._addManager());
    } catch {
      box.innerHTML = '<div class="spa-empty">그룹 정보를 불러올 수 없습니다.</div>';
    }
  }

  async _addGroup() {
    const modal = new Modal({
      title: '그룹 추가',
      content: '<div class="spa-form-group"><label class="spa-label">그룹 이름</label><input type="text" class="spa-input" id="modal-name" placeholder="그룹 이름" autofocus></div><div class="spa-form-group"><label class="spa-label">그룹 코드</label><input type="text" class="spa-input" id="modal-code" placeholder="그룹 코드"></div>',
      size: 'sm',
      confirmText: '등록',
      onConfirm: async () => {
        const name = modal._el.querySelector('#modal-name')?.value?.trim();
        const code = modal._el.querySelector('#modal-code')?.value?.trim();
        if (!name || !code) return;
        modal.close();
        try { await api.post('/api/work-groups', { group_name: name, group_code: code }); await this._load(); } catch { /* handled */ }
      },
    });
    modal.open();
  }

  async _addManager() {
    const modal = new Modal({
      title: '담당자 추가',
      content: '<div class="spa-form-group"><label class="spa-label">담당자 이름</label><input type="text" class="spa-input" id="modal-name" placeholder="담당자 이름" autofocus></div>',
      size: 'sm',
      confirmText: '추가',
      onConfirm: async () => {
        const name = modal._el.querySelector('#modal-name')?.value?.trim();
        if (!name) return;
        modal.close();
        try { await api.post(`/api/work-groups/${this._selectedId}/managers`, { name, role: '담당' }); await this._loadDetail(); } catch { /* handled */ }
      },
    });
    modal.open();
  }

  _exportCsv() {
    const header = ['그룹 이름','그룹 코드','부서'];
    const lines = this._groups.map(g =>
      [g.group_name||g.name, g.group_code, g.department_name]
        .map(v => `"${String(v||'').replace(/"/g,'""')}"`)
        .join(',')
    );
    const csv = '\uFEFF' + header.join(',') + '\n' + lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = '작업그룹.csv'; a.click(); URL.revokeObjectURL(a.href);
  }
}

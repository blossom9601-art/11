/* WorkConfigPage — 작업 환경설정 (카테고리/구분/상태/운영) */
import { api } from '../../shared/api-client.js';
import { esc } from '../../shared/dom-utils.js';
import { Modal } from '../../widgets/Modal.js';

const CONFIG_TABS = [
  { key: 'categories',  label: '작업 카테고리', api: '/api/work-categories',  fields: ['name','code','description'] },
  { key: 'divisions',   label: '작업 구분',     api: '/api/work-divisions',   fields: ['name','code','description'] },
  { key: 'statuses',    label: '작업 상태',     api: '/api/work-statuses',    fields: ['name','code','color','sort_order'] },
  { key: 'operations',  label: '작업 운영',     api: '/api/work-operations',  fields: ['name','code','description'] },
];

export default class WorkConfigPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el = null;
    this._tab = 'categories';
    this._items = [];
  }

  async mount(container) {
    this._el = container;
    await this._load();
  }

  unmount() {}

  _cfg() { return CONFIG_TABS.find(t => t.key === this._tab); }

  async _load() {
    const cfg = this._cfg();
    try {
      const res = await api.get(cfg.api, { showError: false });
      this._items = res.items || res.rows || [];
    } catch {
      this._items = [];
    }
    this._render();
  }

  _render() {
    const cfg = this._cfg();
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">작업 환경설정</h2>
        </div>

        <div class="spa-tab-bar">
          ${CONFIG_TABS.map(t => `<button class="spa-tab-btn ${this._tab === t.key ? 'active' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}
        </div>

        <div class="spa-page-header__actions" style="margin:1rem 0;display:flex;gap:0.5rem">
          <button class="spa-btn spa-btn--primary" id="wc-add">+ 추가</button>
        </div>

        <div class="spa-admin-table-wrap">
          <table class="spa-dt-table">
            <thead><tr>
              ${cfg.fields.map(f => `<th>${f}</th>`).join('')}
              <th>작업</th>
            </tr></thead>
            <tbody>
              ${this._items.length === 0 ? `<tr><td colspan="${cfg.fields.length + 1}" class="spa-text-muted" style="text-align:center">데이터가 없습니다.</td></tr>` :
                this._items.map(item => `<tr>
                  ${cfg.fields.map(f => `<td>${esc(item[f]||'')}</td>`).join('')}
                  <td class="spa-admin-actions">
                    <button class="spa-btn spa-btn--sm spa-btn--outline" data-edit="${item.id}">편집</button>
                    <button class="spa-btn spa-btn--sm spa-btn--danger-outline" data-del="${item.id}">삭제</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;

    this._el.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => { this._tab = btn.dataset.tab; this._load(); });
    });
    this._el.querySelector('#wc-add')?.addEventListener('click', () => this._add());
    this._el.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => this._edit(parseInt(btn.dataset.edit, 10)));
    });
    this._el.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', () => this._del(parseInt(btn.dataset.del, 10)));
    });
  }

  async _add() {
    const cfg = this._cfg();
    const formHtml = cfg.fields.map(f =>
      `<div class="spa-form-group"><label class="spa-label">${f}</label><input type="text" class="spa-input" data-field="${f}" placeholder="${f}"></div>`
    ).join('');
    const modal = new Modal({
      title: `${cfg.label} 추가`,
      content: formHtml,
      size: 'sm',
      confirmText: '등록',
      onConfirm: async () => {
        const data = {};
        cfg.fields.forEach(f => { data[f] = modal._el.querySelector(`[data-field="${f}"]`)?.value || ''; });
        modal.close();
        try { await api.post(cfg.api, data); await this._load(); } catch { /* handled */ }
      },
    });
    modal.open();
  }

  async _edit(id) {
    const cfg = this._cfg();
    const item = this._items.find(i => i.id === id);
    if (!item) return;
    const formHtml = cfg.fields.map(f =>
      `<div class="spa-form-group"><label class="spa-label">${f}</label><input type="text" class="spa-input" data-field="${f}" value="${esc(item[f]||'')}" placeholder="${f}"></div>`
    ).join('');
    const modal = new Modal({
      title: `${cfg.label} 편집`,
      content: formHtml,
      size: 'sm',
      confirmText: '저장',
      onConfirm: async () => {
        const data = {};
        cfg.fields.forEach(f => { data[f] = modal._el.querySelector(`[data-field="${f}"]`)?.value || ''; });
        modal.close();
        try { await api.put(`${cfg.api}/${id}`, data); await this._load(); } catch { /* handled */ }
      },
    });
    modal.open();
  }

  async _del(id) {
    if (!confirm('삭제하시겠습니까?')) return;
    try {
      await api.post(`${this._cfg().api}/bulk-delete`, { ids: [id] });
      await this._load();
    } catch { /* handled */ }
  }
}

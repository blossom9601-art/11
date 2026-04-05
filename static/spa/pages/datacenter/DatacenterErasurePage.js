/* DatacenterErasurePage — 데이터센터 파쇄/소거 관리 */

import { api }       from '../../shared/api-client.js';
import { h, esc }    from '../../shared/dom-utils.js';
import { DataTable } from '../../widgets/DataTable.js';

const SUB_TABS = [
  { id: 'records', label: '소거 기록',   api: '/api/datacenter/data-deletion',
    cols: [
      { key: 'id', label: 'ID', width: '60px' },
      { key: 'asset_name', label: '자산명' },
      { key: 'deletion_type', label: '소거유형', width: '110px' },
      { key: 'method', label: '방법', width: '110px' },
      { key: 'executed_date', label: '실행일', width: '110px' },
      { key: 'operator_name', label: '담당자', width: '100px' },
      { key: 'status', label: '상태', width: '80px' },
    ] },
  { id: 'registers', label: '소거 대장',  api: '/api/datacenter/data-deletion/registers',
    cols: [
      { key: 'id', label: 'ID', width: '60px' },
      { key: 'asset_name', label: '자산명' },
      { key: 'registered_date', label: '등록일', width: '110px' },
      { key: 'status', label: '상태', width: '80px' },
    ] },
  { id: 'systems', label: '소거 시스템',  api: '/api/datacenter/data-deletion-systems',
    cols: [
      { key: 'id', label: 'ID', width: '60px' },
      { key: 'name', label: '시스템명' },
      { key: 'type', label: '유형', width: '100px' },
      { key: 'status', label: '상태', width: '80px' },
    ] },
];

export default class DatacenterErasurePage {
  constructor({ params, query, router }) {
    this._router = router;
    this._tab    = query.tab || 'records';
    this._el     = null;
    this._table  = null;
  }

  async mount(container) {
    this._el = h('div', { className: 'spa-page' });
    container.appendChild(this._el);
    this._render();
    await this._loadTab();
  }

  _render() {
    this._el.innerHTML = `
      <div class="spa-page-header">
        <button class="spa-btn spa-btn--ghost" data-action="back">← 데이터센터</button>
        <h1>파쇄 / 소거</h1>
      </div>
      <div class="spa-tab-bar" data-role="tabs">
        ${SUB_TABS.map(t => `
          <button class="spa-tab-btn ${this._tab === t.id ? 'spa-tab-btn--active' : ''}"
                  data-tab="${t.id}">${t.label}</button>
        `).join('')}
      </div>
      <div data-role="table-area"></div>`;

    this._el.querySelector('[data-action="back"]')
      .addEventListener('click', () => this._router.push('/spa/datacenter'));
    this._el.querySelector('[data-role="tabs"]')
      .addEventListener('click', e => {
        const btn = e.target.closest('[data-tab]');
        if (btn) { this._tab = btn.dataset.tab; this._render(); this._loadTab(); }
      });
  }

  async _loadTab() {
    const cfg = SUB_TABS.find(t => t.id === this._tab) || SUB_TABS[0];
    const area = this._el.querySelector('[data-role="table-area"]');
    if (this._table) { this._table.unmount(); this._table = null; }
    this._table = new DataTable({ columns: cfg.cols, pageSize: 30 });
    this._table.mount(area);
    this._table.loading(true);
    try {
      const res = await api.get(cfg.api, { page: 1, per_page: 30 });
      this._table.setData(res.rows || [], res.total || 0, 1);
    } catch { this._table.setData([], 0, 1); }
  }

  unmount() {
    if (this._table) this._table.unmount();
    if (this._el) this._el.remove();
  }
}

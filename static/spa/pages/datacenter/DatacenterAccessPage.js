/* DatacenterAccessPage — 데이터센터 출입관리 */

import { api }       from '../../shared/api-client.js';
import { h, esc }    from '../../shared/dom-utils.js';
import { DataTable } from '../../widgets/DataTable.js';

const SUB_TABS = [
  { id: 'permissions', label: '출입 권한',   api: '/api/datacenter/access/permissions',
    cols: [
      { key: 'id', label: 'ID', width: '60px' },
      { key: 'name', label: '이름' },
      { key: 'department', label: '부서' },
      { key: 'zone_name', label: '구역' },
      { key: 'permission_type', label: '권한유형', width: '100px' },
      { key: 'valid_from', label: '시작일', width: '110px' },
      { key: 'valid_until', label: '만료일', width: '110px' },
    ] },
  { id: 'zones', label: '접근 구역',   api: '/api/datacenter/access/zones',
    cols: [
      { key: 'id', label: 'ID', width: '60px' },
      { key: 'zone_name', label: '구역명' },
      { key: 'location', label: '위치' },
      { key: 'security_level', label: '보안등급', width: '100px' },
    ] },
  { id: 'records', label: '출입 기록',   api: '/api/datacenter/access/entries',
    cols: [
      { key: 'id', label: 'ID', width: '60px' },
      { key: 'person_name', label: '이름' },
      { key: 'zone_name', label: '구역' },
      { key: 'entry_time', label: '입실', width: '150px' },
      { key: 'exit_time', label: '퇴실', width: '150px' },
      { key: 'purpose', label: '목적' },
    ] },
  { id: 'authority', label: '권한 기록',  api: '/api/datacenter/access/authority-records',
    cols: [
      { key: 'id', label: 'ID', width: '60px' },
      { key: 'name', label: '이름' },
      { key: 'action', label: '작업' },
      { key: 'created_at', label: '일시', width: '150px' },
      { key: 'description', label: '내용' },
    ] },
  { id: 'systems', label: '출입 시스템',  api: '/api/datacenter/access/systems',
    cols: [
      { key: 'id', label: 'ID', width: '60px' },
      { key: 'system_name', label: '시스템명' },
      { key: 'type', label: '유형', width: '100px' },
      { key: 'location', label: '설치위치' },
      { key: 'status', label: '상태', width: '80px' },
    ] },
];

export default class DatacenterAccessPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._tab    = query.tab || 'permissions';
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
        <h1>출입관리</h1>
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

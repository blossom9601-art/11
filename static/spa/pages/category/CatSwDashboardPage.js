/* CatSwDashboardPage — 소프트웨어 카탈로그 (서브타입 라우팅) */
import { api }        from '../../shared/api-client.js';
import { esc }        from '../../shared/dom-utils.js';
import { DataTable }  from '../../widgets/DataTable.js';
import { SearchBar }  from '../../widgets/SearchBar.js';
import { MiniChart }  from '../../widgets/MiniChart.js';
import { Toast }      from '../../widgets/Toast.js';
import { TabCrudMixin } from '../../shared/tab-crud-mixin.js';

const TYPE_CONFIG = {
  os:              { api: '/api/sw-os-types',         label: 'OS',       entity: 'OS 유형' },
  database:        { api: '/api/sw-db-types',         label: 'DB',       entity: 'DB 유형' },
  middleware:      { api: '/api/sw-middleware-types',  label: '미들웨어', entity: '미들웨어 유형' },
  virtualization:  { api: '/api/sw-virtual-types',    label: '가상화',   entity: '가상화 유형' },
  security:        { api: '/api/sw-security-types',   label: '보안SW',   entity: '보안SW 유형' },
  ha:              { api: '/api/sw-ha-types',         label: 'HA',       entity: 'HA 유형' },
};
const TYPES = Object.keys(TYPE_CONFIG);

function supportEndRender(val) {
  if (!val || val === '-') return '<span class="spa-text-muted">-</span>';
  const end = new Date(val), now = new Date(), diff = (end - now) / (1000*60*60*24);
  let bg = '#16a34a'; // green: 2+ years
  if (diff < 0) bg = '#dc2626';           // red: expired
  else if (diff < 180) bg = '#ea580c';    // orange: < 6 months
  else if (diff < 730) bg = '#f59e0b';    // yellow: < 2 years
  return `<span class="spa-badge" style="background:${bg};color:#fff">${esc(val)}</span>`;
}

const COLUMNS = [
  { key: 'type_name', label: '유형명', sortable: true },
  { key: 'vendor', label: '벤더', sortable: true },
  { key: 'category', label: '분류', sortable: true, width: '100px' },
  { key: 'version', label: '버전', sortable: true, width: '100px' },
  { key: 'support_end', label: '지원종료', sortable: true, width: '110px', render: supportEndRender }
];
const FORM_FIELDS = [
  { key: 'type_name', label: '유형명', type: 'text', required: true },
  { key: 'vendor', label: '벤더', type: 'text' },
  { key: 'category', label: '분류', type: 'select', options: TYPES.map(k => ({ value: TYPE_CONFIG[k].label, label: TYPE_CONFIG[k].label })) },
  { key: 'version', label: '버전', type: 'text' },
  { key: 'support_end', label: '지원종료일', type: 'date' }
];

export default class CatSwDashboardPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._type   = params.type || query.type || 'os';
    if (!TYPE_CONFIG[this._type]) this._type = 'os';
    this._cfg    = TYPE_CONFIG[this._type];
    this._el     = null;
    this._table  = null;
    this._rows   = [];
    this._searchBar = null;
    this._filters = {};
    this._crud   = new TabCrudMixin({
      apiBase: this._cfg.api,
      formFields: FORM_FIELDS,
      entityName: this._cfg.entity,
      onRefresh: () => this._fetch(),
    });
  }

  async mount(container) {
    this._el = container;
    const tabs = TYPES.map(k => {
      const c = TYPE_CONFIG[k];
      const active = k === this._type ? ' active' : '';
      return `<button class="spa-tab-btn${active}" data-type="${k}">${esc(c.label)}</button>`;
    }).join('');
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">소프트웨어 카탈로그</h2>
          <div class="spa-page-actions">
            <button class="spa-btn spa-btn--outline" id="btn-export">CSV 내보내기</button>
          </div>
        </div>
        <div class="spa-tab-bar">${tabs}</div>
        <div id="search-area"></div>
        <div id="sw-stats" class="spa-stats-row" style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap"></div>
        <div style="display:grid;grid-template-columns:1fr 280px;gap:16px;align-items:start">
          <div>
            <div class="spa-tab-panel__header">${this._crud.renderToolbar()}</div>
            <div id="list-table"></div>
          </div>
          <div id="vendor-chart" style="background:var(--spa-card-bg,#fff);border-radius:12px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,.08)"></div>
        </div>
      </div>`;
    this._el.querySelector('.spa-tab-bar').addEventListener('click', e => {
      const btn = e.target.closest('[data-type]');
      if (btn) this._router.navigate('/category/software/' + btn.dataset.type);
    });
    this._el.querySelector('#btn-export').addEventListener('click', () =>
      this._table.exportCsv(`SW카탈로그_${this._cfg.label}.csv`));
    this._searchBar = new SearchBar({
      fields: [{ key: 'q', label: '검색어', type: 'text', placeholder: '유형명, 벤더...' }],
      onSearch: f => { this._filters = f; this._fetch(); },
      onReset:  () => { this._filters = {}; this._fetch(); },
    });
    this._searchBar.mount(this._el.querySelector('#search-area'));
    const cols = [...COLUMNS, TabCrudMixin.actionColumn(this._crud)];
    this._table = new DataTable({ columns: cols, selectable: true, emptyText: `등록된 ${this._cfg.entity}이(가) 없습니다.` });
    this._table.mount(this._el.querySelector('#list-table'));
    this._crud.bindToolbar(this._el, this._table);
    this._crud.bindRowActions(this._el);
    await this._fetch();
  }

  unmount() {
    if (this._table)     this._table.unmount();
    if (this._searchBar) this._searchBar.unmount();
  }

  async _fetch() {
    this._table.loading(true);
    try {
      const res = await api.get(this._cfg.api);
      this._rows = res.rows || res.items || [];
      this._table.setData(this._rows, this._rows.length, 1);
      this._crud.setRows(this._rows);
      this._renderStats();
    } catch { this._table.setData([], 0, 1); }
  }

  _renderStats() {
    const rows = this._rows;
    const total = rows.length;
    const now = new Date();
    const expired = rows.filter(r => r.support_end && new Date(r.support_end) < now).length;
    const soon = rows.filter(r => {
      if (!r.support_end) return false;
      const d = (new Date(r.support_end) - now) / (1000*60*60*24);
      return d >= 0 && d < 180;
    }).length;

    const statsEl = this._el.querySelector('#sw-stats');
    if (statsEl) {
      statsEl.innerHTML = [
        { label: '전체', value: total, color: '#4f6ef7' },
        { label: '지원만료', value: expired, color: '#dc2626' },
        { label: '6개월 이내', value: soon, color: '#f59e0b' },
      ].map(s => `<div style="flex:1;min-width:120px;background:var(--spa-card-bg,#fff);border-radius:10px;padding:12px 16px;box-shadow:0 1px 4px rgba(0,0,0,.08)">
        <div style="font-size:12px;color:#6b7280">${s.label}</div>
        <div style="font-size:24px;font-weight:700;color:${s.color}">${s.value}</div>
      </div>`).join('');
    }

    /* vendor donut */
    const chartEl = this._el.querySelector('#vendor-chart');
    if (chartEl && rows.length) {
      const vendorMap = {};
      rows.forEach(r => { const v = r.vendor || '미분류'; vendorMap[v] = (vendorMap[v] || 0) + 1; });
      const data = Object.entries(vendorMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([label, value]) => ({ label, value }));
      chartEl.innerHTML = '<h4 style="margin:0 0 8px;font-size:14px">벤더 분포</h4>';
      const body = document.createElement('div');
      chartEl.appendChild(body);
      MiniChart.donut(body, data, { width: 248, height: 200 });
    }
  }
}

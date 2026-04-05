/* CatHwDashboardPage — 하드웨어 카탈로그 (서브타입 라우팅) */
import { api }        from '../../shared/api-client.js';
import { esc }        from '../../shared/dom-utils.js';
import { DataTable }  from '../../widgets/DataTable.js';
import { SearchBar }  from '../../widgets/SearchBar.js';
import { MiniChart }  from '../../widgets/MiniChart.js';
import { Toast }      from '../../widgets/Toast.js';
import { TabCrudMixin } from '../../shared/tab-crud-mixin.js';

const TYPE_CONFIG = {
  server:   { api: '/api/hw-server-types',   label: '서버',      entity: '서버 유형' },
  storage:  { api: '/api/hw-storage-types',  label: '스토리지',  entity: '스토리지 유형' },
  san:      { api: '/api/hw-san-types',      label: 'SAN',       entity: 'SAN 유형' },
  network:  { api: '/api/hw-network-types',  label: '네트워크',  entity: '네트워크 유형' },
  security: { api: '/api/hw-security-types', label: '보안',      entity: '보안장비 유형' },
};
const TYPES = Object.keys(TYPE_CONFIG);

const COLUMNS = [
  { key: 'type_name', label: '모델명', sortable: true },
  { key: 'manufacturer', label: '제조사', sortable: true },
  { key: 'category', label: '분류', sortable: true, width: '100px' },
  { key: 'cpu_sockets', label: 'CPU소켓', sortable: true, width: '90px' },
  { key: 'max_memory', label: '최대메모리', sortable: true, width: '100px' },
  { key: 'form_factor', label: '폼팩터', sortable: true, width: '90px' }
];
const FORM_FIELDS = [
  { key: 'type_name', label: '모델명', type: 'text', required: true },
  { key: 'manufacturer', label: '제조사', type: 'text', required: true },
  { key: 'category', label: '분류', type: 'select', options: TYPES.map(k => ({ value: TYPE_CONFIG[k].label, label: TYPE_CONFIG[k].label })) },
  { key: 'cpu_sockets', label: 'CPU소켓', type: 'number' },
  { key: 'max_memory', label: '최대메모리(GB)', type: 'number' },
  { key: 'form_factor', label: '폼팩터', type: 'select', options: [{ value: '1U', label: '1U' }, { value: '2U', label: '2U' }, { value: '4U', label: '4U' }, { value: '블레이드', label: '블레이드' }, { value: '타워', label: '타워' }] }
];

export default class CatHwDashboardPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._type   = params.type || query.type || 'server';
    if (!TYPE_CONFIG[this._type]) this._type = 'server';
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
          <h2 class="spa-page__title">하드웨어 카탈로그</h2>
          <div class="spa-page-actions">
            <button class="spa-btn spa-btn--outline" id="btn-export">CSV 내보내기</button>
          </div>
        </div>
        <div class="spa-tab-bar">${tabs}</div>
        <div id="search-area"></div>
        <div id="hw-stats" class="spa-stats-row" style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap"></div>
        <div style="display:grid;grid-template-columns:1fr 280px;gap:16px;align-items:start">
          <div>
            <div class="spa-tab-panel__header">${this._crud.renderToolbar()}</div>
            <div id="list-table"></div>
          </div>
          <div id="mfr-chart" style="background:var(--spa-card-bg,#fff);border-radius:12px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,.08)"></div>
        </div>
      </div>`;
    this._el.querySelector('.spa-tab-bar').addEventListener('click', e => {
      const btn = e.target.closest('[data-type]');
      if (btn) this._router.navigate('/category/hardware/' + btn.dataset.type);
    });
    this._el.querySelector('#btn-export').addEventListener('click', () =>
      this._table.exportCsv(`HW카탈로그_${this._cfg.label}.csv`));
    this._searchBar = new SearchBar({
      fields: [{ key: 'q', label: '검색어', type: 'text', placeholder: '모델명, 제조사...' }],
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
    const formFactors = {};
    rows.forEach(r => { const f = r.form_factor || '미분류'; formFactors[f] = (formFactors[f] || 0) + 1; });

    const statsEl = this._el.querySelector('#hw-stats');
    if (statsEl) {
      const entries = [{ label: '전체 모델', value: total, color: '#4f6ef7' }];
      Object.entries(formFactors).sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([k, v]) => {
        entries.push({ label: k, value: v, color: '#6b7280' });
      });
      statsEl.innerHTML = entries.map(s => `<div style="flex:1;min-width:100px;background:var(--spa-card-bg,#fff);border-radius:10px;padding:12px 16px;box-shadow:0 1px 4px rgba(0,0,0,.08)">
        <div style="font-size:12px;color:#6b7280">${esc(s.label)}</div>
        <div style="font-size:24px;font-weight:700;color:${s.color}">${s.value}</div>
      </div>`).join('');
    }

    /* manufacturer donut */
    const chartEl = this._el.querySelector('#mfr-chart');
    if (chartEl && rows.length) {
      const mfrMap = {};
      rows.forEach(r => { const m = r.manufacturer || '미분류'; mfrMap[m] = (mfrMap[m] || 0) + 1; });
      const data = Object.entries(mfrMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([label, value]) => ({ label, value }));
      chartEl.innerHTML = '<h4 style="margin:0 0 8px;font-size:14px">제조사 분포</h4>';
      const body = document.createElement('div');
      chartEl.appendChild(body);
      MiniChart.donut(body, data, { width: 248, height: 200 });
    }
  }
}

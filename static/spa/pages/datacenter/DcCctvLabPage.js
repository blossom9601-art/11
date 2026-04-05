/* DcCctvLabPage — 전산실 CCTV 관리 (층별) */
import { api }        from '../../shared/api-client.js';
import { esc }        from '../../shared/dom-utils.js';
import { DataTable }  from '../../widgets/DataTable.js';
import { SearchBar }  from '../../widgets/SearchBar.js';
import { TabCrudMixin } from '../../shared/tab-crud-mixin.js';

const FLOOR_LABELS = { lab1: '1층', lab2: '2층', lab3: '3층', lab4: '4층' };

const COLUMNS = [
  { key: 'device_name', label: '장치명',   sortable: true },
  { key: 'location',    label: '설치 위치', sortable: true },
  { key: 'ip_address',  label: 'IP 주소',  sortable: true, width: '130px' },
  { key: 'status', label: '상태', sortable: true, width: '80px',
    render: (v) => {
      const m = { 'ACTIVE': '#16a34a', '활성': '#16a34a', '정상': '#16a34a', '개통': '#16a34a', 'INACTIVE': '#9ca3af', '비활성': '#9ca3af', '만료': '#9ca3af', '장애': '#dc2626', '정지': '#dc2626', 'CLOSED': '#dc2626', '해지': '#dc2626', '경고': '#dc2626', 'PENDING': '#f59e0b', '대기': '#f59e0b', '점검': '#f59e0b', '주의': '#f59e0b' };
      const c = m[v]; return c ? `<span class="spa-badge" style="background:${c};color:#fff">${v}</span>` : v || '-';
    }
  },
  { key: 'resolution',  label: '해상도',   sortable: true, width: '100px' },
  { key: 'updated_at',  label: '갱신일',   sortable: true, width: '110px' },
];

const FORM_FIELDS = [
  { key: 'device_name', label: '장치명', type: 'text', required: true },
  { key: 'location', label: '설치 위치', type: 'text' },
  { key: 'ip_address', label: 'IP 주소', type: 'text' },
  { key: 'status', label: '상태', type: 'select', options: [
    { value: '정상', label: '정상' }, { value: '장애', label: '장애' }, { value: '점검', label: '점검' },
  ]},
  { key: 'resolution', label: '해상도', type: 'text' },
];

export default class DcCctvLabPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._floor  = params.floor || 'lab1';
    this._el     = null;
    this._table  = null;
    this._rows   = [];
    this._filters = {};
    this._crud   = new TabCrudMixin({
      apiBase: `/api/system-${this._floor}-cctvs`,
      formFields: FORM_FIELDS,
      entityName: 'CCTV',
      onRefresh: () => this._fetch(),
    });
  }

  async mount(container) {
    this._el = container;
    const floorLabel = FLOOR_LABELS[this._floor] || this._floor;
    const floorTabs = Object.entries(FLOOR_LABELS).map(([k, v]) =>
      `<button class="spa-btn ${k === this._floor ? 'spa-btn--primary' : ''}" data-floor="${k}">${v}</button>`
    ).join('');
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <button class="spa-btn spa-btn--icon" id="btn-back">← CCTV</button>
          <h2 class="spa-page__title">전산실 CCTV — ${esc(floorLabel)}</h2>
          <div class="spa-page-header__actions">${floorTabs}</div>
          <div class="spa-page-actions">
            <button class="spa-btn spa-btn--outline" id="btn-export">CSV 내보내기</button>
          </div>
        </div>
        <div class="spa-tab-panel__header">${this._crud.renderToolbar()}</div>
        <div id="search-area"></div>
        <div id="list-table"></div>
      </div>`;
    const cols = [...COLUMNS, TabCrudMixin.actionColumn(this._crud)];
    this._table = new DataTable({ columns: cols, selectable: true, emptyText: 'CCTV 장치가 없습니다.' });
    this._table.mount(this._el.querySelector('#list-table'));
    this._crud.bindToolbar(this._el, this._table);
    this._crud.bindRowActions(this._el);
    this._search = new SearchBar({
      fields: [{ key: 'q', label: '검색어', type: 'text', placeholder: '검색...' }],
      onSearch: f => { this._filters = f; this._fetch(); },
      onReset:  () => { this._filters = {}; this._fetch(); },
    });
    this._search.mount(this._el.querySelector('#search-area'));
    this._el.querySelector('#btn-export')?.addEventListener('click', () =>
      this._table.exportCsv('CCTV전산실.csv'));

    this._el.querySelector('#btn-back')?.addEventListener('click', () => this._router.navigate('/datacenter/cctv'));
    this._el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-floor]');
      if (btn) this._router.navigate('/datacenter/cctv/lab/' + btn.dataset.floor);
    });
    await this._fetch();
  }

  unmount() {
    if (this._table)  this._table.unmount();
    if (this._search) this._search.unmount();
  }

  async _fetch() {
    this._table.loading(true);
    try {
      const res = await api.get(`/api/system-${this._floor}-cctvs`);
      this._rows = res.rows || res.items || [];
      const q = (this._filters?.q || '').toLowerCase();
      if (q) this._rows = this._rows.filter(r => Object.values(r).some(v => String(v||'').toLowerCase().includes(q)));
      this._table.setData(this._rows, this._rows.length, 1);
      this._crud.setRows(this._rows);
    } catch { this._table.setData([], 0, 1); }
  }
}

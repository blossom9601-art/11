/* CostCapexContractPage — CAPEX 계약 관리 */
import { api }           from '../../shared/api-client.js';
import { esc }           from '../../shared/dom-utils.js';
import { DataTable }     from '../../widgets/DataTable.js';
import { SearchBar }  from '../../widgets/SearchBar.js';
import { TabCrudMixin }  from '../../shared/tab-crud-mixin.js';

const COLUMNS = [
  { key: 'contract_name',        label: '계약명',     sortable: true },
  { key: 'contract_code',        label: '계약코드',   sortable: true, width: '110px' },
  { key: 'capex_type',           label: '유형',       sortable: true, width: '80px' },
  { key: 'vendor_name',          label: '공급업체',   sortable: true, width: '110px' },
  { key: 'contract_status', label: '상태', sortable: true, width: '80px',
    render: (v) => {
      const m = { 'ACTIVE': '#16a34a', '활성': '#16a34a', '정상': '#16a34a', '개통': '#16a34a', 'INACTIVE': '#9ca3af', '비활성': '#9ca3af', '만료': '#9ca3af', '장애': '#dc2626', '정지': '#dc2626', 'CLOSED': '#dc2626', '해지': '#dc2626', '경고': '#dc2626', 'PENDING': '#f59e0b', '대기': '#f59e0b', '점검': '#f59e0b', '주의': '#f59e0b' };
      const c = m[v]; return c ? `<span class="spa-badge" style="background:${c};color:#fff">${v}</span>` : v || '-';
    }
  },
  { key: 'maintenance_start_date', label: '시작일',   sortable: true, width: '100px' },
  { key: 'maintenance_end_date', label: '종료일',     sortable: true, width: '100px' },
  { key: 'maintenance_amount',   label: '계약금액',   sortable: true, width: '100px' },
];

const FORM_FIELDS = [
  { key: 'contract_name', label: '계약명', type: 'text', required: true },
  { key: 'contract_code', label: '계약코드', type: 'text' },
  { key: 'capex_type', label: '유형', type: 'select', options: [
    { value: 'hardware', label: '하드웨어' },
    { value: 'software', label: '소프트웨어' },
    { value: 'etc', label: '기타' },
  ]},
  { key: 'vendor_name', label: '공급업체', type: 'text' },
  { key: 'contract_status', label: '상태', type: 'select', options: [
    { value: '진행중', label: '진행중' }, { value: '완료', label: '완료' }, { value: '대기', label: '대기' },
  ]},
  { key: 'maintenance_start_date', label: '시작일', type: 'text' },
  { key: 'maintenance_end_date', label: '종료일', type: 'text' },
  { key: 'maintenance_amount', label: '계약금액', type: 'text' },
  { key: 'memo', label: '메모', type: 'textarea' },
];

export default class CostCapexContractPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el     = null;
    this._table  = null;
    this._filters = {};
    this._crud   = new TabCrudMixin({
      apiBase: '/api/capex-contracts',
      formFields: FORM_FIELDS,
      entityName: 'CAPEX 계약',
      onRefresh: () => this._fetch(),
    });
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <button class="spa-btn spa-btn--icon spa-back-btn" id="btn-back">← 비용</button>
          <h2 class="spa-page__title">CAPEX 계약 관리</h2>
          <div class="spa-page-actions">
            <button class="spa-btn spa-btn--outline" id="btn-export">CSV 내보내기</button>
          </div>
        </div>
        <div class="spa-tab-panel__header">${this._crud.renderToolbar()}</div>
        <div id="search-area"></div>
        <div id="list-table"></div>
      </div>`;

    const cols = [...COLUMNS, TabCrudMixin.actionColumn(this._crud)];
    this._table = new DataTable({ columns: cols, selectable: true, emptyText: 'CAPEX 계약이 없습니다.' });
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
      this._table.exportCsv('CAPEX계약.csv'));

    this._el.querySelector('#btn-back')?.addEventListener('click', () => this._router.navigate('/cost'));
    await this._fetch();
  }

  unmount() {
    if (this._table)  this._table.unmount();
    if (this._search) this._search.unmount();
  }

  async _fetch() {
    this._table.loading(true);
    try {
      const res = await api.get('/api/capex-contracts');
      let rows = res.items || res.rows || [];
      const q = (this._filters?.q || '').toLowerCase();
      if (q) rows = rows.filter(r => Object.values(r).some(v => String(v||'').toLowerCase().includes(q)));
      this._table.setData(rows, rows.length, 1);
      this._crud.setRows(rows);
    } catch { this._table.setData([], 0, 1); }
  }
}

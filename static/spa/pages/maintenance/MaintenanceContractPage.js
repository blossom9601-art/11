/* MaintenanceContractPage — 유지보수 계약 관리 */
import { api }        from '../../shared/api-client.js';
import { esc }        from '../../shared/dom-utils.js';
import { DataTable }  from '../../widgets/DataTable.js';
import { SearchBar }  from '../../widgets/SearchBar.js';
import { TabCrudMixin } from '../../shared/tab-crud-mixin.js';

const COLUMNS = [
  { key: 'maintenance_code', label: '계약코드',   sortable: true, width: '120px' },
  { key: 'maintenance_name', label: '계약명',     sortable: true },
  { key: 'business_no',      label: '사업자번호', sortable: true, width: '130px' },
  { key: 'call_center',      label: '콜센터',     sortable: true, width: '120px' },
  { key: 'hw_count',         label: 'HW',         sortable: true, width: '60px' },
  { key: 'sw_count',         label: 'SW',         sortable: true, width: '60px' },
  { key: 'manager_count',    label: '담당자',     sortable: true, width: '70px' },
];

const FORM_FIELDS = [
  { key: 'maintenance_code', label: '계약코드', type: 'text', required: true },
  { key: 'maintenance_name', label: '계약명', type: 'text', required: true },
  { key: 'business_no', label: '사업자번호', type: 'text' },
  { key: 'address', label: '주소', type: 'text' },
  { key: 'call_center', label: '콜센터', type: 'text' },
  { key: 'remark', label: '비고', type: 'textarea' },
];

export default class MaintenanceContractPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el     = null;
    this._table  = null;
    this._search = null;
    this._filters = {};
    this._crud   = new TabCrudMixin({
      apiBase: '/api/vendor-maintenance',
      formFields: FORM_FIELDS,
      entityName: '유지보수 계약',
      onRefresh: () => this._fetch(),
    });
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">유지보수 계약 관리</h2>
          <div class="spa-page-actions">
            <button class="spa-btn spa-btn--outline" id="btn-export">CSV 내보내기</button>
          </div>
        </div>
        <div id="search-area"></div>
        <div class="spa-tab-panel__header">${this._crud.renderToolbar()}</div>
        <div id="maint-table"></div>
      </div>`;

    this._search = new SearchBar({
      fields: [{ key: 'q', label: '검색어', type: 'text', placeholder: '계약코드, 계약명...' }],
      onSearch: f => { this._filters = f; this._fetch(); },
      onReset:  () => { this._filters = {}; this._fetch(); },
    });
    this._search.mount(this._el.querySelector('#search-area'));
    this._el.querySelector('#btn-export').addEventListener('click', () => this._table.exportCsv('유지보수계약_목록.csv'));

    const cols = [...COLUMNS, TabCrudMixin.actionColumn(this._crud)];
    this._table = new DataTable({ columns: cols, selectable: true, emptyText: '유지보수 계약이 없습니다.' });
    this._table.mount(this._el.querySelector('#maint-table'));
    this._crud.bindToolbar(this._el, this._table);
    this._crud.bindRowActions(this._el);

    this._el.querySelector('#maint-table').addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-row-id]');
      if (tr) this._router.navigate('/maintenance/contract/' + tr.dataset.rowId);
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
      const res = await api.get('/api/vendor-maintenance');
      const rows = res.items || res.rows || [];
      this._table.setData(rows, rows.length, 1);
      this._crud.setRows(rows);
    } catch { this._table.setData([], 0, 1); }
  }
}

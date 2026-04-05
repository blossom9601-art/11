/* DcAccessZonePage — 출입 구역 관리 */
import { api }        from '../../shared/api-client.js';
import { esc }        from '../../shared/dom-utils.js';
import { DataTable }  from '../../widgets/DataTable.js';
import { SearchBar }  from '../../widgets/SearchBar.js';
import { Toast }      from '../../widgets/Toast.js';
import { TabCrudMixin } from '../../shared/tab-crud-mixin.js';

const COLUMNS = [
  { key: 'zone_name', label: '구역명', sortable: true },
  { key: 'zone_type', label: '유형', sortable: true, width: '100px' },
  { key: 'floor', label: '층', sortable: true, width: '60px' },
  { key: 'max_capacity', label: '최대인원', sortable: true, width: '90px' },
  { key: 'status', label: '상태', sortable: true, width: '80px',
    render: (v) => {
      const m = { 'ACTIVE': '#16a34a', '활성': '#16a34a', '정상': '#16a34a', '개통': '#16a34a', 'INACTIVE': '#9ca3af', '비활성': '#9ca3af', '만료': '#9ca3af', '장애': '#dc2626', '정지': '#dc2626', 'CLOSED': '#dc2626', '해지': '#dc2626', '경고': '#dc2626', 'PENDING': '#f59e0b', '대기': '#f59e0b', '점검': '#f59e0b', '주의': '#f59e0b' };
      const c = m[v]; return c ? `<span class="spa-badge" style="background:${c};color:#fff">${v}</span>` : v || '-';
    }
  }
];

const FORM_FIELDS = [
  { key: 'zone_name', label: '구역명', type: 'text', required: true },
  { key: 'zone_type', label: '유형', type: 'select', options: [{ value: '서버실', label: '서버실' }, { value: '네트워크실', label: '네트워크실' }, { value: '전산실', label: '전산실' }, { value: '보안실', label: '보안실' }, { value: '사무실', label: '사무실' }] },
  { key: 'floor', label: '층', type: 'text' },
  { key: 'max_capacity', label: '최대인원', type: 'number' },
  { key: 'status', label: '상태', type: 'select', options: [{ value: '사용중', label: '사용중' }, { value: '폐쇄', label: '폐쇄' }, { value: '공사중', label: '공사중' }] }
];

export default class DcAccessZonePage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el     = null;
    this._table  = null;
    this._rows   = [];
    this._filters = {};
    this._crud   = new TabCrudMixin({
      apiBase: '/api/datacenter/access/zones',
      formFields: FORM_FIELDS,
      entityName: '출입 구역',
      onRefresh: () => this._fetch(),
    });
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header"><h2 class="spa-page__title">출입 구역 관리</h2>
          <div class="spa-page-actions">
            <button class="spa-btn spa-btn--outline" id="btn-export">CSV 내보내기</button>
          </div>
        </div>
        <div class="spa-tab-panel__header">${this._crud.renderToolbar()}</div>
        <div id="search-area"></div>
        <div id="list-table"></div>
      </div>`;
    const cols = [...COLUMNS, TabCrudMixin.actionColumn(this._crud)];
    this._table = new DataTable({ columns: cols, selectable: true, emptyText: '등록된 출입 구역이(가) 없습니다.' });
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
      this._table.exportCsv('출입구역관리.csv'));

    await this._fetch();
  }

  unmount() {
    if (this._table)  this._table.unmount();
    if (this._search) this._search.unmount();
  }

  async _fetch() {
    this._table.loading(true);
    try {
      const res = await api.get('/api/datacenter/access/zones');
      this._rows = res.rows || res.items || [];
      const q = (this._filters?.q || '').toLowerCase();
      if (q) this._rows = this._rows.filter(r => Object.values(r).some(v => String(v||'').toLowerCase().includes(q)));
      this._table.setData(this._rows, this._rows.length, 1);
      this._crud.setRows(this._rows);
    } catch { this._table.setData([], 0, 1); }
  }
}

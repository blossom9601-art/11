/* DcAuthorityControlPage — 출입 권한 관리 */
import { api }        from '../../shared/api-client.js';
import { esc }        from '../../shared/dom-utils.js';
import { DataTable }  from '../../widgets/DataTable.js';
import { SearchBar }  from '../../widgets/SearchBar.js';
import { Toast }      from '../../widgets/Toast.js';
import { TabCrudMixin } from '../../shared/tab-crud-mixin.js';

const COLUMNS = [
  { key: 'person_name', label: '이름', sortable: true },
  { key: 'department', label: '부서', sortable: true },
  { key: 'zone_name', label: '구역', sortable: true },
  { key: 'access_level', label: '권한등급', sortable: true, width: '100px' },
  { key: 'granted_by', label: '승인자', sortable: true, width: '100px' },
  { key: 'granted_date', label: '승인일', sortable: true, width: '100px' },
  { key: 'expiry_date', label: '만료일', sortable: true, width: '100px' },
  { key: 'status', label: '상태', sortable: true, width: '80px',
    render: (v) => {
      const m = { 'ACTIVE': '#16a34a', '활성': '#16a34a', '정상': '#16a34a', '개통': '#16a34a', 'INACTIVE': '#9ca3af', '비활성': '#9ca3af', '만료': '#9ca3af', '장애': '#dc2626', '정지': '#dc2626', 'CLOSED': '#dc2626', '해지': '#dc2626', '경고': '#dc2626', 'PENDING': '#f59e0b', '대기': '#f59e0b', '점검': '#f59e0b', '주의': '#f59e0b' };
      const c = m[v]; return c ? `<span class="spa-badge" style="background:${c};color:#fff">${v}</span>` : v || '-';
    }
  }
];
const FORM_FIELDS = [
  { key: 'person_name', label: '이름', type: 'text', required: true },
  { key: 'department', label: '부서', type: 'text' },
  { key: 'zone_name', label: '구역', type: 'text' },
  { key: 'access_level', label: '권한등급', type: 'select', options: [{ value: 'A', label: 'A(전체)' }, { value: 'B', label: 'B(서버실)' }, { value: 'C', label: 'C(사무실)' }, { value: 'D', label: 'D(방문자)' }] },
  { key: 'granted_by', label: '승인자', type: 'text' },
  { key: 'granted_date', label: '승인일', type: 'date' },
  { key: 'expiry_date', label: '만료일', type: 'date' },
  { key: 'status', label: '상태', type: 'select', options: [{ value: '활성', label: '활성' }, { value: '만료', label: '만료' }, { value: '정지', label: '정지' }] }
];

export default class DcAuthorityControlPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el     = null;
    this._table  = null;
    this._filters = {};
    this._crud   = new TabCrudMixin({ apiBase: '/api/datacenter/access/authority-control', formFields: FORM_FIELDS, entityName: '출입 권한', onRefresh: () => this._fetch() });
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header"><h2 class="spa-page__title">출입 권한 관리</h2>
          <div class="spa-page-actions">
            <button class="spa-btn spa-btn--outline" id="btn-export">CSV 내보내기</button>
          </div>
        </div>
        <div class="spa-tab-panel__header">${this._crud.renderToolbar()}</div>
        <div id="search-area"></div>
        <div id="list-table"></div>
      </div>`;
    const cols = [...COLUMNS, TabCrudMixin.actionColumn(this._crud)];
    this._table = new DataTable({ columns: cols, selectable: true, emptyText: '출입 권한이(가) 없습니다.' });
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
      this._table.exportCsv('출입권한관리2.csv'));

    await this._fetch();
  }

  unmount() {
    if (this._table)  this._table.unmount();
    if (this._search) this._search.unmount();
  }

  async _fetch() {
    this._table.loading(true);
    try {
      const res = await api.get('/api/datacenter/access/authority-control');
      let rows = res.rows || res.items || [];
      const q = (this._filters?.q || '').toLowerCase();
      if (q) rows = rows.filter(r => Object.values(r).some(v => String(v||'').toLowerCase().includes(q)));
      this._table.setData(rows, rows.length, 1);
      this._crud.setRows(rows);
    } catch { this._table.setData([], 0, 1); }
  }
}

/* GovAdPolicyPage — AD(Active Directory) 정책 관리 */
import { api }        from '../../shared/api-client.js';
import { esc }        from '../../shared/dom-utils.js';
import { DataTable }  from '../../widgets/DataTable.js';
import { SearchBar }  from '../../widgets/SearchBar.js';
import { TabCrudMixin } from '../../shared/tab-crud-mixin.js';

const COLUMNS = [
  { key: 'domain_name',   label: '도메인',   sortable: true },
  { key: 'fqdn',          label: 'FQDN',     sortable: true },
  { key: 'role',          label: '역할',     sortable: true, width: '100px' },
  { key: 'ad_server',     label: 'AD서버',   sortable: true },
  { key: 'status', label: '상태', sortable: true, width: '80px',
    render: (v) => {
      const m = { 'ACTIVE': '#16a34a', '활성': '#16a34a', '정상': '#16a34a', '개통': '#16a34a', 'INACTIVE': '#9ca3af', '비활성': '#9ca3af', '만료': '#9ca3af', '장애': '#dc2626', '정지': '#dc2626', 'CLOSED': '#dc2626', '해지': '#dc2626', '경고': '#dc2626', 'PENDING': '#f59e0b', '대기': '#f59e0b', '점검': '#f59e0b', '주의': '#f59e0b' };
      const c = m[v]; return c ? `<span class="spa-badge" style="background:${c};color:#fff">${v}</span>` : v || '-';
    }
  },
  { key: 'is_standby',    label: 'Standby',  sortable: true, width: '80px' },
];

const FORM_FIELDS = [
  { key: 'domain_name', label: '도메인명', type: 'text', required: true },
  { key: 'fqdn', label: 'FQDN', type: 'text', required: true },
  { key: 'role', label: '역할', type: 'select', options: [
    { value: 'DC', label: 'Domain Controller' },
    { value: 'GC', label: 'Global Catalog' },
    { value: 'RODC', label: 'Read Only DC' },
  ]},
  { key: 'ad_server', label: 'AD 서버', type: 'text' },
  { key: 'status', label: '상태', type: 'select', options: [
    { value: 'ACTIVE', label: '활성' }, { value: 'INACTIVE', label: '비활성' },
  ]},
  { key: 'is_standby', label: 'Standby', type: 'select', options: [
    { value: 'Y', label: 'Yes' }, { value: 'N', label: 'No' },
  ]},
];

export default class GovAdPolicyPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el     = null;
    this._table  = null;
    this._crud   = new TabCrudMixin({
      apiBase: '/api/network/ad',
      formFields: FORM_FIELDS,
      entityName: 'AD 정책',
      onRefresh: () => this._fetch(),
    });
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">AD 정책 관리</h2>
          <div class="spa-page-actions">
            <button class="spa-btn spa-btn--outline" id="btn-export">CSV 내보내기</button>
          </div>
        </div>
        <div class="spa-tab-panel__header">${this._crud.renderToolbar()}</div>
        <div id="search-area"></div>
        <div id="ad-table"></div>
      </div>`;
    this._searchBar = new SearchBar({
      fields: [{ key: 'q', label: '검색어', type: 'text', placeholder: '도메인, FQDN, 서버...' }],
      onSearch: (f) => { this._searchQ = f.q || ''; this._fetch(); },
      onReset:  ()  => { this._searchQ = ''; this._fetch(); },
    });
    this._searchBar.mount(this._el.querySelector('#search-area'));

    const cols = [...COLUMNS, TabCrudMixin.actionColumn(this._crud)];
    this._table = new DataTable({ columns: cols, selectable: true, emptyText: 'AD 정책이 없습니다.' });
    this._table.mount(this._el.querySelector('#ad-table'));

    this._crud.bindToolbar(this._el, this._table);
    this._crud.bindRowActions(this._el);
    this._el.querySelector('#btn-export')?.addEventListener('click', () => this._table.exportCsv('AD정책.csv'));

    this._el.querySelector('#ad-table').addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-row-id]');
      if (tr) this._router.navigate('/governance/ad/' + tr.dataset.rowId);
    });

    await this._fetch();
  }

  unmount() { if (this._table) this._table.unmount(); }

  async _fetch() {
    this._table.loading(true);
    try {
      const res = await api.get('/api/network/ad');
      const rows = res.items || res.rows || [];
      this._table.setData(rows, rows.length, 1);
      this._crud.setRows(rows);
    } catch { this._table.setData([], 0, 1); }
  }
}

/* GovBackupTapePage — 백업 테이프 관리 */
import { api }        from '../../shared/api-client.js';
import { esc }        from '../../shared/dom-utils.js';
import { DataTable }  from '../../widgets/DataTable.js';
import { SearchBar }  from '../../widgets/SearchBar.js';
import { Toast }      from '../../widgets/Toast.js';
import { TabCrudMixin } from '../../shared/tab-crud-mixin.js';

const COLUMNS = [
  { key: 'tape_label', label: '테이프명', sortable: true },
  { key: 'media_type', label: '미디어유형', sortable: true, width: '110px' },
  { key: 'capacity', label: '용량', sortable: true, width: '90px' },
  { key: 'location', label: '보관위치', sortable: true },
  { key: 'status', label: '상태', sortable: true, width: '80px',
    render: (v) => {
      const m = { 'ACTIVE': '#16a34a', '활성': '#16a34a', '정상': '#16a34a', '개통': '#16a34a', 'INACTIVE': '#9ca3af', '비활성': '#9ca3af', '만료': '#9ca3af', '장애': '#dc2626', '정지': '#dc2626', 'CLOSED': '#dc2626', '해지': '#dc2626', '경고': '#dc2626', 'PENDING': '#f59e0b', '대기': '#f59e0b', '점검': '#f59e0b', '주의': '#f59e0b' };
      const c = m[v]; return c ? `<span class="spa-badge" style="background:${c};color:#fff">${v}</span>` : v || '-';
    }
  },
  { key: 'expire_date', label: '만료일', sortable: true, width: '110px' }
];

const FORM_FIELDS = [
  { key: 'tape_label', label: '테이프명', type: 'text', required: true },
  { key: 'media_type', label: '미디어유형', type: 'select', options: [{ value: 'LTO', label: 'LTO' }, { value: 'DLT', label: 'DLT' }, { value: '가상테이프', label: '가상테이프' }] },
  { key: 'capacity', label: '용량', type: 'text' },
  { key: 'location', label: '보관위치', type: 'text' },
  { key: 'status', label: '상태', type: 'select', options: [{ value: '사용중', label: '사용중' }, { value: '보관', label: '보관' }, { value: '퇴화', label: '퇴화' }, { value: '폐기', label: '폐기' }] },
  { key: 'expire_date', label: '만료일', type: 'date' }
];

export default class GovBackupTapePage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el     = null;
    this._table  = null;
    this._rows   = [];
    this._crud   = new TabCrudMixin({
      apiBase: '/api/governance/backup/tapes',
      formFields: FORM_FIELDS,
      entityName: '백업 테이프',
      onRefresh: () => this._fetch(),
    });
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">백업 테이프 관리</h2>
          <div class="spa-page-header__actions"><button class="spa-btn" id="btn-export">CSV 내보내기</button></div>
        </div>
        <div class="spa-tab-panel__header">${this._crud.renderToolbar()}</div>
        <div id="search-area"></div>
        <div id="list-table"></div>
      </div>`;
    this._searchBar = new SearchBar({
      fields: [{ key: 'q', label: '검색어', type: 'text', placeholder: '테이프명, 위치...' }],
      onSearch: (f) => { this._searchQ = f.q || ''; this._fetch(); },
      onReset:  ()  => { this._searchQ = ''; this._fetch(); },
    });
    this._searchBar.mount(this._el.querySelector('#search-area'));
    this._el.querySelector('#btn-export')?.addEventListener('click', () => this._table.exportCsv('백업테이프.csv'));
    const cols = [...COLUMNS, TabCrudMixin.actionColumn(this._crud)];
    this._table = new DataTable({ columns: cols, selectable: true, emptyText: '등록된 백업 테이프이(가) 없습니다.' });
    this._table.mount(this._el.querySelector('#list-table'));
    this._crud.bindToolbar(this._el, this._table);
    this._crud.bindRowActions(this._el);
    await this._fetch();
  }

  unmount() { if (this._table) this._table.unmount(); if (this._searchBar) this._searchBar.unmount(); }

  async _fetch() {
    this._table.loading(true);
    try {
      const res = await api.get('/api/governance/backup/tapes');
      this._rows = res.rows || res.items || [];
      this._table.setData(this._rows, this._rows.length, 1);
      this._crud.setRows(this._rows);
    } catch { this._table.setData([], 0, 1); }
  }
}

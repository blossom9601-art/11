/* GovBackupLibraryPage — 백업 라이브러리 */
import { api }        from '../../shared/api-client.js';
import { esc }        from '../../shared/dom-utils.js';
import { DataTable }  from '../../widgets/DataTable.js';
import { SearchBar }  from '../../widgets/SearchBar.js';
import { Toast }      from '../../widgets/Toast.js';
import { TabCrudMixin } from '../../shared/tab-crud-mixin.js';

const COLUMNS = [
  { key: 'library_name', label: '라이브러리명', sortable: true },
  { key: 'library_type', label: '유형', sortable: true, width: '110px' },
  { key: 'location', label: '위치', sortable: true },
  { key: 'slot_count', label: '슬롯수', sortable: true, width: '80px' },
  { key: 'status', label: '상태', sortable: true, width: '80px',
    render: (v) => {
      const m = { 'ACTIVE': '#16a34a', '활성': '#16a34a', '정상': '#16a34a', '개통': '#16a34a', 'INACTIVE': '#9ca3af', '비활성': '#9ca3af', '만료': '#9ca3af', '장애': '#dc2626', '정지': '#dc2626', 'CLOSED': '#dc2626', '해지': '#dc2626', '경고': '#dc2626', 'PENDING': '#f59e0b', '대기': '#f59e0b', '점검': '#f59e0b', '주의': '#f59e0b' };
      const c = m[v]; return c ? `<span class="spa-badge" style="background:${c};color:#fff">${v}</span>` : v || '-';
    }
  }
];

const FORM_FIELDS = [
  { key: 'library_name', label: '라이브러리명', type: 'text', required: true },
  { key: 'library_type', label: '유형', type: 'text' },
  { key: 'location', label: '위치', type: 'text' },
  { key: 'slot_count', label: '슬롯수', type: 'number' },
  { key: 'status', label: '상태', type: 'select', options: [{ value: '정상', label: '정상' }, { value: '오류', label: '오류' }, { value: '유지보수', label: '유지보수' }] }
];

export default class GovBackupLibraryPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el     = null;
    this._table  = null;
    this._rows   = [];
    this._crud   = new TabCrudMixin({
      apiBase: '/api/governance/backup/libraries',
      formFields: FORM_FIELDS,
      entityName: '라이브러리',
      onRefresh: () => this._fetch(),
    });
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">백업 라이브러리</h2>
          <div class="spa-page-header__actions"><button class="spa-btn" id="btn-export">CSV 내보내기</button></div>
        </div>
        <div class="spa-tab-panel__header">${this._crud.renderToolbar()}</div>
        <div id="search-area"></div>
        <div id="list-table"></div>
      </div>`;
    this._searchBar = new SearchBar({
      fields: [{ key: 'q', label: '검색어', type: 'text', placeholder: '라이브러리명, 위치...' }],
      onSearch: (f) => { this._searchQ = f.q || ''; this._fetch(); },
      onReset:  ()  => { this._searchQ = ''; this._fetch(); },
    });
    this._searchBar.mount(this._el.querySelector('#search-area'));
    this._el.querySelector('#btn-export')?.addEventListener('click', () => this._table.exportCsv('백업라이브러리.csv'));
    const cols = [...COLUMNS, TabCrudMixin.actionColumn(this._crud)];
    this._table = new DataTable({ columns: cols, selectable: true, emptyText: '등록된 라이브러리이(가) 없습니다.' });
    this._table.mount(this._el.querySelector('#list-table'));
    this._crud.bindToolbar(this._el, this._table);
    this._crud.bindRowActions(this._el);
    await this._fetch();
  }

  unmount() { if (this._table) this._table.unmount(); if (this._searchBar) this._searchBar.unmount(); }

  async _fetch() {
    this._table.loading(true);
    try {
      const res = await api.get('/api/governance/backup/libraries');
      this._rows = res.rows || res.items || [];
      this._table.setData(this._rows, this._rows.length, 1);
      this._crud.setRows(this._rows);
    } catch { this._table.setData([], 0, 1); }
  }
}

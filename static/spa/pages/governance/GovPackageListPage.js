/* GovPackageListPage — 패키지 목록 조회 */
import { api }        from '../../shared/api-client.js';
import { esc }        from '../../shared/dom-utils.js';
import { DataTable }  from '../../widgets/DataTable.js';
import { SearchBar }  from '../../widgets/SearchBar.js';

const COLUMNS = [
  { key: 'package_name', label: '패키지명', sortable: true },
  { key: 'version',      label: '버전',     sortable: true, width: '100px' },
  { key: 'publisher',    label: '배포사',   sortable: true, width: '120px' },
  { key: 'install_count',label: '설치 수',  sortable: true, width: '80px' },
  { key: 'vuln_count',   label: '취약점',   sortable: true, width: '80px' },
  { key: 'status',       label: '상태',     sortable: true, width: '80px',
    render: (val) => {
      const c = val === '정상' ? '#10b981' : val === '취약' ? '#ef4444' : '#6b7280';
      return `<span class="spa-badge" style="background:${c};color:#fff">${esc(val || '-')}</span>`;
    }
  },
];

const SEARCH_FIELDS = [
  { key: 'q', label: '검색어', type: 'text', placeholder: '패키지명, 배포사...' },
  { key: 'status', label: '상태', type: 'select', options: [
    { value: '정상', label: '정상' }, { value: '취약', label: '취약' }
  ]},
];

export default class GovPackageListPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el     = null;
    this._table  = null;
    this._search = null;
    this._filters = {};
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <button class="spa-btn spa-btn--icon" id="btn-back">← 패키지 대시보드</button>
          <h2 class="spa-page__title">패키지 목록</h2>
          <div class="spa-page-header__actions">
            <button class="spa-btn" id="btn-export">CSV 내보내기</button>
          </div>
        </div>
        <div id="search-area"></div>
        <div id="pkg-table"></div>
      </div>`;

    this._search = new SearchBar({
      fields: SEARCH_FIELDS,
      onSearch: (f) => { this._filters = f; this._fetch(); },
      onReset:  ()  => { this._filters = {}; this._fetch(); },
    });
    this._search.mount(this._el.querySelector('#search-area'));

    this._table = new DataTable({ columns: COLUMNS, selectable: false, emptyText: '패키지가 없습니다.' });
    this._table.mount(this._el.querySelector('#pkg-table'));
    this._el.querySelector('#btn-back')?.addEventListener('click', () => this._router.navigate('/governance/packages'));
    this._el.querySelector('#btn-export')?.addEventListener('click', () => this._table.exportCsv('패키지목록.csv'));
    await this._fetch();
  }

  unmount() {
    if (this._table)  this._table.unmount();
    if (this._search) this._search.unmount();
  }

  async _fetch() {
    this._table.loading(true);
    try {
      const params = new URLSearchParams();
      if (this._filters.q) params.set('q', this._filters.q);
      if (this._filters.status) params.set('status', this._filters.status);
      const qs = params.toString() ? '?' + params : '';
      const res = await api.get('/api/governance/packages' + qs);
      this._table.setData(res.rows || res.items || [], (res.rows || res.items || []).length);
    } catch { this._table.setData([], 0); }
  }
}

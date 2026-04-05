/* GovPackageVulnPage — 패키지 취약점 */
import { api }        from '../../shared/api-client.js';
import { esc }        from '../../shared/dom-utils.js';
import { DataTable }  from '../../widgets/DataTable.js';
import { SearchBar }  from '../../widgets/SearchBar.js';
import { Toast }      from '../../widgets/Toast.js';
import { TabCrudMixin } from '../../shared/tab-crud-mixin.js';

const COLUMNS = [
  { key: 'cve_id', label: 'CVE ID', sortable: true, width: '140px' },
  { key: 'package_name', label: '패키지', sortable: true },
  { key: 'severity', label: '등급', sortable: true, width: '80px',
    render: (v) => {
      const m = { '긴급': '#dc2626', '높음': '#ea580c', '중간': '#f59e0b', '낮음': '#16a34a', '상': '#dc2626', '중': '#f59e0b', '하': '#16a34a' };
      const c = m[v]; return c ? `<span class="spa-badge" style="background:${c};color:#fff">${v}</span>` : v || '-';
    }
  },
  { key: 'description', label: '설명', sortable: true },
  { key: 'status', label: '상태', sortable: true, width: '80px',
    render: (v) => {
      const m = { '미조치': '#dc2626', '조치중': '#f59e0b', '완료': '#16a34a', '예외': '#9ca3af' };
      const c = m[v]; return c ? `<span class="spa-badge" style="background:${c};color:#fff">${v}</span>` : v || '-';
    }
  }
];

const FORM_FIELDS = [
  { key: 'cve_id', label: 'CVE ID', type: 'text', required: true },
  { key: 'package_name', label: '패키지명', type: 'text', required: true },
  { key: 'severity', label: '등급', type: 'select', required: true, options: [{ value: '긴급', label: '긴급' }, { value: '높음', label: '높음' }, { value: '중간', label: '중간' }, { value: '낮음', label: '낮음' }] },
  { key: 'description', label: '설명', type: 'textarea' },
  { key: 'status', label: '상태', type: 'select', options: [{ value: '미조치', label: '미조치' }, { value: '조치중', label: '조치중' }, { value: '완료', label: '완료' }, { value: '예외', label: '예외' }] },
  { key: 'remediation', label: '조치방안', type: 'textarea' }
];

export default class GovPackageVulnPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el     = null;
    this._table  = null;
    this._rows   = [];
    this._filters = {};
    this._crud   = new TabCrudMixin({
      apiBase: '/api/governance/package-vulnerabilities',
      formFields: FORM_FIELDS,
      entityName: '패키지 취약점',
      onRefresh: () => this._fetch(),
    });
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header"><h2 class="spa-page__title">패키지 취약점</h2>
          <div class="spa-page-actions">
            <button class="spa-btn spa-btn--outline" id="btn-export">CSV 내보내기</button>
          </div>
        </div>
        <div class="spa-tab-panel__header">${this._crud.renderToolbar()}</div>
        <div id="search-area"></div>
        <div id="list-table"></div>
      </div>`;
    const cols = [...COLUMNS, TabCrudMixin.actionColumn(this._crud)];
    this._table = new DataTable({ columns: cols, selectable: true, emptyText: '등록된 패키지 취약점이(가) 없습니다.' });
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
      this._table.exportCsv('패키지취약점.csv'));

    await this._fetch();
  }

  unmount() {
    if (this._table)  this._table.unmount();
    if (this._search) this._search.unmount();
  }

  async _fetch() {
    this._table.loading(true);
    try {
      const res = await api.get('/api/governance/package-vulnerabilities');
      this._rows = res.rows || res.items || [];
      const q = (this._filters?.q || '').toLowerCase();
      if (q) this._rows = this._rows.filter(r => Object.values(r).some(v => String(v||'').toLowerCase().includes(q)));
      this._table.setData(this._rows, this._rows.length, 1);
      this._crud.setRows(this._rows);
    } catch { this._table.setData([], 0, 1); }
  }
}

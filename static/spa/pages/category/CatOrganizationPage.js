/* CatOrganizationPage — 조직 관리 (센터/부서 서브타입) */
import { api }        from '../../shared/api-client.js';
import { esc }        from '../../shared/dom-utils.js';
import { DataTable }  from '../../widgets/DataTable.js';
import { SearchBar }  from '../../widgets/SearchBar.js';
import { Toast }      from '../../widgets/Toast.js';
import { TabCrudMixin } from '../../shared/tab-crud-mixin.js';

const TYPE_CONFIG = {
  center: {
    api: '/api/org-centers',
    label: '센터',
    entity: '센터',
    columns: [
      { key: 'center_name', label: '센터명', sortable: true },
      { key: 'center_code', label: '센터코드', sortable: true, width: '120px' },
      { key: 'location', label: '위치', sortable: true },
      { key: 'head_name', label: '센터장', sortable: true, width: '100px' },
      { key: 'status', label: '상태', sortable: true, width: '80px',
    render: (v) => {
      const m = { 'ACTIVE': '#16a34a', '활성': '#16a34a', '정상': '#16a34a', '개통': '#16a34a', 'INACTIVE': '#9ca3af', '비활성': '#9ca3af', '만료': '#9ca3af', '장애': '#dc2626', '정지': '#dc2626', 'CLOSED': '#dc2626', '해지': '#dc2626', '경고': '#dc2626', 'PENDING': '#f59e0b', '대기': '#f59e0b', '점검': '#f59e0b', '주의': '#f59e0b' };
      const c = m[v]; return c ? `<span class="spa-badge" style="background:${c};color:#fff">${v}</span>` : v || '-';
    }
  }
    ],
    fields: [
      { key: 'center_name', label: '센터명', type: 'text', required: true },
      { key: 'center_code', label: '센터코드', type: 'text', required: true },
      { key: 'location', label: '위치', type: 'text' },
      { key: 'head_name', label: '센터장', type: 'text' },
      { key: 'status', label: '상태', type: 'select', options: [{ value: '활성', label: '활성' }, { value: '비활성', label: '비활성' }] }
    ],
  },
  department: {
    api: '/api/org-departments',
    label: '부서',
    entity: '부서',
    columns: [
      { key: 'dept_name', label: '부서명', sortable: true },
      { key: 'dept_code', label: '부서코드', sortable: true, width: '120px' },
      { key: 'center_name', label: '소속센터', sortable: true },
      { key: 'head_name', label: '부서장', sortable: true, width: '100px' },
      { key: 'staff_count', label: '인원', sortable: true, width: '70px' },
      { key: 'status', label: '상태', sortable: true, width: '80px' }
    ],
    fields: [
      { key: 'dept_name', label: '부서명', type: 'text', required: true },
      { key: 'dept_code', label: '부서코드', type: 'text', required: true },
      { key: 'center_id', label: '소속센터', type: 'text' },
      { key: 'head_name', label: '부서장', type: 'text' },
      { key: 'status', label: '상태', type: 'select', options: [{ value: '활성', label: '활성' }, { value: '비활성', label: '비활성' }] }
    ],
  },
};
const TYPES = Object.keys(TYPE_CONFIG);

export default class CatOrganizationPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._type   = params.type || query.type || 'center';
    if (!TYPE_CONFIG[this._type]) this._type = 'center';
    this._cfg    = TYPE_CONFIG[this._type];
    this._el     = null;
    this._table  = null;
    this._rows   = [];
    this._filters = {};
    this._crud   = new TabCrudMixin({
      apiBase: this._cfg.api,
      formFields: this._cfg.fields,
      entityName: this._cfg.entity,
      onRefresh: () => this._fetch(),
    });
  }

  async mount(container) {
    this._el = container;
    const tabs = TYPES.map(k => {
      const c = TYPE_CONFIG[k];
      const active = k === this._type ? ' active' : '';
      return `<button class="spa-tab-btn${active}" data-type="${k}">${esc(c.label)}</button>`;
    }).join('');
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header"><h2 class="spa-page__title">조직 관리</h2></div>
          <div class="spa-page-actions">
            <button class="spa-btn spa-btn--outline" id="btn-export">CSV 내보내기</button>
          </div>
        <div class="spa-tab-bar">${tabs}</div>
        <div class="spa-tab-panel__header">${this._crud.renderToolbar()}</div>
        <div id="search-area"></div>
        <div id="list-table"></div>
      </div>`;
    this._el.querySelector('.spa-tab-bar').addEventListener('click', e => {
      const btn = e.target.closest('[data-type]');
      if (btn) this._router.navigate('/category/organization/' + btn.dataset.type);
    });
    const cols = [...this._cfg.columns, TabCrudMixin.actionColumn(this._crud)];
    this._table = new DataTable({ columns: cols, selectable: true, emptyText: `등록된 ${this._cfg.entity}이(가) 없습니다.` });
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
      this._table.exportCsv('조직.csv'));

    await this._fetch();
  }

  unmount() {
    if (this._table)  this._table.unmount();
    if (this._search) this._search.unmount();
  }

  async _fetch() {
    this._table.loading(true);
    try {
      const res = await api.get(this._cfg.api);
      this._rows = res.rows || res.items || [];
      const q = (this._filters?.q || '').toLowerCase();
      if (q) this._rows = this._rows.filter(r => Object.values(r).some(v => String(v||'').toLowerCase().includes(q)));
      this._table.setData(this._rows, this._rows.length, 1);
      this._crud.setRows(this._rows);
    } catch { this._table.setData([], 0, 1); }
  }
}

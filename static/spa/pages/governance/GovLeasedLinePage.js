/* GovLeasedLinePage — 전용회선 관리 (회원/고객/VAN/계열사/인트라넷) */
import { api }        from '../../shared/api-client.js';
import { esc }        from '../../shared/dom-utils.js';
import { DataTable }  from '../../widgets/DataTable.js';
import { SearchBar }  from '../../widgets/SearchBar.js';
import { TabCrudMixin } from '../../shared/tab-crud-mixin.js';

const LINE_GROUPS = [
  { key: 'member',    label: '회원사' },
  { key: 'customer',  label: '고객사' },
  { key: 'van',       label: 'VAN' },
  { key: 'affiliate', label: '계열사' },
  { key: 'intranet',  label: '인트라넷' },
];

const COLUMNS = [
  { key: 'line_no',          label: '회선번호', sortable: true, width: '110px' },
  { key: 'line_name',        label: '회선명',   sortable: true },
  { key: 'org_name',         label: '기관명',   sortable: true },
  { key: 'carrier_code',     label: '통신사',   sortable: true, width: '100px' },
  { key: 'speed_label',      label: '속도',     sortable: true, width: '90px' },
  { key: 'status_code', label: '상태', sortable: true, width: '80px',
    render: (v) => {
      const m = { 'ACTIVE': '#16a34a', '활성': '#16a34a', '정상': '#16a34a', '개통': '#16a34a', 'INACTIVE': '#9ca3af', '비활성': '#9ca3af', '만료': '#9ca3af', '장애': '#dc2626', '정지': '#dc2626', 'CLOSED': '#dc2626', '해지': '#dc2626', '경고': '#dc2626', 'PENDING': '#f59e0b', '대기': '#f59e0b', '점검': '#f59e0b', '주의': '#f59e0b' };
      const c = m[v]; return c ? `<span class="spa-badge" style="background:${c};color:#fff">${v}</span>` : v || '-';
    }
  },
  { key: 'business_purpose', label: '용도',     sortable: true },
];

const FORM_FIELDS = [
  { key: 'line_no', label: '회선번호', type: 'text', required: true },
  { key: 'line_name', label: '회선명', type: 'text', required: true },
  { key: 'org_name', label: '기관명', type: 'text', required: true },
  { key: 'status_code', label: '상태', type: 'select', required: true, options: [
    { value: 'ACTIVE', label: '개통' }, { value: 'CLOSED', label: '해지' }, { value: 'PENDING', label: '대기' },
  ]},
  { key: 'carrier_code', label: '통신사', type: 'text' },
  { key: 'speed_label', label: '속도', type: 'text' },
  { key: 'business_purpose', label: '용도', type: 'text' },
  { key: 'remark', label: '비고', type: 'textarea' },
];

export default class GovLeasedLinePage {
  constructor({ params, query, router }) {
    this._router = router;
    this._group  = query.group || params.subtype || 'member';
    this._el     = null;
    this._table  = null;
    this._filters = {};
    this._crud   = new TabCrudMixin({
      apiBase: '/api/network/leased-lines',
      formFields: FORM_FIELDS,
      entityName: '전용회선',
      onRefresh: () => this._fetch(),
    });
  }

  async mount(container) {
    this._el = container;
    const tabs = LINE_GROUPS.map(g =>
      `<button class="spa-btn ${g.key === this._group ? 'spa-btn--primary' : ''}" data-grp="${g.key}">${g.label}</button>`
    ).join('');

    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">전용회선 관리</h2>
          <div class="spa-page-header__actions">${tabs}</div>
          <div class="spa-page-actions">
            <button class="spa-btn spa-btn--outline" id="btn-export">CSV 내보내기</button>
          </div>
        </div>
        <div class="spa-tab-panel__header">${this._crud.renderToolbar()}</div>
        <div id="search-area"></div>
        <div id="line-table"></div>
      </div>`;

    const cols = [...COLUMNS, TabCrudMixin.actionColumn(this._crud)];
    this._table = new DataTable({ columns: cols, selectable: true, emptyText: '전용회선이 없습니다.' });
    this._table.mount(this._el.querySelector('#line-table'));

    this._crud.bindToolbar(this._el, this._table);
    this._crud.bindRowActions(this._el);
    this._search = new SearchBar({
      fields: [{ key: 'q', label: '검색어', type: 'text', placeholder: '검색...' }],
      onSearch: f => { this._filters = f; this._fetch(); },
      onReset:  () => { this._filters = {}; this._fetch(); },
    });
    this._search.mount(this._el.querySelector('#search-area'));
    this._el.querySelector('#btn-export')?.addEventListener('click', () =>
      this._table.exportCsv('전용회선.csv'));


    this._el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-grp]');
      if (btn) this._router.navigate('/governance/leased-line?group=' + btn.dataset.grp);
    });

    this._el.querySelector('#line-table').addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-row-id]');
      if (tr) this._router.navigate('/governance/leased-line/' + tr.dataset.rowId);
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
      const res = await api.get('/api/network/leased-lines?line_group=' + this._group);
      let rows = res.items || res.rows || [];
      const q = (this._filters?.q || '').toLowerCase();
      if (q) rows = rows.filter(r => Object.values(r).some(v => String(v||'').toLowerCase().includes(q)));
      this._table.setData(rows, rows.length, 1);
      this._crud.setRows(rows);
    } catch { this._table.setData([], 0, 1); }
  }
}

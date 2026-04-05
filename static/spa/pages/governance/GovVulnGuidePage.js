/* GovVulnGuidePage — 취약점 대응 가이드 */
import { api }           from '../../shared/api-client.js';
import { esc }           from '../../shared/dom-utils.js';
import { DataTable }     from '../../widgets/DataTable.js';
import { SearchBar }  from '../../widgets/SearchBar.js';
import { TabCrudMixin }  from '../../shared/tab-crud-mixin.js';

const COLUMNS = [
  { key: 'check_code',       label: '점검코드',   sortable: true, width: '110px' },
  { key: 'check_category',   label: '분류',       sortable: true, width: '100px' },
  { key: 'check_topic',      label: '점검항목',   sortable: true },
  { key: 'check_importance', label: '중요도', sortable: true, width: '70px',
    render: (v) => {
      const m = { '긴급': '#dc2626', '높음': '#ea580c', '중간': '#f59e0b', '낮음': '#16a34a', '상': '#dc2626', '중': '#f59e0b', '하': '#16a34a' };
      const c = m[v]; return c ? `<span class="spa-badge" style="background:${c};color:#fff">${v}</span>` : v || '-';
    }
  },
  { key: 'check_type',       label: '점검유형',   sortable: true, width: '90px' },
  { key: 'check_target',     label: '대상',       sortable: true, width: '80px' },
];

const FORM_FIELDS = [
  { key: 'check_code', label: '점검코드', type: 'text', required: true },
  { key: 'check_category', label: '분류', type: 'text', required: true },
  { key: 'check_topic', label: '점검항목', type: 'text', required: true },
  { key: 'check_importance', label: '중요도', type: 'select', options: [
    { value: '상', label: '상' }, { value: '중', label: '중' }, { value: '하', label: '하' },
  ]},
  { key: 'check_type', label: '점검유형', type: 'text' },
  { key: 'check_target', label: '대상 OS/서비스', type: 'text' },
  { key: 'check_content', label: '점검 내용', type: 'textarea' },
  { key: 'check_purpose', label: '점검 목적', type: 'textarea' },
  { key: 'security_threat', label: '보안 위협', type: 'textarea' },
  { key: 'action_method', label: '조치 방법', type: 'textarea' },
];

export default class GovVulnGuidePage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el     = null;
    this._table  = null;
    this._filters = {};
    this._crud   = new TabCrudMixin({
      apiBase: '/api/governance/vulnerability-guides',
      formFields: FORM_FIELDS,
      entityName: '취약점 가이드',
      onRefresh: () => this._fetch(),
    });
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <button class="spa-btn spa-btn--icon spa-back-btn" id="btn-back">← 취약점</button>
          <h2 class="spa-page__title">취약점 대응 가이드</h2>
          <div class="spa-page-actions">
            <button class="spa-btn spa-btn--outline" id="btn-export">CSV 내보내기</button>
          </div>
        </div>
        <div class="spa-tab-panel__header">${this._crud.renderToolbar()}</div>
        <div id="search-area"></div>
        <div id="list-table"></div>
      </div>`;

    const cols = [...COLUMNS, TabCrudMixin.actionColumn(this._crud)];
    this._table = new DataTable({ columns: cols, selectable: true, emptyText: '등록된 가이드가 없습니다.' });
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
      this._table.exportCsv('취약점가이드.csv'));

    this._el.querySelector('#btn-back')?.addEventListener('click', () => this._router.navigate('/governance/vulnerability'));
    await this._fetch();
  }

  unmount() {
    if (this._table)  this._table.unmount();
    if (this._search) this._search.unmount();
  }

  async _fetch() {
    this._table.loading(true);
    try {
      const res = await api.get('/api/governance/vulnerability-guides');
      let rows = res.items || res.rows || [];
      const q = (this._filters?.q || '').toLowerCase();
      if (q) rows = rows.filter(r => Object.values(r).some(v => String(v||'').toLowerCase().includes(q)));
      this._table.setData(rows, rows.length, 1);
      this._crud.setRows(rows);
    } catch { this._table.setData([], 0, 1); }
  }
}

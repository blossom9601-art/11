/* GovVulnAnalysisPage — 취약점 분석 (자산별 진단 결과) */
import { api }           from '../../shared/api-client.js';
import { esc }           from '../../shared/dom-utils.js';
import { DataTable }     from '../../widgets/DataTable.js';
import { SearchBar }     from '../../widgets/SearchBar.js';
import { TabCrudMixin }  from '../../shared/tab-crud-mixin.js';

const COLUMNS = [
  { key: 'code',           label: '점검코드',  sortable: true, width: '110px' },
  { key: 'category',       label: '분류',      sortable: true, width: '90px' },
  { key: 'item',           label: '점검항목',  sortable: true },
  { key: 'severity', label: '등급', sortable: true, width: '70px',
    render: (v) => {
      const m = { '긴급': '#dc2626', '높음': '#ea580c', '중간': '#f59e0b', '낮음': '#16a34a', '상': '#dc2626', '중': '#f59e0b', '하': '#16a34a' };
      const c = m[v]; return c ? `<span class="spa-badge" style="background:${c};color:#fff">${v}</span>` : v || '-';
    }
  },
  { key: 'result',         label: '결과',      sortable: true, width: '80px' },
  { key: 'action_status', label: '조치상태', sortable: true, width: '80px',
    render: (v) => {
      const m = { '미조치': '#dc2626', '조치중': '#f59e0b', '조치완료': '#16a34a', '완료': '#16a34a', '예외': '#9ca3af' };
      const c = m[v]; return c ? `<span class="spa-badge" style="background:${c};color:#fff">${v}</span>` : v || '-';
    }
  },
  { key: 'worker_name',    label: '담당자',    sortable: true, width: '100px' },
];

const FORM_FIELDS = [
  { key: 'code', label: '점검코드', type: 'text', required: true },
  { key: 'category', label: '분류', type: 'text', required: true },
  { key: 'item', label: '점검항목', type: 'text', required: true },
  { key: 'severity', label: '등급', type: 'select', options: [
    { value: '상', label: '상' }, { value: '중', label: '중' }, { value: '하', label: '하' },
  ]},
  { key: 'content', label: '점검 내용', type: 'textarea' },
  { key: 'result', label: '결과', type: 'select', options: [
    { value: '양호', label: '양호' }, { value: '취약', label: '취약' }, { value: 'N/A', label: 'N/A' },
  ]},
  { key: 'action_method', label: '조치방법', type: 'textarea' },
  { key: 'action_status', label: '조치상태', type: 'select', options: [
    { value: '미조치', label: '미조치' }, { value: '조치중', label: '조치중' }, { value: '완료', label: '완료' },
  ]},
  { key: 'worker_name', label: '담당자', type: 'text' },
];

export default class GovVulnAnalysisPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el     = null;
    this._table  = null;
    this._crud   = new TabCrudMixin({
      apiBase: '/api/hardware/server/vulnerabilities',
      formFields: FORM_FIELDS,
      entityName: '취약점 진단',
      onRefresh: () => this._fetch(),
    });
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <button class="spa-btn spa-btn--icon spa-back-btn" id="btn-back">← 취약점</button>
          <h2 class="spa-page__title">취약점 분석</h2>
          <div class="spa-page-actions">
            <button class="spa-btn spa-btn--outline" id="btn-export">CSV 내보내기</button>
          </div>
        </div>
        <div class="spa-tab-panel__header">${this._crud.renderToolbar()}</div>
        <div id="search-area"></div>
        <div id="list-table"></div>
      </div>`;
    this._searchBar = new SearchBar({
      fields: [
        { key: 'q', label: '검색어', type: 'text', placeholder: '점검코드, 항목...' },
        { key: 'severity', label: '등급', type: 'select', options: [{ value: '상', label: '상' }, { value: '중', label: '중' }, { value: '하', label: '하' }] },
      ],
      onSearch: (f) => { this._filters = f; this._fetch(); },
      onReset:  ()  => { this._filters = {}; this._fetch(); },
    });
    this._searchBar.mount(this._el.querySelector('#search-area'));

    const cols = [...COLUMNS, TabCrudMixin.actionColumn(this._crud)];
    this._table = new DataTable({ columns: cols, selectable: true, emptyText: '취약점 진단 결과가 없습니다.' });
    this._table.mount(this._el.querySelector('#list-table'));
    this._crud.bindToolbar(this._el, this._table);
    this._crud.bindRowActions(this._el);
    this._el.querySelector('#btn-export')?.addEventListener('click', () => this._table.exportCsv('취약점분석.csv'));
    this._el.querySelector('#btn-back')?.addEventListener('click', () => this._router.navigate('/governance/vulnerability'));
    await this._fetch();
  }

  unmount() { if (this._table) this._table.unmount(); }

  async _fetch() {
    this._table.loading(true);
    try {
      const res = await api.get('/api/hardware/server/vulnerabilities');
      const rows = res.items || res.rows || [];
      this._table.setData(rows, rows.length, 1);
      this._crud.setRows(rows);
    } catch { this._table.setData([], 0, 1); }
  }
}

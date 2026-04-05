/* TaskListPage — 작업 관리 (내 작업 / 참여 / 전체 / 현황) */
import { api }        from '../../shared/api-client.js';
import { esc }        from '../../shared/dom-utils.js';
import { DataTable }  from '../../widgets/DataTable.js';
import { SearchBar }  from '../../widgets/SearchBar.js';
import { Toast }      from '../../widgets/Toast.js';

const VIEWS = {
  my:            { label: '내 작업',     api: '/api/wrk/reports?scope=my' },
  participating: { label: '참여 작업',   api: '/api/wrk/reports?scope=participating' },
  all:           { label: '작업 목록',   api: '/api/wrk/reports' },
  overview:      { label: '작업 현황',   api: '/api/wrk/reports?scope=overview' },
};

const STATUS_COLORS = {
  '작성중': '#6b7280', '제출완료': '#3b82f6', '초기승인': '#f59e0b',
  '결과제출': '#8b5cf6', '최종승인': '#10b981', '반려': '#ef4444',
};

const COLUMNS = [
  { key: 'task_no',     label: '작업번호', sortable: true, width: '110px' },
  { key: 'name',        label: '작업명',   sortable: true },
  { key: 'type',        label: '유형',     sortable: true, width: '90px' },
  { key: 'category',    label: '분류',     sortable: true, width: '90px' },
  { key: 'status',      label: '상태',     sortable: true, width: '80px',
    render: (val) => {
      const c = STATUS_COLORS[val] || '#6b7280';
      return `<span class="spa-badge" style="background:${c};color:#fff">${esc(val || '-')}</span>`;
    }
  },
  { key: 'assignee',    label: '담당자',   sortable: true, width: '100px' },
  { key: 'start_date',  label: '시작일',   sortable: true, width: '100px' },
  { key: 'end_date',    label: '종료일',   sortable: true, width: '100px' },
];

const SEARCH_FIELDS = [
  { key: 'q', label: '검색어', type: 'text', placeholder: '작업명, 담당자...' },
  { key: 'status', label: '상태', type: 'select', options: [
    { value: '작성중', label: '작성중' }, { value: '제출완료', label: '제출완료' },
    { value: '초기승인', label: '초기승인' }, { value: '최종승인', label: '최종승인' },
  ]},
];

export default class TaskListPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._view   = params.view || query.scope || 'my';
    this._el     = null;
    this._table  = null;
    this._search = null;
    this._filters = {};
    this._rows   = [];
  }

  async mount(container) {
    this._el = container;
    const tabs = Object.entries(VIEWS).map(([k, v]) =>
      `<button class="spa-btn ${k === this._view ? 'spa-btn--primary' : ''}" data-view="${k}">${v.label}</button>`
    ).join('');

    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">작업 관리</h2>
          <div class="spa-page-header__actions">
            <button class="spa-btn" id="btn-export">CSV 내보내기</button>
            ${tabs}
          </div>
        </div>
        <div id="search-area"></div>
        <div id="task-table"></div>
      </div>`;

    this._search = new SearchBar({
      fields: SEARCH_FIELDS,
      onSearch: (f) => { this._filters = f; this._fetch(); },
      onReset:  ()  => { this._filters = {}; this._fetch(); },
    });
    this._search.mount(this._el.querySelector('#search-area'));

    this._table = new DataTable({ columns: COLUMNS, selectable: false, emptyText: '작업이 없습니다.' });
    this._table.mount(this._el.querySelector('#task-table'));

    this._el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-view]');
      if (btn) this._router.navigate('/work/tasks?scope=' + btn.dataset.view);
    });
    this._el.querySelector('#btn-export')?.addEventListener('click', () => this._table.exportCsv('작업목록.csv'));

    this._el.querySelector('#task-table').addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-row-id]');
      if (tr) this._router.navigate('/work/tasks/' + tr.dataset.rowId);
    });

    await this._fetch();
  }

  unmount() {
    if (this._table)  this._table.unmount();
    if (this._search) this._search.unmount();
  }

  async _fetch() {
    const v = VIEWS[this._view] || VIEWS.my;
    this._table.loading(true);
    try {
      let url = v.api;
      if (this._filters.q) url += (url.includes('?') ? '&' : '?') + 'q=' + encodeURIComponent(this._filters.q);
      if (this._filters.status) url += (url.includes('?') ? '&' : '?') + 'status=' + encodeURIComponent(this._filters.status);
      const res = await api.get(url);
      this._rows = res.items || res.rows || [];
      this._table.setData(this._rows, this._rows.length);
    } catch { this._table.setData([], 0); }
  }
}

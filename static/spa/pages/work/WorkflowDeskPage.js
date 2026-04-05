/* WorkflowDeskPage — 워크플로우 진행 / 완료 티켓 */
import { api }        from '../../shared/api-client.js';
import { esc }        from '../../shared/dom-utils.js';
import { DataTable }  from '../../widgets/DataTable.js';

const TABS = {
  progress:  { label: '진행 중', api: '/api/workflow/tickets?status=in_progress' },
  completed: { label: '완료',    api: '/api/workflow/tickets?status=completed' },
};

const COLUMNS = [
  { key: 'ticket_no',   label: '티켓번호', sortable: true, width: '120px' },
  { key: 'title',       label: '제목',     sortable: true },
  { key: 'workflow_name', label: '워크플로우', sortable: true, width: '140px' },
  { key: 'requester',   label: '요청자',   sortable: true, width: '100px' },
  { key: 'current_step', label: '현재 단계', sortable: true, width: '110px' },
  { key: 'created_at',  label: '등록일',   sortable: true, width: '100px' },
  { key: 'status',      label: '상태',     sortable: true, width: '80px' },
];

export default class WorkflowDeskPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._tab    = query.tab || 'progress';
    this._el     = null;
    this._table  = null;
  }

  async mount(container) {
    this._el = container;
    const tabs = Object.entries(TABS).map(([k, v]) =>
      `<button class="spa-btn ${k === this._tab ? 'spa-btn--primary' : ''}" data-tab="${k}">${v.label}</button>`
    ).join('');

    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">워크플로우 데스크</h2>
          <div class="spa-page-header__actions">${tabs}</div>
        </div>
        <div id="desk-table"></div>
      </div>`;

    this._table = new DataTable({ columns: COLUMNS, selectable: false, emptyText: '티켓이 없습니다.' });
    this._table.mount(this._el.querySelector('#desk-table'));

    this._el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (btn) this._router.navigate('/work/desk?tab=' + btn.dataset.tab);
    });

    await this._fetch();
  }

  unmount() { if (this._table) this._table.unmount(); }

  async _fetch() {
    const t = TABS[this._tab] || TABS.progress;
    this._table.loading(true);
    try {
      const res = await api.get(t.api);
      this._table.setData(res.items || res.rows || [], res.total || 0, 1);
    } catch { this._table.setData([], 0, 1); }
  }
}

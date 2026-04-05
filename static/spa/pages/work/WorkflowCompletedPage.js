/* WorkflowCompletedPage — 완료된 워크플로우 목록 */
import { api }        from '../../shared/api-client.js';
import { esc }        from '../../shared/dom-utils.js';
import { DataTable }  from '../../widgets/DataTable.js';

const COLUMNS = [
  { key: 'task_no',      label: '작업번호', sortable: true, width: '110px' },
  { key: 'name',         label: '작업명',   sortable: true },
  { key: 'type',         label: '유형',     sortable: true, width: '90px' },
  { key: 'assignee',     label: '담당자',   sortable: true, width: '100px' },
  { key: 'completed_at', label: '완료일',   sortable: true, width: '110px' },
  { key: 'result',       label: '결과',     sortable: true, width: '80px' },
];

export default class WorkflowCompletedPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el     = null;
    this._table  = null;
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <button class="spa-btn spa-btn--icon" id="btn-back">← 업무</button>
          <h2 class="spa-page__title">완료된 워크플로우</h2>
        </div>
        <div id="wf-table"></div>
      </div>`;
    this._table = new DataTable({ columns: COLUMNS, selectable: false, emptyText: '완료된 워크플로우가 없습니다.' });
    this._table.mount(this._el.querySelector('#wf-table'));
    this._el.querySelector('#btn-back')?.addEventListener('click', () => this._router.navigate('/work'));
    await this._fetch();
  }

  unmount() { if (this._table) this._table.unmount(); }

  async _fetch() {
    this._table.loading(true);
    try {
      const res = await api.get('/api/wrk/reports?statuses=COMPLETED');
      const rows = res.rows || res.items || [];
      this._table.setData(rows, rows.length, 1);
    } catch { this._table.setData([], 0, 1); }
  }
}

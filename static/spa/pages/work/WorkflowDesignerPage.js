/* WorkflowDesignerPage — 워크플로우 탐색 / 관리 / 에디터 */
import { api }        from '../../shared/api-client.js';
import { esc }        from '../../shared/dom-utils.js';
import { DataTable }  from '../../widgets/DataTable.js';
import { Toast }      from '../../widgets/Toast.js';
import { TabCrudMixin } from '../../shared/tab-crud-mixin.js';

const COLUMNS = [
  { key: 'name',        label: '워크플로우명', sortable: true },
  { key: 'category',    label: '분류',         sortable: true, width: '100px' },
  { key: 'version',     label: '버전',         sortable: true, width: '80px' },
  { key: 'step_count',  label: '단계수',       sortable: true, width: '80px' },
  { key: 'status',      label: '상태',         sortable: true, width: '80px' },
  { key: 'created_by',  label: '작성자',       sortable: true, width: '100px' },
  { key: 'updated_at',  label: '수정일',       sortable: true, width: '100px' },
];

const FORM_FIELDS = [
  { key: 'name', label: '워크플로우명', type: 'text', required: true },
  { key: 'category', label: '분류', type: 'select', options: [
    { value: '서비스요청', label: '서비스요청' },
    { value: '변경관리', label: '변경관리' },
    { value: '장애관리', label: '장애관리' },
    { value: '승인', label: '승인' },
  ]},
  { key: 'description', label: '설명', type: 'textarea' },
];

export default class WorkflowDesignerPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._mode   = params.mode || 'explore';
    this._el     = null;
    this._table  = null;
    this._crud   = new TabCrudMixin({
      apiBase: '/api/workflow/definitions',
      formFields: FORM_FIELDS,
      entityName: '워크플로우',
      onRefresh: () => this._fetch(),
    });
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">워크플로우 디자이너</h2>
          <div class="spa-page-header__actions">
            <button class="spa-btn ${this._mode === 'explore' ? 'spa-btn--primary' : ''}" data-m="explore">탐색</button>
            <button class="spa-btn ${this._mode === 'manage' ? 'spa-btn--primary' : ''}" data-m="manage">관리</button>
          </div>
        </div>
        <div class="spa-tab-panel__header">\${this._crud.renderToolbar()}</div>
        <div id="wf-table"></div>
      </div>`;

    const cols = [...COLUMNS, TabCrudMixin.actionColumn(this._crud)];
    this._table = new DataTable({ columns: cols, selectable: true, emptyText: '워크플로우가 없습니다.' });
    this._table.mount(this._el.querySelector('#wf-table'));

    this._crud.bindToolbar(this._el, this._table);
    this._crud.bindRowActions(this._el);

    this._el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-m]');
      if (btn) this._router.navigate('/work/designer?mode=' + btn.dataset.m);
    });

    await this._fetch();
  }

  unmount() { if (this._table) this._table.unmount(); }

  async _fetch() {
    this._table.loading(true);
    try {
      const res = await api.get('/api/workflow/definitions');
      const rows = res.items || res.rows || [];
      this._table.setData(rows, rows.length, 1);
      this._crud.setRows(rows);
    } catch { this._table.setData([], 0, 1); }
  }
}

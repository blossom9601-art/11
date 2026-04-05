/* TabCatTask — 작업이력 탭 (카테고리 공통) */
import { api }           from '../../../shared/api-client.js';
import { DataTable }     from '../../../widgets/DataTable.js';
import { TabCrudMixin }  from '../../../shared/tab-crud-mixin.js';

const COLUMNS = [
  { key: 'task_title',   label: '작업 제목',  sortable: true },
  { key: 'task_type',    label: '작업 유형',  sortable: true, width: '100px' },
  { key: 'assigned_to',  label: '담당자',     sortable: true },
  { key: 'status',       label: '상태',       sortable: true, width: '80px' },
  { key: 'due_date',     label: '기한',       sortable: true, width: '110px' },
  { key: 'completed_at', label: '완료일',     sortable: true, width: '110px' },
];

const FORM_FIELDS = [
  { key: 'task_title',  label: '작업 제목', required: true },
  { key: 'task_type',   label: '작업 유형', type: 'select', options: ['점검','변경','장애','기타'] },
  { key: 'assigned_to', label: '담당자' },
  { key: 'status',      label: '상태', type: 'select', options: ['대기','진행중','완료','취소'] },
  { key: 'due_date',    label: '기한', type: 'date' },
  { key: 'description', label: '설명', type: 'textarea' },
];

export default class TabCatTask {
  constructor({ itemId, apiBase }) {
    this._apiBase = `${apiBase}/${itemId}/tasks`;
    this._el = null; this._table = null;
    this._crud = new TabCrudMixin({ apiBase: this._apiBase, formFields: FORM_FIELDS, entityName: '작업', onRefresh: () => this._fetch() });
  }

  async mount(c) {
    this._el = c;
    this._el.innerHTML = `<div class="spa-tab-panel">${this._crud.renderToolbar()}<div id="tab-table"></div></div>`;
    this._table = new DataTable({ columns: COLUMNS, selectable: true, emptyText: '등록된 작업이 없습니다.',
      onRowClick: r => this._crud.openForm(r) });
    this._table.mount(this._el.querySelector('#tab-table'));
    this._crud.bindToolbar(this._el, this._table);
    await this._fetch();
  }

  unmount() { this._table?.unmount(); }

  async _fetch() {
    try { const res = await api.get(this._apiBase); const items = res.rows || res.items || [];
      this._table.setData(items, items.length, 1); } catch { this._table.setData([], 0, 1); }
  }
}

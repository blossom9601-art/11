/* TabCatManager — 담당자/관리자 탭 (업무그룹, 벤더, 고객 등 공통) */
import { api }           from '../../../shared/api-client.js';
import { DataTable }     from '../../../widgets/DataTable.js';
import { TabCrudMixin }  from '../../../shared/tab-crud-mixin.js';

const COLUMNS = [
  { key: 'emp_name',    label: '이름',     sortable: true },
  { key: 'emp_no',      label: '사번',     sortable: true, width: '100px' },
  { key: 'dept_name',   label: '부서',     sortable: true },
  { key: 'position',    label: '직급',     sortable: true, width: '80px' },
  { key: 'phone',       label: '연락처',   sortable: true, width: '130px' },
  { key: 'email',       label: '이메일',   sortable: true },
  { key: 'role',        label: '역할',     sortable: true, width: '100px' },
];

const FORM_FIELDS = [
  { key: 'emp_name', label: '이름', required: true },
  { key: 'emp_no',   label: '사번' },
  { key: 'dept_name', label: '부서' },
  { key: 'position', label: '직급' },
  { key: 'phone',    label: '연락처' },
  { key: 'email',    label: '이메일' },
  { key: 'role',     label: '역할',  type: 'select', options: ['담당자','부담당자','관리자','참조'] },
];

export default class TabCatManager {
  constructor({ itemId, item, apiBase, managerApiSuffix }) {
    this._apiBase = `${apiBase}/${itemId}/${managerApiSuffix || 'managers'}`;
    this._el = null; this._table = null;
    this._crud = new TabCrudMixin({ apiBase: this._apiBase, formFields: FORM_FIELDS, entityName: '담당자', onRefresh: () => this._fetch() });
  }

  async mount(c) {
    this._el = c;
    this._el.innerHTML = `<div class="spa-tab-panel">${this._crud.renderToolbar()}<div id="tab-table"></div></div>`;
    this._table = new DataTable({ columns: COLUMNS, selectable: true, emptyText: '등록된 담당자가 없습니다.',
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

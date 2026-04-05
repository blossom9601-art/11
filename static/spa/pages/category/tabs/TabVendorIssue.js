/* TabVendorIssue — 유지보수 이슈 관리 */
import { api } from '../../../shared/api-client.js';
import { DataTable } from '../../../widgets/DataTable.js';
import { TabCrudMixin } from '../../../shared/tab-crud-mixin.js';

const COLUMNS = [
  { key: 'issue_title', label: '제목', sortable: true },
  { key: 'severity', label: '심각도', sortable: true, width: '80px' },
  { key: 'reported_date', label: '보고일', sortable: true, width: '100px' },
  { key: 'resolved_date', label: '해결일', sortable: true, width: '100px' },
  { key: 'status', label: '상태', sortable: true, width: '80px' },
  { key: 'assignee', label: '담당자', sortable: true, width: '100px' },
];
const FORM_FIELDS = [
  { key: 'issue_title', label: '제목', type: 'text', required: true },
  { key: 'description', label: '설명', type: 'textarea' },
  { key: 'severity', label: '심각도', type: 'select', options: [{ value: '긴급', label: '긴급' }, { value: '높음', label: '높음' }, { value: '보통', label: '보통' }, { value: '낮음', label: '낮음' }] },
  { key: 'reported_date', label: '보고일', type: 'date' },
  { key: 'resolved_date', label: '해결일', type: 'date' },
  { key: 'status', label: '상태', type: 'select', options: [{ value: '접수', label: '접수' }, { value: '처리중', label: '처리중' }, { value: '해결', label: '해결' }, { value: '종료', label: '종료' }] },
  { key: 'assignee', label: '담당자', type: 'text' },
];

export default class TabVendorIssue {
  constructor({ assetId, apiBase }) {
    this._id  = assetId;
    this._api = `${apiBase}/${assetId}/issues`;
    this._el  = null;
    this._table = null;
    this._crud = new TabCrudMixin({ apiBase: this._api, formFields: FORM_FIELDS, entityName: '이슈', onRefresh: () => this._fetch() });
  }
  async mount(c) {
    this._el = c;
    this._el.innerHTML = `<div class="spa-tab-panel__header">${this._crud.renderToolbar()}</div><div id="tab-table"></div>`;
    const cols = [...COLUMNS, TabCrudMixin.actionColumn(this._crud)];
    this._table = new DataTable({ columns: cols, selectable: true, emptyText: '이슈이(가) 없습니다.' });
    this._table.mount(this._el.querySelector('#tab-table'));
    this._crud.bindToolbar(this._el, this._table);
    this._crud.bindRowActions(this._el);
    await this._fetch();
  }
  unmount() { if (this._table) this._table.unmount(); }
  async _fetch() {
    this._table.loading(true);
    try { const r = await api.get(this._api); const rows = r.rows || r.items || []; this._table.setData(rows, rows.length, 1); this._crud.setRows(rows); }
    catch { this._table.setData([], 0, 1); }
  }
}

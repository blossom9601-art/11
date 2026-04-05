/* TabVendorSla — 유지보수 SLA 관리 */
import { api } from '../../../shared/api-client.js';
import { DataTable } from '../../../widgets/DataTable.js';
import { TabCrudMixin } from '../../../shared/tab-crud-mixin.js';

const COLUMNS = [
  { key: 'sla_name', label: 'SLA명', sortable: true },
  { key: 'metric', label: '측정지표', sortable: true },
  { key: 'target_value', label: '목표값', sortable: true, width: '100px' },
  { key: 'actual_value', label: '실적', sortable: true, width: '100px' },
  { key: 'period_start', label: '시작일', sortable: true, width: '100px' },
  { key: 'period_end', label: '종료일', sortable: true, width: '100px' },
  { key: 'status', label: '달성', sortable: true, width: '70px' },
];
const FORM_FIELDS = [
  { key: 'sla_name', label: 'SLA명', type: 'text', required: true },
  { key: 'metric', label: '측정지표', type: 'text' },
  { key: 'target_value', label: '목표값', type: 'text' },
  { key: 'actual_value', label: '실적', type: 'text' },
  { key: 'period_start', label: '시작일', type: 'date' },
  { key: 'period_end', label: '종료일', type: 'date' },
  { key: 'status', label: '달성여부', type: 'select', options: [{ value: '달성', label: '달성' }, { value: '미달성', label: '미달성' }, { value: '진행중', label: '진행중' }] },
];

export default class TabVendorSla {
  constructor({ assetId, apiBase }) {
    this._id  = assetId;
    this._api = `${apiBase}/${assetId}/sla`;
    this._el  = null;
    this._table = null;
    this._crud = new TabCrudMixin({ apiBase: this._api, formFields: FORM_FIELDS, entityName: 'SLA', onRefresh: () => this._fetch() });
  }
  async mount(c) {
    this._el = c;
    this._el.innerHTML = `<div class="spa-tab-panel__header">${this._crud.renderToolbar()}</div><div id="tab-table"></div>`;
    const cols = [...COLUMNS, TabCrudMixin.actionColumn(this._crud)];
    this._table = new DataTable({ columns: cols, selectable: true, emptyText: 'SLA이(가) 없습니다.' });
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

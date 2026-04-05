/* TabCatSystem — 시스템 연계 탭 (업무그룹 -> 연계 시스템) */
import { api }           from '../../../shared/api-client.js';
import { DataTable }     from '../../../widgets/DataTable.js';
import { TabCrudMixin }  from '../../../shared/tab-crud-mixin.js';

const COLUMNS = [
  { key: 'system_name', label: '시스템 이름', sortable: true },
  { key: 'system_ip',   label: '시스템 IP',   sortable: true, width: '130px' },
  { key: 'work_name',   label: '업무명',      sortable: true },
  { key: 'work_status', label: '운영 상태',   sortable: true, width: '90px' },
  { key: 'center_name', label: '센터',        sortable: true },
];

const FORM_FIELDS = [
  { key: 'system_name', label: '시스템 이름', required: true },
  { key: 'system_ip',   label: '시스템 IP' },
  { key: 'work_name',   label: '업무명' },
  { key: 'remark',      label: '비고', type: 'textarea' },
];

export default class TabCatSystem {
  constructor({ itemId, apiBase }) {
    this._apiBase = `${apiBase}/${itemId}/systems`;
    this._el = null; this._table = null;
    this._crud = new TabCrudMixin({ apiBase: this._apiBase, formFields: FORM_FIELDS, entityName: '시스템', onRefresh: () => this._fetch() });
  }

  async mount(c) {
    this._el = c;
    this._el.innerHTML = `<div class="spa-tab-panel">${this._crud.renderToolbar()}<div id="tab-table"></div></div>`;
    this._table = new DataTable({ columns: COLUMNS, selectable: true, emptyText: '연계된 시스템이 없습니다.',
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

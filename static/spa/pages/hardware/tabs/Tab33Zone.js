/* Tab33 — SAN Zone 정보 */
import { api }           from '../../../shared/api-client.js';
import { esc }           from '../../../shared/dom-utils.js';
import { DataTable }     from '../../../widgets/DataTable.js';
import { TabCrudMixin }  from '../../../shared/tab-crud-mixin.js';

const COLUMNS = [
  { key: 'zone_name',   label: 'Zone 이름',  sortable: true },
  { key: 'zone_type',   label: 'Zone 유형',  sortable: true, width: '100px' },
  { key: 'wwn',         label: 'WWN',        sortable: true },
  { key: 'member_host', label: '멤버 호스트', sortable: true },
  { key: 'vsan_id',     label: 'VSAN ID',    sortable: true, width: '80px' },
  { key: 'status',      label: '상태',       sortable: true, width: '80px' },
  { key: 'remark',      label: '비고',       sortable: true },
];

const FORM_FIELDS = [
  { key: 'zone_name',   label: 'Zone 이름',  required: true },
  { key: 'zone_type',   label: 'Zone 유형',  type: 'select', options: ['Standard','Smart','Peer'] },
  { key: 'wwn',         label: 'WWN',        required: true },
  { key: 'member_host', label: '멤버 호스트' },
  { key: 'vsan_id',     label: 'VSAN ID',    type: 'number' },
  { key: 'status',      label: '상태',       type: 'select', options: ['Active','Inactive'] },
  { key: 'remark',      label: '비고',       type: 'textarea' },
];

export default class Tab33Zone {
  constructor({ assetId, assetType, asset, apiBase }) {
    this._assetId = assetId;
    this._apiBase = `${apiBase}/${assetId}/zones`;
    this._el = null; this._table = null;
    this._crud = new TabCrudMixin({ apiBase: this._apiBase, formFields: FORM_FIELDS, entityName: 'SAN Zone', onRefresh: () => this._fetch() });
  }

  async mount(c) {
    this._el = c;
    this._el.innerHTML = `<div class="spa-tab-panel">${this._crud.renderToolbar()}<div id="tab-table"></div></div>`;
    this._table = new DataTable({ columns: COLUMNS, selectable: true, emptyText: '등록된 Zone이 없습니다.',
      onRowClick: r => this._crud.openForm(r) });
    this._table.mount(this._el.querySelector('#tab-table'));
    this._crud.bindToolbar(this._el, this._table);
    await this._fetch();
  }

  unmount() { this._table?.unmount(); }

  async _fetch() {
    try { const res = await api.get(this._apiBase); const items = res.rows || res.items || [];
      this._table.setData(items, items.length, 1);
    } catch { this._table.setData([], 0, 1); }
  }
}

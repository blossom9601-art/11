/* Tab32 — 스토리지 할당 (LUN 매핑, 호스트 할당) */
import { api }           from '../../../shared/api-client.js';
import { esc }           from '../../../shared/dom-utils.js';
import { DataTable }     from '../../../widgets/DataTable.js';
import { TabCrudMixin }  from '../../../shared/tab-crud-mixin.js';

const COLUMNS = [
  { key: 'lun_id',      label: 'LUN ID',     sortable: true, width: '80px' },
  { key: 'host_name',   label: '호스트명',    sortable: true },
  { key: 'host_ip',     label: '호스트 IP',   sortable: true, width: '130px' },
  { key: 'capacity_gb', label: '용량 (GB)',   sortable: true, width: '100px' },
  { key: 'pool_name',   label: '풀 이름',     sortable: true },
  { key: 'status',      label: '상태',        sortable: true, width: '80px' },
  { key: 'remark',      label: '비고',        sortable: true },
];

const FORM_FIELDS = [
  { key: 'lun_id',      label: 'LUN ID',   required: true },
  { key: 'host_name',   label: '호스트명',  required: true },
  { key: 'host_ip',     label: '호스트 IP' },
  { key: 'capacity_gb', label: '용량 (GB)', type: 'number' },
  { key: 'pool_name',   label: '풀 이름' },
  { key: 'status',      label: '상태',      type: 'select', options: ['사용중','미사용','예약'] },
  { key: 'remark',      label: '비고',      type: 'textarea' },
];

export default class Tab32AssignStorage {
  constructor({ assetId, assetType, asset, apiBase }) {
    this._assetId = assetId; this._apiBase = `${apiBase}/${assetId}/assignments`;
    this._el = null; this._table = null; this._rows = [];
    this._crud = new TabCrudMixin({ apiBase: this._apiBase, formFields: FORM_FIELDS, entityName: '스토리지 할당', onRefresh: () => this._fetch() });
  }

  async mount(c) {
    this._el = c;
    this._el.innerHTML = `<div class="spa-tab-panel">${this._crud.renderToolbar()}<div id="tab-table"></div></div>`;
    this._table = new DataTable({ columns: COLUMNS, selectable: true, emptyText: '할당된 스토리지가 없습니다.',
      onRowClick: r => this._crud.openForm(r) });
    this._table.mount(this._el.querySelector('#tab-table'));
    this._crud.bindToolbar(this._el, this._table);
    await this._fetch();
  }

  unmount() { this._table?.unmount(); }

  async _fetch() {
    try { const res = await api.get(this._apiBase); this._rows = res.rows || res.items || [];
      this._table.setData(this._rows, this._rows.length, 1);
    } catch { this._table.setData([], 0, 1); }
  }
}

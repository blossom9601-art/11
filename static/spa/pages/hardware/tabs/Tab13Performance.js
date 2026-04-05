/* Tab13Performance — 성능 정보 */

import { api }        from '../../../shared/api-client.js';
import { esc }        from '../../../shared/dom-utils.js';
import { DataTable }  from '../../../widgets/DataTable.js';
import { Toast }      from '../../../widgets/Toast.js';
import { TabCrudMixin } from '../../../shared/tab-crud-mixin.js';
import { addExportButton } from '../../../shared/excel-export.js';

const COLUMNS = [
  { key: 'model', label: '지표명', sortable: true },
  { key: 'manufacturer', label: '측정값', sortable: true },
  { key: 'status', label: '등급', sortable: true, width: '80px' },
  { key: 'remark', label: '비고' },
];

export default class Tab13Performance {
  constructor({ assetId, assetType, asset }) {
    this._assetId   = assetId;
    this._assetType = assetType || 'server';
    this._asset     = asset;
    this._apiBase  = `/api/hardware/assets/{assetId}/components?type=performance`.replace('{assetId}', assetId);
    this._apiPost  = `/api/hardware/assets/{assetId}/components`.replace('{assetId}', assetId);
    this._el       = null;
    this._table    = null;
    this._rows     = [];
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `<div class="spa-tab-panel"><div id="tab-table"></div></div>`;
    const cols = COLUMNS;
    this._table = new DataTable({
      columns: cols,
      emptyText: '등록된 성능 지표이(가) 없습니다.',
    });
    this._table.mount(this._el.querySelector('#tab-table'));
    await this._fetch();
  }

  unmount() { if (this._table) this._table.unmount(); }

  async _fetch() {
    this._table.loading(true);
    try {
      const res = await api.get(this._apiBase);
      this._rows = res.rows || res.items || [];
      this._table.setData(this._rows, this._rows.length, 1);
    } catch { this._table.setData([], 0, 1); }
  }
}
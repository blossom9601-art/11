/* Tab08Maintenance — 기동절차 / 유지보수 */

import { api }        from '../../../shared/api-client.js';
import { esc }        from '../../../shared/dom-utils.js';
import { DataTable }  from '../../../widgets/DataTable.js';
import { Toast }      from '../../../widgets/Toast.js';
import { TabCrudMixin } from '../../../shared/tab-crud-mixin.js';
import { addExportButton } from '../../../shared/excel-export.js';

const COLUMNS = [
  { key: 'contract_name', label: '계약명', sortable: true },
  { key: 'vendor_name', label: '공급업체', sortable: true },
  { key: 'start_date', label: '시작일', sortable: true, width: '110px' },
  { key: 'end_date', label: '종료일', sortable: true, width: '110px' },
  { key: 'status', label: '상태', sortable: true, width: '80px' },
];

export default class Tab08Maintenance {
  constructor({ assetId, assetType, asset }) {
    this._assetId   = assetId;
    this._assetType = assetType || 'server';
    this._asset     = asset;
    this._apiBase  = `/api/hardware/assets/{assetId}/tab61-maintenance`.replace('{assetId}', assetId);
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
      emptyText: '등록된 유지보수이(가) 없습니다.',
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
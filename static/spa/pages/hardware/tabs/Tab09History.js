/* Tab09Firewall — 방화벽 정책 */

import { api }        from '../../../shared/api-client.js';
import { esc }        from '../../../shared/dom-utils.js';
import { DataTable }  from '../../../widgets/DataTable.js';
import { Toast }      from '../../../widgets/Toast.js';
import { TabCrudMixin } from '../../../shared/tab-crud-mixin.js';
import { addExportButton } from '../../../shared/excel-export.js';

const COLUMNS = [
  { key: 'source', label: '출발지', sortable: true },
  { key: 'destination', label: '목적지', sortable: true },
  { key: 'port', label: '포트', sortable: true, width: '100px' },
  { key: 'protocol', label: '프로토콜', sortable: true, width: '90px' },
  { key: 'action', label: '허용/차단', sortable: true, width: '90px' },
  { key: 'remark', label: '비고' },
  // 액션 컬럼은 mount 에서 동적 추가
];

const FORM_FIELDS = [
  { key: 'source', label: '출발지', type: 'text', required: true },
  { key: 'destination', label: '목적지', type: 'text', required: true },
  { key: 'port', label: '포트', type: 'text', required: true },
  { key: 'protocol', label: '프로토콜', type: 'select', options: [{ value: 'TCP', label: 'TCP' }, { value: 'UDP', label: 'UDP' }, { value: 'ICMP', label: 'ICMP' }, { value: 'ANY', label: 'ANY' }] },
  { key: 'action', label: '허용/차단', type: 'select', required: true, options: [{ value: 'ALLOW', label: 'ALLOW' }, { value: 'DENY', label: 'DENY' }] },
  { key: 'remark', label: '비고', type: 'textarea' },
];

export default class Tab09Firewall {
  constructor({ assetId, assetType, asset }) {
    this._assetId   = assetId;
    this._assetType = assetType || 'server';
    this._asset     = asset;
    this._apiBase  = `/api/hardware/assets/{assetId}/components?type=firewall_rule`.replace('{assetId}', assetId);
    this._apiPost  = `/api/hardware/assets/{assetId}/components`.replace('{assetId}', assetId);
    this._el       = null;
    this._table    = null;
    this._rows     = [];
    this._crud     = new TabCrudMixin({
      apiBase: this._apiPost || this._apiBase,
      formFields: FORM_FIELDS,
      entityName: '방화벽 규칙',
      onRefresh: () => this._fetch(),
    });
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `<div class="spa-tab-panel">
      <div class="spa-tab-panel__header">${this._crud.renderToolbar()}</div>
      <div id="tab-table"></div></div>`;
    const cols = [...COLUMNS, TabCrudMixin.actionColumn(this._crud)];
    this._table = new DataTable({
      columns: cols,
      selectable: true,
      emptyText: '등록된 방화벽 규칙이(가) 없습니다.',
    });
    this._table.mount(this._el.querySelector('#tab-table'));
    this._crud.bindToolbar(this._el, this._table);
    this._crud.bindRowActions(this._el);
    await this._fetch();
  }

  unmount() { if (this._table) this._table.unmount(); }

  async _fetch() {
    this._table.loading(true);
    try {
      const res = await api.get(this._apiBase);
      this._rows = res.rows || res.items || [];
      this._table.setData(this._rows, this._rows.length, 1);
      this._crud.setRows(this._rows);
    } catch { this._table.setData([], 0, 1); }
  }
}
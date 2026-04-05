/* Tab12Virtualization — 가상화 / 취약점 */

import { api }        from '../../../shared/api-client.js';
import { esc }        from '../../../shared/dom-utils.js';
import { DataTable }  from '../../../widgets/DataTable.js';
import { Toast }      from '../../../widgets/Toast.js';
import { TabCrudMixin } from '../../../shared/tab-crud-mixin.js';
import { addExportButton } from '../../../shared/excel-export.js';

const COLUMNS = [
  { key: 'model', label: 'VM/컨테이너명', sortable: true },
  { key: 'manufacturer', label: '플랫폼', sortable: true },
  { key: 'count', label: 'vCPU', sortable: true, width: '70px' },
  { key: 'serial_no', label: '메모리', sortable: true, width: '80px' },
  { key: 'status', label: '상태', sortable: true, width: '80px' },
  { key: 'remark', label: '비고' },
  // 액션 컬럼은 mount 에서 동적 추가
];

const FORM_FIELDS = [
  { key: 'model', label: 'VM/컨테이너명', type: 'text', required: true },
  { key: 'manufacturer', label: '플랫폼', type: 'text' },
  { key: 'count', label: 'vCPU', type: 'number' },
  { key: 'serial_no', label: '메모리(GB)', type: 'text' },
  { key: 'status', label: '상태', type: 'select', options: [{ value: 'Running', label: 'Running' }, { value: 'Stopped', label: 'Stopped' }, { value: 'Suspended', label: 'Suspended' }] },
  { key: 'remark', label: '비고', type: 'textarea' },
];

export default class Tab12Virtualization {
  constructor({ assetId, assetType, asset }) {
    this._assetId   = assetId;
    this._assetType = assetType || 'server';
    this._asset     = asset;
    this._apiBase  = `/api/hardware/assets/{assetId}/components?type=virtualization`.replace('{assetId}', assetId);
    this._apiPost  = `/api/hardware/assets/{assetId}/components`.replace('{assetId}', assetId);
    this._el       = null;
    this._table    = null;
    this._rows     = [];
    this._crud     = new TabCrudMixin({
      apiBase: this._apiPost || this._apiBase,
      formFields: FORM_FIELDS,
      entityName: '가상화 항목',
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
      emptyText: '등록된 가상화 항목이(가) 없습니다.',
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
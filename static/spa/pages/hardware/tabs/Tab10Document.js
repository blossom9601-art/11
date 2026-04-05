/* Tab10Document — 문서 관리 */

import { api }        from '../../../shared/api-client.js';
import { esc }        from '../../../shared/dom-utils.js';
import { DataTable }  from '../../../widgets/DataTable.js';
import { Toast }      from '../../../widgets/Toast.js';
import { TabCrudMixin } from '../../../shared/tab-crud-mixin.js';
import { addExportButton } from '../../../shared/excel-export.js';

import { FileUpload } from '../../../widgets/FileUpload.js';

const COLUMNS = [
  { key: 'file_name', label: '파일명', sortable: true },
  { key: 'file_size', label: '크기', sortable: true, width: '90px' },
  { key: 'description', label: '설명', sortable: true },
  { key: 'created_at', label: '등록일', sortable: true, width: '110px' },
  // 액션 컬럼은 mount 에서 동적 추가
];

const FORM_FIELDS = [
  { key: 'description', label: '설명', type: 'text' },
];

export default class Tab10Document {
  constructor({ assetId, assetType, asset }) {
    this._assetId   = assetId;
    this._assetType = assetType || 'server';
    this._asset     = asset;
    this._apiBase  = `/api/uploads?owner_key=hw_asset:{assetId}`.replace('{assetId}', assetId);
    this._apiPost  = `/api/uploads`.replace('{assetId}', assetId);
    this._el       = null;
    this._table    = null;
    this._rows     = [];
    this._crud     = new TabCrudMixin({
      apiBase: this._apiPost || this._apiBase,
      formFields: FORM_FIELDS,
      entityName: '문서',
      onRefresh: () => this._fetch(),
    });
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `<div class="spa-tab-panel">
      <div class="spa-tab-panel__header">
        ${this._crud.renderToolbar()}
        <div id="file-upload-area" style="display:inline-block;margin-left:.5rem"></div>
      </div>
      <div id="tab-table"></div></div>`;
    const cols = [...COLUMNS, TabCrudMixin.actionColumn(this._crud)];
    this._table = new DataTable({
      columns: cols,
      selectable: true,
      emptyText: '등록된 문서이(가) 없습니다.',
    });
    this._table.mount(this._el.querySelector('#tab-table'));
    this._crud.bindToolbar(this._el, this._table);
    this._crud.bindRowActions(this._el);
    this._fileUpload = new FileUpload({
      apiUrl: '/api/uploads',
      ownerKey: `hw_asset:${this._assetId}`,
      onUploaded: () => this._fetch(),
    });
    this._fileUpload.mount(this._el.querySelector('#file-upload-area'));
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
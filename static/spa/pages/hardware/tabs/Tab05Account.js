/* Tab05Authority — 권한 관리 */

import { api }        from '../../../shared/api-client.js';
import { esc }        from '../../../shared/dom-utils.js';
import { DataTable }  from '../../../widgets/DataTable.js';
import { Toast }      from '../../../widgets/Toast.js';
import { TabCrudMixin } from '../../../shared/tab-crud-mixin.js';
import { addExportButton } from '../../../shared/excel-export.js';


const SCOPE_MAP = {
  server: 'onpremise', cloud: 'cloud',
  frame: 'onpremise', workstation: 'workstation',
};

const COLUMNS = [
  { key: 'authority_name', label: '권한명', sortable: true },
  { key: 'authority_type', label: '권한유형', sortable: true, width: '110px' },
  { key: 'access_level', label: '접근수준', sortable: true, width: '100px' },
  { key: 'remark', label: '비고' },
  // 액션 컬럼은 mount 에서 동적 추가
];

const FORM_FIELDS = [
  { key: 'authority_name', label: '권한명', type: 'text', required: true },
  { key: 'authority_type', label: '권한유형', type: 'select', options: [{ value: '관리자', label: '관리자' }, { value: '사용자', label: '사용자' }, { value: '운영자', label: '운영자' }, { value: '읽기전용', label: '읽기전용' }] },
  { key: 'access_level', label: '접근수준', type: 'select', options: [{ value: '전체', label: '전체' }, { value: '제한', label: '제한' }, { value: '읽기', label: '읽기' }] },
  { key: 'remark', label: '비고', type: 'textarea' },
];

export default class Tab05Authority {
  constructor({ assetId, assetType, asset }) {
    this._assetId   = assetId;
    this._assetType = assetType || 'server';
    this._asset     = asset;
    this._scope     = SCOPE_MAP[this._assetType] || 'onpremise';
    this._apiBase  = `/api/hardware/{scope}/assets/{assetId}/authorities`.replace('{scope}', this._scope).replace('{assetId}', assetId);
    this._el       = null;
    this._table    = null;
    this._rows     = [];
    this._crud     = new TabCrudMixin({
      apiBase: this._apiPost || this._apiBase,
      formFields: FORM_FIELDS,
      entityName: '권한',
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
      emptyText: '등록된 권한이(가) 없습니다.',
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
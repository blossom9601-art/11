/* Tab07Package — 패키지 관리 */

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
  { key: 'package_name', label: '패키지명', sortable: true },
  { key: 'version', label: '버전', sortable: true, width: '100px' },
  { key: 'package_type', label: '유형', sortable: true, width: '90px' },
  { key: 'manufacturer', label: '제조사', sortable: true },
  { key: 'license', label: '라이선스', sortable: true, width: '100px' },
  { key: 'vulnerability', label: '취약점', sortable: true, width: '70px' },
  // 액션 컬럼은 mount 에서 동적 추가
];

const FORM_FIELDS = [
  { key: 'package_name', label: '패키지명', type: 'text', required: true },
  { key: 'version', label: '버전', type: 'text' },
  { key: 'package_type', label: '유형', type: 'select', options: [{ value: 'OS', label: 'OS' }, { value: '미들웨어', label: '미들웨어' }, { value: '라이브러리', label: '라이브러리' }, { value: '유틸리티', label: '유틸리티' }, { value: '기타', label: '기타' }] },
  { key: 'manufacturer', label: '제조사', type: 'text' },
  { key: 'license', label: '라이선스', type: 'text' },
  { key: 'identifier', label: '식별자', type: 'text' },
];

export default class Tab07Package {
  constructor({ assetId, assetType, asset }) {
    this._assetId   = assetId;
    this._assetType = assetType || 'server';
    this._asset     = asset;
    this._scope     = SCOPE_MAP[this._assetType] || 'onpremise';
    this._apiBase  = `/api/hardware/{scope}/assets/{assetId}/packages`.replace('{scope}', this._scope).replace('{assetId}', assetId);
    this._el       = null;
    this._table    = null;
    this._rows     = [];
    this._crud     = new TabCrudMixin({
      apiBase: this._apiPost || this._apiBase,
      formFields: FORM_FIELDS,
      entityName: '패키지',
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
      emptyText: '등록된 패키지이(가) 없습니다.',
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
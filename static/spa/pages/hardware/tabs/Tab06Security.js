/* Tab06Account — 계정 관리 */

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
  { key: 'account_name', label: '계정명', sortable: true },
  { key: 'uid', label: 'UID', sortable: true, width: '80px' },
  { key: 'group_name', label: '그룹', sortable: true },
  { key: 'gid', label: 'GID', sortable: true, width: '80px' },
  { key: 'admin', label: '관리자', sortable: true, width: '70px' },
  { key: 'login_allowed', label: '로그인', sortable: true, width: '70px' },
  { key: 'su_allowed', label: 'SU', sortable: true, width: '60px' },
  { key: 'status', label: '상태', sortable: true, width: '80px' },
  { key: 'remark', label: '비고' },
  // 액션 컬럼은 mount 에서 동적 추가
];

const FORM_FIELDS = [
  { key: 'account_name', label: '계정명', type: 'text', required: true },
  { key: 'uid', label: 'UID', type: 'text' },
  { key: 'group_name', label: '그룹명', type: 'text' },
  { key: 'gid', label: 'GID', type: 'text' },
  { key: 'admin', label: '관리자여부', type: 'select', options: [{ value: 'Y', label: 'Y' }, { value: 'N', label: 'N' }] },
  { key: 'login_allowed', label: '로그인허용', type: 'select', options: [{ value: 'Y', label: 'Y' }, { value: 'N', label: 'N' }] },
  { key: 'su_allowed', label: 'SU허용', type: 'select', options: [{ value: 'Y', label: 'Y' }, { value: 'N', label: 'N' }] },
  { key: 'status', label: '상태', type: 'select', options: [{ value: '활성', label: '활성' }, { value: '비활성', label: '비활성' }, { value: '잠김', label: '잠김' }] },
  { key: 'remark', label: '비고', type: 'textarea' },
];

export default class Tab06Account {
  constructor({ assetId, assetType, asset }) {
    this._assetId   = assetId;
    this._assetType = assetType || 'server';
    this._asset     = asset;
    this._scope     = SCOPE_MAP[this._assetType] || 'onpremise';
    this._apiBase  = `/api/hardware/{scope}/assets/{assetId}/accounts`.replace('{scope}', this._scope).replace('{assetId}', assetId);
    this._el       = null;
    this._table    = null;
    this._rows     = [];
    this._crud     = new TabCrudMixin({
      apiBase: this._apiPost || this._apiBase,
      formFields: FORM_FIELDS,
      entityName: '계정',
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
      emptyText: '등록된 계정이(가) 없습니다.',
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
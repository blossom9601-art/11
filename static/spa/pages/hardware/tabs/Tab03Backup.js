/* Tab03Software — 설치 소프트웨어 */

import { api }        from '../../../shared/api-client.js';
import { esc }        from '../../../shared/dom-utils.js';
import { DataTable }  from '../../../widgets/DataTable.js';
import { Toast }      from '../../../widgets/Toast.js';
import { TabCrudMixin } from '../../../shared/tab-crud-mixin.js';
import { addExportButton } from '../../../shared/excel-export.js';

const COLUMNS = [
  { key: 'software_name', label: '소프트웨어명', sortable: true },
  { key: 'version', label: '버전', sortable: true, width: '100px' },
  { key: 'publisher', label: '제조사', sortable: true },
  { key: 'license_type', label: '라이선스', sortable: true, width: '100px' },
  { key: 'install_date', label: '설치일', sortable: true, width: '110px' },
  { key: 'status', label: '상태', sortable: true, width: '80px' },
  { key: 'remark', label: '비고' },
  // 액션 컬럼은 mount 에서 동적 추가
];

const FORM_FIELDS = [
  { key: 'software_name', label: '소프트웨어명', type: 'text', required: true },
  { key: 'version', label: '버전', type: 'text' },
  { key: 'publisher', label: '제조사', type: 'text' },
  { key: 'license_type', label: '라이선스유형', type: 'select', options: [{ value: '상용', label: '상용' }, { value: '오픈소스', label: '오픈소스' }, { value: '프리웨어', label: '프리웨어' }, { value: '구독형', label: '구독형' }, { value: '기타', label: '기타' }] },
  { key: 'license_key', label: '라이선스키', type: 'text' },
  { key: 'install_date', label: '설치일', type: 'date' },
  { key: 'status', label: '상태', type: 'select', options: [{ value: '사용중', label: '사용중' }, { value: '미사용', label: '미사용' }, { value: '예정', label: '예정' }] },
  { key: 'remark', label: '비고', type: 'text' },
];

export default class Tab03Software {
  constructor({ assetId, assetType, asset }) {
    this._assetId   = assetId;
    this._assetType = assetType || 'server';
    this._asset     = asset;
    this._apiBase  = `/api/hardware/assets/{assetId}/software`.replace('{assetId}', assetId);
    this._el       = null;
    this._table    = null;
    this._rows     = [];
    this._crud     = new TabCrudMixin({
      apiBase: this._apiPost || this._apiBase,
      formFields: FORM_FIELDS,
      entityName: '소프트웨어',
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
      emptyText: '등록된 소프트웨어이(가) 없습니다.',
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
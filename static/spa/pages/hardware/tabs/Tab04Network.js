/* Tab04Backup — 백업 정책 */

import { api }        from '../../../shared/api-client.js';
import { esc }        from '../../../shared/dom-utils.js';
import { DataTable }  from '../../../widgets/DataTable.js';
import { Toast }      from '../../../widgets/Toast.js';
import { TabCrudMixin } from '../../../shared/tab-crud-mixin.js';
import { addExportButton } from '../../../shared/excel-export.js';

const COLUMNS = [
  { key: 'policy_name', label: '정책명', sortable: true },
  { key: 'backup_directory', label: '백업경로', sortable: true },
  { key: 'start_time', label: '시작시간', sortable: true, width: '90px' },
  { key: 'grade', label: '등급', sortable: true, width: '70px' },
  { key: 'retention', label: '보존기간', sortable: true, width: '90px' },
  { key: 'schedule', label: '스케줄', sortable: true },
  { key: 'media', label: '미디어', sortable: true, width: '90px' },
  // 액션 컬럼은 mount 에서 동적 추가
];

const FORM_FIELDS = [
  { key: 'policy_name', label: '정책명', type: 'text', required: true },
  { key: 'asset_category', label: '자산유형', type: 'text', required: true },
  { key: 'backup_directory', label: '백업경로', type: 'text', required: true },
  { key: 'start_time', label: '시작시간', type: 'text', required: true },
  { key: 'grade', label: '등급', type: 'select', options: [{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }, { value: 'C', label: 'C' }, { value: 'D', label: 'D' }] },
  { key: 'retention', label: '보존기간', type: 'text' },
  { key: 'schedule', label: '스케줄', type: 'text' },
  { key: 'media', label: '미디어', type: 'text' },
  { key: 'library', label: '라이브러리', type: 'text' },
  { key: 'offsite_yn', label: '원격여부', type: 'select', options: [{ value: 'Y', label: 'Y' }, { value: 'N', label: 'N' }] },
];

export default class Tab04Backup {
  constructor({ assetId, assetType, asset }) {
    this._assetId   = assetId;
    this._assetType = assetType || 'server';
    this._asset     = asset;
    this._apiBase  = `/api/hardware/server/backup-policies?asset_id={assetId}`.replace('{assetId}', assetId);
    this._apiPost  = `/api/hardware/server/backup-policies`.replace('{assetId}', assetId);
    this._el       = null;
    this._table    = null;
    this._rows     = [];
    this._crud     = new TabCrudMixin({
      apiBase: this._apiPost || this._apiBase,
      formFields: FORM_FIELDS,
      entityName: '백업 정책',
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
      emptyText: '등록된 백업 정책이(가) 없습니다.',
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
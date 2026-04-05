/* TabCatHardware — 하드웨어 자산 연계 탭 (벤더 → 납품 HW) */
import { api }        from '../../../shared/api-client.js';
import { DataTable }  from '../../../widgets/DataTable.js';

const COLUMNS = [
  { key: 'system_name',  label: '시스템 이름', sortable: true },
  { key: 'system_ip',    label: '시스템 IP',   sortable: true, width: '130px' },
  { key: 'work_name',    label: '업무명',      sortable: true },
  { key: 'model_name',   label: '모델명',      sortable: true },
  { key: 'serial_number',label: '일련번호',     sortable: true },
  { key: 'work_status',  label: '상태',        sortable: true, width: '80px' },
];

export default class TabCatHardware {
  constructor({ itemId, apiBase }) { this._apiBase = `${apiBase}/${itemId}/hw-assets`; this._el = null; this._table = null; }

  async mount(c) {
    this._el = c;
    this._el.innerHTML = '<div class="spa-tab-panel"><div id="tab-table"></div></div>';
    this._table = new DataTable({ columns: COLUMNS, emptyText: '연계된 HW 자산이 없습니다.' });
    this._table.mount(this._el.querySelector('#tab-table'));
    await this._fetch();
  }

  unmount() { this._table?.unmount(); }

  async _fetch() {
    try { const res = await api.get(this._apiBase); const items = res.rows || res.items || [];
      this._table.setData(items, items.length, 1); } catch { this._table.setData([], 0, 1); }
  }
}

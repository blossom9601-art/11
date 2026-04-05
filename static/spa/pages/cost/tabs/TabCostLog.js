/* TabCostLog — 비용 변경 이력 */
import { api }        from '../../../shared/api-client.js';
import { DataTable }  from '../../../widgets/DataTable.js';

const COLUMNS = [
  { key: 'changed_field', label: '변경항목', sortable: true },
  { key: 'old_value',     label: '이전값',  sortable: true },
  { key: 'new_value',     label: '변경값',  sortable: true },
  { key: 'changed_by',    label: '변경자',  sortable: true },
  { key: 'changed_at',    label: '변경일시', sortable: true, width: '150px' },
];

export default class TabCostLog {
  constructor({ itemId, apiBase }) { this._apiBase = `${apiBase}/${itemId}/logs`; this._el = null; this._table = null; }

  async mount(c) {
    this._el = c;
    this._el.innerHTML = '<div class="spa-tab-panel"><div id="tab-table"></div></div>';
    this._table = new DataTable({ columns: COLUMNS, emptyText: '변경 이력이 없습니다.' });
    this._table.mount(this._el.querySelector('#tab-table'));
    await this._fetch();
  }

  unmount() { this._table?.unmount(); }

  async _fetch() {
    try { const res = await api.get(this._apiBase); const items = res.rows || res.items || [];
      this._table.setData(items, items.length, 1); } catch { this._table.setData([], 0, 1); }
  }
}

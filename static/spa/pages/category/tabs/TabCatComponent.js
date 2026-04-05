/* TabCatComponent — 컴포넌트 연계 탭 (벤더 → 공급 부품) */
import { api }        from '../../../shared/api-client.js';
import { DataTable }  from '../../../widgets/DataTable.js';

const COLUMNS = [
  { key: 'component_name', label: '부품명',    sortable: true },
  { key: 'component_type', label: '유형',      sortable: true, width: '100px' },
  { key: 'model',          label: '모델',      sortable: true },
  { key: 'quantity',       label: '수량',      sortable: true, width: '80px' },
  { key: 'status',         label: '상태',      sortable: true, width: '80px' },
];

export default class TabCatComponent {
  constructor({ itemId, apiBase }) { this._apiBase = `${apiBase}/${itemId}/comp-assets`; this._el = null; this._table = null; }

  async mount(c) {
    this._el = c;
    this._el.innerHTML = '<div class="spa-tab-panel"><div id="tab-table"></div></div>';
    this._table = new DataTable({ columns: COLUMNS, emptyText: '연계된 부품이 없습니다.' });
    this._table.mount(this._el.querySelector('#tab-table'));
    await this._fetch();
  }

  unmount() { this._table?.unmount(); }

  async _fetch() {
    try { const res = await api.get(this._apiBase); const items = res.rows || res.items || [];
      this._table.setData(items, items.length, 1); } catch { this._table.setData([], 0, 1); }
  }
}

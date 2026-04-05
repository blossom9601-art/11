/* TabCostContract — 계약 내역 (항목별 금액) */
import { api }           from '../../../shared/api-client.js';
import { DataTable }     from '../../../widgets/DataTable.js';
import { TabCrudMixin }  from '../../../shared/tab-crud-mixin.js';

const COLUMNS = [
  { key: 'item_name',    label: '항목명',    sortable: true },
  { key: 'item_type',    label: '유형',      sortable: true, width: '100px' },
  { key: 'quantity',     label: '수량',      sortable: true, width: '80px' },
  { key: 'unit_price',   label: '단가',      sortable: true, width: '120px', render: v => v != null ? Number(v).toLocaleString() + ' 원' : '-' },
  { key: 'amount',       label: '금액',      sortable: true, width: '120px', render: v => v != null ? Number(v).toLocaleString() + ' 원' : '-' },
  { key: 'period',       label: '기간',      sortable: true },
  { key: 'remark',       label: '비고',      sortable: true },
];

const FORM_FIELDS = [
  { key: 'item_name', label: '항목명', required: true },
  { key: 'item_type', label: '유형', type: 'select', options: ['하드웨어','소프트웨어','서비스','기타'] },
  { key: 'quantity',   label: '수량', type: 'number' },
  { key: 'unit_price', label: '단가', type: 'number' },
  { key: 'amount',     label: '금액', type: 'number' },
  { key: 'period',     label: '기간' },
  { key: 'remark',     label: '비고', type: 'textarea' },
];

export default class TabCostContract {
  constructor({ itemId, item, apiBase }) {
    this._apiBase = `${apiBase}/${itemId}/items`;
    this._el = null; this._table = null;
    this._crud = new TabCrudMixin({ apiBase: this._apiBase, formFields: FORM_FIELDS, entityName: '계약 항목', onRefresh: () => this._fetch() });
  }

  async mount(c) {
    this._el = c;
    this._el.innerHTML = `<div class="spa-tab-panel">${this._crud.renderToolbar()}<div id="tab-table"></div></div>`;
    this._table = new DataTable({ columns: COLUMNS, selectable: true, emptyText: '등록된 계약 항목이 없습니다.',
      onRowClick: r => this._crud.openForm(r) });
    this._table.mount(this._el.querySelector('#tab-table'));
    this._crud.bindToolbar(this._el, this._table);
    await this._fetch();
  }

  unmount() { this._table?.unmount(); }

  async _fetch() {
    try { const res = await api.get(this._apiBase); const items = res.rows || res.items || [];
      this._table.setData(items, items.length, 1); } catch { this._table.setData([], 0, 1); }
  }
}

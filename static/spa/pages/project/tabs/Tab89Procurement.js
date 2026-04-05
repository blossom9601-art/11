/* ============================================================
 *  Tab89Procurement — 조달관리 (CAPEX 읽기 전용)
 *  ============================================================
 *  API: GET /api/capex-contract-items/by-project?project_no=<project_number>
 *  읽기 전용 — CAPEX 계약 항목 목록 표시
 * ============================================================ */

import { api }              from '../../../shared/api-client.js';
import { esc }              from '../../../shared/dom-utils.js';
import { DataTable }        from '../../../widgets/DataTable.js';
import { fetchQuery }       from '../../../shared/bq.js';

const COLUMNS = [
  { key: 'manageNo',        label: '관리번호',   sortable: true, width: '100px' },
  { key: 'contractStatus',  label: '계약상태',   sortable: true, width: '80px' },
  { key: 'contractType',    label: '계약유형',   sortable: true, width: '80px' },
  { key: 'contractDivision',label: '계약구분',   sortable: true, width: '80px' },
  { key: 'itemType',        label: '품목유형',   sortable: true, width: '80px' },
  { key: 'supplier',        label: '공급업체',   sortable: true },
  { key: 'manufacturer',    label: '제조사',     sortable: true },
  { key: 'model',           label: '모델명',     sortable: true },
  { key: 'specification',   label: '사양',       sortable: false },
  { key: 'unitPrice',       label: '단가',       sortable: true, width: '90px' },
  { key: 'qty',             label: '수량',       sortable: true, width: '60px' },
  { key: 'totalPrice',      label: '금액',       sortable: true, width: '100px' },
];

export default class Tab89Procurement {
  constructor({ projectId, project, tabKey, access, router }) {
    this._projectId = projectId;
    this._project   = project;
    this._el        = null;
    this._table     = null;
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = '<div class="spa-tab-panel"><div id="tab-table"></div></div>';
    this._table = new DataTable({ columns: COLUMNS, emptyText: '연결된 CAPEX 계약 항목이 없습니다.' });
    this._table.mount(this._el.querySelector('#tab-table'));
    await this._fetchData();
  }

  unmount() { if (this._table) this._table.unmount(); }

  async _fetchData() {
    const pno = this._project?.project_number;
    if (!pno) { this._table.setData([], 0, 1); return; }

    const url = `/api/capex-contract-items/by-project?project_no=${encodeURIComponent(pno)}`;
    const qKey = ['project', this._projectId, 'procurement'];
    const result = await fetchQuery(qKey, () => api.get(url, { showError: false }));

    if (result.success !== false) {
      const items = (result.items || result.rows || []).map(item => ({
        id:               item.id,
        manageNo:         item.manage_no         || item.manageNo         || '-',
        contractStatus:   item.contract_status   || item.contractStatus   || '-',
        contractType:     item.contract_type     || item.contractType     || '-',
        contractDivision: item.contract_division || item.contractDivision || '-',
        itemType:         item.item_type         || item.itemType         || '-',
        supplier:         item.supplier          || '-',
        manufacturer:     item.manufacturer      || '-',
        model:            item.model             || '-',
        specification:    item.specification     || '-',
        unitPrice:        item.unit_price != null ? Number(item.unit_price).toLocaleString() : '-',
        qty:              item.qty ?? item.quantity ?? '-',
        totalPrice:       item.total_price != null ? Number(item.total_price).toLocaleString() : '-',
      }));
      this._table.setData(items, items.length, 1);
    }
  }

  async save() { return true; }
}

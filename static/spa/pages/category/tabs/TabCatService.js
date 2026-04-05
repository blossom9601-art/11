/* TabCatService — 서비스 연계 탭 (업무그룹 -> 서비스 목록) */
import { api }           from '../../../shared/api-client.js';
import { DataTable }     from '../../../widgets/DataTable.js';
import { TabCrudMixin }  from '../../../shared/tab-crud-mixin.js';

const COLUMNS = [
  { key: 'service_name',  label: '서비스명',    sortable: true },
  { key: 'service_type',  label: '서비스 유형',  sortable: true, width: '110px' },
  { key: 'url',           label: 'URL',         sortable: true },
  { key: 'owner_name',    label: '담당자',       sortable: true },
  { key: 'status',        label: '상태',         sortable: true, width: '80px' },
];

const FORM_FIELDS = [
  { key: 'service_name', label: '서비스명', required: true },
  { key: 'service_type', label: '서비스 유형', type: 'select', options: ['웹','API','배치','기타'] },
  { key: 'url',          label: 'URL' },
  { key: 'owner_name',   label: '담당자' },
  { key: 'status',       label: '상태', type: 'select', options: ['운영중','중단','개발중'] },
];

export default class TabCatService {
  constructor({ itemId, apiBase }) {
    this._apiBase = `${apiBase}/${itemId}/services`;
    this._el = null; this._table = null;
    this._crud = new TabCrudMixin({ apiBase: this._apiBase, formFields: FORM_FIELDS, entityName: '서비스', onRefresh: () => this._fetch() });
  }

  async mount(c) {
    this._el = c;
    this._el.innerHTML = `<div class="spa-tab-panel">${this._crud.renderToolbar()}<div id="tab-table"></div></div>`;
    this._table = new DataTable({ columns: COLUMNS, selectable: true, emptyText: '연계된 서비스가 없습니다.',
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

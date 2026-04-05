/* DcRackListPage — 랙 목록 관리 (CRUD) */
import { api }           from '../../shared/api-client.js';
import { esc }           from '../../shared/dom-utils.js';
import { DataTable }     from '../../widgets/DataTable.js';
import { SearchBar }     from '../../widgets/SearchBar.js';
import { TabCrudMixin }  from '../../shared/tab-crud-mixin.js';

const COLUMNS = [
  { key: 'rack_code',   label: '랙코드',   sortable: true, width: '110px' },
  { key: 'rack_name',   label: '랙이름',   sortable: true },
  { key: 'center_code', label: '센터',     sortable: true, width: '90px' },
  { key: 'rack_position', label: '위치',   sortable: true, width: '100px' },
  { key: 'rack_model',  label: '모델',     sortable: true, width: '120px' },
  { key: 'system_height_u', label: '높이(U)', sortable: true, width: '70px' },
  { key: 'business_name', label: '사업명', sortable: true },
];

const FORM_FIELDS = [
  { key: 'rack_code', label: '랙코드', type: 'text', required: true },
  { key: 'rack_name', label: '랙이름', type: 'text', required: true },
  { key: 'center_code', label: '센터코드', type: 'text' },
  { key: 'rack_position', label: '위치', type: 'text' },
  { key: 'rack_model', label: '모델', type: 'text' },
  { key: 'manufacturer_code', label: '제조사', type: 'text' },
  { key: 'serial_number', label: '시리얼번호', type: 'text' },
  { key: 'system_height_u', label: '높이(U)', type: 'text' },
  { key: 'remark', label: '비고', type: 'textarea' },
];

export default class DcRackListPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el     = null;
    this._table  = null;
    this._search = null;
    this._filters = {};
    this._crud   = new TabCrudMixin({
      apiBase: '/api/org-racks',
      formFields: FORM_FIELDS,
      entityName: '랙',
      onRefresh: () => this._fetch(),
    });
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <button class="spa-btn spa-btn--icon spa-back-btn" id="btn-back">← 데이터센터</button>
          <h2 class="spa-page__title">랙 목록</h2>
          <div class="spa-page-actions">
            <button class="spa-btn spa-btn--outline" id="btn-export">CSV 내보내기</button>
          </div>
        </div>
        <div id="search-area"></div>
        <div class="spa-tab-panel__header">${this._crud.renderToolbar()}</div>
        <div id="list-table"></div>
      </div>`;

    this._search = new SearchBar({
      fields: [{ key: 'q', label: '검색어', type: 'text', placeholder: '랙코드, 랙이름, 센터...' }],
      onSearch: f => { this._filters = f; this._fetch(); },
      onReset:  () => { this._filters = {}; this._fetch(); },
    });
    this._search.mount(this._el.querySelector('#search-area'));
    this._el.querySelector('#btn-export').addEventListener('click', () => this._table.exportCsv('랙목록.csv'));

    const cols = [...COLUMNS, TabCrudMixin.actionColumn(this._crud)];
    this._table = new DataTable({ columns: cols, selectable: true, emptyText: '등록된 랙이 없습니다.' });
    this._table.mount(this._el.querySelector('#list-table'));
    this._crud.bindToolbar(this._el, this._table);
    this._crud.bindRowActions(this._el);

    this._el.querySelector('#list-table').addEventListener('click', e => {
      const tr = e.target.closest('tr[data-row-id]');
      if (tr) this._router.navigate('/datacenter/rack/' + tr.dataset.rowId);
    });

    this._el.querySelector('#btn-back')?.addEventListener('click', () => this._router.navigate('/datacenter'));
    await this._fetch();
  }

  unmount() {
    if (this._table)  this._table.unmount();
    if (this._search) this._search.unmount();
  }

  async _fetch() {
    this._table.loading(true);
    try {
      const res = await api.get('/api/org-racks');
      const rows = res.items || res.rows || [];
      this._table.setData(rows, rows.length, 1);
      this._crud.setRows(rows);
    } catch { this._table.setData([], 0, 1); }
  }
}

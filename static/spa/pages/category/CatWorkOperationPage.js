/* CatWorkOperationPage — 업무 운영 관리 */
import { api }        from '../../shared/api-client.js';
import { esc }        from '../../shared/dom-utils.js';
import { DataTable }  from '../../widgets/DataTable.js';
import { SearchBar }  from '../../widgets/SearchBar.js';
import { TabCrudMixin } from '../../shared/tab-crud-mixin.js';

const COLUMNS = [
  { key: 'operation_code', label: '운영코드', sortable: true, width: '110px' },
  { key: 'operation_name', label: '운영명', sortable: true },
  { key: 'description', label: '설명', sortable: true },
  { key: 'hw_count', label: 'HW수', sortable: true, width: '70px' },
  { key: 'sw_count', label: 'SW수', sortable: true, width: '70px' }
];

const FORM_FIELDS = [
  { key: 'operation_code', label: '운영코드', type: 'text', required: true },
  { key: 'operation_name', label: '운영명', type: 'text', required: true },
  { key: 'description', label: '설명', type: 'textarea' },
  { key: 'remark', label: '비고', type: 'textarea' }
];

export default class CatWorkOperationPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el     = null;
    this._table  = null;
    this._filters = {};
    this._crud   = new TabCrudMixin({
      apiBase: '/api/work-operations',
      formFields: FORM_FIELDS,
      entityName: '업무 운영',
      onRefresh: () => this._fetch(),
    });
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <button class="spa-btn spa-btn--icon spa-back-btn" id="btn-back">← 업무 분류</button>
          <h2 class="spa-page__title">업무 운영</h2>
          <div class="spa-page-actions">
            <button class="spa-btn spa-btn--outline" id="btn-export">CSV 내보내기</button>
          </div>
        </div>
        <div class="spa-tab-panel__header">${this._crud.renderToolbar()}</div>
        <div id="search-area"></div>
        <div id="list-table"></div>
      </div>`;

    const cols = [...COLUMNS, TabCrudMixin.actionColumn(this._crud)];
    this._table = new DataTable({ columns: cols, selectable: true, emptyText: '등록된 업무 운영이(가) 없습니다.' });
    this._table.mount(this._el.querySelector('#list-table'));
    this._crud.bindToolbar(this._el, this._table);
    this._crud.bindRowActions(this._el);
    this._search = new SearchBar({
      fields: [{ key: 'q', label: '검색어', type: 'text', placeholder: '검색...' }],
      onSearch: f => { this._filters = f; this._fetch(); },
      onReset:  () => { this._filters = {}; this._fetch(); },
    });
    this._search.mount(this._el.querySelector('#search-area'));
    this._el.querySelector('#btn-export')?.addEventListener('click', () =>
      this._table.exportCsv('업무운영.csv'));

    this._el.querySelector('#btn-back')?.addEventListener('click', () => this._router.navigate('/category/business'));
    await this._fetch();
  }

  unmount() {
    if (this._table)  this._table.unmount();
    if (this._search) this._search.unmount();
  }

  async _fetch() {
    this._table.loading(true);
    try {
      const res = await api.get('/api/work-operations');
      let rows = res.items || res.rows || [];
      const q = (this._filters?.q || '').toLowerCase();
      if (q) rows = rows.filter(r => Object.values(r).some(v => String(v||'').toLowerCase().includes(q)));
      this._table.setData(rows, rows.length, 1);
      this._crud.setRows(rows);
    } catch { this._table.setData([], 0, 1); }
  }
}

/* GovDrTrainingPage — DR 훈련 */
import { api }        from '../../shared/api-client.js';
import { esc }        from '../../shared/dom-utils.js';
import { DataTable }  from '../../widgets/DataTable.js';
import { SearchBar }  from '../../widgets/SearchBar.js';
import { Toast }      from '../../widgets/Toast.js';
import { TabCrudMixin } from '../../shared/tab-crud-mixin.js';

const COLUMNS = [
  { key: 'training_name', label: '훈련명', sortable: true },
  { key: 'training_type', label: '유형', sortable: true, width: '100px' },
  { key: 'training_date', label: '훈련일', sortable: true, width: '110px' },
  { key: 'participants', label: '참가인원', sortable: true, width: '90px' },
  { key: 'result', label: '결과', sortable: true, width: '80px' },
  { key: 'remark', label: '비고' }
];

const FORM_FIELDS = [
  { key: 'training_name', label: '훈련명', type: 'text', required: true },
  { key: 'training_type', label: '유형', type: 'select', required: true, options: [{ value: '정기훈련', label: '정기훈련' }, { value: '모의훈련', label: '모의훈련' }, { value: '비상훈련', label: '비상훈련' }] },
  { key: 'training_date', label: '훈련일', type: 'date', required: true },
  { key: 'participants', label: '참가인원', type: 'number' },
  { key: 'result', label: '결과', type: 'select', options: [{ value: '성공', label: '성공' }, { value: '부분성공', label: '부분성공' }, { value: '실패', label: '실패' }] },
  { key: 'remark', label: '비고', type: 'textarea' }
];

export default class GovDrTrainingPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el     = null;
    this._table  = null;
    this._rows   = [];
    this._crud   = new TabCrudMixin({
      apiBase: '/api/governance/dr-trainings',
      formFields: FORM_FIELDS,
      entityName: 'DR 훈련',
      onRefresh: () => this._fetch(),
    });
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">DR 훈련</h2>
          <div class="spa-page-header__actions"><button class="spa-btn" id="btn-export">CSV 내보내기</button></div>
        </div>
        <div class="spa-tab-panel__header">${this._crud.renderToolbar()}</div>
        <div id="search-area"></div>
        <div id="list-table"></div>
      </div>`;
    this._searchBar = new SearchBar({
      fields: [{ key: 'q', label: '검색어', type: 'text', placeholder: '훈련명, 유형...' }],
      onSearch: (f) => { this._searchQ = f.q || ''; this._fetch(); },
      onReset:  ()  => { this._searchQ = ''; this._fetch(); },
    });
    this._searchBar.mount(this._el.querySelector('#search-area'));
    this._el.querySelector('#btn-export')?.addEventListener('click', () => this._table.exportCsv('DR훈련.csv'));
    const cols = [...COLUMNS, TabCrudMixin.actionColumn(this._crud)];
    this._table = new DataTable({ columns: cols, selectable: true, emptyText: '등록된 DR 훈련이(가) 없습니다.' });
    this._table.mount(this._el.querySelector('#list-table'));
    this._crud.bindToolbar(this._el, this._table);
    this._crud.bindRowActions(this._el);
    await this._fetch();
  }

  unmount() { if (this._table) this._table.unmount(); if (this._searchBar) this._searchBar.unmount(); }

  async _fetch() {
    this._table.loading(true);
    try {
      const qs = this._searchQ ? '?q=' + encodeURIComponent(this._searchQ) : '';
      const res = await api.get('/api/governance/dr-trainings' + qs);
      this._rows = res.rows || res.items || [];
      this._table.setData(this._rows, this._rows.length, 1);
      this._crud.setRows(this._rows);
    } catch { this._table.setData([], 0, 1); }
  }
}

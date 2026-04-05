/* DcAuthorityRecordPage — 출입 권한 변경 이력 */
import { api }        from '../../shared/api-client.js';
import { esc }        from '../../shared/dom-utils.js';
import { DataTable }  from '../../widgets/DataTable.js';
import { SearchBar }  from '../../widgets/SearchBar.js';
import { Toast }      from '../../widgets/Toast.js';
import { TabCrudMixin } from '../../shared/tab-crud-mixin.js';

const COLUMNS = [
  { key: 'person_name', label: '이름', sortable: true },
  { key: 'change_type', label: '변경유형', sortable: true, width: '100px' },
  { key: 'zone_name', label: '구역', sortable: true, width: '110px' },
  { key: 'changed_at', label: '변경일시', sortable: true, width: '150px' },
  { key: 'changed_by', label: '변경자', sortable: true, width: '100px' },
  { key: 'remark', label: '비고' }
];

const FORM_FIELDS = [
  { key: 'person_name', label: '이름', type: 'text', required: true },
  { key: 'change_type', label: '변경유형', type: 'select', required: true, options: [{ value: '부여', label: '부여' }, { value: '회수', label: '회수' }, { value: '변경', label: '변경' }] },
  { key: 'zone_name', label: '구역', type: 'text', required: true },
  { key: 'remark', label: '비고', type: 'textarea' }
];

export default class DcAuthorityRecordPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el     = null;
    this._table  = null;
    this._rows   = [];
    this._filters = {};
    this._crud   = new TabCrudMixin({
      apiBase: '/api/datacenter/access/authority-records',
      formFields: FORM_FIELDS,
      entityName: '권한 변경 이력',
      onRefresh: () => this._fetch(),
    });
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header"><h2 class="spa-page__title">출입 권한 변경 이력</h2>
          <div class="spa-page-actions">
            <button class="spa-btn spa-btn--outline" id="btn-export">CSV 내보내기</button>
          </div>
        </div>
        <div class="spa-tab-panel__header">${this._crud.renderToolbar()}</div>
        <div id="search-area"></div>
        <div id="list-table"></div>
      </div>`;
    const cols = [...COLUMNS, TabCrudMixin.actionColumn(this._crud)];
    this._table = new DataTable({ columns: cols, selectable: true, emptyText: '등록된 권한 변경 이력이(가) 없습니다.' });
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
      this._table.exportCsv('출입권한변경이력.csv'));

    await this._fetch();
  }

  unmount() {
    if (this._table)  this._table.unmount();
    if (this._search) this._search.unmount();
  }

  async _fetch() {
    this._table.loading(true);
    try {
      const res = await api.get('/api/datacenter/access/authority-records');
      this._rows = res.rows || res.items || [];
      const q = (this._filters?.q || '').toLowerCase();
      if (q) this._rows = this._rows.filter(r => Object.values(r).some(v => String(v||'').toLowerCase().includes(q)));
      this._table.setData(this._rows, this._rows.length, 1);
      this._crud.setRows(this._rows);
    } catch { this._table.setData([], 0, 1); }
  }
}

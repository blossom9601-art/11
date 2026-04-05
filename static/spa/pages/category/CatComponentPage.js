/* CatComponentPage — 부품 카탈로그 (서브타입 라우팅) */
import { api }        from '../../shared/api-client.js';
import { esc }        from '../../shared/dom-utils.js';
import { DataTable }  from '../../widgets/DataTable.js';
import { SearchBar }  from '../../widgets/SearchBar.js';
import { Toast }      from '../../widgets/Toast.js';
import { TabCrudMixin } from '../../shared/tab-crud-mixin.js';

const TYPE_CONFIG = {
  cpu:    { api: '/api/cmp-cpu-types',    label: 'CPU',    entity: 'CPU 유형' },
  gpu:    { api: '/api/cmp-gpu-types',    label: 'GPU',    entity: 'GPU 유형' },
  memory: { api: '/api/cmp-memory-types', label: '메모리', entity: '메모리 유형' },
  disk:   { api: '/api/cmp-disk-types',   label: '디스크', entity: '디스크 유형' },
  nic:    { api: '/api/cmp-nic-types',    label: 'NIC',    entity: 'NIC 유형' },
  hba:    { api: '/api/cmp-hba-types',    label: 'HBA',    entity: 'HBA 유형' },
  etc:    { api: '/api/cmp-etc-types',    label: '기타',   entity: '기타 유형' },
};
const TYPES = Object.keys(TYPE_CONFIG);

const COLUMNS = [
  { key: 'type_name', label: '부품명', sortable: true },
  { key: 'manufacturer', label: '제조사', sortable: true },
  { key: 'category', label: '분류', sortable: true, width: '100px' },
  { key: 'spec', label: '사양', sortable: true }
];
const FORM_FIELDS = [
  { key: 'type_name', label: '부품명', type: 'text', required: true },
  { key: 'manufacturer', label: '제조사', type: 'text' },
  { key: 'category', label: '분류', type: 'select', options: TYPES.map(k => ({ value: TYPE_CONFIG[k].label, label: TYPE_CONFIG[k].label })) },
  { key: 'spec', label: '사양', type: 'text' }
];

export default class CatComponentPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._type   = params.type || query.type || 'cpu';
    if (!TYPE_CONFIG[this._type]) this._type = 'cpu';
    this._cfg    = TYPE_CONFIG[this._type];
    this._el     = null;
    this._table  = null;
    this._rows   = [];
    this._filters = {};
    this._crud   = new TabCrudMixin({
      apiBase: this._cfg.api,
      formFields: FORM_FIELDS,
      entityName: this._cfg.entity,
      onRefresh: () => this._fetch(),
    });
  }

  async mount(container) {
    this._el = container;
    const tabs = TYPES.map(k => {
      const c = TYPE_CONFIG[k];
      const active = k === this._type ? ' active' : '';
      return `<button class="spa-tab-btn${active}" data-type="${k}">${esc(c.label)}</button>`;
    }).join('');
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header"><h2 class="spa-page__title">부품 카탈로그</h2></div>
          <div class="spa-page-actions">
            <button class="spa-btn spa-btn--outline" id="btn-export">CSV 내보내기</button>
          </div>
        <div class="spa-tab-bar">${tabs}</div>
        <div class="spa-tab-panel__header">${this._crud.renderToolbar()}</div>
        <div id="search-area"></div>
        <div id="list-table"></div>
      </div>`;
    this._el.querySelector('.spa-tab-bar').addEventListener('click', e => {
      const btn = e.target.closest('[data-type]');
      if (btn) this._router.navigate('/category/component/' + btn.dataset.type);
    });
    const cols = [...COLUMNS, TabCrudMixin.actionColumn(this._crud)];
    this._table = new DataTable({ columns: cols, selectable: true, emptyText: `등록된 ${this._cfg.entity}이(가) 없습니다.` });
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
      this._table.exportCsv('구성요소.csv'));

    await this._fetch();
  }

  unmount() {
    if (this._table)  this._table.unmount();
    if (this._search) this._search.unmount();
  }

  async _fetch() {
    this._table.loading(true);
    try {
      const res = await api.get(this._cfg.api);
      this._rows = res.rows || res.items || [];
      const q = (this._filters?.q || '').toLowerCase();
      if (q) this._rows = this._rows.filter(r => Object.values(r).some(v => String(v||'').toLowerCase().includes(q)));
      this._table.setData(this._rows, this._rows.length, 1);
      this._crud.setRows(this._rows);
    } catch { this._table.setData([], 0, 1); }
  }
}

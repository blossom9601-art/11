/* CatVendorPage — 공급업체 관리 (제조사/유지보수 서브타입) */
import { api }        from '../../shared/api-client.js';
import { esc }        from '../../shared/dom-utils.js';
import { DataTable }  from '../../widgets/DataTable.js';
import { SearchBar }  from '../../widgets/SearchBar.js';
import { Toast }      from '../../widgets/Toast.js';
import { TabCrudMixin } from '../../shared/tab-crud-mixin.js';

const TYPE_CONFIG = {
  manufacturer: {
    api: '/api/vendor-manufacturers',
    label: '제조사',
    entity: '제조사',
    columns: [
      { key: 'vendor_name', label: '업체명', sortable: true },
      { key: 'vendor_code', label: '업체코드', sortable: true, width: '120px' },
      { key: 'business_type', label: '업종', sortable: true, width: '100px' },
      { key: 'contact', label: '연락처', sortable: true, width: '120px' },
      { key: 'contract_status', label: '계약상태', sortable: true, width: '90px' }
    ],
    fields: [
      { key: 'vendor_name', label: '업체명', type: 'text', required: true },
      { key: 'vendor_code', label: '업체코드', type: 'text' },
      { key: 'business_type', label: '업종', type: 'text' },
      { key: 'contact', label: '연락처', type: 'text' },
      { key: 'address', label: '주소', type: 'text' },
      { key: 'contract_status', label: '계약상태', type: 'select', options: [{ value: '계약중', label: '계약중' }, { value: '만료', label: '만료' }, { value: '해지', label: '해지' }] }
    ],
  },
  maintenance: {
    api: '/api/vendor-maintenance',
    label: '유지보수업체',
    entity: '유지보수업체',
    columns: [
      { key: 'vendor_name', label: '업체명', sortable: true },
      { key: 'vendor_code', label: '업체코드', sortable: true, width: '120px' },
      { key: 'service_type', label: '서비스유형', sortable: true, width: '110px' },
      { key: 'contact', label: '연락처', sortable: true, width: '120px' },
      { key: 'contract_start', label: '계약시작', sortable: true, width: '100px' },
      { key: 'contract_end', label: '계약종료', sortable: true, width: '100px' },
      { key: 'status', label: '상태', sortable: true, width: '80px',
    render: (v) => {
      const m = { 'ACTIVE': '#16a34a', '활성': '#16a34a', '정상': '#16a34a', '개통': '#16a34a', 'INACTIVE': '#9ca3af', '비활성': '#9ca3af', '만료': '#9ca3af', '장애': '#dc2626', '정지': '#dc2626', 'CLOSED': '#dc2626', '해지': '#dc2626', '경고': '#dc2626', 'PENDING': '#f59e0b', '대기': '#f59e0b', '점검': '#f59e0b', '주의': '#f59e0b' };
      const c = m[v]; return c ? `<span class="spa-badge" style="background:${c};color:#fff">${v}</span>` : v || '-';
    }
  }
    ],
    fields: [
      { key: 'vendor_name', label: '업체명', type: 'text', required: true },
      { key: 'vendor_code', label: '업체코드', type: 'text' },
      { key: 'service_type', label: '서비스유형', type: 'text' },
      { key: 'contact', label: '연락처', type: 'text' },
      { key: 'address', label: '주소', type: 'text' },
      { key: 'contract_start', label: '계약시작일', type: 'date' },
      { key: 'contract_end', label: '계약종료일', type: 'date' },
      { key: 'status', label: '상태', type: 'select', options: [{ value: '계약중', label: '계약중' }, { value: '만료', label: '만료' }, { value: '해지', label: '해지' }] }
    ],
  },
};
const TYPES = Object.keys(TYPE_CONFIG);

export default class CatVendorPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._type   = params.type || query.type || 'manufacturer';
    if (!TYPE_CONFIG[this._type]) this._type = 'manufacturer';
    this._cfg    = TYPE_CONFIG[this._type];
    this._el     = null;
    this._table  = null;
    this._rows   = [];
    this._filters = {};
    this._crud   = new TabCrudMixin({
      apiBase: this._cfg.fields ? this._cfg.api : this._cfg.api,
      formFields: this._cfg.fields,
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
        <div class="spa-page-header"><h2 class="spa-page__title">공급업체 관리</h2></div>
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
      if (btn) this._router.navigate('/category/vendor/' + btn.dataset.type);
    });
    const cols = [...this._cfg.columns, TabCrudMixin.actionColumn(this._crud)];
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
      this._table.exportCsv('공급업체.csv'));

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

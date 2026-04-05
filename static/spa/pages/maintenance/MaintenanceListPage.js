/* MaintenanceListPage — 유지보수 계약 목록 */

import { api }        from '../../shared/api-client.js';
import { esc, h }     from '../../shared/dom-utils.js';
import { DataTable }  from '../../widgets/DataTable.js';
import { SearchBar }  from '../../widgets/SearchBar.js';
import { LoadingSpinner } from '../../widgets/LoadingSpinner.js';
import { Modal }          from '../../widgets/Modal.js';

const STATUS_COLORS = { '진행중': '#2563eb', '완료': '#16a34a', '만료': '#9ca3af', '대기': '#f59e0b' };

const COLS = [
  { key: 'id',            label: 'ID',      sortable: true, width: '60px' },
  { key: 'contract_name', label: '계약명',   sortable: true },
  { key: 'vendor_name',   label: '공급업체', sortable: true },
  { key: 'type',          label: '유형',     sortable: true, width: '100px' },
  { key: 'start_date',    label: '시작일',   sortable: true, width: '110px' },
  { key: 'end_date',      label: '종료일',   sortable: true, width: '110px' },
  { key: 'status',        label: '상태',     sortable: true, width: '90px',
    render: (v) => {
      const c = STATUS_COLORS[v];
      return c ? `<span class="spa-badge" style="background:${c};color:#fff">${esc(v)}</span>` : esc(v || '-');
    }
  },
];

export default class MaintenanceListPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._query  = query || {};
    this._page   = parseInt(this._query.page) || 1;
    this._el     = null;
    this._table  = null;
    this._searchBar = null;
    this._filters = {};
  }

  /* ── mount ── */
  async mount(container) {
    this._el = h('div', { className: 'spa-page' });
    container.appendChild(this._el);
    this._el.innerHTML = `
      <div class="spa-page-header">
        <h1>유지보수 계약</h1>
        <div class="spa-page-header__actions">
          <button class="spa-btn spa-btn--outline" id="btn-export">CSV 내보내기</button>
          <button class="spa-btn spa-btn--primary" data-action="create">+ 신규 계약</button>
        </div>
      </div>
      <div id="search-area"></div>
      <div data-role="table-area"></div>`;

    this._el.querySelector('[data-action="create"]')
      .addEventListener('click', () => this._create());
    this._el.querySelector('#btn-export')
      .addEventListener('click', () => this._table.exportCsv('유지보수계약_목록.csv'));

    this._searchBar = new SearchBar({
      fields: [
        { key: 'q', label: '검색어', type: 'text', placeholder: '계약명, 공급업체...' },
      ],
      onSearch: f => { this._filters = f; this._page = 1; this._load(); },
      onReset:  () => { this._filters = {}; this._page = 1; this._load(); },
    });
    this._searchBar.mount(this._el.querySelector('#search-area'));

    this._table = new DataTable({
      columns: COLS,
      pageSize: 30,
      onRowClick: (row) => this._router.push(`/spa/maintenance/${row.id}`),
      onPageChange: (p) => { this._page = p; this._load(); },
    });
    this._table.mount(this._el.querySelector('[data-role="table-area"]'));
    await this._load();
  }

  async _load() {
    this._table.loading(true);
    try {
      const res = await api.get('/api/opex-contracts', {
        page: this._page, per_page: 30,
        search: this._filters.q || ''
      });
      this._table.setData(res.rows || [], res.total || 0, this._page);
    } catch { this._table.setData([], 0, 1); }
  }

  _create() {
    const modal = new Modal({
      title: '신규 유지보수 계약',
      content: '<div class="spa-form-group"><label class="spa-label">계약명</label><input type="text" class="spa-input" id="modal-name" placeholder="계약명을 입력하세요" autofocus></div>',
      size: 'sm',
      confirmText: '등록',
      onConfirm: () => {
        const name = modal._el.querySelector('#modal-name')?.value?.trim();
        if (!name) return;
        modal.close();
        api.post('/api/opex-contracts', { contract_name: name })
          .then(() => this._load());
      },
    });
    modal.open();
  }

  unmount() {
    if (this._table)     this._table.unmount();
    if (this._searchBar) this._searchBar.unmount();
    if (this._el)        this._el.remove();
  }
}

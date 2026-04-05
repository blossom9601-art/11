/* CostListPage — 비용관리: OPEX/CAPEX 목록 */

import { api }        from '../../shared/api-client.js';
import { esc }        from '../../shared/dom-utils.js';
import { DataTable }  from '../../widgets/DataTable.js';
import { SearchBar }  from '../../widgets/SearchBar.js';
import { LoadingSpinner } from '../../widgets/LoadingSpinner.js';
import { fetchQuery } from '../../shared/bq.js';

const TYPE_CONFIG = {
  opex:  { apiBase: '/api/opex-contracts',  label: 'OPEX (운영비)' },
  capex: { apiBase: '/api/capex-contracts', label: 'CAPEX (투자비)' },
};

const COLUMNS = [
  { key: 'id',            label: 'ID',       sortable: true, width: '60px' },
  { key: 'contract_name', label: '계약명',   sortable: true },
  { key: 'vendor_name',   label: '공급업체', sortable: true },
  { key: 'start_date',    label: '시작일',   sortable: true, width: '110px' },
  { key: 'end_date',      label: '종료일',   sortable: true, width: '110px' },
  { key: 'total_amount',  label: '총액',     sortable: true, width: '120px',
    render: (v) => v != null ? Number(v).toLocaleString() + ' 원' : '-' },
  { key: 'status',        label: '상태',     sortable: true, width: '80px',
    render: (v) => {
      const colors = { '진행중': '#2563eb', '완료': '#16a34a', '만료': '#9ca3af', '대기': '#f59e0b' };
      const c = colors[v];
      return c ? `<span class="spa-badge" style="background:${c};color:#fff">${esc(v)}</span>` : esc(v || '-');
    }
  },
];

export default class CostListPage {
  constructor({ params, query, router }) {
    this._router   = router;
    this._type     = params.type || 'opex';
    this._query    = query || {};
    this._cfg      = TYPE_CONFIG[this._type] || TYPE_CONFIG.opex;
    this._el       = null;
    this._table    = null;
    this._search   = null;
    this._filters  = {};
    this._page     = parseInt(this._query.page) || 1;
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">비용관리</h2>
          <div class="spa-page-actions">
            <button class="spa-btn spa-btn--outline" id="btn-export">CSV 내보내기</button>
          </div>
        </div>
        <div class="spa-scope-tabs" style="margin-bottom:16px">
          ${Object.entries(TYPE_CONFIG).map(([k, v]) =>
            `<button class="spa-scope-tab${k === this._type ? ' active' : ''}" data-type="${k}">${esc(v.label)}</button>`
          ).join('')}
        </div>
        <div id="search-area"></div>
        <div id="cost-table"></div>
      </div>`;

    this._el.querySelector('.spa-scope-tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-type]');
      if (btn && btn.dataset.type !== this._type) {
        this._router.navigate('/cost/' + btn.dataset.type);
      }
    });

    this._el.querySelector('#btn-export').addEventListener('click', () =>
      this._table.exportCsv(`비용_${this._type}_목록.csv`));

    this._search = new SearchBar({
      fields: [
        { key: 'q', label: '검색어', type: 'text', placeholder: '계약명, 공급업체...' },
      ],
      onSearch: f => { this._filters = f; this._page = 1; this._fetch(); },
      onReset:  () => { this._filters = {}; this._page = 1; this._fetch(); },
    });
    this._search.mount(this._el.querySelector('#search-area'));

    this._table = new DataTable({
      columns: COLUMNS,
      selectable: false,
      emptyText: '등록된 계약이 없습니다.',
      pageSize: 30,
      onRowClick: (row) => this._router.navigate(`/cost/${this._type}/${row.id}`),
      onPageChange: (page) => { this._page = page; this._fetch(); },
    });
    this._table.mount(this._el.querySelector('#cost-table'));
    await this._fetch();
  }

  unmount() {
    if (this._table)  this._table.unmount();
    if (this._search) this._search.unmount();
  }

  async _fetch() {
    let url = `${this._cfg.apiBase}?page=${this._page}&page_size=30`;
    if (this._filters.q) url += `&search=${encodeURIComponent(this._filters.q)}`;
    const res = await fetchQuery(
      ['cost', this._type, this._page],
      () => api.get(url, { showError: false })
    );
    const items = res.items || [];
    const total = res.total || items.length;
    this._table.setData(items, total);
  }
}

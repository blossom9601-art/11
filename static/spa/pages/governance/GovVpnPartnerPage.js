/* GovVpnPartnerPage — VPN 파트너 관리 */
import { api }        from '../../shared/api-client.js';
import { esc }        from '../../shared/dom-utils.js';
import { DataTable }  from '../../widgets/DataTable.js';
import { SearchBar }  from '../../widgets/SearchBar.js';
import { TabCrudMixin } from '../../shared/tab-crud-mixin.js';

const COLUMNS = [
  { key: 'org_name',     label: '기관명',     sortable: true },
  { key: 'partner_type', label: '파트너 유형', sortable: true, width: '120px' },
  { key: 'note',         label: '비고',       sortable: false },
  { key: 'created_at',   label: '등록일',     sortable: true, width: '110px' },
];

const FORM_FIELDS = [
  { key: 'org_name', label: '기관명', type: 'text', required: true },
  { key: 'partner_type', label: '파트너 유형', type: 'select', required: true, options: [
    { value: 'VPN1', label: '본사 VPN' }, { value: 'VPN2', label: '지사 VPN' },
    { value: 'VPN3', label: 'B2B VPN' }, { value: 'VPN4', label: '원격 VPN' },
    { value: 'VPN5', label: '기타 VPN' },
  ]},
  { key: 'note', label: '비고', type: 'textarea' },
];

export default class GovVpnPartnerPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el     = null;
    this._table  = null;
    this._rows   = [];
    this._filters = {};
    this._crud   = new TabCrudMixin({
      apiBase: '/api/network/vpn-partners',
      formFields: FORM_FIELDS,
      entityName: 'VPN 파트너',
      onRefresh: () => this._fetch(),
    });
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <button class="spa-btn spa-btn--icon" id="btn-back">← 거버넌스</button>
          <h2 class="spa-page__title">VPN 파트너 관리</h2>
          <div class="spa-page-actions">
            <button class="spa-btn spa-btn--outline" id="btn-export">CSV 내보내기</button>
          </div>
        </div>
        <div class="spa-tab-panel__header">${this._crud.renderToolbar()}</div>
        <div id="search-area"></div>
        <div id="list-table"></div>
      </div>`;
    const cols = [...COLUMNS, TabCrudMixin.actionColumn(this._crud)];
    this._table = new DataTable({ columns: cols, selectable: true, emptyText: 'VPN 파트너가 없습니다.' });
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
      this._table.exportCsv('VPN파트너.csv'));

    this._el.querySelector('#btn-back')?.addEventListener('click', () => this._router.navigate('/governance'));
    this._el.addEventListener('click', (e) => {
      const row = e.target.closest('tr[data-id]');
      if (row && !e.target.closest('.spa-dt-actions')) {
        this._router.navigate('/governance/vpn/partners/' + row.dataset.id);
      }
    });
    await this._fetch();
  }

  unmount() {
    if (this._table)  this._table.unmount();
    if (this._search) this._search.unmount();
  }

  async _fetch() {
    this._table.loading(true);
    try {
      const res = await api.get('/api/network/vpn-partners');
      this._rows = res.rows || res.items || [];
      const q = (this._filters?.q || '').toLowerCase();
      if (q) this._rows = this._rows.filter(r => Object.values(r).some(v => String(v||'').toLowerCase().includes(q)));
      this._table.setData(this._rows, this._rows.length, 1);
      this._crud.setRows(this._rows);
    } catch { this._table.setData([], 0, 1); }
  }
}

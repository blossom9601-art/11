/* GovUnusedAssetsPage — 미사용 자산 */
import { api }        from '../../shared/api-client.js';
import { esc }        from '../../shared/dom-utils.js';
import { DataTable }  from '../../widgets/DataTable.js';
import { SearchBar }  from '../../widgets/SearchBar.js';
import { TabBar }     from '../../widgets/TabBar.js';
import { Toast }      from '../../widgets/Toast.js';

const TYPE_GROUPS = [
  { id: 'all',      label: '전체' },
  { id: 'server',   label: '서버' },
  { id: 'storage',  label: '스토리지' },
  { id: 'san',      label: 'SAN' },
  { id: 'network',  label: '네트워크' },
  { id: 'security', label: '보안' },
  { id: 'software', label: '소프트웨어' },
];

const COLUMNS = [
  { key: 'asset_code', label: '자산코드', sortable: true, width: '120px' },
  { key: 'asset_name', label: '자산명', sortable: true },
  { key: 'asset_type', label: '유형', sortable: true, width: '100px' },
  { key: 'ip_address', label: 'IP 주소', sortable: true, width: '130px' },
  { key: 'manufacturer', label: '제조사', sortable: true },
  { key: 'deleted_at', label: '삭제일', sortable: true, width: '110px' }
];

const SEARCH_FIELDS = [
  { key: 'q', label: '검색어', type: 'text', placeholder: '자산코드, 자산명, IP...' },
];

export default class GovUnusedAssetsPage {
  constructor({ params, query, router }) {
    this._router  = router;
    this._type    = params.type || query.type || 'all';
    this._el      = null;
    this._table   = null;
    this._tabBar  = null;
    this._search  = null;
    this._filters = {};
    this._rows    = [];
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <button class="spa-btn spa-btn--icon" id="btn-back">← 거버넌스</button>
          <h2 class="spa-page__title">미사용 자산</h2>
          <div class="spa-page-header__actions">
            <button class="spa-btn spa-btn--danger" id="btn-restore" hidden>선택 복원</button>
            <button class="spa-btn" id="btn-export">CSV 내보내기</button>
          </div>
        </div>
        <div id="type-tabs"></div>
        <div id="search-area"></div>
        <div id="list-table"></div>
      </div>`;

    this._tabBar = new TabBar({
      tabs: TYPE_GROUPS,
      activeTab: this._type,
      onTabChange: (id) => {
        this._type = id;
        this._router.navigate('/governance/unused-assets' + (id !== 'all' ? '/' + id : ''));
        this._fetch();
      },
    });
    this._tabBar.mount(this._el.querySelector('#type-tabs'));

    this._search = new SearchBar({
      fields: SEARCH_FIELDS,
      onSearch: (f) => { this._filters = f; this._fetch(); },
      onReset:  ()  => { this._filters = {}; this._fetch(); },
    });
    this._search.mount(this._el.querySelector('#search-area'));

    this._table = new DataTable({
      columns: COLUMNS, selectable: true,
      emptyText: '등록된 미사용 자산이 없습니다.',
      onSelectionChange: (ids) => {
        const btn = this._el.querySelector('#btn-restore');
        if (btn) btn.hidden = !ids.length;
      },
    });
    this._table.mount(this._el.querySelector('#list-table'));

    this._el.querySelector('#btn-back').addEventListener('click', () => this._router.navigate('/governance'));
    this._el.querySelector('#btn-export')?.addEventListener('click', () => this._table.exportCsv('미사용자산.csv'));
    this._el.querySelector('#btn-restore')?.addEventListener('click', () => this._restore(this._table.getSelectedIds()));

    await this._fetch();
  }

  unmount() {
    if (this._table)  this._table.unmount();
    if (this._tabBar) this._tabBar.unmount();
    if (this._search) this._search.unmount();
  }

  async _fetch() {
    this._table.loading(true);
    try {
      const params = new URLSearchParams();
      if (this._type !== 'all') params.set('category', this._type);
      if (this._filters.q) params.set('q', this._filters.q);
      const qs = params.toString() ? '?' + params : '';
      const res = await api.get('/api/gov-unused/assets' + qs);
      this._rows = res.rows || res.items || [];
      this._table.setData(this._rows, this._rows.length);
    } catch { this._table.setData([], 0); }
  }

  async _restore(ids) {
    if (!ids || !ids.length) return;
    if (!window.confirm(`${ids.length}건을 복원하시겠습니까?`)) return;
    try {
      await api.post('/api/gov-unused/assets/restore', { ids, category: this._type !== 'all' ? this._type : undefined });
      Toast.success('복원 완료');
      this._fetch();
    } catch (e) { Toast.error(e.message || '복원 실패'); }
  }
}

/* GovPackageDashboardPage — 패키지 관리 */
import { api }        from '../../shared/api-client.js';
import { esc }        from '../../shared/dom-utils.js';
import { DataTable }  from '../../widgets/DataTable.js';
import { Toast }      from '../../widgets/Toast.js';

const COLUMNS = [
  { key: 'package_name', label: '패키지명', sortable: true },
  { key: 'version', label: '버전', sortable: true, width: '100px' },
  { key: 'vendor', label: '벤더', sortable: true },
  { key: 'os_type', label: 'OS', sortable: true, width: '100px' },
  { key: 'install_count', label: '설치수', sortable: true, width: '80px' }
];

export default class GovPackageDashboardPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el     = null;
    this._table  = null;
    this._rows   = [];
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">패키지 관리</h2>
          <div class="spa-page-header__actions">
            <button class="spa-btn" id="btn-pkg-list">목록 보기</button>
          </div>
        </div>
        <div id="dashboard-kpis" class="spa-kpi-grid" style="margin-bottom:1.5rem"></div>
        <div id="list-table"></div>
      </div>`;
    const cols = COLUMNS;
    this._table = new DataTable({ columns: cols, selectable: false, emptyText: '등록된 패키지이(가) 없습니다.' });
    this._table.mount(this._el.querySelector('#list-table'));
    this._el.querySelector('#btn-pkg-list')?.addEventListener('click', () => this._router.navigate('/governance/packages/list'));
    this._fetchDashboard();
    await this._fetch();
  }

  unmount() { if (this._table) this._table.unmount(); }

  async _fetch() {
    this._table.loading(true);
    try {
      const res = await api.get('/api/governance/packages');
      this._rows = res.rows || res.items || [];
      this._table.setData(this._rows, this._rows.length, 1);
    } catch { this._table.setData([], 0, 1); }
  }

  async _fetchDashboard() {
    try {
      const res = await api.get('/api/governance/package-dashboard');
      const data = res.item || res;
      const kpis = this._el.querySelector('#dashboard-kpis');
      const items = Object.entries(data).slice(0, 4);
      kpis.innerHTML = items.map(([k, v]) => `
        <div class="spa-kpi-card">
          <div class="spa-kpi-value">${typeof v === 'number' ? v.toLocaleString() : v}</div>
          <div class="spa-kpi-label">${k}</div>
        </div>`).join('');
    } catch {}
  }
}

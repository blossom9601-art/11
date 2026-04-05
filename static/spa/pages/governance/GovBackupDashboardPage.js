/* GovBackupDashboardPage — 백업 대시보드 */
import { api }        from '../../shared/api-client.js';
import { esc }        from '../../shared/dom-utils.js';
import { DataTable }  from '../../widgets/DataTable.js';
import { Toast }      from '../../widgets/Toast.js';
import { TabCrudMixin } from '../../shared/tab-crud-mixin.js';

const COLUMNS = [
  { key: 'policy_name', label: '정책명', sortable: true },
  { key: 'target_server', label: '대상서버', sortable: true },
  { key: 'backup_type', label: '백업유형', sortable: true, width: '100px' },
  { key: 'schedule', label: '스케줄', sortable: true },
  { key: 'retention', label: '보존기간', sortable: true, width: '90px' },
  { key: 'status', label: '상태', sortable: true, width: '80px' }
];

const FORM_FIELDS = [
  { key: 'policy_name', label: '정책명', type: 'text', required: true },
  { key: 'target_server', label: '대상서버', type: 'text', required: true },
  { key: 'backup_type', label: '백업유형', type: 'select', options: [{ value: '전체', label: '전체' }, { value: '증분', label: '증분' }, { value: '차등', label: '차등' }] },
  { key: 'schedule', label: '스케줄', type: 'text' },
  { key: 'retention', label: '보존기간', type: 'text' },
  { key: 'status', label: '상태', type: 'select', options: [{ value: '활성', label: '활성' }, { value: '비활성', label: '비활성' }, { value: '오류', label: '오류' }] }
];

export default class GovBackupDashboardPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el     = null;
    this._table  = null;
    this._rows   = [];
    this._crud   = new TabCrudMixin({
      apiBase: '/api/governance/backup/target-policies',
      formFields: FORM_FIELDS,
      entityName: '백업 대상 정책',
      onRefresh: () => this._fetch(),
    });
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">백업 대시보드</h2>
          <a href="/spa/governance/backup/policies" class="spa-btn spa-btn--outline" data-route="/governance/backup/policies">백업 대상 정책 →</a>
        </div>
        <div id="dashboard-kpis" class="spa-kpi-grid" style="margin-bottom:1.5rem"></div>
        <div class="spa-tab-panel__header">${this._crud.renderToolbar()}</div>
        <div id="list-table"></div>
      </div>`;
    const cols = [...COLUMNS, TabCrudMixin.actionColumn(this._crud)];
    this._table = new DataTable({ columns: cols, selectable: true, emptyText: '등록된 백업 대상 정책이(가) 없습니다.' });
    this._table.mount(this._el.querySelector('#list-table'));
    this._crud.bindToolbar(this._el, this._table);
    this._crud.bindRowActions(this._el);
    this._el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-route]');
      if (a) { e.preventDefault(); this._router.navigate(a.dataset.route); }
    });
    this._fetchDashboard();
    await this._fetch();
  }

  unmount() { if (this._table) this._table.unmount(); }

  async _fetch() {
    this._table.loading(true);
    try {
      const res = await api.get('/api/governance/backup/target-policies');
      this._rows = res.rows || res.items || [];
      this._table.setData(this._rows, this._rows.length, 1);
      this._crud.setRows(this._rows);
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

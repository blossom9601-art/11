/* GovVulnDashboardPage — 취약점 분석 대시보드 */
import { api }        from '../../shared/api-client.js';
import { esc }        from '../../shared/dom-utils.js';
import { DataTable }  from '../../widgets/DataTable.js';
import { Toast }      from '../../widgets/Toast.js';
import { TabCrudMixin } from '../../shared/tab-crud-mixin.js';

const COLUMNS = [
  { key: 'guide_code', label: '코드', sortable: true, width: '110px' },
  { key: 'title', label: '제목', sortable: true },
  { key: 'category', label: '분류', sortable: true, width: '100px' },
  { key: 'severity', label: '등급', sortable: true, width: '80px' },
  { key: 'status', label: '상태', sortable: true, width: '80px' }
];

const FORM_FIELDS = [
  { key: 'guide_code', label: '코드', type: 'text', required: true },
  { key: 'title', label: '제목', type: 'text', required: true },
  { key: 'category', label: '분류', type: 'text' },
  { key: 'severity', label: '등급', type: 'select', options: [{ value: '긴급', label: '긴급' }, { value: '높음', label: '높음' }, { value: '중간', label: '중간' }, { value: '낮음', label: '낮음' }] },
  { key: 'description', label: '설명', type: 'textarea' },
  { key: 'countermeasure', label: '대응방안', type: 'textarea' },
  { key: 'status', label: '상태', type: 'select', options: [{ value: '미조치', label: '미조치' }, { value: '조치중', label: '조치중' }, { value: '완료', label: '완료' }] }
];

export default class GovVulnDashboardPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el     = null;
    this._table  = null;
    this._rows   = [];
    this._crud   = new TabCrudMixin({
      apiBase: '/api/governance/vulnerability-guides',
      formFields: FORM_FIELDS,
      entityName: '취약점 가이드',
      onRefresh: () => this._fetch(),
    });
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">취약점 분석 대시보드</h2>
          <div style="display:flex;gap:.5rem">
            <a href="/spa/governance/vulnerability/analysis" class="spa-btn spa-btn--outline" data-route="/governance/vulnerability/analysis">취약점 분석 →</a>
            <a href="/spa/governance/vulnerability/guide" class="spa-btn spa-btn--outline" data-route="/governance/vulnerability/guide">취약점 가이드 →</a>
          </div>
        </div>
        <div id="dashboard-kpis" class="spa-kpi-grid" style="margin-bottom:1.5rem"></div>
        <div class="spa-tab-panel__header">${this._crud.renderToolbar()}</div>
        <div id="list-table"></div>
      </div>`;
    const cols = [...COLUMNS, TabCrudMixin.actionColumn(this._crud)];
    this._table = new DataTable({ columns: cols, selectable: true, emptyText: '등록된 취약점 가이드이(가) 없습니다.' });
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
      const res = await api.get('/api/governance/vulnerability-guides');
      this._rows = res.rows || res.items || [];
      this._table.setData(this._rows, this._rows.length, 1);
      this._crud.setRows(this._rows);
    } catch { this._table.setData([], 0, 1); }
  }

  async _fetchDashboard() {
    try {
      const res = await api.get('/api/governance/vulnerability-guides/summary');
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

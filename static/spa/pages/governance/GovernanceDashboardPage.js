/* GovernanceDashboardPage — 거버넌스 대시보드 (DR/백업/패키지/취약점 총괄) */

import { api }    from '../../shared/api-client.js';
import { h, esc } from '../../shared/dom-utils.js';

const DASHBOARD_SECTIONS = [
  { id: 'dr',     label: 'DR 훈련',       api: '/api/governance/dr-trainings' },
  { id: 'pkg',    label: '패키지 취약점',   api: '/api/governance/package-dashboard' },
  { id: 'vuln',   label: '취약점 가이드',   api: '/api/governance/vulnerability-guides/summary' },
  { id: 'backup', label: '백업 정책',       api: '/api/governance/backup/target-policies' },
];

export default class GovernanceDashboardPage {
  constructor({ params, query, router }) {
    this._router  = router;
    this._section = params.section || 'overview';
    this._el      = null;
  }

  async mount(container) {
    this._el = h('div', { className: 'spa-page' });
    container.appendChild(this._el);
    this._el.innerHTML = `
      <div class="spa-page-header">
        <button class="spa-btn spa-btn--ghost" data-action="back">← 거버넌스</button>
        <h1>거버넌스 대시보드</h1>
      </div>
      <div class="spa-kpi-grid" data-role="kpi"></div>
      <div class="spa-chart-grid" data-role="details"></div>`;

    this._el.querySelector('[data-action="back"]')
      .addEventListener('click', () => this._router.push('/spa/governance'));

    await this._loadDashboard();
  }

  async _loadDashboard() {
    const kpiArea = this._el.querySelector('[data-role="kpi"]');
    const detailArea = this._el.querySelector('[data-role="details"]');
    const results = {};

    await Promise.allSettled(DASHBOARD_SECTIONS.map(async (sec) => {
      try {
        const res = await api.get(sec.api);
        results[sec.id] = res;
      } catch { results[sec.id] = null; }
    }));

    /* KPI cards */
    const drData = results.dr;
    const drCount = Array.isArray(drData?.rows) ? drData.rows.length : (drData?.total || 0);
    const pkgData = results.pkg;
    const vulnData = results.vuln;
    const bkData = results.backup;
    const bkCount = Array.isArray(bkData?.rows) ? bkData.rows.length : (bkData?.total || 0);

    kpiArea.innerHTML = `
      <div class="spa-kpi-card">
        <div class="spa-kpi-card__value">${drCount}</div>
        <div class="spa-kpi-card__label">DR 훈련 건수</div>
      </div>
      <div class="spa-kpi-card">
        <div class="spa-kpi-card__value">${pkgData?.total_packages || 0}</div>
        <div class="spa-kpi-card__label">패키지 수</div>
      </div>
      <div class="spa-kpi-card">
        <div class="spa-kpi-card__value">${pkgData?.critical_count || vulnData?.total || 0}</div>
        <div class="spa-kpi-card__label">취약점 건수</div>
      </div>
      <div class="spa-kpi-card">
        <div class="spa-kpi-card__value">${bkCount}</div>
        <div class="spa-kpi-card__label">백업 정책 수</div>
      </div>`;

    /* Detail cards */
    detailArea.innerHTML = DASHBOARD_SECTIONS.map(sec => {
      const data = results[sec.id];
      const rows = data?.rows || [];
      const items = rows.slice(0, 5);
      return `<div class="spa-chart-card">
        <h4>${sec.label}</h4>
        ${items.length ? `<ul class="spa-simple-list">${items.map(r =>
          `<li>${esc(r.title || r.name || r.policy_name || r.guide_title || JSON.stringify(r).slice(0,60))}</li>`
        ).join('')}</ul>` : '<p class="spa-muted">데이터 없음</p>'}
        ${rows.length > 5 ? `<p class="spa-muted">외 ${rows.length - 5}건</p>` : ''}
      </div>`;
    }).join('');
  }

  unmount() { if (this._el) this._el.remove(); }
}

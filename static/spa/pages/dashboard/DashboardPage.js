/* ============================================================
 *  DashboardPage — 대시보드 (KPI + 차트 + 트렌드)
 *  ============================================================
 *  API: GET /api/dashboard/stats?range=1m
 *  응답: { kpi: {hardware, software, task, project, maintenance},
 *          charts: {hardware, software, task, project, maintenance} }
 * ============================================================ */

import { api }            from '../../shared/api-client.js';
import { esc }            from '../../shared/dom-utils.js';
import { fetchQuery }     from '../../shared/bq.js';
import { LoadingSpinner } from '../../widgets/LoadingSpinner.js';
import { MiniChart }      from '../../widgets/MiniChart.js';

const RANGES = [
  { key: '1w', label: '1주' },
  { key: '1m', label: '1개월' },
  { key: '3m', label: '3개월' },
  { key: '1y', label: '1년' },
];

export default class DashboardPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._range  = query.range || '1m';
    this._el     = null;
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">대시보드</h2>
          <div class="spa-scope-tabs" id="range-tabs">
            ${RANGES.map(r =>
              `<button class="spa-scope-tab${r.key === this._range ? ' active' : ''}" data-range="${r.key}">${r.label}</button>`
            ).join('')}
          </div>
        </div>
        <div id="dash-kpi" class="spa-dash-cards">${LoadingSpinner.renderInline()}</div>
        <div id="dash-charts" class="spa-dashboard-grid" style="margin-top:24px">${LoadingSpinner.renderInline()}</div>
      </div>`;

    this._el.querySelector('#range-tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-range]');
      if (btn && btn.dataset.range !== this._range) {
        this._range = btn.dataset.range;
        this._el.querySelectorAll('.spa-scope-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._router.updateQuery({ range: this._range });
        this._load();
      }
    });

    await this._load();
  }

  unmount() {}

  async _load() {
    const kpiArea   = this._el.querySelector('#dash-kpi');
    const chartArea = this._el.querySelector('#dash-charts');

    try {
      const res = await fetchQuery(
        ['dashboard', 'stats', this._range],
        () => api.get(`/api/dashboard/stats?range=${this._range}`, { showError: false })
      );

      if (!res || !res.kpi) {
        /* fallback: 구형 /api/dashboard/summary */
        const fallback = await api.get('/api/dashboard/summary', { showError: false });
        if (fallback.success && fallback.item) {
          this._renderBasicKpi(kpiArea, fallback.item);
          chartArea.innerHTML = '<p class="spa-text-muted">상세 통계 API 미지원 — 기본 KPI만 표시합니다.</p>';
        } else {
          kpiArea.innerHTML = '<p class="spa-text-muted">대시보드 데이터를 불러올 수 없습니다.</p>';
          chartArea.innerHTML = '';
        }
        return;
      }

      this._renderKpi(kpiArea, res.kpi);
      this._renderCharts(chartArea, res.charts || {});
    } catch (e) {
      kpiArea.innerHTML = '<p class="spa-text-muted">대시보드 데이터를 불러올 수 없습니다.</p>';
      chartArea.innerHTML = '';
    }
  }

  /* ── KPI Cards (상세) ── */
  _renderKpi(area, kpi) {
    const cards = [
      this._kpiCard('하드웨어', kpi.hardware, 'spa-kpi--blue',   '/hardware'),
      this._kpiCard('소프트웨어', kpi.software, 'spa-kpi--green', null),
      this._kpiCard('작업',     kpi.task,     'spa-kpi--purple', null),
      this._kpiCard('프로젝트', kpi.project,  'spa-kpi--orange', '/project'),
    ];

    if (kpi.maintenance) {
      cards.push(this._kpiCard('유지보수', {
        total: kpi.maintenance.count,
        current: kpi.maintenance.period_cost,
        label: kpi.maintenance.period_label,
      }, 'spa-kpi--teal', '/cost'));
    }

    area.innerHTML = cards.join('');

    /* KPI 클릭 시 네비게이션 */
    area.querySelectorAll('[data-nav]').forEach(el => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => this._router.navigate(el.dataset.nav));
    });
  }

  _kpiCard(label, data, cls, navPath) {
    if (!data) return '';
    const total   = data.total ?? 0;
    const current = data.current ?? null;
    const prev    = data.prev ?? null;
    const navAttr = navPath ? ` data-nav="${esc(navPath)}"` : '';

    let trend = '';
    if (current != null && prev != null && prev > 0) {
      const pct = ((current - prev) / prev * 100).toFixed(1);
      const dir = pct > 0 ? '↑' : pct < 0 ? '↓' : '→';
      const tcls = pct > 0 ? 'spa-kpi-trend--up' : pct < 0 ? 'spa-kpi-trend--down' : '';
      trend = `<span class="spa-kpi-trend ${tcls}">${dir} ${Math.abs(pct)}%</span>`;
    }

    return `<div class="spa-kpi ${cls}"${navAttr}>
      <div class="spa-kpi__value">${total.toLocaleString()}</div>
      <div class="spa-kpi__label">${esc(label)}</div>
      ${trend}
    </div>`;
  }

  /* ── 기본 KPI (fallback) ── */
  _renderBasicKpi(area, d) {
    area.innerHTML = [
      this._simpleKpi('서버',     d.server_count ?? 0,   'spa-kpi--blue',   '/hardware'),
      this._simpleKpi('네트워크', d.network_count ?? 0,  'spa-kpi--green',  '/network'),
      this._simpleKpi('프로젝트', d.project_count ?? 0,  'spa-kpi--purple', '/project'),
      this._simpleKpi('보안장비', d.security_count ?? 0, 'spa-kpi--orange', '/security'),
    ].join('');

    area.querySelectorAll('[data-nav]').forEach(el => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => this._router.navigate(el.dataset.nav));
    });
  }

  _simpleKpi(label, value, cls, nav) {
    return `<div class="spa-kpi ${cls}" data-nav="${esc(nav)}">
      <div class="spa-kpi__value">${esc(String(value))}</div>
      <div class="spa-kpi__label">${esc(label)}</div>
    </div>`;
  }

  /* ── Charts ── */
  _renderCharts(area, charts) {
    area.innerHTML = '';

    if (charts.hardware && charts.hardware.length) {
      const card = this._chartCard('자산 유형별 (HW)');
      area.appendChild(card);
      MiniChart.bar(card.querySelector('.spa-chart-body'), charts.hardware.map(d => ({
        label: d.label || d.key, value: d.value || 0
      })), { title: '' });
    }

    if (charts.software && charts.software.length) {
      const card = this._chartCard('소프트웨어 유형별');
      area.appendChild(card);
      MiniChart.donut(card.querySelector('.spa-chart-body'), charts.software.map(d => ({
        label: d.label || d.key, value: d.value || 0
      })), { title: '' });
    }

    if (charts.project && charts.project.length) {
      const card = this._chartCard('프로젝트 유형별');
      area.appendChild(card);
      MiniChart.donut(card.querySelector('.spa-chart-body'), charts.project.map(d => ({
        label: d.label || d.key, value: d.value || 0
      })), { title: '' });
    }

    if (charts.task) {
      const months = Object.keys(charts.task).sort();
      if (months.length > 0) {
        const card = this._chartCard('월별 작업 추이');
        area.appendChild(card);
        const totals = months.map(m => {
          const types = charts.task[m];
          return Object.values(types).reduce((s, v) => s + v, 0);
        });
        MiniChart.sparkline(card.querySelector('.spa-chart-body'), totals, {
          height: 64, label: `최근 ${months.length}개월`
        });
      }
    }

    if (charts.maintenance_by_type && charts.maintenance_by_type.length) {
      const card = this._chartCard('유지보수 유형별 비용');
      area.appendChild(card);
      MiniChart.bar(card.querySelector('.spa-chart-body'), charts.maintenance_by_type.map(d => ({
        label: d.label || d.key, value: d.cost || 0
      })), { title: '' });
    }

    if (area.children.length === 0) {
      area.innerHTML = '<p class="spa-text-muted">차트 데이터가 없습니다.</p>';
    }
  }

  _chartCard(title) {
    const card = document.createElement('div');
    card.className = 'spa-dash-card';
    card.innerHTML = `<h3>${esc(title)}</h3><div class="spa-chart-body"></div>`;
    return card;
  }
}

/* CostDashboardPage — CAPEX / OPEX 대시보드 */
import { api } from '../../shared/api-client.js';
import { esc } from '../../shared/dom-utils.js';

export default class CostDashboardPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._type = params.type || 'capex';  // 'capex'|'opex'
    this._el = null;
    this._data = null;
  }

  async mount(container) {
    this._el = container;
    await this._load();
  }

  unmount() {}

  async _load() {
    const endpoint = this._type === 'opex' ? '/api/opex-dashboard' : '/api/capex-dashboard';
    try {
      const res = await api.get(endpoint, { showError: false });
      this._data = res.item || res;
    } catch {
      this._data = null;
    }
    this._render();
  }

  _render() {
    const d = this._data || {};
    const kpis = d.kpis || d.summary || {};
    const charts = d.charts || {};
    const isCapex = this._type === 'capex';

    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <button class="spa-btn spa-btn--icon" id="btn-back">← 비용관리</button>
          <h2 class="spa-page__title">${isCapex ? 'CAPEX' : 'OPEX'} 대시보드</h2>
          <div class="spa-page-header__actions">
            <div class="spa-btn-group">
              <button class="spa-btn spa-btn--sm ${this._type === 'capex' ? 'spa-btn--primary' : 'spa-btn--outline'}" data-type="capex">CAPEX</button>
              <button class="spa-btn spa-btn--sm ${this._type === 'opex' ? 'spa-btn--primary' : 'spa-btn--outline'}" data-type="opex">OPEX</button>
            </div>
          </div>
        </div>

        <div class="spa-kpi-grid">
          ${this._renderKpi('총 계약수', kpis.total_contracts || kpis.count || 0, '건')}
          ${this._renderKpi('총 금액', this._formatMoney(kpis.total_amount || kpis.total || 0), '원')}
          ${this._renderKpi('진행중', kpis.active || kpis.in_progress || 0, '건')}
          ${this._renderKpi('만료예정', kpis.expiring || kpis.near_expiry || 0, '건')}
        </div>

        <div class="spa-chart-grid">
          ${this._renderChartCard('품목별 분포', charts.by_item || charts.by_category)}
          ${this._renderChartCard('공급업체별', charts.by_vendor || charts.by_supplier)}
          ${this._renderChartCard('월별 추이', charts.by_month || charts.monthly_trend)}
          ${this._renderChartCard('유형별', charts.by_type || charts.by_classification)}
        </div>

        ${d.recent ? `
        <h3 style="margin:2rem 0 1rem">최근 계약</h3>
        <div class="spa-admin-table-wrap">
          <table class="spa-dt-table">
            <thead><tr><th>계약명</th><th>금액</th><th>업체</th><th>시작</th><th>종료</th><th>상태</th></tr></thead>
            <tbody>${(d.recent||[]).map(r => `<tr class="spa-row-clickable" data-id="${r.id}">
              <td>${esc(r.contract_name||r.name||'')}</td>
              <td style="text-align:right">${this._formatMoney(r.amount||r.total_amount||0)}</td>
              <td>${esc(r.vendor||r.supplier||'')}</td>
              <td>${esc(r.start_date||'')}</td>
              <td>${esc(r.end_date||'')}</td>
              <td>${(() => {
                const st = r.status || '';
                const colors = { '진행중': '#2563eb', '완료': '#16a34a', '만료': '#9ca3af', '대기': '#f59e0b', 'active': '#16a34a', '진행': '#2563eb' };
                const c = colors[st];
                return c ? `<span class="spa-badge" style="background:${c};color:#fff">${esc(st)}</span>` : `<span class="spa-badge spa-badge--muted">${esc(st)}</span>`;
              })()}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>` : ''}
      </div>`;

    this._bind();
  }

  _renderKpi(label, value, unit) {
    return `<div class="spa-kpi-card">
      <div class="spa-kpi-card__value">${value}<small>${unit}</small></div>
      <div class="spa-kpi-card__label">${label}</div>
    </div>`;
  }

  _renderChartCard(title, data) {
    if (!data || !Array.isArray(data) || data.length === 0) {
      return `<div class="spa-chart-card">
        <h4>${esc(title)}</h4>
        <div class="spa-text-muted" style="padding:2rem;text-align:center">데이터 없음</div>
      </div>`;
    }
    const max = Math.max(...data.map(d => d.value || d.amount || d.count || 0));
    return `<div class="spa-chart-card">
      <h4>${esc(title)}</h4>
      <div class="spa-bar-chart">
        ${data.slice(0, 10).map(d => {
          const val = d.value || d.amount || d.count || 0;
          const pct = max > 0 ? (val / max * 100) : 0;
          return `<div class="spa-bar-row">
            <span class="spa-bar-label">${esc(d.label || d.name || d.key || '')}</span>
            <div class="spa-bar-track"><div class="spa-bar-fill" style="width:${pct}%"></div></div>
            <span class="spa-bar-value">${this._formatMoney(val)}</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  _formatMoney(n) {
    if (typeof n === 'string') n = parseFloat(n) || 0;
    if (n >= 100000000) return (n / 100000000).toFixed(1) + '억';
    if (n >= 10000) return (n / 10000).toFixed(0) + '만';
    return n.toLocaleString();
  }

  _bind() {
    this._el.querySelector('#btn-back')?.addEventListener('click', () => {
      this._router.navigate('/cost');
    });
    this._el.querySelectorAll('[data-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._type = btn.dataset.type;
        this._load();
      });
    });
    this._el.querySelectorAll('[data-id]').forEach(row => {
      row.addEventListener('click', () => {
        this._router.navigate(`/cost/${this._type}/${row.dataset.id}`);
      });
    });
  }
}

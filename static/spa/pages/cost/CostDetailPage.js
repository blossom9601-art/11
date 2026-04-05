/* CostDetailPage — 계약 상세 */

import { api }        from '../../shared/api-client.js';
import { esc }        from '../../shared/dom-utils.js';
import { LoadingSpinner, ErrorBoundary } from '../../widgets/LoadingSpinner.js';
import { fetchQuery } from '../../shared/bq.js';

export default class CostDetailPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._type   = params.type || 'opex';
    this._id     = params.id;
    this._el     = null;
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = LoadingSpinner.renderPage();
    await this._load();
  }

  unmount() {}

  async _load() {
    const apiBase = this._type === 'capex' ? '/api/capex-contracts' : '/api/opex-contracts';
    const res = await fetchQuery(
      ['cost', this._type, 'detail', this._id],
      () => api.get(`${apiBase}/${this._id}`, { showError: false })
    );

    if (!res || res.success === false || !res.item) {
      ErrorBoundary.mount(this._el, res?.error || '계약 정보를 찾을 수 없습니다.', () => this._load());
      return;
    }

    const c = res.item;
    this._el.innerHTML = `
      <div class="spa-page spa-detail-page">
        <div class="spa-page-header">
          <button class="spa-btn spa-btn--icon spa-back-btn" id="btn-back">← 목록</button>
          <h2 class="spa-page__title">${esc(c.contract_name || '계약 상세')}</h2>
        </div>

        <div class="spa-detail-summary">
          <div class="spa-summary-item">
            <span class="spa-summary-label">유형</span>
            <span class="spa-summary-value">${esc(this._type.toUpperCase())}</span>
          </div>
          <div class="spa-summary-item">
            <span class="spa-summary-label">공급업체</span>
            <span class="spa-summary-value">${esc(c.vendor_name || '-')}</span>
          </div>
          <div class="spa-summary-item">
            <span class="spa-summary-label">기간</span>
            <span class="spa-summary-value">${esc(c.start_date || '-')} ~ ${esc(c.end_date || '-')}</span>
          </div>
          <div class="spa-summary-item">
            <span class="spa-summary-label">총액</span>
            <span class="spa-summary-value">${c.total_amount != null ? Number(c.total_amount).toLocaleString() + ' 원' : '-'}</span>
          </div>
          <div class="spa-summary-item">
            <span class="spa-summary-label">상태</span>
            <span class="spa-summary-value">${esc(c.status || '-')}</span>
          </div>
        </div>

        <section class="spa-section" style="margin-top:24px">
          <h4 class="spa-section-title">계약 내역</h4>
          <div id="lines-area"><p class="spa-text-muted">계약 내역 로딩 중...</p></div>
        </section>
      </div>`;

    this._el.querySelector('#btn-back').addEventListener('click', () => {
      this._router.navigate('/cost/' + this._type);
    });

    /* 계약 품목 조회 */
    this._loadLines();
  }

  async _loadLines() {
    const res = await api.get(`/api/cost-contract-lines?contract_id=${this._id}&contract_type=${this._type}`, { showError: false });
    const items = res.items || [];
    const area = this._el.querySelector('#lines-area');
    if (items.length === 0) {
      area.innerHTML = '<p class="spa-text-muted">등록된 계약 내역이 없습니다.</p>';
      return;
    }
    const keys = Object.keys(items[0]).filter(k => !k.startsWith('_') && k !== 'deleted_at').slice(0, 8);
    const thead = keys.map(k => `<th>${esc(k)}</th>`).join('');
    const tbody = items.map(row => {
      const tds = keys.map(k => `<td>${esc(String(row[k] ?? ''))}</td>`).join('');
      return `<tr>${tds}</tr>`;
    }).join('');
    area.innerHTML = `<div style="overflow-x:auto"><table class="spa-dt-table" style="width:100%"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>`;
  }
}

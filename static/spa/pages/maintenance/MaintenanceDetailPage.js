/* MaintenanceDetailPage — 유지보수 계약 상세 */

import { api }    from '../../shared/api-client.js';
import { h, esc } from '../../shared/dom-utils.js';
import { LoadingSpinner } from '../../widgets/LoadingSpinner.js';

const TABS = [
  { id: 'info', label: '기본정보' },
  { id: 'items', label: '계약 품목' },
  { id: 'history', label: '이력' },
  { id: 'files', label: '첨부파일' },
];

export default class MaintenanceDetailPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._id     = params.id;
    this._tab    = query.tab || 'info';
    this._el     = null;
    this._data   = null;
  }

  async mount(container) {
    this._el = h('div', { className: 'spa-page' });
    container.appendChild(this._el);
    await this._load();
  }

  async _load() {
    this._el.innerHTML = '<div class="spa-loading"><div class="spa-spinner"></div></div>';
    try {
      const res = await api.get(`/api/opex-contracts/${this._id}`);
      this._data = res.item || res;
      this._render();
    } catch {
      this._el.innerHTML = '<p class="spa-empty">계약 정보를 불러올 수 없습니다.</p>';
    }
  }

  _render() {
    const d = this._data;
    this._el.innerHTML = `
      <div class="spa-page-header">
        <button class="spa-btn spa-btn--ghost" data-action="back">← 목록</button>
        <h1>${esc(d.contract_name || '계약 상세')}</h1>
      </div>
      <div class="spa-tab-bar" data-role="tabs">
        ${TABS.map(t => `
          <button class="spa-tab-btn ${this._tab === t.id ? 'spa-tab-btn--active' : ''}"
                  data-tab="${t.id}">${t.label}</button>
        `).join('')}
      </div>
      <div data-role="tab-content" class="spa-tab-content"></div>`;

    this._el.querySelector('[data-action="back"]')
      .addEventListener('click', () => this._router.push('/spa/maintenance'));
    this._el.querySelector('[data-role="tabs"]')
      .addEventListener('click', e => {
        const btn = e.target.closest('[data-tab]');
        if (btn) { this._tab = btn.dataset.tab; this._render(); }
      });

    this._renderTab();
  }

  _renderTab() {
    const area = this._el.querySelector('[data-role="tab-content"]');
    const d = this._data;
    switch (this._tab) {
      case 'info':
        area.innerHTML = `
          <div class="spa-detail-grid">
            <div class="spa-detail-field"><span class="spa-label">계약명</span><span>${esc(d.contract_name || '-')}</span></div>
            <div class="spa-detail-field"><span class="spa-label">공급업체</span><span>${esc(d.vendor_name || '-')}</span></div>
            <div class="spa-detail-field"><span class="spa-label">유형</span><span>${esc(d.type || '-')}</span></div>
            <div class="spa-detail-field"><span class="spa-label">시작일</span><span>${esc(d.start_date || '-')}</span></div>
            <div class="spa-detail-field"><span class="spa-label">종료일</span><span>${esc(d.end_date || '-')}</span></div>
            <div class="spa-detail-field"><span class="spa-label">금액</span><span>${d.total_amount != null ? Number(d.total_amount).toLocaleString() + ' 원' : '-'}</span></div>
            <div class="spa-detail-field"><span class="spa-label">상태</span><span>${esc(d.status || '-')}</span></div>
            <div class="spa-detail-field"><span class="spa-label">비고</span><span>${esc(d.note || '-')}</span></div>
          </div>`;
        break;
      case 'items':
        area.innerHTML = '<p class="spa-muted" style="padding:1rem">계약 품목 데이터를 불러오는 중…</p>';
        this._loadItems(area);
        break;
      case 'history':
        area.innerHTML = '<p class="spa-muted" style="padding:1rem">이력 데이터를 불러오는 중…</p>';
        this._loadHistory(area);
        break;
      case 'files':
        area.innerHTML = '<p class="spa-muted" style="padding:1rem">첨부파일이 없습니다.</p>';
        break;
    }
  }

  async _loadItems(area) {
    try {
      const res = await api.get(`/api/opex-contracts/${this._id}/items`);
      const items = res.rows || res.items || [];
      if (!items.length) { area.innerHTML = '<p class="spa-empty">등록된 품목이 없습니다.</p>'; return; }
      area.innerHTML = `<table class="spa-table"><thead><tr>
        <th>품목명</th><th>수량</th><th>단가</th><th>금액</th>
      </tr></thead><tbody>${items.map(i => `<tr>
        <td>${esc(i.item_name || '-')}</td>
        <td>${i.quantity || '-'}</td>
        <td>${i.unit_price != null ? Number(i.unit_price).toLocaleString() : '-'}</td>
        <td>${i.amount != null ? Number(i.amount).toLocaleString() + ' 원' : '-'}</td>
      </tr>`).join('')}</tbody></table>`;
    } catch { area.innerHTML = '<p class="spa-empty">품목 정보를 불러올 수 없습니다.</p>'; }
  }

  async _loadHistory(area) {
    try {
      const res = await api.get(`/api/opex-contracts/${this._id}/logs`);
      const logs = res.rows || res.logs || [];
      if (!logs.length) { area.innerHTML = '<p class="spa-empty">이력이 없습니다.</p>'; return; }
      area.innerHTML = `<table class="spa-table"><thead><tr>
        <th>일시</th><th>작업</th><th>작업자</th><th>내용</th>
      </tr></thead><tbody>${logs.map(l => `<tr>
        <td>${esc(l.created_at || '-')}</td>
        <td>${esc(l.action || '-')}</td>
        <td>${esc(l.actor_name || '-')}</td>
        <td>${esc(l.description || '-')}</td>
      </tr>`).join('')}</tbody></table>`;
    } catch { area.innerHTML = '<p class="spa-empty">이력을 불러올 수 없습니다.</p>'; }
  }

  unmount() { if (this._el) this._el.remove(); }
}

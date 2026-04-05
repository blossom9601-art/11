/* MaintenanceContractDetailPage — 유지보수 계약 상세 (담당자/자산/SLA/이슈 탭) */
import { api }            from '../../shared/api-client.js';
import { esc }            from '../../shared/dom-utils.js';
import { TabBar }         from '../../widgets/TabBar.js';
import { LoadingSpinner } from '../../widgets/LoadingSpinner.js';

const TABS = [
  { id: 'basic',   label: '기본정보' },
  { id: 'manager', label: '담당자' },
  { id: 'hw',      label: 'HW 자산' },
  { id: 'sw',      label: 'SW 자산' },
  { id: 'sla',     label: 'SLA' },
  { id: 'issue',   label: '이슈' },
];

export default class MaintenanceContractDetailPage {
  constructor({ params, query, router }) {
    this._router    = router;
    this._id        = params.id;
    this._activeTab = query.tab || 'basic';
    this._el        = null;
    this._tabBar    = null;
    this._item      = null;
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = LoadingSpinner.renderPage();
    try {
      const res = await api.get('/api/vendor-maintenance/' + this._id);
      this._item = res.item || res;
      this._render();
    } catch {
      this._el.innerHTML = '<div class="spa-page"><p class="spa-text-muted">계약 정보를 불러올 수 없습니다.</p></div>';
    }
  }

  unmount() { if (this._tabBar) this._tabBar.unmount(); }

  _render() {
    const t = this._item;
    this._el.innerHTML = `
      <div class="spa-page spa-detail-page">
        <div class="spa-page-header">
          <button class="spa-btn spa-btn--icon spa-back-btn" id="btn-back">← 목록</button>
          <h2 class="spa-page__title">${esc(t.maintenance_name || t.maintenance_code || '')}</h2>
        </div>
        <div id="tabs"></div>
        <div id="tab-content"></div>
      </div>`;
    this._el.querySelector('#btn-back').addEventListener('click', () => this._router.navigate('/maintenance/contract'));
    this._tabBar = new TabBar({ tabs: TABS, activeId: this._activeTab, onChange: (id) => this._loadTab(id) });
    this._tabBar.mount(this._el.querySelector('#tabs'));
    this._loadTab(this._activeTab);
  }

  async _loadTab(tabId) {
    this._activeTab = tabId;
    const content = this._el.querySelector('#tab-content');

    if (tabId === 'basic') {
      const fields = [
        ['계약코드', this._item.maintenance_code], ['계약명', this._item.maintenance_name],
        ['사업자번호', this._item.business_no], ['주소', this._item.address],
        ['콜센터', this._item.call_center], ['비고', this._item.remark],
      ];
      content.innerHTML = `<div class="spa-detail-grid">${fields.map(([l, v]) =>
        `<div class="spa-detail-field"><span class="spa-detail-field__label">${l}</span><span class="spa-detail-field__value">${esc(String(v || '-'))}</span></div>`
      ).join('')}</div>`;
      return;
    }

    const apiMap = {
      manager: `/api/vendor-maintenance/${this._id}/managers`,
      hw:      `/api/vendor-maintenance/${this._id}/hw-assets`,
      sw:      `/api/vendor-maintenance/${this._id}/sw-assets`,
      sla:     `/api/vendor-maintenance/${this._id}/sla`,
      issue:   `/api/vendor-maintenance/${this._id}/issues`,
    };
    content.innerHTML = '<p class="spa-text-muted">로딩 중...</p>';
    try {
      const res = await api.get(apiMap[tabId]);
      const items = res.items || res.rows || [];
      if (items.length === 0) { content.innerHTML = '<p class="spa-text-muted">데이터가 없습니다.</p>'; return; }
      const keys = Object.keys(items[0]).filter(k => !k.startsWith('_') && k !== 'deleted_at').slice(0, 7);
      const thead = keys.map(k => `<th>${esc(k)}</th>`).join('');
      const tbody = items.map(r => `<tr>${keys.map(k => `<td>${esc(String(r[k] ?? ''))}</td>`).join('')}</tr>`).join('');
      content.innerHTML = `<div class="spa-admin-table-wrap"><table class="spa-dt-table"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>`;
    } catch { content.innerHTML = '<p class="spa-text-muted">불러올 수 없습니다.</p>'; }
  }
}

/* CostCapexContractDetailPage — CAPEX 계약 상세 + 탭 */
import { api }              from '../../shared/api-client.js';
import { esc }              from '../../shared/dom-utils.js';
import { TabBar }           from '../../widgets/TabBar.js';
import { LoadingSpinner, ErrorBoundary } from '../../widgets/LoadingSpinner.js';
import { Toast }            from '../../widgets/Toast.js';
import { fetchQuery, invalidate } from '../../shared/bq.js';

const DETAIL_TABS = [
  { id: 'basic',    label: '기본 정보' },
  { id: 'contract', label: '계약 내역',  loader: () => import('./tabs/TabCostContract.js') },
  { id: 'log',      label: '변경 이력',  loader: () => import('./tabs/TabCostLog.js') },
  { id: 'file',     label: '첨부파일',   loader: () => import('./tabs/TabCostFile.js') },
];

export default class CostCapexContractDetailPage {
  constructor({ params, query, router }) {
    this._router = router; this._id = params.id; this._activeTab = query.tab || 'basic';
    this._apiBase = '/api/capex-contracts'; this._el = null; this._tabBar = null;
    this._tabCache = {}; this._item = null; this._tabContent = null;
  }

  async mount(c) { this._el = c; this._el.innerHTML = LoadingSpinner.renderPage(); await this._load(); }
  unmount() { const c = this._tabCache[this._activeTab]; if (c?.instance?.unmount) c.instance.unmount(); this._tabBar?.unmount(); }

  async _load() {
    const res = await fetchQuery(['cost', 'capex', 'detail', this._id],
      () => api.get(`${this._apiBase}/${this._id}`, { showError: false }));
    if (!res || (res.success === false && !res.item)) { ErrorBoundary.mount(this._el, res?.error || '계약 정보를 찾을 수 없습니다.', () => this._load()); return; }
    this._item = res.item || res; this._render(); if (this._activeTab !== 'basic') this._loadTab(this._activeTab);
  }

  _render() {
    const i = this._item;
    this._el.innerHTML = `
      <div class="spa-page spa-detail-page">
        <div class="spa-page-header">
          <button class="spa-btn spa-btn--icon spa-back-btn" id="btn-back">← 목록</button>
          <div class="spa-detail-title"><h2>${esc(i.contract_name || '')}</h2><span class="spa-badge">${esc(i.contract_status || '')}</span></div>
          <div class="spa-page-actions"><button class="spa-btn spa-btn--primary" id="btn-save">저장</button></div>
        </div>
        <div id="detail-tabbar"></div>
        <div class="spa-tab-content" id="detail-tab-content"></div>
      </div>`;
    this._tabBar = new TabBar({ tabs: DETAIL_TABS.map(t => ({ id: t.id, label: t.label })), activeTab: this._activeTab,
      onTabChange: id => this._switchTab(id) });
    this._tabBar.mount(this._el.querySelector('#detail-tabbar'));
    this._tabContent = this._el.querySelector('#detail-tab-content');
    this._el.querySelector('#btn-back').addEventListener('click', () => this._router.navigate('/cost/capex/contract'));
    this._el.querySelector('#btn-save').addEventListener('click', () => this._save());
    if (this._activeTab === 'basic') this._renderBasic();
  }

  _renderBasic() {
    const c = this._item;
    const fields = [
      ['계약명', c.contract_name], ['계약코드', c.contract_code],
      ['유형', c.capex_type], ['공급업체', c.vendor_name],
      ['상태', c.contract_status], ['시작일', c.maintenance_start_date],
      ['종료일', c.maintenance_end_date], ['금액', c.maintenance_amount],
      ['라이선스 수', c.total_license_count], ['활성 라이선스', c.active_license_count],
      ['메모', c.memo],
    ];
    this._tabContent.innerHTML = `<div class="spa-detail-summary">${fields.map(([l, v]) =>
      `<div class="spa-summary-item"><span class="spa-summary-label">${esc(l)}</span><span class="spa-summary-value">${esc(String(v ?? '-'))}</span></div>`
    ).join('')}</div>`;
  }

  async _switchTab(id) {
    const c = this._tabCache[this._activeTab]; if (c?.instance?.unmount) c.instance.unmount();
    this._activeTab = id; this._router.updateQuery({ tab: id });
    if (id === 'basic') { this._renderBasic(); return; }
    await this._loadTab(id);
  }

  async _loadTab(tabId) {
    const def = DETAIL_TABS.find(t => t.id === tabId); if (!def?.loader) return;
    this._tabContent.innerHTML = LoadingSpinner.renderInline();
    try {
      let c = this._tabCache[tabId];
      if (!c) { const mod = await def.loader(); const Cls = mod.default || mod[Object.keys(mod)[0]];
        c = { instance: new Cls({ itemId: this._id, item: this._item, apiBase: this._apiBase, router: this._router }) };
        this._tabCache[tabId] = c; }
      this._tabContent.innerHTML = ''; c.instance.mount(this._tabContent);
    } catch (e) { console.error(e); ErrorBoundary.mount(this._tabContent, '탭 로드 실패', () => this._loadTab(tabId)); }
  }

  async _save() {
    const c = this._tabCache[this._activeTab];
    if (c?.instance?.save) { const ok = await c.instance.save(); if (ok) { Toast.success('저장 완료'); invalidate(['cost','capex','detail',this._id]); } }
  }
}

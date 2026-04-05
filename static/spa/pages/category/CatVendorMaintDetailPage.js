/* CatVendorMaintDetailPage — 유지보수 업체 상세 */
import { api }           from '../../shared/api-client.js';
import { h, esc }        from '../../shared/dom-utils.js';
import { TabBar }        from '../../widgets/TabBar.js';
import { LoadingSpinner } from '../../widgets/LoadingSpinner.js';
import { Toast }         from '../../widgets/Toast.js';

const API_BASE = '/api/vendor-maintenance';

const TABS = [
  { key: 'basic',     label: '기본정보' },
  { key: 'manager',   label: '담당자' },
  { key: 'hardware',  label: 'HW자산' },
  { key: 'software',  label: 'SW관리' },
  { key: 'sla',       label: 'SLA' },
  { key: 'issue',     label: '이슈' },
  { key: 'task',      label: '작업이력' },
  { key: 'log',       label: '변경이력' },
  { key: 'file',      label: '첨부파일' },
];

export default class CatVendorMaintDetailPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._id     = params.id;
    this._el     = null;
    this._data   = null;
    this._tabBar = null;
    this._tabEl  = null;
    this._tabMod = null;
    this._activeTab = 'basic';
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = '<div class="spa-page"><div id="loading"></div></div>';
    const spinner = new LoadingSpinner();
    spinner.mount(this._el.querySelector('#loading'));
    try {
      const res = await api.get(`${API_BASE}/${this._id}`);
      this._data = res.item || res;
    } catch { this._data = {}; }
    spinner.unmount();
    this._render();
  }

  _render() {
    const d = this._data;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">${esc(d.vendor_name || '유지보수업체 상세')}</h2>
          <button class="spa-btn spa-btn--secondary" data-back>← 목록</button>
        </div>
        <div id="tab-bar"></div>
        <div id="tab-panel" class="spa-detail-tab-panel"></div>
      </div>`;
    this._el.querySelector('[data-back]').onclick = () => this._router.navigate('/category/vendor/maintenance');
    this._tabBar = new TabBar({ tabs: TABS, active: this._activeTab, onChange: key => this._switchTab(key) });
    this._tabBar.mount(this._el.querySelector('#tab-bar'));
    this._tabEl = this._el.querySelector('#tab-panel');
    this._switchTab(this._activeTab);
  }

  async _switchTab(key) {
    this._activeTab = key;
    if (this._tabMod && this._tabMod.unmount) this._tabMod.unmount();
    this._tabMod = null;
    if (key === 'basic') { this._renderBasic(); return; }
    const loaders = {
      manager:  () => import('./tabs/TabCatManager.js'),
      hardware: () => import('./tabs/TabCatHardware.js'),
      software: () => import('./tabs/TabCatSoftware.js'),
      sla:      () => import('./tabs/TabVendorSla.js'),
      issue:    () => import('./tabs/TabVendorIssue.js'),
      task:     () => import('./tabs/TabCatTask.js'),
      log:      () => import('./tabs/TabCatLog.js'),
      file:     () => import('./tabs/TabCatFile.js'),
    };
    if (!loaders[key]) return;
    const mod = await loaders[key]();
    const Cls = mod.default;
    this._tabMod = new Cls({ assetId: this._id, asset: this._data, apiBase: API_BASE, router: this._router });
    this._tabMod.mount(this._tabEl);
  }

  _renderBasic() {
    const d = this._data;
    const field = (l, v) => `<div class="spa-detail-field"><span class="spa-detail-field__label">${l}</span><span class="spa-detail-field__value">${esc(v ?? '')}</span></div>`;
    this._tabEl.innerHTML = `<div class="spa-detail-grid">
      ${field('업체명', d.vendor_name)}${field('업체코드', d.vendor_code)}
      ${field('서비스유형', d.service_type)}${field('연락처', d.contact)}
      ${field('주소', d.address)}${field('계약시작', d.contract_start)}
      ${field('계약종료', d.contract_end)}${field('상태', d.status)}
      ${field('비고', d.note)}
    </div>`;
  }

  unmount() { if (this._tabMod && this._tabMod.unmount) this._tabMod.unmount(); }
}

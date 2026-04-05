/* StorageDetailPage — 스토리지 상세 (SAN Storage, Backup/PTL) */
import { api }              from '../../shared/api-client.js';
import { esc }              from '../../shared/dom-utils.js';
import { TabBar }           from '../../widgets/TabBar.js';
import { LoadingSpinner, ErrorBoundary } from '../../widgets/LoadingSpinner.js';
import { Toast }            from '../../widgets/Toast.js';
import { fetchQuery, invalidate } from '../../shared/bq.js';

const TYPE_API = {
  'san-storage':    '/api/hardware/storage/assets',
  'backup-storage': '/api/hardware/storage/backup/assets',
};

const DETAIL_TABS = [
  { id: '31', label: '스토리지 기본', loader: () => import('./tabs/Tab31BasicStorage.js') },
  { id: '32', label: '스토리지 할당', loader: () => import('./tabs/Tab32AssignStorage.js') },
  { id: '01', label: '하드웨어',     loader: () => import('./tabs/Tab01Hardware.js') },
  { id: '04', label: '인터페이스',   loader: () => import('./tabs/Tab05Account.js') },
  { id: '05', label: '계정관리',     loader: () => import('./tabs/Tab06Security.js') },
  { id: '11', label: '작업이력',     loader: () => import('./tabs/Tab11Monitoring.js') },
  { id: '12', label: '취약점',       loader: () => import('./tabs/Tab12Virtualization.js') },
  { id: '13', label: '패키지',       loader: () => import('./tabs/Tab13Performance.js') },
  { id: '14', label: '변경이력',     loader: () => import('./tabs/Tab14Log.js') },
  { id: '15', label: '구성/파일',    loader: () => import('./tabs/Tab15File.js') },
];

export default class StorageDetailPage {
  constructor({ params, query, router }) {
    this._router    = router;
    this._type      = params.subtype || params.type || 'san-storage';
    this._id        = params.id;
    this._activeTab = query.tab || '31';
    this._apiBase   = TYPE_API[this._type] || TYPE_API['san-storage'];
    this._el = null; this._tabBar = null; this._tabCache = {}; this._asset = null; this._tabContent = null;
  }

  async mount(c) {
    this._el = c;
    this._el.innerHTML = LoadingSpinner.renderPage();
    await this._fetchBasic();
  }

  unmount() {
    const c = this._tabCache[this._activeTab];
    if (c?.instance?.unmount) c.instance.unmount();
    this._tabBar?.unmount();
  }

  async _fetchBasic() {
    const res = await fetchQuery(['storage', this._type, 'detail', this._id],
      () => api.get(`${this._apiBase}/${this._id}`, { showError: false }));
    if (!res?.item) { ErrorBoundary.mount(this._el, res?.error || '스토리지 정보를 찾을 수 없습니다.', () => this._fetchBasic()); return; }
    this._asset = res.item;
    this._render();
    this._loadTab(this._activeTab);
  }

  _render() {
    const a = this._asset;
    this._el.innerHTML = `
      <div class="spa-page spa-detail-page">
        <div class="spa-page-header">
          <button class="spa-btn spa-btn--icon spa-back-btn" id="btn-back">← 목록</button>
          <div class="spa-detail-title">
            <h2>${esc(a.system_name || a.work_name || a.asset_code || '')}</h2>
            <span class="spa-badge"${a.work_status_color ? ` style="background:${esc(a.work_status_color)};color:#fff"` : ''}>${esc(a.work_status_name || '')}</span>
          </div>
          <div class="spa-page-actions"><button class="spa-btn spa-btn--primary" id="btn-save">저장</button></div>
        </div>
        <div class="spa-detail-summary">
          <div class="spa-summary-item"><span class="spa-summary-label">업무명</span><span class="spa-summary-value">${esc(a.work_name || '-')}</span></div>
          <div class="spa-summary-item"><span class="spa-summary-label">시스템 IP</span><span class="spa-summary-value">${esc(a.system_ip || '-')}</span></div>
          <div class="spa-summary-item"><span class="spa-summary-label">제조사/모델</span><span class="spa-summary-value">${esc(a.manufacturer_name || '-')} / ${esc(a.model_name || '-')}</span></div>
          <div class="spa-summary-item"><span class="spa-summary-label">담당자</span><span class="spa-summary-value">${esc(a.system_owner_display || '-')}</span></div>
        </div>
        <div id="detail-tabbar"></div>
        <div class="spa-tab-content" id="detail-tab-content"></div>
      </div>`;
    this._tabBar = new TabBar({ tabs: DETAIL_TABS.map(t => ({ id: t.id, label: t.label })), activeTab: this._activeTab,
      onTabChange: id => this._switchTab(id) });
    this._tabBar.mount(this._el.querySelector('#detail-tabbar'));
    this._tabContent = this._el.querySelector('#detail-tab-content');
    this._el.querySelector('#btn-back').addEventListener('click', () => this._router.navigate(`/hardware/storage/${this._type}`));
    this._el.querySelector('#btn-save').addEventListener('click', () => this._save());
  }

  async _switchTab(id) {
    const c = this._tabCache[this._activeTab];
    if (c?.instance?.unmount) c.instance.unmount();
    this._activeTab = id;
    this._router.updateQuery({ tab: id });
    await this._loadTab(id);
  }

  async _loadTab(tabId) {
    const def = DETAIL_TABS.find(t => t.id === tabId);
    if (!def) return;
    this._tabContent.innerHTML = LoadingSpinner.renderInline();
    try {
      let c = this._tabCache[tabId];
      if (!c) {
        const mod = await def.loader();
        const Cls = mod.default || mod[Object.keys(mod)[0]];
        c = { instance: new Cls({ assetId: this._id, assetType: this._type, asset: this._asset, apiBase: this._apiBase, router: this._router }) };
        this._tabCache[tabId] = c;
      }
      this._tabContent.innerHTML = '';
      c.instance.mount(this._tabContent);
    } catch (e) { console.error(e); ErrorBoundary.mount(this._tabContent, '탭 로드 실패', () => this._loadTab(tabId)); }
  }

  async _save() {
    const c = this._tabCache[this._activeTab];
    if (c?.instance?.save) { const ok = await c.instance.save(); if (ok) { Toast.success('저장 완료'); invalidate(['storage', this._type, 'detail', this._id]); } }
  }
}

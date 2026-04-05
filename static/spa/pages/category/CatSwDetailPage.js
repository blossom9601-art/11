/* CatSwDetailPage — SW 카탈로그 상세 (OS/DB/MW/가상화/보안/HA 등) + 탭 */
import { api }              from '../../shared/api-client.js';
import { esc }              from '../../shared/dom-utils.js';
import { TabBar }           from '../../widgets/TabBar.js';
import { LoadingSpinner, ErrorBoundary } from '../../widgets/LoadingSpinner.js';
import { Toast }            from '../../widgets/Toast.js';
import { fetchQuery, invalidate } from '../../shared/bq.js';

const TYPE_API = {
  os:       '/api/sw-os-types',
  database: '/api/sw-database-types',
  middleware: '/api/sw-middleware-types',
  virtualization: '/api/sw-virtualization-types',
  security: '/api/sw-security-types',
  ha:       '/api/sw-ha-types',
};

const TYPE_LABELS = {
  os: 'OS', database: '데이터베이스', middleware: '미들웨어',
  virtualization: '가상화', security: '보안 SW', ha: '고가용성',
};

const DETAIL_TABS = [
  { id: 'basic',    label: '기본 정보' },
  { id: 'system',   label: '설치 시스템', loader: () => import('./tabs/TabCatSoftware.js') },
  { id: 'task',     label: '작업이력',   loader: () => import('./tabs/TabCatTask.js') },
  { id: 'log',      label: '변경이력',   loader: () => import('./tabs/TabCatLog.js') },
  { id: 'file',     label: '첨부파일',   loader: () => import('./tabs/TabCatFile.js') },
];

export default class CatSwDetailPage {
  constructor({ params, query, router }) {
    this._router = router; this._swType = params.swType || 'os'; this._id = params.id;
    this._activeTab = query.tab || 'basic';
    this._apiBase = TYPE_API[this._swType] || TYPE_API.os;
    this._el = null; this._tabBar = null; this._tabCache = {}; this._item = null; this._tabContent = null;
  }

  async mount(c) { this._el = c; this._el.innerHTML = LoadingSpinner.renderPage(); await this._load(); }
  unmount() { const c = this._tabCache[this._activeTab]; if (c?.instance?.unmount) c.instance.unmount(); this._tabBar?.unmount(); }

  async _load() {
    const res = await fetchQuery(['category', 'sw', this._swType, 'detail', this._id],
      () => api.get(`${this._apiBase}/${this._id}`, { showError: false }));
    if (!res || (res.success === false && !res.item)) { ErrorBoundary.mount(this._el, res?.error || 'SW 정보를 찾을 수 없습니다.', () => this._load()); return; }
    this._item = res.item || res; this._render(); if (this._activeTab !== 'basic') this._loadTab(this._activeTab);
  }

  _render() {
    const i = this._item;
    this._el.innerHTML = `
      <div class="spa-page spa-detail-page">
        <div class="spa-page-header">
          <button class="spa-btn spa-btn--icon spa-back-btn" id="btn-back">← 목록</button>
          <div class="spa-detail-title"><h2>${esc(TYPE_LABELS[this._swType] || 'SW')} — ${esc(i.name || i.type_name || '')}</h2></div>
          <div class="spa-page-actions"><button class="spa-btn spa-btn--primary" id="btn-save">저장</button></div>
        </div>
        <div id="detail-tabbar"></div>
        <div class="spa-tab-content" id="detail-tab-content"></div>
      </div>`;
    this._tabBar = new TabBar({ tabs: DETAIL_TABS.map(t => ({ id: t.id, label: t.label })), activeTab: this._activeTab,
      onTabChange: id => this._switchTab(id) });
    this._tabBar.mount(this._el.querySelector('#detail-tabbar'));
    this._tabContent = this._el.querySelector('#detail-tab-content');
    this._el.querySelector('#btn-back').addEventListener('click', () => this._router.navigate('/category/software'));
    this._el.querySelector('#btn-save').addEventListener('click', () => this._save());
    if (this._activeTab === 'basic') this._renderBasic();
  }

  _renderBasic() {
    const i = this._item;
    const keys = Object.keys(i).filter(k => !k.startsWith('_') && !['id','created_at','updated_at','deleted_at','is_deleted'].includes(k));
    this._tabContent.innerHTML = `<div class="spa-detail-summary">${keys.map(k =>
      `<div class="spa-summary-item"><span class="spa-summary-label">${esc(k)}</span><span class="spa-summary-value">${esc(String(i[k] ?? '-'))}</span></div>`
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
        c = { instance: new Cls({ itemId: this._id, item: this._item, apiBase: this._apiBase, softwareApiSuffix: 'systems' }) };
        this._tabCache[tabId] = c; }
      this._tabContent.innerHTML = ''; c.instance.mount(this._tabContent);
    } catch (e) { console.error(e); ErrorBoundary.mount(this._tabContent, '탭 로드 실패', () => this._loadTab(tabId)); }
  }

  async _save() {
    const c = this._tabCache[this._activeTab];
    if (c?.instance?.save) { const ok = await c.instance.save(); if (ok) { Toast.success('저장 완료'); invalidate(['category','sw',this._swType,'detail',this._id]); } }
  }
}

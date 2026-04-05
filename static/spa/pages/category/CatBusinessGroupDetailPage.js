/* CatBusinessGroupDetailPage — 업무 그룹 상세 + 탭 (담당자/시스템/서비스/작업/이력/파일) */
import { api }              from '../../shared/api-client.js';
import { esc }              from '../../shared/dom-utils.js';
import { TabBar }           from '../../widgets/TabBar.js';
import { LoadingSpinner, ErrorBoundary } from '../../widgets/LoadingSpinner.js';
import { Toast }            from '../../widgets/Toast.js';
import { fetchQuery, invalidate } from '../../shared/bq.js';

const API_BASE = '/api/work-groups';

const DETAIL_TABS = [
  { id: 'basic',    label: '기본 정보' },
  { id: 'manager',  label: '담당자',     loader: () => import('./tabs/TabCatManager.js') },
  { id: 'system',   label: '시스템',     loader: () => import('./tabs/TabCatSystem.js') },
  { id: 'service',  label: '서비스',     loader: () => import('./tabs/TabCatService.js') },
  { id: 'task',     label: '작업이력',   loader: () => import('./tabs/TabCatTask.js') },
  { id: 'log',      label: '변경이력',   loader: () => import('./tabs/TabCatLog.js') },
  { id: 'file',     label: '첨부파일',   loader: () => import('./tabs/TabCatFile.js') },
];

export default class CatBusinessGroupDetailPage {
  constructor({ params, query, router }) {
    this._router = router; this._id = params.id; this._activeTab = query.tab || 'basic';
    this._el = null; this._tabBar = null; this._tabCache = {}; this._item = null; this._tabContent = null;
  }

  async mount(c) { this._el = c; this._el.innerHTML = LoadingSpinner.renderPage(); await this._load(); }
  unmount() { const c = this._tabCache[this._activeTab]; if (c?.instance?.unmount) c.instance.unmount(); this._tabBar?.unmount(); }

  async _load() {
    const res = await fetchQuery(['category', 'business-group', 'detail', this._id],
      () => api.get(`${API_BASE}/${this._id}`, { showError: false }));
    if (!res?.item && res?.success === false) { ErrorBoundary.mount(this._el, res?.error || '업무 그룹 정보를 찾을 수 없습니다.', () => this._load()); return; }
    this._item = res.item || res; this._render(); if (this._activeTab !== 'basic') this._loadTab(this._activeTab);
  }

  _render() {
    const i = this._item;
    this._el.innerHTML = `
      <div class="spa-page spa-detail-page">
        <div class="spa-page-header">
          <button class="spa-btn spa-btn--icon spa-back-btn" id="btn-back">← 목록</button>
          <div class="spa-detail-title"><h2>${esc(i.group_name || i.name || '')}</h2></div>
          <div class="spa-page-actions"><button class="spa-btn spa-btn--primary" id="btn-save">저장</button></div>
        </div>
        <div id="detail-tabbar"></div>
        <div class="spa-tab-content" id="detail-tab-content"></div>
      </div>`;
    this._tabBar = new TabBar({ tabs: DETAIL_TABS.map(t => ({ id: t.id, label: t.label })), activeTab: this._activeTab,
      onTabChange: id => this._switchTab(id) });
    this._tabBar.mount(this._el.querySelector('#detail-tabbar'));
    this._tabContent = this._el.querySelector('#detail-tab-content');
    this._el.querySelector('#btn-back').addEventListener('click', () => this._router.navigate('/category/business/group'));
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
        c = { instance: new Cls({ itemId: this._id, item: this._item, apiBase: API_BASE }) };
        this._tabCache[tabId] = c; }
      this._tabContent.innerHTML = ''; c.instance.mount(this._tabContent);
    } catch (e) { console.error(e); ErrorBoundary.mount(this._tabContent, '탭 로드 실패', () => this._loadTab(tabId)); }
  }

  async _save() {
    const c = this._tabCache[this._activeTab];
    if (c?.instance?.save) { const ok = await c.instance.save(); if (ok) { Toast.success('저장 완료'); invalidate(['category','business-group','detail',this._id]); } }
  }
}

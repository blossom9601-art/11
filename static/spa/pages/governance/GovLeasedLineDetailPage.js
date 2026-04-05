/* GovLeasedLineDetailPage — 전용회선 상세 (기본정보 + 담당자/작업/로그/파일 탭) */
import { api }              from '../../shared/api-client.js';
import { esc }              from '../../shared/dom-utils.js';
import { TabBar }           from '../../widgets/TabBar.js';
import { LoadingSpinner }   from '../../widgets/LoadingSpinner.js';
import { Toast }            from '../../widgets/Toast.js';
import { DataTable }        from '../../widgets/DataTable.js';

const TABS = [
  { id: 'basic',    label: '기본정보' },
  { id: 'manager',  label: '담당자' },
  { id: 'task',     label: '작업이력' },
  { id: 'log',      label: '변경이력' },
  { id: 'file',     label: '첨부파일' },
];

export default class GovLeasedLineDetailPage {
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
      const res = await api.get('/api/network/leased-lines/' + this._id);
      this._item = res.item || res;
      this._render();
    } catch {
      this._el.innerHTML = '<div class="spa-page"><p class="spa-text-muted">회선 정보를 불러올 수 없습니다.</p></div>';
    }
  }

  unmount() { if (this._tabBar) this._tabBar.unmount(); }

  _render() {
    const t = this._item;
    this._el.innerHTML = `
      <div class="spa-page spa-detail-page">
        <div class="spa-page-header">
          <button class="spa-btn spa-btn--icon spa-back-btn" id="btn-back">← 목록</button>
          <h2 class="spa-page__title">${esc(t.line_name || t.line_no || '')}</h2>
          <span class="spa-badge">${esc(t.status_code || '')}</span>
        </div>
        <div id="tabs"></div>
        <div id="tab-content"></div>
      </div>`;

    this._el.querySelector('#btn-back').addEventListener('click', () => this._router.navigate('/governance/leased-line'));

    this._tabBar = new TabBar({ tabs: TABS, activeId: this._activeTab, onChange: (id) => this._loadTab(id) });
    this._tabBar.mount(this._el.querySelector('#tabs'));
    this._loadTab(this._activeTab);
  }

  async _loadTab(tabId) {
    this._activeTab = tabId;
    const content = this._el.querySelector('#tab-content');

    if (tabId === 'basic') {
      const fields = [
        ['회선번호', this._item.line_no], ['회선명', this._item.line_name],
        ['기관명', this._item.org_name], ['통신사', this._item.carrier_code],
        ['속도', this._item.speed_label], ['상태', this._item.status_code],
        ['용도', this._item.business_purpose], ['개통일', this._item.opened_date],
        ['해지일', this._item.closed_date], ['비고', this._item.remark],
      ];
      content.innerHTML = `<div class="spa-detail-grid">${fields.map(([l, v]) =>
        `<div class="spa-detail-field"><span class="spa-detail-field__label">${l}</span><span class="spa-detail-field__value">${esc(String(v || '-'))}</span></div>`
      ).join('')}</div>`;
      return;
    }

    const apiMap = {
      manager: '/api/network/leased-lines/' + this._id + '/managers',
      task:    '/api/network/leased-lines/' + this._id + '/tasks',
      log:     '/api/network/leased-lines/' + this._id + '/logs',
      file:    '/api/network/leased-lines/' + this._id + '/attachments',
    };
    content.innerHTML = '<p class="spa-text-muted">로딩 중...</p>';
    try {
      const res = await api.get(apiMap[tabId]);
      const items = res.items || res.rows || [];
      if (items.length === 0) {
        content.innerHTML = '<p class="spa-text-muted">데이터가 없습니다.</p>';
        return;
      }
      const keys = Object.keys(items[0]).filter(k => !k.startsWith('_') && k !== 'deleted_at').slice(0, 6);
      const thead = keys.map(k => `<th>${esc(k)}</th>`).join('');
      const tbody = items.map(r => `<tr>${keys.map(k => `<td>${esc(String(r[k] ?? ''))}</td>`).join('')}</tr>`).join('');
      content.innerHTML = `<div class="spa-admin-table-wrap"><table class="spa-dt-table"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>`;
    } catch { content.innerHTML = '<p class="spa-text-muted">데이터를 불러올 수 없습니다.</p>'; }
  }
}

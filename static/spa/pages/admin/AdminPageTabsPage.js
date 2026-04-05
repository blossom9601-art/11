/* AdminPageTabsPage — 페이지 탭 관리 */
import { api } from '../../shared/api-client.js';
import { esc } from '../../shared/dom-utils.js';

export default class AdminPageTabsPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el = null;
    this._tabs = [];
    this._filterPage = '';
  }

  async mount(container) {
    this._el = container;
    await this._load();
  }

  unmount() {}

  async _load() {
    const res = await api.get('/api/page-tabs/all', { showError: false });
    this._tabs = res.items || res.rows || res.tabs || [];
    this._render();
  }

  _filtered() {
    if (!this._filterPage) return this._tabs;
    return this._tabs.filter(t => (t.page_code || '').includes(this._filterPage));
  }

  _render() {
    const pages = [...new Set(this._tabs.map(t => t.page_code).filter(Boolean))].sort();
    const rows = this._filtered();

    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">페이지 탭 관리 (${this._tabs.length})</h2>
          <select class="spa-input" id="adm-tab-filter" style="width:180px">
            <option value="">전체 페이지</option>
            ${pages.map(p => `<option value="${esc(p)}" ${p === this._filterPage ? 'selected' : ''}>${esc(p)}</option>`).join('')}
          </select>
        </div>
        <div class="spa-admin-table-wrap">
          <table class="spa-dt-table">
            <thead><tr><th>페이지</th><th>탭 코드</th><th>탭 이름</th><th>순서</th><th>활성</th><th>작업</th></tr></thead>
            <tbody>
              ${rows.length === 0 ? '<tr><td colspan="6" class="spa-text-muted" style="text-align:center">탭이 없습니다.</td></tr>' :
                rows.map(t => `<tr>
                  <td>${esc(t.page_code || '')}</td>
                  <td>${esc(t.tab_code || '')}</td>
                  <td>${esc(t.tab_name || '')}</td>
                  <td>${t.tab_order ?? ''}</td>
                  <td>${t.is_active ? '<span class="spa-badge spa-badge--success">활성</span>' : '<span class="spa-badge spa-badge--muted">비활성</span>'}</td>
                  <td><button class="spa-btn spa-btn--sm spa-btn--outline" data-toggle-tab="${t.id}">토글</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;

    this._el.querySelector('#adm-tab-filter').addEventListener('change', (e) => {
      this._filterPage = e.target.value;
      this._render();
    });
    this._el.querySelectorAll('[data-toggle-tab]').forEach(btn => {
      btn.addEventListener('click', () => this._toggleTab(parseInt(btn.dataset.toggleTab)));
    });
  }

  async _toggleTab(id) {
    await api.put(`/api/page-tabs/${id}/toggle`);
    await this._load();
  }
}

/* PrivacyPage — 개인정보 처리방침 */

import { api }    from '../../shared/api-client.js';
import { h, esc } from '../../shared/dom-utils.js';

export default class PrivacyPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el = null;
  }

  async mount(container) {
    this._el = h('div', { className: 'spa-page' });
    container.appendChild(this._el);
    this._el.innerHTML = `
      <div class="spa-page-header"><h1>개인정보 처리방침</h1></div>
      <div class="spa-card" style="padding:2rem;" data-role="content">
        <div class="spa-loading"><div class="spa-spinner"></div></div>
      </div>`;
    await this._load();
  }

  async _load() {
    const area = this._el.querySelector('[data-role="content"]');
    try {
      const res = await api.get('/api/auth/terms-content');
      area.innerHTML = `<div class="spa-content-body">${res.content || '개인정보 처리방침 내용이 없습니다.'}</div>`;
    } catch {
      area.innerHTML = '<p class="spa-empty">개인정보 처리방침을 불러올 수 없습니다.</p>';
    }
  }

  unmount() { if (this._el) this._el.remove(); }
}

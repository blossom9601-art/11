/* NotificationPage — 알림 목록 */
import { api } from '../../shared/api-client.js';
import { esc } from '../../shared/dom-utils.js';

export default class NotificationPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el = null;
    this._items = [];
  }

  async mount(container) {
    this._el = container;
    await this._load();
  }

  unmount() {}

  async _load() {
    try {
      const res = await api.get('/api/notifications', { showError: false });
      this._items = res.items || res.rows || [];
    } catch {
      this._items = [];
    }
    this._render();
  }

  _render() {
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">알림</h2>
          <div class="spa-page-header__actions">
            <button class="spa-btn spa-btn--outline spa-btn--sm" id="notif-read-all">모두 읽음</button>
          </div>
        </div>

        ${this._items.length === 0 ? '<div class="spa-empty">새로운 알림이 없습니다.</div>' :
          `<div class="spa-notification-list">
            ${this._items.map(n => `
              <div class="spa-notification-item ${n.is_read ? '' : 'spa-notification-item--unread'}" data-id="${n.id}">
                <div class="spa-notification-item__icon">${n.type === 'warning' ? '⚠️' : n.type === 'error' ? '🔴' : 'ℹ️'}</div>
                <div class="spa-notification-item__body">
                  <div class="spa-notification-item__title">${esc(n.title||n.message||'')}</div>
                  <div class="spa-notification-item__time spa-text-muted">${esc(n.created_at||'')}</div>
                </div>
              </div>`).join('')}
          </div>`}
      </div>`;

    this._el.querySelector('#notif-read-all')?.addEventListener('click', async () => {
      try {
        await api.post('/api/notifications/read-all', {});
        await this._load();
      } catch { /* handled */ }
    });
  }
}

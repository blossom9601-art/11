/* ============================================================
 *  OfflineBar — 네트워크 단절/복구 배너
 *  ============================================================
 *  AppStore 의 network.online 상태에 반응하여 화면 상단에 배너 표시.
 *  app.js 에서 한 번만 마운트.
 * ============================================================ */

import { AppStore } from '../shared/app-store.js';

export class OfflineBar {
  constructor() {
    this._el = null;
    this._unsub = null;
  }

  mount(parentEl) {
    this._el = document.createElement('div');
    this._el.className = 'spa-offline-bar';
    this._el.setAttribute('role', 'alert');
    this._el.setAttribute('aria-live', 'assertive');
    this._el.innerHTML = '<span class="spa-offline-bar__icon">⚡</span> 네트워크 연결이 끊어졌습니다. 일부 기능이 제한될 수 있습니다.';
    this._el.hidden = true;
    parentEl.prepend(this._el);

    this._unsub = AppStore.subscribe('network', (state) => {
      const online = state ? state.online !== false : true;
      this._el.hidden = online;
      if (!online) {
        this._el.classList.add('spa-offline-bar--show');
      } else {
        this._el.classList.remove('spa-offline-bar--show');
      }
    });

    /* 초기 상태 반영 */
    const net = AppStore.get('network');
    if (net && net.online === false) {
      this._el.hidden = false;
      this._el.classList.add('spa-offline-bar--show');
    }
  }

  unmount() {
    if (this._unsub) this._unsub();
    if (this._el && this._el.parentNode) this._el.parentNode.removeChild(this._el);
  }
}

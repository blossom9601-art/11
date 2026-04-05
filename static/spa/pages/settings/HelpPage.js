/* HelpPage — 도움말 */

import { api }    from '../../shared/api-client.js';
import { h, esc } from '../../shared/dom-utils.js';

export default class HelpPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el = null;
  }

  async mount(container) {
    this._el = h('div', { className: 'spa-page' });
    container.appendChild(this._el);
    this._el.innerHTML = `
      <div class="spa-page-header">
        <h1>도움말</h1>
      </div>
      <div class="spa-card" style="padding:2rem;">
        <h2>Blossom IT 자산관리 시스템</h2>
        <p style="margin-top:1rem;line-height:1.8">
          Blossom은 IT 인프라 자산(서버, 네트워크, 보안장비), 프로젝트, 비용,<br>
          거버넌스, 데이터센터, 카테고리 등을 통합 관리하는 솔루션입니다.
        </p>
        <h3 style="margin-top:2rem">주요 기능</h3>
        <ul style="margin-top:.5rem;padding-left:1.5rem;line-height:2.0">
          <li>하드웨어 자산 관리 (서버/스토리지/SAN)</li>
          <li>네트워크 장비 관리 (스위치/AP/전용회선)</li>
          <li>보안장비 관리 (방화벽/VPN/IDS·IPS)</li>
          <li>프로젝트 & 작업보고 관리</li>
          <li>비용관리 (OPEX/CAPEX)</li>
          <li>거버넌스 정책 관리</li>
          <li>데이터센터 출입/랙/파쇄 관리</li>
          <li>인사이트 & 블로그</li>
        </ul>
        <div data-role="version" style="margin-top:2rem;color:var(--spa-text-muted,#94a3b8)"></div>
      </div>`;
    this._loadVersion();
  }

  async _loadVersion() {
    try {
      const res = await api.get('/api/version');
      const v = res.version || res.item?.version || '-';
      this._el.querySelector('[data-role="version"]').textContent = `시스템 버전: ${v}`;
    } catch {}
  }

  unmount() { if (this._el) this._el.remove(); }
}

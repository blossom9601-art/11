/* DatacenterPage — 데이터센터 관리 허브 */

import { esc }  from '../../shared/dom-utils.js';
import { api }  from '../../shared/api-client.js';

const SECTIONS = [
  { key: 'access',      label: '출입관리',    desc: '데이터센터 출입 권한 및 기록',
    icon: '🚪', api: '/api/datacenter/access/permissions' },
  { key: 'erasure',     label: '데이터 소거', desc: '데이터 소거 이력 관리',
    icon: '🗑️', api: '/api/datacenter/data-deletion' },
  { key: 'rack',        label: '랙 관리',     desc: '랙 배치 및 현황',
    icon: '🗄️', api: '/api/org-racks' },
  { key: 'thermometer', label: '온도 관리',   desc: '항온항습기 온도 모니터링',
    icon: '🌡️', api: '/api/org-thermometers' },
  { key: 'cctv',        label: 'CCTV',        desc: 'CCTV 장치 현황 관리',
    icon: '📹', api: '/api/org-cctvs' },
];

export default class DatacenterPage {
  constructor({ params, query, router }) {
    this._router  = router;
    this._section = params.section || null;
    this._el      = null;
  }

  async mount(container) {
    this._el = container;
    if (this._section) {
      await this._renderSection();
    } else {
      this._renderHub();
    }
  }

  unmount() {}

  _renderHub() {
    const cards = SECTIONS.map(s => `
      <a href="/spa/datacenter/${esc(s.key)}" class="spa-hub-card" data-nav>
        <div class="spa-hub-card__icon">${s.icon}</div>
        <div class="spa-hub-card__body">
          <h4>${esc(s.label)}</h4>
          <p>${esc(s.desc)}</p>
        </div>
      </a>`).join('');

    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">데이터센터</h2>
        </div>
        <div class="spa-hub-grid">${cards}</div>
      </div>`;

    this._el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-nav]');
      if (a) { e.preventDefault(); this._router.navigate(a.getAttribute('href').replace('/spa', '')); }
    });
  }

  async _renderSection() {
    const sec = SECTIONS.find(s => s.key === this._section);
    if (!sec) { this._renderHub(); return; }

    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <button class="spa-btn spa-btn--icon spa-back-btn" id="btn-back">← 목록</button>
          <h2 class="spa-page__title">${esc(sec.label)}</h2>
        </div>
        <div id="dc-content"><p class="spa-text-muted">로딩 중...</p></div>
      </div>`;

    this._el.querySelector('#btn-back').addEventListener('click', () => {
      this._router.navigate('/datacenter');
    });

    try {
      const res = await api.get(sec.api + '?page=1&page_size=50', { showError: false });
      const items = Array.isArray(res) ? res : (res.items || res.rows || []);
      const content = this._el.querySelector('#dc-content');
      if (items.length === 0) {
        content.innerHTML = '<p class="spa-text-muted">데이터가 없습니다.</p>';
      } else {
        content.innerHTML = this._renderAutoTable(items);
      }
    } catch (e) {
      this._el.querySelector('#dc-content').innerHTML =
        '<p class="spa-text-muted">데이터를 불러올 수 없습니다.</p>';
    }
  }

  _renderAutoTable(items) {
    if (items.length === 0) return '';
    const keys = Object.keys(items[0]).filter(k => !k.startsWith('_') && k !== 'deleted_at');
    const visibleKeys = keys.slice(0, 8);
    const thead = visibleKeys.map(k => `<th>${esc(k)}</th>`).join('');
    const tbody = items.slice(0, 50).map(row => {
      const tds = visibleKeys.map(k => `<td>${esc(String(row[k] ?? ''))}</td>`).join('');
      return `<tr>${tds}</tr>`;
    }).join('');
    return `<div style="overflow-x:auto"><table class="spa-dt-table" style="width:100%"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>`;
  }
}

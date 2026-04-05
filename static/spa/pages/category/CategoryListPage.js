/* CategoryListPage — 카테고리 (마스터 데이터) 관리 허브 */

import { esc }  from '../../shared/dom-utils.js';
import { api }  from '../../shared/api-client.js';

const DOMAINS = [
  { key: 'work',       label: '업무 분류',     desc: '업무 구분/상태/운영/그룹 관리',
    icon: '📊', listApi: '/api/work-categories' },
  { key: 'hw-catalog', label: '하드웨어 카탈로그', desc: '서버/스토리지/SAN/네트워크/보안장비 모델',
    icon: '🖥️', listApi: '/api/hw-server-types' },
  { key: 'sw-catalog', label: '소프트웨어 카탈로그', desc: 'OS/DB/미들웨어/가상화/보안/HA 제품',
    icon: '💿', listApi: '/api/sw-os-types' },
  { key: 'component',  label: '부품 카탈로그',  desc: 'CPU/GPU/메모리/디스크/NIC/HBA 등',
    icon: '🔧', listApi: '/api/cmp-cpu-types' },
  { key: 'company',    label: '조직 관리',      desc: '센터/부서 관리',
    icon: '🏢', listApi: '/api/org-centers' },
  { key: 'customer',   label: '고객 관리',      desc: '회원/협력사/고객사 관리',
    icon: '👥', listApi: '/api/customer-members' },
  { key: 'vendor',     label: '공급업체',        desc: '제조사/유지보수 업체 관리',
    icon: '🏭', listApi: '/api/vendor-manufacturers' },
];

export default class CategoryListPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._domain = params.domain || null;
    this._el     = null;
  }

  async mount(container) {
    this._el = container;
    if (this._domain) {
      await this._renderDomain();
    } else {
      this._renderHub();
    }
  }

  unmount() {}

  _renderHub() {
    const cards = DOMAINS.map(d => `
      <a href="/spa/category/${esc(d.key)}" class="spa-hub-card" data-nav>
        <div class="spa-hub-card__icon">${d.icon}</div>
        <div class="spa-hub-card__body">
          <h4>${esc(d.label)}</h4>
          <p>${esc(d.desc)}</p>
        </div>
      </a>`).join('');

    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">카테고리</h2>
        </div>
        <div class="spa-hub-grid">${cards}</div>
      </div>`;

    this._el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-nav]');
      if (a) { e.preventDefault(); this._router.navigate(a.getAttribute('href').replace('/spa', '')); }
    });
  }

  async _renderDomain() {
    const dom = DOMAINS.find(d => d.key === this._domain);
    if (!dom) { this._renderHub(); return; }

    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <button class="spa-btn spa-btn--icon spa-back-btn" id="btn-back">← 목록</button>
          <h2 class="spa-page__title">${esc(dom.label)}</h2>
        </div>
        <div id="cat-content"><p class="spa-text-muted">로딩 중...</p></div>
      </div>`;

    this._el.querySelector('#btn-back').addEventListener('click', () => {
      this._router.navigate('/category');
    });

    try {
      const res = await api.get(dom.listApi + '?page=1&page_size=50', { showError: false });
      const items = res.items || res.rows || [];
      const content = this._el.querySelector('#cat-content');
      if (items.length === 0) {
        content.innerHTML = '<p class="spa-text-muted">데이터가 없습니다.</p>';
      } else {
        content.innerHTML = this._renderAutoTable(items);
      }
    } catch (e) {
      this._el.querySelector('#cat-content').innerHTML =
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

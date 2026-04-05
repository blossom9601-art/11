/* CatBusinessDashboardPage — 업무 분류 대시보드 */
import { api }  from '../../shared/api-client.js';
import { esc }  from '../../shared/dom-utils.js';

const SECTIONS = [
  { key: 'work',      label: '업무 분류',   route: '/category/business/work',      api: '/api/work-categories' },
  { key: 'division',  label: '업무 구분',   route: '/category/business/division',  api: '/api/work-divisions' },
  { key: 'status',    label: '업무 상태',   route: '/category/business/status',    api: '/api/work-statuses' },
  { key: 'operation', label: '업무 운영',   route: '/category/business/operation', api: '/api/work-operations' },
  { key: 'group',     label: '업무 그룹',   route: '/category/business/group',     api: '/api/work-groups' },
];

export default class CatBusinessDashboardPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el     = null;
    this._counts = {};
  }

  async mount(container) {
    this._el = container;
    this._render();
    for (const s of SECTIONS) {
      try {
        const res = await api.get(s.api + '?page=1&page_size=1', { showError: false });
        this._counts[s.key] = res.total || (res.rows || res.items || []).length || 0;
      } catch { this._counts[s.key] = '-'; }
    }
    this._render();
  }

  unmount() {}

  _render() {
    const cards = SECTIONS.map(s => `
      <a href="/spa${s.route}" class="spa-hub-card" data-route="${s.route}">
        <div class="spa-hub-card__body">
          <h4>${esc(s.label)}</h4>
          <p class="spa-kpi-value">${this._counts[s.key] ?? '...'}</p>
        </div>
      </a>`).join('');

    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <button class="spa-btn spa-btn--icon spa-back-btn" id="btn-back">← 카테고리</button>
          <h2 class="spa-page__title">업무 분류 대시보드</h2>
        </div>
        <div class="spa-hub-grid">${cards}</div>
      </div>`;

    this._el.querySelector('#btn-back')?.addEventListener('click', () => this._router.navigate('/category'));
    this._el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-route]');
      if (a) { e.preventDefault(); this._router.navigate(a.dataset.route); }
    });
  }
}

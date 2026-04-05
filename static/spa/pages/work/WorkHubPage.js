/* WorkHubPage — 작업 관리 허브 */
import { esc } from '../../shared/dom-utils.js';

const SECTIONS = [
  { key: 'tasks',     label: '작업 관리',         desc: '내 작업 / 참여 작업 / 전체 작업',
    icon: '📋', route: '/work/tasks' },
  { key: 'reports',   label: '작업 보고서',       desc: '작업 보고서 작성 및 조회',
    icon: '📝', route: '/work/reports' },
  { key: 'desk',      label: '워크플로우 데스크',  desc: '진행 중 / 완료 티켓 현황',
    icon: '🎫', route: '/work/desk' },
  { key: 'workflows', label: '워크플로우 설계',    desc: '워크플로우 정의 및 단계 관리',
    icon: '🔀', route: '/work/workflows' },
  { key: 'designer',  label: '워크플로우 디자이너', desc: '워크플로우 탐색 / 관리 / 편집',
    icon: '🎨', route: '/work/designer' },
  { key: 'groups',    label: '작업 그룹',          desc: '작업 그룹 구성 및 담당자 관리',
    icon: '👥', route: '/work/groups' },
  { key: 'completed', label: '완료 워크플로우',    desc: '완료된 워크플로우 조회',
    icon: '✅', route: '/work/desk/completed' },
];

export default class WorkHubPage {
  constructor({ params, query, router }) { this._router = router; this._el = null; }

  async mount(container) {
    this._el = container;
    const cards = SECTIONS.map(s => `
      <a href="/spa${s.route}" class="spa-hub-card" data-route="${esc(s.route)}">
        <div class="spa-hub-card__icon">${s.icon}</div>
        <div class="spa-hub-card__body">
          <h4>${esc(s.label)}</h4>
          <p>${esc(s.desc)}</p>
        </div>
      </a>`).join('');

    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header"><h2 class="spa-page__title">작업 관리</h2></div>
        <div class="spa-hub-grid">${cards}</div>
      </div>`;

    this._el.addEventListener('click', e => {
      const a = e.target.closest('[data-route]');
      if (a) { e.preventDefault(); this._router.navigate(a.dataset.route); }
    });
  }

  unmount() {}
}

/* SettingsPage — 관리 허브 */
import { esc } from '../../shared/dom-utils.js';

const SECTIONS = [
  { key: 'users',        path: '/admin/users',        label: '사용자 관리',  desc: '사용자 계정 생성/수정/삭제, 잠금 해제', icon: '👤' },
  { key: 'roles',        path: '/admin/roles',        label: '역할/권한',    desc: '역할 기반 접근 제어 설정',              icon: '🔑' },
  { key: 'security',     path: '/admin/security',     label: '보안 정책',    desc: '비밀번호/잠금/세션 정책 관리',          icon: '🛡️' },
  { key: 'sessions',     path: '/admin/sessions',     label: '세션 관리',    desc: '활성 세션 모니터링 및 종료',            icon: '🖥️' },
  { key: 'mail',         path: '/admin/mail',         label: '메일 설정',    desc: 'SMTP 서버 연결 및 발송 설정',           icon: '📧' },
  { key: 'mfa',          path: '/admin/mfa',          label: 'MFA 인증',     desc: '다중 인증 방식 설정',                   icon: '🔐' },
  { key: 'brand',        path: '/admin/brand',        label: '브랜드 설정',  desc: '로고/테마/사이트 정보',                 icon: '🎨' },
  { key: 'info-message', path: '/admin/info-messages', label: '문구 관리',   desc: '페이지별 안내 메시지 관리',             icon: 'ℹ️' },
  { key: 'page-tabs',    path: '/admin/page-tabs',    label: '탭 관리',      desc: '페이지별 탭 활성/비활성 관리',          icon: '📑' },
];

export default class SettingsPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el = null;
  }

  async mount(container) {
    this._el = container;
    this._render();
  }

  unmount() {}

  _render() {
    const cards = SECTIONS.map(s => `
      <a href="/spa${s.path}" class="spa-hub-card" data-link>
        <div class="spa-hub-card__icon">${s.icon}</div>
        <div class="spa-hub-card__body">
          <h4>${esc(s.label)}</h4>
          <p>${esc(s.desc)}</p>
        </div>
      </a>`).join('');

    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">시스템 설정</h2>
        </div>
        <div class="spa-hub-grid">${cards}</div>
      </div>`;
  }
}

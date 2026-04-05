import { h, esc } from '../../shared/dom-utils.js';
import api from '../../shared/api-client.js';

export default function ProjectDetailPage(container, params) {
  container.innerHTML = '<div class="spa-page"><h2 class="spa-page__title">프로젝트 상세</h2><p class="spa-text-muted">구현 예정</p></div>';
  return { destroy() { container.innerHTML = ''; } };
}

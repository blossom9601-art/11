import { h, esc } from '../../shared/dom-utils.js';
import api from '../../shared/api-client.js';

export default function SecurityListPage(container, params) {
  container.innerHTML = '<div class="spa-page"><h2 class="spa-page__title">보안 장비 목록</h2><p class="spa-text-muted">구현 예정</p></div>';
  return { destroy() { container.innerHTML = ''; } };
}

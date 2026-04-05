import { h, esc } from '../../shared/dom-utils.js';
import api from '../../shared/api-client.js';

export default function NetworkDetailPage(container, params) {
  container.innerHTML = '<div class="spa-page"><h2 class="spa-page__title">네트워크 상세</h2><p class="spa-text-muted">구현 예정</p></div>';
  return { destroy() { container.innerHTML = ''; } };
}

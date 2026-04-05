/* ============================================================
 *  Prefetch — 링크 hover/focus 시 페이지 모듈 사전 로드
 *  ============================================================
 *  <a href="/spa/hardware"> 위에 마우스를 올리면 해당 페이지
 *  JS 모듈을 미리 import() 하여 클릭 시 즉시 마운트.
 *
 *  Usage (app.js):
 *    import { initPrefetch } from './shared/prefetch.js';
 *    initPrefetch(routes);
 * ============================================================ */

const BASE_PATH = '/spa';
const prefetched = new Set();

/**
 * 라우팅 테이블 기반 prefetch 초기화
 * @param {Array} routes  routes.js 의 라우트 배열
 */
export function initPrefetch(routes) {
  /* 경로 → loader 맵 */
  const loaderMap = new Map();
  for (const r of routes) {
    /* 파라미터 없는 정적 경로만 prefetch 대상 */
    if (!r.path.includes(':') && r.page) {
      loaderMap.set(r.path, r.page);
    }
  }

  function tryPrefetch(href) {
    if (!href) return;
    const path = href.startsWith(BASE_PATH) ? href.slice(BASE_PATH.length) || '/' : href;
    if (prefetched.has(path)) return;

    const loader = loaderMap.get(path);
    if (loader) {
      prefetched.add(path);
      /* 낮은 우선순위로 사전 로드 */
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => loader().catch(() => {}));
      } else {
        setTimeout(() => loader().catch(() => {}), 100);
      }
    }
  }

  /* hover/focus 이벤트 위임 */
  document.addEventListener('pointerenter', (e) => {
    const a = e.target.closest('a[href]');
    if (a) tryPrefetch(a.getAttribute('href'));
  }, { capture: true, passive: true });

  document.addEventListener('focusin', (e) => {
    const a = e.target.closest('a[href]');
    if (a) tryPrefetch(a.getAttribute('href'));
  }, { capture: true, passive: true });
}

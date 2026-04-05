/* ================================================================
   PageTabRenderer  —  공통 동적 탭 렌더러
   static/js/common/page_tab_renderer.js

   사용법 (HTML):
     <div id="dynamic-system-tabs"
          data-page-code="GOV_VPN_POLICY"
          data-current-key="{{ current_key }}"></div>

     <script src="/static/js/common/page_tab_renderer.js" defer></script>

   - data-page-code : page_tab_config 의 page_code
   - data-current-key: 현재 페이지 라우트 키 (active 표시용)
   ================================================================ */
(function () {
  'use strict';

  /**
   * 단일 컨테이너에 탭을 렌더링한다.
   * @param {HTMLElement} container  탭을 렌더링할 div
   */
  function renderTabs(container) {
    var pageCode   = container.getAttribute('data-page-code');
    var currentKey = container.getAttribute('data-current-key') || '';
    var ariaLabel  = container.getAttribute('data-aria-label') || '';

    if (!pageCode) return;

    fetch('/api/page-tabs?page_code=' + encodeURIComponent(pageCode))
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.success || !data.items || !data.items.length) return;

        // 탭 래퍼 생성 (기존 .system-tabs 스타일 재사용)
        var wrap = document.createElement('div');
        wrap.className = 'system-tabs';
        wrap.setAttribute('role', 'tablist');
        if (ariaLabel) wrap.setAttribute('aria-label', ariaLabel);

        // active 판별: exact match 먼저 시도, 없으면 첫 번째 탭을 active 로 표시
        var hasExactMatch = data.items.some(function (t) {
          return t.route_key && t.route_key === currentKey;
        });

        data.items.forEach(function (tab, idx) {
          var a = document.createElement('a');
          a.className = 'system-tab-btn';
          a.setAttribute('role', 'tab');

          // active 판별: route_key 가 현재 current_key 와 일치하면 active
          // 일치하는 탭이 없으면 첫 번째 탭을 active 로 표시
          var isActive = hasExactMatch
            ? (tab.route_key && tab.route_key === currentKey)
            : (idx === 0);
          if (isActive) {
            a.classList.add('active');
            a.setAttribute('aria-selected', 'true');
          } else {
            a.setAttribute('aria-selected', 'false');
          }

          // href: route_key 가 있으면 /p/{route_key}, 없으면 #
          a.href = tab.route_key ? '/p/' + tab.route_key : '#';
          a.textContent = tab.tab_name;

          // tab_color 가 지정되어 있으면 인라인 스타일 적용
          if (tab.tab_color) {
            a.style.color = isActive ? tab.tab_color : '';
            if (isActive) a.style.borderBottomColor = tab.tab_color;
          }

          wrap.appendChild(a);
        });

        container.innerHTML = '';
        container.appendChild(wrap);
      })
      .catch(function (err) {
        console.error('[PageTabRenderer] fetch error:', err);
      });
  }

  /**
   * 페이지 내 모든 dynamic-system-tabs 컨테이너를 찾아 렌더링한다.
   */
  function initAll() {
    var containers = document.querySelectorAll('[data-page-code]');
    for (var i = 0; i < containers.length; i++) {
      renderTabs(containers[i]);
    }
  }

  // 외부 호출용 전역 객체
  window.PageTabRenderer = {
    render: renderTabs,
    initAll: initAll
  };

  // DOM 준비 후 자동 초기화
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();

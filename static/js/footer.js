/* footer.js — Global Footer 동적 삽입 + 버전 정보 로드 */
(function () {
  'use strict';

  function insertFooter() {
    var main = document.querySelector('main.main-content');
    if (!main || document.getElementById('blossom-footer')) return;

    var footer = document.createElement('footer');
    footer.id = 'blossom-footer';
    footer.className = 'blossom-footer';
    footer.innerHTML =
      '<div class="blossom-footer-left">' +
        '<span>\u00A9 2026 <span class="footer-brand">blossom</span>' +
        ' \u00B7 Enterprise Operations Workspace</span>' +
      '</div>' +
      '<div class="blossom-footer-right">' +
        '<a href="/p/settings_version" class="footer-version" title="Version Management">v...</a>' +
        '<span class="footer-sep">\u00B7</span>' +
        '<span class="footer-env">—</span>' +
        '<span class="footer-sep">\u00B7</span>' +
        '<a href="/p/help">Help Center</a>' +
        '<span class="footer-sep">\u00B7</span>' +
        '<a href="/p/privacy">Privacy Policy</a>' +
      '</div>';

    main.appendChild(footer);

    /* 버전 정보 로드 */
    fetch('/api/version', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.version) return;
        var vEl = footer.querySelector('.footer-version');
        var envEl = footer.querySelector('.footer-env');
        if (vEl) vEl.textContent = 'v' + d.version;
        if (envEl) envEl.textContent = d.environment || 'Production';
      })
      .catch(function () { /* 실패 시 기본값 유지 */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', insertFooter);
  } else {
    insertFooter();
  }

  /* SPA 네비게이션 후 main이 교체되면 footer 재삽입 */
  document.addEventListener('blossom:spa:navigated', function () {
    setTimeout(insertFooter, 0);
  });
})();

/**
 * 공통 DOM 유틸리티 (dom-utils.js)
 * =================================
 * 프로젝트 전역에서 반복되는 DOM 조작 패턴을 유틸리티로 통합한다.
 *
 * 사용법:
 *   var el = BlossomDOM.qs('#my-table');
 *   BlossomDOM.on(el, 'click', handler);
 *   BlossomDOM.show(el);
 *   BlossomDOM.hide(el);
 *
 * v1.0.0  2026-03-15
 */
(function (root) {
  'use strict';

  /* ── 선택자 단축 ── */

  /** querySelector 단축 */
  function qs(selector, parent) {
    return (parent || document).querySelector(selector);
  }

  /** querySelectorAll 을 배열로 반환 */
  function qsa(selector, parent) {
    return Array.prototype.slice.call(
      (parent || document).querySelectorAll(selector)
    );
  }

  /** ID 로 엘리먼트 조회 */
  function byId(id) {
    return document.getElementById(id);
  }

  /* ── 이벤트 ── */

  /** addEventListener 단축. 이벤트 위임 시 parent + selector 패턴 지원 */
  function on(el, event, selectorOrHandler, handler) {
    if (typeof selectorOrHandler === 'function') {
      // 직접 바인딩
      el.addEventListener(event, selectorOrHandler);
    } else {
      // 이벤트 위임: on(parent, 'click', '.child', handler)
      var selector = selectorOrHandler;
      el.addEventListener(event, function (e) {
        var target = e.target.closest(selector);
        if (target && el.contains(target)) {
          handler.call(target, e);
        }
      });
    }
  }

  /** 한 번만 실행되는 이벤트 리스너 */
  function once(el, event, handler) {
    function wrapper(e) {
      el.removeEventListener(event, wrapper);
      handler.call(el, e);
    }
    el.addEventListener(event, wrapper);
  }

  /* ── 표시/숨김 ── */

  function show(el, display) {
    if (!el) return;
    el.style.display = display || '';
    el.removeAttribute('aria-hidden');
  }

  function hide(el) {
    if (!el) return;
    el.style.display = 'none';
    el.setAttribute('aria-hidden', 'true');
  }

  function toggle(el, force) {
    if (!el) return;
    var isHidden = el.style.display === 'none' || el.getAttribute('aria-hidden') === 'true';
    var shouldShow = typeof force === 'boolean' ? force : isHidden;
    shouldShow ? show(el) : hide(el);
  }

  /* ── 클래스 ── */

  function addClass(el, cls) {
    if (el && cls) el.classList.add(cls);
  }

  function removeClass(el, cls) {
    if (el && cls) el.classList.remove(cls);
  }

  function toggleClass(el, cls, force) {
    if (el && cls) el.classList.toggle(cls, force);
  }

  function hasClass(el, cls) {
    return el ? el.classList.contains(cls) : false;
  }

  /* ── DOM 조작 ── */

  /** XSS 방지용 텍스트 이스케이프 */
  function escapeHtml(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }

  /** innerHTML 대신 안전한 텍스트 설정 */
  function setText(el, text) {
    if (el) el.textContent = text || '';
  }

  /** DocumentFragment 생성 후 콜백에서 자식 추가 */
  function fragment(builder) {
    var frag = document.createDocumentFragment();
    if (typeof builder === 'function') builder(frag);
    return frag;
  }

  /**
   * 배열 데이터로 DOM 목록을 효율적으로 렌더링한다.
   * 기존 innerHTML 반복 대입 패턴 대비 reflow 를 최소화한다.
   *
   * @param {HTMLElement} container   렌더 대상 컨테이너
   * @param {Array}       items       데이터 배열
   * @param {Function}    renderItem  각 항목을 HTMLElement 로 변환하는 함수
   */
  function renderList(container, items, renderItem) {
    if (!container) return;
    var frag = document.createDocumentFragment();
    for (var i = 0; i < items.length; i++) {
      var el = renderItem(items[i], i);
      if (el) frag.appendChild(el);
    }
    container.innerHTML = '';
    container.appendChild(frag);
  }

  /**
   * 테이블 <tbody> 에 행을 효율적으로 렌더링한다.
   * 테이블 전체를 다시 그리는 것보다 성능이 좋다.
   *
   * @param {HTMLElement} tbody       <tbody> 엘리먼트
   * @param {Array}       rows        행 데이터 배열
   * @param {Function}    renderRow   행 데이터 → <tr> 엘리먼트
   */
  function renderTableRows(tbody, rows, renderRow) {
    renderList(tbody, rows, renderRow);
  }

  /* ── 폼 ── */

  /**
   * 폼 엘리먼트의 값을 객체로 수집한다.
   * @param {HTMLFormElement} form
   * @returns {Object} { name: value } 형태
   */
  function serializeForm(form) {
    var result = {};
    if (!form) return result;

    var elements = form.elements;
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      var name = el.name;
      if (!name || el.disabled) continue;

      if (el.type === 'checkbox') {
        result[name] = el.checked;
      } else if (el.type === 'radio') {
        if (el.checked) result[name] = el.value;
      } else if (el.tagName === 'SELECT' && el.multiple) {
        result[name] = Array.prototype.slice.call(el.selectedOptions)
          .map(function (o) { return o.value; });
      } else {
        result[name] = (el.value || '').trim();
      }
    }
    return result;
  }

  /**
   * 객체 값으로 폼 필드를 채운다.
   * @param {HTMLFormElement} form
   * @param {Object} data  { name: value }
   */
  function populateForm(form, data) {
    if (!form || !data) return;

    var elements = form.elements;
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      var name = el.name;
      if (!name || !(name in data)) continue;

      var val = data[name];
      if (el.type === 'checkbox') {
        el.checked = !!val;
      } else if (el.type === 'radio') {
        el.checked = (el.value === String(val));
      } else {
        el.value = val == null ? '' : val;
      }
    }
  }

  /* ── 디바운스 ── */

  /**
   * 함수 실행을 대기 시간만큼 지연한다 (검색 입력 등에 사용).
   * @param {Function} fn     실행할 함수
   * @param {number}   delay  지연 시간(ms), 기본 300
   * @returns {Function}
   */
  function debounce(fn, delay) {
    var timer;
    delay = delay || 300;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, delay);
    };
  }

  /**
   * 함수 실행 빈도를 제한한다 (스크롤, 리사이즈 등에 사용).
   * @param {Function} fn     실행할 함수
   * @param {number}   limit  최소 간격(ms), 기본 100
   * @returns {Function}
   */
  function throttle(fn, limit) {
    var waiting = false;
    limit = limit || 100;
    return function () {
      if (waiting) return;
      waiting = true;
      fn.apply(this, arguments);
      setTimeout(function () { waiting = false; }, limit);
    };
  }

  /* ── 공개 API ── */
  root.BlossomDOM = {
    // 선택자
    qs: qs,
    qsa: qsa,
    byId: byId,

    // 이벤트
    on: on,
    once: once,

    // 표시/숨김
    show: show,
    hide: hide,
    toggle: toggle,

    // 클래스
    addClass: addClass,
    removeClass: removeClass,
    toggleClass: toggleClass,
    hasClass: hasClass,

    // DOM 조작
    escapeHtml: escapeHtml,
    setText: setText,
    fragment: fragment,
    renderList: renderList,
    renderTableRows: renderTableRows,

    // 폼
    serializeForm: serializeForm,
    populateForm: populateForm,

    // 성능
    debounce: debounce,
    throttle: throttle
  };

})(window);

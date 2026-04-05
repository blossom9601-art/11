/**
 * 공통 모달 유틸리티 (modal-utils.js)
 * =====================================
 * 프로젝트 전역에서 반복되는 모달 열기/닫기/백드롭 처리를
 * 하나의 유틸리티로 통합한다.
 *
 * 기존 inline onclick="..." 패턴을 addEventListener 기반으로 대체하며,
 * data-modal-* 속성으로 선언적 바인딩을 지원한다.
 *
 * 사용법 (선언적):
 *   <button data-modal-open="edit-modal">편집</button>
 *   <div id="edit-modal" class="server-add-modal modal-overlay-full" data-modal>
 *     <div class="modal-content">
 *       <button data-modal-close>닫기</button>
 *     </div>
 *   </div>
 *
 * 사용법 (JS):
 *   BlossomModal.open('edit-modal');
 *   BlossomModal.close('edit-modal');
 *   BlossomModal.confirm('정말 삭제하시겠습니까?').then(function(ok){ ... });
 *
 * v1.0.0  2026-03-15
 */
(function (root) {
  'use strict';

  /* ── 내부 상태 ── */
  var activeModals = [];

  /* ── 헬퍼 ── */
  function getModal(idOrEl) {
    if (typeof idOrEl === 'string') {
      return document.getElementById(idOrEl);
    }
    return idOrEl instanceof HTMLElement ? idOrEl : null;
  }

  /**
   * 모달 열기
   * @param {string|HTMLElement} modal   모달 ID 또는 DOM 엘리먼트
   * @param {Object} [opts]              { onOpen, focusSelector }
   */
  function open(modal, opts) {
    var el = getModal(modal);
    if (!el) return;
    opts = opts || {};

    el.classList.add('show');
    el.removeAttribute('aria-hidden');
    document.body.classList.add('modal-open');

    // 활성 스택에 추가 (중첩 모달 지원)
    if (activeModals.indexOf(el) === -1) {
      activeModals.push(el);
    }

    // 포커스 이동 (접근성)
    if (opts.focusSelector) {
      var focusTarget = el.querySelector(opts.focusSelector);
      if (focusTarget) {
        requestAnimationFrame(function () { focusTarget.focus(); });
      }
    }

    if (typeof opts.onOpen === 'function') {
      opts.onOpen(el);
    }
  }

  /**
   * 모달 닫기
   * @param {string|HTMLElement} modal   모달 ID 또는 DOM 엘리먼트
   * @param {Object} [opts]              { onClose, remove }
   */
  function close(modal, opts) {
    var el = getModal(modal);
    if (!el) return;
    opts = opts || {};

    el.classList.remove('show');
    el.setAttribute('aria-hidden', 'true');

    // 스택에서 제거
    var idx = activeModals.indexOf(el);
    if (idx !== -1) activeModals.splice(idx, 1);

    // 마지막 모달이 닫히면 body 스크롤 잠금 해제
    if (activeModals.length === 0) {
      document.body.classList.remove('modal-open');
    }

    // 임시 모달이면 DOM 에서 제거
    if (opts.remove) {
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 200);
    }

    if (typeof opts.onClose === 'function') {
      opts.onClose(el);
    }
  }

  /**
   * 확인 다이얼로그 — Promise 기반
   * @param {string} message    확인 메시지
   * @param {Object} [opts]     { title, confirmText, cancelText }
   * @returns {Promise<boolean>}
   */
  function confirm(message, opts) {
    opts = opts || {};
    var title = opts.title || '확인';
    var confirmText = opts.confirmText || '확인';
    var cancelText = opts.cancelText || '취소';

    return new Promise(function (resolve) {
      var id = 'blossom-confirm-' + Date.now();
      var overlay = document.createElement('div');
      overlay.id = id;
      overlay.className = 'server-add-modal blossom-message-modal modal-overlay-full';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');

      overlay.innerHTML =
        '<div class="modal-content" style="max-width:420px;margin:auto;padding:32px 28px 24px;border-radius:16px;">' +
          '<h3 style="margin:0 0 12px;">' + _escapeHtml(title) + '</h3>' +
          '<p style="margin:0 0 24px;line-height:1.6;">' + _escapeHtml(message) + '</p>' +
          '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
            '<button class="btn-secondary" data-action="cancel">' + _escapeHtml(cancelText) + '</button>' +
            '<button class="btn-primary" data-action="confirm">' + _escapeHtml(confirmText) + '</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(overlay);

      function cleanup(result) {
        close(overlay, { remove: true });
        document.removeEventListener('keydown', onKey);
        resolve(result);
      }

      // 이벤트 바인딩
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) cleanup(false);  // 백드롭 클릭
        if (e.target.getAttribute('data-action') === 'confirm') cleanup(true);
        if (e.target.getAttribute('data-action') === 'cancel') cleanup(false);
      });

      function onKey(e) {
        if (e.key === 'Escape') cleanup(false);
        if (e.key === 'Enter') cleanup(true);
      }
      document.addEventListener('keydown', onKey);

      // show
      open(overlay, { focusSelector: '[data-action="confirm"]' });
    });
  }

  /* ── XSS 방지 ── */
  function _escapeHtml(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }

  /* ── 이벤트 위임: data-modal-* 속성 기반 자동 바인딩 ── */
  function _initDelegation() {
    // data-modal-open="모달ID" 클릭 시 모달 열기
    document.addEventListener('click', function (e) {
      // 열기 버튼
      var openBtn = e.target.closest('[data-modal-open]');
      if (openBtn) {
        var targetId = openBtn.getAttribute('data-modal-open');
        if (targetId) open(targetId);
        return;
      }

      // 닫기 버튼
      var closeBtn = e.target.closest('[data-modal-close]');
      if (closeBtn) {
        var modal = closeBtn.closest('[data-modal]') || closeBtn.closest('.modal-overlay-full');
        if (modal) close(modal);
        return;
      }

      // 백드롭 클릭 (모달 자체를 클릭)
      if (e.target.hasAttribute('data-modal') || e.target.classList.contains('modal-overlay-full')) {
        if (e.target === e.currentTarget || e.target.classList.contains('show')) {
          // 모달 초기 오버레이를 직접 클릭한 경우에만 닫기
          if (activeModals.indexOf(e.target) !== -1) {
            close(e.target);
          }
        }
      }
    });

    // ESC 키로 최상위 모달 닫기
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && activeModals.length > 0) {
        close(activeModals[activeModals.length - 1]);
      }
    });
  }

  /* ── DOM 준비 시 자동 초기화 ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initDelegation);
  } else {
    _initDelegation();
  }

  /* ── 공개 API ── */
  root.BlossomModal = {
    open: open,
    close: close,
    confirm: confirm,
    /** 현재 활성 모달 목록 (읽기 전용) */
    get active() { return activeModals.slice(); }
  };

})(window);

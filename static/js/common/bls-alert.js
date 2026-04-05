/**
 * Blossom 상태 기반 알림 모달 시스템 (bls-alert.js)
 * ====================================================
 * INFO / SUCCESS / WARNING / ERROR 네 가지 타입의
 * 엔터프라이즈 알림 모달을 프로그래밍 방식으로 생성.
 *
 * 의존: BlossomModal (modal-utils.js), bls-modal.css Section 20
 *
 * 사용법:
 *   BlsAlert.info('작업이 정상적으로 처리되었습니다.');
 *   BlsAlert.success('저장 완료', '변경사항이 저장되었습니다.');
 *   BlsAlert.warning({ title: '삭제 확인', message: '복구할 수 없습니다.', onConfirm: fn });
 *   BlsAlert.error('오류 발생', '서버에 연결할 수 없습니다.', { onRetry: fn });
 *   BlsAlert.open({ type: 'warning', title: '...', message: '...', buttons: [...] });
 *
 * v1.0.0  2026-03-17
 */
(function (root) {
  'use strict';

  /* ================================================================
     SVG 아이콘 (인라인, 44x44 아이콘 박스 내부용 22x22)
     ================================================================ */
  var ICONS = {
    info: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    success: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11.5 14.5 16 10"/></svg>',
    warning: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    error: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    close: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
  };

  /* ================================================================
     타입별 기본 버튼 구성
     ================================================================ */
  var TYPE_DEFAULTS = {
    info:    { confirmText: '확인',    cancelText: null },
    success: { confirmText: '확인',    cancelText: null },
    warning: { confirmText: '진행',    cancelText: '취소' },
    error:   { confirmText: '닫기',    cancelText: null }
  };

  /* ================================================================
     XSS 방지
     ================================================================ */
  function esc(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }

  /* ================================================================
     인자 정규화
     ================================================================ */
  function normalizeArgs(type, titleOrOpts, message, opts) {
    var cfg = { type: type };

    if (typeof titleOrOpts === 'object' && titleOrOpts !== null) {
      // BlsAlert.info({ title, message, ... })
      for (var k in titleOrOpts) {
        if (titleOrOpts.hasOwnProperty(k)) cfg[k] = titleOrOpts[k];
      }
    } else if (typeof titleOrOpts === 'string' && typeof message === 'string') {
      // BlsAlert.info('제목', '메시지', opts?)
      cfg.title = titleOrOpts;
      cfg.message = message;
      if (opts && typeof opts === 'object') {
        for (var k2 in opts) {
          if (opts.hasOwnProperty(k2)) cfg[k2] = opts[k2];
        }
      }
    } else if (typeof titleOrOpts === 'string') {
      // BlsAlert.info('메시지만')
      cfg.message = titleOrOpts;
    }

    return cfg;
  }

  /* ================================================================
     코어: open(config) → Promise<string>
     반환 값: 'confirm' | 'cancel' | 'close' | 'retry' | 커스텀 action
     ================================================================ */
  function open(config) {
    config = config || {};
    var type = config.type || 'info';
    if (!TYPE_DEFAULTS[type]) type = 'info';

    var defaults = TYPE_DEFAULTS[type];
    var title = config.title || '';
    var message = config.message || '';
    var confirmText = config.confirmText !== undefined ? config.confirmText : defaults.confirmText;
    var cancelText = config.cancelText !== undefined ? config.cancelText : defaults.cancelText;
    var buttons = config.buttons; // 커스텀 버튼 배열 (선택)
    var id = 'bls-alert-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);

    return new Promise(function (resolve) {
      /* ── DOM 생성 ── */
      var overlay = document.createElement('div');
      overlay.id = id;
      overlay.className = 'bls-alert-overlay';
      overlay.setAttribute('data-alert-type', type);
      overlay.setAttribute('role', 'alertdialog');
      overlay.setAttribute('aria-modal', 'true');
      if (title) overlay.setAttribute('aria-label', title);

      /* ── 카드 ── */
      var card = document.createElement('div');
      card.className = 'bls-alert-card';
      card.setAttribute('tabindex', '-1');

      /* 닫기 버튼 */
      var closeBtn = document.createElement('button');
      closeBtn.className = 'bls-alert-close';
      closeBtn.setAttribute('type', 'button');
      closeBtn.setAttribute('aria-label', '닫기');
      closeBtn.setAttribute('data-action', 'close');
      closeBtn.innerHTML = ICONS.close;
      card.appendChild(closeBtn);

      /* 본문 */
      var body = document.createElement('div');
      body.className = 'bls-alert-body';

      /* 아이콘 */
      var iconWrap = document.createElement('div');
      iconWrap.className = 'bls-alert-icon';
      iconWrap.innerHTML = ICONS[type] || ICONS.info;
      body.appendChild(iconWrap);

      /* 텍스트 */
      var textWrap = document.createElement('div');
      textWrap.className = 'bls-alert-text';
      if (title) {
        var h = document.createElement('h3');
        h.className = 'bls-alert-title';
        h.textContent = title;
        textWrap.appendChild(h);
      }
      if (message) {
        var p = document.createElement('p');
        p.className = 'bls-alert-message';
        p.textContent = message;
        textWrap.appendChild(p);
      }
      body.appendChild(textWrap);
      card.appendChild(body);

      /* ── 액션 버튼 영역 ── */
      var actions = document.createElement('div');
      actions.className = 'bls-alert-actions';

      if (buttons && buttons.length) {
        // 커스텀 버튼 배열
        buttons.forEach(function (btn) {
          var b = document.createElement('button');
          b.className = 'bls-alert-btn';
          b.setAttribute('type', 'button');
          var btnClass = btn.class || (btn.primary ? 'bls-alert-btn-primary' : 'bls-alert-btn-cancel');
          b.classList.add(btnClass);
          b.textContent = btn.text || '확인';
          b.setAttribute('data-action', btn.action || 'close');
          if (btn.primary) b.setAttribute('data-primary', '');
          actions.appendChild(b);
        });
      } else {
        // 기본 버튼 구성
        if (cancelText) {
          var cancelBtn = document.createElement('button');
          cancelBtn.className = 'bls-alert-btn bls-alert-btn-cancel';
          cancelBtn.setAttribute('type', 'button');
          cancelBtn.setAttribute('data-action', 'cancel');
          cancelBtn.textContent = cancelText;
          actions.appendChild(cancelBtn);
        }
        if (confirmText) {
          var confirmBtn = document.createElement('button');
          var btnCls = (type === 'warning' && config.danger) ? 'bls-alert-btn-danger' : 'bls-alert-btn-primary';
          confirmBtn.className = 'bls-alert-btn ' + btnCls;
          confirmBtn.setAttribute('type', 'button');
          confirmBtn.setAttribute('data-primary', '');

          // ERROR + onRetry → "다시 시도" 액션
          if (type === 'error' && typeof config.onRetry === 'function') {
            confirmBtn.setAttribute('data-action', 'retry');
            confirmBtn.textContent = config.retryText || '다시 시도';
          } else {
            confirmBtn.setAttribute('data-action', 'confirm');
            confirmBtn.textContent = confirmText;
          }
          actions.appendChild(confirmBtn);
        }
      }

      card.appendChild(actions);
      overlay.appendChild(card);
      document.body.appendChild(overlay);

      /* ── 닫기 로직 ── */
      var resolved = false;
      function cleanup(action) {
        if (resolved) return;
        resolved = true;
        overlay.classList.remove('show');
        document.removeEventListener('keydown', onKey);

        // 콜백 실행
        if (action === 'confirm' && typeof config.onConfirm === 'function') {
          config.onConfirm();
        }
        if (action === 'cancel' && typeof config.onCancel === 'function') {
          config.onCancel();
        }
        if (action === 'retry' && typeof config.onRetry === 'function') {
          config.onRetry();
        }
        if (typeof config.onClose === 'function') {
          config.onClose(action);
        }

        // body scroll 복원
        document.body.classList.remove('modal-open');

        // DOM 제거 (애니메이션 후)
        setTimeout(function () {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, 180);

        resolve(action);
      }

      /* ── 이벤트 바인딩 ── */
      overlay.addEventListener('click', function (e) {
        // 백드롭 클릭
        if (e.target === overlay) {
          cleanup('close');
          return;
        }
        // 버튼 클릭
        var actionBtn = e.target.closest('[data-action]');
        if (actionBtn) {
          cleanup(actionBtn.getAttribute('data-action'));
        }
      });

      function onKey(e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          cleanup('close');
        }
        if (e.key === 'Enter') {
          // Enter → primary 버튼 실행
          var primary = overlay.querySelector('[data-primary]');
          if (primary) {
            e.preventDefault();
            cleanup(primary.getAttribute('data-action'));
          }
        }
        // Tab 트랩
        if (e.key === 'Tab') {
          var focusable = overlay.querySelectorAll('button:not([disabled]), [tabindex]:not([tabindex="-1"])');
          if (focusable.length === 0) return;
          var first = focusable[0];
          var last = focusable[focusable.length - 1];
          if (e.shiftKey) {
            if (document.activeElement === first) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }
      }
      document.addEventListener('keydown', onKey);

      /* ── show ── */
      document.body.classList.add('modal-open');
      // force reflow
      overlay.offsetHeight; // eslint-disable-line no-unused-expressions
      overlay.classList.add('show');

      // 포커스: primary 버튼 또는 닫기 버튼
      requestAnimationFrame(function () {
        var focusTarget = overlay.querySelector('[data-primary]') || overlay.querySelector('.bls-alert-close');
        if (focusTarget) focusTarget.focus();
      });
    });
  }

  /* ================================================================
     편의 메서드
     ================================================================ */
  function info(titleOrOpts, message, opts) {
    return open(normalizeArgs('info', titleOrOpts, message, opts));
  }

  function success(titleOrOpts, message, opts) {
    return open(normalizeArgs('success', titleOrOpts, message, opts));
  }

  function warning(titleOrOpts, message, opts) {
    return open(normalizeArgs('warning', titleOrOpts, message, opts));
  }

  function error(titleOrOpts, message, opts) {
    return open(normalizeArgs('error', titleOrOpts, message, opts));
  }

  /**
   * 삭제 확인 — WARNING 타입 + danger 버튼 preset
   * @param {string} message  삭제 안내 메시지
   * @param {Object} [opts]   { title, confirmText, onConfirm, onCancel }
   * @returns {Promise<string>}
   */
  function confirmDelete(message, opts) {
    opts = opts || {};
    return open({
      type: 'warning',
      title: opts.title || '삭제 확인',
      message: message || '이 작업은 되돌릴 수 없습니다.',
      confirmText: opts.confirmText || '삭제',
      cancelText: opts.cancelText || '취소',
      danger: true,
      onConfirm: opts.onConfirm,
      onCancel: opts.onCancel,
      onClose: opts.onClose
    });
  }

  /* ================================================================
     공개 API
     ================================================================ */
  root.BlsAlert = {
    open: open,
    info: info,
    success: success,
    warning: warning,
    error: error,
    confirmDelete: confirmDelete
  };

})(window);

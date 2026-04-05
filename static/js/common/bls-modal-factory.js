/**
 * Blossom Enterprise Modal Factory (bls-modal-factory.js)
 * ========================================================
 * 등록/수정/삭제 모달의 HTML 구조를 프로그래밍 방식으로 생성하는
 * 재사용 가능한 컴포넌트 팩토리.
 *
 * 기존 BlossomModal (modal-utils.js)의 open/close/confirm 위에
 * 폼 모달 생성, 섹션 빌더, 필드 빌더, 검증 유틸리티를 추가한다.
 *
 * 의존성: modal-utils.js (BlossomModal)
 *
 * 사용법:
 *   var modal = BlsModalFactory.create({
 *     id: 'my-add-modal',
 *     title: '서버 등록',
 *     subtitle: '새 서버 정보를 입력하세요.',
 *     width: 'default',            // 'narrow' | 'default' | 'wide' | 'compact'
 *     sections: [
 *       {
 *         title: '기본 정보',
 *         fields: [
 *           { name: 'name', label: '서버명', type: 'text', required: true, placeholder: '서버명 입력' },
 *           { name: 'ip', label: 'IP 주소', type: 'text' },
 *           { name: 'note', label: '비고', type: 'textarea', wide: true }
 *         ]
 *       }
 *     ],
 *     actions: {
 *       primary: { text: '등록', id: 'my-add-save' },
 *       secondary: { text: '취소' }
 *     },
 *     onSubmit: function(formData) { ... },
 *     onCancel: function() { ... }
 *   });
 *
 * v1.0.0  2026-03-17
 */
(function (root) {
  'use strict';

  /* ── SVG 아이콘 ── */
  var CLOSE_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M12 4L4 12M4 4l8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* ── XSS 방지 ── */
  function esc(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }

  /* ── 유틸 ── */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'className') { node.className = attrs[k]; }
        else if (k === 'html') { node.innerHTML = attrs[k]; }
        else if (k === 'text') { node.textContent = attrs[k]; }
        else if (k.indexOf('data') === 0) { node.setAttribute(k.replace(/([A-Z])/g, '-$1').toLowerCase(), attrs[k]); }
        else { node.setAttribute(k, attrs[k]); }
      });
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (typeof c === 'string') { node.appendChild(document.createTextNode(c)); }
        else if (c) { node.appendChild(c); }
      });
    }
    return node;
  }

  /* ── 폼 데이터 수집 ── */
  function collectFormData(formEl) {
    var data = {};
    if (!formEl) return data;
    var inputs = formEl.querySelectorAll('input, select, textarea');
    for (var i = 0; i < inputs.length; i++) {
      var inp = inputs[i];
      var name = inp.name || inp.id;
      if (!name) continue;
      if (inp.type === 'checkbox') {
        data[name] = inp.checked;
      } else if (inp.type === 'radio') {
        if (inp.checked) data[name] = inp.value;
      } else {
        data[name] = inp.value;
      }
    }
    return data;
  }

  /* ── 필드 생성 ── */
  function createField(field) {
    var rowClass = 'form-row' + (field.wide ? ' form-row-wide' : '');
    var row = el('div', { className: rowClass });

    // 라벨
    if (field.label) {
      var labelEl = el('label');
      labelEl.textContent = field.label + ' ';
      if (field.required) {
        labelEl.appendChild(el('span', { className: 'required', text: '*' }));
      }
      if (field.name) { labelEl.setAttribute('for', field.name); }
      row.appendChild(labelEl);
    }

    var input;
    var type = field.type || 'text';

    switch (type) {
      case 'textarea':
        input = el('textarea', {
          className: 'form-input textarea-large',
          name: field.name || '',
          id: field.name || '',
          placeholder: field.placeholder || '',
          rows: String(field.rows || 4)
        });
        if (field.required) input.setAttribute('required', '');
        if (field.disabled) input.setAttribute('disabled', '');
        if (field.maxlength) input.setAttribute('maxlength', field.maxlength);
        break;

      case 'select':
        input = el('select', {
          className: 'form-input' + (field.searchable ? ' search-select' : ''),
          name: field.name || '',
          id: field.name || ''
        });
        if (field.placeholder) {
          input.appendChild(el('option', { value: '', text: field.placeholder }));
        }
        if (field.options) {
          field.options.forEach(function (opt) {
            var o = typeof opt === 'string' ? { value: opt, label: opt } : opt;
            input.appendChild(el('option', { value: o.value, text: o.label }));
          });
        }
        if (field.required) input.setAttribute('required', '');
        if (field.disabled) input.setAttribute('disabled', '');
        if (field.searchSource) input.setAttribute('data-search-source', field.searchSource);
        if (field.fk) {
          input.classList.add('fk-select');
          input.setAttribute('data-fk', field.fk);
        }
        if (field.parentField) input.setAttribute('data-parent-field', field.parentField);
        break;

      default:
        input = el('input', {
          className: 'form-input' + (field.searchable ? ' search-select' : ''),
          type: type,
          name: field.name || '',
          id: field.name || '',
          placeholder: field.placeholder || ''
        });
        if (field.required) input.setAttribute('required', '');
        if (field.disabled) input.setAttribute('disabled', '');
        if (field.maxlength) input.setAttribute('maxlength', field.maxlength);
        if (field.min !== undefined) input.setAttribute('min', field.min);
        if (field.max !== undefined) input.setAttribute('max', field.max);
        if (field.value !== undefined) input.setAttribute('value', field.value);
        if (field.searchSource) input.setAttribute('data-search-source', field.searchSource);
        if (field.parentField) input.setAttribute('data-parent-field', field.parentField);
        break;
    }

    if (input) {
      row.appendChild(input);
    }

    // 에러 메시지 슬롯
    row.appendChild(el('div', { className: 'field-error-msg' }));

    // 도움말 텍스트
    if (field.help) {
      row.appendChild(el('div', { className: 'field-help-text', text: field.help }));
    }

    return row;
  }

  /* ── 섹션 생성 ── */
  function createSection(section) {
    var sec = el('div', { className: 'form-section' });

    if (section.title) {
      var header = el('div', { className: 'section-header' });
      header.appendChild(el('h4', { text: section.title }));
      sec.appendChild(header);
    }

    var grid = el('div', { className: 'form-grid' });

    if (section.fields) {
      section.fields.forEach(function (field) {
        grid.appendChild(createField(field));
      });
    }

    // 커스텀 HTML 삽입
    if (section.html) {
      var wrapper = el('div', { className: 'form-row form-row-wide' });
      wrapper.innerHTML = section.html;
      grid.appendChild(wrapper);
    }

    sec.appendChild(grid);
    return sec;
  }

  /* ── 모달 생성 ── */
  function create(config) {

    config = config || {};
    var id = config.id || 'bls-modal-' + Date.now();
    var mode = config.mode || 'add'; // 'add' | 'edit'
    var prefix = mode === 'edit' ? 'server-edit' : 'server-add';

    // 사이즈 클래스
    var sizeClass = '';
    if (config.width === 'wide') sizeClass = ' bls-modal-wide';
    else if (config.width === 'narrow') sizeClass = ' bls-modal-narrow';
    else if (config.width === 'compact') sizeClass = ' bls-modal-compact';

    // danger overlay 여부
    var overlayClass = 'bls-modal-overlay' + (config.danger ? ' bls-modal-overlay--danger' : '');

    // 오버레이
    var overlay = el('div', {
      id: id,
      className: overlayClass + sizeClass,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-hidden': 'true',
      'aria-labelledby': id + '-title'
    });

    // 모달 컨테이너
    var content = el('div', { className: 'bls-modal-container ' + prefix + '-content' });


    // 헤더
    var header = el('div', { className: prefix + '-header' });
    var titleWrap = el('div', { className: prefix + '-title' });
    var h3 = el('h3', { id: id + '-title', text: config.title || '' });
    titleWrap.appendChild(h3);
    if (config.subtitle) {
      titleWrap.appendChild(el('p', { className: prefix + '-subtitle', text: config.subtitle }));
    }
    header.appendChild(titleWrap);

    // 닫기 버튼
    var closeBtn = el('button', {
      className: 'close-btn',
      type: 'button',
      title: '닫기',
      'aria-label': '닫기',
      html: CLOSE_ICON
    });
    header.appendChild(closeBtn);
    content.appendChild(header);


    // 본문
    var body = el('div', { className: prefix + '-body' });
    var form = el('form', { id: id + '-form' });
    form.setAttribute('novalidate', '');

    if (config.sections) {
      config.sections.forEach(function (sec) {
        form.appendChild(createSection(sec));
      });
    }

    body.appendChild(form);
    content.appendChild(body);


    // 하단 액션바
    var actions = el('div', { className: prefix + '-actions align-right' });
    var btnGroup = el('div', { className: 'action-buttons right' });

    // 취소 버튼
    if (config.actions && config.actions.secondary !== false) {
      var secOpts = (config.actions && config.actions.secondary) || {};
      var cancelBtn = el('button', {
        type: 'button',
        className: 'btn-secondary',
        text: secOpts.text || '취소'
      });
      if (secOpts.id) cancelBtn.id = secOpts.id;
      btnGroup.appendChild(cancelBtn);
    }

    // 주 액션 버튼
    if (config.actions && config.actions.primary !== false) {
      var priOpts = (config.actions && config.actions.primary) || {};
      var submitBtn = el('button', {
        type: 'button',
        className: 'btn-primary',
        text: priOpts.text || (mode === 'edit' ? '저장' : '등록')
      });
      if (priOpts.id) submitBtn.id = priOpts.id;
      btnGroup.appendChild(submitBtn);
    }

    actions.appendChild(btnGroup);
    content.appendChild(actions);
    overlay.appendChild(content);


    // DOM 에 추가
    document.body.appendChild(overlay);

    /* ── 이벤트 바인딩 ── */

    // 닫기
    function closeHandler() {
      if (typeof config.onCancel === 'function') config.onCancel();
      if (root.BlossomModal) {
        root.BlossomModal.close(overlay);
      } else {
        overlay.classList.remove('show');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
      }
    }

    closeBtn.addEventListener('click', closeHandler);

    // 취소 버튼
    var cancelEl = btnGroup.querySelector('.btn-secondary');
    if (cancelEl) cancelEl.addEventListener('click', closeHandler);

    // 백드롭 클릭 (옵션)
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay && (config.closeOnOverlayClick !== false)) closeHandler();
    });

    // 등록/저장 버튼
    var primaryEl = btnGroup.querySelector('.btn-primary');
    if (primaryEl && typeof config.onSubmit === 'function') {
      primaryEl.addEventListener('click', function () {
        // 간단 검증
        var valid = validateForm(form);
        if (!valid) return;
        var data = collectFormData(form);
        config.onSubmit(data, form, overlay);
      });
    }

    return {
      el: overlay,
      form: form,
      id: id,
      open: function () {
        if (root.BlossomModal) {
          root.BlossomModal.open(overlay);
        } else {
          overlay.classList.add('show');
          overlay.removeAttribute('aria-hidden');
          document.body.classList.add('modal-open');
        }
      },
      close: closeHandler,
      getFormData: function () { return collectFormData(form); },
      setFieldError: function (name, msg) { setFieldError(form, name, msg); },
      clearErrors: function () { clearFieldErrors(form); },
      destroy: function () {
        closeHandler();
        setTimeout(function () {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, 250);
      }
    };
  }

  /* ── 폼 검증 ── */
  function validateForm(formEl) {
    clearFieldErrors(formEl);
    var valid = true;
    var requiredInputs = formEl.querySelectorAll('[required]');
    for (var i = 0; i < requiredInputs.length; i++) {
      var inp = requiredInputs[i];
      if (!inp.value || !inp.value.trim()) {
        var label = '';
        var row = inp.closest('.form-row');
        if (row) {
          var lbl = row.querySelector('label');
          if (lbl) label = lbl.textContent.replace('*', '').trim();
        }
        setFieldError(formEl, inp.name || inp.id, (label || '필수 항목') + '을(를) 입력해주세요.');
        valid = false;
      }
    }
    // 첫 에러 필드로 포커스
    if (!valid) {
      var firstError = formEl.querySelector('.has-error .form-input');
      if (firstError) firstError.focus();
    }
    return valid;
  }

  function setFieldError(formEl, name, msg) {
    var input = formEl.querySelector('[name="' + name + '"], #' + name);
    if (!input) return;
    var row = input.closest('.form-row');
    if (!row) return;
    row.classList.add('has-error');
    input.classList.add('is-error');
    var errEl = row.querySelector('.field-error-msg');
    if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
  }

  function clearFieldErrors(formEl) {
    if (!formEl) return;
    var rows = formEl.querySelectorAll('.form-row.has-error');
    for (var i = 0; i < rows.length; i++) {
      rows[i].classList.remove('has-error');
      var inp = rows[i].querySelector('.form-input');
      if (inp) inp.classList.remove('is-error');
      var errEl = rows[i].querySelector('.field-error-msg');
      if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
    }
  }

  /* ── 기존 모달에 검증 추가 ── */
  function attachValidation(formSelector, submitBtnSelector) {
    var form = document.querySelector(formSelector);
    var btn = document.querySelector(submitBtnSelector);
    if (!form || !btn) return;

    // 입력 시 에러 자동 해제
    form.addEventListener('input', function (e) {
      var row = e.target.closest('.form-row');
      if (row && row.classList.contains('has-error')) {
        row.classList.remove('has-error');
        e.target.classList.remove('is-error');
        var errEl = row.querySelector('.field-error-msg');
        if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
      }
    });

    btn.addEventListener('click', function (e) {
      if (!validateForm(form)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true); // capture phase: 다른 핸들러보다 먼저 실행

    return {
      validate: function () { return validateForm(form); },
      setError: function (n, m) { setFieldError(form, n, m); },
      clearErrors: function () { clearFieldErrors(form); }
    };
  }

  /* ── 섹션/필드 독립 빌더 (기존 HTML에 동적 추가 시 사용) ── */

  /* ── 공개 API ── */
  root.BlsModalFactory = {
    create: create,
    createSection: createSection,
    createField: createField,
    collectFormData: collectFormData,
    validateForm: validateForm,
    setFieldError: setFieldError,
    clearFieldErrors: clearFieldErrors,
    attachValidation: attachValidation
  };

})(window);

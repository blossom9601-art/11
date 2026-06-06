(function(root){
  'use strict';

  var Shared = root.BlossomShared = root.BlossomShared || {};

  function escapeHtml(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch];
    });
  }

  function fieldValue(row, field){
    if(!row) return field.defaultValue || '';
    var value = row[field.key];
    return value == null ? '' : value;
  }

  var filePreviewBound = false;
  var flatpickrLoading = null;
  var FLATPICKR_CSS = '/static/vendor/flatpickr/4.6.13/flatpickr.min.css';
  var FLATPICKR_THEME = '/static/vendor/flatpickr/4.6.13/themes/airbnb.css';
  var FLATPICKR_JS = '/static/vendor/flatpickr/4.6.13/flatpickr.min.js';
  var FLATPICKR_KO = '/static/vendor/flatpickr/4.6.13/l10n/ko.js';

  function ensureCss(href, id){
    var existing = document.getElementById(id);
    if(existing && existing.tagName && existing.tagName.toLowerCase() === 'link'){
      if(existing.getAttribute('href') !== href) existing.setAttribute('href', href);
      return;
    }
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.id = id;
    document.head.appendChild(link);
  }

  function loadScript(src){
    return new Promise(function(resolve, reject){
      var script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = function(){ resolve(); };
      script.onerror = function(){ reject(new Error('Script load failed: ' + src)); };
      document.head.appendChild(script);
    });
  }

  function ensureFlatpickr(){
    ensureCss(FLATPICKR_CSS, 'flatpickr-css');
    ensureCss(FLATPICKR_THEME, 'flatpickr-theme-css');
    if(root.flatpickr) return Promise.resolve();
    if(!flatpickrLoading){
      flatpickrLoading = loadScript(FLATPICKR_JS).then(function(){
        return loadScript(FLATPICKR_KO).catch(function(){});
      });
    }
    return flatpickrLoading;
  }

  function addTodayButton(fp){
    var calendar = fp && fp.calendarContainer;
    if(!calendar || calendar.querySelector('.fp-today-btn')) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'fp-today-btn';
    button.textContent = '오늘';
    button.addEventListener('click', function(){ fp.setDate(new Date(), true); });
    calendar.appendChild(button);
  }

  function ensureCalendarStyle(){
    if(document.getElementById('shared-flatpickr-calendar-style')) return;
    var style = document.createElement('style');
    style.id = 'shared-flatpickr-calendar-style';
    style.textContent = [
      '.flatpickr-calendar{z-index:2147483647!important;width:294px!important;padding:0!important;border:1px solid #d7dce5!important;border-radius:8px!important;box-shadow:0 10px 22px rgba(15,23,42,.14)!important;background:#fff!important;}',
      '.flatpickr-calendar .flatpickr-months{height:38px!important;padding:4px 6px 0!important;}',
      '.flatpickr-calendar .flatpickr-current-month{height:32px!important;line-height:32px!important;padding-top:1px!important;font-size:16px!important;font-weight:400!important;color:#4b5563!important;}',
      '.flatpickr-calendar .flatpickr-current-month .flatpickr-monthDropdown-months,.flatpickr-calendar .flatpickr-current-month input.cur-year{font-size:16px!important;font-weight:400!important;color:#4b5563!important;}',
      '.flatpickr-calendar .flatpickr-rContainer,.flatpickr-calendar .flatpickr-weekdays,.flatpickr-calendar .flatpickr-days,.flatpickr-calendar .dayContainer{width:294px!important;min-width:294px!important;max-width:294px!important;}',
      '.flatpickr-calendar span.flatpickr-weekday{font-size:13px!important;font-weight:700!important;color:#111827!important;}',
      '.flatpickr-calendar .flatpickr-weekdays{height:30px!important;}',
      '.flatpickr-calendar .flatpickr-day{width:42px!important;height:37px!important;line-height:37px!important;max-width:42px!important;flex-basis:42px!important;margin:0!important;border:0!important;border-radius:0!important;box-shadow:inset -1px 0 #edf0f5,inset 0 -1px #edf0f5!important;color:#4b5563!important;}',
      '.flatpickr-calendar .flatpickr-day.prevMonthDay,.flatpickr-calendar .flatpickr-day.nextMonthDay{color:#c8cfd9!important;}',
      '.flatpickr-calendar .flatpickr-day:hover{background:#eef2ff!important;border-color:transparent!important;color:#374151!important;}',
      '.flatpickr-calendar .flatpickr-day.today:not(.selected):not(.startRange):not(.endRange){box-shadow:inset -1px 0 #edf0f5,inset 0 -2px #ef4444!important;font-weight:700!important;color:#111827!important;}',
      '.flatpickr-calendar .flatpickr-day.selected,.flatpickr-calendar .flatpickr-day.startRange,.flatpickr-calendar .flatpickr-day.endRange,.flatpickr-calendar .flatpickr-day.inRange,.flatpickr-calendar .flatpickr-day.selected:hover,.flatpickr-calendar .flatpickr-day.startRange:hover,.flatpickr-calendar .flatpickr-day.endRange:hover{background:#5c67e8!important;border-color:#5c67e8!important;box-shadow:none!important;color:#fff!important;}',
      '.flatpickr-calendar .flatpickr-prev-month,.flatpickr-calendar .flatpickr-next-month{color:#6b7280!important;fill:#6b7280!important;}',
      '.flatpickr-calendar .fp-today-btn{position:absolute!important;right:10px!important;bottom:8px!important;border:0!important;border-radius:7px!important;background:#5c67e8!important;color:#fff!important;font-size:12px!important;font-weight:700!important;padding:5px 10px!important;line-height:1.1!important;cursor:pointer!important;}',
      '.flatpickr-calendar .fp-today-btn:hover{background:#4f58d9!important;}'
    ].join('');
    document.head.appendChild(style);
  }

  function initDatePickers(scope){
    var rootEl = scope || document;
    var inputs = rootEl.querySelectorAll('input[data-flatpickr-date="true"]');
    if(!inputs.length) return;
    ensureFlatpickr().then(function(){
      ensureCalendarStyle();
      Array.prototype.forEach.call(inputs, function(input){
        if(input._flatpickr) return;
        root.flatpickr(input, {
          locale: (root.flatpickr && root.flatpickr.l10ns && root.flatpickr.l10ns.ko) ? root.flatpickr.l10ns.ko : 'ko',
          dateFormat: 'Y-m-d',
          allowInput: true,
          disableMobile: true,
          onReady: function(_, __, inst){ addTodayButton(inst); },
          onOpen: function(_, __, inst){ addTodayButton(inst); }
        });
      });
    }).catch(function(){});
  }

  function bindFilePreview(){
    if(filePreviewBound) return;
    filePreviewBound = true;
    document.addEventListener('change', function(event){
      var input = event.target;
      if(!input || !input.classList || !input.classList.contains('bls-file-input')) return;
      var field = input.closest('.bls-file-field');
      if(!field) return;
      var file = input.files && input.files[0] ? input.files[0] : null;
      var preview = field.querySelector('.bls-file-preview');
      var image = preview ? preview.querySelector('img') : null;
      var name = field.querySelector('.bls-file-name');
      if(file){
        if(image && (!file.type || file.type.indexOf('image/') === 0)) image.src = URL.createObjectURL(file);
        if(preview) preview.hidden = false;
        if(name) name.textContent = '';
        field.classList.add('has-file');
      } else {
        if(preview) preview.hidden = true;
        if(name) name.textContent = '선택된 파일 없음';
        field.classList.remove('has-file');
      }
    });
  }

  function renderOptions(field, value, sources){
    var options = field.options || [];
    if(field.optionsSource && sources && sources[field.optionsSource]){
      options = sources[field.optionsSource];
    }
    var hasValue = !value;
    var html = field.placeholder === false ? '' : '<option value="">' + escapeHtml(field.placeholder || '선택') + '</option>';
    options.forEach(function(option){
      var item = typeof option === 'string' ? { value: option, label: option } : option;
      var optValue = item.value != null ? item.value : (item.name != null ? item.name : item.label);
      var optLabel = item.label != null ? item.label : (item.name != null ? item.name : optValue);
      if(String(optValue) === String(value)) hasValue = true;
      html += '<option value="' + escapeHtml(optValue) + '"' + (String(optValue) === String(value) ? ' selected' : '') + '>' + escapeHtml(optLabel) + '</option>';
    });
    if(field.preserveUnknown && value && !hasValue){
      html = '<option value="' + escapeHtml(value) + '" selected>' + escapeHtml(value) + ' (등록되지 않은 제조사)</option>' + html;
    }
    return html;
  }

  function renderField(field, row, sources){
    var value = fieldValue(row, field);
    var required = field.required ? '<span class="required">*</span>' : '';
    var full = field.full ? ' full' : '';
    var attrs = ' name="' + escapeHtml(field.key) + '" class="form-input"' + (field.required ? ' required' : '');
    var html = '<div class="form-row' + full + '"><label>' + escapeHtml(field.label || field.key) + required + '</label>';

    if(field.type === 'file'){
      var hiddenKey = field.hiddenKey || field.valueKey || '';
      var storedValue = hiddenKey && row ? (row[hiddenKey] == null ? '' : row[hiddenKey]) : value;
      var previewClass = field.previewClass || 'bls-file-preview';
      var fieldClass = field.fieldClass || '';
      var inputClass = field.inputClass || '';
      var icon = field.icon || '/static/image/svg/free-icon-font-folder-open.svg';
      var accept = field.accept ? ' accept="' + escapeHtml(field.accept) + '"' : '';
      if(hiddenKey){
        html += '<input type="hidden" name="' + escapeHtml(hiddenKey) + '" value="' + escapeHtml(storedValue) + '">';
      }
      html += '<div class="bls-file-field ' + escapeHtml(fieldClass) + (storedValue ? ' has-file' : '') + '">';
      if(field.preview !== false){
        html += '<div class="bls-file-preview ' + escapeHtml(previewClass) + '"' + (storedValue ? '' : ' hidden') + '><img src="' + escapeHtml(storedValue) + '" alt="' + escapeHtml(field.previewAlt || '미리보기') + '"></div>';
      }
      html += '<label class="bls-file-upload-btn ' + escapeHtml(field.buttonClass || '') + '" title="' + escapeHtml(field.buttonTitle || '파일 첨부') + '" aria-label="' + escapeHtml(field.buttonTitle || '파일 첨부') + '">';
      html += '<input type="file" name="' + escapeHtml(field.key) + '" class="bls-file-input ' + escapeHtml(inputClass) + '" hidden' + accept + '>';
      html += '<img src="' + escapeHtml(icon) + '" alt="" class="bls-file-upload-icon ' + escapeHtml(field.iconClass || '') + '" aria-hidden="true">';
      html += '</label><span class="bls-file-name ' + escapeHtml(field.nameClass || '') + '">' + (storedValue ? '' : '선택된 파일 없음') + '</span></div>';
    } else if(field.type === 'textarea'){
      html += '<textarea' + attrs + ' rows="' + escapeHtml(field.rows || 4) + '">' + escapeHtml(value) + '</textarea>';
    } else if(field.type === 'select'){
      var cls = field.searchable ? ' form-input search-select' : ' form-input';
      attrs = ' name="' + escapeHtml(field.key) + '" class="' + cls + '"' + (field.required ? ' required' : '');
      if(field.searchable) attrs += ' data-searchable="true" data-placeholder="' + escapeHtml(field.placeholder || '선택') + '"';
      html += '<select' + attrs + '>' + renderOptions(field, value, sources) + '</select>';
    } else if(field.type === 'date'){
      html += '<input type="text" name="' + escapeHtml(field.key) + '" class="form-input date-input"' + (field.required ? ' required' : '') + ' data-flatpickr-date="true" value="' + escapeHtml(value) + '" placeholder="' + escapeHtml(field.placeholder || '연도-월-일') + '" autocomplete="off">';
    } else if(field.type === 'hidden'){
      html = '<input type="hidden" name="' + escapeHtml(field.key) + '" value="' + escapeHtml(value) + '">';
    } else {
      var fkIgnore = field.key === 'model' && (field.type || 'text') === 'text' ? ' data-fk-ignore="1" data-searchable="false"' : '';
      html += '<input type="' + escapeHtml(field.type || 'text') + '"' + attrs + fkIgnore + ' value="' + escapeHtml(value) + '" autocomplete="off">';
    }
    if(field.type !== 'hidden') html += '</div>';
    return html;
  }

  Shared.createFormBuilder = function(options){
    options = options || {};
    var schema = options.schema || [];
    var sources = options.sources || {};
    bindFilePreview();

    function render(row){
      return schema.map(function(section){
        var fields = section.fields || [];
        return '<div class="form-section">' +
          '<div class="section-header"><h4>' + escapeHtml(section.section || section.title || '') + '</h4></div>' +
          '<div class="form-grid">' + fields.map(function(field){ return renderField(field, row, sources); }).join('') + '</div>' +
        '</div>';
      }).join('');
    }

    function collect(form){
      var data = {};
      if(!form) return data;
      var elements = form.elements;
      for(var i = 0; i < elements.length; i += 1){
        var el = elements[i];
        if(!el.name || el.disabled) continue;
        if(el.type === 'checkbox') data[el.name] = !!el.checked;
        else if(el.type === 'file') data[el.name] = el.files && el.files[0] ? el.files[0] : null;
        else data[el.name] = String(el.value || '').trim();
      }
      return data;
    }

    function validate(data){
      var errors = [];
      schema.forEach(function(section){
        (section.fields || []).forEach(function(field){
          if(field.required && !String(data[field.key] || '').trim()){
            errors.push((field.label || field.key) + '을(를) 입력하세요.');
          }
          if(typeof field.validate === 'function'){
            var message = field.validate(data[field.key], data);
            if(message) errors.push(message);
          }
        });
      });
      return errors;
    }

    return {
      render: render,
      collect: collect,
      validate: validate,
      enhance: initDatePickers,
      setSources: function(nextSources){ sources = nextSources || {}; }
    };
  };

})(window);

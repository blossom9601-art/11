(function(root){
  'use strict';

  var Modules = root.BlossomModules = root.BlossomModules || {};
  var XLSX_CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  var UPLOAD_HEADERS = ['모델명', '제조사', '유형', '릴리즈 일자', 'EOSL 일자', '수량', '비고'];
  var HEADER_KEYS = {
    '모델명': 'model',
    '제조사': 'vendor',
    '유형': 'hw_type',
    '릴리즈 일자': 'release_date',
    'EOSL 일자': 'eosl',
    '수량': 'qty',
    '비고': 'note'
  };

  function escapeHtml(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(character){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character];
    });
  }

  function text(value){
    return String(value == null ? '' : value).trim();
  }

  function integerValue(value){
    var raw = text(value);
    if(raw === '') return '';
    if(!/^-?\d+$/.test(raw)) return null;
    var parsed = parseInt(raw, 10);
    return isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  function selectedNumericIds(helpers){
    return (helpers.selectedIds ? helpers.selectedIds() : []).map(function(id){ return Number(id); }).filter(function(id){ return isFinite(id) && id > 0; });
  }

  function notify(helpers, message, title){
    if(helpers && typeof helpers.showMessage === 'function') helpers.showMessage(message, title || '알림');
    else alert(message);
  }

  function ensureXlsx(){
    return new Promise(function(resolve, reject){
      if(root.XLSX){ resolve(); return; }
      var existing = document.querySelector('script[data-hardware-xlsx]');
      if(existing){
        existing.addEventListener('load', function(){ resolve(); }, { once: true });
        existing.addEventListener('error', function(){ reject(new Error('엑셀 라이브러리를 불러오지 못했습니다.')); }, { once: true });
        return;
      }
      var script = document.createElement('script');
      script.src = XLSX_CDN;
      script.async = true;
      script.setAttribute('data-hardware-xlsx', '1');
      script.onload = function(){ resolve(); };
      script.onerror = function(){ reject(new Error('엑셀 라이브러리를 불러오지 못했습니다.')); };
      document.head.appendChild(script);
    });
  }

  function openElement(element){
    if(!element) return;
    if(root.BlossomModal) root.BlossomModal.open(element);
    else element.classList.add('show');
  }

  function closeElement(element){
    if(!element) return;
    if(root.BlossomModal) root.BlossomModal.close(element);
    else element.classList.remove('show');
  }

  function optionHtml(options, selectedValue){
    var html = '<option value="">변경 안 함</option>';
    (options || []).forEach(function(option){
      var value = typeof option === 'string' ? option : option.value;
      var label = typeof option === 'string' ? option : option.label;
      var selected = String(value) === String(selectedValue || '') ? ' selected' : '';
      html += '<option value="' + escapeHtml(value) + '"' + selected + '>' + escapeHtml(label || value) + '</option>';
    });
    return html;
  }

  function modalMarkup(context){
    var label = escapeHtml(context.label || '하드웨어');
    var listTitle = escapeHtml(context.listTitle || label);
    return '' +
      '<div id="hardware-upload-modal" class="server-add-modal modal-overlay-full" data-modal aria-hidden="true" role="dialog" aria-modal="true">' +
        '<div class="server-add-content hardware-action-modal">' +
          '<div class="server-add-header"><div class="server-add-title"><h3>' + listTitle + ' 업로드</h3><p class="server-add-subtitle">엑셀 행을 ' + label + ' 유형으로 등록합니다.</p></div><button type="button" class="close-btn" data-hardware-close="hardware-upload-modal" title="닫기" aria-label="닫기"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>' +
          '<div class="server-add-body">' +
            '<div class="hardware-upload-dropzone" data-hardware-upload-dropzone tabindex="0" role="button" aria-label="엑셀 파일 선택">' +
              '<img src="/static/image/svg/list/free-icon-upload.svg" alt="" class="hardware-upload-icon" aria-hidden="true">' +
              '<strong>엑셀 파일 선택</strong><span>.xls, .xlsx / 10MB 이하</span>' +
            '</div>' +
            '<input type="file" data-hardware-upload-input accept=".xls,.xlsx" hidden>' +
            '<div class="hardware-upload-meta" data-hardware-upload-meta hidden><span data-hardware-upload-file></span></div>' +
          '</div>' +
          '<div class="server-add-actions align-right"><div class="action-buttons right"><button type="button" class="btn-secondary" data-hardware-template>템플릿 다운로드</button><button type="button" class="btn-primary" data-hardware-upload-confirm disabled>업로드</button></div></div>' +
        '</div>' +
      '</div>' +
      '<div id="hardware-bulk-modal" class="server-add-modal modal-overlay-full" data-modal aria-hidden="true" role="dialog" aria-modal="true">' +
        '<div class="server-add-content hardware-action-modal">' +
          '<div class="server-add-header"><div class="server-add-title"><h3>' + listTitle + ' 일괄변경</h3><p class="server-add-subtitle" data-hardware-bulk-subtitle></p></div><button type="button" class="close-btn" data-hardware-close="hardware-bulk-modal" title="닫기" aria-label="닫기"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>' +
          '<div class="server-add-body"><form data-hardware-bulk-form></form></div>' +
          '<div class="server-add-actions align-right"><div class="action-buttons right"><button type="button" class="btn-primary" data-hardware-bulk-apply>저장</button></div></div>' +
        '</div>' +
      '</div>';
  }

  function ensureShell(context, helpers){
    var shellKey = String(context.kind || context.label || 'hardware');
    var shell = document.querySelector('[data-hardware-actions-shell]');
    if(shell && shell.getAttribute('data-hardware-context') !== shellKey){
      closeElement(document.getElementById('hardware-upload-modal'));
      closeElement(document.getElementById('hardware-bulk-modal'));
      if(shell.parentNode) shell.parentNode.removeChild(shell);
      shell = null;
    }
    if(!shell){
      shell = document.createElement('div');
      shell.setAttribute('data-hardware-actions-shell', '1');
      shell.setAttribute('data-hardware-context', shellKey);
      shell.innerHTML = modalMarkup(context);
      document.body.appendChild(shell);
      bindShell(context, shell);
    }
    shell.__hardwareHelpers = helpers;
    return shell;
  }

  function resetUpload(shell){
    var input = shell.querySelector('[data-hardware-upload-input]');
    var meta = shell.querySelector('[data-hardware-upload-meta]');
    var fileLabel = shell.querySelector('[data-hardware-upload-file]');
    var confirmButton = shell.querySelector('[data-hardware-upload-confirm]');
    if(input) input.value = '';
    if(meta) meta.hidden = true;
    if(fileLabel) fileLabel.textContent = '';
    if(confirmButton) confirmButton.disabled = true;
  }

  function setUploadFile(shell, file){
    var helpers = shell.__hardwareHelpers;
    var meta = shell.querySelector('[data-hardware-upload-meta]');
    var fileLabel = shell.querySelector('[data-hardware-upload-file]');
    var confirmButton = shell.querySelector('[data-hardware-upload-confirm]');
    if(!file){ resetUpload(shell); return; }
    var fileName = String(file.name || '').toLowerCase();
    var validExt = fileName.indexOf('.xls') === fileName.length - 4 || fileName.indexOf('.xlsx') === fileName.length - 5;
    var validSize = Number(file.size || 0) <= 10 * 1024 * 1024;
    if(!validExt || !validSize){
      notify(helpers, '지원하지 않는 파일이거나 10MB를 초과합니다. .xls/.xlsx만 가능합니다.', '업로드 오류');
      return;
    }
    if(fileLabel) fileLabel.textContent = file.name + ' (' + Math.max(1, Math.round(file.size / 1024)) + ' KB)';
    if(meta) meta.hidden = false;
    if(confirmButton) confirmButton.disabled = false;
  }

  function bindShell(context, shell){
    shell.addEventListener('click', function(event){
      var closeButton = event.target.closest('[data-hardware-close]');
      if(closeButton){ closeElement(document.getElementById(closeButton.getAttribute('data-hardware-close'))); return; }
      var dropzone = event.target.closest('[data-hardware-upload-dropzone]');
      if(dropzone){
        var input = shell.querySelector('[data-hardware-upload-input]');
        if(input) input.click();
        return;
      }
      if(event.target.closest('[data-hardware-template]')){ downloadTemplate(context, shell.__hardwareHelpers); return; }
      if(event.target.closest('[data-hardware-upload-confirm]')){ uploadFile(context, shell); return; }
      if(event.target.closest('[data-hardware-bulk-apply]')){ applyBulk(context, shell); }
    });
    shell.addEventListener('keydown', function(event){
      var dropzone = event.target.closest('[data-hardware-upload-dropzone]');
      if(dropzone && (event.key === 'Enter' || event.key === ' ')){
        event.preventDefault();
        var input = shell.querySelector('[data-hardware-upload-input]');
        if(input) input.click();
      }
    });
    shell.addEventListener('change', function(event){
      if(event.target.matches('[data-hardware-upload-input]')) setUploadFile(shell, event.target.files && event.target.files[0]);
    });
    var uploadDropzone = shell.querySelector('[data-hardware-upload-dropzone]');
    if(uploadDropzone){
      uploadDropzone.addEventListener('dragover', function(event){ event.preventDefault(); uploadDropzone.classList.add('dragover'); });
      uploadDropzone.addEventListener('dragleave', function(){ uploadDropzone.classList.remove('dragover'); });
      uploadDropzone.addEventListener('drop', function(event){
        event.preventDefault();
        uploadDropzone.classList.remove('dragover');
        var input = shell.querySelector('[data-hardware-upload-input]');
        var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
        if(input && event.dataTransfer && event.dataTransfer.files) input.files = event.dataTransfer.files;
        setUploadFile(shell, file);
      });
    }
  }

  function downloadTemplate(context, helpers){
    ensureXlsx().then(function(){
      var workbook = root.XLSX.utils.book_new();
      var templateSheet = root.XLSX.utils.aoa_to_sheet([UPLOAD_HEADERS]);
      templateSheet['!cols'] = UPLOAD_HEADERS.map(function(header){ return { wch: header === '모델명' || header === '비고' ? 22 : 14 }; });
      var guide = [
        ['엑셀 업로드 가이드'],
        [''],
        ['첫 행의 컬럼 제목은 템플릿과 같은 순서여야 합니다.'],
        ['수량은 숫자만 입력합니다. 공란이면 0으로 처리합니다.'],
        ['유형 값'],
        [(context.typeOptions || []).join(', ')]
      ];
      var guideSheet = root.XLSX.utils.aoa_to_sheet(guide);
      guideSheet['!cols'] = [{ wch: 90 }];
      root.XLSX.utils.book_append_sheet(workbook, templateSheet, 'Template');
      root.XLSX.utils.book_append_sheet(workbook, guideSheet, '가이드');
      root.XLSX.writeFile(workbook, (context.kind || 'hardware') + '_upload_template.xlsx');
    }).catch(function(err){ notify(helpers, err.message || '템플릿을 생성하지 못했습니다.', '업로드 오류'); });
  }

  function rowIsEmpty(row){
    return !row || row.every(function(value){ return text(value) === ''; });
  }

  function parseRows(rows){
    if(!rows || !rows.length) return { rows: [], errors: ['엑셀 데이터가 비어있습니다.'] };
    var headers = rows[0].map(function(header){ return text(header); });
    var headerOk = headers.length === UPLOAD_HEADERS.length && headers.every(function(header, index){ return header === UPLOAD_HEADERS[index]; });
    if(!headerOk) return { rows: [], errors: ['컬럼 제목이 현재 템플릿과 일치하지 않습니다.'] };
    var importedRows = [];
    var errors = [];
    for(var rowIndex = 1; rowIndex < rows.length; rowIndex += 1){
      var excelRow = rows[rowIndex];
      if(rowIsEmpty(excelRow)) continue;
      var record = {};
      headers.forEach(function(header, columnIndex){ record[HEADER_KEYS[header]] = text(excelRow[columnIndex]); });
      if(record.qty !== ''){
        var quantity = integerValue(record.qty);
        if(quantity === null) errors.push((rowIndex + 1) + '행: 수량은 0 이상의 숫자만 입력하세요.');
        else record.qty = quantity;
      }
      importedRows.push(record);
    }
    if(!importedRows.length) errors.push('업로드할 데이터가 없습니다.');
    return { rows: importedRows, errors: errors };
  }

  function uploadFile(context, shell){
    var helpers = shell.__hardwareHelpers;
    var input = shell.querySelector('[data-hardware-upload-input]');
    var file = input && input.files && input.files[0];
    if(!file){ notify(helpers, '파일을 선택하세요.', '업로드 안내'); return; }
    ensureXlsx().then(function(){
      var reader = new FileReader();
      reader.onload = function(){
        var parsed;
        try{
          var workbook = root.XLSX.read(new Uint8Array(reader.result), { type: 'array' });
          var sheetName = workbook.SheetNames[0];
          var sheet = sheetName ? workbook.Sheets[sheetName] : null;
          parsed = parseRows(root.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }));
        }catch(parseErr){
          notify(helpers, '엑셀 파싱 중 오류가 발생했습니다. 파일을 확인해주세요.', '업로드 오류');
          return;
        }
        if(parsed.errors.length){
          var preview = parsed.errors.slice(0, 20).join('\n');
          var overflow = parsed.errors.length > 20 ? '\n...외 ' + (parsed.errors.length - 20) + '건' : '';
          notify(helpers, '업로드 실패: 유효성 검사 오류가 있습니다.\n\n' + preview + overflow, '업로드 실패');
          return;
        }
        createRows(parsed.rows, helpers, shell);
      };
      reader.onerror = function(){ notify(helpers, '파일을 읽는 중 오류가 발생했습니다.', '업로드 오류'); };
      reader.readAsArrayBuffer(file);
    }).catch(function(err){ notify(helpers, err.message || '엑셀 라이브러리를 불러오지 못했습니다.', '업로드 오류'); });
  }

  function createRows(rows, helpers, shell){
    var confirmButton = shell.querySelector('[data-hardware-upload-confirm]');
    var successCount = 0;
    var failures = [];
    var chain = Promise.resolve();
    if(confirmButton) confirmButton.disabled = true;
    rows.forEach(function(row){
      chain = chain.then(function(){
        return helpers.api.create(row).then(function(){ successCount += 1; }).catch(function(err){ failures.push(err.message || ((row.model || '항목') + ' 등록 실패')); });
      });
    });
    chain.then(function(){
      return helpers.load().then(function(){
        if(confirmButton) confirmButton.disabled = false;
        if(failures.length){
          var preview = failures.slice(0, 3).join('\n');
          var overflow = failures.length > 3 ? '\n...외 ' + (failures.length - 3) + '건' : '';
          notify(helpers, '총 ' + successCount + '건 성공, ' + failures.length + '건 실패했습니다.\n' + preview + overflow, '업로드 결과');
        }else{
          closeElement(document.getElementById('hardware-upload-modal'));
          notify(helpers, successCount + '개 행이 업로드되었습니다.', '업로드 완료');
        }
      });
    }).catch(function(err){
      if(confirmButton) confirmButton.disabled = false;
      notify(helpers, err.message || '업로드 후 목록을 새로고침하지 못했습니다.', '업로드 오류');
    });
  }

  function buildBulkForm(context, shell, count){
    var helpers = shell.__hardwareHelpers;
    var sources = helpers.sources || {};
    var form = shell.querySelector('[data-hardware-bulk-form]');
    var subtitle = shell.querySelector('[data-hardware-bulk-subtitle]');
    if(subtitle) subtitle.textContent = '선택된 ' + count + '개의 ' + (context.label || '하드웨어') + ' 유형에서 입력한 필드만 변경합니다.';
    if(!form) return;
    form.innerHTML = '' +
      '<div class="form-section"><div class="section-header"><h4>하드웨어</h4></div><div class="form-grid">' +
        '<div class="form-row"><label>모델명</label><input class="form-input" data-hardware-bulk-field="model" placeholder="변경 안 함"></div>' +
        '<div class="form-row"><label>제조사</label><select class="form-input search-select" data-searchable="true" data-placeholder="변경 안 함" data-hardware-bulk-field="vendor">' + optionHtml(sources.manufacturers || [], '') + '</select></div>' +
        '<div class="form-row"><label>유형</label><select class="form-input search-select" data-searchable="true" data-placeholder="변경 안 함" data-hardware-bulk-field="hw_type">' + optionHtml(context.typeOptions || [], '') + '</select></div>' +
        '<div class="form-row"><label>릴리즈 일자</label><input class="form-input" data-hardware-bulk-field="release_date" placeholder="YYYY-MM-DD"></div>' +
        '<div class="form-row"><label>EOSL 일자</label><input class="form-input" data-hardware-bulk-field="eosl" placeholder="YYYY-MM-DD"></div>' +
        '<div class="form-row form-row-wide full"><label>비고</label><textarea class="form-input textarea-large" rows="6" data-hardware-bulk-field="note" placeholder="변경 안 함"></textarea></div>' +
      '</div></div>';
    if(root.BlossomSearchableSelect && typeof root.BlossomSearchableSelect.syncAll === 'function') root.BlossomSearchableSelect.syncAll(form);
  }

  function collectBulkPayload(shell){
    var payload = {};
    var controls = shell.querySelectorAll('[data-hardware-bulk-field]');
    Array.prototype.forEach.call(controls, function(control){
      var key = control.getAttribute('data-hardware-bulk-field');
      var value = text(control.value);
      if(key && value !== '') payload[key] = value;
    });
    return payload;
  }

  function applyBulk(context, shell){
    var helpers = shell.__hardwareHelpers;
    var ids = selectedNumericIds(helpers);
    var payload = collectBulkPayload(shell);
    var keys = Object.keys(payload);
    var applyButton = shell.querySelector('[data-hardware-bulk-apply]');
    var successCount = 0;
    var failures = [];
    var chain = Promise.resolve();
    if(!ids.length){ notify(helpers, '일괄변경할 행을 먼저 선택하세요.', '안내'); return; }
    if(!keys.length){ notify(helpers, '변경할 값을 1개 이상 입력하세요.', '안내'); return; }
    if(applyButton) applyButton.disabled = true;
    ids.forEach(function(id){
      chain = chain.then(function(){
        return helpers.api.update(id, payload).then(function(){ successCount += 1; }).catch(function(err){ failures.push(err.message || (id + ' 저장 실패')); });
      });
    });
    chain.then(function(){
      return helpers.load().then(function(){
        if(applyButton) applyButton.disabled = false;
        closeElement(document.getElementById('hardware-bulk-modal'));
        if(failures.length){
          notify(helpers, successCount + '개 저장, ' + failures.length + '개 실패했습니다.', '일괄변경 결과');
        }else{
          notify(helpers, successCount + '개 항목이 저장되었습니다.', '일괄변경 완료');
        }
      });
    }).catch(function(err){
      if(applyButton) applyButton.disabled = false;
      notify(helpers, err.message || '일괄변경 후 목록을 새로고침하지 못했습니다.', '일괄변경 오류');
    });
  }

  function openUpload(context, helpers){
    var shell = ensureShell(context, helpers);
    resetUpload(shell);
    openElement(document.getElementById('hardware-upload-modal'));
  }

  function openBulk(context, ids, helpers){
    if(!ids.length){ notify(helpers, '일괄변경할 행을 먼저 선택하세요.', '안내'); return; }
    var shell = ensureShell(context, helpers);
    buildBulkForm(context, shell, ids.length);
    openElement(document.getElementById('hardware-bulk-modal'));
  }

  Modules.createHardwareActions = function(context){
    context = context || {};
    return {
      toolbarActions: [
        { action: 'upload', title: '업로드', icon: '/static/image/svg/list/free-icon-upload.svg', id: 'system-upload-btn' }
      ],
      onAction: function(actionName, helpers){
        if(actionName === 'upload'){ openUpload(context, helpers); return true; }
        return false;
      },
      onBulk: function(ids, rows, helpers){
        openBulk(context, ids || [], helpers);
      }
    };
  };

})(window);
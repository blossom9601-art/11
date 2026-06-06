(function(root){
  'use strict';

  var Shared = root.BlossomShared = root.BlossomShared || {};

  function escapeHtml(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch];
    });
  }

  function formatTemplate(template, context){
    return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, function(_, key){
      return context && context[key] != null ? String(context[key]) : '';
    });
  }

  function pageRows(state){
    var start = (state.page - 1) * state.pageSize;
    return state.filtered.slice(start, start + state.pageSize);
  }

  function filterRows(rows, columns, search){
    var q = String(search || '').trim().toLowerCase();
    if(!q) return rows.slice();
    return rows.filter(function(row){
      return columns.some(function(column){
        if(column.searchable === false) return false;
        return String(row[column.key] || '').toLowerCase().indexOf(q) >= 0;
      });
    });
  }

  function makeCsv(rows, columns){
    var lines = [columns.map(function(col){ return col.label || col.key; })];
    rows.forEach(function(row){
      lines.push(columns.map(function(col){ return row[col.key] == null ? '' : row[col.key]; }));
    });
    return lines.map(function(line){
      return line.map(function(cell){ return '"' + String(cell).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\r\n');
  }

  function downloadCsv(filename, rows, columns){
    var blob = new Blob(['\ufeff' + makeCsv(rows, columns)], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function(){ URL.revokeObjectURL(link.href); }, 1000);
  }

  function selectedRows(table, state, rowKey){
    var selected = table ? table.getSelectedIds() : [];
    if(!selected.length) return [];
    var idMap = {};
    selected.forEach(function(id){ idMap[String(id)] = true; });
    return (state.rows || []).filter(function(row){ return idMap[String(row[rowKey || 'id'])]; });
  }

  function addClassNames(element, classNames){
    String(classNames || '').split(/\s+/).forEach(function(className){
      if(className) element.classList.add(className);
    });
  }

  function closeElementModal(modal){
    if(!modal) return;
    if(root.BlossomModal) root.BlossomModal.close(modal);
    else {
      modal.classList.remove('show');
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('modal-open');
    }
  }

  function openElementModal(modal, focusSelector){
    if(!modal) return;
    if(root.BlossomModal) root.BlossomModal.open(modal, focusSelector ? { focusSelector: focusSelector } : {});
    else {
      modal.classList.add('show');
      modal.removeAttribute('aria-hidden');
      document.body.classList.add('modal-open');
      if(focusSelector){
        var target = modal.querySelector(focusSelector);
        if(target) setTimeout(function(){ target.focus(); }, 0);
      }
    }
  }

  function mount(options){
    options = options || {};
    var rootEl = options.root;
    var config = options.config || {};
    var context = options.context || {};
    var api = options.api;
    var schema = options.schema || [];
    var sources = {};
    var state = {
      rows: [],
      filtered: [],
      page: 1,
      pageSize: config.pageSize || 10,
      search: '',
      editRow: null
    };
    var table;
    var formBuilder;
    var modalHost;
    var downloadRows = [];
    var downloadSelectedRows = [];

    if(config.actions && config.actions.analytics){
      root.__analyticsGetData = function(){
        if(typeof config.getAnalyticsData === 'function') return config.getAnalyticsData(state);
        return state.filtered.length ? state.filtered : state.rows;
      };
    }

    if(!rootEl || !api) return null;

    function renderShell(){
      rootEl.classList.add('bls-management-page');
      if(config.pageClass) addClassNames(rootEl, config.pageClass);
      rootEl.innerHTML = '' +
        (config.showHeader === false ? '' : '<div class="page-header">' +
          '<h1>' + escapeHtml(formatTemplate(config.title, context)) + '</h1>' +
          '<p>' + escapeHtml(formatTemplate(config.description, context)) + '</p>' +
        '</div>') +
        '<div class="tab-header bls-management-toolbar">' +
          '<div class="tab-header-left"><h2>' + escapeHtml(context.label || config.listTitle || config.title || '') + ' <span class="count-badge" id="system-count" data-role="count">0</span></h2></div>' +
          '<div class="tab-header-right">' +
            '<div class="search-container" role="search"><div class="search-input-wrapper">' +
              '<img src="/static/image/svg/list/free-icon-search.svg" alt="검색" class="search-icon">' +
              '<input type="text" class="search-input" data-role="search" placeholder="검색" autocomplete="off">' +
              '<button type="button" class="search-clear-btn" data-role="search-clear" title="지우기" aria-label="검색어 지우기"><img src="/static/image/svg/list/free-icon-trash.svg" alt="" class="search-clear-icon" aria-hidden="true"></button>' +
            '</div></div>' +
            '<div class="page-size-selector"><select class="page-size-select" data-role="page-size" aria-label="페이지 당 행 수"><option value="10">10 개</option><option value="20">20 개</option><option value="50">50 개</option><option value="100">100 개</option></select></div>' +
            actionButton('delete', '삭제처리', '/static/image/svg/list/free-icon-trash.svg', config.actions && config.actions.delete) +
            actionButton('bulk', '일괄변경', '/static/image/svg/list/free-icon-bulk-edit.svg', config.actions && config.actions.bulk) +
            actionButton('stats', '통계', '/static/image/svg/list/free-icon-chart.svg', config.actions && config.actions.statistics) +
            actionButton('analytics', '통계 분석', '/static/image/svg/free-icon-font-analytics-magnifying-glass.svg', config.actions && config.actions.analytics === true) +
            actionButton('export', 'CSV 다운로드', '/static/image/svg/list/free-icon-download.svg', config.actions && config.actions.export) +
            renderToolbarActions() +
            actionButton('add', '추가', '/static/image/svg/list/free-icon-plus.svg', config.actions && config.actions.create) +
          '</div>' +
        '</div>' +
        '<div data-role="table"></div>' +
        '<div class="modern-pagination bls-management-pagination">' +
          '<div class="pagination-info"><span data-role="pagination-info">0개 항목</span></div>' +
          '<div class="pagination-controls">' +
            '<button type="button" class="pagination-btn" id="system-first" data-page="first" title="처음" aria-label="처음"><img src="/static/image/svg/expand_more.svg" class="pagination-icon rotate-90" alt="처음"></button>' +
            '<button type="button" class="pagination-btn" id="system-prev" data-page="prev" title="이전" aria-label="이전"><img src="/static/image/svg/expand_more.svg" class="pagination-icon rotate-90" alt="이전"></button>' +
            '<div class="page-numbers" id="system-page-numbers" data-role="page-numbers"></div>' +
            '<button type="button" class="pagination-btn" id="system-next" data-page="next" title="다음" aria-label="다음"><img src="/static/image/svg/expand_more.svg" class="pagination-icon rotate--90" alt="다음"></button>' +
            '<button type="button" class="pagination-btn" id="system-last" data-page="last" title="마지막" aria-label="마지막"><img src="/static/image/svg/expand_more.svg" class="pagination-icon rotate--90" alt="마지막"></button>' +
          '</div>' +
        '</div>';
    }

    function createModalHost(){
      var existing = document.querySelectorAll('.bls-management-modal-root');
      Array.prototype.forEach.call(existing, function(node){
        if(node && node.parentNode) node.parentNode.removeChild(node);
      });
      var host = document.createElement('div');
      host.className = 'bls-management-modal-root';
      host.setAttribute('data-owner', rootEl.id || config.id || context.kind || 'management');
      host.innerHTML = modalMarkup('add', '등록') + modalMarkup('edit', '수정') + modalMarkup('bulk', '일괄변경');
      document.body.appendChild(host);
      return host;
    }

    function modalQuery(selector){
      return (modalHost && modalHost.querySelector(selector)) || rootEl.querySelector(selector);
    }

    function getManagedModal(kind){
      return modalQuery('[data-modal="' + kind + '"]');
    }

    function getManagedForm(kind){
      return modalQuery('[data-role="' + kind + '-form"]');
    }

    function actionButton(action, title, icon, enabled, attrs){
      if(enabled === false) return '';
      attrs = attrs || {};
      var defaultIds = {
        add: 'system-add-btn',
        delete: 'system-delete-btn',
        bulk: 'system-bulk-btn',
        stats: 'system-stats-btn',
        analytics: config.analyticsButtonId || 'system-analytics-btn',
        export: 'system-download-btn'
      };
      var buttonId = attrs.id || defaultIds[action];
      var idAttr = buttonId ? ' id="' + escapeHtml(buttonId) + '"' : '';
      var className = attrs.className || 'header-btn';
      var disabled = attrs.disabled ? ' disabled' : '';
      return '<button type="button" class="' + escapeHtml(className) + '" data-action="' + escapeHtml(action) + '"' + idAttr + disabled + ' title="' + escapeHtml(title) + '" aria-label="' + escapeHtml(title) + '"><img src="' + escapeHtml(icon) + '" alt="' + escapeHtml(title) + '" class="header-icon"></button>';
    }

    function renderToolbarActions(){
      var actions = config.toolbarActions;
      if(typeof actions === 'function') actions = actions({ context: context, config: config });
      if(!Array.isArray(actions) || !actions.length) return '';
      return actions.map(function(item){
        item = item || {};
        return actionButton(item.action || item.name || '', item.title || item.label || '', item.icon || '', item.enabled !== false, item);
      }).join('');
    }

    function helpers(){
      return {
        root: rootEl,
        table: table,
        state: state,
        context: context,
        sources: sources,
        api: api,
        load: load,
        render: render,
        openModal: openModal,
        closeModal: closeModal,
        showMessage: showMessage,
        selectedIds: function(){ return table ? table.getSelectedIds() : []; },
        selectedRows: function(){ return selectedRows(table, state, config.rowKey || 'id'); }
      };
    }

    function modalMarkup(kind, label){
      var actionLabel = kind === 'bulk' ? '적용' : '저장';
      var subtitleText = kind === 'bulk' ? '선택한 항목에서 지정한 필드를 일괄 변경합니다.' : kind === 'edit' ? '선택한 ' + (context.label || '') + ' 정보를 수정합니다.' : kind === 'add' ? '새 ' + (context.label || '') + ' 정보를 등록합니다.' : '';
      var subtitle = kind === 'bulk' ? '<p class="server-add-subtitle" id="bulk-subtitle">' + subtitleText + '</p>' : subtitleText ? '<p class="server-add-subtitle">' + subtitleText + '</p>' : '';
      return '<div class="server-add-modal modal-overlay-full" data-modal="' + kind + '" aria-hidden="true">' +
        '<div class="server-add-content">' +
          '<div class="server-add-header"><div class="server-add-title"><h3>' + escapeHtml((context.label || config.title || '') + ' ' + label) + '</h3>' + subtitle + '</div><button type="button" class="close-btn" data-modal-close title="닫기" aria-label="닫기"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>' +
          '<div class="server-add-body"><form data-role="' + kind + '-form"></form></div>' +
          '<div class="server-add-actions align-right"><div class="action-buttons right"><button type="button" class="btn-primary" data-action="' + kind + '-save">' + actionLabel + '</button></div></div>' +
        '</div>' +
      '</div>';
    }

    function setCount(){
      var count = rootEl.querySelector('[data-role="count"]');
      if(count){
        count.textContent = String(state.filtered.length);
        count.classList.toggle('large-number', state.filtered.length >= 100 && state.filtered.length < 1000);
        count.classList.toggle('very-large-number', state.filtered.length >= 1000);
      }
    }

    function setPageButtonDisabled(kind, disabled){
      var button = rootEl.querySelector('[data-page="' + kind + '"]');
      if(button) button.disabled = !!disabled;
    }

    function renderPagination(){
      var total = state.filtered.length;
      var pages = Math.max(1, Math.ceil(total / state.pageSize));
      if(state.page > pages) state.page = pages;
      var start = total ? ((state.page - 1) * state.pageSize + 1) : 0;
      var end = total ? Math.min(total, state.page * state.pageSize) : 0;
      var info = rootEl.querySelector('[data-role="pagination-info"]');
      if(info) info.textContent = start + '-' + end + ' / ' + total + '개 항목';
      var numbers = rootEl.querySelector('[data-role="page-numbers"]');
      if(numbers){
        var html = '';
        for(var page = 1; page <= pages; page += 1){
          html += '<button type="button" class="page-btn' + (page === state.page ? ' active' : '') + '" data-page-number="' + page + '">' + page + '</button>';
        }
        numbers.innerHTML = html;
      }
      setPageButtonDisabled('first', state.page <= 1);
      setPageButtonDisabled('prev', state.page <= 1);
      setPageButtonDisabled('next', state.page >= pages);
      setPageButtonDisabled('last', state.page >= pages);
    }

    function render(){
      state.filtered = filterRows(state.rows, config.columns || [], state.search);
      setCount();
      renderPagination();
      var rows = pageRows(state);
      table.setRows(rows);
      if(typeof config.afterRender === 'function'){
        config.afterRender(rows, state, { root: rootEl, table: table, render: render, showMessage: showMessage });
      }
    }

    function load(){
      return api.list().then(function(result){
        state.rows = result.rows || [];
        if(typeof config.normalizeRows === 'function') state.rows = config.normalizeRows(state.rows, { sources: sources, context: context });
        render();
      }).catch(function(err){ showMessage(err.message || '목록을 불러오지 못했습니다.'); });
    }

    function bindMessageModal(modal){
      if(!modal || modal.getAttribute('data-bls-management-bound') === '1') return;
      modal.setAttribute('data-bls-management-bound', '1');
      var closeBtn = document.getElementById('system-message-close');
      var okBtn = document.getElementById('system-message-ok');
      if(closeBtn) closeBtn.addEventListener('click', function(){ closeElementModal(modal); });
      if(okBtn) okBtn.addEventListener('click', function(){ closeElementModal(modal); });
      modal.addEventListener('click', function(event){ if(event.target === modal) closeElementModal(modal); });
    }

    function showMessage(message, titleText){
      if(document.getElementById('system-message-modal')){
        var modal = document.getElementById('system-message-modal');
        var title = document.getElementById('message-title');
        var content = document.getElementById('message-content');
        if(title) title.textContent = titleText || '알림';
        if(content) content.textContent = message || '';
        bindMessageModal(modal);
        openElementModal(modal, '#system-message-ok');
      }
      else alert(message);
    }

    function ensureDownloadModal(){
      var modal = document.getElementById('system-download-modal');
      if(modal) return modal;
      var wrapper = document.createElement('div');
      wrapper.innerHTML = '' +
        '<div id="system-download-modal" class="server-add-modal system-download-modal modal-overlay-full bls-download-modal bls-download-modal--range" aria-hidden="true">' +
          '<div class="server-add-content" role="dialog" aria-modal="true" aria-labelledby="download-title">' +
            '<div class="server-add-header bls-download-modal__header">' +
              '<div class="server-add-title dispose-title bls-download-modal__header-copy"><h3 id="download-title" class="bls-download-modal__title">CSV 다운로드</h3><p class="server-add-subtitle bls-download-modal__subtitle" id="download-subtitle">현재 결과를 CSV로 내보냅니다.</p></div>' +
              '<button class="close-btn bls-download-modal__close" type="button" id="system-download-close" title="닫기" aria-label="닫기">×</button>' +
            '</div>' +
            '<div class="server-add-body bls-download-modal__body"><div class="dispose-content bls-download-modal__layout"><div class="dispose-text bls-download-modal__copy"><p class="bls-download-modal__primary">내보낼 범위를 선택하세요.</p><div class="form-radio-group bls-download-modal__options"><label id="csv-range-row-all" class="bls-download-modal__option"><input type="radio" name="csv-range" id="csv-range-all" value="all" checked><span>전체 결과</span></label><label id="csv-range-row-selected" class="bls-download-modal__option"><input type="radio" name="csv-range" id="csv-range-selected" value="selected"><span>선택된 행만</span></label></div></div><div class="dispose-illust bls-download-modal__illust"><img src="/static/image/svg/list/free-sticker-research.svg" alt="다운로드 안내" loading="lazy"></div></div></div>' +
            '<div class="server-add-actions align-right bls-download-modal__footer"><div class="action-buttons right bls-download-modal__actions"><button type="button" class="btn-primary bls-download-modal__button bls-download-modal__button--primary" id="system-download-confirm">다운로드</button></div></div>' +
          '</div>' +
        '</div>';
      modal = wrapper.firstChild;
      document.body.appendChild(modal);
      return modal;
    }

    function bindDownloadModal(modal){
      if(!modal || modal.getAttribute('data-bls-management-bound') === '1') return;
      modal.setAttribute('data-bls-management-bound', '1');
      var closeBtn = document.getElementById('system-download-close');
      var confirmBtn = document.getElementById('system-download-confirm');
      if(closeBtn) closeBtn.addEventListener('click', function(){ closeElementModal(modal); });
      if(confirmBtn) confirmBtn.addEventListener('click', function(){
        if(typeof modal.__blsConfirmDownload === 'function') modal.__blsConfirmDownload();
      });
      modal.addEventListener('click', function(event){ if(event.target === modal) closeElementModal(modal); });
    }

    function openDownloadModal(){
      var modal = ensureDownloadModal();
      var selected = selectedRows(table, state, config.rowKey || 'id');
      var selectedRadio = document.getElementById('csv-range-selected');
      var allRadio = document.getElementById('csv-range-all');
      var selectedRow = document.getElementById('csv-range-row-selected');
      var selectedLabel = selectedRow ? selectedRow.querySelector('span') : null;
      var subtitle = document.getElementById('download-subtitle');
      downloadRows = state.filtered.slice();
      downloadSelectedRows = selected.slice();
      modal.__blsConfirmDownload = confirmDownload;
      if(subtitle) subtitle.textContent = '현재 결과 ' + downloadRows.length + '개 항목을 CSV로 내보냅니다.';
      if(selectedLabel) selectedLabel.textContent = '선택된 행만' + (selected.length ? ' (' + selected.length + ')' : '');
      if(selectedRadio) selectedRadio.disabled = !selected.length;
      if(selectedRow) selectedRow.classList.toggle('is-disabled', !selected.length);
      if(allRadio) allRadio.checked = true;
      bindDownloadModal(modal);
      openElementModal(modal, '#system-download-confirm');
    }

    function confirmDownload(){
      var selectedRadio = document.getElementById('csv-range-selected');
      var useSelected = !!(selectedRadio && selectedRadio.checked);
      var rows = useSelected ? downloadSelectedRows : downloadRows;
      if(useSelected && !rows.length){ showMessage('선택된 행이 없습니다.', 'CSV 다운로드'); return; }
      downloadCsv((config.exportName || config.id || 'data') + '.csv', rows || [], config.columns || []);
      closeElementModal(document.getElementById('system-download-modal'));
    }

    function openModal(kind, row){
      state.editRow = row || null;
      var modal = getManagedModal(kind);
      var form = getManagedForm(kind);
      if(form) form.innerHTML = formBuilder.render(row || {});
      if(form) ensureTextModelField(form, row || {});
      if(root.BlossomSearchableSelect && typeof root.BlossomSearchableSelect.syncAll === 'function'){
        root.BlossomSearchableSelect.syncAll(modal || rootEl);
      }
      if(form && typeof formBuilder.enhance === 'function') formBuilder.enhance(form);
      if(root.BlossomModal) root.BlossomModal.open(modal);
      else modal.classList.add('show');
    }

    function shouldKeepModelAsText(){
      for(var sectionIndex = 0; sectionIndex < schema.length; sectionIndex += 1){
        var fields = schema[sectionIndex].fields || [];
        for(var fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1){
          var field = fields[fieldIndex];
          if(field && field.key === 'model' && field.type === 'text') return true;
        }
      }
      return false;
    }

    function ensureTextModelField(form, row){
      if(!shouldKeepModelAsText()) return;
      var field = form.querySelector('[name="model"]');
      if(!field) return;
      if(field.tagName && field.tagName.toLowerCase() === 'input' && String(field.type || '').toLowerCase() === 'text' && !field.classList.contains('search-select')) return;
      var input = document.createElement('input');
      input.type = 'text';
      input.name = 'model';
      input.className = 'form-input';
      input.required = true;
      input.autocomplete = 'off';
      input.setAttribute('data-fk-ignore', '1');
      input.setAttribute('data-searchable', 'false');
      input.value = field.value || row.model || row.model_name || '';
      var holder = field.closest && field.closest('.fk-searchable-control');
      if(holder && holder.parentNode) holder.parentNode.replaceChild(input, holder);
      else if(field.parentNode) field.parentNode.replaceChild(input, field);
    }

    function closeModal(kind){
      var modal = getManagedModal(kind);
      if(!modal) return;
      if(root.BlossomModal) root.BlossomModal.close(modal);
      else modal.classList.remove('show');
    }

    function editableBulkFields(){
      var fields = [];
      schema.forEach(function(section){
        (section.fields || []).forEach(function(field){
          if(!field || field.bulk === false) return;
          if(field.type === 'hidden' || field.type === 'file') return;
          fields.push(field);
        });
      });
      return fields;
    }

    function renderBulkOptions(field){
      var options = field.options || [];
      if(field.optionsSource && sources && sources[field.optionsSource]) options = sources[field.optionsSource];
      var html = '<option value="">선택</option>';
      options.forEach(function(option){
        var item = typeof option === 'string' ? { value: option, label: option } : option;
        var optValue = item.value != null ? item.value : (item.name != null ? item.name : item.label);
        var optLabel = item.label != null ? item.label : (item.name != null ? item.name : optValue);
        html += '<option value="' + escapeHtml(optValue) + '">' + escapeHtml(optLabel) + '</option>';
      });
      return html;
    }

    function renderBulkInput(field, inputId){
      var common = ' id="' + escapeHtml(inputId) + '" class="form-input" data-bulk-field="' + escapeHtml(field.key) + '" disabled';
      if(field.type === 'select') return '<select' + common + '>' + renderBulkOptions(field) + '</select>';
      if(field.type === 'textarea') return '<textarea' + common + ' rows="' + escapeHtml(field.rows || 4) + '"></textarea>';
      return '<input type="' + escapeHtml(field.type || 'text') + '"' + common + ' autocomplete="off">';
    }

    function buildBulkForm(ids){
      var form = getManagedForm('bulk');
      var subtitle = modalQuery('#bulk-subtitle');
      var fields = editableBulkFields();
      if(subtitle) subtitle.textContent = '선택된 ' + ids.length + '개 항목에서 체크한 필드만 일괄 변경합니다.';
      if(!form) return false;
      if(!fields.length){
        form.innerHTML = '<div class="bls-table-empty" role="status">일괄변경 가능한 필드가 없습니다.</div>';
        return false;
      }
      form.innerHTML = '<div class="form-section bls-bulk-section">' +
        '<div class="section-header"><h4>변경할 필드</h4></div>' +
        '<div class="bls-bulk-help">체크한 필드만 선택된 행에 적용됩니다.</div>' +
        '<div class="bls-bulk-grid">' + fields.map(function(field, index){
          var inputId = 'bls-bulk-' + (config.id || 'page') + '-' + index + '-' + field.key;
          return '<div class="bls-bulk-field">' +
            '<label class="bls-bulk-toggle"><input type="checkbox" data-role="bulk-toggle" data-target="' + escapeHtml(inputId) + '"><span>' + escapeHtml(field.label || field.key) + '</span></label>' +
            renderBulkInput(field, inputId) +
          '</div>';
        }).join('') + '</div></div>';
      if(root.BlossomSearchableSelect && typeof root.BlossomSearchableSelect.syncAll === 'function'){
        root.BlossomSearchableSelect.syncAll(form);
      }
      return true;
    }

    function collectBulkPatch(){
      var form = getManagedForm('bulk');
      var patch = {};
      if(!form) return patch;
      var toggles = form.querySelectorAll('[data-role="bulk-toggle"]:checked');
      Array.prototype.forEach.call(toggles, function(toggle){
        var targetId = toggle.getAttribute('data-target');
        var input = targetId ? form.querySelector('#' + targetId.replace(/([:.\[\],=])/g, '\\$1')) : null;
        if(!input) return;
        patch[input.getAttribute('data-bulk-field')] = input.type === 'checkbox' ? !!input.checked : String(input.value == null ? '' : input.value).trim();
      });
      return patch;
    }

    function findStateRow(id){
      for(var i = 0; i < state.rows.length; i += 1){
        if(String(state.rows[i][config.rowKey || 'id']) === String(id)) return state.rows[i];
      }
      return null;
    }

    function openBulkModal(ids){
      ids = ids || table.getSelectedIds();
      if(!ids.length){ showMessage('일괄변경할 행을 먼저 선택하세요.', '일괄변경'); return; }
      if(!buildBulkForm(ids)){ showMessage('일괄변경 가능한 필드가 없습니다.', '일괄변경'); return; }
      openElementModal(getManagedModal('bulk'), '[data-role="bulk-toggle"]');
    }

    function saveBulk(){
      var ids = table.getSelectedIds();
      var patch = collectBulkPatch();
      var keys = Object.keys(patch);
      var button = modalQuery('[data-action="bulk-save"]');
      var ok = 0;
      var failed = 0;
      if(!ids.length){ showMessage('일괄변경할 행을 먼저 선택하세요.', '일괄변경'); return; }
      if(!keys.length){ showMessage('변경할 필드를 선택하세요.', '일괄변경'); return; }
      if(button) button.disabled = true;
      ids.reduce(function(chain, id){
        return chain.then(function(){
          var row = findStateRow(id);
          if(!row){ failed += 1; return; }
          var payload = {};
          Object.keys(row).forEach(function(key){ payload[key] = row[key]; });
          keys.forEach(function(key){ payload[key] = patch[key]; });
          return api.update(id, payload).then(function(){ ok += 1; }).catch(function(){ failed += 1; });
        });
      }, Promise.resolve()).then(function(){
        closeModal('bulk');
        table.clearSelection();
        return load();
      }).then(function(){
        showMessage('일괄변경 완료: 성공 ' + ok + '건 / 실패 ' + failed + '건', '일괄변경');
      }).catch(function(err){
        showMessage(err.message || '일괄변경하지 못했습니다.', '일괄변경');
      }).then(function(){
        if(button) button.disabled = false;
      });
    }

    function save(kind){
      var form = getManagedForm(kind);
      var data = formBuilder.collect(form);
      var errors = formBuilder.validate(data);
      if(errors.length){ showMessage(errors[0]); return; }
      var meta = { kind: kind, row: state.editRow, state: state, showMessage: showMessage };
      var prepared = typeof config.beforeSave === 'function' ? Promise.resolve(config.beforeSave(data, meta)) : Promise.resolve(data);
      prepared.then(function(nextData){
        var promise = kind === 'edit' && state.editRow ? api.update(state.editRow[config.rowKey || 'id'], nextData || data) : api.create(nextData || data);
        return promise.then(function(){ closeModal(kind); return load(); });
      }).catch(function(err){ showMessage(err.message || '저장하지 못했습니다.'); });
    }

    function handleModalAction(name){
      if(name === 'add-save') save('add');
      else if(name === 'edit-save') save('edit');
      else if(name === 'bulk-save') saveBulk();
    }

    function bindModalHost(){
      if(!modalHost) return;
      modalHost.addEventListener('change', function(event){
        if(event.target.getAttribute('data-role') === 'bulk-toggle'){
          var targetId = event.target.getAttribute('data-target');
          var form = getManagedForm('bulk');
          var input = targetId && form ? form.querySelector('#' + targetId.replace(/([:.\[\],=])/g, '\\$1')) : null;
          if(input){
            input.disabled = !event.target.checked;
            if(event.target.checked) input.focus();
          }
        }
      });
      modalHost.addEventListener('click', function(event){
        var action = event.target.closest('[data-action]');
        if(action) handleModalAction(action.getAttribute('data-action'));
      });
    }

    function bind(){
      rootEl.addEventListener('input', function(event){
        if(event.target.getAttribute('data-role') === 'search'){
          state.search = event.target.value || '';
          state.page = 1;
          render();
        }
      });
      rootEl.addEventListener('change', function(event){
        if(event.target.getAttribute('data-role') === 'page-size'){
          state.pageSize = Number(event.target.value || 10);
          state.page = 1;
          render();
        }
        if(event.target.getAttribute('data-role') === 'bulk-toggle'){
          var targetId = event.target.getAttribute('data-target');
          var form = getManagedForm('bulk');
          var input = targetId && form ? form.querySelector('#' + targetId.replace(/([:.\[\],=])/g, '\\$1')) : null;
          if(input){
            input.disabled = !event.target.checked;
            if(event.target.checked) input.focus();
          }
        }
      });
      rootEl.addEventListener('click', function(event){
        var action = event.target.closest('[data-action]');
        if(action){
          var name = action.getAttribute('data-action');
          var handled = true;
          if(name === 'add') openModal('add');
          else if(name === 'add-save') save('add');
          else if(name === 'edit-save') save('edit');
          else if(name === 'bulk-save') saveBulk();
          else if(name === 'export') openDownloadModal();
          else if(name === 'delete') deleteSelected();
          else if(name === 'bulk') bulkEdit();
          else if(name === 'stats' && typeof config.openStats === 'function') config.openStats(state.filtered, context);
          else handled = false;
          if(!handled && typeof config.onAction === 'function') config.onAction(name, helpers(), event);
          return;
        }
        var clear = event.target.closest('[data-role="search-clear"]');
        if(clear){
          var search = rootEl.querySelector('[data-role="search"]');
          if(search) search.value = '';
          state.search = '';
          state.page = 1;
          render();
          if(search) search.focus();
          return;
        }
        var pageNumber = event.target.closest('[data-page-number]');
        if(pageNumber){ state.page = Number(pageNumber.getAttribute('data-page-number') || 1); render(); return; }
        var pageBtn = event.target.closest('[data-page]');
        if(pageBtn){ movePage(pageBtn.getAttribute('data-page')); }
      });
    }

    function movePage(kind){
      var pages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
      if(kind === 'first') state.page = 1;
      if(kind === 'prev') state.page = Math.max(1, state.page - 1);
      if(kind === 'next') state.page = Math.min(pages, state.page + 1);
      if(kind === 'last') state.page = pages;
      render();
    }

    function deleteSelected(){
      var ids = table.getSelectedIds();
      if(!ids.length){ showMessage('삭제처리할 행을 먼저 선택하세요.', '삭제처리'); return; }
      var confirmPromise = root.BlossomModal ? root.BlossomModal.confirm('선택된 ' + ids.length + '개 항목을 삭제처리하시겠습니까?', { title: '삭제처리' }) : Promise.resolve(confirm('선택된 항목을 삭제처리하시겠습니까?'));
      confirmPromise.then(function(ok){
        if(!ok) return;
        return api.bulkDelete(ids).then(function(){ table.clearSelection(); return load(); });
      }).catch(function(err){ showMessage(err.message || '삭제처리하지 못했습니다.', '삭제처리'); });
    }

    function bulkEdit(){
      var ids = table.getSelectedIds();
      if(!ids.length){ showMessage('일괄변경할 행을 먼저 선택하세요.', '일괄변경'); return; }
      if(typeof config.onBulk === 'function'){
        var bulkHelpers = helpers();
        bulkHelpers.openEdit = openModal;
        bulkHelpers.openBulk = openBulkModal;
        config.onBulk(ids, state.filtered, bulkHelpers);
        return;
      }
      openBulkModal(ids);
    }

    function loadSources(){
      var sourceFns = options.sources || {};
      var names = Object.keys(sourceFns);
      if(!names.length) return Promise.resolve();
      return Promise.all(names.map(function(name){
        return sourceFns[name]().then(function(items){ sources[name] = items || []; }).catch(function(){ sources[name] = []; });
      }));
    }

    renderShell();
  modalHost = createModalHost();
    formBuilder = Shared.createFormBuilder({ schema: schema, sources: sources });
    table = Shared.createDataTable({
      root: rootEl.querySelector('[data-role="table"]'),
      columns: config.columns || [],
      rowKey: config.rowKey || 'id',
      label: context.label || config.listTitle || config.title || '데이터',
      emptyState: config.emptyState,
      actions: config.actions,
      events: {
        edit: function(row){ openModal('edit', row); },
        action: function(name, row, event){
          if(typeof config.onRowAction === 'function') config.onRowAction(name, row, helpers(), event);
        }
      }
    });
    bind();
    bindModalHost();

    return loadSources().then(function(){ formBuilder.setSources(sources); return load(); });
  }

  Shared.ManagementPage = { mount: mount };

})(window);

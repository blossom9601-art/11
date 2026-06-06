(function(root){
  'use strict';

  var Shared = root.BlossomShared = root.BlossomShared || {};

  function escapeHtml(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch];
    });
  }

  function text(value){
    return value === undefined || value === null || value === '' ? '-' : String(value);
  }

  function renderIcon(src, alt){
    return '<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(alt || '') + '" class="action-icon">';
  }

  function renderEmptyState(options){
    var empty = options.emptyState || {};
    var label = empty.label || options.label || '데이터';
    var title = empty.title || (label + ' 내역이 없습니다.');
    var description = empty.description || ("우측 상단 '추가' 버튼을 눌러 새 " + label + '를 등록하세요.');
    var image = empty.image || '/static/image/svg/list/free-icon-not-available.svg';
    var alt = empty.alt || '데이터 없음';
    return '' +
      '<div class="bls-table-empty system-empty system-empty--sticker" role="status" aria-live="polite">' +
        '<div class="empty-illustration">' +
          '<img src="' + escapeHtml(image) + '" alt="' + escapeHtml(alt) + '" class="empty-icon-img" loading="lazy">' +
        '</div>' +
        '<div class="empty-text">' +
          '<h3 class="empty-title">' + escapeHtml(title) + '</h3>' +
          '<p class="empty-desc">' + escapeHtml(description) + '</p>' +
        '</div>' +
      '</div>';
  }

  Shared.createDataTable = function(options){
    options = options || {};
    var rootEl = options.root;
    var columns = options.columns || [];
    var rowKey = options.rowKey || 'id';
    var selected = {};
    var rows = [];
    var events = options.events || {};

    function selectedIds(){
      return Object.keys(selected).filter(function(id){ return selected[id]; });
    }

    function clearSelection(){
      selected = {};
    }

    function setSelected(id, checked){
      if(checked) selected[String(id)] = true;
      else delete selected[String(id)];
    }

    function isInteractiveTarget(target){
      return !!(target && target.closest && target.closest('a, button, input, select, textarea, label, [data-action], [role="button"], [contenteditable="true"]'));
    }

    function applyRowSelection(tr, checkbox, checked){
      if(!tr || !checkbox || checkbox.disabled) return;
      checkbox.checked = !!checked;
      setSelected(checkbox.value, checkbox.checked);
      tr.classList.toggle('selected', checkbox.checked);
      tr.setAttribute('aria-selected', checkbox.checked ? 'true' : 'false');
      syncSelectAll();
      if(typeof events.selectionChange === 'function') events.selectionChange(selectedIds());
    }

    function renderCell(row, column){
      if(typeof column.render === 'function'){
        return column.render(row, { escape: escapeHtml, text: text });
      }
      return escapeHtml(text(row[column.key]));
    }

    function renderHeader(){
      var html = '<thead><tr>';
      if(options.selectable !== false){
        html += '<th class="bls-table-select"><input type="checkbox" data-role="select-all" aria-label="전체 선택"></th>';
      }
      columns.forEach(function(column){
        var thClass = column.hidden ? ' class="col-hidden"' : '';
        html += '<th data-col="' + escapeHtml(column.key) + '"' + thClass + '>' + escapeHtml(column.label || column.key) + '</th>';
      });
      if(options.actions !== false){
        html += '<th data-col="actions">관리</th>';
      }
      html += '</tr></thead>';
      return html;
    }

    function renderRows(){
      var html = '<tbody>';
      rows.forEach(function(row){
        var id = String(row[rowKey]);
        var checked = selected[id] ? ' checked' : '';
        var rowClass = selected[id] ? ' class="selected"' : '';
        html += '<tr data-id="' + escapeHtml(id) + '" aria-selected="' + (selected[id] ? 'true' : 'false') + '"' + rowClass + '>';
        if(options.selectable !== false){
          html += '<td class="bls-table-select"><input type="checkbox" class="system-row-select" data-role="row-select" value="' + escapeHtml(id) + '"' + checked + ' aria-label="행 선택"></td>';
        }
        columns.forEach(function(column){
          var tdClass = column.hidden ? ' class="col-hidden"' : '';
          html += '<td data-col="' + escapeHtml(column.key) + '" data-label="' + escapeHtml(column.label || column.key) + '"' + tdClass + '>' + renderCell(row, column) + '</td>';
        });
        if(options.actions !== false){
          html += '<td data-col="actions" class="system-actions">';
          if(!options.actions || options.actions.update !== false){
            html += '<button type="button" class="action-btn" data-action="edit" title="수정" aria-label="수정">' + renderIcon('/static/image/svg/list/free-icon-pencil.svg', '수정') + '</button>';
          }
          if(options.actions && typeof options.actions.extra === 'function'){
            html += options.actions.extra(row, { escape: escapeHtml }) || '';
          }
          html += '</td>';
        }
        html += '</tr>';
      });
      html += '</tbody>';
      return html;
    }

    function render(){
      if(!rootEl) return;
      if(!rows.length){
        rootEl.innerHTML = '<div class="bls-table-wrap system-table-container server-table-container bls-table-wrap--empty"><table class="system-data-table server-data-table bls-data-table">' + renderHeader() + '</table>' + renderEmptyState(options) + '</div>';
        bind();
        return;
      }
      rootEl.innerHTML = '<div class="bls-table-wrap system-table-container server-table-container"><table class="system-data-table server-data-table bls-data-table">' + renderHeader() + renderRows() + '</table></div>';
      bind();
    }

    function rowById(id){
      for(var i = 0; i < rows.length; i += 1){
        if(String(rows[i][rowKey]) === String(id)) return rows[i];
      }
      return null;
    }

    function syncSelectAll(){
      var selectAll = rootEl.querySelector('[data-role="select-all"]');
      if(!selectAll) return;
      var ids = rows.map(function(row){ return String(row[rowKey]); });
      var checkedCount = ids.filter(function(id){ return selected[id]; }).length;
      selectAll.checked = ids.length > 0 && checkedCount === ids.length;
      selectAll.indeterminate = checkedCount > 0 && checkedCount < ids.length;
    }

    function bind(){
      var table = rootEl.querySelector('table');
      if(!table) return;
      table.addEventListener('change', function(event){
        var target = event.target;
        if(target.getAttribute('data-role') === 'select-all'){
          rows.forEach(function(row){ setSelected(row[rowKey], target.checked); });
          render();
          if(typeof events.selectionChange === 'function') events.selectionChange(selectedIds());
          return;
        }
        if(target.getAttribute('data-role') === 'row-select'){
          var tr = target.closest('tr');
          applyRowSelection(tr, target, target.checked);
        }
      });
      table.addEventListener('click', function(event){
        var action = event.target.closest('[data-action]');
        if(!action) return;
        var tr = action.closest('tr');
        var row = tr ? rowById(tr.getAttribute('data-id')) : null;
        if(action.getAttribute('data-action') === 'edit' && typeof events.edit === 'function'){
          events.edit(row);
          return;
        }
        if(typeof events.action === 'function'){
          events.action(action.getAttribute('data-action'), row, event);
        }
      });
      table.addEventListener('click', function(event){
        if(options.selectable === false || isInteractiveTarget(event.target)) return;
        var tr = event.target.closest('tbody tr[data-id]');
        var checkbox = tr ? tr.querySelector('[data-role="row-select"]') : null;
        if(!checkbox) return;
        applyRowSelection(tr, checkbox, !checkbox.checked);
      });
      syncSelectAll();
    }

    return {
      setRows: function(nextRows){ rows = Array.isArray(nextRows) ? nextRows : []; render(); },
      getRows: function(){ return rows.slice(); },
      getSelectedIds: selectedIds,
      clearSelection: function(){ clearSelection(); render(); },
      render: render
    };
  };

})(window);

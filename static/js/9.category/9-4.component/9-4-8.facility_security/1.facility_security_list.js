(function(){
  'use strict';

  var RESOURCE = String(window.__FACILITY_SECURITY_RESOURCE__ || 'access');
  var LABEL = String(window.__FACILITY_SECURITY_LABEL__ || '시설·보안');
  var MANUAL = !!window.__FACILITY_SECURITY_MANUAL__;
  var API_BASE = '/api/facility-security-infra/' + encodeURIComponent(RESOURCE);
  var JSON_HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };

  var state = {
    rows: [],
    filtered: [],
    selected: {},
    sourceModels: [],
    manufacturers: [],
    page: 1,
    pageSize: 10,
    search: '',
    editId: null
  };

  function byId(id){ return document.getElementById(id); }
  function text(value){ return value == null || value === '' ? '-' : String(value); }
  function escapeHTML(value){
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function selectedIds(){
    var ids = [];
    Object.keys(state.selected).forEach(function(id){ if(state.selected[id]) ids.push(parseInt(id, 10)); });
    return ids.filter(function(id){ return isFinite(id); });
  }
  function openModal(id){
    var el = byId(id);
    if(!el) return;
    document.body.classList.add('modal-open');
    el.classList.add('show');
    el.setAttribute('aria-hidden', 'false');
  }
  function closeModal(id){
    var el = byId(id);
    if(!el) return;
    el.classList.remove('show');
    el.setAttribute('aria-hidden', 'true');
    if(!document.querySelector('.modal-overlay-full.show')) document.body.classList.remove('modal-open');
  }
  function showMessage(message, title){
    var titleEl = byId('message-title');
    var contentEl = byId('message-content');
    if(titleEl) titleEl.textContent = title || '알림';
    if(contentEl) contentEl.textContent = String(message || '');
    openModal('system-message-modal');
  }
  function requestJson(url, options){
    var opts = options || {};
    var headers = {};
    Object.keys(JSON_HEADERS).forEach(function(key){ headers[key] = JSON_HEADERS[key]; });
    if(opts.headers){ Object.keys(opts.headers).forEach(function(key){ headers[key] = opts.headers[key]; }); }
    opts.headers = headers;
    opts.credentials = 'same-origin';
    return fetch(url, opts).then(function(response){
      return response.text().then(function(body){
        var payload = {};
        if(body){
          try { payload = JSON.parse(body); }
          catch(_err){ throw new Error('API 응답을 해석할 수 없습니다.'); }
        }
        if(!response.ok || payload.success === false){
          throw new Error(payload.message || payload.error || '요청을 처리하지 못했습니다.');
        }
        return payload;
      });
    }).catch(function(err){
      if(err && err.message) throw err;
      throw new Error('서버와 통신할 수 없습니다.');
    });
  }

  function closestFacilityGroup(node){
    while(node && node !== document){
      if(node.classList && node.classList.contains('facility-security-group')) return node;
      node = node.parentNode;
    }
    return null;
  }
  function closeFacilityDropdowns(exceptGroup){
    var groups = document.querySelectorAll('.facility-security-group.open');
    Array.prototype.forEach.call(groups, function(group){
      if(group === exceptGroup) return;
      group.classList.remove('open');
      var button = group.querySelector('.facility-security-group-btn');
      if(button) button.setAttribute('aria-expanded', 'false');
    });
  }
  function initFacilityDropdowns(){
    var groups = document.querySelectorAll('.facility-security-group');
    if(!groups.length) return;
    Array.prototype.forEach.call(groups, function(group){
      var button = group.querySelector('.facility-security-group-btn');
      if(!button) return;
      button.addEventListener('click', function(event){
        event.preventDefault();
        var shouldOpen = !group.classList.contains('open');
        closeFacilityDropdowns(group);
        group.classList.toggle('open', shouldOpen);
        button.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
      });
    });
    document.addEventListener('click', function(event){
      if(!closestFacilityGroup(event.target)) closeFacilityDropdowns(null);
    });
    document.addEventListener('keydown', function(event){
      if(event.key === 'Escape') closeFacilityDropdowns(null);
    });
  }

  function normalize(row){
    row = row || {};
    return {
      id: Number(row.id),
      public_id: row.public_id || '',
      infra_code: row.infra_code || row.code || '',
      model_name: row.model_name || row.model || '',
      source_resource_id: row.source_resource_id || row.source_id || '',
      source_resource_code: row.source_resource_code || row.source_code || '',
      source_resource_name: row.source_resource_name || row.source_name || '',
      source_fk: row.source_fk || '',
      manufacturer_name: row.manufacturer_name || row.vendor || '',
      capacity: row.capacity || '',
      model_number: row.model_number || row.model_no || '',
      eosl: row.eosl || row.management_life || '',
      spec_summary: row.spec_summary || row.spec || '',
      part_number: row.part_number || row.part_no || '',
      infra_count: Number(row.infra_count != null ? row.infra_count : (row.qty || 0)),
      location_name: row.location_name || row.location || '',
      remark: row.remark || row.note || ''
    };
  }
  function normalizeRows(items){
    if(!Array.isArray(items)) return [];
    return items.map(normalize).filter(function(row){ return row && isFinite(row.id); });
  }
  function normalizeSource(row){
    row = row || {};
    return {
      id: Number(row.source_id || row.id),
      model_name: row.model_name || row.model || '',
      source_code: row.source_code || '',
      source_name: row.source_name || '',
      manufacturer_name: row.manufacturer_name || row.vendor || '',
      location_name: row.location_name || '',
      source_fk: row.source_fk || ''
    };
  }
  function normalizeSources(items){
    if(!Array.isArray(items)) return [];
    return items.map(normalizeSource).filter(function(row){ return row.model_name && isFinite(row.id); });
  }
  function sourceById(id){
    var target = Number(id);
    for(var i = 0; i < state.sourceModels.length; i += 1){
      if(Number(state.sourceModels[i].id) === target) return state.sourceModels[i];
    }
    return null;
  }
  function syncSearchClear(){
    var clear = byId('system-search-clear');
    if(clear) clear.classList.toggle('visible', !!String(state.search || '').trim());
  }
  function sourceOptionLabel(source){
    var pieces = [source.model_name];
    if(source.source_code) pieces.push(source.source_code);
    if(source.source_name) pieces.push(source.source_name);
    if(source.manufacturer_name) pieces.push(source.manufacturer_name);
    return pieces.join(' / ');
  }
  function renderSourceOptions(select, selectedId){
    if(!select) return;
    var selected = String(selectedId || '');
    var html = '<option value="">선택</option>';
    state.sourceModels.forEach(function(source){
      var value = String(source.id);
      html += '<option value="' + escapeHTML(value) + '"' + (value === selected ? ' selected' : '') + '>' + escapeHTML(sourceOptionLabel(source)) + '</option>';
    });
    select.innerHTML = html;
    try {
      if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
        window.BlossomSearchableSelect.syncAll(select.closest('.modal-overlay-full') || select);
      }
    } catch(_e){}
  }
  function manufacturerName(row){
    row = row || {};
    return String(row.manufacturer_name || row.vendor || row.name || row.label || '').trim();
  }
  function normalizeManufacturers(items){
    if(!Array.isArray(items)) return [];
    var seen = {};
    var output = [];
    items.forEach(function(item){
      var name = manufacturerName(item);
      if(!name || seen[name]) return;
      seen[name] = true;
      output.push({ name: name });
    });
    output.sort(function(a, b){ return a.name.localeCompare(b.name, 'ko-KR'); });
    return output;
  }
  function renderManufacturerOptions(select, selectedName){
    if(!select) return;
    var selected = String(selectedName || '').trim();
    var hasSelected = !selected;
    var html = '<option value="">선택</option>';
    state.manufacturers.forEach(function(item){
      var isSelected = item.name === selected;
      if(isSelected) hasSelected = true;
      html += '<option value="' + escapeHTML(item.name) + '"' + (isSelected ? ' selected' : '') + '>' + escapeHTML(item.name) + '</option>';
    });
    if(selected && !hasSelected){
      html += '<option value="' + escapeHTML(selected) + '" selected>' + escapeHTML(selected) + '</option>';
    }
    select.innerHTML = html;
    try {
      if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
        window.BlossomSearchableSelect.syncAll(select.closest('.modal-overlay-full') || select);
      }
    } catch(_e){}
  }
  function syncSourceFields(form){
    if(MANUAL) return;
    if(!form) return;
    var select = form.querySelector('select[name="source_resource_id"]');
    var source = sourceById(select ? select.value : '');
    var sourceName = form.querySelector('input[name="source_resource_name"]');
    var manufacturer = form.querySelector('input[name="manufacturer_name"]');
    var location = form.querySelector('input[name="location_name"]');
    if(sourceName) sourceName.value = source ? source.source_name : '';
    if(manufacturer && source && !manufacturer.value) manufacturer.value = source.manufacturer_name || '';
    if(location && source && !location.value) location.value = source.location_name || '';
  }

  function formMarkup(prefix, row){
    row = row || {};
    return '' +
      '<div class="form-section">' +
        '<div class="section-header"><h4>시설·보안</h4></div>' +
        '<div class="form-grid">' +
          '<div class="form-row"><label>모델명<span class="required">*</span></label><input type="text" name="model_name" class="form-input" placeholder="필수" value="' + escapeHTML(row.model_name || '') + '" autocomplete="off" required></div>' +
          '<div class="form-row"><label>용량</label><input type="text" name="capacity" class="form-input" value="' + escapeHTML(row.capacity || '') + '" autocomplete="off"></div>' +
          '<div class="form-row"><label>제조사</label><select name="manufacturer_name" id="' + prefix + '-manufacturer" class="form-input search-select" data-searchable="true" data-placeholder="선택"><option value="">선택</option></select></div>' +
          '<div class="form-row"><label>부품번호</label><input type="text" name="part_number" class="form-input" value="' + escapeHTML(row.part_number || '') + '" autocomplete="off"></div>' +
        '</div>' +
        '<div class="form-row"><label>비고</label><textarea name="remark" class="form-input textarea-large" rows="6">' + escapeHTML(row.remark || '') + '</textarea></div>' +
      '</div>';
  }
  function fillAddForm(){
    var form = byId('facility-security-add-form');
    if(!form) return;
    form.reset();
    renderManufacturerOptions(form.querySelector('select[name="manufacturer_name"]'), '');
  }
  function fillEditForm(row){
    var form = byId('facility-security-edit-form');
    if(!form) return;
    form.innerHTML = formMarkup('facility-security-edit', row);
    renderManufacturerOptions(form.querySelector('select[name="manufacturer_name"]'), row.manufacturer_name);
  }
  function collectPayload(form){
    var data = {};
    var modelName = form.querySelector('input[name="model_name"]');
    var capacity = form.querySelector('input[name="capacity"]');
    var manufacturer = form.querySelector('select[name="manufacturer_name"]');
    var part = form.querySelector('input[name="part_number"]');
    var remark = form.querySelector('textarea[name="remark"]');
    data.model_name = modelName ? modelName.value.trim() : '';
    if(!data.model_name) throw new Error('모델명을 입력하세요.');
    data.capacity = capacity ? capacity.value.trim() : '';
    data.manufacturer_name = manufacturer ? manufacturer.value.trim() : '';
    data.part_number = part ? part.value.trim() : '';
    data.remark = remark ? remark.value.trim() : '';
    return data;
  }

  function filterRows(){
    var needle = state.search.toLowerCase();
    if(!needle){ state.filtered = state.rows.slice(); return; }
    state.filtered = state.rows.filter(function(row){
      var hay = [row.model_name, row.capacity, row.manufacturer_name, row.part_number, row.remark].join(' ').toLowerCase();
      return hay.indexOf(needle) !== -1;
    });
  }
  function updateSelectionControls(){
    var all = byId('system-select-all');
    if(!all) return;
    var visibleIds = state.filtered.slice((state.page - 1) * state.pageSize, state.page * state.pageSize).map(function(row){ return String(row.id); });
    var checkedCount = visibleIds.filter(function(id){ return state.selected[id]; }).length;
    all.checked = visibleIds.length > 0 && checkedCount === visibleIds.length;
    all.indeterminate = checkedCount > 0 && checkedCount < visibleIds.length;
  }
  function setRowSelection(tr, checked){
    if(!tr) return;
    var checkbox = tr.querySelector('.system-row-select');
    var id = checkbox ? checkbox.getAttribute('data-id') : tr.getAttribute('data-id');
    if(!id) return;
    state.selected[id] = !!checked;
    if(checkbox) checkbox.checked = !!checked;
    if(checked) tr.classList.add('selected');
    else tr.classList.remove('selected');
  }
  function renderRows(){
    var tbody = byId('system-table-body');
    var empty = byId('system-empty');
    if(!tbody) return;
    var start = (state.page - 1) * state.pageSize;
    var pageRows = state.filtered.slice(start, start + state.pageSize);
    if(!pageRows.length){
      tbody.innerHTML = '';
      if(empty) empty.hidden = false;
      updateSelectionControls();
      return;
    }
    if(empty) empty.hidden = true;
    tbody.innerHTML = pageRows.map(function(row){
      var detailHref = row.public_id ? '/b/' + encodeURIComponent(row.public_id) : '#';
      var isSelected = !!state.selected[String(row.id)];
      var cells = [
        { col: 'model_name', label: '모델명', html: '<a class="work-name-link" href="' + escapeHTML(detailHref) + '" data-id="' + escapeHTML(row.id) + '" data-public-id="' + escapeHTML(row.public_id || '') + '">' + escapeHTML(text(row.model_name)) + '</a>' },
        { col: 'capacity', label: '용량', text: row.capacity },
        { col: 'manufacturer_name', label: '제조사', text: row.manufacturer_name },
        { col: 'part_number', label: '부품번호', text: row.part_number },
        { col: 'remark', label: '비고', text: row.remark }
      ];
      return '<tr data-id="' + escapeHTML(row.id) + '"' + (isSelected ? ' class="selected"' : '') + '>' +
        '<td><input type="checkbox" class="system-row-select" data-id="' + escapeHTML(row.id) + '" ' + (isSelected ? 'checked' : '') + ' aria-label="행 선택"></td>' +
        cells.map(function(cell){
          var attrs = ' data-col="' + escapeHTML(cell.col) + '" data-label="' + escapeHTML(cell.label) + '"';
          if(cell.html) return '<td' + attrs + '>' + cell.html + '</td>';
          return '<td' + attrs + '>' + escapeHTML(text(cell.text)) + '</td>';
        }).join('') +
        '<td data-col="actions" data-label="관리" class="system-actions">' +
          '<button class="action-btn" type="button" data-action="edit" data-id="' + escapeHTML(row.id) + '" title="수정" aria-label="수정"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="수정" class="action-icon"></button>' +
        '</td>' +
      '</tr>';
    }).join('');
    updateSelectionControls();
  }
  function renderPagination(){
    var total = state.filtered.length;
    var pages = Math.max(1, Math.ceil(total / state.pageSize));
    if(state.page > pages) state.page = pages;
    var info = byId('system-pagination-info');
    var count = byId('system-count');
    if(info){
      var start = total ? ((state.page - 1) * state.pageSize + 1) : 0;
      var end = Math.min(total, state.page * state.pageSize);
      info.textContent = start + '-' + end + ' / ' + total + '개 항목';
    }
    if(count){
      var previous = parseInt(count.getAttribute('data-count') || (count.textContent || '0').replace(/,/g, ''), 10) || 0;
      count.textContent = String(total);
      count.setAttribute('data-count', String(total));
      count.classList.remove('large-number', 'very-large-number');
      if(total >= 1000) count.classList.add('very-large-number');
      else if(total >= 100) count.classList.add('large-number');
      if(previous !== total){
        count.classList.remove('is-updating');
        void count.offsetWidth;
        count.classList.add('is-updating');
      }
    }
    var first = byId('system-first');
    var prev = byId('system-prev');
    var next = byId('system-next');
    var last = byId('system-last');
    if(first) first.disabled = state.page <= 1;
    if(prev) prev.disabled = state.page <= 1;
    if(next) next.disabled = state.page >= pages;
    if(last) last.disabled = state.page >= pages;
    var numbers = byId('system-page-numbers');
    if(numbers){
      var html = '';
      var begin = Math.max(1, state.page - 2);
      var end = Math.min(pages, begin + 4);
      begin = Math.max(1, end - 4);
      for(var page = begin; page <= end; page += 1){
        html += '<button type="button" class="page-btn' + (page === state.page ? ' active' : '') + '" data-page="' + page + '">' + page + '</button>';
      }
      numbers.innerHTML = html;
    }
  }
  function render(){ filterRows(); renderPagination(); renderRows(); syncSearchClear(); }
  function upsert(row){
    var normalized = normalize(row);
    var index = -1;
    for(var i = 0; i < state.rows.length; i += 1){ if(state.rows[i].id === normalized.id){ index = i; break; } }
    if(index >= 0) state.rows[index] = normalized;
    else state.rows.unshift(normalized);
    render();
  }
  function loadData(){
    var loader = byId('system-search-loader');
    if(loader) loader.classList.add('show');
    var requests = [requestJson(API_BASE), requestJson('/api/vendor-manufacturers').catch(function(){ return { items: [] }; })];
    return Promise.all(requests).then(function(results){
      state.rows = normalizeRows(results[0].items || results[0].rows || []);
      state.manufacturers = normalizeManufacturers(results[1].items || results[1].rows || []);
      render();
      fillAddForm();
    }).catch(function(err){
      showMessage(err.message || '시설·보안 목록을 불러오지 못했습니다.', '오류');
    }).then(function(){ if(loader) loader.classList.remove('show'); });
  }

  function saveAdd(){
    var form = byId('facility-security-add-form');
    if(!form) return;
    var payload;
    try { payload = collectPayload(form); }
    catch(err){ showMessage(err.message, '안내'); return; }
    requestJson(API_BASE, { method: 'POST', body: JSON.stringify(payload) }).then(function(result){
      upsert(result.item);
      closeModal('facility-security-add-modal');
      fillAddForm();
    }).catch(function(err){ showMessage(err.message || '등록 중 오류가 발생했습니다.', '오류'); });
  }
  function saveEdit(){
    var form = byId('facility-security-edit-form');
    if(!form || !state.editId) return;
    var payload;
    try { payload = collectPayload(form); }
    catch(err){ showMessage(err.message, '안내'); return; }
    requestJson(API_BASE + '/' + encodeURIComponent(state.editId), { method: 'PUT', body: JSON.stringify(payload) }).then(function(result){
      upsert(result.item);
      closeModal('facility-security-edit-modal');
    }).catch(function(err){ showMessage(err.message || '수정 중 오류가 발생했습니다.', '오류'); });
  }
  function deleteSelected(){
    var ids = selectedIds();
    if(!ids.length){ showMessage('삭제처리할 행을 먼저 선택하세요.', '안내'); return; }
    requestJson(API_BASE + '/bulk-delete', { method: 'POST', body: JSON.stringify({ ids: ids }) }).then(function(){
      var idMap = {};
      ids.forEach(function(id){ idMap[String(id)] = true; });
      state.rows = state.rows.filter(function(row){ return !idMap[String(row.id)]; });
      state.selected = {};
      closeModal('system-delete-modal');
      render();
    }).catch(function(err){ showMessage(err.message || '삭제처리 중 오류가 발생했습니다.', '오류'); });
  }
  function exportCsv(){
    var rows = state.filtered.slice();
    if(!rows.length){ showMessage('다운로드할 항목이 없습니다.', '안내'); return; }
    var headers = ['모델명','용량','제조사','부품번호','비고'];
    var lines = [headers];
    rows.forEach(function(row){
      lines.push([row.model_name, row.capacity, row.manufacturer_name, row.part_number, row.remark]);
    });
    var csv = lines.map(function(line){
      return line.map(function(cell){ return '"' + String(cell == null ? '' : cell).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\r\n');
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = '시설보안인프라_' + LABEL + '.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function(){ URL.revokeObjectURL(link.href); }, 1000);
  }

  function openStats(){
    if(!window.blsStats){ showMessage('통계 모듈을 불러오지 못했습니다.', '안내'); return; }
    var body = byId('system-stats-body');
    if(body) body.innerHTML = '';
    window.blsStats.defineSections({
      'stats-software': '시설·보안',
      'stats-versions': '모델',
      'stats-check': '부품번호'
    });
    var rows = state.filtered.length ? state.filtered : state.rows;
    window.blsStats.renderCard('stats-software', '제조사', window.blsStats.countBy(rows, 'manufacturer_name'));
    window.blsStats.renderCard('stats-versions', '용량', window.blsStats.countBy(rows, 'capacity'));
    window.blsStats.renderCard('stats-check', '부품번호', window.blsStats.countBy(rows, 'part_number'));
    window.blsStats.open('system-stats-modal');
    setTimeout(function(){ window.blsStats.equalizeHeights('system-stats-modal'); }, 0);
  }

  function bindEvents(){
    var search = byId('system-search');
    if(search){
      search.addEventListener('input', function(){ state.search = search.value || ''; state.page = 1; render(); });
      search.addEventListener('keydown', function(event){ if(event.key === 'Escape'){ search.value = ''; state.search = ''; state.page = 1; render(); } });
    }
    var clear = byId('system-search-clear');
    if(clear){ clear.addEventListener('click', function(){ if(search) search.value = ''; state.search = ''; state.page = 1; render(); }); }
    var pageSize = byId('system-page-size');
    if(pageSize){ pageSize.addEventListener('change', function(){ state.pageSize = Number(pageSize.value || 10); state.page = 1; render(); }); }
    var first = byId('system-first');
    var prev = byId('system-prev');
    var next = byId('system-next');
    var last = byId('system-last');
    if(first) first.addEventListener('click', function(){ state.page = 1; render(); });
    if(prev) prev.addEventListener('click', function(){ state.page = Math.max(1, state.page - 1); render(); });
    if(next) next.addEventListener('click', function(){ state.page += 1; render(); });
    if(last) last.addEventListener('click', function(){ state.page = Math.max(1, Math.ceil(state.filtered.length / state.pageSize)); render(); });
    var numbers = byId('system-page-numbers');
    if(numbers){ numbers.addEventListener('click', function(event){ var btn = event.target.closest('button[data-page]'); if(btn){ state.page = Number(btn.getAttribute('data-page') || 1); render(); } }); }
    var tbody = byId('system-table-body');
    if(tbody){
      tbody.addEventListener('change', function(event){
        if(event.target && event.target.classList.contains('system-row-select')){
          setRowSelection(event.target.closest('tr'), event.target.checked);
          updateSelectionControls();
        }
      });
      tbody.addEventListener('click', function(event){
        if(event.target.closest('a.work-name-link')) return;
        var editBtn = event.target.closest('button[data-action="edit"]');
        if(editBtn){
          var id = Number(editBtn.getAttribute('data-id'));
          var row = state.rows.filter(function(item){ return item.id === id; })[0];
          if(row){ state.editId = id; fillEditForm(row); openModal('facility-security-edit-modal'); }
          return;
        }
        if(event.target.closest('.system-actions')) return;
        if(event.target.classList && event.target.classList.contains('system-row-select')) return;
        var tr = event.target.closest('tr');
        if(!tr) return;
        var checkbox = tr.querySelector('.system-row-select');
        if(!checkbox) return;
        setRowSelection(tr, !checkbox.checked);
        updateSelectionControls();
      });
    }
    var selectAll = byId('system-select-all');
    if(selectAll){
      selectAll.addEventListener('change', function(){
        var start = (state.page - 1) * state.pageSize;
        state.filtered.slice(start, start + state.pageSize).forEach(function(row){ state.selected[String(row.id)] = selectAll.checked; });
        renderRows();
      });
    }
    var addBtn = byId('system-add-btn');
    if(addBtn){ addBtn.addEventListener('click', function(){ fillAddForm(); openModal('facility-security-add-modal'); }); }
    var addClose = byId('facility-security-add-close');
    if(addClose) addClose.addEventListener('click', function(){ closeModal('facility-security-add-modal'); });
    var editClose = byId('facility-security-edit-close');
    if(editClose) editClose.addEventListener('click', function(){ closeModal('facility-security-edit-modal'); });
    var addSave = byId('facility-security-add-save');
    if(addSave) addSave.addEventListener('click', saveAdd);
    var editSave = byId('facility-security-edit-save');
    if(editSave) editSave.addEventListener('click', saveEdit);
    var addForm = byId('facility-security-add-form');
    if(addForm) addForm.addEventListener('change', function(event){ if(event.target && event.target.name === 'source_resource_id') syncSourceFields(addForm); });
    var editForm = byId('facility-security-edit-form');
    if(editForm) editForm.addEventListener('change', function(event){ if(event.target && event.target.name === 'source_resource_id') syncSourceFields(editForm); });
    var deleteBtn = byId('system-delete-btn');
    if(deleteBtn){
      deleteBtn.addEventListener('click', function(){
        var count = selectedIds().length;
        if(!count){ showMessage('삭제처리할 행을 먼저 선택하세요.', '안내'); return; }
        var subtitle = byId('delete-subtitle');
        if(subtitle) subtitle.textContent = '선택된 ' + count + '개의 항목을 정말 삭제처리하시겠습니까?';
        openModal('system-delete-modal');
      });
    }
    var deleteClose = byId('system-delete-close');
    if(deleteClose) deleteClose.addEventListener('click', function(){ closeModal('system-delete-modal'); });
    var deleteConfirm = byId('system-delete-confirm');
    if(deleteConfirm) deleteConfirm.addEventListener('click', deleteSelected);
    var bulkBtn = byId('system-bulk-btn');
    if(bulkBtn){
      bulkBtn.addEventListener('click', function(){
        var ids = selectedIds();
        if(!ids.length){ showMessage('일괄변경할 행을 먼저 선택하세요.', '안내'); return; }
        if(ids.length === 1){
          var row = state.rows.filter(function(item){ return item.id === ids[0]; })[0];
          if(row){ state.editId = row.id; fillEditForm(row); openModal('facility-security-edit-modal'); }
          return;
        }
        showMessage('여러 행 일괄변경은 공통 속성 정리 후 적용됩니다.', '안내');
      });
    }
    var downloadBtn = byId('system-download-btn');
    if(downloadBtn) downloadBtn.addEventListener('click', exportCsv);
    var statsBtn = byId('system-stats-btn');
    if(statsBtn) statsBtn.addEventListener('click', openStats);
    var statsClose = byId('system-stats-close');
    if(statsClose) statsClose.addEventListener('click', function(){ if(window.blsStats) window.blsStats.close('system-stats-modal'); else closeModal('system-stats-modal'); });
    var statsOk = byId('system-stats-ok');
    if(statsOk) statsOk.addEventListener('click', function(){ if(window.blsStats) window.blsStats.close('system-stats-modal'); else closeModal('system-stats-modal'); });
    var messageClose = byId('system-message-close');
    if(messageClose) messageClose.addEventListener('click', function(){ closeModal('system-message-modal'); });
    var messageOk = byId('system-message-ok');
    if(messageOk) messageOk.addEventListener('click', function(){ closeModal('system-message-modal'); });
    document.addEventListener('keydown', function(event){
      if(event.key === 'Escape'){
        ['facility-security-add-modal','facility-security-edit-modal','system-delete-modal','system-message-modal'].forEach(closeModal);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function(){ initFacilityDropdowns(); bindEvents(); loadData(); });
})();

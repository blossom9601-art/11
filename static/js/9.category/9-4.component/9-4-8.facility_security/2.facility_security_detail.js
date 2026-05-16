(function(){
  'use strict';

  var RESOURCE = String(window.__FACILITY_SECURITY_RESOURCE__ || 'access');
  var MANUAL = !!window.__FACILITY_SECURITY_MANUAL__;
  var API_BASE = '/api/facility-security-infra/' + encodeURIComponent(RESOURCE);
  var item = window.__FACILITY_SECURITY_DETAIL__ || {};
  var sourceModels = [];
  var manufacturers = [];
  var JSON_HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
  var FACILITY_TAB_ENDPOINTS = {
    access: '/api/datacenter/access/systems',
    data_delete: '/api/datacenter/data-deletion-systems?page_size=500',
    rack: '/api/org-racks',
    thermometer: '/api/org-thermometers',
    cctv: '/api/org-cctvs'
  };
  var CHART_COLORS = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#a855f7','#22c55e','#06b6d4','#f97316','#94a3b8'];

  function byId(id){ return document.getElementById(id); }
  function text(value){ return String(value == null ? '' : value).trim(); }
  function norm(value){ return text(value).toLowerCase(); }
  function pick(row, keys){
    row = row || {};
    for(var index = 0; index < keys.length; index += 1){
      var value = row[keys[index]];
      if(value !== undefined && value !== null && text(value) !== '') return text(value);
    }
    return '';
  }
  function escapeHTML(value){
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function display(value){ return value == null || value === '' ? '-' : String(value); }
  function setText(id, value){ var el = byId(id); if(el) el.textContent = display(value); }
  function withQuery(url, key, value){
    if(!value) return url;
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + encodeURIComponent(key) + '=' + encodeURIComponent(value);
  }
  function extractRows(payload){
    if(Object.prototype.toString.call(payload) === '[object Array]') return payload;
    if(!payload) return [];
    if(Object.prototype.toString.call(payload.items) === '[object Array]') return payload.items;
    if(Object.prototype.toString.call(payload.rows) === '[object Array]') return payload.rows;
    if(Object.prototype.toString.call(payload.data) === '[object Array]') return payload.data;
    return [];
  }
  function facilityTabEndpoint(resource){
    return FACILITY_TAB_ENDPOINTS[resource] || ('/api/datacenter-facility-systems/' + encodeURIComponent(resource || ''));
  }
  function currentModelName(){
    var model = text(item && item.model_name);
    if(model) return model;
    var modelEl = byId('fsi-model-name') || byId('page-header-title');
    return modelEl ? text(modelEl.textContent) : '';
  }
  function facilityTabApiUrl(){
    return withQuery(facilityTabEndpoint(RESOURCE), 'q', currentModelName());
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
  function sourceById(id){
    var target = Number(id);
    for(var i = 0; i < sourceModels.length; i += 1){
      if(Number(sourceModels[i].id) === target) return sourceModels[i];
    }
    return null;
  }
  function sourceLabel(source){
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
    sourceModels.forEach(function(source){
      var value = String(source.id);
      html += '<option value="' + escapeHTML(value) + '"' + (value === selected ? ' selected' : '') + '>' + escapeHTML(sourceLabel(source)) + '</option>';
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
    items.forEach(function(row){
      var name = manufacturerName(row);
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
    manufacturers.forEach(function(row){
      var isSelected = row.name === selected;
      if(isSelected) hasSelected = true;
      html += '<option value="' + escapeHTML(row.name) + '"' + (isSelected ? ' selected' : '') + '>' + escapeHTML(row.name) + '</option>';
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
  function updateDetail(next){
    item = next || item || {};
    setText('fsi-model-name', item.model_name);
    setText('fsi-capacity', item.capacity);
    setText('fsi-manufacturer', item.manufacturer_name);
    setText('fsi-part-number', item.part_number);
    setText('fsi-remark', item.remark);
    var title = byId('page-header-title');
    var subtitle = byId('page-header-subtitle');
    if(title) title.textContent = display(item.model_name);
    if(subtitle) subtitle.textContent = display(item.source_resource_name || item.source_resource_code || item.manufacturer_name);
  }
  function statusBucket(value){
    var status = norm(value);
    if(!status) return '';
    if(status.indexOf('가동') >= 0 || status.indexOf('운영') >= 0 || status.indexOf('정상') >= 0 || status.indexOf('active') >= 0 || status.indexOf('run') >= 0) return 'run';
    if(status.indexOf('유휴') >= 0 || status.indexOf('미사용') >= 0 || status.indexOf('idle') >= 0) return 'idle';
    if(status.indexOf('대기') >= 0 || status.indexOf('점검') >= 0 || status.indexOf('예정') >= 0 || status.indexOf('준비') >= 0 || status.indexOf('wait') >= 0 || status.indexOf('pending') >= 0 || status.indexOf('standby') >= 0) return 'wait';
    if(status.indexOf('장애') >= 0 || status.indexOf('중지') >= 0 || status.indexOf('종료') >= 0 || status.indexOf('down') >= 0 || status.indexOf('error') >= 0 || status.indexOf('stop') >= 0) return 'wait';
    return 'wait';
  }
  function showStatsEmpty(emptyEl, pieEl, legendEl, message){
    if(emptyEl){
      emptyEl.setAttribute('data-bls-empty-message', message || '할당 시스템 내역이 없습니다.');
      emptyEl.hidden = false;
      emptyEl.style.display = '';
      if(!emptyEl.querySelector('.bls-detail-no-data')) emptyEl.textContent = message || '할당 시스템 내역이 없습니다.';
    }
    if(pieEl){ pieEl.hidden = true; try{ pieEl.closest('.pie-wrap').hidden = true; }catch(_err){} }
    if(legendEl) legendEl.hidden = true;
    try{
      if(window.CustomEvent){
        document.dispatchEvent(new CustomEvent('bls-detail-stat-empty'));
      }else{
        var event = document.createEvent('Event');
        event.initEvent('bls-detail-stat-empty', true, true);
        document.dispatchEvent(event);
      }
    }catch(_dispatchErr){}
  }
  function showStatsChart(emptyEl, pieEl, legendEl){
    if(emptyEl){ emptyEl.hidden = true; emptyEl.style.display = 'none'; }
    if(pieEl){ pieEl.hidden = false; pieEl.style.display = 'block'; try{ pieEl.closest('.pie-wrap').hidden = false; }catch(_err){} }
    if(legendEl) legendEl.hidden = false;
  }
  function normalizedFacilityRows(rows){
    var target = norm(currentModelName());
    var output = [];
    (Array.isArray(rows) ? rows : []).forEach(function(raw){
      raw = raw || {};
      var model = pick(raw, ['model_name', 'system_model_name', 'model', 'rack_model', 'system_model_code']);
      if(target && target !== '-' && target !== '모델명' && norm(model) !== target) return;
      var status = pick(raw, ['business_status', 'business_status_code', 'work_status', 'biz_work_status', 'status']);
      var operation = pick(raw, ['work_operation', 'operation_name', 'business_operation', 'business_operation_name', 'work_operation_name']);
      if(!operation) operation = status || pick(raw, ['business_name', 'work_name', 'system_name', 'rack_name', 'name']);
      output.push({
        status: status,
        operation: operation,
        qty: Number(raw.qty || raw.infra_count || 1) || 1
      });
    });
    return output;
  }
  function attachPieInteractions(el, segments, total){
    try{
      if(!el || !segments || !segments.length) return;
      var tip = document.querySelector('.chart-tooltip');
      if(!tip){ tip = document.createElement('div'); tip.className = 'chart-tooltip'; document.body.appendChild(tip); }
      function showTip(clientX, clientY, segment){
        if(!segment){ tip.classList.remove('show'); return; }
        var pct = total ? Math.round((segment.count * 100) / total) : 0;
        tip.innerHTML = '<span class="tip-dot" style="background:' + segment.color + '"></span><strong>' + escapeHTML(segment.label) + '</strong> · ' + segment.count + ' (' + pct + '%)';
        tip.style.left = clientX + 'px';
        tip.style.top = clientY + 'px';
        tip.classList.add('show');
      }
      function hideTip(){ tip.classList.remove('show'); }
      function angleFromCenter(event){
        var rect = el.getBoundingClientRect();
        var centerX = rect.left + rect.width / 2;
        var centerY = rect.top + rect.height / 2;
        var deltaX = event.clientX - centerX;
        var deltaY = event.clientY - centerY;
        var radius = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        if(radius > rect.width / 2) return { outside: true, angle: 0 };
        var angle = Math.atan2(deltaY, deltaX) * 180 / Math.PI;
        return { outside: false, angle: (angle + 360) % 360 };
      }
      function segmentAt(angle){
        for(var index = 0; index < segments.length; index += 1){
          if(angle >= segments[index].start && angle <= segments[index].end) return segments[index];
        }
        return null;
      }
      var fixedSegment = null;
      el.addEventListener('mousemove', function(event){
        var pointer = angleFromCenter(event);
        if(pointer.outside){ if(!fixedSegment) hideTip(); return; }
        var segment = fixedSegment || segmentAt(pointer.angle);
        if(segment) showTip(event.clientX, event.clientY, segment);
        else if(!fixedSegment) hideTip();
      });
      el.addEventListener('mouseleave', function(){ if(!fixedSegment) hideTip(); });
      el.addEventListener('click', function(event){
        var pointer = angleFromCenter(event);
        if(pointer.outside){ fixedSegment = null; hideTip(); return; }
        fixedSegment = segmentAt(pointer.angle);
        if(fixedSegment) showTip(event.clientX, event.clientY, fixedSegment);
        else hideTip();
      });
    }catch(_err){}
  }
  function renderPie(pieEl, entries, total){
    var stops = [];
    var segments = [];
    var startDeg = 0;
    entries.forEach(function(entry, index){
      var color = entry.color || CHART_COLORS[index % CHART_COLORS.length];
      var deg = Math.round((entry.count / total) * 360);
      if(index === entries.length - 1) deg = 360 - startDeg;
      stops.push(color + ' ' + startDeg + 'deg ' + (startDeg + deg) + 'deg');
      segments.push({ label: entry.label, count: entry.count, color: color, start: startDeg, end: startDeg + deg });
      startDeg += deg;
    });
    if(pieEl){
      pieEl.style.background = 'conic-gradient(' + stops.join(', ') + ')';
      attachPieInteractions(pieEl, segments, total);
    }
  }
  function renderStatusStats(rows){
    var statPie = byId('stat-pie');
    var statEmpty = byId('stat-empty');
    var statLegend = null;
    try{ if(statPie && statPie.parentElement) statLegend = statPie.parentElement.querySelector('.pie-legend'); }catch(_err){}
    var counts = { run: 0, idle: 0, wait: 0 };
    rows.forEach(function(row){
      var bucket = statusBucket(row.status);
      if(bucket) counts[bucket] += row.qty;
    });
    var total = counts.run + counts.idle + counts.wait;
    if(!total){ showStatsEmpty(statEmpty, statPie, statLegend, '할당 시스템 내역이 없습니다.'); return; }
    showStatsChart(statEmpty, statPie, statLegend);
    var segments = [
      { id: 'stat-run-legend', label: '가동', count: counts.run, color: '#6366f1' },
      { id: 'stat-idle-legend', label: '유휴', count: counts.idle, color: '#0ea5e9' },
      { id: 'stat-wait-legend', label: '대기', count: counts.wait, color: '#94a3b8' }
    ];
    segments.forEach(function(segment){
      var legendValue = byId(segment.id);
      var legendItem = legendValue ? legendValue.closest('.legend-item') : null;
      if(segment.count > 0){
        if(legendValue) legendValue.textContent = segment.count + ' (' + Math.round((segment.count * 100) / total) + '%)';
        if(legendItem) legendItem.style.display = '';
      }else if(legendItem){
        legendItem.style.display = 'none';
      }
    });
    renderPie(statPie, segments.filter(function(segment){ return segment.count > 0; }), total);
  }
  function renderOperationStats(rows){
    var operPie = byId('oper-pie');
    var operLegend = byId('oper-legend');
    var operEmpty = byId('oper-empty');
    var map = {};
    rows.forEach(function(row){
      var label = text(row.operation) || '미지정';
      map[label] = (map[label] || 0) + row.qty;
    });
    var entries = Object.keys(map).map(function(label){ return { label: label, count: map[label] }; });
    entries.sort(function(left, right){ return right.count - left.count; });
    var total = entries.reduce(function(sum, entry){ return sum + entry.count; }, 0);
    if(!total){ showStatsEmpty(operEmpty, operPie, operLegend, '할당 시스템 내역이 없습니다.'); return; }
    showStatsChart(operEmpty, operPie, operLegend);
    if(operLegend){
      operLegend.innerHTML = '';
      entries.forEach(function(entry, index){
        var color = CHART_COLORS[index % CHART_COLORS.length];
        entry.color = color;
        var legendItem = document.createElement('li');
        legendItem.className = 'legend-item';
        var dot = document.createElement('span');
        dot.className = 'legend-dot';
        dot.style.background = color;
        var host = document.createElement('span');
        host.className = 'legend-host';
        host.textContent = entry.label;
        var size = document.createElement('span');
        size.className = 'legend-size';
        size.textContent = entry.count + ' (' + Math.round((entry.count * 100) / total) + '%)';
        legendItem.appendChild(dot);
        legendItem.appendChild(host);
        legendItem.appendChild(size);
        operLegend.appendChild(legendItem);
      });
    }
    renderPie(operPie, entries, total);
  }
  function updateStats(rows){
    var normalized = normalizedFacilityRows(rows);
    renderStatusStats(normalized);
    renderOperationStats(normalized);
  }
  function loadStats(){
    return requestJson(facilityTabApiUrl()).then(function(payload){
      updateStats(extractRows(payload));
    }).catch(function(){ updateStats([]); });
  }
  function loadManufacturers(){
    return requestJson('/api/vendor-manufacturers').then(function(payload){
      manufacturers = normalizeManufacturers(payload.items || payload.rows || []);
    }).catch(function(){
      manufacturers = [];
    });
  }
  function loadSources(){
    return requestJson(API_BASE + '/source-models').then(function(payload){
      var rows = payload.items || payload.rows || [];
      sourceModels = rows.map(normalizeSource).filter(function(row){ return row.model_name && isFinite(row.id); });
    });
  }
  function openEdit(){
    if(!item || !item.id){ showMessage('수정할 상세 정보를 찾을 수 없습니다.', '오류'); return; }
    loadManufacturers().then(function(){
      var form = byId('facility-security-edit-form');
      if(!form) return;
      form.innerHTML = formMarkup('facility-security-edit', item);
      renderManufacturerOptions(form.querySelector('select[name="manufacturer_name"]'), item.manufacturer_name);
      openModal('facility-security-edit-modal');
    });
  }
  function saveEdit(){
    var form = byId('facility-security-edit-form');
    if(!form || !item || !item.id) return;
    var payload;
    try { payload = collectPayload(form); }
    catch(err){ showMessage(err.message, '안내'); return; }
    requestJson(API_BASE + '/' + encodeURIComponent(item.id), { method: 'PUT', body: JSON.stringify(payload) }).then(function(result){
      updateDetail(result.item || item);
      loadStats();
      closeModal('facility-security-edit-modal');
    }).catch(function(err){ showMessage(err.message || '수정 중 오류가 발생했습니다.', '오류'); });
  }
  function bindEvents(){
    var editOpen = byId('facility-security-detail-edit-open');
    if(editOpen) editOpen.addEventListener('click', openEdit);
    var editClose = byId('facility-security-edit-close');
    if(editClose) editClose.addEventListener('click', function(){ closeModal('facility-security-edit-modal'); });
    var editSave = byId('facility-security-edit-save');
    if(editSave) editSave.addEventListener('click', saveEdit);
    var form = byId('facility-security-edit-form');
    if(form) form.addEventListener('change', function(event){ if(event.target && event.target.name === 'source_resource_id') syncSourceFields(form); });
    var messageClose = byId('system-message-close');
    if(messageClose) messageClose.addEventListener('click', function(){ closeModal('system-message-modal'); });
    var messageOk = byId('system-message-ok');
    if(messageOk) messageOk.addEventListener('click', function(){ closeModal('system-message-modal'); });
    document.addEventListener('keydown', function(event){
      if(event.key === 'Escape'){
        ['facility-security-edit-modal','system-message-modal'].forEach(closeModal);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function(){ updateDetail(item); bindEvents(); loadStats(); });
})();

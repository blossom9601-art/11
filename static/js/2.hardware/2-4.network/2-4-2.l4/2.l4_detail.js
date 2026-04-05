// l4_detail.js: Network L4 Detail page behaviors (tab logic removed)

(function(){
  try{ window.STORAGE_PREFIX = 'l4'; }catch(_){ }

  // Early: apply saved sidebar state to prevent flash
  try {
    document.documentElement.classList.add('sidebar-preload');
    var state = localStorage.getItem('sidebarState');
    var style = document.createElement('style');
    if(state === 'collapsed'){
      style.innerHTML = '.sidebar{width:70px !important} .main-content{margin-left:70px !important}';
    } else if(state === 'hidden'){
      style.innerHTML = '.sidebar{transform:translateX(-100%) !important;width:260px !important} .main-content{margin-left:0 !important}';
    } else {
      style.innerHTML = '';
    }
    try { if(document.head){ document.head.appendChild(style); } } catch(_){ }
  } catch(_){ }

  var STORAGE_PREFIX = 'l4';
  var EDIT_OPEN_ID = 'detail-edit-open';
  var EDIT_MODAL_ID = 'system-edit-modal';
  var EDIT_FORM_ID = 'system-edit-form';
  var EDIT_SAVE_ID = 'system-edit-save';
  var EDIT_CLOSE_ID = 'system-edit-close';
  var API_ENDPOINT = '/api/hardware/network/l4/assets';

  var BHD = null;
  try{ BHD = window.BlossomHardwareDetail || null; }catch(_eBHD){ BHD = null; }

  function normStr(v){ return (v == null ? '' : String(v)).trim(); }

  function byId(id){ try{ return document.getElementById(id); }catch(_e){ return null; } }

  function openModalCompat(id){
    try{ if(typeof window.openModal === 'function'){ window.openModal(id); return; } }catch(_e){ }
    var el = byId(id);
    if(!el) return;
    document.body.classList.add('modal-open');
    el.classList.add('show');
    el.setAttribute('aria-hidden','false');
  }

  function closeModalCompat(id){
    try{ if(typeof window.closeModal === 'function'){ window.closeModal(id); return; } }catch(_e){ }
    var el = byId(id);
    if(!el) return;
    el.classList.remove('show');
    el.setAttribute('aria-hidden','true');
    if(!document.querySelector('.modal-overlay-full.show')){
      document.body.classList.remove('modal-open');
    }
  }

  function notify(msg, title){
    try{
      // Prefer UI toast/modal message. (showMessage signature used across this codebase: message, title)
      if(typeof window.showMessage === 'function') return window.showMessage(String(msg || ''), String(title || '알림'));
    }catch(_e){ }
    // No fallback UI/console noise here.
  }

  function getSelectedRow(){
    try{ if(BHD && typeof BHD.getSelectedRow === 'function') return BHD.getSelectedRow(STORAGE_PREFIX); }catch(_e0){ }
    var raw = '';
    try{ raw = sessionStorage.getItem(STORAGE_PREFIX + ':selected:row') || ''; }catch(_e0){ raw = ''; }
    if(!raw){
      try{ raw = localStorage.getItem(STORAGE_PREFIX + ':selected:row') || ''; }catch(_e1){ raw = ''; }
    }
    if(!raw) return null;
    try{ return JSON.parse(raw); }catch(_e2){ return null; }
  }

  function storeSelectedRow(row){
    if(!row) return;
    try{ if(BHD && typeof BHD.storeSelectedRow === 'function'){ BHD.storeSelectedRow(STORAGE_PREFIX, row); return; } }catch(_eB){ }
    try{ sessionStorage.setItem(STORAGE_PREFIX + ':selected:row', JSON.stringify(row)); }catch(_e0){ }
    try{ localStorage.setItem(STORAGE_PREFIX + ':selected:row', JSON.stringify(row)); }catch(_e1){ }
    // Persist key fields for cross-tab usage (hardware tab system row)
    try{
      localStorage.setItem(STORAGE_PREFIX+':current:model',  String(row.server_model_name || row.model || ''));
      localStorage.setItem(STORAGE_PREFIX+':current:vendor', String(row.manufacturer_name || row.vendor || ''));
      localStorage.setItem(STORAGE_PREFIX+':current:serial', String(row.serial || row.serial_number || ''));
      localStorage.setItem(STORAGE_PREFIX+':current:fw',     String(row.fw || row.firmware || ''));
    }catch(_eCache){ }
  }

  function resolveAssetId(){
    try{ if(BHD && typeof BHD.resolveAssetId === 'function') return String(BHD.resolveAssetId(STORAGE_PREFIX) || ''); }catch(_eR){ }
    try{
      var params = new URLSearchParams(window.location.search || '');
      var assetId = params.get('hardware_id') || params.get('hardwareId') || params.get('asset_id') || params.get('assetId') || params.get('id');
      if(assetId) return String(assetId);
    }catch(_e){ }
    try{ var v = sessionStorage.getItem(STORAGE_PREFIX + ':selected:asset_id'); if(v) return String(v); }catch(_e0){ }
    try{ var v2 = localStorage.getItem(STORAGE_PREFIX + ':selected:asset_id'); if(v2) return String(v2); }catch(_e1){ }
    var row = getSelectedRow();
    if(row && row.hardware_id != null) return String(row.hardware_id);
    if(row && row.asset_id != null) return String(row.asset_id);
    if(row && row.id != null) return String(row.id);
    return '';
  }

  function _coerceDisplay(value){
    if(value === 0) return '0';
    if(value == null) return '';
    var v = String(value).trim();
    return v;
  }

  function _normLabel(s){
    var t = (s == null ? '' : String(s));
    // Remove common trailing punctuation and normalize whitespace
    t = t.replace(/[:：]\s*$/g, '');
    t = t.replace(/[\s\u00A0]+/g, ' ').trim();
    return t;
  }

  function _setOxBadgeState(oxEl, rawValue){
    if(!oxEl) return;
    var v = _coerceDisplay(rawValue);
    var up = v.toUpperCase();
    var isEmpty = (v === '' || v === '-' || v === 'N/A');
    var isOn = (!isEmpty && (up === 'O' || up === 'Y' || up === 'YES' || up === 'TRUE' || up === '1' || v === '예'));
    var isOff = (!isEmpty && (up === 'X' || up === 'N' || up === 'NO' || up === 'FALSE' || up === '0' || v === '아니오'));

    try{
      oxEl.classList.remove('on','off','is-empty');
      if(isEmpty) oxEl.classList.add('is-empty');
      else if(isOn) oxEl.classList.add('on');
      else if(isOff) oxEl.classList.add('off');
    }catch(_eC){ }
  }

  function setValueByLabel(labelText, value){
    try{
      var rows = document.querySelectorAll('#basic .info-row');
      if(!rows || !rows.length) rows = document.querySelectorAll('.basic-info-grid .info-row');
      var labelNeedle = _normLabel(labelText);
      for(var i=0;i<rows.length;i++){
        var rowEl = rows[i];
        var lab = rowEl.querySelector('label');
        var labText = _normLabel(lab && lab.textContent ? lab.textContent : '');
        if(labText !== labelNeedle) continue;

        var v = _coerceDisplay(value);
        var text = (v === '') ? '-' : v;

        var statusText = rowEl.querySelector('.status-pill .status-text');
        var badge = rowEl.querySelector('.info-value');
        var info = rowEl.querySelector('.info-value');
        var num = rowEl.querySelector('.num-badge');
        var ox = rowEl.querySelector('.ox-badge');

        var target = statusText || badge || info || num || ox;
        if(target){
          target.textContent = text;
        }
        if(ox){
          try{ ox.setAttribute('aria-label', text); }catch(_eA){ }
          _setOxBadgeState(ox, v);
        }

        // Make empty states visually consistent
        if(num){
          try{
            num.classList.remove('is-empty');
            if(v === '' || text === '-') num.classList.add('is-empty');
          }catch(_eNE){ }
        }

        // Special styling
        if(statusText){
          try{
            var dot = rowEl.querySelector('.status-pill .status-dot');
            if(dot){
              dot.classList.remove('ws-run','ws-idle','ws-wait');
              var cls = (text === '가동') ? 'ws-run' : ((text === '유휴') ? 'ws-idle' : 'ws-wait');
              dot.classList.add(cls);
            }
          }catch(_eS){ }
        }

        if(num){
          try{
            num.classList.remove('tone-1','tone-2','tone-3');
            var n = parseInt(String(v || ''), 10);
            if(isNaN(n)){
              num.classList.add('tone-1');
            } else if(labelNeedle === '보안 점수'){
              num.classList.add(n >= 8 ? 'tone-3' : (n >= 6 ? 'tone-2' : 'tone-1'));
            } else {
              num.classList.add(n >= 3 ? 'tone-3' : (n === 2 ? 'tone-2' : 'tone-1'));
            }
          }catch(_eN){ }
        }

        // Keep virtualization attribute in sync if present
        if(badge && labelNeedle === '시스템 가상화'){
          try{ badge.dataset.virtualization = (v || ''); }catch(_eV){ }
        }

        break;
      }
    }catch(_e){ }
  }

  function applyRowToBasicInfo(row){
    if(!row) return;
    setValueByLabel('업무 상태', row.work_status || '-');
    setValueByLabel('업무 분류', row.work_type || '-');
    setValueByLabel('업무 구분', row.work_category || '-');
    setValueByLabel('업무 운영', row.work_operation || '-');
    setValueByLabel('업무 그룹', row.work_group || '-');
    setValueByLabel('업무 이름', row.work_name || '-');
    setValueByLabel('시스템 이름', row.system_name || '-');
    setValueByLabel('시스템 IP', row.system_ip || '-');
    setValueByLabel('관리 IP', row.manage_ip || row.mgmt_ip || '-');

    setValueByLabel('시스템 제조사', row.vendor || '-');
    setValueByLabel('시스템 모델명', row.model || '-');
    setValueByLabel('시스템 일련번호', row.serial || '-');
    setValueByLabel('시스템 가상화', row.virtualization || '-');
    setValueByLabel('시스템 장소', row.location_place || '-');
    setValueByLabel('시스템 위치', row.location_pos || '-');
    setValueByLabel('시스템 슬롯', row.slot || '-');
    setValueByLabel('시스템 크기', row.u_size || '-');

    setValueByLabel('시스템 담당부서', row.sys_dept || '-');
    setValueByLabel('시스템 담당자', row.sys_owner || '-');
    setValueByLabel('서비스 담당부서', row.svc_dept || '-');
    setValueByLabel('서비스 담당자', row.svc_owner || '-');

    setValueByLabel('기밀성', row.confidentiality || '-');
    setValueByLabel('무결성', row.integrity || '-');
    setValueByLabel('가용성', row.availability || '-');
    setValueByLabel('보안 점수', row.security_score || '-');
    setValueByLabel('시스템 등급', row.system_grade || '-');
    setValueByLabel('핵심/일반', row.core_flag || '-');
    setValueByLabel('DR 구축여부', row.dr_built || '-');
    setValueByLabel('서비스 이중화', row.svc_redundancy || '-');
  }

  function initDetailTabScripts(){
    function loadScriptOnce(src, onReady){
      try{
        var existing = document.querySelector('script[src="'+src+'"], script[data-bls-src="'+src+'"]');
        if(existing){ if(onReady) onReady(); return; }
      }catch(_){ }
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.dataset.blsSrc = src;
      s.onload = function(){ if(onReady) onReady(); };
      s.onerror = function(){ if(onReady) onReady(); };
      (document.head || document.documentElement).appendChild(s);
    }

    if(byId('hw-spec-table')) loadScriptOnce('/static/js/_detail/tab01-hardware.js?v=10');
    if(byId('if-spec-table')) loadScriptOnce('/static/js/_detail/tab04-interface.js');
    if(byId('am-spec-table')) loadScriptOnce('/static/js/_detail/tab05-account.js');
    if(byId('tk-spec-table')) loadScriptOnce('/static/js/_detail/tab11-task.js');
    if(byId('lg-spec-table')) loadScriptOnce('/static/js/_detail/tab14-log.js');
    if(byId('fi-attach-input') || byId('fi-diagram-input') || byId('fi-attach-list') || byId('fi-diagram-box')) loadScriptOnce('/static/js/_detail/tab15-file.js');
  }

  function normalizeFromApi(item){
    var coreRaw = item ? item.is_core_system : null;
    var drRaw = item ? item.has_dr_site : null;
    var haRaw = item ? item.has_service_ha : null;
    var isCore = (coreRaw === 1 || coreRaw === true || coreRaw === '1');
    var hasDr = (drRaw === 1 || drRaw === true || drRaw === '1');
    var hasHa = (haRaw === 1 || haRaw === true || haRaw === '1');
    var coreFlag = (coreRaw == null ? '' : (isCore ? '핵심' : '일반'));
    var drFlag = (drRaw == null ? '' : (hasDr ? 'O' : 'X'));
    var haFlag = (haRaw == null ? '' : (hasHa ? 'O' : 'X'));
    return {
      id: item && item.id,
      asset_id: item && item.id,
      work_status: (item && (item.work_status_name || item.work_status_code)) || '',
      work_type: (item && (item.work_type_name || item.work_type_code || item.work_category_name || item.work_category_code)) || '',
      work_category: (item && (item.work_category_name || item.work_category_code || item.work_division_name || item.work_division_code)) || '',
      work_operation: (item && (item.work_operation_name || item.work_operation_code)) || '',
      work_group: (item && (item.work_group_name || item.work_group_code)) || '',
      work_name: (item && (item.work_name || item.asset_name)) || '',
      system_name: (item && item.system_name) || '',
      system_ip: (item && item.system_ip) || '',
      manage_ip: (item && (item.mgmt_ip || item.manage_ip)) || '',
      vendor: (item && (item.manufacturer_name || item.manufacturer_code)) || '',
      model: (item && (item.server_model_name || item.server_code || item.model_name || item.model_code)) || '',
      serial: (item && (item.serial_number || item.serial)) || '',
      virtualization: (item && (item.virtualization_type || item.virtualization)) || '',
      location_place: (item && (item.center_name || item.center_code)) || '',
      location_place_code: (item && item.center_code) || '',
      location_pos: (item && (item.rack_name || item.rack_code)) || '',
      location_pos_code: (item && item.rack_code) || '',
      slot: (item && item.system_slot != null ? String(item.system_slot) : (item && item.slot != null ? String(item.slot) : '')),
      u_size: (item && item.system_size != null ? String(item.system_size) : (item && item.u_size != null ? String(item.u_size) : '')),
      rack_face: (item && item.rack_face) || 'FRONT',
      sys_dept: (item && (item.system_dept_name || item.system_dept_code)) || '',
      sys_owner: (item && (item.system_owner_name || item.system_owner_emp_no)) || '',
      svc_dept: (item && (item.service_dept_name || item.service_dept_code)) || '',
      svc_owner: (item && (item.service_owner_name || item.service_owner_emp_no)) || '',
      confidentiality: (item && item.cia_confidentiality != null ? String(item.cia_confidentiality) : ''),
      integrity: (item && item.cia_integrity != null ? String(item.cia_integrity) : ''),
      availability: (item && item.cia_availability != null ? String(item.cia_availability) : ''),
      security_score: (item && item.security_score != null ? String(item.security_score) : ''),
      system_grade: (item && item.system_grade) || '',
      core_flag: coreFlag,
      dr_built: drFlag,
      svc_redundancy: haFlag
    };
  }

  var COLUMN_META = window.COLUMN_META || {
    work_status: { label: '업무 상태' },
    work_type: { label: '업무 분류' },
    work_category: { label: '업무 구분' },
    work_operation: { label: '업무 운영' },
    work_group: { label: '업무 그룹' },
    work_name: { label: '업무 이름' },
    system_name: { label: '시스템 이름' },
    system_ip: { label: '시스템 IP' },
    manage_ip: { label: '관리 IP' },
    vendor: { label: '시스템 제조사' },
    model: { label: '시스템 모델명' },
    serial: { label: '시스템 일련번호' },
    virtualization: { label: '시스템 가상화' },
    location_place: { label: '시스템 장소' },
    location_pos: { label: '시스템 위치' },
    slot: { label: '시스템 슬롯' },
    u_size: { label: '시스템 크기' },
      rack_face: { label: 'RACK 전면/후면' },
    sys_dept: { label: '시스템 담당부서' },
    sys_owner: { label: '시스템 담당자' },
    svc_dept: { label: '서비스 담당부서' },
    svc_owner: { label: '서비스 담당자' },
    confidentiality: { label: '기밀성' },
    integrity: { label: '무결성' },
    availability: { label: '가용성' },
    security_score: { label: '보안 점수' },
    system_grade: { label: '시스템 등급' },
    core_flag: { label: '핵심/일반' },
    dr_built: { label: 'DR 구축여부' },
    svc_redundancy: { label: '서비스 이중화' }
  };

  var currentAssetId = '';

  function buildEditFormFromRow(row){
    var form = byId(EDIT_FORM_ID); if(!form) return;
    var data = row || getSelectedRow() || {};

    function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

    function fieldInput(col, value){
      var v = (value == null) ? '' : String(value);
      var opts = {
        virtualization:['','물리','가상'],
        confidentiality:['','1','2','3'],
        integrity:['','1','2','3'],
        availability:['','1','2','3'],
        system_grade:['','1등급','2등급','3등급'],
        core_flag:['','핵심','일반'],
        dr_built:['','O','X'],
        svc_redundancy:['','O','X']
      };

      if(col === 'security_score'){
        return '<input name="security_score" class="form-input" type="number" readonly placeholder="자동 합계" value="'+esc(v)+'">';
      }
      if(col === 'model'){
        return '<input name="model" class="form-input" data-fk-allow="1" value="'+esc(v)+'">';
      }

      // Location fields must preserve code values for proper FK selection + saving.
      if(col === 'location_place'){
        var codeV = (data && data.location_place_code != null) ? String(data.location_place_code) : '';
        return '<input name="location_place" class="form-input" value="'+esc(codeV || v)+'">';
      }
      if(col === 'location_pos'){
        var codeV2 = (data && data.location_pos_code != null) ? String(data.location_pos_code) : '';
        return '<input name="location_pos" class="form-input" value="'+esc(codeV2 || v)+'">';
      }
      if(opts[col]){
        var extraCls = (col === 'confidentiality' || col === 'integrity' || col === 'availability') ? 'score-trigger' : '';
        return '<select name="'+col+'" class="form-input search-select '+extraCls+'" data-searchable="true" data-searchable-scope="modal">'+
          opts[col].map(function(o){
            var sel = (String(o) === String(v)) ? ' selected' : '';
            return '<option value="'+esc(o)+'"'+sel+'>'+(o ? esc(o) : '-')+'</option>';
          }).join('')+
        '</select>';
      }
      if(col==='rack_face'){
        var selF=(value||'').toUpperCase()==='REAR'||value==='후면'?'':' selected';
        var selR=(value||'').toUpperCase()==='REAR'||value==='후면'?' selected':'';
        return '<select name="rack_face" class="form-input search-select" data-searchable="true" data-placeholder="선택"><option value="">선택</option><option value="FRONT"'+selF+'>전면</option><option value="REAR"'+selR+'>후면</option></select>';
      }
      if(col === 'slot' || col === 'u_size'){
        return '<input name="'+col+'" type="number" min="0" step="1" class="form-input" value="'+esc(v)+'">';
      }
      return '<input name="'+col+'" class="form-input" value="'+esc(v)+'">';
    }

    var GROUPS = [
      { title:'비즈니스', cols:['work_type','work_category','work_status','work_operation','work_group','work_name','system_name','system_ip','manage_ip'] },
      { title:'시스템', cols:['vendor','model','serial','virtualization','location_place','location_pos','slot','u_size','rack_face'] },
      { title:'담당자', cols:['sys_dept','sys_owner','svc_dept','svc_owner'] },
      { title:'점검', cols:['confidentiality','integrity','availability','security_score','system_grade','core_flag','dr_built','svc_redundancy'] }
    ];

    var html = GROUPS.map(function(g){
      var grid = g.cols.map(function(c){
        var meta = COLUMN_META[c] || { label: c };
        return '<div class="form-row"><label>'+esc(meta.label)+'</label>'+fieldInput(c, data[c])+'</div>';
      }).join('');
      return '<div class="form-section"><div class="section-header"><h4>'+esc(g.title)+'</h4></div><div class="form-grid">'+grid+'</div></div>';
    }).join('');

    form.innerHTML = html;
    attachSecurityScoreRecalc(form);
  }

  function attachSecurityScoreRecalc(form){
    if(!form) return;
    var scoreInput = form.querySelector('input[name="security_score"]');
    if(!scoreInput) return;
    function recompute(){
      var c = parseInt((form.querySelector('[name="confidentiality"]')||{}).value || '0', 10) || 0;
      var i = parseInt((form.querySelector('[name="integrity"]')||{}).value || '0', 10) || 0;
      var a = parseInt((form.querySelector('[name="availability"]')||{}).value || '0', 10) || 0;
      var total = c + i + a;
      scoreInput.value = total ? String(total) : '';
      var gradeField = form.querySelector('[name="system_grade"]');
      if(gradeField){
        if(total >= 8) gradeField.value = '1등급';
        else if(total >= 6) gradeField.value = '2등급';
        else if(total > 0) gradeField.value = '3등급';
      }
    }
    ['confidentiality','integrity','availability'].forEach(function(n){
      var el = form.querySelector('[name="'+n+'"]');
      if(el) el.addEventListener('change', recompute);
    });
    recompute();
  }

  function readValue(el){
    if(!el) return '';
    if(el.tagName && el.tagName.toLowerCase() === 'select') return String(el.value || '');
    return String(el.value || '');
  }

  function readDisplayValue(el){
    if(!el) return '';
    if(el.tagName && el.tagName.toLowerCase() === 'select'){
      var opt = (el.selectedOptions && el.selectedOptions[0]) ? el.selectedOptions[0] : null;
      var txt = opt ? (opt.textContent || '').trim() : '';
      return txt || String(el.value || '');
    }
    return String(el.value || '');
  }

  function setField(payload, key, raw){
    if(raw == null){ payload[key] = null; return; }
    var s = String(raw).trim();
    if(s === '' || s === '선택'){
      payload[key] = null;
      return;
    }
    payload[key] = s;
  }

  function collectRowFromForm(form){
    function el(name){ return form.querySelector('[name="'+name+'"]'); }

    var FK_FIELDS = {
      work_type:1, work_category:1, work_status:1, work_operation:1, work_group:1,
      vendor:1, model:1,
      location_place:1, location_pos:1,
      sys_dept:1, sys_owner:1, svc_dept:1, svc_owner:1
    };

    function vDom(name){
      var element = el(name);
      return FK_FIELDS[name] ? readDisplayValue(element) : readValue(element);
    }

    return {
      id: currentAssetId,
      asset_id: currentAssetId,
      work_status: vDom('work_status'),
      work_type: vDom('work_type'),
      work_category: vDom('work_category'),
      work_operation: vDom('work_operation'),
      work_group: vDom('work_group'),
      work_name: vDom('work_name'),
      system_name: vDom('system_name'),
      system_ip: vDom('system_ip'),
      manage_ip: vDom('manage_ip'),
      vendor: vDom('vendor'),
      model: vDom('model'),
      serial: vDom('serial'),
      virtualization: vDom('virtualization'),
      location_place: vDom('location_place'),
      location_pos: vDom('location_pos'),
      location_place_code: readValue(el('location_place')),
      location_pos_code: readValue(el('location_pos')),
      slot: vDom('slot'),
      u_size: vDom('u_size'),
      sys_dept: vDom('sys_dept'),
      sys_owner: vDom('sys_owner'),
      svc_dept: vDom('svc_dept'),
      svc_owner: vDom('svc_owner'),
      confidentiality: vDom('confidentiality'),
      integrity: vDom('integrity'),
      availability: vDom('availability'),
      security_score: vDom('security_score'),
      system_grade: vDom('system_grade'),
      core_flag: vDom('core_flag'),
      dr_built: vDom('dr_built'),
      svc_redundancy: vDom('svc_redundancy')
    };
  }

  function buildPayloadFromForm(form){
    function el(name){ return form.querySelector('[name="'+name+'"]'); }
    function vRaw(name){ return readValue(el(name)); }

    var payload = {};

    setField(payload, 'work_type', vRaw('work_type'));
    setField(payload, 'work_category', vRaw('work_category'));
    setField(payload, 'work_status', vRaw('work_status'));
    setField(payload, 'work_operation', vRaw('work_operation'));
    setField(payload, 'work_group', vRaw('work_group'));

    setField(payload, 'work_name', vRaw('work_name'));
    setField(payload, 'system_name', vRaw('system_name'));
    setField(payload, 'system_ip', vRaw('system_ip'));
    setField(payload, 'mgmt_ip', vRaw('manage_ip'));

    setField(payload, 'vendor', vRaw('vendor'));
    setField(payload, 'model', vRaw('model'));
    setField(payload, 'serial', vRaw('serial'));
    setField(payload, 'virtualization_type', vRaw('virtualization'));
    setField(payload, 'center_code', vRaw('location_place'));
    setField(payload, 'rack_code', vRaw('location_pos'));

    setField(payload, 'slot', vRaw('slot'));
    setField(payload, 'u_size', vRaw('u_size'));

    setField(payload, 'system_department', vRaw('sys_dept'));
    setField(payload, 'system_owner', vRaw('sys_owner'));
    setField(payload, 'service_department', vRaw('svc_dept'));
    setField(payload, 'service_owner', vRaw('svc_owner'));

    setField(payload, 'cia_confidentiality', vRaw('confidentiality'));
    setField(payload, 'cia_integrity', vRaw('integrity'));
    setField(payload, 'cia_availability', vRaw('availability'));
    setField(payload, 'security_score', vRaw('security_score'));
    setField(payload, 'system_grade', vRaw('system_grade'));
    setField(payload, 'core_flag', vRaw('core_flag'));
    setField(payload, 'dr_built', vRaw('dr_built'));
    setField(payload, 'svc_redundancy', vRaw('svc_redundancy'));

    return payload;
  }

  function apiJSON(url, opts){
    var options = opts || {};
    options.headers = options.headers || {};
    if(!options.headers['Accept']) options.headers['Accept'] = 'application/json';
    if(options.method && String(options.method).toUpperCase() !== 'GET'){
      if(!options.headers['Content-Type']) options.headers['Content-Type'] = 'application/json';
    }

    try{
      if(BHD && typeof BHD.fetchJSON === 'function') return BHD.fetchJSON(url, options);
    }catch(_eB){ }

    return fetch(url, options).then(function(res){
      return res.json().catch(function(){ return null; }).then(function(json){
        if(!res.ok){
          var msg = (json && (json.message || json.error)) ? (json.message || json.error) : ('HTTP ' + res.status);
          throw new Error(msg);
        }
        return json;
      });
    });
  }

  function initHeader(){
    try{
      if(BHD && typeof BHD.initHeader === 'function'){
        BHD.initHeader({
          storagePrefix: STORAGE_PREFIX,
          headerKeyPrefix: 'network_l4',
          titleIds: ['page-title'],
          subtitleIds: ['page-subtitle'],
          stripQueryParams: false
        });
        return;
      }
    }catch(_eB){ }
    try{
      var params = new URLSearchParams(window.location.search || '');
      var work = params.get('work');
      var system = params.get('system');
      var assetId = params.get('asset_id') || params.get('assetId') || params.get('id');
      if(work || system){
        try{ if(work != null) sessionStorage.setItem('network_l4:selected:work_name', work); }catch(_e0){ }
        try{ if(system != null) sessionStorage.setItem('network_l4:selected:system_name', system); }catch(_e1){ }
      }
      if(assetId){
        try{ sessionStorage.setItem(STORAGE_PREFIX + ':selected:asset_id', String(assetId)); }catch(_e2){ }
        try{ localStorage.setItem(STORAGE_PREFIX + ':selected:asset_id', String(assetId)); }catch(_e3){ }
      }
      if(!work){ try{ work = sessionStorage.getItem('network_l4:selected:work_name') || '-'; }catch(_e4){ work='-'; } }
      if(!system){ try{ system = sessionStorage.getItem('network_l4:selected:system_name') || '-'; }catch(_e5){ system='-'; } }
      var titleEl = document.getElementById('page-title') || document.querySelector('.page-header h1');
      var subEl = document.getElementById('page-subtitle') || document.querySelector('.page-header p');
      if(titleEl) titleEl.textContent = String(work || '-');
      if(subEl) subEl.textContent = String(system || '-');
    }catch(_e){ }
  }

  function init(){
    initHeader();

    var selected = getSelectedRow();
    currentAssetId = resolveAssetId();
    applyRowToBasicInfo(selected);
    try{
      if(selected && (selected.work_name || selected.system_name)){
        var titleEl = byId('page-title') || document.querySelector('.page-header h1');
        var subEl = byId('page-subtitle') || document.querySelector('.page-header p');
        if(titleEl && selected.work_name) titleEl.textContent = String(selected.work_name);
        if(subEl && selected.system_name) subEl.textContent = String(selected.system_name);
      }
    }catch(_eH){ }

    // Best-effort refresh from API
    (function(){
      if(!currentAssetId) return;
      apiJSON(API_ENDPOINT + '/' + encodeURIComponent(String(currentAssetId)), { method:'GET' })
        .then(function(json){
          if(!json || json.success !== true) return;
          if(!json.item) return;
          var row = normalizeFromApi(json.item);
          storeSelectedRow(row);
          applyRowToBasicInfo(row);
          try{
            var titleEl = byId('page-title') || document.querySelector('.page-header h1');
            var subEl = byId('page-subtitle') || document.querySelector('.page-header p');
            if(titleEl) titleEl.textContent = String(row.work_name || '-');
            if(subEl) subEl.textContent = String(row.system_name || '-');
          }catch(_e2){ }
        })
        .catch(function(_e){ });
    })();

    function saveEdit(){
      var form = byId(EDIT_FORM_ID); if(!form) return;

      var rowBefore = getSelectedRow() || {};

      var rowDraft = collectRowFromForm(form);

      // If FK widgets haven't populated yet, collected display values can be codes.
      // Prefer the previous row's display labels to avoid brief code flash.
      (function preferDisplayLabelsIfNotReady(){
        try{
          var placeEl = form.querySelector('[name="location_place"]');
          var posEl = form.querySelector('[name="location_pos"]');

          var placeNotReady = !!(placeEl && placeEl.tagName !== 'SELECT');
          var posNotReady = !!(posEl && posEl.tagName !== 'SELECT');

          if(placeEl && placeEl.tagName === 'SELECT' && placeEl.dataset.fkPopulated !== '1') placeNotReady = true;
          if(posEl && posEl.tagName === 'SELECT' && posEl.dataset.fkPopulated !== '1') posNotReady = true;

          if(placeNotReady && rowBefore.location_place && rowDraft.location_place && rowDraft.location_place === rowDraft.location_place_code){
            rowDraft.location_place = rowBefore.location_place;
          }
          if(posNotReady && rowBefore.location_pos && rowDraft.location_pos && rowDraft.location_pos === rowDraft.location_pos_code){
            rowDraft.location_pos = rowBefore.location_pos;
          }
        }catch(_eD){ }
      })();
      storeSelectedRow(rowDraft);
      applyRowToBasicInfo(rowDraft);
      try{
        var titleEl = byId('page-title') || document.querySelector('.page-header h1');
        var subEl = byId('page-subtitle') || document.querySelector('.page-header p');
        if(titleEl) titleEl.textContent = String(rowDraft.work_name || '-');
        if(subEl) subEl.textContent = String(rowDraft.system_name || '-');
      }catch(_eH2){ }

      if(!currentAssetId){
        closeModalCompat(EDIT_MODAL_ID);
        return;
      }

      var saveBtn = byId(EDIT_SAVE_ID);
      try{ if(saveBtn){ saveBtn.disabled = true; saveBtn.setAttribute('aria-disabled','true'); } }catch(_e0){ }

      var payload = buildPayloadFromForm(form);

      // If FK selects haven't populated yet (dependent rack list etc), don't wipe existing values.
      (function preserveLocationCodesIfNotReady(){
        try{
          var placeEl = form.querySelector('[name="location_place"]');
          var posEl = form.querySelector('[name="location_pos"]');

          var placeNotReady = !!(placeEl && placeEl.tagName === 'SELECT' && (placeEl.disabled || placeEl.dataset.fkPopulated !== '1'));
          var posNotReady = !!(posEl && posEl.tagName === 'SELECT' && (posEl.disabled || posEl.dataset.fkPopulated !== '1'));

          if(placeNotReady && (payload.center_code == null || String(payload.center_code).trim() === '')){
            if(rowBefore.location_place_code){ payload.center_code = rowBefore.location_place_code; }
          }
          if(posNotReady && (payload.rack_code == null || String(payload.rack_code).trim() === '')){
            if(rowBefore.location_pos_code){ payload.rack_code = rowBefore.location_pos_code; }
          }
        }catch(_eP){ }
      })();
      apiJSON(API_ENDPOINT + '/' + encodeURIComponent(String(currentAssetId)), { method:'PUT', body: JSON.stringify(payload || {}) })
        .then(function(json){
          if(!json || json.success !== true){
            var msg = (json && json.message) ? json.message : '저장에 실패했습니다.';
            try{ alert(msg); }catch(_eA){ }
            return;
          }
          if(json.item){
            var row = normalizeFromApi(json.item);
            storeSelectedRow(row);
            applyRowToBasicInfo(row);
            try{
              var titleEl = byId('page-title') || document.querySelector('.page-header h1');
              var subEl = byId('page-subtitle') || document.querySelector('.page-header p');
              if(titleEl) titleEl.textContent = String(row.work_name || '-');
              if(subEl) subEl.textContent = String(row.system_name || '-');
            }catch(_e3){ }
          }
          closeModalCompat(EDIT_MODAL_ID);
          // Intentionally no success popup/toast.
        })
        .catch(function(err){
          notify(err && err.message ? err.message : '저장 실패', '저장 실패');
        })
        .finally(function(){
          try{ if(saveBtn){ saveBtn.disabled = false; saveBtn.setAttribute('aria-disabled','false'); } }catch(_e4){ }
        });
    }

    // Wire edit modal (L2-compatible)
    (function(){
      var openBtn = byId(EDIT_OPEN_ID);
      if(openBtn){
        openBtn.addEventListener('click', function(){
          buildEditFormFromRow(getSelectedRow());
          try{
            var modal = byId(EDIT_MODAL_ID);
            if(modal && window.BlossomFkSelect && typeof window.BlossomFkSelect.enhance === 'function'){
              window.BlossomFkSelect.enhance(modal, { forcePopulate: true });
            }
          }catch(_e){ }
          openModalCompat(EDIT_MODAL_ID);
        });
      }

      var closeBtn = byId(EDIT_CLOSE_ID);
      if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalCompat(EDIT_MODAL_ID); }); }

      var modalEl = byId(EDIT_MODAL_ID);
      if(modalEl){
        modalEl.addEventListener('click', function(e){ if(e && e.target === modalEl) closeModalCompat(EDIT_MODAL_ID); });
        document.addEventListener('keydown', function(e){ if(e && e.key === 'Escape' && modalEl.classList.contains('show')) closeModalCompat(EDIT_MODAL_ID); });
      }

      var saveBtn = byId(EDIT_SAVE_ID);
      if(saveBtn){ saveBtn.addEventListener('click', saveEdit); }
    })();

    initDetailTabScripts();
  }

  try{
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
  }catch(_e){ try{ init(); }catch(_e2){ } }
})();

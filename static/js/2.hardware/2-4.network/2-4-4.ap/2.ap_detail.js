// 2.ap_detail.js: AP detail controller (common header + basic-info only)
// Tab logic is handled by shared scripts in /static/js/_detail/tab*.js

(function(){
  'use strict';

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
    try { if(document.head){ document.head.appendChild(style); } } catch(_eHead){ }
  } catch(_eSidebar){ }

  var BHD = (typeof window !== 'undefined' && window.BlossomHardwareDetail) ? window.BlossomHardwareDetail : null;

  var STORAGE_PREFIX = 'ap';
  var HEADER_PREFIX = 'network_ap';
  var API_ENDPOINT = '/api/hardware/network/ap/assets';

  var EDIT_MODAL_ID = 'system-edit-modal';
  var EDIT_FORM_ID = 'system-edit-form';
  var EDIT_OPEN_ID = 'detail-edit-open';
  var EDIT_CLOSE_ID = 'system-edit-close';
  var EDIT_SAVE_ID = 'system-edit-save';

  var currentAssetId = '';

  function byId(id){ return document.getElementById(id); }

  function notify(message){
    try{
      if(typeof window.showToast === 'function'){
        window.showToast(String(message || ''), '');
        return;
      }
    }catch(_){ }
    try{ console.info('[ap-detail]', message); }catch(_2){ }
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

  function getSelectedRow(){
    try{
      if(BHD && typeof BHD.getSelectedRow === 'function') return BHD.getSelectedRow(STORAGE_PREFIX);
    }catch(_eB){ }
    try{
      var raw = sessionStorage.getItem(STORAGE_PREFIX + ':selected:row') || localStorage.getItem(STORAGE_PREFIX + ':selected:row');
      return raw ? JSON.parse(raw) : null;
    }catch(_e){
      return null;
    }
  }

  function storeSelectedRow(row){
    try{
      if(BHD && typeof BHD.storeSelectedRow === 'function'){
        BHD.storeSelectedRow(STORAGE_PREFIX, row);
        return;
      }
    }catch(_eB){ }
    try{
      var raw = JSON.stringify(row || {});
      sessionStorage.setItem(STORAGE_PREFIX + ':selected:row', raw);
      localStorage.setItem(STORAGE_PREFIX + ':selected:row', raw);
    }catch(_e){ }
    try{
      var id = row && (row.hardware_id != null ? row.hardware_id : (row.asset_id != null ? row.asset_id : row.id));
      if(id != null && String(id).trim() !== ''){
        sessionStorage.setItem(STORAGE_PREFIX + ':selected:asset_id', String(id));
        localStorage.setItem(STORAGE_PREFIX + ':selected:asset_id', String(id));
      }
    }catch(_e2){ }
  }

  function resolveAssetId(){
    try{
      if(BHD && typeof BHD.resolveAssetId === 'function') return BHD.resolveAssetId(STORAGE_PREFIX);
    }catch(_eB){ }
    try{
      var params = new URLSearchParams(window.location.search || '');
      var q = (params.get('hardware_id') || params.get('hardwareId') || params.get('asset_id') || params.get('assetId') || params.get('id') || '').trim();
      if(q) return q;
    }catch(_e0){ }
    try{
      return (sessionStorage.getItem(STORAGE_PREFIX + ':selected:asset_id') || localStorage.getItem(STORAGE_PREFIX + ':selected:asset_id') || '').trim();
    }catch(_e1){
      return '';
    }
  }

  function openModalCompat(id){
    var el = byId(id);
    if(!el) return;
    try{ document.body.classList.add('modal-open'); }catch(_){ }
    el.classList.add('show');
    el.setAttribute('aria-hidden','false');
  }

  function closeModalCompat(id){
    var el = byId(id);
    if(!el) return;
    el.classList.remove('show');
    el.setAttribute('aria-hidden','true');
    try{
      if(!document.querySelector('.modal-overlay-full.show')){
        document.body.classList.remove('modal-open');
      }
    }catch(_){ }
  }

  function _normText(s){ return String(s == null ? '' : s).replace(/\s+/g,' ').trim(); }
  function _findBasicInfoRowByLabel(labelText){
    try{
      var label = _normText(labelText);
      if(!label) return null;
      var rows = document.querySelectorAll('.basic-info-grid .basic-info-card .info-row');
      for(var i=0;i<rows.length;i+=1){
        var row = rows[i];
        var labEl = row.querySelector('label');
        if(!labEl) continue;
        if(_normText(labEl.textContent) === label) return row;
      }
    }catch(_e){ }
    return null;
  }

  function _toneForNumericBadge(label, n){
    if(label === '보안 점수'){
      if(n >= 8) return 'tone-3';
      if(n >= 6) return 'tone-2';
      return 'tone-1';
    }
    if(n >= 3) return 'tone-3';
    if(n === 2) return 'tone-2';
    return 'tone-1';
  }

  function _escapeHTML(s){
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/\'/g,'&#39;');
  }

  function _renderValueHtml(labelText, rawValue){
    var label = _normText(labelText);
    var v = String(rawValue == null ? '' : rawValue).trim();
    if(v === '') v = '-';

    if(label === '업무 상태'){
      if(v === '-') return _escapeHTML(v);
      var cls = (v === '가동') ? 'ws-run' : (v === '유휴' ? 'ws-idle' : 'ws-wait');
      return '<span class="status-pill">'
        + '<span class="status-dot ' + cls + '" aria-hidden="true"></span>'
        + '<span class="status-text">' + _escapeHTML(v) + '</span>'
        + '</span>';
    }

    if(label === 'DR 구축여부' || label === '서비스 이중화'){
      var ox = String(v).toUpperCase();
      if(ox !== 'O' && ox !== 'X') ox = '-';
      return '<span class="cell-ox with-badge"><span class="ox-badge ' + (ox === 'O' ? 'on' : (ox === 'X' ? 'off' : '')) + '">' + _escapeHTML(ox) + '</span></span>';
    }

    if(label === '기밀성' || label === '무결성' || label === '가용성' || label === '보안 점수'){
      if(v === '-'){
        return '<span class="cell-num"><span class="num-badge tone-1">-</span></span>';
      }
      var n = parseInt(v, 10);
      var tone = isNaN(n) ? 'tone-1' : _toneForNumericBadge(label, n);
      return '<span class="cell-num"><span class="num-badge ' + tone + '">' + _escapeHTML(v) + '</span></span>';
    }

    return _escapeHTML(v);
  }

  window.setBasicInfoValueByLabel = function(labelText, value){
    if(!document.querySelector('.basic-info-grid')) return;
    var row = _findBasicInfoRowByLabel(labelText);
    if(!row) return;

    var label = _normText(labelText);

    if(label === '기밀성' || label === '무결성' || label === '가용성' || label === '보안 점수'){
      var badge = row.querySelector('.num-badge');
      if(badge){
        var raw = String(value == null ? '' : value).trim();
        var show = raw === '' ? '-' : raw;
        badge.textContent = show;
        badge.classList.remove('tone-1','tone-2','tone-3');
        if(show === '-') badge.classList.add('tone-1');
        else {
          var n = parseInt(show, 10);
          if(!isNaN(n)) badge.classList.add(_toneForNumericBadge(label, n));
        }
        return;
      }
    }

    if(label === 'DR 구축여부' || label === '서비스 이중화'){
      var oxEl = row.querySelector('.ox-badge');
      var rawOx = String(value == null ? '' : value).trim().toUpperCase();
      var showOx = (rawOx === 'O' || rawOx === 'X') ? rawOx : '-';
      if(oxEl){
        oxEl.textContent = showOx;
        oxEl.classList.remove('on','off');
        if(showOx === 'O') oxEl.classList.add('on');
        if(showOx === 'X') oxEl.classList.add('off');
        return;
      }
    }

    var valueEl = row.querySelector('.info-value') || row.querySelector('span');
    if(!valueEl) return;

    if(label === '업무 상태'){
      valueEl.innerHTML = _renderValueHtml(label, value);
      return;
    }

    var v = String(value == null ? '' : value).trim();
    valueEl.textContent = (v === '' ? '-' : v);
  };

  function _pickFirst(obj, keys){
    if(!obj) return '';
    for(var i=0;i<keys.length;i+=1){
      var k = keys[i];
      if(!k) continue;
      if(Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null){
        var s = String(obj[k]).trim();
        if(s !== '' && s !== 'null' && s !== 'None') return s;
      }
    }
    return '';
  }

  function _oxFromFlag(flag){
    try{
      if(flag == null) return '';
      if(flag === true) return 'O';
      if(flag === false) return 'X';
      var n = parseInt(String(flag), 10);
      if(!isNaN(n)) return n ? 'O' : 'X';
      var s = String(flag).trim().toUpperCase();
      if(s === 'O' || s === 'X') return s;
      if(s === 'Y' || s === 'YES' || s === 'TRUE') return 'O';
      if(s === 'N' || s === 'NO' || s === 'FALSE') return 'X';
      return '';
    }catch(_e){
      return '';
    }
  }

  function _coreFromFlag(flag){
    try{
      if(flag == null) return '';
      if(flag === true) return '핵심';
      if(flag === false) return '일반';
      var n = parseInt(String(flag), 10);
      if(!isNaN(n)) return n ? '핵심' : '일반';
      var s = String(flag).trim();
      if(s === '핵심' || s === '일반') return s;
      return '';
    }catch(_e){
      return '';
    }
  }

  function normalizeFromApi(item){
    var it = item || {};
    return {
      id: _pickFirst(it, ['asset_id','id']),
      asset_id: _pickFirst(it, ['asset_id','id']),
      work_status: _pickFirst(it, ['work_status_code','work_status','work_status_name']),
      work_type: _pickFirst(it, ['work_type_code','work_type','work_type_name','work_category_code']),
      work_category: _pickFirst(it, ['work_category_code','work_category','work_category_name','work_division_code']),
      work_operation: _pickFirst(it, ['work_operation_code','work_operation','work_operation_name','operation_code']),
      work_group: _pickFirst(it, ['work_group_code','work_group','work_group_name','group_code']),
      work_name: _pickFirst(it, ['work_name']),
      system_name: _pickFirst(it, ['system_name']),
      system_ip: _pickFirst(it, ['system_ip']),
      manage_ip: _pickFirst(it, ['mgmt_ip','manage_ip']),
      vendor: _pickFirst(it, ['manufacturer_code','vendor','manufacturer_name']),
      model: _pickFirst(it, ['server_code','network_code','model','server_model_name']),
      serial: _pickFirst(it, ['serial_number','serial']),
      virtualization: _pickFirst(it, ['virtualization_type','virtualization']),
      location_place: _pickFirst(it, ['center_code','location_place','center_name']),
      location_pos: _pickFirst(it, ['rack_code','location_pos','rack_name']),
      slot: _pickFirst(it, ['slot','system_slot']),
      u_size: _pickFirst(it, ['u_size','system_size']),
      rack_face: _pickFirst(it, ['rack_face']),
      sys_dept: _pickFirst(it, ['system_dept_code','sys_dept_code','system_department','sys_dept','system_dept_name']),
      sys_owner: _pickFirst(it, ['system_owner_emp_no','sys_owner_emp_no','system_owner','sys_owner','system_owner_name']),
      svc_dept: _pickFirst(it, ['service_dept_code','svc_dept_code','service_department','svc_dept','service_dept_name']),
      svc_owner: _pickFirst(it, ['service_owner_emp_no','svc_owner_emp_no','service_owner','svc_owner','service_owner_name']),
      confidentiality: _pickFirst(it, ['cia_confidentiality','confidentiality']),
      integrity: _pickFirst(it, ['cia_integrity','integrity']),
      availability: _pickFirst(it, ['cia_availability','availability']),
      security_score: _pickFirst(it, ['security_score']),
      system_grade: _pickFirst(it, ['system_grade']),
      core_flag: _pickFirst(it, ['core_flag']) || _coreFromFlag(it.is_core_system),
      dr_built: _pickFirst(it, ['dr_built']) || _oxFromFlag(it.has_dr_site),
      svc_redundancy: _pickFirst(it, ['svc_redundancy']) || _oxFromFlag(it.has_service_ha)
    };
  }

  var COLUMN_META = {
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

  window.applyRowToBasicInfo = function(item){
    if(!document.querySelector('.basic-info-grid')) return;
    var row = normalizeFromApi(item || {});
    try{
      Object.keys(COLUMN_META).forEach(function(k){
        try{
          window.setBasicInfoValueByLabel(COLUMN_META[k].label, row[k]);
        }catch(_eEach){ }
      });
    }catch(_e){ }
  };

  function initHeader(){
    // Primary (new) shared helper keys: network_ap:selected:work / :system
    try{
      if(BHD && typeof BHD.initHeader === 'function'){
        BHD.initHeader({
          storagePrefix: STORAGE_PREFIX,
          headerKeyPrefix: HEADER_PREFIX,
          titleIds: ['page-title'],
          subtitleIds: ['page-subtitle'],
          stripQueryParams: false
        });
      }
    }catch(_eB){ }

    // Compatibility: legacy keys used on some pages
    try{
      function getCompat(kind){
        var keys = [
          HEADER_PREFIX + ':selected:' + kind,
          HEADER_PREFIX + ':selected:' + kind + '_name'
        ];
        for(var i=0;i<keys.length;i+=1){
          try{ var v = sessionStorage.getItem(keys[i]) || localStorage.getItem(keys[i]) || ''; if(String(v||'').trim()) return String(v).trim(); }catch(_){ }
        }
        return '';
      }
      var work = getCompat('work');
      var system = getCompat('system');
      var titleEl = byId('page-title') || document.querySelector('.page-header h1');
      var subEl = byId('page-subtitle') || document.querySelector('.page-header p');
      if(work && titleEl) titleEl.textContent = work;
      if(system && subEl) subEl.textContent = system;
      if(work){
        try{ sessionStorage.setItem(HEADER_PREFIX + ':selected:work', work); }catch(_){ }
        try{ localStorage.setItem(HEADER_PREFIX + ':selected:work', work); }catch(_2){ }
      }
      if(system){
        try{ sessionStorage.setItem(HEADER_PREFIX + ':selected:system', system); }catch(_3){ }
        try{ localStorage.setItem(HEADER_PREFIX + ':selected:system', system); }catch(_4){ }
      }
    }catch(_eCompat){ }
  }

  function buildEditFormFromRow(row){
    var form = byId(EDIT_FORM_ID);
    if(!form) return;
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
      // FK fields are initially inputs; BlossomFkSelect will convert+populate in modal
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
    return String(el.value || '');
  }

  function buildPayloadFromForm(form){
    function el(name){ return form.querySelector('[name="'+name+'"]'); }
    function vRaw(name){ return readValue(el(name)); }
    function setField(payload, key, raw){
      if(raw == null){ payload[key] = null; return; }
      var s = String(raw).trim();
      if(s === '' || s === '선택') payload[key] = null;
      else payload[key] = s;
    }

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

  function init(){
    initHeader();

    var selected = getSelectedRow();
    currentAssetId = resolveAssetId();
    try{ if(selected) window.applyRowToBasicInfo(selected); }catch(_){ }

    // Update header from selected row if present
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
          if(!json || json.success !== true || !json.item) return;
          var row = normalizeFromApi(json.item);
          storeSelectedRow(row);
          try{ window.applyRowToBasicInfo(row); }catch(_){ }
          try{
            var titleEl = byId('page-title') || document.querySelector('.page-header h1');
            var subEl = byId('page-subtitle') || document.querySelector('.page-header p');
            if(titleEl) titleEl.textContent = String(json.item.work_name || row.work_name || '-');
            if(subEl) subEl.textContent = String(json.item.system_name || row.system_name || '-');
          }catch(_e2){ }
        })
        .catch(function(_e){ });
    })();

    // Mark page-size selects as chosen after interaction, so CSS can style as white text
    (function(){
      function wireChosen(id){
        var sel = byId(id); if(!sel) return;
        function apply(){ if(sel.value){ sel.classList.add('is-chosen'); } }
        sel.addEventListener('change', apply);
        apply();
      }
      ['lg-page-size','hw-page-size','sw-page-size','bk-page-size','if-page-size','am-page-size','au-page-size','ac-page-size','fw-page-size','st-page-size','tk-page-size','vl-page-size','pk-page-size','mt-page-size','asg-page-size']
        .forEach(wireChosen);
    })();

    // Wire edit modal only on basic-info tab
    (function(){
      var openBtn = byId(EDIT_OPEN_ID);
      var closeBtn = byId(EDIT_CLOSE_ID);
      var saveBtn = byId(EDIT_SAVE_ID);
      var modalEl = byId(EDIT_MODAL_ID);

      if(openBtn){
        openBtn.addEventListener('click', function(){
          var id = resolveAssetId();
          if(id){
            apiJSON(API_ENDPOINT + '/' + encodeURIComponent(String(id)), { method:'GET' })
              .then(function(json){
                if(json && json.success === true && json.item){
                  var row = normalizeFromApi(json.item);
                  storeSelectedRow(row);
                  buildEditFormFromRow(row);
                } else {
                  buildEditFormFromRow(getSelectedRow());
                }
              })
              .catch(function(){ buildEditFormFromRow(getSelectedRow()); })
              .finally(function(){
                try{
                  if(modalEl && window.BlossomFkSelect && typeof window.BlossomFkSelect.enhance === 'function'){
                    window.BlossomFkSelect.enhance(modalEl, { forcePopulate: true });
                  }
                }catch(_eFk){ }
                openModalCompat(EDIT_MODAL_ID);
              });
            return;
          }
          buildEditFormFromRow(getSelectedRow());
          try{
            if(modalEl && window.BlossomFkSelect && typeof window.BlossomFkSelect.enhance === 'function'){
              window.BlossomFkSelect.enhance(modalEl, { forcePopulate: true });
            }
          }catch(_eFk2){ }
          openModalCompat(EDIT_MODAL_ID);
        });
      }

      if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalCompat(EDIT_MODAL_ID); }); }

      if(modalEl){
        modalEl.addEventListener('click', function(e){ if(e && e.target === modalEl) closeModalCompat(EDIT_MODAL_ID); });
        document.addEventListener('keydown', function(e){ if(e && e.key === 'Escape' && modalEl.classList.contains('show')) closeModalCompat(EDIT_MODAL_ID); });
      }

      if(saveBtn){
        saveBtn.addEventListener('click', function(){
          var form = byId(EDIT_FORM_ID); if(!form) return;
          var id = resolveAssetId();
          if(!id){ closeModalCompat(EDIT_MODAL_ID); return; }
          try{ saveBtn.disabled = true; saveBtn.setAttribute('aria-disabled','true'); }catch(_){ }
          var payload = buildPayloadFromForm(form);
          apiJSON(API_ENDPOINT + '/' + encodeURIComponent(String(id)), { method:'PUT', body: JSON.stringify(payload || {}) })
            .then(function(json){
              if(!json || json.success !== true){
                var msg = (json && json.message) ? json.message : '저장에 실패했습니다.';
                try{ alert(msg); }catch(_eA){ }
                return;
              }
              if(json.item){
                var row = normalizeFromApi(json.item);
                storeSelectedRow(row);
                try{ window.applyRowToBasicInfo(row); }catch(_eApply){ }
                try{
                  var titleEl = byId('page-title') || document.querySelector('.page-header h1');
                  var subEl = byId('page-subtitle') || document.querySelector('.page-header p');
                  if(titleEl) titleEl.textContent = String(json.item.work_name || row.work_name || '-');
                  if(subEl) subEl.textContent = String(json.item.system_name || row.system_name || '-');
                }catch(_eH2){ }
              }
              closeModalCompat(EDIT_MODAL_ID);
              notify('저장되었습니다.');
            })
            .catch(function(err){
              try{ alert(err && err.message ? err.message : '저장 실패'); }catch(_eA2){ }
            })
            .finally(function(){
              try{ saveBtn.disabled = false; saveBtn.setAttribute('aria-disabled','false'); }catch(_e3){ }
            });
        });
      }
    })();
  }

  try{
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
  }catch(_e){ try{ init(); }catch(_e2){ } }
})();

// Legacy AP detail implementation disabled (tabs moved to /static/js/_detail/tab*.js).
// Kept only to avoid risking accidental loss of historical code; it must not execute.
function __ap_legacy_disabled__(){
      var core = (it.is_core_system != null) ? !!it.is_core_system : null;
      var dr = null;
      if(it.has_dr_site != null){
        dr = !!it.has_dr_site;
      }else if(it.dr_built != null && String(it.dr_built).trim() !== ''){
        dr = (String(it.dr_built).trim().toUpperCase() === 'O');
      }
      var ha = null;
      if(it.has_service_ha != null){
        ha = !!it.has_service_ha;
      }else if(it.svc_redundancy != null && String(it.svc_redundancy).trim() !== ''){
        ha = (String(it.svc_redundancy).trim().toUpperCase() === 'O');
      }
      out.core_flag     = _pickFirst(it, ['core_flag']) || _displayFromBool(core, '핵심', '일반');
      out.dr_built      = _pickFirst(it, ['dr_built']) || _displayFromBool(dr, 'O', 'X');
      out.svc_redundancy= _pickFirst(it, ['svc_redundancy']) || _displayFromBool(ha, 'O', 'X');

      return out;
    }

    window.applyRowToBasicInfo = function(item){
      try{
        var d = _normalizeApItemForDisplay(item);
        var labels = {
          work_status:'업무 상태', work_type:'업무 분류', work_category:'업무 구분', work_operation:'업무 운영', work_group:'업무 그룹',
          work_name:'업무 이름', system_name:'시스템 이름', system_ip:'시스템 IP', manage_ip:'관리 IP',
          vendor:'시스템 제조사', model:'시스템 모델명', serial:'시스템 일련번호', virtualization:'시스템 가상화',
          location_place:'시스템 장소', location_pos:'시스템 위치', slot:'시스템 슬롯', u_size:'시스템 크기',
          sys_dept:'시스템 담당부서', sys_owner:'시스템 담당자', svc_dept:'서비스 담당부서', svc_owner:'서비스 담당자',
          confidentiality:'기밀성', integrity:'무결성', availability:'가용성', security_score:'보안 점수',
          system_grade:'시스템 등급', core_flag:'핵심/일반', dr_built:'DR 구축여부', svc_redundancy:'서비스 이중화'
        };
        Object.keys(labels).forEach(function(k){
          window.setBasicInfoValueByLabel(labels[k], d[k]);
        });
      }catch(_){ /* ignore */ }
    };

    // Initialize page header from list selection (query or storage) - match onpremise behavior
    (function initHeaderFromSelection(){
      try{
        var params = new URLSearchParams(window.location.search || '');
        // Prefer storage (same-tab navigation) over querystring.
        var work = null;
        var system = null;
        try{
          work = sessionStorage.getItem('network_ap:selected:work_name');
          system = sessionStorage.getItem('network_ap:selected:system_name');
        }catch(_eGet){ work = null; system = null; }
        work = work || params.get('work') || (function(){ try{ return localStorage.getItem('network_ap:selected:work_name'); }catch(_){ return null; } })();
        system = system || params.get('system') || (function(){ try{ return localStorage.getItem('network_ap:selected:system_name'); }catch(_){ return null; } })();
        var assetId = params.get('asset_id') || params.get('assetId') || params.get('id');

        function setText(sel, val){ var el=document.querySelector(sel); if(el){ el.textContent = String(val == null || String(val).trim()==='' ? '-' : val); } }
        // Page header (업무 이름, 시스템 이름)
        setText('#page-title, .page-header h1', work || '-');
        setText('#page-subtitle, .page-header p', system || '-');

        // Basic info grid (keep view consistent with header)
        try{
          if(typeof window.setBasicInfoValueByLabel === 'function'){
            window.setBasicInfoValueByLabel('업무 이름', work);
            window.setBasicInfoValueByLabel('시스템 이름', system);
          }
        }catch(_eGrid){ }

        // If the list stored a full row, populate everything.
        var rawRow = null;
        try{ rawRow = sessionStorage.getItem('ap:selected:row') || localStorage.getItem('ap:selected:row'); }catch(_eRow0){ rawRow = null; }
        if(rawRow){
          try{
            var row = JSON.parse(rawRow);
            if(row && (row.work_name || row.system_name)){
              setText('#page-title, .page-header h1', row.work_name || work || '-');
              setText('#page-subtitle, .page-header p', row.system_name || system || '-');
            }
            try{ if(typeof window.applyRowToBasicInfo === 'function') window.applyRowToBasicInfo(row); }catch(_eApply){ }
          }catch(_eParse){ }
        }

        // Persist selection.
        try{
          if(work && work !== '-') sessionStorage.setItem('network_ap:selected:work_name', String(work));
          if(system && system !== '-') sessionStorage.setItem('network_ap:selected:system_name', String(system));
          if(assetId){
            sessionStorage.setItem('ap:selected:asset_id', String(assetId));
            try{ localStorage.setItem('ap:selected:asset_id', String(assetId)); }catch(_e1){}
          }
        }catch(_eStore0){}
        try{
          if(params && (params.has('work') || params.has('system') || params.has('asset_id') || params.has('assetId') || params.has('id'))){
            ['work','system','asset_id','assetId','id'].forEach(function(k){ try{ params.delete(k); }catch(_){ } });
            var qs = params.toString();
            history.replaceState({}, '', location.pathname + (qs ? ('?' + qs) : '') + location.hash);
          }
        }catch(_stripErr){ /* no-op */ }

        // If storage row is empty (direct entry/refresh), recover by asset id and fetch details.
        try{
          if(!rawRow){
            var cand = null;
            try{ cand = sessionStorage.getItem('ap:selected:asset_id') || localStorage.getItem('ap:selected:asset_id') || localStorage.getItem('ap:last_selected_asset_id'); }catch(_e2){ cand = null; }
            var idNum = null;
            if(assetId){ idNum = parseInt(String(assetId), 10); }
            if((!idNum || !isFinite(idNum) || idNum <= 0) && cand){ idNum = parseInt(String(cand), 10); }
            if(idNum && isFinite(idNum) && idNum > 0){
              fetch('/api/hardware/network/ap/assets/' + idNum, { method:'GET', headers:{'Accept':'application/json'} })
                .then(function(r){
                  return r.json().catch(function(){ return null; }).then(function(j){ return { ok:r.ok, json:j }; });
                })
                .then(function(res){
                  if(!res || !res.ok || !res.json || !res.json.success || !res.json.item) return;
                  var item = res.json.item;
                  // Update header
                  setText('#page-title, .page-header h1', (item.work_name || work || '-'));
                  setText('#page-subtitle, .page-header p', (item.system_name || system || '-'));
                  // Cache as selected row for other tabs
                  try{ sessionStorage.setItem('ap:selected:row', JSON.stringify(item)); }catch(_eS){ }
                  try{ localStorage.setItem('ap:selected:row', JSON.stringify(item)); }catch(_eL){ }
                  try{ sessionStorage.setItem('ap:selected:asset_id', String(idNum)); }catch(_eS2){ }
                  try{ localStorage.setItem('ap:selected:asset_id', String(idNum)); }catch(_eL2){ }
                  try{ localStorage.setItem('ap:last_selected_asset_id', String(idNum)); }catch(_eL3){ }
                  try{
                    if(item.work_name) sessionStorage.setItem('network_ap:selected:work_name', String(item.work_name));
                    if(item.system_name) sessionStorage.setItem('network_ap:selected:system_name', String(item.system_name));
                  }catch(_eS3){ }
                  try{ if(typeof window.applyRowToBasicInfo === 'function') window.applyRowToBasicInfo(item); }catch(_eApply2){ }
                })
                .catch(function(_eFetch){ /* ignore */ });
            }
          }
        }catch(_eRecover){ }
      }catch(_err){ /* no-op */ }
    })();

    // Mark page-size selects as chosen after interaction, so CSS can style as white text
    (function(){
      function wireChosen(id){
        var sel = document.getElementById(id); if(!sel) return;
        function apply(){ if(sel.value){ sel.classList.add('is-chosen'); } }
        sel.addEventListener('change', apply);
        // If value came from localStorage, reflect on load
        apply();
      }
      ['lg-page-size','hw-page-size','sw-page-size','bk-page-size','if-page-size','am-page-size','au-page-size','ac-page-size','fw-page-size','st-page-size','tk-page-size','vl-page-size','pk-page-size','mt-page-size','asg-page-size']
        .forEach(wireChosen);
    })();
    // IDs and labels for the edit modal
    var EDIT_MODAL_ID = 'system-edit-modal';
    var EDIT_FORM_ID = 'system-edit-form';
    var EDIT_OPEN_ID = 'detail-edit-open';
    var EDIT_CLOSE_ID = 'system-edit-close';
    var EDIT_SAVE_ID = 'system-edit-save';

    // Required fields for AP basic info (UI + API guard)
    var REQUIRED_BASIC_FIELDS = { work_status: true, work_name: true, system_name: true };

    // Searchable FK selects to use inside the basic-info edit modal
    var SERVER_MODEL_FORM_FACTOR_FILTER = '무선장비';
    var BASICINFO_FK_FIELD = {
      work_type: 'WORK_CATEGORY',
      work_category: 'WORK_DIVISION',
      work_status: 'WORK_STATUS',
      work_operation: 'WORK_OPERATION',
      work_group: 'WORK_GROUP',
      vendor: 'VENDOR',
      model: 'SERVER_MODEL',
      location_place: 'ORG_CENTER',
      location_pos: 'ORG_RACK',
      sys_dept: 'ORG_DEPT',
      sys_owner: 'USER_PROFILE',
      svc_dept: 'ORG_DEPT',
      svc_owner: 'USER_PROFILE'
    };
    var FK_SOURCE_CONFIG = {
      WORK_CATEGORY: { endpoint: '/api/work-categories', valueKey: 'category_code', labelKey: 'wc_name' },
      WORK_DIVISION: { endpoint: '/api/work-divisions', valueKey: 'division_code', labelKey: 'wc_name' },
      WORK_STATUS: { endpoint: '/api/work-statuses', valueKey: 'status_code', labelKey: 'wc_name' },
      WORK_OPERATION: { endpoint: '/api/work-operations', valueKey: 'operation_code', labelKey: 'wc_name' },
      WORK_GROUP: { endpoint: '/api/work-groups', valueKey: 'group_code', labelKey: 'group_name' },
      VENDOR: { endpoint: '/api/vendor-manufacturers', valueKey: 'manufacturer_code', labelKey: 'manufacturer_name' },
      SERVER_MODEL: { endpoint: '/api/hw-network-types', valueKey: 'network_code', labelKey: 'model_name' },
      ORG_CENTER: { endpoint: '/api/org-centers', valueKey: 'center_code', labelKey: 'center_name' },
      ORG_RACK: { endpoint: '/api/org-racks', valueKey: 'rack_code', labelKey: 'rack_name' },
      ORG_DEPT: { endpoint: '/api/org-departments', valueKey: 'dept_code', labelKey: 'dept_name' },
      USER_PROFILE: { endpoint: '/api/user-profiles', valueKey: 'emp_no', labelKey: 'name' }
    };
    var _fkCache = {};
    var _userProfileByDeptCache = {};
    function _escapeAttr(val){
      return String(val == null ? '' : val)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }
    function _escapeHTML(val){
      return String(val == null ? '' : val)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function _setSelectPlaceholderDisabled(selectEl, text){
      if(!selectEl) return;
      var label = String(text || '먼저 선택').trim();
      var currentLabel = String(selectEl.getAttribute('data-current-label') || '').trim();
      var currentValue = String(selectEl.value || '').trim();
      var html = '<option value="">' + _escapeHTML(label) + '</option>';
      if(currentValue || currentLabel){
        var v = currentValue || currentLabel;
        var l = currentLabel || currentValue;
        html += '<option value="' + _escapeAttr(v) + '" selected>' + _escapeHTML(l || v) + '</option>';
      }
      selectEl.innerHTML = html;
      try{ selectEl.disabled = true; }catch(_){ }
      try{ selectEl.classList.add('fk-disabled'); }catch(_){ }
      try{
        if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function'){
          window.BlossomSearchableSelect.enhance(selectEl.closest('.modal-overlay-full') || selectEl.parentNode || document);
        }
      }catch(_){ }
    }
    function _isBlank(v){
      if(v == null) return true;
      var s = String(v).trim();
      return s === '' || s === '-';
    }

    function _isUnchosenLabelText(v){
      var s = String(v == null ? '' : v).trim();
      if(!s) return true;
      // Common placeholders shown in dependent selects
      return s === '-' || s === '선택' || s === '부서를 먼저 선택' || s === '센터를 먼저 선택' || s === '제조사를 먼저 선택';
    }
    function _fetchJson(url, options){
      var opts = options || {};
      opts.headers = Object.assign({ 'Accept':'application/json' }, opts.headers || {});
      return fetch(url, opts).then(function(r){
        return r.json().catch(function(){ return null; }).then(function(j){
          if(!r.ok){
            var msg = (j && j.message) ? j.message : ('HTTP ' + r.status);
            var err = new Error(msg);
            err.status = r.status;
            err.response = j;
            throw err;
          }
          return j;
        });
      });
    }
    function _fetchFkItems(cfg){
      if(!cfg || !cfg.endpoint) return Promise.resolve([]);
      if(_fkCache[cfg.endpoint]) return _fkCache[cfg.endpoint];
      _fkCache[cfg.endpoint] = _fetchJson(cfg.endpoint, { method:'GET' })
        .then(function(j){
          var items = (j && Array.isArray(j.items)) ? j.items : (Array.isArray(j) ? j : []);
          return items;
        })
        .catch(function(){ return []; });
      return _fkCache[cfg.endpoint];
    }

    function _fetchUserProfilesByDepartment(deptName, deptCode){
      var code = String(deptCode || '').trim();
      var name = String(deptName || '').trim();
      var cacheKey = code || name;
      if(!cacheKey) return Promise.resolve([]);
      if(_userProfileByDeptCache[cacheKey]) return _userProfileByDeptCache[cacheKey];
      var qs = ['limit=500'];
      if(name) qs.push('department=' + encodeURIComponent(name));
      if(code) qs.push('dept_code=' + encodeURIComponent(code));
      var url = FK_SOURCE_CONFIG.USER_PROFILE.endpoint + '?' + qs.join('&');
      _userProfileByDeptCache[cacheKey] = _fetchJson(url, { method:'GET' })
        .then(function(j){
          return (j && Array.isArray(j.items)) ? j.items : (Array.isArray(j) ? j : []);
        })
        .catch(function(){
          try{ delete _userProfileByDeptCache[cacheKey]; }catch(_){ }
          return [];
        });
      return _userProfileByDeptCache[cacheKey];
    }

    function _buildOwnerOptions(selectEl, records, context){
      if(!selectEl) return;
      var currentValue = String((context && context.currentValue) || '').trim();
      var currentLabel = String((context && context.currentLabel) || '').trim();
      var placeholder = String((context && context.placeholder) || selectEl.getAttribute('data-placeholder') || '선택').trim();
      var hasRecords = Array.isArray(records) && records.length > 0;

      var stateLabel = hasRecords ? placeholder : '해당 부서 인원이 없습니다';
      var html = '<option value="">' + _escapeHTML(stateLabel) + '</option>';

      var options = [];
      (records || []).forEach(function(it){
        try{
          var emp = String((it && it.emp_no) || '').trim();
          if(!emp) return;
          var nm = String((it && it.name) || emp).trim();
          options.push({ value: emp, label: nm });
        }catch(_){ }
      });
      options.sort(function(a,b){
        return (a.label || '').localeCompare((b.label || ''), 'ko', { sensitivity:'base' }) || (a.value||'').localeCompare((b.value||''));
      });

      // Select match by value (emp_no) first, then by label (name).
      var selectedValue = '';
      if(currentValue){
        selectedValue = options.some(function(o){ return o.value === currentValue; }) ? currentValue : '';
      }
      if(!selectedValue && currentLabel){
        var found = options.find(function(o){ return String(o.label||'').trim() === currentLabel; });
        if(found) selectedValue = found.value;
      }

      var seen = {};
      options.forEach(function(o){
        if(seen[o.value]) return;
        seen[o.value] = true;
        var sel = (selectedValue && o.value === selectedValue) ? ' selected' : '';
        html += '<option value="' + _escapeAttr(o.value) + '"' + sel + '>' + _escapeHTML(o.label || o.value) + '</option>';
      });

      // If we still have a legacy value/label not in list, keep it visible.
      if(!selectedValue && (currentValue || currentLabel)){
        var fallbackValue = currentValue || currentLabel;
        var fallbackLabel = currentLabel || currentValue;
        if(fallbackValue){
          html += '<option value="' + _escapeAttr(fallbackValue) + '" selected>' + _escapeHTML(fallbackLabel || fallbackValue) + '</option>';
        }
      }

      selectEl.innerHTML = html;
      try{ selectEl.value = selectedValue || ''; }catch(_){ }
      try{ selectEl.disabled = false; }catch(_){ }
      try{ selectEl.classList.remove('fk-disabled'); }catch(_){ }
      try{
        if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function'){
          window.BlossomSearchableSelect.enhance(selectEl.closest('.modal-overlay-full') || selectEl.parentNode || document);
        }
      }catch(_){ }
    }

    function _setOwnerPlaceholderDisabled(selectEl, text){
      if(!selectEl) return;
      var label = String(text || '부서를 먼저 선택').trim();
      var currentLabel = String(selectEl.getAttribute('data-current-label') || '').trim();
      var currentValue = String(selectEl.value || '').trim();
      var html = '<option value="">' + _escapeHTML(label) + '</option>';
      if(currentValue || currentLabel){
        var v = currentValue || currentLabel;
        var l = currentLabel || currentValue;
        html += '<option value="' + _escapeAttr(v) + '" selected>' + _escapeHTML(l || v) + '</option>';
      }
      selectEl.innerHTML = html;
      try{ selectEl.disabled = true; }catch(_){ }
      try{ selectEl.classList.add('fk-disabled'); }catch(_){ }
      try{
        if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function'){
          window.BlossomSearchableSelect.enhance(selectEl.closest('.modal-overlay-full') || selectEl.parentNode || document);
        }
      }catch(_){ }
    }

    function _refreshOwnerSelectForDept(form, ownerSelect, deptSelect, opts){
      if(!form || !ownerSelect || !deptSelect) return Promise.resolve();
      var deptCode = String(deptSelect.value || '').trim();
      var deptName = '';
      try{ deptName = String((deptSelect.selectedOptions && deptSelect.selectedOptions[0] && deptSelect.selectedOptions[0].textContent) || '').trim(); }catch(_){ deptName = ''; }

      // If the select is still showing a placeholder like "선택", treat it as unselected.
      if(_isUnchosenLabelText(deptName)) deptName = '';

      var keepValue = !!(opts && opts.keepValue);
      if(_isBlank(deptCode) && _isBlank(deptName)){
        // Dept cleared -> owner must be cleared too (cascade delete behavior).
        // Clear both value and any label cache so payload builder can send NULL when needed.
        try{ ownerSelect.value = ''; }catch(_){ }
        try{ ownerSelect.setAttribute('data-current-label', ''); }catch(_){ }
        _setOwnerPlaceholderDisabled(ownerSelect, '부서를 먼저 선택');
        return Promise.resolve();
      }

      var currentValue = keepValue ? String(ownerSelect.value || '').trim() : '';
      var currentLabel = keepValue ? String(ownerSelect.getAttribute('data-current-label') || '').trim() : '';
      if(!keepValue){
        try{ ownerSelect.value = ''; }catch(_){ }
        try{ ownerSelect.setAttribute('data-current-label', ''); }catch(_){ }
      }

      return _fetchUserProfilesByDepartment(deptName, deptCode).then(function(records){
        _buildOwnerOptions(ownerSelect, records, {
          currentValue: currentValue,
          currentLabel: currentLabel,
          placeholder: ownerSelect.getAttribute('data-placeholder') || '선택'
        });
      });
    }

    function wireDeptOwnerFilter(form){
      if(!form) return;
      var sysDept = form.querySelector('[name="sys_dept"]');
      var sysOwner = form.querySelector('[name="sys_owner"]');
      var svcDept = form.querySelector('[name="svc_dept"]');
      var svcOwner = form.querySelector('[name="svc_owner"]');

      function bindPair(deptSel, ownerSel){
        if(!deptSel || !ownerSel) return;
        if(deptSel.dataset && deptSel.dataset.deptOwnerFilterBound === '1'){
          // Ensure options match current dept when modal is reopened.
          try{ _refreshOwnerSelectForDept(form, ownerSel, deptSel, { keepValue: true }); }catch(_){ }
          return;
        }
        deptSel.addEventListener('change', function(){
          try{ _refreshOwnerSelectForDept(form, ownerSel, deptSel, { keepValue: false }); }catch(_){ }
        });
        try{ deptSel.dataset.deptOwnerFilterBound = '1'; }catch(_){ }
        try{ _refreshOwnerSelectForDept(form, ownerSel, deptSel, { keepValue: true }); }catch(_){ }
      }

      bindPair(sysDept, sysOwner);
      bindPair(svcDept, svcOwner);
    }
    function _filterWirelessModels(items){
      var needle = String(SERVER_MODEL_FORM_FACTOR_FILTER || '').trim();
      if(!needle) return items || [];
      return (items || []).filter(function(it){
        try{
          var cand = [
            it.form_factor, it.formFactor,
            it.device_type, it.deviceType,
            it.network_type, it.networkType,
            it.category, it.category_name,
            it.network_type_name, it.networkTypeName,
            it.model_category, it.modelCategory
          ].map(function(x){ return String(x || '').trim(); }).filter(Boolean);
          if(cand.some(function(x){ return x === needle; })) return true;
          // fallback: if any field contains the label (loose)
          var blob = JSON.stringify(it || {});
          return blob.indexOf(needle) > -1;
        }catch(_e){ return false; }
      });
    }

    function _extractManufacturerCodeFromModelRecord(item){
      try{
        return String((item && (item.manufacturer_code || item.manufacturerCode || item.vendor || item.manufacturer)) || '').trim();
      }catch(_){ return ''; }
    }

    function _buildWirelessVendorOptions(selectEl, modelItems, vendorItems){
      if(!selectEl) return;
      var currentRaw = String(selectEl.value || '').trim();
      var currentLabel = String(selectEl.getAttribute('data-current-label') || '').trim();
      var placeholder = selectEl.getAttribute('data-placeholder') || '선택';

      var wirelessModels = _filterWirelessModels(modelItems || []);
      var codeSet = {};
      wirelessModels.forEach(function(it){
        var code = _extractManufacturerCodeFromModelRecord(it);
        if(code) codeSet[code] = true;
      });
      var codes = Object.keys(codeSet);

      // Enrich labels by manufacturer_code -> manufacturer_name
      var nameByCode = {};
      (vendorItems || []).forEach(function(v){
        try{
          var c = String((v && (v.manufacturer_code || v.manufacturerCode || v.vendor_code || v.code)) || '').trim();
          var n = String((v && (v.manufacturer_name || v.manufacturerName || v.vendor || v.name)) || '').trim();
          if(c && n && !nameByCode[c]) nameByCode[c] = n;
        }catch(_){ }
      });

      codes.sort(function(a,b){
        var la = (nameByCode[a] || a);
        var lb = (nameByCode[b] || b);
        return la.localeCompare(lb, 'ko', { sensitivity:'base' }) || a.localeCompare(b);
      });

      // Determine selected value by matching current value or label.
      var selectedValue = '';
      if(currentRaw && codeSet[currentRaw]) selectedValue = currentRaw;
      if(!selectedValue && currentLabel){
        // Match label -> code
        var found = codes.find(function(code){ return String(nameByCode[code] || code).trim() === currentLabel; });
        if(found) selectedValue = found;
      }

      var html = '<option value="">' + _escapeHTML(placeholder) + '</option>';
      codes.forEach(function(code){
        var label = nameByCode[code] || code;
        var sel = (selectedValue && code === selectedValue) ? ' selected' : '';
        html += '<option value="' + _escapeAttr(code) + '"' + sel + '>' + _escapeHTML(label) + '</option>';
      });

      // Keep legacy/manual current selection visible if it doesn't belong to wireless vendor set.
      if(!selectedValue && (currentRaw || currentLabel)){
        var v = currentRaw || currentLabel;
        var l = currentLabel || currentRaw;
        html += '<option value="' + _escapeAttr(v) + '" selected>' + _escapeHTML(l || v) + '</option>';
      }

      selectEl.innerHTML = html;
      try{ selectEl.value = selectedValue || ''; }catch(_){ }
      try{ if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function'){ window.BlossomSearchableSelect.enhance(selectEl.closest('.modal-overlay-full') || selectEl.parentNode || document); } }catch(_){ }
    }
    function _populateFkSelect(select, cfg, items){
      if(!select || !cfg) return;
      var valueKey = cfg.valueKey;
      var labelKey = cfg.labelKey;
      var currentRaw = String(select.value || '').trim();
      var currentLabel = String(select.getAttribute('data-current-label') || '').trim();
      var placeholder = select.getAttribute('data-placeholder') || '선택';

      var list = items || [];
      if(cfg === FK_SOURCE_CONFIG.SERVER_MODEL){
        list = _filterWirelessModels(list);
      }
      // For user profiles, don't populate with the full global list here.
      // Owner selects are handled by wireDeptOwnerFilter/_refreshOwnerSelectForDept.
      if(cfg === FK_SOURCE_CONFIG.USER_PROFILE && (select.name === 'sys_owner' || select.name === 'svc_owner')){
        _setOwnerPlaceholderDisabled(select, '부서를 먼저 선택');
        return;
      }

      var mapped = list.map(function(it){
        var v = String((it && it[valueKey]) != null ? it[valueKey] : '').trim();
        var l = String((it && it[labelKey]) != null ? it[labelKey] : v).trim();
        return { value:v, label:l };
      }).filter(function(o){ return o.value !== '' || o.label !== ''; });

      function findMatch(){
        var raw = currentRaw;
        var lab = currentLabel || currentRaw;
        if(!raw && !lab) return null;
        var rawL = String(raw||'').toLowerCase();
        var labL = String(lab||'').toLowerCase();
        return mapped.find(function(o){
          return (raw && o.value === raw) || (lab && o.label === lab) || (rawL && o.value.toLowerCase() === rawL) || (labL && o.label.toLowerCase() === labL);
        }) || null;
      }

      var match = findMatch();

      // Rebuild options (keep an empty option for clear/search UX)
      select.innerHTML = '';
      var opt0 = document.createElement('option');
      opt0.value = '';
      opt0.textContent = placeholder;
      select.appendChild(opt0);

      // If the current value is not in FK items (legacy/manual), keep it as a visible option.
      if(!match && !_isBlank(currentLabel) && _isBlank(currentRaw)){
        var legacy = document.createElement('option');
        legacy.value = currentLabel;
        legacy.textContent = currentLabel;
        legacy.selected = true;
        select.appendChild(legacy);
      }
      if(!match && !_isBlank(currentRaw)){
        var legacy2 = document.createElement('option');
        legacy2.value = currentRaw;
        legacy2.textContent = currentLabel || currentRaw;
        legacy2.selected = true;
        select.appendChild(legacy2);
      }

      mapped.forEach(function(o){
        var opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.label || o.value;
        if(match && match.value === o.value){ opt.selected = true; }
        select.appendChild(opt);
      });

      try{
        if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function'){
          window.BlossomSearchableSelect.enhance(select.closest('.modal-overlay-full') || select.parentNode || document);
        }
      }catch(_){ }
    }
    function hydrateBasicInfoFkSelects(form){
      if(!form) return;
      var selects = form.querySelectorAll('select[data-fk]');
      if(!selects || !selects.length) return;
      var promises = [];
      selects.forEach(function(sel){
        var key = sel.getAttribute('data-fk');
        var cfg = FK_SOURCE_CONFIG[key];
        if(!cfg) return;

        // Vendor list on AP page should be wireless-only (derived from SERVER_MODEL records).
        if(key === 'VENDOR' && (sel.name === 'vendor' || sel.getAttribute('name') === 'vendor')){
          var pVendor = Promise.all([
            _fetchFkItems(FK_SOURCE_CONFIG.SERVER_MODEL),
            _fetchFkItems(FK_SOURCE_CONFIG.VENDOR)
          ]).then(function(res){
            var models = res && res[0] ? res[0] : [];
            var vendors = res && res[1] ? res[1] : [];
            _buildWirelessVendorOptions(sel, models, vendors);
          }).catch(function(){
            // Fallback to raw vendor list if anything goes wrong.
            return _fetchFkItems(cfg).then(function(items){ _populateFkSelect(sel, cfg, items); });
          });
          promises.push(pVendor);
          return;
        }

        // Owner selects: fetch profiles filtered by selected department.
        if(key === 'USER_PROFILE' && (sel.name === 'sys_owner' || sel.name === 'svc_owner')){
          var deptName = (sel.name === 'sys_owner') ? 'sys_dept' : 'svc_dept';
          var deptSel = form.querySelector('[name="' + deptName + '"]');
          var pOwner = Promise.resolve().then(function(){
            return _refreshOwnerSelectForDept(form, sel, deptSel, { keepValue: true });
          });
          promises.push(pOwner);
          return;
        }
        var p = _fetchFkItems(cfg).then(function(items){
          // Filter rack options by currently selected center.
          if(key === 'ORG_RACK' && (sel.name === 'location_pos' || sel.getAttribute('name') === 'location_pos')){
            try{
              var parent = form.querySelector('[name="location_place"]');
              var centerCode = parent ? String(parent.value || '').trim() : '';
              var filtered = _filterRackItemsForCenter(items, centerCode);
              _populateFkSelect(sel, cfg, filtered);
              return;
            }catch(_e){ /* fall through to default */ }
          }
          _populateFkSelect(sel, cfg, items);

          // After center hydrates (label->code selection), refresh rack options once.
          if(key === 'ORG_CENTER' && (sel.name === 'location_place' || sel.getAttribute('name') === 'location_place')){
            try{
              var child = form.querySelector('[name="location_pos"]');
              if(child){ _refreshRackOptionsForCenter(form, sel, child, { keepValue: true }); }
            }catch(_){ }
          }

          // After departments hydrate (label->code selection), refresh owner options once.
          if(key === 'ORG_DEPT' && (sel.name === 'sys_dept' || sel.name === 'svc_dept')){
            try{
              var owner = form.querySelector('[name="' + (sel.name === 'sys_dept' ? 'sys_owner' : 'svc_owner') + '"]');
              if(owner){ _refreshOwnerSelectForDept(form, owner, sel, { keepValue: true }); }
            }catch(_){ }
          }
        });
        promises.push(p);
      });
      var all = Promise.all(promises).catch(function(){ return []; });
      try{ form.__fkHydratedPromise = all; }catch(_){ }
      return all;
    }

    function _extractCenterCodeFromRackRecord(item){
      try{
        return String((item && (item.center_code || item.centerCode || item.center)) || '').trim();
      }catch(_){ return ''; }
    }
    function _filterRackItemsForCenter(items, centerCode){
      var c = String(centerCode || '').trim();
      if(!c) return [];
      return (items || []).filter(function(it){
        var cc = _extractCenterCodeFromRackRecord(it);
        return cc && cc === c;
      });
    }

    function wireLocationRackFilter(form){
      if(!form) return;
      var parent = form.querySelector('[name="location_place"]');
      var child = form.querySelector('[name="location_pos"]');
      if(!parent || !child) return;
      if(parent.dataset && parent.dataset.locationRackFilterBound === '1'){
        // Always do a refresh in case the modal was re-opened.
        try{ _refreshRackOptionsForCenter(form, parent, child, { keepValue: true }); }catch(_){ }
        return;
      }
      try{ if(child.dataset && child.dataset.placeholderOriginal == null){ child.dataset.placeholderOriginal = child.getAttribute('data-placeholder') || '랙 선택'; } }catch(_){ }
      parent.addEventListener('change', function(){
        try{ _refreshRackOptionsForCenter(form, parent, child, { keepValue: false }); }catch(_){ }
      });
      try{ parent.dataset.locationRackFilterBound = '1'; }catch(_){ }
      try{ _refreshRackOptionsForCenter(form, parent, child, { keepValue: true }); }catch(_){ }
    }
    function _refreshRackOptionsForCenter(form, parentSelect, childSelect, options){
      var centerCode = parentSelect ? String(parentSelect.value || '').trim() : '';
      var keepValue = !!(options && options.keepValue);

      // When no center is selected, show an instructive placeholder.
      if(!_isBlank(centerCode)){
        try{
          var orig = (childSelect.dataset && childSelect.dataset.placeholderOriginal) ? childSelect.dataset.placeholderOriginal : (childSelect.getAttribute('data-placeholder') || '랙 선택');
          childSelect.setAttribute('data-placeholder', orig);
        }catch(_){ }
      }else{
        try{ childSelect.setAttribute('data-placeholder', '센터를 먼저 선택'); }catch(_){ }
      }

      // Preserve existing selection only if it still matches the selected center.
      var currentValue = keepValue ? String(childSelect.value || '').trim() : '';
      var currentLabel = String(childSelect.getAttribute('data-current-label') || '').trim();

      return Promise.resolve(_fetchFkItems(FK_SOURCE_CONFIG.ORG_RACK)).then(function(items){
        var filtered = _filterRackItemsForCenter(items, centerCode);
        if(centerCode && currentValue){
          var ok = (filtered || []).some(function(it){
            try{
              var v = String((it && it[FK_SOURCE_CONFIG.ORG_RACK.valueKey]) != null ? it[FK_SOURCE_CONFIG.ORG_RACK.valueKey] : '').trim();
              return v && v === currentValue;
            }catch(_){ return false; }
          });
          if(!ok){
            currentValue = '';
            try{ childSelect.value = ''; }catch(_){ }
            try{ childSelect.setAttribute('data-current-label', ''); }catch(_){ }
            currentLabel = '';
          }
        }

        if(!keepValue){
          try{ childSelect.setAttribute('data-current-label', ''); }catch(_){ }
          currentLabel = '';
        }

        // Temporarily restore current value/label so _populateFkSelect can keep it if needed.
        try{ childSelect.value = currentValue || ''; }catch(_){ }
        try{ childSelect.setAttribute('data-current-label', currentLabel || ''); }catch(_){ }

        _populateFkSelect(childSelect, FK_SOURCE_CONFIG.ORG_RACK, filtered);
        // Disabled state is still controlled by wireCascadeClearDisable, but keep it consistent.
        try{ childSelect.disabled = _isBlank(centerCode); }catch(_){ }
      });
    }
    function wireCascadeClearDisable(form){
      if(!form) return;
      function byName(n){ return form.querySelector('[name="'+n+'"]'); }
      function setDisabled(el, on){
        if(!el) return;
        el.disabled = !!on;
        try{ el.setAttribute('aria-disabled', on?'true':'false'); }catch(_){ }
        try{ el.classList.toggle('fk-disabled', !!on); }catch(_){ }
      }
      function clear(el){
        if(!el) return;
        try{ el.value=''; }catch(_){ }
        try{ el.setAttribute('data-current-label', ''); }catch(_){ }
        try{ el.dispatchEvent(new Event('change', { bubbles:true })); }catch(_){ }
      }
      function syncPair(parentName, childName){
        var parent = byName(parentName);
        var child = byName(childName);
        if(!parent || !child) return;

        // Remember original placeholder so we can restore it when enabled.
        try{
          if(child.dataset && child.dataset.placeholderOriginal == null){
            child.dataset.placeholderOriginal = child.getAttribute('data-placeholder') || '선택';
          }
        }catch(_){ }

        function apply(){
          var empty = _isBlank(parent.value);
          if(empty){
            // When parent is empty, clear+disable child and show a better placeholder.
            if(childName === 'model'){
              try{ child.setAttribute('data-placeholder', '제조사를 먼저 선택'); }catch(_){ }
              try{ child.setAttribute('data-current-label', ''); }catch(_){ }
              _setSelectPlaceholderDisabled(child, '제조사를 먼저 선택');
              return;
            }
            if(childName === 'sys_owner' || childName === 'svc_owner'){
              try{ child.setAttribute('data-placeholder', '부서를 먼저 선택'); }catch(_){ }
              try{ child.value = ''; }catch(_){ }
              try{ child.setAttribute('data-current-label', ''); }catch(_){ }
              _setOwnerPlaceholderDisabled(child, '부서를 먼저 선택');
              return;
            }
            if(childName === 'location_pos'){
              try{ child.setAttribute('data-placeholder', '센터를 먼저 선택'); }catch(_){ }
              _setSelectPlaceholderDisabled(child, '센터를 먼저 선택');
              return;
            }
            clear(child);
            setDisabled(child, true);
          }
          else {
            // Restore placeholder and enable.
            try{
              var orig = (child.dataset && child.dataset.placeholderOriginal) ? child.dataset.placeholderOriginal : (child.getAttribute('data-placeholder') || '선택');
              child.setAttribute('data-placeholder', orig || '선택');
            }catch(_){ }
            setDisabled(child, false);

            // For model: repopulate options when vendor becomes available.
            if(childName === 'model'){
              try{
                Promise.resolve(_fetchFkItems(FK_SOURCE_CONFIG.SERVER_MODEL)).then(function(items){
                  _populateFkSelect(child, FK_SOURCE_CONFIG.SERVER_MODEL, items);
                });
              }catch(_){ }
            }
          }
        }
        parent.addEventListener('change', function(){
          // When the parent changes (even to another value), clear the child to avoid stale FK.
          clear(child);
          apply();
        });
        parent.addEventListener('input', apply);
        apply();
      }
      syncPair('vendor', 'model');
      syncPair('location_place', 'location_pos');
      syncPair('sys_dept', 'sys_owner');
      syncPair('svc_dept', 'svc_owner');
    }

    var BASICINFO_FORM_TO_PAYLOAD_KEY = {
      work_type: 'work_type',
      work_category: 'work_category',
      work_status: 'work_status',
      work_operation: 'work_operation',
      work_group: 'work_group',
      work_name: 'work_name',
      system_name: 'system_name',
      system_ip: 'system_ip',
      manage_ip: 'mgmt_ip',
      vendor: 'vendor',
      model: 'model',
      serial: 'serial',
      virtualization: 'virtualization_type',
      location_place: 'center_code',
      location_pos: 'rack_code',
      slot: 'system_slot',
      u_size: 'system_size',
      rack_face: 'rack_face',
      sys_dept: 'system_department',
      sys_owner: 'system_owner',
      svc_dept: 'service_department',
      svc_owner: 'service_owner',
      confidentiality: 'cia_confidentiality',
      integrity: 'cia_integrity',
      availability: 'cia_availability',
      security_score: 'security_score',
      system_grade: 'system_grade',
      core_flag: 'core_flag',
      dr_built: 'dr_built',
      svc_redundancy: 'svc_redundancy'
    };
    var BASICINFO_NUMERIC_PAYLOAD_KEYS = {
      cia_confidentiality: true,
      cia_integrity: true,
      cia_availability: true,
      security_score: true,
      system_slot: true,
      system_size: true
    };
    function getCurrentApAssetId(){
      var cand = null;
      try{ cand = sessionStorage.getItem('ap:selected:asset_id') || localStorage.getItem('ap:selected:asset_id') || localStorage.getItem('ap:last_selected_asset_id'); }catch(_){ cand = null; }
      if(cand){
        var n = parseInt(String(cand), 10);
        if(isFinite(n) && n > 0) return n;
      }
      try{
        var raw = sessionStorage.getItem('ap:selected:row') || localStorage.getItem('ap:selected:row');
        if(raw){
          var row = JSON.parse(raw);
          var id2 = row && (row.asset_id || row.assetId || row.id);
          var n2 = parseInt(String(id2 || ''), 10);
          if(isFinite(n2) && n2 > 0) return n2;
        }
      }catch(_e){ }
      return null;
    }
    function buildApPayloadFromForm(form){
      var payload = {};
      Object.keys(BASICINFO_FORM_TO_PAYLOAD_KEY).forEach(function(field){
        var el = form.querySelector('[name="'+field+'"]');
        if(!el) return;
        var raw = (el.value == null) ? '' : String(el.value);
        raw = raw.trim();
        var key = BASICINFO_FORM_TO_PAYLOAD_KEY[field];

        // If a previously-set field is cleared ("지움" -> empty), send null so the backend actually clears it.
        // (Required fields are still blocked by validation.)
        if(raw === '' || raw === '-'){
          if(REQUIRED_BASIC_FIELDS[field]) return;
          var initV = String(el.getAttribute('data-initial-value') || el.dataset.initialValue || '').trim();
          var initL = String(el.getAttribute('data-initial-label') || el.dataset.initialLabel || '').trim();
          var hadInitial = (!_isBlank(initV) || (!_isBlank(initL) && typeof _isUnchosenLabelText === 'function' && !_isUnchosenLabelText(initL)));
          if(hadInitial){
            payload[key] = null;
          }
          return;
        }

        if(BASICINFO_NUMERIC_PAYLOAD_KEYS[key]){
          var num = parseInt(raw, 10);
          if(isNaN(num)) return;
          payload[key] = num;
        } else {
          payload[key] = raw;
        }
      });
      return payload;
    }
    function persistApSelectionFromItem(item){
      if(!item) return;
      try{
        if(item.asset_id){ sessionStorage.setItem('ap:selected:asset_id', String(item.asset_id)); }
        if(item.asset_id){ localStorage.setItem('ap:selected:asset_id', String(item.asset_id)); }
        if(item.asset_id){ localStorage.setItem('ap:last_selected_asset_id', String(item.asset_id)); }
      }catch(_){ }
      try{ sessionStorage.setItem('ap:selected:row', JSON.stringify(item)); }catch(_){ }
      try{ localStorage.setItem('ap:selected:row', JSON.stringify(item)); }catch(_){ }
      try{
        if(item.work_name) sessionStorage.setItem('network_ap:selected:work_name', String(item.work_name));
        if(item.system_name) sessionStorage.setItem('network_ap:selected:system_name', String(item.system_name));
      }catch(_){ }
      try{
        if(item.work_name) localStorage.setItem('network_ap:selected:work_name', String(item.work_name));
        if(item.system_name) localStorage.setItem('network_ap:selected:system_name', String(item.system_name));
      }catch(_){ }
    }
    function applyHeaderFromItem(item){
      if(!item) return;
      try{
        var work = item.work_name || '-';
        var system = item.system_name || '-';
        var h1 = document.querySelector('#page-title, .page-header h1');
        var p = document.querySelector('#page-subtitle, .page-header p');
        if(h1) h1.textContent = String(work == null || String(work).trim()==='' ? '-' : work);
        if(p) p.textContent = String(system == null || String(system).trim()==='' ? '-' : system);
      }catch(_){ }
    }
    function validateRequiredBasicFields(form){
      if(!form) return false;
      var ok = true;
      Object.keys(REQUIRED_BASIC_FIELDS).forEach(function(name){
        var el = form.querySelector('[name="'+name+'"]');
        if(!el) return;
        var v = String(el.value || '').trim();
        if(v === '' || v === '-'){
          ok = false;
          try{ el.setCustomValidity('필수 항목입니다.'); }catch(_){ }
        } else {
          try{ el.setCustomValidity(''); }catch(_){ }
        }
      });
      return ok;
    }

    // Helpers to parse capacity strings like "100 TB" or "96000 GB" to GB
    function parseCapacityToGB(str){
      if(!str) return NaN;
      var s=String(str).trim();
      var m=s.match(/([0-9]*\.?[0-9]+)\s*(TB|GB|tb|gb)?/); if(!m) return NaN;
      var val=parseFloat(m[1]); var unit=(m[2]||'GB').toUpperCase();
      if(unit==='TB') return val*1024; return val; // treat GB as base
    }
    function formatGBToPretty(gb){ if(!isFinite(gb)) return ''; if(gb>=1024) return (Math.round(gb/102.4)/10)+' TB'; return Math.round(gb)+' GB'; }

    // Fallback column labels if a global COLUMN_META is not present
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
    function buildEditFormFromPage(){
      var form = document.getElementById(EDIT_FORM_ID); if(!form) return;
      // If tab31-basic-storage context, don't auto-build old groups
      var basicStoragePane = document.getElementById('basic');
      if(basicStoragePane && basicStoragePane.querySelector('#bs-physical-total')){
        // Populate modal fields from current values
        function t(id){ var el=document.getElementById(id); return el? (el.textContent||'').trim():''; }
        form.innerHTML = form.innerHTML; // ensure DOM exists
        var mappings = [
          ['bs-physical-total','bs-physical-total-input'],
          ['bs-logical-total','bs-logical-total-input'],
          ['bs-raid-level','bs-raid-level-input'],
          ['bs-allocated-total','bs-allocated-total-input'],
          ['bs-unallocated-total','bs-unallocated-total-input'],
          ['bs-cache-memory','bs-cache-memory-input'],
          ['bs-volume-count','bs-volume-count-input'],
          ['bs-host-count','bs-host-count-input'],
          ['bs-sync-enabled','bs-sync-enabled-input'],
          ['bs-sync-method','bs-sync-method-input'],
          ['bs-sync-storage','bs-sync-storage-input'],
          ['bs-phone','bs-phone-input']
        ];
        mappings.forEach(function(mp){ var v=t(mp[0]); var input=document.getElementById(mp[1]); if(input){ if(input.tagName==='SELECT'){ var opts=Array.from(input.options); var found=opts.find(function(o){ return (o.value||o.text)===v; }); if(found){ input.value = found.value; } } else { input.value = v; } } });
        // Wire auto-calc and constraint: logical <= physical; unallocated = logical - allocated
        var physEl = document.getElementById('bs-physical-total-input');
        var logiEl = document.getElementById('bs-logical-total-input');
        var allocEl = document.getElementById('bs-allocated-total-input');
        var unallocEl = document.getElementById('bs-unallocated-total-input');
        function recompute(){
          var p=parseCapacityToGB(physEl.value);
          var l=parseCapacityToGB(logiEl.value);
          var a=parseCapacityToGB(allocEl.value);
          if(isFinite(p) && isFinite(l) && l>p){
            // clamp logical to physical
            logiEl.value = formatGBToPretty(p);
            l=p;
          }
          if(isFinite(l) && isFinite(a)){
            var u = l - a; if(u<0) u=0; unallocEl.value = formatGBToPretty(u);
          } else {
            unallocEl.value = '';
          }
        }
        ;['input','change'].forEach(function(ev){ if(physEl) physEl.addEventListener(ev,recompute); if(logiEl) logiEl.addEventListener(ev,recompute); if(allocEl) allocEl.addEventListener(ev,recompute); });
        recompute();
        return; // skip legacy build
      }
      function text(sel){ var el=document.querySelector(sel); return (el? el.textContent.trim() : ''); }
      function badgeVal(sel){ var el=document.querySelector(sel); return (el? el.textContent.trim() : ''); }
      function cia(sel){ var el=document.querySelector(sel); return (el? el.textContent.trim() : ''); }
      function _sanitizeFormVal(v){
        var s = String(v == null ? '' : v).trim();
        if(_isBlank(s)) return '';
        try{ if(typeof _isUnchosenLabelText === 'function' && _isUnchosenLabelText(s)) return ''; }catch(_){ }
        return s;
      }

      // Always compute current DOM values first (source of truth after save).
      var domData = {
        work_status: (window.getBasicInfoValueByLabel ? window.getBasicInfoValueByLabel('업무 상태') : ''),
        work_type: (window.getBasicInfoValueByLabel ? window.getBasicInfoValueByLabel('업무 분류') : ''),
        work_category: (window.getBasicInfoValueByLabel ? window.getBasicInfoValueByLabel('업무 구분') : ''),
        work_operation: (window.getBasicInfoValueByLabel ? window.getBasicInfoValueByLabel('업무 운영') : ''),
        work_group: (window.getBasicInfoValueByLabel ? window.getBasicInfoValueByLabel('업무 그룹') : ''),
        work_name: (window.getBasicInfoValueByLabel ? window.getBasicInfoValueByLabel('업무 이름') : ''),
        system_name: (window.getBasicInfoValueByLabel ? window.getBasicInfoValueByLabel('시스템 이름') : ''),
        system_ip: (window.getBasicInfoValueByLabel ? window.getBasicInfoValueByLabel('시스템 IP') : ''),
        manage_ip: (window.getBasicInfoValueByLabel ? window.getBasicInfoValueByLabel('관리 IP') : ''),
        vendor: (window.getBasicInfoValueByLabel ? window.getBasicInfoValueByLabel('시스템 제조사') : ''),
        model: (window.getBasicInfoValueByLabel ? window.getBasicInfoValueByLabel('시스템 모델명') : ''),
        serial: (window.getBasicInfoValueByLabel ? window.getBasicInfoValueByLabel('시스템 일련번호') : ''),
        virtualization: (window.getBasicInfoValueByLabel ? window.getBasicInfoValueByLabel('시스템 가상화') : ''),
        location_place: (window.getBasicInfoValueByLabel ? window.getBasicInfoValueByLabel('시스템 장소') : ''),
        location_pos: (window.getBasicInfoValueByLabel ? window.getBasicInfoValueByLabel('시스템 위치') : ''),
        slot: (window.getBasicInfoValueByLabel ? window.getBasicInfoValueByLabel('시스템 슬롯') : ''),
        u_size: (window.getBasicInfoValueByLabel ? window.getBasicInfoValueByLabel('시스템 크기') : ''),
        sys_dept: (window.getBasicInfoValueByLabel ? window.getBasicInfoValueByLabel('시스템 담당부서') : ''),
        sys_owner: (window.getBasicInfoValueByLabel ? window.getBasicInfoValueByLabel('시스템 담당자') : ''),
        svc_dept: (window.getBasicInfoValueByLabel ? window.getBasicInfoValueByLabel('서비스 담당부서') : ''),
        svc_owner: (window.getBasicInfoValueByLabel ? window.getBasicInfoValueByLabel('서비스 담당자') : ''),
        confidentiality: (window.getBasicInfoValueByLabel ? window.getBasicInfoValueByLabel('기밀성') : ''),
        integrity: (window.getBasicInfoValueByLabel ? window.getBasicInfoValueByLabel('무결성') : ''),
        availability: (window.getBasicInfoValueByLabel ? window.getBasicInfoValueByLabel('가용성') : ''),
        security_score: (window.getBasicInfoValueByLabel ? window.getBasicInfoValueByLabel('보안 점수') : ''),
        system_grade: (window.getBasicInfoValueByLabel ? window.getBasicInfoValueByLabel('시스템 등급') : ''),
        core_flag: (window.getBasicInfoValueByLabel ? window.getBasicInfoValueByLabel('핵심/일반') : ''),
        dr_built: (window.getBasicInfoValueByLabel ? window.getBasicInfoValueByLabel('DR 구축여부') : ''),
        svc_redundancy: (window.getBasicInfoValueByLabel ? window.getBasicInfoValueByLabel('서비스 이중화') : '')
      };
      try{ Object.keys(domData).forEach(function(k){ domData[k] = _sanitizeFormVal(domData[k]); }); }catch(_){ }
      var domHasAny = false;
      try{ domHasAny = Object.keys(domData).some(function(k){ return !_isBlank(domData[k]); }); }catch(_){ domHasAny = false; }
      if(!domHasAny){ domData = {}; }

      var selectedRowData = null;
      try{
        var storagePrefix = (typeof STORAGE_PREFIX !== 'undefined' && STORAGE_PREFIX) ? STORAGE_PREFIX : 'ap';
        var raw = sessionStorage.getItem(storagePrefix+':selected:row') || localStorage.getItem(storagePrefix+':selected:row');
        if(raw){
          var selectedRow = JSON.parse(raw);
          // Normalize to tolerate different shapes (list-row vs API item)
          var normalized = null;
          try{ normalized = _normalizeApItemForDisplay(selectedRow); }catch(_){ normalized = null; }
          var keys = ['work_status','work_type','work_category','work_operation','work_group','work_name','system_name','system_ip','manage_ip','vendor','model','serial','virtualization','location_place','location_pos','slot','u_size','sys_dept','sys_owner','svc_dept','svc_owner','confidentiality','integrity','availability','security_score','system_grade','core_flag','dr_built','svc_redundancy'];
          selectedRowData = {};
          keys.forEach(function(k){
            var vv = null;
            if(normalized && normalized[k] != null) vv = normalized[k];
            else if(selectedRow && selectedRow[k] != null) vv = selectedRow[k];
            if(vv == null) return;
            var v = String(vv).trim();
            if(v !== '' && v !== 'null' && v !== 'None') selectedRowData[k] = v;
          });
          // If storage had no useful values, ignore it and fall back to current DOM values.
          try{
            if(Object.keys(selectedRowData).length === 0){
              selectedRowData = null;
            }
          }catch(_){ /* ignore */ }
        }
      }catch(_e){ selectedRowData = null; }
    // DOM values win over storage (prevents stale cached values from reappearing after save/clear).
    var data = Object.assign({}, (selectedRowData || {}), (domData || {}));
      var GROUPS = [
        { title:'비즈니스', cols:['work_type','work_category','work_status','work_operation','work_group','work_name','system_name','system_ip','manage_ip'] },
        { title:'시스템', cols:['vendor','model','serial','virtualization','location_place','location_pos','slot','u_size','rack_face'] },
        { title:'담당자', cols:['sys_dept','sys_owner','svc_dept','svc_owner'] },
        { title:'점검', cols:['confidentiality','integrity','availability','security_score','system_grade','core_flag','dr_built','svc_redundancy'] }
      ];
      function fieldInput(col, value){
        var isRequired = !!REQUIRED_BASIC_FIELDS[col];
        var init = String(value == null ? '' : value).trim();
        var opts={
          virtualization:['','물리','가상'],
          confidentiality:['','1','2','3'], integrity:['','1','2','3'], availability:['','1','2','3'],
          system_grade:['','1등급','2등급','3등급'], core_flag:['','핵심','일반'], dr_built:['','O','X'], svc_redundancy:['','O','X']
        };
        if(col==='security_score') return '<input name="security_score" class="form-input" type="number" readonly placeholder="자동 합계" data-initial-value="'+_escapeAttr(init)+'" value="'+(value||'')+'">';
        if(opts[col]){
          return '<select name="'+col+'" class="form-input search-select '+(['confidentiality','integrity','availability'].indexOf(col)>-1?'score-trigger':'')+'" data-initial-value="'+_escapeAttr(init)+'" '+(isRequired?'required':'')+'>'+ 
            opts[col].map(function(o){ return '<option value="'+o+'" '+(String(o)===String(value)?'selected':'')+'>'+(o||'-')+'</option>'; }).join('')+
          '</select>';
        }
        // FK-backed searchable selects (with clear button "지움")
        if(BASICINFO_FK_FIELD[col]){
          var fkKey = BASICINFO_FK_FIELD[col];
          var cur = String(value || '').trim();
          // Keep legacy label as a temporary selected option; hydrate later with master FK options.
          var tmpOpt = cur ? ('<option value="'+_escapeAttr(cur)+'" selected>'+_escapeAttr(cur)+'</option>') : '';
          return '<select name="'+col+'" class="form-input search-select" data-fk="'+fkKey+'" data-placeholder="선택" data-current-label="'+_escapeAttr(cur)+'" data-initial-value="'+_escapeAttr(cur)+'" data-initial-label="'+_escapeAttr(cur)+'" '+(isRequired?'required':'')+'>'+
            '<option value="">선택</option>' + tmpOpt +
          '</select>';
        }
        if(col==='rack_face'){
            var selF=(value||'').toUpperCase()==='REAR'||value==='후면'?'':' selected';
            var selR=(value||'').toUpperCase()==='REAR'||value==='후면'?' selected':'';
            return '<select name="rack_face" class="form-input search-select" data-searchable="true" data-placeholder="선택" data-initial-value="'+_escapeAttr(init)+'"><option value="">선택</option><option value="FRONT"'+selF+'>전면</option><option value="REAR"'+selR+'>후면</option></select>';
        }
        if(['slot','u_size'].indexOf(col)>-1) return '<input name="'+col+'" type="number" min="0" step="1" class="form-input" data-initial-value="'+_escapeAttr(init)+'" value="'+(value||'')+'">';
        return '<input name="'+col+'" class="form-input" data-initial-value="'+_escapeAttr(init)+'" '+(isRequired?'required':'')+' value="'+(value||'')+'">';
      }
      var html = GROUPS.map(function(g){
        var grid = g.cols.map(function(c){ var meta=COLUMN_META[c]||{label:c}; return '<div class="form-row"><label>'+(c==='security_score'?'보안 점수':meta.label)+'</label>'+ fieldInput(c, data[c]) +'</div>'; }).join('');
        return '<div class="form-section"><div class="section-header"><h4>'+g.title+'</h4></div><div class="form-grid">'+grid+'</div></div>';
      }).join('');
      form.innerHTML = html;
      attachSecurityScoreRecalc(EDIT_FORM_ID);
      attachVirtualizationHandler(EDIT_FORM_ID);
      // After DOM injection: hydrate FK selects and wire cascade rules.
      try{ hydrateBasicInfoFkSelects(form); }catch(_){ }
      try{ wireCascadeClearDisable(form); }catch(_){ }
    }

    function attachSecurityScoreRecalc(formId){
      var form=document.getElementById(formId); if(!form) return;
      var scoreInput=form.querySelector('input[name="security_score"]'); if(!scoreInput) return;
      function recompute(){
        var c=parseInt(form.querySelector('[name="confidentiality"]').value||'0',10)||0;
        var i=parseInt(form.querySelector('[name="integrity"]').value||'0',10)||0;
        var a=parseInt(form.querySelector('[name="availability"]').value||'0',10)||0;
        var total=c+i+a; scoreInput.value = total? total: '';
        var gradeField=form.querySelector('[name="system_grade"]'); if(gradeField){ if(total>=8) gradeField.value='1등급'; else if(total>=6) gradeField.value='2등급'; else if(total>0) gradeField.value='3등급'; }
      }
      ['confidentiality','integrity','availability'].forEach(function(n){ var el=form.querySelector('[name="'+n+'"]'); if(el) el.addEventListener('change',recompute); });
      recompute();
    }

    function enforceVirtualizationDash(form){
      if(!form) return; var virt=form.querySelector('[name="virtualization"]'); if(!virt) return;
      var v=String(virt.value||'').trim();
      var dashText=['vendor','model','serial','location_pos']; var dashNum=['slot','u_size','rack_face'];
      function setDash(el){ if(!el) return; el.value='-'; }
      function clearIfDash(el, t){ if(!el) return; if(el.value==='-') el.value=''; if(t){ try{ el.type=t; }catch(_){} } }
      if(v==='가상'){
        dashText.forEach(function(n){ setDash(form.querySelector('[name="'+n+'"]')); });
        dashNum.forEach(function(n){ var el=form.querySelector('[name="'+n+'"]'); if(!el) return; if(!el.dataset.origType){ el.dataset.origType=el.type||'number'; } try{ el.type='text'; }catch(_){} setDash(el); });
      } else {
        dashText.forEach(function(n){ clearIfDash(form.querySelector('[name="'+n+'"]')); });
        dashNum.forEach(function(n){ var el=form.querySelector('[name="'+n+'"]'); if(!el) return; var orig=el.dataset.origType||'number'; clearIfDash(el, orig); if(el.type==='number'){ el.min='0'; el.step='1'; } });
      }
    }
    function attachVirtualizationHandler(formId){ var form=document.getElementById(formId); if(!form) return; var sel=form.querySelector('[name="virtualization"]'); if(!sel) return; sel.addEventListener('change', function(){ enforceVirtualizationDash(form); }); enforceVirtualizationDash(form); }

  function updatePageFromForm(){
      var form=document.getElementById(EDIT_FORM_ID); if(!form) return;
      // Tab31 basic-storage support
      var isBasicStorage = !!document.getElementById('bs-physical-total');
      if(isBasicStorage){
        function setText(id, val){ var el=document.getElementById(id); if(el) el.textContent = String(val||''); }
        function val(id){ var el=form.querySelector('#'+id); return el? el.value : ''; }
        // Ensure constraints: logical <= physical and unallocated = logical - allocated
        var pGB=parseCapacityToGB(val('bs-physical-total-input'));
        var lGB=parseCapacityToGB(val('bs-logical-total-input'));
        if(isFinite(pGB) && isFinite(lGB) && lGB>pGB){ lGB = pGB; }
        var aGB=parseCapacityToGB(val('bs-allocated-total-input'));
        var uGB = (isFinite(lGB)&&isFinite(aGB)) ? Math.max(0, lGB - aGB) : NaN;
        setText('bs-physical-total', val('bs-physical-total-input'));
        setText('bs-logical-total', isFinite(lGB)? formatGBToPretty(lGB): val('bs-logical-total-input'));
        setText('bs-raid-level', val('bs-raid-level-input'));
        setText('bs-allocated-total', val('bs-allocated-total-input'));
        setText('bs-unallocated-total', isFinite(uGB)? formatGBToPretty(uGB): val('bs-unallocated-total-input'));
        setText('bs-cache-memory', val('bs-cache-memory-input'));
        setText('bs-volume-count', val('bs-volume-count-input'));
        setText('bs-host-count', val('bs-host-count-input'));
        // Update O/X badge for 동기화 여부
        (function(){
          var badge = document.getElementById('bs-sync-enabled');
          if(badge){
            var v = val('bs-sync-enabled-input');
            var isOn = (v==='O');
            badge.textContent = isOn ? 'O' : 'X';
            badge.classList.remove('on','off');
            badge.classList.add(isOn ? 'on' : 'off');
            badge.setAttribute('aria-label', isOn ? '예' : '아니오');
          }
        })();
        setText('bs-sync-method', val('bs-sync-method-input'));
        setText('bs-sync-storage', val('bs-sync-storage-input'));
        setText('bs-phone', val('bs-phone-input'));
        return; // do not run legacy update
      }
      // Build a display row from form values and apply to the visible basic-info grid.
      function vVal(name){ var el=form.querySelector('[name="'+name+'"]'); return el? String(el.value||'') : ''; }
      function vText(name){
        var el=form.querySelector('[name="'+name+'"]');
        if(!el) return '';
        if(el.tagName && el.tagName.toLowerCase()==='select'){
          var opt = (el.selectedOptions && el.selectedOptions[0]) ? el.selectedOptions[0] : null;
          var txt = opt ? (opt.textContent || '').trim() : '';
          // For FK selects, prefer visible label text.
          return txt || String(el.value||'');
        }
        return String(el.value||'');
      }
      var displayRow = {
        work_status: vText('work_status'),
        work_type: vText('work_type'),
        work_category: vText('work_category'),
        work_operation: vText('work_operation'),
        work_group: vText('work_group'),
        work_name: vVal('work_name'),
        system_name: vVal('system_name'),
        system_ip: vVal('system_ip'),
        manage_ip: vVal('manage_ip'),
        vendor: vText('vendor'),
        model: vText('model'),
        serial: vVal('serial'),
        virtualization: vText('virtualization'),
        location_place: vText('location_place'),
        location_pos: vText('location_pos'),
        slot: vVal('slot'),
        u_size: vVal('u_size'),
        sys_dept: vText('sys_dept'),
        sys_owner: vText('sys_owner'),
        svc_dept: vText('svc_dept'),
        svc_owner: vText('svc_owner'),
        confidentiality: vVal('confidentiality'),
        integrity: vVal('integrity'),
        availability: vVal('availability'),
        security_score: vVal('security_score'),
        system_grade: vText('system_grade'),
        core_flag: vText('core_flag'),
        dr_built: vText('dr_built'),
        svc_redundancy: vText('svc_redundancy')
      };
      try{ if(typeof window.applyRowToBasicInfo === 'function') window.applyRowToBasicInfo(displayRow); }catch(_){ }
      try{ applyHeaderFromItem({ work_name: displayRow.work_name, system_name: displayRow.system_name }); }catch(_){ }
      // Persist key hardware fields for cross-tab usage (hardware tab system row)
      try{
        var vendorVal = displayRow.vendor;
        var modelVal  = displayRow.model;
        var serialVal = displayRow.serial;
        var slotVal   = displayRow.slot;
        var uSizeVal  = displayRow.u_size;
        // Use AP-specific keys to avoid cross-page contamination
        localStorage.setItem('ap:current:vendor', String(vendorVal||''));
        localStorage.setItem('ap:current:model',  String(modelVal||''));
        localStorage.setItem('ap:current:serial', String(serialVal||''));
        localStorage.setItem('ap:current:slot',   String(slotVal||''));
        localStorage.setItem('ap:current:u_size', String(uSizeVal||''));
        localStorage.setItem('ap:current:rack_face', String((item.rack_face) || ''));
      }catch(_){ }
    }
    // Wire the Basic Info edit modal open/close/save
    (function(){
      function openModalLocal(id){ var el=document.getElementById(id); if(!el) return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden','false'); }
      function closeModalLocal(id){ var el=document.getElementById(id); if(!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } }
      var openBtn = document.getElementById(EDIT_OPEN_ID);
      if(openBtn){ openBtn.addEventListener('click', function(){
        buildEditFormFromPage();
        openModalLocal(EDIT_MODAL_ID);
        try{
          var form = document.getElementById(EDIT_FORM_ID);
          var fkP = hydrateBasicInfoFkSelects(form);
          wireCascadeClearDisable(form);
          wireLocationRackFilter(form);
          wireDeptOwnerFilter(form);
          // One more refresh after FK hydration completes.
          Promise.resolve(fkP).then(function(){
            try{ wireLocationRackFilter(form); }catch(_){ }
            try{ wireDeptOwnerFilter(form); }catch(_){ }
          });
        }catch(_){ }
        try{ if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function'){ window.BlossomSearchableSelect.enhance(document.getElementById(EDIT_MODAL_ID) || document); } }catch(_){ }
      }); }
      var closeBtn = document.getElementById(EDIT_CLOSE_ID);
      if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalLocal(EDIT_MODAL_ID); }); }
      var modalEl = document.getElementById(EDIT_MODAL_ID);
      if(modalEl){ modalEl.addEventListener('click', function(e){ if(e.target === modalEl) closeModalLocal(EDIT_MODAL_ID); }); document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(EDIT_MODAL_ID); }); }
      var saveBtn = document.getElementById(EDIT_SAVE_ID);
      if(saveBtn){ saveBtn.addEventListener('click', function(){
        var form = document.getElementById(EDIT_FORM_ID);
        if(!form) return;
        // Ensure FK selects are hydrated so we submit codes (not display labels).
        var fkPromise = null;
        try{ fkPromise = form.__fkHydratedPromise; }catch(_){ fkPromise = null; }
        if(!fkPromise){ fkPromise = hydrateBasicInfoFkSelects(form); }
        Promise.resolve(fkPromise)
          .then(function(){
            form.classList.add('show-required-errors');
            validateRequiredBasicFields(form);
            if(typeof form.reportValidity === 'function'){
              if(!form.reportValidity()) return;
            } else {
              if(typeof form.checkValidity === 'function' && !form.checkValidity()) return;
            }

            var assetId = getCurrentApAssetId();
            var payload = buildApPayloadFromForm(form);
            // For create, ensure category/type for server-side routing (harmless on update)
            payload.asset_category = 'NETWORK';
            payload.asset_type = 'AP';

            var url = assetId ? ('/api/hardware/network/ap/assets/' + assetId) : '/api/hardware/network/ap/assets';
            var method = assetId ? 'PUT' : 'POST';

            var originalText = saveBtn.textContent;
            saveBtn.disabled = true;
            saveBtn.textContent = '저장 중...';
            return _fetchJson(url, { method: method, headers: { 'Content-Type':'application/json', 'Accept':'application/json' }, body: JSON.stringify(payload) })
              .then(function(j){
                if(!j || j.success === false){ throw new Error((j && j.message) ? j.message : '저장에 실패했습니다.'); }
                if(j.item){
                  persistApSelectionFromItem(j.item);
                  applyHeaderFromItem(j.item);
                }
                updatePageFromForm();
                closeModalLocal(EDIT_MODAL_ID);
              })
              .catch(function(err){
                try{ alert(err && err.message ? err.message : '저장에 실패했습니다.'); }catch(_){ }
              })
              .finally(function(){
                saveBtn.disabled = false;
                saveBtn.textContent = originalText;
              });
          });
      }); }
    })();

      // [Tabs moved to /static/js/_detail/tab*.js]

      // delegate edit/delete/toggle save
      table.addEventListener('click', function(ev){
        var target = ev.target.closest('.js-hw-del, .js-hw-edit, .js-hw-commit, .js-hw-toggle'); if(!target) return;
        var tr = ev.target.closest('tr'); if(!tr) return;
        if(target.classList.contains('js-hw-del')){
          // 시스템 행은 삭제 금지
          if(isSystemRow(tr)) return;
          var base = apiBase();
          var idAttr = tr.getAttribute('data-id');
          var rowId = idAttr ? parseInt(idAttr, 10) : NaN;
          if(base && !isNaN(rowId) && rowId > 0){
            try{ target.disabled = true; }catch(_){ }
            hwApiFetch(base + '/' + rowId, { method:'DELETE' })
              .then(function(res){
                if(!res || !res.ok || !res.json || res.json.success === false){
                  var msg = (res && res.json && res.json.message) ? res.json.message : '하드웨어 구성 삭제 중 오류가 발생했습니다.';
                  hwAlert(msg);
                  return;
                }
                tr.parentNode.removeChild(tr);
                try{ hwClampPage(); }catch(_){ }
                updateEmptyState();
              })
              .catch(function(_e){ hwAlert('하드웨어 구성 삭제 중 오류가 발생했습니다.'); })
              .finally(function(){ try{ target.disabled = false; }catch(_){ } });
            return;
          }
          tr.parentNode.removeChild(tr);
          try{ hwClampPage(); }catch(_){ }
          updateEmptyState();
          return;
        }
        // Toggle: edit -> save
        if(
          target.classList.contains('js-hw-edit') ||
          (target.classList.contains('js-hw-toggle') && target.getAttribute('data-action') === 'edit')
        ){
          if(isInventorySchema){
            function toInputInv(name, placeholder){
              var td = tr.querySelector('[data-col="'+name+'"]'); if(!td) return;
              var current = (td.textContent||'').trim();
              if(name==='type'){
                if(isSystemRow(tr)) return;
                var norm = (current||'').toUpperCase();
                var options = ['<option value=""'+(norm?'':' selected')+' disabled>유형 선택 (필수)</option>']
                  .concat(invTypeOptions.map(function(o){ return '<option value="'+o+'"'+(o===norm?' selected':'')+'>'+o+'</option>'; })).join('');
                td.innerHTML = '<select class="search-select" data-searchable-scope="page">'+options+'</select>';
                return;
              }
              if(isSystemRow(tr) && (name==='model' || name==='vendor' || name==='spec' || name==='qty')) return;
              if(name==='qty'){
                var q = parseInt(current, 10);
                if(isNaN(q) || q<=0) q = 1;
                td.innerHTML = '<input type="number" min="1" step="1" value="'+q+'" placeholder="수량 (필수)">';
                return;
              }
              if(name==='spec' || name==='vendor'){
                td.innerHTML = '<input type="text" value="'+current+'" placeholder="(자동)" disabled>';
                return;
              }
              if(name==='model'){
                td.innerHTML = '<input type="text" value="'+current+'" placeholder="모델명 (필수)">';
                return;
              }
              td.innerHTML = '<input type="text" value="'+current+'" placeholder="'+(placeholder||'')+'">';
            }
            var invCols = ['type','model']; if(hasSpecCol) invCols.push('spec'); invCols = invCols.concat(['vendor','qty','fw','remark']);
            invCols.forEach(function(n){ toInputInv(n); });
            try{ if(!isSystemRow(tr) && window.BlossomHwInventoryCatalog) window.BlossomHwInventoryCatalog.enhanceRow(tr); }catch(_){ }

            var toggleBtn0 = tr.querySelector('.js-hw-toggle');
            if(toggleBtn0){
              toggleBtn0.setAttribute('data-action', 'save');
              toggleBtn0.title = '저장'; toggleBtn0.setAttribute('aria-label','저장');
              toggleBtn0.innerHTML = '<img src="/static/image/svg/save.svg" alt="저장" class="action-icon">';
            } else {
              var actions0 = tr.querySelector('.table-actions');
              if(actions0){ actions0.classList.add('system-actions'); actions0.innerHTML = '<button class="action-btn js-hw-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button> <button class="action-btn danger js-hw-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'; }
            }
            return;
          }
          // turn cells into inputs for inline edit
          function toInput(name, placeholder){
            var td = tr.querySelector('[data-col="'+name+'"]'); if(!td) return;
            var current = (td.textContent||'').trim();
            if(name==='type'){
              // 시스템 행은 유형 고정
              if(isSystemRow(tr)) return;
              // Frame 하드웨어: 유형은 고정 목록 사용
              var opts = typeOptions;
              var options = ['<option value=""'+(current?'':' selected')+' disabled>유형 선택 (필수)</option>']
                .concat(opts.map(function(o){ return '<option value="'+o+'"'+(o===current?' selected':'')+'>'+o+'</option>'; })).join('');
              td.innerHTML = '<select>'+options+'</select>';
              return;
            }
            if(name==='space'){
              // 시스템 행의 공간은 '-' 고정 (편집 금지)
              if(isSystemRow(tr)) return;
              var bays = Array.from({length: bayCount}, function(_,i){ return 'BAY'+(i+1); });
              var opt2 = ['<option value=""'+(current?'':' selected')+' disabled>공간 선택 (필수)</option>']
                .concat(bays.map(function(o){ return '<option value="'+o+'"'+(o===current?' selected':'')+'>'+o+'</option>'; })).join('');
              td.innerHTML = '<select>'+opt2+'</select>';
              return;
            }
            if(isSystemRow(tr) && (name==='model' || name==='vendor' || name==='serial' || name==='spec')){
              // 시스템 행의 모델/제조사/일련번호는 기본정보에서만 갱신; 편집 입력 금지
              return;
            }
            td.innerHTML = '<input type="text" value="'+current+'" placeholder="'+(placeholder||'')+'">';
          }
          var editCols = ['type','space','model']; if(hasSpecCol) editCols.push('spec'); editCols = editCols.concat(['serial','vendor','fw','remark']);
          editCols.forEach(function(n){ toInput(n); });
          // swap toggle button to save state
          var toggleBtn = tr.querySelector('.js-hw-toggle');
          if(toggleBtn){
            toggleBtn.setAttribute('data-action', 'save');
            toggleBtn.title = '저장'; toggleBtn.setAttribute('aria-label','저장');
            toggleBtn.innerHTML = '<img src="/static/image/svg/save.svg" alt="저장" class="action-icon">';
              if(isSystemRow(tr)) hwEnsureSystemActionPlaceholder(tr, true);
          } else {
            // fallback for legacy .js-hw-edit
            var actions = tr.querySelector('.table-actions');
            if(actions){ actions.classList.add('system-actions'); actions.innerHTML = '<button class="action-btn js-hw-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button> <button class="action-btn danger js-hw-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'; }
          }
          return; // prevent falling through to save branch in same click
        }
        // Toggle: save -> back to view
        if(
          target.classList.contains('js-hw-commit') ||
          (target.classList.contains('js-hw-toggle') && target.getAttribute('data-action') === 'save')
        ){
          if(isInventorySchema){
            function getInputInv(name){
              var td = tr.querySelector('[data-col="'+name+'"]'); if(!td) return null;
              return td.querySelector('input, textarea, select');
            }
            function setErrorInv(input, on){
              if(!input) return;
              try{
                var wrap = input.closest('.hw-search-control');
                var display = wrap ? wrap.querySelector('.fk-searchable-display') : null;
                if(display){
                  if(on){ display.classList.add('input-error'); display.setAttribute('aria-invalid','true'); }
                  else { display.classList.remove('input-error'); display.removeAttribute('aria-invalid'); }
                }
              }catch(_){ }
              if(on){ input.classList.add('input-error'); input.setAttribute('aria-invalid','true'); }
              else { input.classList.remove('input-error'); input.removeAttribute('aria-invalid'); }
            }
            var firstInvalidInv = null;

            var modelInputInv = getInputInv('model');
            var modelValInv = (modelInputInv? modelInputInv.value : (tr.querySelector('[data-col="model"]').textContent||'')).trim();
            if(!isSystemRow(tr)){
              if(!modelValInv){ setErrorInv(modelInputInv, true); if(!firstInvalidInv) firstInvalidInv = modelInputInv; } else { setErrorInv(modelInputInv, false); }
            }

            var typeInputInv = getInputInv('type') || (function(){ var td0 = tr.querySelector('[data-col="type"]'); return td0? td0.querySelector('select'): null; })();
            var typeValInv = (typeInputInv? typeInputInv.value : (tr.querySelector('[data-col="type"]').textContent||'')).trim();
            if(isSystemRow(tr)) typeValInv = '시스템';
            if(!typeValInv){ setErrorInv(typeInputInv, true); if(!firstInvalidInv) firstInvalidInv = typeInputInv; } else { setErrorInv(typeInputInv, false); }

            var qtyInputInv = getInputInv('qty');
            var qtyRawInv = (qtyInputInv? qtyInputInv.value : (tr.querySelector('[data-col="qty"]').textContent||'')).trim();
            var qtyValNum = parseInt(qtyRawInv, 10);
            if(isSystemRow(tr)) qtyValNum = 1;
            if(!isSystemRow(tr)){
              if(isNaN(qtyValNum) || qtyValNum <= 0){ setErrorInv(qtyInputInv, true); if(!firstInvalidInv) firstInvalidInv = qtyInputInv; }
              else { setErrorInv(qtyInputInv, false); }
            }

            if(firstInvalidInv){ try{ firstInvalidInv.focus(); }catch(_e){} return; }

            function commitInv(name, val){
              var td1 = tr.querySelector('[data-col="'+name+'"]'); if(!td1) return;
              var text = (val === '' || val == null)? '-' : String(val);
              td1.textContent = text;
            }
            function readInv(name){
              var inp = getInputInv(name);
              var v = (inp? inp.value : (tr.querySelector('[data-col="'+name+'"]').textContent||''));
              return String(v).trim();
            }

            if(isSystemRow(tr)){
              var d0 = getPageSystemInfo();
              commitInv('type', '시스템');
              commitInv('model', d0.model);
              if(hasSpecCol) commitInv('spec', '-');
              commitInv('vendor', d0.vendor);
              commitInv('qty', 1);
            } else {
              commitInv('type', typeValInv);
              commitInv('model', modelValInv);
              if(hasSpecCol) commitInv('spec', readInv('spec'));
              commitInv('vendor', readInv('vendor'));
              commitInv('qty', qtyValNum);
            }
            commitInv('fw', readInv('fw'));
            commitInv('remark', readInv('remark'));

            var toggleBtn1 = tr.querySelector('.js-hw-toggle');
            if(toggleBtn1){
              toggleBtn1.setAttribute('data-action', 'edit');
              toggleBtn1.title = '편집'; toggleBtn1.setAttribute('aria-label','편집');
              toggleBtn1.innerHTML = '<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon">';
            } else {
              var actions1 = tr.querySelector('.table-actions');
              if(actions1){ actions1.classList.add('system-actions'); actions1.innerHTML = '<button class="action-btn js-hw-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button> <button class="action-btn danger js-hw-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'; }
            }
            hwPersistRowToApi(tr, target);
            updateEmptyState();
            var cbInv = tr.querySelector('.hw-row-check'); if(cbInv){ var hiddenInv = tr.hasAttribute('data-hidden') || tr.style.display==='none'; tr.classList.toggle('selected', !!cbInv.checked && !hiddenInv); }
            return;
          }
          // Validation: model (required, non-empty), space (required for non-system)
          function getInput(name){
            var td = tr.querySelector('[data-col="'+name+'"]'); if(!td) return null;
            return td.querySelector('input, textarea');
          }
          function setError(input, on){ if(!input) return; if(on){ input.classList.add('input-error'); input.setAttribute('aria-invalid','true'); } else { input.classList.remove('input-error'); input.removeAttribute('aria-invalid'); } }
          var firstInvalid = null;
          var modelInput = getInput('model');
          var modelVal = (modelInput? modelInput.value : (tr.querySelector('[data-col="model"]').textContent||'')).trim();
          if(!modelVal){ setError(modelInput, true); if(!firstInvalid) firstInvalid = modelInput; } else { setError(modelInput, false); }
          // 유형(type) required
          var typeInput = getInput('type') || (function(){ var td = tr.querySelector('[data-col="type"]'); return td? td.querySelector('select'): null; })();
          var typeVal = (typeInput? typeInput.value : (tr.querySelector('[data-col="type"]').textContent||'')).trim();
          // 시스템 행은 유형을 강제로 '시스템'으로 유지
          if(isSystemRow(tr)) typeVal = '시스템';
          if(!typeVal){ setError(typeInput, true); if(!firstInvalid) firstInvalid = typeInput; } else { setError(typeInput, false); }
          // 공간(space) required for non-system rows
          var spaceInput = getInput('space') || (function(){ var td = tr.querySelector('[data-col="space"]'); return td? td.querySelector('select'): null; })();
          var spaceVal = (spaceInput? spaceInput.value : (tr.querySelector('[data-col="space"]').textContent||'')).trim();
          if(isSystemRow(tr)) spaceVal = '-';
          if(!spaceVal){ setError(spaceInput, true); if(!firstInvalid) firstInvalid = spaceInput; } else { setError(spaceInput, false); }
          if(firstInvalid){ try{ firstInvalid.focus(); }catch(_e){} return; }

          // Commit values; default blanks to '-'
          function commit(name, val){
            var td = tr.querySelector('[data-col="'+name+'"]'); if(!td) return;
            var text = (val === '' || val == null)? '-' : String(val);
            td.textContent = text;
          }
          // Read from inputs if present, else from existing text
          function read(name){ var inp = getInput(name); var v = (inp? inp.value : (tr.querySelector('[data-col="'+name+'"]').textContent||'')); return String(v).trim(); }
          // 시스템 행은 기본정보 기준으로 덮어쓰기
          if(isSystemRow(tr)){
            var d = getPageSystemInfo();
            commit('type', '시스템');
            commit('space', '-');
            commit('model', d.model);
            if(hasSpecCol) commit('spec', '-');
            commit('serial', d.serial);
            commit('vendor', d.vendor);
          } else {
            commit('type', typeVal);
            commit('space', spaceVal);
            commit('model', modelVal); // required, already validated non-empty
            if(hasSpecCol) commit('spec', read('spec'));
            commit('serial', read('serial'));
            commit('vendor', read('vendor'));
          }
          commit('fw', read('fw'));
          commit('remark', read('remark'));
          // swap toggle button back to edit state
          var toggleBtn = tr.querySelector('.js-hw-toggle');
          if(toggleBtn){
            toggleBtn.setAttribute('data-action', 'edit');
            toggleBtn.title = '편집'; toggleBtn.setAttribute('aria-label','편집');
            toggleBtn.innerHTML = '<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon">';
          } else {
            var actions = tr.querySelector('.table-actions');
            if(actions){ actions.classList.add('system-actions'); actions.innerHTML = '<button class="action-btn js-hw-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button> <button class="action-btn danger js-hw-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'; }
          }
          hwPersistRowToApi(tr, target);
          updateEmptyState();
          // preserve visual selection state
          var cb = tr.querySelector('.hw-row-check'); if(cb){ var hidden = tr.hasAttribute('data-hidden') || tr.style.display==='none'; tr.classList.toggle('selected', !!cb.checked && !hidden); }
          return;
        }
      });

      // Row click toggling and checkbox change syncing (visible rows only)
      table.addEventListener('click', function(ev){
        (function(){
          var tr = ev.target.closest('tr');
          if(!tr || !tr.parentNode || tr.parentNode.tagName.toLowerCase()!=='tbody') return;
          var isControl = ev.target.closest('button, a, input, select, textarea, label');
          var onCheckbox = ev.target.closest('input[type="checkbox"].hw-row-check');
          if(isControl && !onCheckbox) return;
          if(onCheckbox) return;
          var cb = tr.querySelector('.hw-row-check'); if(!cb) return; if(cb.disabled) return;
          var hidden = tr.hasAttribute('data-hidden') || tr.style.display==='none'; if(hidden) return;
          cb.checked = !cb.checked; tr.classList.toggle('selected', cb.checked);
          var sa = document.getElementById('hw-select-all'); if(sa){ var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check'); if(visChecks.length){ sa.checked = Array.prototype.every.call(visChecks, function(c){ return c.checked; }); } else { sa.checked=false; } }
        })();
      });
      table.addEventListener('change', function(ev){ var cb=ev.target.closest('.hw-row-check'); if(!cb) return; if(cb.disabled) return; var tr=cb.closest('tr'); if(tr){ var hidden=tr.hasAttribute('data-hidden') || tr.style.display==='none'; tr.classList.toggle('selected', !!cb.checked && !hidden); } var sa=document.getElementById('hw-select-all'); if(sa){ var visChecks=table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check'); if(visChecks.length){ sa.checked = Array.prototype.every.call(visChecks, function(c){ return c.checked; }); } else { sa.checked=false; } } });

      if(window.BlossomTab01Hardware && window.BlossomTab01Hardware.hasHwCsv){
        // CSV export handled by shared /static/js/_detail/tab01-hardware.js
      } else {
      // CSV export helpers and modal wiring
      function hwEscapeCSV(val){ return '"' + String(val).replace(/"/g,'""') + '"'; }
      function hwRowSaved(tr){ var t=tr.querySelector('.js-hw-toggle'); var inEdit=t && t.getAttribute('data-action')==='save'; if(inEdit) return false; return !tr.querySelector('td[data-col] input, td[data-col] select, td[data-col] textarea'); }
      function hwVisibleRows(){ var tbody=table.querySelector('tbody'); if(!tbody) return []; return Array.from(tbody.querySelectorAll('tr')).filter(function(tr){ return !(tr.hasAttribute('data-hidden') || tr.style.display==='none'); }); }
      function hwSavedVisibleRows(){ return hwVisibleRows().filter(hwRowSaved); }
      function hwExportCSV(onlySelected){
        var tbody = table.querySelector('tbody'); if(!tbody) return;
        var headers;
        if(isInventorySchema){
          headers = hasSpecCol ? ['유형','모델명','용량','제조사','수량','펌웨어','비고'] : ['유형','모델명','제조사','수량','펌웨어','비고'];
        } else {
          headers = hasSpecCol ? ['유형','공간','모델명','용량','일련번호','제조사','펌웨어','비고'] : ['유형','공간','모델명','일련번호','제조사','펌웨어','비고'];
        }
        // Use only rows that are visible and saved (exclude inline-editing rows)
        var trs = hwSavedVisibleRows();
        if(onlySelected){ trs = trs.filter(function(tr){ var cb = tr.querySelector('.hw-row-check'); return cb && cb.checked; }); }
        if(trs.length===0) return;
        function text(tr, col){ var td=tr.querySelector('[data-col="'+col+'"]'); return td? (td.textContent||'').trim() : ''; }
        var baseCols;
        if(isInventorySchema){
          baseCols = ['type','model']; if(hasSpecCol) baseCols.push('spec'); baseCols = baseCols.concat(['vendor','qty','fw','remark']);
        } else {
          baseCols = ['type','space','model']; if(hasSpecCol) baseCols.push('spec'); baseCols = baseCols.concat(['serial','vendor','fw','remark']);
        }
        var rows = trs.map(function(tr){ return baseCols.map(function(c){ return text(tr,c); }); });
        var lines = [headers].concat(rows).map(function(arr){ return arr.map(hwEscapeCSV).join(','); });
        var csv = '\uFEFF' + lines.join('\r\n'); var d=new Date(); var yyyy=d.getFullYear(); var mm=String(d.getMonth()+1).padStart(2,'0'); var dd=String(d.getDate()).padStart(2,'0');
        var filename = 'hardware_'+yyyy+mm+dd+'.csv';
        try{ var blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); var url=URL.createObjectURL(blob); var a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); }
        catch(_){ var a2=document.createElement('a'); a2.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a2.download=filename; document.body.appendChild(a2); a2.click(); document.body.removeChild(a2); }
      }
      (function(){
        var btn = document.getElementById('hw-download-btn');
        var modalId = 'hw-download-modal';
        var closeBtn = document.getElementById('hw-download-close');
        var confirmBtn = document.getElementById('hw-download-confirm');
        function openModalLocal(id){ var el=document.getElementById(id); if(!el) return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden','false'); }
        function closeModalLocal(id){ var el=document.getElementById(id); if(!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } }
        if(btn){ btn.addEventListener('click', function(){
          if(btn.disabled) return;
          // Consider only saved rows for CSV
          var saved = hwSavedVisibleRows();
          var total = saved.length;
          if(total<=0) return;
          var selectedCount = saved.filter(function(tr){ var cb=tr.querySelector('.hw-row-check'); return cb && cb.checked; }).length;
          var subtitle=document.getElementById('hw-download-subtitle');
          if(subtitle){ subtitle.textContent = selectedCount>0 ? ('선택된 '+selectedCount+'개 또는 전체 '+total+'개 결과 중 범위를 선택하세요.') : ('현재 결과 '+total+'개 항목을 CSV로 내보냅니다.'); }
          var rowSelectedWrap=document.getElementById('hw-csv-range-row-selected');
          var optSelected=document.getElementById('hw-csv-range-selected');
          var optAll=document.getElementById('hw-csv-range-all');
          if(rowSelectedWrap) rowSelectedWrap.hidden = !(selectedCount>0);
          if(optSelected){ optSelected.disabled = !(selectedCount>0); optSelected.checked = selectedCount>0; }
          if(optAll){ optAll.checked = !(selectedCount>0); }
          openModalLocal(modalId);
        }); }
        if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalLocal(modalId); }); }
        var modalEl = document.getElementById(modalId);
        if(modalEl){ modalEl.addEventListener('click', function(e){ if(e.target===modalEl) closeModalLocal(modalId); }); document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(modalId); }); }
        if(confirmBtn){ confirmBtn.addEventListener('click', function(){ var onlySel = !!(document.getElementById('hw-csv-range-selected') && document.getElementById('hw-csv-range-selected').checked); hwExportCSV(onlySel); closeModalLocal(modalId); }); }
      })();
      }
    })();

      // [Tabs moved to /static/js/_detail/tab*.js]


      // [Tabs moved to /static/js/_detail/tab*.js]


      // [Tabs moved to /static/js/_detail/tab*.js]


      // [Tabs moved to /static/js/_detail/tab*.js]


      // Add row
      var addBtn = document.getElementById('mt-row-add');
      if(addBtn){
        addBtn.addEventListener('click', function(){
          var tbody = table.querySelector('tbody'); if(!tbody) return;
          var tr = document.createElement('tr');
          tr.innerHTML = `
            <td><input type="checkbox" class="mt-row-check" aria-label="행 선택"></td>
            <td data-col="status">
              <select>
                <option value="" selected disabled>선택</option>
                <option value="유지">유지</option>
                <option value="종료">종료</option>
                <option value="예정">예정</option>
              </select>
            </td>
            <td data-col="name"><input type="text" placeholder="계약명"></td>
            <td data-col="code"><input type="text" placeholder="관리번호"></td>
            <td data-col="vendor"><input type="text" placeholder="유지보수사"></td>
                <td data-col="start"><input type="text" class="date-input" placeholder="YYYY-MM-DD"></td>
                <td data-col="end"><input type="text" class="date-input" placeholder="YYYY-MM-DD"></td>
            <td data-col="rate"><input type="text" class="rate-input" placeholder="요율 %"></td>
            <td data-col="amount"><input type="text" class="amount-input" placeholder="금액"></td>
            <td class="system-actions table-actions">
              <button class="action-btn js-mt-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button>
              <button class="action-btn danger js-mt-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>
            </td>`;
          tbody.appendChild(tr);
          // jump to last page and render
          mtState.page = mtPages();
          mtRenderPage();
              try{ if(window.__blsInitDatePickers) window.__blsInitDatePickers(tr); }catch(_){}
          wireMtFormatters(tr);
        });
      }

      // Delegate actions
      table.addEventListener('click', function(ev){
        var target = ev.target.closest('.js-mt-del, .js-mt-edit, .js-mt-commit, .js-mt-toggle'); if(!target) return;
        var tr = ev.target.closest('tr'); if(!tr) return;

        // delete
        if(target.classList.contains('js-mt-del')){
          if(tr && tr.parentNode){ tr.parentNode.removeChild(tr); }
          updateEmptyState();
          return;
        }

        // edit -> save
        if(
          target.classList.contains('js-mt-edit') ||
          (target.classList.contains('js-mt-toggle') && target.getAttribute('data-action') === 'edit')
        ){
          function toInput(name, placeholder){
            var td = tr.querySelector('[data-col="'+name+'"]'); if(!td) return;
            var current = (td.textContent||'').trim();
            if(name==='status'){
              var sv = current; if(sv==='-') sv='';
              var sopts = ['<option value=""'+(sv?'':' selected')+' disabled>선택</option>',
                '<option value="유지"'+(sv==='유지'?' selected':'')+'>유지</option>',
                '<option value="종료"'+(sv==='종료'?' selected':'')+'>종료</option>',
                '<option value="예정"'+(sv==='예정'?' selected':'')+'>예정</option>'].join('');
              td.innerHTML = '<select>'+sopts+'</select>';
              return;
            }
            if(name==='start' || name==='end'){
              var v = (current==='-'? '' : current);
              td.innerHTML = '<input type="text" class="date-input" value="'+v+'" placeholder="YYYY-MM-DD">';
              return;
            }
            if(name==='rate'){
              var rd = (current==='-'? '' : String(current||'').replace(/\D/g,''));
              var rv = rd ? (rd+'%') : '';
              td.innerHTML = '<input type="text" class="rate-input" value="'+rv+'" placeholder="요율 %">';
              return;
            }
            if(name==='amount'){
              var ad = (current==='-'? '' : String(current||'').replace(/\D/g,''));
              var av = ad ? (formatNumberLocale(ad)+'원') : '';
              td.innerHTML = '<input type="text" class="amount-input" value="'+av+'" placeholder="금액">';
              return;
            }
            td.innerHTML = '<input type="text" value="'+current+'" placeholder="'+(placeholder||'')+'">';
          }
          ['status','name','code','vendor','start','end','rate','amount'].forEach(function(n){ toInput(n); });
          try{ if(window.__blsInitDatePickers) window.__blsInitDatePickers(tr); }catch(_){ }
          wireMtFormatters(tr);
          var toggleBtn = tr.querySelector('.js-mt-toggle');
          if(toggleBtn){
            toggleBtn.setAttribute('data-action','save');
            toggleBtn.title='저장'; toggleBtn.setAttribute('aria-label','저장');
            toggleBtn.innerHTML='<img src="/static/image/svg/save.svg" alt="저장" class="action-icon">';
              if(isSystemRow(tr)) hwEnsureSystemActionPlaceholder(tr, false);
          } else {
            var actions = tr.querySelector('.table-actions');
            if(actions){ actions.classList.add('system-actions'); actions.innerHTML = '<button class="action-btn js-mt-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button> <button class="action-btn danger js-mt-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'; }
          }
          return;
        }

        // save -> view
        if(
          target.classList.contains('js-mt-commit') ||
          (target.classList.contains('js-mt-toggle') && target.getAttribute('data-action') === 'save')
        ){
          function getInput(name){ var td = tr.querySelector('[data-col="'+name+'"]'); return td? td.querySelector('input, select'): null; }
          function setError(input, on){ if(!input) return; if(on){ input.classList.add('input-error'); input.setAttribute('aria-invalid','true'); } else { input.classList.remove('input-error'); input.removeAttribute('aria-invalid'); } }
          var firstInvalid=null;
          var nameInp = getInput('name'); var nameVal = (nameInp? nameInp.value : (tr.querySelector('[data-col="name"]').textContent||'')).trim();
          if(!nameVal){ setError(nameInp,true); if(!firstInvalid) firstInvalid=nameInp; } else { setError(nameInp,false); }
          var vendorInp = getInput('vendor'); var vendorVal = (vendorInp? vendorInp.value : (tr.querySelector('[data-col="vendor"]').textContent||'')).trim();
          if(!vendorVal){ setError(vendorInp,true); if(!firstInvalid) firstInvalid=vendorInp; } else { setError(vendorInp,false); }
          if(firstInvalid){ try{ firstInvalid.focus(); }catch(_){} return; }

          function commit(name, val){ var td = tr.querySelector('[data-col="'+name+'"]'); if(!td) return; td.textContent = (val === '' || val == null)? '-' : String(val); }
          function read(name){ var inp = getInput(name); var v = (inp? inp.value : (tr.querySelector('[data-col="'+name+'"]').textContent||'')); return String(v).trim(); }
          commit('status', read('status'));
          commit('name', nameVal);
          commit('code', read('code'));
          commit('vendor', vendorVal);
          commit('start', read('start'));
          commit('end', read('end'));
          // normalize rate (digits only + %)
          (function(){ var v = read('rate'); var d = String(v||'').replace(/\D/g,''); commit('rate', d ? (d+'%') : ''); })();
          // normalize amount (digits only + thousands + 원)
          (function(){ var v = read('amount'); var d = String(v||'').replace(/\D/g,''); commit('amount', d ? (formatNumberLocale(d)+'원') : ''); })();

          var toggleBtn = tr.querySelector('.js-mt-toggle');
          if(toggleBtn){
            toggleBtn.setAttribute('data-action','edit');
            toggleBtn.title='편집'; toggleBtn.setAttribute('aria-label','편집');
            toggleBtn.innerHTML='<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon">';
            if(isSystemRow(tr)) hwEnsureSystemActionPlaceholder(tr, false);
          } else {
            var actions = tr.querySelector('.table-actions');
            if(actions){ actions.classList.add('system-actions'); actions.innerHTML = '<button class="action-btn js-mt-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button> <button class="action-btn danger js-mt-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'; }
          }
          updateEmptyState();
          return;
        }
      });
    })();

      // [Tabs moved to /static/js/_detail/tab*.js]


      // [Tabs moved to /static/js/_detail/tab*.js]


    // [Removed legacy Change Log implementation]

});

  // No modal APIs to expose
})();

}

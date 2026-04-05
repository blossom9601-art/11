// 2.ap_detail_clean.js: AP detail controller (common header + basic-info only)
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
      var id = row && (row.asset_id != null ? row.asset_id : row.id);
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
      var q = (params.get('asset_id') || params.get('assetId') || params.get('id') || '').trim();
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
    var workStatusCode = _pickFirst(it, ['work_status_code']);
    var workStatusName = _pickFirst(it, ['work_status_name']);
    var workTypeCode = _pickFirst(it, ['work_type_code']);
    var workTypeName = _pickFirst(it, ['work_type_name']);
    var workCategoryCode = _pickFirst(it, ['work_category_code']);
    var workCategoryName = _pickFirst(it, ['work_category_name','work_division_name']);
    var workOperationCode = _pickFirst(it, ['work_operation_code','operation_code','work_operation']);
    var workOperationName = _pickFirst(it, ['work_operation_name']);
    var workGroupCode = _pickFirst(it, ['work_group_code']);
    var workGroupName = _pickFirst(it, ['work_group_name']);
    var manufacturerCode = _pickFirst(it, ['manufacturer_code']);
    var manufacturerName = _pickFirst(it, ['manufacturer_name']);
    var modelCode = _pickFirst(it, ['server_code','network_code']);
    var modelName = _pickFirst(it, ['server_model_name']);

    var centerCode = _pickFirst(it, ['center_code','location_place']);
    var centerName = _pickFirst(it, ['center_name']);
    var rackCode = _pickFirst(it, ['rack_code','location_pos']);
    var rackName = _pickFirst(it, ['rack_name']);

    var systemDeptCode = _pickFirst(it, ['system_dept_code','sys_dept_code','system_department','sys_dept']);
    var systemDeptName = _pickFirst(it, ['system_dept_name']);
    var systemOwnerEmpNo = _pickFirst(it, ['system_owner_emp_no','sys_owner_emp_no','system_owner','sys_owner']);
    var systemOwnerName = _pickFirst(it, ['system_owner_name']);
    var serviceDeptCode = _pickFirst(it, ['service_dept_code','svc_dept_code','service_department','svc_dept']);
    var serviceDeptName = _pickFirst(it, ['service_dept_name']);
    var serviceOwnerEmpNo = _pickFirst(it, ['service_owner_emp_no','svc_owner_emp_no','service_owner','svc_owner']);
    var serviceOwnerName = _pickFirst(it, ['service_owner_name']);
    return {
      id: _pickFirst(it, ['asset_id','id']),
      asset_id: _pickFirst(it, ['asset_id','id']),
      work_status_code: workStatusCode,
      work_status_name: workStatusName,
      work_status: workStatusName || _pickFirst(it, ['work_status','work_status_code']),

      work_type_code: workTypeCode,
      work_type_name: workTypeName,
      work_type: workTypeName || _pickFirst(it, ['work_type','work_type_code','work_category_code']),

      work_category_code: workCategoryCode,
      work_category_name: workCategoryName,
      work_category: workCategoryName || _pickFirst(it, ['work_category','work_category_code','work_division_code']),

      work_operation_code: workOperationCode,
      work_operation_name: workOperationName,
      work_operation: workOperationName || _pickFirst(it, ['work_operation','work_operation_code','operation_code']),

      work_group_code: workGroupCode,
      work_group_name: workGroupName,
      work_group: workGroupName || _pickFirst(it, ['work_group','work_group_code','group_code']),

      work_name: _pickFirst(it, ['work_name']),
      system_name: _pickFirst(it, ['system_name']),
      system_ip: _pickFirst(it, ['system_ip']),
      manage_ip: _pickFirst(it, ['mgmt_ip','manage_ip']),

      vendor_code: manufacturerCode || _pickFirst(it, ['vendor']),
      vendor_name: manufacturerName,
      vendor: manufacturerName || _pickFirst(it, ['vendor','manufacturer_code']),

      model_code: modelCode || _pickFirst(it, ['model']),
      model_name: modelName,
      model: modelName || _pickFirst(it, ['model','server_code','network_code']),

      serial: _pickFirst(it, ['serial_number','serial']),
      virtualization: _pickFirst(it, ['virtualization_type','virtualization']),
      location_place_code: centerCode,
      location_place_name: centerName,
      location_place: centerName || _pickFirst(it, ['location_place','center_name','center_code']),
      location_pos_code: rackCode,
      location_pos_name: rackName,
      location_pos: rackName || _pickFirst(it, ['location_pos','rack_name','rack_code']),
      slot: _pickFirst(it, ['slot','system_slot']),
      u_size: _pickFirst(it, ['u_size','system_size']),
      sys_dept_code: systemDeptCode,
      sys_dept_name: systemDeptName,
      sys_dept: systemDeptName || _pickFirst(it, ['sys_dept','system_dept_name','system_dept_code','system_department']),
      sys_owner_emp_no: systemOwnerEmpNo,
      sys_owner_name: systemOwnerName,
      sys_owner: systemOwnerName || _pickFirst(it, ['sys_owner','system_owner_name','system_owner_emp_no','system_owner']),
      svc_dept_code: serviceDeptCode,
      svc_dept_name: serviceDeptName,
      svc_dept: serviceDeptName || _pickFirst(it, ['svc_dept','service_dept_name','service_dept_code','service_department']),
      svc_owner_emp_no: serviceOwnerEmpNo,
      svc_owner_name: serviceOwnerName,
      svc_owner: serviceOwnerName || _pickFirst(it, ['svc_owner','service_owner_name','service_owner_emp_no','service_owner']),
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

    // Compatibility: legacy keys (work_name/system_name)
    try{
      function getCompat(kind){
        var keys = [
          HEADER_PREFIX + ':selected:' + kind,
          HEADER_PREFIX + ':selected:' + kind + '_name'
        ];
        for(var i=0;i<keys.length;i+=1){
          try{
            var v = sessionStorage.getItem(keys[i]) || localStorage.getItem(keys[i]) || '';
            if(String(v||'').trim()) return String(v).trim();
          }catch(_){ }
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
        try{ sessionStorage.setItem(HEADER_PREFIX + ':selected:work', work); }catch(_e0){ }
        try{ localStorage.setItem(HEADER_PREFIX + ':selected:work', work); }catch(_e1){ }
      }
      if(system){
        try{ sessionStorage.setItem(HEADER_PREFIX + ':selected:system', system); }catch(_e2){ }
        try{ localStorage.setItem(HEADER_PREFIX + ':selected:system', system); }catch(_e3){ }
      }
    }catch(_eCompat){ }
  }

  function buildEditFormFromRow(row){
    var form = byId(EDIT_FORM_ID);
    if(!form) return;
    var data = normalizeFromApi(row || getSelectedRow() || {});

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

      // FK fields should be dropdowns (searchable) like L2 baseline.
      // (If rendered as <input>, BlossomFkSelect intentionally avoids converting `model` on HW pages.)
      var fkCols = ['work_status','work_type','work_category','work_operation','work_group','vendor','model','location_place','location_pos','sys_dept','sys_owner','svc_dept','svc_owner'];
      if(fkCols.indexOf(col) > -1){
        var metaFk = COLUMN_META[col] || { label: col };
        var ph = (metaFk.label ? (metaFk.label + ' 선택') : '선택');
        function fkLabel(colName, codeVal){
          try{
            if(codeVal == null || String(codeVal).trim() === '') return '';
            var fallback = String(codeVal);
            var m = {
              work_status: data.work_status_name || data.work_status,
              work_type: data.work_type_name || data.work_type,
              work_category: data.work_category_name || data.work_category,
              work_operation: data.work_operation_name || data.work_operation,
              work_group: data.work_group_name || data.work_group,
              vendor: data.vendor_name || data.vendor,
              model: data.model_name || data.model,
              location_place: data.location_place_name || data.location_place,
              location_pos: data.location_pos_name || data.location_pos,
              sys_dept: data.sys_dept_name || data.sys_dept,
              sys_owner: data.sys_owner_name || data.sys_owner,
              svc_dept: data.svc_dept_name || data.svc_dept,
              svc_owner: data.svc_owner_name || data.svc_owner
            };
            var label = m[colName];
            label = (label == null) ? '' : String(label).trim();
            if(!label) return fallback;
            return label;
          }catch(_e){
            return String(codeVal);
          }
        }
        var curLabel = fkLabel(col, v);
        var currentOpt = v ? ('<option value="'+esc(v)+'" selected>'+esc(curLabel)+'</option>') : '';
        return '<select name="'+col+'" class="form-input search-select" data-searchable="true" data-searchable-scope="modal">'
          + '<option value="">'+esc(ph)+'</option>'
          + currentOpt
        + '</select>';
      }

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
      if(col === 'slot' || col === 'u_size'){
        return '<input name="'+col+'" type="number" min="0" step="1" class="form-input" value="'+esc(v)+'">';
      }
      return '<input name="'+col+'" class="form-input" value="'+esc(v)+'">';
    }

    var GROUPS = [
      { title:'비즈니스', cols:['work_status','work_type','work_category','work_operation','work_group','work_name','system_name','system_ip','manage_ip'] },
      { title:'시스템', cols:['vendor','model','serial','virtualization','location_place','location_pos','slot','u_size'] },
      { title:'담당자', cols:['sys_dept','sys_owner','svc_dept','svc_owner'] },
      { title:'점검', cols:['confidentiality','integrity','availability','security_score','system_grade','core_flag','dr_built','svc_redundancy'] }
    ];

    var html = GROUPS.map(function(g){
      var grid = g.cols.map(function(c){
        var meta = COLUMN_META[c] || { label: c };
        var v = data[c];
        if(c === 'work_status' && data.work_status_code) v = data.work_status_code;
        if(c === 'work_type' && data.work_type_code) v = data.work_type_code;
        if(c === 'work_category' && data.work_category_code) v = data.work_category_code;
        if(c === 'work_operation' && data.work_operation_code) v = data.work_operation_code;
        if(c === 'work_group' && data.work_group_code) v = data.work_group_code;
        if(c === 'vendor' && data.vendor_code) v = data.vendor_code;
        if(c === 'model' && data.model_code) v = data.model_code;
        if(c === 'location_place' && data.location_place_code) v = data.location_place_code;
        if(c === 'location_pos' && data.location_pos_code) v = data.location_pos_code;
        if(c === 'sys_dept' && data.sys_dept_code) v = data.sys_dept_code;
        if(c === 'sys_owner' && data.sys_owner_emp_no) v = data.sys_owner_emp_no;
        if(c === 'svc_dept' && data.svc_dept_code) v = data.svc_dept_code;
        if(c === 'svc_owner' && data.svc_owner_emp_no) v = data.svc_owner_emp_no;
        return '<div class="form-row"><label>'+esc(meta.label)+'</label>'+fieldInput(c, v)+'</div>';
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

    function setFkField(payload, key, fieldName){
      var node = el(fieldName);
      try{
        if(node && node.dataset && node.dataset._fkInvalid === '1') return;
      }catch(_e){}
      setField(payload, key, readValue(node));
    }

    var payload = {};
    setFkField(payload, 'work_type', 'work_type');
    setFkField(payload, 'work_category', 'work_category');
    setFkField(payload, 'work_status', 'work_status');
    setFkField(payload, 'work_operation', 'work_operation');
    setFkField(payload, 'work_group', 'work_group');
    setField(payload, 'work_name', vRaw('work_name'));
    setField(payload, 'system_name', vRaw('system_name'));
    setField(payload, 'system_ip', vRaw('system_ip'));
    setField(payload, 'mgmt_ip', vRaw('manage_ip'));
    setFkField(payload, 'vendor', 'vendor');
    setFkField(payload, 'model', 'model');
    setField(payload, 'serial', vRaw('serial'));
    setField(payload, 'virtualization_type', vRaw('virtualization'));
    setFkField(payload, 'center_code', 'location_place');
    setFkField(payload, 'rack_code', 'location_pos');
    setField(payload, 'slot', vRaw('slot'));
    setField(payload, 'u_size', vRaw('u_size'));
    setFkField(payload, 'system_department', 'sys_dept');
    setFkField(payload, 'system_owner', 'sys_owner');
    setFkField(payload, 'service_department', 'svc_dept');
    setFkField(payload, 'service_owner', 'svc_owner');
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
    var currentAssetId = resolveAssetId();

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

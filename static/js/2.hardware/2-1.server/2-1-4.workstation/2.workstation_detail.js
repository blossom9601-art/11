// onpremise_detail.js: On-premise Server Detail page behaviors (modal removed)

(function(){
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

  // Basic Info edit modal element IDs + API base
  // (This file wires a shared edit modal; define IDs here to avoid ReferenceError.)
  var STORAGE_PREFIX = 'workstation';
  var EDIT_OPEN_ID = 'detail-edit-open';
  var EDIT_MODAL_ID = 'system-edit-modal';
  var EDIT_FORM_ID = 'system-edit-form';
  var EDIT_SAVE_ID = 'system-edit-save';
  var EDIT_CLOSE_ID = 'system-edit-close';
  var ASSET_API_BASE = '/api/hardware/workstation/assets';

  function fetchJSON(url, opts){
    try{
      if(window.BlossomHardwareDetail && typeof window.BlossomHardwareDetail.fetchJSON === 'function'){
        return window.BlossomHardwareDetail.fetchJSON(url, opts);
      }
    }catch(_e0){ }

    var options = opts ? Object.assign({}, opts) : {};
    options.headers = Object.assign({ 'Accept':'application/json' }, options.headers || {});
    if(!options.credentials) options.credentials = 'same-origin';

    var method = (options.method || 'GET').toUpperCase();
    if(method !== 'GET' && !options.headers['Content-Type'] && !options.headers['content-type']){
      options.headers['Content-Type'] = 'application/json';
    }

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

  document.addEventListener('DOMContentLoaded', function(){
    // __WORKSTATION_DETAIL_HELPERS__
    function escapeAttr(v){
      return String(v == null ? '' : v)
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;')
        .replace(/'/g,'&#39;');
    }
    function escapeHtml(v){
      return String(v == null ? '' : v)
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;')
        .replace(/'/g,'&#39;');
    }
    function toast(msg, level){
      try{
        if(typeof window !== 'undefined' && typeof window.showToast === 'function'){
          window.showToast(String(msg || ''), level || 'info');
          return;
        }
      }catch(_){ }
      try{ alert(String(msg || '')); }catch(_){ }
    }

    // Initialize page header + selection context (list -> detail propagation)
    try{
      var params = new URLSearchParams(window.location.search || '');
      var work = params.get('work');
      var system = params.get('system');
      var assetId = params.get('asset_id') || params.get('assetId') || params.get('id');

      if(work || system){
        try{
          if(work != null) sessionStorage.setItem('workstation:selected:work_name', work);
          if(system != null) sessionStorage.setItem('workstation:selected:system_name', system);
        }catch(_e){ }
      }
      if(assetId){
        try{ sessionStorage.setItem('workstation:selected:asset_id', String(assetId)); }catch(_e0){ }
        try{ localStorage.setItem('workstation:selected:asset_id', String(assetId)); }catch(_e1){ }
      }

      if(!work){ try{ work = sessionStorage.getItem('workstation:selected:work_name') || '-'; }catch(_e2){ work='-'; } }
      if(!system){ try{ system = sessionStorage.getItem('workstation:selected:system_name') || '-'; }catch(_e3){ system='-'; } }

      var h1 = document.querySelector('.page-header h1');
      var p = document.querySelector('.page-header p');
      if(h1) h1.textContent = String(work || '-');
      if(p) p.textContent = String(system || '-');

      // Strip sensitive legacy query params from the address bar.
      try{
        if(params && (params.has('work') || params.has('system') || params.has('asset_id') || params.has('assetId') || params.has('id') || params.has('asset_scope'))){
          ['work','system','asset_id','assetId','id','asset_scope'].forEach(function(k){ try{ params.delete(k); }catch(_){ } });
          var qs = params.toString();
          history.replaceState({}, '', location.pathname + (qs ? ('?' + qs) : '') + location.hash);
        }
      }catch(_stripErr){ /* no-op */ }
    }catch(_){ /* no-op */ }

    function getSelectedRow(){
      try{
        var raw = sessionStorage.getItem('workstation:selected:row');
        if(raw) return JSON.parse(raw);
      }catch(_e){ }
      try{
        var raw2 = localStorage.getItem('workstation:selected:row');
        if(raw2) return JSON.parse(raw2);
      }catch(_e2){ }
      return null;
    }

    // Column labels for modal rendering (avoid ReferenceError when shared meta is absent)
    var COLUMN_META = {
      work_status:{label:'업무 상태'},
      work_type:{label:'업무 분류'},
      work_category:{label:'업무 구분'},
      work_operation:{label:'업무 운영'},
      work_group:{label:'업무 그룹'},
      work_name:{label:'업무 이름'},
      system_name:{label:'시스템 이름'},
      system_ip:{label:'시스템 IP'},
      manage_ip:{label:'관리 IP'},
      vendor:{label:'시스템 제조사'},
      model:{label:'시스템 모델명'},
      serial:{label:'시스템 일련번호'},
      virtualization:{label:'시스템 가상화'},
      location_place:{label:'시스템 장소'},
      location_pos:{label:'시스템 위치'},
      slot:{label:'시스템 슬롯'},
      u_size:{label:'시스템 크기'},
      sys_dept:{label:'시스템 담당부서'},
      sys_owner:{label:'시스템 담당자'},
      svc_dept:{label:'서비스 담당부서'},
      svc_owner:{label:'서비스 담당자'},
      confidentiality:{label:'기밀성'},
      integrity:{label:'무결성'},
      availability:{label:'가용성'},
      security_score:{label:'보안 점수'},
      system_grade:{label:'시스템 등급'},
      core_flag:{label:'핵심/일반'},
      dr_built:{label:'DR 구축여부'},
      svc_redundancy:{label:'서비스 이중화'}
    };

    // FK columns in the edit modal (hydrated by global BlossomFkSelect)
    var FK_COLS = [
      'work_status','work_type','work_category','work_operation','work_group',
      'vendor','model','location_place','location_pos',
      'sys_dept','sys_owner','svc_dept','svc_owner'
    ];

    // Form-field -> API payload mapping (aligned with other server detail pages)
    var FIELD_TO_PAYLOAD_KEY = {
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
      slot: 'slot',
      u_size: 'u_size',
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

    var NUMERIC_PAYLOAD_KEYS = {
      slot: 1,
      u_size: 1,
      cia_confidentiality: 1,
      cia_integrity: 1,
      cia_availability: 1,
      security_score: 1
    };

    function getSelectedAssetId(){
      try{
        var row = getSelectedRow();
        var rid = row && row.id;
        var n = parseInt(rid, 10);
        if(!isNaN(n) && n > 0) return n;
      }catch(_e){ }
      try{
        var v = sessionStorage.getItem('workstation:selected:asset_id');
        var n2 = parseInt(String(v || ''), 10);
        if(!isNaN(n2) && n2 > 0) return n2;
      }catch(_e2){ }
      try{
        var params = new URLSearchParams(window.location.search || '');
        var id = parseInt(params.get('id') || '', 10);
        if(!isNaN(id) && id > 0) return id;
      }catch(_e3){ }
      return null;
    }

    // ===== Basic Info rendering (page cards) =====
    function coerceDisplayValue(value){
      if(value === 0) return '0';
      if(value == null) return '';
      return String(value).trim();
    }

    function normalizeVirtualizationLabel(value){
      var raw = (value == null) ? '' : String(value).trim();
      if(!raw) return '-';
      if(raw === '물리' || raw === '물리서버' || raw.toLowerCase() === 'physical' || raw.toUpperCase() === 'PHYSICAL') return '물리서버';
      if(raw === '가상' || raw === '가상서버' || raw.toLowerCase() === 'virtual' || raw.toUpperCase() === 'VIRTUAL') return '가상서버';
      if(raw === '클라우드' || raw.toLowerCase() === 'cloud') return '클라우드';
      if(raw.toUpperCase().indexOf('VIR') === 0) return '가상서버';
      if(raw.toUpperCase().indexOf('PHY') === 0) return '물리서버';
      return raw;
    }

    function setSelectedRow(row){
      try{ sessionStorage.setItem('workstation:selected:row', JSON.stringify(row || {})); }catch(_e0){ }
      try{ localStorage.setItem('workstation:selected:row', JSON.stringify(row || {})); }catch(_e1){ }
      try{
        var id = row && (row.asset_id != null ? row.asset_id : row.id);
        if(id != null && String(id).trim() !== ''){
          sessionStorage.setItem('workstation:selected:asset_id', String(id));
          localStorage.setItem('workstation:selected:asset_id', String(id));
        }
      }catch(_e2){ }
      // Persist key fields for cross-tab usage (hardware tab system row)
      try{
        if(row){
          localStorage.setItem('workstation:current:model',  String(row.server_model_name || row.model || ''));
          localStorage.setItem('workstation:current:vendor', String(row.manufacturer_name || row.vendor || ''));
          localStorage.setItem('workstation:current:serial', String(row.serial || row.serial_number || ''));
          localStorage.setItem('workstation:current:fw',     String(row.fw || row.firmware || ''));
        }
      }catch(_eCache){ }
    }

    function setBasicInfoValueByLabel(labelText, value){
      try{
        var v = coerceDisplayValue(value);
        if(!v) v = '-';
        var rows = document.querySelectorAll('.basic-info-grid .info-row');
        for(var i=0;i<rows.length;i++){
          var row = rows[i];
          var lab = row.querySelector('label');
          var labText = (lab && lab.textContent ? lab.textContent.trim() : '');
          if(labText !== String(labelText).trim()) continue;
          var target = row.querySelector('.info-value') || row.querySelector('.info-value') || row.querySelector('.status-pill .status-text');
          if(!target){
            var spans = row.querySelectorAll('span');
            if(spans && spans.length) target = spans[spans.length-1];
          }
          if(target) target.textContent = v;
          return;
        }
      }catch(_e){ }
    }

    function setNumBadgeByLabel(labelText, value){
      try{
        var v = coerceDisplayValue(value);
        var rows = document.querySelectorAll('.basic-info-grid .info-row');
        for(var i=0;i<rows.length;i++){
          var row = rows[i];
          var lab = row.querySelector('label');
          var labText = (lab && lab.textContent ? lab.textContent.trim() : '');
          if(labText !== String(labelText).trim()) continue;
          var badge = row.querySelector('.num-badge');
          if(!badge) return;
          if(!v || v === '-'){
            badge.textContent = '';
            badge.classList.remove('tone-1','tone-2','tone-3');
            return;
          }
          var s = String(v).trim();
          var n = parseInt(s, 10);
          badge.classList.remove('tone-1','tone-2','tone-3');
          if(isNaN(n)){
            badge.textContent = s ? s : '';
            return;
          }
          badge.textContent = String(n);
          if(labelText === '보안 점수') badge.classList.add(n >= 8 ? 'tone-3' : (n >= 6 ? 'tone-2' : 'tone-1'));
          else badge.classList.add(n >= 3 ? 'tone-3' : (n === 2 ? 'tone-2' : 'tone-1'));
          return;
        }
      }catch(_e){ }
    }

    function setOxByLabel(labelText, value){
      try{
        var v = coerceDisplayValue(value);
        var rows = document.querySelectorAll('.basic-info-grid .info-row');
        for(var i=0;i<rows.length;i++){
          var row = rows[i];
          var lab = row.querySelector('label');
          var labText = (lab && lab.textContent ? lab.textContent.trim() : '');
          if(labText !== String(labelText).trim()) continue;
          var badge = row.querySelector('.ox-badge');
          if(!badge) return;
          if(!v || v === '-'){
            badge.textContent = '';
            badge.setAttribute('aria-label','');
            badge.classList.remove('on','off');
            return;
          }
          var s = String(v).trim().toUpperCase();
          if(s !== 'O' && s !== 'X'){
            badge.textContent = '';
            badge.setAttribute('aria-label','');
            badge.classList.remove('on','off');
            return;
          }
          badge.textContent = s;
          badge.setAttribute('aria-label', s);
          badge.classList.remove('on','off');
          badge.classList.add(s === 'O' ? 'on' : 'off');
          return;
        }
      }catch(_e){ }
    }

    function applyWorkStatusPillStyle(workStatusText, opts, pillEl){
      try{
        var v = (workStatusText == null) ? '' : String(workStatusText).trim();
        var pill = pillEl || document.querySelector('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill');
        if(!pill) return;
        var textEl = pill.querySelector('.status-text');
        var dot = pill.querySelector('.status-dot');
        if(textEl) textEl.textContent = v ? v : '-';

        function normalizeHex(hex){
          if(!hex) return '';
          var h = String(hex).trim();
          if(!h) return '';
          if(h[0] !== '#') h = '#' + h;
          if(h.length === 4){
            h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
          }
          if(!/^#[0-9a-fA-F]{6}$/.test(h)) return '';
          return h;
        }
        function hexToRgbArray(hex){
          var h = normalizeHex(hex);
          if(!h) return null;
          var r = parseInt(h.slice(1,3), 16);
          var g = parseInt(h.slice(3,5), 16);
          var b = parseInt(h.slice(5,7), 16);
          if([r,g,b].some(function(x){ return isNaN(x); })) return null;
          return [r,g,b];
        }

        pill.classList.remove('colored');
        try{ pill.style.removeProperty('--status-dot-color'); }catch(_){ }
        try{ pill.style.removeProperty('--status-bg-color'); }catch(_){ }
        try{ pill.style.removeProperty('--status-border-color'); }catch(_){ }

        if(dot){
          var remove = [];
          for(var j=0;j<dot.classList.length;j++){
            var c = dot.classList[j];
            if(c && c.indexOf('ws-') === 0) remove.push(c);
          }
          for(var k=0;k<remove.length;k++) dot.classList.remove(remove[k]);
        }

        var customColor = opts && opts.color ? normalizeHex(opts.color) : '';
        var tokenClass = opts && opts.token ? String(opts.token).trim() : '';
        if(!tokenClass && opts && opts.color){
          var maybeToken = String(opts.color).trim();
          if(maybeToken && maybeToken.indexOf('ws-') === 0) tokenClass = maybeToken;
        }

        if(dot && customColor){
          pill.classList.add('colored');
          pill.style.setProperty('--status-dot-color', customColor);
          var rgb = hexToRgbArray(customColor);
          if(rgb){
            pill.style.setProperty('--status-bg-color', 'rgba(' + rgb.join(',') + ',0.16)');
            pill.style.setProperty('--status-border-color', 'rgba(' + rgb.join(',') + ',0.45)');
          }
        } else if(dot){
          var cls = tokenClass || ((v === '가동') ? 'ws-run' : (v === '유휴' ? 'ws-idle' : 'ws-wait'));
          dot.classList.add(cls || 'ws-wait');
        }
      }catch(_e){ }
    }

    function setStatusByLabel(labelText, value, opts){
      try{
        var rows = document.querySelectorAll('.basic-info-grid .info-row');
        for(var i=0;i<rows.length;i++){
          var row = rows[i];
          var lab = row.querySelector('label');
          var labText = (lab && lab.textContent ? lab.textContent.trim() : '');
          if(labText !== String(labelText).trim()) continue;
          var pill = row.querySelector('.status-pill');
          if(pill) applyWorkStatusPillStyle(value, opts, pill);
          else setBasicInfoValueByLabel(labelText, value);
          return;
        }
      }catch(_e){ }
    }

    function applyRowToBasicInfo(row){
      try{
        if(!row) return;
        var mapping = {
          '업무 상태': 'work_status',
          '업무 분류': 'work_type',
          '업무 구분': 'work_category',
          '업무 운영': 'work_operation',
          '업무 그룹': 'work_group',
          '업무 이름': 'work_name',
          '시스템 이름': 'system_name',
          '시스템 IP': 'system_ip',
          '관리 IP': 'manage_ip',
          '시스템 제조사': 'vendor',
          '시스템 모델명': 'model',
          '시스템 일련번호': 'serial',
          '시스템 가상화': 'virtualization',
          '시스템 장소': 'location_place',
          '시스템 위치': 'location_pos',
          '시스템 슬롯': 'slot',
          '시스템 크기': 'u_size',
          '시스템 담당부서': 'sys_dept',
          '시스템 담당자': 'sys_owner',
          '서비스 담당부서': 'svc_dept',
          '서비스 담당자': 'svc_owner',
          '기밀성': 'confidentiality',
          '무결성': 'integrity',
          '가용성': 'availability',
          '보안 점수': 'security_score',
          '시스템 등급': 'system_grade',
          '핵심/일반': 'core_flag',
          'DR 구축여부': 'dr_built',
          '서비스 이중화': 'svc_redundancy'
        };
        Object.keys(mapping).forEach(function(label){
          var key = mapping[label];
          var val = row[key];
          if(label === '업무 상태') return setStatusByLabel(label, val, { color: row.work_status_color, token: (row.work_status_token || row.work_status_color) });
          if(label === '기밀성' || label === '무결성' || label === '가용성' || label === '보안 점수') return setNumBadgeByLabel(label, val);
          if(label === 'DR 구축여부' || label === '서비스 이중화') return setOxByLabel(label, val);
          setBasicInfoValueByLabel(label, val);
        });
      }catch(_e){ }
    }

    function normalizeAssetForDisplay(item){
      if(!item) return null;
      function label(name, code){
        var n = coerceDisplayValue(name);
        var c = coerceDisplayValue(code);
        return n || c || '-';
      }
      function yesNo(flag){
        if(flag == null) return '-';
        return flag ? 'O' : 'X';
      }
      function core(flag){
        if(flag == null) return '-';
        return flag ? '핵심' : '일반';
      }
      return {
        id: item.id,
        asset_id: item.id,
        work_type_code: coerceDisplayValue(item.work_type_code) || '',
        work_category_code: coerceDisplayValue(item.work_category_code) || '',
        work_status_code: coerceDisplayValue(item.work_status_code) || '',
        work_operation_code: coerceDisplayValue(item.work_operation_code) || '',
        work_group_code: coerceDisplayValue(item.work_group_code) || '',
        manufacturer_code: coerceDisplayValue(item.manufacturer_code) || '',
        server_code: coerceDisplayValue(item.server_code) || '',
        center_code: coerceDisplayValue(item.center_code) || '',
        rack_code: coerceDisplayValue(item.rack_code) || '',
        system_dept_code: coerceDisplayValue(item.system_dept_code) || '',
        service_dept_code: coerceDisplayValue(item.service_dept_code) || '',
        system_owner_emp_no: coerceDisplayValue(item.system_owner_emp_no) || '',
        service_owner_emp_no: coerceDisplayValue(item.service_owner_emp_no) || '',
        work_type: label(item.work_type_name, item.work_type_code),
        work_category: label(item.work_category_name, item.work_category_code),
        work_status: label(item.work_status_name, item.work_status_code),
        work_status_color: coerceDisplayValue(item.work_status_color),
        work_status_token: '',
        work_operation: label(item.work_operation_name, item.work_operation_code),
        work_group: label(item.work_group_name, item.work_group_code),
        work_name: coerceDisplayValue(item.work_name) || '-',
        system_name: coerceDisplayValue(item.system_name) || '-',
        system_ip: coerceDisplayValue(item.system_ip) || '-',
        mgmt_ip: coerceDisplayValue(item.mgmt_ip) || '',
        manage_ip: coerceDisplayValue(item.mgmt_ip) || '-',
        vendor: label(item.manufacturer_name, item.manufacturer_code),
        model: label(item.server_model_name, item.server_code),
        serial: (function(){
          var s = coerceDisplayValue(item.serial_number);
          if(!s) s = coerceDisplayValue(item.serial);
          return s || '-';
        })(),
        virtualization: normalizeVirtualizationLabel(item.virtualization_type),
        virtualization_raw: coerceDisplayValue(item.virtualization_type) || '',
        location_place: coerceDisplayValue(item.center_name) || '-',
        location_pos: coerceDisplayValue(item.rack_name) || '-',
        slot: (item.slot == null ? '-' : String(item.slot)),
        u_size: (item.u_size == null ? '-' : String(item.u_size)),
        sys_dept: label(item.system_dept_name, item.system_dept_code),
        sys_owner: label(item.system_owner_name || item.system_owner_display, item.system_owner_emp_no),
        svc_dept: label(item.service_dept_name, item.service_dept_code),
        svc_owner: label(item.service_owner_name || item.service_owner_display, item.service_owner_emp_no),
        confidentiality: (item.cia_confidentiality == null ? '' : String(item.cia_confidentiality)),
        integrity: (item.cia_integrity == null ? '' : String(item.cia_integrity)),
        availability: (item.cia_availability == null ? '' : String(item.cia_availability)),
        security_score: (item.security_score == null ? '' : String(item.security_score)),
        system_grade: coerceDisplayValue(item.system_grade) || '-',
        core_flag: core(item.is_core_system),
        is_core_system: item.is_core_system,
        dr_built: yesNo(item.has_dr_site),
        has_dr_site: item.has_dr_site,
        svc_redundancy: yesNo(item.has_service_ha),
        has_service_ha: item.has_service_ha
      };
    }

    // Init cards on page load (storage fast path + API authoritative refresh)
    (function initBasicInfoOnLoad(){
      try{
        var stored = getSelectedRow();
        if(stored){
          applyRowToBasicInfo(stored);
        }
      }catch(_e0){ }
      (async function(){
        try{
          var assetId = getSelectedAssetId();
          if(!assetId) return;
          var item = await apiGetAsset(assetId);
          var displayRow = normalizeAssetForDisplay(item);
          if(!displayRow) return;
          try{
            var h1 = document.querySelector('.page-header h1');
            var p = document.querySelector('.page-header p');
            if(h1) h1.textContent = displayRow.work_name || '-';
            if(p) p.textContent = displayRow.system_name || '-';
          }catch(_eH){ }
          applyRowToBasicInfo(displayRow);
          setSelectedRow(displayRow);
        }catch(_e1){ }
      })();
    })();

    function syncSearchableSelect(selectEl){
      try{
        if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function'){
          window.BlossomSearchableSelect.enhance(selectEl);
        }
      }catch(_e){ }
    }
    function applyUserOptionsToSelect(selectEl, records, currentValue, placeholderText){
      if(!selectEl) return;
      var cur = String(currentValue || '').trim();
      // If so, map it to the matching emp_no to avoid creating a duplicate fallback option.
      if(cur){
        try{
          var matchedEmp = '';
          (Array.isArray(records) ? records : []).some(function(item){
            var name = String((item && item.name) || '').trim();
            if(name && name === cur){
              matchedEmp = String((item && item.emp_no) || '').trim();
              return !!matchedEmp;
            }
            return false;
          });
          if(matchedEmp) cur = matchedEmp;
        }catch(_e){ }
      }
      var ph = String(placeholderText || '담당자 선택');
      // Keep searchable-select placeholder in sync with visible option text.
      try{ selectEl.setAttribute('data-placeholder', ph); }catch(_){ }
      try{ selectEl.dataset.placeholder = ph; }catch(_){ }

      var html = '<option value="">' + escapeHtml(ph) + '</option>';
      var seen = {};
      (Array.isArray(records) ? records : []).forEach(function(item){
        var emp = String((item && item.emp_no) || '').trim();
        if(!emp || seen[emp]) return;
        var name = String((item && item.name) || '').trim();
        var dept = String((item && (item.department || item.company)) || '').trim();
        var selected = (cur && emp === cur) ? ' selected' : '';
        html += '<option value="' + escapeAttr(emp) + '"' + selected + ' data-owner-name="' + escapeAttr(name) + '" data-owner-dept="' + escapeAttr(dept) + '" data-owner-emp="' + escapeAttr(emp) + '">' + escapeHtml(name || emp) + '</option>';
        seen[emp] = 1;
      });
      if(cur && !seen[cur]){
        html += '<option value="' + escapeAttr(cur) + '" selected>' + escapeHtml(cur) + '</option>';
      }
      selectEl.innerHTML = html;
    }
    function setupOwnerDependenciesForForm(formId){
      var form = document.getElementById(formId);
      if(!form) return;
      function bind(deptField, ownerField){
        var deptSel = form.querySelector('[name="' + deptField + '"]');
        var ownerSel = form.querySelector('[name="' + ownerField + '"]');
        if(!deptSel || !ownerSel) return;
        async function refresh(keepValue){
          var code = String(deptSel.value || '').trim();
          var deptName = '';
          try{ deptName = String((deptSel.selectedOptions && deptSel.selectedOptions[0] && deptSel.selectedOptions[0].textContent) || '').trim(); }catch(_){ deptName = ''; }
          // IMPORTANT: when dept is not selected (code empty), the selected option text
          // is usually a placeholder like "부서 선택". Treat that as empty to avoid
          // incorrectly enabling the owner select.
          if(!code){
            deptName = '';
          }
          var current = keepValue ? String(ownerSel.value || ownerSel.getAttribute('data-initial-value') || '').trim() : '';
          if(!code){
            // Force-clear owners when dept is missing (onpremise behavior)
            current = '';
            applyUserOptionsToSelect(ownerSel, [], current, '부서를 먼저 선택');
            ownerSel.value = '';
            ownerSel.removeAttribute('data-initial-value');
            ownerSel.disabled = true;
            ownerSel.classList.add('fk-disabled');
            try{
              if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function'){
                window.BlossomSearchableSelect.enhance(ownerSel);
              }
            }catch(_e0){}
            return;
          }
          ownerSel.disabled = false;
          ownerSel.classList.remove('fk-disabled');
          try{
            var users = await fetchUserProfilesByDepartment(deptName, code);
            applyUserOptionsToSelect(ownerSel, users, current, '담당자 선택');
            if(!keepValue) ownerSel.value = '';
            ownerSel.removeAttribute('data-initial-value');
            try{
              if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function'){
                window.BlossomSearchableSelect.enhance(ownerSel);
              }
            }catch(_e1){}
          }catch(_e){
            applyUserOptionsToSelect(ownerSel, [], current, '담당자 선택');
            try{
              if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function'){
                window.BlossomSearchableSelect.enhance(ownerSel);
              }
            }catch(_e2){}
          }
        }
        if(!deptSel.dataset.ownerDependencyBound){
          deptSel.addEventListener('change', function(){ refresh(false); });
          deptSel.dataset.ownerDependencyBound = '1';
        }
        refresh(true);
      }
      bind('sys_dept', 'sys_owner');
      bind('svc_dept', 'svc_owner');
    }

    function openModal(id){
      var el = document.getElementById(id);
      if(!el) return;
      document.body.classList.add('modal-open');
      el.classList.add('show');
      el.setAttribute('aria-hidden', 'false');
    }
    function closeModal(id){
      var el = document.getElementById(id);
      if(!el) return;
      el.classList.remove('show');
      el.setAttribute('aria-hidden', 'true');
      if(!document.querySelector('.modal-overlay-base.show, .server-add-modal.show, .server-edit-modal.show, .server-column-modal.show')){
        document.body.classList.remove('modal-open');
      }
    }

    function collectForm(form){
      var data = {};
      if(!form) return data;
      var els = form.querySelectorAll('input,select,textarea');
      for(var i=0;i<els.length;i++){
        var el = els[i];
        if(!el.name) continue;
        data[el.name] = String(el.value || '').trim();
      }
      // Attach owner display values (list page compatibility)
      ['sys_owner','svc_owner'].forEach(function(field){
        var select = form.querySelector('[name="' + field + '"]');
        if(!select) return;
        var opt = select.selectedOptions && select.selectedOptions[0];
        if(!opt) return;
        var displayName = String(opt.getAttribute('data-owner-name') || '').trim();
        if(displayName) data[field + '_display'] = displayName;
        var ownerEmp = String(opt.getAttribute('data-owner-emp') || '').trim();
        if(ownerEmp) data[field + '_emp_value'] = ownerEmp;
        var ownerDept = String(opt.getAttribute('data-owner-dept') || '').trim();
        if(ownerDept) data[field + '_dept_display'] = ownerDept;
      });
      return data;
    }

    function buildAssetPayload(formData, existingItem){
      var payload = { asset_category: 'SERVER', asset_type: 'WORKSTATION' };
      // Fields that should support "clear" (empty UI value should set API field to null)
      var CLEARABLE_FIELDS = {
        sys_dept:1, svc_dept:1, sys_owner:1, svc_owner:1,
        location_place:1, location_pos:1, vendor:1, model:1,
        // 점검(보안) 영역: clear 시 기존값 유지되지 않게 null 전송
        confidentiality:1, integrity:1, availability:1, security_score:1,
        system_grade:1, core_flag:1, dr_built:1, svc_redundancy:1
      };
      Object.keys(FIELD_TO_PAYLOAD_KEY).forEach(function(field){
        var payloadKey = FIELD_TO_PAYLOAD_KEY[field];
        var raw = formData[field];
        if(raw == null) return;
        if(raw === ''){
          if(CLEARABLE_FIELDS[field]) payload[payloadKey] = null;
          return;
        }
        var value = raw;
        if(NUMERIC_PAYLOAD_KEYS[payloadKey]){
          var n = parseInt(raw, 10);
          if(isNaN(n)) return;
          value = n;
        }
        payload[payloadKey] = value;
      });
      // Owner display: set string when present, else clear when owner was cleared
      if(formData.sys_owner && String(formData.sys_owner).trim() !== ''){
        if(formData.sys_owner_display) payload.system_owner_display = String(formData.sys_owner_display).trim();
      } else {
        payload.system_owner_display = null;
      }
      if(formData.svc_owner && String(formData.svc_owner).trim() !== ''){
        if(formData.svc_owner_display) payload.service_owner_display = String(formData.svc_owner_display).trim();
      } else {
        payload.service_owner_display = null;
      }

      // Cascade clear (onpremise behavior): clearing dept must also clear the owner.
      // This prevents stale owner values from surviving when dept is removed.
      var sysDeptRaw = (formData.sys_dept == null) ? null : String(formData.sys_dept).trim();
      if(sysDeptRaw === ''){
        payload.system_department = null;
        payload.system_owner = null;
        payload.system_owner_display = null;
      }
      var svcDeptRaw = (formData.svc_dept == null) ? null : String(formData.svc_dept).trim();
      if(svcDeptRaw === ''){
        payload.service_department = null;
        payload.service_owner = null;
        payload.service_owner_display = null;
      }

      // Cascade clear (요구사항): clearing center must also clear rack.
      var centerRaw = (formData.location_place == null) ? null : String(formData.location_place).trim();
      if(centerRaw === ''){
        payload.center_code = null;
        payload.rack_code = null;
      }

      // Cascade clear (요구사항): clearing vendor must also clear model.
      var vendorRaw = (formData.vendor == null) ? null : String(formData.vendor).trim();
      if(vendorRaw === ''){
        payload.vendor = null;
        payload.model = null;
      }
      // Keep asset_code/asset_name stable
      if(existingItem && existingItem.asset_code) payload.asset_code = existingItem.asset_code;
      if(existingItem && existingItem.asset_name) payload.asset_name = existingItem.asset_name;
      Object.keys(payload).forEach(function(k){
        if(payload[k] === '' || payload[k] === undefined) delete payload[k];
      });
      return payload;
    }

    function attachSecurityScoreRecalc(formId){
      var form = document.getElementById(formId);
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
        var el = form.querySelector('[name="' + n + '"]');
        if(el) el.addEventListener('change', recompute);
      });
      recompute();
    }

    function enforceVirtualizationDash(form){
      if(!form) return;
      var virt = form.querySelector('[name="virtualization"]');
      if(!virt) return;
      var v = String(virt.value || '').trim();
      var dashText = ['vendor','model','serial','location_pos'];
      var dashNum = ['slot','u_size','rack_face'];
      function setDash(el){
        if(!el) return;
        if(el.tagName === 'SELECT'){
          el.value = '';
        } else {
          el.value = '-';
        }
      }
      function clearIfDash(el, t){
        if(!el || el.tagName === 'SELECT') return;
        if(el.value === '-') el.value = '';
        if(t){ try{ el.type = t; }catch(_){ } }
      }
      if(v === '가상서버' || v === '클라우드'){
        dashText.forEach(function(n){ setDash(form.querySelector('[name="' + n + '"]')); });
        dashNum.forEach(function(n){
          var el = form.querySelector('[name="' + n + '"]');
          if(!el) return;
          if(!el.dataset.origType) el.dataset.origType = el.type || 'number';
          try{ el.type = 'text'; }catch(_){ }
          setDash(el);
        });
      } else {
        dashText.forEach(function(n){ clearIfDash(form.querySelector('[name="' + n + '"]')); });
        dashNum.forEach(function(n){
          var el = form.querySelector('[name="' + n + '"]');
          if(!el) return;
          var orig = el.dataset.origType || 'number';
          clearIfDash(el, orig);
          if(el.type === 'number'){ el.min = '0'; el.step = '1'; }
        });
      }
    }
    function attachVirtualizationHandler(formId){
      var form = document.getElementById(formId);
      if(!form) return;
      var sel = form.querySelector('[name="virtualization"]');
      if(!sel) return;
      sel.addEventListener('change', function(){ enforceVirtualizationDash(form); });
      enforceVirtualizationDash(form);
    }

    function renderFkSelect(col, value){
      var v = (value == null) ? '' : String(value);
      var meta = COLUMN_META[col] || { label: col };
      var placeholder = (meta && meta.label) ? (meta.label + ' 선택') : '선택';
      // Keep a synthetic current option so the modal still shows existing value
      // even before BlossomFkSelect hydrates master options.
      var currentOpt = v ? ('<option value="' + escapeAttr(v) + '" selected>' + escapeHtml(v) + '</option>') : '';
      return '<select name="' + escapeAttr(col) + '" class="form-input search-select fk-select" data-searchable="true" data-searchable-scope="modal" data-fk="' + escapeAttr(col) + '">'
        + '<option value="">' + escapeHtml(placeholder) + '</option>'
        + currentOpt
      + '</select>';
    }

    function generateFieldInput(col, value){
      var opts = {
        virtualization: ['', '물리서버', '가상서버', '클라우드'],
        confidentiality: ['', '1', '2', '3'],
        integrity: ['', '1', '2', '3'],
        availability: ['', '1', '2', '3'],
        system_grade: ['', '1등급', '2등급', '3등급'],
        core_flag: ['', '핵심', '일반'],
        dr_built: ['', 'O', 'X'],
        svc_redundancy: ['', 'O', 'X']
      };
      if(FK_COLS.indexOf(col) > -1){
        return renderFkSelect(col, value);
      }
      if(col === 'security_score'){
        var v = (value == null ? '' : String(value));
        return '<input name="security_score" class="form-input" type="number" readonly placeholder="자동 합계" value="' + escapeAttr(v) + '">';
      }
      if(opts[col]){
        var list = opts[col];
        var cur = (value == null ? '' : String(value));
        var isScore = (col === 'confidentiality' || col === 'integrity' || col === 'availability');
        var cls = 'form-input search-select' + (isScore ? ' score-trigger' : '');
        var html = '<select name="' + escapeAttr(col) + '" class="' + cls + '" data-placeholder="선택">' +
          list.map(function(o){
            var selected = (String(o) === String(cur)) ? ' selected' : '';
            return '<option value="' + escapeAttr(o) + '"' + selected + '>' + escapeHtml(o || '-') + '</option>';
          }).join('') +
          '</select>';
        return html;
      }
      if(col==='rack_face'){
        var selF=(value||'').toUpperCase()==='REAR'||value==='후면'?'':' selected';
        var selR=(value||'').toUpperCase()==='REAR'||value==='후면'?' selected':'';
        return '<select name="rack_face" class="form-input search-select" data-searchable="true" data-placeholder="선택"><option value="">선택</option><option value="FRONT"'+selF+'>전면</option><option value="REAR"'+selR+'>후면</option></select>';
      }
      if(col === 'slot' || col === 'u_size'){
        return '<input name="' + escapeAttr(col) + '" type="number" min="0" step="1" class="form-input" value="' + escapeAttr(value == null ? '' : String(value)) + '">';
      }
      return '<input name="' + escapeAttr(col) + '" class="form-input" value="' + escapeAttr(value == null ? '' : String(value)) + '">';
    }

    function getFieldValueForEditFromItem(item, field){
      if(!item) return '';
      var raw = '';
      if(field === 'work_type') raw = item.work_type_code || '';
      else if(field === 'work_category') raw = item.work_category_code || '';
      else if(field === 'work_status') raw = item.work_status_code || '';
      else if(field === 'work_operation') raw = item.work_operation_code || '';
      else if(field === 'work_group') raw = item.work_group_code || '';
      else if(field === 'work_name') raw = item.work_name || '';
      else if(field === 'system_name') raw = item.system_name || '';
      else if(field === 'system_ip') raw = item.system_ip || '';
      else if(field === 'manage_ip') raw = item.mgmt_ip || '';
      else if(field === 'vendor') raw = item.manufacturer_code || '';
      else if(field === 'model') raw = item.server_code || '';
      else if(field === 'serial') raw = item.serial_number || '';
      else if(field === 'virtualization') raw = normalizeVirtualizationLabel(item.virtualization_type);
      else if(field === 'location_place') raw = item.center_code || '';
      else if(field === 'location_pos') raw = item.rack_code || '';
      else if(field === 'slot') raw = item.slot != null ? String(item.slot) : '';
      else if(field === 'u_size') raw = item.u_size != null ? String(item.u_size) : '';
      else if(field === 'sys_dept') raw = item.system_dept_code || '';
      else if(field === 'svc_dept') raw = item.service_dept_code || '';
      else if(field === 'sys_owner') raw = item.system_owner_emp_no || '';
      else if(field === 'svc_owner') raw = item.service_owner_emp_no || '';
      else if(field === 'confidentiality') raw = item.cia_confidentiality != null ? String(item.cia_confidentiality) : '';
      else if(field === 'integrity') raw = item.cia_integrity != null ? String(item.cia_integrity) : '';
      else if(field === 'availability') raw = item.cia_availability != null ? String(item.cia_availability) : '';
      else if(field === 'security_score') raw = item.security_score != null ? String(item.security_score) : '';
      else if(field === 'system_grade') raw = item.system_grade || '';
      else if(field === 'core_flag') raw = (item.is_core_system == null) ? '' : (item.is_core_system ? '핵심' : '일반');
      else if(field === 'dr_built') raw = (item.has_dr_site == null) ? '' : (item.has_dr_site ? 'O' : 'X');
      else if(field === 'svc_redundancy') raw = (item.has_service_ha == null) ? '' : (item.has_service_ha ? 'O' : 'X');
      return String(raw == null ? '' : raw).trim();
    }

    function fillEditFormFromItem(item){
      var form = document.getElementById(EDIT_FORM_ID);
      if(!form) return;
      form.innerHTML = '';
      form.setAttribute('data-asset-id', String(item && item.id != null ? item.id : ''));
      var groups = [
        { title:'비즈니스', cols:['work_type','work_category','work_status','work_operation','work_group','work_name','system_name','system_ip','manage_ip'] },
        { title:'시스템', cols:['vendor','model','serial','virtualization','location_place','location_pos','slot','u_size','rack_face'] },
        { title:'담당자', cols:['sys_dept','sys_owner','svc_dept','svc_owner'] },
        { title:'점검', cols:['confidentiality','integrity','availability','security_score','system_grade','core_flag','dr_built','svc_redundancy'] }
      ];
      groups.forEach(function(g){
        var section = document.createElement('div');
        section.className = 'form-section';
        section.innerHTML = '<div class="section-header"><h4>' + escapeHtml(g.title) + '</h4></div>';
        var grid = document.createElement('div');
        grid.className = 'form-grid';
        g.cols.forEach(function(c){
          var wrap = document.createElement('div');
          wrap.className = 'form-row';
          var labelText = (c === 'security_score') ? '보안 점수' : ((COLUMN_META[c] && COLUMN_META[c].label) ? COLUMN_META[c].label : c);
          var val = getFieldValueForEditFromItem(item, c);
          wrap.innerHTML = '<label>' + escapeHtml(labelText) + '</label>' + generateFieldInput(c, val);
          // persist initial values for dependent selects
          var tmp = document.createElement('div');
          tmp.innerHTML = wrap.innerHTML;
          var selectEl = tmp.querySelector('select');
          if(selectEl && val){
            // re-apply to the actual node after it is inserted
          }
          grid.appendChild(wrap);
        });
        section.appendChild(grid);
        form.appendChild(section);
      });
      // Mark initial values for dependent selects
      try{
        var rackSel = form.querySelector('[name="location_pos"]');
        if(rackSel){ rackSel.setAttribute('data-initial-value', getFieldValueForEditFromItem(item,'location_pos')); }
        var modelSel = form.querySelector('[name="model"]');
        if(modelSel){ modelSel.setAttribute('data-initial-value', getFieldValueForEditFromItem(item,'model')); }
        var sysOwnerSel = form.querySelector('[name="sys_owner"]');
        if(sysOwnerSel){ sysOwnerSel.setAttribute('data-initial-value', getFieldValueForEditFromItem(item,'sys_owner')); }
        var svcOwnerSel = form.querySelector('[name="svc_owner"]');
        if(svcOwnerSel){ svcOwnerSel.setAttribute('data-initial-value', getFieldValueForEditFromItem(item,'svc_owner')); }
      }catch(_){ }
      attachSecurityScoreRecalc(EDIT_FORM_ID);
      attachVirtualizationHandler(EDIT_FORM_ID);

      // Hydrate FK selects + dependencies (dept->owner, vendor->model, center->rack)
      // using the globally-loaded helper from layouts/_header.html.
      try{
        if(window.BlossomFkSelect && typeof window.BlossomFkSelect.enhance === 'function'){
          var modalRoot = document.getElementById(EDIT_MODAL_ID);
          if(modalRoot) window.BlossomFkSelect.enhance(modalRoot, { forcePopulate: true });
        }
      }catch(_e){ }
    }

    async function ensureFkDataReady(){
      // Backwards-compatible no-op: FK hydration is handled by BlossomFkSelect.
      return;
    }

    async function apiGetAsset(id){
      var data = await fetchJSON(ASSET_API_BASE + '/' + encodeURIComponent(String(id)), { method:'GET' });
      return data.item || data;
    }
    async function apiUpdateAsset(id, payload){
      var data = await fetchJSON(ASSET_API_BASE + '/' + encodeURIComponent(String(id)), { method:'PUT', body: JSON.stringify(payload) });
      return data.item || data;
    }

    // Wire the Basic Info edit modal open/close/save (real data)
    (function(){
      var openBtn = document.getElementById(EDIT_OPEN_ID);
      var closeBtn = document.getElementById(EDIT_CLOSE_ID);
      var saveBtn = document.getElementById(EDIT_SAVE_ID);
      var modalEl = document.getElementById(EDIT_MODAL_ID);

      function close(){ closeModal(EDIT_MODAL_ID); }

      if(openBtn){
        openBtn.addEventListener('click', function(){
          (async function(){
            var assetId = getSelectedAssetId();
            if(!assetId){
              toast('자산 식별자(asset_id)를 찾지 못했습니다. 목록에서 다시 진입해주세요.', 'warn');
              return;
            }
            try{
              await ensureFkDataReady();
              var item = await apiGetAsset(assetId);
              // fallback: if API fails, try cached row so the modal still opens
              if(!item){
                toast('자산 정보를 불러오지 못했습니다.', 'error');
                return;
              }
              fillEditFormFromItem(item);
              openModal(EDIT_MODAL_ID);
            }catch(err){
              console.error(err);
              // best-effort: open with cached row values
              try{
                var row = getSelectedRow();
                if(row){
                  // Construct a pseudo-item matching getFieldValueForEditFromItem
                  var pseudo = Object.assign({}, {
                    id: assetId,
                    work_type_code: row.work_type_code || '',
                    work_category_code: row.work_category_code || '',
                    work_status_code: row.work_status_code || '',
                    work_operation_code: row.work_operation_code || '',
                    work_group_code: row.work_group_code || '',
                    work_name: row.work_name || '',
                    system_name: row.system_name || '',
                    system_ip: row.system_ip || '',
                    mgmt_ip: row.mgmt_ip || row.manage_ip || '',
                    manufacturer_code: row.manufacturer_code || '',
                    server_code: row.server_code || '',
                    serial_number: row.serial || '',
                    virtualization_type: row.virtualization || '',
                    center_code: row.center_code || '',
                    rack_code: row.rack_code || '',
                    slot: row.slot || '',
                    u_size: row.u_size || '',
                    system_dept_code: row.system_dept_code || '',
                    service_dept_code: row.service_dept_code || '',
                    system_owner_emp_no: row.system_owner_emp_no || '',
                    service_owner_emp_no: row.service_owner_emp_no || '',
                    cia_confidentiality: row.confidentiality || '',
                    cia_integrity: row.integrity || '',
                    cia_availability: row.availability || '',
                    security_score: row.security_score || '',
                    system_grade: row.system_grade || '',
                    is_core_system: (row.is_core_system != null ? row.is_core_system : null),
                    has_dr_site: (row.has_dr_site != null ? row.has_dr_site : null),
                    has_service_ha: (row.has_service_ha != null ? row.has_service_ha : null)
                  });
                  await ensureFkDataReady();
                  fillEditFormFromItem(pseudo);
                  openModal(EDIT_MODAL_ID);
                  toast('일부 최신 정보 조회에 실패해, 저장된 값으로 표시합니다.', 'warn');
                  return;
                }
              }catch(_e){ }
              toast(err && err.message ? err.message : '수정 모달 초기화 실패', 'error');
            }
          })();
        });
      }
      if(closeBtn){
        closeBtn.addEventListener('click', function(){ close(); });
      }
      if(modalEl){
        modalEl.addEventListener('click', function(e){ if(e.target === modalEl) close(); });
        document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && modalEl.classList.contains('show')) close(); });
      }
      if(saveBtn){
        saveBtn.addEventListener('click', function(){
          (async function(){
            var form = document.getElementById(EDIT_FORM_ID);
            if(!form){ close(); return; }
            var assetId = form.getAttribute('data-asset-id') || getSelectedAssetId();
            if(!assetId){ toast('자산 ID를 찾지 못했습니다.', 'error'); return; }
            var formData = collectForm(form);
            try{
              // Load current item to keep asset_code/name stable
              var existingItem = null;
              try{ existingItem = await apiGetAsset(assetId); }catch(_){ existingItem = null; }
              var payload = buildAssetPayload(formData, existingItem);
              var updated = await apiUpdateAsset(assetId, payload);
              // Re-fetch after update so UI reflects the true persisted state
              // (especially for FK display fields like center/rack).
              var fresh = null;
              try{ fresh = await apiGetAsset(assetId); }catch(_eGet){ fresh = null; }
              var sourceItem = fresh || updated;
              var displayRow = normalizeAssetForDisplay(sourceItem) || null;
              if(displayRow){
                // Update page header + cards
                try{
                  var h1 = document.querySelector('.page-header h1');
                  var p = document.querySelector('.page-header p');
                  if(h1) h1.textContent = displayRow.work_name || '-';
                  if(p) p.textContent = displayRow.system_name || '-';
                }catch(_){ }
                try{ applyRowToBasicInfo(displayRow); }catch(_){ }
                // Persist for other tabs
                try{
                  // preserve some code fields if present in API response
                  displayRow.work_type_code = sourceItem.work_type_code || '';
                  displayRow.work_category_code = sourceItem.work_category_code || '';
                  displayRow.work_status_code = sourceItem.work_status_code || '';
                  displayRow.work_operation_code = sourceItem.work_operation_code || '';
                  displayRow.work_group_code = sourceItem.work_group_code || '';
                  displayRow.manufacturer_code = sourceItem.manufacturer_code || '';
                  displayRow.server_code = sourceItem.server_code || '';
                  displayRow.center_code = sourceItem.center_code || '';
                  displayRow.rack_code = sourceItem.rack_code || '';
                  displayRow.system_dept_code = sourceItem.system_dept_code || '';
                  displayRow.service_dept_code = sourceItem.service_dept_code || '';
                  displayRow.system_owner_emp_no = sourceItem.system_owner_emp_no || '';
                  displayRow.service_owner_emp_no = sourceItem.service_owner_emp_no || '';
                  displayRow.mgmt_ip = sourceItem.mgmt_ip || '';
                  displayRow.is_core_system = sourceItem.is_core_system;
                  displayRow.has_dr_site = sourceItem.has_dr_site;
                  displayRow.has_service_ha = sourceItem.has_service_ha;
                }catch(_){ }
                setSelectedRow(displayRow);
              }
              close();
            }catch(err){
              console.error(err);
              toast(err && err.message ? err.message : '저장 실패', 'error');
            }
          })();
        });
      }
    })();

    // Tab behaviors moved to /static/js/_detail/tabXX-*.js
    // (legacy inline implementations removed from this file).
  });

})();

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

  // Basic Info edit modal element IDs
  // (Some detail scripts rely on these constants; define them here to avoid ReferenceError.)
  var EDIT_OPEN_ID = 'detail-edit-open';
  var EDIT_MODAL_ID = 'system-edit-modal';
  var EDIT_FORM_ID = 'system-edit-form';
  var EDIT_SAVE_ID = 'system-edit-save';
  var EDIT_CLOSE_ID = 'system-edit-close';

  document.addEventListener('DOMContentLoaded', function(){
    // Initialize page header from URL params or sessionStorage (list -> detail propagation)
    try{
      var params = new URLSearchParams(window.location.search || '');
      var work = params.get('work');
      var system = params.get('system');
      var assetId = params.get('asset_id') || params.get('assetId') || params.get('id');
      if(work || system){
        try{
          if(work != null) sessionStorage.setItem('frame:selected:work_name', work);
          if(system != null) sessionStorage.setItem('frame:selected:system_name', system);
        }catch(_e){}
      }
      if(assetId){
        try{ sessionStorage.setItem('frame:selected:asset_id', String(assetId)); }catch(_e0){ }
        try{ localStorage.setItem('frame:selected:asset_id', String(assetId)); }catch(_e1){ }
      }
      if(!work){ try{ work = sessionStorage.getItem('frame:selected:work_name') || '-'; }catch(_e2){ work='-'; } }
      if(!system){ try{ system = sessionStorage.getItem('frame:selected:system_name') || '-'; }catch(_e3){ system='-'; } }
      var h1 = document.querySelector('.page-header h1');
      var p = document.querySelector('.page-header p');
      if(h1) h1.textContent = String(work||'-');
      if(p) p.textContent = String(system||'-');

      // Strip legacy query params from address bar.
      try{
        if(params && (params.has('work') || params.has('system') || params.has('asset_id') || params.has('assetId') || params.has('id') || params.has('asset_scope'))){
          ['work','system','asset_id','assetId','id','asset_scope'].forEach(function(k){ try{ params.delete(k); }catch(_){ } });
          var qs = params.toString();
          history.replaceState({}, '', location.pathname + (qs ? ('?' + qs) : '') + location.hash);
        }
      }catch(_stripErr){ }
    }catch(_){ }

    // Mark page-size selects as chosen after interaction, so CSS can style as white text
    (function(){
      function wireChosen(id){
        var sel = document.getElementById(id); if(!sel) return;
        function apply(){ if(sel.value){ sel.classList.add('is-chosen'); } }
        sel.addEventListener('change', apply);
        apply();
      }
      ['lg-page-size','hw-page-size','sw-page-size','bk-page-size','if-page-size','am-page-size','au-page-size','ac-page-size','fw-page-size','st-page-size','tk-page-size','vl-page-size','pk-page-size','mt-page-size']
        .forEach(wireChosen);
    })();

    // Basic Info helpers
    function coerceDisplayValue(value){
      if(value === 0) return '0';
      if(value == null) return '';
      return String(value).trim();
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
          break;
        }
      }catch(_e){ }
    }

    function setStatusByLabel(labelText, value, opts){
      try{
        var v = coerceDisplayValue(value);
        if(!v) v = '-';
        var rows = document.querySelectorAll('.basic-info-grid .info-row');
        for(var i=0;i<rows.length;i++){
          var row = rows[i];
          var lab = row.querySelector('label');
          var labText = (lab && lab.textContent ? lab.textContent.trim() : '');
          if(labText !== String(labelText).trim()) continue;

          var pill = row.querySelector('.status-pill');
          if(!pill){
            // Fallback: just set text
            var t = row.querySelector('.status-pill .status-text');
            if(t) t.textContent = v;
            break;
          }
          // Delegate to shared styling logic (supports ws-* tokens and hex colors)
          applyWorkStatusPillStyle(v, opts, pill);
          break;
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
          if(!badge) break;
          // Match WIPS: empty is '-' inside a plain num-badge (no tone class)
          if(!v || v === '-'){
            badge.textContent = '-';
            badge.classList.remove('tone-1','tone-2','tone-3');
            break;
          }

          // Accept non-numeric strings but keep plain styling
          var s = String(v).trim();
          var n = parseInt(s, 10);
          badge.classList.remove('tone-1','tone-2','tone-3');
          if(isNaN(n)){
            badge.textContent = s ? s : '-';
            break;
          }

          badge.textContent = String(n);
          if(labelText === '보안 점수') badge.classList.add(n >= 8 ? 'tone-3' : (n >= 6 ? 'tone-2' : 'tone-1'));
          else badge.classList.add(n >= 3 ? 'tone-3' : (n === 2 ? 'tone-2' : 'tone-1'));
          break;
        }
      }catch(_e){}
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
          if(!badge) break;
          // Match WIPS: invalid/empty shows '-' inside a plain ox-badge (no on/off)
          if(!v || v === '-'){
            badge.textContent = '-';
            badge.setAttribute('aria-label', '');
            badge.classList.remove('on','off');
            break;
          }
          var s = String(v).trim().toUpperCase();
          if(s !== 'O' && s !== 'X'){
            badge.textContent = '-';
            badge.setAttribute('aria-label', '');
            badge.classList.remove('on','off');
            break;
          }
          badge.textContent = s;
          badge.setAttribute('aria-label', s);
          badge.classList.remove('on','off');
          badge.classList.add(s === 'O' ? 'on' : 'off');
          break;
        }
      }catch(_e){}
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
      }catch(_e){}
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

    function normalizeAssetRecordForDetail(item){
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
        // keep codes as well (needed for update payload + stable across tabs)
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
        sys_owner: label(item.system_owner_name, item.system_owner_emp_no),
        svc_dept: label(item.service_dept_name, item.service_dept_code),
        svc_owner: label(item.service_owner_name, item.service_owner_emp_no),
        confidentiality: (item.cia_confidentiality == null ? '' : String(item.cia_confidentiality)),
        integrity: (item.cia_integrity == null ? '' : String(item.cia_integrity)),
        availability: (item.cia_availability == null ? '' : String(item.cia_availability)),
        security_score: (item.security_score == null ? '' : String(item.security_score)),
        system_grade: coerceDisplayValue(item.system_grade) || '-',
        core_flag: core(item.is_core_system),
        dr_built: yesNo(item.has_dr_site),
        svc_redundancy: yesNo(item.has_service_ha)
      };
    }

    // --- FK label hydration (code -> name) for Basic Info ---
    // Some APIs return only *_code fields. For display, we prefer readable names.
    // These endpoints already exist and are used across the app (see static/js/ui/fk_select.js).
    var __FK_CACHE = {};
    function __normStr(v){ return (v == null) ? '' : String(v).trim(); }
    function __looksLikeCodeToken(v){
      var s = __normStr(v);
      if(!s || s === '-') return false;
      if(/[\u3131-\uD79D]/.test(s)) return false; // contains Korean
      if(/\s/.test(s)) return false;
      return /^[A-Za-z0-9_:\-./]+$/.test(s);
    }
    function __fetchFkItems(endpoint){
      var key = String(endpoint);
      if(__FK_CACHE[key]) return __FK_CACHE[key];
      __FK_CACHE[key] = fetch(endpoint, { method:'GET', headers:{ 'Accept':'application/json' } })
        .then(function(r){ if(!r.ok) return null; return r.json(); })
        .then(function(data){
          if(!data) return [];
          var items = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : []);
          return Array.isArray(items) ? items : [];
        })
        .catch(function(){ return []; });
      return __FK_CACHE[key];
    }
    function __findLabel(items, valueKey, labelKey, code){
      var c = __normStr(code);
      if(!c) return '';
      for(var i=0;i<items.length;i++){
        var it = items[i] || {};
        if(__normStr(it[valueKey]) === c){
          var lab = __normStr(it[labelKey]);
          return lab || c;
        }
      }
      return '';
    }
    // Column labels for edit modal rendering.
    // NOTE: buildEditFormFromPage references COLUMN_META; keep this in sync with GROUPS.
    var COLUMN_META = {
      work_type:{label:'업무 분류'},
      work_category:{label:'업무 구분'},
      work_status:{label:'업무 상태'},
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
    function buildEditFormFromPage(){
      var form = document.getElementById(EDIT_FORM_ID); if(!form) return;
      function clean(v){
        var s = (v == null) ? '' : String(v).trim();
        if(!s) return '';
        if(s === '-' || s === '—') return '';
        if(s === '부서를 먼저 선택' || s === '부서 선택' || s === '선택') return '';
        return s;
      }
      function text(sel){ var el=document.querySelector(sel); return (el? el.textContent.trim() : ''); }
      function badgeVal(sel){ var el=document.querySelector(sel); return (el? el.textContent.trim() : ''); }
      function cia(sel){ var el=document.querySelector(sel); return (el? el.textContent.trim() : ''); }
      var selectedRowData = null;
      try{
        var storagePrefix = (typeof STORAGE_PREFIX !== 'undefined' && STORAGE_PREFIX) ? STORAGE_PREFIX : 'frame';
        var raw = sessionStorage.getItem(storagePrefix+':selected:row') || localStorage.getItem(storagePrefix+':selected:row');
        if(raw){
          var selectedRow = JSON.parse(raw);
          var keys = ['work_type','work_category','work_operation','work_group','work_name','system_name','system_ip','manage_ip','vendor','model','serial','virtualization','location_place','location_pos','slot','u_size','sys_dept','sys_owner','svc_dept','svc_owner','confidentiality','integrity','availability','security_score','system_grade','core_flag','dr_built','svc_redundancy'];
          selectedRowData = {};

          // IMPORTANT:
          // Many FK fields in this modal are rendered as <input> and later converted to <select>
          // by static/js/ui/fk_select.js (BlossomFkSelect). That converter restores selection by
          // matching the old input value to option VALUE first (code), then by LABEL.
          // If we put human labels into the input, label matching can fail (e.g. center labels
          // include " · " details), causing the modal to reopen as "선택".
          // So: prefer storing the canonical code into the field value.
          var preferCodeForField = {
            vendor: 'manufacturer_code',
            model: 'server_code',
            location_place: 'center_code',
            location_pos: 'rack_code',
            sys_dept: 'system_dept_code',
            sys_owner: 'system_owner_emp_no',
            svc_dept: 'service_dept_code',
            svc_owner: 'service_owner_emp_no'
          };

          keys.forEach(function(k){
            if(!selectedRow) return;
            var vRaw = null;
            try{
              var codeKey = preferCodeForField[k];
              if(codeKey && selectedRow[codeKey] != null && String(selectedRow[codeKey]).trim() !== ''){
                vRaw = selectedRow[codeKey];
              } else if(selectedRow[k] != null) {
                vRaw = selectedRow[k];
              }
            }catch(_e){ vRaw = selectedRow[k]; }
            if(vRaw != null){
              var v = clean(vRaw);
              if(v !== '') selectedRowData[k] = v;
            }
          });
          if(!selectedRowData.work_status){
            var ws = (selectedRow.work_status || selectedRow.work_status_name || selectedRow.work_status_code);
            if(ws != null){
                ws = clean(ws);
                if(ws !== '') selectedRowData.work_status = ws;
            }
          }
        }
      }catch(_e){ selectedRowData = null; }
  var data = selectedRowData || {
              work_type: clean(badgeVal('.basic-info-card:nth-child(1) .info-row:nth-child(2) .info-value')),
              work_category: clean(badgeVal('.basic-info-card:nth-child(1) .info-row:nth-child(3) .info-value')),
            work_status: clean(text('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill .status-text')),
              work_operation: clean(text('.basic-info-card:nth-child(1) .info-row:nth-child(4) .info-value')),
              work_group: clean(badgeVal('.basic-info-card:nth-child(1) .info-row:nth-child(5) .info-value')),
              work_name: clean(text('.basic-info-card:nth-child(1) .info-row:nth-child(6) .info-value')),
              system_name: clean(text('.basic-info-card:nth-child(1) .info-row:nth-child(7) .info-value')),
              system_ip: clean(text('.basic-info-card:nth-child(1) .info-row:nth-child(8) .info-value')),
              manage_ip: clean(text('.basic-info-card:nth-child(1) .info-row:nth-child(9) .info-value')),
              vendor: clean(badgeVal('.basic-info-card:nth-child(2) .info-row:nth-child(1) .info-value')),
              model: clean(badgeVal('.basic-info-card:nth-child(2) .info-row:nth-child(2) .info-value')),
              serial: clean(text('.basic-info-card:nth-child(2) .info-row:nth-child(3) .info-value')),
              virtualization: clean(badgeVal('.basic-info-card:nth-child(2) .info-row:nth-child(4) .info-value')),
              location_place: clean(badgeVal('.basic-info-card:nth-child(2) .info-row:nth-child(5) .info-value')),
              location_pos: clean(badgeVal('.basic-info-card:nth-child(2) .info-row:nth-child(6) .info-value')),
              slot: clean(text('.basic-info-card:nth-child(2) .info-row:nth-child(7) .info-value')),
              u_size: clean(text('.basic-info-card:nth-child(2) .info-row:nth-child(8) .info-value')),
              sys_dept: clean(badgeVal('.basic-info-card:nth-child(3) .info-row:nth-child(1) .info-value')),
              sys_owner: clean(badgeVal('.basic-info-card:nth-child(3) .info-row:nth-child(2) .info-value')),
              svc_dept: clean(badgeVal('.basic-info-card:nth-child(3) .info-row:nth-child(3) .info-value')),
              svc_owner: clean(badgeVal('.basic-info-card:nth-child(3) .info-row:nth-child(4) .info-value')),
              confidentiality: clean(cia('.basic-info-card:nth-child(4) .info-row:nth-child(1) .num-badge')),
              integrity: clean(cia('.basic-info-card:nth-child(4) .info-row:nth-child(2) .num-badge')),
              availability: clean(cia('.basic-info-card:nth-child(4) .info-row:nth-child(3) .num-badge')),
              security_score: clean(cia('.basic-info-card:nth-child(4) .info-row:nth-child(4) .num-badge')),
              system_grade: clean(text('.basic-info-card:nth-child(4) .info-row:nth-child(5) .info-value')),
              core_flag: clean(text('.basic-info-card:nth-child(4) .info-row:nth-child(6) .info-value')),
        dr_built: (function(){ var el=document.querySelector('.basic-info-card:nth-child(4) .info-row:nth-child(7) .ox-badge'); return el? el.textContent.trim() : ''; })(),
        svc_redundancy: (function(){ var el=document.querySelector('.basic-info-card:nth-child(4) .info-row:nth-child(8) .ox-badge'); return el? el.textContent.trim() : ''; })()
      };
      var GROUPS = [
        { title:'비즈니스', cols:['work_type','work_category','work_status','work_operation','work_group','work_name','system_name','system_ip','manage_ip'] },
        { title:'시스템', cols:['vendor','model','serial','virtualization','location_place','location_pos','slot','u_size','rack_face'] },
        { title:'담당자', cols:['sys_dept','sys_owner','svc_dept','svc_owner'] },
        { title:'점검', cols:['confidentiality','integrity','availability','security_score','system_grade','core_flag','dr_built','svc_redundancy'] }
      ];
      function fieldInput(col, value){
        var opts={
          virtualization:['','물리서버','가상서버','클라우드'],
          confidentiality:['','1','2','3'], integrity:['','1','2','3'], availability:['','1','2','3'],
          system_grade:['','1등급','2등급','3등급'], core_flag:['','핵심','일반'], dr_built:['','O','X'], svc_redundancy:['','O','X']
        };
        // FK-coded fields should be selects so the user can pick valid codes.
        // We'll hydrate options asynchronously from code-table APIs.
        var fkFields = ['work_type','work_category','work_status','work_operation','work_group'];
        if(fkFields.indexOf(col) > -1){
          var storagePrefix = (typeof STORAGE_PREFIX !== 'undefined' && STORAGE_PREFIX) ? STORAGE_PREFIX : 'frame';
          var selectedRow = null;
          try{
            var raw = sessionStorage.getItem(storagePrefix+':selected:row') || localStorage.getItem(storagePrefix+':selected:row');
            selectedRow = raw ? JSON.parse(raw) : null;
          }catch(_e){ selectedRow = null; }
          var codeKeyMap = { work_type:'work_type_code', work_category:'work_category_code', work_status:'work_status_code', work_operation:'work_operation_code', work_group:'work_group_code' };
          var codeKey = codeKeyMap[col] || '';
          var selectedValue = '';
          var selectedLabel = '';
          try{
            selectedLabel = (value == null) ? '' : String(value).trim();
            if(selectedRow && codeKey && selectedRow[codeKey] != null) selectedValue = String(selectedRow[codeKey]).trim();
            // If the UI shows "<code>-<name>", extract the code portion.
            if(!selectedValue && selectedLabel){
              var m = selectedLabel.match(/^([A-Za-z0-9_:\-./]+)\s*[-–—]\s*.+$/);
              if(m && m[1] && __looksLikeCodeToken(m[1])) selectedValue = String(m[1]).trim();
            }
            if(!selectedValue && selectedLabel && __looksLikeCodeToken(selectedLabel)) selectedValue = selectedLabel;
          }catch(_){ }
          // On-premise pattern: keep a representable selected option immediately so the user sees
          // current values even before async option hydration.
          var opt = '<option value="">선택</option>';
          if(selectedValue){
            var lab = (selectedLabel && selectedLabel !== '-' && selectedLabel !== '—') ? selectedLabel : selectedValue;
            opt += '<option value="'+selectedValue+'" selected>'+lab+'</option>';
          }
          return '<select name="'+col+'" class="form-input fk-select" data-fk="'+col+'" data-selected-value="'+(selectedValue||'')+'" data-selected-label="'+(selectedLabel||'')+'">'+opt+'</select>';
        }
        // Same UX as on-premise detail:
        // - CIA/grade/core/DR/HA are searchable dropdowns.
        // - security_score is read-only (computed from CIA).
        if(col==='security_score') return '<input name="security_score" class="form-input" type="number" readonly placeholder="자동 합계" value="'+(value||'')+'">';
        if(opts[col]){
          var isCia = (['confidentiality','integrity','availability'].indexOf(col) > -1);
          var classes = 'form-input search-select' + (isCia ? ' score-trigger' : '');
          var ph = '선택';
          return '<select name="'+col+'" class="'+classes+'" data-placeholder="'+ph+'" data-searchable-scope="modal">'+
            opts[col].map(function(o){
              var label = (o === '' ? '-' : o);
              return '<option value="'+o+'" '+(String(o)===String(value)?'selected':'')+'>'+label+'</option>';
            }).join('')+
          '</select>';
        }
        if(col==='rack_face'){
            var selF=(value||'').toUpperCase()==='REAR'||value==='후면'?'':' selected';
            var selR=(value||'').toUpperCase()==='REAR'||value==='후면'?' selected':'';
            return '<select name="rack_face" class="form-input search-select" data-searchable="true" data-placeholder="선택"><option value="">선택</option><option value="FRONT"'+selF+'>전면</option><option value="REAR"'+selR+'>후면</option></select>';
        }
        if(['slot','u_size'].indexOf(col)>-1) return '<input name="'+col+'" type="number" min="0" step="1" class="form-input" value="'+(value||'')+'">';
        // Allow FK input->select conversion for model on hardware pages.
        if(col === 'model') return '<input name="'+col+'" class="form-input" data-fk-allow="1" value="'+(value||'')+'">';
        return '<input name="'+col+'" class="form-input" value="'+(value||'')+'">';
      }
      var html = GROUPS.map(function(g){
        var grid = g.cols.map(function(c){ var meta=COLUMN_META[c]||{label:c}; return '<div class="form-row"><label>'+(c==='security_score'?'보안 점수':meta.label)+'</label>'+ fieldInput(c, data[c]) +'</div>'; }).join('');
        return '<div class="form-section"><div class="section-header"><h4>'+g.title+'</h4></div><div class="form-grid">'+grid+'</div></div>';
      }).join('');
      form.innerHTML = html;

      // On-premise-like searchable dropdown behavior for non-FK selects.
      // (FK selects are handled by BlossomFkSelect separately.)
      try{
        if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
          var selects = form.querySelectorAll('select.search-select:not([data-fk])');
          selects.forEach(function(sel){
            try{ window.BlossomSearchableSelect.syncAll(sel); }catch(_e0){}
            try{ sel.addEventListener('change', function(){ try{ window.BlossomSearchableSelect.syncAll(sel); }catch(_e1){}; }); }catch(_e2){}
          });
        }
      }catch(_eSearch){ }

      attachSecurityScoreRecalc(EDIT_FORM_ID);
      attachVirtualizationHandler(EDIT_FORM_ID);
      hydrateBasicInfoFkSelects(form);
      // Also enhance with shared FK select handler (dept->owner dependencies, searchable dropdowns).
      try{
        if(window.BlossomFkSelect && typeof window.BlossomFkSelect.enhance === 'function'){
          var modalRoot = document.getElementById(EDIT_MODAL_ID);
          if(modalRoot) window.BlossomFkSelect.enhance(modalRoot, { forcePopulate: true });
        }
      }catch(_e){ }
    }

    function hydrateBasicInfoFkSelects(form){
      try{
        if(!form) return;
        var selects = form.querySelectorAll('select.fk-select[data-fk]');
        if(!selects || selects.length === 0) return;
        function parseLeadingCodeFromLabel(label){
          try{
            var s = __normStr(label);
            if(!s) return '';
            // Common UI format: "<code>-<name>" (name may contain Korean).
            var m = s.match(/^([A-Za-z0-9_:\-./]+)\s*[-–—]\s*.+$/);
            if(!m) return '';
            var code = __normStr(m[1]);
            return __looksLikeCodeToken(code) ? code : '';
          }catch(_e){ return ''; }
        }
        var specs = {
          work_type: { endpoint:'/api/work-categories', valueKey:'category_code', labelKey:'wc_name' },
          work_category: { endpoint:'/api/work-divisions', valueKey:'division_code', labelKey:'wc_name' },
          work_status: { endpoint:'/api/work-statuses', valueKey:'status_code', labelKey:'wc_name' },
          work_operation: { endpoint:'/api/work-operations', valueKey:'operation_code', labelKey:'wc_name' },
          work_group: { endpoint:'/api/work-groups', valueKey:'group_code', labelKey:'group_name' }
        };

        selects.forEach(function(sel){
          var fk = sel.getAttribute('data-fk');
          var spec = specs[fk];
          if(!spec) return;
          var selectedValue = __normStr(sel.getAttribute('data-selected-value'));
          var selectedLabel = __normStr(sel.getAttribute('data-selected-label'));
          __fetchFkItems(spec.endpoint).then(function(items){
            var options = ['<option value="">선택</option>'];
            var seen = {};
            for(var i=0;i<items.length;i++){
              var it = items[i] || {};
              var v = __normStr(it[spec.valueKey]);
              if(!v || seen[v]) continue;
              var lab = __normStr(it[spec.labelKey]) || v;
              options.push('<option value="'+v+'">'+lab+'</option>');
              seen[v] = true;
            }
            // Ensure current value is present even if filtered out.
            if(selectedValue && !seen[selectedValue]){
              options.push('<option value="'+selectedValue+'">'+(selectedLabel||selectedValue)+'</option>');
            }
            sel.innerHTML = options.join('');

            // Resolve selection: value -> parsed code -> direct value match -> label match.
            var effective = selectedValue;
            if(!effective && selectedLabel){
              var parsed = parseLeadingCodeFromLabel(selectedLabel);
              if(parsed && seen[parsed]) effective = parsed;
            }
            if(!effective && selectedLabel && seen[selectedLabel]){
              // Some codes are identical to labels.
              effective = selectedLabel;
            }
            if(!effective && selectedLabel){
              // Exact label match.
              var opts = sel.options || [];
              for(var j=0;j<opts.length;j++){
                var o = opts[j];
                if(!o || !o.value) continue;
                if(__normStr(o.textContent) === __normStr(selectedLabel)) { effective = o.value; break; }
              }
            }
            if(!effective && selectedLabel && selectedLabel.indexOf('-') > -1){
              // Match the right side of "code-name" to option label.
              var parts = selectedLabel.split('-');
              if(parts.length >= 2){
                var right = __normStr(parts.slice(1).join('-'));
                var opts2 = sel.options || [];
                for(var k=0;k<opts2.length;k++){
                  var o2 = opts2[k];
                  if(!o2 || !o2.value) continue;
                  if(__normStr(o2.textContent) === right) { effective = o2.value; break; }
                }
              }
            }
            if(effective) sel.value = effective;
          });
        });
      }catch(_e){}
    }

    // Keep '업무 상태' pill styling consistent with list pages
    function applyWorkStatusPillStyle(workStatusText, opts, pillEl){
      try{
        var v = (workStatusText == null) ? '' : String(workStatusText).trim();
        var pill = pillEl || document.querySelector('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill');
        if(!pill) return;
        var textEl = pill.querySelector('.status-text');
        var dot = pill.querySelector('.status-dot');
        if(textEl && v) textEl.textContent = v;
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
        // Some APIs store the token in work_status_color (e.g. "ws-c2") instead of a hex.
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
      }catch(_e){}
    }

    function attachSecurityScoreRecalc(formId){
      var form=document.getElementById(formId); if(!form) return;
      var scoreInput=form.querySelector('input[name="security_score"]'); if(!scoreInput) return;
      function recompute(){
        var c=parseInt(form.querySelector('[name="confidentiality"]').value||'0',10)||0;
        var i=parseInt(form.querySelector('[name="integrity"]').value||'0',10)||0;
        var a=parseInt(form.querySelector('[name="availability"]').value||'0',10)||0;
        var total=c+i+a; scoreInput.value = total? total: '';
        var gradeField=form.querySelector('[name="system_grade"]');
        if(gradeField){
          if(total>=8) gradeField.value='1등급';
          else if(total>=6) gradeField.value='2등급';
          else if(total>0) gradeField.value='3등급';
          else gradeField.value='';
        }
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
      if(v==='가상서버' || v==='클라우드'){
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
  function setText(sel, val){ var el=document.querySelector(sel); if(el) el.textContent = String(val||''); }
      function setBadge(sel, val){ var el=document.querySelector(sel); if(el) el.textContent = String(val||''); }
      function vRaw(name){ var el=form.querySelector('[name="'+name+'"]'); return el? el.value : ''; }
      function vLabel(name){
        var el=form.querySelector('[name="'+name+'"]');
        if(!el) return '';
        try{
          var tag = (el.tagName||'').toLowerCase();
          if(tag === 'select'){
            var opt = el.selectedOptions && el.selectedOptions[0];
            var lab = opt && opt.textContent ? String(opt.textContent).trim() : '';
            if(lab === '선택' || lab === '부서 선택' || lab === '부서를 먼저 선택' || lab === '담당자 선택') lab = '';
            var raw = (el.value == null) ? '' : String(el.value).trim();
            if(raw === '선택' || raw === '부서 선택' || raw === '부서를 먼저 선택' || raw === '담당자 선택') raw = '';
            return lab || raw || '';
          }
        }catch(_e){}
        return el.value || '';
      }
      // For FK dropdowns, render human label; for plain fields, render raw value.
      var v = function(name){
        if(['work_type','work_category','work_status','work_group','vendor','model','location_place','location_pos','sys_dept','sys_owner','svc_dept','svc_owner'].indexOf(name) > -1){
          return vLabel(name) || vRaw(name);
        }
        return vRaw(name);
      };
      function vDash(name){
        var s = v(name);
        s = (s == null) ? '' : String(s).trim();
        return s ? s : '-';
      }
        (function(){
          var statusText = v('work_status');
          var pill = document.querySelector('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill');
          if(!pill){
            setText('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill .status-text', statusText);
            return;
          }
          // Try to preserve configured status token/color from selected row if present.
          var sel = null;
          try{ sel = getSelectedRow(); }catch(_){ }
          var token = sel && (sel.work_status_token || sel.work_status_color) ? (sel.work_status_token || sel.work_status_color) : '';
          applyWorkStatusPillStyle(statusText, { token: token, color: (sel && sel.work_status_color) ? sel.work_status_color : '' }, pill);
        })();
      setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(2) .info-value', v('work_type'));
      setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(3) .info-value', v('work_category'));
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(4) .info-value', v('work_operation'));
      setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(5) .info-value', v('work_group'));
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(6) .info-value', v('work_name'));
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(7) .info-value', v('system_name'));
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(8) .info-value', v('system_ip'));
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(9) .info-value', v('manage_ip'));
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(1) .info-value', vDash('vendor'));
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(2) .info-value', vDash('model'));
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(3) .info-value', v('serial'));
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(4) .info-value', v('virtualization'));
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(5) .info-value', vDash('location_place'));
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(6) .info-value', vDash('location_pos'));
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(7) .info-value', v('slot'));
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(8) .info-value', v('u_size'));
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(9) .info-value', (v('rack_face') === 'REAR') ? '후면' : '전면');
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(1) .info-value', vDash('sys_dept'));
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(2) .info-value', vDash('sys_owner'));
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(3) .info-value', vDash('svc_dept'));
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(4) .info-value', vDash('svc_owner'));
      function setNumBadge(sel, num){ var badge=document.querySelector(sel); if(badge){ badge.textContent = String(num||''); var badgeWrap=badge; var n=parseInt(num,10); badgeWrap.classList.remove('tone-1','tone-2','tone-3'); if(!isNaN(n)){ badgeWrap.classList.add(n>=3?'tone-3':(n===2?'tone-2':'tone-1')); } } }
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(1) .num-badge', v('confidentiality'));
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(2) .num-badge', v('integrity'));
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(3) .num-badge', v('availability'));
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(4) .num-badge', v('security_score'));
      setText('.basic-info-card:nth-child(4) .info-row:nth-child(5) .info-value', v('system_grade'));
      setText('.basic-info-card:nth-child(4) .info-row:nth-child(6) .info-value', v('core_flag'));
      function setOX(rowSel, name){
        var el=document.querySelector(rowSel+' .ox-badge');
        if(!el) return;
        var val=v(name);
        val = (val == null) ? '' : String(val).trim();
        if(!val || val === '-'){
          el.textContent = '';
          el.setAttribute('aria-label','');
          el.classList.remove('on','off');
          return;
        }
        el.textContent=(val==='X'?'X':'O');
        el.setAttribute('aria-label', el.textContent);
        el.classList.remove('on','off');
        el.classList.add(val==='O'?'on':'off');
      }
      // Update OX badges for DR 구축여부 and 서비스 이중화
      setOX('.basic-info-card:nth-child(4) .info-row:nth-child(7)', 'dr_built');
      setOX('.basic-info-card:nth-child(4) .info-row:nth-child(8)', 'svc_redundancy');
      // Persist key hardware fields for cross-tab usage (hardware tab system row)
      try{
        var vendorVal = v('vendor');
        var modelVal  = v('model');
        var serialVal = v('serial');
        var slotVal   = v('slot');
        var uSizeVal  = v('u_size');
        localStorage.setItem('frame:current:vendor', String(vendorVal||''));
        localStorage.setItem('frame:current:model',  String(modelVal||''));
        localStorage.setItem('frame:current:serial', String(serialVal||''));
        localStorage.setItem('frame:current:slot',   String(slotVal||''));
        localStorage.setItem('frame:current:u_size', String(uSizeVal||''));
        localStorage.setItem('frame:current:rack_face', String((v('rack_face')) || ''));
      }catch(_){ }
    }

    // Init Basic Info on page load (storage fast path + API authoritative refresh)
    (function initBasicInfoOnLoad(){
      function setHeader(work, system){
        try{
          var titleEl = document.getElementById('page-title') || document.querySelector('.page-header h1');
          var subEl = document.getElementById('page-subtitle') || document.querySelector('.page-header p');
          if(titleEl) titleEl.textContent = String(work || '-');
          if(subEl) subEl.textContent = String(system || '-');
        }catch(_e){ }
      }

      function getStoredSelectedRow(){
        try{
          if(window.BlossomHardwareDetail && typeof window.BlossomHardwareDetail.getSelectedRow === 'function'){
            return window.BlossomHardwareDetail.getSelectedRow('frame');
          }
        }catch(_e0){ }
        try{
          var raw = sessionStorage.getItem('frame:selected:row') || localStorage.getItem('frame:selected:row');
          return raw ? JSON.parse(raw) : null;
        }catch(_e1){ return null; }
      }

      function clearStoredSelectedRow(){
        try{
          if(window.BlossomHardwareDetail && typeof window.BlossomHardwareDetail.removeStored === 'function'){
            try{ window.BlossomHardwareDetail.removeStored('frame:selected:row', 'session'); }catch(_a0){ }
            try{ window.BlossomHardwareDetail.removeStored('frame:selected:row', 'local'); }catch(_a1){ }
            try{ window.BlossomHardwareDetail.removeStored('frame:selected:asset_id', 'session'); }catch(_a2){ }
            try{ window.BlossomHardwareDetail.removeStored('frame:selected:asset_id', 'local'); }catch(_a3){ }
          }
        }catch(_e0){ }
        try{ sessionStorage.removeItem('frame:selected:row'); }catch(_e1){ }
        try{ localStorage.removeItem('frame:selected:row'); }catch(_e2){ }
        try{ sessionStorage.removeItem('frame:selected:asset_id'); }catch(_e3){ }
        try{ localStorage.removeItem('frame:selected:asset_id'); }catch(_e4){ }
      }

      function storeSelectedRow(row){
        try{
          if(window.BlossomHardwareDetail && typeof window.BlossomHardwareDetail.storeSelectedRow === 'function'){
            window.BlossomHardwareDetail.storeSelectedRow('frame', row);
            return;
          }
        }catch(_e0){ }
        try{ sessionStorage.setItem('frame:selected:row', JSON.stringify(row || {})); }catch(_e1){ }
        try{ localStorage.setItem('frame:selected:row', JSON.stringify(row || {})); }catch(_e2){ }
        try{
          var id = (row && (row.asset_id != null ? row.asset_id : row.id));
          if(id != null && String(id).trim() !== ''){
            sessionStorage.setItem('frame:selected:asset_id', String(id));
            localStorage.setItem('frame:selected:asset_id', String(id));
          }
        }catch(_e3){ }
      }

      function resolveAssetIdForLoad(){
        try{
          if(window.BlossomHardwareDetail && typeof window.BlossomHardwareDetail.resolveAssetId === 'function'){
            var rid = window.BlossomHardwareDetail.resolveAssetId('frame');
            if(rid) return rid;
          }
        }catch(_e0){ }
        try{
          var fromStorage = sessionStorage.getItem('frame:selected:asset_id') || localStorage.getItem('frame:selected:asset_id');
          if(fromStorage) return String(fromStorage);
        }catch(_e1){ }
        return '';
      }

      // 1) Storage fast path (if user navigated from list)
      try{
        var stored = getStoredSelectedRow();
        if(stored){
          var normalized0 = normalizeAssetRecordForDetail(stored) || stored;
          setHeader(normalized0.work_name, normalized0.system_name);
          applyRowToBasicInfo(normalized0);
        }
      }catch(_eInit0){ }

      // 2) API authoritative refresh (DB values)
      (function(){
        var rawId = resolveAssetIdForLoad();
        var n = parseInt(String(rawId || '').trim(), 10);
        if(!n || isNaN(n) || n <= 0) return;

        var url = '/api/hardware/frame/assets/' + encodeURIComponent(String(n));

        function doFetch(){
          try{
            if(window.BlossomHardwareDetail && typeof window.BlossomHardwareDetail.fetchJSON === 'function'){
              return window.BlossomHardwareDetail.fetchJSON(url, { method:'GET' });
            }
          }catch(_e0){ }
          return fetch(url, { method:'GET', headers:{ 'Accept':'application/json' } })
            .then(function(r){
              // Some 404 handlers return HTML, not JSON. Use text() then best-effort JSON parse.
              return r.text().then(function(t){
                var j = null;
                try{ j = t ? JSON.parse(t) : null; }catch(_eJson){ j = null; }
                return { ok:r.ok, status:r.status, data:j };
              });
            });
        }

        try{
          doFetch().then(function(payload){
            var ok = true;
            var data = payload;
            var status = 0;
            if(payload && payload.data !== undefined && typeof payload.ok === 'boolean'){
              ok = payload.ok;
              data = payload.data;
              status = payload.status || 0;
            }
            if(!ok || !data || data.success === false){
              // If user landed on detail with a stale/nonexistent asset id, clear it so refresh stops 404-ing.
              try{
                var msg = (data && (data.message || data.error)) ? String(data.message || data.error) : '';
                if(status === 404 || (msg && (msg.indexOf('찾을 수') !== -1 || msg.toLowerCase().indexOf('not found') !== -1 || msg.indexOf('404') !== -1))){
                  clearStoredSelectedRow();
                }
              }catch(_eNF){ }
              return;
            }
            var item = data.item || data;
            var normalized = normalizeAssetRecordForDetail(item);
            if(!normalized) return;
            storeSelectedRow(normalized);
            setHeader(normalized.work_name, normalized.system_name);
            applyRowToBasicInfo(normalized);
          }).catch(function(err){
            // fetchJSON() may throw on 404 before producing JSON.
            try{
              var m = err && err.message ? String(err.message) : '';
              if(m && (m.indexOf('404') !== -1 || m.toLowerCase().indexOf('not found') !== -1)){
                clearStoredSelectedRow();
              }
            }catch(_eC){ }
          });
        }catch(_e1){ }
      })();
    })();
    // Wire the Basic Info edit modal open/close/save
    (function(){
      function openModalLocal(id){ var el=document.getElementById(id); if(!el) return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden','false'); }
      function closeModalLocal(id){ var el=document.getElementById(id); if(!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } }
      var openBtn = document.getElementById(EDIT_OPEN_ID);
      if(openBtn){
        openBtn.addEventListener('click', function(){
          // Ensure we have stable FK code values for preselecting dropdowns.
          // List-page rows may have only labels; detail API has *_code fields.
          function hasRequiredCodes(row){
            if(!row) return false;
            var keys = ['work_type_code','work_category_code','work_status_code','work_operation_code','work_group_code'];
            for(var i=0;i<keys.length;i++){
              var k = keys[i];
              var v = row[k];
              if(!v || !looksLikeCode(v)) return false;
            }
            return true;
          }
          function storeSelectedRow(row){
            try{
              var storagePrefix = (typeof STORAGE_PREFIX !== 'undefined' && STORAGE_PREFIX) ? STORAGE_PREFIX : 'frame';
              try{ sessionStorage.setItem(storagePrefix+':selected:row', JSON.stringify(row)); }catch(_){ }
              try{ localStorage.setItem(storagePrefix+':selected:row', JSON.stringify(row)); }catch(_2){ }
              if(row && row.id != null){
                try{ sessionStorage.setItem(storagePrefix+':selected:asset_id', String(row.id)); }catch(_3){ }
                try{ localStorage.setItem(storagePrefix+':selected:asset_id', String(row.id)); }catch(_4){ }
              }
            }catch(_e){ }
          }
          function ensureCodesBeforeBuild(){
            try{
              var existing = getSelectedRow();
              if(existing && hasRequiredCodes(existing)) return Promise.resolve(existing);
              var assetId = resolveAssetId();
              if(!assetId) return Promise.resolve(existing);
              return fetch('/api/hardware/frame/assets/' + encodeURIComponent(String(assetId)), { method:'GET', headers:{ 'Accept':'application/json' } })
                .then(function(r){
                  if(!r.ok){
                    if(r.status === 404){
                      // Clear stale selection so subsequent tab visits don't keep 404-ing.
                      try{ sessionStorage.removeItem('frame:selected:row'); }catch(_){ }
                      try{ localStorage.removeItem('frame:selected:row'); }catch(_2){ }
                      try{ sessionStorage.removeItem('frame:selected:asset_id'); }catch(_3){ }
                      try{ localStorage.removeItem('frame:selected:asset_id'); }catch(_4){ }
                    }
                    return null;
                  }
                  return r.json().catch(function(){ return null; });
                })
                .then(function(data){
                  if(!data || data.success === false) return existing;
                  var item = data.item || null;
                  var normalized = normalizeAssetRecordForDetail(item);
                  if(!normalized) return existing;
                  // Merge: prefer any existing human-readable labels, but bring in codes from API.
                  var merged = {};
                  try{
                    if(existing && typeof existing === 'object'){
                      Object.keys(existing).forEach(function(k){ merged[k] = existing[k]; });
                    }
                    Object.keys(normalized).forEach(function(k){ merged[k] = normalized[k]; });
                  }catch(_e){ merged = normalized; }
                  // Preserve hydrated labels if already present
                  try{
                    var labelKeys = ['work_type','work_category','work_status','work_operation','work_group','sys_dept','sys_owner','svc_dept','svc_owner','vendor','model','location_place','location_pos'];
                    if(existing){
                      labelKeys.forEach(function(k){
                        var ex = existing[k];
                        if(ex && String(ex).trim() && String(ex).trim() !== '-' && !looksLikeCode(ex)) merged[k] = ex;
                      });
                    }
                  }catch(_e2){ }
                  storeSelectedRow(merged);
                  return merged;
                })
                .catch(function(){ return existing; });
            }catch(_e){
              return Promise.resolve(getSelectedRow());
            }
          }

          ensureCodesBeforeBuild().then(function(){
            buildEditFormFromPage();
            openModalLocal(EDIT_MODAL_ID);

            // On-premise pattern: populate searchable FK selects only when modal is visible.
            try{
              var modalRoot = document.getElementById(EDIT_MODAL_ID);
              if(modalRoot && window.BlossomFkSelect && typeof window.BlossomFkSelect.enhance === 'function'){
                window.BlossomFkSelect.enhance(modalRoot);
              }
            }catch(_eFk){ }

            // Dept selects populate async; kick change events so owner selects refresh.
            try{
              var form = document.getElementById(EDIT_FORM_ID);
              function kick(){
                try{
                  var sysDept = form && form.querySelector ? form.querySelector('[name="sys_dept"]') : null;
                  if(sysDept) sysDept.dispatchEvent(new Event('change', { bubbles:true }));
                  var svcDept = form && form.querySelector ? form.querySelector('[name="svc_dept"]') : null;
                  if(svcDept) svcDept.dispatchEvent(new Event('change', { bubbles:true }));
                }catch(_e){ }
              }
              setTimeout(kick, 100);
              setTimeout(kick, 350);
            }catch(_e2){ }

            // Cascade clear (on-premise parity):
            // - "시스템 제조사" 지움 => 제조사 + 모델명 함께 지움
            // - "시스템 장소" 지움 => 장소 + 위치 함께 지움
            // - "시스템 담당부서" 지움 => 담당부서 + 담당자 함께 지움
            // - "서비스 담당부서" 지움 => 담당부서 + 담당자 함께 지움
            try{
              var form2 = document.getElementById(EDIT_FORM_ID);
              function syncSearchableSelect(sel){
                try{
                  if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
                    window.BlossomSearchableSelect.syncAll(sel);
                  }
                }catch(_e){ }
              }
              if(form2){
                var vendorSel = form2.querySelector('[name="vendor"]');
                var modelSel = form2.querySelector('[name="model"]');
                function applyVendorModelState(){
                  try{
                    if(!vendorSel || !modelSel) return;
                    if(!String(vendorSel.value||'').trim()){
                      modelSel.value = '';
                      try{ modelSel.disabled = true; }catch(_d){ }
                      try{ modelSel.dispatchEvent(new Event('change', { bubbles:true })); }catch(_){ }
                      syncSearchableSelect(modelSel);
                    } else {
                      try{ modelSel.disabled = false; }catch(_d2){ }
                      syncSearchableSelect(modelSel);
                    }
                    syncSearchableSelect(vendorSel);
                  }catch(_e){ }
                }
                if(vendorSel && modelSel){
                  if(!vendorSel.dataset._cascadeBound){
                    vendorSel.dataset._cascadeBound = '1';
                    vendorSel.addEventListener('change', function(){
                      try{
                        applyVendorModelState();
                        // FK option hydration is async; enforce state again after it settles.
                        setTimeout(function(){ try{ applyVendorModelState(); }catch(_){ } }, 80);
                        setTimeout(function(){ try{ applyVendorModelState(); }catch(_){ } }, 260);
                        setTimeout(function(){ try{ applyVendorModelState(); }catch(_){ } }, 520);
                      }catch(_eV){ }
                    });
                  }
                }

                var placeSel = form2.querySelector('[name="location_place"]');
                var posSel = form2.querySelector('[name="location_pos"]');
                function applyPlacePosState(){
                  try{
                    if(!placeSel || !posSel) return;
                    if(!String(placeSel.value||'').trim()){
                      posSel.value = '';
                      try{ posSel.dispatchEvent(new Event('change', { bubbles:true })); }catch(_){ }
                      try{ posSel.disabled = true; }catch(_d){ }
                      syncSearchableSelect(posSel);
                    } else {
                      try{ posSel.disabled = false; }catch(_d2){ }
                      syncSearchableSelect(posSel);
                    }
                    syncSearchableSelect(placeSel);
                  }catch(_e){ }
                }
                if(placeSel && posSel){
                  if(!placeSel.dataset._cascadeBound){
                    placeSel.dataset._cascadeBound = '1';
                    placeSel.addEventListener('change', function(){
                      try{
                        applyPlacePosState();
                        // FK option hydration is async; enforce state again after it settles.
                        setTimeout(function(){ try{ applyPlacePosState(); }catch(_){ } }, 80);
                        setTimeout(function(){ try{ applyPlacePosState(); }catch(_){ } }, 260);
                        setTimeout(function(){ try{ applyPlacePosState(); }catch(_){ } }, 520);
                      }catch(_eP){ }
                    });
                  }
                }

                var sysDeptSel = form2.querySelector('[name="sys_dept"]');
                var sysOwnerSel = form2.querySelector('[name="sys_owner"]');
                function markUserCleared(el){
                  if(!el) return;
                  try{ el.dataset.userCleared = '1'; }catch(_e){}
                }

                function applySysDeptOwnerState(opts){
                  opts = opts || {};
                  var userAction = !!opts.userAction;
                  try{
                    if(!sysDeptSel || !sysOwnerSel) return;
                    if(!String(sysDeptSel.value||'').trim()){
                      // Dept is empty: disable owner.
                      // Only CLEAR owner when dept was cleared by the user.
                      if(userAction){
                        try{ sysOwnerSel.value = ''; }catch(_c){ }
                        markUserCleared(sysOwnerSel);
                        try{ sysOwnerSel.dispatchEvent(new Event('change', { bubbles:true })); }catch(_){ }
                      }
                      try{ sysOwnerSel.disabled = true; }catch(_d){ }
                      syncSearchableSelect(sysOwnerSel);
                    } else {
                      try{ sysOwnerSel.disabled = false; }catch(_d2){ }
                      syncSearchableSelect(sysOwnerSel);
                    }
                    syncSearchableSelect(sysDeptSel);
                  }catch(_e){ }
                }
                if(sysDeptSel && sysOwnerSel){
                  if(!sysDeptSel.dataset._cascadeBound){
                    sysDeptSel.dataset._cascadeBound = '1';
                    sysDeptSel.addEventListener('change', function(ev){
                      try{
                        // If user explicitly chooses blank, mark it as user-cleared.
                        try{ if(ev && ev.isTrusted && !String(sysDeptSel.value||'').trim()) markUserCleared(sysDeptSel); }catch(_m){ }
                        applySysDeptOwnerState({ userAction: !!(ev && ev.isTrusted) });
                        // Owner list loads async; re-apply disabled/cleared state after populate.
                        setTimeout(function(){ try{ applySysDeptOwnerState({ userAction:false }); }catch(_){ } }, 120);
                        setTimeout(function(){ try{ applySysDeptOwnerState({ userAction:false }); }catch(_){ } }, 360);
                      }catch(_eSD){ }
                    });
                  }

                  // If user explicitly clears owner (selects blank), mark it.
                  if(!sysOwnerSel.dataset._userClearBound){
                    sysOwnerSel.dataset._userClearBound = '1';
                    sysOwnerSel.addEventListener('change', function(evOwn){
                      try{ if(evOwn && evOwn.isTrusted && !String(sysOwnerSel.value||'').trim()) markUserCleared(sysOwnerSel); }catch(_){ }
                    });
                  }
                }

                var svcDeptSel = form2.querySelector('[name="svc_dept"]');
                var svcOwnerSel = form2.querySelector('[name="svc_owner"]');
                function applySvcDeptOwnerState(opts){
                  opts = opts || {};
                  var userAction = !!opts.userAction;
                  try{
                    if(!svcDeptSel || !svcOwnerSel) return;
                    if(!String(svcDeptSel.value||'').trim()){
                      if(userAction){
                        try{ svcOwnerSel.value = ''; }catch(_c2){ }
                        markUserCleared(svcOwnerSel);
                        try{ svcOwnerSel.dispatchEvent(new Event('change', { bubbles:true })); }catch(_){ }
                      }
                      try{ svcOwnerSel.disabled = true; }catch(_d){ }
                      syncSearchableSelect(svcOwnerSel);
                    } else {
                      try{ svcOwnerSel.disabled = false; }catch(_d2){ }
                      syncSearchableSelect(svcOwnerSel);
                    }
                    syncSearchableSelect(svcDeptSel);
                  }catch(_e){ }
                }
                if(svcDeptSel && svcOwnerSel){
                  if(!svcDeptSel.dataset._cascadeBound){
                    svcDeptSel.dataset._cascadeBound = '1';
                    svcDeptSel.addEventListener('change', function(ev2){
                      try{
                        try{ if(ev2 && ev2.isTrusted && !String(svcDeptSel.value||'').trim()) markUserCleared(svcDeptSel); }catch(_m2){ }
                        applySvcDeptOwnerState({ userAction: !!(ev2 && ev2.isTrusted) });
                        // Owner list loads async; re-apply disabled/cleared state after populate.
                        setTimeout(function(){ try{ applySvcDeptOwnerState({ userAction:false }); }catch(_){ } }, 120);
                        setTimeout(function(){ try{ applySvcDeptOwnerState({ userAction:false }); }catch(_){ } }, 360);
                      }catch(_eVD){ }
                    });
                  }

                  if(!svcOwnerSel.dataset._userClearBound){
                    svcOwnerSel.dataset._userClearBound = '1';
                    svcOwnerSel.addEventListener('change', function(evOwn2){
                      try{ if(evOwn2 && evOwn2.isTrusted && !String(svcOwnerSel.value||'').trim()) markUserCleared(svcOwnerSel); }catch(_){ }
                    });
                  }
                }

                // Apply cascade rules immediately on open (covers inconsistent stored state).
                try{ applyVendorModelState(); }catch(_){ }
                try{ applyPlacePosState(); }catch(_){ }
                try{ applySysDeptOwnerState({ userAction:false }); }catch(_){ }
                try{ applySvcDeptOwnerState({ userAction:false }); }catch(_){ }

                // Re-apply after async FK hydration (options + selected values may arrive later).
                setTimeout(function(){ try{ applyVendorModelState(); }catch(_){ } }, 120);
                setTimeout(function(){ try{ applyVendorModelState(); }catch(_){ } }, 420);
                setTimeout(function(){ try{ applyPlacePosState(); }catch(_){ } }, 120);
                setTimeout(function(){ try{ applyPlacePosState(); }catch(_){ } }, 420);
                setTimeout(function(){ try{ applySysDeptOwnerState({ userAction:false }); }catch(_){ } }, 160);
                setTimeout(function(){ try{ applySysDeptOwnerState({ userAction:false }); }catch(_){ } }, 520);
                setTimeout(function(){ try{ applySvcDeptOwnerState({ userAction:false }); }catch(_){ } }, 160);
                setTimeout(function(){ try{ applySvcDeptOwnerState({ userAction:false }); }catch(_){ } }, 520);
              }
            }catch(_eCascade){ }
          });
        });
      }
      var closeBtn = document.getElementById(EDIT_CLOSE_ID);
      if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalLocal(EDIT_MODAL_ID); }); }
      var modalEl = document.getElementById(EDIT_MODAL_ID);
      if(modalEl){ modalEl.addEventListener('click', function(e){ if(e.target === modalEl) closeModalLocal(EDIT_MODAL_ID); }); document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(EDIT_MODAL_ID); }); }
      var saveBtn = document.getElementById(EDIT_SAVE_ID);
      function readEditFormValues(){
        var form = document.getElementById(EDIT_FORM_ID);
        if(!form) return {};
        var values = {};
        // Meta: track which fields are <select> so we can trust their values as codes.
        // (Some code values include Korean; heuristics like looksLikeCode() would incorrectly reject them.)
        values.__isSelect = {};
        // Meta: track explicit user-clears.
        values.__userCleared = {};
        var els = form.querySelectorAll('input[name], select[name], textarea[name]');
        els.forEach(function(el){
          var name = el.getAttribute('name');
          if(!name) return;
          values[name] = (el.value == null) ? '' : String(el.value).trim();
          try{ values.__isSelect[name] = (String(el.tagName || '').toLowerCase() === 'select'); }catch(_){ }
          try{ values.__userCleared[name] = (el && el.dataset && String(el.dataset.userCleared||'') === '1') ? 1 : 0; }catch(_){ values.__userCleared[name] = 0; }
        });
        return values;
      }

      function getSelectedRow(){
        try{
          var storagePrefix = (typeof STORAGE_PREFIX !== 'undefined' && STORAGE_PREFIX) ? STORAGE_PREFIX : 'frame';
          var raw = sessionStorage.getItem(storagePrefix+':selected:row') || localStorage.getItem(storagePrefix+':selected:row');
          if(raw){
            var row = JSON.parse(raw);
            if(row && typeof row === 'object') return row;
          }
        }catch(_){ }
        return null;
      }

      function resolveAssetId(){
        var row = getSelectedRow();
        var rowId = (row && (row.hardware_id != null ? row.hardware_id : (row.asset_id != null ? row.asset_id : row.id)));
        if(rowId != null && String(rowId).trim() !== ''){
          var n = parseInt(rowId, 10);
          if(!isNaN(n) && n > 0) return n;
        }
        try{
          var fromStorage = sessionStorage.getItem('frame:selected:asset_id') || localStorage.getItem('frame:selected:asset_id');
          if(fromStorage){
            var n2 = parseInt(fromStorage, 10);
            if(!isNaN(n2) && n2 > 0) return n2;
          }
        }catch(_e){ }
        try{
          var qs = new URLSearchParams(window.location.search || '');
          var rawId = qs.get('hardware_id') || qs.get('hardwareId') || qs.get('id') || qs.get('asset_id') || qs.get('assetId');
          if(rawId){
            var n3 = parseInt(rawId, 10);
            if(!isNaN(n3) && n3 > 0) return n3;
          }
        }catch(_e2){ }
        return null;
      }

      function looksLikeCode(value){
        var v = (value == null) ? '' : String(value).trim();
        if(!v || v === '-') return false;
        // Heuristic: codes are usually ascii tokens; Korean/space-heavy values are likely display labels.
        if(/[\u3131-\uD79D]/.test(v)) return false;
        if(/\s/.test(v)) return false;
        return /^[A-Za-z0-9_:\-./]+$/.test(v);
      }

      function buildUpdatePayload(formValues, selectedRow){
        var payload = {};
        selectedRow = selectedRow || {};

        var isSelect = (formValues && formValues.__isSelect) ? formValues.__isSelect : {};
        var userCleared = (formValues && formValues.__userCleared) ? formValues.__userCleared : {};

        // For critical FK fields, send canonical DB column keys directly.
        // This avoids any backend alias-mapping mismatch and prevents heuristic drops.
        var FK_CANONICAL_KEYS = {
          vendor: 'manufacturer_code',
          model: 'server_code',
          location_place: 'center_code',
          location_pos: 'rack_code',
          sys_dept: 'system_dept_code',
          sys_owner: 'system_owner_emp_no',
          svc_dept: 'service_dept_code',
          svc_owner: 'service_owner_emp_no'
        };

        function destKeyForField(field){
          return FK_CANONICAL_KEYS[field] || field;
        }

        // Fields that must support explicit clearing ("지움") by sending null.
        var CLEARABLE_FIELDS = { vendor:1, model:1, location_place:1, location_pos:1, sys_dept:1, sys_owner:1, svc_dept:1, svc_owner:1 };

        // Always-updatable plain fields
        function setIf(name, val){
          var v = (val == null) ? '' : String(val).trim();
          if(!v || v === '-') return;
          payload[name] = v;
        }

        setIf('work_name', formValues.work_name);
        setIf('system_name', formValues.system_name);
        setIf('system_ip', formValues.system_ip);
        // DB column is mgmt_ip
        setIf('mgmt_ip', formValues.manage_ip);

        // Serial number: allow updating and explicit clearing.
        // UI field name is 'serial', DB column is 'serial_number'.
        (function(){
          var desired = (formValues.serial == null) ? '' : String(formValues.serial).trim();
          if(desired === '-') desired = '';
          var original = (selectedRow.serial == null) ? '' : String(selectedRow.serial).trim();
          if(original === '-') original = '';
          // Only send if changed, or if user cleared a previously-set value.
          if(desired){
            if(desired !== original){
              payload.serial_number = desired;
            }
          } else {
            if(original){
              payload.serial_number = null;
            }
          }
        })();

        // virtualization_type in DB
        if(formValues.virtualization && formValues.virtualization !== '-') payload.virtualization_type = String(formValues.virtualization).trim();

        // Numeric-ish / nullable fields
        function setNullable(destKey, rawVal){
          var v = (rawVal == null) ? '' : String(rawVal).trim();
          if(v === '-') v = '';
          if(v === ''){ payload[destKey] = null; return; }
          payload[destKey] = v;
        }

        // slot/u_size: keep previous behavior (do not clear implicitly).
        if(formValues.slot && formValues.slot !== '-') payload.slot = String(formValues.slot).trim();
        if(formValues.u_size && formValues.u_size !== '-') payload.u_size = String(formValues.u_size).trim();

        // CIA + derived fields: must support explicit clearing.
        if(formValues.confidentiality != null) setNullable('cia_confidentiality', formValues.confidentiality);
        if(formValues.integrity != null) setNullable('cia_integrity', formValues.integrity);
        if(formValues.availability != null) setNullable('cia_availability', formValues.availability);
        if(formValues.security_score != null) setNullable('security_score', formValues.security_score);
        if(formValues.system_grade != null) setNullable('system_grade', formValues.system_grade);

        // Flags: explicit clearing should propagate to DB NULL.
        if(formValues.core_flag != null) setNullable('core_flag', formValues.core_flag);
        if(formValues.dr_built != null) setNullable('dr_built', formValues.dr_built);
        if(formValues.svc_redundancy != null) setNullable('svc_redundancy', formValues.svc_redundancy);

        // FK-coded fields: keep original codes unless user typed a code-like value.
        var fkMap = {
          work_type: 'work_type_code',
          work_category: 'work_category_code',
          work_status: 'work_status_code',
          work_operation: 'work_operation_code',
          work_group: 'work_group_code',
          vendor: 'manufacturer_code',
          model: 'server_code',
          location_place: 'center_code',
          location_pos: 'rack_code',
          sys_dept: 'system_dept_code',
          svc_dept: 'service_dept_code',
          sys_owner: 'system_owner_emp_no',
          svc_owner: 'service_owner_emp_no'
        };
        Object.keys(fkMap).forEach(function(field){
          var desired = (formValues[field] == null) ? '' : String(formValues[field]).trim();
          var destKey = destKeyForField(field);
          // Allow explicit clearing ("지움")
          if(desired === '' && CLEARABLE_FIELDS[field]){
            // Only clear when explicitly user-cleared.
            if(userCleared && userCleared[field]){
              payload[destKey] = null;
              // Cascade: clearing vendor also clears model.
              if(field === 'vendor') payload[destKeyForField('model')] = null;
              // Cascade: clearing location_place also clears location_pos.
              if(field === 'location_place') payload[destKeyForField('location_pos')] = null;
              // Cascade: clearing dept also clears owner.
              if(field === 'sys_dept') payload[destKeyForField('sys_owner')] = null;
              if(field === 'svc_dept') payload[destKeyForField('svc_owner')] = null;
            }
            return;
          }
          if(!desired || desired === '-') return;

          // If the field is an enhanced <select>, its value is the code (even if it contains Korean).
          // Trust it and send it.
          if(isSelect && isSelect[field]){
            payload[destKey] = desired;
            return;
          }

          var originalLabel = (selectedRow[field] == null) ? '' : String(selectedRow[field]).trim();
          var originalCode = (selectedRow[fkMap[field]] == null) ? '' : String(selectedRow[fkMap[field]]).trim();

          if(desired === originalLabel && originalCode){
            payload[destKey] = originalCode;
            return;
          }
          if(looksLikeCode(desired)){
            payload[destKey] = desired;
            return;
          }
          // If user entered a display label we can't reliably resolve to a code here.
          // Keep existing code by not setting this field.
        });

        // If rack cleared independently, keep it cleared.
        try{
          var lp = (formValues.location_place == null) ? '' : String(formValues.location_place).trim();
          var lpos = (formValues.location_pos == null) ? '' : String(formValues.location_pos).trim();
          if(lp !== '' && lpos === '') payload[destKeyForField('location_pos')] = null;
        }catch(_eClrRack){}

        return payload;
      }

      function updateSelectedRowStorageFromApi(item, fallbackId){
        try{
          if(!item) return;
          var storagePrefix = (typeof STORAGE_PREFIX !== 'undefined' && STORAGE_PREFIX) ? STORAGE_PREFIX : 'frame';
          var row = normalizeAssetRecordForDetail(item);
          if(!row) return;
          // Some endpoints may omit id in PUT response; keep a stable fallback.
          if((row.id == null || String(row.id).trim() === '') && fallbackId != null){
            row.id = fallbackId;
          }
          hydrateAllBasicInfoLabels(row).then(function(r){
            try{ sessionStorage.setItem(storagePrefix+':selected:row', JSON.stringify(r)); }catch(_){ }
            try{ localStorage.setItem(storagePrefix+':selected:row', JSON.stringify(r)); }catch(_2){ }
            var stableId = (r && r.id != null && String(r.id).trim() !== '') ? r.id : (item.id != null ? item.id : fallbackId);
            if(stableId != null){
              try{ sessionStorage.setItem(storagePrefix+':selected:asset_id', String(stableId)); }catch(_3){ }
              try{ localStorage.setItem(storagePrefix+':selected:asset_id', String(stableId)); }catch(_4){ }
            }
            applyRowToBasicInfo(r);
          });
        }catch(_e){ }
      }

      function apiUpdateBasicInfo(){
        return new Promise(function(resolve, reject){
          try{
            var assetId = resolveAssetId();
            if(!assetId){ reject(new Error('자산 ID를 찾을 수 없습니다. 목록에서 다시 선택 후 상세로 진입해 주세요.')); return; }
            var selectedRow = getSelectedRow() || {};
            var formValues = readEditFormValues();
            var payload = buildUpdatePayload(formValues, selectedRow);

            try{ window.__FRAME_DETAIL_LAST_PUT_PAYLOAD = payload; }catch(_dbg0){}
            try{ if(window.__FRAME_DETAIL_DEBUG_SAVE){ console.debug('[frame_detail] PUT payload', payload); } }catch(_dbg1){}

            // If no payload changes, treat as success.
            if(!payload || Object.keys(payload).length === 0){ resolve(null); return; }

            fetch('/api/hardware/frame/assets/' + encodeURIComponent(String(assetId)), {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
              body: JSON.stringify(payload)
            })
              .then(function(r){ return r.json().then(function(data){ return { ok: r.ok, data: data }; }); })
              .then(function(res){
                var data = res.data;
                if(!data || data.success === false){
                  reject(new Error((data && data.message) ? data.message : '저장에 실패했습니다.')); return;
                }
                // On-premise pattern: after PUT, re-GET to ensure we have full row (codes + labels).
                // PUT responses can be partial and may omit *_code fields.
                var updated = data.item || null;
                // Keep asset_id stable even if response omits id.
                try{ sessionStorage.setItem('frame:selected:asset_id', String(assetId)); }catch(_sid){ }
                try{ localStorage.setItem('frame:selected:asset_id', String(assetId)); }catch(_lid){ }

                fetch('/api/hardware/frame/assets/' + encodeURIComponent(String(assetId)), { method:'GET', headers:{ 'Accept':'application/json' } })
                  .then(function(r2){ return r2.json().then(function(j){ return { ok:r2.ok, data:j }; }); })
                  .then(function(res2){
                    var d2 = res2 && res2.data;
                    var item2 = (res2 && res2.ok && d2 && d2.success !== false) ? (d2.item || null) : null;
                    if(item2){
                      updateSelectedRowStorageFromApi(item2, assetId);
                      resolve(item2);
                      return;
                    }
                    if(updated){ updateSelectedRowStorageFromApi(updated, assetId); }
                    resolve(updated);
                  })
                  .catch(function(){
                    if(updated){ updateSelectedRowStorageFromApi(updated, assetId); }
                    resolve(updated);
                  });
              })
              .catch(function(err){ reject(err); });
          }catch(e){ reject(e); }
        });
      }

      function showSaveError(err){
        var msg = (err && err.message) ? err.message : '저장에 실패했습니다.';
        try{ alert(msg); }catch(_){ console.warn(msg); }
      }

      if(saveBtn){
        saveBtn.addEventListener('click', function(){
          var btn = saveBtn;
          if(btn.disabled) return;
          btn.disabled = true;
          btn.classList.add('is-loading');
          apiUpdateBasicInfo()
            .then(function(){
              updatePageFromForm();
              closeModalLocal(EDIT_MODAL_ID);
            })
            .catch(function(err){
              showSaveError(err);
            })
            .finally(function(){
              btn.disabled = false;
              btn.classList.remove('is-loading');
            });
        });
      }
    })();

      // Tab behaviors moved to /static/js/_detail/tabXX-*.js

  });

  // No modal APIs to expose
})();

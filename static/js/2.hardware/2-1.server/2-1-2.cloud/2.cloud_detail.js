// cloud_detail.js: Cloud Server Detail page behaviors (tab logic removed)

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

  } catch(_eSidebar) {
    // no-op
  }

  var STORAGE_PREFIX = 'cloud';
  var EDIT_OPEN_ID = 'detail-edit-open';
  var EDIT_MODAL_ID = 'system-edit-modal';
  var EDIT_FORM_ID = 'system-edit-form';
  var EDIT_SAVE_ID = 'system-edit-save';
  var EDIT_CLOSE_ID = 'system-edit-close';
  var API_ENDPOINT = '/api/hardware/cloud/assets';

  function __normStr(v){ return (v == null) ? '' : String(v).trim(); }
  function __isPlaceholderText(v){
    var s = __normStr(v);
    if(!s) return true;
    if(s === '-' || s === '—') return true;
    // Generic placeholders
    if(s === '선택') return true;
    // FK select placeholders (must render as '-')
    if(
      s === '부서 선택' ||
      s === '담당자 선택' ||
      s === '부서를 먼저 선택' ||
      s === '장소 선택' ||
      s === '위치 선택' ||
      s === '장소를 먼저 선택' ||
      s === '제조사를 먼저 선택' ||
      s === '모델 선택'
    ) return true;
    return false;
  }
  function __displayOrDash(v){
    var s = __normStr(v);
    return __isPlaceholderText(s) ? '-' : s;
  }
  function __looksLikeCodeToken(value){
    var v = __normStr(value);
    if(!v || v === '-') return false;
    if(/[\u3131-\uD79D]/.test(v)) return false;
    if(/\s/.test(v)) return false;
    return /^[A-Za-z0-9_:\-./]+$/.test(v);
  }

  function __notify(message, title){
    var msg = __normStr(message) || '요청 처리 중 오류가 발생했습니다.';
    try{
      if(window.BlossomToast && typeof window.BlossomToast.show === 'function'){
        window.BlossomToast.show(msg, { title: title || '알림', tone: 'danger' });
        return;
      }
    }catch(_e){ }
    try{ alert((title ? (title + '\n') : '') + msg); }catch(_e2){ }
  }

  function openModal(id){
    var el = document.getElementById(id);
    if(!el) return;
    document.body.classList.add('modal-open');
    el.classList.add('show');
    el.setAttribute('aria-hidden','false');
  }
  function closeModal(id){
    var el = document.getElementById(id);
    if(!el) return;
    el.classList.remove('show');
    el.setAttribute('aria-hidden','true');
    if(!document.querySelector('.modal-overlay-full.show')){
      document.body.classList.remove('modal-open');
    }
  }

  function syncSearchable(root){
    try{
      if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
        window.BlossomSearchableSelect.syncAll(root);
      }
    }catch(_e){ }
  }

  function getSelectedRow(){
    try{
      var raw = sessionStorage.getItem(STORAGE_PREFIX+':selected:row') || localStorage.getItem(STORAGE_PREFIX+':selected:row');
      if(raw){
        var row = JSON.parse(raw);
        if(row && typeof row === 'object') return row;
      }
    }catch(_e){ }
    return null;
  }
  function storeSelectedRow(row){
    try{
      sessionStorage.setItem(STORAGE_PREFIX+':selected:row', JSON.stringify(row));
    }catch(_e){ }
    try{
      localStorage.setItem(STORAGE_PREFIX+':selected:row', JSON.stringify(row));
    }catch(_e2){ }
    try{
      if(row && row.id != null) sessionStorage.setItem(STORAGE_PREFIX+':selected:asset_id', String(row.id));
    }catch(_e3){ }
    try{
      if(row && row.id != null) localStorage.setItem(STORAGE_PREFIX+':selected:asset_id', String(row.id));
    }catch(_e4){ }
    // Persist key fields for cross-tab usage (hardware tab system row)
    try{
      if(row){
        localStorage.setItem(STORAGE_PREFIX+':current:model',  String(row.server_model_name || row.model || ''));
        localStorage.setItem(STORAGE_PREFIX+':current:vendor', String(row.manufacturer_name || row.vendor || ''));
        localStorage.setItem(STORAGE_PREFIX+':current:serial', String(row.serial || row.serial_number || ''));
        localStorage.setItem(STORAGE_PREFIX+':current:fw',     String(row.fw || row.firmware || ''));
      }
    }catch(_eCache){ }
  }

  function resolveCloudAssetId(){
    var row = getSelectedRow();
    if(row && row.id != null && __normStr(row.id) !== ''){
      var n = parseInt(row.id, 10);
      if(!isNaN(n) && n > 0) return n;
    }
    try{
      var fromStorage = sessionStorage.getItem(STORAGE_PREFIX+':selected:asset_id') || localStorage.getItem(STORAGE_PREFIX+':selected:asset_id');
      if(fromStorage){
        var n2 = parseInt(fromStorage, 10);
        if(!isNaN(n2) && n2 > 0) return n2;
      }
    }catch(_e){ }
    try{
      var qs = new URLSearchParams(window.location.search || '');
      var rawId = qs.get('id') || qs.get('asset_id') || qs.get('assetId');
      if(rawId){
        var n3 = parseInt(rawId, 10);
        if(!isNaN(n3) && n3 > 0) return n3;
      }
    }catch(_e2){ }
    return null;
  }

  function normalizeVirtualizationLabel(raw){
    var v = __normStr(raw);
    if(!v) return '';
    if(v === '물리' || v.toLowerCase() === 'physical') return '물리서버';
    if(v === '가상' || v.toLowerCase() === 'virtual') return '가상서버';
    if(v === '클라우드' || v.toLowerCase() === 'cloud') return '클라우드';
    return v;
  }

  function normalizeOX(raw){
    var v = raw;
    if(v == null) return '';
    if(typeof v === 'boolean') return v ? 'O' : 'X';
    var s = __normStr(v);
    if(!s) return '';
    var up = s.toUpperCase();
    if(up === 'O' || up === 'X') return up;
    if(up === 'Y' || up === 'YES' || up === 'TRUE' || up === '1') return 'O';
    if(up === 'N' || up === 'NO' || up === 'FALSE' || up === '0') return 'X';
    // ints from DB
    if(s === '1') return 'O';
    if(s === '0') return 'X';
    return '';
  }

  function normalizeCoreFlag(item){
    if(!item) return '';
    var direct = __normStr(item.core_flag);
    if(direct) return direct;
    var v = item.is_core_system;
    if(v == null || __normStr(v) === '') return '';
    var ox = normalizeOX(v);
    if(ox === 'O') return '핵심';
    if(ox === 'X') return '일반';
    return '';
  }

  function normalizeCloudAssetForModal(item){
    if(!item) return null;
    return {
      id: item.id,
      asset_code: __normStr(item.asset_code),
      asset_name: __normStr(item.asset_name),
      // Labels for UI; codes for FK select preselect
      // API: work_type_* = 업무 분류, work_category_* = 업무 구분
      work_type: __normStr(item.work_type_name || item.work_type || item.work_type_code || item.work_category_name || item.work_category_code),
      work_type_code: __normStr(item.work_type_code || item.work_category_code),
      work_category: __normStr(item.work_category_name || item.work_category || item.work_category_code || item.work_division_name || item.work_division_code),
      work_category_code: __normStr(item.work_category_code || item.work_division_code),
      work_status: __normStr(item.work_status_name || item.work_status_code),
      work_status_code: __normStr(item.work_status_code),
      work_operation: __normStr(item.work_operation_name || item.work_operation_code),
      work_operation_code: __normStr(item.work_operation_code),
      work_group: __normStr(item.work_group_name || item.work_group_code),
      work_group_code: __normStr(item.work_group_code),
      work_name: __normStr(item.work_name),
      system_name: __normStr(item.system_name),
      system_ip: __normStr(item.system_ip),
      manage_ip: __normStr(item.mgmt_ip),
      mgmt_ip: __normStr(item.mgmt_ip),
      vendor: __normStr(item.manufacturer_name || item.manufacturer_code),
      manufacturer_code: __normStr(item.manufacturer_code),
      model: __normStr(item.server_model_name || item.model_name || item.model || item.server_code),
      server_code: __normStr(item.server_code),
      serial: __normStr(item.serial_number),
      virtualization: normalizeVirtualizationLabel(item.virtualization_type),
      location_place: __normStr(item.center_name || item.center_code),
      center_code: __normStr(item.center_code),
      location_pos: __normStr(item.rack_name || item.rack_code),
      rack_code: __normStr(item.rack_code),
      slot: (item.slot != null ? String(item.slot) : (item.system_slot != null ? String(item.system_slot) : '')),
      u_size: (item.u_size != null ? String(item.u_size) : (item.system_size != null ? String(item.system_size) : '')),
      rack_face: item.rack_face || 'FRONT',
      sys_dept: __normStr(item.system_dept_name || item.system_dept_code),
      system_dept_code: __normStr(item.system_dept_code),
      sys_owner: __normStr(item.system_owner_display || item.system_owner_name || item.system_owner_emp_no),
      system_owner_emp_no: __normStr(item.system_owner_emp_no),
      svc_dept: __normStr(item.service_dept_name || item.service_dept_code),
      service_dept_code: __normStr(item.service_dept_code),
      svc_owner: __normStr(item.service_owner_display || item.service_owner_name || item.service_owner_emp_no),
      service_owner_emp_no: __normStr(item.service_owner_emp_no),
      confidentiality: item.cia_confidentiality != null ? String(item.cia_confidentiality) : '',
      integrity: item.cia_integrity != null ? String(item.cia_integrity) : '',
      availability: item.cia_availability != null ? String(item.cia_availability) : '',
      security_score: item.security_score != null ? String(item.security_score) : '',
      system_grade: __normStr(item.system_grade),
      core_flag: normalizeCoreFlag(item),
      dr_built: (function(){
        var direct = __normStr(item.dr_built);
        if(direct) return direct;
        return normalizeOX(item.has_dr_site);
      })(),
      svc_redundancy: (function(){
        var direct = __normStr(item.svc_redundancy);
        if(direct) return direct;
        return normalizeOX(item.has_service_ha);
      })()
    };
  }

  async function apiGetCloudAsset(assetId){
    var url = API_ENDPOINT + '/' + encodeURIComponent(String(assetId));
    var resp = await fetch(url, { method:'GET', headers:{ 'Accept':'application/json' } });
    var data = null;
    try{ data = await resp.json(); }catch(_e){ data = null; }
    if(!resp.ok || (data && data.success === false)){
      var msg = (data && (data.message || data.error)) ? (data.message || data.error) : ('요청이 실패했습니다. (HTTP ' + resp.status + ')');
      throw new Error(msg);
    }
    return (data && data.item) ? data.item : data;
  }

  async function apiUpdateCloudAsset(assetId, payload){
    var url = API_ENDPOINT + '/' + encodeURIComponent(String(assetId));
    var resp = await fetch(url, {
      method:'PUT',
      headers:{ 'Content-Type':'application/json', 'Accept':'application/json' },
      body: JSON.stringify(payload || {})
    });
    var data = null;
    try{ data = await resp.json(); }catch(_e){ data = null; }
    if(!resp.ok || (data && data.success === false)){
      var msg = (data && (data.message || data.error)) ? (data.message || data.error) : ('요청이 실패했습니다. (HTTP ' + resp.status + ')');
      throw new Error(msg);
    }
    return (data && data.item) ? data.item : data;
  }

    function buildCloudAssetUpdatePayloadFromForm(asset){
      var form=document.getElementById(EDIT_FORM_ID); if(!form) return {};
      function v(name){ var el=form.querySelector('[name="'+name+'"]'); return el? el.value : ''; }
      function initialValue(name){
        var el = form.querySelector('[name="' + name + '"]');
        if(!el) return '';
        // Our modal builder sets data-selected-value for FK selects.
        var a = '';
        try{ a = (el.getAttribute('data-selected-value') || '').trim(); }catch(_e0){ a = ''; }
        if(!a){
          try{ a = (el.dataset && (el.dataset.selectedValue || el.dataset._initialValue)) ? String(el.dataset.selectedValue || el.dataset._initialValue).trim() : ''; }catch(_e1){ a = ''; }
        }
        if(!a){
          // Some controls (notably owners) also preserve an initial value here.
          try{ a = (el.getAttribute('data-initial-value') || '').trim(); }catch(_e2){ a = ''; }
        }
        return a;
      }
      function ownerValue(name){
        var el = form.querySelector('[name="' + name + '"]');
        if(!el) return '';
        var raw = (el.value || '').trim();
        if(raw) return raw;
        // If user clicked "지움", searchable_select sets dataset.userCleared.
        try{
          if(el.dataset && el.dataset.userCleared === '1') return '';
        }catch(_e0){ /* no-op */ }
        var initial = (el.getAttribute('data-initial-value') || '').trim();
        return initial || '';
      }
      var payload = {};
      function put(key, value){
        if(value == null) return;
        var s = String(value).trim();
        if(s === '') return;
        payload[key] = s;
      }
      function putNullable(key, value){
        if(value == null){
          payload[key] = null;
          return;
        }
        var s = String(value).trim();
        payload[key] = (s === '') ? null : s;
      }
      function putNullableIfChanged(key, fieldName, value){
        var cur = (value == null) ? '' : String(value).trim();
        var init = initialValue(fieldName);
        if(cur === init) return;
        putNullable(key, cur);
      }
      function putInt(key, value){
        var s = (value == null) ? '' : String(value).trim();
        if(s === '') return;
        var n = parseInt(s, 10);
        if(isNaN(n)) return;
        payload[key] = n;
      }
      function putIntNullable(key, value){
        var s = (value == null) ? '' : String(value).trim();
        if(s === ''){
          payload[key] = null;
          return;
        }
        var n = parseInt(s, 10);
        payload[key] = isNaN(n) ? null : n;
      }
      // Codes / canonical values
      // IMPORTANT: only send FK codes if the user actually changed them.
      // This prevents updates from failing when legacy data contains codes missing from master tables.
      putNullableIfChanged('work_type', 'work_type', v('work_type'));
      putNullableIfChanged('work_category', 'work_category', v('work_category'));
      putNullableIfChanged('work_status', 'work_status', v('work_status'));
      putNullableIfChanged('work_operation', 'work_operation', v('work_operation'));
      putNullableIfChanged('work_group', 'work_group', v('work_group'));
      put('work_name', v('work_name'));
      put('system_name', v('system_name'));
      put('system_ip', v('system_ip'));
      put('mgmt_ip', v('manage_ip'));
      var vendorCode = (v('vendor') || '').trim();
      var modelCode = (v('model') || '').trim();
      // Requirement: if vendor cleared via "지움", model must be cleared too.
      if(!vendorCode) modelCode = '';
      var vendorInit = initialValue('vendor');
      var modelInit = initialValue('model');
      var vendorChanged = (vendorCode !== vendorInit);
      var modelChanged = (modelCode !== modelInit);
      if(vendorChanged) putNullable('vendor', vendorCode);
      // If vendor changed, always send model as well (keeps dependency consistent).
      if(vendorChanged || modelChanged) putNullable('model', modelCode);
      putNullable('serial_number', v('serial'));
      put('virtualization_type', v('virtualization'));
      var centerCode = (v('location_place') || '').trim();
      var rackCode = (v('location_pos') || '').trim();
      if(!centerCode) rackCode = '';
      var centerInit = initialValue('location_place');
      var rackInit = initialValue('location_pos');
      var centerChanged = (centerCode !== centerInit);
      var rackChanged = (rackCode !== rackInit);
      if(centerChanged) putNullable('center_code', centerCode);
      // If center changed, always send rack too (dependency).
      if(centerChanged || rackChanged) putNullable('rack_code', rackCode);
      putInt('system_slot', v('slot'));
      putInt('system_size', v('u_size'));

      // Dept/Owner: must support clearing (NULL) when user clicks "지움".
      var sysDept = (v('sys_dept') || '').trim();
      var svcDept = (v('svc_dept') || '').trim();
      var sysDeptInit = initialValue('sys_dept');
      var svcDeptInit = initialValue('svc_dept');
      var sysDeptChanged = (sysDept !== sysDeptInit);
      var svcDeptChanged = (svcDept !== svcDeptInit);
      if(sysDeptChanged) putNullable('system_department', sysDept);
      if(svcDeptChanged) putNullable('service_department', svcDept);

      // Owners depend on dept; if dept cleared, owner must be cleared too.
      var sysOwner = ownerValue('sys_owner');
      var svcOwner = ownerValue('svc_owner');
      if(!sysDept) sysOwner = '';
      if(!svcDept) svcOwner = '';
      var sysOwnerInit = initialValue('sys_owner');
      var svcOwnerInit = initialValue('svc_owner');
      var sysOwnerChanged = (String(sysOwner||'').trim() !== String(sysOwnerInit||'').trim());
      var svcOwnerChanged = (String(svcOwner||'').trim() !== String(svcOwnerInit||'').trim());
      // If dept changed, always send the corresponding owner (dependency clear).
      if(sysDeptChanged || sysOwnerChanged) putNullable('system_owner', sysOwner);
      if(svcDeptChanged || svcOwnerChanged) putNullable('service_owner', svcOwner);

      // Only send display labels when a real owner value exists (never placeholders).
      try{
        var sysSel = form.querySelector('[name="sys_owner"]');
        var svcSel = form.querySelector('[name="svc_owner"]');
        var sysLbl = sysSel && sysSel.selectedOptions && sysSel.selectedOptions[0] ? (sysSel.selectedOptions[0].textContent||'').trim() : '';
        var svcLbl = svcSel && svcSel.selectedOptions && svcSel.selectedOptions[0] ? (svcSel.selectedOptions[0].textContent||'').trim() : '';
        if((sysDeptChanged || sysOwnerChanged) && sysOwner && sysLbl) put('system_owner_display', sysLbl);
        if((svcDeptChanged || svcOwnerChanged) && svcOwner && svcLbl) put('service_owner_display', svcLbl);
      }catch(_e){ /* no-op */ }

      // If owner was cleared, also clear its display field.
      if((sysDeptChanged || sysOwnerChanged) && !sysOwner) payload.system_owner_display = null;
      if((svcDeptChanged || svcOwnerChanged) && !svcOwner) payload.service_owner_display = null;
      // IMPORTANT: support explicit clears when user clicks "지움" (send NULLs)
      putIntNullable('cia_confidentiality', v('confidentiality'));
      putIntNullable('cia_integrity', v('integrity'));
      putIntNullable('cia_availability', v('availability'));
      putIntNullable('security_score', v('security_score'));
      putNullable('system_grade', v('system_grade'));
      putNullable('core_flag', v('core_flag'));
      putNullable('dr_built', v('dr_built'));
      putNullable('svc_redundancy', v('svc_redundancy'));

      // Keep these stable if present
      if(asset && asset.asset_code) put('asset_code', asset.asset_code);
      if(asset && asset.asset_name) put('asset_name', asset.asset_name);
      return payload;
    }

    async function openEditModalWithApi(){
      var assetId = resolveCloudAssetId();
      if(!assetId){
        buildEditFormFromPage();
        openModal(EDIT_MODAL_ID);
        return;
      }
      try{
        var item = await apiGetCloudAsset(assetId);
        var row = normalizeCloudAssetForModal(item);
        if(row) storeSelectedRow(row);
      }catch(err){
        console.error(err);
        __notify(err && err.message ? err.message : '자산 정보를 불러오지 못했습니다.', '수정 모달');
      }
      buildEditFormFromPage();
      openModal(EDIT_MODAL_ID);
      // Enhance FK selects only when modal is visible.
      try{
        var modalRoot = document.getElementById(EDIT_MODAL_ID);
        if(modalRoot && window.BlossomFkSelect && typeof window.BlossomFkSelect.enhance === 'function'){
          window.BlossomFkSelect.enhance(modalRoot);
        }
      }catch(_eFk){ }
    }

    async function saveEditModalToApi(){
      var btn = document.getElementById(EDIT_SAVE_ID);
      var assetId = resolveCloudAssetId();
      if(!assetId){
        // fallback: keep previous UX
        updatePageFromForm();
        closeModal(EDIT_MODAL_ID);
        return;
      }
      if(btn){ btn.disabled = true; btn.dataset.loading = '1'; }
      try{
        var payload = buildCloudAssetUpdatePayloadFromForm({ id: assetId });
        await apiUpdateCloudAsset(assetId, payload);
        // Keep UI consistent with what the user just saved.
        updatePageFromForm();
        persistCloudSelectedRowFromForm();
        closeModal(EDIT_MODAL_ID);
      }catch(err){
        console.error(err);
        __notify(err && err.message ? err.message : '저장 중 오류가 발생했습니다.', '저장 실패');
      }finally{
        if(btn){ btn.disabled = false; delete btn.dataset.loading; }
      }
    }
    // Column meta for labels (reused from list)
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
      function text(sel){ var el=document.querySelector(sel); return (el? el.textContent.trim() : ''); }
      function badgeVal(sel){ var el=document.querySelector(sel); return (el? el.textContent.trim() : ''); }
      function cia(sel){ var el=document.querySelector(sel); return (el? el.textContent.trim() : ''); }
      var selectedRowData = null;
      try{
        var storagePrefix = (typeof STORAGE_PREFIX !== 'undefined' && STORAGE_PREFIX) ? STORAGE_PREFIX : 'cloud';
        var raw = sessionStorage.getItem(storagePrefix+':selected:row') || localStorage.getItem(storagePrefix+':selected:row');
        if(raw){
          var selectedRow = JSON.parse(raw);
          var keys = ['work_type','work_category','work_operation','work_group','work_name','system_name','system_ip','manage_ip','vendor','model','serial','virtualization','location_place','location_pos','slot','u_size','sys_dept','sys_owner','svc_dept','svc_owner','confidentiality','integrity','availability','security_score','system_grade','core_flag','dr_built','svc_redundancy'];
          selectedRowData = {};
          keys.forEach(function(k){
            if(selectedRow && selectedRow[k] != null){
              var v = String(selectedRow[k]).trim();
              if(v !== '') selectedRowData[k] = v;
            }
          });
          if(!selectedRowData.work_status){
            var ws = (selectedRow.work_status || selectedRow.work_status_name || selectedRow.work_status_code);
            if(ws != null){
              ws = String(ws).trim();
              if(ws !== '') selectedRowData.work_status = ws;
            }
          }
        }
      }catch(_e){ selectedRowData = null; }
  var data = selectedRowData || {
        work_type: badgeVal('.basic-info-card:nth-child(1) .info-row:nth-child(2) .info-value'),
        work_category: badgeVal('.basic-info-card:nth-child(1) .info-row:nth-child(3) .info-value'),
  work_status: text('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill .status-text'),
        work_operation: text('.basic-info-card:nth-child(1) .info-row:nth-child(4) .info-value'),
        work_group: badgeVal('.basic-info-card:nth-child(1) .info-row:nth-child(5) .info-value'),
        work_name: text('.basic-info-card:nth-child(1) .info-row:nth-child(6) .info-value'),
        system_name: text('.basic-info-card:nth-child(1) .info-row:nth-child(7) .info-value'),
        system_ip: text('.basic-info-card:nth-child(1) .info-row:nth-child(8) .info-value'),
        manage_ip: text('.basic-info-card:nth-child(1) .info-row:nth-child(9) .info-value'),
        vendor: badgeVal('.basic-info-card:nth-child(2) .info-row:nth-child(1) .info-value'),
        model: badgeVal('.basic-info-card:nth-child(2) .info-row:nth-child(2) .info-value'),
        serial: text('.basic-info-card:nth-child(2) .info-row:nth-child(3) .info-value'),
        virtualization: badgeVal('.basic-info-card:nth-child(2) .info-row:nth-child(4) .info-value'),
        location_place: badgeVal('.basic-info-card:nth-child(2) .info-row:nth-child(5) .info-value'),
        location_pos: badgeVal('.basic-info-card:nth-child(2) .info-row:nth-child(6) .info-value'),
        slot: text('.basic-info-card:nth-child(2) .info-row:nth-child(7) .info-value'),
        u_size: text('.basic-info-card:nth-child(2) .info-row:nth-child(8) .info-value'),
        sys_dept: badgeVal('.basic-info-card:nth-child(3) .info-row:nth-child(1) .info-value'),
        sys_owner: badgeVal('.basic-info-card:nth-child(3) .info-row:nth-child(2) .info-value'),
        svc_dept: badgeVal('.basic-info-card:nth-child(3) .info-row:nth-child(3) .info-value'),
        svc_owner: badgeVal('.basic-info-card:nth-child(3) .info-row:nth-child(4) .info-value'),
        confidentiality: cia('.basic-info-card:nth-child(4) .info-row:nth-child(1) .num-badge'),
        integrity: cia('.basic-info-card:nth-child(4) .info-row:nth-child(2) .num-badge'),
        availability: cia('.basic-info-card:nth-child(4) .info-row:nth-child(3) .num-badge'),
        security_score: cia('.basic-info-card:nth-child(4) .info-row:nth-child(4) .num-badge'),
        system_grade: text('.basic-info-card:nth-child(4) .info-row:nth-child(5) .info-value'),
        core_flag: text('.basic-info-card:nth-child(4) .info-row:nth-child(6) .info-value'),
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
        var fkFields = ['work_type','work_category','work_status','work_operation','work_group','vendor','model','location_place','location_pos','sys_dept','sys_owner','svc_dept','svc_owner'];
        if(fkFields.indexOf(col) > -1){
          var selectedRow = getSelectedRow();
          var selectedLabel = (value == null) ? '' : String(value).trim();
          var selectedValue = '';
          try{
            // Prefer explicit *_code fields when present.
            var codeKeyMap = {
              work_type:'work_type_code', work_category:'work_category_code', work_status:'work_status_code',
              work_operation:'work_operation_code', work_group:'work_group_code',
              vendor:'manufacturer_code', model:'server_code',
              location_place:'center_code', location_pos:'rack_code',
              sys_dept:'system_dept_code', sys_owner:'system_owner_emp_no',
              svc_dept:'service_dept_code', svc_owner:'service_owner_emp_no'
            };
            var codeKey = codeKeyMap[col] || '';
            if(selectedRow && codeKey && selectedRow[codeKey] != null) selectedValue = String(selectedRow[codeKey]).trim();
            if(!selectedValue && selectedLabel && __looksLikeCodeToken(selectedLabel)) selectedValue = selectedLabel;
          }catch(_e){ }
          var opt = '<option value="">선택</option>';
          if(selectedValue){
            var lab = (selectedLabel && selectedLabel !== '-' && selectedLabel !== '—') ? selectedLabel : selectedValue;
            opt += '<option value="'+selectedValue+'" selected>'+lab+'</option>';
          }
          return '<select name="'+col+'" class="form-input fk-select" data-fk="'+col+'" data-selected-value="'+(selectedValue||'')+'" data-selected-label="'+(selectedLabel||'')+'">'+opt+'</select>';
        }
        if(col==='security_score') return '<input name="security_score" class="form-input" type="number" readonly placeholder="자동 합계" value="'+(value||'')+'">';
        if(opts[col]){
          var isScore = (['confidentiality','integrity','availability'].indexOf(col) > -1);
          var cls = 'form-input search-select' + (isScore ? ' score-trigger' : '');
          return '<select name="'+col+'" class="'+cls+'" data-searchable="true" data-placeholder="선택">'+
            opts[col].map(function(o){ return '<option value="'+o+'" '+(String(o)===String(value)?'selected':'')+'>'+(o||'-')+'</option>'; }).join('')+
          '</select>';
        }
        if(col==='rack_face'){
            var selF=(value||'').toUpperCase()==='REAR'||value==='후면'?'':' selected';
            var selR=(value||'').toUpperCase()==='REAR'||value==='후면'?' selected':'';
            return '<select name="rack_face" class="form-input search-select" data-searchable="true" data-placeholder="선택"><option value="">선택</option><option value="FRONT"'+selF+'>전면</option><option value="REAR"'+selR+'>후면</option></select>';
        }
        if(['slot','u_size'].indexOf(col)>-1) return '<input name="'+col+'" type="number" min="0" step="1" class="form-input" value="'+(value||'')+'">';
        return '<input name="'+col+'" class="form-input" value="'+(value||'')+'">';
      }
      var html = GROUPS.map(function(g){
        var grid = g.cols.map(function(c){ var meta=COLUMN_META[c]||{label:c}; return '<div class="form-row"><label>'+(c==='security_score'?'보안 점수':meta.label)+'</label>'+ fieldInput(c, data[c]) +'</div>'; }).join('');
        return '<div class="form-section"><div class="section-header"><h4>'+g.title+'</h4></div><div class="form-grid">'+grid+'</div></div>';
      }).join('');
      form.innerHTML = html;
      attachSecurityScoreRecalc(EDIT_FORM_ID);
      attachVirtualizationHandler(EDIT_FORM_ID);
      syncSearchable(form);
      setupLocationCascadeForForm(EDIT_FORM_ID);
    }

    function setupLocationCascadeForForm(formId){
      var form = document.getElementById(formId);
      if(!form) return;
      try{
        var vendorSel = form.querySelector('[name="vendor"]');
        var modelSel = form.querySelector('[name="model"]');
        function applyVendorModel(){
          try{
            if(!vendorSel || !modelSel) return;
            if(!__normStr(vendorSel.value)){
              modelSel.value = '';
              try{ modelSel.disabled = true; }catch(_d){}
              try{ modelSel.dispatchEvent(new Event('change', { bubbles:true })); }catch(_e){}
            } else {
              try{ modelSel.disabled = false; }catch(_d2){}
            }
            syncSearchable(modelSel);
            syncSearchable(vendorSel);
          }catch(_e2){}
        }
        if(vendorSel && modelSel && !vendorSel.dataset._cascadeBound){
          vendorSel.dataset._cascadeBound = '1';
          vendorSel.addEventListener('change', function(){
            applyVendorModel();
            setTimeout(function(){ try{ applyVendorModel(); }catch(_){ } }, 120);
            setTimeout(function(){ try{ applyVendorModel(); }catch(_){ } }, 420);
          });
          applyVendorModel();
        }
      }catch(_e){ }
      try{
        var placeSel = form.querySelector('[name="location_place"]');
        var posSel = form.querySelector('[name="location_pos"]');
        function applyPlacePos(){
          try{
            if(!placeSel || !posSel) return;
            if(!__normStr(placeSel.value)){
              posSel.value = '';
              try{ posSel.disabled = true; }catch(_d){}
              try{ posSel.dispatchEvent(new Event('change', { bubbles:true })); }catch(_e0){}
            } else {
              try{ posSel.disabled = false; }catch(_d2){}
            }
            syncSearchable(posSel);
            syncSearchable(placeSel);
          }catch(_e2){}
        }
        if(placeSel && posSel && !placeSel.dataset._cascadeBound){
          placeSel.dataset._cascadeBound = '1';
          placeSel.addEventListener('change', function(){
            applyPlacePos();
            setTimeout(function(){ try{ applyPlacePos(); }catch(_){ } }, 120);
            setTimeout(function(){ try{ applyPlacePos(); }catch(_){ } }, 420);
          });
          applyPlacePos();
        }
      }catch(_e3){ }
      try{
        var sysDeptSel = form.querySelector('[name="sys_dept"]');
        var sysOwnerSel = form.querySelector('[name="sys_owner"]');
        function applySysDeptOwner(){
          try{
            if(!sysDeptSel || !sysOwnerSel) return;
            if(!__normStr(sysDeptSel.value)){
              sysOwnerSel.value = '';
              try{ sysOwnerSel.disabled = true; }catch(_d){}
              try{ sysOwnerSel.dispatchEvent(new Event('change', { bubbles:true })); }catch(_e0){}
            } else {
              try{ sysOwnerSel.disabled = false; }catch(_d2){}
            }
            syncSearchable(sysOwnerSel);
            syncSearchable(sysDeptSel);
          }catch(_e2){}
        }
        if(sysDeptSel && sysOwnerSel && !sysDeptSel.dataset._cascadeBound){
          sysDeptSel.dataset._cascadeBound = '1';
          sysDeptSel.addEventListener('change', function(){
            applySysDeptOwner();
            setTimeout(function(){ try{ applySysDeptOwner(); }catch(_){ } }, 120);
            setTimeout(function(){ try{ applySysDeptOwner(); }catch(_){ } }, 420);
          });
          applySysDeptOwner();
        }
      }catch(_e4){ }
      try{
        var svcDeptSel = form.querySelector('[name="svc_dept"]');
        var svcOwnerSel = form.querySelector('[name="svc_owner"]');
        function applySvcDeptOwner(){
          try{
            if(!svcDeptSel || !svcOwnerSel) return;
            if(!__normStr(svcDeptSel.value)){
              svcOwnerSel.value = '';
              try{ svcOwnerSel.disabled = true; }catch(_d){}
              try{ svcOwnerSel.dispatchEvent(new Event('change', { bubbles:true })); }catch(_e0){}
            } else {
              try{ svcOwnerSel.disabled = false; }catch(_d2){}
            }
            syncSearchable(svcOwnerSel);
            syncSearchable(svcDeptSel);
          }catch(_e2){}
        }
        if(svcDeptSel && svcOwnerSel && !svcDeptSel.dataset._cascadeBound){
          svcDeptSel.dataset._cascadeBound = '1';
          svcDeptSel.addEventListener('change', function(){
            applySvcDeptOwner();
            setTimeout(function(){ try{ applySvcDeptOwner(); }catch(_){ } }, 120);
            setTimeout(function(){ try{ applySvcDeptOwner(); }catch(_){ } }, 420);
          });
          applySvcDeptOwner();
        }
      }catch(_e5){ }
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
      function setDash(el){
        if(!el) return;
        if(el.tagName === 'SELECT'){
          try{ el.value = ''; }catch(_e0){ }
          syncSearchable(el);
          return;
        }
        el.value='-';
      }
      function clearIfDash(el, t){
        if(!el) return;
        if(el.tagName === 'SELECT'){
          return;
        }
        if(el.value==='-') el.value='';
        if(t){ try{ el.type=t; }catch(_){} }
      }
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
      function displayVal(name){
        try{
          var el = form.querySelector('[name="'+name+'"]');
          if(!el) return '';
          if(String(el.tagName||'').toLowerCase() === 'select'){
            var opt = el.selectedOptions && el.selectedOptions[0];
            if(opt && __normStr(opt.textContent)) return __normStr(opt.textContent);
          }
          return __normStr(el.value);
        }catch(_e){
          return '';
        }
      }
      function safeDisplay(name){ return __displayOrDash(displayVal(name)); }
      function safeValue(name){
        var el=form.querySelector('[name="'+name+'"]');
        return __displayOrDash(el ? el.value : '');
      }
  function setText(sel, val){ var el=document.querySelector(sel); if(el) el.textContent = String(__displayOrDash(val)); }
      function setBadge(sel, val){ var el=document.querySelector(sel); if(el) el.textContent = String(__displayOrDash(val)); }
      var v = function(name){ var el=form.querySelector('[name="'+name+'"]'); return el? el.value : ''; };
        setText('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill .status-text', safeDisplay('work_status'));
      try {
        var pill=document.querySelector('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill');
        if(pill){
          var dot=pill.querySelector('.status-dot');
          var lbl=__normStr(displayVal('work_status'));
          if(__isPlaceholderText(lbl)) lbl = '';
          var cls=(lbl==='가동'?'ws-run': (lbl==='유휴'?'ws-idle':'ws-wait'));
          if(dot){
            var remove2=[];
            for(var j2=0;j2<dot.classList.length;j2++){
              var c2=dot.classList[j2];
              if(c2 && c2.indexOf('ws-')===0) remove2.push(c2);
            }
            for(var k2=0;k2<remove2.length;k2++) dot.classList.remove(remove2[k2]);
            dot.classList.add(cls);
          }
          pill.classList.remove('colored');
          try{ pill.style.removeProperty('--status-dot-color'); }catch(_e){}
          try{ pill.style.removeProperty('--status-bg-color'); }catch(_e){}
          try{ pill.style.removeProperty('--status-border-color'); }catch(_e){}
        }
      }catch(_e){}
      setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(2) .info-value', safeDisplay('work_type'));
      setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(3) .info-value', safeDisplay('work_category'));
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(4) .info-value', safeDisplay('work_operation'));
      setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(5) .info-value', safeDisplay('work_group'));
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(6) .info-value', safeValue('work_name'));
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(7) .info-value', safeValue('system_name'));
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(8) .info-value', safeValue('system_ip'));
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(9) .info-value', safeValue('manage_ip'));
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(1) .info-value', safeDisplay('vendor'));
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(2) .info-value', safeDisplay('model'));
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(3) .info-value', safeValue('serial'));
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(4) .info-value', safeValue('virtualization'));
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(5) .info-value', safeDisplay('location_place'));
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(6) .info-value', safeDisplay('location_pos'));
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(7) .info-value', safeValue('slot'));
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(8) .info-value', safeValue('u_size'));
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(9) .info-value', (v('rack_face') === 'REAR') ? '후면' : '전면');
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(1) .info-value', safeDisplay('sys_dept'));
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(2) .info-value', safeDisplay('sys_owner'));
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(3) .info-value', safeDisplay('svc_dept'));
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(4) .info-value', safeDisplay('svc_owner'));
      function setNumBadge(sel, num){
        var badge=document.querySelector(sel);
        if(!badge) return;
        var raw = __normStr(num);
        if(__isPlaceholderText(raw)){
          badge.textContent = '-';
          badge.classList.remove('tone-1','tone-2','tone-3');
          return;
        }
        badge.textContent = raw;
        var n=parseInt(raw,10);
        badge.classList.remove('tone-1','tone-2','tone-3');
        if(!isNaN(n)) badge.classList.add(n>=3?'tone-3':(n===2?'tone-2':'tone-1'));
      }
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(1) .num-badge', v('confidentiality'));
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(2) .num-badge', v('integrity'));
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(3) .num-badge', v('availability'));
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(4) .num-badge', v('security_score'));
      setText('.basic-info-card:nth-child(4) .info-row:nth-child(5) .info-value', safeValue('system_grade'));
      setText('.basic-info-card:nth-child(4) .info-row:nth-child(6) .info-value', safeValue('core_flag'));
      function setOX(rowSel, name){
        var el=document.querySelector(rowSel+' .ox-badge');
        if(!el) return;
        var val=__normStr(v(name));
        if(__isPlaceholderText(val)){
          el.textContent = '-';
          el.setAttribute('aria-label','-');
          el.classList.remove('on','off');
          return;
        }
        el.textContent=(val==='X'?'X':'O');
        el.setAttribute('aria-label', el.textContent);
        el.classList.remove('on','off');
        el.classList.add(val==='O'?'on':'off');
      }
      setOX('.basic-info-card:nth-child(4) .info-row:nth-child(7)', 'dr_built');
      setOX('.basic-info-card:nth-child(4) .info-row:nth-child(8)', 'svc_redundancy');
    }

    function persistCloudSelectedRowFromForm(){
      try{
        var form=document.getElementById(EDIT_FORM_ID); if(!form) return;
        var values = {};
        var codeValues = {};
        var fields = ['work_type','work_category','work_status','work_operation','work_group','work_name','system_name','system_ip','manage_ip','vendor','model','serial','virtualization','location_place','location_pos','slot','u_size','sys_dept','sys_owner','svc_dept','svc_owner','confidentiality','integrity','availability','security_score','system_grade','core_flag','dr_built','svc_redundancy'];
        fields.forEach(function(name){
          var el = form.querySelector('[name="'+name+'"]');
          if(!el) return;
          try{
            if(String(el.tagName||'').toLowerCase()==='select'){
              var opt = el.selectedOptions && el.selectedOptions[0];
              var label = opt ? __normStr(opt.textContent) : '';
              var code = __normStr(el.value);
              if(__isPlaceholderText(label)) label = '';
              values[name] = label;
              codeValues[name] = code;
              values[name+'__label'] = label;
              return;
            }
          }catch(_e0){ }
          values[name] = __normStr(el.value);
        });
        values.id = resolveCloudAssetId();
        // mirror common code keys so fieldInput can preselect codes.
        values.work_type_code = __normStr(codeValues.work_type);
        values.work_category_code = __normStr(codeValues.work_category);
        values.work_status_code = __normStr(codeValues.work_status);
        values.work_operation_code = __normStr(codeValues.work_operation);
        values.work_group_code = __normStr(codeValues.work_group);
        values.manufacturer_code = __normStr(codeValues.vendor);
        values.server_code = __normStr(codeValues.model);
        values.center_code = __normStr(codeValues.location_place);
        values.rack_code = __normStr(codeValues.location_pos);
        values.system_dept_code = __normStr(codeValues.sys_dept);
        values.system_owner_emp_no = __normStr(codeValues.sys_owner);
        values.service_dept_code = __normStr(codeValues.svc_dept);
        values.service_owner_emp_no = __normStr(codeValues.svc_owner);
        storeSelectedRow(values);
      }catch(_e){ }
    }

    // Wire the Basic Info edit modal open/close/save
    document.addEventListener('DOMContentLoaded', function(){
      // Init: title/subtitle + basic-info from storage, then refresh from API when possible.
      function setHeader(work, system){
        try{
          var titleEl = document.getElementById('page-title') || document.querySelector('.page-header h1');
          var subEl = document.getElementById('page-subtitle') || document.querySelector('.page-header p');
          if(titleEl) titleEl.textContent = __displayOrDash(work);
          if(subEl) subEl.textContent = __displayOrDash(system);
        }catch(_e){ }
      }

      function loadHeaderFromStorageOrRow(row){
        var work = '';
        var system = '';
        try{ work = __normStr(sessionStorage.getItem('cloud:selected:work_name')); }catch(_e0){ work = ''; }
        try{ if(!work) work = __normStr(localStorage.getItem('cloud:selected:work_name')); }catch(_e1){ }
        try{ system = __normStr(sessionStorage.getItem('cloud:selected:system_name')); }catch(_e2){ system = ''; }
        try{ if(!system) system = __normStr(localStorage.getItem('cloud:selected:system_name')); }catch(_e3){ }
        if(!work && row) work = __normStr(row.work_name || row.work || row.asset_name);
        if(!system && row) system = __normStr(row.system_name || row.system);
        setHeader(work, system);
        try{
          if(work){ sessionStorage.setItem('cloud:selected:work_name', work); localStorage.setItem('cloud:selected:work_name', work); }
          if(system){ sessionStorage.setItem('cloud:selected:system_name', system); localStorage.setItem('cloud:selected:system_name', system); }
        }catch(_e4){ }
      }

      // 1) Header only from storage (fast). Basic-info is API-authoritative.
      try{
        var row = getSelectedRow();
        loadHeaderFromStorageOrRow(row);
      }catch(_eInit0){ }

      // 2) From API (authoritative)
      (async function(){
        try{
          var assetId = resolveCloudAssetId();
          if(!assetId) return;
          var item = await apiGetCloudAsset(assetId);
          if(!item) return;
          var fresh = normalizeCloudAssetForModal(item);
          if(!fresh) return;
          storeSelectedRow(fresh);
          // Header should also reflect DB values when available.
          setHeader(fresh.work_name, fresh.system_name);
          buildEditFormFromPage();
          updatePageFromForm();
        }catch(_eInit1){ /* no-op */ }
      })();

      var openBtn = document.getElementById(EDIT_OPEN_ID);
      if(openBtn){
        openBtn.addEventListener('click', function(){
          openEditModalWithApi();
        });
      }
      var closeBtn = document.getElementById(EDIT_CLOSE_ID);
      if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModal(EDIT_MODAL_ID); }); }
      var saveBtn = document.getElementById(EDIT_SAVE_ID);
      if(saveBtn){ saveBtn.addEventListener('click', function(){ saveEditModalToApi(); }); }
      // Overlay click closes
      try{
        var modal = document.getElementById(EDIT_MODAL_ID);
        if(modal){
          modal.addEventListener('click', function(ev){
            if(ev && ev.target === modal){ closeModal(EDIT_MODAL_ID); }
          });
        }
      }catch(_e){ }
      // ESC closes
      document.addEventListener('keydown', function(ev){
        try{
          var key = ev && (ev.key || ev.code);
          if(key === 'Escape' || key === 'Esc'){
            var m = document.getElementById(EDIT_MODAL_ID);
            if(m && m.classList.contains('show')) closeModal(EDIT_MODAL_ID);
          }
        }catch(_e){ }
      });
    });

    // Tab behaviors moved to /static/js/_detail/tabXX-*.js

  // No modal APIs to expose
})();

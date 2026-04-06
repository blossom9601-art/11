// onpremise_detail.js: On-premise Server Detail page behaviors (modal removed)

(function(){
  // Marker for diagnostics: confirms the bundle was evaluated.
  try{
    window.__onpremise_detail_js_eval = (window.__onpremise_detail_js_eval || 0) + 1;
    window.__onpremise_detail_js_last = {
      ts: Date.now(),
      href: String((window.location && window.location.href) ? window.location.href : ''),
      search: String((window.location && window.location.search) ? window.location.search : '')
    };
  }catch(_eMark){}

  function __opGetQueryParam(key){
    try{
      var qs = (window.location && window.location.search) ? String(window.location.search) : '';
      if(!qs) return null;
      if(qs.charAt(0) === '?') qs = qs.slice(1);
      var parts = qs.split('&');
      for(var i=0;i<parts.length;i++){
        if(!parts[i]) continue;
        var kv = parts[i].split('=');
        var k = kv[0] ? decodeURIComponent(kv[0].replace(/\+/g,' ')) : '';
        if(k !== String(key)) continue;
        var v = (kv.length > 1) ? kv.slice(1).join('=') : '';
        return decodeURIComponent(String(v).replace(/\+/g,' '));
      }
    }catch(_e){ }
    return null;
  }

  // Security: strip selection identifiers from the URL as early as possible.
  // This runs during script evaluation (the script is loaded in <head> on tabs).
  (function __opStripSelectionParamsEarly(){
    try{
      var params = null;
      try{ params = new URLSearchParams(window.location.search || ''); }catch(_eP){ params = null; }
      if(!params) return;
      var had = params.has('work') || params.has('system') || params.has('asset_id') || params.has('assetId') || params.has('id') || params.has('asset_scope');
      if(!had) return;

      // Persist values first so the page can still resolve the asset even after stripping.
      try{
        var w = params.get('work');
        var s = params.get('system');
        var a = params.get('asset_id') || params.get('assetId') || params.get('id');
        if(w) sessionStorage.setItem('onpremise:selected:work_name', String(w));
        if(s) sessionStorage.setItem('onpremise:selected:system_name', String(s));
        if(a){
          sessionStorage.setItem('onpremise:selected:asset_id', String(a));
          try{ localStorage.setItem('onpremise:selected:asset_id', String(a)); }catch(_eL0){}
          try{ localStorage.setItem('onpremise:last_selected_asset_id', String(a)); }catch(_eL1){}
        }
      }catch(_ePersist){ /* ignore */ }

      ['work','system','asset_id','assetId','id','asset_scope'].forEach(function(k){ try{ params.delete(k); }catch(_){ } });
      var qs0 = params.toString();
      history.replaceState({}, '', location.pathname + (qs0 ? ('?' + qs0) : '') + location.hash);
    }catch(_eStrip){ /* no-op */ }
  })();

  function __opGetJson(url, onDone){
    try{
      if(window.fetch){
        window.fetch(url, { method:'GET', headers:{'Accept':'application/json'}, credentials:'same-origin' })
          .then(function(r){
            return r.json().catch(function(){ return null; }).then(function(j){
              return { ok: r.ok, status: r.status, json: j };
            });
          })
          .then(function(res){ try{ onDone(res); }catch(_e){ } })
          .catch(function(_err){ try{ onDone(null); }catch(_e){ } });
        return;
      }
    }catch(_eFetch){ }

    try{
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      try{ xhr.setRequestHeader('Accept','application/json'); }catch(_eH){ }
      xhr.onreadystatechange = function(){
        if(xhr.readyState !== 4) return;
        var json = null;
        try{ json = xhr.responseText ? JSON.parse(xhr.responseText) : null; }catch(_eJ){ json = null; }
        var ok = (xhr.status >= 200 && xhr.status < 300);
        try{ onDone({ ok: ok, status: xhr.status, json: json }); }catch(_eCb){ }
      };
      xhr.send();
    }catch(_eX){
      try{ onDone(null); }catch(_eCb2){ }
    }
  }

  function __opIsDebug(){
    try{
      var params = new URLSearchParams(window.location.search || '');
      var d = params.get('debug');
      if(!d) return false;
      d = String(d).trim().toLowerCase();
      return d === '1' || d === 'true' || d === 'on' || d === 'yes';
    }catch(_e){
      return false;
    }
  }

  function extractStatusToken(raw){
    try{
      var s = String(raw == null ? '' : raw).trim();
      if(!s) return '';
      // support tokens like "ws-run" / "ws-idle" / "ws-wait"
      var m = s.match(/\bws-[a-z0-9_-]+\b/i);
      return m ? String(m[0]) : '';
    }catch(_e){
      return '';
    }
  }

  function parseHexColor(raw){
    try{
      var s = String(raw == null ? '' : raw).trim();
      if(!s) return '';
      // #RGB or #RRGGBB
      var m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
      if(m){
        var hex = m[1];
        if(hex.length === 3){
          return '#' + hex.split('').map(function(ch){ return ch + ch; }).join('');
        }
        return '#' + hex;
      }
      // rgb(r,g,b)
      var m2 = s.match(/^rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
      if(m2){
        var r = Math.max(0, Math.min(255, parseInt(m2[1], 10) || 0));
        var g = Math.max(0, Math.min(255, parseInt(m2[2], 10) || 0));
        var b = Math.max(0, Math.min(255, parseInt(m2[3], 10) || 0));
        var toHex = function(n){ var h = n.toString(16); return h.length === 1 ? '0' + h : h; };
        return '#' + toHex(r) + toHex(g) + toHex(b);
      }
    }catch(_e){ }
    return '';
  }

  function deriveStatusColor(raw){
    // Debug helper (enabled only when URL has debug=1/true/on)
    try{
      var hex = parseHexColor(raw);
      if(hex) return { hex: hex, token: '' };
      var token = extractStatusToken(raw);
      if(token) return { hex: '', token: token };
    }catch(_e){
      if(__opIsDebug()){
        try{ console.warn('[onpremise_detail] deriveStatusColor failed', _e); }catch(_e2){ }
      }
    }
    return { hex: '', token: '' };
  }

    function normalizeLabel(name, code){
      return (name || code || '');
    }

    // ── Basic Info display helpers ──
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
          if(!pill) break;
          var statusText = pill.querySelector('.status-text');
          if(statusText) statusText.textContent = v;
          var dot = pill.querySelector('.status-dot');
          if(dot){
            try{ dot.classList.remove('ws-run','ws-idle','ws-wait'); }catch(_e0){}
            var token = (opts && opts.token) ? String(opts.token).trim() : '';
            if(token && token.indexOf('ws-') === 0){
              try{ dot.classList.add(token); }catch(_e1){}
            } else {
              var sv = v.trim();
              try{ dot.classList.add(sv === '가동' ? 'ws-run' : (sv === '유휴' ? 'ws-idle' : 'ws-wait')); }catch(_e2){}
            }
          }
          if(opts && opts.color){
            try{ pill.style.setProperty('--ws-color', opts.color); }catch(_e3){}
          }
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
          if(!v || v === '-'){
            badge.textContent = '-';
            badge.classList.remove('tone-1','tone-2','tone-3');
            break;
          }
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
          'RACK 전면/후면': 'rack_face',
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
          if(label === 'RACK 전면/후면'){
            var rf = coerceDisplayValue(val);
            setBasicInfoValueByLabel(label, (rf === 'REAR' || rf === '후면') ? '후면' : (rf ? '전면' : '-'));
            return;
          }
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
      if(raw === '물리' || raw === '물리서버' || raw.toLowerCase() === 'physical') return '물리서버';
      if(raw === '가상' || raw === '가상서버' || raw.toLowerCase() === 'virtual') return '가상서버';
      if(raw === '클라우드' || raw.toLowerCase() === 'cloud') return '클라우드';
      if(raw.toUpperCase().indexOf('VIR') === 0) return '가상서버';
      if(raw.toUpperCase().indexOf('PHY') === 0) return '물리서버';
      return raw;
    }

    // Make API item compatible with applyRowToBasicInfo() (same shape as list page rows).
    // If API lacks display names (e.g. center_name), keep previous normalized display values.
    function normalizeAssetRecordForBasicInfo(item, prevRow){
      if(!item && prevRow) return prevRow;
      if(!item) return null;
      prevRow = prevRow || {};

      function hasOwn(obj, key){
        try{ return Object.prototype.hasOwnProperty.call(obj, key); }catch(_e){ return false; }
      }

      var hasCoreField = hasOwn(item, 'is_core_system');
      var hasDrField = hasOwn(item, 'has_dr_site');
      var hasSvcHaField = hasOwn(item, 'has_service_ha');
      var coreFlag = hasCoreField ? item.is_core_system : prevRow.is_core_system;
      var drFlag = hasDrField ? item.has_dr_site : prevRow.has_dr_site;
      var svcHaFlag = hasSvcHaField ? item.has_service_ha : prevRow.has_service_ha;

      var sc = deriveStatusColor(item.work_status_color != null ? item.work_status_color : prevRow.work_status_color);
      var workStatusColor = sc.hex || '';
      var workStatusToken = sc.token || '';
      if(!workStatusColor && !workStatusToken){
        var legacy = item.work_status_color != null ? String(item.work_status_color).trim() : '';
        if(legacy && legacy.indexOf('ws-') === 0) workStatusToken = legacy;
      }

      var sysOwnerDisplay = (item.system_owner_display != null ? item.system_owner_display
        : (item.sys_owner_display != null ? item.sys_owner_display
        : (item.system_owner != null ? item.system_owner
        : (item.sys_owner != null ? item.sys_owner : ''))));
      var svcOwnerDisplay = (item.service_owner_display != null ? item.service_owner_display
        : (item.svc_owner_display != null ? item.svc_owner_display
        : (item.service_owner != null ? item.service_owner
        : (item.svc_owner != null ? item.svc_owner : ''))));

      // Department clearing: if API explicitly returns empty dept code/name, treat as cleared.
      var sysDeptCodeRaw = (item.system_dept_code != null ? item.system_dept_code
        : (item.system_department != null ? item.system_department : (item.systemDepartment != null ? item.systemDepartment : undefined)));
      var svcDeptCodeRaw = (item.service_dept_code != null ? item.service_dept_code
        : (item.service_department != null ? item.service_department : (item.serviceDepartment != null ? item.serviceDepartment : undefined)));
      var hasSysDeptField = hasOwn(item, 'system_dept_code') || hasOwn(item, 'system_department') || hasOwn(item, 'systemDepartment');
      var hasSvcDeptField = hasOwn(item, 'service_dept_code') || hasOwn(item, 'service_department') || hasOwn(item, 'serviceDepartment');
      var sysDeptName = (item.system_dept_name != null ? String(item.system_dept_name).trim() : '');
      var svcDeptName = (item.service_dept_name != null ? String(item.service_dept_name).trim() : '');
      var sysDeptDisplay = normalizeLabel(sysDeptName, sysDeptCodeRaw);
      var svcDeptDisplay = normalizeLabel(svcDeptName, svcDeptCodeRaw);
      if(hasSysDeptField && (!sysDeptName) && (sysDeptCodeRaw == null || String(sysDeptCodeRaw).trim() === '')){
        sysDeptDisplay = '-';
      }
      if(hasSvcDeptField && (!svcDeptName) && (svcDeptCodeRaw == null || String(svcDeptCodeRaw).trim() === '')){
        svcDeptDisplay = '-';
      }

      var hasVendorField = hasOwn(item, 'manufacturer_code') || hasOwn(item, 'manufacturer_name') || hasOwn(item, 'vendor');
      var hasModelField = hasOwn(item, 'server_code') || hasOwn(item, 'server_model_name') || hasOwn(item, 'model');
      var hasCenterField = hasOwn(item, 'center_code') || hasOwn(item, 'center_name') || hasOwn(item, 'center');
      var hasRackField = hasOwn(item, 'rack_code') || hasOwn(item, 'rack_name') || hasOwn(item, 'rack');
      var hasSysOwnerField = hasOwn(item, 'system_owner_emp_no') || hasOwn(item, 'system_owner_name') || hasOwn(item, 'system_owner');
      var hasSvcOwnerField = hasOwn(item, 'service_owner_emp_no') || hasOwn(item, 'service_owner_name') || hasOwn(item, 'service_owner');

      var vendorName = (item.manufacturer_name != null ? String(item.manufacturer_name).trim() : '');
      var vendorCodeRaw = (item.manufacturer_code != null ? String(item.manufacturer_code).trim() : (item.vendor != null ? String(item.vendor).trim() : ''));
      var vendorDisplay = normalizeLabel(vendorName, vendorCodeRaw);
      if(hasVendorField && (!vendorName) && (!vendorCodeRaw)){
        vendorDisplay = '-';
      }

      var modelName = (item.server_model_name != null ? String(item.server_model_name).trim() : '');
      var modelCodeRaw = (item.server_code != null ? String(item.server_code).trim() : (item.model != null ? String(item.model).trim() : ''));
      var modelDisplay = normalizeLabel(modelName, modelCodeRaw);
      if(hasModelField && (!modelName) && (!modelCodeRaw)){
        modelDisplay = '-';
      }

      var centerName = (item.center_name != null ? String(item.center_name).trim() : '');
      var centerCodeRaw = (item.center_code != null ? String(item.center_code).trim() : '');
      if(hasCenterField && (!centerName) && (!centerCodeRaw)){
        centerName = '-';
      }

      var rackName = (item.rack_name != null ? String(item.rack_name).trim() : '');
      var rackCodeRaw = (item.rack_code != null ? String(item.rack_code).trim() : '');
      if(hasRackField && (!rackName) && (!rackCodeRaw)){
        rackName = '-';
      }

      var sysOwnerName = (item.system_owner_name != null ? String(item.system_owner_name).trim() : '');
      var sysOwnerEmp = (item.system_owner_emp_no != null ? String(item.system_owner_emp_no).trim() : '');
      var svcOwnerName = (item.service_owner_name != null ? String(item.service_owner_name).trim() : '');
      var svcOwnerEmp = (item.service_owner_emp_no != null ? String(item.service_owner_emp_no).trim() : '');

      var workTypeName = (item.work_type_name != null ? item.work_type_name : item.work_division_name);
      var workTypeCodeRaw = (item.work_type_code != null ? item.work_type_code : item.work_division_code);

      var row = {
        id: item.id != null ? item.id : prevRow.id,

        // Keep both raw + display fields (edit form uses raw keys)
        asset_code: item.asset_code != null ? item.asset_code : prevRow.asset_code,
        asset_name: item.asset_name != null ? item.asset_name : prevRow.asset_name,

  // Compatibility: older schema/API uses work_division_* for '업무 구분'
  // but the detail page expects work_type_*.
  work_type: normalizeLabel(workTypeName, workTypeCodeRaw) || prevRow.work_type || '-',
  work_type_code: (item.work_type_code != null ? item.work_type_code : (item.work_division_code != null ? item.work_division_code : prevRow.work_type_code)),
  work_type_name: (workTypeName != null && String(workTypeName).trim() !== '' ? String(workTypeName).trim() : (prevRow.work_type_name || '')),
        work_category: normalizeLabel(item.work_category_name, item.work_category_code) || prevRow.work_category || '-',
        work_category_code: item.work_category_code != null ? item.work_category_code : prevRow.work_category_code,
        work_category_name: (item.work_category_name != null && String(item.work_category_name).trim() !== '' ? String(item.work_category_name).trim() : (prevRow.work_category_name || '')),
        work_status: normalizeLabel(item.work_status_name, item.work_status_code) || prevRow.work_status || '-',
        work_status_code: item.work_status_code != null ? item.work_status_code : prevRow.work_status_code,
        work_status_name: (item.work_status_name != null && String(item.work_status_name).trim() !== '' ? String(item.work_status_name).trim() : (prevRow.work_status_name || '')),
        work_status_color: workStatusColor || prevRow.work_status_color || '',
        work_status_token: workStatusToken || prevRow.work_status_token || '',
        work_operation: normalizeLabel(item.work_operation_name, item.work_operation_code) || prevRow.work_operation || '-',
        work_operation_code: item.work_operation_code != null ? item.work_operation_code : prevRow.work_operation_code,
        work_operation_name: (item.work_operation_name != null && String(item.work_operation_name).trim() !== '' ? String(item.work_operation_name).trim() : (prevRow.work_operation_name || '')),
        work_group: normalizeLabel(item.work_group_name, item.work_group_code) || prevRow.work_group || '-',
        work_group_code: item.work_group_code != null ? item.work_group_code : prevRow.work_group_code,
        work_group_name: (item.work_group_name != null && String(item.work_group_name).trim() !== '' ? String(item.work_group_name).trim() : (prevRow.work_group_name || '')),

        work_name: (item.work_name != null ? item.work_name : prevRow.work_name) || '-',
        system_name: (item.system_name != null ? item.system_name : prevRow.system_name) || '-',
        system_ip: (item.system_ip != null ? item.system_ip : prevRow.system_ip) || '-',

        manage_ip: (item.mgmt_ip != null ? item.mgmt_ip : (item.manage_ip != null ? item.manage_ip : prevRow.manage_ip)) || '-',
        mgmt_ip: (item.mgmt_ip != null ? item.mgmt_ip : prevRow.mgmt_ip) || '',

        vendor: (vendorDisplay || (hasVendorField ? '-' : (prevRow.vendor || '-'))),
        manufacturer_code: (item.manufacturer_code != null ? item.manufacturer_code : (hasVendorField ? '' : prevRow.manufacturer_code)),
        manufacturer_name: (vendorName || prevRow.manufacturer_name || ''),
        model: (modelDisplay || (hasModelField ? '-' : (prevRow.model || '-'))),
        server_code: (item.server_code != null ? item.server_code : (hasModelField ? '' : prevRow.server_code)),
        server_model_name: (modelName || prevRow.server_model_name || ''),
        serial: (item.serial_number != null ? item.serial_number : (item.serial != null ? item.serial : prevRow.serial)) || '-',

        virtualization: (normalizeVirtualizationLabel(item.virtualization_type) || item.virtualization || prevRow.virtualization) || '-',
        virtualization_raw: item.virtualization_type != null ? item.virtualization_type : (prevRow.virtualization_raw || ''),
        virtualization_type: item.virtualization_type != null ? item.virtualization_type : prevRow.virtualization_type,

        location_place: (centerName || (hasCenterField ? '-' : (prevRow.location_place || '-'))),
        center_code: (item.center_code != null ? item.center_code : (hasCenterField ? '' : prevRow.center_code)),
        center_name: (centerName || prevRow.center_name || ''),
        location_pos: (rackName || (hasRackField ? '-' : (prevRow.location_pos || '-'))),
        rack_code: (item.rack_code != null ? item.rack_code : (hasRackField ? '' : prevRow.rack_code)),
        rack_name: (rackName || prevRow.rack_name || ''),

        slot: (item.slot != null ? item.slot : prevRow.slot) || '-',
        u_size: (item.u_size != null ? item.u_size : prevRow.u_size) || '-',
        rack_face: item.rack_face || 'FRONT',

        sys_dept: (sysDeptDisplay || prevRow.sys_dept || '-'),
        system_dept_code: (item.system_dept_code != null ? item.system_dept_code : (hasSysDeptField ? '' : prevRow.system_dept_code)),
        system_dept_name: (sysDeptName || prevRow.system_dept_name || ''),
        svc_dept: (svcDeptDisplay || prevRow.svc_dept || '-'),
        service_dept_code: (item.service_dept_code != null ? item.service_dept_code : (hasSvcDeptField ? '' : prevRow.service_dept_code)),
        service_dept_name: (svcDeptName || prevRow.service_dept_name || ''),
        sys_owner: (String(sysOwnerDisplay || '').trim() || normalizeLabel(sysOwnerName, sysOwnerEmp) || (hasSysOwnerField ? '-' : (prevRow.sys_owner || '-'))),
        system_owner_emp_no: (item.system_owner_emp_no != null ? item.system_owner_emp_no : (hasSysOwnerField ? '' : prevRow.system_owner_emp_no)),
        svc_owner: (String(svcOwnerDisplay || '').trim() || normalizeLabel(svcOwnerName, svcOwnerEmp) || (hasSvcOwnerField ? '-' : (prevRow.svc_owner || '-'))),
        service_owner_emp_no: (item.service_owner_emp_no != null ? item.service_owner_emp_no : (hasSvcOwnerField ? '' : prevRow.service_owner_emp_no)),

        confidentiality: (hasOwn(item, 'cia_confidentiality')
          ? (item.cia_confidentiality == null ? '' : String(item.cia_confidentiality))
          : (prevRow.confidentiality != null ? String(prevRow.confidentiality) : '')),
        integrity: (hasOwn(item, 'cia_integrity')
          ? (item.cia_integrity == null ? '' : String(item.cia_integrity))
          : (prevRow.integrity != null ? String(prevRow.integrity) : '')),
        availability: (hasOwn(item, 'cia_availability')
          ? (item.cia_availability == null ? '' : String(item.cia_availability))
          : (prevRow.availability != null ? String(prevRow.availability) : '')),
        security_score: (hasOwn(item, 'security_score')
          ? (item.security_score == null ? '' : String(item.security_score))
          : (prevRow.security_score != null ? String(prevRow.security_score) : '')),
        system_grade: (hasOwn(item, 'system_grade')
          ? (item.system_grade == null ? '' : String(item.system_grade))
          : (prevRow.system_grade != null ? String(prevRow.system_grade) : '')),

        core_flag: (coreFlag == null ? (prevRow.core_flag || '-') : (coreFlag ? '핵심' : '일반')),
        is_core_system: coreFlag,
        dr_built: (drFlag == null ? (prevRow.dr_built || '-') : (drFlag ? 'O' : 'X')),
        has_dr_site: drFlag,
        svc_redundancy: (svcHaFlag == null ? (prevRow.svc_redundancy || '-') : (svcHaFlag ? 'O' : 'X')),
        has_service_ha: svcHaFlag,
        service_ha_type: item.service_ha_type != null ? item.service_ha_type : prevRow.service_ha_type,

        agent_synced: !!item.agent_synced,

        _record: item
      };
      return row;
    }

    // Initialize page header from list selection (query or storage)
    // NOTE: This script is loaded in <head> for these pages, so DOM may not exist yet.
    // Defer population until DOMContentLoaded.
    (function initHeaderFromSelection(){
      function _safeCoerceRow(row){
        try{
          if(typeof coerceRowForBasicInfo === 'function'){
            return coerceRowForBasicInfo(row);
          }
        }catch(_e){ /* ignore */ }
        return row;
      }
      function run(){
        // Keep critical fetch path isolated from unrelated UI errors.
        var params = null;
        try{ params = new URLSearchParams(window.location.search || ''); }catch(_eP){ params = null; }

        function setText(sel, val){
          try{
            var el = document.querySelector(sel);
            if(el && val != null) el.textContent = String(val);
          }catch(_eT){}
        }

        var work = null;
        var system = null;
        var assetId = null;
        try{
          work = (sessionStorage.getItem('onpremise:selected:work_name')
            || (params ? params.get('work') : (__opGetQueryParam('work') || null))
            || localStorage.getItem('onpremise:selected:work_name'));
          system = (sessionStorage.getItem('onpremise:selected:system_name')
            || (params ? params.get('system') : (__opGetQueryParam('system') || null))
            || localStorage.getItem('onpremise:selected:system_name'));
          assetId = (params
            ? (params.get('asset_id') || params.get('assetId') || params.get('id'))
            : (__opGetQueryParam('asset_id') || __opGetQueryParam('assetId') || __opGetQueryParam('id')));
        }catch(_eRead){ work = work || null; system = system || null; assetId = assetId || null; }

        // Header + stored-row UI population (best-effort)
        try{ setText('.page-header h1', work || '-'); }catch(_eH0){}
        try{ setText('.page-header p', system || '-'); }catch(_eH1){}
        try{ setBasicInfoValueByLabel('업무 이름', work); }catch(_eBI0){}
        try{ setBasicInfoValueByLabel('시스템 이름', system); }catch(_eBI1){}
        try{
          var raw = sessionStorage.getItem('onpremise:selected:row') || localStorage.getItem('onpremise:selected:row');
          if(raw){
            var row = _safeCoerceRow(JSON.parse(raw));
            if(row && (row.work_name || row.system_name)){
              setText('.page-header h1', row.work_name || work || '-');
              setText('.page-header p', row.system_name || system || '-');
            }
            applyRowToBasicInfo(row);
          }
        }catch(_eRow){ /* ignore */ }

        // Persist + strip legacy params (best-effort)
        try{
          if(work && work !== '-') sessionStorage.setItem('onpremise:selected:work_name', String(work));
          if(system && system !== '-') sessionStorage.setItem('onpremise:selected:system_name', String(system));
          if(assetId){
            sessionStorage.setItem('onpremise:selected:asset_id', String(assetId));
            try{ localStorage.setItem('onpremise:selected:asset_id', String(assetId)); }catch(_e1){}
          }
        }catch(_ePersist){}
        try{
            if(params && (params.has('work') || params.has('system') || params.has('asset_id') || params.has('assetId') || params.has('id') || params.has('asset_scope'))){
              // Security: do not expose selection identifiers in the address bar.
              ['work','system','asset_id','assetId','id','asset_scope'].forEach(function(k){ try{ params.delete(k); }catch(_){ } });
            var qs0 = params.toString();
            history.replaceState({}, '', location.pathname + (qs0 ? ('?' + qs0) : '') + location.hash);
          }
        }catch(_stripErr){ /* no-op */ }

        // Critical: always attempt the detail fetch independently.
        try{
          function parseAssetId(v){
            try{
              var n = parseInt(String(v == null ? '' : v).trim(), 10);
              return (isFinite(n) && n > 0) ? n : 0;
            }catch(_e){
              return 0;
            }
          }

          var urlAssetId = parseAssetId(assetId);
          var raw2 = null;
          try{ raw2 = sessionStorage.getItem('onpremise:selected:row') || localStorage.getItem('onpremise:selected:row'); }catch(_eS0){ raw2 = null; }
          var storedRow = null;
          var storedRowId = 0;
          var storedRowHasMeaning = false;
          if(raw2){
            try{
              storedRow = JSON.parse(raw2);
              storedRowId = parseAssetId((storedRow && (storedRow.id != null ? storedRow.id : (storedRow.asset_id != null ? storedRow.asset_id : storedRow.assetId))));
              storedRowHasMeaning = !!(storedRow && (
                (storedRow.work_name && String(storedRow.work_name).trim() !== '-' && String(storedRow.work_name).trim() !== '') ||
                (storedRow.system_name && String(storedRow.system_name).trim() !== '-' && String(storedRow.system_name).trim() !== '') ||
                (storedRow.asset_code && String(storedRow.asset_code).trim() !== '') ||
                (storedRow.vendor && String(storedRow.vendor).trim() !== '-' && String(storedRow.vendor).trim() !== '') ||
                (storedRow.model && String(storedRow.model).trim() !== '-' && String(storedRow.model).trim() !== '')
              ));
            }catch(_eParse){
              storedRow = null;
              storedRowId = 0;
              storedRowHasMeaning = false;
            }
          }

          var cand = 0;
          if(urlAssetId > 0){
            cand = urlAssetId;
          }else{
            cand = parseAssetId(
              sessionStorage.getItem('onpremise:selected:asset_id')
                || localStorage.getItem('onpremise:selected:asset_id')
                || localStorage.getItem('onpremise:last_selected_asset_id')
            );
          }

          // Always refresh via detail API so code fields are normalized to display names.
          // This prevents showing raw codes/ids from a stored list row.
          var shouldFetch = (cand > 0);

          if(shouldFetch && cand > 0){
            __opGetJson('/api/hardware/onpremise/assets/' + cand, function(res){
              if(!res || !res.ok || !res.json || !res.json.success || !res.json.item) return;
              var item = res.json.item;
              var prevRow = null;
              try{ prevRow = getSelectedRowFromStorage && getSelectedRowFromStorage(); }catch(_ePrev){}
              var normalized = null;
              try{ normalized = normalizeAssetRecordForBasicInfo(item, prevRow); }catch(_eN){ normalized = null; }
              try{ sessionStorage.setItem('onpremise:selected:row', JSON.stringify(normalized || item)); }catch(_e0){}
              try{ localStorage.setItem('onpremise:selected:row', JSON.stringify(normalized || item)); }catch(_e1){}
              try{ sessionStorage.setItem('onpremise:selected:asset_id', String(cand)); }catch(_e2){}
              try{ localStorage.setItem('onpremise:selected:asset_id', String(cand)); }catch(_e3){}
              try{ localStorage.setItem('onpremise:last_selected_asset_id', String(cand)); }catch(_e4){}
              // Persist key fields for cross-tab usage (hardware tab system row)
              try{
                var _cr = normalized || item;
                localStorage.setItem('onpremise:current:model',  String(_cr.server_model_name || _cr.model || ''));
                localStorage.setItem('onpremise:current:vendor', String(_cr.manufacturer_name || _cr.vendor || ''));
                localStorage.setItem('onpremise:current:serial', String(_cr.serial || _cr.serial_number || ''));
                localStorage.setItem('onpremise:current:fw',     String(_cr.fw || _cr.firmware || ''));
              }catch(_eCache){}
              try{
                var viewRow = normalized || item;
                if(viewRow && (viewRow.work_name || viewRow.system_name)){
                  setText('.page-header h1', viewRow.work_name || '-');
                  setText('.page-header p', viewRow.system_name || '-');
                }
                applyRowToBasicInfo(viewRow);
                // Lumina 에이전트 연동 아이콘 갱신
                try{
                  if(window.BlossomHardwareDetail && window.BlossomHardwareDetail.updateAgentIcon){
                    window.BlossomHardwareDetail.updateAgentIcon(!!viewRow.agent_synced);
                  }
                }catch(_eAgent){}
                // 연동 버튼 삽입
                try{
                  if(window.BlossomHardwareDetail && window.BlossomHardwareDetail.initLinkButton){
                    window.BlossomHardwareDetail.initLinkButton(assetId);
                  }
                }catch(_eLB){}
              }catch(_e5){}
            });
          }
        }catch(_eFetch){ /* ignore */ }

        // If work/system came from the URL, remove them from the address bar.
        try{
          if(params && (params.has('work') || params.has('system'))){
            params.delete('work');
            params.delete('system');
            var base = window.location.pathname;
            var qs1 = params.toString();
            var next = base + (qs1 ? ('?' + qs1) : '') + (window.location.hash || '');
            window.history.replaceState(null, document.title, next);
          }
        }catch(_e2){}
      }

      try{
        if(document.readyState === 'loading'){
          document.addEventListener('DOMContentLoaded', run, { once: true });
        }else{
          run();
        }
      }catch(_e){
        run();
      }
    })();
    // Modal: list-page identical edit modal (dynamic builder + FK/search + dependencies + API update)
    (function(){
      const EDIT_MODAL_ID = 'system-edit-modal';
      const EDIT_FORM_ID = 'system-edit-form';
      const API_ENDPOINT = '/api/hardware/onpremise/assets';

      function _safeCoerceRow(row){
        try{
          if(typeof coerceRowForBasicInfo === 'function'){
            return coerceRowForBasicInfo(row);
          }
        }catch(_e){ /* ignore */ }
        return row;
      }

      let __lastActiveElement = null;
      function __focusFirstIn(container){
        try{
          if(!container || !container.querySelector) return false;
          const target = container.querySelector('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
          if(target && typeof target.focus === 'function'){
            try{ target.focus({ preventScroll: true }); }catch(_e0){ target.focus(); }
            return true;
          }
        }catch(_e){ }
        return false;
      }

      function openModal(id){
        const el = document.getElementById(id);
        if(!el) return;

        try{ __lastActiveElement = document.activeElement; }catch(_eAct){ __lastActiveElement = null; }

        document.body.classList.add('modal-open');
        try{ el.removeAttribute('inert'); }catch(_eInert0){}
        try{ el.inert = false; }catch(_eInert1){}
        el.classList.add('show');
        el.setAttribute('aria-hidden', 'false');

        // Move focus into modal to avoid aria-hidden focus warnings.
        if(!__focusFirstIn(el)){
          try{ if(!el.hasAttribute('tabindex')) el.setAttribute('tabindex','-1'); }catch(_eTab){}
          try{ el.focus({ preventScroll: true }); }catch(_eF){ try{ el.focus(); }catch(_eF2){} }
        }
      }

      function closeModal(id){
        const el = document.getElementById(id);
        if(!el) return;

        // If focus is inside the modal, move it out BEFORE setting aria-hidden.
        try{
          const active = document.activeElement;
          if(active && el.contains(active) && typeof active.blur === 'function') active.blur();
        }catch(_eBlur){}
        try{
          const fallback = document.getElementById('detail-edit-open');
          const next = (__lastActiveElement && typeof __lastActiveElement.focus === 'function') ? __lastActiveElement : fallback;
          if(next && typeof next.focus === 'function'){
            try{ next.focus({ preventScroll: true }); }catch(_eF0){ next.focus(); }
          }
        }catch(_eFocusOut){}

        el.classList.remove('show');
        try{ el.setAttribute('inert',''); }catch(_eInert2){}
        try{ el.inert = true; }catch(_eInert3){}
        el.setAttribute('aria-hidden', 'true');

        if(!document.querySelector('.modal-overlay-base.show, .server-add-modal.show, .server-edit-modal.show, .server-column-modal.show')){
          document.body.classList.remove('modal-open');
        }
      }

      function escapeHTML(str){
        return String(str).replace(/[&<>'\"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;','\'':'&#39;'}[s] || s));
      }
      function escapeAttr(str){
        return String(str).replace(/[&<>'\"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;','\'':'&#39;'}[s] || s));
      }

      async function fetchJSON(url, options){
        const opts = options ? { ...options } : {};
        opts.headers = { 'Accept': 'application/json', 'Content-Type': 'application/json', ...(opts.headers || {}) };
        if(!opts.credentials) opts.credentials = 'same-origin';
        const r = await fetch(url, opts);
        let data = null;
        try{ data = await r.json(); }catch(_e){ throw new Error('서버 응답을 해석할 수 없습니다.'); }
        if(!r.ok || (data && data.success === false)){
          const msg = (data && (data.message || data.error)) || `요청이 실패했습니다. (HTTP ${r.status})`;
          const err = new Error(msg);
          err.status = r.status;
          throw err;
        }
        return data;
      }

      const COLUMN_META = {
        work_type:{label:'업무 분류',group:'업무'},
        work_category:{label:'업무 구분',group:'업무'},
        work_status:{label:'업무 상태',group:'업무'},
        work_operation:{label:'업무 운영',group:'업무'},
        work_group:{label:'업무 그룹',group:'업무'},
        work_name:{label:'업무 이름',group:'업무'},
        system_name:{label:'시스템 이름',group:'시스템'},
        system_ip:{label:'시스템 IP',group:'시스템'},
        manage_ip:{label:'관리 IP',group:'시스템'},
        vendor:{label:'시스템 제조사',group:'시스템'},
        model:{label:'시스템 모델명',group:'시스템'},
        serial:{label:'시스템 일련번호',group:'시스템'},
        virtualization:{label:'시스템 가상화',group:'시스템'},
        location_place:{label:'시스템 장소',group:'위치'},
        location_pos:{label:'시스템 위치',group:'위치'},
        slot:{label:'시스템 슬롯',group:'위치'},
        u_size:{label:'시스템 크기',group:'위치'},
        rack_face:{label:'RACK 전면/후면',group:'위치'},
        sys_dept:{label:'시스템 담당부서',group:'조직'},
        sys_owner:{label:'시스템 담당자',group:'조직'},
        svc_dept:{label:'서비스 담당부서',group:'조직'},
        svc_owner:{label:'서비스 담당자',group:'조직'},
        confidentiality:{label:'기밀성',group:'보안'},
        integrity:{label:'무결성',group:'보안'},
        availability:{label:'가용성',group:'보안'},
        security_score:{label:'보안 점수',group:'보안'},
        system_grade:{label:'시스템 등급',group:'보안'},
        core_flag:{label:'핵심/일반',group:'보안'},
        dr_built:{label:'DR 구축여부',group:'보안'},
        svc_redundancy:{label:'서비스 이중화',group:'보안'}
      };

      const FIELD_TO_PAYLOAD_KEY = {
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
        serial: 'serial_number',
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
      const NUMERIC_PAYLOAD_KEYS = new Set(['cia_confidentiality','cia_integrity','cia_availability','security_score','system_slot','system_size']);
      const SERVER_MODEL_FORM_FACTOR_FILTER = '서버';

      const FK_SOURCE_CONFIG = {
        WORK_CATEGORY: { endpoint: '/api/work-categories', valueKey: 'category_code', labelKey: 'wc_name' },
        WORK_DIVISION: { endpoint: '/api/work-divisions', valueKey: 'division_code', labelKey: 'wc_name' },
        WORK_STATUS: { endpoint: '/api/work-statuses', valueKey: 'status_code', labelKey: 'wc_name' },
        WORK_OPERATION: { endpoint: '/api/work-operations', valueKey: 'operation_code', labelKey: 'wc_name' },
        WORK_GROUP: { endpoint: '/api/work-groups', valueKey: 'group_code', labelKey: 'group_name' },
        VENDOR: { endpoint: '/api/vendor-manufacturers', valueKey: 'manufacturer_code', labelKey: 'manufacturer_name' },
        SERVER_MODEL: { endpoint: '/api/hw-server-types', valueKey: 'server_code', labelKey: 'model_name' },
        ORG_CENTER: { endpoint: '/api/org-centers', valueKey: 'center_code', labelKey: 'center_name' },
        ORG_RACK: { endpoint: '/api/org-racks', valueKey: 'rack_code', labelKey: 'rack_name' },
        ORG_DEPT: { endpoint: '/api/org-departments', valueKey: 'dept_code', labelKey: 'dept_name' },
        USER_PROFILE: { endpoint: '/api/user-profiles', valueKey: 'emp_no', labelKey: 'name' },
      };

      function formatUserOption(item, value){
        const name = (item.name || '').trim();
        return name || (value || '');
      }
      function buildUserOptionMeta(item){
        return {
          ownerName: ((item && item.name) || '').trim(),
          ownerDept: ((item && item.department) || '').trim() || ((item && item.company) || '').trim(),
          ownerEmp: ((item && item.emp_no) || '').trim()
        };
      }
      function formatModelOption(item, value){
        const model = (item.model_name || '').trim();
        return model || (value || '');
      }
      function formatCenterOption(item, value){
        const name = (item.center_name || '').trim();
        const location = (item.location || '').trim();
        const usage = (item.usage || '').trim();
        const parts = [];
        if(name) parts.push(name);
        if(location) parts.push(location);
        if(usage) parts.push(usage);
        const label = parts.join(' · ');
        return label || value;
      }
      function formatRackOption(item, value){
        const rackName = (item.rack_name || '').trim();
        return rackName || (value || '');
      }

      const FK_FIELD_SPECS = {
        work_type: { source: 'WORK_CATEGORY', searchable: true },
        work_category: { source: 'WORK_DIVISION', searchable: true },
        work_status: { source: 'WORK_STATUS', searchable: true },
        work_operation: { source: 'WORK_OPERATION', searchable: true },
        work_group: { source: 'WORK_GROUP', searchable: true },
        vendor: { source: 'VENDOR', searchable: true },
        model: { source: 'SERVER_MODEL', optionFormatter: formatModelOption, searchable: true, dependsOn: 'vendor' },
        location_place: { source: 'ORG_CENTER', placeholder: '센터 선택', optionFormatter: formatCenterOption, searchable: true },
        location_pos: { source: 'ORG_RACK', placeholder: '랙 선택', optionFormatter: formatRackOption, searchable: true },
        sys_dept: { source: 'ORG_DEPT', placeholder: '부서 선택', searchable: true },
        svc_dept: { source: 'ORG_DEPT', placeholder: '부서 선택', searchable: true },
        sys_owner: {
          source: 'USER_PROFILE',
          placeholder: '담당자 선택',
          optionFormatter: formatUserOption,
          optionMeta: buildUserOptionMeta,
          skipAutoOptions: true,
          dependsOn: 'sys_dept',
          searchable: true
        },
        svc_owner: {
          source: 'USER_PROFILE',
          placeholder: '담당자 선택',
          optionFormatter: formatUserOption,
          optionMeta: buildUserOptionMeta,
          skipAutoOptions: true,
          dependsOn: 'svc_dept',
          searchable: true
        },
      };

      const fkSourceCache = new Map();
      let fkDataPromise = null;
      const userProfileByDeptCache = new Map();
      let ownerDependencyPairs = null;
      let modelDependencyPairs = null;
      let allUserProfilesPromise = null;
      let allUserProfilesCache = null;

      function getAllowedManufacturerCodesForPage(){
        if(!fkSourceCache.has('SERVER_MODEL')){
          return null;
        }
        const records = fkSourceCache.get('SERVER_MODEL') || [];
        const allowed = new Set();
        (Array.isArray(records) ? records : []).forEach(item => {
          const code = String((item && (item.manufacturer_code || item.manufacturerCode || item.vendor)) || '').trim();
          if(code){
            allowed.add(code);
          }
        });

            let __lastFocusedBeforeModal = null;
        return allowed.size ? allowed : null;
      }

      async function loadFkSource(sourceKey){
              try{ __lastFocusedBeforeModal = document.activeElement || null; }catch(_eF0){ __lastFocusedBeforeModal = null; }
        if(fkSourceCache.has(sourceKey)){
              try{
                if('inert' in el) el.inert = false;
                else el.removeAttribute('inert');
              }catch(_eIn0){ }
          return fkSourceCache.get(sourceKey);
        }

              // Focus inside modal to avoid aria-hidden/focus warning patterns.
              try{
                var focusTarget = el.querySelector('button:not([disabled]):not([tabindex="-1"]), [href]:not([tabindex="-1"]), input:not([disabled]):not([type="hidden"]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])');
                if(focusTarget && typeof focusTarget.focus === 'function'){
                  setTimeout(function(){ try{ focusTarget.focus(); }catch(_eFx){} }, 0);
                }
              }catch(_eF1){ }
        const config = FK_SOURCE_CONFIG[sourceKey];
        if(!config){
          fkSourceCache.set(sourceKey, []);
          return [];

              // If focus is inside the modal, move it out BEFORE hiding via aria-hidden.
              try{
                var active = document.activeElement;
                if(active && el.contains(active)){
                  try{ active.blur(); }catch(_eB){}
                  var restore = (__lastFocusedBeforeModal && __lastFocusedBeforeModal !== document.body) ? __lastFocusedBeforeModal : document.getElementById('detail-edit-open');
                  if(restore && typeof restore.focus === 'function'){
                    try{ restore.focus(); }catch(_eRf){}
                  }
                }
              }catch(_eF2){ }

              try{
                if('inert' in el) el.inert = true;
                else el.setAttribute('inert', '');
              }catch(_eIn1){ }
        }
        try{
          const data = await fetchJSON(config.endpoint, { method: 'GET', headers: { 'Accept': 'application/json' } });
          let items = (data && Array.isArray(data.items)) ? data.items : (Array.isArray(data) ? data : []);
          if(sourceKey === 'SERVER_MODEL' && SERVER_MODEL_FORM_FACTOR_FILTER){
            const target = String(SERVER_MODEL_FORM_FACTOR_FILTER).trim();
            items = items.filter(it => String((it && (it.form_factor || it.hw_type)) || '').trim() === target);
          }
          fkSourceCache.set(sourceKey, items);
          if(sourceKey === 'USER_PROFILE'){
            clearUserProfileCache();
          }
          return items;
        }catch(err){
          console.warn('[onpremise-detail] FK source load failed:', sourceKey, err);
          fkSourceCache.set(sourceKey, []);
          return [];
        }
      }

      function clearUserProfileCache(){
        userProfileByDeptCache.clear();
        allUserProfilesCache = null;
        allUserProfilesPromise = null;
      }

      function defaultFkFormatter(value, label){
        const name = (label || '').trim();
        if(name){
          return name;
        }
        return value || '';
      }

      function getFkOptions(field){
        const spec = FK_FIELD_SPECS[field];
        if(!spec){
          return [];
        }
        const sourceConfig = FK_SOURCE_CONFIG[spec.source] || {};
        let records = fkSourceCache.get(spec.source) || [];
        if(field === 'vendor' && spec.source === 'VENDOR'){
          const allowed = getAllowedManufacturerCodesForPage();
          if(allowed != null){
            records = (Array.isArray(records) ? records : []).filter(item => {
              const code = String((item && (item.manufacturer_code || item.manufacturerCode || item.vendor)) || '').trim();
              return code && allowed.has(code);
            });
          }
        }
        const valueKey = spec.valueKey || sourceConfig.valueKey || 'id';
        const labelKey = spec.labelKey || sourceConfig.labelKey || 'name';
        const formatter = spec.optionFormatter || ((item, value, label) => defaultFkFormatter(value, label));
        const metaBuilder = typeof spec.optionMeta === 'function' ? spec.optionMeta : null;
        const options = [];
        const seen = new Set();
        records.forEach(item => {
          const valueRaw = item ? item[valueKey] : undefined;
          if(valueRaw == null) return;
          const value = String(valueRaw).trim();
          if(!value || seen.has(value)) return;
          const label = formatter(item, value, (item ? item[labelKey] : undefined)) || value;
          const meta = metaBuilder ? metaBuilder(item, value, label) : null;
          options.push({ value, label, meta });
          seen.add(value);
        });
        options.sort((a, b) => {
          return a.label.localeCompare(b.label, 'ko', { sensitivity: 'base' }) || a.value.localeCompare(b.value);
        });
        return options;
      }

      function toDataAttrName(key){
        return `data-${String(key).replace(/([A-Z])/g, '-$1').toLowerCase()}`;
      }

      function buildOptionDataAttrs(meta){
        if(!meta || typeof meta !== 'object') return '';
        const parts = [];
        Object.entries(meta).forEach(([key, val]) => {
          if(val == null || val === '') return;
          parts.push(`${toDataAttrName(key)}="${escapeAttr(String(val))}"`);
        });
        return parts.length ? ` ${parts.join(' ')}` : '';
      }

      function buildFkOptionsMarkup(field, selectedValue, placeholderLabel){
        const placeholder = placeholderLabel || '선택';
        const options = getFkOptions(field);
        let hasSelected = !selectedValue;
        let html = `<option value="">${escapeHTML(placeholder)}</option>`;
        options.forEach(opt => {
          const selected = selectedValue && opt.value === selectedValue ? ' selected' : '';
          if(selected) hasSelected = true;
          const extra = buildOptionDataAttrs(opt.meta);
          html += `<option value="${escapeAttr(opt.value)}"${selected}${extra}>${escapeHTML(opt.label)}</option>`;
        });
        if(selectedValue && !hasSelected){
          html += `<option value="${escapeAttr(selectedValue)}" selected>${escapeHTML(selectedValue)}</option>`;
        }
        return html;
      }

      function isFieldSearchable(field){
        const spec = FK_FIELD_SPECS[field];
        if(!spec) return false;
        if(Object.prototype.hasOwnProperty.call(spec, 'searchable')){
          return !!spec.searchable;
        }
        return true;
      }

      function ensureSearchableDataset(select){
        if(!select) return;
        if(select.dataset && select.dataset.searchable != null){
          return;
        }
        const field = select.getAttribute('data-fk');
        if(!field) return;
        select.dataset.searchable = isFieldSearchable(field) ? 'true' : 'false';
      }

      function renderFkSelect(field, value){
        const spec = FK_FIELD_SPECS[field] || {};
        const placeholder = spec.placeholder || '선택';
        const selectedValue = value == null ? '' : String(value).trim();
        let optionsMarkup = '';
        if(spec.skipAutoOptions){
          const manualPlaceholder = spec.dependsOn ? '부서를 먼저 선택' : placeholder;
          optionsMarkup = `<option value="">${escapeHTML(manualPlaceholder)}</option>`;
          if(selectedValue){
            optionsMarkup += `<option value="${escapeAttr(selectedValue)}" selected>${escapeHTML(selectedValue)}</option>`;
          }
        } else {
          optionsMarkup = buildFkOptionsMarkup(field, selectedValue, placeholder);
        }
        const attrs = [
          `name="${field}"`,
          'class="form-input search-select fk-select"',
          `data-fk="${field}"`,
          `data-placeholder="${placeholder}"`
        ];
        if(selectedValue){
          attrs.push(`data-initial-value="${escapeAttr(selectedValue)}"`);
        }
        if(spec.dependsOn){
          attrs.push(`data-parent-field="${spec.dependsOn}"`);
        }
        if(spec.skipAutoOptions && !selectedValue){
          attrs.push('disabled');
        }
        attrs.push(`data-searchable="${isFieldSearchable(field) ? 'true' : 'false'}"`);
        return `<select ${attrs.join(' ')}>${optionsMarkup}</select>`;
      }

      const searchableSelectMeta = new WeakMap();
      let activeSearchPanel = null;

      function isSearchableSelect(select){
        if(!select) return false;
        const explicit = (select.dataset && select.dataset.searchable);
        if(explicit === 'true') return true;
        if(explicit === 'false') return false;
        const field = (select.dataset && select.dataset.fk) || select.name;
        if(!field) return false;
        return isFieldSearchable(field);
      }
      function getSearchablePlaceholder(select){
        return ((select && select.getAttribute ? select.getAttribute('data-placeholder') : '')
          || (select && select.dataset ? select.dataset.placeholder : '')
          || '선택');
      }
      function setupSearchableSelect(select){
        if(!isSearchableSelect(select) || select.dataset.searchEnhanced === '1'){
          return;
        }
        const wrapper = document.createElement('div');
        wrapper.className = 'fk-searchable-control';
        const displayBtn = document.createElement('button');
        displayBtn.type = 'button';
        displayBtn.className = 'fk-searchable-display';
        displayBtn.setAttribute('aria-haspopup', 'dialog');
        displayBtn.setAttribute('aria-expanded', 'false');
        displayBtn.dataset.placeholder = getSearchablePlaceholder(select);
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'fk-searchable-clear';
        clearBtn.setAttribute('aria-label', '선택 해제');
        clearBtn.title = '선택 해제';
        clearBtn.textContent = '지움';
        clearBtn.hidden = true;
        clearBtn.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          closeSearchDropdown(select);
          select.value = '';
          select.dispatchEvent(new Event('change', { bubbles: true }));
          syncSearchableSelect(select);
        });
        displayBtn.addEventListener('click', event => {
          event.preventDefault();
          if(select.disabled){
            return;
          }
          openSearchDropdown(select);
        });
        const parent = select.parentNode;
        if(parent){
          parent.insertBefore(wrapper, select);
        }
        wrapper.appendChild(displayBtn);
        wrapper.appendChild(clearBtn);
        wrapper.appendChild(select);
        select.classList.add('fk-search-native-hidden');
        select.dataset.searchEnhanced = '1';
        select.addEventListener('change', () => syncSearchableSelect(select));
        searchableSelectMeta.set(select, { wrapper, displayBtn, clearBtn });
      }
      function syncSearchableSelect(select){
        if(!isSearchableSelect(select)){
          return;
        }
        let meta = searchableSelectMeta.get(select);
        if(!meta){
          setupSearchableSelect(select);
          meta = searchableSelectMeta.get(select);
          if(!meta){
            return;
          }
        }
        const placeholder = getSearchablePlaceholder(select);
        const selectedOption = select.selectedOptions && select.selectedOptions[0];
        const optionLabel = ((selectedOption && selectedOption.textContent) ? selectedOption.textContent : '').trim();
        const value = select.value || '';
        const label = optionLabel || value || placeholder;
        meta.displayBtn.textContent = label;
        meta.displayBtn.title = label;
        meta.displayBtn.dataset.placeholder = placeholder;
        const hasValue = !!value;
        meta.displayBtn.classList.toggle('has-value', hasValue);
        meta.clearBtn.hidden = !hasValue;
        const disabled = !!select.disabled;
        meta.wrapper.classList.toggle('is-disabled', disabled);
        meta.displayBtn.disabled = disabled;
        meta.clearBtn.disabled = disabled;
        if(disabled){
          closeSearchDropdown(select);
        }
      }
      function enhanceFormSearchableSelects(formId){
        const form = document.getElementById(formId);
        if(!form) return;
        const targets = [];
        const seen = new Set();
        const pushUnique = (select) => {
          if(!select || seen.has(select)) return;
          seen.add(select);
          targets.push(select);
        };
        form.querySelectorAll('select[data-fk]').forEach(select => {
          ensureSearchableDataset(select);
          pushUnique(select);
        });
        form.querySelectorAll('select.search-select:not([data-fk])').forEach(select => {
          if(!select.dataset.searchable){
            const flag = select.getAttribute('data-searchable') || 'true';
            select.dataset.searchable = flag;
          }
          pushUnique(select);
        });
        targets.forEach(select => {
          if(isSearchableSelect(select)){
            setupSearchableSelect(select);
            syncSearchableSelect(select);
          }
        });
      }
      function buildSearchPanelOptions(select, placeholder){
        const options = [];
        Array.from((select && select.options) ? select.options : []).forEach(opt => {
          const rawLabel = (opt.textContent || '').trim();
          const value = opt.value || '';
          const label = rawLabel || value || placeholder;
          options.push({
            value,
            label,
            searchLabel: label.toLowerCase(),
            valueLower: value.toLowerCase()
          });
        });
        return options;
      }
      function renderSearchPanelOptions(state){
        state.list.innerHTML = '';
        const currentValue = state.select.value || '';
        if(!state.filtered.length){
          state.empty.hidden = false;
          state.focusIndex = -1;
          return;
        }
        state.empty.hidden = true;
        state.filtered.forEach((opt, index) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'fk-search-panel__item';
          btn.textContent = opt.label;
          btn.dataset.value = opt.value;
          btn.setAttribute('role', 'option');
          btn.tabIndex = -1;
          if(opt.value === currentValue){
            btn.classList.add('selected');
            btn.setAttribute('aria-selected', 'true');
            state.focusIndex = index;
          } else {
            btn.setAttribute('aria-selected', 'false');
          }
          btn.addEventListener('click', event => {
            event.preventDefault();
            commitSearchPanelSelection(state, opt.value);
          });
          state.list.appendChild(btn);
        });
      }
      function positionSearchPanel(state){
        const { panel, anchor } = state;
        if(!panel || !anchor){
          return;
        }
        const rect = anchor.getBoundingClientRect();
        const margin = 8;
        const width = Math.max(rect.width, 280);
        panel.style.width = `${width}px`;
        panel.style.zIndex = '5000';
        let left = rect.left;
        if(left + width > window.innerWidth - margin){
          left = window.innerWidth - width - margin;
        }
        left = Math.max(margin, left);
        let top = rect.bottom + margin;
        const availableBelow = window.innerHeight - rect.bottom - margin;
        const availableAbove = rect.top - margin;
        const panelHeight = panel.offsetHeight;
        if(panelHeight > availableBelow && availableAbove > availableBelow){
          top = rect.top - panelHeight - margin;
          panel.classList.add('placement-above');
        } else {
          panel.classList.remove('placement-above');
        }
        top = Math.max(margin, top);
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
      }

      function focusSearchPanelItem(state, index, opts){
        const items = state.list.querySelectorAll('.fk-search-panel__item');
        if(!items.length){
          return;
        }
        const maxIndex = items.length - 1;
        const targetIndex = Math.max(0, Math.min(index, maxIndex));
        state.focusIndex = targetIndex;
        items.forEach((btn, idx) => {
          const isActive = idx === targetIndex;
          btn.classList.toggle('active', isActive);
        });
        const target = items[targetIndex];
        if(!opts || opts.focus !== false){
          target.focus({ preventScroll: true });
        }
        if(opts && opts.ensureVisible){
          const listEl = state.list;
          const itemTop = target.offsetTop;
          const itemBottom = itemTop + target.offsetHeight;
          if(itemBottom > listEl.scrollTop + listEl.clientHeight){
            listEl.scrollTop = itemBottom - listEl.clientHeight;
          } else if(itemTop < listEl.scrollTop){
            listEl.scrollTop = itemTop;
          }
        }
      }

      function filterSearchPanelOptions(state){
        const term = state.input.value.trim().toLowerCase();
        if(!term){
          state.filtered = state.options.slice();
        } else {
          state.filtered = state.options.filter(opt => opt.searchLabel.includes(term) || opt.valueLower.includes(term));
        }
        state.focusIndex = state.filtered.findIndex(opt => opt.value === state.select.value);
        renderSearchPanelOptions(state);
      }
      function commitSearchPanelSelection(state, value){
        state.select.value = value;
        state.select.dispatchEvent(new Event('change', { bubbles: true }));
        syncSearchableSelect(state.select);
        closeSearchDropdown();
      }
      function handleSearchInputKeydown(event, state){
        if(event.key === 'ArrowDown'){
          event.preventDefault();
          if(!state.filtered.length){
            return;
          }
          if(state.focusIndex === -1){
            focusSearchPanelItem(state, 0, { ensureVisible: true });
          } else {
            focusSearchPanelItem(state, state.focusIndex, { ensureVisible: true });
          }
        } else if(event.key === 'Enter'){
          if(state.focusIndex >= 0 && state.filtered[state.focusIndex]){
            event.preventDefault();
            commitSearchPanelSelection(state, state.filtered[state.focusIndex].value);
          }
        }
      }

      function handleSearchListKeydown(event, state){
        const isItem = !!(event.target && event.target.classList && event.target.classList.contains('fk-search-panel__item'));
        if(!isItem){
          return;
        }
        if(event.key === 'ArrowDown'){
          event.preventDefault();
          focusSearchPanelItem(state, (state.focusIndex >= 0 ? state.focusIndex + 1 : 0), { ensureVisible: true });
        } else if(event.key === 'ArrowUp'){
          event.preventDefault();
          if(state.focusIndex <= 0){
            state.focusIndex = -1;
            state.input.focus();
            return;
          }
          focusSearchPanelItem(state, state.focusIndex - 1, { ensureVisible: true });
        } else if(event.key === 'Home'){
          event.preventDefault();
          focusSearchPanelItem(state, 0, { ensureVisible: true });
        } else if(event.key === 'End'){
          event.preventDefault();
          focusSearchPanelItem(state, state.filtered.length - 1, { ensureVisible: true });
        } else if(event.key === 'Enter' || event.key === ' '){
          if(state.focusIndex >= 0 && state.filtered[state.focusIndex]){
            event.preventDefault();
            commitSearchPanelSelection(state, state.filtered[state.focusIndex].value);
          }
        } else if(event.key === 'Escape'){
          event.preventDefault();
          event.stopPropagation();
          closeSearchDropdown();
        }
      }
      function closeSearchDropdown(select){
        if(!activeSearchPanel){
          return;
        }
        const state = activeSearchPanel;
        const meta = searchableSelectMeta.get(state.select);
        if(meta){
          meta.displayBtn.setAttribute('aria-expanded', 'false');
        }
        document.removeEventListener('pointerdown', state.handleOutside, true);
        document.removeEventListener('keydown', state.handleKeydown, true);
        document.removeEventListener('focusin', state.handleFocus, true);
        window.removeEventListener('resize', state.handleResize);
        window.removeEventListener('scroll', state.handleScroll, true);
        try{ state.panel.remove(); }catch(_e){}
        activeSearchPanel = null;
        if(select && meta){
          meta.displayBtn.focus();
        }
      }
      function openSearchDropdown(select){
        if(!isSearchableSelect(select) || select.disabled){
          return;
        }
        const meta = searchableSelectMeta.get(select);
        if(!meta){
          return;
        }
        closeSearchDropdown();
        const placeholder = getSearchablePlaceholder(select);
        const panel = document.createElement('div');
        panel.className = 'fk-search-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', `${placeholder} 검색`);
        const header = document.createElement('div');
        header.className = 'fk-search-panel__header';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'fk-search-panel__input';
        input.placeholder = '검색어 입력';
        input.setAttribute('aria-label', '검색어 입력');
        input.autocomplete = 'off';
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'fk-search-panel__close';
        closeBtn.textContent = '닫기';
        closeBtn.setAttribute('aria-label', '닫기');
        header.appendChild(input);
        header.appendChild(closeBtn);
        panel.appendChild(header);
        const list = document.createElement('div');
        list.className = 'fk-search-panel__list';
        list.setAttribute('role', 'listbox');
        panel.appendChild(list);
        const empty = document.createElement('div');
        empty.className = 'fk-search-panel__empty';
        empty.textContent = '검색 결과가 없습니다.';
        empty.hidden = true;
        panel.appendChild(empty);
        document.body.appendChild(panel);
        const options = buildSearchPanelOptions(select, placeholder);
        const state = {
          select,
          panel,
          trigger: meta.displayBtn,
          anchor: meta.wrapper,
          input,
          closeBtn,
          list,
          empty,
          placeholder,
          options,
          filtered: options.slice(),
          focusIndex: -1
        };
        activeSearchPanel = state;
        meta.displayBtn.setAttribute('aria-expanded', 'true');
        renderSearchPanelOptions(state);
        positionSearchPanel(state);
        setTimeout(() => input.focus(), 0);
        closeBtn.addEventListener('click', event => {
          event.preventDefault();
          closeSearchDropdown();
        });
        input.addEventListener('keydown', event => handleSearchInputKeydown(event, state));
        input.addEventListener('input', () => filterSearchPanelOptions(state));
        list.addEventListener('keydown', event => handleSearchListKeydown(event, state));
        state.handleOutside = event => {
          if(panel.contains(event.target) || meta.wrapper.contains(event.target)){
            return;
          }
          closeSearchDropdown();
        };
        document.addEventListener('pointerdown', state.handleOutside, true);
        state.handleKeydown = event => {
          if(event.key === 'Escape'){
            event.preventDefault();
            event.stopPropagation();
            closeSearchDropdown();
          }
        };
        document.addEventListener('keydown', state.handleKeydown, true);
        state.handleResize = () => closeSearchDropdown();
        window.addEventListener('resize', state.handleResize);
        state.handleScroll = event => {
          const target = event && event.target;
          if(target && (panel.contains(target) || meta.wrapper.contains(target))){
            return;
          }
          const modalRoot = (meta.wrapper && meta.wrapper.closest) ? meta.wrapper.closest('.modal-overlay-full') : null;
          if(modalRoot && target && modalRoot.contains(target)){
            positionSearchPanel(state);
            return;
          }
          closeSearchDropdown();
        };
        window.addEventListener('scroll', state.handleScroll, true);
        state.handleFocus = event => {
          if(panel.contains(event.target) || meta.wrapper.contains(event.target)){
            return;
          }
          closeSearchDropdown();
        };
        document.addEventListener('focusin', state.handleFocus, true);
      }

      function hydrateFkSelects(formId){
        const form = document.getElementById(formId);
        if(!form) return;
        form.querySelectorAll('select[data-fk]').forEach(select => {
          const field = select.getAttribute('data-fk');
          if(!field) return;
          const spec = FK_FIELD_SPECS[field] || {};
          const placeholder = spec.placeholder || '선택';
          const current = String(select.value || select.getAttribute('data-initial-value') || '').trim();
          if(spec.skipAutoOptions){
            // Leave placeholder; options are built by dependency setup.
            if(!select.options.length){
              select.innerHTML = `<option value="">${escapeHTML(spec.dependsOn ? '부서를 먼저 선택' : placeholder)}</option>`;
            }
            if(current){
              // preserve currently selected value
              const has = Array.from(select.options).some(o => String(o.value || '').trim() === current);
              if(!has){
                select.insertAdjacentHTML('beforeend', `<option value="${escapeAttr(current)}" selected>${escapeHTML(current)}</option>`);
              }
            }
            return;
          }
          select.innerHTML = buildFkOptionsMarkup(field, current, placeholder);
          if(current){
            select.value = current;
          }
        });
      }

      function attachSecurityScoreRecalc(formId){
        const form = document.getElementById(formId);
        if(!form) return;
        const scoreInput = form.querySelector('input[name="security_score"]');
        if(!scoreInput) return;
        function recompute(){
          const gradeField = form.querySelector('[name="system_grade"]');

          const cEl = form.querySelector('[name="confidentiality"]');
          const iEl = form.querySelector('[name="integrity"]');
          const aEl = form.querySelector('[name="availability"]');
          const cRaw = ((cEl && cEl.value != null) ? String(cEl.value) : '').trim();
          const iRaw = ((iEl && iEl.value != null) ? String(iEl.value) : '').trim();
          const aRaw = ((aEl && aEl.value != null) ? String(aEl.value) : '').trim();

          // Match backend: if any CIA field is missing, clear score/grade.
          if(!cRaw || !iRaw || !aRaw){
            scoreInput.value = '';
            if(gradeField) gradeField.value = '';
            return;
          }

          const c = parseInt(cRaw, 10);
          const i = parseInt(iRaw, 10);
          const a = parseInt(aRaw, 10);
          if([c, i, a].some(n => Number.isNaN(n))){
            scoreInput.value = '';
            if(gradeField) gradeField.value = '';
            return;
          }

          const total = c + i + a;
          scoreInput.value = total ? String(total) : '';
          if(gradeField){
            if(total >= 8) gradeField.value = '1등급';
            else if(total >= 6) gradeField.value = '2등급';
            else if(total > 0) gradeField.value = '3등급';
            else gradeField.value = '';
          }
        }
        ['confidentiality', 'integrity', 'availability'].forEach(n => {
          const el = form.querySelector(`[name="${n}"]`);
          if(el) el.addEventListener('change', recompute);
        });
        recompute();
      }

      function enforceVirtualizationDash(form){
        if(!form) return;
        const virt = form.querySelector('[name="virtualization"]');
        if(!virt) return;
        const v = String(virt.value || '').trim();
        const dashTargetsText = ['vendor', 'model', 'serial', 'location_pos'];
        const dashTargetsNumber = ['slot', 'u_size', 'rack_face'];
        const makeDash = (el) => {
          if(!el) return;
          if(el.tagName === 'SELECT'){
            el.value = '';
          } else {
            el.value = '-';
          }
        };
        const clearIfDash = (el, fallbackType) => {
          if(!el) return;
          if(el.tagName === 'SELECT'){
            return;
          }
          if(el.value === '-') el.value = '';
          if(fallbackType){
            try{ el.type = fallbackType; }catch(_e){}
          }
        };
        if(v === '가상서버' || v === '클라우드'){
          dashTargetsText.forEach(name => {
            const el = form.querySelector(`[name="${name}"]`);
            if(el) makeDash(el);
          });
          dashTargetsNumber.forEach(name => {
            const el = form.querySelector(`[name="${name}"]`);
            if(!el) return;
            if(!el.dataset.origType){ el.dataset.origType = el.type || 'number'; }
            try{ el.type = 'text'; }catch(_e){}
            makeDash(el);
          });
        } else {
          dashTargetsText.forEach(name => {
            const el = form.querySelector(`[name="${name}"]`);
            if(el) clearIfDash(el);
          });
          dashTargetsNumber.forEach(name => {
            const el = form.querySelector(`[name="${name}"]`);
            if(!el) return;
            const origType = el.dataset.origType || 'number';
            clearIfDash(el, origType);
            if(el.type === 'number'){
              el.min = '0';
              el.step = '1';
            }
          });
        }
      }

      function attachVirtualizationHandler(formId){
        const form = document.getElementById(formId);
        if(!form) return;
        const sel = form.querySelector('[name="virtualization"]');
        if(!sel) return;
        sel.addEventListener('change', () => enforceVirtualizationDash(form));
        enforceVirtualizationDash(form);
      }

      function setupModelDependenciesForForm(formId){
        const form = document.getElementById(formId);
        if(!form) return;
        const pairs = modelDependencyPairs || [['vendor', 'model']];
        modelDependencyPairs = pairs;
        pairs.forEach(([vendorField, modelField]) => {
          const vendorSelect = form.querySelector(`[name="${vendorField}"]`);
          const modelSelect = form.querySelector(`[name="${modelField}"]`);
          if(!vendorSelect || !modelSelect) return;
          let lastVendorCode = null;

          function disableModelSelect(reasonText){
            const msg = (reasonText == null ? '' : String(reasonText)).trim() || '제조사를 먼저 선택';
            modelSelect.disabled = true;
            modelSelect.setAttribute('data-placeholder', msg);
            modelSelect.innerHTML = `<option value="">${escapeHTML(msg)}</option>`;
            modelSelect.value = '';
            modelSelect.removeAttribute('data-initial-value');
            syncSearchableSelect(modelSelect);
          }

          function enableModelSelect(){
            modelSelect.disabled = false;
            const spec = FK_FIELD_SPECS[modelField] || {};
            const ph = spec.placeholder || '선택';
            modelSelect.setAttribute('data-placeholder', ph);
          }

          function applyVendorFilter(){
            const vendorCode = String(vendorSelect.value || '').trim();
            const vendorCleared = (lastVendorCode !== null && String(lastVendorCode || '').trim() && !vendorCode);
            lastVendorCode = vendorCode;

            if(vendorCleared){
              // Requirement: clearing vendor must also clear model.
              disableModelSelect('제조사를 먼저 선택');
              modelSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }

            if(!vendorCode){
              // Requirement: model must be disabled if vendor is not selected.
              return disableModelSelect('제조사를 먼저 선택');
            }

            enableModelSelect();

            const current = vendorCleared
              ? ''
              : String(modelSelect.value || modelSelect.getAttribute('data-initial-value') || '').trim();
            const modelSpec = FK_FIELD_SPECS[modelField] || {};
            const sourceKey = modelSpec.source;
            const sourceConfig = (sourceKey && FK_SOURCE_CONFIG[sourceKey]) ? FK_SOURCE_CONFIG[sourceKey] : {};
            const valueKey = sourceConfig.valueKey || 'id';
            const labelKey = sourceConfig.labelKey || 'name';
            const records = (sourceKey ? (fkSourceCache.get(sourceKey) || []) : []);
            const filtered = (Array.isArray(records) ? records : []).filter(it => String((it && (it.manufacturer_code || it.manufacturerCode || it.vendor)) || '').trim() === vendorCode);
            const opts = [];
            const seen = new Set();
            filtered.forEach(item => {
              const valueRaw = item ? item[valueKey] : undefined;
              if(valueRaw == null) return;
              const value = String(valueRaw).trim();
              if(!value || seen.has(value)) return;
              const label = formatModelOption(item, value, (item ? item[labelKey] : undefined)) || value;
              opts.push({ value, label });
              seen.add(value);
            });
            opts.sort((a, b) => a.label.localeCompare(b.label, 'ko', { sensitivity: 'base' }) || a.value.localeCompare(b.value));
            const ph = modelSpec.placeholder || '선택';
            let html = `<option value="">${escapeHTML(ph)}</option>`;
            let hasSelected = !current;
            opts.forEach(o => {
              const sel = current && o.value === current ? ' selected' : '';
              if(sel) hasSelected = true;
              html += `<option value="${escapeAttr(o.value)}"${sel}>${escapeHTML(o.label)}</option>`;
            });
            if(current && !hasSelected){
              html += `<option value="${escapeAttr(current)}" selected>${escapeHTML(current)}</option>`;
            }
            modelSelect.innerHTML = html;
            if(current) modelSelect.value = current;
            syncSearchableSelect(modelSelect);
          }
          vendorSelect.addEventListener('change', applyVendorFilter);
          applyVendorFilter();
        });
      }

      function setupLocationCascadeForForm(formId){
        const form = document.getElementById(formId);
        if(!form) return;
        const center = form.querySelector('[name="location_place"]');
        const rack = form.querySelector('[name="location_pos"]');
        if(!center || !rack) return;

        let lastCenterCode = null;

        function setRackDisabledPlaceholder(placeholderText){
          const ph = (placeholderText == null ? '' : String(placeholderText)).trim() || '센터를 먼저 선택';
          rack.disabled = true;
          rack.setAttribute('data-placeholder', ph);
          rack.innerHTML = `<option value="">${escapeHTML(ph)}</option>`;
          rack.value = '';
          rack.removeAttribute('data-initial-value');
          syncSearchableSelect(rack);
        }

        function enableRackWithPlaceholder(placeholderText){
          const rackSpec = FK_FIELD_SPECS.location_pos || {};
          const ph = (placeholderText == null ? '' : String(placeholderText)).trim() || (rackSpec.placeholder || '랙 선택');
          rack.disabled = false;
          rack.setAttribute('data-placeholder', ph);
        }

        function applyCenterFilter(){
          const centerCode = String(center.value || '').trim();
          const centerChanged = (lastCenterCode !== null && lastCenterCode !== centerCode);
          lastCenterCode = centerCode;

          if(!centerCode){
            // If center is cleared, rack must be cleared too.
            return setRackDisabledPlaceholder('센터를 먼저 선택');
          }

          const rackSpec = FK_FIELD_SPECS.location_pos || {};
          enableRackWithPlaceholder(rackSpec.placeholder || '랙 선택');

          const current = centerChanged ? '' : String(rack.value || rack.getAttribute('data-initial-value') || '').trim();
          const placeholder = rack.getAttribute('data-placeholder') || rackSpec.placeholder || '랙 선택';
          const sourceKey = rackSpec.source;
          const records = fkSourceCache.get(sourceKey) || [];
          const filtered = centerCode
            ? (Array.isArray(records) ? records : []).filter(it => String((it && (it.center_code || it.centerCode)) || '').trim() === centerCode)
            : (Array.isArray(records) ? records : []);
          const sourceConfig = FK_SOURCE_CONFIG[sourceKey] || {};
          const valueKey = sourceConfig.valueKey || 'id';
          const labelKey = sourceConfig.labelKey || 'name';
          const opts = [];
          const seen = new Set();
          filtered.forEach(item => {
            const valueRaw = item ? item[valueKey] : undefined;
            if(valueRaw == null) return;
            const value = String(valueRaw).trim();
            if(!value || seen.has(value)) return;
            const label = formatRackOption(item, value, (item ? item[labelKey] : undefined)) || value;
            opts.push({ value, label });
            seen.add(value);
          });
          opts.sort((a, b) => a.label.localeCompare(b.label, 'ko', { sensitivity: 'base' }) || a.value.localeCompare(b.value));
          let html = `<option value="">${escapeHTML(placeholder)}</option>`;
          let hasSelected = !current;
          opts.forEach(o => {
            const sel = current && o.value === current ? ' selected' : '';
            if(sel) hasSelected = true;
            html += `<option value="${escapeAttr(o.value)}"${sel}>${escapeHTML(o.label)}</option>`;
          });
          if(current && !hasSelected){
            html += `<option value="${escapeAttr(current)}" selected>${escapeHTML(current)}</option>`;
          }
          rack.innerHTML = html;
          if(current) rack.value = current;
          syncSearchableSelect(rack);
        }

        center.addEventListener('change', applyCenterFilter);
        applyCenterFilter();
      }

      async function listAllUserProfiles(){
        if(allUserProfilesCache){
          return allUserProfilesCache;
        }
        if(allUserProfilesPromise){
          return allUserProfilesPromise;
        }

        allUserProfilesPromise = (async function(){
          try{
            const items = await loadFkSource('USER_PROFILE');
            allUserProfilesCache = Array.isArray(items) ? items : [];
            return allUserProfilesCache;
          }catch(err){
            console.warn('[onpremise-detail] USER_PROFILE load failed:', err);
            allUserProfilesCache = [];
            return allUserProfilesCache;
          }finally{
            allUserProfilesPromise = null;
          }
        })();
        return allUserProfilesPromise;
      }

      function resolveDeptFilterValue(deptValue){
        const raw = String(deptValue || '').trim();
        if(!raw){
          return { code: '', name: '' };
        }
        const records = fkSourceCache.get('ORG_DEPT') || [];
        // If the select already has a dept_code, preserve it and derive name if possible.
        let codeMatch = null;
        for(let i = 0; i < (Array.isArray(records) ? records.length : 0); i++){
          const it = records[i];
          const code = String((it && (it.dept_code || it.deptCode)) || '').trim();
          if(code && code === raw){
            codeMatch = it;
            break;
          }
        }
        if(codeMatch){
          return {
            code: raw,
            name: String((codeMatch && (codeMatch.dept_name || codeMatch.deptName)) || '').trim() || raw
          };
        }
        // Otherwise treat it as a dept_name and resolve to code if possible.
        let nameMatch = null;
        for(let i = 0; i < (Array.isArray(records) ? records.length : 0); i++){
          const it = records[i];
          const name = String((it && (it.dept_name || it.deptName)) || '').trim();
          if(name && name === raw){
            nameMatch = it;
            break;
          }
        }
        if(nameMatch){
          return {
            code: String((nameMatch && (nameMatch.dept_code || nameMatch.deptCode)) || '').trim(),
            name: raw
          };
        }
        // Unknown value: keep as-is for both.
        return { code: raw, name: raw };
      }

      async function listUserProfilesByDept(deptCode){
        const filter = resolveDeptFilterValue(deptCode);
        const code = String(filter.code || '').trim();
        const name = String(filter.name || '').trim();
        if(!code && !name){
          return [];
        }
        const cacheKey = code || name;
        if(userProfileByDeptCache.has(cacheKey)){
          return userProfileByDeptCache.get(cacheKey);
        }
        const all = await listAllUserProfiles();
        const filtered = (Array.isArray(all) ? all : []).filter(it => {
          const deptCodeRaw = String((it && (it.dept_code || it.deptCode || it.department_code || it.department_code_raw)) || '').trim();
          const deptNameRaw = String((it && (it.dept_name || it.deptName || it.department_name || it.department || it.dept)) || '').trim();
          // If profile has no dept info, include it (global users).
          if(!deptCodeRaw && !deptNameRaw) return true;
          if(code && deptCodeRaw && deptCodeRaw === code) return true;
          if(name && deptNameRaw && deptNameRaw === name) return true;
          return false;
        });
        userProfileByDeptCache.set(cacheKey, filtered);
        return filtered;
      }

      function setupOwnerDependenciesForForm(formId){
        const form = document.getElementById(formId);
        if(!form) return;
        const pairs = ownerDependencyPairs || [['sys_dept', 'sys_owner'], ['svc_dept', 'svc_owner']];
        ownerDependencyPairs = pairs;

        pairs.forEach(([deptField, ownerField]) => {
          const deptSelect = form.querySelector(`[name="${deptField}"]`);
          const ownerSelect = form.querySelector(`[name="${ownerField}"]`);
          if(!deptSelect || !ownerSelect) return;
          const ownerSpec = FK_FIELD_SPECS[ownerField] || {};
          const placeholder = ownerSpec.placeholder || '담당자 선택';

          async function rebuildOwnerOptions(){
            const deptCode = String(deptSelect.value || '').trim();
            if(!deptCode){
              // Requirement: clearing dept must also clear & disable owner.
              ownerSelect.disabled = true;
              ownerSelect.setAttribute('data-placeholder', '부서를 먼저 선택');
              ownerSelect.innerHTML = `<option value="">${escapeHTML('부서를 먼저 선택')}</option>`;
              ownerSelect.value = '';
              ownerSelect.removeAttribute('data-initial-value');
              syncSearchableSelect(ownerSelect);
              return;
            }

            const current = String(ownerSelect.value || ownerSelect.getAttribute('data-initial-value') || '').trim();
            const items = await listUserProfilesByDept(deptCode);
            const sourceKey = ownerSpec.source;
            const sourceConfig = FK_SOURCE_CONFIG[sourceKey] || {};
            const valueKey = sourceConfig.valueKey || 'id';
            const labelKey = sourceConfig.labelKey || 'name';
            const options = [];
            const seen = new Set();
            (Array.isArray(items) ? items : []).forEach(item => {
              const valueRaw = item ? item[valueKey] : undefined;
              if(valueRaw == null) return;
              const value = String(valueRaw).trim();
              if(!value || seen.has(value)) return;
              const label = formatUserOption(item, value, (item ? item[labelKey] : undefined)) || value;
              const meta = buildUserOptionMeta(item);
              options.push({ value, label, meta });
              seen.add(value);
            });
            options.sort((a, b) => a.label.localeCompare(b.label, 'ko', { sensitivity: 'base' }) || a.value.localeCompare(b.value));
            let html = `<option value="">${escapeHTML(placeholder)}</option>`;
            let hasSelected = !current;
            options.forEach(o => {
              const sel = current && o.value === current ? ' selected' : '';
              if(sel) hasSelected = true;
              const extra = buildOptionDataAttrs(o.meta);
              html += `<option value="${escapeAttr(o.value)}"${sel}${extra}>${escapeHTML(o.label)}</option>`;
            });
            if(current && !hasSelected){
              html += `<option value="${escapeAttr(current)}" selected>${escapeHTML(current)}</option>`;
            }
            ownerSelect.disabled = false;
            ownerSelect.innerHTML = html;
            if(current) ownerSelect.value = current;
            syncSearchableSelect(ownerSelect);
          }

          deptSelect.addEventListener('change', () => {
            ownerSelect.value = '';
            ownerSelect.setAttribute('data-initial-value', '');
            rebuildOwnerOptions();
          });
          rebuildOwnerOptions();
        });
      }

      function ensureFkDataReady(){
        if(fkDataPromise) return fkDataPromise;
        const sources = Object.keys(FK_SOURCE_CONFIG);
        fkDataPromise = Promise.all(sources.map(k => loadFkSource(k))).catch(() => {});
        return fkDataPromise;
      }

      function getFieldValueForEdit(row, field){
        if(!row) return '';

        function _blankish(v){
          return v == null || (typeof v === 'string' && (v.trim() === '' || v.trim() === '-'));
        }
        function _toBool(v){
          if(v === true) return true;
          if(v === false) return false;
          if(v == null) return null;
          const s = String(v).trim().toLowerCase();
          if(!s) return null;
          if(s === '1' || s === 'true' || s === 'y' || s === 'yes' || s === 'o') return true;
          if(s === '0' || s === 'false' || s === 'n' || s === 'no' || s === 'x') return false;
          return null;
        }

        // Inspection/security fields: accept both UI-normalized keys and raw API keys.
        if(field === 'confidentiality'){
          if(!_blankish(row.confidentiality)) return String(row.confidentiality);
          if(row.cia_confidentiality != null) return String(row.cia_confidentiality);
          return '';
        }
        if(field === 'integrity'){
          if(!_blankish(row.integrity)) return String(row.integrity);
          if(row.cia_integrity != null) return String(row.cia_integrity);
          return '';
        }
        if(field === 'availability'){
          if(!_blankish(row.availability)) return String(row.availability);
          if(row.cia_availability != null) return String(row.cia_availability);
          return '';
        }
        if(field === 'security_score'){
          if(!_blankish(row.security_score)) return String(row.security_score);
          if(row.security_score != null) return String(row.security_score);
          return '';
        }
        if(field === 'system_grade'){
          if(!_blankish(row.system_grade)) return String(row.system_grade);
          if(row.system_grade != null) return String(row.system_grade);
          return '';
        }
        if(field === 'core_flag'){
          if(!_blankish(row.core_flag)) return String(row.core_flag);
          const b = _toBool(row.is_core_system);
          return b == null ? '' : (b ? '핵심' : '일반');
        }
        if(field === 'dr_built'){
          if(!_blankish(row.dr_built)) return String(row.dr_built);
          const b = _toBool(row.has_dr_site);
          return b == null ? '' : (b ? 'O' : 'X');
        }
        if(field === 'svc_redundancy'){
          if(!_blankish(row.svc_redundancy)) return String(row.svc_redundancy);
          const b = _toBool(row.has_service_ha);
          return b == null ? '' : (b ? 'O' : 'X');
        }

        const map = {
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
        if(field === 'manage_ip') return row.mgmt_ip || row.manage_ip || '';
        if(field === 'virtualization') return row.virtualization || row.virtualization_raw || row.virtualization_type || '';
        if(map[field] && row[map[field]] != null) return row[map[field]];
        if(row[field] === '-') return '';
        return (row[field] != null) ? row[field] : '';
      }

      function generateFieldInput(col, value = ''){
        const selectConfig = {
          virtualization: { options: [{ value: '', label: '선택' }, { value: '물리서버' }, { value: '가상서버' }, { value: '클라우드' }], searchable: true, placeholder: '선택' },
          confidentiality: { options: [{ value: '', label: '-' }, { value: '1' }, { value: '2' }, { value: '3' }], searchable: true, extraClass: 'score-trigger', placeholder: '선택' },
          integrity: { options: [{ value: '', label: '-' }, { value: '1' }, { value: '2' }, { value: '3' }], searchable: true, extraClass: 'score-trigger', placeholder: '선택' },
          availability: { options: [{ value: '', label: '-' }, { value: '1' }, { value: '2' }, { value: '3' }], searchable: true, extraClass: 'score-trigger', placeholder: '선택' },
          system_grade: { options: [{ value: '', label: '-' }, { value: '1등급' }, { value: '2등급' }, { value: '3등급' }], searchable: true, placeholder: '선택' },
          core_flag: { options: [{ value: '', label: '-' }, { value: '핵심' }, { value: '일반' }], searchable: true, placeholder: '선택' },
          dr_built: { options: [{ value: '', label: '-' }, { value: 'O' }, { value: 'X' }], searchable: true, placeholder: '선택' },
          svc_redundancy: { options: [{ value: '', label: '-' }, { value: 'O' }, { value: 'X' }], searchable: true, placeholder: '선택' }
        };
        if(FK_FIELD_SPECS[col]){
          return renderFkSelect(col, value);
        }
        if(col === 'security_score'){
          const v = (value == null ? '' : value);
          return `<input name="security_score" class="form-input" type="number" readonly placeholder="자동 합계" value="${escapeAttr(String(v))}">`;
        }
        if(selectConfig[col]){
          const cfg = selectConfig[col];
          const classes = ['form-input', 'search-select'];
          if(cfg.extraClass){ classes.push(cfg.extraClass); }
          const dataAttrs = [];
          if(cfg.searchable !== undefined){ dataAttrs.push(`data-searchable="${cfg.searchable ? 'true' : 'false'}"`); }
          if(cfg.placeholder){ dataAttrs.push(`data-placeholder="${cfg.placeholder}"`); }
          const optionsMarkup = cfg.options.map(opt => {
            const optionValue = typeof opt === 'object'
              ? String((opt.value != null) ? opt.value : '')
              : String((opt != null) ? opt : '');
            const optionLabel = typeof opt === 'object'
              ? ((opt.label != null) ? opt.label : ((opt.value != null) ? opt.value : '-'))
              : (opt || '-');
            const selectedAttr = optionValue === String((value != null) ? value : '') ? ' selected' : '';
            return `<option value="${escapeAttr(optionValue)}"${selectedAttr}>${escapeHTML(optionLabel)}</option>`;
          }).join('');
          const attrString = dataAttrs.length ? ' ' + dataAttrs.join(' ') : '';
          return `<select name="${col}" class="${classes.join(' ')}"${attrString}>${optionsMarkup}</select>`;
        }
        if(col === 'rack_face'){
          const selF = (value||"").toUpperCase()==="REAR"||value==="후면" ? "" : " selected";
          const selR = (value||"").toUpperCase()==="REAR"||value==="후면" ? " selected" : "";
          return `<select name="rack_face" class="form-input search-select" data-searchable="true" data-placeholder="선택"><option value="">선택</option><option value="FRONT"${selF}>전면</option><option value="REAR"${selR}>후면</option></select>`;
        }
        if(['slot', 'u_size'].includes(col)){
          return `<input name="${col}" type="number" min="0" step="1" class="form-input" value="${escapeAttr(String((value != null) ? value : ''))}">`;
        }
        return `<input name="${col}" class="form-input" value="${escapeAttr(String((value != null) ? value : ''))}">`;
      }

      function fillEditForm(row){
        const form = document.getElementById(EDIT_FORM_ID);
        if(!form) return;
        form.innerHTML = '';
        const groups = [
          { title: '비즈니스', cols: ['work_type', 'work_category', 'work_status', 'work_operation', 'work_group', 'work_name', 'system_name', 'system_ip', 'manage_ip'] },
          { title: '시스템', cols: ['vendor', 'model', 'serial', 'virtualization', 'location_place', 'location_pos', 'slot', 'u_size', 'rack_face'] },
          { title: '담당자', cols: ['sys_dept', 'sys_owner', 'svc_dept', 'svc_owner'] },
          { title: '점검', cols: ['confidentiality', 'integrity', 'availability', 'security_score', 'system_grade', 'core_flag', 'dr_built', 'svc_redundancy'] }
        ];
        groups.forEach(g => {
          const section = document.createElement('div');
          section.className = 'form-section';
          section.innerHTML = `<div class="section-header"><h4>${g.title}</h4></div>`;
          const grid = document.createElement('div');
          grid.className = 'form-grid';
          g.cols.forEach(c => {
            if(!COLUMN_META[c] && c !== 'security_score') return;
            const wrap = document.createElement('div');
            wrap.className = 'form-row';
            const labelText = (c === 'security_score') ? '보안 점수' : ((COLUMN_META[c] && COLUMN_META[c].label) || c);
            const valueForField = getFieldValueForEdit(row, c);
            wrap.innerHTML = `<label>${labelText}</label>${generateFieldInput(c, valueForField)}`;
            grid.appendChild(wrap);
          });
          section.appendChild(grid);
          form.appendChild(section);
        });
        hydrateFkSelects(EDIT_FORM_ID);
        enhanceFormSearchableSelects(EDIT_FORM_ID);
        setupLocationCascadeForForm(EDIT_FORM_ID);
        const fkReady = ensureFkDataReady();
        if(fkReady && typeof fkReady.then === 'function'){
          fkReady.then(() => {
            hydrateFkSelects(EDIT_FORM_ID);
            enhanceFormSearchableSelects(EDIT_FORM_ID);
            setupLocationCascadeForForm(EDIT_FORM_ID);
          });
        }
        attachSecurityScoreRecalc(EDIT_FORM_ID);
        attachVirtualizationHandler(EDIT_FORM_ID);
        setupOwnerDependenciesForForm(EDIT_FORM_ID);
        setupModelDependenciesForForm(EDIT_FORM_ID);
      }

      function collectForm(form){
        const data = {};
        form.querySelectorAll('input,select,textarea').forEach(el => {
          if(!el.name) return;
          data[el.name] = (el.value || '').trim();
        });
        return attachOwnerDisplayValues(form, data);
      }

      function attachOwnerDisplayValues(form, data){
        if(!form) return data;
        ['sys_owner', 'svc_owner'].forEach(field => {
          const select = form.querySelector(`[name="${field}"]`);
          if(!select) return;
          const selected = select.selectedOptions && select.selectedOptions[0];
          if(!selected) return;
          // Prefer explicit meta, but fall back to the visible option label (often just "이름").
          const displayFromMeta = (selected.dataset.ownerName || '').trim();
          const displayFromLabel = (selected.textContent || '').trim();
          const displayName = displayFromMeta || displayFromLabel;
          const placeholder = (select.getAttribute('data-placeholder') || select.dataset.placeholder || '').trim();
          const isPlaceholder = !displayName
            || displayName === placeholder
            || displayName === '부서를 먼저 선택'
            || displayName === '담당자 선택'
            || displayName === '선택';
          if(displayName && displayName !== String(select.value || '').trim()){
            if(!isPlaceholder) data[`${field}_display`] = displayName;
          } else if(displayName){
            // If label equals value (e.g. emp_no-only), still keep it to avoid blank UI updates.
            if(!isPlaceholder) data[`${field}_display`] = displayName;
          }
          const ownerEmp = (selected.dataset.ownerEmp || '').trim();
          if(ownerEmp){
            data[`${field}_emp_value`] = ownerEmp;
          }
          const ownerDept = (selected.dataset.ownerDept || '').trim();
          if(ownerDept){
            data[`${field}_dept_display`] = ownerDept;
          }
        });
        return data;
      }

      function buildAssetPayload(formData, existingRow){
        const payload = {
          asset_category: 'SERVER',
          asset_type: 'ON_PREMISE'
        };

        // Fields that must support explicit clearing ("지움")
        // NOTE: backend normalizes blank strings to NULL, but the UI must still send
        // explicit keys for clears; otherwise old values remain.
        const CLEARABLE_FIELDS = new Set([
          'sys_dept','svc_dept','location_place','location_pos','vendor','model',
          // Security/basic fields
          'confidentiality','integrity','availability','security_score',
          'system_grade','core_flag','dr_built','svc_redundancy'
        ]);

        Object.entries(FIELD_TO_PAYLOAD_KEY).forEach(([field, payloadKey]) => {
          const raw = formData[field];
          if(raw == null) return;
          // Allow clearing fields by sending explicit null
          if(raw === '' && CLEARABLE_FIELDS.has(field)){
            payload[payloadKey] = null;
            return;
          }
          if(raw === '') return;
          let value = raw;
          if(NUMERIC_PAYLOAD_KEYS.has(payloadKey)){
            const num = parseInt(raw, 10);
            if(Number.isNaN(num)) return;
            value = num;
          }
          payload[payloadKey] = value;
        });
        [
          { formKey: 'sys_owner_display', payloadKey: 'system_owner_display' },
          { formKey: 'svc_owner_display', payloadKey: 'service_owner_display' }
        ].forEach(({ formKey, payloadKey }) => {
          const val = formData[formKey];
          if(val != null && String(val).trim() !== ''){
            payload[payloadKey] = String(val).trim();
          }
        });
        // Keep explicit nulls (used for clearing). Only drop empty strings / undefined.
        Object.keys(payload).forEach(key => {
          if(payload[key] === '' || payload[key] === undefined){
            delete payload[key];
          }
        });

        // Cascade rule: clearing center must also clear rack.
        if(Object.prototype.hasOwnProperty.call(payload, 'center_code') && payload.center_code === null){
          payload.rack_code = null;
        }

        // Cascade rule: clearing vendor must also clear model.
        if(Object.prototype.hasOwnProperty.call(payload, 'vendor') && payload.vendor === null){
          payload.model = null;
        }

        // Cascade rule: clearing department must also clear owner.
        if(Object.prototype.hasOwnProperty.call(payload, 'system_department') && payload.system_department === null){
          payload.system_owner = null;
          payload.system_owner_display = null;
        }
        if(Object.prototype.hasOwnProperty.call(payload, 'service_department') && payload.service_department === null){
          payload.service_owner = null;
          payload.service_owner_display = null;
        }
        return payload;
      }

      async function apiUpdateAsset(id, payload){
        const data = await fetchJSON(`${API_ENDPOINT}/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
        return data.item;
      }

      async function apiFetchAsset(id){
        const data = await fetchJSON(`${API_ENDPOINT}/${id}`, { method: 'GET', headers: { 'Accept': 'application/json' } });
        return (data && data.item) || null;
      }

      function getAssetIdFromStorage(){
        try{
          const cand = sessionStorage.getItem('onpremise:selected:asset_id')
            || localStorage.getItem('onpremise:selected:asset_id')
            || localStorage.getItem('onpremise:last_selected_asset_id');
          if(cand){
            const n = parseInt(String(cand), 10);
            if(Number.isFinite(n) && n > 0) return n;
          }
        }catch(_e){}
        try{
          const raw = sessionStorage.getItem('onpremise:selected:row') || localStorage.getItem('onpremise:selected:row');
          if(raw){
            const row = JSON.parse(raw);
            const cand2 = row ? ((row.id != null) ? row.id : ((row.asset_id != null) ? row.asset_id : row.assetId)) : undefined;
            const n2 = parseInt(String(cand2), 10);
            if(Number.isFinite(n2) && n2 > 0) return n2;
          }
        }catch(_e2){}
        return null;
      }

      function getSelectedRowFromStorage(){
        try{
          const raw = sessionStorage.getItem('onpremise:selected:row') || localStorage.getItem('onpremise:selected:row');
          if(!raw) return null;
          const row = JSON.parse(raw);
          return row || null;
        }catch(_e){
          return null;
        }
      }

      async function loadRowForEdit(){
        const stored = getSelectedRowFromStorage();
        const id = (stored
          ? ((stored.id != null) ? stored.id : ((stored.asset_id != null) ? stored.asset_id : stored.assetId))
          : undefined) || getAssetIdFromStorage();
        if(!id){
          return { row: null, id: null };
        }
        // Always prefer a fresh GET for the edit modal.
        // The stored list-row can be a partial projection (often missing inspection/security fields).
        try{
          const data = await fetchJSON(`${API_ENDPOINT}/${id}`, { method: 'GET', headers: { 'Accept': 'application/json' } });
          const item = data && data.item;
          if(item){
            let viewRow = item;
            try{
              const prev = getSelectedRowFromStorage ? getSelectedRowFromStorage() : null;
              const normalized = normalizeAssetRecordForBasicInfo ? normalizeAssetRecordForBasicInfo(item, prev) : null;
              viewRow = normalized || item;
            }catch(_eNorm){ /* keep item */ }
            viewRow = _safeCoerceRow(viewRow);

            try{ sessionStorage.setItem('onpremise:selected:row', JSON.stringify(viewRow)); }catch(_e0){}
            try{ localStorage.setItem('onpremise:selected:row', JSON.stringify(viewRow)); }catch(_e1){}
            try{ sessionStorage.setItem('onpremise:selected:asset_id', String(id)); }catch(_e2){}
            try{ localStorage.setItem('onpremise:selected:asset_id', String(id)); }catch(_e3){}
            try{ localStorage.setItem('onpremise:last_selected_asset_id', String(id)); }catch(_e4){}

            return { row: viewRow || null, id: parseInt(String(id), 10) };
          }
        }catch(_eFetch){
          // Fall back to stored row if GET fails.
        }

        if(stored){
          return { row: _safeCoerceRow(stored) || stored, id: parseInt(String(id), 10) };
        }
        return { row: null, id: parseInt(String(id), 10) };
      }

      function updateDetailHeaderAndCards(updated){
        try{
          updated = _safeCoerceRow(updated);
          if(updated && (updated.work_name || updated.system_name)){
            const h1 = document.querySelector('.page-header h1');
            const p = document.querySelector('.page-header p');
            if(h1) h1.textContent = updated.work_name || '-';
            if(p) p.textContent = updated.system_name || '-';
          }
        }catch(_e){}
        try{
          if(typeof applyRowToBasicInfo === 'function'){
            applyRowToBasicInfo(updated);
          }
        }catch(_e2){}
      }

      let currentRowForEdit = null;
      let currentIdForEdit = null;
      let __wired = false;

      function wireModalEvents(){
        if(__wired) return;
        __wired = true;

        const modal = document.getElementById(EDIT_MODAL_ID);
        const openBtn = document.getElementById('detail-edit-open');
        const closeBtn = document.getElementById('system-edit-close');
        const saveBtn = document.getElementById('system-edit-save');

        if(openBtn){
          openBtn.addEventListener('click', function(){
            Promise.resolve()
              .then(() => ensureFkDataReady())
              .then(() => loadRowForEdit())
              .then(({ row, id }) => {
                if(!row || !id){
                  alert('편집할 데이터를 찾을 수 없습니다.\n리스트에서 항목을 선택 후 다시 시도해주세요.');
                  return;
                }
                currentRowForEdit = row;
                currentIdForEdit = id;
                fillEditForm(row);
                openModal(EDIT_MODAL_ID);
              })
              .catch(err => {
                console.error(err);
                alert((err && err.message) || '수정 모달을 열 수 없습니다.');
              });
          });
        }

        if(closeBtn){
          closeBtn.addEventListener('click', function(){ closeModal(EDIT_MODAL_ID); });
        }
        if(modal){
          modal.addEventListener('click', function(e){ if(e.target === modal) closeModal(EDIT_MODAL_ID); });
        }
        document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && modal && modal.classList.contains('show')) closeModal(EDIT_MODAL_ID); });

        if(saveBtn){
          saveBtn.addEventListener('click', function(){
          const form = document.getElementById(EDIT_FORM_ID);
          if(!form || !currentIdForEdit){
            return;
          }
          const formData = collectForm(form);
          const payload = buildAssetPayload(formData, currentRowForEdit);
          Promise.resolve()
            .then(() => apiUpdateAsset(currentIdForEdit, payload))
            .then(updated => {
              // PUT 응답이 UI에서 쓰는 "row" 스키마와 다를 수 있어,
              // 저장 후 다시 GET 해서 기본정보/헤더를 확실히 갱신한다.
              return Promise.resolve()
                .then(() => apiFetchAsset(currentIdForEdit))
                .then(fresh => fresh || updated)
                .catch(() => updated);
            })
            .then(row => {
              if(row){
                var normalized = null;
                try{ normalized = normalizeAssetRecordForBasicInfo(row, currentRowForEdit); }catch(_eNorm){}
                var viewRow = normalized || row;

                // If user cleared department fields (지움), reflect immediately in UI row.
                try{
                  if(formData && formData.sys_dept === ''){
                    viewRow.sys_dept = '-';
                    viewRow.system_dept_code = '';
                    // Clearing department implies owner is no longer valid.
                    viewRow.sys_owner = '-';
                    viewRow.system_owner_emp_no = '';
                  }
                }catch(_eClr0){}
                try{
                  if(formData && formData.svc_dept === ''){
                    viewRow.svc_dept = '-';
                    viewRow.service_dept_code = '';
                    viewRow.svc_owner = '-';
                    viewRow.service_owner_emp_no = '';
                  }
                }catch(_eClr1){}

                // Cascade rule: clearing center clears rack too.
                try{
                  if(formData && formData.location_place === ''){
                    viewRow.location_place = '-';
                    viewRow.center_code = '';
                    viewRow.location_pos = '-';
                    viewRow.rack_code = '';
                  } else if(formData && formData.location_pos === ''){
                    viewRow.location_pos = '-';
                    viewRow.rack_code = '';
                  }
                }catch(_eClrLoc){}

                // Security/basic fields: if user cleared them, reflect immediately in UI row.
                try{
                  if(formData){
                    if(formData.confidentiality === '') viewRow.confidentiality = '';
                    if(formData.integrity === '') viewRow.integrity = '';
                    if(formData.availability === '') viewRow.availability = '';
                    if(formData.security_score === '') viewRow.security_score = '';
                    if(formData.system_grade === '') viewRow.system_grade = '';
                    if(formData.core_flag === '') viewRow.core_flag = '';
                    if(formData.dr_built === '') viewRow.dr_built = '';
                    if(formData.svc_redundancy === '') viewRow.svc_redundancy = '';
                  }
                }catch(_eClrSec){}

                // Some APIs don't echo owner display strings on GET; ensure UI reflects what user chose.
                try{
                  var v = formData && formData.sys_owner_display != null ? String(formData.sys_owner_display).trim() : '';
                  if(v && v !== '부서를 먼저 선택' && v !== '담당자 선택' && v !== '선택' && formData && formData.sys_dept !== ''){
                    viewRow.sys_owner = v;
                  }
                }catch(_eOw0){}
                try{
                  var v2 = formData && formData.svc_owner_display != null ? String(formData.svc_owner_display).trim() : '';
                  if(v2 && v2 !== '부서를 먼저 선택' && v2 !== '담당자 선택' && v2 !== '선택' && formData && formData.svc_dept !== ''){
                    viewRow.svc_owner = v2;
                  }
                }catch(_eOw1){}

                try{ sessionStorage.setItem('onpremise:selected:row', JSON.stringify(viewRow)); }catch(_e0){}
                try{ localStorage.setItem('onpremise:selected:row', JSON.stringify(viewRow)); }catch(_e1){}
                try{ sessionStorage.setItem('onpremise:selected:asset_id', String(currentIdForEdit)); }catch(_e2){}
                try{ localStorage.setItem('onpremise:selected:asset_id', String(currentIdForEdit)); }catch(_e3){}
                try{ localStorage.setItem('onpremise:last_selected_asset_id', String(currentIdForEdit)); }catch(_e4){}
                // Persist key fields for cross-tab usage (hardware tab system row)
                try{
                  localStorage.setItem('onpremise:current:model',  String(viewRow.server_model_name || viewRow.model || ''));
                  localStorage.setItem('onpremise:current:vendor', String(viewRow.manufacturer_name || viewRow.vendor || ''));
                  localStorage.setItem('onpremise:current:serial', String(viewRow.serial || viewRow.serial_number || ''));
                  localStorage.setItem('onpremise:current:fw',     String(viewRow.fw || viewRow.firmware || ''));
                }catch(_eCache){}
                try{ if(viewRow.work_name) sessionStorage.setItem('onpremise:selected:work_name', String(viewRow.work_name)); }catch(_e5){}
                try{ if(viewRow.system_name) sessionStorage.setItem('onpremise:selected:system_name', String(viewRow.system_name)); }catch(_e6){}
                updateDetailHeaderAndCards(viewRow);
                currentRowForEdit = viewRow;
              }
              closeModal(EDIT_MODAL_ID);
            })
            .catch(err => {
              console.error(err);
              alert((err && err.message) || '수정 저장에 실패했습니다.');
            });
          });
        }
      }

      try{
        if(document.readyState === 'loading'){
          document.addEventListener('DOMContentLoaded', wireModalEvents, { once: true });
        }else{
          wireModalEvents();
        }
      }catch(_eWire){
        try{ wireModalEvents(); }catch(_eWire2){}
      }
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
      ['lg-page-size','hw-page-size','sw-page-size','bk-page-size','if-page-size','am-page-size','au-page-size','ac-page-size','fw-page-size','st-page-size','tk-page-size','vl-page-size','pk-page-size','mt-page-size']
        .forEach(wireChosen);
    })();
    // (detail-only modal renderer removed; detail now reuses list-style pipeline)

    // Tab behaviors moved to /static/js/_detail/tabXX-*.js

  // No modal APIs to expose
})();

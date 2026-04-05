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
  document.addEventListener('DOMContentLoaded', function(){
    // If the page was opened without list context (e.g., direct URL / new tab), redirect to list.
    (function ensureDetailContextOrRedirect(){
      function parseRowAssetId(raw){
        try{
          if(!raw) return null;
          var row = JSON.parse(raw);
          var id = row && (row.hardware_id != null ? row.hardware_id : (row.asset_id != null ? row.asset_id : row.id));
          var n = parseInt(id, 10);
          return (!isNaN(n) && n > 0) ? n : null;
        }catch(_e){ return null; }
      }
      function getStoredAssetId(){
        try{
          var v = sessionStorage.getItem('storage_backup:selected:asset_id') || localStorage.getItem('storage_backup:selected:asset_id');
          var n = parseInt(v, 10);
          return (!isNaN(n) && n > 0) ? n : null;
        }catch(_e){ return null; }
      }
      function saveStoredAssetId(n){
        try{ sessionStorage.setItem('storage_backup:selected:asset_id', String(n)); }catch(_e){}
        try{ localStorage.setItem('storage_backup:selected:asset_id', String(n)); }catch(_e2){}
      }

      function clearStoredSelection(){
        try{
          var keys = [
            'storage_backup:selected:asset_id',
            'storage_backup:selected:row',
            'storage_backup:selected:work_name',
            'storage_backup:selected:system_name'
          ];
          keys.forEach(function(k){
            try{ sessionStorage.removeItem(k); }catch(_e){}
            try{ localStorage.removeItem(k); }catch(_e2){}
          });
        }catch(_e3){}
      }

      var params = new URLSearchParams(window.location.search || '');
      // Backward-compat: if old URLs still contain asset_id, persist it.
      try{
        // IMPORTANT: Do not treat generic `id` query param as asset_id (it may belong to a different module).
        var legacyAssetId = params.get('hardware_id') || params.get('hardwareId') || params.get('asset_id') || params.get('assetId');
        var legacyN = parseInt(legacyAssetId, 10);
        if(!isNaN(legacyN) && legacyN > 0){ saveStoredAssetId(legacyN); }
      }catch(_e3){}

      var assetId = getStoredAssetId();
      if(!assetId){
        try{
          var raw = sessionStorage.getItem('storage_backup:selected:row') || localStorage.getItem('storage_backup:selected:row');
          assetId = parseRowAssetId(raw);
        }catch(_e4){}
      }
      if(assetId){
        saveStoredAssetId(assetId);
        return;
      }
      // No valid context -> clear any stale selection and go back to list.
      clearStoredSelection();
      try{ window.location.href = '/p/hw_storage_backup'; }catch(_e5){}
    })();

    // ----- Storage Backup asset: server-backed READ/UPDATE (basic info + edit modal) -----
    function sbGetCurrentAssetId(){
      // Prefer stored selection first (query params can be stale / cross-module).
      try{
        var v = sessionStorage.getItem('storage_backup:selected:asset_id') || localStorage.getItem('storage_backup:selected:asset_id');
        var n2 = parseInt(v, 10);
        if(!isNaN(n2) && n2 > 0) return n2;
      }catch(_e2){ }

      // Fallback: explicit asset identifiers from querystring.
      try{
        var params = new URLSearchParams(window.location.search || '');
        var q = params.get('hardware_id') || params.get('hardwareId') || params.get('asset_id') || params.get('assetId');
        var n = parseInt(q, 10);
        if(!isNaN(n) && n > 0) return n;
      }catch(_e){ }

      // Last resort: accept generic `id` only when nothing else is present.
      try{
        var params2 = new URLSearchParams(window.location.search || '');
        var q2 = params2.get('id');
        var n3 = parseInt(q2, 10);
        if(!isNaN(n3) && n3 > 0) return n3;
      }catch(_e3){ }
      return null;
    }

    function sbFetchJSON(url, options){
      options = options || {};
      options.headers = options.headers || {};
      if(!options.headers['Accept']) options.headers['Accept'] = 'application/json';
      return fetch(url, options).then(function(res){
        return res.text().then(function(txt){
          var data = null;
          try{ data = txt ? JSON.parse(txt) : null; }catch(_e){ data = null; }
          if(!res.ok){
            var msg = (data && (data.message || data.error)) ? (data.message || data.error) : ('HTTP ' + res.status);
            var err = new Error(msg);
            err.status = res.status;
            err.body = data;
            throw err;
          }
          return data;
        });
      });
    }

    function sbNormalizeItemToSelectedRow(item){
      // Normalize API item (codes + names) into the fields used by the detail modal.
      item = item || {};
      function yn(flag){ return flag ? 'O' : 'X'; }
      return {
        id: item.id,
        asset_id: item.id,
        // Canonical API: work_type_code = 업무 분류, work_category_code = 업무 구분
        work_type: item.work_type_code || item.work_type || item.work_category_code || '',
        work_category: item.work_category_code || item.work_category || item.work_division_code || '',
        work_status: item.work_status_code || '',
        work_operation: item.work_operation_code || '',
        work_group: item.work_group_code || '',
        work_name: item.work_name || '',
        system_name: item.system_name || '',
        system_ip: item.system_ip || '',
        manage_ip: item.mgmt_ip || '',
        vendor: item.manufacturer_code || '',
        // Prefer display model name so HW tab "모델명" matches basic-info.
        model: item.server_model_name || item.model || item.server_code || '',
        serial: item.serial_number || item.serial || '',
        virtualization: item.virtualization_type || '',
        location_place: item.center_code || '',
        location_pos: item.rack_code || '',
        slot: (item.slot != null ? item.slot : item.system_slot) || '',
        u_size: (item.u_size != null ? item.u_size : item.system_size) || '',
        rack_face: item.rack_face || 'FRONT',
        sys_dept: item.system_dept_code || '',
        sys_owner: item.system_owner_emp_no || '',
        svc_dept: item.service_dept_code || '',
        svc_owner: item.service_owner_emp_no || '',
        confidentiality: (item.cia_confidentiality != null ? String(item.cia_confidentiality) : ''),
        integrity: (item.cia_integrity != null ? String(item.cia_integrity) : ''),
        availability: (item.cia_availability != null ? String(item.cia_availability) : ''),
        security_score: (item.security_score != null ? String(item.security_score) : ''),
        system_grade: item.system_grade || '',
        core_flag: (item.is_core_system != null ? (item.is_core_system ? '핵심' : '일반') : (item.core_flag || '')),
        dr_built: (item.has_dr_site != null ? yn(!!item.has_dr_site) : (item.dr_built || '')),
        svc_redundancy: (item.has_service_ha != null ? yn(!!item.has_service_ha) : (item.svc_redundancy || ''))
      };
    }

    function sbSetText(sel, val){
      var el = document.querySelector(sel);
      if(el) el.textContent = (val == null || String(val).trim()==='' ? '-' : String(val));
    }
    function sbSetBadge(sel, val){ sbSetText(sel, val); }
    function sbSetNumBadge(sel, val){
      var badge = document.querySelector(sel);
      if(!badge) return;
      var s = (val == null || String(val).trim()==='' ? '-' : String(val));
      badge.textContent = s;
      var n = parseInt(val, 10);
      badge.classList.remove('tone-1','tone-2','tone-3');
      if(!isNaN(n)) badge.classList.add(n>=3?'tone-3':(n===2?'tone-2':'tone-1'));
    }
    function sbSetOX(rowSel, val){
      var el = document.querySelector(rowSel + ' .ox-badge');
      if(!el) return;
      var t = (val === 'X' ? 'X' : 'O');
      if(val == null || String(val).trim()==='' || val === '-') t = '-';
      el.textContent = t;
      el.classList.remove('on','off');
      if(t==='O') el.classList.add('on');
      if(t==='X') el.classList.add('off');
      el.setAttribute('aria-label', t);
    }

    function sbRefreshHwSystemRow(){
      try{
        if(window.BlossomTab01Hardware && typeof window.BlossomTab01Hardware.refreshSystemRow === 'function'){
          window.BlossomTab01Hardware.refreshSystemRow();
        }
      }catch(_e){ }
    }

    function sbApplyAssetToBasicInfo(item){
      item = item || {};
      // header
      try{
        var headerTitle = document.getElementById('detail-title') || document.querySelector('.page-header h1');
        var headerSubtitle = document.getElementById('detail-subtitle') || document.querySelector('.page-header p');
        if(headerTitle) headerTitle.textContent = String(item.work_name || '-');
        if(headerSubtitle) headerSubtitle.textContent = String(item.system_name || '-');
      }catch(_e){ }

      // business
      (function applyWorkStatusPill(){
        var pill = document.querySelector('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill');
        if(!pill) return;
        var textEl = pill.querySelector('.status-text');
        var dotEl = pill.querySelector('.status-dot');
        var label = (item.work_status_name || item.work_status || '-');
        if(textEl) textEl.textContent = String(label || '-');

        // Reset classes/styles
        try{ pill.classList.remove('colored'); pill.removeAttribute('style'); }catch(_e){}
        if(dotEl){
          try{ dotEl.classList.remove('ws-run','ws-idle','ws-wait'); }catch(_e2){}
        }

        // Prefer API-provided color when available
        var customColor = item.work_status_color;
        if(customColor && pill){
          try{
            pill.classList.add('colored');
            // Best-effort: approximate list page variables
            pill.style.setProperty('--status-dot-color', String(customColor));
            // Optional: set background/border if it's a hex color
            var hex = String(customColor).trim();
            var m = hex.match(/^#?([0-9a-fA-F]{6})$/);
            if(m){
              var h = m[1];
              var r = parseInt(h.slice(0,2),16);
              var g = parseInt(h.slice(2,4),16);
              var b = parseInt(h.slice(4,6),16);
              if(!isNaN(r) && !isNaN(g) && !isNaN(b)){
                pill.style.setProperty('--status-bg-color', 'rgba(' + r + ',' + g + ',' + b + ',0.16)');
                pill.style.setProperty('--status-border-color', 'rgba(' + r + ',' + g + ',' + b + ',0.45)');
              }
            }
          }catch(_e3){}
          return;
        }

        // Fallback: map by label
        var v = String(label || '').trim();
        var cls = 'ws-wait';
        if(v === '가동') cls = 'ws-run';
        else if(v === '유휴') cls = 'ws-idle';
        if(dotEl) dotEl.classList.add(cls);
      })();
      sbSetBadge('.basic-info-card:nth-child(1) .info-row:nth-child(2) .info-value', item.work_category_name || item.work_type_name || item.work_type || '-');
      sbSetBadge('.basic-info-card:nth-child(1) .info-row:nth-child(3) .info-value', item.work_division_name || item.work_category_name || item.work_category || '-');
      sbSetText('.basic-info-card:nth-child(1) .info-row:nth-child(4) .info-value', item.work_operation_name || item.work_operation || '-');
      sbSetBadge('.basic-info-card:nth-child(1) .info-row:nth-child(5) .info-value', item.work_group_name || item.work_group || '-');
      sbSetText('.basic-info-card:nth-child(1) .info-row:nth-child(6) .info-value', item.work_name || '-');
      sbSetText('.basic-info-card:nth-child(1) .info-row:nth-child(7) .info-value', item.system_name || '-');
      sbSetText('.basic-info-card:nth-child(1) .info-row:nth-child(8) .info-value', item.system_ip || '-');
      sbSetText('.basic-info-card:nth-child(1) .info-row:nth-child(9) .info-value', item.mgmt_ip || item.manage_ip || '-');

      // system
      sbSetBadge('.basic-info-card:nth-child(2) .info-row:nth-child(1) .info-value', item.manufacturer_name || item.vendor || '-');
      sbSetBadge('.basic-info-card:nth-child(2) .info-row:nth-child(2) .info-value', item.server_model_name || item.model || '-');
      sbSetText('.basic-info-card:nth-child(2) .info-row:nth-child(3) .info-value', item.serial_number || item.serial || '-');
      sbSetBadge('.basic-info-card:nth-child(2) .info-row:nth-child(4) .info-value', item.virtualization_type || item.virtualization || '-');
      sbSetBadge('.basic-info-card:nth-child(2) .info-row:nth-child(5) .info-value', item.center_name || item.location_place || '-');
      sbSetBadge('.basic-info-card:nth-child(2) .info-row:nth-child(6) .info-value', item.rack_name || item.location_pos || '-');
      sbSetText('.basic-info-card:nth-child(2) .info-row:nth-child(7) .info-value', (item.system_slot != null ? item.system_slot : item.slot) || '-');
      sbSetText('.basic-info-card:nth-child(2) .info-row:nth-child(8) .info-value', (item.system_size != null ? item.system_size : item.u_size) || '-');
      sbSetText('.basic-info-card:nth-child(2) .info-row:nth-child(9) .info-value', (item.rack_face === 'REAR') ? '후면' : '전면');

      // owners
      sbSetBadge('.basic-info-card:nth-child(3) .info-row:nth-child(1) .info-value', item.system_dept_name || item.sys_dept || '-');
      sbSetBadge('.basic-info-card:nth-child(3) .info-row:nth-child(2) .info-value', item.system_owner_name || item.sys_owner || '-');
      sbSetBadge('.basic-info-card:nth-child(3) .info-row:nth-child(3) .info-value', item.service_dept_name || item.svc_dept || '-');
      sbSetBadge('.basic-info-card:nth-child(3) .info-row:nth-child(4) .info-value', item.service_owner_name || item.svc_owner || '-');

      // security / cia
      sbSetNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(1) .num-badge', item.cia_confidentiality);
      sbSetNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(2) .num-badge', item.cia_integrity);
      sbSetNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(3) .num-badge', item.cia_availability);
      sbSetNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(4) .num-badge', item.security_score);
      sbSetText('.basic-info-card:nth-child(4) .info-row:nth-child(5) .info-value', item.system_grade || '-');
      sbSetText('.basic-info-card:nth-child(4) .info-row:nth-child(6) .info-value', (item.is_core_system != null ? (item.is_core_system ? '핵심' : '일반') : (item.core_flag || '-')));
      sbSetOX('.basic-info-card:nth-child(4) .info-row:nth-child(7)', (item.has_dr_site != null ? (item.has_dr_site ? 'O' : 'X') : (item.dr_built || '-')));
      sbSetOX('.basic-info-card:nth-child(4) .info-row:nth-child(8)', (item.has_service_ha != null ? (item.has_service_ha ? 'O' : 'X') : (item.svc_redundancy || '-')));

      // keep localStorage keys in sync for other tabs
      try{
        // Use storage_backup-scoped keys to avoid cross-page contamination.
        localStorage.setItem('storage_backup:current:vendor', String(item.manufacturer_name || ''));
        localStorage.setItem('storage_backup:current:model',  String(item.server_model_name || item.model || item.server_code || ''));
        localStorage.setItem('storage_backup:current:serial', String(item.serial_number || ''));
        localStorage.setItem('storage_backup:current:fw',     String(item.firmware || item.fw || ''));
        localStorage.setItem('storage_backup:current:slot',   String((item.system_slot != null ? item.system_slot : '') || ''));
        localStorage.setItem('storage_backup:current:u_size', String((item.system_size != null ? item.system_size : '') || ''));
        localStorage.setItem('storage_backup:current:rack_face', String((item.rack_face) || ''));
      }catch(_e2){ }

      // If HW tab already rendered, refresh the "시스템" row immediately.
      sbRefreshHwSystemRow();
    }

    function sbPersistSelectionFromItem(item){
      item = item || {};
      try{
        if(item.id != null){
          sessionStorage.setItem('storage_backup:selected:asset_id', String(item.id));
          try{ localStorage.setItem('storage_backup:selected:asset_id', String(item.id)); }catch(_e2){}
        }
        if(item.work_name != null) sessionStorage.setItem('storage_backup:selected:work_name', String(item.work_name));
        if(item.system_name != null) sessionStorage.setItem('storage_backup:selected:system_name', String(item.system_name));
      }catch(_e3){ }
      // Keep a normalized selected row for edit modal defaults.
      try{
        var norm = sbNormalizeItemToSelectedRow(item);
        // Preferred key for this module
        sessionStorage.setItem('storage_backup:selected:row', JSON.stringify(norm));
        try{ localStorage.setItem('storage_backup:selected:row', JSON.stringify(norm)); }catch(_e4){}
        // Legacy key kept for older pages/scripts
        try{ sessionStorage.setItem('ptl:selected:row', JSON.stringify(norm)); }catch(_e5){}
        try{ localStorage.setItem('ptl:selected:row', JSON.stringify(norm)); }catch(_e6){}

        // Also persist the HW-tab system row cache.
        try{
          localStorage.setItem('storage_backup:current:vendor', String(item.manufacturer_name || ''));
          localStorage.setItem('storage_backup:current:model', String(item.server_model_name || item.model || item.server_code || ''));
          localStorage.setItem('storage_backup:current:serial', String(item.serial_number || ''));
          localStorage.setItem('storage_backup:current:fw', String(item.firmware || item.fw || ''));
        }catch(_e7){ }

        // If HW tab already rendered, refresh the "시스템" row immediately.
        sbRefreshHwSystemRow();
      }catch(_e5){ }
    }

    function sbBuildUpdatePayloadFromForm(form){
      var payload = { asset_category: 'STORAGE', asset_type: 'BACKUP' };
      if(!form) return payload;
      function getEl(name){ return form.querySelector('[name="'+name+'"]'); }
      function get(name){ var el = getEl(name); return el ? String(el.value || '').trim() : ''; }
      function norm(v){ var s=(v==null?'':String(v)).trim(); return (s==='-'?'':s); }
      function wasUserCleared(name){
        try{
          var el = getEl(name);
          return !!(el && el.dataset && el.dataset.userCleared === '1');
        }catch(_e){ return false; }
      }
      function getInitial(name){
        try{
          var raw = (form.dataset && form.dataset._initialValues) ? form.dataset._initialValues : '';
          if(!raw) return '';
          var obj = JSON.parse(raw);
          return norm(obj && obj[name]);
        }catch(_e){ return ''; }
      }
      function maybe(name, key){ var v = norm(get(name)); if(v!=='') payload[key] = v; }
      function maybeNullable(name, key){
        var current = norm(get(name));
        var initial = getInitial(name);
        if(current !== ''){ payload[key] = current; return; }
        if(initial !== '' || wasUserCleared(name)) payload[key] = null;
      }
      function maybeInt(name, key){
        var v = get(name);
        if(v==='' || v==='-') return;
        var n = parseInt(v, 10);
        if(!isNaN(n)) payload[key] = n;
      }
      function maybeIntNullable(name, key){
        var current = norm(get(name));
        var initial = getInitial(name);
        if(current !== ''){
          var n = parseInt(current, 10);
          if(!isNaN(n)) payload[key] = n;
          return;
        }
        if(initial !== '' || wasUserCleared(name)) payload[key] = null;
      }

      function maybeFlagNullable(name, canonicalKey, onValue){
        var current = norm(get(name));
        var initial = getInitial(name);
        var onToken = (onValue == null ? '' : String(onValue)).trim().toUpperCase();
        if(current !== ''){
          var token = String(current).trim().toUpperCase();
          payload[canonicalKey] = (token === onToken) ? 1 : 0;
          return;
        }
        if(initial !== '' || wasUserCleared(name)) payload[canonicalKey] = null;
      }
      maybe('work_type','work_type');
      maybe('work_category','work_category');
      maybe('work_status','work_status');
      maybe('work_operation','work_operation');
      maybe('work_group','work_group');
      maybe('work_name','work_name');
      maybe('system_name','system_name');
      maybe('system_ip','system_ip');
      maybe('manage_ip','mgmt_ip');
      // Persist clears ("지움") for FK pairs by sending explicit nulls.
      maybeNullable('vendor','vendor');
      maybeNullable('model','model');
      maybe('serial','serial');
      maybe('virtualization','virtualization_type');
      maybeNullable('location_place','center_code');
      maybeNullable('location_pos','rack_code');
      maybeIntNullable('slot','system_slot');
      maybeIntNullable('u_size','system_size');
      // rack_face is sent as-is (text: FRONT/REAR)
      maybeNullable('sys_dept','system_department');
      // IMPORTANT: backend owner normalizer strips alias keys (system_owner/service_owner).
      // Use canonical emp_no columns so the value is actually saved.
      maybeNullable('sys_owner','system_owner_emp_no');
      maybeNullable('svc_dept','service_department');
      maybeNullable('svc_owner','service_owner_emp_no');

      // "점검" 영역: empty 선택/지움도 DB에 반영되도록 nullable로 전송
      maybeIntNullable('confidentiality','cia_confidentiality');
      maybeIntNullable('integrity','cia_integrity');
      maybeIntNullable('availability','cia_availability');
      // security_score is auto-sum; allow null when CIA is cleared
      maybeIntNullable('security_score','security_score');
      maybeNullable('system_grade','system_grade');

      // IMPORTANT: backend derives booleans from core_flag/dr_built/svc_redundancy.
      // If we send those keys as null/empty, backend would coerce to 0.
      // Send canonical nullable columns instead.
      maybeFlagNullable('core_flag','is_core_system','핵심');
      maybeFlagNullable('dr_built','has_dr_site','O');
      maybeFlagNullable('svc_redundancy','has_service_ha','O');
      return payload;
    }

    function sbLoadAssetAndRender(){
      var assetId = sbGetCurrentAssetId();
      if(!assetId) return;
      sbFetchJSON('/api/hardware/storage/backup/assets/' + encodeURIComponent(String(assetId)), { method:'GET' })
        .then(function(data){
          if(!data || !data.success || !data.item) return;
          sbApplyAssetToBasicInfo(data.item);
          sbPersistSelectionFromItem(data.item);
        })
        .catch(function(err){
          // If API fails, keep whatever list-provided context exists.
          try{ console.warn('[backup_detail] failed to load asset', err); }catch(_e){}
          // If the selected id is stale (404), clear selection and go back to list.
          try{
            if(err && err.status === 404){
              try{ sessionStorage.removeItem('storage_backup:selected:asset_id'); }catch(_e1){}
              try{ localStorage.removeItem('storage_backup:selected:asset_id'); }catch(_e2){}
              try{ sessionStorage.removeItem('storage_backup:selected:row'); }catch(_e3){}
              try{ localStorage.removeItem('storage_backup:selected:row'); }catch(_e4){}
              try{ window.location.href = '/p/hw_storage_backup'; }catch(_e5){}
            }
          }catch(_e6){}
        });
    }

    // Ensure basic info is not stuck at '-' when opened directly or refreshed.
    sbLoadAssetAndRender();

    // Initialize page header from list selection (query or storage)
    (function(){
      try{
        var params = new URLSearchParams(window.location.search || '');

        // Prefer storage over querystring.
        var work = null;
        var system = null;
        try{ work = sessionStorage.getItem('storage_backup:selected:work_name'); }catch(_e){ work = null; }
        try{ system = sessionStorage.getItem('storage_backup:selected:system_name'); }catch(_e2){ system = null; }

        // Backward-compat: if old URLs still contain work/system, persist them.
        if(!work) work = params.get('work');
        if(!system) system = params.get('system');
        if(work != null || system != null){
          try{
            if(work != null) sessionStorage.setItem('storage_backup:selected:work_name', String(work));
            if(system != null) sessionStorage.setItem('storage_backup:selected:system_name', String(system));
          }catch(_storeErr){ /* ignore quota */ }
        }

        var headerTitle = document.getElementById('detail-title') || document.querySelector('.page-header h1');
        var headerSubtitle = document.getElementById('detail-subtitle') || document.querySelector('.page-header p');
        if(headerTitle) headerTitle.textContent = String(work || '-');
        if(headerSubtitle) headerSubtitle.textContent = String(system || '-');

        // Remove query params from address bar (do not expose identifiers).
        try{
          var changed = false;
          ['work','system','id','asset_id','assetId'].forEach(function(k){
            if(params.has(k)){
              params.delete(k);
              changed = true;
            }
          });
          if(changed){
            var base = window.location.pathname;
            var qs = params.toString();
            var next = base + (qs ? ('?' + qs) : '') + (window.location.hash || '');
            window.history.replaceState(null, document.title, next);
          }
        }catch(_e4){ /* ignore */ }
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
    function buildEditFormFromPage(){
      var form = document.getElementById(EDIT_FORM_ID); if(!form) return;
      function text(sel){ var el=document.querySelector(sel); return (el? el.textContent.trim() : ''); }
      function badgeVal(sel){ var el=document.querySelector(sel); return (el? el.textContent.trim() : ''); }
      function cia(sel){ var el=document.querySelector(sel); return (el? el.textContent.trim() : ''); }
      var selectedRowData = null;
      try{
        var storagePrefix = (typeof STORAGE_PREFIX !== 'undefined' && STORAGE_PREFIX) ? STORAGE_PREFIX : 'ptl';
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

      // Remember initial values so "지움" can clear DB values on save.
      try{ form.dataset._initialValues = JSON.stringify(data || {}); }catch(_eInit){ }
      var GROUPS = [
        { title:'비즈니스', cols:['work_type','work_category','work_status','work_operation','work_group','work_name','system_name','system_ip','manage_ip'] },
        { title:'시스템', cols:['vendor','model','serial','virtualization','location_place','location_pos','slot','u_size','rack_face'] },
        { title:'담당자', cols:['sys_dept','sys_owner','svc_dept','svc_owner'] },
        { title:'점검', cols:['confidentiality','integrity','availability','security_score','system_grade','core_flag','dr_built','svc_redundancy'] }
      ];

      function normalizeFormValue(v){
        var s = (v == null ? '' : String(v)).trim();
        return (s === '-' ? '' : s);
      }

      function fieldInput(col, value){
        value = normalizeFormValue(value);
        var opts={
          virtualization:['','물리','가상'],
          confidentiality:['','1','2','3'], integrity:['','1','2','3'], availability:['','1','2','3'],
          system_grade:['','1등급','2등급','3등급'], core_flag:['','핵심','일반'], dr_built:['','O','X'], svc_redundancy:['','O','X']
        };
        if(col==='security_score') return '<input name="security_score" class="form-input" type="number" readonly placeholder="자동 합계" value="'+(value||'')+'">';
        // NOTE: fk_select.js intentionally does NOT auto-convert model inputs to selects on hardware pages
        // unless explicitly allowed. Opt-in here so "시스템 모델명" becomes a searchable dropdown.
        if(col==='model') return '<input name="model" class="form-input" data-fk-allow="1" placeholder="검색 선택" value="'+(value||'')+'">';
        if(opts[col]){
          var extraCls = ['confidentiality','integrity','availability'].indexOf(col)>-1 ? 'score-trigger' : '';
          return '<select name="'+col+'" class="form-input search-select '+extraCls+'" data-searchable="true" data-placeholder="선택">'+
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

      // Enhance FK selects (vendor/model/place/pos/dept/owner/etc.) inside this modal.
      // This provides the "검색+드롭박스" UI + the built-in "지움" button.
      try{
        var modalRoot = document.getElementById(EDIT_MODAL_ID);
        if(window.BlossomFkSelect && typeof window.BlossomFkSelect.enhance==='function' && modalRoot){
          window.BlossomFkSelect.enhance(modalRoot);
        }
        if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance==='function' && modalRoot){
          window.BlossomSearchableSelect.enhance(modalRoot);
        }
      }catch(_e){ }

      attachSecurityScoreRecalc(EDIT_FORM_ID);
      attachVirtualizationHandler(EDIT_FORM_ID);

      // When a parent is cleared ("지움"), clear + disable its dependent field.
      // - vendor -> model
      // - location_place -> location_pos
      // - sys_dept -> sys_owner
      // - svc_dept -> svc_owner
      wireModalDependentClearDisable(form);
    }

    function wireModalDependentClearDisable(form){
      if(!form || form.dataset._depClearWired==='1') return;
      form.dataset._depClearWired='1';

      function norm(v){ return (v == null ? '' : String(v)).trim(); }
      function isEmpty(v){ return norm(v) === ''; }

      function get(name){
        try{ return form.querySelector('[name="'+CSS.escape(name)+'"]'); }catch(_){ return form.querySelector('[name="'+name+'"]'); }
      }

      function clearAndDisable(name){
        var el = get(name); if(!el) return;
        try{ el.value=''; }catch(_e){ }
        try{ if(el.dataset) el.dataset.userCleared = '1'; }catch(_e0){}
        el.disabled = true;
        try{ el.dispatchEvent(new Event('change', { bubbles:true })); }catch(_e2){ }
        // Keep searchable UI display text in sync even if disabled.
        try{ if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function') window.BlossomSearchableSelect.syncAll(el); }catch(_e3){ }
      }

      function enable(name){
        var el = get(name); if(!el) return;
        el.disabled = false;
        try{ el.dispatchEvent(new Event('change', { bubbles:true })); }catch(_e2){ }
        try{ if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function') window.BlossomSearchableSelect.syncAll(el); }catch(_e3){ }
      }

      function applyPair(parentName, childName){
        var parent = get(parentName);
        if(!parent) return;
        function sync(){
          if(isEmpty(parent.value)){
            clearAndDisable(childName);
          } else {
            enable(childName);
          }
        }
        parent.addEventListener('change', sync);
        sync();
      }

      applyPair('vendor','model');
      applyPair('location_place','location_pos');
      applyPair('sys_dept','sys_owner');
      applyPair('svc_dept','svc_owner');
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
  function setText(sel, val){ var el=document.querySelector(sel); if(el) el.textContent = String(val||''); }
      function setBadge(sel, val){ var el=document.querySelector(sel); if(el) el.textContent = String(val||''); }
      var v = function(name){ var el=form.querySelector('[name="'+name+'"]'); return el? el.value : ''; };
        setText('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill .status-text', v('work_status'));
      try {
        var pill=document.querySelector('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill');
        if(pill){
          var dot=pill.querySelector('.status-dot');
          var lbl=v('work_status');
          var cls=(lbl==='가동'?'ws-run': (lbl==='유휴'?'ws-idle':'ws-wait'));
          if(dot){ dot.classList.remove('ws-run','ws-idle','ws-wait'); dot.classList.add(cls); }
        }
      }catch(_e){}
      setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(2) .info-value', v('work_type'));
      setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(3) .info-value', v('work_category'));
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(4) .info-value', v('work_operation'));
      setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(5) .info-value', v('work_group'));
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(6) .info-value', v('work_name'));
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(7) .info-value', v('system_name'));
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(8) .info-value', v('system_ip'));
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(9) .info-value', v('manage_ip'));
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(1) .info-value', v('vendor'));
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(2) .info-value', v('model'));
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(3) .info-value', v('serial'));
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(4) .info-value', v('virtualization'));
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(5) .info-value', v('location_place'));
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(6) .info-value', v('location_pos'));
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(7) .info-value', v('slot'));
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(8) .info-value', v('u_size'));
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(1) .info-value', v('sys_dept'));
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(2) .info-value', v('sys_owner'));
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(3) .info-value', v('svc_dept'));
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(4) .info-value', v('svc_owner'));
      function setNumBadge(sel, num){ var badge=document.querySelector(sel); if(badge){ badge.textContent = String(num||''); var badgeWrap=badge; var n=parseInt(num,10); badgeWrap.classList.remove('tone-1','tone-2','tone-3'); if(!isNaN(n)){ badgeWrap.classList.add(n>=3?'tone-3':(n===2?'tone-2':'tone-1')); } } }
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(1) .num-badge', v('confidentiality'));
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(2) .num-badge', v('integrity'));
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(3) .num-badge', v('availability'));
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(4) .num-badge', v('security_score'));
      setText('.basic-info-card:nth-child(4) .info-row:nth-child(5) .info-value', v('system_grade'));
      setText('.basic-info-card:nth-child(4) .info-row:nth-child(6) .info-value', v('core_flag'));
      function setOX(rowSel, name){ var el=document.querySelector(rowSel+' .ox-badge'); if(!el) return; var val=v(name); el.textContent=(val==='X'?'X':'O'); el.classList.remove('on','off'); el.classList.add(val==='O'?'on':'off'); }
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
        // Use module-specific keys to avoid cross-page contamination
        localStorage.setItem('storage_backup:current:vendor', String(vendorVal||''));
        localStorage.setItem('storage_backup:current:model',  String(modelVal||''));
        localStorage.setItem('storage_backup:current:serial', String(serialVal||''));
        localStorage.setItem('storage_backup:current:slot',   String(slotVal||''));
        localStorage.setItem('storage_backup:current:u_size', String(uSizeVal||''));
      }catch(_){ }

      // Update HW tab system row if present.
      sbRefreshHwSystemRow();
    }
    // Wire the Basic Info edit modal open/close/save
    (function(){
      function openModalLocal(id){ var el=document.getElementById(id); if(!el) return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden','false'); }
      function closeModalLocal(id){ var el=document.getElementById(id); if(!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } }
      var openBtn = document.getElementById(EDIT_OPEN_ID);
      if(openBtn){ openBtn.addEventListener('click', function(){ buildEditFormFromPage(); openModalLocal(EDIT_MODAL_ID); }); }

      // If redirected from HW tab "시스템" row edit, open this modal automatically once.
      try{
        var flag = sessionStorage.getItem('storage_backup:open_basic_edit');
        if(flag === '1'){
          sessionStorage.removeItem('storage_backup:open_basic_edit');
          try{ buildEditFormFromPage(); }catch(_e0){}
          try{ openModalLocal(EDIT_MODAL_ID); }catch(_e1){}
        }
      }catch(_e2){}
      var closeBtn = document.getElementById(EDIT_CLOSE_ID);
      if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalLocal(EDIT_MODAL_ID); }); }
      var modalEl = document.getElementById(EDIT_MODAL_ID);
      if(modalEl){ modalEl.addEventListener('click', function(e){ if(e.target === modalEl) closeModalLocal(EDIT_MODAL_ID); }); document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(EDIT_MODAL_ID); }); }
      var saveBtn = document.getElementById(EDIT_SAVE_ID);
      if(saveBtn){
        saveBtn.addEventListener('click', function(){
          var assetId = sbGetCurrentAssetId();
          var form = document.getElementById(EDIT_FORM_ID);
          if(!assetId || !form){
            updatePageFromForm();
            closeModalLocal(EDIT_MODAL_ID);
            return;
          }
          // Persist to server first; on success render from returned item (labels not codes).
          try{ saveBtn.disabled = true; }catch(_e){}
          var payload = sbBuildUpdatePayloadFromForm(form);
          sbFetchJSON('/api/hardware/storage/backup/assets/' + encodeURIComponent(String(assetId)), {
            method:'PUT',
            headers:{ 'Content-Type':'application/json' },
            body: JSON.stringify(payload || {})
          }).then(function(data){
            if(data && data.success && data.item){
              sbApplyAssetToBasicInfo(data.item);
              sbPersistSelectionFromItem(data.item);
            } else {
              // Fallback: at least reflect the modal edits locally.
              updatePageFromForm();
            }
            closeModalLocal(EDIT_MODAL_ID);
          }).catch(function(err){
            try{
              alert((err && err.message) ? String(err.message) : '저장 중 오류가 발생했습니다.');
            }catch(_e2){}
          }).finally(function(){
            try{ saveBtn.disabled = false; }catch(_e3){}
          });
        });
      }
    })();

    // Tab-specific behaviors were split out into /static/js/_detail/*.js.
    // This file keeps only the shared Backup detail behaviors (context, header, basic-info read/update).

  });

  // No modal APIs to expose
})();


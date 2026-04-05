// san_storage_detail.js: SAN Storage detail page behaviors (modal removed)

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
          var id = row && (row.id != null ? row.id : row.asset_id);
          var n = parseInt(id, 10);
          return (!isNaN(n) && n > 0) ? n : null;
        }catch(_e){ return null; }
      }
      function getStoredAssetId(){
        try{
          var v = sessionStorage.getItem('storage_san:selected:asset_id') || localStorage.getItem('storage_san:selected:asset_id');
          var n = parseInt(v, 10);
          return (!isNaN(n) && n > 0) ? n : null;
        }catch(_e){ return null; }
      }
      function saveStoredAssetId(n){
        try{ sessionStorage.setItem('storage_san:selected:asset_id', String(n)); }catch(_e){}
        try{ localStorage.setItem('storage_san:selected:asset_id', String(n)); }catch(_e2){}
      }

      var assetId = getStoredAssetId();
      if(!assetId){
        // Try to infer from any stored selected row
        try{
          var raw1 = sessionStorage.getItem('san_storage:selected:row') || localStorage.getItem('san_storage:selected:row');
          assetId = parseRowAssetId(raw1);
        }catch(_e3){}
      }
      if(!assetId){
        try{
          var raw2 = sessionStorage.getItem('san:selected:row') || localStorage.getItem('san:selected:row');
          assetId = parseRowAssetId(raw2);
        }catch(_e4){}
      }
      if(assetId){
        saveStoredAssetId(assetId);
        return;
      }

      // No context available: go back to list (server detail style).
      try{ window.location.href = '/p/hw_storage_san'; }catch(_e5){}
    })();

    // Initialize page header from list selection (query or storage)
    try{
      var params = new URLSearchParams(window.location.search || '');

      // Backward-compat: if old URLs still contain identifiers, persist them, but do not keep them in the address bar.
      try{
        var legacyAssetId = params.get('asset_id') || params.get('assetId') || params.get('id');
        var legacyN = parseInt(legacyAssetId, 10);
        if(!isNaN(legacyN) && legacyN > 0){
          try{ sessionStorage.setItem('storage_san:selected:asset_id', String(legacyN)); }catch(_eA){}
          try{ localStorage.setItem('storage_san:selected:asset_id', String(legacyN)); }catch(_eB){}
        }
      }catch(_eC){}

      // Prefer storage (same-tab navigation) over querystring (which leaks via URL/logs).
      var work = null;
      var system = null;
      try{ work = sessionStorage.getItem('storage_san:selected:work_name'); }catch(_e){ work = null; }
      try{ system = sessionStorage.getItem('storage_san:selected:system_name'); }catch(_e2){ system = null; }

      // Fallback: if list only saved the selected row, infer work/system from it.
      if(!work || !system){
        try{
          var rawRow = sessionStorage.getItem('san_storage:selected:row') || localStorage.getItem('san_storage:selected:row') || sessionStorage.getItem('san:selected:row') || localStorage.getItem('san:selected:row');
          if(rawRow){
            var rowObj = JSON.parse(rawRow);
            if(!work && rowObj && rowObj.work_name != null) work = String(rowObj.work_name);
            if(!system && rowObj && rowObj.system_name != null) system = String(rowObj.system_name);
          }
        }catch(_eR){ /* ignore */ }
      }

      // Backward-compat: if old URLs still contain work/system, persist them, but do not keep them in the address bar.
      if(!work) work = params.get('work');
      if(!system) system = params.get('system');
      if(work != null || system != null){
        try{
          if(work != null) sessionStorage.setItem('storage_san:selected:work_name', String(work));
          if(system != null) sessionStorage.setItem('storage_san:selected:system_name', String(system));
        }catch(_e3){ /* ignore quota */ }
      }

      // Render header
      var titleText = String(work || '-');
      var subText = String(system || '-');
      // Generic selectors
      var headerTitle = document.querySelector('.page-header h1');
      var headerSubtitle = document.querySelector('.page-header p');
      if(headerTitle) headerTitle.textContent = titleText;
      if(headerSubtitle) headerSubtitle.textContent = subText;
      // Explicit IDs used by SAN templates / other detail templates
      try{
        var t1 = document.getElementById('detail-title'); if(t1) t1.textContent = titleText;
        var s1 = document.getElementById('detail-subtitle'); if(s1) s1.textContent = subText;
        var t2 = document.getElementById('page-title'); if(t2) t2.textContent = titleText;
        var s2 = document.getElementById('page-subtitle'); if(s2) s2.textContent = subText;
      }catch(_eT){ /* ignore */ }

      // Remove sensitive/noisy query params from the address bar (server detail style).
      try{
        var changed = false;
        ['work','system','asset_id','assetId','id'].forEach(function(k){
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
    }catch(_){ /* no-op */ }

    // Apply selected row (from list) to the "기본정보" cards.
    // The SAN detail templates share the same card structure/labels as onpremise.
    (function applySelectedRowToBasicInfo(){
      // Guard: only run on pages that actually have the 기본정보 card layout.
      var statusTextEl = document.querySelector('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill .status-text');
      if(!statusTextEl) return;

      function readSelectedRow(){
        var prefixes = [];
        try{
          var p = (typeof STORAGE_PREFIX !== 'undefined' && STORAGE_PREFIX) ? String(STORAGE_PREFIX) : 'san_storage';
          prefixes.push(p);
        }catch(_){ prefixes.push('san_storage'); }
        // Backward-compat fallbacks
        prefixes.push('san');

        for(var i=0;i<prefixes.length;i++){
          var key = prefixes[i] + ':selected:row';
          try{
            var raw = sessionStorage.getItem(key) || localStorage.getItem(key);
            if(!raw) continue;
            var row = JSON.parse(raw);
            if(row && typeof row === 'object') return row;
          }catch(_e){ /* continue */ }
        }
        return null;
      }

      function coerce(value){
        if(value === 0) return '0';
        if(value == null) return '';
        var v = String(value).trim();
        return v;
      }
      function setText(sel, value){
        var el = document.querySelector(sel);
        if(!el) return;
        var v = coerce(value);
        if(v === '') return;
        el.textContent = v;
      }
      function setBadge(sel, value){
        var el = document.querySelector(sel);
        if(!el) return;
        var v = coerce(value);
        if(v === '') return;
        el.textContent = v;
      }

      function setStatus(value){
        var v = coerce(value);
        if(v === '') return;
        setText('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill .status-text', v);
        try{
          var pill = document.querySelector('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill');
          if(!pill) return;
          var dot = pill.querySelector('.status-dot');
          if(!dot) return;
          var cls = (v === '가동') ? 'ws-run' : ((v === '유휴') ? 'ws-idle' : 'ws-wait');
          dot.classList.remove('ws-run','ws-idle','ws-wait');
          dot.classList.add(cls);
        }catch(_e){ }
      }

      function setNumBadge(sel, labelKey, value){
        var el = document.querySelector(sel);
        if(!el) return;
        var v = coerce(value);
        if(v === '') return;
        el.textContent = v;
        el.classList.remove('tone-1','tone-2','tone-3');
        var n = parseInt(v, 10);
        if(isNaN(n)) return;
        // Match onpremise behavior: CIA (1/2/3), security_score (>=6/8)
        if(labelKey === 'security_score') el.classList.add(n >= 8 ? 'tone-3' : (n >= 6 ? 'tone-2' : 'tone-1'));
        else el.classList.add(n >= 3 ? 'tone-3' : (n === 2 ? 'tone-2' : 'tone-1'));
      }

      function setOX(rowSel, value){
        var el = document.querySelector(rowSel + ' .ox-badge');
        if(!el) return;
        var v = coerce(value);
        if(v === '' || v === '-' || v.toLowerCase() === 'null'){
          el.textContent = '-';
          el.setAttribute('aria-label', '-');
          el.classList.remove('on','off');
          return;
        }
        var ox = (v === 'X') ? 'X' : 'O';
        el.textContent = ox;
        el.setAttribute('aria-label', ox);
        el.classList.remove('on','off');
        el.classList.add(ox === 'O' ? 'on' : 'off');
      }

      function readStoredAssetId(){
        try{
          var v = sessionStorage.getItem('storage_san:selected:asset_id') || localStorage.getItem('storage_san:selected:asset_id');
          var n = parseInt(v, 10);
          return (!isNaN(n) && n > 0) ? n : null;
        }catch(_e){ return null; }
      }

      function normalizeApiItemToSelectedRow(item){
        if(!item || typeof item !== 'object') return null;
        function s(v){ return (v == null) ? '' : String(v).trim(); }
        function pick(name, code){ return s(name) || s(code) || ''; }
        function pickDash(v){ var t=s(v); return t || '-'; }
        function numStr(v){ return (v == null || v === '') ? '' : String(v); }
        return {
          id: item.id,
          asset_id: item.id,
          asset_code: s(item.asset_code),
          asset_name: s(item.asset_name),
          work_type: pick(item.work_type_name, item.work_type_code),
          work_type_code: s(item.work_type_code),
          work_type_name: s(item.work_type_name),
          work_category: pick(item.work_category_name, item.work_category_code),
          work_category_code: s(item.work_category_code),
          work_category_name: s(item.work_category_name),
          work_status: pick(item.work_status_name, item.work_status_code),
          work_status_code: s(item.work_status_code),
          work_status_name: s(item.work_status_name),
          work_operation: pick(item.work_operation_name, item.work_operation_code),
          work_operation_code: s(item.work_operation_code),
          work_operation_name: s(item.work_operation_name),
          work_group: pick(item.work_group_name, item.work_group_code),
          work_group_code: s(item.work_group_code),
          work_group_name: s(item.work_group_name),
          work_name: s(item.work_name),
          system_name: s(item.system_name),
          system_ip: s(item.system_ip),
          manage_ip: s(item.mgmt_ip || item.manage_ip),
          vendor: pick(item.manufacturer_name, item.manufacturer_code),
          manufacturer_code: s(item.manufacturer_code),
          model: pick(item.server_model_name, item.server_code),
          server_code: s(item.server_code),
          serial: pickDash(item.serial_number || item.serial),
          virtualization: s(item.virtualization_type),
          location_place: pick(item.center_name, item.center_code),
          center_code: s(item.center_code),
          location_pos: pick(item.rack_name, item.rack_code),
          rack_code: s(item.rack_code),
          slot: pickDash(item.slot),
          u_size: pickDash(item.u_size),
          sys_dept: pick(item.system_dept_name, item.system_dept_code),
          system_dept_code: s(item.system_dept_code),
          svc_dept: pick(item.service_dept_name, item.service_dept_code),
          service_dept_code: s(item.service_dept_code),
          sys_owner: pick(item.system_owner_name, item.system_owner_emp_no),
          system_owner_emp_no: s(item.system_owner_emp_no),
          svc_owner: pick(item.service_owner_name, item.service_owner_emp_no),
          service_owner_emp_no: s(item.service_owner_emp_no),
          confidentiality: numStr(item.cia_confidentiality),
          integrity: numStr(item.cia_integrity),
          availability: numStr(item.cia_availability),
          security_score: numStr(item.security_score),
          system_grade: s(item.system_grade),
          core_flag: s(item.core_flag),
          dr_built: s(item.dr_built),
          svc_redundancy: s(item.svc_redundancy)
        };
      }

      function saveSelectedRow(row){
        if(!row) return;
        var prefixes = [];
        try{
          var p = (typeof STORAGE_PREFIX !== 'undefined' && STORAGE_PREFIX) ? String(STORAGE_PREFIX) : 'san_storage';
          prefixes.push(p);
        }catch(_e){ prefixes.push('san_storage'); }
        prefixes.push('san');

        for(var i=0;i<prefixes.length;i++){
          var key = prefixes[i] + ':selected:row';
          try{ sessionStorage.setItem(key, JSON.stringify(row)); }catch(_e2){}
          try{ localStorage.setItem(key, JSON.stringify(row)); }catch(_e3){}
        }
        try{ sessionStorage.setItem('storage_san:selected:work_name', String(row.work_name || '')); }catch(_e4){}
        try{ sessionStorage.setItem('storage_san:selected:system_name', String(row.system_name || '')); }catch(_e5){}
        try{ localStorage.setItem('storage_san:selected:work_name', String(row.work_name || '')); }catch(_e6){}
        try{ localStorage.setItem('storage_san:selected:system_name', String(row.system_name || '')); }catch(_e7){}
        try{
          var assetId = row && (row.id != null ? row.id : row.asset_id);
          if(assetId != null){
            sessionStorage.setItem('storage_san:selected:asset_id', String(assetId));
            try{ localStorage.setItem('storage_san:selected:asset_id', String(assetId)); }catch(_e9){}
          }
        }catch(_e8){}
      }

      var row = readSelectedRow();
      function isPlaceholderText(v){
        try{
          var s = String(v == null ? '' : v).trim();
          if(!s) return false;
          if(s === '-' || s.toLowerCase() === 'null') return true;
          // Common modal/select placeholders/hints
          if(s === '선택') return true;
          if(s.indexOf('먼저 선택') > -1) return true;
          // e.g. "제조사 선택", "모델 선택", "센터 선택", "부서 선택", "담당자 선택"
          if(s.endsWith(' 선택')) return true;
          return false;
        }catch(_e){ return false; }
      }
      function rowHasPlaceholderValues(r){
        if(!r || typeof r !== 'object') return false;
        var keys = ['vendor','model','location_place','location_pos','sys_dept','sys_owner','svc_dept','svc_owner'];
        for(var i=0;i<keys.length;i++){
          var k = keys[i];
          if(isPlaceholderText(r[k])) return true;
        }
        return false;
      }
      if(!row){
        // On refresh/direct-open, we might only have asset_id stored (not the full selected row).
        // Hydrate the selected row from the backend once, then reload to reuse the existing render logic.
        var assetId = readStoredAssetId();
        if(!assetId) return;
        var hydrateFlagKey = 'storage_san:detail:hydrated:' + String(assetId);
        try{
          var prev = parseInt(sessionStorage.getItem(hydrateFlagKey) || '0', 10);
          var now = Date.now();
          if(!isNaN(prev) && prev > 0 && (now - prev) < 3000) return;
          sessionStorage.setItem(hydrateFlagKey, String(now));
        }catch(_eF){}

        fetch('/api/hardware/storage/assets/' + encodeURIComponent(String(assetId)), { method: 'GET', headers: { Accept: 'application/json' } })
          .then(function(res){ return (res && res.ok) ? res.json() : null; })
          .then(function(data){
            var item = data && data.item ? data.item : null;
            var normalized = normalizeApiItemToSelectedRow(item);
            if(normalized){
              saveSelectedRow(normalized);
              try{ window.location.reload(); }catch(_eR){}
            }
          })
          .catch(function(){ /* ignore */ });
        return;
      }

      // If stored row accidentally contains modal placeholder strings, re-hydrate from DB once.
      if(rowHasPlaceholderValues(row)){
        var assetId2 = readStoredAssetId() || (row && (row.id != null ? row.id : row.asset_id));
        if(assetId2){
          var hydrateFlagKey2 = 'storage_san:detail:rehydrated_placeholders:' + String(assetId2);
          try{
            var prev2 = parseInt(sessionStorage.getItem(hydrateFlagKey2) || '0', 10);
            var now2 = Date.now();
            if(!isNaN(prev2) && prev2 > 0 && (now2 - prev2) < 3000) return;
            sessionStorage.setItem(hydrateFlagKey2, String(now2));
          }catch(_eFlag2){}

          fetch('/api/hardware/storage/assets/' + encodeURIComponent(String(assetId2)), { method: 'GET', headers: { Accept: 'application/json' } })
            .then(function(res){ return (res && res.ok) ? res.json() : null; })
            .then(function(data){
              var item = data && data.item ? data.item : null;
              var normalized = normalizeApiItemToSelectedRow(item);
              if(normalized){
                saveSelectedRow(normalized);
                try{ window.location.reload(); }catch(_eRR){}
              }
            })
            .catch(function(){ /* ignore */ });
          return;
        }
      }

      function normStr(v){
        if(v === 0) return '0';
        if(v == null) return '';
        return String(v).trim();
      }

      // Resolve FK codes to display names for business fields.
      // List pages may store either display labels or raw codes; detail view should prefer human-friendly names.
      var _lookupCache = {};
      function fetchJSON(url){
        try{
          return fetch(url, { method: 'GET', headers: { Accept: 'application/json' } })
            .then(function(res){ return res && res.ok ? res.json() : null; })
            .catch(function(){ return null; });
        }catch(_e){ return Promise.resolve(null); }
      }
      function loadLookup(endpoint){
        if(_lookupCache[endpoint]) return _lookupCache[endpoint];
        _lookupCache[endpoint] = fetchJSON(endpoint).then(function(data){
          if(!data) return [];
          if(Array.isArray(data.items)) return data.items;
          if(Array.isArray(data)) return data;
          return [];
        });
        return _lookupCache[endpoint];
      }
      function lookupLabel(endpoint, valueKey, labelKey, code){
        var c = normStr(code);
        if(!c) return Promise.resolve('');
        return loadLookup(endpoint).then(function(items){
          try{
            for(var i=0;i<items.length;i++){
              var it = items[i];
              if(!it) continue;
              if(normStr(it[valueKey]) === c){
                return normStr(it[labelKey]) || '';
              }
            }
          }catch(_e){ /* ignore */ }
          return '';
        });
      }
      function pickCode(primaryCode, fallbackMaybeCode){
        var a = normStr(primaryCode);
        if(a) return a;
        return normStr(fallbackMaybeCode);
      }
      function pickDisplay(primaryName, fallbackDisplay){
        var a = normStr(primaryName);
        if(a) return a;
        return normStr(fallbackDisplay);
      }

      function looksLikeCode(v){
        var s = normStr(v);
        if(!s) return false;
        // Conservative: codes in this app are usually compact, uppercase-ish, digits/underscore.
        if(/^[A-Z0-9_\-]+$/.test(s) && s.length <= 20) return true;
        if(/^\d{2}(_\d+)+$/.test(s)) return true;
        if(/^OPERATION_\d+$/.test(s)) return true;
        return false;
      }

      // Business
      setStatus(row.work_status_name || row.work_status);
      // Render immediately using whatever the list stored; then asynchronously upgrade code -> name.
      var _wtDisp = pickDisplay(row.work_type_name, row.work_type);
      var _wcDisp = pickDisplay(row.work_category_name, row.work_category);
      var _woDisp = pickDisplay(row.work_operation_name, row.work_operation);
      var _wgDisp = pickDisplay(row.work_group_name, row.work_group);
      setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(2) .info-value', (looksLikeCode(_wtDisp) && !normStr(row.work_type_name)) ? '-' : _wtDisp);
      setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(3) .info-value', (looksLikeCode(_wcDisp) && !normStr(row.work_category_name)) ? '-' : _wcDisp);
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(4) .info-value', (looksLikeCode(_woDisp) && !normStr(row.work_operation_name)) ? '-' : _woDisp);
      setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(5) .info-value', (looksLikeCode(_wgDisp) && !normStr(row.work_group_name)) ? '-' : _wgDisp);
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(6) .info-value', row.work_name);
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(7) .info-value', row.system_name);
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(8) .info-value', row.system_ip);
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(9) .info-value', row.manage_ip);

      // Upgrade business labels (code -> name) if possible.
      (function(){
        var workTypeCode = pickCode(row.work_type_code, row.work_type);
        var workCategoryCode = pickCode(row.work_category_code, row.work_category);
        var workOperationCode = pickCode(row.work_operation_code, row.work_operation);
        var workGroupCode = pickCode(row.work_group_code, row.work_group);

        Promise.all([
          lookupLabel('/api/work-categories', 'category_code', 'wc_name', workTypeCode),
          lookupLabel('/api/work-divisions', 'division_code', 'wc_name', workCategoryCode),
          lookupLabel('/api/work-operations', 'operation_code', 'wc_name', workOperationCode),
          lookupLabel('/api/work-groups', 'group_code', 'group_name', workGroupCode)
        ]).then(function(resolved){
          var wt = resolved && resolved[0] ? resolved[0] : '';
          var wc = resolved && resolved[1] ? resolved[1] : '';
          var wo = resolved && resolved[2] ? resolved[2] : '';
          var wg = resolved && resolved[3] ? resolved[3] : '';
          if(wt) setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(2) .info-value', wt);
          if(wc) setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(3) .info-value', wc);
          if(wo) setText('.basic-info-card:nth-child(1) .info-row:nth-child(4) .info-value', wo);
          if(wg) setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(5) .info-value', wg);

          // Persist resolved display labels back into selected row so refresh doesn't fall back to codes.
          try{
            var updated = false;
            if(wt && looksLikeCode(row.work_type)) { row.work_type = wt; row.work_type_name = wt; updated = true; }
            if(wc && looksLikeCode(row.work_category)) { row.work_category = wc; row.work_category_name = wc; updated = true; }
            if(wo && looksLikeCode(row.work_operation)) { row.work_operation = wo; row.work_operation_name = wo; updated = true; }
            if(wg && looksLikeCode(row.work_group)) { row.work_group = wg; row.work_group_name = wg; updated = true; }
            if(updated && typeof saveSelectedRow === 'function') saveSelectedRow(row);
          }catch(_e){ /* ignore */ }
        }).catch(function(){ /* ignore */ });
      })();

      // System
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(1) .info-value', row.vendor);
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(2) .info-value', row.model);
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(3) .info-value', row.serial);
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(4) .info-value', row.virtualization);
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(5) .info-value', row.location_place);
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(6) .info-value', row.location_pos);
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(7) .info-value', row.slot);
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(8) .info-value', row.u_size);
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(9) .info-value', (row.rack_face === 'REAR') ? '후면' : '전면');

      // Owners
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(1) .info-value', row.sys_dept);
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(2) .info-value', row.sys_owner);
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(3) .info-value', row.svc_dept);
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(4) .info-value', row.svc_owner);

      // CIA
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(1) .num-badge', 'confidentiality', row.confidentiality);
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(2) .num-badge', 'integrity', row.integrity);
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(3) .num-badge', 'availability', row.availability);
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(4) .num-badge', 'security_score', row.security_score);
      setText('.basic-info-card:nth-child(4) .info-row:nth-child(5) .info-value', row.system_grade);
      setText('.basic-info-card:nth-child(4) .info-row:nth-child(6) .info-value', row.core_flag);
      setOX('.basic-info-card:nth-child(4) .info-row:nth-child(7)', row.dr_built);
      setOX('.basic-info-card:nth-child(4) .info-row:nth-child(8)', row.svc_redundancy);
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
        var storagePrefix = (typeof STORAGE_PREFIX !== 'undefined' && STORAGE_PREFIX) ? STORAGE_PREFIX : 'san_storage';
        var raw = sessionStorage.getItem(storagePrefix+':selected:row') || localStorage.getItem(storagePrefix+':selected:row');
        if(raw){
          var selectedRow = JSON.parse(raw);
          var keys = [
            'work_type','work_type_code','work_type_name',
            'work_category','work_category_code','work_category_name',
            'work_status','work_status_code','work_status_name',
            'work_operation','work_operation_code','work_operation_name',
            'work_group','work_group_code','work_group_name',
            'work_name','system_name','system_ip','manage_ip',
            'vendor','manufacturer_code',
            'model','server_code',
            'serial','virtualization',
            'location_place','center_code',
            'location_pos','rack_code',
            'slot','u_size',
            'sys_dept','system_dept_code',
            'svc_dept','service_dept_code',
            'sys_owner','system_owner_emp_no',
            'svc_owner','service_owner_emp_no',
            'confidentiality','integrity','availability','security_score','system_grade','core_flag','dr_built','svc_redundancy'
          ];
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
        function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
        function fkSelect(name, placeholder, selectedValue, selectedLabel, extraAttrs){
          var attrs = '';
          if(extraAttrs) attrs = ' ' + String(extraAttrs);
          var v = selectedValue == null ? '' : String(selectedValue);
          var l = selectedLabel == null ? '' : String(selectedLabel);
          // Seed with current selection so fk_select.js can preserve label even if value isn't in the loaded options yet.
          var seed = '';
          if(v || l){
            seed = '<option value="' + esc(v) + '" selected>' + esc(l || v) + '</option>';
          } else {
            seed = '<option value="">' + esc(placeholder || '선택') + '</option>';
          }
          return '<select name="' + esc(name) + '" class="form-input search-select fk-select" data-fk="' + esc(name) + '" data-placeholder="' + esc(placeholder || '선택') + '"' + attrs + '>' + seed + '</select>';
        }

        var opts={
          virtualization:['','물리','가상'],
          confidentiality:['','1','2','3'], integrity:['','1','2','3'], availability:['','1','2','3'],
          system_grade:['','1등급','2등급','3등급'], core_flag:['','핵심','일반'], dr_built:['','O','X'], svc_redundancy:['','O','X']
        };
        if(col==='security_score') return '<input name="security_score" class="form-input" type="number" readonly placeholder="자동 합계" value="'+(value||'')+'">';

        // FK searchable dropdowns (must display name labels while holding codes as values)
        if(col==='work_type') return fkSelect('work_type', '업무 분류 선택', data.work_type_code || value, data.work_type_name || data.work_type || value);
        if(col==='work_category') return fkSelect('work_category', '업무 구분 선택', data.work_category_code || value, data.work_category_name || data.work_category || value);
        if(col==='work_status') return fkSelect('work_status', '업무 상태 선택', data.work_status_code || value, data.work_status_name || data.work_status || value);
        if(col==='work_operation') return fkSelect('work_operation', '업무 운영 선택', data.work_operation_code || value, data.work_operation_name || data.work_operation || value);
        if(col==='work_group') return fkSelect('work_group', '업무 그룹 선택', data.work_group_code || value, data.work_group_name || data.work_group || value);
        if(col==='vendor') return fkSelect('vendor', '제조사 선택', data.manufacturer_code || value, data.vendor || value);
        if(col==='model') return fkSelect('model', '모델 선택', data.server_code || value, data.model || value);
        if(col==='location_place') return fkSelect('location_place', '센터 선택', data.center_code || value, data.location_place || value);
        if(col==='location_pos') return fkSelect('location_pos', '랙 선택', data.rack_code || value, data.location_pos || value);
        if(col==='sys_dept') return fkSelect('sys_dept', '부서 선택', data.system_dept_code || value, data.sys_dept || value);
        if(col==='svc_dept') return fkSelect('svc_dept', '부서 선택', data.service_dept_code || value, data.svc_dept || value);
        if(col==='sys_owner') return fkSelect('sys_owner', '담당자 선택', data.system_owner_emp_no || value, data.sys_owner || value);
        if(col==='svc_owner') return fkSelect('svc_owner', '담당자 선택', data.service_owner_emp_no || value, data.svc_owner || value);

        if(opts[col]){
          var extraClass = (['confidentiality','integrity','availability'].indexOf(col)>-1) ? ' score-trigger' : '';
          var cur = (value == null) ? '' : String(value).trim();
          // The cards often display '-' for null; do not carry '-' into dropdown selection.
          if(cur === '-' || cur.toLowerCase() === 'null') cur = '';
          return '<select name="'+col+'" class="form-input search-select'+extraClass+'" data-searchable="true" data-placeholder="선택">'+
            opts[col].map(function(o){ return '<option value="'+o+'" '+(String(o)===String(cur)?'selected':'')+'>'+(o===''?'선택':(o||''))+'</option>'; }).join('')+
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
      function field(name){ return form.querySelector('[name="'+name+'"]'); }
      function v(name){ var el=field(name); return el? el.value : ''; }
      function lbl(name){
        var el=field(name);
        if(!el) return '';
        if(String(el.tagName||'').toUpperCase() === 'SELECT'){
          try{
            var opt = el.options && el.selectedIndex >= 0 ? el.options[el.selectedIndex] : null;
            var t = opt ? (opt.textContent || opt.innerText || '') : '';
            t = String(t||'').trim();
            if(t) return t;
          }catch(_e){}
        }
        return String(el.value||'');
      }
      function displayOrDash(name){
        var raw = String(v(name)||'').trim();
        if(!raw || raw === '-' || raw.toLowerCase() === 'null') return '-';
        var t = String(lbl(name)||'').trim();
        // Don't leak placeholder-like labels into the cards.
        if(!t || t === '선택' || t === '-' || t.toLowerCase() === 'null' || t.indexOf('먼저 선택')>-1 || t.endsWith(' 선택')) return raw;
        return t;
      }
        setText('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill .status-text', lbl('work_status'));
      try {
        var pill=document.querySelector('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill');
        if(pill){
          var dot=pill.querySelector('.status-dot');
          var statusLbl=lbl('work_status');
          var cls=(statusLbl==='가동'?'ws-run': (statusLbl==='유휴'?'ws-idle':'ws-wait'));
          if(dot){ dot.classList.remove('ws-run','ws-idle','ws-wait'); dot.classList.add(cls); }
        }
      }catch(_e){}
      setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(2) .info-value', lbl('work_type'));
      setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(3) .info-value', lbl('work_category'));
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(4) .info-value', lbl('work_operation'));
      setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(5) .info-value', lbl('work_group'));
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(6) .info-value', v('work_name'));
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(7) .info-value', v('system_name'));
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(8) .info-value', v('system_ip'));
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(9) .info-value', v('manage_ip'));
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(1) .info-value', displayOrDash('vendor'));
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(2) .info-value', displayOrDash('model'));
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(3) .info-value', v('serial'));
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(4) .info-value', displayOrDash('virtualization'));
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(5) .info-value', displayOrDash('location_place'));
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(6) .info-value', displayOrDash('location_pos'));
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(7) .info-value', v('slot'));
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(8) .info-value', v('u_size'));
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(1) .info-value', displayOrDash('sys_dept'));
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(2) .info-value', displayOrDash('sys_owner'));
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(3) .info-value', displayOrDash('svc_dept'));
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(4) .info-value', displayOrDash('svc_owner'));
      function setNumBadge(sel, num, mode){
        var badge=document.querySelector(sel);
        if(!badge) return;
        var raw = String(num==null ? '' : num).trim();
        if(!raw || raw === '-' || raw.toLowerCase() === 'null'){
          badge.textContent = '-';
          badge.classList.remove('tone-1','tone-2','tone-3');
          return;
        }
        badge.textContent = raw;
        var n=parseInt(raw,10);
        badge.classList.remove('tone-1','tone-2','tone-3');
        if(isNaN(n)) return;
        // Align with onpremise: CIA (1/2/3), security_score (>=6/8)
        if(mode === 'security_score') badge.classList.add(n >= 8 ? 'tone-3' : (n >= 6 ? 'tone-2' : 'tone-1'));
        else badge.classList.add(n>=3?'tone-3':(n===2?'tone-2':'tone-1'));
      }
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(1) .num-badge', v('confidentiality'));
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(2) .num-badge', v('integrity'));
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(3) .num-badge', v('availability'));
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(4) .num-badge', v('security_score'), 'security_score');
      setText('.basic-info-card:nth-child(4) .info-row:nth-child(5) .info-value', displayOrDash('system_grade'));
      setText('.basic-info-card:nth-child(4) .info-row:nth-child(6) .info-value', displayOrDash('core_flag'));
      function setOX(rowSel, name){
        var el=document.querySelector(rowSel+' .ox-badge');
        if(!el) return;
        var val=String(v(name)||'').trim();
        if(!val || val==='-' || val.toLowerCase()==='null'){
          el.textContent='-';
          el.setAttribute('aria-label','-');
          el.classList.remove('on','off');
          return;
        }
        var ox=(val==='X') ? 'X' : 'O';
        el.textContent=ox;
        el.setAttribute('aria-label', ox);
        el.classList.remove('on','off');
        el.classList.add(ox==='O'?'on':'off');
      }
      // Update OX badges for DR 구축여부 and 서비스 이중화
      setOX('.basic-info-card:nth-child(4) .info-row:nth-child(7)', 'dr_built');
      setOX('.basic-info-card:nth-child(4) .info-row:nth-child(8)', 'svc_redundancy');
      // Persist key hardware fields for cross-tab usage (hardware tab system row)
      try{
        var vendorCode = String(v('vendor')||'').trim();
        var modelCode  = String(v('model')||'').trim();
        var vendorVal = vendorCode ? String(lbl('vendor')||'').trim() : '';
        var modelVal  = modelCode ? String(lbl('model')||'').trim() : '';
        var serialVal = v('serial');
        var slotVal   = v('slot');
        var uSizeVal  = v('u_size');
        localStorage.setItem('storage_san:current:vendor', String(vendorVal||''));
        localStorage.setItem('storage_san:current:model',  String(modelVal||''));
        localStorage.setItem('storage_san:current:vendor_code', String(vendorCode||''));
        localStorage.setItem('storage_san:current:model_code',  String(modelCode||''));
        localStorage.setItem('storage_san:current:serial', String(serialVal||''));
        localStorage.setItem('storage_san:current:slot',   String(slotVal||''));
        localStorage.setItem('storage_san:current:u_size', String(uSizeVal||''));
        localStorage.setItem('storage_san:current:rack_face', String((v('rack_face')) || ''));
      }catch(_){ }

      // Persist labels back into the stored selected row so refresh keeps showing names (not codes).
      try{
        var prefixes = [];
        try{
          var pfx = (typeof STORAGE_PREFIX !== 'undefined' && STORAGE_PREFIX) ? String(STORAGE_PREFIX) : 'san_storage';
          prefixes.push(pfx);
        }catch(_e){ prefixes.push('san_storage'); }
        prefixes.push('san');

        function loadRow(){
          for(var i=0;i<prefixes.length;i++){
            var key = prefixes[i] + ':selected:row';
            try{
              var raw = sessionStorage.getItem(key) || localStorage.getItem(key);
              if(!raw) continue;
              var obj = JSON.parse(raw);
              if(obj && typeof obj === 'object') return obj;
            }catch(_e2){}
          }
          return {};
        }
        function saveRow(obj){
          for(var i=0;i<prefixes.length;i++){
            var key = prefixes[i] + ':selected:row';
            try{ sessionStorage.setItem(key, JSON.stringify(obj)); }catch(_e3){}
            try{ localStorage.setItem(key, JSON.stringify(obj)); }catch(_e4){}
          }
          try{ sessionStorage.setItem('storage_san:selected:work_name', String(obj.work_name || '')); }catch(_e5){}
          try{ sessionStorage.setItem('storage_san:selected:system_name', String(obj.system_name || '')); }catch(_e6){}
          try{ localStorage.setItem('storage_san:selected:work_name', String(obj.work_name || '')); }catch(_e7){}
          try{ localStorage.setItem('storage_san:selected:system_name', String(obj.system_name || '')); }catch(_e8){}
          try{
            var assetId = obj && (obj.id != null ? obj.id : obj.asset_id);
            if(assetId != null){
              sessionStorage.setItem('storage_san:selected:asset_id', String(assetId));
              try{ localStorage.setItem('storage_san:selected:asset_id', String(assetId)); }catch(_e10){}
            }
          }catch(_e9){}
        }

        var rowObj = loadRow();
        // Business
        rowObj.work_status = lbl('work_status');
        rowObj.work_status_name = lbl('work_status');
        rowObj.work_status_code = v('work_status');
        rowObj.work_type = lbl('work_type');
        rowObj.work_type_name = lbl('work_type');
        rowObj.work_type_code = v('work_type');
        rowObj.work_category = lbl('work_category');
        rowObj.work_category_name = lbl('work_category');
        rowObj.work_category_code = v('work_category');
        rowObj.work_operation = lbl('work_operation');
        rowObj.work_operation_name = lbl('work_operation');
        rowObj.work_operation_code = v('work_operation');
        rowObj.work_group = lbl('work_group');
        rowObj.work_group_name = lbl('work_group');
        rowObj.work_group_code = v('work_group');
        rowObj.work_name = v('work_name');

        // System
        rowObj.system_name = v('system_name');
        rowObj.system_ip = v('system_ip');
        rowObj.manage_ip = v('manage_ip');

        // Hardware (persist labels only when a real code is selected)
        var vendorCode2 = String(v('vendor')||'').trim();
        var modelCode2  = String(v('model')||'').trim();
        rowObj.manufacturer_code = vendorCode2;
        rowObj.vendor = vendorCode2 ? String(lbl('vendor')||'').trim() : '';
        rowObj.server_code = modelCode2;
        rowObj.model = modelCode2 ? String(lbl('model')||'').trim() : '';
        rowObj.serial = v('serial');
        rowObj.virtualization = displayOrDash('virtualization');
        var centerCode2 = String(v('location_place')||'').trim();
        var rackCode2   = String(v('location_pos')||'').trim();
        rowObj.center_code = centerCode2;
        rowObj.location_place = centerCode2 ? String(lbl('location_place')||'').trim() : '';
        rowObj.rack_code = rackCode2;
        rowObj.location_pos = rackCode2 ? String(lbl('location_pos')||'').trim() : '';
        rowObj.slot = v('slot');
        rowObj.u_size = v('u_size');

        // Ownership (persist labels only when a real code is selected)
        var sysDeptCode2 = String(v('sys_dept')||'').trim();
        var svcDeptCode2 = String(v('svc_dept')||'').trim();
        var sysOwnerCode2 = String(v('sys_owner')||'').trim();
        var svcOwnerCode2 = String(v('svc_owner')||'').trim();
        rowObj.system_dept_code = sysDeptCode2;
        rowObj.sys_dept = sysDeptCode2 ? String(lbl('sys_dept')||'').trim() : '';
        rowObj.system_owner_emp_no = sysOwnerCode2;
        rowObj.sys_owner = sysOwnerCode2 ? String(lbl('sys_owner')||'').trim() : '';
        rowObj.service_dept_code = svcDeptCode2;
        rowObj.svc_dept = svcDeptCode2 ? String(lbl('svc_dept')||'').trim() : '';
        rowObj.service_owner_emp_no = svcOwnerCode2;
        rowObj.svc_owner = svcOwnerCode2 ? String(lbl('svc_owner')||'').trim() : '';

        // Scores / flags (store raw values; use '-' only for display)
        rowObj.confidentiality = String(v('confidentiality')||'').trim();
        rowObj.integrity = String(v('integrity')||'').trim();
        rowObj.availability = String(v('availability')||'').trim();
        rowObj.security_score = String(v('security_score')||'').trim();
        rowObj.system_grade = String(v('system_grade')||'').trim();
        rowObj.core_flag = String(v('core_flag')||'').trim();
        rowObj.dr_built = String(v('dr_built')||'').trim();
        rowObj.svc_redundancy = String(v('svc_redundancy')||'').trim();

        saveRow(rowObj);
      }catch(_persistErr){}
    }

    function saveBasicInfoToDB(){
      var form=document.getElementById(EDIT_FORM_ID); if(!form) return Promise.resolve(null);
      function field(name){ return form.querySelector('[name="'+name+'"]'); }
      function val(name){ var el=field(name); return el? String(el.value||'').trim() : ''; }
      function emptyToNull(v){ var s=String(v||'').trim(); return s ? s : null; }
      function emptyToNullInt(v){ var s=String(v||'').trim(); if(!s) return null; var n=parseInt(s,10); return isNaN(n) ? null : n; }

      // Resolve asset_id
      var assetId = null;
      try{ assetId = (typeof readStoredAssetId === 'function') ? readStoredAssetId() : null; }catch(_e){ assetId = null; }
      if(!assetId){
        try{
          var raw = sessionStorage.getItem('san_storage:selected:row') || localStorage.getItem('san_storage:selected:row') || sessionStorage.getItem('san:selected:row') || localStorage.getItem('san:selected:row');
          if(raw){
            var obj = JSON.parse(raw);
            var n = parseInt(obj && (obj.id!=null?obj.id:obj.asset_id), 10);
            if(!isNaN(n) && n>0) assetId = n;
          }
        }catch(_e2){}
      }
      if(!assetId){
        // Fallback: no asset id; only update the page locally.
        updatePageFromForm();
        return Promise.resolve(null);
      }

      var payload = {
        // Business (UI uses legacy names; API expects *_code)
        work_category_code: emptyToNull(val('work_type')),
        work_division_code: emptyToNull(val('work_category')),
        work_status_code: emptyToNull(val('work_status')),
        work_operation_code: emptyToNull(val('work_operation')),
        work_group_code: emptyToNull(val('work_group')),
        work_name: emptyToNull(val('work_name')),
        system_name: emptyToNull(val('system_name')),
        system_ip: emptyToNull(val('system_ip')),
        mgmt_ip: emptyToNull(val('manage_ip')),

        // Hardware
        manufacturer_code: emptyToNull(val('vendor')),
        server_code: emptyToNull(val('model')),
        serial_number: emptyToNull(val('serial')),
        virtualization_type: emptyToNull(val('virtualization')),
        center_code: emptyToNull(val('location_place')),
        rack_code: emptyToNull(val('location_pos')),
        system_slot: emptyToNull(val('slot')),
        system_size: emptyToNull(val('u_size')),

        // Ownership
        system_dept_code: emptyToNull(val('sys_dept')),
        system_owner_emp_no: emptyToNull(val('sys_owner')),
        service_dept_code: emptyToNull(val('svc_dept')),
        service_owner_emp_no: emptyToNull(val('svc_owner')),

        // Check
        cia_confidentiality: emptyToNullInt(val('confidentiality')),
        cia_integrity: emptyToNullInt(val('integrity')),
        cia_availability: emptyToNullInt(val('availability')),
        security_score: emptyToNullInt(val('security_score')),
        system_grade: emptyToNull(val('system_grade')),
        core_flag: emptyToNull(val('core_flag')),
        dr_built: emptyToNull(val('dr_built')),
        svc_redundancy: emptyToNull(val('svc_redundancy'))
      };

      return fetch('/api/hardware/storage/assets/' + encodeURIComponent(String(assetId)), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function(res){
          return res.json().catch(function(){ return null; }).then(function(data){ return { ok: res.ok, data: data }; });
        })
        .then(function(r){
          if(!r || !r.ok || !r.data || r.data.success !== true){
            var msg = (r && r.data && r.data.message) ? r.data.message : '저장에 실패했습니다.';
            throw new Error(msg);
          }

          // Update local selection from DB record to prevent drift.
          try{
            var item = r.data.item;
            var normalized = (typeof normalizeApiItemToSelectedRow === 'function') ? normalizeApiItemToSelectedRow(item) : null;
            if(normalized){
              saveSelectedRow(normalized);
            }
          }catch(_e3){}

          // Refresh to reflect DB state (including clears).
          try{ window.location.reload(); }catch(_e4){}
          return r.data.item;
        });
    }
    // Wire the Basic Info edit modal open/close/save
    (function(){
      function openModalLocal(id){ var el=document.getElementById(id); if(!el) return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden','false'); }
      function closeModalLocal(id){ var el=document.getElementById(id); if(!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } }
      var openBtn = document.getElementById(EDIT_OPEN_ID);
      if(openBtn){ openBtn.addEventListener('click', function(){ buildEditFormFromPage(); openModalLocal(EDIT_MODAL_ID); }); }
      var closeBtn = document.getElementById(EDIT_CLOSE_ID);
      if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalLocal(EDIT_MODAL_ID); }); }
      var modalEl = document.getElementById(EDIT_MODAL_ID);
      if(modalEl){ modalEl.addEventListener('click', function(e){ if(e.target === modalEl) closeModalLocal(EDIT_MODAL_ID); }); document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(EDIT_MODAL_ID); }); }
      var saveBtn = document.getElementById(EDIT_SAVE_ID);
      if(saveBtn){
        saveBtn.addEventListener('click', function(){
          var btn = saveBtn;
          var prevText = btn ? (btn.textContent || '') : '';
          try{ btn.disabled = true; btn.textContent = '저장중...'; }catch(_e){}
          saveBasicInfoToDB()
            .then(function(){
              // saveBasicInfoToDB reloads on success; this is a fallback for non-reload paths.
              try{ closeModalLocal(EDIT_MODAL_ID); }catch(_e2){}
            })
            .catch(function(err){
              try{ alert((err && err.message) ? err.message : '저장에 실패했습니다.'); }catch(_e3){}
            })
            .finally(function(){
              try{ btn.disabled = false; btn.textContent = prevText || '저장'; }catch(_e4){}
            });
        });
      }
    })();

    // Tab-specific behaviors were split out into /static/js/_detail/*.js (e.g., tab14-log, tab06-authority, tab15-file, tab03-backup, tab12-vulnerability).
    // This file now keeps only the shared SAN detail behaviors (context, header, basic-info read/update).

});

  // No modal APIs to expose
})();

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

    // ----- KMS Detail linkage: keep selected asset id + hydrate 기본정보 -----
    (function(){
      var storagePrefix = (typeof STORAGE_PREFIX !== 'undefined' && STORAGE_PREFIX) ? STORAGE_PREFIX : 'kms';

      function safeJsonParse(s){
        try{ return JSON.parse(s); }catch(_){ return null; }
      }

      function readSelectedRow(){
        try{
          var raw = sessionStorage.getItem(storagePrefix+':selected:row') || localStorage.getItem(storagePrefix+':selected:row');
          if(!raw){
            raw = sessionStorage.getItem('kms:selected:row') || localStorage.getItem('kms:selected:row');
          }
          if(!raw) return null;
          return safeJsonParse(raw);
        }catch(_){ return null; }
      }

      function readStoredAssetId(){
        try{
          var raw = sessionStorage.getItem(storagePrefix+':selected:asset_id') || localStorage.getItem(storagePrefix+':selected:asset_id');
          if(!raw){
            raw = sessionStorage.getItem('kms:selected:asset_id') || localStorage.getItem('kms:selected:asset_id');
          }
          var n = parseInt(raw, 10);
          return (!isNaN(n) && n > 0) ? n : null;
        }catch(_){ return null; }
      }

      function getSelectedAssetId(){
        // 1) query string
        try{
          var qs = new URLSearchParams(location.search||'');
          var cand = qs.get('asset_id') || qs.get('assetId') || qs.get('id');
          var nn = parseInt(cand, 10);
          if(!isNaN(nn) && nn > 0) return nn;
        }catch(_){ }
        // 2) stored selected row
        try{
          var row = readSelectedRow();
          var id = row && (row.id != null ? row.id : row.asset_id);
          var n = parseInt(id, 10);
          if(!isNaN(n) && n > 0) return n;
        }catch(_){ }
        // 3) stored id
        return readStoredAssetId();
      }

      // Expose asset-scoped storage helpers for other tab modules.
      (function(){
        try{
          var ctx = window.BlossomAssetContext || {};
          ctx.storagePrefix = storagePrefix;
          ctx.getAssetId = getSelectedAssetId;
          ctx.assetKey = function(suffix){
            try{
              var id = getSelectedAssetId();
              if(!id) return null;
              return storagePrefix + ':asset:' + String(id) + ':' + String(suffix);
            }catch(_){ return null; }
          };
          ctx.getOrMigrate = function(newKey, legacyKey){
            try{
              if(newKey){
                var v = localStorage.getItem(newKey);
                if(v != null) return v;
              }
              if(legacyKey){
                var lv = localStorage.getItem(legacyKey);
                if(lv != null){
                  try{ if(newKey) localStorage.setItem(newKey, lv); }catch(_e0){}
                  return lv;
                }
              }
            }catch(_){ }
            return null;
          };
          ctx.set = function(suffix, value){
            try{
              var k = ctx.assetKey ? ctx.assetKey(suffix) : null;
              if(!k) return;
              localStorage.setItem(k, String(value == null ? '' : value));
            }catch(_){ }
          };
          ctx.get = function(suffix){
            try{
              var k = ctx.assetKey ? ctx.assetKey(suffix) : null;
              if(!k) return null;
              return localStorage.getItem(k);
            }catch(_){ return null; }
          };
          window.BlossomAssetContext = ctx;
        }catch(_){ }
      })();

      function persistSelectedAssetId(id){
        try{ sessionStorage.setItem(storagePrefix+':selected:asset_id', String(id)); }catch(_e0){ }
        try{ localStorage.setItem(storagePrefix+':selected:asset_id', String(id)); }catch(_e1){ }
      }

      function stripAssetIdFromUrl(){
        try{
          var u = new URL(window.location.href);
          var changed = false;
          ['id','asset_id','assetId'].forEach(function(k){
            try{ if(u.searchParams.has(k)){ u.searchParams.delete(k); changed = true; } }catch(_e0){}
          });
          if(!changed) return;
          history.replaceState(null, document.title, u.pathname + (u.search || '') + (u.hash || ''));
        }catch(_){ }
      }

      function norm(v){
        var s = (v == null) ? '' : String(v);
        s = s.trim();
        return s ? s : '-';
      }

      function setText(sel, val){
        var el = document.querySelector(sel);
        if(el) el.textContent = String(val == null ? '' : val);
      }

      function setInfo(cardIdx, rowIdx, val){
        var sel = '.basic-info-card:nth-child(' + cardIdx + ') .info-row:nth-child(' + rowIdx + ') .info-value';
        var el = document.querySelector(sel);
        if(el) el.textContent = norm(val);
      }

      function pick(obj, keys){
        if(!obj) return null;
        for(var i=0;i<keys.length;i++){
          var k = keys[i];
          if(obj[k] != null && String(obj[k]).trim() !== '') return obj[k];
        }
        return null;
      }

      function persistCurrentSystemFields(prefix, asset){
        try{
          var pfx = String(prefix || 'kms');
          var vendorVal = pick(asset, ['manufacturer_name','vendor_name','vendor','manufacturer','maker']);
          var modelVal  = pick(asset, ['server_model_name','model_name','model','server_model']);
          var serialVal = pick(asset, ['serial_number','serial','serial_no','sn']);
          try{ sessionStorage.setItem(pfx+':current:vendor', String(vendorVal||'')); }catch(_e0){ }
          try{ localStorage.setItem(pfx+':current:vendor', String(vendorVal||'')); }catch(_e1){ }
          try{ sessionStorage.setItem(pfx+':current:model', String(modelVal||'')); }catch(_e2){ }
          try{ localStorage.setItem(pfx+':current:model', String(modelVal||'')); }catch(_e3){ }
          try{ sessionStorage.setItem(pfx+':current:serial', String(serialVal||'')); }catch(_e4){ }
          try{ localStorage.setItem(pfx+':current:serial', String(serialVal||'')); }catch(_e5){ }

          // Back-compat keys used by older code paths.
          if(pfx !== 'kms'){
            try{ sessionStorage.setItem('kms:current:vendor', String(vendorVal||'')); }catch(_e6){ }
            try{ localStorage.setItem('kms:current:vendor', String(vendorVal||'')); }catch(_e7){ }
            try{ sessionStorage.setItem('kms:current:model', String(modelVal||'')); }catch(_e8){ }
            try{ localStorage.setItem('kms:current:model', String(modelVal||'')); }catch(_e9){ }
            try{ sessionStorage.setItem('kms:current:serial', String(serialVal||'')); }catch(_e10){ }
            try{ localStorage.setItem('kms:current:serial', String(serialVal||'')); }catch(_e11){ }
          }
        }catch(_e){ }
      }

      function renderBasicInfo(asset, assetId){
        if(!document.querySelector('.basic-info-grid')) return;
        // 업무 상태: list page style (status pill)
        (function(){
          var rowSel = '.basic-info-card:nth-child(1) .info-row:nth-child(1)';
          var row = document.querySelector(rowSel);
          if(!row) return;
          var pill = row.querySelector('.status-pill');
          var textEl = row.querySelector('.status-text');
          var dotEl = row.querySelector('.status-dot');
          if(!pill || !textEl || !dotEl) {
            // fallback
            setInfo(1, 1, pick(asset, ['work_status_name','work_status','work_status_code']));
            return;
          }
          var v = pick(asset, ['work_status_name','work_status','work_status_code']);
          var label = (v == null || String(v).trim()==='') ? '-' : String(v);
          textEl.textContent = label;

          // Prefer API-provided color/token when available (matches list)
          var customColor = pick(asset, ['work_status_color']);
          var tokenClass = pick(asset, ['work_status_token']);
          try{ pill.classList.remove('colored'); }catch(_){ }
          try{ pill.removeAttribute('style'); }catch(_){ }

          if(customColor){
            try{
              pill.classList.add('colored');
              pill.style.setProperty('--status-dot-color', String(customColor));
              // optional bg/border vars are ok to omit
            }catch(_e0){ }
            try{
              dotEl.classList.remove('ws-run','ws-idle','ws-wait');
            }catch(_e1){ }
          } else {
            var cls = tokenClass ? String(tokenClass) : '';
            if(!cls){
              if(label === '가동') cls = 'ws-run';
              else if(label === '유휴') cls = 'ws-idle';
              else cls = 'ws-wait';
            }
            try{ dotEl.classList.remove('ws-run','ws-idle','ws-wait'); dotEl.classList.add(cls); }catch(_e2){ }
          }
        })();
        // API returns canonical names/codes: work_category_name/code, work_division_name/code, ...
        setInfo(1, 2, pick(asset, ['work_type_name','work_category_name','work_type','work_category_code']));
        setInfo(1, 3, pick(asset, ['work_category_name','work_division_name','work_category','work_division_code']));
        setInfo(1, 4, pick(asset, ['work_operation_name','work_operation','work_operation_code']));
        setInfo(1, 5, pick(asset, ['work_group_name','work_group','work_group_code']));
        setInfo(1, 6, pick(asset, ['work_name']));
        setInfo(1, 7, pick(asset, ['system_name','asset_name']));
        setInfo(1, 8, pick(asset, ['system_ip','ip','system_ip_address']));
        setInfo(1, 9, pick(asset, ['manage_ip','mgmt_ip','management_ip']));

        setInfo(2, 1, pick(asset, ['vendor_name','manufacturer_name','vendor','manufacturer_code']));
        setInfo(2, 2, pick(asset, ['model_name','server_model_name','model','server_code']));
        setInfo(2, 3, pick(asset, ['serial','serial_no','serial_number']));
        setInfo(2, 4, pick(asset, ['virtualization','virtualization_name','virtualization_type']));
        setInfo(2, 5, pick(asset, ['location_place_name','center_name','location_place','center_code']));
        setInfo(2, 6, pick(asset, ['location_pos_name','rack_name','location_pos','rack_code']));
        setInfo(2, 7, pick(asset, ['slot']));
        setInfo(2, 8, pick(asset, ['u_size','u']));
        setInfo(2, 9, (pick(asset, ['rack_face']) === 'REAR') ? '후면' : '전면');

        setInfo(3, 1, pick(asset, ['sys_dept_name','system_dept_name','sys_dept','system_department','system_dept_code']));
        setInfo(3, 2, pick(asset, ['sys_owner_name','system_owner_name','sys_owner','system_owner','system_owner_emp_no']));
        setInfo(3, 3, pick(asset, ['svc_dept_name','service_dept_name','svc_dept','service_department','service_dept_code']));
        setInfo(3, 4, pick(asset, ['svc_owner_name','service_owner_name','svc_owner','service_owner','service_owner_emp_no']));

        // Numeric badges: CIA + security_score (match HSM detail behavior)
        (function(){
          function setNumBadgeRow(rowSel, value, mode){
            var row = document.querySelector(rowSel); if(!row) return;
            var badge = row.querySelector('.num-badge'); if(!badge) return;
            var valStr = String(value == null ? '' : value).trim();
            if(!valStr) valStr = '-';
            badge.textContent = valStr;
            badge.classList.remove('tone-1','tone-2','tone-3');
            if(valStr === '-') return;
            var n = parseInt(valStr, 10);
            if(isNaN(n)) return;
            var tone = 'tone-1';
            if(mode === 'security_score'){
              tone = (n >= 8) ? 'tone-3' : (n >= 6 ? 'tone-2' : 'tone-1');
            } else {
              tone = (n >= 3) ? 'tone-3' : (n === 2 ? 'tone-2' : 'tone-1');
            }
            badge.classList.add(tone);
          }
          setNumBadgeRow('.basic-info-card:nth-child(4) .info-row:nth-child(1)', pick(asset, ['confidentiality','cia_confidentiality']), 'cia');
          setNumBadgeRow('.basic-info-card:nth-child(4) .info-row:nth-child(2)', pick(asset, ['integrity','cia_integrity']), 'cia');
          setNumBadgeRow('.basic-info-card:nth-child(4) .info-row:nth-child(3)', pick(asset, ['availability','cia_availability']), 'cia');
          setNumBadgeRow('.basic-info-card:nth-child(4) .info-row:nth-child(4)', pick(asset, ['security_score','security_total']), 'security_score');
        })();
        setInfo(4, 5, pick(asset, ['system_grade','grade']));
        // Booleans may be stored as 0/1
        var coreRaw = pick(asset, ['core_flag','core','is_core_system']);
        if(coreRaw === 0 || coreRaw === '0') coreRaw = '일반';
        if(coreRaw === 1 || coreRaw === '1') coreRaw = '핵심';
        setInfo(4, 6, coreRaw);
        // OX badges
        (function(){
          function setOxRow(rowSel, raw){
            // Keep identical behavior to HSM detail page:
            // - Show 'O'/'X' when explicitly known
            // - Otherwise show '-' (no on/off classes)
            var row = document.querySelector(rowSel); if(!row) return;
            var badge = row.querySelector('.ox-badge'); if(!badge) return;
            var v = String(raw == null ? '' : raw).trim().toUpperCase();
            if(v === '0' || v === 'FALSE') v = 'X';
            if(v === '1' || v === 'TRUE') v = 'O';
            if(!(v === 'O' || v === 'X')) v = '-';
            badge.textContent = v;
            badge.classList.remove('on','off','is-empty');
            if(v === 'O') badge.classList.add('on');
            else if(v === 'X') badge.classList.add('off');
          }
          setOxRow('.basic-info-card:nth-child(4) .info-row:nth-child(7)', pick(asset, ['dr_built','dr','has_dr_site']));
          setOxRow('.basic-info-card:nth-child(4) .info-row:nth-child(8)', pick(asset, ['svc_redundancy','redundancy','has_service_ha']));
        })();

        // Header
        var title = pick(asset, ['system_name','asset_name','asset_code']) || 'KMS';
        setText('#page-title', String(title));
        var subParts = [];
        var workName = pick(asset, ['work_name']);
        var vendor = pick(asset, ['vendor_name','manufacturer_name','vendor','manufacturer_code']);
        var model = pick(asset, ['model_name','server_model_name','model','server_code']);
        if(workName) subParts.push(String(workName));
        if(vendor || model) subParts.push([vendor, model].filter(Boolean).join(' '));
        if(subParts.length === 0 && assetId) subParts.push('ID: ' + String(assetId));
        setText('#page-subtitle', subParts.join(' / ') || '-');
      }

      function renderHeaderOnly(asset, assetId){
        try{
          if(!(document.getElementById('page-title') || document.getElementById('page-subtitle'))) return;
          var title = pick(asset, ['system_name','asset_name','asset_code']) || 'KMS';
          setText('#page-title', String(title));
          var subParts = [];
          var workName = pick(asset, ['work_name']);
          var vendor = pick(asset, ['vendor_name','manufacturer_name','vendor','manufacturer_code']);
          var model = pick(asset, ['model_name','server_model_name','model','server_code']);
          if(workName) subParts.push(String(workName));
          if(vendor || model) subParts.push([vendor, model].filter(Boolean).join(' '));
          if(subParts.length === 0 && assetId) subParts.push('ID: ' + String(assetId));
          setText('#page-subtitle', subParts.join(' / ') || '-');
        }catch(_eHeader){ }
      }

      // Expose a minimal renderer for other modules (e.g., edit modal save)
      try{
        window.BlossomKmsDetail = window.BlossomKmsDetail || {};
        window.BlossomKmsDetail.renderBasicInfo = renderBasicInfo;
      }catch(_eExpose){ }

      async function fetchKmsAsset(assetId){
        var r = await fetch('/api/hardware/security/kms/assets/' + encodeURIComponent(String(assetId)), { method:'GET', headers:{'Accept':'application/json'} });
        var j = await r.json().catch(function(){ return null; });
        if(!r.ok){
          throw new Error((j && (j.message || j.error)) ? (j.message || j.error) : ('HTTP ' + r.status));
        }
        if(!(j && j.success && j.item)) throw new Error('Invalid response');
        return j.item;
      }

      async function bootstrap(){
        var assetId = getSelectedAssetId();
        if(assetId){
          persistSelectedAssetId(assetId);
          stripAssetIdFromUrl();
        }

        // Always keep the header in sync even on non-basic tabs.
        var hasBasicMarkup = !!(document.getElementById('basic') && document.querySelector('.basic-info-grid'));
        if(!hasBasicMarkup && (document.getElementById('page-title') || document.getElementById('page-subtitle'))){
          if(!assetId){
            var cachedNoId = readSelectedRow();
            if(cachedNoId){
              renderHeaderOnly(cachedNoId, null);
            } else {
              setText('#page-title', 'KMS');
              setText('#page-subtitle', '-');
            }
            return;
          }

          var cached = readSelectedRow();
          if(cached){
            try{ persistCurrentSystemFields(storagePrefix, cached); }catch(_ePersist0){ }
            try{
              if(window.BlossomTab01Hardware && typeof window.BlossomTab01Hardware.refreshSystemRow === 'function'){
                window.BlossomTab01Hardware.refreshSystemRow();
              }
            }catch(_eRefresh0){ }
            renderHeaderOnly(cached, assetId);
          }

          try{
            var asset = await fetchKmsAsset(assetId);
            try{ sessionStorage.setItem(storagePrefix+':selected:row', JSON.stringify(asset)); }catch(_e0){ }
            try{ localStorage.setItem(storagePrefix+':selected:row', JSON.stringify(asset)); }catch(_e1){ }
            try{ persistCurrentSystemFields(storagePrefix, asset); }catch(_ePersist1){ }
            try{
              if(window.BlossomTab01Hardware && typeof window.BlossomTab01Hardware.refreshSystemRow === 'function'){
                window.BlossomTab01Hardware.refreshSystemRow();
              }
            }catch(_eRefresh1){ }
            renderHeaderOnly(asset, assetId);
          }catch(_eFetch){
            if(!cached){
              setText('#page-title', 'KMS');
              setText('#page-subtitle', '-');
            }
          }
          return;
        }

        // Hydrate 기본정보 only when its markup exists
        if(!(document.getElementById('basic') && document.querySelector('.basic-info-grid'))) return;

        if(!assetId){
          setText('#page-title', 'KMS');
          setText('#page-subtitle', '대상이 선택되지 않았습니다. 목록에서 다시 선택해 주세요.');
          return;
        }

        // Fast paint: use stored row first, then refresh from API.
        try{
          var cachedBasic = readSelectedRow();
          if(cachedBasic){
            renderBasicInfo(cachedBasic, assetId);
          }
        }catch(_eFast){ }

        try{
          var asset = await fetchKmsAsset(assetId);
          try{ sessionStorage.setItem(storagePrefix+':selected:row', JSON.stringify(asset)); }catch(_e0){ }
          try{ localStorage.setItem(storagePrefix+':selected:row', JSON.stringify(asset)); }catch(_e1){ }
          try{ persistCurrentSystemFields(storagePrefix, asset); }catch(_ePersist2){ }
          try{
            if(window.BlossomTab01Hardware && typeof window.BlossomTab01Hardware.refreshSystemRow === 'function'){
              window.BlossomTab01Hardware.refreshSystemRow();
            }
          }catch(_eRefresh2){ }
          renderBasicInfo(asset, assetId);
        }catch(err){
          try{ console.error('[kms detail] fetch failed', err); }catch(_){ }
          var fallback = readSelectedRow();
          if(fallback){
            renderBasicInfo(fallback, assetId);
          } else {
            setText('#page-title', 'KMS');
            setText('#page-subtitle', '상세 정보를 불러올 수 없습니다.');
          }
        }
      }

      bootstrap();
    })();
    // IDs and labels for the edit modal
    var EDIT_MODAL_ID = 'system-edit-modal';
    var EDIT_FORM_ID = 'system-edit-form';
    var EDIT_OPEN_ID = 'detail-edit-open';
    var EDIT_CLOSE_ID = 'system-edit-close';
    var EDIT_SAVE_ID = 'system-edit-save';

    function getCurrentAssetId(){
      try{
        if(window.BlossomAssetContext && typeof window.BlossomAssetContext.getAssetId === 'function'){
          var id = window.BlossomAssetContext.getAssetId();
          if(id) return id;
        }
      }catch(_e0){ }
      try{
        var qs = new URLSearchParams(location.search||'');
        var cand = qs.get('asset_id') || qs.get('assetId') || qs.get('id');
        var nn = parseInt(cand, 10);
        if(!isNaN(nn) && nn > 0) return nn;
      }catch(_e1){ }
      return null;
    }

    async function putKmsAsset(assetId, payload){
      var r = await fetch('/api/hardware/security/kms/assets/' + encodeURIComponent(String(assetId)), {
        method: 'PUT',
        headers: { 'Content-Type':'application/json', 'Accept':'application/json' },
        body: JSON.stringify(payload || {})
      });
      var j = await r.json().catch(function(){ return null; });
      if(!r.ok || !(j && j.success)){
        var msg = (j && (j.message || j.error)) ? (j.message || j.error) : ('HTTP ' + r.status);
        throw new Error(msg);
      }
      return j.item;
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
      var selectedRowData = null;
      try{
        var storagePrefix = (typeof STORAGE_PREFIX !== 'undefined' && STORAGE_PREFIX) ? STORAGE_PREFIX : 'kms';
        var raw = sessionStorage.getItem(storagePrefix+':selected:row') || localStorage.getItem(storagePrefix+':selected:row');
        if(raw){
          var selectedRow = JSON.parse(raw);
          function norm(v){ return (v==null? '' : String(v)).trim(); }
          function pick(obj, keys){
            for(var i=0;i<keys.length;i++){
              var k = keys[i];
              var v = obj ? obj[k] : null;
              var s = norm(v);
              if(s) return s;
            }
            return '';
          }
          function toOX(v){
            if(v==null) return '';
            if(v===true) return 'O';
            if(v===false) return 'X';
            var s = norm(v);
            if(!s) return '';
            if(s==='1' || s.toUpperCase()==='Y' || s==='O') return 'O';
            if(s==='0' || s.toUpperCase()==='N' || s==='X') return 'X';
            return s;
          }
          function toCoreFlag(v){
            if(v==null) return '';
            if(v===true) return '핵심';
            if(v===false) return '일반';
            var s = norm(v);
            if(!s) return '';
            if(s==='1' || s.toUpperCase()==='Y') return '핵심';
            if(s==='0' || s.toUpperCase()==='N') return '일반';
            if(s==='핵심' || s==='일반') return s;
            return s;
          }

          // Prefer canonical API keys (e.g. *_code, manufacturer_code, server_code, mgmt_ip)
          selectedRowData = {
            work_type: pick(selectedRow, ['work_type','work_type_code','work_category_code','category_code']),
            work_category: pick(selectedRow, ['work_category','work_category_code','work_division_code','division_code']),
            work_status: pick(selectedRow, ['work_status','work_status_code','status_code']),
            work_operation: pick(selectedRow, ['work_operation','work_operation_code','operation_code']),
            work_group: pick(selectedRow, ['work_group','work_group_code','group_code']),
            work_name: pick(selectedRow, ['work_name']),
            system_name: pick(selectedRow, ['system_name']),
            system_ip: pick(selectedRow, ['system_ip']),
            manage_ip: pick(selectedRow, ['manage_ip','mgmt_ip']),
            vendor: pick(selectedRow, ['vendor','manufacturer_code','vendor_code']),
            model: pick(selectedRow, ['model','server_code','security_code','model_code']),
            serial: pick(selectedRow, ['serial','serial_number']),
            virtualization: pick(selectedRow, ['virtualization','virtualization_type']),
            location_place: pick(selectedRow, ['location_place','center_code']),
            location_pos: pick(selectedRow, ['location_pos','rack_code']),
            slot: pick(selectedRow, ['slot']),
            u_size: pick(selectedRow, ['u_size']),
            sys_dept: pick(selectedRow, ['sys_dept','system_dept_code']),
            sys_owner: pick(selectedRow, ['sys_owner','system_owner_emp_no']),
            svc_dept: pick(selectedRow, ['svc_dept','service_dept_code']),
            svc_owner: pick(selectedRow, ['svc_owner','service_owner_emp_no']),
            confidentiality: pick(selectedRow, ['confidentiality','cia_confidentiality']),
            integrity: pick(selectedRow, ['integrity','cia_integrity']),
            availability: pick(selectedRow, ['availability','cia_availability']),
            security_score: pick(selectedRow, ['security_score']),
            system_grade: pick(selectedRow, ['system_grade']),
            core_flag: toCoreFlag(pick(selectedRow, ['core_flag','is_core_system'])),
            dr_built: toOX(pick(selectedRow, ['dr_built','has_dr_site'])),
            svc_redundancy: toOX(pick(selectedRow, ['svc_redundancy','has_service_ha'])),
          };

          // Remove empty keys to keep fallbacks working per-field
          Object.keys(selectedRowData).forEach(function(k){ if(!norm(selectedRowData[k])) delete selectedRowData[k]; });
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
          virtualization:['','물리','가상'],
          confidentiality:['','1','2','3'], integrity:['','1','2','3'], availability:['','1','2','3'],
          system_grade:['','1등급','2등급','3등급'], core_flag:['','핵심','일반'], dr_built:['','O','X'], svc_redundancy:['','O','X']
        };
        var required = (col==='work_status' || col==='work_name' || col==='system_name');
        if(col==='security_score'){
          var sv = (value == null || String(value).trim() === '-' ? '' : String(value).trim());
          return '<input name="security_score" class="form-input" type="number" readonly placeholder="자동 합계" value="'+sv+'">';
        }
        if(opts[col]){
          var isCIA = (['confidentiality','integrity','availability'].indexOf(col) > -1);
          return '<select name="'+col+'" class="form-input search-select '+(isCIA?'score-trigger':'')+'" data-searchable="true" data-placeholder="선택" '+(required?'required':'')+'>'+
            opts[col].map(function(o){ return '<option value="'+o+'" '+(String(o)===String(value)?'selected':'')+'>'+(o||'-')+'</option>'; }).join('')+
          '</select>';
        }
        if(col==='rack_face'){
            var selF=(value||'').toUpperCase()==='REAR'||value==='후면'?'':' selected';
            var selR=(value||'').toUpperCase()==='REAR'||value==='후면'?' selected':'';
            return '<select name="rack_face" class="form-input search-select" data-searchable="true" data-placeholder="선택"><option value="">선택</option><option value="FRONT"'+selF+'>전면</option><option value="REAR"'+selR+'>후면</option></select>';
        }
        if(['slot','u_size'].indexOf(col)>-1) return '<input name="'+col+'" type="number" min="0" step="1" class="form-input" value="'+(value||'')+'">';
        // Allow FK enhancer to convert model into dependent searchable select on hardware pages.
        if(col==='model') return '<input name="'+col+'" class="form-input" data-fk-allow="1" placeholder="모델 선택" '+(required?'required':'')+' value="'+(value||'')+'">';
        return '<input name="'+col+'" class="form-input" '+(required?'required':'')+' value="'+(value||'')+'">';
      }
      var html = GROUPS.map(function(g){
        var grid = g.cols.map(function(c){
          var meta=COLUMN_META[c]||{label:c};
          var isReq = (c==='work_status' || c==='work_name' || c==='system_name');
          var label = (c==='security_score'?'보안 점수':meta.label) + (isReq ? '<span class="required">*</span>' : '');
          return '<div class="form-row"><label>'+label+'</label>'+ fieldInput(c, data[c]) +'</div>';
        }).join('');
        return '<div class="form-section"><div class="section-header"><h4>'+g.title+'</h4></div><div class="form-grid">'+grid+'</div></div>';
      }).join('');
      form.innerHTML = html;
      attachSecurityScoreRecalc(EDIT_FORM_ID);
      attachVirtualizationHandler(EDIT_FORM_ID);

      // Enhance modal inputs into searchable FK selects (vendor/model, location, owners, work fields, ...)
      try{
        var modalRoot = document.getElementById(EDIT_MODAL_ID);
        if(window.BlossomFkSelect && typeof window.BlossomFkSelect.enhance === 'function' && modalRoot){
          window.BlossomFkSelect.enhance(modalRoot);
        } else if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function'){
          window.BlossomSearchableSelect.enhance(modalRoot || form);
          if(typeof window.BlossomSearchableSelect.syncAll === 'function') window.BlossomSearchableSelect.syncAll(modalRoot || form);
        }
      }catch(_e2){ }
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
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(9) .info-value', (v('rack_face') === 'REAR') ? '후면' : '전면');
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(1) .info-value', v('sys_dept'));
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(2) .info-value', v('sys_owner'));
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(3) .info-value', v('svc_dept'));
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(4) .info-value', v('svc_owner'));
      function setNumBadge(sel, num, mode){
        var badge=document.querySelector(sel);
        if(!badge) return;
        var valStr = String(num || '').trim();
        if(!valStr) valStr = '-';
        badge.textContent = valStr;
        badge.classList.remove('tone-1','tone-2','tone-3');
        if(valStr === '-') return;
        var n = parseInt(valStr, 10);
        if(isNaN(n)) return;
        var tone = 'tone-1';
        if(mode === 'security_score'){
          tone = (n >= 8) ? 'tone-3' : (n >= 6 ? 'tone-2' : 'tone-1');
        } else {
          tone = (n >= 3) ? 'tone-3' : (n === 2 ? 'tone-2' : 'tone-1');
        }
        badge.classList.add(tone);
      }
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(1) .num-badge', v('confidentiality'), 'cia');
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(2) .num-badge', v('integrity'), 'cia');
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(3) .num-badge', v('availability'), 'cia');
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(4) .num-badge', v('security_score'), 'security_score');
      setText('.basic-info-card:nth-child(4) .info-row:nth-child(5) .info-value', v('system_grade'));
      setText('.basic-info-card:nth-child(4) .info-row:nth-child(6) .info-value', v('core_flag'));
      function setOX(rowSel, name){
        // Keep identical behavior to HSM detail page
        var el=document.querySelector(rowSel+' .ox-badge'); if(!el) return;
        var val=String(v(name) || '').trim().toUpperCase();
        if(!(val==='O' || val==='X')) val='-';
        el.textContent = val;
        el.classList.remove('on','off','is-empty');
        if(val==='O') el.classList.add('on');
        else if(val==='X') el.classList.add('off');
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
        // Use VTL-specific keys to avoid cross-page contamination
        try{ localStorage.setItem(storagePrefix+':current:vendor', String(vendorVal||'')); }catch(_e0){ }
        try{ localStorage.setItem(storagePrefix+':current:model',  String(modelVal||'')); }catch(_e1){ }
        try{ localStorage.setItem(storagePrefix+':current:serial', String(serialVal||'')); }catch(_e2){ }
        try{ localStorage.setItem(storagePrefix+':current:slot',   String(slotVal||'')); }catch(_e3){ }
        try{ localStorage.setItem(storagePrefix+':current:u_size', String(uSizeVal||''));
 localStorage.setItem(storagePrefix + ':current:rack_face', String(pick(item, ['rack_face']) || '')); }catch(_e4){ }
        // Back-compat keys
        try{ localStorage.setItem('kms:current:vendor', String(vendorVal||'')); }catch(_e5){ }
        try{ localStorage.setItem('kms:current:model',  String(modelVal||'')); }catch(_e6){ }
        try{ localStorage.setItem('kms:current:serial', String(serialVal||'')); }catch(_e7){ }
        try{ localStorage.setItem('kms:current:slot',   String(slotVal||'')); }catch(_e8){ }
        try{ localStorage.setItem('kms:current:u_size', String(uSizeVal||'')); }catch(_e9){ }
      }catch(_){ }
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
      function normStr(v){ return (v==null?'':String(v)).trim(); }
      function getFieldEl(form, name){ return form ? form.querySelector('[name="'+name+'"]') : null; }
      function getFieldValue(form, name){ var el=getFieldEl(form,name); return el ? normStr(el.value) : ''; }
      function isEmptyRequiredValue(v){ var s=normStr(v); if(!s) return true; return s==='-' || s==='—' || s==='선택' || s==='부서 선택' || s==='부서를 먼저 선택' || s==='장소를 먼저 선택' || s==='제조사를 먼저 선택'; }
      function coerceIntOrNull(v){ var s=normStr(v); if(!s) return null; var n=parseInt(s,10); return isNaN(n)? null : n; }
      function fetchKmsAssetAfterSave(assetId){
        return fetch('/api/hardware/security/kms/assets/' + encodeURIComponent(String(assetId)), { method:'GET', headers:{'Accept':'application/json'} })
          .then(function(r){
            return r.json().catch(function(){ return null; }).then(function(j){
              if(!r.ok) throw new Error((j && (j.message || j.error)) ? (j.message || j.error) : ('HTTP ' + r.status));
              if(!(j && j.success && j.item)) throw new Error('Invalid response');
              return j.item;
            });
          });
      }
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
      var NUMERIC_PAYLOAD_KEYS = new Set(['cia_confidentiality','cia_integrity','cia_availability','security_score','system_slot','system_size']);
      var FK_CLEAR_ON_EMPTY_KEYS = new Set([
        'work_type','work_category','work_operation','work_group',
        'virtualization_type',
        'center_code','rack_code',
        'vendor','model',
        'system_slot','system_size',
        'system_department','system_owner','service_department','service_owner'
      ]);

      function getStoragePrefixForSave(){
        try{ return (typeof STORAGE_PREFIX !== 'undefined' && STORAGE_PREFIX) ? STORAGE_PREFIX : 'kms'; }
        catch(_){ return 'kms'; }
      }
      function readSelectedRowForSave(){
        var prefix = getStoragePrefixForSave();
        try{
          var raw = sessionStorage.getItem(prefix+':selected:row') || localStorage.getItem(prefix+':selected:row');
          if(!raw){ raw = sessionStorage.getItem('kms:selected:row') || localStorage.getItem('kms:selected:row'); }
          if(!raw) return null;
          return JSON.parse(raw);
        }catch(_){ return null; }
      }

      function collectFormSanitized(form){
        var out = {};
        if(!form) return out;
        var els = Array.from(form.querySelectorAll('input,select,textarea'));
        els.forEach(function(el){
          if(!el.name) return;
          if(el.disabled) return;
          var v = (el.value == null) ? '' : String(el.value);
          if(v.trim() === '-') v = '';
          if(el.tagName === 'SELECT' && v === ''){
            out[el.name] = null; // explicit clear
            return;
          }
          out[el.name] = v;
        });
        return out;
      }

      function buildUpdatePayload(form){
        var formData = collectFormSanitized(form);
        var payload = {};
        Object.keys(FIELD_TO_PAYLOAD_KEY).forEach(function(field){
          var payloadKey = FIELD_TO_PAYLOAD_KEY[field];
          if(!(field in formData)) return;
          var raw = formData[field];
          if(raw === undefined) return;
          if(raw === null){
            payload[payloadKey] = null;
            return;
          }
          var s = String(raw).trim();
          if(s === ''){
            // When FK enhancer is not applied, FK-like fields may remain as plain inputs.
            // If the user clears them, send explicit null so backend clears previous values.
            if(payloadKey === 'security_score' || FK_CLEAR_ON_EMPTY_KEYS.has(payloadKey)){
              payload[payloadKey] = null;
            }
            return;
          }
          if(NUMERIC_PAYLOAD_KEYS.has(payloadKey)){
            var n = parseInt(s, 10);
            if(isNaN(n)) return;
            payload[payloadKey] = n;
            return;
          }
          payload[payloadKey] = s;
        });

        // Cascade clear rules (match SAN Director baseline)
        if(Object.prototype.hasOwnProperty.call(payload, 'center_code') && payload.center_code === null){
          payload.rack_code = null;
        }
        if(Object.prototype.hasOwnProperty.call(payload, 'vendor') && payload.vendor === null){
          payload.model = null;
        }
        if(Object.prototype.hasOwnProperty.call(payload, 'system_department') && payload.system_department === null){
          payload.system_owner = null;
        }
        if(Object.prototype.hasOwnProperty.call(payload, 'service_department') && payload.service_department === null){
          payload.service_owner = null;
        }

        // Keep existing code/name to avoid accidental blanks
        var stored = readSelectedRowForSave();
        if(stored){
          if(stored.asset_code) payload.asset_code = stored.asset_code;
          if(stored.asset_name) payload.asset_name = stored.asset_name;
        }
        return payload;
      }

      async function handleSaveClick(){
        // Tab31 basic-storage: keep legacy behavior (no API)
        if(document.getElementById('bs-physical-total')){
          updatePageFromForm();
          closeModalLocal(EDIT_MODAL_ID);
          return;
        }

        var form = document.getElementById(EDIT_FORM_ID);
        if(!form) return;
        var assetId = getCurrentAssetId();
        if(!assetId){
          alert('대상 자산 ID를 찾을 수 없습니다. 목록에서 다시 선택해 주세요.');
          return;
        }

        // Front validation (backend also enforces)
        var req = [
          { name:'work_status', label:'업무 상태' },
          { name:'work_name', label:'업무 이름' },
          { name:'system_name', label:'시스템 이름' }
        ];
        for(var i=0;i<req.length;i++){
          var r = req[i];
          var v = getFieldValue(form, r.name);
          if(isEmptyRequiredValue(v)){
            alert(r.label + '은(는) 필수입니다.');
            var el = getFieldEl(form, r.name);
            try{ if(el && typeof el.focus === 'function') el.focus(); }catch(_eF){ }
            return;
          }
        }

        var payload = buildUpdatePayload(form);

        var oldText = saveBtn ? saveBtn.textContent : '';
        try{
          if(saveBtn){ saveBtn.disabled = true; saveBtn.textContent = '저장 중...'; }
          await putKmsAsset(assetId, payload);

          var latest = null;
          try{ latest = await fetchKmsAssetAfterSave(assetId); }catch(_eGet){ latest = null; }
          var item = latest || payload;

          // Persist selected row for cross-tab usage
          try{
            var storagePrefix = (typeof STORAGE_PREFIX !== 'undefined' && STORAGE_PREFIX) ? STORAGE_PREFIX : 'kms';
            sessionStorage.setItem(storagePrefix+':selected:asset_id', String(assetId));
            localStorage.setItem(storagePrefix+':selected:asset_id', String(assetId));
            if(latest){
              sessionStorage.setItem(storagePrefix+':selected:row', JSON.stringify(latest));
              localStorage.setItem(storagePrefix+':selected:row', JSON.stringify(latest));
            }
          }catch(_eStore){ }

          // Update the page (prefer full server item so labels render)
          try{
            if(window.BlossomKmsDetail && typeof window.BlossomKmsDetail.renderBasicInfo === 'function'){
              window.BlossomKmsDetail.renderBasicInfo(latest || item, assetId);
            }
          }catch(_eRender){ }

          closeModalLocal(EDIT_MODAL_ID);
        }catch(err){
          try{ console.error('[kms detail] save failed', err); }catch(_){ }
          alert('저장 실패: ' + (err && err.message ? err.message : String(err||'')));
        }finally{
          if(saveBtn){ saveBtn.disabled = false; saveBtn.textContent = oldText || '저장'; }
        }
      }

      if(saveBtn){ saveBtn.addEventListener('click', function(){ handleSaveClick(); }); }
    })();

      // [Tabs moved to /static/js/_detail/tab*.js]


      // [Tabs moved to /static/js/_detail/tab*.js]

      // Hardware tab (tab01-hardware) local fallback logic.
      // Guard: this detail script is loaded on multiple tabs, so only run when the HW table exists.
      var table = document.getElementById('hw-spec-table');
      if(table){
  		if(!(window.BlossomTab01Hardware && window.BlossomTab01Hardware.handlesTable)){

      // Add row
      var addBtn = document.getElementById('hw-row-add');
      if(addBtn){
        addBtn.addEventListener('click', function(){
          var tbody = (typeof table !== 'undefined' && table && table.querySelector) ? table.querySelector('tbody') : null; if(!tbody) return;
          var tr = document.createElement('tr');

          if(isInventorySchema){
            var invOpts = invTypeOptions;
            var invSpecCell = hasSpecCol ? '<td data-col="spec"><input type="text" placeholder="(자동)" disabled></td>' : '';
            tr.innerHTML = `
              <td><input type="checkbox" class="hw-row-check" aria-label="행 선택"></td>
              <td data-col="type">
                <select class="search-select" data-searchable-scope="page">
                  <option value="" selected disabled>유형 선택 (필수)</option>
                  ${invOpts.map(function(o){ return '<option value="'+o+'">'+o+'</option>'; }).join('')}
                </select>
              </td>
              <td data-col="model"><input type="text" placeholder="모델명 (필수)"></td>
              ${invSpecCell}
              <td data-col="vendor"><input type="text" placeholder="(자동)" disabled></td>
              <td data-col="qty"><input type="number" min="1" step="1" value="1" placeholder="수량 (필수)"></td>
              <td data-col="fw"><input type="text" placeholder="펌웨어"></td>
              <td data-col="remark"><input type="text" placeholder="비고"></td>
              <td class="system-actions table-actions">
                <button class="action-btn js-hw-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button>
                <button class="action-btn danger js-hw-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>
              </td>`;
          } else {
            tr.innerHTML = `
              <td><input type="checkbox" class="hw-row-check" aria-label="행 선택"></td>
              <td data-col="type">
                <select>
                  <option value="" selected disabled>유형 선택 (필수)</option>
                  ${typeOptions.map(function(o){ return '<option value="'+o+'">'+o+'</option>'; }).join('')}
                </select>
              </td>
              <td data-col="space">
                <select>
                  <option value="" selected disabled>공간 선택 (필수)</option>
                  ${bayOptions}
                </select>
              </td>
              <td data-col="model"><input type="text" placeholder="모델명 (필수)"></td>
              ${hasSpecCol? '<td data-col="spec"><input type="text" placeholder="용량"></td>': ''}
              <td data-col="serial"><input type="text" placeholder="일련번호"></td>
              <td data-col="vendor"><input type="text" placeholder="제조사"></td>
              <td data-col="fw"><input type="text" placeholder="펌웨어"></td>
              <td data-col="remark"><input type="text" placeholder="비고"></td>
              <td class="system-actions table-actions">
                <button class="action-btn js-hw-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button>
                <button class="action-btn danger js-hw-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>
              </td>`;
          }
          tbody.appendChild(tr);
          if(isInventorySchema){
            try{ if(window.BlossomHwInventoryCatalog && !isSystemRow(tr)) window.BlossomHwInventoryCatalog.enhanceRow(tr); }catch(_){ }
          }
          // jump to last page to show the newly added row
          try{ hwGoLast(); }catch(_){ }
          updateEmptyState();
        });
      }

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
            try{ if(window.BlossomHwInventoryCatalog && !isSystemRow(tr)) window.BlossomHwInventoryCatalog.enhanceRow(tr); }catch(_){ }

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
              var opts = isInventorySchema ? invTypeOptions : typeOptions;
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
            if(name==='qty'){
              if(isSystemRow(tr)) return;
              var n = parseInt(current, 10);
              if(isNaN(n) || n < 1) n = 1;
              td.innerHTML = '<input type="number" min="1" step="1" value="'+n+'" placeholder="수량 (필수)">';
              return;
            }
            if(isSystemRow(tr) && (name==='model' || name==='vendor' || name==='serial' || name==='spec')){
              // 시스템 행의 모델/제조사/일련번호는 기본정보에서만 갱신; 편집 입력 금지
              return;
            }
            td.innerHTML = '<input type="text" value="'+current+'" placeholder="'+(placeholder||'')+'">';
          }
          var editCols = isInventorySchema
            ? (['type','model'].concat(hasSpecCol? ['spec'] : []).concat(['vendor','qty','fw','remark']))
            : (['type','space','model'].concat(hasSpecCol? ['spec'] : []).concat(['serial','vendor','fw','remark']));
          editCols.forEach(function(n){ toInput(n); });
          // swap toggle button to save state
          var toggleBtn = tr.querySelector('.js-hw-toggle');
          if(toggleBtn){
            toggleBtn.setAttribute('data-action', 'save');
            toggleBtn.title = '저장'; toggleBtn.setAttribute('aria-label','저장');
            toggleBtn.innerHTML = '<img src="/static/image/svg/save.svg" alt="저장" class="action-icon">';
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
          // Validation: model/type required; space required for bay schema; qty required for inventory schema
          function getInput(name){
            var td = tr.querySelector('[data-col="'+name+'"]'); if(!td) return null;
            return td.querySelector('input, textarea');
          }
          function setError(input, on){
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
          var spaceVal = '';
          var qtyNum = null;
          if(isInventorySchema){
            var qtyInput = getInput('qty');
            var qtyRaw = (qtyInput? qtyInput.value : (tr.querySelector('[data-col="qty"]').textContent||'')).trim();
            var q = parseInt(qtyRaw, 10);
            if(isSystemRow(tr)) q = 1;
            if(!qtyRaw || isNaN(q) || q < 1){ setError(qtyInput, true); if(!firstInvalid) firstInvalid = qtyInput; }
            else { setError(qtyInput, false); qtyNum = q; }
          } else {
            // 공간(space) required for non-system rows
            var spaceInput = getInput('space') || (function(){ var td = tr.querySelector('[data-col="space"]'); return td? td.querySelector('select'): null; })();
            spaceVal = (spaceInput? spaceInput.value : (tr.querySelector('[data-col="space"]').textContent||'')).trim();
            if(isSystemRow(tr)) spaceVal = '-';
            if(!spaceVal){ setError(spaceInput, true); if(!firstInvalid) firstInvalid = spaceInput; } else { setError(spaceInput, false); }
          }
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
            commit('model', d.model);
            if(hasSpecCol) commit('spec', '-');
            commit('vendor', d.vendor);
            if(isInventorySchema){
              commit('qty', 1);
            } else {
              commit('space', '-');
              commit('serial', d.serial);
            }
          } else {
            commit('type', typeVal);
            commit('model', modelVal); // required, already validated non-empty
            if(hasSpecCol) commit('spec', read('spec'));
            if(isInventorySchema){
              commit('vendor', read('vendor'));
              commit('qty', qtyNum);
            } else {
              commit('space', spaceVal);
              commit('serial', read('serial'));
              commit('vendor', read('vendor'));
            }
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
        var headers = isInventorySchema
          ? (hasSpecCol ? ['유형','모델명','용량','제조사','수량','펌웨어','비고'] : ['유형','모델명','제조사','수량','펌웨어','비고'])
          : (hasSpecCol ? ['유형','공간','모델명','용량','일련번호','제조사','펌웨어','비고'] : ['유형','공간','모델명','일련번호','제조사','펌웨어','비고']);
        // Use only rows that are visible and saved (exclude inline-editing rows)
        var trs = hwSavedVisibleRows();
        if(onlySelected){ trs = trs.filter(function(tr){ var cb = tr.querySelector('.hw-row-check'); return cb && cb.checked; }); }
        if(trs.length===0) return;
        function text(tr, col){ var td=tr.querySelector('[data-col="'+col+'"]'); return td? (td.textContent||'').trim() : ''; }
        var baseCols = isInventorySchema
          ? (['type','model'].concat(hasSpecCol? ['spec'] : []).concat(['vendor','qty','fw','remark']))
          : (['type','space','model'].concat(hasSpecCol? ['spec'] : []).concat(['serial','vendor','fw','remark']));
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

  		}

      }
  });
})();


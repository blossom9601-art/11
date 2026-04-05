/*
// onpremise_detail.js: On-premise Server Detail page behaviors (modal removed)

(function(){
  // Early: apply saved sidebar state to prevent flash
  try {
    document.documentElement.classList.add('sidebar-preload');
      // Use L7-specific keys to avoid cross-page contamination
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
    // ---------- L7 asset context (READ/UPDATE via API) ----------
    var L7_ASSET_API_BASE = '/api/hardware/network/l7/assets';
    var L7_CURRENT_ASSET_ID = null;
    var L7_CURRENT_ASSET = null;
    var L7_ASSET_LOADING = null;

    // L7 detail: suppress UI toasts (per request). Keep console logs for debugging.
    function l7Toast(message, type){
      try{
        var msg = String(message || '');
        if(!msg) return;
        if(type === 'success') console.info(msg);
        else console.warn(msg);
      }catch(_){ }
    }

    function l7Norm(v){ return (v == null ? '' : String(v)).trim(); }
    function l7NumOrNull(v){
      var s = l7Norm(v);
      if(!s) return null;
      var n = parseInt(s, 10);
      return isNaN(n) ? null : n;
    }
    function l7Pick(item, keys){
      try{
        if(!item) return '';
        for(var i=0;i<keys.length;i++){
          var k = keys[i];
          if(k && item[k] != null){
            var v = l7Norm(item[k]);
            if(v) return v;
          }
        }
      }catch(_){ }
      return '';
    }

    function l7GetAssetIdFromLocation(){
      try{
        var params = new URLSearchParams(window.location.search || '');
        var v = params.get('asset_id') || params.get('assetId') || params.get('id');
        v = l7Norm(v);
        if(!v) return null;
        var n = parseInt(v, 10);
        return isNaN(n) ? null : n;
      }catch(_){
        return null;
      }
    }

    function l7GetAssetIdFromStorage(){
      try{
        var v = sessionStorage.getItem('l7:selected:asset_id') || localStorage.getItem('l7:selected:asset_id');
        v = l7Norm(v);
        if(!v) return null;
        var n = parseInt(v, 10);
        return isNaN(n) ? null : n;
      }catch(_){
        return null;
      }
    }

    function l7RememberAssetId(assetId){
      if(assetId == null) return;
      try{ sessionStorage.setItem('l7:selected:asset_id', String(assetId)); }catch(_){ }
      try{ localStorage.setItem('l7:selected:asset_id', String(assetId)); }catch(_2){ }
    }

    function l7StripAssetIdFromUrl(){
      try{
        var u = new URL(window.location.href);
        var changed = false;
        ['asset_id','assetId','id'].forEach(function(k){
          try{
            if(u.searchParams.has(k)){
              u.searchParams.delete(k);
              changed = true;
            }
          }catch(_e){ }
        });
        if(!changed) return;
        var next = u.pathname + (u.search ? u.search : '') + (u.hash || '');
        window.history.replaceState(null, document.title, next);
      }catch(_e2){ }
    }

    async function l7FetchJson(url, opts){
      var res = await fetch(url, opts || { method: 'GET', headers: { Accept: 'application/json' } });
      var data = null;
      try{ data = await res.json(); }catch(_){ data = null; }
      return { ok: !!res.ok, status: res.status, data: data };
    }

    function l7AssetToFormData(item){
      if(!item) return null;
      function codeOrValue(keys){ return l7Pick(item, keys); }
      function ox(v){
        var s = l7Norm(v);
        if(!s) return '';
        var u = s.toUpperCase();
        if(u === 'O' || u === 'X') return u;
        if(u === 'Y' || u === 'YES' || u === 'TRUE' || u === '1') return 'O';
        if(u === 'N' || u === 'NO' || u === 'FALSE' || u === '0') return 'X';
        return s;
      }
      function oxFromFlag(flag){
        try{
          if(flag == null) return '';
          if(flag === true) return 'O';
          if(flag === false) return 'X';
          var n = parseInt(String(flag), 10);
          if(!isNaN(n)) return n ? 'O' : 'X';
          return ox(flag);
        }catch(_){
          return '';
        }
      }
      function coreFromFlag(flag){
        try{
          if(flag == null) return '';
          if(flag === true) return '핵심';
          if(flag === false) return '일반';
          var n = parseInt(String(flag), 10);
          if(!isNaN(n)) return n ? '핵심' : '일반';
          var s = l7Norm(flag);
          if(s === '핵심' || s === '일반') return s;
          return '';
        }catch(_){
          return '';
        }
      }
      return {
        work_status: codeOrValue(['work_status_code','work_status']),
        work_type: codeOrValue(['work_type_code','work_category_code','work_type']),
        work_category: codeOrValue(['work_category_code','work_division_code','work_category']),
        work_operation: codeOrValue(['work_operation_code','operation_code','work_operation']),
        work_group: codeOrValue(['work_group_code','group_code','work_group']),
        work_name: codeOrValue(['work_name']),
        system_name: codeOrValue(['system_name']),
        system_ip: codeOrValue(['system_ip']),
        manage_ip: codeOrValue(['mgmt_ip','manage_ip']),
        vendor: codeOrValue(['manufacturer_code','vendor']),
        model: codeOrValue(['server_code','network_code','model']),
        serial: codeOrValue(['serial_number','serial']),
        virtualization: codeOrValue(['virtualization_type','virtualization']),
        location_place: codeOrValue(['center_code','location_place']),
        location_pos: codeOrValue(['rack_code','location_pos']),
        slot: codeOrValue(['slot','system_slot']),
        u_size: codeOrValue(['u_size','system_size']),
        rack_face: codeOrValue(['rack_face']),
        sys_dept: codeOrValue(['system_dept_code','sys_dept_code','sys_dept']),
        sys_owner: codeOrValue(['system_owner_emp_no','sys_owner_emp_no','sys_owner']),
        svc_dept: codeOrValue(['service_dept_code','svc_dept_code','svc_dept']),
        svc_owner: codeOrValue(['service_owner_emp_no','svc_owner_emp_no','svc_owner']),
        confidentiality: codeOrValue(['cia_confidentiality','confidentiality']),
        integrity: codeOrValue(['cia_integrity','integrity']),
        availability: codeOrValue(['cia_availability','availability']),
        security_score: codeOrValue(['security_score']),
        system_grade: codeOrValue(['system_grade']),
        core_flag: codeOrValue(['core_flag']) || coreFromFlag(item.is_core_system),
        dr_built: ox(codeOrValue(['dr_built'])) || oxFromFlag(item.has_dr_site),
        svc_redundancy: ox(codeOrValue(['svc_redundancy'])) || oxFromFlag(item.has_service_ha)
      };
    }

    function l7RenderHeaderFromAsset(item){
      var title = l7Pick(item, ['work_name']) || '-';
      var sub = l7Pick(item, ['system_name']) || '-';
      var headerTitle = document.getElementById('page-title') || document.querySelector('.page-header h1');
      var headerSubtitle = document.getElementById('page-subtitle') || document.querySelector('.page-header p');
      if(headerTitle) headerTitle.textContent = String(title);
      if(headerSubtitle) headerSubtitle.textContent = String(sub);
    }

    function l7RenderBasicInfoFromAsset(item){
      // Only render if the basic-info grid exists on this page.
      if(!document.querySelector('.basic-info-grid')) return;

      function setText(sel, val){ var el=document.querySelector(sel); if(el) el.textContent = String(val || '-'); }
      function setTextAllowEmpty(sel, val){
        var el = document.querySelector(sel);
        if(!el) return;
        if(val == null) el.textContent = '-';
        else {
          var s = String(val);
          el.textContent = s.trim() === '' ? '-' : s;
        }
      }
      function setBadge(sel, val){ var el=document.querySelector(sel); if(el) el.textContent = String(val || '-'); }
      function setNumBadge(sel, num){
        var badge=document.querySelector(sel);
        if(!badge) return;
        var raw = (num == null ? '' : String(num));
        badge.textContent = raw ? raw : '-';
        try{
          badge.classList.remove('tone-1','tone-2','tone-3');
          var n=parseInt(raw,10);
          if(!isNaN(n)) badge.classList.add(n>=3?'tone-3':(n===2?'tone-2':'tone-1'));
        }catch(_){ }
      }
      function setOXBadge(rowSel, val){
        var el=document.querySelector(rowSel+' .ox-badge');
        if(!el) return;
        var v = (val == null ? '' : String(val)).trim();
        if(!v){
          el.textContent = '-';
          try{
            el.classList.remove('on','off');
            el.setAttribute('aria-label', '');
          }catch(_0){ }
          return;
        }
        var isOn = (v === 'O' || v === 'Y' || v === '1' || v.toLowerCase() === 'true');
        var isOff = (v === 'X' || v === 'N' || v === '0' || v.toLowerCase() === 'false');
        var out = isOff ? 'X' : (isOn ? 'O' : v);
        el.textContent = out;
        try{
          el.classList.remove('on','off');
          el.classList.add(out === 'O' ? 'on' : 'off');
          el.setAttribute('aria-label', out === 'O' ? '예' : '아니오');
        }catch(_){ }
      }

      // Work status
      var wsName = l7Pick(item, ['work_status_name','work_status']) || '-';
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill .status-text', wsName);
      try{
        var pill = document.querySelector('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill');
        if(pill){
          var dot = pill.querySelector('.status-dot');
          if(dot){
            dot.classList.remove('ws-run','ws-idle','ws-wait');
            var cls = l7Pick(item, ['work_status_color']);
            if(!cls){ cls = (wsName==='가동'?'ws-run': (wsName==='유휴'?'ws-idle':'ws-wait')); }
            dot.classList.add(cls);
          }
        }
      }catch(_){ }

      // Business
      setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(2) .info-value', l7Pick(item, ['work_type_name','work_type']) || '-');
      setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(3) .info-value', l7Pick(item, ['work_category_name','work_division_name','work_category']) || '-');
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(4) .info-value', l7Pick(item, ['work_operation_name','work_operation']) || '-');
      setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(5) .info-value', l7Pick(item, ['work_group_name','work_group']) || '-');
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(6) .info-value', l7Pick(item, ['work_name']) || '-');
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(7) .info-value', l7Pick(item, ['system_name']) || '-');
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(8) .info-value', l7Pick(item, ['system_ip']) || '-');
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(9) .info-value', l7Pick(item, ['mgmt_ip','manage_ip']) || '-');

      // System
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(1) .info-value', l7Pick(item, ['manufacturer_name','vendor']) || '-');
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(2) .info-value', l7Pick(item, ['server_model_name','model']) || '-');
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(3) .info-value', l7Pick(item, ['serial_number','serial']) || '-');
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(4) .info-value', l7Pick(item, ['virtualization_type','virtualization']) || '-');
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(5) .info-value', l7Pick(item, ['center_name','location_place']) || '-');
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(6) .info-value', l7Pick(item, ['rack_name','location_pos']) || '-');
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(7) .info-value', l7Pick(item, ['slot','system_slot']) || '-');
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(8) .info-value', l7Pick(item, ['u_size','system_size']) || '-');
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(9) .info-value', (item.rack_face === 'REAR') ? '후면' : '전면');

      // Owners
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(1) .info-value', l7Pick(item, ['system_dept_name','sys_dept_name','sys_dept']) || '-');
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(2) .info-value', l7Pick(item, ['system_owner_name','sys_owner_name','sys_owner']) || '-');
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(3) .info-value', l7Pick(item, ['service_dept_name','svc_dept_name','svc_dept']) || '-');
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(4) .info-value', l7Pick(item, ['service_owner_name','svc_owner_name','svc_owner']) || '-');

      // Inspection (match other detail pages: num badges + OX badges)
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(1) .num-badge', l7Pick(item, ['cia_confidentiality','confidentiality']) || '');
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(2) .num-badge', l7Pick(item, ['cia_integrity','integrity']) || '');
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(3) .num-badge', l7Pick(item, ['cia_availability','availability']) || '');
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(4) .num-badge', l7Pick(item, ['security_score']) || '');
      setText('.basic-info-card:nth-child(4) .info-row:nth-child(5) .info-value', l7Pick(item, ['system_grade']) || '-');
      (function(){
        var coreText = l7Pick(item, ['core_flag']);
        if(!coreText){
          if(item && item.is_core_system == null) coreText = '';
          else coreText = (parseInt(String(item && item.is_core_system || 0),10) ? '핵심' : '일반');
        }
        setTextAllowEmpty('.basic-info-card:nth-child(4) .info-row:nth-child(6) .info-value', coreText);
      })();
      setOXBadge('.basic-info-card:nth-child(4) .info-row:nth-child(7)', l7Pick(item, ['dr_built']) || (item && item.has_dr_site == null ? '' : (parseInt(String(item && item.has_dr_site || 0),10) ? 'O' : 'X')));
      setOXBadge('.basic-info-card:nth-child(4) .info-row:nth-child(8)', l7Pick(item, ['svc_redundancy']) || (item && item.has_service_ha == null ? '' : (parseInt(String(item && item.has_service_ha || 0),10) ? 'O' : 'X')));

      // Persist key display values for cross-tab usage (hardware tab system row)
      try{
        var vendorName = l7Pick(item, ['manufacturer_name']) || '';
        var modelName = l7Pick(item, ['server_model_name']) || '';
        var serialNo = l7Pick(item, ['serial_number','serial']) || '';
        localStorage.setItem('l7:current:vendor', String(vendorName));
        localStorage.setItem('l7:current:model', String(modelName));
        localStorage.setItem('l7:current:serial', String(serialNo));
        // Also store codes for forms/debug if needed
        localStorage.setItem('l7:current:vendor_code', String(l7Pick(item, ['manufacturer_code','vendor'])||''));
        localStorage.setItem('l7:current:model_code', String(l7Pick(item, ['server_code','network_code','model'])||''));
      }catch(_){ }
    }

    async function l7EnsureAssetLoaded(){
      if(L7_CURRENT_ASSET) return L7_CURRENT_ASSET;
      if(L7_ASSET_LOADING) return await L7_ASSET_LOADING;
      if(L7_CURRENT_ASSET_ID == null) return null;
      L7_ASSET_LOADING = (async function(){
        var url = L7_ASSET_API_BASE + '/' + encodeURIComponent(String(L7_CURRENT_ASSET_ID));
        var r = await l7FetchJson(url, { method: 'GET', headers: { Accept: 'application/json' } });
        if(!r.ok || !r.data || !r.data.success){
          var msg = (r.data && r.data.message) ? r.data.message : ('조회 실패(' + r.status + ')');
          l7Toast(msg, 'info');
          return null;
        }
        L7_CURRENT_ASSET = r.data.item || null;
        try{
          // Make available for other scripts that rely on selected row cache.
          sessionStorage.setItem('l7:selected:row', JSON.stringify(L7_CURRENT_ASSET));
          localStorage.setItem('l7:selected:row', JSON.stringify(L7_CURRENT_ASSET));
        }catch(_store){ }
        l7RenderHeaderFromAsset(L7_CURRENT_ASSET);
        l7RenderBasicInfoFromAsset(L7_CURRENT_ASSET);
        return L7_CURRENT_ASSET;
      })();
      var out = await L7_ASSET_LOADING;
      L7_ASSET_LOADING = null;
      return out;
    }

    (function initL7AssetContext(){
      L7_CURRENT_ASSET_ID = l7GetAssetIdFromLocation() || l7GetAssetIdFromStorage();
      if(L7_CURRENT_ASSET_ID != null){
        l7RememberAssetId(L7_CURRENT_ASSET_ID);
        l7StripAssetIdFromUrl();
        // Load + render (non-blocking)
        l7EnsureAssetLoaded();
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
      ['lg-page-size','hw-page-size','sw-page-size','bk-page-size','if-page-size','am-page-size','au-page-size','ac-page-size','fw-page-size','st-page-size','tk-page-size','vl-page-size','pk-page-size','mt-page-size','asg-page-size']
        .forEach(wireChosen);
    })();
    // IDs and labels for the edit modal
    var EDIT_MODAL_ID = 'system-edit-modal';
    var EDIT_FORM_ID = 'system-edit-form';
    var EDIT_OPEN_ID = 'detail-edit-open';
    var EDIT_CLOSE_ID = 'system-edit-close';
    var EDIT_SAVE_ID = 'system-edit-save';

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
        var storagePrefix = (typeof STORAGE_PREFIX !== 'undefined' && STORAGE_PREFIX) ? STORAGE_PREFIX : 'l7';
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
    // Prefer authoritative API-loaded values when available.
    var apiData = null;
    try{ apiData = l7AssetToFormData(L7_CURRENT_ASSET); }catch(_){ apiData = null; }
    var data = apiData || selectedRowData || {
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
      confidentiality: cia('.basic-info-card:nth-child(4) .info-row:nth-child(1) .info-value'),
      integrity: cia('.basic-info-card:nth-child(4) .info-row:nth-child(2) .info-value'),
      availability: cia('.basic-info-card:nth-child(4) .info-row:nth-child(3) .info-value'),
      security_score: cia('.basic-info-card:nth-child(4) .info-row:nth-child(4) .info-value'),
        system_grade: text('.basic-info-card:nth-child(4) .info-row:nth-child(5) .info-value'),
        core_flag: text('.basic-info-card:nth-child(4) .info-row:nth-child(6) .info-value'),
      dr_built: text('.basic-info-card:nth-child(4) .info-row:nth-child(7) .info-value'),
      svc_redundancy: text('.basic-info-card:nth-child(4) .info-row:nth-child(8) .info-value')
      };
      var GROUPS = [
        { title:'비즈니스', cols:['work_type','work_category','work_status','work_operation','work_group','work_name','system_name','system_ip','manage_ip'] },
        { title:'시스템', cols:['vendor','model','serial','virtualization','location_place','location_pos','slot','u_size','rack_face'] },
        { title:'담당자', cols:['sys_dept','sys_owner','svc_dept','svc_owner'] },
        { title:'점검', cols:['confidentiality','integrity','availability','security_score','system_grade','core_flag','dr_built','svc_redundancy'] }
      ];
      function fieldInput(col, value){
        function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
        function selectWithCurrent(colName, label, currentValue){
          var v = String(currentValue==null?'':currentValue);
          var ph = (label ? (label + ' 선택') : '선택');
          function fkLabel(colKey, codeVal){
            try{
              if(codeVal == null || String(codeVal).trim() === '') return '';
              var fallback = String(codeVal);
              var byNameKey = (data && data[colKey + '_name'] != null) ? String(data[colKey + '_name']).trim() : '';
              if(byNameKey) return byNameKey;
              var direct = (data && data[colKey] != null) ? String(data[colKey]).trim() : '';
              if(direct) return direct;
              return fallback;
            }catch(_e){
              return String(codeVal);
            }
          }
          var curLabel = fkLabel(colName, v);
          var currentOpt = v ? ('<option value="'+esc(v)+'" selected>'+esc(curLabel)+'</option>') : '';
          return '<select name="'+esc(colName)+'" class="form-input search-select" data-searchable="true">'
            + '<option value="">'+esc(ph)+'</option>'
            + currentOpt
            + '</select>';
        }

        var fkCols = ['work_status','work_type','work_category','work_operation','work_group','vendor','model','location_place','location_pos','sys_dept','sys_owner','svc_dept','svc_owner'];
        if(fkCols.indexOf(col) > -1){
          var meta = COLUMN_META[col] || { label: col };
          return selectWithCurrent(col, meta.label, value);
        }
        var opts={
          virtualization:['','물리','가상'],
          confidentiality:['','1','2','3'], integrity:['','1','2','3'], availability:['','1','2','3'],
          system_grade:['','1등급','2등급','3등급'], core_flag:['','핵심','일반'], dr_built:['','O','X'], svc_redundancy:['','O','X']
        };
        if(col==='security_score') return '<input name="security_score" class="form-input" type="number" readonly placeholder="자동 합계" value="'+(value||'')+'">';
        if(opts[col]){
          return '<select name="'+col+'" class="form-input search-select '+(['confidentiality','integrity','availability'].indexOf(col)>-1?'score-trigger':'')+'" data-searchable="true">'+
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
    }

    function attachSecurityScoreRecalc(formId){
      var form=document.getElementById(formId); if(!form) return;
      var scoreField=form.querySelector('[name="security_score"]'); if(!scoreField) return;
      function recompute(){
        var c=parseInt(form.querySelector('[name="confidentiality"]').value||'0',10)||0;
        var i=parseInt(form.querySelector('[name="integrity"]').value||'0',10)||0;
        var a=parseInt(form.querySelector('[name="availability"]').value||'0',10)||0;
        var total=c+i+a;
        var val = total ? String(total) : '';
        if(scoreField.tagName === 'SELECT'){
          // Keep a selectable option so the disabled searchable select displays properly.
          try{
            if(val){
              var found = Array.prototype.find.call(scoreField.options || [], function(o){ return String(o.value) === val; });
              if(!found){
                var opt = document.createElement('option');
                opt.value = val;
                opt.textContent = val;
                scoreField.appendChild(opt);
              }
            }
          }catch(_){ }
          scoreField.value = val;
          try{ if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){ window.BlossomSearchableSelect.syncAll(scoreField); } }catch(_sync){ }
        } else {
          scoreField.value = val;
        }
        var gradeField=form.querySelector('[name="system_grade"]'); if(gradeField){ if(total>=8) gradeField.value='1등급'; else if(total>=6) gradeField.value='2등급'; else if(total>0) gradeField.value='3등급'; }
      }
      ['confidentiality','integrity','availability'].forEach(function(n){ var el=form.querySelector('[name="'+n+'"]'); if(el) el.addEventListener('change',recompute); });
      recompute();
    }

    function enforceVirtualizationDash(form){
      if(!form) return; var virt=form.querySelector('[name="virtualization"]'); if(!virt) return;
      var v=String(virt.value||'').trim();
      var dashText=['vendor','model','serial','location_pos']; var dashNum=['slot','u_size','rack_face'];
      function setDash(el, name){
        if(!el) return;
        if(el.tagName === 'SELECT'){
          try{
            el.value = '';
            el.disabled = true;
            if(el.dataset){
              el.dataset._virtDisabled = '1';
              el.dataset._initialValue = '';
            }
          }catch(_){ }
          try{ el.dispatchEvent(new Event('change', { bubbles:true })); }catch(_e){ }
          try{ if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){ window.BlossomSearchableSelect.syncAll(el); } }catch(_sync){ }
          return;
        }
        el.value='-';
      }
      function clearIfDash(el, t){ if(!el) return; if(el.value==='-') el.value=''; if(t){ try{ el.type=t; }catch(_){} } }
      if(v==='가상'){
        dashText.forEach(function(n){ setDash(form.querySelector('[name="'+n+'"]'), n); });
        dashNum.forEach(function(n){ var el=form.querySelector('[name="'+n+'"]'); if(!el) return; if(!el.dataset.origType){ el.dataset.origType=el.type||'number'; } try{ el.type='text'; }catch(_){} setDash(el); });
      } else {
        dashText.forEach(function(n){ clearIfDash(form.querySelector('[name="'+n+'"]')); });
        dashNum.forEach(function(n){ var el=form.querySelector('[name="'+n+'"]'); if(!el) return; var orig=el.dataset.origType||'number'; clearIfDash(el, orig); if(el.type==='number'){ el.min='0'; el.step='1'; } });

        // Re-enable selects disabled due to virtualization, but keep FK dependency rules.
        try{
          ['vendor','model','location_pos'].forEach(function(name){
            var el = form.querySelector('[name="'+name+'"]');
            if(!el || el.tagName !== 'SELECT') return;
            if(!(el.dataset && el.dataset._virtDisabled === '1')) return;
            delete el.dataset._virtDisabled;
            if(name === 'model'){
              var vendor = form.querySelector('[name="vendor"]');
              el.disabled = !(vendor && String(vendor.value||'').trim());
            } else if(name === 'location_pos'){
              var place = form.querySelector('[name="location_place"]');
              el.disabled = !(place && String(place.value||'').trim());
            } else {
              el.disabled = false;
            }
            try{ if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){ window.BlossomSearchableSelect.syncAll(el); } }catch(_sync2){ }
          });
        }catch(_re){ }
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
        localStorage.setItem('l7:current:u_size', String(uSizeVal||''));
        localStorage.setItem('l7:current:rack_face', String((item.rack_face) || ''));
        var serialVal = v('serial');
        var slotVal   = v('slot');
        var uSizeVal  = v('u_size');
  // Use L7-specific keys to avoid cross-page contamination
  localStorage.setItem('l7:current:vendor', String(vendorVal||''));
  localStorage.setItem('l7:current:model',  String(modelVal||''));
  localStorage.setItem('l7:current:serial', String(serialVal||''));
  localStorage.setItem('l7:current:slot',   String(slotVal||''));
  localStorage.setItem('l7:current:u_size', String(uSizeVal||''));
      }catch(_){ }
    }
    // Wire the Basic Info edit modal open/close/save
    (function(){
      function openModalLocal(id){ var el=document.getElementById(id); if(!el) return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden','false'); }
      function closeModalLocal(id){ var el=document.getElementById(id); if(!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } }
      var openBtn = document.getElementById(EDIT_OPEN_ID);
      if(openBtn){
        openBtn.addEventListener('click', async function(){
          try{ await l7EnsureAssetLoaded(); }catch(_){ }
          buildEditFormFromPage();
          try{
            var modalRoot = document.getElementById(EDIT_MODAL_ID);
            if(modalRoot && window.BlossomFkSelect && typeof window.BlossomFkSelect.enhance === 'function'){
              window.BlossomFkSelect.enhance(modalRoot);
            }
          }catch(_e){ }
          try{
            var modalRoot2 = document.getElementById(EDIT_MODAL_ID);
            if(modalRoot2 && window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function'){
              window.BlossomSearchableSelect.enhance(modalRoot2);
            }
          }catch(_se){ }
          openModalLocal(EDIT_MODAL_ID);
        });
      }
      var closeBtn = document.getElementById(EDIT_CLOSE_ID);
      if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalLocal(EDIT_MODAL_ID); }); }
      var modalEl = document.getElementById(EDIT_MODAL_ID);
      if(modalEl){ modalEl.addEventListener('click', function(e){ if(e.target === modalEl) closeModalLocal(EDIT_MODAL_ID); }); document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(EDIT_MODAL_ID); }); }
      var saveBtn = document.getElementById(EDIT_SAVE_ID);
      if(saveBtn){
        saveBtn.addEventListener('click', async function(){
          var form = document.getElementById(EDIT_FORM_ID);
          if(!form) return;
          if(L7_CURRENT_ASSET_ID == null){
            l7Toast('asset_id가 없어 저장할 수 없습니다.', 'info');
            return;
          }
          var prevText = (saveBtn.textContent||'').trim();
          saveBtn.disabled = true;
          saveBtn.textContent = '저장 중...';
          try{
            // Build payload from form values (send codes for FK selects).
            var payload = {};
            Array.prototype.forEach.call(form.elements || [], function(el){
              if(!el || !el.name) return;
              var name = String(el.name);
              var value = (el.value == null ? '' : String(el.value)).trim();
              if(value === ''){
                payload[name] = null;
              } else {
                if(name === 'slot' || name === 'u_size') payload[name] = l7NumOrNull(value);
                else if(name === 'confidentiality' || name === 'integrity' || name === 'availability' || name === 'security_score') payload[name] = l7NumOrNull(value);
                else payload[name] = value;
              }
            });

            // Translate legacy UI field names to canonical API columns.
            if(Object.prototype.hasOwnProperty.call(payload, 'manage_ip') && !Object.prototype.hasOwnProperty.call(payload, 'mgmt_ip')){
              payload.mgmt_ip = payload.manage_ip;
              delete payload.manage_ip;
            }
            if(Object.prototype.hasOwnProperty.call(payload, 'virtualization') && !Object.prototype.hasOwnProperty.call(payload, 'virtualization_type')){
              payload.virtualization_type = payload.virtualization;
              delete payload.virtualization;
            }
            if(Object.prototype.hasOwnProperty.call(payload, 'confidentiality') && !Object.prototype.hasOwnProperty.call(payload, 'cia_confidentiality')){
              payload.cia_confidentiality = payload.confidentiality;
              delete payload.confidentiality;
            }
            if(Object.prototype.hasOwnProperty.call(payload, 'integrity') && !Object.prototype.hasOwnProperty.call(payload, 'cia_integrity')){
              payload.cia_integrity = payload.integrity;
              delete payload.integrity;
            }
            if(Object.prototype.hasOwnProperty.call(payload, 'availability') && !Object.prototype.hasOwnProperty.call(payload, 'cia_availability')){
              payload.cia_availability = payload.availability;
              delete payload.availability;
            }

            // Translate UI FK field names to canonical hardware_asset columns.
            // (These are NOT covered by hardware_asset_service alias map.)
            if(Object.prototype.hasOwnProperty.call(payload, 'location_place') && !Object.prototype.hasOwnProperty.call(payload, 'center_code')){
              payload.center_code = payload.location_place;
              delete payload.location_place;
            }
            if(Object.prototype.hasOwnProperty.call(payload, 'location_pos') && !Object.prototype.hasOwnProperty.call(payload, 'rack_code')){
              payload.rack_code = payload.location_pos;
              delete payload.location_pos;
            }
            if(Object.prototype.hasOwnProperty.call(payload, 'sys_dept') && !Object.prototype.hasOwnProperty.call(payload, 'system_dept_code')){
              payload.system_dept_code = payload.sys_dept;
              delete payload.sys_dept;
            }
            if(Object.prototype.hasOwnProperty.call(payload, 'sys_owner') && !Object.prototype.hasOwnProperty.call(payload, 'system_owner_emp_no')){
              payload.system_owner_emp_no = payload.sys_owner;
              delete payload.sys_owner;
            }
            if(Object.prototype.hasOwnProperty.call(payload, 'svc_dept') && !Object.prototype.hasOwnProperty.call(payload, 'service_dept_code')){
              payload.service_dept_code = payload.svc_dept;
              delete payload.svc_dept;
            }
            if(Object.prototype.hasOwnProperty.call(payload, 'svc_owner') && !Object.prototype.hasOwnProperty.call(payload, 'service_owner_emp_no')){
              payload.service_owner_emp_no = payload.svc_owner;
              delete payload.svc_owner;
            }

            var url = L7_ASSET_API_BASE + '/' + encodeURIComponent(String(L7_CURRENT_ASSET_ID));
            var r = await l7FetchJson(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload) });
            if(!r.ok || !r.data || !r.data.success){
              var msg = (r.data && r.data.message) ? r.data.message : ('저장 실패(' + r.status + ')');
              l7Toast(msg, 'info');
              return;
            }
            L7_CURRENT_ASSET = r.data.item || null;
            try{
              sessionStorage.setItem('l7:selected:row', JSON.stringify(L7_CURRENT_ASSET));
              localStorage.setItem('l7:selected:row', JSON.stringify(L7_CURRENT_ASSET));
            }catch(_store2){ }
            l7RenderHeaderFromAsset(L7_CURRENT_ASSET);
            l7RenderBasicInfoFromAsset(L7_CURRENT_ASSET);
            closeModalLocal(EDIT_MODAL_ID);
          }catch(_err){
            l7Toast('저장 중 오류가 발생했습니다.', 'info');
          }finally{
            saveBtn.disabled = false;
            saveBtn.textContent = prevText || '저장';
          }
        });
      }
    })();

      // [Tabs moved to /static/js/_detail/tab*.js]


      // [Tabs moved to /static/js/_detail/tab*.js]

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
          tbody.appendChild(tr);
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

*/

// 2.l7_detail.js: Network L7 detail page (L2-baseline modal + badge styling)
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

  var STORAGE_PREFIX = 'l7';
  var HEADER_PREFIX = 'network_l7';
  var API_ENDPOINT = '/api/hardware/network/l7/assets';

  var EDIT_MODAL_ID = 'system-edit-modal';
  var EDIT_FORM_ID = 'system-edit-form';
  var EDIT_OPEN_ID = 'detail-edit-open';
  var EDIT_CLOSE_ID = 'system-edit-close';
  var EDIT_SAVE_ID = 'system-edit-save';

  function byId(id){ try{ return document.getElementById(id); }catch(_e){ return null; } }

  function notify(message){
    try{
      if(typeof window.showToast === 'function'){
        window.showToast(String(message || ''), '');
        return;
      }
    }catch(_){ }
    try{
      if(typeof window.showMessage === 'function'){
        window.showMessage(String(message || ''), '알림');
        return;
      }
    }catch(_2){ }
    try{ console.info('[l7-detail]', message); }catch(_3){ }
  }

  function openModalCompat(id){
    try{ if(typeof window.openModal === 'function'){ window.openModal(id); return; } }catch(_e){ }
    var el = byId(id);
    if(!el) return;
    try{ document.body.classList.add('modal-open'); }catch(_){ }
    el.classList.add('show');
    el.setAttribute('aria-hidden','false');
  }

  function closeModalCompat(id){
    try{ if(typeof window.closeModal === 'function'){ window.closeModal(id); return; } }catch(_e){ }
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
    try{ if(BHD && typeof BHD.getSelectedRow === 'function') return BHD.getSelectedRow(STORAGE_PREFIX); }catch(_){ }
    try{
      var raw = sessionStorage.getItem(STORAGE_PREFIX + ':selected:row') || localStorage.getItem(STORAGE_PREFIX + ':selected:row');
      return raw ? JSON.parse(raw) : null;
    }catch(_e){ return null; }
  }

  function storeSelectedRow(row){
    try{ if(BHD && typeof BHD.storeSelectedRow === 'function'){ BHD.storeSelectedRow(STORAGE_PREFIX, row); return; } }catch(_){ }
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
    try{ if(BHD && typeof BHD.resolveAssetId === 'function') return BHD.resolveAssetId(STORAGE_PREFIX); }catch(_){ }
    try{
      var params = new URLSearchParams(window.location.search || '');
      var q = (params.get('hardware_id') || params.get('hardwareId') || params.get('asset_id') || params.get('assetId') || params.get('id') || '').trim();
      if(q) return q;
    }catch(_e0){ }
    try{
      return (sessionStorage.getItem(STORAGE_PREFIX + ':selected:asset_id') || localStorage.getItem(STORAGE_PREFIX + ':selected:asset_id') || '').trim();
    }catch(_e1){ return ''; }
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

  function setBasicInfoValueByLabel(labelText, value){
    if(!document.querySelector('.basic-info-grid')) return;
    var row = _findBasicInfoRowByLabel(labelText);
    if(!row) return;
    var label = _normText(labelText);

    if(label === '업무 상태'){
      var textEl = row.querySelector('.status-pill .status-text');
      if(textEl){
        var ws = String(value == null ? '' : value).trim();
        textEl.textContent = ws || '-';
      }
      try{
        var dot = row.querySelector('.status-pill .status-dot');
        if(dot){
          dot.classList.remove('ws-run','ws-idle','ws-wait');
          var v = String(value == null ? '' : value).trim();
          dot.classList.add(v === '가동' ? 'ws-run' : (v === '유휴' ? 'ws-idle' : 'ws-wait'));
        }
      }catch(_eDot){ }
      return;
    }

    if(label === '기밀성' || label === '무결성' || label === '가용성' || label === '보안 점수'){
      var badge = row.querySelector('.num-badge');
      if(!badge) return;
      var raw = String(value == null ? '' : value).trim();
      var show = raw === '' ? '-' : raw;
      badge.textContent = show;
      badge.classList.remove('tone-1','tone-2','tone-3');
      if(show === '-'){
        badge.classList.add('tone-1');
      } else {
        var n = parseInt(show, 10);
        if(!isNaN(n)) badge.classList.add(_toneForNumericBadge(label, n));
      }
      return;
    }

    if(label === 'DR 구축여부' || label === '서비스 이중화'){
      var oxEl = row.querySelector('.ox-badge');
      if(!oxEl) return;
      var rawOx = String(value == null ? '' : value).trim().toUpperCase();
      var showOx = (rawOx === 'O' || rawOx === 'X') ? rawOx : '-';
      oxEl.textContent = showOx;
      oxEl.classList.remove('on','off');
      if(showOx === 'O') oxEl.classList.add('on');
      if(showOx === 'X') oxEl.classList.add('off');
      return;
    }

    var valueEl = row.querySelector('.info-value') || row.querySelector('.info-value') || row.querySelector('span');
    if(!valueEl) return;
    var v = String(value == null ? '' : value).trim();
    valueEl.textContent = v === '' ? '-' : v;
  }

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
    }catch(_e){ return ''; }
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
    }catch(_e){ return ''; }
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
      rack_face: _pickFirst(it, ['rack_face']),
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

  function applyRowToBasicInfo(item){
    if(!item) return;
    var row = normalizeFromApi(item);
    try{
      Object.keys(COLUMN_META).forEach(function(k){
        setBasicInfoValueByLabel(COLUMN_META[k].label, row[k]);
      });
    }catch(_e){ }
  }

  function buildEditFormFromRow(row){
    var form = byId(EDIT_FORM_ID);
    if(!form) return;
    var data = normalizeFromApi(row || {});

    function esc(s){
      return String(s == null ? '' : s)
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;')
        .replace(/\'/g,'&#39;');
    }

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
        var currentOpt = v ? ('<option value="'+esc(v)+'" selected>'+esc(v)+'</option>') : '';
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

  function readValue(el){ return el ? String(el.value || '') : ''; }

  function buildPayloadFromForm(form){
    function el(name){ return form.querySelector('[name="'+name+'"]'); }
    function vRaw(name){ return readValue(el(name)); }
    function setField(payload, key, raw){
      var s = (raw == null) ? '' : String(raw).trim();
      payload[key] = (s === '' || s === '선택') ? null : s;
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
    }catch(_e){ }
  }

  function init(){
    initHeader();

    var selected = getSelectedRow();
    try{ if(selected) applyRowToBasicInfo(selected); }catch(_e){ }

    // Refresh from API if we have asset_id
    var assetId = resolveAssetId();
    if(assetId){
      apiJSON(API_ENDPOINT + '/' + encodeURIComponent(String(assetId)), { method:'GET' })
        .then(function(json){
          if(!json || json.success !== true || !json.item) return;
          var row = normalizeFromApi(json.item);
          storeSelectedRow(row);
          applyRowToBasicInfo(row);
        })
        .catch(function(_err){ });
    }

    // Wire edit modal
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
      document.addEventListener('keydown', function(e){
        if(e && e.key === 'Escape' && modalEl.classList.contains('show')) closeModalCompat(EDIT_MODAL_ID);
      });
    }

    if(saveBtn){
      saveBtn.addEventListener('click', function(){
        var id = resolveAssetId();
        if(!id){ notify('자산 ID를 찾지 못했습니다.'); return; }
        var form = byId(EDIT_FORM_ID);
        if(!form){ notify('수정 폼이 없습니다.'); return; }
        try{ saveBtn.disabled = true; }catch(_eDis){ }

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
              applyRowToBasicInfo(row);
            }
            closeModalCompat(EDIT_MODAL_ID);
            notify('저장되었습니다.');
          })
          .catch(function(err){
            try{ alert(err && err.message ? err.message : '저장 실패'); }catch(_eA2){ }
          })
          .finally(function(){ try{ saveBtn.disabled = false; }catch(_eEn){ } });
      });
    }
  }

  try{
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
  }catch(_e){ try{ init(); }catch(_e2){ } }
})();


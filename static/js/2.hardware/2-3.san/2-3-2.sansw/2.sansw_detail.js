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
  function initSanswDetail(){
    // Sync header title/subtitle with latest selection from list page
    (function(){
      try{
        var params = new URLSearchParams(window.location.search || '');
        var work = params.get('work');
        var system = params.get('system');
        // IMPORTANT: do not treat generic `id` query param as asset_id (can be cross-module).
        var assetId = params.get('hardware_id') || params.get('hardwareId') || params.get('asset_id') || params.get('assetId');
        if(work || system){
          try{
            if(work != null) sessionStorage.setItem('san_switch:selected:work_name', work);
            if(system != null) sessionStorage.setItem('san_switch:selected:system_name', system);
          }catch(_storeErr){ /* ignore quota */ }
        }
        if(assetId){
          try{ sessionStorage.setItem('sansw:selected:asset_id', String(assetId)); }catch(_e0){ }
          try{ localStorage.setItem('sansw:selected:asset_id', String(assetId)); }catch(_e1){ }
        }
        if(!work){
          try{ work = sessionStorage.getItem('san_switch:selected:work_name') || '-'; }
          catch(_getWorkErr){ work = '-'; }
        }
        if(!system){
          try{ system = sessionStorage.getItem('san_switch:selected:system_name') || '-'; }
          catch(_getSysErr){ system = '-'; }
        }
        var headerTitle = document.getElementById('page-title') || document.querySelector('.page-header h1');
        var headerSubtitle = document.getElementById('page-subtitle') || document.querySelector('.page-header p');
        if(headerTitle) headerTitle.textContent = String(work || '-');
        if(headerSubtitle) headerSubtitle.textContent = String(system || '-');

        // Strip sensitive legacy query params from the address bar.
        try{
          if(params && (params.has('work') || params.has('system') || params.has('hardware_id') || params.has('hardwareId') || params.has('asset_id') || params.has('assetId') || params.has('id') || params.has('asset_scope'))){
            ['work','system','hardware_id','hardwareId','asset_id','assetId','id','asset_scope'].forEach(function(k){ try{ params.delete(k); }catch(_){ } });
            var qs = params.toString();
            history.replaceState({}, '', location.pathname + (qs ? ('?' + qs) : '') + location.hash);
          }
        }catch(_stripErr){ /* no-op */ }
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

    // ---------- SAN Switch detail: load + render + save ----------
    var SANSW_STORAGE_PREFIX = 'sansw';
    var SANSW_API_BASE = '/api/hardware/san/switch/assets';
    var currentSanswRow = null;

    function normalizeVirtualizationLabel(raw){
      if(!raw) return '';
      var value = String(raw).trim();
      if(value.toLowerCase() === 'physical') return '물리';
      if(value.toLowerCase() === 'virtual') return '가상';
      return value;
    }

    function _safeJsonParse(raw){
      try{ return JSON.parse(raw); }catch(_e){ return null; }
    }

    function _readStoredRow(){
      try{
        var raw = sessionStorage.getItem(SANSW_STORAGE_PREFIX+':selected:row') || localStorage.getItem(SANSW_STORAGE_PREFIX+':selected:row');
        return raw ? _safeJsonParse(raw) : null;
      }catch(_e){ return null; }
    }

    function _writeStoredRow(row){
      if(!row) return;
      try{ sessionStorage.setItem(SANSW_STORAGE_PREFIX+':selected:row', JSON.stringify(row)); }catch(_e0){}
      try{ localStorage.setItem(SANSW_STORAGE_PREFIX+':selected:row', JSON.stringify(row)); }catch(_e1){}
      try{
        var id = (row && (row.hardware_id != null ? row.hardware_id : (row.asset_id != null ? row.asset_id : row.id)));
        if(id != null && String(id).trim() !== ''){
          sessionStorage.setItem(SANSW_STORAGE_PREFIX+':selected:asset_id', String(id));
        }
      }catch(_e2){}
      try{
        var id2 = (row && (row.hardware_id != null ? row.hardware_id : (row.asset_id != null ? row.asset_id : row.id)));
        if(id2 != null && String(id2).trim() !== ''){
          localStorage.setItem(SANSW_STORAGE_PREFIX+':selected:asset_id', String(id2));
        }
      }catch(_e3){}
    }

    function _readAssetId(){
      // Prefer explicit stored asset_id, fallback to stored row, then query string.
      try{
        var v = sessionStorage.getItem(SANSW_STORAGE_PREFIX+':selected:asset_id') || localStorage.getItem(SANSW_STORAGE_PREFIX+':selected:asset_id');
        var n = parseInt(v, 10);
        if(!isNaN(n) && n > 0) return n;
      }catch(_e){ }
      try{
        var row = _readStoredRow();
        var id = row && (row.hardware_id != null ? row.hardware_id : (row.asset_id != null ? row.asset_id : row.id));
        var nn = parseInt(id, 10);
        if(!isNaN(nn) && nn > 0) return nn;
      }catch(_e2){ }
      try{
        var qs = new URLSearchParams(location.search||'');
        var cand = qs.get('hardware_id') || qs.get('hardwareId') || qs.get('asset_id') || qs.get('assetId');
        var n3 = parseInt(cand, 10);
        if(!isNaN(n3) && n3 > 0) return n3;
      }catch(_e3){ }

      // Last-resort: shared helper (after the URL may have been sanitized by replaceState)
      try{
        if(window.BlossomHardwareDetail && typeof window.BlossomHardwareDetail.resolveAssetId === 'function'){
          var id0 = window.BlossomHardwareDetail.resolveAssetId(SANSW_STORAGE_PREFIX);
          var n0 = parseInt(id0, 10);
          if(!isNaN(n0) && n0 > 0) return n0;
        }
      }catch(_e4){ }
      return null;
    }

    function _clearStoredSelection(){
      var keys = [
        SANSW_STORAGE_PREFIX+':selected:asset_id',
        SANSW_STORAGE_PREFIX+':selected:row'
      ];
      keys.forEach(function(k){
        try{ sessionStorage.removeItem(k); }catch(_e0){}
        try{ localStorage.removeItem(k); }catch(_e1){}
      });
    }

    function _notify(title, message){
      try{
        if(typeof window.showMessage === 'function'){
          window.showMessage(title || '알림', message || '');
          return;
        }
      }catch(_e){ }
      try{
        window.alert((title ? (title + '\n') : '') + (message || ''));
      }catch(_e2){ }
    }

    function fetchJSON(url, opts){
      try{
        if(window.BlossomHardwareDetail && typeof window.BlossomHardwareDetail.fetchJSON === 'function'){
          return window.BlossomHardwareDetail.fetchJSON(url, opts);
        }
      }catch(_){ }
      var options = opts ? Object.assign({}, opts) : {};
      options.headers = Object.assign({ 'Accept':'application/json' }, options.headers || {});
      if(!options.credentials) options.credentials = 'same-origin';
      var method = String(options.method || 'GET').toUpperCase();
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

    function unwrapApiItem(data){
      if(!data) return null;
      if(data.item) return data.item;
      if(data.data) return data.data;
      if(data.result) return data.result;
      return data;
    }

    async function apiGetSanswAsset(assetId){
      var id = parseInt(assetId, 10);
      if(isNaN(id) || id <= 0) throw new Error('Invalid asset_id');
      var data = await fetchJSON(SANSW_API_BASE + '/' + encodeURIComponent(String(id)), { method:'GET' });
      return unwrapApiItem(data);
    }

    async function apiUpdateSanswAsset(assetId, payload){
      var id = parseInt(assetId, 10);
      if(isNaN(id) || id <= 0) throw new Error('Invalid asset_id');
      var data = await fetchJSON(SANSW_API_BASE + '/' + encodeURIComponent(String(id)), { method:'PUT', body: JSON.stringify(payload || {}) });
      return unwrapApiItem(data);
    }

    function normalizeSanswAssetRecord(item){
      // Keep compatibility with list/detail code: expect an object with id and common fields.
      return item || null;
    }

    function applySanswRowToPage(row){
      if(!row) return;
      currentSanswRow = row;

      function setText(sel, val){ var el=document.querySelector(sel); if(el) el.textContent = (val == null || String(val).trim()==='') ? '-' : String(val).trim(); }
      function setBadge(sel, val){ var el=document.querySelector(sel); if(el) el.textContent = (val == null || String(val).trim()==='') ? '-' : String(val).trim(); }
      function setStatus(val){
        var pill=document.querySelector('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill');
        if(!pill) return;
        var tEl=pill.querySelector('.status-text');
        var dEl=pill.querySelector('.status-dot');
        var lbl=(val==null||String(val).trim()==='')?'-':String(val).trim();
        if(tEl) tEl.textContent=lbl;
        if(dEl){ dEl.classList.remove('ws-run','ws-idle','ws-wait'); dEl.classList.add(lbl==='가동'?'ws-run':(lbl==='유휴'?'ws-idle':'ws-wait')); }
      }
      function setNumBadge(sel, num){
        var badge=document.querySelector(sel);
        if(!badge) return;
        var txt=(num==null||String(num).trim()==='')?'-':String(num);
        badge.textContent=txt;
        var n=parseInt(txt,10);
        badge.classList.remove('tone-1','tone-2','tone-3');
        if(!isNaN(n)) badge.classList.add(n>=3?'tone-3':(n===2?'tone-2':'tone-1'));
      }
      function setOX(rowSel, val){
        var el=document.querySelector(rowSel+' .ox-badge'); if(!el) return;
        var out='-';
        if(typeof val === 'boolean') out = val ? 'O' : 'X';
        else if(val != null && String(val).trim() !== ''){
          var s=String(val).trim().toUpperCase();
          out=(s==='O'||s==='Y'||s==='YES'||s==='TRUE'||s==='1')?'O':'X';
        }
        el.textContent=out;
        el.classList.remove('on','off');
        if(out==='O') el.classList.add('on');
        else if(out==='X') el.classList.add('off');
        try{ el.setAttribute('aria-label', out==='O'?'예':(out==='X'?'아니오':'미설정')); }catch(_e){}
      }

      // business
      setStatus(row.work_status_name || row.work_status || row.work_status_label);
      setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(2) .info-value', row.work_type_name || row.work_type || row.work_type_label);
      setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(3) .info-value', row.work_category_name || row.work_category || row.work_category_label);
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(4) .info-value', row.work_operation_name || row.work_operation || row.work_operation_label);
      setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(5) .info-value', row.work_group_name || row.work_group || row.work_group_label);
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(6) .info-value', row.work_name);
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(7) .info-value', row.system_name);
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(8) .info-value', row.system_ip);
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(9) .info-value', row.mgmt_ip || row.manage_ip);

      // system
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(1) .info-value', row.manufacturer_name || row.vendor_name || row.vendor || row.manufacturer_code);
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(2) .info-value', row.server_model_name || row.model_name || row.model || row.server_code);
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(3) .info-value', row.serial_number || row.serial);
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(4) .info-value', normalizeVirtualizationLabel(row.virtualization_type || row.virtualization));
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(5) .info-value', row.center_name || row.center_code);
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(6) .info-value', row.rack_name || row.rack_code);
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(7) .info-value', row.slot != null ? row.slot : row.system_slot);
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(8) .info-value', row.u_size != null ? row.u_size : row.system_size);
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(9) .info-value', (row.rack_face === 'REAR') ? '후면' : '전면');

      // owners
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(1) .info-value', row.system_dept_name || row.system_department || row.system_dept_code);
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(2) .info-value', row.system_owner_name || row.system_owner || row.system_owner_emp_no);
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(3) .info-value', row.service_dept_name || row.service_department || row.service_dept_code);
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(4) .info-value', row.service_owner_name || row.service_owner || row.service_owner_emp_no);

      // security
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(1) .num-badge', row.cia_confidentiality);
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(2) .num-badge', row.cia_integrity);
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(3) .num-badge', row.cia_availability);
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(4) .num-badge', row.security_score);
      setText('.basic-info-card:nth-child(4) .info-row:nth-child(5) .info-value', row.system_grade);
      setText('.basic-info-card:nth-child(4) .info-row:nth-child(6) .info-value', row.core_flag != null ? row.core_flag : (row.is_core_system==null?'-':(row.is_core_system?'핵심':'일반')));
      setOX('.basic-info-card:nth-child(4) .info-row:nth-child(7)', row.dr_built != null ? row.dr_built : row.has_dr_site);
      setOX('.basic-info-card:nth-child(4) .info-row:nth-child(8)', row.svc_redundancy != null ? row.svc_redundancy : row.has_service_ha);

      // Persist key hardware fields for cross-tab usage
      try{
        localStorage.setItem('sansw:current:vendor', String(row.manufacturer_name || row.vendor_name || row.vendor || ''));
        localStorage.setItem('sansw:current:model',  String(row.server_model_name || row.model_name || row.model || ''));
        localStorage.setItem('sansw:current:serial', String(row.serial_number || row.serial || ''));
        localStorage.setItem('sansw:current:slot',   String((row.slot != null ? row.slot : row.system_slot) == null ? '' : (row.slot != null ? row.slot : row.system_slot)));
        localStorage.setItem('sansw:current:u_size', String((row.u_size != null ? row.u_size : row.system_size) == null ? '' : (row.u_size != null ? row.u_size : row.system_size)));
        localStorage.setItem('sansw:current:rack_face', String((row.rack_face) || ''));
      }catch(_){ }
    }

    // Initial paint: stored row first, then refresh from API
    (async function(){
      try{
        var stored = _readStoredRow();
        if(stored) applySanswRowToPage(stored);
      }catch(_e){ }
      try{
        var assetId = _readAssetId();
        if(!assetId) return;
        var fresh = await apiGetSanswAsset(assetId);
        if(fresh){
          var normalized = normalizeSanswAssetRecord(fresh);
          if(normalized){
            _writeStoredRow(normalized);
            applySanswRowToPage(normalized);
          }
        }
      }catch(err){
        try{ console.warn('[san_switch_detail] failed to load asset', err); }catch(_e2){ }

        // If the stored asset_id is stale (deleted/moved), clear it to avoid repeated 404s across tabs.
        try{
          var msg = (err && err.message) ? String(err.message) : '';
          if(msg && (msg.indexOf('대상을 찾을 수 없습니다') > -1 || msg.indexOf('Not Found') > -1 || msg.indexOf('404') > -1)){
            _clearStoredSelection();
          }
        }catch(_e3){ }
      }
    })();
    function buildEditFormFromPage(){
      var form = document.getElementById(EDIT_FORM_ID);
      if(!form) return;
      var row = currentSanswRow || _readStoredRow() || {};
      function escAttr(v){
        return String(v==null?'':v)
          .replace(/&/g,'&amp;')
          .replace(/"/g,'&quot;')
          .replace(/</g,'&lt;')
          .replace(/>/g,'&gt;');
      }
      function norm(v){ return String(v == null ? '' : v).trim(); }
      function pickAny(){
        for(var i=0;i<arguments.length;i++){
          var k = arguments[i];
          if(!k) continue;
          var v = row ? row[k] : null;
          if(v != null && String(v).trim() !== '') return v;
        }
        return '';
      }
      function boolToOX(v){
        if(typeof v === 'boolean') return v ? 'O' : 'X';
        var s = norm(v).toUpperCase();
        if(!s) return '';
        if(s==='O' || s==='Y' || s==='YES' || s==='TRUE' || s==='1') return 'O';
        if(s==='X' || s==='N' || s==='NO' || s==='FALSE' || s==='0') return 'X';
        return s;
      }

      // Mirror SAN Director modal grouping/order.
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

      var data = {
        // Prefer codes when present (FK-safe), fallback to labels.
        work_type: pickAny('work_type_code','work_type'),
        work_category: pickAny('work_category_code','work_category'),
        work_status: pickAny('work_status_code','work_status'),
        work_operation: pickAny('work_operation_code','work_operation'),
        work_group: pickAny('work_group_code','work_group'),
        work_name: pickAny('work_name'),
        system_name: pickAny('system_name'),
        system_ip: pickAny('system_ip'),
        manage_ip: pickAny('mgmt_ip','manage_ip'),
        vendor: pickAny('manufacturer_code','vendor'),
        model: pickAny('server_code','model'),
        serial: pickAny('serial_number','serial'),
        virtualization: normalizeVirtualizationLabel(pickAny('virtualization_type','virtualization')),
        location_place: pickAny('center_code','location_place'),
        location_pos: pickAny('rack_code','location_pos'),
        slot: pickAny('system_slot','slot'),
        u_size: pickAny('system_size','u_size'),
        rack_face: pickAny('rack_face'),
        sys_dept: pickAny('system_dept_code','system_department','sys_dept'),
        sys_owner: pickAny('system_owner_emp_no','system_owner','sys_owner'),
        svc_dept: pickAny('service_dept_code','service_department','svc_dept'),
        svc_owner: pickAny('service_owner_emp_no','service_owner','svc_owner'),
        confidentiality: pickAny('cia_confidentiality','confidentiality'),
        integrity: pickAny('cia_integrity','integrity'),
        availability: pickAny('cia_availability','availability'),
        security_score: pickAny('security_score'),
        system_grade: pickAny('system_grade'),
        core_flag: (function(){
          var v = pickAny('core_flag');
          if(v != null && String(v).trim() !== '') return v;
          if(row && row.is_core_system != null) return (row.is_core_system ? '핵심' : '일반');
          return '';
        })(),
        dr_built: (function(){
          var v = pickAny('dr_built');
          if(v) return boolToOX(v);
          if(row && row.has_dr_site!=null) return boolToOX(row.has_dr_site);
          return '';
        })(),
        svc_redundancy: (function(){
          var v = pickAny('svc_redundancy');
          if(v) return boolToOX(v);
          if(row && row.has_service_ha!=null) return boolToOX(row.has_service_ha);
          return '';
        })()
      };

      var GROUPS = [
        { title:'비즈니스', cols:['work_type','work_category','work_status','work_operation','work_group','work_name','system_name','system_ip','manage_ip'] },
        { title:'시스템', cols:['vendor','model','serial','virtualization','location_place','location_pos','slot','u_size','rack_face'] },
        { title:'담당자', cols:['sys_dept','sys_owner','svc_dept','svc_owner'] },
        { title:'점검', cols:['confidentiality','integrity','availability','security_score','system_grade','core_flag','dr_built','svc_redundancy'] }
      ];

      function fieldInput(col, value){
        var opts = {
          virtualization:['','물리','가상'],
          confidentiality:['','1','2','3'], integrity:['','1','2','3'], availability:['','1','2','3'],
          system_grade:['','1등급','2등급','3등급'], core_flag:['','핵심','일반'], dr_built:['','O','X'], svc_redundancy:['','O','X']
        };
        if(col === 'security_score'){
          var sv = (value == null || norm(value)==='-' ? '' : String(value));
          return '<input name="security_score" class="form-input" type="number" readonly placeholder="자동 합계" value="'+escAttr(sv)+'">';
        }
        if(opts[col]){
          return '<select name="'+col+'" class="form-input search-select '+(['confidentiality','integrity','availability'].indexOf(col)>-1?'score-trigger':'')+'" data-placeholder="선택">'
            + opts[col].map(function(o){ return '<option value="'+escAttr(o)+'" '+(String(o)===String(value)?'selected':'')+'>'+(o||'-')+'</option>'; }).join('')
            + '</select>';
        }
        if(col==='rack_face'){
          var selF=(value||'').toUpperCase()==='REAR'||value==='후면'?'':' selected';
          var selR=(value||'').toUpperCase()==='REAR'||value==='후면'?' selected':'';
          return '<select name="rack_face" class="form-input search-select" data-searchable="true" data-placeholder="선택"><option value="">선택</option><option value="FRONT"'+selF+'>전면</option><option value="REAR"'+selR+'>후면</option></select>';
        }
        if(col==='slot' || col==='u_size'){
          var nv = norm(value);
          return '<input name="'+col+'" type="number" min="0" step="1" class="form-input" value="'+escAttr(nv)+'">';
        }
        // Keep as inputs; BlossomFkSelect can convert common FK fields to selects.
        // NOTE: On 2.hardware pages, fk_select defensively avoids auto-converting `model`
        // unless explicitly allowed.
        if(col === 'model'){
          return '<input name="'+col+'" class="form-input" data-fk-allow="1" placeholder="모델 선택" value="'+escAttr(norm(value))+'">';
        }
        return '<input name="'+col+'" class="form-input" value="'+escAttr(norm(value))+'">';
      }

      var html = GROUPS.map(function(g){
        var grid = g.cols.map(function(c){
          var meta = COLUMN_META[c] || { label: c };
          var label = (c === 'security_score') ? '보안 점수' : meta.label;
          return '<div class="form-row"><label>'+label+'</label>'+fieldInput(c, data[c])+'</div>';
        }).join('');
        return '<div class="form-section"><div class="section-header"><h4>'+g.title+'</h4></div><div class="form-grid">'+grid+'</div></div>';
      }).join('');
      form.innerHTML = html;

      try{ attachSecurityScoreRecalc(EDIT_FORM_ID); }catch(_e0){ }
      try{ attachVirtualizationHandler(EDIT_FORM_ID); }catch(_e1){ }
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
      function setOX(rowSel, name){
        var el=document.querySelector(rowSel+' .ox-badge'); if(!el) return;
        var val=String(v(name)||'').trim();
        el.classList.remove('on','off');
        if(val==='O'){
          el.textContent='O';
          el.classList.add('on');
          try{ el.setAttribute('aria-label','예'); }catch(_e){}
          return;
        }
        if(val==='X'){
          el.textContent='X';
          el.classList.add('off');
          try{ el.setAttribute('aria-label','아니오'); }catch(_e2){}
          return;
        }
        el.textContent='-';
        try{ el.setAttribute('aria-label','미설정'); }catch(_e3){}
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
        // Use SAN Switch-specific keys to avoid cross-page contamination
        localStorage.setItem('sansw:current:vendor', String(vendorVal||''));
        localStorage.setItem('sansw:current:model',  String(modelVal||''));
        localStorage.setItem('sansw:current:serial', String(serialVal||''));
        localStorage.setItem('sansw:current:slot',   String(slotVal||''));
        localStorage.setItem('sansw:current:u_size', String(uSizeVal||''));
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
        try{ window.BlossomFkSelect && window.BlossomFkSelect.enhance && window.BlossomFkSelect.enhance(document.getElementById(EDIT_MODAL_ID)); }catch(_e){}
        try{ window.BlossomSearchableSelect && window.BlossomSearchableSelect.enhance && window.BlossomSearchableSelect.enhance(document.getElementById(EDIT_MODAL_ID)); }catch(_e){}
      }); }
      var closeBtn = document.getElementById(EDIT_CLOSE_ID);
      if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalLocal(EDIT_MODAL_ID); }); }
      var modalEl = document.getElementById(EDIT_MODAL_ID);
      if(modalEl){ modalEl.addEventListener('click', function(e){ if(e.target === modalEl) closeModalLocal(EDIT_MODAL_ID); }); document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(EDIT_MODAL_ID); }); }
      var saveBtn = document.getElementById(EDIT_SAVE_ID);
      if(saveBtn){
        saveBtn.addEventListener('click', async function(){
          var id = _readAssetId();
          if(!id){ _notify('오류', '자산 ID를 찾을 수 없습니다. 목록에서 다시 진입해 주세요.'); return; }
          var form = document.getElementById(EDIT_FORM_ID);
          if(!form){ _notify('오류', '수정 폼을 찾을 수 없습니다.'); return; }

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
          var NUMERIC_KEYS = new Set(['cia_confidentiality','cia_integrity','cia_availability','security_score','system_slot','system_size']);

          var original = currentSanswRow || _readStoredRow() || null;
          var CODE_KEY_MAP = {
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
            sys_owner: 'system_owner_emp_no',
            svc_dept: 'service_dept_code',
            svc_owner: 'service_owner_emp_no'
          };
          function norm(v){ return String(v == null ? '' : v).trim(); }
          function isSelect(el){ return !!(el && el.tagName && String(el.tagName).toLowerCase()==='select'); }

          var payload = { asset_category: 'SAN', asset_type: 'SWITCH' };
          Object.keys(FIELD_TO_PAYLOAD_KEY).forEach(function(formKey){
            var el = form.querySelector('[name="'+formKey+'"]');
            if(!el) return;

            var payloadKey = FIELD_TO_PAYLOAD_KEY[formKey];
            var raw = el.value;
            if(raw == null) return;
            var s = norm(raw);

            // Allow explicit clears: if the user emptied a field that previously had a value,
            // send null so sqlite FK columns don't get "" (which would violate FK).
            function prevForKey(){
              if(!original) return '';
              if(formKey === 'manage_ip') return norm(original.manage_ip || original.mgmt_ip);
              if(formKey === 'virtualization') return norm(original.virtualization_raw || original.virtualization);
              var v = norm(original[formKey]);
              if(v === '-' || v === '—') return '';
              return v;
            }

            if(s === ''){
              var codeKey0 = CODE_KEY_MAP[formKey];
              if(codeKey0){
                if(!isSelect(el)) return;
                var prevCode0 = original ? norm(original[codeKey0]) : '';
                if(!prevCode0) return;
                payload[payloadKey] = null;
                return;
              }
              var prevVal0 = prevForKey();
              if(!prevVal0) return;
              payload[payloadKey] = null;
              return;
            }

            // For FK fields, only trust values when control is a <select> (fk_select converts inputs).
            var codeKey = CODE_KEY_MAP[formKey];
            if(codeKey){
              if(!isSelect(el)){
                // Avoid sending a label string that would violate FK constraints.
                return;
              }
              var prevCode = original ? norm(original[codeKey]) : '';
              if(prevCode && s === prevCode) return;
              if(!prevCode){
                // If we don't know original code, be conservative: still allow selects.
              }
              payload[payloadKey] = s;
              return;
            }

            // Non-FK fields: send only if changed.
            var prevVal = prevForKey();

            if(NUMERIC_KEYS.has(payloadKey)){
              var n = parseInt(s, 10);
              if(isNaN(n)) return;
              var prevN = NaN;
              if(prevVal){ prevN = parseInt(prevVal, 10); }
              if(!isNaN(prevN) && n === prevN) return;
              payload[payloadKey] = n;
              return;
            }

            if(prevVal && s === prevVal) return;
            payload[payloadKey] = s;
          });

          // Cascade clear rules (match SAN Director behavior)
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
          // If CIA is explicitly cleared, clear the derived security_score too.
          if(
            (Object.prototype.hasOwnProperty.call(payload, 'cia_confidentiality') && payload.cia_confidentiality === null) ||
            (Object.prototype.hasOwnProperty.call(payload, 'cia_integrity') && payload.cia_integrity === null) ||
            (Object.prototype.hasOwnProperty.call(payload, 'cia_availability') && payload.cia_availability === null)
          ){
            payload.security_score = null;
          }

          // Keep existing code/name to avoid accidental blanks (some backends validate these)
          if(original){
            if(original.asset_code) payload.asset_code = original.asset_code;
            if(original.asset_name) payload.asset_name = original.asset_name;
          }

          // asset_code/asset_name are not required for update; keep payload minimal to avoid accidental FK issues.
          // (If the backend later requires them, we can re-add safely from `currentSanswRow`.)

          // Nothing changed
          var changedKeys = Object.keys(payload).filter(function(k){ return k !== 'asset_category' && k !== 'asset_type'; });
          if(changedKeys.length === 0){
            closeModalLocal(EDIT_MODAL_ID);
            return;
          }

          var prevDisabled = saveBtn.disabled;
          saveBtn.disabled = true;
          try{
            var savedItem = await apiUpdateSanswAsset(id, payload);
            var savedRow = normalizeSanswAssetRecord(savedItem);
            if(savedRow){
              _writeStoredRow(savedRow);
              applySanswRowToPage(savedRow);
            }
            closeModalLocal(EDIT_MODAL_ID);
          }catch(err){
            _notify('수정 실패', err && err.message ? err.message : '수정 중 오류가 발생했습니다.');
          }finally{
            saveBtn.disabled = prevDisabled;
          }
        });
      }
    })();

      // [Tabs moved to /static/js/_detail/tab*.js]


      // [Tabs moved to /static/js/_detail/tab*.js]

  // Tab01 hardware (legacy fallback): only run when the HW table exists.
  (function(){
    var table = document.getElementById('hw-spec-table');
    if(!table) return;
	// Shared handler (tab01-hardware.js) takes precedence.
	if(window.BlossomTab01Hardware && window.BlossomTab01Hardware.handlesTable) return;
    var hwHeaderText = '';
    try{ hwHeaderText = String((table.querySelector('thead') ? table.querySelector('thead').textContent : '') || ''); }catch(_){ hwHeaderText = ''; }
    var isFrontBay = false;
    var isRearBay = false;

  var hasSpecCol = (isFrontBay || isRearBay) || !!table.querySelector('[data-col="spec"]') || /\uC0C1\uC138\uC0AC\uC591/.test(hwHeaderText);
  // Detect schema: inventory-style (qty column) vs bay-style (space/serial columns)
  var isInventorySchema = (function(){
        try{
          if(/\uC218\uB7C9/.test(hwHeaderText) && !/\uACF5\uAC04/.test(hwHeaderText)) return true; // 수량 and not 공간
        }catch(_){ }
        return !!table.querySelector('[data-col="qty"]') && !table.querySelector('[data-col="space"]');
      })();
  var invTypeOptions = ['CPU','GPU','MEMORY','DISK','NIC','HBA','ETC'];
      var bayCount = isRearBay ? 8 : 16;

      // Inventory catalog helper (model search + spec/vendor autofill)
      try{
        if(isInventorySchema && window.BlossomHwInventoryCatalog && typeof window.BlossomHwInventoryCatalog.bindTable === 'function'){
          window.BlossomHwInventoryCatalog.bindTable(table);
        }
      }catch(_){ }

      // ---- Components persistence (/api/hardware/assets/<hardware_id>/components) ----
      var hwStoragePrefix = 'sansw';
      function getSelectedHardwareId(){
        try{
          var qs = new URLSearchParams(location.search||'');
          var cand = qs.get('hardware_id') || qs.get('hardwareId') || qs.get('asset_id') || qs.get('assetId') || qs.get('id');
          var n = parseInt(cand, 10);
          if(!isNaN(n) && n > 0) return n;
        }catch(_){ }
        try{
          var raw = sessionStorage.getItem(hwStoragePrefix+':selected:row') || localStorage.getItem(hwStoragePrefix+':selected:row');
          if(raw){
            var row = JSON.parse(raw);
            var id = row && (row.hardware_id != null ? row.hardware_id : (row.asset_id != null ? row.asset_id : row.id));
            var nn = parseInt(id, 10);
            if(!isNaN(nn) && nn > 0) return nn;
          }
        }catch(_e){ }
        return null;
      }
      function getRowComponentId(tr){
        if(!tr) return null;
        var v = (tr.dataset && (tr.dataset.id || tr.dataset.componentId)) || tr.getAttribute('data-id') || tr.getAttribute('data-component-id');
        var n = parseInt(v, 10);
        return (!isNaN(n) && n > 0) ? n : null;
      }
      function setRowComponentId(tr, id){
        try{
          var n = parseInt(id, 10);
          if(isNaN(n) || n <= 0) return;
          tr.dataset.id = String(n);
          tr.setAttribute('data-id', String(n));
        }catch(_){ }
      }
      function apiBase(hardwareId){ return '/api/hardware/assets/' + encodeURIComponent(String(hardwareId)) + '/components'; }
      async function apiFetch(url, opts){
        var r = await fetch(url, opts || {});
        var j = await r.json().catch(function(){ return null; });
        if(!r.ok){
          var msg = (j && j.error) ? j.error : ('HTTP '+r.status);
          throw new Error(msg);
        }
        return j;
      }
      function tdText(tr, col){
        try{ var td = tr.querySelector('[data-col="'+col+'"]'); return td ? String(td.textContent||'').trim() : ''; }catch(_){ return ''; }
      }
      function renderSavedRow(item){
        var tr = document.createElement('tr');
        if(item && item.id != null) setRowComponentId(tr, item.id);
        var specCell = hasSpecCol ? '<td data-col="spec">'+((item && item.spec) ? String(item.spec) : '-')+'</td>' : '';
        if(isInventorySchema){
          tr.innerHTML = [
            '<td><input type="checkbox" class="hw-row-check" aria-label="행 선택"></td>',
            '<td data-col="type">'+((item && item.type) ? String(item.type) : '-')+'</td>',
            '<td data-col="model">'+((item && item.model) ? String(item.model) : '-')+'</td>',
            specCell,
            '<td data-col="vendor">'+((item && item.vendor) ? String(item.vendor) : '-')+'</td>',
            '<td data-col="qty">'+((item && (item.qty!=null)) ? String(item.qty) : '-')+'</td>',
            '<td data-col="fw">'+((item && item.fw) ? String(item.fw) : '-')+'</td>',
            '<td data-col="remark">'+((item && item.remark) ? String(item.remark) : '-')+'</td>',
            '<td class="system-actions table-actions">'
              +'<button class="action-btn js-hw-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button>'
              +'<button class="action-btn danger js-hw-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'
            +'</td>'
          ].join('');
        } else {
          tr.innerHTML = [
            '<td><input type="checkbox" class="hw-row-check" aria-label="행 선택"></td>',
            '<td data-col="type">'+((item && item.type) ? String(item.type) : '-')+'</td>',
            '<td data-col="space">'+((item && item.space) ? String(item.space) : '-')+'</td>',
            '<td data-col="model">'+((item && item.model) ? String(item.model) : '-')+'</td>',
            specCell,
            '<td data-col="serial">'+((item && item.serial) ? String(item.serial) : '-')+'</td>',
            '<td data-col="vendor">'+((item && item.vendor) ? String(item.vendor) : '-')+'</td>',
            '<td data-col="fw">'+((item && item.fw) ? String(item.fw) : '-')+'</td>',
            '<td data-col="remark">'+((item && item.remark) ? String(item.remark) : '-')+'</td>',
            '<td class="system-actions table-actions">'
              +'<button class="action-btn js-hw-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button>'
              +'<button class="action-btn danger js-hw-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'
            +'</td>'
          ].join('');
        }
        return tr;
      }
      async function hwReloadFromApi(){
        var hardwareId = getSelectedHardwareId();
        if(!hardwareId) return;
        try{
          var data = await apiFetch(apiBase(hardwareId), { method:'GET', headers:{'Accept':'application/json'} });
          var items = (data && data.items) ? data.items : (Array.isArray(data) ? data : []);
          items = (items || []).filter(function(it){ return !(it && String(it.type||'').trim() === '시스템'); });
          var tbody = table.querySelector('tbody');
          if(!tbody) return;
          tbody.innerHTML = '';
          ensureSystemRow();
          refreshSystemRow();
          scheduleSystemRowRefresh();
          items.forEach(function(it){ tbody.appendChild(renderSavedRow(it)); });
          updateEmptyState();
        }catch(err){
          try{ console.error('[tab01-hardware] load failed', err); }catch(_){ }
        }
      }
      function hwPersistRowToApi(tr){
        if(!tr || isSystemRow(tr)) return;
        var hardwareId = getSelectedHardwareId();
        if(!hardwareId) return;
        var payload = {
          type: tdText(tr,'type'),
          model: tdText(tr,'model'),
          spec: hasSpecCol ? tdText(tr,'spec') : '',
          vendor: tdText(tr,'vendor'),
          fw: tdText(tr,'fw'),
          remark: tdText(tr,'remark')
        };
        if(isInventorySchema){
          var q = tdText(tr,'qty');
          var n = parseInt(q, 10);
          payload.qty = (!isNaN(n) && n > 0) ? n : null;
        } else {
          payload.space = tdText(tr,'space');
          payload.serial = tdText(tr,'serial');
        }
        var cid = getRowComponentId(tr);
        var url = cid ? (apiBase(hardwareId) + '/' + encodeURIComponent(String(cid))) : apiBase(hardwareId);
        var method = cid ? 'PUT' : 'POST';
        apiFetch(url, { method: method, headers:{'Content-Type':'application/json','Accept':'application/json'}, body: JSON.stringify(payload) })
          .then(function(saved){ if(saved && saved.id != null) setRowComponentId(tr, saved.id); })
          .catch(function(err){ try{ console.error('[tab01-hardware] save failed', err); }catch(_){ } });
      }
      function hwDeleteRowFromApi(tr){
        if(!tr || isSystemRow(tr)) return Promise.resolve(false);
        var hardwareId = getSelectedHardwareId();
        var cid = getRowComponentId(tr);
        if(!hardwareId || !cid) return Promise.resolve(false);
        return apiFetch(apiBase(hardwareId) + '/' + encodeURIComponent(String(cid)), { method:'DELETE', headers:{'Accept':'application/json'} })
          .then(function(){ return true; });
      }

      // Selection: select-all only affects visible rows
      var selectAll = document.getElementById('hw-select-all');
      if(selectAll){
        selectAll.addEventListener('change', function(){
          var checks = table.querySelectorAll('.hw-row-check:not([disabled])');
          checks.forEach(function(c){
            var tr = c.closest('tr');
            var hidden = tr && (tr.hasAttribute('data-hidden') || tr.style.display==='none');
            if(!hidden){ c.checked = !!selectAll.checked; }
            if(tr){ tr.classList.toggle('selected', !!c.checked && !hidden); }
          });
        });
      }

      // 시스템 고정행: 첫 줄은 '시스템'으로 기본정보 탭의 하드웨어 정보를 반영
      function getPageSystemInfo(){
        // Schema-agnostic source for model/vendor/serial; mapping to columns handled in builders
        var info = { type:'시스템', space:'-', model:'-', serial:'-', vendor:'-', qty:1, fw:'-', remark:'-' };
        try{
          // Prefer cached values from Basic Info save
          var cachedModel = localStorage.getItem('sansw:current:model');
          var cachedVendor = localStorage.getItem('sansw:current:vendor');
          var cachedSerial = localStorage.getItem('sansw:current:serial');
          if(cachedModel) info.model = cachedModel;
          if(cachedVendor) info.vendor = cachedVendor;
          if(cachedSerial) info.serial = cachedSerial;
        }catch(_){ }
        // Fallback to DOM if cache missing
        if(info.model === '-' || info.vendor === '-' || info.serial === '-'){
          try{
            var baseSel = '.basic-info-grid .basic-info-card:nth-child(2) .basic-info-card-content';
            var vendorEl = document.querySelector(baseSel+' .info-row:nth-child(1) .info-value');
            var modelEl  = document.querySelector(baseSel+' .info-row:nth-child(2) .info-value');
            var serialEl = document.querySelector(baseSel+' .info-row:nth-child(3) .info-value');
            if(vendorEl){ var v=(vendorEl.textContent||'').trim(); if(v) info.vendor = v; }
            if(modelEl){ var m=(modelEl.textContent||'').trim(); if(m) info.model = m; }
            if(serialEl){ var s=(serialEl.textContent||'').trim(); if(s) info.serial = s; }
          }catch(_){ }
        }
        if(info.model === '-' || info.vendor === '-' || info.serial === '-'){
          try{
            var raw = sessionStorage.getItem('sansw:selected:row') || localStorage.getItem('sansw:selected:row');
            if(raw){
              var row = JSON.parse(raw);
              var m2 = row && (row.model != null ? row.model : (row.system_model_name != null ? row.system_model_name : row.server_model_name));
              var v2 = row && (row.vendor != null ? row.vendor : (row.manufacturer_name != null ? row.manufacturer_name : row.manufacturer));
              var s2 = row && (row.serial != null ? row.serial : (row.serial_number != null ? row.serial_number : row.system_serial));
              m2 = (m2 == null) ? '' : String(m2).trim();
              v2 = (v2 == null) ? '' : String(v2).trim();
              s2 = (s2 == null) ? '' : String(s2).trim();
              if(info.model === '-' && m2) info.model = m2;
              if(info.vendor === '-' && v2) info.vendor = v2;
              if(info.serial === '-' && s2) info.serial = s2;
            }
          }catch(_eSel){ }
        }
        return info;
      }
      function isSystemRow(tr){
        if(!tr) return false;
        if(tr.dataset && tr.dataset.systemRow === '1') return true;
        var td = tr.querySelector('[data-col="type"]');
        return td && (td.textContent||'').trim() === '시스템';
      }
      function buildSystemRow(){
        var d = getPageSystemInfo();
        var tr = document.createElement('tr');
        tr.dataset.systemRow = '1';
        tr.classList.add('system-row');
        var specCell = hasSpecCol ? `<td data-col="spec">-</td>` : '';
        if(isInventorySchema){
          // Inventory schema: 유형, 모델명, [용량], 제조사, 수량, 펌웨어, 비고
          tr.innerHTML = `
            <td><input type="checkbox" class="hw-row-check" aria-label="행 선택" disabled></td>
            <td data-col="type">${d.type}</td>
            <td data-col="model">${d.model}</td>
            ${specCell}
            <td data-col="vendor">${d.vendor}</td>
            <td data-col="qty">1</td>
            <td data-col="fw">${d.fw}</td>
            <td data-col="remark">${d.remark}</td>
            <td class="system-actions table-actions">
              <button class="action-btn js-hw-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button>
              <button class="action-btn danger js-hw-del" data-action="delete" type="button" title="삭제" aria-label="삭제" style="visibility:hidden;pointer-events:none;" tabindex="-1" aria-hidden="true"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>
            </td>`;
        } else {
          // Bay schema: 유형, 공간, 모델명, [용량], 일련번호, 제조사, 펌웨어, 비고
          tr.innerHTML = `
            <td><input type="checkbox" class="hw-row-check" aria-label="행 선택" disabled></td>
            <td data-col="type">${d.type}</td>
            <td data-col="space">${d.space}</td>
            <td data-col="model">${d.model}</td>
            ${specCell}
            <td data-col="serial">${d.serial}</td>
            <td data-col="vendor">${d.vendor}</td>
            <td data-col="fw">${d.fw}</td>
            <td data-col="remark">${d.remark}</td>
            <td class="system-actions table-actions">
              <button class="action-btn js-hw-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button>
              <button class="action-btn danger js-hw-del" data-action="delete" type="button" title="삭제" aria-label="삭제" style="visibility:hidden;pointer-events:none;" tabindex="-1" aria-hidden="true"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>
            </td>`;
        }
        return tr;
      }
      function ensureSystemRow(){
        var tbody = table.querySelector('tbody'); if(!tbody) return;
        var first = tbody.querySelector('tr');
        if(!first){ tbody.appendChild(buildSystemRow()); return; }
        if(!isSystemRow(first)){
          tbody.insertBefore(buildSystemRow(), first);
        }
      }
      ensureSystemRow();
      // Refresh system row values on load in case Basic Info is already present
      function refreshSystemRow(){
        try{
          var tbody=table.querySelector('tbody'); if(!tbody) return; var first=tbody.querySelector('tr'); if(!isSystemRow(first)) return;
          try{ var cb0 = first.querySelector('.hw-row-check'); if(cb0){ cb0.disabled = true; cb0.checked = false; first.classList.remove('selected'); } }catch(_eCb0){ }
          var d=getPageSystemInfo();
          function set(col, val){ var td=first.querySelector('[data-col="'+col+'"]'); if(td){ td.textContent = (val && String(val).trim())? String(val): '-'; } }
          set('model', d.model); if(hasSpecCol) set('spec','-'); set('vendor', d.vendor); set('fw', d.fw); set('remark', d.remark);
          if(isInventorySchema){ set('qty', 1); }
          else { set('space', d.space); set('serial', d.serial); }
        }catch(_){ }
      }
      refreshSystemRow();

      function scheduleSystemRowRefresh(){
        var tries = 0;
        (function tick(){
          tries++;
          refreshSystemRow();
          try{
            var tbody=table.querySelector('tbody'); if(!tbody) return;
            var first=tbody.querySelector('tr'); if(!isSystemRow(first)) return;
            var modelTd = first.querySelector('[data-col="model"]');
            var vendorTd = first.querySelector('[data-col="vendor"]');
            var model = (modelTd ? (modelTd.textContent||'') : '').trim();
            var vendor = (vendorTd ? (vendorTd.textContent||'') : '').trim();
            if(model && model !== '-' && vendor && vendor !== '-') return;
          }catch(_e){ }
          if(tries < 16) setTimeout(tick, 250);
        })();
      }
      scheduleSystemRowRefresh();
      // If values are missing, fetch Basic Info HTML and parse
      (function tryFetchAndCacheBasicInfo(){
        try{
          var cachedModel = localStorage.getItem('sansw:current:model')||'';
          var cachedVendor = localStorage.getItem('sansw:current:vendor')||'';
          var cachedSerial = localStorage.getItem('sansw:current:serial')||'';
          var needFetch = !(cachedModel && cachedVendor && cachedSerial); // if key fields missing, fetch
          if(!needFetch){ return; }
          var url = '/app/templates/2.hardware/2-3.san/2-3-2.sansw/2.sansw_detail.html';
          fetch(url, { cache: 'no-cache' }).then(function(res){ return res.text(); }).then(function(html){
            try{
              var parser = new DOMParser();
              var doc = parser.parseFromString(html, 'text/html');
              var baseSel = '.basic-info-grid .basic-info-card:nth-child(2) .basic-info-card-content';
              var vendorEl = doc.querySelector(baseSel+' .info-row:nth-child(1) .info-value');
              var modelEl  = doc.querySelector(baseSel+' .info-row:nth-child(2) .info-value');
              var serialEl = doc.querySelector(baseSel+' .info-row:nth-child(3) .info-value');
              var vendor=(vendorEl? (vendorEl.textContent||'').trim(): '');
              var model=(modelEl? (modelEl.textContent||'').trim(): '');
              var serial=(serialEl? (serialEl.textContent||'').trim(): '');
              if(vendor){ localStorage.setItem('sansw:current:vendor', vendor); }
              if(model){ localStorage.setItem('sansw:current:model', model); }
              if(serial){ localStorage.setItem('sansw:current:serial', serial); }
              refreshSystemRow();
            }catch(_){ }
          }).catch(function(_e){ /* ignore */ });
        }catch(_){ }
      })();

      // Pagination state and helpers (match change log parity)
      var hwState = { page:1, pageSize:10 };
      (function initPageSize(){
        try{
          var saved = localStorage.getItem('onpremise:hw:pageSize');
          var sel = document.getElementById('hw-page-size');
          if(sel){
            if(saved && ['10','20','50','100'].indexOf(saved)>-1){ hwState.pageSize = parseInt(saved,10); sel.value = saved; }
            sel.addEventListener('change', function(){ var v=parseInt(sel.value,10); if(!isNaN(v)){ hwState.page=1; hwState.pageSize=v; localStorage.setItem('onpremise:hw:pageSize', String(v)); hwRenderPage(); } });
          }
        }catch(_){ }
      })();
      function hwRows(){ var tbody=table.querySelector('tbody'); return tbody? Array.from(tbody.querySelectorAll('tr')): []; }
      function hwTotal(){ return hwRows().length; }
      function hwPages(){ var total=hwTotal(); return Math.max(1, Math.ceil(total / hwState.pageSize)); }
      function hwClampPage(){ var pages=hwPages(); if(hwState.page>pages) hwState.page=pages; if(hwState.page<1) hwState.page=1; }
      function hwUpdatePaginationUI(){
        if(infoEl){ var total=hwTotal(); var start = total? (hwState.page-1)*hwState.pageSize+1 : 0; var end = Math.min(total, hwState.page*hwState.pageSize); infoEl.textContent = start + '-' + end + ' / ' + total + '개 항목'; }
        if(numWrap){ var pages=hwPages(); numWrap.innerHTML=''; for(var p=1;p<=pages && p<=50;p++){ var b=document.createElement('button'); b.className='page-btn'+(p===hwState.page?' active':''); b.textContent=String(p); b.dataset.page=String(p); numWrap.appendChild(b); } }
        var pages2=hwPages(); if(btnFirst) btnFirst.disabled=(hwState.page===1); if(btnPrev) btnPrev.disabled=(hwState.page===1); if(btnNext) btnNext.disabled=(hwState.page===pages2); if(btnLast) btnLast.disabled=(hwState.page===pages2);
        var sizeSel=document.getElementById('hw-page-size'); if(sizeSel){ var none=(hwTotal()===0); sizeSel.disabled=none; if(none){ try{ sizeSel.value='10'; hwState.pageSize=10; }catch(_){ } } }
      }
      function hwRenderPage(){
        hwClampPage();
        var rows = hwRows();
        var startIdx = (hwState.page-1)*hwState.pageSize;
        var endIdx = startIdx + hwState.pageSize - 1;
        rows.forEach(function(tr, idx){
          var visible = idx>=startIdx && idx<=endIdx;
          tr.style.display = visible? '' : 'none';
          if(visible){ tr.removeAttribute('data-hidden'); } else { tr.setAttribute('data-hidden','1'); }
          var cb = tr.querySelector('.hw-row-check'); if(cb){ tr.classList.toggle('selected', !!cb.checked && visible); }
        });
        hwUpdatePaginationUI();
        var sa = document.getElementById('hw-select-all'); if(sa){ var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check'); if(visChecks.length){ sa.checked = Array.prototype.every.call(visChecks, function(c){ return c.checked; }); } else { sa.checked=false; } }
      }
      function hwGo(p){ hwState.page=p; hwRenderPage(); }
      function hwGoDelta(d){ hwGo(hwState.page + d); }
      function hwGoFirst(){ hwGo(1); }
      function hwGoLast(){ hwGo(hwPages()); }
      if(numWrap){ numWrap.addEventListener('click', function(e){ var b=e.target.closest('button.page-btn'); if(!b) return; var p=parseInt(b.dataset.page,10); if(!isNaN(p)) hwGo(p); }); }
      if(btnFirst) btnFirst.addEventListener('click', hwGoFirst);
      if(btnPrev) btnPrev.addEventListener('click', function(){ hwGoDelta(-1); });
      if(btnNext) btnNext.addEventListener('click', function(){ hwGoDelta(1); });
      if(btnLast) btnLast.addEventListener('click', hwGoLast);

      function updateEmptyState(){
        try{ var hasRows = table.querySelector('tbody tr') != null; if(empty){ empty.hidden = !!hasRows; empty.style.display = hasRows ? 'none' : ''; } }
        catch(_){ if(empty){ empty.hidden=false; empty.style.display=''; } }
        var csvBtn = document.getElementById('hw-download-btn'); if(csvBtn){ var has = !!table.querySelector('tbody tr'); csvBtn.disabled = !has; csvBtn.setAttribute('aria-disabled', (!has).toString()); csvBtn.title = has? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.'; }
        hwRenderPage();
      }
      updateEmptyState();

      // Load persisted rows (exclude system row)
      hwReloadFromApi();

      // Add new row
      var addBtn = document.getElementById('hw-row-add');
      if(addBtn){
        addBtn.addEventListener('click', function(){
          ensureSystemRow();
          var tbody = table.querySelector('tbody');
          var tr = document.createElement('tr');
          if(isInventorySchema){
            tr.innerHTML = `
              <td><input type="checkbox" class="hw-row-check" aria-label="행 선택"></td>
              <td data-col="type">
                <select>
                  <option value="" selected disabled>유형 선택 (필수)</option>
                  ${invTypeOptions.map(function(o){ return '<option value="'+o+'">'+o+'</option>'; }).join('')}
                </select>
              </td>
              <td data-col="model"><input type="text" placeholder="모델명 (필수)"></td>
              ${hasSpecCol? '<td data-col="spec"><input type="text" placeholder="용량(자동)" disabled></td>': ''}
              <td data-col="vendor"><input type="text" placeholder="제조사(자동)" disabled></td>
              <td data-col="qty"><input type="number" min="1" step="1" value="1" placeholder="수량 (필수)"></td>
              <td data-col="fw"><input type="text" placeholder="펌웨어"></td>
              <td data-col="remark"><input type="text" placeholder="비고"></td>
              <td class="system-actions table-actions">
                <button class="action-btn js-hw-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button>
                <button class="action-btn danger js-hw-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>
              </td>`;
          } else {
            // Build BAY options dynamically based on context (front: 16, rear: 8)
            var bayOptions = (function(){
              var opts = [];
              for(var i=1;i<=bayCount;i++){
                opts.push('<option value="BAY'+i+'">BAY'+i+'</option>');
              }
              return opts.join('');
            })();
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
          try{
            if(isInventorySchema && window.BlossomHwInventoryCatalog && typeof window.BlossomHwInventoryCatalog.enhanceRow === 'function'){
              window.BlossomHwInventoryCatalog.enhanceRow(tr);
            }
          }catch(_){ }
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
          hwDeleteRowFromApi(tr).then(function(){
            if(tr && tr.parentNode){ tr.parentNode.removeChild(tr); }
            try{ hwClampPage(); }catch(_){ }
            updateEmptyState();
          }).catch(function(err){ try{ console.error('[tab01-hardware] delete failed', err); }catch(_){ } });
          return;
        }
        // Toggle: edit -> save
        if(
          target.classList.contains('js-hw-edit') ||
          (target.classList.contains('js-hw-toggle') && target.getAttribute('data-action') === 'edit')
        ){
          // turn cells into inputs for inline edit
          function toInput(name, placeholder){
            var td = tr.querySelector('[data-col="'+name+'"]'); if(!td) return;
            var current = (td.textContent||'').trim();
            if(isInventorySchema){
              if(name==='type'){
                if(isSystemRow(tr)) return;
                var optionsInv = ['<option value=""'+(current?'':' selected')+' disabled>유형 선택 (필수)</option>']
                  .concat(invTypeOptions.map(function(o){ return '<option value="'+o+'"'+(o===current?' selected':'')+'>'+o+'</option>'; })).join('');
                td.innerHTML = '<select>'+optionsInv+'</select>';
                return;
              }
              if(name==='qty'){
                if(isSystemRow(tr)) return;
                var n0 = parseInt(current, 10);
                var v0 = (!isNaN(n0) && n0>0) ? n0 : 1;
                td.innerHTML = '<input type="number" min="1" step="1" value="'+v0+'" placeholder="수량 (필수)">';
                return;
              }
              if(isSystemRow(tr) && (name==='model' || name==='vendor' || name==='spec' || name==='qty')){
                return;
              }
              if(name==='spec' || name==='vendor'){
                td.innerHTML = '<input type="text" value="'+current+'" placeholder="'+(placeholder||'')+'" disabled>';
                return;
              }
              td.innerHTML = '<input type="text" value="'+current+'" placeholder="'+(placeholder||'')+'">';
              return;
            }
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
          var editCols;
          if(isInventorySchema){
            editCols = ['type','model'];
            if(hasSpecCol) editCols.push('spec');
            editCols = editCols.concat(['vendor','qty','fw','remark']);
          } else {
            editCols = ['type','space','model'];
            if(hasSpecCol) editCols.push('spec');
            editCols = editCols.concat(['serial','vendor','fw','remark']);
          }
          editCols.forEach(function(n){ toInput(n); });
          try{
            if(isInventorySchema && !isSystemRow(tr) && window.BlossomHwInventoryCatalog && typeof window.BlossomHwInventoryCatalog.enhanceRow === 'function'){
              window.BlossomHwInventoryCatalog.enhanceRow(tr);
            }
          }catch(_){ }
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
          // Validation: schema-specific required fields (system row is fw/remark-only)
          function getInput(name){
            var td = tr.querySelector('[data-col="'+name+'"]');
            return td ? td.querySelector('input, textarea') : null;
          }
          function getSelect(name){
            var td = tr.querySelector('[data-col="'+name+'"]');
            return td ? td.querySelector('select') : null;
          }
          function setError(input, on){
            if(!input) return;
            if(on){ input.classList.add('input-error'); input.setAttribute('aria-invalid','true'); }
            else { input.classList.remove('input-error'); input.removeAttribute('aria-invalid'); }
          }

          var firstInvalid = null;
          var sys = isSystemRow(tr);

          var modelInput = getInput('model');
          var modelVal = (modelInput? modelInput.value : (tr.querySelector('[data-col="model"]') ? (tr.querySelector('[data-col="model"]').textContent||'') : '')).trim();

          var typeSelect = getSelect('type');
          var typeVal = (typeSelect? typeSelect.value : (tr.querySelector('[data-col="type"]') ? (tr.querySelector('[data-col="type"]').textContent||'') : '')).trim();

          var spaceSelect = isInventorySchema ? null : getSelect('space');
          var spaceVal = spaceSelect ? String(spaceSelect.value||'').trim() : (isInventorySchema ? '' : ((tr.querySelector('[data-col="space"]') ? (tr.querySelector('[data-col="space"]').textContent||'') : '')).trim());

          var qtyInput = isInventorySchema ? (getInput('qty') || (function(){ var tdq = tr.querySelector('[data-col="qty"]'); return tdq? tdq.querySelector('input[type="number"], input'): null; })()) : null;
          var qtyVal = isInventorySchema ? String(qtyInput ? qtyInput.value : (tr.querySelector('[data-col="qty"]') ? (tr.querySelector('[data-col="qty"]').textContent||'') : '')).trim() : '';

          if(sys){
            typeVal = '시스템';
            if(isInventorySchema) qtyVal = '1';
            else spaceVal = '-';
          } else {
            if(!modelVal){ setError(modelInput, true); if(!firstInvalid) firstInvalid = modelInput; } else { setError(modelInput, false); }
            if(!typeVal){ setError(typeSelect, true); if(!firstInvalid) firstInvalid = typeSelect; } else { setError(typeSelect, false); }
            if(isInventorySchema){
              var qn = parseInt(qtyVal, 10);
              if(isNaN(qn) || qn<=0){ setError(qtyInput, true); if(!firstInvalid) firstInvalid = qtyInput; }
              else { setError(qtyInput, false); qtyVal = String(qn); }
            } else {
              if(!spaceVal){ setError(spaceSelect, true); if(!firstInvalid) firstInvalid = spaceSelect; }
              else { setError(spaceSelect, false); }
            }
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
          if(sys){
            var d = getPageSystemInfo();
            if(isInventorySchema){
              commit('type', '시스템');
              commit('model', d.model);
              if(hasSpecCol) commit('spec', '-');
              commit('vendor', d.vendor);
              commit('qty', 1);
            } else {
              commit('type', '시스템');
              commit('space', '-');
              commit('model', d.model);
              if(hasSpecCol) commit('spec', '-');
              commit('serial', d.serial);
              commit('vendor', d.vendor);
            }
          } else {
            if(isInventorySchema){
              commit('type', typeVal);
              commit('model', modelVal);
              if(hasSpecCol) commit('spec', read('spec'));
              commit('vendor', read('vendor'));
              commit('qty', qtyVal);
            } else {
              commit('type', typeVal);
              commit('space', spaceVal);
              commit('model', modelVal); // required, already validated non-empty
              if(hasSpecCol) commit('spec', read('spec'));
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
          updateEmptyState();
          // preserve visual selection state
          var cb = tr.querySelector('.hw-row-check'); if(cb){ var hidden = tr.hasAttribute('data-hidden') || tr.style.display==='none'; tr.classList.toggle('selected', !!cb.checked && !hidden); }
          // persist non-system rows
          hwPersistRowToApi(tr);
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
          baseCols = ['type','model'];
          if(hasSpecCol) baseCols.push('spec');
          baseCols = baseCols.concat(['vendor','qty','fw','remark']);
        } else {
          baseCols = ['type','space','model'];
          if(hasSpecCol) baseCols.push('spec');
          baseCols = baseCols.concat(['serial','vendor','fw','remark']);
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

      // Tab10 maintenance (legacy fallback): only run when the MT table exists.
      (function(){
        var table = document.getElementById('mt-spec-table');
        if(!table) return;


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

  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initSanswDetail);
  } else {
    initSanswDetail();
  }

  // No modal APIs to expose
})();

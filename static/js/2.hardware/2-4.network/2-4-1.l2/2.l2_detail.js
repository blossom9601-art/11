// 2.l2_detail.js: L2 Switch/Network detail page (common + basic-info only)

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

  function byId(id){ try{ return document.getElementById(id); }catch(_e){ return null; } }

  function openModalCompat(id){
    try{ if(typeof window.openModal === 'function'){ window.openModal(id); return; } }catch(_e){ }
    var el = byId(id);
    if(!el) return;
    document.body.classList.add('modal-open');
    el.classList.add('show');
    el.setAttribute('aria-hidden','false');
  }

  function closeModalCompat(id){
    try{ if(typeof window.closeModal === 'function'){ window.closeModal(id); return; } }catch(_e){ }
    var el = byId(id);
    if(!el) return;
    el.classList.remove('show');
    el.setAttribute('aria-hidden','true');
    if(!document.querySelector('.modal-overlay-full.show')){
      document.body.classList.remove('modal-open');
    }
  }

  function safeJsonParse(raw){
    try{ return raw ? JSON.parse(raw) : null; }catch(_e){ return null; }
  }

  function getStored(key){
    var raw = null;
    try{ raw = sessionStorage.getItem(key); }catch(_e0){ raw = null; }
    if(!raw){ try{ raw = localStorage.getItem(key); }catch(_e1){ raw = null; } }
    return raw;
  }

  function setStored(key, val){
    try{ sessionStorage.setItem(key, val); }catch(_e0){ }
    try{ localStorage.setItem(key, val); }catch(_e1){ }
  }

  function init(){
    // Sync header title/subtitle with latest selection from list page
    try{
      if(window.BlossomHardwareDetail && typeof window.BlossomHardwareDetail.initHeader === 'function'){
        window.BlossomHardwareDetail.initHeader({
          storagePrefix: 'l2',
          headerKeyPrefix: 'network_l2',
          titleIds: ['page-title'],
          subtitleIds: ['page-subtitle'],
          stripQueryParams: false
        });
      }
    }catch(_eHeaderSync){ }

    var storagePrefix = (typeof STORAGE_PREFIX !== 'undefined' && STORAGE_PREFIX) ? STORAGE_PREFIX : 'l2';
    var ASSET_API_BASE = '/api/hardware/network/l2/assets';

    // ---------- Detail tabs (moved to /static/js/_detail/*) ----------
    function initDetailTabScripts(){
      function loadScriptOnce(src, onReady){
        try{
          var existing = document.querySelector('script[src="'+src+'"], script[data-bls-src="'+src+'"]');
          if(existing){ if(onReady) onReady(); return; }
        }catch(_){ }
        var s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.dataset.blsSrc = src;
        s.onload = function(){ if(onReady) onReady(); };
        s.onerror = function(){ if(onReady) onReady(); };
        (document.head || document.documentElement).appendChild(s);
      }

      // Auto-initializing tabs
      if(byId('hw-spec-table')) loadScriptOnce('/static/js/_detail/tab01-hardware.js?v=10');
      if(byId('if-spec-table')) loadScriptOnce('/static/js/_detail/tab04-interface.js');
      if(byId('am-spec-table')) loadScriptOnce('/static/js/_detail/tab05-account.js');
      if(byId('tk-spec-table')) loadScriptOnce('/static/js/_detail/tab11-task.js');
      if(byId('lg-spec-table')) loadScriptOnce('/static/js/_detail/tab14-log.js');
      if(byId('fi-attach-input') || byId('fi-diagram-input') || byId('fi-attach-list') || byId('fi-diagram-box')) loadScriptOnce('/static/js/_detail/tab15-file.js');
    }

    function normalizeFromApi(item){
      var coreRaw = item ? item.is_core_system : null;
      var drRaw = item ? item.has_dr_site : null;
      var haRaw = item ? item.has_service_ha : null;
      var isCore = (coreRaw === 1 || coreRaw === true || coreRaw === '1');
      var hasDr = (drRaw === 1 || drRaw === true || drRaw === '1');
      var hasHa = (haRaw === 1 || haRaw === true || haRaw === '1');
      var coreFlag = (coreRaw == null ? '' : (isCore ? '핵심' : '일반'));
      var drFlag = (drRaw == null ? '' : (hasDr ? 'O' : 'X'));
      var haFlag = (haRaw == null ? '' : (hasHa ? 'O' : 'X'));
      return {
        id: item && item.id,
        asset_id: item && item.id,
        work_status: (item && (item.work_status_name || item.work_status_code)) || '',
        work_type: (item && (item.work_type_name || item.work_type_code || item.work_category_name || item.work_category_code)) || '',
        work_category: (item && (item.work_category_name || item.work_category_code || item.work_division_name || item.work_division_code)) || '',
        work_operation: (item && (item.work_operation_name || item.work_operation_code)) || '',
        work_group: (item && (item.work_group_name || item.work_group_code)) || '',
        work_name: (item && (item.work_name || item.asset_name)) || '',
        system_name: (item && item.system_name) || '',
        system_ip: (item && item.system_ip) || '',
        manage_ip: (item && (item.mgmt_ip || item.manage_ip)) || '',
        vendor: (item && (item.manufacturer_name || item.manufacturer_code)) || '',
        model: (item && (item.server_model_name || item.server_code || item.model_name || item.model_code)) || '',
        serial: (item && (item.serial_number || item.serial)) || '',
        virtualization: (item && (item.virtualization_type || item.virtualization)) || '',
        location_place: (item && (item.center_name || item.center_code)) || '',
        location_place_code: (item && item.center_code) || '',
        location_pos: (item && (item.rack_name || item.rack_code)) || '',
        location_pos_code: (item && item.rack_code) || '',
        slot: (item && (item.system_slot != null ? item.system_slot : item.slot) != null ? String(item.system_slot != null ? item.system_slot : item.slot) : ''),
        u_size: (item && (item.system_size != null ? item.system_size : item.u_size) != null ? String(item.system_size != null ? item.system_size : item.u_size) : ''),
        rack_face: (item && item.rack_face) || 'FRONT',
        sys_dept: (item && (item.system_dept_name || item.system_dept_code)) || '',
        sys_owner: (item && (item.system_owner_name || item.system_owner_emp_no)) || '',
        svc_dept: (item && (item.service_dept_name || item.service_dept_code)) || '',
        svc_owner: (item && (item.service_owner_name || item.service_owner_emp_no)) || '',
        confidentiality: (item && item.cia_confidentiality != null ? String(item.cia_confidentiality) : ''),
        integrity: (item && item.cia_integrity != null ? String(item.cia_integrity) : ''),
        availability: (item && item.cia_availability != null ? String(item.cia_availability) : ''),
        security_score: (item && item.security_score != null ? String(item.security_score) : ''),
        system_grade: (item && item.system_grade) || '',
        core_flag: coreFlag,
        dr_built: drFlag,
        svc_redundancy: haFlag
      };
    }

    function persistSelection(row){
      if(!row) return;
      try{ setStored(storagePrefix + ':selected:row', JSON.stringify(row)); }catch(_e0){}
      try{
        var id = row.id != null ? row.id : row.asset_id;
        if(id != null) setStored(storagePrefix + ':selected:asset_id', String(id));
      }catch(_e1){}
      try{ if(row.work_name) setStored('network_l2:selected:work_name', String(row.work_name)); }catch(_e2){}
      try{ if(row.system_name) setStored('network_l2:selected:system_name', String(row.system_name)); }catch(_e3){}
    }

    function getSelectedRow(){
      var raw = getStored(storagePrefix + ':selected:row');
      var row = safeJsonParse(raw);
      return (row && typeof row === 'object') ? row : null;
    }

    function getSelectedAssetId(row){
      var raw = getStored(storagePrefix + ':selected:asset_id');
      if(raw){
        var n = parseInt(String(raw), 10);
        if(n && n > 0) return n;
      }
      if(row && row.id != null){
        var n2 = parseInt(String(row.id), 10);
        if(n2 && n2 > 0) return n2;
      }
      if(row && row.asset_id != null){
        var n3 = parseInt(String(row.asset_id), 10);
        if(n3 && n3 > 0) return n3;
      }
      return null;
    }

    function setStatusPill(status){
      try{
        var textEl = document.querySelector('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill .status-text');
        if(textEl) textEl.textContent = status || '-';
        var dot = document.querySelector('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill .status-dot');
        if(dot){
          dot.classList.remove('ws-run','ws-idle','ws-wait');
          var cls = (status === '가동') ? 'ws-run' : ((status === '유휴') ? 'ws-idle' : 'ws-wait');
          dot.classList.add(cls);
        }
      }catch(_e){ }
    }

    function setText(sel, val){
      var el = null;
      try{ el = document.querySelector(sel); }catch(_e){ el = null; }
      if(el) el.textContent = (val == null || String(val).trim() === '') ? '-' : String(val);
    }

    function setBadge(sel, val){
      var el = null;
      try{ el = document.querySelector(sel); }catch(_e){ el = null; }
      if(el) el.textContent = (val == null || String(val).trim() === '') ? '-' : String(val);
    }

    function setNumBadge(sel, val, isSecurityScore){
      var badge = null;
      try{ badge = document.querySelector(sel); }catch(_e){ badge = null; }
      if(!badge) return;
      var txt = (val == null || String(val).trim() === '') ? '-' : String(val).trim();
      badge.textContent = txt;
      badge.classList.remove('tone-1','tone-2','tone-3');
      var n = parseInt(txt, 10);
      if(isNaN(n)){
        badge.classList.add('tone-1');
        return;
      }
      if(isSecurityScore){
        badge.classList.add(n >= 8 ? 'tone-3' : (n >= 6 ? 'tone-2' : 'tone-1'));
      } else {
        badge.classList.add(n >= 3 ? 'tone-3' : (n === 2 ? 'tone-2' : 'tone-1'));
      }
    }

    function setOX(rowSelector, val){
      var el = null;
      try{ el = document.querySelector(rowSelector + ' .ox-badge'); }catch(_e){ el = null; }
      if(!el) return;
      var t = (val == null ? '' : String(val)).trim();
      if(!t || t === '-' || t === '—'){
        el.textContent = '-';
        el.classList.remove('on','off');
        try{ el.setAttribute('aria-label',''); }catch(_e0){}
        return;
      }
      var mark = (t === 'O') ? 'O' : 'X';
      el.textContent = mark;
      el.classList.remove('on','off');
      el.classList.add(mark === 'O' ? 'on' : 'off');
      try{ el.setAttribute('aria-label', mark === 'O' ? '예' : '아니오'); }catch(_e1){}
    }

    function applyBasicInfo(row){
      if(!row) return;
      setStatusPill(row.work_status);

      setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(2) .info-value', row.work_type);
      setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(3) .info-value', row.work_category);
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(4) .info-value', row.work_operation);
      setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(5) .info-value', row.work_group);
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(6) .info-value', row.work_name);
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(7) .info-value', row.system_name);
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(8) .info-value', row.system_ip);
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(9) .info-value', row.manage_ip);

      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(1) .info-value', row.vendor);
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(2) .info-value', row.model);
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(3) .info-value', row.serial);
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(4) .info-value', row.virtualization);
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(5) .info-value', row.location_place);
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(6) .info-value', row.location_pos);
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(7) .info-value', row.slot);
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(8) .info-value', row.u_size);
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(9) .info-value', (row.rack_face === 'REAR') ? '후면' : '전면');

      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(1) .info-value', row.sys_dept);
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(2) .info-value', row.sys_owner);
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(3) .info-value', row.svc_dept);
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(4) .info-value', row.svc_owner);

      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(1) .num-badge', row.confidentiality, false);
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(2) .num-badge', row.integrity, false);
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(3) .num-badge', row.availability, false);
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(4) .num-badge', row.security_score, true);
      setText('.basic-info-card:nth-child(4) .info-row:nth-child(5) .info-value', row.system_grade);
      setText('.basic-info-card:nth-child(4) .info-row:nth-child(6) .info-value', row.core_flag);
      setOX('.basic-info-card:nth-child(4) .info-row:nth-child(7)', row.dr_built);
      setOX('.basic-info-card:nth-child(4) .info-row:nth-child(8)', row.svc_redundancy);

      try{
        localStorage.setItem('l2:current:vendor', String(row.vendor || ''));
        localStorage.setItem('l2:current:model', String(row.model || ''));
        localStorage.setItem('l2:current:serial', String(row.serial || ''));
        localStorage.setItem('l2:current:slot', String(row.slot || ''));
        localStorage.setItem('l2:current:u_size', String(row.u_size || ''));
        localStorage.setItem('l2:current:rack_face', String((row.rack_face) || ''));
      }catch(_e){ }
    }

    function updateDetailHeaderAndCards(row){
      if(!row) return;
      applyBasicInfo(row);
      try{
        var headerTitle = byId('page-title') || document.querySelector('.page-header h1');
        var headerSubtitle = byId('page-subtitle') || document.querySelector('.page-header p');
        if(headerTitle) headerTitle.textContent = String(row.work_name || '-');
        if(headerSubtitle) headerSubtitle.textContent = String(row.system_name || '-');
      }catch(_e){ }
    }

    // Page-size selects: mark as chosen after interaction so CSS can style
    (function(){
      function wireChosen(id){
        var sel = byId(id); if(!sel) return;
        function apply(){ try{ if(sel.value){ sel.classList.add('is-chosen'); } }catch(_e){} }
        try{ sel.addEventListener('change', apply); }catch(_e0){}
        apply();
      }
      ['lg-page-size','hw-page-size','if-page-size','am-page-size','mt-page-size','tk-page-size'].forEach(wireChosen);
    })();

    var currentRow = getSelectedRow();
    if(currentRow){
      updateDetailHeaderAndCards(currentRow);
    }

    var currentAssetId = getSelectedAssetId(currentRow);

    // Refresh basic-info from API (best-effort)
    (function(){
      if(!currentAssetId) return;
      try{
        var url = ASSET_API_BASE + '/' + encodeURIComponent(String(currentAssetId));
        var bhd = null;
        try{ bhd = window.BlossomHardwareDetail || null; }catch(_eB){ bhd = null; }

        if(bhd && typeof bhd.fetchJSON === 'function'){
          bhd.fetchJSON(url, { method: 'GET' })
            .then(function(json){
              if(!json || json.success !== true) return;
              if(!json.item) return;
              var row = normalizeFromApi(json.item);
              persistSelection(row);
              updateDetailHeaderAndCards(row);
            })
            .catch(function(_e){ });
        } else {
          fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
          })
          .then(function(r){ return r.json(); })
          .then(function(json){
            if(!json || json.success !== true) return;
            if(!json.item) return;
            var row = normalizeFromApi(json.item);
            persistSelection(row);
            updateDetailHeaderAndCards(row);
          })
          .catch(function(_e){ });
        }
      }catch(_e){ }
    })();

    // ---------- Basic-info edit modal ----------
    var EDIT_MODAL_ID = 'system-edit-modal';
    var EDIT_FORM_ID = 'system-edit-form';
    var EDIT_OPEN_ID = 'detail-edit-open';
    var EDIT_CLOSE_ID = 'system-edit-close';
    var EDIT_SAVE_ID = 'system-edit-save';

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

    function buildEditFormFromRow(row){
      var form = byId(EDIT_FORM_ID); if(!form) return;
      var data = row || getSelectedRow() || {};

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

        if(col === 'security_score'){
          return '<input name="security_score" class="form-input" type="number" readonly placeholder="자동 합계" value="'+esc(v)+'">';
        }
        if(col === 'model'){
          return '<input name="model" class="form-input" data-fk-allow="1" value="'+esc(v)+'">';
        }
        if(col === 'location_place'){
          var codeV = (data && data.location_place_code != null) ? String(data.location_place_code) : '';
          return '<input name="location_place" class="form-input" value="'+esc(codeV || v)+'">';
        }
        if(col === 'location_pos'){
          var codeV2 = (data && data.location_pos_code != null) ? String(data.location_pos_code) : '';
          return '<input name="location_pos" class="form-input" value="'+esc(codeV2 || v)+'">';
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
          return '<div class="form-row"><label>'+esc(meta.label)+'</label>'+fieldInput(c, data[c])+'</div>';
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
      if(el.tagName && el.tagName.toLowerCase() === 'select') return String(el.value || '');
      return String(el.value || '');
    }

    function readDisplayValue(el){
      if(!el) return '';
      if(el.tagName && el.tagName.toLowerCase() === 'select'){
        var opt = (el.selectedOptions && el.selectedOptions[0]) ? el.selectedOptions[0] : null;
        var txt = opt ? (opt.textContent || '').trim() : '';
        return txt || String(el.value || '');
      }
      return String(el.value || '');
    }

    function setField(payload, key, raw){
      if(raw == null){ payload[key] = null; return; }
      var s = String(raw).trim();
      if(s === '' || s === '선택'){
        payload[key] = null;
        return;
      }
      payload[key] = s;
    }

    function collectRowFromForm(form){
      function el(name){ return form.querySelector('[name="'+name+'"]'); }

      var FK_FIELDS = {
        work_type:1, work_category:1, work_status:1, work_operation:1, work_group:1,
        vendor:1, model:1,
        location_place:1, location_pos:1,
        sys_dept:1, sys_owner:1, svc_dept:1, svc_owner:1
      };

      function vDom(name){
        var element = el(name);
        return FK_FIELDS[name] ? readDisplayValue(element) : readValue(element);
      }

      return {
        id: currentAssetId,
        asset_id: currentAssetId,
        work_status: vDom('work_status'),
        work_type: vDom('work_type'),
        work_category: vDom('work_category'),
        work_operation: vDom('work_operation'),
        work_group: vDom('work_group'),
        work_name: vDom('work_name'),
        system_name: vDom('system_name'),
        system_ip: vDom('system_ip'),
        manage_ip: vDom('manage_ip'),
        vendor: vDom('vendor'),
        model: vDom('model'),
        serial: vDom('serial'),
        virtualization: vDom('virtualization'),
        location_place: vDom('location_place'),
        location_pos: vDom('location_pos'),
        location_place_code: readValue(el('location_place')),
        location_pos_code: readValue(el('location_pos')),
        slot: vDom('slot'),
        u_size: vDom('u_size'),
        sys_dept: vDom('sys_dept'),
        sys_owner: vDom('sys_owner'),
        svc_dept: vDom('svc_dept'),
        svc_owner: vDom('svc_owner'),
        confidentiality: vDom('confidentiality'),
        integrity: vDom('integrity'),
        availability: vDom('availability'),
        security_score: vDom('security_score'),
        system_grade: vDom('system_grade'),
        core_flag: vDom('core_flag'),
        dr_built: vDom('dr_built'),
        svc_redundancy: vDom('svc_redundancy')
      };
    }

    function buildPayloadFromForm(form){
      function el(name){ return form.querySelector('[name="'+name+'"]'); }
      function vRaw(name){ return readValue(el(name)); }

      var payload = {};

      setField(payload, 'work_type', vRaw('work_type'));
      setField(payload, 'work_category', vRaw('work_category'));
      setField(payload, 'work_status', vRaw('work_status'));
      setField(payload, 'work_operation', vRaw('work_operation'));
      setField(payload, 'work_group', vRaw('work_group'));

      setField(payload, 'work_name', vRaw('work_name'));
      setField(payload, 'system_name', vRaw('system_name'));
      setField(payload, 'system_ip', vRaw('system_ip'));
      setField(payload, 'mgmt_ip', vRaw('manage_ip'));

      setField(payload, 'vendor', vRaw('vendor'));
      setField(payload, 'model', vRaw('model'));
      setField(payload, 'serial', vRaw('serial'));
      setField(payload, 'virtualization_type', vRaw('virtualization'));
      setField(payload, 'center_code', vRaw('location_place'));
      setField(payload, 'rack_code', vRaw('location_pos'));

      setField(payload, 'slot', vRaw('slot'));
      setField(payload, 'u_size', vRaw('u_size'));

      setField(payload, 'system_department', vRaw('sys_dept'));
      setField(payload, 'system_owner', vRaw('sys_owner'));
      setField(payload, 'service_department', vRaw('svc_dept'));
      setField(payload, 'service_owner', vRaw('svc_owner'));

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

    function saveEdit(){
      var form = byId(EDIT_FORM_ID); if(!form) return;

      var rowDraft = collectRowFromForm(form);
      persistSelection(rowDraft);
      updateDetailHeaderAndCards(rowDraft);

      if(!currentAssetId){
        closeModalCompat(EDIT_MODAL_ID);
        return;
      }

      var saveBtn = byId(EDIT_SAVE_ID);
      try{ if(saveBtn){ saveBtn.disabled = true; saveBtn.setAttribute('aria-disabled','true'); } }catch(_e0){}

      var payload = buildPayloadFromForm(form);
      fetch(ASSET_API_BASE + '/' + encodeURIComponent(String(currentAssetId)), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload || {})
      })
      .then(function(r){ return r.json().then(function(j){ return { ok: r.ok, json: j }; }, function(){ return { ok: r.ok, json: null }; }); })
      .then(function(res){
        if(!res.ok || !res.json || res.json.success !== true){
          var msg = (res.json && res.json.message) ? res.json.message : '저장에 실패했습니다.';
          try{ alert(msg); }catch(_e1){}
          return;
        }
        if(res.json.item){
          var row = normalizeFromApi(res.json.item);
          persistSelection(row);
          updateDetailHeaderAndCards(row);
        }
        closeModalCompat(EDIT_MODAL_ID);
      })
      .catch(function(err){
        try{ console.error(err); }catch(_e2){}
        try{ alert((err && err.message) ? err.message : '저장 중 오류가 발생했습니다.'); }catch(_e3){}
      })
      .finally(function(){
        try{ if(saveBtn){ saveBtn.disabled = false; saveBtn.setAttribute('aria-disabled','false'); } }catch(_e4){}
      });
    }

    // Wire edit modal
    (function(){
      var openBtn = byId(EDIT_OPEN_ID);
      if(openBtn){
        openBtn.addEventListener('click', function(){
          buildEditFormFromRow(getSelectedRow());
          try{
            var modal = byId(EDIT_MODAL_ID);
            if(modal && window.BlossomFkSelect && typeof window.BlossomFkSelect.enhance === 'function'){
              window.BlossomFkSelect.enhance(modal, { forcePopulate: true });
            }
          }catch(_e){ }
          openModalCompat(EDIT_MODAL_ID);
        });
      }

      var closeBtn = byId(EDIT_CLOSE_ID);
      if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalCompat(EDIT_MODAL_ID); }); }

      var modalEl = byId(EDIT_MODAL_ID);
      if(modalEl){
        modalEl.addEventListener('click', function(e){ if(e.target === modalEl) closeModalCompat(EDIT_MODAL_ID); });
        document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && modalEl.classList.contains('show')) closeModalCompat(EDIT_MODAL_ID); });
      }

      var saveBtn = byId(EDIT_SAVE_ID);
      if(saveBtn){ saveBtn.addEventListener('click', saveEdit); }
    })();

    // Start tab scripts (based on elements present)
    initDetailTabScripts();

    // Expose a tiny debug hook
    try{ window.__BLOSSOM_L2_DETAIL__ = { storagePrefix: storagePrefix, apiBase: ASSET_API_BASE }; }catch(_e){ }
  }

  try{
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', init, { once: true });
    }else{
      init();
    }
  }catch(_e){
    try{ init(); }catch(_e2){}
  }
})();

// Sentinel: if this is missing, the script likely failed to load/parse.
window.__BLOSSOM_L2_DETAIL_JS_LOADED__ = 'v2.7';

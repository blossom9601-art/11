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
  function __detailMain(){
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

    var __cfg = (window.__DETAIL_CONFIG__ || {});

    // WIPS detail: API + storage (configurable for other security devices)
    var STORAGE_PREFIX = __cfg.storagePrefix || 'wips';
    var API_ENDPOINT = __cfg.apiEndpoint || '/api/hardware/security/wips/assets';
    var DEVICE_TYPE_TOKEN = String(__cfg.deviceTypeToken || 'WIPS').trim().toUpperCase();
    var DEFAULT_TITLE = __cfg.defaultTitle || 'WIPS';
    var masterCache = null;
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
    var NUMERIC_PAYLOAD_KEYS = new Set(['cia_confidentiality','cia_integrity','cia_availability','security_score','system_slot','system_size']);

    var currentAssetId = null;
    var currentAssetItem = null;

    function notify(msg, type){
      var t = String(type || '').toLowerCase();
      if(t !== 'error') return;
      try{ alert(String(msg||'')); }catch(_e){}
    }

    async function apiJSON(url, options){
      var opts = options || {};
      var headers = opts.headers || {};
      headers['Accept'] = 'application/json';
      if(opts.body != null) headers['Content-Type'] = 'application/json';
      var res = await fetch(url, { method: opts.method || 'GET', headers: headers, body: opts.body, credentials: 'same-origin' });
      var data = null;
      try{ data = await res.json(); }catch(_e){ data = null; }
      if(!res.ok || !data || data.success === false){
        var msg = (data && (data.message || data.error)) ? (data.message || data.error) : ('HTTP ' + res.status);
        throw new Error(msg);
      }
      return data;
    }

    function escapeHTML(v){
      return String(v||'').replace(/[&<>"']/g, function(c){
        return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c] || c);
      });
    }

    function hexToRgbArray(hex){
      if(!hex) return null;
      var s = String(hex).trim();
      if(!s) return null;
      if(s[0] === '#') s = s.slice(1);
      if(s.length === 3){
        s = s[0]+s[0]+s[1]+s[1]+s[2]+s[2];
      }
      if(s.length !== 6) return null;
      var r = parseInt(s.slice(0,2), 16);
      var g = parseInt(s.slice(2,4), 16);
      var b = parseInt(s.slice(4,6), 16);
      if([r,g,b].some(function(n){ return isNaN(n); })) return null;
      return [r,g,b];
    }

    function renderWorkStatusPill(label, customColor, tokenClass){
      var v = String(label == null ? '-' : label);
      var txt = escapeHTML(v && v.trim() ? v : '-');
      if(customColor){
        var rgb = hexToRgbArray(customColor);
        var styleParts = ['--status-dot-color:' + String(customColor)];
        if(rgb){
          var rgbStr = rgb.join(',');
          styleParts.push('--status-bg-color:rgba(' + rgbStr + ',0.16)');
          styleParts.push('--status-border-color:rgba(' + rgbStr + ',0.45)');
        }
        var styleAttr = styleParts.length ? ' style="' + styleParts.join(';') + '"' : '';
        return '<span class="status-pill colored"'+styleAttr+'><span class="status-dot" aria-hidden="true"></span><span class="status-text">'+txt+'</span></span>';
      }
      var cls = String(tokenClass || '').trim();
      if(!cls){
        if(v === '가동') cls = 'ws-run';
        else if(v === '유휴') cls = 'ws-idle';
        else cls = 'ws-wait';
      }
      return '<span class="status-pill"><span class="status-dot '+escapeHTML(cls)+'" aria-hidden="true"></span><span class="status-text">'+txt+'</span></span>';
    }

    function renderOxBadge(ox){
      var v = String(ox == null ? '' : ox).trim().toUpperCase();
      if(v !== 'O' && v !== 'X'){
        // Match workstation detail: empty is '-' inside a plain ox-badge (no on/off)
        return '<span class="cell-ox with-badge"><span class="ox-badge" aria-label="">-</span></span>';
      }
      return '<span class="cell-ox with-badge"><span class="ox-badge '+(v==='O'?'on':'off')+'" aria-label="'+(v==='O'?'예':'아니오')+'">'+v+'</span></span>';
    }

    function renderNumBadge(value, kind){
      var s = String(value == null ? '' : value).trim();
      if(!s){
        // Match workstation detail: empty is '-' inside a plain num-badge (no tone class)
        return '<span class="cell-num"><span class="num-badge">-</span></span>';
      }
      var n = parseInt(s, 10);
      var tone = 'tone-1';
      if(!isNaN(n)){
        if(kind === 'security_score'){
          tone = (n >= 8) ? 'tone-3' : (n >= 6 ? 'tone-2' : 'tone-1');
        } else {
          tone = (n >= 3) ? 'tone-3' : (n === 2 ? 'tone-2' : 'tone-1');
        }
      }
      var show = isNaN(n) ? escapeHTML(s) : String(n);
      // Match workstation detail: '-' or non-numeric stays as a plain num-badge.
      if(String(show).trim() === '-' || isNaN(n)){
        return '<span class="cell-num"><span class="num-badge">'+(String(show).trim() ? show : '-')+'</span></span>';
      }
      return '<span class="cell-num"><span class="num-badge '+tone+'">'+show+'</span></span>';
    }

    async function ensureMasters(){
      if(masterCache) return masterCache;
      var endpoints = {
        workCategories: '/api/work-categories',
        workDivisions: '/api/work-divisions',
        workStatuses: '/api/work-statuses',
        workOperations: '/api/work-operations',
        workGroups: '/api/work-groups',
        vendors: '/api/vendor-manufacturers',
        serverModels: '/api/hw-server-types',
        securityModels: '/api/hw-security-types',
        centers: '/api/org-centers',
        racks: '/api/org-racks',
        depts: '/api/org-departments',
        users: '/api/user-profiles'
      };
      var results = await Promise.all(Object.keys(endpoints).map(async function(k){
        try{
          var data = await apiJSON(endpoints[k], { method:'GET' });
          return [k, data.items || []];
        }catch(_e){
          return [k, []];
        }
      }));
      masterCache = {};
      results.forEach(function(pair){ masterCache[pair[0]] = pair[1]; });

      // Build device model list (prefer hw_server_type; fallback to hw_security_type)
      try{
        var server = (masterCache.serverModels || []).filter(function(it){
          return String(it.form_factor || it.hw_type || it.type || '').trim().toUpperCase() === DEVICE_TYPE_TOKEN;
        });
        if(server.length){
          masterCache.models = server.map(function(it){
            return {
              server_code: it.server_code,
              model_name: it.model_name,
              manufacturer_code: it.manufacturer_code,
              form_factor: it.form_factor
            };
          });
          masterCache.modelValueKey = 'server_code';
        } else {
          var sec = (masterCache.securityModels || []).filter(function(it){
            return String(it.security_type || it.hw_type || it.type || '').trim().toUpperCase() === DEVICE_TYPE_TOKEN;
          });
          masterCache.models = sec.map(function(it){
            return {
              server_code: it.security_code,
              model_name: it.model_name,
              manufacturer_code: it.manufacturer_code,
              form_factor: it.security_type
            };
          });
          masterCache.modelValueKey = 'server_code';
        }
      }catch(_e2){
        masterCache.models = [];
        masterCache.modelValueKey = 'server_code';
      }

      // Build quick lookup maps for display rendering (code -> name)
      (function(){
        function s(v){ return (v == null) ? '' : String(v).trim(); }
        function pickName(it, keys){
          if(!it || !keys) return '';
          for(var i=0;i<keys.length;i++){
            var k = keys[i];
            var v = s(it[k]);
            if(v) return v;
          }
          return '';
        }
        function build(items, codeKey, nameKeys){
          var map = new Map();
          (Array.isArray(items) ? items : []).forEach(function(it){
            var code = s(it && it[codeKey]);
            if(!code) return;
            var name = pickName(it, nameKeys);
            map.set(code, name || code);
          });
          return map;
        }

        masterCache.lookup = {
          workTypeByCode: build(masterCache.workCategories, 'category_code', ['wc_name','category_name','category_code']),
          workCategoryByCode: build(masterCache.workDivisions, 'division_code', ['wc_name','division_name','division_code']),
          workStatusByCode: build(masterCache.workStatuses, 'status_code', ['wc_name','status_name','status_code']),
          workOperationByCode: build(masterCache.workOperations, 'operation_code', ['wc_name','operation_name','operation_code']),
          workGroupByCode: build(masterCache.workGroups, 'group_code', ['group_name','wc_name','group_code']),
          vendorByCode: build(masterCache.vendors, 'manufacturer_code', ['manufacturer_name','manufacturer_code']),
          modelByCode: build(masterCache.models, 'server_code', ['model_name','server_code']),
          centerByCode: build(masterCache.centers, 'center_code', ['center_name','center_code']),
          rackByCode: build(masterCache.racks, 'rack_code', ['rack_name','rack_position','rack_code']),
          deptByCode: build(masterCache.depts, 'dept_code', ['dept_name','dept_code']),
          userByEmpNo: build(masterCache.users, 'emp_no', ['name','emp_no'])
        };
      })();
      return masterCache;
    }

    function buildSelect(name, items, valueKey, labelFn, selectedValue, extraClass, extraAttrs){
      var sel = String(selectedValue == null ? '' : selectedValue);
      var opts = ['<option value="">-</option>'];
      (items || []).forEach(function(it){
        var val = it && it[valueKey] != null ? String(it[valueKey]) : '';
        if(!val) return;
        var label = labelFn ? String(labelFn(it, val) || '') : val;
        if(!label) label = val;
        var selected = (val === sel) ? ' selected' : '';
        opts.push('<option value="'+escapeHTML(val)+'"'+selected+'>'+escapeHTML(label)+'</option>');
      });
      var cls = 'form-input' + (extraClass ? (' ' + String(extraClass)) : '');
      var attrs = extraAttrs ? String(extraAttrs) : '';
      return '<select name="'+escapeHTML(name)+'" class="'+escapeHTML(cls)+'" '+attrs+'>'+opts.join('')+'</select>';
    }

    var REQUIRED_MODAL_FIELDS = [
      { name:'work_status' },
      { name:'work_name' },
      { name:'system_name' }
    ];

    function applyRequiredRulesToModalForm(form){
      if(!form) return;
      REQUIRED_MODAL_FIELDS.forEach(function(f){
        var el = form.querySelector('[name="'+f.name+'"]');
        if(!el) return;
        try{ el.setAttribute('required', 'required'); }catch(_e){}
        try{
          var row = el.closest ? el.closest('.form-row') : null;
          var label = row ? row.querySelector('label') : null;
          if(label && !label.querySelector('.req-star')){
            label.insertAdjacentHTML('beforeend', '<span class="req-star">*</span>');
          }
        }catch(_e2){}
      });
    }

    function clearModalValidationState(form){
      if(!form) return;
      try{ form.classList.remove('show-required-errors'); }catch(_e){}
      try{ form.querySelectorAll('.input-error').forEach(function(el){ el.classList.remove('input-error'); }); }catch(_e2){}
      try{ form.querySelectorAll('.fk-searchable-control.is-invalid').forEach(function(w){ w.classList.remove('is-invalid'); }); }catch(_e3){}
    }

    function validateRequiredModalForm(form){
      if(!form) return true;
      var firstInvalid = null;
      try{ form.classList.add('show-required-errors'); }catch(_e0){}
      REQUIRED_MODAL_FIELDS.forEach(function(f){
        var el = form.querySelector('[name="'+f.name+'"]');
        if(!el) return;
        var v = (el.value == null) ? '' : String(el.value).trim();
        var ok = v !== '';
        if(!ok){
          if(!firstInvalid) firstInvalid = el;
          try{ el.classList.add('input-error'); }catch(_e1){}
          try{ el.setAttribute('aria-invalid', 'true'); }catch(_e2){}
          try{ var w = el.closest ? el.closest('.fk-searchable-control') : null; if(w) w.classList.add('is-invalid'); }catch(_e3){}
        } else {
          try{ el.classList.remove('input-error'); }catch(_e4){}
          try{ el.removeAttribute('aria-invalid'); }catch(_e5){}
          try{ var w2 = el.closest ? el.closest('.fk-searchable-control') : null; if(w2) w2.classList.remove('is-invalid'); }catch(_e6){}
        }
      });
      if(firstInvalid){
        try{
          var wrap = firstInvalid.closest ? firstInvalid.closest('.fk-searchable-control') : null;
          if(wrap){
            var btn = wrap.querySelector('.fk-searchable-display');
            if(btn) btn.focus();
          } else {
            firstInvalid.focus();
          }
        }catch(_e7){}
        return false;
      }
      return true;
    }

    function captureInitialFormValues(form){
      if(!form) return;
      try{
        Array.from(form.querySelectorAll('input[name], select[name], textarea[name]')).forEach(function(el){
          try{ el.dataset.initialValue = String(el.value == null ? '' : el.value); }catch(_e){}
          try{ delete el.dataset.userCleared; }catch(_e2){}
        });
      }catch(_e3){}
    }

    function syncSearchableSelectUI(el){
      try{
        if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function'){
          window.BlossomSearchableSelect.enhance(el);
        }
      }catch(_e){}
    }

    function markUserCleared(el){
      if(!el) return;
      try{ el.dataset.userCleared = '1'; }catch(_e){}
    }

    // Track explicit user clears ("지움") so empty values can be persisted as NULL.
    // This complements initialValue-based detection and makes behavior consistent
    // even when the clear happens through custom searchable-select UI.
    function wireExplicitClearTracking(form){
      if(!form) return;
      function isRequiredField(name){ return name === 'work_status' || name === 'work_name' || name === 'system_name'; }
      function getInitial(el){
        try{
          if(el && el.dataset && Object.prototype.hasOwnProperty.call(el.dataset, 'initialValue')){
            return String(el.dataset.initialValue || '');
          }
        }catch(_e0){}
        return null;
      }
      function onChangeOrInput(el){
        try{
          if(!el || !el.dataset) return;
          var name = String(el.getAttribute('name') || '').trim();
          if(!name) return;
          var v = String(el.value == null ? '' : el.value).trim();
          if(v === ''){
            // Don't attempt to persist clear for required fields.
            if(isRequiredField(name)) return;
            var initial = getInitial(el);
            if(initial != null && String(initial).trim() !== ''){
              el.dataset.userCleared = '1';
            }
          } else {
            // If user re-enters a value, cancel the clear.
            try{ delete el.dataset.userCleared; }catch(_e1){ el.dataset.userCleared = '0'; }
          }
        }catch(_e2){}
      }

      try{
        Array.from(form.querySelectorAll('input[name], select[name], textarea[name]')).forEach(function(el){
          el.addEventListener('change', function(){ onChangeOrInput(el); });
          el.addEventListener('input', function(){ onChangeOrInput(el); });
        });
      }catch(_e3){}
    }

    function wireBasicInfoDependencies(form){
      if(!form) return;
      function setDisabled(el, disabled){
        if(!el) return;
        el.disabled = !!disabled;
        syncSearchableSelectUI(el);
      }
      function clearValue(el){
        if(!el) return;
        try{ el.value = ''; }catch(_e){}
        markUserCleared(el);
        try{ el.dispatchEvent(new Event('change', { bubbles:true })); }catch(_e2){}
        syncSearchableSelectUI(el);
      }

      var vendor = form.querySelector('[name="vendor"]');
      var model = form.querySelector('[name="model"]');
      if(vendor && model){
        function applyVendor(){
          var has = !!(vendor.value && String(vendor.value).trim());
          if(!has){ clearValue(model); setDisabled(model, true); }
          else { setDisabled(model, false); }
        }
        vendor.addEventListener('change', applyVendor);
        applyVendor();
      }

      var center = form.querySelector('[name="location_place"]');
      var rack = form.querySelector('[name="location_pos"]');
      if(center && rack){
        function applyCenter(){
          var has = !!(center.value && String(center.value).trim());
          if(!has){ clearValue(rack); setDisabled(rack, true); }
          else { setDisabled(rack, false); }
        }
        center.addEventListener('change', applyCenter);
        applyCenter();
      }

      var sysDept = form.querySelector('[name="sys_dept"]');
      var sysOwner = form.querySelector('[name="sys_owner"]');
      if(sysDept && sysOwner){
        function applySysDept(){
          var has = !!(sysDept.value && String(sysDept.value).trim());
          if(!has){ clearValue(sysOwner); setDisabled(sysOwner, true); }
          else { setDisabled(sysOwner, false); }
        }
        sysDept.addEventListener('change', applySysDept);
        applySysDept();
      }

      var svcDept = form.querySelector('[name="svc_dept"]');
      var svcOwner = form.querySelector('[name="svc_owner"]');
      if(svcDept && svcOwner){
        function applySvcDept(){
          var has = !!(svcDept.value && String(svcDept.value).trim());
          if(!has){ clearValue(svcOwner); setDisabled(svcOwner, true); }
          else { setDisabled(svcOwner, false); }
        }
        svcDept.addEventListener('change', applySvcDept);
        applySvcDept();
      }

      // Clear required-field error state when user edits
      REQUIRED_MODAL_FIELDS.forEach(function(f){
        var el = form.querySelector('[name="'+f.name+'"]');
        if(!el) return;
        el.addEventListener('input', function(){ try{ el.classList.remove('input-error'); }catch(_e){} });
        el.addEventListener('change', function(){ try{ el.classList.remove('input-error'); }catch(_e2){} });
      });
    }

    async function buildEditFormFromAssetItem(item){
      var form = document.getElementById(EDIT_FORM_ID); if(!form) return;
      var m = await ensureMasters();

      var data = {
        work_type: item.work_type_code || '',
        work_category: item.work_category_code || '',
        work_status: item.work_status_code || '',
        work_operation: item.work_operation_code || '',
        work_group: item.work_group_code || '',
        work_name: item.work_name || '',
        system_name: item.system_name || '',
        system_ip: item.system_ip || '',
        manage_ip: item.mgmt_ip || '',
        vendor: item.manufacturer_code || '',
        model: item.server_code || '',
        serial: item.serial_number || item.serial || '',
        virtualization: normalizeVirtualizationLabel(item.virtualization_type),
        location_place: item.center_code || '',
        location_pos: item.rack_code || '',
        slot: item.slot != null ? String(item.slot) : '',
        u_size: item.u_size != null ? String(item.u_size) : '',
        sys_dept: item.system_dept_code || '',
        sys_owner: item.system_owner_emp_no || '',
        svc_dept: item.service_dept_code || '',
        svc_owner: item.service_owner_emp_no || '',
        confidentiality: item.cia_confidentiality != null ? String(item.cia_confidentiality) : '',
        integrity: item.cia_integrity != null ? String(item.cia_integrity) : '',
        availability: item.cia_availability != null ? String(item.cia_availability) : '',
        security_score: item.security_score != null ? String(item.security_score) : '',
        system_grade: item.system_grade || '',
        core_flag: toCoreFlag(item.is_core_system) || '',
        dr_built: toOX(item.has_dr_site) || '',
        svc_redundancy: toOX(item.has_service_ha) || ''
      };

      function row(label, inputHtml){ return '<div class="form-row"><label>'+escapeHTML(label)+'</label>'+inputHtml+'</div>'; }
      function input(name, value, extra){ var attrs = extra || ''; return '<input name="'+escapeHTML(name)+'" class="form-input" value="'+escapeHTML(value||'')+'" '+attrs+'>'; }
      function numInput(name, value){ return '<input name="'+escapeHTML(name)+'" class="form-input" type="number" min="0" step="1" value="'+escapeHTML(value||'')+'">'; }
      function staticSelect(name, options, selected, extraClass){
        var sel = String(selected||'');
        var opts = options.map(function(o){
          var v = o || '';
          var s = (String(v) === sel) ? ' selected' : '';
          return '<option value="'+escapeHTML(v)+'"'+s+'>'+(v?escapeHTML(v):'-')+'</option>';
        }).join('');
        var cls = 'form-input' + (extraClass ? (' ' + String(extraClass)) : '');
        return '<select name="'+escapeHTML(name)+'" class="'+escapeHTML(cls)+'">'+opts+'</select>';
      }

      var GROUPS = [
        { title:'비즈니스', rows: function(){
          return [
            row('업무 상태', buildSelect('work_status', m.workStatuses, 'status_code', function(it){ return it.wc_name || it.status_name || it.status_code; }, data.work_status, 'search-select')),
            row('업무 분류', buildSelect('work_type', m.workCategories, 'category_code', function(it){ return it.wc_name || it.category_name || it.category_code; }, data.work_type, 'search-select')),
            row('업무 구분', buildSelect('work_category', m.workDivisions, 'division_code', function(it){ return it.wc_name || it.division_name || it.division_code; }, data.work_category, 'search-select')),
            row('업무 운영', buildSelect('work_operation', m.workOperations, 'operation_code', function(it){ return it.wc_name || it.operation_name || it.operation_code; }, data.work_operation, 'search-select')),
            row('업무 그룹', buildSelect('work_group', m.workGroups, 'group_code', function(it){ return it.group_name || it.group_code; }, data.work_group, 'search-select')),
            row('업무 이름', input('work_name', data.work_name)),
            row('시스템 이름', input('system_name', data.system_name)),
            row('시스템 IP', input('system_ip', data.system_ip)),
            row('관리 IP', input('manage_ip', data.manage_ip))
          ];
        }},
        { title:'시스템', rows: function(){
          return [
            row('시스템 제조사', buildSelect('vendor', m.vendors, 'manufacturer_code', function(it){ return it.manufacturer_name || it.manufacturer_code; }, data.vendor, 'search-select')),
            row('시스템 모델명', buildSelect('model', m.models, 'server_code', function(it){ return it.model_name || it.server_code; }, data.model, 'search-select')),
            row('시스템 일련번호', input('serial', data.serial)),
            row('시스템 가상화', staticSelect('virtualization', ['', '물리', '가상'], data.virtualization, 'search-select')),
            row('시스템 장소', buildSelect('location_place', m.centers, 'center_code', function(it){
              var parts=[]; if(it.center_name) parts.push(it.center_name); if(it.location) parts.push(it.location); if(it.usage) parts.push(it.usage);
              return parts.join(' · ') || it.center_code;
            }, data.location_place, 'search-select')),
            row('시스템 위치', buildSelect('location_pos', m.racks, 'rack_code', function(it){ return it.rack_name || it.rack_position || it.rack_code; }, data.location_pos, 'search-select')),
            row('시스템 슬롯', numInput('slot', data.slot)),
            row('시스템 크기', numInput('u_size', data.u_size))
          ];
        }},
        { title:'담당자', rows: function(){
          return [
            row('시스템 담당부서', buildSelect('sys_dept', m.depts, 'dept_code', function(it){ return it.dept_name || it.dept_code; }, data.sys_dept, 'search-select')),
            row('시스템 담당자', buildSelect('sys_owner', m.users, 'emp_no', function(it){ return (it.name ? (it.name+' ('+it.emp_no+')') : it.emp_no); }, data.sys_owner, 'search-select')),
            row('서비스 담당부서', buildSelect('svc_dept', m.depts, 'dept_code', function(it){ return it.dept_name || it.dept_code; }, data.svc_dept, 'search-select')),
            row('서비스 담당자', buildSelect('svc_owner', m.users, 'emp_no', function(it){ return (it.name ? (it.name+' ('+it.emp_no+')') : it.emp_no); }, data.svc_owner, 'search-select'))
          ];
        }},
        { title:'점검', rows: function(){
          return [
            row('기밀성', staticSelect('confidentiality', ['', '1', '2', '3'], data.confidentiality, 'search-select')),
            row('무결성', staticSelect('integrity', ['', '1', '2', '3'], data.integrity, 'search-select')),
            row('가용성', staticSelect('availability', ['', '1', '2', '3'], data.availability, 'search-select')),
            row('보안 점수', '<input name="security_score" class="form-input" type="number" readonly placeholder="자동 합계" value="'+escapeHTML(data.security_score||'')+'">'),
            row('시스템 등급', staticSelect('system_grade', ['', '1등급', '2등급', '3등급'], data.system_grade, 'search-select')),
            row('핵심/일반', staticSelect('core_flag', ['', '핵심', '일반'], data.core_flag, 'search-select')),
            row('DR 구축여부', staticSelect('dr_built', ['', 'O', 'X'], data.dr_built, 'search-select')),
            row('서비스 이중화', staticSelect('svc_redundancy', ['', 'O', 'X'], data.svc_redundancy, 'search-select'))
          ];
        }}
      ];

      var html = GROUPS.map(function(g){
        var grid = g.rows().join('');
        return '<div class="form-section"><div class="section-header"><h4>'+escapeHTML(g.title)+'</h4></div><div class="form-grid">'+grid+'</div></div>';
      }).join('');
      form.innerHTML = html;
      clearModalValidationState(form);
      applyRequiredRulesToModalForm(form);
      // Searchable select enhancer will render "지움" buttons for selects with empty option.
      try{ if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){ window.BlossomSearchableSelect.syncAll(form); } }catch(_e0){}
      attachSecurityScoreRecalc(EDIT_FORM_ID);
      wireBasicInfoDependencies(form);
      captureInitialFormValues(form);
      wireExplicitClearTracking(form);
    }

    function normalizeVirtualizationLabel(raw){
      if(!raw) return '';
      var value = String(raw).trim();
      if(value.toLowerCase() === 'physical') return '물리';
      if(value.toLowerCase() === 'virtual') return '가상';
      return value;
    }
    function normalizeLabel(name, code){ return (name || code || ''); }
    function toCoreFlag(v){
      if(v == null) return '';
      if(typeof v === 'boolean') return v ? '핵심' : '일반';
      var s = String(v).trim();
      if(!s) return '';
      if(s === '1' || s.toLowerCase() === 'true' || s === '핵심') return '핵심';
      if(s === '0' || s.toLowerCase() === 'false' || s === '일반') return '일반';
      return s;
    }
    function toOX(v){
      if(v == null) return '';
      if(typeof v === 'boolean') return v ? 'O' : 'X';
      var s = String(v).trim().toUpperCase();
      if(s === 'O' || s === 'X') return s;
      if(s === '1' || s === 'TRUE') return 'O';
      if(s === '0' || s === 'FALSE') return 'X';
      return '';
    }

    function resolveAssetId(){
      // 1) Querystring
      try{
        var qs = new URLSearchParams(location.search || '');
        var cand = qs.get('hardware_id') || qs.get('hardwareId') || qs.get('asset_id') || qs.get('assetId') || qs.get('id');
        var n1 = parseInt(cand, 10);
        if(!isNaN(n1) && n1 > 0) return n1;
      }catch(_e){}
      // 2) Dedicated key
      try{
        var raw = sessionStorage.getItem(STORAGE_PREFIX+':selected:asset_id') || localStorage.getItem(STORAGE_PREFIX+':selected:asset_id');
        var n2 = parseInt(raw, 10);
        if(!isNaN(n2) && n2 > 0) return n2;
      }catch(_e2){}
      // 3) Selected row
      try{
        var rawRow = sessionStorage.getItem(STORAGE_PREFIX+':selected:row') || localStorage.getItem(STORAGE_PREFIX+':selected:row');
        if(rawRow){
          var row = JSON.parse(rawRow);
          var id = row && (row.hardware_id != null ? row.hardware_id : (row.asset_id != null ? row.asset_id : row.id));
          var n3 = parseInt(id, 10);
          if(!isNaN(n3) && n3 > 0) return n3;
        }
      }catch(_e3){}
      return null;
    }

    function stripAssetIdFromUrl(){
      try{
        var u = new URL(window.location.href);
        var changed = false;
        ['asset_id','assetId','id'].forEach(function(k){
          try{ if(u.searchParams.has(k)){ u.searchParams.delete(k); changed = true; } }catch(_e0){}
        });
        if(!changed) return;
        history.replaceState(null, document.title, u.pathname + (u.search || '') + (u.hash || ''));
      }catch(_e1){}
    }

    function decorateTabLinksWithAssetId(assetId){
      if(!assetId) return;
      var tabs = document.querySelectorAll('.server-detail-tabs a');
      if(!tabs || !tabs.length) return;
      try{
        Array.from(tabs).forEach(function(a){
          try{
            var href = a.getAttribute('href') || '';
            if(!href) return;
            if(/^https?:\/\//i.test(href)) return;
            if(href.indexOf('asset_id=') > -1 || href.indexOf('assetId=') > -1) return;
            var sep = href.indexOf('?') > -1 ? '&' : '?';
            a.setAttribute('href', href + sep + 'asset_id=' + encodeURIComponent(String(assetId)));
          }catch(_e2){}
        });
      }catch(_e1){}
    }

    function getInfoRowText(cardIndex, rowIndex){
      var row = document.querySelector('.basic-info-card:nth-child('+cardIndex+') .info-row:nth-child('+rowIndex+')');
      if(!row) return '';
      var el = row.querySelector('.status-text, .info-value, .num-badge, .ox-badge, .info-value');
      if(el) return String(el.textContent || '').trim();
      return String(row.textContent || '').trim();
    }
    function setInfoRowValue(cardIndex, rowIndex, value){
      var row = document.querySelector('.basic-info-card:nth-child('+cardIndex+') .info-row:nth-child('+rowIndex+')');
      if(!row) return;
      var v = (value == null) ? '' : String(value);
      var textEl = row.querySelector('.status-text') || row.querySelector('.info-value') || row.querySelector('.num-badge') || row.querySelector('.ox-badge') || row.querySelector('.info-value');
      if(textEl) textEl.textContent = v && String(v).trim() ? v : '-';
      // If status-dot exists, update its class (IPS-style markup)
      try{
        var dot = row.querySelector('.status-dot');
        if(dot){
          var lbl = String(v || '').trim();
          var cls = (lbl==='가동'?'ws-run': (lbl==='유휴'?'ws-idle':'ws-wait'));
          dot.classList.remove('ws-run','ws-idle','ws-wait');
          dot.classList.add(cls);
        }
      }catch(_e0){}
    }

    function setInfoRowHTML(cardIndex, rowIndex, html, fallbackText){
      var row = document.querySelector('.basic-info-card:nth-child('+cardIndex+') .info-row:nth-child('+rowIndex+')');
      if(!row) return;
      var host = row.querySelector('.info-value');
      if(host){
        var h = (html == null) ? '' : String(html);
        if(h && h.trim() && h !== '-'){
          host.innerHTML = h;
        } else {
          host.textContent = (fallbackText != null && String(fallbackText).trim()) ? String(fallbackText) : '-';
        }
      } else {
        setInfoRowValue(cardIndex, rowIndex, fallbackText != null ? fallbackText : '-');
      }
    }

    function applyAssetItemToPage(item){
      if(!item) return;

      // Ensure master dictionaries are available; re-apply once loaded.
      if(!masterCache){
        ensureMasters().then(function(){
          try{ applyAssetItemToPage(item); }catch(_e0){}
        }).catch(function(_e1){});
      }

      function s(v){ return (v == null) ? '' : String(v).trim(); }
      function lookup(mapName, code){
        var c = s(code);
        if(!c) return '';
        try{
          var m = masterCache && masterCache.lookup ? masterCache.lookup[mapName] : null;
          if(m && typeof m.get === 'function'){
            return s(m.get(c));
          }
        }catch(_e){ }
        return '';
      }
      function label(name, code, mapName){
        var n = s(name);
        if(n) return n;
        var fromMaster = mapName ? lookup(mapName, code) : '';
        if(fromMaster) return fromMaster;
        var c = s(code);
        return c || '-';
      }

      // Fill basic-info grid if present
      if(document.querySelector('.basic-info-grid')){
        var wsLabel = label(item.work_status_name, item.work_status_code, 'workStatusByCode');
        setInfoRowHTML(1,1, renderWorkStatusPill(wsLabel, item.work_status_color, item.work_status_token), wsLabel);
        setInfoRowValue(1,2, label(item.work_type_name, item.work_type_code, 'workTypeByCode'));
        setInfoRowValue(1,3, label(item.work_category_name, item.work_category_code, 'workCategoryByCode'));
        setInfoRowValue(1,4, label(item.work_operation_name, item.work_operation_code, 'workOperationByCode'));
        setInfoRowValue(1,5, label(item.work_group_name, item.work_group_code, 'workGroupByCode'));
        setInfoRowValue(1,6, item.work_name || '-');
        setInfoRowValue(1,7, item.system_name || '-');
        setInfoRowValue(1,8, item.system_ip || '-');
        setInfoRowValue(1,9, item.mgmt_ip || '-');

        setInfoRowValue(2,1, label(item.manufacturer_name, item.manufacturer_code, 'vendorByCode'));
        setInfoRowValue(2,2, label(item.server_model_name, item.server_code, 'modelByCode'));
        setInfoRowValue(2,3, item.serial_number || item.serial || '-');
        setInfoRowValue(2,4, normalizeVirtualizationLabel(item.virtualization_type) || '-');
        setInfoRowValue(2,5, label(item.center_name, item.center_code, 'centerByCode'));
        setInfoRowValue(2,6, label(item.rack_name, item.rack_code, 'rackByCode'));
        setInfoRowValue(2,7, (item.slot != null ? String(item.slot) : '-'));
        setInfoRowValue(2,8, (item.u_size != null ? String(item.u_size) : '-'));

        setInfoRowValue(3,1, label(item.system_dept_name, item.system_dept_code, 'deptByCode'));
        setInfoRowValue(3,2, label(item.system_owner_name, item.system_owner_emp_no, 'userByEmpNo'));
        setInfoRowValue(3,3, label(item.service_dept_name, item.service_dept_code, 'deptByCode'));
        setInfoRowValue(3,4, label(item.service_owner_name, item.service_owner_emp_no, 'userByEmpNo'));

        var c = (item.cia_confidentiality != null ? String(item.cia_confidentiality) : '');
        var i = (item.cia_integrity != null ? String(item.cia_integrity) : '');
        var a = (item.cia_availability != null ? String(item.cia_availability) : '');
        var sc = (item.security_score != null ? String(item.security_score) : '');
        setInfoRowHTML(4,1, renderNumBadge(c, 'confidentiality'), c);
        setInfoRowHTML(4,2, renderNumBadge(i, 'integrity'), i);
        setInfoRowHTML(4,3, renderNumBadge(a, 'availability'), a);
        setInfoRowHTML(4,4, renderNumBadge(sc, 'security_score'), sc);
        setInfoRowValue(4,5, item.system_grade || '-');
        setInfoRowValue(4,6, toCoreFlag(item.is_core_system != null ? item.is_core_system : item.core_flag) || '-');
        var dr = toOX(item.has_dr_site != null ? item.has_dr_site : item.dr_built);
        var ha = toOX(item.has_service_ha != null ? item.has_service_ha : item.svc_redundancy);
        setInfoRowHTML(4,7, renderOxBadge(dr), dr);
        setInfoRowHTML(4,8, renderOxBadge(ha), ha);
      }
      // Header: title=업무 이름, subtitle=시스템 이름
      try{
        var titleEl = document.getElementById('page-title');
        if(titleEl){
          var work = (item.work_name || '').trim();
          titleEl.textContent = work || DEFAULT_TITLE;
        }
        var subEl = document.getElementById('page-subtitle');
        if(subEl){
          var sys = (item.system_name || '').trim();
          subEl.textContent = sys || '-';
        }
      }catch(_e3){}
      // Persist key hardware fields for cross-tab usage (hardware tab system row)
      try{
        var vendorLabel = label(item.manufacturer_name, item.manufacturer_code, 'vendorByCode');
        var modelLabel  = label(item.server_model_name, item.server_code, 'modelByCode');
        var serialLabel = item.serial_number || item.serial || '';
        var slotLabel   = (item.slot != null ? String(item.slot) : '');
        var uSizeLabel  = (item.u_size != null ? String(item.u_size) : '');
        localStorage.setItem(STORAGE_PREFIX+':current:vendor', String(vendorLabel||''));
        localStorage.setItem(STORAGE_PREFIX+':current:model',  String(modelLabel||''));
        localStorage.setItem(STORAGE_PREFIX+':current:serial', String(serialLabel||''));
        localStorage.setItem(STORAGE_PREFIX+':current:slot',   String(slotLabel||''));
        localStorage.setItem(STORAGE_PREFIX+':current:u_size', String(uSizeLabel||''));
        localStorage.setItem(STORAGE_PREFIX + ':current:rack_face', String(pick(item, ['rack_face']) || ''));
      }catch(_e4){}
    }

    function normalizeAssetRowForStorage(item){
      if(!item) return null;
      return {
        id: item.id,
        asset_code: item.asset_code || '',
        asset_name: item.asset_name || '',
        work_type: normalizeLabel(item.work_type_name, item.work_type_code),
        work_type_code: item.work_type_code || '',
        work_category: normalizeLabel(item.work_category_name, item.work_category_code),
        work_category_code: item.work_category_code || '',
        work_status: normalizeLabel(item.work_status_name, item.work_status_code),
        work_status_code: item.work_status_code || '',
        work_operation: normalizeLabel(item.work_operation_name, item.work_operation_code),
        work_operation_code: item.work_operation_code || '',
        work_group: normalizeLabel(item.work_group_name, item.work_group_code),
        work_group_code: item.work_group_code || '',
        work_name: item.work_name || '',
        system_name: item.system_name || '',
        system_ip: item.system_ip || '',
        manage_ip: item.mgmt_ip || '',
        mgmt_ip: item.mgmt_ip || '',
        vendor: normalizeLabel(item.manufacturer_name, item.manufacturer_code),
        manufacturer_code: item.manufacturer_code || '',
        model: normalizeLabel(item.server_model_name, item.server_code),
        server_code: item.server_code || '',
        serial: item.serial_number || item.serial || '',
        serial_number: item.serial_number || '',
        virtualization: normalizeVirtualizationLabel(item.virtualization_type) || '',
        virtualization_raw: item.virtualization_type || '',
        location_place: item.center_name || '',
        center_code: item.center_code || '',
        location_pos: item.rack_name || '',
        rack_code: item.rack_code || '',
        slot: item.slot != null ? String(item.slot) : '',
        u_size: item.u_size != null ? String(item.u_size) : '',
        sys_dept: normalizeLabel(item.system_dept_name, item.system_dept_code) || '',
        system_dept_code: item.system_dept_code || '',
        svc_dept: normalizeLabel(item.service_dept_name, item.service_dept_code) || '',
        service_dept_code: item.service_dept_code || '',
        sys_owner: normalizeLabel(item.system_owner_name, item.system_owner_emp_no) || '',
        system_owner_emp_no: item.system_owner_emp_no || '',
        svc_owner: normalizeLabel(item.service_owner_name, item.service_owner_emp_no) || '',
        service_owner_emp_no: item.service_owner_emp_no || '',
        confidentiality: item.cia_confidentiality != null ? String(item.cia_confidentiality) : '',
        integrity: item.cia_integrity != null ? String(item.cia_integrity) : '',
        availability: item.cia_availability != null ? String(item.cia_availability) : '',
        security_score: item.security_score != null ? String(item.security_score) : '',
        system_grade: item.system_grade || '',
        core_flag: toCoreFlag(item.is_core_system != null ? item.is_core_system : item.core_flag) || '',
        dr_built: toOX(item.has_dr_site != null ? item.has_dr_site : item.dr_built) || '',
        svc_redundancy: toOX(item.has_service_ha != null ? item.has_service_ha : item.svc_redundancy) || ''
      };
    }

    function buildUpdatePayload(form){
      var payload = {};
      Object.keys(FIELD_TO_PAYLOAD_KEY).forEach(function(field){
        var el = form.querySelector('[name="'+field+'"]');
        if(!el) return;
        var raw = el.value;
        if(raw == null) return;
        var s = String(raw).trim();
        var payloadKey = FIELD_TO_PAYLOAD_KEY[field];

        var isRequired = (field === 'work_status' || field === 'work_name' || field === 'system_name');
        if(s === ''){
          if(isRequired){
            // Never send null for required fields
            return;
          }
          var initial = null;
          try{ initial = (el.dataset && Object.prototype.hasOwnProperty.call(el.dataset, 'initialValue')) ? String(el.dataset.initialValue || '') : null; }catch(_e0){ initial = null; }
          var userCleared = false;
          try{ userCleared = !!(el.dataset && el.dataset.userCleared === '1'); }catch(_e1){ userCleared = false; }
          if((initial != null && String(initial).trim() !== '') || userCleared){
            payload[payloadKey] = null;
          }
          return;
        }

        if(NUMERIC_PAYLOAD_KEYS.has(payloadKey)){
          var num = parseInt(s, 10);
          if(isNaN(num)) return;
          payload[payloadKey] = num;
        } else {
          payload[payloadKey] = s;
        }
      });
      return payload;
    }

    async function loadAssetAndRender(assetId){
      var data = await apiJSON(API_ENDPOINT + '/' + assetId, { method:'GET' });
      currentAssetItem = data.item;
      applyAssetItemToPage(currentAssetItem);
      try{
        var row = normalizeAssetRowForStorage(currentAssetItem);
        if(row){
          try{ sessionStorage.setItem(STORAGE_PREFIX+':selected:row', JSON.stringify(row)); }catch(_e0){}
          try{ localStorage.setItem(STORAGE_PREFIX+':selected:row', JSON.stringify(row)); }catch(_e1){}
        }
        try{ sessionStorage.setItem(STORAGE_PREFIX+':selected:asset_id', String(assetId)); }catch(_e2){}
        try{ localStorage.setItem(STORAGE_PREFIX+':selected:asset_id', String(assetId)); }catch(_e3){}
      }catch(_e4){}
    }

    async function bootstrapBasicInfo(){
      // Only run on pages that have header; render basic card only if it exists
      if(!document.getElementById('page-title')) return;
      var aid = resolveAssetId();
      if(!aid) return;
      currentAssetId = aid;
      try{
        if(currentAssetItem && (currentAssetItem.id === aid || String(currentAssetItem.id) === String(aid))){
          applyAssetItemToPage(currentAssetItem);
          return;
        }
        await loadAssetAndRender(aid);
      }catch(err){
        console.warn('['+STORAGE_PREFIX+'-detail] bootstrap failed:', err);
      }
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
      function rowVal(card, row){ return getInfoRowText(card, row); }
      var selectedRowData = null;
      try{
        var storagePrefix = (typeof STORAGE_PREFIX !== 'undefined' && STORAGE_PREFIX) ? STORAGE_PREFIX : 'wips';
        var raw = sessionStorage.getItem(storagePrefix+':selected:row') || localStorage.getItem(storagePrefix+':selected:row');
        if(raw){
          var selectedRow = JSON.parse(raw);
          function pick(primaryKey, fallbackKey){
            var v = (selectedRow && selectedRow[primaryKey] != null) ? selectedRow[primaryKey] : null;
            if(v == null || String(v).trim() === ''){
              v = (selectedRow && selectedRow[fallbackKey] != null) ? selectedRow[fallbackKey] : null;
            }
            if(v == null) return '';
            v = String(v).trim();
            return v;
          }
          selectedRowData = {
            work_type: pick('work_type_code','work_type'),
            work_category: pick('work_category_code','work_category'),
            work_operation: pick('work_operation_code','work_operation'),
            work_group: pick('work_group_code','work_group'),
            work_name: pick('work_name','work_name'),
            system_name: pick('system_name','system_name'),
            system_ip: pick('system_ip','system_ip'),
            manage_ip: pick('mgmt_ip','manage_ip'),
            vendor: pick('manufacturer_code','vendor'),
            model: pick('server_code','model'),
            serial: pick('serial_number','serial'),
            virtualization: pick('virtualization_raw','virtualization'),
            location_place: pick('center_code','location_place'),
            location_pos: pick('rack_code','location_pos'),
            slot: pick('slot','slot'),
            u_size: pick('u_size','u_size'),
            sys_dept: pick('system_dept_code','sys_dept'),
            sys_owner: pick('system_owner_emp_no','sys_owner'),
            svc_dept: pick('service_dept_code','svc_dept'),
            svc_owner: pick('service_owner_emp_no','svc_owner'),
            confidentiality: pick('confidentiality','confidentiality'),
            integrity: pick('integrity','integrity'),
            availability: pick('availability','availability'),
            security_score: pick('security_score','security_score'),
            system_grade: pick('system_grade','system_grade'),
            core_flag: pick('core_flag','core_flag'),
            dr_built: pick('dr_built','dr_built'),
            svc_redundancy: pick('svc_redundancy','svc_redundancy')
          };
          var ws = pick('work_status_code','work_status');
          if(ws) selectedRowData.work_status = ws;
          Object.keys(selectedRowData).forEach(function(k){ if(!selectedRowData[k]) delete selectedRowData[k]; });
        }
      }catch(_e){ selectedRowData = null; }
  var data = selectedRowData || {
        work_type: rowVal(1,2),
        work_category: rowVal(1,3),
        work_status: rowVal(1,1),
        work_operation: rowVal(1,4),
        work_group: rowVal(1,5),
        work_name: rowVal(1,6),
        system_name: rowVal(1,7),
        system_ip: rowVal(1,8),
        manage_ip: rowVal(1,9),
        vendor: rowVal(2,1),
        model: rowVal(2,2),
        serial: rowVal(2,3),
        virtualization: rowVal(2,4),
        location_place: rowVal(2,5),
        location_pos: rowVal(2,6),
        slot: rowVal(2,7),
        u_size: rowVal(2,8),
        sys_dept: rowVal(3,1),
        sys_owner: rowVal(3,2),
        svc_dept: rowVal(3,3),
        svc_owner: rowVal(3,4),
        confidentiality: rowVal(4,1),
        integrity: rowVal(4,2),
        availability: rowVal(4,3),
        security_score: rowVal(4,4),
        system_grade: rowVal(4,5),
        core_flag: rowVal(4,6),
        dr_built: rowVal(4,7),
        svc_redundancy: rowVal(4,8)
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
        if(col==='security_score') return '<input name="security_score" class="form-input" type="number" readonly placeholder="자동 합계" value="'+(value||'')+'">';
        if(opts[col]){
          return '<select name="'+col+'" class="form-input '+(['confidentiality','integrity','availability'].indexOf(col)>-1?'score-trigger':'')+'">'+
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
      captureInitialFormValues(form);
      wireExplicitClearTracking(form);
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
      var v = function(name){ var el=form.querySelector('[name="'+name+'"]'); return el? el.value : ''; };
      setInfoRowValue(1,1, v('work_status'));
      setInfoRowValue(1,2, v('work_type'));
      setInfoRowValue(1,3, v('work_category'));
      setInfoRowValue(1,4, v('work_operation'));
      setInfoRowValue(1,5, v('work_group'));
      setInfoRowValue(1,6, v('work_name'));
      setInfoRowValue(1,7, v('system_name'));
      setInfoRowValue(1,8, v('system_ip'));
      setInfoRowValue(1,9, v('manage_ip'));
      setInfoRowValue(2,1, v('vendor'));
      setInfoRowValue(2,2, v('model'));
      setInfoRowValue(2,3, v('serial'));
      setInfoRowValue(2,4, v('virtualization'));
      setInfoRowValue(2,5, v('location_place'));
      setInfoRowValue(2,6, v('location_pos'));
      setInfoRowValue(2,7, v('slot'));
      setInfoRowValue(2,8, v('u_size'));
      setInfoRowValue(3,1, v('sys_dept'));
      setInfoRowValue(3,2, v('sys_owner'));
      setInfoRowValue(3,3, v('svc_dept'));
      setInfoRowValue(3,4, v('svc_owner'));
      setInfoRowValue(4,1, v('confidentiality'));
      setInfoRowValue(4,2, v('integrity'));
      setInfoRowValue(4,3, v('availability'));
      setInfoRowValue(4,4, v('security_score'));
      setInfoRowValue(4,5, v('system_grade'));
      setInfoRowValue(4,6, v('core_flag'));
      setInfoRowValue(4,7, v('dr_built'));
      setInfoRowValue(4,8, v('svc_redundancy'));
      try{
        localStorage.setItem(STORAGE_PREFIX+':current:vendor', String(v('vendor')||''));
        localStorage.setItem(STORAGE_PREFIX+':current:model',  String(v('model')||''));
        localStorage.setItem(STORAGE_PREFIX+':current:serial', String(v('serial')||''));
        localStorage.setItem(STORAGE_PREFIX+':current:slot',   String(v('slot')||''));
        localStorage.setItem(STORAGE_PREFIX+':current:u_size', String(v('u_size')||''));
      }catch(_){ }
    }
    // Wire the Basic Info edit modal open/close/save (API-backed for WIPS)
    (function(){
      function openModalLocal(id){ var el=document.getElementById(id); if(!el) return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden','false'); }
      function closeModalLocal(id){ var el=document.getElementById(id); if(!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } }
      var openBtn = document.getElementById(EDIT_OPEN_ID);
      if(openBtn){
        openBtn.addEventListener('click', async function(){
          try{
            if(!currentAssetId){ currentAssetId = resolveAssetId(); }
            if(currentAssetId && !currentAssetItem){
              await loadAssetAndRender(currentAssetId);
            }
          }catch(err){
            console.warn('['+STORAGE_PREFIX+'-detail] load before modal failed:', err);
          }
          try{
            if(currentAssetItem){
              await buildEditFormFromAssetItem(currentAssetItem);
            } else {
              buildEditFormFromPage();
            }
          }catch(_e0){
            try{ buildEditFormFromPage(); }catch(_e1){}
          }
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
          if(!form){ closeModalLocal(EDIT_MODAL_ID); return; }
          if(!validateRequiredModalForm(form)){
            notify('필수 값을 입력해 주세요.', 'error');
            return;
          }
          try{
            if(!currentAssetId){ currentAssetId = resolveAssetId(); }
            if(!currentAssetId){
              notify('자산 ID를 찾을 수 없습니다. 목록에서 다시 선택해 주세요.', 'error');
              return;
            }
            try{
              sessionStorage.setItem(STORAGE_PREFIX+':selected:asset_id', String(currentAssetId));
              localStorage.setItem(STORAGE_PREFIX+':selected:asset_id', String(currentAssetId));
            }catch(_eAid){}
            var payload = buildUpdatePayload(form);

            if(!payload || Object.keys(payload).length === 0){
              closeModalLocal(EDIT_MODAL_ID);
              return;
            }
            saveBtn.disabled = true;
            var data = await apiJSON(API_ENDPOINT + '/' + currentAssetId, { method:'PUT', body: JSON.stringify(payload) });
            currentAssetItem = data.item;
            applyAssetItemToPage(currentAssetItem);
            try{ updatePageFromForm(); }catch(_eSync){}
            try{
              var row = normalizeAssetRowForStorage(currentAssetItem);
              if(row){
                try{ sessionStorage.setItem(STORAGE_PREFIX+':selected:row', JSON.stringify(row)); }catch(_e0){}
                try{ localStorage.setItem(STORAGE_PREFIX+':selected:row', JSON.stringify(row)); }catch(_e1){}
              }
            }catch(_e2){}
            closeModalLocal(EDIT_MODAL_ID);
          }catch(err){
            console.warn('['+STORAGE_PREFIX+'-detail] save failed:', err);
            notify(err && err.message ? err.message : '저장 중 오류가 발생했습니다.', 'error');
          }finally{
            try{ saveBtn.disabled = false; }catch(_e3){}
          }
        });
      }
    })();

    // Preserve asset_id when navigating between tabs
    try{
      var _assetId = resolveAssetId();
      if(_assetId != null){
        try{ sessionStorage.setItem(STORAGE_PREFIX+':selected:asset_id', String(_assetId)); }catch(_eS){}
        try{ localStorage.setItem(STORAGE_PREFIX+':selected:asset_id', String(_assetId)); }catch(_eL){}
      }
      stripAssetIdFromUrl();
    }catch(_e0){}

    // Initial hydration for basic info
    bootstrapBasicInfo();

    /*
     * Tabs are handled by /static/js/_detail/tab*.js.
     * The legacy inline tab logic block below is disabled to avoid breaking
     * basic page hydration when this shared file is loaded.
     */

    /*

      // [Tabs moved to /static/js/_detail/tab*.js]


      // [Tabs moved to /static/js/_detail/tab*.js]

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
        }
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


  */

  // [Removed legacy Change Log implementation]

}

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', __detailMain);
  } else {
    __detailMain();
  }

  // No modal APIs to expose
})();

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

  // Early: persist asset_id from query, then strip it from URL (privacy)
  try {
    var _qs = new URLSearchParams(location.search || '');
    var _qidRaw = _qs.get('asset_id') || _qs.get('assetId');
    var _usedIdAlias = false;
    if(_qidRaw == null){
      var _idRaw = _qs.get('id');
      if(_idRaw != null){
        // Only treat `id` as asset_id alias when it's the only query param
        var _keys = [];
        _qs.forEach(function(_v, _k){ _keys.push(_k); });
        if(_keys.length === 1 && _keys[0] === 'id'){
          _qidRaw = _idRaw;
          _usedIdAlias = true;
        }
      }
    }
    if(_qidRaw != null){
      var _qid = parseInt(String(_qidRaw).trim(), 10);
      if(!isNaN(_qid) && _qid > 0){
        try{ sessionStorage.setItem('security-etc:selected:asset_id', String(_qid)); }catch(_e0){}
        try{ localStorage.setItem('security-etc:selected:asset_id', String(_qid)); }catch(_e1){}
      }
    }

    var _changed = false;
    if(_qs.has('asset_id')){ _qs.delete('asset_id'); _changed = true; }
    if(_qs.has('assetId')){ _qs.delete('assetId'); _changed = true; }
    if(_usedIdAlias && _qs.has('id')){ _qs.delete('id'); _changed = true; }
    if(_changed){
      var _newSearch = _qs.toString();
      var _newUrl = location.pathname + (_newSearch ? ('?' + _newSearch) : '') + (location.hash || '');
      try{ history.replaceState(null, '', _newUrl); }catch(_e2){}
    }
  } catch(_eStrip){ }

  document.addEventListener('DOMContentLoaded', function(){
    // ---- Selected-asset context (ETC) ----
    var ETC_STORAGE_PREFIX = (typeof STORAGE_PREFIX !== 'undefined' && STORAGE_PREFIX) ? STORAGE_PREFIX : 'security-etc';
    function _safeGet(key){
      try{ return sessionStorage.getItem(key); }catch(_e0){}
      try{ return localStorage.getItem(key); }catch(_e1){}
      return null;
    }
    function _safeSet(key, value){
      try{ sessionStorage.setItem(key, String(value)); }catch(_e0){}
      try{ localStorage.setItem(key, String(value)); }catch(_e1){}
    }
    function _parseIntOrNull(v){
      if(v == null) return null;
      var n = parseInt(String(v).trim(), 10);
      return (isNaN(n) || n <= 0) ? null : n;
    }
    function resolveAssetId(){
      // query -> stored selected:asset_id -> stored selected:row
      try{
        var qs = new URLSearchParams(location.search || '');
        var qid = _parseIntOrNull(qs.get('hardware_id') || qs.get('hardwareId') || qs.get('asset_id') || qs.get('assetId') || qs.get('id'));
        if(qid != null) return qid;
      }catch(_e){}
      var sid = _parseIntOrNull(_safeGet(ETC_STORAGE_PREFIX+':selected:asset_id'));
      if(sid != null) return sid;
      try{
        var raw = _safeGet(ETC_STORAGE_PREFIX+':selected:row');
        if(raw){
          var row = JSON.parse(raw);
          var rid = _parseIntOrNull(row && (row.hardware_id != null ? row.hardware_id : (row.asset_id != null ? row.asset_id : row.id)));
          if(rid != null) return rid;
        }
      }catch(_e2){}
      return null;
    }
    function setSelectedRow(row){
      try{
        if(!row){
          _safeSet(ETC_STORAGE_PREFIX+':selected:row', '');
          return;
        }
        _safeSet(ETC_STORAGE_PREFIX+':selected:row', JSON.stringify(row));
      }catch(_e){}
    }
    function getSelectedRow(){
      try{
        var raw = _safeGet(ETC_STORAGE_PREFIX+':selected:row');
        if(!raw) return null;
        return JSON.parse(raw);
      }catch(_e){ return null; }
    }

    function _firstNonEmpty(){
      for(var i=0; i<arguments.length; i++){
        var v = arguments[i];
        if(v == null) continue;
        var s = String(v).trim();
        if(s) return s;
      }
      return '';
    }

    function normalizeSelectedRowFromApiItem(item){
      // Backend returns a rich joined record; normalize to the UI-selected-row shape.
      var it = item || {};
      var row = {};
      row.id = (it.id != null ? it.id : it.asset_id);
      row.asset_id = row.id;
      row.asset_code = it.asset_code;
      row.asset_name = it.asset_name;

      // Work
      row.work_status_code = _firstNonEmpty(it.work_status_code, it.work_status);
      row.work_status = _firstNonEmpty(it.work_status_name, it.work_status_label, it.work_status);
      var st = _deriveStatusColor(it.work_status_color);
      row.work_status_color = st.hex;
      row.work_status_token = st.token;
      row.work_type_code = _firstNonEmpty(it.work_type_code);
      row.work_type = _firstNonEmpty(it.work_type_name, it.work_type);
      row.work_category_code = _firstNonEmpty(it.work_category_code);
      row.work_category = _firstNonEmpty(it.work_category_name, it.work_category);
      row.work_operation_code = _firstNonEmpty(it.work_operation_code);
      row.work_operation = _firstNonEmpty(it.work_operation_name, it.work_operation);
      row.work_group_code = _firstNonEmpty(it.work_group_code);
      row.work_group = _firstNonEmpty(it.work_group_name, it.work_group);

      row.work_name = _firstNonEmpty(it.work_name);
      row.system_name = _firstNonEmpty(it.system_name);
      row.system_ip = _firstNonEmpty(it.system_ip);
      row.manage_ip = _firstNonEmpty(it.mgmt_ip, it.manage_ip);

      // Manufacturer/Model
      row.vendor = _firstNonEmpty(it.manufacturer_name, it.vendor, it.manufacturer_code);
      row.manufacturer_code = it.manufacturer_code;
      row.server_code = _firstNonEmpty(it.server_code);
      row.model = _firstNonEmpty(it.server_model_name, it.model_name, it.model);

      // HW/placement
      row.serial = _firstNonEmpty(it.serial_number, it.serial);
      row.virtualization = _firstNonEmpty(it.virtualization_type, it.virtualization);
      row.center_code = _firstNonEmpty(it.center_code);
      row.location_place = _firstNonEmpty(it.center_name, it.location_place);
      row.rack_code = _firstNonEmpty(it.rack_code);
      row.location_pos = _firstNonEmpty(it.rack_name, it.location_pos);
      row.slot = _firstNonEmpty(it.slot);
      row.u_size = _firstNonEmpty(it.u_size);

      // Org
      row.system_dept_code = _firstNonEmpty(it.system_dept_code);
      row.sys_dept = _firstNonEmpty(it.system_dept_name, it.sys_dept);
      row.service_dept_code = _firstNonEmpty(it.service_dept_code);
      row.svc_dept = _firstNonEmpty(it.service_dept_name, it.svc_dept);
      row.system_owner_emp_no = _firstNonEmpty(it.system_owner_emp_no);
      row.sys_owner = _firstNonEmpty(it.system_owner_display, it.system_owner_name, it.sys_owner, row.system_owner_emp_no);
      row.service_owner_emp_no = _firstNonEmpty(it.service_owner_emp_no);
      row.svc_owner = _firstNonEmpty(it.service_owner_display, it.service_owner_name, it.svc_owner, row.service_owner_emp_no);

      // Security/CIA (match WIPS backend field names)
      row.confidentiality = (it.cia_confidentiality != null ? it.cia_confidentiality : it.confidentiality);
      row.integrity = (it.cia_integrity != null ? it.cia_integrity : it.integrity);
      row.availability = (it.cia_availability != null ? it.cia_availability : it.availability);
      row.security_score = it.security_score;
      row.system_grade = it.system_grade;
      // Normalize flags to the display format used by the modal selects.
      row.core_flag = toCoreFlag(it.is_core_system != null ? it.is_core_system : it.core_flag);
      row.dr_built = toOX(it.has_dr_site != null ? it.has_dr_site : it.dr_built);
      row.svc_redundancy = toOX(it.has_service_ha != null ? it.has_service_ha : it.svc_redundancy);

      // Keep a hint for debugging / skip redundant loads
      row.__source = 'api';
      row.__fetched_at = Date.now();
      return row;
    }

    function mergeSelectedRows(baseRow, incomingRow){
      var base = baseRow && typeof baseRow === 'object' ? baseRow : {};
      var inc = incomingRow && typeof incomingRow === 'object' ? incomingRow : {};
      var out = {};
      Object.keys(base).forEach(function(k){ out[k] = base[k]; });
      Object.keys(inc).forEach(function(k){
        // Prefer incoming values when base is empty.
        var b = out[k];
        var i = inc[k];
        var bEmpty = (b == null) || (typeof b === 'string' && !String(b).trim());
        if(bEmpty) out[k] = i;
        else if(i != null && typeof i !== 'undefined' && (typeof i !== 'string' || String(i).trim())){
          // For key identity fields (id/codes), prefer API.
          if(k === 'work_status_color'){
            var normalized = _normalizeHexColor(i) || _deriveStatusColor(i).hex;
            if(normalized) out[k] = normalized;
            return;
          }
          if(k === 'work_status_token'){
            var tok = _extractStatusToken(i);
            if(tok) out[k] = tok;
            return;
          }
          if(k === 'id' || k === 'asset_id' || /_code$/.test(k)){
            out[k] = i;
          }
        }
      });
      return out;
    }

    // Canonical merge: API wins (even if empty string), but keep any extra keys from existing storage.
    // This prevents stale '-' placeholders or old values from blocking screen refresh.
    function mergeSelectedRowsCanonical(existingRow, canonicalRow){
      var existing = existingRow && typeof existingRow === 'object' ? existingRow : {};
      var canonical = canonicalRow && typeof canonicalRow === 'object' ? canonicalRow : {};
      var out = {};
      Object.keys(existing).forEach(function(k){ out[k] = existing[k]; });
      Object.keys(canonical).forEach(function(k){ out[k] = canonical[k]; });
      return out;
    }

    function fetchEtcAssetDetail(assetId){
      var id = _parseIntOrNull(assetId);
      if(id == null) return Promise.reject(new Error('invalid asset_id'));
      return fetch('/api/hardware/security/etc/assets/' + String(id), {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      }).then(function(res){
        return res.json().then(function(data){
          if(!res.ok || !data || data.success !== true){
            var msg = (data && data.message) ? String(data.message) : '상세 조회 실패';
            throw new Error(msg);
          }
          return data.item;
        });
      });
    }

    function putEtcAssetDetail(assetId, payload){
      var id = _parseIntOrNull(assetId);
      if(id == null) return Promise.reject(new Error('invalid asset_id'));
      return fetch('/api/hardware/security/etc/assets/' + String(id), {
        method: 'PUT',
        headers: { 'Accept':'application/json', 'Content-Type':'application/json' },
        body: JSON.stringify(payload || {})
      }).then(function(res){
        return res.json().then(function(data){
          if(!res.ok || !data || data.success !== true){
            var msg = (data && data.message) ? String(data.message) : '저장 실패';
            throw new Error(msg);
          }
          return data.item;
        });
      });
    }

    function ensureCanonicalSelectedRow(){
      var assetId = resolveAssetId();
      if(assetId == null) return Promise.resolve(getSelectedRow());
      _safeSet(ETC_STORAGE_PREFIX+':selected:asset_id', assetId);
      return fetchEtcAssetDetail(assetId)
        .then(function(item){
          var normalized = normalizeSelectedRowFromApiItem(item);
          var existing = getSelectedRow();
          var merged = mergeSelectedRowsCanonical(existing, normalized);
          setSelectedRow(merged);
          return merged;
        })
        .catch(function(){ return getSelectedRow(); });
    }

    function _cleanFormValue(v){
      var s = String(v == null ? '' : v).trim();
      if(!s || s === '-' || s === '선택') return '';
      return s;
    }

    function _toIntOrEmpty(v){
      var s = _cleanFormValue(v);
      if(!s) return '';
      var n = parseInt(s, 10);
      return isNaN(n) ? '' : n;
    }

    function buildEtcPayloadFromForm(form){
      if(!form) return {};
      function el(name){ return form.querySelector('[name="'+name+'"]'); }
      function v(name){
        var node = el(name);
        return node ? node.value : '';
      }
      function isExplicitlyCleared(name){
        try{
          var node = el(name);
          return !!(node && node.dataset && String(node.dataset.userCleared || '') === '1');
        }catch(_e){
          return false;
        }
      }
      function selectedText(name){
        var node = el(name);
        if(!node) return '';
        if(node.tagName === 'SELECT'){
          try{ if(String(node.value || '').trim() === '') return ''; }catch(_e0){}
          var opt = node.options && node.selectedIndex >= 0 ? node.options[node.selectedIndex] : null;
          if(!opt) return '';
          var t = String(opt.textContent || '').trim();
          if(t === '선택') return '';
          return t;
        }
        return String(node.value || '').trim();
      }

      // NOTE: backend supports alias keys for many fields (see _CODE_ALIAS_MAP).
      // For "clear" behavior, we must keep keys present (empty -> NULL server-side).
      var payload = {};
      function maybeSet(key, value, fieldName){
        var cleaned = (value === '' || value == null) ? '' : value;
        var cleared = fieldName ? isExplicitlyCleared(fieldName) : false;
        if(cleaned === ''){
          if(cleared){
            payload[key] = '';
          }
          return;
        }
        payload[key] = cleaned;
      }

      // Work/biz
      maybeSet('work_status', _cleanFormValue(v('work_status')), 'work_status');
      maybeSet('work_type', _cleanFormValue(v('work_type')), 'work_type');
      maybeSet('work_category', _cleanFormValue(v('work_category')), 'work_category');
      maybeSet('work_operation', _cleanFormValue(v('work_operation')), 'work_operation');
      maybeSet('work_group', _cleanFormValue(v('work_group')), 'work_group');
      maybeSet('work_name', _cleanFormValue(v('work_name')), 'work_name');

      // System
      maybeSet('system_name', _cleanFormValue(v('system_name')), 'system_name');
      maybeSet('system_ip', _cleanFormValue(v('system_ip')), 'system_ip');
      maybeSet('mgmt_ip', _cleanFormValue(v('manage_ip')), 'manage_ip');

      // Vendor/model
      maybeSet('vendor', _cleanFormValue(v('vendor')), 'vendor');
      maybeSet('model', _cleanFormValue(v('model')), 'model');
      maybeSet('serial', _cleanFormValue(v('serial')), 'serial');
      maybeSet('virtualization_type', _cleanFormValue(v('virtualization')), 'virtualization');

      // Location
      var centerVal = _cleanFormValue(v('location_place'));
      var rackVal = _cleanFormValue(v('location_pos'));
      maybeSet('location_place', centerVal, 'location_place');
      maybeSet('center_code', centerVal, 'location_place');
      maybeSet('location_pos', rackVal, 'location_pos');
      maybeSet('rack_code', rackVal, 'location_pos');
      maybeSet('slot', _cleanFormValue(v('slot')), 'slot');
      maybeSet('u_size', _cleanFormValue(v('u_size')), 'u_size');

      // Org/owners
      var sysDeptVal = _cleanFormValue(v('sys_dept'));
      var svcDeptVal = _cleanFormValue(v('svc_dept'));
      var sysOwnerVal = _cleanFormValue(v('sys_owner'));
      var svcOwnerVal = _cleanFormValue(v('svc_owner'));

      maybeSet('sys_dept', sysDeptVal, 'sys_dept');
      maybeSet('system_dept_code', sysDeptVal, 'sys_dept');
      maybeSet('svc_dept', svcDeptVal, 'svc_dept');
      maybeSet('service_dept_code', svcDeptVal, 'svc_dept');

      maybeSet('sys_owner', sysOwnerVal, 'sys_owner');
      maybeSet('system_owner_emp_no', sysOwnerVal, 'sys_owner');
      maybeSet('system_owner_display', _cleanFormValue(selectedText('sys_owner')), 'sys_owner');

      maybeSet('svc_owner', svcOwnerVal, 'svc_owner');
      maybeSet('service_owner_emp_no', svcOwnerVal, 'svc_owner');
      maybeSet('service_owner_display', _cleanFormValue(selectedText('svc_owner')), 'svc_owner');

      // CIA/security
      maybeSet('cia_confidentiality', _toIntOrEmpty(v('confidentiality')), 'confidentiality');
      maybeSet('cia_integrity', _toIntOrEmpty(v('integrity')), 'integrity');
      maybeSet('cia_availability', _toIntOrEmpty(v('availability')), 'availability');
      maybeSet('security_score', _toIntOrEmpty(v('security_score')), 'security_score');
      maybeSet('system_grade', _cleanFormValue(v('system_grade')), 'system_grade');
      maybeSet('core_flag', _cleanFormValue(v('core_flag')), 'core_flag');
      maybeSet('dr_built', _cleanFormValue(v('dr_built')), 'dr_built');
      maybeSet('svc_redundancy', _cleanFormValue(v('svc_redundancy')), 'svc_redundancy');

      return payload;
    }

    function validateEtcRequiredFromForm(form){
      if(!form) return true;
      function v(name){
        var el = form.querySelector('[name="'+name+'"]');
        return el ? _cleanFormValue(el.value) : '';
      }
      var missing = [];
      if(!v('work_status')) missing.push('업무 상태');
      if(!v('work_name')) missing.push('업무 이름');
      if(!v('system_name')) missing.push('시스템 이름');
      if(missing.length){
        try{ alert('필수 값이 누락되어 저장할 수 없습니다: ' + missing.join(', ')); }catch(_e){}
        return false;
      }
      return true;
    }
    function toCoreFlag(v){
      var s = String(v == null ? '' : v).trim();
      if(s === '핵심' || s === '일반') return s;
      if(s === '1' || s.toUpperCase() === 'Y' || s === 'true') return '핵심';
      if(s === '0' || s.toUpperCase() === 'N' || s === 'false') return '일반';
      return s;
    }
    function toOX(v){
      var s = String(v == null ? '' : v).trim();
      if(s === 'O' || s === 'X') return s;
      if(s === '1' || s.toUpperCase() === 'Y' || s === 'true') return 'O';
      if(s === '0' || s.toUpperCase() === 'N' || s === 'false') return 'X';
      return '';
    }

    function escapeHTML(s){
      return String(s == null ? '' : s).replace(/[&<>"']/g, function(ch){
        return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch] || ch;
      });
    }

    function escapeAttr(s){
      return escapeHTML(s);
    }

    function hexToRgbArray(hex){
      if(!hex) return null;
      var s = String(hex).trim();
      if(s[0] === '#') s = s.slice(1);
      if(s.length === 3){ s = s[0]+s[0]+s[1]+s[1]+s[2]+s[2]; }
      if(s.length !== 6) return null;
      var r = parseInt(s.slice(0,2), 16);
      var g = parseInt(s.slice(2,4), 16);
      var b = parseInt(s.slice(4,6), 16);
      if([r,g,b].some(function(n){ return isNaN(n); })) return null;
      return [r,g,b];
    }

    // Keep work-status coloring stable across list/storage/API.
    // Detail API may return biz_work_status.status_level in work_status_color.
    function _normalizeHexColor(raw){
      var s = String(raw == null ? '' : raw).trim();
      if(!s) return '';
      var m = s.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
      if(!m) return '';
      var hex = String(m[1]).toUpperCase();
      if(hex.length === 3){ hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2]; }
      return '#' + hex;
    }
    function _extractStatusToken(raw){
      var s = String(raw == null ? '' : raw).trim();
      if(!s) return '';
      var t = s.replace(/[^a-zA-Z0-9\-]/g, '');
      return t.indexOf('ws-') === 0 ? t : '';
    }
    function _deriveStatusColor(value){
      var raw = String(value == null ? '' : value).trim();
      if(!raw) return { hex:'', token:'' };
      var hex = _normalizeHexColor(raw);
      if(hex) return { hex: hex, token:'' };
      var rgbMatch = raw.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
      if(rgbMatch){
        var parts = rgbMatch.slice(1,4).map(function(num){
          var parsed = parseInt(num, 10);
          if(isNaN(parsed)) return 0;
          return Math.max(0, Math.min(255, parsed));
        });
        var r = parts[0], g = parts[1], b = parts[2];
        var hexFromRgb = ('#' + ((1<<24) + (r<<16) + (g<<8) + b).toString(16).slice(1)).toUpperCase();
        return { hex: hexFromRgb, token:'' };
      }
      var token = _extractStatusToken(raw);
      if(token) return { hex:'', token: token };
      return { hex:'', token:'' };
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

    // Masters (work/org/model) for code -> name mapping
    var _mastersCache = null;
    var _userProfileNameCache = null; // emp_no -> name
    function fetchJSON(url){
      return fetch(url, { method:'GET', headers:{ 'Accept':'application/json' } }).then(function(r){ return r.json(); });
    }
    function itemsOf(data){
      if(!data) return [];
      if(Array.isArray(data.items)) return data.items;
      if(Array.isArray(data)) return data;
      return [];
    }
    function buildCodeLabelMap(items, codeKey, labelKey){
      var map = {};
      (items || []).forEach(function(it){
        var code = String(it && it[codeKey] != null ? it[codeKey] : '').trim();
        if(!code) return;
        var label = String(it && it[labelKey] != null ? it[labelKey] : '').trim();
        if(!label) label = code;
        map[code] = label;
      });
      return map;
    }
    function ensureMasters(){
      if(_mastersCache) return Promise.resolve(_mastersCache);
      var cfg = {
        WORK_CATEGORY: { url:'/api/work-categories?limit=2000', code:'category_code', label:'wc_name' },
        WORK_DIVISION: { url:'/api/work-divisions?limit=2000', code:'division_code', label:'wc_name' },
        WORK_STATUS: { url:'/api/work-statuses?limit=2000', code:'status_code', label:'wc_name' },
        WORK_OPERATION: { url:'/api/work-operations?limit=2000', code:'operation_code', label:'wc_name' },
        WORK_GROUP: { url:'/api/work-groups?limit=2000', code:'group_code', label:'group_name' },

        ORG_CENTER: { url:'/api/org-centers', code:'center_code', label:'center_name' },
        ORG_RACK: { url:'/api/org-racks', code:'rack_code', label:'rack_name' },
        ORG_DEPT: { url:'/api/org-departments?limit=2000', code:'dept_code', label:'dept_name' },

        SECURITY_MODEL: { url:'/api/hw-security-types?limit=2000', code:'security_code', label:'model_name' }
      };
      return Promise.all(Object.keys(cfg).map(function(k){
        return fetchJSON(cfg[k].url).then(function(data){
          var items = itemsOf(data);
          // Only keep ETC models for the ETC detail page.
          if(k === 'SECURITY_MODEL'){
            items = (items || []).filter(function(it){
              var t = String((it && (it.security_type || it.hw_type || it.type)) || '').trim().toUpperCase();
              return t === 'ETC' || t === '기타' || t === '';
            });
          }
          return [k, buildCodeLabelMap(items, cfg[k].code, cfg[k].label)];
        }).catch(function(){ return [k, {}]; });
      })).then(function(pairs){
        _mastersCache = {};
        pairs.forEach(function(p){ _mastersCache[p[0]] = p[1]; });
        return _mastersCache;
      });
    }

    function _ensureUserCache(){
      if(!_userProfileNameCache) _userProfileNameCache = {};
      return _userProfileNameCache;
    }
    function fetchUserProfileName(empNo){
      var e = String(empNo == null ? '' : empNo).trim();
      if(!e) return Promise.resolve('');
      var cache = _ensureUserCache();
      if(Object.prototype.hasOwnProperty.call(cache, e)) return Promise.resolve(cache[e] || '');
      // Use user-profiles API (has name) instead of /api/users (no name).
      var url = '/api/user-profiles?limit=50&q=' + encodeURIComponent(e);
      return fetchJSON(url)
        .then(function(data){
          var items = itemsOf(data);
          var hit = '';
          (items || []).some(function(it){
            var emp = String((it && it.emp_no) || '').trim();
            if(emp && emp === e){
              hit = String((it && it.name) || '').trim();
              return true;
            }
            return false;
          });
          cache[e] = hit || '';
          return cache[e];
        })
        .catch(function(){ cache[e] = ''; return ''; });
    }
    function lookupMasterLabel(sourceKey, code){
      var c = String(code == null ? '' : code).trim();
      if(!c) return '';
      if(!_mastersCache || !_mastersCache[sourceKey]) return '';
      return String(_mastersCache[sourceKey][c] || '').trim();
    }
    function normalizeFromRow(row, displayKey, codeKey, sourceKey){
      if(!row) return '-';
      var display = String(row[displayKey] == null ? '' : row[displayKey]).trim();
      var code = String(row[codeKey] == null ? '' : row[codeKey]).trim();
      if(display) return display;
      if(code){
        var label = lookupMasterLabel(sourceKey, code);
        return label || code;
      }
      return '-';
    }

    function normalizeOwnerFromRow(row, displayKey, empKey){
      if(!row) return '-';
      var display = String(row[displayKey] == null ? '' : row[displayKey]).trim();
      if(display) return display;
      var emp = String(row[empKey] == null ? '' : row[empKey]).trim();
      return emp || '-';
    }

    // Match WIPS/workstation detail badge rendering (circle badges)
    function renderOxBadge(ox){
      var v = String(ox == null ? '' : ox).trim().toUpperCase();
      if(v !== 'O' && v !== 'X'){
        return '<span class="cell-ox with-badge"><span class="ox-badge" aria-label="">-</span></span>';
      }
      return '<span class="cell-ox with-badge"><span class="ox-badge '+(v==='O'?'on':'off')+'" aria-label="'+(v==='O'?'예':'아니오')+'">'+v+'</span></span>';
    }

    function renderNumBadge(value, kind){
      var s = String(value == null ? '' : value).trim();
      if(!s){
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
      if(String(show).trim() === '-' || isNaN(n)){
        return '<span class="cell-num"><span class="num-badge">'+(String(show).trim() ? show : '-')+'</span></span>';
      }
      return '<span class="cell-num"><span class="num-badge '+tone+'">'+show+'</span></span>';
    }

    function setInfoRowValue(cardIndex, rowIndex, value){
      var row = document.querySelector('.basic-info-card:nth-child('+cardIndex+') .info-row:nth-child('+rowIndex+')');
      if(!row) return;
      var v = (value == null) ? '' : String(value);
      var textEl = row.querySelector('.status-text') || row.querySelector('.info-value') || row.querySelector('.num-badge') || row.querySelector('.ox-badge') || row.querySelector('.info-value');
      if(textEl) textEl.textContent = v && String(v).trim() ? v : '-';
    }

    function setInfoRowHTML(cardIndex, rowIndex, html, fallbackText){
      var row = document.querySelector('.basic-info-card:nth-child('+cardIndex+') .info-row:nth-child('+rowIndex+')');
      if(!row) return;
      var host = row.querySelector('.info-value');
      if(host){
        var h = (html == null) ? '' : String(html);
        if(h && h.trim() && h !== '-') host.innerHTML = h;
        else host.textContent = (fallbackText != null && String(fallbackText).trim()) ? String(fallbackText) : '-';
      } else {
        setInfoRowValue(cardIndex, rowIndex, fallbackText != null ? fallbackText : '-');
      }
    }
    function setText(sel, val){
      var el = document.querySelector(sel);
      if(el) el.textContent = String(val == null ? '' : val).trim() || '-';
    }
    function setBadge(sel, val){
      var el = document.querySelector(sel);
      // ETC detail template uses .info-value (not .info-value). Keep selectors backward compatible.
      if(!el && sel && String(sel).indexOf('.info-value') > -1){
        try{
          el = document.querySelector(String(sel).replace(/\.info-value/g, '.info-value'));
        }catch(_e0){ el = null; }
      }
      if(el) el.textContent = String(val == null ? '' : val).trim() || '-';
    }
    function setNumBadge(sel, val){
      var el = document.querySelector(sel);
      if(!el) return;
      var v = String(val == null ? '' : val).trim();
      el.textContent = v || '-';
      el.classList.remove('tone-1','tone-2','tone-3');
      var n = parseInt(v, 10);
      if(!isNaN(n)) el.classList.add(n>=3?'tone-3':(n===2?'tone-2':'tone-1'));
    }
    function setStatusPill(val){
      var textEl = document.querySelector('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill .status-text');
      if(textEl) textEl.textContent = String(val == null ? '' : val).trim() || '-';
      try{
        var pill = document.querySelector('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill');
        if(pill){
          var dot = pill.querySelector('.status-dot');
          var lbl = String(val == null ? '' : val).trim();
          var cls = (lbl==='가동'?'ws-run': (lbl==='유휴'?'ws-idle':'ws-wait'));
          if(dot){ dot.classList.remove('ws-run','ws-idle','ws-wait'); dot.classList.add(cls); }
        }
      }catch(_e){}
    }
    function setOX(rowSel, val){
      var el = document.querySelector(rowSel+' .ox-badge');
      if(!el) return;
      var v = toOX(val);
      el.classList.remove('on','off','is-empty');
      if(v === 'O'){
        el.textContent = 'O';
        el.classList.add('on');
        try{ el.setAttribute('aria-label','예'); }catch(_e0){}
        return;
      }
      if(v === 'X'){
        el.textContent = 'X';
        el.classList.add('off');
        try{ el.setAttribute('aria-label','아니오'); }catch(_e1){}
        return;
      }
      el.textContent = '-';
      el.classList.add('off','is-empty');
      try{ el.setAttribute('aria-label','정보 없음'); }catch(_e2){}
    }
    function hydrateHeader(){
      var row = getSelectedRow();
      try{
        var titleEl = document.getElementById('page-title');
        if(titleEl){
          var work = row && row.work_name ? String(row.work_name).trim() : '';
          titleEl.textContent = work || '기타 보안 장비';
        }
        var subEl = document.getElementById('page-subtitle');
        if(subEl){
          var sys = row && row.system_name ? String(row.system_name).trim() : '';
          subEl.textContent = sys || '-';
        }
      }catch(_e){}
    }
    function hydrateBasicInfo(){
      // Only when basic-info cards exist
      var grid = document.querySelector('.basic-info-grid');
      if(!grid) return;
      var row = getSelectedRow();
      if(!row) return;

      // Ensure selected:asset_id exists for cross-tab API calls
      var aid = _parseIntOrNull(row.id != null ? row.id : row.asset_id);
      if(aid != null) _safeSet(ETC_STORAGE_PREFIX+':selected:asset_id', aid);

      var wsLabel = normalizeFromRow(row, 'work_status', 'work_status_code', 'WORK_STATUS');
      setInfoRowHTML(1,1, renderWorkStatusPill(wsLabel, row.work_status_color, row.work_status_token), wsLabel);
      setInfoRowValue(1,2, normalizeFromRow(row, 'work_type', 'work_type_code', 'WORK_CATEGORY'));
      setInfoRowValue(1,3, normalizeFromRow(row, 'work_category', 'work_category_code', 'WORK_DIVISION'));
      setInfoRowValue(1,4, normalizeFromRow(row, 'work_operation', 'work_operation_code', 'WORK_OPERATION'));
      setInfoRowValue(1,5, normalizeFromRow(row, 'work_group', 'work_group_code', 'WORK_GROUP'));
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(6) .info-value', row.work_name);
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(7) .info-value', row.system_name);
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(8) .info-value', row.system_ip);
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(9) .info-value', row.manage_ip);

      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(1) .info-value', row.vendor);
      // Model: prefer name by server_code/security_code
      setBadge(
        '.basic-info-card:nth-child(2) .info-row:nth-child(2) .info-value',
        normalizeFromRow(row, 'model', 'server_code', 'SECURITY_MODEL')
      );
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(3) .info-value', row.serial);
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(4) .info-value', row.virtualization);
      // Location: prefer names by center/rack codes
      setBadge(
        '.basic-info-card:nth-child(2) .info-row:nth-child(5) .info-value',
        normalizeFromRow(row, 'location_place', 'center_code', 'ORG_CENTER')
      );
      setBadge(
        '.basic-info-card:nth-child(2) .info-row:nth-child(6) .info-value',
        normalizeFromRow(row, 'location_pos', 'rack_code', 'ORG_RACK')
      );
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(7) .info-value', row.slot);
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(8) .info-value', row.u_size);
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(9) .info-value', (row.rack_face === 'REAR') ? '후면' : '전면');

      setBadge(
        '.basic-info-card:nth-child(3) .info-row:nth-child(1) .info-value',
        normalizeFromRow(row, 'sys_dept', 'system_dept_code', 'ORG_DEPT')
      );
      setBadge(
        '.basic-info-card:nth-child(3) .info-row:nth-child(3) .info-value',
        normalizeFromRow(row, 'svc_dept', 'service_dept_code', 'ORG_DEPT')
      );

      // Owners may require user-profile lookup by emp_no
      setBadge(
        '.basic-info-card:nth-child(3) .info-row:nth-child(2) .info-value',
        normalizeOwnerFromRow(row, 'sys_owner', 'system_owner_emp_no')
      );
      setBadge(
        '.basic-info-card:nth-child(3) .info-row:nth-child(4) .info-value',
        normalizeOwnerFromRow(row, 'svc_owner', 'service_owner_emp_no')
      );

      // Resolve owner names async when only emp_no is available
      (function(){
        var sysEmp = String(row.system_owner_emp_no == null ? '' : row.system_owner_emp_no).trim();
        var svcEmp = String(row.service_owner_emp_no == null ? '' : row.service_owner_emp_no).trim();
        function apply(sel, name){
          if(!name) return;
          setBadge(sel, name);
        }
        if(sysEmp && (!row.sys_owner || String(row.sys_owner).trim() === sysEmp)){
          fetchUserProfileName(sysEmp).then(function(name){
            if(name){
              apply('.basic-info-card:nth-child(3) .info-row:nth-child(2) .info-value', name);
              try{ row.sys_owner = name; }catch(_e0){}
            }
          });
        }
        if(svcEmp && (!row.svc_owner || String(row.svc_owner).trim() === svcEmp)){
          fetchUserProfileName(svcEmp).then(function(name){
            if(name){
              apply('.basic-info-card:nth-child(3) .info-row:nth-child(4) .info-value', name);
              try{ row.svc_owner = name; }catch(_e1){}
            }
          });
        }
      })();

      var c = (row.confidentiality != null ? String(row.confidentiality) : '');
      var i = (row.integrity != null ? String(row.integrity) : '');
      var a = (row.availability != null ? String(row.availability) : '');
      var sc = (row.security_score != null ? String(row.security_score) : '');
      setInfoRowHTML(4,1, renderNumBadge(c, 'confidentiality'), c);
      setInfoRowHTML(4,2, renderNumBadge(i, 'integrity'), i);
      setInfoRowHTML(4,3, renderNumBadge(a, 'availability'), a);
      setInfoRowHTML(4,4, renderNumBadge(sc, 'security_score'), sc);
      setText('.basic-info-card:nth-child(4) .info-row:nth-child(5) .info-value', row.system_grade);
      setText('.basic-info-card:nth-child(4) .info-row:nth-child(6) .info-value', toCoreFlag(row.core_flag));
      var dr = toOX(row.dr_built);
      var ha = toOX(row.svc_redundancy);
      setInfoRowHTML(4,7, renderOxBadge(dr), dr);
      setInfoRowHTML(4,8, renderOxBadge(ha), ha);
    }

    function renderFromSelectedRow(){
      hydrateHeader();
      hydrateBasicInfo();
    }

    // Initial render (fast path from storage).
    renderFromSelectedRow();

    // Ensure masters are present for code->name fallback.
    ensureMasters().then(function(){ renderFromSelectedRow(); }).catch(function(){});

    // Canonical fetch: fixes refresh/deeplink cases where storage is empty or incomplete.
    (function(){
      var assetId = resolveAssetId();
      if(assetId == null) return;
      _safeSet(ETC_STORAGE_PREFIX+':selected:asset_id', assetId);

      var existing = getSelectedRow();
      var existingId = _parseIntOrNull(existing && (existing.id != null ? existing.id : existing.asset_id));
      var shouldFetch = true;
      if(existing && existing.__source === 'api' && existingId === assetId){
        // If we already have an API-sourced row for this asset, skip.
        shouldFetch = false;
      }
      if(!shouldFetch) return;

      fetchEtcAssetDetail(assetId)
        .then(function(item){
          var normalized = normalizeSelectedRowFromApiItem(item);
          var merged = mergeSelectedRowsCanonical(existing, normalized);
          setSelectedRow(merged);
          renderFromSelectedRow();
          // Masters can still fill gaps if any
          ensureMasters().then(function(){ renderFromSelectedRow(); }).catch(function(){});
        })
        .catch(function(){
          // Fall back to whatever we have in storage.
        });
    })();

    // Tabs are handled by /static/js/_detail/tab*.js.
    // (Do not inline legacy tab logic here; it breaks page hydration when this shared file is loaded.)

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
      function cleanPlaceholder(v){
        var s = String(v == null ? '' : v).trim();
        if(!s) return '';
        // UI placeholders
        if(s === '-' || s === '선택') return '';
        return s;
      }
      function text(sel){ var el=document.querySelector(sel); return cleanPlaceholder(el? el.textContent : ''); }
      function badgeVal(sel){ var el=document.querySelector(sel); return cleanPlaceholder(el? el.textContent : ''); }
      function cia(sel){ var el=document.querySelector(sel); return cleanPlaceholder(el? el.textContent : ''); }
      var selectedRowData = null;
      try{
        var storagePrefix = (typeof STORAGE_PREFIX !== 'undefined' && STORAGE_PREFIX) ? STORAGE_PREFIX : 'security-etc';
        var raw = sessionStorage.getItem(storagePrefix+':selected:row') || localStorage.getItem(storagePrefix+':selected:row');
        if(raw){
          var selectedRow = JSON.parse(raw);
          // Include both display fields and *_code fields so searchable selects can preselect correctly.
          var keys = [
            'work_status','work_status_code','work_status_name','work_status_color','work_status_token',
            'work_type','work_type_code','work_type_name',
            'work_category','work_category_code','work_category_name',
            'work_operation','work_operation_code','work_operation_name',
            'work_group','work_group_code','work_group_name',
            'work_name','system_name','system_ip','manage_ip',
            'vendor','model','serial','virtualization','location_place','location_pos','slot','u_size',
            // Codes/IDs to resolve names
            'server_code','manufacturer_code',
            'center_code','rack_code',
            'system_dept_code','service_dept_code',
            'system_owner_emp_no','service_owner_emp_no',

            'sys_dept','sys_owner','svc_dept','svc_owner',
            'confidentiality','integrity','availability','security_score','system_grade','core_flag','dr_built','svc_redundancy'
          ];
          selectedRowData = {};
          keys.forEach(function(k){
            if(selectedRow && selectedRow[k] != null){
              var v = cleanPlaceholder(selectedRow[k]);
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
          if(!selectedRowData.work_status_code){
            var wsc = (selectedRow.work_status_code != null ? selectedRow.work_status_code : null);
            if(wsc != null){
              wsc = String(wsc).trim();
              if(wsc !== '') selectedRowData.work_status_code = wsc;
            }
          }
        }
      }catch(_e){ selectedRowData = null; }

      // If storage row is missing display fields, backfill from the rendered Basic Info.
      // This guarantees "기본정보 화면"과 "수정 모달"이 항상 같은 값을 보게 됩니다.
      try{
        if(selectedRowData){
          var backfill = function(key, v){
            if(selectedRowData[key] == null || String(selectedRowData[key]).trim() === ''){
              var s = cleanPlaceholder(v);
              if(s !== '') selectedRowData[key] = s;
            }
          };
          backfill('work_type', badgeVal('.basic-info-card:nth-child(1) .info-row:nth-child(2) .info-value, .basic-info-card:nth-child(1) .info-row:nth-child(2) .info-value'));
          backfill('work_category', badgeVal('.basic-info-card:nth-child(1) .info-row:nth-child(3) .info-value, .basic-info-card:nth-child(1) .info-row:nth-child(3) .info-value'));
          backfill('work_status', text('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill .status-text, .basic-info-card:nth-child(1) .info-row:nth-child(1) .info-value'));
          backfill('work_operation', text('.basic-info-card:nth-child(1) .info-row:nth-child(4) .info-value'));
          backfill('work_group', badgeVal('.basic-info-card:nth-child(1) .info-row:nth-child(5) .info-value, .basic-info-card:nth-child(1) .info-row:nth-child(5) .info-value'));

          backfill('location_place', badgeVal('.basic-info-card:nth-child(2) .info-row:nth-child(5) .info-value, .basic-info-card:nth-child(2) .info-row:nth-child(5) .info-value'));
          backfill('location_pos', badgeVal('.basic-info-card:nth-child(2) .info-row:nth-child(6) .info-value, .basic-info-card:nth-child(2) .info-row:nth-child(6) .info-value'));
          backfill('sys_dept', badgeVal('.basic-info-card:nth-child(3) .info-row:nth-child(1) .info-value, .basic-info-card:nth-child(3) .info-row:nth-child(1) .info-value'));
          backfill('sys_owner', badgeVal('.basic-info-card:nth-child(3) .info-row:nth-child(2) .info-value, .basic-info-card:nth-child(3) .info-row:nth-child(2) .info-value'));
          backfill('svc_dept', badgeVal('.basic-info-card:nth-child(3) .info-row:nth-child(3) .info-value, .basic-info-card:nth-child(3) .info-row:nth-child(3) .info-value'));
          backfill('svc_owner', badgeVal('.basic-info-card:nth-child(3) .info-row:nth-child(4) .info-value, .basic-info-card:nth-child(3) .info-row:nth-child(4) .info-value'));
        }
      }catch(_bf){/* ignore */}

      var data = selectedRowData || {
        work_type: badgeVal('.basic-info-card:nth-child(1) .info-row:nth-child(2) .info-value, .basic-info-card:nth-child(1) .info-row:nth-child(2) .info-value'),
        work_category: badgeVal('.basic-info-card:nth-child(1) .info-row:nth-child(3) .info-value, .basic-info-card:nth-child(1) .info-row:nth-child(3) .info-value'),
        work_status: text('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill .status-text, .basic-info-card:nth-child(1) .info-row:nth-child(1) .info-value'),
        work_operation: text('.basic-info-card:nth-child(1) .info-row:nth-child(4) .info-value'),
        work_group: badgeVal('.basic-info-card:nth-child(1) .info-row:nth-child(5) .info-value, .basic-info-card:nth-child(1) .info-row:nth-child(5) .info-value'),
        work_name: text('.basic-info-card:nth-child(1) .info-row:nth-child(6) .info-value'),
        system_name: text('.basic-info-card:nth-child(1) .info-row:nth-child(7) .info-value'),
        system_ip: text('.basic-info-card:nth-child(1) .info-row:nth-child(8) .info-value'),
        manage_ip: text('.basic-info-card:nth-child(1) .info-row:nth-child(9) .info-value'),
        vendor: badgeVal('.basic-info-card:nth-child(2) .info-row:nth-child(1) .info-value, .basic-info-card:nth-child(2) .info-row:nth-child(1) .info-value'),
        model: badgeVal('.basic-info-card:nth-child(2) .info-row:nth-child(2) .info-value, .basic-info-card:nth-child(2) .info-row:nth-child(2) .info-value'),
        serial: text('.basic-info-card:nth-child(2) .info-row:nth-child(3) .info-value'),
        virtualization: badgeVal('.basic-info-card:nth-child(2) .info-row:nth-child(4) .info-value, .basic-info-card:nth-child(2) .info-row:nth-child(4) .info-value'),
        location_place: badgeVal('.basic-info-card:nth-child(2) .info-row:nth-child(5) .info-value, .basic-info-card:nth-child(2) .info-row:nth-child(5) .info-value'),
        location_pos: badgeVal('.basic-info-card:nth-child(2) .info-row:nth-child(6) .info-value, .basic-info-card:nth-child(2) .info-row:nth-child(6) .info-value'),
        slot: text('.basic-info-card:nth-child(2) .info-row:nth-child(7) .info-value'),
        u_size: text('.basic-info-card:nth-child(2) .info-row:nth-child(8) .info-value'),
        sys_dept: badgeVal('.basic-info-card:nth-child(3) .info-row:nth-child(1) .info-value, .basic-info-card:nth-child(3) .info-row:nth-child(1) .info-value'),
        sys_owner: badgeVal('.basic-info-card:nth-child(3) .info-row:nth-child(2) .info-value, .basic-info-card:nth-child(3) .info-row:nth-child(2) .info-value'),
        svc_dept: badgeVal('.basic-info-card:nth-child(3) .info-row:nth-child(3) .info-value, .basic-info-card:nth-child(3) .info-row:nth-child(3) .info-value'),
        svc_owner: badgeVal('.basic-info-card:nth-child(3) .info-row:nth-child(4) .info-value, .basic-info-card:nth-child(3) .info-row:nth-child(4) .info-value'),
        confidentiality: cia('.basic-info-card:nth-child(4) .info-row:nth-child(1) .num-badge, .basic-info-card:nth-child(4) .info-row:nth-child(1) .info-value'),
        integrity: cia('.basic-info-card:nth-child(4) .info-row:nth-child(2) .num-badge, .basic-info-card:nth-child(4) .info-row:nth-child(2) .info-value'),
        availability: cia('.basic-info-card:nth-child(4) .info-row:nth-child(3) .num-badge, .basic-info-card:nth-child(4) .info-row:nth-child(3) .info-value'),
        security_score: cia('.basic-info-card:nth-child(4) .info-row:nth-child(4) .num-badge, .basic-info-card:nth-child(4) .info-row:nth-child(4) .info-value'),
        system_grade: text('.basic-info-card:nth-child(4) .info-row:nth-child(5) .info-value'),
        core_flag: text('.basic-info-card:nth-child(4) .info-row:nth-child(6) .info-value'),
        dr_built: (function(){ var el=document.querySelector('.basic-info-card:nth-child(4) .info-row:nth-child(7) .ox-badge, .basic-info-card:nth-child(4) .info-row:nth-child(7) .info-value'); return cleanPlaceholder(el? el.textContent : ''); })(),
        svc_redundancy: (function(){ var el=document.querySelector('.basic-info-card:nth-child(4) .info-row:nth-child(8) .ox-badge, .basic-info-card:nth-child(4) .info-row:nth-child(8) .info-value'); return cleanPlaceholder(el? el.textContent : ''); })()
      };
      var GROUPS = [
        { title:'비즈니스', cols:['work_type','work_category','work_status','work_operation','work_group','work_name','system_name','system_ip','manage_ip'] },
        { title:'시스템', cols:['vendor','model','serial','virtualization','location_place','location_pos','slot','u_size','rack_face'] },
        { title:'담당자', cols:['sys_dept','sys_owner','svc_dept','svc_owner'] },
        { title:'점검', cols:['confidentiality','integrity','availability','security_score','system_grade','core_flag','dr_built','svc_redundancy'] }
      ];

      var _etcSecurityTypesCache = null;
      function normalizeSecurityType(value){
        var raw = String(value || '').trim();
        if(!raw) return '';
        var lowered = raw.toLowerCase();
        var compact = lowered.replace(/[\s\-_]/g, '');
        if(compact === 'fw' || compact === 'firewall' || lowered.indexOf('방화벽') > -1) return 'FW';
        if(compact === 'vpn' || lowered.indexOf('가상사설') > -1 || lowered.indexOf('가상 사설') > -1) return 'VPN';
        if(compact === 'ids' || lowered.indexOf('침입탐지') > -1 || lowered.indexOf('침입 탐지') > -1) return 'IDS';
        if(compact === 'ips' || lowered.indexOf('침입방지') > -1 || lowered.indexOf('침입 방지') > -1) return 'IPS';
        if(compact === 'hsm') return 'HSM';
        if(compact === 'kms') return 'KMS';
        if(compact === 'wips') return 'WIPS';
        if(compact === 'etc' || lowered.indexOf('기타') > -1) return 'ETC';
        return raw.toUpperCase();
      }

      function isEtcSecurityModel(item){
        var type = normalizeSecurityType(item && (item.security_type || item.hw_type || item.type || item.form_factor));
        return type === 'ETC';
      }

      function loadEtcSecurityTypes(){
        if(_etcSecurityTypesCache) return Promise.resolve(_etcSecurityTypesCache);
        var url = '/api/hw-security-types?limit=2000';
        return fetch(url, { method:'GET', headers:{ 'Accept':'application/json' } })
          .then(function(r){ return r.json(); })
          .then(function(data){
            var items = (data && data.items) ? data.items : (Array.isArray(data) ? data : []);
            _etcSecurityTypesCache = Array.isArray(items) ? items : [];
            return _etcSecurityTypesCache;
          })
          .catch(function(){ _etcSecurityTypesCache = []; return _etcSecurityTypesCache; });
      }

      function populateModelSelect(selectEl, currentCode, currentLabel){
        if(!selectEl) return;
        var currentC = String(currentCode == null ? '' : currentCode).trim();
        var currentL = String(currentLabel == null ? '' : currentLabel).trim();
        // Show immediate placeholder so the UI isn't blank
        selectEl.innerHTML = '<option value="">선택</option><option value="-">-</option>'
          + (currentC && currentC !== '-' ? ('<option value="'+escapeHTML(currentC)+'" selected>'+(escapeHTML(currentL || currentC))+'</option>') : '');
        // Async load options (prefer master map if available)
        ensureMasters().then(function(){
          var map = (_mastersCache && _mastersCache.SECURITY_MODEL) ? _mastersCache.SECURITY_MODEL : {};
          var codes = Object.keys(map || {});
          codes.sort(function(a,b){
            return String(map[a]||a).localeCompare(String(map[b]||b), 'ko', { sensitivity:'base' });
          });
          var html = '<option value="">선택</option><option value="-">-</option>';
          var hasSelected = !currentC;
          codes.forEach(function(code){
            var label = String(map[code] || code);
            var sel = (currentC && code === currentC) ? ' selected' : '';
            if(sel) hasSelected = true;
            html += '<option value="'+escapeAttr(code)+'"'+sel+'>'+escapeHTML(label)+'</option>';
          });
          if(currentC && !hasSelected){
            html += '<option value="'+escapeAttr(currentC)+'" selected>'+escapeHTML(currentL || currentC)+'</option>';
          }
          selectEl.innerHTML = html;
          try{ if(typeof window.syncSearchableSelect === 'function') window.syncSearchableSelect(selectEl); }catch(_e1){}
        }).catch(function(){
          // Fallback to legacy loader if masters fail
          loadEtcSecurityTypes().then(function(items){
            var opts = (items || []).filter(isEtcSecurityModel).map(function(it){
              var code = String((it && (it.security_code || it.securityCode)) || '').trim();
              var name = String((it && (it.model_name || it.modelName)) || '').trim();
              if(!code) return null;
              return { code: code, name: name || code };
            }).filter(Boolean);
            // de-dupe + sort
            var seen = {};
            opts = opts.filter(function(it){ if(seen[it.code]) return false; seen[it.code]=true; return true; });
            opts.sort(function(a,b){ return String(a.name||a.code).localeCompare(String(b.name||b.code), 'ko', { sensitivity:'base' }); });
            var html = '<option value="">선택</option><option value="-">-</option>';
            var hasSelected = !currentC;
            opts.forEach(function(it){
              var sel = (currentC && it.code === currentC) ? ' selected' : '';
              if(sel) hasSelected = true;
              html += '<option value="'+escapeAttr(it.code)+'"'+sel+'>'+escapeHTML(it.name)+'</option>';
            });
            if(currentC && !hasSelected){
              html += '<option value="'+escapeAttr(currentC)+'" selected>'+escapeHTML(currentL || currentC)+'</option>';
            }
            selectEl.innerHTML = html;
            try{ if(typeof window.syncSearchableSelect === 'function') window.syncSearchableSelect(selectEl); }catch(_e2){}
          });
        });
      }
      function fieldInput(col, value){
        var opts={
          virtualization:['','물리','가상'],
          confidentiality:['','1','2','3'], integrity:['','1','2','3'], availability:['','1','2','3'],
          system_grade:['','1등급','2등급','3등급'], core_flag:['','핵심','일반'], dr_built:['','O','X'], svc_redundancy:['','O','X']
        };
        if(col==='security_score') return '<input name="security_score" class="form-input" type="number" readonly placeholder="자동 합계" value="'+(value||'')+'">';
        if(col==='work_status') return '<select name="work_status" class="form-input search-select" data-placeholder="선택"><option value="">선택</option></select>';
        if(col==='work_type') return '<select name="work_type" class="form-input search-select" data-placeholder="선택"><option value="">선택</option></select>';
        if(col==='work_category') return '<select name="work_category" class="form-input search-select" data-placeholder="선택"><option value="">선택</option></select>';
        if(col==='work_operation') return '<select name="work_operation" class="form-input search-select" data-placeholder="선택"><option value="">선택</option></select>';
        if(col==='work_group') return '<select name="work_group" class="form-input search-select" data-placeholder="선택"><option value="">선택</option></select>';
        // Location / org fields as searchable dropdowns
        if(col==='location_place') return '<select name="location_place" class="form-input search-select" data-placeholder="센터 선택"><option value="">선택</option></select>';
        if(col==='location_pos') return '<select name="location_pos" class="form-input search-select" data-placeholder="랙 선택"><option value="">선택</option></select>';
        if(col==='sys_dept') return '<select name="sys_dept" class="form-input search-select" data-placeholder="부서 선택"><option value="">선택</option></select>';
        if(col==='svc_dept') return '<select name="svc_dept" class="form-input search-select" data-placeholder="부서 선택"><option value="">선택</option></select>';
        if(col==='sys_owner') return '<select name="sys_owner" class="form-input search-select" data-placeholder="담당자 선택"><option value="">선택</option></select>';
        if(col==='svc_owner') return '<select name="svc_owner" class="form-input search-select" data-placeholder="담당자 선택"><option value="">선택</option></select>';
        if(opts[col]){
          // Make these selects searchable too (as requested)
          return '<select name="'+col+'" class="form-input search-select '+(['confidentiality','integrity','availability'].indexOf(col)>-1?'score-trigger':'')+'" data-placeholder="선택">'+
            opts[col].map(function(o){ return '<option value="'+o+'" '+(String(o)===String(value)?'selected':'')+'>'+(o||'-')+'</option>'; }).join('')+
          '</select>';
        }
        if(col === 'model'){
          // Searchable dropdown (ETC models); value is security_code(server_code), display is model_name.
          var v = String(value == null ? '' : value);
          return '<select name="model" class="form-input search-select" data-placeholder="선택">'
            + '<option value="">선택</option>'
            + '<option value="-" '+(v==='-'?'selected':'')+'>-</option>'
            + (v && v !== '-' ? ('<option value="'+escapeHTML(v)+'" selected>'+escapeHTML(v)+'</option>') : '')
            + '</select>';
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

      // Initialize touched/cleared flags for all controls.
      // These flags are used to prevent async master loads from overwriting edits,
      // and to support explicit "clear" (empty -> NULL) saves.
      function _initInteractionFlags(node){
        try{
          if(!node || !node.dataset) return;
          node.dataset.userTouched = '0';
          node.dataset.userCleared = '0';
        }catch(_e0){}
      }
      function _updateClearedFlag(node){
        try{
          if(!node || !node.dataset) return;
          var s = '';
          try{ s = String(node.value || ''); }catch(_e1){ s = ''; }
          node.dataset.userCleared = (s.trim() === '') ? '1' : '0';
        }catch(_e2){}
      }
      try{
        Array.from(form.querySelectorAll('input,select,textarea')).forEach(function(node){
          _initInteractionFlags(node);
        });
      }catch(_eInitAll){}

      // Sync searchable selects, but delay for selects that will be populated async (work/org/model).
      // If we sync too early, the custom UI can get stuck showing the placeholder "선택".
      function isAsyncPopulatedSelect(sel){
        if(!sel) return false;
        var n = String(sel.getAttribute('name') || '').trim();
        return ['work_status','work_type','work_category','work_operation','work_group','location_place','location_pos','sys_dept','svc_dept','sys_owner','svc_owner','model'].indexOf(n) > -1;
      }
      function syncSelect(sel){
        try{ if(sel && typeof window.syncSearchableSelect === 'function') window.syncSearchableSelect(sel); }catch(_eSync2){}
      }
      try{
        Array.from(form.querySelectorAll('select.search-select')).forEach(function(sel){
          if(!isAsyncPopulatedSelect(sel)) syncSelect(sel);
        });
      }catch(_eSyncAll){}

      // Track user interaction so async refills don't wipe in-progress edits.
      try{
        Array.from(form.querySelectorAll('select.search-select')).forEach(function(sel){
          sel.addEventListener('change', function(){
            try{ sel.dataset.userTouched = '1'; }catch(_eUT){}
            _updateClearedFlag(sel);
          });
        });
      }catch(_eUTAll){}
      try{
        Array.from(form.querySelectorAll('input,textarea')).forEach(function(inp){
          inp.addEventListener('input', function(){
            try{ inp.dataset.userTouched = '1'; }catch(_eUT2){}
            _updateClearedFlag(inp);
          });
          inp.addEventListener('change', function(){
            try{ inp.dataset.userTouched = '1'; }catch(_eUT3){}
            _updateClearedFlag(inp);
          });
        });
      }catch(_eUTInp){}
      // Populate work master selects (show names, keep values as codes)
      (function(){
        function fillSelect(name, sourceKey, selectedCode, selectedLabel){
          var sel = form.querySelector('select[name="'+name+'"]');
          if(!sel) return;
          var currentCode = String(selectedCode == null ? '' : selectedCode).trim();
          var currentLabel = String(selectedLabel == null ? '' : selectedLabel).trim();

          // If the user already interacted with this field, never overwrite their current selection.
          // (This prevents async master loads from reverting to the original asset values.)
          var userTouched = false;
          var userCleared = false;
          try{
            userTouched = String(sel.dataset.userTouched || '') === '1';
            userCleared = String(sel.dataset.userCleared || '') === '1';
          }catch(_e0){}
          if(userTouched || userCleared){
            var keepValue = String(sel.value || '').trim();
            var keepOpt = (sel.selectedOptions && sel.selectedOptions[0]) ? sel.selectedOptions[0] : null;
            var keepLabel = keepOpt ? String(keepOpt.textContent || '').trim() : '';
            currentCode = keepValue;
            currentLabel = keepLabel || keepValue || currentLabel;
            if(userCleared){
              currentCode = '';
              currentLabel = '';
            }
          }

          var map = (_mastersCache && _mastersCache[sourceKey]) ? _mastersCache[sourceKey] : {};
          var codes = Object.keys(map || {});
          // If the "label" we got is actually a code (common when list normalization fell back to code), treat it as code.
          if(!currentCode && currentLabel && map && Object.prototype.hasOwnProperty.call(map, currentLabel)){
            currentCode = currentLabel;
          }
          // If only a label is known (e.g. detail UI shows names), infer the code by label.
          if(!currentCode && currentLabel){
            var inferred = '';
            for(var ci=0; ci<codes.length; ci++){
              var code = codes[ci];
              if(String(map[code] || code).trim() === currentLabel){
                inferred = code;
                break;
              }
            }
            if(inferred) currentCode = inferred;
          }

          // Seed an immediate selected option. Important: never use label as the option value.
          // If we don't know the code, keep value empty so we don't submit invalid FK values.
          (function(){
            var seed = '<option value="">선택</option>';
            if(currentCode){
              seed += '<option value="'+escapeAttr(currentCode)+'" selected>'+escapeHTML(currentLabel || currentCode)+'</option>';
            } else if(currentLabel){
              seed += '<option value="" selected>'+escapeHTML(currentLabel)+'</option>';
            }
            sel.innerHTML = seed;
            syncSelect(sel);
          })();
          codes.sort(function(a,b){
            return String(map[a]||a).localeCompare(String(map[b]||b), 'ko', { sensitivity:'base' });
          });
          var html = '<option value="">선택</option>';
          // Keep label-only selection visible even before masters are loaded.
          var hasSelected = !currentCode;
          if(!currentCode && currentLabel){
            html += '<option value="" selected>'+escapeHTML(currentLabel)+'</option>';
            hasSelected = true;
          }
          codes.forEach(function(code){
            var label = String(map[code] || code);
            var selected = (currentCode && code === currentCode) ? ' selected' : '';
            if(selected) hasSelected = true;
            html += '<option value="'+escapeAttr(code)+'"'+selected+'>'+escapeHTML(label)+'</option>';
          });
          if(currentCode && !hasSelected){
            html += '<option value="'+escapeAttr(currentCode)+'" selected>'+escapeHTML(currentLabel || currentCode)+'</option>';
          }
          sel.innerHTML = html;
          syncSelect(sel);
        }

        // Seed current values immediately so the modal doesn't appear "empty" while masters are loading.
        // These will be replaced with full option lists after ensureMasters().
        fillSelect('work_status','WORK_STATUS', data.work_status_code || '', data.work_status);
        fillSelect('work_type','WORK_CATEGORY', data.work_type_code || '', data.work_type);
        fillSelect('work_category','WORK_DIVISION', data.work_category_code || '', data.work_category);
        fillSelect('work_operation','WORK_OPERATION', data.work_operation_code || '', data.work_operation);
        fillSelect('work_group','WORK_GROUP', data.work_group_code || '', data.work_group);
        fillSelect('location_place','ORG_CENTER', data.center_code || '', data.location_place);
        fillSelect('sys_dept','ORG_DEPT', data.system_dept_code || '', data.sys_dept);
        fillSelect('svc_dept','ORG_DEPT', data.service_dept_code || '', data.svc_dept);

        ensureMasters().then(function(){
          // Pass codes only; labels go in selectedLabel so we never treat labels as option values.
          fillSelect('work_status','WORK_STATUS', data.work_status_code || '', data.work_status);
          fillSelect('work_type','WORK_CATEGORY', data.work_type_code || '', data.work_type);
          fillSelect('work_category','WORK_DIVISION', data.work_category_code || '', data.work_category);
          fillSelect('work_operation','WORK_OPERATION', data.work_operation_code || '', data.work_operation);
          fillSelect('work_group','WORK_GROUP', data.work_group_code || '', data.work_group);

          // Org masters
          fillSelect('location_place','ORG_CENTER', data.center_code || '', data.location_place);
          fillSelect('sys_dept','ORG_DEPT', data.system_dept_code || '', data.sys_dept);
          fillSelect('svc_dept','ORG_DEPT', data.service_dept_code || '', data.svc_dept);

          // Model: select value is server_code, label is model_name
          try{
            var modelSel = form.querySelector('select[name="model"]');
            if(modelSel){
              var currentCode = data.server_code || data.model;
              var currentLabel = data.model_name || data.model;
              populateModelSelect(modelSel, currentCode, currentLabel);
            }
          }catch(_m0){}

          // Racks depend on selected center
          (function(){
            var centerSel = form.querySelector('select[name="location_place"]');
            var rackSel = form.querySelector('select[name="location_pos"]');
            if(!centerSel || !rackSel) return;

            var rackReqSeq = 0;

            function loadRacks(centerCode, selectedRackCode, selectedRackLabel){
              var cc = String(centerCode == null ? '' : centerCode).trim();
              var url = '/api/org-racks' + (cc ? ('?center_code=' + encodeURIComponent(cc)) : '');
              var reqId = ++rackReqSeq;

              // Preserve user selection when options are refreshed.
              var userTouched = false;
              var userCleared = false;
              try{
                userTouched = String(rackSel.dataset.userTouched || '') === '1';
                userCleared = String(rackSel.dataset.userCleared || '') === '1';
              }catch(_e0){}
              var keepRack = '';
              if(userTouched || userCleared){
                keepRack = String(rackSel.value || '').trim();
                if(userCleared) keepRack = '';
              }

              return fetchJSON(url).then(function(data0){
                if(reqId !== rackReqSeq) return;
                var items = itemsOf(data0);
                var map = buildCodeLabelMap(items, 'rack_code', 'rack_name');
                var codes = Object.keys(map || {});
                codes.sort(function(a,b){
                  return String(map[a]||a).localeCompare(String(map[b]||b), 'ko', { sensitivity:'base' });
                });
                var current = keepRack ? keepRack : String(selectedRackCode == null ? '' : selectedRackCode).trim();
                var currentLabel = String(selectedRackLabel == null ? '' : selectedRackLabel).trim();

                // If only a label is known, infer rack_code by rack_name.
                if(!current && currentLabel){
                  for(var ci=0; ci<codes.length; ci++){
                    var c0 = codes[ci];
                    if(String(map[c0] || c0).trim() === currentLabel){
                      current = c0;
                      break;
                    }
                  }
                }
                var html = '<option value="">선택</option>';
                var hasSelected = !current;
                codes.forEach(function(code){
                  var label = String(map[code] || code);
                  var sel = (current && code === current) ? ' selected' : '';
                  if(sel) hasSelected = true;
                  html += '<option value="'+escapeAttr(code)+'"'+sel+'>'+escapeHTML(label)+'</option>';
                });
                if(current && !hasSelected){
                  // Don't create invalid option values (labels) that would be submitted as rack_code.
                  var fallbackLabel = currentLabel || current;
                  html += '<option value="" selected>'+escapeHTML(fallbackLabel)+'</option>';
                  try{ rackSel.dataset.unresolvedLabel = fallbackLabel; }catch(_eU){}
                }
                rackSel.innerHTML = html;
                try{ if(typeof window.syncSearchableSelect === 'function') window.syncSearchableSelect(rackSel); }catch(_e0){}
              }).catch(function(){
                if(reqId !== rackReqSeq) return;
                rackSel.innerHTML = '<option value="">선택</option>';
                try{ if(typeof window.syncSearchableSelect === 'function') window.syncSearchableSelect(rackSel); }catch(_e1){}
              });
            }

            function currentCenterCode(){ return String(centerSel.value || '').trim(); }
            function currentCenterLabel(){
              var opt = centerSel.options && centerSel.selectedIndex >= 0 ? centerSel.options[centerSel.selectedIndex] : null;
              return opt ? String(opt.textContent || '').trim() : '';
            }

            // Initial
            var initialCenter = String(data.center_code || centerSel.value || '').trim();
            var initialRack = String(data.rack_code || '').trim();
            loadRacks(initialCenter || currentCenterCode(), initialRack, data.location_pos);

            // On center change, clear rack and reload
            centerSel.addEventListener('change', function(){
              // If center was selected by label (shouldn't happen), we keep as-is.
              var cc = currentCenterCode();
              if(!cc){ rackSel.innerHTML = '<option value="">선택</option>'; try{ if(typeof window.syncSearchableSelect === 'function') window.syncSearchableSelect(rackSel); }catch(_){} return; }
              // reset rack selection
              rackSel.value = '';
              try{ rackSel.dataset.userTouched = '1'; }catch(_eT){}
              loadRacks(cc, '', '');
            });
          })();

          // Owners depend on dept (use user-profiles)
          (function(){
            function fillOwners(ownerSelName, deptSelName, selectedEmp){
              var ownerSel = form.querySelector('select[name="'+ownerSelName+'"]');
              var deptSel = form.querySelector('select[name="'+deptSelName+'"]');
              if(!ownerSel || !deptSel) return;

              var ownerReqSeq = 0;

              function load(deptCode, selectedEmpNo){
                var dc = String(deptCode || '').trim();
                var url = '/api/user-profiles?limit=2000' + (dc ? ('&dept_code=' + encodeURIComponent(dc)) : '');

                var reqId = ++ownerReqSeq;

                // Preserve user selection if they already interacted.
                var userTouched = false;
                var userCleared = false;
                try{
                  userTouched = String(ownerSel.dataset.userTouched || '') === '1';
                  userCleared = String(ownerSel.dataset.userCleared || '') === '1';
                }catch(_e0){}
                var keepOwner = '';
                if(userTouched || userCleared){
                  keepOwner = String(ownerSel.value || '').trim();
                  if(userCleared) keepOwner = '';
                }

                return fetchJSON(url).then(function(data1){
                  if(reqId !== ownerReqSeq) return;
                  var items = itemsOf(data1);
                  var current = keepOwner ? keepOwner : String(selectedEmpNo || '').trim();
                  var html = '<option value="">선택</option>';
                  var seen = {};

                  // If we only have a display name (not emp_no), infer emp_no by name.
                  if(current){
                    var byName = '';
                    for(var ni=0; ni<items.length; ni++){
                      var it0 = items[ni];
                      var emp0 = String((it0 && it0.emp_no) || '').trim();
                      var name0 = String((it0 && it0.name) || '').trim();
                      if(name0 && name0 === current && emp0){
                        byName = emp0;
                        break;
                      }
                    }
                    if(byName) current = byName;
                  }

                  items.forEach(function(it){
                    var emp = String((it && it.emp_no) || '').trim();
                    if(!emp || seen[emp]) return;
                    seen[emp] = true;
                    var name = String((it && it.name) || emp).trim() || emp;
                    var sel = (current && emp === current) ? ' selected' : '';
                    html += '<option value="'+escapeAttr(emp)+'"'+sel+'>'+escapeHTML(name)+'</option>';
                  });

                  ownerSel.innerHTML = html;
                  try{ if(typeof window.syncSearchableSelect === 'function') window.syncSearchableSelect(ownerSel); }catch(_e0){}
                }).catch(function(){
                  if(reqId !== ownerReqSeq) return;
                  ownerSel.innerHTML = '<option value="">선택</option>';
                  try{ if(typeof window.syncSearchableSelect === 'function') window.syncSearchableSelect(ownerSel); }catch(_e1){}
                });
              }
              function deptCode(){ return String(deptSel.value || '').trim(); }
              load(deptCode(), selectedEmp);
              deptSel.addEventListener('change', function(){
                ownerSel.value = '';
                try{ ownerSel.dataset.userTouched = '1'; }catch(_eT){}
                load(deptCode(), '');
              });
            }
            fillOwners('sys_owner','sys_dept', data.system_owner_emp_no || data.sys_owner);
            fillOwners('svc_owner','svc_dept', data.service_owner_emp_no || data.svc_owner);
          })();
        }).catch(function(){});
      })();
      // (model select is populated above after masters load)
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
      function setTextAny(sel, val){
        var el = document.querySelector(sel);
        if(el) el.textContent = String(val||'');
      }
      var v = function(name){ var el=form.querySelector('[name="'+name+'"]'); return el? el.value : ''; };
      function selectedText(name){
        var el = form.querySelector('[name="'+name+'"]');
        if(!el) return '';
        if(el.tagName === 'SELECT'){
          // Treat placeholder option (value="") as empty.
          var opt = el.options && el.selectedIndex >= 0 ? el.options[el.selectedIndex] : null;
          if(!opt) return '';
          try{ if(String(el.value || '').trim() === '') return ''; }catch(_e0){}
          var t = String(opt.textContent || '').trim();
          if(t === '선택') return '';
          return t;
        }
        return String(el.value || '').trim();
      }
      // 업무 상태: status-pill이 있으면 그걸, 아니면 info-value
      (function(){
        var wsLabel = selectedText('work_status') || v('work_status');
        var host = document.querySelector('.basic-info-card:nth-child(1) .info-row:nth-child(1) .info-value');
        if(host){
          host.innerHTML = renderWorkStatusPill(wsLabel, null, null);
        } else {
          setTextAny('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill .status-text, .basic-info-card:nth-child(1) .info-row:nth-child(1) .info-value', wsLabel);
        }
      })();
      var wtLabel = selectedText('work_type') || '';
      var wcLabel = selectedText('work_category') || '';
      var woLabel = selectedText('work_operation') || '';
      var wgLabel = selectedText('work_group') || '';
      setTextAny('.basic-info-card:nth-child(1) .info-row:nth-child(2) .info-value, .basic-info-card:nth-child(1) .info-row:nth-child(2) .info-value', wtLabel || '-');
      setTextAny('.basic-info-card:nth-child(1) .info-row:nth-child(3) .info-value, .basic-info-card:nth-child(1) .info-row:nth-child(3) .info-value', wcLabel || '-');
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(4) .info-value', woLabel || '-');
      setTextAny('.basic-info-card:nth-child(1) .info-row:nth-child(5) .info-value, .basic-info-card:nth-child(1) .info-row:nth-child(5) .info-value', wgLabel || '-');
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(6) .info-value', v('work_name'));
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(7) .info-value', v('system_name'));
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(8) .info-value', v('system_ip'));
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(9) .info-value', v('manage_ip'));
      setTextAny('.basic-info-card:nth-child(2) .info-row:nth-child(1) .info-value, .basic-info-card:nth-child(2) .info-row:nth-child(1) .info-value', v('vendor'));
      // Model/location/dept/owner selects store codes; display selected option text.
      setTextAny('.basic-info-card:nth-child(2) .info-row:nth-child(2) .info-value, .basic-info-card:nth-child(2) .info-row:nth-child(2) .info-value', selectedText('model') || v('model'));
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(3) .info-value', v('serial'));
      setTextAny('.basic-info-card:nth-child(2) .info-row:nth-child(4) .info-value, .basic-info-card:nth-child(2) .info-row:nth-child(4) .info-value', v('virtualization'));
      setTextAny('.basic-info-card:nth-child(2) .info-row:nth-child(5) .info-value, .basic-info-card:nth-child(2) .info-row:nth-child(5) .info-value', selectedText('location_place') || v('location_place'));
      setTextAny('.basic-info-card:nth-child(2) .info-row:nth-child(6) .info-value, .basic-info-card:nth-child(2) .info-row:nth-child(6) .info-value', selectedText('location_pos') || v('location_pos'));
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(7) .info-value', v('slot'));
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(8) .info-value', v('u_size'));
      setTextAny('.basic-info-card:nth-child(3) .info-row:nth-child(1) .info-value, .basic-info-card:nth-child(3) .info-row:nth-child(1) .info-value', selectedText('sys_dept') || v('sys_dept'));
      setTextAny('.basic-info-card:nth-child(3) .info-row:nth-child(2) .info-value, .basic-info-card:nth-child(3) .info-row:nth-child(2) .info-value', selectedText('sys_owner') || v('sys_owner'));
      setTextAny('.basic-info-card:nth-child(3) .info-row:nth-child(3) .info-value, .basic-info-card:nth-child(3) .info-row:nth-child(3) .info-value', selectedText('svc_dept') || v('svc_dept'));
      setTextAny('.basic-info-card:nth-child(3) .info-row:nth-child(4) .info-value, .basic-info-card:nth-child(3) .info-row:nth-child(4) .info-value', selectedText('svc_owner') || v('svc_owner'));
      function setNumBadge(sel, num){
        var badge=document.querySelector(sel);
        if(!badge) return;
        var raw = (num == null) ? '' : String(num);
        var v = raw.trim();
        // Match WIPS: empty -> '-' (not blank)
        badge.textContent = v ? v : '-';
        badge.classList.remove('tone-1','tone-2','tone-3');
        var n=parseInt(v,10);
        if(!v || isNaN(n)) return;
        badge.classList.add(n>=3?'tone-3':(n===2?'tone-2':'tone-1'));
      }
      // 점검 점수: num-badge가 있으면 거기, 아니면 info-value
      if(document.querySelector('.basic-info-card:nth-child(4) .info-row:nth-child(1) .num-badge')){
        setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(1) .num-badge', v('confidentiality'));
        setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(2) .num-badge', v('integrity'));
        setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(3) .num-badge', v('availability'));
        setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(4) .num-badge', v('security_score'));
      } else {
        // Match WIPS: render circle badges inside .info-value
        (function(){
          var c=v('confidentiality');
          var i=v('integrity');
          var a=v('availability');
          var sc=v('security_score');
          var h1=document.querySelector('.basic-info-card:nth-child(4) .info-row:nth-child(1) .info-value');
          var h2=document.querySelector('.basic-info-card:nth-child(4) .info-row:nth-child(2) .info-value');
          var h3=document.querySelector('.basic-info-card:nth-child(4) .info-row:nth-child(3) .info-value');
          var h4=document.querySelector('.basic-info-card:nth-child(4) .info-row:nth-child(4) .info-value');
          if(h1) h1.innerHTML = renderNumBadge(c, 'confidentiality');
          if(h2) h2.innerHTML = renderNumBadge(i, 'integrity');
          if(h3) h3.innerHTML = renderNumBadge(a, 'availability');
          if(h4) h4.innerHTML = renderNumBadge(sc, 'security_score');
        })();
      }
      setTextAny('.basic-info-card:nth-child(4) .info-row:nth-child(5) .info-value', v('system_grade') || '-');
      setTextAny('.basic-info-card:nth-child(4) .info-row:nth-child(6) .info-value', toCoreFlag(v('core_flag')) || '-');
      // DR/이중화: ox-badge가 있으면 배지 갱신, 아니면 info-value 텍스트로 표시
      function setOX(rowSel, name){
        var val = v(name);
        var ox = document.querySelector(rowSel+' .ox-badge');
        if(ox){
          var vv = toOX(val);
          ox.classList.remove('on','off','is-empty');
          if(vv === 'O'){
            ox.textContent='O';
            ox.classList.add('on');
            try{ ox.setAttribute('aria-label','예'); }catch(_e0){}
            return;
          }
          if(vv === 'X'){
            ox.textContent='X';
            ox.classList.add('off');
            try{ ox.setAttribute('aria-label','아니오'); }catch(_e1){}
            return;
          }
          // Match WIPS: empty -> '-'
          ox.textContent='-';
          ox.classList.add('off','is-empty');
          try{ ox.setAttribute('aria-label','정보 없음'); }catch(_e2){}
          return;
        }
        var txt = document.querySelector(rowSel+' .info-value');
        if(txt) txt.innerHTML = renderOxBadge(val);
      }
      setOX('.basic-info-card:nth-child(4) .info-row:nth-child(7)', 'dr_built');
      setOX('.basic-info-card:nth-child(4) .info-row:nth-child(8)', 'svc_redundancy');
      // Persist key hardware fields for cross-tab usage (hardware tab system row)
      try{
        var vendorVal = v('vendor');
        var modelVal  = v('model');
        var serialVal = v('serial');
        var slotVal   = v('slot');
        var uSizeVal  = v('u_size');
        // Use ETC-specific keys to avoid cross-page contamination
        localStorage.setItem(ETC_STORAGE_PREFIX+':current:vendor', String(vendorVal||''));
        localStorage.setItem(ETC_STORAGE_PREFIX+':current:model',  String(modelVal||''));
        localStorage.setItem(ETC_STORAGE_PREFIX+':current:serial', String(serialVal||''));
        localStorage.setItem(ETC_STORAGE_PREFIX+':current:slot',   String(slotVal||''));
        localStorage.setItem(ETC_STORAGE_PREFIX+':current:u_size', String(uSizeVal||''));
        localStorage.setItem(ETC_STORAGE_PREFIX + ':current:rack_face', String(pick(item, ['rack_face']) || ''));
      }catch(_){ }

      // Keep "selected row" storage in sync so reopening the modal doesn't lose codes/names.
      try{
        var storagePrefix = (typeof STORAGE_PREFIX !== 'undefined' && STORAGE_PREFIX) ? STORAGE_PREFIX : 'security-etc';
        var key = storagePrefix+':selected:row';
        var rawRow = sessionStorage.getItem(key);
        var store = sessionStorage;
        if(!rawRow){ rawRow = localStorage.getItem(key); store = localStorage; }
        if(rawRow){
          var row = JSON.parse(rawRow) || {};

          function clean(v0){
            try{ return _cleanFormValue(v0); }catch(_e){
              var s = String(v0 == null ? '' : v0).trim();
              if(!s || s === '-' || s === '선택') return '';
              return s;
            }
          }
          function commitIfNonEmpty(k, val, fieldName){
            var s = clean(val);
            var userCleared = false;
            if(fieldName){
              try{
                var el = form.querySelector('[name="'+fieldName+'"]');
                userCleared = !!(el && el.dataset && String(el.dataset.userCleared||'') === '1');
              }catch(_e0){ userCleared = false; }
            }
            if(userCleared){
              row[k] = '';
              return;
            }
            if(s !== '') row[k] = s;
          }
          function commitSelectCodeAndName(base){
            // base: work_status/work_type/work_category/work_operation/work_group
            var code = clean(v(base));
            var label = '';
            try{ label = clean(selectedText(base)); }catch(_e1){ label = ''; }
            var userCleared = false;
            try{
              var el = form.querySelector('[name="'+base+'"]');
              userCleared = !!(el && el.dataset && String(el.dataset.userCleared||'') === '1');
            }catch(_e2){}

            // Explicit clear: persist empty code/name so save payload can send nulls if needed.
            // (But only if page scripts rely on this flag; otherwise we simply avoid wiping.)
            if(userCleared){
              row[base + '_code'] = '';
              row[base + '_name'] = '';
              row[base] = '';
              return;
            }

            if(code !== '') row[base + '_code'] = code;
            if(label !== ''){
              row[base + '_name'] = label;
              row[base] = label;
            }
          }

          // Work fields: store both code and name
          commitSelectCodeAndName('work_status');
          // Use computed labels if available (may be faster than selectedText before async fill)
          if(clean(wtLabel) !== ''){ row.work_type_name = clean(wtLabel); row.work_type = row.work_type_name; }
          if(clean(wcLabel) !== ''){ row.work_category_name = clean(wcLabel); row.work_category = row.work_category_name; }
          if(clean(woLabel) !== ''){ row.work_operation_name = clean(woLabel); row.work_operation = row.work_operation_name; }
          if(clean(wgLabel) !== ''){ row.work_group_name = clean(wgLabel); row.work_group = row.work_group_name; }
          commitSelectCodeAndName('work_type');
          commitSelectCodeAndName('work_category');
          commitSelectCodeAndName('work_operation');
          commitSelectCodeAndName('work_group');

          // Model/location/dept/owner: store both codes and labels
          commitIfNonEmpty('server_code', v('model'), 'model');
          commitIfNonEmpty('model', selectedText('model') || v('model'), 'model');

          commitIfNonEmpty('center_code', v('location_place'), 'location_place');
          commitIfNonEmpty('location_place', selectedText('location_place') || v('location_place'), 'location_place');

          commitIfNonEmpty('rack_code', v('location_pos'), 'location_pos');
          commitIfNonEmpty('location_pos', selectedText('location_pos') || v('location_pos'), 'location_pos');

          commitIfNonEmpty('system_dept_code', v('sys_dept'), 'sys_dept');
          commitIfNonEmpty('sys_dept', selectedText('sys_dept') || v('sys_dept'), 'sys_dept');

          commitIfNonEmpty('service_dept_code', v('svc_dept'), 'svc_dept');
          commitIfNonEmpty('svc_dept', selectedText('svc_dept') || v('svc_dept'), 'svc_dept');

          commitIfNonEmpty('system_owner_emp_no', v('sys_owner'), 'sys_owner');
          commitIfNonEmpty('sys_owner', selectedText('sys_owner') || v('sys_owner'), 'sys_owner');

          commitIfNonEmpty('service_owner_emp_no', v('svc_owner'), 'svc_owner');
          commitIfNonEmpty('svc_owner', selectedText('svc_owner') || v('svc_owner'), 'svc_owner');

          // Other basic fields
          ['work_name','system_name','system_ip','manage_ip','vendor','serial','virtualization','slot','u_size','confidentiality','integrity','availability','security_score','system_grade','core_flag','dr_built','svc_redundancy']
            .forEach(function(k){
              var val = v(k);
              // Avoid wiping stored values when form is still on placeholders.
              // Explicit clear is handled via searchable-select clear button dataset.
              commitIfNonEmpty(k, val, k);
            });

          store.setItem(key, JSON.stringify(row));
        }
      }catch(_e2){}
    }
    // Wire the Basic Info edit modal open/close/save
    (function(){
      function openModalLocal(id){ var el=document.getElementById(id); if(!el) return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden','false'); }
      function closeModalLocal(id){ var el=document.getElementById(id); if(!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } }
      var openBtn = document.getElementById(EDIT_OPEN_ID);
      if(openBtn){
        openBtn.addEventListener('click', function(){
          // Always align modal with the canonical detail payload (WIPS-style).
          ensureCanonicalSelectedRow().then(function(){
            renderFromSelectedRow();
            // masters may improve code->name in the display row
            ensureMasters().then(function(){ renderFromSelectedRow(); }).catch(function(){});
            buildEditFormFromPage();
            openModalLocal(EDIT_MODAL_ID);
          });
        });
      }
      var closeBtn = document.getElementById(EDIT_CLOSE_ID);
      if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalLocal(EDIT_MODAL_ID); }); }
      var modalEl = document.getElementById(EDIT_MODAL_ID);
      if(modalEl){ modalEl.addEventListener('click', function(e){ if(e.target === modalEl) closeModalLocal(EDIT_MODAL_ID); }); document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(EDIT_MODAL_ID); }); }
      var saveBtn = document.getElementById(EDIT_SAVE_ID);
      if(saveBtn){
        saveBtn.addEventListener('click', function(){
          var form = document.getElementById(EDIT_FORM_ID);
          if(!form) return;
          if(!validateEtcRequiredFromForm(form)) return;
          var assetId = resolveAssetId();
          if(assetId == null){
            try{ alert('자산 ID를 찾을 수 없어 저장할 수 없습니다. 목록에서 다시 진입해 주세요.'); }catch(_e0){}
            return;
          }

          var payload = buildEtcPayloadFromForm(form);
          var prevDisabled = !!saveBtn.disabled;
          saveBtn.disabled = true;
          var prevText = saveBtn.textContent;
          try{ saveBtn.textContent = '저장 중...'; }catch(_e1){}

          putEtcAssetDetail(assetId, payload)
            .then(function(item){
              // Prefer the PUT response for refresh (faster and avoids cache/race issues).
              try{
                if(item){
                  var normalized = normalizeSelectedRowFromApiItem(item);
                  var existing = getSelectedRow();
                  var merged = mergeSelectedRowsCanonical(existing, normalized);
                  setSelectedRow(merged);
                }
              }catch(_ePutItem){ }

              // Always reflect the user's edits immediately in the Basic Info UI and storage.
              try{ updatePageFromForm(); }catch(_eUpd){ }

              // If PUT response didn't include an item, fall back to canonical GET.
              if(!item){
                return ensureCanonicalSelectedRow();
              }
              return getSelectedRow();
            })
            .then(function(){
              renderFromSelectedRow();
              return ensureMasters().then(function(){ renderFromSelectedRow(); }).catch(function(){});
            })
            .then(function(){
              closeModalLocal(EDIT_MODAL_ID);
            })
            .catch(function(err){
              try{ alert((err && err.message) ? err.message : '저장 중 오류가 발생했습니다.'); }catch(_e2){}
            })
            .finally(function(){
              saveBtn.disabled = prevDisabled;
              try{ saveBtn.textContent = prevText; }catch(_e3){}
            });
        });
      }
    })();

      /*
       * Legacy inline tab implementations were moved to /static/js/_detail/tab*.js.
       * The remaining inline implementation below is disabled to prevent JS parse errors.
       *

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

});

  // No modal APIs to expose
})();

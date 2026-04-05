// ids_detail.js: IDS "기본정보" hydration + tab asset_id linkage

(function(){
  'use strict';

  var STORAGE_PREFIX = 'ids';
  var API_BASE = '/api/hardware/security/ids/assets';
  var DEFAULT_TITLE = 'IDS';

  function safeInt(v){
    var n = parseInt(String(v == null ? '' : v), 10);
    return (!isNaN(n) && n > 0) ? n : null;
  }

  function storageGet(key){
    try{ return sessionStorage.getItem(key); }catch(_e0){}
    try{ return localStorage.getItem(key); }catch(_e1){}
    return null;
  }

  function storageSet(key, val){
    try{ sessionStorage.setItem(key, String(val)); }catch(_e0){}
    try{ localStorage.setItem(key, String(val)); }catch(_e1){}
  }

  function safeJsonParse(raw){
    try{ return JSON.parse(raw); }catch(_e){ return null; }
  }

  function firstNonEmpty(list){
    for(var i=0;i<(list||[]).length;i++){
      var v = list[i];
      if(v != null && String(v).trim() !== '' && String(v).trim() !== '-') return String(v).trim();
    }
    return '';
  }

  function getAssetId(){
    try{
      var qs = new URLSearchParams(location.search || '');
      var cand = qs.get('asset_id') || qs.get('assetId') || qs.get('id');
      var n = parseInt(cand, 10);
      if(!isNaN(n) && n > 0) return n;
    }catch(_){ }
    try{
      var raw = storageGet(STORAGE_PREFIX + ':selected:asset_id');
      var nn = parseInt(raw, 10);
      if(!isNaN(nn) && nn > 0) return nn;
    }catch(_e){ }
    try{
      var rowRaw = storageGet(STORAGE_PREFIX + ':selected:row');
      var row = safeJsonParse(rowRaw || '');
      var rid = row && (row.id != null ? row.id : (row.asset_id != null ? row.asset_id : row.hardware_id));
      var rn = parseInt(rid, 10);
      if(!isNaN(rn) && rn > 0) return rn;
    }catch(_e2){ }
    return null;
  }

  function persistSelection(assetId, item){
    if(!assetId) return;
    storageSet(STORAGE_PREFIX + ':selected:asset_id', assetId);
    try{ storageSet(STORAGE_PREFIX + ':selected:row', JSON.stringify(item || {})); }catch(_){ }
    try{
      var work = firstNonEmpty([item && item.work_name, item && item.work]);
      var system = firstNonEmpty([item && item.system_name, item && item.system]);
      if(work) storageSet(STORAGE_PREFIX + ':selected:work', work);
      if(system) storageSet(STORAGE_PREFIX + ':selected:system', system);
    }catch(_e3){ }
  }

  function decorateTabLinks(assetId){
    if(!assetId) return;
    var links = document.querySelectorAll('.server-detail-tabs a.server-detail-tab-btn');
    Array.prototype.forEach.call(links, function(a){
      try{
        var u = new URL(a.getAttribute('href'), window.location.origin);
        if(!u.searchParams.get('asset_id')) u.searchParams.set('asset_id', String(assetId));
        a.setAttribute('href', u.pathname + (u.search || '') + (u.hash || ''));
      }catch(_){ }
    });
  }

  function ensureAssetIdInUrl(assetId){
    if(!assetId) return;
    try{
      var u = new URL(window.location.href);
      // Keep a stable canonical query param so reload/back doesn't fall back to list.
      if(!u.searchParams.get('asset_id')){
        u.searchParams.set('asset_id', String(assetId));
        window.history.replaceState(null, document.title, u.pathname + (u.search || '') + (u.hash || ''));
      }
    }catch(_){ }
  }

  async function fetchJSON(url){
    if(window.BlossomHardwareDetail && typeof window.BlossomHardwareDetail.fetchJSON === 'function'){
      return window.BlossomHardwareDetail.fetchJSON(url, { method:'GET' });
    }
    var r = await fetch(url, { method:'GET', headers:{'Accept':'application/json'}, credentials:'same-origin' });
    var data = null;
    try{ data = await r.json(); }catch(_e){ data = null; }
    if(!r.ok){
      var msg = (data && (data.message || data.error)) ? (data.message || data.error) : ('HTTP ' + r.status);
      throw new Error(msg);
    }
    return data;
  }

  async function fetchAsset(assetId){
    return fetchJSON(API_BASE + '/' + assetId);
  }

  async function fetchFirstAssetFromList(){
    var data = await fetchJSON(API_BASE);
    var items = (data && Array.isArray(data.items)) ? data.items : (Array.isArray(data) ? data : []);
    return items && items.length ? items[0] : null;
  }

  function renderBasicInfo(item){
    if(!item) return;
    try{
      if(window.BlossomHardwareDetail && typeof window.BlossomHardwareDetail.normalizeBusinessKeys === 'function'){
        window.BlossomHardwareDetail.normalizeBusinessKeys(item);
      }
    }catch(_){ }

    function toBool(v){
      if(v == null) return null;
      if(typeof v === 'boolean') return v;
      var s = String(v).trim().toLowerCase();
      if(!s || s === '-') return null;
      if(s === '1' || s === 'y' || s === 'yes' || s === 'true' || s === 't' || s === 'o') return true;
      if(s === '0' || s === 'n' || s === 'no' || s === 'false' || s === 'f' || s === 'x') return false;
      return null;
    }

    function setText(sel, val){
      var el = document.querySelector(sel);
      if(!el) return;
      var s = (val == null ? '' : String(val)).trim();
      el.textContent = s ? s : '-';
    }
    function setBadge(sel, val){
      var el = document.querySelector(sel);
      if(!el) return;
      var s = (val == null ? '' : String(val)).trim();
      el.textContent = s ? s : '-';
    }
    function setHtml(sel, html){
      var el = document.querySelector(sel);
      if(!el) return;
      el.innerHTML = html;
    }
    function esc(s){
      return String(s==null?'':s)
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;')
        .replace(/'/g,'&#39;');
    }
    function renderNum(col, raw){
      var s = (raw == null ? '' : String(raw)).trim();
      if(!s || s === '-') return '<span class="num-badge">-</span>';
      var n = parseInt(s, 10);
      var tone = 'tone-1';
      if(!isNaN(n)){
        if(col === 'security_score') tone = (n>=8)?'tone-3':(n>=6?'tone-2':'tone-1');
        else tone = (n>=3)?'tone-3':(n===2?'tone-2':'tone-1');
      }
      var show = isNaN(n) ? esc(s) : String(n);
      return '<span class="num-badge '+tone+'">'+show+'</span>';
    }
    function renderOx(raw){
      var s = (raw == null ? '' : String(raw)).trim();
      if(!s || s === '-') return '<span class="ox-badge">-</span>';
      var ox = s.toUpperCase();
      if(ox !== 'O' && ox !== 'X') return esc(s);
      return '<span class="ox-badge '+(ox==='O'?'on':'off')+'">'+ox+'</span>';
    }

    var workStatus = firstNonEmpty([item.work_status_name, item.work_status, item.work_status_code]);
    var workType = firstNonEmpty([item.work_type_name, item.work_type, item.work_type_code]);
    var workCategory = firstNonEmpty([item.work_category_name, item.work_category, item.work_category_code]);
    var workOperation = firstNonEmpty([item.work_operation_name, item.work_operation, item.work_operation_code]);
    var workGroup = firstNonEmpty([item.work_group_name, item.work_group, item.work_group_code]);

    setText('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill .status-text', workStatus);
    try{
      var pill = document.querySelector('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill');
      if(pill){
        var dot = pill.querySelector('.status-dot');
        var ws = (workStatus || '').trim();
        var cls = (ws==='가동'?'ws-run': (ws==='유휴'?'ws-idle':'ws-wait'));
        if(dot){ dot.classList.remove('ws-run','ws-idle','ws-wait'); dot.classList.add(cls); }
      }
    }catch(_e4){ }
    setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(2) .info-value', workType);
    setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(3) .info-value', workCategory);
    setText('.basic-info-card:nth-child(1) .info-row:nth-child(4) .info-value', workOperation);
    setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(5) .info-value', workGroup);
    setText('.basic-info-card:nth-child(1) .info-row:nth-child(6) .info-value', firstNonEmpty([item.work_name]));
    setText('.basic-info-card:nth-child(1) .info-row:nth-child(7) .info-value', firstNonEmpty([item.system_name, item.system]));
    setText('.basic-info-card:nth-child(1) .info-row:nth-child(8) .info-value', firstNonEmpty([item.system_ip]));
    setText('.basic-info-card:nth-child(1) .info-row:nth-child(9) .info-value', firstNonEmpty([item.manage_ip, item.mgmt_ip]));

    setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(1) .info-value', firstNonEmpty([item.vendor_name, item.vendor, item.manufacturer_name]));
    setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(2) .info-value', firstNonEmpty([item.model_name, item.model, item.server_model_name]));
    setText('.basic-info-card:nth-child(2) .info-row:nth-child(3) .info-value', firstNonEmpty([item.serial]));
    setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(4) .info-value', firstNonEmpty([item.virtualization, item.virtualization_type]));
    setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(5) .info-value', firstNonEmpty([item.location_place_name, item.location_place, item.center_name]));
    setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(6) .info-value', firstNonEmpty([item.location_pos_name, item.location_pos, item.rack_name]));
    setText('.basic-info-card:nth-child(2) .info-row:nth-child(7) .info-value', firstNonEmpty([item.slot]));
    setText('.basic-info-card:nth-child(2) .info-row:nth-child(8) .info-value', firstNonEmpty([item.u_size]));
    setText('.basic-info-card:nth-child(2) .info-row:nth-child(9) .info-value', (item.rack_face === 'REAR') ? '후면' : '전면');

    setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(1) .info-value', firstNonEmpty([item.sys_dept_name, item.sys_dept, item.system_dept_name]));
    setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(2) .info-value', firstNonEmpty([item.sys_owner_name, item.sys_owner, item.system_owner_name, item.system_owner_display]));
    setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(3) .info-value', firstNonEmpty([item.svc_dept_name, item.svc_dept, item.service_dept_name]));
    setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(4) .info-value', firstNonEmpty([item.svc_owner_name, item.svc_owner, item.service_owner_name, item.service_owner_display]));

    setHtml('.basic-info-card:nth-child(4) .info-row:nth-child(1) .cell-num', renderNum('confidentiality', (item.confidentiality != null ? item.confidentiality : item.cia_confidentiality)));
    setHtml('.basic-info-card:nth-child(4) .info-row:nth-child(2) .cell-num', renderNum('integrity', (item.integrity != null ? item.integrity : item.cia_integrity)));
    setHtml('.basic-info-card:nth-child(4) .info-row:nth-child(3) .cell-num', renderNum('availability', (item.availability != null ? item.availability : item.cia_availability)));
    setHtml('.basic-info-card:nth-child(4) .info-row:nth-child(4) .cell-num', renderNum('security_score', item.security_score));
    setBadge('.basic-info-card:nth-child(4) .info-row:nth-child(5) .info-value', firstNonEmpty([item.system_grade]));
    (function(){
      var core = firstNonEmpty([item.core_flag]);
      if(!core){
        var b = toBool(item.is_core_system);
        core = (b === null) ? '' : (b ? '핵심' : '일반');
      }
      setBadge('.basic-info-card:nth-child(4) .info-row:nth-child(6) .info-value', core);
    })();
    (function(){
      var dr = (item.dr_built != null) ? item.dr_built : item.has_dr_site;
      var ha = (item.svc_redundancy != null) ? item.svc_redundancy : item.has_service_ha;
      var drB = toBool(dr);
      var haB = toBool(ha);
      setHtml('.basic-info-card:nth-child(4) .info-row:nth-child(7) .cell-ox.with-badge', renderOx(drB === null ? dr : (drB ? 'O' : 'X')));
      setHtml('.basic-info-card:nth-child(4) .info-row:nth-child(8) .cell-ox.with-badge', renderOx(haB === null ? ha : (haB ? 'O' : 'X')));
    })();

    try{
      var titleEl = document.getElementById('page-title');
      var subEl = document.getElementById('page-subtitle');
      if(titleEl) titleEl.textContent = firstNonEmpty([item.work_name, DEFAULT_TITLE]) || DEFAULT_TITLE;
      if(subEl) subEl.textContent = firstNonEmpty([item.system_name, item.system, '-']) || '-';
    }catch(_e5){ }

    try{
      localStorage.setItem('ids:current:vendor', String(firstNonEmpty([item.vendor_name, item.vendor, item.manufacturer_name])||''));
      localStorage.setItem('ids:current:model',  String(firstNonEmpty([item.model_name, item.model, item.server_model_name])||''));
      localStorage.setItem('ids:current:serial', String(firstNonEmpty([item.serial])||''));
      localStorage.setItem('ids:current:slot',   String(firstNonEmpty([item.slot])||''));
      localStorage.setItem('ids:current:u_size', String(firstNonEmpty([item.u_size])||''));
      localStorage.setItem('ids:current:rack_face', String((item.rack_face) || ''));
    }catch(_e6){ }
  }

  async function main(){
    var assetId = getAssetId();
    ensureAssetIdInUrl(assetId);
    decorateTabLinks(assetId);

    // If user opened detail directly (no selection in storage), auto-resolve from list.
    if(!assetId){
      try{
        var first = await fetchFirstAssetFromList();
        if(first){
          assetId = safeInt(first.id != null ? first.id : first.asset_id);
          if(assetId){
            persistSelection(assetId, first);
            ensureAssetIdInUrl(assetId);
            decorateTabLinks(assetId);
          }
        }
      }catch(errList){
        try{ console.warn('[IDS_DETAIL] list fallback failed:', errList); }catch(_eList){ }
      }
    }

    if(!assetId) return;
    try{
      var data = await fetchAsset(assetId);
      var item = data && data.item ? data.item : data;
      if(item){
        persistSelection(assetId, item);
        renderBasicInfo(item);
      }
    }catch(err){
      try{ console.warn('[IDS_DETAIL] fetch failed:', err); }catch(_e7){}
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', main);
  else main();
})();

// ---- IDS Basic-info edit modal shared constants/meta ----
// (This file historically mixes multiple IIFEs. Keep these as top-level vars
// so all sections can reference them.)
var EDIT_MODAL_ID = 'system-edit-modal';
var EDIT_FORM_ID = 'system-edit-form';
var EDIT_OPEN_ID = 'detail-edit-open';
var EDIT_CLOSE_ID = 'system-edit-close';
var EDIT_SAVE_ID = 'system-edit-save';

function cleanPlaceholderValue(v){
  var s = String(v == null ? '' : v).trim();
  if(!s) return '';
  if(s === '-') return '';
  if(s === '선택') return '';
  if(s === '부서를 먼저 선택' || s === '제조사를 먼저 선택' || s === '장소를 먼저 선택') return '';
  if(/선택$/.test(s)) return '';
  return s;
}

var COLUMN_META = {
  work_type: { label: '업무 분류' },
  work_category: { label: '업무 구분' },
  work_status: { label: '업무 상태' },
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

    // --- Basic-info modal CRUD helpers ---
    var BASIC_INFO_API_BASE = '/api/hardware/security/ids/assets';
    var BASIC_INFO_FK_SOURCES = {
      WORK_TYPE: { endpoint: '/api/work-categories', valueKey: 'category_code', labelKey: 'wc_name' },
      WORK_CATEGORY: { endpoint: '/api/work-divisions', valueKey: 'division_code', labelKey: 'wc_name' },
      WORK_STATUS: { endpoint: '/api/work-statuses', valueKey: 'status_code', labelKey: 'wc_name' },
      WORK_OPERATION: { endpoint: '/api/work-operations', valueKey: 'operation_code', labelKey: 'wc_name' },
      WORK_GROUP: { endpoint: '/api/work-groups', valueKey: 'group_code', labelKey: 'wc_name' },
      VENDOR: { endpoint: '/api/vendor-manufacturers', valueKey: 'manufacturer_code', labelKey: 'manufacturer_name' },
      MODEL: { endpoint: '/api/hw-security-types', valueKey: 'security_code', labelKey: 'model_name' },
      ORG_CENTER: { endpoint: '/api/org-centers', valueKey: 'center_code', labelKey: 'center_name' },
      ORG_RACK: { endpoint: '/api/org-racks', valueKey: 'rack_code', labelKey: 'rack_name' },
      ORG_DEPT: { endpoint: '/api/org-departments', valueKey: 'dept_code', labelKey: 'dept_name' },
      USER_PROFILE: { endpoint: '/api/user-profiles', valueKey: 'emp_no', labelKey: 'name' }
    };
    var basicInfoFkCache = new Map();

    function getAssetIdForBasicInfo(){
      try{
        var qs = new URLSearchParams(location.search || '');
        var cand = qs.get('asset_id') || qs.get('assetId') || qs.get('id');
        var n = parseInt(cand, 10);
        if(!isNaN(n) && n > 0) return n;
      }catch(_){ }
      try{
        var raw = sessionStorage.getItem('ids:selected:asset_id') || localStorage.getItem('ids:selected:asset_id');
        var nn = parseInt(raw, 10);
        if(!isNaN(nn) && nn > 0) return nn;
      }catch(_){ }
      return null;
    }

    async function fetchJSON(url, opts){
      var r = await fetch(url, opts || { method:'GET', headers:{'Accept':'application/json'} });
      var data = null;
      try{ data = await r.json(); }catch(_){ data = null; }
      if(!r.ok){
        var msg = (data && data.message) ? data.message : ('요청에 실패했습니다.');
        throw new Error(msg);
      }
      return data;
    }

    async function loadBasicInfoFk(sourceKey){
      if(basicInfoFkCache.has(sourceKey)) return basicInfoFkCache.get(sourceKey);
      var cfg = BASIC_INFO_FK_SOURCES[sourceKey];
      if(!cfg){ basicInfoFkCache.set(sourceKey, []); return []; }
      try{
        var data = await fetchJSON(cfg.endpoint, { method:'GET', headers:{'Accept':'application/json'} });
        var items = Array.isArray(data && data.items) ? data.items : (Array.isArray(data) ? data : []);
        basicInfoFkCache.set(sourceKey, items);
        return items;
      }catch(err){
        console.warn('[IDS_DETAIL] FK source load failed:', sourceKey, err);
        basicInfoFkCache.set(sourceKey, []);
        return [];
      }
    }

    function ensureOption(select, value, label){
      if(!select) return;
      var v = String(value == null ? '' : value);
      if(!v) return;
      var exists = Array.from(select.options || []).some(function(o){ return String(o.value) === v; });
      if(exists) return;
      var opt = document.createElement('option');
      opt.value = v;
      opt.textContent = (label != null && String(label).trim()) ? String(label) : v;
      select.appendChild(opt);
    }

    function fillSelectOptions(select, items, valueKey, labelKey, optionFormatter){
      if(!select) return;
      var current = select.value;
      // keep placeholder option
      var keep = select.querySelector('option[value=""]');
      select.innerHTML = '';
      var ph = document.createElement('option');
      ph.value = '';
      ph.textContent = '-';
      select.appendChild(ph);
      (items || []).forEach(function(item){
        var v = item && item[valueKey];
        if(v == null) return;
        var label = item && item[labelKey];
        var text = optionFormatter ? optionFormatter(item, v) : (label != null ? String(label) : String(v));
        var opt = document.createElement('option');
        opt.value = String(v);
        opt.textContent = String(text || v);
        select.appendChild(opt);
      });
      if(current){
        ensureOption(select, current, current);
        select.value = current;
      }
    }

    function syncSearchable(select){
      try{ if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){ window.BlossomSearchableSelect.syncAll(select); } }catch(_){ }
      try{ if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function'){ window.BlossomSearchableSelect.enhance(select); } }catch(_){ }
    }

    function setChildDisabled(select, disabled){
      if(!select) return;
      select.disabled = !!disabled;
      syncSearchable(select);
    }

    function wireBasicInfoDependencies(form){
      if(!form) return;
      var vendor = form.querySelector('[name="vendor"]');
      var model = form.querySelector('[name="model"]');
      var place = form.querySelector('[name="location_place"]');
      var pos = form.querySelector('[name="location_pos"]');
      var sysDept = form.querySelector('[name="sys_dept"]');
      var sysOwner = form.querySelector('[name="sys_owner"]');
      var svcDept = form.querySelector('[name="svc_dept"]');
      var svcOwner = form.querySelector('[name="svc_owner"]');

      function apply(){
        var hasVendor = !!(vendor && String(vendor.value||'').trim());
        if(model){
          if(!hasVendor){ model.value = ''; setChildDisabled(model, true); }
          else { setChildDisabled(model, false); }
        }

        var hasPlace = !!(place && String(place.value||'').trim());
        if(pos){
          if(!hasPlace){ pos.value=''; setChildDisabled(pos, true); }
          else { setChildDisabled(pos, false); }
        }

        var hasSysDept = !!(sysDept && String(sysDept.value||'').trim());
        if(sysOwner){
          if(!hasSysDept){ sysOwner.value=''; setChildDisabled(sysOwner, true); }
          else { setChildDisabled(sysOwner, false); }
        }

        var hasSvcDept = !!(svcDept && String(svcDept.value||'').trim());
        if(svcOwner){
          if(!hasSvcDept){ svcOwner.value=''; setChildDisabled(svcOwner, true); }
          else { setChildDisabled(svcOwner, false); }
        }
      }

      ;[vendor, place, sysDept, svcDept].forEach(function(sel){
        if(!sel) return;
        sel.addEventListener('change', apply);
      });
      apply();
    }

    async function hydrateBasicInfoEditForm(form, data){
      if(!form) return;

      // NOTE: IDS detail builds the modal form dynamically.
      // We intentionally run the local FK hydration here so the modal is reliably
      // prefilled from authoritative codes (even when the global FK helper exists).

      // Load FK sources in parallel
      var results = await Promise.all([
        loadBasicInfoFk('WORK_TYPE'),
        loadBasicInfoFk('WORK_CATEGORY'),
        loadBasicInfoFk('WORK_STATUS'),
        loadBasicInfoFk('WORK_OPERATION'),
        loadBasicInfoFk('WORK_GROUP'),
        loadBasicInfoFk('VENDOR'),
        loadBasicInfoFk('MODEL'),
        loadBasicInfoFk('ORG_CENTER'),
        loadBasicInfoFk('ORG_RACK'),
        loadBasicInfoFk('ORG_DEPT'),
        loadBasicInfoFk('USER_PROFILE')
      ]);
      var workTypes = results[0];
      var workCategories = results[1];
      var workStatuses = results[2];
      var workOperations = results[3];
      var workGroups = results[4];
      var vendors = results[5];
      var models = results[6];
      var centers = results[7];
      var racks = results[8];
      var depts = results[9];
      var users = results[10];

      // Set initial values before populating options.
      function setVal(name, v){ var el=form.querySelector('[name="'+name+'"]'); if(el && v!=null){ el.value = String(v); } }
      setVal('work_status', data.work_status_code != null ? data.work_status_code : data.work_status);
      setVal('work_type', data.work_type_code != null ? data.work_type_code : data.work_type);
      setVal('work_category', data.work_category_code != null ? data.work_category_code : data.work_category);
      setVal('work_operation', data.work_operation_code != null ? data.work_operation_code : data.work_operation);
      setVal('work_group', data.work_group_code != null ? data.work_group_code : data.work_group);
      setVal('vendor', data.vendor_code != null ? data.vendor_code : data.vendor);
      setVal('model', data.model_code != null ? data.model_code : data.model);
      setVal('location_place', data.center_code != null ? data.center_code : data.location_place);
      setVal('location_pos', data.rack_code != null ? data.rack_code : data.location_pos);
      setVal('sys_dept', data.sys_dept_code != null ? data.sys_dept_code : data.sys_dept);
      setVal('svc_dept', data.svc_dept_code != null ? data.svc_dept_code : data.svc_dept);
      setVal('sys_owner', data.sys_owner_emp_no != null ? data.sys_owner_emp_no : data.sys_owner);
      setVal('svc_owner', data.svc_owner_emp_no != null ? data.svc_owner_emp_no : data.svc_owner);

      var wtSel = form.querySelector('[name="work_type"]');
      var wcSel = form.querySelector('[name="work_category"]');
      var woSel = form.querySelector('[name="work_operation"]');
      var wgSel = form.querySelector('[name="work_group"]');

      var wsSel = form.querySelector('[name="work_status"]');
      var vSel = form.querySelector('[name="vendor"]');
      var mSel = form.querySelector('[name="model"]');
      var cSel = form.querySelector('[name="location_place"]');
      var rSel = form.querySelector('[name="location_pos"]');
      var sysDeptSel = form.querySelector('[name="sys_dept"]');
      var svcDeptSel = form.querySelector('[name="svc_dept"]');
      var sysOwnerSel = form.querySelector('[name="sys_owner"]');
      var svcOwnerSel = form.querySelector('[name="svc_owner"]');

      fillSelectOptions(wtSel, workTypes, 'category_code', 'wc_name');
      fillSelectOptions(wcSel, workCategories, 'division_code', 'wc_name');
      fillSelectOptions(wsSel, workStatuses, 'status_code', 'wc_name');
      fillSelectOptions(woSel, workOperations, 'operation_code', 'wc_name');
      fillSelectOptions(wgSel, workGroups, 'group_code', 'wc_name');
      fillSelectOptions(vSel, vendors, 'manufacturer_code', 'manufacturer_name');
      fillSelectOptions(mSel, models, 'security_code', 'model_name');
      fillSelectOptions(cSel, centers, 'center_code', 'center_name', function(item, value){
        var name = String((item && item.center_name) || '').trim();
        var location = String((item && item.location) || '').trim();
        var usage = String((item && item.usage) || '').trim();
        var parts = [];
        if(name) parts.push(name);
        if(location) parts.push(location);
        if(usage) parts.push(usage);
        return parts.join(' · ') || (value || '');
      });
      fillSelectOptions(rSel, racks, 'rack_code', 'rack_name');
      fillSelectOptions(sysDeptSel, depts, 'dept_code', 'dept_name');
      fillSelectOptions(svcDeptSel, depts, 'dept_code', 'dept_name');
      fillSelectOptions(sysOwnerSel, users, 'emp_no', 'name');
      fillSelectOptions(svcOwnerSel, users, 'emp_no', 'name');

      function reconcileSelect(select, items, valueKey, labelKey, desiredCode, desiredLabel){
        if(!select) return;
        function hasValue(v){
          var vv = String(v == null ? '' : v).trim();
          if(!vv) return false;
          return Array.from(select.options || []).some(function(o){ return String(o.value) === vv; });
        }

        var code = String(desiredCode == null ? '' : desiredCode).trim();
        if(code && hasValue(code)){
          select.value = code;
          syncSearchable(select);
          return;
        }

        var label = String(desiredLabel == null ? '' : desiredLabel).trim();
        if(label && items && items.length){
          var match = null;
          for(var i=0;i<items.length;i++){
            var it = items[i];
            var t = it && it[labelKey];
            if(t != null && String(t).trim() === label){ match = it; break; }
          }
          if(match && match[valueKey] != null){
            var vv = String(match[valueKey]).trim();
            if(vv && hasValue(vv)){
              select.value = vv;
              syncSearchable(select);
              return;
            }
          }
        }

        if(label){
          var opt = Array.from(select.options || []).find(function(o){ return String(o.textContent||'').trim() === label; });
          if(opt && opt.value != null){
            select.value = String(opt.value);
            syncSearchable(select);
            return;
          }
        }

        // If current value isn't part of options, clear it.
        var cur = String(select.value || '').trim();
        if(cur && !hasValue(cur)){
          select.value = '';
          syncSearchable(select);
        }
      }

      // Ensure selects preselect even when data contains labels (from cards) instead of codes.
      reconcileSelect(wtSel, workTypes, 'category_code', 'wc_name', data.work_type_code, data.work_type);
      reconcileSelect(wcSel, workCategories, 'division_code', 'wc_name', data.work_category_code, data.work_category);
      reconcileSelect(woSel, workOperations, 'operation_code', 'wc_name', data.work_operation_code, data.work_operation);
      reconcileSelect(wgSel, workGroups, 'group_code', 'wc_name', data.work_group_code, data.work_group);
      reconcileSelect(wsSel, workStatuses, 'status_code', 'wc_name', data.work_status_code, data.work_status);
      reconcileSelect(vSel, vendors, 'manufacturer_code', 'manufacturer_name', data.vendor_code, data.vendor);
      reconcileSelect(mSel, models, 'security_code', 'model_name', data.model_code, data.model);
      reconcileSelect(cSel, centers, 'center_code', 'center_name', data.center_code, data.location_place);
      reconcileSelect(rSel, racks, 'rack_code', 'rack_name', data.rack_code, data.location_pos);
      reconcileSelect(sysDeptSel, depts, 'dept_code', 'dept_name', data.sys_dept_code, data.sys_dept);
      reconcileSelect(svcDeptSel, depts, 'dept_code', 'dept_name', data.svc_dept_code, data.svc_dept);
      reconcileSelect(sysOwnerSel, users, 'emp_no', 'name', data.sys_owner_emp_no, data.sys_owner);
      reconcileSelect(svcOwnerSel, users, 'emp_no', 'name', data.svc_owner_emp_no, data.svc_owner);

      // Enhance searchable selects inside modal
      try{ if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function'){ window.BlossomSearchableSelect.enhance(form.closest('.modal-overlay-full') || form); } }catch(_){ }
      wireBasicInfoDependencies(form);
    }

    function markSearchInvalid(select){
      if(!select) return;
      try{
        var wrapper = select.closest && select.closest('.fk-searchable-control');
        if(wrapper) wrapper.classList.toggle('is-invalid', !select.checkValidity());
      }catch(_){ }
    }

    async function saveBasicInfoFromModal(){
      var form = document.getElementById(EDIT_FORM_ID);
      if(!form) return { ok:false, message:'폼을 찾을 수 없습니다.' };

      // Required-field validation (native + CSS-driven)
      form.classList.remove('show-required-errors');
      if(!form.checkValidity()){
        form.classList.add('show-required-errors');
        ;['work_status','work_name','system_name'].forEach(function(n){
          var el = form.querySelector('[name="'+n+'"]');
          if(el) markSearchInvalid(el);
        });
        return { ok:false, message:'필수 값을 입력해 주세요.' };
      }

      var assetId = getAssetIdForBasicInfo();
      if(!assetId) return { ok:false, message:'대상 ID를 찾을 수 없습니다. 목록에서 다시 선택해 주세요.' };

      function fval(name){
        var el = form.querySelector('[name="'+name+'"]');
        if(!el) return '';
        return String(el.value == null ? '' : el.value).trim();
      }

      function flabel(name){
        var el = form.querySelector('[name="'+name+'"]');
        if(!el) return '';
        // For <select>, prefer option label for UI display.
        if(el.tagName === 'SELECT'){
          try{
            var opt = el.selectedOptions && el.selectedOptions[0];
            var txt = opt ? String(opt.textContent || '').trim() : '';
            // Treat placeholder '-' as empty label.
            if(txt === '-' || txt === '') return '';
            return txt;
          }catch(_){ return ''; }
        }
        return String(el.value == null ? '' : el.value).trim();
      }

      // Enforce cascading clears
      if(!fval('vendor')){
        var m = form.querySelector('[name="model"]');
        if(m){ m.value=''; m.disabled = true; syncSearchable(m); }
      }
      if(!fval('location_place')){
        var p = form.querySelector('[name="location_pos"]');
        if(p){ p.value=''; p.disabled = true; syncSearchable(p); }
      }
      if(!fval('sys_dept')){
        var so = form.querySelector('[name="sys_owner"]');
        if(so){ so.value=''; so.disabled = true; syncSearchable(so); }
      }
      if(!fval('svc_dept')){
        var svo = form.querySelector('[name="svc_owner"]');
        if(svo){ svo.value=''; svo.disabled = true; syncSearchable(svo); }
      }

      var payload = {
        work_type: fval('work_type'),
        work_category: fval('work_category'),
        work_status: fval('work_status'),
        work_operation: fval('work_operation'),
        work_group: fval('work_group'),
        work_name: fval('work_name'),
        system_name: fval('system_name'),
        system_ip: fval('system_ip'),
        mgmt_ip: fval('manage_ip'),
        vendor: fval('vendor'),
        model: fval('model'),
        serial_number: fval('serial'),
        virtualization_type: fval('virtualization'),
        center_code: fval('location_place'),
        rack_code: fval('location_pos'),
        system_slot: fval('slot'),
        system_size: fval('u_size'),
        rack_face: fval('rack_face'),
        system_department: fval('sys_dept'),
        system_owner: fval('sys_owner'),
        service_department: fval('svc_dept'),
        service_owner: fval('svc_owner'),
        cia_confidentiality: fval('confidentiality'),
        cia_integrity: fval('integrity'),
        cia_availability: fval('availability'),
        security_score: fval('security_score'),
        system_grade: fval('system_grade'),
        core_flag: fval('core_flag'),
        dr_built: fval('dr_built'),
        svc_redundancy: fval('svc_redundancy')
      };

      // Convert some numeric fields if present, else keep NULL.
      ;['cia_confidentiality','cia_integrity','cia_availability','security_score','system_slot','system_size'].forEach(function(k){
        if(payload[k] == null) return;
        var s = String(payload[k]).trim();
        if(s === '' || s === '-') { payload[k] = null; return; }
        var n = parseInt(s, 10);
        payload[k] = (!isNaN(n)) ? n : null;
      });

      // For optional fields, send NULL (not empty string) so DB stores NULL.
      (function nullifyOptional(){
        var required = { work_status:1, work_name:1, system_name:1 };
        Object.keys(payload).forEach(function(k){
          if(required[k]) return;
          var v = payload[k];
          if(v == null) return;
          if(typeof v === 'string'){
            var s = String(v).trim();
            if(s === '' || s === '-') payload[k] = null;
          }
        });
      })();

      var url = BASIC_INFO_API_BASE + '/' + encodeURIComponent(String(assetId));
      var res = null;
      try{
        res = await fetchJSON(url, { method:'PUT', headers:{'Content-Type':'application/json','Accept':'application/json'}, body: JSON.stringify(payload) });
      }catch(err){
        return { ok:false, message: err && err.message ? err.message : '저장 중 오류가 발생했습니다.' };
      }

      // Persist selected row snapshot for cross-tab usage.
      try{
        var storagePrefix = 'ids';
        var raw = sessionStorage.getItem(storagePrefix+':selected:row') || localStorage.getItem(storagePrefix+':selected:row');
        var row = raw ? JSON.parse(raw) : {};
        // Store display values for the detail cards (labels), and keep codes separately for later saves.
        row.work_type = flabel('work_type') || '';
        row.work_category = flabel('work_category') || '';
        row.work_operation = flabel('work_operation') || '';
        row.work_group = flabel('work_group') || '';
        row.work_type_code = fval('work_type');
        row.work_category_code = fval('work_category');
        row.work_operation_code = fval('work_operation');
        row.work_group_code = fval('work_group');
        row.work_name = fval('work_name');
        row.system_name = fval('system_name');
        row.system_ip = fval('system_ip');
        row.manage_ip = fval('manage_ip');

        row.work_status = flabel('work_status') || fval('work_status');
        row.vendor = flabel('vendor') || '';
        row.model = flabel('model') || '';
        row.location_place = flabel('location_place') || '';
        row.location_pos = flabel('location_pos') || '';
        // Prevent UI placeholder labels from leaking into detail cards after clearing.
        row.sys_dept = cleanPlaceholderValue(flabel('sys_dept')) || '';
        row.sys_owner = cleanPlaceholderValue(flabel('sys_owner')) || '';
        row.svc_dept = cleanPlaceholderValue(flabel('svc_dept')) || '';
        row.svc_owner = cleanPlaceholderValue(flabel('svc_owner')) || '';

        // Keep underlying codes too (used when opening modal from storage).
        row.work_status_code = fval('work_status');
        row.vendor_code = fval('vendor');
        row.model_code = fval('model');
        row.center_code = fval('location_place');
        row.rack_code = fval('location_pos');
        row.sys_dept_code = fval('sys_dept');
        row.sys_owner_emp_no = fval('sys_owner');
        row.svc_dept_code = fval('svc_dept');
        row.svc_owner_emp_no = fval('svc_owner');

        row.serial = fval('serial');
        row.virtualization = fval('virtualization');
        row.slot = fval('slot');
        row.u_size = fval('u_size');
        row.confidentiality = fval('confidentiality');
        row.integrity = fval('integrity');
        row.availability = fval('availability');
        row.security_score = fval('security_score');
        row.system_grade = fval('system_grade');
        row.core_flag = fval('core_flag');
        row.dr_built = fval('dr_built');
        row.svc_redundancy = fval('svc_redundancy');
        row.id = row.id != null ? row.id : assetId;
        try{ sessionStorage.setItem(storagePrefix+':selected:row', JSON.stringify(row)); }catch(_){ }
        try{ localStorage.setItem(storagePrefix+':selected:row', JSON.stringify(row)); }catch(_){ }
        try{ sessionStorage.setItem(storagePrefix+':selected:asset_id', String(assetId)); }catch(_){ }
        try{ localStorage.setItem(storagePrefix+':selected:asset_id', String(assetId)); }catch(_){ }
      }catch(_){ }

      return { ok:true, data:res };
    }

    async function buildEditFormFromPage(){
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
        var storagePrefix = (typeof STORAGE_PREFIX !== 'undefined' && STORAGE_PREFIX) ? STORAGE_PREFIX : 'ids';
        var raw = sessionStorage.getItem(storagePrefix+':selected:row') || localStorage.getItem(storagePrefix+':selected:row');
        if(raw){
          var selectedRow = JSON.parse(raw);
          var keys = [
            'work_type','work_type_code','work_category','work_category_code','work_operation','work_operation_code','work_group','work_group_code',
            'work_status','work_status_code',
            'work_name','system_name','system_ip','manage_ip',
            'vendor','vendor_code','model','model_code',
            'serial','virtualization',
            'location_place','center_code','location_pos','rack_code',
            'slot','u_size',
            'sys_dept','sys_dept_code','sys_owner','sys_owner_emp_no',
            'svc_dept','svc_dept_code','svc_owner','svc_owner_emp_no',
            'confidentiality','integrity','availability','security_score','system_grade','core_flag','dr_built','svc_redundancy'
          ];
          selectedRowData = {};
          keys.forEach(function(k){
            if(selectedRow && selectedRow[k] != null){
              var v = String(selectedRow[k]).trim();
              v = cleanPlaceholderValue(v);
              if(v !== '') selectedRowData[k] = v;
            }
          });

          // Map list-row code field names into modal expectations.
          try{
            if(!selectedRowData.vendor_code && selectedRow && selectedRow.manufacturer_code != null){
              var mc = cleanPlaceholderValue(selectedRow.manufacturer_code);
              if(mc) selectedRowData.vendor_code = String(mc);
            }
            if(!selectedRowData.model_code && selectedRow && selectedRow.server_code != null){
              var sc = cleanPlaceholderValue(selectedRow.server_code);
              if(sc) selectedRowData.model_code = String(sc);
            }
          }catch(_m){ }

          if(!selectedRowData.work_status){
            var ws = (selectedRow.work_status || selectedRow.work_status_name || selectedRow.work_status_code);
            if(ws != null){
              ws = cleanPlaceholderValue(String(ws).trim());
              if(ws !== '') selectedRowData.work_status = ws;
            }
          }
        }
      }catch(_e){ selectedRowData = null; }
    var data = selectedRowData || {
        work_type: cleanPlaceholderValue(badgeVal('.basic-info-card:nth-child(1) .info-row:nth-child(2) .info-value')),
        work_category: cleanPlaceholderValue(badgeVal('.basic-info-card:nth-child(1) .info-row:nth-child(3) .info-value')),
  work_status: cleanPlaceholderValue(text('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill .status-text')),
        work_operation: cleanPlaceholderValue(text('.basic-info-card:nth-child(1) .info-row:nth-child(4) .info-value')),
        work_group: cleanPlaceholderValue(badgeVal('.basic-info-card:nth-child(1) .info-row:nth-child(5) .info-value')),
        work_name: cleanPlaceholderValue(text('.basic-info-card:nth-child(1) .info-row:nth-child(6) .info-value')),
        system_name: cleanPlaceholderValue(text('.basic-info-card:nth-child(1) .info-row:nth-child(7) .info-value')),
        system_ip: cleanPlaceholderValue(text('.basic-info-card:nth-child(1) .info-row:nth-child(8) .info-value')),
        manage_ip: cleanPlaceholderValue(text('.basic-info-card:nth-child(1) .info-row:nth-child(9) .info-value')),
        vendor: cleanPlaceholderValue(badgeVal('.basic-info-card:nth-child(2) .info-row:nth-child(1) .info-value')),
        model: cleanPlaceholderValue(badgeVal('.basic-info-card:nth-child(2) .info-row:nth-child(2) .info-value')),
        serial: cleanPlaceholderValue(text('.basic-info-card:nth-child(2) .info-row:nth-child(3) .info-value')),
        virtualization: cleanPlaceholderValue(badgeVal('.basic-info-card:nth-child(2) .info-row:nth-child(4) .info-value')),
        location_place: cleanPlaceholderValue(badgeVal('.basic-info-card:nth-child(2) .info-row:nth-child(5) .info-value')),
        location_pos: cleanPlaceholderValue(badgeVal('.basic-info-card:nth-child(2) .info-row:nth-child(6) .info-value')),
        slot: cleanPlaceholderValue(text('.basic-info-card:nth-child(2) .info-row:nth-child(7) .info-value')),
        u_size: cleanPlaceholderValue(text('.basic-info-card:nth-child(2) .info-row:nth-child(8) .info-value')),
        sys_dept: cleanPlaceholderValue(badgeVal('.basic-info-card:nth-child(3) .info-row:nth-child(1) .info-value')),
        sys_owner: cleanPlaceholderValue(badgeVal('.basic-info-card:nth-child(3) .info-row:nth-child(2) .info-value')),
        svc_dept: cleanPlaceholderValue(badgeVal('.basic-info-card:nth-child(3) .info-row:nth-child(3) .info-value')),
        svc_owner: cleanPlaceholderValue(badgeVal('.basic-info-card:nth-child(3) .info-row:nth-child(4) .info-value')),
      confidentiality: cleanPlaceholderValue(text('.basic-info-card:nth-child(4) .info-row:nth-child(1) .cell-num')),
      integrity: cleanPlaceholderValue(text('.basic-info-card:nth-child(4) .info-row:nth-child(2) .cell-num')),
      availability: cleanPlaceholderValue(text('.basic-info-card:nth-child(4) .info-row:nth-child(3) .cell-num')),
      security_score: cleanPlaceholderValue(text('.basic-info-card:nth-child(4) .info-row:nth-child(4) .cell-num')),
        system_grade: cleanPlaceholderValue(badgeVal('.basic-info-card:nth-child(4) .info-row:nth-child(5) .info-value')),
        core_flag: cleanPlaceholderValue(badgeVal('.basic-info-card:nth-child(4) .info-row:nth-child(6) .info-value')),
      dr_built: cleanPlaceholderValue(text('.basic-info-card:nth-child(4) .info-row:nth-child(7) .cell-ox.with-badge')),
      svc_redundancy: cleanPlaceholderValue(text('.basic-info-card:nth-child(4) .info-row:nth-child(8) .cell-ox.with-badge'))
      };

      // Authoritative prefill: fetch the latest detail record to obtain FK codes.
      // Without this, the detail cards can show labels but the modal selects cannot
      // preselect the right option (they require *_code fields).
      try{
        var aid = null;
        try{ aid = getAssetIdForBasicInfo(); }catch(_aid){ aid = null; }
        if(aid){
          var detailUrl = BASIC_INFO_API_BASE + '/' + encodeURIComponent(String(aid));
          var detailRes = await fetchJSON(detailUrl, { method:'GET', headers:{'Accept':'application/json'} });
          var item = (detailRes && detailRes.item) ? detailRes.item : null;
          if(item && typeof item === 'object'){
            try{
              if(window.BlossomHardwareDetail && typeof window.BlossomHardwareDetail.normalizeBusinessKeys === 'function'){
                window.BlossomHardwareDetail.normalizeBusinessKeys(item);
              }
            }catch(_norm){ }
            function put(key, value){
              if(value == null) return;
              if(typeof value === 'string'){
                var s = cleanPlaceholderValue(value);
                if(s === '') return;
                data[key] = s;
                return;
              }
              data[key] = value;
            }

            // Business (codes + labels)
            // API canonical keys: work_type_code/name and work_category_code/name.
            // Some older code paths used DB column names (work_category_code/work_division_code);
            // prefer canonical and fall back defensively.
            put('work_type_code', item.work_type_code != null ? item.work_type_code : item.work_category_code);
            put('work_type', item.work_type_name != null ? item.work_type_name : item.work_category_name);
            put('work_category_code', item.work_category_code != null ? item.work_category_code : item.work_division_code);
            put('work_category', item.work_category_name != null ? item.work_category_name : item.work_division_name);
            put('work_status_code', item.work_status_code);
            put('work_status', item.work_status_name);
            put('work_operation_code', item.work_operation_code);
            put('work_operation', item.work_operation_name);
            put('work_group_code', item.work_group_code);
            put('work_group', item.work_group_name);

            put('work_name', item.work_name);
            put('system_name', item.system_name);
            put('system_ip', item.system_ip);
            put('manage_ip', item.mgmt_ip);

            // System (codes + labels)
            put('vendor_code', item.manufacturer_code);
            put('vendor', item.manufacturer_name);
            put('model_code', item.server_code);
            put('model', item.model_name);
            put('serial', item.serial_number);
            put('virtualization', item.virtualization_type);
            put('center_code', item.center_code);
            put('location_place', item.center_name);
            put('rack_code', item.rack_code);
            put('location_pos', item.rack_name);
            put('slot', item.system_slot);
            put('u_size', item.system_size);
            put('rack_face', (item.rack_face === 'REAR') ? '후면' : '전면');

            // Owners (codes + labels)
            put('sys_dept_code', item.system_dept_code);
            put('sys_dept', item.system_dept_name);
            put('svc_dept_code', item.service_dept_code);
            put('svc_dept', item.service_dept_name);
            put('sys_owner_emp_no', item.system_owner_emp_no);
            put('sys_owner', item.system_owner_name);
            put('svc_owner_emp_no', item.service_owner_emp_no);
            put('svc_owner', item.service_owner_name);

            // CIA / grade flags
            put('confidentiality', item.cia_confidentiality);
            put('integrity', item.cia_integrity);
            put('availability', item.cia_availability);
            put('security_score', item.security_score);
            put('system_grade', item.system_grade);
            if(item.is_core_system != null) put('core_flag', (String(item.is_core_system) === '1' || item.is_core_system === 1 || item.is_core_system === true) ? '핵심' : '일반');
            if(item.has_dr_site != null) put('dr_built', (String(item.has_dr_site) === '1' || item.has_dr_site === 1 || item.has_dr_site === true) ? 'O' : 'X');
            if(item.has_service_ha != null) put('svc_redundancy', (String(item.has_service_ha) === '1' || item.has_service_ha === 1 || item.has_service_ha === true) ? 'O' : 'X');
          }
        }
      }catch(errPrefill){
        try{ console.warn('[IDS_DETAIL] modal prefill fetch failed:', errPrefill); }catch(_w){ }
      }

      var GROUPS = [
        { title:'비즈니스', cols:['work_type','work_category','work_status','work_operation','work_group','work_name','system_name','system_ip','manage_ip'] },
        { title:'시스템', cols:['vendor','model','serial','virtualization','location_place','location_pos','slot','u_size','rack_face'] },
        { title:'담당자', cols:['sys_dept','sys_owner','svc_dept','svc_owner'] },
        { title:'점검', cols:['confidentiality','integrity','availability','security_score','system_grade','core_flag','dr_built','svc_redundancy'] }
      ];
      function fieldInput(col, value){
        value = cleanPlaceholderValue(value);
        var opts={
          virtualization:['','물리','가상'],
          confidentiality:['','1','2','3'], integrity:['','1','2','3'], availability:['','1','2','3'],
          system_grade:['','1등급','2등급','3등급'], core_flag:['','핵심','일반'], dr_built:['','O','X'], svc_redundancy:['','O','X']
        };
        var required = (col==='work_status' || col==='work_name' || col==='system_name');
        var requiredAttr = required ? ' required' : '';
        var requiredStar = required ? ' <span class="req-star" aria-hidden="true">*</span>' : '';

        // Business master-data selects (show name, store code)
        if(col==='work_type'){
          return '<select name="work_type" class="form-input search-select" data-searchable="1" data-searchable-placeholder="업무 분류 선택"><option value="">-</option></select>';
        }
        if(col==='work_category'){
          return '<select name="work_category" class="form-input search-select" data-searchable="1" data-searchable-placeholder="업무 구분 선택"><option value="">-</option></select>';
        }
        if(col==='work_operation'){
          return '<select name="work_operation" class="form-input search-select" data-searchable="1" data-searchable-placeholder="업무 운영 선택"><option value="">-</option></select>';
        }
        if(col==='work_group'){
          return '<select name="work_group" class="form-input search-select" data-searchable="1" data-searchable-placeholder="업무 그룹 선택"><option value="">-</option></select>';
        }

        // Foreign-key searchable selects
        if(col==='work_status'){
          return '<select name="work_status" class="form-input search-select" data-searchable="1" data-searchable-placeholder="업무 상태 선택"'+requiredAttr+'><option value="">-</option></select>';
        }
        if(col==='vendor'){
          return '<select name="vendor" class="form-input search-select" data-searchable="1" data-searchable-placeholder="제조사 선택"><option value="">-</option></select>';
        }
        if(col==='model'){
          var hasVendor = !!String((data && (data.vendor_code || data.vendor || '')) || '').trim();
          var dis = (!hasVendor) ? ' disabled' : '';
          return '<select name="model" class="form-input search-select" data-searchable="1" data-searchable-placeholder="모델 선택"'+dis+'><option value="">-</option></select>';
        }
        if(col==='location_place'){
          return '<select name="location_place" class="form-input search-select" data-searchable="1" data-searchable-placeholder="센터 선택"><option value="">-</option></select>';
        }
        if(col==='location_pos'){
          var hasPlace = !!String((data && (data.center_code || data.location_place || '')) || '').trim();
          var dis2 = (!hasPlace) ? ' disabled' : '';
          return '<select name="location_pos" class="form-input search-select" data-searchable="1" data-searchable-placeholder="랙 선택"'+dis2+'><option value="">-</option></select>';
        }
        if(col==='sys_dept'){
          return '<select name="sys_dept" class="form-input search-select" data-searchable="1" data-searchable-placeholder="부서 선택"><option value="">-</option></select>';
        }
        if(col==='sys_owner'){
          var hasSysDept = !!String((data && (data.sys_dept_code || data.sys_dept || '')) || '').trim();
          var dis3 = (!hasSysDept) ? ' disabled' : '';
          return '<select name="sys_owner" class="form-input search-select" data-searchable="1" data-searchable-placeholder="담당자 선택"'+dis3+'><option value="">-</option></select>';
        }
        if(col==='svc_dept'){
          return '<select name="svc_dept" class="form-input search-select" data-searchable="1" data-searchable-placeholder="부서 선택"><option value="">-</option></select>';
        }
        if(col==='svc_owner'){
          var hasSvcDept = !!String((data && (data.svc_dept_code || data.svc_dept || '')) || '').trim();
          var dis4 = (!hasSvcDept) ? ' disabled' : '';
          return '<select name="svc_owner" class="form-input search-select" data-searchable="1" data-searchable-placeholder="담당자 선택"'+dis4+'><option value="">-</option></select>';
        }

        if(col==='security_score') return '<input name="security_score" class="form-input" type="number" readonly placeholder="자동 합계" value="'+(value||'')+'">';
        if(opts[col]){
          // Searchable dropdown UX for 점검 fields
          var searchable = ['virtualization','confidentiality','integrity','availability','system_grade','core_flag','dr_built','svc_redundancy'].indexOf(col)>-1;
          var extraCls = searchable ? ' search-select' : '';
          var dataAttr = searchable ? ' data-searchable="1"' : '';
          if(searchable && col==='virtualization') dataAttr += ' data-searchable-placeholder="가상화 선택"';
          return '<select name="'+col+'" class="form-input'+extraCls+' '+(['confidentiality','integrity','availability'].indexOf(col)>-1?'score-trigger':'')+'"'+dataAttr+'>'+ 
            opts[col].map(function(o){ return '<option value="'+o+'" '+(String(o)===String(value)?'selected':'')+'>'+(o||'-')+'</option>'; }).join('')+
          '</select>';
        }
        if(col==='rack_face'){
            var selF=(value||'').toUpperCase()==='REAR'||value==='후면'?'':' selected';
            var selR=(value||'').toUpperCase()==='REAR'||value==='후면'?' selected':'';
            return '<select name="rack_face" class="form-input search-select" data-searchable="true" data-placeholder="선택"><option value="">선택</option><option value="FRONT"'+selF+'>전면</option><option value="REAR"'+selR+'>후면</option></select>';
        }
        if(['slot','u_size'].indexOf(col)>-1) return '<input name="'+col+'" type="number" min="0" step="1" class="form-input" value="'+(value||'')+'">';
        if(col==='work_name' || col==='system_name'){
          return '<input name="'+col+'" class="form-input" value="'+(value||'')+'"'+requiredAttr+' placeholder="필수">';
        }
        return '<input name="'+col+'" class="form-input" value="'+(value||'')+'">';
      }
      var html = GROUPS.map(function(g){
        var grid = g.cols.map(function(c){
          var meta=COLUMN_META[c]||{label:c};
          var isReq = (c==='work_status' || c==='work_name' || c==='system_name');
          var label = (c==='security_score'?'보안 점수':meta.label) + (isReq ? '<span class="req-star" aria-hidden="true">*</span>' : '');
          return '<div class="form-row"><label>'+label+'</label>'+ fieldInput(c, data[c]) +'</div>';
        }).join('');
        return '<div class="form-section"><div class="section-header"><h4>'+g.title+'</h4></div><div class="form-grid">'+grid+'</div></div>';
      }).join('');
      form.innerHTML = html;
      await hydrateBasicInfoEditForm(form, data);
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
  function setText(sel, val){
        var el=document.querySelector(sel);
        if(!el) return;
        var s = (val == null ? '' : String(val)).trim();
        el.textContent = s ? s : '-';
      }
      function setBadge(sel, val){ var el=document.querySelector(sel); if(el) el.textContent = (String(val||'').trim() ? String(val) : '-'); }
      function setHtml(sel, html){ var el=document.querySelector(sel); if(el) el.innerHTML = html; }
      function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
      function renderNum(col, raw){
        var s=(raw==null?'':String(raw)).trim();
        if(!s || s==='-') return '<span class="num-badge">-</span>';
        var n=parseInt(s,10);
        var tone='tone-1';
        if(!isNaN(n)){
          if(col==='security_score') tone=(n>=8)?'tone-3':(n>=6?'tone-2':'tone-1');
          else tone=(n>=3)?'tone-3':(n===2?'tone-2':'tone-1');
        }
        var show=isNaN(n)?esc(s):String(n);
        return '<span class="num-badge '+tone+'">'+show+'</span>';
      }
      function renderOx(raw){
        var s=(raw==null?'':String(raw)).trim();
        if(!s || s==='-') return '<span class="ox-badge">-</span>';
        var ox=s.toUpperCase();
        if(ox!=='O' && ox!=='X') return esc(s);
        return '<span class="ox-badge '+(ox==='O'?'on':'off')+'">'+ox+'</span>';
      }
      function v(name){ var el=form.querySelector('[name="'+name+'"]'); return el? (el.value||'') : ''; }
      function lbl(name){
        var el=form.querySelector('[name="'+name+'"]');
        if(!el) return '';
        if(el.tagName==='SELECT'){
          try{ var opt=el.selectedOptions && el.selectedOptions[0]; var t=opt? String(opt.textContent||'').trim():''; if(t==='-'||t==='') return ''; return t; }catch(_){ return ''; }
        }
        var s = String(el.value||'').trim();
        return s;
      }

      // Normalize any placeholder-like labels (e.g., "부서 선택", "부서를 먼저 선택")
      // so cleared department fields render as '-'.
      (function(){
        var _lbl = lbl;
        lbl = function(name){
          var t = _lbl(name);
          t = cleanPlaceholderValue(t);
          return t;
        };
      })();

      setText('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill .status-text', lbl('work_status') || v('work_status'));
      try {
        var pill=document.querySelector('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill');
        if(pill){
          var dot=pill.querySelector('.status-dot');
          var ws=(lbl('work_status') || v('work_status') || '').trim();
          var cls=(ws==='가동'?'ws-run': (ws==='유휴'?'ws-idle':'ws-wait'));
          if(dot){ dot.classList.remove('ws-run','ws-idle','ws-wait'); dot.classList.add(cls); }
        }
      }catch(_e){}
      setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(2) .info-value', lbl('work_type') || v('work_type'));
      setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(3) .info-value', lbl('work_category') || v('work_category'));
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(4) .info-value', lbl('work_operation') || v('work_operation'));
      setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(5) .info-value', lbl('work_group') || v('work_group'));
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(6) .info-value', v('work_name'));
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(7) .info-value', v('system_name'));
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(8) .info-value', v('system_ip'));
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(9) .info-value', v('manage_ip'));
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(1) .info-value', lbl('vendor'));
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(2) .info-value', lbl('model'));
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(3) .info-value', v('serial'));
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(4) .info-value', v('virtualization'));
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(5) .info-value', lbl('location_place'));
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(6) .info-value', lbl('location_pos'));
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(7) .info-value', v('slot'));
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(8) .info-value', v('u_size'));
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(1) .info-value', lbl('sys_dept'));
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(2) .info-value', lbl('sys_owner'));
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(3) .info-value', lbl('svc_dept'));
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(4) .info-value', lbl('svc_owner'));
      // 점검 카드: IDS 템플릿은 toggle-badge 기반
      setHtml('.basic-info-card:nth-child(4) .info-row:nth-child(1) .cell-num', renderNum('confidentiality', v('confidentiality')));
      setHtml('.basic-info-card:nth-child(4) .info-row:nth-child(2) .cell-num', renderNum('integrity', v('integrity')));
      setHtml('.basic-info-card:nth-child(4) .info-row:nth-child(3) .cell-num', renderNum('availability', v('availability')));
      setHtml('.basic-info-card:nth-child(4) .info-row:nth-child(4) .cell-num', renderNum('security_score', v('security_score')));
      setBadge('.basic-info-card:nth-child(4) .info-row:nth-child(5) .info-value', v('system_grade'));
      setBadge('.basic-info-card:nth-child(4) .info-row:nth-child(6) .info-value', v('core_flag'));
      setHtml('.basic-info-card:nth-child(4) .info-row:nth-child(7) .cell-ox.with-badge', renderOx(v('dr_built')));
      setHtml('.basic-info-card:nth-child(4) .info-row:nth-child(8) .cell-ox.with-badge', renderOx(v('svc_redundancy')));

      // Update header with edited system name
      try{
        var titleEl = document.getElementById('page-title');
        var subEl = document.getElementById('page-subtitle');
        if(titleEl) titleEl.textContent = String(v('system_name') || 'IDS');
        if(subEl) subEl.textContent = String(v('system_name') || '-');
      }catch(_){ }
      // Persist key hardware fields for cross-tab usage (hardware tab system row)
      try{
        var vendorVal = v('vendor');
        var modelVal  = v('model');
        var serialVal = v('serial');
        var slotVal   = v('slot');
        var uSizeVal  = v('u_size');
        // Use VTL-specific keys to avoid cross-page contamination
  localStorage.setItem('ids:current:vendor', String(vendorVal||''));
  localStorage.setItem('ids:current:model',  String(modelVal||''));
  localStorage.setItem('ids:current:serial', String(serialVal||''));
  localStorage.setItem('ids:current:slot',   String(slotVal||''));
  localStorage.setItem('ids:current:u_size', String(uSizeVal||''));
      }catch(_){ }
    }
    // Wire the Basic Info edit modal open/close/save
    // NOTE: This file is loaded in <head>; bind after DOM is ready.
    (function(){
      function wire(){
        function openModalLocal(id){
          var el=document.getElementById(id);
          if(!el) return;
          try{ el.setAttribute('aria-hidden', 'false'); }catch(_){ }
          el.classList.add('show');
          document.body.classList.add('modal-open');
        }
        function closeModalLocal(id){
          var el=document.getElementById(id);
          if(!el) return;
          try{ el.setAttribute('aria-hidden', 'true'); }catch(_){ }
          el.classList.remove('show');
          document.body.classList.remove('modal-open');
        }

        var openBtn = document.getElementById(EDIT_OPEN_ID);
        if(openBtn){
          openBtn.addEventListener('click', async function(){
            try{ await buildEditFormFromPage(); }
            catch(err){ try{ console.warn('[IDS_DETAIL] buildEditFormFromPage failed:', err); }catch(_){ } }
            openModalLocal(EDIT_MODAL_ID);
          });
        }

        var closeBtn = document.getElementById(EDIT_CLOSE_ID);
        if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalLocal(EDIT_MODAL_ID); }); }

        var modalEl = document.getElementById(EDIT_MODAL_ID);
        if(modalEl){
          modalEl.addEventListener('click', function(e){ if(e.target === modalEl) closeModalLocal(EDIT_MODAL_ID); });
          document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(EDIT_MODAL_ID); });
        }

        var saveBtn = document.getElementById(EDIT_SAVE_ID);
        if(saveBtn){
          saveBtn.addEventListener('click', async function(){
            var result = await saveBasicInfoFromModal();
            if(!result || !result.ok){
              alert((result && result.message) ? result.message : '저장에 실패했습니다.');
              return;
            }
            updatePageFromForm();
            closeModalLocal(EDIT_MODAL_ID);
          });
        }
      }

      if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
      else wire();
    })();

      // [Tabs moved to /static/js/_detail/tab*.js]

      /* Legacy table handlers disabled.
         Each IDS tab loads its dedicated script under /static/js/_detail/ (e.g. tab01-hardware.js).
      

      // delegate edit/delete/toggle save (legacy)
      if(window.BlossomTab01Hardware && window.BlossomTab01Hardware.handlesTable){
        // Shared handler (tab01-hardware.js) takes precedence.
      } else {
      var table = document.getElementById('hw-spec-table') || document.getElementById('mt-spec-table');
      if(table){
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
                // Maintenance tab (mt-spec-table) legacy wiring: guard so other tabs (e.g. 계정관리) don't crash.
                (function(){
                  var mtTable = document.getElementById('mt-spec-table');
                  if(!mtTable) return;

                  var addBtn = document.getElementById('mt-row-add');
                  if(addBtn){
                    addBtn.addEventListener('click', function(){
                      var tbody = mtTable.querySelector('tbody'); if(!tbody) return;
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
                          try{ if(window.__blsInitDatePickers) window.__blsInitDatePickers(tr); }catch(_){ }
                      wireMtFormatters(tr);
                    });
                  }

                  // Delegate actions
                  mtTable.addEventListener('click', function(ev){
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
      })();

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

      }
      (function(){
        var btn = document.getElementById('hw-download-btn');
        var modalId = 'hw-download-modal';
        var closeBtn = document.getElementById('hw-download-close');
        var confirmBtn = document.getElementById('hw-download-confirm');
        function openModalLocal(id){ var el=document.getElementById(id); if(!el) return; el.classList.add('show'); document.body.classList.add('modal-open'); }
        function closeModalLocal(id){ var el=document.getElementById(id); if(!el) return; el.classList.remove('show'); document.body.classList.remove('modal-open'); }
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

      }


      // [Tabs moved to /static/js/_detail/tab*.js]


      // [Tabs moved to /static/js/_detail/tab*.js]

      */


    // [Removed legacy Change Log implementation]

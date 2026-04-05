// Cost Management (CAPEX) - Contract tab (tab72-capex shared)
(function(){
  'use strict';

  const VERSION = '20260320-01';
  if (window.BlossomCapexTab62 && window.BlossomCapexTab62.__version === VERSION) return;

  const API_BASE = '/api/capex-contract-items';

  const TYPE_OPTIONS = ['구매/매입', '구축/제작', '영구사용권'];

  const DIVISION_HARDWARE = '하드웨어';
  const DIVISION_SOFTWARE = '소프트웨어';
  const DIVISION_COMPONENT = '부품';
  const DIVISION_ETC = '기타';

  const DIVISION_OPTIONS = [DIVISION_HARDWARE, DIVISION_SOFTWARE, DIVISION_COMPONENT, DIVISION_ETC];

  // tab62: 품목유형 옵션 (조달구분별)
  const ITEM_TYPES_BY_DIVISION = {
    [DIVISION_HARDWARE]: ['서버', '스토리지', 'SAN', '네트워크', '보안장비'],
    [DIVISION_SOFTWARE]: ['운영체제', '데이터베이스', '미들웨어', '가상화', '보안S/W', '고가용성'],
    [DIVISION_COMPONENT]: ['CPU', 'GPU', 'MEMORY', 'DISK', 'NIC', 'HBA', 'ETC'],
  };

  // division + item_type -> master table API
  // NOTE: include legacy labels so existing saved rows still resolve.
  const MODEL_SOURCE_MAP = {
    [DIVISION_HARDWARE]: {
      '서버': { url: '/api/hw-server-types?group=server', valueKey: 'model_name' },
      '스토리지': { url: '/api/hw-storage-types', valueKey: 'model_name' },
      'SAN': { url: '/api/hw-san-types', valueKey: 'model_name' },
      '네트워크': { url: '/api/hw-network-types', valueKey: 'model_name' },
      '보안장비': { url: '/api/hw-security-types', valueKey: 'model_name' },
    },
    [DIVISION_SOFTWARE]: {
      '운영체제': { url: '/api/sw-os-types', valueKey: 'model_name' },
      '데이터베이스': { url: '/api/sw-db-types', valueKey: 'model_name' },
      '미들웨어': { url: '/api/sw-middleware-types', valueKey: 'model_name' },
      '가상화': { url: '/api/sw-virtual-types', valueKey: 'model_name' },
      '보안S/W': { url: '/api/sw-security-types', valueKey: 'model_name' },
      '고가용성': { url: '/api/sw-ha-types', valueKey: 'model_name' },
      // legacy values (keep mapping so existing rows keep working)
      '보안': { url: '/api/sw-security-types', valueKey: 'model_name' },
      'HA': { url: '/api/sw-ha-types', valueKey: 'model_name' },
    },
    [DIVISION_COMPONENT]: {
      'CPU': { url: '/api/cmp-cpu-types', valueKey: 'model_name' },
      'GPU': { url: '/api/cmp-gpu-types', valueKey: 'model_name' },
      'MEMORY': { url: '/api/cmp-memory-types', valueKey: 'model_name' },
      'DISK': { url: '/api/cmp-disk-types', valueKey: 'model_name' },
      'NIC': { url: '/api/cmp-nic-types', valueKey: 'model_name' },
      'HBA': { url: '/api/cmp-hba-types', valueKey: 'model_name' },
      'ETC': { url: '/api/cmp-etc-types', valueKey: 'model_name' },
      // legacy values (keep mapping so existing rows keep working)
      '메모리': { url: '/api/cmp-memory-types', valueKey: 'model_name' },
      '디스크': { url: '/api/cmp-disk-types', valueKey: 'model_name' },
      '기타': { url: '/api/cmp-etc-types', valueKey: 'model_name' },
    },
    [DIVISION_ETC]: {},
  };
  // 계약업체(CAPEX 구매 사업자): /api/vendor-capex (backs onto vendor-maintenance table)
  const TAB62_VENDOR_CAPEX_SOURCE = 'tab62_vendor_capex_name';
  // 제조사: /api/vendor-manufacturers
  const TAB62_VENDOR_MANUFACTURER_SOURCE = 'tab62_vendor_manufacturer_name';
  // (legacy) 유지보수사: /api/vendor-maintenance
  const TAB62_VENDOR_MAINTENANCE_SOURCE = 'tab62_vendor_maintenance_name';
  // 모델(division + item_type -> DB master table)
  const TAB62_MODEL_CATALOG_SOURCE = 'tab62_model_catalog';
  // 프로젝트 번호: /api/prj/projects
  const TAB62_PROJECT_SOURCE = 'tab62_project_no';
  const DEFAULT_PAGE_SIZE = 10;

  // Flatpickr (calendar): match Basic tab experience (image 1)
  const FLATPICKR_CSS = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css';
  const FLATPICKR_THEME_HREF = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/themes/airbnb.css';
  const FLATPICKR_JS = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.js';
  const FLATPICKR_LOCALE = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/l10n/ko.js';
  let __fpPromise = null;

  function ensureCss(href, id){
    try{
      if(id && document.getElementById(id)) return;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      if(id) link.id = id;
      document.head.appendChild(link);
    }catch(_e){ /* ignore */ }
  }

  function loadScript(src){
    return new Promise((resolve, reject) => {
      try{
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => resolve(true);
        s.onerror = () => reject(new Error('FAILED ' + src));
        document.head.appendChild(s);
      }catch(e){ reject(e); }
    });
  }

  async function ensureFlatpickrAssets(){
    ensureCss(FLATPICKR_CSS, 'flatpickr-css');
    ensureCss(FLATPICKR_THEME_HREF, 'flatpickr-theme-css');
    if(window.flatpickr) return;
    if(__fpPromise) return __fpPromise;
    __fpPromise = loadScript(FLATPICKR_JS)
      .then(() => loadScript(FLATPICKR_LOCALE).catch(() => null))
      .catch((e) => { __fpPromise = null; throw e; });
    return __fpPromise;
  }

  function addTodayButton(cal){
    try{
      if(!cal || cal.querySelector('.fp-today-btn')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fp-today-btn';
      btn.textContent = '오늘';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        try{
          const inst = cal._flatpickr || (cal.parentNode && cal.parentNode._flatpickr) || null;
          if(inst){ inst.setDate(new Date(), true); }
        }catch(_){ }
      });
      cal.appendChild(btn);
    }catch(_e){ }
  }

  function setFlatpickrEnabled(input, enabled){
    try{
      if(!input || !input._flatpickr) return;
      input._flatpickr.set('clickOpens', !!enabled);
      if(!enabled) input._flatpickr.close();
    }catch(_e){ }
  }

  async function initFlatpickrForPair(startInput, endInput){
    if(!startInput || !endInput) return;
    try{ await ensureFlatpickrAssets(); }catch(_e){ return; }
    if(!window.flatpickr) return;
    try{
      if(window.flatpickr.l10ns && window.flatpickr.l10ns.ko){
        window.flatpickr.localize(window.flatpickr.l10ns.ko);
      }
    }catch(_e){ }

    // Flatpickr prefers text input.
    try{ if(startInput.type === 'date') startInput.type = 'text'; }catch(_e){}
    try{ if(endInput.type === 'date') endInput.type = 'text'; }catch(_e){}
    try{ if(!startInput.placeholder) startInput.placeholder = '연도-월-일'; }catch(_e){}
    try{ if(!endInput.placeholder) endInput.placeholder = '연도-월-일'; }catch(_e){}

    const afterReady = (_selectedDates, _dateStr, instance) => {
      try{
        const cal = instance && instance.calendarContainer;
        if(cal){
          cal.classList.add('blossom-date-popup');
          cal._flatpickr = instance;
          addTodayButton(cal);
        }
      }catch(_e){ }
    };

    const common = {
      dateFormat: 'Y-m-d',
      allowInput: true,
      disableMobile: true,
      clickOpens: true,
      onReady: afterReady,
      onOpen: afterReady,
    };

    if(!startInput._flatpickr){
      window.flatpickr(startInput, {
        ...common,
        onChange: (_d, v) => {
          try{ if(endInput._flatpickr) endInput._flatpickr.set('minDate', v || null); }catch(_e){ }
        },
      });
    }
    if(!endInput._flatpickr){
      window.flatpickr(endInput, {
        ...common,
        onChange: (_d, v) => {
          try{ if(startInput._flatpickr) startInput._flatpickr.set('maxDate', v || null); }catch(_e){ }
        },
      });
    }
  }

  function initRowDatePickers(tr){
    try{
      if(!tr) return;
      const startInput = tr.querySelector('input[data-role="support_start_date"]');
      const endInput = tr.querySelector('input[data-role="support_end_date"]');
      if(!startInput || !endInput) return;
      initFlatpickrForPair(startInput, endInput)
        .then(() => {
          const editing = (tr.dataset && tr.dataset.editing === '1');
          setFlatpickrEnabled(startInput, editing);
          setFlatpickrEnabled(endInput, editing);
        })
        .catch(() => null);
    }catch(_e){ }
  }

  function getPageKey(){
    try {
      const m = String(window.location.pathname || '').match(/^\/p\/([^\/?#]+)/);
      return m && m[1] ? decodeURIComponent(m[1]) : '';
    } catch (_e) {
      return '';
    }
  }

  function resolveCapexTypeFromKey(key){
    const k = String(key || '').toLowerCase();
    if (k.startsWith('cost_capex_hardware')) return 'HW';
    if (k.startsWith('cost_capex_software')) return 'SW';
    if (k.startsWith('cost_capex_etc')) return 'ETC';
    return '';
  }

  function getContext(){
    const main = document.querySelector('main.main-content');
    const manageNo = (main && main.dataset ? (main.dataset.manageNo || main.dataset.manage_no) : '') || (main ? (main.getAttribute('data-manage-no') || '') : '');
    const capexType = (main && main.dataset ? (main.dataset.capexType || main.dataset.capex_type) : '') || '';

    const pageKey = getPageKey();
    return {
      manageNo: String(manageNo || '').trim(),
      capexType: String(capexType || '').trim().toUpperCase() || resolveCapexTypeFromKey(pageKey),
      pageKey
    };
  }

  async function requestJson(url, options = {}){
    const opts = { credentials: 'same-origin', ...options };
    opts.headers = opts.headers ? { ...opts.headers } : {};
    opts.headers['Accept'] = 'application/json';
    if (opts.body && !opts.headers['Content-Type']) {
      opts.headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(url, opts);
    let data = {};
    try { data = await res.json(); } catch (_e) { data = {}; }
    if (!res.ok || data.success === false) {
      const msg = data.message || '요청을 처리하지 못했습니다.';
      throw new Error(msg);
    }
    return data;
  }

  function toastSafe(message){
    try {
      if (window.toast) { window.toast(String(message || ''), 'warning'); return; }
    } catch (_e) {}
  }

  function openModalLocal(id){
    const el = document.getElementById(id);
    if(!el) return;
    try{ document.body.classList.add('modal-open'); }catch(_e){ }
    el.classList.add('show');
    el.setAttribute('aria-hidden','false');
  }

  function closeModalLocal(id){
    const el = document.getElementById(id);
    if(!el) return;
    el.classList.remove('show');
    el.setAttribute('aria-hidden','true');
    try{ if(!document.querySelector('.modal-overlay-full.show')) document.body.classList.remove('modal-open'); }catch(_e){ }
  }

  function escapeCSV(v){
    const s = String(v == null ? '' : v);
    if(/[\r\n",]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
    return s;
  }

  function downloadCSV(filename, lines){
    const csv = Array.isArray(lines) ? lines.join('\r\n') : String(lines || '');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'capex_contract.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function(){ try{ URL.revokeObjectURL(url); }catch(_e){} }, 2500);
  }

  function safeFilenamePart(s){
    return String(s || '').replace(/[^0-9a-zA-Zㄱ-힣._-]+/g, '_').replace(/_+/g,'_').replace(/^_+|_+$/g,'');
  }

  function formatIntLike(v){
    if (v == null || v === '') return '';
    const s = String(v);
    const neg = s.trim().startsWith('-');
    const digits = s.replace(/[^0-9]/g, '');
    if (!digits) return '';
    try {
      const n = parseInt(digits, 10);
      if (isNaN(n)) return '';
      const out = n.toLocaleString('ko-KR');
      return neg ? ('-' + out) : out;
    } catch (_e) {
      return digits;
    }
  }

  function digitsOnly(v){
    const s = String(v == null ? '' : v);
    const neg = s.trim().startsWith('-');
    const digits = s.replace(/[^0-9]/g, '');
    if (!digits) return '';
    return (neg ? '-' : '') + digits;
  }

  function el(tag, attrs = {}, children = []){
    const node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(k => {
      const v = attrs[k];
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('data-')) node.setAttribute(k, v);
      else if (v === null || v === undefined) {}
      else node.setAttribute(k, v);
    });
    (children || []).forEach(c => node.appendChild(c));
    return node;
  }

  function buildSelect(options, value){
    const sel = el('select', { class: 'tab62-input', 'data-role': 'select' });
    (options || []).forEach(opt => {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt || '선택';
      if (String(opt) === String(value || '')) o.selected = true;
      sel.appendChild(o);
    });
    return sel;
  }

  function ensureTab62SearchSources(){
    try{
      window.BlossomSearchableSelectSources = window.BlossomSearchableSelectSources || {};
      const reg = window.BlossomSearchableSelectSources;

      const needs = function(key){
        try{
          const fn = reg[key];
          if(typeof fn !== 'function') return true;
          return String(fn.__tab62Version || '') !== VERSION;
        }catch(_e){
          return true;
        }
      };

      if(needs(TAB62_VENDOR_MANUFACTURER_SOURCE)){
        const fn = async function(ctx){
          const q = (ctx && ctx.query != null) ? String(ctx.query).trim() : '';
          const url = q ? (`/api/vendor-manufacturers?q=${encodeURIComponent(q)}`) : '/api/vendor-manufacturers';
          try{
            const r = await fetch(url, { method:'GET', headers:{ 'Accept':'application/json' }, credentials:'same-origin' });
            const j = await r.json().catch(() => null);
            const rows = (j && j.success && Array.isArray(j.items)) ? j.items : (Array.isArray(j) ? j : []);
            const items = (rows || []).slice(0, 200).map((it) => {
              const name = (it && (it.manufacturer_name || it.vendor || it.name)) ? String(it.manufacturer_name || it.vendor || it.name).trim() : '';
              const code = (it && (it.manufacturer_code || it.code)) ? String(it.manufacturer_code || it.code).trim() : '';
              const label = name || code;
              if(!label) return null;
              return { value: label, label: label, searchText: [name, code].filter(Boolean).join(' ') };
            }).filter(Boolean);
            if(!items.length) return { items: [], emptyMessage: '검색 결과가 없습니다.' };
            return items;
          }catch(_e){
            return { items: [], emptyMessage: '검색 결과가 없습니다.' };
          }
        };
        fn.__tab62Version = VERSION;
        reg[TAB62_VENDOR_MANUFACTURER_SOURCE] = fn;
      }

      if(needs(TAB62_VENDOR_CAPEX_SOURCE)){
        const fn = async function(ctx){
          const q = (ctx && ctx.query != null) ? String(ctx.query).trim() : '';
          const url = q ? (`/api/vendor-capex?q=${encodeURIComponent(q)}`) : '/api/vendor-capex';
          try{
            const r = await fetch(url, { method:'GET', headers:{ 'Accept':'application/json' }, credentials:'same-origin' });
            const j = await r.json().catch(() => null);
            const rows = (j && j.success && Array.isArray(j.items)) ? j.items : (Array.isArray(j) ? j : []);
            const items = (rows || []).slice(0, 200).map((it) => {
              const name = (it && (it.maintenance_name || it.vendor || it.name)) ? String(it.maintenance_name || it.vendor || it.name).trim() : '';
              const code = (it && (it.maintenance_code || it.code)) ? String(it.maintenance_code || it.code).trim() : '';
              const label = name || code;
              if(!label) return null;
              return { value: label, label: label, searchText: [name, code].filter(Boolean).join(' ') };
            }).filter(Boolean);
            if(!items.length) return { items: [], emptyMessage: '검색 결과가 없습니다.' };
            return items;
          }catch(_e){
            return { items: [], emptyMessage: '검색 결과가 없습니다.' };
          }
        };
        fn.__tab62Version = VERSION;
        reg[TAB62_VENDOR_CAPEX_SOURCE] = fn;
      }

      if(needs(TAB62_VENDOR_MAINTENANCE_SOURCE)){
        const fn = async function(ctx){
          const q = (ctx && ctx.query != null) ? String(ctx.query).trim() : '';
          const url = q ? (`/api/vendor-maintenance?q=${encodeURIComponent(q)}`) : '/api/vendor-maintenance';
          try{
            const r = await fetch(url, { method:'GET', headers:{ 'Accept':'application/json' }, credentials:'same-origin' });
            const j = await r.json().catch(() => null);
            const rows = (j && j.success && Array.isArray(j.items)) ? j.items : (Array.isArray(j) ? j : []);
            const items = (rows || []).slice(0, 200).map((it) => {
              const name = (it && (it.maintenance_name || it.vendor || it.name)) ? String(it.maintenance_name || it.vendor || it.name).trim() : '';
              const code = (it && (it.maintenance_code || it.code)) ? String(it.maintenance_code || it.code).trim() : '';
              const label = name || code;
              if(!label) return null;
              return { value: label, label: label, searchText: [name, code].filter(Boolean).join(' ') };
            }).filter(Boolean);
            if(!items.length) return { items: [], emptyMessage: '검색 결과가 없습니다.' };
            return items;
          }catch(_e){
            return { items: [], emptyMessage: '검색 결과가 없습니다.' };
          }
        };
        fn.__tab62Version = VERSION;
        reg[TAB62_VENDOR_MAINTENANCE_SOURCE] = fn;
      }

      if(needs(TAB62_MODEL_CATALOG_SOURCE)){
        const fn = async function(ctx){
          const q = (ctx && ctx.query != null) ? String(ctx.query).trim() : '';
          const sel = (ctx && ctx.select) ? ctx.select : null;
          let baseUrl = '';
          let valueKey = '';
          try{
            baseUrl = (sel && sel.dataset && (sel.dataset.modelUrl || sel.dataset.modelurl || sel.dataset.sourceUrl || sel.dataset.sourceurl))
              ? String(sel.dataset.modelUrl || sel.dataset.modelurl || sel.dataset.sourceUrl || sel.dataset.sourceurl).trim()
              : '';
          }catch(_e){ baseUrl = ''; }
          try{
            valueKey = (sel && sel.dataset && (sel.dataset.valueKey || sel.dataset.valuekey || sel.dataset.modelValueKey || sel.dataset.modelvaluekey))
              ? String(sel.dataset.valueKey || sel.dataset.valuekey || sel.dataset.modelValueKey || sel.dataset.modelvaluekey).trim()
              : '';
          }catch(_e2){ valueKey = ''; }

          if(!baseUrl){
            return { items: [], emptyMessage: '품목유형을 먼저 선택하세요.' };
          }

          const sep = baseUrl.indexOf('?') >= 0 ? '&' : '?';
          const url = q ? (baseUrl + sep + 'q=' + encodeURIComponent(q)) : baseUrl;

          function pickLabel(it){
            if(!it || typeof it !== 'object') return '';
            if(valueKey && it[valueKey] != null){
              const s = String(it[valueKey]).trim();
              if(s) return s;
            }
            const fallbacks = ['model_name', 'model', 'db_name', 'db', 'name', 'os_name'];
            for(let i=0;i<fallbacks.length;i++){
              const k = fallbacks[i];
              if(it[k] != null){
                const s = String(it[k]).trim();
                if(s) return s;
              }
            }
            return '';
          }

          function buildSearchText(it, label){
            if(!it || typeof it !== 'object') return label || '';
            const keys = [
              'server_code','storage_code','san_code','network_code','security_code',
              'os_code','db_code','mw_code','virtual_code','security_sw_code','ha_code',
              'cpu_code','gpu_code','memory_code','disk_code','nic_code','hba_code','etc_code',
              'manufacturer_code','manufacturer_name'
            ];
            const parts = [label || ''];
            keys.forEach(function(k){
              if(it[k] != null){
                const s = String(it[k]).trim();
                if(s) parts.push(s);
              }
            });
            return parts.filter(Boolean).join(' ');
          }

          try{
            const r = await fetch(url, { method:'GET', headers:{ 'Accept':'application/json' }, credentials:'same-origin' });
            const j = await r.json().catch(() => null);
            const rows = (j && j.success && Array.isArray(j.items)) ? j.items : (Array.isArray(j) ? j : []);
            const items = (rows || []).slice(0, 220).map((it) => {
              const label = pickLabel(it);
              if(!label) return null;
              return { value: label, label: label, searchText: buildSearchText(it, label) };
            }).filter(Boolean);
            if(!items.length) return { items: [], emptyMessage: '검색 결과가 없습니다.' };
            return items;
          }catch(_e3){
            return { items: [], emptyMessage: '검색 결과가 없습니다.' };
          }
        };
        fn.__tab62Version = VERSION;
        reg[TAB62_MODEL_CATALOG_SOURCE] = fn;
      }

      // 프로젝트 번호 검색 소스: /api/prj/projects
      // 표시: "프로젝트번호 (프로젝트명)", 저장: 프로젝트번호만
      if(needs(TAB62_PROJECT_SOURCE)){
        const fn = async function(ctx){
          const q = (ctx && ctx.query != null) ? String(ctx.query).trim() : '';
          const url = q ? ('/api/prj/projects?scope=all&q=' + encodeURIComponent(q)) : '/api/prj/projects?scope=all';
          try{
            const r = await fetch(url, { method:'GET', headers:{ 'Accept':'application/json' }, credentials:'same-origin' });
            const j = await r.json().catch(function(){ return null; });
            const rows = (j && j.success && Array.isArray(j.items)) ? j.items : [];
            const items = (rows || []).slice(0, 300).map(function(it){
              var pno = (it && it.project_number) ? String(it.project_number).trim() : '';
              var pname = (it && it.project_name) ? String(it.project_name).trim() : '';
              if(!pno) return null;
              var label = pname ? (pno + ' (' + pname + ')') : pno;
              return { value: pno, label: label, displayLabel: pno, searchText: [pno, pname].filter(Boolean).join(' ') };
            }).filter(Boolean);
            if(!items.length) return { items: [], emptyMessage: '검색 결과가 없습니다.' };
            return items;
          }catch(_e){
            return { items: [], emptyMessage: '검색 결과가 없습니다.' };
          }
        };
        fn.__tab62Version = VERSION;
        reg[TAB62_PROJECT_SOURCE] = fn;
      }
    }catch(_e){ /* ignore */ }
  }

  function enhanceSearchableSelects(scopeEl){
    try{
      if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function'){
        window.BlossomSearchableSelect.enhance(scopeEl || document);
      }
      if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
        window.BlossomSearchableSelect.syncAll(scopeEl || document);
      }
    }catch(_e){ }
  }

  function buildSearchSelect({ role = '', placeholder = '선택', sourceKey = '', value = '', options = null, disabled = false } = {}){
    const sel = el('select', { class: 'tab62-input search-select', 'data-role': role });
    sel.setAttribute('data-searchable-scope', 'page');
    sel.setAttribute('data-placeholder', placeholder || '선택');
    sel.setAttribute('data-allow-clear', 'true');
    if(sourceKey) sel.setAttribute('data-search-source', sourceKey);
    if(disabled) sel.disabled = true;

    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = placeholder || '선택';
    sel.appendChild(opt0);

    if(Array.isArray(options)){
      options.forEach(function(opt){
        const v = (opt == null ? '' : String(opt));
        if(!v) return; // placeholder option already exists
        const o = document.createElement('option');
        o.value = v;
        o.textContent = v;
        if(String(v) === String(value || '')) o.selected = true;
        sel.appendChild(o);
      });
    }

    const cur = String(value || '').trim();
    if(cur){
      const exists = Array.from(sel.options || []).some((o) => String(o.value || '') === cur);
      if(!exists){
        const o = document.createElement('option');
        o.value = cur;
        o.textContent = cur;
        o.selected = true;
        sel.appendChild(o);
      }else{
        sel.value = cur;
      }
    }

    return sel;
  }

  function buildInput(value, { type = 'text', role = '', readonly = false, align = '' } = {}){
    const attrs = { class: 'tab62-input', type };
    if (role) attrs['data-role'] = role;
    if (readonly) attrs['readonly'] = 'readonly';
    const input = el('input', attrs);
    input.value = value == null ? '' : String(value);
    if (align) input.style.textAlign = align;
    return input;
  }

  function setRowEditing(tr, editing){
    if(!tr) return;
    tr.dataset.editing = editing ? '1' : '0';

    // Enhancement is done once AFTER all disabled/readOnly toggling below,
    // so the wrapper UI matches the underlying state on the first pass.

    function findStateItemForRow(){
      try{
        const id = tr.dataset && tr.dataset.id ? parseInt(String(tr.dataset.id), 10) : 0;
        const key = tr.dataset && tr.dataset.key ? String(tr.dataset.key) : '';
        const idx = (state && Array.isArray(state.items))
          ? state.items.findIndex(function(x){ return (x && x.id != null && id && x.id === id) || (key && x && x.__key === key); })
          : -1;
        return idx >= 0 ? state.items[idx] : null;
      }catch(_e){
        return null;
      }
    }

    function formatViewValue(role, raw){
      const r = String(role || '');
      if(raw == null) return '';
      if(r === 'unit_price' || r === 'quantity' || r === 'total_price' || r === 'tco'){
        return formatIntLike(raw);
      }
      if(r === 'rate'){
        var s = String(raw).trim();
        if(!s) return '';
        return s + '%';
      }
      if(r === 'free_support_months'){
        var s = String(raw).trim();
        if(!s) return '';
        return s + '개월';
      }
      if(r === 'inspection_inbound'){
        const s = String(raw).trim().toUpperCase();
        if(!s) return '';
        if(s === 'O' || s === 'X') return s;
        if(raw === true || raw === 1 || raw === '1') return 'O';
        if(raw === false || raw === 0 || raw === '0') return 'X';
        return '';
      }
      return String(raw).trim();
    }

    function ensureViewTextForControl(controlEl){
      if(!controlEl) return;
      const td = controlEl.closest ? controlEl.closest('td') : null;
      if(!td) return;

      const role = (function(){
        try{ return String(controlEl.getAttribute('data-role') || ''); }catch(_e){ return ''; }
      })();

      const rowItem = role ? findStateItemForRow() : null;

      // For searchable selects, the visible UI is the wrapper (not the native <select>).
      const wrapper = (controlEl.closest && controlEl.closest('.fk-searchable-control')) ? controlEl.closest('.fk-searchable-control') : null;
      const anchor = wrapper || controlEl;

      let viewEl = null;
      try{
        viewEl = td.querySelector('.tab62-view-text' + (role ? ('[data-role="' + CSS.escape(role) + '"]') : ''));
      }catch(_e){
        // Fallback without CSS.escape for older engines
        viewEl = td.querySelector('.tab62-view-text' + (role ? ('[data-role="' + role.replace(/"/g, '') + '"]') : ''));
      }
      if(!viewEl){
        viewEl = document.createElement('span');
        viewEl.className = 'tab62-view-text';
        if(role) viewEl.setAttribute('data-role', role);
        // Insert before the control UI so the cell layout stays stable.
        try{ td.insertBefore(viewEl, anchor); }catch(_e2){ td.appendChild(viewEl); }
      }

      // Compute display text.
      // Prefer state (source of truth) to avoid transient DOM desync in searchable-select wrappers.
      let text = '';
      try{
        if(rowItem && role){
          text = formatViewValue(role, rowItem[role]);
        }else if(controlEl.tagName === 'SELECT'){
          // For source-driven selects (e.g., project_no), opt.textContent may
          // include supplementary info (project name) for searchability.
          // Prefer data-display-label (set by the source), then the option value
          // which equals the stored DB key. Avoids showing full labels in view mode.
          const opt = controlEl.selectedOptions && controlEl.selectedOptions[0];
          const _displayLabel = opt && opt.getAttribute ? (opt.getAttribute('data-display-label') || '').trim() : '';
          text = _displayLabel || String(controlEl.value || '').trim();
          if(!String(controlEl.value || '').trim()) text = '';

          // Searchable-select wrappers can desync from the native <select>.
          // If the wrapper shows a selected label but the native value is empty,
          // use the wrapper text so refresh doesn't appear to "wipe" values.
          if(!text && wrapper){
            try{
              const btn = wrapper.querySelector('.fk-searchable-display');
              if(btn){
                const t = String(btn.textContent || '').trim();
                const ph = String(btn.dataset && btn.dataset.placeholder ? btn.dataset.placeholder : '').trim();
                if(t && (!ph || t !== ph)) text = t;
              }
            }catch(_eWrap){ /* ignore */ }
          }
        }else{
          text = String(controlEl.value == null ? '' : controlEl.value).trim();
          // Apply formatting even for plain <input> (rate → %, support months → 개월)
          if(role && text) text = formatViewValue(role, text);
        }
      }catch(_e3){ text = ''; }

      viewEl.textContent = text;

      // Right-align numeric / rate fields
      var rightAligned = (role === 'unit_price' || role === 'quantity' || role === 'total_price' || role === 'rate' || role === 'tco');
      if(rightAligned){
        viewEl.style.textAlign = 'right';
        viewEl.style.display = 'block';
        viewEl.style.width = '100%';
      }

      // Toggle visibility: view text only when NOT editing.
      if(editing){
        viewEl.style.display = 'none';
        anchor.style.display = '';
      }else{
        if(!rightAligned) viewEl.style.display = '';
        anchor.style.display = 'none';
      }
    }

    // Create wrappers once so ensureViewTextForControl can detect them.
    try{ enhanceSearchableSelects(tr); }catch(_e){ }

    const controls = tr.querySelectorAll('.tab62-input');
    controls.forEach(function(node){
      if(!node) return;
      const role = node.getAttribute('data-role') || '';
      const isAlwaysReadonly = (role === 'total_price' || role === 'tco' || role === 'support_end_date');
      if(node.tagName === 'SELECT'){
        node.disabled = !editing;
        ensureViewTextForControl(node);
        return;
      }
      if(node.tagName === 'INPUT' || node.tagName === 'TEXTAREA'){
        if(isAlwaysReadonly){
          node.readOnly = true;
          ensureViewTextForControl(node);
          return;
        }
        node.readOnly = !editing;
        ensureViewTextForControl(node);
      }
    });

    const editBtn = tr.querySelector('.js-tab62-edit');
    const saveBtn = tr.querySelector('.js-tab62-save');
    if(editBtn) editBtn.style.display = editing ? 'none' : '';
    if(saveBtn) saveBtn.style.display = editing ? '' : 'none';

    // Flatpickr: only open calendar while editing
    try{
      const startInput = tr.querySelector('input[data-role="support_start_date"]');
      const endInput = tr.querySelector('input[data-role="support_end_date"]');
      setFlatpickrEnabled(startInput, editing);
      setFlatpickrEnabled(endInput, editing);
    }catch(_e){ }

    // Sync wrapper disabled/enabled state after toggling select.disabled above.
    try{
      if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
        window.BlossomSearchableSelect.syncAll(tr);
      }
    }catch(_e){ }

    // Re-apply view/hide logic for selects so the wrapper is hidden in view mode.
    try{
      const sels = tr.querySelectorAll('select.tab62-input');
      sels.forEach(function(s){ ensureViewTextForControl(s); });
    }catch(_e){ }
  }

  function computeTotalFromRow(tr){
    // Use 'input[data-role=...]' to skip view-text spans that share the same data-role.
    const unitEl = tr.querySelector('input[data-role="unit_price"]');
    const qtyEl = tr.querySelector('input[data-role="quantity"]');
    const totalEl = tr.querySelector('input[data-role="total_price"]');
    if (!unitEl || !qtyEl || !totalEl) return;
    const unit = parseInt(digitsOnly(unitEl.value), 10) || 0;
    const qty = parseInt(digitsOnly(qtyEl.value), 10) || 0;
    const total = unit * qty;
    totalEl.value = total ? formatIntLike(total) : '';
    totalEl.dataset.raw = total ? String(total) : '';
    // Also update the view-text span (shown in readonly/view mode)
    try{
      const td = totalEl.closest ? totalEl.closest('td') : null;
      if(td){
        const vt = td.querySelector('.tab62-view-text');
        if(vt) vt.textContent = total ? formatIntLike(total) : '';
      }
    }catch(_e){}
  }

  function readRowPayload(tr, ctx, state){
    function findExisting(role){
      try{
        if(!state || !Array.isArray(state.items)) return undefined;
        const id = tr.dataset && tr.dataset.id ? parseInt(String(tr.dataset.id), 10) : 0;
        const key = tr.dataset && tr.dataset.key ? String(tr.dataset.key) : '';
        const idx = state.items.findIndex(function(x){
          return (x && x.id != null && id && x.id === id) || (key && x && x.__key === key);
        });
        if(idx < 0) return undefined;
        const it = state.items[idx];
        return it ? it[role] : undefined;
      }catch(_e){
        return undefined;
      }
    }

    function v(role){
      const n = tr.querySelector('input[data-role="' + role + '"]') || tr.querySelector('select[data-role="' + role + '"]') || tr.querySelector('[data-role="' + role + '"]');
      if (!n) return '';
      const raw = (n.value == null ? '' : String(n.value));
      if (String(raw || '').trim()) return raw;

      // Searchable-select wrapper can temporarily desync from the native <select> value.
      // If the user sees a selected label in the display button, resolve the underlying
      // option value (not the display text) so we save the correct key (e.g. project_no only).
      try{
        const wrap = (n.closest && n.closest('.fk-searchable-control')) ? n.closest('.fk-searchable-control') : null;
        const btn = wrap ? wrap.querySelector('.fk-searchable-display') : null;
        if(btn){
          const text = String(btn.textContent || '').trim();
          const placeholder = String(btn.dataset && btn.dataset.placeholder ? btn.dataset.placeholder : '').trim();
          if(text && (!placeholder || text !== placeholder)){
            // Try to find the <option> whose textContent matches the display text,
            // then return its .value (which may differ from textContent for source-driven selects).
            if(n.tagName === 'SELECT'){
              var matchedOpt = Array.from(n.options || []).find(function(o){
                return String(o.textContent || '').trim() === text;
              });
              if(matchedOpt && String(matchedOpt.value || '').trim()){
                return String(matchedOpt.value);
              }
            }
            return text;
          }
        }
      }catch(_e){ }

      // For select-driven fields, avoid wiping existing DB/state values when the UI is desynced.
      // If the control is a SELECT (searchable-select) and we still have an empty value,
      // use the state value (set by bind handlers) unless the user explicitly cleared it.
      try{
        if(n.tagName === 'SELECT'){
          const userCleared = String((n.dataset && n.dataset.userCleared) ? n.dataset.userCleared : '').trim();
          const existing = findExisting(role);
          if(!String(raw || '').trim() && String(existing || '').trim() && userCleared !== '1'){
            return String(existing);
          }
        }
      }catch(_e2){ }

      // General fallback: if DOM value is empty but state object has a value
      // (set by bind/wireNumberInput handlers), prefer state.
      if(!String(raw || '').trim()){
        try{
          const stateVal = findExisting(role);
          if(stateVal != null && String(stateVal).trim() !== '') return String(stateVal);
        }catch(_e3){ }
      }

      return raw;
    }

    const unitRaw = digitsOnly(v('unit_price'));
    const qtyRaw = digitsOnly(v('quantity'));
    const totalEl = tr.querySelector('input[data-role="total_price"]');
    const totalRaw = (totalEl && totalEl.dataset && totalEl.dataset.raw) ? String(totalEl.dataset.raw || '') : digitsOnly(v('total_price'));

    const payload = {
      capex_type: ctx.capexType,
      manage_no: ctx.manageNo,
    };

    const values = {
      contract_type: v('contract_type'),
      contract_division: v('contract_division'),
      item_type: v('item_type'),
      supplier: v('supplier'),
      manufacturer: v('manufacturer'),
      model: v('model'),
      specification: v('specification'),
      unit_price: unitRaw,
      quantity: qtyRaw,
      total_price: totalRaw,
      rate: v('rate'),
      free_support_months: digitsOnly(v('free_support_months')),
      support_start_date: v('support_start_date'),
      support_end_date: v('support_end_date'),
      project_no: v('project_no')
    };

    // Merge in state values for any fields left empty by DOM reads
    // (bind handlers keep it[role] up to date even when DOM desyncs).
    try{
      var _stateIdx = (state && Array.isArray(state.items))
        ? state.items.findIndex(function(x){
            var _id = tr.dataset && tr.dataset.id ? parseInt(String(tr.dataset.id), 10) : 0;
            var _key = tr.dataset && tr.dataset.key ? String(tr.dataset.key) : '';
            return (x && x.id != null && _id && x.id === _id) || (_key && x && x.__key === _key);
          })
        : -1;
      var _stateItem = _stateIdx >= 0 ? state.items[_stateIdx] : null;
      if(_stateItem){
        Object.keys(values).forEach(function(k){
          var vv = values[k];
          if(vv != null && String(vv).trim() !== '') return;
          var sv = _stateItem[k];
          if(sv != null && String(sv).trim() !== '') values[k] = String(sv);
        });
      }
    }catch(_eMerge){ }

    Object.keys(values).forEach(function(k){
      const raw = values[k];
      if(raw === undefined || raw === null) return;
      const s = String(raw).trim();
      if(s === '') return;
      payload[k] = raw;
    });

    return payload;
  }

  function setEmptyVisible(emptyEl, visible){
    if (!emptyEl) return;
    emptyEl.hidden = !visible;
  }

  function buildRow(item){
    const it = item || {};
    const tr = document.createElement('tr');
    if (it.id != null) tr.dataset.id = String(it.id);
    if (it.__key) tr.dataset.key = String(it.__key);

    const td = (child) => { const t = document.createElement('td'); if(child) t.appendChild(child); return t; };

    const check = el('input', { type: 'checkbox', class: 'hw-row-check tab62-row-check', 'aria-label': '행 선택' });
    if (it.__selected) check.checked = true;
    const tdCheck = td(check);

    ensureTab62SearchSources();
    const typeSel = buildSearchSelect({ role: 'contract_type', placeholder: '선택', options: TYPE_OPTIONS, value: it.contract_type });
    const divisionSel = buildSearchSelect({ role: 'contract_division', placeholder: '조달구분', options: DIVISION_OPTIONS, value: it.contract_division });

    const itemTypeTd = document.createElement('td');
    let itemTypeControl = null;

    // 계약업체(CAPEX 구매 사업자): /api/vendor-capex (maintenance_name)
    const supplier = buildSearchSelect({ role: 'supplier', placeholder: '계약업체', sourceKey: TAB62_VENDOR_CAPEX_SOURCE, value: it.supplier });
    // 제조사: /api/vendor-manufacturers (manufacturer_name)
    const manufacturer = buildSearchSelect({ role: 'manufacturer', placeholder: '제조사', sourceKey: TAB62_VENDOR_MANUFACTURER_SOURCE, value: it.manufacturer });
    const modelTd = document.createElement('td');
    let modelControl = null;
    const specification = buildInput(it.specification, { role: 'specification' });

    const unitPrice = buildInput(formatIntLike(it.unit_price), { role: 'unit_price', align: 'right' });
    const quantity = buildInput(formatIntLike(it.quantity), { role: 'quantity', align: 'right' });
    const totalPrice = buildInput(formatIntLike(it.total_price), { role: 'total_price', readonly: true, align: 'right' });
    totalPrice.dataset.raw = it.total_price == null ? '' : String(it.total_price);

    const rate = buildInput(it.rate, { role: 'rate', align: 'right' });
    const tco = buildInput('', { role: 'tco', readonly: true, align: 'right' });
    // 무상기간: user enters manually (numeric only, in months)
    const freeSupportMonths = buildInput(formatIntLike(it.free_support_months), { role: 'free_support_months' });
    // Use text input + flatpickr (to avoid browser-native date picker look)
    const startDate = buildInput(it.support_start_date, { role: 'support_start_date', type: 'text' });
    const endDate = buildInput(it.support_end_date, { role: 'support_end_date', type: 'text', readonly: true });
    startDate.classList.add('date-input');
    endDate.classList.add('date-input');

    // 프로젝트 번호: 검색 드롭박스 (프로젝트번호 (프로젝트명) 표시, 번호만 저장)
    const projectNo = buildSearchSelect({ role: 'project_no', placeholder: '프로젝트 번호', sourceKey: TAB62_PROJECT_SOURCE, value: it.project_no });

    const actionsTd = document.createElement('td');
    actionsTd.className = 'system-actions table-actions';
    actionsTd.innerHTML = ''
      + '<button class="action-btn js-tab62-edit" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button>'
      + '<button class="action-btn js-tab62-save" data-action="save" type="button" title="저장" aria-label="저장" style="display:none;"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button>'
      + '<button class="action-btn danger js-tab62-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>';

    tr.appendChild(tdCheck);
    tr.appendChild(td(typeSel));
    tr.appendChild(td(divisionSel));
    tr.appendChild(itemTypeTd);
    tr.appendChild(td(manufacturer));
    tr.appendChild(modelTd);
    tr.appendChild(td(specification));
    tr.appendChild(td(supplier));
    tr.appendChild(td(unitPrice));
    tr.appendChild(td(quantity));
    tr.appendChild(td(totalPrice));
    tr.appendChild(td(rate));
    tr.appendChild(td(tco));
    tr.appendChild(td(freeSupportMonths));
    tr.appendChild(td(startDate));
    tr.appendChild(td(endDate));
    tr.appendChild(td(projectNo));
    tr.appendChild(actionsTd);

    function parseYmd(s){
      const m = String(s || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if(!m) return null;
      const y = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10);
      const d = parseInt(m[3], 10);
      if(!y || !mo || !d) return null;
      const dt = new Date(y, mo - 1, d);
      if(dt.getFullYear() !== y || (dt.getMonth()+1) !== mo || dt.getDate() !== d) return null;
      return dt;
    }

    function computeEndDate(){
      var s0 = String(startDate.value || '').trim();
      var m = parseInt(digitsOnly(freeSupportMonths.value), 10) || 0;
      var sd = parseYmd(s0);
      if(!sd || !m){
        endDate.value = '';
        it.support_end_date = '';
        try{
          var edTd = endDate.closest ? endDate.closest('td') : null;
          if(edTd){ var vt = edTd.querySelector('.tab62-view-text'); if(vt) vt.textContent = ''; }
        }catch(_e){}
        return;
      }
      var ed = new Date(sd.getFullYear(), sd.getMonth() + m, sd.getDate() - 1);
      var yy = ed.getFullYear();
      var mm = String(ed.getMonth() + 1).padStart(2, '0');
      var dd = String(ed.getDate()).padStart(2, '0');
      var result = yy + '-' + mm + '-' + dd;
      endDate.value = result;
      it.support_end_date = result;
      try{
        var edTd2 = endDate.closest ? endDate.closest('td') : null;
        if(edTd2){ var vt2 = edTd2.querySelector('.tab62-view-text'); if(vt2) vt2.textContent = result; }
      }catch(_e){}
    }

    function bind(role, node, kind){
      if(!node) return;
      const handler = function(){
        if(kind === 'select') it[role] = String(node.value || '');
        else if(kind === 'int') it[role] = digitsOnly(node.value);
        else it[role] = String(node.value || '');
      };
      node.addEventListener('change', handler);
      node.addEventListener('input', handler);
    }

    function getDivisionValue(){
      try{
        return String((divisionSel && divisionSel.value != null) ? divisionSel.value : (it.contract_division || '')).trim();
      }catch(_e){
        return String(it.contract_division || '').trim();
      }
    }

    function itemTypeOptionsForDivision(division){
      const div = String(division || '').trim();
      if(Object.prototype.hasOwnProperty.call(ITEM_TYPES_BY_DIVISION, div)){
        const opts = ITEM_TYPES_BY_DIVISION[div];
        return Array.isArray(opts) ? opts : [''];
      }
      return [''];
    }

    function getItemTypeValue(){
      try{
        return String((itemTypeControl && itemTypeControl.value != null) ? itemTypeControl.value : (it.item_type || '')).trim();
      }catch(_e){
        return String(it.item_type || '').trim();
      }
    }

    function getModelSourceFor(division, itemType){
      const div = String(division || '').trim();
      const t = String(itemType || '').trim();
      const byDiv = MODEL_SOURCE_MAP[div];
      if(!byDiv || typeof byDiv !== 'object') return null;
      const src = byDiv[t];
      if(!src || typeof src !== 'object') return null;
      const url = src.url ? String(src.url).trim() : '';
      const valueKey = src.valueKey ? String(src.valueKey).trim() : '';
      if(!url) return null;
      return { url, valueKey };
    }

    function applyControlEditingState(node, { forceDisabled = false, forceReadonly = false } = {}){
      if(!node) return;
      try{
        const editing = (tr.dataset && tr.dataset.editing === '1');
        if(node.tagName === 'SELECT'){
          node.disabled = (!editing) || !!forceDisabled;
          return;
        }
        if(node.tagName === 'INPUT' || node.tagName === 'TEXTAREA'){
          node.readOnly = (!editing) || !!forceReadonly;
        }
      }catch(_e){ }
    }

    function mountItemTypeControl(){
      const div = getDivisionValue();
      const hasMap = Object.prototype.hasOwnProperty.call(ITEM_TYPES_BY_DIVISION, div);
      const isEmptyDiv = !String(div || '').trim();
      // UX: always show a dropdown affordance; disable until a supported division is chosen.
      const wantSelect = isEmptyDiv || hasMap;
      const prevValue = String(it.item_type || '').trim();

      itemTypeTd.innerHTML = '';
      if(wantSelect){
        itemTypeControl = buildSearchSelect({ role: 'item_type', placeholder: '품목유형', options: itemTypeOptionsForDivision(div), value: prevValue, disabled: (isEmptyDiv || !hasMap) });
      }else{
        itemTypeControl = buildInput(prevValue, { role: 'item_type' });
      }
      itemTypeTd.appendChild(itemTypeControl);
      bind('item_type', itemTypeControl, wantSelect ? 'select' : 'text');
      // Keep disabled when division isn't selected/supported (even in edit mode).
      applyControlEditingState(itemTypeControl, { forceDisabled: (wantSelect && (isEmptyDiv || !hasMap)) });

      // When item_type changes, model becomes dependent on a different master list.
      try{
        itemTypeControl.addEventListener('change', function(){
          it.item_type = String(itemTypeControl.value || '').trim();
          it.model = '';
          mountModelControl();
        });
      }catch(_e){ }

      if(wantSelect){
        try{ enhanceSearchableSelects(itemTypeTd); }catch(_e){ }
      }
    }

    function mountModelControl(){
      const div = getDivisionValue();
      const itemType = getItemTypeValue();
      const isEmptyDiv = !String(div || '').trim();
      const wantCatalog = isEmptyDiv || (div === DIVISION_HARDWARE || div === DIVISION_SOFTWARE || div === DIVISION_COMPONENT);
      const prevValue = String(it.model || '').trim();

      modelTd.innerHTML = '';
      if(wantCatalog){
        const src = getModelSourceFor(div, itemType);
        modelControl = buildSearchSelect({ role: 'model', placeholder: '모델명', sourceKey: TAB62_MODEL_CATALOG_SOURCE, value: prevValue, disabled: isEmptyDiv });
        try{
          modelControl.dataset.modelUrl = src ? src.url : '';
          if(src && src.valueKey) modelControl.dataset.valueKey = src.valueKey;
          else{ try{ delete modelControl.dataset.valueKey; }catch(_eDel){ } }
        }catch(_eAttr){ }
      }else{
        modelControl = buildInput(prevValue, { role: 'model' });
      }

      modelTd.appendChild(modelControl);
      bind('model', modelControl, wantCatalog ? 'select' : 'text');
      applyControlEditingState(modelControl, { forceDisabled: (wantCatalog && isEmptyDiv) });

      if(wantCatalog){
        try{ enhanceSearchableSelects(modelTd); }catch(_e){ }
      }
    }

    // number formatting
    function wireNumberInput(input, compute){
      if (!input) return;
      input.addEventListener('input', function(){
        input.value = formatIntLike(digitsOnly(input.value));
        if (compute) compute();
      });
      input.addEventListener('blur', function(){
        input.value = formatIntLike(digitsOnly(input.value));
        if (compute) compute();
      });
    }

    function computeTcoFromRow(){
      var totalVal = parseInt(digitsOnly(totalPrice.value), 10) || 0;
      var rateVal = parseFloat(digitsOnly(rate.value)) || 0;
      var months = parseInt(digitsOnly(freeSupportMonths.value), 10) || 0;
      if(!months){
        // 무상기간이 없으면 TCO 계산 불가
        tco.value = '';
        tco.dataset.raw = '';
        it.tco = '';
        try{
          var _tcoTd = tco.closest ? tco.closest('td') : null;
          if(_tcoTd){ var _vt = _tcoTd.querySelector('.tab62-view-text'); if(_vt) _vt.textContent = ''; }
        }catch(_e2){}
        return;
      }
      var years = months / 12;
      var remainYears = 5 - years;
      if(remainYears < 0) remainYears = 0;
      var tcoVal = 0;
      if(totalVal){
        tcoVal = totalVal + Math.round(totalVal * (rateVal / 100) * remainYears);
      }
      tco.value = tcoVal ? formatIntLike(tcoVal) : '';
      tco.dataset.raw = tcoVal ? String(tcoVal) : '';
      it.tco = tcoVal ? String(tcoVal) : '';
      try{
        var tcoTd = tco.closest ? tco.closest('td') : null;
        if(tcoTd){
          var vt = tcoTd.querySelector('.tab62-view-text');
          if(vt) vt.textContent = tcoVal ? formatIntLike(tcoVal) : '';
        }
      }catch(_e){}
    }

    wireNumberInput(unitPrice, function(){ computeTotalFromRow(tr); it.unit_price = digitsOnly(unitPrice.value); it.quantity = digitsOnly(quantity.value); it.total_price = (totalPrice && totalPrice.dataset && totalPrice.dataset.raw) ? String(totalPrice.dataset.raw || '') : digitsOnly(totalPrice.value); computeTcoFromRow(); try{ tr.dispatchEvent(new Event('tab62:totalchange', {bubbles:true})); }catch(_e){} });
    wireNumberInput(quantity, function(){ computeTotalFromRow(tr); it.unit_price = digitsOnly(unitPrice.value); it.quantity = digitsOnly(quantity.value); it.total_price = (totalPrice && totalPrice.dataset && totalPrice.dataset.raw) ? String(totalPrice.dataset.raw || '') : digitsOnly(totalPrice.value); computeTcoFromRow(); try{ tr.dispatchEvent(new Event('tab62:totalchange', {bubbles:true})); }catch(_e){} });
    // rate: numeric-only (digits + formatting)
    wireNumberInput(rate, function(){ it.rate = digitsOnly(rate.value); computeTcoFromRow(); try{ tr.dispatchEvent(new Event('tab62:totalchange', {bubbles:true})); }catch(_e){} });
    // 무상기간: numeric-only manual input, triggers TCO recompute
    wireNumberInput(freeSupportMonths, function(){ it.free_support_months = digitsOnly(freeSupportMonths.value); computeEndDate(); computeTcoFromRow(); try{ tr.dispatchEvent(new Event('tab62:totalchange', {bubbles:true})); }catch(_e){} });

    bind('contract_type', typeSel, 'select');
    bind('contract_division', divisionSel, 'select');
    bind('supplier', supplier, 'text');
    bind('manufacturer', manufacturer, 'text');
    bind('specification', specification, 'text');
    bind('rate', rate, 'int');
    bind('free_support_months', freeSupportMonths, 'int');
    // date fields (flatpickr) — no longer auto-compute months
    bind('support_start_date', startDate, 'text');
    bind('support_end_date', endDate, 'text');
    // startDate change -> recompute endDate
    try{
      startDate.addEventListener('change', function(){ computeEndDate(); });
      startDate.addEventListener('input', function(){ computeEndDate(); });
    }catch(_e){ }
    bind('project_no', projectNo, 'text');

    // Dependent controls: contract_division -> item_type -> model
    mountItemTypeControl();
    mountModelControl();
    try{
      divisionSel.addEventListener('change', function(){
        it.contract_division = String(divisionSel.value || '').trim();
        it.item_type = '';
        it.model = '';
        mountItemTypeControl();
        mountModelControl();
      });
    }catch(_e){ }

    computeTotalFromRow(tr);
    it.total_price = totalPrice.dataset.raw || '';

    initRowDatePickers(tr);
    // initial end-date compute
    try{ computeEndDate(); }catch(_e){ }
    // initial TCO compute
    try{ computeTcoFromRow(); }catch(_e){ }

    // default to view mode; draft rows can opt-in to editing
    setRowEditing(tr, !!it.__editing);

    return tr;
  }

  function itemKey(it){
    if(!it) return '';
    if(it.id != null && String(it.id)) return 'id:' + String(it.id);
    if(it.__key) return 'k:' + String(it.__key);
    return '';
  }

  function parseMoneyLike(v){
    const s = String(v == null ? '' : v);
    const digits = s.replace(/[^0-9-]/g,'');
    if(!digits) return 0;
    const n = parseInt(digits, 10);
    return Number.isNaN(n) ? 0 : n;
  }

  function computeItemTotalPrice(it){
    const total = parseMoneyLike(it && it.total_price);
    if(total) return total;
    const unit = parseMoneyLike(it && it.unit_price);
    const qty = parseMoneyLike(it && it.quantity);
    if(unit && qty) return unit * qty;
    return 0;
  }

  async function apiList(ctx){
    const params = {
      capex_type: (ctx && ctx.capexType) ? String(ctx.capexType) : '',
      manage_no: (ctx && ctx.manageNo) ? String(ctx.manageNo) : '',
    };
    const url = API_BASE + '?' + new URLSearchParams(params).toString();
    const data = await requestJson(url, { method: 'GET' });
    return (data && Array.isArray(data.items)) ? data.items : [];
  }

  async function apiCreate(payload){
    const data = await requestJson(API_BASE, { method: 'POST', body: JSON.stringify(payload) });
    return data.item;
  }

  async function apiUpdate(id, payload){
    const data = await requestJson(API_BASE + '/' + encodeURIComponent(String(id)), { method: 'PUT', body: JSON.stringify(payload) });
    return data.item;
  }

  async function apiDelete(id){
    const data = await requestJson(API_BASE + '/' + encodeURIComponent(String(id)), { method: 'DELETE' });
    return data;
  }

  function initFromPage(){
    const table = document.getElementById('tab62-spec-table');
    if (!table) return false;

    // prevent double-binding under SPA events
    if (table.dataset && table.dataset.tab62Init === '1') return true;
    if (table.dataset) table.dataset.tab62Init = '1';

    const tbody = table.querySelector('tbody');
    const addBtn = document.getElementById('tab62-row-add');
    const emptyEl = document.getElementById('tab62-empty');
    const selectAll = document.getElementById('tab62-select-all');
    const downloadBtn = document.getElementById('tab62-download-btn');

    const infoEl = document.getElementById('tab62-pagination-info');
    const numWrap = document.getElementById('tab62-page-numbers');
    const btnFirst = document.getElementById('tab62-first');
    const btnPrev = document.getElementById('tab62-prev');
    const btnNext = document.getElementById('tab62-next');
    const btnLast = document.getElementById('tab62-last');

    const ctx = getContext();
    if (!ctx.manageNo || !ctx.capexType) {
      setEmptyVisible(emptyEl, true);
      return true;
    }

    const state = {
      items: [],
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      selectedKeys: new Set()
    };

    // Provide model options for the row-level dropdown (division-dependent)
    // Exposed on window so buildRow() can consume it without threading state through.
    try{
      window.__BlossomCapexTab62ModelOptionsProvider = function(division){
        const div = String(division || '').trim();
        if(!div) return [];
        const set = new Set();
        (state.items || []).forEach(function(it){
          if(!it) return;
          const d = String(it.contract_division || '').trim();
          if(d !== div) return;
          const m = String(it.model || '').trim();
          if(m) set.add(m);
        });
        return Array.from(set);
      };
    }catch(_e){ }

    function totalCount(){ return state.items.length; }
    function totalPages(){ return Math.max(1, Math.ceil(totalCount() / state.pageSize)); }
    function clampPage(){
      const pages = totalPages();
      if(state.page < 1) state.page = 1;
      if(state.page > pages) state.page = pages;
    }

    function syncSelectAll(){
      if(!selectAll) return;
      const checks = table.querySelectorAll('tbody .hw-row-check:not([disabled])');
      if(!checks.length){ selectAll.checked = false; return; }
      selectAll.checked = Array.prototype.every.call(checks, function(c){ return !!c.checked; });
    }

    function updateTotals(){
      try{
        const foot = table.querySelector('tfoot');
        if(!foot) return;
        const qtyCell = foot.querySelector('[data-total="quantity"]');
        const totalCell = foot.querySelector('[data-total="total_price"]');
        const tcoCell = foot.querySelector('[data-total="tco"]');

        let qty = 0;
        let total = 0;
        let tcoSum = 0;
        state.items.forEach(function(it){
          qty += parseMoneyLike(it && it.quantity);
          total += computeItemTotalPrice(it);
          tcoSum += parseMoneyLike(it && it.tco);
        });
        if(qtyCell) qtyCell.textContent = qty ? qty.toLocaleString('ko-KR') : '-';
        if(totalCell) totalCell.textContent = total ? total.toLocaleString('ko-KR') : '-';
        if(tcoCell) tcoCell.textContent = tcoSum ? tcoSum.toLocaleString('ko-KR') : '-';
      }catch(_e){ }
    }

    // Live footer recalc when user edits unit_price / quantity
    try{ table.addEventListener('tab62:totalchange', function(){ updateTotals(); }); }catch(_e){ }

    function renderPageNumbers(){
      if(!numWrap) return;
      const pages = totalPages();
      numWrap.innerHTML = '';

      const max = 7;
      let start = Math.max(1, state.page - Math.floor(max/2));
      let end = start + max - 1;
      if(end > pages){ end = pages; start = Math.max(1, end - max + 1); }

      for(let p=start; p<=end; p++){
        const b = document.createElement('button');
        b.className = 'page-btn' + (p === state.page ? ' active' : '');
        b.textContent = String(p);
        b.dataset.page = String(p);
        numWrap.appendChild(b);
      }
    }

    function updatePaginationUI(){
      const total = totalCount();
      const pages = totalPages();
      if(infoEl){
        const start = total ? ((state.page - 1) * state.pageSize + 1) : 0;
        const end = Math.min(total, state.page * state.pageSize);
        infoEl.textContent = start + '-' + end + ' / ' + total + '개 항목';
      }
      renderPageNumbers();
      if(btnFirst) btnFirst.disabled = (state.page === 1);
      if(btnPrev) btnPrev.disabled = (state.page === 1);
      if(btnNext) btnNext.disabled = (state.page === pages);
      if(btnLast) btnLast.disabled = (state.page === pages);
    }

    function render(){
      clampPage();
      if(tbody) tbody.innerHTML = '';

      const startIdx = (state.page - 1) * state.pageSize;
      const endIdx = Math.min(state.items.length, startIdx + state.pageSize);
      const slice = state.items.slice(startIdx, endIdx);

      slice.forEach(function(it){
        const k = itemKey(it);
        it.__selected = state.selectedKeys.has(k);
        const tr = buildRow(it);
        if(tbody) tbody.appendChild(tr);
        const cb = tr.querySelector('input.hw-row-check');
        if(cb){
          cb.checked = it.__selected;
          tr.classList.toggle('selected', !!cb.checked);
        }
      });

      setEmptyVisible(emptyEl, state.items.length === 0);
      updatePaginationUI();
      syncSelectAll();
      updateTotals();
    }

    function go(p){ state.page = p; render(); }
    function goDelta(d){ go(state.page + d); }
    function goFirst(){ go(1); }
    function goLast(){ go(totalPages()); }

    function getSelectedCount(){ return state.selectedKeys.size; }

    function refreshDownloadModalUi(){
      const rowSelectedWrap = document.getElementById('tab62-csv-range-row-selected');
      const optSelected = document.getElementById('tab62-csv-range-selected');
      const optAll = document.getElementById('tab62-csv-range-all');
      const subtitle = document.getElementById('tab62-download-subtitle');

      const total = totalCount();
      const selectedCount = getSelectedCount();

      if(subtitle){
        subtitle.textContent =
          selectedCount > 0
            ? '선택된 ' + selectedCount + '개 또는 전체 ' + total + '개 결과 중 범위를 선택하세요.'
            : '현재 결과 ' + total + '개 항목을 CSV로 내보냅니다.';
      }
      if(rowSelectedWrap) rowSelectedWrap.hidden = !(selectedCount > 0);
      if(optSelected){
        optSelected.disabled = !(selectedCount > 0);
        optSelected.checked = selectedCount > 0;
      }
      if(optAll) optAll.checked = !(selectedCount > 0);
    }

    function exportCSV(onlySelected){
      const selectedCount = getSelectedCount();
      if(onlySelected && selectedCount <= 0){
        toastSafe('선택된 행이 없습니다.');
        return;
      }

      const ths = Array.from(table.querySelectorAll('thead th'));
      const headerCells = ths.slice(1, Math.max(1, ths.length - 1));
      const headers = headerCells.map(th => String((th && th.textContent) ? th.textContent : '').trim());
      const lines = [];
      lines.push(headers.map(escapeCSV).join(','));

      const rows = (onlySelected ? state.items.filter(it => state.selectedKeys.has(itemKey(it))) : state.items);
      rows.forEach(function(it){
        const vals = [
          it.contract_type || '',
          it.contract_division || '',
          it.item_type || '',
          it.manufacturer || '',
          it.model || '',
          it.specification || '',
          it.supplier || '',
          formatIntLike(it.unit_price),
          formatIntLike(it.quantity),
          formatIntLike(computeItemTotalPrice(it)),
          it.rate || '',
          it.tco ? formatIntLike(it.tco) : '',
          formatIntLike(it.free_support_months),
          it.support_start_date || '',
          it.support_end_date || '',
          it.project_no || ''
        ];
        lines.push(vals.map(escapeCSV).join(','));
      });

      if(lines.length <= 1){
        toastSafe('내보낼 행이 없습니다.');
        return;
      }

      const stamp = (function(){
        try{
          const d = new Date();
          const y = d.getFullYear();
          const m = String(d.getMonth()+1).padStart(2,'0');
          const dd = String(d.getDate()).padStart(2,'0');
          const hh = String(d.getHours()).padStart(2,'0');
          const mm = String(d.getMinutes()).padStart(2,'0');
          return '' + y + m + dd + '_' + hh + mm;
        }catch(_e){ return ''; }
      })();

      const nameParts = [
        'capex_contract',
        ctx.capexType,
        ctx.manageNo,
        onlySelected ? 'selected' : 'all'
      ].map(safeFilenamePart).filter(Boolean);
      const filename = (nameParts.join('_') || 'capex_contract') + (stamp ? ('_' + stamp) : '') + '.csv';
      downloadCSV(filename, lines);
    }

    async function load(){
      try{
        const items = await apiList(ctx);
        state.items = (Array.isArray(items) ? items : []).map(function(it){
          const obj = it || {};
          if(!obj.__key) obj.__key = 'srv:' + String(obj.id != null ? obj.id : Math.random());
          obj.inspection_inbound = (obj.inspection_inbound ? true : false);
          return obj;
        });
        state.page = 1;
        render();
      }catch(err){
        state.items = [];
        state.page = 1;
        render();
        toastSafe((err && err.message) ? err.message : '조회 중 오류가 발생했습니다.');
      }
    }

    if (addBtn){
      addBtn.addEventListener('click', function(){
        const draft = { __key: 'draft:' + Date.now() + ':' + Math.round(Math.random()*1000000), __editing: true };
        state.items.push(draft);
        state.page = totalPages();
        render();
      });
    }

    if(selectAll){
      selectAll.addEventListener('change', function(){
        const checks = table.querySelectorAll('tbody .hw-row-check:not([disabled])');
        checks.forEach(function(c){
          c.checked = !!selectAll.checked;
          const tr = c.closest('tr');
          if(tr) tr.classList.toggle('selected', !!c.checked);
          const key = (tr && tr.dataset) ? ('id:' + (tr.dataset.id || '')) : '';
          const k2 = (tr && tr.dataset && tr.dataset.key) ? ('k:' + tr.dataset.key) : '';
          const k = (key && key !== 'id:') ? key : (k2 ? k2 : '');
          if(!k) return;
          if(c.checked) state.selectedKeys.add(k);
          else state.selectedKeys.delete(k);
        });
        try{ refreshDownloadModalUi(); }catch(_e){}
      });
    }

    if(numWrap && !numWrap.__tab62Wired){
      numWrap.__tab62Wired = true;
      numWrap.addEventListener('click', function(e){
        const b = e && e.target && e.target.closest ? e.target.closest('button.page-btn') : null;
        if(!b) return;
        const p = parseInt(String(b.dataset.page||''), 10);
        if(!Number.isNaN(p)) go(p);
      });
    }
    if(btnFirst && !btnFirst.__tab62Wired){ btnFirst.__tab62Wired = true; btnFirst.addEventListener('click', goFirst); }
    if(btnPrev && !btnPrev.__tab62Wired){ btnPrev.__tab62Wired = true; btnPrev.addEventListener('click', function(){ goDelta(-1); }); }
    if(btnNext && !btnNext.__tab62Wired){ btnNext.__tab62Wired = true; btnNext.addEventListener('click', function(){ goDelta(1); }); }
    if(btnLast && !btnLast.__tab62Wired){ btnLast.__tab62Wired = true; btnLast.addEventListener('click', goLast); }

    if(downloadBtn){
      const modalId = 'tab62-download-modal';
      const closeBtn = document.getElementById('tab62-download-close');
      const confirmBtn = document.getElementById('tab62-download-confirm');
      const modalEl = document.getElementById(modalId);

      downloadBtn.addEventListener('click', function(){
        downloadBtn.disabled = !(totalCount() > 0);
        downloadBtn.title = totalCount() > 0 ? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.';
        if(downloadBtn.disabled) return;
        try{ refreshDownloadModalUi(); }catch(_e){}
        openModalLocal(modalId);
      });

      if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalLocal(modalId); }); }
      if(modalEl){
        modalEl.addEventListener('click', function(e){ if(e && e.target === modalEl) closeModalLocal(modalId); });
        document.addEventListener('keydown', function(e){ if(e && e.key === 'Escape' && modalEl.classList.contains('show')) closeModalLocal(modalId); });
      }
      if(confirmBtn && !confirmBtn.__tab62Wired){
        confirmBtn.__tab62Wired = true;
        confirmBtn.addEventListener('click', function(){
          const onlySelected = !!(document.getElementById('tab62-csv-range-selected') && document.getElementById('tab62-csv-range-selected').checked);
          exportCSV(onlySelected);
          closeModalLocal(modalId);
        });
      }
    }

    table.addEventListener('click', function(ev){
      const onControl = ev.target && ev.target.closest ? ev.target.closest('input, select, button, a, textarea') : null;
      const onCheckbox = ev.target && ev.target.closest ? ev.target.closest('input[type="checkbox"].hw-row-check') : null;
      if(onCheckbox){
        const tr = onCheckbox.closest('tr');
        if(!tr) return;
        const id = tr.dataset && tr.dataset.id ? String(tr.dataset.id) : '';
        const key = tr.dataset && tr.dataset.key ? String(tr.dataset.key) : '';
        const k = id ? ('id:' + id) : (key ? ('k:' + key) : '');
        if(k){
          if(onCheckbox.checked) state.selectedKeys.add(k);
          else state.selectedKeys.delete(k);
        }
        tr.classList.toggle('selected', !!onCheckbox.checked);
        syncSelectAll();
        try{ refreshDownloadModalUi(); }catch(_e){}
        return;
      }
      if(!onControl){
        const tr2 = ev.target && ev.target.closest ? ev.target.closest('tr') : null;
        if(!tr2) return;
        const cb2 = tr2.querySelector('input[type="checkbox"].hw-row-check');
        if(!cb2 || cb2.disabled) return;
        cb2.checked = !cb2.checked;
        const id2 = tr2.dataset && tr2.dataset.id ? String(tr2.dataset.id) : '';
        const key2 = tr2.dataset && tr2.dataset.key ? String(tr2.dataset.key) : '';
        const kk = id2 ? ('id:' + id2) : (key2 ? ('k:' + key2) : '');
        if(kk){
          if(cb2.checked) state.selectedKeys.add(kk);
          else state.selectedKeys.delete(kk);
        }
        tr2.classList.toggle('selected', !!cb2.checked);
        syncSelectAll();
        try{ refreshDownloadModalUi(); }catch(_e){}
      }
    });

    table.addEventListener('click', async function(ev){
      const btn = ev.target && ev.target.closest ? ev.target.closest('.js-tab62-edit, .js-tab62-save, .js-tab62-del') : null;
      if (!btn) return;
      const tr = btn.closest('tr');
      if (!tr) return;

      if (btn.classList.contains('js-tab62-edit')){
        try{ setRowEditing(tr, true); }catch(_e){}
        // reflect into state
        try{
          const id = tr.dataset && tr.dataset.id ? parseInt(String(tr.dataset.id), 10) : 0;
          const key = tr.dataset && tr.dataset.key ? String(tr.dataset.key) : '';
          const idx = state.items.findIndex(function(x){ return (x && x.id != null && id && x.id === id) || (key && x && x.__key === key); });
          if(idx >= 0) state.items[idx].__editing = true;
        }catch(_e){}
        return;
      }

      if (btn.classList.contains('js-tab62-save')){
        try{
          const id = tr.dataset && tr.dataset.id ? parseInt(String(tr.dataset.id), 10) : 0;
          const key = tr.dataset && tr.dataset.key ? String(tr.dataset.key) : '';
          const payload = readRowPayload(tr, ctx, state);

          // Guard against accidental null overwrite on update.
          // If a critical field is empty in payload due to UI/select desync,
          // keep the existing DB/state value unless user explicitly cleared the select.
          if(id){
            try{
              const idxExisting = state.items.findIndex(function(x){ return (x && x.id != null && x.id === id) || (key && x && x.__key === key); });
              const existing = idxExisting >= 0 ? (state.items[idxExisting] || null) : null;
              if(existing){
                const protectedFields = [
                  'contract_type',
                  'contract_division',
                  'item_type',
                  'supplier',
                  'manufacturer',
                  'unit_price',
                  'rate',
                  'free_support_months',
                  'support_start_date',
                  'support_end_date'
                ];

                protectedFields.forEach(function(field){
                  const incoming = payload[field];
                  const current = existing[field];
                  const incomingEmpty = (incoming == null || String(incoming).trim() === '');
                  const currentHas = !(current == null || String(current).trim() === '');
                  if(!incomingEmpty || !currentHas) return;

                  let userCleared = false;
                  try{
                    const node = tr.querySelector('[data-role="' + field + '"]');
                    userCleared = !!(node && node.dataset && node.dataset.userCleared === '1');
                  }catch(_eNode){ userCleared = false; }

                  if(!userCleared){
                    payload[field] = current;
                  }
                });
              }
            }catch(_eProtect){ }
          }

          const saved = id ? await apiUpdate(id, payload) : await apiCreate(payload);
          if (saved && saved.id != null) tr.dataset.id = String(saved.id);

          // merge back into state
          const idx = state.items.findIndex(function(x){ return (x && x.id != null && id && x.id === id) || (key && x && x.__key === key); });
          if(idx >= 0){
            const next = { ...(state.items[idx] || {}), ...(saved || {}) };
            if(!next.__key) next.__key = key || ('srv:' + String(next.id));
            next.inspection_inbound = (String(payload.inspection_inbound||'').trim() === 'O');
            next.__editing = false;
            state.items[idx] = next;
          }

          // normalize rendered numeric fields
          try {
            const unitEl = tr.querySelector('input[data-role="unit_price"]');
            const qtyEl = tr.querySelector('input[data-role="quantity"]');
            const totalEl = tr.querySelector('input[data-role="total_price"]');
            if (unitEl) unitEl.value = formatIntLike(saved.unit_price);
            if (qtyEl) qtyEl.value = formatIntLike(saved.quantity);
            if (totalEl) { totalEl.value = formatIntLike(saved.total_price); totalEl.dataset.raw = saved.total_price == null ? '' : String(saved.total_price); }
          } catch (_e) {}

          updateTotals();
          try{ setRowEditing(tr, false); }catch(_e){}
        }catch(err){
          toastSafe((err && err.message) ? err.message : '저장에 실패했습니다.');
        }
        return;
      }

      if (btn.classList.contains('js-tab62-del')){
        const id = tr.dataset && tr.dataset.id ? parseInt(String(tr.dataset.id), 10) : 0;
        if (!id){
          // draft
          const key = tr.dataset && tr.dataset.key ? String(tr.dataset.key) : '';
          state.items = state.items.filter(function(it){ return !(key && it && it.__key === key); });
          render();
          return;
        }
        try{
          await apiDelete(id);
          state.items = state.items.filter(function(it){ return !(it && it.id === id); });
          state.selectedKeys.delete('id:' + String(id));
          render();
        }catch(err){
          toastSafe((err && err.message) ? err.message : '삭제에 실패했습니다.');
        }
      }
    });

    load();
    return true;
  }

  window.BlossomCapexTab62 = { initFromPage };
  window.BlossomCapexTab62.__version = VERSION;

  function ready(fn){ if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }

  ready(function(){ try{ initFromPage(); }catch(_e){} });
  document.addEventListener('blossom:pageLoaded', function(){ try{ initFromPage(); }catch(_e){} });
})();

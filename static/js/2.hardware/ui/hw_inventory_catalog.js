(function(){
  'use strict';

  // Global helper for inventory-schema hardware tables:
  // - type select (CPU/GPU/MEMORY/DISK/NIC/HBA/ETC)
  // - model searchable dropdown (panel)
  // - spec/vendor auto-fill from cmp_*_type endpoints
  // Designed to be safe to load on every page; does nothing unless called.

  if(window.BlossomHwInventoryCatalog){
    return;
  }

  var HW_TYPE_API = {
    'CPU': '/api/cmp-cpu-types',
    'GPU': '/api/cmp-gpu-types',
    'MEMORY': '/api/cmp-memory-types',
    'DISK': '/api/cmp-disk-types',
    'NIC': '/api/cmp-nic-types',
    'HBA': '/api/cmp-hba-types',
    'ETC': '/api/cmp-etc-types'
  };

  // Previously this helper injected CSS at runtime, but that caused unwanted style overrides.
  // Keep a no-op to avoid ReferenceError from older call sites.
  function injectStylesOnce(){ }

  function normalizeHwType(v){
    var raw = String(v == null ? '' : v).trim().toUpperCase();
    if(HW_TYPE_API[raw]) return raw;
    try{
      var keys = Object.keys(HW_TYPE_API);
      for(var i=0;i<keys.length;i++){
        var k = keys[i];
        if(k && raw.indexOf(k) !== -1) return k;
      }
    }catch(_e){ }
    return '';
  }

  function normStr(v){ return String(v == null ? '' : v).trim(); }
  function lowerKey(v){ return normStr(v).toLowerCase(); }

  function pickModel(it){ return normStr((it && (it.model_name || it.model || it.name || it.label)) || ''); }
  function pickSpec(it){ return normStr((it && (it.spec || it.detail_spec || it.spec_detail || it.detail || it.description)) || ''); }
  function pickVendor(it){ return normStr((it && (it.vendor || it.maker || it.manufacturer)) || ''); }

  // Search panel + per-input metadata
  var metaMap = new WeakMap();
  var panelEl = null;
  var panelOpen = false;
  var active = null; // { input, tr, kind }
  var aborter = null;
  var timer = 0;
  var SEARCH_DELAY = 120;
  var SEARCH_MAX = 10;

  // Model cache for autofill
  var lastModel = { type:'', q:'', items:[] };

  function ensurePanel(){
    if(panelEl) return panelEl;

    var panel = document.createElement('div');
    panel.className = 'fk-search-panel hw-search-panel';
    panel.setAttribute('role','dialog');
    panel.setAttribute('aria-modal','false');
    panel.hidden = true;

    var header = document.createElement('div');
    header.className = 'fk-search-panel__header';

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'fk-search-panel__input';
    input.placeholder = '검색어 입력';
    input.autocomplete = 'off';

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'fk-search-panel__close';
    closeBtn.textContent = '닫기';

    header.appendChild(input);
    header.appendChild(closeBtn);

    var loadingEl = document.createElement('div');
    loadingEl.className = 'search-select-loading';
    loadingEl.style.cssText = 'display:none;padding:8px 12px;align-items:center;gap:6px;font-size:13px;color:#9ca3af;';
    var _sp = document.createElement('span');
    _sp.style.cssText = 'display:inline-block;width:14px;height:14px;border:2px solid #e5e7eb;border-top-color:#6366f1;border-radius:50%;animation:hw-spin .6s linear infinite;';
    loadingEl.appendChild(_sp);
    if(!document.getElementById('hw-spin-kf')){
      var _st = document.createElement('style'); _st.id = 'hw-spin-kf';
      _st.textContent = '@keyframes hw-spin{to{transform:rotate(360deg)}}';
      document.head.appendChild(_st);
    }

    var listEl = document.createElement('div');
    listEl.className = 'fk-search-panel__list';
    listEl.setAttribute('role','listbox');

    var emptyEl = document.createElement('div');
    emptyEl.className = 'fk-search-panel__empty';
    emptyEl.textContent = '검색어를 입력해 주세요.';

    panel.appendChild(header);
    panel.appendChild(loadingEl);
    panel.appendChild(listEl);
    panel.appendChild(emptyEl);

    panel.__hw = { input:input, closeBtn:closeBtn, loadingEl:loadingEl, listEl:listEl, emptyEl:emptyEl };

    closeBtn.addEventListener('click', function(ev){ ev.preventDefault(); closePanel(); });
    input.addEventListener('input', function(){ scheduleSearch(); });
    input.addEventListener('keydown', function(ev){
      if(ev.key === 'Escape'){ ev.preventDefault(); closePanel(); return; }
      if(ev.key === 'Enter'){
        ev.preventDefault();
        var manual = (input.value || '').trim();
        if(manual) applyValue(manual, { manual:true });
      }
    });
    listEl.addEventListener('click', function(ev){
      var btn = ev.target.closest('.fk-search-panel__item');
      if(!btn) return;
      ev.preventDefault();
      var val = (btn.dataset && btn.dataset.value) ? btn.dataset.value : '';
      if(val) applyValue(val, { manual:false });
    });

    document.addEventListener('click', function(ev){
      if(!panelOpen) return;
      if(panel.contains(ev.target)) return;
      var a = active;
      if(a){
        var m = metaMap.get(a.input);
        if(m && m.wrapper && m.wrapper.contains(ev.target)) return;
      }
      closePanel();
    }, true);

    window.addEventListener('resize', function(){ if(panelOpen) closePanel(); });
    window.addEventListener('scroll', function(ev){
      if(!panelOpen) return;
      var t = ev && ev.target;
      if(t && panel.contains(t)) return;
      closePanel();
    }, true);

    document.body.appendChild(panel);
    panelEl = panel;
    return panelEl;
  }

  function positionPanel(anchor){
    var panel = ensurePanel();
    var rect = anchor.getBoundingClientRect();
    var margin = 8;
    panel.style.minWidth = Math.max(260, rect.width) + 'px';
    var w = panel.offsetWidth || 320;
    var h = panel.offsetHeight || 320;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var left = rect.left;
    if(left + w > vw - 16) left = vw - w - 16;
    left = Math.max(12, left);
    var top = rect.bottom + margin;
    if(top + h > vh - 16) top = Math.max(12, rect.top - h - margin);
    panel.style.left = Math.round(left) + 'px';
    panel.style.top = Math.round(top) + 'px';
  }

  function openPanel(inputEl, tr, kind){
    var panel = ensurePanel();
    var p = panel.__hw;

    active = { input:inputEl, tr:tr, kind:kind || 'model' };
    panelOpen = true;
    panel.hidden = false;

    var m = metaMap.get(inputEl);
    if(m && m.displayBtn){
      m.displayBtn.setAttribute('aria-expanded','true');
      m.displayBtn.classList.add('is-open');
    }

    p.loadingEl.style.display = 'none';
    p.listEl.innerHTML = '';

    var _curQ = (inputEl.value || '').trim();
    p.input.value = _curQ;
    if(_curQ){
      p.emptyEl.hidden = true;
    } else {
      p.emptyEl.textContent = '검색어를 입력해 주세요.';
      p.emptyEl.hidden = false;
    }

    positionPanel((m && m.wrapper) ? m.wrapper : (m && m.displayBtn ? m.displayBtn : inputEl));
    setTimeout(function(){ try{ p.input.focus(); }catch(_){ } }, 0);

    scheduleSearch();
  }

  function closePanel(){
    if(!panelOpen) return;
    panelOpen = false;
    if(timer) clearTimeout(timer);
    timer = 0;
    try{ if(aborter && typeof aborter.abort === 'function') aborter.abort(); }catch(_){ }
    aborter = null;

    var panel = ensurePanel();
    panel.hidden = true;
    panel.__hw.loadingEl.style.display = 'none';

    var a = active;
    active = null;
    if(a){
      var m = metaMap.get(a.input);
      if(m && m.displayBtn){
        m.displayBtn.setAttribute('aria-expanded','false');
        m.displayBtn.classList.remove('is-open');
      }
    }
  }

  function setLoading(on){
    var panel = ensurePanel();
    panel.__hw.loadingEl.style.display = on ? 'flex' : 'none';
    panel.__hw.listEl.setAttribute('aria-busy', on ? 'true' : 'false');
  }

  function fetchItems(type, q, kind, signal){
    var url = HW_TYPE_API[type];
    if(!url) return Promise.resolve([]);
    var qs = '?q=' + encodeURIComponent(q || '') + '&kind=' + encodeURIComponent(kind || 'model');
    return fetch(url + qs, { headers:{'Accept':'application/json'}, signal: signal })
      .then(function(res){ return res.ok ? res.json() : null; })
      .then(function(data){
        var items = (data && (data.items || data.rows || data.data)) || [];
        if(!Array.isArray(items)) items = [];
        if(kind === 'model') lastModel = { type:type, q:q, items:items };
        return items;
      })
      .catch(function(){ return []; });
  }

  function buildResults(items, kind){
    var seen = Object.create(null);
    var out = [];
    for(var i=0;i<items.length;i++){
      var it = items[i] || {};
      var label = '';
      var meta = '';
      if(kind === 'model'){
        label = pickModel(it);
        var v = pickVendor(it);
        var s = pickSpec(it);
        // Requested display order: 모델명, 용량, 제조사
        meta = [s, v].filter(Boolean).join(' · ');
      } else if(kind === 'spec'){
        label = pickSpec(it);
        meta = [pickModel(it), pickVendor(it)].filter(Boolean).join(' · ');
      } else if(kind === 'vendor'){
        label = pickVendor(it);
        meta = [pickModel(it)].filter(Boolean).join(' · ');
      }
      label = normStr(label);
      if(!label) continue;
      if(seen[label]) continue;
      seen[label] = 1;
      // Keep value as the actual form value (model/spec/vendor).
      // Render as a single line (MODEL · SPEC · VENDOR) to match on-premise and avoid per-page CSS layout differences.
      var display = meta ? (label + ' · ' + meta) : label;
      out.push({ label:display, meta:'', value:label });
      if(out.length >= SEARCH_MAX) break;
    }
    return out;
  }

  function renderResults(results){
    var panel = ensurePanel();
    var p = panel.__hw;
    p.listEl.innerHTML = '';

    var current = (active && active.input) ? normStr(active.input.value) : '';

    if(!results.length){
      p.emptyEl.hidden = false;
      p.emptyEl.textContent = '검색 결과가 없습니다.';
      return;
    }

    p.emptyEl.hidden = true;
    results.forEach(function(r, idx){
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fk-search-panel__item search-select-option';
      btn.dataset.index = String(idx);
      btn.dataset.value = r.value;
      btn.setAttribute('role','option');
      btn.setAttribute('aria-selected', (r.value === current) ? 'true' : 'false');
      if(r.value === current) btn.classList.add('selected','is-selected');

      var labelSpan = document.createElement('span');
      labelSpan.className = 'option-label';
      labelSpan.textContent = r.label;
      btn.appendChild(labelSpan);

      p.listEl.appendChild(btn);
    });
  }

  function scheduleSearch(){
    if(!active) return;
    var panel = ensurePanel();
    var p = panel.__hw;
    var q = (p.input.value || '').trim();
    var kind = active.kind || 'model';
    var tr = active.tr;

    if(timer) clearTimeout(timer);
    timer = setTimeout(function(){
      timer = 0;

      var typeSel = tr ? tr.querySelector('td[data-col="type"] select') : null;
      var typeTd = tr ? tr.querySelector('td[data-col="type"]') : null;
      var typeVal = typeSel ? typeSel.value : (typeTd ? (typeTd.textContent || '') : '');
      var type = normalizeHwType(typeVal);

      if(kind !== 'model') kind = 'model';
      if(!type){
        p.listEl.innerHTML = '';
        p.emptyEl.hidden = false;
        p.emptyEl.textContent = '유형을 먼저 선택해 주세요.';
        setLoading(false);
        return;
      }

      try{ if(aborter && typeof aborter.abort === 'function') aborter.abort(); }catch(_){ }
      aborter = null;
      var controller = null;
      try{ controller = window.AbortController ? new AbortController() : null; }catch(_){ controller = null; }
      if(controller) aborter = controller;

      setLoading(true);
      fetchItems(type, q, kind, controller ? controller.signal : undefined)
        .then(function(items){
          setLoading(false);
          renderResults(buildResults(items, kind));
        });
    }, SEARCH_DELAY);
  }

  function syncControl(inputEl){
    var m = metaMap.get(inputEl);
    if(!m) return;
    var v = normStr(inputEl.value);
    if(v === '-' || v === '—') v = '';
    var placeholder = m.placeholder || '선택';
    m.displayBtn.textContent = v ? v : placeholder;
    m.displayBtn.title = v ? v : placeholder;
    m.displayBtn.classList.toggle('has-value', !!v);
    if(m.clearBtn){
      m.clearBtn.hidden = !v;
    }
  }

  function applyAutofillFromItem(tr, it){
    try{
      if(!tr || !it) return;
      var specVal = pickSpec(it);
      var vendorVal = pickVendor(it);
      var specInput = tr.querySelector('td[data-col="spec"] input');
      var vendorInput = tr.querySelector('td[data-col="vendor"] input');
      if(specInput){ specInput.value = specVal || ''; syncControl(specInput); }
      if(vendorInput){ vendorInput.value = vendorVal || ''; syncControl(vendorInput); }
    }catch(_e){ }
  }

  function tryAutofillFromModel(tr, typeRaw, modelRaw){
    var type = normalizeHwType(typeRaw);
    var modelVal = normStr(modelRaw);
    if(!type || !modelVal) return;

    try{
      var items = (lastModel && lastModel.type === type) ? (lastModel.items || []) : [];
      for(var i=0;i<items.length;i++){
        var it = items[i] || {};
        if(lowerKey(pickModel(it)) === lowerKey(modelVal)){
          applyAutofillFromItem(tr, it);
          return;
        }
      }
    }catch(_e){ }

    var url = HW_TYPE_API[type];
    if(!url) return;
    fetch(url + '?q=' + encodeURIComponent(modelVal), { headers:{'Accept':'application/json'} })
      .then(function(res){ return res.ok ? res.json() : null; })
      .then(function(data){
        var items2 = (data && (data.items || data.rows || data.data)) || [];
        if(!Array.isArray(items2)) items2 = [];
        for(var j=0;j<items2.length;j++){
          var it2 = items2[j] || {};
          if(lowerKey(pickModel(it2)) === lowerKey(modelVal)){
            applyAutofillFromItem(tr, it2);
            break;
          }
        }
      })
      .catch(function(){ /* ignore */ });
  }

  function applyValue(value){
    if(!active) return;
    var inputEl = active.input;
    var tr = active.tr;
    inputEl.value = value;
    try{ inputEl.dispatchEvent(new Event('change', { bubbles:true })); }catch(_){ }
    syncControl(inputEl);
    closePanel();

    // Auto-fill when selecting model
    try{
      var typeSel = tr ? tr.querySelector('td[data-col="type"] select') : null;
      var typeTd = tr ? tr.querySelector('td[data-col="type"]') : null;
      var typeVal = typeSel ? typeSel.value : (typeTd ? (typeTd.textContent || '') : '');
      tryAutofillFromModel(tr, typeVal, value);
    }catch(_e){ }
  }

  function enhanceInput(tr, kind, placeholder){
    var td = tr ? tr.querySelector('td[data-col="'+kind+'"]') : null;
    if(!td) return;
    var inputEl = td.querySelector('input');
    if(!inputEl) return;

    if(inputEl.dataset.hwSearchEnhanced === '1'){
      syncControl(inputEl);
      return;
    }

    injectStylesOnce();

    var wrapper = document.createElement('div');
    wrapper.className = 'fk-searchable-control hw-search-control';

    var displayBtn = document.createElement('button');
    displayBtn.type = 'button';
    displayBtn.className = 'fk-searchable-display';
    displayBtn.setAttribute('aria-haspopup','dialog');
    displayBtn.setAttribute('aria-expanded','false');
    displayBtn.dataset.placeholder = placeholder || '선택';

    // On-premise behavior:
    // - 모델명: "지움" 버튼 유지
    // - 용량/제조사: 지움 없음 (자동/비활성)
    var clearBtn = null;
    if(kind === 'model'){
      clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'fk-searchable-clear';
      clearBtn.setAttribute('aria-label','선택 해제');
      clearBtn.title = '선택 해제';
      clearBtn.textContent = '지움';
      clearBtn.hidden = true;
    }

    td.insertBefore(wrapper, inputEl);
    wrapper.appendChild(displayBtn);
    if(clearBtn) wrapper.appendChild(clearBtn);
    wrapper.appendChild(inputEl);

    inputEl.classList.add('fk-search-native-hidden');
    inputEl.setAttribute('aria-hidden','true');
    inputEl.readOnly = true;
    inputEl.dataset.hwSearchEnhanced = '1';

    metaMap.set(inputEl, { wrapper:wrapper, displayBtn:displayBtn, clearBtn:clearBtn, placeholder:(placeholder||'선택') });

    // For auto-filled readonly fields (spec/vendor), keep the display non-interactive.
    // Model input remains interactive.
    if(kind !== 'model' && inputEl.disabled){
      try{ displayBtn.disabled = true; }catch(_e0){ }
      // Force a consistent disabled look (grey box) without injecting CSS.
      try{
        // Lighter grey like on-premise disabled inputs
        displayBtn.style.background = '#f3f5f9';
        displayBtn.style.border = '1px solid #e1e5ef';
        displayBtn.style.color = '#9aa3b7';
        displayBtn.style.cursor = 'not-allowed';
      }catch(_eStyle){ }
    }

    displayBtn.addEventListener('click', function(ev){
      ev.preventDefault();
      if(displayBtn.disabled || inputEl.disabled) return;
      openPanel(inputEl, tr, kind);
    });

    if(clearBtn){
      clearBtn.addEventListener('click', function(ev){
        ev.preventDefault();
        closePanel();
        inputEl.value = '';
        try{ inputEl.dispatchEvent(new Event('change', { bubbles:true })); }catch(_){ }
        syncControl(inputEl);
      });
    }

    syncControl(inputEl);
  }

  function enhanceRow(tr){
    try{
      // Ensure type select is enhanced by global searchable_select
      var typeSel = tr ? tr.querySelector('td[data-col="type"] select') : null;
      if(typeSel){
        try{ typeSel.classList.add('search-select'); }catch(_){ }
        try{ typeSel.setAttribute('data-searchable-scope','page'); }catch(_){ }
        try{ if(!typeSel.getAttribute('data-placeholder')) typeSel.setAttribute('data-placeholder','유형 선택 (필수)'); }catch(_){ }
        if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
          window.BlossomSearchableSelect.syncAll(typeSel);
        }
      }
      enhanceInput(tr, 'model', '모델명 (필수)');
      // spec/vendor are auto-filled and may be disabled, but still show current values via display controls.
      enhanceInput(tr, 'spec', '용량(자동)');
      enhanceInput(tr, 'vendor', '제조사(자동)');
    }catch(_e){ }
  }

  function bindTable(table){
    if(!table) return;
    if(table.__hwInventoryCatalogBound) return;
    table.__hwInventoryCatalogBound = true;

    table.addEventListener('change', function(ev){
      var typeSel = ev.target.closest('td[data-col="type"] select');
      if(typeSel){
        var tr = typeSel.closest('tr');
        if(!tr) return;
        // Reset dependent fields when type changes
        var mi = tr.querySelector('td[data-col="model"] input');
        var si = tr.querySelector('td[data-col="spec"] input');
        var vi = tr.querySelector('td[data-col="vendor"] input');
        function clear(inputEl){
          if(!inputEl) return;
          inputEl.value = '';
          try{ inputEl.dispatchEvent(new Event('change', { bubbles:true })); }catch(_){ }
          try{ syncControl(inputEl); }catch(_e){ }
        }
        clear(mi);
        clear(si);
        clear(vi);
        // If panel is open for this row, re-run using new type
        try{
          if(active && active.tr === tr){ scheduleSearch(); }
        }catch(_e2){ }
        return;
      }

      var modelInput = ev.target.closest('td[data-col="model"] input');
      if(modelInput){
        var tr2 = modelInput.closest('tr');
        if(!tr2) return;
        var ts = tr2.querySelector('td[data-col="type"] select');
        var ttd = tr2.querySelector('td[data-col="type"]');
        var tv = ts ? ts.value : (ttd ? (ttd.textContent || '') : '');
        tryAutofillFromModel(tr2, tv, modelInput.value);
      }
    });
  }

  window.BlossomHwInventoryCatalog = {
    normalizeHwType: normalizeHwType,
    enhanceRow: enhanceRow,
    bindTable: bindTable,
    tryAutofillFromModel: tryAutofillFromModel
  };
})();

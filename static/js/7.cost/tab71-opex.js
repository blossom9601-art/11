// Cost Management (OPEX/CAPEX) - Contract tab (tab61) persistence via API
(function(){
  'use strict';

  const VERSION = '20260209-1';
  if(window.BlossomTab61Contract && window.BlossomTab61Contract.__version === VERSION) return;

  const CONTRACT_STATUS_OPTIONS = ['예정','계약','만료','해지'];

  function getLastNonZeroMonthFromItem(item){
    if(!item) return null;
    let last = null;
    for(let i=1;i<=12;i++){
      const k = 'm' + String(i).padStart(2,'0');
      const n = toIntOrNull(item[k]);
      if(n != null && n > 0) last = i;
    }
    return last;
  }

  function computeAutoContractStatus(item, year){
    try{
      const current = normStr(item && item.contract_status);
      if(current === '해지') return '해지';

      const lastMonth = getLastNonZeroMonthFromItem(item);
      if(!lastMonth) return current || (item && item.contract_status) || '';

      const now = new Date();
      const nowYear = now.getFullYear();
      const nowMonth = now.getMonth() + 1;

      // Rule: if costs end before the current month in the current year, auto-expire.
      if(parseInt(String(year||0),10) === nowYear && nowMonth > lastMonth) return '만료';

      return current || (item && item.contract_status) || '';
    }catch(_){
      return (item && item.contract_status) || '';
    }
  }

  function applyAutoStatusToItem(item, year){
    if(!item) return item;
    const next = computeAutoContractStatus(item, year);
    if(next && String(next) !== String(item.contract_status||'')) item.contract_status = next;
    return item;
  }

  // ===== Searchable select sources (FK-like dropdowns) =====
  // Primary source for component dropdowns: current asset's tab01-hardware rows.
  // We do NOT use global suggestions for component fields because they can leak
  // unrelated types (e.g. CPU) that aren't present in the selected asset.
  let _tab61ResolvedHardwareIdPromise = null;
  let _tab61ResolvedHardwareId = null;
  let _tab61ResolvedHardwareAsset = null;
  const _tab61ComponentCatalogByHardwareId = Object.create(null);
  const _tab61HardwareAssetByHardwareId = Object.create(null);
  const _tab61ResolveHardwareByWorkName = Object.create(null);

  const _TAB61_ALLOWED_HARDWARE_CATEGORIES = ['SERVER','SECURITY','NETWORK','STORAGE','SAN'];

  function safeJsonParse(raw){
    try{ return raw ? JSON.parse(raw) : null; }catch(_e){ return null; }
  }

  function readStorageKeys(stores){
    const keys = [];
    (stores||[]).forEach(function(store){
      if(!store) return;
      try{
        for(let i=0;i<store.length;i++){
          const k = store.key(i);
          if(k) keys.push({ store: store, key: k });
        }
      }catch(_e){ }
    });
    return keys;
  }

  function tryParsePositiveInt(v){
    const n = parseInt(String(v==null?'':v).trim(), 10);
    return (!isNaN(n) && n > 0) ? n : null;
  }

  function resolveHardwareIdFromUrl(){
    try{
      const sp = new URLSearchParams(window.location.search || '');
      const cand = sp.get('hardware_id') || sp.get('hardwareId') || sp.get('asset_id') || sp.get('assetId') || sp.get('id');
      return tryParsePositiveInt(cand);
    }catch(_e){
      return null;
    }
  }

  function getMainManageNo(){
    try{
      const main = document.querySelector('main.main-content');
      const mn = main && main.dataset ? (main.dataset.manageNo || main.dataset.manage_no) : '';
      if(mn && String(mn).trim()) return String(mn).trim();
      const attr = main ? (main.getAttribute('data-manage-no') || '') : '';
      if(attr && String(attr).trim()) return String(attr).trim();
    }catch(_e){ }
    return '';
  }

  function getPageHeaderTitle(){
    try{
      const el = document.getElementById('page-header-title');
      const t = el ? (el.textContent || '') : '';
      return String(t||'').trim();
    }catch(_e){
      return '';
    }
  }

  function inferHardwareAssetCategoryFromQuery(q){
    const s = normStr(q).toUpperCase();
    if(!s) return 'SERVER';

    // Heuristics to reduce category probes.
    if(/\b(FIREWALL|WAF|IPS|IDS|DLP|NAC|HSM|KMS|VPN)\b/.test(s)) return 'SECURITY';
    if(/\b(SAN)\b/.test(s)) return 'SAN';
    if(/\b(STORAGE|NAS|BACKUP)\b/.test(s)) return 'STORAGE';
    if(/\b(NETWORK|CIRCUIT|ROUTER|SWITCH|L2|L3|L4|L7)\b/.test(s)) return 'NETWORK';
    return 'SERVER';
  }

  function pickBestHardwareAsset(items, q){
    const q0 = String(q || '').trim();
    if(!Array.isArray(items) || !items.length) return null;
    const findExact = function(pred){
      for(let i=0;i<items.length;i++){
        const it = items[i];
        try{ if(pred(it)) return it; }catch(_ePred){}
      }
      return null;
    };
    return (
      findExact(function(it){ return normStr(it && it.asset_code) === q0; }) ||
      findExact(function(it){ return normStr(it && it.work_name) === q0; }) ||
      findExact(function(it){ return normStr(it && it.system_name) === q0; }) ||
      findExact(function(it){ return normStr(it && it.asset_name) === q0; }) ||
      items[0]
    );
  }

  async function fetchHardwareAssetsByCategory(assetCategory, q){
    const url = '/api/hardware/assets?' + new URLSearchParams({
      asset_category: String(assetCategory || '').trim().toUpperCase(),
      q: String(q || '').trim(),
      page: '1',
      page_size: '50'
    }).toString();
    try{
      const r = await fetch(url, { method:'GET', headers:{ 'Accept':'application/json' } });
      const j = await r.json().catch(function(){ return null; });
      if(!r.ok || !j || !j.success || !Array.isArray(j.items)) return [];
      return j.items || [];
    }catch(_e){
      return [];
    }
  }

  async function resolveHardwareAssetByQuery(q){
    const query = (String(q || '').trim());
    if(!query) return null;

    const preferred = inferHardwareAssetCategoryFromQuery(query);
    const cats = [preferred].concat(_TAB61_ALLOWED_HARDWARE_CATEGORIES.filter(function(c){ return c !== preferred; }));

    for(let i=0;i<cats.length;i++){
      const cat = cats[i];
      const items = await fetchHardwareAssetsByCategory(cat, query);
      if(!items || !items.length) continue;
      const pick = pickBestHardwareAsset(items, query);
      const id = tryParsePositiveInt(pick && (pick.id != null ? pick.id : pick.hardware_id));
      if(!id) continue;
      try{ if(pick) _tab61HardwareAssetByHardwareId[id] = pick; }catch(_eMap){ }
      return { id: id, asset: pick };
    }

    return null;
  }

  async function resolveHardwareAssetFromPageContext(){
    // These cost-detail tabs often have tokenized URLs without any numeric id.
    // We *do* have a server-rendered manage_no on <main>, which corresponds to asset_code.
    // Use it to resolve the current asset id deterministically.
    const manageNo = getMainManageNo();
    const title = getPageHeaderTitle();
    const q = (manageNo || title || '').trim();
    if(!q) return null;

    return resolveHardwareAssetByQuery(q);
  }

  async function resolveHardwareAssetFromWorkName(workName){
    const w = normStr(workName);
    if(!w) return null;
    if(_tab61ResolveHardwareByWorkName[w]) return _tab61ResolveHardwareByWorkName[w];

    _tab61ResolveHardwareByWorkName[w] = (async function(){
      return resolveHardwareAssetByQuery(w);
    })();

    return _tab61ResolveHardwareByWorkName[w];
  }

  function resolveHardwareIdFromStorageBestEffort(){
    const stores = [window.sessionStorage, window.localStorage].filter(Boolean);
    const keys = readStorageKeys(stores);
    const candidates = [];

    // Prefer explicit '*:selected:asset_id' keys with server/hardware-ish prefixes.
    keys.forEach(function(x){
      const k = x.key;
      if(!k) return;
      const low = String(k).toLowerCase();
      const isIdKey = low.endsWith(':selected:asset_id') || low.endsWith(':selected:assetid') || low.endsWith(':selected:hardware_id') || low.endsWith(':selected:hardwareid');
      if(!isIdKey) return;
      // Heuristic: prefer server/hardware scopes to avoid pulling unrelated modules.
      const score = (low.indexOf('server')>-1?3:0) + (low.indexOf('hardware')>-1?2:0) + (low.indexOf('maintenance')>-1?1:0);
      const v = tryParsePositiveInt(x.store.getItem(k));
      if(v) candidates.push({ id: v, score: score });
    });

    // Also parse any selected row payloads and extract hardware_id/asset_id/id.
    keys.forEach(function(x){
      const k = x.key;
      if(!k) return;
      const low = String(k).toLowerCase();
      const isRowKey = low.endsWith(':selected:row') || low.endsWith(':selectedrow') || low.endsWith('_selected_row');
      if(!isRowKey) return;
      const row = safeJsonParse(x.store.getItem(k));
      if(!row || typeof row !== 'object') return;
      const id = tryParsePositiveInt(row.hardware_id != null ? row.hardware_id : (row.asset_id != null ? row.asset_id : row.id));
      if(!id) return;
      const score = (low.indexOf('server')>-1?3:0) + (low.indexOf('hardware')>-1?2:0) + (low.indexOf('maintenance')>-1?1:0);
      candidates.push({ id: id, score: score });
    });

    if(!candidates.length) return null;
    candidates.sort(function(a,b){
      if(b.score !== a.score) return b.score - a.score;
      return b.id - a.id;
    });
    return candidates[0].id;
  }

  function resolveCurrentHardwareId(){
    if(_tab61ResolvedHardwareId != null) return Promise.resolve(_tab61ResolvedHardwareId);
    if(_tab61ResolvedHardwareIdPromise) return _tab61ResolvedHardwareIdPromise;

    _tab61ResolvedHardwareIdPromise = (async function(){
      let id = resolveHardwareIdFromUrl();

      // If shared helper is present, try a few common prefixes.
      if(!id && window.BlossomHardwareDetail && typeof window.BlossomHardwareDetail.resolveAssetId === 'function'){
        const prefixes = [];
        try{ if(window.STORAGE_PREFIX) prefixes.push(String(window.STORAGE_PREFIX)); }catch(_e0){}
        prefixes.push('server','hardware','detail','maintenance','onpremise','cloud','workstation');
        for(let i=0;i<prefixes.length;i++){
          const p = prefixes[i];
          if(!p) continue;
          const v = tryParsePositiveInt(window.BlossomHardwareDetail.resolveAssetId(p));
          if(v){ id = v; break; }
        }
      }

      // Prefer deterministic page context resolution over storage heuristics.
      if(!id){
        const resolved = await resolveHardwareAssetFromPageContext();
        if(resolved && resolved.id){
          id = resolved.id;
          _tab61ResolvedHardwareAsset = resolved.asset || null;
          try{ if(_tab61ResolvedHardwareAsset) _tab61HardwareAssetByHardwareId[id] = _tab61ResolvedHardwareAsset; }catch(_eMap){ }
        }
      }

      if(!id) id = resolveHardwareIdFromStorageBestEffort();

      // Validate by probing the components endpoint; pick the first one that returns a non-empty list.
      if(id){
        try{
          const r = await fetch('/api/hardware/assets/' + encodeURIComponent(String(id)) + '/components', { method:'GET', headers:{ 'Accept':'application/json' } });
          const j = await r.json().catch(function(){ return null; });
          if(r.ok && j && j.success && Array.isArray(j.items)){
            _tab61ResolvedHardwareId = id;
            return id;
          }
        }catch(_e1){ /* ignore */ }
      }

      _tab61ResolvedHardwareId = null;
      return null;
    })();

    return _tab61ResolvedHardwareIdPromise;
  }

  function resolveHardwareIdForRow(tr){
    try{
      const workSel = tr ? tr.querySelector('select[data-edit-col="work_name"]') : null;
      const workV = workSel ? normalizeWorkNameValue(workSel.value) : '';
      if(!normStr(workV)) return Promise.resolve(null);
      return resolveHardwareAssetFromWorkName(workV).then(function(res){
        return res && res.id ? res.id : null;
      });
    }catch(_e){
      return Promise.resolve(null);
    }
  }

  function getTab61BaseKeyFromEntityKey(){
    try{
      const main = document.querySelector('main.page-tab71-opex');
      const ek = main && main.dataset ? String(main.dataset.entityKey || '') : '';
      // Expected: cost:<base_key>:<manage_no>
      const parts = ek.split(':');
      if(parts.length >= 3 && normStr(parts[0]) === 'cost') return normStr(parts[1]);
    }catch(_e){ }
    return '';
  }

  function getTab61ContractTargetType(){
    const baseKey = getTab61BaseKeyFromEntityKey();
    if(!baseKey) return '';
    if(baseKey.indexOf('_software_') > -1) return 'SW';
    if(baseKey.indexOf('_hardware_') > -1) return 'HW';
    if(baseKey.indexOf('_etc_') > -1) return 'ETC';
    // Fallback: parse cost_opex_software_contract style keys.
    try{
      const parts = baseKey.split('_');
      // cost opex/capex <type> ...
      for(let i=0;i<parts.length;i++){
        if(parts[i] === 'software') return 'SW';
        if(parts[i] === 'hardware') return 'HW';
        if(parts[i] === 'etc') return 'ETC';
      }
    }catch(_e2){ }
    return '';
  }

  const _tab61SoftwareCatalogByHardwareId = {};

  function fetchSoftwareCatalogByHardwareId(hardwareId, q){
    const query = normStr(q);
    if(!hardwareId) return Promise.resolve([]);

    if(!_tab61SoftwareCatalogByHardwareId[hardwareId]){
      _tab61SoftwareCatalogByHardwareId[hardwareId] = fetch('/api/hardware/assets/' + encodeURIComponent(String(hardwareId)) + '/software', { method:'GET', headers:{ 'Accept':'application/json' } })
        .then(function(r){ return r.json().catch(function(){ return null; }).then(function(j){ return { r:r, j:j }; }); })
        .then(function(x){
          if(!x || !x.r || !x.r.ok || !x.j || !x.j.success) return [];
          const items = Array.isArray(x.j.items) ? x.j.items : [];
          return items;
        })
        .catch(function(){ return []; });
    }

    return _tab61SoftwareCatalogByHardwareId[hardwareId].then(function(rows){
      if(!query) return rows || [];
      const ql = query.toLowerCase();
      return (rows || []).filter(function(r){
        const t = normStr(r && r.type);
        const v = normStr(r && r.vendor);
        const n = normStr(r && (r.name || r.model));
        const s = normStr(r && r.serial);
        return (t+' '+v+' '+n+' '+s).toLowerCase().indexOf(ql) > -1;
      });
    });
  }

  function fetchSoftwareCatalogForRow(tr, q){
    const query = normStr(q);
    return resolveHardwareIdForRow(tr).then(function(hardwareId){
      if(!hardwareId) return [];
      return fetchSoftwareCatalogByHardwareId(hardwareId, query);
    });
  }

  function fetchSoftwareCatalog(q){
    const query = normStr(q);
    return resolveCurrentHardwareId().then(function(hardwareId){
      if(!hardwareId) return [];
      return fetchSoftwareCatalogByHardwareId(hardwareId, query);
    });
  }

  function fetchComponentCatalogByHardwareId(hardwareId, q){
    const query = normStr(q);
    if(!hardwareId) return Promise.resolve([]);

    if(!_tab61ComponentCatalogByHardwareId[hardwareId]){
      _tab61ComponentCatalogByHardwareId[hardwareId] = fetch('/api/hardware/assets/' + encodeURIComponent(String(hardwareId)) + '/components', { method:'GET', headers:{ 'Accept':'application/json' } })
        .then(function(r){ return r.json().catch(function(){ return null; }).then(function(j){ return { r:r, j:j }; }); })
        .then(function(x){
          if(!x || !x.r || !x.r.ok || !x.j || !x.j.success) return [];
          const items = Array.isArray(x.j.items) ? x.j.items : [];

          // Synthesize a "시스템" row when the components table doesn't store it.
          try{
            const hasSystem = items.some(function(it){ return normStr(it && it.type) === '시스템'; });
            const asset = _tab61HardwareAssetByHardwareId[hardwareId] || _tab61ResolvedHardwareAsset;
            if(!hasSystem && asset){
              const vendor = normStr(asset.manufacturer_name || asset.manufacturer_code || asset.vendor || asset.manufacturer);
              const model = normStr(asset.server_model_name || asset.asset_model_name || asset.model || asset.asset_name);
              const serial = normStr(asset.serial_number || asset.serial || asset.asset_code);
              if(vendor || model || serial){
                items.unshift({
                  id: null,
                  hardware_id: hardwareId,
                  type: '시스템',
                  vendor: vendor,
                  model: model,
                  serial: serial,
                  qty: 1
                });
              }
            }
          }catch(_eSys){ }

          return items;
        })
        .catch(function(){ return []; });
    }

    return _tab61ComponentCatalogByHardwareId[hardwareId].then(function(rows){
      if(!query) return rows || [];
      const ql = query.toLowerCase();
      return (rows || []).filter(function(r){
        const t = normStr(r && r.type);
        const v = normStr(r && r.vendor);
        const m = normStr(r && r.model);
        const s = normStr(r && r.serial);
        return (t+' '+v+' '+m+' '+s).toLowerCase().indexOf(ql) > -1;
      });
    });
  }

  function fetchComponentCatalogForRow(tr, q){
    const query = normStr(q);
    return resolveHardwareIdForRow(tr).then(function(hardwareId){
      if(!hardwareId) return [];
      return fetchComponentCatalogByHardwareId(hardwareId, query);
    });
  }

  function fetchComponentCatalog(q){
    const query = normStr(q);
    return resolveCurrentHardwareId().then(function(hardwareId){
      if(!hardwareId) return [];
      return fetchComponentCatalogByHardwareId(hardwareId, query);
    });
  }

  function normStr(v){
    return String(v==null ? '' : v).trim();
  }

  function includesQuery(hay, q){
    if(!q) return true;
    return String(hay||'').toLowerCase().indexOf(String(q).toLowerCase()) > -1;
  }

  function uniqueOptionsFromValues(values, q){
    const seen = new Set();
    const out = [];
    (values||[]).forEach(function(v){
      const s = normStr(v);
      if(!s) return;
      if(q && !includesQuery(s, q)) return;
      if(seen.has(s)) return;
      seen.add(s);
      out.push({ value: s, label: s, displayLabel: s });
    });
    return out;
  }

  function ensureTab61SearchSources(){
    try{
      window.BlossomSearchableSelectSources = window.BlossomSearchableSelectSources || {};
      const src = window.BlossomSearchableSelectSources;

      const isSoftwareContract = function(){
        try{ return getTab61ContractTargetType() === 'SW'; }catch(_e){ return false; }
      };

      const needReplace = function(key){
        try{
          const fn = src[key];
          if(typeof fn !== 'function') return true;
          return String(fn.__tab61Version || '') !== VERSION;
        }catch(_e){
          return true;
        }
      };

      if(needReplace('tab61_work_name')){
        const fn = function(ctx){
          const q = (ctx && ctx.query) ? String(ctx.query).trim() : '';
          const url = '/api/hardware-assets/suggest-work-systems?' + new URLSearchParams({ q: q, limit: '80' }).toString();
          return fetch(url, { method:'GET', headers:{ 'Accept':'application/json' } })
            .then(function(r){ return r.json().catch(function(){ return null; }).then(function(j){ return { r:r, j:j }; }); })
            .then(function(x){
              if(!x || !x.r || !x.r.ok || !x.j || !x.j.success) return [];
              const items = Array.isArray(x.j.items) ? x.j.items : [];
              const seen = new Set();
              const out = [];
              items.forEach(function(it){
                const w = normStr(it && it.work_name);
                const s = normStr(it && it.system_name);
                if(!w) return;
                if(seen.has(w)) return;
                seen.add(w);
                out.push({
                  value: w,
                  // List shows "업무명 (시스템명)"; selected display shows "업무명".
                  label: s ? (w + ' (' + s + ')') : w,
                  displayLabel: w,
                  searchText: (w + ' ' + s).trim()
                });
              });
              return out;
            })
            .catch(function(){ return []; });
        };
        fn.__tab61Version = VERSION;
        src.tab61_work_name = fn;
      }

      if(needReplace('tab61_component_type')){
        const fn = function(ctx){
          const q = (ctx && ctx.query) ? String(ctx.query).trim() : '';
          const sel = ctx && ctx.select;
          const tr = sel && sel.closest ? sel.closest('tr') : null;
          const p = isSoftwareContract()
            ? (tr ? fetchSoftwareCatalogForRow(tr, q) : fetchSoftwareCatalog(q))
            : (tr ? fetchComponentCatalogForRow(tr, q) : fetchComponentCatalog(q));
          return p.then(function(rows){
            return uniqueOptionsFromValues(rows.map(function(r){ return r && r.type; }), q);
          });
        };
        fn.__tab61Version = VERSION;
        src.tab61_component_type = fn;
      }
      if(needReplace('tab61_component_vendor')){
        const fn = function(ctx){
          const q = (ctx && ctx.query) ? String(ctx.query).trim() : '';
          const sel = ctx && ctx.select;
          const tr = sel && sel.closest ? sel.closest('tr') : null;
          const typeV = tr ? normStr(tr.querySelector('select[data-edit-col="contract_type"]') && tr.querySelector('select[data-edit-col="contract_type"]').value) : '';
          const p = isSoftwareContract()
            ? (tr ? fetchSoftwareCatalogForRow(tr, q || '') : fetchSoftwareCatalog(q || ''))
            : (tr ? fetchComponentCatalogForRow(tr, q || '') : fetchComponentCatalog(q || ''));
          return p.then(function(rows){
            const filtered = typeV ? rows.filter(function(r){ return normStr(r && r.type) === typeV; }) : rows;
            return uniqueOptionsFromValues(filtered.map(function(r){ return r && r.vendor; }), q);
          });
        };
        fn.__tab61Version = VERSION;
        src.tab61_component_vendor = fn;
      }
      if(needReplace('tab61_component_model')){
        const fn = function(ctx){
          const q = (ctx && ctx.query) ? String(ctx.query).trim() : '';
          const sel = ctx && ctx.select;
          const tr = sel && sel.closest ? sel.closest('tr') : null;
          const typeV = tr ? normStr(tr.querySelector('select[data-edit-col="contract_type"]') && tr.querySelector('select[data-edit-col="contract_type"]').value) : '';
          const vendorV = tr ? normStr(tr.querySelector('select[data-edit-col="contract_vendor"]') && tr.querySelector('select[data-edit-col="contract_vendor"]').value) : '';
          const p = isSoftwareContract()
            ? (tr ? fetchSoftwareCatalogForRow(tr, q || '') : fetchSoftwareCatalog(q || ''))
            : (tr ? fetchComponentCatalogForRow(tr, q || '') : fetchComponentCatalog(q || ''));
          return p.then(function(rows){
            let filtered = rows;
            if(typeV) filtered = filtered.filter(function(r){ return normStr(r && r.type) === typeV; });
            if(vendorV) filtered = filtered.filter(function(r){ return normStr(r && r.vendor) === vendorV; });
            const values = isSoftwareContract()
              ? filtered.map(function(r){ return r && (r.name || r.model); })
              : filtered.map(function(r){ return r && r.model; });
            return uniqueOptionsFromValues(values, q);
          });
        };
        fn.__tab61Version = VERSION;
        src.tab61_component_model = fn;
      }
      if(needReplace('tab61_component_serial')){
        const fn = function(ctx){
          const q = (ctx && ctx.query) ? String(ctx.query).trim() : '';
          const sel = ctx && ctx.select;
          const tr = sel && sel.closest ? sel.closest('tr') : null;
          const typeV = tr ? normStr(tr.querySelector('select[data-edit-col="contract_type"]') && tr.querySelector('select[data-edit-col="contract_type"]').value) : '';
          const vendorV = tr ? normStr(tr.querySelector('select[data-edit-col="contract_vendor"]') && tr.querySelector('select[data-edit-col="contract_vendor"]').value) : '';
          const modelV = tr ? normStr(tr.querySelector('select[data-edit-col="contract_model"]') && tr.querySelector('select[data-edit-col="contract_model"]').value) : '';
          const p = isSoftwareContract()
            ? (tr ? fetchSoftwareCatalogForRow(tr, q || '') : fetchSoftwareCatalog(q || ''))
            : (tr ? fetchComponentCatalogForRow(tr, q || '') : fetchComponentCatalog(q || ''));
          return p.then(function(rows){
            let filtered = rows;
            if(typeV) filtered = filtered.filter(function(r){ return normStr(r && r.type) === typeV; });
            if(vendorV) filtered = filtered.filter(function(r){ return normStr(r && r.vendor) === vendorV; });
            if(modelV){
              filtered = filtered.filter(function(r){
                const mv = isSoftwareContract() ? normStr(r && (r.name || r.model)) : normStr(r && r.model);
                return mv === modelV;
              });
            }
            return uniqueOptionsFromValues(filtered.map(function(r){ return r && r.serial; }), q);
          });
        };
        fn.__tab61Version = VERSION;
        src.tab61_component_serial = fn;
      }

      // When sources are replaced (SPA navigation / hot reload), invalidate cached catalog.
      _tab61ResolvedHardwareIdPromise = null;
      _tab61ResolvedHardwareId = null;
      try{ for(const k in _tab61ComponentCatalogByHardwareId){ delete _tab61ComponentCatalogByHardwareId[k]; } }catch(_eClear){}
      try{ for(const k in _tab61SoftwareCatalogByHardwareId){ delete _tab61SoftwareCatalogByHardwareId[k]; } }catch(_eClearSw){}
      try{ for(const k in _tab61ResolveHardwareByWorkName){ delete _tab61ResolveHardwareByWorkName[k]; } }catch(_eClear2){}
    }catch(_){ /* no-op */ }
  }

  function makeSearchSelect(opts){
    const sel = document.createElement('select');
    sel.className = (opts.className || 'form-input tab61-input') + ' search-select';
    sel.style.width = '100%';
    sel.setAttribute('data-edit-col', opts.col);
    sel.setAttribute('data-searchable-scope', 'page');
    sel.setAttribute('data-search-source', opts.source);
    sel.setAttribute('data-placeholder', opts.placeholder || '선택');
    sel.setAttribute('data-allow-clear', 'true');

    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = '선택';
    sel.appendChild(emptyOpt);

    const cur = normStr(opts.value);
    if(cur){
      const opt = document.createElement('option');
      opt.value = cur;
      // Ensure initial render shows the canonical value.
      // For async sources, list labels are populated later via fetched options.
      opt.textContent = cur;
      opt.setAttribute('data-display-label', cur);
      opt.selected = true;
      sel.appendChild(opt);
    }
    return sel;
  }

  function normalizeWorkNameValue(v){
    const s = normStr(v);
    if(!s) return '';
    // Backward-compat: older UI variants sometimes stored composite labels.
    // Extract the work name part.
    const idxParen = s.indexOf(' (');
    const idxBrace = s.indexOf('{');
    const idx = (idxParen >= 0 && idxBrace >= 0) ? Math.min(idxParen, idxBrace) : Math.max(idxParen, idxBrace);
    if(idx > 0) return s.slice(0, idx).trim();
    return s;
  }

  async function resolveSystemNameFromWork(work){
    const w = normStr(work);
    if(!w) return '';
    try{
      const url = '/api/hardware-assets/suggest-work-systems?' + new URLSearchParams({ q: w, limit: '120' }).toString();
      const r = await fetch(url, { method:'GET', headers:{ 'Accept':'application/json' } });
      const j = await r.json().catch(function(){ return null; });
      if(!r.ok || !j || !j.success) return '';
      const items = Array.isArray(j.items) ? j.items : [];
      const matches = items.filter(function(it){ return normStr(it && it.work_name) === w; });
      if(!matches.length) return '';
      // Prefer the first system_name (usually 1:1); if multiple exist, keep stable behavior.
      return normStr(matches[0] && matches[0].system_name);
    }catch(_e){
      return '';
    }
  }

  function scoreComponentRow(row, desired){
    let score = 0;
    if(desired.type && normStr(row.type) === desired.type) score += 3;
    if(desired.vendor && normStr(row.vendor) === desired.vendor) score += 2;
    if(desired.model && normStr(row.model) === desired.model) score += 2;
    if(desired.serial && normStr(row.serial) === desired.serial) score += 4;
    return score;
  }

  async function applyComponentMappingForRow(tr){
    if(!tr) return;
    const typeSel = tr.querySelector('select[data-edit-col="contract_type"]');
    const vendorSel = tr.querySelector('select[data-edit-col="contract_vendor"]');
    const modelSel = tr.querySelector('select[data-edit-col="contract_model"]');
    const serialSel = tr.querySelector('select[data-edit-col="contract_serial"]');
    if(!typeSel && !vendorSel && !modelSel && !serialSel) return;

    const desired = {
      type: typeSel ? normStr(typeSel.value) : '',
      vendor: vendorSel ? normStr(vendorSel.value) : '',
      model: modelSel ? normStr(modelSel.value) : '',
      serial: serialSel ? normStr(serialSel.value) : ''
    };
    if(!desired.type && !desired.vendor && !desired.model && !desired.serial) return;

    const rows = await fetchComponentCatalogForRow(tr, '');
    if(!rows || !rows.length) return;

    let best = null;
    let bestScore = 0;
    rows.forEach(function(r){
      if(!r) return;
      const sc = scoreComponentRow(r, desired);
      if(sc > bestScore){ bestScore = sc; best = r; }
    });
    if(!best || bestScore <= 0) return;

    // Fill missing fields from the chosen row.
    // Never overwrite a user-selected value, and never set a value to empty.
    const bestType = normStr(best.type);
    const bestVendor = normStr(best.vendor);
    const bestModel = normStr(best.model);
    const bestSerial = normStr(best.serial);
    if(typeSel && !desired.type && bestType) typeSel.value = bestType;
    if(vendorSel && !desired.vendor && bestVendor) vendorSel.value = bestVendor;
    if(modelSel && !desired.model && bestModel) modelSel.value = bestModel;
    if(serialSel && !desired.serial && bestSerial) serialSel.value = bestSerial;

    try{
      if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
        window.BlossomSearchableSelect.syncAll(tr);
      }
    }catch(_){ }

    try{ updateCascadeStateForRow(tr); }catch(_){ }
  }

  function clearSelectValue(sel){
    if(!sel) return;
    try{ sel.value = ''; }catch(_){ }
    try{ sel.dataset.userCleared = '1'; }catch(_){ }
  }

  function readRowCellValue(tr, col){
    if(!tr || !col) return '';
    const td = tr.querySelector('[data-col="'+col+'"]');
    if(!td) return '';
    const sel = td.querySelector('select[data-edit-col="'+col+'"]');
    if(sel) return normStr(sel.value);
    const inp = td.querySelector('input[data-edit-col="'+col+'"]');
    if(inp) return normStr(inp.value);
    const raw = (td.textContent || '').trim();
    return normStr(raw === '-' ? '' : raw);
  }

  function isDuplicateWorkTypeInTable(currentTr, workName, contractType){
    const w = normStr(workName);
    const t = normStr(contractType);
    if(!currentTr || !w || !t) return false;
    const table = currentTr.closest('table');
    const tbody = table ? table.querySelector('tbody') : null;
    if(!tbody) return false;
    const rows = Array.from(tbody.querySelectorAll('tr'));
    return rows.some(function(r){
      if(!r || r === currentTr) return false;
      const w2 = readRowCellValue(r, 'work_name');
      const t2 = readRowCellValue(r, 'contract_type');
      return (w2 === w) && (t2 === t);
    });
  }

  function updateCascadeStateForRow(tr, opts){
    if(!tr) return;
    const workSel = tr.querySelector('select[data-edit-col="work_name"]');
    const typeSel = tr.querySelector('select[data-edit-col="contract_type"]');
    const vendorSel = tr.querySelector('select[data-edit-col="contract_vendor"]');
    const modelSel = tr.querySelector('select[data-edit-col="contract_model"]');
    const serialSel = tr.querySelector('select[data-edit-col="contract_serial"]');

    const clearFrom = opts && opts.clearFrom ? String(opts.clearFrom) : '';
    if(clearFrom === 'work'){
      clearSelectValue(typeSel);
      clearSelectValue(vendorSel);
      clearSelectValue(modelSel);
      clearSelectValue(serialSel);
    }else if(clearFrom === 'type'){
      clearSelectValue(vendorSel);
      clearSelectValue(modelSel);
      clearSelectValue(serialSel);
    }else if(clearFrom === 'vendor'){
      clearSelectValue(modelSel);
      clearSelectValue(serialSel);
    }else if(clearFrom === 'model'){
      clearSelectValue(serialSel);
    }

    // Recompute after clears.
    const workV = workSel ? normStr(workSel.value) : '';
    const typeV = typeSel ? normStr(typeSel.value) : '';
    const vendorV = vendorSel ? normStr(vendorSel.value) : '';
    const modelV = modelSel ? normStr(modelSel.value) : '';

    if(typeSel) typeSel.disabled = !workV;
    if(vendorSel) vendorSel.disabled = !(workV && typeV);
    if(modelSel) modelSel.disabled = !(workV && typeV && vendorV);
    const tailEnabled = !!(workV && typeV && vendorV && modelV);
    if(serialSel) serialSel.disabled = !tailEnabled;

    try{
      if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
        window.BlossomSearchableSelect.syncAll(tr);
      }
    }catch(_){ }
  }

  function ensureCompactStyle(){ /* size reverted; keep default form-input sizing */ }

  function ready(fn){ if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }

  function qs(){ try{ return new URLSearchParams(location.search||''); }catch(_){ return new URLSearchParams(''); } }

  function detectScopeAndType(){
    // Prefer entity-key based detection because the actual route path can be
    // /pages/<key> (and not include the template folder segments).
    let scope = '';
    let costType = '';

    try{
      const baseKey = String(getTab61BaseKeyFromEntityKey() || '').toLowerCase();
      if(baseKey){
        if(baseKey.indexOf('cost_opex_') === 0) scope = 'OPEX';
        else if(baseKey.indexOf('cost_capex_') === 0) scope = 'CAPEX';
      }
    }catch(_eBase){ }

    try{
      const tt = (typeof getTab61ContractTargetType === 'function') ? String(getTab61ContractTargetType() || '') : '';
      if(tt) costType = tt;
    }catch(_eTT){ }

    // Fallback: parse legacy folder-like path.
    const p = (location.pathname||'').toLowerCase();
    if(!scope){
      scope = p.includes('/7.cost/7-1.opex/') ? 'OPEX' : (p.includes('/7.cost/7-2.capex/') ? 'CAPEX' : 'OPEX');
    }
    if(!costType){
      if(p.includes('7-1-2.software') || p.includes('7-2-2.software')) costType = 'SW';
      else if(p.includes('7-1-3.etc') || p.includes('7-2-3.etc')) costType = 'ETC';
      else if(p.includes('7-1-1.hardware') || p.includes('7-2-1.hardware')) costType = 'HW';
      else costType = 'HW';
    }

    return { scope: scope || 'OPEX', costType: costType || 'HW' };
  }

  function storageKeyYears(metaBase, contractId){
    const cid = String(contractId || '').trim();
    const suffix = cid ? cid : ('path:' + String(location.pathname||''));
    return ['blossom','tab61','years', metaBase.scope, metaBase.costType, suffix].join(':');
  }

  function storageKeySelectedYear(metaBase, contractId){
    const cid = String(contractId || '').trim();
    const suffix = cid ? cid : ('path:' + String(location.pathname||''));
    return ['blossom','tab61','yearSelected', metaBase.scope, metaBase.costType, suffix].join(':');
  }

  function uniqIntYears(arr){
    const out = [];
    const seen = new Set();
    (arr||[]).forEach(v => {
      const n = parseInt(String(v), 10);
      if(Number.isNaN(n)) return;
      if(n < 1900 || n > 2200) return;
      if(seen.has(n)) return;
      seen.add(n);
      out.push(n);
    });
    out.sort((a,b) => a-b);
    return out;
  }

  function loadYears(metaBase, contractId){
    try{
      const raw = localStorage.getItem(storageKeyYears(metaBase, contractId));
      if(!raw) return [];
      const j = JSON.parse(raw);
      if(Array.isArray(j)) return uniqIntYears(j);
    }catch(_){ }
    return [];
  }

  function saveYears(metaBase, contractId, years){
    try{
      localStorage.setItem(storageKeyYears(metaBase, contractId), JSON.stringify(uniqIntYears(years)));
      return true;
    }catch(_){ return false; }
  }

  function loadSelectedYear(metaBase, contractId){
    try{
      const raw = localStorage.getItem(storageKeySelectedYear(metaBase, contractId));
      const n = parseInt(String(raw||''), 10);
      return Number.isNaN(n) ? null : n;
    }catch(_){ return null; }
  }

  function saveSelectedYear(metaBase, contractId, year){
    try{ localStorage.setItem(storageKeySelectedYear(metaBase, contractId), String(year)); }catch(_){ }
  }

  function renderYearSelect(yearSel, years, selected){
    if(!yearSel) return;
    yearSel.innerHTML = '';
    years.forEach(y => {
      const opt = document.createElement('option');
      opt.value = String(y);
      opt.textContent = String(y);
      if(y === selected) opt.selected = true;
      yearSel.appendChild(opt);
    });
  }

  function pickDefaultYear(years){
    const nowYear = (new Date()).getFullYear();
    if(years && years.length) return years.includes(nowYear) ? nowYear : years[years.length - 1];
    return nowYear;
  }

  function toValidYearOrNull(v){
    const s = String(v==null ? '' : v).trim();
    if(!s) return null;
    const n = parseInt(s, 10);
    if(Number.isNaN(n)) return null;
    if(n < 1900 || n > 2200) return null;
    return n;
  }

  function ensureYearAddModal(){
    let modal = document.getElementById('hw-year-add-modal');
    if(modal) return modal;

    modal = document.createElement('div');
    modal.id = 'hw-year-add-modal';
    modal.className = 'server-add-modal modal-overlay-full';
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'hw-year-add-title');
    modal.innerHTML = ''
      + '<div class="server-add-content">'
      + '  <div class="server-add-header">'
      + '    <div class="server-add-title">'
      + '      <h3 id="hw-year-add-title">년도 생성</h3>'
      + '      <p class="server-add-subtitle">추가할 연도를 입력하세요.</p>'
      + '    </div>'
      + '    <button class="close-btn" type="button" id="hw-year-add-close" title="닫기" aria-label="닫기">'
      + '      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">'
      + '        <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
      + '      </svg>'
      + '    </button>'
      + '  </div>'
      + '  <div class="server-add-body">'
      + '    <div class="form-section">'
      + '      <div class="form-grid" style="padding:0 32px;">'
      + '        <div class="form-row" style="grid-column:1 / -1;">'
      + '          <label for="hw-year-add-input">년도</label>'
      + '          <input id="hw-year-add-input" class="form-input" type="number" inputmode="numeric" min="1900" max="2200" placeholder="예: 2026">'
      + '        </div>'
      + '      </div>'
      + '      <div id="hw-year-add-error" style="display:none; padding:10px 32px 0; color:#dc2626; font-size:13px;"></div>'
      + '    </div>'
      + '  </div>'
      + '  <div class="server-add-actions align-right">'
      + '    <div class="action-buttons right">'
      + '      <button type="button" class="btn-secondary" id="hw-year-add-cancel">취소</button>'
      + '      <button type="button" class="btn-primary" id="hw-year-add-confirm">추가</button>'
      + '    </div>'
      + '  </div>'
      + '</div>';

    document.body.appendChild(modal);
    return modal;
  }

  function wireYearAddModal(){
    const modal = ensureYearAddModal();
    if(modal && modal.dataset && modal.dataset.wired === '1') return;
    try{ if(modal.dataset) modal.dataset.wired = '1'; }catch(_){ }

    const input = modal.querySelector('#hw-year-add-input');
    const err = modal.querySelector('#hw-year-add-error');
    const closeBtn = modal.querySelector('#hw-year-add-close');
    const cancelBtn = modal.querySelector('#hw-year-add-cancel');
    const confirmBtn = modal.querySelector('#hw-year-add-confirm');

    function setErr(msg){
      if(!err) return;
      if(!msg){ err.style.display = 'none'; err.textContent = ''; return; }
      err.textContent = String(msg);
      err.style.display = '';
    }

    function closeModal(){
      try{ modal.classList.remove('show'); }catch(_){ }
      try{ modal.setAttribute('aria-hidden', 'true'); }catch(_){ }
      try{ document.body.classList.remove('modal-open'); }catch(_){ }
      setErr('');
    }

    function confirm(){
      const y = toValidYearOrNull(input ? input.value : '');
      if(y == null){
        setErr('1900~2200 사이의 연도를 입력하세요.');
        try{ if(input) input.focus(); }catch(_){ }
        return;
      }
      setErr('');
      const cb = modal.__tab61OnConfirm;
      closeModal();
      try{ if(typeof cb === 'function') cb(y); }catch(_){ }
    }

    function openModal(defaultYear, onConfirm){
      modal.__tab61OnConfirm = onConfirm;
      setErr('');
      if(input){
        try{ input.value = String(defaultYear == null ? '' : defaultYear); }catch(_){ }
      }
      try{ modal.classList.add('show'); }catch(_){ }
      try{ modal.setAttribute('aria-hidden', 'false'); }catch(_){ }
      try{ document.body.classList.add('modal-open'); }catch(_){ }
      try{ setTimeout(function(){ if(input){ input.focus(); if(input.select) input.select(); } }, 10); }catch(_){ }
    }

    modal.__tab61Open = openModal;
    modal.__tab61Close = closeModal;

    if(closeBtn) closeBtn.addEventListener('click', closeModal);
    if(cancelBtn) cancelBtn.addEventListener('click', closeModal);
    if(confirmBtn) confirmBtn.addEventListener('click', confirm);

    // Close when clicking outside the dialog
    modal.addEventListener('mousedown', function(ev){
      if(ev && ev.target === modal) closeModal();
    });

    // Keyboard controls
    modal.addEventListener('keydown', function(ev){
      if(!ev) return;
      if(ev.key === 'Escape'){
        ev.preventDefault();
        closeModal();
      }
    });
    if(input){
      input.addEventListener('keydown', function(ev){
        if(!ev) return;
        if(ev.key === 'Enter'){
          ev.preventDefault();
          confirm();
        }
      });
    }
  }

  function getContractId(){
    // Prefer server-rendered context (tokenized URLs have no ?id=...)
    try{
      const main = document.querySelector('main.main-content');
      const mn = main && main.dataset ? (main.dataset.manageNo || main.dataset.manage_no) : '';
      if(mn && String(mn).trim()) return String(mn).trim();
      const attr = main ? (main.getAttribute('data-manage-no') || '') : '';
      if(attr && String(attr).trim()) return String(attr).trim();
    }catch(_){ }

    // Backward-compat: old query parameter
    const q = qs();
    const cand = q.get('contract_id') || q.get('contractId') || q.get('id') || '';
    return String(cand || '').trim();
  }

  function toIntOrNull(v){
    const s = String(v==null? '' : v).replace(/[^0-9-]/g,'').trim();
    if(!s) return null;
    const n = parseInt(s, 10);
    return Number.isNaN(n) ? null : n;
  }

  function formatNumberLocale(n){
    try{ return Number(n||0).toLocaleString('ko-KR'); }catch(_){ return String(n||0); }
  }

  function contractStatusClass(v){
    const s = normStr(v);
    if(s === '예정') return 'is-planned';
    if(s === '계약') return 'is-active';
    if(s === '만료') return 'is-expired';
    if(s === '해지') return 'is-canceled';
    return 'is-unknown';
  }

  function renderContractStatusCell(td, status){
    if(!td) return;
    const s = normStr(status);
    td.innerHTML = '';
    if(!s){ td.textContent = '-'; return; }
    const wrap = document.createElement('span');
    wrap.className = 'tab71-status';
    const dot = document.createElement('span');
    dot.className = 'tab71-status-dot ' + contractStatusClass(s);
    dot.setAttribute('aria-hidden', 'true');
    const txt = document.createElement('span');
    txt.className = 'tab71-status-text';
    txt.textContent = s;
    wrap.appendChild(dot);
    wrap.appendChild(txt);
    td.appendChild(wrap);
  }

  function ensureAnalyticsModal(){
    let modal = document.getElementById('hw-analytics-modal');
    if(modal) return modal;

    modal = document.createElement('div');
    modal.id = 'hw-analytics-modal';
    modal.className = 'server-add-modal modal-overlay-full';
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'hw-analytics-title');

    modal.innerHTML = ''
      + '<div class="server-add-content" style="max-width: 980px;">'
      + '  <div class="server-add-header">'
      + '    <div class="server-add-title">'
      + '      <h3 id="hw-analytics-title">유지보수 분석</h3>'
      + '      <p class="server-add-subtitle" id="hw-analytics-subtitle">-</p>'
      + '    </div>'
      + '    <div class="tab71-analytics-header-controls">'
      + '      <label for="hw-analytics-year-select" class="visually-hidden">연도 선택</label>'
      + '      <select id="hw-analytics-year-select" class="page-size-select tab71-analytics-year-select" title="연도 선택"></select>'
      + '    <button class="close-btn" type="button" id="hw-analytics-close" title="닫기" aria-label="닫기">'
      + '      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">'
      + '        <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
      + '      </svg>'
      + '    </button>'
      + '    </div>'
      + '  </div>'
      + '  <div class="server-add-body">'
      + '    <div class="tab71-analytics-body">'
      + '      <div id="hw-analytics-total" style="font-size:14px; color:#334155; margin-bottom:10px;"></div>'
      + '      <div id="hw-analytics-loading" class="tab71-analytics-empty tab71-analytics-loading" style="display:none;">로딩중...</div>'
      + '      <div id="hw-analytics-empty" class="tab71-analytics-empty" style="display:none;">'
      + '        <div id="hw-analytics-empty-anim" class="tab71-analytics-empty__anim" aria-hidden="true"></div>'
      + '        <div class="tab71-analytics-empty__text">데이터가 없습니다.</div>'
      + '      </div>'
      + '      <div id="hw-analytics-chart" class="tab71-analytics-chart" aria-label="월별 유지보수 누적막대 + 항목별 추세선 그래프"></div>'
      + '    </div>'
      + '  </div>'
      + '</div>';

    document.body.appendChild(modal);

    // Whether the user has manually selected a year inside the modal.
    modal.__tab61YearPinned = false;
    modal.__tab61Items = [];

    const closeBtn = modal.querySelector('#hw-analytics-close');
    function close(){
      modal.setAttribute('aria-hidden', 'true');
      modal.style.display = 'none';
      try{ document.body.classList.remove('modal-open'); }catch(_){ }
    }
    function open(){
      modal.setAttribute('aria-hidden', 'false');
      modal.style.display = 'flex';
      try{ document.body.classList.add('modal-open'); }catch(_){ }
    }

    if(closeBtn) closeBtn.addEventListener('click', close);

    // Click outside content closes
    modal.addEventListener('mousedown', function(ev){
      const content = modal.querySelector('.server-add-content');
      if(!content) return;
      if(ev.target === modal) close();
    });

    // ESC closes
    document.addEventListener('keydown', function(ev){
      if(ev.key === 'Escape' && modal.getAttribute('aria-hidden') === 'false') close();
    });

    modal.__tab61Open = open;
    modal.__tab61Close = close;
    return modal;
  }

  function getOpenAnalyticsModal(){
    const modal = document.getElementById('hw-analytics-modal');
    if(!modal) return null;
    if(modal.getAttribute('aria-hidden') === 'false') return modal;
    return null;
  }

  function setAnalyticsLoading(modal, year){
    if(!modal) return;
    const subtitle = modal.querySelector('#hw-analytics-subtitle');
    const totalEl = modal.querySelector('#hw-analytics-total');
    const loadingEl = modal.querySelector('#hw-analytics-loading');
    const emptyEl = modal.querySelector('#hw-analytics-empty');
    const chartEl = modal.querySelector('#hw-analytics-chart');
    if(subtitle) subtitle.textContent = String(year) + '년 월별 유지보수 합계';
    if(totalEl) totalEl.textContent = '';
    if(loadingEl) loadingEl.style.display = 'flex';
    if(emptyEl) emptyEl.style.display = 'none';
    if(chartEl){
      chartEl.style.display = 'none';
      chartEl.innerHTML = '';
    }
  }

  function ensureLottie(cb){
    try{
      if(window.lottie){ cb && cb(); return; }
      const existing = document.querySelector('script[data-tab71-lottie="1"]');
      if(existing){ existing.addEventListener('load', function(){ try{ cb && cb(); }catch(_){ } }); return; }
      const s = document.createElement('script');
      s.src = '/static/vendor/lottie/lottie.min.5.12.2.js';
      s.async = true;
      s.setAttribute('data-tab71-lottie', '1');
      s.onload = function(){ try{ cb && cb(); }catch(_){ } };
      document.head.appendChild(s);
    }catch(_e){ }
  }

  function destroyNoDataAnim(modal){
    try{
      if(modal && modal.__tab61NoDataAnim && typeof modal.__tab61NoDataAnim.destroy === 'function'){
        modal.__tab61NoDataAnim.destroy();
      }
    }catch(_){ }
    try{ if(modal) modal.__tab61NoDataAnim = null; }catch(_e){ }
    try{
      const el = modal ? modal.querySelector('#hw-analytics-empty-anim') : null;
      if(el) el.innerHTML = '';
    }catch(_e2){ }
  }

  function initNoDataAnim(modal){
    if(!modal) return;
    const el = modal.querySelector('#hw-analytics-empty-anim');
    if(!el) return;
    ensureLottie(function(){
      try{
        if(!window.lottie) return;
        if(modal.__tab61NoDataAnim) return;
        el.innerHTML = '';
        modal.__tab61NoDataAnim = window.lottie.loadAnimation({
          container: el,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          path: '/static/image/svg/free-animated-no-data.json',
          rendererSettings: { preserveAspectRatio: 'xMidYMid meet', progressiveLoad: true }
        });
      }catch(_){ }
    });
  }

  function renderAnalyticsYearSelect(modal, years, selectedYear){
    if(!modal) return;
    const sel = modal.querySelector('#hw-analytics-year-select');
    if(!sel) return;
    sel.innerHTML = '';
    (years || []).forEach(y => {
      const opt = document.createElement('option');
      opt.value = String(y);
      opt.textContent = String(y);
      if(y === selectedYear) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function getAnalyticsSelectedYear(modal){
    try{
      const sel = modal && modal.querySelector ? modal.querySelector('#hw-analytics-year-select') : null;
      if(!sel) return null;
      const n = parseInt(String(sel.value||''), 10);
      return Number.isNaN(n) ? null : n;
    }catch(_){ return null; }
  }

  function itemLabelForAnalytics(it){
    const a = normStr(it && it.work_name);
    const b = normStr(it && it.contract_model);
    const c = normStr(it && it.contract_vendor);
    if(a && b) return a + ' / ' + b;
    if(a && c) return a + ' / ' + c;
    if(a) return a;
    if(b) return b;
    if(c) return c;
    return '항목';
  }

  function stableColorForIndex(i){
    const palette = [
      '#6366F1', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444',
      '#8B5CF6', '#14B8A6', '#F97316', '#22C55E', '#3B82F6'
    ];
    return palette[i % palette.length];
  }

  function hexToRgb(hex){
    try{
      const h = String(hex || '').trim();
      if(!h) return null;
      const m = h.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
      if(!m) return null;
      let s = m[1];
      if(s.length === 3) s = s.split('').map(ch => ch + ch).join('');
      const n = parseInt(s, 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }catch(_){ return null; }
  }
  function clamp255(n){
    const x = Math.round(Number(n) || 0);
    return x < 0 ? 0 : (x > 255 ? 255 : x);
  }
  function mixRgb(a, b, t){
    const tt = Math.max(0, Math.min(1, Number(t) || 0));
    return {
      r: clamp255(a.r + (b.r - a.r) * tt),
      g: clamp255(a.g + (b.g - a.g) * tt),
      b: clamp255(a.b + (b.b - a.b) * tt)
    };
  }
  function rgbaStr(rgb, a){
    const aa = Math.max(0, Math.min(1, Number(a) || 0));
    return 'rgba(' + [rgb.r, rgb.g, rgb.b, aa.toFixed(3)].join(',') + ')';
  }
  function premiumBarGradient(baseHex){
    const base = hexToRgb(baseHex) || { r: 99, g: 102, b: 241 };
    const white = { r: 255, g: 255, b: 255 };
    const black = { r: 0, g: 0, b: 0 };
    const top = mixRgb(base, white, 0.55);
    const mid = mixRgb(base, white, 0.22);
    const bottom = mixRgb(base, black, 0.12);
    return 'linear-gradient(180deg,'
      + rgbaStr(top, 0.40) + ' 0%,'
      + rgbaStr(mid, 0.26) + ' 45%,'
      + rgbaStr(bottom, 0.34) + ' 100%)';
  }

  function ensureAnalyticsTooltip(){
    let el = document.getElementById('tab71-analytics-tooltip');
    if(el) return el;
    el = document.createElement('div');
    el.id = 'tab71-analytics-tooltip';
    el.className = 'tab71-analytics-tooltip';
    document.body.appendChild(el);
    return el;
  }

  function clamp(n, lo, hi){
    return Math.max(lo, Math.min(hi, n));
  }

  function showAnalyticsTooltip(payload, clientX, clientY){
    const tip = ensureAnalyticsTooltip();
    if(!tip) return;
    const title = normStr(payload && payload.title);
    const subtitle = normStr(payload && payload.subtitle);
    const value = (payload && payload.valueText != null) ? String(payload.valueText) : '';
    tip.innerHTML = ''
      + '<div class="tab71-analytics-tooltip__title">' + escapeHtml(title || '-') + '</div>'
      + '<div class="tab71-analytics-tooltip__row">'
      + '  <span>' + escapeHtml(subtitle || '-') + '</span>'
      + '  <span class="tab71-analytics-tooltip__value">' + escapeHtml(value || '-') + '</span>'
      + '</div>';
    tip.style.display = 'block';

    const pad = 12;
    const vw = window.innerWidth || 1200;
    const vh = window.innerHeight || 800;
    const rect = tip.getBoundingClientRect();
    const left = clamp(clientX + 14, pad, Math.max(pad, vw - rect.width - pad));
    const top = clamp(clientY + 14, pad, Math.max(pad, vh - rect.height - pad));
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }

  function hideAnalyticsTooltip(){
    const tip = document.getElementById('tab71-analytics-tooltip');
    if(!tip) return;
    tip.style.display = 'none';
  }

  function computeStackSeries(items){
    const series = (items || []).map(it => {
      const monthly = [];
      let annual = 0;
      for(let i=0;i<12;i++){
        const key = 'm' + String(i+1).padStart(2,'0');
        const v = toIntOrNull(it ? it[key] : null) || 0;
        monthly.push(v);
        annual += v;
      }
      return { label: itemLabelForAnalytics(it), monthly, annual };
    });

    // No category grouping (no top9/기타). Keep every item as its own segment.
    // Stack smaller first so larger segments sit on top.
    series.sort((a,b) => (a.annual||0) - (b.annual||0));
    return series;
  }

  function computeMonthlyTotalsFromSeries(series){
    const totals = new Array(12).fill(0);
    let grand = 0;
    (series || []).forEach(s => {
      for(let i=0;i<12;i++) totals[i] += (s.monthly[i]||0);
      grand += (s.annual||0);
    });
    return { totals, grand };
  }

  function buildMultiTrendSvg(chartEl, year, maxV, series){
    if(!chartEl) return null;
    const cols = Array.from(chartEl.querySelectorAll('.tab71-analytics-bar__col'));
    if(cols.length !== 12) return null;

    const chartRect = chartEl.getBoundingClientRect();
    const w = Math.max(10, Math.round(chartRect.width));
    const h = Math.max(10, Math.round(chartRect.height));

    const xs = [];
    const baseYs = [];
    const heights = [];
    for(let i=0;i<12;i++){
      const r = cols[i].getBoundingClientRect();
      const x = (r.left + r.width/2) - chartRect.left;
      const baseY = (r.top + r.height) - chartRect.top;
      xs.push(x);
      baseYs.push(baseY);
      heights.push(r.height);
    }

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.classList.add('tab71-analytics-trend');
    svg.style.position = 'absolute';
    svg.style.inset = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';

    (series || []).forEach((s, idx) => {
      const color = stableColorForIndex(idx);
      // Only reflect months that actually have values.
      // New items should not have trendlines extending into earlier/later empty months.
      const points = new Array(12).fill(null);
      let any = false;
      for(let i=0;i<12;i++){
        const v = s.monthly[i] || 0;
        if(v > 0){
          any = true;
          const hh = heights[i] || 1;
          const y = baseYs[i] - (maxV ? (v / maxV) * hh : 0);
          points[i] = [xs[i], y, v];
        }
      }
      if(!any) return;

      // Draw polylines only across contiguous non-null points.
      let run = [];
      function flushRun(){
        if(run.length >= 2){
          const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
          poly.setAttribute('fill', 'none');
          poly.setAttribute('stroke', color);
          poly.setAttribute('stroke-opacity', '0.62');
          poly.setAttribute('stroke-width', '1.5');
          poly.setAttribute('points', run.map(p => p[0].toFixed(1)+','+p[1].toFixed(1)).join(' '));
          poly.style.pointerEvents = 'none';
          svg.appendChild(poly);
        }
        run = [];
      }
      for(let i=0;i<12;i++){
        const p = points[i];
        if(p){
          run.push(p);
        }else{
          flushRun();
        }
      }
      flushRun();

      // Dots only where value exists.
      for(let i=0;i<12;i++){
        const p = points[i];
        if(!p) continue;
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', p[0].toFixed(1));
        c.setAttribute('cy', p[1].toFixed(1));
        c.setAttribute('r', '3.6');
        c.setAttribute('fill', color);
        c.setAttribute('fill-opacity', '0.9');
        c.setAttribute('stroke', '#ffffff');
        c.setAttribute('stroke-opacity', '0.95');
        c.setAttribute('stroke-width', '0.9');

        const monthNum = i + 1;
        const val = p[2] || 0;
        const title = s.label;
        const subtitle = String(year) + '년 ' + String(monthNum) + '월';
        c.addEventListener('mouseenter', function(ev){
          showAnalyticsTooltip({ title: title, subtitle: subtitle, valueText: formatNumberLocale(val) }, ev.clientX, ev.clientY);
        });
        c.addEventListener('mousemove', function(ev){
          showAnalyticsTooltip({ title: title, subtitle: subtitle, valueText: formatNumberLocale(val) }, ev.clientX, ev.clientY);
        });
        c.addEventListener('mouseleave', function(){
          hideAnalyticsTooltip();
        });

        svg.appendChild(c);
      }
    });

    return svg;
  }

  function computeMonthlyTotalsFromItems(items){
    const totals = new Array(12).fill(0);
    let grand = 0;
    (items || []).forEach(it => {
      for(let i=0;i<12;i++){
        const key = 'm' + String(i+1).padStart(2,'0');
        const v = toIntOrNull(it ? it[key] : null) || 0;
        totals[i] += v;
        grand += v;
      }
    });
    return { totals, grand };
  }

  function renderAnalyticsChart(modal, year, items){
    if(!modal) return;
    const subtitle = modal.querySelector('#hw-analytics-subtitle');
    const totalEl = modal.querySelector('#hw-analytics-total');
    const loadingEl = modal.querySelector('#hw-analytics-loading');
    const emptyEl = modal.querySelector('#hw-analytics-empty');
    const chartEl = modal.querySelector('#hw-analytics-chart');
    if(subtitle) subtitle.textContent = String(year) + '년 월별 유지보수 합계';
    if(!chartEl) return;

    if(loadingEl) loadingEl.style.display = 'none';

    const series = computeStackSeries(items);

    const { totals, grand } = computeMonthlyTotalsFromSeries(series);
    const maxV = Math.max.apply(null, totals.concat([0]));
    if(totalEl) totalEl.textContent = '연간 합계: ' + formatNumberLocale(grand);

    chartEl.innerHTML = '';
    if(!items || !items.length || maxV <= 0){
      if(emptyEl) emptyEl.style.display = 'flex';
      chartEl.style.display = 'none';
      try{ initNoDataAnim(modal); }catch(_){ }
      return;
    }
    if(emptyEl) emptyEl.style.display = 'none';
    try{ destroyNoDataAnim(modal); }catch(_){ }
    chartEl.style.display = '';

    for(let i=0;i<12;i++){
      const monthNum = i + 1;
      const monthLabel = String(monthNum).padStart(2,'0');
      const totalV = totals[i] || 0;
      const h = maxV ? Math.round((totalV / maxV) * 100) : 0;
      const bar = document.createElement('div');
      bar.className = 'tab71-analytics-bar';

      const col = document.createElement('div');
      col.className = 'tab71-analytics-bar__col';
      col.title = String(year) + '년 ' + String(monthNum) + '월: ' + formatNumberLocale(totalV);

      let cum = 0;
      series.forEach((s, idx) => {
        const v = s.monthly[i] || 0;
        if(v <= 0) return;
        const hh = maxV ? (v / maxV) * 100 : 0;
        const seg = document.createElement('div');
        seg.className = 'tab71-analytics-bar__seg';
        seg.style.height = hh.toFixed(2) + '%';
        seg.style.bottom = (maxV ? ((cum / maxV) * 100) : 0).toFixed(2) + '%';
        // No categories/legend, but keep colors consistent between bars and trendlines.
        const baseColor = stableColorForIndex(idx);
        seg.style.background = premiumBarGradient(baseColor);
        seg.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.35)';
        seg.title = s.label + ': ' + formatNumberLocale(v);
        col.appendChild(seg);
        cum += v;
      });

      const lab = document.createElement('div');
      lab.className = 'tab71-analytics-bar__label';
      lab.textContent = String(monthNum) + '월';
      const val = document.createElement('div');
      val.className = 'tab71-analytics-bar__value';
      val.textContent = totalV ? formatNumberLocale(totalV) : '-';

      bar.appendChild(col);
      bar.appendChild(lab);
      bar.appendChild(val);
      chartEl.appendChild(bar);
    }

    // Trendline overlay (each item; dots per month) — align to bar centers
    try{
      hideAnalyticsTooltip();
      chartEl.classList.add('is-has-trend');
      const existing = chartEl.querySelector('svg.tab71-analytics-trend');
      if(existing && existing.parentNode) existing.parentNode.removeChild(existing);
      const trend = buildMultiTrendSvg(chartEl, year, maxV, series);
      if(trend) chartEl.appendChild(trend);
    }catch(_eTrend){ }
  }

  function formatMoneyValue(raw){
    const n = toIntOrNull(raw);
    if(n == null) return '';
    return formatNumberLocale(n);
  }

  function formatMoneyInput(input){
    if(!input || input.dataset.__tab61Fmt === '1') return;
    input.dataset.__tab61Fmt = '1';
    try{
      const before = String(input.value == null ? '' : input.value);
      const start = (typeof input.selectionStart === 'number') ? input.selectionStart : before.length;
      const digitsLeft = before.slice(0, start).replace(/[^0-9]/g, '').length;

      const formatted = formatMoneyValue(before);
      input.value = formatted;

      // Restore caret roughly to the same digit position.
      if(typeof input.setSelectionRange === 'function'){
        let pos = formatted.length;
        if(digitsLeft > 0){
          let seen = 0;
          for(let i=0;i<formatted.length;i++){
            if(/[0-9]/.test(formatted[i])){
              seen++;
              if(seen >= digitsLeft){ pos = i+1; break; }
            }
          }
        }else{
          pos = 0;
        }
        try{ input.setSelectionRange(pos, pos); }catch(_){ }
      }
    }catch(_){ /* no-op */ }
    try{ delete input.dataset.__tab61Fmt; }catch(_){ input.dataset.__tab61Fmt = ''; }
  }

  function escapeHtml(str){
    return String(str==null?'':str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[s]));
  }

  function toast(msg, level){
    try{
      if(window.showToast) window.showToast(String(msg||''), level||'error');
      else alert(String(msg||''));
    }catch(_){
      try{ console.warn(msg); }catch(__){ }
    }
  }

  function escapeCSV(val){
    return '"' + String(val == null ? '' : val).replace(/\r\n/g,'\n').replace(/\r/g,'\n').replace(/"/g,'""') + '"';
  }

  function downloadCSV(filename, lines){
    const csv = '\uFEFF' + lines.join('\r\n');
    try{
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }catch(_){
      const a2 = document.createElement('a');
      a2.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
      a2.download = filename;
      document.body.appendChild(a2);
      a2.click();
      document.body.removeChild(a2);
    }
  }

  function safeFilenamePart(v){
    const s = String(v == null ? '' : v).trim();
    if(!s) return '';
    return s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_').slice(0, 80);
  }

  function csvCellText(td){
    if(!td) return '';
    try{
      const inp = td.querySelector('input, textarea');
      if(inp && typeof inp.value === 'string') return String(inp.value || '').trim();
      const sel = td.querySelector('select');
      if(sel) return String(sel.value || '').trim();
    }catch(_){ }
    return String(td.textContent || '').trim().replace(/\s+/g,' ');
  }

  async function readJsonOrNull(response){
    const ct = (response && response.headers && response.headers.get) ? (response.headers.get('content-type') || '') : '';
    if(ct.toLowerCase().includes('application/json')){
      return await response.json().catch(() => null);
    }
    return null;
  }

  function setText(el, val){ if(el) el.textContent = String(val==null? '' : val); }

  async function apiList(params){
    const url = '/api/cost-contract-lines?' + new URLSearchParams(params).toString();
    const r = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
    const j = await readJsonOrNull(r);
    if(!r.ok || !j || !j.success){
      const msg = (j && j.message) ? j.message
        : (!j ? '로그인이 필요하거나 응답 형식이 올바르지 않습니다.' : ('HTTP ' + r.status));
      throw new Error(msg);
    }
    const items = j.items || [];
    try{
      const year = parseInt(String((params && (params.year||params.Year)) || ''), 10);
      if(Array.isArray(items) && year){
        items.forEach(it => applyAutoStatusToItem(it, year));
      }
    }catch(_){ }
    return items;
  }

  async function apiCreate(payload){
    const r = await fetch('/api/cost-contract-lines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload||{})
    });
    const j = await readJsonOrNull(r);
    if(!r.ok || !j || !j.success){
      const msg = (j && j.message) ? j.message
        : (!j ? '로그인이 필요하거나 응답 형식이 올바르지 않습니다.' : ('HTTP ' + r.status));
      throw new Error(msg);
    }
    return j.item;
  }

  async function apiUpdate(id, payload){
    const r = await fetch('/api/cost-contract-lines/' + encodeURIComponent(String(id)), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload||{})
    });
    const j = await readJsonOrNull(r);
    if(!r.ok || !j || !j.success){
      const msg = (j && j.message) ? j.message
        : (!j ? '로그인이 필요하거나 응답 형식이 올바르지 않습니다.' : ('HTTP ' + r.status));
      throw new Error(msg);
    }
    return j.item;
  }

  async function apiDelete(id){
    const r = await fetch('/api/cost-contract-lines/' + encodeURIComponent(String(id)), {
      method: 'DELETE',
      headers: { 'Accept': 'application/json' }
    });
    const j = await readJsonOrNull(r);
    if(!r.ok || !j || !j.success){
      const msg = (j && j.message) ? j.message
        : (!j ? '로그인이 필요하거나 응답 형식이 올바르지 않습니다.' : ('HTTP ' + r.status));
      throw new Error(msg);
    }
    return true;
  }

  function buildRow(item, year){
    const tr = document.createElement('tr');
    if(item && item.id != null) tr.dataset.tab61Id = String(item.id);

    function tdText(col, text){
      const td = document.createElement('td');
      td.setAttribute('data-col', col);
      const val = (text==null || text==='') ? '-' : String(text);
      if(col === 'system_name'){
        // Keep table compact (2-line clamp), but never "hide" long names: show full via tooltip.
        td.title = (val === '-') ? '' : val;
        const span = document.createElement('span');
        span.className = 'tab71-cell-wrap';
        span.textContent = val;
        td.appendChild(span);
      }else{
        td.textContent = val;
      }
      return td;
    }

    const cbTd = document.createElement('td');
    cbTd.innerHTML = '<input type="checkbox" class="hw-row-check" aria-label="행 선택">';

    const statusTd = document.createElement('td');
    statusTd.setAttribute('data-col', 'contract_status');
    renderContractStatusCell(statusTd, item ? item.contract_status : '');
    const nameTd = tdText('work_name', item ? item.work_name : '');
    const sysTd = tdText('system_name', item ? item.system_name : '');
    const typeTd = tdText('contract_type', item ? item.contract_type : '');
    const vendorTd = tdText('contract_vendor', item ? item.contract_vendor : '');
    const modelTd = tdText('contract_model', item ? item.contract_model : '');
    const serialTd = tdText('contract_serial', item ? item.contract_serial : '');

    const sumTd = document.createElement('td');
    sumTd.className = 'sum-col';
    sumTd.setAttribute('data-col', 'sum');
    sumTd.textContent = item ? formatNumberLocale(item.sum || 0) : '-';

    const monthTds = [];
    for(let i=1;i<=12;i++){
      const k = 'm' + String(i).padStart(2,'0');
      const td = document.createElement('td');
      td.setAttribute('data-col', k);
      const v = item ? item[k] : null;
      td.textContent = (v==null || v===0) ? '-' : formatNumberLocale(v);
      monthTds.push(td);
    }

    const actionsTd = document.createElement('td');
    actionsTd.className = 'system-actions table-actions';
    actionsTd.innerHTML = ''
      + '<button class="action-btn js-tab61-edit" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button>'
      + '<button class="action-btn js-tab61-save" data-action="save" type="button" title="저장" aria-label="저장" style="display:none;"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button>'
      + '<button class="action-btn danger js-tab61-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>';

    tr.appendChild(cbTd);
    tr.appendChild(statusTd);
    tr.appendChild(nameTd);
    tr.appendChild(sysTd);
    tr.appendChild(typeTd);
    tr.appendChild(vendorTd);
    tr.appendChild(modelTd);
    tr.appendChild(serialTd);
    tr.appendChild(sumTd);
    monthTds.forEach(td => tr.appendChild(td));
    tr.appendChild(actionsTd);

    tr.dataset.tab61Year = String(year);
    return tr;
  }

  function enterEditMode(tr){
    if(!tr || tr.dataset.editing==='1') return;
    tr.dataset.editing='1';
    const targetType = (typeof getTab61ContractTargetType === 'function') ? getTab61ContractTargetType() : '';
    const editBtn = tr.querySelector('.js-tab61-edit');
    const saveBtn = tr.querySelector('.js-tab61-save');
    if(editBtn) editBtn.style.display='none';
    if(saveBtn) saveBtn.style.display='';

    ensureTab61SearchSources();
    const editableCols = ['contract_status','work_name','system_name','contract_type','contract_vendor','contract_model','contract_serial'];
    for(let i=1;i<=12;i++) editableCols.push('m'+String(i).padStart(2,'0'));

    editableCols.forEach(col => {
      const td = tr.querySelector('[data-col="'+col+'"]');
      if(!td) return;
      const raw = (td.textContent||'').trim();
      const val = raw==='-' ? '' : raw.replace(/,/g,'');

      if(col === 'contract_status'){
        const sel = document.createElement('select');
        sel.className = 'form-input tab61-input search-select';
        sel.style.width = '100%';
        sel.setAttribute('data-edit-col', col);
        sel.setAttribute('data-searchable-scope', 'page');
        sel.setAttribute('data-placeholder', '계약 상태 선택');

        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = '선택';
        sel.appendChild(emptyOpt);
        CONTRACT_STATUS_OPTIONS.forEach(function(s){
          const opt = document.createElement('option');
          opt.value = s;
          opt.textContent = s;
          sel.appendChild(opt);
        });
        sel.value = CONTRACT_STATUS_OPTIONS.includes(val) ? val : '';

        td.textContent='';
        td.appendChild(sel);
        try{
          if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
            window.BlossomSearchableSelect.syncAll(td);
          }
        }catch(_){ }
        return;
      }

      if(col === 'work_name'){
        const sysTd0 = tr.querySelector('[data-col="system_name"]');
        const sys0raw = sysTd0 ? (sysTd0.textContent || '') : '';
        const sys0 = normStr((sys0raw || '').trim() === '-' ? '' : sys0raw);
        const normWork = normalizeWorkNameValue(val);
        const sel = makeSearchSelect({ col: col, value: normWork, source: 'tab61_work_name', placeholder: '업무 이름' });
        td.textContent='';
        td.appendChild(sel);

        let prevWork = normStr(sel.value);
        sel.addEventListener('change', async function(){
          const w = normStr(sel.value);
          if(w !== prevWork){
            prevWork = w;
            updateCascadeStateForRow(tr, { clearFrom: 'work' });
          }
          const sysTd = tr.querySelector('[data-col="system_name"]');
          const sysInp = sysTd ? sysTd.querySelector('input[data-edit-col="system_name"]') : null;
          if(!w){
            if(sysInp) sysInp.value = '';
            return;
          }
          const sys = await resolveSystemNameFromWork(w);
          if(!sys) return;
          if(sysInp){ sysInp.value = sys; }
          else if(sysTd){ sysTd.textContent = sys; }

          try{
            if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
              window.BlossomSearchableSelect.syncAll(tr);
            }
          }catch(_){ }
        });

        try{
          if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
            window.BlossomSearchableSelect.syncAll(td);
          }
        }catch(_){ }
        return;
      }

      if(col === 'system_name'){
        const input = document.createElement('input');
        input.className = 'form-input tab61-input tab61-readonly';
        input.style.width = '100%';
        input.style.height = '30px';
        input.style.padding = '4px 6px';
        input.style.fontSize = '12px';
        input.value = val;
        input.disabled = true;
        input.readOnly = true;
        input.tabIndex = -1;
        input.setAttribute('aria-disabled', 'true');
        input.setAttribute('data-edit-col', col);
        td.textContent='';
        td.appendChild(input);
        return;
      }

      if(col === 'contract_type' || col === 'contract_vendor' || col === 'contract_model' || col === 'contract_serial'){
        const source = (col === 'contract_type') ? 'tab61_component_type'
          : (col === 'contract_vendor') ? 'tab61_component_vendor'
          : (col === 'contract_model') ? 'tab61_component_model'
          : 'tab61_component_serial';
        const placeholder = (col === 'contract_type') ? '계약 유형'
          : (col === 'contract_vendor') ? '계약 제조사'
          : (col === 'contract_model') ? '계약 모델'
          : '계약 일련번호';

        // ETC is not backed by tab01(components) nor tab02(software).
        // Keep these fields as free-text inputs to avoid binding to hardware/software catalogs.
        if(targetType === 'ETC'){
          const input = document.createElement('input');
          input.className = 'form-input tab61-input';
          input.style.width = '100%';
          input.style.height = '30px';
          input.style.padding = '4px 6px';
          input.style.fontSize = '12px';
          input.value = val;
          input.placeholder = placeholder;
          input.autocomplete = 'off';
          input.spellcheck = false;
          try{
            const maxLen = (col === 'contract_type') ? 80
              : (col === 'contract_vendor') ? 120
              : (col === 'contract_model') ? 120
              : 160;
            input.maxLength = maxLen;
          }catch(_){ }
          input.setAttribute('data-edit-col', col);
          input.addEventListener('blur', function(){
            try{
              const t = (input.value || '').trim();
              input.value = (t === '-') ? '' : t;
            }catch(_){ }
          });
          td.textContent='';
          td.appendChild(input);
          return;
        }

        const sel = makeSearchSelect({ col: col, value: val, source: source, placeholder: placeholder });
        td.textContent='';
        td.appendChild(sel);
        if(col === 'contract_type'){
          let prevType = normStr(val);
          sel.addEventListener('change', function(){
            const cur = normStr(sel.value);
            if(cur !== prevType){
              const workV = readRowCellValue(tr, 'work_name');
              if(isDuplicateWorkTypeInTable(tr, workV, cur)){
                try{ sel.value = prevType; }catch(_){ }
                try{
                  if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
                    window.BlossomSearchableSelect.syncAll(tr);
                  }
                }catch(_){ }
                try{ alert('이미 선택된 업무/계약 유형 조합입니다. 다른 계약 유형을 선택해 주세요.'); }catch(_){ }
                return;
              }
              prevType = cur;
              updateCascadeStateForRow(tr, { clearFrom: 'type' });
            }
            applyComponentMappingForRow(tr);
          });
        }else if(col === 'contract_vendor'){
          let prevVendor = normStr(val);
          sel.addEventListener('change', function(){
            const cur = normStr(sel.value);
            if(cur !== prevVendor){ prevVendor = cur; updateCascadeStateForRow(tr, { clearFrom: 'vendor' }); }
            applyComponentMappingForRow(tr);
          });
        }else if(col === 'contract_model'){
          let prevModel = normStr(val);
          sel.addEventListener('change', function(){
            const cur = normStr(sel.value);
            if(cur !== prevModel){ prevModel = cur; updateCascadeStateForRow(tr, { clearFrom: 'model' }); }
            applyComponentMappingForRow(tr);
          });
        }else{
          sel.addEventListener('change', function(){ applyComponentMappingForRow(tr); });
        }
        try{
          if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
            window.BlossomSearchableSelect.syncAll(td);
          }
        }catch(_){ }
        return;
      }

      const input = document.createElement('input');
      input.className = 'form-input tab61-input';
      input.style.width = '100%';
      input.style.height = '30px';
      input.style.padding = '4px 6px';
      input.style.fontSize = '12px';
      if(/^m\d{2}$/.test(col)) input.value = formatMoneyValue(val);
      else input.value = val;
      input.setAttribute('data-edit-col', col);
      td.textContent='';
      td.appendChild(input);

      if(/^m\d{2}$/.test(col)){
        input.setAttribute('inputmode', 'numeric');
        input.addEventListener('input', function(){
          formatMoneyInput(input);
          try{ updateTotals(tr.closest('table')); }catch(_){ }

          // Auto-expire status when the last non-zero month is behind the current month.
          try{
            const metaYear = parseInt(String(tr.dataset && tr.dataset.tab61Year ? tr.dataset.tab61Year : ''), 10);
            if(metaYear){
              const stTd = tr.querySelector('[data-col="contract_status"]');
              const sel = stTd ? stTd.querySelector('select[data-edit-col="contract_status"]') : null;
              const cur = sel ? normStr(sel.value) : normStr(stTd ? stTd.textContent : '');
              if(cur !== '해지'){
                const tmp = { contract_status: cur };
                for(let i2=1;i2<=12;i2++){
                  const k2='m'+String(i2).padStart(2,'0');
                  const td2 = tr.querySelector('[data-col="'+k2+'"]');
                  const inp2 = td2 ? td2.querySelector('input[data-edit-col="'+k2+'"]') : null;
                  tmp[k2] = toIntOrNull(inp2 ? inp2.value : (td2 ? td2.textContent : ''));
                }
                const next = computeAutoContractStatus(tmp, metaYear);
                if(next === '만료' && sel){
                  sel.value = '만료';
                  try{
                    if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
                      window.BlossomSearchableSelect.syncAll(tr);
                    }
                  }catch(_){ }
                }
              }
            }
          }catch(_){ }
        });
        input.addEventListener('blur', function(){ formatMoneyInput(input); });
      }
    });

    try{
      if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function'){
        window.BlossomSearchableSelect.enhance(tr);
      }
      if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
        window.BlossomSearchableSelect.syncAll(tr);
      }
    }catch(_){ }

    try{ updateCascadeStateForRow(tr); }catch(_){ }

    // ETC must not auto-map from hardware/software catalogs.
    if(targetType !== 'ETC'){
      try{ setTimeout(function(){ applyComponentMappingForRow(tr); }, 0); }catch(_){ }
    }
  }

  function exitEditMode(tr, savedItem){
    tr.dataset.editing='0';
    const editBtn = tr.querySelector('.js-tab61-edit');
    const saveBtn = tr.querySelector('.js-tab61-save');
    if(editBtn) editBtn.style.display='';
    if(saveBtn) saveBtn.style.display='none';

    const item = savedItem || {};
    function setTd(col, txt){
      const td = tr.querySelector('[data-col="'+col+'"]');
      if(!td) return;
      td.innerHTML = '';
      td.textContent = (txt==null || txt==='' || txt===0) ? '-' : String(txt);
    }
    try{
      const stTd = tr.querySelector('[data-col="contract_status"]');
      if(stTd) renderContractStatusCell(stTd, item.contract_status || '');
    }catch(_){ setTd('contract_status', item.contract_status || ''); }
    setTd('work_name', item.work_name || '');
    setTd('system_name', item.system_name || '');
    setTd('contract_type', item.contract_type || '');
    setTd('contract_vendor', item.contract_vendor || '');
    setTd('contract_model', item.contract_model || '');
    setTd('contract_serial', item.contract_serial || '');

    for(let i=1;i<=12;i++){
      const k='m'+String(i).padStart(2,'0');
      const v = item[k] || 0;
      setTd(k, v ? formatNumberLocale(v) : '-');
    }
    const sumTd = tr.querySelector('[data-col="sum"]');
    if(sumTd) sumTd.textContent = formatNumberLocale(item.sum || 0);
  }

  function readPayloadFromRow(tr, meta){
    function read(col){
      const td = tr.querySelector('[data-col="'+col+'"]');
      if(!td) return '';
      const sel = td.querySelector('select[data-edit-col="'+col+'"]');
      if(sel) return (sel.value||'').trim();
      const inp = td.querySelector('input[data-edit-col="'+col+'"]');
      if(inp) return (inp.value||'').trim();
      const raw = (td.textContent||'').trim();
      return raw==='-' ? '' : raw;
    }

    const payload = {
      scope: meta.scope,
      cost_type: meta.costType,
      contract_id: meta.contractId,
      year: meta.year,
      contract_status: read('contract_status'),
      work_name: read('work_name'),
      system_name: read('system_name'),
      contract_type: read('contract_type'),
      contract_vendor: read('contract_vendor'),
      contract_model: read('contract_model'),
      contract_serial: read('contract_serial'),
    };
    for(let i=1;i<=12;i++){
      const k='m'+String(i).padStart(2,'0');
      payload[k] = toIntOrNull(read(k));
    }

    // Enforce auto-expire rule on save payload as well.
    try{
      const year = parseInt(String(payload.year||meta.year||''), 10);
      const status = normStr(payload.contract_status);
      if(status !== '해지'){
        const tmp = { contract_status: status };
        for(let i=1;i<=12;i++){
          const k='m'+String(i).padStart(2,'0');
          tmp[k] = payload[k];
        }
        const next = computeAutoContractStatus(tmp, year);
        if(next === '만료') payload.contract_status = '만료';
      }
    }catch(_){ }
    return payload;
  }

  function updateTotals(table){
    try{
      const tbody = table.querySelector('tbody');
      const rows = Array.from(tbody.querySelectorAll('tr'));
      const totals = {};
      for(let i=1;i<=12;i++) totals['m'+String(i).padStart(2,'0')] = 0;

      rows.forEach(tr => {
        for(let i=1;i<=12;i++){
          const k='m'+String(i).padStart(2,'0');
          const td = tr.querySelector('[data-col="'+k+'"]');
          const inp = td ? td.querySelector('input[data-edit-col="'+k+'"]') : null;
          const raw = inp ? (inp.value||'') : (td ? (td.textContent||'') : '');
          const n = toIntOrNull(raw);
          totals[k] += (n||0);
        }
      });
      const sumTotal = Object.values(totals).reduce((a,b)=>a+(b||0),0);

      const foot = table.querySelector('tfoot');
      if(!foot) return;
      const sumCell = foot.querySelector('[data-total="sum"]');
      if(sumCell) sumCell.textContent = formatNumberLocale(sumTotal);
      for(let i=1;i<=12;i++){
        const k='m'+String(i).padStart(2,'0');
        const cell = foot.querySelector('[data-total="'+k+'"]');
        if(cell) cell.textContent = formatNumberLocale(totals[k]||0);
      }
    }catch(_){ /* no-op */ }
  }

  function setEmptyState(table, emptyEl){
    const has = !!(table && table.querySelector('tbody tr'));
    if(emptyEl){
      emptyEl.hidden = has;
      emptyEl.style.display = has ? 'none' : '';
    }
  }

  function updateMonthHeaders(table, year){
    try{
      const ths = Array.from(table.querySelectorAll('thead th'));
      if(!ths.length) return;

      // Month headers start right after the sum column header.
      const sumTh = table.querySelector('thead th.sum-col');
      const sumIdx = sumTh ? ths.indexOf(sumTh) : -1;
      const startIdx = (sumIdx >= 0) ? (sumIdx + 1) : 0;
      if(startIdx <= 0) return;

      for(let i=0;i<12;i++){
        const idx = startIdx + i;
        const th = ths[idx];
        if(th) th.textContent = year + '-' + String(i+1).padStart(2,'0');
      }
    }catch(_){ }
  }


  function initFromPage(){
    const table = document.getElementById('hw-spec-table');
    if(!table) return false;

    ensureCompactStyle();
    try{ if(table.dataset && table.dataset.tab61Init === '1') return true; }catch(_){ }
    try{ if(table.dataset) table.dataset.tab61Init = '1'; }catch(_){ }

    const yearSel = document.getElementById('hw-year-select');
    const emptyEl = document.getElementById('hw-empty');
    const infoEl = document.getElementById('hw-pagination-info');
    const numWrap = document.getElementById('hw-page-numbers');
    const btnFirst = document.getElementById('hw-first');
    const btnPrev = document.getElementById('hw-prev');
    const btnNext = document.getElementById('hw-next');
    const btnLast = document.getElementById('hw-last');
    const addBtn = document.getElementById('hw-row-add');
    const yearAddBtn = document.getElementById('hw-year-add-btn');
    const analyticsBtn = document.getElementById('hw-analytics-btn');
    const selectAll = document.getElementById('hw-select-all');
    const downloadBtn = document.getElementById('hw-download-btn');

    function openModalLocal(id){
      const el = document.getElementById(id);
      if(!el) return;
      document.body.classList.add('modal-open');
      el.classList.add('show');
      el.setAttribute('aria-hidden','false');
    }
    function closeModalLocal(id){
      const el = document.getElementById(id);
      if(!el) return;
      el.classList.remove('show');
      el.setAttribute('aria-hidden','true');
      if(!document.querySelector('.modal-overlay-full.show')) document.body.classList.remove('modal-open');
    }

    function getSelectedRowCount(){
      const checks = table.querySelectorAll('tbody .hw-row-check:not([disabled])');
      let n = 0;
      checks.forEach(function(c){ if(c && c.checked) n += 1; });
      return n;
    }

    function refreshDownloadModalUi(){
      const rowSelectedWrap = document.getElementById('hw-csv-range-row-selected');
      const optSelected = document.getElementById('hw-csv-range-selected');
      const optAll = document.getElementById('hw-csv-range-all');
      const subtitle = document.getElementById('hw-download-subtitle');

      const rows = table.querySelectorAll('tbody tr');
      const total = rows ? rows.length : 0;
      const selectedCount = getSelectedRowCount();

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
      const rows = Array.from(table.querySelectorAll('tbody tr'));
      const selectedCount = getSelectedRowCount();
      if(onlySelected && selectedCount <= 0){
        toast('선택된 행이 없습니다.', 'warning');
        return;
      }

      const ths = Array.from(table.querySelectorAll('thead th'));
      const headerCells = ths.slice(1, Math.max(1, ths.length - 1)); // skip checkbox & actions
      const headers = headerCells.map(th => (th ? (th.textContent || '') : '')).map(s => String(s||'').trim());

      const lines = [];
      lines.push(headers.map(escapeCSV).join(','));

      rows.forEach(function(tr){
        const cb = tr ? tr.querySelector('input[type="checkbox"].hw-row-check') : null;
        if(onlySelected && !(cb && cb.checked)) return;
        const tds = Array.from(tr.children).slice(1, Math.max(1, tr.children.length - 1));
        const vals = tds.map(function(td){
          let v = csvCellText(td);
          v = (v === '-') ? '' : v;
          return escapeCSV(v);
        });
        lines.push(vals.join(','));
      });

      if(lines.length <= 1){
        toast('내보낼 행이 없습니다.', 'warning');
        return;
      }

      const metaBase = detectScopeAndType();
      const contractId = getContractId();
      const stamp = (function(){
        try{
          const d = new Date();
          const y = d.getFullYear();
          const m = String(d.getMonth()+1).padStart(2,'0');
          const dd = String(d.getDate()).padStart(2,'0');
          const hh = String(d.getHours()).padStart(2,'0');
          const mm = String(d.getMinutes()).padStart(2,'0');
          return '' + y + m + dd + '_' + hh + mm;
        }catch(_){
          return '';
        }
      })();

      const nameParts = [
        'cost_contract',
        metaBase && metaBase.scope ? metaBase.scope : '',
        metaBase && metaBase.costType ? metaBase.costType : '',
        contractId ? ('id' + String(contractId)) : '',
        year ? ('y' + String(year)) : '',
        onlySelected ? 'selected' : 'all'
      ].map(safeFilenamePart).filter(Boolean);
      const filename = (nameParts.join('_') || 'cost_contract') + (stamp ? ('_' + stamp) : '') + '.csv';

      downloadCSV(filename, lines);
    }

    function syncRowSelected(tr){
      if(!tr) return;
      const cb = tr.querySelector('input[type="checkbox"].hw-row-check');
      if(!cb) return;
      tr.classList.toggle('selected', !!cb.checked);
    }

    // Pagination UI must stay (tab14 style), but tab61 must remain single-page.
    // Achieve this by using a huge pageSize so all rows fit on page 1.
    const hwState = { page: 1, pageSize: 2147483647 };

    function hwRows(){
      try{ return Array.from(table.querySelectorAll('tbody tr')); }catch(_){ return []; }
    }
    function hwTotal(){
      return hwRows().length;
    }
    function hwPages(){
      const total = hwTotal();
      return Math.max(1, Math.ceil(total / hwState.pageSize));
    }
    function hwClampPage(){
      const pages = hwPages();
      if(hwState.page > pages) hwState.page = pages;
      if(hwState.page < 1) hwState.page = 1;
    }

    function syncSelectAll(){
      if(!selectAll) return;
      const checks = table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check:not([disabled])');
      if(!checks.length){ selectAll.checked = false; return; }
      selectAll.checked = Array.prototype.every.call(checks, function(c){ return !!c.checked; });
    }

    function hwUpdatePaginationUI(){
      const total = hwTotal();
      const pages = hwPages();
      if(infoEl){
        const start = total ? ((hwState.page - 1) * hwState.pageSize + 1) : 0;
        const end = Math.min(total, hwState.page * hwState.pageSize);
        infoEl.textContent = start + '-' + end + ' / ' + total + '개 항목';
      }
      if(numWrap){
        numWrap.innerHTML = '';
        for(let p=1; p<=pages && p<=50; p++){
          const b = document.createElement('button');
          b.className = 'page-btn' + (p === hwState.page ? ' active' : '');
          b.textContent = String(p);
          b.dataset.page = String(p);
          numWrap.appendChild(b);
        }
      }
      if(btnFirst) btnFirst.disabled = (hwState.page === 1);
      if(btnPrev) btnPrev.disabled = (hwState.page === 1);
      if(btnNext) btnNext.disabled = (hwState.page === pages);
      if(btnLast) btnLast.disabled = (hwState.page === pages);
    }

    function hwRenderPage(){
      const rows = hwRows();
      rows.forEach(function(tr, idx){
        const visible = true;
        tr.style.display = visible ? '' : 'none';
        if(visible) tr.removeAttribute('data-hidden');
        else tr.setAttribute('data-hidden','1');
        const cb = tr.querySelector('.hw-row-check');
        if(cb) tr.classList.toggle('selected', !!cb.checked && visible);
      });
      hwUpdatePaginationUI();
      syncSelectAll();
    }

    function hwGo(page){
      hwState.page = page;
      hwRenderPage();
      try{ refreshDownloadModalUi(); }catch(_){ }
    }
    function hwGoDelta(delta){
      hwGo(hwState.page + delta);
    }
    function hwGoFirst(){
      hwGo(1);
    }
    function hwGoLast(){
      hwGo(hwPages());
    }

    // Row selection UX (same behavior as onpremise detail tables).
    if(selectAll){
      selectAll.addEventListener('change', function(){
        const checks = table.querySelectorAll('tbody .hw-row-check:not([disabled])');
        checks.forEach(function(c){
          c.checked = !!selectAll.checked;
          const tr = c.closest('tr');
          const isHidden = tr && (tr.hasAttribute('data-hidden') || tr.style.display === 'none');
          if(!isHidden) c.checked = !!selectAll.checked;
          if(tr) tr.classList.toggle('selected', !!c.checked);
        });
        try{ refreshDownloadModalUi(); }catch(_){ }
      });
    }

    table.addEventListener('click', function(ev){
      const onControl = ev.target && ev.target.closest ? ev.target.closest('input, select, button, a, textarea') : null;
      const onCheckbox = ev.target && ev.target.closest ? ev.target.closest('input[type="checkbox"].hw-row-check') : null;
      if(onCheckbox){
        const tr = onCheckbox.closest('tr');
        if(tr) tr.classList.toggle('selected', !!onCheckbox.checked);
        syncSelectAll();
        try{ refreshDownloadModalUi(); }catch(_){ }
        return;
      }
      if(!onControl){
        const tr2 = ev.target && ev.target.closest ? ev.target.closest('tr') : null;
        if(!tr2) return;
        const cb2 = tr2.querySelector('input[type="checkbox"].hw-row-check');
        if(!cb2 || cb2.disabled) return;
        cb2.checked = !cb2.checked;
        tr2.classList.toggle('selected', !!cb2.checked);
        syncSelectAll();
        try{ refreshDownloadModalUi(); }catch(_){ }
      }
    });

    table.addEventListener('change', function(ev){
      const cb = ev.target && ev.target.closest ? ev.target.closest('input[type="checkbox"].hw-row-check') : null;
      if(!cb) return;
      const tr = cb.closest('tr');
      const isHidden = tr && (tr.hasAttribute('data-hidden') || tr.style.display === 'none');
      if(tr) tr.classList.toggle('selected', !!cb.checked && !isHidden);
      syncSelectAll();
      try{ refreshDownloadModalUi(); }catch(_){ }
    });

    // Pagination events (kept for UI consistency; pages will be 1)
    if(numWrap && !numWrap.__tab61Wired){
      numWrap.__tab61Wired = true;
      numWrap.addEventListener('click', function(e){
        const b = e && e.target && e.target.closest ? e.target.closest('button.page-btn') : null;
        if(!b) return;
        const p = parseInt(String(b.dataset.page||''), 10);
        if(!isNaN(p)) hwGo(p);
      });
    }
    if(btnFirst && !btnFirst.__tab61Wired){ btnFirst.__tab61Wired = true; btnFirst.addEventListener('click', hwGoFirst); }
    if(btnPrev && !btnPrev.__tab61Wired){ btnPrev.__tab61Wired = true; btnPrev.addEventListener('click', function(){ hwGoDelta(-1); }); }
    if(btnNext && !btnNext.__tab61Wired){ btnNext.__tab61Wired = true; btnNext.addEventListener('click', function(){ hwGoDelta(1); }); }
    if(btnLast && !btnLast.__tab61Wired){ btnLast.__tab61Wired = true; btnLast.addEventListener('click', hwGoLast); }

    // CSV download modal UX: enable/show "selected rows" only when there is selection.
    (function(){
      if(!downloadBtn) return;
      const modalId = 'hw-download-modal';
      const closeBtn = document.getElementById('hw-download-close');
      const confirmBtn = document.getElementById('hw-download-confirm');
      const modalEl = document.getElementById(modalId);

      downloadBtn.addEventListener('click', function(){
        try{
          const total = table.querySelectorAll('tbody tr').length;
          downloadBtn.disabled = !(total > 0);
          downloadBtn.title = total > 0 ? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.';
        }catch(_){ }
        if(downloadBtn.disabled) return;
        try{ refreshDownloadModalUi(); }catch(_){ }
        openModalLocal(modalId);
      });

      if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalLocal(modalId); }); }
      if(modalEl){
        modalEl.addEventListener('click', function(e){ if(e && e.target === modalEl) closeModalLocal(modalId); });
        document.addEventListener('keydown', function(e){ if(e && e.key === 'Escape' && modalEl.classList.contains('show')) closeModalLocal(modalId); });
      }

      // Confirmation handler may be wired by another bundle; keep this noop-safe.
      if(confirmBtn && !confirmBtn.__tab61Wired){
        confirmBtn.__tab61Wired = true;
        confirmBtn.addEventListener('click', function(){
          try{
            const onlySelected = !!(document.getElementById('hw-csv-range-selected') && document.getElementById('hw-csv-range-selected').checked);
            exportCSV(onlySelected);
          }catch(err){
            try{ toast((err && err.message) ? err.message : 'CSV 내보내기에 실패했습니다.'); }catch(_){ }
          }
          closeModalLocal(modalId);
        });
      }
    })();

    const metaBase = detectScopeAndType();
    const contractId = getContractId();

    const nowYear = (new Date()).getFullYear();
    let years = loadYears(metaBase, contractId);
    if(!years.length){
      // Seed a single year so the screen works immediately (removes legacy 3-year selector behavior)
      years = [nowYear];
      saveYears(metaBase, contractId, years);
    }else if(!years.includes(nowYear)){
      // Always include current year so the first screen can default to "this year" even if it has no rows yet.
      years = uniqIntYears(years.concat([nowYear]));
      saveYears(metaBase, contractId, years);
    }

    // First screen: default to the current year.
    let year = nowYear;
    if(!years.includes(year)) year = pickDefaultYear(years);
    if(yearSel) renderYearSelect(yearSel, years, year);

    let lastLoadedItems = [];

    async function load(){
      const meta = { scope: metaBase.scope, costType: metaBase.costType, contractId, year };
      updateMonthHeaders(table, year);

      try{
        const items = await apiList({ scope: meta.scope, cost_type: meta.costType, contract_id: String(meta.contractId), year: String(meta.year) });
        lastLoadedItems = Array.isArray(items) ? items : [];
        const tbody = table.querySelector('tbody');
        tbody.innerHTML='';
        lastLoadedItems.forEach(it => tbody.appendChild(buildRow(it, year)));
        hwState.page = 1;
        try{ hwRenderPage(); }catch(_){ }
        try{ refreshDownloadModalUi(); }catch(_){ }
        setEmptyState(table, emptyEl);
        updateTotals(table);

        const openModal = getOpenAnalyticsModal();
        if(openModal && openModal.__tab61YearPinned !== true){
          // keep modal in sync with page year unless user pinned a different year
          renderAnalyticsYearSelect(openModal, years, year);
          renderAnalyticsChart(openModal, year, lastLoadedItems);
        }
      }catch(err){
        try{ console.error('[tab71-opex] load failed', err); }catch(_){ }
        lastLoadedItems = [];
        hwState.page = 1;
        try{ hwRenderPage(); }catch(_){ }
        try{ refreshDownloadModalUi(); }catch(_){ }
        setEmptyState(table, emptyEl);
        updateTotals(table);

        const openModal = getOpenAnalyticsModal();
        if(openModal && openModal.__tab61YearPinned !== true){
          renderAnalyticsYearSelect(openModal, years, year);
          renderAnalyticsChart(openModal, year, lastLoadedItems);
        }
      }
    }

    if(yearSel){
      yearSel.addEventListener('change', function(){
        year = parseInt(yearSel.value,10) || nowYear;
        saveSelectedYear(metaBase, contractId, year);
        const openModal = getOpenAnalyticsModal();
        if(openModal && openModal.__tab61YearPinned !== true) setAnalyticsLoading(openModal, year);
        hwState.page = 1;
        load();
      });
    }

    if(analyticsBtn){
      analyticsBtn.addEventListener('click', function(){
        const modal = ensureAnalyticsModal();
        const open = modal && modal.__tab61Open;
        if(typeof open === 'function') open();

        // Default to the page-selected year on open, and allow pinning via modal year select.
        modal.__tab61YearPinned = false;
        modal.__tab61Items = lastLoadedItems;
        renderAnalyticsYearSelect(modal, years, year);
        renderAnalyticsChart(modal, year, lastLoadedItems);

        const yearSel2 = modal.querySelector('#hw-analytics-year-select');
        if(yearSel2 && !yearSel2.__tab61Wired){
          yearSel2.__tab61Wired = true;
          yearSel2.addEventListener('change', async function(){
            const y2 = parseInt(String(yearSel2.value||''), 10) || nowYear;
            modal.__tab61YearPinned = true;
            setAnalyticsLoading(modal, y2);
            try{
              const items2 = await apiList({ scope: metaBase.scope, cost_type: metaBase.costType, contract_id: String(contractId), year: String(y2) });
              modal.__tab61Items = Array.isArray(items2) ? items2 : [];
              renderAnalyticsChart(modal, y2, modal.__tab61Items);
            }catch(_){
              modal.__tab61Items = [];
              renderAnalyticsChart(modal, y2, modal.__tab61Items);
            }
          });
        }
      });
    }

    if(yearAddBtn && yearSel){
      yearAddBtn.addEventListener('click', function(){
        const existing = loadYears(metaBase, contractId);
        const base = existing.length ? (Math.max.apply(null, existing) + 1) : nowYear;

        wireYearAddModal();
        const modal = document.getElementById('hw-year-add-modal');
        const open = modal && modal.__tab61Open;
        if(typeof open !== 'function') return;

        open(base, function(newYear){
          const nextYears = uniqIntYears(existing.concat([newYear]));
          saveYears(metaBase, contractId, nextYears);
          years = nextYears;
          year = newYear;
          renderYearSelect(yearSel, years, year);
          saveSelectedYear(metaBase, contractId, year);
          load();
        });
      });
    }

    if(addBtn){
      addBtn.addEventListener('click', function(){
        const tbody = table.querySelector('tbody');
        const tr = buildRow(null, year);
        tbody.appendChild(tr);
        setEmptyState(table, emptyEl);
        hwGoLast();
        enterEditMode(tr);
      });
    }

    table.addEventListener('click', async function(ev){
      const btn = ev.target && ev.target.closest ? ev.target.closest('.js-tab61-edit, .js-tab61-save, .js-tab61-del') : null;
      if(!btn) return;
      const tr = btn.closest('tr');
      if(!tr) return;

      const meta = { scope: metaBase.scope, costType: metaBase.costType, contractId, year };

      if(btn.classList.contains('js-tab61-edit')){
        enterEditMode(tr);
        return;
      }

      if(btn.classList.contains('js-tab61-save')){
        try{
          const payload = readPayloadFromRow(tr, meta);

          // Prevent duplicate (work_name, contract_type) lines.
          try{
            const w = normStr(payload.work_name);
            const t = normStr(payload.contract_type);
            if(w && t && isDuplicateWorkTypeInTable(tr, w, t)){
              try{ alert('이미 선택된 업무/계약 유형 조합입니다. 다른 계약 유형을 선택해 주세요.'); }catch(_){ }
              return;
            }
          }catch(_){ }

          const id = tr.dataset.tab61Id ? parseInt(tr.dataset.tab61Id,10) : 0;
          const saved = id ? await apiUpdate(id, payload) : await apiCreate(payload);
          if(saved && saved.id != null) tr.dataset.tab61Id = String(saved.id);
          exitEditMode(tr, saved);
          setEmptyState(table, emptyEl);
          updateTotals(table);
          hwRenderPage();
        }catch(err){
          try{ console.error('[tab71-opex] save failed', err); }catch(_){ }
          try{ toast((err && err.message) ? err.message : '저장에 실패했습니다.'); }catch(_){ }
        }
        return;
      }

      if(btn.classList.contains('js-tab61-del')){
        const id = tr.dataset.tab61Id ? parseInt(tr.dataset.tab61Id,10) : 0;
        if(!id){
          tr.remove();
          setEmptyState(table, emptyEl);
          updateTotals(table);
          hwRenderPage();
          return;
        }
        try{
          await apiDelete(id);
          tr.remove();
          setEmptyState(table, emptyEl);
          updateTotals(table);
          hwRenderPage();
        }catch(err){
          try{ console.error('[tab71-opex] delete failed', err); }catch(_){ }
          try{ toast((err && err.message) ? err.message : '삭제에 실패했습니다.'); }catch(_){ }
        }
      }
    });

    load();
    return true;
  }

  window.BlossomTab61Contract = { initFromPage };
  window.BlossomTab61Contract.__version = VERSION;

  ready(function(){ try{ initFromPage(); }catch(_){ } });
  document.addEventListener('blossom:pageLoaded', function(){ try{ initFromPage(); }catch(_){ } });
})();

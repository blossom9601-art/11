// ---------- Rack elevation logic (integrated from rack_detail.js) ----------
(function(){
  // RACK 상세 (기본정보 탭)
  const palette = ['#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f','#edc949','#af7aa1','#ff9da7','#9c755f','#bab0ab'];

  function requestJSON(url, options){
    const opts = options ? { ...options } : {};
    opts.method = opts.method || 'GET';
    opts.credentials = opts.credentials || 'same-origin';
    opts.cache = opts.cache || 'no-cache';
    const headers = { ...(opts.headers || {}) };
    if(opts.body && typeof opts.body !== 'string'){
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    opts.headers = headers;
    return fetch(url, opts).then(function(res){
      return res.text().then(function(txt){
        let payload = null;
        try{ payload = txt ? JSON.parse(txt) : null; }catch(_e){ payload = null; }
        if(!res.ok || (payload && payload.success === false)){
          const msg = (payload && payload.message) ? payload.message : ('요청 실패 (HTTP ' + res.status + ')');
          throw new Error(msg);
        }
        return payload || {};
      });
    });
  }

  function _detailTargetForAssetType(assetType){
    const t = (assetType || '').toString().trim().toUpperCase();
    if(t === 'CLOUD') return { key: 'hw_server_cloud_detail', prefix: 'cloud' };
    if(t === 'FRAME') return { key: 'hw_server_frame_detail', prefix: 'frame' };
    if(t === 'WORKSTATION') return { key: 'hw_server_workstation_detail', prefix: 'workstation' };
    // default
    return { key: 'hw_server_onpremise_detail', prefix: 'onpremise' };
  }

  function _assetDetailApiForType(assetType){
    const t = (assetType || '').toString().trim().toUpperCase();
    if(t === 'CLOUD') return '/api/hardware/cloud/assets/';
    if(t === 'FRAME') return '/api/hardware/frame/assets/';
    if(t === 'WORKSTATION') return '/api/hardware/workstation/assets/';
    return '/api/hardware/onpremise/assets/';
  }

  let _deptMapPromise = null;
  function _loadDeptCodeToName(){
    if(_deptMapPromise) return _deptMapPromise;
    _deptMapPromise = requestJSON('/api/org-departments').then(function(p){
      const items = (p && p.items) ? p.items : [];
      const map = {};
      items.forEach(function(it){
        const code = (it && it.dept_code) ? String(it.dept_code).trim() : '';
        if(!code) return;
        const name = (it && it.dept_name) ? String(it.dept_name).trim() : '';
        map[code] = name || code;
      });
      return map;
    }).catch(function(){ return {}; });
    return _deptMapPromise;
  }

  let _workGroupMapPromise = null;
  function _loadWorkGroupCodeToName(){
    if(_workGroupMapPromise) return _workGroupMapPromise;
    _workGroupMapPromise = requestJSON('/api/work-groups').then(function(p){
      const items = (p && p.items) ? p.items : [];
      const map = {};
      items.forEach(function(it){
        const code = (it && it.group_code) ? String(it.group_code).trim() : '';
        if(!code) return;
        const name = (it && it.group_name) ? String(it.group_name).trim() : '';
        map[code] = name || code;
      });
      return map;
    }).catch(function(){ return {}; });
    return _workGroupMapPromise;
  }

  function _coreFlagLabel(isCore){
    const v = (isCore === true || isCore === 1 || isCore === '1');
    return v ? '핵심' : '일반';
  }

  function _oxLabel(flag){
    const v = (flag === true || flag === 1 || flag === '1' || String(flag||'').toUpperCase() === 'O');
    return v ? 'O' : 'X';
  }

  function _buildDetailRowFromAsset(asset, deptMap, workGroupMap){
    const wgCode = asset && (asset.work_group_code || '') ? String(asset.work_group_code).trim() : '';
    const sysDeptCode = asset && (asset.system_dept_code || '') ? String(asset.system_dept_code).trim() : '';
    const svcDeptCode = asset && (asset.service_dept_code || '') ? String(asset.service_dept_code).trim() : '';

    const row = {
      // Business
      work_status: asset && (asset.work_status_name || asset.work_status_code) || '',
      work_status_color: asset && asset.work_status_color,
      work_type: asset && (asset.work_type_name || asset.work_type_code) || '',
      work_category: asset && (asset.work_category_name || asset.work_category_code) || '',
      work_operation: asset && (asset.work_operation_name || asset.work_operation_code) || '',
      work_group: asset && (asset.work_group_name || (workGroupMap && workGroupMap[wgCode]) || wgCode) || '',
      work_name: asset && asset.work_name || '',

      // System
      system_name: asset && asset.system_name || '',
      system_ip: asset && asset.system_ip || '',
      manage_ip: asset && (asset.mgmt_ip || asset.manage_ip) || '',
      vendor: asset && (asset.manufacturer_name || asset.manufacturer_code) || '',
      model: asset && (asset.server_model_name || asset.server_code) || '',
      serial: asset && (asset.asset_code || asset.serial || '') || '',
      virtualization: asset && (asset.virtualization_type || asset.virtualization) || '',
      location_place: asset && (asset.center_name || asset.center_code) || '',
      location_pos: asset && (asset.rack_name || asset.rack_code) || '',
      slot: asset && asset.slot,
      u_size: asset && asset.u_size,

      // Owners
      sys_dept: asset && (asset.system_dept_name || (deptMap && deptMap[sysDeptCode]) || sysDeptCode) || '',
      sys_owner: asset && (asset.system_owner_name || asset.system_owner_emp_no) || '',
      svc_dept: asset && (asset.service_dept_name || (deptMap && deptMap[svcDeptCode]) || svcDeptCode) || '',
      svc_owner: asset && (asset.service_owner_name || asset.service_owner_emp_no) || '',

      // CIA / grade
      confidentiality: asset && asset.cia_confidentiality,
      integrity: asset && asset.cia_integrity,
      availability: asset && asset.cia_availability,
      security_score: asset && asset.security_score,
      system_grade: asset && asset.system_grade,
      core_flag: _coreFlagLabel(asset && asset.is_core_system),
      dr_built: _oxLabel(asset && asset.has_dr_site),
      svc_redundancy: _oxLabel(asset && asset.has_service_ha),
    };
    return row;
  }

  function _fetchFullAssetRecord(asset){
    try{
      const id = asset && asset.id;
      if(!(id || id === 0)) return Promise.resolve(asset || null);
      const base = _assetDetailApiForType(asset && asset.asset_type);
      return requestJSON(base + encodeURIComponent(String(id))).then(function(p){
        return (p && p.item) ? p.item : asset;
      }).catch(function(){ return asset || null; });
    }catch(_){
      return Promise.resolve(asset || null);
    }
  }

  function _seedSelectionAndGoToDetail(asset){
    // This must match list->detail behavior: provide a rich, display-ready row.
    const target = _detailTargetForAssetType(asset && asset.asset_type);
    Promise.all([
      _fetchFullAssetRecord(asset),
      _loadDeptCodeToName(),
      _loadWorkGroupCodeToName(),
    ]).then(function(results){
      const full = results[0];
      const deptMap = results[1] || {};
      const workGroupMap = results[2] || {};
      const workName = (full && full.work_name) ? String(full.work_name) : '';
      const systemName = (full && full.system_name) ? String(full.system_name) : '';
      const row = _buildDetailRowFromAsset(full || asset || {}, deptMap, workGroupMap);

      try{
        sessionStorage.setItem(target.prefix + ':selected:work_name', workName);
        sessionStorage.setItem(target.prefix + ':selected:system_name', systemName);
        sessionStorage.setItem(target.prefix + ':selected:row', JSON.stringify(row));
      }catch(_e){ /* ignore */ }

      const qp = new URLSearchParams();
      if(workName) qp.set('work', workName);
      if(systemName) qp.set('system', systemName);
      const url = '/p/' + encodeURIComponent(target.key) + (qp.toString() ? ('?' + qp.toString()) : '');
      blsSpaNavigate(url);
    }).catch(function(){
      blsSpaNavigate('/p/hw_server_onpremise_detail');
    });
  }

  function setText(id, val){
    const el = document.getElementById(id);
    if(el) el.textContent = (val == null) ? '' : String(val);
  }

  // rack_code: 세션 기반 (data 속성에서 읽기, URL fallback)
  function detectRackCode(){
    try{
      var el = document.querySelector('[data-rack-code]');
      if(el){
        var v = (el.getAttribute('data-rack-code') || '').trim();
        if(v) return v;
      }
      const qp = new URLSearchParams(location.search);
      const v2 = (qp.get('rack_code') || '').trim();
      if(v2) return v2;
    }catch(_){/* ignore */}
    return '';
  }

  let _statusMapPromise = null;
  function loadStatusMap(){
    if(_statusMapPromise) return _statusMapPromise;
    _statusMapPromise = requestJSON('/api/work-statuses').then(function(p){
      const items = (p && p.items) ? p.items : [];
      const map = {};
      items.forEach(function(it){
        const code = (it && it.status_code) ? String(it.status_code) : '';
        if(!code) return;
        map[code] = (it && (it.wc_name || it.status_name)) ? String(it.wc_name || it.status_name) : code;
      });
      return map;
    }).catch(function(){ return {}; });
    return _statusMapPromise;
  }

  let _centerMapPromise = null;
  function loadCenterMap(){
    if(_centerMapPromise) return _centerMapPromise;
    _centerMapPromise = requestJSON('/api/org-centers').then(function(p){
      const items = (p && p.items) ? p.items : [];
      const map = {};
      items.forEach(function(it){
        const code = (it && it.center_code) ? String(it.center_code) : '';
        if(!code) return;
        map[code] = (it && (it.center_name || it.center_code)) ? String(it.center_name || it.center_code) : code;
      });
      return map;
    }).catch(function(){ return {}; });
    return _centerMapPromise;
  }

  function applyRackToHeaderAndBasic(rack){
    if(!rack) return;
    // 헤더
    setText('page-header-title', rack.business_name || '');
    setText('page-header-subtitle', rack.rack_position || '');

    // 기본정보 카드
    setText('rk-name', rack.business_name || '');
    setText('rk-vendor', rack.manufacturer_code || '');
    setText('rk-model', rack.system_model_code || '');
    setText('rk-serial', rack.serial_number || '');
    setText('rk-position', rack.rack_position || '');
    if(rack.system_height_u != null){
      setText('rk-height', String(rack.system_height_u) + 'U');
    }

    // 참조값 라벨 매핑(가능한 경우만)
    const statusCode = rack.business_status_code || '';
    loadStatusMap().then(function(map){
      setText('rk-status', map[statusCode] || statusCode || '');
    });

    const centerCode = rack.center_code || '';
    loadCenterMap().then(function(map){
      setText('rk-location', map[centerCode] || centerCode || '');
    });
  }

  // expose for other modules (edit modal)
  window.__rackDetailApplyRackToUi = applyRackToHeaderAndBasic;
  window.__rackDetailDetectRackCode = detectRackCode;

  function sampleData(){
    const statuses = ['운영','대기','점검','장애'];
    const vendors = ['Dell','HPE','IBM','Cisco','Lenovo'];
    const models = ['42U','45U','48U','NetShelter','Rack-Std'];
    const rows = ['A','B','C','D','E','F'];
    const arr = [];
    for (let i=1;i<=52;i++){
      arr.push({
        rack_name: `FC5F-R${String(i).padStart(2,'0')}`,
        rack_business: `${rows[(i-1)%rows.length]}열-${String(((i-1)%20)+1).padStart(2,'0')}번`,
        rack_vendor: vendors[i%vendors.length],
        rack_model: models[i%models.length],
        status: statuses[i%statuses.length],
        height_u: [42,45,48][i%3],
        device_count: (i*3)%40 + 1,
        power_panel: `PP-${(i%6)+1}`
      });
    }
    return arr;
  }

  // (legacy) URL 또는 페이지 헤더에서 랙명 추론
  function detectRackName(){
    const rackCode = detectRackCode();
    if(rackCode) return rackCode;
    const h1 = document.querySelector('.page-header h1');
    if (h1 && h1.textContent.trim()) return h1.textContent.trim();
    const m = location.pathname.match(/(FC\d+F\-R\d+)/i);
    return m ? m[1] : 'FC5F-R01';
  }

  function fillRackInfo(row){
    const set = (id,val)=>{ const el = document.getElementById(id); if (el) el.textContent = val; };
    set('rack-info-name', row.rack_name);
    set('rack-info-business', row.rack_business);
    set('rack-info-vendor', row.rack_vendor);
    set('rack-info-model', row.rack_model);
    set('rack-info-status', row.status);
    set('rack-info-height', String(row.height_u));
    set('rack-info-device-count', String(row.device_count));
    set('rack-info-power', row.power_panel);
  }

  // 저장/불러오기: 오프라인 localStorage (face 별)
  function storageKey(rackName, face){ return `rack:${rackName}:${face}`; }
  function loadDevices(rackName, face, heightU){
    try{
      const key = storageKey(rackName, face);
      const arr = JSON.parse(localStorage.getItem(key)||'[]');
      if (Number.isFinite(heightU)){
        const filtered = arr.filter(d => {
          const u = parseInt(d.u,10);
          const h = Math.max(1, parseInt(d.height||1,10));
          return Number.isFinite(u) && u >= 1 && u <= heightU && (u - (h-1)) >= 1;
        });
        if (filtered.length !== arr.length){
          try{ localStorage.setItem(key, JSON.stringify(filtered)); }catch(_){/* noop */}
        }
        return filtered;
      }
      return arr;
    }catch(_){ return []; }
  }
  function saveDevices(rackName, face, arr){ try{ localStorage.setItem(storageKey(rackName, face), JSON.stringify(arr||[])); }catch(_){/*noop*/} }

  function hasCollision(devices, topU, height, extraDevices){
    const range = new Set(Array.from({length:height}, (_,k)=> topU - k));
    const all = ([]).concat(devices || [], extraDevices || []);
    for (const d of all){
      const h = Math.max(1, d.height||1);
      const dr = new Set(Array.from({length:h}, (_,k)=> d.u - k));
      for (const u of range){ if (dr.has(u)) return true; }
    }
    return false;
  }

  function drawDevices(slotsEl, heightU, devices, onChange, blockedDevices){
    devices.forEach((d, idx)=>{
      const topU = parseInt(d.u,10);
      const h = Math.max(1, Math.min(10, parseInt(d.height||1,10)));
      if (!Number.isFinite(topU) || topU < 1 || topU > heightU) return;
      const dev = document.createElement('div');
      dev.className = 'rack-device';
      dev.style.height = `calc(${h} * var(--u-height))`;
      dev.style.top = `calc(${Math.max(0, (heightU - topU - 1))} * var(--u-height))`;
      const color = d.color || palette[idx % palette.length];
      dev.style.background = color;
      if (d.locked){
        dev.classList.add('locked');
        dev.style.cursor = 'pointer';
        dev.setAttribute('title', '클릭하여 시스템 상세로 이동');
      }

      const label = document.createElement('span');
      label.className = 'rack-device-label';
      if (d.locked){
        label.textContent = `${d.name||'업무'}`;
      }else{
        label.textContent = `${d.name||'장비'} (${h})`;
      }

      const remove = document.createElement('button');
      remove.className = 'rack-device-remove';
      remove.type = 'button';
      remove.textContent = '삭제';
      remove.addEventListener('click', (e)=>{
        e.stopPropagation();
        if (d.locked) return;
        const next = devices.slice();
        next.splice(idx,1);
        onChange(next);
      });
      if (d.locked){
        remove.style.display = 'none';
      }

      if (d.locked && d._asset){
        dev.addEventListener('click', function(e){
          try{ e.preventDefault(); }catch(_){ }
          try{ e.stopPropagation(); }catch(_){ }
          _seedSelectionAndGoToDetail(d._asset);
        });
      }

      const getUHeight = ()=>{ const v = getComputedStyle(document.documentElement).getPropertyValue('--u-height') || '18px'; return parseFloat(v); };
      let startY = 0;
      let startU = topU;
      let lastTentativeU = topU;
      let dragging = false;
      const onDown = (e)=>{
        if (d.locked) return;
        if (e.button !== undefined && e.button !== 0) return;
        if (e.target && (e.target === remove || e.target.closest('.rack-device-remove'))) return;
        dragging = true;
        startY = (e.touches ? e.touches[0].clientY : e.clientY);
        startU = d.u;
        dev.classList.add('dragging');
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchmove', onMove, {passive:false});
        document.addEventListener('touchend', onUp);
        e.preventDefault();
      };
      const onMove = (e)=>{
        if (!dragging) return;
        const y = (e.touches ? e.touches[0].clientY : e.clientY);
        const dy = y - startY;
        const uH = getUHeight();
        let tentativeU = startU - Math.round(dy / uH);
        tentativeU = Math.max(h, Math.min(heightU, tentativeU));
        lastTentativeU = tentativeU;
        dev.style.top = `calc(${(heightU - tentativeU)} * var(--u-height))`;
      };
      const onUp = ()=>{
        if (!dragging) return;
        dragging = false;
        dev.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onUp);
        let newU = Math.max(h, Math.min(heightU, parseInt(lastTentativeU,10) || startU));
        if (newU === heightU && h > 1){
          dev.style.top = `calc(${Math.max(0, (heightU - startU - 1))} * var(--u-height))`;
          return;
        }
        const others = devices.filter((_,i)=> i!==idx);
        if (hasCollision(others, newU, h, blockedDevices)){
          dev.style.top = `calc(${Math.max(0, (heightU - startU - 1))} * var(--u-height))`;
          return;
        }
        if (newU !== d.u){
          const next = devices.slice();
          next[idx] = Object.assign({}, d, { u: newU });
          onChange(next);
        }
      };
      dev.addEventListener('mousedown', onDown);
      dev.addEventListener('touchstart', onDown, {passive:false});

      dev.appendChild(label);
      dev.appendChild(remove);
      slotsEl.appendChild(dev);
    });
  }

  function fetchAllRackAssets(rackCode){
    // Use consolidated endpoint (includes slot/u_size/work_name) and filter by rack_code.
    const items = [];
    const pageSize = 200;
    function loop(page){
      const url = `/api/hardware/assets?page=${page}&page_size=${pageSize}&rack_code=${encodeURIComponent(rackCode)}`;
      return requestJSON(url).then(function(p){
        const rows = (p && p.items) ? p.items : [];
        const total = (p && typeof p.total === 'number') ? p.total : rows.length;
        items.push.apply(items, rows);
        if (items.length < total && page < 20 && rows.length > 0){
          return loop(page + 1);
        }
        return items;
      });
    }
    return loop(1).catch(function(){ return []; });
  }

  function buildLockedDevicesFromAssets(assets, heightU){
    const out = [];
    (assets || []).forEach(function(it){
      const topU = parseInt((it && it.slot), 10);
      const h = Math.max(1, parseInt((it && it.u_size), 10) || 1);
      if (!Number.isFinite(topU)) return;
      if (topU < 1 || topU > heightU) return;
      // Allow rendering even if it would extend beyond bounds; clamp by skipping invalid.
      if ((topU - (h - 1)) < 1) return;
      const label = (it && (it.work_name || it.system_name || it.asset_name || it.asset_code)) ? String(it.work_name || it.system_name || it.asset_name || it.asset_code) : '업무';
      var rawFace = (it && it.rack_face) ? String(it.rack_face).toUpperCase() : 'FRONT';
      out.push({
        name: label,
        u: topU,
        height: h,
        color: palette[0],
        locked: true,
        _face: rawFace === 'REAR' ? 'rear' : 'front',
        _asset_id: it && it.id,
        _asset_code: it && it.asset_code,
        _asset: it || null,
      });
    });
    return out;
  }

  function drawGhosts(slotsEl, heightU, devices){
    devices.forEach((d, idx)=>{
      const topU = parseInt(d.u,10);
      const h = Math.max(1, Math.min(10, parseInt(d.height||1,10)));
      if (!Number.isFinite(topU) || topU < 1 || topU > heightU) return;
      const ghost = document.createElement('div');
      ghost.className = 'rack-device-shadow';
      ghost.style.height = `calc(${h} * var(--u-height))`;
      ghost.style.top = `calc(${Math.max(0, (heightU - topU - 1))} * var(--u-height))`;
      const color = d.color || palette[idx % palette.length];
      ghost.style.background = color;
      slotsEl.appendChild(ghost);
    });
  }

  function renderElevation(containerId, rack, face){
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const rail = document.createElement('div');
    rail.className = 'rack-rail';

    const slots = document.createElement('div');
    slots.className = 'rack-slots';
    slots.style.height = `calc(${rack.height_u} * var(--u-height))`;

    // U marks and slots (top-down)
    for (let u = rack.height_u; u >= 1; u--){
      const mark = document.createElement('div');
      mark.className = 'rack-u-mark';
      mark.textContent = `${u}`;
      rail.appendChild(mark);

      const slot = document.createElement('div');
      slot.className = 'rack-u-slot';
      const add = document.createElement('a');
      add.href = 'javascript:void(0)';
      add.className = 'rack-add-link';
      add.textContent = '장비 추가';
      add.addEventListener('click', ()=> openAddDialog(rack, face, u));
      slot.appendChild(add);
      slots.appendChild(slot);
    }

    container.classList.add('rack-elevation');
    container.appendChild(rail);
    container.appendChild(slots);

    // draw opposite face ghosts first
    const other = face === 'front' ? 'rear' : 'front';
    const otherDevices = loadDevices(rack.rack_name, other, rack.height_u);
    drawGhosts(slots, rack.height_u, otherDevices);

    // draw locked allocations from DB — split by face
    const allLocked = (state && Array.isArray(state.lockedDevices)) ? state.lockedDevices : [];
    const lockedThisFace = allLocked.filter(function(d){ return d._face === face; });
    const lockedOtherFace = allLocked.filter(function(d){ return d._face !== face; });
    drawGhosts(slots, rack.height_u, lockedOtherFace);
    drawDevices(slots, rack.height_u, lockedThisFace, function(){ /* locked */ }, []);

    // draw actual devices for this face
    const devices = loadDevices(rack.rack_name, face, rack.height_u);
    const onChange = (next)=>{
      saveDevices(rack.rack_name, face, next);
      renderElevation(containerId, rack, face);
      // also refresh other side for ghost updates
      const otherId = face==='front' ? 'rack-rear' : 'rack-front';
      renderElevation(otherId, rack, other);
      updateDeviceCountUI(rack.rack_name);
    };
    drawDevices(slots, rack.height_u, devices, onChange, lockedThisFace);
  }

  const state = { row: null };

  function getAllDevicesRaw(rackName){
    try{
      const f = JSON.parse(localStorage.getItem(`rack:${rackName}:front`)||'[]');
      const r = JSON.parse(localStorage.getItem(`rack:${rackName}:rear`)||'[]');
      return { front: Array.isArray(f)?f:[], rear: Array.isArray(r)?r:[] };
    }catch(_){ return { front: [], rear: [] }; }
  }

  function computeRequiredHeight(rackName){
    const { front, rear } = getAllDevicesRaw(rackName);
    let maxU = 0;
    for (const d of [...front, ...rear]){
      const u = parseInt(d.u,10);
      if (Number.isFinite(u)) maxU = Math.max(maxU, u);
    }
    return Math.max(1, maxU);
  }

  function pruneDevicesForHeight(rackName, face, newHeight){
    try{
      const key = storageKey(rackName, face);
      const arr = JSON.parse(localStorage.getItem(key)||'[]');
      const filtered = arr.filter(d => {
        const h = Math.max(1, parseInt(d.height||1,10));
        const top = parseInt(d.u,10);
        if (!Number.isFinite(top)) return false;
        return top >= 1 && top <= newHeight && (top - (h-1)) >= 1;
      });
      localStorage.setItem(key, JSON.stringify(filtered));
    }catch(_){/* noop */}
  }

  function openAddDialog(rack, face, u){
    const modal = document.getElementById('rack-add-modal');
    const g = id => document.getElementById(id);
    // U 선택 채우기
    const uSel = g('add-u');
    uSel.innerHTML = '';
    for (let k = rack.height_u; k >= 1; k--){
      const opt = document.createElement('option');
      opt.value = String(k);
      opt.textContent = `${k}`;
      if (k === u) opt.selected = true;
      uSel.appendChild(opt);
    }
    // 색상 팔레트 채우기
    const colorGroup = g('add-color-group');
    colorGroup.innerHTML = '';
    let selectedColor = palette[0];
    palette.forEach(c => {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'color-swatch';
      sw.style.backgroundColor = c;
      sw.setAttribute('aria-label', c);
      sw.onclick = ()=>{
        selectedColor = c;
        Array.from(colorGroup.children).forEach(ch => ch.classList.remove('selected'));
        sw.classList.add('selected');
      };
      colorGroup.appendChild(sw);
    });
    if (colorGroup.firstChild) colorGroup.firstChild.classList.add('selected');

    const applyBtn = g('add-device-apply');
    applyBtn.onclick = function(){
      const topU = parseInt(uSel.value, 10);
      const workName = (g('add-work').value || '').trim() || `Work@${topU}`;
      const color = selectedColor;
      const height = Math.max(1, Math.min(10, parseInt(g('add-size').value,10) || 1));
      if ((topU - (height-1)) < 1){
        alert('선택한 높이가 하부 범위를 벗어납니다. 장비 높이를 줄이거나 더 높은 U를 선택하세요.');
        return;
      }
      if (topU === rack.height_u && height > 1){
        alert('최상단 U 위치에서는 장비 높이가 1U를 초과할 수 없습니다.');
        return;
      }
      const devices = loadDevices(rack.rack_name, face, rack.height_u);
      const locked = (state && Array.isArray(state.lockedDevices)) ? state.lockedDevices : [];
      if (hasCollision(devices, topU, height, locked)){
        alert('해당 영역에 이미 장비가 있습니다. 다른 U를 선택하세요.');
        return;
      }
      const next = devices.concat([{ name: workName, u: topU, height, color }]);
      saveDevices(rack.rack_name, face, next);
      modal.classList.remove('show');
      document.body.classList.remove('modal-open');
      renderElevation(face==='front'?'rack-front':'rack-rear', rack, face);
      const other = face==='front'?'rear':'front';
      renderElevation(other==='front'?'rack-front':'rack-rear', rack, other);
      updateDeviceCountUI(rack.rack_name);
    };

    modal.classList.add('show');
    document.body.classList.add('modal-open');
  }

  function init(){
    if(state.__didInit) return;
    state.__didInit = true;
    const rackCode = detectRackCode();
    if(!rackCode){
      // fallback demo
      const racks = sampleData();
      const rackName = detectRackName();
      const row = racks.find(r => r.rack_name === rackName) || racks[0];
      state.row = { ...row, rack_name: rackName };
      const h1 = document.querySelector('.page-header h1');
      if (h1 && !h1.textContent.trim()) h1.textContent = rackName;
      fillRackInfo(state.row);
      // only render rack surface if present on this page
      renderElevation('rack-front', state.row, 'front');
      renderElevation('rack-rear', state.row, 'rear');
      updateDeviceCountUI(state.row.rack_name);
      return;
    }

    // real data
    requestJSON('/api/racks/' + encodeURIComponent(rackCode)).then(function(payload){
      const rack = payload && payload.data ? payload.data.rack : null;
      if(!rack){ throw new Error('not found'); }

      // stable storage key for elevation = rack_code
      const heightU = Math.max(1, parseInt(rack.system_height_u, 10) || 1);
      state.row = {
        rack_name: rackCode,
        height_u: heightU,
        device_count: 0,
        status: rack.business_status_code || '',
        rack_vendor: rack.manufacturer_code || '',
        rack_model: rack.system_model_code || '',
        rack_business: rack.rack_position || '',
        power_panel: ''
      };

      // share current context for other modules
      window.__rackDetailContext = { rack_code: rackCode, rack: rack };

      applyRackToHeaderAndBasic(rack);

      // enforce grid height from DB (auto-generate rows based on system_height_u)
      pruneDevicesForHeight(state.row.rack_name, 'front', heightU);
      pruneDevicesForHeight(state.row.rack_name, 'rear', heightU);

      // load locked allocations from DB by rack_code
      state.lockedDevices = [];
      fetchAllRackAssets(rackCode).then(function(items){
        state.lockedDevices = buildLockedDevicesFromAssets(items, heightU);
      }).finally(function(){
        // Only the 기본정보 page has rack-front/rack-rear; other tabs still need header/basic values.
        renderElevation('rack-front', state.row, 'front');
        renderElevation('rack-rear', state.row, 'rear');
        updateDeviceCountUI(state.row.rack_name);
      });
    }).catch(function(_e){
      // fallback demo if API fails
      const racks = sampleData();
      const rackName = detectRackName();
      const row = racks.find(r => r.rack_name === rackName) || racks[0];
      state.row = { ...row, rack_name: rackName };
      renderElevation('rack-front', state.row, 'front');
      renderElevation('rack-rear', state.row, 'rear');
      updateDeviceCountUI(state.row.rack_name);
    });
  }

  // Init should run on ALL tabs (header/basic), even when rack-front/rack-rear are absent.
  function bootstrapInit(){
    init();
  }

  // Expose minimal API for modal to call
  window.RackDetail = {
    init(){ bootstrapInit(1); },
    getRackCode(){ return (state.row && state.row.rack_name) ? state.row.rack_name : (detectRackCode() || ''); },
    setHeight(newHeight){
      const h = Math.max(1, parseInt(newHeight,10) || 1);
      if (!state.row) return;
      state.row.height_u = h;
      pruneDevicesForHeight(state.row.rack_name, 'front', h);
      pruneDevicesForHeight(state.row.rack_name, 'rear', h);
      renderElevation('rack-front', state.row, 'front');
      renderElevation('rack-rear', state.row, 'rear');
      updateDeviceCountUI(state.row.rack_name);
    },
    getCount(){ if (!state.row) return 0; return getDeviceCount(state.row.rack_name); },
    updateCount(){ if (!state.row) return 0; return updateDeviceCountUI(state.row.rack_name); },
    fitHeight(){
      if (!state.row) return;
      // legacy helper (kept), but do not auto-expand height on load
      const needed = computeRequiredHeight(state.row.rack_name);
      state.row.height_u = Math.max(state.row.height_u||1, needed);
      renderElevation('rack-front', state.row, 'front');
      renderElevation('rack-rear', state.row, 'rear');
      updateDeviceCountUI(state.row.rack_name);
    },
    clearAll(){
      if (!state.row) return;
      clearAllDevices(state.row.rack_name);
      renderElevation('rack-front', state.row, 'front');
      renderElevation('rack-rear', state.row, 'rear');
      updateDeviceCountUI(state.row.rack_name);
    }
  };

  document.addEventListener('DOMContentLoaded', () => bootstrapInit());
  window.addEventListener('load', () => {
    try{
      const f = document.getElementById('rack-front');
      const r = document.getElementById('rack-rear');
      const hasGrid = el => !!(el && el.querySelector('.rack-slots'));
      if (!hasGrid(f) || !hasGrid(r)){
        bootstrapInit();
      }
    }catch(_){ /* noop */ }
  });
})();

// Helpers for device count UI
function getDeviceCount(rackName){
  try{
    const f = JSON.parse(localStorage.getItem(`rack:${rackName}:front`)||'[]');
    const r = JSON.parse(localStorage.getItem(`rack:${rackName}:rear`)||'[]');
    const isValid = d => Number.isFinite(parseInt(d.u,10)) && Number.isFinite(parseInt(d.height||1,10));
    return [...f, ...r].filter(isValid).length;
  }catch(_){ return 0; }
}
function updateDeviceCountUI(rackName){
  const count = getDeviceCount(rackName);
  const el = document.getElementById('rack-info-device-count');
  if (el) el.textContent = String(count);
  return count;
}
function clearAllDevices(rackName){
  try{
    localStorage.removeItem(`rack:${rackName}:front`);
    localStorage.removeItem(`rack:${rackName}:rear`);
  }catch(_){/* noop */}
}
// Detail page enhancements: Basic Info edit modal and Rack Add modal close logic
(function(){
  function onReady(fn){ if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }

  onReady(function(){
    // Guard to avoid double binding if this file is loaded multiple times
    if(document.body.dataset.rackDetailWired==='1') return;
    document.body.dataset.rackDetailWired='1';

    // 1) Rack Add modal: close handlers (moved from inline script)
    (function(){
      var modal = document.getElementById('rack-add-modal');
      if(!modal) return;
      var closeBtn = document.getElementById('rack-add-close');
      function hide(){ modal.classList.remove('show'); document.body.classList.remove('modal-open'); }
      if(closeBtn) closeBtn.addEventListener('click', hide);
      modal.addEventListener('click', function(e){ if(e.target === modal) hide(); });
    })();

    // 2) Basic Info edit modal (match rack list page: style/content/behavior)
    (function(){
      var EDIT_MODAL_ID = 'system-edit-modal';
      var EDIT_FORM_ID = 'system-edit-form';
      var EDIT_SAVE_ID = 'system-edit-save';
      var EDIT_OPEN_ID = 'detail-edit-open';
      var EDIT_CLOSE_ID = 'system-edit-close';

      function requestJSON(url, options){
        var opts = options ? Object.assign({}, options) : {};
        opts.method = opts.method || 'GET';
        opts.credentials = opts.credentials || 'same-origin';
        opts.cache = opts.cache || 'no-cache';
        var headers = Object.assign({}, (opts.headers || {}));
        if(opts.body && typeof opts.body !== 'string'){
          headers['Content-Type'] = headers['Content-Type'] || 'application/json';
          opts.body = JSON.stringify(opts.body);
        }
        opts.headers = headers;
        return fetch(url, opts).then(function(res){
          return res.text().then(function(txt){
            var payload = null;
            try{ payload = txt ? JSON.parse(txt) : null; }catch(_e){ payload = null; }
            if(!res.ok || (payload && payload.success === false)){
              var msg = (payload && payload.message) ? payload.message : ('요청 실패 (HTTP ' + res.status + ')');
              throw new Error(msg);
            }
            return payload || {};
          });
        });
      }

      function detectRackCode(){
        if(window.__rackDetailDetectRackCode){
          try{ return window.__rackDetailDetectRackCode() || ''; }catch(_e){}
        }
        try{
          var qp = new URLSearchParams(location.search);
          var v = (qp.get('rack_code')||'').trim();
          if(v) return v;
          var legacy = (qp.get('rack')||'').trim();
          if(legacy) return legacy;
        }catch(_){ }
        return '';
      }

      var RACK_CODE = detectRackCode();
      var currentRack = null;

      function loadCurrentRack(){
        if(window.__rackDetailContext && window.__rackDetailContext.rack){
          currentRack = window.__rackDetailContext.rack;
          return Promise.resolve(currentRack);
        }
        if(!RACK_CODE){
          return Promise.reject(new Error('rack_code missing'));
        }
        return requestJSON('/api/racks/' + encodeURIComponent(RACK_CODE)).then(function(p){
          currentRack = (p && p.data) ? p.data.rack : null;
          return currentRack;
        });
      }

      // -------- Reference / searchable selects (minimal subset of list page implementation)
      var referenceStore = {
        businessStatus: { loaded:false, items:[], byValue:{} },
        centers: { loaded:false, items:[], byValue:{} },
        departments: { loaded:false, items:[], byValue:{} },
        users: { loaded:false, items:[], byValue:{} }
      };
      var referencePromise = null;

      function safeText(v){ return String(v == null ? '' : v).trim(); }
      function escHtml(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;'); }

      function setRef(sourceKey, items){
        var list = (items || []).filter(function(it){ return it && it.value; });
        var by = {};
        list.forEach(function(it){ by[String(it.value)] = it; });
        referenceStore[sourceKey] = { loaded:true, items:list, byValue:by };
      }

      function ensureReferenceData(){
        if(referencePromise) return referencePromise;
        referencePromise = Promise.all([
          requestJSON('/api/work-statuses').then(function(p){
            var raw = (p && p.items) ? p.items : [];
            setRef('businessStatus', raw.map(function(it){
              var code = safeText(it && (it.status_code || it.wc_code || it.code));
              var label = safeText(it && (it.wc_name || it.status_name || it.status_code || code)) || code;
              return { value: code, label: label, meta: '' };
            }));
          }).catch(function(){ setRef('businessStatus', []); }),
          requestJSON('/api/org-centers').then(function(p){
            var raw = (p && p.items) ? p.items : (Array.isArray(p) ? p : []);
            setRef('centers', raw.map(function(it){
              var code = safeText(it && (it.center_code || it.code));
              var label = safeText(it && (it.center_name || it.name || it.center_code || code)) || code;
              return { value: code, label: label, meta: safeText(it && (it.location || it.usage || '')) };
            }));
          }).catch(function(){ setRef('centers', []); }),
          requestJSON('/api/org-departments').then(function(p){
            var raw = (p && p.items) ? p.items : (Array.isArray(p) ? p : []);
            setRef('departments', raw.map(function(it){
              var code = safeText(it && (it.dept_code || it.code));
              var label = safeText(it && (it.dept_name || it.name || it.dept_code || code)) || code;
              return { value: code, label: label, meta: safeText(it && (it.description || it.manager_name || '')) };
            }));
          }).catch(function(){ setRef('departments', []); }),
          Promise.all([
            requestJSON('/api/users').catch(function(){ return []; }),
            requestJSON('/api/user-profiles?limit=500').catch(function(){ return { items: [] }; })
          ]).then(function(res){
            var users = Array.isArray(res[0]) ? res[0] : [];
            var profiles = (res[1] && Array.isArray(res[1].items)) ? res[1].items : [];
            var profMap = {};
            profiles.forEach(function(pr){
              var k = safeText(pr && pr.emp_no);
              if(k) profMap[k] = pr;
            });
            setRef('users', users.map(function(u){
              var empNo = safeText(u && u.emp_no);
              var pr = empNo ? profMap[empNo] : null;
              var name = safeText((pr && pr.name) || (u && u.email) || empNo || ('ID ' + safeText(u && u.id)));
              var dept = safeText((pr && (pr.department || pr.company)) || (u && u.department) || '');
              var deptCode = safeText((pr && (pr.dept_code || pr.department_code)) || (u && (u.dept_code || u.department_code)) || (u && u.system_dept_code) || '');
              var identifier = empNo || safeText(u && (u.username || u.email));
              return {
                value: (u && u.id != null) ? String(u.id) : '',
                label: name,
                meta: [dept, identifier].filter(Boolean).join(' · '),
                extra: { dept_code: deptCode }
              };
            }));
          }).catch(function(){ setRef('users', []); })
        ]).then(function(){ return referenceStore; });
        return referencePromise;
      }

      function formatRefLabel(sourceKey, value){
        var code = safeText(value);
        if(!code) return '';
        var store = referenceStore[sourceKey];
        if(store && store.byValue && store.byValue[code]) return safeText(store.byValue[code].label) || code;
        return code;
      }

      // Search-select UI wrappers (reuse the same CSS class names as list page)
      var searchSelectMeta = new WeakMap();
      var activePanel = null;

      function ensureControl(input){
        if(!input) return null;
        if(searchSelectMeta.has(input)) return searchSelectMeta.get(input);
        var wrapper = document.createElement('div');
        wrapper.className = 'fk-searchable-control';
        var displayBtn = document.createElement('button');
        displayBtn.type = 'button';
        displayBtn.className = 'fk-searchable-display';
        displayBtn.setAttribute('aria-haspopup','dialog');
        displayBtn.setAttribute('aria-expanded','false');
        var clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'fk-searchable-clear';
        clearBtn.textContent = '지움';
        clearBtn.title = '선택 해제';
        clearBtn.setAttribute('aria-label','선택 해제');
        clearBtn.hidden = true;
        clearBtn.addEventListener('click', function(ev){
          ev.preventDefault(); ev.stopPropagation();
          closeDropdown();
          applyValue(input, '', '');
        });
        displayBtn.addEventListener('click', function(ev){
          ev.preventDefault();
          if(input.disabled) return;
          openDropdown(input);
        });
        var parent = input.parentNode;
        if(parent){ parent.insertBefore(wrapper, input); }
        wrapper.appendChild(displayBtn);
        wrapper.appendChild(clearBtn);
        wrapper.appendChild(input);
        input.classList.add('fk-search-native-hidden');
        input.setAttribute('aria-hidden','true');
        var meta = { wrapper: wrapper, displayBtn: displayBtn, clearBtn: clearBtn };
        searchSelectMeta.set(input, meta);
        return meta;
      }

      function refreshLabel(input){
        var meta = ensureControl(input);
        if(!meta) return;
        var source = input.dataset ? input.dataset.searchSource : '';
        var placeholder = (input.dataset && input.dataset.placeholder) ? input.dataset.placeholder : (input.getAttribute('placeholder') || '검색 선택');
        if(input.dataset && !input.dataset.placeholder) input.dataset.placeholder = placeholder;
        var code = safeText(input.dataset ? input.dataset.value : '');
        var display = safeText((input.dataset && input.dataset.display) ? input.dataset.display : input.value);
        if(code && source){
          var label = formatRefLabel(source, code);
          if(label){
            display = label;
            if(input.dataset) input.dataset.display = label;
            if(input.value !== label) input.value = label;
          }
        }
        var labelText = display || placeholder;
        meta.displayBtn.textContent = labelText;
        meta.displayBtn.title = labelText;
        var hasValue = !!code;
        meta.displayBtn.classList.toggle('has-value', hasValue);
        meta.clearBtn.hidden = !hasValue;
        meta.wrapper.classList.toggle('is-disabled', !!input.disabled);
        meta.displayBtn.disabled = !!input.disabled;
        meta.clearBtn.disabled = !!input.disabled;
      }

      function applyValue(input, code, label){
        var v = safeText(code);
        var d = safeText(label);
        if(!input.dataset) input.dataset = {};
        input.dataset.value = v;
        input.dataset.display = d;
        input.value = d;
        refreshLabel(input);
        try{ input.dispatchEvent(new Event('change', { bubbles:true })); }catch(_e){}
      }

      function getParentInput(input){
        if(!input || !input.dataset || !input.dataset.parentField) return null;
        var name = input.dataset.parentField;
        var form = input.form || input.closest('form');
        if(form && form.elements && form.elements[name]){
          var el = form.elements[name];
          return el.length ? el[0] : el;
        }
        return null;
      }

      function applyDependencyRules(input){
        if(!input || !input.dataset || !input.dataset.parentField) return;
        var parent = getParentInput(input);
        var parentVal = parent && parent.dataset ? safeText(parent.dataset.value || parent.value) : '';
        if(!parentVal){
          input.disabled = true;
          if(input.dataset && input.dataset.value) applyValue(input, '', '');
        } else {
          input.disabled = false;
        }
        refreshLabel(input);
      }

      function syncSearchSelects(root){
        var scope = root || document;
        Array.prototype.forEach.call(scope.querySelectorAll('.search-select'), function(inp){
          if(!inp || !inp.dataset || !inp.dataset.searchSource) return;
          ensureControl(inp);
          applyDependencyRules(inp);
          refreshLabel(inp);
        });
      }

      function positionPanel(panel, anchor){
        if(!panel || !anchor) return;
        var r = anchor.getBoundingClientRect();
        var top = r.bottom + 6;
        var left = r.left;
        panel.style.position = 'fixed';
        panel.style.zIndex = '9999';
        panel.style.minWidth = Math.max(260, r.width) + 'px';
        var vw = window.innerWidth, vh = window.innerHeight;
        // ensure in viewport
        if(left + panel.offsetWidth > vw - 8){ left = Math.max(8, vw - panel.offsetWidth - 8); }
        if(top + panel.offsetHeight > vh - 8){
          var above = r.top - 6 - panel.offsetHeight;
          if(above > 8) top = above;
        }
        panel.style.top = Math.max(8, top) + 'px';
        panel.style.left = Math.max(8, left) + 'px';
      }

      function closeDropdown(){
        if(!activePanel) return;
        try{ document.removeEventListener('pointerdown', activePanel._outside, true); }catch(_e){}
        try{ document.removeEventListener('keydown', activePanel._esc, true); }catch(_e){}
        try{ window.removeEventListener('resize', activePanel._repos, true); window.removeEventListener('scroll', activePanel._repos, true); }catch(_e){}
        try{ activePanel.trigger && activePanel.trigger.setAttribute('aria-expanded','false'); }catch(_e){}
        try{ activePanel.panel && activePanel.panel.remove(); }catch(_e){}
        activePanel = null;
      }

      function buildOptionsForInput(input){
        var source = input.dataset.searchSource;
        var store = referenceStore[source];
        var opts = (store && store.items) ? store.items.slice() : [];
        // dependency: users filtered by dept_code (system/service)
        if(input.dataset.parentField){
          var parent = getParentInput(input);
          var parentCode = parent && parent.dataset ? safeText(parent.dataset.value || parent.value) : '';
          if(source === 'users' && parentCode){
            opts = opts.filter(function(it){ return it && it.extra && safeText(it.extra.dept_code) === parentCode; });
          } else if(source === 'users' && !parentCode){
            opts = [];
          }
        }
        return opts;
      }

      function openDropdown(input){
        closeDropdown();
        var meta = ensureControl(input);
        if(!meta) return;
        var panel = document.createElement('div');
        panel.className = 'fk-search-panel';
        panel.setAttribute('role','dialog');
        var header = document.createElement('div');
        header.className = 'fk-search-panel__header';
        var s = document.createElement('input');
        s.type = 'text';
        s.className = 'fk-search-panel__input';
        s.placeholder = '검색어 입력';
        s.autocomplete = 'off';
        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'fk-search-panel__close';
        closeBtn.textContent = '닫기';
        header.appendChild(s);
        header.appendChild(closeBtn);
        var list = document.createElement('div');
        list.className = 'fk-search-panel__list';
        list.setAttribute('role','listbox');
        var empty = document.createElement('div');
        empty.className = 'fk-search-panel__empty';
        empty.hidden = true;
        panel.appendChild(header);
        panel.appendChild(list);
        panel.appendChild(empty);
        document.body.appendChild(panel);
        meta.displayBtn.setAttribute('aria-expanded','true');

        function render(){
          var q = safeText(s.value).toLowerCase();
          var options = buildOptionsForInput(input);
          if(q){
            options = options.filter(function(it){
              var hay = (safeText(it.label) + ' ' + safeText(it.meta) + ' ' + safeText(it.value)).toLowerCase();
              return hay.indexOf(q) >= 0;
            });
          }
          list.innerHTML = '';
          if(!options.length){
            empty.textContent = input.dataset && input.dataset.parentField && input.dataset.searchSource === 'users'
              ? '담당부서를 먼저 선택하세요.'
              : (q ? '검색 결과가 없습니다.' : '등록된 항목이 없습니다.');
            empty.hidden = false;
            return;
          }
          empty.hidden = true;
          options.forEach(function(opt){
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'fk-search-panel__item';
            btn.dataset.value = String(opt.value);
            btn.setAttribute('role','option');
            btn.innerHTML = '<span class="fk-search-panel__label">'+escHtml(opt.label)+'</span>' + (opt.meta ? '<span class="fk-search-panel__meta">'+escHtml(opt.meta)+'</span>' : '');
            btn.addEventListener('click', function(ev){
              ev.preventDefault();
              applyValue(input, opt.value, opt.label);
              // when selecting dept, unlock/clear child user fields
              if(input.name === 'system_owner_dept' || input.name === 'service_owner_dept'){
                var form = input.form || input.closest('form');
                if(form){
                  Array.prototype.forEach.call(form.querySelectorAll('.search-select[data-parent-field="'+input.name+'"]'), function(ch){
                    applyDependencyRules(ch);
                    if(ch.dataset && ch.dataset.value) applyValue(ch,'','');
                  });
                }
              }
              closeDropdown();
            });
            list.appendChild(btn);
          });
        }

        closeBtn.addEventListener('click', function(ev){ ev.preventDefault(); closeDropdown(); });
        s.addEventListener('input', render);

        activePanel = {
          panel: panel,
          trigger: meta.displayBtn,
          _outside: function(ev){ if(panel.contains(ev.target) || meta.wrapper.contains(ev.target)) return; closeDropdown(); },
          _esc: function(ev){ if(ev.key === 'Escape'){ ev.preventDefault(); closeDropdown(); } },
          _repos: function(){ positionPanel(panel, meta.wrapper); }
        };

        document.addEventListener('pointerdown', activePanel._outside, true);
        document.addEventListener('keydown', activePanel._esc, true);
        window.addEventListener('resize', activePanel._repos, true);
        window.addEventListener('scroll', activePanel._repos, true);

        // ensure references then render
        ensureReferenceData().then(function(){
          render();
          // after first render, position using final height
          positionPanel(panel, meta.wrapper);
          try{ s.focus(); }catch(_e){}
        }).catch(function(){
          empty.textContent = '목록을 불러오지 못했습니다.';
          empty.hidden = false;
          positionPanel(panel, meta.wrapper);
        });

        // initial position (before data)
        positionPanel(panel, meta.wrapper);
      }

      // -------- Form: same fields as list page
      var REQUIRED = {
        business_status: true,
        business_name: true,
        place: true,
        location: true
      };

      function formatRackHeightU(u){
        var n = parseInt(String(u == null ? '' : u).replace(/[^0-9]/g,''), 10);
        return (!isNaN(n) && n > 0) ? (String(n) + 'U') : '';
      }

      function generateFieldInput(name, value, ctx){
        var v = (value == null) ? '' : String(value);
        var req = REQUIRED[name] ? ' required' : '';
        if(name === 'business_status'){
          return '<input name="business_status" class="form-input search-select" data-search-source="businessStatus" placeholder="검색 선택" data-placeholder="검색 선택" data-value="'+escHtml(safeText(ctx && ctx.business_status_code))+'" value="'+escHtml(formatRefLabel('businessStatus', safeText(ctx && ctx.business_status_code)))+'"'+req+'>';
        }
        if(name === 'place'){
          return '<input name="place" class="form-input search-select" data-search-source="centers" placeholder="검색 선택" data-placeholder="검색 선택" data-value="'+escHtml(safeText(ctx && ctx.center_code))+'" value="'+escHtml(formatRefLabel('centers', safeText(ctx && ctx.center_code)))+'"'+req+'>';
        }
        if(name === 'system_owner_dept'){
          return '<input name="system_owner_dept" class="form-input search-select" data-search-source="departments" placeholder="부서 선택" data-placeholder="부서 선택" data-value="'+escHtml(safeText(ctx && ctx.system_dept_code))+'" value="'+escHtml(formatRefLabel('departments', safeText(ctx && ctx.system_dept_code)))+'">';
        }
        if(name === 'system_owner'){
          var ownerId = (ctx && ctx.system_manager_id != null) ? String(ctx.system_manager_id) : '';
          return '<input name="system_owner" class="form-input search-select" data-search-source="users" placeholder="담당자 선택" data-placeholder="담당자 선택" data-parent-field="system_owner_dept" data-value="'+escHtml(ownerId)+'" value="'+escHtml(formatRefLabel('users', ownerId))+'">';
        }
        if(name === 'service_owner_dept'){
          return '<input name="service_owner_dept" class="form-input search-select" data-search-source="departments" placeholder="부서 선택" data-placeholder="부서 선택" data-value="'+escHtml(safeText(ctx && ctx.service_dept_code))+'" value="'+escHtml(formatRefLabel('departments', safeText(ctx && ctx.service_dept_code)))+'">';
        }
        if(name === 'service_owner'){
          var svcId = (ctx && ctx.service_manager_id != null) ? String(ctx.service_manager_id) : '';
          return '<input name="service_owner" class="form-input search-select" data-search-source="users" placeholder="담당자 선택" data-placeholder="담당자 선택" data-parent-field="service_owner_dept" data-value="'+escHtml(svcId)+'" value="'+escHtml(formatRefLabel('users', svcId))+'">';
        }
        if(name === 'business_name'){
          return '<input name="business_name" class="form-input" placeholder="필수" value="'+escHtml(v)+'"'+req+'>';
        }
        if(name === 'vendor'){
          return '<input name="vendor" class="form-input" placeholder="입력" value="'+escHtml(v)+'">';
        }
        if(name === 'model'){
          return '<input name="model" class="form-input" placeholder="모델 입력" value="'+escHtml(v)+'">';
        }
        if(name === 'serial'){
          return '<input name="serial" class="form-input" value="'+escHtml(v)+'">';
        }
        if(name === 'location'){
          return '<input name="location" class="form-input" placeholder="입력" value="'+escHtml(v)+'"'+req+'>';
        }
        if(name === 'system_height'){
          return '<input name="system_height" class="form-input" value="'+escHtml(v)+'">';
        }
        return '<input name="'+escHtml(name)+'" class="form-input" value="'+escHtml(v)+'"'+req+'>';
      }

      function fillEditFormFromRack(rack){
        var form = document.getElementById(EDIT_FORM_ID);
        if(!form) return;
        var ctx = rack || {};
        form.innerHTML = '';
        var groups = [
          { title:'비즈니스', cols:[
            { name:'business_status', label:'업무 상태', required:true },
            { name:'business_name', label:'업무 이름', required:true }
          ]},
          { title:'시스템', cols:[
            { name:'vendor', label:'시스템 제조사' },
            { name:'model', label:'시스템 모델명' },
            { name:'serial', label:'시스템 일련번호' },
            { name:'place', label:'시스템 장소', required:true },
            { name:'location', label:'시스템 위치', required:true },
            { name:'system_height', label:'시스템 높이' }
          ]},
          { title:'담당자', cols:[
            { name:'system_owner_dept', label:'시스템 담당부서' },
            { name:'system_owner', label:'시스템 담당자' },
            { name:'service_owner_dept', label:'서비스 담당부서' },
            { name:'service_owner', label:'서비스 담당자' }
          ]}
        ];
        groups.forEach(function(g){
          var section = document.createElement('div');
          section.className = 'form-section';
          section.innerHTML = '<div class="section-header"><h4>'+escHtml(g.title)+'</h4></div>';
          var grid = document.createElement('div');
          grid.className = 'form-grid';
          g.cols.forEach(function(c){
            var wrap = document.createElement('div');
            wrap.className = 'form-row';
            var reqMark = c.required ? ' <span class="required">*</span>' : '';
            var val = '';
            if(c.name === 'business_name') val = safeText(ctx.business_name);
            else if(c.name === 'vendor') val = safeText(ctx.manufacturer_code);
            else if(c.name === 'model') val = safeText(ctx.system_model_code || ctx.rack_model);
            else if(c.name === 'serial') val = safeText(ctx.serial_number);
            else if(c.name === 'location') val = safeText(ctx.rack_position);
            else if(c.name === 'system_height') val = formatRackHeightU(ctx.system_height_u);
            wrap.innerHTML = '<label>'+escHtml(c.label)+reqMark+'</label>' + generateFieldInput(c.name, val, ctx);
            grid.appendChild(wrap);
          });
          section.appendChild(grid);
          form.appendChild(section);
        });
        syncSearchSelects(form);
      }

      function openModal(){
        var el = document.getElementById(EDIT_MODAL_ID);
        if(!el) return;
        document.body.classList.add('modal-open');
        el.classList.add('show');
        el.setAttribute('aria-hidden','false');
      }

      function closeModal(){
        var el = document.getElementById(EDIT_MODAL_ID);
        if(!el) return;
        el.classList.remove('show');
        el.setAttribute('aria-hidden','true');
        closeDropdown();
        if(!document.querySelector('.server-add-modal.show, .server-edit-modal.show')){
          document.body.classList.remove('modal-open');
        }
      }

      function parseHeightValue(val){
        if(val == null) return null;
        var m = String(val).trim().toUpperCase().match(/\d+/);
        if(!m) return null;
        var n = parseInt(m[0], 10);
        return (!isNaN(n) && n > 0) ? n : null;
      }

      function requireValue(val, label){
        if(val == null || String(val).trim() === '') throw new Error(label + ' 값을 입력하세요.');
        return String(val).trim();
      }

      function optionalValue(val){
        var s = String(val == null ? '' : val).trim();
        return s ? s : undefined;
      }

      function parsePositiveInt(val){
        var norm = String(val == null ? '' : val).replace(/[^0-9]/g,'').trim();
        if(!norm) return null;
        var n = parseInt(norm, 10);
        return (!isNaN(n) && n > 0) ? n : null;
      }

      function buildRackPayload(formData){
        return {
          business_status_code: requireValue(formData.business_status, '업무 상태'),
          business_name: requireValue(formData.business_name, '업무 이름'),
          center_code: requireValue(formData.place, '시스템 장소'),
          rack_position: requireValue(formData.location, '시스템 위치'),
          manufacturer_code: optionalValue(formData.vendor),
          rack_model: optionalValue(formData.model),
          serial_number: optionalValue(formData.serial),
          system_height_u: (function(){
            var raw = String(formData.system_height == null ? '' : formData.system_height).trim();
            if(!raw) return undefined;
            var h = parseHeightValue(raw);
            if(h == null) throw new Error('시스템 높이는 숫자로 입력하세요. 예: 4 또는 4U');
            return h;
          })(),
          system_dept_code: optionalValue(formData.system_owner_dept),
          system_manager_id: (function(){
            var v = optionalValue(formData.system_owner);
            if(!v) return undefined;
            var n = parsePositiveInt(v);
            if(n == null) throw new Error('시스템 담당자 값을 숫자로 입력하세요.');
            return n;
          })(),
          service_dept_code: optionalValue(formData.service_owner_dept),
          service_manager_id: (function(){
            var v = optionalValue(formData.service_owner);
            if(!v) return undefined;
            var n = parsePositiveInt(v);
            if(n == null) throw new Error('서비스 담당자 값을 숫자로 입력하세요.');
            return n;
          })()
        };
      }

      function collectForm(form){
        var data = {};
        Array.prototype.forEach.call(form.querySelectorAll('input,select,textarea'), function(el){
          if(!el.name) return;
          if(el.classList && el.classList.contains('search-select') && el.dataset && Object.prototype.hasOwnProperty.call(el.dataset, 'value')){
            data[el.name] = safeText(el.dataset.value);
          } else {
            data[el.name] = safeText(el.value);
          }
        });
        return data;
      }

      function onOpen(){
        Promise.all([ensureReferenceData(), loadCurrentRack()]).then(function(res){
          var rack = res[1] || {};
          if(!rack || rack.id == null){
            throw new Error('대상 데이터를 찾을 수 없습니다.');
          }
          fillEditFormFromRack(rack);
          openModal();
          // focus first control
          try{
            var first = document.querySelector('#'+EDIT_FORM_ID+' .fk-searchable-display, #'+EDIT_FORM_ID+' .form-input');
            if(first) first.focus();
          }catch(_e){}
        }).catch(function(e){
          alert((e && e.message) ? e.message : '데이터를 불러오지 못했습니다.');
        });
      }

      function onSave(){
        var form = document.getElementById(EDIT_FORM_ID);
        if(!form) return;
        if(!currentRack || currentRack.id == null){
          alert('대상 데이터를 찾을 수 없습니다.');
          return;
        }
        var formData = collectForm(form);
        try{
          var payload = buildRackPayload(formData);
          requestJSON('/api/org-racks/' + encodeURIComponent(String(currentRack.id)), { method:'PUT', body: payload }).then(function(p){
            var item = (p && p.item) ? p.item : null;
            if(!item){
              // fallback: reload by rack_code
              return loadCurrentRack().then(function(r){ return r; });
            }
            currentRack = item;
            // keep detail API context in sync (best-effort)
            window.__rackDetailContext = { rack_code: RACK_CODE, rack: item };
            if(window.__rackDetailApplyRackToUi){
              try{ window.__rackDetailApplyRackToUi(item); }catch(_e){}
            }
            if(window.RackDetail && typeof window.RackDetail.setHeight === 'function' && item.system_height_u != null){
              window.RackDetail.setHeight(item.system_height_u);
            }
            closeModal();
          }).catch(function(err){
            alert((err && err.message) ? err.message : '저장 실패');
          });
        } catch(ex){
          alert((ex && ex.message) ? ex.message : '필수값을 확인하세요.');
        }
      }

      var openBtn = document.getElementById(EDIT_OPEN_ID);
      if(openBtn) openBtn.addEventListener('click', onOpen);
      var closeBtn = document.getElementById(EDIT_CLOSE_ID);
      if(closeBtn) closeBtn.addEventListener('click', closeModal);
      var saveBtn = document.getElementById(EDIT_SAVE_ID);
      if(saveBtn) saveBtn.addEventListener('click', onSave);
      var modalEl = document.getElementById(EDIT_MODAL_ID);
      if(modalEl){
        modalEl.addEventListener('click', function(e){ if(e.target === modalEl) closeModal(); });
      }
      document.addEventListener('keydown', function(e){ if(e.key==='Escape'){ closeModal(); } });
    })();
  });
})();

      // [Tabs moved to /static/js/_detail/tab*.js]


// Manufacturer detail: Manager tab logic (clean, manager-only)
(function(){
  'use strict';

  function ready(fn){ if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }

  ready(function(){
    // ---------- Manufacturer Basic Info (2.manufacturer_detail.html) ----------
    (function(){
      try{
        var path = (location && location.pathname || '').toLowerCase();
        if(!/\/9-7\.vendor\/9-7-1\.manufacturer\/2\.manufacturer_detail\.html$/.test(path)) return;
        // Local helper (parity with server detail): render animated no-data sticker (Lottie with image fallback)
        function showNoDataImage(container, altText){
          try{
            if(!container) return;
            container.innerHTML = '';
            var wrap = document.createElement('span');
            wrap.style.display = 'flex';
            wrap.style.alignItems = 'center';
            wrap.style.justifyContent = 'center';
            wrap.style.padding = '12px 0';
            wrap.style.minHeight = '140px';
            wrap.style.width = '100%';
            wrap.style.boxSizing = 'border-box';
            wrap.style.flexDirection = 'column';
            var jsonPath = '/static/image/svg/free-animated-no-data.json';
            function renderLottie(){
              try{
                if(!window.lottie){ return false; }
                var animBox = document.createElement('span');
                animBox.style.display = 'inline-block';
                animBox.style.width = '240px';
                animBox.style.maxWidth = '100%';
                animBox.style.height = '180px';
                animBox.style.pointerEvents = 'none';
                var altMsg = altText || '데이터 없음';
                animBox.setAttribute('aria-label', (altMsg+'').split('\n')[0]);
                wrap.appendChild(animBox);
                try{
                  window.lottie.loadAnimation({ container: animBox, renderer: 'svg', loop: true, autoplay: true, path: jsonPath });
                  var capWrap = document.createElement('span'); capWrap.style.display='block'; capWrap.style.marginTop='8px'; capWrap.style.textAlign='center';
                  (altMsg+'').split('\n').forEach(function(line, idx){ var cap=document.createElement('span'); cap.textContent=line; cap.style.display='block'; cap.style.fontSize = idx===0 ? '14px' : '13px'; cap.style.color = '#64748b'; capWrap.appendChild(cap); });
                  wrap.appendChild(capWrap); container.appendChild(wrap); return true;
                }catch(_a){ return false; }
              }catch(_){ return false; }
            }
            function loadLottieAndRender(){
              try{
                var script = document.createElement('script'); script.src='https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js'; script.async=true;
                script.onload=function(){ if(!renderLottie()) renderImageFallback(); }; script.onerror=function(){ renderImageFallback(); }; document.head.appendChild(script);
              }catch(_){ renderImageFallback(); }
            }
            function renderImageFallback(){
              try{
                var img = document.createElement('img'); var altMsg = altText || '데이터 없음'; img.alt = (altMsg+'').split('\n')[0]; img.style.maxWidth='240px'; img.style.width='100%'; img.style.height='auto';
                var candidates = [
                  '/blossom/static/image/svg/free-animated-no-data/no-data.svg','/blossom/static/image/svg/free-animated-no-data/animated.svg','/blossom/static/image/svg/free-animated-no-data/animation.svg','/blossom/static/image/svg/free-animated-no-data/index.svg','/blossom/static/image/svg/free-animated-no-data.svg','/blossom/static/image/svg/free-animated-no-data/no-data.gif','/blossom/static/image/svg/free-animated-no-data.gif',
                  '/static/image/svg/free-animated-no-data/no-data.svg','/static/image/svg/free-animated-no-data/animated.svg','/static/image/svg/free-animated-no-data/animation.svg','/static/image/svg/free-animated-no-data/index.svg','/static/image/svg/free-animated-no-data.svg','/static/image/svg/free-animated-no-data/no-data.gif','/static/image/svg/free-animated-no-data.gif'
                ];
                var idx=0; function setNext(){ if(idx>=candidates.length) return; img.src=candidates[idx++]; }
                img.onerror=function(){ setNext(); }; setNext(); wrap.appendChild(img);
                var capWrap=document.createElement('span'); capWrap.style.display='block'; capWrap.style.marginTop='8px'; capWrap.style.textAlign='center';
                (altMsg+'').split('\n').forEach(function(line, i){ var cap=document.createElement('span'); cap.textContent=line; cap.style.display='block'; cap.style.fontSize = i===0 ? '14px' : '13px'; cap.style.color='#64748b'; capWrap.appendChild(cap); });
                wrap.appendChild(capWrap); container.appendChild(wrap);
              }catch(_f){ }
            }
            if(!renderLottie()){ if(!window.lottie){ loadLottieAndRender(); } else { renderImageFallback(); } }
          }catch(_){ }
        }
        // Empty-state handling for "시스템 통계": aggregate from tabs via localStorage with DOM fallback
        function getInt(v){ var n=parseInt(String(v||'').replace(/[^0-9-]/g,''),10); return (isNaN(n)||!isFinite(n))?0:n; }
        function renderManufacturerStats(forceUseDom){
          // Prefer live sums persisted by each tab; fall back to Basic Info spans
          var hwSavedRaw = (function(){ try{ return localStorage.getItem('vendor:hw:sumQty'); }catch(_){ return null; } })();
          var swSavedRaw = (function(){ try{ return localStorage.getItem('vendor:sw:sumQty'); }catch(_){ return null; } })();
          var coSavedRaw = (function(){ try{ return localStorage.getItem('vendor:co:sumQty'); }catch(_){ return null; } })();
          var hwSaved = getInt(hwSavedRaw);
          var swSaved = getInt(swSavedRaw);
          var coSaved = getInt(coSavedRaw);
          var hwDom = getInt(((document.getElementById('mf-hardware-qty')||{}).textContent||''));
          var swDom = getInt(((document.getElementById('mf-software-qty')||{}).textContent||''));
          var coDom = getInt(((document.getElementById('mf-component-qty')||{}).textContent||''));
          var useDom = !!forceUseDom;
          // If no persisted sums exist, default to 0 so the empty-state appears without visiting tabs
          var hwVal = useDom? hwDom : (hwSavedRaw!=null ? hwSaved : 0);
          var swVal = useDom? swDom : (swSavedRaw!=null ? swSaved : 0);
          var coVal = useDom? coDom : (coSavedRaw!=null ? coSaved : 0); // correct ternary precedence
          var total = hwVal + swVal + coVal;
          var emptyEl = document.getElementById('sys-empty');
          var pieEl = document.getElementById('sys-pie');
          var legendEl = (function(){ var wrap = (pieEl && pieEl.parentElement) || null; return wrap? wrap.querySelector('.pie-legend') : document.querySelector('.pie-legend'); })();
          function pct(n){ return total>0 ? Math.round((n/total)*100) : 0; }
          // Update legend texts (even if hidden, keep accurate content)
          var hwLegend = document.getElementById('sys-hw-legend'); if(hwLegend) hwLegend.textContent = hwVal + ' ('+pct(hwVal)+'%)';
          var swLegend = document.getElementById('sys-sw-legend'); if(swLegend) swLegend.textContent = swVal + ' ('+pct(swVal)+'%)';
          var coLegend = document.getElementById('sys-comp-legend'); if(coLegend) coLegend.textContent = coVal + ' ('+pct(coVal)+'%)';
          // Reflect sums back to Basic Info counts for visual parity
          (function syncBasicInfoCounts(){ try{
            var a=document.getElementById('mf-hardware-qty'); if(a) a.textContent=String(hwVal);
            var b=document.getElementById('mf-software-qty'); if(b) b.textContent=String(swVal);
            var c=document.getElementById('mf-component-qty'); if(c) c.textContent=String(coVal);
          }catch(_){ } })();
          var isEmpty = (total<=0);
          // Toggle visibility with desired two-line guidance
          var emptyHTML = '할당 시스템 내역이 없습니다.<br>시스템 탭에서 시스템을 할당하세요.';
          if(emptyEl){
            if(isEmpty){
              emptyEl.style.display = '';
              emptyEl.hidden = false;
              try{ showNoDataImage(emptyEl, '할당 시스템 내역이 없습니다.\n시스템 탭에서 시스템을 할당하세요.'); }catch(_s){}
            } else {
              emptyEl.innerHTML = emptyHTML; // keep text content accessible if toggled later
              emptyEl.style.display = 'none';
              emptyEl.hidden = true;
            }
          }
          // Apply pie segment angles (reuse run/idle/wait variables for 3-way split)
          if(pieEl){
            if(isEmpty){
              pieEl.style.display = 'none';
            } else {
              var t = total || 1;
              var deg1 = Math.round((hwVal*360)/t);
              var deg2 = deg1 + Math.round((swVal*360)/t);
              if(deg2>360) deg2=360;
              pieEl.style.display = '';
              pieEl.style.setProperty('--deg-run', deg1+'deg');
              pieEl.style.setProperty('--deg-idle', deg2+'deg');
            }
          }
          if(legendEl){ legendEl.style.display = isEmpty? 'none' : ''; }
        }
        // Initial render
        renderManufacturerStats(false);

        // 기본정보 수정 모달 동작: 열기/닫기/저장
        var EDIT_MODAL_ID = 'system-edit-modal';
        var EDIT_FORM_ID = 'system-edit-form';
        var EDIT_OPEN_ID = 'detail-edit-open';
        var EDIT_CLOSE_ID = 'system-edit-close';
        var EDIT_SAVE_ID = 'system-edit-save';
        function openModalLocal(id){ try{ var m=document.getElementById(id); if(m){ m.classList.add('show'); m.setAttribute('aria-hidden','false'); document.body.classList.add('modal-open'); } }catch(_){ } }
        function closeModalLocal(id){ try{ var m=document.getElementById(id); if(m){ m.classList.remove('show'); m.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } } }catch(_){ } }
        function getText(id){ var el=document.getElementById(id); return el? (el.textContent||'').trim():''; }
        function setText(id, val){ var el=document.getElementById(id); if(el){ el.textContent = String(val==null? '': val); } }
        var LABELS = {
          vendor:'제조사', address:'주소', business_number:'사업자번호', call_center:'고객센터',
          hardware_qty:'하드웨어(수량)', software_qty:'소프트웨어(수량)', component_qty:'컴포넌트(수량)', note:'비고'
        };
        function buildEditForm(){
          var form=document.getElementById(EDIT_FORM_ID); if(!form) return;
          var data={
            vendor:getText('mf-vendor'), address:getText('mf-address'), business_number:getText('mf-business-number'), call_center:getText('mf-call-center'),
            hardware_qty:getInt(getText('mf-hardware-qty')), software_qty:getInt(getText('mf-software-qty')), component_qty:getInt(getText('mf-component-qty')),
            note:getText('mf-note')
          };
          form.innerHTML='';
          var section=document.createElement('div'); section.className='form-section'; section.innerHTML='<div class="section-header"><h4>제조사</h4></div>';
          var grid=document.createElement('div'); grid.className='form-grid';
          ['vendor','address','business_number','call_center','hardware_qty','software_qty','component_qty','note'].forEach(function(c){
            var wrap=document.createElement('div'); wrap.className=(c==='note')? 'form-row form-row-wide':'form-row';
            var controlHtml='';
            if(c==='note') controlHtml = '<textarea name="note" class="form-input textarea-large" rows="6">'+(data.note||'')+'</textarea>';
            else if(c==='hardware_qty' || c==='software_qty' || c==='component_qty') controlHtml = '<input name="'+c+'" type="number" min="0" step="1" class="form-input qty-dashed-lock" value="'+(data[c]||0)+'" placeholder="0">';
            else controlHtml = '<input name="'+c+'" class="form-input" value="'+(data[c]||'')+'">';
            wrap.innerHTML = '<label>'+LABELS[c]+'</label>'+controlHtml; grid.appendChild(wrap);
          });
          section.appendChild(grid); form.appendChild(section);
        }
        var openBtn = document.getElementById(EDIT_OPEN_ID);
        if(openBtn){ openBtn.addEventListener('click', function(){ buildEditForm(); openModalLocal(EDIT_MODAL_ID); var first = document.querySelector('#'+EDIT_FORM_ID+' .form-input'); if(first){ try{ first.focus(); }catch(_){ } } }); }
        var closeBtn = document.getElementById(EDIT_CLOSE_ID);
        if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalLocal(EDIT_MODAL_ID); }); }
        var modalEl = document.getElementById(EDIT_MODAL_ID);
        if(modalEl){ modalEl.addEventListener('click', function(e){ if(e.target===modalEl) closeModalLocal(EDIT_MODAL_ID); }); document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(EDIT_MODAL_ID); }); }
        var saveBtn = document.getElementById(EDIT_SAVE_ID);
        if(saveBtn){ saveBtn.addEventListener('click', function(){
          var form=document.getElementById(EDIT_FORM_ID); if(!form) { closeModalLocal(EDIT_MODAL_ID); return; }
          function val(name){ var el=form.querySelector('[name="'+name+'"]'); return el? el.value.trim():''; }
          var vendor = val('vendor'); if(!vendor){ try{ form.querySelector('[name="vendor"]').focus(); }catch(_){ } return; }
          var address = val('address'); var biz = val('business_number'); var call = val('call_center');
          var hw = getInt(val('hardware_qty')); if(hw<0) hw=0; var sw = getInt(val('software_qty')); if(sw<0) sw=0; var co = getInt(val('component_qty')); if(co<0) co=0;
          var note = val('note');
          setText('mf-vendor', vendor); setText('mf-address', address); setText('mf-business-number', biz); setText('mf-call-center', call);
          setText('mf-hardware-qty', hw); setText('mf-software-qty', sw); setText('mf-component-qty', co); setText('mf-note', note);
          // Recompute stats based on freshly edited DOM values (ignore persisted sums for this pass)
          try{ renderManufacturerStats(true); }catch(_){ }
          closeModalLocal(EDIT_MODAL_ID);
        }); }
      }catch(_){ /* no-op for safety */ }
    })();

    // Run ONLY on Manager tab (tab42-manager.html)
    var path = (typeof location!=='undefined' && location.pathname || '').toLowerCase();
    var isManagerPage = /tab42-manager\.html$/.test(path);
    var table = document.getElementById('hw-spec-table');
    if(isManagerPage && table){ // Only run manager logic when on manager page and table exists

    var tbody = table.querySelector('tbody') || table.appendChild(document.createElement('tbody'));
    var emptyEl = document.getElementById('hw-empty');
    var addBtn = document.getElementById('hw-row-add');
    var selectAll = document.getElementById('hw-select-all');
    var pageSizeSel = document.getElementById('hw-page-size');
    var infoEl = document.getElementById('hw-pagination-info');
    var numsWrap = document.getElementById('hw-page-numbers');
    var btnFirst = document.getElementById('hw-first');
    var btnPrev = document.getElementById('hw-prev');
    var btnNext = document.getElementById('hw-next');
    var btnLast = document.getElementById('hw-last');
    var csvBtn = document.getElementById('hw-download-btn');

    // Ensure schema: add remark column and 6 equal cols
    (function ensureSchema(){
      try{
        table.setAttribute('data-context','manager');
        // Manager tab uses 6 equal columns (소속, 이름, 담당, 연락처, 이메일, 비고)
        table.classList.remove('cols-5');
        if(!table.classList.contains('cols-6')) table.classList.add('cols-6');
      }catch(_){ }
    })();

    // ---------- Manager tab: add-row, edit/save, delete, selection ----------
    // Pagination state and helpers (Manager tab)
    var mgState = { page:1, pageSize:10 };
    (function initPageSize(){
      try{
        var saved = localStorage.getItem('vendor:manager:pageSize');
        if(pageSizeSel){
          if(saved && ['10','20','50','100'].indexOf(saved)>-1){ mgState.pageSize = parseInt(saved,10); pageSizeSel.value = saved; }
          pageSizeSel.addEventListener('change', function(){ var v=parseInt(pageSizeSel.value,10); if(!isNaN(v)){ mgState.page=1; mgState.pageSize=v; localStorage.setItem('vendor:manager:pageSize', String(v)); mgRenderPage(); }});
        }
      }catch(_){ }
    })();
    function mgRows(){ return Array.from(tbody.querySelectorAll('tr')); }
    function mgTotal(){ return mgRows().length; }
    function mgPages(){ var total=mgTotal(); return Math.max(1, Math.ceil(total / mgState.pageSize)); }
    function mgClampPage(){ var pages=mgPages(); if(mgState.page>pages) mgState.page=pages; if(mgState.page<1) mgState.page=1; }
    function mgUpdateUI(){
      if(infoEl){ var total=mgTotal(); var start = total? (mgState.page-1)*mgState.pageSize+1 : 0; var end=Math.min(total, mgState.page*mgState.pageSize); infoEl.textContent = start + '-' + end + ' / ' + total + '개 항목'; }
      if(numsWrap){ var pages=mgPages(); numsWrap.innerHTML=''; for(var p=1;p<=pages && p<=50;p++){ var b=document.createElement('button'); b.className='page-btn'+(p===mgState.page?' active':''); b.textContent=String(p); b.dataset.page=String(p); numsWrap.appendChild(b); } }
      var pages2=mgPages(); if(btnFirst) btnFirst.disabled=(mgState.page===1); if(btnPrev) btnPrev.disabled=(mgState.page===1); if(btnNext) btnNext.disabled=(mgState.page===pages2); if(btnLast) btnLast.disabled=(mgState.page===pages2);
      if(pageSizeSel){ var none=(mgTotal()===0); pageSizeSel.disabled = none; if(none){ try{ pageSizeSel.value='10'; mgState.pageSize=10; }catch(_){ } }
      }
    }
    function mgRenderPage(){
      mgClampPage();
      var rows=mgRows();
      var startIdx=(mgState.page-1)*mgState.pageSize;
      var endIdx=startIdx + mgState.pageSize - 1;
      rows.forEach(function(tr, idx){
        var visible = idx>=startIdx && idx<=endIdx;
        tr.style.display = visible? '' : 'none';
        if(visible){ tr.removeAttribute('data-hidden'); } else { tr.setAttribute('data-hidden','1'); }
        var cb = tr.querySelector('.hw-row-check'); if(cb){ tr.classList.toggle('selected', !!cb.checked && visible); }
      });
      mgUpdateUI();
      // Sync select-all with only visible rows
      if(selectAll){
        var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check');
        if(visChecks.length){ selectAll.checked = Array.prototype.every.call(visChecks, function(c){ return c.checked; }); } else { selectAll.checked = false; }
      }
    }
    function mgGo(p){ mgState.page=p; mgRenderPage(); }
    function mgGoDelta(d){ mgGo(mgState.page + d); }
    function mgGoFirst(){ mgGo(1); }
    function mgGoLast(){ mgGo(mgPages()); }
    if(numsWrap){ numsWrap.addEventListener('click', function(e){ var b=e.target.closest('button.page-btn'); if(!b) return; var p=parseInt(b.dataset.page,10); if(!isNaN(p)) mgGo(p); }); }
    if(btnFirst) btnFirst.addEventListener('click', mgGoFirst);
    if(btnPrev) btnPrev.addEventListener('click', function(){ mgGoDelta(-1); });
    if(btnNext) btnNext.addEventListener('click', function(){ mgGoDelta(1); });
    if(btnLast) btnLast.addEventListener('click', mgGoLast);

    function updateEmpty(){
      try{
        var has = !!tbody.querySelector('tr');
        if(emptyEl){ emptyEl.hidden = has; emptyEl.style.display = has ? 'none' : ''; }
      }catch(_){ if(emptyEl){ emptyEl.hidden=false; emptyEl.style.display=''; } }
      // CSV button enable/disable based on presence of any rows
      if(csvBtn){
        try{
          var hasAny = !!tbody.querySelector('tr');
          csvBtn.disabled = !hasAny;
          csvBtn.setAttribute('aria-disabled', (!hasAny).toString());
          csvBtn.title = hasAny ? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.';
        }catch(_){ /* no-op */ }
      }
      mgRenderPage();
    }

    // Select all (visible rows only under current page)
    if(selectAll){
      selectAll.addEventListener('change', function(){
        var checks = table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check:not([disabled])');
        checks.forEach(function(c){ c.checked = !!selectAll.checked; var tr=c.closest('tr'); if(tr){ tr.classList.toggle('selected', !!c.checked); } });
      });
    }

    // Row click toggles selection (exclude direct clicks on form controls)
    table.addEventListener('click', function(ev){
      var isControl = ev.target.closest('button, a, input, select, textarea, label');
      var onCheckbox = ev.target.closest('input[type="checkbox"].hw-row-check');
      if(isControl && !onCheckbox) return;
      if(onCheckbox) return;
      var tr = ev.target.closest('tr'); if(!tr || tr.parentNode.tagName.toLowerCase()!=='tbody') return;
      var hidden = tr.hasAttribute('data-hidden') || tr.style.display==='none'; if(hidden) return;
      var cb = tr.querySelector('.hw-row-check'); if(!cb || cb.disabled) return;
      cb.checked = !cb.checked; tr.classList.toggle('selected', cb.checked);
      if(selectAll){ var vis = table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check'); if(vis.length){ selectAll.checked = Array.prototype.every.call(vis, function(c){ return c.checked; }); } }
    });

    // Per-row checkbox change syncs select-all and visual state
    table.addEventListener('change', function(ev){
      var cb = ev.target.closest('.hw-row-check'); if(!cb) return;
      var tr = cb.closest('tr'); if(tr){ var hidden = tr.hasAttribute('data-hidden') || tr.style.display==='none'; tr.classList.toggle('selected', !!cb.checked && !hidden); }
      if(selectAll){ var vis = table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check'); if(vis.length){ selectAll.checked = Array.prototype.every.call(vis, function(c){ return c.checked; }); } else { selectAll.checked=false; } }
    });

    // CSV helpers and modal wiring (Manager tab)
    function mgEscapeCSV(val){ return '"' + String(val).replace(/"/g,'""') + '"'; }
    function mgRowSaved(tr){ var t=tr.querySelector('.js-mg-toggle'); var inEdit=t && t.getAttribute('data-action')==='save'; if(inEdit) return false; return !tr.querySelector('td[data-col] input, td[data-col] select, td[data-col] textarea'); }
    function mgVisibleRows(){ return Array.from(tbody.querySelectorAll('tr')).filter(function(tr){ return !(tr.hasAttribute('data-hidden') || tr.style.display==='none'); }); }
    function mgSavedVisibleRows(){ return mgVisibleRows().filter(mgRowSaved); }
    function mgExportCSV(onlySelected){
      var headers=['소속','이름','담당','연락처','이메일','비고'];
      var trs = mgSavedVisibleRows();
      if(onlySelected){ trs = trs.filter(function(tr){ var cb=tr.querySelector('.hw-row-check'); return cb && cb.checked; }); }
      if(trs.length===0) return;
      function text(tr, col){ var td=tr.querySelector('[data-col="'+col+'"]'); return td? (td.textContent||'').trim() : ''; }
      var cols=['org','name','role','phone','email','remark'];
      var rows = trs.map(function(tr){ return cols.map(function(c){ return text(tr,c); }); });
      var lines = [headers].concat(rows).map(function(arr){ return arr.map(mgEscapeCSV).join(','); });
      var csv='\uFEFF'+lines.join('\r\n');
      var d=new Date(); var yyyy=d.getFullYear(); var mm=String(d.getMonth()+1).padStart(2,'0'); var dd=String(d.getDate()).padStart(2,'0');
      var filename='vendor_manager_'+yyyy+mm+dd+'.csv';
      try{ var blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); var url=URL.createObjectURL(blob); var a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); }
      catch(_){ var a2=document.createElement('a'); a2.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a2.download=filename; document.body.appendChild(a2); a2.click(); document.body.removeChild(a2); }
    }
    (function(){
      var btn = csvBtn;
      var modalId='hw-download-modal';
      var closeBtn=document.getElementById('hw-download-close');
      var confirmBtn=document.getElementById('hw-download-confirm');
      function openModalLocal(id){ var el=document.getElementById(id); if(!el) return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden','false'); }
      function closeModalLocal(id){ var el=document.getElementById(id); if(!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } }
      if(btn){ btn.addEventListener('click', function(){ if(btn.disabled) return; var saved=mgSavedVisibleRows(); var total=saved.length; if(total<=0) return; var selectedCount = saved.filter(function(tr){ var cb=tr.querySelector('.hw-row-check'); return cb && cb.checked; }).length; var subtitle=document.getElementById('hw-download-subtitle'); if(subtitle){ subtitle.textContent = selectedCount>0 ? ('선택된 '+selectedCount+'개 또는 전체 '+total+'개 결과 중 범위를 선택하세요.') : ('현재 결과 '+total+'개 항목을 CSV로 내보냅니다.'); } var rowSelectedWrap=document.getElementById('hw-csv-range-row-selected'); var optSelected=document.getElementById('hw-csv-range-selected'); var optAll=document.getElementById('hw-csv-range-all'); if(rowSelectedWrap) rowSelectedWrap.hidden = !(selectedCount>0); if(optSelected){ optSelected.disabled = !(selectedCount>0); optSelected.checked = selectedCount>0; } if(optAll){ optAll.checked = !(selectedCount>0); } openModalLocal(modalId); }); }
      if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalLocal(modalId); }); }
      var modalEl=document.getElementById(modalId);
      if(modalEl){ modalEl.addEventListener('click', function(e){ if(e.target===modalEl) closeModalLocal(modalId); }); document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(modalId); }); }
      if(confirmBtn){ confirmBtn.addEventListener('click', function(){ var onlySel = !!(document.getElementById('hw-csv-range-selected') && document.getElementById('hw-csv-range-selected').checked); mgExportCSV(onlySel); closeModalLocal(modalId); }); }
    })();

    // Add row handler
    if(addBtn){
      addBtn.addEventListener('click', function(){
        var tr = document.createElement('tr');
          tr.innerHTML = `
            <td><input type="checkbox" class="hw-row-check" aria-label="행 선택"></td>
            <td data-col="org"><input type="text" placeholder="소속"></td>
            <td data-col="name"><input type="text" placeholder="이름"></td>
            <td data-col="role"><input type="text" placeholder="담당"></td>
            <td data-col="phone"><input type="text" placeholder="연락처"></td>
            <td data-col="email"><input type="email" placeholder="이메일"></td>
          <td data-col="remark"><input type="text" placeholder="비고"></td>
            <td class="system-actions table-actions">
              <button class="action-btn js-mg-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button>
              <button class="action-btn danger js-mg-del" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>
            </td>`;
        tbody.appendChild(tr);
        try{ mgGoLast(); }catch(_){ }
        updateEmpty();
      });
    }

    // Delegate actions for Manager rows
    table.addEventListener('click', function(ev){
      var target = ev.target.closest('.js-mg-del, .js-mg-toggle'); if(!target) return;
      var tr = ev.target.closest('tr'); if(!tr) return;

      // delete
      if(target.classList.contains('js-mg-del')){
        tr.parentNode.removeChild(tr);
        try{ mgClampPage(); }catch(_){ }
        updateEmpty();
        return;
      }

      // toggle edit/save
      if(target.classList.contains('js-mg-toggle')){
        var mode = target.getAttribute('data-action') || 'edit';
        if(mode === 'edit'){
          // view -> edit: replace texts to inputs
          ['org','name','role','phone','email','remark'].forEach(function(name){
            var td = tr.querySelector('[data-col="'+name+'"]'); if(!td) return;
            var current = (td.textContent||'').trim();
            if(name==='email') td.innerHTML = '<input type="email" value="'+current+'" placeholder="이메일">';
            else td.innerHTML = '<input type="text" value="'+current+'" placeholder="'+(name==='org'?'소속':name==='name'?'이름':name==='role'?'담당':name==='phone'?'연락처':'')+'">';
          });
          target.setAttribute('data-action','save');
          target.title='저장'; target.setAttribute('aria-label','저장');
          target.innerHTML='<img src="/static/image/svg/save.svg" alt="저장" class="action-icon">';
          return;
        }
        // save -> view
        if(mode === 'save'){
          function commit(name){
            var td = tr.querySelector('[data-col="'+name+'"]'); if(!td) return;
            var input = td.querySelector('input');
            var val = input ? String(input.value||'').trim() : (td.textContent||'').trim();
            td.textContent = val && val.length ? val : '-';
          }
          ['org','name','role','phone','email','remark'].forEach(commit);
          target.setAttribute('data-action','edit');
          target.title='편집'; target.setAttribute('aria-label','편집');
          target.innerHTML='<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon">';
          // keep selection visual state in sync
          var cb = tr.querySelector('.hw-row-check'); if(cb){ tr.classList.toggle('selected', !!cb.checked); }
          return;
        }
      }
    });

    // Initial empty state
  updateEmpty();
    } // end manager-only block

        /* function auRows(){ var tbody=table.querySelector('tbody'); return tbody? Array.from(tbody.querySelectorAll('tr')): []; }
        function auTotal(){ return auRows().length; }
        function auPages(){ var total=auTotal(); return Math.max(1, Math.ceil(total / auState.pageSize)); }
        function auClampPage(){ var pages=auPages(); if(auState.page>pages) auState.page=pages; if(auState.page<1) auState.page=1; }
        function auRenderPage(){ auClampPage(); var rows=auRows(); var startIdx=(auState.page-1)*auState.pageSize; var endIdx=startIdx + auState.pageSize - 1; rows.forEach(function(tr,idx){ var visible=idx>=startIdx && idx<=endIdx; tr.style.display = visible? '' : 'none'; if(visible){ tr.removeAttribute('data-hidden'); } else { tr.setAttribute('data-hidden','1'); } var cb=tr.querySelector('.au-row-check'); if(cb){ tr.classList.toggle('selected', !!cb.checked && visible); } }); auUpdatePaginationUI(); var sa=document.getElementById('au-select-all'); if(sa){ var visChecks=table.querySelectorAll('tbody tr:not([data-hidden]) .au-row-check'); if(visChecks.length){ sa.checked = Array.prototype.every.call(visChecks, function(c){ return c.checked; }); } else { sa.checked=false; } } }
        function auUpdatePaginationUI(){ if(infoEl){ var total=auTotal(); var start = total? (auState.page-1)*auState.pageSize+1 : 0; var end=Math.min(total, auState.page*auState.pageSize); infoEl.textContent = start + '-' + end + ' / ' + total + '개 항목'; } if(numWrap){ var pages=auPages(); numWrap.innerHTML=''; for(var p=1;p<=pages && p<=50;p++){ var b=document.createElement('button'); b.className='page-btn'+(p===auState.page?' active':''); b.textContent=String(p); b.dataset.page=String(p); numWrap.appendChild(b); } } var pages2=auPages(); if(btnFirst) btnFirst.disabled=(auState.page===1); if(btnPrev) btnPrev.disabled=(auState.page===1); if(btnNext) btnNext.disabled=(auState.page===pages2); if(btnLast) btnLast.disabled=(auState.page===pages2); var sizeSel=document.getElementById('au-page-size'); if(sizeSel){ var none=(auTotal()===0); sizeSel.disabled=none; if(none){ try{ sizeSel.value='10'; auState.pageSize=10; }catch(_){ } } } }
        function auGo(p){ auState.page=p; auRenderPage(); }
        function auGoDelta(d){ auGo(auState.page + d); }
        function auGoFirst(){ auGo(1); }
        function auGoLast(){ auGo(auPages()); }
        if(numWrap){ numWrap.addEventListener('click', function(e){ var b=e.target.closest('button.page-btn'); if(!b) return; var p=parseInt(b.dataset.page,10); if(!isNaN(p)) auGo(p); }); }
        if(btnFirst) btnFirst.addEventListener('click', auGoFirst);
        if(btnPrev) btnPrev.addEventListener('click', function(){ auGoDelta(-1); });
        if(btnNext) btnNext.addEventListener('click', function(){ auGoDelta(1); });
        if(btnLast) btnLast.addEventListener('click', auGoLast);
        function updateEmptyState(){
          try{
            var hasRows = table.querySelector('tbody tr') != null;
            if(empty){ empty.hidden = !!hasRows; empty.style.display = hasRows ? 'none' : ''; }
          }catch(_){ if(empty){ empty.hidden = false; empty.style.display = ''; } }
          // CSV button enable/disable and pagination sync
          var csvBtn=document.getElementById('au-download-btn'); if(csvBtn){ var has=!!table.querySelector('tbody tr'); csvBtn.disabled = !has; csvBtn.setAttribute('aria-disabled', (!has).toString()); csvBtn.title = has? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.'; }
          auRenderPage();
        }
        function wireCommandDependency(root){
          try{
            var typeSel = root.querySelector('td[data-col="type"] select');
            var cmdInp = root.querySelector('td[data-col="command"] input');
            if(!typeSel || !cmdInp) return;
            function apply(){ var en = (typeSel.value === 'sudo'); cmdInp.disabled = !en; }
            typeSel.addEventListener('change', apply);
            apply();
          }catch(_){ }
        }
        updateEmptyState();
  
        // Select all (visible rows only)
        var selectAll = document.getElementById('au-select-all');
        if(selectAll){
          selectAll.addEventListener('change', function(){
            var checks = table.querySelectorAll('.au-row-check:not([disabled])');
            checks.forEach(function(c){ var tr=c.closest('tr'); var hidden=tr && (tr.hasAttribute('data-hidden') || tr.style.display==='none'); if(!hidden){ c.checked = !!selectAll.checked; } if(tr){ tr.classList.toggle('selected', !!c.checked && !hidden); } });
          });
        }
  
        // Row click toggling and selection syncing
        table.addEventListener('click', function(ev){ (function(){ var tr=ev.target.closest('tr'); if(!tr || !tr.parentNode || tr.parentNode.tagName.toLowerCase()!=='tbody') return; var isControl=ev.target.closest('button, a, input, select, textarea, label'); var onCheckbox=ev.target.closest('input[type="checkbox"].au-row-check'); if(isControl && !onCheckbox) return; if(onCheckbox) return; var cb=tr.querySelector('.au-row-check'); if(!cb) return; var hidden=tr.hasAttribute('data-hidden') || tr.style.display==='none'; if(hidden) return; cb.checked = !cb.checked; tr.classList.toggle('selected', cb.checked); var sa=document.getElementById('au-select-all'); if(sa){ var visChecks=table.querySelectorAll('tbody tr:not([data-hidden]) .au-row-check'); if(visChecks.length){ sa.checked = Array.prototype.every.call(visChecks, function(c){ return c.checked; }); } else { sa.checked=false; } } })(); });
        table.addEventListener('change', function(ev){ var cb=ev.target.closest('.au-row-check'); if(!cb) return; var tr=cb.closest('tr'); if(tr){ var hidden=tr.hasAttribute('data-hidden') || tr.style.display==='none'; tr.classList.toggle('selected', !!cb.checked && !hidden); } var sa=document.getElementById('au-select-all'); if(sa){ var visChecks=table.querySelectorAll('tbody tr:not([data-hidden]) .au-row-check'); if(visChecks.length){ sa.checked = Array.prototype.every.call(visChecks, function(c){ return c.checked; }); } else { sa.checked=false; } } });
  
        // CSV modal wiring
        (function(){
          var btn=document.getElementById('au-download-btn');
          var modalId='au-download-modal';
          var closeBtn=document.getElementById('au-download-close');
          var confirmBtn=document.getElementById('au-download-confirm');
          function openModalLocal(id){ var el=document.getElementById(id); if(!el) return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden','false'); }
          function closeModalLocal(id){ var el=document.getElementById(id); if(!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } }
    if(btn){ btn.addEventListener('click', function(){ if(btn.disabled) return; var saved=auSavedVisibleRows(); var total=saved.length; if(total<=0) return; var selectedCount = saved.filter(function(tr){ var cb=tr.querySelector('.au-row-check'); return cb && cb.checked; }).length; var subtitle=document.getElementById('au-download-subtitle'); if(subtitle){ subtitle.textContent = selectedCount>0 ? ('선택된 '+selectedCount+'개 또는 전체 '+total+'개 결과 중 범위를 선택하세요.') : ('현재 결과 '+total+'개 항목을 CSV로 내보냅니다.'); } var rowSelectedWrap=document.getElementById('au-csv-range-row-selected'); var optSelected=document.getElementById('au-csv-range-selected'); var optAll=document.getElementById('au-csv-range-all'); if(rowSelectedWrap) rowSelectedWrap.hidden = !(selectedCount>0); if(optSelected){ optSelected.disabled = !(selectedCount>0); optSelected.checked = selectedCount>0; } if(optAll){ optAll.checked = !(selectedCount>0); } openModalLocal(modalId); }); }
          if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalLocal(modalId); }); }
          var modalEl=document.getElementById(modalId);
          if(modalEl){ modalEl.addEventListener('click', function(e){ if(e.target===modalEl) closeModalLocal(modalId); }); document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(modalId); }); }
          if(confirmBtn){ confirmBtn.addEventListener('click', function(){ var onlySel = !!(document.getElementById('au-csv-range-selected') && document.getElementById('au-csv-range-selected').checked); auExportCSV(onlySel); closeModalLocal(modalId); }); }
        })();
  
        // Add row
        var addBtn = document.getElementById('au-row-add');
        if(addBtn){
          addBtn.addEventListener('click', function(){
            var tbody = table.querySelector('tbody'); if(!tbody) return;
            var tr = document.createElement('tr');
            tr.innerHTML = `
              <td><input type=\"checkbox\" class=\"au-row-check\" aria-label=\"행 선택\"></td>
              <td data-col=\"type\">
                <select>
                  <option value=\"\" selected disabled>선택</option>
                  <option value=\"sudo\">sudo</option>
                  <option value=\"cron.allow\">cron.allow</option>
                  <option value=\"cron.deny\">cron.deny</option>
                  <option value=\"at.allow\">at.allow</option>
                  <option value=\"at.deny\">at.deny</option>
                </select>
              </td>
              <td data-col=\"target\"><input type=\"text\" placeholder=\"예: user01, %wheel, %admin\"></td>
              <td data-col=\"action\">
                <select>
                  <option value=\"\" selected disabled>선택</option>
                  <option value=\"allow\">allow</option>
                  <option value=\"deny\">deny</option>
                </select>
              </td>
              <td data-col=\"command\"><input type=\"text\" placeholder=\"sudo일 때만 활성화 (예: ALL, /usr/bin/systemctl)\"></td>
              <td data-col=\"remark\"><input type=\"text\" placeholder=\"비고\"></td>
              <td class=\"system-actions table-actions\">
                <button class=\"action-btn js-au-toggle\" data-action=\"save\" type=\"button\" title=\"저장\" aria-label=\"저장\"><img src=\"/static/image/svg/save.svg\" alt=\"저장\" class=\"action-icon\"></button>
                <button class=\"action-btn danger js-au-del\" data-action=\"delete\" type=\"button\" title=\"삭제\" aria-label=\"삭제\"><img src=\"/static/image/svg/list/free-icon-trash.svg\" alt=\"삭제\" class=\"action-icon\"></button>
              </td>`;
            tbody.appendChild(tr);
            try{ auGoLast(); }catch(_){ }
            updateEmptyState();
            wireCommandDependency(tr);
          });
        }
  
        // Delegate actions
        table.addEventListener('click', function(ev){
          var target = ev.target.closest('.js-au-del, .js-au-edit, .js-au-commit, .js-au-toggle'); if(!target) return;
          var tr = ev.target.closest('tr'); if(!tr) return;
  
          // delete
          if(target.classList.contains('js-au-del')){
            if(tr && tr.parentNode){ tr.parentNode.removeChild(tr); }
            try{ auClampPage(); }catch(_){ }
            updateEmptyState();
            return;
          }
  
          // edit -> save
          if(
            target.classList.contains('js-au-edit') ||
            (target.classList.contains('js-au-toggle') && target.getAttribute('data-action') === 'edit')
          ){
            function toInput(name, placeholder){
              var td = tr.querySelector('[data-col="'+name+'"]'); if(!td) return;
              var current = (td.textContent||'').trim();
              if(name==='type'){
                var tv = current; if(tv==='-') tv='';
                var topts = ['<option value=""'+(tv?'':' selected')+' disabled>선택</option>',
                  '<option value="sudo"'+(tv==='sudo'?' selected':'')+'>sudo</option>',
                  '<option value="cron.allow"'+(tv==='cron.allow'?' selected':'')+'>cron.allow</option>',
                  '<option value="cron.deny"'+(tv==='cron.deny'?' selected':'')+'>cron.deny</option>',
                  '<option value="at.allow"'+(tv==='at.allow'?' selected':'')+'>at.allow</option>',
                  '<option value="at.deny"'+(tv==='at.deny'?' selected':'')+'>at.deny</option>'].join('');
                td.innerHTML = '<select>'+topts+'</select>';
                return;
              }
              if(name==='action'){
                var av = current; if(av==='-') av='';
                var aopts = ['<option value=""'+(av?'':' selected')+' disabled>선택</option>',
                  '<option value="allow"'+(av==='allow'?' selected':'')+'>allow</option>',
                  '<option value="deny"'+(av==='deny'?' selected':'')+'>deny</option>'].join('');
                td.innerHTML = '<select>'+aopts+'</select>';
                return;
              }
              td.innerHTML = '<input type="text" value="'+current+'" placeholder="'+(placeholder||'')+'">';
            }
            ['type','target','action','command','remark'].forEach(function(n){ toInput(n); });
            wireCommandDependency(tr);
            var toggleBtn = tr.querySelector('.js-au-toggle');
            if(toggleBtn){
              toggleBtn.setAttribute('data-action','save');
              toggleBtn.title='저장'; toggleBtn.setAttribute('aria-label','저장');
              toggleBtn.innerHTML='<img src="/static/image/svg/save.svg" alt="저장" class="action-icon">';
            } else {
              var actions = tr.querySelector('.table-actions');
              if(actions){ actions.classList.add('system-actions'); actions.innerHTML = '<button class="action-btn js-au-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button> <button class="action-btn danger js-au-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'; }
            }
          }
        });
      })(); */

  });
})();
  
      // [Tabs moved to /static/js/_detail/tab*.js]

      // [Tabs moved to /static/js/_detail/tab*.js]

      // ---------- Hardware/Allocation table interactions (system tab) ----------
      (function(){
        var table = document.getElementById('hw-spec-table'); if(!table) return;
        // Manager tab uses the same table id but a different schema; skip hardware logic entirely
        try{ if((table.getAttribute('data-context')||'').toLowerCase()==='manager'){ return; } }catch(_){ }
        // Vendor Software schema: guard by data-context
        (function(){
          var ctx=(table.getAttribute('data-context')||'').toLowerCase();
          var isVendorSw = (ctx==='vendor-sw');
          if(!isVendorSw) return;

          var empty = document.getElementById('hw-empty');
          var infoEl = document.getElementById('hw-pagination-info');
          var numWrap = document.getElementById('hw-page-numbers');
          var btnFirst = document.getElementById('hw-first');
          var btnPrev = document.getElementById('hw-prev');
          var btnNext = document.getElementById('hw-next');
          var btnLast = document.getElementById('hw-last');
          var selectAll = document.getElementById('hw-select-all');

          var CAT_OPTIONS = ['운영체제','데이터베이스','미들웨어','가상화','보안S/W','고가용성'];
          var TYPE_MAP = {
            '운영체제': ['유닉스','리눅스','윈도우','임베디드'],
            '데이터베이스': ['RDBMS','NoSQL'],
            '미들웨어': ['WEB','WAS','API','APM','FRAMEWORK'],
            '가상화': ['하이퍼바이저','컨테이너','쿠버네티스'],
            '보안S/W': ['백신','취약점 분석','서버 접근제어','서버 통합계정','서버 모니터링','서버 보안관리','DB 접근제어','기타S/W'],
            '고가용성': ['Active-Active','Active-Passive']
          };

          // Pagination state
          var swState = { page:1, pageSize:10 };
          (function initPageSize(){ try{ var saved=localStorage.getItem('vendor:sw:pageSize'); var sel=document.getElementById('hw-page-size'); if(sel){ if(saved && ['10','20','50','100'].indexOf(saved)>-1){ swState.pageSize=parseInt(saved,10); sel.value=saved; } sel.addEventListener('change', function(){ var v=parseInt(sel.value,10); if(!isNaN(v)){ swState.page=1; swState.pageSize=v; localStorage.setItem('vendor:sw:pageSize', String(v)); swRenderPage(); } }); } }catch(_){ } })();
          function swRows(){ var tbody=table.querySelector('tbody'); return tbody? Array.from(tbody.querySelectorAll('tr')): []; }
          function swTotal(){ return swRows().length; }
          function swPages(){ var total=swTotal(); return Math.max(1, Math.ceil(total / Math.max(1, swState.pageSize))); }
          function swClampPage(){ var pages=swPages(); if(swState.page>pages) swState.page=pages; if(swState.page<1) swState.page=1; }
          function swUpdateUI(){ if(infoEl){ var total=swTotal(); var start= total? (swState.page-1)*swState.pageSize+1 : 0; var end=Math.min(total, swState.page*swState.pageSize); infoEl.textContent = start + '-' + end + ' / ' + total + '개 항목'; } if(numWrap){ var pages=swPages(); numWrap.innerHTML=''; for(var p=1;p<=pages && p<=50;p++){ var b=document.createElement('button'); b.className='page-btn'+(p===swState.page?' active':''); b.textContent=String(p); b.dataset.page=String(p); numWrap.appendChild(b); } } var pages2=swPages(); if(btnFirst) btnFirst.disabled=(swState.page===1); if(btnPrev) btnPrev.disabled=(swState.page===1); if(btnNext) btnNext.disabled=(swState.page===pages2); if(btnLast) btnLast.disabled=(swState.page===pages2); var sizeSel=document.getElementById('hw-page-size'); if(sizeSel){ var none=(swTotal()===0); sizeSel.disabled=none; if(none){ try{ sizeSel.value='10'; swState.pageSize=10; }catch(_){ } } } }
          function swRenderPage(){ swClampPage(); var rows=swRows(); var startIdx=(swState.page-1)*swState.pageSize; var endIdx=startIdx + swState.pageSize - 1; rows.forEach(function(tr,idx){ var visible=idx>=startIdx && idx<=endIdx; tr.style.display = visible? '' : 'none'; if(visible){ tr.removeAttribute('data-hidden'); } else { tr.setAttribute('data-hidden','1'); } var cb=tr.querySelector('.hw-row-check'); if(cb){ tr.classList.toggle('selected', !!cb.checked && visible); } }); swUpdateUI(); if(selectAll){ var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check'); if(visChecks.length){ selectAll.checked = Array.prototype.every.call(visChecks, function(c){ return c.checked; }); } else { selectAll.checked=false; } } }
          function swGo(p){ swState.page=p; swRenderPage(); }
          function swGoDelta(d){ swGo(swState.page + d); }
          if(numWrap){ numWrap.addEventListener('click', function(e){ var b=e.target.closest('button.page-btn'); if(!b) return; var p=parseInt(b.dataset.page,10); if(!isNaN(p)) swGo(p); }); }
          if(btnFirst) btnFirst.addEventListener('click', function(){ swGo(1); });
          if(btnPrev) btnPrev.addEventListener('click', function(){ swGoDelta(-1); });
          if(btnNext) btnNext.addEventListener('click', function(){ swGoDelta(1); });
          if(btnLast) btnLast.addEventListener('click', function(){ swGo(swPages()); });
          // Persist total quantity across all saved rows in this tab
          function swPersistQtySum(){
            try{
              var tbody = table.querySelector('tbody');
              var trs = tbody? Array.from(tbody.querySelectorAll('tr')): [];
              var sum = 0;
              trs.forEach(function(tr){
                // count only saved rows (no active editors)
                var editing = tr.querySelector('td[data-col] input, td[data-col] select, td[data-col] textarea');
                if(editing) return;
                var td = tr.querySelector('[data-col="qty"]');
                var raw = td? (td.textContent||'').trim() : '';
                var n = parseInt(String(raw).replace(/[^0-9-]/g,''),10);
                if(!isNaN(n) && isFinite(n)) sum += n;
              });
              try{ localStorage.setItem('vendor:sw:sumQty', String(sum)); }catch(_){ }
            }catch(_){ }
          }
          function updateEmptyState(){ try{ var has = !!table.querySelector('tbody tr'); if(empty){ empty.hidden = has; empty.style.display = has ? 'none' : ''; } }catch(_){ if(empty){ empty.hidden=false; empty.style.display=''; } } var csvBtn=document.getElementById('hw-download-btn'); if(csvBtn){ var hasRows = !!table.querySelector('tbody tr'); csvBtn.disabled=!hasRows; csvBtn.setAttribute('aria-disabled', (!hasRows).toString()); csvBtn.title = hasRows? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.'; } swRenderPage(); try{ swPersistQtySum(); }catch(_){ } }
          updateEmptyState();

          // Select-all only visible rows
          if(selectAll){ selectAll.addEventListener('change', function(){ var checks=table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check:not([disabled])'); checks.forEach(function(c){ c.checked = !!selectAll.checked; var tr=c.closest('tr'); if(tr){ tr.classList.toggle('selected', !!c.checked); } }); }); }
          // Row click toggles selection
          table.addEventListener('click', function(ev){ var onCtrl = ev.target.closest('button, a, input, select, textarea, label'); var onCb = ev.target.closest('input[type="checkbox"].hw-row-check'); if(onCb){ var tr=onCb.closest('tr'); if(tr){ var hidden=tr.hasAttribute('data-hidden') || tr.style.display==='none'; tr.classList.toggle('selected', !!onCb.checked && !hidden); } if(selectAll){ var vis=table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check'); if(vis.length){ selectAll.checked = Array.prototype.every.call(vis, function(c){ return c.checked; }); } else { selectAll.checked=false; } } return; } if(!onCtrl){ var tr=ev.target.closest('tr'); if(!tr) return; if(tr.hasAttribute('data-hidden') || tr.style.display==='none') return; var cb=tr.querySelector('.hw-row-check'); if(!cb) return; cb.checked=!cb.checked; tr.classList.toggle('selected', !!cb.checked); if(selectAll){ var vis=table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check'); if(vis.length){ selectAll.checked = Array.prototype.every.call(vis, function(c){ return c.checked; }); } else { selectAll.checked=false; } } } });

          function buildCategorySelect(current){ var opts=['<option value=""'+(current?'':' selected')+' disabled>선택</option>'].concat(CAT_OPTIONS.map(function(o){ return '<option value="'+o+'"'+(o===current?' selected':'')+'>'+o+'</option>'; })).join(''); return '<select>'+opts+'</select>'; }
          function buildTypeSelect(cat, current){ var list = TYPE_MAP[cat] || []; var disabled = !cat; var opts=['<option value=""'+(current?'':' selected')+' disabled>선택</option>'].concat(list.map(function(o){ return '<option value="'+o+'"'+(o===current?' selected':'')+'>'+o+'</option>'; })).join(''); var html = '<select'+(disabled?' disabled':'')+'>'+opts+'</select>'; return html; }
          function wireTypeDependency(root){ try{ var catSel = root.querySelector('td[data-col="category"] select'); var typeSel = root.querySelector('td[data-col="type"] select'); if(!catSel || !typeSel) return; function apply(){ var cat = catSel.value || ''; var list = TYPE_MAP[cat] || []; typeSel.innerHTML = '<option value="" selected disabled>선택</option>' + list.map(function(o){ return '<option value="'+o+'">'+o+'</option>'; }).join(''); typeSel.disabled = !cat; } catSel.addEventListener('change', apply); apply(); }catch(_){ } }

          // Add row
          var addBtn = document.getElementById('hw-row-add');
          if(addBtn){ addBtn.addEventListener('click', function(){ var tbody=table.querySelector('tbody'); if(!tbody) return; var tr=document.createElement('tr'); tr.innerHTML = `
              <td><input type="checkbox" class="hw-row-check" aria-label="행 선택"></td>
              <td data-col="category">${buildCategorySelect('')}</td>
              <td data-col="model"><input type="text" placeholder="모델명 (필수)"></td>
              <td data-col="type">${buildTypeSelect('', '')}</td>
              <td data-col="qty"><input type="number" min="1" step="1" value="1" placeholder="1"></td>
              <td data-col="remark"><input type="text" placeholder="비고"></td>
              <td class="system-actions table-actions">
                <button class="action-btn js-sw-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button>
                <button class="action-btn danger js-sw-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>
              </td>`; tbody.appendChild(tr); wireTypeDependency(tr); try{ swGo(swPages()); }catch(_){ } updateEmptyState(); }); }

          // Delegate actions handled below (single listener)

          // Replace edit/save implementation
          table.addEventListener('click', function(ev){
            var target = ev.target.closest('.js-sw-del, .js-sw-toggle'); if(!target) return; var tr = ev.target.closest('tr'); if(!tr) return;
            if(target.classList.contains('js-sw-del')){ if(tr && tr.parentNode){ tr.parentNode.removeChild(tr); } try{ swClampPage(); }catch(_){ } updateEmptyState(); return; }
            if(target.classList.contains('js-sw-toggle') && target.getAttribute('data-action')==='edit'){
              function toInput(name){ var td=tr.querySelector('[data-col="'+name+'"]'); if(!td) return; var current=(td.textContent||'').trim(); if(name==='category'){ td.innerHTML = buildCategorySelect(current==='-'?'':current); return; } if(name==='type'){ var catText = (tr.querySelector('[data-col="category"]').textContent||'').trim(); td.innerHTML = buildTypeSelect(catText==='-'?'':catText, current==='-'?'':current); return; } if(name==='qty'){ var val=(current==='-'? '1' : String(current).replace(/\D/g,'')); td.innerHTML = '<input type="number" min="1" step="1" value="'+(val||'1')+'">'; return; } td.innerHTML = '<input type="text" value="'+(current==='-'?'':current)+'" placeholder="">'; }
              ['category','model','type','qty','remark'].forEach(toInput); wireTypeDependency(tr);
              var toggleBtn = tr.querySelector('.js-sw-toggle'); if(toggleBtn){ toggleBtn.setAttribute('data-action','save'); toggleBtn.title='저장'; toggleBtn.setAttribute('aria-label','저장'); toggleBtn.innerHTML='<img src="/static/image/svg/save.svg" alt="저장" class="action-icon">'; } else { var actions = tr.querySelector('.table-actions'); if(actions){ actions.classList.add('system-actions'); actions.innerHTML = '<button class="action-btn js-sw-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button> <button class="action-btn danger js-sw-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'; } }
              return;
            }
            if(target.classList.contains('js-sw-toggle') && target.getAttribute('data-action')==='save'){
              function getInput(name){ var td=tr.querySelector('[data-col="'+name+'"]'); return td? td.querySelector('input, select'): null; }
              function setError(el,on){ if(!el) return; if(on){ el.classList.add('input-error'); el.setAttribute('aria-invalid','true'); } else { el.classList.remove('input-error'); el.removeAttribute('aria-invalid'); } }
              var firstInvalid=null;
              var modelInp = getInput('model'); var modelVal = (modelInp? modelInp.value : (tr.querySelector('[data-col="model"]').textContent||'')).trim(); if(!modelVal){ setError(modelInp,true); if(!firstInvalid) firstInvalid=modelInp; } else { setError(modelInp,false); }
              var catSel = getInput('category'); var catVal = (catSel? catSel.value : (tr.querySelector('[data-col="category"]').textContent||'')).trim(); if(!catVal){ setError(catSel,true); if(!firstInvalid) firstInvalid=catSel; } else { setError(catSel,false); }
              var typeSel = getInput('type'); var typeVal = (typeSel? typeSel.value : (tr.querySelector('[data-col="type"]').textContent||'')).trim(); if(!typeVal){ setError(typeSel,true); if(!firstInvalid) firstInvalid=typeSel; } else { setError(typeSel,false); }
              var qtyInp = getInput('qty'); var qtyRaw = (qtyInp? qtyInp.value : (tr.querySelector('[data-col="qty"]').textContent||'')).trim(); var qtyNum = parseInt(qtyRaw,10); if(isNaN(qtyNum) || qtyNum < 1){ setError(qtyInp,true); if(!firstInvalid) firstInvalid=qtyInp; } else { setError(qtyInp,false); }
              if(firstInvalid){ try{ firstInvalid.focus(); }catch(_){ } return; }
              function commit(name,val){ var td=tr.querySelector('[data-col="'+name+'"]'); if(!td) return; var text=(val===''||val==null)? '-' : String(val); td.textContent = text; }
              function read(name){ var el=getInput(name); var v=(el? el.value : (tr.querySelector('[data-col="'+name+'"]').textContent||'')); return String(v).trim(); }
              commit('category', catVal);
              commit('model', modelVal);
              commit('type', typeVal);
              commit('qty', qtyNum);
              commit('remark', read('remark'));
              var toggleBtn = tr.querySelector('.js-sw-toggle'); if(toggleBtn){ toggleBtn.setAttribute('data-action','edit'); toggleBtn.title='편집'; toggleBtn.setAttribute('aria-label','편집'); toggleBtn.innerHTML='<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon">'; }
              updateEmptyState();
              var cb = tr.querySelector('.hw-row-check'); if(cb){ var hidden = tr.hasAttribute('data-hidden') || tr.style.display==='none'; tr.classList.toggle('selected', !!cb.checked && !hidden); }
              return;
            }
          });

          // CSV helpers for vendor SW
          function swEscapeCSV(val){ return '"' + String(val).replace(/"/g,'""') + '"'; }
          function swRowSaved(tr){ var t=tr.querySelector('.js-sw-toggle'); var inEdit=t && t.getAttribute('data-action')==='save'; if(inEdit) return false; return !tr.querySelector('td[data-col] input, td[data-col] select, td[data-col] textarea'); }
          function swVisibleRows(){ var tbody=table.querySelector('tbody'); if(!tbody) return []; return Array.from(tbody.querySelectorAll('tr')).filter(function(tr){ return !(tr.hasAttribute('data-hidden') || tr.style.display==='none'); }); }
          function swSavedVisibleRows(){ return swVisibleRows().filter(swRowSaved); }
          function swExportCSV(onlySelected){ var tbody=table.querySelector('tbody'); if(!tbody) return; var headers=['구분','모델명','유형','수량','비고']; var trs=swSavedVisibleRows(); if(onlySelected){ trs = trs.filter(function(tr){ var cb=tr.querySelector('.hw-row-check'); return cb && cb.checked; }); } if(trs.length===0) return; function text(tr,col){ var td=tr.querySelector('[data-col="'+col+'"]'); return td? (td.textContent||'').trim() : ''; } var cols=['category','model','type','qty','remark']; var rows = trs.map(function(tr){ return cols.map(function(c){ return text(tr,c); }); }); var lines = [headers].concat(rows).map(function(arr){ return arr.map(swEscapeCSV).join(','); }); var csv='\uFEFF'+lines.join('\r\n'); var d=new Date(); var yyyy=d.getFullYear(); var mm=String(d.getMonth()+1).padStart(2,'0'); var dd=String(d.getDate()).padStart(2,'0'); var filename='vendor_software_'+yyyy+mm+dd+'.csv'; try{ var blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); var url=URL.createObjectURL(blob); var a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); } catch(_){ var a2=document.createElement('a'); a2.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a2.download=filename; document.body.appendChild(a2); a2.click(); document.body.removeChild(a2); } }
          (function(){ var btn = document.getElementById('hw-download-btn'); var modalId='hw-download-modal'; var closeBtn=document.getElementById('hw-download-close'); var confirmBtn=document.getElementById('hw-download-confirm'); function openModalLocal(id){ var el=document.getElementById(id); if(!el) return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden','false'); } function closeModalLocal(id){ var el=document.getElementById(id); if(!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } } if(btn){ btn.addEventListener('click', function(){ if(btn.disabled) return; var saved=swSavedVisibleRows(); var total=saved.length; if(total<=0) return; var selectedCount = saved.filter(function(tr){ var cb=tr.querySelector('.hw-row-check'); return cb && cb.checked; }).length; var subtitle=document.getElementById('hw-download-subtitle'); if(subtitle){ subtitle.textContent = selectedCount>0 ? ('선택된 '+selectedCount+'개 또는 전체 '+total+'개 결과 중 범위를 선택하세요.') : ('현재 결과 '+total+'개 항목을 CSV로 내보냅니다.'); } var rowSelectedWrap=document.getElementById('hw-csv-range-row-selected'); var optSelected=document.getElementById('hw-csv-range-selected'); var optAll=document.getElementById('hw-csv-range-all'); if(rowSelectedWrap) rowSelectedWrap.hidden = !(selectedCount>0); if(optSelected){ optSelected.disabled = !(selectedCount>0); optSelected.checked = selectedCount>0; } if(optAll){ optAll.checked = !(selectedCount>0); } openModalLocal(modalId); }); } if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalLocal(modalId); }); } var modalEl=document.getElementById(modalId); if(modalEl){ modalEl.addEventListener('click', function(e){ if(e.target===modalEl) closeModalLocal(modalId); }); document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(modalId); }); } if(confirmBtn){ confirmBtn.addEventListener('click', function(){ var onlySel = !!(document.getElementById('hw-csv-range-selected') && document.getElementById('hw-csv-range-selected').checked); swExportCSV(onlySel); closeModalLocal(modalId); }); } })();

          return; // handled vendor software, stop here
        })();
        // Vendor Hardware schema: guard strictly by data-context to avoid overlap with vendor software
        var isVendorHw = (function(){
          var ctx=(table.getAttribute('data-context')||'').toLowerCase();
          return ctx==='vendor-hw';
        })();
        if(isVendorHw){
          var empty = document.getElementById('hw-empty');
          var infoEl = document.getElementById('hw-pagination-info');
          var numWrap = document.getElementById('hw-page-numbers');
          var btnFirst = document.getElementById('hw-first');
          var btnPrev = document.getElementById('hw-prev');
          var btnNext = document.getElementById('hw-next');
          var btnLast = document.getElementById('hw-last');
          var selectAll = document.getElementById('hw-select-all');

          var CAT_OPTIONS = ['서버','스토리지','SAN','네트워크','보안장비'];
          var TYPE_MAP = {
            '서버': ['서버','프레임','워크스테이션'],
            '스토리지': ['블록 스토리지','네트워크 스토리지','오브젝트 스토리지','물리 테이프 라이브러리','가상 테이프 라이브러리'],
            'SAN': ['SAN 디렉터','SAN 스위치'],
            '네트워크': ['L2','L3','L4','L7','무선장비','회선장비'],
            '보안장비': ['방화벽','VPN','IDS','IPS','HSM','KMS','WIPS','기타 보안장비']
          };

          // Pagination
          var hwState = { page:1, pageSize:10 };
          (function initPageSize(){ try{ var saved=localStorage.getItem('vendor:hw:pageSize'); var sel=document.getElementById('hw-page-size'); if(sel){ if(saved && ['10','20','50','100'].indexOf(saved)>-1){ hwState.pageSize=parseInt(saved,10); sel.value=saved; } sel.addEventListener('change', function(){ var v=parseInt(sel.value,10); if(!isNaN(v)){ hwState.page=1; hwState.pageSize=v; localStorage.setItem('vendor:hw:pageSize', String(v)); hwRenderPage(); } }); } }catch(_){ } })();
          function hwRows(){ var tbody=table.querySelector('tbody'); return tbody? Array.from(tbody.querySelectorAll('tr')): []; }
          function hwTotal(){ return hwRows().length; }
          function hwPages(){ var total=hwTotal(); return Math.max(1, Math.ceil(total / Math.max(1, hwState.pageSize))); }
          function hwClampPage(){ var pages=hwPages(); if(hwState.page>pages) hwState.page=pages; if(hwState.page<1) hwState.page=1; }
          function hwUpdateUI(){
            if(infoEl){ var total=hwTotal(); var start= total? (hwState.page-1)*hwState.pageSize+1 : 0; var end=Math.min(total, hwState.page*hwState.pageSize); infoEl.textContent = start + '-' + end + ' / ' + total + '개 항목'; }
            if(numWrap){ var pages=hwPages(); numWrap.innerHTML=''; for(var p=1;p<=pages && p<=50;p++){ var b=document.createElement('button'); b.className='page-btn'+(p===hwState.page?' active':''); b.textContent=String(p); b.dataset.page=String(p); numWrap.appendChild(b); } }
            var pages2=hwPages(); if(btnFirst) btnFirst.disabled=(hwState.page===1); if(btnPrev) btnPrev.disabled=(hwState.page===1); if(btnNext) btnNext.disabled=(hwState.page===pages2); if(btnLast) btnLast.disabled=(hwState.page===pages2);
            var sizeSel=document.getElementById('hw-page-size'); if(sizeSel){ var none=(hwTotal()===0); sizeSel.disabled=none; if(none){ try{ sizeSel.value='10'; hwState.pageSize=10; }catch(_){ } } }
          }
          function hwRenderPage(){
            hwClampPage();
            var rows=hwRows();
            var startIdx=(hwState.page-1)*hwState.pageSize;
            var endIdx=startIdx + hwState.pageSize - 1;
            rows.forEach(function(tr,idx){ var visible=idx>=startIdx && idx<=endIdx; tr.style.display = visible? '' : 'none'; if(visible){ tr.removeAttribute('data-hidden'); } else { tr.setAttribute('data-hidden','1'); } var cb=tr.querySelector('.hw-row-check'); if(cb){ tr.classList.toggle('selected', !!cb.checked && visible); } });
            hwUpdateUI();
            if(selectAll){ var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check'); if(visChecks.length){ selectAll.checked = Array.prototype.every.call(visChecks, function(c){ return c.checked; }); } else { selectAll.checked=false; } }
          }
          function hwGo(p){ hwState.page=p; hwRenderPage(); }
          function hwGoDelta(d){ hwGo(hwState.page + d); }
          if(numWrap){ numWrap.addEventListener('click', function(e){ var b=e.target.closest('button.page-btn'); if(!b) return; var p=parseInt(b.dataset.page,10); if(!isNaN(p)) hwGo(p); }); }
          if(btnFirst) btnFirst.addEventListener('click', function(){ hwGo(1); });
          if(btnPrev) btnPrev.addEventListener('click', function(){ hwGoDelta(-1); });
          if(btnNext) btnNext.addEventListener('click', function(){ hwGoDelta(1); });
          if(btnLast) btnLast.addEventListener('click', function(){ hwGo(hwPages()); });
          // Persist total quantity across all saved rows in this tab
          function hwPersistQtySum(){
            try{
              var tbody = table.querySelector('tbody');
              var trs = tbody? Array.from(tbody.querySelectorAll('tr')): [];
              var sum = 0;
              trs.forEach(function(tr){
                // saved rows only
                var editing = tr.querySelector('td[data-col] input, td[data-col] select, td[data-col] textarea');
                if(editing) return;
                var td = tr.querySelector('[data-col="qty"]');
                var raw = td? (td.textContent||'').trim() : '';
                var n = parseInt(String(raw).replace(/[^0-9-]/g,''),10);
                if(!isNaN(n) && isFinite(n)) sum += n;
              });
              try{ localStorage.setItem('vendor:hw:sumQty', String(sum)); }catch(_){ }
            }catch(_){ }
          }
          function updateEmptyState(){
            try{ var has = !!table.querySelector('tbody tr'); if(empty){ empty.hidden = has; empty.style.display = has ? 'none' : ''; } }catch(_){ if(empty){ empty.hidden=false; empty.style.display=''; } }
            var csvBtn=document.getElementById('hw-download-btn'); if(csvBtn){ var hasRows = !!table.querySelector('tbody tr'); csvBtn.disabled=!hasRows; csvBtn.setAttribute('aria-disabled', (!hasRows).toString()); csvBtn.title = hasRows? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.'; }
            hwRenderPage();
            try{ hwPersistQtySum(); }catch(_){ }
          }
          updateEmptyState();

          // Select-all only visible rows
          if(selectAll){ selectAll.addEventListener('change', function(){ var checks=table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check:not([disabled])'); checks.forEach(function(c){ c.checked = !!selectAll.checked; var tr=c.closest('tr'); if(tr){ tr.classList.toggle('selected', !!c.checked); } }); }); }
          // Row click toggles selection
          table.addEventListener('click', function(ev){ var onCtrl = ev.target.closest('button, a, input, select, textarea, label'); var onCb = ev.target.closest('input[type="checkbox"].hw-row-check'); if(onCb){ var tr=onCb.closest('tr'); if(tr){ var hidden=tr.hasAttribute('data-hidden') || tr.style.display==='none'; tr.classList.toggle('selected', !!onCb.checked && !hidden); } if(selectAll){ var vis=table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check'); if(vis.length){ selectAll.checked = Array.prototype.every.call(vis, function(c){ return c.checked; }); } else { selectAll.checked=false; } } return; } if(!onCtrl){ var tr=ev.target.closest('tr'); if(!tr) return; if(tr.hasAttribute('data-hidden') || tr.style.display==='none') return; var cb=tr.querySelector('.hw-row-check'); if(!cb) return; cb.checked=!cb.checked; tr.classList.toggle('selected', !!cb.checked); if(selectAll){ var vis=table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check'); if(vis.length){ selectAll.checked = Array.prototype.every.call(vis, function(c){ return c.checked; }); } else { selectAll.checked=false; } } } });

          function buildCategorySelect(current){ var opts=['<option value=""'+(current?'':' selected')+' disabled>선택</option>'].concat(CAT_OPTIONS.map(function(o){ return '<option value="'+o+'"'+(o===current?' selected':'')+'>'+o+'</option>'; })).join(''); return '<select>'+opts+'</select>'; }
          function buildTypeSelect(cat, current){ var list = TYPE_MAP[cat] || []; var disabled = !cat; var opts=['<option value=""'+(current?'':' selected')+' disabled>선택</option>'].concat(list.map(function(o){ return '<option value="'+o+'"'+(o===current?' selected':'')+'>'+o+'</option>'; })).join(''); var html = '<select'+(disabled?' disabled':'')+'>'+opts+'</select>'; return html; }
          function wireTypeDependency(root){ try{ var catSel = root.querySelector('td[data-col="category"] select'); var typeSel = root.querySelector('td[data-col="type"] select'); if(!catSel || !typeSel) return; function apply(){ var cat = catSel.value || ''; var list = TYPE_MAP[cat] || []; typeSel.innerHTML = '<option value="" selected disabled>선택</option>' + list.map(function(o){ return '<option value="'+o+'">'+o+'</option>'; }).join(''); typeSel.disabled = !cat; } catSel.addEventListener('change', apply); apply(); }catch(_){ } }

          // Add row
          var addBtn = document.getElementById('hw-row-add');
          if(addBtn){ addBtn.addEventListener('click', function(){ var tbody=table.querySelector('tbody'); if(!tbody) return; var tr=document.createElement('tr'); tr.innerHTML = `
              <td><input type="checkbox" class="hw-row-check" aria-label="행 선택"></td>
              <td data-col="category">${buildCategorySelect('')}</td>
              <td data-col="model"><input type="text" placeholder="모델명 (필수)"></td>
              <td data-col="type">${buildTypeSelect('', '')}</td>
              <td data-col="qty"><input type="number" min="1" step="1" value="1" placeholder="1"></td>
              <td data-col="remark"><input type="text" placeholder="비고"></td>
              <td class="system-actions table-actions">
                <button class="action-btn js-hw-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button>
                <button class="action-btn danger js-hw-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>
              </td>`; tbody.appendChild(tr); wireTypeDependency(tr); try{ hwGo(hwPages()); }catch(_){ } updateEmptyState(); }); }

          // Delegate actions (edit/save/delete)
          table.addEventListener('click', function(ev){
            var target = ev.target.closest('.js-hw-del, .js-hw-edit, .js-hw-commit, .js-hw-toggle'); if(!target) return; var tr = ev.target.closest('tr'); if(!tr) return;
            if(target.classList.contains('js-hw-del')){ if(tr && tr.parentNode){ tr.parentNode.removeChild(tr); } try{ hwClampPage(); }catch(_){ } updateEmptyState(); return; }
            if(target.classList.contains('js-hw-edit') || (target.classList.contains('js-hw-toggle') && target.getAttribute('data-action')==='edit')){
              function toInput(name){ var td=tr.querySelector('[data-col="'+name+'"]'); if(!td) return; var current=(td.textContent||'').trim(); if(name==='category'){ td.innerHTML = buildCategorySelect(current==='-'?'':current); return; } if(name==='type'){ var catText = (tr.querySelector('[data-col="category"]').textContent||'').trim(); td.innerHTML = buildTypeSelect(catText==='-'?'':catText, current==='-'?'':current); return; } if(name==='qty'){ var val=(current==='-'? '1' : String(current).replace(/\D/g,'')); td.innerHTML = '<input type="number" min="1" step="1" value="'+(val||'1')+'">'; return; } td.innerHTML = '<input type="text" value="'+(current==='-'?'':current)+'" placeholder="">'; }
              ['category','model','type','qty','remark'].forEach(toInput); wireTypeDependency(tr);
              var toggleBtn = tr.querySelector('.js-hw-toggle'); if(toggleBtn){ toggleBtn.setAttribute('data-action','save'); toggleBtn.title='저장'; toggleBtn.setAttribute('aria-label','저장'); toggleBtn.innerHTML='<img src="/static/image/svg/save.svg" alt="저장" class="action-icon">'; } else { var actions = tr.querySelector('.table-actions'); if(actions){ actions.classList.add('system-actions'); actions.innerHTML = '<button class="action-btn js-hw-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button> <button class="action-btn danger js-hw-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'; } }
              return;
            }
            if(target.classList.contains('js-hw-commit') || (target.classList.contains('js-hw-toggle') && target.getAttribute('data-action')==='save')){
              function getInput(name){ var td=tr.querySelector('[data-col="'+name+'"]'); return td? td.querySelector('input, select'): null; }
              function setError(el,on){ if(!el) return; if(on){ el.classList.add('input-error'); el.setAttribute('aria-invalid','true'); } else { el.classList.remove('input-error'); el.removeAttribute('aria-invalid'); } }
              var firstInvalid=null;
              var modelInp = getInput('model'); var modelVal = (modelInp? modelInp.value : (tr.querySelector('[data-col="model"]').textContent||'')).trim(); if(!modelVal){ setError(modelInp,true); if(!firstInvalid) firstInvalid=modelInp; } else { setError(modelInp,false); }
              var catSel = getInput('category'); var catVal = (catSel? catSel.value : (tr.querySelector('[data-col="category"]').textContent||'')).trim(); if(!catVal){ setError(catSel,true); if(!firstInvalid) firstInvalid=catSel; } else { setError(catSel,false); }
              var typeSel = getInput('type'); var typeVal = (typeSel? typeSel.value : (tr.querySelector('[data-col="type"]').textContent||'')).trim(); if(!typeVal){ setError(typeSel,true); if(!firstInvalid) firstInvalid=typeSel; } else { setError(typeSel,false); }
              var qtyInp = getInput('qty'); var qtyRaw = (qtyInp? qtyInp.value : (tr.querySelector('[data-col="qty"]').textContent||'')).trim(); var qtyNum = parseInt(qtyRaw,10); if(isNaN(qtyNum) || qtyNum < 1){ setError(qtyInp,true); if(!firstInvalid) firstInvalid=qtyInp; } else { setError(qtyInp,false); }
              if(firstInvalid){ try{ firstInvalid.focus(); }catch(_){ } return; }
              function commit(name,val){ var td=tr.querySelector('[data-col="'+name+'"]'); if(!td) return; var text=(val===''||val==null)? '-' : String(val); td.textContent = text; }
              function read(name){ var el=getInput(name); var v=(el? el.value : (tr.querySelector('[data-col="'+name+'"]').textContent||'')); return String(v).trim(); }
              commit('category', catVal);
              commit('model', modelVal);
              commit('type', typeVal);
              commit('qty', qtyNum);
              commit('remark', read('remark'));
              var toggleBtn = tr.querySelector('.js-hw-toggle'); if(toggleBtn){ toggleBtn.setAttribute('data-action','edit'); toggleBtn.title='편집'; toggleBtn.setAttribute('aria-label','편집'); toggleBtn.innerHTML='<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon">'; }
              updateEmptyState();
              // preserve selection state
              var cb = tr.querySelector('.hw-row-check'); if(cb){ var hidden = tr.hasAttribute('data-hidden') || tr.style.display==='none'; tr.classList.toggle('selected', !!cb.checked && !hidden); }
              return;
            }
          });

          // CSV helpers for vendor HW
          function hwEscapeCSV(val){ return '"' + String(val).replace(/"/g,'""') + '"'; }
          function hwRowSaved(tr){ var t=tr.querySelector('.js-hw-toggle'); var inEdit=t && t.getAttribute('data-action')==='save'; if(inEdit) return false; return !tr.querySelector('td[data-col] input, td[data-col] select, td[data-col] textarea'); }
          function hwVisibleRows(){ var tbody=table.querySelector('tbody'); if(!tbody) return []; return Array.from(tbody.querySelectorAll('tr')).filter(function(tr){ return !(tr.hasAttribute('data-hidden') || tr.style.display==='none'); }); }
          function hwSavedVisibleRows(){ return hwVisibleRows().filter(hwRowSaved); }
          function hwExportCSV(onlySelected){ var tbody=table.querySelector('tbody'); if(!tbody) return; var headers=['구분','모델명','유형','수량','비고']; var trs=hwSavedVisibleRows(); if(onlySelected){ trs = trs.filter(function(tr){ var cb=tr.querySelector('.hw-row-check'); return cb && cb.checked; }); } if(trs.length===0) return; function text(tr,col){ var td=tr.querySelector('[data-col="'+col+'"]'); return td? (td.textContent||'').trim() : ''; } var cols=['category','model','type','qty','remark']; var rows = trs.map(function(tr){ return cols.map(function(c){ return text(tr,c); }); }); var lines = [headers].concat(rows).map(function(arr){ return arr.map(hwEscapeCSV).join(','); }); var csv='\uFEFF'+lines.join('\r\n'); var d=new Date(); var yyyy=d.getFullYear(); var mm=String(d.getMonth()+1).padStart(2,'0'); var dd=String(d.getDate()).padStart(2,'0'); var filename='vendor_hardware_'+yyyy+mm+dd+'.csv'; try{ var blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); var url=URL.createObjectURL(blob); var a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); } catch(_){ var a2=document.createElement('a'); a2.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a2.download=filename; document.body.appendChild(a2); a2.click(); document.body.removeChild(a2); } }
          (function(){ var btn = document.getElementById('hw-download-btn'); var modalId='hw-download-modal'; var closeBtn=document.getElementById('hw-download-close'); var confirmBtn=document.getElementById('hw-download-confirm'); function openModalLocal(id){ var el=document.getElementById(id); if(!el) return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden','false'); } function closeModalLocal(id){ var el=document.getElementById(id); if(!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } } if(btn){ btn.addEventListener('click', function(){ if(btn.disabled) return; var saved=hwSavedVisibleRows(); var total=saved.length; if(total<=0) return; var selectedCount = saved.filter(function(tr){ var cb=tr.querySelector('.hw-row-check'); return cb && cb.checked; }).length; var subtitle=document.getElementById('hw-download-subtitle'); if(subtitle){ subtitle.textContent = selectedCount>0 ? ('선택된 '+selectedCount+'개 또는 전체 '+total+'개 결과 중 범위를 선택하세요.') : ('현재 결과 '+total+'개 항목을 CSV로 내보냅니다.'); } var rowSelectedWrap=document.getElementById('hw-csv-range-row-selected'); var optSelected=document.getElementById('hw-csv-range-selected'); var optAll=document.getElementById('hw-csv-range-all'); if(rowSelectedWrap) rowSelectedWrap.hidden = !(selectedCount>0); if(optSelected){ optSelected.disabled = !(selectedCount>0); optSelected.checked = selectedCount>0; } if(optAll){ optAll.checked = !(selectedCount>0); } openModalLocal(modalId); }); } if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalLocal(modalId); }); } var modalEl=document.getElementById(modalId); if(modalEl){ modalEl.addEventListener('click', function(e){ if(e.target===modalEl) closeModalLocal(modalId); }); document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(modalId); }); } if(confirmBtn){ confirmBtn.addEventListener('click', function(){ var onlySel = !!(document.getElementById('hw-csv-range-selected') && document.getElementById('hw-csv-range-selected').checked); hwExportCSV(onlySel); closeModalLocal(modalId); }); } })();

          return; // handled vendor hardware, stop here
        }
        // Vendor Components schema: guard strictly by data-context
        (function(){
          var ctx=(table.getAttribute('data-context')||'').toLowerCase();
          var isVendorCo = (ctx==='vendor-co');
          if(!isVendorCo) return;

          var empty = document.getElementById('hw-empty');
          var infoEl = document.getElementById('hw-pagination-info');
          var numWrap = document.getElementById('hw-page-numbers');
          var btnFirst = document.getElementById('hw-first');
          var btnPrev = document.getElementById('hw-prev');
          var btnNext = document.getElementById('hw-next');
          var btnLast = document.getElementById('hw-last');
          var selectAll = document.getElementById('hw-select-all');

          var CAT_OPTIONS = ['CPU','GPU','MEMORY','DISK','NIC','HBA','ETC'];

          // Pagination
          var coState = { page:1, pageSize:10 };
          (function initPageSize(){ try{ var saved=localStorage.getItem('vendor:co:pageSize'); var sel=document.getElementById('hw-page-size'); if(sel){ if(saved && ['10','20','50','100'].indexOf(saved)>-1){ coState.pageSize=parseInt(saved,10); sel.value=saved; } sel.addEventListener('change', function(){ var v=parseInt(sel.value,10); if(!isNaN(v)){ coState.page=1; coState.pageSize=v; localStorage.setItem('vendor:co:pageSize', String(v)); coRenderPage(); } }); } }catch(_){ } })();
          function coRows(){ var tbody=table.querySelector('tbody'); return tbody? Array.from(tbody.querySelectorAll('tr')): []; }
          function coTotal(){ return coRows().length; }
          function coPages(){ var total=coTotal(); return Math.max(1, Math.ceil(total / Math.max(1, coState.pageSize))); }
          function coClampPage(){ var pages=coPages(); if(coState.page>pages) coState.page=pages; if(coState.page<1) coState.page=1; }
          function coUpdateUI(){ if(infoEl){ var total=coTotal(); var start= total? (coState.page-1)*coState.pageSize+1 : 0; var end=Math.min(total, coState.page*coState.pageSize); infoEl.textContent = start + '-' + end + ' / ' + total + '개 항목'; } if(numWrap){ var pages=coPages(); numWrap.innerHTML=''; for(var p=1;p<=pages && p<=50;p++){ var b=document.createElement('button'); b.className='page-btn'+(p===coState.page?' active':''); b.textContent=String(p); b.dataset.page=String(p); numWrap.appendChild(b); } } var pages2=coPages(); if(btnFirst) btnFirst.disabled=(coState.page===1); if(btnPrev) btnPrev.disabled=(coState.page===1); if(btnNext) btnNext.disabled=(coState.page===pages2); if(btnLast) btnLast.disabled=(coState.page===pages2); var sizeSel=document.getElementById('hw-page-size'); if(sizeSel){ var none=(coTotal()===0); sizeSel.disabled=none; if(none){ try{ sizeSel.value='10'; coState.pageSize=10; }catch(_){ } } } }
          function coRenderPage(){ coClampPage(); var rows=coRows(); var startIdx=(coState.page-1)*coState.pageSize; var endIdx=startIdx + coState.pageSize - 1; rows.forEach(function(tr,idx){ var visible=idx>=startIdx && idx<=endIdx; tr.style.display = visible? '' : 'none'; if(visible){ tr.removeAttribute('data-hidden'); } else { tr.setAttribute('data-hidden','1'); } var cb=tr.querySelector('.hw-row-check'); if(cb){ tr.classList.toggle('selected', !!cb.checked && visible); } }); coUpdateUI(); if(selectAll){ var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check'); if(visChecks.length){ selectAll.checked = Array.prototype.every.call(visChecks, function(c){ return c.checked; }); } else { selectAll.checked=false; } } }
          function coGo(p){ coState.page=p; coRenderPage(); }
          function coGoDelta(d){ coGo(coState.page + d); }
          if(numWrap){ numWrap.addEventListener('click', function(e){ var b=e.target.closest('button.page-btn'); if(!b) return; var p=parseInt(b.dataset.page,10); if(!isNaN(p)) coGo(p); }); }
          if(btnFirst) btnFirst.addEventListener('click', function(){ coGo(1); });
          if(btnPrev) btnPrev.addEventListener('click', function(){ coGoDelta(-1); });
          if(btnNext) btnNext.addEventListener('click', function(){ coGoDelta(1); });
          if(btnLast) btnLast.addEventListener('click', function(){ coGo(coPages()); });
          // Persist total quantity across all saved rows in this tab
          function coPersistQtySum(){
            try{
              var tbody = table.querySelector('tbody');
              var trs = tbody? Array.from(tbody.querySelectorAll('tr')): [];
              var sum = 0;
              trs.forEach(function(tr){
                var editing = tr.querySelector('td[data-col] input, td[data-col] select, td[data-col] textarea');
                if(editing) return;
                var td = tr.querySelector('[data-col="qty"]');
                var raw = td? (td.textContent||'').trim() : '';
                var n = parseInt(String(raw).replace(/[^0-9-]/g,''),10);
                if(!isNaN(n) && isFinite(n)) sum += n;
              });
              try{ localStorage.setItem('vendor:co:sumQty', String(sum)); }catch(_){ }
            }catch(_){ }
          }
          function updateEmptyState(){ try{ var has = !!table.querySelector('tbody tr'); if(empty){ empty.hidden = has; empty.style.display = has ? 'none' : ''; } }catch(_){ if(empty){ empty.hidden=false; empty.style.display=''; } } var csvBtn=document.getElementById('hw-download-btn'); if(csvBtn){ var hasRows = !!table.querySelector('tbody tr'); csvBtn.disabled=!hasRows; csvBtn.setAttribute('aria-disabled', (!hasRows).toString()); csvBtn.title = hasRows? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.'; } coRenderPage(); try{ coPersistQtySum(); }catch(_){ } }
          updateEmptyState();

          // Select-all only visible rows
          if(selectAll){ selectAll.addEventListener('change', function(){ var checks=table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check:not([disabled])'); checks.forEach(function(c){ c.checked = !!selectAll.checked; var tr=c.closest('tr'); if(tr){ tr.classList.toggle('selected', !!c.checked); } }); }); }
          // Row click toggles selection
          table.addEventListener('click', function(ev){ var onCtrl = ev.target.closest('button, a, input, select, textarea, label'); var onCb = ev.target.closest('input[type="checkbox"].hw-row-check'); if(onCb){ var tr=onCb.closest('tr'); if(tr){ var hidden=tr.hasAttribute('data-hidden') || tr.style.display==='none'; tr.classList.toggle('selected', !!onCb.checked && !hidden); } if(selectAll){ var vis=table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check'); if(vis.length){ selectAll.checked = Array.prototype.every.call(vis, function(c){ return c.checked; }); } else { selectAll.checked=false; } } return; } if(!onCtrl){ var tr=ev.target.closest('tr'); if(!tr) return; if(tr.hasAttribute('data-hidden') || tr.style.display==='none') return; var cb=tr.querySelector('.hw-row-check'); if(!cb) return; cb.checked=!cb.checked; tr.classList.toggle('selected', !!cb.checked); if(selectAll){ var vis=table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check'); if(vis.length){ selectAll.checked = Array.prototype.every.call(vis, function(c){ return c.checked; }); } else { selectAll.checked=false; } } } });

          function buildCategorySelect(current){ var opts=['<option value=""'+(current?'':' selected')+' disabled>선택</option>'].concat(CAT_OPTIONS.map(function(o){ return '<option value="'+o+'"'+(o===current?' selected':'')+'>'+o+'</option>'; })).join(''); return '<select>'+opts+'</select>'; }

          // Add row
          var addBtn = document.getElementById('hw-row-add');
          if(addBtn){ addBtn.addEventListener('click', function(){ var tbody=table.querySelector('tbody'); if(!tbody) return; var tr=document.createElement('tr'); tr.innerHTML = `
              <td><input type="checkbox" class="hw-row-check" aria-label="행 선택"></td>
              <td data-col="category">${buildCategorySelect('')}</td>
              <td data-col="model"><input type="text" placeholder="모델명 (필수)"></td>
              <td data-col="type"><input type="text" placeholder="유형"></td>
              <td data-col="qty"><input type="number" min="1" step="1" value="1" placeholder="1"></td>
              <td data-col="remark"><input type="text" placeholder="비고"></td>
              <td class="system-actions table-actions">
                <button class="action-btn js-co-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button>
                <button class="action-btn danger js-co-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>
              </td>`; tbody.appendChild(tr); try{ coGo(coPages()); }catch(_){ } updateEmptyState(); }); }

          // Delegate actions (edit/save/delete)
          table.addEventListener('click', function(ev){
            var target = ev.target.closest('.js-co-del, .js-co-edit, .js-co-toggle'); if(!target) return; var tr = ev.target.closest('tr'); if(!tr) return;
            if(target.classList.contains('js-co-del')){ if(tr && tr.parentNode){ tr.parentNode.removeChild(tr); } try{ coClampPage(); }catch(_){ } updateEmptyState(); return; }
            if(target.classList.contains('js-co-edit') || (target.classList.contains('js-co-toggle') && target.getAttribute('data-action')==='edit')){
              function toInput(name){ var td=tr.querySelector('[data-col="'+name+'"]'); if(!td) return; var current=(td.textContent||'').trim(); if(name==='category'){ td.innerHTML = buildCategorySelect(current==='-'?'':current); return; } if(name==='qty'){ var val=(current==='-'? '1' : String(current).replace(/\D/g,'')); td.innerHTML = '<input type="number" min="1" step="1" value="'+(val||'1')+'">'; return; } td.innerHTML = '<input type="text" value="'+(current==='-'?'':current)+'" placeholder="">'; }
              ['category','model','type','qty','remark'].forEach(toInput);
              var toggleBtn = tr.querySelector('.js-co-toggle'); if(toggleBtn){ toggleBtn.setAttribute('data-action','save'); toggleBtn.title='저장'; toggleBtn.setAttribute('aria-label','저장'); toggleBtn.innerHTML='<img src="/static/image/svg/save.svg" alt="저장" class="action-icon">'; } else { var actions = tr.querySelector('.table-actions'); if(actions){ actions.classList.add('system-actions'); actions.innerHTML = '<button class="action-btn js-co-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button> <button class="action-btn danger js-co-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'; } }
              return;
            }
            if(target.classList.contains('js-co-toggle') && target.getAttribute('data-action')==='save'){
              function getInput(name){ var td=tr.querySelector('[data-col="'+name+'"]'); return td? td.querySelector('input, select'): null; }
              function setError(el,on){ if(!el) return; if(on){ el.classList.add('input-error'); el.setAttribute('aria-invalid','true'); } else { el.classList.remove('input-error'); el.removeAttribute('aria-invalid'); } }
              var firstInvalid=null;
              var modelInp = getInput('model'); var modelVal = (modelInp? modelInp.value : (tr.querySelector('[data-col="model"]').textContent||'')).trim(); if(!modelVal){ setError(modelInp,true); if(!firstInvalid) firstInvalid=modelInp; } else { setError(modelInp,false); }
              var catSel = getInput('category'); var catVal = (catSel? catSel.value : (tr.querySelector('[data-col="category"]').textContent||'')).trim(); if(!catVal){ setError(catSel,true); if(!firstInvalid) firstInvalid=catSel; } else { setError(catSel,false); }
              var qtyInp = getInput('qty'); var qtyRaw = (qtyInp? qtyInp.value : (tr.querySelector('[data-col="qty"]').textContent||'')).trim(); var qtyNum = parseInt(qtyRaw,10); if(isNaN(qtyNum) || qtyNum < 1){ setError(qtyInp,true); if(!firstInvalid) firstInvalid=qtyInp; } else { setError(qtyInp,false); }
              if(firstInvalid){ try{ firstInvalid.focus(); }catch(_){ } return; }
              function commit(name,val){ var td=tr.querySelector('[data-col="'+name+'"]'); if(!td) return; var text=(val===''||val==null)? '-' : String(val); td.textContent = text; }
              function read(name){ var el=getInput(name); var v=(el? el.value : (tr.querySelector('[data-col="'+name+'"]').textContent||'')); return String(v).trim(); }
              commit('category', catVal);
              commit('model', modelVal);
              commit('type', read('type'));
              commit('qty', qtyNum);
              commit('remark', read('remark'));
              var toggleBtn = tr.querySelector('.js-co-toggle'); if(toggleBtn){ toggleBtn.setAttribute('data-action','edit'); toggleBtn.title='편집'; toggleBtn.setAttribute('aria-label','편집'); toggleBtn.innerHTML='<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon">'; }
              updateEmptyState();
              var cb = tr.querySelector('.hw-row-check'); if(cb){ var hidden = tr.hasAttribute('data-hidden') || tr.style.display==='none'; tr.classList.toggle('selected', !!cb.checked && !hidden); }
              return;
            }
          });

          // CSV helpers for vendor CO
          function coEscapeCSV(val){ return '"' + String(val).replace(/"/g,'""') + '"'; }
          function coRowSaved(tr){ var t=tr.querySelector('.js-co-toggle'); var inEdit=t && t.getAttribute('data-action')==='save'; if(inEdit) return false; return !tr.querySelector('td[data-col] input, td[data-col] select, td[data-col] textarea'); }
          function coVisibleRows(){ var tbody=table.querySelector('tbody'); if(!tbody) return []; return Array.from(tbody.querySelectorAll('tr')).filter(function(tr){ return !(tr.hasAttribute('data-hidden') || tr.style.display==='none'); }); }
          function coSavedVisibleRows(){ return coVisibleRows().filter(coRowSaved); }
          function coExportCSV(onlySelected){ var tbody=table.querySelector('tbody'); if(!tbody) return; var headers=['구분','모델명','유형','수량','비고']; var trs=coSavedVisibleRows(); if(onlySelected){ trs = trs.filter(function(tr){ var cb=tr.querySelector('.hw-row-check'); return cb && cb.checked; }); } if(trs.length===0) return; function text(tr,col){ var td=tr.querySelector('[data-col="'+col+'"]'); return td? (td.textContent||'').trim() : ''; } var cols=['category','model','type','qty','remark']; var rows = trs.map(function(tr){ return cols.map(function(c){ return text(tr,c); }); }); var lines = [headers].concat(rows).map(function(arr){ return arr.map(coEscapeCSV).join(','); }); var csv='\uFEFF'+lines.join('\r\n'); var d=new Date(); var yyyy=d.getFullYear(); var mm=String(d.getMonth()+1).padStart(2,'0'); var dd=String(d.getDate()).padStart(2,'0'); var filename='vendor_component_'+yyyy+mm+dd+'.csv'; try{ var blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); var url=URL.createObjectURL(blob); var a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); } catch(_){ var a2=document.createElement('a'); a2.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a2.download=filename; document.body.appendChild(a2); a2.click(); document.body.removeChild(a2); } }
          (function(){ var btn = document.getElementById('hw-download-btn'); var modalId='hw-download-modal'; var closeBtn=document.getElementById('hw-download-close'); var confirmBtn=document.getElementById('hw-download-confirm'); function openModalLocal(id){ var el=document.getElementById(id); if(!el) return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden','false'); } function closeModalLocal(id){ var el=document.getElementById(id); if(!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } } if(btn){ btn.addEventListener('click', function(){ if(btn.disabled) return; var saved=coSavedVisibleRows(); var total=saved.length; if(total<=0) return; var selectedCount = saved.filter(function(tr){ var cb=tr.querySelector('.hw-row-check'); return cb && cb.checked; }).length; var subtitle=document.getElementById('hw-download-subtitle'); if(subtitle){ subtitle.textContent = selectedCount>0 ? ('선택된 '+selectedCount+'개 또는 전체 '+total+'개 결과 중 범위를 선택하세요.') : ('현재 결과 '+total+'개 항목을 CSV로 내보냅니다.'); } var rowSelectedWrap=document.getElementById('hw-csv-range-row-selected'); var optSelected=document.getElementById('hw-csv-range-selected'); var optAll=document.getElementById('hw-csv-range-all'); if(rowSelectedWrap) rowSelectedWrap.hidden = !(selectedCount>0); if(optSelected){ optSelected.disabled = !(selectedCount>0); optSelected.checked = selectedCount>0; } if(optAll){ optAll.checked = !(selectedCount>0); } openModalLocal(modalId); }); } if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalLocal(modalId); }); } var modalEl=document.getElementById(modalId); if(modalEl){ modalEl.addEventListener('click', function(e){ if(e.target===modalEl) closeModalLocal(modalId); }); document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(modalId); }); } if(confirmBtn){ confirmBtn.addEventListener('click', function(){ var onlySel = !!(document.getElementById('hw-csv-range-selected') && document.getElementById('hw-csv-range-selected').checked); coExportCSV(onlySel); closeModalLocal(modalId); }); } })();

          return; // handled vendor components, stop here
        })();
        // Detect new "시스템 할당정보" schema by presence of work_status column or header text
        var isAllocationSchema = !!table.querySelector('[data-col="work_status"]');
        if(!isAllocationSchema){
          try{
            var ths = table.querySelectorAll('thead th');
            isAllocationSchema = Array.prototype.some.call(ths, function(th){ return (th.textContent||'').trim()==='업무 상태'; });
          }catch(_){ isAllocationSchema = false; }
        }
        if(isAllocationSchema){
          var empty = document.getElementById('hw-empty');
          var infoEl = document.getElementById('hw-pagination-info');
          var numWrap = document.getElementById('hw-page-numbers');
          var btnFirst = document.getElementById('hw-first');
          var btnPrev = document.getElementById('hw-prev');
          var btnNext = document.getElementById('hw-next');
          var btnLast = document.getElementById('hw-last');

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

          // Pagination state and helpers
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
            // Format visible saved rows' work_status cell to pill style like list page
            try{
              var visSaved = hwSavedVisibleRows();
              visSaved.forEach(function(tr){
                var td = tr.querySelector('[data-col="work_status"]');
                if(!td) return;
                var current = (td.textContent||'').trim();
                var cls = (current==='가동') ? 'ws-run' : (current==='유휴' ? 'ws-idle' : 'ws-wait');
                td.innerHTML = '<span class="status-pill"><span class="status-dot '+cls+'" aria-hidden="true"></span><span class="status-text">'+current+'</span></span>';
              });
            }catch(_){ }
            // Update assigned license sum whenever page visibility changes
            try{ hwComputeAssignedSum(); }catch(_){ }
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

          // Add new row
          var addBtn = document.getElementById('hw-row-add');
          if(addBtn){
            addBtn.addEventListener('click', function(){
              var tbody = table.querySelector('tbody');
              var tr = document.createElement('tr');
              var statusOptions = ['', '가동','유휴','대기'];
              // Determine which detail column to use (assigned_qty preferred)
              var headerTexts = Array.prototype.map.call(table.querySelectorAll('thead th'), function(th){ return (th.textContent||'').trim(); });
              var detailCol = 'assigned_qty';
              if(headerTexts.indexOf('할당 수량')>-1 || table.querySelector('[data-col="assigned_qty"]')){
                detailCol = 'assigned_qty';
              } else if(headerTexts.indexOf('소프트웨어 상세버전')>-1 || table.querySelector('[data-col="software_detail_version"]')){
                detailCol = 'software_detail_version';
              } else if(table.querySelector('[data-col="license_quantity"]')){
                detailCol = 'license_quantity';
              }
              tr.innerHTML = `
                <td><input type="checkbox" class="hw-row-check" aria-label="행 선택"></td>
                <td data-col="work_status">
                  <select>
                    ${statusOptions.map(function(o){ var label=o||'선택'; return '<option value="'+o+'"'+(o===''?' selected':'')+'>'+label+'</option>'; }).join('')}
                  </select>
                </td>
                <td data-col="work_group"><input type="text" placeholder="업무 그룹"></td>
                <td data-col="work_name"><input type="text" placeholder="업무 이름"></td>
                <td data-col="system_name"><input type="text" placeholder="시스템 이름"></td>
                <td data-col="system_ip"><input type="text" placeholder="시스템 IP"></td>
                ${detailCol==='software_detail_version' ? '<td data-col="software_detail_version"><input type="text" placeholder="소프트웨어 상세버전"></td>' : (detailCol==='assigned_qty' ? '<td data-col="assigned_qty"><input type="number" min="0" step="1" placeholder="0"></td>' : '<td data-col="license_quantity"><input type="number" min="0" step="1" placeholder="0"></td>')}
                <td data-col="remark"><input type="text" placeholder="비고"></td>
                <td class="system-actions table-actions">
                  <button class="action-btn js-hw-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button>
                  <button class="action-btn danger js-hw-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>
                </td>`;
              tbody.appendChild(tr);
              try{ hwGoLast(); }catch(_){ }
              updateEmptyState();
            });
          }

          // delegate edit/delete/toggle save
          table.addEventListener('click', function(ev){
            var target = ev.target.closest('.js-hw-del, .js-hw-toggle'); if(!target) return;
            var tr = ev.target.closest('tr'); if(!tr) return;
            if(target.classList.contains('js-hw-del')){
              tr.parentNode.removeChild(tr);
              try{ hwClampPage(); }catch(_){ }
              updateEmptyState();
              return;
            }
            // Toggle: edit -> save
            if(target.classList.contains('js-hw-toggle') && target.getAttribute('data-action') === 'edit'){
              var versionCol = table.querySelector('tbody tr [data-col="assigned_qty"]') ? 'assigned_qty' : (table.querySelector('tbody tr [data-col="software_detail_version"]') ? 'software_detail_version' : 'license_quantity');
              function toInput(name){
                var td = tr.querySelector('[data-col="'+name+'"]'); if(!td) return;
                var current = (td.textContent||'').trim();
                if(name==='work_status'){
                  var opts=['','가동','유휴','대기'];
                  var options = opts.map(function(o){ var label=o||'선택'; return '<option value="'+o+'"'+(o===current?' selected':'')+'>'+label+'</option>'; }).join('');
                  td.innerHTML = '<select>'+options+'</select>';
                  return;
                }
                if(name==='license_quantity'){
                  td.innerHTML = '<input type="number" min="0" step="1" value="'+current.replace(/[^0-9]/g,'')+'" placeholder="0">';
                  return;
                }
                if(name==='assigned_qty'){
                  td.innerHTML = '<input type="number" min="0" step="1" value="'+current.replace(/[^0-9]/g,'')+'" placeholder="0">';
                  return;
                }
                if(name==='software_detail_version'){
                  td.innerHTML = '<input type="text" value="'+current+'" placeholder="소프트웨어 상세버전">';
                  return;
                }
                td.innerHTML = '<input type="text" value="'+current+'" placeholder="">';
              }
              ['work_status','work_group','work_name','system_name','system_ip',versionCol,'remark'].forEach(toInput);
              var toggleBtn = tr.querySelector('.js-hw-toggle');
              if(toggleBtn){ toggleBtn.setAttribute('data-action','save'); toggleBtn.title='저장'; toggleBtn.setAttribute('aria-label','저장'); toggleBtn.innerHTML='<img src="/static/image/svg/save.svg" alt="저장" class="action-icon">'; }
              return;
            }
            // Toggle: save -> view
            if(target.classList.contains('js-hw-toggle') && target.getAttribute('data-action') === 'save'){
              var versionCol2 = table.querySelector('tbody tr [data-col="assigned_qty"]') ? 'assigned_qty' : (table.querySelector('tbody tr [data-col="software_detail_version"]') ? 'software_detail_version' : 'license_quantity');
              function getInput(name){ var td=tr.querySelector('[data-col="'+name+'"]'); if(!td) return null; return td.querySelector('input, select, textarea'); }
              function commit(name, val){
                var td=tr.querySelector('[data-col="'+name+'"]'); if(!td) return;
                var text = (val === '' || val==null)? '-' : String(val);
                // For numeric fields, normalize to integer string
                if(name==='assigned_qty' || name==='license_quantity'){
                  var num = parseInt(val, 10); text = isNaN(num) ? '-' : String(num);
                }
                td.textContent = text;
              }
              function read(name){
                var el = getInput(name);
                var v = el? el.value : (tr.querySelector('[data-col="'+name+'"]').textContent||'');
                return String(v).trim();
              }
              ['work_status','work_group','work_name','system_name','system_ip',versionCol2,'remark'].forEach(function(n){ commit(n, read(n)); });
              var toggleBtn = tr.querySelector('.js-hw-toggle');
              if(toggleBtn){
                toggleBtn.setAttribute('data-action','edit');
                toggleBtn.title='편집'; toggleBtn.setAttribute('aria-label','편집');
                toggleBtn.innerHTML='<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon">';
              }
              updateEmptyState();
              var cb = tr.querySelector('.hw-row-check');
              if(cb){ var hidden = tr.hasAttribute('data-hidden') || tr.style.display==='none'; tr.classList.toggle('selected', !!cb.checked && !hidden); }
              return;
            }
          });

          // Row click toggling and checkbox syncing for visible rows
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

          // CSV export for allocation schema
          function hwEscapeCSV(val){ return '"' + String(val).replace(/"/g,'""') + '"'; }
          function hwRowSaved(tr){ var t=tr.querySelector('.js-hw-toggle'); var inEdit=t && t.getAttribute('data-action')==='save'; if(inEdit) return false; return !tr.querySelector('td[data-col] input, td[data-col] select, td[data-col] textarea'); }
          function hwVisibleRows(){ var tbody=table.querySelector('tbody'); if(!tbody) return []; return Array.from(tbody.querySelectorAll('tr')).filter(function(tr){ return !(tr.hasAttribute('data-hidden') || tr.style.display==='none'); }); }
          function hwSavedVisibleRows(){ return hwVisibleRows().filter(hwRowSaved); }
          function hwExportCSV(onlySelected){
            var tbody = table.querySelector('tbody'); if(!tbody) return;
            var useDetailCol = table.querySelector('tbody tr [data-col="assigned_qty"]') ? 'assigned_qty' : (table.querySelector('tbody tr [data-col="software_detail_version"]') ? 'software_detail_version' : 'license_quantity');
            var headers = ['업무 상태','업무 그룹','업무 이름','시스템 이름','시스템 IP', (useDetailCol==='assigned_qty' ? '할당수량' : (useDetailCol==='software_detail_version' ? '소프트웨어 상세버전' : '라이선스 수량')), '비고'];
            var trs = hwSavedVisibleRows();
            if(onlySelected){ trs = trs.filter(function(tr){ var cb = tr.querySelector('.hw-row-check'); return cb && cb.checked; }); }
            if(trs.length===0) return;
            function text(tr, col){ var td=tr.querySelector('[data-col="'+col+'"]'); return td? (td.textContent||'').trim() : ''; }
            var baseCols = ['work_status','work_group','work_name','system_name','system_ip',useDetailCol,'remark'];
            var rows = trs.map(function(tr){ return baseCols.map(function(c){ return text(tr,c); }); });
            var lines = [headers].concat(rows).map(function(arr){ return arr.map(hwEscapeCSV).join(','); });
            var csv = '\uFEFF' + lines.join('\r\n'); var d=new Date(); var yyyy=d.getFullYear(); var mm=String(d.getMonth()+1).padStart(2,'0'); var dd=String(d.getDate()).padStart(2,'0');
            var filename = 'system_allocation_'+yyyy+mm+dd+'.csv';
            try{ var blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); var url=URL.createObjectURL(blob); var a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); }
            catch(_){ var a2=document.createElement('a'); a2.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a2.download=filename; document.body.appendChild(a2); a2.click(); document.body.removeChild(a2); }
          }
          // Compute and persist assigned license sum from saved, visible rows
          function hwComputeAssignedSum(){
            try{
              var trs = hwSavedVisibleRows();
              var sum = 0;
              trs.forEach(function(tr){
                var td = tr.querySelector('[data-col="assigned_qty"]') || tr.querySelector('[data-col="license_quantity"]');
                if(!td) return;
                var raw = (td.textContent||'').trim();
                var n = parseInt(raw.replace(/[^0-9\-]/g,''), 10);
                if(!isNaN(n) && isFinite(n)) sum += n;
              });
              try{ localStorage.setItem('unix:licAssignedSum', String(sum)); }catch(_){ }
              // Reflect immediately on Basic Info if present on the same page
              var assignedEl = document.getElementById('bi-lic_assigned');
              if(assignedEl){ assignedEl.textContent = String(sum); }
              var totalEl = document.getElementById('bi-lic_total');
              var idleEl = document.getElementById('bi-lic_idle');
              if(totalEl && idleEl){
                var t = parseInt(((totalEl.textContent||'').replace(/[^0-9\-]/g,'')), 10);
                if(isNaN(t) || !isFinite(t)) t = 0;
                var idle = t - sum;
                idleEl.textContent = String(idle);
                try{ updateIdleDot(idle); }catch(_){ }
              }
            }catch(_){ }
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
          return; // Skip legacy hardware logic on allocation schema
        }
        // ---- Legacy hardware logic (unchanged) ----
        var empty = document.getElementById('hw-empty');
        var infoEl = document.getElementById('hw-pagination-info');
        var numWrap = document.getElementById('hw-page-numbers');
        var btnFirst = document.getElementById('hw-first');
        var btnPrev = document.getElementById('hw-prev');
        var btnNext = document.getElementById('hw-next');
    var btnLast = document.getElementById('hw-last');
    // Context and column toggles
              // [Authority section removed]
              // ---------- File attachments (tab15-file) ----------
        var pathName = ((typeof location!=='undefined' && location && location.pathname) || '').toLowerCase();
        var isFrontBay = tableContext === 'frontbay' || /tab21-frontbay\.html$/.test(pathName);
        var isRearBay  = tableContext === 'rearbay'  || /tab22-rearbay\.html$/.test(pathName);
        var typeOptions = (function(){
          if(isFrontBay) return ['서버','스토리지'];
          if(isRearBay)  return ['SAN','네트워크'];
          return ['서버','스토리지','SAN','네트워크','기타'];
        })();
    var hasSpecCol = (isFrontBay || isRearBay) || !!table.querySelector('[data-col="spec"]');
    // Detect schema: inventory-style (qty column) vs bay-style (space/serial columns)
    var isInventorySchema = !!table.querySelector('[data-col="qty"]') && !table.querySelector('[data-col="space"]');
        var bayCount = isRearBay ? 8 : 16;
  
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
          var info = { type:'시스템', space:'-', model:'-', serial:'-', vendor:'-', fw:'-', remark:'-' };
          try{
            // Prefer cached values from Basic Info save
            var cachedModel = localStorage.getItem('vtl:current:model');
            var cachedVendor = localStorage.getItem('vtl:current:vendor');
            var cachedSerial = localStorage.getItem('vtl:current:serial');
            if(cachedModel) info.model = cachedModel;
            if(cachedVendor) info.vendor = cachedVendor;
            if(cachedSerial) info.serial = cachedSerial;
          }catch(_){ }
          // Fallback to DOM if cache missing
          if(info.model === '-' || info.vendor === '-' || info.serial === '-'){
            try{
              var baseSel = '.basic-info-grid .basic-info-card:nth-child(2) .basic-info-card-content';
              var vendorEl = document.querySelector(baseSel+' .info-row:nth-child(1) .toggle-badge');
              var modelEl  = document.querySelector(baseSel+' .info-row:nth-child(2) .toggle-badge');
              var serialEl = document.querySelector(baseSel+' .info-row:nth-child(3) .info-value');
              if(vendorEl){ var v=(vendorEl.textContent||'').trim(); if(v) info.vendor = v; }
              if(modelEl){ var m=(modelEl.textContent||'').trim(); if(m) info.model = m; }
              if(serialEl){ var s=(serialEl.textContent||'').trim(); if(s) info.serial = s; }
            }catch(_){ }
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
              <td><input type="checkbox" class="hw-row-check" aria-label="행 선택"></td>
              <td data-col="type">${d.type}</td>
              <td data-col="model">${d.model}</td>
              ${specCell}
              <td data-col="vendor">${d.vendor}</td>
              <td data-col="qty">-</td>
              <td data-col="fw">${d.fw}</td>
              <td data-col="remark">${d.remark}</td>
              <td class="system-actions table-actions">
                <button class="action-btn js-hw-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button>
              </td>`;
          } else {
            // Bay schema: 유형, 공간, 모델명, [용량], 일련번호, 제조사, 펌웨어, 비고
            tr.innerHTML = `
              <td><input type="checkbox" class="hw-row-check" aria-label="행 선택"></td>
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
            var d=getPageSystemInfo();
            function set(col, val){ var td=first.querySelector('[data-col="'+col+'"]'); if(td){ td.textContent = (val && String(val).trim())? String(val): '-'; } }
            set('model', d.model); if(hasSpecCol) set('spec','-'); set('vendor', d.vendor); set('fw', d.fw); set('remark', d.remark);
            if(isInventorySchema){ set('qty','-'); }
            else { set('space', d.space); set('serial', d.serial); }
          }catch(_){ }
        }
        refreshSystemRow();
        // If values are missing, fetch Basic Info HTML and parse
        (function tryFetchAndCacheBasicInfo(){
          try{
            var cachedModel = localStorage.getItem('vtl:current:model')||'';
            var cachedVendor = localStorage.getItem('vtl:current:vendor')||'';
            var cachedSerial = localStorage.getItem('vtl:current:serial')||'';
            var needFetch = !(cachedModel && cachedVendor && cachedSerial); // if key fields missing, fetch
            if(!needFetch){ return; }
            var url = '/app/templates/2.hardware/2-2.storage/2-2-5.vtl/2.vtl_detail.html';
            fetch(url, { cache: 'no-cache' }).then(function(res){ return res.text(); }).then(function(html){
              try{
                var parser = new DOMParser();
                var doc = parser.parseFromString(html, 'text/html');
                var baseSel = '.basic-info-grid .basic-info-card:nth-child(2) .basic-info-card-content';
                var vendorEl = doc.querySelector(baseSel+' .info-row:nth-child(1) .toggle-badge');
                var modelEl  = doc.querySelector(baseSel+' .info-row:nth-child(2) .toggle-badge');
                var serialEl = doc.querySelector(baseSel+' .info-row:nth-child(3) .info-value');
                var vendor=(vendorEl? (vendorEl.textContent||'').trim(): '');
                var model=(modelEl? (modelEl.textContent||'').trim(): '');
                var serial=(serialEl? (serialEl.textContent||'').trim(): '');
                if(vendor){ localStorage.setItem('vtl:current:vendor', vendor); }
                if(model){ localStorage.setItem('vtl:current:model', model); }
                if(serial){ localStorage.setItem('vtl:current:serial', serial); }
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
  
        // Add new row
        var addBtn = document.getElementById('hw-row-add');
        if(addBtn){
          addBtn.addEventListener('click', function(){
            ensureSystemRow();
            var tbody = table.querySelector('tbody');
            var tr = document.createElement('tr');
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
  
        // CSV export helpers and modal wiring
        function hwEscapeCSV(val){ return '"' + String(val).replace(/"/g,'""') + '"'; }
        function hwRowSaved(tr){ var t=tr.querySelector('.js-hw-toggle'); var inEdit=t && t.getAttribute('data-action')==='save'; if(inEdit) return false; return !tr.querySelector('td[data-col] input, td[data-col] select, td[data-col] textarea'); }
        function hwVisibleRows(){ var tbody=table.querySelector('tbody'); if(!tbody) return []; return Array.from(tbody.querySelectorAll('tr')).filter(function(tr){ return !(tr.hasAttribute('data-hidden') || tr.style.display==='none'); }); }
        function hwSavedVisibleRows(){ return hwVisibleRows().filter(hwRowSaved); }
        function hwExportCSV(onlySelected){
          var tbody = table.querySelector('tbody'); if(!tbody) return;
          var headers = hasSpecCol ? ['유형','공간','모델명','용량','일련번호','제조사','펌웨어','비고'] : ['유형','공간','모델명','일련번호','제조사','펌웨어','비고'];
          // Use only rows that are visible and saved (exclude inline-editing rows)
          var trs = hwSavedVisibleRows();
          if(onlySelected){ trs = trs.filter(function(tr){ var cb = tr.querySelector('.hw-row-check'); return cb && cb.checked; }); }
          if(trs.length===0) return;
          function text(tr, col){ var td=tr.querySelector('[data-col="'+col+'"]'); return td? (td.textContent||'').trim() : ''; }
          var baseCols = ['type','space','model']; if(hasSpecCol) baseCols.push('spec'); baseCols = baseCols.concat(['serial','vendor','fw','remark']);
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
      })();
  
      // [Tabs moved to /static/js/_detail/tab*.js]

  
      // [Tabs moved to /static/js/_detail/tab*.js]

  
      // [Tabs moved to /static/js/_detail/tab*.js]

  
        // Select all
        var selectAll = document.getElementById('mt-select-all');
        if(selectAll){
          selectAll.addEventListener('change', function(){
            var checks = table.querySelectorAll('tbody tr:not([data-hidden]) .mt-row-check:not([disabled])');
            checks.forEach(function(c){ c.checked = !!selectAll.checked; var tr=c.closest('tr'); if(tr){ tr.classList.toggle('selected', !!c.checked); } });
          });
        }
  
        (function(){
          var table = document.getElementById('mt-spec-table'); if(!table) return;
        // Row click toggles selection (excluding direct clicks on form controls)
        table.addEventListener('click', function(ev){
          var onControl = ev.target.closest('input, select, button, a, textarea');
          var onCheckbox = ev.target.closest('input[type="checkbox"].mt-row-check');
          if(onCheckbox){ var tr=onCheckbox.closest('tr'); if(tr){ var hidden=tr.hasAttribute('data-hidden') || tr.style.display==='none'; tr.classList.toggle('selected', !!onCheckbox.checked && !hidden); } var sa=document.getElementById('mt-select-all'); if(sa){ var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .mt-row-check'); if(visChecks.length){ sa.checked = Array.prototype.every.call(visChecks, function(c){ return c.checked; }); } else { sa.checked=false; } } return; }
          if(!onControl){ var tr = ev.target.closest('tr'); if(!tr) return; if(tr.hasAttribute('data-hidden') || tr.style.display==='none') return; var cb = tr.querySelector('.mt-row-check'); if(!cb) return; cb.checked = !cb.checked; tr.classList.toggle('selected', !!cb.checked); var sa = document.getElementById('mt-select-all'); if(sa){ var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .mt-row-check'); if(visChecks.length){ sa.checked = Array.prototype.every.call(visChecks, function(c){ return c.checked; }); } else { sa.checked=false; } } }
        });
  
        // CSV modal wiring
        (function(){
          var btn = document.getElementById('mt-download-btn');
          var modalId = 'mt-download-modal';
          var closeBtn = document.getElementById('mt-download-close');
          var confirmBtn = document.getElementById('mt-download-confirm');
          function openModalLocal(id){ try{ if(window.openModal) return window.openModal(id); var m=document.getElementById(id); if(m){ m.classList.add('show'); m.setAttribute('aria-hidden','false'); document.body.classList.add('modal-open'); } }catch(_){ } }
          function closeModalLocal(id){ try{ if(window.closeModal) return window.closeModal(id); var m=document.getElementById(id); if(m){ m.classList.remove('show'); m.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } } }catch(_){ } }
          if(btn){ btn.addEventListener('click', function(){ if(btn.disabled) return; var total = table.querySelectorAll('tbody tr').length; if(total<=0) return; var selectedCount = Array.from(table.querySelectorAll('tbody tr:not([data-hidden]) .mt-row-check')).filter(function(cb){ return cb.checked; }).length; var subtitle=document.getElementById('mt-download-subtitle'); if(subtitle){ subtitle.textContent = selectedCount>0 ? ('선택된 '+selectedCount+'개 또는 전체 '+total+'개 결과 중 범위를 선택하세요.') : ('현재 결과 '+total+'개 항목을 CSV로 내보냅니다.'); } var rowSelectedWrap=document.getElementById('mt-csv-range-row-selected'); var optSelected=document.getElementById('mt-csv-range-selected'); var optAll=document.getElementById('mt-csv-range-all'); if(rowSelectedWrap) rowSelectedWrap.hidden = !(selectedCount>0); if(optSelected){ optSelected.disabled = !(selectedCount>0); optSelected.checked = selectedCount>0; } if(optAll){ optAll.checked = !(selectedCount>0); } openModalLocal(modalId); }); }
          if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalLocal(modalId); }); }
          if(confirmBtn){ confirmBtn.addEventListener('click', function(){ var onlySel = !!(document.getElementById('mt-csv-range-selected') && document.getElementById('mt-csv-range-selected').checked); mtExportCSV(onlySel); closeModalLocal(modalId); }); }
        })();
  
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

  
      // [Tabs moved to /static/js/_detail/tab*.js]

  
      // [Removed legacy Change Log implementation]
  

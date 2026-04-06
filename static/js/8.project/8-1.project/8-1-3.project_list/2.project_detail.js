// Manufacturer detail: Manager tab logic (clean, manager-only)
(function () {
  // Apply saved sidebar state before the sidebar HTML is parsed to prevent flash.
  // Uses the same localStorage key as the global header toggle.
  try {
    var root = document && document.documentElement;
    if (!root) return;
    var state = localStorage.getItem('sidebarState');
    root.classList.remove('sidebar-hidden', 'sidebar-collapsed');
    if (state === 'hidden') root.classList.add('sidebar-hidden');
    else if (state === 'collapsed') root.classList.add('sidebar-collapsed');
  } catch (_e) {
    // ignore
  }
})();

(function(){
  'use strict';

  function ready(fn){ if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }

  ready(function(){
    window.__blsTabInits = window.__blsTabInits || {};
    window.__blsInitFlags = window.__blsInitFlags || {};
    // 프로젝트 접근 권한: 'write' = 등록된 사용자(수정 가능), 'read' = 미등록 사용자(보기만)
    window.__blsProjectAccess = 'write'; // default, updated after load
    // ---------- Project (8-1-3) shared helpers: project_id + tab CRUD ----------
    function blsGetProjectId(){
      try{
        var sp = new URLSearchParams(location.search || '');
        var raw = sp.get('project_id') || sp.get('projectId') || sp.get('id');
        var pid = parseInt(String(raw || '').trim(), 10);
        if(!isNaN(pid) && pid > 0) return pid;
      }catch(_){ }
      try{
        var cached = sessionStorage.getItem('project_selected_row');
        if(cached){
          var obj = JSON.parse(cached);
          var raw2 = (obj && (obj.project_id || obj.projectId || obj.id)) || null;
          var pid2 = parseInt(String(raw2 || '').trim(), 10);
          if(!isNaN(pid2) && pid2 > 0) return pid2;
        }
      }catch(_2){ }
      return null;
    }
    window.blsGetProjectId = blsGetProjectId;

    function blsPreserveProjectIdInTabLinks(){
      var pid = blsGetProjectId();
      if(!pid) return;
      try{ window.__BLOSSOM_PROJECT_ID = pid; }catch(_){ }
      // Tab links stay clean (no query params) — project_id is preserved via sessionStorage
    }

    /* ── Smooth tab transition: skip re-click on current tab ──── */
    (function(){
      try{
        var tabBar = document.querySelector('.server-detail-tabs[aria-label]');
        if(!tabBar) return;
        var links = tabBar.querySelectorAll('a.server-detail-tab-btn[href]');
        if(!links || !links.length) return;
        Array.prototype.forEach.call(links, function(a){
          a.addEventListener('click', function(ev){
            if(a.classList.contains('active')){ ev.preventDefault(); }
          });
        });
      }catch(_){ }
    })();

          if(window.BlossomTab41System && typeof window.BlossomTab41System.initAllocationTable === 'function'){
            try{ if(window.BlossomTab41System.initAllocationTable()) return; }catch(_){ }
          }
    blsPreserveProjectIdInTabLinks();

    var __blsDebounceTimers = {};
    function blsDebounce(key, fn, delayMs){
      try{
        var d = (delayMs == null) ? 800 : delayMs;
        if(__blsDebounceTimers[key]){ clearTimeout(__blsDebounceTimers[key]); }
        __blsDebounceTimers[key] = setTimeout(function(){
          try{ delete __blsDebounceTimers[key]; }catch(_){ }
          try{ fn && fn(); }catch(_e){ }
        }, d);
      }catch(_2){ try{ fn && fn(); }catch(_3){ } }
    }

    function blsApplyEmptyState(opts){
      opts = opts || {};
      var has = !!opts.has;
      var emptyEl = opts.emptyEl || null;
      var tableWrap = opts.tableWrap || null;
      var paginationEl = opts.paginationEl || null;
      var useHidden = !!opts.useHidden;

      try{
        if(emptyEl){
          emptyEl.hidden = has;
          emptyEl.style.display = has ? 'none' : '';
        }
      }catch(_){
        try{ if(emptyEl){ emptyEl.hidden = false; emptyEl.style.display = ''; } }catch(__){ }
      }

      function setContentVisible(el, visible){
        if(!el) return;
        try{
          if(useHidden){
            el.hidden = !visible;
          } else {
            el.style.display = visible ? '' : 'none';
          }
        }catch(_e){ }
      }

      setContentVisible(tableWrap, has);
      setContentVisible(paginationEl, has);
    }

    // Expose for late/standalone tab initializers in this bundle.
    try{ window.__blsApplyEmptyState = blsApplyEmptyState; }catch(_e){ }

    async function blsFetchJson(url, options){
      var resp = await fetch(url, Object.assign({ credentials: 'same-origin' }, (options || {})));
      var text = '';
      try{ text = await resp.text(); }catch(_){ }
      var data = null;
      try{ data = text ? JSON.parse(text) : null; }catch(_2){ data = null; }
      return { ok: resp.ok, status: resp.status, data: data, raw: text };
    }
    window.blsFetchJson = blsFetchJson;

    function blsIsPlainObject(v){
      try{ return !!v && typeof v === 'object' && Object.prototype.toString.call(v) === '[object Object]'; }
      catch(_){ return false; }
    }

    function blsDeepMerge(target, patch){
      // Deep merge for JSON-like objects. Arrays are replaced, not merged.
      try{
        if(!blsIsPlainObject(target)) target = {};
        if(!blsIsPlainObject(patch)) return target;
        Object.keys(patch).forEach(function(k){
          var pv = patch[k];
          if(Array.isArray(pv)){
            target[k] = pv.slice();
            return;
          }
          if(blsIsPlainObject(pv)){
            var tv = blsIsPlainObject(target[k]) ? target[k] : {};
            target[k] = blsDeepMerge(tv, pv);
            return;
          }
          target[k] = pv;
        });
        return target;
      }catch(_){ return target; }
    }

    var __blsPrjTabClientCache = undefined;
    function blsGetPrjTabClient(){
      if(__blsPrjTabClientCache !== undefined) return __blsPrjTabClientCache;
      var pid = blsGetProjectId();
      if(!pid){ __blsPrjTabClientCache = null; return null; }

      var _payloadCache = {};

      function keyItemId(tabKey){ return 'prj:tabItemId:' + pid + ':' + String(tabKey || '').trim().toLowerCase(); }
      function getItemId(tabKey){
        try{ var v = sessionStorage.getItem(keyItemId(tabKey)); var n = parseInt(String(v||''),10); return (!isNaN(n) && n>0) ? n : null; }catch(_){ return null; }
      }
      function setItemId(tabKey, id){
        try{ if(id){ sessionStorage.setItem(keyItemId(tabKey), String(id)); } else { sessionStorage.removeItem(keyItemId(tabKey)); } }catch(_){ }
      }

      async function loadLatest(tabKey){
        var tk = String(tabKey||'').trim().toLowerCase();
        if(!tk) return null;
        var res = await blsFetchJson('/api/prj/projects/' + pid + '/tabs/' + tk);
        if(!res.ok || !res.data || !res.data.success) return null;
        var items = res.data.items || [];
        if(!items.length) return null;
        var latest = items[items.length - 1];
        if(latest && latest.id){ setItemId(tk, latest.id); }
        try{
          if(latest && latest.payload && typeof latest.payload === 'object'){
            _payloadCache[tk] = latest.payload;
          }
        }catch(_p){ }
        return latest;
      }

      async function saveLatest(tabKey, payloadObj){
        var tk = String(tabKey||'').trim().toLowerCase();
        if(!tk) return null;
        var itemId = getItemId(tk);
        var body = JSON.stringify({ payload: payloadObj });
        if(itemId){
          var up = await blsFetchJson('/api/prj/projects/' + pid + '/tabs/' + tk + '/' + itemId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: body,
          });
          if(up.ok && up.data && up.data.success && up.data.item && up.data.item.id){
            setItemId(tk, up.data.item.id);
            return up.data.item;
          }
          // If the cached id is stale, fall back to create
          if(up.status === 404){ setItemId(tk, null); }
        }

        var cr = await blsFetchJson('/api/prj/projects/' + pid + '/tabs/' + tk, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body,
        });
        if(cr.ok && cr.data && cr.data.success && cr.data.item && cr.data.item.id){
          setItemId(tk, cr.data.item.id);
          try{
            if(cr.data.item.payload && typeof cr.data.item.payload === 'object'){
              _payloadCache[tk] = cr.data.item.payload;
            }
          }catch(_p3){ }
          return cr.data.item;
        }
        return null;
      }

      async function saveMergedLatest(tabKey, patchObj){
        var tk = String(tabKey||'').trim().toLowerCase();
        if(!tk) return null;
        var base = null;
        try{ base = (blsIsPlainObject(_payloadCache[tk]) ? _payloadCache[tk] : null); }catch(_){ base = null; }
        if(!base){
          try{
            var latest = await loadLatest(tk);
            base = (latest && latest.payload && typeof latest.payload === 'object') ? latest.payload : null;
          }catch(_l){ base = null; }
        }
        if(!base) base = {};
        var merged = blsDeepMerge({}, base);
        merged = blsDeepMerge(merged, patchObj || {});
        var saved = await saveLatest(tk, merged);
        try{
          if(saved && saved.payload && typeof saved.payload === 'object'){
            _payloadCache[tk] = saved.payload;
          }
        }catch(_s){ }
        return saved;
      }

      __blsPrjTabClientCache = { projectId: pid, loadLatest: loadLatest, saveLatest: saveLatest, saveMergedLatest: saveMergedLatest };
      return __blsPrjTabClientCache;
    }

    // Expose minimal helpers for other IIFEs in this bundle (e.g., tab88 risk).
    try{ window.__blsGetPrjTabClient = blsGetPrjTabClient; }catch(_){ }
    try{ window.__blsDebounce = blsDebounce; }catch(_){ }

    // ---------- Maintenance Basic Info (2.maintenance_detail.html) ----------
    (function(){
      try{
        var path = (location && location.pathname || '').toLowerCase();
        if(!/\/9-7\.vendor\/9-7-2\.maintenance\/2\.maintenance_detail\.html$/.test(path)) return;
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
        function renderMaintenanceStats(forceUseDom){
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
        // 작업이력 통계: 연도별 카테고리 누적 막대 그래프 렌더러 (세로 막대)
        function renderJobHistoryStats(){
          try{
            var chartEl = document.getElementById('job-bar-chart');
            var emptyEl = document.getElementById('job-empty');
            var legendEl = document.getElementById('job-bar-legend');
            var scaleEl = document.getElementById('job-bar-scale');
            var yearSel = document.getElementById('job-year-select');
            if(!chartEl || !emptyEl) return;

            // Available years from task tab aggregation
            var nowY = String((new Date()).getFullYear());
            var years = [];
            try{ years = JSON.parse(localStorage.getItem('vendor:task:years')||'[]') || []; }catch(_){ years = []; }
            if(!years || years.length===0){ years = [nowY]; }

            // Populate year select once (or when empty)
            if(yearSel && !yearSel.options.length){
              yearSel.innerHTML = years.map(function(y){ return '<option value="'+y+'">'+y+'년</option>'; }).join('');
              var savedY = (function(){ try{ return localStorage.getItem('vendor:task:year:selected'); }catch(_){ return null; } })();
              var initY = (savedY && years.indexOf(savedY)>-1) ? savedY : years[0];
              yearSel.value = initY;
            }
            var selectedYear = yearSel ? (yearSel.value || years[0]) : years[0];
            try{ localStorage.setItem('vendor:task:year:selected', selectedYear); }catch(_){ }

            var CATS = ['테스트','개선','장애대응','변경','점검'];
            var COLORS = { '테스트':'#8b5cf6', '개선':'#10b981', '장애대응':'#ef4444', '변경':'#0ea5e9', '점검':'#f59e0b' };

            // Read aggregated monthly counts by category for the selected year
            var monthly = {};
            try{ var raw = localStorage.getItem('vendor:task:yearly:'+selectedYear); monthly = raw? (JSON.parse(raw)||{}) : {}; }catch(_){ monthly = {}; }

            // Build months 01..12
            var months = [];
            for(var i=1;i<=12;i++){ var mm = String(i).padStart(2,'0'); months.push({ key: selectedYear+'-'+mm, month:mm, label: i+'월' }); }
            // Compute totals and max
            var totals = months.map(function(m){ var mcounts = monthly[m.month] || {}; return CATS.reduce(function(acc, c){ var n=parseInt(String(mcounts[c]||0),10); return acc + (isNaN(n)?0:n); }, 0); });
            var grand = totals.reduce(function(a,b){ return a+b; }, 0);
            var isEmpty = grand <= 0;

            if(isEmpty){
              emptyEl.hidden = false; emptyEl.style.display='';
              try{ showNoDataImage(emptyEl, '작업 이력이 없습니다.\n작업이력 탭에서 작업을 등록하세요.'); }catch(_s){}
              chartEl.innerHTML = ''; chartEl.style.display = 'none';
              if(legendEl) legendEl.innerHTML = '';
              if(scaleEl) scaleEl.style.display = 'none';
              return;
            } else {
              emptyEl.hidden = true; emptyEl.style.display='none';
              chartEl.style.display = '';
              if(scaleEl) scaleEl.style.display = '';
            }

            // Use count-based scale: 1..5 bins, 5+ is clamped visually to the last bin
            var cap = 5; // display cap
            var max = cap; // bar width scaled against 5
            chartEl.innerHTML = '';
            if(legendEl){ legendEl.innerHTML = CATS.map(function(c){ return '<li><span class="legend-dot" style="background:'+COLORS[c]+'"></span><span>'+c+'</span></li>'; }).join(''); }

            months.forEach(function(m, idx){
              var total = totals[idx];
              var pct = Math.round((Math.min(total, cap) / max) * 100);
              var item = document.createElement('div'); item.className = 'bar-item';
              var label = document.createElement('div'); label.className='bar-label'; label.textContent = m.label;
              var bar = document.createElement('div'); bar.className = 'bar'; bar.style.setProperty('--w', String(pct));
              var mcounts = monthly[m.month] || {};
              // Add stacked segments (left-to-right)
              CATS.forEach(function(c){ var v = parseInt(String(mcounts[c]||0),10); if(isNaN(v) || v<=0) return; var seg = document.createElement('div'); seg.className='stack'; seg.style.background = COLORS[c]; seg.style.flex = String(v); seg.title = m.key+' · '+c+' '+v+'건'; bar.appendChild(seg); });
              item.appendChild(label); item.appendChild(bar); chartEl.appendChild(item);
            });
          }catch(_e){ /* no-op */ }
        }
        // 샘플 데이터 주입: 저장소에 아무 데이터도 없을 때 현재 월에만 임시 샘플 1건 입력
        function seedJobHistorySample(){
          try{
            // If a monthly map exists and has any positive value, do nothing
            var m = null;
            try{ var raw = localStorage.getItem('vendor:task:monthlyCounts'); m = raw ? JSON.parse(raw||'{}') || {} : null; }catch(_){ m = null; }
            if(m){
              var some = Object.keys(m).some(function(k){ var n=parseInt(String(m[k]).replace(/[^0-9-]/g,''),10); return !isNaN(n) && isFinite(n) && n>0; });
              if(some) return;
            }
            // Check per-month keys for last 12 months
            var now = new Date(); var hasAny = false;
            for(var i=0;i<12;i++){
              var d = new Date(now.getFullYear(), now.getMonth()-i, 1);
              var key = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
              var raw2 = localStorage.getItem('vendor:task:count:'+key);
              var n2 = parseInt(String(raw2||'').replace(/[^0-9-]/g,''),10);
              if(!isNaN(n2) && isFinite(n2) && n2>0){ hasAny=true; break; }
            }
            if(hasAny) return;
            // Seed current month with 1 (lightweight sample)
            var curKey = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
            localStorage.setItem('vendor:task:count:'+curKey, '1');
          }catch(_){ }
        }
        // 연도/카테고리 기반 샘플 데이터 주입: 통계(누적 막대) 시각화를 위한 더 풍부한 더미 데이터
        function seedJobHistoryCategorySample(year){
          try{
            var y = String(year||'').trim(); if(!y){ y = String((new Date()).getFullYear()); }
            // Skip if already seeded for this year
            var seededKey = 'vendor:task:yearly:seeded:'+y;
            try{ if(localStorage.getItem(seededKey)) return; }catch(_){ }
            // Skip if real data exists for this year (any month any category > 0)
            var existing = null; try{ existing = JSON.parse(localStorage.getItem('vendor:task:yearly:'+y) || 'null'); }catch(_e){ existing = null; }
            var hasReal = false;
            if(existing && typeof existing==='object'){
              for(var i=1;i<=12 && !hasReal;i++){
                var mm = String(i).padStart(2,'0'); var mcounts = existing[mm] || {};
                if(['테스트','개선','장애대응','변경','점검'].some(function(c){ var n=parseInt(String(mcounts[c]||0),10); return !isNaN(n) && n>0; })) hasReal = true;
              }
            }
            if(hasReal) { try{ localStorage.setItem(seededKey, 'skip-real'); }catch(_s){} return; }
            // Build pleasant-looking sample distribution
            var sample = {};
            for(var m=1;m<=12;m++){
              var mm = String(m).padStart(2,'0');
              // Baselines
              var test = (m%4===0)? 2 : 1;         // 테스트
              var improve = (m%3===0)? 3 : 2;      // 개선
              var incident = (m%6===0)? 3 : (m%5===0? 2 : 1); // 장애대응 (가끔 스파이크)
              var change = 2 + ((m%2) ? 1 : 0);    // 변경
              var check = 3;                       // 점검: 꾸준히
              sample[mm] = { '테스트':test, '개선':improve, '장애대응':incident, '변경':change, '점검':check };
            }
            try{ localStorage.setItem('vendor:task:yearly:'+y, JSON.stringify(sample)); }catch(_w){}
            // Update years list
            try{
              var years = []; try{ years = JSON.parse(localStorage.getItem('vendor:task:years')||'[]')||[]; }catch(_y){}
              if(years.indexOf(y)===-1) years.unshift(y);
              localStorage.setItem('vendor:task:years', JSON.stringify(years));
              localStorage.setItem('vendor:task:year:selected', y);
            }catch(_l){}
            try{ localStorage.setItem(seededKey, String(Date.now())); }catch(_k){}
            try{ window.dispatchEvent(new Event('vendor:task:yearly:updated')); }catch(_e){ }
          }catch(_){ }
        }
  // Initial render
  renderMaintenanceStats(false);
  // Remove any previously seeded sample yearly data (do not create new sample data)
  try{
    (function clearVendorTaskYearlySamples(){
      try{
        var yearsRaw = localStorage.getItem('vendor:task:years');
        var years = [];
        try{ years = JSON.parse(yearsRaw||'[]')||[]; }catch(_y){ years = []; }
        var toRemove = [];
        for(var i=0;i<localStorage.length;i++){
          var k = localStorage.key(i);
          if(!k) continue;
          if(k.indexOf('vendor:task:yearly:seeded:')===0){
            var flag = localStorage.getItem(k) || '';
            if(flag && flag !== 'skip-real'){
              var y = k.split(':').pop();
              toRemove.push(y);
            }
          }
        }
          toRemove.forEach(function(y){
            try{ localStorage.removeItem('vendor:task:yearly:'+y); }catch(_r){}
            try{ localStorage.removeItem('vendor:task:yearly:seeded:'+y); }catch(_r){}
            years = years.filter(function(v){ return v!==y; });
          });
          try{ localStorage.setItem('vendor:task:years', JSON.stringify(years)); }catch(_s){}
          // If selected year was removed, reset to first available
          try{
            var sel = localStorage.getItem('vendor:task:year:selected');
            if(sel && toRemove.indexOf(sel)>-1){
              var fallback = years && years.length? years[0] : String((new Date()).getFullYear());
              localStorage.setItem('vendor:task:year:selected', fallback);
            }
          }catch(_sel){}
          try{ window.dispatchEvent(new Event('vendor:task:yearly:updated')); }catch(_e){}
      }catch(_c){}
    })();

          // (Removed: earlier global delegated sorter; replaced with tab81-scoped sorter integrated with pagination)
  }catch(_ignore){}
  renderJobHistoryStats();
  // Year controls and live refresh
  try{
    var yearBtn = document.getElementById('job-year-btn');
    var yearSel = document.getElementById('job-year-select');
    if(yearBtn && yearSel){
      yearBtn.addEventListener('click', function(){
        var vals = Array.from(yearSel.options).map(function(o){ return o.value; });
        if(vals.length<=1){ try{ yearSel.focus(); }catch(_){ } return; }
        var idx = vals.indexOf(yearSel.value);
        var next = (idx>=0? idx+1 : 0) % vals.length;
        yearSel.value = vals[next];
        try{ localStorage.setItem('vendor:task:year:selected', yearSel.value); }catch(_){ }
        try{ renderJobHistoryStats(); }catch(_r){}
      });
    }
    if(yearSel){ yearSel.addEventListener('change', function(){ try{ localStorage.setItem('vendor:task:year:selected', yearSel.value); }catch(_){ } try{ renderJobHistoryStats(); }catch(_r){} }); }
    window.addEventListener('vendor:task:yearly:updated', function(){ try{ renderJobHistoryStats(); }catch(_r){} });
  }catch(_c){}

  // 기본정보 수정 모달 동작: 열기/닫기/저장 (벤더/카테고리 화면 전용)
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
          vendor:'유지보수사', address:'주소', business_number:'사업자번호', call_center:'고객센터',
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
          var section=document.createElement('div'); section.className='form-section'; section.innerHTML='<div class="section-header"><h4>유지보수사</h4></div>';
          var grid=document.createElement('div'); grid.className='form-grid';
          ['vendor','address','business_number','call_center','hardware_qty','software_qty','component_qty','note'].forEach(function(c){
            var wrap=document.createElement('div'); wrap.className=(c==='note')? 'form-row form-row-wide':'form-row';
            var controlHtml = '';
            if(c==='note') controlHtml = '<textarea name="note" class="form-input textarea-large" rows="6">'+(data.note||'')+'</textarea>';
            else if(c==='hardware_qty' || c==='software_qty' || c==='component_qty') controlHtml = '<input name="'+c+'" type="number" min="0" step="1" class="form-input qty-dashed-lock" value="'+(data[c]||0)+'" placeholder="0">';
            else controlHtml = '<input name="'+c+'" class="form-input" value="'+(data[c]||'')+'">';
            wrap.innerHTML = '<label>'+LABELS[c]+'</label>'+controlHtml; grid.appendChild(wrap);
          });
          section.appendChild(grid); form.appendChild(section);
        }
        // Only wire the vendor-style edit flow when its opener exists
        var openBtn = document.getElementById(EDIT_OPEN_ID);
        if(openBtn){
          openBtn.addEventListener('click', function(){ buildEditForm(); openModalLocal(EDIT_MODAL_ID); var first = document.querySelector('#'+EDIT_FORM_ID+' .form-input'); if(first){ try{ first.focus(); }catch(_){ } } });
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
          try{ renderMaintenanceStats(true); }catch(_){ }
          closeModalLocal(EDIT_MODAL_ID);
          }); }
        }

        // 프로젝트 페이지 전용: 상단 우측 '수정' 둥근 버튼으로 프로젝트 수정 모달 열기
        // → 핵심 모달 로직은 아래 main IIFE에서 처리하므로, 여기서는 close/escape 바인딩만 수행
        (function(){
          var fab = document.getElementById('project-edit-fab'); if(!fab) return;
          var modalId = 'system-edit-modal';
          var closeBtn2 = document.getElementById('system-edit-close');
          function closeM(){ closeModalLocal(modalId); }
          if(closeBtn2){ closeBtn2.addEventListener('click', closeM); }
          var modalEl2 = document.getElementById(modalId);
          if(modalEl2){ modalEl2.addEventListener('click', function(e){ if(e.target===modalEl2) closeM(); }); document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl2.classList.contains('show')) closeM(); }); }
        })();
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
  
      // tab83 (일정관리/Schedule) → tab83-schedule.js 로 분리됨

      // [Tabs moved to /static/js/_detail/tab*.js]

  
      // ---------- Communication (tab87): CRUD, pagination, CSV, upload ----------
      // tab87 (의사소통관리/Communication) → tab87-communication.js 로 분리됨

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
          // Persist software count across all saved rows in this tab (no quantity column)
          function swPersistQtySum(){
            try{
              var tbody = table.querySelector('tbody');
              var trs = tbody? Array.from(tbody.querySelectorAll('tr')): [];
              var savedCount = trs.filter(function(tr){
                return !tr.querySelector('td[data-col] input, td[data-col] select, td[data-col] textarea');
              }).length;
              try{ localStorage.setItem('vendor:sw:sumQty', String(savedCount)); }catch(_){ }
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
              <td data-col="status"><input type="text" placeholder="계약상태"></td>
              <td data-col="category">${buildCategorySelect('')}</td>
              <td data-col="model"><input type="text" placeholder="모델명 (필수)"></td>
              <td data-col="type">${buildTypeSelect('', '')}</td>
              <td data-col="mgmt_no"><input type="text" placeholder="관리번호"></td>
              <td data-col="serial_no"><input type="text" placeholder="일련번호"></td>
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
              function toInput(name){ var td=tr.querySelector('[data-col="'+name+'"]'); if(!td) return; var current=(td.textContent||'').trim(); if(name==='category'){ td.innerHTML = buildCategorySelect(current==='-'?'':current); return; } if(name==='type'){ var catText = (tr.querySelector('[data-col="category"]').textContent||'').trim(); td.innerHTML = buildTypeSelect(catText==='-'?'':catText, current==='-'?'':current); return; } td.innerHTML = '<input type="text" value="'+(current==='-'?'':current)+'" placeholder="">'; }
              ['status','category','model','type','mgmt_no','serial_no','remark'].forEach(toInput); wireTypeDependency(tr);
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
              if(firstInvalid){ try{ firstInvalid.focus(); }catch(_){ } return; }
              function commit(name,val){ var td=tr.querySelector('[data-col="'+name+'"]'); if(!td) return; var text=(val===''||val==null)? '-' : String(val); td.textContent = text; }
              function read(name){ var el=getInput(name); var v=(el? el.value : (tr.querySelector('[data-col="'+name+'"]').textContent||'')); return String(v).trim(); }
              commit('status', read('status'));
              commit('category', catVal);
              commit('model', modelVal);
              commit('type', typeVal);
              commit('mgmt_no', read('mgmt_no'));
              commit('serial_no', read('serial_no'));
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
          function swExportCSV(onlySelected){ var tbody=table.querySelector('tbody'); if(!tbody) return; var headers=['계약상태','구분','모델명','유형','관리번호','일련번호','비고']; var trs=swSavedVisibleRows(); if(onlySelected){ trs = trs.filter(function(tr){ var cb=tr.querySelector('.hw-row-check'); return cb && cb.checked; }); } if(trs.length===0) return; function text(tr,col){ var td=tr.querySelector('[data-col="'+col+'"]'); return td? (td.textContent||'').trim() : ''; } var cols=['status','category','model','type','mgmt_no','serial_no','remark']; var rows = trs.map(function(tr){ return cols.map(function(c){ return text(tr,c); }); }); var lines = [headers].concat(rows).map(function(arr){ return arr.map(swEscapeCSV).join(','); }); var csv='\uFEFF'+lines.join('\r\n'); var d=new Date(); var yyyy=d.getFullYear(); var mm=String(d.getMonth()+1).padStart(2,'0'); var dd=String(d.getDate()).padStart(2,'0'); var filename='vendor_software_'+yyyy+mm+dd+'.csv'; try{ var blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); var url=URL.createObjectURL(blob); var a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); } catch(_){ var a2=document.createElement('a'); a2.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a2.download=filename; document.body.appendChild(a2); a2.click(); document.body.removeChild(a2); } }
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
          // Persist hardware count across all saved rows in this tab (no quantity column)
          function hwPersistQtySum(){
            try{
              var tbody = table.querySelector('tbody');
              var trs = tbody? Array.from(tbody.querySelectorAll('tr')): [];
              var savedCount = trs.filter(function(tr){
                return !tr.querySelector('td[data-col] input, td[data-col] select, td[data-col] textarea');
              }).length;
              try{ localStorage.setItem('vendor:hw:sumQty', String(savedCount)); }catch(_){ }
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
              <td data-col="status"><input type="text" placeholder="계약상태"></td>
              <td data-col="category">${buildCategorySelect('')}</td>
              <td data-col="model"><input type="text" placeholder="모델명 (필수)"></td>
              <td data-col="type">${buildTypeSelect('', '')}</td>
              <td data-col="mgmt_no"><input type="text" placeholder="관리번호"></td>
              <td data-col="serial_no"><input type="text" placeholder="일련번호"></td>
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
              function toInput(name){ var td=tr.querySelector('[data-col="'+name+'"]'); if(!td) return; var current=(td.textContent||'').trim(); if(name==='category'){ td.innerHTML = buildCategorySelect(current==='-'?'':current); return; } if(name==='type'){ var catText = (tr.querySelector('[data-col="category"]').textContent||'').trim(); td.innerHTML = buildTypeSelect(catText==='-'?'':catText, current==='-'?'':current); return; } td.innerHTML = '<input type="text" value="'+(current==='-'?'':current)+'" placeholder="">'; }
              ['status','category','model','type','mgmt_no','serial_no','remark'].forEach(toInput); wireTypeDependency(tr);
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
              if(firstInvalid){ try{ firstInvalid.focus(); }catch(_){ } return; }
              function commit(name,val){ var td=tr.querySelector('[data-col="'+name+'"]'); if(!td) return; var text=(val===''||val==null)? '-' : String(val); td.textContent = text; }
              function read(name){ var el=getInput(name); var v=(el? el.value : (tr.querySelector('[data-col="'+name+'"]').textContent||'')); return String(v).trim(); }
              commit('status', read('status'));
              commit('category', catVal);
              commit('model', modelVal);
              commit('type', typeVal);
              commit('mgmt_no', read('mgmt_no'));
              commit('serial_no', read('serial_no'));
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
          function hwExportCSV(onlySelected){ var tbody=table.querySelector('tbody'); if(!tbody) return; var headers=['계약상태','구분','모델명','유형','관리번호','일련번호','비고']; var trs=hwSavedVisibleRows(); if(onlySelected){ trs = trs.filter(function(tr){ var cb=tr.querySelector('.hw-row-check'); return cb && cb.checked; }); } if(trs.length===0) return; function text(tr,col){ var td=tr.querySelector('[data-col="'+col+'"]'); return td? (td.textContent||'').trim() : ''; } var cols=['status','category','model','type','mgmt_no','serial_no','remark']; var rows = trs.map(function(tr){ return cols.map(function(c){ return text(tr,c); }); }); var lines = [headers].concat(rows).map(function(arr){ return arr.map(hwEscapeCSV).join(','); }); var csv='\uFEFF'+lines.join('\r\n'); var d=new Date(); var yyyy=d.getFullYear(); var mm=String(d.getMonth()+1).padStart(2,'0'); var dd=String(d.getDate()).padStart(2,'0'); var filename='vendor_hardware_'+yyyy+mm+dd+'.csv'; try{ var blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); var url=URL.createObjectURL(blob); var a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); } catch(_){ var a2=document.createElement('a'); a2.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a2.download=filename; document.body.appendChild(a2); a2.click(); document.body.removeChild(a2); } }
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
          // Persist component count across all saved rows in this tab (no quantity column)
          function coPersistQtySum(){
            try{
              var tbody = table.querySelector('tbody');
              var trs = tbody? Array.from(tbody.querySelectorAll('tr')): [];
              var savedCount = trs.filter(function(tr){
                return !tr.querySelector('td[data-col] input, td[data-col] select, td[data-col] textarea');
              }).length;
              try{ localStorage.setItem('vendor:co:sumQty', String(savedCount)); }catch(_){ }
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
              <td data-col="status"><input type="text" placeholder="계약상태"></td>
              <td data-col="category">${buildCategorySelect('')}</td>
              <td data-col="model"><input type="text" placeholder="모델명 (필수)"></td>
              <td data-col="type"><input type="text" placeholder="유형"></td>
              <td data-col="mgmt_no"><input type="text" placeholder="관리번호"></td>
              <td data-col="serial_no"><input type="text" placeholder="일련번호"></td>
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
              function toInput(name){ var td=tr.querySelector('[data-col="'+name+'"]'); if(!td) return; var current=(td.textContent||'').trim(); if(name==='category'){ td.innerHTML = buildCategorySelect(current==='-'?'':current); return; } td.innerHTML = '<input type="text" value="'+(current==='-'?'':current)+'" placeholder="">'; }
              ['status','category','model','type','mgmt_no','serial_no','remark'].forEach(toInput);
              var toggleBtn = tr.querySelector('.js-co-toggle'); if(toggleBtn){ toggleBtn.setAttribute('data-action','save'); toggleBtn.title='저장'; toggleBtn.setAttribute('aria-label','저장'); toggleBtn.innerHTML='<img src="/static/image/svg/save.svg" alt="저장" class="action-icon">'; } else { var actions = tr.querySelector('.table-actions'); if(actions){ actions.classList.add('system-actions'); actions.innerHTML = '<button class="action-btn js-co-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button> <button class="action-btn danger js-co-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'; } }
              return;
            }
            if(target.classList.contains('js-co-toggle') && target.getAttribute('data-action')==='save'){
              function getInput(name){ var td=tr.querySelector('[data-col="'+name+'"]'); return td? td.querySelector('input, select'): null; }
              function setError(el,on){ if(!el) return; if(on){ el.classList.add('input-error'); el.setAttribute('aria-invalid','true'); } else { el.classList.remove('input-error'); el.removeAttribute('aria-invalid'); } }
              var firstInvalid=null;
              var modelInp = getInput('model'); var modelVal = (modelInp? modelInp.value : (tr.querySelector('[data-col="model"]').textContent||'')).trim(); if(!modelVal){ setError(modelInp,true); if(!firstInvalid) firstInvalid=modelInp; } else { setError(modelInp,false); }
              var catSel = getInput('category'); var catVal = (catSel? catSel.value : (tr.querySelector('[data-col="category"]').textContent||'')).trim(); if(!catVal){ setError(catSel,true); if(!firstInvalid) firstInvalid=catSel; } else { setError(catSel,false); }
              if(firstInvalid){ try{ firstInvalid.focus(); }catch(_){ } return; }
              function commit(name,val){ var td=tr.querySelector('[data-col="'+name+'"]'); if(!td) return; var text=(val===''||val==null)? '-' : String(val); td.textContent = text; }
              function read(name){ var el=getInput(name); var v=(el? el.value : (tr.querySelector('[data-col="'+name+'"]').textContent||'')); return String(v).trim(); }
              commit('status', read('status'));
              commit('category', catVal);
              commit('model', modelVal);
              commit('type', read('type'));
              commit('mgmt_no', read('mgmt_no'));
              commit('serial_no', read('serial_no'));
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
          function coExportCSV(onlySelected){ var tbody=table.querySelector('tbody'); if(!tbody) return; var headers=['계약상태','구분','모델명','유형','관리번호','일련번호','비고']; var trs=coSavedVisibleRows(); if(onlySelected){ trs = trs.filter(function(tr){ var cb=tr.querySelector('.hw-row-check'); return cb && cb.checked; }); } if(trs.length===0) return; function text(tr,col){ var td=tr.querySelector('[data-col="'+col+'"]'); return td? (td.textContent||'').trim() : ''; } var cols=['status','category','model','type','mgmt_no','serial_no','remark']; var rows = trs.map(function(tr){ return cols.map(function(c){ return text(tr,c); }); }); var lines = [headers].concat(rows).map(function(arr){ return arr.map(coEscapeCSV).join(','); }); var csv='\uFEFF'+lines.join('\r\n'); var d=new Date(); var yyyy=d.getFullYear(); var mm=String(d.getMonth()+1).padStart(2,'0'); var dd=String(d.getDate()).padStart(2,'0'); var filename='vendor_component_'+yyyy+mm+dd+'.csv'; try{ var blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); var url=URL.createObjectURL(blob); var a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); } catch(_){ var a2=document.createElement('a'); a2.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a2.download=filename; document.body.appendChild(a2); a2.click(); document.body.removeChild(a2); } }
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

  
  
      // [Removed legacy Change Log implementation]
  

            // Edit modal open/close/save and overview sync
            (function(){
              var chartMode = 'pie'; // 'pie' | 'bar'
              var fab = document.getElementById('project-edit-fab');
              var modal = document.getElementById('system-edit-modal');
              var closeBtn = document.getElementById('system-edit-close');
              var saveBtn = document.getElementById('system-edit-save');
              var moreBtn = document.getElementById('project-desc-more');
              var descFly = document.getElementById('desc-flyout');
              var descClose = document.getElementById('desc-flyout-close');
              var descOk = null; // footer 제거
              var descBody = document.getElementById('desc-flyout-body');
              var progPiePane = document.getElementById('prog-pie-pane');
              var progBarPane = document.getElementById('prog-bar-pane');
              var progToggle = document.getElementById('prog-stats-toggle');
              var hbar = document.getElementById('prog-hbar');
              var hbarLegend = document.getElementById('prog-hbar-legend');

              /* ── Donut 4-segment updater (완료/진행/지연/대기) ── */
              function updatePieFromStats(){
                try{
                  var pieEl = document.getElementById('box2-pie');
                  if(!pieEl) return;
                  var pieWrap = pieEl.closest('.pie-wrap');
                  var elDone = document.getElementById('stat-done');
                  var elDoing = document.getElementById('stat-doing');
                  var elOverdue = document.getElementById('stat-overdue');
                  var elPending = document.getElementById('stat-pending');
                  var done    = parseInt((elDone && elDone.textContent) || '0', 10) || 0;
                  var doing   = parseInt((elDoing && elDoing.textContent) || '0', 10) || 0;
                  var overdue = parseInt((elOverdue && elOverdue.textContent) || '0', 10) || 0;
                  var pending = parseInt((elPending && elPending.textContent) || '0', 10) || 0;
                  var total   = done + doing + overdue + pending;
                  /* ── No-data: show Lottie animation ── */
                  if(total <= 0){
                    pieEl.style.display='none';
                    var legend = pieWrap && pieWrap.querySelector('.pie-legend');
                    if(legend) legend.style.display='none';
                    showPieNoData(pieWrap);
                    return;
                  }
                  /* Has data – ensure chart & legend visible, hide no-data */
                  pieEl.style.display='';
                  var legend2 = pieWrap && pieWrap.querySelector('.pie-legend');
                  if(legend2) legend2.style.display='';
                  hidePieNoData(pieWrap);
                  pieEl.setAttribute('data-total', String(total));
                  var d1 = Math.round((done * 360) / total);
                  var d2 = d1 + Math.round((doing * 360) / total);
                  var d3 = d2 + Math.round((overdue * 360) / total);
                  if(d3 > 360) d3 = 360;
                  pieEl.style.setProperty('--d1', d1+'deg');
                  pieEl.style.setProperty('--d2', d2+'deg');
                  pieEl.style.setProperty('--d3', d3+'deg');
                }catch(_){ }
              }

              /* ── No-data Lottie helpers for pie area ── */
              var _pieNoDataEl = null;
              function showPieNoData(pieWrap){
                if(!pieWrap) return;
                if(_pieNoDataEl){ _pieNoDataEl.style.display=''; return; }
                _pieNoDataEl = document.createElement('div');
                _pieNoDataEl.className = 'pie-no-data';
                _pieNoDataEl.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:16px 0;width:100%;';
                var animBox = document.createElement('div');
                animBox.style.cssText = 'width:240px;height:190px;pointer-events:none;display:flex;align-items:center;justify-content:center;';
                _pieNoDataEl.appendChild(animBox);
                var caption = document.createElement('span');
                caption.textContent = '등록된 WBS 항목이 없습니다.';
                caption.style.cssText = 'font-size:13px;color:#94a3b8;text-align:center;width:100%;';
                _pieNoDataEl.appendChild(caption);
                pieWrap.appendChild(_pieNoDataEl);
                /* Load lottie animation */
                function doLoad(){
                  try{
                    window.lottie.loadAnimation({ container:animBox, renderer:'svg', loop:true, autoplay:true,
                      path:'/static/image/svg/free-animated-no-data.json',
                      rendererSettings:{ preserveAspectRatio:'xMidYMid meet' } });
                  }catch(_){}
                }
                if(window.lottie){ doLoad(); }
                else{
                  var s=document.createElement('script');
                  s.src='https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js';
                  s.async=true; s.onload=doLoad; document.head.appendChild(s);
                }
              }
              function hidePieNoData(){
                if(_pieNoDataEl){
                  try{ if(_pieNoDataEl.parentNode) _pieNoDataEl.parentNode.removeChild(_pieNoDataEl); }catch(_){}
                  _pieNoDataEl=null;
                }
              }

              // Render pie on load
              updatePieFromStats();

              /* ── Load WBS result stats from scope tab and update donut ── */
              function updatePieFromWbs(){
                try{
                  var client = null;
                  try{ client = (typeof window.__blsGetPrjTabClient==='function') ? window.__blsGetPrjTabClient() : null; }catch(_){ client = null; }
                  if(!client) return;
                  client.loadLatest('scope').then(function(item){
                    if(!item || !item.payload || !Array.isArray(item.payload.rows)) return;
                    var rows = item.payload.rows;
                    var done=0, doing=0, overdue=0, pending=0;
                    rows.forEach(function(r){
                      var v = String(r.result||'').trim();
                      if(v==='\uc644\ub8cc') done++;
                      else if(v==='\uc9c4\ud589') doing++;
                      else if(v==='\uc9c0\uc5f0') overdue++;
                      else if(v==='\ub300\uae30') pending++;
                    });
                    var elDone = document.getElementById('stat-done');
                    var elDoing = document.getElementById('stat-doing');
                    var elOverdue = document.getElementById('stat-overdue');
                    var elPending = document.getElementById('stat-pending');
                    if(elDone) elDone.textContent = String(done);
                    if(elDoing) elDoing.textContent = String(doing);
                    if(elOverdue) elOverdue.textContent = String(overdue);
                    if(elPending) elPending.textContent = String(pending);
                    var elTotal = document.getElementById('stat-total');
                    if(elTotal) elTotal.textContent = String(done + doing + overdue + pending);
                    updatePieFromStats();
                  }).catch(function(){});
                }catch(_){}
              }
              updatePieFromWbs();
              window.addEventListener('project:wbs:updated', function(){ updatePieFromWbs(); });

              function fmt(numStr){
                var s = String(numStr||'').replace(/[^0-9]/g,'');
                if(!s) return '';
                return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
              }
              function parseISO(s){ try{ if(!s) return null; var d=new Date(s); return isNaN(d.getTime())?null:d; }catch(_){ return null; } }
              function monthKey(d){ return d.getFullYear()+ '-' + String(d.getMonth()+1).padStart(2,'0'); }
              function monthLabel(d){ return d.getFullYear()+ '-' + String(d.getMonth()+1).padStart(2,'0'); }
              function monthsBetween(start,end){
                var out=[]; if(!start||!end) return out; var y=start.getFullYear(), m=start.getMonth();
                var cur=new Date(y,m,1); var last=new Date(end.getFullYear(), end.getMonth(), 1);
                while(cur<=last){ out.push(new Date(cur.getFullYear(), cur.getMonth(), 1)); cur.setMonth(cur.getMonth()+1); }
                return out;
              }
              function distribute(total, bins){
                // Spread total across bins with slight variance, sum preserved
                if(bins<=0){ return []; }
                var base=Math.floor(total/bins), rem= total - base*bins; var arr=new Array(bins).fill(base);
                for(var i=0;i<rem;i++){ arr[i%bins]++; }
                // add small oscillation for shape
                for(var j=0;j<arr.length;j++){ var tweak = (j%2===0 && arr[j]>0) ? 0 : 0; arr[j]+=tweak; }
                return arr;
              }
              function getOrCreateTooltip(){
                var tip = document.getElementById('prog-chart-tooltip');
                if(!tip){
                  tip = document.createElement('div');
                  tip.id = 'prog-chart-tooltip';
                  tip.className = 'chart-tooltip';
                  document.body.appendChild(tip);
                }
                return tip;
              }
              function hideTooltip(){ try{ var t=document.getElementById('prog-chart-tooltip'); if(t){ t.classList.remove('show'); } }catch(_){ } }
              function showTooltip(e, label, cat, value, color){
                try{
                  var tip = getOrCreateTooltip();
                  tip.innerHTML = '<span class="tip-dot" style="background:'+ (color||'#111') +'"></span>'
                    + (label? (label+' '): '') + cat + ' ' + value + '건';
                  tip.style.left = (e.pageX + 10) + 'px';
                  tip.style.top  = (e.pageY - 8) + 'px';
                  tip.classList.add('show');
                }catch(_){ }
              }
              function renderHBar(series, palette){
                if(!hbar) return;
                hbar.innerHTML='';
                if(!Array.isArray(series) || series.length===0){ return; }
                // Always render ALL months in the series (no trimming to 3/6/9). Fit rows to available height.
                var itemsAll = series.length;
                // Measure available height roughly (pane minus legend and paddings)
                var pane = progBarPane || hbar.parentElement; var paneH = pane ? Math.max(0, pane.getBoundingClientRect().height) : 0;
                var legendH0 = hbarLegend ? Math.max(0, hbarLegend.getBoundingClientRect().height) : 0;
                var paddingV0 = 20;
                var avail0 = Math.max(0, paneH - legendH0 - paddingV0);
                var baseGap = 10, minH=12, maxH=36;
                var pickedRowH = (itemsAll>0) ? Math.floor((avail0 - (itemsAll-1)*baseGap)/itemsAll) : 18;
                if(!(pickedRowH>0) || !isFinite(pickedRowH)) pickedRowH = 18;
                pickedRowH = Math.max(minH, Math.min(maxH, pickedRowH));
                var pickedGap = baseGap;
                // If content still taller than available, allow vertical scroll
                try{
                  var required = itemsAll*pickedRowH + (itemsAll-1)*pickedGap + 8;
                  if(avail0>0 && required > avail0){ hbar.style.overflowY = 'auto'; }
                  else { hbar.style.overflowY = ''; }
                }catch(_s){}
                var max=0; series.forEach(function(p){ if(p.total>max) max=p.total; }); if(max<=0) max=1;
                series.forEach(function(p){
                  var row = document.createElement('div'); row.className='bar-item';
                  // label cell
                  var lab = document.createElement('div'); lab.className='bar-label'; lab.textContent = p.label; row.appendChild(lab);
                  // bar cell
                  var bar = document.createElement('div'); bar.className='bar';
                  // 월별 ‘대표 상태’ 하나만 전체 폭으로 표시 (데이터 건수와 무관)
                  // 우선순위: 지연 > 진행 > 완료 > 대기
                  function dominantCat(v){ if(v.overdue>0) return 'overdue'; if(v.doing>0) return 'doing'; if(v.done>0) return 'done'; return 'pending'; }
                  var cat = dominantCat(p.values);
                  var color = (cat==='overdue')? palette.overdue : (cat==='doing')? palette.doing : (cat==='done')? palette.done : palette.pending;
                  bar.style.setProperty('--w', 100);
                  var span = document.createElement('span'); span.className='stack'; span.style.width = '100%'; span.style.background = color;
                  span.dataset.cat = (cat==='overdue'?'지연':cat==='doing'?'진행':cat==='done'?'완료':'대기');
                  span.dataset.value = String(p.total); span.dataset.label = p.label; span.dataset.color = color;
                  bar.appendChild(span);
                  row.appendChild(bar);
                  hbar.appendChild(row);
                });
                // legend
                if(hbarLegend){
                  hbarLegend.innerHTML = ''+
                    '<li><span class="legend-dot" style="background:'+palette.done+'"></span>완료</li>'+
                    '<li><span class="legend-dot" style="background:'+palette.doing+'"></span>진행</li>'+
                    '<li><span class="legend-dot" style="background:'+palette.overdue+'"></span>지연</li>'+
                    '<li><span class="legend-dot" style="background:'+palette.pending+'"></span>대기</li>';
                }
                // Tooltip via delegation
                try{
                  hbar.addEventListener('mousemove', function(ev){
                    var el = ev.target.closest('.stack');
                    if(!el || !hbar.contains(el)){ hideTooltip(); return; }
                    var lab = el.dataset.label || '';
                    var cat = el.dataset.cat || '';
                    var val = el.dataset.value || '0';
                    var col = el.dataset.color || '';
                    showTooltip(ev, lab, cat, val, col);
                  });
                  hbar.addEventListener('mouseleave', function(){ hideTooltip(); });
                }catch(_){ }
                // Apply chosen row sizing to fill vertical space and reduce bottom whitespace
                try{
                  var items = hbar.querySelectorAll('.bar-item').length || 0;
                  if(items > 0){
                    var chart = hbar; // .bar-chart
                    chart.style.setProperty('--row-h', pickedRowH + 'px');
                    chart.style.setProperty('--row-gap', pickedGap + 'px');
                  }
                }catch(_e){ /* best-effort */ }
              }
              function buildMonthlySeriesFromDom(){
                try{
                  // 프로젝트 시작월 ~ WBS의 마지막 종료월 범위로 월 시리즈 생성
                  function floorMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
                  function sameMonth(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth(); }
                  function monthsBetweenInclusive(a,b){ var out=[]; if(!a||!b) return out; var cur=floorMonth(a), last=floorMonth(b); while(cur<=last){ out.push(new Date(cur)); cur.setMonth(cur.getMonth()+1); } return out; }
                  function normDateStr(s){ return String(s||'').trim().replace(/[.]/g,'-'); }
                  function readCellDate(td){ if(!td) return null; try{ var inp=td.querySelector('input'); var v=inp? inp.value : td.textContent; v=normDateStr(v); var d=parseISO(v); return d; }catch(_){ return null; } }
                  var today = new Date();
                  // 1) WBS에서 작업 모으기
                  // WBS 읽기
                  var table = document.getElementById('wbs-spec-table');
                  var tbody = table && table.querySelector('tbody');
                  var trs = tbody ? Array.from(tbody.querySelectorAll('tr')) : [];
                  var tasks = [];
                  trs.forEach(function(tr){
                    try{
                      var tdRes = tr.querySelector('td[data-col="result"]');
                      var val='';
                      if(tdRes){ var sel=tdRes.querySelector('select'); val = sel? String(sel.value||'').trim() : String((tdRes.textContent||'').trim()); }
                      var sd = readCellDate(tr.querySelector('td[data-col="start"]'));
                      var ed = readCellDate(tr.querySelector('td[data-col="end"]'));
                      if(!sd && ed) sd = new Date(ed.getFullYear(), ed.getMonth(), 1);
                      if(sd){ tasks.push({ status: val||'대기', start: floorMonth(sd), end: ed? floorMonth(ed): null }); }
                    }catch(_row){}
                  });
                  if(tasks.length===0){ return []; }
                  // 2) 프로젝트 시작일(#ov-start)이 있으면 그 월을 시작 경계로 사용
                  var _ovStartEl = document.getElementById('ov-start');
                  var ovStartTxt = (_ovStartEl && _ovStartEl.textContent) ? _ovStartEl.textContent.trim() : '';
                  var ovStart = ovStartTxt ? parseISO(normDateStr(ovStartTxt)) : null;
                  var minStart = tasks.reduce(function(a,t){ return a && a< t.start ? a : t.start; }, tasks[0].start);
                  if(ovStart){ var o = floorMonth(ovStart); if(o < minStart) minStart = o; }
                  // 3) 마지막 종료월: 각 작업의 종료월(없으면 시작월) 중 최댓값
                  var maxEnd = tasks.reduce(function(a,t){ var e=t.end||t.start; return a && a> e ? a : e; }, tasks[0].end||tasks[0].start);
                  var windowStart = floorMonth(minStart);
                  var windowEnd = floorMonth(maxEnd);
                  var months = monthsBetweenInclusive(windowStart, windowEnd);
                  var series = months.map(function(m){ return { key: monthKey(m), label: monthLabel(m), values:{done:0,doing:0,overdue:0,pending:0}, total:0 }; });
                  function findMonthIndex(d){ var mk = monthKey(floorMonth(d)); for(var i=0;i<series.length;i++){ if(series[i].key===mk) return i; } return -1; }
                  // 분류 함수: 각 월마다 작업 상태를 스냅샷
                  function classifyForMonth(t, m){
                    var sM = t.start; var eM = t.end; var lastM = windowEnd;
                    if(t.status==='완료'){
                      if(eM && sameMonth(eM, m)) return 'done';
                      if(m >= sM && (!eM || m < eM) && m <= lastM) return 'doing';
                      return null;
                    }else if(t.status==='진행'){
                      var until = eM && eM < lastM ? eM : lastM;
                      if(m >= sM && m <= until) return 'doing';
                      return null;
                    }else if(t.status==='지연'){
                      if(eM){
                        if(m >= sM && m < eM && m <= lastM) return 'doing';
                        if(m >= eM && m <= lastM) return 'overdue';
                      }else{
                        if(m >= sM && m <= lastM) return 'overdue';
                      }
                      return null;
                    }else{ // 대기 및 기타
                      if(sameMonth(sM, m)) return 'pending';
                      return null;
                    }
                  }
                  months.forEach(function(m){
                    tasks.forEach(function(t){
                      var cat = classifyForMonth(t, m);
                      if(!cat) return;
                      var idx = findMonthIndex(m); if(idx<0) return;
                      series[idx].values[cat]++;
                    });
                  });
                  series.forEach(function(p){ p.total = p.values.done + p.values.doing + p.values.overdue + p.values.pending; });
                  var any = series.some(function(p){ return p.total>0; });
                  return any ? series : [];
                }catch(_){ return []; }
              }
              function setChartMode(mode){
                chartMode = (mode==='bar') ? 'bar' : 'pie';
                var isBar = chartMode==='bar';
                if(progPiePane) progPiePane.hidden = isBar;
                if(progBarPane) progBarPane.hidden = !isBar;
                if(progToggle){ progToggle.setAttribute('aria-pressed', String(isBar)); progToggle.title = isBar? '원형으로 보기':'통계 보기'; progToggle.setAttribute('aria-label', progToggle.title); }
                if(isBar){
                  // Palette reuse from pie
                  var pie = document.getElementById('box2-pie');
                  var accent = '#6366f1', cDoing='#0ea5e9', cPending='#94a3b8', cOverdue='#ef4444';
                  try{
                    var fabBtn = document.getElementById('project-edit-fab');
                    if(fabBtn){ var cs = window.getComputedStyle(fabBtn); if(cs && cs.backgroundColor){ accent = cs.backgroundColor; } }
                    var pieStyles = window.getComputedStyle(pie);
                    if(pieStyles){
                      var v;
                      v = (pieStyles.getPropertyValue('--pie-doing')||'').trim(); if(v) cDoing = v;
                      v = (pieStyles.getPropertyValue('--pie-pending')||'').trim(); if(v) cPending = v;
                      v = (pieStyles.getPropertyValue('--pie-overdue')||'').trim(); if(v) cOverdue = v;
                    }
                  }catch(e){}
                  var palette = { done: accent, doing: cDoing, overdue: cOverdue, pending: cPending };
                  renderHBar(buildMonthlySeriesFromDom(), palette);
                }
              }
              // Recompute bar sizing on resize (if bar mode active)
              try{
                window.addEventListener('resize', function(){
                  if(chartMode==='bar'){
                    var pie = document.getElementById('box2-pie');
                    var accent = '#6366f1', cDoing='#0ea5e9', cPending='#94a3b8', cOverdue='#ef4444';
                    try{
                      var fabBtn = document.getElementById('project-edit-fab');
                      if(fabBtn){ var cs = window.getComputedStyle(fabBtn); if(cs && cs.backgroundColor){ accent = cs.backgroundColor; } }
                      var pieStyles = window.getComputedStyle(pie);
                      if(pieStyles){
                        var v;
                        v = (pieStyles.getPropertyValue('--pie-doing')||'').trim(); if(v) cDoing = v;
                        v = (pieStyles.getPropertyValue('--pie-pending')||'').trim(); if(v) cPending = v;
                        v = (pieStyles.getPropertyValue('--pie-overdue')||'').trim(); if(v) cOverdue = v;
                      }
                    }catch(e){}
                    renderHBar(buildMonthlySeriesFromDom(), { done: accent, doing: cDoing, overdue: cOverdue, pending: cPending });
                  }
                });
              }catch(_){ }
              if(progToggle){ progToggle.addEventListener('click', function(){ setChartMode(chartMode==='pie' ? 'bar' : 'pie'); }); }
              // Keep HBar in sync with WBS changes as well
              try{
                var reRenderBar = function(){
                  if(chartMode!=='bar') return;
                  var pie = document.getElementById('box2-pie');
                  var accent = '#6366f1', cDoing='#0ea5e9', cPending='#94a3b8', cOverdue='#ef4444';
                  try{
                    var fabBtn = document.getElementById('project-edit-fab');
                    if(fabBtn){ var cs = window.getComputedStyle(fabBtn); if(cs && cs.backgroundColor){ accent = cs.backgroundColor; } }
                    var pieStyles = window.getComputedStyle(pie);
                    if(pieStyles){
                      var v;
                      v = (pieStyles.getPropertyValue('--pie-doing')||'').trim(); if(v) cDoing = v;
                      v = (pieStyles.getPropertyValue('--pie-pending')||'').trim(); if(v) cPending = v;
                      v = (pieStyles.getPropertyValue('--pie-overdue')||'').trim(); if(v) cOverdue = v;
                    }
                  }catch(e){}
                  renderHBar(buildMonthlySeriesFromDom(), { done: accent, doing: cDoing, overdue: cOverdue, pending: cPending });
                };
                window.addEventListener('project:wbs:updated', reRenderBar);
                window.addEventListener('storage', function(e){ if(e && e.key==='project:wbs:data') reRenderBar(); });
              }catch(_sync){ }
              function collect(){
                var form = document.getElementById('system-edit-form');
                if(!form) return null;
                function q(n){ return form.querySelector('[name="'+n+'"]'); }
                function digitsOnly(v){ return String(v||'').replace(/[^0-9]/g,''); }
                function parseIntOrNull(v){ var n=parseInt(String(v||'').trim(),10); return (!isNaN(n) && isFinite(n)) ? n : null; }
                function parseBudgetToInt(v){
                  var s = digitsOnly(v);
                  if(!s) return null;
                  try{ return parseInt(s, 10); }catch(_){ return null; }
                }
                function parsePercentToInt(v){
                  var s = digitsOnly(v);
                  if(!s) return null;
                  var n = parseInt(s, 10);
                  if(isNaN(n) || !isFinite(n)) return null;
                  return Math.max(0, Math.min(100, n));
                }
                return {
                  project_name: (q('project_name') && q('project_name').value) || '',
                  status: (q('status') && q('status').value) || '',
                  description: (q('description') && q('description').value) || '',
                  project_type: (q('project_type') && q('project_type').value) || '',
                  owner_dept: (q('owner_dept') && q('owner_dept').value) || '',
                  owner: (q('owner') && q('owner').value) || '',
                  priority: (q('priority') && q('priority').value) || '',
                  participants: (q('participants') && q('participants').value) || '',
                  start_date: (q('start_date') && q('start_date').value) || '',
                  expected_end_date: (q('end_date') && q('end_date').value) || '',
                  budget_amount: parseBudgetToInt((q('budget') && q('budget').value) || ''),
                  task_count_cached: parseIntOrNull((q('task_count') && q('task_count').value) || ''),
                  progress_percent: parsePercentToInt((q('progress') && q('progress').value) || '')
                };
              }

              function normalizeProject(d){
                d = d || {};
                // API item keys
                var out = {
                  id: d.id,
                  project_name: d.project_name || d.projectName || '',
                  status: d.status || '',
                  description: d.description || '',
                  project_type: d.project_type || d.projectType || d.project_type_name || '',
                  owner_dept: d.owner_dept_name || d.ownerDeptName || d.owner_dept || d.ownerDept || d.department || '',
                  owner: d.manager_name || d.managerName || d.owner || '',
                  priority: d.priority || '',
                  participants: d.participants || '',
                  start_date: d.start_date || d.startDate || '',
                  expected_end_date: d.expected_end_date || d.expectedEndDate || d.end_date || d.endDate || d.expected_end || '',
                  budget_amount: (d.budget_amount != null ? d.budget_amount : (d.budgetAmount != null ? d.budgetAmount : d.budget)),
                  task_count_cached: (d.task_count_cached != null ? d.task_count_cached : (d.taskCountCached != null ? d.taskCountCached : d.task_count)),
                  progress_percent: (d.progress_percent != null ? d.progress_percent : (d.progressPercent != null ? d.progressPercent : d.progress)),
                  gorf_goal: d.gorf_goal || '',
                  gorf_organization: d.gorf_organization || '',
                  gorf_research: d.gorf_research || '',
                  gorf_finance: d.gorf_finance || '',
                  project_number: d.project_number || d.projectNumber || '',
                  schedule_progress_rate: (d.schedule_progress_rate != null ? d.schedule_progress_rate : (d.scheduleProgressRate != null ? d.scheduleProgressRate : null)),
                  created_by_name: d.created_by_name || '',
                  created_by_company: d.created_by_company || '',
                  created_by_dept: d.created_by_dept || '',
                  created_by_nickname: d.created_by_nickname || '',
                  manager_company: d.manager_company || '',
                  manager_dept: d.manager_dept || '',
                  manager_nickname: d.manager_nickname || ''
                };
                return out;
              }

              function applyFormFromProject(d){
                var form = document.getElementById('system-edit-form');
                if(!form) return;
                d = normalizeProject(d);
                function setVal(name, val){
                  try{
                    var el = form.querySelector('[name="'+name+'"]');
                    if(!el) return;
                    el.value = (val == null ? '' : String(val));
                  }catch(_){ }
                }
                setVal('project_name', d.project_name || '');
                setVal('project_type', d.project_type || '');
                setVal('owner_dept', d.owner_dept || '');
                setVal('owner', d.owner || '');
                setVal('priority', d.priority || '');
                setVal('participants', d.participants || '');
                setVal('description', d.description || '');
                setVal('status', d.status || '');
                setVal('budget', (d.budget_amount == null ? '' : fmt(d.budget_amount)));
                setVal('start_date', d.start_date || '');
                setVal('end_date', d.expected_end_date || '');
                setVal('task_count', (d.task_count_cached == null ? '' : d.task_count_cached));
                setVal('progress', (d.progress_percent == null ? '' : (String(d.progress_percent) + '%')));
              }

              /* ── 동적 수정 폼 빌더 (등록 모달과 100% 동일 레이아웃) ──────── */
              var DETAIL_META = {
                project_name:{label:'프로젝트 이름'},
                project_type:{label:'유형'},
                owner_dept:{label:'담당부서'},
                owner:{label:'담당자'},
                priority:{label:'우선순위'},
                participants:{label:'참여자'},
                description:{label:'설명'},
                status:{label:'상태'},
                budget:{label:'예산'},
                start_date:{label:'시작일'},
                end_date:{label:'(예상)종료일'},
                task_count:{label:'작업수'},
                progress:{label:'진행률(%)'}
              };
              var DETAIL_GROUPS = [
                { title:'기본 정보', cols:['project_name','project_type','owner_dept','owner','priority','participants','description'] },
                { title:'진행/일정', cols:['status','budget','start_date','end_date','task_count','progress'] }
              ];
              var DETAIL_REQUIRED = { status:1, project_type:1, project_name:1, owner_dept:1, owner:1 };
              var DETAIL_HIDDEN = [];

              function _esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

              /* ── Flatpickr lazy-loader (담당 프로젝트 동일) ── */
              var __prjFpVer='4.6.13';
              var __prjFpBase='/static/vendor/flatpickr/'+__prjFpVer;
              var __prjFpPromise=null;
              function __prjEnsureCss(href,id){ try{ if(id && document.getElementById(id)) return; var l=document.createElement('link'); l.rel='stylesheet'; l.href=href; if(id) l.id=id; document.head.appendChild(l); }catch(_){} }
              function __prjLoadScript(src){ return new Promise(function(res,rej){ try{ var s=document.createElement('script'); s.src=src; s.async=true; s.onload=function(){res(true);}; s.onerror=function(){rej(new Error('FAILED '+src));}; document.head.appendChild(s); }catch(e){rej(e);} }); }
              function __prjEnsureFlatpickr(){
                __prjEnsureCss(__prjFpBase+'/flatpickr.min.css','flatpickr-css');
                __prjEnsureCss(__prjFpBase+'/themes/airbnb.css','flatpickr-theme-css');
                if(window.flatpickr) return Promise.resolve();
                if(__prjFpPromise) return __prjFpPromise;
                __prjFpPromise=__prjLoadScript(__prjFpBase+'/flatpickr.min.js').then(function(){ return __prjLoadScript(__prjFpBase+'/l10n/ko.js').catch(function(){return null;}); }).catch(function(e){__prjFpPromise=null;throw e;});
                return __prjFpPromise;
              }
              function __prjEnsureTodayBtn(fp){ try{ var cal=fp&&fp.calendarContainer; if(!cal) return; if(cal.querySelector('.fp-today-btn')) return; var btn=document.createElement('button'); btn.type='button'; btn.className='fp-today-btn'; btn.textContent='\uc624\ub298'; btn.addEventListener('click',function(){ fp.setDate(new Date(),true); }); cal.appendChild(btn); }catch(_){} }
              function initPrjEditDatePickers(scope){
                var els=scope.querySelectorAll('input.date-input');
                if(!els.length) return;
                __prjEnsureFlatpickr().then(function(){
                  if(!window.flatpickr) return;
                  var koLocale=(window.flatpickr.l10ns&&window.flatpickr.l10ns.ko)?window.flatpickr.l10ns.ko:'ko';
                  els.forEach(function(el){
                    if(el._flatpickr) return;
                    window.flatpickr(el,{ dateFormat:'Y-m-d', allowInput:true, disableMobile:true, clickOpens:true, appendTo:document.body, locale:koLocale, onReady:function(_s,_d,inst){__prjEnsureTodayBtn(inst);}, onOpen:function(_s,_d,inst){__prjEnsureTodayBtn(inst);} });
                  });
                }).catch(function(){});
              }

              function generateDetailInput(col, value){
                var v = (value == null ? '' : String(value));
                if(col === 'status'){
                  return '<select name="status" class="form-input search-select" data-searchable="true" data-placeholder="선택" required>'
                    + '<option value="">선택</option>'
                    + '<option value="예정"' + (v==='예정'?' selected':'') + '>예정</option>'
                    + '<option value="진행"' + (v==='진행'?' selected':'') + '>진행</option>'
                    + '<option value="완료"' + (v==='완료'?' selected':'') + '>완료</option>'
                    + '<option value="보류"' + (v==='보류'?' selected':'') + '>보류</option>'
                    + '</select>';
                }
                if(col === 'project_type'){
                  return '<select name="project_type" class="form-input search-select" data-searchable="true" data-placeholder="선택" required>'
                    + '<option value="">선택</option>'
                    + '<option value="신규 구축"' + (v==='신규 구축'?' selected':'') + '>신규 구축</option>'
                    + '<option value="개선/고도화"' + (v==='개선/고도화'?' selected':'') + '>개선/고도화</option>'
                    + '<option value="유지보수"' + (v==='유지보수'?' selected':'') + '>유지보수</option>'
                    + '<option value="운영지원"' + (v==='운영지원'?' selected':'') + '>운영지원</option>'
                    + '</select>';
                }
                if(col === 'priority'){
                  return '<select name="priority" class="form-input search-select" data-searchable="true" data-placeholder="선택">'
                    + '<option value="">선택</option>'
                    + '<option value="긴급"' + (v==='긴급'?' selected':'') + '>긴급</option>'
                    + '<option value="일반"' + (v==='일반'?' selected':'') + '>일반</option>'
                    + '<option value="낮음"' + (v==='낮음'?' selected':'') + '>낮음</option>'
                    + '</select>';
                }
                if(col === 'description'){
                  return '<textarea name="description" class="form-input textarea-large" placeholder="설명">' + _esc(v) + '</textarea>';
                }
                if(col === 'budget'){
                  var fmtVal = (v === '' || v === 'null') ? '' : fmt(v);
                  return '<input name="budget" type="text" inputmode="numeric" pattern="[0-9,]*" class="form-input" value="' + _esc(fmtVal) + '" placeholder="숫자">';
                }
                if(col === 'participants'){
                  return '<input name="participants" class="form-input locked-field" placeholder=",로 구분" value="' + _esc(v) + '" disabled>';
                }
                if(col === 'start_date' || col === 'end_date'){
                  return '<input name="' + col + '" class="form-input date-input" placeholder="YYYY-MM-DD" value="' + _esc(v) + '" readonly>';
                }
                if(col === 'task_count'){
                  return '<input name="task_count" type="number" class="form-input locked-field" value="' + _esc(v) + '" placeholder="-" disabled>';
                }
                if(col === 'progress'){
                  var pv = v ? (v.toString().endsWith('%') ? v : v + '%') : '';
                  return '<input name="progress" type="text" class="form-input locked-field" value="' + _esc(pv) + '" placeholder="-" disabled>';
                }
                var req = DETAIL_REQUIRED[col] ? ' required' : '';
                return '<input name="' + col + '" class="form-input" placeholder="입력" value="' + _esc(v) + '"' + req + '>';
              }

              function fillEditFormDetail(rawData){
                var form = document.getElementById('system-edit-form');
                if(!form) return;
                var d = normalizeProject(rawData);
                form.innerHTML = '';
                var values = {
                  project_name: d.project_name || '',
                  project_type: d.project_type || '',
                  priority: d.priority || '',
                  description: d.description || '',
                  status: d.status || '',
                  budget: (d.budget_amount == null ? '' : d.budget_amount),
                  start_date: d.start_date || '',
                  end_date: d.expected_end_date || '',
                  owner_dept: d.owner_dept || '',
                  owner: d.owner || '',
                  participants: d.participants || '',
                  task_count: (d.task_count_cached == null ? '' : d.task_count_cached),
                  progress: (d.progress_percent == null ? '' : d.progress_percent)
                };
                /* ── 수정 모달: 담당부서/담당자/참여자/작업수/진행률 숨김, 상태 검색드롭 ── */
                form.innerHTML = ''
                  /* ── 기본 정보 섹션 ── */
                  + '<div class="form-section">'
                  +   '<div class="section-header"><h4>기본 정보</h4></div>'
                  +   '<div class="form-grid">'
                  +     '<div class="form-row form-row-wide"><label>프로젝트 이름<span class="required">*</span></label>'
                  +       '<input name="project_name" class="form-input" placeholder="이름" value="' + _esc(values.project_name) + '" required></div>'
                  +     '<div class="form-row"><label>유형<span class="required">*</span></label>'
                  +       generateDetailInput('project_type', values.project_type) + '</div>'
                  +     '<div class="form-row"><label>우선순위</label>'
                  +       generateDetailInput('priority', values.priority) + '</div>'
                  +     '<div class="form-row form-row-wide"><label>설명</label>'
                  +       '<textarea name="description" class="form-input textarea-large" placeholder="설명">' + _esc(values.description) + '</textarea></div>'
                  +   '</div>'
                  + '</div>'
                  /* ── 진행/일정 섹션 ── */
                  + '<div class="form-section">'
                  +   '<div class="section-header"><h4>진행/일정</h4></div>'
                  +   '<div class="form-grid">'
                  +     '<div class="form-row"><label>상태<span class="required">*</span></label>'
                  +       generateDetailInput('status', values.status) + '</div>'
                  +     '<div class="form-row"><label>예산</label>'
                  +       generateDetailInput('budget', values.budget) + '</div>'
                  +     '<div class="form-row"><label>시작일</label>'
                  +       '<input name="start_date" class="form-input date-input" placeholder="YYYY-MM-DD" value="' + _esc(values.start_date) + '" readonly></div>'
                  +     '<div class="form-row"><label>(예상)종료일</label>'
                  +       '<input name="end_date" class="form-input date-input" placeholder="YYYY-MM-DD" value="' + _esc(values.end_date) + '" readonly></div>'
                  +   '</div>'
                  + '</div>'
                  + '<input type="hidden" name="owner_dept" value="' + _esc(values.owner_dept) + '">'
                  + '<input type="hidden" name="owner" value="' + _esc(values.owner) + '">'
                  + '<input type="hidden" name="participants" value="' + _esc(values.participants) + '">'
                  + '<input type="hidden" name="task_count" value="' + _esc(values.task_count) + '">'
                  + '<input type="hidden" name="progress" value="' + _esc(values.progress ? (String(values.progress).endsWith('%') ? values.progress : values.progress + '%') : '') + '">';
                /* search-select 및 date-picker 초기화 */
                try{ if(window.BlossomSearchableSelect && window.BlossomSearchableSelect.enhance){ window.BlossomSearchableSelect.enhance(form); } }catch(_ss){}
                try{ initPrjEditDatePickers(form); }catch(_dp){}
                /* 예산 입력 시 실시간 3자리 콤마 */
                try{
                  var _bgi=form.querySelector('input[name="budget"]');
                  if(_bgi) _bgi.addEventListener('input',function(){
                    var c=this.selectionStart, raw=this.value.replace(/[^0-9]/g,'');
                    if(!raw){ this.value=''; return; }
                    var formatted=Number(raw).toLocaleString();
                    var diff=formatted.length-this.value.length;
                    this.value=formatted;
                    this.setSelectionRange(c+diff,c+diff);
                  });
                }catch(_bg){}
              }

              function formatParticipantSummary(names){
                try{
                  var arr = Array.isArray(names) ? names.map(function(s){ return String(s||'').trim(); }).filter(Boolean) : [];
                  if(arr.length === 0) return '-';
                  if(arr.length === 1) return arr[0];
                  return arr[0] + ' 외 ' + (arr.length - 1) + '명';
                }catch(_){ return '-'; }
              }

              function pickStakeholderNamesFromPayload(payload){
                try{
                  /* Handle both formats: {rows:[...]} (blsMakeTabCrud) and {stakeholder:{rows:[...]}} (legacy) */
                  var rows = null;
                  if(payload && Array.isArray(payload.rows)) rows = payload.rows;
                  else if(payload && payload.stakeholder && Array.isArray(payload.stakeholder.rows)) rows = payload.stakeholder.rows;
                  if(!Array.isArray(rows)) return [];
                  return rows.map(function(r){ return String((r && r.name) || '').trim(); }).filter(Boolean);
                }catch(_){ return []; }
              }

              async function updateMembersFromStakeholderTab(ownerName){
                var memEl = document.getElementById('ov-members');
                if(!memEl) return;
                var client = null;
                try{ client = blsGetPrjTabClient(); }catch(_){ client = null; }
                if(!client) return;
                try{
                  var item = await client.loadLatest('stakeholder');
                  if(!item || !item.payload) return;
                  var names = pickStakeholderNamesFromPayload(item.payload);
                  memEl.textContent = names.length > 0 ? names.length + '\uba85' : '-';
                }catch(_e){ }
              }

              function applyView(d){
                if(!d) return;
                d = normalizeProject(d);
                var t = document.getElementById('project-title'); if(t) t.textContent = d.project_name || '-';
                var st = document.getElementById('project-status');
                if(st){
                  var sVal = (d.status || '').trim() || '-';
                  // If status chip structure exists, update inner text and dot color
                  var sText = st.querySelector('.status-text');
                  var sDot = st.querySelector('.status-dot');
                  if(sText){ sText.textContent = sVal; }
                  // Map status to dot class for visual parity with list page
                  if(sDot){
                    sDot.classList.remove('ws-run','ws-idle','ws-wait');
                    var cls = 'ws-wait';
                    if(sVal === '진행') cls = 'ws-run';
                    else if(sVal === '완료') cls = 'ws-idle';
                    else if(sVal === '예정' || sVal === '보류') cls = 'ws-wait';
                    sDot.classList.add(cls);
                  }
                  // Fallback: if no inner structure, set textContent directly
                  if(!sText){ st.textContent = sVal; }
                  // Keep aria-label current for accessibility
                  try{ st.setAttribute('aria-label', '상태: ' + sVal); }catch(_){ }
                }
                function getDescPreview(text){
                  try{
                    var s = String(text||'').replace(/\r\n?/g,'\n');
                    var lines = s.split('\n');
                    for(var i=0;i<lines.length;i++){
                      var ln = lines[i].trim();
                      if(!ln) continue;
                      var m = /^\s*(?:[*\-]|※)\s*(.+)$/.exec(ln);
                      if(m) return m[1].trim();
                      return ln; // first non-empty plain line
                    }
                    return '';
                  }catch(_){ return String(text||''); }
                }
                var desc = document.getElementById('project-desc'); if(desc) desc.textContent = getDescPreview(d.description);
                var owner = document.getElementById('ov-owner'); if(owner) owner.textContent = (d.owner || '-');
                var mem = document.getElementById('ov-members'); if(mem){
                  // Show stakeholder count
                  var ownerName = String(d.owner||'').trim();
                  mem.textContent = '-';
                  // Async override from stakeholder tab payload
                  updateMembersFromStakeholderTab(ownerName);
                }
                var sdt = document.getElementById('ov-start'); if(sdt) sdt.textContent = d.start_date || '-';
                var edt = document.getElementById('ov-end'); if(edt) edt.textContent = d.expected_end_date || '-';
                var bd = document.getElementById('ov-budget'); if(bd){
                  var v = fmt(d.budget_amount);
                  bd.textContent = v? (v + '원') : '-';
                }
                // 일정 진행률 표시
                var prog = document.getElementById('ov-progress');
                if(prog){
                  var spr = d.schedule_progress_rate;
                  if(spr != null && spr !== ''){
                    prog.textContent = spr + '%';
                  } else {
                    prog.textContent = '-';
                  }
                }
                // 프로젝트 번호 표시
                var pn = document.getElementById('ov-project-number');
                if(pn){
                  pn.textContent = d.project_number || '-';
                }
                var typ = document.getElementById('ov-type'); if(typ) typ.textContent = (d.project_type||'-') || '-';
                var dep = document.getElementById('ov-dept'); if(dep) dep.textContent = (d.owner_dept||'-') || '-';
                var pri = document.getElementById('ov-priority');
                if(pri){
                  var pVal = (d.priority||'').trim();
                  if(!pVal){ pVal = '-'; }
                  if(pVal !== '-'){
                    var pCls = 'pri-일반';
                    if(pVal === '긴급') pCls = 'pri-긴급';
                    else if(pVal === '낮음') pCls = 'pri-낮음';
                    else if(pVal === '일반') pCls = 'pri-일반';
                    pri.innerHTML = '<span class="priority-dot '+pCls+'" aria-hidden="true"></span><span class="priority-text">'+pVal+'</span>';
                  } else {
                    pri.textContent = '-';
                  }
                  try{ pri.setAttribute('aria-label', '우선순위: ' + pVal); }catch(_e){}
                }
                // GORFはモーダルではなくインライン編集
                // If bar mode is active, update bars after view values change
                if(chartMode==='bar'){
                  try{
                    var pie = document.getElementById('box2-pie');
                    var accent = '#6366f1', cDoing='#0ea5e9', cPending='#94a3b8', cOverdue='#ef4444';
                    try{
                      var fabBtn = document.getElementById('project-edit-fab');
                      if(fabBtn){ var cs = window.getComputedStyle(fabBtn); if(cs && cs.backgroundColor){ accent = cs.backgroundColor; } }
                      var pieStyles = window.getComputedStyle(pie);
                      if(pieStyles){
                        var v;
                        v = (pieStyles.getPropertyValue('--pie-doing')||'').trim(); if(v) cDoing = v;
                        v = (pieStyles.getPropertyValue('--pie-pending')||'').trim(); if(v) cPending = v;
                        v = (pieStyles.getPropertyValue('--pie-overdue')||'').trim(); if(v) cOverdue = v;
                      }
                    }catch(e){}
                    renderHBar(buildMonthlySeriesFromDom(), { done: accent, doing: cDoing, overdue: cOverdue, pending: cPending });
                  }catch(_e){}
                }
                // GORF: populate from API response
                try{
                  var gorfFields = [
                    { key: 'gorf_goal', viewId: 'ov-goal' },
                    { key: 'gorf_organization', viewId: 'ov-organization' },
                    { key: 'gorf_research', viewId: 'ov-research' },
                    { key: 'gorf_finance', viewId: 'ov-finance' }
                  ];
                  gorfFields.forEach(function(gf){
                    var el = document.getElementById(gf.viewId);
                    if(!el) return;
                    var raw = d[gf.key] || '';
                    if(raw){
                      try{ el.dataset.raw = raw; }catch(_d){}
                      el.textContent = raw;
                      el.classList.add('has-data');
                    }
                  });
                }catch(_gorf){}
              }
              function sync(){ try{ applyView(collect()); }catch(_){ /* no-op */ } }

              function clearProjectLoadingMask(){
                try{
                  if(document && document.body){ document.body.classList.remove('prj-loading'); }
                }catch(_){ }
              }

              async function resolveDeptIdByName(deptName){
                var name = String(deptName||'').trim();
                if(!name) return null;
                var res = await blsFetchJson('/api/org-departments?q=' + encodeURIComponent(name));
                if(!res.ok || !res.data || !res.data.success) return null;
                var items = Array.isArray(res.data.items) ? res.data.items : [];
                if(!items.length) return null;
                function itemName(it){
                  return String((it && (it.dept_name || it.deptName || it.dept || it.name)) || '').trim();
                }
                var exact = items.find(function(it){ return itemName(it) === name; });
                var picked = exact || items[0];
                return picked && picked.id ? parseInt(picked.id, 10) : null;
              }

              async function resolveUserIdByName(userName, deptName){
                var name = String(userName||'').trim();
                if(!name) return null;
                var res = await blsFetchJson('/api/user-profiles?q=' + encodeURIComponent(name) + '&limit=50');
                if(!res.ok || !res.data || !res.data.success) return null;
                var items = Array.isArray(res.data.items) ? res.data.items : [];
                if(!items.length) return null;
                var dept = String(deptName||'').trim();
                var exact = items.filter(function(it){ return String((it && it.name) || '').trim() === name; });
                var pool = exact.length ? exact : items;
                if(dept){
                  var deptMatch = pool.find(function(it){ return String((it && it.department) || '').trim() === dept; });
                  if(deptMatch && deptMatch.id) return parseInt(deptMatch.id, 10);
                }
                var picked = pool[0];
                return picked && picked.id ? parseInt(picked.id, 10) : null;
              }

              function toast(msg, kind){
                try{ if(typeof showToast === 'function') return showToast(msg, kind||'info'); }catch(_){ }
                try{ alert(msg); }catch(__){ console.warn(msg); }
              }

              async function loadProjectAndRender(){
                var pid = blsGetProjectId();
                if(!pid){
                  sync();
                  clearProjectLoadingMask();
                  return;
                }
                try{
                  var res = await blsFetchJson('/api/prj/projects/' + pid);
                  if(res.status === 401){ toast('로그인이 필요합니다.','warning'); sync(); return; }
                  if(!res.ok || !res.data || !res.data.success || !res.data.item){
                    var msg = (res.data && res.data.message) ? res.data.message : '프로젝트 정보를 불러오지 못했습니다.';
                    console.warn('[prj-detail] API fail:', msg);
                    try{ toast(msg, 'warning'); }catch(_){ }
                    sync();
                    return;
                  }
                  var item = res.data.item;
                  try{ applyFormFromProject(item); }catch(_){ }
                  try{ applyView(item); }catch(_2){ }
                  // 작성자 정보를 글로벌에 저장 (이해관계자 탭에서 사용)
                  // created_by가 없으면 담당자(manager) 정보로 대체
                  try{
                    var _cbName = item.created_by_name || item.manager_name || '';
                    var _cbCompany = item.created_by_company || item.manager_company || '';
                    var _cbDept = item.created_by_dept || item.manager_dept || item.owner_dept_name || '';
                    var _cbNickname = item.created_by_nickname || item.manager_nickname || '';
                    window.__blsProjectCreatedBy = {
                      name: _cbName,
                      company: _cbCompany,
                      dept: _cbDept,
                      nickname: _cbNickname
                    };
                    // 이해관계자 탭 등에 알림 (이벤트 기반)
                    try{ window.dispatchEvent(new CustomEvent('blsProjectCreatorReady')); }catch(_ev){}
                  }catch(_cb){}
                  try{ sessionStorage.setItem('project_selected_row', JSON.stringify(item)); }catch(_3){ }
                } finally {
                  clearProjectLoadingMask();
                }
              }

              function seedFromQueryOrSession(){
                // Replace hardcoded placeholder immediately using querystring/session payload
                try{
                  var seed = null;
                  var sp = new URLSearchParams(location.search || '');
                  var qName = (sp.get('project_name') || sp.get('projectName') || '').trim();
                  var qStatus = (sp.get('status') || '').trim();
                  if(qName || qStatus){
                    seed = {
                      project_name: qName,
                      status: qStatus,
                      description: (sp.get('description') || '').trim(),
                      project_type: (sp.get('project_type') || sp.get('projectType') || '').trim(),
                      owner_dept: (sp.get('owner_dept') || '').trim(),
                      owner: (sp.get('owner') || '').trim(),
                      participants: (sp.get('participants') || '').trim(),
                      priority: (sp.get('priority') || '').trim(),
                      start_date: (sp.get('start_date') || '').trim(),
                      expected_end_date: (sp.get('end_date') || sp.get('expected_end_date') || '').trim(),
                      budget_amount: (sp.get('budget') || '').trim()
                    };
                  }
                  if(!seed){
                    var cached = sessionStorage.getItem('project_selected_row');
                    if(cached){
                      var obj = JSON.parse(cached);
                      if(obj && (obj.project_name || obj.status)){
                        seed = obj;
                      }
                    }
                  }
                  if(seed){
                    try{ applyView(seed); }catch(_a){ console.error('[prj-detail] applyView error', _a); }
                    try{ applyFormFromProject(seed); }catch(_b){ console.error('[prj-detail] applyFormFromProject error', _b); }
                    // 세션에서 복원된 데이터에서도 담당자 정보 설정
                    try{
                      var _sName = seed.created_by_name || seed.manager_name || '';
                      var _sComp = seed.created_by_company || seed.manager_company || '';
                      var _sDept = seed.created_by_dept || seed.manager_dept || seed.owner_dept_name || seed.owner_dept || '';
                      var _sNick = seed.created_by_nickname || seed.manager_nickname || '';
                      if(_sName){
                        window.__blsProjectCreatedBy = { name:_sName, company:_sComp, dept:_sDept, nickname:_sNick };
                      }
                    }catch(_sc){}

                    // Unmask immediately — session data is already applied
                    try{ clearProjectLoadingMask(); }catch(_c){ }
                  } else {
                    console.warn('[prj-detail] seed: NO seed found (no URL params, no sessionStorage)');
                  }
                }catch(_){ console.error('[prj-detail] seedFromQueryOrSession error', _); }
              }
              // --- Description detail modal wiring ---
              function htmlEscape(s){ return String(s||'')
                .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                .replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
              function parseDesc(text){
                var src = String(text||'').replace(/\r\n?/g,'\n');
                var lines = src.split('\n');
                var out = [];
                var i=0;
                function pushPara(buf){ var t = buf.join(' ').trim(); if(t){ out.push('<p>'+htmlEscape(t)+'</p>'); } }
                while(i<lines.length){
                  var ln = lines[i];
                  if(/^\s*$/.test(ln)){ i++; continue; }
                  var mCall = /^\s*※\s*(.+)$/.exec(ln);
                  if(mCall){ out.push('<div class="note-callout"><span class="note-icon" aria-hidden="true">※</span><div class="note-body">'+htmlEscape(mCall[1])+'</div></div>'); i++; continue; }
                  var mBul = /^\s*([*-])\s+(.+)$/.exec(ln);
                  if(mBul){ var items=[]; while(i<lines.length){ var l2=lines[i]; var mm=/^\s*([*-])\s+(.+)$/.exec(l2); if(!mm) break; items.push('<li>'+htmlEscape(mm[2])+'</li>'); i++; } out.push('<ul class="gorf-list">'+items.join('')+'</ul>'); continue; }
                  var buf=[ln]; i++; while(i<lines.length && !/^\s*$/.test(lines[i]) && !/^\s*([*-])\s+/.test(lines[i]) && !/^\s*※\s*/.test(lines[i])){ buf.push(lines[i]); i++; }
                  pushPara(buf);
                }
                if(out.length===0){ out.push('<p>-</p>'); }
                return out.join('');
              }
              function openDescFlyout(){
                if(!descFly || !descBody) return;
                try{
                  var d = collect();
                  var _descEl = document.getElementById('project-desc');
                  var raw = (d && d.description) || (_descEl ? _descEl.textContent : '') || '';
                  descBody.innerHTML = parseDesc(raw);
                }catch(_){ var _dEl = document.getElementById('project-desc'); descBody.textContent = (_dEl ? _dEl.textContent : '') || ''; }
                // show first to measure
                descFly.classList.add('show');
                descFly.removeAttribute('hidden');
                descFly.setAttribute('aria-hidden','false');
                // Positioning to the immediate left of the More button
                try{
                  var btn = moreBtn;
                  var gap = 10;
                  var vw = Math.max(document.documentElement.clientWidth, window.innerWidth||0);
                  var vh = Math.max(document.documentElement.clientHeight, window.innerHeight||0);
                  var rect = btn.getBoundingClientRect();
                  var card = descFly.querySelector('.flyout-card');
                  var desiredW = Math.min(Math.max(Math.floor(vw*0.45), 320), 560);
                  card.style.width = desiredW + 'px';
                  // provisional top based on button top
                  var top = rect.top;
                  var left = rect.left - desiredW - gap;
                  // fallback to right side if not enough space on the left
                  if(left < 8){ left = rect.right + gap; }
                  // clamp horizontally
                  left = Math.max(8, Math.min(left, vw - 8 - desiredW));
                  // after rendering, clamp vertical to viewport and set maxHeight
                  requestAnimationFrame(function(){
                    var ch = card.offsetHeight || 0;
                    var maxH = Math.min(Math.floor(vh*0.68), vh - 16);
                    card.style.maxHeight = maxH + 'px';
                    // try to keep top aligned to button, but ensure inside viewport
                    var maxTop = vh - 8 - Math.min(ch || maxH, maxH);
                    top = Math.max(8, Math.min(top, maxTop));
                    descFly.style.top = top + 'px';
                    descFly.style.left = left + 'px';
                  });
                }catch(_){ /* positioning best-effort */ }
              }
              function closeDescFlyout(){ if(!descFly) return; descFly.classList.remove('show'); descFly.setAttribute('aria-hidden','true'); descFly.setAttribute('hidden',''); }
              function openModal(){
                if(!modal) return;
                modal.setAttribute('aria-hidden','false');
                modal.hidden = false;
                modal.classList.add('show');
                document.body.classList.add('modal-open');
                // GORF 필드는 모달에 없음
                try{ if(window.__blsInitDatePickers){ window.__blsInitDatePickers(modal); } }catch(_e){}
                try{ requestAnimationFrame(function(){ if(window.BlossomSearchableSelect && window.BlossomSearchableSelect.syncAll){ window.BlossomSearchableSelect.syncAll(modal); } }); }catch(_ss){}
              }
              function closeModal(){ if(!modal) return; modal.setAttribute('aria-hidden','true'); modal.hidden=true; modal.classList.remove('show'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } }
              if(fab){ fab.addEventListener('click', function(){
                var data = {};
                try{ var raw = sessionStorage.getItem('project_selected_row'); if(raw) data = JSON.parse(raw); }catch(_){}
                fillEditFormDetail(data);
                openModal();
                try{ var first = document.querySelector('#system-edit-form .form-input'); if(first) first.focus(); }catch(_f){}
              }); window.__prjEditFabBound = true; }
              if(moreBtn){ moreBtn.addEventListener('click', function(e){ e.preventDefault(); openDescFlyout(); }); }
              if(descClose){ descClose.addEventListener('click', closeDescFlyout); }
              document.addEventListener('keydown', function(e){ if(e.key==='Escape' && descFly && !descFly.hasAttribute('hidden')){ closeDescFlyout(); } });
              // Close when clicking outside
              document.addEventListener('click', function(e){
                try{
                  if(!descFly || descFly.hasAttribute('hidden')) return;
                  var card = descFly.querySelector('.flyout-card');
                  if(card.contains(e.target) || (moreBtn && moreBtn.contains(e.target))) return;
                  closeDescFlyout();
                }catch(_){ }
              });

              // Initialize preview on first paint from server-rendered content
              (function initDescPreview(){
                try{
                  var el = document.getElementById('project-desc');
                  if(!el) return;
                  var prev = (function(raw){
                    var s = String(raw||'').replace(/\r\n?/g,'\n');
                    var lines = s.split('\n');
                    for(var i=0;i<lines.length;i++){
                      var ln = lines[i].trim();
                      if(!ln) continue;
                      var m = /^\s*(?:[*\-]|※)\s*(.+)$/.exec(ln);
                      if(m) return m[1].trim();
                      return ln;
                    }
                    return '';
                  })(el.textContent||'');
                  if(prev) el.textContent = prev;
                }catch(_){ }
              })();
              // Inline GORF editing instead of modal
              window.__blsTabInits.overview = function(){
                var section = document.getElementById('gor-section');
                if(!section) return;
                if(window.__blsInitFlags.overview_done) return; window.__blsInitFlags.overview_done = true;
                var ovEditBtn = document.getElementById('overview-edit-btn');
                var grid = (function(){ try{ return section.querySelector('.basic-info-grid.grid-1-1'); }catch(_){ return null; } })();

                function getField(name){ return section.querySelector('[name="'+name+'"]'); }
                function getView(id){ return document.getElementById(id); }
                function getPlaceholder(name){ var el=getField(name); return el? (el.getAttribute('placeholder')||'').trim() : ''; }

                // Lightweight rich-text parser for bullets (*)/(-) and callout (※)
                function htmlEscape(s){ return String(s||'')
                  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                  .replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
                function parseRich(text){
                  var src = String(text||'').replace(/\r\n?/g,'\n');
                  var lines = src.split('\n');
                  var out = [];
                  var i = 0;
                  function emitParagraph(buf){
                    var t = buf.join(' ').trim();
                    if(!t) return;
                    out.push('<p>'+htmlEscape(t)+'</p>');
                  }
                  while(i < lines.length){
                    var line = lines[i];
                    // Skip empty lines but preserve paragraph breaks
                    if(/^\s*$/.test(line)){ i++; continue; }
                    // Callout: lines starting with ※
                    var mCall = /^\s*※\s*(.+)$/.exec(line);
                    if(mCall){
                      out.push('<div class="note-callout"><span class="note-icon" aria-hidden="true">※</span><div class="note-body">'+htmlEscape(mCall[1])+'</div></div>');
                      i++; continue;
                    }
                    // Bulleted list: consecutive lines starting with * or -
                    var mBul = /^\s*([*-])\s+(.+)$/.exec(line);
                    if(mBul){
                      var items = [];
                      while(i < lines.length){
                        var ln = lines[i];
                        var mm = /^\s*([*-])\s+(.+)$/.exec(ln);
                        if(!mm) break;
                        items.push('<li>'+htmlEscape(mm[2])+'</li>');
                        i++;
                      }
                      out.push('<ul class="gorf-list">'+items.join('')+'</ul>');
                      continue;
                    }
                    // Otherwise, collect paragraph until next blank
                    var buf = [line]; i++;
                    while(i < lines.length && !/^\s*$/.test(lines[i]) && !/^\s*([*-])\s+/.test(lines[i]) && !/^\s*※\s*/.test(lines[i])){ buf.push(lines[i]); i++; }
                    emitParagraph(buf);
                  }
                  return out.join('');
                }

                // Equalize GORF pane heights by row pairs: [Goal, Organization], [Research, Finance]
                function equalizeGorfHeights(){
                  try{
                    // If single-column (mobile), reset heights
                    var singleCol = false;
                    try{ singleCol = !!window.matchMedia && window.matchMedia('(max-width: 720px)').matches; }catch(_){ singleCol = false; }
                    var cards = section.querySelectorAll('.basic-info-card');
                    if(!cards || cards.length < 4){ return; }
                    var inEdit = section.classList.contains('is-editing');
                    function paneOf(card){ return card.querySelector(inEdit? '.gorf-edit' : '.gorf-view'); }
                    function reset(el){ if(el){ el.style.minHeight = ''; el.style.height='auto'; } }
                    // pairs: [0,1] and [2,3]
                    var pairs = [ [cards[0], cards[1]], [cards[2], cards[3]] ];
                    pairs.forEach(function(pair){
                      var a = paneOf(pair[0]); var b = paneOf(pair[1]);
                      if(!a || !b) return;
                      // reset before measuring
                      reset(a); reset(b);
                      if(singleCol){ return; }
                      var ha = Math.max(a.scrollHeight||0, a.offsetHeight||0);
                      var hb = Math.max(b.scrollHeight||0, b.offsetHeight||0);
                      var h = Math.max(ha, hb);
                      if(h && isFinite(h)){
                        a.style.minHeight = h + 'px';
                        b.style.minHeight = h + 'px';
                      }
                    });
                  }catch(_){ /* no-op */ }
                }

                function setBtn(mode){
                  if(!ovEditBtn) return;
                  var img = ovEditBtn.querySelector('img');
                  if(mode === 'save'){
                    ovEditBtn.setAttribute('data-action','save');
                    ovEditBtn.title='저장'; ovEditBtn.setAttribute('aria-label','저장');
                    if(img){ img.src='/static/image/svg/save.svg'; img.alt='저장'; }
                  } else {
                    ovEditBtn.setAttribute('data-action','edit');
                    ovEditBtn.title='내용 수정'; ovEditBtn.setAttribute('aria-label','내용 수정');
                    if(img){ img.src='/static/image/svg/list/free-icon-pencil.svg'; img.alt='수정'; }
                  }
                }

                function enterEdit(){
                  section.classList.add('is-editing');
                  // Prefill editors with current view text
                  try{
                    function rawOrText(id){
                      var el = getView(id);
                      if(!el) return '';
                      try{ if(el.dataset && el.dataset.raw){ return String(el.dataset.raw||''); } }catch(_d){}
                      return (el.textContent||'').trim();
                    }
                    var vGoal = rawOrText('ov-goal');
                    var vOrg  = rawOrText('ov-organization');
                    var vRes  = rawOrText('ov-research');
                    var vFin  = rawOrText('ov-finance');
                    var eGoal = getField('gorf_goal');
                    var eOrg  = getField('gorf_organization');
                    var eRes  = getField('gorf_research');
                    var eFin  = getField('gorf_finance');
                    // If view shows default guidance (equals placeholder), keep textarea empty so placeholder is shown
                    var pGoal = getPlaceholder('gorf_goal'); if(eGoal){ eGoal.value = (vGoal && vGoal !== pGoal) ? vGoal : ''; }
                    var pOrg  = getPlaceholder('gorf_organization'); if(eOrg){ eOrg.value  = (vOrg && vOrg !== pOrg) ? vOrg : ''; }
                    var pRes  = getPlaceholder('gorf_research'); if(eRes){ eRes.value = (vRes && vRes !== pRes) ? vRes : ''; }
                    var pFin  = getPlaceholder('gorf_finance'); if(eFin){ eFin.value = (vFin && vFin !== pFin) ? vFin : ''; }
                    // Enable inputs during edit
                    [eGoal,eOrg,eRes,eFin].forEach(function(el){ if(el){ el.disabled = false; } });
                  }catch(_){ }
                  // Focus first
                  try{ setTimeout(function(){ var e=getField('gorf_goal'); if(e){ e.focus(); e.select && e.select(); } }, 30); }catch(_){ }
                  setBtn('save');
                  // After switching visibility, equalize textarea heights
                  try{ setTimeout(equalizeGorfHeights, 30); }catch(_){ }
                }
                function exitEdit(){
                  try{
                    ['gorf_goal','gorf_organization','gorf_research','gorf_finance'].forEach(function(n){ var el=getField(n); if(el){ el.disabled = true; } });
                  }catch(_){ }
                  section.classList.remove('is-editing');
                  setBtn('edit');
                  // Equalize view panes
                  try{ setTimeout(equalizeGorfHeights, 30); }catch(_){ }
                }
                function saveEdit(){
                  try{
                    var eGoal = getField('gorf_goal'); var g = getView('ov-goal');
                    var eOrg  = getField('gorf_organization'); var o = getView('ov-organization');
                    var eRes  = getField('gorf_research'); var r = getView('ov-research');
                    var eFin  = getField('gorf_finance'); var f = getView('ov-finance');
                    var tGoal = (eGoal? eGoal.value.trim() : ''); var pGoal = getPlaceholder('gorf_goal');
                    var tOrg  = (eOrg? eOrg.value.trim() : '');  var pOrg  = getPlaceholder('gorf_organization');
                    var tRes  = (eRes? eRes.value.trim() : '');  var pRes  = getPlaceholder('gorf_research');
                    var tFin  = (eFin? eFin.value.trim() : '');  var pFin  = getPlaceholder('gorf_finance');
                    // Render rich HTML if user entered content; else show placeholder as plain text
                    function apply(viewEl, raw, placeholder){
                      if(!viewEl) return;
                      if(raw){
                        viewEl.innerHTML = parseRich(raw);
                        viewEl.classList.add('rich');
                        try{ viewEl.dataset.raw = raw; }catch(_d){}
                      } else {
                        viewEl.textContent = placeholder;
                        viewEl.classList.remove('rich');
                        try{ delete viewEl.dataset.raw; }catch(_x){}
                      }
                    }
                    apply(g, tGoal, pGoal);
                    apply(o, tOrg,  pOrg);
                    apply(r, tRes,  pRes);
                    apply(f, tFin,  pFin);
                  }catch(_){ }
                  // Persist GORF to server
                  try{
                    var pid = blsGetProjectId();
                    if(pid){
                      var eG2 = getField('gorf_goal'), eO2 = getField('gorf_organization');
                      var eR2 = getField('gorf_research'), eF2 = getField('gorf_finance');
                      blsFetchJson('/api/prj/projects/' + pid, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          gorf_goal: eG2 ? eG2.value.trim() : '',
                          gorf_organization: eO2 ? eO2.value.trim() : '',
                          gorf_research: eR2 ? eR2.value.trim() : '',
                          gorf_finance: eF2 ? eF2.value.trim() : ''
                        })
                      }).then(function(res){
                        if(res.ok && res.data && res.data.success){
                          try{ if(typeof showToast === 'function') showToast('GORF가 저장되었습니다.','success'); }catch(_t){}
                        }
                      }).catch(function(_e){ console.warn('[gorf] save failed', _e); });
                    }
                  }catch(_s){ console.warn('[gorf] save error', _s); }
                  exitEdit();
                }
                if(ovEditBtn){
                  ovEditBtn.addEventListener('click', function(){
                    var mode = ovEditBtn.getAttribute('data-action') || 'edit';
                    if(mode === 'edit'){ enterEdit(); }
                    else { saveEdit(); }
                  });
                }
                // Re-equalize on window resize (debounced)
                (function(){
                  var tid=null; function onResize(){ if(tid) clearTimeout(tid); tid=setTimeout(equalizeGorfHeights, 60); }
                  window.addEventListener('resize', onResize);
                })();
                // Re-equalize while typing to adapt textarea growth
                ;['gorf_goal','gorf_organization','gorf_research','gorf_finance'].forEach(function(n){ var el=getField(n); if(el){ el.addEventListener('input', function(){ try{ equalizeGorfHeights(); }catch(_){ } }); }});
                // Initial equalization after render
                try{ setTimeout(equalizeGorfHeights, 0); }catch(_){ }
                // ESC로 편집 취소 (아이콘은 노출하지 않음)
                document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && section.classList.contains('is-editing')){ exitEdit(); } });
              }; window.__blsTabInits.overview();
              if(closeBtn){ closeBtn.addEventListener('click', closeModal); }
              if(modal){ modal.addEventListener('click', function(e){ if(e.target===modal) closeModal(); }); document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modal && !modal.hidden){ closeModal(); } }); }
              if(saveBtn){
                saveBtn.addEventListener('click', function(){
                  (async function(){
                    var pid = blsGetProjectId();
                    // If project_id is missing, keep legacy client-side sync only.
                    if(!pid){ sync(); closeModal(); return; }
                    var formData = collect();
                    if(!formData){ closeModal(); return; }

                    // Basic validation
                    if(!String(formData.project_name||'').trim()) { toast('프로젝트 이름은 필수입니다.','warning'); return; }
                    if(!String(formData.project_type||'').trim()) { toast('유형은 필수입니다.','warning'); return; }
                    if(!String(formData.status||'').trim()) { toast('상태는 필수입니다.','warning'); return; }

                    var btn = saveBtn;
                    try{ btn.disabled = true; }catch(_){ }
                    try{ btn.classList.add('is-loading'); }catch(_2){ }
                    try{
                      var deptName = String(formData.owner_dept||'').trim();
                      var ownerName = String(formData.owner||'').trim();
                      if(!deptName){ toast('담당부서는 필수입니다.','warning'); return; }
                      if(!ownerName){ toast('담당자는 필수입니다.','warning'); return; }

                      var deptId = await resolveDeptIdByName(deptName);
                      if(!deptId){ toast('담당부서를 찾을 수 없습니다: ' + deptName,'error'); return; }
                      var ownerId = await resolveUserIdByName(ownerName, deptName);
                      if(!ownerId){ toast('담당자를 찾을 수 없습니다: ' + ownerName,'error'); return; }

                      // Resolve participants (MEMBER role) from comma-separated names.
                      // Empty input => clear members.
                      var participantIds = [];
                      try{
                        var raw = String(formData.participants||'').trim();
                        if(raw){
                          var names = raw.split(',').map(function(s){ return String(s||'').trim(); }).filter(Boolean);
                          // de-dupe while preserving order
                          var seen = {}; var uniq = [];
                          names.forEach(function(n){
                            var k = n.toLowerCase();
                            if(!seen[k]){ seen[k] = true; uniq.push(n); }
                          });
                          // remove leader name if included (server also filters by id, but do it early)
                          uniq = uniq.filter(function(n){ return n !== ownerName; });

                          var cache = {};
                          async function resolveOne(n){
                            if(Object.prototype.hasOwnProperty.call(cache, n)) return cache[n];
                            var id = await resolveUserIdByName(n, deptName);
                            cache[n] = id;
                            return id;
                          }

                          for(var i=0;i<uniq.length;i++){
                            var nm = uniq[i];
                            var uid = await resolveOne(nm);
                            if(!uid){ toast('참여자를 찾을 수 없습니다: ' + nm, 'error'); return; }
                            participantIds.push(uid);
                          }
                        }
                      }catch(_p){ participantIds = []; }

                      var payload = {
                        project_name: String(formData.project_name||'').trim(),
                        project_type: String(formData.project_type||'').trim(),
                        status: String(formData.status||'').trim(),
                        owner_dept_id: deptId,
                        manager_user_id: ownerId,
                        participant_user_ids: participantIds,
                        priority: String(formData.priority||'').trim() || null,
                        description: String(formData.description||'').trim() || null,
                        budget_amount: (formData.budget_amount == null ? null : formData.budget_amount),
                        start_date: String(formData.start_date||'').trim() || null,
                        expected_end_date: String(formData.expected_end_date||'').trim() || null
                      };

                      var up = await blsFetchJson('/api/prj/projects/' + pid, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                      });

                      if(!up.ok || !up.data || !up.data.success || !up.data.item){
                        var msg = (up.data && up.data.message) ? up.data.message : '프로젝트 수정 중 오류가 발생했습니다.';
                        toast(msg, 'error');
                        return;
                      }

                      var saved = up.data.item;
                      try{ applyFormFromProject(saved); }catch(_a){ }
                      try{ applyView(saved); }catch(_b){ }
                      try{ sessionStorage.setItem('project_selected_row', JSON.stringify(saved)); }catch(_c){ }
                      closeModal();
                      toast('저장되었습니다.','success');
                    }catch(err){
                      console.error(err);
                      toast('저장 중 오류가 발생했습니다.','error');
                    }finally{
                      try{ btn.disabled = false; }catch(_f){ }
                      try{ btn.classList.remove('is-loading'); }catch(_g){ }
                    }
                  })();
                });
              }

              /* ── 접근 권한 확인 후 읽기전용 모드 적용 ── */
              function applyAccessRestrictions(access){
                window.__blsProjectAccess = access || 'read';
                if(access === 'write') return; // 수정 가능 → 제한 없음
                // read-only: 편집/추가/삭제 버튼 숨김
                var selectors = [
                  '#project-edit-fab',       // 프로젝트 수정 FAB
                  '#overview-edit-btn',      // GORF 편집
                  '#wbs-row-add',            // 탭 행 추가
                  '#wbs-download-btn',       // CSV 다운로드 (kept)
                  '#wbs-upload-btn',         // 엑셀 업로드
                  '.js-tab-del',             // 행 삭제 버튼
                  '.js-tab-toggle[data-action="edit"]', // 행 편집 버튼
                  '.bulk-delete-btn',        // 일괄 삭제
                  '#fi-attach-input',        // 파일 업로드 input
                  '#fi-attach-drop',         // 파일 드롭존
                ];
                selectors.forEach(function(sel){
                  try{
                    var els = document.querySelectorAll(sel);
                    els.forEach(function(el){
                      el.style.display = 'none';
                      el.disabled = true;
                    });
                  }catch(_){}
                });
                // 읽기 전용 배너 표시 (헤더 바 빈 영역 전체 차지)
                try{
                  var header = document.querySelector('.basic-info-card-header');
                  if(header && !document.getElementById('readonly-banner')){
                    header.style.justifyContent = 'flex-start';
                    var banner = document.createElement('div');
                    banner.id = 'readonly-banner';
                    banner.style.cssText = 'flex:1 1 0;min-width:0;background:#fff3cd;color:#856404;padding:6px 16px;border-radius:6px;font-size:12px;display:flex;align-items:center;justify-content:center;gap:6px;border:1px solid #ffc10733;margin-left:12px;';
                    banner.textContent = '\uD83D\uDD12 보기 전용 모드';
                    header.appendChild(banner);
                  }
                }catch(_){}
              }

              async function checkAndApplyAccess(){
                var pid = blsGetProjectId();
                if(!pid) return;
                try{
                  var res = await blsFetchJson('/api/prj/projects/' + pid + '/my-access');
                  if(res.ok && res.data && res.data.success){
                    applyAccessRestrictions(res.data.access);
                  }
                }catch(_){ }
              }

              // 1) seed quickly from query/session (avoid showing hardcoded placeholder)
              seedFromQueryOrSession();
              // Clean URL: remove all query params for security (onpremise pattern)
              try{ if(location.search) history.replaceState(null, '', location.pathname); }catch(_hr){}
              // 2) Load from server so Box1 + modal reflect real project data.
              try{ loadProjectAndRender(); }catch(_init){ console.error('[prj-detail] loadProjectAndRender threw', _init); sync(); clearProjectLoadingMask(); }
              // 3) Check access permission and apply read-only if needed
              try{ checkAndApplyAccess(); }catch(_acc){}
              // 3.5) 메뉴 권한 기반 읽기 전용 모드 적용 (BlossomPermissions)
              try{
                if(window.BlossomPermissions){
                  window.BlossomPermissions.load(function(){
                    if(!window.BlossomPermissions.canWrite('project')){
                      applyAccessRestrictions('read');
                    }
                  });
                }
              }catch(_bp){}
              // 4) Retry once shortly after, in case the first attempt raced with navigation/session.
              try{ setTimeout(function(){ try{ loadProjectAndRender(); }catch(_){ } }, 450); }catch(_r){ }
              // 5) Re-apply access restrictions after retry load
              try{ setTimeout(function(){ try{ checkAndApplyAccess(); }catch(_){ } }, 600); }catch(_ra){}
              // 6) Safety: ensure loading mask is always removed
              try{ setTimeout(clearProjectLoadingMask, 50); }catch(_s){ }
            })();
          });
      })();

      // [Tabs moved to /static/js/_detail/tab*.js]

  
  // (Removed duplicate WBS implementation block to avoid conflicting handlers)
  // tab88 (위험관리/Risk FMEA) → tab88-risk.js 로 분리됨

  // ── Global-scope guards: ensure init registries exist before DOMContentLoaded ──
  window.__blsTabInits  = window.__blsTabInits  || {};
  window.__blsInitFlags = window.__blsInitFlags || {};

  // tab89 (조달관리/Procurement TCO) → tab89-procurement.js 로 분리됨

  // ═══════ Generic CRUD Tab Factory: tab81 / tab82 / tab84 / tab85 / tab86 / tab90 ═══════
  (function(){
    /* shared helpers */
    function _openM(el){ if(!el)return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden','false'); }
    function _closeM(el){ if(!el)return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')) document.body.classList.remove('modal-open'); }
    function _esc(v){ return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

    /* ══ Alert Modal (alert() 대체) ══ */
    var _blsAlertCSS=false;
    function _blsInjectAlertCSS(){
      if(_blsAlertCSS) return; _blsAlertCSS=true;
      var s=document.createElement('style'); s.textContent=[
        '.bls-alert-overlay{position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.45);',
        '  display:flex;align-items:center;justify-content:center;padding:24px;animation:bls-alert-fade-in .15s ease;}',
        '@keyframes bls-alert-fade-in{from{opacity:0}to{opacity:1}}',
        '.bls-alert-card{background:#fff;border-radius:16px;width:420px;max-width:90vw;',
        '  box-shadow:0 20px 48px rgba(15,23,42,.22);overflow:hidden;animation:bls-alert-slide .2s ease;}',
        '@keyframes bls-alert-slide{from{transform:translateY(-12px);opacity:0}to{transform:translateY(0);opacity:1}}',
        '.bls-alert-icon-wrap{display:flex;justify-content:center;padding:28px 0 8px;}',
        '.bls-alert-icon{width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;}',
        '.bls-alert-icon.warn{background:#fef3c7;}',
        '.bls-alert-icon.warn svg{color:#f59e0b;}',
        '.bls-alert-icon.error{background:#fee2e2;}',
        '.bls-alert-icon.error svg{color:#ef4444;}',
        '.bls-alert-icon.info{background:#e0e7ff;}',
        '.bls-alert-icon.info svg{color:#6366f1;}',
        '.bls-alert-body{padding:8px 28px 20px;text-align:center;}',
        '.bls-alert-title{font-size:16px;font-weight:700;color:#1e293b;margin:0 0 8px;}',
        '.bls-alert-msg{font-size:14px;color:#475569;line-height:1.6;margin:0;white-space:pre-line;}',
        '.bls-alert-footer{padding:12px 28px 20px;display:flex;justify-content:center;}',
        '.bls-alert-ok{border:none;background:#6366f1;color:#fff;border-radius:10px;',
        '  padding:10px 36px;font-size:14px;font-weight:600;cursor:pointer;transition:background .15s;}',
        '.bls-alert-ok:hover{background:#4f46e5;}',
        '.bls-alert-ok:focus-visible{outline:2px solid #6366f1;outline-offset:2px;}'
      ].join('\n'); document.head.appendChild(s);
    }
    var _alertIconSvg={
      warn:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      error:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
      info:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 16v-4M12 8h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
    };
    function _blsAlert(msg, opts){
      _blsInjectAlertCSS();
      var title=(opts&&opts.title)||'알림';
      var type=(opts&&opts.type)||'warn';
      var ov=document.createElement('div'); ov.className='bls-alert-overlay';
      ov.innerHTML='<div class="bls-alert-card">'+
        '<div class="bls-alert-icon-wrap"><div class="bls-alert-icon '+type+'">'+(_alertIconSvg[type]||_alertIconSvg.warn)+'</div></div>'+
        '<div class="bls-alert-body"><p class="bls-alert-title">'+_esc(title)+'</p><p class="bls-alert-msg">'+_esc(msg)+'</p></div>'+
        '<div class="bls-alert-footer"><button type="button" class="bls-alert-ok">확인</button></div>'+
        '</div>';
      document.body.appendChild(ov);
      var okBtn=ov.querySelector('.bls-alert-ok');
      function close(){ try{ov.parentNode.removeChild(ov);}catch(_){} }
      okBtn.addEventListener('click',close);
      ov.addEventListener('click',function(e){if(e.target===ov) close();});
      document.addEventListener('keydown',function escH(e){if(e.key==='Escape'){close();document.removeEventListener('keydown',escH,true);}},true);
      setTimeout(function(){okBtn.focus();},50);
    }

    /* ══ Modal Picker (작업문서 등 modalSelect 전용) ══ */
    var _blsModalPickerCSS=false;
    function _blsInjectModalPickerCSS(){
      if(_blsModalPickerCSS) return; _blsModalPickerCSS=true;
      var s=document.createElement('style'); s.textContent=[
        '.bls-mp-btn{width:100%;border:1px solid #d1d5db;border-radius:6px;padding:6px 32px 6px 10px;',
        '  background:#fff;font-size:13px;text-align:left;cursor:pointer;position:relative;',
        '  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.4;',
        '  color:#334155;font-weight:400;}',
        '.bls-mp-btn.has-val{font-weight:600;color:#0f172a;}',
        '.bls-mp-btn::after{content:"";position:absolute;right:10px;top:50%;width:0;height:0;',
        '  border-left:5px solid transparent;border-right:5px solid transparent;',
        '  border-top:6px solid #475569;transform:translateY(-40%);pointer-events:none;}',
        '.bls-mp-btn:hover{border-color:#a5b4fc;}',
        '.bls-mp-btn[disabled]{cursor:not-allowed;opacity:.55;background:#f9fafb;}',
        '.bls-mp-overlay{position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;',
        '  background:rgba(15,23,42,.4);display:flex;align-items:center;justify-content:center;}',
        '.bls-mp-dialog{background:#fff;border-radius:14px;width:500px;max-width:92vw;',
        '  max-height:72vh;display:flex;flex-direction:column;overflow:hidden;',
        '  box-shadow:0 24px 56px rgba(15,23,42,.25);}',
        '.bls-mp-hd{display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid #e5e7eb;}',
        '.bls-mp-title{font-size:15px;font-weight:700;color:#1e293b;white-space:nowrap;}',
        '.bls-mp-inp{flex:1;border:1px solid #d1d5db;border-radius:8px;padding:8px 12px;font-size:14px;outline:none;}',
        '.bls-mp-inp:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.12);}',
        '.bls-mp-close{border:none;background:#f1f5f9;border-radius:8px;padding:6px 14px;',
        '  font-size:13px;cursor:pointer;color:#475569;font-weight:500;}',
        '.bls-mp-close:hover{background:#e2e8f0;}',
        '.bls-mp-list{overflow-y:auto;padding:6px 0;flex:1;',
        '  scrollbar-width:thin;scrollbar-color:#c7c7c7 transparent;}',
        '.bls-mp-list::-webkit-scrollbar{width:6px;}',
        '.bls-mp-list::-webkit-scrollbar-thumb{background:#c7c7c7;border-radius:3px;}',
        '.bls-mp-item{display:block;width:100%;text-align:left;padding:11px 18px;border:none;',
        '  background:transparent;cursor:pointer;font-size:14px;color:#1e293b;line-height:1.5;}',
        '.bls-mp-item:hover,.bls-mp-item.active{background:rgba(99,102,241,.08);}',
        '.bls-mp-item.sel{font-weight:700;color:#4f46e5;}',
        '.bls-mp-empty{padding:18px;font-size:14px;color:#94a3b8;text-align:center;}',
        '.bls-mp-hint{padding:18px;font-size:13px;color:#94a3b8;text-align:center;}'
      ].join('\n'); document.head.appendChild(s);
    }
    /**
     * _blsModalPicker — 독립 모달 선택기
     * td: 셀, sel: hidden <select>, colCfg: column config
     */
    function _blsModalPicker(td, sel, colCfg){
      _blsInjectModalPickerCSS();
      sel.style.display='none';
      var btn=document.createElement('button'); btn.type='button'; btn.className='bls-mp-btn';
      var _title=(colCfg&&colCfg.label)||'선택';
      function syncBtn(){
        var o=sel.options[sel.selectedIndex];
        var hasVal=!!(o&&o.value&&!o.disabled);
        btn.textContent=hasVal?(o.value||o.text):'선택';
        btn.title=hasVal?o.text:'선택';
        btn.classList.toggle('has-val',hasVal);
      }
      syncBtn();
      td.appendChild(btn);

      function openModal(){
        if(sel.disabled) return;
        /* build overlay */
        var ov=document.createElement('div'); ov.className='bls-mp-overlay';
        var dlg=document.createElement('div'); dlg.className='bls-mp-dialog';
        var hd=document.createElement('div'); hd.className='bls-mp-hd';
        var titleEl=document.createElement('span'); titleEl.className='bls-mp-title'; titleEl.textContent=_title;
        var inp=document.createElement('input'); inp.type='text'; inp.className='bls-mp-inp';
        inp.placeholder='문서번호 또는 작업명을 입력하세요'; inp.autocomplete='off';
        var cls=document.createElement('button'); cls.type='button'; cls.className='bls-mp-close'; cls.textContent='닫기';
        hd.appendChild(titleEl); hd.appendChild(inp); hd.appendChild(cls);
        dlg.appendChild(hd);
        var list=document.createElement('div'); list.className='bls-mp-list';
        dlg.appendChild(list);
        var emptyEl=document.createElement('div'); emptyEl.className='bls-mp-empty'; emptyEl.textContent='검색 결과가 없습니다.'; emptyEl.hidden=true;
        dlg.appendChild(emptyEl);
        var hintEl=document.createElement('div'); hintEl.className='bls-mp-hint'; hintEl.textContent='문서번호 또는 작업명을 입력하세요.';
        dlg.appendChild(hintEl);
        ov.appendChild(dlg); document.body.appendChild(ov);

        /* options */
        var allOpts=[];
        for(var i=0;i<sel.options.length;i++){
          var o=sel.options[i]; if(o.disabled&&!o.value) continue;
          allOpts.push({text:(o.text||'').trim(),value:o.value,lower:(o.text||'').trim().toLowerCase()});
        }
        var lazyMode=allOpts.length>20, filtered=lazyMode?[]:allOpts.slice(), focusIdx=-1;
        if(!lazyMode) hintEl.hidden=true;

        function render(){
          list.innerHTML='';
          if(lazyMode&&!(inp.value||'').trim()){ emptyEl.hidden=true; hintEl.hidden=false; return; }
          hintEl.hidden=true;
          if(!filtered.length){ emptyEl.hidden=false; return; }
          emptyEl.hidden=true;
          var cur=sel.value||'', max=50;
          filtered.slice(0,max).forEach(function(it,j){
            var b=document.createElement('button'); b.type='button'; b.className='bls-mp-item'+(it.value===cur?' sel':'');
            b.textContent=it.text; b.dataset.val=it.value;
            b.addEventListener('click',function(e){
              e.preventDefault();
              if(sel.value===it.value){ sel.selectedIndex=0; sel.value=''; }
              else { sel.value=it.value; }
              sel.dispatchEvent(new Event('change',{bubbles:true}));
              syncBtn(); close();
            });
            list.appendChild(b);
          });
          if(filtered.length>max){
            var more=document.createElement('div'); more.className='bls-mp-hint';
            more.textContent='외 '+(filtered.length-max)+'건 더 — 검색어를 좀 더 입력해주세요.';
            list.appendChild(more);
          }
        }
        function filter(){
          var q=(inp.value||'').trim().toLowerCase();
          if(lazyMode&&!q){ filtered=[]; } else { filtered=!q?allOpts.slice():allOpts.filter(function(it){return it.lower.indexOf(q)>=0;}); }
          render();
        }
        function close(){ try{ov.parentNode.removeChild(ov);}catch(_){} }

        render();
        setTimeout(function(){inp.focus();},30);
        cls.addEventListener('click',function(e){e.preventDefault();close();});
        ov.addEventListener('click',function(e){if(e.target===ov) close();});
        inp.addEventListener('input',filter);
        inp.addEventListener('keydown',function(e){
          if(e.key==='Escape') close();
          if(e.key==='ArrowDown'){e.preventDefault();var items=list.querySelectorAll('.bls-mp-item');if(items.length){focusIdx=Math.min(focusIdx+1,items.length-1);items[focusIdx].focus();}}
          if(e.key==='Enter'&&focusIdx>=0&&filtered[focusIdx]){
            e.preventDefault();
            if(sel.value===filtered[focusIdx].value){sel.selectedIndex=0;sel.value='';}else{sel.value=filtered[focusIdx].value;}
            sel.dispatchEvent(new Event('change',{bubbles:true})); syncBtn(); close();
          }
        });
        document.addEventListener('keydown',function escH(e){if(e.key==='Escape'){e.preventDefault();close();document.removeEventListener('keydown',escH,true);}},true);
      }
      btn.addEventListener('click',function(e){e.preventDefault();openModal();});
      sel.addEventListener('change',function(){syncBtn();});
      var mo=new MutationObserver(function(){syncBtn();});
      mo.observe(sel,{childList:true,attributes:true}); 
    }

    /* ── Searchable-Select (검색 드롭박스) widget ── */
    /* Follows onpremise fk-search-panel pattern: fixed panel on document.body */
    var _blsSSStyled=false;
    function _blsInjectSSCSS(){
      if(_blsSSStyled) return; _blsSSStyled=true;
      var s=document.createElement('style');
      s.textContent=[
        /* trigger button (replaces native select) */
        '.bls-ss-ctrl{position:relative;width:100%;}',
        '.bls-ss-ctrl .bls-ss-native{display:none;}',
        '.bls-ss-btn{width:100%;border:1px solid #d1d5db;border-radius:6px;padding:6px 32px 6px 10px;',
        '  background:#fff;color:#1f2937;font-size:13px;text-align:left;cursor:pointer;',
        '  position:relative;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.4;}',
        '.bls-ss-btn::after{content:"";position:absolute;right:10px;top:50%;width:0;height:0;',
        '  border-left:5px solid transparent;border-right:5px solid transparent;',
        '  border-top:6px solid #475569;transform:translateY(-40%);pointer-events:none;}',
        '.bls-ss-btn:hover{border-color:#a5b4fc;}',
        '.bls-ss-btn:focus-visible{outline:none;border-color:#6366f1;box-shadow:0 0 0 2px rgba(99,102,241,.15);}',
        '.bls-ss-btn:not(.has-val){color:#64748b;font-weight:400;}',
        '.bls-ss-btn.has-val{font-weight:500;color:#0f172a;}',
        '.bls-ss-btn[disabled]{cursor:not-allowed;opacity:.55;background:#f9fafb;}',
        /* floating panel on body — unified with fk-search-panel */
        '.bls-ss-panel{position:fixed;background:#fff;border:1px solid #e5e7eb;border-radius:12px;',
        '  box-shadow:0 20px 40px rgba(15,23,42,.18);display:flex;flex-direction:column;',
        '  overflow:hidden;z-index:5000;max-height:380px;min-width:280px;}',
        '.bls-ss-panel__hd{display:flex;gap:8px;padding:12px;border-bottom:1px solid #eef2f7;}',
        '.bls-ss-panel__inp{flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;font-size:14px;min-width:200px;}',
        '.bls-ss-panel__inp:focus{outline:none;border-color:#e5e7eb;box-shadow:0 0 0 2px rgba(229,231,235,0.5);}',
        '.bls-ss-panel__cls{border:none;background:#f1f5f9;border-radius:8px;padding:0 12px;',
        '  font-size:13px;cursor:pointer;color:#475569;white-space:nowrap;}',
        '.bls-ss-panel__cls:hover{background:#e2e8f0;}',
        '.bls-ss-panel__list{padding:6px 0;overflow-y:auto;max-height:260px;',
        '  scrollbar-width:thin;scrollbar-color:#c7c7c7 transparent;}',
        '.bls-ss-panel__list::-webkit-scrollbar{width:6px;}',
        '.bls-ss-panel__list::-webkit-scrollbar-track{background:transparent;}',
        '.bls-ss-panel__list::-webkit-scrollbar-thumb{background:#c7c7c7;border-radius:3px;}',
        '.bls-ss-panel__list::-webkit-scrollbar-thumb:hover{background:#999;}',
        '.bls-ss-panel__item{width:100%;text-align:left;padding:10px 16px;border:none;background:transparent;',
        '  cursor:pointer;font-size:14px;color:#0f172a;display:block;',
        '  white-space:normal;word-break:break-all;line-height:1.45;}',
        '.bls-ss-panel__item:hover,.bls-ss-panel__item.active{background:rgba(99,102,241,.08);}',
        '.bls-ss-panel__item.sel{font-weight:600;color:#4f46e5;}',
        '.bls-ss-panel__empty{padding:16px;font-size:14px;color:#6b7280;text-align:center;}',
        '.bls-ss-panel__hint{padding:14px 12px;font-size:13px;color:#9ca3af;text-align:center;}',
        /* modal overlay mode */
        '.bls-ss-overlay{position:fixed;inset:0;z-index:5000;background:rgba(15,23,42,.35);',
        '  display:flex;align-items:center;justify-content:center;padding:24px;}',
        '.bls-ss-overlay .bls-ss-panel{position:static;width:460px;max-width:90vw;max-height:70vh;',
        '  border-radius:14px;box-shadow:0 20px 48px rgba(15,23,42,.22);}',
        '.bls-ss-overlay .bls-ss-panel__hd{padding:14px 16px;}',
        '.bls-ss-overlay .bls-ss-panel__inp{padding:9px 12px;font-size:14px;}',
        '.bls-ss-overlay .bls-ss-panel__list{max-height:50vh;}',
        '.bls-ss-overlay .bls-ss-panel__item{padding:10px 16px;font-size:13.5px;}',
        '.bls-ss-modal-title{font-size:14px;font-weight:600;color:#1f2937;white-space:nowrap;}'
      ].join('\n');
      document.head.appendChild(s);
    }

    var _blsSSActive=null; // current open panel state

    function _blsSSClose(){
      if(!_blsSSActive) return;
      var st=_blsSSActive; _blsSSActive=null;
      try{document.removeEventListener('pointerdown',st._hOut,true);}catch(_){}
      try{document.removeEventListener('keydown',st._hKey,true);}catch(_){}
      try{window.removeEventListener('resize',st._hResize);}catch(_){}
      try{window.removeEventListener('scroll',st._hScroll,true);}catch(_){}
      if(st.overlay){ try{st.overlay.parentNode.removeChild(st.overlay);}catch(_){} }
      else { try{st.panel.parentNode.removeChild(st.panel);}catch(_){} }
      if(st.btn) st.btn.focus();
    }

    function _blsSSPosition(st){
      if(!st||!st.panel||!st.anchor) return;
      if(st.overlay) return; /* modal mode: overlay handles centering */
      var rect=st.anchor.getBoundingClientRect();
      var w=Math.max(rect.width, 320);
      st.panel.style.width=w+'px';
      var left=rect.left;
      if(left+w>window.innerWidth-8) left=window.innerWidth-w-8;
      if(left<8) left=8;
      /* 패널 실제 높이 측정 */
      var pH=st.panel.offsetHeight;
      if(!pH){ pH=120; } /* 최초 렌더 전 fallback */
      var belowSpace=window.innerHeight-rect.bottom-4;
      var aboveSpace=rect.top-4;
      var top;
      if(pH<=belowSpace){
        top=rect.bottom+2;                /* anchor 바로 아래 */
      } else if(pH<=aboveSpace){
        top=rect.top-pH-2;                /* anchor 바로 위 */
      } else {
        /* 위아래 다 부족 → 더 넓은 쪽 사용 */
        if(belowSpace>=aboveSpace){
          top=rect.bottom+2;
          st.panel.style.maxHeight=(belowSpace-4)+'px';
        } else {
          st.panel.style.maxHeight=(aboveSpace-4)+'px';
          pH=Math.min(pH,aboveSpace-4);
          top=rect.top-pH-2;
        }
      }
      st.panel.style.left=left+'px';
      st.panel.style.top=top+'px';
    }
    function _blsSSReposition(){
      if(_blsSSActive) requestAnimationFrame(function(){ _blsSSPosition(_blsSSActive); });
    }

    function _blsSearchableSelect(sel, colCfg){
      if(!sel||sel.dataset.blsSS) return;
      sel.dataset.blsSS='1';
      var _isModal=!!(colCfg&&colCfg.modalSelect);
      var _modalTitle=(colCfg&&colCfg.label)||'선택';
      _blsInjectSSCSS();
      var td=sel.parentNode;
      /* Wrapper */
      var ctrl=document.createElement('div'); ctrl.className='bls-ss-ctrl';
      var btn=document.createElement('button'); btn.type='button'; btn.className='bls-ss-btn';
      btn.setAttribute('aria-haspopup','dialog');
      sel.classList.add('bls-ss-native');
      td.insertBefore(ctrl,sel);
      ctrl.appendChild(btn);
      ctrl.appendChild(sel);

      function syncBtn(){
        var o=sel.options[sel.selectedIndex];
        var hasVal=!!(o&&o.value&&!o.disabled);
        var label=hasVal? (o.value||o.text) : '선택';
        btn.textContent=label;
        btn.title=hasVal?o.text:label;
        btn.classList.toggle('has-val',hasVal);
        ctrl.classList.toggle('has-val',hasVal);
        btn.disabled=!!sel.disabled;
      }

      function openPanel(){
        if(sel.disabled) return;
        _blsSSClose();
        var panel=document.createElement('div'); panel.className='bls-ss-panel';
        panel.setAttribute('role','dialog');
        var hd=document.createElement('div'); hd.className='bls-ss-panel__hd';
        var inp=document.createElement('input'); inp.type='text'; inp.className='bls-ss-panel__inp';
        inp.placeholder='검색어 입력'; inp.autocomplete='off';
        var cls=document.createElement('button'); cls.type='button'; cls.className='bls-ss-panel__cls'; cls.textContent='닫기';
        hd.appendChild(inp); hd.appendChild(cls); panel.appendChild(hd);
        var list=document.createElement('div'); list.className='bls-ss-panel__list'; list.setAttribute('role','listbox');
        panel.appendChild(list);
        var emptyEl=document.createElement('div'); emptyEl.className='bls-ss-panel__empty'; emptyEl.textContent='검색 결과가 없습니다.'; emptyEl.hidden=true;
        panel.appendChild(emptyEl);
        var overlay=null;
        if(_isModal){
          overlay=document.createElement('div'); overlay.className='bls-ss-overlay';
          overlay.style.cssText='position:fixed;inset:0;z-index:5000;background:rgba(15,23,42,.35);display:flex;align-items:center;justify-content:center;padding:24px;';
          panel.style.cssText='position:static;width:460px;max-width:90vw;max-height:70vh;background:#fff;border:1px solid #d6dae3;border-radius:14px;box-shadow:0 20px 48px rgba(15,23,42,.22);display:flex;flex-direction:column;overflow:hidden;';
          /* title bar */
          var titleSpan=document.createElement('span'); titleSpan.className='bls-ss-modal-title';
          titleSpan.style.cssText='font-size:14px;font-weight:600;color:#1f2937;white-space:nowrap;';
          titleSpan.textContent=_modalTitle; hd.insertBefore(titleSpan, inp);
          hd.style.padding='14px 16px';
          inp.style.cssText+='padding:9px 12px;font-size:14px;';
          list.style.maxHeight='50vh';
          overlay.appendChild(panel); document.body.appendChild(overlay);
        } else {
          document.body.appendChild(panel);
        }

        /* Build options */
        var allOpts=[];
        for(var i=0;i<sel.options.length;i++){
          var o=sel.options[i];
          if(o.disabled&&!o.value) continue;
          var t=(o.text||o.value||'').trim();
          allOpts.push({text:t,value:o.value,lower:t.toLowerCase()});
        }
        /* Lazy-search mode: if many options (>20), show items only after typing */
        var _lazyMode=allOpts.length>20;
        var filtered=_lazyMode?[]:allOpts.slice(), focusIdx=-1;
        var hintEl=document.createElement('div'); hintEl.className='bls-ss-panel__hint';
        hintEl.textContent='\uBB38\uC11C\uBC88\uD638 \uB610\uB294 \uC791\uC5C5\uBA85\uC744 \uC785\uB825\uD558\uC138\uC694.';
        if(_lazyMode){ panel.insertBefore(hintEl, emptyEl); } else { hintEl.hidden=true; }

        function renderItems(){
          list.innerHTML='';
          if(_lazyMode && !(inp.value||'').trim()){
            emptyEl.hidden=true; hintEl.hidden=false; focusIdx=-1; return;
          }
          hintEl.hidden=true;
          if(!filtered.length){ emptyEl.hidden=false; focusIdx=-1; return; }
          emptyEl.hidden=true;
          var curVal=sel.value||'';
          var max=50; /* cap visible items for performance */
          filtered.slice(0,max).forEach(function(it,j){
            var b=document.createElement('button'); b.type='button';
            b.className='bls-ss-panel__item'+(it.value===curVal?' sel':'');
            b.textContent=it.text; b.dataset.val=it.value;
            b.setAttribute('role','option'); b.tabIndex=-1;
            if(it.value===curVal) focusIdx=j;
            b.addEventListener('click',function(e){
              e.preventDefault();
              /* 토글: 이미 선택된 값을 다시 클릭하면 해제 */
              if(sel.value===it.value){
                sel.selectedIndex=0; sel.value='';
              } else {
                sel.value=it.value;
              }
              sel.dispatchEvent(new Event('change',{bubbles:true}));
              syncBtn(); _blsSSClose();
            });
            list.appendChild(b);
          });
          if(filtered.length>max){
            var more=document.createElement('div'); more.className='bls-ss-panel__hint';
            more.textContent='\uC678 '+(filtered.length-max)+'\uAC74 \uB354 \u2014 \uAC80\uC0C9\uC5B4\uB97C \uC880 \uB354 \uC785\uB825\uD574\uC8FC\uC138\uC694.';
            list.appendChild(more);
          }
        }
        function filterItems(){
          var q=(inp.value||'').trim().toLowerCase();
          if(_lazyMode && !q){ filtered=[]; }
          else { filtered=!q?allOpts.slice():allOpts.filter(function(it){return it.lower.indexOf(q)>=0;}); }
          focusIdx=-1; renderItems();
          _blsSSReposition();
        }
        function focusItem(idx){
          var items=list.querySelectorAll('.bls-ss-panel__item');
          if(!items.length) return;
          idx=Math.max(0,Math.min(idx,items.length-1)); focusIdx=idx;
          items.forEach(function(b,i){b.classList.toggle('active',i===idx);});
          items[idx].scrollIntoView({block:'nearest'});
        }

        renderItems();

        var st={panel:panel,anchor:ctrl,btn:btn,inp:inp,overlay:overlay};
        _blsSSActive=st;
        if(!_isModal){
          /* 레이아웃 후 정확한 위치 계산 */
          requestAnimationFrame(function(){
            _blsSSPosition(st);
            requestAnimationFrame(function(){ _blsSSPosition(st); });
          });
        }
        setTimeout(function(){inp.focus();},0);

        cls.addEventListener('click',function(e){e.preventDefault();_blsSSClose();});
        inp.addEventListener('input',filterItems);
        inp.addEventListener('keydown',function(e){
          if(e.key==='ArrowDown'){
            e.preventDefault();
            var items=list.querySelectorAll('.bls-ss-panel__item');
            if(items.length) focusItem(focusIdx<0?0:Math.min(focusIdx+1,items.length-1));
            if(items[focusIdx]) items[focusIdx].focus();
          } else if(e.key==='Enter'){
            e.preventDefault();
            if(focusIdx>=0&&filtered[focusIdx]){
              /* 토글: 이미 선택된 값이면 해제 */
              if(sel.value===filtered[focusIdx].value){
                sel.selectedIndex=0; sel.value='';
              } else {
                sel.value=filtered[focusIdx].value;
              }
              sel.dispatchEvent(new Event('change',{bubbles:true}));
              syncBtn(); _blsSSClose();
            }
          } else if(e.key==='Escape'){ _blsSSClose(); }
        });
        list.addEventListener('keydown',function(e){
          var isItem=e.target&&e.target.classList.contains('bls-ss-panel__item');
          if(!isItem) return;
          if(e.key==='ArrowDown'){e.preventDefault();focusItem(focusIdx+1);var items=list.querySelectorAll('.bls-ss-panel__item');if(items[focusIdx])items[focusIdx].focus();}
          else if(e.key==='ArrowUp'){e.preventDefault();if(focusIdx<=0){inp.focus();focusIdx=-1;return;}focusItem(focusIdx-1);var items2=list.querySelectorAll('.bls-ss-panel__item');if(items2[focusIdx])items2[focusIdx].focus();}
          else if(e.key==='Escape'){e.preventDefault();_blsSSClose();}
        });
        st._hOut=function(e){
          if(panel.contains(e.target)||ctrl.contains(e.target)) return;
          if(overlay && e.target===overlay){ _blsSSClose(); return; }
          if(!overlay) _blsSSClose();
        };
        document.addEventListener('pointerdown',st._hOut,true);
        st._hKey=function(e){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();_blsSSClose();}};
        document.addEventListener('keydown',st._hKey,true);
        st._hResize=function(){ if(!overlay) _blsSSClose(); };
        window.addEventListener('resize',st._hResize);
        st._hScroll=function(e){
          if(overlay) return; /* modal mode: no reposition needed */
          if(e.target&&(panel.contains(e.target)||ctrl.contains(e.target))) return;
          /* 스크롤 시 패널 닫지 않고 재배치 */
          _blsSSReposition();
        };
        window.addEventListener('scroll',st._hScroll,true);
      }

      btn.addEventListener('click',function(e){e.preventDefault();openPanel();});
      sel.addEventListener('change',function(){syncBtn();});
      var mo=new MutationObserver(function(){syncBtn();});
      mo.observe(sel,{childList:true,attributes:true,attributeFilter:['disabled']});
      syncBtn();
      return ctrl;
    }

    /**
     * blsMakeTabCrud(cfg) → init function
     * cfg: { tableId, prefix, tabKey, columns:[{key,label,placeholder,type,options,compute}],
     *        addBtnId?, csvBtnId?, uploadBtnId?,
     *        downloadModalPrefix?, uploadModalPrefix?,
     *        csvFilename?, xlsxSheet?, onPostLoad?, onInit? }
     */
    function blsMakeTabCrud(cfg){
      return function __tabCrudInit(){
        try{
          var table=document.getElementById(cfg.tableId); if(!table) return;
          var gk=cfg.prefix+'_crud_ok';
          if(window.__blsInitFlags && window.__blsInitFlags[gk]) return;
          window.__blsInitFlags=window.__blsInitFlags||{};
          window.__blsInitFlags[gk]=true;

          var tableWrap=table.closest('.table-wrap');
          var tbody=table.querySelector('tbody'); if(!tbody) return;
          var cols=cfg.columns||[];
          var chkCls=cfg.prefix+'-row-check';
          var emptyEl=document.getElementById(cfg.prefix+'-empty');
          var addBtn=cfg.addBtnId ? document.getElementById(cfg.addBtnId) : null;
          var csvBtn=cfg.csvBtnId ? document.getElementById(cfg.csvBtnId) : null;
          var uploadBtn=cfg.uploadBtnId ? document.getElementById(cfg.uploadBtnId) : null;
          var selectAll=document.getElementById(cfg.prefix+'-select-all');
          var pageSizeSel=document.getElementById(cfg.prefix+'-page-size');
          var paginationEl=document.getElementById(cfg.prefix+'-pagination');
          var pgInfo=document.getElementById(cfg.prefix+'-pagination-info');
          var pgNums=document.getElementById(cfg.prefix+'-page-numbers');
          var pgFirst=document.getElementById(cfg.prefix+'-first');
          var pgPrev=document.getElementById(cfg.prefix+'-prev');
          var pgNext=document.getElementById(cfg.prefix+'-next');
          var pgLast=document.getElementById(cfg.prefix+'-last');
          var tabClient=(typeof window.__blsGetPrjTabClient==='function') ? window.__blsGetPrjTabClient() : null;

          /* ── Pagination ── */
          var PAGE_SIZE=parseInt((pageSizeSel&&pageSizeSel.value)||'10',10)||10;
          var curPage=1;
          function allRows(){ return Array.from(tbody.querySelectorAll('tr')); }
          function totalPages(){ return Math.max(1,Math.ceil(allRows().length/PAGE_SIZE)); }
          function clampPage(){ if(curPage>totalPages()) curPage=totalPages(); }
          function buildPageBtns(){
            if(!pgNums) return; pgNums.innerHTML='';
            var tp=totalPages();
            for(var i=1;i<=tp;i++){
              var b=document.createElement('button'); b.className='page-btn'+(i===curPage?' active':''); b.textContent=String(i);
              (function(n){b.addEventListener('click',function(){curPage=n;applyPag();});})(i);
              pgNums.appendChild(b);
            }
          }
          function navState(){
            var tp=totalPages();
            if(pgFirst) pgFirst.disabled=curPage===1;
            if(pgPrev) pgPrev.disabled=curPage===1;
            if(pgNext) pgNext.disabled=curPage>=tp;
            if(pgLast) pgLast.disabled=curPage>=tp;
          }
          function applyPag(){
            var rows=allRows(), s=(curPage-1)*PAGE_SIZE, e=s+PAGE_SIZE;
            rows.forEach(function(r,i){ r.style.display=(i>=s&&i<e)?'':'none'; });
            var total=rows.length, from=total===0?0:s+1, to=Math.min(e,total);
            if(pgInfo) pgInfo.textContent=from+'-'+to+' / '+total+'개 항목';
            buildPageBtns(); navState();
          }
          function goLast(){ curPage=totalPages(); applyPag(); }
          if(pgFirst) pgFirst.addEventListener('click',function(){ curPage=1; applyPag(); });
          if(pgPrev) pgPrev.addEventListener('click',function(){ if(curPage>1){curPage--;applyPag();} });
          if(pgNext) pgNext.addEventListener('click',function(){ if(curPage<totalPages()){curPage++;applyPag();} });
          if(pgLast) pgLast.addEventListener('click',function(){ curPage=totalPages(); applyPag(); });
          if(pageSizeSel) pageSizeSel.addEventListener('change',function(){ PAGE_SIZE=parseInt(this.value,10)||10; curPage=1; applyPag(); });

          /* ── Empty state ── */
          function updateEmpty(){
            var has=allRows().length>0;
            if(emptyEl){ emptyEl.hidden=has; emptyEl.style.display=has?'none':''; }
            if(tableWrap) tableWrap.style.display=has?'':'none';
            if(paginationEl) paginationEl.style.display=has?'':'none';
            clampPage(); applyPag();
          }

          /* ── Build saved (read-only) row ── */
          function _dotHtml(c, v){
            if(!c.dotMap||!v||v==='-') return _esc(v);
            var color=c.dotMap[v];
            if(!color) return _esc(v);
            return '<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:'+color+';flex-shrink:0"></span>'+_esc(v)+'</span>';
          }
          /* ── Build task-doc link cell content ── */
          var _wrkDocCache=null;
          function _buildDocLink(docNo){
            if(!docNo||docNo==='-') return _esc(docNo||'-');
            /* Only create link when cache is loaded AND doc exists in cache */
            if(_wrkDocCache&&_wrkDocCache[docNo]){
              return '<a href="#" class="wbs-doc-link" data-doc="'+_esc(docNo)+'" title="작업보고서 보기">'+_esc(docNo)+'</a>';
            }
            return _esc(docNo);
          }
          function _refreshDocLinks(){
            var hasDocCol=cols.some(function(c){return c.key==='taskDoc';});
            if(!hasDocCol) return;
            fetch('/api/wrk/reports?view=all&status=APPROVED,COMPLETED,ARCHIVED',{credentials:'same-origin'})
              .then(function(r){return r.json();})
              .then(function(d){
                var items=Array.isArray(d)?d:(d.items||d.data||[]);
                var cache={};
                items.forEach(function(it){var no=String(it.doc_no||'').trim();if(no)cache[no]=true;});
                _wrkDocCache=cache;
                allRows().forEach(function(tr){
                  var td=tr.querySelector('[data-col="taskDoc"]');
                  if(!td) return;
                  var docNo=(td.textContent||'').trim();
                  if(!docNo||docNo==='-') return;
                  td.innerHTML=_buildDocLink(docNo);
                });
              }).catch(function(){ _wrkDocCache=_wrkDocCache||{}; });
          }
          function buildSavedRow(data){
            var tr=document.createElement('tr');
            var isLocked=!!data._locked;
            if(isLocked) tr.setAttribute('data-locked','true');
            var h='<td><input type="checkbox" class="'+chkCls+'" aria-label="행 선택"'+(isLocked?' disabled':'')+'>'+
              (isLocked?'<span style="display:inline-flex;align-items:center;margin-left:4px" title="담당자 (삭제 불가)"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="담당자" style="width:13px;height:13px;opacity:.45"></span>':'')+'</td>';
            cols.forEach(function(c){
              if(c.type==='hidden'){var hv=data[c.key];h+='<td data-col="'+c.key+'" hidden>'+_esc(typeof hv==='object'?JSON.stringify(hv):String(hv||''))+'</td>';return;}
              var v=data[c.key];
              if(c.type==='computed'&&c.compute){ try{v=c.compute(data);}catch(_){v='-';} }
              var display=(!v&&v!==0)?'-':String(v);
              if(c.key==='taskDoc'){
                h+='<td data-col="'+c.key+'">'+_buildDocLink(display)+'</td>';
              } else if(c.renderSaved){
                h+='<td data-col="'+c.key+'">'+c.renderSaved(display,data)+'</td>';
              } else {
                h+='<td data-col="'+c.key+'">'+_dotHtml(c,display)+'</td>';
              }
            });
            // read-only 모드에서는 편집/삭제 버튼 숨김
            var isReadOnly = (window.__blsProjectAccess === 'read');
            if(isReadOnly){
              h+='<td data-col="actions" class="system-actions table-actions"></td>';
            } else if(cfg.hideDelete || isLocked){
              h+='<td data-col="actions" class="system-actions table-actions">'+
                '<button type="button" class="action-btn js-tab-toggle" data-action="edit" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button>'+
                '</td>';
            } else {
              h+='<td data-col="actions" class="system-actions table-actions">'+
                '<button type="button" class="action-btn js-tab-toggle" data-action="edit" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button>'+
                '<button type="button" class="action-btn danger js-tab-del" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'+
                '</td>';
            }
            tr.innerHTML=h; return tr;
          }

          /* ── Cascade-select helpers ── */
          var cascadeGroups = {};  // groupId -> {cols:[colCfg,...]}
          cols.forEach(function(c){
            if(c.type==='cascade-select' && c.cascadeGroup){
              if(!cascadeGroups[c.cascadeGroup]) cascadeGroups[c.cascadeGroup]={cols:[]};
              cascadeGroups[c.cascadeGroup].cols.push(c);
            }
          });

          function _cascadeLoadOptions(sel, url, valueProp, currentVal, skipChange){
            sel.disabled=true;
            sel.innerHTML='<option value="" selected disabled>로딩중...</option>';
            (typeof blsFetchJson==='function'?blsFetchJson(url):fetch(url).then(function(r){return r.json().then(function(d){return{ok:r.ok,data:d};});}))
            .then(function(res){
              var items=(res.data&&res.data.items)||[];
              var o='<option value="" selected disabled>선택</option>';
              items.forEach(function(it){
                var val=typeof it==='string'?it:(it[valueProp]||it.name||'');
                var label=typeof it==='string'?it:(it.name||val);
                o+='<option value="'+_esc(val)+'"'+(val===currentVal?' selected':'')+'>'+_esc(label)+'</option>';
              });
              sel.innerHTML=o;
              sel.disabled=false;
              // if currentVal was set, trigger change to cascade further
              if(currentVal){
                sel.value=currentVal;
                if(!skipChange) sel.dispatchEvent(new Event('change',{bubbles:true}));
              }
            }).catch(function(){
              sel.innerHTML='<option value="" selected disabled>선택</option>';
              sel.disabled=false;
            });
          }

          function _cascadeInit(tr, presetData){
            // For each cascade group, wire up the chain in this row
            Object.keys(cascadeGroups).forEach(function(gid){
              var gcols=cascadeGroups[gid].cols;
              gcols.forEach(function(cc, idx){
                var td=tr.querySelector('[data-col="'+cc.key+'"]');
                if(!td) return;
                var sel=td.querySelector('select');
                if(!sel) return;
                // Load initial options
                var preVal=(presetData&&presetData[cc.key])||'';
                // When presetData exists (edit toggle), skip change events to prevent
                // parent loads from wiping already-loading child preset values
                var initSkip = !!presetData;
                if(!cc.cascadeDependsOn || cc.cascadeDependsOn.length===0){
                  // Root level of cascade chain (e.g. company, group) — always load
                  _cascadeLoadOptions(sel, cc.cascadeUrl, cc.cascadeValueProp||'name', preVal, initSkip);
                } else if(presetData){
                  // For dept/user, build the url with parent filters from preset
                  var url=cc.cascadeUrl;
                  var parentCols=gcols.filter(function(pc){return (cc.cascadeDependsOn||[]).indexOf(pc.key)>=0;});
                  parentCols.forEach(function(pc){
                    var pv=(presetData[pc.key]||'').trim();
                    if(pv) url+=(url.indexOf('?')>=0?'&':'?')+pc.cascadeParam+'='+encodeURIComponent(pv);
                  });
                  _cascadeLoadOptions(sel, url, cc.cascadeValueProp||'name', preVal, initSkip);
                }
                // On change, cascade to dependents
                sel.addEventListener('change',function(){
                  var val=(sel.value||'').trim();
                  // Find columns that depend on this one
                  gcols.forEach(function(dc){
                    if(!dc.cascadeDependsOn || dc.cascadeDependsOn.indexOf(cc.key)<0) return;
                    var dtd=tr.querySelector('[data-col="'+dc.key+'"]');
                    if(!dtd) return;
                    var dsel=dtd.querySelector('select');
                    if(!dsel) return;
                    var url=dc.cascadeUrl;
                    // Gather all parent values for this dependent
                    (dc.cascadeDependsOn||[]).forEach(function(parentKey){
                      var parentCol=gcols.find(function(g){return g.key===parentKey;});
                      if(!parentCol) return;
                      var ptd=tr.querySelector('[data-col="'+parentKey+'"]');
                      if(!ptd) return;
                      var psel=ptd.querySelector('select');
                      var pval=psel?(psel.value||'').trim():'';
                      if(pval) url+=(url.indexOf('?')>=0?'&':'?')+parentCol.cascadeParam+'='+encodeURIComponent(pval);
                    });
                    _cascadeLoadOptions(dsel, url, dc.cascadeValueProp||'name', '');
                    // Also reset any further dependents
                    gcols.forEach(function(fc){
                      if(!fc.cascadeDependsOn || fc.cascadeDependsOn.indexOf(dc.key)<0) return;
                      var ftd=tr.querySelector('[data-col="'+fc.key+'"]');
                      if(!ftd) return;
                      var fsel=ftd.querySelector('select');
                      if(fsel){fsel.innerHTML='<option value="" selected disabled>선택</option>';fsel.disabled=true;}
                    });
                  });
                  // Auto-fill callback
                  if(cc.cascadeOnSelect){
                    var selObj=null;
                    try{
                      var opts=sel.options;
                      for(var oi=0;oi<opts.length;oi++){
                        if(opts[oi].value===val){selObj={value:val,text:opts[oi].text};break;}
                      }
                    }catch(_){}
                    cc.cascadeOnSelect(tr, val, selObj);
                  }
                });
              });
            });
          }

          /* ── Wrap searchable selects in a row ── */
          function _wrapSearchable(tr){
            cols.forEach(function(c){
              if(!c.searchable) return;
              if(c.type!=='cascade-select'&&c.type!=='select') return;
              if(c.modalSelect){
                /* modalSelect: native select 숨김 — _loadAsyncOptions에서 모달 피커 생성 */
                var td2=tr.querySelector('[data-col="'+c.key+'"]');
                if(td2){
                  var sel2=td2.querySelector('select');
                  if(sel2) sel2.style.display='none';
                }
                return;
              }
              var td=tr.querySelector('[data-col="'+c.key+'"]');
              if(!td) return;
              var sel=td.querySelector('select');
              if(!sel||sel.dataset.blsSS) return;
              _blsSearchableSelect(sel, c);
            });
          }

          /* ── Load async options for selects (e.g. stakeholder names) ── */
          function _loadAsyncOptions(tr, preData){
            cols.forEach(function(c){
              if(c.type!=='select'||typeof c.asyncOptions!=='function') return;
              var td=tr.querySelector('[data-col="'+c.key+'"]');
              if(!td){console.warn('[_loadAsync]',c.key,'td not found'); return;}
              var sel=td.querySelector('select');
              if(!sel){console.warn('[_loadAsync]',c.key,'select not found in td'); return;}
              var curVal=(preData&&preData[c.key])||'';

              c.asyncOptions().then(function(opts){
                /* modalSelect → 항상 모달 피커 설정 (옵션 없어도) */
                if(c.modalSelect){
                  var oldMpBtn=td.querySelector('.bls-mp-btn');
                  if(oldMpBtn) oldMpBtn.parentNode.removeChild(oldMpBtn);
                  if(opts&&opts.length){
                    var mhtml='<option value="" disabled'+(curVal?'':' selected')+'>선택</option>';
                    opts.forEach(function(x){
                      var mv=(typeof x==='object'&&x!==null)?(x.value||''):x;
                      var mt=(typeof x==='object'&&x!==null)?(x.text||mv):x;
                      mhtml+='<option value="'+mv+'"'+(mv===curVal?' selected':'')+'>'+mt+'</option>';
                    });
                    sel.innerHTML=mhtml;
                  }
                  _blsModalPicker(td, sel, c);
                  return;
                }
                if(!opts||!opts.length){ return;}
                var html='<option value="" disabled'+(curVal?'':' selected')+'>선택</option>';
                opts.forEach(function(x){
                  var val = (typeof x==='object'&&x!==null) ? (x.value||'') : x;
                  var txt = (typeof x==='object'&&x!==null) ? (x.text||val)  : x;
                  html+='<option value="'+val+'"'+(val===curVal?' selected':'')+'>'+txt+'</option>';
                });
                // Remove old searchable wrapper if exists
                var oldCtrl=td.querySelector('.bls-ss-ctrl');
                if(oldCtrl){
                  var oldSel=oldCtrl.querySelector('select');
                  if(oldSel){ oldSel.removeAttribute('data-bls-s-s'); delete oldSel.dataset.blsSS; td.appendChild(oldSel); }
                  oldCtrl.parentNode.removeChild(oldCtrl);
                }
                sel=td.querySelector('select');
                if(sel){
                  sel.innerHTML=html;
                  sel.removeAttribute('data-bls-s-s');
                  delete sel.dataset.blsSS;
                  if(c.searchable) _blsSearchableSelect(sel, c);
                }
              }).catch(function(){
                /* 오류 시에도 modalSelect는 피커 설정 */
                if(c.modalSelect){
                  var oldMpBtn2=td.querySelector('.bls-mp-btn');
                  if(oldMpBtn2) oldMpBtn2.parentNode.removeChild(oldMpBtn2);
                  _blsModalPicker(td, sel, c);
                }
              });
            });
          }

          /* ── Build edit row (for Add) ── */
          function buildEditRow(presetData){
            var tr=document.createElement('tr');
            var h='<td><input type="checkbox" class="'+chkCls+'" aria-label="행 선택"></td>';
            cols.forEach(function(c){
              if(c.type==='hidden'){ h+='<td data-col="'+c.key+'" hidden></td>'; }
              else if(c.locked){ h+='<td data-col="'+c.key+'">-</td>'; }
              else if(c.type==='computed'){ h+='<td data-col="'+c.key+'">-</td>'; }
              else if(c.type==='cascade-select'){
                h+='<td data-col="'+c.key+'"><select class="form-input" data-cascade="'+_esc(c.cascadeGroup||'')+'"><option value="" selected disabled>선택</option></select></td>';
              }
              else if(c.type==='select'){
                var o='<option value="" selected disabled>선택</option>';
                (c.options||[]).forEach(function(x){ o+='<option value="'+x+'">'+x+'</option>'; });
                h+='<td data-col="'+c.key+'"><select class="form-input">'+o+'</select></td>';
              } else if(c.type==='date'){
                h+='<td data-col="'+c.key+'"><input type="text" class="form-input date-input" placeholder="YYYY-MM-DD"></td>';
              } else if(c.type==='number'){
                h+='<td data-col="'+c.key+'"><input type="number" class="form-input" placeholder="'+(c.placeholder||'0')+'" step="any"></td>';
              } else {
                h+='<td data-col="'+c.key+'"><input type="text" class="form-input" placeholder="'+(c.placeholder||'')+'"'+(c.readonly?' readonly style="background:#f0f0f0;cursor:default"':'')+' ></td>';
              }
            });
            h+='<td data-col="actions" class="system-actions table-actions">'+
              '<button type="button" class="action-btn js-tab-toggle" data-action="save" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button>'+
              '<button type="button" class="action-btn danger js-tab-del" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'+
              '</td>';
            tr.innerHTML=h;
            // Initialize cascade selects if any
            try{ _cascadeInit(tr, presetData||null); }catch(_ci){}
            // Wrap searchable selects
            try{ _wrapSearchable(tr); }catch(_ws){}
            // Initialize flatpickr for date fields
            try{ if(typeof initPrjEditDatePickers==='function') initPrjEditDatePickers(tr); else if(window.__blsInitDatePickers) window.__blsInitDatePickers(tr); }catch(_fp){}
            // Load async options for selects (e.g. stakeholder names)
            _loadAsyncOptions(tr, null);
            // Apply inputFilter (e.g. division: numbers+dots only)
            _applyInputFilters(tr);
            return tr;
          }

          /* ── Serialize one row ── */
          function serializeRow(tr){
            var d={};
            cols.forEach(function(c){
              var td=tr.querySelector('[data-col="'+c.key+'"]'); if(!td){d[c.key]='';return;}
              var el=td.querySelector('input,select,textarea');
              d[c.key]=el?(el.value||'').trim():(td.textContent||'').trim();
              if(d[c.key]==='-') d[c.key]='';
            });
            // Preserve _locked flag for locked rows (작성자 등)
            if(tr.getAttribute('data-locked')==='true') d._locked=true;
            return d;
          }
          function serializeAll(){ return allRows().map(serializeRow); }

          /* ── Input filter helper (e.g. division: numbers+dots only) ── */
          function _applyInputFilters(tr){
            cols.forEach(function(c){
              if(!c.inputFilter) return;
              var td=tr.querySelector('[data-col="'+c.key+'"');
              if(!td) return;
              var inp=td.querySelector('input[type="text"]');
              if(!inp) return;
              if(typeof c.inputFilter==='function'){ c.inputFilter(inp); return; }
              inp.addEventListener('input',function(){
                var v=inp.value;
                if(!c.inputFilter.test(v)){
                  inp.value=v.replace(new RegExp('[^'+c.inputFilter.source.replace(/[\^\$\[\]]/g,'')+']','g'),'');
                }
              });
            });
          }

          /* ── Recompute derived columns ── */
          function recompute(tr){
            var d=serializeRow(tr);
            cols.forEach(function(c){
              if(c.type!=='computed'||!c.compute) return;
              var v; try{v=c.compute(d);}catch(_){v='-';}
              var td=tr.querySelector('[data-col="'+c.key+'"]');
              if(td) td.textContent=(!v&&v!==0)?'-':String(v);
            });
          }

          /* ── Debounced save ── */
          var debKey=cfg.prefix+'_save';
          function scheduleSave(){
            if(!tabClient) return;
            var fn=(typeof window.__blsDebounce==='function')?window.__blsDebounce:null;
            if(!fn) return;
            fn(debKey, function(){
              tabClient.saveMergedLatest(cfg.tabKey, {rows:serializeAll()}).then(function(){
                /* BlossomQuery 캐시 무효화 — 관련 쿼리 자동 갱신 */
                if(window.BlossomQuery){
                  var pid = tabClient.projectId;
                  BlossomQuery.invalidateQueries(['project','tab',pid,cfg.tabKey]);
                  BlossomQuery.invalidateQueries(['project','detail',pid]);
                  BlossomQuery.invalidateQueries(['project','stats']);
                  BlossomQuery.invalidateQueries(['dashboard']);
                }
              }).catch(function(){});
            }, 800);
          }

          /* ── Hierarchical sort by division column ── */
          var divCol = cols.filter(function(c){return c.key==='division';})[0];
          function sortByDivision(){
            if(!divCol) return;
            var rows=allRows();
            if(rows.length<2) return;
            rows.sort(function(a,b){
              var tdA=a.querySelector('[data-col="division"]');
              var tdB=b.querySelector('[data-col="division"]');
              var vA=(tdA?(tdA.textContent||'').trim():'') || '';
              var vB=(tdB?(tdB.textContent||'').trim():'') || '';
              if(vA==='-'||vA==='') vA='999999';
              if(vB==='-'||vB==='') vB='999999';
              var pA=vA.split('.'), pB=vB.split('.');
              var len=Math.max(pA.length,pB.length);
              for(var i=0;i<len;i++){
                var nA=parseInt(pA[i]||'0',10)||0;
                var nB=parseInt(pB[i]||'0',10)||0;
                if(nA!==nB) return nA-nB;
              }
              return 0;
            });
            rows.forEach(function(r){ tbody.appendChild(r); });
            applyPag();
          }

          /* ── WBS Hierarchy: auto-calc parent start/end dates + result, lock parents, hide delete ── */
          function refreshWbsHierarchy(){
            if(!cfg.wbsHierarchy) return;
            var rows=allRows();
            // Build map: division -> {tr, startDate, endDate, result}
            var divMap={};
            rows.forEach(function(tr){
              var divTd=tr.querySelector('[data-col="division"]');
              var div=divTd?((divTd.querySelector('input')||divTd).value||(divTd.textContent||'')).trim():'';
              if(!div||div==='-') return;
              var startTd=tr.querySelector('[data-col="startDate"]');
              var startVal=startTd?((startTd.querySelector('input')||startTd).value||(startTd.textContent||'')).trim():'';
              if(startVal==='-') startVal='';
              var endTd=tr.querySelector('[data-col="endDate"]');
              var endVal=endTd?((endTd.querySelector('input')||endTd).value||(endTd.textContent||'')).trim():'';
              if(endVal==='-') endVal='';
              var resTd=tr.querySelector('[data-col="result"]');
              var resEl=resTd?(resTd.querySelector('select')||resTd):null;
              var resVal=resEl?((resEl.value||(resEl.textContent||'')).trim()):'';
              if(resVal==='-') resVal='';
              divMap[div]={tr:tr, startDate:startVal, endDate:endVal, result:resVal, div:div};
            });
            var allDivs=Object.keys(divMap);
            // Process from deepest to shallowest so parent calcs incorporate child calcs
            allDivs.sort(function(a,b){ return b.split('.').length - a.split('.').length || a.localeCompare(b); });
            allDivs.forEach(function(div){
              var parts=div.split('.');
              var level=parts.length;
              var children=allDivs.filter(function(d){ return d!==div && d.indexOf(div+'.')===0 && d.split('.').length===level+1; });
              var hasChildren=children.length>0;
              var tr=divMap[div].tr;
              var delBtn=tr.querySelector('.js-tab-del');
              var startTd=tr.querySelector('[data-col="startDate"]');
              var endTd=tr.querySelector('[data-col="endDate"]');
              var resTd=tr.querySelector('[data-col="result"]');
              if(hasChildren){
                // Auto-calc result from direct children
                var childResults=children.map(function(c){return divMap[c]?divMap[c].result:'';});
                var calcResult='';
                if(childResults.length>0){
                  var allDone=childResults.every(function(r){return r==='완료';});
                  var anyOverdue=childResults.some(function(r){return r==='지연';});
                  var anyDoing=childResults.some(function(r){return r==='진행';});
                  var allPending=childResults.every(function(r){return r==='대기'||!r;});
                  if(allDone) calcResult='완료';
                  else if(anyOverdue) calcResult='지연';
                  else if(anyDoing) calcResult='진행';
                  else if(allPending) calcResult='대기';
                  else calcResult='진행';
                }
                // Update result cell
                if(resTd && calcResult){
                  var resSel=resTd.querySelector('select');
                  if(resSel){
                    resSel.value=calcResult;
                    resSel.disabled=true;
                    resSel.style.background='#f0f0f0';
                    resSel.style.cursor='default';
                    // Also disable searchable-select wrapper if exists
                    var ssCtrl=resTd.querySelector('.bls-ss-ctrl');
                    if(ssCtrl) ssCtrl.style.pointerEvents='none';
                  } else {
                    // Saved (read-only) mode — update text with dot
                    var resCol=cols.filter(function(c){return c.key==='result';})[0];
                    if(resCol && resCol.dotMap){
                      resTd.innerHTML=_dotHtml(resCol, calcResult);
                    } else {
                      resTd.textContent=calcResult;
                    }
                  }
                  divMap[div].result=calcResult;
                }

                // Hide delete button
                if(delBtn) delBtn.style.display='none';
                tr.setAttribute('data-has-children','true');
              } else {
                // Show delete button
                if(delBtn) delBtn.style.display='';
                tr.removeAttribute('data-has-children');
                // Re-enable result select if it was previously disabled
                if(resTd){
                  var resSel2=resTd.querySelector('select');
                  if(resSel2){
                    resSel2.disabled=false;
                    resSel2.style.background='';
                    resSel2.style.cursor='';
                    var ssCtrl2=resTd.querySelector('.bls-ss-ctrl');
                    if(ssCtrl2) ssCtrl2.style.pointerEvents='';
                  }
                }
              }
            });
            // After hierarchy refresh, recompute duration for all affected rows
            rows.forEach(function(tr){ recompute(tr); });
            // Sync updated hierarchy data to localStorage so Gantt chart sees correct parent dates
            try{
              var allData=serializeAll();
              localStorage.setItem('project:wbs:data', JSON.stringify(allData));
              localStorage.setItem('project:wbs:updatedAt', String(Date.now()));
              window.dispatchEvent(new Event('project:wbs:updated'));
            }catch(_){}
          }

          /* ── Column header sort (asc/desc toggle) ── */
          var SORT_SVG='<span class="sort-icon"><svg class="sort-icon-svg" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3.5l3.5 4H4.5z M8 12.5l-3.5-4h7z"/></svg></span>';
          var sortState={col:null, dir:null};
          (function initSortHeaders(){
            var ths=table.querySelectorAll('thead th');
            // Skip checkbox (0) and actions (last)
            for(var i=1;i<ths.length-1;i++){
              (function(th, idx){
                var colCfg=cols[idx-1]; if(!colCfg) return;
                th.classList.add('sortable');
                th.setAttribute('role','columnheader');
                th.setAttribute('tabindex','0');
                // Preserve existing content and append sort icon
                var span=document.createElement('span');
                span.innerHTML=SORT_SVG;
                th.appendChild(span.firstChild);
                th.addEventListener('click',function(e){
                  if(e.target.closest('button,input,select,a')) return; // don't sort when clicking inner buttons
                  var dir='asc';
                  if(sortState.col===colCfg.key){
                    dir=sortState.dir==='asc'?'desc':'asc';
                  }
                  sortState.col=colCfg.key; sortState.dir=dir;
                  // Update header classes
                  ths.forEach(function(h){h.classList.remove('asc','desc');});
                  th.classList.add(dir);
                  // Sort rows
                  var rows=allRows();
                  if(rows.length<2) return;
                  rows.sort(function(a,b){
                    var tdA=a.querySelector('[data-col="'+colCfg.key+'"]');
                    var tdB=b.querySelector('[data-col="'+colCfg.key+'"]');
                    var vA=(tdA?(tdA.textContent||'').trim():'');
                    var vB=(tdB?(tdB.textContent||'').trim():'');
                    if(vA==='-') vA='';
                    if(vB==='-') vB='';
                    // For division column, use hierarchical compare
                    if(colCfg.key==='division'){
                      if(!vA) vA='999999'; if(!vB) vB='999999';
                      var pA=vA.split('.'), pB=vB.split('.');
                      var len=Math.max(pA.length,pB.length);
                      for(var k=0;k<len;k++){
                        var nA=parseInt(pA[k]||'0',10)||0;
                        var nB=parseInt(pB[k]||'0',10)||0;
                        if(nA!==nB) return dir==='asc'? nA-nB : nB-nA;
                      }
                      return 0;
                    }
                    // Date columns
                    if(colCfg.type==='date'){
                      var dA=new Date(vA||'9999'), dB=new Date(vB||'9999');
                      return dir==='asc'? dA-dB : dB-dA;
                    }
                    // Number columns
                    var fA=parseFloat(vA), fB=parseFloat(vB);
                    if(!isNaN(fA)&&!isNaN(fB)) return dir==='asc'? fA-fB : fB-fA;
                    // String compare
                    return dir==='asc'? vA.localeCompare(vB,'ko') : vB.localeCompare(vA,'ko');
                  });
                  rows.forEach(function(r){ tbody.appendChild(r); });
                  curPage=1; applyPag();
                });
              })(ths[i], i);
            }
          })();

          /* ── Mind-map modal (WBS only) — 5 view modes (SVG connectors) ── */
          (function(){
            var mmBtn=document.getElementById(cfg.prefix+'-mindmap-btn');
            if(!mmBtn) return;
            var mmModal=document.getElementById(cfg.prefix+'-mindmap-modal');
            var mmClose=document.getElementById(cfg.prefix+'-mindmap-close');
            var mmBody=document.getElementById(cfg.prefix+'-mindmap-body');
            var mmViews=document.getElementById(cfg.prefix+'-mm-views');
            if(!mmModal||!mmBody) return;
            function closeMM(){ mmModal.classList.remove('show'); mmModal.setAttribute('aria-hidden','true'); }
            if(mmClose) mmClose.addEventListener('click',closeMM);
            mmModal.addEventListener('click',function(e){ if(e.target===mmModal) closeMM(); });
            document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&mmModal.classList.contains('show')) closeMM(); });

            var STATUS_CLS={'완료':'done','진행':'doing','지연':'overdue','대기':'pending'};
            function sCls(r){ return STATUS_CLS[(r||'').trim()]||''; }

            function sortKeys(obj){
              return Object.keys(obj).sort(function(a,b){
                var pA=a.split('.'),pB=b.split('.');
                for(var i=0;i<Math.max(pA.length,pB.length);i++){
                  var nA=parseInt(pA[i]||'0',10)||0, nB=parseInt(pB[i]||'0',10)||0;
                  if(nA!==nB) return nA-nB;
                }
                return 0;
              });
            }

            /* ── Build data hierarchy ── */
            function buildHierarchy(){
              var rows=allRows(), data=rows.map(serializeRow);
              var phases={};
              data.forEach(function(d){
                var div=(d.division||'').trim();
                if(!div||div==='-') return;
                var parts=div.split('.');
                var pk=parts[0]||'';
                if(!phases[pk]) phases[pk]={name:'',result:'',owner:'',activities:{}};
                if(parts.length===1){
                  phases[pk].name=d.activity||d.task||('Phase '+pk);
                  phases[pk].result=d.result||'';
                  phases[pk].owner=d.owner||'';
                } else {
                  var ak=parts[0]+'.'+parts[1];
                  if(!phases[pk].activities[ak]) phases[pk].activities[ak]={name:'',result:'',owner:'',tasks:[]};
                  if(parts.length===2){
                    phases[pk].activities[ak].name=d.activity||d.task||('Activity '+ak);
                    phases[pk].activities[ak].result=d.result||'';
                    phases[pk].activities[ak].owner=d.owner||'';
                  } else {
                    phases[pk].activities[ak].tasks.push({name:d.task||d.activity||('Task '+div),div:div,result:d.result||'',owner:d.owner||''});
                  }
                }
              });
              var prjTitle=document.getElementById('project-title');
              var prjName=(prjTitle?(prjTitle.textContent||'').trim():'')||'프로젝트';
              return {phases:phases, prjName:prjName, phaseKeys:sortKeys(phases)};
            }

            /* ── Draw SVG connectors after DOM paint ── */
            function drawSVGConnectors(container, parentSel, childSel, opts){
              opts=opts||{};
              var color=opts.color||'#a5b4fc';
              var thick=opts.thick||2;
              var curve=opts.curve!==false;
              var dir=opts.dir||'lr'; // lr=left→right, tb=top→bottom
              /* Remove old SVG */
              var old=container.querySelector('svg.mm-svg-lines');
              if(old) old.remove();
              var rect=container.getBoundingClientRect();
              var svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
              svg.setAttribute('class','mm-svg-lines');
              svg.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;';
              svg.setAttribute('width',rect.width);
              svg.setAttribute('height',rect.height);
              container.style.position='relative';

              var parents=container.querySelectorAll(parentSel);
              parents.forEach(function(pEl){
                var children=[];
                if(opts.childFromParent){
                  children=opts.childFromParent(pEl);
                } else {
                  var next=pEl.nextElementSibling;
                  if(next&&next.matches(childSel)){
                    children=next.querySelectorAll(':scope > '+childSel+', :scope > * > '+childSel);
                    if(!children.length) children=[next];
                  }
                }
                if(!children||!children.length) return;
                var pR=pEl.getBoundingClientRect();
                children.forEach(function(cEl){
                  var cR=cEl.getBoundingClientRect();
                  var x1,y1,x2,y2;
                  if(dir==='lr'){
                    x1=pR.right-rect.left; y1=pR.top+pR.height/2-rect.top;
                    x2=cR.left-rect.left; y2=cR.top+cR.height/2-rect.top;
                  } else {
                    x1=pR.left+pR.width/2-rect.left; y1=pR.bottom-rect.top;
                    x2=cR.left+cR.width/2-rect.left; y2=cR.top-rect.top;
                  }
                  var path=document.createElementNS('http://www.w3.org/2000/svg','path');
                  var d;
                  if(curve){
                    if(dir==='lr'){
                      var cx=(x1+x2)/2;
                      d='M'+x1+','+y1+' C'+cx+','+y1+' '+cx+','+y2+' '+x2+','+y2;
                    } else {
                      var cy=(y1+y2)/2;
                      d='M'+x1+','+y1+' C'+x1+','+cy+' '+x2+','+cy+' '+x2+','+y2;
                    }
                  } else {
                    d='M'+x1+','+y1+' L'+x2+','+y2;
                  }
                  path.setAttribute('d',d);
                  path.setAttribute('stroke',color);
                  path.setAttribute('stroke-width',thick);
                  path.setAttribute('fill','none');
                  path.setAttribute('stroke-linecap','round');
                  svg.appendChild(path);
                });
              });
              container.insertBefore(svg,container.firstChild);
            }

            /* ═══════════════════════════════════════
               VIEW 1 — 마인드맵 (Mind Map) — radial with SVG curves
               ═══════════════════════════════════════ */
            function renderMindMap(d){
              var h='<div class="mv-mindmap">';
              var pks=d.phaseKeys, ph=d.phases;
              var half=Math.ceil(pks.length/2);
              var left=pks.slice(0,half), right=pks.slice(half);

              function sideHTML(list,side){
                var o='<div class="mm-side mm-side-'+side+'">';
                list.forEach(function(pk){
                  var p=ph[pk], pName=p.name||('Phase '+pk);
                  var aks=sortKeys(p.activities);
                  var sc=sCls(p.result);
                  o+='<div class="mm-arm">';
                  /* sub-children on opposite side */
                  if(side==='left'&&aks.length){
                    o+='<div class="mm-leaves">';
                    aks.forEach(function(ak){
                      var a=p.activities[ak], aName=a.name||('Activity '+ak);
                      var asc=sCls(a.result);
                      o+='<div class="mm-leaf'+(asc?' mm-sc-'+asc:'')+'">'+_esc(aName);
                      if(a.tasks.length){
                        o+='<div class="mm-tasks">';
                        a.tasks.forEach(function(t){ var tsc=sCls(t.result); o+='<div class="mm-task'+(tsc?' mm-sc-'+tsc:'')+'">'+_esc(t.name)+'</div>'; });
                        o+='</div>';
                      }
                      o+='</div>';
                    });
                    o+='</div>';
                  }
                  o+='<div class="mm-arm-pill'+(sc?' mm-sc-'+sc:'')+'" data-mm-parent>'+_esc(pk+'. '+pName)+'</div>';
                  if(side==='right'&&aks.length){
                    o+='<div class="mm-leaves">';
                    aks.forEach(function(ak){
                      var a=p.activities[ak], aName=a.name||('Activity '+ak);
                      var asc=sCls(a.result);
                      o+='<div class="mm-leaf'+(asc?' mm-sc-'+asc:'')+'">'+_esc(aName);
                      if(a.tasks.length){
                        o+='<div class="mm-tasks">';
                        a.tasks.forEach(function(t){ var tsc=sCls(t.result); o+='<div class="mm-task'+(tsc?' mm-sc-'+tsc:'')+'">'+_esc(t.name)+'</div>'; });
                        o+='</div>';
                      }
                      o+='</div>';
                    });
                    o+='</div>';
                  }
                  o+='</div>';
                });
                o+='</div>';
                return o;
              }

              h+=sideHTML(left,'left');
              h+='<div class="mm-hub" data-mm-hub>'+_esc(d.prjName)+'</div>';
              h+=sideHTML(right,'right');
              h+='</div>';
              return h;
            }

            function postMindMap(){
              var wrap=mmBody.querySelector('.mv-mindmap');
              if(!wrap) return;
              var hub=wrap.querySelector('[data-mm-hub]');
              var arms=wrap.querySelectorAll('.mm-arm-pill');
              if(!hub||!arms.length) return;
              var rect=wrap.getBoundingClientRect();
              var old=wrap.querySelector('svg.mm-svg-lines');
              if(old) old.remove();
              var svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
              svg.setAttribute('class','mm-svg-lines');
              svg.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;';
              wrap.insertBefore(svg,wrap.firstChild);
              var hR=hub.getBoundingClientRect();
              var hx=hR.left+hR.width/2-rect.left, hy=hR.top+hR.height/2-rect.top;
              arms.forEach(function(a){
                var aR=a.getBoundingClientRect();
                var ax,ay;
                /* connect to the side closest to hub */
                if(aR.right<hR.left){
                  ax=aR.right-rect.left; ay=aR.top+aR.height/2-rect.top;
                } else {
                  ax=aR.left-rect.left; ay=aR.top+aR.height/2-rect.top;
                }
                var p=document.createElementNS('http://www.w3.org/2000/svg','path');
                var cx=(hx+ax)/2;
                p.setAttribute('d','M'+hx+','+hy+' C'+cx+','+hy+' '+cx+','+ay+' '+ax+','+ay);
                p.setAttribute('stroke','#a5b4fc'); p.setAttribute('stroke-width','2.5');
                p.setAttribute('fill','none'); p.setAttribute('stroke-linecap','round');
                svg.appendChild(p);
              });
              /* arm → leaves connectors */
              arms.forEach(function(a){
                var armDiv=a.closest('.mm-arm');
                if(!armDiv) return;
                var leaves=armDiv.querySelectorAll('.mm-leaf');
                var aR=a.getBoundingClientRect();
                leaves.forEach(function(lf){
                  var lR=lf.getBoundingClientRect();
                  var x1,y1,x2,y2;
                  if(lR.right<=aR.left){
                    x1=aR.left-rect.left; y1=aR.top+aR.height/2-rect.top;
                    x2=lR.right-rect.left; y2=lR.top+Math.min(lR.height,24)/2-rect.top;
                  } else {
                    x1=aR.right-rect.left; y1=aR.top+aR.height/2-rect.top;
                    x2=lR.left-rect.left; y2=lR.top+Math.min(lR.height,24)/2-rect.top;
                  }
                  var cp=document.createElementNS('http://www.w3.org/2000/svg','path');
                  var cmx=(x1+x2)/2;
                  cp.setAttribute('d','M'+x1+','+y1+' C'+cmx+','+y1+' '+cmx+','+y2+' '+x2+','+y2);
                  cp.setAttribute('stroke','#c7d2fe'); cp.setAttribute('stroke-width','1.5');
                  cp.setAttribute('fill','none'); cp.setAttribute('stroke-linecap','round');
                  svg.appendChild(cp);
                });
              });
            }

            /* ═══════════════════════════════════════
               VIEW 2 — 로직차트 (Logic Chart) L→R with SVG curves
               ═══════════════════════════════════════ */
            function renderLogic(d){
              var h='<div class="mv-logic">';
              function nodeH(label,cls,sc,children){
                var o='<div class="lc-row">';
                o+='<div class="lc-pill '+cls+(sc?' lc-sc-'+sc:'')+'" data-lc>'+_esc(label)+'</div>';
                if(children&&children.length){
                  o+='<div class="lc-group">';
                  children.forEach(function(c){ o+=c; });
                  o+='</div>';
                }
                o+='</div>';
                return o;
              }
              var kids=[];
              d.phaseKeys.forEach(function(pk){
                var p=d.phases[pk], pName=p.name||('Phase '+pk);
                var aks=sortKeys(p.activities);
                var sc=sCls(p.result);
                var actKids=[];
                aks.forEach(function(ak){
                  var a=p.activities[ak], aName=a.name||('Activity '+ak);
                  var asc=sCls(a.result);
                  var taskKids=[];
                  a.tasks.forEach(function(t){
                    var tsc=sCls(t.result);
                    taskKids.push(nodeH(t.name,'lc-pill-task',tsc,null));
                  });
                  actKids.push(nodeH(ak+'. '+aName,'lc-pill-act',asc,taskKids));
                });
                kids.push(nodeH(pk+'. '+pName,'lc-pill-phase',sc,actKids));
              });
              h+=nodeH(d.prjName,'lc-pill-root','',kids);
              h+='</div>';
              return h;
            }

            function postLogic(){
              var w=mmBody.querySelector('.mv-logic');
              if(!w) return;
              var rect=w.getBoundingClientRect();
              var old=w.querySelector('svg.mm-svg-lines'); if(old) old.remove();
              var svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
              svg.setAttribute('class','mm-svg-lines');
              svg.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;';
              w.insertBefore(svg,w.firstChild);
              w.querySelectorAll('.lc-row').forEach(function(row){
                var pill=row.querySelector(':scope > [data-lc]');
                var grp=row.querySelector(':scope > .lc-group');
                if(!pill||!grp) return;
                var childPills=grp.querySelectorAll(':scope > .lc-row > [data-lc]');
                if(!childPills.length) return;
                var pR=pill.getBoundingClientRect();
                var x1=pR.right-rect.left, y1=pR.top+pR.height/2-rect.top;
                childPills.forEach(function(cp){
                  var cR=cp.getBoundingClientRect();
                  var x2=cR.left-rect.left, y2=cR.top+cR.height/2-rect.top;
                  var mx=(x1+x2)/2;
                  var path=document.createElementNS('http://www.w3.org/2000/svg','path');
                  path.setAttribute('d','M'+x1+','+y1+' C'+mx+','+y1+' '+mx+','+y2+' '+x2+','+y2);
                  path.setAttribute('stroke','#a5b4fc'); path.setAttribute('stroke-width','2');
                  path.setAttribute('fill','none'); path.setAttribute('stroke-linecap','round');
                  svg.appendChild(path);
                });
              });
            }

            /* ═══════════════════════════════════════
               VIEW 4 — 조직차트 (Org Chart) top→down with SVG lines
               ═══════════════════════════════════════ */
            function renderOrg(d){
              var h='<div class="mv-org">';
              h+='<div class="oc-node oc-root">';
              h+='<div class="oc-pill oc-pill-root" data-oc>'+_esc(d.prjName)+'</div>';
              if(d.phaseKeys.length){
                h+='<div class="oc-kids">';
                d.phaseKeys.forEach(function(pk){
                  var p=d.phases[pk], pName=p.name||('Phase '+pk);
                  var sc=sCls(p.result);
                  var aks=sortKeys(p.activities);
                  h+='<div class="oc-node">';
                  h+='<div class="oc-pill oc-pill-phase'+(sc?' oc-sc-'+sc:'')+'" data-oc>'+_esc(pk+'. '+pName)+'</div>';
                  if(aks.length){
                    h+='<div class="oc-kids">';
                    aks.forEach(function(ak){
                      var a=p.activities[ak], aName=a.name||('Activity '+ak);
                      var asc=sCls(a.result);
                      h+='<div class="oc-node">';
                      h+='<div class="oc-pill oc-pill-act'+(asc?' oc-sc-'+asc:'')+'" data-oc>'+_esc(ak+'. '+aName)+'</div>';
                      if(a.tasks.length){
                        h+='<div class="oc-kids">';
                        a.tasks.forEach(function(t){
                          var tsc=sCls(t.result);
                          h+='<div class="oc-node"><div class="oc-pill oc-pill-task'+(tsc?' oc-sc-'+tsc:'')+'" data-oc>'+_esc(t.name)+'</div></div>';
                        });
                        h+='</div>';
                      }
                      h+='</div>';
                    });
                    h+='</div>';
                  }
                  h+='</div>';
                });
                h+='</div>';
              }
              h+='</div></div>';
              return h;
            }

            function postOrg(){
              var w=mmBody.querySelector('.mv-org');
              if(!w) return;
              var rect=w.getBoundingClientRect();
              var old=w.querySelector('svg.mm-svg-lines'); if(old) old.remove();
              var svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
              svg.setAttribute('class','mm-svg-lines');
              svg.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;';
              w.insertBefore(svg,w.firstChild);
              w.querySelectorAll('.oc-node').forEach(function(node){
                var pill=node.querySelector(':scope > [data-oc]');
                var kids=node.querySelector(':scope > .oc-kids');
                if(!pill||!kids) return;
                var childPills=kids.querySelectorAll(':scope > .oc-node > [data-oc]');
                if(!childPills.length) return;
                var pR=pill.getBoundingClientRect();
                var x1=pR.left+pR.width/2-rect.left, y1=pR.bottom-rect.top;
                childPills.forEach(function(cp){
                  var cR=cp.getBoundingClientRect();
                  var x2=cR.left+cR.width/2-rect.left, y2=cR.top-rect.top;
                  var my=(y1+y2)/2;
                  var path=document.createElementNS('http://www.w3.org/2000/svg','path');
                  path.setAttribute('d','M'+x1+','+y1+' C'+x1+','+my+' '+x2+','+my+' '+x2+','+y2);
                  path.setAttribute('stroke','#c7d2fe'); path.setAttribute('stroke-width','2');
                  path.setAttribute('fill','none'); path.setAttribute('stroke-linecap','round');
                  svg.appendChild(path);
                });
              });
            }

            /* ═══════════════════════════════════════
               VIEW 5 — 타임라인 (Timeline) L→R horizontal
               ═══════════════════════════════════════ */
            var TL_COL=['#e8927c','#f97316','#6366f1','#ec4899','#14b8a6','#8b5cf6','#f59e0b','#3b82f6'];

            function renderTimeline(d){
              var h='<div class="mv-tl">';
              h+='<div class="tl-track"></div>';
              h+='<div class="tl-root">'+_esc(d.prjName)+'</div>';
              d.phaseKeys.forEach(function(pk,idx){
                var p=d.phases[pk], pName=p.name||('Phase '+pk);
                var aks=sortKeys(p.activities);
                var c=TL_COL[idx%TL_COL.length];
                var side=(idx%2===0)?'top':'bot';
                h+='<div class="tl-nd tl-nd-'+side+'">';
                h+='<div class="tl-c" style="border-color:'+c+';color:'+c+'">'+(idx+1)+'</div>';
                h+='<div class="tl-p" style="background:'+c+'">'+_esc(pName)+'</div>';
                h+='<div class="tl-br" data-col="'+c+'">';
                aks.forEach(function(ak){
                  var a=p.activities[ak], aName=a.name||('Activity '+ak);
                  h+='<span class="tl-l"><i class="tl-dash" style="background:'+c+'"></i>'+_esc(ak+'. '+aName)+'</span>';
                  a.tasks.forEach(function(t){
                    h+='<span class="tl-l tl-lt"><i class="tl-dash" style="background:'+c+'"></i>'+_esc(t.name)+'</span>';
                  });
                });
                h+='</div>';
                h+='</div>';
              });
              h+='</div>';
              return h;
            }

            function postTimeline(){
              var w=mmBody.querySelector('.mv-tl');
              if(!w) return;

              /* ── Phase 1: measure branch extent & set dynamic padding ── */
              var nds=w.querySelectorAll('.tl-nd');
              var root=w.querySelector('.tl-root');
              var track=w.querySelector('.tl-track');
              if(!root||!nds.length||!track) return;

              var maxAbove=0, maxBelow=0;
              nds.forEach(function(nd){
                var br=nd.querySelector('.tl-br');
                if(!br) return;
                var bR=br.getBoundingClientRect();
                var nR=nd.getBoundingClientRect();
                var above=nR.top-bR.top;
                var below=bR.bottom-nR.bottom;
                if(above>maxAbove) maxAbove=above;
                if(below>maxBelow) maxBelow=below;
              });
              w.style.paddingTop=Math.max(60,maxAbove+60)+'px';
              w.style.paddingBottom=Math.max(60,maxBelow+60)+'px';

              /* ── Phase 2: after layout reflow, position track & draw SVG ── */
              requestAnimationFrame(function(){
                var wR=w.getBoundingClientRect();
                var rR=root.getBoundingClientRect();
                var lastNd=nds[nds.length-1];
                var lP=lastNd.querySelector('.tl-p');
                var lastR=lP?lP.getBoundingClientRect():lastNd.getBoundingClientRect();
                var cy=rR.top+rR.height/2-wR.top;
                track.style.top=cy+'px';
                track.style.left=(rR.right-wR.left+14)+'px';
                track.style.width=Math.max(0,lastR.right+50-rR.right-14)+'px';

                var old=w.querySelector('svg.tl-svg'); if(old) old.remove();
                var svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
                svg.setAttribute('class','tl-svg');
                svg.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:3;';
                w.appendChild(svg);

                /* Root → first circle horizontal line */
                if(nds.length){
                  var firstCirc=nds[0].querySelector('.tl-c');
                  if(firstCirc){
                    var fcR=firstCirc.getBoundingClientRect();
                    var line0=document.createElementNS('http://www.w3.org/2000/svg','line');
                    line0.setAttribute('x1',rR.right-wR.left);
                    line0.setAttribute('y1',cy);
                    line0.setAttribute('x2',fcR.left-wR.left);
                    line0.setAttribute('y2',cy);
                    line0.setAttribute('stroke','#a5b4fc');
                    line0.setAttribute('stroke-width','2.5');
                    line0.setAttribute('stroke-linecap','round');
                    line0.setAttribute('opacity','0.7');
                    svg.appendChild(line0);
                  }
                }

                /* Fan lines: circle edge → each dash element */
                nds.forEach(function(nd){
                  var circ=nd.querySelector('.tl-c');
                  var br=nd.querySelector('.tl-br');
                  if(!circ||!br) return;
                  var labels=br.querySelectorAll('.tl-l');
                  if(!labels.length) return;
                  var cR=circ.getBoundingClientRect();
                  var col=br.getAttribute('data-col')||'#94a3b8';
                  var isTop=nd.classList.contains('tl-nd-top');
                  var ax=cR.left+cR.width/2-wR.left;
                  var ay=isTop?(cR.top-wR.top):(cR.bottom-wR.top);

                  labels.forEach(function(lb){
                    var dash=lb.querySelector('.tl-dash');
                    var tgt=dash||lb;
                    var tR=tgt.getBoundingClientRect();
                    var lx=tR.left-wR.left;
                    var ly=tR.top+tR.height/2-wR.top;
                    var line=document.createElementNS('http://www.w3.org/2000/svg','line');
                    line.setAttribute('x1',ax); line.setAttribute('y1',ay);
                    line.setAttribute('x2',lx); line.setAttribute('y2',ly);
                    line.setAttribute('stroke',col);
                    line.setAttribute('stroke-width','1.5');
                    line.setAttribute('stroke-linecap','round');
                    line.setAttribute('opacity','0.6');
                    svg.appendChild(line);
                  });
                });
              });
            }

            /* ── View dispatcher ── */
            var VIEWS={mindmap:renderMindMap,logic:renderLogic,org:renderOrg,timeline:renderTimeline};
            var POSTS={mindmap:postMindMap,logic:postLogic,org:postOrg,timeline:postTimeline};
            var currentView='mindmap';
            var cachedData=null;

            function renderView(viewName){
              currentView=viewName;
              if(!cachedData) return;
              mmBody.innerHTML=VIEWS[viewName](cachedData);
              if(mmViews){
                mmViews.querySelectorAll('.mm-view-btn').forEach(function(b){
                  b.classList.toggle('active',b.getAttribute('data-view')===viewName);
                });
              }
              /* Post-render: draw SVG connectors after a paint frame */
              requestAnimationFrame(function(){
                requestAnimationFrame(function(){
                  if(POSTS[viewName]) POSTS[viewName]();
                  /* Auto-scroll so content is centered in the viewport */
                  if(mmBody.scrollWidth>mmBody.clientWidth){
                    mmBody.scrollLeft=(mmBody.scrollWidth-mmBody.clientWidth)/2;
                  }
                  if(mmBody.scrollHeight>mmBody.clientHeight){
                    var inner=mmBody.firstElementChild;
                    if(inner){
                      var iH=inner.offsetHeight;
                      var bH=mmBody.clientHeight;
                      mmBody.scrollTop=Math.max(0,(iH-bH)/2);
                    }
                  }
                });
              });
            }

            if(mmViews){
              mmViews.addEventListener('click',function(e){
                var btn=e.target.closest('.mm-view-btn');
                if(!btn) return;
                var v=btn.getAttribute('data-view');
                if(v&&VIEWS[v]) renderView(v);
              });
            }

            mmBtn.addEventListener('click',function(){
              cachedData=buildHierarchy();
              renderView(currentView);
              mmModal.classList.add('show');
              mmModal.setAttribute('aria-hidden','false');
            });
          })();

          /* ── Hydrate from API response ── */
          function hydrate(payload){
            if(!payload||!Array.isArray(payload.rows)) return;
            payload.rows.forEach(function(d){ tbody.appendChild(buildSavedRow(d)); });
          }

          /* ── Context object for callbacks ── */
          var ctx={allRows:allRows,buildSavedRow:buildSavedRow,updateEmpty:updateEmpty,goLast:goLast,
                   scheduleSave:scheduleSave,tbody:tbody,tabClient:tabClient,openModal:_openM,closeModal:_closeM,
                   cols:cols,table:table,cfg:cfg};

          /* ── Load data from DB ── */
          if(tabClient){
            tabClient.loadLatest(cfg.tabKey).then(function(item){
              /* BlossomQuery 캐시에 탭 데이터 등록 */
              if(window.BlossomQuery && item){
                BlossomQuery.setQueryData(
                  ['project','tab',tabClient.projectId,cfg.tabKey], item
                );
              }
              try{ hydrate(item&&item.payload); }catch(_){}
              sortByDivision();
              refreshWbsHierarchy();
              curPage=1; updateEmpty();
              /* Refresh taskDoc links after hydration */
              try{ _refreshDocLinks(); }catch(_dl){}
              if(cfg.onPostLoad) try{ cfg.onPostLoad(ctx); }catch(_pl){}
            }).catch(function(){ curPage=1; updateEmpty(); });
          } else { updateEmpty(); }

          /* ── Add button (read-only 모드에서는 비활성) ── */
          if(addBtn){
            addBtn.addEventListener('click',function(){
              if(window.__blsProjectAccess === 'read'){ return; }
              var newTr = buildEditRow();
              tbody.appendChild(newTr); updateEmpty(); goLast();
              // onRowEdit callback for newly added rows
              if(cfg.onRowEdit) try{ cfg.onRowEdit(newTr, null); }catch(_ore){}
            });
            // hide add button in read-only mode
            if(window.__blsProjectAccess === 'read'){ addBtn.style.display='none'; addBtn.disabled=true; }
          }

          /* ── Select-all ── */
          if(selectAll) selectAll.addEventListener('change',function(){
            allRows().forEach(function(tr){
              if(tr.getAttribute('data-locked')==='true') return; // locked 행은 선택 불가
              var cb=tr.querySelector('.'+chkCls);
              if(cb){ cb.checked=!!selectAll.checked; tr.classList.toggle('selected',!!cb.checked); }
            });
          });

          /* ── Row checkbox toggle ── */
          table.addEventListener('change',function(ev){
            var cb=ev.target.closest('.'+chkCls); if(!cb) return;
            var tr=cb.closest('tr'); if(tr) tr.classList.toggle('selected',!!cb.checked);
            if(selectAll){
              var all=tbody.querySelectorAll('.'+chkCls);
              selectAll.checked=all.length>0&&Array.prototype.every.call(all,function(c){return c.checked;});
            }
          });

          /* ── Delegated: edit / save / delete ── */
          table.addEventListener('click',function(ev){
            var tgt=ev.target.closest('.js-tab-del,.js-tab-toggle'); if(!tgt) return;
            var tr=tgt.closest('tr'); if(!tr) return;
            /* delete */
            if(tgt.classList.contains('js-tab-del')){
              // Locked rows (담당자 등) 삭제 불가
              if(tr.getAttribute('data-locked')==='true'){
                _blsAlert('담당자는 삭제할 수 없습니다.',{title:'삭제 불가',type:'warn'}); return;
              }
              // WBS hierarchy: prevent deleting parent that has children
              if(cfg.wbsHierarchy && tr.getAttribute('data-has-children')==='true'){
                _blsAlert('하위 항목이 있어 삭제할 수 없습니다.\n하위 항목을 먼저 삭제해 주세요.',{title:'삭제 불가',type:'warn'}); return;
              }
              tr.parentNode.removeChild(tr); clampPage(); updateEmpty(); scheduleSave();
              refreshWbsHierarchy(); return;
            }
            var mode=tgt.getAttribute('data-action')||'edit';
            if(mode==='edit'){
              // Collect current values for cascade preset
              var preData={};
              cols.forEach(function(c){
                var td=tr.querySelector('[data-col="'+c.key+'"]');
                var cur=td?((td.textContent||'').trim()):'';
                if(cur==='-') cur='';
                preData[c.key]=cur;
              });
              var _isLockedRow = tr.getAttribute('data-locked')==='true';
              var _lockedEditableKeys = {role:1, involvement:1, note:1};
              cols.forEach(function(c){
                if(c.type==='computed'||c.type==='hidden'||c.locked) return;
                // 담당자(locked) 행: 역할/관여도/비고만 편집 가능
                if(_isLockedRow && !_lockedEditableKeys[c.key]) return;
                var td=tr.querySelector('[data-col="'+c.key+'"]'); if(!td) return;
                var cur=preData[c.key]||'';
                if(c.type==='cascade-select'){
                  td.innerHTML='<select class="form-input" data-cascade="'+_esc(c.cascadeGroup||'')+'"><option value="" selected disabled>선택</option></select>';
                } else if(c.type==='select'){
                  var o='<option value=""'+(!cur?' selected':'')+' disabled>선택</option>';
                  (c.options||[]).forEach(function(x){ o+='<option value="'+x+'"'+(x===cur?' selected':'')+'>'+x+'</option>'; });
                  td.innerHTML='<select class="form-input">'+o+'</select>';
                } else if(c.type==='date'){
                  td.innerHTML='<input type="text" class="form-input date-input" value="'+_esc(cur)+'" placeholder="YYYY-MM-DD">';
                } else if(c.type==='number'){
                  td.innerHTML='<input type="number" class="form-input" value="'+_esc(cur)+'" step="any">';
                } else {
                  td.innerHTML='<input type="text" class="form-input" value="'+_esc(cur)+'" placeholder="'+(c.placeholder||'')+'"'+(c.readonly?' readonly style="background:#f0f0f0;cursor:default"':'')+' >';
                }
              });
              tgt.setAttribute('data-action','save'); tgt.title='저장'; tgt.setAttribute('aria-label','저장');
              tgt.innerHTML='<img src="/static/image/svg/save.svg" alt="저장" class="action-icon">';
              /* Wrap actual cell as readonly input matching planned column */
              var _actTd=tr.querySelector('[data-col="actual"]');
              if(_actTd){ var _av=(_actTd.textContent||'').trim(); _actTd.innerHTML='<input type="text" class="form-input actual-input" value="'+_esc(_av||'0')+'" readonly>'; }
              // Initialize cascade selects with existing values
              try{ _cascadeInit(tr, preData); }catch(_ci){}
              // Wrap searchable selects
              try{ _wrapSearchable(tr); }catch(_ws){}
              // Initialize flatpickr for date fields
              try{ if(typeof initPrjEditDatePickers==='function') initPrjEditDatePickers(tr); else if(window.__blsInitDatePickers) window.__blsInitDatePickers(tr); }catch(_fp){}
              // Load async options for selects (e.g. stakeholder names)
              _loadAsyncOptions(tr, preData);
              // Apply input filters
              _applyInputFilters(tr);
              recompute(tr);
              // onRowEdit callback for edit toggle
              if(cfg.onRowEdit) try{ cfg.onRowEdit(tr, preData); }catch(_ore){}
              // WBS hierarchy: disable result if row has children
              if(cfg.wbsHierarchy && tr.getAttribute('data-has-children')==='true'){
                var _resTd=tr.querySelector('[data-col="result"]');
                if(_resTd){
                  var _resSel=_resTd.querySelector('select');
                  if(_resSel){
                    _resSel.disabled=true;
                    _resSel.style.background='#f0f0f0';
                    _resSel.style.cursor='default';
                    var _ssCtrl=_resTd.querySelector('.bls-ss-ctrl');
                    if(_ssCtrl) _ssCtrl.style.pointerEvents='none';
                  }
                }
              }
            } else if(mode==='save'){
              // WBS hierarchy: validate max depth 3 levels (before saving)
              if(cfg.wbsHierarchy){
                var _divTd2=tr.querySelector('[data-col="division"]');
                var _divInp2=_divTd2?_divTd2.querySelector('input'):null;
                var _divVal2=_divInp2?(_divInp2.value||'').trim():(_divTd2?(_divTd2.textContent||'').trim():'');
                if(_divVal2 && _divVal2!=='-'){
                  var _depth2=_divVal2.split('.').filter(function(p){return p;}).length;
                  if(_depth2>3){
                    _blsAlert('구분은 소분류(3단계)까지만 입력할 수 있습니다.\n예: 1, 1.1, 1.1.1',{title:'입력 제한',type:'info'});
                    return;
                  }
                  // Validate date range within parent
                  if(_depth2>1){
                    var _parentDiv=_divVal2.split('.').slice(0,-1).join('.');
                    // Find parent row
                    var _parentTr=null;
                    allRows().forEach(function(r){
                      var ptd=r.querySelector('[data-col="division"]');
                      var pv=ptd?((ptd.querySelector('input')||ptd).value||(ptd.textContent||'')).trim():'';
                      if(pv===_parentDiv) _parentTr=r;
                    });
                    if(_parentTr){
                      var _pStartTd=_parentTr.querySelector('[data-col="startDate"]');
                      var _pEndTd=_parentTr.querySelector('[data-col="endDate"]');
                      var _pStart=_pStartTd?(((_pStartTd.querySelector('input')||_pStartTd).value||(_pStartTd.textContent||'')).trim()):'';
                      var _pEnd=_pEndTd?(((_pEndTd.querySelector('input')||_pEndTd).value||(_pEndTd.textContent||'')).trim()):'';
                      if(_pStart==='-') _pStart='';
                      if(_pEnd==='-') _pEnd='';
                      var _cStartTd=tr.querySelector('[data-col="startDate"]');
                      var _cEndTd=tr.querySelector('[data-col="endDate"]');
                      var _cStart=_cStartTd?((_cStartTd.querySelector('input')||_cStartTd).value||'').trim():'';
                      var _cEnd=_cEndTd?((_cEndTd.querySelector('input')||_cEndTd).value||'').trim():'';
                      if(_cStart==='-') _cStart='';
                      if(_cEnd==='-') _cEnd='';
                      var _levelName=_depth2===2?'중분류':'소분류';
                      var _parentName=_depth2===2?'대분류':'중분류';
                      if(_pStart && _cStart && _cStart<_pStart){
                        _blsAlert(_levelName+'('+_divVal2+')의 시작일('+_cStart+')이\n'+_parentName+'('+_parentDiv+')의 시작일('+_pStart+') 이전입니다.\n\n상위 분류의 시작일~종료일 범위 내에서 입력해 주세요.',{title:'일정 범위 초과',type:'warn'});
                        return;
                      }
                      if(_pEnd && _cEnd && _cEnd>_pEnd){
                        _blsAlert(_levelName+'('+_divVal2+')의 종료일('+_cEnd+')이\n'+_parentName+'('+_parentDiv+')의 종료일('+_pEnd+') 이후입니다.\n\n상위 분류의 시작일~종료일 범위 내에서 입력해 주세요.',{title:'일정 범위 초과',type:'warn'});
                        return;
                      }
                    }
                  }
                }
              }
              cols.forEach(function(c){
                if(c.type==='computed'||c.type==='hidden'||c.locked) return;
                var td=tr.querySelector('[data-col="'+c.key+'"]'); if(!td) return;
                var el=td.querySelector('input,select,textarea');
                var v=el?(el.value||'').trim():(td.textContent||'').trim();
                if(c.dotMap){
                  td.innerHTML=_dotHtml(c, v||'-');
                } else if(c.key==='taskDoc'){
                  td.innerHTML=_buildDocLink(v||'-');
                } else {
                  td.textContent=v||'-';
                }
              });
              recompute(tr);
              tgt.setAttribute('data-action','edit'); tgt.title='편집'; tgt.setAttribute('aria-label','편집');
              tgt.innerHTML='<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon">';
              /* Unwrap actual cell from readonly input back to renderSaved HTML */
              var _actTd2=tr.querySelector('[data-col="actual"]');
              if(_actTd2){
                var _inp2=_actTd2.querySelector('input');
                var _av2=(_inp2?_inp2.value:_actTd2.textContent||'').trim()||'0';
                var _actCol=cols.filter(function(c){return c.key==='actual';})[0];
                if(_actCol&&_actCol.renderSaved){ _actTd2.innerHTML=_actCol.renderSaved(_av2); }
                else { _actTd2.textContent=_av2||'-'; }
              }
              scheduleSave();
              sortByDivision();
              refreshWbsHierarchy();
            }
          });

          /* ── Recompute on input change ── */
          tbody.addEventListener('change',function(e){ var tr=e.target.closest('tr'); if(tr) recompute(tr); });

          /* ── Task-doc link: open report detail in popup window ── */
          table.addEventListener('click',function(ev){
            var link=ev.target.closest('.wbs-doc-link'); if(!link) return;
            ev.preventDefault();
            var docNo=link.getAttribute('data-doc')||'';
            if(!docNo||docNo==='-') return;
            /* Fetch report id by doc_no then open detail page in popup */
            fetch('/api/wrk/reports?view=all&status=APPROVED,COMPLETED,ARCHIVED',{credentials:'same-origin'})
              .then(function(r){return r.json();})
              .then(function(d){
                var items=Array.isArray(d)?d:(d.items||d.data||[]);
                var match=items.find(function(it){return String(it.doc_no||'').trim()===docNo;});
                if(match&&match.id){
                  var url='/p/2.task_detail.html?id='+encodeURIComponent(match.id);
                  var w=1100, h=900;
                  var left=Math.max(0,Math.floor((window.screen.width-w)/2));
                  var top=Math.max(0,Math.floor((window.screen.height-h)/2));
                  var features='width='+w+',height='+h+',left='+left+',top='+top+',resizable=yes,scrollbars=yes';
                  var popup=window.open(url,'wrk_report_detail',features);
                  if(popup&&popup.focus) popup.focus();
                }
                else{ alert('해당 작업보고서를 찾을 수 없습니다.'); }
              }).catch(function(){alert('작업보고서 조회 중 오류가 발생했습니다.');});
          });

          /* ── 구분 help popover toggle (body-level tooltip) ── */
          (function(){
            var sec=table.closest('.detail-section,.tab-pane,.card-body')||document;
            var btn=sec.querySelector('.wbs-div-help-btn');
            if(!btn) return;
            var tipEl=null;
            function closeTip(){
              if(tipEl){ try{tipEl.parentNode.removeChild(tipEl);}catch(_){} tipEl=null; }
              btn.setAttribute('aria-expanded','false');
            }
            btn.addEventListener('click',function(e){
              e.stopPropagation();
              if(tipEl){ closeTip(); return; }
              tipEl=document.createElement('div');
              tipEl.style.cssText='position:fixed;z-index:9999;background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;box-shadow:0 8px 24px rgba(15,23,42,.13);max-width:340px;font-size:13px;line-height:1.7;';
              tipEl.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><b style="font-size:13.5px;">구분 작성규칙</b><button style="background:none;border:none;font-size:17px;cursor:pointer;padding:0 2px;color:#666;" aria-label="닫기">\u00d7</button></div>'
                +'<ul style="margin:0 0 6px 0;padding-left:16px;">'
                +'<li><strong style="color:#4f46e5;">1</strong> : 최상위 단계 (Phase / 대분류)</li>'
                +'<li><strong style="color:#4f46e5;">1.1</strong> : 하위 단계 (Activity / 중분류)</li>'
                +'<li><strong style="color:#4f46e5;">1.1.1</strong> : 세부 작업 (Task / 소분류)</li>'
                +'</ul>'
                +'<p style="margin:0;font-size:12px;color:#6b7280;">숫자와 점(.)만 입력할 수 있습니다.</p>';
              document.body.appendChild(tipEl);
              /* position near button */
              var r=btn.getBoundingClientRect();
              var tw=tipEl.offsetWidth, th=tipEl.offsetHeight;
              var left=r.left, top=r.bottom+6;
              if(left+tw>window.innerWidth-8) left=window.innerWidth-tw-8;
              if(top+th>window.innerHeight-8) top=r.top-th-6;
              tipEl.style.left=left+'px'; tipEl.style.top=top+'px';
              btn.setAttribute('aria-expanded','true');
              tipEl.querySelector('button').addEventListener('click',closeTip);
            });
            document.addEventListener('click',function(e){ if(tipEl&&e.target!==btn&&!btn.contains(e.target)&&!tipEl.contains(e.target)) closeTip(); });
          })();

          /* ── CSV export ── */
          function escCSV(v){ return '"'+String(v).replace(/"/g,'""')+'"'; }
          function doExportCSV(onlySelected){
            var headers=cols.map(function(c){return c.label;});
            var rows=allRows();
            if(onlySelected) rows=rows.filter(function(tr){var cb=tr.querySelector('.'+chkCls);return cb&&cb.checked;});
            if(!rows.length) return;
            var data=rows.map(function(tr){return cols.map(function(c){var td=tr.querySelector('[data-col="'+c.key+'"]');return td?(td.textContent||'').trim():'';});});
            var lines=[headers].concat(data).map(function(a){return a.map(escCSV).join(',');});
            var csv='\uFEFF'+lines.join('\r\n');
            var d=new Date();
            var fn=(cfg.csvFilename||cfg.prefix)+'_'+d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0')+'.csv';
            try{var bl=new Blob([csv],{type:'text/csv;charset=utf-8;'});var u=URL.createObjectURL(bl);var a=document.createElement('a');a.href=u;a.download=fn;document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);}catch(_){}
          }

          /* ── Download modal ── */
          var dp=cfg.downloadModalPrefix||cfg.prefix;
          var dmEl=document.getElementById(dp+'-download-modal');
          var dmClose=document.getElementById(dp+'-download-close');
          var dmConfirm=document.getElementById(dp+'-download-confirm');
          var dmSub=document.getElementById(dp+'-download-subtitle');
          var dmRSW=document.getElementById(dp+'-csv-range-row-selected');
          var dmOptSel=document.getElementById(dp+'-csv-range-selected');
          var dmOptAll=document.getElementById(dp+'-csv-range-all');

          if(csvBtn) csvBtn.addEventListener('click',function(){
            if(csvBtn.disabled) return;
            var total=allRows().length; if(!total) return;
            if(!dmEl){ doExportCSV(false); return; }
            var selCnt=allRows().filter(function(tr){var cb=tr.querySelector('.'+chkCls);return cb&&cb.checked;}).length;
            if(dmSub) dmSub.textContent=selCnt>0?('선택된 '+selCnt+'개 또는 전체 '+total+'개 결과 중 범위를 선택하세요.'):('현재 결과 '+total+'개 항목을 CSV로 내보냅니다.');
            if(dmRSW) dmRSW.hidden=!(selCnt>0);
            if(dmOptSel){dmOptSel.disabled=!(selCnt>0);dmOptSel.checked=selCnt>0;}
            if(dmOptAll) dmOptAll.checked=!(selCnt>0);
            _openM(dmEl);
          });
          if(dmClose) dmClose.addEventListener('click',function(){_closeM(dmEl);});
          if(dmEl){
            dmEl.addEventListener('click',function(e){if(e.target===dmEl)_closeM(dmEl);});
            document.addEventListener('keydown',function(e){if(e.key==='Escape'&&dmEl.classList.contains('show'))_closeM(dmEl);});
          }
          if(dmConfirm) dmConfirm.addEventListener('click',function(){
            var onlySel=!!(dmOptSel&&dmOptSel.checked);
            doExportCSV(onlySel); _closeM(dmEl);
          });

          /* ── Upload modal ── */
          if(uploadBtn){
            var up=cfg.uploadModalPrefix||cfg.prefix;
            var umEl=document.getElementById(up+'-upload-modal');
            var umClose=document.getElementById(up+'-upload-close');
            var umTmpl=document.getElementById(up+'-upload-template-download');
            var umAnim=document.getElementById(up+'-upload-anim');
            var umInput=document.getElementById(up+'-upload-input');
            var umDrop=document.getElementById(up+'-upload-dropzone');
            var umMeta=document.getElementById(up+'-upload-meta');
            var umChip=document.getElementById(up+'-upload-file-chip');
            var umConfirm=document.getElementById(up+'-upload-confirm');
            var currFile=null;

            function _ensureScript(src){return new Promise(function(res,rej){var s=document.createElement('script');s.src=src;s.async=true;s.onload=res;s.onerror=function(){rej(new Error('load fail'));};document.head.appendChild(s);});}
            async function _ensureXLSX(){if(window.XLSX)return;await _ensureScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');}
            async function _ensureLottie(){if(umAnim&&!window.lottie)await _ensureScript('https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js');if(umAnim&&window.lottie&&!umAnim._loaded){umAnim._loaded=true;try{window.lottie.loadAnimation({container:umAnim,renderer:'svg',loop:true,autoplay:true,path:'https://assets1.lottiefiles.com/packages/lf20_49rdyysj.json'});}catch(_){}}}

            function setChip(f){
              if(!umChip||!umMeta)return;
              if(!f){umMeta.hidden=true;umChip.innerHTML='';return;}
              var sz=(function(b){try{var i=Math.floor(Math.log(b)/Math.log(1024));return(!b&&b!==0)?'-':((b/Math.pow(1024,i)).toFixed(1)+' '+['B','KB','MB','GB','TB'][i]);}catch(_){return'-';}})(f.size||0);
              umChip.innerHTML='<span class="file-badge">'+((f.name.split('.').pop()||'').toUpperCase())+'</span><span class="name">'+f.name+'</span><span class="size">'+sz+'</span>';
              umMeta.hidden=false;
            }
            function clearFile(){currFile=null;setChip(null);if(umConfirm)umConfirm.disabled=true;if(umInput)try{umInput.value='';}catch(_){}}
            function acceptFile(f){return f&&(/\.xlsx?$/i.test(f.name||''))&&(f.size||0)<=10*1024*1024;}
            function onFile(f){if(!acceptFile(f)){clearFile();return;}currFile=f;setChip(f);if(umConfirm)umConfirm.disabled=false;}

            uploadBtn.addEventListener('click',function(){_openM(umEl);_ensureLottie();});
            if(umClose) umClose.addEventListener('click',function(){_closeM(umEl);clearFile();});
            if(umEl){
              umEl.addEventListener('click',function(e){if(e.target===umEl){_closeM(umEl);clearFile();}});
              document.addEventListener('keydown',function(e){if(e.key==='Escape'&&umEl&&umEl.classList.contains('show')){_closeM(umEl);clearFile();}});
            }
            if(umDrop){
              umDrop.addEventListener('click',function(){if(umInput)umInput.click();});
              ['dragenter','dragover'].forEach(function(n){umDrop.addEventListener(n,function(e){e.preventDefault();e.stopPropagation();umDrop.classList.add('dragover');});});
              ['dragleave','drop'].forEach(function(n){umDrop.addEventListener(n,function(e){e.preventDefault();e.stopPropagation();umDrop.classList.remove('dragover');if(n==='drop'){var dt=e.dataTransfer;if(dt&&dt.files&&dt.files[0])onFile(dt.files[0]);}});});
            }
            if(umInput) umInput.addEventListener('change',function(){var f=this.files&&this.files[0];if(f)onFile(f);});

            /* template download */
            if(umTmpl) umTmpl.addEventListener('click',async function(){
              try{
                await _ensureXLSX();
                var hd=[cols.filter(function(c){return c.type!=='computed';}).map(function(c){return c.label;})];
                var ws=window.XLSX.utils.aoa_to_sheet(hd);
                var wb=window.XLSX.utils.book_new();
                window.XLSX.utils.book_append_sheet(wb,ws,cfg.xlsxSheet||cfg.prefix);
                var wo=window.XLSX.write(wb,{bookType:'xlsx',type:'array'});
                var bl=new Blob([wo],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
                var u=URL.createObjectURL(bl);var a=document.createElement('a');a.href=u;a.download=(cfg.csvFilename||cfg.prefix)+'_template.xlsx';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);
              }catch(err){console.warn('template gen fail',err);}
            });

            /* ── Validation-error modal (dynamic overlay) ── */
            var _valErrCSS=false;
            function _injectValErrCSS(){
              if(_valErrCSS) return; _valErrCSS=true;
              var s=document.createElement('style'); s.textContent=[
                '.val-err-overlay{position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;padding:24px;}',
                '.val-err-box{background:#fff;border-radius:14px;width:620px;max-width:92vw;max-height:78vh;display:flex;flex-direction:column;box-shadow:0 24px 56px rgba(15,23,42,.22);overflow:hidden;}',
                '.val-err-hd{display:flex;align-items:center;gap:10px;padding:18px 22px;border-bottom:1px solid #fee2e2;background:#fef2f2;}',
                '.val-err-hd svg{flex-shrink:0;width:22px;height:22px;color:#dc2626;}',
                '.val-err-hd .title{font-size:15px;font-weight:700;color:#991b1b;flex:1;}',
                '.val-err-hd .cnt{font-size:12.5px;color:#b91c1c;background:#fee2e2;padding:2px 10px;border-radius:20px;font-weight:600;}',
                '.val-err-hd .close-x{border:none;background:none;font-size:20px;cursor:pointer;color:#9ca3af;padding:0 4px;line-height:1;}',
                '.val-err-hd .close-x:hover{color:#ef4444;}',
                '.val-err-body{overflow-y:auto;padding:0;flex:1;scrollbar-width:thin;scrollbar-color:#e5e7eb transparent;}',
                '.val-err-body::-webkit-scrollbar{width:6px;}',
                '.val-err-body::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:3px;}',
                '.val-err-tbl{width:100%;border-collapse:collapse;font-size:13px;}',
                '.val-err-tbl th{position:sticky;top:0;background:#f9fafb;padding:10px 14px;text-align:left;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;font-size:12px;white-space:nowrap;}',
                '.val-err-tbl td{padding:9px 14px;border-bottom:1px solid #f3f4f6;color:#1f2937;line-height:1.5;vertical-align:top;}',
                '.val-err-tbl tr:last-child td{border-bottom:none;}',
                '.val-err-tbl tr:hover td{background:#fef2f2;}',
                '.val-err-tbl .row-num{font-weight:700;color:#6366f1;text-align:center;width:48px;}',
                '.val-err-tbl .col-name{font-weight:600;color:#1e293b;white-space:nowrap;width:80px;}',
                '.val-err-tbl .val-cell{color:#dc2626;font-family:"Consolas","Monaco",monospace;font-size:12.5px;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
                '.val-err-tbl .reason{color:#6b7280;font-size:12.5px;}',
                '.val-err-ft{padding:14px 22px;border-top:1px solid #f3f4f6;display:flex;justify-content:flex-end;gap:8px;}',
                '.val-err-ft button{border:none;border-radius:8px;padding:8px 28px;font-size:13.5px;font-weight:600;cursor:pointer;transition:background .15s;}',
                '.val-err-ft .ok-btn{background:#4f46e5;color:#fff;}',
                '.val-err-ft .ok-btn:hover{background:#4338ca;}'
              ].join('\n'); document.head.appendChild(s);
            }
            function _showValidationErrors(errors, insertedCount, skippedCount){
              _injectValErrCSS();
              var ov=document.createElement('div'); ov.className='val-err-overlay';
              var box=document.createElement('div'); box.className='val-err-box';
              /* header */
              var hd=document.createElement('div'); hd.className='val-err-hd';
              hd.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.5" fill="currentColor"/></svg>'
                +'<span class="title">업로드 검증 결과</span>'
                +'<span class="cnt" style="color:#059669;background:#d1fae5;">'+(insertedCount||0)+'건 등록</span>'
                +'<span class="cnt">'+(skippedCount||0)+'건 제외</span>'
                +'<button class="close-x" aria-label="닫기">&times;</button>';
              box.appendChild(hd);
              /* summary bar */
              if(insertedCount>0||skippedCount>0){
                var sumBar=document.createElement('div');
                sumBar.style.cssText='padding:10px 22px;background:#f0fdf4;border-bottom:1px solid #bbf7d0;font-size:13px;color:#166534;';
                sumBar.innerHTML='<strong>'+insertedCount+'건</strong> 정상 등록 완료, <strong style="color:#dc2626;">'+skippedCount+'건</strong> 오류로 제외됨';
                box.appendChild(sumBar);
              }
              /* table body */
              var bd=document.createElement('div'); bd.className='val-err-body';
              var tbl='<table class="val-err-tbl"><thead><tr><th>행</th><th>컬럼</th><th>입력값</th><th>사유</th></tr></thead><tbody>';
              errors.forEach(function(e){
                tbl+='<tr><td class="row-num">'+_esc(String(e.row))+'</td>'
                  +'<td class="col-name">'+_esc(e.col)+'</td>'
                  +'<td class="val-cell" title="'+_esc(e.value)+'">'+_esc(e.value)+'</td>'
                  +'<td class="reason">'+_esc(e.reason)+'</td></tr>';
              });
              tbl+='</tbody></table>';
              bd.innerHTML=tbl; box.appendChild(bd);
              /* footer */
              var ft=document.createElement('div'); ft.className='val-err-ft';
              ft.innerHTML='<button class="ok-btn">확인</button>';
              box.appendChild(ft);
              ov.appendChild(box); document.body.appendChild(ov);
              /* close handlers */
              function closeErr(){ try{ov.parentNode.removeChild(ov);}catch(_){} }
              ft.querySelector('.ok-btn').addEventListener('click',closeErr);
              hd.querySelector('.close-x').addEventListener('click',closeErr);
              ov.addEventListener('click',function(e){if(e.target===ov) closeErr();});
              var escH=function(e){if(e.key==='Escape'){closeErr();document.removeEventListener('keydown',escH,true);}};
              document.addEventListener('keydown',escH,true);
            }

            /* import XLSX — with format validation */
            async function importXLSX(file){
              try{
                await _ensureXLSX();
                var buf=await file.arrayBuffer();
                var wb=window.XLSX.read(buf,{type:'array',cellDates:false});
                var ws=wb.Sheets[wb.SheetNames[0]];
                var rows=window.XLSX.utils.sheet_to_json(ws,{header:1,defval:'',blankrows:false,raw:true});
                if(!rows||!rows.length) return;
                var header=rows[0].map(function(v){return String(v||'').trim();});
                var idx={};
                cols.forEach(function(c){if(c.type==='computed')return;var i=header.indexOf(c.label);if(i>=0)idx[c.key]=i;});
                if(Object.keys(idx).length<1){ _showValidationErrors([{row:1,col:'헤더',value:header.slice(0,5).join(', '),reason:'올바른 헤더를 찾을 수 없습니다'}]); return; }

                /* ── Excel serial-date → YYYY-MM-DD helper ── */
                var plusOneEl=document.getElementById((cfg.uploadModalPrefix||cfg.prefix)+'-upload-plus-one');
                var plusOne=!!(plusOneEl&&plusOneEl.checked);
                function excelDateToStr(v){
                  if(typeof v==='number'&&v>30000&&v<70000){
                    var epoch=new Date(1899,11,30);
                    var d=new Date(epoch.getTime()+v*86400000);
                    if(plusOne) d.setDate(d.getDate()+1);
                    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
                  }
                  var s=String(v||'').trim().replace(/[.\/]/g,'-');
                  if(/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)){
                    var pp=s.split('-');
                    return pp[0]+'-'+pp[1].padStart(2,'0')+'-'+pp[2].padStart(2,'0');
                  }
                  return s;
                }

                /* ── Pre-fetch async valid sets for validation ── */
                var validSets={};
                var asyncP=[];
                cols.forEach(function(c){
                  if(c.type==='computed') return;
                  if(c.type==='select'&&c.options&&c.options.length&&!c.asyncOptions){
                    var ss={}; c.options.forEach(function(o){ss[o]=true;}); validSets[c.key]=ss;
                  }
                  if(c.type==='select'&&typeof c.asyncOptions==='function'){
                    asyncP.push(c.asyncOptions().then(function(opts){
                      var ss={};
                      (opts||[]).forEach(function(o){
                        var vv=(typeof o==='object'&&o!==null)?(o.value||''):String(o);
                        if(vv) ss[vv]=true;
                      });
                      validSets[c.key]=ss;
                    }).catch(function(){}));
                  }
                });
                if(asyncP.length) await Promise.all(asyncP);

                /* ── Parse & validate all data rows ── */
                var dataRows=[]; var errors=[]; var errorRowNums={};
                for(var r=1;r<rows.length;r++){
                  var rw=rows[r]||[]; var d={}; d._rowNum=r+1;
                  cols.forEach(function(c){
                    if(c.type==='computed') return;
                    var i=idx[c.key]; var raw=(i!=null&&i>=0&&i<rw.length)?rw[i]:'';
                    if(c.type==='date'&&raw) d[c.key]=excelDateToStr(raw);
                    else d[c.key]=String(raw||'').trim();
                  });
                  cols.forEach(function(c){if(c.type==='computed'&&c.compute){try{d[c.key]=String(c.compute(d)||'');}catch(_){d[c.key]='';}}});
                  var hasAny=Object.keys(d).some(function(k){return k!=='_rowNum'&&!!d[k];});
                  if(!hasAny) continue;

                  /* row-level validation */
                  var rn=d._rowNum;
                  var rowHasError=false;
                  cols.forEach(function(c){
                    if(c.type==='computed') return;
                    var v=d[c.key]||'';
                    if(!v) return;
                    /* inputFilter (e.g. division: numbers+dots only) */
                    if(c.inputFilter&&!c.inputFilter.test(v)){
                      errors.push({row:rn, col:c.label, value:v, reason:'숫자와 점(.)만 입력 가능'});
                      rowHasError=true;
                    }
                    /* date format */
                    if(c.type==='date'){
                      if(!/^\d{4}-\d{2}-\d{2}$/.test(v)){
                        errors.push({row:rn, col:c.label, value:v, reason:'YYYY-MM-DD 형식이어야 합니다'});
                        rowHasError=true;
                      } else {
                        var dt=new Date(v); if(isNaN(dt.getTime())){ errors.push({row:rn, col:c.label, value:v, reason:'유효하지 않은 날짜'}); rowHasError=true; }
                      }
                    }
                    /* select validation (all select columns including taskDoc) */
                    if(c.type==='select'&&validSets[c.key]){
                      if(!validSets[c.key][v]){
                        var allowed=Object.keys(validSets[c.key]).slice(0,6).join(', ');
                        errors.push({row:rn, col:c.label, value:v, reason:c.key==='taskDoc'?'매핑되는 작업보고서가 없습니다':'허용값: '+allowed});
                        rowHasError=true;
                      }
                    }
                  });
                  if(rowHasError){ errorRowNums[rn]=true; }
                  dataRows.push(d);
                }

                /* Split into valid / invalid rows */
                var validRows=dataRows.filter(function(d){return !errorRowNums[d._rowNum];});
                var skipCount=dataRows.length-validRows.length;

                /* ── Populate _wrkDocCache from validSets BEFORE building rows ── */
                if(validSets.taskDoc){
                  _wrkDocCache=validSets.taskDoc;
                }

                /* ── Insert valid rows ── */
                var count=0;
                validRows.forEach(function(d){
                  delete d._rowNum;
                  tbody.appendChild(buildSavedRow(d)); count++;
                });
                if(count>0){ updateEmpty(); goLast(); scheduleSave(); sortByDivision(); refreshWbsHierarchy(); }

                /* ── Show errors modal if any (after inserting valid rows) ── */
                if(errors.length>0){
                  _showValidationErrors(errors, count, skipCount);
                } else if(count===0){
                  updateEmpty();
                }
              }catch(err){
                console.error('['+cfg.prefix+'/Import]',err);
                _showValidationErrors([{row:'-', col:'-', value:'-', reason:err.message||'알 수 없는 오류'}]);
              }
            }
            if(umConfirm) umConfirm.addEventListener('click',async function(){
              if(!currFile)return; umConfirm.disabled=true;
              try{await importXLSX(currFile);}finally{umConfirm.disabled=false;_closeM(umEl);clearFile();}
            });
          }

          /* ── onInit callback ── */
          if(cfg.onInit) try{cfg.onInit(ctx);}catch(_oi){console.error('[blsMakeTabCrud] onInit error for',cfg.prefix,_oi);}
          /* ── initial state ── */
          updateEmpty();
        }catch(_){/* safe-guard */}
      };
    }


    // ── Expose factory + helpers globally for per-tab JS files ──
    window.blsMakeTabCrud = blsMakeTabCrud;
    window._blsEsc = _esc;
    window._blsOpenM = _openM;
    window._blsCloseM = _closeM;
    window._blsAlert = _blsAlert;
    window.__blsSearchableSelectFn = _blsSearchableSelect;

    // tab81~tab90 configs → 개별 JS 파일로 분리됨
    // tab81-integrity.js, tab82-scope.js, tab84-cost.js,
    // tab85-quality.js, tab86-resource.js, tab90-stakeholder.js


  })();

  // ───── SPA Tab Switching: intercept project tab clicks, swap Box3 via fetch ─────
  (function(){
    function setupProjectSPA(){
      try{
        var tabBar = document.querySelector('.server-detail-tabs[aria-label="\uD504\uB85C\uC81D\uD2B8 \uB0B4\uC6A9 \uD0ED"]');
        if(!tabBar) return;
        var links = tabBar.querySelectorAll('a.server-detail-tab-btn[href]');
        if(!links || !links.length) return;

        // Map route keys → init function keys
        var INIT_MAP = {
          'proj_completed_detail':        'overview',
          'proj_completed_integrity':     'tab81',
          'proj_completed_scope':         'tab82',
          'proj_completed_schedule':      'tab83',
          'proj_completed_cost':          'tab84',
          'proj_completed_quality':       'tab85',
          'proj_completed_resource':      'tab86',
          'proj_completed_communication': 'tab87',
          'proj_completed_risk':          'tab88',
          'proj_completed_procurement':   'tab89',
          'proj_completed_stakeholder':   'tab90'
        };

        // Per-tab JS files for dynamic loading (SPA tab switch)
        var SCRIPT_MAP = {
          'tab81':'tab81-integrity.js','tab82':'tab82-scope.js','tab83':'tab83-schedule.js',
          'tab84':'tab84-cost.js','tab85':'tab85-quality.js','tab86':'tab86-resource.js',
          'tab87':'tab87-communication.js','tab88':'tab88-risk.js','tab89':'tab89-procurement.js',
          'tab90':'tab90-stakeholder.js'
        };
        var SCRIPT_BASE='/static/js/8.project/8-1.project/8-1-3.project_list/';
        var SCRIPT_VER='20260303g';
        var _loadedScripts={};

        function ensureTabScript(tabKey){
          return new Promise(function(resolve){
            if(!tabKey||tabKey==='overview'){ resolve(); return; }
            if(_loadedScripts[tabKey]||
               (window.__blsTabInits&&typeof window.__blsTabInits[tabKey]==='function')){
              resolve(); return;
            }
            var name=SCRIPT_MAP[tabKey];
            if(!name){ resolve(); return; }
            var s=document.createElement('script');
            s.src=SCRIPT_BASE+name+'?v='+SCRIPT_VER;
            s.onload=function(){ _loadedScripts[tabKey]=true; resolve(); };
            s.onerror=function(){ console.warn('[SPA] failed to load',name); resolve(); };
            document.head.appendChild(s);
          });
        }

        function routeKey(url){
          try{
            var path = (typeof url === 'string') ? url : '';
            var m = path.match(/\/p\/(proj_completed_\w+)/);
            return m ? m[1] : null;
          }catch(_){ return null; }
        }

        // DOM cache: { routeKey: { box3: HTMLElement, modals: [HTMLElement,...] } }
        var paneCache = {};
        var htmlCache = {};
        var currentKey = routeKey(location.pathname);

        // Capture the current tab's Box3 + modals into cache
        function captureCurrentPane(){
          if(!currentKey) return;
          if(paneCache[currentKey]) return; // already captured
          var box3 = document.querySelector('.detail-section.mt-16');
          if(!box3) return;
          // Tab-specific modals: sibling elements between </main> and first <script>
          var main = document.querySelector('main.main-content');
          var modals = [];
          if(main){
            var sib = main.nextElementSibling;
            while(sib){
              if(sib.tagName === 'SCRIPT') break;
              modals.push(sib);
              sib = sib.nextElementSibling;
            }
          }
          paneCache[currentKey] = { box3: box3, modals: modals };
        }

        captureCurrentPane();

        // Replace state so popstate works for the initial page too
        try{ history.replaceState({ rk: currentKey }, '', location.pathname + location.search); }catch(_){}

        function switchTab(targetUrl, clickedLink){
          var targetKey = routeKey(targetUrl);
          if(!targetKey){ blsSpaNavigate(targetUrl); return; }
          if(targetKey === currentKey) return;

          // 1. Detach current pane from DOM (keep in cache)
          captureCurrentPane();
          var curPane = paneCache[currentKey];
          if(curPane){
            try{ curPane.box3.remove(); }catch(_){}
            curPane.modals.forEach(function(m){ try{ m.remove(); }catch(_){} });
          }

          // 2. Update active tab
          Array.prototype.forEach.call(links, function(l){
            l.classList.remove('active');
            l.setAttribute('aria-selected','false');
          });
          if(clickedLink){
            clickedLink.classList.add('active');
            clickedLink.setAttribute('aria-selected','true');
          }

          // 3. Attach target pane (from cache or fetch)
          var contentWrap = document.querySelector('.content-wrapper');
          var main = document.querySelector('main.main-content');

          function attachPane(pane){
            if(!pane) return;
            // Insert Box3 at end of .content-wrapper
            if(contentWrap && pane.box3){
              contentWrap.appendChild(pane.box3);
            }
            // Insert modals before first <script> after </main>
            if(main && pane.modals && pane.modals.length){
              var insertRef = main.nextElementSibling;
              while(insertRef && insertRef.tagName !== 'SCRIPT') insertRef = insertRef.nextElementSibling;
              pane.modals.forEach(function(m){
                if(insertRef && insertRef.parentNode){
                  insertRef.parentNode.insertBefore(m, insertRef);
                } else {
                  document.body.appendChild(m);
                }
              });
            }
          }

          if(paneCache[targetKey]){
            // Cached: instant switch
            attachPane(paneCache[targetKey]);
            currentKey = targetKey;
            try{ history.pushState({ rk: targetKey }, '', targetUrl); }catch(_){}
          } else {
            // Fetch and parse
            (async function(){
              try{
                var html = htmlCache[targetUrl];
                if(!html){
                  var resp = await fetch(targetUrl, { credentials: 'same-origin' });
                  html = await resp.text();
                  htmlCache[targetUrl] = html;
                }
                var parser = new DOMParser();
                var doc = parser.parseFromString(html, 'text/html');
                var newBox3 = doc.querySelector('.detail-section.mt-16');
                // Extract tab-specific modals: between </main> and <script>
                var docMain = doc.querySelector('main.main-content');
                var newModals = [];
                if(docMain){
                  var sib = docMain.nextElementSibling;
                  while(sib){
                    if(sib.tagName === 'SCRIPT') break;
                    newModals.push(document.adoptNode(sib));
                    sib = docMain.nextElementSibling;
                  }
                }
                if(newBox3){
                  newBox3 = document.adoptNode(newBox3);
                }
                var pane = { box3: newBox3, modals: newModals };
                paneCache[targetKey] = pane;
                attachPane(pane);
                currentKey = targetKey;
                try{ history.pushState({ rk: targetKey }, '', targetUrl); }catch(_){}

                // Run tab-specific init (reset guard flag since DOM is fresh from fetch)
                var initKey = INIT_MAP[targetKey];
                // Dynamically load per-tab JS if not yet loaded
                var _wasLoaded = !!(window.__blsTabInits && typeof window.__blsTabInits[initKey] === 'function');
                await ensureTabScript(initKey);
                if(initKey && window.__blsTabInits && typeof window.__blsTabInits[initKey] === 'function'){
                  if(_wasLoaded){
                    // Script was already loaded from a previous visit — reset flags and re-init
                    if(window.__blsInitFlags){
                      var flagKey = initKey + '_done'; // tab83, tab87 etc.
                      if(window.__blsInitFlags[flagKey]) delete window.__blsInitFlags[flagKey];
                      // blsMakeTabCrud uses prefix_crud_ok pattern
                      var PREFIX_MAP = {tab81:'rq',tab82:'wbs',tab84:'eva',tab85:'quality',tab86:'raci',tab87:'cm',tab88:'rk',tab89:'pc',tab90:'stakeholder'};
                      var pfx = PREFIX_MAP[initKey];
                      if(pfx && window.__blsInitFlags[pfx+'_crud_ok']) delete window.__blsInitFlags[pfx+'_crud_ok'];
                      if(initKey==='tab88' && window.__blsInitFlags.tab88_fmea_initialized)
                        delete window.__blsInitFlags.tab88_fmea_initialized;
                      if(initKey==='tab89' && window.__blsInitFlags.tab89_tco_initialized)
                        delete window.__blsInitFlags.tab89_tco_initialized;
                    }
                    window.__blsTabInits[initKey]();
                  }
                  // else: script was just loaded → its self-execution already initialized
                }
              }catch(err){
                console.warn('[SPA] fetch failed, falling back', err);
                blsSpaNavigate(targetUrl);
              }
            })();
          }
        }

        // Intercept tab link clicks
        Array.prototype.forEach.call(links, function(link){
          link.addEventListener('click', function(e){
            if(link.classList.contains('active')){ e.preventDefault(); return; }
            e.preventDefault();
            switchTab(link.href, link);
          });
        });

        // Handle browser back/forward
        window.addEventListener('popstate', function(e){
          try{
            var rk = (e.state && e.state.rk) ? e.state.rk : null;
            if(!rk) return;
            var targetLink = null;
            Array.prototype.forEach.call(links, function(l){
              if(routeKey(l.href) === rk) targetLink = l;
            });
            if(targetLink){
              switchTab(targetLink.href, targetLink);
            }
          }catch(_){ }
        });

        // Prefetch all other tabs in background for instant switching
        setTimeout(function(){
          Array.prototype.forEach.call(links, function(link){
            if(link.classList.contains('active')) return;
            var url = link.href;
            if(htmlCache[url]) return;
            fetch(url, { credentials: 'same-origin' }).then(function(r){
              return r.text();
            }).then(function(html){
              htmlCache[url] = html;
            }).catch(function(){});
          });
        }, 500);

      }catch(err){ console.warn('[SPA] setup error', err); }
    }

    if(document.readyState !== 'loading'){ setupProjectSPA(); }
    else { document.addEventListener('DOMContentLoaded', setupProjectSPA); }
  })();

// ═══════ 프로젝트 수정 모달 — 독립 안전망 (Safety Net) ═══════
// 메인 ready() 콜백 내 이전 코드에서 오류 발생 시에도
// 수정 모달이 정상 동작하도록 독립적으로 등록하는 폴백입니다.
(function __prjEditSafetyNet(){
  'use strict';
  function run(){
    try{
      /* 이미 메인 IIFE가 성공한 경우 건너뛰기 */
      if(window.__prjEditFabBound) return;

      var fab = document.getElementById('project-edit-fab');
      if(!fab) return;
      var modal = document.getElementById('system-edit-modal');
      var form  = document.getElementById('system-edit-form');
      if(!modal || !form) return;

      /* ── 헬퍼 ── */
      function _esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
      function fmt(n){ var s=String(n||'').replace(/[^0-9]/g,''); return s? s.replace(/\B(?=(\d{3})+(?!\d))/g,',') : ''; }
      function norm(d){
        if(!d) d={};
        return {
          project_name: d.project_name||d.projectName||'',
          project_type: d.project_type||d.projectType||'',
          owner_dept: d.owner_dept||d.ownerDept||'',
          owner: d.owner||'',
          priority: d.priority||'',
          participants: d.participants||'',
          description: d.description||'',
          status: d.status||'',
          budget_amount: (d.budget_amount!=null?d.budget_amount:(d.budgetAmount!=null?d.budgetAmount:'')),
          start_date: d.start_date||d.startDate||'',
          expected_end_date: d.expected_end_date||d.expectedEndDate||d.end_date||d.endDate||'',
          task_count_cached: (d.task_count_cached!=null?d.task_count_cached:(d.taskCount!=null?d.taskCount:'')),
          progress_percent: (d.progress_percent!=null?d.progress_percent:(d.progressPercent!=null?d.progressPercent:(d.progress!=null?d.progress:'')))
        };
      }
      function genInput(col,v){
        v=String(v==null?'':v);
        if(col==='status') return '<select name="status" class="form-input search-select" data-searchable="true" data-placeholder="선택" required><option value="">선택</option><option value="예정"'+(v==='예정'?' selected':'')+'>예정</option><option value="진행"'+(v==='진행'?' selected':'')+'>진행</option><option value="완료"'+(v==='완료'?' selected':'')+'>완료</option><option value="보류"'+(v==='보류'?' selected':'')+'>보류</option></select>';
        if(col==='project_type') return '<select name="project_type" class="form-input search-select" data-searchable="true" data-placeholder="선택" required><option value="">선택</option><option value="신규 구축"'+(v==='신규 구축'?' selected':'')+'>신규 구축</option><option value="개선/고도화"'+(v==='개선/고도화'?' selected':'')+'>개선/고도화</option><option value="유지보수"'+(v==='유지보수'?' selected':'')+'>유지보수</option><option value="운영지원"'+(v==='운영지원'?' selected':'')+'>운영지원</option></select>';
        if(col==='priority') return '<select name="priority" class="form-input search-select" data-searchable="true" data-placeholder="선택"><option value="">선택</option><option value="긴급"'+(v==='긴급'?' selected':'')+'>긴급</option><option value="일반"'+(v==='일반'?' selected':'')+'>일반</option><option value="낮음"'+(v==='낮음'?' selected':'')+'>낮음</option></select>';
        if(col==='budget'){ var f=(v===''||v==='null')?'':fmt(v); return '<input name="budget" type="text" inputmode="numeric" pattern="[0-9,]*" class="form-input" value="'+_esc(f)+'" placeholder="숫자">'; }
        if(col==='description') return '<textarea name="description" class="form-input textarea-large" placeholder="설명">'+_esc(v)+'</textarea>';
        return '';
      }

      /* ── fillEditFormDetail (등록 모달과 100% 동일 레이아웃) ── */
      function fillForm(raw){
        var d=norm(raw);
        var V={
          project_name:d.project_name, project_type:d.project_type,
          priority:d.priority, description:d.description, status:d.status,
          budget:(d.budget_amount==null?'':d.budget_amount),
          start_date:d.start_date, end_date:d.expected_end_date,
          owner_dept:d.owner_dept, owner:d.owner,
          participants:d.participants,
          task_count:(d.task_count_cached==null?'':d.task_count_cached),
          progress:(d.progress_percent==null?'':d.progress_percent)
        };
        var pv=V.progress?(String(V.progress).endsWith('%')?V.progress:V.progress+'%'):'';
        form.innerHTML=''
          +'<div class="form-section">'
          +  '<div class="section-header"><h4>기본 정보</h4></div>'
          +  '<div class="form-grid">'
          +    '<div class="form-row form-row-wide"><label>프로젝트 이름<span class="required">*</span></label><input name="project_name" class="form-input" placeholder="이름" value="'+_esc(V.project_name)+'" required></div>'
          +    '<div class="form-row"><label>유형<span class="required">*</span></label>'+genInput('project_type',V.project_type)+'</div>'
          +    '<div class="form-row"><label>우선순위</label>'+genInput('priority',V.priority)+'</div>'
          +    '<div class="form-row form-row-wide"><label>설명</label><textarea name="description" class="form-input textarea-large" placeholder="설명">'+_esc(V.description)+'</textarea></div>'
          +  '</div>'
          +'</div>'
          +'<div class="form-section">'
          +  '<div class="section-header"><h4>진행/일정</h4></div>'
          +  '<div class="form-grid">'
          +    '<div class="form-row"><label>상태<span class="required">*</span></label>'+genInput('status',V.status)+'</div>'
          +    '<div class="form-row"><label>예산</label>'+genInput('budget',V.budget)+'</div>'
          +    '<div class="form-row"><label>시작일</label><input name="start_date" class="form-input date-input" placeholder="YYYY-MM-DD" value="'+_esc(V.start_date)+'" readonly></div>'
          +    '<div class="form-row"><label>(예상)종료일</label><input name="end_date" class="form-input date-input" placeholder="YYYY-MM-DD" value="'+_esc(V.end_date)+'" readonly></div>'
          +  '</div>'
          +'</div>'
          +'<input type="hidden" name="owner_dept" value="'+_esc(V.owner_dept)+'">'
          +'<input type="hidden" name="owner" value="'+_esc(V.owner)+'">'
          +'<input type="hidden" name="participants" value="'+_esc(V.participants)+'">'
          +'<input type="hidden" name="task_count" value="'+_esc(V.task_count)+'">'
          +'<input type="hidden" name="progress" value="'+_esc(pv)+'">';
        try{ if(window.BlossomSearchableSelect && window.BlossomSearchableSelect.enhance) window.BlossomSearchableSelect.enhance(form); }catch(_){}
        /* 예산 입력 시 실시간 3자리 콤마 */
        try{
          var _bgi2=form.querySelector('input[name="budget"]');
          if(_bgi2) _bgi2.addEventListener('input',function(){
            var c=this.selectionStart, raw=this.value.replace(/[^0-9]/g,'');
            if(!raw){ this.value=''; return; }
            var formatted=Number(raw).toLocaleString();
            var diff=formatted.length-this.value.length;
            this.value=formatted;
            this.setSelectionRange(c+diff,c+diff);
          });
        }catch(_bg){}
        /* flatpickr for date-input fields */
        try{
          var fpBase='/static/vendor/flatpickr/4.6.13';
          function _sfnCss(h,id){ if(id&&document.getElementById(id))return; var l=document.createElement('link');l.rel='stylesheet';l.href=h;if(id)l.id=id;document.head.appendChild(l); }
          function _sfnJs(s){ return new Promise(function(r,j){ var x=document.createElement('script');x.src=s;x.async=true;x.onload=function(){r();};x.onerror=function(){j();}; document.head.appendChild(x); }); }
          _sfnCss(fpBase+'/flatpickr.min.css','flatpickr-css');
          _sfnCss(fpBase+'/themes/airbnb.css','flatpickr-theme-css');
          var pFp=window.flatpickr?Promise.resolve():_sfnJs(fpBase+'/flatpickr.min.js').then(function(){return _sfnJs(fpBase+'/l10n/ko.js').catch(function(){});});
          pFp.then(function(){
            if(!window.flatpickr)return;
            var ko=(window.flatpickr.l10ns&&window.flatpickr.l10ns.ko)?window.flatpickr.l10ns.ko:'ko';
            form.querySelectorAll('input.date-input').forEach(function(el){
              if(el._flatpickr)return;
              function tb(fp){var c=fp&&fp.calendarContainer;if(!c||c.querySelector('.fp-today-btn'))return;var b=document.createElement('button');b.type='button';b.className='fp-today-btn';b.textContent='\uc624\ub298';b.addEventListener('click',function(){fp.setDate(new Date(),true);});c.appendChild(b);}
              window.flatpickr(el,{dateFormat:'Y-m-d',allowInput:true,disableMobile:true,clickOpens:true,appendTo:document.body,locale:ko,onReady:function(_s,_d,i){tb(i);},onOpen:function(_s,_d,i){tb(i);}});
            });
          }).catch(function(){});
        }catch(_){}
      }

      /* ── 모달 열기/닫기 ── */
      function openM(){
        modal.setAttribute('aria-hidden','false'); modal.hidden=false;
        modal.classList.add('show'); document.body.classList.add('modal-open');
        try{ if(window.__blsInitDatePickers) window.__blsInitDatePickers(modal); }catch(_){}
        try{ requestAnimationFrame(function(){ if(window.BlossomSearchableSelect && window.BlossomSearchableSelect.syncAll) window.BlossomSearchableSelect.syncAll(modal); }); }catch(_){}
      }
      function closeM(){
        modal.setAttribute('aria-hidden','true'); modal.hidden=true;
        modal.classList.remove('show');
        if(!document.querySelector('.modal-overlay-full.show')) document.body.classList.remove('modal-open');
      }

      /* ── FAB 클릭 → 수정 모달 열기 ── */
      fab.addEventListener('click', function(){
        var data={};
        try{ var raw=sessionStorage.getItem('project_selected_row'); if(raw) data=JSON.parse(raw); }catch(_){}
        fillForm(data);
        openM();
        try{ var first=form.querySelector('.form-input'); if(first) first.focus(); }catch(_){}
      });

      /* ── 닫기 ── */
      var closeBtn=document.getElementById('system-edit-close');
      if(closeBtn) closeBtn.addEventListener('click', closeM);
      if(modal){ modal.addEventListener('click', function(e){ if(e.target===modal) closeM(); }); }
      document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modal && !modal.hidden) closeM(); });

      window.__prjEditFabBound = true;
      console.info('[prj-edit-safety] fallback edit-modal handler registered');
    }catch(err){ console.error('[prj-edit-safety] error:', err); }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();

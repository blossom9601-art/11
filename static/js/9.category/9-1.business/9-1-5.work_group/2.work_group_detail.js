// Manufacturer detail: Manager tab logic (clean, manager-only)

// Early: apply saved sidebar state to <html> before layout to prevent flash
// and ensure detail.css !important rules (html.sidebar-collapsed) match.
(function(){
  try {
    var root = document && document.documentElement;
    if (!root) return;
    var state = localStorage.getItem('sidebarState');
    root.classList.remove('sidebar-hidden', 'sidebar-collapsed');
    if (state === 'hidden') root.classList.add('sidebar-hidden');
    else if (state === 'collapsed') root.classList.add('sidebar-collapsed');
  } catch (_e) {}
})();

(function(){
  'use strict';

  // Manager tab logic moved to shared /static/js/_detail/tab42-manager.js
  try{
    var cls = document.body && document.body.classList;
    if(cls && (
      cls.contains('page-vpn-manager')
      || cls.contains('page-dedicatedline-manager')
      || cls.contains('page-workgroup-manager')
      || cls.contains('page-vendor-manufacturer-manager')
      || cls.contains('page-vendor-maintenance-manager')
    )){ return; }
    var path = (location && location.pathname || '').toLowerCase();
    if(/tab42-manager\.html$/.test(path)){ return; }
  }catch(_){ }

  function ready(fn){
    window.__wgDetailFn = fn;
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', fn); else fn();
    if(!window.__wgDetailListenerAdded){
      window.__wgDetailListenerAdded = true;
      document.addEventListener('blossom:pageLoaded', function(){ try{ if(window.__wgDetailFn) window.__wgDetailFn(); }catch(_){} });
    }
  }

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

        // 기본정보 수정 모달 동작: 열기/닫기/저장 (제조사 상세)
        var EDIT_MODAL_ID = 'system-edit-modal';
        var EDIT_FORM_ID = 'system-edit-form';
        var EDIT_OPEN_ID = 'detail-edit-open';
        var EDIT_CLOSE_ID = 'system-edit-close';
        var EDIT_SAVE_ID = 'system-edit-save';
        function openModalLocal(id){ try{ var m=document.getElementById(id); if(m){ m.classList.add('show'); m.setAttribute('aria-hidden','false'); document.body.classList.add('modal-open'); } }catch(_){ } }
        function closeModalLocal(id){ try{ var m=document.getElementById(id); if(m){ m.classList.remove('show'); m.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } } }catch(_){ } }
        function getText(id){ var el=document.getElementById(id); return el? (el.textContent||'').trim():''; }
        function setText(id, val){ var el=document.getElementById(id); if(el){ el.textContent = String(val==null? '': val); } }
        // Manufacturer edit labels and form
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
            if(window.BlossomTab41System && typeof window.BlossomTab41System.initAllocationTable === 'function'){
              try{ if(window.BlossomTab41System.initAllocationTable()) return; }catch(_){ }
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

    // ---------- Work Group Basic Info (2.work_group_detail.html) ----------
    (function(){
      try{
        // NOTE: these pages are routed as /p/<key> so pathname won't include template paths.
        // Since this script is only included on Work Group templates, use a DOM-based guard.
        var isWorkGroupAnyTab = !!document.getElementById('page-header-title') || !!document.querySelector('.server-detail-tabs');
        if(!isWorkGroupAnyTab) return;

        function safeTrim(v){ return (v==null)?'':String(v).trim(); }
        function fetchJson(url){
          return fetch(url, { method:'GET', headers:{ Accept:'application/json' }, credentials:'same-origin' })
            .then(function(res){
              return res.json().catch(function(){ return {}; }).then(function(json){ return { ok: res.ok, json: json }; });
            });
        }

        // ---- Payload utility helpers (read/write URL params & sessionStorage) ----
        var SESSION_KEY = 'work_group_selected_row';
        function readPayloadFromQuery(){
          try{
            var qs = new URLSearchParams((location && location.search) || '');
            var id = qs.get('id') || qs.get('group_id') || '';
            if(!id) return null;
            var p = {};
            qs.forEach(function(v, k){ p[k] = v; });
            if(!p.group_id && p.id) p.group_id = p.id;
            return p;
          }catch(_){ return null; }
        }
        function readPayloadFromSession(){
          try{
            var raw = sessionStorage.getItem(SESSION_KEY);
            if(!raw) return null;
            var p = JSON.parse(raw);
            return (p && (p.id || p.group_id)) ? p : null;
          }catch(_){ return null; }
        }
        function writePayloadToSession(p){
          try{ if(p) sessionStorage.setItem(SESSION_KEY, JSON.stringify(p)); }catch(_){}
        }
        function normalizePayload(raw){
          if(!raw) return {};
          var p = {};
          var text = function(v){ return (v==null)?'':String(v).trim(); };
          p.id = text(raw.id);
          p.group_id = text(raw.id || raw.group_id);
          p.group_code = text(raw.group_code);
          p.wc_name = text(raw.group_name || raw.wc_name);
          p.wc_desc = text(raw.description || raw.wc_desc);
          p.work_status = text(raw.status_code || raw.work_status);
          p.sys_dept = text(raw.dept_code || raw.sys_dept);
          p.sys_dept_name = text(raw.dept_name || raw.sys_dept_name);
          p.hw_count = text(raw.hw_count);
          p.sw_count = text(raw.sw_count);
          p.work_priority = text(raw.priority != null ? raw.priority : raw.work_priority);
          p.note = text(raw.remark || raw.note);
          return p;
        }
        function buildSearchFromPayload(p){
          if(!p) return '';
          var qs = new URLSearchParams();
          ['id','group_id','wc_name','wc_desc','work_status','sys_dept','hw_count','sw_count','work_priority','note'].forEach(function(k){
            var v = (p[k] != null) ? String(p[k]) : '';
            if(v) qs.set(k, v);
          });
          var s = qs.toString();
          return s ? ('?' + s) : '';
        }
        function ensureTabLinksHaveSearch(search){
          try{
            if(!search) return;
            var links = document.querySelectorAll('.server-detail-tab-btn');
            links.forEach(function(a){
              var href = (a.getAttribute('href') || '').split('?')[0];
              a.setAttribute('href', href + search);
            });
          }catch(_){}
        }
        function renderFromStorage(){
          try{ renderStatsFromDom(); }catch(_){}
        }

        var _statusMapPromise = null;
        var _statusMetaPromise = null;

        function _fallbackStatusColorByName(name){
          var v = safeTrim(name);
          if(v === '가동') return 'ws-run';
          if(v === '유휴') return 'ws-idle';
          if(v === '대기') return 'ws-wait';
          if(v === '점검') return 'ws-wait';
          if(v === '종료') return 'ws-wait';
          if(v === '예비') return 'ws-idle';
          return 'ws-wait';
        }

        function getWorkStatusMeta(){
          if(_statusMetaPromise) return _statusMetaPromise;
          _statusMetaPromise = fetchJson('/api/work-statuses?_=' + Date.now())
            .then(function(r){
              var json = (r && r.json) || {};
              var items = (json && json.items) || [];
              // Initial render
              renderFromStorage();
              return items;
            });
          return _statusMetaPromise;
        }

        function applyPayloadToDom(p){
          try{
            // -- Title / Subtitle (server-rendered; JS updates if API provides newer data) --
            var titleEl = document.getElementById('page-header-title');
            var subtitleEl = document.getElementById('page-header-subtitle');
            var wcName = safeTrim(p.wc_name || p.group_name);
            var groupCode = safeTrim(p.group_code);
            if(titleEl && wcName) titleEl.textContent = wcName;
            if(subtitleEl){
              if(groupCode) subtitleEl.textContent = groupCode;
              else if(wcName) subtitleEl.textContent = wcName;
            }

            // -- Work Group 기본정보 --
            if(p.wc_name){ var n=document.getElementById('mf-wc-name'); if(n) n.textContent = p.wc_name; }
            if(p.group_code){ var gc=document.getElementById('mf-group-code'); if(gc) gc.textContent = p.group_code; }
            if(p.wc_desc){ var d=document.getElementById('mf-wc-desc'); if(d) d.textContent = p.wc_desc; }
            if(p.sys_dept_name){ var dp=document.getElementById('mf-sys-dept'); if(dp) dp.textContent = p.sys_dept_name; }
            else if(p.sys_dept){ var dp2=document.getElementById('mf-sys-dept'); if(dp2) dp2.textContent = p.sys_dept; }
            if(p.work_status){
              var ws=document.getElementById('mf-work-status');
              if(ws){
                ws.textContent = p.work_status; // raw code initially
                // Resolve status code → display label + pill style asynchronously
                ensureLookupsLoaded().then(function(){
                  var label = LOOKUPS.statusNameByCode && LOOKUPS.statusNameByCode[p.work_status];
                  var displayName = label || p.work_status;
                  var cls = (LOOKUPS.statusColorByCode && LOOKUPS.statusColorByCode[p.work_status])
                    ? LOOKUPS.statusColorByCode[p.work_status]
                    : (_fallbackStatusColorByName(displayName) || 'ws-wait');
                  ws.innerHTML = '<span class="status-pill"><span class="status-dot '+cls+'" aria-hidden="true"></span><span class="status-text">'+escapeHTML(displayName)+'</span></span>';
                });
              }
            }
            if(p.work_priority){ var f=document.getElementById('mf-work-priority'); if(f) f.textContent = p.work_priority; }
            if(p.note){ var g=document.getElementById('mf-note'); if(g) g.textContent = p.note; }
            // Store useful values for other renderers
            var pane = document.getElementById('basic');
            if(pane){
              if(p.hw_count) pane.dataset.hwCount = String(p.hw_count);
              if(p.sw_count) pane.dataset.swCount = String(p.sw_count);
              if(p.group_id) pane.dataset.groupId = String(p.group_id);
              if(p.id) pane.dataset.id = String(p.id);
              if(p.group_code) pane.dataset.groupCode = String(p.group_code);
              // Keep raw reference codes for edit modal pre-select
              if(p.sys_dept) pane.dataset.sysDept = String(p.sys_dept);
              if(p.work_status) pane.dataset.workStatus = String(p.work_status);
              if(p.work_priority) pane.dataset.workPriority = String(p.work_priority);
            }

            try{
              if(typeof window !== 'undefined' && window.dispatchEvent && typeof CustomEvent !== 'undefined'){
                window.dispatchEvent(new CustomEvent('workGroup:payload', { detail: p }));
              }
            }catch(_ev){ }
          }catch(_){ }
        }

        // Load payload from URL first; fall back to sessionStorage; then DOM attribute
        var payload = readPayloadFromQuery() || readPayloadFromSession();
        if(!payload){
          // Last resort: read id from server-side cat_detail_id embedded in body
          try{
            var domId = document.body && document.body.getAttribute('data-cat-detail-id');
            if(domId && parseInt(domId,10) > 0) payload = { id: domId, group_id: domId };
          }catch(_){}
        }
        if(payload){
          writePayloadToSession(payload);
          applyPayloadToDom(payload);
        }

        function getQueryParams(){
          try{ return new URLSearchParams((location && location.search) || ''); }catch(_){ return new URLSearchParams(); }
        }
        function refreshLinksAndUrlFromPayload(p){
          // Clean URL mode: do NOT push query params into the URL.
          // The server session (cat_detail_ctx_v1) holds the context.
          // Tab links are already clean in the template (no query string).
        }

        // Keep context across the 7 tabs by appending search to tab links.
        // If current URL has no search but we have payload, synthesize it.
        refreshLinksAndUrlFromPayload(payload);

        // If we only have group_id (or minimal params), hydrate from API so refresh/bookmark works.
        function hydrateWorkGroupById(groupId, existing){
          try{
            var gid = parseInt(String(groupId||''), 10);
            if(isNaN(gid) || gid <= 0) return;
            fetch('/api/work-groups/' + gid + '?_=' + Date.now(), { method:'GET', headers:{ Accept:'application/json' }, credentials:'same-origin' })
              .then(function(res){
                return res.json().catch(function(){ return {}; }).then(function(json){ return { ok: res.ok, json: json }; });
              })
              .then(function(r){
                var ok = r && r.ok;
                var json = (r && r.json) || {};
                if(!ok || json.success === false) throw new Error(json && json.message ? json.message : '업무 그룹 정보를 불러오지 못했습니다.');
                var found = json.item || null;
                if(!found) return null;
                var merged = normalizePayload(found);
                // preserve explicitly passed id/group_id if API omitted
                if(existing){
                  if(!merged.group_id && existing.group_id) merged.group_id = String(existing.group_id);
                  if(!merged.id && existing.id) merged.id = String(existing.id);
                }
                return merged;
              })
              .then(function(merged){
                if(!merged) return;
                payload = merged;
                writePayloadToSession(merged);
                applyPayloadToDom(merged);
                refreshLinksAndUrlFromPayload(merged);
                try{ renderStatsFromDom(); }catch(_s){ }
                try{ renderServiceStats(merged.group_id || merged.id); }catch(_sv){ }
              })
              .catch(function(_err){ /* silent: keep placeholder */ });
          }catch(_){ }
        }

        // Always hydrate from API to ensure detail shows latest DB data
        if(payload && (payload.group_id || payload.id)){
          hydrateWorkGroupById(payload.group_id || payload.id, payload);
        }

        // Local helper: animated no-data sticker (same as manufacturer block)
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
                (altText||'데이터 없음').split('\n').forEach(function(line, i){ var cap=document.createElement('span'); cap.textContent=line; cap.style.display='block'; cap.style.fontSize = i===0 ? '14px' : '13px'; cap.style.color='#64748b'; capWrap.appendChild(cap); });
                wrap.appendChild(capWrap); container.appendChild(wrap);
              }catch(_f){ }
            }
            if(!renderLottie()){ if(!window.lottie){ loadLottieAndRender(); } else { renderImageFallback(); } }
          }catch(_){ }
        }
        function getInt(v){ var n=parseInt(String(v||'').replace(/[^0-9-]/g,''),10); return (isNaN(n)||!isFinite(n))?0:n; }
        function renderStatsFromDom(){
          try{
            var pane = document.getElementById('basic');
            var hwDom = getInt((pane && pane.dataset && pane.dataset.hwCount) ? pane.dataset.hwCount : ((document.getElementById('mf-hardware-qty')||{}).textContent||''));
            var swDom = getInt((pane && pane.dataset && pane.dataset.swCount) ? pane.dataset.swCount : ((document.getElementById('mf-software-qty')||{}).textContent||''));
            var total = hwDom + swDom;
            var emptyEl = document.getElementById('sys-empty');
            var pieEl = document.getElementById('sys-pie');
            var pieWrap = pieEl ? pieEl.closest('.pie-wrap') : null;
            var legendEl = (function(){ var wrap = (pieEl && pieEl.parentElement) || null; return wrap? wrap.querySelector('.pie-legend') : document.querySelector('.pie-legend'); })();
            function pct(n){ return total>0 ? Math.round((n/total)*100) : 0; }
            var hwLegend = document.getElementById('sys-hw-legend'); if(hwLegend) hwLegend.textContent = hwDom + ' ('+pct(hwDom)+'%)';
            var swLegend = document.getElementById('sys-sw-legend'); if(swLegend) swLegend.textContent = swDom + ' ('+pct(swDom)+'%)';
            var isEmpty = (total<=0);
            if(emptyEl){
              if(isEmpty){
                emptyEl.style.display = '';
                emptyEl.hidden = false;
                try{ showNoDataImage(emptyEl, '할당 시스템 내역이 없습니다.\n시스템 탭에서 시스템을 할당하세요.'); }catch(_s){}
              } else {
                emptyEl.style.display = 'none';
                emptyEl.hidden = true;
              }
            }
            if(pieEl){
              if(isEmpty){ pieEl.style.display='none'; if(pieWrap) pieWrap.style.display='none'; }
              else {
                var t = total || 1;
                var deg1 = Math.round((hwDom*360)/t);
                pieEl.style.display = '';
                if(pieWrap) pieWrap.style.display = '';
                // Force reflow so browser recalculates conic-gradient after display:none→visible
                if(pieWrap) void pieWrap.offsetHeight;
                pieEl.style.setProperty('--deg-run', deg1+'deg');
                // second segment finishes the circle implicitly
                pieEl.style.setProperty('--deg-idle', '360deg');
              }
            }
            if(legendEl){ legendEl.style.display = isEmpty? 'none' : ''; }
          }catch(_){ }
        }

        // 서비스 통계: 영향도별 도넛 차트
        var SVC_IMPACT_COLORS = {
          '매우 높음':'#ef4444','높음':'#f59e0b','중간':'#6366f1','낮음':'#10b981'
        };
        var SVC_IMPACT_ORDER = ['매우 높음','높음','중간','낮음'];

        function renderServiceStats(groupId){
          try{
            var gid = parseInt(String(groupId||''),10);
            if(isNaN(gid)||gid<=0) return;
            fetch('/api/work-groups/'+gid+'/services?_='+Date.now(),{method:'GET',headers:{Accept:'application/json'},credentials:'same-origin'})
              .then(function(res){ return res.json().catch(function(){ return {}; }); })
              .then(function(json){
                var items = (json && json.items) || [];
                var total = items.length;
                var wrapEl = document.getElementById('svc-stats-wrap');
                var emptyEl = document.getElementById('svc-empty');
                var donutEl = document.getElementById('svc-donut');
                var legendEl = document.getElementById('svc-legend');
                var totalEl = document.getElementById('svc-total');

                if(total<=0){
                  if(wrapEl) wrapEl.style.display='none';
                  if(emptyEl){ emptyEl.style.display=''; emptyEl.hidden=false;
                    try{ showNoDataImage(emptyEl,'서비스 데이터가 없습니다.\n서비스 탭에서 정보를 추가하세요.'); }catch(_s){}
                  }
                  return;
                }

                // Count by impact_level
                var counts={};
                SVC_IMPACT_ORDER.forEach(function(k){ counts[k]=0; });
                var otherCount=0;
                items.forEach(function(item){
                  var lv = safeTrim(item.impact_level);
                  if(counts.hasOwnProperty(lv)) counts[lv]++; else otherCount++;
                });

                var segments=[];
                SVC_IMPACT_ORDER.forEach(function(k){
                  if(counts[k]>0) segments.push({label:k,count:counts[k],color:SVC_IMPACT_COLORS[k]});
                });
                if(otherCount>0) segments.push({label:'기타',count:otherCount,color:'#94a3b8'});

                // Show chart area
                if(wrapEl) wrapEl.style.display='';
                if(emptyEl){ emptyEl.style.display='none'; emptyEl.hidden=true; }
                if(totalEl) totalEl.textContent=String(total);
                // Force reflow so browser paints conic-gradient after display:none→visible
                if(wrapEl) void wrapEl.offsetHeight;

                // Build conic-gradient
                if(donutEl){
                  var parts=[]; var cum=0;
                  segments.forEach(function(seg,i){
                    var deg=Math.round((seg.count/total)*360);
                    if(i===segments.length-1) deg=360-cum; // fix rounding
                    parts.push(seg.color+' '+cum+'deg '+(cum+deg)+'deg');
                    cum+=deg;
                  });
                  donutEl.style.background='conic-gradient('+parts.join(',')+')'; donutEl.style.display='';
                }

                // Build legend
                if(legendEl){
                  legendEl.innerHTML='';
                  segments.forEach(function(seg){
                    var pct=Math.round((seg.count/total)*100);
                    var li=document.createElement('li'); li.className='legend-item';
                    li.innerHTML='<span class="legend-dot" style="background:'+seg.color+'"></span>'+
                      '<span class="legend-host">'+escapeHTML(seg.label)+'</span>'+
                      '<span class="legend-size">'+seg.count+' ('+pct+'%)</span>';
                    legendEl.appendChild(li);
                  });
                  legendEl.style.display='';
                }
              })
              .catch(function(){
                var emptyEl=document.getElementById('svc-empty');
                if(emptyEl){ emptyEl.style.display=''; emptyEl.hidden=false;
                  try{ showNoDataImage(emptyEl,'서비스 데이터를 불러올 수 없습니다.'); }catch(_e){}
                }
              });
          }catch(_){ }
        }

        // 기본정보 수정 모달 동작 (워크그룹 상세)
        var EDIT_MODAL_ID = 'system-edit-modal';
        var EDIT_FORM_ID = 'system-edit-form';
        var EDIT_OPEN_ID = 'detail-edit-open';
        var EDIT_CLOSE_ID = 'system-edit-close';
        var EDIT_SAVE_ID = 'system-edit-save';
        function openModalLocal(id){ try{ var m=document.getElementById(id); if(m){ m.classList.add('show'); m.setAttribute('aria-hidden','false'); document.body.classList.add('modal-open'); } }catch(_){ } }
        function closeModalLocal(id){ try{ var m=document.getElementById(id); if(m){ m.classList.remove('show'); m.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } } }catch(_){ } }
        function getText(id){ var el=document.getElementById(id); return el? (el.textContent||'').trim():''; }
        function setText(id, val){ var el=document.getElementById(id); if(el){ el.textContent = String(val==null? '': val); } }
        function escapeHTML(s){
          return String(s==null?'':s)
            .replace(/&/g,'&amp;')
            .replace(/</g,'&lt;')
            .replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;')
            .replace(/'/g,'&#39;');
        }
        function normalizeLookupKey(s){
          var v = (s==null)? '' : String(s);
          try{ v = v.normalize('NFKC'); }catch(_e){}
          return v.trim().toLowerCase().replace(/\s+/g,' ');
        }

        var WORK_DEPTS_ENDPOINT = '/api/org-departments';
        var WORK_STATUSES_ENDPOINT = '/api/work-statuses';

        var LOOKUPS = {
          loadPromise: null,
          departments: null,
          statuses: null,
          deptNameByCode: null,
          statusNameByCode: null,
          deptCodeByName: null,
          statusCodeByName: null,
          statusColorByCode: null
        };

        function rebuildLookupMaps(){
          function add(mapObj, key, val){ if(!key) return; mapObj[key] = val; }
          LOOKUPS.deptNameByCode = {};
          LOOKUPS.statusNameByCode = {};
          LOOKUPS.deptCodeByName = {};
          LOOKUPS.statusCodeByName = {};
          LOOKUPS.statusColorByCode = {};

          (LOOKUPS.departments || []).forEach(function(r){
            var code = safeTrim(r && r.dept_code);
            var name = safeTrim((r && r.dept_name) || (r && r.name));
            if(!code) return;
            add(LOOKUPS.deptNameByCode, code, name || code);
            if(name) add(LOOKUPS.deptCodeByName, normalizeLookupKey(name), code);
            add(LOOKUPS.deptCodeByName, normalizeLookupKey(code), code);
          });

          (LOOKUPS.statuses || []).forEach(function(r){
            var code = safeTrim(r && r.status_code);
            var name = safeTrim((r && r.status_name) || (r && r.wc_name) || (r && r.name));
            var color = safeTrim((r && r.wc_color) || (r && r.status_level));
            if(!code) return;
            add(LOOKUPS.statusNameByCode, code, name || code);
            if(name) add(LOOKUPS.statusCodeByName, normalizeLookupKey(name), code);
            add(LOOKUPS.statusCodeByName, normalizeLookupKey(code), code);
            if(color) add(LOOKUPS.statusColorByCode, code, color);
          });
        }

        function fetchList(url){
          return fetch(url + '?_=' + Date.now(), { method:'GET', headers:{ Accept:'application/json' }, credentials:'same-origin' })
            .then(function(res){
              return res.json().catch(function(){ return {}; }).then(function(json){ return { ok: res.ok, json: json }; });
            })
            .then(function(r){
              var json = (r && r.json) || {};
              if(!(r && r.ok) || json.success === false) throw new Error((json && json.message) || '조회 실패');
              var items = (json && json.items) || [];
              return Array.isArray(items) ? items : [];
            })
            .catch(function(){ return []; });
        }

        function ensureLookupsLoaded(){
          if(LOOKUPS.loadPromise) return LOOKUPS.loadPromise;
          LOOKUPS.loadPromise = Promise.all([
            fetchList(WORK_DEPTS_ENDPOINT),
            fetchList(WORK_STATUSES_ENDPOINT)
          ]).then(function(arr){
            LOOKUPS.departments = arr[0] || [];
            LOOKUPS.statuses = arr[1] || [];
            rebuildLookupMaps();
            return LOOKUPS;
          });
          return LOOKUPS.loadPromise;
        }

        var LABELS = {
          wc_name:'업무 그룹', group_code:'업무 코드',
          sys_dept:'담당 부서', work_status:'업무 상태', work_priority:'업무 우선순위', note:'비고'
        };

        function generateFieldInput(col, value){
          var v = String(value==null? '' : value).trim();
          if(col==='wc_name'){
            return '<input name="wc_name" class="form-input" value="'+escapeHTML(v)+'" required>';
          }
          if(col==='group_code'){
            return '<input name="group_code" class="form-input" value="'+escapeHTML(v)+'" placeholder="업무 코드">';
          }
          if(col==='note'){
            return '<textarea name="note" class="form-input textarea-large" rows="6">'+escapeHTML(v)+'</textarea>';
          }
          if(col==='sys_dept'){
            var selected = v;
            var opts = (LOOKUPS.departments || []).map(function(r){
              var code = safeTrim(r && r.dept_code);
              var name = safeTrim((r && r.dept_name) || (r && r.name));
              if(!code || !name) return '';
              var sel = (code === selected) ? ' selected' : '';
              return '<option value="'+escapeHTML(code)+'"'+sel+'>'+escapeHTML(name)+'</option>';
            }).join('');
            return '<select name="sys_dept" class="form-input search-select" data-placeholder="담당 부서 선택" required>'+
              '<option value="">선택</option>'+opts+
              '</select>';
          }
          if(col==='work_status'){
            var selected3 = v;
            var opts3 = (LOOKUPS.statuses || []).map(function(r){
              var code3 = safeTrim(r && r.status_code);
              var name3 = safeTrim((r && r.status_name) || (r && r.wc_name) || (r && r.name));
              if(!code3 || !name3) return '';
              var sel3 = (code3 === selected3) ? ' selected' : '';
              return '<option value="'+escapeHTML(code3)+'"'+sel3+'>'+escapeHTML(name3)+'</option>';
            }).join('');
            return '<select name="work_status" class="form-input search-select" data-placeholder="업무 상태 선택" required>'+
              '<option value="">선택</option>'+opts3+
              '</select>';
          }
          if(col==='work_priority'){
            return '<input name="work_priority" type="number" min="0" step="1" class="form-input" value="'+escapeHTML(v)+'" placeholder="업무 우선순위(숫자)">';
          }
          return '<input name="'+escapeHTML(col)+'" class="form-input" value="'+escapeHTML(v)+'">';
        }

        function collectForm(form){
          var data = {};
          if(!form) return data;
          Array.prototype.forEach.call(form.querySelectorAll('input,select,textarea'), function(el){
            data[el.name] = String((el && el.value)!=null ? el.value : '').trim();
          });
          return data;
        }

        function buildWorkGroupPayload(source, options){
          var opts = options || {};
          var partial = !!opts.partial;
          var payload2 = {};
          if(!source) return payload2;
          var stringKeys = ['wc_name','wc_desc','sys_dept','work_status','note','status_code','dept_code','remark','description','group_name','group_code'];
          stringKeys.forEach(function(key){
            if(!(key in source)) return;
            var raw = source[key];
            var val = (typeof raw === 'string') ? raw.trim() : (raw == null ? '' : String(raw));
            if(partial && val === '') return;
            payload2[key] = val;
          });
          if(payload2.wc_name && !payload2.group_name) payload2.group_name = payload2.wc_name;
          if(payload2.wc_desc && !payload2.description) payload2.description = payload2.wc_desc;
          if(payload2.note && !payload2.remark) payload2.remark = payload2.note;
          if(payload2.work_status && !payload2.status_code) payload2.status_code = payload2.work_status;
          if(payload2.sys_dept && !payload2.dept_code) payload2.dept_code = payload2.sys_dept;

          // Coerce display names -> codes if needed
          try{
            var deptRaw = safeTrim(payload2.dept_code || payload2.sys_dept);
            if(deptRaw){
              var deptCode = (LOOKUPS.deptCodeByName && LOOKUPS.deptCodeByName[normalizeLookupKey(deptRaw)]) ? LOOKUPS.deptCodeByName[normalizeLookupKey(deptRaw)] : deptRaw;
              payload2.dept_code = deptCode; payload2.sys_dept = deptCode;
            }
            var stRaw = safeTrim(payload2.status_code || payload2.work_status);
            if(stRaw){
              var stCode = (LOOKUPS.statusCodeByName && LOOKUPS.statusCodeByName[normalizeLookupKey(stRaw)]) ? LOOKUPS.statusCodeByName[normalizeLookupKey(stRaw)] : stRaw;
              payload2.status_code = stCode; payload2.work_status = stCode;
            }
          }catch(_e){}
          // Numeric
          if('work_priority' in source){
            var pr = String(source.work_priority==null? '' : source.work_priority).trim();
            if(!(partial && pr === '')) payload2.work_priority = pr === '' ? '' : parseInt(pr, 10);
          }
          return payload2;
        }

        function validateWorkGroupPayload(payload2){
          var required = ['wc_name','work_status','sys_dept'];
          for(var i=0;i<required.length;i++){
            var k = required[i];
            if(!safeTrim(payload2[k])) return false;
          }
          return true;
        }

        function getCurrentGroupId(){
          try{
            var pane = document.getElementById('basic');
            var raw = (pane && pane.dataset && (pane.dataset.groupId || pane.dataset.id)) ? (pane.dataset.groupId || pane.dataset.id) : (payload && (payload.group_id || payload.id));
            var n = parseInt(String(raw||''), 10);
            return (!isNaN(n) && n > 0) ? n : null;
          }catch(_){ return null; }
        }

        function buildEditForm(){
          var form = document.getElementById(EDIT_FORM_ID); if(!form) return;
          var pane = document.getElementById('basic');
          var data = {
            wc_name: getText('page-header-title'),
            group_code: getText('mf-group-code'),
            sys_dept: (pane && pane.dataset && pane.dataset.sysDept) ? String(pane.dataset.sysDept) : '',
            work_status: (pane && pane.dataset && pane.dataset.workStatus) ? String(pane.dataset.workStatus) : '',
            work_priority: (pane && pane.dataset && pane.dataset.workPriority) ? String(pane.dataset.workPriority) : '',
            note: getText('mf-note')
          };

          form.innerHTML = '';
          var section = document.createElement('div');
          section.className = 'form-section';
          section.innerHTML = '<div class="section-header"><h4>업무 그룹</h4></div>';
          var grid = document.createElement('div');
          grid.className = 'form-grid';
          ['work_status','wc_name','group_code','sys_dept','work_priority','note'].forEach(function(c){
            var wrap = document.createElement('div');
            wrap.className = (c === 'note') ? 'form-row form-row-wide' : 'form-row';
            wrap.innerHTML = '<label>' + LABELS[c] + '</label>' + generateFieldInput(c, data[c]);
            grid.appendChild(wrap);
          });
          section.appendChild(grid);
          form.appendChild(section);
        }

        var openBtn = document.getElementById(EDIT_OPEN_ID);
        if(openBtn){ openBtn.addEventListener('click', function(){
          ensureLookupsLoaded().then(function(){
            buildEditForm();
            openModalLocal(EDIT_MODAL_ID);
            try { window.BlossomSearchableSelect && window.BlossomSearchableSelect.enhance && window.BlossomSearchableSelect.enhance(document.getElementById(EDIT_MODAL_ID) || document); } catch(_e){}
            var first = document.querySelector('#'+EDIT_FORM_ID+' .form-input');
            if(first){ try{ first.focus(); }catch(_){ } }
          });
        }); }
        var closeBtn = document.getElementById(EDIT_CLOSE_ID);
        if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalLocal(EDIT_MODAL_ID); }); }
        var modalEl = document.getElementById(EDIT_MODAL_ID);
        if(modalEl){ modalEl.addEventListener('click', function(e){ if(e.target===modalEl) closeModalLocal(EDIT_MODAL_ID); }); document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(EDIT_MODAL_ID); }); }
        var saveBtn = document.getElementById(EDIT_SAVE_ID);
        if(saveBtn){ saveBtn.addEventListener('click', function(){
          var form = document.getElementById(EDIT_FORM_ID); if(!form) { closeModalLocal(EDIT_MODAL_ID); return; }
          var source = collectForm(form);
          var updatePayload = buildWorkGroupPayload(source, { partial: true });
          if(!validateWorkGroupPayload(updatePayload)){
            // Focus the first missing required field (list modal behavior relies on required attr too)
            var order = ['work_status','wc_name','sys_dept'];
            for(var i=0;i<order.length;i++){
              var k = order[i];
              if(!safeTrim(updatePayload[k])){ try{ form.querySelector('[name="'+k+'"]').focus(); }catch(_f){} break; }
            }
            return;
          }
          var id = getCurrentGroupId();
          if(!id){
            return;
          }
          fetch('/api/work-groups/' + id, {
            method:'PUT',
            headers:{ 'Content-Type':'application/json', Accept:'application/json' },
            credentials:'same-origin',
            body: JSON.stringify(updatePayload)
          })
            .then(function(res){
              return res.json().catch(function(){ return {}; }).then(function(json){ return { ok: res.ok, json: json }; });
            })
            .then(function(r){
              var json = (r && r.json) || {};
              if(!(r && r.ok) || json.success === false) throw new Error((json && json.message) || '업무 그룹 수정에 실패했습니다.');
              var item = json.item || {};
              var merged = normalizePayload(item);
              payload = merged;
              writePayloadToSession(merged);
              applyPayloadToDom(merged);
              try{ renderStatsFromDom(); }catch(_s){}
              closeModalLocal(EDIT_MODAL_ID);
            })
            .catch(function(_err){
              // Show error message to user instead of silently swallowing
              var msg = (_err && _err.message) || '업무 그룹 수정 중 오류가 발생했습니다.';
              if(typeof showMessage === 'function') showMessage(msg, '오류');
              else alert(msg);
            });
        }); }
  // Initial stats render on load
  renderStatsFromDom();
  // Initial service stats render (donut chart)
  try{
    var _initGid = (payload && (payload.group_id || payload.id)) ? (payload.group_id || payload.id) : null;
    if(_initGid) renderServiceStats(_initGid);
  }catch(_sv){}

      }catch(_){ /* no-op for safety */ }
    })();

    // Manager tab logic moved to shared /static/js/_detail/tab42-manager.js

      // [Tabs moved to /static/js/_detail/tab*.js]


      // [Tabs moved to /static/js/_detail/tab*.js]


      // [Tabs moved to /static/js/_detail/tab*.js]


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
  
      // [Tabs moved to /static/js/_detail/tab*.js]

  
      
      // [Tabs moved to /static/js/_detail/tab*.js]

      // ---------- Hardware/Allocation table interactions (system tab) ----------
      (function(){
        var table = document.getElementById('hw-spec-table'); if(!table) return;
        // Manager tab uses the same table id but a different schema; skip hardware logic entirely
        try{ if((table.getAttribute('data-context')||'').toLowerCase()==='manager'){ return; } }catch(_){ }
        // Work Group System tab (tab71-system.html) is handled separately above
        try{ if((table.getAttribute('data-context')||'').toLowerCase()==='system-hw'){ return; } }catch(_){ }
        // Service tab (tab47-service) has its own dedicated script; skip hardware logic
        try{ if((table.getAttribute('data-context')||'').toLowerCase()==='service'){ return; } }catch(_){ }
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

  
      
  
      // [Tabs moved to /static/js/_detail/tab*.js]

  
      // [Tabs moved to /static/js/_detail/tab*.js]

  
  
      // [Removed legacy Change Log implementation]
  
});
  
    // No modal APIs to expose
  })();
  
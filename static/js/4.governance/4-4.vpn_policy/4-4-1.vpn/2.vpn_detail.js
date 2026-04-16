// Manufacturer detail: Manager tab logic (clean, manager-only)
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

  // Tell the global initializer (static/js/blossom.js) to skip.
  try{ window.__BLS_TK_HISTORY_EXTERNAL = true; }catch(_){ }

  function ready(fn){ if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }

  ready(function(){
    // ---------- Governance > VPN 정책(4-4-1) : shared selection + header ----------
    // 목적: 리스트에서 선택한 VPN 정책(예: "대외계")의 컨텍스트를 탭 간에 유지하고,
    //       타이틀=기관명, 서브타이틀=프로토콜로 통일한다.
    (function(){
      try{
        var path = (typeof location !== 'undefined' && location.pathname || '').toLowerCase();
        // NOTE: In this app, pages are usually served via /p/<key> (e.g. /p/gov_vpn_policy_detail)
        // rather than the template file path. Support both patterns.
        var isVpnPolicyDetailTab = (
          /\/p\/gov_vpn_policy(_detail|_manager|_communication|_vpn_policy|_log|_file)$/.test(path)
          || /\/4-4\.vpn_policy\/4-4-1\.vpn\/(2\.vpn_detail|tab42-manager|tab52-communication|tab53-vpn-policy|tab14-log|tab15-file)\.html$/.test(path)
          || /\/layouts\/(tab45-communication|tab46-vpn_policy)\.html$/.test(path)
        );
        if(!isVpnPolicyDetailTab) return;

        function setText(id, val){
          try{
            var el = document.getElementById(id);
            if(!el) return;
            el.textContent = String(val == null ? '' : val);
          }catch(_){ }
        }

        var FIELDS = [
          'org_name','status','line_speed','line_count','protocol','manager','cipher',
          'upper_country','upper_country_address','lower_country','lower_country_address','device_name'
        ];

        function readSelection(){
          var payload = null;

          // 1) Prefer URL query params (list page appends them once)
          try{
            var params = new URLSearchParams((location && location.search) || '');
            var hasAny = false;
            var p = {};
            FIELDS.forEach(function(k){
              var v = params.get(k);
              if(v != null && String(v).length){
                p[k] = v;
                hasAny = true;
              }
            });
            if(hasAny){
              payload = p;
              if(window.BlossomTab41System && typeof window.BlossomTab41System.initAllocationTable === 'function'){
                try{ if(window.BlossomTab41System.initAllocationTable()) return; }catch(_){ }
              }
              try{ sessionStorage.setItem('vpn_selected_row', JSON.stringify(payload)); }catch(_a){ }
              return payload;
            }
          }catch(_p){ }

          // 2) Fall back to sessionStorage (works across all tab routes)
          try{
            var raw = sessionStorage.getItem('vpn_selected_row');
            if(raw){
              var parsed = JSON.parse(raw);
              if(parsed && typeof parsed === 'object') return parsed;
            }
          }catch(_s){ }

          return null;
        }

        var selected = readSelection();
        if(!selected) return;

        // Page header: title=기관명, subtitle=프로토콜
        if(selected.org_name) setText('page-header-title', selected.org_name);
        if(selected.protocol) setText('page-header-subtitle', selected.protocol);

        // Basic info page: also fill the visible fields if present
        if(document.getElementById('vpn-org-name') && selected.org_name) setText('vpn-org-name', selected.org_name);
        if(document.getElementById('vpn-status') && selected.status != null) setText('vpn-status', selected.status);
        if(document.getElementById('vpn-line-speed') && selected.line_speed != null) setText('vpn-line-speed', selected.line_speed);
        if(document.getElementById('vpn-line-count') && selected.line_count != null) setText('vpn-line-count', selected.line_count);
        if(document.getElementById('vpn-protocol') && selected.protocol != null) setText('vpn-protocol', selected.protocol);
        if(document.getElementById('vpn-manager') && selected.manager != null) setText('vpn-manager', selected.manager);
        if(document.getElementById('vpn-cipher') && selected.cipher != null) setText('vpn-cipher', selected.cipher);
        if(document.getElementById('vpn-upper-country') && selected.upper_country != null) setText('vpn-upper-country', selected.upper_country);
        if(document.getElementById('vpn-upper-address') && selected.upper_country_address != null) setText('vpn-upper-address', selected.upper_country_address);
        if(document.getElementById('vpn-lower-country') && selected.lower_country != null) setText('vpn-lower-country', selected.lower_country);
        if(document.getElementById('vpn-lower-address') && selected.lower_country_address != null) setText('vpn-lower-address', selected.lower_country_address);
        if(document.getElementById('vpn-device-name') && selected.device_name != null) setText('vpn-device-name', selected.device_name);
      }catch(_){ }
    })();

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

    // ---------- VPN Detail: Basic Info edit modal (DB-backed) ----------
    (function(){
      try{
        var path = (location && location.pathname || '').toLowerCase();
        // Match both /p/gov_vpn_policy*_detail routes and raw HTML template paths
        var isVpnDetail = (
          /\/p\/gov_vpn_policy\d?_detail$/.test(path)
          || /\/4-4\.vpn_policy\/4-4-\d\.vpn\d?\/2\.vpn_detail\.html$/.test(path)
          || /\/layouts\/(tab45-communication|tab46-vpn_policy)\.html$/.test(path)
        );
        if(!isVpnDetail) return;

        // Resolve vpn_line_id
        var vpnLineId = (function(){
          try{ var bid = (document.body.getAttribute('data-gov-detail-id')||'').trim(); if(bid) return parseInt(bid,10)||null; }catch(_){}
          try{ var params = new URLSearchParams(location.search); var v = params.get('vpn_line_id'); if(v) return parseInt(v,10)||null; }catch(_){}
          try{ var raw = sessionStorage.getItem('vpn_selected_row'); if(raw){ var p=JSON.parse(raw); if(p&&p.vpn_line_id) return parseInt(p.vpn_line_id,10)||null; } }catch(_){}
          return null;
        })();
        var API_URL = vpnLineId ? ('/api/network/vpn-lines/' + vpnLineId) : null;

        var EDIT_MODAL_ID = 'system-edit-modal';
        var EDIT_FORM_ID = 'system-edit-form';
        var EDIT_OPEN_ID = 'detail-edit-open';
        var EDIT_CLOSE_ID = 'system-edit-close';
        var EDIT_SAVE_ID = 'system-edit-save';

        function openModalLocal(id){ try{ var m=document.getElementById(id); if(m){ m.classList.add('show'); m.setAttribute('aria-hidden','false'); document.body.classList.add('modal-open'); } }catch(_){ } }
        function closeModalLocal(id){ try{ var m=document.getElementById(id); if(m){ m.classList.remove('show'); m.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } } }catch(_){ } }
        function getText(id){ var el=document.getElementById(id); return el? (el.textContent||'').trim():''; }
        function setText(id, val){ var el=document.getElementById(id); if(el){ el.textContent = String(val==null? '': val); } }
        function esc(v){ return String(v==null? '': v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
        function intify(v){ var n=parseInt(String(v||'').replace(/[^0-9-]/g,''),10); return (isNaN(n)||!isFinite(n))? 0 : n; }

        function resolveActorUserId(){
          try{ var raw = sessionStorage.getItem('vpn_selected_row'); if(raw){ var p=JSON.parse(raw); if(p&&p.actor_user_id) return parseInt(p.actor_user_id,10)||null; } }catch(_){}
          try{ return parseInt(document.body.getAttribute('data-actor-user-id'),10)||null; }catch(_){}
          return null;
        }

        // Fetch from DB and populate the page
        function loadBasicInfo(){
          if(!API_URL) return;
          fetch(API_URL, {credentials:'same-origin'})
            .then(function(r){ return r.json(); })
            .then(function(data){
              if(!data.success) return;
              var item = data.item || {};
              setText('vpn-status', item.status || '');
              setText('vpn-line-speed', item.line_speed || '');
              setText('vpn-line-count', item.line_count != null ? item.line_count : '');
              setText('vpn-protocol', item.protocol || '');
              setText('vpn-manager', item.manager || '');
              setText('vpn-cipher', item.cipher || '');
              setText('vpn-upper-country', item.upper_country || '');
              setText('vpn-upper-address', item.upper_country_address || '');
              setText('vpn-lower-country', item.lower_country || '');
              setText('vpn-lower-address', item.lower_country_address || '');
            }).catch(function(){});
        }
        loadBasicInfo();

        function buildSelect(name, current, options){
          var opts = ['<option value=""'+(current? '':' selected')+'>선택</option>'].concat(options.map(function(o){ return '<option value="'+esc(o)+'"'+(String(current)===String(o)?' selected':'')+'>'+esc(o)+'</option>'; }));
          return '<select name="'+name+'" class="form-input search-select">'+opts.join('')+'</select>';
        }

        function buildVpnEditForm(){
          var form=document.getElementById(EDIT_FORM_ID); if(!form) return;
          var data={
            org_name:getText('vpn-org-name'),
            status:getText('vpn-status'),
            line_speed:getText('vpn-line-speed'),
            line_count:intify(getText('vpn-line-count')),
            protocol:getText('vpn-protocol'),
            manager:getText('vpn-manager'),
            cipher:getText('vpn-cipher'),
            upper_country:getText('vpn-upper-country'),
            upper_country_address:getText('vpn-upper-address'),
            lower_country:getText('vpn-lower-country'),
            lower_country_address:getText('vpn-lower-address'),
            device_name:getText('vpn-device-name')
          };

          var statusSel = buildSelect('status', data.status, ['운용','해지']);
          var protoSel = buildSelect('protocol', data.protocol, ['TCP','UDP','TCP/UDP']);

          form.innerHTML = ''+
          '<div class="form-section">\n'+
          '  <div class="section-header"><h4>기본</h4></div>\n'+
          '  <div class="form-grid">\n'+
          '    <div class="form-row"><label>기관명</label><input name="org_name" class="form-input" value="'+esc(data.org_name)+'" readonly disabled style="background:#f3f4f6;cursor:not-allowed;"></div>\n'+
          '    <div class="form-row"><label>상태</label>'+statusSel+'</div>\n'+
          '    <div class="form-row"><label>회선속도</label><input name="line_speed" class="form-input" placeholder="예: 100M, 1G" value="'+esc(data.line_speed)+'"></div>\n'+
          '    <div class="form-row"><label>회선수</label><input name="line_count" type="number" min="0" step="1" class="form-input" placeholder="숫자" value="'+esc(data.line_count)+'"></div>\n'+
          '    <div class="form-row"><label>프로토콜</label>'+protoSel+'</div>\n'+
          '    <div class="form-row"><label>관리주체</label><input name="manager" class="form-input" placeholder="입력" value="'+esc(data.manager)+'"></div>\n'+
          '    <div class="form-row"><label>암호화방식</label><input name="cipher" class="form-input" placeholder="예: AES-256" value="'+esc(data.cipher)+'"></div>\n'+
          '  </div>\n'+
          '</div>\n'+
          '<div class="form-section">\n'+
          '  <div class="section-header"><h4>주체</h4></div>\n'+
          '  <div class="form-grid">\n'+
          '    <div class="form-row"><label>상위국</label><input name="upper_country" class="form-input" placeholder="입력" value="'+esc(data.upper_country)+'"></div>\n'+
          '    <div class="form-row"><label>상위국주소</label><input name="upper_country_address" class="form-input" placeholder="도로명 주소" value="'+esc(data.upper_country_address)+'"></div>\n'+
          '    <div class="form-row"><label>하위국</label><input name="lower_country" class="form-input" placeholder="입력" value="'+esc(data.lower_country)+'"></div>\n'+
          '    <div class="form-row"><label>하위국 주소</label><input name="lower_country_address" class="form-input" placeholder="도로명 주소" value="'+esc(data.lower_country_address)+'"></div>\n'+
          '  </div>\n'+
          '</div>\n'+
          '<div class="form-section">\n'+
          '  <div class="section-header"><h4>장비</h4></div>\n'+
          '  <div class="form-grid">\n'+
          '    <div class="form-row"><label>장비명</label><input name="device_name" class="form-input" value="'+esc(data.device_name)+'" readonly disabled style="background:#f3f4f6;cursor:not-allowed;"></div>\n'+
          '  </div>\n'+
          '</div>';
        }

        function fval(form, name){ var el=form? form.querySelector('[name="'+name+'"]') : null; return el? el.value.trim():''; }

        // Wire up open/close
        var openBtn = document.getElementById(EDIT_OPEN_ID);
        if(openBtn){ openBtn.addEventListener('click', function(){ buildVpnEditForm(); openModalLocal(EDIT_MODAL_ID); var first = document.querySelector('#'+EDIT_FORM_ID+' .form-input:not([readonly])'); if(first){ try{ first.focus(); }catch(_){ } } }); }

        var closeBtn = document.getElementById(EDIT_CLOSE_ID);
        if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalLocal(EDIT_MODAL_ID); }); }
        var modalEl = document.getElementById(EDIT_MODAL_ID);
        if(modalEl){ modalEl.addEventListener('click', function(e){ if(e.target===modalEl) closeModalLocal(EDIT_MODAL_ID); }); document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(EDIT_MODAL_ID); }); }

        // Save handler — PUT to DB
        var saveBtn = document.getElementById(EDIT_SAVE_ID);
        if(saveBtn){ saveBtn.addEventListener('click', function(){
          var form = document.getElementById(EDIT_FORM_ID); if(!form){ closeModalLocal(EDIT_MODAL_ID); return; }
          if(!API_URL){ alert('VPN 회선 정보가 없습니다.'); return; }

          var status = fval(form, 'status');
          var lineSpeed = fval(form, 'line_speed');
          var lineCount = intify(fval(form, 'line_count')); if(lineCount < 0) lineCount = 0;
          var protocol = fval(form, 'protocol');
          var manager = fval(form, 'manager');
          var cipher = fval(form, 'cipher');
          var upCountry = fval(form, 'upper_country');
          var upAddr = fval(form, 'upper_country_address');
          var lowCountry = fval(form, 'lower_country');
          var lowAddr = fval(form, 'lower_country_address');

          var payload = {
            status: status, line_speed: lineSpeed, line_count: lineCount,
            protocol: protocol, manager: manager, cipher: cipher,
            upper_country: upCountry, upper_country_address: upAddr,
            lower_country: lowCountry, lower_country_address: lowAddr
          };
          var actor = resolveActorUserId();
          if(actor) payload.actor_user_id = actor;

          fetch(API_URL, {
            method: 'PUT', credentials: 'same-origin',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify(payload)
          })
          .then(function(r){ return r.json(); })
          .then(function(data){
            if(data.success){
              var item = data.item || {};
              setText('vpn-status', item.status || '');
              setText('vpn-line-speed', item.line_speed || '');
              setText('vpn-line-count', item.line_count != null ? item.line_count : '');
              setText('vpn-protocol', item.protocol || '');
              setText('vpn-manager', item.manager || '');
              setText('vpn-cipher', item.cipher || '');
              setText('vpn-upper-country', item.upper_country || '');
              setText('vpn-upper-address', item.upper_country_address || '');
              setText('vpn-lower-country', item.lower_country || '');
              setText('vpn-lower-address', item.lower_country_address || '');
              // Sync sessionStorage so other tabs reflect the update
              try{
                var stored = JSON.parse(sessionStorage.getItem('vpn_selected_row') || '{}');
                stored.status = item.status || '';
                stored.line_speed = item.line_speed || '';
                stored.line_count = item.line_count != null ? String(item.line_count) : '';
                stored.protocol = item.protocol || '';
                stored.manager = item.manager || '';
                stored.cipher = item.cipher || '';
                stored.upper_country = item.upper_country || '';
                stored.upper_country_address = item.upper_country_address || '';
                stored.lower_country = item.lower_country || '';
                stored.lower_country_address = item.lower_country_address || '';
                sessionStorage.setItem('vpn_selected_row', JSON.stringify(stored));
              }catch(_s){}
              closeModalLocal(EDIT_MODAL_ID);
            } else {
              alert(data.message || '저장에 실패했습니다.');
            }
          })
          .catch(function(){ alert('서버 통신 중 오류가 발생했습니다.'); });
        }); }
      }catch(_){ /* no-op */ }
    })();

    // Manager tab logic moved to shared /static/js/_detail/tab42-manager.js

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
        // Communication policy table: guard strictly by data-context
        var isCommunication = (function(){
          var ctx=(table.getAttribute('data-context')||'').toLowerCase();
          return ctx==='communication';
        })();
        if(isCommunication){

          // ---- resolve vpn_line_id from multiple sources ----
          var cmLineId = (function(){
            // 1) body data-gov-detail-id attribute
            try{ var bid = (document.body.getAttribute('data-gov-detail-id')||'').trim(); if(bid) return parseInt(bid,10)||null; }catch(_){}
            // 2) URL param vpn_line_id
            try{ var params = new URLSearchParams(location.search); var v = params.get('vpn_line_id'); if(v) return parseInt(v,10)||null; }catch(_){}
            // 3) sessionStorage vpn_selected_row
            try{ var raw = sessionStorage.getItem('vpn_selected_row'); if(raw){ var p = JSON.parse(raw); if(p && p.vpn_line_id) return parseInt(p.vpn_line_id,10)||null; } }catch(_){}
            return null;
          })();
          var CM_API_BASE = cmLineId ? ('/api/network/vpn-lines/' + cmLineId + '/communications') : null;

          var empty = document.getElementById('hw-empty');
          var infoEl = document.getElementById('hw-pagination-info');
          var numWrap = document.getElementById('hw-page-numbers');
          var btnFirst = document.getElementById('hw-first');
          var btnPrev = document.getElementById('hw-prev');
          var btnNext = document.getElementById('hw-next');
          var btnLast = document.getElementById('hw-last');
          var selectAll = null;

          var cmState = { page:1, pageSize:10 };
          function cmRows(){ var tbody=table.querySelector('tbody'); return tbody? Array.from(tbody.querySelectorAll('tr')): []; }
          function cmTotal(){ return cmRows().length; }
          function cmPages(){ var total=cmTotal(); return Math.max(1, Math.ceil(total / Math.max(1, cmState.pageSize))); }
          function cmClampPage(){ var pages=cmPages(); if(cmState.page>pages) cmState.page=pages; if(cmState.page<1) cmState.page=1; }
          function cmUpdateUI(){
            if(infoEl){ var total=cmTotal(); var start= total? (cmState.page-1)*cmState.pageSize+1 : 0; var end=Math.min(total, cmState.page*cmState.pageSize); infoEl.textContent = start + '-' + end + ' / ' + total + '개 항목'; }
            if(numWrap){ var pages=cmPages(); numWrap.innerHTML=''; for(var p=1;p<=pages && p<=50;p++){ var b=document.createElement('button'); b.className='page-btn'+(p===cmState.page?' active':''); b.textContent=String(p); b.dataset.page=String(p); numWrap.appendChild(b); } }
            var pages2=cmPages(); if(btnFirst) btnFirst.disabled=(cmState.page===1); if(btnPrev) btnPrev.disabled=(cmState.page===1); if(btnNext) btnNext.disabled=(cmState.page===pages2); if(btnLast) btnLast.disabled=(cmState.page===pages2);
            var sizeSel=document.getElementById('hw-page-size'); if(sizeSel){ var none=(cmTotal()===0); sizeSel.disabled=none; if(none){ try{ sizeSel.value='10'; cmState.pageSize=10; }catch(_){ } } }
          }
          function cmRenderPage(){
            cmClampPage();
            var rows=cmRows();
            var startIdx=(cmState.page-1)*cmState.pageSize;
            var endIdx=startIdx + cmState.pageSize - 1;
            rows.forEach(function(tr,idx){ var visible=idx>=startIdx && idx<=endIdx; tr.style.display = visible? '' : 'none'; if(visible){ tr.removeAttribute('data-hidden'); } else { tr.setAttribute('data-hidden','1'); } });
            cmUpdateUI();
          }
          function cmGo(p){ cmState.page=p; cmRenderPage(); }
          function cmGoDelta(d){ cmGo(cmState.page + d); }
          if(numWrap){ numWrap.addEventListener('click', function(e){ var b=e.target.closest('button.page-btn'); if(!b) return; var p=parseInt(b.dataset.page,10); if(!isNaN(p)) cmGo(p); }); }
          if(btnFirst) btnFirst.addEventListener('click', function(){ cmGo(1); });
          if(btnPrev) btnPrev.addEventListener('click', function(){ cmGoDelta(-1); });
          if(btnNext) btnNext.addEventListener('click', function(){ cmGoDelta(1); });
          if(btnLast) btnLast.addEventListener('click', function(){ cmGo(cmPages()); });
          (function initPageSize(){ try{ var saved=localStorage.getItem('vpn:cm:pageSize'); var sel=document.getElementById('hw-page-size'); if(sel){ if(saved && ['10','20','50','100'].indexOf(saved)>-1){ cmState.pageSize=parseInt(saved,10); sel.value=saved; } sel.addEventListener('change', function(){ var v=parseInt(sel.value,10); if(!isNaN(v)){ cmState.page=1; cmState.pageSize=v; localStorage.setItem('vpn:cm:pageSize', String(v)); cmRenderPage(); } }); } }catch(_){ } })();

          function updateEmptyState(){
            try{
              var has = !!table.querySelector('tbody tr');
              if(empty){ empty.hidden = has; empty.style.display = has ? 'none' : ''; }
            }catch(_){ if(empty){ empty.hidden=false; empty.style.display=''; } }
            var csvBtn=document.getElementById('hw-download-btn');
            if(csvBtn){ var hasRows = !!table.querySelector('tbody tr'); csvBtn.disabled=!hasRows; csvBtn.setAttribute('aria-disabled', (!hasRows).toString()); csvBtn.title = hasRows? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.'; }
            try{
              var tbody=table.querySelector('tbody'); var cnt = tbody? tbody.querySelectorAll('tr').length : 0;
              var addBtnEl = document.getElementById('hw-row-add');
              if(addBtnEl){ addBtnEl.disabled = cnt>=50; addBtnEl.title = cnt>=50? '최대 50행까지 추가 가능합니다.' : '행 추가'; }
            }catch(_){ }
            cmRenderPage();
            try{ cmSuppressDuplicates(); }catch(_){ }
          }

          // Hide duplicate values on contiguous rows except when a row is in edit mode
          function cmSuppressDuplicates(){
            try{
              function cmEsc(v){ return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
              function nl2br(v){ return cmEsc(v).replace(/\r?\n/g,'<br>'); }
              var dupCols = ['self_division','line','work_name','real_ip','l4_ip','nat_ip','vpn_ip_self','vpn_ip_org','nw_ip_org'];
              var ipCols = { real_ip:1, l4_ip:1, nat_ip:1, vpn_ip_self:1, vpn_ip_org:1, nw_ip_org:1 };
              var last = {};
              var lastTdMap = {};
              dupCols.forEach(function(c){ last[c] = null; lastTdMap[c] = null; });
              var lastDivision = null;
              var lastRealIP = null;
              var rows = table.querySelectorAll('tbody tr');
              rows.forEach(function(tr){
                var editing = !!tr.querySelector('td[data-col] input, td[data-col] select, td[data-col] textarea');
                if(editing) return;
                var divTd = tr.querySelector('[data-col="self_division"]');
                var divOrig = '';
                if(divTd){ var d = divTd.getAttribute('data-orig'); if(!d){ d = (divTd.textContent||'').trim(); divTd.setAttribute('data-orig', d); } divOrig = d; }
                if(lastDivision === null || divOrig !== lastDivision){
                  lastDivision = divOrig;
                  dupCols.forEach(function(c){ last[c] = null; lastTdMap[c] = null; });
                  lastRealIP = null;
                }
                var realTd = tr.querySelector('[data-col="real_ip"]');
                var realOrig = '';
                if(realTd){ var r = realTd.getAttribute('data-orig'); if(!r){ var tReal = (realTd.textContent||'').trim(); realTd.setAttribute('data-orig', tReal); r = tReal; } realOrig = r; }
                dupCols.forEach(function(col){
                  var td = tr.querySelector('[data-col="'+col+'"]'); if(!td) return;
                  var orig = td.getAttribute('data-orig');
                  if(!orig){ var t = (td.textContent||'').trim(); td.setAttribute('data-orig', t); orig = t; }
                  if(col === 'l4_ip'){
                    var realChanged = (lastRealIP !== null) && (realOrig !== lastRealIP);
                    if(realChanged){ td.removeAttribute('data-dup-hidden'); td.innerHTML = orig ? nl2br(orig) : '-'; lastTdMap[col] = td; }
                    else if(last[col] != null && orig && orig === last[col]){ td.setAttribute('data-dup-hidden','1'); td.textContent = ''; if(lastTdMap[col]){ lastTdMap[col].setAttribute('data-merge-next','1'); } }
                    else { td.removeAttribute('data-dup-hidden'); td.innerHTML = orig ? nl2br(orig) : '-'; lastTdMap[col] = td; }
                  } else {
                    if(last[col] != null && orig && orig === last[col]){ td.setAttribute('data-dup-hidden','1'); td.textContent = ''; if(lastTdMap[col]){ lastTdMap[col].setAttribute('data-merge-next','1'); } }
                    else { td.removeAttribute('data-dup-hidden'); if(ipCols[col]){ td.innerHTML = orig ? nl2br(orig) : '-'; } else { td.textContent = orig || '-'; } lastTdMap[col] = td; }
                  }
                  last[col] = orig;
                });
                lastRealIP = realOrig;
                ['port_self','port_org','direction'].forEach(function(alwaysCol){
                  var td = tr.querySelector('[data-col="'+alwaysCol+'"]'); if(!td) return;
                  var orig = td.getAttribute('data-orig');
                  if(!orig){ var t=(td.textContent||'').trim(); td.setAttribute('data-orig', t); orig = t; }
                  td.removeAttribute('data-dup-hidden');
                  td.textContent = orig || '-';
                });
              });
            }catch(_){ }
          }

          // Build a saved (read-only) row from data
          function cmBuildSavedRow(item){
            function cmEsc(v){ return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
            function nl2br(v){ return cmEsc(v).replace(/\r?\n/g,'<br>'); }
            var tr = document.createElement('tr');
            if(item.id) tr.setAttribute('data-comm-id', String(item.id));
            var cols = ['self_division','line','work_name','real_ip','l4_ip','nat_ip','port_self','vpn_ip_self','direction','vpn_ip_org','nw_ip_org','port_org'];
            var ipCols = { real_ip:1, l4_ip:1, nat_ip:1, vpn_ip_self:1, vpn_ip_org:1, nw_ip_org:1 };
            cols.forEach(function(c){
              var td = document.createElement('td');
              td.setAttribute('data-col', c);
              var val = (item[c] != null ? String(item[c]) : '').trim();
              td.setAttribute('data-orig', val);
              if(ipCols[c]){ td.innerHTML = val ? nl2br(val) : '-'; }
              else { td.textContent = val || '-'; }
              tr.appendChild(td);
            });
            var actionTd = document.createElement('td');
            actionTd.className = 'system-actions table-actions';
            actionTd.innerHTML = '<button class="action-btn js-cm-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button>' +
              '<button class="action-btn danger js-cm-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>';
            tr.appendChild(actionTd);
            return tr;
          }

          // Load data from API
          function cmLoadData(){
            if(!CM_API_BASE) return;
            var tbody = table.querySelector('tbody');
            if(!tbody) return;
            fetch(CM_API_BASE, { method:'GET', headers:{'Accept':'application/json'}, credentials:'same-origin' })
              .then(function(r){ return r.json(); })
              .then(function(data){
                tbody.innerHTML = '';
                if(data.success && data.items && data.items.length){
                  data.items.forEach(function(item){ tbody.appendChild(cmBuildSavedRow(item)); });
                }
                updateEmptyState();
              })
              .catch(function(){ updateEmptyState(); });
          }
          cmLoadData();

          // Builders for inputs (new row)
          function cmRowInputs(){ return {
            self_division: '<input type="text" placeholder="구분">',
            line: '<input type="text" placeholder="회선">',
            work_name: '<input type="text" placeholder="업무명">',
            real_ip: '<textarea placeholder="REAL IP" rows="2"></textarea>',
            l4_ip: '<textarea placeholder="L4 IP" rows="2"></textarea>',
            nat_ip: '<textarea placeholder="NAT IP" rows="2"></textarea>',
            port_self: '<input type="text" placeholder="PORT">',
            vpn_ip_self: '<textarea placeholder="VPN IP" rows="2"></textarea>',
            direction: '<select><option value="" disabled selected>선택</option><option value="&lt;">&lt;</option><option value="&gt;">&gt;</option></select>',
            vpn_ip_org: '<textarea placeholder="VPN IP" rows="2"></textarea>',
            nw_ip_org: '<textarea placeholder="N/W IP" rows="2"></textarea>',
            port_org: '<input type="text" placeholder="PORT">'
          }; }

          // Add row
          var addBtn = document.getElementById('hw-row-add');
          if(addBtn){ addBtn.addEventListener('click', function(){ var tbody=table.querySelector('tbody'); if(!tbody) return; var count = tbody.querySelectorAll('tr').length; if(count>=50){ try{ addBtn.disabled = true; addBtn.title = '최대 50행까지 추가 가능합니다.'; }catch(_){ } alert('최대 50행까지 추가 가능합니다.'); return; } var tr=document.createElement('tr'); var f=cmRowInputs(); tr.innerHTML = '<td data-col="self_division">'+f.self_division+'</td>' +
              '<td data-col="line">'+f.line+'</td>' +
              '<td data-col="work_name">'+f.work_name+'</td>' +
              '<td data-col="real_ip">'+f.real_ip+'</td>' +
              '<td data-col="l4_ip">'+f.l4_ip+'</td>' +
              '<td data-col="nat_ip">'+f.nat_ip+'</td>' +
              '<td data-col="port_self">'+f.port_self+'</td>' +
              '<td data-col="vpn_ip_self">'+f.vpn_ip_self+'</td>' +
              '<td data-col="direction">'+f.direction+'</td>' +
              '<td data-col="vpn_ip_org">'+f.vpn_ip_org+'</td>' +
              '<td data-col="nw_ip_org">'+f.nw_ip_org+'</td>' +
              '<td data-col="port_org">'+f.port_org+'</td>' +
              '<td class="system-actions table-actions">' +
                '<button class="action-btn js-cm-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button>' +
                '<button class="action-btn danger js-cm-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>' +
              '</td>'; tbody.appendChild(tr); try{ cmGo(cmPages()); }catch(_){ } updateEmptyState(); }); }

          // Helper: read field values from a row
          function cmReadRow(tr){
            function read(name){ var td = tr.querySelector('[data-col="'+name+'"]'); if(!td) return ''; var el = td.querySelector('input, select, textarea'); return el? String(el.value).trim() : (td.getAttribute('data-orig') || td.textContent || '').trim(); }
            var colNames = ['self_division','line','work_name','real_ip','l4_ip','nat_ip','port_self','vpn_ip_self','direction','vpn_ip_org','nw_ip_org','port_org'];
            var payload = {};
            colNames.forEach(function(c){ var v = read(c); payload[c] = (v==='-'?'':v); });
            return payload;
          }

          // Helper: commit saved values to row display
          function cmCommitRow(tr, item){
            function cmEsc(v){ return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
            function nl2br(v){ return cmEsc(v).replace(/\r?\n/g,'<br>'); }
            var ipCols = { real_ip:1, l4_ip:1, nat_ip:1, vpn_ip_self:1, vpn_ip_org:1, nw_ip_org:1 };
            if(item.id) tr.setAttribute('data-comm-id', String(item.id));
            var cols = ['self_division','line','work_name','real_ip','l4_ip','nat_ip','port_self','vpn_ip_self','direction','vpn_ip_org','nw_ip_org','port_org'];
            cols.forEach(function(c){
              var td = tr.querySelector('[data-col="'+c+'"]'); if(!td) return;
              var val = (item[c] != null ? String(item[c]) : '').trim();
              var text = (val===''||val==null)? '-' : val;
              td.setAttribute('data-orig', text);
              if(ipCols[c]){ td.innerHTML = text==='-'? '-' : nl2br(text); }
              else { td.textContent = text; }
            });
            var toggleBtn = tr.querySelector('.js-cm-toggle');
            if(toggleBtn){ toggleBtn.setAttribute('data-action','edit'); toggleBtn.title='편집'; toggleBtn.setAttribute('aria-label','편집'); toggleBtn.innerHTML='<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon">'; }
          }

          // Delegate actions (edit/save/delete)
          table.addEventListener('click', function(ev){
            var target = ev.target.closest('.js-cm-del, .js-cm-toggle'); if(!target) return; var tr = ev.target.closest('tr'); if(!tr) return;

            // DELETE
            if(target.classList.contains('js-cm-del')){
              var commId = tr.getAttribute('data-comm-id');
              if(commId && CM_API_BASE){
                // Existing row -> API delete
                fetch(CM_API_BASE + '/' + commId, { method:'DELETE', headers:{'Content-Type':'application/json','Accept':'application/json'}, credentials:'same-origin', body:'{}' })
                  .then(function(r){ return r.json(); })
                  .then(function(data){
                    if(data.success){ if(tr.parentNode) tr.parentNode.removeChild(tr); }
                    else { alert(data.message || '삭제 실패'); }
                    try{ cmClampPage(); }catch(_){ } updateEmptyState();
                  })
                  .catch(function(){ alert('통신정책 삭제 중 오류가 발생했습니다.'); });
              } else {
                // New unsaved row -> just remove from DOM
                if(tr.parentNode) tr.parentNode.removeChild(tr);
                try{ cmClampPage(); }catch(_){ } updateEmptyState();
              }
              return;
            }

            // EDIT (switch to input mode)
            if(target.classList.contains('js-cm-toggle') && target.getAttribute('data-action')==='edit'){
              function cmEsc(v){ return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
              function toInput(name){
                var td=tr.querySelector('[data-col="'+name+'"]'); if(!td) return;
                var current=(td.getAttribute('data-orig') || (td.textContent||'')).trim();
                td.removeAttribute('data-dup-hidden');
                if(name==='real_ip' || name==='l4_ip' || name==='nat_ip' || name==='vpn_ip_self' || name==='vpn_ip_org' || name==='nw_ip_org'){
                  td.innerHTML = '<textarea rows="2">'+cmEsc(current==='-'?'':current)+'</textarea>';
                  return;
                }
                if(name==='direction'){
                  var dv = (current==='-'?'':current);
                  var opt = '<option value=""'+(dv?'':' selected')+' disabled>선택</option>'+
                            '<option value="&lt;"'+(dv==='<'?' selected':'')+'>&lt;</option>'+
                            '<option value="&gt;"'+(dv==='>'?' selected':'')+'>&gt;</option>';
                  td.innerHTML = '<select>'+opt+'</select>';
                  return;
                }
                td.innerHTML = '<input type="text" value="'+cmEsc(current==='-'?'':current)+'" placeholder="">';
              }
              ['self_division','line','work_name','real_ip','l4_ip','nat_ip','port_self','vpn_ip_self','direction','vpn_ip_org','nw_ip_org','port_org'].forEach(toInput);
              var toggleBtn = tr.querySelector('.js-cm-toggle'); if(toggleBtn){ toggleBtn.setAttribute('data-action','save'); toggleBtn.title='저장'; toggleBtn.setAttribute('aria-label','저장'); toggleBtn.innerHTML='<img src="/static/image/svg/save.svg" alt="저장" class="action-icon">'; }
              return;
            }

            // SAVE (create or update via API)
            if(target.classList.contains('js-cm-toggle') && target.getAttribute('data-action')==='save'){
              if(!CM_API_BASE){ alert('VPN 회선 ID를 확인할 수 없습니다.'); return; }
              var payload = cmReadRow(tr);
              var commId = tr.getAttribute('data-comm-id');
              var isNew = !commId;
              var url = isNew ? CM_API_BASE : (CM_API_BASE + '/' + commId);
              var method = isNew ? 'POST' : 'PUT';
              fetch(url, {
                method: method,
                headers: { 'Content-Type':'application/json', 'Accept':'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(payload)
              })
              .then(function(r){ return r.json(); })
              .then(function(data){
                if(data.success && data.item){
                  cmCommitRow(tr, data.item);
                  updateEmptyState();
                  try{ cmSuppressDuplicates(); }catch(_){ }
                } else {
                  alert(data.message || '저장 실패');
                }
              })
              .catch(function(){ alert('통신정책 저장 중 오류가 발생했습니다.'); });
              return;
            }
          });

          // CSV helpers for communication
          function cmEscapeCSV(val){ return '"' + String(val).replace(/"/g,'""') + '"'; }
          function cmRowSaved(tr){ var t=tr.querySelector('.js-cm-toggle'); var inEdit=t && t.getAttribute('data-action')==='save'; if(inEdit) return false; return !tr.querySelector('td[data-col] input, td[data-col] select, td[data-col] textarea'); }
          function cmVisibleRows(){ var tbody=table.querySelector('tbody'); if(!tbody) return []; return Array.from(tbody.querySelectorAll('tr')).filter(function(tr){ return !(tr.hasAttribute('data-hidden') || tr.style.display==='none'); }); }
          function cmSavedVisibleRows(){ return cmVisibleRows().filter(cmRowSaved); }
          function cmExportCSV(){ var tbody=table.querySelector('tbody'); if(!tbody) return; var headers=['구분','회선','업무명','REAL IP','L4 IP','NAT IP','PORT','VPN IP(자사)','방향','VPN IP(기관)','N/W IP(기관)','PORT(기관)']; var trs=cmSavedVisibleRows(); if(trs.length===0) return; function text(tr,col){ var td=tr.querySelector('[data-col="'+col+'"]'); return td? ((td.getAttribute('data-orig') || td.textContent || '').trim()) : ''; } var cols=['self_division','line','work_name','real_ip','l4_ip','nat_ip','port_self','vpn_ip_self','direction','vpn_ip_org','nw_ip_org','port_org']; var rows = trs.map(function(tr){ return cols.map(function(c){ return text(tr,c); }); }); var lines = [headers].concat(rows).map(function(arr){ return arr.map(cmEscapeCSV).join(','); }); var csv='\uFEFF'+lines.join('\r\n'); var d=new Date(); var yyyy=d.getFullYear(); var mm=String(d.getMonth()+1).padStart(2,'0'); var dd=String(d.getDate()).padStart(2,'0'); var filename='communication_'+yyyy+mm+dd+'.csv'; try{ var blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); var url=URL.createObjectURL(blob); var a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); } catch(_){ var a2=document.createElement('a'); a2.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a2.download=filename; document.body.appendChild(a2); a2.click(); document.body.removeChild(a2); } }
          (function(){ var btn = document.getElementById('hw-download-btn'); var modalId='hw-download-modal'; var closeBtn=document.getElementById('hw-download-close'); var confirmBtn=document.getElementById('hw-download-confirm'); function openModalLocal(id){ var el=document.getElementById(id); if(!el) return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden','false'); } function closeModalLocal(id){ var el=document.getElementById(id); if(!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } } if(btn){ btn.addEventListener('click', function(){ if(btn.disabled) return; var saved=cmSavedVisibleRows(); var total=saved.length; if(total<=0) return; var subtitle=document.getElementById('hw-download-subtitle'); if(subtitle){ subtitle.textContent = '현재 결과 '+total+'개 항목을 CSV로 내보냅니다.'; } var rowSelectedWrap=document.getElementById('hw-csv-range-row-selected'); var optSelected=document.getElementById('hw-csv-range-selected'); var optAll=document.getElementById('hw-csv-range-all'); if(rowSelectedWrap) rowSelectedWrap.hidden = true; if(optSelected){ optSelected.disabled = true; optSelected.checked = false; } if(optAll){ optAll.checked = true; } openModalLocal(modalId); }); } if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalLocal(modalId); }); } var modalEl=document.getElementById(modalId); if(modalEl){ modalEl.addEventListener('click', function(e){ if(e.target===modalEl) closeModalLocal(modalId); }); document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(modalId); }); } if(confirmBtn){ confirmBtn.addEventListener('click', function(){ cmExportCSV(); closeModalLocal(modalId); }); } })();

          return; // handled communication, stop here
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

  
  
      // [Removed legacy Change Log implementation]
  
  });
})();
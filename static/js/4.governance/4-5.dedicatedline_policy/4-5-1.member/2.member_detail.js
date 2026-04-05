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

    // ---------- VPN Detail: Basic Info edit modal ----------
    (function(){
      try{
        var path = (location && location.pathname || '').toLowerCase();
        if(!/\/4-4\.vpn_policy\/4-4-1\.vpn\/2\.vpn_detail\.html$/.test(path)) return;

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

        function buildSelect(name, current, options){
          var opts = ['<option value=""'+(current? '':' selected')+'>선택</option>'].concat(options.map(function(o){ return '<option value="'+esc(o)+'"'+(String(current)===String(o)?' selected':'')+'>'+esc(o)+'</option>'; }));
          return '<select name="'+name+'" class="form-input">'+opts.join('')+'</select>';
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
          '    <div class="form-row"><label>기관명<span class="required">*</span></label><input name="org_name" class="form-input" placeholder="입력" value="'+esc(data.org_name)+'" required></div>\n'+
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
          '    <div class="form-row"><label>장비명</label><input name="device_name" class="form-input" placeholder="입력" value="'+esc(data.device_name)+'"></div>\n'+
          '  </div>\n'+
          '</div>';
        }

        function val(form, name){ var el=form? form.querySelector('[name="'+name+'"]') : null; return el? el.value.trim():''; }

        // Wire up open/close
        var openBtn = document.getElementById(EDIT_OPEN_ID);
        if(openBtn){ openBtn.addEventListener('click', function(){ buildVpnEditForm(); openModalLocal(EDIT_MODAL_ID); var first = document.querySelector('#'+EDIT_FORM_ID+' .form-input'); if(first){ try{ first.focus(); }catch(_){ } } }); }

        var closeBtn = document.getElementById(EDIT_CLOSE_ID);
        if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalLocal(EDIT_MODAL_ID); }); }
        var modalEl = document.getElementById(EDIT_MODAL_ID);
        if(modalEl){ modalEl.addEventListener('click', function(e){ if(e.target===modalEl) closeModalLocal(EDIT_MODAL_ID); }); document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(EDIT_MODAL_ID); }); }

        // Save handler
        var saveBtn = document.getElementById(EDIT_SAVE_ID);
        if(saveBtn){ saveBtn.addEventListener('click', function(){
          var form = document.getElementById(EDIT_FORM_ID); if(!form){ closeModalLocal(EDIT_MODAL_ID); return; }
          var orgName = val(form, 'org_name'); if(!orgName){ try{ form.querySelector('[name="org_name"]').focus(); }catch(_){ } return; }
          var status = val(form, 'status');
          var lineSpeed = val(form, 'line_speed');
          var lineCount = intify(val(form, 'line_count')); if(lineCount < 0) lineCount = 0;
          var protocol = val(form, 'protocol');
          var manager = val(form, 'manager');
          var cipher = val(form, 'cipher');
          var upCountry = val(form, 'upper_country');
          var upAddr = val(form, 'upper_country_address');
          var lowCountry = val(form, 'lower_country');
          var lowAddr = val(form, 'lower_country_address');
          var device = val(form, 'device_name');

          setText('vpn-org-name', orgName);
          setText('vpn-status', status);
          setText('vpn-line-speed', lineSpeed);
          setText('vpn-line-count', lineCount);
          setText('vpn-protocol', protocol);
          setText('vpn-manager', manager);
          setText('vpn-cipher', cipher);
          setText('vpn-upper-country', upCountry);
          setText('vpn-upper-address', upAddr);
          setText('vpn-lower-country', lowCountry);
          setText('vpn-lower-address', lowAddr);
          setText('vpn-device-name', device);

          closeModalLocal(EDIT_MODAL_ID);
        }); }
      }catch(_){ /* no-op */ }
    })();

    // ---------- Dedicated Line (Member) Detail: Basic Info edit modal ----------
    (function(){
      try{
        // This page is served via routed URLs (e.g. /p/gov_dedicatedline_member_detail),
        // so avoid brittle pathname checks and gate on expected DOM.
        if(!document.getElementById('detail-edit-open')) return;
        if(!document.getElementById('system-edit-modal')) return;
        if(!document.getElementById('md-org_name')) return;

        function isDedicatedLineDebugEnabled(){
          try{
            var qs = new URLSearchParams((location && location.search) || '');
            if(qs.get('debug')==='1' || qs.get('dl_debug')==='1') return true;
            if(window && window.localStorage && window.localStorage.getItem('blossom.debug.dedicatedline')==='1') return true;
          }catch(_){ }
          return false;
        }
        function dlDebug(){
          if(!isDedicatedLineDebugEnabled()) return;
          try{
            if(window && window.console && typeof window.console.debug === 'function'){
              window.console.debug.apply(window.console, ['[dedicatedline:detail]'].concat([].slice.call(arguments)));
            }
          }catch(_){ }
        }

        dlDebug('init', { path: (location && location.pathname) || '', id: (function(){ try{ return new URLSearchParams((location && location.search) || '').get('id') || ''; }catch(_){ return ''; } })() });

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

        function buildSelect(name, current, options){
          var opts = ['<option value=""'+(current? '':' selected')+'>선택</option>'].concat(options.map(function(o){ return '<option value="'+esc(o)+'"'+(String(current)===String(o)?' selected':'')+'>'+esc(o)+'</option>'; }));
          return '<select name="'+name+'" class="form-input">'+opts.join('')+'</select>';
        }

        function buildEditFormFromDisplay(){
          var form=document.getElementById(EDIT_FORM_ID); if(!form) return;
          var data={
            org_name:getText('md-org_name'), status:getText('md-status'), telco:getText('md-telco'), protocol:getText('md-protocol'), manager:getText('md-manager'),
            line_no:getText('md-line_no'), line_name:getText('md-line_name'), business:getText('md-business'), speed:getText('md-speed'), open_date:getText('md-open_date'), close_date:getText('md-close_date'), dr_line:getText('md-dr_line'),
            device_name:getText('md-device_name'), network_device:getText('md-network_device'), slot:getText('md-slot'), port:getText('md-port'), child_device:getText('md-child_device'), child_port:getText('md-child_port'),
            our_agency:getText('md-our_agency'), org_agency:getText('md-org_agency')
          };

          var statusSel = buildSelect('status', data.status, ['운용','해지']);
          var telcoSel  = buildSelect('telco', data.telco, ['KT','SKB','LG']);
          var protoSel  = buildSelect('protocol', data.protocol, ['TCP','X25']);
          var drSel     = buildSelect('dr_line', data.dr_line, ['O','X']);

          form.innerHTML = ''+
          '<div class="form-section">\n'+
          '  <div class="section-header"><h4>기본</h4></div>\n'+
          '  <div class="form-grid">\n'+
          '    <div class="form-row"><label>기관명<span class="required">*</span></label><input name="org_name" class="form-input" placeholder="입력" value="'+esc(data.org_name)+'" required></div>\n'+
          '    <div class="form-row"><label>상태</label>'+statusSel+'</div>\n'+
          '    <div class="form-row"><label>통신사</label>'+telcoSel+'</div>\n'+
          '    <div class="form-row"><label>프로토콜</label>'+protoSel+'</div>\n'+
          '    <div class="form-row"><label>관리주체</label><input name="manager" class="form-input" placeholder="입력" value="'+esc(data.manager)+'"></div>\n'+
          '  </div>\n'+
          '</div>\n'+
          '<div class="form-section">\n'+
          '  <div class="section-header"><h4>회선</h4></div>\n'+
          '  <div class="form-grid">\n'+
          '    <div class="form-row"><label>회선번호</label><input name="line_no" class="form-input" placeholder="입력" value="'+esc(data.line_no)+'"></div>\n'+
          '    <div class="form-row"><label>회선명</label><input name="line_name" class="form-input" placeholder="입력" value="'+esc(data.line_name)+'"></div>\n'+
          '    <div class="form-row"><label>업무</label><input name="business" class="form-input" placeholder="입력" value="'+esc(data.business)+'"></div>\n'+
          '    <div class="form-row"><label>속도</label><input name="speed" class="form-input" placeholder="예: 1G, 100M" value="'+esc(data.speed)+'"></div>\n'+
          '    <div class="form-row"><label>개통일자</label><input name="open_date" class="form-input date-input" placeholder="YYYY-MM-DD" value="'+esc(data.open_date)+'"></div>\n'+
          '    <div class="form-row"><label>해지일자</label><input name="close_date" class="form-input date-input" placeholder="YYYY-MM-DD" value="'+esc(data.close_date)+'"></div>\n'+
          '    <div class="form-row"><label>DR회선</label>'+drSel+'</div>\n'+
          '  </div>\n'+
          '</div>\n'+
          '<div class="form-section">\n'+
          '  <div class="section-header"><h4>장비</h4></div>\n'+
          '  <div class="form-grid">\n'+
          '    <div class="form-row"><label>장비명</label><input name="device_name" class="form-input" placeholder="입력" value="'+esc(data.device_name)+'"></div>\n'+
          '    <div class="form-row"><label>통신장비</label><input name="network_device" class="form-input" placeholder="입력" value="'+esc(data.network_device)+'"></div>\n'+
          '    <div class="form-row"><label>슬롯</label><input name="slot" type="number" min="0" step="1" class="form-input" placeholder="숫자" value="'+esc(data.slot)+'"></div>\n'+
          '    <div class="form-row"><label>포트</label><input name="port" class="form-input" placeholder="입력" value="'+esc(data.port)+'"></div>\n'+
          '    <div class="form-row"><label>하위장비</label><input name="child_device" class="form-input" placeholder="입력" value="'+esc(data.child_device)+'"></div>\n'+
          '    <div class="form-row"><label>하위포트</label><input name="child_port" class="form-input" placeholder="입력" value="'+esc(data.child_port)+'"></div>\n'+
          '  </div>\n'+
          '</div>\n'+
          '<div class="form-section">\n'+
          '  <div class="section-header"><h4>관할</h4></div>\n'+
          '  <div class="form-grid">\n'+
          '    <div class="form-row"><label>당사관할국</label><input name="our_agency" class="form-input" placeholder="입력" value="'+esc(data.our_agency)+'"></div>\n'+
          '    <div class="form-row"><label>기관관할국</label><input name="org_agency" class="form-input" placeholder="입력" value="'+esc(data.org_agency)+'"></div>\n'+
          '  </div>\n'+
          '</div>';

          // Initialize date pickers if helper is available
          try{ if(window.__blsInitDatePickers){ window.__blsInitDatePickers(document.getElementById(EDIT_FORM_ID)); } }catch(_){ }
        }

        function val(form, name){ var el=form? form.querySelector('[name="'+name+'"]') : null; return el? el.value.trim():''; }

        // Wire open/close
        var openBtn = document.getElementById(EDIT_OPEN_ID);
        if(openBtn){ openBtn.addEventListener('click', function(){
          dlDebug('open click');
          buildEditFormFromDisplay();
          openModalLocal(EDIT_MODAL_ID);
          dlDebug('modal opened', EDIT_MODAL_ID);
          var first = document.querySelector('#'+EDIT_FORM_ID+' .form-input');
          if(first){ try{ first.focus(); }catch(_){ } }
        }); }
        document.getElementById(EDIT_CLOSE_ID)?.addEventListener('click', function(){ closeModalLocal(EDIT_MODAL_ID); });
        (function(){ var modalEl=document.getElementById(EDIT_MODAL_ID); if(!modalEl) return; modalEl.addEventListener('click', function(e){ if(e.target===modalEl) closeModalLocal(EDIT_MODAL_ID); }); document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(EDIT_MODAL_ID); }); })();

        function _dlCoercePositiveInt(v){
          var n = parseInt(String(v==null?'':v).replace(/[^0-9-]/g,''), 10);
          return (isNaN(n)||!isFinite(n)||n<=0) ? null : n;
        }

        function _dlCleanToken(v){
          var s = String(v==null?'':v).trim();
          return (s === '-' ? '' : s);
        }

        function _dlGetLineIdFromQuery(){
          try{
            var qs = new URLSearchParams((location && location.search) || '');
            var id = _dlCoercePositiveInt(qs.get('id'));
            return id && id > 0 ? id : null;
          }catch(_){ return null; }
        }

        async function _dlApiRequestJson(url, opts){
          var options = Object.assign({ method:'GET', credentials:'same-origin' }, opts || {});
          options.headers = Object.assign({ 'Accept':'application/json' }, options.headers || {});
          if(options.body && !options.headers['Content-Type']) options.headers['Content-Type'] = 'application/json';
          var res = await fetch(url, options);
          var contentType = '';
          try{ contentType = String(res.headers.get('content-type') || ''); }catch(_){ contentType = ''; }
          var text = await res.text();
          var looksLikeHtml = /text\/html/i.test(contentType) || /^\s*<!doctype\s+html/i.test(text) || /^\s*<html\b/i.test(text);
          var redirectedToLogin = !!(res && res.redirected && res.url && /\/login\b/i.test(String(res.url)));
          if(redirectedToLogin) throw new Error('로그인이 필요합니다. 새로고침 후 다시 로그인하세요.');
          if(looksLikeHtml) throw new Error('API 응답이 JSON이 아닙니다. (status ' + res.status + ')');
          var json;
          try{ json = text ? JSON.parse(text) : {}; }catch(_e){ json = { success:false, message:text || 'Invalid JSON' }; }
          if(!res.ok || (json && json.success === false)){
            var msg = (json && (json.message || json.error)) || ('HTTP ' + res.status);
            throw new Error(msg);
          }
          return json;
        }

        var _dlActorUserId = null;
        async function _dlEnsureActorUserId(){
          if(_dlActorUserId) return _dlActorUserId;
          try{
            var me = await _dlApiRequestJson('/api/session/me', { method:'GET' });
            var id = _dlCoercePositiveInt(me && me.user && me.user.id);
            if(id && id > 0){ _dlActorUserId = id; return id; }
          }catch(_e){ }
          return null;
        }

        function _dlApplyDisplayFromItem(item){
          if(!item) return;
          var r = (window && window.__memberDetailRenderers) ? window.__memberDetailRenderers : {};
          try{
            var titleEl = document.getElementById('page-header-title');
            if(titleEl) titleEl.textContent = String((item.org_name == null || item.org_name === '') ? '-' : item.org_name);
            var subtitleEl = document.getElementById('page-header-subtitle');
            if(subtitleEl) subtitleEl.textContent = String((item.protocol_code == null || item.protocol_code === '') ? '-' : item.protocol_code);
          }catch(_e){ }
          setText('md-org_name', item.org_name || '-');
          if(typeof r.renderStatus === 'function') r.renderStatus('md-status', item.status_code || '');
          else setText('md-status', item.status_code || '-');
          if(typeof r.renderTelco === 'function') r.renderTelco('md-telco', item.carrier_code || '');
          else setText('md-telco', item.carrier_code || '-');
          setText('md-protocol', item.protocol_code || '-');
          setText('md-manager', item.management_owner || '-');
          setText('md-line_no', item.line_no || '-');
          setText('md-line_name', item.line_name || '-');
          setText('md-business', item.business_purpose || '-');
          if(typeof r.renderSpeed === 'function') r.renderSpeed('md-speed', item.speed_label || '');
          else setText('md-speed', item.speed_label || '-');
          setText('md-open_date', item.opened_date || '-');
          setText('md-close_date', item.closed_date || '-');
          if(typeof r.renderDr === 'function') r.renderDr('md-dr_line', item.dr_line_no || '');
          else setText('md-dr_line', item.dr_line_no || '-');
          setText('md-device_name', item.device_name || '-');
          setText('md-network_device', item.comm_device || '-');
          setText('md-slot', (item.slot_no == null || item.slot_no === '') ? '-' : String(item.slot_no));
          setText('md-port', item.port_no || '-');
          setText('md-child_device', item.child_device_name || '-');
          setText('md-child_port', item.child_port_no || '-');
          setText('md-our_agency', item.our_jurisdiction || '-');
          setText('md-org_agency', item.org_jurisdiction || '-');
        }

        // Save handler: persist to API then reflect to display cards
        var saveBtn = document.getElementById(EDIT_SAVE_ID);
        if(saveBtn){ saveBtn.addEventListener('click', async function(){
          dlDebug('save click');
          var form = document.getElementById(EDIT_FORM_ID); if(!form){ closeModalLocal(EDIT_MODAL_ID); return; }
          var orgName = _dlCleanToken(val(form, 'org_name')); if(!orgName){ try{ form.querySelector('[name="org_name"]').focus(); }catch(_){ } return; }
          var lineId = _dlGetLineIdFromQuery();
          if(!lineId){
            try{ alert('id 파라미터가 없어 저장할 수 없습니다. 목록에서 다시 진입하세요.'); }catch(_){ }
            return;
          }
          var actorUserId = await _dlEnsureActorUserId();
          if(!actorUserId){
            try{ alert('로그인이 필요합니다. 새로고침 후 다시 로그인하세요.'); }catch(_){ }
            return;
          }

          var prevText = saveBtn.textContent;
          saveBtn.disabled = true;
          try{ saveBtn.textContent = '저장중...'; }catch(_){ }

          try{
            var payload = {
              actor_user_id: actorUserId,
              org_name: orgName,
              status_code: _dlCleanToken(val(form, 'status')),
              carrier_code: _dlCleanToken(val(form, 'telco')),
              protocol_code: _dlCleanToken(val(form, 'protocol')),
              management_owner: _dlCleanToken(val(form, 'manager')),
              line_no: _dlCleanToken(val(form, 'line_no')),
              line_name: _dlCleanToken(val(form, 'line_name')),
              business_purpose: _dlCleanToken(val(form, 'business')),
              speed_label: _dlCleanToken(val(form, 'speed')),
              opened_date: _dlCleanToken(val(form, 'open_date')),
              closed_date: _dlCleanToken(val(form, 'close_date')),
              dr_line_no: _dlCleanToken(val(form, 'dr_line')),
              device_name: _dlCleanToken(val(form, 'device_name')),
              comm_device: _dlCleanToken(val(form, 'network_device')),
              slot_no: _dlCoercePositiveInt(_dlCleanToken(val(form, 'slot'))),
              port_no: _dlCleanToken(val(form, 'port')),
              child_device_name: _dlCleanToken(val(form, 'child_device')),
              child_port_no: _dlCleanToken(val(form, 'child_port')),
              our_jurisdiction: _dlCleanToken(val(form, 'our_agency')),
              org_jurisdiction: _dlCleanToken(val(form, 'org_agency')),
            };

            dlDebug('save payload', payload);
            var res = await _dlApiRequestJson('/api/network/leased-lines/' + encodeURIComponent(String(lineId)), {
              method: 'PUT',
              body: JSON.stringify(payload),
            });
            var item = (res && res.item) ? res.item : res;
            _dlApplyDisplayFromItem(item);
            closeModalLocal(EDIT_MODAL_ID);
          }catch(err){
            try{ console.error(err); }catch(_){ }
            try{ alert(err && err.message ? err.message : '저장 중 오류가 발생했습니다.'); }catch(_){ }
          } finally {
            saveBtn.disabled = false;
            try{ saveBtn.textContent = prevText; }catch(_){ }
          }
        }); }
        // Style renderers (match list page)
        (function(){
          function escapeHTML(str){ return String(str==null?'':str).replace(/[&<>"']/g, function(s){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[s]); }); }
          function setHTMLById(id, html){ var el=document.getElementById(id); if(el){ el.innerHTML = html; } }
          function renderStatus(id, val){ var v=String(val||'').trim(); if(!v){ setText(id,'-'); return; } var cls='ws-wait'; if(v==='운용') cls='ws-run'; else if(v==='해지') cls='ws-wait'; var html='<span class="status-pill"><span class="status-dot '+cls+'" aria-hidden="true"></span><span class="status-text">'+escapeHTML(v)+'</span></span>'; setHTMLById(id, html); }
          var TELCO_LOGOS = { 'KT':'/static/image/svg/telecom/KT_Logo.svg', 'SKB':'/static/image/svg/telecom/SKT_Logo.svg', 'LG':'/static/image/svg/telecom/LGU_Logo.svg' };
          function normalizeTelcoKey(v){ var s=String(v||'').toUpperCase().trim(); if(s==='LGU+') return 'LG'; if(s==='SKT') return 'SKB'; return s; }
          function renderTelco(id, val){
            var key=normalizeTelcoKey(val); var logo=TELCO_LOGOS[key];
            if(logo){
              // Use attributes for size so we don't require new CSS; avoid relying on table-scoped styles
              setHTMLById(id, '<img src="'+logo+'" alt="'+escapeHTML(val||key)+'" title="'+escapeHTML(val||key)+'" class="telco-logo" width="16" height="16">');
            } else { setText(id, '-'); }
          }
          function parseSpeedToMbps(val){ var s=String(val||'').trim().toLowerCase(); if(!s) return null; var m=s.match(/^(\d+(?:\.\d+)?)\s*(k|kbps|m|mbps|g|gbps)?$/i); if(!m) return null; var num=parseFloat(m[1]); var unit=(m[2]||'m').toLowerCase(); var mult=1; if(unit==='k'||unit==='kbps') mult=0.001; else if(unit==='m'||unit==='mbps') mult=1; else if(unit==='g'||unit==='gbps') mult=1000; return num*mult; }
          function getSpeedTier(mbps){ if(!isFinite(mbps)||mbps<0) return {tier:0,name:'미정'}; if(mbps<10) return {tier:1,name:'매우 낮음(<10Mbps)'}; if(mbps<100) return {tier:2,name:'낮음(10~99Mbps)'}; if(mbps<1000) return {tier:3,name:'보통(100Mbps~1Gbps 미만)'}; if(mbps<5000) return {tier:4,name:'높음(1~5Gbps 미만)'}; return {tier:5,name:'매우 높음(≥5Gbps)'}; }
          function renderSpeed(id, val){
            var raw=String(val||'').trim();
            if(!raw){ setText(id,'-'); return; }
            var mbps=parseSpeedToMbps(raw);
            if(mbps==null){ setText(id, raw); return; }
            var t=getSpeedTier(mbps);
            var approx = Number.isFinite(mbps)? (mbps>=1 ? (mbps.toFixed(mbps>=100?0:1)) : mbps.toFixed(3)) : '';
            var title = t.name + (approx? (' • 약 '+approx+' Mbps'):'');
            var html='<span class="speed-pill" title="'+escapeHTML(title)+'"><span class="speed-dot tier-'+t.tier+'" aria-hidden="true"></span><span class="speed-text">'+escapeHTML(raw)+'</span></span>';
            // Wrap with a table-scoped class so existing CSS applies without adding new rules
            setHTMLById(id, '<span class="server-data-table">'+html+'</span>');
          }
          function renderDr(id, val){ var v=String(val||'').trim().toUpperCase(); if(v==='O'||v==='X'){ setHTMLById(id, '<span class="cell-ox with-badge"><span class="ox-badge '+(v==='O'?'on':'off')+'">'+v+'</span></span>'); } else { setText(id, '-'); } }
          // expose to this closure
          window.__memberDetailRenderers = { renderStatus:renderStatus, renderTelco:renderTelco, renderSpeed:renderSpeed, renderDr:renderDr };
          // Initial pass: apply styles to existing values
          renderStatus('md-status', getText('md-status'));
          renderTelco('md-telco', getText('md-telco'));
          renderSpeed('md-speed', getText('md-speed'));
          renderDr('md-dr_line', getText('md-dr_line'));
        })();
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

  
      });
      })();
      
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

          var empty = document.getElementById('hw-empty');
          var infoEl = document.getElementById('hw-pagination-info');
          var numWrap = document.getElementById('hw-page-numbers');
          var btnFirst = document.getElementById('hw-first');
          var btnPrev = document.getElementById('hw-prev');
          var btnNext = document.getElementById('hw-next');
          var btnLast = document.getElementById('hw-last');
          // selection UI is removed for communication context
          var selectAll = null;

          // No pagination UI: render all rows on one page; still keep helpers for consistency
          var cmState = { page:1, pageSize:100000 };
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
            rows.forEach(function(tr,idx){ var visible=idx>=startIdx && idx<=endIdx; tr.style.display = visible? '' : 'none'; if(visible){ tr.removeAttribute('data-hidden'); } else { tr.setAttribute('data-hidden','1'); } var cb=tr.querySelector('.hw-row-check'); if(cb){ tr.classList.toggle('selected', !!cb.checked && visible); } });
            cmUpdateUI();
            if(selectAll){ var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check'); if(visChecks.length){ selectAll.checked = Array.prototype.every.call(visChecks, function(c){ return c.checked; }); } else { selectAll.checked=false; } }
          }
          function cmGo(p){ cmState.page=p; cmRenderPage(); }
          function cmGoDelta(d){ cmGo(cmState.page + d); }
          if(numWrap){ numWrap.addEventListener('click', function(e){ var b=e.target.closest('button.page-btn'); if(!b) return; var p=parseInt(b.dataset.page,10); if(!isNaN(p)) cmGo(p); }); }
          if(btnFirst) btnFirst.addEventListener('click', function(){ cmGo(1); });
          if(btnPrev) btnPrev.addEventListener('click', function(){ cmGoDelta(-1); });
          if(btnNext) btnNext.addEventListener('click', function(){ cmGoDelta(1); });
          if(btnLast) btnLast.addEventListener('click', function(){ cmGo(cmPages()); });

          function updateEmptyState(){
            try{
              var has = !!table.querySelector('tbody tr');
              if(empty){ empty.hidden = has; empty.style.display = has ? 'none' : ''; }
            }catch(_){ if(empty){ empty.hidden=false; empty.style.display=''; } }
            var csvBtn=document.getElementById('hw-download-btn');
            if(csvBtn){ var hasRows = !!table.querySelector('tbody tr'); csvBtn.disabled=!hasRows; csvBtn.setAttribute('aria-disabled', (!hasRows).toString()); csvBtn.title = hasRows? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.'; }
            // Enforce and reflect 50-row limit
            try{
              var tbody=table.querySelector('tbody'); var cnt = tbody? tbody.querySelectorAll('tr').length : 0;
              var addBtnEl = document.getElementById('hw-row-add');
              if(addBtnEl){ addBtnEl.disabled = cnt>=50; addBtnEl.title = cnt>=50? '최대 50행까지 추가 가능합니다.' : '행 추가'; }
            }catch(_){ }
            cmRenderPage();
            try{ cmSuppressDuplicates(); }catch(_){ }
          }
          updateEmptyState();

          // Selection UI removed: no select-all or row selection handlers

          // Hide duplicate values on contiguous rows except when a row is in edit mode
          function cmSuppressDuplicates(){
            try{
              function cmEsc(v){ return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
              function nl2br(v){ return cmEsc(v).replace(/\r?\n/g,'<br>'); }
              // Do not suppress PORT columns; show always
              var dupCols = ['self_division','line','work_name','real_ip','l4_ip','nat_ip','vpn_ip_self','vpn_ip_org','nw_ip_org'];
              var ipCols = { real_ip:1, l4_ip:1, nat_ip:1, vpn_ip_self:1, vpn_ip_org:1, nw_ip_org:1 };
              // Track last values within the same 'self_division' group only
              var last = {};
              var lastTdMap = {}; // remember last visible cell per column to hide border-between duplicates
              dupCols.forEach(function(c){ last[c] = null; lastTdMap[c] = null; });
              var lastDivision = null;
              var lastRealIP = null; // for conditional L4 IP visibility when REAL IP changes
              var rows = table.querySelectorAll('tbody tr');
              rows.forEach(function(tr){
                // Skip rows in edit mode
                var editing = !!tr.querySelector('td[data-col] input, td[data-col] select, td[data-col] textarea');
                if(editing) return;

                // Determine current division (group key)
                var divTd = tr.querySelector('[data-col="self_division"]');
                var divOrig = '';
                if(divTd){
                  var d = divTd.getAttribute('data-orig');
                  if(!d){ d = (divTd.textContent||'').trim(); divTd.setAttribute('data-orig', d); }
                  divOrig = d;
                }
                // Reset memory when division changes
                if(lastDivision === null || divOrig !== lastDivision){
                  lastDivision = divOrig;
                  dupCols.forEach(function(c){ last[c] = null; lastTdMap[c] = null; });
                  lastRealIP = null;
                }

                // Read current row's REAL IP original for L4 IP conditional logic
                var realTd = tr.querySelector('[data-col="real_ip"]');
                var realOrig = '';
                if(realTd){
                  var r = realTd.getAttribute('data-orig');
                  if(!r){ var tReal = (realTd.textContent||'').trim(); realTd.setAttribute('data-orig', tReal); r = tReal; }
                  realOrig = r;
                }

                // Apply suppression within the current division group only
                dupCols.forEach(function(col){
                  var td = tr.querySelector('[data-col="'+col+'"]'); if(!td) return;
                  var orig = td.getAttribute('data-orig');
                  if(!orig){ var t = (td.textContent||'').trim(); td.setAttribute('data-orig', t); orig = t; }
                  // Special rule: L4 IP should be shown when REAL IP differs from previous row within the same group
                  if(col === 'l4_ip'){
                    var realChanged = (lastRealIP !== null) && (realOrig !== lastRealIP);
                    if(realChanged){
                      // Force show current L4 IP value
                      td.removeAttribute('data-dup-hidden');
                      td.innerHTML = orig ? nl2br(orig) : '-';
                      // Since REAL IP changed, do not merge border from previous L4 cell
                      lastTdMap[col] = td; // new anchor for potential subsequent duplicates
                    } else if(last[col] != null && orig && orig === last[col]){
                      td.setAttribute('data-dup-hidden','1');
                      td.textContent = '';
                      // Hide the line between the previous same-value cell and this duplicate
                      if(lastTdMap[col]){ lastTdMap[col].setAttribute('data-merge-next','1'); }
                    } else {
                      td.removeAttribute('data-dup-hidden');
                      td.innerHTML = orig ? nl2br(orig) : '-';
                      // New visible anchor
                      lastTdMap[col] = td;
                    }
                  } else {
                    if(last[col] != null && orig && orig === last[col]){
                      td.setAttribute('data-dup-hidden','1');
                      td.textContent = '';
                      if(lastTdMap[col]){ lastTdMap[col].setAttribute('data-merge-next','1'); }
                    } else {
                      td.removeAttribute('data-dup-hidden');
                      if(ipCols[col]){ td.innerHTML = orig ? nl2br(orig) : '-'; }
                      else { td.textContent = orig || '-'; }
                      lastTdMap[col] = td;
                    }
                  }
                  last[col] = orig;
                });
                // Update last REAL IP after processing columns
                lastRealIP = realOrig;
                // Ensure PORT columns and 방향 are always shown (no suppression)
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

          // Builders for inputs
          function cmRowInputs(){ return {
            self_division: '<input type="text" placeholder="구분">',
            line: '<input type="text" placeholder="회선">',
            work_name: '<input type="text" placeholder="업무명">',
            // IP 계열은 다중라인 입력 지원
            real_ip: '<textarea placeholder="REAL IP" rows="2"></textarea>',
            l4_ip: '<textarea placeholder="L4 IP" rows="2"></textarea>',
            nat_ip: '<textarea placeholder="NAT IP" rows="2"></textarea>',
            port_self: '<input type="text" placeholder="PORT">',
            vpn_ip_self: '<textarea placeholder="VPN IP" rows="2"></textarea>',
            // 방향은 <, > 중 선택
            direction: '<select><option value="" disabled selected>선택</option><option value="<"><</option><option value=">">></option></select>',
            vpn_ip_org: '<textarea placeholder="VPN IP" rows="2"></textarea>',
            nw_ip_org: '<textarea placeholder="N/W IP" rows="2"></textarea>',
            port_org: '<input type="text" placeholder="PORT">'
          }; }

          // Add row
          var addBtn = document.getElementById('hw-row-add');
          if(addBtn){ addBtn.addEventListener('click', function(){ var tbody=table.querySelector('tbody'); if(!tbody) return; var count = tbody.querySelectorAll('tr').length; if(count>=50){ try{ addBtn.disabled = true; addBtn.title = '최대 50행까지 추가 가능합니다.'; }catch(_){ } alert('최대 50행까지 추가 가능합니다.'); return; } var tr=document.createElement('tr'); var f=cmRowInputs(); tr.innerHTML = `
              <td data-col="self_division">${f.self_division}</td>
              <td data-col="line">${f.line}</td>
              <td data-col="work_name">${f.work_name}</td>
              <td data-col="real_ip">${f.real_ip}</td>
              <td data-col="l4_ip">${f.l4_ip}</td>
              <td data-col="nat_ip">${f.nat_ip}</td>
              <td data-col="port_self">${f.port_self}</td>
              <td data-col="vpn_ip_self">${f.vpn_ip_self}</td>
              <td data-col="direction">${f.direction}</td>
              <td data-col="vpn_ip_org">${f.vpn_ip_org}</td>
              <td data-col="nw_ip_org">${f.nw_ip_org}</td>
              <td data-col="port_org">${f.port_org}</td>
              <td class="system-actions table-actions">
                <button class="action-btn js-cm-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button>
                <button class="action-btn danger js-cm-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>
              </td>`; tbody.appendChild(tr); try{ cmGo(cmPages()); }catch(_){ } updateEmptyState(); }); }

          // Delegate actions (edit/save/delete)
          table.addEventListener('click', function(ev){
            var target = ev.target.closest('.js-cm-del, .js-cm-toggle'); if(!target) return; var tr = ev.target.closest('tr'); if(!tr) return;
            if(target.classList.contains('js-cm-del')){ if(tr && tr.parentNode){ tr.parentNode.removeChild(tr); } try{ cmClampPage(); }catch(_){ } updateEmptyState(); try{ cmSuppressDuplicates(); }catch(_){ } return; }
            if(target.classList.contains('js-cm-toggle') && target.getAttribute('data-action')==='edit'){
              function cmEsc(v){ return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
              function toInput(name){
                var td=tr.querySelector('[data-col="'+name+'"]'); if(!td) return;
                var current=(td.getAttribute('data-orig') || (td.textContent||'')).trim();
                td.removeAttribute('data-dup-hidden');
                // IP 계열은 textarea, 방향은 select, 나머지는 input
                if(name==='real_ip' || name==='l4_ip' || name==='nat_ip' || name==='vpn_ip_self' || name==='vpn_ip_org' || name==='nw_ip_org'){
                  td.innerHTML = '<textarea rows="2">'+cmEsc(current==='-'?'':current)+'</textarea>';
                  return;
                }
                if(name==='direction'){
                  var dv = (current==='-'?'':current);
                  var opt = '<option value=""'+(dv?'':' selected')+' disabled>선택</option>'+
                            '<option value="<"'+(dv==='<'?' selected':'')+'><</option>'+
                            '<option value=">"'+(dv==='>'?' selected':'')+'>></option>';
                  td.innerHTML = '<select>'+opt+'</select>';
                  return;
                }
                td.innerHTML = '<input type="text" value="'+cmEsc(current==='-'?'':current)+'" placeholder="">';
              }
              ['self_division','line','work_name','real_ip','l4_ip','nat_ip','port_self','vpn_ip_self','direction','vpn_ip_org','nw_ip_org','port_org'].forEach(toInput);
              var toggleBtn = tr.querySelector('.js-cm-toggle'); if(toggleBtn){ toggleBtn.setAttribute('data-action','save'); toggleBtn.title='저장'; toggleBtn.setAttribute('aria-label','저장'); toggleBtn.innerHTML='<img src="/static/image/svg/save.svg" alt="저장" class="action-icon">'; }
              return;
            }
            if(target.classList.contains('js-cm-toggle') && target.getAttribute('data-action')==='save'){
              function getInput(name){ var td=tr.querySelector('[data-col="'+name+'"]'); return td? td.querySelector('input, select, textarea'): null; }
              function cmEsc(v){ return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
              function nl2br(v){ return cmEsc(v).replace(/\r?\n/g,'<br>'); }
              function commit(name,val){
                var td=tr.querySelector('[data-col="'+name+'"]'); if(!td) return;
                var text=(val===''||val==null)? '-' : String(val);
                td.setAttribute('data-orig', text);
                // IP 계열은 줄바꿈 보존 렌더링
                if(name==='real_ip' || name==='l4_ip' || name==='nat_ip' || name==='vpn_ip_self' || name==='vpn_ip_org' || name==='nw_ip_org'){
                  td.innerHTML = text==='-'? '-' : nl2br(text);
                } else {
                  td.textContent = text;
                }
              }
              function read(name){ var el=getInput(name); var v=(el? el.value : (tr.querySelector('[data-col="'+name+'"]').textContent||'')); return String(v).trim(); }
              ['self_division','line','work_name','real_ip','l4_ip','nat_ip','port_self','vpn_ip_self','direction','vpn_ip_org','nw_ip_org','port_org'].forEach(function(n){ commit(n, read(n)); });
              var toggleBtn = tr.querySelector('.js-cm-toggle'); if(toggleBtn){ toggleBtn.setAttribute('data-action','edit'); toggleBtn.title='편집'; toggleBtn.setAttribute('aria-label','편집'); toggleBtn.innerHTML='<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon">'; }
              updateEmptyState(); try{ cmSuppressDuplicates(); }catch(_){ }
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

  
        }

        async function apiRequestJson(url, opts){
          var options = Object.assign({ method:'GET', credentials:'same-origin' }, opts || {});
          options.headers = Object.assign({ 'Accept':'application/json' }, options.headers || {});
          if(options.body && !(options.headers && options.headers['Content-Type'])){
            options.headers['Content-Type'] = 'application/json';
          }
          var res = await fetch(url, options);
          var contentType = '';
          try{ contentType = String(res.headers.get('content-type') || ''); }catch(_){ contentType = ''; }
          var text = await res.text();
          var looksLikeHtml = /text\/html/i.test(contentType) || /^\s*<!doctype\s+html/i.test(text) || /^\s*<html\b/i.test(text);
          var redirectedToLogin = !!(res && res.redirected && res.url && /\/login\b/i.test(String(res.url)));
          if(redirectedToLogin){
            throw new Error('로그인이 필요합니다. 새로고침 후 다시 로그인하세요.');
          }
          if(looksLikeHtml){
            throw new Error('API 응답이 JSON이 아닙니다. (status ' + res.status + ')');
          }
          var json;
          try{ json = text ? JSON.parse(text) : {}; }catch(_){ json = { success:false, message:text || 'Invalid JSON' }; }
          if(!res.ok){
            var msg = (json && (json.message || json.error)) || ('HTTP ' + res.status);
            throw new Error(msg);
          }
          return json;
        }

        var tkRemoteState = { lineId: getLineIdFromQuery(), currentUserId: null };

        async function ensureActorUserId(){
          if(tkRemoteState.currentUserId) return tkRemoteState.currentUserId;
          try{
            var me = await apiRequestJson(tkApi.sessionMe, { method:'GET' });
            var id = _coerceInt(me && me.user && me.user.id);
            if(id && id > 0){ tkRemoteState.currentUserId = id; return id; }
          }catch(_e){}
          return null;
        }

        function clearTbody(){
          try{ tbody.innerHTML = ''; }catch(_){ while(tbody.firstChild) tbody.removeChild(tbody.firstChild); }
        }

        function renderTaskRow(item){
          var tr = document.createElement('tr');
          var id = item && item.id;
          if(id!=null) tr.setAttribute('data-task-id', String(id));
          function v(key){
            var raw = (item && item[key] != null) ? String(item[key]) : '';
            var t = raw.trim();
            return t ? t : '-';
          }
          tr.innerHTML = ''+
            '<td><input type="checkbox" class="tk-row-check" aria-label="행 선택"></td>'+
            '<td data-col="status">'+tkEscapeHtml(v('status'))+'</td>'+
            '<td data-col="task_no">'+tkEscapeHtml(v('task_no'))+'</td>'+
            '<td data-col="name">'+tkEscapeHtml(v('name'))+'</td>'+
            '<td data-col="type">'+tkEscapeHtml(v('type'))+'</td>'+
            '<td data-col="category">'+tkEscapeHtml(v('category'))+'</td>'+
            '<td data-col="start">'+tkEscapeHtml(v('start'))+'</td>'+
            '<td data-col="end">'+tkEscapeHtml(v('end'))+'</td>'+
            '<td class="system-actions table-actions">'+
              '<button class="action-btn js-tk-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button>'+
              '<button class="action-btn danger js-tk-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'+
            '</td>';
          return tr;
        }

        async function loadTasksFromServer(){
          if(!tkRemoteState.lineId){
            clearTbody();
            updateEmptyState();
            return;
          }
          try{
            var res = await apiRequestJson(tkApi.tasks(tkRemoteState.lineId), { method:'GET' });
            if(!res || !res.success) throw new Error((res && res.message) || '작업이력 조회 실패');
            var items = Array.isArray(res.items) ? res.items : [];
            clearTbody();
            items.forEach(function(it){ tbody.appendChild(renderTaskRow(it)); });
            updateEmptyState();
          }catch(e){
            clearTbody();
            updateEmptyState();
            try{ console.error('[dedicatedline:task] load failed', e); }catch(_){ }
          }
        }

        function tkSetRowEditing(tr, isEditing){
          if(!tr) return;
          var cb = tr.querySelector('.tk-row-check');
          var delBtn = tr.querySelector('.js-tk-del');
          if(isEditing){
            tr.setAttribute('data-tk-editing','1');
            if(cb) cb.disabled = true;
            if(delBtn) delBtn.hidden = true;
            tr.classList.remove('selected');
            return;
          }
          tr.removeAttribute('data-tk-editing');
          if(cb) cb.disabled = false;
          if(delBtn) delBtn.hidden = false;
          if(cb){
            var hidden = tr.hasAttribute('data-hidden') || tr.style.display==='none';
            tr.classList.toggle('selected', !!cb.checked && !hidden);
          }
        }

        // CSV helpers (selection-aware, saved-only)
        function tkEscapeCSV(val){ return '"' + String(val).replace(/"/g,'""') + '"'; }
        function tkRowSaved(tr){ var t=tr.querySelector('.js-tk-toggle'); var inEdit=t && t.getAttribute('data-action')==='save'; if(inEdit) return false; return !tr.querySelector('td[data-col] input, td[data-col] select, td[data-col] textarea'); }
        function tkVisibleRows(){ var tbody=table.querySelector('tbody'); if(!tbody) return []; return Array.from(tbody.querySelectorAll('tr')).filter(function(tr){ return !(tr.hasAttribute('data-hidden') || tr.style.display==='none'); }); }
        function tkSavedVisibleRows(){ return tkVisibleRows().filter(tkRowSaved); }
        function tkExportCSV(onlySelected){
          var tbody = table.querySelector('tbody'); if(!tbody) return;
          var headers = ['상태','작업 번호','작업 이름','작업 유형','작업 구분','시작일시','종료일시'];
          var trs = tkSavedVisibleRows();
          if(onlySelected){ trs = trs.filter(function(tr){ var cb = tr.querySelector('.tk-row-check'); return cb && cb.checked; }); }
          if(trs.length===0) return;
          var rows = trs.map(function(tr){
            function text(col){ var td=tr.querySelector('[data-col="'+col+'"]'); return td? (td.textContent||'').trim() : ''; }
            return ['status','task_no','name','type','category','start','end'].map(function(c){ return text(c); });
          });
          var lines = [headers].concat(rows).map(function(arr){ return arr.map(tkEscapeCSV).join(','); });
          var csv = '\uFEFF' + lines.join('\r\n');
          var d=new Date(); var yyyy=d.getFullYear(); var mm=String(d.getMonth()+1).padStart(2,'0'); var dd=String(d.getDate()).padStart(2,'0');
          var filename = 'tasks_'+yyyy+mm+dd+'.csv';
          try{ var blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); var url=URL.createObjectURL(blob); var a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); }
          catch(_){ var a2=document.createElement('a'); a2.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a2.download=filename; document.body.appendChild(a2); a2.click(); document.body.removeChild(a2); }
        }
        // Pagination state and helpers
        var tkState = { page:1, pageSize:10 };
        (function initPageSize(){
          try{
            var saved = localStorage.getItem('onpremise:tk:pageSize');
            var sel = document.getElementById('tk-page-size');
            if(sel){
              if(saved && ['10','20','50','100'].indexOf(saved)>-1){ tkState.pageSize=parseInt(saved,10); sel.value=saved; }
              sel.addEventListener('change', function(){ var v=parseInt(sel.value,10); if(!isNaN(v)){ tkState.page=1; tkState.pageSize=v; localStorage.setItem('onpremise:tk:pageSize', String(v)); tkRenderPage(); } });
            }
          }catch(_){ }
        })();
        var infoEl = document.getElementById('tk-pagination-info');
        var numWrap = document.getElementById('tk-page-numbers');
        var btnFirst = document.getElementById('tk-first');
        var btnPrev = document.getElementById('tk-prev');
        var btnNext = document.getElementById('tk-next');
        var btnLast = document.getElementById('tk-last');
        function tkRows(){ var tbody = table.querySelector('tbody'); return tbody? Array.from(tbody.querySelectorAll('tr')) : []; }
        function tkTotal(){ return tkRows().length; }
        function tkPages(){ var total=tkTotal(); return Math.max(1, Math.ceil(total / tkState.pageSize)); }
        function tkClampPage(){ var pages=tkPages(); if(tkState.page>pages) tkState.page=pages; if(tkState.page<1) tkState.page=1; }
        function tkRenderPage(){
          tkClampPage();
          var rows=tkRows();
          var startIdx=(tkState.page-1)*tkState.pageSize;
          var endIdx=startIdx+tkState.pageSize-1;
          rows.forEach(function(tr,idx){
            var visible = idx>=startIdx && idx<=endIdx;
            tr.style.display = visible? '' : 'none';
            if(visible){ tr.removeAttribute('data-hidden'); } else { tr.setAttribute('data-hidden','1'); }
            var cb = tr.querySelector('.tk-row-check'); if(cb){ tr.classList.toggle('selected', !!cb.checked && visible); }
          });
          tkUpdatePaginationUI();
          var selectAll = document.getElementById('tk-select-all');
          if(selectAll){
            var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .tk-row-check');
            if(visChecks.length){ selectAll.checked = Array.prototype.every.call(visChecks, function(cb){ return cb.checked; }); }
            else { selectAll.checked = false; }
          }
        }
        function tkUpdatePaginationUI(){
          if(infoEl){ var total=tkTotal(); var start = total? (tkState.page-1)*tkState.pageSize + 1 : 0; var end=Math.min(total, tkState.page*tkState.pageSize); infoEl.textContent = start + '-' + end + ' / ' + total + '개 항목'; }
          if(numWrap){ var pages=tkPages(); numWrap.innerHTML=''; for(var p=1;p<=pages && p<=50;p++){ var b=document.createElement('button'); b.className='page-btn'+(p===tkState.page?' active':''); b.textContent=String(p); b.dataset.page=String(p); numWrap.appendChild(b); } }
          var pages2=tkPages(); if(btnFirst) btnFirst.disabled=(tkState.page===1); if(btnPrev) btnPrev.disabled=(tkState.page===1); if(btnNext) btnNext.disabled=(tkState.page===pages2); if(btnLast) btnLast.disabled=(tkState.page===pages2);
          var sizeSel=document.getElementById('tk-page-size'); if(sizeSel){ var none=(tkTotal()===0); sizeSel.disabled=none; if(none){ try{ sizeSel.value='10'; tkState.pageSize=10; }catch(_){ } } }
        }
        function tkGo(p){ tkState.page=p; tkRenderPage(); }
        function tkGoDelta(d){ tkGo(tkState.page + d); }
        function tkGoFirst(){ tkGo(1); }
        function tkGoLast(){ tkGo(tkPages()); }
        if(numWrap){ numWrap.addEventListener('click', function(e){ var b=e.target.closest('button.page-btn'); if(!b) return; var p=parseInt(b.dataset.page,10); if(!isNaN(p)) tkGo(p); }); }
        if(btnFirst) btnFirst.addEventListener('click', tkGoFirst);
        if(btnPrev) btnPrev.addEventListener('click', function(){ tkGoDelta(-1); });
        if(btnNext) btnNext.addEventListener('click', function(){ tkGoDelta(1); });
        if(btnLast) btnLast.addEventListener('click', tkGoLast);
        function updateEmptyState(){
          try{ var hasRows = table.querySelector('tbody tr') != null; if(empty){ empty.hidden = !!hasRows; empty.style.display = hasRows ? 'none' : ''; } }
          catch(_){ if(empty){ empty.hidden=false; empty.style.display=''; } }
          var csvBtn = document.getElementById('tk-download-btn');
          if(csvBtn){ var has = !!table.querySelector('tbody tr'); csvBtn.disabled = !has; csvBtn.setAttribute('aria-disabled', (!has).toString()); csvBtn.title = has? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.'; }
          tkRenderPage();
        }
        updateEmptyState();
  
        // CSV modal wiring
        (function(){
          var btn = document.getElementById('tk-download-btn');
          var modalId = 'tk-download-modal';
          var closeBtn = document.getElementById('tk-download-close');
          var confirmBtn = document.getElementById('tk-download-confirm');
          function openModalLocal(id){ var el=document.getElementById(id); if(!el) return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden','false'); }
          function closeModalLocal(id){ var el=document.getElementById(id); if(!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } }
    if(btn){ btn.addEventListener('click', function(){ if(btn.disabled) return; var saved=tkSavedVisibleRows(); var total=saved.length; if(total<=0) return; var selectedCount = saved.filter(function(tr){ var cb=tr.querySelector('.tk-row-check'); return cb && cb.checked; }).length; var subtitle = document.getElementById('tk-download-subtitle'); if(subtitle){ subtitle.textContent = selectedCount>0 ? ('선택된 '+selectedCount+'개 또는 전체 '+total+'개 결과 중 범위를 선택하세요.') : ('현재 결과 '+total+'개 항목을 CSV로 내보냅니다.'); } var rowSelectedWrap=document.getElementById('tk-csv-range-row-selected'); var optSelected=document.getElementById('tk-csv-range-selected'); var optAll=document.getElementById('tk-csv-range-all'); if(rowSelectedWrap) rowSelectedWrap.hidden = !(selectedCount>0); if(optSelected){ optSelected.disabled = !(selectedCount>0); optSelected.checked = selectedCount>0; } if(optAll){ optAll.checked = !(selectedCount>0); } openModalLocal(modalId); }); }
          if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalLocal(modalId); }); }
          var modalEl = document.getElementById(modalId);
          if(modalEl){ modalEl.addEventListener('click', function(e){ if(e.target===modalEl) closeModalLocal(modalId); }); document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(modalId); }); }
          if(confirmBtn){ confirmBtn.addEventListener('click', function(){ var onlySel = !!(document.getElementById('tk-csv-range-selected') && document.getElementById('tk-csv-range-selected').checked); tkExportCSV(onlySel); closeModalLocal(modalId); }); }
        })();
  
        // Select all (visible rows only)
        var selectAll = document.getElementById('tk-select-all');
        if(selectAll){
          selectAll.addEventListener('change', function(){
            var checks = table.querySelectorAll('.tk-row-check:not([disabled])');
            checks.forEach(function(c){
              var tr = c.closest('tr');
              var isHidden = tr && (tr.hasAttribute('data-hidden') || tr.style.display==='none');
              if(!isHidden){ c.checked = !!selectAll.checked; }
              if(tr){ tr.classList.toggle('selected', !!c.checked && !isHidden); }
            });
          });
        }
  
        // Add row
        var addBtn = document.getElementById('tk-row-add');
        if(addBtn){
          addBtn.addEventListener('click', function(){
            if(!tkRemoteState.lineId){
              alert('상세 ID가 없습니다. 목록에서 다시 진입하세요.');
              return;
            }
            var tr = document.createElement('tr');
            tr.innerHTML = `
              <td><input type="checkbox" class="tk-row-check" aria-label="행 선택"></td>
              <td data-col="status">
                <select>
                  <option value="" selected disabled>선택</option>
                  <option value="검토">검토</option>
                  <option value="승인">승인</option>
                  <option value="예정">예정</option>
                  <option value="진행">진행</option>
                  <option value="완료">완료</option>
                </select>
              </td>
              <td data-col="task_no"><input type="text" placeholder="작업 번호"></td>
              <td data-col="name"><input type="text" placeholder="작업 이름 (필수)"></td>
              <td data-col="type">
                <select>
                  <option value="" selected disabled>선택</option>
                  <option value="서버">서버</option>
                  <option value="스토리지">스토리지</option>
                  <option value="SAN">SAN</option>
                  <option value="네트워크">네트워크</option>
                  <option value="보안장비">보안장비</option>
                  <option value="운영체제">운영체제</option>
                  <option value="데이터베이스">데이터베이스</option>
                  <option value="미들웨어">미들웨어</option>
                  <option value="가상화">가상화</option>
                  <option value="보안S/W">보안S/W</option>
                  <option value="고가용성">고가용성</option>
                </select>
              </td>
              <td data-col="category">
                <select>
                  <option value="" selected disabled>선택</option>
                  <option value="테스트">테스트</option>
                  <option value="개선">개선</option>
                  <option value="장애대응">장애대응</option>
                  <option value="변경">변경</option>
                  <option value="점검">점검</option>
                </select>
              </td>
              <td data-col="start"><input type="text" class="datetime-input" placeholder="YYYY-MM-DD HH:MM"></td>
              <td data-col="end"><input type="text" class="datetime-input" placeholder="YYYY-MM-DD HH:MM"></td>
              <td class="system-actions table-actions">
                <button class="action-btn js-tk-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button>
                <button class="action-btn danger js-tk-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>
              </td>`;
            tbody.appendChild(tr);
            tkSetRowEditing(tr, true);
            tkGoLast();
            updateEmptyState();
            try{ if(window.__blsInitDatePickers) window.__blsInitDatePickers(tr); }catch(_){ }
          });
        }
  
        function initDateTimePickers(root){
          try{
            var inputs = root.querySelectorAll('input.datetime-input');
            if(inputs.length===0) return;
            if(window.__blsInitDatePickers){ window.__blsInitDatePickers(root); }
            if(window.flatpickr){ inputs.forEach(function(el){ if(el._flatpickr){ try{ el._flatpickr.destroy(); }catch(_){ } } window.flatpickr(el, { enableTime:true, time_24hr:true, dateFormat:'Y-m-d H:i', allowInput:true, locale:(window.flatpickr.l10ns&&window.flatpickr.l10ns.ko)?window.flatpickr.l10ns.ko:'ko' }); }); }
          }catch(_){ }
        }
  
        // Delegate clicks: row toggle select, detail actions, edit/save/delete
        table.addEventListener('click', function(ev){
          // Row click selection toggle (ignore control elements)
          (function(){
            var tr = ev.target.closest('tr');
            if(!tr || !tr.parentNode || tr.parentNode.tagName.toLowerCase()!=='tbody') return;
            var isControl = ev.target.closest('button, a, input, select, textarea, label');
            var onCheckbox = ev.target.closest('input[type="checkbox"].tk-row-check');
            if(isControl && !onCheckbox) return;
            if(onCheckbox) return;
            var cb = tr.querySelector('.tk-row-check'); if(!cb) return;
            var hidden = tr.hasAttribute('data-hidden') || tr.style.display==='none'; if(hidden) return;
            cb.checked = !cb.checked; tr.classList.toggle('selected', cb.checked);
            var selectAll = document.getElementById('tk-select-all'); if(selectAll){ var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .tk-row-check'); if(visChecks.length){ selectAll.checked = Array.prototype.every.call(visChecks, function(c){ return c.checked; }); } else { selectAll.checked = false; } }
          })();
  
          var target = ev.target.closest('.js-tk-del, .js-tk-edit, .js-tk-commit, .js-tk-toggle'); if(!target) return;
          var tr = ev.target.closest('tr'); if(!tr) return;
  
          // delete
          if(target.classList.contains('js-tk-del')){
            (async function(){
              var taskId = _coerceInt(tr.getAttribute('data-task-id'));
              if(!taskId){
                if(tr && tr.parentNode){ tr.parentNode.removeChild(tr); }
                tkClampPage();
                updateEmptyState();
                return;
              }
              try{
                if(!tkRemoteState.lineId){ alert('상세 ID가 없습니다.'); return; }
                var actorId = await ensureActorUserId();
                var delPayload = {};
                if(actorId) delPayload.actor_user_id = actorId;
                var res = await apiRequestJson(tkApi.taskItem(tkRemoteState.lineId, taskId), {
                  method:'DELETE',
                  body: JSON.stringify(delPayload)
                });
                if(!res || !res.success) throw new Error((res && res.message) || '삭제 실패');
                if(tr && tr.parentNode){ tr.parentNode.removeChild(tr); }
                tkClampPage();
                updateEmptyState();
              }catch(e){
                alert(e && e.message ? e.message : '삭제 중 오류가 발생했습니다.');
              }
            })();
            return;
          }
  
          // edit -> save
          if(
            target.classList.contains('js-tk-edit') ||
            (target.classList.contains('js-tk-toggle') && target.getAttribute('data-action') === 'edit')
          ){
            var allowedStatuses = ['검토','승인','예정','진행','완료'];
            function canonicalizeStatus(s){
              if(!s) return '';
              if(allowedStatuses.indexOf(s) > -1) return s;
              // legacy synonyms mapping
              if(s === '진행중') return '진행';
              if(s === '대기') return '예정';
              return '';
            }
            function toInput(name){
              var td = tr.querySelector('[data-col="'+name+'"]'); if(!td) return;
              var current = (td.textContent||'').trim();
              if(name==='status'){
                var sv = canonicalizeStatus(current === '-' ? '' : current);
                var sopts = ['<option value=""'+(sv?'':' selected')+' disabled>선택</option>']
                  .concat(allowedStatuses.map(function(v){ return '<option value="'+v+'"'+(sv===v?' selected':'')+'>'+v+'</option>'; }))
                  .join('');
                td.innerHTML = '<select>'+sopts+'</select>'; return;
              }
              if(name==='type'){
                var allowedTypes = ['서버','스토리지','SAN','네트워크','보안장비','운영체제','데이터베이스','미들웨어','가상화','보안S/W','고가용성'];
                var tv = (current==='-'? '' : current);
                var topts = ['<option value=""'+(allowedTypes.indexOf(tv)>-1?'':' selected')+' disabled>선택</option>']
                  .concat(allowedTypes.map(function(v){ return '<option value="'+v+'"'+(tv===v?' selected':'')+'>'+v+'</option>'; }))
                  .join('');
                td.innerHTML = '<select>'+topts+'</select>'; return;
              }
              if(name==='category'){
                var allowedCategories = ['테스트','개선','장애대응','변경','점검'];
                var cv = (current==='-'? '' : current);
                var copts = ['<option value=""'+(allowedCategories.indexOf(cv)>-1?'':' selected')+' disabled>선택</option>']
                  .concat(allowedCategories.map(function(v){ return '<option value="'+v+'"'+(cv===v?' selected':'')+'>'+v+'</option>'; }))
                  .join('');
                td.innerHTML = '<select>'+copts+'</select>'; return;
              }
              if(name==='start' || name==='end'){
                var v = (current==='-'? '' : current);
                td.innerHTML = '<input type="text" class="datetime-input" value="'+v+'" placeholder="YYYY-MM-DD HH:MM">'; return;
              }
              td.innerHTML = '<input type="text" value="'+current+'">';
            }
            ['status','task_no','name','type','category','start','end'].forEach(function(n){ toInput(n); });
            initDateTimePickers(tr);
            var toggleBtn = tr.querySelector('.js-tk-toggle');
            if(toggleBtn){ toggleBtn.setAttribute('data-action','save'); toggleBtn.title='저장'; toggleBtn.setAttribute('aria-label','저장'); toggleBtn.innerHTML='<img src="/static/image/svg/save.svg" alt="저장" class="action-icon">'; }
            else { var actions = tr.querySelector('.table-actions'); if(actions){ actions.classList.add('system-actions'); actions.innerHTML = '<button class="action-btn js-tk-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button> <button class="action-btn danger js-tk-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'; } }
            tkSetRowEditing(tr, true);
            return;
          }
  
          // save -> view
          if(
            target.classList.contains('js-tk-commit') ||
            (target.classList.contains('js-tk-toggle') && target.getAttribute('data-action') === 'save')
          ){
            function getInput(name){ var td = tr.querySelector('[data-col="'+name+'"]'); return td? td.querySelector('input, textarea, select'): null; }
            function setError(input, on){ if(!input) return; if(on){ input.classList.add('input-error'); input.setAttribute('aria-invalid','true'); } else { input.classList.remove('input-error'); input.removeAttribute('aria-invalid'); } }
            var allowedStatuses = ['검토','승인','예정','진행','완료'];
            var firstInvalid = null;
            var statusSel = getInput('status');
            var statusVal = (statusSel? statusSel.value : (tr.querySelector('[data-col="status"]').textContent||'')).trim();
            var statusValid = allowedStatuses.indexOf(statusVal) > -1;
            if(!statusValid){ setError(statusSel,true); if(!firstInvalid) firstInvalid=statusSel; } else { setError(statusSel,false); }
            // task_no is optional, just read as-is
            var taskNoInp = getInput('task_no');
            var nameInp = getInput('name'); var nameVal = (nameInp? nameInp.value : (tr.querySelector('[data-col="name"]').textContent||'')).trim(); if(!nameVal){ setError(nameInp,true); if(!firstInvalid) firstInvalid=nameInp; } else { setError(nameInp,false); }
            var allowedTypes = ['서버','스토리지','SAN','네트워크','보안장비','운영체제','데이터베이스','미들웨어','가상화','보안S/W','고가용성'];
            var typeInp = getInput('type');
            var typeVal = (typeInp? typeInp.value : (tr.querySelector('[data-col="type"]').textContent||'')).trim();
            var typeValid = allowedTypes.indexOf(typeVal) > -1;
            if(!typeValid){ setError(typeInp,true); if(!firstInvalid) firstInvalid=typeInp; } else { setError(typeInp,false); }
            var allowedCategories = ['테스트','개선','장애대응','변경','점검'];
            var catInp = getInput('category');
            var catVal = (catInp? catInp.value : (tr.querySelector('[data-col="category"]').textContent||'')).trim();
            var catValid = allowedCategories.indexOf(catVal) > -1;
            if(!catValid){ setError(catInp,true); if(!firstInvalid) firstInvalid=catInp; } else { setError(catInp,false); }
            var startInp = getInput('start'); var startVal = (startInp? startInp.value : (tr.querySelector('[data-col="start"]').textContent||'')).trim(); if(!startVal){ setError(startInp,true); if(!firstInvalid) firstInvalid=startInp; } else { setError(startInp,false); }
            if(firstInvalid){ try{ firstInvalid.focus(); }catch(_){ } return; }
  
            (async function(){
              try{
                if(!tkRemoteState.lineId){ alert('상세 ID가 없습니다.'); return; }
                var actorId = await ensureActorUserId();
                function readVal(name){
                  var el = getInput(name);
                  return String(el ? el.value : (tr.querySelector('[data-col="'+name+'"]').textContent||'')).trim();
                }
                var payload = {
                  status: statusVal,
                  task_no: (taskNoInp? String(taskNoInp.value||'').trim() : readVal('task_no')) || null,
                  name: nameVal,
                  type: typeVal,
                  category: catVal,
                  start: startVal,
                  end: readVal('end') || null
                };
                if(actorId) payload.actor_user_id = actorId;

                var taskId = _coerceInt(tr.getAttribute('data-task-id'));
                var res;
                if(taskId){
                  res = await apiRequestJson(tkApi.taskItem(tkRemoteState.lineId, taskId), { method:'PUT', body: JSON.stringify(payload) });
                } else {
                  res = await apiRequestJson(tkApi.tasks(tkRemoteState.lineId), { method:'POST', body: JSON.stringify(payload) });
                }
                if(!res || !res.success) throw new Error((res && res.message) || '저장 실패');
                var item = res.item || res;
                if(item && item.id!=null){ tr.setAttribute('data-task-id', String(item.id)); }

                function commit(name, val){ var td = tr.querySelector('[data-col="'+name+'"]'); if(!td) return; var v = String(val==null?'':val).trim(); td.textContent = v ? v : '-'; }
                commit('status', item && item.status);
                commit('task_no', item && item.task_no);
                commit('name', item && item.name);
                commit('type', item && item.type);
                commit('category', item && item.category);
                commit('start', item && item.start);
                commit('end', item && item.end);

                var toggleBtn = tr.querySelector('.js-tk-toggle');
                if(toggleBtn){ toggleBtn.setAttribute('data-action','edit'); toggleBtn.title='편집'; toggleBtn.setAttribute('aria-label','편집'); toggleBtn.innerHTML='<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon">'; }
                else { var actions = tr.querySelector('.table-actions'); if(actions){ actions.classList.add('system-actions'); actions.innerHTML = '<button class="action-btn js-tk-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button> <button class="action-btn danger js-tk-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'; } }
                tkSetRowEditing(tr, false);
                updateEmptyState();
              }catch(e){
                alert(e && e.message ? e.message : '저장 중 오류가 발생했습니다.');
              }
            })();
            return;
          }
        });
  
        // Per-row checkbox sync select-all and visual state
        table.addEventListener('change', function(ev){
          var cb = ev.target.closest('.tk-row-check'); if(!cb) return;
          var selectAll = document.getElementById('tk-select-all'); if(!selectAll) return;
          var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .tk-row-check');
          if(visChecks.length){ selectAll.checked = Array.prototype.every.call(visChecks, function(c){ return c.checked; }); } else { selectAll.checked = false; }
          var trr = cb.closest('tr'); if(trr){ var hidden = trr.hasAttribute('data-hidden') || trr.style.display==='none'; trr.classList.toggle('selected', !!cb.checked && !hidden); }
        });

        // Initial load from server
        try{ loadTasksFromServer(); }catch(_){ }
      })();
  
      // [Tabs moved to /static/js/_detail/tab*.js]

  
      // [Removed legacy Change Log implementation]
  
      }catch(_){ /* 안전 가드 */ }
    })();
  
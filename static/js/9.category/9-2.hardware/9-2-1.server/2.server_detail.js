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
    function __detailInit(){
      // Flatpickr (calendar) loader and initializer
      var FLATPICKR_CSS = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css';
      var FLATPICKR_THEME_NAME = 'airbnb';
      var FLATPICKR_THEME_HREF = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/themes/' + FLATPICKR_THEME_NAME + '.css';
      var FLATPICKR_JS = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.js';
      var FLATPICKR_KO = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/l10n/ko.js';
      function ensureCss(href, id){
        var existing = document.getElementById(id);
        if(existing && existing.tagName.toLowerCase() === 'link'){ if(existing.getAttribute('href') !== href){ existing.setAttribute('href', href); } return; }
        var l = document.createElement('link'); l.rel='stylesheet'; l.href = href; l.id = id; document.head.appendChild(l);
      }
      function loadScript(src){
        return new Promise(function(resolve, reject){
          var s = document.createElement('script'); s.src = src; s.async = true; s.onload = function(){ resolve(); }; s.onerror = function(){ reject(new Error('Script load failed: '+src)); }; document.head.appendChild(s);
        });
      }
      function ensureFlatpickr(){
        ensureCss(FLATPICKR_CSS, 'flatpickr-css');
        ensureCss(FLATPICKR_THEME_HREF, 'flatpickr-theme-css');
        if(window.flatpickr){ return Promise.resolve(); }
        return loadScript(FLATPICKR_JS).then(function(){ return loadScript(FLATPICKR_KO).catch(function(){}); });
      }
      function initDatePickers(formId){
        var form = document.getElementById(formId); if(!form) return;
        ensureFlatpickr().then(function(){
          var startEl = form.querySelector('[name="release_date"]');
          var endEl = form.querySelector('[name="eosl"]');
          function ensureTodayButton(fp){
            var cal = fp && fp.calendarContainer; if(!cal) return;
            if(cal.querySelector('.fp-today-btn')) return;
            var btn = document.createElement('button');
            btn.type = 'button'; btn.className = 'fp-today-btn'; btn.textContent = '오늘';
            btn.addEventListener('click', function(){ fp.setDate(new Date(), true); });
            cal.appendChild(btn);
          }
          var opts = {
            locale: (window.flatpickr && window.flatpickr.l10ns && window.flatpickr.l10ns.ko) ? window.flatpickr.l10ns.ko : 'ko',
            dateFormat: 'Y-m-d', allowInput: true, disableMobile: true,
            onReady: function(sd, ds, inst){ ensureTodayButton(inst); },
            onOpen: function(sd, ds, inst){ ensureTodayButton(inst); }
          };
          if(startEl && !startEl._flatpickr){ window.flatpickr(startEl, opts); }
          if(endEl && !endEl._flatpickr){ window.flatpickr(endEl, opts); }
        }).catch(function(){});
      }
      // Helper: render an animated no-data image (Lottie JSON preferred) into a container (MEMORY style)
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
      // Helper: reflect computed total count into the OS quantity field
      function setOsQuantity(n){
        try{ var el = document.getElementById('os-qty'); if(el && typeof n==='number' && isFinite(n) && n>=0){ el.textContent = String(n); } }catch(_){ }
      }
      // Helper: sync page header from OS section fields
      function syncHeaderFromOs(){
        try{
          var modelEl = document.getElementById('os-model');
          var vendorEl = document.getElementById('os-vendor');
          var titleEl = document.getElementById('page-header-title');
          var subEl = document.getElementById('page-header-subtitle');
          if(titleEl && modelEl){ var t=(modelEl.textContent||'').trim(); if(t) titleEl.textContent=t; }
          if(subEl && vendorEl){ var s=(vendorEl.textContent||'').trim(); if(s) subEl.textContent=s; }
        }catch(_){ }
      }

      // Helper: ensure all tabs keep the same header using URL params (preferred) or sessionStorage fallback
      function syncHeaderFromQueryOrSession(){
        try{
          var titleEl = document.getElementById('page-header-title');
          var subEl = document.getElementById('page-header-subtitle');
          if(!titleEl || !subEl) return;

          var model = '';
          var vendor = '';

          try{
            var qs = new URLSearchParams(window.location.search || '');
            model = (qs.get('model') || '').trim();
            vendor = (qs.get('vendor') || '').trim();
          }catch(_q){ }

          if(!model || !vendor){
            try{
              var raw = sessionStorage.getItem('server_selected_row');
              if(raw){
                var row = JSON.parse(raw);
                if(!model) model = (row && row.model ? String(row.model) : '').trim();
                if(!vendor) vendor = (row && row.vendor ? String(row.vendor) : '').trim();
              }
            }catch(_s){ }
          }

          if(model) titleEl.textContent = model;
          if(vendor) subEl.textContent = vendor;
        }catch(_){ }
      }
      // Populate new OS fields from existing basic info values (backward compatible)
      (function hydrateOsSection(){
        try{
          // 1) Prefer querystring params (supports refresh/deep link)
          try{
            var qs = new URLSearchParams(window.location.search || '');
            function q(name){ return (qs.get(name) || '').trim(); }
            var qModel = q('model');
            var qVendor = q('vendor');
            var qType = q('hw_type');
            var qRelease = q('release_date');
            var qEosl = q('eosl');
            var qQty = q('qty');
            var qNote = q('note');

            function setIf(id, val){ var el=document.getElementById(id); if(!el) return; var v=(val||'').trim(); if(v){ el.textContent = v; } }
            setIf('os-model', qModel);
            setIf('os-vendor', qVendor);
            setIf('os-type', qType);
            setIf('os-release-date', qRelease);
            setIf('os-eosl', qEosl);
            setIf('os-qty', qQty);
            setIf('os-note', qNote);
          }catch(_q){ }

          function setIf(id, val){ var el=document.getElementById(id); if(!el) return; var v=(val||'').trim(); if(v){ el.textContent = v; } }
          // Prefer existing basic-info ids if available
          var vendor = (document.getElementById('bi-sw_vendor')||{}).textContent || '';
          var name = (document.getElementById('bi-sw_name')||{}).textContent || '';
          var type = (document.getElementById('bi-sw_type')||{}).textContent || '';
          setIf('os-model', name);
          setIf('os-vendor', vendor);
          setIf('os-type', type);
        }catch(_){ }
      })();
      // Ensure header reflects current OS model/vendor on load
      try{ syncHeaderFromOs(); }catch(_){ }
      try{ syncHeaderFromQueryOrSession(); }catch(_){ }
      // Render 상태 통계 + 업무 그룹 통계 from Hardware API (model-assets)
      (function renderHwBasicStats(){
        try{
          var container = document.querySelector('.server-detail-content');
          var serverCode = container ? (container.getAttribute('data-server-code') || '') : '';
          var emptyPie = document.getElementById('stat-empty');
          var pie = document.getElementById('stat-pie');
          var legendPie = document.getElementById('stat-legend');
          var groupPie = document.getElementById('group-pie');
          var groupLegend = document.getElementById('group-legend');
          var emptyGroup = document.getElementById('group-empty');
          var emptyVer = document.getElementById('ver-empty');
          var verDonut = document.getElementById('ver-donut');
          var verLegend = document.getElementById('ver-legend');
          function showPieEmpty(msg){
            if(emptyPie){ emptyPie.style.display=''; try{ showNoDataImage(emptyPie, msg); }catch(_){} }
            if(pie){ pie.style.visibility='hidden'; pie.style.display='none'; }
            if(legendPie) legendPie.style.display='none';
          }
          function showGroupEmpty(msg){
            if(emptyGroup){ emptyGroup.style.display=''; try{ if(typeof showNoDataImage==='function') showNoDataImage(emptyGroup, msg); }catch(_){} }
            if(groupPie) groupPie.style.display='none';
            if(groupLegend) groupLegend.style.display='none';
          }
          function showVerEmpty(){
            if(emptyVer){ emptyVer.style.display=''; try{ showNoDataImage(emptyVer, '할당 하드웨어 자산의\n소프트웨어 버전 정보가 없습니다.'); }catch(_){} }
            if(verDonut) verDonut.style.display='none';
            if(verLegend) verLegend.style.display='none';
          }
          showVerEmpty();
          if(!serverCode){
            showPieEmpty('할당 하드웨어 자산이 없습니다.');
            showGroupEmpty('할당 하드웨어 자산이 없습니다.');
            return;
          }
          fetch('/api/hardware/model-assets?server_code=' + encodeURIComponent(serverCode))
            .then(function(res){ return res.json(); })
            .then(function(data){
              if(!data.success || !data.items || !data.items.length){
                showPieEmpty('할당 하드웨어 자산이 없습니다.');
                showGroupEmpty('할당 하드웨어 자산이 없습니다.');
                return;
              }
              var items = data.items;
              // -- 상태 통계 pie chart (dynamic) --
              var statusMap = {};
              var statusColorMap = {};
              items.forEach(function(it){
                var s = (it.work_status || '').trim() || '-';
                statusMap[s] = (statusMap[s]||0) + 1;
                if(it.work_status_color && !statusColorMap[s]) statusColorMap[s] = it.work_status_color;
              });
              var stOrder = ['가동','유휴','대기'];
              var stDefaultColors = {'가동':'#6366f1','유휴':'#0ea5e9','대기':'#94a3b8'};
              var stFallback = ['#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6'];
              var stEntries = [], stFcIdx = 0;
              stOrder.forEach(function(name){ if(statusMap[name]) stEntries.push({label:name, count:statusMap[name]}); });
              Object.keys(statusMap).forEach(function(k){ if(stOrder.indexOf(k)===-1) stEntries.push({label:k, count:statusMap[k]}); });
              var stTotal = stEntries.reduce(function(s,e){ return s+e.count; }, 0);
              if(!stTotal){
                showPieEmpty('할당 하드웨어 자산이 없습니다.');
              } else {
                if(emptyPie) emptyPie.style.display='none';
                if(pie){ pie.style.visibility=''; pie.style.display='block'; pie.style.width='220px'; pie.style.height='220px'; pie.style.borderRadius='50%'; }
                if(legendPie) legendPie.style.display='';
                var stGrad = [], stSegs = [], stDeg = 0;
                stEntries.forEach(function(e, idx){
                  var deg = Math.round((e.count / stTotal) * 360);
                  if(idx === stEntries.length - 1) deg = 360 - stDeg;
                  var c = statusColorMap[e.label] || stDefaultColors[e.label] || stFallback[stFcIdx++ % stFallback.length];
                  stGrad.push(c + ' ' + stDeg + 'deg ' + (stDeg + deg) + 'deg');
                  stSegs.push({ label: e.label, count: e.count, color: c, start: stDeg, end: stDeg + deg });
                  stDeg += deg;
                });
                if(pie){
                  pie.style.background = 'conic-gradient(' + stGrad.join(', ') + ')';
                  attachPieInteractions(pie, stSegs, stTotal);
                }
                if(legendPie){
                  legendPie.innerHTML = '';
                  stEntries.forEach(function(e){
                    var pctV = Math.round((e.count * 100) / stTotal);
                    var c = statusColorMap[e.label] || stDefaultColors[e.label] || '#94a3b8';
                    var li = document.createElement('li'); li.className = 'legend-item';
                    var dot = document.createElement('span'); dot.className = 'legend-dot'; dot.style.background = c;
                    var host = document.createElement('span'); host.className = 'legend-host'; host.textContent = e.label;
                    var size = document.createElement('span'); size.className = 'legend-size'; size.textContent = e.count + ' (' + pctV + '%)';
                    li.appendChild(dot); li.appendChild(host); li.appendChild(size);
                    legendPie.appendChild(li);
                  });
                }
              }
              // -- 운영 통계 pie chart (work_operation) --
              var opMap = {};
              items.forEach(function(it){ var o = (it.work_operation || '').trim() || '-'; opMap[o] = (opMap[o]||0)+1; });
              var opOrder = ['운영','개발','테스트','DR'];
              var opColorMap = {'운영':'#6366f1','개발':'#0ea5e9','테스트':'#10b981','DR':'#f59e0b'};
              var opEntries = [];
              opOrder.forEach(function(name){ if(opMap[name]) opEntries.push({label:name, count:opMap[name]}); });
              Object.keys(opMap).forEach(function(k){ if(opOrder.indexOf(k)===-1) opEntries.push({label:k, count:opMap[k]}); });
              var gTotal = opEntries.reduce(function(s,e){ return s+e.count; }, 0);
              if(!gTotal){ showGroupEmpty('할당 하드웨어 자산이 없습니다.'); return; }
              if(emptyGroup) emptyGroup.style.display='none';
              var fallbackColors = ['#ef4444','#94a3b8','#8b5cf6','#ec4899'];
              var gradParts = [], segData = [], degCur = 0, fcIdx = 0;
              opEntries.forEach(function(e, idx){
                var deg = Math.round((e.count / gTotal) * 360);
                if(idx === opEntries.length - 1) deg = 360 - degCur;
                var c = opColorMap[e.label] || fallbackColors[fcIdx++ % fallbackColors.length];
                gradParts.push(c + ' ' + degCur + 'deg ' + (degCur + deg) + 'deg');
                segData.push({ label: e.label, count: e.count, color: c, start: degCur, end: degCur + deg });
                degCur += deg;
              });
              if(groupPie){
                groupPie.style.display = 'block'; groupPie.style.width='220px'; groupPie.style.height='220px'; groupPie.style.borderRadius='50%';
                groupPie.style.background = 'conic-gradient(' + gradParts.join(', ') + ')';
                attachPieInteractions(groupPie, segData, gTotal);
              }
              // Build legend
              if(groupLegend){
                groupLegend.style.display = '';
                groupLegend.innerHTML = '';
                opEntries.forEach(function(e){
                  var pctG = Math.round((e.count * 100) / gTotal);
                  var li = document.createElement('li'); li.className = 'legend-item';
                  var dot = document.createElement('span'); dot.className = 'legend-dot'; dot.style.background = opColorMap[e.label] || '#94a3b8';
                  var host = document.createElement('span'); host.className = 'legend-host'; host.textContent = e.label;
                  var size = document.createElement('span'); size.className = 'legend-size'; size.textContent = e.count + ' (' + pctG + '%)';
                  li.appendChild(dot); li.appendChild(host); li.appendChild(size);
                  groupLegend.appendChild(li);
                });
              }
            })
            .catch(function(){
              showPieEmpty('하드웨어 자산 조회 중 오류가 발생했습니다.');
              showGroupEmpty('하드웨어 자산 조회 중 오류가 발생했습니다.');
            });
        }catch(_){}
      })();

      // Shared: attach interactions to a conic-gradient pie/donut element.
      function attachPieInteractions(el, segments, total, hasHole){
        try{
          if(!el || !segments || !segments.length) return;
          var tip = document.querySelector('.chart-tooltip');
          if(!tip){ tip = document.createElement('div'); tip.className = 'chart-tooltip'; document.body.appendChild(tip); }
          function showTip(x, y, seg){
            if(!seg){ tip.classList.remove('show'); return; }
            var pct = total ? Math.round((seg.count*100)/total) : 0;
            tip.innerHTML = '<span class="tip-dot" style="background:'+seg.color+'"></span>'
              + '<strong>'+seg.label+'</strong>'
              + ' · '+seg.count+' ('+pct+'%)';
            tip.style.left = x+'px';
            tip.style.top = y+'px';
            tip.classList.add('show');
          }
          function hideTip(){ tip.classList.remove('show'); }
          function getAngleFromCenter(evt){
            var rect = el.getBoundingClientRect();
            var cx = rect.left + rect.width/2; var cy = rect.top + rect.height/2;
            var dx = evt.clientX - cx; var dy = evt.clientY - cy;
            var r = Math.sqrt(dx*dx + dy*dy);
            var outerR = rect.width/2; // circle is square
            if(r>outerR) return {outside:true, angle:0, r:r, inner:false};
            var inner = false;
            if(hasHole){ var holeR = outerR * 0.44; inner = (r < holeR); }
            var ang = Math.atan2(dy, dx) * 180/Math.PI; // -180..180, 0 at +x
            var deg = (ang + 360) % 360; // normalize 0..359.999
            // Our conic starts at 0deg on the right and grows CW; this deg matches CSS
            return {outside:false, angle:deg, r:r, inner:inner};
          }
          function findSegmentAtAngle(deg){
            for(var i=0;i<segments.length;i++){
              var s=segments[i];
              var start = s.start; var end = s.end;
              if(deg>=start && deg<=end){ return s; }
            }
            return null;
          }
          var fixedSeg = null; // segment locked by click
          el.addEventListener('mousemove', function(evt){
            var g = getAngleFromCenter(evt);
            if(g.outside || g.inner){ if(!fixedSeg) hideTip(); return; }
            var seg = fixedSeg || findSegmentAtAngle(g.angle);
            if(!seg){ if(!fixedSeg) hideTip(); return; }
            showTip(evt.clientX, evt.clientY, seg);
          });
          el.addEventListener('mouseleave', function(){ if(!fixedSeg) hideTip(); });
          el.addEventListener('click', function(evt){
            var g = getAngleFromCenter(evt);
            if(g.outside || g.inner){ fixedSeg=null; hideTip(); return; }
            var seg = findSegmentAtAngle(g.angle);
            fixedSeg = seg || null;
            if(fixedSeg){ showTip(evt.clientX, evt.clientY, fixedSeg); }
            else { hideTip(); }
          });
        }catch(_){ }
      }
      // Ensure the Basic Info structure matches the software schema even if an older HTML is cached
      (function ensureSoftwareBasicInfoStructure(){
        // Respect the HTML as-is: do not rebuild/override the basic-info grid
        try{
          return;
          var pane = document.getElementById('basic');
          if(!pane) return;
          // If our new ids are present, nothing to do
          if(document.getElementById('bi-work_status')) return;
          var section = pane.querySelector('.detail-section');
          if(!section) return;
          // Rebuild the inner basic-info-grid to the new layout
          var grid = section.querySelector('.basic-info-grid');
          if(!grid) return;
          grid.innerHTML = ''+
          '<div class="basic-info-card">\n'
          + '  <div class="basic-info-card-header">\n'
          + '    <h4>비즈니스</h4>\n'
          + '  </div>\n'
          + '  <div class="basic-info-card-content">\n'
          + '    <div class="info-row">\n'
          + '      <label>업무 상태</label>\n'
          + '      <span class="status-pill">\n'
          + '        <span class="status-dot ws-wait" id="bi-work_status-dot"></span>\n'
          + '        <span class="status-text" id="bi-work_status">-</span>\n'
          + '      </span>\n'
          + '    </div>\n'
          + '    <div class="info-row">\n'
          + '      <label>업무 그룹</label>\n'
          + '      <span class="toggle-badge" id="bi-work_group">-</span>\n'
          + '    </div>\n'
          + '  </div>\n'
          + '</div>\n'
          + '<div class="basic-info-card">\n'
          + '  <div class="basic-info-card-header">\n'
          + '    <h4>소프트웨어</h4>\n'
          + '  </div>\n'
          + '  <div class="basic-info-card-content">\n'
          + '    <div class="info-row"><label>소프트웨어 구분</label><span class="info-value" id="bi-sw_type">-</span></div>\n'
          + '    <div class="info-row"><label>소프트웨어 분류</label><span class="toggle-badge" id="bi-sw_class">-</span></div>\n'
          + '    <div class="info-row"><label>소프트웨어 제조사</label><span class="toggle-badge" id="bi-sw_vendor">-</span></div>\n'
          + '    <div class="info-row"><label>소프트웨어 이름</label><span class="info-value" id="bi-sw_name">-</span></div>\n'
          + '    <div class="info-row"><label>소프트웨어 버전</label><span class="info-value" id="bi-sw_version">-</span></div>\n'
          + '  </div>\n'
          + '</div>\n'
          + '<div class="basic-info-card">\n'
          + '  <div class="basic-info-card-header">\n'
          + '    <h4>담당자</h4>\n'
          + '  </div>\n'
          + '  <div class="basic-info-card-content">\n'
          + '    <div class="info-row"><label>소프트웨어 담당부서</label><span class="toggle-badge" id="bi-sw_dept">-</span></div>\n'
          + '    <div class="info-row"><label>소프트웨어 담당자</label><span class="toggle-badge" id="bi-sw_owner">-</span></div>\n'
          + '    <div class="info-row"><label>서비스 담당부서</label><span class="toggle-badge" id="bi-service_dept">-</span></div>\n'
          + '    <div class="info-row"><label>서비스 담당자</label><span class="toggle-badge" id="bi-service_owner">-</span></div>\n'
          + '  </div>\n'
          + '</div>\n'
          + '<div class="basic-info-card">\n'
          + '  <div class="basic-info-card-header">\n'
          + '    <h4>점검</h4>\n'
          + '  </div>\n'
          + '  <div class="basic-info-card-content">\n'
          + '    <div class="info-row"><label>라이선스 방식</label><span class="toggle-badge" id="bi-lic_type">-</span></div>\n'
            + '    <div class="info-row"><label class="no-wrap">라이선스 전체수량</label><span class="cell-num" id="bi-lic_total">-</span></div>\n'
            + '    <div class="info-row"><label class="no-wrap">라이선스 할당수량</label><span class="cell-num" id="bi-lic_assigned">-</span></div>\n'
            + '    <div class="info-row"><label class="no-wrap">라이선스 유휴수량</label><span class="cell-num" id="bi-lic_idle">-</span></div>\n'
          + '    <div class="info-row"><label>라이선스 설명</label><span class="info-value" id="bi-lic_desc">-</span></div>\n'
          + '  </div>\n'
          + '</div>';
        }catch(_){ /* ignore */ }
      })();
      // Helper: add and update colored dot next to '라이선스 유휴수량'
      function ensureIdleDot(){
        try{
          var idleEl = document.getElementById('bi-lic_idle'); if(!idleEl) return null;
          var dot = document.getElementById('bi-lic_idle-dot');
          // Ensure a wrapper so number and dot stay together on the right
          var wrap = idleEl.parentElement && idleEl.parentElement.classList.contains('lic-idle-wrap') ? idleEl.parentElement : null;
          if(!wrap){
            wrap = document.createElement('span');
            wrap.className = 'lic-idle-wrap';
            wrap.style.display = 'inline-flex';
            wrap.style.alignItems = 'center';
            // Insert wrapper at the current position of idleEl
            var parent = idleEl.parentElement; if(!parent) return null;
            parent.insertBefore(wrap, idleEl);
            wrap.appendChild(idleEl);
          }
          if(!dot){
            dot = document.createElement('span');
            dot.id = 'bi-lic_idle-dot';
            dot.className = 'status-dot lic-idle-dot';
            dot.setAttribute('aria-hidden','true');
            dot.style.display = 'inline-block';
            dot.style.width = '8px';
            dot.style.height = '8px';
            dot.style.borderRadius = '50%';
            dot.style.marginLeft = '6px';
            dot.style.verticalAlign = 'middle';
            wrap.appendChild(dot);
          } else {
            // If dot exists but is not immediately after the number inside the wrapper, fix it
            if(dot.parentElement !== wrap){ wrap.appendChild(dot); }
            if(dot.previousElementSibling !== idleEl){ wrap.insertBefore(dot, idleEl.nextSibling); }
          }
          return dot;
        }catch(_){ return null; }
      }
      function updateIdleDot(idleVal){
        try{
          var dot = ensureIdleDot(); if(!dot) return;
          var color = '#9e9e9e'; // default for zero/unknown
          var n = parseInt(String(idleVal), 10);
          if(!isNaN(n)){
            if(n < 0){
              color = '#e53935'; // red for negative
            } else if(n > 0){
              var btn = document.getElementById('detail-edit-open');
              var btnColor = null;
              if(btn){
                var cs = window.getComputedStyle(btn);
                var bg = cs && cs.backgroundColor;
                if(bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)'){
                  btnColor = bg;
                } else {
                  var fg = cs && cs.color;
                  if(fg) btnColor = fg;
                }
              }
              color = btnColor || '#2e7d32'; // fallback green-ish
            }
          }
          dot.style.backgroundColor = color;
        }catch(_){ }
      }
      // Initialize dot once on load from current displayed value
      (function(){
        try{ var idleEl = document.getElementById('bi-lic_idle'); if(idleEl){ var v = parseInt((idleEl.textContent||'').trim(),10); if(!isNaN(v)) updateIdleDot(v); } }catch(_){ }
      })();

      // Sync '업무 상태' dot color with list page style (ws-run / ws-idle / ws-wait)
      function updateWorkStatusDotFromText(){
        try{
          var txt = document.getElementById('bi-work_status');
          var dot = document.getElementById('bi-work_status-dot');
          if(!txt || !dot) return;
          var label = (txt.textContent || '').trim();
          dot.classList.remove('ws-run','ws-idle','ws-wait');
          var cls = (label==='가동') ? 'ws-run' : (label==='유휴' ? 'ws-idle' : 'ws-wait');
          dot.classList.add(cls);
        }catch(_){ }
      }
      if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', function(){ try{ updateWorkStatusDotFromText(); }catch(_){ } });
      } else {
        try{ updateWorkStatusDotFromText(); }catch(_){ }
      }
      // Reflect assigned license sum (from System tab) into Basic Info when available
      (function(){
        try{
          var assignedKey = 'unix:licAssignedSum';
          var assignedStr = localStorage.getItem(assignedKey);
          if(assignedStr!=null){
            var assigned = parseInt(assignedStr, 10);
            if(!isNaN(assigned)){
              var assignedEl = document.getElementById('bi-lic_assigned');
              if(assignedEl){
                assignedEl.textContent = String(assigned);
                // Recalculate idle = total - assigned (allow negative)
                var totalEl = document.getElementById('bi-lic_total');
                var idleEl = document.getElementById('bi-lic_idle');
                if(totalEl && idleEl){
                  var total = parseInt((totalEl.textContent||'0'),10)||0;
                  var idle = total - assigned;
                  idleEl.textContent = String(idle);
                  try{ updateIdleDot(idle); }catch(_){ }
                }
              }
            }
          }
        }catch(_){ }
      })();
      // If navigated from list, hydrate header/basic info from sessionStorage
      (function hydrateFromListSelection(){
        // Respect the HTML as-is: do not auto-hydrate header or basic values from sessionStorage
        try{
          return;
          var raw = sessionStorage.getItem('unix:selectedRow');
          if(!raw) return;
          var sel = null;
          try { sel = JSON.parse(raw); } catch(_e){ sel = null; }
          if(!sel) return;
          // Header title/subtitle
          var hdrTitle = document.querySelector('.page-header h1');
          var hdrSub = document.querySelector('.page-header p');
          if(hdrTitle){
            var titleParts = [];
            if(sel.work_group) titleParts.push(sel.work_group);
            if(sel.sw_name) titleParts.push(sel.sw_name);
            hdrTitle.textContent = titleParts.length ? titleParts.join(' — ') : (sel.sw_name || hdrTitle.textContent);
          }
          if(hdrSub){
            var subParts = [];
            if(sel.sw_vendor) subParts.push(sel.sw_vendor);
            if(sel.sw_name) subParts.push(sel.sw_name);
            if(sel.sw_version) subParts.push(sel.sw_version);
            hdrSub.textContent = subParts.length ? subParts.join(' ') : hdrSub.textContent;
          }
          // Business — ids added for clarity
          var stTxt = document.getElementById('bi-work_status');
          var stDot = document.getElementById('bi-work_status-dot');
          if(stTxt){ stTxt.textContent = sel.work_status || '-'; }
          if(stDot){
            stDot.classList.remove('ws-run','ws-idle','ws-wait');
            var scls = (sel.work_status==='가동'?'ws-run': (sel.work_status==='유휴'?'ws-idle':'ws-wait'));
            stDot.classList.add(scls);
          }
          var wg = document.getElementById('bi-work_group'); if(wg && sel.work_group){ wg.textContent = sel.work_group; }
          // Software
          var sType = document.getElementById('bi-sw_type'); if(sType && sel.sw_type){ sType.textContent = sel.sw_type; }
          var sClass = document.getElementById('bi-sw_class'); if(sClass && sel.sw_class){ sClass.textContent = sel.sw_class; }
          var sVendor = document.getElementById('bi-sw_vendor'); if(sVendor && sel.sw_vendor){ sVendor.textContent = sel.sw_vendor; }
          var sName = document.getElementById('bi-sw_name'); if(sName && sel.sw_name){ sName.textContent = sel.sw_name; }
          var sVer = document.getElementById('bi-sw_version'); if(sVer && sel.sw_version){ sVer.textContent = sel.sw_version; }
          // Owners
          var swDept = document.getElementById('bi-sw_dept'); if(swDept && sel.sw_dept){ swDept.textContent = sel.sw_dept; }
          var swOwner = document.getElementById('bi-sw_owner'); if(swOwner && sel.sw_owner){ swOwner.textContent = sel.sw_owner; }
          var svcDept = document.getElementById('bi-service_dept'); if(svcDept && sel.service_dept){ svcDept.textContent = sel.service_dept; }
          var svcOwner = document.getElementById('bi-service_owner'); if(svcOwner && sel.service_owner){ svcOwner.textContent = sel.service_owner; }
          // License
          var lt = document.getElementById('bi-lic_type'); if(lt && sel.lic_type){ lt.textContent = sel.lic_type; }
          var ltot = document.getElementById('bi-lic_total'); if(ltot && (sel.lic_total!==undefined && sel.lic_total!=='')){ ltot.textContent = String(sel.lic_total); }
          var lasg = document.getElementById('bi-lic_assigned'); if(lasg && (sel.lic_assigned!==undefined && sel.lic_assigned!=='')){ lasg.textContent = String(sel.lic_assigned); }
          var lidl = document.getElementById('bi-lic_idle'); if(lidl && (sel.lic_idle!==undefined && sel.lic_idle!=='')){ lidl.textContent = String(sel.lic_idle); }
          var ldesc = document.getElementById('bi-lic_desc'); if(ldesc && sel.lic_desc){ ldesc.textContent = sel.lic_desc; }
        }catch(_){ /* ignore */ }
      })();
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

      // --- Vendor search-select helpers (mirroring list page) ---
      var _vendorNameOptions = [];
      var _vendorDataLoaded = false;
      function _escapeHTML(str){ return String(str).replace(/[&<>'"]/g, function(s){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]; }); }
      function _buildVendorOptionsHtml(selected){
        var s = String(selected||'').trim();
        var list = _vendorNameOptions;
        var html = '';
        var has = s && list.indexOf(s) !== -1;
        if(s && !has) html += '<option value="'+_escapeHTML(s)+'" selected disabled>'+_escapeHTML(s)+' (등록되지 않은 제조사)</option>';
        html += '<option value="">선택</option>';
        if(!list.length){ html += '<option value="" disabled>등록된 제조사가 없습니다.</option>'; return html; }
        for(var i=0;i<list.length;i++){ var n=list[i]; html += '<option value="'+_escapeHTML(n)+'"'+(n===s?' selected':'')+'>'+_escapeHTML(n)+'</option>'; }
        return html;
      }
      function _loadAndSyncVendorOptions(formId){
        var form = document.getElementById(formId); if(!form) return;
        function doSync(){
          var sel = form.querySelector('select[name="vendor"]'); if(!sel) return;
          var cur = String(sel.value||'').trim();
          sel.innerHTML = _buildVendorOptionsHtml(cur);
          try{ if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll==='function') window.BlossomSearchableSelect.syncAll(form); }catch(_){}
        }
        if(_vendorDataLoaded){ doSync(); return; }
        fetch('/api/vendor-manufacturers', {credentials:'same-origin'})
          .then(function(r){ return r.json(); })
          .then(function(data){
            var items = (data&&data.items)||[];
            var names = {};
            items.forEach(function(it){ var nm=(it.manufacturer_name||'').replace(/\u00A0/g,' ').replace(/\s+/g,' ').trim(); if(nm) names[nm]=1; });
            _vendorNameOptions = Object.keys(names).sort(function(a,b){ return a.localeCompare(b,'ko-KR'); });
            _vendorDataLoaded = true;
            doSync();
          })
          .catch(function(){ doSync(); });
      }

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
        form.setAttribute('data-fk-ignore', '1');
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
        // Build OS category edit form identical to the OS list page
        var LABELS = {
          model:'모델명', vendor:'제조사', release_date:'릴리즈 일자', eosl:'EOSL 일자', note:'비고'
        };
        function generateOsField(col, value){
          if(col==='release_date' || col==='eosl'){
            return '<input name="'+col+'" type="text" class="form-input date-input" value="'+(value||'')+'" placeholder="YYYY-MM-DD">';
          }
          if(col==='note'){
            return '<textarea name="note" class="form-input textarea-large" rows="6">'+(value||'')+'</textarea>';
          }
          if(col==='vendor'){
            var v = String(value||'').trim();
            return '<select name="vendor" class="form-input search-select" data-searchable="true" data-placeholder="선택" required>' + _buildVendorOptionsHtml(v) + '</select>';
          }
          return '<input name="'+col+'" class="form-input" value="'+(value||'')+'">';
        }
        function getText(id){ var el=document.getElementById(id); return el? (el.textContent||'').trim() : ''; }
        var current = {
          model: getText('os-model'),
          vendor: getText('os-vendor'),
          release_date: getText('os-release-date'),
          eosl: getText('os-eosl'),
          note: getText('os-note')
        };
        form.innerHTML = '';
        var section=document.createElement('div'); section.className='form-section';
        section.innerHTML = '<div class="section-header"><h4>운영체제</h4></div>';
        var grid=document.createElement('div'); grid.className='form-grid';
        ['model','vendor','release_date','eosl','note'].forEach(function(c){
          var wrap=document.createElement('div');
          wrap.className = (c==='note') ? 'form-row form-row-wide' : 'form-row';
          wrap.innerHTML = '<label>'+LABELS[c]+'</label>'+generateOsField(c, current[c]||'');
          grid.appendChild(wrap);
        });
        section.appendChild(grid);
        form.appendChild(section);
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
        var dashText=['vendor','model','serial','location_pos']; var dashNum=['slot','u_size'];
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
        // If the form is the OS category form, update visible bits accordingly
        var isOsForm = !!form.querySelector('[name="model"]');
        if(isOsForm){
          function val(name){ var el=form.querySelector('[name="'+name+'"]'); return el ? el.value : ''; }
          function setText(id, v){ var el=document.getElementById(id); if(el){ el.textContent = String(v||''); } }
          // Map OS fields into existing placeholders on the page
          setText('os-vendor', val('vendor'));
          setText('os-model', val('model'));
          setText('os-release-date', val('release_date'));
          setText('os-eosl', val('eosl'));
          setText('os-note', val('note'));
          // Header update so user sees immediate change (title=model, subtitle=vendor)
          try{
            var headerTitle = document.getElementById('page-header-title');
            if(headerTitle){ var title = (val('model')||'').trim(); if(title) headerTitle.textContent = title; }
            var headerSub = document.getElementById('page-header-subtitle');
            if(headerSub){ var sub = (val('vendor')||'').trim(); if(sub) headerSub.textContent = sub; }
          }catch(_){ }
          return;
        }
        function setTextById(id, val){ var el=document.getElementById(id); if(el){ el.textContent = String(val||''); } }
        function v(name){ var el=form.querySelector('[name="'+name+'"]'); return el ? el.value : ''; }
        // 업무 상태 표시 및 상태점 색상
        setTextById('bi-work_status', v('work_status'));
        try{ var dot=document.getElementById('bi-work_status-dot'); if(dot){ dot.classList.remove('ws-run','ws-idle','ws-wait'); var lbl=v('work_status'); dot.classList.add(lbl==='가동'?'ws-run': (lbl==='유휴'?'ws-idle':'ws-wait')); } }catch(_){ }
        setTextById('bi-work_group', v('work_group'));
        // 소프트웨어
        setTextById('bi-sw_type', v('sw_type'));
        setTextById('bi-sw_class', v('sw_class'));
        setTextById('bi-sw_vendor', v('sw_vendor'));
        setTextById('bi-sw_name', v('sw_name'));
        setTextById('bi-sw_version', v('sw_version'));
        // 페이지 헤더 동기화: 타이틀=소프트웨어 구분, 서브타이틀=제조사 이름 버전
        try{
          var headerTitle = document.getElementById('page-header-title');
          if(headerTitle){
            var tVal = (v('sw_type')||'').trim();
            if(tVal) headerTitle.textContent = tVal;
          }
          var headerSub = document.getElementById('page-header-subtitle');
          if(headerSub){
            var parts = [v('sw_vendor'), v('sw_name'), v('sw_version')]
              .map(function(s){ return (s||'').toString().trim(); })
              .filter(function(s){ return s.length>0; });
            headerSub.textContent = parts.join(' ');
          }
        }catch(_){ }
        // 담당자
        setTextById('bi-sw_dept', v('sw_dept'));
        setTextById('bi-sw_owner', v('sw_owner'));
        setTextById('bi-service_dept', v('service_dept'));
        setTextById('bi-service_owner', v('service_owner'));
  // 점검 + 유휴 재계산: idle = total - assigned (음수 허용)
        var t = parseInt(v('lic_total')||'0',10)||0;
        var a = parseInt(v('lic_assigned')||'0',10)||0;
  var idle = t - a;
        setTextById('bi-lic_type', v('lic_type'));
        setTextById('bi-lic_total', String(t));
        setTextById('bi-lic_assigned', String(a));
  setTextById('bi-lic_idle', String(idle));
  try{ updateIdleDot(idle); }catch(_){ }
        setTextById('bi-lic_desc', v('lic_desc'));
      }

      // Live-sync helpers for license fields in the Software edit forms
      function attachLicenseLiveSync(formId){
        var form=document.getElementById(formId); if(!form) return;
        if(form.dataset.licLiveSyncAttached==='1') return;
        var totalEl=form.querySelector('[name="lic_total"]');
        var assignedEl=form.querySelector('[name="lic_assigned"]');
        var idleEl=form.querySelector('[name="lic_idle"]');
        function toInt(s){ var n=parseInt((s||'').toString(),10); return isNaN(n)?0:n; }
  function recompute(){ if(!idleEl) return; var t=toInt(totalEl&&totalEl.value); var a=toInt(assignedEl&&assignedEl.value); var newVal = (t-a); idleEl.value=String(newVal); try{ updateIdleDot(newVal); }catch(_){ } }
        totalEl&&totalEl.addEventListener('input',recompute);
        assignedEl&&assignedEl.addEventListener('input',recompute);
        recompute();
        form.dataset.licLiveSyncAttached='1';
      }
      // Wire the Basic Info edit modal — direct onclick binding (not delegation)
      (function(){
        if(document.__hwEditDirect) return;
        document.__hwEditDirect = true;
        var HW_API_BASE = '/api/hw-server-types';

        function closeMessageModal(){
          var el = document.getElementById('system-message-modal'); if(!el) return;
          el.classList.remove('show');
          el.setAttribute('aria-hidden','true');
          if(!document.querySelector('.modal-overlay-full.show')) document.body.classList.remove('modal-open');
        }
        function showMessage(msg, title){
          var titleEl = document.getElementById('message-title');
          var contentEl = document.getElementById('message-content');
          if(titleEl) titleEl.textContent = title || '알림';
          if(contentEl) contentEl.textContent = String(msg || '');
          var el = document.getElementById('system-message-modal'); if(!el) return;
          document.body.classList.add('modal-open');
          el.classList.add('show');
          el.setAttribute('aria-hidden','false');
          var msgClose = document.getElementById('system-message-close');
          var msgOk = document.getElementById('system-message-ok');
          if(msgClose) msgClose.onclick = closeMessageModal;
          if(msgOk) msgOk.onclick = closeMessageModal;
        }

        function closeModal(){
          console.log('[hw-edit] closeModal called');
          var el = document.getElementById(EDIT_MODAL_ID); if(!el) return;
          el.classList.remove('show');
          el.style.display = 'none';
          el.setAttribute('aria-hidden','true');
          if(!document.querySelector('.modal-overlay-full.show')) document.body.classList.remove('modal-open');
        }

        function doSave(){
          console.log('[hw-edit] doSave called');
          var contentEl = document.querySelector('.server-detail-content');
          var hwId = contentEl ? (contentEl.getAttribute('data-hw-id')||'').trim() : '';
          if(!hwId){ showMessage('수정할 대상을 찾을 수 없습니다.', '오류'); return; }
          var form = document.getElementById(EDIT_FORM_ID); if(!form) return;
          var data = {};
          form.querySelectorAll('input,select,textarea').forEach(function(el){ data[el.name] = (el.value||'').trim(); });
          var payload = {
            model_name: data.model || '',
            release_date: data.release_date || '',
            eosl_date: data.eosl || '',
            remark: data.note || ''
          };
          var vendor = (data.vendor || '').trim();
          if(vendor) payload.manufacturer_name = vendor;
          fetch(HW_API_BASE + '/' + hwId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            body: JSON.stringify(payload)
          })
          .then(function(r){ return r.json().then(function(d){ return {ok:r.ok, data:d}; }); })
          .then(function(res){
            if(!res.ok || res.data.success === false){ showMessage(res.data.message || '서버 수정 중 오류가 발생했습니다.', '오류'); return; }
            try{ updatePageFromForm(); }catch(_){}
            try{
              var qs = new URLSearchParams(window.location.search || '');
              qs.set('model', data.model || ''); qs.set('vendor', data.vendor || '');
              qs.set('release_date', data.release_date || ''); qs.set('eosl', data.eosl || '');
              qs.set('note', data.note || '');
              history.replaceState(null, '', window.location.pathname + '?' + qs.toString());
              try{ var sk='server_selected_row'; var sr=JSON.parse(sessionStorage.getItem(sk)||'{}');
                sr.model=data.model||''; sr.vendor=data.vendor||''; sr.release_date=data.release_date||''; sr.eosl=data.eosl||''; sr.note=data.note||'';
                sessionStorage.setItem(sk, JSON.stringify(sr)); }catch(_s){}
            }catch(_q){}
            closeModal();
            showMessage('서버가 수정되었습니다.', '완료');
          })
          .catch(function(err){ console.error(err); showMessage('서버와 통신하지 못했습니다.', '오류'); });
        }

        function wireModalButtons(){
          console.log('[hw-edit] wireModalButtons');
          var modalEl = document.getElementById(EDIT_MODAL_ID);
          var closeBtn = document.getElementById(EDIT_CLOSE_ID);
          var saveBtn  = document.getElementById(EDIT_SAVE_ID);

          // Direct onclick — cannot be blocked by capture-phase handlers
          if(closeBtn){
            closeBtn.onclick = function(e){ e.stopPropagation(); closeModal(); };
            console.log('[hw-edit] closeBtn wired');
          }
          if(saveBtn){
            saveBtn.onclick = function(e){ e.stopPropagation(); doSave(); };
            console.log('[hw-edit] saveBtn wired');
          }
          if(modalEl){
            modalEl.onclick = function(e){ if(e.target === modalEl) closeModal(); };
            console.log('[hw-edit] backdrop wired');
          }
        }

        function openModal(){
          console.log('[hw-edit] openModal called');
          var el = document.getElementById(EDIT_MODAL_ID); if(!el) return;
          document.body.classList.add('modal-open');
          el.style.display = 'block';
          el.classList.add('show');
          el.setAttribute('aria-hidden','false');
          // Wire buttons directly on the DOM elements (bypass delegation)
          wireModalButtons();
        }

        // Open button: use direct getElementById binding + delegation fallback
        var openBtn = document.getElementById(EDIT_OPEN_ID);
        if(openBtn){
          openBtn.onclick = function(){
            console.log('[hw-edit] edit button clicked');
            try{ buildEditFormFromPage(); }catch(err){ console.error('[hw-edit] buildForm error:', err); }
            openModal();
            try{ initDatePickers(EDIT_FORM_ID); }catch(err){ console.error('[hw-edit] initDatePickers error:', err); }
            try{ _loadAndSyncVendorOptions(EDIT_FORM_ID); }catch(err){ console.error('[hw-edit] vendor sync error:', err); }
          };
        }

        // Escape key
        document.addEventListener('keydown', function(e){
          if(e.key === 'Escape'){
            var modal = document.getElementById(EDIT_MODAL_ID);
            if(modal && modal.classList.contains('show')) closeModal();
            var msgModal = document.getElementById('system-message-modal');
            if(msgModal && msgModal.classList.contains('show')) closeMessageModal();
          }
        });

        // Fallback: delegation for open button (in case getElementById missed it)
        document.addEventListener('click', function(e){
          var t = e.target; if(!t) return;
          if(t.closest && t.closest('#'+EDIT_OPEN_ID)){
            if(document.getElementById(EDIT_MODAL_ID) &&
               document.getElementById(EDIT_MODAL_ID).classList.contains('show')) return;
            console.log('[hw-edit] edit button clicked (delegation fallback)');
            try{ buildEditFormFromPage(); }catch(err){ console.error('[hw-edit] buildForm error:', err); }
            openModal();
            try{ initDatePickers(EDIT_FORM_ID); }catch(err){ console.error('[hw-edit] initDatePickers error:', err); }
            try{ _loadAndSyncVendorOptions(EDIT_FORM_ID); }catch(err){ console.error('[hw-edit] vendor sync error:', err); }
          }
        });
      })();

      // [Tabs moved to /static/js/_detail/tab*.js]

  
      // [Tabs moved to /static/js/_detail/tab*.js]

  
  
  
  
  
      // [Tabs moved to /static/js/_detail/tab*.js]

  
      // [Tabs moved to /static/js/_detail/tab*.js]

  
      // [Tabs moved to /static/js/_detail/tab*.js]

  
      // [Tabs moved to /static/js/_detail/tab*.js]

  
  
  
  
  
  
  
  
      // [Tabs moved to /static/js/_detail/tab*.js]

  
      // [Tabs moved to /static/js/_detail/tab*.js]

  
  
      // [Removed legacy Change Log implementation]
  
}
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',__detailInit);}else{__detailInit();}
document.addEventListener('blossom:pageLoaded',function(){try{__detailInit();}catch(_){}});
window.addEventListener('pageshow',function(e){if(e.persisted){try{__detailInit();}catch(_){}}});
  
    // No modal APIs to expose
  })();
  
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
      var FLATPICKR_CSS = '/static/vendor/flatpickr/4.6.13/flatpickr.min.css';
      var FLATPICKR_THEME_NAME = 'airbnb';
      var FLATPICKR_THEME_HREF = '/static/vendor/flatpickr/4.6.13/themes/' + FLATPICKR_THEME_NAME + '.css';
      var FLATPICKR_JS = '/static/vendor/flatpickr/4.6.13/flatpickr.min.js';
      var FLATPICKR_KO = '/static/vendor/flatpickr/4.6.13/l10n/ko.js';
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

      // Sync header + basic fields from querystring or sessionStorage (so refresh/deep-links keep context)
      function syncHeaderFromQueryOrSession(){
        try{
          function setTextIfMeaningful(id, val){
            var el = document.getElementById(id);
            if(!el) return;
            var v = (val==null ? '' : String(val)).trim();
            if(!v) return;
            var cur = (el.textContent || '').trim();
            if(!cur || cur === '-' || cur === '모델명' || cur === '제조사'){
              el.textContent = v;
            }
          }
          function apply(model, vendor, hwType, releaseDate, eosl, qty, note){
            setTextIfMeaningful('os-model', model);
            setTextIfMeaningful('os-vendor', vendor);
            setTextIfMeaningful('os-type', hwType);
            setTextIfMeaningful('os-release-date', releaseDate);
            setTextIfMeaningful('os-eosl', eosl);
            setTextIfMeaningful('os-qty', qty);
            setTextIfMeaningful('os-note', note);

            var titleEl = document.getElementById('page-header-title');
            var subEl = document.getElementById('page-header-subtitle');
            var m = (model==null ? '' : String(model)).trim();
            var v = (vendor==null ? '' : String(vendor)).trim();
            if(titleEl && m) titleEl.textContent = m;
            if(subEl && v) subEl.textContent = v;
          }

          var qs = new URLSearchParams(window.location.search || '');
          var qModel = (qs.get('model') || '').trim();
          var qVendor = (qs.get('vendor') || '').trim();
          var qType = (qs.get('hw_type') || '').trim();
          var qRelease = (qs.get('release_date') || '').trim();
          var qEosl = (qs.get('eosl') || '').trim();
          var qQty = (qs.get('qty') || '').trim();
          var qNote = (qs.get('note') || '').trim();

          if(qModel || qVendor || qType || qRelease || qEosl || qQty || qNote){
            apply(qModel, qVendor, qType, qRelease, qEosl, qQty, qNote);
            return;
          }

          try{
            var raw = sessionStorage.getItem('security_selected_row');
            if(!raw) return;
            var row = JSON.parse(raw);
            if(!row || typeof row !== 'object') return;
            apply(row.model || '', row.vendor || '', row.hw_type || '', row.release_date || '', row.eosl || '', (row.qty==null?'':String(row.qty)), row.note || '');
          }catch(_s){ }
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
      // Ensure header/fields reflect query or last selected row (tab/refresh safe)
      try{ syncHeaderFromQueryOrSession(); }catch(_){ }
      // Ensure header reflects current OS model/vendor on load
      try{ syncHeaderFromOs(); }catch(_){ }
      // Render 상태 통계 + 업무 그룹 통계 from Hardware API (model-assets)
      (function renderHwBasicStats(){
        try{
          var container = document.querySelector('.server-detail-content');
          var serverCode = container ? (container.getAttribute('data-server-code') || '') : '';
          var modelName = '';
          try{ var titleEl = document.getElementById('page-header-title'); if(titleEl){ modelName = (titleEl.textContent || '').trim(); } }catch(_){}
          var apiParam = '';
          if(serverCode) apiParam = 'server_code=' + encodeURIComponent(serverCode);
          else if(modelName) apiParam = 'model=' + encodeURIComponent(modelName);
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
          if(!apiParam){
            showPieEmpty('할당 하드웨어 자산이 없습니다.');
            showGroupEmpty('할당 하드웨어 자산이 없습니다.');
            setOsQuantity(0);
            return;
          }
          fetch('/api/hardware/model-assets?' + apiParam)
            .then(function(res){ return res.json(); })
            .then(function(data){
              if(!data.success || !data.items || !data.items.length){
                showPieEmpty('할당 하드웨어 자산이 없습니다.');
                showGroupEmpty('할당 하드웨어 자산이 없습니다.');
                setOsQuantity(0);
                return;
              }
              var items = data.items;
              setOsQuantity(items.length);
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
              setOsQuantity(0);
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
          var assignedKey = 'security:licAssignedSum';
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
          var raw = sessionStorage.getItem('security:selectedRow');
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
        // Build Security category edit form identical to the Security list page
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
  section.innerHTML = '<div class="section-header"><h4>보안장비</h4></div>';
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
        var HW_API_BASE = '/api/hw-security-types';

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
            if(!res.ok || res.data.success === false){ showMessage(res.data.message || '보안장비 수정 중 오류가 발생했습니다.', '오류'); return; }
            try{ updatePageFromForm(); }catch(_){}
            try{
              var qs = new URLSearchParams(window.location.search || '');
              qs.set('model', data.model || ''); qs.set('vendor', data.vendor || '');
              qs.set('release_date', data.release_date || ''); qs.set('eosl', data.eosl || '');
              qs.set('note', data.note || '');
              history.replaceState(null, '', window.location.pathname + '?' + qs.toString());
              try{ var sk='security_selected_row'; var sr=JSON.parse(sessionStorage.getItem(sk)||'{}');
                sr.model=data.model||''; sr.vendor=data.vendor||''; sr.release_date=data.release_date||''; sr.eosl=data.eosl||''; sr.note=data.note||'';
                sessionStorage.setItem(sk, JSON.stringify(sr)); }catch(_s){}
            }catch(_q){}
            closeModal();
            showMessage('보안장비가 수정되었습니다.', '완료');
          })
          .catch(function(err){ console.error(err); showMessage('서버와 통신하지 못했습니다.', '오류'); });
        }

        function wireModalButtons(){
          console.log('[hw-edit] wireModalButtons');
          var modalEl = document.getElementById(EDIT_MODAL_ID);
          var closeBtn = document.getElementById(EDIT_CLOSE_ID);
          var saveBtn  = document.getElementById(EDIT_SAVE_ID);
          if(closeBtn){ closeBtn.onclick = function(e){ e.stopPropagation(); closeModal(); }; }
          if(saveBtn){ saveBtn.onclick = function(e){ e.stopPropagation(); doSave(); }; }
          if(modalEl){ modalEl.onclick = function(e){ if(e.target === modalEl) closeModal(); }; }
        }

        function openModal(){
          console.log('[hw-edit] openModal called');
          var el = document.getElementById(EDIT_MODAL_ID); if(!el) return;
          document.body.classList.add('modal-open');
          el.style.display = 'block';
          el.classList.add('show');
          el.setAttribute('aria-hidden','false');
          wireModalButtons();
        }

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

        document.addEventListener('keydown', function(e){
          if(e.key === 'Escape'){
            var modal = document.getElementById(EDIT_MODAL_ID);
            if(modal && modal.classList.contains('show')) closeModal();
            var msgModal = document.getElementById('system-message-modal');
            if(msgModal && msgModal.classList.contains('show')) closeMessageModal();
          }
        });

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

      // ---------- Hardware/Allocation table interactions (system tab) ----------
      (function(){
        if(window.BlossomTab41System && typeof window.BlossomTab41System.initAllocationTable === 'function'){
          try{ if(window.BlossomTab41System.initAllocationTable()) return; }catch(_){ }
        }
        var table = document.getElementById('hw-spec-table'); if(!table) return;
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
              // Detect if the table uses software_detail_version column
              var useVersionCol = !!table.querySelector('thead th') && Array.prototype.some.call(table.querySelectorAll('thead th'), function(th){ return (th.textContent||'').trim()==='소프트웨어 상세버전'; });
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
                ${useVersionCol ? '<td data-col="software_detail_version"><input type="text" placeholder="소프트웨어 상세버전"></td>' : '<td data-col="license_quantity"><input type="number" min="0" step="1" placeholder="0"></td>'}
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
              var versionCol = table.querySelector('tbody tr [data-col="software_detail_version"]') ? 'software_detail_version' : 'license_quantity';
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
              var versionCol2 = table.querySelector('tbody tr [data-col="software_detail_version"]') ? 'software_detail_version' : 'license_quantity';
              function getInput(name){ var td=tr.querySelector('[data-col="'+name+'"]'); if(!td) return null; return td.querySelector('input, select, textarea'); }
              function commit(name, val){
                var td=tr.querySelector('[data-col="'+name+'"]'); if(!td) return;
                var text = (val === '' || val==null)? '-' : String(val);
                if(name==='work_status'){
                  var cls = (text==='가동') ? 'ws-run' : (text==='유휴' ? 'ws-idle' : 'ws-wait');
                  td.innerHTML = '<span class="status-pill"><span class="status-dot '+cls+'" aria-hidden="true"></span><span class="status-text">'+text+'</span></span>';
                  return;
                }
                td.textContent = text;
              }
              function read(name){ var inp=getInput(name); var v = (inp? inp.value : (tr.querySelector('[data-col="'+name+'"]').textContent||'')); return String(v).trim(); }
              commit('work_status', read('work_status'));
              commit('work_name', read('work_name'));
              commit('system_name', read('system_name'));
              commit('system_ip', read('system_ip'));
              commit(versionCol2, read(versionCol2));
              commit('remark', read('remark'));
              var toggleBtn2 = tr.querySelector('.js-hw-toggle');
              if(toggleBtn2){ toggleBtn2.setAttribute('data-action','edit'); toggleBtn2.title='편집'; toggleBtn2.setAttribute('aria-label','편집'); toggleBtn2.innerHTML='<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon">'; }
              updateEmptyState();
              var cb = tr.querySelector('.hw-row-check'); if(cb){ var hidden = tr.hasAttribute('data-hidden') || tr.style.display==='none'; tr.classList.toggle('selected', !!cb.checked && !hidden); }
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
            var useVersionCol = table.querySelector('tbody tr [data-col="software_detail_version"]') ? 'software_detail_version' : 'license_quantity';
            var headers = ['업무 상태','업무 이름','시스템 이름','시스템 IP', (useVersionCol==='software_detail_version' ? '소프트웨어 상세버전' : '라이선스 수량'), '비고'];
            var trs = hwSavedVisibleRows();
            if(onlySelected){ trs = trs.filter(function(tr){ var cb = tr.querySelector('.hw-row-check'); return cb && cb.checked; }); }
            if(trs.length===0) return;
            function text(tr, col){ var td=tr.querySelector('[data-col="'+col+'"]'); return td? (td.textContent||'').trim() : ''; }
            var baseCols = ['work_status','work_group','work_name','system_name','system_ip',useVersionCol,'remark'];
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
                var td = tr.querySelector('[data-col="license_quantity"]');
                if(!td) return;
                var raw = (td.textContent||'').trim();
                var n = parseInt(raw.replace(/[^0-9\-]/g,''), 10);
                if(!isNaN(n) && isFinite(n)) sum += n;
              });
              try{ localStorage.setItem('security:licAssignedSum', String(sum)); }catch(_){ }
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
        var tableContext = (table.getAttribute('data-context')||'').trim();
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

  
      (function(){
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
  
}
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',__detailInit);}else{__detailInit();}
document.addEventListener('blossom:pageLoaded',function(){try{__detailInit();}catch(_){}});
window.addEventListener('pageshow',function(e){if(e.persisted){try{__detailInit();}catch(_){}}});
  
    // No modal APIs to expose
  })();
  
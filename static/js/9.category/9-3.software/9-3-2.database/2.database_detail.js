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
      // Helper: render an animated no-data image into a container (align with MEMORY behavior)
      function showNoDataImage(container, altText){
        try{
          if(!container) return;
          container.innerHTML='';
          var wrap=document.createElement('span');
          wrap.style.display='flex'; wrap.style.alignItems='center'; wrap.style.justifyContent='center';
          wrap.style.padding='12px 0'; wrap.style.minHeight='140px'; wrap.style.width='100%'; wrap.style.boxSizing='border-box'; wrap.style.flexDirection='column';
          var jsonPath='/static/image/svg/free-animated-no-data.json';
          function renderLottie(){
            try{
              if(!window.lottie) return false;
              var animBox=document.createElement('span'); animBox.style.display='inline-block'; animBox.style.width='240px'; animBox.style.maxWidth='100%'; animBox.style.height='180px'; animBox.style.pointerEvents='none';
              var alt=(altText||'데이터 없음')+''; animBox.setAttribute('aria-label', alt.split('\n')[0]); wrap.appendChild(animBox);
              try{
                window.lottie.loadAnimation({container:animBox,renderer:'svg',loop:true,autoplay:true,path:jsonPath});
                var cap=document.createElement('span'); cap.style.display='block'; cap.style.marginTop='8px'; cap.style.textAlign='center';
                var altLines=(alt+'').split('\n'); altLines.forEach(function(line,i){ var s=document.createElement('span'); s.textContent=line; s.style.display='block'; s.style.fontSize=i===0?'14px':'13px'; s.style.color='#64748b'; cap.appendChild(s); });
                wrap.appendChild(cap); container.appendChild(wrap); return true;
              }catch(_a){ return false; }
            }catch(_){ return false; }
          }
          function loadLottieAndRender(){
            try{
              var sc=document.createElement('script'); sc.src='https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js'; sc.async=true; sc.onload=function(){ if(!renderLottie()) renderImageFallback(); }; sc.onerror=function(){ renderImageFallback(); }; document.head.appendChild(sc);
            }catch(_){ renderImageFallback(); }
          }
          function renderImageFallback(){
            try{
              var img=document.createElement('img'); var alt=(altText||'데이터 없음')+''; img.alt=alt.split('\n')[0]; img.style.maxWidth='240px'; img.style.width='100%'; img.style.height='auto';
              var candidates=['/blossom/static/image/svg/free-animated-no-data/no-data.svg','/blossom/static/image/svg/free-animated-no-data/animated.svg','/blossom/static/image/svg/free-animated-no-data/animation.svg','/blossom/static/image/svg/free-animated-no-data/index.svg','/blossom/static/image/svg/free-animated-no-data.svg','/blossom/static/image/svg/free-animated-no-data/no-data.gif','/blossom/static/image/svg/free-animated-no-data.gif','/static/image/svg/free-animated-no-data/no-data.svg','/static/image/svg/free-animated-no-data/animated.svg','/static/image/svg/free-animated-no-data/animation.svg','/static/image/svg/free-animated-no-data/index.svg','/static/image/svg/free-animated-no-data.svg','/static/image/svg/free-animated-no-data/no-data.gif','/static/image/svg/free-animated-no-data.gif'];
              var i=0; function next(){ if(i>=candidates.length) return; img.src=candidates[i++]; } img.onerror=function(){ next(); }; next(); wrap.appendChild(img);
              var cap=document.createElement('span'); cap.style.display='block'; cap.style.marginTop='8px'; cap.style.textAlign='center';
              (alt+'').split('\n').forEach(function(line,idx){ var s=document.createElement('span'); s.textContent=line; s.style.display='block'; s.style.fontSize=idx===0?'14px':'13px'; s.style.color='#64748b'; cap.appendChild(s); });
              wrap.appendChild(cap); container.appendChild(wrap);
            }catch(_f){}
          }
          if(!renderLottie()){ if(!window.lottie){ loadLottieAndRender(); } else { renderImageFallback(); } }
        }catch(_e){}
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
      // Populate new OS fields from existing basic info values (backward compatible)
      (function hydrateOsSection(){
        try{
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
      // Fetch model assets from API, then render: status pie, operation pie, qty
      (function renderStatsFromApi(){
        try{
          var modelEl = document.getElementById('page-header-title') || document.getElementById('os-model');
          var model = modelEl ? (modelEl.textContent||'').trim() : '';
          var statPie = document.getElementById('stat-pie');
          var statEmpty = document.getElementById('stat-empty');
          var statLegendEl = null;
          try{ if(statPie && statPie.parentElement){ statLegendEl = statPie.parentElement.querySelector('.pie-legend'); } }catch(_){}
          var operPie = document.getElementById('oper-pie');
          var operLegend = document.getElementById('oper-legend');
          var operEmpty = document.getElementById('oper-empty');
          function hideChart(pie, empty, legendEl, msg){
            if(empty){ empty.style.display=''; try{ showNoDataImage(empty, msg); }catch(_){} }
            if(pie){ pie.style.visibility='hidden'; pie.style.display='none'; try{ pie.closest('.pie-wrap').style.display='none'; }catch(_){} }
            if(legendEl){ legendEl.style.display='none'; }
          }
          if(!model || model === '-' || model === '모델명'){
            hideChart(statPie, statEmpty, statLegendEl, '할당 시스템 내역이 없습니다.');
            hideChart(operPie, operEmpty, operLegend, '업무운영 데이터가 없습니다.');
            return;
          }
          var apiUrl = '/api/category/sw-model-assets?model=' + encodeURIComponent(model);
          fetch(apiUrl).then(function(r){ return r.json(); }).then(function(data){
            var rows = data.items || data.data || data || [];
            if(!Array.isArray(rows)) rows = [];
            // Update qty
            try{ var qtyEl = document.getElementById('os-qty'); if(qtyEl) qtyEl.textContent = rows.length.toLocaleString('ko-KR'); }catch(_){}
            // ---- Status pie ----
            var run=0, idle=0, wait=0;
            rows.forEach(function(r){
              var s = (r.work_status||'').trim();
              if(s === '가동') run++;
              else if(s === '유휴') idle++;
              else if(s === '대기') wait++;
            });
            var sTotal = run + idle + wait;
            if(sTotal > 0){
              if(statEmpty) statEmpty.style.display='none';
              if(statPie){ statPie.style.visibility=''; statPie.style.display='block'; try{ statPie.closest('.pie-wrap').style.display=''; }catch(_){} }
              if(statLegendEl) statLegendEl.style.display='';
              var t = sTotal;
              function pct(n){ return Math.round((n*100)/t); }
              var segDefs = [
                {id:'stat-run-legend',label:'가동',count:run,color:'#6366f1'},
                {id:'stat-idle-legend',label:'유휴',count:idle,color:'#0ea5e9'},
                {id:'stat-wait-legend',label:'대기',count:wait,color:'#94a3b8'}
              ];
              segDefs.forEach(function(sd){
                var el = document.getElementById(sd.id);
                var li = el ? el.closest('.legend-item') : null;
                if(sd.count > 0){ if(el) el.textContent = sd.count+' ('+pct(sd.count)+'%)'; if(li) li.style.display=''; }
                else { if(li) li.style.display='none'; }
              });
              var segs = segDefs.filter(function(s){ return s.count > 0; });
              var gradParts = [], cumDeg = 0, interSegs = [];
              segs.forEach(function(s){
                var deg = Math.round((s.count*360)/t);
                var startD = cumDeg; cumDeg += deg;
                if(cumDeg > 360) cumDeg = 360;
                gradParts.push(s.color+' '+startD+'deg '+cumDeg+'deg');
                interSegs.push({label:s.label,count:s.count,color:s.color,start:startD,end:cumDeg});
              });
              if(interSegs.length) interSegs[interSegs.length-1].end = 360;
              if(statPie){
                statPie.style.background = 'conic-gradient('+gradParts.join(', ')+')';
                try{ attachPieInteractions(statPie, interSegs, t); }catch(_){}
              }
            } else {
              hideChart(statPie, statEmpty, statLegendEl, '할당 시스템 내역이 없습니다.');
            }
            // ---- Operation pie ----
            var opMap = {};
            rows.forEach(function(r){ var op = (r.work_operation||'').trim() || '-'; opMap[op] = (opMap[op]||0)+1; });
            var opEntries = Object.keys(opMap).map(function(k){ return {label:k,count:opMap[k]}; });
            opEntries.sort(function(a,b){ return b.count-a.count; });
            var opTotal = opEntries.reduce(function(s,e){ return s+e.count; },0);
            if(opTotal > 0){
              if(operEmpty) operEmpty.style.display='none';
              if(operPie){ operPie.style.display='block'; try{ operPie.closest('.pie-wrap').style.display=''; }catch(_){} }
              if(operLegend) operLegend.style.display='';
              var colors = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#a855f7','#22c55e','#06b6d4','#f97316','#94a3b8'];
              var stops=[]; var deg=0; var segments=[];
              opEntries.forEach(function(e,i){
                var c = colors[i % colors.length];
                var d = Math.round((e.count/opTotal)*360);
                if(i === opEntries.length-1) d = 360-deg;
                stops.push(c+' '+deg+'deg '+(deg+d)+'deg');
                segments.push({label:e.label,count:e.count,color:c,start:deg,end:deg+d});
                deg += d;
              });
              operPie.style.background = 'conic-gradient('+stops.join(', ')+')';
              if(operLegend){
                operLegend.innerHTML='';
                opEntries.forEach(function(e,i){
                  var p = Math.round((e.count*100)/opTotal);
                  var li = document.createElement('li');
                  li.className='legend-item';
                  li.innerHTML='<span class="legend-dot" style="background:'+colors[i%colors.length]+'"></span><span class="legend-host">'+e.label+'</span><span class="legend-size">'+e.count+' ('+p+'%)</span>';
                  operLegend.appendChild(li);
                });
              }
              try{ attachPieInteractions(operPie, segments, opTotal); }catch(_){}
            } else {
              hideChart(operPie, operEmpty, operLegend, '업무운영 데이터가 없습니다.');
            }
          }).catch(function(){
            hideChart(statPie, statEmpty, statLegendEl, '데이터를 불러올 수 없습니다.');
            hideChart(operPie, operEmpty, operLegend, '데이터를 불러올 수 없습니다.');
          });
        }catch(_){ }
      })();
      // Removed legacy Version Donut rendering (HTML no longer includes this chart)
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

      // Flatpickr (calendar) loader
      var FLATPICKR_CSS='/static/vendor/flatpickr/4.6.13/flatpickr.min.css';
      var FLATPICKR_THEME='/static/vendor/flatpickr/4.6.13/themes/airbnb.css';
      var FLATPICKR_JS='/static/vendor/flatpickr/4.6.13/flatpickr.min.js';
      var FLATPICKR_KO='/static/vendor/flatpickr/4.6.13/l10n/ko.js';
      function _ensureCss(href,id){var e=document.getElementById(id);if(e&&e.tagName.toLowerCase()==='link'){if(e.getAttribute('href')!==href)e.setAttribute('href',href);return;}var l=document.createElement('link');l.rel='stylesheet';l.href=href;l.id=id;document.head.appendChild(l);}
      function _loadScript(src){return new Promise(function(ok,fail){var s=document.createElement('script');s.src=src;s.async=true;s.onload=ok;s.onerror=function(){fail(new Error('load:'+src));};document.head.appendChild(s);});}
      function _ensureFlatpickr(){_ensureCss(FLATPICKR_CSS,'flatpickr-css');_ensureCss(FLATPICKR_THEME,'flatpickr-theme-css');if(window.flatpickr)return Promise.resolve();return _loadScript(FLATPICKR_JS).then(function(){return _loadScript(FLATPICKR_KO).catch(function(){});});}
      function initDatePickers(formId){var form=document.getElementById(formId);if(!form)return;_ensureFlatpickr().then(function(){var startEl=form.querySelector('[name="release_date"]');var endEl=form.querySelector('[name="eosl"]');function addToday(fp){var cal=fp&&fp.calendarContainer;if(!cal||cal.querySelector('.fp-today-btn'))return;var b=document.createElement('button');b.type='button';b.className='fp-today-btn';b.textContent='\uc624\ub298';b.addEventListener('click',function(){fp.setDate(new Date(),true);});cal.appendChild(b);}var opts={locale:(window.flatpickr&&window.flatpickr.l10ns&&window.flatpickr.l10ns.ko)?window.flatpickr.l10ns.ko:'ko',dateFormat:'Y-m-d',allowInput:true,disableMobile:true,onReady:function(_,__,inst){addToday(inst);},onOpen:function(_,__,inst){addToday(inst);}};if(startEl&&!startEl._flatpickr)window.flatpickr(startEl,opts);if(endEl&&!endEl._flatpickr)window.flatpickr(endEl,opts);}).catch(function(){});}
  
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
          model:'모델명', vendor:'제조사', hw_type:'유형', release_date:'릴리즈 일자', eosl:'EOSL 일자', qty:'수량', note:'비고'
        };
        function generateOsField(col, value){
          if(col==='release_date' || col==='eosl'){
            return '<input name="'+col+'" type="text" class="form-input date-input" value="'+(value||'')+'" placeholder="YYYY-MM-DD">';
          }
          if(col==='hw_type'){
            var v = String(value||'');
            var opts = ['', '유닉스', '리눅스', '윈도우', '임베디드'];
            return '<select name="hw_type" class="form-input search-select" data-searchable="true" data-placeholder="선택">'+opts.map(function(o){ return '<option value="'+o+'" '+(o===v?'selected':'')+'>'+(o===''?'선택':o)+'</option>'; }).join('')+'</select>';
          }
          if(col==='qty'){
            return '<input name="qty" type="number" min="0" step="1" class="form-input qty-dashed-lock" value="'+(value||'')+'" placeholder="0">';
          }
          if(col==='note'){
            return '<textarea name="note" class="form-input textarea-large" rows="6">'+(value||'')+'</textarea>';
          }
          return '<input name="'+col+'" class="form-input" value="'+(value||'')+'">';
        }
        function getText(id){ var el=document.getElementById(id); return el? (el.textContent||'').trim() : ''; }
        var current = {
          model: getText('os-model'),
          vendor: getText('os-vendor'),
          hw_type: getText('os-type'),
          release_date: getText('os-release-date'),
          eosl: getText('os-eosl'),
          qty: getText('os-qty'),
          note: getText('os-note')
        };
        form.innerHTML = '';
        var section=document.createElement('div'); section.className='form-section';
  section.innerHTML = '<div class="section-header"><h4>데이터베이스</h4></div>';
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
          setText('os-type', val('hw_type'));
          setText('os-release-date', val('release_date'));
          setText('os-eosl', val('eosl'));
          setText('os-qty', val('qty'));
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
      // Wire the Basic Info edit modal open/close/save
      (function(){
        function openModalLocal(id){ var el=document.getElementById(id); if(!el) return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden','false'); }
        function closeModalLocal(id){ var el=document.getElementById(id); if(!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } }
        var openBtn = document.getElementById(EDIT_OPEN_ID);
        if(openBtn){ openBtn.addEventListener('click', function(){ buildEditFormFromPage(); openModalLocal(EDIT_MODAL_ID); initDatePickers(EDIT_FORM_ID); }); }
        var closeBtn = document.getElementById(EDIT_CLOSE_ID);
        if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalLocal(EDIT_MODAL_ID); }); }
        var modalEl = document.getElementById(EDIT_MODAL_ID);
        if(modalEl){ modalEl.addEventListener('click', function(e){ if(e.target === modalEl) closeModalLocal(EDIT_MODAL_ID); }); document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(EDIT_MODAL_ID); }); }
        var saveBtn = document.getElementById(EDIT_SAVE_ID);
        if(saveBtn){ saveBtn.addEventListener('click', function(){
          var form = document.getElementById(EDIT_FORM_ID); if(!form) return;
          function fv(name){ var el=form.querySelector('[name="'+name+'"]'); return el ? el.value : ''; }
          var vendorCodeEl = document.getElementById('cat-sw-vendor-code');
          var vendorCode = vendorCodeEl ? vendorCodeEl.value.trim() : '';
          var payload = { model: fv('model'), release_date: fv('release_date'), eosl: fv('eosl'), note: fv('note') };
          if(vendorCode){ payload.vendor_code = vendorCode; } else { payload.vendor = fv('vendor'); }
          var m = (location.pathname||'').match(/\/p\/(\w+)/);
          var key = m ? m[1] : ''; key = key.replace(/_(detail|system|task|log|file)$/,'');
          var apiMap = {
            cat_sw_os:'/api/sw-os-types/',
            cat_sw_database:'/api/sw-db-types/',
            cat_sw_middleware:'/api/sw-middleware-types/',
            cat_sw_virtualization:'/api/sw-virtual-types/',
            cat_sw_security:'/api/sw-security-types/',
            cat_sw_high_availability:'/api/sw-ha-types/'
          };
          var apiBase = apiMap[key] || '';
          var idEl = document.getElementById('cat-sw-item-id');
          var id = idEl ? idEl.value.trim() : '';
          if(apiBase && id){
            fetch(apiBase + encodeURIComponent(id), {
              method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
            }).then(function(r){ return r.json(); }).then(function(data){
              if(data.success){ updatePageFromForm(); closeModalLocal(EDIT_MODAL_ID); }
              else { alert(data.message || '저장에 실패했습니다.'); }
            }).catch(function(err){ alert('저장 중 오류가 발생했습니다.'); console.error(err); });
          } else { updatePageFromForm(); closeModalLocal(EDIT_MODAL_ID); }
        }); }
      })();

      // [Tabs moved to /static/js/_detail/tab*.js]

  
      // [Tabs moved to /static/js/_detail/tab*.js]

      
      // [Tabs moved to /static/js/_detail/tab*.js]

      // ---------- Hardware/Allocation table interactions (system tab) ----------
      (function(){
  		if(window.BlossomTab41System && typeof window.BlossomTab41System.initAllocationTable === 'function'){
  			try{ window.BlossomTab41System.initAllocationTable(); }catch(_){ }
  		}
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
  
    // No modal APIs to expose
  })();
  

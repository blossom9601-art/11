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

  function ready(fn){ if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', fn); else fn(); document.addEventListener('blossom:pageLoaded',function(){try{fn();}catch(_){}}); }

  var _kd = {};  // keydown guard: maps modal-id → true once registered

  ready(function(){
      // Helper: render an animated no-data image (Lottie JSON preferred) into a container
      function showNoDataImage(container, altText){
        try{
          if(!container) return;
          container.innerHTML = '';
          var wrap = document.createElement('span');
          wrap.style.display = 'flex'; wrap.style.alignItems = 'center'; wrap.style.justifyContent = 'center';
          wrap.style.padding = '12px 0'; wrap.style.minHeight = '140px'; wrap.style.width = '100%';
          wrap.style.boxSizing = 'border-box'; wrap.style.flexDirection = 'column';
          var jsonPath = '/static/image/svg/free-animated-no-data.json';
          function renderLottie(){
            try{
              if(!window.lottie) return false;
              var animBox = document.createElement('span');
              animBox.style.display = 'inline-block'; animBox.style.width = '240px'; animBox.style.maxWidth = '100%';
              animBox.style.height = '180px'; animBox.style.pointerEvents = 'none';
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
                '/static/image/svg/free-animated-no-data/no-data.svg','/static/image/svg/free-animated-no-data.svg',
                '/static/image/svg/free-animated-no-data/no-data.gif','/static/image/svg/free-animated-no-data.gif'
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

      // Render vendor system stats pie chart (HW / SW / Component) or no-data animation
      // ── helper: get vendor ID from sessionStorage or query string ──
      function _toPosInt(v){ var n=parseInt(String(v||''),10); return (!isNaN(n)&&isFinite(n)&&n>0)?n:null; }
      function _getVid(){
        try{ var raw=sessionStorage.getItem('maintenance:context'); if(raw){ var o=JSON.parse(raw); var v=_toPosInt(o&&o.id); if(v) return v; } }catch(_){}
        try{ var sp=new URLSearchParams(location.search); return _toPosInt(sp.get('vendor_id'))||_toPosInt(sp.get('vendorId'))||_toPosInt(sp.get('id')); }catch(_){ return null; }
      }
      function _renderPie(hwQty, swQty, compQty){
        try{
          var total = hwQty + swQty + compQty;
          var pie = document.getElementById('sys-pie');
          var empty = document.getElementById('sys-empty');
          var legendEl = null; try{ if(pie && pie.parentElement){ legendEl = pie.parentElement.querySelector('.pie-legend'); } }catch(_){ }
          if(total <= 0){
            if(pie){ pie.style.display='none'; }
            if(legendEl){ legendEl.style.display='none'; }
            if(empty){
              empty.style.display='';
              try{ showNoDataImage(empty, '할당 시스템 내역이 없습니다.\n시스템 탭에서 시스템을 할당하세요.'); }catch(_s){}
            }
          } else {
            if(empty){ empty.style.display='none'; }
            if(pie){ pie.style.display=''; pie.style.visibility=''; }
            if(legendEl){ legendEl.style.display=''; }
            function pct(n){ return Math.round((n*100)/(total||1)); }
            var hwLeg = document.getElementById('sys-hw-legend'); if(hwLeg) hwLeg.textContent = hwQty+' ('+pct(hwQty)+'%)';
            var swLeg = document.getElementById('sys-sw-legend'); if(swLeg) swLeg.textContent = swQty+' ('+pct(swQty)+'%)';
            var compLeg = document.getElementById('sys-comp-legend'); if(compLeg) compLeg.textContent = compQty+' ('+pct(compQty)+'%)';
            if(pie){
              var hwDeg = Math.round((hwQty*360)/total);
              var swDeg = hwDeg + Math.round((swQty*360)/total);
              if(swDeg > 360) swDeg = 360;
              pie.style.setProperty('--deg-run', hwDeg+'deg');
              pie.style.setProperty('--deg-idle', swDeg+'deg');
            }
          }
        }catch(_){ }
      }
      (function fetchAndRenderBasicInfo(){
        var vid = _getVid();
        if(!vid){ _renderPie(0,0,0); return; }
        fetch('/api/vendor-maintenance/'+vid, {credentials:'same-origin'})
          .then(function(r){ return r.json(); })
          .then(function(d){
            if(!d||!d.success) return;
            var it = d.item||{};
            // populate basic-info spans
            var setText = function(id,v){ var el=document.getElementById(id); if(el) el.textContent=(v!=null?String(v):'-'); };
            setText('mf-vendor', it.vendor||it.maintenance_name||'-');
            setText('mf-address', it.address||'-');
            setText('mf-business-number', it.business_number||'-');
            setText('mf-call-center', it.call_center||'-');
            setText('mf-hardware-qty', it.hardware_qty||0);
            setText('mf-software-qty', it.software_qty||0);
            setText('mf-component-qty', it.component_qty||0);
            setText('mf-note', it.note||it.remark||'-');
            _renderPie(it.hardware_qty||0, it.software_qty||0, it.component_qty||0);
            // update sessionStorage with fresh data
            try{ sessionStorage.setItem('maintenance:context', JSON.stringify(it)); }catch(_){}
          })
          .catch(function(){ _renderPie(0,0,0); });
      })();

    // ---------- Maintenance: vendor context continuity (URL <-> sessionStorage) ----------
    function toPosInt(v){
      var n = parseInt(String(v||''), 10);
      return (!isNaN(n) && isFinite(n) && n > 0) ? n : null;
    }
    function getVendorIdFromSession(){
      try{
        var raw = sessionStorage.getItem('maintenance:context');
        if(!raw) return null;
        var obj = JSON.parse(raw);
        return toPosInt(obj && obj.id);
      }catch(_){ return null; }
    }
    function getVendorIdFromQuery(){
      try{
        var qs = (typeof location !== 'undefined' && location.search) ? location.search : '';
        if(!qs) return null;
        var sp = new URLSearchParams(qs);
        return (
          toPosInt(sp.get('vendor_id'))
          || toPosInt(sp.get('vendorId'))
          || toPosInt(sp.get('id'))
        );
      }catch(_){ return null; }
    }

      /* ── Edit modal: open / save ── */
      (function initEditModal(){
        var editBtn = document.getElementById('detail-edit-open');
        var modal = document.getElementById('system-edit-modal');
        var closeBtn = document.getElementById('system-edit-close');
        var saveBtn = document.getElementById('system-edit-save');
        var form = document.getElementById('system-edit-form');
        if(!editBtn || !modal) return;

        function getVendorData(){
          try{ var raw=sessionStorage.getItem('maintenance:context'); return raw ? JSON.parse(raw) : null; }catch(_){ return null; }
        }
        function escapeHtml(str){
          var div=document.createElement('div'); div.appendChild(document.createTextNode(str)); return div.innerHTML;
        }

        function openModal(){
          var v = getVendorData();
          if(!v){ alert('유지보수사 정보를 불러오는 중입니다.'); return; }
          if(form) form.innerHTML = '';
          var fields = [
            { name:'vendor', label:'유지보수사', value: v.vendor || v.maintenance_name || '', wide:false, required:true, type:'input' },
            { name:'address', label:'주소', value: v.address || '', wide:false, required:false, type:'input' },
            { name:'business_number', label:'사업자번호', value: v.business_number || v.business_no || '', wide:false, required:false, type:'input' },
            { name:'call_center', label:'고객센터', value: v.call_center || '', wide:false, required:false, type:'input' },
            { name:'note', label:'비고', value: v.note || v.remark || '', wide:true, required:false, type:'textarea' }
          ];
          var section = document.createElement('div'); section.className='form-section';
          section.innerHTML='<div class="section-header"><h4>유지보수사</h4></div>';
          var grid = document.createElement('div'); grid.className='form-grid';
          fields.forEach(function(f){
            var row = document.createElement('div');
            row.className = f.wide ? 'form-row form-row-wide' : 'form-row';
            var reqSpan = f.required ? '<span class="required">*</span>' : '';
            var inputHtml = '';
            if(f.type==='textarea'){
              inputHtml = '<textarea name="'+f.name+'" class="form-input textarea-large" rows="6">'+escapeHtml(String(f.value))+'</textarea>';
            } else {
              inputHtml = '<input name="'+f.name+'" class="form-input" value="'+escapeHtml(String(f.value))+'" data-fk-ignore="1">';
            }
            row.innerHTML = '<label>'+f.label+reqSpan+'</label>'+inputHtml;
            grid.appendChild(row);
          });
          section.appendChild(grid);
          if(form) form.appendChild(section);
          modal.setAttribute('aria-hidden','false');
          modal.classList.add('show');
          document.body.style.overflow='hidden';
        }
        function closeModal(){
          modal.setAttribute('aria-hidden','true');
          modal.classList.remove('show');
          document.body.style.overflow='';
        }
        function saveRecord(){
          var vid = _getVid();
          if(!vid){ alert('유지보수사 ID를 확인할 수 없습니다.'); return; }
          if(!form) return;
          var fd = new FormData(form);
          var payload = {};
          fd.forEach(function(val, key){ payload[key] = val; });
          if(!(payload.vendor||'').trim()){ alert('유지보수사명을 입력하세요.'); return; }
          fetch('/api/vendor-maintenance/'+vid, {
            method:'PUT',
            credentials:'same-origin',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify(payload)
          }).then(function(r){ return r.json(); }).then(function(d){
            if(d && d.success){
              // Refresh displayed fields
              var setText = function(id, val){ var el=document.getElementById(id); if(el) el.textContent=val||'-'; };
              setText('mf-vendor', payload.vendor);
              setText('mf-address', payload.address);
              setText('mf-business-number', payload.business_number);
              setText('mf-call-center', payload.call_center);
              setText('mf-note', payload.note);
              // Update header
              var hTitle = document.getElementById('page-header-title');
              if(hTitle) hTitle.textContent = payload.vendor || '유지보수사';
              var hSub = document.getElementById('page-header-subtitle');
              if(hSub) hSub.textContent = payload.business_number || '-';
              // Update sessionStorage
              try{
                var ctx = JSON.parse(sessionStorage.getItem('maintenance:context')||'{}');
                Object.assign(ctx, {
                  vendor: payload.vendor,
                  maintenance_name: payload.vendor,
                  address: payload.address,
                  business_number: payload.business_number,
                  call_center: payload.call_center,
                  note: payload.note
                });
                sessionStorage.setItem('maintenance:context', JSON.stringify(ctx));
              }catch(_){}
              closeModal();
            } else {
              alert((d && d.message) || '저장 중 오류가 발생했습니다.');
            }
          }).catch(function(e){
            alert('저장 중 오류가 발생했습니다: '+(e.message||e));
          });
        }
        editBtn.addEventListener('click', openModal);
        if(closeBtn) closeBtn.addEventListener('click', closeModal);
        if(saveBtn) saveBtn.addEventListener('click', saveRecord);
        modal.addEventListener('click', function(e){ if(e.target === modal) closeModal(); });
      })();

        });
      })();

      // ── 유지보수 비용 통계 (월별 에어리어 차트) ──────────────────────────────
      (function renderCostStats(){
        var vid = _getVid();
        var chartEl = document.getElementById('cost-bar-chart');
        var emptyEl = document.getElementById('cost-empty');
        var yearSel = document.getElementById('cost-year-select');
        if(!chartEl) return;
        if(!vid){ if(emptyEl) emptyEl.style.display=''; return; }

        var MONTH_LABELS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

        function fmt(n){ return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g,','); }
        function fmtShort(n){
          if(n>=100000000){
            var eok=n/100000000;
            return (eok===Math.floor(eok)) ? eok+'억' : eok.toFixed(1).replace(/\.0$/,'')+'억';
          }
          if(n>=10000){
            var man=n/10000;
            return (man===Math.floor(man)) ? man+'만' : man.toFixed(0)+'만';
          }
          return fmt(n);
        }

        function renderAreaChart(months){
          var grand = months.reduce(function(a,m){ return a+m.total; },0);
          if(grand<=0){
            if(emptyEl){ emptyEl.style.display=''; try{ showNoDataImage(emptyEl,'비용 데이터가 없습니다.'); }catch(_){} }
            chartEl.style.display='none';
            return;
          }
          if(emptyEl) emptyEl.style.display='none';
          chartEl.style.display='';

          var rawMax = Math.max.apply(null, months.map(function(m){ return m.total; })) || 1;
          // Compute a nice round ceiling so the peak never sits above/at the top axis line
          function niceCeil(v){
            if(v<=0) return 1;
            var mag = Math.pow(10, Math.floor(Math.log10(v)));
            var norm = v / mag;  // 1.0 ~ 9.999
            // pick the nearest nice step above norm
            var steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
            for(var i=0;i<steps.length;i++){
              if(steps[i] >= norm * 1.05) return steps[i] * mag;
            }
            return 10 * mag;
          }
          var maxTotal = niceCeil(rawMax);

          var W = 600, H = 260;
          var padL = 50, padR = 14, padT = 18, padB = 32;
          var plotW = W - padL - padR;
          var plotH = H - padT - padB;

          var pts = months.map(function(mo, i){
            var x = padL + (i / 11) * plotW;
            var y = padT + plotH - (mo.total / maxTotal) * plotH;
            return {x: x, y: y, val: mo.total, label: MONTH_LABELS[i]};
          });

          // monotone cubic Hermite spline
          function monotonePath(points){
            var n = points.length;
            if(n < 2) return 'M'+points[0].x+','+points[0].y;
            var dx = [], dy = [], m = [];
            for(var i=0;i<n-1;i++){ dx[i]=points[i+1].x-points[i].x; dy[i]=points[i+1].y-points[i].y; m[i]=dy[i]/dx[i]; }
            var tan = [m[0]];
            for(var i=1;i<n-1;i++){ tan[i] = (m[i-1]*m[i]<=0) ? 0 : (m[i-1]+m[i])/2; }
            tan[n-1] = m[n-2];
            for(var i=0;i<n-1;i++){
              if(Math.abs(m[i])<1e-9){ tan[i]=0; tan[i+1]=0; continue; }
              var a=tan[i]/m[i], b=tan[i+1]/m[i], s=a*a+b*b;
              if(s>9){ var t=3/Math.sqrt(s); tan[i]=t*a*m[i]; tan[i+1]=t*b*m[i]; }
            }
            var d = 'M'+points[0].x.toFixed(1)+','+points[0].y.toFixed(1);
            for(var i=0;i<n-1;i++){
              var seg=dx[i]/3;
              d += ' C'+(points[i].x+seg).toFixed(1)+','+(points[i].y+tan[i]*seg).toFixed(1)+' '+(points[i+1].x-seg).toFixed(1)+','+(points[i+1].y-tan[i+1]*seg).toFixed(1)+' '+points[i+1].x.toFixed(1)+','+points[i+1].y.toFixed(1);
            }
            return d;
          }

          var linePath = monotonePath(pts);
          var areaPath = linePath + ' L'+pts[pts.length-1].x.toFixed(1)+','+(padT+plotH)+' L'+pts[0].x.toFixed(1)+','+(padT+plotH)+' Z';

          var uid = 'ac'+Math.random().toString(36).substr(2,6);
          var svgNS = 'http://www.w3.org/2000/svg';

          var svg = document.createElementNS(svgNS, 'svg');
          svg.setAttribute('viewBox', '0 0 '+W+' '+H);
          svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
          svg.style.cssText = 'width:100%;height:auto;display:block;margin:auto;';

          // ── defs ──
          var defs = document.createElementNS(svgNS, 'defs');
          // soft area gradient
          var aGrad = document.createElementNS(svgNS, 'linearGradient');
          aGrad.setAttribute('id', uid+'_ag'); aGrad.setAttribute('x1','0'); aGrad.setAttribute('y1','0'); aGrad.setAttribute('x2','0'); aGrad.setAttribute('y2','1');
          [{o:0,op:'0.18'},{o:60,op:'0.08'},{o:100,op:'0.01'}].forEach(function(s){
            var st = document.createElementNS(svgNS,'stop');
            st.setAttribute('offset',s.o+'%'); st.setAttribute('stop-color','#818cf8'); st.setAttribute('stop-opacity',s.op);
            aGrad.appendChild(st);
          });
          defs.appendChild(aGrad);
          svg.appendChild(defs);

          // ── Y-axis labels + grid ──
          var yTicks = 4;
          for(var yi=0; yi<=yTicks; yi++){
            var yVal = maxTotal * (1 - yi/yTicks);
            var yy = padT + (plotH/yTicks)*yi;
            // grid line (very faint)
            var gl = document.createElementNS(svgNS, 'line');
            gl.setAttribute('x1', padL); gl.setAttribute('x2', padL+plotW);
            gl.setAttribute('y1', yy); gl.setAttribute('y2', yy);
            gl.setAttribute('stroke', yi===yTicks ? '#e2e8f0' : '#f1f5f9');
            gl.setAttribute('stroke-width', yi===yTicks ? '1' : '0.7');
            svg.appendChild(gl);
            // label
            var yt = document.createElementNS(svgNS, 'text');
            yt.setAttribute('x', padL-8); yt.setAttribute('y', yy+3.5);
            yt.setAttribute('text-anchor','end'); yt.setAttribute('font-size','9');
            yt.setAttribute('fill','#b0b8c4'); yt.setAttribute('font-family','inherit');
            yt.textContent = fmtShort(Math.round(yVal));
            svg.appendChild(yt);
          }

          // ── area fill ──
          var areaEl = document.createElementNS(svgNS, 'path');
          areaEl.setAttribute('d', areaPath);
          areaEl.setAttribute('fill', 'url(#'+uid+'_ag)');
          svg.appendChild(areaEl);

          // ── line (thin, single color) ──
          var lineEl = document.createElementNS(svgNS, 'path');
          lineEl.setAttribute('d', linePath);
          lineEl.setAttribute('fill', 'none');
          lineEl.setAttribute('stroke', '#818cf8');
          lineEl.setAttribute('stroke-width', '1.8');
          lineEl.setAttribute('stroke-linecap', 'round');
          lineEl.setAttribute('stroke-linejoin', 'round');
          svg.appendChild(lineEl);

          // ── guide + tooltip layer ──
          var guideGroup = document.createElementNS(svgNS, 'g');
          svg.appendChild(guideGroup);

          var tipWrap = document.createElement('div');
          tipWrap.style.cssText = 'position:relative;width:100%;';
          var tipEl = document.createElement('div');
          tipEl.style.cssText = 'position:absolute;pointer-events:none;opacity:0;transition:opacity .2s;background:#fff;color:#334155;font-size:11px;padding:7px 12px;border-radius:8px;white-space:nowrap;z-index:10;box-shadow:0 2px 8px rgba(0,0,0,.08);border:1px solid #e2e8f0;transform:translateX(-50%);line-height:1.6;';
          tipWrap.appendChild(tipEl);

          // ── dots (small, appear on hover) ──
          var dotEls = [];
          pts.forEach(function(p){
            var c = document.createElementNS(svgNS, 'circle');
            c.setAttribute('cx', p.x); c.setAttribute('cy', p.y);
            c.setAttribute('r', '0');
            c.setAttribute('fill', '#fff');
            c.setAttribute('stroke', '#818cf8');
            c.setAttribute('stroke-width', '1.8');
            c.style.transition = 'r .2s ease';
            svg.appendChild(c);
            dotEls.push(c);
          });

          // ── X-axis labels ──
          pts.forEach(function(p){
            var t = document.createElementNS(svgNS, 'text');
            t.setAttribute('x', p.x); t.setAttribute('y', padT+plotH+18);
            t.setAttribute('text-anchor','middle'); t.setAttribute('font-size','9.5');
            t.setAttribute('fill','#b0b8c4'); t.setAttribute('font-family','inherit');
            t.textContent = p.label;
            svg.appendChild(t);
          });

          // ── hover zones ──
          pts.forEach(function(p, idx){
            var rw = plotW / 12;
            var rect = document.createElementNS(svgNS, 'rect');
            rect.setAttribute('x', p.x - rw/2); rect.setAttribute('y', padT);
            rect.setAttribute('width', rw); rect.setAttribute('height', plotH + padB);
            rect.setAttribute('fill', 'transparent');
            rect.style.cursor = 'default';

            rect.addEventListener('mouseenter', function(){
              dotEls[idx].setAttribute('r','3.5');
              guideGroup.innerHTML = '';
              var vl = document.createElementNS(svgNS, 'line');
              vl.setAttribute('x1', p.x); vl.setAttribute('x2', p.x);
              vl.setAttribute('y1', p.y); vl.setAttribute('y2', padT+plotH);
              vl.setAttribute('stroke','#cbd5e1'); vl.setAttribute('stroke-width','0.8');
              vl.setAttribute('stroke-dasharray','3,2');
              guideGroup.appendChild(vl);
              tipEl.innerHTML = '<span style="color:#94a3b8;">'+p.label+'</span>&nbsp;&nbsp;<span style="font-weight:600;">'+fmt(p.val)+'</span><span style="color:#94a3b8;font-size:10px;"> 원</span>';
              tipEl.style.opacity = '1';
              tipEl.style.left = (p.x / W * 100) + '%';
              tipEl.style.bottom = '100%';
              tipEl.style.marginBottom = '4px';
            });
            rect.addEventListener('mouseleave', function(){
              dotEls[idx].setAttribute('r','0');
              guideGroup.innerHTML = '';
              tipEl.style.opacity = '0';
            });
            svg.appendChild(rect);
          });

          chartEl.innerHTML = '';
          chartEl.appendChild(tipWrap);
          tipWrap.insertBefore(svg, tipEl);
        }

        function drawChart(year){
          fetch('/api/vendor-maintenance/'+vid+'/cost-stats?year='+year,{credentials:'same-origin'})
            .then(function(r){ return r.json(); })
            .then(function(d){
              if(!d||!d.success) return;
              renderAreaChart(d.months||[]);
            })
            .catch(function(){ if(emptyEl) emptyEl.style.display=''; });
        }

        // Initial fetch to populate year dropdown then draw
        fetch('/api/vendor-maintenance/'+vid+'/cost-stats',{credentials:'same-origin'})
          .then(function(r){ return r.json(); })
          .then(function(d){
            if(!d||!d.success) return;
            var avail = d.available_years||[];
            var selYear = d.year;
            if(yearSel){
              yearSel.innerHTML = '';
              avail.forEach(function(y){
                var opt = document.createElement('option'); opt.value=y; opt.textContent=y+'년';
                if(y===selYear) opt.selected=true;
                yearSel.appendChild(opt);
              });
              yearSel.addEventListener('change', function(){ drawChart(parseInt(yearSel.value,10)); });
            }
            renderAreaChart(d.months||[]);
          })
          .catch(function(){ if(emptyEl) emptyEl.style.display=''; });
      })();
            // Vendor Software schema: guard by data-context
            (function(){
              const hwTable = document.getElementById('hw-spec-table');
              if (!hwTable) return;
              const ctx = (hwTable.getAttribute('data-context')||'').toLowerCase();
              if (ctx !== 'vendor-sw') return;

              // tab94 공통 소프트웨어 컴포넌트로 이전됨.
              // 유지보수사 소프트웨어 탭은 별도 inline 초기화 없이 공통 라우트/모듈이 처리한다.
              return;
            })();
        /*
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
          if(modalEl){ modalEl.addEventListener('click', function(e){ if(e.target===modalEl) closeModalLocal(modalId); }); if(!_kd[modalId]){_kd[modalId]=true; document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(modalId); });} }
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
      */
  
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

          // Resolve vendor context (selected from list page)
          function getVendorId(){
            try{
              var raw = sessionStorage.getItem('maintenance:context');
              if(!raw) return null;
              var obj = JSON.parse(raw);
              var id = obj && obj.id;
              var n = parseInt(id, 10);
              return (isNaN(n) || n<=0) ? null : n;
            }catch(_){ return null; }
          }
          var vendorId = getVendorId();
          var API_BASE = '/api/vendor-maintenance';
          function apiUrl(suffix){ return API_BASE + '/' + vendorId + '/software' + (suffix||''); }
          async function apiFetch(url, options){
            var opts = options || {};
            opts.headers = Object.assign({ 'Content-Type':'application/json' }, opts.headers||{});
            var res = await fetch(url, opts);
            var data = null;
            try{ data = await res.json(); }catch(_){ data = null; }
            if(!res.ok || (data && data.success === false)){
              var msg = (data && data.message) ? data.message : ('HTTP '+res.status);
              throw new Error(msg);
            }
            return data;
          }
          function toast(msg, type){ try{ if(window.showToast) showToast(msg, type||'info'); else alert(msg); }catch(_){ } }
          function swBuildSavedRow(item){
            var tr = document.createElement('tr');
            tr.setAttribute('data-id', String(item.id||''));
            tr.innerHTML = ''
              + '<td><input type="checkbox" class="hw-row-check" aria-label="행 선택"></td>'
              + '<td data-col="status">'+(item.status||'-')+'</td>'
              + '<td data-col="category">'+(item.category||'-')+'</td>'
              + '<td data-col="model">'+(item.model||'-')+'</td>'
              + '<td data-col="type">'+(item.type||'-')+'</td>'
              + '<td data-col="mgmt_no">'+(item.mgmt_no||'-')+'</td>'
              + '<td data-col="serial_no">'+(item.serial_no||'-')+'</td>'
              + '<td data-col="remark">'+(item.remark||'-')+'</td>'
              + '<td class="system-actions table-actions">'
              +   '<button class="action-btn js-sw-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button>'
              +   '<button class="action-btn danger js-sw-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'
              + '</td>';
            return tr;
          }
          async function loadInitialRows(){
            if(!vendorId) return;
            try{
              var tbody = table.querySelector('tbody');
              if(!tbody) return;
              var data = await apiFetch(apiUrl(''), { method:'GET' });
              var items = (data && data.items) ? data.items : [];
              tbody.innerHTML = '';
              items.forEach(function(it){ tbody.appendChild(swBuildSavedRow(it)); });
            }catch(err){
              console.error(err);
              toast('유지보수사 소프트웨어 목록을 불러오지 못했습니다.', 'error');
            }
          }

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
          loadInitialRows().finally(function(){ updateEmptyState(); });

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
            if(target.classList.contains('js-sw-del')){
              (function(){
                var idRaw = tr.getAttribute('data-id');
                var id = parseInt(idRaw, 10);
                if(vendorId && idRaw && !isNaN(id) && id>0){
                  apiFetch(apiUrl('/'+id), { method:'DELETE' }).then(function(){
                    if(tr && tr.parentNode){ tr.parentNode.removeChild(tr); }
                    try{ swClampPage(); }catch(_){ }
                    updateEmptyState();
                  }).catch(function(err){
                    console.error(err);
                    toast('삭제 중 오류가 발생했습니다.', 'error');
                  });
                  return;
                }
                if(tr && tr.parentNode){ tr.parentNode.removeChild(tr); }
                try{ swClampPage(); }catch(_){ }
                updateEmptyState();
              })();
              return;
            }
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
              var payload = {
                status: read('status'),
                category: catVal,
                model: modelVal,
                type: typeVal,
                mgmt_no: read('mgmt_no'),
                serial_no: read('serial_no'),
                remark: read('remark')
              };
              var toggleBtn = tr.querySelector('.js-sw-toggle');
              function finalizeSaved(){
                if(toggleBtn){ toggleBtn.setAttribute('data-action','edit'); toggleBtn.title='편집'; toggleBtn.setAttribute('aria-label','편집'); toggleBtn.innerHTML='<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon">'; }
                updateEmptyState();
                var cb = tr.querySelector('.hw-row-check'); if(cb){ var hidden = tr.hasAttribute('data-hidden') || tr.style.display==='none'; tr.classList.toggle('selected', !!cb.checked && !hidden); }
              }
              if(!vendorId){ finalizeSaved(); return; }
              var existingId = parseInt(tr.getAttribute('data-id')||'', 10);
              if(!isNaN(existingId) && existingId>0){
                apiFetch(apiUrl('/'+existingId), { method:'PUT', body: JSON.stringify(payload) }).then(function(resp){
                  try{ if(resp && resp.item && resp.item.id){ tr.setAttribute('data-id', String(resp.item.id)); } }catch(_){ }
                  finalizeSaved();
                }).catch(function(err){
                  console.error(err);
                  toast('저장 중 오류가 발생했습니다.', 'error');
                });
              } else {
                apiFetch(apiUrl(''), { method:'POST', body: JSON.stringify(payload) }).then(function(resp){
                  try{ if(resp && resp.item && resp.item.id){ tr.setAttribute('data-id', String(resp.item.id)); } }catch(_){ }
                  finalizeSaved();
                }).catch(function(err){
                  console.error(err);
                  toast('저장 중 오류가 발생했습니다.', 'error');
                });
              }
              return;
            }
          });

          // CSV helpers for vendor SW
          function swEscapeCSV(val){ return '"' + String(val).replace(/"/g,'""') + '"'; }
          function swRowSaved(tr){ var t=tr.querySelector('.js-sw-toggle'); var inEdit=t && t.getAttribute('data-action')==='save'; if(inEdit) return false; return !tr.querySelector('td[data-col] input, td[data-col] select, td[data-col] textarea'); }
          function swVisibleRows(){ var tbody=table.querySelector('tbody'); if(!tbody) return []; return Array.from(tbody.querySelectorAll('tr')).filter(function(tr){ return !(tr.hasAttribute('data-hidden') || tr.style.display==='none'); }); }
          function swSavedVisibleRows(){ return swVisibleRows().filter(swRowSaved); }
          function swExportCSV(onlySelected){ var tbody=table.querySelector('tbody'); if(!tbody) return; var headers=['계약상태','구분','모델명','유형','관리번호','일련번호','비고']; var trs=swSavedVisibleRows(); if(onlySelected){ trs = trs.filter(function(tr){ var cb=tr.querySelector('.hw-row-check'); return cb && cb.checked; }); } if(trs.length===0) return; function text(tr,col){ var td=tr.querySelector('[data-col="'+col+'"]'); return td? (td.textContent||'').trim() : ''; } var cols=['status','category','model','type','mgmt_no','serial_no','remark']; var rows = trs.map(function(tr){ return cols.map(function(c){ return text(tr,c); }); }); var lines = [headers].concat(rows).map(function(arr){ return arr.map(swEscapeCSV).join(','); }); var csv='\uFEFF'+lines.join('\r\n'); var d=new Date(); var yyyy=d.getFullYear(); var mm=String(d.getMonth()+1).padStart(2,'0'); var dd=String(d.getDate()).padStart(2,'0'); var filename='vendor_software_'+yyyy+mm+dd+'.csv'; try{ var blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); var url=URL.createObjectURL(blob); var a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); } catch(_){ var a2=document.createElement('a'); a2.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a2.download=filename; document.body.appendChild(a2); a2.click(); document.body.removeChild(a2); } }
          (function(){ var btn = document.getElementById('hw-download-btn'); var modalId='hw-download-modal'; var closeBtn=document.getElementById('hw-download-close'); var confirmBtn=document.getElementById('hw-download-confirm'); function openModalLocal(id){ var el=document.getElementById(id); if(!el) return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden','false'); } function closeModalLocal(id){ var el=document.getElementById(id); if(!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } } if(btn){ btn.addEventListener('click', function(){ if(btn.disabled) return; var saved=swSavedVisibleRows(); var total=saved.length; if(total<=0) return; var selectedCount = saved.filter(function(tr){ var cb=tr.querySelector('.hw-row-check'); return cb && cb.checked; }).length; var subtitle=document.getElementById('hw-download-subtitle'); if(subtitle){ subtitle.textContent = selectedCount>0 ? ('선택된 '+selectedCount+'개 또는 전체 '+total+'개 결과 중 범위를 선택하세요.') : ('현재 결과 '+total+'개 항목을 CSV로 내보냅니다.'); } var rowSelectedWrap=document.getElementById('hw-csv-range-row-selected'); var optSelected=document.getElementById('hw-csv-range-selected'); var optAll=document.getElementById('hw-csv-range-all'); if(rowSelectedWrap) rowSelectedWrap.hidden = !(selectedCount>0); if(optSelected){ optSelected.disabled = !(selectedCount>0); optSelected.checked = selectedCount>0; } if(optAll){ optAll.checked = !(selectedCount>0); } openModalLocal(modalId); }); } if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalLocal(modalId); }); } var modalEl=document.getElementById(modalId); if(modalEl){ modalEl.addEventListener('click', function(e){ if(e.target===modalEl) closeModalLocal(modalId); }); if(!_kd[modalId]){_kd[modalId]=true; document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(modalId); });} } if(confirmBtn){ confirmBtn.addEventListener('click', function(){ var onlySel = !!(document.getElementById('hw-csv-range-selected') && document.getElementById('hw-csv-range-selected').checked); swExportCSV(onlySel); closeModalLocal(modalId); }); } })();

          return; // handled vendor software, stop here
        })();
        // Vendor Hardware (tab43): delegate to shared script (/static/js/_detail/tab43-hardware.js)
        (function(){
          var ctx=(table.getAttribute('data-context')||'').toLowerCase();
          if(ctx!=='vendor-hw') return;
          function ensureTab43Hardware(cb){
            try{
              if(window.__blsInitTab43Hardware) return cb();
              if(window.__blsTab43HardwareLoading){
                document.addEventListener('bls:tab43HardwareReady', function(){ cb(); }, { once:true });
                return;
              }
              window.__blsTab43HardwareLoading = true;
              var s = document.createElement('script');
              s.src = '/static/js/_detail/tab43-hardware.js';
              s.async = true;
              s.onload = function(){
                window.__blsTab43HardwareLoading = false;
                try{ document.dispatchEvent(new CustomEvent('bls:tab43HardwareReady')); }catch(_){ }
                cb();
              };
              s.onerror = function(){ window.__blsTab43HardwareLoading = false; };
              document.head.appendChild(s);
            }catch(_){ }
          }
          ensureTab43Hardware(function(){
            try{ window.__blsInitTab43Hardware(); }catch(_){ }
          });
        })();
        // Vendor Components schema: guard strictly by data-context
        var __ctx = (table.getAttribute('data-context')||'').toLowerCase();
        var __isVendorCo = (__ctx==='vendor-co');
        if(__isVendorCo){
          if(window.initTab45VendorComponent){
            window.initTab45VendorComponent({
              table: table,
              vendorKind: 'maintenance',
              sessionStorageKey: 'maintenance:context'
            });
          }
          return; // handled vendor components, stop here
        }
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
            if(modalEl){ modalEl.addEventListener('click', function(e){ if(e.target===modalEl) closeModalLocal(modalId); }); if(!_kd[modalId]){_kd[modalId]=true; document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(modalId); });} }
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
          if(modalEl){ modalEl.addEventListener('click', function(e){ if(e.target===modalEl) closeModalLocal(modalId); }); if(!_kd[modalId]){_kd[modalId]=true; document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(modalId); });} }
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
  
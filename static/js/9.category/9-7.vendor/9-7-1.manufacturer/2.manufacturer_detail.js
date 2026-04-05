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
              var script = document.createElement('script'); script.src='/static/vendor/lottie/lottie.min.5.12.2.js'; script.async=true;
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
      function applyVendorSystemStats(hwQty, swQty, compQty){
        try{
          var hwEl = document.getElementById('mf-hardware-qty'); if(hwEl) hwEl.textContent = String(hwQty);
          var swEl = document.getElementById('mf-software-qty'); if(swEl) swEl.textContent = String(swQty);
          var compEl = document.getElementById('mf-component-qty'); if(compEl) compEl.textContent = String(compQty);

          var total = hwQty + swQty + compQty;
          var pie = document.getElementById('sys-pie');
          var empty = document.getElementById('sys-empty');
          var pieWrap = null; try{ if(pie) pieWrap = pie.closest('.pie-wrap'); }catch(_){ }
          var legendEl = null; try{ if(pie && pie.parentElement){ legendEl = pie.parentElement.querySelector('.pie-legend'); } }catch(_){ }
          if(total <= 0){
            if(pieWrap){ pieWrap.style.display='none'; }
            if(empty){
              empty.style.display='';
              try{ showNoDataImage(empty, '할당 시스템 내역이 없습니다.\n시스템 탭에서 시스템을 할당하세요.'); }catch(_s){}
            }
          } else {
            if(empty){ empty.style.display='none'; }
            if(pieWrap){ pieWrap.style.display=''; }
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

      /* ── Render 상태 통계 + 운영 통계 from all asset items ── */
      function renderVendorStatusStats(items){
        try{
          var pie = document.getElementById('stat-pie');
          var legendPie = document.getElementById('stat-legend');
          var emptyPie = document.getElementById('stat-empty');


          function showStatEmpty(msg){
            if(emptyPie){ emptyPie.style.display=''; try{ showNoDataImage(emptyPie, msg); }catch(_){} }
            if(pie){ pie.style.display='none'; }
            if(legendPie) legendPie.style.display='none';
          }
          if(!items || !items.length){
            showStatEmpty('할당 자산이 없습니다.');
            return;
          }

          // ── 상태 통계 pie ──
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
            showStatEmpty('할당 자산이 없습니다.');
          } else {
            if(emptyPie) emptyPie.style.display='none';
            if(pie){ pie.style.display='block'; pie.style.width='220px'; pie.style.height='220px'; pie.style.borderRadius='50%'; }
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

        }catch(_){}
      }

      // Shared: attach interactions to a conic-gradient pie element
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
            var outerR = rect.width/2;
            if(r>outerR) return {outside:true, angle:0, r:r, inner:false};
            var inner = false;
            if(hasHole){ var holeR = outerR * 0.44; inner = (r < holeR); }
            var ang = Math.atan2(dy, dx) * 180/Math.PI;
            var deg = (ang + 360) % 360;
            return {outside:false, angle:deg, r:r, inner:inner};
          }
          function findSegmentAtAngle(deg){
            for(var i=0;i<segments.length;i++){
              var s=segments[i];
              if(deg>=s.start && deg<=s.end){ return s; }
            }
            return null;
          }
          var fixedSeg = null;
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

      /* ── Populate basic-info fields & qty from the DB record + live asset counts ── */
      var _vendorId = null;  // module-scoped for edit modal
      var _vendorData = null;
      var _liveCounts = { hw: 0, sw: 0, comp: 0 };
      (function fetchVendorRecord(){
        try{
          var raw = sessionStorage.getItem('manufacturer:context');
          if(!raw){ applyVendorSystemStats(0,0,0); return; }
          var obj = JSON.parse(raw);
          var vid = obj && parseInt(obj.id, 10);
          if(!vid || isNaN(vid) || vid <= 0){ applyVendorSystemStats(0,0,0); return; }
          _vendorId = vid;

          // 1) Fetch vendor record (basic info fields)
          fetch('/api/vendor-manufacturers/' + vid, {credentials:'same-origin'})
            .then(function(r){ return r.json(); })
            .then(function(d){
              if(!d || !d.success) return;
              var v = d.item || d.data || d;
              _vendorData = v;
              // Populate basic-info card fields
              var setText = function(id, val){ var el = document.getElementById(id); if(el) el.textContent = val || '–'; };
              setText('mf-vendor', v.vendor || v.manufacturer_name);
              setText('mf-address', v.address);
              setText('mf-business-number', v.business_number || v.business_no);
              setText('mf-call-center', v.call_center);
              setText('mf-note', v.note || v.remark);
            })
            .catch(function(){});

          // 2) Fetch live asset counts + items for stats
          var base = '/api/vendor-manufacturers/' + vid;
          var done = 0;
          var _allItems = [];
          function check(){
            done++;
            if(done >= 3){
              applyVendorSystemStats(_liveCounts.hw, _liveCounts.sw, _liveCounts.comp);
              renderVendorStatusStats(_allItems);
            }
          }
          fetch(base + '/hw-assets', {credentials:'same-origin'}).then(function(r){return r.json();}).then(function(d){ if(d&&d.success){ _liveCounts.hw = d.total || (d.items||[]).length; _allItems = _allItems.concat(d.items||[]); } }).catch(function(){}).then(check);
          fetch(base + '/sw-assets', {credentials:'same-origin'}).then(function(r){return r.json();}).then(function(d){ if(d&&d.success){ _liveCounts.sw = d.total || (d.items||[]).length; _allItems = _allItems.concat(d.items||[]); } }).catch(function(){}).then(check);
          fetch(base + '/comp-assets', {credentials:'same-origin'}).then(function(r){return r.json();}).then(function(d){ if(d&&d.success){ _liveCounts.comp = d.total || (d.items||[]).length; _allItems = _allItems.concat(d.items||[]); } }).catch(function(){}).then(check);
        }catch(_){ applyVendorSystemStats(0,0,0); }
      })();

      /* ── Edit modal: open / save ── */
      (function initEditModal(){
        var editBtn = document.getElementById('detail-edit-open');
        var modal = document.getElementById('system-edit-modal');
        var closeBtn = document.getElementById('system-edit-close');
        var saveBtn = document.getElementById('system-edit-save');
        var form = document.getElementById('system-edit-form');
        if(!editBtn || !modal) return;

        function openModal(){
          if(!_vendorData){ alert('제조사 정보를 불러오는 중입니다.'); return; }
          // Build edit form
          if(form) form.innerHTML = '';
          var v = _vendorData;
          var fields = [
            { name:'vendor', label:'제조사', value: v.vendor || v.manufacturer_name || '', wide:false, required:true, type:'input' },
            { name:'address', label:'주소', value: v.address || '', wide:false, required:false, type:'input' },
            { name:'business_number', label:'사업자번호', value: v.business_number || v.business_no || '', wide:false, required:false, type:'input' },
            { name:'call_center', label:'고객센터', value: v.call_center || '', wide:false, required:false, type:'input' },
            { name:'note', label:'비고', value: v.note || v.remark || '', wide:true, required:false, type:'textarea' }
          ];
          var section = document.createElement('div'); section.className='form-section';
          section.innerHTML='<div class="section-header"><h4>제조사</h4></div>';
          var grid = document.createElement('div'); grid.className='form-grid';
          fields.forEach(function(f){
            var row = document.createElement('div');
            row.className = f.wide ? 'form-row form-row-wide' : 'form-row';
            var reqSpan = f.required ? '<span class="required">*</span>' : '';
            var inputHtml = '';
            if(f.type==='textarea'){
              inputHtml = '<textarea name="'+f.name+'" class="form-input textarea-large" rows="6">'+escapeHtml(String(f.value))+'</textarea>';
            } else if(f.type==='number'){
              inputHtml = '<input name="'+f.name+'" type="number" min="0" step="1" class="form-input" value="'+(f.value??0)+'">';
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
          if(!_vendorId){ alert('제조사 ID를 확인할 수 없습니다.'); return; }
          if(!form) return;
          var fd = new FormData(form);
          var payload = {};
          fd.forEach(function(val, key){ payload[key] = val; });
          // Require vendor name
          if(!(payload.vendor||'').trim()){ alert('제조사명을 입력하세요.'); return; }
          // Preserve live qty counts (not in the form)
          payload.hardware_qty = _liveCounts.hw;
          payload.software_qty = _liveCounts.sw;
          payload.component_qty = _liveCounts.comp;
          fetch('/api/vendor-manufacturers/'+_vendorId, {
            method:'PUT',
            credentials:'same-origin',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify(payload)
          }).then(function(r){ return r.json(); }).then(function(d){
            if(d && d.success){
              // Refresh page data — merge only form-editable fields into _vendorData
              _vendorData = Object.assign({}, _vendorData, {
                vendor: payload.vendor,
                manufacturer_name: payload.vendor,
                address: payload.address,
                business_number: payload.business_number,
                call_center: payload.call_center,
                note: payload.note
              });
              var setText = function(id, val){ var el=document.getElementById(id); if(el) el.textContent=val||'–'; };
              setText('mf-vendor', payload.vendor);
              setText('mf-address', payload.address);
              setText('mf-business-number', payload.business_number);
              setText('mf-call-center', payload.call_center);
              setText('mf-note', payload.note);
              // Qty stays as live counts — no change needed
              // Update header
              var hTitle = document.getElementById('page-header-title');
              if(hTitle) hTitle.textContent = payload.vendor || '제조사';
              // Update sessionStorage so other tabs also reflect
              try{
                var ctx = JSON.parse(sessionStorage.getItem('manufacturer:context')||'{}');
                Object.assign(ctx, {
                  vendor: payload.vendor,
                  address: payload.address,
                  business_number: payload.business_number,
                  call_center: payload.call_center,
                  note: payload.note
                });
                sessionStorage.setItem('manufacturer:context', JSON.stringify(ctx));
              }catch(_){}
              closeModal();
            } else {
              alert((d && d.message) || '저장 중 오류가 발생했습니다.');
            }
          }).catch(function(e){
            alert('저장 중 오류가 발생했습니다: '+(e.message||e));
          });
        }
        function escapeHtml(str){
          var div = document.createElement('div');
          div.appendChild(document.createTextNode(str));
          return div.innerHTML;
        }
        editBtn.addEventListener('click', openModal);
        if(closeBtn) closeBtn.addEventListener('click', closeModal);
        if(saveBtn) saveBtn.addEventListener('click', saveRecord);
        // Close on overlay click
        modal.addEventListener('click', function(e){ if(e.target === modal) closeModal(); });
      })();

        // Vendor Software schema: guard by data-context
        (function(){
          // tab94 공통 소프트웨어 컴포넌트로 이전됨.
          // 제조사 소프트웨어 탭은 별도 inline 초기화 없이 공통 라우트/모듈이 처리한다.
          return;
        })();
      
      // [Tabs moved to /static/js/_detail/tab*.js]

      // ---------- Hardware/Allocation table interactions (system tab) ----------
      (function(){
        var table = document.getElementById('hw-spec-table'); if(!table) return;
        // Manager tab uses the same table id but a different schema; skip hardware logic entirely
        try{ if((table.getAttribute('data-context')||'').toLowerCase()==='manager'){ return; } }catch(_){ }
          // Work-group System tab (data-context="system-hw"): migrated inline logic from tab71-system.html
          (function(){
            var ctx = (table.getAttribute('data-context')||'').toLowerCase();
            if(ctx !== 'system-hw') return; // not our context
            // Global one-time guard to prevent double initialization
            try{
              if(window.__blossomSystemHwInit){ return; }
              window.__blossomSystemHwInit = true;
            }catch(_){ /* non-browser or sealed window: ignore */ }
            var tbody = document.getElementById('hw-spec-tbody') || table.querySelector('tbody');
            var emptyState = document.getElementById('hw-empty');
            var addRowBtn = document.getElementById('hw-row-add');
            var selectAll = document.getElementById('hw-select-all');
            // Upload modal elements
            var uploadOpenBtn = document.getElementById('hw-upload-btn');
            var uploadModal = document.getElementById('hw-upload-modal');
            var uploadCloseBtn = document.getElementById('hw-upload-close');
            var uploadInput = document.getElementById('hw-upload-input');
            var uploadDrop = document.getElementById('hw-upload-dropzone');
            var uploadMeta = document.getElementById('hw-upload-meta');
            var uploadChip = document.getElementById('hw-upload-file-chip');
            var uploadConfirm = document.getElementById('hw-upload-confirm');
            var uploadTplBtn = document.getElementById('hw-upload-template-download');
            // Align upload illustration/behavior with Project Integrity (tab71): Lottie + small fallback icon
            function ensureLottie(cb){
              try{
                if(window.lottie){ cb && cb(); return; }
                var s=document.createElement('script');
                s.src='/static/vendor/lottie/lottie.min.5.12.2.js';
                s.async=true; s.onload=function(){ cb && cb(); };
                document.head.appendChild(s);
              }catch(_){ /* no-op */ }
            }
            function initUploadAnim(){
              try{
                var el = document.getElementById('hw-upload-anim');
                if(!el) return;
                el.innerHTML='';
                ensureLottie(function(){
                  try{
                    window.lottie.loadAnimation({
                      container: el,
                      renderer: 'svg',
                      loop: true,
                      autoplay: true,
                      path: '/static/image/svg/list/free-animated-upload.json',
                      rendererSettings: { preserveAspectRatio:'xMidYMid meet', progressiveLoad:true }
                    });
                  }catch(_e){
                    try{
                      var img=document.createElement('img');
                      img.src='/static/image/svg/list/free-icon-upload.svg';
                      img.alt='Upload';
                      img.style.width='72px'; img.style.height='72px'; img.style.opacity='0.95';
                      el.appendChild(img);
                    }catch(_f){ }
                  }
                });
              }catch(_){ }
            }

            function sysHwRefreshEmpty(){
              try{ if(!emptyState) return; var has = !!(tbody && tbody.querySelector('tr')); emptyState.style.display = has ? 'none' : 'flex'; }catch(_){ }
            }
            function sysHwMakeCell(name){
              var td = document.createElement('td'); td.dataset.col = name;
              if(name === 'work_status'){ var sel=document.createElement('select'); sel.required=true; sel.name='work_status'; ['','정상','점검중','장애','점검예정'].forEach(function(v){ var o=document.createElement('option'); o.value=v; o.textContent=v||'선택'; sel.appendChild(o); }); td.appendChild(sel); return td; }
              if(name === 'work_operation'){ var sel2=document.createElement('select'); sel2.name='work_operation'; ['','24/7','업무시간','야간운영','주말운영'].forEach(function(v){ var o=document.createElement('option'); o.value=v; o.textContent=v||'선택'; sel2.appendChild(o); }); td.appendChild(sel2); return td; }
              if(name === 'system_virtualization'){ var sel3=document.createElement('select'); sel3.name='system_virtualization'; ['','가상화','물리'].forEach(function(v){ var o=document.createElement('option'); o.value=v; o.textContent=v||'선택'; sel3.appendChild(o); }); td.appendChild(sel3); return td; }
              var inp=document.createElement('input'); inp.type='text'; inp.name=name; td.appendChild(inp); return td;
            }
            function sysHwSetRowMode(tr, mode){
              var isEdit = (mode==='edit');
              tr.querySelectorAll('input, select, textarea').forEach(function(el){ if(el.type==='checkbox') return; if(el.tagName==='SELECT'){ el.disabled = !isEdit; } else { el.readOnly = !isEdit; el.disabled=false; } });
              var actionsWrap = tr.querySelector('.system-actions'); if(!actionsWrap) return; actionsWrap.innerHTML='';
              function mkBtn(action, icon, label){ var b=document.createElement('button'); b.type='button'; b.className='action-btn'; b.dataset.action=action; b.title=label; var img=document.createElement('img'); img.src='/static/image/svg/'+icon+'.svg'; img.alt=label; img.className='action-icon'; b.appendChild(img); return b; }
              var primary = isEdit? mkBtn('save','save','저장') : mkBtn('edit','edit','수정');
              var delBtn = mkBtn('delete','delete','삭제');
              primary.addEventListener('click', function(){ if(isEdit){ var statusSel = tr.querySelector('select[name="work_status"]'); if(statusSel && !statusSel.value){ statusSel.classList.add('input-error'); try{ statusSel.focus(); }catch(_){ } return; } sysHwSetRowMode(tr,'view'); } else { sysHwSetRowMode(tr,'edit'); } });
              delBtn.addEventListener('click', function(){ tr.remove(); sysHwRefreshEmpty(); });
              actionsWrap.appendChild(primary); actionsWrap.appendChild(delBtn);
            }
            var sysHwAddLock = false; var sysHwLastAdd = 0;
            function sysHwAddRow(){
              if(!tbody) return;
              // Hard guard: ignore if called twice within 80ms or while locked
              var now = Date.now();
              if(sysHwAddLock || (now - sysHwLastAdd) < 80){ return; }
              sysHwAddLock = true; sysHwLastAdd = now;
              var tr=document.createElement('tr');
              var tdCheck=document.createElement('td');
              var cb=document.createElement('input'); cb.type='checkbox'; cb.className='hw-row-check';
              tdCheck.appendChild(cb); tr.appendChild(tdCheck);
              var cols=['work_classification','work_type','work_status','work_operation','work_group','work_name','system_name','system_ip','manage_ip','system_vendor','system_model','system_serial','system_virtualization','system_location','cpu_size','memory_size','os_type','os_vendor','os_version'];
              cols.forEach(function(c){ tr.appendChild(sysHwMakeCell(c)); });
              var tdActions=document.createElement('td'); var actionsWrap=document.createElement('div'); actionsWrap.className='system-actions'; tdActions.appendChild(actionsWrap); tr.appendChild(tdActions);
              tbody.appendChild(tr);
              sysHwSetRowMode(tr,'edit'); sysHwRefreshEmpty();
              // release lock in next frame
              try{ requestAnimationFrame(function(){ sysHwAddLock=false; }); }catch(_){ setTimeout(function(){ sysHwAddLock=false; }, 0); }
            }
        // 초기에는 행을 자동 추가하지 않아 비어있을 때 빈 상태(이미지+메시지)가 표시되도록 유지
        // Guard against multiple bindings causing double row insertion
        if(addRowBtn && !addRowBtn.dataset.bound){
          // 1) Strip any existing listeners by cloning/replacing the node
          try{ var cloned=addRowBtn.cloneNode(true); addRowBtn.parentNode.replaceChild(cloned, addRowBtn); addRowBtn = cloned; }catch(_){ }
          // 2) Bind a capturing-phase handler and stop propagation to block delegated duplicates
          addRowBtn.addEventListener('click', function(e){ try{ e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); }catch(_){ } sysHwAddRow(); }, true);
          addRowBtn.dataset.bound='1';
        }
            if(selectAll){ selectAll.addEventListener('change', function(){ if(!tbody) return; tbody.querySelectorAll('input.hw-row-check').forEach(function(cb){ cb.checked = !!selectAll.checked; }); }); }
            // Upload modal behavior
            function sysHwClearUploadSelection(){
              try{ if(uploadInput) uploadInput.value=''; }catch(_){ }
              if(uploadChip) uploadChip.textContent='';
              if(uploadMeta) uploadMeta.hidden=true;
              if(uploadConfirm) uploadConfirm.disabled=true;
            }
            function sysHwAcceptExcel(file){
              try{
                if(!file) return false;
                var name=(file.name||'').toLowerCase();
                var okExt = name.endsWith('.xls') || name.endsWith('.xlsx');
                var okSize = (file.size||0) <= 10*1024*1024; // 10MB
                return okExt && okSize;
              }catch(_){ return false; }
            }
            function sysHwUploadSetFile(file){
              if(!uploadChip || !uploadMeta || !uploadConfirm) return;
              if(!file){ sysHwClearUploadSelection(); return; }
              if(!sysHwAcceptExcel(file)){
                try{ if(window.showToast) showToast('지원하지 않는 파일이거나 10MB를 초과합니다. .xls/.xlsx만 가능합니다.','error'); else alert('지원하지 않는 파일이거나 10MB를 초과합니다. .xls/.xlsx만 가능합니다.'); }catch(_a){ }
                sysHwClearUploadSelection(); return;
              }
              uploadChip.textContent = (file.name||'') + ' (' + Math.max(1, Math.round((file.size||0)/1024)) + ' KB)';
              uploadMeta.hidden=false; uploadConfirm.disabled=false;
            }
            function sysHwUploadOpen(){ if(uploadModal){ sysHwClearUploadSelection(); initUploadAnim(); uploadModal.classList.add('show'); uploadModal.setAttribute('aria-hidden','false'); document.body.classList.add('modal-open'); } }
            function sysHwUploadClose(){ if(uploadModal){ uploadModal.classList.remove('show'); uploadModal.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } } }
            if(uploadOpenBtn){ uploadOpenBtn.addEventListener('click', sysHwUploadOpen); }
            if(uploadCloseBtn){ uploadCloseBtn.addEventListener('click', sysHwUploadClose); }
            if(uploadModal){
              uploadModal.addEventListener('click', function(e){ if(e.target===uploadModal) sysHwUploadClose(); });
              document.addEventListener('keydown', function(e){ if(e.key==='Escape' && uploadModal.classList.contains('show')) sysHwUploadClose(); });
            }
            if(uploadDrop){
              uploadDrop.addEventListener('click', function(){ if(uploadInput) uploadInput.click(); });
              uploadDrop.addEventListener('keydown', function(e){ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); if(uploadInput) uploadInput.click(); } });
              uploadDrop.addEventListener('dragover', function(e){ e.preventDefault(); uploadDrop.classList.add('dragover'); });
              uploadDrop.addEventListener('dragleave', function(){ uploadDrop.classList.remove('dragover'); });
              uploadDrop.addEventListener('drop', function(e){ e.preventDefault(); uploadDrop.classList.remove('dragover'); var f=(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) || null; if(!f) return; try{ if(uploadInput) uploadInput.files = e.dataTransfer.files; }catch(_){ } sysHwUploadSetFile(f); });
            }
            if(uploadInput){ uploadInput.addEventListener('change', function(){ var f=uploadInput.files && uploadInput.files[0]; sysHwUploadSetFile(f); }); }
            // Excel 템플릿 다운로드 (Integrity 탭과 동일 패턴)
            async function sysHwEnsureXLSX(){
              if(window.XLSX) return;
              await new Promise(function(resolve, reject){
                try{
                  var s=document.createElement('script');
                  s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
                  s.async=true; s.onload=function(){ resolve(); }; s.onerror=function(){ reject(new Error('XLSX load failed')); };
                  document.head.appendChild(s);
                }catch(e){ reject(e); }
              });
            }
            if(uploadTplBtn){
              uploadTplBtn.addEventListener('click', async function(){
                try{ await sysHwEnsureXLSX(); }catch(_){ try{ if(window.showToast) showToast('템플릿 생성을 위한 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해주세요.','error'); else alert('템플릿 생성을 위한 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해주세요.'); }catch(__){ } return; }
                try{
                  var XLSX=window.XLSX;
                  // 시스템 업로드용 헤더 (테이블 열 순서 그대로)
                  var headers=['업무 분류','업무 구분','업무 상태','업무 운영','업무 그룹','업무 이름','시스템 이름','시스템 IP','관리 IP','시스템 제조사','시스템 모델명','시스템 일련번호','시스템 가상화','시스템 장소','CPU 크기','메모리 크기','운영체제 유형','운영체제 제조사','운영체제 버전'];
                  var wsTemplate = XLSX.utils.aoa_to_sheet([headers]);
                  // 대략적 너비 설정
                  wsTemplate['!cols']=[{wch:12},{wch:12},{wch:10},{wch:10},{wch:12},{wch:14},{wch:14},{wch:12},{wch:10},{wch:12},{wch:14},{wch:14},{wch:10},{wch:12},{wch:10},{wch:10},{wch:12},{wch:14},{wch:12}];
                  var guide = [
                    ['엑셀 업로드 가이드'],[''],
                    ['작성 규칙'],
                    ['- 첫 행 컬럼 제목은 위 순서와 완전히 일치해야 합니다. (순서/이름 변경 불가)'],
                    ['- IP 형식 예: 10.0.0.1'],
                    ['- CPU/메모리 크기는 자유 형식 (예: 16 Core, 128GB)'],
                    ['- 가상화: 가상화 / 물리 중 하나 선택'],
                    ['- 업로드 시 공백 셀은 "-"로 표시될 수 있습니다.'],
                    [''],['컬럼 순서 (복사/참고용)'],[headers.join(', ')]
                  ];
                  var wsGuide = XLSX.utils.aoa_to_sheet(guide); wsGuide['!cols']=[{wch:120}];
                  var wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, wsTemplate, 'Template');
                  XLSX.utils.book_append_sheet(wb, wsGuide, '가이드');
                  XLSX.writeFile(wb, 'system_upload_template.xlsx');
                }catch(e){ console.error(e); try{ if(window.showToast) showToast('템플릿 생성 중 오류가 발생했습니다.','error'); else alert('템플릿 생성 중 오류가 발생했습니다.'); }catch(_f){ } }
              });
            }
            // ----- Excel 업로드 처리 (Integrity 탭 로직 패턴 차용) -----
            function sysHwNormalizeHeader(h){
              return String(h||'')
                .replace(/\s+/g,'')
                .replace(/[()]/g,'')
                .toLowerCase();
            }
            var SYS_HW_HEADER_KEYS = {
              '업무분류':'work_classification','업무구분':'work_type','업무상태':'work_status','업무운영':'work_operation','업무그룹':'work_group','업무이름':'work_name',
              '시스템이름':'system_name','시스템ip':'system_ip','관리ip':'manage_ip','시스템제조사':'system_vendor','시스템모델명':'system_model','시스템일련번호':'system_serial',
              '시스템가상화':'system_virtualization','시스템장소':'system_location','cpu크기':'cpu_size','메모리크기':'memory_size','운영체제유형':'os_type','운영체제제조사':'os_vendor','운영체제버전':'os_version'
            };
            function sysHwHeaderMap(headerRow){
              var map={}; if(!Array.isArray(headerRow)) return map;
              headerRow.forEach(function(h, idx){
                var norm = sysHwNormalizeHeader(h);
                if(SYS_HW_HEADER_KEYS[norm]) map[SYS_HW_HEADER_KEYS[norm]] = idx;
              });
              return map;
            }
            function sysHwRowIsEmpty(arr){
              return !arr || arr.every(function(v){ return !String(v||'').trim(); });
            }
            function sysHwBuildSavedRow(data){
              var tr=document.createElement('tr');
              // checkbox
              var tdCheck=document.createElement('td'); var cb=document.createElement('input'); cb.type='checkbox'; cb.className='hw-row-check'; cb.setAttribute('aria-label','행 선택'); tdCheck.appendChild(cb); tr.appendChild(tdCheck);
              function cell(col, value){
                var td=document.createElement('td'); td.dataset.col=col; td.textContent=(value && String(value).trim()) || '-'; tr.appendChild(td);
              }
              cell('work_classification', data.work_classification);
              cell('work_type', data.work_type);
              cell('work_status', data.work_status);
              cell('work_operation', data.work_operation);
              cell('work_group', data.work_group);
              cell('work_name', data.work_name);
              cell('system_name', data.system_name);
              cell('system_ip', data.system_ip);
              cell('manage_ip', data.manage_ip);
              cell('system_vendor', data.system_vendor);
              cell('system_model', data.system_model);
              cell('system_serial', data.system_serial);
              cell('system_virtualization', data.system_virtualization);
              cell('system_location', data.system_location);
              cell('cpu_size', data.cpu_size);
              cell('memory_size', data.memory_size);
              cell('os_type', data.os_type);
              cell('os_vendor', data.os_vendor);
              cell('os_version', data.os_version);
              var tdActions=document.createElement('td'); var actions=document.createElement('div'); actions.className='system-actions'; tdActions.appendChild(actions);
              var editBtn=document.createElement('button'); editBtn.type='button'; editBtn.className='action-btn'; editBtn.dataset.action='edit'; editBtn.title='편집'; editBtn.setAttribute('aria-label','편집'); editBtn.innerHTML='<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon">';
              var delBtn=document.createElement('button'); delBtn.type='button'; delBtn.className='action-btn danger'; delBtn.dataset.action='delete'; delBtn.title='삭제'; delBtn.setAttribute('aria-label','삭제'); delBtn.innerHTML='<img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon">';
              editBtn.addEventListener('click', function(){ sysHwSetRowMode(tr,'edit'); });
              delBtn.addEventListener('click', function(){ tr.remove(); sysHwRefreshEmpty(); });
              actions.appendChild(editBtn); actions.appendChild(delBtn); tr.appendChild(tdActions);
              return tr;
            }
            function sysHwImportAOA(aoa){
              if(!tbody || !Array.isArray(aoa) || !aoa.length) return 0;
              var headerRow = aoa[0]; var map = sysHwHeaderMap(headerRow);
              var startIdx = Object.keys(map).length ? 1 : 0; // 헤더 인식되면 2번째 줄부터 데이터
              var added=0;
              for(var i=startIdx;i<aoa.length;i++){
                var row = aoa[i]; if(sysHwRowIsEmpty(row)) continue;
                function get(k){ var idx = map[k]; return idx!=null? row[idx] : row[Object.keys(map).length? -1:0]; }
                var data={
                  work_classification: get('work_classification'),
                  work_type: get('work_type'),
                  work_status: get('work_status'),
                  work_operation: get('work_operation'),
                  work_group: get('work_group'),
                  work_name: get('work_name'),
                  system_name: get('system_name'),
                  system_ip: get('system_ip'),
                  manage_ip: get('manage_ip'),
                  system_vendor: get('system_vendor'),
                  system_model: get('system_model'),
                  system_serial: get('system_serial'),
                  system_virtualization: get('system_virtualization'),
                  system_location: get('system_location'),
                  cpu_size: get('cpu_size'),
                  memory_size: get('memory_size'),
                  os_type: get('os_type'),
                  os_vendor: get('os_vendor'),
                  os_version: get('os_version')
                };
                // 최소 필수: 시스템 이름 또는 업무 이름 없으면 스킵
                if(!String(data.system_name||'').trim() && !String(data.work_name||'').trim()) continue;
                var tr = sysHwBuildSavedRow(data); tbody.appendChild(tr); added++;
              }
              sysHwRefreshEmpty();
              return added;
            }
            async function sysHwProcessUpload(){
              var file = uploadInput && uploadInput.files && uploadInput.files[0];
              if(!file){ try{ if(window.showToast) showToast('파일을 선택하세요.','warning'); else alert('파일을 선택하세요.'); }catch(_){ } return; }
              try{ await sysHwEnsureXLSX(); }catch(_){ try{ if(window.showToast) showToast('엑셀 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해주세요.','error'); else alert('엑셀 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해주세요.'); }catch(__){ } return; }
              try{
                var reader = new FileReader();
                reader.onload=function(e){
                  try{
                    var data = new Uint8Array(e.target.result);
                    var wb = window.XLSX.read(data, {type:'array'});
                    var sheetName = wb.SheetNames[0];
                    var ws = wb.Sheets[sheetName];
                    var aoa = window.XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
                    var added = sysHwImportAOA(aoa);
                    sysHwUploadClose();
                    if(added>0){ try{ if(window.showToast) showToast(added+'개 행이 추가되었습니다.','success'); else alert(added+'개 행이 추가되었습니다.'); }catch(_m){ } }
                    else { try{ if(window.showToast) showToast('추가된 유효한 행이 없습니다.','info'); else alert('추가된 유효한 행이 없습니다.'); }catch(_n){ } }
                  }catch(err){ console.error(err); try{ if(window.showToast) showToast('파일 파싱 중 오류가 발생했습니다.','error'); else alert('파일 파싱 중 오류가 발생했습니다.'); }catch(_e){ } }
                };
                reader.onerror=function(){ try{ if(window.showToast) showToast('파일을 읽는 중 오류가 발생했습니다.','error'); else alert('파일을 읽는 중 오류가 발생했습니다.'); }catch(_z){ } };
                reader.readAsArrayBuffer(file);
              }catch(err){ console.error(err); try{ if(window.showToast) showToast('업로드 처리 중 알 수 없는 오류입니다.','error'); else alert('업로드 처리 중 알 수 없는 오류입니다.'); }catch(_x){ } }
            }
            if(uploadConfirm){ uploadConfirm.addEventListener('click', function(){ sysHwProcessUpload(); }); }
            // 최초 로드 시 빈 상태 반영
            sysHwRefreshEmpty();
          })();
        // Vendor Software schema: guard by data-context
        (function(){
          var ctx=(table.getAttribute('data-context')||'').toLowerCase();
          var isVendorSw = (ctx==='vendor-sw');
          if(!isVendorSw) return;

          // Resolve vendor context (selected from list page)
          function getVendorId(){
            try{
              var raw = sessionStorage.getItem('manufacturer:context');
              if(!raw) return null;
              var obj = JSON.parse(raw);
              var id = obj && obj.id;
              var n = parseInt(id, 10);
              return (isNaN(n) || n<=0) ? null : n;
            }catch(_){ return null; }
          }
          var vendorId = getVendorId();
          var API_BASE = '/api/vendor-manufacturers';
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
              + '<td data-col="category">'+(item.category||'-')+'</td>'
              + '<td data-col="model">'+(item.model||'-')+'</td>'
              + '<td data-col="type">'+(item.type||'-')+'</td>'
              + '<td data-col="qty">'+(item.qty!=null ? String(item.qty) : '-')+'</td>'
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
              toast('제조사 소프트웨어 목록을 불러오지 못했습니다.', 'error');
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
            '보안S/W': ['백신','취약점','서버 접근통제','서버 통합계정','서버 모니터링','서버 보안통제','DB 접근통제','기타'],
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
          // Load persisted rows before first paint of empty state
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
              var payload = { category: catVal, model: modelVal, type: typeVal, qty: qtyNum, remark: read('remark') };
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
          function swExportCSV(onlySelected){ var tbody=table.querySelector('tbody'); if(!tbody) return; var headers=['구분','모델명','유형','수량','비고']; var trs=swSavedVisibleRows(); if(onlySelected){ trs = trs.filter(function(tr){ var cb=tr.querySelector('.hw-row-check'); return cb && cb.checked; }); } if(trs.length===0) return; function text(tr,col){ var td=tr.querySelector('[data-col="'+col+'"]'); return td? (td.textContent||'').trim() : ''; } var cols=['category','model','type','qty','remark']; var rows = trs.map(function(tr){ return cols.map(function(c){ return text(tr,c); }); }); var lines = [headers].concat(rows).map(function(arr){ return arr.map(swEscapeCSV).join(','); }); var csv='\uFEFF'+lines.join('\r\n'); var d=new Date(); var yyyy=d.getFullYear(); var mm=String(d.getMonth()+1).padStart(2,'0'); var dd=String(d.getDate()).padStart(2,'0'); var filename='vendor_software_'+yyyy+mm+dd+'.csv'; try{ var blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); var url=URL.createObjectURL(blob); var a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); } catch(_){ var a2=document.createElement('a'); a2.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a2.download=filename; document.body.appendChild(a2); a2.click(); document.body.removeChild(a2); } }
          (function(){ var btn = document.getElementById('hw-download-btn'); var modalId='hw-download-modal'; var closeBtn=document.getElementById('hw-download-close'); var confirmBtn=document.getElementById('hw-download-confirm'); function openModalLocal(id){ var el=document.getElementById(id); if(!el) return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden','false'); } function closeModalLocal(id){ var el=document.getElementById(id); if(!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } } if(btn){ btn.addEventListener('click', function(){ if(btn.disabled) return; var saved=swSavedVisibleRows(); var total=saved.length; if(total<=0) return; var selectedCount = saved.filter(function(tr){ var cb=tr.querySelector('.hw-row-check'); return cb && cb.checked; }).length; var subtitle=document.getElementById('hw-download-subtitle'); if(subtitle){ subtitle.textContent = selectedCount>0 ? ('선택된 '+selectedCount+'개 또는 전체 '+total+'개 결과 중 범위를 선택하세요.') : ('현재 결과 '+total+'개 항목을 CSV로 내보냅니다.'); } var rowSelectedWrap=document.getElementById('hw-csv-range-row-selected'); var optSelected=document.getElementById('hw-csv-range-selected'); var optAll=document.getElementById('hw-csv-range-all'); if(rowSelectedWrap) rowSelectedWrap.hidden = !(selectedCount>0); if(optSelected){ optSelected.disabled = !(selectedCount>0); optSelected.checked = selectedCount>0; } if(optAll){ optAll.checked = !(selectedCount>0); } openModalLocal(modalId); }); } if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalLocal(modalId); }); } var modalEl=document.getElementById(modalId); if(modalEl){ modalEl.addEventListener('click', function(e){ if(e.target===modalEl) closeModalLocal(modalId); }); document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(modalId); }); } if(confirmBtn){ confirmBtn.addEventListener('click', function(){ var onlySel = !!(document.getElementById('hw-csv-range-selected') && document.getElementById('hw-csv-range-selected').checked); swExportCSV(onlySel); closeModalLocal(modalId); }); } })();

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
              vendorKind: 'manufacturer',
              sessionStorageKey: 'manufacturer:context'
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
  
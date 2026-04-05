(function(){
  'use strict';

  function escapeHTML(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(ch){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]);
    });
  }

  function ready(fn){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function nextTick(fn){
    try{
      if(typeof requestAnimationFrame === 'function') requestAnimationFrame(function(){ setTimeout(fn, 0); });
      else setTimeout(fn, 0);
    }catch(_e){
      try{ setTimeout(fn, 0); }catch(_e2){}
    }
  }

  function bindOnce(el, datasetKey, eventName, handler){
    if(!el) return false;
    try{
      if(el.dataset && el.dataset[datasetKey] === '1') return false;
      if(el.dataset) el.dataset[datasetKey] = '1';
    }catch(_e){}
    try{
      el.addEventListener(eventName, handler);
      return true;
    }catch(_e2){
      return false;
    }
  }

  // ── Flatpickr datepicker helpers ──
  var FLATPICKR_CSS = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css';
  var FLATPICKR_THEME_HREF = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/themes/airbnb.css';
  var FLATPICKR_JS = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.js';
  var FLATPICKR_KO = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/l10n/ko.js';
  function ensureCss(href, id){ var el=document.getElementById(id); if(el && el.tagName.toLowerCase()==='link'){ if(el.getAttribute('href')!==href) el.setAttribute('href', href); return; } var l=document.createElement('link'); l.rel='stylesheet'; l.href=href; l.id=id; document.head.appendChild(l); }
  function loadScript(src){ return new Promise(function(resolve,reject){ var s=document.createElement('script'); s.src=src; s.async=true; s.onload=function(){ resolve(); }; s.onerror=function(){ reject(new Error('Script load failed: '+src)); }; document.head.appendChild(s); }); }
  function ensureFlatpickr(){ ensureCss(FLATPICKR_CSS,'flatpickr-css'); ensureCss(FLATPICKR_THEME_HREF,'flatpickr-theme-css'); if(window.flatpickr) return Promise.resolve(); return loadScript(FLATPICKR_JS).then(function(){ return loadScript(FLATPICKR_KO).catch(function(){}); }); }
  function ensureTodayButton(fp){ var cal=fp&&fp.calendarContainer; if(!cal) return; if(cal.querySelector('.fp-today-btn')) return; var btn=document.createElement('button'); btn.type='button'; btn.className='fp-today-btn'; btn.textContent='\uc624\ub298'; btn.addEventListener('click',function(){ fp.setDate(new Date(),true); }); cal.appendChild(btn); }
  function initDatePickersForForm(formId){ var form=document.getElementById(formId); if(!form) return; ensureFlatpickr().then(function(){ var dateEl=form.querySelector('[name="contract_date"]'); if(!dateEl||dateEl.disabled) return; var opts={ locale:(window.flatpickr&&window.flatpickr.l10ns&&window.flatpickr.l10ns.ko)?window.flatpickr.l10ns.ko:'ko', dateFormat:'Y-m-d', allowInput:true, disableMobile:true, onReady:function(d,s,inst){ ensureTodayButton(inst); }, onOpen:function(d,s,inst){ ensureTodayButton(inst); } }; try{ dateEl.type='text'; }catch(_e){} if(!dateEl._flatpickr) window.flatpickr(dateEl, opts); }).catch(function(){ var dateEl=form.querySelector('[name="contract_date"]'); if(dateEl){ try{ dateEl.type='date'; }catch(_e){} } }); }

  // ── Chart.js helpers ──
  var CHARTJS_CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js';
  function ensureChartJs(){
    if(window.Chart) return Promise.resolve();
    return loadScript(CHARTJS_CDN);
  }

  var CHART_COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f97316','#64748b'];

  var LOTTIE_CDN = 'https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js';
  var LOTTIE_JSON = '/static/image/svg/free-animated-no-data.json';

  function renderNoDataLottie(container){
    if(!container) return;
    container.innerHTML = '';
    container.style.display = '';
    container.style.flexDirection = 'column';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';
    container.style.padding = '12px 0';

    var animBox = document.createElement('span');
    animBox.style.display = 'inline-block';
    animBox.style.width = '200px';
    animBox.style.maxWidth = '100%';
    animBox.style.height = '150px';
    animBox.style.pointerEvents = 'none';
    animBox.setAttribute('aria-label', '데이터 없음');
    container.appendChild(animBox);

    var cap = document.createElement('span');
    cap.textContent = '등록된 계약 품목이 없습니다.';
    cap.style.display = 'block';
    cap.style.marginTop = '8px';
    cap.style.fontSize = '13px';
    cap.style.color = '#64748b';
    container.appendChild(cap);

    function playLottie(){
      try{
        if(!window.lottie) return false;
        window.lottie.loadAnimation({ container: animBox, renderer: 'svg', loop: true, autoplay: true, path: LOTTIE_JSON });
        return true;
      }catch(_){ return false; }
    }
    if(!playLottie()){
      if(!window.lottie){
        try{
          var s = document.createElement('script'); s.src = LOTTIE_CDN; s.async = true;
          s.onload = function(){ playLottie(); };
          document.head.appendChild(s);
        }catch(_){}
      }
    }
  }

  var _supplierAmtChart = null;

  function renderSupplierCharts(items){
    var emptyEl = document.getElementById('chart-supplier-empty');
    var amtCanvas = document.getElementById('chart-supplier-amount');
    if(!amtCanvas) return;

    // Aggregate by supplier — also collect 조달구분 and 품목유형 per supplier
    var map = {};
    var detailMap = {};   // supplier -> { divisions: Set, itemTypes: Set }
    var active = (items || []).filter(function(it){ return !it.is_deleted; });
    active.forEach(function(it){
      var key = String(it.supplier || '').trim() || '(미지정)';
      if(!map[key]) map[key] = 0;
      map[key] += (parseInt(it.total_price, 10) || 0);

      if(!detailMap[key]) detailMap[key] = { divisions: {}, itemTypes: {} };
      var div = String(it.contract_division || '').trim();
      var itype = String(it.item_type || '').trim();
      if(div) detailMap[key].divisions[div] = true;
      if(itype) detailMap[key].itemTypes[itype] = true;
    });

    var labels = Object.keys(map);
    if(labels.length === 0){
      amtCanvas.style.display = 'none';
      renderNoDataLottie(emptyEl);
      return;
    }
    amtCanvas.style.display = '';
    if(emptyEl) emptyEl.style.display = 'none';

    var amtData = labels.map(function(k){ return map[k]; });
    var bgColors = labels.map(function(_,i){ return CHART_COLORS[i % CHART_COLORS.length]; });
    var grandTotal = amtData.reduce(function(a,b){ return a+b; }, 0);

    ensureChartJs().then(function(){
      if(!window.Chart) return;

      if(_supplierAmtChart){ try{ _supplierAmtChart.destroy(); }catch(_e){} _supplierAmtChart = null; }

      _supplierAmtChart = new Chart(amtCanvas, {
        type: 'doughnut',
        data: { labels: labels, datasets: [{ data: amtData, backgroundColor: bgColors, borderWidth: 2, borderColor: '#fff' }] },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 14, padding: 12, font: { size: 12 } } },
            tooltip: {
              callbacks: {
                title: function(tooltipItems){
                  if(!tooltipItems || !tooltipItems.length) return '';
                  return tooltipItems[0].label || '';
                },
                label: function(ctx){
                  var val = ctx.parsed || 0;
                  var pct = grandTotal > 0 ? Math.round((val / grandTotal) * 1000) / 10 : 0;
                  return ' 금액: ' + val.toLocaleString('ko-KR') + '원 (' + pct + '%)';
                },
                afterLabel: function(ctx){
                  var supplier = ctx.label || '';
                  var info = detailMap[supplier];
                  if(!info) return '';
                  var lines = [];
                  var divs = Object.keys(info.divisions);
                  var types = Object.keys(info.itemTypes);
                  if(divs.length) lines.push(' 조달구분: ' + divs.join(', '));
                  if(types.length) lines.push(' 품목유형: ' + types.join(', '));
                  return lines;
                }
              }
            }
          }
        }
      });
    }).catch(function(_e){
      amtCanvas.style.display = 'none';
    });
  }

  function loadSupplierChart(capexType, manageNo){
    if(!capexType || !manageNo) return;
    var url = '/api/capex-contract-items?capex_type=' + encodeURIComponent(capexType) + '&manage_no=' + encodeURIComponent(manageNo);
    fetch(url, { credentials: 'same-origin' })
      .then(function(r){ return r.json(); })
      .then(function(data){
        if(data && data.items) renderSupplierCharts(data.items);
        else renderSupplierCharts([]);
      })
      .catch(function(){ renderSupplierCharts([]); });
  }

  function getPageKey(){
    try {
      var m = String(window.location.pathname || '').match(/^\/p\/([^\/?#]+)/);
      return m && m[1] ? decodeURIComponent(m[1]) : '';
    } catch (_e) {
      return '';
    }
  }

  function resolveCapexTypeFromKey(key){
    var k = String(key || '').toLowerCase();
    if(k.indexOf('cost_capex_hardware') === 0) return 'HW';
    if(k.indexOf('cost_capex_software') === 0) return 'SW';
    if(k.indexOf('cost_capex_etc') === 0) return 'ETC';
    return '';
  }

  function isCapexBasicDetailPage(){
    var key = getPageKey();
    return /^cost_capex_(hardware|software|etc)_detail$/i.test(key);
  }

  function openModal(id){
    try{
      var m = document.getElementById(id);
      if(!m) return;
      m.classList.add('show');
      m.setAttribute('aria-hidden','false');
      document.body.classList.add('modal-open');
    }catch(_e){}
  }

  function closeModal(id){
    try{
      var m = document.getElementById(id);
      if(!m) return;
      m.classList.remove('show');
      m.setAttribute('aria-hidden','true');
      if(!document.querySelector('.modal-overlay-full.show')){
        document.body.classList.remove('modal-open');
      }
    }catch(_e){}
  }

  function toastSafe(message){
    try{ if(window.toast){ window.toast(String(message || ''), 'warning'); return; } }catch(_e){}
  }

  function getText(id){
    var el = document.getElementById(id);
    return el ? String(el.textContent || '').trim() : '';
  }

  function setText(id, val){
    var el = document.getElementById(id);
    if(el) el.textContent = String(val == null ? '' : val);
  }

  function setHtml(id, html){
    var el = document.getElementById(id);
    if(el) el.innerHTML = String(html == null ? '' : html);
  }

  function formatWonDisplay(value){
    var digits = String(value == null ? '' : value).replace(/[^0-9]/g,'');
    if(!digits) return '-';
    try{
      // Use BigInt to avoid precision loss on large values
      var n = BigInt(digits);
      return n.toLocaleString('ko-KR') + '원';
    }catch(_e){
      try{
        var x = Number(digits);
        if(!isFinite(x) || isNaN(x)) return '-';
        return x.toLocaleString('ko-KR') + '원';
      }catch(_e2){
        return '-';
      }
    }
  }

  function formatWonInput(value){
    var digits = String(value == null ? '' : value).replace(/[^0-9]/g,'');
    if(!digits) return '';
    try{
      var n = BigInt(digits);
      return n.toLocaleString('ko-KR') + '원';
    }catch(_e){
      return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '원';
    }
  }

  function renderContractStatusPill(value){
    var v = String(value == null ? '' : value).trim();
    if(!v || v === '-') return escapeHTML(v || '-');
    var cls = (v === '진행') ? 'ws-run' : (v === '완료') ? 'ws-done' : 'ws-wait';
    return '<span class="status-pill"><span class="status-dot '+ escapeHTML(cls) +'" aria-hidden="true"></span><span class="status-text">'+ escapeHTML(v) +'</span></span>';
  }

  function bindWonCurrencyInput(input){
    if(!input) return;
    try{
      if(input.dataset && input.dataset.wonCurrencyBound === '1') return;
      if(input.dataset) input.dataset.wonCurrencyBound = '1';
    }catch(_e){}

    function placeCaretBeforeWon(){
      try{
        if(!input.value) return;
        if(!/원$/.test(input.value)) return;
        var pos = Math.max(0, input.value.length - 1);
        input.setSelectionRange(pos, pos);
      }catch(_e){}
    }

    input.addEventListener('keydown', function(e){
      // Make backspace/delete behave naturally when the last char is '원'
      if((e.key === 'Backspace' || e.key === 'Delete') && /원$/.test(input.value || '')){
        try{
          var start = input.selectionStart;
          var end = input.selectionEnd;
          if(start === end && (start === input.value.length || start === input.value.length - 1)){
            var digits = String(input.value || '').replace(/[^0-9]/g,'');
            if(digits){
              digits = digits.slice(0, -1);
              input.value = digits ? formatWonInput(digits) : '';
              placeCaretBeforeWon();
              e.preventDefault();
              return;
            }
          }
        }catch(_e2){}
      }
    });

    input.addEventListener('input', function(){
      var digits = String(input.value || '').replace(/[^0-9]/g,'');
      input.value = digits ? formatWonInput(digits) : '';
      placeCaretBeforeWon();
    });
    input.addEventListener('focus', function(){
      placeCaretBeforeWon();
    });
    input.addEventListener('blur', function(){
      var digits = String(input.value || '').replace(/[^0-9]/g,'');
      input.value = digits ? formatWonInput(digits) : '';
    });

    // initial normalize
    try{
      var initDigits = String(input.value || '').replace(/[^0-9]/g,'');
      input.value = initDigits ? formatWonInput(initDigits) : '';
    }catch(_e3){}
  }

  function requestJson(url, options){
    options = options || {};
    var opts = Object.assign({ credentials: 'same-origin' }, options);
    opts.headers = opts.headers ? Object.assign({}, opts.headers) : {};
    if(opts.body && !opts.headers['Content-Type']) opts.headers['Content-Type'] = 'application/json';
    return fetch(url, opts).then(function(res){
      return res.json().catch(function(){ return {}; }).then(function(data){
        if(!res.ok || data.success === false){
          var msg = data.message || '요청을 처리하지 못했습니다.';
          throw new Error(msg);
        }
        return data;
      });
    });
  }

  function normalizeDigits(value){
    var raw = String(value == null ? '' : value).replace(/[^0-9-]/g,'').trim();
    if(!raw) return '';
    try{
      var n = parseInt(raw, 10);
      if(isNaN(n)) return '';
      return String(n);
    }catch(_e){
      return '';
    }
  }

  function parseCurrencyInput(value){
    var cleaned = String(value == null ? '' : value).replace(/[^0-9.-]/g,'').trim();
    if(!cleaned) return '';
    var n = Number(cleaned);
    if(!isFinite(n) || isNaN(n)) return '';
    return String(Math.max(0, Math.round(n)));
  }

  function initCapexBasicDetail(){
    if(!isCapexBasicDetailPage()) return;

    var EDIT_MODAL_ID = 'system-edit-modal';
    var EDIT_FORM_ID = 'system-edit-form';
    var EDIT_OPEN_ID = 'detail-edit-open';
    var EDIT_CLOSE_ID = 'system-edit-close';
    var EDIT_SAVE_ID = 'system-edit-save';

    var main = document.querySelector('main.main-content');
    var contractId = main && main.dataset ? (main.dataset.contractId || '') : '';
    var capexType = resolveCapexTypeFromKey(getPageKey()) || '';

    function applyInitialFormatting(){
      // 계약상태: 리스트와 동일한 status-pill 스타일
      var currentStatus = getText('cd-contract_status');
      setHtml('cd-contract_status', renderContractStatusPill(currentStatus || '-'));
      // 구매 금액: 3자리 콤마 + 원
      var currentAmount = getText('cd-maint_amount');
      if(currentAmount && currentAmount !== '-'){
        setText('cd-maint_amount', formatWonDisplay(currentAmount));
      }
    }

    function fillFormFromDisplay(){
      var form = document.getElementById(EDIT_FORM_ID);
      if(!form) return;
      function setVal(name, value){
        var el = form.querySelector('[name="'+name+'"]');
        if(!el) return;
        el.value = String(value == null ? '' : value);
      }

      setVal('contract_status', getText('cd-contract_status'));
      setVal('contract_name', getText('cd-contract_name'));
      setVal('manage_no', getText('cd-manage_no'));
      setVal('contract_date', getText('cd-contract_date'));
      setVal('memo', getText('cd-memo'));
    }

    function readForm(){
      var form = document.getElementById(EDIT_FORM_ID);
      if(!form) return null;
      function v(name){
        var el = form.querySelector('[name="'+name+'"]');
        return el ? String(el.value || '').trim() : '';
      }
      return {
        capex_type: capexType,
        contract_status: v('contract_status'),
        contract_name: v('contract_name'),
        manage_no: v('manage_no'),
        contract_date: v('contract_date'),
        memo: v('memo')
      };
    }

    function updateDisplayFromRecord(record){
      if(!record) return;
      setHtml('cd-contract_status', renderContractStatusPill(record.contract_status || '-'));
      setText('cd-contract_name', record.contract_name || '-');
      setText('cd-manage_no', record.manage_no || record.contract_code || '-');
      setText('cd-contract_date', record.contract_date || '-');
      // 구매 전체수량 / 금액: items 합계에서 가져옴
      var qtyVal = (record.items_qty_sum != null && record.items_qty_sum !== '') ? record.items_qty_sum : (record.maint_qty_total != null && record.maint_qty_total !== '') ? record.maint_qty_total : '-';
      setText('cd-maint_qty_total', qtyVal);
      var amtVal = (record.items_amount_sum != null && record.items_amount_sum !== '') ? record.items_amount_sum : (record.maint_amount != null && record.maint_amount !== '') ? record.maint_amount : null;
      if(amtVal != null && amtVal !== '-'){
        setText('cd-maint_amount', formatWonDisplay(amtVal));
      }else{
        setText('cd-maint_amount', '-');
      }
      setText('cd-memo', record.memo || '-');
      setText('page-header-title', record.contract_name || getText('page-header-title'));
      setText('page-header-subtitle', (record.manage_no || record.contract_code) || getText('page-header-subtitle'));
      if(main && main.dataset){
        if(record.id != null) main.dataset.contractId = String(record.id);
      }
      contractId = (record.id != null) ? String(record.id) : contractId;
    }

    var openBtn = document.getElementById(EDIT_OPEN_ID);
    if(openBtn){
      bindOnce(openBtn, 'capexBasicOpenBound', 'click', function(){
        fillFormFromDisplay();
        openModal(EDIT_MODAL_ID);
        initDatePickersForForm(EDIT_FORM_ID);
      });
    }

    // Initial render formatting for server-rendered values
    applyInitialFormatting();

    // Load supplier chart from tab62 data
    var manageNo = main && main.dataset ? (main.dataset.manageNo || '') : '';
    if(capexType && manageNo){
      loadSupplierChart(capexType, manageNo);
    }

    var closeBtn = document.getElementById(EDIT_CLOSE_ID);
    if(closeBtn){
      bindOnce(closeBtn, 'capexBasicCloseBound', 'click', function(){ closeModal(EDIT_MODAL_ID); });
    }

    var modalEl = document.getElementById(EDIT_MODAL_ID);
    if(modalEl){
      bindOnce(modalEl, 'capexBasicOverlayBound', 'click', function(e){ if(e.target === modalEl) closeModal(EDIT_MODAL_ID); });
      if(!window.__capexBasicDetailEscapeBound){
        window.__capexBasicDetailEscapeBound = true;
        document.addEventListener('keydown', function(e){
          try{
            if(e.key !== 'Escape') return;
            var m = document.getElementById(EDIT_MODAL_ID);
            if(m && m.classList.contains('show')) closeModal(EDIT_MODAL_ID);
          }catch(_e){}
        });
      }
    }

    var saveBtn = document.getElementById(EDIT_SAVE_ID);
    if(saveBtn){
      bindOnce(saveBtn, 'capexBasicSaveBound', 'click', function(){
        var payload = readForm();
        if(!payload) return;
        if(!contractId){
          toastSafe('대상 계약 ID를 찾을 수 없습니다. 목록에서 다시 진입해 주세요.');
          return;
        }
        requestJson('/api/capex-contracts/' + encodeURIComponent(contractId), {
          method: 'PUT',
          body: JSON.stringify(payload)
        }).then(function(res){
          updateDisplayFromRecord(res.item || {});
          closeModal(EDIT_MODAL_ID);
        }).catch(function(err){
          toastSafe(err && err.message ? err.message : '저장 중 오류가 발생했습니다.');
        });
      });
    }
  }

  // Initial load
  ready(initCapexBasicDetail);

  // Cost tab partial loading / fullscreen SPA swaps (re-init after <main> replacement)
  try{
    document.addEventListener('blossom:pageLoaded', function(){ nextTick(initCapexBasicDetail); });
    document.addEventListener('blossom:spa:navigated', function(){ nextTick(initCapexBasicDetail); });
  }catch(_e){}
})();

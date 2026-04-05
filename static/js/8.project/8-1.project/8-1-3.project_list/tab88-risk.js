// tab88-risk.js — tab88: 위험관리 (Risk/FMEA)
(function(){
  'use strict';
  window.__blsTabInits = window.__blsTabInits || {};
  window.__blsInitFlags = window.__blsInitFlags || {};
  function _boot(){
    var blsGetProjectId = window.blsGetProjectId;
    var blsFetchJson = window.blsFetchJson;

  
  // FMEA (tab88): Failure Mode and Effects Analysis - 3rd box CRUD, CSV, XLSX, pagination
  (function(){
    function runFMEA(){
      try{
        // Register early so SPA tab-switch can always find the init function
        window.__blsTabInits.tab88 = runFMEA;
        // This tab is rendered via /p/<key> routes too, so do not hard-require a specific pathname.
        // Scope execution by DOM presence + a per-tab init guard.
        var table=document.getElementById('fmea-table');
        if(!table) return;

        try{
          window.__blsInitFlags = window.__blsInitFlags || {};
          if(window.__blsInitFlags.tab88_fmea_initialized) return;
          window.__blsInitFlags.tab88_fmea_initialized = true;
        }catch(_ig){ }
      var tableWrap = table.closest('.table-wrap');
      var tbody=table.querySelector('tbody')||table.appendChild(document.createElement('tbody'));
      var emptyEl=document.getElementById('fmea-empty');
      var addBtn=document.getElementById('wbs-row-add');
      var csvBtn=document.getElementById('wbs-download-btn');
      var selectAll=document.getElementById('fmea-select-all');
      var pageSizeSel=document.getElementById('fmea-page-size');

      var paginationEl=document.getElementById('fmea-pagination');
      var infoEl=document.getElementById('fmea-pagination-info');
      var numsWrap=document.getElementById('fmea-page-numbers');
      var btnFirst=document.getElementById('fmea-first');
      var btnPrev=document.getElementById('fmea-prev');
      var btnNext=document.getElementById('fmea-next');
      var btnLast=document.getElementById('fmea-last');

      var fmState={ page:1, pageSize:10, colFilters:{} };
      (function initPageSize(){ try{ var saved=localStorage.getItem('project:fmea:pageSize'); if(pageSizeSel){ if(saved && ['10','20','50','100'].indexOf(saved)>-1){ fmState.pageSize=parseInt(saved,10); pageSizeSel.value=saved; } pageSizeSel.addEventListener('change', function(){ var v=parseInt(pageSizeSel.value,10); if(!isNaN(v)){ fmState.page=1; fmState.pageSize=v; try{ localStorage.setItem('project:fmea:pageSize', String(v)); }catch(_){ } fmRenderPage(); } }); } }catch(_){ } })();

      function fmRows(){ return Array.from(tbody.querySelectorAll('tr')); }
      function fmFilteredRows(){
        var all=fmRows(); var keys=Object.keys(fmState.colFilters);
        if(!keys.length) return all;
        return all.filter(function(tr){
          for(var i=0;i<keys.length;i++){
            var col=keys[i], fv=fmState.colFilters[col];
            if(!fv) continue;
            var td=tr.querySelector('[data-col="'+col+'"]');
            if(!td) return false;
            var t=(td.textContent||'').trim(); if(t==='-') t='';
            if(t!==fv) return false;
          }
          return true;
        });
      }
      function fmTotal(){ return fmFilteredRows().length; }
      function fmPages(){ var total=fmTotal(); return Math.max(1, Math.ceil(total / fmState.pageSize)); }
      function fmClampPage(){ var p=fmPages(); if(fmState.page>p) fmState.page=p; if(fmState.page<1) fmState.page=1; }
      function fmUpdateUI(){ if(infoEl){ var total=fmTotal(); var start = total? (fmState.page-1)*fmState.pageSize+1 : 0; var end=Math.min(total, fmState.page*fmState.pageSize); infoEl.textContent = start + '-' + end + ' / ' + total + '개 항목'; }
        if(numsWrap){ var pages=fmPages(); numsWrap.innerHTML=''; for(var i=1;i<=pages && i<=50;i++){ var b=document.createElement('button'); b.className='page-btn'+(i===fmState.page?' active':''); b.textContent=String(i); b.dataset.page=String(i); numsWrap.appendChild(b);} }
        var pages2=fmPages(); if(btnFirst) btnFirst.disabled=(fmState.page===1); if(btnPrev) btnPrev.disabled=(fmState.page===1); if(btnNext) btnNext.disabled=(fmState.page===pages2); if(btnLast) btnLast.disabled=(fmState.page===pages2);
        if(pageSizeSel){ var none=(fmTotal()===0); pageSizeSel.disabled=none; if(none){ try{ pageSizeSel.value='10'; fmState.pageSize=10; }catch(_){ } }
        }
      }
      function fmRenderPage(){ fmClampPage(); var allRows=fmRows(); var filtered=fmFilteredRows(); var start=(fmState.page-1)*fmState.pageSize; var end=start+fmState.pageSize-1; allRows.forEach(function(tr){ tr.style.display='none'; tr.setAttribute('data-hidden','1'); }); filtered.forEach(function(tr, idx){ var vis=idx>=start && idx<=end; tr.style.display=vis?'':'none'; if(vis){ tr.removeAttribute('data-hidden'); } else { tr.setAttribute('data-hidden','1'); } var cb=tr.querySelector('.fmea-row-check'); if(cb){ tr.classList.toggle('selected', !!cb.checked && vis); } }); fmUpdateUI(); if(selectAll){ var visChecks=table.querySelectorAll('tbody tr:not([data-hidden]) .fmea-row-check'); if(visChecks.length){ selectAll.checked = Array.prototype.every.call(visChecks,function(c){ return c.checked; }); } else { selectAll.checked=false; } } }
      function fmGo(p){ fmState.page=p; fmRenderPage(); }
      function fmGoDelta(d){ fmGo(fmState.page+d); }
      function fmGoFirst(){ fmGo(1); }
      function fmGoLast(){ fmGo(fmPages()); }
      if(numsWrap){ numsWrap.addEventListener('click', function(e){ var b=e.target.closest('button.page-btn'); if(!b) return; var p=parseInt(b.dataset.page,10); if(!isNaN(p)) fmGo(p); }); }
      if(btnFirst) btnFirst.onclick = fmGoFirst;
      if(btnPrev) btnPrev.onclick = function(){ fmGoDelta(-1); };
      if(btnNext) btnNext.onclick = function(){ fmGoDelta(1); };
      if(btnLast) btnLast.onclick = fmGoLast;

      function fmSavedRow(tr){ return !tr.querySelector('td[data-col] input, td[data-col] select, td[data-col] textarea'); }
      function fmVisibleRows(){ return Array.from(tbody.querySelectorAll('tr')).filter(function(tr){ return !(tr.hasAttribute('data-hidden') || tr.style.display==='none'); }); }
      function fmSavedVisibleRows(){ return fmVisibleRows().filter(fmSavedRow); }

      // DB hydrate/save (merge-safe)
      var fmTabClient = null;
      try{ fmTabClient = (window.__blsGetPrjTabClient ? window.__blsGetPrjTabClient() : null); }catch(_c){ fmTabClient = null; }
      var fmTabKey = 'risk';
      /* ── Org-user preload (owner searchable-select) ── */
      var _fmOrgUsers = [];
      (function(){ try{ fetch('/api/org-users/suggest?q=&limit=200',{credentials:'same-origin'}).then(function(r){return r.json();}).then(function(d){_fmOrgUsers=(d&&d.items)||[];}).catch(function(){}); }catch(_){} })();

      /* ── Searchable-Select helper (S,O,D,Owner,Status) ── */
      function _fmApplySearchable(tr){
        var fn=window.__blsSearchableSelectFn; if(!fn) return;
        ['s','o','d','owner','status'].forEach(function(col){
          var td=tr.querySelector('[data-col="'+col+'"]');
          if(!td) return;
          var sel=td.querySelector('select');
          if(!sel||sel.dataset.blsSS) return;
          fn(sel);
        });
      }

      /* ── Refresh owner filter options from current table rows ── */
      function _fmRefreshOwnerFilter(){
        var sel=document.getElementById('fmea-filter-owner'); if(!sel) return;
        var curVal=fmState.colFilters['owner']||'';
        var owners={};
        fmRows().filter(fmSavedRow).forEach(function(tr){
          var td=tr.querySelector('[data-col="owner"]');
          var v=(td&&td.textContent||'').trim();
          if(v&&v!=='-') owners[v]=true;
        });
        var sorted=Object.keys(owners).sort();
        var html='<option value="">전체</option>';
        sorted.forEach(function(n){ html+='<option value="'+n+'"'+(n===curVal?' selected':'')+'>'+n+'</option>'; });
        sel.innerHTML=html;
      }

      function fmCellText(td){ var t=String((td && td.textContent) || '').trim(); return (t==='-'? '' : t); }
      function fmRowToData(tr){
        function col(name){ return fmCellText(tr.querySelector('[data-col="'+name+'"]')); }
        var s = parseInt(col('s'),10)||1;
        var o = parseInt(col('o'),10)||1;
        var d = parseInt(col('d'),10)||1;
        s = Math.min(10, Math.max(1, s));
        o = Math.min(10, Math.max(1, o));
        d = Math.min(10, Math.max(1, d));
        var rpn = s*o*d;
        return { process: col('process'), failure: col('failure'), effect: col('effect'), etc: col('etc'), s: String(s), o: String(o), d: String(d), rpn: String(rpn), owner: col('owner'), status: col('status') };
      }
      function fmSerializeAllRows(){
        try{ return Array.from(tbody.querySelectorAll('tr')).filter(fmSavedRow).map(fmRowToData); }catch(_){ return []; }
      }
      function fmScheduleSave(){
        if(!fmTabClient) return;
        try{
          var deb = window.__blsDebounce;
          if(typeof deb !== 'function'){
            fmTabClient.saveMergedLatest(fmTabKey, { risk: { fmea_rows: fmSerializeAllRows() } });
            return;
          }
          deb('prj:tab:'+String(fmTabClient.projectId)+':'+fmTabKey, function(){
            try{ fmTabClient.saveMergedLatest(fmTabKey, { risk: { fmea_rows: fmSerializeAllRows() } }); }catch(_e){ }
          }, 800);
        }catch(_e2){ }
      }
      /* ── Status dot helper ── */
      var _fmStatusColors = {'대기':'#94a3b8','진행':'#f59e0b','완료':'#6366f1'};
      function _fmStatusHtml(val){
        var v=String(val||'').trim(); if(!v||v==='-') return '-';
        var c=_fmStatusColors[v]||'#94a3b8';
        return '<span class="fm-status"><span class="fm-status-dot" style="background:'+c+'"></span><span class="fm-status-text">'+v+'</span></span>';
      }

      function fmBuildSavedRow(data){
        var tr=document.createElement('tr');
        function cell(name, text){ var v=String(text||'').trim(); return '<td data-col="'+name+'">'+(v? v : '-')+'</td>'; }
        var s=parseInt(String(data && data.s || ''),10)||1;
        var o=parseInt(String(data && data.o || ''),10)||1;
        var d=parseInt(String(data && data.d || ''),10)||1;
        s=Math.min(10, Math.max(1,s));
        o=Math.min(10, Math.max(1,o));
        d=Math.min(10, Math.max(1,d));
        var rpn=s*o*d;
        var pv=String((data && data.process)||'').trim();
        tr.innerHTML = ''+
          '<td><input type="checkbox" class="fmea-row-check" aria-label="행 선택"></td>'+
          '<td data-col="process">'+(pv? '<a href="#" class="fmea-process-link" data-action="detail">'+pv+'</a>' : '-')+'</td>'+
          cell('failure', data && data.failure) +
          cell('effect', data && data.effect) +
          cell('s', String(s)) +
          cell('o', String(o)) +
          cell('d', String(d)) +
          cell('rpn', String(rpn)) +
          cell('owner', data && data.owner) +
          '<td data-col="status">'+_fmStatusHtml(data && data.status)+'</td>' +
          cell('etc', data && data.etc) +
          '<td data-col="actions" class="system-actions table-actions">\
            <button type="button" class="action-btn js-fm-toggle" data-action="edit" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button>\
            <button type="button" class="action-btn danger js-fm-del" data-action="delete" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>\
          </td>';
        return tr;
      }
      function fmHydrateFromPayload(payload){
        try{
          var rows = payload && payload.risk && payload.risk.fmea_rows;
          if(!Array.isArray(rows)) return;
          tbody.innerHTML='';
          rows.forEach(function(r){ tbody.appendChild(fmBuildSavedRow(r||{})); });
        }catch(_){ }
      }

      /* ── Filter row: always hidden (filters stay functional via column-filter logic) ── */
      var _fmFilterRow = table.querySelector('tr.fmea-filter-row');
      if(_fmFilterRow) _fmFilterRow.style.display = 'none';
      function _fmUpdateFilterRowVisibility(){ /* no-op: filter row permanently hidden */ }

      function updateEmpty(){
        try{
          var has=!!tbody.querySelector('tr');
          var apply = (typeof window!=='undefined' && window.__blsApplyEmptyState) ? window.__blsApplyEmptyState : null;
          if(typeof apply === 'function'){
            apply({ has: has, emptyEl: emptyEl, tableWrap: tableWrap, paginationEl: paginationEl, useHidden: false });
          } else {
            if(emptyEl){ emptyEl.hidden = has; emptyEl.style.display = has ? 'none' : ''; }
            if(tableWrap){ tableWrap.style.display = has ? '' : 'none'; }
            if(paginationEl){ paginationEl.style.display = has ? '' : 'none'; }
          }
        }catch(_){
          try{ if(emptyEl){ emptyEl.hidden=false; emptyEl.style.display=''; } }catch(__){}
          try{ if(tableWrap){ tableWrap.hidden=false; } }catch(__2){}
          try{ if(paginationEl){ paginationEl.hidden=false; } }catch(__3){}
        }
        fmRenderPage();
        try{ _fmUpdateFilterRowVisibility(); }catch(_fv){}
        if(csvBtn){
          try{
            var hasAny=!!tbody.querySelector('tr');
            csvBtn.disabled=!hasAny;
            csvBtn.setAttribute('aria-disabled', (!hasAny).toString());
            csvBtn.title=hasAny? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.';
          }catch(_2){ }
        }
      }

      if(fmTabClient && typeof fmTabClient.loadLatest === 'function'){
        fmTabClient.loadLatest(fmTabKey).then(function(item){
          try{ fmHydrateFromPayload(item && item.payload); }catch(_){ }
          try{ fmState.page=1; }catch(_2){ }
          try{ updateEmpty(); }catch(_3){ }
          try{ _fmRefreshOwnerFilter(); }catch(_4){ }
        });
      }

      // Initial empty-state render (even before/without DB hydrate)
      try{ updateEmpty(); }catch(_ie){ }

      /* ── Event bindings (guard against SPA re-init duplication) ── */
      var _evBound = table._fmEvBound; table._fmEvBound = true;
      if(!_evBound){
      if(selectAll){ selectAll.addEventListener('change', function(){ var checks=table.querySelectorAll('tbody tr:not([data-hidden]) .fmea-row-check:not([disabled])'); checks.forEach(function(c){ c.checked=!!selectAll.checked; var tr=c.closest('tr'); if(tr){ tr.classList.toggle('selected', !!c.checked); } }); }); }
      table.addEventListener('click', function(ev){ var isControl=ev.target.closest('button, a, input, select, textarea, label'); var onCheckbox=ev.target.closest('input[type="checkbox"].fmea-row-check'); if(isControl && !onCheckbox) return; if(onCheckbox) return; var tr=ev.target.closest('tr'); if(!tr || tr.parentNode.tagName.toLowerCase()!=='tbody') return; var hidden=tr.hasAttribute('data-hidden') || tr.style.display==='none'; if(hidden) return; var cb=tr.querySelector('.fmea-row-check'); if(!cb || cb.disabled) return; cb.checked=!cb.checked; tr.classList.toggle('selected', cb.checked); if(selectAll){ var vis=table.querySelectorAll('tbody tr:not([data-hidden]) .fmea-row-check'); if(vis.length){ selectAll.checked=Array.prototype.every.call(vis,function(c){ return c.checked; }); } } });
      table.addEventListener('change', function(ev){ var cb=ev.target.closest('.fmea-row-check'); if(!cb) return; var tr=cb.closest('tr'); if(tr){ var hidden=tr.hasAttribute('data-hidden') || tr.style.display==='none'; tr.classList.toggle('selected', !!cb.checked && !hidden); } if(selectAll){ var vis=table.querySelectorAll('tbody tr:not([data-hidden]) .fmea-row-check'); if(vis.length){ selectAll.checked=Array.prototype.every.call(vis,function(c){ return c.checked; }); } else { selectAll.checked=false; } } });
      } /* end _evBound guard */

      function option1to10(sel){ var html=''; for(var i=1;i<=10;i++){ html+='<option value="'+i+'">'+i+'</option>'; } return html; }
      function recalcRPNInRow(tr){ if(!tr) return; var sEl=tr.querySelector('[data-col="s"] select'); var oEl=tr.querySelector('[data-col="o"] select'); var dEl=tr.querySelector('[data-col="d"] select'); var s=parseInt(sEl&&sEl.value||'0',10)||0; var o=parseInt(oEl&&oEl.value||'0',10)||0; var d=parseInt(dEl&&dEl.value||'0',10)||0; var rpn=s*o*d; var cell=tr.querySelector('[data-col="rpn"]'); if(cell){ cell.textContent = rpn>0? String(rpn) : '-'; } }

      function buildEditRow(){ var tr=document.createElement('tr');
        var _owOpts='<option value="" selected disabled>선택</option>';
        _fmOrgUsers.forEach(function(n){_owOpts+='<option value="'+n+'">'+n+'</option>';});
        tr.innerHTML=''+
        '<td><input type="checkbox" class="fmea-row-check" aria-label="행 선택"></td>'+
        '<td data-col="process"><input type="text" class="form-input" placeholder="공정/기능"></td>'+
        '<td data-col="failure"><input type="text" class="form-input" placeholder="고장형태"></td>'+
        '<td data-col="effect"><input type="text" class="form-input" placeholder="영향"></td>'+
        '<td data-col="s"><select class="form-input">'+option1to10()+'</select></td>'+
        '<td data-col="o"><select class="form-input">'+option1to10()+'</select></td>'+
        '<td data-col="d"><select class="form-input">'+option1to10()+'</select></td>'+
        '<td data-col="rpn">-</td>'+
        '<td data-col="owner"><select class="form-input">'+_owOpts+'</select></td>'+
        '<td data-col="status"><select class="form-input"><option value="" selected disabled>선택</option><option value="대기">대기</option><option value="진행">진행</option><option value="완료">완료</option></select></td>'+
        '<td data-col="etc"><input type="text" class="form-input" placeholder="비고"></td>'+
        '<td data-col="actions" class="system-actions table-actions">\
          <button type="button" class="action-btn js-fm-toggle" data-action="save" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button>\
          <button type="button" class="action-btn danger js-fm-del" data-action="delete" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>\
        </td>';
        _fmApplySearchable(tr);
        return tr; }

      /* ── FMEA Add Modal ── */
      (function(){
        var addModal=document.getElementById('fmea-add-modal');
        var addClose=document.getElementById('fmea-add-close');
        var addConfirm=document.getElementById('fmea-add-confirm');
        var addForm=document.getElementById('fmea-add-form');
        function openAddModal(){ if(!addModal) return; document.body.classList.add('modal-open'); addModal.classList.add('show'); addModal.setAttribute('aria-hidden','false'); _fmInitAddForm(); }
        function closeAddModal(){ if(!addModal) return; addModal.classList.remove('show'); addModal.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')) document.body.classList.remove('modal-open'); }
        function _fmInitAddForm(){
          // populate S/O/D selects
          ['fmea-add-s','fmea-add-o','fmea-add-d'].forEach(function(id){ var sel=document.getElementById(id); if(!sel) return; sel.innerHTML=''; for(var i=1;i<=10;i++){ var opt=document.createElement('option'); opt.value=String(i); opt.textContent=String(i); sel.appendChild(opt); } });
          // populate owner
          var owSel=document.getElementById('fmea-add-owner');
          if(owSel){ owSel.innerHTML='<option value="" selected disabled>선택</option>'; _fmOrgUsers.forEach(function(n){var o=document.createElement('option');o.value=n;o.textContent=n;owSel.appendChild(o);}); }
          // reset form
          if(addForm) addForm.reset();
          // reset title
          var titleEl=document.getElementById('fmea-add-modal-title');
          var subEl=document.getElementById('fmea-add-modal-subtitle');
          if(titleEl) titleEl.textContent='위험 등록';
          if(subEl) subEl.textContent='새로운 위험 항목을 등록합니다.';
          if(addConfirm) addConfirm.textContent='등록';
          addModal._editTr=null;
        }
        if(addBtn){ addBtn.onclick = function(){ openAddModal(); }; }
        if(addClose) addClose.addEventListener('click', closeAddModal);
        if(addModal){ addModal.addEventListener('click', function(e){ if(e.target===addModal) closeAddModal(); }); }
        if(addConfirm) addConfirm.addEventListener('click', function(){
          var process=(document.getElementById('fmea-add-process')||{}).value||'';
          if(!process.trim()){ alert('공정/기능을 입력하세요.'); return; }
          var data={
            process: process.trim(),
            failure: (document.getElementById('fmea-add-failure')||{}).value||'',
            effect: (document.getElementById('fmea-add-effect')||{}).value||'',
            s: (document.getElementById('fmea-add-s')||{}).value||'1',
            o: (document.getElementById('fmea-add-o')||{}).value||'1',
            d: (document.getElementById('fmea-add-d')||{}).value||'1',
            owner: (document.getElementById('fmea-add-owner')||{}).value||'',
            status: (document.getElementById('fmea-add-status')||{}).value||'',
            etc: (document.getElementById('fmea-add-etc')||{}).value||''
          };
          if(addModal._editTr && addModal._editTr.parentNode){
            // edit mode: replace row
            var newTr=fmBuildSavedRow(data);
            addModal._editTr.parentNode.replaceChild(newTr, addModal._editTr);
          } else {
            tbody.appendChild(fmBuildSavedRow(data));
          }
          updateEmpty(); try{ fmGoLast(); }catch(_){} try{ fmScheduleSave(); }catch(_){} try{ _fmRefreshOwnerFilter(); }catch(_){}
          closeAddModal();
        });
        // Expose for edit button
        window._fmOpenEditModal = function(tr){
          if(!addModal) return;
          openAddModal();
          addModal._editTr = tr;
          var titleEl=document.getElementById('fmea-add-modal-title');
          var subEl=document.getElementById('fmea-add-modal-subtitle');
          if(titleEl) titleEl.textContent='위험 편집';
          if(subEl) subEl.textContent='위험 항목을 수정합니다.';
          if(addConfirm) addConfirm.textContent='저장';
          var d=fmRowToData(tr);
          (document.getElementById('fmea-add-process')||{}).value=d.process||'';
          (document.getElementById('fmea-add-failure')||{}).value=d.failure||'';
          (document.getElementById('fmea-add-effect')||{}).value=d.effect||'';
          (document.getElementById('fmea-add-s')||{}).value=d.s||'1';
          (document.getElementById('fmea-add-o')||{}).value=d.o||'1';
          (document.getElementById('fmea-add-d')||{}).value=d.d||'1';
          (document.getElementById('fmea-add-owner')||{}).value=d.owner||'';
          (document.getElementById('fmea-add-status')||{}).value=d.status||'';
          (document.getElementById('fmea-add-etc')||{}).value=d.etc||'';
        };
        // ESC key
        document.addEventListener('keydown', function(e){ if(e.key==='Escape' && addModal && addModal.classList.contains('show')) closeAddModal(); });
      })();

      /* ── FMEA Detail Modal ── */
      (function(){
        var detModal=document.getElementById('fmea-detail-modal');
        var detClose=document.getElementById('fmea-detail-close');
        var detOk=document.getElementById('fmea-detail-ok');
        function openDetail(){ if(!detModal) return; document.body.classList.add('modal-open'); detModal.classList.add('show'); detModal.setAttribute('aria-hidden','false'); }
        function closeDetail(){ if(!detModal) return; detModal.classList.remove('show'); detModal.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')) document.body.classList.remove('modal-open'); }
        if(detClose) detClose.addEventListener('click', closeDetail);
        if(detOk) detOk.addEventListener('click', closeDetail);
        if(detModal){ detModal.addEventListener('click', function(e){ if(e.target===detModal) closeDetail(); }); document.addEventListener('keydown', function(e){ if(e.key==='Escape' && detModal.classList.contains('show')) closeDetail(); }); }
        window._fmOpenDetail = function(tr){
          var d=fmRowToData(tr);
          var s=parseInt(d.s,10)||0, o=parseInt(d.o,10)||0, dd=parseInt(d.d,10)||0, rpn=s*o*dd;
          document.getElementById('fmea-det-process').textContent=d.process||'-';
          document.getElementById('fmea-det-failure').textContent=d.failure||'-';
          document.getElementById('fmea-det-effect').textContent=d.effect||'-';
          document.getElementById('fmea-det-s').textContent=d.s||'-';
          document.getElementById('fmea-det-o').textContent=d.o||'-';
          document.getElementById('fmea-det-d').textContent=d.d||'-';
          document.getElementById('fmea-det-rpn').textContent=rpn>0?String(rpn):'-';
          document.getElementById('fmea-det-owner').textContent=d.owner||'-';
          document.getElementById('fmea-det-status').textContent=d.status||'-';
          document.getElementById('fmea-det-etc').textContent=d.etc||'-';
          var subtitle=document.getElementById('fmea-detail-subtitle');
          if(subtitle) subtitle.textContent=d.process? '공정/기능: '+d.process : '';
          openDetail();
        };
      })();

      if(!_evBound){
      tbody.addEventListener('change', function(e){ var tr=e.target.closest('tr'); if(!tr) return; if(tr.querySelector('td[data-col] select')) recalcRPNInRow(tr); });

      table.addEventListener('click', function(ev){
        // Detail link (공정/기능)
        var detLink=ev.target.closest('.fmea-process-link');
        if(detLink){ ev.preventDefault(); var tr=detLink.closest('tr'); if(tr && window._fmOpenDetail) window._fmOpenDetail(tr); return; }

        var target=ev.target.closest('.js-fm-del, .js-fm-toggle, td[data-col="actions"] .action-btn'); if(!target) return; var tr=ev.target.closest('tr'); if(!tr) return;
        var isDelete = target.classList.contains('js-fm-del') || (!target.classList.contains('js-fm-toggle') && target.classList.contains('action-btn') && target.classList.contains('danger'));
        if(isDelete){ if(tr && tr.parentNode){ tr.parentNode.removeChild(tr); } fmClampPage(); updateEmpty(); try{ fmScheduleSave(); }catch(_e0){ } try{ _fmRefreshOwnerFilter(); }catch(_rf0){ } return; }
        if(target.classList.contains('js-fm-toggle') || target.classList.contains('action-btn')){
          var mode=target.getAttribute('data-action')||'edit';
          if(mode==='edit'){
            // Open edit modal instead of inline editing
            if(window._fmOpenEditModal) window._fmOpenEditModal(tr);
            return;
          }
          if(mode==='save'){
            function getVal(name){ var td=tr.querySelector('[data-col="'+name+'"]'); var el=td? td.querySelector('input, select, textarea') : null; var v=el? el.value : (td? td.textContent : ''); return String(v||'').trim(); }
            function setText(name, val){ var td=tr.querySelector('[data-col="'+name+'"]'); if(!td) return; if(name==='status'){ td.innerHTML=_fmStatusHtml(val); return; } if(name==='process'){ td.innerHTML=val? '<a href="#" class="fmea-process-link" data-action="detail">'+val+'</a>' : '-'; return; } td.textContent=(val===''||val==null)? '-' : String(val); }
            ['process','failure','effect','owner','status','etc'].forEach(function(n){ setText(n, getVal(n)); });
            ['s','o','d'].forEach(function(n){ var v=parseInt(getVal(n),10)||0; if(v<1) v=1; if(v>10) v=10; setText(n, v); });
            var s=parseInt(getVal('s'),10)||0, o=parseInt(getVal('o'),10)||0, d=parseInt(getVal('d'),10)||0; var rpn=s*o*d; setText('rpn', rpn>0? rpn : '-');
            target.setAttribute('data-action','edit'); target.title='편집'; target.setAttribute('aria-label','편집'); target.innerHTML='<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon">';
            var cb=tr.querySelector('.fmea-row-check'); if(cb){ var hidden = tr.hasAttribute('data-hidden') || tr.style.display==='none'; tr.classList.toggle('selected', !!cb.checked && !hidden); }
            try{ fmScheduleSave(); }catch(_e1){ }
            try{ _fmRefreshOwnerFilter(); }catch(_rf1){ }
            return;
          }
        }
      });
      } /* end _evBound guard for delegated table/tbody handlers */

      // CSV export
      function fmEscapeCSV(val){ return '"'+String(val).replace(/"/g,'""')+'"'; }
      function text(tr, col){ var td=tr.querySelector('[data-col="'+col+'"]'); return td? (td.textContent||'').trim() : ''; }
      function fmExportCSV(onlySelected){ var headers=['공정/기능','고장형태','영향','심각도(S)','발생가능성(O)','검출가능성(D)','RPN','책임자','상태','비고']; var cols=['process','failure','effect','s','o','d','rpn','owner','status','etc']; var trs=fmSavedVisibleRows(); if(onlySelected){ trs=trs.filter(function(tr){ var cb=tr.querySelector('.fmea-row-check'); return cb && cb.checked; }); } if(trs.length===0) return; var rows=trs.map(function(tr){ return cols.map(function(c){ return text(tr,c); }); }); var lines=[headers].concat(rows).map(function(arr){ return arr.map(fmEscapeCSV).join(','); }); var csv='\uFEFF'+lines.join('\r\n'); var d=new Date(); var yyyy=d.getFullYear(); var mm=String(d.getMonth()+1).padStart(2,'0'); var dd=String(d.getDate()).padStart(2,'0'); var filename='fmea_'+yyyy+mm+dd+'.csv'; try{ var blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); var url=URL.createObjectURL(blob); var a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);}catch(_){ var a2=document.createElement('a'); a2.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a2.download=filename; document.body.appendChild(a2); a2.click(); document.body.removeChild(a2); } }
      if(!_evBound){
      (function(){ var modalId='wbs-download-modal'; var closeBtn=document.getElementById('wbs-download-close'); var confirmBtn=document.getElementById('wbs-download-confirm'); function openModalLocal(id){ var el=document.getElementById(id); if(!el) return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden','false'); } function closeModalLocal(id){ var el=document.getElementById(id); if(!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } } if(csvBtn){ csvBtn.addEventListener('click', function(){ if(csvBtn.disabled) return; var saved=fmSavedVisibleRows(); var total=saved.length; if(total<=0) return; var selectedCount = saved.filter(function(tr){ var cb=tr.querySelector('.fmea-row-check'); return cb && cb.checked; }).length; var subtitle=document.getElementById('wbs-download-subtitle'); if(subtitle){ subtitle.textContent = selectedCount>0 ? ('선택된 '+selectedCount+'개 또는 전체 '+total+'개 결과 중 범위를 선택하세요.') : ('현재 결과 '+total+'개 항목을 CSV로 내보냅니다.'); } var rowSelectedWrap=document.getElementById('wbs-csv-range-row-selected'); var optSelected=document.getElementById('wbs-csv-range-selected'); var optAll=document.getElementById('wbs-csv-range-all'); if(rowSelectedWrap) rowSelectedWrap.hidden = !(selectedCount>0); if(optSelected){ optSelected.disabled = !(selectedCount>0); optSelected.checked = selectedCount>0; } if(optAll){ optAll.checked = !(selectedCount>0); } openModalLocal(modalId); }); } if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalLocal(modalId); }); } var modalEl=document.getElementById(modalId); if(modalEl){ modalEl.addEventListener('click', function(e){ if(e.target===modalEl) closeModalLocal(modalId); }); document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(modalId); }); } if(confirmBtn){ confirmBtn.addEventListener('click', function(){ var onlySel = !!(document.getElementById('wbs-csv-range-selected') && document.getElementById('wbs-csv-range-selected').checked); fmExportCSV(onlySel); closeModalLocal(modalId); }); } })();
      } /* end _evBound guard for CSV modal */

        // ---- Column Filters (filter row: select dropdowns + owner search) ----
        function fmApplyFilter(){ fmState.page=1; fmRenderPage(); updateEmpty(); }
        (function fmInitFilterRow(){
          // inject filter-row CSS
          if(!document.getElementById('fmea-filter-row-css')){
            var css=document.createElement('style'); css.id='fmea-filter-row-css';
            css.textContent=
              '.fmea-filter-row th{padding:4px 3px;background:rgba(91,64,224,.04)}'+
              '.fmea-filter-select{width:100%;padding:4px 6px;border:1px solid #d1d5db;border-radius:6px;font-size:12px;background:#fff;color:#1f2937;cursor:pointer;box-sizing:border-box}'+
              '.fmea-filter-select:focus{outline:none;border-color:#6366f1;box-shadow:0 0 0 2px rgba(99,102,241,.15)}'+
              '.fmea-filter-row .bls-ss-btn{padding:4px 24px 4px 6px;font-size:12px;line-height:1.3}'+
              '.fmea-filter-row .bls-ss-ctrl{width:100%}'+
              '.fm-status{display:inline-flex;align-items:center;gap:6px}'+
              '.fm-status-dot{width:8px;height:8px;border-radius:50%;display:inline-block;flex-shrink:0}'+
              '.fm-status-text{font-weight:300;color:inherit}';
            document.head.appendChild(css);
          }
          // Position FABs for risk tab (info, download, add)
          (function(){
            var infoB=document.getElementById('fmea-info-btn');
            var dlB=document.getElementById('wbs-download-btn');
            if(infoB) infoB.style.cssText+='right:128px!important;';
            if(dlB)   dlB.style.cssText+='right:74px!important;';
            var sec=document.getElementById('wbs-section');
            if(sec && infoB){
              var h3=sec.querySelector('h3'); if(h3) h3.style.paddingRight='320px';
              var ps=sec.querySelector('h3 .page-size-selector'); if(ps) ps.style.right='182px';
            }
          })();

          // populate S/O/D selects with 1-10
          ['fmea-filter-s','fmea-filter-o','fmea-filter-d'].forEach(function(id){
            var sel=document.getElementById(id); if(!sel) return;
            for(var i=1;i<=10;i++){ var opt=document.createElement('option'); opt.value=String(i); opt.textContent=String(i); sel.appendChild(opt); }
          });

          // bind change on select filters (including owner)
          ['fmea-filter-s','fmea-filter-o','fmea-filter-d','fmea-filter-status','fmea-filter-owner'].forEach(function(id){
            var sel=document.getElementById(id); if(!sel) return;
            var colMap={'fmea-filter-s':'s','fmea-filter-o':'o','fmea-filter-d':'d','fmea-filter-status':'status','fmea-filter-owner':'owner'};
            sel.addEventListener('change', function(){
              var col=colMap[id];
              if(sel.value){ fmState.colFilters[col]=sel.value; } else { delete fmState.colFilters[col]; }
              fmApplyFilter();
            });
          });

          // Apply searchable-select widgets to all filter dropdowns
          _fmRefreshOwnerFilter();
          var _ssFilterFn=window.__blsSearchableSelectFn;
          if(_ssFilterFn){
            ['fmea-filter-s','fmea-filter-o','fmea-filter-d','fmea-filter-status','fmea-filter-owner'].forEach(function(id){
              var s=document.getElementById(id);
              if(s&&!s.dataset.blsSS) _ssFilterFn(s);
            });
          }
        })();

        // Initial
        updateEmpty();

        // ---- FMEA 정보 모달 ----
        if(!_evBound){
        (function(){
          var infoBtn=document.getElementById('fmea-info-btn');
          var infoModal=document.getElementById('fmea-info-modal');
          var infoClose=document.getElementById('fmea-info-close');
          var infoOk=document.getElementById('fmea-info-ok');
          if(!infoBtn||!infoModal) return;
          function openInfo(){ document.body.classList.add('modal-open'); infoModal.classList.add('show'); infoModal.setAttribute('aria-hidden','false'); }
          function closeInfo(){ infoModal.classList.remove('show'); infoModal.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')) document.body.classList.remove('modal-open'); }
          infoBtn.addEventListener('click', openInfo);
          if(infoClose) infoClose.addEventListener('click', closeInfo);
          if(infoOk) infoOk.addEventListener('click', closeInfo);
          infoModal.addEventListener('click', function(e){ if(e.target===infoModal) closeInfo(); });
          document.addEventListener('keydown', function(e){ if(e.key==='Escape' && infoModal.classList.contains('show')) closeInfo(); });
        })();
        } /* end _evBound guard for info modal */

      }catch(_){ /* safe-guard */ }
    }
    if(document.readyState==='loading'){
      document.addEventListener('DOMContentLoaded', runFMEA);
    } else {
      runFMEA();
    }
  })();
  }
  if(document.readyState!=='loading') _boot();
  else document.addEventListener('DOMContentLoaded', _boot);
})();

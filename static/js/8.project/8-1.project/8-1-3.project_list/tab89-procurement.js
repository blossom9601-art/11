// tab89-procurement.js — tab89: 조달관리 (Procurement) — CAPEX 연동 읽기전용
(function(){
  'use strict';
  window.__blsTabInits = window.__blsTabInits || {};
  window.__blsInitFlags = window.__blsInitFlags || {};

  function _boot(){
    var blsGetProjectId = window.blsGetProjectId;
    var blsFetchJson = window.blsFetchJson;

    window.__blsTabInits.tab89 = function(){
      try{
        if(window.__blsInitFlags && window.__blsInitFlags.tab89_tco_initialized) return;

        var table = document.getElementById('tco-table');
        if(!table) return;
        var tableWrap = table.closest('.table-wrap');
        var tbody = table.querySelector('tbody');
        var emptyEl = document.getElementById('tco-empty');
        var csvBtn = document.getElementById('wbs-download-btn');
        var selectAll = document.getElementById('tco-select-all');
        var pageSizeSel = document.getElementById('tco-page-size');
        var sumRow = document.getElementById('tco-sum-row');

        // Pagination
        var PAGE_SIZE = (function(){ var v=parseInt((pageSizeSel&&pageSizeSel.value)||'10',10); return (isNaN(v)||v<=0)?10:v; })();
        var currentPage = 1;
        var firstBtn = document.getElementById('tco-first');
        var prevBtn = document.getElementById('tco-prev');
        var nextBtn = document.getElementById('tco-next');
        var lastBtn = document.getElementById('tco-last');
        var pageNumbers = document.getElementById('tco-page-numbers');
        var infoSpan = document.getElementById('tco-pagination-info');

        function allRows(){ return Array.from(tbody.querySelectorAll('tr')); }
        function totalPages(){ var t=allRows().length; return Math.max(1, Math.ceil(t / PAGE_SIZE)); }
        function buildPages(){
          if(!pageNumbers) return;
          pageNumbers.innerHTML='';
          var tp=totalPages();
          for(var i=1;i<=tp;i++){
            var b=document.createElement('button');
            b.className='page-btn'+(i===currentPage?' active':'');
            b.textContent=String(i);
            (function(n){ b.addEventListener('click', function(){ currentPage=n; applyPagination(); }); })(i);
            pageNumbers.appendChild(b);
          }
        }
        function updateNav(){
          var tp=totalPages();
          if(firstBtn) firstBtn.disabled=currentPage===1;
          if(prevBtn) prevBtn.disabled=currentPage===1;
          if(nextBtn) nextBtn.disabled=currentPage===tp;
          if(lastBtn) lastBtn.disabled=currentPage===tp;
        }
        function applyPagination(){
          var rows=allRows();
          var start=(currentPage-1)*PAGE_SIZE;
          var end=start+PAGE_SIZE;
          rows.forEach(function(r,i){ r.style.display = (i>=start && i<end)?'':'none'; });
          var total=rows.length;
          var from = total===0?0:start+1;
          var to=Math.min(end,total);
          if(infoSpan) infoSpan.textContent = from+'-'+to+' / '+total+'개 항목';
          buildPages();
          updateNav();
        }
        function clampPage(){ var tp=totalPages(); if(currentPage>tp) currentPage=tp; }

        firstBtn&&firstBtn.addEventListener('click', function(){ currentPage=1; applyPagination(); });
        prevBtn&&prevBtn.addEventListener('click', function(){ if(currentPage>1){ currentPage--; applyPagination(); } });
        nextBtn&&nextBtn.addEventListener('click', function(){ var tp=totalPages(); if(currentPage<tp){ currentPage++; applyPagination(); } });
        lastBtn&&lastBtn.addEventListener('click', function(){ currentPage=totalPages(); applyPagination(); });
        if(pageSizeSel){ pageSizeSel.addEventListener('change', function(){ var v=parseInt(this.value,10); PAGE_SIZE = (isNaN(v)||v<=0)?10:v; currentPage=1; applyPagination(); }); }

        var paginationEl = document.getElementById('tco-pagination');
        function updateEmpty(){
          var has = tbody.querySelectorAll('tr').length>0;
          if(emptyEl){ emptyEl.style.display = has? 'none':''; emptyEl.hidden = has; }
          if(tableWrap){ tableWrap.hidden = !has; }
          if(paginationEl){ paginationEl.hidden = !has; }
          try{ clampPage(); }catch(_){}
          try{ applyPagination(); }catch(_){}
        }

        // Selection
        if(selectAll){ selectAll.addEventListener('change', function(){
          allRows().forEach(function(tr){
            var cb=tr.querySelector('.tco-row-check');
            if(cb){ cb.checked=!!selectAll.checked; tr.classList.toggle('selected', !!cb.checked && tr.style.display!=='none'); }
          });
        }); }
        table.addEventListener('change', function(ev){
          var cb=ev.target.closest('.tco-row-check');
          if(!cb) return;
          var tr=cb.closest('tr');
          if(tr) tr.classList.toggle('selected', !!cb.checked && tr.style.display!=='none');
          if(selectAll){
            var vis=table.querySelectorAll('tbody tr .tco-row-check');
            if(vis.length){ selectAll.checked = Array.prototype.every.call(vis, function(c){ return c.checked; }); }
            else { selectAll.checked=false; }
          }
        });

        // Format helpers
        function formatKRW(n){
          if(n==null || isNaN(n) || n===0) return '-';
          try{ return new Intl.NumberFormat('ko-KR',{maximumFractionDigits:0}).format(n)+'원'; }
          catch(_){ return String(n)+'원'; }
        }
        function safeText(v){ return (v!=null && v!=='')? String(v) : '-'; }

        // CSV export
        function escapeCSV(val){ return '"' + String(val).replace(/"/g,'""') + '"'; }
        function text(tr, col){ var td=tr.querySelector('[data-col="'+col+'"]'); return td? (td.textContent||'').trim() : ''; }

        function exportCSV(onlySelected){
          var headers=['구매번호','조달상태','조달방법','조달구분','품목유형','계약업체','제조사','모델명','상세사양','단가','수량','합계금액','유지보수율','무상기간'];
          var cols=['manageNo','contractStatus','contractType','contractDivision','itemType','supplier','manufacturer','model','specification','unitPrice','qty','totalPrice','rate','freeMonths'];
          var trs=allRows();
          if(onlySelected){ trs = trs.filter(function(tr){ var cb=tr.querySelector('.tco-row-check'); return cb && cb.checked; }); }
          if(trs.length===0) return;
          var rows = trs.map(function(tr){ return cols.map(function(c){ return text(tr,c); }); });
          var lines=[headers].concat(rows).map(function(arr){ return arr.map(escapeCSV).join(','); });
          var csv='\uFEFF'+lines.join('\r\n');
          var d=new Date(); var yyyy=d.getFullYear(); var mm=String(d.getMonth()+1).padStart(2,'0'); var dd=String(d.getDate()).padStart(2,'0');
          var filename='procurement_'+yyyy+mm+dd+'.csv';
          try{
            var blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
            var url=URL.createObjectURL(blob);
            var a=document.createElement('a'); a.href=url; a.download=filename;
            document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
          }catch(_){
            var a2=document.createElement('a');
            a2.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
            a2.download=filename; document.body.appendChild(a2); a2.click(); document.body.removeChild(a2);
          }
        }

        if(csvBtn){ csvBtn.addEventListener('click', function(){
          var rows=allRows();
          if(rows.length===0) return;
          var selectedCount = rows.filter(function(tr){ var cb=tr.querySelector('.tco-row-check'); return cb && cb.checked; }).length;
          exportCSV(selectedCount>0);
        }); }

        // Build a table row from a CAPEX tab62 item
        function buildRow(item){
          var tr=document.createElement('tr');
          function cell(name, val){ return '<td data-col="'+name+'">'+safeText(val)+'</td>'; }
          tr.innerHTML =
            '<td><input type="checkbox" class="tco-row-check" aria-label="행 선택"></td>'+
            cell('manageNo', item.manage_no)+
            cell('contractStatus', item.contract_status)+
            cell('contractType', item.contract_type)+
            cell('contractDivision', item.contract_division)+
            cell('itemType', item.item_type)+
            cell('supplier', item.supplier)+
            cell('manufacturer', item.manufacturer)+
            cell('model', item.model)+
            cell('specification', item.specification)+
            '<td data-col="unitPrice" style="text-align:right">'+safeText(formatKRW(item.unit_price))+'</td>'+
            '<td data-col="qty" style="text-align:right">'+(item.quantity!=null? String(item.quantity) : '-')+'</td>'+
            '<td data-col="totalPrice" style="text-align:right">'+safeText(formatKRW(item.total_price))+'</td>'+
            '<td data-col="rate" style="text-align:right">'+(item.rate!=null && item.rate!==''? String(item.rate)+'%' : '-')+'</td>'+
            cell('freeMonths', item.free_support_months!=null? String(item.free_support_months)+'개월' : '-');
          return tr;
        }

        // Compute sum row
        function updateSumRow(){
          var rows=allRows();
          if(rows.length===0){ if(sumRow) sumRow.hidden=true; return; }
          var totalPriceSum=0;
          var qtySum=0;
          rows.forEach(function(tr){
            var td=tr.querySelector('[data-col="totalPrice"]');
            if(td){
              var v=Number(String(td.textContent||'').replace(/[^0-9.-]/g,''))||0;
              totalPriceSum+=v;
            }
            var qtd=tr.querySelector('[data-col="qty"]');
            if(qtd){
              var q=Number(String(qtd.textContent||'').replace(/[^0-9.-]/g,''))||0;
              qtySum+=q;
            }
          });
          if(sumRow){
            sumRow.hidden=false;
            var totalEl=document.getElementById('tco-sum-total');
            if(totalEl) totalEl.textContent=formatKRW(totalPriceSum);
            var qtyEl=document.getElementById('tco-sum-qty');
            if(qtyEl) qtyEl.textContent=qtySum>0? String(qtySum) : '-';
          }
        }

        // Raw fetch helper — always returns parsed JSON directly
        // (blsFetchJson wraps response in {ok,data} which complicates handling)
        function _fetchJSON(url){
          return fetch(url, {credentials:'same-origin'}).then(function(r){ return r.json(); });
        }

        // Load data from API — use blsGetProjectId() (URL/sessionStorage, immediately available)
        // then fetch project data to get project_number, then fetch CAPEX items
        function loadData(){
          // 1) Try DOM first (fast path for SPA re-navigation)
          var projNumEl = document.getElementById('ov-project-number');
          var projectNo = projNumEl? (projNumEl.textContent||'').trim() : '';
          if(projectNo && projectNo!=='-'){
            fetchItems(projectNo);
            return;
          }
          // 2) Use blsGetProjectId → fetch project API → get project_number
          var pid = blsGetProjectId ? blsGetProjectId() : null;
          if(!pid){
            console.warn('[tab89] No project ID found');
            updateEmpty();
            return;
          }
          _fetchJSON('/api/prj/projects/'+pid)
          .then(function(data){
            var pno = '';
            if(data && data.success && data.item){
              pno = (data.item.project_number||'').trim();
            }
            if(pno && pno!=='-'){
              fetchItems(pno);
            } else {
              console.warn('[tab89] project_number not found for id='+pid, data);
              updateEmpty();
            }
          })
          .catch(function(err){
            console.error('[tab89] project fetch failed:', err);
            updateEmpty();
          });
        }

        function fetchItems(projectNo){
          var url='/api/capex-contract-items/by-project?project_no='+encodeURIComponent(projectNo);
          _fetchJSON(url)
          .then(function(data){
            tbody.innerHTML='';
            if(data && data.success && data.items && data.items.length>0){
              data.items.forEach(function(item){
                tbody.appendChild(buildRow(item));
              });
            }
            updateSumRow();
            updateEmpty();
          })
          .catch(function(err){
            console.error('[tab89/procurement] CAPEX fetch failed:', err);
            updateEmpty();
          });
        }

        // Row select toggle
        tbody.addEventListener('click', function(e){
          if(e.target.closest('button, input, select, textarea, a')) return;
          var tr=e.target.closest('tr');
          if(!tr) return;
          if(tr.classList.contains('selected')){ tr.classList.remove('selected'); }
          else { tbody.querySelectorAll('tr.selected').forEach(function(r){ r.classList.remove('selected'); }); tr.classList.add('selected'); }
        });

        // Initial load
        window.__blsInitFlags.tab89_tco_initialized = true;
        loadData();

      }catch(e){ console.error('[tab89] init error:', e); }
    };

    if(document.readyState !== 'loading'){ window.__blsTabInits.tab89(); }
    else { document.addEventListener('DOMContentLoaded', function(){ window.__blsTabInits.tab89(); }); }
  }

  if(document.readyState!=='loading') _boot();
  else document.addEventListener('DOMContentLoaded', _boot);
})();

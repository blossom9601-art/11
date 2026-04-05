// tab84-cost.js — tab84: 비용관리 (Cost)
(function(){
  'use strict';
  window.__blsTabInits = window.__blsTabInits || {};
  window.__blsInitFlags = window.__blsInitFlags || {};

  /* ── Flatpickr lazy-loader (워크플로우 동일) ── */
  var FP_VER  = '4.6.13';
  var FP_BASE = '/static/vendor/flatpickr/' + FP_VER;
  var FP_CSS  = FP_BASE + '/flatpickr.min.css';
  var FP_THEME= FP_BASE + '/themes/airbnb.css';
  var FP_JS   = FP_BASE + '/flatpickr.min.js';
  var FP_KO   = FP_BASE + '/l10n/ko.js';
  var __fpPromise = null;

  function _ensureCss(href, id){
    try{
      var existing = document.getElementById(id);
      if(existing && existing.tagName.toLowerCase()==='link'){
        if(existing.getAttribute('href')!==href) existing.setAttribute('href',href);
        return;
      }
      var l = document.createElement('link'); l.rel='stylesheet'; l.href=href;
      if(id) l.id = id; document.head.appendChild(l);
    }catch(_){}
  }
  function _loadScript(src){
    return new Promise(function(res,rej){
      try{ var s=document.createElement('script'); s.src=src; s.async=true;
        s.onload=function(){res(true);}; s.onerror=function(){rej(new Error('FAILED '+src));};
        document.head.appendChild(s); }catch(e){ rej(e); }
    });
  }
  function _ensureFlatpickr(){
    _ensureCss(FP_CSS, 'flatpickr-css');
    _ensureCss(FP_THEME, 'flatpickr-theme-css');
    if(window.flatpickr) return Promise.resolve();
    if(__fpPromise) return __fpPromise;
    __fpPromise = _loadScript(FP_JS)
      .then(function(){ return _loadScript(FP_KO).catch(function(){}); })
      .catch(function(e){ __fpPromise=null; throw e; });
    return __fpPromise;
  }
  function _ensureTodayBtn(fp){
    try{
      var cal = fp && fp.calendarContainer; if(!cal) return;
      if(cal.querySelector('.fp-today-btn')) return;
      var btn = document.createElement('button'); btn.type='button';
      btn.className='fp-today-btn'; btn.textContent='오늘';
      btn.addEventListener('click',function(){ fp.setDate(new Date(),true); });
      cal.appendChild(btn);
    }catch(_){}
  }
  function _initDatePicker(inp){
    if(!inp || inp._flatpickr) return;
    _ensureFlatpickr().then(function(){
      if(!window.flatpickr || inp._flatpickr) return;
      var koLocale = (window.flatpickr.l10ns && window.flatpickr.l10ns.ko)
                       ? window.flatpickr.l10ns.ko : 'ko';
      window.flatpickr(inp, {
        dateFormat: 'Y-m-d',
        allowInput: true,
        disableMobile: true,
        clickOpens: true,
        appendTo: document.body,
        locale: koLocale,
        onReady:  function(_s, _d, inst){ _ensureTodayBtn(inst); },
        onOpen:   function(_s, _d, inst){ _ensureTodayBtn(inst); }
      });
    }).catch(function(){});
  }

  function _boot(){
    var blsMakeTabCrud = window.blsMakeTabCrud;
    var blsGetProjectId = window.blsGetProjectId;
    var _esc = window._blsEsc;
    if(!blsMakeTabCrud) return;

    /* ════════ Tab74: 비용 관리 (Cost) ════════ */
    window.__blsTabInits.tab84 = blsMakeTabCrud({
      tableId:'eva-spec-table', prefix:'eva', tabKey:'cost',
      addBtnId:null, csvBtnId:'eva-download-btn', uploadBtnId:null,
      downloadModalPrefix:'wbs', uploadModalPrefix:null,
      csvFilename:'cost', xlsxSheet:'비용관리',
      hideDelete:true,
      columns:[
        {key:'division', label:'구분', type:'text', locked:true},
        {key:'activity', label:'활동명', type:'text', locked:true},
        {key:'task', label:'작업명', type:'text', locked:true},
        {key:'planned', label:'계획비용', type:'text', placeholder:'0',
          renderSaved:function(v){
            var n=parseFloat(String(v||'0').replace(/,/g,''))||0;
            return n?n.toLocaleString():'0';
          },
          inputFilter:function(inp){
            inp.addEventListener('input',function(){
              var pos=inp.selectionStart;
              var raw=inp.value.replace(/[^0-9]/g,'');
              var formatted=raw?parseInt(raw,10).toLocaleString():'';
              var diff=formatted.length-inp.value.length;
              inp.value=formatted;
              inp.selectionStart=inp.selectionEnd=Math.max(0,(pos||0)+diff);
            });
            var raw=inp.value.replace(/[^0-9]/g,'');
            if(raw) inp.value=parseInt(raw,10).toLocaleString();
          }
        },
        {key:'actual', label:'실제비용', type:'text', locked:true,
          renderSaved:function(v){
            var n=parseFloat(String(v||'0').replace(/,/g,''))||0;
            return '<span class="actual-link">'+(n?n.toLocaleString():'0')+'</span>';
          }
        },
        {key:'details', type:'hidden'},
        {key:'remaining', label:'잔여비용', type:'computed', compute:function(d){
          var p=parseFloat(String(d.planned||'0').replace(/,/g,''))||0;
          var a=parseFloat(String(d.actual||'0').replace(/,/g,''))||0;
          var v=p-a; return v!==0?v.toLocaleString():'0';
        }},
        {key:'rate', label:'사용률', type:'computed', compute:function(d){
          var p=parseFloat(String(d.planned||'0').replace(/,/g,''))||0;
          var a=parseFloat(String(d.actual||'0').replace(/,/g,''))||0;
          if(!p) return '-';
          return (a/p*100).toFixed(1)+'%';
        }},
        {key:'note', label:'비고', type:'text', placeholder:''}
      ],
      onPostLoad:function(ctx){
        /* Always sync division/activity from WBS scope, preserving cost data */
        if(!ctx.tabClient) return;
        ctx.tabClient.loadLatest('scope').then(function(si){
          if(!si||!si.payload||!Array.isArray(si.payload.rows)) return;
          var scopeRows=si.payload.rows;
          var existing={};
          ctx.allRows().forEach(function(tr){
            var divTd=tr.querySelector('[data-col="division"]');
            var actTd=tr.querySelector('[data-col="activity"]');
            var div=(divTd?divTd.textContent:'').trim();
            var act=(actTd?actTd.textContent:'').trim();
            var key=div+'|'+act;
            var plannedTd=tr.querySelector('[data-col="planned"]')||tr.querySelector('[data-col="pv"]');
            var actualTd=tr.querySelector('[data-col="actual"]')||tr.querySelector('[data-col="ac"]');
            var detailsTd=tr.querySelector('[data-col="details"]');
            var taskTd=tr.querySelector('[data-col="task"]');
            var noteTd=tr.querySelector('[data-col="note"]');
            existing[key]={
              planned:(plannedTd?plannedTd.textContent:'').trim(),
              actual:(actualTd?actualTd.textContent:'').trim(),
              details:(detailsTd?detailsTd.textContent:'').trim(),
              task:(taskTd?taskTd.textContent:'').trim(),
              note:(noteTd?noteTd.textContent:'').trim()
            };
          });
          var newRows=scopeRows.map(function(w){
            var key=(w.division||'').trim()+'|'+(w.activity||'').trim();
            var prev=existing[key]||{};
            return {division:w.division||'',activity:w.activity||'',task:w.task||'',planned:prev.planned||'',actual:prev.actual||'',details:prev.details||'[]',note:prev.note||""};
          });
          var oldKeys=ctx.allRows().map(function(tr){
            var d=(tr.querySelector('[data-col="division"]')||{}).textContent||'';
            var a=(tr.querySelector('[data-col="activity"]')||{}).textContent||'';
            return d.trim()+'|'+a.trim();
          });
          var newKeys=newRows.map(function(r){return r.division.trim()+'|'+r.activity.trim();});
          var changed=oldKeys.length!==newKeys.length||oldKeys.some(function(k,i){return k!==newKeys[i];});
          if(!changed&&oldKeys.length>0){
            /* Keys unchanged — still sync task from WBS scope */
            var scopeTaskMap={};
            scopeRows.forEach(function(w){
              var k2=(w.division||'').trim()+'|'+(w.activity||'').trim();
              scopeTaskMap[k2]=w.task||'';
            });
            ctx.allRows().forEach(function(tr){
              var d2=(tr.querySelector('[data-col="division"]')||{}).textContent||'';
              var a2=(tr.querySelector('[data-col="activity"]')||{}).textContent||'';
              var k2=d2.trim()+'|'+a2.trim();
              var taskTd2=tr.querySelector('[data-col="task"]');
              if(taskTd2 && scopeTaskMap[k2]!=null){
                var cur=(taskTd2.textContent||'').trim();
                var nv=scopeTaskMap[k2];
                if(cur!==nv) taskTd2.textContent=nv||'-';
              }
            });
            if(typeof ctx.updateTotals==='function') ctx.updateTotals();
            return;
          }
          while(ctx.tbody.firstChild) ctx.tbody.removeChild(ctx.tbody.firstChild);
          newRows.forEach(function(r){ ctx.tbody.appendChild(ctx.buildSavedRow(r)); });
          ctx.updateEmpty(); ctx.scheduleSave();
        }).catch(function(){});
      },
      onInit:function(ctx){
        /* ── Cost detail modal: 실제비용 상세 (DB-backed) ── */
        var cdModal=document.getElementById('eva-cost-detail-modal');
        var cdTbody=document.getElementById('eva-cost-detail-tbody');
        var cdClose=document.getElementById('eva-cost-detail-close');
        var cdAdd=document.getElementById('eva-cost-detail-add');
        var cdSum=document.getElementById('eva-cost-detail-sum');
        var cdSubtitle=document.getElementById('eva-cost-detail-subtitle');
        var _cdTargetTr=null;
        var _cdRowKey='';
        var _cdCurrentUser=(cdModal?cdModal.getAttribute('data-current-user'):'')||'';
        var _cdCostTypes=['인건비','외주비','장비구매','라이선스','클라우드','출장비','교육비','기타'];

        function _cdFmtAmt(v){
          var n=parseFloat(String(v||'0').replace(/,/g,''))||0;
          return n?n.toLocaleString():'0';
        }

        function _cdUpdateSum(){
          var s=0;
          if(cdTbody) Array.from(cdTbody.querySelectorAll('tr')).forEach(function(r){
            var td=r.querySelector('[data-cd="amount"]');
            if(!td) return;
            var inp=td.querySelector('input');
            var raw=inp?(inp.value||''):(td.textContent||'');
            s+=parseFloat(raw.replace(/,/g,''))||0;
          });
          if(cdSum) cdSum.textContent=s?s.toLocaleString():'0';
        }

        /* ── Build a SAVED (readonly) row ── */
        function _cdBuildRow(d){
          d=d||{};
          var r=document.createElement('tr');
          r.setAttribute('data-cd-mode','saved');
          r.innerHTML=
            '<td class="cd-chk-cell"><input type="checkbox" class="cd-row-chk" aria-label="행 선택"></td>'+
            '<td data-cd="costDate">'+_esc(d.costDate||'')+'</td>'+
            '<td data-cd="costType">'+_esc(d.costType||'')+'</td>'+
            '<td data-cd="content">'+_esc(d.content||'')+'</td>'+
            '<td data-cd="erpAccount">'+_esc(d.erpAccount||'')+'</td>'+
            '<td data-cd="amount" style="text-align:right;">'+_esc(_cdFmtAmt(d.amount||''))+'</td>'+
            '<td data-cd="registrant">'+_esc(d.registrant||_cdCurrentUser||'')+'</td>'+
            '<td class="table-actions">'+
              '<div class="system-actions">'+
              '<button type="button" class="action-btn js-cd-toggle" data-action="edit" title="수정" aria-label="수정"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="수정" class="action-icon"></button>'+
              '<button type="button" class="action-btn js-cd-del" data-action="delete" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'+
              '</div>'+
            '</td>';
          return r;
        }

        /* ── Build an EDITING row (new or from toggle) ── */
        function _cdBuildEditRow(d){
          d=d||{};
          var r=document.createElement('tr');
          r.setAttribute('data-cd-mode','editing');
          r.innerHTML=
            '<td class="cd-chk-cell"><input type="checkbox" class="cd-row-chk" aria-label="행 선택"></td>'+
            '<td data-cd="costDate"><input type="text" class="form-input date-input" value="'+_esc(d.costDate||'')+'" placeholder="YYYY-MM-DD"></td>'+
            '<td data-cd="costType"><select class="form-input">'+
              '<option value=""'+((!d.costType)?' selected':'')+' disabled>선택</option>'+
              _cdCostTypes.map(function(o){return '<option value="'+o+'"'+(o===d.costType?' selected':'')+'>'+o+'</option>';}).join('')+
            '</select></td>'+
            '<td data-cd="content"><input type="text" class="form-input" value="'+_esc(d.content||'')+'" placeholder="내용"></td>'+
            '<td data-cd="erpAccount"><input type="text" class="form-input" value="'+_esc(d.erpAccount||'')+'" placeholder="ERP계정"></td>'+
            '<td data-cd="amount"><input type="text" class="form-input" value="'+_esc(_cdFmtAmt(d.amount||''))+'" placeholder="0" style="text-align:right;"></td>'+
            '<td data-cd="registrant">'+_esc(d.registrant||_cdCurrentUser||'')+'</td>'+
            '<td class="table-actions">'+
              '<div class="system-actions">'+
              '<button type="button" class="action-btn js-cd-toggle" data-action="save" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button>'+
              '<button type="button" class="action-btn js-cd-del" data-action="delete" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'+
              '</div>'+
            '</td>';
          /* comma formatting on amount input */
          var amtInp=r.querySelector('[data-cd="amount"] input');
          if(amtInp){
            amtInp.addEventListener('input',function(){
              var pos=amtInp.selectionStart;
              var raw=amtInp.value.replace(/[^0-9]/g,'');
              var formatted=raw?parseInt(raw,10).toLocaleString():'';
              var diff=formatted.length-amtInp.value.length;
              amtInp.value=formatted;
              amtInp.selectionStart=amtInp.selectionEnd=Math.max(0,(pos||0)+diff);
              _cdUpdateSum();
            });
          }
          return r;
        }

        /* ── Read data from a single row (saved or editing) ── */
        function _cdReadRow(r){
          function v(k){
            var td=r.querySelector('[data-cd="'+k+'"]'); if(!td) return '';
            var el=td.querySelector('input,select');
            if(el) return (el.value||'').trim();
            var sp=td.querySelector('span.form-input');
            if(sp) return (sp.textContent||'').trim();
            return (td.textContent||'').trim();
          }
          return {costDate:v('costDate'),costType:v('costType'),content:v('content'),erpAccount:v('erpAccount'),amount:v('amount'),registrant:v('registrant')};
        }

        /* ── Validate required fields before save ── */
        function _cdValidateRow(tr){
          var required=['costDate','costType','content','amount'];
          var valid=true;
          required.forEach(function(k){
            var td=tr.querySelector('[data-cd="'+k+'"]'); if(!td) return;
            var el=td.querySelector('input,select');
            if(!el) return;
            var val=(el.value||'').trim();
            if(!val || (el.tagName==='SELECT' && !val)){
              el.classList.add('input-error');
              valid=false;
            } else {
              el.classList.remove('input-error');
            }
          });
          return valid;
        }

        /* ── Switch row: editing → saved ── */
        function _cdMakeSaved(tr){
          var d=_cdReadRow(tr);
          var newTr=_cdBuildRow(d);
          tr.parentNode.replaceChild(newTr,tr);
          _cdUpdateSum();
          return newTr;
        }

        /* ── Switch row: saved → editing ── */
        function _cdMakeEditing(tr){
          var d=_cdReadRow(tr);
          var newTr=_cdBuildEditRow(d);
          tr.parentNode.replaceChild(newTr,tr);
          _cdUpdateSum();
          /* init flatpickr */
          try{ var di=newTr.querySelector('.date-input'); if(di) _initDatePicker(di); }catch(_){}
          return newTr;
        }

        /* ── Bulk-save all rows to DB + sync parent table ── */
        function _cdBulkSaveAndSync(){
          var items=_cdSerialize();
          var sum=0; items.forEach(function(it){sum+=parseFloat(String(it.amount||'0').replace(/,/g,''))||0;});
          var pid=blsGetProjectId();
          if(pid&&_cdRowKey){
            fetch('/api/prj/projects/'+pid+'/cost-details/bulk-save',{
              method:'POST', credentials:'same-origin',
              headers:{'Content-Type':'application/json'},
              body:JSON.stringify({row_key:_cdRowKey, items:items})
            }).then(function(res){return res.json();})
              .then(function(data){ if(!data.success) console.warn('[cost-detail] bulk-save failed:', data.message); })
              .catch(function(err){ console.warn('[cost-detail] bulk-save error:', err); });
          }
          /* Update parent actual cell */
          if(_cdTargetTr){
            var actualTd=_cdTargetTr.querySelector('[data-col="actual"]');
            var _isEditing=_cdTargetTr.querySelector('.js-tab-toggle[data-action="save"]');
            if(actualTd){
              if(_isEditing){ actualTd.innerHTML='<input type="text" class="form-input actual-input" value="'+(sum?sum.toLocaleString():'0')+'" readonly>'; }
              else { actualTd.innerHTML='<span class="actual-link">'+(sum?sum.toLocaleString():'0')+'</span>'; }
            }
            var detailsTd=_cdTargetTr.querySelector('[data-col="details"]');
            if(detailsTd) detailsTd.textContent=JSON.stringify(items);
            var dd={};
            ctx.cols.forEach(function(c){ var td2=_cdTargetTr.querySelector('[data-col="'+c.key+'"]');if(!td2){dd[c.key]='';return;} var el=td2.querySelector('input,select,textarea'); dd[c.key]=el?(el.value||'').trim():(td2.textContent||'').trim(); if(dd[c.key]==='-') dd[c.key]=''; });
            ctx.cols.forEach(function(c){ if(c.type!=='computed'||!c.compute) return; var vv; try{vv=c.compute(dd);}catch(_e){vv='-';} var td2=_cdTargetTr.querySelector('[data-col="'+c.key+'"]'); if(td2) td2.textContent=(!vv&&vv!==0)?'-':String(vv); });
            ctx.scheduleSave();
          }
        }

        function _cdSerialize(){
          if(!cdTbody) return [];
          return Array.from(cdTbody.querySelectorAll('tr')).map(function(r){ return _cdReadRow(r); });
        }

        /* Open modal on clicking 실제비용 cell — load from DB */
        var tbl=ctx.table;
        console.log('[tab84-cost] onInit: tbl=', !!tbl, 'cdModal=', !!cdModal);
        if(tbl&&cdModal) tbl.addEventListener('click',function(ev){
          var td=ev.target.closest('td[data-col="actual"]');
          if(!td) return;
          /* skip clicks inside tfoot (totals row) */
          if(td.closest('tfoot')) return;
          console.log('[tab84-cost] actual cell clicked');
          var tr=td.closest('tr'); if(!tr) return;
          _cdTargetTr=tr;
          var divTd=tr.querySelector('[data-col="division"]');
          var actTd=tr.querySelector('[data-col="activity"]');
          var divText=(divTd?divTd.textContent:'').trim()||'-';
          var actText=(actTd?actTd.textContent:'').trim()||'-';
          _cdRowKey=divText+'|'+actText;
          if(cdSubtitle) cdSubtitle.textContent=actText+' 비용 항목을 등록·관리합니다.';
          if(cdTbody) cdTbody.innerHTML='';
          _cdUpdateSum();

          /* Fetch from DB */
          var pid=blsGetProjectId();
          if(pid){
            fetch('/api/prj/projects/'+pid+'/cost-details?row_key='+encodeURIComponent(_cdRowKey),{credentials:'same-origin'})
              .then(function(res){return res.json();})
              .then(function(data){
                if(data.success&&Array.isArray(data.items)){
                  data.items.forEach(function(d){ cdTbody.appendChild(_cdBuildRow(d)); });
                  _cdUpdateSum();
                  /* init flatpickr on date inputs */
                  try{
                    if(cdTbody) cdTbody.querySelectorAll('.date-input').forEach(function(inp){
                      _initDatePicker(inp);
                    });
                  }catch(_){}
                }
              }).catch(function(){});
          } else {
            /* fallback: load from hidden details td (legacy) */
            var detailsTd=tr.querySelector('[data-col="details"]');
            var details=[];
            try{ details=JSON.parse((detailsTd?detailsTd.textContent:'')||'[]'); }catch(_){}
            if(!Array.isArray(details)) details=[];
            details.forEach(function(d){ cdTbody.appendChild(_cdBuildRow(d)); });
            _cdUpdateSum();
          }
          ctx.openModal(cdModal);
          try{
            if(cdTbody) cdTbody.querySelectorAll('.date-input').forEach(function(inp){
              _initDatePicker(inp);
            });
          }catch(_){}
        });

        if(cdAdd) cdAdd.addEventListener('click',function(){
          if(cdTbody){
            var newRow=_cdBuildEditRow({registrant:_cdCurrentUser});
            cdTbody.appendChild(newRow);
            _cdUpdateSum();
            try{
              var di=newRow.querySelector('.date-input');
              if(di) _initDatePicker(di);
            }catch(_){}
          }
        });

        /* ── Checkbox: select-all + row toggle ── */
        var cdSelectAll=document.getElementById('cd-select-all');
        function _cdSyncSelectAll(){
          if(!cdSelectAll||!cdTbody) return;
          var boxes=cdTbody.querySelectorAll('.cd-row-chk');
          var all=boxes.length>0 && Array.from(boxes).every(function(cb){return cb.checked;});
          cdSelectAll.checked=all;
        }
        if(cdSelectAll) cdSelectAll.addEventListener('change',function(){
          if(!cdTbody) return;
          var checked=cdSelectAll.checked;
          cdTbody.querySelectorAll('.cd-row-chk').forEach(function(cb){
            cb.checked=checked;
            var tr=cb.closest('tr');
            if(tr){ if(checked) tr.classList.add('selected'); else tr.classList.remove('selected'); }
          });
        });
        if(cdTbody) cdTbody.addEventListener('change',function(ev){
          if(!ev.target.classList.contains('cd-row-chk')) return;
          var tr=ev.target.closest('tr');
          if(tr){ if(ev.target.checked) tr.classList.add('selected'); else tr.classList.remove('selected'); }
          _cdSyncSelectAll();
        });

        /* Delegate: row click → toggle checkbox + selection */
        if(cdTbody) cdTbody.addEventListener('click',function(ev){
          /* skip if clicking on interactive elements */
          if(ev.target.closest('.action-btn,.js-cd-toggle,.js-cd-del,input,select,textarea,button')) return;
          var tr=ev.target.closest('tr'); if(!tr) return;
          var chk=tr.querySelector('.cd-row-chk'); if(!chk) return;
          chk.checked=!chk.checked;
          if(chk.checked) tr.classList.add('selected'); else tr.classList.remove('selected');
          _cdSyncSelectAll();
        });

        /* Delegate: edit/save toggle + delete */
        if(cdTbody) cdTbody.addEventListener('click',function(ev){
          /* ── Toggle: edit ↔ save ── */
          var toggle=ev.target.closest('.js-cd-toggle');
          if(toggle){
            var tr=toggle.closest('tr'); if(!tr) return;
            var action=toggle.getAttribute('data-action');
            if(action==='edit'){
              _cdMakeEditing(tr);
            } else if(action==='save'){
              if(!_cdValidateRow(tr)) return;
              _cdMakeSaved(tr);
              _cdBulkSaveAndSync();
            }
            return;
          }
          /* ── Delete ── */
          var del=ev.target.closest('.js-cd-del'); if(!del) return;
          var r=del.closest('tr'); if(r&&r.parentNode) r.parentNode.removeChild(r);
          _cdUpdateSum();
          _cdBulkSaveAndSync();
        });

        /* Close / 닫기 handler — discard unsaved, reload from DB */
        function _cdCloseModal(){
          /* Re-fetch saved data from DB to update parent actual cell */
          var pid=blsGetProjectId();
          if(pid&&_cdRowKey){
            fetch('/api/prj/projects/'+pid+'/cost-details?row_key='+encodeURIComponent(_cdRowKey),{credentials:'same-origin'})
              .then(function(res){return res.json();})
              .then(function(data){
                if(data.success&&Array.isArray(data.items)){
                  var sum=0;
                  data.items.forEach(function(it){ sum+=parseFloat(String(it.amount||'0').replace(/,/g,''))||0; });
                  if(_cdTargetTr){
                    var actualTd=_cdTargetTr.querySelector('[data-col="actual"]');
                    var _isEditing=_cdTargetTr.querySelector('.js-tab-toggle[data-action="save"]');
                    if(actualTd){
                      if(_isEditing){ actualTd.innerHTML='<input type="text" class="form-input actual-input" value="'+(sum?sum.toLocaleString():'0')+'" readonly>'; }
                      else { actualTd.innerHTML='<span class="actual-link">'+(sum?sum.toLocaleString():'0')+'</span>'; }
                    }
                    var detailsTd=_cdTargetTr.querySelector('[data-col="details"]');
                    if(detailsTd) detailsTd.textContent=JSON.stringify(data.items);
                    var dd={};
                    ctx.cols.forEach(function(c){ var td2=_cdTargetTr.querySelector('[data-col="'+c.key+'"]');if(!td2){dd[c.key]='';return;} var el=td2.querySelector('input,select,textarea'); dd[c.key]=el?(el.value||'').trim():(td2.textContent||'').trim(); if(dd[c.key]==='-') dd[c.key]=''; });
                    ctx.cols.forEach(function(c){ if(c.type!=='computed'||!c.compute) return; var vv; try{vv=c.compute(dd);}catch(_e){vv='-';} var td2=_cdTargetTr.querySelector('[data-col="'+c.key+'"]'); if(td2) td2.textContent=(!vv&&vv!==0)?'-':String(vv); });
                    ctx.scheduleSave();
                  }
                }
              }).catch(function(){});
          }
          ctx.closeModal(cdModal);
          _cdTargetTr=null;
        }
        if(cdClose) cdClose.addEventListener('click',_cdCloseModal);
        var cdCloseBtn=document.getElementById('eva-cost-detail-close-btn');
        if(cdCloseBtn) cdCloseBtn.addEventListener('click',_cdCloseModal);
        if(cdModal) cdModal.addEventListener('click',function(e){ if(e.target===cdModal) _cdCloseModal(); });

        /* ── EVA info modal: open/close ── */
        var infoBtn=document.getElementById('eva-info-btn');
        var infoModal=document.getElementById('eva-info-modal');
        var infoClose=document.getElementById('eva-info-close');
        var infoOk=document.getElementById('eva-info-ok');
        if(infoBtn&&infoModal){
          infoBtn.addEventListener('click',function(){ctx.openModal(infoModal);});
          if(infoClose) infoClose.addEventListener('click',function(){ctx.closeModal(infoModal);});
          if(infoOk) infoOk.addEventListener('click',function(){ctx.closeModal(infoModal);});
          infoModal.addEventListener('click',function(e){if(e.target===infoModal)ctx.closeModal(infoModal);});
        }
        /* ── Stats modal: compute summary, budget-vs-actual chart, cost-type donut ── */
        var statsBtn=document.getElementById('eva-stats-btn');
        var statsModal=document.getElementById('eva-stats-modal');
        var statsClose=document.getElementById('eva-stats-close');
        var statsOk=document.getElementById('eva-stats-ok');
        var statsEmpty=document.getElementById('eva-stats-empty');
        var statsContent=document.getElementById('eva-stats-content');

        var _typeColors=['#6366f1','#0ea5e9','#f59e0b','#10b981','#ef4444','#8b5cf6','#ec4899','#14b8a6'];

        function _renderTypeDonut(summary){
          var donut=document.getElementById('eva-type-donut');
          var legend=document.getElementById('eva-type-legend');
          var centerEl=document.getElementById('eva-donut-total');
          if(!donut||!legend) return;

          /* Aggregate all cost detail items by costType */
          var typeMap={};
          var total=0;
          Object.keys(summary).forEach(function(key){
            var items=summary[key];
            if(!Array.isArray(items)) return;
            items.forEach(function(it){
              var t=it.costType||'기타';
              var a=parseFloat(it.amount)||0;
              if(!a) return;
              typeMap[t]=(typeMap[t]||0)+a;
              total+=a;
            });
          });
          var types=Object.keys(typeMap).sort(function(a,b){return typeMap[b]-typeMap[a];});
          if(!types.length||!total){
            donut.style.background='#f1f5f9';
            if(centerEl) centerEl.textContent='0';
            legend.innerHTML='<p style="color:#94a3b8;">비용 상세 데이터가 없습니다.</p>';
            return;
          }
          /* Build conic-gradient */
          var gradParts=[], cumPct=0;
          var legendH='';
          types.forEach(function(t,i){
            var color=_typeColors[i%_typeColors.length];
            var pct=typeMap[t]/total*100;
            gradParts.push(color+' '+cumPct.toFixed(2)+'% '+(cumPct+pct).toFixed(2)+'%');
            cumPct+=pct;
            legendH+='<div class="eva-tl-row"><span class="eva-tl-dot" style="background:'+color+'"></span>'+
              '<span class="eva-tl-name">'+t+'</span>'+
              '<span class="eva-tl-val">'+typeMap[t].toLocaleString()+'</span>'+
              '<span class="eva-tl-pct">'+pct.toFixed(1)+'%</span></div>';
          });
          donut.style.background='conic-gradient('+gradParts.join(',')+')';
          if(centerEl) centerEl.textContent=total.toLocaleString();
          legend.innerHTML=legendH;
        }

        if(statsBtn&&statsModal){
          statsBtn.addEventListener('click',function(){
            var rows=ctx.allRows();
            var hasData=rows.length>0;
            if(statsEmpty) statsEmpty.hidden=hasData;
            if(statsContent) statsContent.hidden=!hasData;
            if(hasData){
              /* 실제비용 합계 */
              var sumActual=0;
              rows.forEach(function(tr){
                var ac=tr.querySelector('[data-col="actual"]');
                var _acI=ac&&ac.querySelector('input');
                sumActual+=parseFloat((_acI?_acI.value:(ac&&ac.textContent||'')).replace(/,/g,''))||0;
              });

              function kpi(id,v){var el=document.getElementById(id);if(el)el.textContent=typeof v==='number'?v.toLocaleString(undefined,{maximumFractionDigits:0}):'-';}
              kpi('eva-kpi-actual',sumActual);

              /* 전체 예산: API에서 직접 가져오기 */
              var pid=blsGetProjectId();
              function _applySummary(totalBudget){
                kpi('eva-kpi-budget',totalBudget);
                var remaining=totalBudget-sumActual;
                kpi('eva-kpi-remaining',remaining);
                var remEl=document.getElementById('eva-kpi-remaining');
                if(remEl){ if(remaining<0) remEl.classList.add('negative'); else remEl.classList.remove('negative'); }
                var rate=totalBudget?(sumActual/totalBudget*100):0;
                var pctEl=document.getElementById('eva-sum-pct');
                if(pctEl){ pctEl.textContent=rate.toFixed(1)+'%'; if(rate>100) pctEl.classList.add('over'); else pctEl.classList.remove('over'); }
                var fillEl=document.getElementById('eva-sum-fill');
                if(fillEl){ fillEl.style.width=Math.min(rate,100)+'%'; if(rate>100) fillEl.classList.add('over'); else fillEl.classList.remove('over'); }
              }
              /* 예산 + 도넛 동시 호출 */
              if(pid){
                fetch('/api/prj/projects/'+pid,{credentials:'same-origin'})
                  .then(function(r){return r.json();})
                  .then(function(d){
                    var b=0;
                    if(d.success&&d.item){ b=parseFloat(d.item.budget_amount)||0; }
                    else if(d.budget_amount!=null){ b=parseFloat(d.budget_amount)||0; }
                    _applySummary(b);
                  }).catch(function(){ _applySummary(0); });
                fetch('/api/prj/projects/'+pid+'/cost-details/summary',{credentials:'same-origin'})
                  .then(function(r){return r.json();})
                  .then(function(d){ if(d.success) _renderTypeDonut(d.summary||{}); })
                  .catch(function(){ _renderTypeDonut({}); });
              } else { _applySummary(0); _renderTypeDonut({}); }
            }
            ctx.openModal(statsModal);
          });
          if(statsClose) statsClose.addEventListener('click',function(){ctx.closeModal(statsModal);});
          if(statsOk) statsOk.addEventListener('click',function(){ctx.closeModal(statsModal);});
          statsModal.addEventListener('click',function(e){if(e.target===statsModal)ctx.closeModal(statsModal);});
        }

        /* ── Totals footer row ── */
        var _tbl=ctx.table;
        var _tfoot=document.createElement('tfoot');
        var _tfootTr=document.createElement('tr');
        _tfootTr.innerHTML=
          '<td></td>'+
          '<td colspan="3" style="font-weight:700;text-align:center;">합계</td>'+
          '<td data-sum="planned" style="text-align:right;font-weight:700;">0</td>'+
          '<td data-sum="actual" style="text-align:right;font-weight:700;">0</td>'+
          '<td data-sum="remaining" style="text-align:right;font-weight:700;">0</td>'+
          '<td data-sum="rate" style="text-align:right;font-weight:700;">-</td>'+
          '<td></td>'+
          '<td></td>';
        _tfoot.appendChild(_tfootTr);
        if(_tbl) _tbl.appendChild(_tfoot);

        function _updateTotals(){
          var rows=ctx.allRows();
          var sP=0,sA=0;
          rows.forEach(function(tr){
            var p=tr.querySelector('[data-col="planned"]');
            var a=tr.querySelector('[data-col="actual"]');
            var pEl=p&&p.querySelector('input');
            sP+=parseFloat((pEl?pEl.value:(p?p.textContent:'')).replace(/,/g,''))||0;
            var aEl=a&&a.querySelector('input');
            sA+=parseFloat((aEl?aEl.value:(a?a.textContent:'')).replace(/,/g,''))||0;
          });
          var sR=sP-sA, sRate=sP?(sA/sP*100):0;
          _tfootTr.querySelector('[data-sum="planned"]').textContent=sP?sP.toLocaleString():'0';
          _tfootTr.querySelector('[data-sum="actual"]').textContent=sA?sA.toLocaleString():'0';
          _tfootTr.querySelector('[data-sum="remaining"]').textContent=sR?sR.toLocaleString():'0';
          _tfootTr.querySelector('[data-sum="rate"]').textContent=sP?sRate.toFixed(1)+'%':'-';
        }
        if(_tbl){
          _tbl.addEventListener('input',_updateTotals);
          _tbl.addEventListener('change',_updateTotals);
        }
        ctx.updateTotals=_updateTotals;
        var _origSave=ctx.scheduleSave;
        ctx.scheduleSave=function(){ _origSave(); _updateTotals(); };
        setTimeout(_updateTotals,200);
      }
    });
    window.__blsTabInits.tab84();
  }
  if(document.readyState!=='loading') _boot();
  else document.addEventListener('DOMContentLoaded', _boot);
})();

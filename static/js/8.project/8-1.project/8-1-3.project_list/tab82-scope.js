// tab82-scope.js — tab82: 범위관리 (Scope/WBS)
(function(){
  'use strict';
  window.__blsTabInits = window.__blsTabInits || {};
  window.__blsInitFlags = window.__blsInitFlags || {};
  function _boot(){
    var blsMakeTabCrud = window.blsMakeTabCrud;
    var blsGetProjectId = window.blsGetProjectId;
    var _esc = window._blsEsc;
    if(!blsMakeTabCrud) return;

    /* ════════ Tab72: 범위 관리 / WBS (Scope) ════════ */
    window.__blsTabInits.tab82 = blsMakeTabCrud({
      tableId:'wbs-spec-table', prefix:'wbs', tabKey:'scope',
      wbsHierarchy: true,
      addBtnId:'wbs-row-add', csvBtnId:'wbs-download-btn',
      downloadModalPrefix:'wbs',
      csvFilename:'wbs', xlsxSheet:'WBS',
      columns:[
        {key:'division', label:'구분', type:'text', placeholder:'1.1.1', inputFilter:/^[0-9.]*$/,
          helpGuide:{
            items:[
              {pattern:'1',     desc:'프로젝트 단계 (Phase)'},
              {pattern:'1.1',   desc:'주요 활동 (Activity)'},
              {pattern:'1.1.1', desc:'세부 작업 (Task)'}
            ]
          }
        },
        {key:'activity', label:'활동명', type:'text', placeholder:'활동명'},
        {key:'task',     label:'작업명', type:'text', placeholder:'작업명'},
        {key:'taskDoc',  label:'문서번호', type:'select', searchable:true, options:[],
          asyncOptions:function(){
            return fetch('/api/wrk/reports?view=all&status=APPROVED,COMPLETED,ARCHIVED',{credentials:'same-origin'})
              .then(function(r){
                if(!r.ok) console.warn('[WBS taskDoc] API status',r.status);
                return r.json();
              })
              .then(function(d){

                var items=Array.isArray(d)?d:(d.items||d.data||[]);

                var opts=[];
                items.forEach(function(it){
                  var docNo=String(it.doc_no||'').trim();
                  var title=String(it.task_title||it.task_name||'').trim();
                  if(docNo) opts.push({value:docNo, text: title ? docNo+' ('+title+')' : docNo});
                });

                return opts;
              }).catch(function(err){console.error('[WBS taskDoc] error:',err);return [];});
          },
          linkFn:function(v){
            if(!v||v==='-') return null;
            return '/api/wrk/reports?view=all&status=APPROVED,COMPLETED,ARCHIVED';
          },
          _reportCache:null
        },
        {key:'owner',    label:'담당자', type:'select', searchable:true, options:[], asyncOptions:function(){
          var tc=(typeof window.__blsGetPrjTabClient==='function')?window.__blsGetPrjTabClient():null;
          if(!tc) return Promise.resolve([]);
          return tc.loadLatest('stakeholder').then(function(item){
            if(!item||!item.payload||!Array.isArray(item.payload.rows)) return [];
            var names=[],seen={};
            item.payload.rows.forEach(function(r){var nm=String(r.name||'').trim();if(nm&&nm!=='-'&&!seen[nm]){seen[nm]=true;names.push(nm);}});
            return names;
          }).catch(function(){return [];});
        }},
        {key:'startDate',label:'시작일', type:'date'},
        {key:'endDate',  label:'종료일', type:'date'},
        {key:'duration', label:'작업기간', type:'computed', compute:function(d){
          var s=d.startDate,e=d.endDate; if(!s||!e) return '-';
          var sd=new Date(s),ed=new Date(e); if(isNaN(sd)||isNaN(ed)) return '-';
          var diff=Math.round((ed-sd)/(1000*60*60*24))+1;
          return diff>=1? diff+'일' : '-';
        }},
        {key:'result',   label:'결과', type:'select', searchable:true, options:['완료','진행','지연','대기'],
          dotMap:{'완료':'#6366F1','진행':'#3b82f6','지연':'#ef4444','대기':'#c8cdd3'}}
      ]
    });
    window.__blsTabInits.tab82();
  }
  if(document.readyState!=='loading') _boot();
  else document.addEventListener('DOMContentLoaded', _boot);
})();

// tab90-stakeholder.js — tab90: 이해관계자관리 (Stakeholder)
(function(){
  'use strict';
  window.__blsTabInits = window.__blsTabInits || {};
  window.__blsInitFlags = window.__blsInitFlags || {};
  function _boot(){
    var blsMakeTabCrud = window.blsMakeTabCrud;
    var blsGetProjectId = window.blsGetProjectId;
    var _esc = window._blsEsc;
    if(!blsMakeTabCrud) return;

    /* ════════ Tab80: 이해관계자 관리 (Stakeholder) ════════ */
    window.__blsTabInits.tab90 = blsMakeTabCrud({
      tableId:'stakeholder-table', prefix:'stakeholder', tabKey:'stakeholder',
      addBtnId:'wbs-row-add', csvBtnId:'wbs-download-btn', uploadBtnId:'wbs-upload-btn',
      downloadModalPrefix:'wbs', uploadModalPrefix:'wbs',
      csvFilename:'stakeholder', xlsxSheet:'이해관계자',
      columns:[
        {key:'org',         label:'소속',  type:'cascade-select', searchable:true,
          cascadeGroup:'org-chain', cascadeLevel:'company',
          cascadeUrl:'/api/org-users/cascade?level=company',
          cascadeParam:'company', cascadeValueProp:'name'},
        {key:'dept',        label:'부서',  type:'cascade-select', searchable:true,
          cascadeGroup:'org-chain', cascadeLevel:'department',
          cascadeUrl:'/api/org-users/cascade?level=department',
          cascadeParam:'department', cascadeValueProp:'name',
          cascadeDependsOn:['org']},
        {key:'name',        label:'이름',  type:'cascade-select', searchable:true,
          cascadeGroup:'org-chain', cascadeLevel:'user',
          cascadeUrl:'/api/org-users/cascade?level=user',
          cascadeParam:'name', cascadeValueProp:'name',
          cascadeDependsOn:['dept'],
          cascadeOnSelect:function(tr, val, selObj){
            // Auto-fill nickname from the API response
            if(val){
              var orgSel=tr.querySelector('[data-col="org"] select');
              var deptSel=tr.querySelector('[data-col="dept"] select');
              var company=(orgSel?orgSel.value:'');
              var dept=(deptSel?deptSel.value:'');
              var url='/api/org-users/cascade?level=user&department='+encodeURIComponent(dept);
              if(company&&company!=='(전체)') url+='&company='+encodeURIComponent(company);
              (typeof blsFetchJson==='function'?blsFetchJson(url):fetch(url).then(function(r){return r.json().then(function(d){return{ok:r.ok,data:d};});}))
              .then(function(res){
                var items=(res.data&&res.data.items)||[];
                var match=items.find(function(it){return it.name===val;});
                if(match){
                  var nickTd=tr.querySelector('[data-col="nickname"]');
                  if(nickTd){
                    var nickInput=nickTd.querySelector('input');
                    if(nickInput) nickInput.value=match.nickname||'';
                  }
                }
              }).catch(function(){});
            }
          }},
        {key:'nickname',    label:'별명', type:'text', placeholder:'별명', readonly:true},
        {key:'role',        label:'역할', type:'text', placeholder:'역할'},
        {key:'involvement', label:'관여도', type:'select', searchable:true, options:['높음','중간','낮음'],
          dotMap:{'높음':'#ef4444','중간':'#f59e0b','낮음':'#22c55e'}},
        {key:'note',        label:'비고', type:'text', placeholder:'비고'}
      ],
      /* ── 담당자를 삭제 불가 이해관계자로 자동 삽입 ── */
      onPostLoad: function(ctx){
        /* ── 담당자 행 삽입/갱신 핵심 함수 ── */
        function _applyLockedStyle(tr){
          tr.setAttribute('data-locked','true');
          var delBtn = tr.querySelector('.js-tab-del');
          if(delBtn) delBtn.parentNode.removeChild(delBtn);
          var cb = tr.querySelector('input[type="checkbox"]');
          if(cb){
            cb.disabled = true;
            if(!cb.parentNode.querySelector('.bls-creator-icon')){
              var span = document.createElement('span');
              span.className = 'bls-creator-icon';
              span.style.cssText = 'display:inline-flex;align-items:center;margin-left:4px';
              span.title = '담당자 (삭제 불가)';
              span.innerHTML = '<img src="/static/image/svg/list/free-icon-pencil.svg" alt="담당자" style="width:13px;height:13px;opacity:.45">';
              cb.parentNode.appendChild(span);
            }
          }
        }

        function _updateCells(tr, creator){
          var fieldMap = {org: creator.company, dept: creator.dept, nickname: creator.nickname};
          var updated = false;
          Object.keys(fieldMap).forEach(function(col){
            var newVal = fieldMap[col] || '';
            if(!newVal) return;
            var td = tr.querySelector('[data-col="'+col+'"]');
            if(!td) return;
            var curVal = (td.textContent||'').trim();
            if(!curVal || curVal === '-'){
              td.textContent = newVal;
              updated = true;
            }
          });
          if(updated) ctx.scheduleSave();
        }

        function _findManagerRow(name){
          var found = null;
          ctx.allRows().forEach(function(tr){
            var td = tr.querySelector('[data-col="name"]');
            if(td && (td.textContent||'').trim() === name) found = tr;
          });
          return found;
        }

        function _ensureAuthorRow(){
          try{
            var creator = window.__blsProjectCreatedBy;
            if(!creator || !creator.name) return;
            var tr = _findManagerRow(creator.name);
            if(tr){
              // 이미 존재 → locked 스타일 + 빈 셀 갱신
              _applyLockedStyle(tr);
              _updateCells(tr, creator);
            } else if(creator.company || creator.dept){
              // 새 행 삽입 (company/dept가 있을 때만)
              var newTr = ctx.buildSavedRow({
                org: creator.company || '',
                dept: creator.dept || '',
                name: creator.name,
                nickname: creator.nickname || '',
                role: '담당자',
                involvement: '높음',
                note: '',
                _locked: true
              });
              if(ctx.tbody.firstChild){
                ctx.tbody.insertBefore(newTr, ctx.tbody.firstChild);
              } else {
                ctx.tbody.appendChild(newTr);
              }
              ctx.updateEmpty();
              ctx.scheduleSave();
            }
          }catch(e){ console.warn('[tab90] 담당자 자동 삽입 오류', e); }
        }

        // 1) 즉시 시도 (세션 캐시 데이터로)
        _ensureAuthorRow();
        // 2) API 로드 완료 이벤트 수신 → 최신 데이터로 재실행
        window.addEventListener('blsProjectCreatorReady', _ensureAuthorRow);
      }
    });
    window.__blsTabInits.tab90();
  }
  if(document.readyState!=='loading') _boot();
  else document.addEventListener('DOMContentLoaded', _boot);
})();

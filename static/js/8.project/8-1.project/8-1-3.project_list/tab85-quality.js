// tab85-quality.js — tab85: 품질관리 (Quality)
(function(){
  'use strict';
  window.__blsTabInits = window.__blsTabInits || {};
  window.__blsInitFlags = window.__blsInitFlags || {};

  /* ── 설정>품질유형 데이터 캐시 (기존 /api/quality-types 사용) ── */
  var _qtCache = null;
  var _qtPromise = null;
  function _loadAllQT(){
    if(_qtPromise) return _qtPromise;
    _qtPromise = fetch('/api/quality-types',{credentials:'same-origin'})
      .then(function(r){ return r.json(); })
      .then(function(d){ _qtCache = (d&&d.items)||[]; return _qtCache; })
      .catch(function(){ _qtCache=[]; return []; });
    return _qtPromise;
  }
  function _unique(items, key){
    var seen={}, out=[];
    items.forEach(function(it){ var v=(it[key]||'').trim(); if(v&&!seen[v]){seen[v]=true; out.push(v);} });
    return out;
  }
  function _filtered(items, filters){
    return items.filter(function(it){
      for(var k in filters){ if(filters[k] && (it[k]||'').trim()!==filters[k]) return false; }
      return true;
    });
  }

  /* ── 캐스케이드 헬퍼: 부모 변경 시 자식 셀렉트 재구성 ── */
  function _rebuildChildSelect(tr, colKey, optionValues, currentVal, disabled){
    var td = tr.querySelector('[data-col="'+colKey+'"]');
    if(!td) return;
    /* 기존 searchable-select wrapper 제거 */
    var oldCtrl = td.querySelector('.bls-ss-ctrl');
    if(oldCtrl){
      var oldSel = oldCtrl.querySelector('select');
      if(oldSel){ oldSel.removeAttribute('data-bls-s-s'); delete oldSel.dataset.blsSS; td.appendChild(oldSel); }
      oldCtrl.parentNode.removeChild(oldCtrl);
    }
    var sel = td.querySelector('select');
    if(!sel) return;
    var html = '<option value="" disabled'+(currentVal?'':' selected')+'>선택</option>';
    optionValues.forEach(function(v){
      html += '<option value="'+v+'"'+(v===currentVal?' selected':'')+'>'+v+'</option>';
    });
    sel.innerHTML = html;
    sel.disabled = !!disabled;
    sel.removeAttribute('data-bls-s-s');
    delete sel.dataset.blsSS;
    /* searchable-select 재적용 */
    try{
      var _ss = window.__blsSearchableSelectFn;
      if(_ss) _ss(sel, {label: colKey});
    }catch(_){}
  }

  /* ── 행에 캐스케이드 이벤트 연결 ── */
  function _wireQtCascade(tr, preData){
    if(!_qtCache) return;
    var cols = ['groupName','qualityType','item','metric'];
    var keyMap = {groupName:'group_name', qualityType:'quality_type', item:'item_name', metric:'metric'};

    function getRowVal(colKey){
      var td = tr.querySelector('[data-col="'+colKey+'"]');
      if(!td) return '';
      var sel = td.querySelector('select');
      return sel ? (sel.value||'').trim() : (td.textContent||'').trim();
    }

    function cascadeFrom(idx, isUserChange){
      /* idx 이전 부모들로부터 필터 수집 */
      var parentFilters = {};
      for(var i=0; i<idx; i++){
        var v = getRowVal(cols[i]);
        if(v) parentFilters[keyMap[cols[i]]] = v;
      }

      /* idx 이후 자식들 재구성 */
      for(var j=idx; j<cols.length; j++){
        var childFilters = {};
        for(var k in parentFilters) childFilters[k] = parentFilters[k];
        /* 바로 앞 형제들의 현재 값도 필터에 추가 */
        if(j > idx){
          for(var m=idx; m<j; m++){
            var mv = getRowVal(cols[m]);
            if(mv) childFilters[keyMap[cols[m]]] = mv;
          }
        }

        /* 부모가 선택되지 않았으면 비활성 + 빈 옵션 */
        var parentSelected = true;
        if(j > 0){
          var parentVal = getRowVal(cols[j-1]);
          if(!parentVal) parentSelected = false;
        }

        if(!parentSelected){
          /* 부모 미선택 → 비활성 */
          var curVal = (isUserChange ? '' : (preData && preData[cols[j]]) || '');
          _rebuildChildSelect(tr, cols[j], [], curVal, true);
        } else {
          var childItems = _filtered(_qtCache, childFilters);
          var opts = _unique(childItems, keyMap[cols[j]]);
          var curVal2 = (isUserChange ? '' : (preData && preData[cols[j]]) || '');
          _rebuildChildSelect(tr, cols[j], opts, curVal2, false);
        }
      }
    }

    /* 부모 변경 이벤트 */
    cols.forEach(function(colKey, idx){
      var td = tr.querySelector('[data-col="'+colKey+'"]');
      if(!td) return;
      var sel = td.querySelector('select');
      if(!sel) return;
      sel.addEventListener('change', function(){
        /* 사용자가 변경 → 이후 자식들을 초기화 & 비활성/활성 재구성 */
        cascadeFrom(idx + 1, true);
      });
    });

    /* 초기 로드 */
    if(preData && (preData.groupName || preData.qualityType || preData.item || preData.metric)){
      /* 기존 데이터가 있으면 순차 복원 (비활성 해제하며) */
      cascadeFrom(0, false);
    } else {
      /* 신규 행: 그룹만 활성, 나머지 비활성 */
      var grpOpts = _unique(_qtCache, 'group_name');
      _rebuildChildSelect(tr, 'groupName', grpOpts, '', false);
      _rebuildChildSelect(tr, 'qualityType', [], '', true);
      _rebuildChildSelect(tr, 'item', [], '', true);
      _rebuildChildSelect(tr, 'metric', [], '', true);
    }
  }

  function _boot(){
    var blsMakeTabCrud = window.blsMakeTabCrud;
    var blsGetProjectId = window.blsGetProjectId;
    var _esc = window._blsEsc;
    if(!blsMakeTabCrud) return;

    /* 품질유형 데이터 미리 로드 */
    _loadAllQT();

    /* ════════ Tab75: 품질 관리 (Quality) ════════ */
    window.__blsTabInits.tab85 = blsMakeTabCrud({
      tableId:'quality-spec-table', prefix:'quality', tabKey:'quality',
      addBtnId:'wbs-row-add', csvBtnId:'wbs-download-btn',
      downloadModalPrefix:'wbs',
      csvFilename:'quality', xlsxSheet:'품질관리',
      columns:[
        /* ── 설정>품질유형 FK (그룹→품질유형→항목→측정지표) ── */
        {key:'groupName',   label:'그룹',     type:'select', searchable:true, options:[],
          asyncOptions: function(){
            return _loadAllQT().then(function(items){ return _unique(items,'group_name'); });
          }},
        {key:'qualityType', label:'품질유형', type:'select', searchable:true, options:[],
          asyncOptions: function(){
            return _loadAllQT().then(function(items){ return _unique(items,'quality_type'); });
          }},
        {key:'item',        label:'항목',     type:'select', searchable:true, options:[],
          asyncOptions: function(){
            return _loadAllQT().then(function(items){ return _unique(items,'item_name'); });
          }},
        {key:'metric',      label:'측정지표', type:'select', searchable:true, options:[],
          asyncOptions: function(){
            return _loadAllQT().then(function(items){ return _unique(items,'metric'); });
          }},
        /* ── 직접 입력 ── */
        {key:'target',      label:'목표값',   type:'text', placeholder:'목표값'},
        {key:'measured',    label:'측정값',   type:'text', placeholder:'측정값'},
        /* ── 검색 드롭박스 ── */
        {key:'status',      label:'상태',     type:'select', searchable:true,
          options:['충족','미충족','측정중'],
          dotMap:{'충족':'#6366F1','미충족':'#ef4444','측정중':'#f59e0b'}},
        {key:'cycle',       label:'측정주기', type:'select', searchable:true,
          options:['실시간','일간','주간','월간','분기간','년간']},
        {key:'note',        label:'비고',     type:'text', placeholder:'비고'}
      ],
      /* 행이 편집 모드로 전환될 때 캐스케이드 연결 */
      onRowEdit: function(tr, data){
        _loadAllQT().then(function(){ _wireQtCascade(tr, data); });
      }
    });
    window.__blsTabInits.tab85();
  }
  if(document.readyState!=='loading') _boot();
  else document.addEventListener('DOMContentLoaded', _boot);
})();

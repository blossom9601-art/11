// tab81-integrity.js — tab81: 요구사항관리 (Integrity)
(function(){
  'use strict';
  window.__blsTabInits = window.__blsTabInits || {};
  window.__blsInitFlags = window.__blsInitFlags || {};
  function _boot(){
    var blsMakeTabCrud = window.blsMakeTabCrud;
    var blsGetProjectId = window.blsGetProjectId;
    var _esc = window._blsEsc;
    if(!blsMakeTabCrud) return;

    /* ════════ Tab71: 요구사항 관리 (Integrity) ════════ */
    window.__blsTabInits.tab81 = blsMakeTabCrud({
      tableId:'rq-spec-table', prefix:'rq', tabKey:'integrity',
      addBtnId:'rq-row-add', csvBtnId:'rq-download-btn', uploadBtnId:'rq-upload-btn',
      downloadModalPrefix:'rq', uploadModalPrefix:'rq',
      csvFilename:'requirements', xlsxSheet:'요구사항',
      columns:[
        {key:'category', label:'분류', type:'text', placeholder:'분류'},
        {key:'rqType',   label:'유형', type:'text', placeholder:'유형'},
        {key:'code',     label:'고유번호', type:'text', placeholder:'RQ-001'},
        {key:'name',     label:'명칭', type:'text', placeholder:'명칭'},
        {key:'definition',label:'정의', type:'text', placeholder:'정의'},
        {key:'detail',   label:'세부내용', type:'text', placeholder:'세부내용'},
        {key:'owner',    label:'담당자', type:'text', placeholder:'담당자'}
      ]
    });
    window.__blsTabInits.tab81();
  }
  if(document.readyState!=='loading') _boot();
  else document.addEventListener('DOMContentLoaded', _boot);
})();

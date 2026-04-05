/**
 * 2.client1_detail.js v1.0
 * 준회원사 상세 페이지 — 기본정보 탭 + task tab 지원
 */
(function(){
    'use strict';

    /* ── context ── */
    function getContext(){
        try{
            var raw = sessionStorage.getItem('client1:context');
            if(raw) return JSON.parse(raw);
        }catch(_){}
        return null;
    }

    function setHeaderFromContext(ctx){
        if(!ctx) return;
        try{
            var h1 = document.getElementById('page-header-title');
            var sub = document.getElementById('page-header-subtitle');
            if(h1 && ctx.customer_name) h1.textContent = ctx.customer_name;
            if(sub && ctx.address) sub.textContent = ctx.address;
        }catch(_){}
    }

    /* ── basic info ── */
    function renderBasicInfo(d){
        try{ document.getElementById('cm-customer-name').textContent = d.customer_name || '–'; }catch(_){}
        try{ document.getElementById('cm-address').textContent = d.address || '–'; }catch(_){}
        try{ document.getElementById('cm-manager-count').textContent = d.manager_count || '–'; }catch(_){}
        try{ document.getElementById('cm-line-count').textContent = d.line_count || '–'; }catch(_){}
        try{ document.getElementById('cm-remark').textContent = d.remark || '–'; }catch(_){}
    }

    function loadBasicInfo(id){
        fetch('/api/customer-associates/' + encodeURIComponent(id), {
            method: 'GET', cache: 'no-store',
            headers: { 'Accept': 'application/json' }
        })
        .then(function(r){ return r.json(); })
        .then(function(j){
            if(j.success && j.item) renderBasicInfo(j.item);
        })
        .catch(function(){});
    }

    /* ── init ── */
    function init(){
        var ctx = getContext();
        setHeaderFromContext(ctx);
        if(ctx && ctx.id){
            renderBasicInfo(ctx);
            loadBasicInfo(ctx.id);
        }
    }

    if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

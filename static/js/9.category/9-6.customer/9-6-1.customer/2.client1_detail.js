/**
 * 2.client1_detail.js v1.0
 * 준회원사 상세 페이지 — 기본정보 탭 + task tab 지원
 */
(function(){
    'use strict';

    function showNoDataImage(container, altText){
        try{
            if(!container) return;
            container.innerHTML = '';
            var wrap = document.createElement('span');
            wrap.style.display = 'flex';
            wrap.style.alignItems = 'center';
            wrap.style.justifyContent = 'center';
            wrap.style.padding = '12px 0';
            wrap.style.minHeight = '140px';
            wrap.style.width = '100%';
            wrap.style.boxSizing = 'border-box';
            wrap.style.flexDirection = 'column';
            var jsonPath = '/static/image/svg/free-animated-no-data.json';

            function renderLottie(){
                try{
                    if(!window.lottie) return false;
                    var animBox = document.createElement('span');
                    animBox.style.display = 'inline-block';
                    animBox.style.width = '240px';
                    animBox.style.maxWidth = '100%';
                    animBox.style.height = '180px';
                    animBox.style.pointerEvents = 'none';
                    wrap.appendChild(animBox);
                    window.lottie.loadAnimation({
                        container: animBox,
                        renderer: 'svg',
                        loop: true,
                        autoplay: true,
                        path: jsonPath,
                    });
                    var cap = document.createElement('span');
                    cap.textContent = altText || '데이터가 없습니다.';
                    cap.style.display = 'block';
                    cap.style.fontSize = '13px';
                    cap.style.color = '#64748b';
                    cap.style.textAlign = 'center';
                    wrap.appendChild(cap);
                    container.appendChild(wrap);
                    return true;
                }catch(_){
                    return false;
                }
            }

            function renderFallback(){
                var img = document.createElement('img');
                img.alt = altText || '데이터가 없습니다.';
                img.src = '/static/image/svg/free-animated-no-data/no-data.svg';
                img.style.maxWidth = '240px';
                img.style.width = '100%';
                img.style.height = 'auto';
                wrap.appendChild(img);
                var cap = document.createElement('span');
                cap.textContent = altText || '데이터가 없습니다.';
                cap.style.display = 'block';
                cap.style.fontSize = '13px';
                cap.style.color = '#64748b';
                cap.style.textAlign = 'center';
                wrap.appendChild(cap);
                container.appendChild(wrap);
            }

            if(!renderLottie()){
                if(!window.lottie){
                    var script = document.createElement('script');
                    script.src = 'https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js';
                    script.async = true;
                    script.onload = function(){ if(!renderLottie()) renderFallback(); };
                    script.onerror = renderFallback;
                    document.head.appendChild(script);
                }else{
                    renderFallback();
                }
            }
        }catch(_){ }
    }

    function applyNoDataToStatsPlaceholders(){
        try{
            var targets = [
                { id: 'stat-empty', msg: '통계 데이터가 없습니다.' },
                { id: 'group-empty', msg: '통계 데이터가 없습니다.' },
                { id: 'ver-empty', msg: '통계 데이터가 없습니다.' },
            ];
            targets.forEach(function(t){
                var el = document.getElementById(t.id);
                if(!el) return;
                if(el.children && el.children.length > 0) return;
                var text = (el.textContent || '').replace(/\s+/g, '').trim();
                if(!text || /데이터|없습니다|오류/.test(text)){
                    showNoDataImage(el, t.msg);
                }
            });
        }catch(_){ }
    }

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
        applyNoDataToStatsPlaceholders();
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

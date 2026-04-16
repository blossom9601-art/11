/* eslint-disable */
/**
 * 워크플로우 탐색 (Explore) 탭 JS
 * - 전체 워크플로우 카드 그리드 표시
 * - 검색, 상태 필터, 페이지네이션
 * - 새 워크플로우 생성 모달
 */
(function(){
    'use strict';

    var API = '/api/wf-designs';
    var page = 1;
    var perPage = 10;

    // ── DOM refs ──
    var grid     = document.getElementById('wfd-grid');
    var emptyEl  = document.getElementById('wfd-empty');
    var countEl  = document.getElementById('wfd-count');
    var searchEl = document.getElementById('wfd-search');
    var pagEl    = document.getElementById('wfd-pagination');
    var fabBtn   = document.getElementById('wfd-fab-create');
    var delBtn   = document.getElementById('wfd-fab-delete');
    var firstBtn = document.getElementById('wfd-create-first');
    var clearBtn = document.getElementById('wfd-search-clear');
    var pageSizeEl = document.getElementById('wfd-page-size');
    var pagInfoEl  = document.getElementById('wfd-pagination-info');
    var pagFirst   = document.getElementById('wfd-first');
    var pagPrev    = document.getElementById('wfd-prev');
    var pagNext    = document.getElementById('wfd-next');
    var pagLast    = document.getElementById('wfd-last');
    var pagNumbers = document.getElementById('wfd-page-numbers');

    // 모달
    var modal       = document.getElementById('wfd-create-modal');
    var nameInput   = document.getElementById('wfd-name-input');
    var descInput   = document.getElementById('wfd-desc-input');
    var confirmBtn  = document.getElementById('wfd-create-confirm');
    var cancelBtn   = document.getElementById('wfd-create-cancel');
    var closeBtn    = document.getElementById('wfd-create-close');

    // ── 유틸 ──
    function esc(s){ var d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

    var LIKE_ICON = '<img class="wfd-like-svg" src="/static/image/svg/workflow/free-icon-font-thumbs-up.svg" alt="좋아요" width="16" height="16">';
    var VIEW_ICON = '<img class="wfd-view-svg" src="/static/image/svg/workflow/free-icon-font-eye.svg" alt="시청자수" width="16" height="16">';

    // 노드 타입별 색상 맵
    var TYPE_COLORS = {
        start:'#22c55e', task:'#3b82f6', approval:'#f59e0b', decision:'#a855f7',
        system:'#14b8a6', end:'#ef4444', process:'#1e293b', frame:'#94a3b8',
        title:'#334155', note:'#fbbf24', diamond:'#7c3aed', circle:'#0ea5e9'
    };
    var TYPE_SHAPES = {diamond:'diamond', circle:'circle', note:'note', frame:'frame', title:'title', process:'rect'};

    function renderMiniPreview(def){
        if(!def || !def.nodes || !def.nodes.length) return '';
        var nodes = def.nodes;
        var edges = def.edges || [];
        // bounding box
        var minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
        for(var i=0; i<nodes.length; i++){
            var n=nodes[i];
            var nx=n.position.x, ny=n.position.y;
            var nw=(n.size&&n.size.w)||160, nh=(n.size&&n.size.h)||56;
            if(nx<minX) minX=nx;
            if(ny<minY) minY=ny;
            if(nx+nw>maxX) maxX=nx+nw;
            if(ny+nh>maxY) maxY=ny+nh;
        }
        var pad=20;
        minX-=pad; minY-=pad; maxX+=pad; maxY+=pad;
        var bw=maxX-minX, bh=maxY-minY;
        if(bw<1) bw=1; if(bh<1) bh=1;

        var svg='<svg class="wfd-mini-svg" viewBox="'+minX+' '+minY+' '+bw+' '+bh+'" preserveAspectRatio="xMidYMid meet">';

        // edges
        var nodeMap={};
        for(var j=0;j<nodes.length;j++){
            var nn=nodes[j];
            var ww=(nn.size&&nn.size.w)||160, hh=(nn.size&&nn.size.h)||56;
            nodeMap[nn.id]={x:nn.position.x, y:nn.position.y, w:ww, h:hh};
        }
        for(var k=0;k<edges.length;k++){
            var e=edges[k];
            var src=nodeMap[e.source], tgt=nodeMap[e.target];
            if(src&&tgt){
                var sx=src.x+src.w, sy=src.y+src.h/2;
                var tx=tgt.x, ty=tgt.y+tgt.h/2;
                svg+='<line x1="'+sx+'" y1="'+sy+'" x2="'+tx+'" y2="'+ty+'" stroke="#cbd5e1" stroke-width="2" />';
            }
        }

        // nodes
        for(var m=0;m<nodes.length;m++){
            var nd=nodes[m];
            var tp=nd.type||(nd.data&&nd.data.type)||'task';
            var cl=TYPE_COLORS[tp]||'#3b82f6';
            var sh=TYPE_SHAPES[tp]||'';
            var px=nd.position.x, py=nd.position.y;
            var sw=(nd.size&&nd.size.w)||160, shh=(nd.size&&nd.size.h)||56;
            if(sh==='circle'){
                var cr=Math.min(sw,shh)/2;
                svg+='<circle cx="'+(px+sw/2)+'" cy="'+(py+shh/2)+'" r="'+cr+'" fill="'+cl+'" opacity="0.18" stroke="'+cl+'" stroke-width="2" />';
            } else if(sh==='diamond'){
                var cx2=px+sw/2, cy2=py+shh/2;
                svg+='<polygon points="'+cx2+','+py+' '+(px+sw)+','+cy2+' '+cx2+','+(py+shh)+' '+px+','+cy2+'" fill="'+cl+'" opacity="0.18" stroke="'+cl+'" stroke-width="2" />';
            } else if(sh==='note'){
                svg+='<rect x="'+px+'" y="'+py+'" width="'+sw+'" height="'+shh+'" rx="4" fill="#fef3c7" stroke="'+cl+'" stroke-width="2" />';
            } else if(sh==='frame'){
                svg+='<rect x="'+px+'" y="'+py+'" width="'+sw+'" height="'+shh+'" rx="4" fill="none" stroke="'+cl+'" stroke-width="2" stroke-dasharray="6 3" />';
            } else {
                svg+='<rect x="'+px+'" y="'+py+'" width="'+sw+'" height="'+shh+'" rx="8" fill="white" stroke="'+cl+'" stroke-width="2" />';
                // color bar on top
                svg+='<rect x="'+px+'" y="'+py+'" width="'+sw+'" height="6" rx="3" fill="'+cl+'" />';
            }
        }
        svg+='</svg>';
        return svg;
    }

    function toggleLike(ev){
        ev.stopPropagation();
        var btn = ev.currentTarget;
        var wfId = btn.getAttribute('data-wf-id');
        fetch(API+'/'+wfId+'/like', {method:'POST', credentials:'same-origin'})
        .then(function(r){ return r.json(); })
        .then(function(d){
            if(!d.success) return;
            var countEl2 = btn.querySelector('.wfd-like-count');
            if(d.liked){
                btn.classList.add('liked');
            } else {
                btn.classList.remove('liked');
            }
            if(countEl2) countEl2.textContent = d.like_count || '';
        })
        .catch(function(e){ console.error('like error', e); });
    }

    // ── 로드 ──
    function load(){
        var search = (searchEl.value||'').trim();
        var qs = '?page='+page+'&per_page='+perPage+'&shared=1';
        if(search) qs += '&search='+encodeURIComponent(search);

        fetch(API+qs, {credentials:'same-origin'})
        .then(function(r){ return r.json(); })
        .then(function(data){
            if(!data.success){
                console.error(data);
                if(countEl){ countEl.textContent = '0'; countEl.setAttribute('data-count', '0'); }
                if(grid){ grid.innerHTML=''; grid.style.display='none'; }
                if(emptyEl){ emptyEl.style.display=''; }
                renderPagination(0);
                return;
            }
            var rows = data.rows||[];
            var total = data.total||0;
            var prev = parseInt(countEl.getAttribute('data-count') || (countEl.textContent||'0').replace(/,/g,''), 10) || 0;
            countEl.textContent = String(total);
            countEl.setAttribute('data-count', String(total));
            countEl.classList.remove('large-number','very-large-number');
            if(total >= 1000) countEl.classList.add('very-large-number');
            else if(total >= 100) countEl.classList.add('large-number');
            if(prev !== total){
                countEl.classList.remove('is-updating');
                void countEl.offsetWidth;
                countEl.classList.add('is-updating');
            }

            if(!rows.length){
                grid.style.display='none';
                emptyEl.style.display='';
                renderPagination(0);
                return;
            }
            grid.style.display='';
            emptyEl.style.display='none';

            var html = '';
            for(var i=0; i<rows.length; i++){
                var w = rows[i];
                html += '<div class="wfd-card" data-id="'+esc(w.id)+'">';
                html += '  <div class="wfd-card-thumb">';
                html += '    <label class="wfd-card-check-label" onclick="event.stopPropagation()">';
                html += '      <input type="checkbox" class="wfd-card-check" data-id="'+esc(w.id)+'">';
                html += '    </label>';
                if(w.thumbnail){
                    html += '<img class="wfd-mini-svg" src="'+esc(w.thumbnail)+'" alt="thumb">';
                } else {
                    var preview = renderMiniPreview(w.definition_json);
                    if(preview){ html += preview; }
                    else { html += '<img class="wfd-card-thumb-empty" src="/static/image/svg/workflow/free-icon-font-circle-nodes.svg" alt="">'; }
                }
                html += '  </div>';
                html += '  <div class="wfd-card-name">'+esc(w.name)+'</div>';
                html += '  <div class="wfd-card-desc">'+esc(w.description||'설명 없음')+'</div>';
                html += '  <div class="wfd-card-meta">';
                html += '    <div class="wfd-card-meta-left">';
                html += '      <button type="button" class="wfd-like-btn'+(w.liked?' liked':'')+'" data-wf-id="'+esc(w.id)+'">';
                html += '        <span class="wfd-like-icon-wrap">'+LIKE_ICON+'</span>';
                html += '        <span class="wfd-like-count">'+(w.like_count||'')+'</span>';
                html += '      </button>';
                html += '      <span class="wfd-view-badge">';
                html += '        <span class="wfd-view-icon-wrap">'+VIEW_ICON+'</span>';
                html += '        <span class="wfd-view-count">'+(w.view_count||0)+'</span>';
                html += '      </span>';
                html += '    </div>';
                html += '    <span>v'+w.latest_version+' · '+esc(w.owner_name||'')+'</span>';
                html += '  </div>';
                html += '</div>';
            }
            grid.innerHTML = html;

            // 좋아요 버튼 바인딩
            var likeBtns = grid.querySelectorAll('.wfd-like-btn');
            for(var k=0; k<likeBtns.length; k++){
                likeBtns[k].addEventListener('click', toggleLike);
            }

            // 카드 클릭 → 조회 기록 + 캔버스 에디터로 이동
            var cards = grid.querySelectorAll('.wfd-card');
            for(var j=0; j<cards.length; j++){
                cards[j].addEventListener('click', function(){
                    var id = this.getAttribute('data-id');
                    var card = this;
                    fetch(API+'/'+id+'/view', {method:'POST', credentials:'same-origin'})
                    .then(function(r){ return r.json(); })
                    .then(function(d){
                        if(d.success){
                            var el = card.querySelector('.wfd-view-count');
                            if(el) el.textContent = d.view_count || 0;
                        }
                    })
                    .catch(function(){});
                    blsSpaNavigate('/p/wf_designer_editor?id='+id);
                });
            }

            renderPagination(total);
        })
        .catch(function(e){
            console.error('load error', e);
            if(countEl){ countEl.textContent = '0'; countEl.setAttribute('data-count', '0'); }
            if(grid){ grid.innerHTML=''; grid.style.display='none'; }
            if(emptyEl){ emptyEl.style.display=''; }
            renderPagination(0);
        });
    }

    function renderPagination(total){
        var totalPages = Math.ceil(total/perPage) || 1;
        // 페이지네이션 정보
        if(pagInfoEl){
            var from = total > 0 ? (page-1)*perPage+1 : 0;
            var to = Math.min(page*perPage, total);
            pagInfoEl.textContent = total > 0 ? from+'-'+to+' / '+total+'개 항목' : '0개 항목';
        }
        // first/prev/next/last
        if(pagFirst) pagFirst.disabled=(page<=1);
        if(pagPrev) pagPrev.disabled=(page<=1);
        if(pagNext) pagNext.disabled=(page>=totalPages);
        if(pagLast) pagLast.disabled=(page>=totalPages);
        // page numbers
        if(pagNumbers){
            pagNumbers.innerHTML='';
            for(var p=1; p<=totalPages && p<=50; p++){
                var btn = document.createElement('button');
                btn.className = 'page-btn'+(p===page?' active':'');
                btn.textContent = p;
                btn.setAttribute('data-page', p);
                pagNumbers.appendChild(btn);
            }
            pagNumbers.addEventListener('click', function(ev){
                var t = ev.target;
                if(t.classList.contains('page-btn')){
                    page = parseInt(t.getAttribute('data-page'), 10);
                    load();
                }
            });
        }
    }

    // ── 즉시 생성 → 에디터 진입 (모달 없이) ──
    function quickCreate(){
        fetch(API, {
            method:'POST', credentials:'same-origin',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({name:'제목 없는 워크플로우', description:''})
        })
        .then(function(r){ return r.json(); })
        .then(function(data){
            if(!data.success){ alert(data.error||'생성 실패'); return; }
            blsSpaNavigate('/p/wf_designer_editor?id='+data.item.id);
        })
        .catch(function(e){ alert('네트워크 오류'); console.error(e); });
    }

    // ── 삭제 ──
    function deleteSelected(){
        var checks = grid.querySelectorAll('.wfd-card-check:checked');
        if(!checks.length){ alert('삭제할 워크플로우를 선택해주세요.'); return; }
        if(!confirm('선택한 '+checks.length+'개 워크플로우를 삭제할까요?')) return;
        var ids = [];
        for(var i=0; i<checks.length; i++) ids.push(checks[i].getAttribute('data-id'));
        fetch(API+'/bulk-delete', {
            method:'POST', credentials:'same-origin',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ids: ids})
        })
        .then(function(r){ return r.json(); })
        .then(function(d){
            if(!d.success){ alert(d.error||'삭제 실패'); return; }
            load();
        })
        .catch(function(e){ alert('네트워크 오류'); console.error(e); });
    }

    // ── 이벤트 바인딩 ──
    searchEl.addEventListener('input', function(){ page=1; load(); });
    fabBtn.addEventListener('click', quickCreate);
    if(firstBtn) firstBtn.addEventListener('click', quickCreate);
    if(delBtn) delBtn.addEventListener('click', deleteSelected);
    if(clearBtn) clearBtn.addEventListener('click', function(){ searchEl.value=''; page=1; load(); searchEl.focus(); });
    if(pageSizeEl) pageSizeEl.addEventListener('change', function(){ perPage=parseInt(this.value); page=1; load(); });
    if(pagFirst) pagFirst.addEventListener('click', function(){ page=1; load(); });
    if(pagPrev) pagPrev.addEventListener('click', function(){ if(page>1){ page--; load(); } });
    if(pagNext) pagNext.addEventListener('click', function(){ page++; load(); });
    if(pagLast) pagLast.addEventListener('click', function(){ var tp=Math.ceil((parseInt(countEl.textContent)||0)/perPage); page=tp||1; load(); });

    // ── 초기 로드 ──
    load();
})();

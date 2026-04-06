/* eslint-disable */
/**
 * 워크플로우 캔버스 에디터 (독립 페이지)
 * - FigJam 스타일 풀스크린 화이트보드 에디터
 * - URL 파라미터 ?id=<wfId> 로 워크플로우 로드
 */
(function(){
    'use strict';

    var API = '/api/wf-designs';

    // ── URL 파라미터에서 워크플로우 ID 추출 ──
    var params = new URLSearchParams(window.location.search);
    var wfId = params.get('id');
    if(!wfId){
        var _root = document.getElementById('wf-editor-root');
        _root.innerHTML = ''
            + '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:linear-gradient(135deg,#f0f4ff 0%,#e8ecf9 100%);font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;">'
            + '  <div style="text-align:center;max-width:480px;padding:40px;">'
            + '    <div style="width:80px;height:80px;margin:0 auto 24px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:20px;display:flex;align-items:center;justify-content:center;">'
            + '      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>'
            + '    </div>'
            + '    <h1 style="margin:0 0 8px;font-size:28px;font-weight:700;color:#1e293b;">Workflow Editor</h1>'
            + '    <p style="margin:0 0 32px;font-size:15px;color:#64748b;line-height:1.6;">새 워크플로우를 만들거나, 기존 워크플로우를 관리 페이지에서 선택하세요.</p>'
            + '    <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">'
            + '      <button id="wfe-landing-create" style="display:inline-flex;align-items:center;gap:8px;padding:12px 28px;background:linear-gradient(135deg,#6366f1,#7c3aed);color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;box-shadow:0 4px 14px rgba(99,102,241,0.35);transition:transform 0.15s,box-shadow 0.15s;">'
            + '        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
            + '        새 워크플로우 만들기'
            + '      </button>'
            + '      <a href="/p/wf_designer_manage" style="display:inline-flex;align-items:center;gap:8px;padding:12px 28px;background:#fff;color:#475569;border:2px solid #e2e8f0;border-radius:12px;font-size:15px;font-weight:600;text-decoration:none;cursor:pointer;transition:border-color 0.15s;">'
            + '        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>'
            + '        워크플로우 관리'
            + '      </a>'
            + '    </div>'
            + '  </div>'
            + '</div>';
        // 새 워크플로우 즉시 생성 → 에디터 진입
        document.getElementById('wfe-landing-create').addEventListener('click', function(){
            var btn = this;
            btn.disabled = true;
            btn.style.opacity = '0.6';
            btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="animation:spin 1s linear infinite;"><path d="M12 2a10 10 0 0 1 10 10"/></svg> 생성 중...';
            fetch(API, {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({name:'제목 없는 워크플로우', description:''})
            }).then(function(r){ return r.json(); }).then(function(d){
                if(!d.success){ alert(d.error||'생성 실패'); btn.disabled=false; btn.style.opacity='1'; return; }
                blsSpaNavigate('/p/wf_designer_editor?id=' + d.item.id);
            }).catch(function(){ alert('네트워크 오류'); btn.disabled=false; btn.style.opacity='1'; });
        });
        // hover 효과
        var _cBtn = document.getElementById('wfe-landing-create');
        _cBtn.addEventListener('mouseenter', function(){ this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(99,102,241,0.45)'; });
        _cBtn.addEventListener('mouseleave', function(){ this.style.transform=''; this.style.boxShadow='0 4px 14px rgba(99,102,241,0.35)'; });
        return;
    }

    var editorRoot = document.getElementById('wf-editor-root');

    // ── 에디터 HTML 구축 ──
    editorRoot.innerHTML = ''
        // ── 상단 바 ──
        + '<div class="wf-editor-topbar">'
        + '  <div class="wf-topbar-left">'
        + '    <a class="wf-topbar-brand" href="/" title="blossom 홈">'
        + '      <img src="/static/image/logo/blossom_logo.png" alt="Blossom" class="wf-topbar-logo">'
        + '    </a>'
        + '    <div class="wf-topbar-meta">'
        + '      <div class="wf-topbar-meta-row">'
        + '        <span class="wf-topbar-title" id="wfe-title">로딩중...</span>'
        + '        <span class="wf-topbar-status" id="wfe-status"></span>'
        + '      </div>'
        + '      <div class="wf-topbar-meta-row wf-topbar-meta-sub">'
        + '        <span class="wf-topbar-desc" id="wfe-desc" title="클릭하여 설명 편집"></span>'
        + '      </div>'
        + '    </div>'
        + '    <lottie-player src="/static/image/svg/workflow/free-animated-icon-eraser-hand.json" background="transparent" speed="1" style="width:40px;height:40px;flex-shrink:0;" loop autoplay></lottie-player>'
        + '  </div>'
        + '  <div class="wf-topbar-center" id="wfe-center-tools"></div>'
        + '  <div class="wf-topbar-right">'
        + '    <div class="wf-topbar-author" id="wfe-author"></div>'
        + '    <div class="wf-viewer-badge" id="wfe-viewer-badge" style="display:none;" title="시청자"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg><span id="wfe-viewer-count">0</span>명 시청중</div>'
        + '    <button class="wf-comment-btn" id="wfe-comments" type="button" title="채팅"><img src="/static/image/svg/workflow/free-icon-font-messages.svg" alt="채팅"></button>'
        + '    <button class="wf-share-btn" id="wfe-share" type="button" title="공유"><img src="/static/image/svg/workflow/free-icon-font-share.svg" alt="공유"></button>'
        + '    <button class="wf-save-btn" id="wfe-save" type="button" title="저장"><img src="/static/image/svg/save.svg" alt="저장"></button>'
        + '  </div>'
        + '</div>'
        // ── 바디 (툴바 + 캔버스 + 속성패널) ──
        + '<div class="wf-editor-body">'
        + '  <div class="wf-editor-toolbar" id="wfe-toolbar"></div>'
        + '  <div class="wf-editor-canvas-area" id="wfe-canvas-area">'
        + '    <div class="wf-canvas-viewport" id="wfe-viewport">'
        + '      <div class="wf-canvas-world" id="wfe-world"></div>'
        + '    </div>'
        + '    <div class="wf-editor-bottombar" id="wfe-bottombar">'
        + '      <div class="wf-bottombar-spacer"></div>'
        + '      <div class="wf-zoom-group">'
        + '        <button class="wf-zoom-btn wf-zoom-select" id="wfe-zoom-select" type="button" title="선택 (V)"><img src="/static/image/svg/workflow/free-icon-font-cursor.svg" alt="선택" width="16" height="16"></button>'
        + '        <span class="wf-zoom-sep"></span>'
        + '        <button class="wf-zoom-btn" id="wfe-zoom-out" type="button" title="축소 (-)"><img src="/static/image/svg/workflow/free-icon-font-map-marker-minus.svg" alt="축소" width="16" height="16"></button>'
        + '        <input class="wf-zoom-input" id="wfe-zoom-level" type="text" value="100%" title="확대/축소 비율 입력">'
        + '        <button class="wf-zoom-btn" id="wfe-zoom-in" type="button" title="확대 (+)"><img src="/static/image/svg/workflow/free-icon-font-map-marker-plus.svg" alt="확대" width="16" height="16"></button>'
        + '        <button class="wf-zoom-btn" id="wfe-zoom-fit" type="button" title="화면 맞춤"><img src="/static/image/svg/workflow/free-icon-font-expand.svg" alt="화면맞춤" width="16" height="16"></button>'
        + '        <span class="wf-zoom-sep"></span>'
        + '        <button class="wf-zoom-btn wf-zoom-grid-toggle" id="wfe-grid-toggle" type="button" title="캔버스 배경"><img src="/static/image/svg/workflow/free-icon-font-dots-loading.svg" alt="캔버스 배경" width="16" height="16"></button>'
        + '        <span class="wf-zoom-sep"></span>'
        + '        <button class="wf-zoom-btn wf-zoom-bg-mode" id="wfe-bg-mode" type="button" title="배경모드"><img src="/static/image/svg/workflow/free-icon-font-brightness-low.svg" alt="배경모드" width="16" height="16"></button>'
        + '        <span class="wf-zoom-sep"></span>'
        + '        <button class="wf-zoom-btn wf-zoom-history" id="wfe-history" type="button" title="변경 이력"><img src="/static/image/svg/workflow/free-icon-font-time-past.svg" alt="변경 이력" width="16" height="16"></button>'
        + '        <span class="wf-zoom-sep"></span>'
        + '        <button class="wf-zoom-btn wf-zoom-thumbnail" id="wfe-thumbnail" type="button" title="썸네일 캡처"><img src="/static/image/svg/workflow/free-icon-font-portrait.svg" alt="썸네일" width="16" height="16"></button>'
        + '      </div>'
        + '    </div>'
        + '  </div>'
        + '  <div class="wf-editor-props" id="wfe-props">'
        + '    <div class="wf-props-title">'
        + '      <span>속성</span>'
        + '      <button class="wf-props-close" id="wfe-props-close" type="button">&#x2715;</button>'
        + '    </div>'
        + '    <div id="wfe-prop-form"></div>'
        + '  </div>'
        + '</div>';

    // ── DOM 참조 ──
    var worldEl    = document.getElementById('wfe-world');
    var viewportEl = document.getElementById('wfe-viewport');
    var toolbar    = document.getElementById('wfe-toolbar');
    var propsPanel = document.getElementById('wfe-props');
    var propForm   = document.getElementById('wfe-prop-form');

    // 현재 사용자 ID (채팅 삭제 권한 등에 사용)
    var _mainEl = document.querySelector('.wf-editor-main');
    window.__wfCurrentUserId = _mainEl ? parseInt(_mainEl.getAttribute('data-profile-id'), 10) || null : null;

    // ── 노드 타입 정의 ──
    var NODE_TYPES = [
        // 워크플로우 노드
        {type:'start',    label:'시작',      color:'#22c55e', icon:'▶',  category:'workflow', w:140, h:56},
        {type:'task',     label:'작업',      color:'#3b82f6', icon:'📋', category:'workflow', w:160, h:56},
        {type:'approval', label:'승인',      color:'#f59e0b', icon:'✅', category:'workflow', w:160, h:56},
        {type:'decision', label:'분기',      color:'#a855f7', icon:'◇',  category:'workflow', w:160, h:56},
        {type:'system',   label:'시스템',    color:'#14b8a6', icon:'⚙',  category:'workflow', w:160, h:56},
        {type:'end',      label:'종료',      color:'#ef4444', icon:'⏹',  category:'workflow', w:140, h:56},
        // 디자인 프레임/도형
        {type:'process',  label:'프로세스',  color:'#1e293b', icon:'▭',  category:'shape', w:240, h:160, shape:'rect'},
        {type:'frame',    label:'프레임',    color:'#94a3b8', icon:'⊞',  category:'shape', w:200, h:200, shape:'frame'},
        {type:'title',    label:'텍스트',    color:'#334155', icon:'T',   category:'shape', w:260, h:120, shape:'title'},
        {type:'note',     label:'',         color:'#fbbf24', icon:'📝', category:'shape', w:180, h:140, shape:'note'},
        {type:'diamond',  label:'다이아몬드',color:'#7c3aed', icon:'◆',  category:'shape', w:140, h:140, shape:'diamond'},
        {type:'circle',   label:'원형',      color:'#0ea5e9', icon:'●',  category:'shape', w:120, h:120, shape:'circle'},
        {type:'table',    label:'표',        color:'#4f46e5', icon:'⊞',  category:'shape', w:400, h:300, shape:'table'},
        // 추가 도형
        {type:'rounded_rect', label:'둥근 사각형', color:'#1e293b', icon:'▢', category:'shape', w:200, h:140, shape:'rounded_rect'},
        {type:'ellipse',      label:'타원',       color:'#0ea5e9', icon:'⬮', category:'shape', w:180, h:120, shape:'ellipse'},
        {type:'triangle',     label:'삼각형',     color:'#f97316', icon:'△', category:'shape', w:140, h:140, shape:'triangle'},
        {type:'pentagon',     label:'오각형',     color:'#10b981', icon:'⬠', category:'shape', w:140, h:140, shape:'pentagon'},
        {type:'hexagon',      label:'육각형',     color:'#8b5cf6', icon:'⬡', category:'shape', w:160, h:140, shape:'hexagon'},
        {type:'star',         label:'별',         color:'#eab308', icon:'★', category:'shape', w:140, h:140, shape:'star'},
        {type:'parallelogram',label:'평행사변형', color:'#64748b', icon:'▱', category:'shape', w:200, h:120, shape:'parallelogram'},
        {type:'trapezoid',    label:'사다리꼴',   color:'#64748b', icon:'⏢', category:'shape', w:200, h:120, shape:'trapezoid'},
        {type:'cylinder',     label:'원기둥',     color:'#06b6d4', icon:'⌂', category:'shape', w:120, h:160, shape:'cylinder'},
        {type:'arrow_right',  label:'화살표',     color:'#3b82f6', icon:'➜', category:'shape', w:200, h:100, shape:'arrow_right'},
        {type:'cross',        label:'십자',       color:'#ef4444', icon:'✚', category:'shape', w:140, h:140, shape:'cross'},
        {type:'callout',      label:'말풍선',     color:'#8b5cf6', icon:'💬', category:'shape', w:200, h:140, shape:'callout'},
        {type:'mindmap',      label:'마인드맵',   color:'#5b5fc7', icon:'🧠', category:'shape', w:400, h:260, shape:'mindmap'},
        {type:'er_table',     label:'ER 테이블', color:'#3b82f6', icon:'⊞',  category:'shape', w:260, h:220, shape:'er_table'},
    ];

    // ── 도형 카테고리 정의 (패널 + 자동 등록) ──
    var SHAPE_CATEGORIES = [
        {id:'flowchart', label:'플로우차트', items:[
            {type:'fc_process',     label:'처리',       w:200,h:120, vb:'0 0 100 80',  svg:'<rect x="3" y="3" width="94" height="74" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'fc_decision',    label:'판단',       w:140,h:140, vb:'0 0 100 100', svg:'<polygon points="50,3 97,50 50,97 3,50" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'fc_terminator',  label:'단말',       w:180,h:80,  vb:'0 0 120 60',  svg:'<rect x="3" y="3" width="114" height="54" rx="27" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'fc_data',        label:'데이터',     w:200,h:120, vb:'0 0 100 80',  svg:'<polygon points="18,3 97,3 82,77 3,77" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'fc_predefined',  label:'사전정의',   w:200,h:120, vb:'0 0 100 80',  svg:'<rect x="3" y="3" width="94" height="74" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><line x1="12" y1="3" x2="12" y2="77" stroke="currentColor" stroke-width="2"/><line x1="88" y1="3" x2="88" y2="77" stroke="currentColor" stroke-width="2"/>'},
            {type:'fc_document',    label:'문서',       w:200,h:140, vb:'0 0 100 100', svg:'<path d="M5 5h90v68c-15 14-30-6-45 8-15-14-30 6-45-8z" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'fc_multi_doc',   label:'복수 문서',  w:200,h:140, vb:'0 0 110 110', svg:'<path d="M15 15h80v60c-13 12-26-5-40 7-14-12-27 5-40-7z" fill="none" stroke="currentColor" stroke-width="2"/><rect x="10" y="8" width="80" height="3" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="5" y="2" width="80" height="3" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/>'},
            {type:'fc_manual_input',label:'수동 입력',  w:200,h:120, vb:'0 0 100 80',  svg:'<polygon points="3,20 97,3 97,77 3,77" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'fc_preparation', label:'준비',       w:180,h:120, vb:'0 0 100 80',  svg:'<polygon points="18,3 82,3 97,40 82,77 18,77 3,40" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'fc_stored_data', label:'저장 데이터',w:180,h:120, vb:'0 0 100 80',  svg:'<path d="M18 3h77v74H18c-10-12-14-25-14-37s4-25 14-37z" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'fc_delay',       label:'지연',       w:180,h:100, vb:'0 0 100 70',  svg:'<path d="M3 3h60c22 0 34 16 34 32s-12 32-34 32H3z" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'fc_merge',       label:'병합',       w:140,h:120, vb:'0 0 100 100', svg:'<polygon points="3,3 97,3 50,97" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'fc_extract',     label:'추출',       w:140,h:120, vb:'0 0 100 100', svg:'<polygon points="50,3 97,97 3,97" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'fc_connector',   label:'연결자',     w:80, h:80,  vb:'0 0 100 100', svg:'<circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'fc_off_page',    label:'타 페이지',  w:100,h:120, vb:'0 0 80 100',  svg:'<polygon points="3,3 77,3 77,65 40,97 3,65" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'fc_sort',        label:'정렬',       w:120,h:120, vb:'0 0 100 100', svg:'<polygon points="50,3 97,50 50,97 3,50" fill="none" stroke="currentColor" stroke-width="2"/><line x1="3" y1="50" x2="97" y2="50" stroke="currentColor" stroke-width="2"/>'},
            {type:'fc_collate',     label:'대조',       w:120,h:120, vb:'0 0 100 100', svg:'<polygon points="3,3 97,3 50,50" fill="none" stroke="currentColor" stroke-width="2"/><polygon points="50,50 97,97 3,97" fill="none" stroke="currentColor" stroke-width="2"/>'},
        ]},
        {id:'basic', label:'기본모양', items:[
            {type:'process',        label:'사각형',       w:240,h:160, vb:'0 0 100 100', svg:'<rect x="3" y="3" width="94" height="94" rx="1" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'rounded_rect',   label:'둥근 사각형',  w:200,h:140, vb:'0 0 100 100', svg:'<rect x="3" y="3" width="94" height="94" rx="18" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'circle',         label:'원',           w:120,h:120, vb:'0 0 100 100', svg:'<circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'ellipse',        label:'타원',         w:180,h:120, vb:'0 0 100 70',  svg:'<ellipse cx="50" cy="35" rx="46" ry="32" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'triangle',       label:'삼각형',       w:140,h:140, vb:'0 0 100 100', svg:'<polygon points="50,5 95,95 5,95" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'bs_right_tri',   label:'직각삼각형',   w:140,h:140, vb:'0 0 100 100', svg:'<polygon points="5,5 95,95 5,95" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'diamond',        label:'다이아몬드',   w:140,h:140, vb:'0 0 100 100', svg:'<polygon points="50,3 97,50 50,97 3,50" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'pentagon',       label:'오각형',       w:140,h:140, vb:'0 0 100 100', svg:'<polygon points="50,5 97,38 80,95 20,95 3,38" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'hexagon',        label:'육각형',       w:160,h:140, vb:'0 0 100 100', svg:'<polygon points="25,5 75,5 97,50 75,95 25,95 3,50" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'bs_octagon',     label:'팔각형',       w:140,h:140, vb:'0 0 100 100', svg:'<polygon points="30,3 70,3 97,30 97,70 70,97 30,97 3,70 3,30" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'star',           label:'별',           w:140,h:140, vb:'0 0 100 100', svg:'<polygon points="50,5 61,37 95,38 68,58 79,91 50,71 21,91 32,58 5,38 39,37" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'cross',          label:'십자',         w:140,h:140, vb:'0 0 100 100', svg:'<polygon points="35,5 65,5 65,35 95,35 95,65 65,65 65,95 35,95 35,65 5,65 5,35 35,35" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'parallelogram',  label:'평행사변형',   w:200,h:120, vb:'0 0 100 100', svg:'<polygon points="20,5 95,5 80,95 5,95" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'trapezoid',      label:'사다리꼴',     w:200,h:120, vb:'0 0 100 100', svg:'<polygon points="15,5 85,5 95,95 5,95" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'bs_heart',       label:'하트',         w:140,h:130, vb:'0 0 100 100', svg:'<path d="M50 88C25 65 2 42 12 22 20 6 38 4 50 18 62 4 80 6 88 22 98 42 75 65 50 88z" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'bs_crescent',    label:'반달',         w:120,h:140, vb:'0 0 80 100',  svg:'<path d="M55 5A45 45 0 1 0 55 95 35 35 0 1 1 55 5z" fill="none" stroke="currentColor" stroke-width="2"/>'},
        ]},
        {id:'annotation', label:'주석', items:[
            {type:'callout',           label:'말풍선',       w:200,h:140, vb:'0 0 100 100', svg:'<path d="M5 5h90v60H55l-15 30v-30H5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'},
            {type:'an_rounded_callout',label:'둥근 말풍선', w:200,h:140, vb:'0 0 100 100', svg:'<path d="M15 5h70a10 10 0 0 1 10 10v45a10 10 0 0 1-10 10H55l-15 25v-25H15a10 10 0 0 1-10-10V15a10 10 0 0 1 10-10z" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'an_thought',        label:'생각 풍선',   w:200,h:150, vb:'0 0 100 100', svg:'<ellipse cx="50" cy="38" rx="40" ry="28" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="30" cy="78" r="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="22" cy="90" r="3" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'an_bracket_l',      label:'왼쪽 괄호',   w:40, h:160, vb:'0 0 30 100',  svg:'<path d="M25 3C10 3 8 20 8 50s2 47 17 47" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'an_bracket_r',      label:'오른쪽 괄호', w:40, h:160, vb:'0 0 30 100',  svg:'<path d="M5 3C20 3 22 20 22 50s-2 47-17 47" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'an_brace_l',        label:'왼쪽 중괄호', w:40, h:180, vb:'0 0 30 100',  svg:'<path d="M22 3c-6 0-9 5-9 14s-3 14-10 16c0 0 0 0 0 0 7 2 10 6 10 16s3 14 9 14" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'an_brace_r',        label:'오른쪽 중괄호',w:40,h:180, vb:'0 0 30 100',  svg:'<path d="M8 3c6 0 9 5 9 14s3 14 10 16c-7 2-10 6-10 16s-3 14-9 14" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'an_note',           label:'메모 표시',   w:160,h:140, vb:'0 0 100 100', svg:'<path d="M5 5h70l20 20v70H5z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M75 5v20h20" fill="none" stroke="currentColor" stroke-width="2"/>'},
        ]},
        {id:'arrow', label:'방향', items:[
            {type:'arrow_right',    label:'오른쪽',         w:200,h:100, vb:'0 0 100 60',  svg:'<polygon points="5,15 65,15 65,3 95,30 65,57 65,45 5,45" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'dr_arrow_left',  label:'왼쪽',           w:200,h:100, vb:'0 0 100 60',  svg:'<polygon points="95,15 35,15 35,3 5,30 35,57 35,45 95,45" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'dr_arrow_up',    label:'위쪽',           w:100,h:200, vb:'0 0 60 100',  svg:'<polygon points="15,95 15,35 3,35 30,5 57,35 45,35 45,95" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'dr_arrow_down',  label:'아래쪽',         w:100,h:200, vb:'0 0 60 100',  svg:'<polygon points="15,5 15,65 3,65 30,95 57,65 45,65 45,5" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'dr_arrow_bi',    label:'양방향',         w:240,h:80,  vb:'0 0 120 60',  svg:'<polygon points="15,3 15,15 85,15 85,3 115,30 85,57 85,45 15,45 15,57 5,30" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'dr_chevron',     label:'갈매기표',       w:180,h:100, vb:'0 0 100 60',  svg:'<polygon points="5,3 70,3 95,30 70,57 5,57 30,30" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'dr_notched',     label:'노치 화살표',    w:200,h:100, vb:'0 0 100 60',  svg:'<polygon points="5,3 65,3 65,0 95,30 65,60 65,57 5,57 18,30" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'dr_striped',     label:'줄무늬 화살표',  w:200,h:100, vb:'0 0 100 60',  svg:'<polygon points="25,15 65,15 65,3 95,30 65,57 65,45 25,45" fill="none" stroke="currentColor" stroke-width="2"/><rect x="5" y="15" width="5" height="30" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="15" y="15" width="5" height="30" fill="none" stroke="currentColor" stroke-width="1.5"/>'},
        ]},
        {id:'usecase', label:'용례도', items:[
            {type:'uc_actor',    label:'액터',         w:80, h:140, vb:'0 0 60 100', svg:'<circle cx="30" cy="15" r="12" fill="none" stroke="currentColor" stroke-width="2"/><line x1="30" y1="27" x2="30" y2="60" stroke="currentColor" stroke-width="2"/><line x1="5" y1="42" x2="55" y2="42" stroke="currentColor" stroke-width="2"/><line x1="30" y1="60" x2="10" y2="90" stroke="currentColor" stroke-width="2"/><line x1="30" y1="60" x2="50" y2="90" stroke="currentColor" stroke-width="2"/>'},
            {type:'uc_usecase',  label:'유즈케이스',   w:200,h:100, vb:'0 0 100 60', svg:'<ellipse cx="50" cy="30" rx="47" ry="27" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'uc_boundary', label:'시스템 경계',  w:300,h:200, vb:'0 0 100 80', svg:'<rect x="3" y="12" width="94" height="65" fill="none" stroke="currentColor" stroke-width="2"/><rect x="3" y="3" width="40" height="14" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'uc_package',  label:'패키지',       w:240,h:160, vb:'0 0 100 80', svg:'<rect x="3" y="15" width="94" height="62" fill="none" stroke="currentColor" stroke-width="2"/><rect x="3" y="3" width="35" height="12" fill="none" stroke="currentColor" stroke-width="2"/>'},
        ]},
        {id:'sequence', label:'시간순서도', items:[
            {type:'sq_lifeline',   label:'라이프라인', w:100,h:200, vb:'0 0 60 100', svg:'<rect x="8" y="3" width="44" height="20" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><line x1="30" y1="23" x2="30" y2="97" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3"/>'},
            {type:'sq_activation', label:'활성화',     w:40, h:160, vb:'0 0 30 100', svg:'<rect x="3" y="3" width="24" height="94" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'sq_frame',      label:'프레임',     w:300,h:200, vb:'0 0 100 80', svg:'<rect x="3" y="3" width="94" height="74" fill="none" stroke="currentColor" stroke-width="2"/><polygon points="3,3 40,3 40,14 34,18 3,18" fill="none" stroke="currentColor" stroke-width="1.5"/>'},
            {type:'sq_actor',      label:'액터',       w:80, h:120, vb:'0 0 60 100', svg:'<circle cx="30" cy="15" r="12" fill="none" stroke="currentColor" stroke-width="2"/><line x1="30" y1="27" x2="30" y2="60" stroke="currentColor" stroke-width="2"/><line x1="5" y1="42" x2="55" y2="42" stroke="currentColor" stroke-width="2"/><line x1="30" y1="60" x2="10" y2="90" stroke="currentColor" stroke-width="2"/><line x1="30" y1="60" x2="50" y2="90" stroke="currentColor" stroke-width="2"/>'},
        ]},
        {id:'classmap', label:'클래스맵', items:[
            {type:'cl_class',     label:'클래스',     w:200,h:160, vb:'0 0 100 80', svg:'<rect x="3" y="3" width="94" height="74" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><line x1="3" y1="22" x2="97" y2="22" stroke="currentColor" stroke-width="2"/><line x1="3" y1="50" x2="97" y2="50" stroke="currentColor" stroke-width="2"/>'},
            {type:'cl_interface', label:'인터페이스', w:200,h:140, vb:'0 0 100 80', svg:'<rect x="3" y="12" width="94" height="65" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><line x1="3" y1="30" x2="97" y2="30" stroke="currentColor" stroke-width="2"/><text x="50" y="9" text-anchor="middle" font-size="8" fill="currentColor">&lt;interface&gt;</text>'},
            {type:'cl_abstract',  label:'추상 클래스',w:200,h:160, vb:'0 0 100 80', svg:'<rect x="3" y="3" width="94" height="74" rx="2" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="5 3"/><line x1="3" y1="22" x2="97" y2="22" stroke="currentColor" stroke-width="2" stroke-dasharray="5 3"/><line x1="3" y1="50" x2="97" y2="50" stroke="currentColor" stroke-width="2" stroke-dasharray="5 3"/>'},
            {type:'cl_enum',      label:'열거형',     w:200,h:140, vb:'0 0 100 80', svg:'<rect x="3" y="12" width="94" height="65" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><line x1="3" y1="30" x2="97" y2="30" stroke="currentColor" stroke-width="2"/><text x="50" y="9" text-anchor="middle" font-size="8" fill="currentColor">&lt;enum&gt;</text>'},
            {type:'cl_package',   label:'패키지',     w:240,h:160, vb:'0 0 100 80', svg:'<rect x="3" y="15" width="94" height="62" fill="none" stroke="currentColor" stroke-width="2"/><rect x="3" y="3" width="35" height="12" fill="none" stroke="currentColor" stroke-width="2"/>'},
        ]},
        {id:'state', label:'활성 상태 다이어그램', items:[
            {type:'st_initial',  label:'초기 상태', w:60, h:60,  vb:'0 0 60 60',  svg:'<circle cx="30" cy="30" r="15" fill="currentColor" stroke="currentColor" stroke-width="2"/>'},
            {type:'st_final',    label:'최종 상태', w:60, h:60,  vb:'0 0 60 60',  svg:'<circle cx="30" cy="30" r="20" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="30" cy="30" r="12" fill="currentColor"/>'},
            {type:'st_state',    label:'상태',       w:200,h:100, vb:'0 0 100 60', svg:'<rect x="3" y="3" width="94" height="54" rx="12" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'st_action',   label:'액션',       w:200,h:100, vb:'0 0 100 60', svg:'<rect x="3" y="3" width="94" height="54" rx="12" fill="none" stroke="currentColor" stroke-width="2"/><line x1="3" y1="18" x2="97" y2="18" stroke="currentColor" stroke-width="2"/>'},
            {type:'st_fork',     label:'포크/조인', w:240,h:16,  vb:'0 0 100 10', svg:'<rect x="3" y="2" width="94" height="6" rx="3" fill="currentColor" stroke="currentColor" stroke-width="1"/>'},
            {type:'st_decision', label:'결정',       w:80, h:80,  vb:'0 0 100 100',svg:'<polygon points="50,3 97,50 50,97 3,50" fill="none" stroke="currentColor" stroke-width="2"/>'},
        ]},
        {id:'ermodel', label:'ER 모델', items:[
            {type:'er_table',       label:'ER 테이블', w:260,h:220, vb:'0 0 100 80', svg:'<rect x="3" y="3" width="94" height="74" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><line x1="3" y1="18" x2="97" y2="18" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="30" r="2" fill="currentColor"/><line x1="18" y1="30" x2="60" y2="30" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="42" r="2" fill="currentColor"/><line x1="18" y1="42" x2="55" y2="42" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="54" r="2" fill="currentColor"/><line x1="18" y1="54" x2="50" y2="54" stroke="currentColor" stroke-width="1.5"/>'},
            {type:'er_entity',      label:'엔티티',     w:200,h:100, vb:'0 0 100 60', svg:'<rect x="3" y="3" width="94" height="54" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'er_weak_entity', label:'약한 엔티티',w:200,h:100, vb:'0 0 100 60', svg:'<rect x="3" y="3" width="94" height="54" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="8" y="8" width="84" height="44" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'er_attribute',   label:'속성',       w:140,h:80,  vb:'0 0 100 60', svg:'<ellipse cx="50" cy="30" rx="46" ry="26" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'er_key_attr',    label:'키 속성',   w:140,h:80,  vb:'0 0 100 60', svg:'<ellipse cx="50" cy="30" rx="46" ry="26" fill="none" stroke="currentColor" stroke-width="2"/><line x1="15" y1="40" x2="85" y2="40" stroke="currentColor" stroke-width="2"/>'},
            {type:'er_relationship',label:'관계',       w:140,h:100, vb:'0 0 100 80', svg:'<polygon points="50,3 97,40 50,77 3,40" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'er_weak_rel',    label:'약한 관계', w:140,h:100, vb:'0 0 100 80', svg:'<polygon points="50,3 97,40 50,77 3,40" fill="none" stroke="currentColor" stroke-width="2"/><polygon points="50,10 90,40 50,70 10,40" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'er_multi_attr', label:'다중값 속성',w:160,h:100, vb:'0 0 100 60', svg:'<ellipse cx="50" cy="30" rx="46" ry="26" fill="none" stroke="currentColor" stroke-width="2"/><ellipse cx="50" cy="30" rx="38" ry="20" fill="none" stroke="currentColor" stroke-width="2"/>'},
        ]},
        {id:'dataflow', label:'데이터 흐름도', items:[
            {type:'df_process',    label:'처리',         w:120,h:120, vb:'0 0 100 100', svg:'<circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'df_data_store', label:'데이터 저장소',w:200,h:80,  vb:'0 0 100 50',  svg:'<line x1="3" y1="3" x2="97" y2="3" stroke="currentColor" stroke-width="2"/><line x1="3" y1="47" x2="97" y2="47" stroke="currentColor" stroke-width="2"/><line x1="3" y1="3" x2="3" y2="47" stroke="currentColor" stroke-width="2"/>'},
            {type:'df_external',   label:'외부 엔티티', w:160,h:100, vb:'0 0 100 60',  svg:'<rect x="3" y="3" width="94" height="54" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'df_terminator', label:'터미네이터',   w:180,h:80,  vb:'0 0 120 60',  svg:'<rect x="3" y="3" width="114" height="54" rx="27" fill="none" stroke="currentColor" stroke-width="2"/>'},
        ]},
        {id:'system', label:'시스템', items:[
            {type:'cylinder',    label:'원기둥',       w:120,h:160, vb:'0 0 100 120',svg:'<ellipse cx="50" cy="18" rx="43" ry="14" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 18v84c0 7.7 19.3 14 43 14s43-6.3 43-14V18" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'sy_database', label:'데이터베이스', w:120,h:140, vb:'0 0 80 100', svg:'<ellipse cx="40" cy="18" rx="33" ry="14" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 18v64c0 7.7 14.8 14 33 14s33-6.3 33-14V18" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'sy_cloud',    label:'클라우드',     w:200,h:120, vb:'0 0 100 65', svg:'<path d="M25 52c-12 0-20-8-20-18s8-17 17-17c2-11 11-14 20-12 5-8 14-8 20-2 8-4 18 0 20 8 8 2 14 8 14 16s-8 16-18 16z" fill="none" stroke="currentColor" stroke-width="2"/>'},
            {type:'sy_server',   label:'서버',         w:100,h:140, vb:'0 0 70 100', svg:'<rect x="5" y="5" width="60" height="20" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><rect x="5" y="30" width="60" height="20" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><rect x="5" y="55" width="60" height="20" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="55" cy="15" r="3" fill="currentColor"/><circle cx="55" cy="40" r="3" fill="currentColor"/><circle cx="55" cy="65" r="3" fill="currentColor"/>'},
            {type:'sy_monitor',  label:'모니터',       w:160,h:120, vb:'0 0 100 80', svg:'<rect x="5" y="5" width="90" height="55" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><line x1="50" y1="60" x2="50" y2="70" stroke="currentColor" stroke-width="2"/><line x1="30" y1="72" x2="70" y2="72" stroke="currentColor" stroke-width="2"/>'},
            {type:'sy_firewall', label:'방화벽',       w:120,h:140, vb:'0 0 80 100', svg:'<rect x="5" y="25" width="70" height="70" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><polygon points="20,5 40,22 60,5 60,30 20,30" fill="none" stroke="currentColor" stroke-width="2"/>'},
        ]},
        {id:'network', label:'네트워크', items:[
            {type:'nw_server',       label:'서버',            w:100,h:100, imgSrc:'/static/image/svg/workflow/system/free-icon-server.svg'},
            {type:'nw_data_server1', label:'데이터 서버',     w:100,h:100, imgSrc:'/static/image/svg/workflow/system/free-icon-data-server1.svg'},
            {type:'nw_data_server2', label:'데이터 서버2',    w:100,h:100, imgSrc:'/static/image/svg/workflow/system/free-icon-data-server2.svg'},
            {type:'nw_computer1',    label:'컴퓨터',          w:100,h:100, imgSrc:'/static/image/svg/workflow/system/free-icon-computer1.svg'},
            {type:'nw_computer2',    label:'컴퓨터2',         w:100,h:100, imgSrc:'/static/image/svg/workflow/system/free-icon-computer2.svg'},
            {type:'nw_pc',           label:'PC',              w:100,h:100, imgSrc:'/static/image/svg/workflow/system/free-icon-pc.svg'},
            {type:'nw_firewall',     label:'방화벽',          w:100,h:100, imgSrc:'/static/image/svg/workflow/system/free-icon-firewall.svg'},
            {type:'nw_hub',          label:'허브/스위치',     w:100,h:100, imgSrc:'/static/image/svg/workflow/system/free-icon-hub.svg'},
            {type:'nw_wifi_router',  label:'와이파이 라우터', w:100,h:100, imgSrc:'/static/image/svg/workflow/system/free-icon-wifi-router.svg'},
            {type:'nw_nas',          label:'NAS',             w:100,h:100, imgSrc:'/static/image/svg/workflow/system/free-icon-nas.svg'},
            {type:'nw_cloud',        label:'클라우드',        w:100,h:100, imgSrc:'/static/image/svg/workflow/system/free-icon-cloud.svg'},
            {type:'nw_cloud_storage',label:'클라우드 스토리지',w:100,h:100,imgSrc:'/static/image/svg/workflow/system/free-icon-cloud-storage.svg'},
            {type:'nw_database',     label:'데이터베이스',    w:100,h:100, imgSrc:'/static/image/svg/workflow/system/free-icon-database.svg'},
            {type:'nw_printer',      label:'프린터',          w:100,h:100, imgSrc:'/static/image/svg/workflow/system/free-icon-printer.svg'},
            {type:'nw_mf_printer',   label:'복합기',          w:100,h:100, imgSrc:'/static/image/svg/workflow/system/free-icon-multifunction-printer.svg'},
            {type:'nw_3d_printer',   label:'3D 프린터',       w:100,h:100, imgSrc:'/static/image/svg/workflow/system/free-icon-3d-printer.svg'},
            {type:'nw_mobile',       label:'모바일',          w:80, h:120, imgSrc:'/static/image/svg/workflow/system/free-icon-mobile-phone.svg'},
            {type:'nw_smartphone1',  label:'스마트폰',        w:80, h:120, imgSrc:'/static/image/svg/workflow/system/free-icon-smartphone1.svg'},
            {type:'nw_smartphone2',  label:'스마트폰2',       w:80, h:120, imgSrc:'/static/image/svg/workflow/system/free-icon-smartphone2.svg'},
            {type:'nw_tablet',       label:'태블릿',          w:100,h:120, imgSrc:'/static/image/svg/workflow/system/free-icon-tablet.svg'},
            {type:'nw_cpu_tower',    label:'CPU 타워',        w:80, h:120, imgSrc:'/static/image/svg/workflow/system/free-icon-cpu-tower.svg'},
        ]},
    ];

    // ── 이미지 도형 카테고리 추가 (카드 / 회사 / 스티커) ──
    (function(){
        var B = '/static/image/svg/workflow/';
        function mk(dir, files, pfx){
            return files.map(function(f, i){
                var nm = f.replace(/\.svg$/,'').replace(/^\d+-/,'').replace(/^free-icon-/,'').replace(/-/g,' ');
                var idx = i + 1;
                return {type: pfx + (idx < 10 ? '0'+idx : ''+idx), label: nm, w:100, h:100, imgSrc: B + dir + '/' + f.replace(/ /g, '%20')};
            });
        }
        [
            {id:'card', label:'카드', items: mk('card', [
                'free-icon-bank-card.svg','free-icon-card-game.svg','free-icon-credit-card1.svg','free-icon-credit-card2.svg','free-icon-debit-card.svg'
            ], 'cd_')},
            {id:'company', label:'회사', items: mk('company', [
                'free-icon-apple-black-logo.svg','free-icon-instagram.svg','free-icon-java.svg','free-icon-kakao-talk.svg','free-icon-logos.svg','free-icon-meta.svg','free-icon-python.svg','free-icon-search.svg','free-icon-twitter.svg','free-icon-visa.svg','free-icon-windows1.svg','free-icon-windows2.svg','free-icon-youtube.svg'
            ], 'co_')},
            {id:'stk_weather', label:'날씨', group:'스티커', items: mk('weather', [
                '001-cloudy.svg','002-cloudy cloud rain.svg','003-downpour.svg','004-hail.svg','005-overcast.svg','006-rain.svg','007-rainbow.svg','008-starry night.svg','009-storm.svg','010-sun.svg','011-sunlight.svg','012-sun.svg','013-sunrise.svg','014-sunset.svg','015-temperature cold.svg','016-temperature hot.svg','017-thunder.svg','018-tornado.svg','019-windy.svg','020-windy rain.svg'
            ], 'wt_')},
            {id:'stk_christmas', label:'크리스마스', group:'스티커', items: mk('christmas', [
                '001-christmas decoration.svg','002-christmas decoration.svg','003-christmas decoration.svg','004-christmas decoration.svg','005-christmas decoration.svg','006-christmas decoration.svg','007-christmas decoration.svg','008-christmas decoration.svg','009-christmas decoration.svg','010-christmas decoration.svg','011-christmas decoration.svg','012-christmas decoration.svg','013-christmas decoration.svg','014-winter leaf.svg','015-holly berry.svg','016-holly berry.svg','017-holly berry.svg','018-holly berry.svg','019-tree branch.svg','020-holly berry.svg','021-holly berry.svg','022-nature.svg','023-christmas decoration.svg','024-nature.svg','025-holly berry.svg','026-leaf.svg','027-winter leaf.svg','028-holly berry.svg','029-holly berry.svg','030-winter leaf.svg','031-winter leaf.svg','032-holly berry.svg','033-nature.svg','034-christmas decoration.svg','035-nature.svg','036-christmas decoration.svg','037-christmas decorations.svg','038-christmas decorations.svg','039-christmas decoration.svg','040-christmas decoration.svg'
            ], 'xm_')},
            {id:'stk_halloween', label:'할로윈', group:'스티커', items: mk('halloween', [
                '001-bat.svg','002-broom.svg','003-candle.svg','004-candy corn.svg','005-candy.svg','006-black cat.svg','007-cauldron.svg','008-coffin.svg','009-fortune teler.svg','010-devil.svg','011-eyeball.svg','012-ghost.svg','013-grim reaper.svg','014-hand.svg','015-pumpkin.svg','016-night.svg','017-potion.svg','018-scythe.svg','019-skull.svg','020-spell book.svg','021-spider.svg','022-spider web.svg','023-tombstone.svg','024-witch hat.svg','025-zombie.svg'
            ], 'hl_')},
        ].forEach(function(c){ SHAPE_CATEGORIES.push(c); });
    })();

    // SHAPE_CATEGORIES → NODE_TYPES 자동 등록
    SHAPE_CATEGORIES.forEach(function(cat){
        cat.items.forEach(function(item){
            var exists = NODE_TYPES.some(function(nt){ return nt.type === item.type; });
            if(!exists){
                var entry = {type:item.type, label:item.label, color:'#64748b', icon:'', category:'shape', w:item.w||160, h:item.h||120, shape:item.type};
                if(item.svg)    { entry.svgContent = item.svg; entry.svgViewBox = item.vb || '0 0 100 100'; }
                if(item.imgSrc) { entry.imgSrc = item.imgSrc; }
                NODE_TYPES.push(entry);
            }
        });
    });

    // ── 상태 변수 ──
    var nodes = [];
    var edges = [];
    var nextId = 1;
    var selectedNode = null;
    var _selectedNodes = [];
    var _wasDragged = false;
    var _multiDragOrigins = [];
    var _marquee = null;
    var _mmSelectedBranch = null;
    var _mmSelectFlag = false;
    var _pendingMmStyle = 'mm_style_01';
    var _pendingMmLayout = 'horizontal';
    var _pendingLineStyle = 'elbow_arrow';
    var _selectedEdge = null;     // 선택된 엣지
    var _selectedEdges = [];       // 다중 선택된 엣지 (마퀴)
    var _lineDrawing = false;     // 라인 그리기 모드
    var _lineStartX = 0, _lineStartY = 0;
    var _lineStartNodeId = null;  // 시작 노드 ID (노드에서 시작한 경우)
    var _linePreview = null;      // SVG 미리보기
    // 라인 드래그 이동/끝점 조절 상태
    var _edgeDragging = false;    // 라인 전체 이동 중
    var _edgeDragEdge = null;     // 이동 중인 엣지
    var _edgeDragStartX = 0, _edgeDragStartY = 0;
    var _edgeDragOrigX1 = 0, _edgeDragOrigY1 = 0, _edgeDragOrigX2 = 0, _edgeDragOrigY2 = 0;
    var _edgeDragOrigMidX = undefined;
    var _edgeDragOrigJoints = null;
    var _edgeEndDrag = false;     // 끝점 조절 중
    var _edgeEndDragEdge = null;  // 끝점 조절 대상 엣지
    var _edgeEndDragEnd = '';     // 'start' | 'end'
    var _edgeJointDrag = false;   // 꺾인선 관절 드래그 중
    var _edgeJointDragEdge = null;
    var _edgeJointDragIdx = 0;    // 0=jx1, 1=jy, 2=jx2
    var _edgeWpDrag = false;      // 웨이포인트 드래그 중
    var _edgeWpDragEdge = null;
    var _edgeWpDragIdx = -1;
    var _edgeDragOrigWps = null;  // 전체 이동 시 원본 웨이포인트
    var _clipboard = null;        // {node:dataCopy, offsetX, offsetY}
    var _ctxMenu = null;          // 우클릭 컨텍스트 메뉴 엘리먼트
    var _ctxMenuTarget = null;    // 우클릭 대상 node or {type:'edge', edge:...}
    // 포트 드래그 연결 미리보기
    var _portDragActive = false;
    var _portDragSrcX = 0, _portDragSrcY = 0;
    var _portDragLine = null;
    var _portDragSrcNodeId = null;

    // ── 실행취소(Undo) 스택 ──
    var _undoStack = [];
    var _undoMax = 50;
    function _cloneState(){
        return JSON.stringify({
            nodes: nodes.map(function(n){ return {id:n.id, type:n.type, position:{x:n.position.x, y:n.position.y}, size:n.size?{w:n.size.w,h:n.size.h}:null, data:JSON.parse(JSON.stringify(n.data||{})), _meta:n._meta?JSON.parse(JSON.stringify(n._meta)):null}; }),
            edges: edges.map(function(e){ return JSON.parse(JSON.stringify(e)); }),
            drawPaths: drawPaths.map(function(d){ return JSON.parse(JSON.stringify(d)); }),
            nextId: nextId
        });
    }
    function pushUndo(){
        _undoStack.push(_cloneState());
        if(_undoStack.length > _undoMax) _undoStack.shift();
    }
    function popUndo(){
        if(!_undoStack.length) return;
        var snap = JSON.parse(_undoStack.pop());
        // DOM에서 기존 노드 제거
        nodes.forEach(function(n){
            var el = document.getElementById('nd-'+n.id);
            if(el) el.remove();
        });
        nodes = snap.nodes;
        edges = snap.edges;
        drawPaths = snap.drawPaths || [];
        nextId = snap.nextId || nextId;
        // 노드 재렌더
        nodes.forEach(function(n){ renderNodeEl(n); applyNodeBgColor(n); updateSysBadge(n); });
        drawEdges();
        if(_drawSvg) renderAllDrawPaths();
        selectNode(null);
        deselectEdge();
        _selectedEdges = [];
        scheduleLivePush();
    }

    var currentTool = 'select';
    var zoom = 1;
    var panX = 0, panY = 0;
    var isPanning = false;
    var panStartX = 0, panStartY = 0;
    var panStartPanX = 0, panStartPanY = 0;

    // ── 라인(연결선) 유형 정의 ──
    var LINE_TYPES = [
        {id:'straight_arrow', label:'직선 화살표', svg:'<line x1="8" y1="36" x2="36" y2="8" stroke="#334155" stroke-width="2" marker-end="url(#lt-arrow)"/>'},
        {id:'straight',       label:'직선',        svg:'<line x1="8" y1="36" x2="36" y2="8" stroke="#334155" stroke-width="2"/>'},
        {id:'curve_arrow',    label:'곡선 화살표', svg:'<path d="M8 36 Q8 8 36 8" fill="none" stroke="#334155" stroke-width="2" marker-end="url(#lt-arrow)"/>'},
        {id:'curve',          label:'곡선',        svg:'<path d="M8 36 Q8 8 36 8" fill="none" stroke="#334155" stroke-width="2"/>'},
        {id:'elbow_arrow',    label:'꺾인선 화살표', svg:'<polyline points="8,36 8,8 36,8" fill="none" stroke="#334155" stroke-width="2" marker-end="url(#lt-arrow)"/>'},
        {id:'elbow',          label:'꺾인선',      svg:'<polyline points="8,36 8,8 36,8" fill="none" stroke="#334155" stroke-width="2"/>'},
    ];

    // ── 좌측 도구 모음 구축 ──
    var TOOLS = [
        {id:'shape',    icon:'/static/image/svg/workflow/free-icon-font-star-octogram.svg', label:'도형', shortcut:'R', type:'shapes'},
        {id:'line',     icon:'/static/image/svg/workflow/free-icon-font-highlighter-line.svg',  label:'라인',     shortcut:'L', type:'lines'},
        {id:'frame',    icon:'/static/image/svg/workflow/free-icon-font-frame.svg',             label:'프레임',   shortcut:'F', type:'node'},
        {id:'title',    icon:'/static/image/svg/workflow/free-icon-font-text.svg',              label:'텍스트',   shortcut:'T', type:'node'},
        {id:'mindmap',  icon:'/static/image/svg/workflow/free-icon-font-sitemap.svg',           label:'마인드맵', shortcut:'',  type:'mindmap'},
        {id:'note',     icon:'/static/image/svg/workflow/free-icon-font-note-sticky.svg',       label:'메모',     shortcut:'N', type:'sticker'},
        {id:'pen',      icon:'/static/image/svg/workflow/free-icon-font-paintbrush-pencil.svg', label:'펜',       shortcut:'P', type:'pen'},
        {id:'table',    icon:'/static/image/svg/workflow/free-icon-font-table-list.svg', label:'표',       shortcut:'',  type:'table'},
    ];

    // 노드 하위 도구 ID 목록 (setTool에서 부모 강조용)
    var NODE_CHILD_IDS = ['start','task','approval','decision'];

    // 스티커 스타일 (메모 도구에서 선택)
    var _pendingNoteStyle = {bg:'#fef9c3', border:'#fde68a', text:'#713f12', ratio:'square', texture:''};

    // 테이블 삽입 설정
    var _pendingTable = {rows: 3, cols: 3};

    // 테이블 셀 선택 추적 — 배열 [{row,col}, ...]
    var _tblSelCells = [];
    var _tblDragSel = false;  // 드래그 선택 진행 중
    var _tblDragStart = null; // 드래그 시작 셀

    // 질감(텍스처) 프리셋
    var TEXTURE_PRESETS = [
        {id:'paper',     label:'종이',     css:'url("data:image/svg+xml,%3Csvg width=\'6\' height=\'6\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Crect width=\'6\' height=\'6\' fill=\'%23fef9c3\'/%3E%3Crect x=\'0\' y=\'0\' width=\'3\' height=\'3\' fill=\'%23fdf6b2\' opacity=\'.3\'/%3E%3C/svg%3E")'},
        {id:'linen',     label:'린넨',     pattern:'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.03) 2px,rgba(0,0,0,.03) 4px),repeating-linear-gradient(90deg,transparent,transparent 2px,rgba(0,0,0,.03) 2px,rgba(0,0,0,.03) 4px)'},
        {id:'grid',      label:'격자',     pattern:'repeating-linear-gradient(0deg,rgba(0,0,0,.05) 0 1px,transparent 1px 16px),repeating-linear-gradient(90deg,rgba(0,0,0,.05) 0 1px,transparent 1px 16px)'},
        {id:'dots',      label:'도트',     pattern:'radial-gradient(circle,rgba(0,0,0,.08) 1px,transparent 1px)', bgSize:'8px 8px'},
        {id:'diagonal',  label:'사선',     pattern:'repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(0,0,0,.04) 4px,rgba(0,0,0,.04) 5px)'},
        {id:'wave',      label:'물결',     pattern:'repeating-linear-gradient(0deg,transparent,transparent 6px,rgba(0,0,0,.04) 6px,rgba(0,0,0,.04) 7px)'},
    ];

    TOOLS.forEach(function(t){
        if(t.type === 'sep'){
            var sep = document.createElement('div');
            sep.className = 'wf-toolbar-sep';
            toolbar.appendChild(sep);
            return;
        }
        var btn = document.createElement('button');
        btn.className = 'wf-tool-btn' + (t.id === 'select' ? ' active' : '');
        btn.setAttribute('data-tool', t.id);
        btn.type = 'button';

        var iconWrap = document.createElement('span');
        iconWrap.className = 'wf-tool-icon';
        var img = document.createElement('img');
        img.src = t.icon;
        img.alt = t.label;
        img.draggable = false;
        iconWrap.appendChild(img);
        btn.appendChild(iconWrap);

        if(t.type === 'submenu'){
            // ── 서브메뉴 (노드) ──
            var submenu = document.createElement('div');
            submenu.className = 'wf-tool-submenu';
            t.children.forEach(function(c){
                var item = document.createElement('button');
                item.className = 'wf-submenu-item';
                item.type = 'button';
                item.setAttribute('data-tool', c.id);
                item.innerHTML = '<span class="wf-submenu-dot" style="background:'+c.color+'"></span>'
                               + '<span>'+c.label+'</span>';
                item.addEventListener('click', function(ev){
                    ev.stopPropagation();
                    setTool(c.id);
                });
                submenu.appendChild(item);
            });
            btn.appendChild(submenu);
            // 클릭 시 토글 (호버로도 열림)
            btn.addEventListener('click', function(ev){
                ev.stopPropagation();
            });
        } else if(t.type === 'sticker'){
            // ── 스티커 스타일 패널 ──
            var stickerPanel = document.createElement('div');
            stickerPanel.className = 'wf-sticker-panel';

            // 스티커 색상 프리셋
            var STICKER_COLORS = [
                {bg:'#1a1a1a', border:'#000000', text:'#ffffff'},
                {bg:'#292524', border:'#1c1917', text:'#fafaf9'},
                {bg:'#374151', border:'#1f2937', text:'#f9fafb'},
                {bg:'#4b5563', border:'#374151', text:'#f3f4f6'},
                {bg:'#6b7280', border:'#4b5563', text:'#f9fafb'},
                {bg:'#9ca3af', border:'#6b7280', text:'#1f2937'},
                {bg:'#d1d5db', border:'#9ca3af', text:'#1f2937'},
                {bg:'#f3f4f6', border:'#d1d5db', text:'#1f2937'},
                {bg:'#ffffff', border:'#e5e7eb', text:'#1f2937'},
                {bg:'#fef9c3', border:'#fde68a', text:'#713f12'},
                {bg:'#ffedd5', border:'#fdba74', text:'#7c2d12'},
                {bg:'#fce7f3', border:'#f9a8d4', text:'#831843'},
                {bg:'#fecdd3', border:'#fda4af', text:'#881337'},
                {bg:'#ffe4e6', border:'#fecdd3', text:'#881337'},
                {bg:'#dcfce7', border:'#86efac', text:'#14532d'},
                {bg:'#d1fae5', border:'#6ee7b7', text:'#064e3b'},
                {bg:'#ccfbf1', border:'#5eead4', text:'#134e4a'},
                {bg:'#dbeafe', border:'#93c5fd', text:'#1e3a5f'},
                {bg:'#e0f2fe', border:'#7dd3fc', text:'#0c4a6e'},
                {bg:'#f3e8ff', border:'#d8b4fe', text:'#581c87'},
                {bg:'#ede9fe', border:'#c4b5fd', text:'#4c1d95'},
                {bg:'#fdf2f8', border:'#f9a8d4', text:'#831843'},
                {bg:'#f5f3ff', border:'#ddd6fe', text:'#4c1d95'},
                {bg:'#faf5ff', border:'#e9d5ff', text:'#581c87'},
            ];

            var panelHtml = '<div class="wf-sticker-tabs">'
                + '<button class="wf-sticker-tab active" data-tab="solid"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg><span>단색</span></button>'
                + '<button class="wf-sticker-tab" data-tab="texture"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg><span>질감</span></button>'
                + '</div>';

            // 단색 탭 내용
            panelHtml += '<div class="wf-sticker-tab-body" data-tab-body="solid">';
            panelHtml += '<div class="wf-sticker-section">노트 색깔 <span class="wf-sticker-classic">클래식</span></div>';
            panelHtml += '<div class="wf-sticker-grid wf-sticker-grid-colors">';
            STICKER_COLORS.forEach(function(sc, idx){
                panelHtml += '<button class="wf-sticker-swatch wf-sticker-color" data-cidx="'+idx+'" style="background:'+sc.bg+';border-color:'+sc.border+'"></button>';
            });
            panelHtml += '</div>';
            panelHtml += '<div class="wf-sticker-section">사용자 정의 색상</div>';
            panelHtml += '<div class="wf-sticker-custom"><button class="wf-sticker-custom-add" id="wfe-sticker-custom-add">+</button></div>';
            panelHtml += '</div>';

            // 질감 탭 내용
            panelHtml += '<div class="wf-sticker-tab-body" data-tab-body="texture" style="display:none">';
            panelHtml += '<div class="wf-sticker-section">텍스처 스타일</div>';
            panelHtml += '<div class="wf-sticker-grid wf-sticker-grid-textures">';
            TEXTURE_PRESETS.forEach(function(tx, idx){
                panelHtml += '<button class="wf-sticker-swatch wf-sticker-texture" data-tidx="'+idx+'" title="'+tx.label+'"></button>';
            });
            panelHtml += '</div>';
            panelHtml += '<div class="wf-sticker-section">프리셋 패턴</div>';
            panelHtml += '<div class="wf-sticker-grid wf-sticker-grid-patterns">';
            var PATTERN_COMBOS = [
                {bg:'#fce7f3',pattern:'repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(0,0,0,.05) 4px,rgba(0,0,0,.05) 5px)',text:'#831843',border:'#f9a8d4'},
                {bg:'#dbeafe',pattern:'repeating-linear-gradient(0deg,rgba(0,0,0,.04) 0 1px,transparent 1px 10px),repeating-linear-gradient(90deg,rgba(0,0,0,.04) 0 1px,transparent 1px 10px)',text:'#1e3a5f',border:'#93c5fd'},
                {bg:'#f3e8ff',pattern:'radial-gradient(circle,rgba(0,0,0,.06) 1px,transparent 1px)',bgSize:'6px 6px',text:'#581c87',border:'#d8b4fe'},
                {bg:'#dbeafe',pattern:'repeating-linear-gradient(45deg,transparent,transparent 3px,rgba(0,0,0,.04) 3px,rgba(0,0,0,.04) 4px)',text:'#1e3a5f',border:'#93c5fd'},
                {bg:'#e0f2fe',pattern:'repeating-linear-gradient(0deg,transparent,transparent 5px,rgba(0,0,0,.03) 5px,rgba(0,0,0,.03) 6px)',text:'#0c4a6e',border:'#7dd3fc'},
                {bg:'#dcfce7',pattern:'repeating-linear-gradient(90deg,transparent,transparent 5px,rgba(0,0,0,.03) 5px,rgba(0,0,0,.03) 6px)',text:'#14532d',border:'#86efac'},
                {bg:'#fce7f3',pattern:'radial-gradient(circle,rgba(0,0,0,.06) 1px,transparent 1px)',bgSize:'8px 8px',text:'#831843',border:'#f9a8d4'},
                {bg:'#fef9c3',pattern:'repeating-linear-gradient(45deg,transparent,transparent 3px,rgba(0,0,0,.04) 3px,rgba(0,0,0,.04) 4px)',text:'#713f12',border:'#fde68a'},
                {bg:'#ffedd5',pattern:'repeating-linear-gradient(0deg,transparent,transparent 6px,rgba(0,0,0,.04) 6px,rgba(0,0,0,.04) 7px)',text:'#7c2d12',border:'#fdba74'},
                {bg:'#fef9c3',pattern:'repeating-linear-gradient(-45deg,transparent,transparent 3px,rgba(0,0,0,.04) 3px,rgba(0,0,0,.04) 4px)',text:'#713f12',border:'#fde68a'},
            ];
            PATTERN_COMBOS.forEach(function(pc, idx){
                panelHtml += '<button class="wf-sticker-swatch wf-sticker-pattern" data-pidx="'+idx+'" style="background:'+pc.bg+'"></button>';
            });
            panelHtml += '</div>';
            panelHtml += '</div>';

            stickerPanel.innerHTML = panelHtml;

            // 텍스처/패턴 스워치 미리보기 스타일 적용
            var texSwatches = stickerPanel.querySelectorAll('.wf-sticker-texture');
            for(var tsi=0; tsi<texSwatches.length; tsi++){
                var tidx2 = parseInt(texSwatches[tsi].getAttribute('data-tidx'));
                var tp2 = TEXTURE_PRESETS[tidx2];
                texSwatches[tsi].style.background = '#fef9c3';
                texSwatches[tsi].style.backgroundImage = tp2.pattern || tp2.css || '';
                if(tp2.bgSize) texSwatches[tsi].style.backgroundSize = tp2.bgSize;
            }
            var patSwatches = stickerPanel.querySelectorAll('.wf-sticker-pattern');
            for(var psi=0; psi<patSwatches.length; psi++){
                var pidx2 = parseInt(patSwatches[psi].getAttribute('data-pidx'));
                var pc2 = PATTERN_COMBOS[pidx2];
                patSwatches[psi].style.background = pc2.bg;
                patSwatches[psi].style.backgroundImage = pc2.pattern || '';
                if(pc2.bgSize) patSwatches[psi].style.backgroundSize = pc2.bgSize;
            }

            // 탭 전환
            stickerPanel.addEventListener('click', function(ev){
                var tab = ev.target.closest('.wf-sticker-tab');
                if(tab){
                    ev.stopPropagation();
                    var tabId = tab.getAttribute('data-tab');
                    var tabs = stickerPanel.querySelectorAll('.wf-sticker-tab');
                    for(var ti=0;ti<tabs.length;ti++) tabs[ti].classList.toggle('active', tabs[ti]===tab);
                    var bodies = stickerPanel.querySelectorAll('.wf-sticker-tab-body');
                    for(var bi=0;bi<bodies.length;bi++) bodies[bi].style.display = bodies[bi].getAttribute('data-tab-body')===tabId?'':'none';
                    return;
                }
                // 단색 클릭
                var sw = ev.target.closest('.wf-sticker-color');
                if(sw){
                    ev.stopPropagation();
                    var cidx = parseInt(sw.getAttribute('data-cidx'));
                    var sc = STICKER_COLORS[cidx];
                    _pendingNoteStyle = {bg:sc.bg, border:sc.border, text:sc.text, ratio:'square', texture:''};
                    setTool('note');
                    return;
                }
                // 텍스처 클릭
                var tx = ev.target.closest('.wf-sticker-texture');
                if(tx){
                    ev.stopPropagation();
                    var tidx = parseInt(tx.getAttribute('data-tidx'));
                    var tp = TEXTURE_PRESETS[tidx];
                    _pendingNoteStyle = {bg:'#fef9c3', border:'#fde68a', text:'#713f12', ratio:'square', texture:tp.pattern||tp.css||'', textureBgSize:tp.bgSize||''};
                    setTool('note');
                    return;
                }
                // 패턴 클릭
                var pt = ev.target.closest('.wf-sticker-pattern');
                if(pt){
                    ev.stopPropagation();
                    var pidx = parseInt(pt.getAttribute('data-pidx'));
                    var pc = PATTERN_COMBOS[pidx];
                    _pendingNoteStyle = {bg:pc.bg, border:pc.border, text:pc.text, ratio:'square', texture:pc.pattern||'', textureBgSize:pc.bgSize||''};
                    setTool('note');
                    return;
                }
            });

            // 사용자 정의 색상
            stickerPanel.querySelector('#wfe-sticker-custom-add').addEventListener('click', function(ev){
                ev.stopPropagation();
                var ci = document.createElement('input');
                ci.type='color'; ci.value='#fef9c3'; ci.style.cssText='width:0;height:0;opacity:0;position:absolute';
                stickerPanel.appendChild(ci);
                ci.click();
                ci.addEventListener('input', function(){
                    var hex = ci.value;
                    _pendingNoteStyle = {bg:hex, border:hex, text:'#1f2937', ratio:'square', texture:''};
                    setTool('note');
                    ci.remove();
                });
            });

            btn.appendChild(stickerPanel);
            btn.addEventListener('click', function(ev){
                ev.stopPropagation();
            });
        } else if(t.type === 'pen'){
            var tip = document.createElement('span');
            tip.className = 'wf-tool-tip';
            tip.innerHTML = t.label + (t.shortcut ? ' <kbd>'+t.shortcut+'</kbd>' : '');
            btn.appendChild(tip);
            btn.addEventListener('click', function(){
                if(currentTool === 'pen'){
                    exitDrawMode();
                } else {
                    enterDrawMode();
                }
            });
        } else if(t.type === 'table'){
            // ── 표 삽입 패널 ──
            var tablePanel = document.createElement('div');
            tablePanel.className = 'wf-table-panel';
            var maxR = 10, maxC = 10;
            var tpHtml = '<div class="wf-table-panel-header">'
                + '<span class="wf-table-panel-title">표 삽입</span>'
                + '<span class="wf-table-panel-size" id="wfe-tbl-size">1 × 1</span>'
                + '</div>';
            tpHtml += '<div class="wf-table-grid" id="wfe-tbl-grid">';
            for(var ri=0; ri<maxR; ri++){
                for(var ci=0; ci<maxC; ci++){
                    tpHtml += '<div class="wf-table-cell" data-r="'+(ri+1)+'" data-c="'+(ci+1)+'"></div>';
                }
            }
            tpHtml += '</div>';
            tpHtml += '<div class="wf-table-panel-footer">'
                + '<span class="wf-table-input-group"><span class="wf-table-input-label">행</span><input type="number" class="wf-table-input" id="wfe-tbl-rows" value="3" min="1" max="20"></span>'
                + '<span class="wf-table-input-group"><span class="wf-table-input-label">열</span><input type="number" class="wf-table-input" id="wfe-tbl-cols" value="3" min="1" max="20"></span>'
                + '</div>';
            tablePanel.innerHTML = tpHtml;
            btn.appendChild(tablePanel);

            // 그리드 호버
            tablePanel.addEventListener('mouseover', function(ev){
                var cell = ev.target.closest('.wf-table-cell');
                if(!cell) return;
                var hr = parseInt(cell.getAttribute('data-r'));
                var hc = parseInt(cell.getAttribute('data-c'));
                var sizeEl = tablePanel.querySelector('#wfe-tbl-size');
                if(sizeEl) sizeEl.textContent = hc + ' × ' + hr;
                var cells = tablePanel.querySelectorAll('.wf-table-cell');
                for(var i=0; i<cells.length; i++){
                    var cr = parseInt(cells[i].getAttribute('data-r'));
                    var cc = parseInt(cells[i].getAttribute('data-c'));
                    cells[i].classList.toggle('highlight', cr <= hr && cc <= hc);
                }
                tablePanel.querySelector('#wfe-tbl-rows').value = hr;
                tablePanel.querySelector('#wfe-tbl-cols').value = hc;
            });

            // 그리드 클릭 → 표 삽입
            tablePanel.addEventListener('click', function(ev){
                ev.stopPropagation();
                var cell = ev.target.closest('.wf-table-cell');
                if(cell){
                    var tr = parseInt(tablePanel.querySelector('#wfe-tbl-rows').value) || 3;
                    var tc = parseInt(tablePanel.querySelector('#wfe-tbl-cols').value) || 3;
                    _pendingTable = {rows: Math.max(1,Math.min(20,tr)), cols: Math.max(1,Math.min(20,tc))};
                    setTool('table');
                    return;
                }
            });

            btn.addEventListener('click', function(ev){
                ev.stopPropagation();
            });
        } else if(t.type === 'shapes'){
            // 도형 패널은 툴바 외부에 별도 생성 — 여기서는 클릭 토글만
            var tip = document.createElement('span');
            tip.className = 'wf-tool-tip';
            tip.innerHTML = t.label + (t.shortcut ? ' <kbd>'+t.shortcut+'</kbd>' : '');
            btn.appendChild(tip);
            btn.addEventListener('click', function(ev){
                ev.stopPropagation();
                toggleShapesPanel();
            });
        } else if(t.type === 'lines'){
            // 라인 패널 토글
            var tip = document.createElement('span');
            tip.className = 'wf-tool-tip';
            tip.innerHTML = t.label + (t.shortcut ? ' <kbd>'+t.shortcut+'</kbd>' : '');
            btn.appendChild(tip);
            btn.addEventListener('click', function(ev){
                ev.stopPropagation();
                setTool('connect');
                toggleLinesPanel();
            });
        } else if(t.type === 'mindmap'){
            var tip = document.createElement('span');
            tip.className = 'wf-tool-tip';
            tip.innerHTML = t.label + (t.shortcut ? ' <kbd>'+t.shortcut+'</kbd>' : '');
            btn.appendChild(tip);
            btn.addEventListener('click', function(ev){
                ev.stopPropagation();
                toggleMindmapPanel();
            });
        } else {
            var tip = document.createElement('span');
            tip.className = 'wf-tool-tip';
            tip.innerHTML = t.label + (t.shortcut ? ' <kbd>'+t.shortcut+'</kbd>' : '');
            btn.appendChild(tip);
            btn.addEventListener('click', function(){
                setTool(t.id);
            });
        }
        toolbar.appendChild(btn);
    });

    // ── 툴바 하단 목록으로 버튼 ──
    var tbSpacer = document.createElement('div');
    tbSpacer.className = 'wf-toolbar-spacer';
    toolbar.appendChild(tbSpacer);

    var backBtn = document.createElement('button');
    backBtn.className = 'wf-tool-btn wf-tool-back';
    backBtn.type = 'button';
    backBtn.title = '목록으로';
    backBtn.innerHTML = '<span class="wf-tool-icon"><img src="/static/image/svg/workflow/free-icon-font-layout-fluid.svg" alt="목록" draggable="false"></span>'
        + '<span class="wf-tool-tip">목록으로</span>';
    backBtn.addEventListener('click', function(){ blsSpaNavigate('/p/wf_designer_manage'); });
    toolbar.appendChild(backBtn);

    // ── 도형 카테고리 패널 (툴바 외부, editor-body 안) ──
    var _shapesPanelOpen = false;
    var _shapesPanel = document.createElement('div');
    _shapesPanel.className = 'wf-shapes-panel';
    (function buildShapesPanel(){
        var html = '<div class="wf-shapes-panel-header"><span>도형</span>'
            + '<button class="wf-shapes-panel-close" type="button">&#x2715;</button></div>';
        html += '<div class="wf-shapes-panel-body">';
        var lastGroup = '';
        SHAPE_CATEGORIES.forEach(function(cat){
            // 그룹 헤더 삽입
            if(cat.group && cat.group !== lastGroup){
                html += '<div class="wf-shapes-group-hdr">' + cat.group + '</div>';
                lastGroup = cat.group;
            } else if(!cat.group && lastGroup){
                lastGroup = '';
            }
            html += '<div class="wf-shapes-cat collapsed" data-cat="'+cat.id+'">';
            html += '<div class="wf-shapes-cat-header">'+cat.label+'</div>';
            html += '<div class="wf-shapes-cat-grid">';
            cat.items.forEach(function(item){
                if(item.imgSrc){
                    html += '<button class="wf-shapes-item" data-stype="'+item.type+'" title="'+item.label+'">'
                        + '<img src="'+item.imgSrc+'" width="28" height="28" draggable="false">'
                        + '</button>';
                } else {
                    html += '<button class="wf-shapes-item" data-stype="'+item.type+'" title="'+item.label+'">'
                        + '<svg width="28" height="28" viewBox="'+(item.vb||'0 0 100 100')+'">'+item.svg+'</svg>'
                        + '</button>';
                }
            });
            html += '</div></div>';
        });
        html += '</div>';
        _shapesPanel.innerHTML = html;
    })();
    document.querySelector('.wf-editor-body').appendChild(_shapesPanel);

    // 카테고리 접기/펴기
    _shapesPanel.addEventListener('click', function(ev){
        ev.stopPropagation();
        var hdr = ev.target.closest('.wf-shapes-cat-header');
        if(hdr){
            hdr.parentElement.classList.toggle('collapsed');
            return;
        }
        var closeBtn = ev.target.closest('.wf-shapes-panel-close');
        if(closeBtn){
            closeShapesPanel();
            return;
        }
        var item = ev.target.closest('[data-stype]');
        if(item){
            setTool(item.getAttribute('data-stype'));
        }
    });
    _shapesPanel.addEventListener('mousedown', function(ev){ ev.stopPropagation(); });

    function toggleShapesPanel(){
        _shapesPanelOpen ? closeShapesPanel() : openShapesPanel();
    }
    function openShapesPanel(){
        _shapesPanelOpen = true;
        _shapesPanel.classList.add('open');
        closeLinesPanel();
        closeMindmapPanel();
    }
    function closeShapesPanel(){
        _shapesPanelOpen = false;
        _shapesPanel.classList.remove('open');
    }

    // ── 라인 유형 패널 (툴바 외부, editor-body 안) ──
    var _linesPanelOpen = false;
    var _linesPanel = document.createElement('div');
    _linesPanel.className = 'wf-lines-panel';
    (function buildLinesPanel(){
        var html = '<div class="wf-shapes-panel-header"><span>라인</span>'
            + '<button class="wf-shapes-panel-close" type="button">&#x2715;</button></div>';
        html += '<div class="wf-lines-panel-body">';
        LINE_TYPES.forEach(function(lt){
            html += '<button class="wf-lines-item'+(lt.id === _pendingLineStyle ? ' active' : '')+'" data-ltype="'+lt.id+'" title="'+lt.label+'">'
                + '<svg width="44" height="44" viewBox="0 0 44 44">'
                + '<defs><marker id="lt-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="#334155"/></marker></defs>'
                + lt.svg + '</svg></button>';
        });
        html += '</div>';
        _linesPanel.innerHTML = html;
    })();
    document.querySelector('.wf-editor-body').appendChild(_linesPanel);

    _linesPanel.addEventListener('click', function(ev){
        ev.stopPropagation();
        var closeBtn = ev.target.closest('.wf-shapes-panel-close');
        if(closeBtn){ closeLinesPanel(); return; }
        var item = ev.target.closest('[data-ltype]');
        if(item){
            _pendingLineStyle = item.getAttribute('data-ltype');
            // 활성 상태 갱신
            var all = _linesPanel.querySelectorAll('.wf-lines-item');
            for(var i=0;i<all.length;i++) all[i].classList.toggle('active', all[i].getAttribute('data-ltype')===_pendingLineStyle);
            setTool('connect');
            closeLinesPanel();
        }
    });
    _linesPanel.addEventListener('mousedown', function(ev){ ev.stopPropagation(); });

    function toggleLinesPanel(){
        _linesPanelOpen ? closeLinesPanel() : openLinesPanel();
    }
    function openLinesPanel(){
        _linesPanelOpen = true;
        _linesPanel.classList.add('open');
        closeShapesPanel();
        closeMindmapPanel();
    }
    function closeLinesPanel(){
        _linesPanelOpen = false;
        _linesPanel.classList.remove('open');
    }

    // ── 마인드맵 스타일 정의 ──
    var MINDMAP_STYLES = [
        {id:'mm_style_01', label:'클래식',
         theme:{main:'#5b5fc7',mainText:'#fff',mainRadius:22, branch:'#ffffff',branchBorder:'#5b5fc7',branchText:'#1e293b',branchRadius:8, line:'#5b5fc7',lineWidth:2,lineStyle:'curve'}},
        {id:'mm_style_02', label:'블루',
         theme:{main:'#2563eb',mainText:'#fff',mainRadius:22, branch:'#eff6ff',branchBorder:'#2563eb',branchText:'#1e3a5f',branchRadius:8, line:'#2563eb',lineWidth:2,lineStyle:'curve'}},
        {id:'mm_style_03', label:'그린',
         theme:{main:'#059669',mainText:'#fff',mainRadius:22, branch:'#ecfdf5',branchBorder:'#059669',branchText:'#064e3b',branchRadius:8, line:'#059669',lineWidth:2,lineStyle:'curve'}},
        {id:'mm_style_04', label:'오렌지',
         theme:{main:'#ea580c',mainText:'#fff',mainRadius:22, branch:'#fff7ed',branchBorder:'#ea580c',branchText:'#7c2d12',branchRadius:8, line:'#ea580c',lineWidth:2,lineStyle:'curve'}},
        {id:'mm_style_05', label:'퍼플',
         theme:{main:'#7c3aed',mainText:'#fff',mainRadius:22, branch:'#f5f3ff',branchBorder:'#7c3aed',branchText:'#4c1d95',branchRadius:8, line:'#7c3aed',lineWidth:2,lineStyle:'curve'}},
        {id:'mm_style_06', label:'핑크',
         theme:{main:'#db2777',mainText:'#fff',mainRadius:22, branch:'#fdf2f8',branchBorder:'#db2777',branchText:'#831843',branchRadius:8, line:'#db2777',lineWidth:2,lineStyle:'curve'}},
        {id:'mm_style_07', label:'다크',
         theme:{main:'#1e293b',mainText:'#fff',mainRadius:22, branch:'#f8fafc',branchBorder:'#334155',branchText:'#1e293b',branchRadius:8, line:'#475569',lineWidth:2,lineStyle:'curve'}},
        {id:'mm_style_08', label:'사각형',
         theme:{main:'#5b5fc7',mainText:'#fff',mainRadius:6, branch:'#ffffff',branchBorder:'#5b5fc7',branchText:'#1e293b',branchRadius:4, line:'#5b5fc7',lineWidth:2,lineStyle:'straight'}},
        {id:'mm_style_09', label:'골드',
         theme:{main:'#b45309',mainText:'#fff',mainRadius:22, branch:'#fffbeb',branchBorder:'#f59e0b',branchText:'#78350f',branchRadius:16, line:'#fbbf24',lineWidth:3,lineStyle:'curve'}},
        {id:'mm_style_10', label:'민트',
         theme:{main:'#0d9488',mainText:'#fff',mainRadius:22, branch:'#f0fdfa',branchBorder:'#0d9488',branchText:'#134e4a',branchRadius:8, line:'#14b8a6',lineWidth:2,lineStyle:'curve'}},
        {id:'mm_style_11', label:'레드',
         theme:{main:'#dc2626',mainText:'#fff',mainRadius:22, branch:'#fef2f2',branchBorder:'#dc2626',branchText:'#991b1b',branchRadius:8, line:'#ef4444',lineWidth:2,lineStyle:'curve'}},
        {id:'mm_style_12', label:'조직도',
         theme:{main:'#4f46e5',mainText:'#fff',mainRadius:8, branch:'#eef2ff',branchBorder:'#4f46e5',branchText:'#312e81',branchRadius:6, line:'#6366f1',lineWidth:2,lineStyle:'straight'}},
    ];

    function mmPreviewSvg(style){
        var t = style.theme;
        var mr = Math.min(t.mainRadius, 12);
        var br = Math.min(t.branchRadius, 6);
        var sbr = Math.min(br, 3);
        var svg = '<svg viewBox="0 0 200 110">';
        if(t.lineStyle === 'straight'){
            svg += '<line x1="60" y1="55" x2="95" y2="20" stroke="'+t.line+'" stroke-width="'+t.lineWidth+'"/>';
            svg += '<line x1="60" y1="55" x2="95" y2="55" stroke="'+t.line+'" stroke-width="'+t.lineWidth+'"/>';
            svg += '<line x1="60" y1="55" x2="95" y2="88" stroke="'+t.line+'" stroke-width="'+t.lineWidth+'"/>';
            svg += '<line x1="145" y1="88" x2="162" y2="80" stroke="'+t.line+'" stroke-width="1.5"/>';
            svg += '<line x1="145" y1="88" x2="162" y2="96" stroke="'+t.line+'" stroke-width="1.5"/>';
        } else {
            svg += '<path d="M60 55 C78 55 78 20 95 20" fill="none" stroke="'+t.line+'" stroke-width="'+t.lineWidth+'"/>';
            svg += '<path d="M60 55 C78 55 78 55 95 55" fill="none" stroke="'+t.line+'" stroke-width="'+t.lineWidth+'"/>';
            svg += '<path d="M60 55 C78 55 78 88 95 88" fill="none" stroke="'+t.line+'" stroke-width="'+t.lineWidth+'"/>';
            svg += '<path d="M145 88 C153 88 153 80 162 80" fill="none" stroke="'+t.line+'" stroke-width="1.5"/>';
            svg += '<path d="M145 88 C153 88 153 96 162 96" fill="none" stroke="'+t.line+'" stroke-width="1.5"/>';
        }
        svg += '<rect x="10" y="40" width="50" height="30" rx="'+mr+'" fill="'+t.main+'"/>';
        svg += '<text x="35" y="59" text-anchor="middle" font-size="7" fill="'+t.mainText+'" font-family="sans-serif">메인</text>';
        svg += '<rect x="95" y="10" width="50" height="20" rx="'+br+'" fill="'+t.branch+'" stroke="'+t.branchBorder+'" stroke-width="1"/>';
        svg += '<rect x="95" y="45" width="50" height="20" rx="'+br+'" fill="'+t.branch+'" stroke="'+t.branchBorder+'" stroke-width="1"/>';
        svg += '<rect x="95" y="78" width="50" height="20" rx="'+br+'" fill="'+t.branch+'" stroke="'+t.branchBorder+'" stroke-width="1"/>';
        svg += '<rect x="162" y="73" width="32" height="14" rx="'+sbr+'" fill="'+t.branch+'" stroke="'+t.branchBorder+'" stroke-width="0.8"/>';
        svg += '<rect x="162" y="89" width="32" height="14" rx="'+sbr+'" fill="'+t.branch+'" stroke="'+t.branchBorder+'" stroke-width="0.8"/>';
        svg += '</svg>';
        return svg;
    }

    // ── 마인드맵 레이아웃 종류 ──
    var MINDMAP_LAYOUTS = [
        {id:'horizontal', label:'마인드맵'},
        {id:'vertical',   label:'트리맵'},
        {id:'orgchart',   label:'조직도'},
        {id:'fishbone',   label:'피쉬본'},
        {id:'h_timeline', label:'가로 타임라인'},
        {id:'v_timeline', label:'세로 타임라인'}
    ];

    function mmLayoutPreviewSvg(layoutId){
        var svg = '<svg viewBox="0 0 120 80">';
        var c = '#6366f1', c2 = '#a5b4fc', bg = '#eef2ff';
        if(layoutId === 'horizontal'){
            svg += '<rect x="4" y="28" width="28" height="18" rx="9" fill="'+c+'"/>';
            svg += '<path d="M32 37 C42 37 42 16 52 16" fill="none" stroke="'+c2+'" stroke-width="1.5"/>';
            svg += '<path d="M32 37 C42 37 42 37 52 37" fill="none" stroke="'+c2+'" stroke-width="1.5"/>';
            svg += '<path d="M32 37 C42 37 42 58 52 58" fill="none" stroke="'+c2+'" stroke-width="1.5"/>';
            svg += '<rect x="52" y="8" width="26" height="14" rx="4" fill="'+bg+'" stroke="'+c2+'" stroke-width="1"/>';
            svg += '<rect x="52" y="30" width="26" height="14" rx="4" fill="'+bg+'" stroke="'+c2+'" stroke-width="1"/>';
            svg += '<rect x="52" y="52" width="26" height="14" rx="4" fill="'+bg+'" stroke="'+c2+'" stroke-width="1"/>';
            svg += '<path d="M78 59 C85 59 85 53 92 53" fill="none" stroke="'+c2+'" stroke-width="1"/>';
            svg += '<path d="M78 59 C85 59 85 65 92 65" fill="none" stroke="'+c2+'" stroke-width="1"/>';
            svg += '<rect x="92" y="48" width="22" height="10" rx="3" fill="'+bg+'" stroke="'+c2+'" stroke-width="0.7"/>';
            svg += '<rect x="92" y="60" width="22" height="10" rx="3" fill="'+bg+'" stroke="'+c2+'" stroke-width="0.7"/>';
        } else if(layoutId === 'vertical'){
            svg += '<rect x="38" y="4" width="36" height="16" rx="8" fill="'+c+'"/>';
            svg += '<path d="M56 20 C56 28 28 28 28 36" fill="none" stroke="'+c2+'" stroke-width="1.5"/>';
            svg += '<path d="M56 20 C56 28 56 28 56 36" fill="none" stroke="'+c2+'" stroke-width="1.5"/>';
            svg += '<path d="M56 20 C56 28 84 28 84 36" fill="none" stroke="'+c2+'" stroke-width="1.5"/>';
            svg += '<rect x="14" y="36" width="28" height="14" rx="4" fill="'+bg+'" stroke="'+c2+'" stroke-width="1"/>';
            svg += '<rect x="42" y="36" width="28" height="14" rx="4" fill="'+bg+'" stroke="'+c2+'" stroke-width="1"/>';
            svg += '<rect x="70" y="36" width="28" height="14" rx="4" fill="'+bg+'" stroke="'+c2+'" stroke-width="1"/>';
            svg += '<line x1="28" y1="50" x2="28" y2="58" stroke="'+c2+'" stroke-width="1"/>';
            svg += '<rect x="16" y="58" width="24" height="10" rx="3" fill="'+bg+'" stroke="'+c2+'" stroke-width="0.7"/>';
            svg += '<line x1="28" y1="68" x2="28" y2="72" stroke="'+c2+'" stroke-width="0.7"/>';
            svg += '<rect x="16" y="72" width="24" height="8" rx="2" fill="'+bg+'" stroke="'+c2+'" stroke-width="0.5"/>';
        } else if(layoutId === 'orgchart'){
            svg += '<rect x="38" y="4" width="36" height="16" rx="4" fill="'+c+'"/>';
            svg += '<line x1="56" y1="20" x2="56" y2="28" stroke="'+c2+'" stroke-width="1.5"/>';
            svg += '<line x1="20" y1="28" x2="92" y2="28" stroke="'+c2+'" stroke-width="1.5"/>';
            svg += '<line x1="20" y1="28" x2="20" y2="34" stroke="'+c2+'" stroke-width="1.5"/>';
            svg += '<line x1="56" y1="28" x2="56" y2="34" stroke="'+c2+'" stroke-width="1.5"/>';
            svg += '<line x1="92" y1="28" x2="92" y2="34" stroke="'+c2+'" stroke-width="1.5"/>';
            svg += '<rect x="6" y="34" width="28" height="14" rx="3" fill="'+bg+'" stroke="'+c2+'" stroke-width="1"/>';
            svg += '<rect x="42" y="34" width="28" height="14" rx="3" fill="'+bg+'" stroke="'+c2+'" stroke-width="1"/>';
            svg += '<rect x="78" y="34" width="28" height="14" rx="3" fill="'+bg+'" stroke="'+c2+'" stroke-width="1"/>';
            svg += '<line x1="20" y1="48" x2="20" y2="54" stroke="'+c2+'" stroke-width="1"/>';
            svg += '<line x1="12" y1="54" x2="28" y2="54" stroke="'+c2+'" stroke-width="1"/>';
            svg += '<line x1="12" y1="54" x2="12" y2="58" stroke="'+c2+'" stroke-width="1"/>';
            svg += '<line x1="28" y1="54" x2="28" y2="58" stroke="'+c2+'" stroke-width="1"/>';
            svg += '<rect x="2" y="58" width="20" height="10" rx="2" fill="'+bg+'" stroke="'+c2+'" stroke-width="0.7"/>';
            svg += '<rect x="18" y="58" width="20" height="10" rx="2" fill="'+bg+'" stroke="'+c2+'" stroke-width="0.7"/>';
        } else if(layoutId === 'fishbone'){
            svg += '<line x1="8" y1="40" x2="100" y2="40" stroke="'+c+'" stroke-width="2"/>';
            svg += '<polygon points="100,40 108,36 108,44" fill="'+c+'"/>';
            svg += '<line x1="28" y1="40" x2="42" y2="14" stroke="'+c2+'" stroke-width="1.5"/>';
            svg += '<line x1="52" y1="40" x2="38" y2="66" stroke="'+c2+'" stroke-width="1.5"/>';
            svg += '<line x1="72" y1="40" x2="86" y2="14" stroke="'+c2+'" stroke-width="1.5"/>';
            svg += '<rect x="32" y="6" width="24" height="12" rx="3" fill="'+bg+'" stroke="'+c2+'" stroke-width="1"/>';
            svg += '<rect x="26" y="60" width="24" height="12" rx="3" fill="'+bg+'" stroke="'+c2+'" stroke-width="1"/>';
            svg += '<rect x="76" y="6" width="24" height="12" rx="3" fill="'+bg+'" stroke="'+c2+'" stroke-width="1"/>';
            svg += '<line x1="44" y1="12" x2="56" y2="8" stroke="'+c2+'" stroke-width="0.7"/>';
            svg += '<rect x="56" y="3" width="16" height="8" rx="2" fill="'+bg+'" stroke="'+c2+'" stroke-width="0.5"/>';
        } else if(layoutId === 'h_timeline'){
            svg += '<line x1="8" y1="40" x2="112" y2="40" stroke="'+c+'" stroke-width="2"/>';
            svg += '<circle cx="24" cy="40" r="3" fill="'+c+'"/>';
            svg += '<circle cx="56" cy="40" r="3" fill="'+c+'"/>';
            svg += '<circle cx="88" cy="40" r="3" fill="'+c+'"/>';
            svg += '<line x1="24" y1="37" x2="24" y2="22" stroke="'+c2+'" stroke-width="1"/>';
            svg += '<line x1="56" y1="37" x2="56" y2="22" stroke="'+c2+'" stroke-width="1"/>';
            svg += '<line x1="88" y1="37" x2="88" y2="22" stroke="'+c2+'" stroke-width="1"/>';
            svg += '<rect x="10" y="8" width="28" height="14" rx="4" fill="'+bg+'" stroke="'+c2+'" stroke-width="1"/>';
            svg += '<rect x="42" y="8" width="28" height="14" rx="4" fill="'+bg+'" stroke="'+c2+'" stroke-width="1"/>';
            svg += '<rect x="74" y="8" width="28" height="14" rx="4" fill="'+bg+'" stroke="'+c2+'" stroke-width="1"/>';
            svg += '<rect x="14" y="48" width="22" height="8" rx="2" fill="'+bg+'" stroke="'+c2+'" stroke-width="0.5"/>';
            svg += '<rect x="46" y="48" width="22" height="8" rx="2" fill="'+bg+'" stroke="'+c2+'" stroke-width="0.5"/>';
        } else if(layoutId === 'v_timeline'){
            svg += '<line x1="36" y1="6" x2="36" y2="74" stroke="'+c+'" stroke-width="2"/>';
            svg += '<circle cx="36" cy="16" r="3" fill="'+c+'"/>';
            svg += '<circle cx="36" cy="40" r="3" fill="'+c+'"/>';
            svg += '<circle cx="36" cy="64" r="3" fill="'+c+'"/>';
            svg += '<line x1="39" y1="16" x2="52" y2="16" stroke="'+c2+'" stroke-width="1"/>';
            svg += '<line x1="33" y1="40" x2="20" y2="40" stroke="'+c2+'" stroke-width="1"/>';
            svg += '<line x1="39" y1="64" x2="52" y2="64" stroke="'+c2+'" stroke-width="1"/>';
            svg += '<rect x="52" y="8" width="28" height="14" rx="4" fill="'+bg+'" stroke="'+c2+'" stroke-width="1"/>';
            svg += '<rect x="52" y="56" width="28" height="14" rx="4" fill="'+bg+'" stroke="'+c2+'" stroke-width="1"/>';
            svg += '<rect x="-4" y="32" width="28" height="14" rx="4" fill="'+bg+'" stroke="'+c2+'" stroke-width="1"/>';
            svg += '<rect x="82" y="10" width="20" height="8" rx="2" fill="'+bg+'" stroke="'+c2+'" stroke-width="0.5"/>';
        }
        svg += '</svg>';
        return svg;
    }

    // ── 마인드맵 패널 ──
    var _mindmapPanelOpen = false;
    var _mindmapPanel = document.createElement('div');
    _mindmapPanel.className = 'wf-mindmap-panel';
    (function buildMindmapPanel(){
        var html = '<div class="wf-shapes-panel-header"><span>마인드맵</span>'
            + '<button class="wf-shapes-panel-close" type="button">&#x2715;</button></div>';
        html += '<div class="wf-shapes-panel-body">';
        // 레이아웃 섹션
        html += '<div class="wf-mm-section-label">레이아웃</div>';
        html += '<div class="wf-mm-layout-grid">';
        MINDMAP_LAYOUTS.forEach(function(lay){
            html += '<button class="wf-mm-layout-item" data-mmlayout="'+lay.id+'" title="'+lay.label+'">'
                + mmLayoutPreviewSvg(lay.id) + '<span>'+lay.label+'</span></button>';
        });
        html += '</div>';
        // 스타일 섹션
        html += '<div class="wf-mm-section-label" style="margin-top:6px">스타일</div>';
        html += '<div class="wf-mm-style-grid">';
        MINDMAP_STYLES.forEach(function(style){
            html += '<button class="wf-mm-style-item" data-mmstyle="'+style.id+'" title="'+style.label+'">'
                + mmPreviewSvg(style) + '</button>';
        });
        html += '</div></div>';
        _mindmapPanel.innerHTML = html;
    })();
    document.querySelector('.wf-editor-body').appendChild(_mindmapPanel);

    _mindmapPanel.addEventListener('click', function(ev){
        ev.stopPropagation();
        var closeBtn = ev.target.closest('.wf-shapes-panel-close');
        if(closeBtn){ closeMindmapPanel(); return; }
        // 레이아웃 클릭
        var layItem = ev.target.closest('[data-mmlayout]');
        if(layItem){
            var newLayout = layItem.getAttribute('data-mmlayout');
            _pendingMmLayout = newLayout;
            // 선택된 마인드맵이 있으면 레이아웃 변경
            if(selectedNode && selectedNode.type === 'mindmap'){
                pushUndo();
                selectedNode.data.mmLayout = newLayout;
                rerenderMindmap(selectedNode);
            }
            setTool('mindmap');
            closeMindmapPanel();
            return;
        }
        // 스타일 클릭
        var styleItem = ev.target.closest('[data-mmstyle]');
        if(styleItem){
            var newStyle = styleItem.getAttribute('data-mmstyle');
            _pendingMmStyle = newStyle;
            // 선택된 마인드맵이 있으면 스타일 변경
            if(selectedNode && selectedNode.type === 'mindmap'){
                pushUndo();
                selectedNode.data.mmStyle = newStyle;
                rerenderMindmap(selectedNode);
            }
            setTool('mindmap');
            closeMindmapPanel();
        }
    });
    _mindmapPanel.addEventListener('mousedown', function(ev){ ev.stopPropagation(); });

    function toggleMindmapPanel(){
        _mindmapPanelOpen ? closeMindmapPanel() : openMindmapPanel();
    }
    function openMindmapPanel(){
        _mindmapPanelOpen = true;
        _mindmapPanel.classList.add('open');
        closeShapesPanel();
    }
    function closeMindmapPanel(){
        _mindmapPanelOpen = false;
        _mindmapPanel.classList.remove('open');
    }

    // ── 마인드맵 레이아웃 ──
    function mmGetLevel(tree, id, lv){
        if(tree.id === id) return lv;
        if(tree.children){
            for(var i=0; i<tree.children.length; i++){
                var f = mmGetLevel(tree.children[i], id, lv+1);
                if(f >= 0) return f;
            }
        }
        return -1;
    }
    function mmFindParent(tree, id){
        if(tree.children){
            for(var i=0; i<tree.children.length; i++){
                if(tree.children[i].id === id) return tree;
                var f = mmFindParent(tree.children[i], id);
                if(f) return f;
            }
        }
        return null;
    }

    function mmLayoutTree(tree){
        var GAP_V = 10, PAD = 20;
        var NODE_H = [44, 34, 30];
        var MIN_W  = [120, 100, 80];
        var CHAR_W = [8.5, 8, 7.5];
        var PAD_X  = [24, 18, 14];
        var GAP_H_LV = [55, 45, 40];
        function tier(lv){ return Math.min(lv, 2); }
        function textW(text, lv){
            var t = tier(lv);
            return Math.max(MIN_W[t], (text||'').length * CHAR_W[t] + PAD_X[t] * 2);
        }
        function measure(nd, lv){
            var t = tier(lv);
            nd._w = textW(nd.text, lv);
            nd._h = NODE_H[t];
            nd._lv = lv;
            if(!nd.children || nd.children.length === 0){
                nd._totalH = nd._h;
            } else {
                var total = 0;
                nd.children.forEach(function(c, i){ measure(c, lv+1); total += c._totalH; if(i > 0) total += GAP_V; });
                nd._totalH = Math.max(nd._h, total);
            }
        }
        function pos(nd, lv, x, yc, items, conns){
            items.push({id:nd.id, text:nd.text, level:lv, x:x, y:yc - nd._h/2, w:nd._w, h:nd._h});
            if(nd.children && nd.children.length > 0){
                var t = tier(lv);
                var cx = x + nd._w + GAP_H_LV[t];
                var tH = 0; nd.children.forEach(function(c, i){ tH += c._totalH; if(i > 0) tH += GAP_V; });
                var sy = yc - tH/2;
                nd.children.forEach(function(c){
                    var cy = sy + c._totalH/2;
                    conns.push({from:nd.id, to:c.id});
                    pos(c, lv+1, cx, cy, items, conns);
                    sy += c._totalH + GAP_V;
                });
            }
        }
        measure(tree, 0);
        var items = [], conns = [];
        pos(tree, 0, PAD, tree._totalH/2 + PAD, items, conns);
        return {items:items, connections:conns};
    }

    // ── 세로 트리맵 레이아웃 (top-down) ──
    function mmLayoutVertical(tree){
        var GAP_H = 14, PAD = 20;
        var NODE_H = [44, 34, 30];
        var MIN_W  = [120, 100, 80];
        var CHAR_W = [8.5, 8, 7.5];
        var PAD_X  = [24, 18, 14];
        var GAP_V_LV = [50, 40, 34];
        function tier(lv){ return Math.min(lv, 2); }
        function textW(text, lv){
            var t = tier(lv);
            return Math.max(MIN_W[t], (text||'').length * CHAR_W[t] + PAD_X[t] * 2);
        }
        function measure(nd, lv){
            var t = tier(lv);
            nd._w = textW(nd.text, lv);
            nd._h = NODE_H[t];
            nd._lv = lv;
            if(!nd.children || nd.children.length === 0){
                nd._totalW = nd._w;
            } else {
                var total = 0;
                nd.children.forEach(function(c, i){ measure(c, lv+1); total += c._totalW; if(i > 0) total += GAP_H; });
                nd._totalW = Math.max(nd._w, total);
            }
        }
        function pos(nd, lv, xc, y, items, conns){
            items.push({id:nd.id, text:nd.text, level:lv, x:xc - nd._w/2, y:y, w:nd._w, h:nd._h});
            if(nd.children && nd.children.length > 0){
                var t = tier(lv);
                var cy = y + nd._h + GAP_V_LV[t];
                var tW = 0; nd.children.forEach(function(c, i){ tW += c._totalW; if(i > 0) tW += GAP_H; });
                var sx = xc - tW/2;
                nd.children.forEach(function(c){
                    var cx = sx + c._totalW/2;
                    conns.push({from:nd.id, to:c.id});
                    pos(c, lv+1, cx, cy, items, conns);
                    sx += c._totalW + GAP_H;
                });
            }
        }
        measure(tree, 0);
        var items = [], conns = [];
        pos(tree, 0, tree._totalW/2 + PAD, PAD, items, conns);
        return {items:items, connections:conns};
    }

    // ── 조직도 레이아웃 (top-down, right-angle connectors) ──
    function mmLayoutOrgChart(tree){
        var GAP_H = 18, PAD = 20;
        var NODE_H = [44, 34, 30];
        var MIN_W  = [120, 100, 80];
        var CHAR_W = [8.5, 8, 7.5];
        var PAD_X  = [24, 18, 14];
        var GAP_V_LV = [55, 45, 38];
        function tier(lv){ return Math.min(lv, 2); }
        function textW(text, lv){
            var t = tier(lv);
            return Math.max(MIN_W[t], (text||'').length * CHAR_W[t] + PAD_X[t] * 2);
        }
        function measure(nd, lv){
            var t = tier(lv);
            nd._w = textW(nd.text, lv);
            nd._h = NODE_H[t];
            nd._lv = lv;
            if(!nd.children || nd.children.length === 0){
                nd._totalW = nd._w;
            } else {
                var total = 0;
                nd.children.forEach(function(c, i){ measure(c, lv+1); total += c._totalW; if(i > 0) total += GAP_H; });
                nd._totalW = Math.max(nd._w, total);
            }
        }
        function pos(nd, lv, xc, y, items, conns){
            items.push({id:nd.id, text:nd.text, level:lv, x:xc - nd._w/2, y:y, w:nd._w, h:nd._h});
            if(nd.children && nd.children.length > 0){
                var t = tier(lv);
                var cy = y + nd._h + GAP_V_LV[t];
                var tW = 0; nd.children.forEach(function(c, i){ tW += c._totalW; if(i > 0) tW += GAP_H; });
                var sx = xc - tW/2;
                nd.children.forEach(function(c){
                    var cx = sx + c._totalW/2;
                    conns.push({from:nd.id, to:c.id});
                    pos(c, lv+1, cx, cy, items, conns);
                    sx += c._totalW + GAP_H;
                });
            }
        }
        measure(tree, 0);
        var items = [], conns = [];
        pos(tree, 0, tree._totalW/2 + PAD, PAD, items, conns);
        return {items:items, connections:conns};
    }

    // ── 피쉬본 레이아웃 (Ishikawa diagram) ──
    function mmLayoutFishbone(tree){
        var PAD = 30;
        var NODE_H = [44, 34, 30];
        var MIN_W  = [120, 100, 80];
        var CHAR_W = [8.5, 8, 7.5];
        var PAD_X  = [24, 18, 14];
        var BRANCH_GAP = 140;
        var BONE_ANGLE = 55;
        var SUB_GAP_V = 6;
        function textW(text, lv){
            var t = Math.min(lv, 2);
            return Math.max(MIN_W[t], (text||'').length * CHAR_W[t] + PAD_X[t] * 2);
        }
        var items = [], conns = [];
        var branches = tree.children || [];
        var spineLen = PAD + branches.length * BRANCH_GAP + 60;
        var spineY = 200;
        // 메인 주제 (오른쪽 끝)
        var rootW = textW(tree.text, 0);
        items.push({id:tree.id, text:tree.text, level:0, x:spineLen, y:spineY - NODE_H[0]/2, w:rootW, h:NODE_H[0]});
        // 브랜치: 교대로 위/아래
        branches.forEach(function(br, idx){
            var bx = PAD + (idx + 0.5) * BRANCH_GAP;
            var above = (idx % 2 === 0);
            var bw = textW(br.text, 1);
            var dy = 80;
            var by = above ? spineY - dy - NODE_H[1] : spineY + dy;
            items.push({id:br.id, text:br.text, level:1, x:bx - bw/2, y:by, w:bw, h:NODE_H[1]});
            conns.push({from:tree.id, to:br.id, _spineX:bx, _spineY:spineY, _above:above});
            // 서브 주제
            if(br.children && br.children.length > 0){
                br.children.forEach(function(sub, si){
                    var sw = textW(sub.text, 2);
                    var sy = above ? by - (si + 1) * (NODE_H[2] + SUB_GAP_V) : by + NODE_H[1] + (si) * (NODE_H[2] + SUB_GAP_V);
                    items.push({id:sub.id, text:sub.text, level:2, x:bx - sw/2, y:sy, w:sw, h:NODE_H[2]});
                    conns.push({from:br.id, to:sub.id});
                });
            }
        });
        return {items:items, connections:conns, spine:{x1:PAD - 10, y1:spineY, x2:spineLen, y2:spineY}};
    }

    // ── 가로 타임라인 레이아웃 ──
    function mmLayoutHTimeline(tree){
        var PAD = 30;
        var NODE_H = [40, 34, 28];
        var MIN_W  = [100, 90, 70];
        var CHAR_W = [8.5, 8, 7.5];
        var PAD_X  = [24, 18, 14];
        var BRANCH_GAP = 160;
        var SUB_GAP_V = 4;
        function textW(text, lv){
            var t = Math.min(lv, 2);
            return Math.max(MIN_W[t], (text||'').length * CHAR_W[t] + PAD_X[t] * 2);
        }
        var items = [], conns = [];
        var branches = tree.children || [];
        var spineY = 160;
        var totalW = PAD + branches.length * BRANCH_GAP + PAD;
        // 메인 주제 (왼쪽 상단 타이틀)
        var rootW = textW(tree.text, 0);
        items.push({id:tree.id, text:tree.text, level:0, x:PAD, y:PAD, w:rootW, h:NODE_H[0]});
        // 브랜치 간격
        branches.forEach(function(br, idx){
            var bx = PAD + 40 + idx * BRANCH_GAP;
            var bw = textW(br.text, 1);
            var by = spineY - NODE_H[1] - 16;
            items.push({id:br.id, text:br.text, level:1, x:bx - bw/2, y:by, w:bw, h:NODE_H[1]});
            conns.push({from:tree.id, to:br.id, _timeX:bx, _timeY:spineY});
            // 서브 주제 (타임라인 아래)
            if(br.children && br.children.length > 0){
                br.children.forEach(function(sub, si){
                    var sw = textW(sub.text, 2);
                    var sy = spineY + 16 + si * (NODE_H[2] + SUB_GAP_V);
                    items.push({id:sub.id, text:sub.text, level:2, x:bx - sw/2, y:sy, w:sw, h:NODE_H[2]});
                    conns.push({from:br.id, to:sub.id, _timeX:bx, _timeY:spineY});
                });
            }
        });
        return {items:items, connections:conns, spine:{x1:PAD, y1:spineY, x2:totalW, y2:spineY, dots:branches.map(function(br,i){ return {x:PAD + 40 + i*BRANCH_GAP, y:spineY}; })}};
    }

    // ── 세로 타임라인 레이아웃 ──
    function mmLayoutVTimeline(tree){
        var PAD = 30;
        var NODE_H = [40, 34, 28];
        var MIN_W  = [100, 90, 70];
        var CHAR_W = [8.5, 8, 7.5];
        var PAD_X  = [24, 18, 14];
        var BRANCH_GAP = 100;
        var SUB_GAP_V = 4;
        function textW(text, lv){
            var t = Math.min(lv, 2);
            return Math.max(MIN_W[t], (text||'').length * CHAR_W[t] + PAD_X[t] * 2);
        }
        var items = [], conns = [];
        var branches = tree.children || [];
        var spineX = 250;
        var totalH = PAD + NODE_H[0] + 30 + branches.length * BRANCH_GAP + PAD;
        // 메인 주제 (상단 중앙)
        var rootW = textW(tree.text, 0);
        items.push({id:tree.id, text:tree.text, level:0, x:spineX - rootW/2, y:PAD, w:rootW, h:NODE_H[0]});
        // 브랜치: 좌우 교대
        branches.forEach(function(br, idx){
            var by = PAD + NODE_H[0] + 30 + idx * BRANCH_GAP;
            var bw = textW(br.text, 1);
            var goRight = (idx % 2 === 0);
            var bx = goRight ? spineX + 50 : spineX - 50 - bw;
            items.push({id:br.id, text:br.text, level:1, x:bx, y:by, w:bw, h:NODE_H[1]});
            conns.push({from:tree.id, to:br.id, _spineX:spineX, _spineY:by + NODE_H[1]/2, _goRight:goRight});
            // 서브 주제
            if(br.children && br.children.length > 0){
                br.children.forEach(function(sub, si){
                    var sw = textW(sub.text, 2);
                    var sx = goRight ? bx + bw + 10 : bx - sw - 10;
                    var sy = by + (si) * (NODE_H[2] + SUB_GAP_V);
                    items.push({id:sub.id, text:sub.text, level:2, x:sx, y:sy, w:sw, h:NODE_H[2]});
                    conns.push({from:br.id, to:sub.id});
                });
            }
        });
        return {items:items, connections:conns, spine:{x1:spineX, y1:PAD + NODE_H[0], x2:spineX, y2:totalH - PAD, dots:branches.map(function(br,i){ return {x:spineX, y:PAD + NODE_H[0] + 30 + i*BRANCH_GAP + NODE_H[1]/2}; })}};
    }

    // ── 레이아웃 디스패처 ──
    function mmLayoutDispatch(tree, layoutType){
        switch(layoutType){
            case 'vertical':   return mmLayoutVertical(tree);
            case 'orgchart':   return mmLayoutOrgChart(tree);
            case 'fishbone':   return mmLayoutFishbone(tree);
            case 'h_timeline': return mmLayoutHTimeline(tree);
            case 'v_timeline': return mmLayoutVTimeline(tree);
            default:           return mmLayoutTree(tree);
        }
    }

    // ── 색상 헬퍼 (per-node color) ──
    function _hexToRgb(hex){
        hex = hex.replace('#','');
        if(hex.length===3) hex=hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
        return {r:parseInt(hex.slice(0,2),16), g:parseInt(hex.slice(2,4),16), b:parseInt(hex.slice(4,6),16)};
    }
    function _lightenHex(hex, f){
        var c=_hexToRgb(hex);
        return '#'+[Math.round(c.r+(255-c.r)*f), Math.round(c.g+(255-c.g)*f), Math.round(c.b+(255-c.b)*f)]
            .map(function(v){ return ('0'+Math.min(255,v).toString(16)).slice(-2); }).join('');
    }
    function _darkenHex(hex, f){
        var c=_hexToRgb(hex);
        return '#'+[Math.round(c.r*(1-f)), Math.round(c.g*(1-f)), Math.round(c.b*(1-f))]
            .map(function(v){ return ('0'+Math.max(0,v).toString(16)).slice(-2); }).join('');
    }

    function buildMmContentHtml(node, layout, theme, layoutType){
        var html = '<svg class="wf-mm-connections">';
        var isVert = (layoutType==='vertical'||layoutType==='orgchart');
        var isFish = (layoutType==='fishbone');
        var isHTime = (layoutType==='h_timeline');
        var isVTime = (layoutType==='v_timeline');

        // 스파인/타임라인 배경 요소
        if(layout.spine){
            var sp = layout.spine;
            html += '<line x1="'+sp.x1+'" y1="'+sp.y1+'" x2="'+sp.x2+'" y2="'+sp.y2+'" stroke="'+theme.line+'" stroke-width="'+(theme.lineWidth+1)+'"/>';
            if(isFish){
                // 화살표 머리
                var ax=sp.x2, ay=sp.y2;
                html += '<polygon points="'+(ax)+','+(ay)+' '+(ax-10)+','+(ay-5)+' '+(ax-10)+','+(ay+5)+'" fill="'+theme.line+'"/>';
            }
            if(sp.dots){
                sp.dots.forEach(function(d){
                    html += '<circle cx="'+d.x+'" cy="'+d.y+'" r="5" fill="'+theme.main+'"/>';
                });
            }
        }

        // 연결선
        layout.connections.forEach(function(c){
            var fi = null, ti = null;
            for(var i=0; i<layout.items.length; i++){
                if(layout.items[i].id === c.from) fi = layout.items[i];
                if(layout.items[i].id === c.to) ti = layout.items[i];
            }
            if(!fi || !ti) return;

            if(layoutType==='orgchart'){
                // 조직도: 직각 커넥터
                var fx = fi.x+fi.w/2, fy = fi.y+fi.h;
                var tx = ti.x+ti.w/2, ty = ti.y;
                var midY = (fy+ty)/2;
                html += '<path d="M'+fx+' '+fy+' L'+fx+' '+midY+' L'+tx+' '+midY+' L'+tx+' '+ty+'" fill="none" stroke="'+theme.line+'" stroke-width="'+theme.lineWidth+'"/>';
            } else if(isVert){
                // 세로 트리: 위→아래 커브
                var fx2 = fi.x+fi.w/2, fy2 = fi.y+fi.h;
                var tx2 = ti.x+ti.w/2, ty2 = ti.y;
                var cpy = (fy2+ty2)/2;
                html += '<path d="M'+fx2+' '+fy2+' C'+fx2+' '+cpy+' '+tx2+' '+cpy+' '+tx2+' '+ty2+'" fill="none" stroke="'+theme.line+'" stroke-width="'+theme.lineWidth+'"/>';
            } else if(isFish && c._spineX !== undefined){
                // 피쉬본: 스파인→브랜치 사선
                html += '<line x1="'+c._spineX+'" y1="'+c._spineY+'" x2="'+(ti.x+ti.w/2)+'" y2="'+(c._above ? ti.y+ti.h : ti.y)+'" stroke="'+theme.line+'" stroke-width="'+theme.lineWidth+'"/>';
            } else if(isHTime && c._timeX !== undefined){
                // 가로 타임라인: 세로 연결
                var ttop = ti.y + ti.h;
                if(ti.level >= 2) ttop = ti.y;
                html += '<line x1="'+c._timeX+'" y1="'+c._timeY+'" x2="'+c._timeX+'" y2="'+ttop+'" stroke="'+theme.line+'" stroke-width="'+(ti.level>=2?1:theme.lineWidth)+'"/>';
            } else if(isVTime && c._spineX !== undefined){
                // 세로 타임라인: 가로 연결
                var ttx = c._goRight ? ti.x : ti.x+ti.w;
                html += '<line x1="'+c._spineX+'" y1="'+c._spineY+'" x2="'+ttx+'" y2="'+c._spineY+'" stroke="'+theme.line+'" stroke-width="'+theme.lineWidth+'"/>';
            } else {
                // 기본 (horizontal) 또는 서브 주제 연결
                var x1=fi.x+fi.w, y1=fi.y+fi.h/2, x2=ti.x, y2=ti.y+ti.h/2;
                if(isFish || isHTime || isVTime){
                    // 서브 주제는 단순 직선
                    html += '<line x1="'+(fi.x+fi.w/2)+'" y1="'+(fi.y+(fi.y<ti.y?fi.h:0))+'" x2="'+(ti.x+ti.w/2)+'" y2="'+(ti.y+(fi.y<ti.y?0:ti.h))+'" stroke="'+theme.line+'" stroke-width="1"/>';
                } else if(theme.lineStyle === 'straight'){
                    html += '<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="'+theme.line+'" stroke-width="'+theme.lineWidth+'"/>';
                } else {
                    var cpx = (x1+x2)/2;
                    html += '<path d="M'+x1+' '+y1+' C'+cpx+' '+y1+' '+cpx+' '+y2+' '+x2+' '+y2+'" fill="none" stroke="'+theme.line+'" stroke-width="'+theme.lineWidth+'"/>';
                }
            }
        });
        html += '</svg>';

        // 아이템 렌더링
        layout.items.forEach(function(item){
            var isRoot = item.level === 0;
            var isSub  = item.level >= 2;
            var cls = 'wf-mm-item' + (isRoot ? ' wf-mm-root' : (isSub ? ' wf-mm-sub' : ' wf-mm-branch'));
            if(_mmSelectedBranch && _mmSelectedBranch.nodeId === node.id && _mmSelectedBranch.branchId === item.id) cls += ' wf-mm-selected';
            var bg = isRoot ? theme.main : theme.branch;
            var color = isRoot ? theme.mainText : theme.branchText;
            var border = isRoot ? theme.main : theme.branchBorder;
            var radius = isRoot ? theme.mainRadius : theme.branchRadius;
            var fontSize = isRoot ? 14 : (isSub ? 12 : 13);

            // per-node color override
            var branch = mmFindBranch(node.data.mmTree, item.id);
            if(branch && branch.color){
                var nc = branch.color;
                if(isRoot){
                    bg = nc; border = nc; color = '#fff';
                } else {
                    bg = _lightenHex(nc, 0.85); border = nc; color = _darkenHex(nc, 0.3);
                }
            }

            html += '<div class="'+cls+'" data-mmid="'+item.id+'" style="left:'+item.x+'px;top:'+item.y+'px;width:'+item.w+'px;height:'+item.h+'px;background:'+bg+';color:'+color+';border:2px solid '+border+';border-radius:'+radius+'px;font-size:'+fontSize+'px;">'
                + '<span class="wf-mm-text">'+escTxt(item.text)+'</span></div>';

            // 버튼 위치 (레이아웃별)
            var childBtnX, childBtnY, sibBtnX, sibBtnY;
            if(isVert){
                childBtnX = item.x + item.w/2 - 10; childBtnY = item.y + item.h + 2;
                sibBtnX = item.x + item.w + 4; sibBtnY = item.y + item.h/2 - 10;
            } else {
                childBtnX = item.x + item.w + 4; childBtnY = item.y + item.h/2 - 10;
                sibBtnX = item.x + item.w/2 - 10; sibBtnY = item.y + item.h + 2;
            }
            html += '<button class="wf-mm-add-btn wf-mm-add-child" data-mmid="'+item.id+'" data-action="add-child" title="하위 추가 (Tab)" style="left:'+childBtnX+'px;top:'+childBtnY+'px;">+</button>';
            if(!isRoot){
                html += '<button class="wf-mm-add-btn wf-mm-add-sib" data-mmid="'+item.id+'" data-action="add-sibling" title="형제 추가 (Enter)" style="left:'+sibBtnX+'px;top:'+sibBtnY+'px;">+</button>';
                html += '<button class="wf-mm-del-btn" data-mmid="'+item.id+'" data-action="delete" title="삭제 (Del)" style="left:'+(item.x+item.w-6)+'px;top:'+(item.y-6)+'px;">&times;</button>';
            }
        });
        return html;
    }

    function rerenderMindmap(node){
        var el = document.getElementById('nd-'+node.id);
        if(!el) return;
        var contentEl = el.querySelector('.wf-mm-content');
        if(!contentEl) return;
        var style = MINDMAP_STYLES.find(function(s){ return s.id === node.data.mmStyle; }) || MINDMAP_STYLES[0];
        var layoutType = node.data.mmLayout || 'horizontal';
        var layout = mmLayoutDispatch(node.data.mmTree, layoutType);
        var maxX = 0, maxY = 0;
        layout.items.forEach(function(it){
            if(it.x + it.w + 50 > maxX) maxX = it.x + it.w + 50;
            if(it.y + it.h + 50 > maxY) maxY = it.y + it.h + 50;
        });
        node.size.w = Math.max(400, maxX);
        node.size.h = Math.max(200, maxY);
        el.style.width = node.size.w + 'px';
        el.style.height = node.size.h + 'px';
        contentEl.innerHTML = buildMmContentHtml(node, layout, style.theme, layoutType);
        var badge = el.querySelector('.wf-size-badge');
        if(badge) badge.textContent = Math.round(node.size.w) + ' x ' + Math.round(node.size.h);
    }

    function mmFindBranch(tree, id){
        if(tree.id === id) return tree;
        if(tree.children){
            for(var i=0; i<tree.children.length; i++){
                var f = mmFindBranch(tree.children[i], id);
                if(f) return f;
            }
        }
        return null;
    }

    function mmAddChild(node, parentId){
        var parent = mmFindBranch(node.data.mmTree, parentId);
        if(!parent) return;
        if(!parent.children) parent.children = [];
        var newId = 'mm_' + (++node.data._mmNextId);
        var parentLevel = mmGetLevel(node.data.mmTree, parentId, 0);
        var childText = parentLevel === 0 ? '브랜치 주제' : '서브 주제';
        parent.children.push({id:newId, text:childText, children:[]});
        rerenderMindmap(node);
    }

    function mmAddSibling(node, branchId){
        var parent = mmFindParent(node.data.mmTree, branchId);
        if(!parent) return;
        var newId = 'mm_' + (++node.data._mmNextId);
        var parentLevel = mmGetLevel(node.data.mmTree, parent.id, 0);
        var sibText = parentLevel === 0 ? '브랜치 주제' : '서브 주제';
        parent.children.push({id:newId, text:sibText, children:[]});
        rerenderMindmap(node);
    }

    function mmDeleteBranch(node, branchId){
        if(branchId === node.data.mmTree.id) return;
        function remove(p){
            if(!p.children) return false;
            for(var i=0; i<p.children.length; i++){
                if(p.children[i].id === branchId){ p.children.splice(i, 1); return true; }
                if(remove(p.children[i])) return true;
            }
            return false;
        }
        remove(node.data.mmTree);
        _mmSelectedBranch = null;
        rerenderMindmap(node);
    }

    function mmSelectBranch(node, branchId){
        _mmSelectedBranch = {nodeId:node.id, branchId:branchId};
        var el = document.getElementById('nd-'+node.id);
        if(el){
            var all = el.querySelectorAll('.wf-mm-item');
            for(var i=0; i<all.length; i++) all[i].classList.toggle('wf-mm-selected', all[i].getAttribute('data-mmid') === branchId);
            mmShowBtns(el, branchId);
        }
        _mmSelectFlag = true;
        selectNode(node);
        _mmSelectFlag = false;
    }

    function mmStartEdit(el, node, itemEl){
        var textEl = itemEl.querySelector('.wf-mm-text');
        if(!textEl) return;
        textEl.setAttribute('contenteditable', 'true');
        textEl.setAttribute('spellcheck', 'false');
        textEl.focus();
        var r = document.createRange(); r.selectNodeContents(textEl);
        var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
        function onDone(){
            textEl.removeEventListener('blur', onDone);
            textEl.setAttribute('contenteditable', 'false');
            var bid = itemEl.getAttribute('data-mmid');
            var branch = mmFindBranch(node.data.mmTree, bid);
            if(branch){
                branch.text = textEl.textContent || '';
                if(bid === node.data.mmTree.id) node.data.name = branch.text;
            }
            rerenderMindmap(node);
        }
        textEl.addEventListener('blur', onDone);
        textEl.addEventListener('keydown', function(ke){
            if(ke.key === 'Enter'){ ke.preventDefault(); textEl.blur(); }
            if(ke.key === 'Delete' || ke.key === 'Backspace') ke.stopPropagation();
            if(ke.key === 'Tab'){
                ke.preventDefault();
                var bid = itemEl.getAttribute('data-mmid');
                textEl.blur();
                mmAddChild(node, bid);
            }
        });
    }

    function mmShowBtns(el, mmid){
        var btns = el.querySelectorAll('.wf-mm-add-btn');
        for(var i=0;i<btns.length;i++){
            if(btns[i].getAttribute('data-mmid') === mmid) btns[i].classList.add('visible');
            else btns[i].classList.remove('visible');
        }
        var delBtns = el.querySelectorAll('.wf-mm-del-btn');
        for(var d=0;d<delBtns.length;d++){
            if(delBtns[d].getAttribute('data-mmid') === mmid) delBtns[d].classList.add('visible');
            else delBtns[d].classList.remove('visible');
        }
    }
    function mmHideBtns(el){
        var btns = el.querySelectorAll('.wf-mm-add-btn.visible');
        for(var i=0;i<btns.length;i++) btns[i].classList.remove('visible');
        var delBtns = el.querySelectorAll('.wf-mm-del-btn.visible');
        for(var d=0;d<delBtns.length;d++) delBtns[d].classList.remove('visible');
    }

    function mmBindEvents(el, node){
        // 호버 시 + 버튼 표시
        el.addEventListener('mouseover', function(ev){
            var item = ev.target.closest('.wf-mm-item');
            var btn = ev.target.closest('.wf-mm-add-btn') || ev.target.closest('.wf-mm-del-btn');
            if(item){
                mmShowBtns(el, item.getAttribute('data-mmid'));
            } else if(btn){
                btn.classList.add('visible');
            }
        });
        el.addEventListener('mouseout', function(ev){
            var item = ev.target.closest('.wf-mm-item');
            var btn = ev.target.closest('.wf-mm-add-btn') || ev.target.closest('.wf-mm-del-btn');
            if(item || btn){
                var selId = (_mmSelectedBranch && _mmSelectedBranch.nodeId === node.id) ? _mmSelectedBranch.branchId : null;
                var btns = el.querySelectorAll('.wf-mm-add-btn');
                for(var i=0;i<btns.length;i++){
                    if(selId && btns[i].getAttribute('data-mmid') === selId) btns[i].classList.add('visible');
                    else btns[i].classList.remove('visible');
                }
                var delBtns = el.querySelectorAll('.wf-mm-del-btn');
                for(var d=0;d<delBtns.length;d++){
                    if(selId && delBtns[d].getAttribute('data-mmid') === selId) delBtns[d].classList.add('visible');
                    else delBtns[d].classList.remove('visible');
                }
            }
        });
        el.addEventListener('click', function(ev){
            var delBtn = ev.target.closest('.wf-mm-del-btn');
            if(delBtn){
                ev.stopPropagation(); ev.preventDefault();
                var delId = delBtn.getAttribute('data-mmid');
                pushUndo();
                mmDeleteBranch(node, delId);
                return;
            }
            var addBtn = ev.target.closest('.wf-mm-add-btn');
            if(addBtn){
                ev.stopPropagation(); ev.preventDefault();
                var action = addBtn.getAttribute('data-action');
                var targetId = addBtn.getAttribute('data-mmid');
                if(action === 'add-child') mmAddChild(node, targetId);
                else if(action === 'add-sibling') mmAddSibling(node, targetId);
                return;
            }
            var item = ev.target.closest('.wf-mm-item');
            if(item){ ev.stopPropagation(); mmSelectBranch(node, item.getAttribute('data-mmid')); }
        });
        el.addEventListener('dblclick', function(ev){
            var item = ev.target.closest('.wf-mm-item');
            if(item){ ev.stopPropagation(); mmStartEdit(el, node, item); }
        });
        // 마인드맵 아이템 우클릭
        el.addEventListener('contextmenu', function(ev){
            var item = ev.target.closest('.wf-mm-item');
            if(item){
                ev.preventDefault(); ev.stopPropagation();
                var bid = item.getAttribute('data-mmid');
                mmSelectBranch(node, bid);
                showCtxMenu(ev.clientX, ev.clientY, {type:'mm-branch', node:node, branchId:bid, isRoot:(bid===node.data.mmTree.id)});
            }
        });
    }

    // ══════════════════════════════════════
    // ═══ 우클릭 컨텍스트 메뉴 ═══
    // ══════════════════════════════════════
    _ctxMenu = document.createElement('div');
    _ctxMenu.className = 'wf-ctx-menu';
    _ctxMenu.style.display = 'none';
    document.body.appendChild(_ctxMenu);

    function buildCtxMenuHtml(target){
        var isEdge = target && target.type === 'edge';
        var isMmBranch = target && target.type === 'mm-branch';
        var isNode = target && !isEdge && !isMmBranch && target.id;
        var hasTarget = isNode || isEdge;
        var html = '';
        if(isMmBranch){
            html += '<button class="wf-ctx-menu-item" data-cm="mm-add-child"><span>하위 주제 추가</span><span class="wf-ctx-menu-shortcut">Tab</span></button>';
            if(!target.isRoot){
                html += '<button class="wf-ctx-menu-item" data-cm="mm-add-sibling"><span>형제 주제 추가</span><span class="wf-ctx-menu-shortcut">Enter</span></button>';
            }
            html += '<div class="wf-ctx-menu-sep"></div>';
            html += '<button class="wf-ctx-menu-item" data-cm="mm-color"><span>색상 변경</span><span class="wf-ctx-menu-shortcut">🎨</span></button>';
            html += '<button class="wf-ctx-menu-item" data-cm="mm-color-reset"><span>색상 초기화</span></button>';
            if(!target.isRoot){
                html += '<div class="wf-ctx-menu-sep"></div>';
                html += '<button class="wf-ctx-menu-item wf-ctx-menu-danger" data-cm="mm-delete"><span>주제 삭제</span><span class="wf-ctx-menu-shortcut">Del</span></button>';
            }
            return html;
        }
        if(hasTarget){
            html += '<button class="wf-ctx-menu-item" data-cm="copy"><span>복제</span><span class="wf-ctx-menu-shortcut">Ctrl+C</span></button>';
        }
        html += '<button class="wf-ctx-menu-item" data-cm="paste"' + (!_clipboard ? ' disabled' : '') + '><span>붙여넣기</span><span class="wf-ctx-menu-shortcut">Ctrl+V</span></button>';
        if(isNode){
            html += '<div class="wf-ctx-menu-sep"></div>';
            html += '<div class="wf-ctx-menu-sub">';
            html += '<button class="wf-ctx-menu-item wf-ctx-menu-parent"><span>레이어</span><span class="wf-ctx-menu-arrow">▸</span></button>';
            html += '<div class="wf-ctx-menu-subpanel">';
            html += '<button class="wf-ctx-menu-item" data-cm="layer-up"><span>위로 한층 이동</span><span class="wf-ctx-menu-shortcut">Ctrl+]</span></button>';
            html += '<button class="wf-ctx-menu-item" data-cm="layer-down"><span>아래로 한층 이동</span><span class="wf-ctx-menu-shortcut">Ctrl+[</span></button>';
            html += '<button class="wf-ctx-menu-item" data-cm="layer-front"><span>맨 앞으로 이동</span><span class="wf-ctx-menu-shortcut">Ctrl+Shift+]</span></button>';
            html += '<button class="wf-ctx-menu-item" data-cm="layer-back"><span>맨 뒤로 이동</span><span class="wf-ctx-menu-shortcut">Ctrl+Shift+[</span></button>';
            html += '</div></div>';
        }
        html += '<div class="wf-ctx-menu-sep"></div>';
        html += '<button class="wf-ctx-menu-item" data-cm="zoomin"><span>줌인</span><span class="wf-ctx-menu-shortcut">Shift+2</span></button>';
        if(hasTarget){
            html += '<div class="wf-ctx-menu-sep"></div>';
            html += '<button class="wf-ctx-menu-item wf-ctx-menu-danger" data-cm="delete"><span>삭제</span><span class="wf-ctx-menu-shortcut">Del</span></button>';
        }
        if(isNode){
            html += '<div class="wf-ctx-menu-sep"></div>';
            html += '<button class="wf-ctx-menu-item" data-cm="sys-assign"><span>시스템 할당</span></button>';
            html += '<button class="wf-ctx-menu-item" data-cm="info"><span>요소정보</span><span class="wf-ctx-menu-shortcut">Ctrl+I</span></button>';
        }
        return html;
    }

    function showCtxMenu(x, y, target){
        _ctxMenuTarget = target;
        _ctxMenu.innerHTML = buildCtxMenuHtml(target);
        _ctxMenu.style.display = 'block';
        // 화면 벗어남 방지
        var mw = _ctxMenu.offsetWidth || 200;
        var mh = _ctxMenu.offsetHeight || 200;
        if(x + mw > window.innerWidth) x = window.innerWidth - mw - 8;
        if(y + mh > window.innerHeight) y = window.innerHeight - mh - 8;
        _ctxMenu.style.left = x + 'px';
        _ctxMenu.style.top = y + 'px';
    }
    function hideCtxMenu(){
        _ctxMenu.style.display = 'none';
        _ctxMenuTarget = null;
    }

    // 메뉴 외부 클릭 시 닫기
    document.addEventListener('mousedown', function(e){
        if(_ctxMenu.style.display !== 'none' && !_ctxMenu.contains(e.target)){
            hideCtxMenu();
        }
    });

    _ctxMenu.addEventListener('click', function(e){
        var item = e.target.closest('[data-cm]');
        if(!item || item.disabled) return;
        var cmd = item.getAttribute('data-cm');
        execCtxCmd(cmd);
        hideCtxMenu();
    });

    function execCtxCmd(cmd){
        var isEdge = _ctxMenuTarget && _ctxMenuTarget.type === 'edge';
        var node = (!isEdge && _ctxMenuTarget && _ctxMenuTarget.id) ? _ctxMenuTarget : (selectedNode || null);
        if(cmd === 'copy' && node) doCopyNode(node);
        if(cmd === 'paste') doPasteNode();
        if(cmd === 'layer-up' && node) doLayerMove(node, 'up');
        if(cmd === 'layer-down' && node) doLayerMove(node, 'down');
        if(cmd === 'layer-front' && node) doLayerMove(node, 'front');
        if(cmd === 'layer-back' && node) doLayerMove(node, 'back');
        if(cmd === 'zoomin') doZoomIn();
        if(cmd === 'delete'){
            if(isEdge){
                var ei = edges.indexOf(_ctxMenuTarget.edge);
                if(ei >= 0){ edges.splice(ei,1); drawEdges(); scheduleLivePush(); }
            } else if(node){
                deleteNode(node);
            }
        }
        if(cmd === 'info' && node) showElemInfo(node);
        if(cmd === 'sys-assign' && node) openSysAssignPanel(node);
        if(cmd === 'mm-delete' && _ctxMenuTarget && _ctxMenuTarget.type === 'mm-branch'){
            pushUndo();
            mmDeleteBranch(_ctxMenuTarget.node, _ctxMenuTarget.branchId);
        }
        if(cmd === 'mm-add-child' && _ctxMenuTarget && _ctxMenuTarget.type === 'mm-branch'){
            mmAddChild(_ctxMenuTarget.node, _ctxMenuTarget.branchId);
        }
        if(cmd === 'mm-add-sibling' && _ctxMenuTarget && _ctxMenuTarget.type === 'mm-branch'){
            mmAddSibling(_ctxMenuTarget.node, _ctxMenuTarget.branchId);
        }
        if(cmd === 'mm-color' && _ctxMenuTarget && _ctxMenuTarget.type === 'mm-branch'){
            var _mccNode = _ctxMenuTarget.node;
            var _mccBid = _ctxMenuTarget.branchId;
            var branch = mmFindBranch(_mccNode.data.mmTree, _mccBid);
            _mmColorInput.value = branch && branch.color ? branch.color : '#5b5fc7';
            _mmColorInput.dataset.nodeId = _mccNode.id;
            _mmColorInput.dataset.branchId = _mccBid;
            _mmColorInput.click();
        }
        if(cmd === 'mm-color-reset' && _ctxMenuTarget && _ctxMenuTarget.type === 'mm-branch'){
            pushUndo();
            var _rNode = _ctxMenuTarget.node;
            var _rBranch = mmFindBranch(_rNode.data.mmTree, _ctxMenuTarget.branchId);
            if(_rBranch) delete _rBranch.color;
            rerenderMindmap(_rNode);
        }
    }

    // ── 마인드맵 색상 선택기 (hidden) ──
    var _mmColorInput = document.createElement('input');
    _mmColorInput.type = 'color';
    _mmColorInput.style.cssText = 'position:absolute;visibility:hidden;width:0;height:0;';
    document.body.appendChild(_mmColorInput);
    _mmColorInput.addEventListener('input', function(){
        var nid = _mmColorInput.dataset.nodeId;
        var bid = _mmColorInput.dataset.branchId;
        if(!nid || !bid) return;
        var nd = nodes.find(function(n){ return n.id === nid; });
        if(!nd) return;
        var branch = mmFindBranch(nd.data.mmTree, bid);
        if(branch){
            branch.color = _mmColorInput.value;
            rerenderMindmap(nd);
        }
    });
    _mmColorInput.addEventListener('change', function(){
        var nid = _mmColorInput.dataset.nodeId;
        var bid = _mmColorInput.dataset.branchId;
        if(!nid || !bid) return;
        var nd = nodes.find(function(n){ return n.id === nid; });
        if(nd) pushUndo();
    });

    // ── 복제 / 붙여넣기 ──
    function doCopyNode(node){
        _clipboard = {
            type: node.type,
            data: JSON.parse(JSON.stringify(node.data)),
            size: node.size ? {w:node.size.w, h:node.size.h} : null,
            _meta: node._meta ? JSON.parse(JSON.stringify(node._meta)) : null
        };
    }
    function doPasteNode(){
        if(!_clipboard) return;
        var rect = viewportEl.getBoundingClientRect();
        var cx = (rect.width/2 - panX) / zoom;
        var cy = (rect.height/2 - panY) / zoom;
        var newNode = addNode(_clipboard.type, cx, cy);
        // 데이터 복원
        var keys = Object.keys(_clipboard.data);
        for(var ki=0; ki<keys.length; ki++){
            newNode.data[keys[ki]] = JSON.parse(JSON.stringify(_clipboard.data[keys[ki]]));
        }
        if(_clipboard.size){
            newNode.size = {w:_clipboard.size.w, h:_clipboard.size.h};
            var nel = document.getElementById('nd-'+newNode.id);
            if(nel){ nel.style.width=newNode.size.w+'px'; nel.style.height=newNode.size.h+'px'; }
        }
        // re-render
        var el = document.getElementById('nd-'+newNode.id);
        if(el) el.remove();
        renderNodeEl(newNode);
        applyNodeBgColor(newNode);
        selectNode(newNode);
    }

    // ── 레이어 이동 ──
    function doLayerMove(node, dir){
        var idx = nodes.indexOf(node);
        if(idx < 0) return;
        if(dir === 'up' && idx < nodes.length-1){
            nodes.splice(idx, 1); nodes.splice(idx+1, 0, node);
        } else if(dir === 'down' && idx > 0){
            nodes.splice(idx, 1); nodes.splice(idx-1, 0, node);
        } else if(dir === 'front'){
            nodes.splice(idx, 1); nodes.push(node);
        } else if(dir === 'back'){
            nodes.splice(idx, 1); nodes.unshift(node);
        }
        reapplyZIndices();
        // "맨 뒤로" — 엣지 레이어(z=10) 아래로
        if(dir === 'back'){
            var backEl = document.getElementById('nd-'+node.id);
            if(backEl) backEl.style.zIndex = 5;
        }
        // 수정 메타 갱신
        touchMeta(node);
    }
    function reapplyZIndices(){
        nodes.forEach(function(n, i){
            var nel = document.getElementById('nd-'+n.id);
            if(nel) nel.style.zIndex = 11 + i;
        });
    }

    // ── 줌인 ──
    function doZoomIn(){
        zoom = Math.min(3, zoom + 0.25);
        applyTransform();
    }

    // ── 메타 갱신 ──
    function touchMeta(node){
        if(!node._meta) node._meta = {};
        node._meta.modified_at = new Date().toISOString();
        node._meta.modified_by = getCurrentUserName() || '(알 수 없음)';
    }

    // ── 요소정보 팝업 ──
    function _fmtLocalDT(isoStr){
        if(!isoStr) return '-';
        var d = new Date(isoStr);
        if(isNaN(d.getTime())) return String(isoStr).substring(0,19).replace('T',' ');
        var Y=d.getFullYear(), M=('0'+(d.getMonth()+1)).slice(-2), D=('0'+d.getDate()).slice(-2);
        var h=('0'+d.getHours()).slice(-2), m=('0'+d.getMinutes()).slice(-2), s=('0'+d.getSeconds()).slice(-2);
        return Y+'-'+M+'-'+D+' '+h+':'+m+':'+s;
    }
    function showElemInfo(node){
        var m = node._meta || {};
        var ca = _fmtLocalDT(m.created_at);
        var cb = m.created_by || '-';
        var ma = _fmtLocalDT(m.modified_at);
        var mb = m.modified_by || '-';
        var nt = NODE_TYPES.find(function(t){ return t.type===node.type; });
        var typeName = nt ? nt.label : node.type;
        // 모달 생성
        var overlay = document.createElement('div');
        overlay.className = 'wf-info-overlay';
        var modal = document.createElement('div');
        modal.className = 'wf-info-modal';
        modal.innerHTML = '<div class="wf-info-header"><span>요소정보</span><button class="wf-info-close" type="button">&#x2715;</button></div>'
            + '<div class="wf-info-body">'
            + '<div class="wf-info-row"><span class="wf-info-label">유형</span><span class="wf-info-value">'+escTxt(typeName)+'</span></div>'
            + '<div class="wf-info-row"><span class="wf-info-label">이름</span><span class="wf-info-value">'+escTxt(node.data.name||'')+'</span></div>'
            + '<div class="wf-info-sep"></div>'
            + '<div class="wf-info-row"><span class="wf-info-label">생성일시</span><span class="wf-info-value">'+escTxt(ca)+'</span></div>'
            + '<div class="wf-info-row"><span class="wf-info-label">생성자</span><span class="wf-info-value">'+escTxt(cb)+'</span></div>'
            + '<div class="wf-info-row"><span class="wf-info-label">수정일시</span><span class="wf-info-value">'+escTxt(ma)+'</span></div>'
            + '<div class="wf-info-row"><span class="wf-info-label">수정자</span><span class="wf-info-value">'+escTxt(mb)+'</span></div>'
            + '</div>';
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        overlay.addEventListener('click', function(ev){
            if(ev.target === overlay || ev.target.closest('.wf-info-close')) overlay.remove();
        });
        modal.querySelector('.wf-info-close').addEventListener('click', function(){ overlay.remove(); });
    }

    // ── 시스템 할당 패널 ──
    var _sysAssignPanel = document.createElement('div');
    _sysAssignPanel.className = 'wf-sysassign-panel';
    _sysAssignPanel.innerHTML = ''
        + '<div class="wf-sysassign-header">'
        + '  <span class="wf-sysassign-title">시스템 할당</span>'
        + '  <button class="wf-sysassign-close" type="button">&#x2715;</button>'
        + '</div>'
        + '<div class="wf-sysassign-search">'
        + '  <input type="text" class="wf-sysassign-search-input" placeholder="업무명 또는 시스템명 검색..." autocomplete="off">'
        + '</div>'
        + '<div class="wf-sysassign-dropdown"></div>'
        + '<div class="wf-sysassign-body"></div>';
    editorRoot.appendChild(_sysAssignPanel);

    var _sysAssignOpen = false;
    var _sysAssignNode = null;

    _sysAssignPanel.querySelector('.wf-sysassign-close').addEventListener('click', closeSysAssignPanel);

    var _sysSearchInput = _sysAssignPanel.querySelector('.wf-sysassign-search-input');
    var _sysDropdown = _sysAssignPanel.querySelector('.wf-sysassign-dropdown');
    var _sysBody = _sysAssignPanel.querySelector('.wf-sysassign-body');
    var _sysSearchTimer = null;
    var _sysAllRows = [];

    function showSysDropdown(){ _sysDropdown.style.display = 'block'; _sysBody.style.visibility = 'hidden'; }
    function hideSysDropdown(){ _sysDropdown.style.display = 'none'; _sysBody.style.visibility = 'visible'; }

    _sysSearchInput.addEventListener('input', function(){
        clearTimeout(_sysSearchTimer);
        _sysSearchTimer = setTimeout(function(){
            var q = _sysSearchInput.value.trim();
            if(!q){ hideSysDropdown(); return; }
            fetchSysDropdown(q);
        }, 250);
    });
    _sysSearchInput.addEventListener('focus', function(){
        if(_sysSearchInput.value.trim() && _sysDropdown.children.length > 0)
            showSysDropdown();
    });
    document.addEventListener('mousedown', function(e){
        if(!_sysAssignPanel.contains(e.target)) hideSysDropdown();
    });

    function openSysAssignPanel(node){
        _sysAssignNode = node;
        _sysAssignOpen = true;
        _sysSearchInput.value = '';
        hideSysDropdown();
        _sysDropdown.innerHTML = '';
        _sysAssignPanel.classList.add('open');
        updateSidePanelOffset();
        renderSysAssignDetail();
    }
    function closeSysAssignPanel(){
        _sysAssignOpen = false;
        _sysAssignNode = null;
        _sysAssignPanel.classList.remove('open');
        hideSysDropdown();
        updateSidePanelOffset();
    }

    function fetchSysDropdown(q){
        var url = '/api/workflow/hardware-assets/search?page=1&page_size=50&q=' + encodeURIComponent(q);
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onload = function(){
            if(xhr.status === 200){
                try {
                    var res = JSON.parse(xhr.responseText);
                    if(res.success){
                        _sysAllRows = res.rows || [];
                        renderSysDropdown(_sysAllRows);
                    }
                } catch(e){}
            }
        };
        xhr.send();
    }

    function renderSysDropdown(rows){
        // 이미 다른 노드에 할당된 시스템 ID 수집 (현재 노드 제외)
        var usedIds = {};
        nodes.forEach(function(n){
            if(n === _sysAssignNode) return;
            if(n.data && n.data.assignedSystem && n.data.assignedSystem.id)
                usedIds[n.data.assignedSystem.id] = true;
        });
        var filtered = rows.filter(function(r){ return !usedIds[r.id]; });
        if(!filtered.length){
            _sysDropdown.innerHTML = '<div class="wf-sysdd-empty">검색 결과가 없습니다.</div>';
            showSysDropdown();
            return;
        }
        var assignedId = (_sysAssignNode && _sysAssignNode.data && _sysAssignNode.data.assignedSystem)
            ? _sysAssignNode.data.assignedSystem.id : null;
        var html = '';
        filtered.forEach(function(r){
            var wn = r.work_name || '-';
            var sn = r.system_name || '-';
            var sel = (r.id === assignedId) ? ' wf-sysdd-selected' : '';
            html += '<div class="wf-sysdd-item' + sel + '" data-sid="' + r.id + '">'
                + '<span class="wf-sysdd-label">' + escTxt(wn) + ' <span class="wf-sysdd-sys">(' + escTxt(sn) + ')</span></span>'
                + (r.id === assignedId ? '<span class="wf-sysdd-chk">✓</span>' : '')
                + '</div>';
        });
        _sysDropdown.innerHTML = html;
        showSysDropdown();

        _sysDropdown.querySelectorAll('.wf-sysdd-item').forEach(function(el){
            el.addEventListener('click', function(){
                var sid = parseInt(el.getAttribute('data-sid'), 10);
                var row = _sysAllRows.find(function(r){ return r.id === sid; });
                if(!row || !_sysAssignNode) return;
                var cols = _sysAssignCols;
                var assignObj = {id: row.id};
                cols.forEach(function(c){ assignObj[c.key] = row[c.key] || ''; });
                _sysAssignNode.data.assignedSystem = assignObj;
                scheduleLivePush();
                hideSysDropdown();
                _sysSearchInput.value = '';
                renderSysAssignDetail();
                updateSysBadge(_sysAssignNode);
            });
        });
    }

    var _sysAssignCols = [
        {key:'asset_category', label:'자산 분류'},
        {key:'asset_type', label:'자산 구분'},
        {key:'work_category_name', label:'업무 분류'},
        {key:'work_division_name', label:'업무 코드'},
        {key:'work_status_name', label:'업무 상태'},
        {key:'work_operation_name', label:'업무 운영'},
        {key:'work_group_name', label:'업무 그룹'},
        {key:'work_name', label:'업무 이름'},
        {key:'system_name', label:'시스템 이름'},
        {key:'manufacturer_name', label:'시스템 제조사'},
        {key:'server_model_name', label:'시스템 모델명'},
        {key:'system_dept_name', label:'시스템 담당부서'},
        {key:'system_owner_name', label:'시스템 담당자'},
        {key:'system_grade', label:'시스템 등급'}
    ];

    function renderSysAssignDetail(){
        var body = _sysAssignPanel.querySelector('.wf-sysassign-body');
        var assigned = (_sysAssignNode && _sysAssignNode.data) ? _sysAssignNode.data.assignedSystem : null;
        if(!assigned){
            body.innerHTML = '<div class="wf-sysassign-empty">시스템을 검색하여 할당하세요.</div>';
            return;
        }
        var html = '<div class="wf-sysassign-detail">';
        html += '<div class="wf-sysassign-detail-header">'
            + '<span class="wf-sysassign-detail-name">' + escTxt(assigned.work_name || '-') + ' (' + escTxt(assigned.system_name || '-') + ')</span>'
            + '<button class="wf-sysassign-unlink" type="button" title="할당 해제">✕</button>'
            + '</div>';
        _sysAssignCols.forEach(function(c){
            html += '<div class="wf-sysassign-detail-row">'
                + '<span class="wf-sysassign-detail-label">' + c.label + '</span>'
                + '<span class="wf-sysassign-detail-value">' + escTxt(assigned[c.key] || '-') + '</span>'
                + '</div>';
        });
        html += '</div>';
        body.innerHTML = html;

        body.querySelector('.wf-sysassign-unlink').addEventListener('click', function(){
            if(_sysAssignNode && _sysAssignNode.data){
                delete _sysAssignNode.data.assignedSystem;
                scheduleLivePush();
                renderSysAssignDetail();
                updateSysBadge(_sysAssignNode);
            }
        });
    }

    // ── 시스템 할당 배지 (하단 표시) ──
    var SYS_STATUS_COLORS = {
        '가동':'#22c55e','유휴':'#f59e0b','폐기':'#ef4444',
        '보류':'#8b5cf6','오픈대기':'#3b82f6','대기':'#94a3b8'
    };
    function updateSysBadge(node){
        var el = document.getElementById('nd-'+node.id);
        if(!el) return;
        var old = el.querySelector('.wf-sys-badge');
        if(old) old.remove();
        var a = node.data && node.data.assignedSystem;
        if(!a) return;
        var wn = a.work_name || '';
        var sn = a.system_name || '';
        var st = a.work_status_name || '';
        var color = SYS_STATUS_COLORS[st] || '#94a3b8';
        var badge = document.createElement('div');
        badge.className = 'wf-sys-badge';
        badge.innerHTML = '<span class="wf-sys-badge-dot" style="background:'+color+'"></span>'
            + '<span class="wf-sys-badge-lines">'
            + '<span class="wf-sys-badge-work">'+escTxt(wn)+'</span>'
            + (sn ? '<span class="wf-sys-badge-sys">'+escTxt(sn)+'</span>' : '')
            + '</span>';
        badge.title = (st?'['+st+'] ':'')+wn+(sn?' ('+sn+')':'');
        el.appendChild(badge);
    }

    // ── 캔버스 빈 곳 우클릭 ──
    viewportEl.addEventListener('contextmenu', function(e){
        e.preventDefault();
        // 빈 캔버스 우클릭
        if(e.target === viewportEl || e.target === worldEl || e.target.closest('.wf-canvas-world') === worldEl){
            showCtxMenu(e.clientX, e.clientY, null);
        }
    });

    function setTool(toolId){
        // 펜 모드 자동 해제
        if(currentTool === 'pen' && toolId !== 'pen') exitDrawMode();
        currentTool = toolId;
        var isNodeChild = NODE_CHILD_IDS.indexOf(toolId) >= 0;
        // 모든 도형 카테고리 아이템 타입을 동적으로 수집
        var _shapeChildIds = [];
        SHAPE_CATEGORIES.forEach(function(cat){
            cat.items.forEach(function(item){ _shapeChildIds.push(item.type); });
        });
        var isShapeChild = _shapeChildIds.indexOf(toolId) >= 0;
        var btns = toolbar.querySelectorAll('.wf-tool-btn');
        for(var i=0; i<btns.length; i++){
            var dt = btns[i].getAttribute('data-tool');
            if(isNodeChild && dt === 'nodes'){
                btns[i].classList.add('active');
            } else if(isShapeChild && dt === 'shape'){
                btns[i].classList.add('active');
            } else if(toolId === 'connect' && dt === 'line'){
                btns[i].classList.add('active');
            } else {
                btns[i].classList.toggle('active', dt === toolId);
            }
        }
        // 도형 이외 도구 선택 시 패널 닫기
        if(!isShapeChild && _shapesPanelOpen){
            closeShapesPanel();
        }
        if(toolId !== 'connect' && _linesPanelOpen){
            closeLinesPanel();
        }
        if(toolId !== 'mindmap' && _mindmapPanelOpen){
            closeMindmapPanel();
        }
        // 선택 버튼 하이라이트 (하단바)
        var selBtn = document.getElementById('wfe-zoom-select');
        if(selBtn) selBtn.classList.toggle('active', toolId === 'select');

        if(toolId === 'connect'){
            viewportEl.style.cursor = 'crosshair';
        } else if(toolId === 'pen'){
            viewportEl.style.cursor = 'crosshair';
        } else {
            viewportEl.style.cursor = 'default';
        }
    }

    // ── 줌/팬 ──
    var _animFrame = null;
    var _gridVisible = true;
    var _canvasBgMode = 'dot'; // 'dot' | 'grid' | 'solid'

    function smoothTransform(){
        if(_animFrame) cancelAnimationFrame(_animFrame);
        _animFrame = requestAnimationFrame(function(){
            worldEl.style.transform = 'translate('+panX+'px,'+panY+'px) scale('+zoom+')';
            var zoomEl = document.getElementById('wfe-zoom-level');
            if(zoomEl) zoomEl.value = Math.round(zoom*100)+'%';
            _animFrame = null;
        });
    }
    function applyTransform(){
        smoothTransform();
        // 줌/팬 변경 시 컨텍스트 툴바 위치 갱신 (scale 반영)
        if(selectedNode && !ctxPinned) positionCtxBar(selectedNode);
    }

    document.getElementById('wfe-zoom-in').addEventListener('click', function(){
        zoom = Math.min(3, zoom + 0.1);
        applyTransform();
    });
    document.getElementById('wfe-zoom-out').addEventListener('click', function(){
        zoom = Math.max(0.15, zoom - 0.1);
        applyTransform();
    });
    document.getElementById('wfe-zoom-fit').addEventListener('click', function(){
        if(!nodes.length){ zoom=1; panX=0; panY=0; applyTransform(); return; }
        var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
        nodes.forEach(function(n){
            if(n.position.x < minX) minX = n.position.x;
            if(n.position.y < minY) minY = n.position.y;
            if(n.position.x+160 > maxX) maxX = n.position.x+160;
            if(n.position.y+60  > maxY) maxY = n.position.y+60;
        });
        var bw = maxX - minX + 100;
        var bh = maxY - minY + 100;
        var vw = viewportEl.offsetWidth;
        var vh = viewportEl.offsetHeight;
        zoom = Math.min(1.5, Math.min(vw/bw, vh/bh));
        zoom = Math.max(0.15, zoom);
        panX = (vw - bw*zoom)/2 - minX*zoom + 50*zoom;
        panY = (vh - bh*zoom)/2 - minY*zoom + 50*zoom;
        applyTransform();
    });

    // 선택 버튼 (하단바)
    document.getElementById('wfe-zoom-select').addEventListener('click', function(){
        setTool('select');
    });

    // 줌 직접 입력
    (function(){
        var zoomInput = document.getElementById('wfe-zoom-level');
        zoomInput.addEventListener('compositionstart', function(){ this._composing = true; });
        zoomInput.addEventListener('compositionend', function(){
            this._composing = false;
            this.value = this.value.replace(/[^0-9]/g, '');
        });
        zoomInput.addEventListener('focus', function(){ this.value = this.value.replace('%',''); this.select(); });
        zoomInput.addEventListener('input', function(){
            if(this._composing) return;
            this.value = this.value.replace(/[^0-9]/g, '');
        });
        zoomInput.addEventListener('keydown', function(e){
            if(e.isComposing) return;
            if(!e.ctrlKey && !e.metaKey && e.key.length === 1 && !/[0-9]/.test(e.key)){
                e.preventDefault();
            }
            if(e.key === 'Enter'){
                e.preventDefault();
                var val = parseInt(this.value, 10);
                if(!isNaN(val) && val >= 15 && val <= 300){
                    zoom = val / 100;
                } else {
                    zoom = Math.max(0.15, Math.min(3, zoom));
                }
                this.value = Math.round(zoom*100)+'%';
                applyTransform();
                this.blur();
            }
            if(e.key === 'Escape'){ this.value = Math.round(zoom*100)+'%'; this.blur(); }
        });
        zoomInput.addEventListener('blur', function(){
            this.value = Math.round(zoom*100)+'%';
        });
    })();

    // 배경모드
    var BG_PRESETS = [
        {label:'라이트 모드', colors:[
            {name:'흰색', bg:'#ffffff', dot:'rgba(0,0,0,0.15)'}
        ]},
        {label:'다크 모드', colors:[
            {name:'남색', bg:'#1e293b', dot:'rgba(255,255,255,0.10)'}
        ]}
    ];
    function isDarkColor(c){
        var r,g,b;
        if(!c) return false;
        var m = c.match(/rgb[a]?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if(m){ r=parseInt(m[1]); g=parseInt(m[2]); b=parseInt(m[3]); }
        else { r=parseInt(c.slice(1,3),16); g=parseInt(c.slice(3,5),16); b=parseInt(c.slice(5,7),16); }
        return (r*299+g*587+b*114)/1000 < 128;
    }
    function applyBgTheme(bgColor){
        var dark = isDarkColor(bgColor);
        editorRoot.setAttribute('data-theme', dark ? 'dark' : 'light');
        var logoEl = editorRoot.querySelector('.wf-topbar-logo');
        if(logoEl) logoEl.src = dark ? '/static/image/logo/blossom_logo_dark.png' : '/static/image/logo/blossom_logo.png';
    }
    var _bgPopup = null;
    function closeAllPopups(except){
        if(except !== 'bg' && _bgPopup){ _bgPopup.remove(); _bgPopup=null; }
        if(except !== 'canvasBg' && _canvasBgPopup){ _canvasBgPopup.remove(); _canvasBgPopup=null; }
        if(except !== 'history' && _historyOpen){ closeHistory(); }
    }

    // ── 사이드 패널(채팅/이력) 열림 시 하단바 밀어내기 ──
    var canvasArea = document.getElementById('wfe-canvas-area');
    function updateSidePanelOffset(){
        if(_commentOpen || _historyOpen || _sysAssignOpen){
            canvasArea.classList.add('side-panel-open');
        } else {
            canvasArea.classList.remove('side-panel-open');
        }
    }

    function buildBgPopup(){
        if(_bgPopup){ _bgPopup.remove(); _bgPopup=null; return; }
        closeAllPopups('bg');
        _bgPopup = document.createElement('div');
        _bgPopup.className = 'wf-bg-popup';
        var area = document.getElementById('wfe-canvas-area');
        var curBg = (area.style.backgroundColor || '#ffffff').trim();
        var html = '<div class="wf-bg-toggle-wrap">';
        BG_PRESETS.forEach(function(group){
            var c = group.colors[0];
            var active = false;
            if(c.bg === '#1e293b'){ active = curBg.indexOf('30') !== -1 || curBg.indexOf('1e293b') !== -1; }
            else { active = !curBg || curBg === '#ffffff' || curBg === 'rgb(255, 255, 255)'; }
            html += '<button class="wf-bg-toggle-btn'+(active?' active':'')+'" data-bg="'+c.bg+'" data-dot="'+c.dot+'">';
            html += '<span class="wf-bg-toggle-swatch" style="background:'+c.bg+'"></span>';
            html += '<span class="wf-bg-toggle-label">'+group.label+'</span>';
            html += '</button>';
        });
        html += '</div>';
        _bgPopup.innerHTML = html;
        _bgPopup.addEventListener('click', function(ev){
            var btn = ev.target.closest('.wf-bg-toggle-btn');
            if(!btn) return;
            ev.stopPropagation();
            var bgColor = btn.getAttribute('data-bg');
            var dotColor = btn.getAttribute('data-dot');
            area.style.backgroundColor = bgColor;
            area.setAttribute('data-dot-color', dotColor);
            applyCanvasBg();
            applyBgTheme(bgColor);
            if(typeof scheduleLivePush==='function') scheduleLivePush();
            _bgPopup.remove(); _bgPopup=null;
        });
        var btn = document.getElementById('wfe-bg-mode');
        var rect = btn.getBoundingClientRect();
        var barRect = document.getElementById('wfe-bottombar').getBoundingClientRect();
        _bgPopup.style.left = (rect.left - barRect.left + rect.width/2) + 'px';
        document.getElementById('wfe-bottombar').appendChild(_bgPopup);
    }
    document.getElementById('wfe-bg-mode').addEventListener('click', function(ev){
        ev.stopPropagation();
        buildBgPopup();
    });
    document.addEventListener('click', function(){
        if(_bgPopup){ _bgPopup.remove(); _bgPopup=null; }
        if(_canvasBgPopup){ _canvasBgPopup.remove(); _canvasBgPopup=null; }
    });

    // 캔버스 배경 모드 적용
    function applyCanvasBg(){
        var area = document.getElementById('wfe-canvas-area');
        var dotColor = area.getAttribute('data-dot-color') || 'rgba(0,0,0,0.15)';
        if(_canvasBgMode === 'dot'){
            area.style.backgroundImage = 'radial-gradient(circle, '+dotColor+' 1px, transparent 1px)';
            area.style.backgroundSize = '28px 28px';
        } else if(_canvasBgMode === 'grid'){
            var gridColor = dotColor.replace(/[\d.]+\)$/, function(m){ return (parseFloat(m)*0.45).toFixed(2)+')'; });
            area.style.backgroundImage = 'linear-gradient('+gridColor+' 1px, transparent 1px), linear-gradient(90deg, '+gridColor+' 1px, transparent 1px)';
            area.style.backgroundSize = '28px 28px';
        } else {
            area.style.backgroundImage = 'none';
            area.style.backgroundSize = '';
        }
    }

    // 캔버스 배경 팝업
    var _canvasBgPopup = null;
    var CANVAS_BG_OPTIONS = [
        {id:'dot',   label:'도트 배경',  icon:'\u2022\u2022\u2022'},
        {id:'grid',  label:'그리드 배경', icon:'\u2293'},
        {id:'solid', label:'단색 배경',  icon:'\u2588'}
    ];
    function buildCanvasBgPopup(){
        if(_canvasBgPopup){ _canvasBgPopup.remove(); _canvasBgPopup=null; return; }
        closeAllPopups('canvasBg');
        _canvasBgPopup = document.createElement('div');
        _canvasBgPopup.className = 'wf-canvas-bg-popup';
        var html = '';
        CANVAS_BG_OPTIONS.forEach(function(opt){
            var active = _canvasBgMode === opt.id ? ' active' : '';
            html += '<button class="wf-canvas-bg-opt'+active+'" data-mode="'+opt.id+'">';
            html += '<span class="wf-canvas-bg-icon">'+opt.icon+'</span>';
            html += '<span>'+opt.label+'</span>';
            html += '</button>';
        });
        _canvasBgPopup.innerHTML = html;
        _canvasBgPopup.addEventListener('click', function(ev){
            var btn = ev.target.closest('.wf-canvas-bg-opt');
            if(!btn) return;
            ev.stopPropagation();
            _canvasBgMode = btn.getAttribute('data-mode');
            _gridVisible = _canvasBgMode !== 'solid';
            applyCanvasBg();
            if(typeof scheduleLivePush==='function') scheduleLivePush();
            _canvasBgPopup.remove(); _canvasBgPopup=null;
        });
        var trigBtn = document.getElementById('wfe-grid-toggle');
        var rect = trigBtn.getBoundingClientRect();
        var barRect = document.getElementById('wfe-bottombar').getBoundingClientRect();
        _canvasBgPopup.style.left = (rect.left - barRect.left + rect.width/2) + 'px';
        document.getElementById('wfe-bottombar').appendChild(_canvasBgPopup);
    }
    document.getElementById('wfe-grid-toggle').addEventListener('click', function(ev){
        ev.stopPropagation();
        buildCanvasBgPopup();
    });

    // 마우스 휠 줌
    viewportEl.addEventListener('wheel', function(e){
        e.preventDefault();
        var rect = viewportEl.getBoundingClientRect();
        var mx = e.clientX - rect.left;
        var my = e.clientY - rect.top;
        var oldZoom = zoom;
        var delta = e.deltaY > 0 ? -0.08 : 0.08;
        zoom = Math.min(3, Math.max(0.15, zoom + delta));
        panX = mx - (mx - panX) * (zoom / oldZoom);
        panY = my - (my - panY) * (zoom / oldZoom);
        applyTransform();
    }, {passive:false});

    // 팬 + 드래그 드로잉
    var isDrawing = false, drawStartX = 0, drawStartY = 0, drawPreview = null, drawSizeEl = null, drawTool = '';

    viewportEl.addEventListener('mousedown', function(e){
        // 인라인 편집 중인 요소가 있으면 포커스 해제하여 커밋
        var activeEdit = worldEl.querySelector('.wf-inline-edit');
        if(activeEdit && e.target !== activeEdit) activeEdit.blur();
        // ER 테이블 인라인 편집 중이면 포커스 해제하여 커밋
        var activeErEdit = worldEl.querySelector('.wf-ert-edit-name, .wf-ert-edit-type');
        if(activeErEdit && !e.target.closest('.wf-ert-row')) activeErEdit.blur();

        if(e.button === 1 || (e.button === 0 && currentTool === 'hand')){
            isPanning = true;
            panStartX = e.clientX;
            panStartY = e.clientY;
            panStartPanX = panX;
            panStartPanY = panY;
            worldEl.classList.add('grabbing');
            e.preventDefault();
            return;
        }
        if(e.button === 0 && (e.target === worldEl || e.target === drawPreview)){
            var nt = NODE_TYPES.find(function(t){ return t.type === currentTool; });
            if(nt){
                var rect = worldEl.getBoundingClientRect();
                drawStartX = (e.clientX - rect.left) / zoom;
                drawStartY = (e.clientY - rect.top) / zoom;
                drawTool = currentTool;
                isDrawing = true;

                drawPreview = document.createElement('div');
                drawPreview.className = 'wf-draw-preview';
                drawPreview.style.cssText = 'position:absolute;left:'+drawStartX+'px;top:'+drawStartY+'px;width:0;height:0;';
                worldEl.appendChild(drawPreview);
                drawSizeEl = document.createElement('div');
                drawSizeEl.className = 'wf-draw-size';
                drawSizeEl.textContent = '0 x 0';
                drawSizeEl.style.cssText = 'position:absolute;left:'+drawStartX+'px;top:'+drawStartY+'px;';
                worldEl.appendChild(drawSizeEl);
                e.preventDefault();
                return;
            }
            if(currentTool === 'connect'){
                deselectEdge();
                selectNode(null);
                var _vpR3 = viewportEl.getBoundingClientRect();
                _lineStartX = (e.clientX - _vpR3.left - panX) / zoom;
                _lineStartY = (e.clientY - _vpR3.top  - panY) / zoom;
                _lineStartNodeId = null;
                // 시작점이 노드 근처면 포트로 스냅
                var _snapStart = findSnapTarget(_lineStartX, _lineStartY, 60, null);
                if(_snapStart){
                    _lineStartNodeId = _snapStart.node.id;
                    _lineStartX = _snapStart.portX;
                    _lineStartY = _snapStart.portY;
                }
                _lineDrawing = true;
                worldEl.classList.add('wf-connecting');
                _linePreview = document.createElementNS('http://www.w3.org/2000/svg','svg');
                _linePreview.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:999;';
                var pLine = document.createElementNS('http://www.w3.org/2000/svg','polyline');
                pLine.setAttribute('points', _lineStartX+','+_lineStartY+' '+_lineStartX+','+_lineStartY);
                pLine.setAttribute('stroke','#7c5cfc'); pLine.setAttribute('stroke-width','2');
                pLine.setAttribute('stroke-dasharray','6 3');
                pLine.setAttribute('fill','none');
                _linePreview.appendChild(pLine);
                worldEl.appendChild(_linePreview);
                e.preventDefault();
                return;
            }
            if(currentTool === 'select'){
                if(!e.shiftKey){ selectNode(null); deselectEdge(); _selectedEdges = []; }
                var rect2 = worldEl.getBoundingClientRect();
                _marquee = {
                    active: true,
                    startX: (e.clientX - rect2.left) / zoom,
                    startY: (e.clientY - rect2.top) / zoom,
                    el: null
                };
                var mEl = document.createElement('div');
                mEl.className = 'wf-select-rect';
                mEl.style.cssText = 'position:absolute;left:'+_marquee.startX+'px;top:'+_marquee.startY+'px;width:0;height:0;';
                worldEl.appendChild(mEl);
                _marquee.el = mEl;
                e.preventDefault();
                return;
            }
        }
    });
    document.addEventListener('mousemove', function(e){
        if(isPanning){
            panX = panStartPanX + (e.clientX - panStartX);
            panY = panStartPanY + (e.clientY - panStartY);
            applyTransform();
        }
        if(_lineDrawing && _linePreview){
            var _vpRm = viewportEl.getBoundingClientRect();
            var cx = (e.clientX - _vpRm.left - panX) / zoom;
            var cy = (e.clientY - _vpRm.top  - panY) / zoom;
            // 스냅 대상 노드 탐색 + 하이라이트
            var _prevTarget = worldEl.querySelector('.wf-connect-target');
            if(_prevTarget) _prevTarget.classList.remove('wf-connect-target');
            var endX = cx, endY = cy;
            var _snapEnd = findSnapTarget(cx, cy, 60, _lineStartNodeId);
            if(_snapEnd){
                _snapEnd.el.classList.add('wf-connect-target');
                endX = _snapEnd.portX;
                endY = _snapEnd.portY;
            }
            // 시작점이 노드에서 출발한 경우 → 타겟 방향 최적 포트로 동적 갱신
            var startX = _lineStartX, startY = _lineStartY;
            if(_lineStartNodeId){
                var _srcEl = document.getElementById('nd-'+_lineStartNodeId);
                if(_srcEl){
                    var snl = parseInt(_srcEl.style.left)||0, snt = parseInt(_srcEl.style.top)||0;
                    var snw = _srcEl.offsetWidth, snh = _srcEl.offsetHeight;
                    var scx = snl + snw/2, scy = snt + snh/2;
                    var sPorts = [
                        {x: snl + snw, y: scy},
                        {x: snl,       y: scy},
                        {x: scx,       y: snt},
                        {x: scx,       y: snt + snh}
                    ];
                    var sBest = 0, sBestD = Infinity;
                    for(var si = 0; si < 4; si++){
                        var sd = (sPorts[si].x - endX)*(sPorts[si].x - endX) + (sPorts[si].y - endY)*(sPorts[si].y - endY);
                        if(sd < sBestD){ sBestD = sd; sBest = si; }
                    }
                    startX = sPorts[sBest].x;
                    startY = sPorts[sBest].y;
                }
            }
            // 꺾인선(elbow) 미리보기
            var pLine = _linePreview.querySelector('polyline');
            if(pLine){
                var ls = _pendingLineStyle || 'elbow_arrow';
                if(ls === 'elbow' || ls === 'elbow_arrow'){
                    var mx = (startX + endX) / 2;
                    pLine.setAttribute('points', startX+','+startY+' '+mx+','+startY+' '+mx+','+endY+' '+endX+','+endY);
                } else {
                    pLine.setAttribute('points', startX+','+startY+' '+endX+','+endY);
                }
            }
        }
        // 포트 드래그 미리보기 꺾인선 업데이트 + 스냅 하이라이트
        if(_portDragActive && _portDragLine){
            var rect2 = worldEl.getBoundingClientRect();
            var cx2 = (e.clientX - rect2.left) / zoom;
            var cy2 = (e.clientY - rect2.top) / zoom;
            // 스냅 대상 하이라이트
            var _prevPT = worldEl.querySelector('.wf-connect-target');
            if(_prevPT) _prevPT.classList.remove('wf-connect-target');
            var endPX = cx2, endPY = cy2;
            var _portSnapEnd = findSnapTarget(cx2, cy2, 60, _portDragSrcNodeId);
            if(_portSnapEnd){
                _portSnapEnd.el.classList.add('wf-connect-target');
                endPX = _portSnapEnd.portX;
                endPY = _portSnapEnd.portY;
            }
            var sx = _portDragSrcX, sy = _portDragSrcY;
            var mx = (sx + endPX) / 2;
            _portDragLine.setAttribute('points', sx+','+sy+' '+mx+','+sy+' '+mx+','+endPY+' '+endPX+','+endPY);
        }
        if(isDrawing && drawPreview){
            var rect = worldEl.getBoundingClientRect();
            var cx = (e.clientX - rect.left) / zoom;
            var cy = (e.clientY - rect.top) / zoom;
            var x = Math.min(drawStartX, cx);
            var y = Math.min(drawStartY, cy);
            var w = Math.abs(cx - drawStartX);
            var h = Math.abs(cy - drawStartY);
            drawPreview.style.left   = x + 'px';
            drawPreview.style.top    = y + 'px';
            drawPreview.style.width  = w + 'px';
            drawPreview.style.height = h + 'px';
            if(drawSizeEl){
                drawSizeEl.textContent = Math.round(w) + ' x ' + Math.round(h);
                drawSizeEl.style.left = (x + w/2) + 'px';
                drawSizeEl.style.top  = (y + h + 8) + 'px';
            }
        }
        if(_marquee && _marquee.active && _marquee.el){
            var rect = worldEl.getBoundingClientRect();
            var cx = (e.clientX - rect.left) / zoom;
            var cy = (e.clientY - rect.top) / zoom;
            var x = Math.min(_marquee.startX, cx);
            var y = Math.min(_marquee.startY, cy);
            var w = Math.abs(cx - _marquee.startX);
            var h = Math.abs(cy - _marquee.startY);
            _marquee.el.style.left   = x + 'px';
            _marquee.el.style.top    = y + 'px';
            _marquee.el.style.width  = w + 'px';
            _marquee.el.style.height = h + 'px';
        }
        // 라인 전체 드래그 이동
        if(_edgeDragging && _edgeDragEdge){
            var rect = worldEl.getBoundingClientRect();
            var cx = (e.clientX - rect.left) / zoom;
            var cy = (e.clientY - rect.top) / zoom;
            var dx = cx - _edgeDragStartX;
            var dy = cy - _edgeDragStartY;
            _edgeDragEdge.x1 = _edgeDragOrigX1 + dx;
            _edgeDragEdge.y1 = _edgeDragOrigY1 + dy;
            _edgeDragEdge.x2 = _edgeDragOrigX2 + dx;
            _edgeDragEdge.y2 = _edgeDragOrigY2 + dy;
            if(_edgeDragOrigMidX !== undefined) _edgeDragEdge.elbowMidX = _edgeDragOrigMidX + dx;
            if(_edgeDragEdge.elbowJoints){
                if(_edgeDragOrigJoints){
                    _edgeDragEdge.elbowJoints = {jx1: _edgeDragOrigJoints.jx1 + dx, jy: _edgeDragOrigJoints.jy + dy, jx2: _edgeDragOrigJoints.jx2 + dx};
                }
            }
            if(_edgeDragOrigWps){
                _edgeDragEdge.waypoints = _edgeDragOrigWps.map(function(wp){ return {x: wp.x + dx, y: wp.y + dy}; });
            }
            drawEdges();
        }
        // 라인 끝점 조절 드래그
        if(_edgeEndDrag && _edgeEndDragEdge){
            var rect = worldEl.getBoundingClientRect();
            var cx = (e.clientX - rect.left) / zoom;
            var cy = (e.clientY - rect.top) / zoom;
            if(_edgeEndDragEnd === 'start'){
                _edgeEndDragEdge.x1 = cx;
                _edgeEndDragEdge.y1 = cy;
            } else {
                _edgeEndDragEdge.x2 = cx;
                _edgeEndDragEdge.y2 = cy;
            }
            drawEdges();
        }
        // 꺾인선 관절 드래그 (3-joint: jx1, jy, jx2)
        if(_edgeJointDrag && _edgeJointDragEdge){
            var rect = worldEl.getBoundingClientRect();
            var cx = (e.clientX - rect.left) / zoom;
            var cy = (e.clientY - rect.top) / zoom;
            var eg = _edgeJointDragEdge;
            if(!eg.elbowJoints){
                var _mx2 = eg.elbowMidX;
                if(_mx2 === undefined){
                    if(eg.type==='standalone') _mx2 = (eg.x1+eg.x2)/2;
                    else {
                        var _se2=document.getElementById('nd-'+eg.source), _te2=document.getElementById('nd-'+eg.target);
                        if(_se2&&_te2){ var _pp2=getEdgePorts(_se2,_te2,eg); _mx2=(_pp2.sx+_pp2.tx)/2; } else _mx2=0;
                    }
                }
                var _sy3, _ty3;
                if(eg.type==='standalone'){ _sy3=eg.y1; _ty3=eg.y2; }
                else {
                    var _se3=document.getElementById('nd-'+eg.source), _te3=document.getElementById('nd-'+eg.target);
                    if(_se3&&_te3){ var _pp3=getEdgePorts(_se3,_te3,eg); _sy3=_pp3.sy; _ty3=_pp3.ty; } else { _sy3=0; _ty3=0; }
                }
                eg.elbowJoints = {jx1:_mx2, jy:(_sy3+_ty3)/2, jx2:_mx2};
            }
            if(_edgeJointDragIdx===0) eg.elbowJoints.jx1 = cx;
            else if(_edgeJointDragIdx===1) eg.elbowJoints.jy = cy;
            else if(_edgeJointDragIdx===2) eg.elbowJoints.jx2 = cx;
            drawEdges();
        }
        // 웨이포인트 드래그
        if(_edgeWpDrag && _edgeWpDragEdge){
            var rect = worldEl.getBoundingClientRect();
            var cx = (e.clientX - rect.left) / zoom;
            var cy = (e.clientY - rect.top) / zoom;
            _edgeWpDragEdge.waypoints[_edgeWpDragIdx] = {x: cx, y: cy};
            drawEdges();
        }
    });
    document.addEventListener('mouseup', function(e){
        if(isPanning){
            isPanning = false;
            worldEl.classList.remove('grabbing');
        }
        // 라인 드래그 종료
        if(_edgeDragging){
            _edgeDragging = false;
            _edgeDragEdge = null;
        }
        // 라인 끝점 조절 종료 — 노드 위에 놓으면 재연결
        if(_edgeEndDrag){
            var eg = _edgeEndDragEdge;
            if(eg){
                var rect = worldEl.getBoundingClientRect();
                var dropX = (e.clientX - rect.left) / zoom;
                var dropY = (e.clientY - rect.top) / zoom;
                var hitNode = null;
                for(var ni = nodes.length - 1; ni >= 0; ni--){
                    var nd = nodes[ni];
                    var nel = document.getElementById('nd-'+nd.id);
                    if(!nel) continue;
                    var nx = nd.x, ny = nd.y;
                    var nw = nel.offsetWidth, nh = nel.offsetHeight;
                    if(dropX >= nx && dropX <= nx+nw && dropY >= ny && dropY <= ny+nh){
                        hitNode = nd; break;
                    }
                }
                if(hitNode){
                    // 반대쪽 끝도 노드 위인지 확인
                    var otherEnd = _edgeEndDragEnd === 'start' ? 'end' : 'start';
                    var otherX = otherEnd === 'start' ? eg.x1 : eg.x2;
                    var otherY = otherEnd === 'start' ? eg.y1 : eg.y2;
                    var otherNode = null;
                    for(var oi = nodes.length - 1; oi >= 0; oi--){
                        var ond = nodes[oi];
                        var onel = document.getElementById('nd-'+ond.id);
                        if(!onel) continue;
                        if(otherX >= ond.x && otherX <= ond.x+onel.offsetWidth && otherY >= ond.y && otherY <= ond.y+onel.offsetHeight){
                            otherNode = ond; break;
                        }
                    }
                    if(otherNode && otherNode.id !== hitNode.id){
                        // 두 노드 연결
                        if(_edgeEndDragEnd === 'start'){
                            eg.source = hitNode.id; eg.target = otherNode.id;
                        } else {
                            eg.source = otherNode.id; eg.target = hitNode.id;
                        }
                        eg.type = 'port';
                        delete eg.x1; delete eg.y1; delete eg.x2; delete eg.y2;
                    } else if(!otherNode){
                        // 한쪽만 노드 위 — standalone 유지
                    }
                }
                drawEdges();
                selectEdge(eg);
            }
            _edgeEndDrag = false;
            _edgeEndDragEdge = null;
            _edgeEndDragEnd = '';
        }
        // 꺾인선 관절 드래그 종료
        if(_edgeJointDrag){
            _edgeJointDrag = false;
            _edgeJointDragEdge = null;
            _edgeJointDragIdx = 0;
        }
        // 웨이포인트 드래그 종료
        if(_edgeWpDrag){
            _edgeWpDrag = false;
            _edgeWpDragEdge = null;
            _edgeWpDragIdx = -1;
        }
        if(_lineDrawing){
            _lineDrawing = false;
            if(_linePreview && _linePreview.parentElement) _linePreview.remove();
            _linePreview = null;
            worldEl.classList.remove('wf-connecting');
            var _prevTgt = worldEl.querySelector('.wf-connect-target');
            if(_prevTgt) _prevTgt.classList.remove('wf-connect-target');
            var _vpRect = viewportEl.getBoundingClientRect();
            var lx2 = (e.clientX - _vpRect.left - panX) / zoom;
            var ly2 = (e.clientY - _vpRect.top  - panY) / zoom;
            var ldx = lx2 - _lineStartX, ldy = ly2 - _lineStartY;
            if(Math.sqrt(ldx*ldx + ldy*ldy) > 10){
                pushUndo();
                var _startNode = _lineStartNodeId || null;
                var _endNode = null;
                // 스냅 헬퍼로 끝 노드 탐색 (반경 60px)
                var _snapEndResult = findSnapTarget(lx2, ly2, 60, _startNode);
                if(_snapEndResult) _endNode = _snapEndResult.node.id;
                // 시작 노드도 스냅 헬퍼로 재확인
                if(!_startNode){
                    var _snapStartResult = findSnapTarget(_lineStartX, _lineStartY, 60, null);
                    if(_snapStartResult) _startNode = _snapStartResult.node.id;
                }
                var _lineStyle = _pendingLineStyle || 'elbow_arrow';
                var newEdge;
                if(_startNode && _endNode && _startNode !== _endNode){
                    var _dupChk = edges.some(function(eg){ return (eg.source===_startNode && eg.target===_endNode) || (eg.source===_endNode && eg.target===_startNode); });
                    if(!_dupChk){
                        newEdge = {
                            id:'edge_'+_startNode+'_'+_endNode, source:_startNode, target:_endNode,
                            style:_lineStyle, color:'#1a1a1a', width:2, opacity:1, dash:'solid',
                            startMarker:'none', endMarker: _lineStyle.indexOf('arrow')>=0?'arrow':'none', label:''
                        };
                    }
                }
                if(!newEdge){
                    var edgeId = 'edge_s' + (++nextId);
                    newEdge = {
                        id: edgeId, type:'standalone',
                        x1:_lineStartX, y1:_lineStartY, x2:lx2, y2:ly2,
                        style: _lineStyle,
                        color:'#1a1a1a', width:2, opacity:1, dash:'solid',
                        startMarker:'none', endMarker: _lineStyle.indexOf('arrow')>=0 ? 'arrow' : 'none',
                        label:''
                    };
                }
                edges.push(newEdge);
                drawEdges();
                selectEdge(newEdge);
                scheduleLivePush();
            }
            _lineStartNodeId = null;
            setTool('select');
        }
        if(isDrawing){
            isDrawing = false;
            var rect = worldEl.getBoundingClientRect();
            var cx = (e.clientX - rect.left) / zoom;
            var cy = (e.clientY - rect.top) / zoom;
            var x = Math.min(drawStartX, cx);
            var y = Math.min(drawStartY, cy);
            var w = Math.abs(cx - drawStartX);
            var h = Math.abs(cy - drawStartY);

            if(drawPreview && drawPreview.parentElement) drawPreview.remove();
            drawPreview = null;
            if(drawSizeEl && drawSizeEl.parentElement) drawSizeEl.remove();
            drawSizeEl = null;

            var nt = NODE_TYPES.find(function(t){ return t.type === drawTool; });
            if(w < 20 || h < 20){
                w = nt ? nt.w : 160;
                h = nt ? nt.h : 56;
                x = drawStartX - w/2;
                y = drawStartY - h/2;
            }
            var node = addNode(drawTool, x, y);
            if(node.size){
                node.size.w = Math.max(60, w);
                node.size.h = Math.max(40, h);
                var el = document.getElementById('nd-'+node.id);
                if(el){
                    el.style.width  = node.size.w + 'px';
                    el.style.height = node.size.h + 'px';
                }
                updateSizeBadge(node);
            }
            setTool('select');
            drawTool = '';
        }
        if(_marquee && _marquee.active){
            _marquee.active = false;
            var rect = worldEl.getBoundingClientRect();
            var cx = (e.clientX - rect.left) / zoom;
            var cy = (e.clientY - rect.top) / zoom;
            var mx1 = Math.min(_marquee.startX, cx);
            var my1 = Math.min(_marquee.startY, cy);
            var mx2 = Math.max(_marquee.startX, cx);
            var my2 = Math.max(_marquee.startY, cy);
            if(_marquee.el && _marquee.el.parentElement) _marquee.el.remove();
            _marquee = null;
            if(mx2 - mx1 > 5 || my2 - my1 > 5){
                var hits = [];
                nodes.forEach(function(n){
                    var nel = document.getElementById('nd-'+n.id);
                    if(!nel) return;
                    var nx = n.position.x, ny = n.position.y;
                    var nw = nel.offsetWidth, nh = nel.offsetHeight;
                    if(nx + nw > mx1 && nx < mx2 && ny + nh > my1 && ny < my2){
                        hits.push(n);
                    }
                });
                // 엣지도 마퀴 영역에 포함되면 선택
                var edgeHits = [];
                edges.forEach(function(eg){
                    var ex1, ey1, ex2, ey2;
                    if(eg.type === 'standalone'){
                        ex1 = eg.x1; ey1 = eg.y1; ex2 = eg.x2; ey2 = eg.y2;
                    } else {
                        var se = document.getElementById('nd-'+eg.source);
                        var te = document.getElementById('nd-'+eg.target);
                        if(!se || !te) return;
                        var _ep = getEdgePorts(se, te, eg);
                        ex1 = _ep.sx; ey1 = _ep.sy; ex2 = _ep.tx; ey2 = _ep.ty;
                    }
                    // 시작점 또는 끝점이 영역 내에 있으면 선택
                    var s_in = ex1 >= mx1 && ex1 <= mx2 && ey1 >= my1 && ey1 <= my2;
                    var e_in = ex2 >= mx1 && ex2 <= mx2 && ey2 >= my1 && ey2 <= my2;
                    if(s_in || e_in) edgeHits.push(eg);
                });
                _selectedEdges = edgeHits;
                if(hits.length > 0 || edgeHits.length > 0){
                    _selectedNodes = hits;
                    hits.forEach(function(n){
                        var nel = document.getElementById('nd-'+n.id);
                        if(nel) nel.classList.add('selected');
                    });
                    if(hits.length === 1 && edgeHits.length === 0){
                        selectedNode = hits[0];
                        selectNode(hits[0]);
                    } else if(hits.length > 0) {
                        selectedNode = hits[0];
                        positionCtxBar(null);
                        positionNoteBar(null);
                        positionTblBar(null);
                        positionErTblBar(null);
                    }
                    // 선택된 엣지 시각적 표시를 위해 다시 그리기
                    if(edgeHits.length > 0) drawEdges();
                }
            }
        }
    });

    // 드래그 앤 드롭 (툴바 → 캔버스)
    var dragType = null;
    toolbar.addEventListener('dragstart', function(e){
        var btn = e.target.closest('.wf-tool-btn');
        if(!btn) return;
        var toolId = btn.getAttribute('data-tool');
        var nt = NODE_TYPES.find(function(t){ return t.type === toolId; });
        if(!nt) return;
        dragType = toolId;
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', toolId);
    });
    var nodeToolBtns = toolbar.querySelectorAll('.wf-tool-btn');
    for(var i=0; i<nodeToolBtns.length; i++){
        var tid = nodeToolBtns[i].getAttribute('data-tool');
        if(NODE_TYPES.find(function(t){return t.type===tid;})){
            nodeToolBtns[i].setAttribute('draggable', 'true');
        }
    }
    worldEl.addEventListener('dragover', function(e){ e.preventDefault(); e.dataTransfer.dropEffect='copy'; worldEl.classList.add('drag-over'); });
    worldEl.addEventListener('dragleave', function(){ worldEl.classList.remove('drag-over'); });
    worldEl.addEventListener('drop', function(e){
        e.preventDefault();
        worldEl.classList.remove('drag-over');
        if(!dragType) return;
        var rect = worldEl.getBoundingClientRect();
        var x = (e.clientX - rect.left) / zoom;
        var y = (e.clientY - rect.top) / zoom;
        addNode(dragType, x - 70, y - 28);
        dragType = null;
    });

    // ── 키보드 단축키 ──
    function onKeyDown(e){
        if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
        if(e.target.getAttribute('contenteditable') === 'true') return;

        var ctrl = e.ctrlKey || e.metaKey;

        // Ctrl+Z: 실행취소
        if(ctrl && !e.shiftKey && (e.key === 'z' || e.key === 'Z')){
            e.preventDefault();
            popUndo();
            return;
        }

        // Ctrl+C: 복사
        if(ctrl && !e.shiftKey && (e.key === 'c' || e.key === 'C')){
            e.preventDefault();
            if(selectedNode) doCopyNode(selectedNode);
            return;
        }
        // Ctrl+V: 붙여넣기
        if(ctrl && !e.shiftKey && (e.key === 'v' || e.key === 'V')){
            e.preventDefault();
            doPasteNode();
            return;
        }
        // Ctrl+I: 요소정보
        if(ctrl && !e.shiftKey && (e.key === 'i' || e.key === 'I')){
            e.preventDefault();
            if(selectedNode) showElemInfo(selectedNode);
            return;
        }
        // Ctrl+]: 위로 한층
        if(ctrl && !e.shiftKey && e.key === ']'){
            e.preventDefault();
            if(selectedNode) doLayerMove(selectedNode, 'up');
            return;
        }
        // Ctrl+[: 아래로 한층
        if(ctrl && !e.shiftKey && e.key === '['){
            e.preventDefault();
            if(selectedNode) doLayerMove(selectedNode, 'down');
            return;
        }
        // Ctrl+Shift+]: 맨 앞으로
        if(ctrl && e.shiftKey && e.key === ']'){
            e.preventDefault();
            if(selectedNode) doLayerMove(selectedNode, 'front');
            return;
        }
        // Ctrl+Shift+[: 맨 뒤로
        if(ctrl && e.shiftKey && e.key === '['){
            e.preventDefault();
            if(selectedNode) doLayerMove(selectedNode, 'back');
            return;
        }
        // Ctrl+S: 저장
        if(ctrl && (e.key === 's' || e.key === 'S')){
            e.preventDefault();
            doSave();
            return;
        }

        // Shift+2: 줌인
        if(e.shiftKey && e.key === '@'){
            e.preventDefault();
            doZoomIn();
            return;
        }

        // 단일키 단축키 (ctrl/shift 없을 때만)
        if(!ctrl && !e.shiftKey && !e.altKey){
            if(e.key === 'v' || e.key === 'V') setTool('select');
            if(e.key === 'c' || e.key === 'C') setTool('connect');
            if(e.key === 'l' || e.key === 'L') toggleLinesPanel();
            if(e.key === 'r' || e.key === 'R') setTool('process');
            if(e.key === 'f' || e.key === 'F') setTool('frame');
            if(e.key === 't' || e.key === 'T') setTool('title');
            if(e.key === 'n' || e.key === 'N') setTool('note');
            if(e.key === 'p' || e.key === 'P'){ currentTool==='pen' ? exitDrawMode() : enterDrawMode(); }
        }

        // Tab: 마인드맵 하위 추가
        if(e.key === 'Tab' && _mmSelectedBranch){
            e.preventDefault();
            var mmN = nodes.find(function(n){ return n.id === _mmSelectedBranch.nodeId; });
            if(mmN) mmAddChild(mmN, _mmSelectedBranch.branchId);
            return;
        }
        // Enter: 마인드맵 형제 추가
        if(e.key === 'Enter' && _mmSelectedBranch && !ctrl){
            e.preventDefault();
            var mmN2 = nodes.find(function(n){ return n.id === _mmSelectedBranch.nodeId; });
            if(mmN2) mmAddSibling(mmN2, _mmSelectedBranch.branchId);
            return;
        }

        if(e.key === 'Delete' || e.key === 'Backspace'){
            pushUndo();
            if(_mmSelectedBranch){
                var mmNode = nodes.find(function(n){ return n.id === _mmSelectedBranch.nodeId; });
                if(mmNode) mmDeleteBranch(mmNode, _mmSelectedBranch.branchId);
            } else if(_selectedNodes.length > 1 || _selectedEdges.length > 0){
                var toDelete = _selectedNodes.slice();
                _selectedNodes = [];
                toDelete.forEach(function(n){
                    var idx = nodes.indexOf(n);
                    if(idx >= 0) nodes.splice(idx, 1);
                    var nel = document.getElementById('nd-'+n.id);
                    if(nel) nel.remove();
                    edges = edges.filter(function(eg){ return eg.source !== n.id && eg.target !== n.id; });
                });
                // 마퀴 선택된 엣지 삭제
                _selectedEdges.forEach(function(se){
                    var sei = edges.indexOf(se);
                    if(sei >= 0) edges.splice(sei, 1);
                });
                _selectedEdges = [];
                drawEdges();
                selectNode(null);
                deselectEdge();
                scheduleLivePush();
            } else if(selectedNode){
                deleteNode(selectedNode);
            } else if(_selectedEdge){
                var _dei = edges.indexOf(_selectedEdge);
                if(_dei >= 0) edges.splice(_dei, 1);
                deselectEdge();
                drawEdges();
                scheduleLivePush();
            }
        }
        if(e.key === 'Escape'){
            hideCtxMenu();
            selectNode(null);
            setTool('select');
        }

        // 방향키: 노드 선택 시 노드 이동, 아니면 캔버스 패닝
        var PAN_STEP = 60, NUDGE = e.shiftKey ? 10 : 1;
        if(e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown'){
            e.preventDefault();
            var dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
            var dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
            if(selectedNode || _selectedNodes.length > 1){
                pushUndo();
                var targets = _selectedNodes.length > 1 ? _selectedNodes : [selectedNode];
                targets.forEach(function(n){
                    n.position.x += dx * NUDGE;
                    n.position.y += dy * NUDGE;
                    var nel = document.getElementById('nd-'+n.id);
                    if(nel){ nel.style.left = n.position.x+'px'; nel.style.top = n.position.y+'px'; }
                });
                drawEdges();
                scheduleLivePush();
            } else {
                panX -= dx * PAN_STEP;
                panY -= dy * PAN_STEP;
                applyTransform();
            }
        }
    }
    document.addEventListener('keydown', onKeyDown);

    // ── ESC 시 속성패널 닫기 ──
    document.getElementById('wfe-props-close').addEventListener('click', function(){
        selectNode(null);
    });

    // ═══ 노드 CRUD ═══

    function addNode(type, x, y){
        pushUndo();
        var nt = NODE_TYPES.find(function(t){ return t.type===type; }) || NODE_TYPES[1];
        var w = nt.w || 160, h = nt.h || 56;
        // 메모: 스티커 스타일 적용
        if(type === 'note' && _pendingNoteStyle){
            if(_pendingNoteStyle.ratio === 'rect'){
                w = 280; h = 140;
            } else {
                w = 180; h = 180;
            }
        }
        var node = {
            id: 'node_'+nextId++,
            type: type,
            position: {x: x, y: y},
            size: {w: w, h: h},
            _meta: {
                created_at: new Date().toISOString(),
                created_by: getCurrentUserName() || '(알 수 없음)',
                modified_at: new Date().toISOString(),
                modified_by: getCurrentUserName() || '(알 수 없음)'
            },
            data: {
                type: type,
                name: nt.label,
                role: '',
                department: '',
                sla: '',
                description: '',
                nextCondition: '',
                bgColor: '',
                borderColor: '',
                textColor: '',
                fitContent: false,
                padding: 20,
                // 메모 전용
                noteTexture: '',
                noteTextureBgSize: '',
                showSignature: false,
                showUser: false,
                showDate: false,
                fontFamily: '',
                fontSize: 13,
                fontBold: false,
                fontColor: '',
                textAlign: 'left',
            }
        };
        // 메모: 스티커 스타일 색상 적용
        if(type === 'note' && _pendingNoteStyle){
            node.data.bgColor = _pendingNoteStyle.bg;
            node.data.borderColor = _pendingNoteStyle.border;
            node.data.textColor = _pendingNoteStyle.text;
            node.data.noteTexture = _pendingNoteStyle.texture || '';
            node.data.noteTextureBgSize = _pendingNoteStyle.textureBgSize || '';
        }
        // 표: 행/열/셀 데이터
        if(type === 'table' && _pendingTable){
            node.data.tableRows = _pendingTable.rows;
            node.data.tableCols = _pendingTable.cols;
            node.data.tableCells = [];
            for(var tri=0; tri<_pendingTable.rows; tri++){
                var row = [];
                for(var tci=0; tci<_pendingTable.cols; tci++){
                    row.push('');
                }
                node.data.tableCells.push(row);
            }
            w = Math.max(400, _pendingTable.cols * 100);
            h = Math.max(200, _pendingTable.rows * 36);
            node.size.w = w; node.size.h = h;
        }
        // 마인드맵: 트리 구조 초기화
        if(type === 'mindmap'){
            var mmStyle = MINDMAP_STYLES.find(function(s){ return s.id === _pendingMmStyle; }) || MINDMAP_STYLES[0];
            node.data.mmStyle = mmStyle.id;
            node.data.mmLayout = _pendingMmLayout || 'horizontal';
            node.data._mmNextId = 5;
            node.data.mmTree = {
                id:'mm_0', text:'메인 주제',
                children:[
                    {id:'mm_1', text:'브랜치 주제', children:[]},
                    {id:'mm_2', text:'브랜치 주제', children:[]},
                    {id:'mm_3', text:'브랜치 주제', children:[
                        {id:'mm_4', text:'서브 주제', children:[]},
                        {id:'mm_5', text:'서브 주제', children:[]}
                    ]}
                ]
            };
            node.size.w = 500; node.size.h = 300;
        }
        // ER 테이블: 컬럼 초기화
        if(type === 'er_table'){
            node.data.erTableName = 'table_name';
            node.data.erColumns = [
                {name:'id',   type:'INT',         pk:true,  nn:true,  uq:false, ai:true},
                {name:'name', type:'VARCHAR(45)',  pk:false, nn:false, uq:false, ai:false},
            ];
            node.data.erShowIndexes = true;
        }
        nodes.push(node);
        renderNodeEl(node);
        if(type === 'note') applyNodeBgColor(node);
        selectNode(node);
        scheduleLivePush();
        return node;
    }

    function updateSizeBadge(node){
        var badge = document.querySelector('#nd-'+node.id+' .wf-size-badge');
        if(badge && node.size){
            badge.textContent = Math.round(node.size.w)+' x '+Math.round(node.size.h);
        }
    }

    /* ── 사이즈 배지 더블클릭 → 인라인 크기 편집 ── */
    function openSizeBadgeEdit(node, badgeEl){
        if(!node || !node.size) return;
        var existing = badgeEl.parentElement.querySelector('.wf-size-badge-edit');
        if(existing) return;
        badgeEl.style.display = 'none';
        var box = document.createElement('div');
        box.className = 'wf-size-badge-edit';
        var inpW = document.createElement('input');
        inpW.type = 'number'; inpW.min = '40'; inpW.value = Math.round(node.size.w);
        var sep = document.createElement('span');
        sep.textContent = '×';
        var inpH = document.createElement('input');
        inpH.type = 'number'; inpH.min = '40'; inpH.value = Math.round(node.size.h);
        box.appendChild(inpW); box.appendChild(sep); box.appendChild(inpH);
        badgeEl.parentElement.appendChild(box);
        inpW.focus(); inpW.select();

        function apply(){
            var nw = Math.max(40, parseInt(inpW.value)||40);
            var nh = Math.max(40, parseInt(inpH.value)||40);
            node.size.w = nw; node.size.h = nh;
            var el = document.getElementById('nd-'+node.id);
            if(el){ el.style.width = nw+'px'; el.style.height = nh+'px'; }
            updateSizeBadge(node);
            drawEdges();
            // 속성 패널 너비/높이 입력도 동기화
            var propSizes = propForm.querySelectorAll('.wf-prop-size');
            for(var i=0;i<propSizes.length;i++){
                if(propSizes[i].getAttribute('data-dim')==='w') propSizes[i].value = nw;
                if(propSizes[i].getAttribute('data-dim')==='h') propSizes[i].value = nh;
            }
        }
        function close(){
            apply();
            if(box.parentElement) box.parentElement.removeChild(box);
            badgeEl.style.display = '';
        }
        function onKey(e){
            if(e.key==='Enter'){ e.preventDefault(); close(); }
            if(e.key==='Escape'){ e.preventDefault(); if(box.parentElement) box.parentElement.removeChild(box); badgeEl.style.display=''; }
            e.stopPropagation();
        }
        inpW.addEventListener('keydown', onKey);
        inpH.addEventListener('keydown', onKey);
        inpW.addEventListener('mousedown', function(e){ e.stopPropagation(); });
        inpH.addEventListener('mousedown', function(e){ e.stopPropagation(); });
        setTimeout(function(){
            document.addEventListener('mousedown', function handler(e){
                if(box.contains(e.target)) return;
                document.removeEventListener('mousedown', handler);
                close();
            });
        }, 0);
    }

    canvasArea.addEventListener('dblclick', function(e){
        var badge = e.target.closest('.wf-size-badge');
        if(!badge) return;
        var shapeEl = badge.closest('.wf-shape');
        if(!shapeEl) return;
        var nid = shapeEl.id.replace('nd-','');
        var node = nodes.find(function(n){ return n.id === nid; });
        if(node) openSizeBadgeEdit(node, badge);
    });

    var PRESET_COLORS = [
        '#F4845F','#F9A826','#FDD835','#66BB6A','#26A69A',
        '#29B6F6','#42A5F5','#5C6BC0','#AB47BC','#EC407A',
        '#EF5350','#FF7043','#8D6E63','#78909C','#B0BEC5',
        '#FFE0B2','#C8E6C9','#B3E5FC','#D1C4E9','#F8BBD0',
        '#FFCCBC','#DCEDC8','#B2EBF2','#E1BEE7','#F0F4C3',
    ];

    // ── 도구바 고정 드롭존 ──
    var pinZone = document.createElement('div');
    pinZone.className = 'wf-ctx-pin-zone';
    pinZone.style.display = 'none';
    pinZone.innerHTML = '<span>여기까지 끌어다 놓으면 도구바 고정하기</span>';
    document.getElementById('wfe-canvas-area').appendChild(pinZone);

    // ── 플로팅 컨텍스트 툴바 ──
    var ctxBar = document.createElement('div');
    ctxBar.className = 'wf-ctx-toolbar';
    ctxBar.style.display = 'none';
    var ctxPinned = false;   // 고정 여부
    var ctxDragOfs = null;   // 드래그 오프셋

    ctxBar.innerHTML = ''
        // 그립 핸들
        + '<div class="wf-ctx-grip" title="드래그하여 이동">'
        + '  <svg width="8" height="14" viewBox="0 0 8 14"><circle cx="2" cy="2" r="1.2" fill="#aaa"/><circle cx="6" cy="2" r="1.2" fill="#aaa"/><circle cx="2" cy="7" r="1.2" fill="#aaa"/><circle cx="6" cy="7" r="1.2" fill="#aaa"/><circle cx="2" cy="12" r="1.2" fill="#aaa"/><circle cx="6" cy="12" r="1.2" fill="#aaa"/></svg>'
        + '</div>'
        + '<span class="wf-ctx-sep"></span>'
        // 색상 버튼
        + '<button class="wf-ctx-btn wf-ctx-color-btn" data-act="color" title="컨테이너 색상">'
        + '  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8.67,9.732c-2.778,2.815-4.463,4.815-5.404,6.022-.805,1.033-.996,2.374-.592,3.515l-1.166,1.175c-.583,.588-.58,1.538,.008,2.121,.292,.291,.674,.436,1.057,.436,.386,0,.771-.148,1.064-.443l1.185-1.194c.363,.119,.744,.179,1.128,.179,.796,0,1.602-.258,2.271-.779,1.208-.941,3.211-2.629,6.037-5.418-.942-.552-2.041-1.345-3.156-2.468-1.105-1.112-1.886-2.206-2.432-3.146Z"/><path d="M22.115,2.479c-.099-.128-.202-.245-.305-.349-.103-.103-.219-.206-.347-.308-1.638-1.288-4.066-1.036-5.519,.562l-1.379,1.469c-1.076-.275-2.876-.255-4.871,1.753-.237,.239-.335,.584-.257,.912,.023,.099,.596,2.445,3.085,4.952,2.489,2.508,4.821,3.086,4.919,3.11,.075,.018,.151,.027,.226,.027,.257,0,.506-.102,.691-.288,2.015-2.03,2.027-3.836,1.747-4.914l1.439-1.368c1.596-1.471,1.847-3.912,.571-5.556Z"/></svg><span class="wf-ctx-color-dot"></span>'
        + '</button>'
        + '<span class="wf-ctx-sep"></span>'
        // 내용에 따라 적용하기
        + '<button class="wf-ctx-btn" data-act="fit" title="내용에 따라 적용하기">'
        + '  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>'
        + '</button>'
        + '<span class="wf-ctx-sep"></span>'
        // 크기 표시
        + '<span class="wf-ctx-size" data-act="size" title="크기 지정"></span>'
        + '<span class="wf-ctx-sep"></span>'
        // 복제
        + '<button class="wf-ctx-btn" data-act="duplicate" title="복제"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="m20 20h-20v-17a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3zm2-15.816v17.816h-18v2h20v-17a3 3 0 0 0 -2-2.816z"/></svg></button>'
        // 삭제
        + '<button class="wf-ctx-btn" data-act="delete" title="삭제"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="m22,4h-4.101c-.465-2.279-2.484-4-4.899-4h-2c-2.414,0-4.434,1.721-4.899,4H2c-.552,0-1,.447-1,1s.448,1,1,1h.86l1.296,13.479c.248,2.578,2.388,4.521,4.977,4.521h5.727c2.593,0,4.733-1.947,4.978-4.528l1.276-13.472h.885c.552,0,1-.447,1-1s-.448-1-1-1Zm-11-2h2c1.302,0,2.402.839,2.816,2h-7.631c.414-1.161,1.514-2,2.816-2Zm4.707,14.293c.391.391.391,1.023,0,1.414-.195.195-.451.293-.707.293s-.512-.098-.707-.293l-2.293-2.293-2.293,2.293c-.195.195-.451.293-.707.293s-.512-.098-.707-.293c-.391-.391-.391-1.023,0-1.414l2.293-2.293-2.293-2.293c-.391-.391-.391-1.023,0-1.414s1.023-.391,1.414,0l2.293,2.293,2.293-2.293c.391-.391,1.023-.391,1.414,0s.391,1.023,0,1.414l-2.293,2.293,2.293,2.293Z"/></svg></button>';

    // ── 색상 팝오버 (색감, 질감, 테두리) ──
    var colorPop = document.createElement('div');
    colorPop.className = 'wf-ctx-popover wf-color-popover';
    colorPop.style.display = 'none';
    var cpHtml = '<div class="wf-pop-header"><span class="wf-pop-title">컨테이너 스타일</span></div>'
        + '<div class="wf-pop-body">'
        // 색감 (fill color)
        + '<div class="wf-pop-section-title">색감</div>'
        + '<div class="wf-color-grid">';
    PRESET_COLORS.forEach(function(c){
        cpHtml += '<button class="wf-color-swatch" data-color="'+c+'" style="background:'+c+'"></button>';
    });
    cpHtml += '</div>'
        + '<div class="wf-color-custom"><input type="color" class="wf-color-custom-input" id="wfe-custom-color" value="#ffffff"><span class="wf-color-hex" id="wfe-color-hex">#ffffff</span></div>'
        // 질감 (texture)
        + '<div class="wf-pop-section-title" style="margin-top:8px;">질감</div>'
        + '<div class="wf-texture-grid" id="wfe-texture-grid">'
        + '  <button class="wf-texture-opt active" data-tex="none" title="없음"><span style="background:#f3f4f6;width:100%;height:100%;display:block;border-radius:4px;"></span></button>'
        + '  <button class="wf-texture-opt" data-tex="stripe" title="줄무늬"><span style="background:repeating-linear-gradient(45deg,transparent,transparent 3px,rgba(0,0,0,0.08) 3px,rgba(0,0,0,0.08) 6px);width:100%;height:100%;display:block;border-radius:4px;"></span></button>'
        + '  <button class="wf-texture-opt" data-tex="dots" title="점무늬"><span style="background:radial-gradient(circle,rgba(0,0,0,0.10) 1px,transparent 1px);background-size:6px 6px;width:100%;height:100%;display:block;border-radius:4px;"></span></button>'
        + '  <button class="wf-texture-opt" data-tex="grid" title="격자"><span style="background:linear-gradient(rgba(0,0,0,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,0.06) 1px,transparent 1px);background-size:8px 8px;width:100%;height:100%;display:block;border-radius:4px;"></span></button>'
        + '  <button class="wf-texture-opt" data-tex="cross" title="크로스"><span style="background:repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(0,0,0,0.06) 4px,rgba(0,0,0,0.06) 5px),repeating-linear-gradient(-45deg,transparent,transparent 4px,rgba(0,0,0,0.06) 4px,rgba(0,0,0,0.06) 5px);width:100%;height:100%;display:block;border-radius:4px;"></span></button>'
        + '</div>'
        // 구분선
        + '<div class="wf-pop-divider"></div>'
        // 테두리 스타일
        + '<div class="wf-pop-section-title">테두리 스타일</div>'
        + '<div class="wf-border-style-row" id="wfe-border-style">'
        + '  <button class="wf-bdr-opt active" data-bs="solid" title="실선"><svg width="28" height="8"><line x1="0" y1="4" x2="28" y2="4" stroke="#374151" stroke-width="2"/></svg></button>'
        + '  <button class="wf-bdr-opt" data-bs="dashed" title="파선"><svg width="28" height="8"><line x1="0" y1="4" x2="28" y2="4" stroke="#374151" stroke-width="2" stroke-dasharray="6 3"/></svg></button>'
        + '  <button class="wf-bdr-opt" data-bs="dotted" title="점선"><svg width="28" height="8"><line x1="0" y1="4" x2="28" y2="4" stroke="#374151" stroke-width="2" stroke-dasharray="2 3"/></svg></button>'
        + '  <button class="wf-bdr-opt" data-bs="none" title="없음"><svg width="28" height="8"><line x1="0" y1="4" x2="28" y2="4" stroke="#d1d5db" stroke-width="1" stroke-dasharray="2 2"/></svg></button>'
        + '</div>'
        // 테두리 두께
        + '<div class="wf-pop-row" style="margin-top:8px;"><span class="wf-pop-label">테두리 두께</span>'
        + '  <input type="range" class="wf-bdr-range" id="wfe-border-width" min="0" max="8" step="1" value="1">'
        + '  <span class="wf-bdr-val" id="wfe-border-width-val">1px</span>'
        + '</div>'
        // 테두리 색깔
        + '<div class="wf-pop-row"><span class="wf-pop-label">테두리 색깔</span>'
        + '  <input type="color" class="wf-bdr-color-input" id="wfe-border-color" value="#e5e7eb">'
        + '  <span class="wf-bdr-color-hex" id="wfe-border-color-hex">#e5e7eb</span>'
        + '</div>'
        // 테두리 불투명
        + '<div class="wf-pop-row"><span class="wf-pop-label">테두리 불투명</span>'
        + '  <input type="range" class="wf-bdr-range" id="wfe-border-opacity" min="0" max="100" step="5" value="100">'
        + '  <span class="wf-bdr-val" id="wfe-border-opacity-val">100%</span>'
        + '</div>'
        + '</div>';
    colorPop.innerHTML = cpHtml;
    ctxBar.appendChild(colorPop);

    // ── 내용에 따라 적용하기 팝오버 ──
    var fitPop = document.createElement('div');
    fitPop.className = 'wf-ctx-popover wf-fit-popover';
    fitPop.style.display = 'none';
    fitPop.innerHTML = ''
        + '<div class="wf-pop-header"><span class="wf-pop-title">내용에 따라 적용하기</span>'
        + '  <label class="wf-toggle"><input type="checkbox" id="wfe-fit-toggle"><span class="wf-toggle-track"><span class="wf-toggle-thumb"></span></span></label>'
        + '</div>'
        + '<div class="wf-pop-body">'
        + '  <div class="wf-pop-row"><span class="wf-pop-label">여백</span>'
        + '    <span class="wf-pop-copy-btn" id="wfe-fit-copy" title="복사">&#x2398;</span>'
        + '    <div class="wf-pop-num-wrap"><span class="wf-pop-num-icon">&#x25A3;</span><input type="number" class="wf-pop-num" id="wfe-fit-padding" value="20" min="0" max="200"></div>'
        + '  </div>'
        + '</div>';
    ctxBar.appendChild(fitPop);

    // ── 크기 팝오버 ──
    var sizePop = document.createElement('div');
    sizePop.className = 'wf-ctx-popover wf-size-popover';
    sizePop.style.display = 'none';
    sizePop.innerHTML = ''
        + '<div class="wf-pop-header"><span class="wf-pop-title">크기 지정</span></div>'
        + '<div class="wf-pop-body">'
        + '  <div class="wf-pop-row"><span class="wf-pop-label">너비</span><input type="number" class="wf-pop-num" id="wfe-size-w" min="40"></div>'
        + '  <div class="wf-pop-row"><span class="wf-pop-label">높이</span><input type="number" class="wf-pop-num" id="wfe-size-h" min="40"></div>'
        + '</div>';
    ctxBar.appendChild(sizePop);

    worldEl.appendChild(ctxBar);

    // ── 메모 전용 서식 툴바 ──
    var noteBar = document.createElement('div');
    noteBar.className = 'wf-note-toolbar';
    noteBar.style.display = 'none';
    noteBar.innerHTML = ''
        // 글꼴
        + '<select class="wf-nt-font" id="wfe-nt-font" title="글꼴">'
        + '<option value="">기본</option>'
        + '<option value="\'Noto Sans KR\',sans-serif">Noto Sans KR</option>'
        + '<option value="\'Nanum Gothic\',sans-serif">나눔고딕</option>'
        + '<option value="\'Nanum Myeongjo\',serif">나눔명조</option>'
        + '<option value="monospace">고정폭</option>'
        + '<option value="\'IBM Plex Sans KR\',sans-serif">IBM Plex Sans</option>'
        + '</select>'
        + '<span class="wf-nt-sep"></span>'
        // 글자 크기
        + '<select class="wf-nt-fsize" id="wfe-nt-fsize" title="글자 크기">'
        + '<option value="11">11</option>'
        + '<option value="12">12</option>'
        + '<option value="13" selected>13</option>'
        + '<option value="14">14</option>'
        + '<option value="16">16</option>'
        + '<option value="18">18</option>'
        + '<option value="20">20</option>'
        + '<option value="24">24</option>'
        + '</select>'
        + '<span class="wf-nt-sep"></span>'
        // 굵기
        + '<button class="wf-nt-btn" id="wfe-nt-bold" title="굵게"><b>B</b></button>'
        + '<span class="wf-nt-sep"></span>'
        // 글자 색
        + '<label class="wf-nt-color-wrap" title="글자 색"><span class="wf-nt-color-dot" id="wfe-nt-colordot" style="background:#000000"></span><input type="color" id="wfe-nt-fontcolor" value="#000000" class="wf-nt-color-input"></label>'
        + '<span class="wf-nt-sep"></span>'
        // 정렬 (수평)
        + '<button class="wf-nt-btn" id="wfe-nt-al" data-align="left" title="왼쪽 정렬"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg></button>'
        + '<button class="wf-nt-btn" id="wfe-nt-ac" data-align="center" title="가운데 정렬"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg></button>'
        + '<button class="wf-nt-btn" id="wfe-nt-ar" data-align="right" title="오른쪽 정렬"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg></button>'
        + '<button class="wf-nt-btn" id="wfe-nt-aj" data-align="justify" title="양쪽 정렬"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>'
        + '<span class="wf-nt-sep"></span>'
        // 수직 정렬
        + '<button class="wf-nt-btn" id="wfe-nt-vt" data-valign="top" title="위쪽 정렬"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="3" x2="21" y2="3"/><line x1="12" y1="7" x2="12" y2="21"/><polyline points="8 11 12 7 16 11"/></svg></button>'
        + '<button class="wf-nt-btn" id="wfe-nt-vm" data-valign="middle" title="세로 가운데 정렬"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><polyline points="8 8 12 4 16 8"/><polyline points="8 16 12 20 16 16"/></svg></button>'
        + '<button class="wf-nt-btn" id="wfe-nt-vb" data-valign="bottom" title="아래쪽 정렬"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="21" x2="21" y2="21"/><line x1="12" y1="3" x2="12" y2="17"/><polyline points="8 13 12 17 16 13"/></svg></button>'
        + '<span class="wf-nt-sep"></span>'
        // 사용자/날짜 토글
        + '<button class="wf-nt-btn wf-nt-toggle" id="wfe-nt-user" title="사용자">사용자</button>'
        + '<button class="wf-nt-btn wf-nt-toggle" id="wfe-nt-date" title="날짜">날짜</button>';

    worldEl.appendChild(noteBar);

    function positionNoteBar(node){
        if(!node || (node.type !== 'note' && node.type !== 'title')){
            noteBar.style.display = 'none';
            return;
        }
        noteBar.style.display = 'flex';
        // 사용자/날짜 토글은 메모 전용
        var sigBtns = noteBar.querySelectorAll('#wfe-nt-user,#wfe-nt-date');
        for(var si=0;si<sigBtns.length;si++) sigBtns[si].style.display = node.type==='note' ? '' : 'none';
        // 사용자/날짜 앞의 구분선도 숨김
        var seps = noteBar.querySelectorAll('.wf-nt-sep');
        if(seps.length >= 5) seps[4].style.display = node.type==='note' ? '' : 'none';
        var x = node.position.x;
        var w = (node.size && node.size.w) || 180;
        var y = node.position.y;
        var h = (node.size && node.size.h) || 180;
        noteBar.style.left = (x + w/2) + 'px';
        noteBar.style.top  = (y + h + 8) + 'px';
    }
    function syncNoteBar(node){
        if(!node || (node.type !== 'note' && node.type !== 'title')) return;
        var d = node.data || {};
        document.getElementById('wfe-nt-font').value = d.fontFamily || '';
        document.getElementById('wfe-nt-fsize').value = String(d.fontSize || 13);
        document.getElementById('wfe-nt-bold').classList.toggle('active', !!d.fontBold);
        var curFc = d.fontColor || '#000000';
        document.getElementById('wfe-nt-fontcolor').value = curFc;
        document.getElementById('wfe-nt-colordot').style.background = curFc;
        var alBtns = noteBar.querySelectorAll('[data-align]');
        for(var ai=0;ai<alBtns.length;ai++) alBtns[ai].classList.toggle('active', alBtns[ai].getAttribute('data-align') === (d.textAlign||'left'));
        var vaBtns = noteBar.querySelectorAll('[data-valign]');
        for(var vi=0;vi<vaBtns.length;vi++) vaBtns[vi].classList.toggle('active', vaBtns[vi].getAttribute('data-valign') === (d.verticalAlign||'top'));
        if(node.type === 'note'){
            document.getElementById('wfe-nt-user').classList.toggle('active', !!d.showUser);
            document.getElementById('wfe-nt-date').classList.toggle('active', !!d.showDate);
        }
    }

    function _isNoteOrTitle(n){ return n && (n.type==='note'||n.type==='title'); }
    function _refreshFont(n){ if(n.type==='note') refreshNoteFontStyle(n); else refreshTitleFontStyle(n); }
    // 글꼴
    document.getElementById('wfe-nt-font').addEventListener('change', function(){
        if(!_isNoteOrTitle(selectedNode)) return;
        selectedNode.data.fontFamily = this.value;
        _refreshFont(selectedNode);
    });
    // 글자 크기
    document.getElementById('wfe-nt-fsize').addEventListener('change', function(){
        if(!_isNoteOrTitle(selectedNode)) return;
        selectedNode.data.fontSize = parseInt(this.value) || 13;
        _refreshFont(selectedNode);
    });
    // 굵기
    document.getElementById('wfe-nt-bold').addEventListener('click', function(){
        if(!_isNoteOrTitle(selectedNode)) return;
        selectedNode.data.fontBold = !selectedNode.data.fontBold;
        this.classList.toggle('active', selectedNode.data.fontBold);
        _refreshFont(selectedNode);
    });
    // 정렬
    var _ntAlignBtns = noteBar.querySelectorAll('[data-align]');
    for(var _ai=0;_ai<_ntAlignBtns.length;_ai++){
        (function(btn){
            btn.addEventListener('click', function(){
                if(!_isNoteOrTitle(selectedNode)) return;
                selectedNode.data.textAlign = btn.getAttribute('data-align');
                var alBtns = noteBar.querySelectorAll('[data-align]');
                for(var ai=0;ai<alBtns.length;ai++) alBtns[ai].classList.toggle('active', alBtns[ai] === btn);
                _refreshFont(selectedNode);
            });
        })(_ntAlignBtns[_ai]);
    }
    // 수직 정렬
    var _ntVAlignBtns = noteBar.querySelectorAll('[data-valign]');
    for(var _vi=0;_vi<_ntVAlignBtns.length;_vi++){
        (function(btn){
            btn.addEventListener('click', function(){
                if(!_isNoteOrTitle(selectedNode)) return;
                selectedNode.data.verticalAlign = btn.getAttribute('data-valign');
                var vaBtns = noteBar.querySelectorAll('[data-valign]');
                for(var vi=0;vi<vaBtns.length;vi++) vaBtns[vi].classList.toggle('active', vaBtns[vi] === btn);
                _refreshFont(selectedNode);
            });
        })(_ntVAlignBtns[_vi]);
    }
    // 글자 색상
    document.getElementById('wfe-nt-fontcolor').addEventListener('input', function(){
        if(!_isNoteOrTitle(selectedNode)) return;
        selectedNode.data.fontColor = this.value;
        document.getElementById('wfe-nt-colordot').style.background = this.value;
        _refreshFont(selectedNode);
    });
    // 사용자 토글
    document.getElementById('wfe-nt-user').addEventListener('click', function(){
        if(!selectedNode || selectedNode.type !== 'note') return;
        selectedNode.data.showUser = !selectedNode.data.showUser;
        this.classList.toggle('active', selectedNode.data.showUser);
        refreshNoteFooter(selectedNode);
    });
    // 날짜 토글
    document.getElementById('wfe-nt-date').addEventListener('click', function(){
        if(!selectedNode || selectedNode.type !== 'note') return;
        selectedNode.data.showDate = !selectedNode.data.showDate;
        this.classList.toggle('active', selectedNode.data.showDate);
        refreshNoteFooter(selectedNode);
    });

    // ══════════════════════════════════════════
    // ── 표 전용 서식/조작 툴바 (tblBar) ──
    // ══════════════════════════════════════════
    var tblBar = document.createElement('div');
    tblBar.className = 'wf-tbl-toolbar';
    tblBar.style.display = 'none';
    tblBar.innerHTML = ''
        // 글꼴
        + '<select class="wf-tb-font" id="wfe-tb-font" title="글꼴">'
        + '<option value="">기본</option>'
        + '<option value="\'Noto Sans KR\',sans-serif">Noto Sans KR</option>'
        + '<option value="\'Nanum Gothic\',sans-serif">나눔고딕</option>'
        + '<option value="\'Nanum Myeongjo\',serif">나눔명조</option>'
        + '<option value="monospace">고정폭</option>'
        + '</select>'
        + '<span class="wf-tb-sep"></span>'
        // 글자 크기
        + '<select class="wf-tb-fsize" id="wfe-tb-fsize" title="글자 크기">'
        + '<option value="11">11</option>'
        + '<option value="12" selected>12</option>'
        + '<option value="13">13</option>'
        + '<option value="14">14</option>'
        + '<option value="16">16</option>'
        + '<option value="18">18</option>'
        + '<option value="20">20</option>'
        + '</select>'
        + '<button class="wf-tb-btn" id="wfe-tb-bold" title="굵게"><b>B</b></button>'
        + '<span class="wf-tb-sep"></span>'
        // 텍스트 정렬
        + '<button class="wf-tb-btn" id="wfe-tb-al" data-talign="left" title="왼쪽 정렬"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg></button>'
        + '<button class="wf-tb-btn" id="wfe-tb-ac" data-talign="center" title="가운데 정렬"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg></button>'
        + '<button class="wf-tb-btn" id="wfe-tb-ar" data-talign="right" title="오른쪽 정렬"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg></button>'
        + '<span class="wf-tb-sep"></span>'
        // 글자색
        + '<button class="wf-tb-btn wf-tb-textcolor" id="wfe-tb-textcolor" title="글자 색상"><span class="wf-tb-txtdot" id="wfe-tb-txtdot" style="border-bottom:2px solid #1e293b;">A</span></button>'
        + '<span class="wf-tb-sep"></span>'
        // 셀 배경색
        + '<button class="wf-tb-btn wf-tb-cellcolor" id="wfe-tb-cellcolor" title="셀 색상"><span class="wf-tb-colordot" id="wfe-tb-colordot"></span></button>'
        + '<span class="wf-tb-sep"></span>'
        // 행/열 추가·삭제
        + '<button class="wf-tb-btn" id="wfe-tb-addrow" title="행 추가"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg><span style="font-size:10px;margin-left:2px;">행</span></button>'
        + '<button class="wf-tb-btn" id="wfe-tb-addcol" title="열 추가"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg><span style="font-size:10px;margin-left:2px;">열</span></button>'
        + '<button class="wf-tb-btn wf-tb-danger" id="wfe-tb-delrow" title="행 삭제"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="8" y1="12" x2="16" y2="12"/></svg><span style="font-size:10px;margin-left:2px;">행</span></button>'
        + '<button class="wf-tb-btn wf-tb-danger" id="wfe-tb-delcol" title="열 삭제"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="8" y1="12" x2="16" y2="12"/></svg><span style="font-size:10px;margin-left:2px;">열</span></button>'
        + '<span class="wf-tb-sep"></span>'
        // 행 높이
        + '<span class="wf-tb-label">행높이</span>'
        + '<input type="number" class="wf-tb-num" id="wfe-tb-rowh" min="20" max="200" value="32" title="행 높이(px)">'
        + '<span class="wf-tb-sep"></span>'
        // 균등분배
        + '<button class="wf-tb-btn" id="wfe-tb-eqrow" title="행 균등분배"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg><span style="font-size:10px;margin-left:2px;">행</span></button>'
        + '<button class="wf-tb-btn" id="wfe-tb-eqcol" title="열 균등분배"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="3" x2="6" y2="21"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="18" y1="3" x2="18" y2="21"/></svg><span style="font-size:10px;margin-left:2px;">열</span></button>'
        + '<span class="wf-tb-sep"></span>'
        // 정렬(오름/내림)
        + '<button class="wf-tb-btn" id="wfe-tb-sortasc" title="오름차순 정렬"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg></button>'
        + '<button class="wf-tb-btn" id="wfe-tb-sortdesc" title="내림차순 정렬"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="5 12 12 19 19 12"/></svg></button>';

    // 셀 색상 팝오버
    var tblColorPop = document.createElement('div');
    tblColorPop.className = 'wf-tbl-colorpop';
    tblColorPop.style.display = 'none';
    var _tblColorGrid = '';
    for(var _tci=0; _tci<PRESET_COLORS.length; _tci++){
        _tblColorGrid += '<span class="wf-tbl-colorsw" data-c="'+PRESET_COLORS[_tci]+'" style="background:'+PRESET_COLORS[_tci]+'"></span>';
    }
    _tblColorGrid += '<span class="wf-tbl-colorsw wf-tbl-colorsw-none" data-c="" title="없음">✕</span>';
    tblColorPop.innerHTML = '<div class="wf-tbl-colorswatches">'+_tblColorGrid+'</div>'
        + '<div style="margin-top:6px;display:flex;align-items:center;gap:6px;">'
        + '<input type="color" id="wfe-tb-customcolor" value="#ffffff" style="width:24px;height:24px;border:none;padding:0;cursor:pointer;">'
        + '<span id="wfe-tb-colorhex" style="font-size:11px;color:#6b7280;">#ffffff</span>'
        + '</div>';
    tblBar.appendChild(tblColorPop);

    // 글자색 팝오버
    var tblTxtColorPop = document.createElement('div');
    tblTxtColorPop.className = 'wf-tbl-txtcolorpop';
    tblTxtColorPop.style.display = 'none';
    var _tblTxtColorGrid = '';
    var _txtPresetColors = ['#1e293b','#374151','#6b7280','#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899','#ffffff','#000000'];
    for(var _ttci=0; _ttci<_txtPresetColors.length; _ttci++){
        _tblTxtColorGrid += '<span class="wf-tbl-colorsw" data-c="'+_txtPresetColors[_ttci]+'" style="background:'+_txtPresetColors[_ttci]+'"></span>';
    }
    _tblTxtColorGrid += '<span class="wf-tbl-colorsw wf-tbl-colorsw-none" data-c="" title="기본">✕</span>';
    tblTxtColorPop.innerHTML = '<div class="wf-tbl-colorswatches">'+_tblTxtColorGrid+'</div>'
        + '<div style="margin-top:6px;display:flex;align-items:center;gap:6px;">'
        + '<input type="color" id="wfe-tb-txtcustomcolor" value="#1e293b" style="width:24px;height:24px;border:none;padding:0;cursor:pointer;">'
        + '<span id="wfe-tb-txtcolorhex" style="font-size:11px;color:#6b7280;">#1e293b</span>'
        + '</div>';
    tblBar.appendChild(tblTxtColorPop);

    worldEl.appendChild(tblBar);

    // ── 표 툴바 위치/표시 ──
    function positionTblBar(node){
        if(!node || node.type !== 'table'){
            tblBar.style.display = 'none';
            _tblSelCells = [];
            return;
        }
        tblBar.style.display = 'flex';
        var x = node.position.x;
        var w = (node.size && node.size.w) || 400;
        var y = node.position.y;
        var h = (node.size && node.size.h) || 200;
        tblBar.style.left = (x + w/2) + 'px';
        tblBar.style.top  = (y + h + 14) + 'px';
    }

    // ── 표 데이터 보조 ──
    function ensureTblCellStyles(node){
        var d = node.data;
        if(!d.tableCellStyles){
            d.tableCellStyles = [];
            for(var r=0; r<d.tableRows; r++){
                var row = [];
                for(var c=0; c<d.tableCols; c++) row.push({bg:'', color:'', fontFamily:'', fontSize:0, fontBold:false, textAlign:''});
                d.tableCellStyles.push(row);
            }
        }
        // 행/열 크기 불일치 보정
        while(d.tableCellStyles.length < d.tableRows){
            var nr = [];
            for(var c2=0; c2<d.tableCols; c2++) nr.push({bg:'', color:'', fontFamily:'', fontSize:0, fontBold:false, textAlign:''});
            d.tableCellStyles.push(nr);
        }
        for(var ri=0; ri<d.tableCellStyles.length; ri++){
            while(d.tableCellStyles[ri].length < d.tableCols) d.tableCellStyles[ri].push({bg:'', color:'', fontFamily:'', fontSize:0, fontBold:false, textAlign:''});
        }
        return d.tableCellStyles;
    }

    function ensureTblRowHeights(node){
        var d = node.data;
        if(!d.tableRowHeights){
            d.tableRowHeights = [];
            for(var r=0; r<d.tableRows; r++) d.tableRowHeights.push(0);
        }
        while(d.tableRowHeights.length < d.tableRows) d.tableRowHeights.push(0);
        return d.tableRowHeights;
    }

    function ensureTblColWidths(node){
        var d = node.data;
        if(!d.tableColWidths){
            d.tableColWidths = [];
            for(var c=0; c<d.tableCols; c++) d.tableColWidths.push(0);
        }
        while(d.tableColWidths.length < d.tableCols) d.tableColWidths.push(0);
        return d.tableColWidths;
    }

    // ── 셀에 스타일 적용 ──
    function applyCellStyle(cellEl, style){
        if(!style) return;
        if(style.bg) cellEl.style.background = style.bg;
        else cellEl.style.background = '';
        if(style.color) cellEl.style.color = style.color;
        else cellEl.style.color = '';
        if(style.fontFamily) cellEl.style.fontFamily = style.fontFamily;
        else cellEl.style.fontFamily = '';
        if(style.fontSize && style.fontSize > 0) cellEl.style.fontSize = style.fontSize + 'px';
        else cellEl.style.fontSize = '';
        cellEl.style.fontWeight = style.fontBold ? '700' : '';
        if(style.textAlign) cellEl.style.textAlign = style.textAlign;
        else cellEl.style.textAlign = '';
    }

    // ── 표 전체 재렌더링 ──
    function rerenderTable(node){
        var el = document.getElementById('nd-'+node.id);
        if(!el) return;
        var d = node.data;
        var tRows = d.tableRows || 3;
        var tCols = d.tableCols || 3;
        var tCells = d.tableCells || [];
        var styles = ensureTblCellStyles(node);
        var rowH = ensureTblRowHeights(node);
        var colW = ensureTblColWidths(node);

        var tblHtml = '<table class="wf-tbl-inner"><colgroup>';
        for(var cg=0; cg<tCols; cg++){
            tblHtml += '<col' + (colW[cg] > 0 ? ' style="width:'+colW[cg]+'px"' : '') + '>';
        }
        tblHtml += '</colgroup><tbody>';
        for(var tbr=0; tbr<tRows; tbr++){
            tblHtml += '<tr'+(rowH[tbr] > 0 ? ' style="height:'+rowH[tbr]+'px"' : '')+'>';
            for(var tbc=0; tbc<tCols; tbc++){
                tblHtml += '<td contenteditable="true" spellcheck="false">'+(tCells[tbr] && tCells[tbr][tbc] ? escTxt(tCells[tbr][tbc]) : '')+'</td>';
            }
            tblHtml += '</tr>';
        }
        tblHtml += '</tbody></table>';
        tblHtml += '<div class="wf-size-badge">'+Math.round(node.size.w)+' x '+Math.round(node.size.h)+'</div>';

        // 포트+리사이즈는 유지
        var ports = el.querySelectorAll('.wf-port, .wf-resize-handle');
        var saved = [];
        for(var pi=0; pi<ports.length; pi++) saved.push(ports[pi]);

        el.innerHTML = tblHtml;

        // 셀 스타일 적용
        var allCells = el.querySelectorAll('th, td');
        var idx = 0;
        for(var sr=0; sr<tRows; sr++){
            for(var sc=0; sc<tCols; sc++){
                if(allCells[idx]) applyCellStyle(allCells[idx], styles[sr] && styles[sr][sc]);
                idx++;
            }
        }

        // 포트/핸들 복원
        for(var si=0; si<saved.length; si++) el.appendChild(saved[si]);

        // 셀 편집 이벤트 재바인딩
        bindTableCellEvents(el, node);

        // 행/열 드래그 리사이즈 핸들
        addTblResizeHandles(el, node);

        // 선택 배지 표시
        var badge = el.querySelector('.wf-size-badge');
        if(badge && selectedNode === node) badge.style.display = '';
    }

    // ── 셀 선택 하이라이트 갱신 ──
    function refreshTblSelHighlight(el, node){
        var cells = el.querySelectorAll('th, td');
        var tCols = (node.data.tableCols || 3);
        for(var i=0; i<cells.length; i++) cells[i].classList.remove('wf-tbl-sel');
        for(var si=0; si<_tblSelCells.length; si++){
            var idx = _tblSelCells[si].row * tCols + _tblSelCells[si].col;
            if(cells[idx]) cells[idx].classList.add('wf-tbl-sel');
        }
    }

    // 범위로부터 셀 배열 생성
    function cellRangeFromDrag(r1, c1, r2, c2){
        var minR = Math.min(r1,r2), maxR = Math.max(r1,r2);
        var minC = Math.min(c1,c2), maxC = Math.max(c1,c2);
        var arr = [];
        for(var r=minR; r<=maxR; r++){
            for(var c=minC; c<=maxC; c++) arr.push({row:r, col:c});
        }
        return arr;
    }

    // ── 셀 이벤트 바인딩 ──
    function bindTableCellEvents(el, node){
        var d = node.data;
        var tRows = d.tableRows || 3;
        var tCols = d.tableCols || 3;

        el.addEventListener('input', function(){
            var cells = el.querySelectorAll('th, td');
            var newCells = [];
            var ci2 = 0;
            for(var ri2=0; ri2<tRows; ri2++){
                var row = [];
                for(var cc2=0; cc2<tCols; cc2++){
                    row.push(cells[ci2] ? cells[ci2].textContent : '');
                    ci2++;
                }
                newCells.push(row);
            }
            node.data.tableCells = newCells;
        });

        // 셀 mousedown → 드래그 선택 시작
        var cells = el.querySelectorAll('th, td');
        var cIdx = 0;
        for(var rr=0; rr<tRows; rr++){
            for(var cc=0; cc<tCols; cc++){
                (function(r, c, cell){
                    cell.addEventListener('mousedown', function(ev){
                        // 이미 편집 중인 셀 내부 클릭은 무시
                        if(document.activeElement === cell && _tblSelCells.length <= 1) return;
                        _tblDragSel = true;
                        _tblDragStart = {row: r, col: c};
                        _tblSelCells = [{row: r, col: c}];
                        refreshTblSelHighlight(el, node);
                        syncTblBar(node);
                    });
                    cell.addEventListener('mouseenter', function(){
                        if(!_tblDragSel || !_tblDragStart) return;
                        _tblSelCells = cellRangeFromDrag(_tblDragStart.row, _tblDragStart.col, r, c);
                        refreshTblSelHighlight(el, node);
                    });
                    cell.addEventListener('focus', function(){
                        if(_tblDragSel) return; // 드래그 도중 focus 무시
                        _tblSelCells = [{row: r, col: c}];
                        refreshTblSelHighlight(el, node);
                        syncTblBar(node);
                    });
                })(rr, cc, cells[cIdx]);
                cIdx++;
            }
        }

        // mouseup → 드래그 종료
        function onTblMouseUp(){
            if(_tblDragSel){
                _tblDragSel = false;
                syncTblBar(node);
                // 단일 셀이면 포커스
                if(_tblSelCells.length === 1){
                    var idx = _tblSelCells[0].row * tCols + _tblSelCells[0].col;
                    var allC = el.querySelectorAll('th, td');
                    if(allC[idx]) allC[idx].focus();
                }
            }
        }
        document.addEventListener('mouseup', onTblMouseUp);
        // 노드 제거 시 정리
        el._tblMouseUp = onTblMouseUp;
    }

    // ── 행/열 경계 드래그 리사이즈 핸들 삽입 ──
    function addTblResizeHandles(el, node){
        // 기존 핸들 제거
        var old = el.querySelectorAll('.wf-tbl-rh');
        for(var oi=0; oi<old.length; oi++) old[oi].remove();

        var tbl = el.querySelector('.wf-tbl-inner');
        if(!tbl) return;
        var d = node.data;
        var tRows = d.tableRows || 3;
        var tCols = d.tableCols || 3;
        var rows = tbl.querySelectorAll('tr');
        var colW = ensureTblColWidths(node);
        var rowH = ensureTblRowHeights(node);

        // 행 경계 핸들 (각 행 하단)
        var yAcc = 0;
        for(var ri=0; ri<rows.length; ri++){
            yAcc += rows[ri].offsetHeight;
            if(ri >= tRows - 1) continue; // 마지막 행 아래는 노드 리사이즈로 대체
            (function(rowIdx, yPos){
                var hd = document.createElement('div');
                hd.className = 'wf-tbl-rh wf-tbl-rh-row';
                hd.style.top = yPos + 'px';
                el.appendChild(hd);

                hd.addEventListener('mousedown', function(e){
                    e.stopPropagation();
                    e.preventDefault();
                    hd.classList.add('active');
                    var startY = e.clientY;
                    var origH = rows[rowIdx].offsetHeight;
                    function onMove(ev){
                        var delta = (ev.clientY - startY) / zoom;
                        var newH = Math.max(24, origH + delta);
                        rowH[rowIdx] = Math.round(newH);
                        rows[rowIdx].style.height = newH + 'px';
                        // 노드 높이 재계산
                        var totalH = 0;
                        for(var rr=0; rr<rows.length; rr++) totalH += rows[rr].offsetHeight;
                        node.size.h = Math.max(60, totalH);
                        el.style.height = node.size.h + 'px';
                        updateSizeBadge(node);
                        positionCtxBar(node);
                        positionTblBar(node);
                    }
                    function onUp(){
                        hd.classList.remove('active');
                        document.removeEventListener('mousemove', onMove);
                        document.removeEventListener('mouseup', onUp);
                        // 핸들 위치 갱신
                        addTblResizeHandles(el, node);
                        drawEdges();
                    }
                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup', onUp);
                });
            })(ri, yAcc);
        }

        // 열 경계 핸들 (각 열 오른쪽)
        var firstRow = rows[0];
        if(!firstRow) return;
        var cells = firstRow.querySelectorAll('th, td');
        var xAcc = 0;
        for(var ci=0; ci<cells.length; ci++){
            xAcc += cells[ci].offsetWidth;
            if(ci >= tCols - 1) continue; // 마지막 열은 노드 리사이즈로 대체
            (function(colIdx, xPos){
                var hd = document.createElement('div');
                hd.className = 'wf-tbl-rh wf-tbl-rh-col';
                hd.style.left = xPos + 'px';
                el.appendChild(hd);

                hd.addEventListener('mousedown', function(e){
                    e.stopPropagation();
                    e.preventDefault();
                    hd.classList.add('active');
                    var startX = e.clientX;
                    var origW = cells[colIdx].offsetWidth;
                    function onMove(ev){
                        var delta = (ev.clientX - startX) / zoom;
                        var newW = Math.max(40, origW + delta);
                        colW[colIdx] = Math.round(newW);
                        // colgroup 통해 열 너비 설정
                        var cols = tbl.querySelectorAll('col');
                        if(cols[colIdx]) cols[colIdx].style.width = newW + 'px';
                        // 노드 너비 재계산
                        var totalW = 0;
                        var allCols = firstRow.querySelectorAll('th, td');
                        for(var cc=0; cc<allCols.length; cc++) totalW += allCols[cc].offsetWidth;
                        node.size.w = Math.max(100, totalW);
                        el.style.width = node.size.w + 'px';
                        updateSizeBadge(node);
                        positionCtxBar(node);
                        positionTblBar(node);
                    }
                    function onUp(){
                        hd.classList.remove('active');
                        document.removeEventListener('mousemove', onMove);
                        document.removeEventListener('mouseup', onUp);
                        addTblResizeHandles(el, node);
                        drawEdges();
                    }
                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup', onUp);
                });
            })(ci, xAcc);
        }
    }

    // ── tblBar 값 동기화 ──
    function syncTblBar(node){
        if(!node || node.type !== 'table') return;
        var styles = ensureTblCellStyles(node);
        var rowH = ensureTblRowHeights(node);
        var s = null;
        var first = _tblSelCells.length > 0 ? _tblSelCells[0] : null;
        if(first && styles[first.row] && styles[first.row][first.col]){
            s = styles[first.row][first.col];
        }
        document.getElementById('wfe-tb-font').value = (s && s.fontFamily) || '';
        document.getElementById('wfe-tb-fsize').value = String((s && s.fontSize > 0) ? s.fontSize : 12);
        document.getElementById('wfe-tb-bold').classList.toggle('active', !!(s && s.fontBold));
        var alBtns = tblBar.querySelectorAll('[data-talign]');
        var curAlign = (s && s.textAlign) || 'left';
        for(var ai=0; ai<alBtns.length; ai++) alBtns[ai].classList.toggle('active', alBtns[ai].getAttribute('data-talign') === curAlign);
        var dot = document.getElementById('wfe-tb-colordot');
        dot.style.background = (s && s.bg) || '#ffffff';
        // 글자색 동기화
        var txtDot = document.getElementById('wfe-tb-txtdot');
        txtDot.style.borderBottomColor = (s && s.color) || '#1e293b';
        // 행 높이
        var rh = (first && rowH[first.row] > 0) ? rowH[first.row] : 32;
        document.getElementById('wfe-tb-rowh').value = rh;
    }

    // ── tblBar 이벤트 핸들러 ──
    tblBar.addEventListener('mousedown', function(e){ e.stopPropagation(); });

    // 셀 색상 팝오버 토글
    var _tblColorPopOpen = false;
    document.getElementById('wfe-tb-cellcolor').addEventListener('click', function(e){
        e.stopPropagation();
        _tblColorPopOpen = !_tblColorPopOpen;
        tblColorPop.style.display = _tblColorPopOpen ? 'block' : 'none';
        // 글자색 팝오버는 닫기
        _tblTxtColorPopOpen = false;
        tblTxtColorPop.style.display = 'none';
    });
    tblColorPop.addEventListener('click', function(e){
        var sw = e.target.closest('.wf-tbl-colorsw');
        if(!sw) return;
        var c = sw.getAttribute('data-c');
        applyTblCellProp('bg', c);
        _tblColorPopOpen = false;
        tblColorPop.style.display = 'none';
    });
    document.getElementById('wfe-tb-customcolor').addEventListener('input', function(){
        applyTblCellProp('bg', this.value);
        document.getElementById('wfe-tb-colorhex').textContent = this.value;
    });
    // 팝오버 외부 클릭 닫기
    document.addEventListener('click', function(e){
        if(_tblColorPopOpen && !tblBar.contains(e.target)){
            _tblColorPopOpen = false;
            tblColorPop.style.display = 'none';
        }
        if(_tblTxtColorPopOpen && !tblBar.contains(e.target)){
            _tblTxtColorPopOpen = false;
            tblTxtColorPop.style.display = 'none';
        }
    });

    // 글자색 팝오버 토글
    var _tblTxtColorPopOpen = false;
    document.getElementById('wfe-tb-textcolor').addEventListener('click', function(e){
        e.stopPropagation();
        _tblTxtColorPopOpen = !_tblTxtColorPopOpen;
        tblTxtColorPop.style.display = _tblTxtColorPopOpen ? 'block' : 'none';
        // 셀 배경 팝오버는 닫기
        _tblColorPopOpen = false;
        tblColorPop.style.display = 'none';
    });
    tblTxtColorPop.addEventListener('click', function(e){
        var sw = e.target.closest('.wf-tbl-colorsw');
        if(!sw) return;
        var c = sw.getAttribute('data-c');
        applyTblCellProp('color', c);
        _tblTxtColorPopOpen = false;
        tblTxtColorPop.style.display = 'none';
    });
    document.getElementById('wfe-tb-txtcustomcolor').addEventListener('input', function(){
        applyTblCellProp('color', this.value);
        document.getElementById('wfe-tb-txtcolorhex').textContent = this.value;
    });

    function applyTblCellProp(prop, val){
        if(!selectedNode || selectedNode.type !== 'table' || _tblSelCells.length === 0) return;
        var styles = ensureTblCellStyles(selectedNode);
        var el = document.getElementById('nd-'+selectedNode.id);
        var allCells = el ? el.querySelectorAll('th, td') : [];
        var tCols = selectedNode.data.tableCols || 3;
        for(var si=0; si<_tblSelCells.length; si++){
            var sc = _tblSelCells[si];
            if(styles[sc.row] && styles[sc.row][sc.col]){
                styles[sc.row][sc.col][prop] = val;
            }
            if(el){
                var idx = sc.row * tCols + sc.col;
                if(allCells[idx]) applyCellStyle(allCells[idx], styles[sc.row][sc.col]);
            }
        }
        syncTblBar(selectedNode);
    }

    // 글꼴
    document.getElementById('wfe-tb-font').addEventListener('change', function(){
        applyTblCellProp('fontFamily', this.value);
    });
    // 글자 크기
    document.getElementById('wfe-tb-fsize').addEventListener('change', function(){
        applyTblCellProp('fontSize', parseInt(this.value) || 12);
    });
    // 굵기
    document.getElementById('wfe-tb-bold').addEventListener('click', function(){
        if(!selectedNode || selectedNode.type !== 'table' || _tblSelCells.length === 0) return;
        var styles = ensureTblCellStyles(selectedNode);
        var first = _tblSelCells[0];
        var s = styles[first.row] && styles[first.row][first.col];
        var newBold = s ? !s.fontBold : true;
        applyTblCellProp('fontBold', newBold);
    });
    // 텍스트 정렬
    var _tbAlignBtns = tblBar.querySelectorAll('[data-talign]');
    for(var _tai=0; _tai<_tbAlignBtns.length; _tai++){
        (function(btn){
            btn.addEventListener('click', function(){
                applyTblCellProp('textAlign', btn.getAttribute('data-talign'));
            });
        })(_tbAlignBtns[_tai]);
    }

    // 행 추가
    document.getElementById('wfe-tb-addrow').addEventListener('click', function(){
        if(!selectedNode || selectedNode.type !== 'table') return;
        var d = selectedNode.data;
        var first = _tblSelCells.length > 0 ? _tblSelCells[0] : null;
        var insertAt = (first ? first.row + 1 : d.tableRows);
        var newRow = [];
        for(var c=0; c<d.tableCols; c++) newRow.push('');
        d.tableCells.splice(insertAt, 0, newRow);
        var styles = ensureTblCellStyles(selectedNode);
        var newStyle = [];
        for(var c2=0; c2<d.tableCols; c2++) newStyle.push({bg:'', color:'', fontFamily:'', fontSize:0, fontBold:false, textAlign:''});
        styles.splice(insertAt, 0, newStyle);
        var rowH = ensureTblRowHeights(selectedNode);
        rowH.splice(insertAt, 0, 0);
        d.tableRows++;
        selectedNode.size.h = Math.max(200, d.tableRows * 36);
        rerenderTable(selectedNode);
        positionTblBar(selectedNode);
        drawEdges();
    });

    // 열 추가
    document.getElementById('wfe-tb-addcol').addEventListener('click', function(){
        if(!selectedNode || selectedNode.type !== 'table') return;
        var d = selectedNode.data;
        var first = _tblSelCells.length > 0 ? _tblSelCells[0] : null;
        var insertAt = (first ? first.col + 1 : d.tableCols);
        for(var r=0; r<d.tableRows; r++){
            d.tableCells[r].splice(insertAt, 0, '');
        }
        var styles = ensureTblCellStyles(selectedNode);
        for(var r2=0; r2<styles.length; r2++){
            styles[r2].splice(insertAt, 0, {bg:'', color:'', fontFamily:'', fontSize:0, fontBold:false, textAlign:''});
        }
        var colW = ensureTblColWidths(selectedNode);
        colW.splice(insertAt, 0, 0);
        d.tableCols++;
        selectedNode.size.w = Math.max(400, d.tableCols * 100);
        rerenderTable(selectedNode);
        positionTblBar(selectedNode);
        drawEdges();
    });

    // 행 삭제
    document.getElementById('wfe-tb-delrow').addEventListener('click', function(){
        if(!selectedNode || selectedNode.type !== 'table') return;
        var d = selectedNode.data;
        if(d.tableRows <= 2) return; // 최소 2행 (헤더+1)
        var first = _tblSelCells.length > 0 ? _tblSelCells[0] : null;
        var delAt = (first ? first.row : d.tableRows - 1);
        if(delAt < 0) delAt = d.tableRows - 1;
        d.tableCells.splice(delAt, 1);
        var styles = ensureTblCellStyles(selectedNode);
        if(styles[delAt]) styles.splice(delAt, 1);
        var rowH = ensureTblRowHeights(selectedNode);
        if(rowH[delAt] !== undefined) rowH.splice(delAt, 1);
        d.tableRows--;
        _tblSelCells = [];
        selectedNode.size.h = Math.max(200, d.tableRows * 36);
        rerenderTable(selectedNode);
        positionTblBar(selectedNode);
        drawEdges();
    });

    // 열 삭제
    document.getElementById('wfe-tb-delcol').addEventListener('click', function(){
        if(!selectedNode || selectedNode.type !== 'table') return;
        var d = selectedNode.data;
        if(d.tableCols <= 1) return;
        var first = _tblSelCells.length > 0 ? _tblSelCells[0] : null;
        var delAt = (first ? first.col : d.tableCols - 1);
        if(delAt < 0) delAt = d.tableCols - 1;
        for(var r=0; r<d.tableRows; r++){
            d.tableCells[r].splice(delAt, 1);
        }
        var styles = ensureTblCellStyles(selectedNode);
        for(var r2=0; r2<styles.length; r2++){
            if(styles[r2][delAt] !== undefined) styles[r2].splice(delAt, 1);
        }
        var colW = ensureTblColWidths(selectedNode);
        if(colW[delAt] !== undefined) colW.splice(delAt, 1);
        d.tableCols--;
        _tblSelCells = [];
        selectedNode.size.w = Math.max(400, d.tableCols * 100);
        rerenderTable(selectedNode);
        positionTblBar(selectedNode);
        drawEdges();
    });

    // 행 높이 설정
    document.getElementById('wfe-tb-rowh').addEventListener('change', function(){
        if(!selectedNode || selectedNode.type !== 'table' || _tblSelCells.length === 0) return;
        var rowH = ensureTblRowHeights(selectedNode);
        var val = parseInt(this.value) || 0;
        var first = _tblSelCells[0];
        rowH[first.row] = val > 0 ? Math.max(20, val) : 0;
        rerenderTable(selectedNode);
    });

    // 행 균등분배
    document.getElementById('wfe-tb-eqrow').addEventListener('click', function(){
        if(!selectedNode || selectedNode.type !== 'table') return;
        var d = selectedNode.data;
        var h = selectedNode.size.h;
        var each = Math.floor(h / d.tableRows);
        var rowH = ensureTblRowHeights(selectedNode);
        for(var r=0; r<d.tableRows; r++) rowH[r] = each;
        rerenderTable(selectedNode);
    });

    // 열 균등분배
    document.getElementById('wfe-tb-eqcol').addEventListener('click', function(){
        if(!selectedNode || selectedNode.type !== 'table') return;
        var d = selectedNode.data;
        var w = selectedNode.size.w;
        var each = Math.floor(w / d.tableCols);
        var colW = ensureTblColWidths(selectedNode);
        for(var c=0; c<d.tableCols; c++) colW[c] = each;
        rerenderTable(selectedNode);
    });

    // 오름차순 정렬
    document.getElementById('wfe-tb-sortasc').addEventListener('click', function(){
        sortTableByCol(1);
    });
    // 내림차순 정렬
    document.getElementById('wfe-tb-sortdesc').addEventListener('click', function(){
        sortTableByCol(-1);
    });

    function sortTableByCol(dir){
        if(!selectedNode || selectedNode.type !== 'table') return;
        var d = selectedNode.data;
        var first = _tblSelCells.length > 0 ? _tblSelCells[0] : null;
        var col = (first ? first.col : 0);
        // body만 정렬 (인덱스 1~)
        var bodyRows = [];
        var bodyStyles = [];
        var bodyRowH = [];
        var styles = ensureTblCellStyles(selectedNode);
        var rowH = ensureTblRowHeights(selectedNode);
        for(var r=1; r<d.tableRows; r++){
            bodyRows.push(d.tableCells[r]);
            bodyStyles.push(styles[r]);
            bodyRowH.push(rowH[r]);
        }
        bodyRows.sort(function(a, b){
            var va = (a[col] || '').toLowerCase();
            var vb = (b[col] || '').toLowerCase();
            if(va < vb) return -1 * dir;
            if(va > vb) return 1 * dir;
            return 0;
        });
        // bodyStyles와 bodyRowH도 같은 순서로 재배치
        var sortedIndices = [];
        for(var si=1; si<d.tableRows; si++) sortedIndices.push(si);
        sortedIndices.sort(function(a, b){
            var va = (d.tableCells[a][col] || '').toLowerCase();
            var vb = (d.tableCells[b][col] || '').toLowerCase();
            if(va < vb) return -1 * dir;
            if(va > vb) return 1 * dir;
            return 0;
        });
        var newStyles = [styles[0]];
        var newRowH = [rowH[0]];
        for(var si2=0; si2<sortedIndices.length; si2++){
            newStyles.push(styles[sortedIndices[si2]]);
            newRowH.push(rowH[sortedIndices[si2]]);
        }
        for(var r2=1; r2<d.tableRows; r2++){
            d.tableCells[r2] = bodyRows[r2-1];
        }
        d.tableCellStyles = newStyles;
        d.tableRowHeights = newRowH;
        rerenderTable(selectedNode);
    }

    // ── 팝오버 열기/닫기 ──
    var openPop = null;
    function closeAllPops(){
        colorPop.style.display = 'none';
        colorPop.classList.remove('wf-pop-below');
        fitPop.style.display = 'none';
        fitPop.classList.remove('wf-pop-below');
        sizePop.style.display = 'none';
        sizePop.classList.remove('wf-pop-below');
        openPop = null;
    }
    function togglePop(pop){
        if(openPop === pop){ closeAllPops(); return; }
        closeAllPops();
        pop.style.display = 'block';
        openPop = pop;
        // 고정 모드이면 항상 아래로, 아니면 위쪽 넘침 감지
        if(ctxPinned){
            pop.classList.add('wf-pop-below');
        } else {
            var rect = pop.getBoundingClientRect();
            if(rect.top < 0){
                pop.classList.add('wf-pop-below');
            }
        }
    }

    ctxBar.addEventListener('mousedown', function(e){ e.stopPropagation(); });
    ctxBar.addEventListener('click', function(e){
        e.stopPropagation();
        var btn = e.target.closest('[data-act]');
        if(!btn) return;
        var act = btn.getAttribute('data-act');

        if(act === 'color'){ togglePop(colorPop); return; }
        if(act === 'fit'){ togglePop(fitPop); return; }
        if(act === 'size'){ togglePop(sizePop); return; }

        closeAllPops();
        if(!selectedNode) return;
        if(act === 'delete') deleteNode(selectedNode);
        if(act === 'duplicate'){
            var n = selectedNode;
            var newNode = addNode(n.type, n.position.x+30, n.position.y+30);
            newNode.data.name = n.data.name;
            if(n.data.bgColor) newNode.data.bgColor = n.data.bgColor;
            if(n.data.fitContent !== undefined) newNode.data.fitContent = n.data.fitContent;
            if(n.data.padding !== undefined) newNode.data.padding = n.data.padding;
            // 스타일 속성 복제
            ['texture','borderStyle','borderWidth','borderColor','borderOpacity'].forEach(function(k){
                if(n.data[k] !== undefined) newNode.data[k] = n.data[k];
            });
            var lbl = document.querySelector('#nd-'+newNode.id+' .wf-node-label');
            if(lbl) lbl.textContent = n.data.name;
            if(n.size){ newNode.size={w:n.size.w, h:n.size.h}; var ne=document.getElementById('nd-'+newNode.id); if(ne){ne.style.width=n.size.w+'px';ne.style.height=n.size.h+'px';} }
            applyNodeBgColor(newNode);
        }
    });

    // 색상 스워치 클릭
    colorPop.addEventListener('click', function(e){
        var sw = e.target.closest('.wf-color-swatch');
        if(!sw || !selectedNode) return;
        var c = sw.getAttribute('data-color');
        selectedNode.data.bgColor = c;
        applyNodeBgColor(selectedNode);
        updateCtxColorDot(selectedNode);
        scheduleLivePush();
    });
    // 커스텀 색상
    var customColorInput = document.getElementById('wfe-custom-color');
    customColorInput.addEventListener('input', function(){
        if(!selectedNode) return;
        selectedNode.data.bgColor = this.value;
        document.getElementById('wfe-color-hex').textContent = this.value;
        applyNodeBgColor(selectedNode);
        updateCtxColorDot(selectedNode);
        scheduleLivePush();
    });

    // 질감 선택
    var TEXTURE_MAP = {
        none: '',
        stripe: 'repeating-linear-gradient(45deg,transparent,transparent 3px,rgba(0,0,0,0.06) 3px,rgba(0,0,0,0.06) 6px)',
        dots: 'radial-gradient(circle,rgba(0,0,0,0.08) 1px,transparent 1px)',
        grid: 'linear-gradient(rgba(0,0,0,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,0.05) 1px,transparent 1px)',
        cross: 'repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(0,0,0,0.05) 4px,rgba(0,0,0,0.05) 5px),repeating-linear-gradient(-45deg,transparent,transparent 4px,rgba(0,0,0,0.05) 4px,rgba(0,0,0,0.05) 5px)'
    };
    var TEXTURE_SIZE = { none:'', stripe:'', dots:'6px 6px', grid:'8px 8px', cross:'' };
    document.getElementById('wfe-texture-grid').addEventListener('click', function(e){
        var btn = e.target.closest('.wf-texture-opt');
        if(!btn || !selectedNode) return;
        var tx = btn.getAttribute('data-tex');
        selectedNode.data.texture = tx;
        var all = this.querySelectorAll('.wf-texture-opt');
        for(var i=0;i<all.length;i++) all[i].classList.toggle('active', all[i]===btn);
        applyNodeStyle(selectedNode);
        scheduleLivePush();
    });

    // 테두리 스타일
    document.getElementById('wfe-border-style').addEventListener('click', function(e){
        var btn = e.target.closest('.wf-bdr-opt');
        if(!btn || !selectedNode) return;
        var bs = btn.getAttribute('data-bs');
        selectedNode.data.borderStyle = bs;
        var all = this.querySelectorAll('.wf-bdr-opt');
        for(var i=0;i<all.length;i++) all[i].classList.toggle('active', all[i]===btn);
        applyNodeStyle(selectedNode);
        scheduleLivePush();
    });

    // 테두리 두께
    document.getElementById('wfe-border-width').addEventListener('input', function(){
        if(!selectedNode) return;
        selectedNode.data.borderWidth = parseInt(this.value) || 0;
        document.getElementById('wfe-border-width-val').textContent = this.value + 'px';
        applyNodeStyle(selectedNode);
        scheduleLivePush();
    });

    // 테두리 색깔
    document.getElementById('wfe-border-color').addEventListener('input', function(){
        if(!selectedNode) return;
        selectedNode.data.borderColor = this.value;
        document.getElementById('wfe-border-color-hex').textContent = this.value;
        applyNodeStyle(selectedNode);
        scheduleLivePush();
    });

    // 테두리 불투명
    document.getElementById('wfe-border-opacity').addEventListener('input', function(){
        if(!selectedNode) return;
        selectedNode.data.borderOpacity = parseInt(this.value);
        document.getElementById('wfe-border-opacity-val').textContent = this.value + '%';
        applyNodeStyle(selectedNode);
        scheduleLivePush();
    });

    // 내용에 따라 적용하기 토글
    var fitToggle = document.getElementById('wfe-fit-toggle');
    fitToggle.addEventListener('change', function(){
        if(!selectedNode) return;
        selectedNode.data.fitContent = this.checked;
        if(this.checked) applyFitContent(selectedNode);
    });
    // 여백 입력
    var fitPaddingInput = document.getElementById('wfe-fit-padding');
    fitPaddingInput.addEventListener('input', function(){
        if(!selectedNode) return;
        selectedNode.data.padding = parseInt(this.value) || 0;
        if(selectedNode.data.fitContent) applyFitContent(selectedNode);
    });

    // 크기 입력
    document.getElementById('wfe-size-w').addEventListener('input', function(){
        if(!selectedNode || !selectedNode.size) return;
        var v = Math.max(40, parseInt(this.value)||40);
        selectedNode.size.w = v;
        var el = document.getElementById('nd-'+selectedNode.id);
        if(el) el.style.width = v+'px';
        updateSizeBadge(selectedNode);
        updateCtxSize(selectedNode);
        drawEdges();
    });
    document.getElementById('wfe-size-h').addEventListener('input', function(){
        if(!selectedNode || !selectedNode.size) return;
        var v = Math.max(40, parseInt(this.value)||40);
        selectedNode.size.h = v;
        var el = document.getElementById('nd-'+selectedNode.id);
        if(el) el.style.height = v+'px';
        updateSizeBadge(selectedNode);
        updateCtxSize(selectedNode);
        drawEdges();
    });

    // 배경색 적용 헬퍼
    function applyNodeBgColor(node){
        var el = document.getElementById('nd-'+node.id);
        if(!el) return;
        var isErTable = el.classList.contains('wf-shape-er-table');
        // ER 테이블은 항상 흰색 배경 유지 (도트 패턴 차단)
        if(isErTable){
            var isDark = editorRoot.getAttribute('data-theme') === 'dark';
            el.style.backgroundColor = isDark ? '#1e293b' : '#ffffff';
            applyNodeStyle(node);
            return;
        }
        var c = node.data.bgColor || '';
        // SVG 도형: fill로 색상 적용 (컨테이너 배경 아닌 도형 내부)
        var svgShape = el.querySelector('.wf-svg-shape');
        if(svgShape){
            var fills = svgShape.querySelectorAll('polygon, path, ellipse, circle, rect');
            for(var fi = 0; fi < fills.length; fi++) fills[fi].style.fill = c || '';
            el.style.backgroundColor = 'transparent';
        } else if(c){
            el.style.backgroundColor = c;
            var fb = el.querySelector('.wf-frame-body');
            if(fb) fb.style.backgroundColor = c;
        } else {
            el.style.backgroundColor = '';
            var fb2 = el.querySelector('.wf-frame-body');
            if(fb2) fb2.style.backgroundColor = '';
        }
        // 메모 전용: text 색상 (fontColor가 있으면 우선)
        if(node.data.fontColor || node.data.textColor){
            var txt = el.querySelector('.wf-note-text');
            if(txt) txt.style.color = node.data.fontColor || node.data.textColor;
        }
        // 메모 질감(texture) 적용 (ER 테이블은 건너뜀)
        if(!el.classList.contains('wf-shape-er-table')){
            if(node.data.noteTexture){
                el.style.backgroundImage = node.data.noteTexture;
                if(node.data.noteTextureBgSize) el.style.backgroundSize = node.data.noteTextureBgSize;
            } else if(!node.data.texture || node.data.texture === 'none') {
                el.style.backgroundImage = '';
                el.style.backgroundSize = '';
            }
        }
        // 통합 스타일 적용
        applyNodeStyle(node);
    }

    // 노드 스타일(질감/테두리) 적용 헬퍼
    function applyNodeStyle(node){
        var el = document.getElementById('nd-'+node.id);
        if(!el) return;
        var d = node.data || {};
        var isErTable = el.classList.contains('wf-shape-er-table');
        // 질감 (ER 테이블은 텍스처 적용 안 함)
        if(!isErTable){
            var tex = d.texture || 'none';
            if(tex !== 'none' && TEXTURE_MAP[tex]){
                el.style.backgroundImage = TEXTURE_MAP[tex];
                el.style.backgroundSize = TEXTURE_SIZE[tex] || '';
            } else if(!d.noteTexture) {
                el.style.backgroundImage = '';
                el.style.backgroundSize = '';
            }
        }
        // 테두리 스타일 (이미지/SVG 도형은 명시 설정 없으면 건너뜀)
        var isImgShape = el.classList.contains('wf-shape-img') || el.classList.contains('wf-shape-svg-generic');
        var bs = d.borderStyle || (isImgShape ? '' : 'solid');
        if(bs === 'none'){
            el.style.borderStyle = 'none';
        } else if(bs) {
            el.style.borderStyle = bs;
        }
        // 테두리 두께
        var bw = d.borderWidth !== undefined ? d.borderWidth : '';
        if(bw !== '') el.style.borderWidth = bw + 'px';
        // 테두리 색깔 + 불투명
        var bc = d.borderColor || '';
        var bo = d.borderOpacity !== undefined ? d.borderOpacity : 100;
        if(bc){
            // 불투명도 적용: hex → rgba
            var r = parseInt(bc.slice(1,3),16), g = parseInt(bc.slice(3,5),16), b = parseInt(bc.slice(5,7),16);
            el.style.borderColor = 'rgba('+r+','+g+','+b+','+(bo/100)+')';
        }
        // 회전
        if(d.rotation) el.style.transform = 'rotate('+d.rotation+'deg)';
    }

    // 내용에 따라 적용하기 헬퍼 (자식 노드 기반으로 크기 자동 조절)
    function applyFitContent(node){
        var el = document.getElementById('nd-'+node.id);
        if(!el || !node.size) return;
        var pad = node.data.padding || 20;
        // 프레임 안에 포함된 노드 찾기
        var nx = node.position.x, ny = node.position.y;
        var nw = node.size.w, nh = node.size.h;
        var children = nodes.filter(function(cn){
            if(cn.id === node.id) return false;
            var cx = cn.position.x, cy = cn.position.y;
            var cw = (cn.size && cn.size.w) || 160, ch = (cn.size && cn.size.h) || 56;
            return cx >= nx && cy >= ny && cx+cw <= nx+nw && cy+ch <= ny+nh;
        });
        if(!children.length) return;
        var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
        children.forEach(function(cn){
            var cw = (cn.size&&cn.size.w)||160, ch = (cn.size&&cn.size.h)||56;
            if(cn.position.x < minX) minX = cn.position.x;
            if(cn.position.y < minY) minY = cn.position.y;
            if(cn.position.x+cw > maxX) maxX = cn.position.x+cw;
            if(cn.position.y+ch > maxY) maxY = cn.position.y+ch;
        });
        node.position.x = minX - pad;
        node.position.y = minY - pad - 24; // 라벨 여유
        node.size.w = (maxX - minX) + pad*2;
        node.size.h = (maxY - minY) + pad*2 + 24;
        el.style.left = node.position.x+'px';
        el.style.top = node.position.y+'px';
        el.style.width = node.size.w+'px';
        el.style.height = node.size.h+'px';
        updateSizeBadge(node);
        positionCtxBar(node);
        drawEdges();
    }

    // 컨텍스트바 색상 점 업데이트
    function updateCtxColorDot(node){
        var dot = ctxBar.querySelector('.wf-ctx-color-dot');
        if(dot) dot.style.background = (node && node.data.bgColor) || '#ddd';
    }
    // 컨텍스트바 크기 표시
    function updateCtxSize(node){
        var span = ctxBar.querySelector('.wf-ctx-size');
        if(!span) return;
        if(node && node.size){
            span.textContent = Math.round(node.size.w)+' × '+Math.round(node.size.h);
        } else {
            span.textContent = '';
        }
    }

    // ── 컨텍스트 툴바 드래그 & 핀 ──
    var gripEl = ctxBar.querySelector('.wf-ctx-grip');
    var ctxDragging = false, ctxDragStartX, ctxDragStartY, ctxOrigLeft, ctxOrigTop;

    gripEl.addEventListener('mousedown', function(e){
        e.preventDefault();
        e.stopPropagation();
        ctxDragging = true;
        pinZone.style.display = 'flex';
        // 전환: world 좌표계 → viewport 좌표계(fixed-like)
        var vpRect = viewportEl.getBoundingClientRect();
        var barRect = ctxBar.getBoundingClientRect();
        ctxBar.style.position = 'fixed';
        ctxBar.style.transform = 'none';
        ctxBar.style.left = barRect.left + 'px';
        ctxBar.style.top  = barRect.top  + 'px';
        ctxOrigLeft = barRect.left;
        ctxOrigTop  = barRect.top;
        ctxDragStartX = e.clientX;
        ctxDragStartY = e.clientY;
        ctxBar.classList.add('dragging');
        // 리페런트를 canvas-area로 이동
        document.getElementById('wfe-canvas-area').appendChild(ctxBar);
    });
    document.addEventListener('mousemove', function(e){
        if(!ctxDragging) return;
        var nx = ctxOrigLeft + (e.clientX - ctxDragStartX);
        var ny = ctxOrigTop  + (e.clientY - ctxDragStartY);
        ctxBar.style.left = nx + 'px';
        ctxBar.style.top  = ny + 'px';
        // 핀존 하이라이트
        var pzRect = pinZone.getBoundingClientRect();
        if(e.clientY < pzRect.bottom + 10){
            pinZone.classList.add('active');
        } else {
            pinZone.classList.remove('active');
        }
    });
    document.addEventListener('mouseup', function(e){
        if(!ctxDragging) return;
        ctxDragging = false;
        ctxBar.classList.remove('dragging');
        pinZone.classList.remove('active');
        // 핀존 안에 드롭 → 고정
        var pzRect = pinZone.getBoundingClientRect();
        if(e.clientY < pzRect.bottom + 10){
            closeAllPops();
            ctxPinned = true;
            ctxBar.style.position = 'absolute';
            ctxBar.style.transform = 'none';
            ctxBar.style.left = '50%';
            ctxBar.style.top  = '8px';
            ctxBar.style.transform = 'translateX(-50%)';
            ctxBar.classList.add('pinned');
            pinZone.style.display = 'none';
        } else {
            // 원래 world 내 플로팅으로 복귀
            ctxPinned = false;
            ctxBar.classList.remove('pinned');
            ctxBar.style.position = 'absolute';
            ctxBar.style.transform = 'translateX(-50%)';
            worldEl.appendChild(ctxBar);
            if(selectedNode) positionCtxBar(selectedNode);
            pinZone.style.display = 'none';
        }
    });

    function positionCtxBar(node){
        closeAllPops();
        if(!node){
            if(ctxPinned){
                ctxBar.style.display = 'flex';
            } else {
                ctxBar.style.display = 'none';
            }
            return;
        }
        var el = document.getElementById('nd-'+node.id);
        if(!el){ ctxBar.style.display='none'; return; }
        // 색상 점, 크기 동기화
        updateCtxColorDot(node);
        updateCtxSize(node);
        // 팝오버 값 동기화
        document.getElementById('wfe-custom-color').value = node.data.bgColor || '#ffffff';
        document.getElementById('wfe-color-hex').textContent = node.data.bgColor || '#ffffff';
        fitToggle.checked = !!node.data.fitContent;
        fitPaddingInput.value = node.data.padding || 20;
        if(node.size){
            document.getElementById('wfe-size-w').value = Math.round(node.size.w);
            document.getElementById('wfe-size-h').value = Math.round(node.size.h);
        }
        // 질감 동기화
        var curTex = node.data.texture || 'none';
        var texBtns = document.querySelectorAll('#wfe-texture-grid .wf-texture-opt');
        for(var ti=0;ti<texBtns.length;ti++) texBtns[ti].classList.toggle('active', texBtns[ti].getAttribute('data-tex')===curTex);
        // 테두리 동기화
        var curBs = node.data.borderStyle || 'solid';
        var bsBtns = document.querySelectorAll('#wfe-border-style .wf-bdr-opt');
        for(var bi=0;bi<bsBtns.length;bi++) bsBtns[bi].classList.toggle('active', bsBtns[bi].getAttribute('data-bs')===curBs);
        var curBw = node.data.borderWidth !== undefined ? node.data.borderWidth : 1;
        document.getElementById('wfe-border-width').value = curBw;
        document.getElementById('wfe-border-width-val').textContent = curBw + 'px';
        var curBc = node.data.borderColor || '#e5e7eb';
        document.getElementById('wfe-border-color').value = curBc;
        document.getElementById('wfe-border-color-hex').textContent = curBc;
        var curBo = node.data.borderOpacity !== undefined ? node.data.borderOpacity : 100;
        document.getElementById('wfe-border-opacity').value = curBo;
        document.getElementById('wfe-border-opacity-val').textContent = curBo + '%';

        if(ctxPinned){
            ctxBar.style.display = 'flex';
            return;
        }
        // 드래그 중단 등으로 worldEl 외부에 남아있는 경우 복구
        if(ctxBar.parentElement !== worldEl){
            worldEl.appendChild(ctxBar);
        }
        ctxBar.style.position = 'absolute';
        ctxBar.style.display = 'flex';

        // 노드 DOM 요소의 실제 화면 위치에서 world 좌표 역산 (데이터 모델 불일치 방지)
        var vpRect = viewportEl.getBoundingClientRect();
        var elRect = el.getBoundingClientRect();
        var worldX = (elRect.left - vpRect.left - panX) / zoom;
        var worldY = (elRect.top  - vpRect.top  - panY) / zoom;
        var worldW = elRect.width / zoom;

        // ER 테이블은 label이 top:-22px에 있으므로 추가 여유
        var labelOffset = (node.type === 'er_table') ? 26 : 0;
        // 고정 높이 40px, 간격 4 screen px (world: 4/zoom px)
        var CTX_H = 40;
        var gap = 4;
        ctxBar.style.left = (worldX + worldW / 2) + 'px';
        ctxBar.style.top  = (worldY - labelOffset - (CTX_H + gap) / zoom) + 'px';
        ctxBar.style.transform = 'translateX(-50%) scale(' + (1/zoom) + ')';
        ctxBar.style.transformOrigin = 'center bottom';
    }

    // 캔버스 클릭 시 팝오버 닫기
    document.addEventListener('click', function(e){
        if(openPop && !ctxBar.contains(e.target)){
            closeAllPops();
        }
    });

    // ── 메모 노드 도우미 함수 ──
    function getCurrentUserName(){
        var m = document.querySelector('.wf-editor-main');
        return (m && m.getAttribute('data-user-name')) || '';
    }
    function getCurrentUserImage(){
        var m = document.querySelector('.wf-editor-main');
        return (m && m.getAttribute('data-profile-image')) || '';
    }
    function buildNoteFontStyle(node){
        var d = node.data || {};
        var parts = [];
        if(d.fontFamily) parts.push('font-family:'+d.fontFamily);
        if(d.fontSize && d.fontSize !== 13) parts.push('font-size:'+d.fontSize+'px');
        if(d.fontBold) parts.push('font-weight:700');
        if(d.textAlign && d.textAlign !== 'left') parts.push('text-align:'+d.textAlign);
        return parts.length ? ' style="'+parts.join(';')+'"' : '';
    }
    function buildNoteFooter(node){
        var d = node.data || {};
        var html = '';
        var uname = getCurrentUserName();
        var uimg = getCurrentUserImage();
        if(d.showSignature !== false){
            if(uimg){
                html += '<img class="wf-note-avatar" src="'+escTxt(uimg)+'" alt="">';
            }
            html += '<span class="wf-note-signer">'+escTxt(uname || '서명')+'</span>';
        }
        if(d.showUser){
            html += '<span class="wf-note-user">'+escTxt(uname)+'</span>';
        }
        if(d.showDate){
            var now = new Date();
            var ds = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
            html += '<span class="wf-note-date">'+ds+'</span>';
        }
        return html;
    }
    function applyNoteTexture(el, node){
        var d = node.data || {};
        if(d.noteTexture){
            el.style.backgroundImage = d.noteTexture;
            if(d.noteTextureBgSize) el.style.backgroundSize = d.noteTextureBgSize;
        }
    }
    function refreshNoteFooter(node){
        var el = document.getElementById('nd-'+node.id);
        if(!el) return;
        var footer = el.querySelector('.wf-note-footer');
        if(footer) footer.innerHTML = buildNoteFooter(node);
    }
    function refreshNoteFontStyle(node){
        var el = document.getElementById('nd-'+node.id);
        if(!el) return;
        var txt = el.querySelector('.wf-note-text');
        if(!txt) return;
        var d = node.data || {};
        txt.style.fontFamily = d.fontFamily || '';
        txt.style.fontSize = (d.fontSize || 13) + 'px';
        txt.style.fontWeight = d.fontBold ? '700':'';
        txt.style.textAlign = d.textAlign || 'left';
        txt.style.color = d.fontColor || '';
        // 수직 정렬
        var body = el.querySelector('.wf-note-body');
        if(body){
            var va = d.verticalAlign || 'top';
            body.style.justifyContent = va === 'middle' ? 'center' : va === 'bottom' ? 'flex-end' : 'flex-start';
        }
        scheduleLivePush();
    }
    function refreshTitleFontStyle(node){
        var el = document.getElementById('nd-'+node.id);
        if(!el) return;
        var txt = el.querySelector('.wf-title-text');
        if(!txt) return;
        var d = node.data || {};
        txt.style.fontFamily = d.fontFamily || '';
        txt.style.fontSize = (d.fontSize || 13) + 'px';
        txt.style.fontWeight = d.fontBold ? '700':'';
        txt.style.textAlign = d.textAlign || 'left';
        txt.style.color = d.fontColor || '';
        // 수직 정렬
        var va = d.verticalAlign || 'top';
        el.style.justifyContent = va === 'middle' ? 'center' : va === 'bottom' ? 'flex-end' : 'flex-start';
        scheduleLivePush();
    }

    function renderNodeEl(node){
        var nt = NODE_TYPES.find(function(t){ return t.type===node.type || t.type===(node.data&&node.data.type); }) || NODE_TYPES[1];
        var shape = nt.shape || '';
        var w = (node.size && node.size.w) || nt.w || 160;
        var h = (node.size && node.size.h) || nt.h || 56;
        var el = document.createElement('div');
        el.id = 'nd-'+node.id;
        el.setAttribute('data-shape', shape || 'node');

        if(shape === 'frame'){
            el.className = 'wf-shape wf-shape-frame';
            el.style.cssText = 'left:'+node.position.x+'px;top:'+node.position.y+'px;width:'+w+'px;height:'+h+'px;';
            el.innerHTML = '<div class="wf-frame-label wf-node-label">'+escTxt(node.data.name)+'</div>'
                + '<div class="wf-frame-body"></div>'
                + '<div class="wf-size-badge">'+Math.round(w)+' x '+Math.round(h)+'</div>';
        } else if(shape === 'title'){
            el.className = 'wf-shape wf-shape-title';
            var _tva = node.data.verticalAlign || 'top';
            var _tjc = _tva === 'middle' ? 'center' : _tva === 'bottom' ? 'flex-end' : 'flex-start';
            el.style.cssText = 'left:'+node.position.x+'px;top:'+node.position.y+'px;width:'+w+'px;height:'+h+'px;justify-content:'+_tjc+';';
            el.innerHTML = '<div class="wf-title-text wf-node-label"'+buildNoteFontStyle(node)+'>'+escTxt(node.data.name)+'</div>'
                + '<div class="wf-size-badge">'+Math.round(w)+' x '+Math.round(h)+'</div>';
            // 텍스트 노드 생성 시 즉시 편집 모드 진입
            if(!node.data.name || node.data.name === '텍스트'){
                node.data.name = '';
                setTimeout(function(){
                    var lbl = el.querySelector('.wf-title-text');
                    if(lbl) lbl.textContent = '';
                    el.dispatchEvent(new MouseEvent('dblclick', {bubbles:true}));
                }, 50);
            }
        } else if(shape === 'note'){
            el.className = 'wf-shape wf-shape-note';
            el.style.cssText = 'left:'+node.position.x+'px;top:'+node.position.y+'px;width:'+w+'px;height:'+h+'px;';
            var _nva = node.data.verticalAlign || 'top';
            var _nai = _nva === 'middle' ? 'center' : _nva === 'bottom' ? 'flex-end' : 'flex-start';
            var noteHtml = '<div class="wf-note-body" style="justify-content:'+_nai+'">'
                + '<div class="wf-note-text wf-node-label"'+buildNoteFontStyle(node)+'>'+escTxt(node.data.name)+'</div>'
                + '</div>';
            noteHtml += '<div class="wf-note-footer">';
            noteHtml += buildNoteFooter(node);
            noteHtml += '</div>';
            noteHtml += '<div class="wf-size-badge">'+Math.round(w)+' x '+Math.round(h)+'</div>';
            el.innerHTML = noteHtml;
            applyNoteTexture(el, node);
        } else if(shape === 'table'){
            el.className = 'wf-shape wf-shape-table';
            el.style.cssText = 'left:'+node.position.x+'px;top:'+node.position.y+'px;width:'+w+'px;height:'+h+'px;';
            var tRows = (node.data && node.data.tableRows) || 3;
            var tCols = (node.data && node.data.tableCols) || 3;
            var tCells = (node.data && node.data.tableCells) || [];
            var tStyles = node.data ? ensureTblCellStyles(node) : [];
            var tRowH = node.data ? ensureTblRowHeights(node) : [];
            var tColW = node.data ? ensureTblColWidths(node) : [];
            var tblHtml = '<table class="wf-tbl-inner"><colgroup>';
            for(var cg0=0; cg0<tCols; cg0++){
                tblHtml += '<col'+(tColW[cg0]>0?' style="width:'+tColW[cg0]+'px"':'')+'>';
            }
            tblHtml += '</colgroup><tbody>';
            for(var tbr=0; tbr<tRows; tbr++){
                tblHtml += '<tr'+(tRowH[tbr]>0?' style="height:'+tRowH[tbr]+'px"':'')+'>';
                for(var tbc=0; tbc<tCols; tbc++){
                    tblHtml += '<td contenteditable="true" spellcheck="false">'+escTxt(tCells[tbr] && tCells[tbr][tbc] ? tCells[tbr][tbc] : '')+'</td>';
                }
                tblHtml += '</tr>';
            }
            tblHtml += '</tbody></table>';
            tblHtml += '<div class="wf-size-badge">'+Math.round(w)+' x '+Math.round(h)+'</div>';
            el.innerHTML = tblHtml;

            // 셀 스타일 적용
            var tblAllCells = el.querySelectorAll('th, td');
            var tIdx = 0;
            for(var tsr=0; tsr<tRows; tsr++){
                for(var tsc=0; tsc<tCols; tsc++){
                    if(tblAllCells[tIdx]) applyCellStyle(tblAllCells[tIdx], tStyles[tsr] && tStyles[tsr][tsc]);
                    tIdx++;
                }
            }

            // 셀 이벤트 바인딩
            bindTableCellEvents(el, node);
            el._tblBound = true;
            // 행/열 드래그 리사이즈 핸들 (렌더링 후 딜레이)
            setTimeout(function(){ addTblResizeHandles(el, node); }, 0);
        } else if(shape === 'diamond'){
            el.className = 'wf-shape wf-shape-diamond';
            el.style.cssText = 'left:'+node.position.x+'px;top:'+node.position.y+'px;width:'+w+'px;height:'+h+'px;';
            el.innerHTML = '<div class="wf-diamond-inner">'
                + '<span class="wf-node-label">'+escTxt(node.data.name)+'</span></div>'
                + '<div class="wf-size-badge">'+Math.round(w)+' x '+Math.round(h)+'</div>';
        } else if(shape === 'circle'){
            el.className = 'wf-shape wf-shape-circle';
            el.style.cssText = 'left:'+node.position.x+'px;top:'+node.position.y+'px;width:'+w+'px;height:'+h+'px;';
            el.innerHTML = '<span class="wf-node-label">'+escTxt(node.data.name)+'</span>'
                + '<div class="wf-size-badge">'+Math.round(w)+' x '+Math.round(h)+'</div>';
        } else if(shape === 'rect'){
            el.className = 'wf-shape wf-shape-rect';
            el.style.cssText = 'left:'+node.position.x+'px;top:'+node.position.y+'px;width:'+w+'px;height:'+h+'px;border-color:'+nt.color+';';
            el.innerHTML = '<span class="wf-node-label">'+escTxt(node.data.name)+'</span>'
                + '<div class="wf-size-badge">'+Math.round(w)+' x '+Math.round(h)+'</div>';
        } else if(shape === 'rounded_rect'){
            el.className = 'wf-shape wf-shape-rounded-rect';
            el.style.cssText = 'left:'+node.position.x+'px;top:'+node.position.y+'px;width:'+w+'px;height:'+h+'px;';
            el.innerHTML = '<span class="wf-node-label">'+escTxt(node.data.name)+'</span>'
                + '<div class="wf-size-badge">'+Math.round(w)+' x '+Math.round(h)+'</div>';
        } else if(shape === 'ellipse'){
            el.className = 'wf-shape wf-shape-ellipse';
            el.style.cssText = 'left:'+node.position.x+'px;top:'+node.position.y+'px;width:'+w+'px;height:'+h+'px;';
            el.innerHTML = '<span class="wf-node-label">'+escTxt(node.data.name)+'</span>'
                + '<div class="wf-size-badge">'+Math.round(w)+' x '+Math.round(h)+'</div>';
        } else if(shape === 'triangle'){
            el.className = 'wf-shape wf-shape-triangle';
            el.style.cssText = 'left:'+node.position.x+'px;top:'+node.position.y+'px;width:'+w+'px;height:'+h+'px;';
            el.innerHTML = '<svg class="wf-svg-shape" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="50,5 95,95 5,95"/></svg>'
                + '<span class="wf-node-label">'+escTxt(node.data.name)+'</span>'
                + '<div class="wf-size-badge">'+Math.round(w)+' x '+Math.round(h)+'</div>';
        } else if(shape === 'pentagon'){
            el.className = 'wf-shape wf-shape-pentagon';
            el.style.cssText = 'left:'+node.position.x+'px;top:'+node.position.y+'px;width:'+w+'px;height:'+h+'px;';
            el.innerHTML = '<svg class="wf-svg-shape" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="50,5 97,38 80,95 20,95 3,38"/></svg>'
                + '<span class="wf-node-label">'+escTxt(node.data.name)+'</span>'
                + '<div class="wf-size-badge">'+Math.round(w)+' x '+Math.round(h)+'</div>';
        } else if(shape === 'hexagon'){
            el.className = 'wf-shape wf-shape-hexagon';
            el.style.cssText = 'left:'+node.position.x+'px;top:'+node.position.y+'px;width:'+w+'px;height:'+h+'px;';
            el.innerHTML = '<svg class="wf-svg-shape" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="25,5 75,5 97,50 75,95 25,95 3,50"/></svg>'
                + '<span class="wf-node-label">'+escTxt(node.data.name)+'</span>'
                + '<div class="wf-size-badge">'+Math.round(w)+' x '+Math.round(h)+'</div>';
        } else if(shape === 'star'){
            el.className = 'wf-shape wf-shape-star';
            el.style.cssText = 'left:'+node.position.x+'px;top:'+node.position.y+'px;width:'+w+'px;height:'+h+'px;';
            el.innerHTML = '<svg class="wf-svg-shape" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="50,5 61,37 95,38 68,58 79,91 50,71 21,91 32,58 5,38 39,37"/></svg>'
                + '<span class="wf-node-label">'+escTxt(node.data.name)+'</span>'
                + '<div class="wf-size-badge">'+Math.round(w)+' x '+Math.round(h)+'</div>';
        } else if(shape === 'parallelogram'){
            el.className = 'wf-shape wf-shape-parallelogram';
            el.style.cssText = 'left:'+node.position.x+'px;top:'+node.position.y+'px;width:'+w+'px;height:'+h+'px;';
            el.innerHTML = '<svg class="wf-svg-shape" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="20,5 95,5 80,95 5,95"/></svg>'
                + '<span class="wf-node-label">'+escTxt(node.data.name)+'</span>'
                + '<div class="wf-size-badge">'+Math.round(w)+' x '+Math.round(h)+'</div>';
        } else if(shape === 'trapezoid'){
            el.className = 'wf-shape wf-shape-trapezoid';
            el.style.cssText = 'left:'+node.position.x+'px;top:'+node.position.y+'px;width:'+w+'px;height:'+h+'px;';
            el.innerHTML = '<svg class="wf-svg-shape" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="15,5 85,5 95,95 5,95"/></svg>'
                + '<span class="wf-node-label">'+escTxt(node.data.name)+'</span>'
                + '<div class="wf-size-badge">'+Math.round(w)+' x '+Math.round(h)+'</div>';
        } else if(shape === 'cylinder'){
            el.className = 'wf-shape wf-shape-cylinder';
            el.style.cssText = 'left:'+node.position.x+'px;top:'+node.position.y+'px;width:'+w+'px;height:'+h+'px;';
            el.innerHTML = '<svg class="wf-svg-shape" viewBox="0 0 100 120" preserveAspectRatio="none">'
                + '<ellipse cx="50" cy="15" rx="45" ry="12" fill="none"/>'
                + '<path d="M5 15v90c0 6.6 20.1 12 45 12s45-5.4 45-12V15" fill="none"/>'
                + '<ellipse cx="50" cy="105" rx="45" ry="12" fill="none"/>'
                + '</svg>'
                + '<span class="wf-node-label">'+escTxt(node.data.name)+'</span>'
                + '<div class="wf-size-badge">'+Math.round(w)+' x '+Math.round(h)+'</div>';
        } else if(shape === 'arrow_right'){
            el.className = 'wf-shape wf-shape-arrow-right';
            el.style.cssText = 'left:'+node.position.x+'px;top:'+node.position.y+'px;width:'+w+'px;height:'+h+'px;';
            el.innerHTML = '<svg class="wf-svg-shape" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="5,25 65,25 65,5 95,50 65,95 65,75 5,75"/></svg>'
                + '<span class="wf-node-label">'+escTxt(node.data.name)+'</span>'
                + '<div class="wf-size-badge">'+Math.round(w)+' x '+Math.round(h)+'</div>';
        } else if(shape === 'cross'){
            el.className = 'wf-shape wf-shape-cross';
            el.style.cssText = 'left:'+node.position.x+'px;top:'+node.position.y+'px;width:'+w+'px;height:'+h+'px;';
            el.innerHTML = '<svg class="wf-svg-shape" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="35,5 65,5 65,35 95,35 95,65 65,65 65,95 35,95 35,65 5,65 5,35 35,35"/></svg>'
                + '<span class="wf-node-label">'+escTxt(node.data.name)+'</span>'
                + '<div class="wf-size-badge">'+Math.round(w)+' x '+Math.round(h)+'</div>';
        } else if(shape === 'callout'){
            el.className = 'wf-shape wf-shape-callout';
            el.style.cssText = 'left:'+node.position.x+'px;top:'+node.position.y+'px;width:'+w+'px;height:'+h+'px;';
            el.innerHTML = '<svg class="wf-svg-shape" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M5 5h90v65H55l-15 25v-25H5z"/></svg>'
                + '<span class="wf-node-label">'+escTxt(node.data.name)+'</span>'
                + '<div class="wf-size-badge">'+Math.round(w)+' x '+Math.round(h)+'</div>';
        } else if(shape === 'er_table'){
            el.className = 'wf-shape wf-shape-er-table';
            el.style.cssText = 'left:'+node.position.x+'px;top:'+node.position.y+'px;width:'+w+'px;height:'+h+'px;background-color:#ffffff;';
            el.innerHTML = buildErTableHtml(node, w, h);
            bindErTableEvents(el, node);
        } else if(shape === 'mindmap'){
            el.className = 'wf-shape wf-shape-mindmap';
            el.style.cssText = 'left:'+node.position.x+'px;top:'+node.position.y+'px;width:'+w+'px;height:'+h+'px;';
            el.innerHTML = '<div class="wf-mm-content"></div>'
                + '<div class="wf-size-badge">'+Math.round(w)+' x '+Math.round(h)+'</div>';
            setTimeout(function(){ rerenderMindmap(node); }, 0);
            mmBindEvents(el, node);
        } else if(nt.imgSrc){
            // 이미지 기반 도형 (네트워크, 카드, 회사, 날씨, 크리스마스, 할로윈)
            el.className = 'wf-shape wf-shape-img';
            el.style.cssText = 'left:'+node.position.x+'px;top:'+node.position.y+'px;width:'+w+'px;height:'+h+'px;';
            el.innerHTML = '<img src="'+escTxt(nt.imgSrc)+'" class="wf-shape-img-inner" draggable="false">'
                + '<div class="wf-size-badge">'+Math.round(w)+' x '+Math.round(h)+'</div>';
        } else if(nt.svgContent){
            // 동적 등록 SVG 도형
            el.className = 'wf-shape wf-shape-svg-generic';
            el.style.cssText = 'left:'+node.position.x+'px;top:'+node.position.y+'px;width:'+w+'px;height:'+h+'px;';
            el.innerHTML = '<svg class="wf-svg-shape" viewBox="'+(nt.svgViewBox||'0 0 100 100')+'" preserveAspectRatio="none">'+nt.svgContent.replace(/stroke="currentColor"/g,'stroke="#1e293b"').replace(/fill="currentColor"/g,'fill="#1e293b"')+'</svg>'
                + '<span class="wf-node-label">'+escTxt(node.data.name)+'</span>'
                + '<div class="wf-size-badge">'+Math.round(w)+' x '+Math.round(h)+'</div>';
        } else {
            el.className = 'wf-node';
            el.style.cssText = 'left:'+node.position.x+'px;top:'+node.position.y+'px;border-color:'+nt.color+';';
            el.innerHTML = ''
                + '<div class="wf-node-header">'
                + '  <span class="wf-node-icon">'+nt.icon+'</span>'
                + '  <span class="wf-node-label">'+escTxt(node.data.name)+'</span>'
                + '</div>'
                + '<div class="wf-node-type-tag">'+nt.label+'</div>';
        }

        // 포트 (4방향: right, left, top, bottom) — ER 테이블은 컸럼별 포트 사용
        if(shape !== 'er_table'){
            var portDirs = ['right','left','top','bottom'];
            portDirs.forEach(function(dir){
                var p = document.createElement('div');
                p.className = 'wf-port wf-port-' + dir;
                p.style.background = nt.color;
                p.setAttribute('data-node', node.id);
                p.setAttribute('data-port-dir', dir);
                el.appendChild(p);
            });
        }

        // ── 4-코너 리사이즈 핸들 ──
        if(shape){
            var corners = ['tl','tr','bl','br'];
            corners.forEach(function(pos){
                var hd = document.createElement('div');
                hd.className = 'wf-resize-handle wf-rh-'+pos;
                el.appendChild(hd);
            });

            var resizing = false, resCorner='', resStartX, resStartY, resOrigX, resOrigY, resOrigW, resOrigH;
            el.addEventListener('mousedown', function(e){
                var hd = e.target.closest('.wf-resize-handle');
                if(!hd) return;
                e.stopPropagation();
                e.preventDefault();
                resizing = true;
                resCorner = hd.classList.contains('wf-rh-tl') ? 'tl' :
                            hd.classList.contains('wf-rh-tr') ? 'tr' :
                            hd.classList.contains('wf-rh-bl') ? 'bl' : 'br';
                resStartX = e.clientX;
                resStartY = e.clientY;
                resOrigX = node.position.x;
                resOrigY = node.position.y;
                resOrigW = node.size.w;
                resOrigH = node.size.h;
            });
            document.addEventListener('mousemove', function(e){
                if(!resizing) return;
                var dx = (e.clientX - resStartX) / zoom;
                var dy = (e.clientY - resStartY) / zoom;
                var nw, nh, nx, ny;
                if(resCorner === 'br'){
                    nw = Math.max(60, resOrigW + dx);
                    nh = Math.max(40, resOrigH + dy);
                    nx = resOrigX; ny = resOrigY;
                } else if(resCorner === 'bl'){
                    nw = Math.max(60, resOrigW - dx);
                    nh = Math.max(40, resOrigH + dy);
                    nx = resOrigX + (resOrigW - nw); ny = resOrigY;
                } else if(resCorner === 'tr'){
                    nw = Math.max(60, resOrigW + dx);
                    nh = Math.max(40, resOrigH - dy);
                    nx = resOrigX; ny = resOrigY + (resOrigH - nh);
                } else {
                    nw = Math.max(60, resOrigW - dx);
                    nh = Math.max(40, resOrigH - dy);
                    nx = resOrigX + (resOrigW - nw);
                    ny = resOrigY + (resOrigH - nh);
                }
                node.size.w = nw; node.size.h = nh;
                node.position.x = nx; node.position.y = ny;
                el.style.width  = nw + 'px';
                el.style.height = nh + 'px';
                el.style.left   = nx + 'px';
                el.style.top    = ny + 'px';
                updateSizeBadge(node);
                positionCtxBar(node);
                if(node.type==='note') positionNoteBar(node);
                if(node.type==='table') positionTblBar(node);
                if(node.type==='er_table') positionErTblBar(node);
                drawEdges();
            });
            document.addEventListener('mouseup', function(){
                resizing = false;
            });

            // ── 회전 핸들 (table, mindmap 제외) ──
            var canRotate = shape !== 'table' && shape !== 'mindmap';
            if(canRotate){
                var rotTether = document.createElement('div');
                rotTether.className = 'wf-rotate-tether';
                el.appendChild(rotTether);
                var rotHandle = document.createElement('div');
                rotHandle.className = 'wf-rotate-handle';
                rotHandle.title = '회전';
                rotHandle.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14.93-4"/><polyline points="19 3 19 8 14 8"/></svg>';
                el.appendChild(rotHandle);
                // 저장된 회전 적용
                if(node.data.rotation){
                    el.style.transform = 'rotate('+node.data.rotation+'deg)';
                }
                var rotating = false, rotCx, rotCy, rotStartAngle, rotOrigDeg;
                rotHandle.addEventListener('mousedown', function(re){
                    re.stopPropagation(); re.preventDefault();
                    rotating = true;
                    pushUndo();
                    var rect = el.getBoundingClientRect();
                    rotCx = rect.left + rect.width / 2;
                    rotCy = rect.top + rect.height / 2;
                    rotOrigDeg = node.data.rotation || 0;
                    rotStartAngle = Math.atan2(re.clientY - rotCy, re.clientX - rotCx) * 180 / Math.PI;
                });
                document.addEventListener('mousemove', function(re){
                    if(!rotating) return;
                    var curAngle = Math.atan2(re.clientY - rotCy, re.clientX - rotCx) * 180 / Math.PI;
                    var delta = curAngle - rotStartAngle;
                    var deg = rotOrigDeg + delta;
                    // Shift 키로 15도 스냅
                    if(re.shiftKey) deg = Math.round(deg / 15) * 15;
                    node.data.rotation = deg;
                    el.style.transform = 'rotate('+deg+'deg)';
                    drawEdges();
                });
                document.addEventListener('mouseup', function(){
                    if(rotating){ rotating = false; scheduleLivePush(); }
                });
            }
        }

        // ── 인라인 이름 편집 (더블클릭) ──
        el.addEventListener('dblclick', function(e){
            e.stopPropagation();
            var labelEl = el.querySelector('.wf-node-label');
            if(!labelEl) return;
            var oldText = node.data.name || '';
            var isNote = (node.type === 'note');
            var isTitle = (node.type === 'title');
            if(isNote || isTitle){
                // 메모: textarea로 편집
                var ta = document.createElement('textarea');
                ta.value = oldText;
                ta.className = 'wf-inline-edit wf-note-edit';
                ta.spellcheck = false;
                ta.style.cssText = 'font:inherit;font-size:inherit;font-weight:inherit;color:inherit;background:transparent;border:none;outline:none;width:100%;height:100%;resize:none;padding:'+(isTitle?'0 4px':'0')+';z-index:60;text-align:'+(node.data.textAlign||'left')+';';
                if(node.data.fontFamily) ta.style.fontFamily = node.data.fontFamily;
                if(node.data.fontSize) ta.style.fontSize = node.data.fontSize + 'px';
                if(node.data.fontBold) ta.style.fontWeight = '700';
                labelEl.style.display = 'none';
                labelEl.parentElement.insertBefore(ta, labelEl);
                ta.focus();
                ta.select();
                function commitNote(){
                    var v = (ta.value || '').trim();
                    node.data.name = v;
                    labelEl.textContent = v;
                    labelEl.style.display = '';
                    if(ta.parentElement) ta.remove();
                }
                ta.addEventListener('blur', commitNote);
                ta.addEventListener('keydown', function(ev){
                    if(ev.key==='Escape'){ ta.value=oldText; commitNote(); }
                    ev.stopPropagation();
                });
            } else {
                var input = document.createElement('input');
                input.type = 'text';
                input.value = oldText;
                input.className = 'wf-inline-edit';
                input.spellcheck = false;
                if(labelEl.classList.contains('wf-frame-label')){
                    input.style.cssText = 'position:absolute;top:-24px;left:0;font-size:12px;font-weight:600;color:#64748b;background:transparent;border:none;border-bottom:1.5px solid #52a8ec;outline:none;padding:0 2px;min-width:60px;z-index:60;';
                } else {
                    input.style.cssText = 'font:inherit;font-size:inherit;font-weight:inherit;color:inherit;background:transparent;border:none;border-bottom:1.5px solid #52a8ec;outline:none;text-align:center;width:100%;min-width:40px;z-index:60;padding:0;';
                }
                labelEl.style.display = 'none';
                labelEl.parentElement.insertBefore(input, labelEl);
                input.focus();
                input.select();
                function commit(){
                    var v = (input.value || '').trim();
                    node.data.name = v;
                    labelEl.textContent = v;
                    labelEl.style.display = '';
                    if(input.parentElement) input.remove();
                    scheduleLivePush();
                }
                input.addEventListener('blur', commit);
                input.addEventListener('keydown', function(ev){
                    if(ev.key==='Enter'){ ev.preventDefault(); commit(); }
                    if(ev.key==='Escape'){ input.value=oldText; commit(); }
                    ev.stopPropagation();
                });
            }
        });

        // ── 노드 드래그 이동 ──
        var dragging = false, dragStartX, dragStartY, origX, origY;
        el.addEventListener('mousedown', function(e){
            if(e.target.classList.contains('wf-port')) return;
            if(e.target.closest('.wf-resize-handle')) return;
            if(e.target.closest('.wf-rotate-handle')) return;
            // 표 셀 편집 중에는 드래그 차단
            if(e.target.closest('th, td')) return;
            // 표 행/열 리사이즈 핸들
            if(e.target.closest('.wf-tbl-rh')) return;
            if(e.button !== 0) return;
            // ── 연결 모드 ──
            if(currentTool === 'connect'){
                if(_lineDrawing){
                    // 이미 라인 그리기 중 → 이 노드를 끝점으로 연결 완성
                    _lineDrawing = false;
                    if(_linePreview && _linePreview.parentElement) _linePreview.remove();
                    _linePreview = null;
                    var _srcNode = _lineStartNodeId || null;
                    if(!_srcNode){
                        nodes.forEach(function(nd){
                            var nx = nd.position.x, ny = nd.position.y;
                            var sw = (nd.size && nd.size.w) || 160, sh = (nd.size && nd.size.h) || 56;
                            var pad = 20;
                            if(_lineStartX >= nx - pad && _lineStartX <= nx + sw + pad &&
                               _lineStartY >= ny - pad && _lineStartY <= ny + sh + pad){
                                _srcNode = nd.id;
                            }
                        });
                    }
                    if(_srcNode && _srcNode !== node.id){
                        var _dupChk2 = edges.some(function(eg){ return (eg.source===_srcNode && eg.target===node.id) || (eg.source===node.id && eg.target===_srcNode); });
                        if(!_dupChk2){
                            pushUndo();
                            var _ls = _pendingLineStyle || 'elbow_arrow';
                            var ne2 = {
                                id:'edge_'+_srcNode+'_'+node.id, source:_srcNode, target:node.id,
                                style:_ls, color:'#1a1a1a', width:2, opacity:1, dash:'solid',
                                startMarker:'none', endMarker: _ls.indexOf('arrow')>=0?'arrow':'none', label:''
                            };
                            edges.push(ne2);
                            drawEdges();
                            selectEdge(ne2);
                            scheduleLivePush();
                        }
                    }
                    _lineStartNodeId = null;
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                // 라인 그리기 시작: 노드 중심에서 출발
                deselectEdge();
                selectNode(null);
                var nw = el.offsetWidth, nh = el.offsetHeight;
                // 시작점을 타겟 방향 포트 대신 노드 중심에서 시작 (drawEdges가 최적 포트 산출)
                _lineStartX = node.position.x + nw / 2;
                _lineStartY = node.position.y + nh / 2;
                _lineStartNodeId = node.id;
                _lineDrawing = true;
                worldEl.classList.add('wf-connecting');
                _linePreview = document.createElementNS('http://www.w3.org/2000/svg','svg');
                _linePreview.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:999;';
                var pLine = document.createElementNS('http://www.w3.org/2000/svg','polyline');
                pLine.setAttribute('points', _lineStartX+','+_lineStartY+' '+_lineStartX+','+_lineStartY);
                pLine.setAttribute('stroke','#7c5cfc'); pLine.setAttribute('stroke-width','2');
                pLine.setAttribute('stroke-dasharray','6 3');
                pLine.setAttribute('fill','none');
                _linePreview.appendChild(pLine);
                worldEl.appendChild(_linePreview);
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            // 다른 노드의 인라인 편집 종료
            var activeEdit = worldEl.querySelector('.wf-inline-edit');
            if(activeEdit && !el.contains(activeEdit)) activeEdit.blur();
            // 다른 노드의 ER 인라인 편집 종료
            var activeErEdit = worldEl.querySelector('.wf-ert-edit-name, .wf-ert-edit-type');
            if(activeErEdit && !el.contains(activeErEdit)) activeErEdit.blur();
            // 다중 선택에 포함되지 않은 노드 클릭 시 다중 선택 해제
            if(_selectedNodes.length > 0 && _selectedNodes.indexOf(node) < 0 && !e.shiftKey){
                _selectedNodes.forEach(function(n){
                    var nel = document.getElementById('nd-'+n.id);
                    if(nel) nel.classList.remove('selected');
                });
                _selectedNodes = [];
            }
            dragging = true;
            _wasDragged = false;
            pushUndo();
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            origX = node.position.x;
            origY = node.position.y;
            // 다중 드래그 원본 위치 저장
            _multiDragOrigins = [];
            if(_selectedNodes.indexOf(node) >= 0 && _selectedNodes.length > 1){
                _selectedNodes.forEach(function(n){
                    _multiDragOrigins.push({node: n, ox: n.position.x, oy: n.position.y});
                });
            }
            el.style.zIndex = '50';
            e.preventDefault();
            e.stopPropagation();
        });
        document.addEventListener('mousemove', function(e){
            if(!dragging) return;
            _wasDragged = true;
            var dx = (e.clientX - dragStartX) / zoom;
            var dy = (e.clientY - dragStartY) / zoom;
            if(_multiDragOrigins.length > 0){
                _multiDragOrigins.forEach(function(d){
                    d.node.position.x = d.ox + dx;
                    d.node.position.y = d.oy + dy;
                    var nel = document.getElementById('nd-'+d.node.id);
                    if(nel){
                        nel.style.left = d.node.position.x+'px';
                        nel.style.top  = d.node.position.y+'px';
                    }
                });
            } else {
                node.position.x = origX + dx;
                node.position.y = origY + dy;
                el.style.left = node.position.x+'px';
                el.style.top  = node.position.y+'px';
            }
            positionCtxBar(node);
            if(node.type==='note') positionNoteBar(node);
            if(node.type==='table') positionTblBar(node);
            if(node.type==='er_table') positionErTblBar(node);
            drawEdges();
        });
        document.addEventListener('mouseup', function(){
            if(dragging){ dragging = false; var ni = nodes.indexOf(node); el.style.zIndex = ni >= 0 ? (11 + ni) : 11; _multiDragOrigins = []; scheduleLivePush(); }
        });

        // ── 클릭 선택 ──
        el.addEventListener('click', function(e){
            e.stopPropagation();
            if(_wasDragged){ _wasDragged = false; return; }
            if(e.shiftKey){
                var si = _selectedNodes.indexOf(node);
                if(si >= 0){
                    _selectedNodes.splice(si, 1);
                    var nel = document.getElementById('nd-'+node.id);
                    if(nel) nel.classList.remove('selected');
                    selectedNode = _selectedNodes.length > 0 ? _selectedNodes[0] : null;
                    if(!selectedNode){ positionCtxBar(null); positionNoteBar(null); positionTblBar(null); positionErTblBar(null); }
                } else {
                    if(_selectedNodes.length === 0 && selectedNode){
                        _selectedNodes.push(selectedNode);
                    }
                    _selectedNodes.push(node);
                    var nel2 = document.getElementById('nd-'+node.id);
                    if(nel2) nel2.classList.add('selected');
                    selectedNode = node;
                }
                if(_selectedNodes.length > 1){
                    positionCtxBar(null); positionNoteBar(null); positionTblBar(null); positionErTblBar(null);
                    propsPanel.classList.remove('open');
                }
                return;
            }
            selectNode(node);
        });

        // ── 엣지 연결 (포트 드래그) ──
        var edgeDrag = false, edgeSource = null, edgeSourceCol = -1;
        var allPorts = el.querySelectorAll('.wf-port, .wf-ert-port');
        for(var _pi = 0; _pi < allPorts.length; _pi++){
            (function(port){
                port.addEventListener('mousedown', function(e){
                    e.stopPropagation();
                    e.preventDefault();
                    edgeDrag = true;
                    edgeSource = node.id;
                    _portDragSrcNodeId = node.id;
                    edgeSourceCol = port.hasAttribute('data-col-idx') ? parseInt(port.getAttribute('data-col-idx')) : -1;
                    // 미리보기 선 시작점 계산
                    var dir = port.getAttribute('data-port-dir') || 'right';
                    var nL = parseInt(el.style.left)||0, nT = parseInt(el.style.top)||0;
                    var nW = el.offsetWidth, nH = el.offsetHeight;
                    if(port.classList.contains('wf-ert-port')){
                        var rowEl = port.closest('.wf-ert-row');
                        var inner = el.querySelector('.wf-ert-inner');
                        var innerOff = inner ? inner.offsetTop : 0;
                        var ry = rowEl ? (innerOff + rowEl.offsetTop + rowEl.offsetHeight/2) : nH/2;
                        _portDragSrcX = dir==='left' ? nL : nL + nW;
                        _portDragSrcY = nT + ry;
                    } else {
                        if(dir==='right'){ _portDragSrcX=nL+nW; _portDragSrcY=nT+nH/2; }
                        else if(dir==='left'){ _portDragSrcX=nL; _portDragSrcY=nT+nH/2; }
                        else if(dir==='top'){ _portDragSrcX=nL+nW/2; _portDragSrcY=nT; }
                        else { _portDragSrcX=nL+nW/2; _portDragSrcY=nT+nH; }
                    }
                    _portDragActive = true;
                    worldEl.classList.add('wf-connecting');
                    // 미리보기 SVG 꺾인선 생성
                    if(!_portDragLine){
                        var ns = 'http://www.w3.org/2000/svg';
                        var sv = document.createElementNS(ns,'svg');
                        sv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:9999;';
                        sv.setAttribute('class','wf-port-drag-preview');
                        var ln = document.createElementNS(ns,'polyline');
                        ln.setAttribute('stroke','#3b82f6');
                        ln.setAttribute('stroke-width','2');
                        ln.setAttribute('stroke-dasharray','6 3');
                        ln.setAttribute('fill','none');
                        sv.appendChild(ln);
                        worldEl.appendChild(sv);
                        _portDragLine = ln;
                    }
                    var sp = _portDragSrcX+','+_portDragSrcY;
                    _portDragLine.setAttribute('points', sp+' '+sp);
                    _portDragLine.parentElement.style.display = '';
                });
            })(allPorts[_pi]);
        }
        document.addEventListener('mouseup', function(e){
            if(!edgeDrag) return;
            edgeDrag = false;
            // 근접 감지: 50px 반경 내 가장 가까운 포트
            var rect = worldEl.getBoundingClientRect();
            var cx = (e.clientX - rect.left) / zoom;
            var cy = (e.clientY - rect.top) / zoom;
            var snapR = 50, bestPort = null, bestDist = snapR;
            var allTargetPorts = worldEl.querySelectorAll('.wf-port, .wf-ert-port');
            for(var _ti = 0; _ti < allTargetPorts.length; _ti++){
                var tp = allTargetPorts[_ti];
                var tnid = tp.getAttribute('data-node');
                if(tnid === edgeSource) continue;
                var nel = tp.closest('.wf-node, .wf-shape, .wf-shape-svg-generic');
                if(!nel) nel = tp.parentElement;
                if(!nel) continue;
                var px2, py2;
                if(tp.classList.contains('wf-ert-port')){
                    // ER 컸럼 포트: 행 중앙에서 좌우 위치
                    var rowEl = tp.closest('.wf-ert-row');
                    if(!rowEl) continue;
                    var erEl = tp.closest('.wf-shape-er-table');
                    if(!erEl) continue;
                    var erL = parseInt(erEl.style.left)||0, erT = parseInt(erEl.style.top)||0;
                    var erW = erEl.offsetWidth;
                    var rowTop = rowEl.offsetTop + (erEl.querySelector('.wf-ert-inner') ? erEl.querySelector('.wf-ert-inner').offsetTop : 0);
                    var rowMidY = erT + rowTop + rowEl.offsetHeight / 2;
                    var dir2 = tp.getAttribute('data-port-dir') || 'right';
                    px2 = dir2 === 'left' ? erL : erL + erW;
                    py2 = rowMidY;
                } else {
                    var nl = parseInt(nel.style.left)||0, nt2 = parseInt(nel.style.top)||0;
                    var nw = nel.offsetWidth, nh = nel.offsetHeight;
                    var dir = tp.getAttribute('data-port-dir') || '';
                    if(dir === 'right'){ px2 = nl + nw; py2 = nt2 + nh/2; }
                    else if(dir === 'left'){ px2 = nl; py2 = nt2 + nh/2; }
                    else if(dir === 'top'){ px2 = nl + nw/2; py2 = nt2; }
                    else if(dir === 'bottom'){ px2 = nl + nw/2; py2 = nt2 + nh; }
                    else continue;
                }
                var dd = Math.sqrt((cx - px2)*(cx - px2) + (cy - py2)*(cy - py2));
                if(dd < bestDist){ bestDist = dd; bestPort = tp; }
            }
            if(!bestPort){
                var target = document.elementFromPoint(e.clientX, e.clientY);
                if(target && (target.classList.contains('wf-port') || target.classList.contains('wf-ert-port'))){
                    var tnid2 = target.getAttribute('data-node');
                    if(tnid2 && tnid2 !== edgeSource) bestPort = target;
                }
            }
            if(!bestPort){
                var _bbPad = 10;
                for(var _bi = 0; _bi < allTargetPorts.length; _bi++){
                    var _bp = allTargetPorts[_bi];
                    var _bnid = _bp.getAttribute('data-node');
                    if(_bnid === edgeSource) continue;
                    var _bEl = _bp.closest('.wf-node, .wf-shape, .wf-shape-svg-generic') || _bp.parentElement;
                    if(!_bEl) continue;
                    var _bL = parseInt(_bEl.style.left)||0, _bT = parseInt(_bEl.style.top)||0;
                    var _bW = _bEl.offsetWidth, _bH = _bEl.offsetHeight;
                    if(cx >= _bL - _bbPad && cx <= _bL + _bW + _bbPad &&
                       cy >= _bT - _bbPad && cy <= _bT + _bH + _bbPad){
                        bestPort = _bp;
                        break;
                    }
                }
            }
            if(bestPort){
                var targetNode = bestPort.getAttribute('data-node');
                var targetCol = bestPort.hasAttribute('data-col-idx') ? parseInt(bestPort.getAttribute('data-col-idx')) : -1;
                if(targetNode && targetNode !== edgeSource){
                    var edgeId = 'edge_'+edgeSource+'_'+targetNode+'_'+(edgeSourceCol>=0?edgeSourceCol:'x')+'_'+(targetCol>=0?targetCol:'x');
                    var exists = edges.some(function(eg){ return eg.id === edgeId; });
                    if(!exists){
                        pushUndo();
                        var isErCol = edgeSourceCol >= 0 || targetCol >= 0;
                        var _ps = isErCol ? 'elbow_arrow' : (_pendingLineStyle || 'straight_arrow');
                        var newEdge = {id:edgeId, source:edgeSource, target:targetNode, style:_ps,
                            color:'#1a1a1a', width:2, opacity:1, dash:'solid',
                            startMarker:'none', endMarker: _ps.indexOf('arrow')>=0?'arrow':'none', label:''};
                        if(edgeSourceCol >= 0) newEdge.sourceCol = edgeSourceCol;
                        if(targetCol >= 0) newEdge.targetCol = targetCol;
                        edges.push(newEdge);
                        drawEdges();
                        scheduleLivePush();
                    }
                }
            }
            edgeSource = null;
            edgeSourceCol = -1;
            // 미리보기 선 제거 + 연결 모드 해제
            _portDragActive = false;
            _portDragSrcNodeId = null;
            worldEl.classList.remove('wf-connecting');
            var _prevCT = worldEl.querySelector('.wf-connect-target');
            if(_prevCT) _prevCT.classList.remove('wf-connect-target');
            if(_portDragLine && _portDragLine.parentElement){
                _portDragLine.parentElement.style.display = 'none';
            }
        });

        // ── 우클릭 컨텍스트 메뉴 ──
        el.addEventListener('contextmenu', function(e){
            e.preventDefault();
            e.stopPropagation();
            selectNode(node);
            showCtxMenu(e.clientX, e.clientY, node);
        });

        worldEl.appendChild(el);
    }

    // ER 테이블: 열린 인라인 편집을 모두 강제 커밋/정리
    function closeAllErEditors(){
        var openEdits = worldEl.querySelectorAll('.wf-ert-edit-name');
        for(var oe = 0; oe < openEdits.length; oe++){
            var row = openEdits[oe].closest('.wf-ert-row');
            if(!row) continue;
            var erEl = row.closest('.wf-shape-er-table');
            if(!erEl) continue;
            var nid = erEl.id.replace('nd-','');
            var nd = nodes.find(function(n){ return n.id === nid; });
            if(!nd) continue;
            var idx = parseInt(row.getAttribute('data-idx'));
            var col = nd.data.erColumns[idx];
            if(!col) continue;
            var nameInp = row.querySelector('.wf-ert-edit-name');
            var typeInp = row.querySelector('.wf-ert-edit-type');
            var chkInputs = row.querySelectorAll('.wf-ert-edit-chk input');
            if(nameInp) col.name = (nameInp.value || '').trim() || col.name;
            if(typeInp) col.type = (typeInp.value || '').trim() || col.type;
            if(chkInputs.length >= 2){ col.pk = chkInputs[0].checked; col.nn = chkInputs[1].checked; }
            if(col.pk) col.nn = true;
            rerenderErTable(nd);
            scheduleLivePush();
        }
    }

    function selectNode(node){
        _selectedNodes = [];
        if(!_mmSelectFlag){
            _mmSelectedBranch = null;
            var mmSels = worldEl.querySelectorAll('.wf-mm-selected');
            for(var msi=0; msi<mmSels.length; msi++) mmSels[msi].classList.remove('wf-mm-selected');
        }
        // ER 테이블 인라인 편집 종료: 열린 편집 행을 강제 커밋
        closeAllErEditors();
        selectedNode = node;
        deselectEdge();

        var allNodes = worldEl.querySelectorAll('.wf-node, .wf-shape');
        for(var i=0; i<allNodes.length; i++) allNodes[i].classList.remove('selected');

        var allBadges = worldEl.querySelectorAll('.wf-size-badge');
        for(var b=0; b<allBadges.length; b++) allBadges[b].style.display = 'none';

        if(node){
            var el = document.getElementById('nd-'+node.id);
            if(el) el.classList.add('selected');

            var nt = NODE_TYPES.find(function(t){ return t.type===node.type; });
            var isShape = nt && nt.category === 'shape';

            var badge = el ? el.querySelector('.wf-size-badge') : null;
            if(badge) badge.style.display = '';

            positionCtxBar(node);
            // 메모/텍스트 서식 툴바
            if(node.type === 'note' || node.type === 'title'){
                positionNoteBar(node);
                syncNoteBar(node);
            } else {
                positionNoteBar(null);
            }
            // 표 서식 툴바
            if(node.type === 'table'){
                positionTblBar(node);
                syncTblBar(node);
                // 셀 포커스 이벤트 바인딩 (최초 선택 시)
                var tblEl = document.getElementById('nd-'+node.id);
                if(tblEl && !tblEl._tblBound){
                    bindTableCellEvents(tblEl, node);
                    tblEl._tblBound = true;
                }
            } else {
                positionTblBar(null);
            }
            // ER 테이블 툴바 (컨텍스트 바 대신 사용)
            if(node.type === 'er_table'){
                positionCtxBar(null);
                positionErTblBar(node);
            } else {
                positionErTblBar(null);
            }

            if(isShape){
                propsPanel.classList.remove('open');
                // 시스템 할당 정보가 있으면 자동으로 패널 열기
                if(node.data && node.data.assignedSystem){
                    openSysAssignPanel(node);
                } else if(_sysAssignOpen && _sysAssignNode && _sysAssignNode.id !== node.id){
                    closeSysAssignPanel();
                }
            } else {
                showProps(node);
                propsPanel.classList.add('open');
                if(_sysAssignOpen) closeSysAssignPanel();
            }
        } else {
            propsPanel.classList.remove('open');
            positionCtxBar(null);
            positionNoteBar(null);
            positionTblBar(null);
            positionErTblBar(null);
            if(_sysAssignOpen) closeSysAssignPanel();
        }
    }

    function deleteNode(node){
        pushUndo();
        var idx = nodes.indexOf(node);
        if(idx >= 0) nodes.splice(idx, 1);
        var el = document.getElementById('nd-'+node.id);
        if(el) el.remove();
        edges = edges.filter(function(e){ return e.source !== node.id && e.target !== node.id; });
        drawEdges();
        selectNode(null);
        scheduleLivePush();
    }

    // ═══ ER 테이블 ═══

    function buildErTableHtml(node, w, h){
        var d = node.data || {};
        var tName = d.erTableName || 'table_name';
        var cols = d.erColumns || [];
        var html = '<div class="wf-ert-label">' + escTxt(tName) + '</div>';
        html += '<div class="wf-ert-inner">';
        html += '<div class="wf-ert-header">'
            + '<span class="wf-ert-icon">&#9638;</span>'
            + '<span class="wf-ert-name">' + escTxt(tName) + '</span>'
            + '<span class="wf-ert-collapse" title="접기/펼치기">&#9660;</span>'
            + '</div>';
        html += '<div class="wf-ert-body">';
        for(var ci = 0; ci < cols.length; ci++){
            var c = cols[ci];
            var iconCls = c.pk ? 'wf-ert-pk' : (c.fk ? 'wf-ert-fk' : 'wf-ert-col');
            var iconSymbol = c.pk ? '&#128273;' : (c.fk ? '&#128279;' : '&#9702;');
            html += '<div class="wf-ert-row" data-idx="' + ci + '">'
                + '<div class="wf-ert-port wf-ert-port-l" data-node="' + node.id + '" data-col-idx="' + ci + '" data-port-dir="left"></div>'
                + '<span class="wf-ert-row-icon ' + iconCls + '">' + iconSymbol + '</span>'
                + '<span class="wf-ert-col-name">' + escTxt(c.name) + '</span>'
                + '<span class="wf-ert-col-type">' + escTxt(c.type) + '</span>'
                + '<span class="wf-ert-col-flags">'
                + (c.nn ? '<span class="wf-ert-flag" title="NOT NULL">NN</span>' : '')
                + (c.uq ? '<span class="wf-ert-flag" title="UNIQUE">UQ</span>' : '')
                + (c.ai ? '<span class="wf-ert-flag" title="AUTO INCREMENT">AI</span>' : '')
                + '</span>'
                + '<div class="wf-ert-port wf-ert-port-r" data-node="' + node.id + '" data-col-idx="' + ci + '" data-port-dir="right"></div>'
                + '</div>';
        }
        html += '<div class="wf-ert-col-add" title="컬럼 추가">+ 컬럼 추가</div>';
        html += '</div>';
        if(d.erShowIndexes !== false){
            var idxs = d.erIndexes || [];
            var idxCollapsed = d.erIndexCollapsed;
            html += '<div class="wf-ert-footer">'
                + '<span class="wf-ert-footer-icon">' + (idxCollapsed ? '&#9654;' : '&#9660;') + '</span>'
                + '<span class="wf-ert-footer-label">Indexes (' + idxs.length + ')</span>'
                + '</div>';
            if(!idxCollapsed){
                html += '<div class="wf-ert-idx-body">';
                for(var ii = 0; ii < idxs.length; ii++){
                    var ix = idxs[ii];
                    html += '<div class="wf-ert-idx-row" data-iidx="' + ii + '">'
                        + '<span class="wf-ert-idx-type" title="' + escTxt(ix.type || 'INDEX') + '">' + escTxt((ix.type || 'IDX').substring(0,3)) + '</span>'
                        + '<span class="wf-ert-idx-name">' + escTxt(ix.name) + '</span>'
                        + '<span class="wf-ert-idx-cols">' + escTxt(ix.columns || '') + '</span>'
                        + '</div>';
                }
                html += '<div class="wf-ert-idx-add" title="인덱스 추가">+ 추가</div>';
                html += '</div>';
            }
        }
        html += '</div>'; // close wf-ert-inner
        html += '<div class="wf-size-badge">' + Math.round(w) + ' x ' + Math.round(h) + '</div>';
        return html;
    }

    function rerenderErTable(node){
        var el = document.getElementById('nd-' + node.id);
        if(!el) return;
        var w = (node.size && node.size.w) || 260;
        var h = (node.size && node.size.h) || 220;
        var ports = el.querySelectorAll('.wf-port, .wf-resize-handle');
        var saved = [];
        for(var pi = 0; pi < ports.length; pi++) saved.push(ports[pi]);
        el.innerHTML = buildErTableHtml(node, w, h);
        for(var si = 0; si < saved.length; si++) el.appendChild(saved[si]);
        bindErTableEvents(el, node);
        var badge = el.querySelector('.wf-size-badge');
        if(badge && selectedNode === node) badge.style.display = '';
    }

    function bindErTableEvents(el, node){
        // 라벨 더블클릭 → 테이블명 편집
        var lbl = el.querySelector('.wf-ert-label');
        if(lbl){
            lbl.addEventListener('dblclick', function(ev){
                ev.stopPropagation();
                var cur = node.data.erTableName || 'table_name';
                lbl.setAttribute('contenteditable', 'true');
                lbl.setAttribute('spellcheck', 'false');
                lbl.focus();
                var sel = window.getSelection();
                var rng = document.createRange();
                rng.selectNodeContents(lbl);
                sel.removeAllRanges(); sel.addRange(rng);
                function commit(){
                    lbl.removeAttribute('contenteditable');
                    var v = (lbl.textContent || '').trim();
                    node.data.erTableName = v || cur;
                    lbl.textContent = node.data.erTableName;
                    // 헤더 내 이름도 동기화
                    var hdrName = el.querySelector('.wf-ert-name');
                    if(hdrName) hdrName.textContent = node.data.erTableName;
                    lbl.removeEventListener('blur', commit);
                    lbl.removeEventListener('keydown', onKey);
                    scheduleLivePush();
                }
                function onKey(e){
                    if(e.key === 'Enter'){ e.preventDefault(); lbl.blur(); }
                    if(e.key === 'Escape'){ lbl.textContent = cur; lbl.blur(); }
                }
                lbl.addEventListener('blur', commit);
                lbl.addEventListener('keydown', onKey);
            });
        }
        // 헤더 내 이름 더블클릭도 라벨 편집으로 연결
        var hdrName = el.querySelector('.wf-ert-name');
        if(hdrName && lbl){
            hdrName.addEventListener('dblclick', function(ev){
                ev.stopPropagation();
                lbl.dispatchEvent(new MouseEvent('dblclick', {bubbles:true}));
            });
        }
        // 접기/펼치기
        var colBtn = el.querySelector('.wf-ert-collapse');
        if(colBtn){
            colBtn.addEventListener('click', function(ev){
                ev.stopPropagation();
                var body = el.querySelector('.wf-ert-body');
                var footer = el.querySelector('.wf-ert-footer');
                if(body){
                    var collapsed = body.style.display === 'none';
                    body.style.display = collapsed ? '' : 'none';
                    if(footer) footer.style.display = collapsed ? '' : 'none';
                    colBtn.innerHTML = collapsed ? '&#9660;' : '&#9654;';
                }
            });
        }
        // 컬럼 더블클릭 → 인라인 편집
        var rows = el.querySelectorAll('.wf-ert-row');
        for(var ri = 0; ri < rows.length; ri++){
            (function(row, idx){
                row.addEventListener('dblclick', function(ev){
                    ev.stopPropagation();
                    openErColEditor(el, node, idx);
                });
            })(rows[ri], parseInt(rows[ri].getAttribute('data-idx')));
        }
        // 컬럼 추가 버튼
        var colAdd = el.querySelector('.wf-ert-col-add');
        if(colAdd){
            colAdd.addEventListener('click', function(ev){
                ev.stopPropagation();
                node.data.erColumns.push({name:'column_' + node.data.erColumns.length, type:'VARCHAR(45)', pk:false, nn:false, uq:false, ai:false, fk:false});
                autoFitErTable(node);
                rerenderErTable(node);
                scheduleLivePush();
            });
        }
        // Indexes 토글
        var footer = el.querySelector('.wf-ert-footer');
        if(footer){
            footer.addEventListener('click', function(ev){
                ev.stopPropagation();
                node.data.erIndexCollapsed = !node.data.erIndexCollapsed;
                autoFitErTable(node);
                rerenderErTable(node);
                scheduleLivePush();
            });
        }
        // Index 행 더블클릭 → 인라인 편집
        var idxRows = el.querySelectorAll('.wf-ert-idx-row');
        for(var iri = 0; iri < idxRows.length; iri++){
            (function(irow, iIdx){
                irow.addEventListener('dblclick', function(ev){
                    ev.stopPropagation();
                    openErIdxEditor(el, node, iIdx);
                });
            })(idxRows[iri], parseInt(idxRows[iri].getAttribute('data-iidx')));
        }
        // Index 추가 버튼
        var idxAdd = el.querySelector('.wf-ert-idx-add');
        if(idxAdd){
            idxAdd.addEventListener('click', function(ev){
                ev.stopPropagation();
                if(!node.data.erIndexes) node.data.erIndexes = [];
                node.data.erIndexes.push({name:'idx_' + node.data.erIndexes.length, columns:'', type:'INDEX'});
                autoFitErTable(node);
                rerenderErTable(node);
                scheduleLivePush();
            });
        }
        // Index 행 우클릭 → 삭제
        for(var iri2 = 0; iri2 < idxRows.length; iri2++){
            (function(irow, iIdx){
                irow.addEventListener('contextmenu', function(ev){
                    ev.preventDefault(); ev.stopPropagation();
                    if(node.data.erIndexes && iIdx < node.data.erIndexes.length){
                        node.data.erIndexes.splice(iIdx, 1);
                        autoFitErTable(node);
                        rerenderErTable(node);
                        scheduleLivePush();
                    }
                });
            })(idxRows[iri2], parseInt(idxRows[iri2].getAttribute('data-iidx')));
        }
    }

    function openErColEditor(el, node, idx){
        // 이미 열린 편집 행 먼저 커밋/정리
        closeAllErEditors();
        var col = node.data.erColumns[idx];
        if(!col) return;
        var row = el.querySelector('.wf-ert-row[data-idx="' + idx + '"]');
        if(!row) return;
        var origHtml = row.innerHTML;
        row.innerHTML = '<input class="wf-ert-edit-name" value="' + escTxt(col.name) + '" placeholder="컬럼명">'
            + '<input class="wf-ert-edit-type" value="' + escTxt(col.type) + '" placeholder="타입">'
            + '<label class="wf-ert-edit-chk" title="PK"><input type="checkbox"' + (col.pk ? ' checked' : '') + '> PK</label>'
            + '<label class="wf-ert-edit-chk" title="NN"><input type="checkbox"' + (col.nn ? ' checked' : '') + '> NN</label>';
        var nameInput = row.querySelector('.wf-ert-edit-name');
        var typeInput = row.querySelector('.wf-ert-edit-type');
        var chks = row.querySelectorAll('.wf-ert-edit-chk input');
        nameInput.focus();
        function commit(){
            col.name = (nameInput.value || '').trim() || col.name;
            col.type = (typeInput.value || '').trim() || col.type;
            col.pk = chks[0].checked;
            col.nn = chks[1].checked;
            if(col.pk) col.nn = true;
            rerenderErTable(node);
            scheduleLivePush();
        }
        nameInput.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); commit(); } if(e.key === 'Escape'){ rerenderErTable(node); } });
        typeInput.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); commit(); } if(e.key === 'Escape'){ rerenderErTable(node); } });
        nameInput.addEventListener('blur', function(){ setTimeout(function(){ if(!row.contains(document.activeElement)) commit(); }, 100); });
        typeInput.addEventListener('blur', function(){ setTimeout(function(){ if(!row.contains(document.activeElement)) commit(); }, 100); });
    }

    function openErIdxEditor(el, node, idx){
        closeAllErEditors();
        var ixArr = node.data.erIndexes || [];
        var ix = ixArr[idx];
        if(!ix) return;
        var row = el.querySelector('.wf-ert-idx-row[data-iidx="' + idx + '"]');
        if(!row) return;
        row.innerHTML = '<select class="wf-ert-edit-itype"><option value="INDEX"' + (ix.type==='INDEX'?' selected':'') + '>INDEX</option><option value="PRIMARY"' + (ix.type==='PRIMARY'?' selected':'') + '>PRIMARY</option><option value="UNIQUE"' + (ix.type==='UNIQUE'?' selected':'') + '>UNIQUE</option><option value="FULLTEXT"' + (ix.type==='FULLTEXT'?' selected':'') + '>FULLTEXT</option></select>'
            + '<input class="wf-ert-edit-name" value="' + escTxt(ix.name) + '" placeholder="인덱스명">';
        var typeSelect = row.querySelector('.wf-ert-edit-itype');
        var nameInput = row.querySelector('.wf-ert-edit-name');
        // select 드롭다운이 캔버스 드래그에 의해 차단되지 않도록
        typeSelect.addEventListener('mousedown', function(e){ e.stopPropagation(); });
        nameInput.addEventListener('mousedown', function(e){ e.stopPropagation(); });
        nameInput.focus();
        function commit(){
            ix.type = typeSelect.value;
            ix.name = (nameInput.value || '').trim() || ix.name;
            rerenderErTable(node);
            scheduleLivePush();
        }
        typeSelect.addEventListener('change', function(){ commit(); });
        nameInput.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); commit(); } if(e.key === 'Escape'){ rerenderErTable(node); } });
        nameInput.addEventListener('blur', function(){ setTimeout(function(){ if(!row.contains(document.activeElement)) commit(); }, 100); });
    }

    // ER 테이블 툴바
    var erTblBar = document.createElement('div');
    erTblBar.className = 'wf-ert-toolbar';
    erTblBar.style.display = 'none';
    erTblBar.innerHTML = ''
        + '<div class="wf-ctx-grip wf-ert-grip" title="드래그하여 이동">'
        + '  <svg width="8" height="14" viewBox="0 0 8 14"><circle cx="2" cy="2" r="1.2" fill="#aaa"/><circle cx="6" cy="2" r="1.2" fill="#aaa"/><circle cx="2" cy="7" r="1.2" fill="#aaa"/><circle cx="6" cy="7" r="1.2" fill="#aaa"/><circle cx="2" cy="12" r="1.2" fill="#aaa"/><circle cx="6" cy="12" r="1.2" fill="#aaa"/></svg>'
        + '</div>'
        + '<span class="wf-ctx-sep"></span>'
        + '<button class="wf-eb-btn" data-act="ert-add" title="컬럼 추가">'
        + '  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
        + '</button>'
        + '<button class="wf-eb-btn" data-act="ert-del" title="마지막 컬럼 삭제">'
        + '  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>'
        + '</button>'
        + '<span class="wf-ctx-sep"></span>'
        + '<button class="wf-eb-btn" data-act="ert-pk" title="PK 토글">'
        + '  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="2"><circle cx="9" cy="11" r="4"/><line x1="13" y1="11" x2="20" y2="11"/><line x1="17" y1="8" x2="17" y2="11"/></svg>'
        + '</button>'
        + '<button class="wf-eb-btn" data-act="ert-fk" title="FK 토글">'
        + '  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><circle cx="9" cy="11" r="4"/><line x1="13" y1="11" x2="20" y2="11"/><line x1="17" y1="8" x2="17" y2="14"/><line x1="20" y1="8" x2="20" y2="14"/></svg>'
        + '</button>'
        + '<button class="wf-eb-btn" data-act="ert-nn" title="NOT NULL 토글">'
        + '  <span style="font-size:11px;font-weight:700;color:#64748b;">NN</span>'
        + '</button>'
        + '<button class="wf-eb-btn" data-act="ert-uq" title="UNIQUE 토글">'
        + '  <span style="font-size:11px;font-weight:700;color:#64748b;">UQ</span>'
        + '</button>'
        + '<button class="wf-eb-btn" data-act="ert-ai" title="AUTO INCREMENT 토글">'
        + '  <span style="font-size:11px;font-weight:700;color:#64748b;">AI</span>'
        + '</button>'
        + '<span class="wf-ctx-sep"></span>'
        + '<button class="wf-eb-btn" data-act="ert-color" title="헤더 색상">'
        + '  <span class="wf-eb-color-dot" id="wfe-ert-colordot" style="background:#5b7fa5"></span>'
        + '</button>';

    // ER 테이블 색상 팝오버
    var ertColorPop = document.createElement('div');
    ertColorPop.className = 'wf-eb-popover';
    ertColorPop.style.display = 'none';
    var ertColors = ['#5b7fa5','#3b82f6','#6366f1','#8b5cf6','#a855f7','#ec4899','#ef4444','#f97316','#eab308','#22c55e','#14b8a6','#0ea5e9','#64748b','#334155','#1e293b','#ffffff'];
    var ertColHtml = '<div class="wf-pop-title2">헤더 색상</div><div class="wf-eb-colors">';
    ertColors.forEach(function(c){ ertColHtml += '<button class="wf-eb-cswatch" data-color="'+c+'" style="background:'+c+'"></button>'; });
    ertColHtml += '</div>';
    ertColorPop.innerHTML = ertColHtml;
    erTblBar.appendChild(ertColorPop);

    worldEl.appendChild(erTblBar);

    var _ertSelectedRow = -1;

    erTblBar.addEventListener('click', function(ev){
        var btn = ev.target.closest('[data-act]');
        if(!btn || !selectedNode || selectedNode.type !== 'er_table') return;
        var act = btn.getAttribute('data-act');
        ev.stopPropagation();
        var d = selectedNode.data;
        if(act === 'ert-add'){
            d.erColumns.push({name:'column_' + d.erColumns.length, type:'VARCHAR(45)', pk:false, nn:false, uq:false, ai:false, fk:false});
            autoFitErTable(selectedNode);
            rerenderErTable(selectedNode);
            scheduleLivePush();
        } else if(act === 'ert-del'){
            if(d.erColumns.length > 1){
                var delIdx = _ertSelectedRow >= 0 && _ertSelectedRow < d.erColumns.length ? _ertSelectedRow : d.erColumns.length - 1;
                d.erColumns.splice(delIdx, 1);
                _ertSelectedRow = -1;
                autoFitErTable(selectedNode);
                rerenderErTable(selectedNode);
                scheduleLivePush();
            }
        } else if(act === 'ert-pk' || act === 'ert-fk' || act === 'ert-nn' || act === 'ert-uq' || act === 'ert-ai'){
            var ri = _ertSelectedRow >= 0 ? _ertSelectedRow : 0;
            if(ri < d.erColumns.length){
                var field = act.replace('ert-','');
                d.erColumns[ri][field] = !d.erColumns[ri][field];
                if(field === 'pk' && d.erColumns[ri].pk) d.erColumns[ri].nn = true;
                rerenderErTable(selectedNode);
                scheduleLivePush();
            }
        } else if(act === 'ert-color'){
            if(ertColorPop.style.display === 'block'){ ertColorPop.style.display = 'none'; }
            else { ertColorPop.style.display = 'block'; }
        }
    });

    ertColorPop.addEventListener('click', function(ev){
        var sw = ev.target.closest('.wf-eb-cswatch');
        if(sw && selectedNode && selectedNode.type === 'er_table'){
            selectedNode.data.erHeaderColor = sw.getAttribute('data-color');
            var dot = document.getElementById('wfe-ert-colordot');
            if(dot) dot.style.background = selectedNode.data.erHeaderColor;
            var hdr = document.getElementById('nd-' + selectedNode.id);
            if(hdr){
                var h = hdr.querySelector('.wf-ert-header');
                if(h) h.style.background = selectedNode.data.erHeaderColor;
            }
            ertColorPop.style.display = 'none';
            scheduleLivePush();
        }
    });

    function autoFitErTable(node){
        var colCount = (node.data.erColumns || []).length;
        var idxCount = (node.data.erIndexes || []).length;
        var showIdx = node.data.erShowIndexes !== false;
        var idxCollapsed = node.data.erIndexCollapsed;
        var idxH = showIdx ? 28 + (!idxCollapsed ? idxCount * 22 + 24 : 0) : 0;
        var newH = 36 + colCount * 26 + 22 + idxH + 8;
        node.size.h = Math.max(120, newH);
    }

    function positionErTblBar(node){
        if(!node || node.type !== 'er_table'){
            erTblBar.style.display = 'none';
            _ertSelectedRow = -1;
            return;
        }
        var el = document.getElementById('nd-' + node.id);
        if(!el){ erTblBar.style.display = 'none'; return; }
        var w = (node.size && node.size.w) || el.offsetWidth;
        var h = (node.size && node.size.h) || el.offsetHeight;
        var x = parseInt(el.style.left) + w / 2;
        var y = parseInt(el.style.top) + h + 24 / zoom;
        erTblBar.style.left = x + 'px';
        erTblBar.style.top = y + 'px';
        erTblBar.style.transform = 'translateX(-50%) scale(' + (1/zoom) + ')';
        erTblBar.style.transformOrigin = 'center top';
        erTblBar.style.display = 'flex';
        // 색상 dot 동기화
        var dot = document.getElementById('wfe-ert-colordot');
        if(dot) dot.style.background = node.data.erHeaderColor || '#5b7fa5';
        // 헤더 색상 적용
        var hdr = el.querySelector('.wf-ert-header');
        if(hdr && node.data.erHeaderColor) hdr.style.background = node.data.erHeaderColor;
    }

    // ER 테이블 행 선택 (worldEl 위임)
    worldEl.addEventListener('click', function(ev){
        var row = ev.target.closest('.wf-ert-row');
        if(!row) return;
        var el = row.closest('.wf-shape-er-table');
        if(!el) return;
        var idx = parseInt(row.getAttribute('data-idx'));
        if(isNaN(idx)) return;
        _ertSelectedRow = idx;
        var allRows = el.querySelectorAll('.wf-ert-row');
        for(var i = 0; i < allRows.length; i++) allRows[i].classList.remove('wf-ert-row-sel');
        row.classList.add('wf-ert-row-sel');
    });

    // ═══ 속성 패널 ═══

    function showProps(node){
        var nt = NODE_TYPES.find(function(t){ return t.type===node.type || t.type===(node.data&&node.data.type); });
        var isShape = nt && nt.category === 'shape';

        var fields;
        if(isShape){
            fields = [
                {key:'name',        label:'이름',  type:'text'},
                {key:'description', label:'설명',  type:'textarea'},
            ];
        } else {
            fields = [
                {key:'name',          label:'이름',     type:'text'},
                {key:'role',          label:'역할',     type:'text'},
                {key:'department',    label:'부서',     type:'text'},
                {key:'sla',           label:'SLA',      type:'text'},
                {key:'description',   label:'설명',     type:'textarea'},
                {key:'nextCondition', label:'분기 조건', type:'text'},
            ];
        }

        var html = '<div class="wf-prop-group"><label>ID</label><div style="font-size:12px;color:#9a96b0;padding:4px 0;">'+escTxt(node.id)+'</div></div>';
        html += '<div class="wf-prop-group"><label>타입</label><div style="font-size:13px;padding:4px 0;">'+(nt?nt.label:node.type)+'</div></div>';

        if(node.size){
            html += '<div class="wf-prop-group" style="display:flex;gap:8px;">'
                + '<div style="flex:1"><label>너비</label><input type="number" class="wf-prop-size" data-dim="w" value="'+Math.round(node.size.w)+'" min="40"></div>'
                + '<div style="flex:1"><label>높이</label><input type="number" class="wf-prop-size" data-dim="h" value="'+Math.round(node.size.h)+'" min="40"></div>'
                + '</div>';
        }

        fields.forEach(function(f){
            var v = node.data[f.key] || '';
            html += '<div class="wf-prop-group"><label>'+f.label+'</label>';
            if(f.type === 'textarea'){
                html += '<textarea class="wf-prop-input" data-key="'+f.key+'" rows="2">'+escTxt(v)+'</textarea>';
            } else {
                html += '<input type="text" class="wf-prop-input" data-key="'+f.key+'" value="'+escTxt(v)+'">';
            }
            html += '</div>';
        });
        html += '<button class="wf-prop-delete-btn" id="wfe-delete-node" type="button">노드 삭제</button>';
        propForm.innerHTML = html;

        var inputs = propForm.querySelectorAll('.wf-prop-input');
        for(var i=0; i<inputs.length; i++){
            inputs[i].addEventListener('input', function(){
                var key = this.getAttribute('data-key');
                node.data[key] = this.value;
                if(key === 'name'){
                    var lbl = document.querySelector('#nd-'+node.id+' .wf-node-label');
                    if(lbl) lbl.textContent = this.value;
                }
            });
        }

        document.getElementById('wfe-delete-node').addEventListener('click', function(){
            deleteNode(node);
        });

        var sizeInputs = propForm.querySelectorAll('.wf-prop-size');
        for(var s=0; s<sizeInputs.length; s++){
            sizeInputs[s].addEventListener('input', function(){
                var dim = this.getAttribute('data-dim');
                var val = parseInt(this.value) || 40;
                if(node.size){
                    node.size[dim] = Math.max(40, val);
                    var el = document.getElementById('nd-'+node.id);
                    if(el){
                        el.style[dim==='w'?'width':'height'] = node.size[dim]+'px';
                    }
                    updateSizeBadge(node);
                    drawEdges();
                }
            });
        }
    }

    // ═══ 엣지 선택 & 플로팅 툴바 ═══

    var EDGE_COLORS = [
        '#1a1a1a','#374151','#6b7280','#7c5cfc','#3b82f6',
        '#22c55e','#f59e0b','#ef4444','#ec4899','#8b5cf6'
    ];
    var EDGE_MARKER_LIST = [
        {id:'none',      label:'없음',     svg:'<line x1="4" y1="20" x2="28" y2="20" stroke="currentColor" stroke-width="2"/>'},
        {id:'arrow',     label:'화살표',   svg:'<line x1="4" y1="20" x2="24" y2="20" stroke="currentColor" stroke-width="2"/><polyline points="20,16 28,20 20,24" fill="none" stroke="currentColor" stroke-width="2"/>'},
        {id:'dot',       label:'원형',     svg:'<line x1="4" y1="20" x2="22" y2="20" stroke="currentColor" stroke-width="2"/><circle cx="26" cy="20" r="4" fill="currentColor"/>'},
        {id:'diamond',   label:'다이아몬드', svg:'<line x1="4" y1="20" x2="18" y2="20" stroke="currentColor" stroke-width="2"/><polygon points="22,20 26,16 30,20 26,24" fill="currentColor"/>'},
        {id:'bar',       label:'바',       svg:'<line x1="4" y1="20" x2="26" y2="20" stroke="currentColor" stroke-width="2"/><line x1="28" y1="14" x2="28" y2="26" stroke="currentColor" stroke-width="2.5"/>'},
        {id:'er_one',    label:'1 (ER)',   svg:'<line x1="4" y1="20" x2="24" y2="20" stroke="currentColor" stroke-width="2"/><line x1="26" y1="13" x2="26" y2="27" stroke="currentColor" stroke-width="2"/>'},
        {id:'er_many',   label:'N (ER)',   svg:'<line x1="4" y1="20" x2="20" y2="20" stroke="currentColor" stroke-width="2"/><line x1="28" y1="20" x2="20" y2="13" stroke="currentColor" stroke-width="2"/><line x1="28" y1="20" x2="20" y2="27" stroke="currentColor" stroke-width="2"/><line x1="28" y1="20" x2="20" y2="20" stroke="currentColor" stroke-width="2"/>'},
        {id:'er_one_many',label:'1..N (ER)',svg:'<line x1="4" y1="20" x2="20" y2="20" stroke="currentColor" stroke-width="2"/><line x1="28" y1="20" x2="20" y2="13" stroke="currentColor" stroke-width="2"/><line x1="28" y1="20" x2="20" y2="27" stroke="currentColor" stroke-width="2"/><line x1="28" y1="20" x2="20" y2="20" stroke="currentColor" stroke-width="2"/><line x1="16" y1="13" x2="16" y2="27" stroke="currentColor" stroke-width="2"/>'},
        {id:'er_zero_one',label:'0..1 (ER)',svg:'<line x1="4" y1="20" x2="21" y2="20" stroke="currentColor" stroke-width="2"/><line x1="27" y1="13" x2="27" y2="27" stroke="currentColor" stroke-width="2"/><circle cx="21" cy="20" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/>'},
        {id:'er_zero_many',label:'0..N (ER)',svg:'<line x1="4" y1="20" x2="16" y2="20" stroke="currentColor" stroke-width="2"/><line x1="28" y1="20" x2="20" y2="13" stroke="currentColor" stroke-width="2"/><line x1="28" y1="20" x2="20" y2="27" stroke="currentColor" stroke-width="2"/><line x1="28" y1="20" x2="20" y2="20" stroke="currentColor" stroke-width="2"/><circle cx="15" cy="20" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/>'},
        {id:'er_only_one',label:'1:1 (ER)',svg:'<line x1="4" y1="20" x2="24" y2="20" stroke="currentColor" stroke-width="2"/><line x1="25" y1="13" x2="25" y2="27" stroke="currentColor" stroke-width="2"/><line x1="28" y1="13" x2="28" y2="27" stroke="currentColor" stroke-width="2"/>'}
    ];

    var edgeBar = document.createElement('div');
    edgeBar.className = 'wf-edge-toolbar';
    edgeBar.style.display = 'none';
    edgeBar.innerHTML = ''
        + '<div class="wf-ctx-grip wf-eb-grip" title="드래그하여 이동">'
        + '  <svg width="8" height="14" viewBox="0 0 8 14"><circle cx="2" cy="2" r="1.2" fill="#aaa"/><circle cx="6" cy="2" r="1.2" fill="#aaa"/><circle cx="2" cy="7" r="1.2" fill="#aaa"/><circle cx="6" cy="7" r="1.2" fill="#aaa"/><circle cx="2" cy="12" r="1.2" fill="#aaa"/><circle cx="6" cy="12" r="1.2" fill="#aaa"/></svg>'
        + '</div>'
        + '<span class="wf-ctx-sep"></span>'
        // 선 색상
        + '<button class="wf-eb-btn" data-act="ecolor" title="선 색상">'
        + '  <span class="wf-eb-color-dot" id="wfe-eb-colordot"></span>'
        + '</button>'
        // 선형
        + '<button class="wf-eb-btn" data-act="eshape" title="선형">'
        + '  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20 C4 10 20 14 20 4"/></svg>'
        + '</button>'
        + '<span class="wf-ctx-sep"></span>'
        // 라인 스타일
        + '<button class="wf-eb-btn" data-act="estyle" title="라인 스타일">'
        + '  <svg width="16" height="16" viewBox="0 0 24 24"><line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2"/></svg>'
        + '</button>'
        // 선폭
        + '<button class="wf-eb-btn" data-act="ewidth" title="선폭">'
        + '  <svg width="16" height="16" viewBox="0 0 24 24"><line x1="2" y1="6" x2="22" y2="6" stroke="currentColor" stroke-width="1"/><line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2.5"/><line x1="2" y1="18" x2="22" y2="18" stroke="currentColor" stroke-width="4"/></svg>'
        + '</button>'
        + '<span class="wf-ctx-sep"></span>'
        // 불투명
        + '<button class="wf-eb-btn" data-act="eopacity" title="불투명도">'
        + '  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9" opacity="0.4"/><circle cx="12" cy="12" r="5"/></svg>'
        + '</button>'
        + '<span class="wf-ctx-sep"></span>'
        // 시작점
        + '<button class="wf-eb-btn" data-act="estart" title="시작점">'
        + '  <svg width="16" height="16" viewBox="0 0 24 24"><line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="2"/><polyline points="10,8 4,12 10,16" fill="none" stroke="currentColor" stroke-width="2"/></svg>'
        + '</button>'
        // 끝점
        + '<button class="wf-eb-btn" data-act="eend" title="끝점">'
        + '  <svg width="16" height="16" viewBox="0 0 24 24"><line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="2"/><polyline points="14,8 20,12 14,16" fill="none" stroke="currentColor" stroke-width="2"/></svg>'
        + '</button>'
        + '<span class="wf-ctx-sep"></span>'
        // 데이터 흐름 애니메이션
        + '<button class="wf-eb-btn" data-act="eanimate" title="데이터 흐름">'
        + '  <img src="/static/image/svg/workflow/free-icon-font-workflow.svg" width="16" height="16" style="vertical-align:middle;">'
        + '</button>'
        + '<span class="wf-ctx-sep"></span>'
        // 카디널리티 (ER 관계)
        + '<button class="wf-eb-btn" data-act="ecardinality" title="카디널리티">'
        + '  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="2" y1="12" x2="16" y2="12"/><line x1="20" y1="12" x2="16" y2="7"/><line x1="20" y1="12" x2="16" y2="17"/><line x1="20" y1="12" x2="16" y2="12"/></svg>'
        + '</button>'
        + '<span class="wf-ctx-sep"></span>'
        // 텍스트 추가
        + '<button class="wf-eb-btn" data-act="elabel" title="텍스트 추가">'
        + '  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>'
        + '</button>'
        // 삭제
        + '<button class="wf-eb-btn" data-act="edelete" title="삭제">'
        + '  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="m22,4h-4.101c-.465-2.279-2.484-4-4.899-4h-2c-2.414,0-4.434,1.721-4.899,4H2c-.552,0-1,.447-1,1s.448,1,1,1h.86l1.296,13.479c.248,2.578,2.388,4.521,4.977,4.521h5.727c2.593,0,4.733-1.947,4.978-4.528l1.276-13.472h.885c.552,0,1-.447,1-1s-.448-1-1-1Zm-11-2h2c1.302,0,2.402.839,2.816,2h-7.631c.414-1.161,1.514-2,2.816-2Zm4.707,14.293c.391.391.391,1.023,0,1.414-.195.195-.451.293-.707.293s-.512-.098-.707-.293l-2.293-2.293-2.293,2.293c-.195.195-.451.293-.707.293s-.512-.098-.707-.293c-.391-.391-.391-1.023,0-1.414l2.293-2.293-2.293-2.293c-.391-.391-.391-1.023,0-1.414s1.023-.391,1.414,0l2.293,2.293,2.293-2.293c.391-.391,1.023-.391,1.414,0s.391,1.023,0,1.414l-2.293,2.293,2.293,2.293Z"/></svg>'
        + '</button>';

    // 엣지 팝오버들
    var _edgePopOpen = null;
    function closeEdgePops(){ if(_edgePopOpen){ _edgePopOpen.style.display='none'; _edgePopOpen=null; } }

    // -- 색상 팝오버 --
    var eColorPop = document.createElement('div');
    eColorPop.className = 'wf-eb-popover'; eColorPop.style.display = 'none';
    var ecHtml = '<div class="wf-pop-title2">선 색상</div><div class="wf-pop-toggle-row"><span>텍스트 배경색</span><label class="wf-toggle"><input type="checkbox" id="wfe-eb-txtbg"><span class="wf-toggle-track"><span class="wf-toggle-thumb"></span></span></label></div>'
        + '<div class="wf-eb-oprow"><span>불투명</span><span id="wfe-eb-oppct">100%</span></div><input type="range" class="wf-eb-range" id="wfe-eb-oprange" min="0" max="100" value="100">'
        + '<div class="wf-pop-title2">선 색상 <span class="wf-pop-tab2" style="cursor:pointer">클러식</span> <span class="wf-pop-picker-btn" id="wfe-eb-pickerbtn">&#x1F58D;</span></div><div class="wf-eb-colors" id="wfe-eb-colors"></div>'
        + '<div class="wf-pop-title2">사용자 정의 색상</div><div class="wf-eb-custom"><input type="color" id="wfe-eb-custcolor" value="#7c5cfc"><button class="wf-eb-addcust" id="wfe-eb-addcust">+</button></div>';
    eColorPop.innerHTML = ecHtml;
    edgeBar.appendChild(eColorPop);

    // -- 선형 팝오버 --
    var eShapePop = document.createElement('div');
    eShapePop.className = 'wf-eb-popover'; eShapePop.style.display = 'none';
    var esHtml = '<div class="wf-pop-title2">선형</div><div class="wf-eb-shape-grid" id="wfe-eb-shapes"></div>';
    eShapePop.innerHTML = esHtml;
    edgeBar.appendChild(eShapePop);

    // -- 라인 스타일 팝오버 --
    var eStylePop = document.createElement('div');
    eStylePop.className = 'wf-eb-popover'; eStylePop.style.display = 'none';
    eStylePop.innerHTML = '<div class="wf-pop-title2">라인 스타일</div><div class="wf-eb-style-grid" id="wfe-eb-styles"></div>';
    edgeBar.appendChild(eStylePop);

    // -- 선폭 팝오버 --
    var eWidthPop = document.createElement('div');
    eWidthPop.className = 'wf-eb-popover'; eWidthPop.style.display = 'none';
    eWidthPop.innerHTML = '<div class="wf-pop-title2">선폭</div><div class="wf-eb-width-row"><input type="range" class="wf-eb-range" id="wfe-eb-wrange" min="1" max="12" value="2"><span id="wfe-eb-wval">2</span></div>';
    edgeBar.appendChild(eWidthPop);

    // -- 불투명도 팝오버 --
    var eOpacPop = document.createElement('div');
    eOpacPop.className = 'wf-eb-popover'; eOpacPop.style.display = 'none';
    eOpacPop.innerHTML = '<div class="wf-pop-title2">불투명도</div><div class="wf-eb-width-row"><input type="range" class="wf-eb-range" id="wfe-eb-orange" min="0" max="100" value="100"><span id="wfe-eb-oval">100%</span></div>';
    edgeBar.appendChild(eOpacPop);

    // -- 시작점 팝오버 --
    var eStartPop = document.createElement('div');
    eStartPop.className = 'wf-eb-popover'; eStartPop.style.display = 'none';
    eStartPop.innerHTML = '<div class="wf-pop-title2">시작점</div><div class="wf-eb-marker-grid" id="wfe-eb-starts"></div>';
    edgeBar.appendChild(eStartPop);

    // -- 끝점 팝오버 --
    var eEndPop = document.createElement('div');
    eEndPop.className = 'wf-eb-popover'; eEndPop.style.display = 'none';
    eEndPop.innerHTML = '<div class="wf-pop-title2">끝점</div><div class="wf-eb-marker-grid" id="wfe-eb-ends"></div>';
    edgeBar.appendChild(eEndPop);

    // -- 카디널리티 팝오버 --
    var eCardPop = document.createElement('div');
    eCardPop.className = 'wf-eb-popover'; eCardPop.style.display = 'none';
    var CARDINALITY_PRESETS = [
        {id:'1_1_m', label:'1 : 1 필수', smk:'er_only_one', emk:'er_only_one',
            svg:'<line x1="2" y1="16" x2="60" y2="16" stroke="currentColor" stroke-width="2"/><line x1="10" y1="10" x2="10" y2="22" stroke="currentColor" stroke-width="2"/><line x1="13" y1="10" x2="13" y2="22" stroke="currentColor" stroke-width="2"/><line x1="50" y1="10" x2="50" y2="22" stroke="currentColor" stroke-width="2"/><line x1="53" y1="10" x2="53" y2="22" stroke="currentColor" stroke-width="2"/>'},
        {id:'1_1_o', label:'1 : 1 선택', smk:'er_only_one', emk:'er_zero_one',
            svg:'<line x1="2" y1="16" x2="60" y2="16" stroke="currentColor" stroke-width="2"/><line x1="10" y1="10" x2="10" y2="22" stroke="currentColor" stroke-width="2"/><line x1="13" y1="10" x2="13" y2="22" stroke="currentColor" stroke-width="2"/><line x1="53" y1="10" x2="53" y2="22" stroke="currentColor" stroke-width="2"/><circle cx="46" cy="16" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/>'},
        {id:'1_n_m', label:'1 : N 필수', smk:'er_only_one', emk:'er_one_many',
            svg:'<line x1="2" y1="16" x2="60" y2="16" stroke="currentColor" stroke-width="2"/><line x1="10" y1="10" x2="10" y2="22" stroke="currentColor" stroke-width="2"/><line x1="13" y1="10" x2="13" y2="22" stroke="currentColor" stroke-width="2"/><line x1="56" y1="16" x2="46" y2="9" stroke="currentColor" stroke-width="2"/><line x1="56" y1="16" x2="46" y2="23" stroke="currentColor" stroke-width="2"/><line x1="56" y1="16" x2="46" y2="16" stroke="currentColor" stroke-width="2"/><line x1="43" y1="10" x2="43" y2="22" stroke="currentColor" stroke-width="2"/>'},
        {id:'1_n_o', label:'1 : N 선택', smk:'er_only_one', emk:'er_zero_many',
            svg:'<line x1="2" y1="16" x2="60" y2="16" stroke="currentColor" stroke-width="2"/><line x1="10" y1="10" x2="10" y2="22" stroke="currentColor" stroke-width="2"/><line x1="13" y1="10" x2="13" y2="22" stroke="currentColor" stroke-width="2"/><line x1="56" y1="16" x2="46" y2="9" stroke="currentColor" stroke-width="2"/><line x1="56" y1="16" x2="46" y2="23" stroke="currentColor" stroke-width="2"/><line x1="56" y1="16" x2="46" y2="16" stroke="currentColor" stroke-width="2"/><circle cx="40" cy="16" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/>'},
        {id:'n_n_m', label:'N : N 필수', smk:'er_one_many', emk:'er_one_many',
            svg:'<line x1="2" y1="16" x2="60" y2="16" stroke="currentColor" stroke-width="2"/><line x1="6" y1="16" x2="16" y2="9" stroke="currentColor" stroke-width="2"/><line x1="6" y1="16" x2="16" y2="23" stroke="currentColor" stroke-width="2"/><line x1="6" y1="16" x2="16" y2="16" stroke="currentColor" stroke-width="2"/><line x1="19" y1="10" x2="19" y2="22" stroke="currentColor" stroke-width="2"/><line x1="56" y1="16" x2="46" y2="9" stroke="currentColor" stroke-width="2"/><line x1="56" y1="16" x2="46" y2="23" stroke="currentColor" stroke-width="2"/><line x1="56" y1="16" x2="46" y2="16" stroke="currentColor" stroke-width="2"/><line x1="43" y1="10" x2="43" y2="22" stroke="currentColor" stroke-width="2"/>'},
        {id:'n_n_o', label:'N : N 선택', smk:'er_zero_many', emk:'er_zero_many',
            svg:'<line x1="2" y1="16" x2="60" y2="16" stroke="currentColor" stroke-width="2"/><line x1="6" y1="16" x2="16" y2="9" stroke="currentColor" stroke-width="2"/><line x1="6" y1="16" x2="16" y2="23" stroke="currentColor" stroke-width="2"/><line x1="6" y1="16" x2="16" y2="16" stroke="currentColor" stroke-width="2"/><circle cx="22" cy="16" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="56" y1="16" x2="46" y2="9" stroke="currentColor" stroke-width="2"/><line x1="56" y1="16" x2="46" y2="23" stroke="currentColor" stroke-width="2"/><line x1="56" y1="16" x2="46" y2="16" stroke="currentColor" stroke-width="2"/><circle cx="40" cy="16" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/>'},
        {id:'none', label:'없음 (초기화)', smk:'none', emk:'none',
            svg:'<line x1="2" y1="16" x2="60" y2="16" stroke="currentColor" stroke-width="2"/>'}
    ];
    var cardH = '<div class="wf-pop-title2">카디널리티 (IE 표기법)</div><div class="wf-eb-card-grid">';
    CARDINALITY_PRESETS.forEach(function(p){
        cardH += '<button class="wf-eb-card-btn" data-card="'+p.id+'" title="'+p.label+'">'
            + '<svg width="62" height="32" viewBox="0 0 62 32" fill="none" stroke="currentColor" stroke-width="0">'+p.svg+'</svg>'
            + '<span class="wf-eb-card-lbl">'+p.label+'</span>'
            + '</button>';
    });
    cardH += '</div>';
    eCardPop.innerHTML = cardH;
    edgeBar.appendChild(eCardPop);

    worldEl.appendChild(edgeBar);

    // 팝오버 내용 빌드
    (function buildEdgePopContents(){
        // 색상 그리드
        var cGrid = document.getElementById('wfe-eb-colors');
        var ch = '';
        EDGE_COLORS.forEach(function(c){
            ch += '<button class="wf-eb-cswatch" data-color="'+c+'" style="background:'+c+'"></button>';
        });
        cGrid.innerHTML = ch;

        // 선형 그리드
        var sGrid = document.getElementById('wfe-eb-shapes');
        var sh = '';
        LINE_TYPES.forEach(function(lt){
            sh += '<button class="wf-eb-shape-btn" data-shape="'+lt.id+'" title="'+lt.label+'"><svg width="32" height="32" viewBox="0 0 44 44"><defs><marker id="lt-arrow-sm" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="#334155"/></marker></defs>'+lt.svg+'</svg></button>';
        });
        sGrid.innerHTML = sh;

        // 라인 스타일 그리드
        var stGrid = document.getElementById('wfe-eb-styles');
        var stH = '';
        [{id:'solid',label:'실선',dash:''},{id:'dashed',label:'대시',dash:'8 4'},{id:'dotted',label:'점선',dash:'2 4'}].forEach(function(s){
            stH += '<button class="wf-eb-style-btn" data-dash="'+s.id+'" title="'+s.label+'"><svg width="80" height="20" viewBox="0 0 80 20"><line x1="4" y1="10" x2="76" y2="10" stroke="#334155" stroke-width="2"'+(s.dash?' stroke-dasharray="'+s.dash+'"':'')+'/></svg></button>';
        });
        stGrid.innerHTML = stH;

        // 시작점/끝점 마커 그리드
        function buildMarkerGrid(containerId, isStart){
            var mk = document.getElementById(containerId);
            var mh = '';
            EDGE_MARKER_LIST.forEach(function(m){
                var svgContent = m.svg;
                if(isStart) svgContent = svgContent.replace(/transform="[^"]*"/g,'');
                mh += '<button class="wf-eb-marker-btn" data-marker="'+m.id+'" title="'+m.label+'"><svg width="32" height="32" viewBox="0 0 32 40" fill="none" stroke="currentColor" stroke-width="0"'+(isStart?' style="transform:scaleX(-1)"':'')+'>'+m.svg+'</svg></button>';
            });
            mk.innerHTML = mh;
        }
        buildMarkerGrid('wfe-eb-starts', true);
        buildMarkerGrid('wfe-eb-ends', false);
    })();

    // 엣지바 이벤트
    edgeBar.addEventListener('click', function(ev){
        var btn = ev.target.closest('[data-act]');
        if(!btn) return;
        var act = btn.getAttribute('data-act');
        ev.stopPropagation();

        if(act === 'eanimate' && _selectedEdge){
            _selectedEdge.animate = !_selectedEdge.animate;
            btn.classList.toggle('wf-eb-active', !!_selectedEdge.animate);
            drawEdges();
            return;
        }
        if(act === 'edelete' && _selectedEdge){
            pushUndo();
            var ei = edges.indexOf(_selectedEdge);
            if(ei>=0) edges.splice(ei,1);
            deselectEdge();
            drawEdges();
            return;
        }
        if(act === 'elabel' && _selectedEdge){
            var lbl = prompt('라인 텍스트:', _selectedEdge.label||'');
            if(lbl !== null){ _selectedEdge.label = lbl; drawEdges(); }
            return;
        }
        var popMap = {ecolor:eColorPop, eshape:eShapePop, estyle:eStylePop, ewidth:eWidthPop, eopacity:eOpacPop, estart:eStartPop, eend:eEndPop, ecardinality:eCardPop};
        var pop = popMap[act];
        if(pop){
            if(_edgePopOpen === pop){ closeEdgePops(); return; }
            closeEdgePops();
            _edgePopOpen = pop;
            pop.style.display = 'block';
            syncEdgePopValues();
        }
    });

    // 색상 클릭
    eColorPop.addEventListener('click', function(ev){
        var sw = ev.target.closest('.wf-eb-cswatch');
        if(sw && _selectedEdge){
            _selectedEdge.color = sw.getAttribute('data-color');
            updateEdgeBarDot();
            drawEdges();
        }
    });
    // 불투명도 (색상팝 내)
    document.getElementById('wfe-eb-oprange').addEventListener('input', function(){
        if(!_selectedEdge) return;
        _selectedEdge.opacity = parseInt(this.value)/100;
        document.getElementById('wfe-eb-oppct').textContent = this.value+'%';
        drawEdges();
    });
    // 선형 클릭
    eShapePop.addEventListener('click', function(ev){
        var btn = ev.target.closest('.wf-eb-shape-btn');
        if(btn && _selectedEdge){
            _selectedEdge.style = btn.getAttribute('data-shape');
            // 화살표 스타일이면 endMarker 자동 설정
            if(_selectedEdge.style.indexOf('arrow')>=0 && _selectedEdge.endMarker==='none'){
                _selectedEdge.endMarker = 'arrow';
            }
            drawEdges(); closeEdgePops();
        }
    });
    // 라인 스타일 클릭
    eStylePop.addEventListener('click', function(ev){
        var btn = ev.target.closest('.wf-eb-style-btn');
        if(btn && _selectedEdge){
            _selectedEdge.dash = btn.getAttribute('data-dash');
            drawEdges(); closeEdgePops();
        }
    });
    // 선폭
    document.getElementById('wfe-eb-wrange').addEventListener('input', function(){
        if(!_selectedEdge) return;
        _selectedEdge.width = parseInt(this.value);
        document.getElementById('wfe-eb-wval').textContent = this.value;
        drawEdges();
    });
    // 불투명도 전용팝
    document.getElementById('wfe-eb-orange').addEventListener('input', function(){
        if(!_selectedEdge) return;
        _selectedEdge.opacity = parseInt(this.value)/100;
        document.getElementById('wfe-eb-oval').textContent = this.value+'%';
        drawEdges();
    });
    // 시작점 마커
    eStartPop.addEventListener('click', function(ev){
        var btn = ev.target.closest('.wf-eb-marker-btn');
        if(btn && _selectedEdge){
            _selectedEdge.startMarker = btn.getAttribute('data-marker');
            drawEdges(); closeEdgePops();
        }
    });
    // 끝점 마커
    eEndPop.addEventListener('click', function(ev){
        var btn = ev.target.closest('.wf-eb-marker-btn');
        if(btn && _selectedEdge){
            _selectedEdge.endMarker = btn.getAttribute('data-marker');
            drawEdges(); closeEdgePops();
        }
    });
    // 카디널리티 프리셋
    eCardPop.addEventListener('click', function(ev){
        var btn = ev.target.closest('.wf-eb-card-btn');
        if(btn && _selectedEdge){
            var cardId = btn.getAttribute('data-card');
            var preset = CARDINALITY_PRESETS.find(function(p){ return p.id === cardId; });
            if(preset){
                _selectedEdge.startMarker = preset.smk;
                _selectedEdge.endMarker = preset.emk;
                drawEdges(); closeEdgePops();
                scheduleLivePush();
            }
        }
    });

    function updateEdgeBarDot(){
        var dot = document.getElementById('wfe-eb-colordot');
        if(dot && _selectedEdge) dot.style.background = _selectedEdge.color || '#1a1a1a';
    }
    function syncEdgePopValues(){
        if(!_selectedEdge) return;
        var e = _selectedEdge;
        document.getElementById('wfe-eb-oprange').value = Math.round((e.opacity||1)*100);
        document.getElementById('wfe-eb-oppct').textContent = Math.round((e.opacity||1)*100)+'%';
        document.getElementById('wfe-eb-wrange').value = e.width||2;
        document.getElementById('wfe-eb-wval').textContent = (e.width||2)+'';
        document.getElementById('wfe-eb-orange').value = Math.round((e.opacity||1)*100);
        document.getElementById('wfe-eb-oval').textContent = Math.round((e.opacity||1)*100)+'%';
        var animBtn = edgeBar.querySelector('[data-act="eanimate"]');
        if(animBtn) animBtn.classList.toggle('wf-eb-active', !!e.animate);
    }
    function selectEdge(edge){
        selectNode(null);
        _selectedEdge = edge;
        positionCtxBar(null);
        positionNoteBar(null);
        positionTblBar(null);
        positionErTblBar(null);
        updateEdgeBarDot();
        syncEdgePopValues();
        drawEdges();
        positionEdgeBar();
    }
    function deselectEdge(){
        var hadSelection = !!_selectedEdge || _selectedEdges.length > 0;
        _selectedEdge = null;
        _selectedEdges = [];
        edgeBar.style.display = 'none';
        closeEdgePops();
        if(hadSelection) drawEdges();
    }
    function positionEdgeBar(){
        if(!_selectedEdge){ edgeBar.style.display='none'; return; }
        var e = _selectedEdge;
        var cx, cy;
        if(e.type === 'standalone'){
            cx = (e.x1 + e.x2)/2;
            cy = Math.min(e.y1, e.y2) - 50;
        } else {
            var srcEl = document.getElementById('nd-'+e.source);
            var tgtEl = document.getElementById('nd-'+e.target);
            if(!srcEl || !tgtEl){ edgeBar.style.display='none'; return; }
            var _epb = getEdgePorts(srcEl, tgtEl, e);
            cx = (_epb.sx+_epb.tx)/2;
            cy = Math.min(_epb.sy,_epb.ty) - 50;
        }
        edgeBar.style.left = cx + 'px';
        edgeBar.style.top = cy + 'px';
        edgeBar.style.display = 'flex';
    }

    // ═══ 라인 연결 스냅 헬퍼 ═══

    // 좌표 (wx, wy)에서 가장 가까운 노드와 그 노드 위의 최적 포트 좌표를 반환
    // snapRadius: 감지 반경 (기본 60px)
    // excludeId: 제외할 노드 ID
    // returns {node, el, portX, portY, dist} or null
    function findSnapTarget(wx, wy, snapRadius, excludeId){
        var best = null, bestDist = snapRadius || 60;
        for(var i = 0; i < nodes.length; i++){
            var nd = nodes[i];
            if(excludeId && nd.id === excludeId) continue;
            var el = document.getElementById('nd-'+nd.id);
            if(!el) continue;
            var nx = parseInt(el.style.left)||0, ny = parseInt(el.style.top)||0;
            var nw = el.offsetWidth, nh = el.offsetHeight;
            var cx = nx + nw/2, cy = ny + nh/2;
            // 바운딩 박스 + pad 안에 있는지 확인
            var pad = snapRadius || 60;
            if(wx < nx - pad || wx > nx + nw + pad || wy < ny - pad || wy > ny + nh + pad) continue;
            // 4개 포트 후보에서 최적 포트 찾기
            var ports = [
                {x: nx + nw, y: cy},  // right
                {x: nx,      y: cy},  // left
                {x: cx,      y: ny},  // top
                {x: cx,      y: ny+nh} // bottom
            ];
            var portBest = null, portBestDist = Infinity;
            for(var pi = 0; pi < 4; pi++){
                var d = Math.sqrt((wx - ports[pi].x)*(wx - ports[pi].x) + (wy - ports[pi].y)*(wy - ports[pi].y));
                if(d < portBestDist){ portBestDist = d; portBest = ports[pi]; }
            }
            // 노드 중심까지 거리 (바운딩 박스 내 거리)
            var nodeDist = Math.sqrt((wx - cx)*(wx - cx) + (wy - cy)*(wy - cy));
            if(nodeDist < bestDist){
                bestDist = nodeDist;
                best = {node: nd, el: el, portX: portBest.x, portY: portBest.y, dist: nodeDist};
            }
        }
        return best;
    }

    // ═══ 스마트 포트 선택 헬퍼 ═══

    function getEdgePorts(srcEl, tgtEl, edge){
        var sl = parseInt(srcEl.style.left), st = parseInt(srcEl.style.top);
        var sw = srcEl.offsetWidth, sh = srcEl.offsetHeight;
        var tl = parseInt(tgtEl.style.left), tt = parseInt(tgtEl.style.top);
        var tw = tgtEl.offsetWidth, th = tgtEl.offsetHeight;
        var scx = sl + sw/2, scy = st + sh/2;
        var tcx = tl + tw/2, tcy = tt + th/2;

        // ER 컬럼 포트 Y좌표 계산 헬퍼
        function getErColY(erEl, colIdx, erTop){
            var row = erEl.querySelector('.wf-ert-row[data-idx="' + colIdx + '"]');
            if(!row) return erTop + erEl.offsetHeight / 2;
            var inner = erEl.querySelector('.wf-ert-inner');
            var innerOff = inner ? inner.offsetTop : 0;
            return erTop + innerOff + row.offsetTop + row.offsetHeight / 2;
        }

        var srcIsEr = edge && edge.sourceCol >= 0 && srcEl.classList.contains('wf-shape-er-table');
        var tgtIsEr = edge && edge.targetCol >= 0 && tgtEl.classList.contains('wf-shape-er-table');

        // 소스 포트 후보
        var srcY = srcIsEr ? getErColY(srcEl, edge.sourceCol, st) : scy;
        var srcP = srcIsEr
            ? [{x: sl + sw, y: srcY}, {x: sl, y: srcY}]
            : [
                {x: sl + sw, y: scy},
                {x: sl,      y: scy},
                {x: scx,     y: st},
                {x: scx,     y: st + sh}
            ];
        // 타겟 포트 후보
        var tgtY = tgtIsEr ? getErColY(tgtEl, edge.targetCol, tt) : tcy;
        var tgtP = tgtIsEr
            ? [{x: tl + tw, y: tgtY}, {x: tl, y: tgtY}]
            : [
                {x: tl + tw, y: tcy},
                {x: tl,      y: tcy},
                {x: tcx,     y: tt},
                {x: tcx,     y: tt + th}
            ];
        var bestSd = Infinity, bsi = 0;
        for(var i = 0; i < srcP.length; i++){
            var d = (srcP[i].x - tcx)*(srcP[i].x - tcx) + (srcP[i].y - tcy)*(srcP[i].y - tcy);
            if(d < bestSd){ bestSd = d; bsi = i; }
        }
        var bestTd = Infinity, bti = 0;
        for(var i = 0; i < tgtP.length; i++){
            var d = (tgtP[i].x - scx)*(tgtP[i].x - scx) + (tgtP[i].y - scy)*(tgtP[i].y - scy);
            if(d < bestTd){ bestTd = d; bti = i; }
        }
        return {sx: srcP[bsi].x, sy: srcP[bsi].y, tx: tgtP[bti].x, ty: tgtP[bti].y};
    }

    function getEdgePortsFromData(src, tgt){
        var scx = src.x + src.w/2, scy = src.y + src.h/2;
        var tcx = tgt.x + tgt.w/2, tcy = tgt.y + tgt.h/2;
        var srcP = [
            {x: src.x + src.w, y: scy},
            {x: src.x,         y: scy},
            {x: scx,           y: src.y},
            {x: scx,           y: src.y + src.h}
        ];
        var tgtP = [
            {x: tgt.x + tgt.w, y: tcy},
            {x: tgt.x,         y: tcy},
            {x: tcx,           y: tgt.y},
            {x: tcx,           y: tgt.y + tgt.h}
        ];
        var bestSd = Infinity, bsi = 0;
        for(var i = 0; i < 4; i++){
            var d = (srcP[i].x - tcx)*(srcP[i].x - tcx) + (srcP[i].y - tcy)*(srcP[i].y - tcy);
            if(d < bestSd){ bestSd = d; bsi = i; }
        }
        var bestTd = Infinity, bti = 0;
        for(var i = 0; i < 4; i++){
            var d = (tgtP[i].x - scx)*(tgtP[i].x - scx) + (tgtP[i].y - scy)*(tgtP[i].y - scy);
            if(d < bestTd){ bestTd = d; bti = i; }
        }
        return {sx: srcP[bsi].x, sy: srcP[bsi].y, tx: tgtP[bti].x, ty: tgtP[bti].y};
    }

    // ═══ 엣지 렌더 ═══

    function drawEdges(){
        var old = worldEl.querySelector('.wf-edges-svg');
        if(old) old.remove();
        if(!edges.length){ if(_selectedEdge) positionEdgeBar(); return; }

        var svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
        svg.classList.add('wf-edges-svg');
        svg.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;';

        var defs = document.createElementNS('http://www.w3.org/2000/svg','defs');

        // 동적 마커 생성 헬퍼
        var _mkCache = {};
        function getMarkerId(mType, color, isStart){
            var key = mType+'_'+(color||'#1a1a1a').replace('#','')+'_'+(isStart?'s':'e');
            if(_mkCache[key]) return key;
            _mkCache[key] = true;
            var mk = document.createElementNS('http://www.w3.org/2000/svg','marker');
            mk.setAttribute('id', key);
            mk.setAttribute('viewBox','0 0 10 10');
            mk.setAttribute('markerWidth','8'); mk.setAttribute('markerHeight','8');
            mk.setAttribute('orient','auto');
            if(mType === 'arrow'){
                mk.setAttribute('refX', isStart?'2':'8'); mk.setAttribute('refY','5');
                var ap = document.createElementNS('http://www.w3.org/2000/svg','path');
                ap.setAttribute('d', isStart ? 'M10 0 L0 5 L10 10 z' : 'M0 0 L10 5 L0 10 z');
                ap.setAttribute('fill', color||'#1a1a1a');
                mk.appendChild(ap);
            } else if(mType === 'dot'){
                mk.setAttribute('refX','5'); mk.setAttribute('refY','5');
                var ci = document.createElementNS('http://www.w3.org/2000/svg','circle');
                ci.setAttribute('cx','5'); ci.setAttribute('cy','5'); ci.setAttribute('r','4');
                ci.setAttribute('fill', color||'#1a1a1a');
                mk.appendChild(ci);
            } else if(mType === 'diamond'){
                mk.setAttribute('refX','5'); mk.setAttribute('refY','5');
                var dp = document.createElementNS('http://www.w3.org/2000/svg','polygon');
                dp.setAttribute('points','5,1 9,5 5,9 1,5');
                dp.setAttribute('fill', color||'#1a1a1a');
                mk.appendChild(dp);
            } else if(mType === 'bar'){
                mk.setAttribute('refX','5'); mk.setAttribute('refY','5');
                var bl = document.createElementNS('http://www.w3.org/2000/svg','line');
                bl.setAttribute('x1','5'); bl.setAttribute('y1','1'); bl.setAttribute('x2','5'); bl.setAttribute('y2','9');
                bl.setAttribute('stroke', color||'#1a1a1a'); bl.setAttribute('stroke-width','2.5');
                mk.appendChild(bl);
            } else if(mType === 'er_one'){
                mk.setAttribute('refX', isStart?'2':'8'); mk.setAttribute('refY','5');
                mk.setAttribute('markerWidth','12'); mk.setAttribute('markerHeight','12');
                var l1 = document.createElementNS('http://www.w3.org/2000/svg','line');
                var xp = isStart ? '3' : '7';
                l1.setAttribute('x1',xp); l1.setAttribute('y1','1'); l1.setAttribute('x2',xp); l1.setAttribute('y2','9');
                l1.setAttribute('stroke', color||'#1a1a1a'); l1.setAttribute('stroke-width','2');
                mk.appendChild(l1);
            } else if(mType === 'er_many'){
                mk.setAttribute('refX', isStart?'1':'10'); mk.setAttribute('refY','5');
                mk.setAttribute('markerWidth','12'); mk.setAttribute('markerHeight','12');
                var fc = color||'#1a1a1a';
                var xBase = isStart ? 1 : 10;
                var xTip = isStart ? 9 : 2;
                var fl1 = document.createElementNS('http://www.w3.org/2000/svg','line');
                fl1.setAttribute('x1',xBase); fl1.setAttribute('y1','5'); fl1.setAttribute('x2',xTip); fl1.setAttribute('y2','1');
                fl1.setAttribute('stroke',fc); fl1.setAttribute('stroke-width','2');
                mk.appendChild(fl1);
                var fl2 = document.createElementNS('http://www.w3.org/2000/svg','line');
                fl2.setAttribute('x1',xBase); fl2.setAttribute('y1','5'); fl2.setAttribute('x2',xTip); fl2.setAttribute('y2','9');
                fl2.setAttribute('stroke',fc); fl2.setAttribute('stroke-width','2');
                mk.appendChild(fl2);
                var fl3 = document.createElementNS('http://www.w3.org/2000/svg','line');
                fl3.setAttribute('x1',xBase); fl3.setAttribute('y1','5'); fl3.setAttribute('x2',xTip); fl3.setAttribute('y2','5');
                fl3.setAttribute('stroke',fc); fl3.setAttribute('stroke-width','2');
                mk.appendChild(fl3);
            } else if(mType === 'er_one_many'){
                mk.setAttribute('refX', isStart?'1':'14'); mk.setAttribute('refY','5');
                mk.setAttribute('markerWidth','16'); mk.setAttribute('markerHeight','12');
                var fc2 = color||'#1a1a1a';
                var xCrow = isStart ? 1 : 14;
                var xCrowTip = isStart ? 9 : 6;
                var fl4 = document.createElementNS('http://www.w3.org/2000/svg','line');
                fl4.setAttribute('x1',xCrow); fl4.setAttribute('y1','5'); fl4.setAttribute('x2',xCrowTip); fl4.setAttribute('y2','1');
                fl4.setAttribute('stroke',fc2); fl4.setAttribute('stroke-width','2');
                mk.appendChild(fl4);
                var fl5 = document.createElementNS('http://www.w3.org/2000/svg','line');
                fl5.setAttribute('x1',xCrow); fl5.setAttribute('y1','5'); fl5.setAttribute('x2',xCrowTip); fl5.setAttribute('y2','9');
                fl5.setAttribute('stroke',fc2); fl5.setAttribute('stroke-width','2');
                mk.appendChild(fl5);
                var fl6 = document.createElementNS('http://www.w3.org/2000/svg','line');
                fl6.setAttribute('x1',xCrow); fl6.setAttribute('y1','5'); fl6.setAttribute('x2',xCrowTip); fl6.setAttribute('y2','5');
                fl6.setAttribute('stroke',fc2); fl6.setAttribute('stroke-width','2');
                mk.appendChild(fl6);
                var barX = isStart ? 12 : 3;
                var barL = document.createElementNS('http://www.w3.org/2000/svg','line');
                barL.setAttribute('x1',barX); barL.setAttribute('y1','1'); barL.setAttribute('x2',barX); barL.setAttribute('y2','9');
                barL.setAttribute('stroke',fc2); barL.setAttribute('stroke-width','2');
                mk.appendChild(barL);
            } else if(mType === 'er_zero_one'){
                mk.setAttribute('refX', isStart?'1':'12'); mk.setAttribute('refY','5');
                mk.setAttribute('markerWidth','14'); mk.setAttribute('markerHeight','12');
                var fc3 = color||'#1a1a1a';
                var barX2 = isStart ? 2 : 11;
                var circX = isStart ? 7 : 6;
                var barL2 = document.createElementNS('http://www.w3.org/2000/svg','line');
                barL2.setAttribute('x1',barX2); barL2.setAttribute('y1','1'); barL2.setAttribute('x2',barX2); barL2.setAttribute('y2','9');
                barL2.setAttribute('stroke',fc3); barL2.setAttribute('stroke-width','2');
                mk.appendChild(barL2);
                var circ = document.createElementNS('http://www.w3.org/2000/svg','circle');
                circ.setAttribute('cx',circX); circ.setAttribute('cy','5'); circ.setAttribute('r','3');
                circ.setAttribute('fill','none'); circ.setAttribute('stroke',fc3); circ.setAttribute('stroke-width','1.5');
                mk.appendChild(circ);
            } else if(mType === 'er_zero_many'){
                mk.setAttribute('refX', isStart?'1':'16'); mk.setAttribute('refY','5');
                mk.setAttribute('markerWidth','18'); mk.setAttribute('markerHeight','12');
                var fc4 = color||'#1a1a1a';
                var xCrow2 = isStart ? 1 : 16;
                var xCrowTip2 = isStart ? 9 : 8;
                var fl7 = document.createElementNS('http://www.w3.org/2000/svg','line');
                fl7.setAttribute('x1',xCrow2); fl7.setAttribute('y1','5'); fl7.setAttribute('x2',xCrowTip2); fl7.setAttribute('y2','1');
                fl7.setAttribute('stroke',fc4); fl7.setAttribute('stroke-width','2');
                mk.appendChild(fl7);
                var fl8 = document.createElementNS('http://www.w3.org/2000/svg','line');
                fl8.setAttribute('x1',xCrow2); fl8.setAttribute('y1','5'); fl8.setAttribute('x2',xCrowTip2); fl8.setAttribute('y2','9');
                fl8.setAttribute('stroke',fc4); fl8.setAttribute('stroke-width','2');
                mk.appendChild(fl8);
                var fl9 = document.createElementNS('http://www.w3.org/2000/svg','line');
                fl9.setAttribute('x1',xCrow2); fl9.setAttribute('y1','5'); fl9.setAttribute('x2',xCrowTip2); fl9.setAttribute('y2','5');
                fl9.setAttribute('stroke',fc4); fl9.setAttribute('stroke-width','2');
                mk.appendChild(fl9);
                var circX2 = isStart ? 13 : 4;
                var circ2 = document.createElementNS('http://www.w3.org/2000/svg','circle');
                circ2.setAttribute('cx',circX2); circ2.setAttribute('cy','5'); circ2.setAttribute('r','3');
                circ2.setAttribute('fill','none'); circ2.setAttribute('stroke',fc4); circ2.setAttribute('stroke-width','1.5');
                mk.appendChild(circ2);
            } else if(mType === 'er_only_one'){
                mk.setAttribute('refX', isStart?'1':'12'); mk.setAttribute('refY','5');
                mk.setAttribute('markerWidth','14'); mk.setAttribute('markerHeight','12');
                var fc5 = color||'#1a1a1a';
                var b1x = isStart ? 2 : 10;
                var b2x = isStart ? 5 : 7;
                var bl1 = document.createElementNS('http://www.w3.org/2000/svg','line');
                bl1.setAttribute('x1',b1x); bl1.setAttribute('y1','1'); bl1.setAttribute('x2',b1x); bl1.setAttribute('y2','9');
                bl1.setAttribute('stroke',fc5); bl1.setAttribute('stroke-width','2');
                mk.appendChild(bl1);
                var bl2 = document.createElementNS('http://www.w3.org/2000/svg','line');
                bl2.setAttribute('x1',b2x); bl2.setAttribute('y1','1'); bl2.setAttribute('x2',b2x); bl2.setAttribute('y2','9');
                bl2.setAttribute('stroke',fc5); bl2.setAttribute('stroke-width','2');
                mk.appendChild(bl2);
            }
            defs.appendChild(mk);
            return key;
        }

        svg.appendChild(defs);

        var _isDark = editorRoot.getAttribute('data-theme') === 'dark';
        var _defaultEdgeColor = _isDark ? '#ffffff' : '#1a1a1a';

        edges.forEach(function(edge){
            var sx, sy, tx, ty;
            if(edge.type === 'standalone'){
                sx = edge.x1; sy = edge.y1; tx = edge.x2; ty = edge.y2;
            } else {
                var srcEl = document.getElementById('nd-'+edge.source);
                var tgtEl = document.getElementById('nd-'+edge.target);
                if(!srcEl || !tgtEl) return;
                var _ep = getEdgePorts(srcEl, tgtEl, edge);
                sx = _ep.sx; sy = _ep.sy; tx = _ep.tx; ty = _ep.ty;
            }
            var mx = (edge.elbowMidX !== undefined) ? edge.elbowMidX : (sx+tx)/2;

            // 5-segment elbow joints
            var ej = edge.elbowJoints;
            var jx1 = ej ? ej.jx1 : mx;
            var jy  = ej ? ej.jy  : (sy+ty)/2;
            var jx2 = ej ? ej.jx2 : mx;

            var es = edge.style || 'straight_arrow';
            var wps = edge.waypoints || [];
            var dStr;
            if(wps.length > 0 && es !== 'elbow' && es !== 'elbow_arrow'){
                // 웨이포인트 있으면 Catmull-Rom → 큐빅 베지어 스플라인
                var pts = [{x:sx,y:sy}].concat(wps).concat([{x:tx,y:ty}]);
                dStr = 'M '+pts[0].x+' '+pts[0].y;
                for(var wi=0; wi<pts.length-1; wi++){
                    var p0 = pts[wi===0?0:wi-1];
                    var p1 = pts[wi];
                    var p2 = pts[wi+1];
                    var p3 = pts[wi+2>=pts.length?pts.length-1:wi+2];
                    var cp1x = p1.x + (p2.x - p0.x)/6;
                    var cp1y = p1.y + (p2.y - p0.y)/6;
                    var cp2x = p2.x - (p3.x - p1.x)/6;
                    var cp2y = p2.y - (p3.y - p1.y)/6;
                    dStr += ' C '+cp1x+' '+cp1y+' '+cp2x+' '+cp2y+' '+p2.x+' '+p2.y;
                }
            } else if(es === 'elbow' || es === 'elbow_arrow'){
                dStr = 'M '+sx+' '+sy+' L '+jx1+' '+sy+' L '+jx1+' '+jy+' L '+jx2+' '+jy+' L '+jx2+' '+ty+' L '+tx+' '+ty;
            } else if(es === 'straight' || es === 'straight_arrow'){
                dStr = 'M '+sx+' '+sy+' L '+tx+' '+ty;
            } else {
                dStr = 'M '+sx+' '+sy+' C '+mx+' '+sy+' '+mx+' '+ty+' '+tx+' '+ty;
            }

            var eColor = edge.color || _defaultEdgeColor;
            var eWidth = edge.width || 2;
            var eOpacity = edge.opacity !== undefined ? edge.opacity : 1;
            var eDash = edge.dash || 'solid';
            var smk = edge.startMarker || 'none';
            var emk = edge.endMarker || (es.indexOf('arrow')>=0 ? 'arrow' : 'none');
            var isSelected = (_selectedEdge && _selectedEdge.id === edge.id) || _selectedEdges.some(function(se){ return se.id === edge.id; });

            // 선택 하이라이트
            if(isSelected){
                var glow = document.createElementNS('http://www.w3.org/2000/svg','path');
                glow.setAttribute('d', dStr);
                glow.setAttribute('fill','none');
                glow.setAttribute('stroke','rgba(59,130,246,0.25)');
                glow.setAttribute('stroke-width', (eWidth+8)+'');
                glow.setAttribute('stroke-linecap','round');
                svg.appendChild(glow);
            }

            // 투명 히트영역
            var hit = document.createElementNS('http://www.w3.org/2000/svg','path');
            hit.setAttribute('d', dStr);
            hit.setAttribute('fill','none');
            hit.setAttribute('stroke','transparent');
            hit.setAttribute('stroke-width','14');
            hit.style.pointerEvents = 'stroke';
            hit.style.cursor = 'pointer';
            (function(eg){
                hit.addEventListener('click', function(ev){
                    ev.stopPropagation();
                    if(_edgeDragging){ _edgeDragging = false; return; }
                    selectEdge(eg);
                });
                hit.addEventListener('dblclick', function(ev){
                    ev.stopPropagation();
                    var eStyle = eg.style || 'straight_arrow';
                    if(eStyle === 'elbow' || eStyle === 'elbow_arrow') return;
                    var rect = worldEl.getBoundingClientRect();
                    var wpx = (ev.clientX - rect.left) / zoom;
                    var wpy = (ev.clientY - rect.top) / zoom;
                    if(!eg.waypoints) eg.waypoints = [];
                    // 가장 가까운 세그먼트 뒤에 삽입
                    var allPts = [{x: eg.type==='standalone'?eg.x1:0, y: eg.type==='standalone'?eg.y1:0}];
                    if(eg.type !== 'standalone'){
                        var se = document.getElementById('nd-'+eg.source);
                        var te = document.getElementById('nd-'+eg.target);
                        if(se && te){
                            var _epp = getEdgePorts(se, te, eg);
                            allPts = [{x: _epp.sx, y: _epp.sy}];
                        }
                    }
                    allPts = allPts.concat(eg.waypoints);
                    var lastPt = eg.type==='standalone' ? {x:eg.x2,y:eg.y2} : {x:0,y:0};
                    if(eg.type !== 'standalone'){
                        var se2 = document.getElementById('nd-'+eg.source);
                        var te2 = document.getElementById('nd-'+eg.target);
                        if(se2 && te2){
                            var _epp2 = getEdgePorts(se2, te2, eg);
                            lastPt = {x: _epp2.tx, y: _epp2.ty};
                        }
                    }
                    allPts.push(lastPt);
                    var bestIdx = eg.waypoints.length;
                    var bestDist = Infinity;
                    for(var si=0; si<allPts.length-1; si++){
                        var ax=allPts[si].x, ay=allPts[si].y, bx=allPts[si+1].x, by=allPts[si+1].y;
                        var t = Math.max(0, Math.min(1, ((wpx-ax)*(bx-ax)+(wpy-ay)*(by-ay))/((bx-ax)*(bx-ax)+(by-ay)*(by-ay)+0.001)));
                        var px=ax+t*(bx-ax), py=ay+t*(by-ay);
                        var d = Math.sqrt((wpx-px)*(wpx-px)+(wpy-py)*(wpy-py));
                        if(d < bestDist){ bestDist = d; bestIdx = si; }
                    }
                    var insertAt = Math.max(0, bestIdx);
                    if(insertAt > eg.waypoints.length) insertAt = eg.waypoints.length;
                    eg.waypoints.splice(insertAt, 0, {x: wpx, y: wpy});
                    drawEdges();
                    selectEdge(eg);
                });
                hit.addEventListener('contextmenu', function(ev){
                    ev.preventDefault(); ev.stopPropagation();
                    selectNode(null);
                    showCtxMenu(ev.clientX, ev.clientY, {type:'edge', edge: eg});
                });
                // standalone 라인 드래그 이동
                if(eg.type === 'standalone'){
                    hit.style.cursor = 'move';
                    hit.addEventListener('mousedown', function(ev){
                        if(ev.button !== 0) return;
                        ev.stopPropagation();
                        ev.preventDefault();
                        selectEdge(eg);
                        _edgeDragging = true;
                        _edgeDragEdge = eg;
                        var rect = worldEl.getBoundingClientRect();
                        _edgeDragStartX = (ev.clientX - rect.left) / zoom;
                        _edgeDragStartY = (ev.clientY - rect.top) / zoom;
                        _edgeDragOrigX1 = eg.x1; _edgeDragOrigY1 = eg.y1;
                        _edgeDragOrigX2 = eg.x2; _edgeDragOrigY2 = eg.y2;
                        _edgeDragOrigMidX = eg.elbowMidX;
                        _edgeDragOrigJoints = eg.elbowJoints ? {jx1:eg.elbowJoints.jx1, jy:eg.elbowJoints.jy, jx2:eg.elbowJoints.jx2} : null;
                        _edgeDragOrigWps = eg.waypoints ? eg.waypoints.map(function(w){return {x:w.x,y:w.y};}) : null;
                    });
                }
            })(edge);
            svg.appendChild(hit);

            // 실제 경로
            var path = document.createElementNS('http://www.w3.org/2000/svg','path');
            path.setAttribute('d', dStr);
            path.setAttribute('fill','none');
            path.setAttribute('stroke', eColor);
            path.setAttribute('stroke-width', eWidth+'');
            path.setAttribute('opacity', eOpacity+'');
            if(eDash === 'dashed') path.setAttribute('stroke-dasharray','8 4');
            else if(eDash === 'dotted') path.setAttribute('stroke-dasharray','2 4');
            if(smk !== 'none') path.setAttribute('marker-start','url(#'+getMarkerId(smk, eColor, true)+')');
            if(emk !== 'none') path.setAttribute('marker-end','url(#'+getMarkerId(emk, eColor, false)+')');
            svg.appendChild(path);

            // 데이터 흐름 애니메이션
            if(edge.animate){
                var dotR = Math.max(3, eWidth + 1);
                var animDur = '2s';
                var hasStartArr = smk !== 'none';
                var hasEndArr = emk !== 'none';
                var biDir = hasStartArr && hasEndArr;

                if(biDir){
                    // 양방향: 왕복 애니메이션 (keyPoints + keyTimes)
                    for(var ai = 0; ai < 3; ai++){
                        var dot = document.createElementNS('http://www.w3.org/2000/svg','circle');
                        dot.setAttribute('r', dotR + '');
                        dot.setAttribute('fill', eColor);
                        dot.setAttribute('opacity', '0.8');
                        var am = document.createElementNS('http://www.w3.org/2000/svg','animateMotion');
                        am.setAttribute('dur', '3s');
                        am.setAttribute('begin', (ai * 1).toFixed(3) + 's');
                        am.setAttribute('repeatCount', 'indefinite');
                        am.setAttribute('keyPoints', '0;1;0');
                        am.setAttribute('keyTimes', '0;0.5;1');
                        am.setAttribute('calcMode', 'linear');
                        var mp = document.createElementNS('http://www.w3.org/2000/svg','mpath');
                        mp.setAttributeNS('http://www.w3.org/1999/xlink','href','#epath-'+edge.id);
                        am.appendChild(mp);
                        dot.appendChild(am);
                        svg.appendChild(dot);
                    }
                    path.setAttribute('id','epath-'+edge.id);
                } else if(hasStartArr && !hasEndArr){
                    // 시작 마커만 → 끝→시작 방향 (역방향)
                    for(var ai2 = 0; ai2 < 3; ai2++){
                        var dot2 = document.createElementNS('http://www.w3.org/2000/svg','circle');
                        dot2.setAttribute('r', dotR + '');
                        dot2.setAttribute('fill', eColor);
                        dot2.setAttribute('opacity', '0.8');
                        var am2 = document.createElementNS('http://www.w3.org/2000/svg','animateMotion');
                        am2.setAttribute('dur', animDur);
                        am2.setAttribute('begin', (ai2 * 0.667).toFixed(3) + 's');
                        am2.setAttribute('repeatCount', 'indefinite');
                        am2.setAttribute('keyPoints', '1;0');
                        am2.setAttribute('keyTimes', '0;1');
                        am2.setAttribute('calcMode', 'linear');
                        var mp2 = document.createElementNS('http://www.w3.org/2000/svg','mpath');
                        mp2.setAttributeNS('http://www.w3.org/1999/xlink','href','#epath-'+edge.id);
                        am2.appendChild(mp2);
                        dot2.appendChild(am2);
                        svg.appendChild(dot2);
                    }
                    path.setAttribute('id','epath-'+edge.id);
                } else {
                    // 끝 마커만 or 기본 → 시작→끝 방향
                    for(var ai3 = 0; ai3 < 3; ai3++){
                        var dot3 = document.createElementNS('http://www.w3.org/2000/svg','circle');
                        dot3.setAttribute('r', dotR + '');
                        dot3.setAttribute('fill', eColor);
                        dot3.setAttribute('opacity', '0.8');
                        var am3 = document.createElementNS('http://www.w3.org/2000/svg','animateMotion');
                        am3.setAttribute('dur', animDur);
                        am3.setAttribute('begin', (ai3 * 0.667).toFixed(3) + 's');
                        am3.setAttribute('repeatCount', 'indefinite');
                        am3.setAttribute('path', dStr);
                        dot3.appendChild(am3);
                        svg.appendChild(dot3);
                    }
                }
            }

            // 라벨
            if(edge.label){
                var totalLen = 0; try{ totalLen = path.getTotalLength(); }catch(e){}
                var midPt; if(totalLen > 0){ midPt = path.getPointAtLength(totalLen / 2); } else { midPt = {x:(sx+tx)/2, y:(sy+ty)/2}; }
                var lx = midPt.x, ly = midPt.y;
                var txt = document.createElementNS('http://www.w3.org/2000/svg','text');
                txt.setAttribute('x', lx); txt.setAttribute('y', ly-6);
                txt.setAttribute('text-anchor','middle');
                txt.setAttribute('font-size','12'); txt.setAttribute('fill', _isDark ? '#e2e8f0' : '#374151');
                txt.setAttribute('font-family','Segoe UI, sans-serif');
                var bg = document.createElementNS('http://www.w3.org/2000/svg','rect');
                txt.textContent = edge.label;
                svg.appendChild(txt);
                var bb;
                try{ bb = txt.getBBox(); } catch(ex){ bb = {x:lx-20,y:ly-16,width:40,height:14}; }
                bg.setAttribute('x', bb.x-4); bg.setAttribute('y', bb.y-2);
                bg.setAttribute('width', bb.width+8); bg.setAttribute('height', bb.height+4);
                bg.setAttribute('rx','3'); bg.setAttribute('fill', _isDark ? '#1e293b' : '#fff'); bg.setAttribute('opacity','0.85');
                svg.insertBefore(bg, txt);
            }

            // 선택 시 끝점 핸들
            if(isSelected){
                // 시작점 핸들
                var c1 = document.createElementNS('http://www.w3.org/2000/svg','circle');
                c1.setAttribute('cx',sx); c1.setAttribute('cy',sy); c1.setAttribute('r','6');
                c1.setAttribute('fill','#fff'); c1.setAttribute('stroke','#3b82f6'); c1.setAttribute('stroke-width','2');
                c1.style.pointerEvents = 'all';
                c1.style.cursor = 'crosshair';
                (function(eg, _sx, _sy, _tx, _ty){
                    c1.addEventListener('mousedown', function(ev){
                        ev.stopPropagation(); ev.preventDefault();
                        // 연결된 엣지면 standalone으로 전환 (시작점 드래그)
                        if(eg.source && eg.target){
                            eg.x1 = _sx; eg.y1 = _sy;
                            eg.x2 = _tx; eg.y2 = _ty;
                            eg.type = 'standalone';
                            delete eg.source; delete eg.target;
                        }
                        _edgeEndDrag = true;
                        _edgeEndDragEdge = eg;
                        _edgeEndDragEnd = 'start';
                    });
                })(edge, sx, sy, tx, ty);
                svg.appendChild(c1);
                // 끝점 핸들
                var c2 = document.createElementNS('http://www.w3.org/2000/svg','circle');
                c2.setAttribute('cx',tx); c2.setAttribute('cy',ty); c2.setAttribute('r','6');
                c2.setAttribute('fill','#3b82f6'); c2.setAttribute('stroke','#3b82f6'); c2.setAttribute('stroke-width','2');
                c2.style.pointerEvents = 'all';
                c2.style.cursor = 'crosshair';
                (function(eg, _sx, _sy, _tx, _ty){
                    c2.addEventListener('mousedown', function(ev){
                        ev.stopPropagation(); ev.preventDefault();
                        // 연결된 엣지면 standalone으로 전환 (끝점 드래그)
                        if(eg.source && eg.target){
                            eg.x1 = _sx; eg.y1 = _sy;
                            eg.x2 = _tx; eg.y2 = _ty;
                            eg.type = 'standalone';
                            delete eg.source; delete eg.target;
                        }
                        _edgeEndDrag = true;
                        _edgeEndDragEdge = eg;
                        _edgeEndDragEnd = 'end';
                    });
                })(edge, sx, sy, tx, ty);
                svg.appendChild(c2);
                // 관절/웨이포인트 핸들
                var isElbow = (es === 'elbow' || es === 'elbow_arrow');
                if(isElbow){
                    // 관절1: (jx1, sy) — 수평 조절
                    var j1 = document.createElementNS('http://www.w3.org/2000/svg','rect');
                    j1.setAttribute('x', jx1 - 5); j1.setAttribute('y', sy - 5);
                    j1.setAttribute('width', '10'); j1.setAttribute('height', '10');
                    j1.setAttribute('rx', '2');
                    j1.setAttribute('fill', '#fff'); j1.setAttribute('stroke', '#3b82f6'); j1.setAttribute('stroke-width', '2');
                    j1.style.pointerEvents = 'all';
                    j1.style.cursor = 'ew-resize';
                    (function(eg){
                        j1.addEventListener('mousedown', function(ev){
                            ev.stopPropagation(); ev.preventDefault();
                            _edgeJointDrag = true;
                            _edgeJointDragEdge = eg;
                            _edgeJointDragIdx = 0;
                        });
                    })(edge);
                    svg.appendChild(j1);
                    // 관절2: ((jx1+jx2)/2, jy) — 수직 조절
                    var j2 = document.createElementNS('http://www.w3.org/2000/svg','rect');
                    j2.setAttribute('x', (jx1+jx2)/2 - 5); j2.setAttribute('y', jy - 5);
                    j2.setAttribute('width', '10'); j2.setAttribute('height', '10');
                    j2.setAttribute('rx', '2');
                    j2.setAttribute('fill', '#fff'); j2.setAttribute('stroke', '#ef4444'); j2.setAttribute('stroke-width', '2');
                    j2.style.pointerEvents = 'all';
                    j2.style.cursor = 'ns-resize';
                    (function(eg){
                        j2.addEventListener('mousedown', function(ev){
                            ev.stopPropagation(); ev.preventDefault();
                            _edgeJointDrag = true;
                            _edgeJointDragEdge = eg;
                            _edgeJointDragIdx = 1;
                        });
                    })(edge);
                    svg.appendChild(j2);
                    // 관절3: (jx2, ty) — 수평 조절
                    var j3 = document.createElementNS('http://www.w3.org/2000/svg','rect');
                    j3.setAttribute('x', jx2 - 5); j3.setAttribute('y', ty - 5);
                    j3.setAttribute('width', '10'); j3.setAttribute('height', '10');
                    j3.setAttribute('rx', '2');
                    j3.setAttribute('fill', '#fff'); j3.setAttribute('stroke', '#3b82f6'); j3.setAttribute('stroke-width', '2');
                    j3.style.pointerEvents = 'all';
                    j3.style.cursor = 'ew-resize';
                    (function(eg){
                        j3.addEventListener('mousedown', function(ev){
                            ev.stopPropagation(); ev.preventDefault();
                            _edgeJointDrag = true;
                            _edgeJointDragEdge = eg;
                            _edgeJointDragIdx = 2;
                        });
                    })(edge);
                    svg.appendChild(j3);
                } else if(wps.length > 0){
                    // 웨이포인트 핸들들 (standalone + port-to-port 모두)
                    wps.forEach(function(wp, wpIdx){
                        var wc = document.createElementNS('http://www.w3.org/2000/svg','circle');
                        wc.setAttribute('cx', wp.x); wc.setAttribute('cy', wp.y); wc.setAttribute('r','5');
                        wc.setAttribute('fill','#3b82f6'); wc.setAttribute('stroke','#fff'); wc.setAttribute('stroke-width','2');
                        wc.style.pointerEvents = 'all';
                        wc.style.cursor = 'move';
                        (function(eg, idx){
                            wc.addEventListener('mousedown', function(ev){
                                ev.stopPropagation(); ev.preventDefault();
                                _edgeWpDrag = true;
                                _edgeWpDragEdge = eg;
                                _edgeWpDragIdx = idx;
                            });
                            wc.addEventListener('dblclick', function(ev){
                                ev.stopPropagation();
                                eg.waypoints.splice(idx, 1);
                                if(eg.waypoints.length === 0) delete eg.waypoints;
                                drawEdges();
                                selectEdge(eg);
                            });
                        })(edge, wpIdx);
                        svg.appendChild(wc);
                    });
                } else if(!isElbow){
                    // 3개 가이드 웨이포인트 핸들 (25%, 50%, 75%)
                    var _guideTs = [0.25, 0.5, 0.75];
                    for(var _gi = 0; _gi < 3; _gi++){
                        var _gt = _guideTs[_gi];
                        var gx = sx + (tx - sx) * _gt;
                        var gy = sy + (ty - sy) * _gt;
                        var gc = document.createElementNS('http://www.w3.org/2000/svg','circle');
                        gc.setAttribute('cx', gx); gc.setAttribute('cy', gy); gc.setAttribute('r', '5');
                        gc.setAttribute('fill', '#fff'); gc.setAttribute('stroke', '#3b82f6'); gc.setAttribute('stroke-width', '2');
                        gc.setAttribute('opacity', '0.5');
                        gc.style.pointerEvents = 'all';
                        gc.style.cursor = 'move';
                        (function(eg, idx, _sx, _sy, _tx, _ty){
                            gc.addEventListener('mousedown', function(ev){
                                ev.stopPropagation(); ev.preventDefault();
                                eg.waypoints = [
                                    {x: _sx + (_tx - _sx) * 0.25, y: _sy + (_ty - _sy) * 0.25},
                                    {x: _sx + (_tx - _sx) * 0.5,  y: _sy + (_ty - _sy) * 0.5},
                                    {x: _sx + (_tx - _sx) * 0.75, y: _sy + (_ty - _sy) * 0.75}
                                ];
                                _edgeWpDrag = true;
                                _edgeWpDragEdge = eg;
                                _edgeWpDragIdx = idx;
                                drawEdges();
                                selectEdge(eg);
                            });
                        })(edge, _gi, sx, sy, tx, ty);
                        svg.appendChild(gc);
                    }
                }
            }
        });

        worldEl.appendChild(svg);
        if(_selectedEdge) positionEdgeBar();
    }

    // ═══ 데이터 직렬화 ═══

    // ═══ 펜/드로잉 시스템 ═══

    var drawPaths = [];       // [{points:[[x,y],...], color, width, tool, opacity}]
    var _drawMode = false;
    var _drawPenTool = 'pen'; // pen | marker | highlighter | eraser
    var _drawColor = '#1a1a1a';
    var _drawWidth = 3;
    var _drawOpacity = 1;
    var _drawingPath = null;  // 현재 그리는 중인 경로
    var _drawSvg = null;      // SVG 오버레이
    var _drawToolbar = null;  // 하단 드로잉 툴바

    // 펜 도구 프리셋
    var PEN_TOOLS = [
        {id:'pen',         label:'펜',        icon:'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z', width:3, opacity:1},
        {id:'marker',      label:'마커',      icon:'M15.5 2.1L5.4 12.2c-.3.3-.5.7-.5 1.1L4 21l7.7-.9c.4 0 .8-.2 1.1-.5L22.9 9.5c.6-.6.6-1.5 0-2.1l-5.3-5.3c-.6-.6-1.5-.6-2.1 0z', width:6, opacity:1},
        {id:'highlighter', label:'형광펜',    icon:'M15.5 2.1L5.4 12.2c-.3.3-.5.7-.5 1.1L4 21l7.7-.9c.4 0 .8-.2 1.1-.5L22.9 9.5c.6-.6.6-1.5 0-2.1l-5.3-5.3c-.6-.6-1.5-.6-2.1 0z', width:18, opacity:0.35},
        {id:'eraser',      label:'지우개',    icon:'M16.24 3.56l4.95 4.94c.78.79.78 2.05 0 2.84L12 20.53a4 4 0 0 1-2.83 1.17H4l-.71-.71 2.83-2.83-1.42-1.41L1.87 19.58 1.16 18.87l8.49-8.49L16.24 3.56z', width:20, opacity:1},
    ];

    var DRAW_COLORS = [
        '#1a1a1a','#374151','#6b7280','#ef4444','#f59e0b',
        '#22c55e','#3b82f6','#8b5cf6','#ec4899','#ffffff',
    ];

    var DRAW_WIDTHS = [1, 2, 3, 5, 8, 12, 18];

    function createDrawSvg(){
        if(_drawSvg) return;
        _drawSvg = document.createElementNS('http://www.w3.org/2000/svg','svg');
        _drawSvg.setAttribute('class','wf-draw-svg');
        _drawSvg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:45;';
        worldEl.appendChild(_drawSvg);
        // 기존 경로 재렌더
        renderAllDrawPaths();
    }

    function renderAllDrawPaths(){
        if(!_drawSvg) return;
        // 기존 path만 제거 (현재 그리는 중은 유지)
        var existing = _drawSvg.querySelectorAll('.wf-dp');
        for(var i=0;i<existing.length;i++) existing[i].remove();
        drawPaths.forEach(function(dp, idx){
            renderOnePath(dp, idx);
        });
    }

    function renderOnePath(dp, idx){
        if(!_drawSvg || !dp.points || dp.points.length < 2) return;
        var pathEl = document.createElementNS('http://www.w3.org/2000/svg','path');
        pathEl.setAttribute('d', pointsToSvgD(dp.points));
        pathEl.setAttribute('fill','none');
        pathEl.setAttribute('stroke', dp.tool === 'eraser' ? 'rgba(245,245,245,1)' : dp.color);
        pathEl.setAttribute('stroke-width', dp.width);
        pathEl.setAttribute('stroke-linecap','round');
        pathEl.setAttribute('stroke-linejoin','round');
        if(dp.opacity < 1) pathEl.setAttribute('opacity', dp.opacity);
        if(dp.tool === 'eraser') pathEl.setAttribute('stroke-width', dp.width);
        pathEl.setAttribute('class','wf-dp');
        pathEl.setAttribute('data-didx', idx);
        _drawSvg.appendChild(pathEl);
    }

    function pointsToSvgD(pts){
        if(pts.length < 2) return '';
        var d = 'M '+pts[0][0]+' '+pts[0][1];
        for(var i=1; i < pts.length; i++){
            d += ' L '+pts[i][0]+' '+pts[i][1];
        }
        return d;
    }

    function createDrawToolbar(){
        if(_drawToolbar) return;
        _drawToolbar = document.createElement('div');
        _drawToolbar.className = 'wf-draw-toolbar';
        _drawToolbar.style.background = '#ffffff';

        var html = '<div class="wf-dt-tools">';
        PEN_TOOLS.forEach(function(pt){
            var iconHtml;
            if(pt.id === 'eraser'){
                iconHtml = '<img src="/static/image/svg/workflow/free-icon-font-eraser.svg" width="20" height="20" alt="지우개">';
            } else {
                iconHtml = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none" stroke-width="0"><path d="'+pt.icon+'"/></svg>';
            }
            html += '<button class="wf-dt-tool'+(pt.id===_drawPenTool?' active':'')+'" data-ptool="'+pt.id+'" title="'+pt.label+'">'
                + iconHtml
                + '<span class="wf-dt-tool-label">'+pt.label+'</span>'
                + '</button>';
        });
        html += '</div>';

        // 두께
        html += '<div class="wf-dt-sep"></div>';
        html += '<div class="wf-dt-section">';
        html += '<span class="wf-dt-label">두께</span>';
        html += '<div class="wf-dt-widths">';
        DRAW_WIDTHS.forEach(function(w){
            var dotSz = Math.max(Math.min(w+2,20),6);
            html += '<div class="wf-dt-width'+(w===_drawWidth?' active':'')+'" data-dw="'+w+'" title="'+w+'px">'
                + '<span class="wf-dt-width-dot" style="width:'+dotSz+'px;height:'+dotSz+'px;background:#1a1a1a;border-radius:50%;display:inline-block;"></span>'
                + '</div>';
        });
        html += '</div></div>';

        // 색상
        html += '<div class="wf-dt-sep"></div>';
        html += '<div class="wf-dt-section">';
        html += '<div class="wf-dt-colors">';
        DRAW_COLORS.forEach(function(c){
            html += '<button class="wf-dt-color'+(c===_drawColor?' active':'')+'" data-dc="'+c+'" style="background:'+c+';'+(c==='#ffffff'?'border:1px solid #d1d5db':'')+'"></button>';
        });
        html += '<button class="wf-dt-color wf-dt-color-custom" data-dc="custom" title="사용자 정의">+</button>';
        html += '</div></div>';

        // 닫기
        html += '<div class="wf-dt-sep"></div>';
        html += '<button class="wf-dt-close" title="펜 닫기">&times;</button>';

        _drawToolbar.innerHTML = html;
        document.getElementById('wfe-canvas-area').appendChild(_drawToolbar);

        // 이벤트
        _drawToolbar.addEventListener('click', function(ev){
            ev.stopPropagation();
            // 펜 도구 선택
            var toolBtn = ev.target.closest('[data-ptool]');
            if(toolBtn){
                _drawPenTool = toolBtn.getAttribute('data-ptool');
                var pt = PEN_TOOLS.find(function(p){return p.id===_drawPenTool;});
                if(pt){
                    _drawWidth = pt.width;
                    _drawOpacity = pt.opacity;
                }
                syncDrawToolbar();
                return;
            }
            // 두께
            var wBtn = ev.target.closest('[data-dw]');
            if(wBtn){
                _drawWidth = parseInt(wBtn.getAttribute('data-dw'));
                syncDrawToolbar();
                return;
            }
            // 색상
            var cBtn = ev.target.closest('[data-dc]');
            if(cBtn){
                var dc = cBtn.getAttribute('data-dc');
                if(dc === 'custom'){
                    var ci = document.createElement('input');
                    ci.type='color'; ci.value=_drawColor;
                    ci.style.cssText='width:0;height:0;opacity:0;position:absolute';
                    _drawToolbar.appendChild(ci);
                    ci.click();
                    ci.addEventListener('input', function(){
                        _drawColor = ci.value;
                        syncDrawToolbar();
                        ci.remove();
                    });
                } else {
                    _drawColor = dc;
                    syncDrawToolbar();
                }
                return;
            }
            // 닫기
            if(ev.target.closest('.wf-dt-close')){
                exitDrawMode();
            }
        });
    }

    function syncDrawToolbar(){
        if(!_drawToolbar) return;
        var tBtns = _drawToolbar.querySelectorAll('[data-ptool]');
        for(var i=0;i<tBtns.length;i++) tBtns[i].classList.toggle('active', tBtns[i].getAttribute('data-ptool')===_drawPenTool);
        var wBtns = _drawToolbar.querySelectorAll('[data-dw]');
        for(var j=0;j<wBtns.length;j++) wBtns[j].classList.toggle('active', parseInt(wBtns[j].getAttribute('data-dw'))===_drawWidth);
        var cBtns = _drawToolbar.querySelectorAll('[data-dc]');
        for(var k=0;k<cBtns.length;k++){
            var dc = cBtns[k].getAttribute('data-dc');
            cBtns[k].classList.toggle('active', dc===_drawColor && dc!=='custom');
        }
    }

    function enterDrawMode(){
        _drawMode = true;
        setTool('pen');
        createDrawSvg();
        createDrawToolbar();
        if(_drawSvg) _drawSvg.style.pointerEvents = 'all';
        if(_drawToolbar) _drawToolbar.style.display = 'flex';
        viewportEl.style.cursor = 'crosshair';
        selectNode(null);
    }

    function exitDrawMode(){
        _drawMode = false;
        if(_drawSvg) _drawSvg.style.pointerEvents = 'none';
        if(_drawToolbar) _drawToolbar.style.display = 'none';
        setTool('select');
    }

    // 드로잉 마우스 이벤트 (SVG 위에서 캡처)
    worldEl.addEventListener('mousedown', function(e){
        if(!_drawMode || !_drawSvg) return;
        if(e.button !== 0) return;
        // 드로잉 시작
        var rect = worldEl.getBoundingClientRect();
        var x = (e.clientX - rect.left) / zoom;
        var y = (e.clientY - rect.top) / zoom;

        if(_drawPenTool === 'eraser'){
            // 지우개: 클릭 위치 근처의 경로 제거
            eraseAtPoint(x, y);
            _drawingPath = {points:[[x,y]], color:'rgba(245,245,245,1)', width:_drawWidth, tool:'eraser', opacity:1};
        } else {
            _drawingPath = {points:[[x,y]], color:_drawColor, width:_drawWidth, tool:_drawPenTool, opacity:_drawOpacity};
        }
        // 실시간 미리보기 path
        var preview = document.createElementNS('http://www.w3.org/2000/svg','path');
        preview.setAttribute('fill','none');
        preview.setAttribute('stroke', _drawingPath.color);
        preview.setAttribute('stroke-width', _drawingPath.width);
        preview.setAttribute('stroke-linecap','round');
        preview.setAttribute('stroke-linejoin','round');
        if(_drawingPath.opacity < 1) preview.setAttribute('opacity', _drawingPath.opacity);
        preview.setAttribute('class','wf-dp-preview');
        _drawSvg.appendChild(preview);
        e.preventDefault();
        e.stopPropagation();
    }, true);

    worldEl.addEventListener('mousemove', function(e){
        if(!_drawMode || !_drawingPath) return;
        var rect = worldEl.getBoundingClientRect();
        var x = (e.clientX - rect.left) / zoom;
        var y = (e.clientY - rect.top) / zoom;
        _drawingPath.points.push([x, y]);
        if(_drawPenTool === 'eraser') eraseAtPoint(x, y);
        // 미리보기 업데이트
        var preview = _drawSvg.querySelector('.wf-dp-preview');
        if(preview) preview.setAttribute('d', pointsToSvgD(_drawingPath.points));
        e.preventDefault();
        e.stopPropagation();
    }, true);

    worldEl.addEventListener('mouseup', function(e){
        if(!_drawMode || !_drawingPath) return;
        var preview = _drawSvg ? _drawSvg.querySelector('.wf-dp-preview') : null;
        if(preview) preview.remove();
        if(_drawingPath.points.length >= 2 && _drawPenTool !== 'eraser'){
            drawPaths.push(_drawingPath);
            renderOnePath(_drawingPath, drawPaths.length - 1);
            scheduleLivePush();
        }
        _drawingPath = null;
        e.stopPropagation();
    }, true);

    function eraseAtPoint(x, y){
        var threshold = _drawWidth / 2 + 10;
        for(var i = drawPaths.length - 1; i >= 0; i--){
            var dp = drawPaths[i];
            for(var j = 0; j < dp.points.length; j++){
                var dx = dp.points[j][0] - x;
                var dy = dp.points[j][1] - y;
                if(Math.sqrt(dx*dx + dy*dy) < threshold){
                    drawPaths.splice(i, 1);
                    renderAllDrawPaths();
                    return;
                }
            }
        }
    }

    function collectData(){
        var area = document.getElementById('wfe-canvas-area');
        var curBg = (area && area.style.backgroundColor) || '';
        var curDot = (area && area.getAttribute('data-dot-color')) || '';
        return {
            nodes: nodes.map(function(n){
                return {id:n.id, type:n.type, position:n.position, size:n.size||null, data:n.data, _meta:n._meta||null};
            }),
            edges: edges.slice(),
            drawPaths: drawPaths.slice(),
            viewport: {x:panX, y:panY, zoom:zoom},
            canvasSettings: {bgColor:curBg, dotColor:curDot, bgMode:_canvasBgMode}
        };
    }

    function escTxt(s){
        var d = document.createElement('div');
        d.textContent = s || '';
        return d.innerHTML;
    }

    // ═══ 썸네일 SVG 생성 ═══

    var THUMB_TYPE_COLORS = {
        start:'#22c55e', task:'#3b82f6', approval:'#f59e0b', decision:'#a855f7',
        system:'#14b8a6', end:'#ef4444', process:'#1e293b', frame:'#94a3b8',
        title:'#334155', note:'#fbbf24', diamond:'#7c3aed', circle:'#0ea5e9',
        table:'#4f46e5', rounded_rect:'#1e293b', ellipse:'#0ea5e9',
        triangle:'#f97316', pentagon:'#10b981', hexagon:'#8b5cf6', star:'#eab308',
        parallelogram:'#64748b', trapezoid:'#64748b', cylinder:'#06b6d4',
        arrow_right:'#3b82f6', cross:'#ef4444', callout:'#8b5cf6'
    };
    // 동적 등록 도형 색상 추가
    NODE_TYPES.forEach(function(nt){
        if(!THUMB_TYPE_COLORS[nt.type]) THUMB_TYPE_COLORS[nt.type] = nt.color || '#64748b';
    });
    var THUMB_TYPE_SHAPES = {
        diamond:'diamond', circle:'circle', note:'note', frame:'frame', title:'title',
        process:'rect', table:'table', rounded_rect:'rounded_rect', ellipse:'ellipse',
        triangle:'triangle', pentagon:'pentagon', hexagon:'hexagon', star:'star',
        parallelogram:'parallelogram', trapezoid:'trapezoid', cylinder:'cylinder',
        arrow_right:'arrow_right', cross:'cross', callout:'callout'
    };
    // 동적 등록 도형 썸네일 매핑 추가
    NODE_TYPES.forEach(function(nt){
        if(nt.shape && !THUMB_TYPE_SHAPES[nt.type]) THUMB_TYPE_SHAPES[nt.type] = nt.shape;
    });

    function generateThumbnailDataUrl(def){
        if(!def || !def.nodes || !def.nodes.length) return '';
        var ns = def.nodes, es = def.edges || [];
        var minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
        for(var i=0;i<ns.length;i++){
            var n=ns[i], nx=n.position.x, ny=n.position.y;
            var nw=(n.size&&n.size.w)||160, nh=(n.size&&n.size.h)||56;
            if(nx<minX) minX=nx; if(ny<minY) minY=ny;
            if(nx+nw>maxX) maxX=nx+nw; if(ny+nh>maxY) maxY=ny+nh;
        }
        var pad=30; minX-=pad; minY-=pad; maxX+=pad; maxY+=pad;
        var bw=maxX-minX, bh=maxY-minY;
        if(bw<1) bw=1; if(bh<1) bh=1;
        var svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+minX+' '+minY+' '+bw+' '+bh+'">';
        svg+='<rect x="'+minX+'" y="'+minY+'" width="'+bw+'" height="'+bh+'" fill="#ffffff"/>';
        // edges
        var nMap={};
        for(var j=0;j<ns.length;j++){
            var nn=ns[j]; nMap[nn.id]={x:nn.position.x,y:nn.position.y,w:(nn.size&&nn.size.w)||160,h:(nn.size&&nn.size.h)||56};
        }
        for(var k=0;k<es.length;k++){
            var e=es[k], src=nMap[e.source], tgt=nMap[e.target];
            if(src&&tgt){
                var _tp=getEdgePortsFromData(src,tgt);
                svg+='<line x1="'+_tp.sx+'" y1="'+_tp.sy+'" x2="'+_tp.tx+'" y2="'+_tp.ty+
                    '" stroke="#cbd5e1" stroke-width="2"/>';
            }
        }
        // draw paths
        if(def.drawPaths){
            for(var di=0;di<def.drawPaths.length;di++){
                var dp=def.drawPaths[di];
                if(!dp.points||dp.points.length<2) continue;
                var d='M '+dp.points[0][0]+' '+dp.points[0][1];
                for(var pi=1;pi<dp.points.length;pi++) d+=' L '+dp.points[pi][0]+' '+dp.points[pi][1];
                svg+='<path d="'+d+'" fill="none" stroke="'+(dp.color||'#1a1a1a')+'" stroke-width="'+(dp.width||3)+
                    '" stroke-linecap="round"'+(dp.opacity<1?' opacity="'+dp.opacity+'"':'')+'/>';
            }
        }
        // nodes
        for(var m=0;m<ns.length;m++){
            var nd=ns[m], tp=nd.type||(nd.data&&nd.data.type)||'task';
            var cl=THUMB_TYPE_COLORS[tp]||'#3b82f6', sh=THUMB_TYPE_SHAPES[tp]||'';
            var userBg=(nd.data&&nd.data.bgColor)||'';
            var px=nd.position.x, py=nd.position.y;
            var sw=(nd.size&&nd.size.w)||160, shh=(nd.size&&nd.size.h)||56;
            var lbl=(nd.data&&nd.data.name)||'';
            if(sh==='circle' || sh==='ellipse'){
                var cr=Math.min(sw,shh)/2;
                svg+='<circle cx="'+(px+sw/2)+'" cy="'+(py+shh/2)+'" r="'+cr+'" fill="'+(userBg||cl)+'" opacity="'+(userBg?'1':'0.18')+'" stroke="'+cl+'" stroke-width="2"/>';
            } else if(sh==='diamond'){
                var cx2=px+sw/2, cy2=py+shh/2;
                svg+='<polygon points="'+cx2+','+py+' '+(px+sw)+','+cy2+' '+cx2+','+(py+shh)+' '+px+','+cy2+'" fill="'+(userBg||cl)+'" opacity="'+(userBg?'1':'0.18')+'" stroke="'+cl+'" stroke-width="2"/>';
            } else if(sh==='triangle'){
                svg+='<polygon points="'+(px+sw/2)+','+py+' '+(px+sw)+','+(py+shh)+' '+px+','+(py+shh)+'" fill="'+(userBg||cl)+'" opacity="'+(userBg?'1':'0.18')+'" stroke="'+cl+'" stroke-width="2"/>';
            } else if(sh==='hexagon'){
                var hx=px, hy=py, hw=sw, hh2=shh;
                svg+='<polygon points="'+(hx+hw*0.25)+','+hy+' '+(hx+hw*0.75)+','+hy+' '+(hx+hw)+','+(hy+hh2/2)+' '+(hx+hw*0.75)+','+(hy+hh2)+' '+(hx+hw*0.25)+','+(hy+hh2)+' '+hx+','+(hy+hh2/2)+'" fill="'+(userBg||cl)+'" opacity="'+(userBg?'1':'0.18')+'" stroke="'+cl+'" stroke-width="2"/>';
            } else if(sh==='star'){
                svg+='<circle cx="'+(px+sw/2)+'" cy="'+(py+shh/2)+'" r="'+Math.min(sw,shh)/2+'" fill="'+(userBg||cl)+'" opacity="'+(userBg?'1':'0.18')+'" stroke="'+cl+'" stroke-width="2"/>';
            } else if(sh==='note'){
                var noteBg=userBg||'#fef3c7';
                svg+='<rect x="'+px+'" y="'+py+'" width="'+sw+'" height="'+shh+'" rx="4" fill="'+noteBg+'" stroke="'+cl+'" stroke-width="2"/>';
            } else if(sh==='frame'){
                svg+='<rect x="'+px+'" y="'+py+'" width="'+sw+'" height="'+shh+'" rx="4" fill="'+(userBg||'none')+'" stroke="'+cl+'" stroke-width="2" stroke-dasharray="6 3"/>';
            } else {
                svg+='<rect x="'+px+'" y="'+py+'" width="'+sw+'" height="'+shh+'" rx="8" fill="'+(userBg||'white')+'" stroke="'+cl+'" stroke-width="2"/>';
                if(!userBg) svg+='<rect x="'+px+'" y="'+py+'" width="'+sw+'" height="6" rx="3" fill="'+cl+'"/>';
            }
            // 라벨 텍스트
            if(lbl){
                var fs = Math.max(10, Math.min(14, Math.floor(sw/8)));
                var txtFill=(nd.data&&(nd.data.fontColor||nd.data.textColor))||'#374151';
                svg+='<text x="'+(px+sw/2)+'" y="'+(py+shh/2+fs/3)+'" text-anchor="middle" font-size="'+fs+'" fill="'+txtFill+'" font-family="sans-serif">'+lbl.substring(0,12)+'</text>';
            }
        }
        svg+='</svg>';
        return 'data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg)));
    }

    // ═══ 저장 ═══

    function doSave(saveType){
        if(editorRoot.classList.contains('wf-readonly')) return;
        var st = saveType || 'manual';
        var def = collectData();
        var thumb = generateThumbnailDataUrl(def);
        fetch(API+'/'+wfId+'/versions', {
            method:'POST', credentials:'same-origin',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({definition_json: def, thumbnail: thumb, save_type: st})
        }).then(function(r){return r.json();}).then(function(d){
            if(d.success){
                if(st==='auto') showAutoSaveStatus(d.item.version);
                if(_historyOpen) loadHistory();
            }
        }).catch(function(){});
    }
    document.getElementById('wfe-save').addEventListener('click', function(){ doSave('manual'); });

    // ═══ 공유 토글 ═══

    var _isShared = false;
    var shareBtn = document.getElementById('wfe-share');

    function updateShareBtn(){
        if(_isShared){
            shareBtn.classList.add('wf-share-active');
            shareBtn.title = '공유 해제';
        } else {
            shareBtn.classList.remove('wf-share-active');
            shareBtn.title = '공유';
        }
    }

    function toggleShare(){
        var newVal = _isShared ? 0 : 1;
        fetch(API+'/'+wfId, {
            method:'PUT', credentials:'same-origin',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({shared: newVal})
        }).then(function(r){return r.json();}).then(function(d){
            if(d.success){
                _isShared = !!newVal;
                updateShareBtn();
            }
        }).catch(function(){});
    }
    shareBtn.addEventListener('click', toggleShare);

    // ═══ 채팅 패널 ═══

    var commentBtn = document.getElementById('wfe-comments');
    var _commentOpen = false;

    // 패널 DOM
    var commentPanel = document.createElement('div');
    commentPanel.className = 'wf-comment-panel';
    commentPanel.innerHTML = ''
        + '<div class="wf-comment-header">'
        + '  <span class="wf-comment-title">채팅</span>'
        + '  <button class="wf-comment-close" id="wfe-comment-close" type="button">&#x2715;</button>'
        + '</div>'
        + '<ul class="wf-comment-list" id="wfe-comment-list"></ul>'
        + '<div class="wf-cmt-reply-bar" id="wfe-reply-bar" style="display:none">'
        + '  <span class="wf-cmt-reply-label">답글 작성 중</span>'
        + '  <button type="button" class="wf-cmt-reply-cancel" id="wfe-reply-cancel">취소</button>'
        + '</div>'
        + '<form class="wf-comment-form" id="wfe-comment-form">'
        + '  <input type="text" id="wfe-comment-input" placeholder="메시지를 입력하세요..." maxlength="2000" autocomplete="off">'
        + '  <button type="submit" class="wf-comment-submit"><img src="/static/image/svg/workflow/free-icon-font-messages.svg" class="wf-comment-submit-icon" alt="전송"></button>'
        + '</form>'
        + '<div class="wf-cmt-del-modal" id="wfe-del-modal">'
        + '  <div class="wf-cmt-del-box">'
        + '    <div class="wf-cmt-del-header">'
        + '      <h3>메시지 삭제</h3>'
        + '      <button type="button" class="wf-cmt-del-close" id="wfe-del-close">&#x2715;</button>'
        + '    </div>'
        + '    <div class="wf-cmt-del-body">'
        + '      <p>이 메시지를 삭제하시겠습니까?</p>'
        + '      <p class="wf-cmt-del-sub">삭제된 메시지는 복구할 수 없습니다.</p>'
        + '    </div>'
        + '    <div class="wf-cmt-del-actions">'
        + '      <button type="button" class="wf-cmt-del-cancel" id="wfe-del-cancel">취소</button>'
        + '      <button type="button" class="wf-cmt-del-confirm" id="wfe-del-confirm">삭제</button>'
        + '    </div>'
        + '  </div>'
        + '</div>';
    editorRoot.appendChild(commentPanel);

    var commentList  = document.getElementById('wfe-comment-list');
    var commentForm  = document.getElementById('wfe-comment-form');
    var commentInput = document.getElementById('wfe-comment-input');
    var replyBar     = document.getElementById('wfe-reply-bar');
    var delModal     = document.getElementById('wfe-del-modal');
    var _replyTarget = null;
    var _pendingDelId = null;
    var _commentPollTimer = null;

    function openComments(){
        _commentOpen = true;
        commentPanel.classList.add('open');
        commentBtn.classList.add('wf-comment-active');
        loadComments();
        if(!_commentPollTimer){
            _commentPollTimer = setInterval(function(){ if(_commentOpen) loadComments(); }, 3000);
        }
        updateSidePanelOffset();
    }
    function closeComments(){
        _commentOpen = false;
        commentPanel.classList.remove('open');
        commentBtn.classList.remove('wf-comment-active');
        cancelReply();
        if(_commentPollTimer){ clearInterval(_commentPollTimer); _commentPollTimer = null; }
        updateSidePanelOffset();
    }
    function toggleComments(){
        if(_commentOpen) closeComments(); else openComments();
    }

    commentBtn.addEventListener('click', toggleComments);
    document.getElementById('wfe-comment-close').addEventListener('click', closeComments);
    document.getElementById('wfe-reply-cancel').addEventListener('click', function(){ cancelReply(); });

    // 삭제 모달 이벤트
    document.getElementById('wfe-del-close').addEventListener('click', closeDelModal);
    document.getElementById('wfe-del-cancel').addEventListener('click', closeDelModal);
    document.getElementById('wfe-del-confirm').addEventListener('click', function(){
        if(!_pendingDelId){ closeDelModal(); return; }
        fetch(API+'/'+wfId+'/comments/'+_pendingDelId, {
            method:'DELETE', credentials:'same-origin'
        }).then(function(r){ return r.json(); }).then(function(d){
            if(d.success) loadComments();
        }).catch(function(){});
        closeDelModal();
    });
    function openDelModal(cid){
        _pendingDelId = cid;
        delModal.classList.add('show');
    }
    function closeDelModal(){
        _pendingDelId = null;
        delModal.classList.remove('show');
    }

    function timeAgo(iso){
        if(!iso) return '';
        var d = new Date(iso);
        var now = new Date();
        var sec = Math.floor((now - d) / 1000);
        if(sec < 60) return '방금 전';
        var min = Math.floor(sec / 60);
        if(min < 60) return min + '분 전';
        var hr = Math.floor(min / 60);
        if(hr < 24) return hr + '시간 전';
        var day = Math.floor(hr / 24);
        if(day < 30) return day + '일 전';
        return d.toLocaleDateString('ko-KR');
    }

    function renderComment(c, isReply){
        var myId = window.__wfCurrentUserId;
        var isMine = myId && c.authorId === myId;
        var avatar = c.authorAvatarUrl
            ? '<img class="wf-cmt-avatar" src="'+escTxt(c.authorAvatarUrl)+'" alt="">'
            : '<span class="wf-cmt-avatar wf-cmt-initial">'+escTxt((c.authorName||'?').charAt(0))+'</span>';
        var cls = 'wf-cmt' + (isMine ? ' wf-cmt-mine' : ' wf-cmt-other') + (isReply ? ' wf-cmt-reply' : '');
        if(isMine){
            var myImg = (document.querySelector('.main-content') || {}).getAttribute && document.querySelector('.main-content').getAttribute('data-profile-image') || '';
            var myName = (document.querySelector('.main-content') || {}).getAttribute && document.querySelector('.main-content').getAttribute('data-user-name') || '';
            var myAvatar = myImg
                ? '<img class="wf-cmt-avatar" src="'+escTxt(myImg)+'" alt="">'
                : '<span class="wf-cmt-avatar wf-cmt-initial">'+escTxt((myName||'나').charAt(0))+'</span>';
            return '<li class="'+cls+'" data-cid="'+c.id+'" data-parent="'+(c.parentId||'')+'">'
                + '<div class="wf-cmt-main">'
                + '  <div class="wf-cmt-bubble">'
                + '    <div class="wf-cmt-text">'+escTxt(c.content)+'</div>'
                + '  </div>'
                + '</div>'
                + myAvatar
                + '</li>';
        }
        return '<li class="'+cls+'" data-cid="'+c.id+'" data-parent="'+(c.parentId||'')+'">'
            + avatar
            + '<div class="wf-cmt-main">'
            + '  <div class="wf-cmt-bubble">'
            + '    <div class="wf-cmt-head"><span class="wf-cmt-name">'+escTxt(c.authorName||'익명')+'</span></div>'
            + '    <div class="wf-cmt-text">'+escTxt(c.content)+'</div>'
            + '  </div>'
            + '</div></li>';
    }

    var _lastCommentIds = '';

    function loadComments(){
        fetch(API+'/'+wfId+'/comments', {credentials:'same-origin'})
        .then(function(r){ return r.json(); })
        .then(function(d){
            if(!d.success){ commentList.innerHTML = '<li class="wf-cmt-empty">채팅을 불러올 수 없습니다.</li>'; return; }
            if(d.currentUserId) window.__wfCurrentUserId = d.currentUserId;
            var items = d.items || [];
            if(!items.length){ commentList.innerHTML = '<li class="wf-cmt-empty">아직 메시지가 없습니다.</li>'; _lastCommentIds = ''; return; }
            // 변경 감지 — ID 목록이 같으면 DOM 갱신 스킵
            var idStr = items.map(function(x){ return x.id; }).join(',');
            if(idStr === _lastCommentIds) return;
            _lastCommentIds = idStr;
            // 스크롤 위치 기억
            var wasAtBottom = commentList.scrollHeight - commentList.scrollTop - commentList.clientHeight < 40;
            // 부모-자식 그룹핑
            var roots = [];
            var childMap = {};
            items.forEach(function(c){
                if(!c.parentId){ roots.push(c); }
                else {
                    if(!childMap[c.parentId]) childMap[c.parentId] = [];
                    childMap[c.parentId].push(c);
                }
            });
            var html = '';
            roots.forEach(function(c){
                html += renderComment(c, false);
                var replies = childMap[c.id] || [];
                replies.forEach(function(r){ html += renderComment(r, true); });
            });
            commentList.innerHTML = html;
            if(wasAtBottom) commentList.scrollTop = commentList.scrollHeight;
        }).catch(function(){ commentList.innerHTML = '<li class="wf-cmt-empty">네트워크 오류</li>'; });
    }

    // 채팅 등록
    commentForm.addEventListener('submit', function(e){
        e.preventDefault();
        var txt = commentInput.value.trim();
        if(!txt) return;
        var body = {content: txt};
        if(_replyTarget) body.parentId = _replyTarget;
        fetch(API+'/'+wfId+'/comments', {
            method:'POST', credentials:'same-origin',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify(body)
        }).then(function(r){ return r.json(); }).then(function(d){
            if(d.success){
                commentInput.value = '';
                cancelReply();
                loadComments();
            }
        }).catch(function(){});
    });

    // 답글 & 삭제 이벤트 위임
    commentList.addEventListener('click', function(e){
        var btn = e.target.closest('.wf-cmt-reply-btn');
        if(btn){
            e.stopPropagation();
            _replyTarget = parseInt(btn.getAttribute('data-id'), 10);
            commentInput.placeholder = '답글을 입력하세요...';
            replyBar.style.display = '';
            commentInput.focus();
            return;
        }
        var del = e.target.closest('.wf-cmt-del-btn');
        if(del){
            e.stopPropagation();
            openDelModal(del.getAttribute('data-id'));
            return;
        }
    });

    function cancelReply(){
        _replyTarget = null;
        commentInput.placeholder = '메시지를 입력하세요...';
        replyBar.style.display = 'none';
    }

    // ── 자동 저장 상태 (좌하단) ──
    var _autoSaveEl = document.createElement('div');
    _autoSaveEl.className = 'wf-autosave-status';
    editorRoot.appendChild(_autoSaveEl);

    // ── 시청자 알림 토스트 컨테이너 ──
    var _toastWrap = document.createElement('div');
    _toastWrap.className = 'wf-viewer-toast-wrap';
    editorRoot.appendChild(_toastWrap);
    function showViewerToast(name){
        var t = document.createElement('div');
        t.className = 'wf-viewer-toast';
        t.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
            + '<span>' + name + ' 사용자가 들어왔습니다.</span>';
        _toastWrap.appendChild(t);
        setTimeout(function(){ t.classList.add('show'); }, 30);
        setTimeout(function(){
            t.classList.remove('show');
            setTimeout(function(){ t.remove(); }, 400);
        }, 4000);
    }

    // ═══ 썸네일 캡처 (영역 지정) ═══

    var _thumbCapturing = false;
    var _thumbOverlay = null;
    var _thumbRect = null;
    var _thumbStartX = 0, _thumbStartY = 0;

    document.getElementById('wfe-thumbnail').addEventListener('click', function(ev){
        ev.stopPropagation();
        startThumbCapture();
    });

    function startThumbCapture(){
        if(_thumbCapturing) return;
        _thumbCapturing = true;
        // 오버레이 생성
        _thumbOverlay = document.createElement('div');
        _thumbOverlay.className = 'wf-thumb-overlay';
        _thumbOverlay.innerHTML = '<div class="wf-thumb-hint">썸네일로 캡처할 영역을 드래그하세요</div>';
        viewportEl.appendChild(_thumbOverlay);

        _thumbOverlay.addEventListener('mousedown', onThumbDown);
        _thumbOverlay.addEventListener('contextmenu', function(e){ e.preventDefault(); cancelThumbCapture(); });
        document.addEventListener('keydown', onThumbEsc);
    }

    function onThumbEsc(e){
        if(e.key === 'Escape') cancelThumbCapture();
    }

    function cancelThumbCapture(){
        _thumbCapturing = false;
        if(_thumbOverlay){ _thumbOverlay.remove(); _thumbOverlay = null; }
        _thumbRect = null;
        document.removeEventListener('keydown', onThumbEsc);
    }

    function onThumbDown(e){
        if(e.button !== 0) return;
        e.preventDefault();
        var rect = viewportEl.getBoundingClientRect();
        _thumbStartX = e.clientX - rect.left;
        _thumbStartY = e.clientY - rect.top;

        _thumbRect = document.createElement('div');
        _thumbRect.className = 'wf-thumb-rect';
        _thumbRect.style.left = _thumbStartX + 'px';
        _thumbRect.style.top = _thumbStartY + 'px';
        _thumbOverlay.appendChild(_thumbRect);

        var hint = _thumbOverlay.querySelector('.wf-thumb-hint');
        if(hint) hint.style.display = 'none';

        document.addEventListener('mousemove', onThumbMove);
        document.addEventListener('mouseup', onThumbUp);
    }

    function onThumbMove(e){
        if(!_thumbRect) return;
        var rect = viewportEl.getBoundingClientRect();
        var cx = e.clientX - rect.left;
        var cy = e.clientY - rect.top;
        var x = Math.min(_thumbStartX, cx);
        var y = Math.min(_thumbStartY, cy);
        var w = Math.abs(cx - _thumbStartX);
        var h = Math.abs(cy - _thumbStartY);
        _thumbRect.style.left = x + 'px';
        _thumbRect.style.top = y + 'px';
        _thumbRect.style.width = w + 'px';
        _thumbRect.style.height = h + 'px';
    }

    function onThumbUp(e){
        document.removeEventListener('mousemove', onThumbMove);
        document.removeEventListener('mouseup', onThumbUp);
        if(!_thumbRect) return;
        var rect = viewportEl.getBoundingClientRect();
        var cx = e.clientX - rect.left;
        var cy = e.clientY - rect.top;
        var x1 = Math.min(_thumbStartX, cx);
        var y1 = Math.min(_thumbStartY, cy);
        var w = Math.abs(cx - _thumbStartX);
        var h = Math.abs(cy - _thumbStartY);

        // 너무 작으면 무시
        if(w < 20 || h < 20){ cancelThumbCapture(); return; }

        // 화면 좌표 → 월드 좌표 변환
        var worldX1 = (x1 - panX) / zoom;
        var worldY1 = (y1 - panY) / zoom;
        var worldX2 = (x1 + w - panX) / zoom;
        var worldY2 = (y1 + h - panY) / zoom;

        cancelThumbCapture();

        // 영역 기반 썸네일 생성 → 미리보기 모달
        var thumbUrl = generateCroppedThumbnail(worldX1, worldY1, worldX2, worldY2);
        showThumbPreview(thumbUrl);
    }

    function showThumbPreview(dataUrl){
        if(!dataUrl) return;
        var modal = document.createElement('div');
        modal.className = 'wf-thumb-modal';
        modal.innerHTML = ''
            + '<div class="wf-thumb-modal-box">'
            + '  <div class="wf-thumb-modal-header">'
            + '    <span class="wf-thumb-modal-title">썸네일 미리보기</span>'
            + '    <button type="button" class="wf-thumb-modal-close">&#x2715;</button>'
            + '  </div>'
            + '  <div class="wf-thumb-modal-body">'
            + '    <img class="wf-thumb-modal-img" src="'+dataUrl+'" alt="썸네일 미리보기">'
            + '  </div>'
            + '  <div class="wf-thumb-modal-actions">'
            + '    <button type="button" class="wf-thumb-modal-cancel">취소</button>'
            + '    <button type="button" class="wf-thumb-modal-save">저장</button>'
            + '  </div>'
            + '</div>';
        editorRoot.appendChild(modal);
        requestAnimationFrame(function(){ modal.classList.add('show'); });
        function close(){ modal.classList.remove('show'); setTimeout(function(){ modal.remove(); }, 200); }
        modal.querySelector('.wf-thumb-modal-close').addEventListener('click', close);
        modal.querySelector('.wf-thumb-modal-cancel').addEventListener('click', close);
        modal.querySelector('.wf-thumb-modal-save').addEventListener('click', function(){
            close();
            saveThumbToServer(dataUrl);
        });
        modal.addEventListener('click', function(ev){ if(ev.target === modal) close(); });
    }

    function generateCroppedThumbnail(x1, y1, x2, y2){
        var def = collectData();
        if(!def || !def.nodes) return '';
        var ns = def.nodes, es = def.edges || [];
        var bw = x2 - x1, bh = y2 - y1;
        if(bw < 1) bw = 1; if(bh < 1) bh = 1;

        var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+x1+' '+y1+' '+bw+' '+bh+'">';
        svg += '<rect x="'+x1+'" y="'+y1+'" width="'+bw+'" height="'+bh+'" fill="#ffffff"/>';

        // 엣지
        var nMap = {};
        for(var j = 0; j < ns.length; j++){
            var nn = ns[j];
            nMap[nn.id] = {x:nn.position.x, y:nn.position.y, w:(nn.size&&nn.size.w)||160, h:(nn.size&&nn.size.h)||56};
        }
        for(var k = 0; k < es.length; k++){
            var e = es[k], src = nMap[e.source], tgt = nMap[e.target];
            if(src && tgt){
                var _tp2 = getEdgePortsFromData(src, tgt);
                svg += '<line x1="'+_tp2.sx+'" y1="'+_tp2.sy+'" x2="'+_tp2.tx+'" y2="'+_tp2.ty+'" stroke="#cbd5e1" stroke-width="2"/>';
            }
        }
        // 드로잉 패스
        if(def.drawPaths){
            for(var di = 0; di < def.drawPaths.length; di++){
                var dp = def.drawPaths[di];
                if(!dp.points || dp.points.length < 2) continue;
                var d = 'M '+dp.points[0][0]+' '+dp.points[0][1];
                for(var pi = 1; pi < dp.points.length; pi++) d += ' L '+dp.points[pi][0]+' '+dp.points[pi][1];
                svg += '<path d="'+d+'" fill="none" stroke="'+(dp.color||'#1a1a1a')+'" stroke-width="'+(dp.width||3)+'" stroke-linecap="round"'+(dp.opacity < 1 ? ' opacity="'+dp.opacity+'"' : '')+'/>';
            }
        }
        // 노드
        for(var m = 0; m < ns.length; m++){
            var nd = ns[m], tp = nd.type||(nd.data&&nd.data.type)||'task';
            var cl = THUMB_TYPE_COLORS[tp]||'#3b82f6', sh = THUMB_TYPE_SHAPES[tp]||'';
            var userBg = (nd.data&&nd.data.bgColor)||'';
            var px = nd.position.x, py = nd.position.y;
            var sw = (nd.size&&nd.size.w)||160, shh = (nd.size&&nd.size.h)||56;
            var lbl = (nd.data&&nd.data.name)||'';
            if(sh === 'circle' || sh === 'ellipse'){
                var cr = Math.min(sw,shh)/2;
                svg += '<circle cx="'+(px+sw/2)+'" cy="'+(py+shh/2)+'" r="'+cr+'" fill="'+(userBg||cl)+'" opacity="'+(userBg?'1':'0.18')+'" stroke="'+cl+'" stroke-width="2"/>';
            } else if(sh === 'diamond'){
                var cx2 = px+sw/2, cy2 = py+shh/2;
                svg += '<polygon points="'+cx2+','+py+' '+(px+sw)+','+cy2+' '+cx2+','+(py+shh)+' '+px+','+cy2+'" fill="'+(userBg||cl)+'" opacity="'+(userBg?'1':'0.18')+'" stroke="'+cl+'" stroke-width="2"/>';
            } else if(sh === 'triangle'){
                svg += '<polygon points="'+(px+sw/2)+','+py+' '+(px+sw)+','+(py+shh)+' '+px+','+(py+shh)+'" fill="'+(userBg||cl)+'" opacity="'+(userBg?'1':'0.18')+'" stroke="'+cl+'" stroke-width="2"/>';
            } else if(sh === 'hexagon'){
                svg += '<polygon points="'+(px+sw*0.25)+','+py+' '+(px+sw*0.75)+','+py+' '+(px+sw)+','+(py+shh/2)+' '+(px+sw*0.75)+','+(py+shh)+' '+(px+sw*0.25)+','+(py+shh)+' '+px+','+(py+shh/2)+'" fill="'+(userBg||cl)+'" opacity="'+(userBg?'1':'0.18')+'" stroke="'+cl+'" stroke-width="2"/>';
            } else if(sh === 'note'){
                var noteBg = userBg||'#fef3c7';
                svg += '<rect x="'+px+'" y="'+py+'" width="'+sw+'" height="'+shh+'" rx="4" fill="'+noteBg+'" stroke="'+cl+'" stroke-width="2"/>';
            } else if(sh === 'frame'){
                svg += '<rect x="'+px+'" y="'+py+'" width="'+sw+'" height="'+shh+'" rx="4" fill="'+(userBg||'none')+'" stroke="'+cl+'" stroke-width="2" stroke-dasharray="6 3"/>';
            } else {
                svg += '<rect x="'+px+'" y="'+py+'" width="'+sw+'" height="'+shh+'" rx="8" fill="'+(userBg||'white')+'" stroke="'+cl+'" stroke-width="2"/>';
                if(!userBg) svg += '<rect x="'+px+'" y="'+py+'" width="'+sw+'" height="6" rx="3" fill="'+cl+'"/>';
            }
            if(lbl){
                var fs = Math.max(10, Math.min(14, Math.floor(sw/8)));
                var txtFill = (nd.data&&(nd.data.fontColor||nd.data.textColor))||'#374151';
                svg += '<text x="'+(px+sw/2)+'" y="'+(py+shh/2+fs/3)+'" text-anchor="middle" font-size="'+fs+'" fill="'+txtFill+'" font-family="sans-serif">'+escTxt(lbl).substring(0,12)+'</text>';
            }
        }
        svg += '</svg>';
        return 'data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg)));
    }

    function saveThumbToServer(thumbDataUrl){
        if(!thumbDataUrl) return;
        fetch(API+'/'+wfId+'/thumbnail', {
            method:'PUT', credentials:'same-origin',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({thumbnail: thumbDataUrl})
        }).then(function(r){ return r.json(); }).then(function(d){
            if(d.success){
                showThumbSavedStatus();
            }
        }).catch(function(){});
    }

    function showThumbSavedStatus(){
        _autoSaveEl.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>'
            + '<span>썸네일이 저장되었습니다</span>';
        _autoSaveEl.classList.add('show');
        clearTimeout(_autoSaveEl._tid);
        _autoSaveEl._tid = setTimeout(function(){
            _autoSaveEl.classList.remove('show');
        }, 4000);
    }

    function showAutoSaveStatus(ver){
        var now = new Date();
        var hh = String(now.getHours()).padStart(2,'0');
        var mm = String(now.getMinutes()).padStart(2,'0');
        _autoSaveEl.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
            + '<span>자동 저장됨 v'+ver+' · '+hh+':'+mm+'</span>';
        _autoSaveEl.classList.add('show');
        clearTimeout(_autoSaveEl._tid);
        _autoSaveEl._tid = setTimeout(function(){
            _autoSaveEl.classList.remove('show');
        }, 8000);
    }

    // ═══ 변경 이력 패널 ═══

    var historyBtn = document.getElementById('wfe-history');
    var _historyOpen = false;

    var historyPanel = document.createElement('div');
    historyPanel.className = 'wf-history-panel';
    historyPanel.innerHTML = ''
        + '<div class="wf-history-header">'
        + '  <span class="wf-history-title">변경 이력</span>'
        + '  <button class="wf-history-close" id="wfe-history-close" type="button">&#x2715;</button>'
        + '</div>'
        + '<div class="wf-history-list" id="wfe-history-list"></div>';
    editorRoot.appendChild(historyPanel);

    function openHistory(){
        closeAllPopups('history');
        _historyOpen = true;
        historyPanel.classList.add('open');
        historyBtn.classList.add('active');
        loadHistory();
        updateSidePanelOffset();
    }
    function closeHistory(){
        _historyOpen = false;
        historyPanel.classList.remove('open');
        historyBtn.classList.remove('active');
        updateSidePanelOffset();
    }
    function toggleHistory(){
        if(_historyOpen) closeHistory(); else openHistory();
    }
    historyBtn.addEventListener('click', toggleHistory);
    document.getElementById('wfe-history-close').addEventListener('click', closeHistory);

    function loadHistory(){
        var listEl = document.getElementById('wfe-history-list');
        listEl.innerHTML = '<div class="wf-history-loading">로딩중...</div>';
        fetch(API+'/'+wfId+'/versions', {credentials:'same-origin'})
        .then(function(r){ return r.json(); })
        .then(function(d){
            if(!d.success || !d.rows || d.rows.length === 0){
                listEl.innerHTML = '<div class="wf-history-empty">저장된 이력이 없습니다.</div>';
                return;
            }
            var html = '';
            d.rows.forEach(function(v){
                var dt = v.created_at ? String(v.created_at).substring(0,16).replace('T',' ') : '';
                var who = v.creator_name || v.created_by || '알 수 없음';
                var initial = who.charAt(0) || '?';
                var pImg = v.creator_profile_image || '';
                var avatarHtml = pImg
                    ? '<img class="wf-history-avatar-img" src="'+escTxt(pImg)+'" alt="">'
                    : '<span>'+escTxt(initial)+'</span>';
                var stBadge = v.save_type === 'auto'
                    ? '<span class="wf-history-save-type auto">자동</span>'
                    : '<span class="wf-history-save-type manual">수동</span>';
                html += '<div class="wf-history-item">'
                    + '<div class="wf-history-avatar">'+avatarHtml+'</div>'
                    + '<div class="wf-history-body">'
                    + '  <div class="wf-history-who">'+escTxt(who)+'</div>'
                    + '  <div class="wf-history-meta">'
                    + '    <span class="wf-history-ver">v'+v.version+'</span>'
                    + '    '+stBadge
                    + '    <span class="wf-history-dot">&middot;</span>'
                    + '    <span class="wf-history-time">'+escTxt(dt)+'</span>'
                    + '  </div>'
                    + '</div>'
                    + '</div>';
            });
            listEl.innerHTML = html;
        })
        .catch(function(){
            listEl.innerHTML = '<div class="wf-history-empty">로드 실패</div>';
        });
    }

    // ═══ 자동 저장 (30분) ═══
    setInterval(function(){
        doSave('auto');
    }, 30 * 60 * 1000);

    // ═══ 실시간 동기화 (편집자 → 서버, 3초 디바운스) ═══
    var _livePushTimer = null;
    function scheduleLivePush(){
        if(editorRoot.classList.contains('wf-readonly')) return;
        clearTimeout(_livePushTimer);
        _livePushTimer = setTimeout(function(){
            var def = collectData();
            fetch(API+'/'+wfId+'/live', {
                method:'PUT', credentials:'same-origin',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({definition_json: def})
            }).catch(function(){});
        }, 3000);
    }

    // ═══ 데이터 로딩 ═══

    fetch(API+'/'+wfId, {credentials:'same-origin'})
    .then(function(r){ return r.json(); })
    .then(function(data){
        if(!data.success){
            worldEl.innerHTML = '<p style="padding:60px;color:#e74c3c;font-size:14px;">'+escTxt(data.error||'로드 실패')+'</p>';
            return;
        }
        var wf = data.item;

        // 제목/상태
        var titleEl = document.getElementById('wfe-title');
        titleEl.textContent = wf.name;
        titleEl.style.cursor = 'pointer';
        titleEl.title = '클릭하여 이름 변경';
        titleEl.addEventListener('click', function(){
            var input = document.createElement('input');
            input.type = 'text';
            input.value = titleEl.textContent;
            input.style.cssText = 'font:inherit;font-weight:600;font-size:15px;border:1px solid #7c5cfc;border-radius:6px;padding:2px 8px;outline:none;width:260px;color:#2d2b3a;background:#fff;';
            titleEl.replaceWith(input);
            input.focus();
            input.select();
            function commit(){
                var newName = (input.value||'').trim() || wf.name;
                titleEl.textContent = newName;
                input.replaceWith(titleEl);
                if(newName !== wf.name){
                    wf.name = newName;
                    fetch(API+'/'+wfId, {
                        method:'PUT', credentials:'same-origin',
                        headers:{'Content-Type':'application/json'},
                        body:JSON.stringify({name:newName})
                    });
                }
            }
            input.addEventListener('blur', commit);
            input.addEventListener('keydown', function(e){
                if(e.key==='Enter') commit();
                if(e.key==='Escape'){ input.value=wf.name; commit(); }
            });
        });
        var statusEl = document.getElementById('wfe-status');
        var statusMap = {draft:'초안', active:'활성', archived:'보관'};
        var _st = wf.status || 'draft';
        if (_st === 'draft') { statusEl.innerHTML = ''; } else { statusEl.innerHTML = '<span class="wfd-badge wfd-badge-'+_st+'">'+(statusMap[_st]||_st)+'</span>'; }

        // 설명 표시/편집
        var descEl = document.getElementById('wfe-desc');
        var _desc = wf.description || '';
        descEl.textContent = _desc || '설명 추가...';
        if(!_desc) descEl.classList.add('wf-desc-placeholder');
        descEl.addEventListener('click', function(){
            var input = document.createElement('input');
            input.type = 'text';
            input.value = _desc;
            input.placeholder = '워크플로우 설명을 입력하세요';
            input.style.cssText = 'font:inherit;font-size:12px;border:1px solid #7c5cfc;border-radius:4px;padding:1px 6px;outline:none;width:300px;color:#6b7280;background:#fff;';
            descEl.replaceWith(input);
            input.focus();
            function commitDesc(){
                var newDesc = (input.value||'').trim();
                _desc = newDesc;
                descEl.textContent = newDesc || '설명 추가...';
                descEl.classList.toggle('wf-desc-placeholder', !newDesc);
                input.replaceWith(descEl);
                fetch(API+'/'+wfId, {
                    method:'PUT', credentials:'same-origin',
                    headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({description:newDesc})
                });
            }
            input.addEventListener('blur', commitDesc);
            input.addEventListener('keydown', function(e){
                if(e.key==='Enter') commitDesc();
                if(e.key==='Escape'){ input.value=_desc; commitDesc(); }
            });
        });

        // 편집 잠금 확인 & 획득
        var _isReadOnly = false;
        var myUid = window.__wfCurrentUserId;
        var editingUid = wf.editing_user_id;

        function showEditingIndicator(){
            var el = document.getElementById('wfe-editing');
            if(el) el.style.display = '';
        }

        function acquireLock(){
            fetch(API+'/'+wfId+'/lock', {method:'POST', credentials:'same-origin'})
            .then(function(r){ return r.json(); })
            .then(function(d){
                if(d.success){
                    showEditingIndicator();
                }
            }).catch(function(){});
        }

        function applyReadOnlyMode(){
            _isReadOnly = true;
            editorRoot.classList.add('wf-readonly');
            // 툴바, 보조 버튼 비활성화
            var saveBtn = document.getElementById('wfe-save');
            if(saveBtn) saveBtn.style.display = 'none';
            var shareBtn2 = document.getElementById('wfe-share');
            if(shareBtn2) shareBtn2.style.display = 'none';
            var thumbBtn = document.getElementById('wfe-thumbnail');
            if(thumbBtn) thumbBtn.style.display = 'none';
            toolbar.style.pointerEvents = 'none';
            toolbar.style.opacity = '0.4';
        }

        // 다른 사용자가 편집 중이면 읽기전용, 아니면 잠금 획득
        if(editingUid && editingUid !== myUid){
            applyReadOnlyMode();
            // 읽기전용 안내
            var roNotice = document.createElement('div');
            roNotice.className = 'wf-readonly-notice';
            roNotice.innerHTML = '<span>다른 사용자가 수정 중입니다. 보기만 가능하며 채팅에 참여할 수 있습니다.</span>';
            document.getElementById('wfe-bottombar').appendChild(roNotice);

            // ═══ 실시간 동기화 폴링 (읽기전용) ═══
            var _liveHash = '';
            function pollLiveSync(){
                fetch(API+'/'+wfId+'/live', {credentials:'same-origin'})
                .then(function(r){ return r.json(); })
                .then(function(d){
                    if(!d.success || !d.definition_json) return;
                    // 편집자가 떠나면 잠금 해제 → 페이지 새로고침
                    if(!d.editing_user_id){
                        location.reload();
                        return;
                    }
                    var newHash = JSON.stringify(d.definition_json);
                    if(newHash === _liveHash) return;
                    _liveHash = newHash;
                    var def = d.definition_json;
                    // 기존 노드 DOM 제거
                    var oldEls = worldEl.querySelectorAll('.wf-shape');
                    for(var oi=0;oi<oldEls.length;oi++) oldEls[oi].remove();
                    // 배열 교체
                    nodes.length = 0;
                    edges.length = 0;
                    var newNodes = (def.nodes || []);
                    var newEdges = (def.edges || []);
                    for(var ni=0;ni<newNodes.length;ni++) nodes.push(newNodes[ni]);
                    for(var ei=0;ei<newEdges.length;ei++) edges.push(newEdges[ei]);
                    // drawPaths 동기화
                    if(def.drawPaths){
                        drawPaths.length = 0;
                        for(var di=0;di<def.drawPaths.length;di++) drawPaths.push(def.drawPaths[di]);
                        if(typeof renderAllDrawPaths === 'function') renderAllDrawPaths();
                    }
                    // 노드 렌더링
                    nodes.forEach(function(n){
                        renderNodeEl(n); applyNodeBgColor(n); updateSysBadge(n);
                    });
                    drawEdges();
                    // viewport 동기화
                    if(def.viewport){
                        panX = def.viewport.x || 0;
                        panY = def.viewport.y || 0;
                        zoom = def.viewport.zoom || 1;
                        applyTransform();
                    }
                    // 캔버스 배경 동기화
                    if(def.canvasSettings){
                        var cs = def.canvasSettings;
                        var areaEl = document.getElementById('wfe-canvas-area');
                        if(cs.bgColor && areaEl){ areaEl.style.backgroundColor = cs.bgColor; applyBgTheme(cs.bgColor); }
                        if(cs.dotColor && areaEl) areaEl.setAttribute('data-dot-color', cs.dotColor);
                        if(cs.bgMode){ _canvasBgMode = cs.bgMode; _gridVisible = cs.bgMode !== 'solid'; }
                        applyCanvasBg();
                    }
                }).catch(function(){});
            }
            setInterval(pollLiveSync, 3000);

            // ═══ 시청자 하트비트 (읽기전용 → 서버, 5초) ═══
            function viewerHeartbeat(){
                fetch(API+'/'+wfId+'/viewers', {method:'POST', credentials:'same-origin'}).catch(function(){});
            }
            viewerHeartbeat();
            setInterval(viewerHeartbeat, 5000);
        } else {
            acquireLock();

            // ═══ 시청자 폴링 (편집자, 5초) ═══
            var _knownViewerIds = {};
            var _viewerBadge = document.getElementById('wfe-viewer-badge');
            var _viewerCount = document.getElementById('wfe-viewer-count');
            function pollViewers(){
                fetch(API+'/'+wfId+'/viewers', {credentials:'same-origin'})
                .then(function(r){ return r.json(); })
                .then(function(d){
                    if(!d.success) return;
                    var count = d.count || 0;
                    if(count > 0){
                        _viewerBadge.style.display = '';
                        _viewerCount.textContent = count;
                    } else {
                        _viewerBadge.style.display = 'none';
                    }
                    // 새로운 시청자 알림
                    var viewers = d.viewers || [];
                    for(var vi=0; vi<viewers.length; vi++){
                        var v = viewers[vi];
                        if(!_knownViewerIds[v.id]){
                            _knownViewerIds[v.id] = true;
                            showViewerToast(v.name || '익명');
                        }
                    }
                    // 떠난 시청자 정리
                    var currentIds = {};
                    for(var vj=0; vj<viewers.length; vj++) currentIds[viewers[vj].id] = true;
                    for(var kid in _knownViewerIds){
                        if(!currentIds[kid]) delete _knownViewerIds[kid];
                    }
                }).catch(function(){});
            }
            setInterval(pollViewers, 5000);
        }

        // 페이지 이탈 시 잠금/시청자 해제
        window.addEventListener('beforeunload', function(){
            if(!_isReadOnly){
                try {
                    fetch(API+'/'+wfId+'/lock', {method:'DELETE', credentials:'same-origin', keepalive:true});
                } catch(e){}
            } else {
                try {
                    fetch(API+'/'+wfId+'/viewers', {method:'DELETE', credentials:'same-origin', keepalive:true});
                } catch(e){}
            }
        });

        // 작성자 표시
        var authorEl = document.getElementById('wfe-author');
        var ownerName = wf.owner_name || '';
        var ownerImg = wf.owner_profile_image || '';
        // fallback: 현재 로그인 사용자 프로필 이미지
        if(!ownerImg){
            var mainEl = document.querySelector('.wf-editor-main');
            ownerImg = (mainEl && mainEl.getAttribute('data-profile-image')) || '';
        }
        if(!ownerName){
            var mainEl2 = document.querySelector('.wf-editor-main');
            ownerName = (mainEl2 && mainEl2.getAttribute('data-user-name')) || '';
        }
        if(ownerName){
            var avatarHtml = ownerImg
                ? '<img class="wf-author-avatar" src="'+escTxt(ownerImg)+'" alt="">'
                : '<span class="wf-author-avatar wf-author-initial">'+escTxt(ownerName.charAt(0))+'</span>';
            authorEl.innerHTML = avatarHtml + '<span class="wf-author-name">'+escTxt(ownerName)+'</span>';
        }

        // 공유 상태 초기화
        _isShared = !!(wf.shared);
        updateShareBtn();

        // 기존 정의 로드
        var def = wf.definition_json || {nodes:[], edges:[], viewport:{x:0,y:0,zoom:1}};
        nodes = (def.nodes || []).slice();
        edges = (def.edges || []).slice();

        if(nodes.length){
            var maxId = 0;
            nodes.forEach(function(n){
                var num = parseInt((n.id||'').replace('node_',''));
                if(num > maxId) maxId = num;
            });
            nextId = maxId + 1;
        }

        if(def.viewport){
            panX = def.viewport.x || 0;
            panY = def.viewport.y || 0;
            zoom = def.viewport.zoom || 1;
            applyTransform();
        }

        // 캔버스 배경 설정 복원
        if(def.canvasSettings){
            var cs = def.canvasSettings;
            var areaEl = document.getElementById('wfe-canvas-area');
            if(cs.bgColor && areaEl){
                areaEl.style.backgroundColor = cs.bgColor;
                applyBgTheme(cs.bgColor);
            }
            if(cs.dotColor && areaEl) areaEl.setAttribute('data-dot-color', cs.dotColor);
            if(cs.bgMode){ _canvasBgMode = cs.bgMode; _gridVisible = cs.bgMode !== 'solid'; }
            applyCanvasBg();
        }

        nodes.forEach(function(n){
            // 구 데이터 마이그레이션: 메모 전용 필드 기본값
            if(n.type === 'note' && n.data){
                if(n.data.showSignature === undefined) n.data.showSignature = true;
                if(n.data.showUser === undefined) n.data.showUser = false;
                if(n.data.showDate === undefined) n.data.showDate = false;
                if(n.data.fontFamily === undefined) n.data.fontFamily = '';
                if(n.data.fontSize === undefined) n.data.fontSize = 13;
                if(n.data.fontBold === undefined) n.data.fontBold = false;
                if(n.data.textAlign === undefined) n.data.textAlign = 'left';
                if(n.data.noteTexture === undefined) n.data.noteTexture = '';
                if(n.data.noteTextureBgSize === undefined) n.data.noteTextureBgSize = '';
            }
            // 구 데이터 마이그레이션: 표 전용 필드 기본값
            if(n.type === 'table' && n.data){
                if(!n.data.tableCellStyles) n.data.tableCellStyles = null; // ensureTblCellStyles가 생성
                if(!n.data.tableRowHeights) n.data.tableRowHeights = null;
                if(!n.data.tableColWidths) n.data.tableColWidths = null;
            }
            // 구 데이터 마이그레이션: 마인드맵 기본값
            if(n.type === 'mindmap' && n.data){
                if(!n.data.mmTree) n.data.mmTree = {id:'mm_0', text:'메인 주제', children:[]};
                if(!n.data.mmStyle) n.data.mmStyle = 'mm_style_01';
                if(n.data._mmNextId === undefined) n.data._mmNextId = 0;
            }
            renderNodeEl(n); applyNodeBgColor(n); updateSysBadge(n);
        });
        drawEdges();

        if(!nodes.length){
            zoom = 1; panX = 200; panY = 150;
            applyTransform();
        }
    })
    .catch(function(){
        worldEl.innerHTML = '<p style="padding:60px;color:#e74c3c;font-size:14px;">워크플로우 로드 실패</p>';
    });

})();

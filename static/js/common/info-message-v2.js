/**
 * 공통 인포메이션 문구 컴포넌트 (info-message.js)
 * ================================================
 * 모든 페이지에서 사용하는 보안/안내 문구 팝오버를 DB 기반으로 자동 렌더링한다.
 *
 * 사용법:
 *   HTML: <div class="page-utility-right" data-info-key="system.server"></div>
 *   또는  window.__infoMenuKey = 'system.server'; (JS 전역 변수)
 *
 * 동작:
 *   1. data-info-key 또는 window.__infoMenuKey 에서 menu_key 읽기
 *   2. /api/info-messages/<menu_key> 호출
 *   3. 활성화 상태면 팝오버 DOM 자동 구성
 *   4. 비활성·값 없음·에러 시 안전하게 숨김 처리
 *
 * v1.0.0  2026-03-14
 */
(function(){
    'use strict';

    var DEFAULT_INFO_ITEM = {
        info_title: '보안 준수 안내',
        info_content: '보안 정책을 확인해주세요.',
        is_enabled: true
    };

    var INFO_LOTTIE_LOCAL = '/static/js/vendor/lottie.min.js?v=5.12.2';
    var INFO_LOTTIE_CDN = 'https://unpkg.com/lottie-web@5.12.2/build/player/lottie.min.js';
    var INFO_LOTTIE_PATH = '/static/image/svg/free-animated-icon-information.json';
    var USE_LOTTIE_STICKER = true;
    var INFO_LOTTIE_DATA_PROMISE = null;

    function ensureLottie(cb){
        if(window.lottie){ cb(); return; }
        var existed = document.querySelector('script[data-info-lottie-loader="1"]');
        if(existed){
            existed.addEventListener('load', function(){ cb(); }, { once: true });
            return;
        }
        var s = document.createElement('script');
        s.src = INFO_LOTTIE_LOCAL;
        s.async = true;
        s.setAttribute('data-info-lottie-loader', '1');
        s.onload = function(){ cb(); };
        s.onerror = function(){
            var c = document.createElement('script');
            c.src = INFO_LOTTIE_CDN;
            c.async = true;
            c.setAttribute('data-info-lottie-loader', '1');
            c.onload = function(){ cb(); };
            document.head.appendChild(c);
        };
        document.head.appendChild(s);
    }

    function cloneInfoAnimationData(node){
        if (Array.isArray(node)) {
            return node.map(cloneInfoAnimationData);
        }
        if (!node || typeof node !== 'object') {
            return node;
        }
        var cloned = {};
        Object.keys(node).forEach(function(key){
            if (key === 'x') return;
            cloned[key] = cloneInfoAnimationData(node[key]);
        });
        return cloned;
    }

    function getInfoAnimationData(){
        if (INFO_LOTTIE_DATA_PROMISE) return INFO_LOTTIE_DATA_PROMISE;
        INFO_LOTTIE_DATA_PROMISE = fetch(INFO_LOTTIE_PATH, {
            credentials: 'same-origin',
            cache: 'no-store'
        })
            .then(function(response){
                if (!response.ok) {
                    throw new Error('Failed to load sticker json: ' + response.status);
                }
                return response.json();
            })
            .then(function(data){
                return cloneInfoAnimationData(data);
            })
            .catch(function(error){
                INFO_LOTTIE_DATA_PROMISE = null;
                throw error;
            });
        return INFO_LOTTIE_DATA_PROMISE;
    }

    function attachStickerMotion(sticker){
        if (!sticker || sticker.__infoMotionAttached) return;
        sticker.__infoMotionAttached = true;
        sticker.style.transformOrigin = '50% 80%';
        sticker.style.willChange = 'transform, filter';

        var startedAt = Date.now();
        function tick(){
            if (!document.body.contains(sticker)) {
                if (sticker.__infoMotionTimer) {
                    clearInterval(sticker.__infoMotionTimer);
                    sticker.__infoMotionTimer = null;
                }
                sticker.__infoMotionAttached = false;
                return;
            }
            var now = Date.now() - startedAt;
            var wave = now / 520;
            var lift = Math.sin(wave) * 4.5;
            var sway = Math.sin(wave * 0.7) * 1.4;
            var scale = 1 + (Math.sin(wave * 1.15) * 0.018);
            var shadowY = 6 + Math.max(0, Math.sin(wave) * 8);
            var shadowBlur = 14 + Math.max(0, Math.sin(wave) * 10);
            var shadowAlpha = 0.08 + Math.max(0, Math.sin(wave) * 0.06);
            sticker.style.transform = 'translateY(' + (-lift).toFixed(2) + 'px) scale(' + scale.toFixed(3) + ') rotate(' + sway.toFixed(2) + 'deg)';
            sticker.style.filter = 'drop-shadow(0 ' + shadowY.toFixed(2) + 'px ' + shadowBlur.toFixed(2) + 'px rgba(0,0,0,' + shadowAlpha.toFixed(3) + '))';
        }
        tick();
        sticker.__infoMotionTimer = window.setInterval(tick, 60);
    }

    /* ── 유틸 ── */
    /** XSS 방지용 텍스트 이스케이프 */
    function escapeHtml(str) {
        if (!str) return '';
        var d = document.createElement('div');
        d.appendChild(document.createTextNode(str));
        return d.innerHTML;
    }



    /* ── menu_key 결정 ── */
    function resolveMenuKey() {
        // 1) 현재 main 내부의 data-info-key 속성
        var el = findContainer();
        if (el) return el.getAttribute('data-info-key');
        // 2) 전역 변수
        if (window.__infoMenuKey) return window.__infoMenuKey;
        return null;
    }

    /* ── 컨테이너 찾기 ── */
    function findContainer() {
        // 현재 활성 main 내부의 안내 위젯을 우선 선택한다.
        var main = document.querySelector('main.main-content');
        if (main) {
            return main.querySelector('[data-info-key]')
                || main.querySelector('.page-utility-right');
        }
        return document.querySelector('[data-info-key]')
            || document.querySelector('.page-utility-right');
    }

    /* ── 팝오버 DOM 생성 ── */
    function buildPopover(container, item) {
        // 기존 하드코딩 팝오버 잔재 제거
        var oldTrigger = container.querySelector('#info-trigger');
        var oldPop = container.querySelector('#info-popover');
        if (oldTrigger) oldTrigger.remove();
        if (oldPop) oldPop.remove();

        // 트리거 버튼
        var trigger = document.createElement('button');
        trigger.id = 'info-trigger';
        trigger.className = 'info-trigger';
        trigger.type = 'button';
        trigger.setAttribute('aria-haspopup', 'dialog');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.setAttribute('aria-controls', 'info-popover');
        trigger.title = '보안 준수 안내';

        var sticker = document.createElement('div');
        sticker.className = 'info-trigger-icon';
        sticker.style.width = '64px';
        sticker.style.height = '64px';
        sticker.style.display = 'block';
        sticker.style.position = 'relative';
        sticker.style.overflow = 'hidden';
        sticker.style.opacity = '0.92';
        sticker.style.filter = 'drop-shadow(0 6px 14px rgba(0,0,0,.08))';
        sticker.style.pointerEvents = 'none';
        attachStickerMotion(sticker);
        trigger.appendChild(sticker);

        if (USE_LOTTIE_STICKER) {
            ensureLottie(function(){
                if(!window.lottie){ return; }

                getInfoAnimationData().then(function(animationData){
                    var retried = false;
                    function load(renderer){
                        var anim = window.lottie.loadAnimation({
                            container: sticker,
                            renderer: renderer,
                            loop: true,
                            autoplay: true,
                            animationData: cloneInfoAnimationData(animationData),
                            rendererSettings: { preserveAspectRatio: 'xMidYMid meet', progressiveLoad: true }
                        });
                        if (!anim || typeof anim.addEventListener !== 'function') return;
                        anim.addEventListener('DOMLoaded', function(){
                            var node = sticker.querySelector('canvas, svg');
                            if (!node) return;
                            node.style.position = 'absolute';
                            node.style.left = '0';
                            node.style.top = '0';
                            node.style.width = '100%';
                            node.style.height = '100%';
                            node.style.zIndex = '2';
                        });
                        anim.addEventListener('data_failed', function(){
                            if (retried) return;
                            retried = true;
                            try { anim.destroy(); } catch (_e) {}
                            load(renderer === 'svg' ? 'canvas' : 'svg');
                        });
                    }

                    try {
                        load('svg');
                    } catch (_e) {}
                }).catch(function(){
                    return;
                });
            });
        }

        // 팝오버 패널
        var pop = document.createElement('div');
        pop.id = 'info-popover';
        pop.className = 'info-popover';
        pop.setAttribute('role', 'dialog');
        pop.setAttribute('aria-modal', 'false');
        pop.setAttribute('aria-label', escapeHtml(item.info_title) + ' 안내');
        pop.hidden = true;

        // 내용 구성 (XSS-safe: 텍스트만 사용)
        var contentDiv = document.createElement('div');
        contentDiv.className = 'info-popover-content';

        var titleDiv = document.createElement('div');
        titleDiv.className = 'info-popover-title';
        titleDiv.textContent = item.info_title || '';
        contentDiv.appendChild(titleDiv);

        // 줄바꿈 → <li> 목록
        var lines = (item.info_content || '').split('\n').filter(function(l){ return l.trim(); });
        if (lines.length) {
            var ul = document.createElement('ul');
            ul.className = 'info-popover-list';
            for (var i = 0; i < lines.length; i++) {
                var li = document.createElement('li');
                li.textContent = lines[i];
                ul.appendChild(li);
            }
            contentDiv.appendChild(ul);
        }

        pop.appendChild(contentDiv);

        // 닫기 버튼
        var closeBtn = document.createElement('button');
        closeBtn.className = 'info-popover-close';
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', '닫기');
        closeBtn.textContent = '\u00D7';
        pop.appendChild(closeBtn);

        container.appendChild(trigger);
        container.appendChild(pop);

        // 팝오버 토글 로직
        initPopoverBehavior(trigger, pop, closeBtn);
    }

    /* ── 팝오버 동작 ── */
    function initPopoverBehavior(trigger, pop, closeBtn) {
        function place() {
            var r = trigger.getBoundingClientRect();
            var popW = pop.offsetWidth || 320;
            var popH = pop.offsetHeight || 200;
            var top = Math.max(12, r.top + (r.height / 2) - (popH / 2));
            var left = r.left - popW - 12;
            var header = document.querySelector('.main-header');
            if (header) {
                var hb = header.getBoundingClientRect().bottom;
                if (top < hb + 8) top = hb + 8;
            }
            if (left < 8) left = Math.min(window.innerWidth - popW - 8, r.right + 12);
            if (top + popH > window.innerHeight - 8) top = window.innerHeight - popH - 8;
            pop.style.top  = Math.max(8, top) + 'px';
            pop.style.left = Math.max(8, left) + 'px';
        }
        function open()  { pop.hidden = false; trigger.setAttribute('aria-expanded', 'true');  place(); }
        function close() { pop.hidden = true;  trigger.setAttribute('aria-expanded', 'false'); }
        function toggle(){ (pop.hidden ? open : close)(); }
        function outside(e) {
            if (pop.hidden) return;
            if (pop.contains(e.target) || trigger.contains(e.target)) return;
            close();
        }
        trigger.addEventListener('click', toggle);
        document.addEventListener('click', outside);
        document.addEventListener('keydown', function(e){ if (e.key === 'Escape') close(); });
        if (closeBtn) closeBtn.addEventListener('click', close);
        window.addEventListener('resize', function(){ if (!pop.hidden) place(); });
        window.addEventListener('scroll', function(){ if (!pop.hidden) place(); }, true);
    }



    /* ── 메인 초기화 ── */
    function initInfoMessage() {
        var menuKey = resolveMenuKey();
        if (!menuKey) return; // 설정 안 된 페이지는 무시

        var container = findContainer();
        if (!container) return;

        // 스티커는 즉시 렌더하고, API 응답은 팝오버 내용만 갱신한다.
        buildPopover(container, DEFAULT_INFO_ITEM);
        container.style.display = '';
        container.style.visibility = '';

        fetch('/api/info-messages/' + encodeURIComponent(menuKey), { credentials: 'same-origin' })
            .then(function(r){ return r.json(); })
            .then(function(data){
                if (!data.success || !data.item) {
                    return;
                }
                var item = data.item;
                if (!item.is_enabled) {
                    // 비활성 상태여도 스티커는 유지하고 기본 안내를 사용한다.
                    return;
                }
                buildPopover(container, item);
                container.style.display = '';
                container.style.visibility = '';
            })
            .catch(function(){
                return;
            });
    }

    /* 글로벌 노출: 수동 호출 지원 */
    window.blsInitInfoMessage = initInfoMessage;

    /* 자동 초기화 */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initInfoMessage);
    } else {
        initInfoMessage();
    }

    document.addEventListener('blossom:pageLoaded', function(){
        initInfoMessage();
    });
})();

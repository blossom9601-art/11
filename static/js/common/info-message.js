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
        // 1) data-info-key 속성
        var el = document.querySelector('[data-info-key]');
        if (el) return el.getAttribute('data-info-key');
        // 2) 전역 변수
        if (window.__infoMenuKey) return window.__infoMenuKey;
        return null;
    }

    /* ── 컨테이너 찾기 ── */
    function findContainer() {
        // data-info-key 를 가진 요소 또는 기존 .page-utility-right
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

        // lottie-player 스크립트 동적 로드
        if (!document.querySelector('script[src*="lottie-player"]')) {
            var ls = document.createElement('script');
            ls.src = 'https://unpkg.com/@lottiefiles/lottie-player@2.0.8/dist/lottie-player.js';
            document.head.appendChild(ls);
        }
        var lottie = document.createElement('lottie-player');
        lottie.setAttribute('src', '/static/image/svg/free-animated-icon-mail.json');
        lottie.setAttribute('background', 'transparent');
        lottie.setAttribute('speed', '1');
        lottie.setAttribute('loop', '');
        lottie.setAttribute('autoplay', '');
        lottie.className = 'info-trigger-icon';
        lottie.style.width  = '64px';
        lottie.style.height = '64px';
        lottie.style.opacity = '0.92';
        lottie.style.filter  = 'drop-shadow(0 6px 14px rgba(0,0,0,.08))';
        lottie.style.pointerEvents = 'none';
        lottie.setAttribute('aria-hidden', 'true');
        trigger.appendChild(lottie);

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

        fetch('/api/info-messages/' + encodeURIComponent(menuKey), { credentials: 'same-origin' })
            .then(function(r){ return r.json(); })
            .then(function(data){
                if (!data.success || !data.item) {
                    // 데이터 없음 → 컨테이너 숨김
                    container.style.display = 'none';
                    return;
                }
                var item = data.item;
                if (!item.is_enabled) {
                    // 비활성화 → 숨김
                    container.style.display = 'none';
                    return;
                }
                buildPopover(container, item);
            })
            .catch(function(){
                // 네트워크 에러 시 조용히 숨김
                container.style.display = 'none';
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
})();

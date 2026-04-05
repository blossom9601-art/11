/**
 * bls-stats-modal.js — 통계 모달 공통 렌더링 모듈 v2.0
 * ========================================================
 * 모든 list.html 페이지에서 공유하는 통계 모달 렌더링 모듈.
 *
 * v2.0 변경사항:
 *   - renderCard()에 섹션 자동 생성 로직 추가 (grid가 DOM에 없으면 자동 생성)
 *   - bar 계산: count/total → count/max (상대 비율, min 8%)
 *   - build()에서 섹션 DOM 동적 생성
 *
 * 사용법:
 *   <script src="/static/js/_shared/bls-stats-modal.js?v=2.0"></script>
 *
 *   // 열기/닫기
 *   blsStats.open('system-stats-modal');
 *   blsStats.close('system-stats-modal');
 *
 *   // 카드 렌더링 (섹션 자동 생성)
 *   blsStats.renderCard(containerId, title, dist, fixedOptions, opts);
 *
 *   // 분포 집계
 *   var dist = blsStats.countBy(rows, 'work_type');
 *
 *   // 카드 높이 균등화
 *   blsStats.equalizeHeights('system-stats-modal');
 *
 *   // 전체 빌드 (섹션 배열 → 한번에 렌더)
 *   blsStats.build('system-stats-modal', rows, [
 *     { id:'stats-business', title:'비즈니스', cards:[
 *       { title:'업무 분류', key:'work_type' },
 *       { title:'업무 상태', key:'work_status', fixed:['가동','유휴','대기'] },
 *     ]},
 *   ]);
 *
 * v2.0  2026-03-28
 */
(function() {
    'use strict';

    var blsStats = {};

    /* ── 색상 팔레트 ── */
    var COLORS = ['#6366F1','#3b82f6','#0ea5e9','#14b8a6','#22c55e',
                  '#eab308','#f97316','#ef4444','#a855f7','#94a3b8'];
    blsStats.COLORS = COLORS;

    /* ══════════════════════════════════════════════
       모달 열기 / 닫기
       ══════════════════════════════════════════════ */

    /**
     * 통계 모달 열기
     * @param {string|HTMLElement} modal - 모달 ID 또는 DOM 요소
     */
    blsStats.open = function(modal) {
        var el = typeof modal === 'string' ? document.getElementById(modal) : modal;
        if (!el) return;
        // 빈 섹션 숨기기
        _hideEmptySections(el);
        el.classList.add('show');
        el.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
        // resize 이벤트로 높이 균등화 유지
        el._blsResizeHandler = function() { blsStats.equalizeHeights(el); };
        window.addEventListener('resize', el._blsResizeHandler);
    };

    /**
     * 통계 모달 닫기
     * @param {string|HTMLElement} modal - 모달 ID 또는 DOM 요소
     */
    blsStats.close = function(modal) {
        var el = typeof modal === 'string' ? document.getElementById(modal) : modal;
        if (!el) return;
        el.classList.remove('show');
        el.setAttribute('aria-hidden', 'true');
        // resize 핸들러 정리
        if (el._blsResizeHandler) {
            window.removeEventListener('resize', el._blsResizeHandler);
            el._blsResizeHandler = null;
        }
        // 다른 모달이 열려 있지 않으면 body 잠금 해제
        if (!document.querySelector('.modal-overlay-base.show, .server-add-modal.show, .server-edit-modal.show')) {
            document.body.classList.remove('modal-open');
        }
    };

    /**
     * 모달 이벤트 바인딩 (닫기 버튼, 확인 버튼, 오버레이 클릭, Escape 키)
     * @param {string} modalId
     * @param {string} closeId - 닫기 버튼 ID
     * @param {string} [okId]  - 확인 버튼 ID
     */
    blsStats.bindClose = function(modalId, closeId, okId) {
        var modal = document.getElementById(modalId);
        var closeBtn = document.getElementById(closeId);
        var okBtn = okId ? document.getElementById(okId) : null;

        function doClose() { blsStats.close(modalId); }

        if (closeBtn) closeBtn.addEventListener('click', doClose);
        if (okBtn) okBtn.addEventListener('click', doClose);
        if (modal) {
            modal.addEventListener('click', function(e) {
                if (e.target === modal) doClose();
            });
        }
    };


    /* ══════════════════════════════════════════════
       분포 집계
       ══════════════════════════════════════════════ */

    /**
     * 행 배열에서 특정 키의 값 분포를 계산
     * @param {Array} rows - 데이터 행 배열
     * @param {string} key - 집계할 필드명
     * @param {Array} [fixedOptions] - 미리 정의된 옵션 목록
     * @returns {Object} { 값: 건수, ... }
     */
    blsStats.countBy = function(rows, key, fixedOptions) {
        var dist = {};
        if (Array.isArray(fixedOptions)) {
            fixedOptions.forEach(function(v) { dist[String(v)] = 0; });
        }
        (rows || []).forEach(function(r) {
            var raw = r[key];
            var v = (raw == null || String(raw).trim() === '') ? '-' : String(raw);
            if (v === '-') return;
            dist[v] = (dist[v] || 0) + 1;
        });
        return dist;
    };


    /* ══════════════════════════════════════════════
       섹션 자동 생성
       ══════════════════════════════════════════════ */

    /** 그리드 ID → 섹션 제목 기본 매핑 */
    var SECTION_TITLES = {
        'stats-business': '비즈니스',
        'stats-system': '시스템',
        'stats-inspection': '점검',
        'stats-software': '하드웨어',
        'stats-versions': '요약',
        'stats-check': '분포'
    };

    /**
     * 섹션 제목 매핑을 확장/덮어쓰기
     * @param {Object} map - { gridId: sectionTitle, ... }
     */
    blsStats.defineSections = function(map) {
        for (var k in map) {
            if (map.hasOwnProperty(k)) SECTION_TITLES[k] = map[k];
        }
    };

    /**
     * 그리드 컨테이너가 DOM에 없으면 섹션을 자동 생성
     * @param {string} gridId - 그리드 ID
     * @returns {HTMLElement|null} 생성된 또는 기존 그리드 요소
     */
    function _ensureGrid(gridId) {
        var el = document.getElementById(gridId);
        if (el) return el;

        var body = document.getElementById('system-stats-body');
        if (!body) return null;

        var sectionTitle = SECTION_TITLES[gridId] || gridId;
        var section = document.createElement('div');
        section.className = 'form-section';
        section.setAttribute('data-stats-section', gridId);
        section.innerHTML =
            '<div class="section-header"><h4>' + _esc(sectionTitle) + '</h4></div>' +
            '<div id="' + gridId + '" class="stats-grid"></div>';
        body.appendChild(section);

        return document.getElementById(gridId);
    }


    /* ══════════════════════════════════════════════
       카드 렌더링
       ══════════════════════════════════════════════ */

    /**
     * 단일 통계 카드 렌더링
     * @param {string} containerId - 카드를 삽입할 컨테이너 ID (.stats-grid)
     * @param {string} title - 카드 제목
     * @param {Object} dist - { 값: 건수 }
     * @param {Array} [fixedOptions] - 정렬된 옵션 목록
     * @param {Object} [opts] - { hideZero, zeroNote, toggleOX }
     */
    blsStats.renderCard = function(containerId, title, dist, fixedOptions, opts) {
        opts = opts || {};
        var el = _ensureGrid(containerId);
        if (!el) return;

        // 최대값 계산 (상대 비율 bar 용)
        var maxVal = 0;
        var k;
        for (k in dist) {
            if (dist.hasOwnProperty(k) && dist[k] > maxVal) maxVal = dist[k];
        }

        function makeRow(label, count) {
            var pct = (count > 0 && maxVal > 0)
                ? Math.max(8, Math.round((count / maxVal) * 100))
                : 0;
            var isOX = !!opts.toggleOX && (label === 'O' || label === 'X');
            var badge = '';
            if (isOX) {
                badge = '<span class="ox-badge ' + (label === 'O' ? 'on' : 'off') + '" aria-hidden="true">' + label + '</span>';
            }
            var statusDot = '';
            if (Array.isArray(fixedOptions) && fixedOptions.indexOf('가동') >= 0 &&
                (label === '가동' || label === '유휴' || label === '대기')) {
                var map = { '가동': 'ws-run', '유휴': 'ws-idle', '대기': 'ws-wait' };
                statusDot = '<span class="status-dot ' + (map[label] || 'ws-wait') + '" aria-hidden="true"></span>';
            }
            var labelHtml = isOX
                ? '<span class="label with-badge">' + badge + '</span>'
                : '<span class="label">' + statusDot + '<span title="' + _esc(label) + '">' + _esc(label) + '</span></span>';
            return '<div class="stat-item">' + labelHtml +
                '<div class="bar"><span style="width:' + pct + '%"></span></div>' +
                '<span class="value">' + count + '</span></div>';
        }

        var itemsHTML = '';
        if (Array.isArray(fixedOptions) && fixedOptions.length) {
            var visible = [];
            var hiddenZero = [];
            fixedOptions.forEach(function(fk) {
                var sk = String(fk);
                var c = dist[sk] || 0;
                if (opts.hideZero && c === 0) hiddenZero.push(sk);
                else visible.push([sk, c]);
            });
            itemsHTML = visible.map(function(pair) { return makeRow(pair[0], pair[1]); }).join('');
            if (opts.zeroNote && hiddenZero.length) {
                itemsHTML += '<div class="stat-muted-note">0개 항목 숨김: ' + hiddenZero.join(', ') + '</div>';
            }
        } else {
            var entries = [];
            for (k in dist) {
                if (dist.hasOwnProperty(k)) entries.push([k, dist[k]]);
            }
            entries.sort(function(a, b) { return b[1] - a[1]; });
            var N = (Number.isFinite(opts.topN) && opts.topN > 0) ? Math.floor(opts.topN) : 5;
            var top = entries.slice(0, N);
            var restCount = 0;
            for (var i = N; i < entries.length; i++) restCount += entries[i][1];
            var includeOther = opts.includeOther !== false;
            itemsHTML = top.map(function(pair) { return makeRow(pair[0] || '-', pair[1]); }).join('');
            if (includeOther && restCount) itemsHTML += makeRow('기타', restCount);
        }

        var cardHTML = '<div class="stat-card">' +
            '<div class="stat-title">' + _esc(title) + '</div>' +
            '<div class="stat-items">' + itemsHTML + '</div></div>';
        el.insertAdjacentHTML('beforeend', cardHTML);
    };

    /**
     * 일러스트 카드 삽입
     * @param {string} containerId - 삽입할 그리드 ID
     * @param {string} imgSrc - 이미지 경로
     * @param {string} [afterTitle] - 이 제목의 카드 뒤에 삽입 (없으면 마지막에)
     */
    blsStats.renderIllustration = function(containerId, imgSrc, afterTitle) {
        var el = document.getElementById(containerId);
        if (!el) return;
        var illu = document.createElement('div');
        illu.className = 'stat-card stat-illustration-card';
        illu.setAttribute('aria-hidden', 'true');
        illu.innerHTML = '<img src="' + _esc(imgSrc) + '" alt="" loading="lazy">';
        if (afterTitle) {
            var cards = el.querySelectorAll('.stat-card');
            var target = null;
            for (var i = 0; i < cards.length; i++) {
                var titleEl = cards[i].querySelector('.stat-title');
                if (titleEl && titleEl.textContent.trim() === afterTitle) {
                    target = cards[i];
                    break;
                }
            }
            if (target && target.nextSibling) {
                target.parentNode.insertBefore(illu, target.nextSibling);
                return;
            }
        }
        el.appendChild(illu);
    };


    /* ══════════════════════════════════════════════
       카드 높이 균등화
       ══════════════════════════════════════════════ */

    /**
     * 모달 내 모든 stat-card 높이를 가장 높은 것에 맞춤
     * @param {string|HTMLElement} modal
     */
    blsStats.equalizeHeights = function(modal) {
        var el = typeof modal === 'string' ? document.getElementById(modal) : modal;
        if (!el) return;
        var cards = el.querySelectorAll('.stat-card:not(.stat-illustration-card)');
        if (!cards.length) return;
        // 높이 리셋
        for (var i = 0; i < cards.length; i++) cards[i].style.height = 'auto';
        // 최대 높이 측정
        var tallest = 0;
        for (i = 0; i < cards.length; i++) {
            var h = cards[i].getBoundingClientRect().height;
            if (h > tallest) tallest = h;
        }
        var hpx = Math.ceil(tallest) + 'px';
        for (i = 0; i < cards.length; i++) cards[i].style.height = hpx;
    };


    /* ══════════════════════════════════════════════
       한번에 빌드 (섹션 배열 → 그리드 → 카드)
       ══════════════════════════════════════════════ */

    /**
     * 섹션/카드 구조를 한번에 빌드하고 모달 열기
     * @param {string} modalId - 모달 ID
     * @param {Array} rows - 데이터 행 배열
     * @param {Array} sections - [{ id, title, cards:[{ title, key, fixed, opts, compute }] }]
     * @param {Object} [config] - { illustration: { containerId, imgSrc, afterTitle }, autoOpen: true }
     */
    blsStats.build = function(modalId, rows, sections, config) {
        config = config || {};

        // body 초기화 (섹션 동적 생성을 위해)
        var body = document.getElementById('system-stats-body');
        if (body) body.innerHTML = '';

        (sections || []).forEach(function(sec) {
            // 섹션 제목 매핑에 등록 (build 호출 시 title이 우선)
            if (sec.title) SECTION_TITLES[sec.id] = sec.title;

            // 그리드 자동 생성 (body가 비워졌으므로 항상 새로 생성)
            var grid = _ensureGrid(sec.id);
            if (grid) grid.innerHTML = '';

            (sec.cards || []).forEach(function(card) {
                var dist;
                if (typeof card.compute === 'function') {
                    dist = card.compute(rows);
                } else {
                    dist = blsStats.countBy(rows, card.key, card.fixed);
                }
                blsStats.renderCard(sec.id, card.title, dist, card.fixed, card.opts);
            });
        });
        // 일러스트 카드
        if (config.illustration) {
            var ill = config.illustration;
            blsStats.renderIllustration(ill.containerId, ill.imgSrc, ill.afterTitle);
        }
        // 높이 균등화 + 모달 열기
        if (config.autoOpen !== false) {
            blsStats.open(modalId);
            requestAnimationFrame(function() {
                blsStats.equalizeHeights(modalId);
            });
        } else {
            requestAnimationFrame(function() {
                blsStats.equalizeHeights(modalId);
            });
        }
    };


    /* ══════════════════════════════════════════════
       그리드 초기화 (섹션 내 그리드 비우기)
       ══════════════════════════════════════════════ */

    /**
     * 여러 그리드 컨테이너를 동시에 비우기
     * @param {...string} ids - 그리드 ID들
     */
    blsStats.clearGrids = function() {
        for (var i = 0; i < arguments.length; i++) {
            var el = document.getElementById(arguments[i]);
            if (el) el.innerHTML = '';
        }
    };


    /* ══════════════════════════════════════════════
       유틸리티
       ══════════════════════════════════════════════ */

    function _esc(str) {
        if (!str) return '';
        var d = document.createElement('div');
        d.appendChild(document.createTextNode(String(str)));
        return d.innerHTML;
    }

    blsStats._esc = _esc;

    /**
     * 모달 내 빈 섹션 숨기기 (카드가 없는 form-section)
     * @param {HTMLElement} modal
     */
    function _hideEmptySections(modal) {
        var sections = modal.querySelectorAll('.form-section[data-stats-section]');
        for (var i = 0; i < sections.length; i++) {
            var grid = sections[i].querySelector('.stats-grid');
            var hasCards = grid && grid.children.length > 0;
            sections[i].style.display = hasCards ? '' : 'none';
        }
    }

    /* ══════════════════════════════════════════════
       DOM 표준화 부트스트랩
       ══════════════════════════════════════════════ */

    function isStatsModal(modal) {
        if (!modal || !modal.id) return false;
        if (!modal.querySelector('.server-add-header') || !modal.querySelector('.server-add-body')) return false;
        if (modal.classList.contains('system-stats-modal')) return true;
        return /(stats|analytics)-modal$/i.test(modal.id);
    }

    function ensureFooter(modal) {
        var actions = modal.querySelector('.server-add-actions');
        var button;

        if (!actions) {
            actions = document.createElement('div');
            actions.className = 'server-add-actions align-right';
            actions.innerHTML = '<div class="action-buttons right"><button type="button" class="btn-primary"></button></div>';
            modal.querySelector('.server-add-content').appendChild(actions);
        }

        button = actions.querySelector('.btn-primary');
        if (!button) {
            actions.innerHTML = '<div class="action-buttons right"><button type="button" class="btn-primary"></button></div>';
            button = actions.querySelector('.btn-primary');
        }

        if (!button) return;

        if (!button.id) button.id = modal.id + '-ok';
        button.textContent = '확인';
        button.setAttribute('type', 'button');

        if (!button._blsStatsBound) {
            button.addEventListener('click', function() {
                blsStats.close(modal);
            });
            button._blsStatsBound = true;
        }
    }

    function normalizeModal(modal) {
        if (!isStatsModal(modal)) return;
        modal.classList.add('bls-stats');
        ensureFooter(modal);
    }

    function normalizeAll() {
        var modals = document.querySelectorAll('.server-add-modal[id]');
        for (var i = 0; i < modals.length; i++) normalizeModal(modals[i]);
    }

    function closeTopmostStatsModal() {
        var modals = document.querySelectorAll('.server-add-modal.bls-stats.show');
        if (!modals.length) return false;
        blsStats.close(modals[modals.length - 1]);
        return true;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', normalizeAll);
    } else {
        normalizeAll();
    }

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeTopmostStatsModal();
    });

    /* ── 전역 등록 ── */
    window.blsStats = blsStats;

})();

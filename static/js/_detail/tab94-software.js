/*
 * tab94-software.js  v1.0
 * ──────────────────────────────────────────────────────────────
 * 소프트웨어 탭 공통 컴포넌트 — 모든 상세 페이지에서 동일한 UI/UX 제공
 *
 * 지원 컨텍스트 (data-context):
 *   sw-model-assets    — 카테고리 > 소프트웨어 (OS/DB/미들웨어/가상화/보안/고가용성)
 *   vendor-sw-assets   — 카테고리 > 벤더 > 제조사
 *   maint-sw-assets    — 카테고리 > 벤더 > 유지보수사
 *
 * 설정값은 #sw-spec-table 의 data-* 속성에서 읽는다.
 *   data-context          : 컨텍스트 식별자
 *   data-columns          : 컬럼 정의 JSON [{key, label, statusDot?, contractDot?, numeric?}]
 *   data-show-analytics   : "true" / "false"
 *   data-analytics-group  : 통계 그루핑 키 (work_group / model)
 *   data-csv-filename     : CSV 파일명 프리픽스
 *
 * ⚠ 이 파일은 layouts/tab94-software-shared.html 전용이다.
 *   개별 페이지에서 복사/수정하지 말 것.
 */
(function () {
    'use strict';

    /* ══════════════════════════════════════════════════════════
       유틸리티 함수
       ══════════════════════════════════════════════════════════ */
    function ready(fn) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
        else fn();
    }
    function dash(v) { var s = String(v == null ? '' : v).trim(); return s || '-'; }
    function toInt(v) { var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }
    function pad2(n) { return n < 10 ? '0' + n : '' + n; }
    function statusDotHTML(color) {
        var bg = color || '#6b7280';
        return '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;vertical-align:middle;margin-right:6px;background:' + bg + '" aria-hidden="true"></span>';
    }
    function toast(msg, level) {
        try { if (window.showToast) window.showToast(String(msg || ''), level || 'error'); else alert(String(msg || '')); } catch (_) { }
    }
    function escapeCSV(val) { return '"' + String(val == null ? '' : val).replace(/"/g, '""') + '"'; }
    function downloadCSV(filename, lines) {
        var csv = '\uFEFF' + lines.join('\r\n');
        try {
            var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a'); a.href = url; a.download = filename;
            document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        } catch (_) {
            var a2 = document.createElement('a');
            a2.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
            a2.download = filename; document.body.appendChild(a2); a2.click(); document.body.removeChild(a2);
        }
    }
    function openModal(id) { var el = document.getElementById(id); if (!el) return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden', 'false'); }
    function closeModal(id) { var el = document.getElementById(id); if (!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden', 'true'); if (!document.querySelector('.modal-overlay-full.show')) document.body.classList.remove('modal-open'); }

    /* ══════════════════════════════════════════════════════════
       컨텍스트별 API 전략
       ──────────────────────────────────────────────────────────
       각 전략은 getApiUrl(table) → 전체 URL 또는 '' 반환
       pageSizeKey → localStorage 키
       ══════════════════════════════════════════════════════════ */
    var STRATEGIES = {
        /* ── 카테고리 > 소프트웨어 (모델명 기반 조회) ── */
        'sw-model-assets': {
            getApiUrl: function () {
                var titleEl = document.getElementById('page-header-title');
                if (titleEl) {
                    var t = (titleEl.textContent || '').trim();
                    if (t && ['소프트웨어', '모델명'].indexOf(t) < 0)
                        return '/api/category/sw-model-assets?model=' + encodeURIComponent(t);
                }
                return '';
            },
            pageSizeKey: 'sw-model:pageSize'
        },

        /* ── 카테고리 > 벤더 > 제조사 ── */
        'vendor-sw-assets': {
            getApiUrl: function () {
                try {
                    var raw = sessionStorage.getItem('manufacturer:context');
                    if (raw) { var id = toInt(JSON.parse(raw).id); if (id) return '/api/vendor-manufacturers/' + id + '/sw-assets'; }
                } catch (_) { }
                return '';
            },
            pageSizeKey: 'vendor:sw-assets:pageSize'
        },

        /* ── 카테고리 > 벤더 > 유지보수사 ── */
        'maint-sw-assets': {
            getApiUrl: function () {
                try {
                    var raw = sessionStorage.getItem('maintenance:context');
                    if (raw) { var id = toInt(JSON.parse(raw).id); if (id) return '/api/vendor-maintenance/' + id + '/sw-assets'; }
                } catch (_) { }
                return '';
            },
            pageSizeKey: 'maint:sw-assets:pageSize'
        }
    };

    /* ══════════════════════════════════════════════════════════
       메인 초기화
       ══════════════════════════════════════════════════════════ */
    function initTab94() {
        var table = document.getElementById('sw-spec-table');
        if (!table) return;
        var ctx = (table.getAttribute('data-context') || '').toLowerCase();
        var strategy = STRATEGIES[ctx];
        if (!strategy) return;

        /* 중복 초기화 방지 — SPA 재진입 시 데이터만 재로드 */
        if (table.getAttribute('data-tab94-init') === '1') {
            table.dispatchEvent(new CustomEvent('tab94:reload'));
            return;
        }
        table.setAttribute('data-tab94-init', '1');

        /* ── 설정 읽기 ─────────────────────────────── */
        var columns = [];
        try { columns = JSON.parse(table.getAttribute('data-columns') || '[]'); } catch (_) { columns = []; }
        var showAnalytics = table.getAttribute('data-show-analytics') === 'true';
        var analyticsGroup = table.getAttribute('data-analytics-group') || '';
        var csvFilename = table.getAttribute('data-csv-filename') || 'software_assets';

        /* ── DOM 참조 ──────────────────────────────── */
        var tbody = table.querySelector('tbody') || table.appendChild(document.createElement('tbody'));
        var emptyEl = document.getElementById('sw-empty');
        var selectAll = document.getElementById('sw-select-all');
        var csvBtn = document.getElementById('sw-download-btn');
        var pageSizeSel = document.getElementById('sw-page-size');
        var infoEl = document.getElementById('sw-pagination-info');
        var numsWrap = document.getElementById('sw-page-numbers');
        var btnFirst = document.getElementById('sw-first');
        var btnPrev = document.getElementById('sw-prev');
        var btnNext = document.getElementById('sw-next');
        var btnLast = document.getElementById('sw-last');
        var state = { page: 1, pageSize: 10 };

        /* ── 페이지 크기 저장/복원 ─────────────────── */
        (function () {
            try {
                var saved = localStorage.getItem(strategy.pageSizeKey);
                if (pageSizeSel && saved && ['10', '20', '50', '100'].indexOf(saved) > -1) {
                    state.pageSize = parseInt(saved, 10); pageSizeSel.value = saved;
                }
                if (pageSizeSel) pageSizeSel.addEventListener('change', function () {
                    var v = parseInt(pageSizeSel.value, 10);
                    if (!isNaN(v)) { state.page = 1; state.pageSize = v; localStorage.setItem(strategy.pageSizeKey, String(v)); renderPage(); }
                });
            } catch (_) { }
        })();

        /* ── 페이지네이션 ──────────────────────────── */
        function allRows() { return Array.prototype.slice.call(tbody.querySelectorAll('tr')); }
        function totalRows() { return allRows().length; }
        function totalPages() { return Math.max(1, Math.ceil(totalRows() / Math.max(1, state.pageSize))); }
        function clamp() { if (state.page > totalPages()) state.page = totalPages(); if (state.page < 1) state.page = 1; }

        function updatePagination() {
            if (infoEl) {
                var t = totalRows(), s = t ? (state.page - 1) * state.pageSize + 1 : 0, e = Math.min(t, state.page * state.pageSize);
                infoEl.textContent = s + '-' + e + ' / ' + t + '개 항목';
            }
            if (numsWrap) {
                var p = totalPages(); numsWrap.innerHTML = '';
                for (var i = 1; i <= p && i <= 50; i++) {
                    var b = document.createElement('button');
                    b.className = 'page-btn' + (i === state.page ? ' active' : '');
                    b.textContent = String(i); b.setAttribute('data-page', String(i));
                    numsWrap.appendChild(b);
                }
            }
            if (btnFirst) btnFirst.disabled = (state.page === 1);
            if (btnPrev) btnPrev.disabled = (state.page === 1);
            if (btnNext) btnNext.disabled = (state.page === totalPages());
            if (btnLast) btnLast.disabled = (state.page === totalPages());
        }

        function renderPage() {
            clamp();
            var list = allRows(), s = (state.page - 1) * state.pageSize, e = s + state.pageSize - 1;
            list.forEach(function (tr, idx) {
                var vis = idx >= s && idx <= e;
                tr.style.display = vis ? '' : 'none';
                if (vis) tr.removeAttribute('data-hidden'); else tr.setAttribute('data-hidden', '1');
            });
            updatePagination();
            if (selectAll) {
                var vc = table.querySelectorAll('tbody tr:not([data-hidden]) .sw-row-check');
                selectAll.checked = vc.length ? Array.prototype.every.call(vc, function (c) { return c.checked; }) : false;
            }
        }

        function go(p) { state.page = p; renderPage(); }
        if (numsWrap) numsWrap.addEventListener('click', function (e) { var b = e.target.closest('button.page-btn'); if (b) go(parseInt(b.getAttribute('data-page'), 10)); });
        if (btnFirst) btnFirst.addEventListener('click', function () { go(1); });
        if (btnPrev) btnPrev.addEventListener('click', function () { go(state.page - 1); });
        if (btnNext) btnNext.addEventListener('click', function () { go(state.page + 1); });
        if (btnLast) btnLast.addEventListener('click', function () { go(totalPages()); });

        function updateEmpty() {
            var has = !!tbody.querySelector('tr');
            if (emptyEl) { emptyEl.hidden = has; emptyEl.style.display = has ? 'none' : ''; }
            if (csvBtn) { csvBtn.disabled = !has; csvBtn.title = has ? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.'; }
            renderPage();
        }

        /* ── 체크박스 ──────────────────────────────── */
        if (selectAll) selectAll.addEventListener('change', function () {
            var checks = table.querySelectorAll('tbody tr:not([data-hidden]) .sw-row-check:not([disabled])');
            Array.prototype.forEach.call(checks, function (c) { c.checked = !!selectAll.checked; c.closest('tr').classList.toggle('selected', !!c.checked); });
        });
        table.addEventListener('click', function (ev) {
            var onCb = ev.target.closest('input[type="checkbox"].sw-row-check');
            if (onCb) {
                var tr0 = onCb.closest('tr'); if (tr0) tr0.classList.toggle('selected', !!onCb.checked);
                if (selectAll) { var vc = table.querySelectorAll('tbody tr:not([data-hidden]) .sw-row-check'); selectAll.checked = vc.length ? Array.prototype.every.call(vc, function (c) { return c.checked; }) : false; }
                return;
            }
            if (ev.target.closest('button, a, input, select, textarea, label')) return;
            var tr = ev.target.closest('tr');
            if (!tr || !tr.parentNode || tr.parentNode.tagName.toLowerCase() !== 'tbody') return;
            if (tr.hasAttribute('data-hidden') || tr.style.display === 'none') return;
            var cb = tr.querySelector('.sw-row-check'); if (!cb || cb.disabled) return;
            cb.checked = !cb.checked; tr.classList.toggle('selected', !!cb.checked);
            if (selectAll) { var vc2 = table.querySelectorAll('tbody tr:not([data-hidden]) .sw-row-check'); selectAll.checked = vc2.length ? Array.prototype.every.call(vc2, function (c) { return c.checked; }) : false; }
        });

        /* ── 정렬 ──────────────────────────────────── */
        var sortState = { col: null, dir: 'asc' };

        function sortRows() {
            var col = sortState.col; if (!col) return;
            var isNumeric = false;
            for (var ci = 0; ci < columns.length; ci++) { if (columns[ci].key === col && columns[ci].numeric) { isNumeric = true; break; } }
            var rows = allRows();
            rows.sort(function (a, b) {
                var aEl = a.querySelector('[data-col="' + col + '"]');
                var bEl = b.querySelector('[data-col="' + col + '"]');
                var aVal = aEl ? (aEl.textContent || '').trim() : '';
                var bVal = bEl ? (bEl.textContent || '').trim() : '';
                if (isNumeric) { var aN = parseFloat(aVal) || 0, bN = parseFloat(bVal) || 0; return sortState.dir === 'asc' ? aN - bN : bN - aN; }
                var cmp = aVal.localeCompare(bVal, 'ko');
                return sortState.dir === 'asc' ? cmp : -cmp;
            });
            rows.forEach(function (tr) { tbody.appendChild(tr); });
            go(1);
        }

        function updateSortIndicators() {
            var ths = table.querySelectorAll('thead th.sortable');
            Array.prototype.forEach.call(ths, function (th) {
                th.classList.remove('sort-asc', 'sort-desc');
                if (th.getAttribute('data-sort-col') === sortState.col) {
                    th.classList.add(sortState.dir === 'asc' ? 'sort-asc' : 'sort-desc');
                }
            });
        }

        var thead = table.querySelector('thead');
        if (thead) thead.addEventListener('click', function (ev) {
            var th = ev.target.closest('th[data-sort-col]'); if (!th) return;
            var col = th.getAttribute('data-sort-col');
            if (sortState.col === col) { sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc'; }
            else { sortState.col = col; sortState.dir = 'asc'; }
            updateSortIndicators(); sortRows();
        });

        /* ── 행 렌더링 (컬럼 설정 기반 — 공통) ────── */
        function renderRows(items) {
            tbody.innerHTML = '';
            (items || []).forEach(function (it) {
                var tr = document.createElement('tr');
                var html = '<td><input type="checkbox" class="sw-row-check" aria-label="행 선택"></td>';
                columns.forEach(function (col) {
                    var val = it[col.key];
                    var display = col.numeric ? (val != null ? String(val) : '-') : dash(val);
                    var dotHtml = '';
                    if (col.statusDot) dotHtml = statusDotHTML(it.work_status_color);
                    if (col.contractDot) dotHtml = statusDotHTML(it.contract_status_color);
                    html += '<td data-col="' + col.key + '">' + dotHtml + display + '</td>';
                });
                tr.innerHTML = html;
                tbody.appendChild(tr);
            });
            if (sortState.col) { sortRows(); } else { go(1); }
            updateEmpty();
        }

        /* ── 데이터 로드 (전략 기반) ───────────────── */
        var lastLoadedItems = [];

        function loadData() {
            var url = strategy.getApiUrl(table);
            if (!url) { lastLoadedItems = []; updateEmpty(); return; }
            fetch(url, { credentials: 'same-origin' })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    if (data && data.success) { lastLoadedItems = data.items || []; renderRows(lastLoadedItems); }
                    else { lastLoadedItems = []; updateEmpty(); }
                })
                .catch(function () { lastLoadedItems = []; updateEmpty(); });
        }
        loadData();

        /* SPA 재진입용 커스텀 이벤트 */
        table.addEventListener('tab94:reload', function () {
            sortState.col = null; sortState.dir = 'asc';
            updateSortIndicators();
            loadData();
        });

        /* ── CSV 다운로드 ──────────────────────────── */
        if (csvBtn) csvBtn.addEventListener('click', function () { openModal('sw-download-modal'); });
        var csvClose = document.getElementById('sw-download-close');
        var csvModal = document.getElementById('sw-download-modal');
        if (csvClose) csvClose.addEventListener('click', function () { closeModal('sw-download-modal'); });
        if (csvModal) csvModal.addEventListener('click', function (e) { if (e.target === csvModal) closeModal('sw-download-modal'); });

        var csvConfirm = document.getElementById('sw-download-confirm');
        if (csvConfirm) csvConfirm.addEventListener('click', function () {
            var rangeAll = document.getElementById('sw-csv-range-all');
            var all = !rangeAll || rangeAll.checked;
            var list = allRows();
            if (!all) list = list.filter(function (tr) { var cb = tr.querySelector('.sw-row-check'); return cb && cb.checked; });
            if (!list.length) { toast('내보낼 행이 없습니다.', 'warning'); return; }
            /* 컬럼 설정에서 헤더 생성 */
            var header = columns.map(function (c) { return escapeCSV(c.label); }).join(',');
            var lines = [header];
            list.forEach(function (tr) {
                var cells = columns.map(function (c) {
                    var td = tr.querySelector('[data-col="' + c.key + '"]');
                    return escapeCSV(td ? (td.textContent || '').trim() : '');
                });
                lines.push(cells.join(','));
            });
            /* 파일명: 유지보수사는 날짜 접미사 추가 */
            var fname = csvFilename;
            if (ctx === 'maint-sw-assets') {
                var d = new Date();
                fname = csvFilename + '_' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());
            }
            downloadCSV(fname + '.csv', lines);
            closeModal('sw-download-modal');
            toast('CSV 다운로드가 완료되었습니다.', 'success');
        });

        /* ══════════════════════════════════════════════════════
           통계 분석 모달 (show_analytics 일 때만 초기화)
           ────────────────────────────────────────────────────
           analyticsGroup 으로 지정된 키를 기준으로 구분 탭 + 유형별
           스택바 차트를 생성한다.
           ══════════════════════════════════════════════════════ */
        if (showAnalytics) {
            var analyticsBtn = document.getElementById('sw-analytics-btn');
            var analyticsModal = document.getElementById('sw-analytics-modal');
            var analyticsClose = document.getElementById('sw-analytics-close');
            var analyticsEmpty = document.getElementById('sw-analytics-empty');
            var tabStrip = document.getElementById('sw-tab-strip');
            var tabContent = document.getElementById('sw-tab-content');

            /* 구분별 데이터 맵 — analyticsGroup 기반 그루핑 */
            function buildCatMap(items) {
                var map = {};
                (items || []).forEach(function (it) {
                    var cat = (it.category || '').trim() || '-';
                    var type = (it.type || '').trim() || '-';
                    var grp = (it[analyticsGroup] || '').trim() || '-';
                    if (!map[cat]) map[cat] = { count: 0, types: {} };
                    map[cat].count++;
                    if (!map[cat].types[type]) map[cat].types[type] = { count: 0, groups: {} };
                    map[cat].types[type].count++;
                    map[cat].types[type].groups[grp] = (map[cat].types[type].groups[grp] || 0) + 1;
                });
                return map;
            }

            /* 고정 정렬 순서 — 소프트웨어 카테고리 */
            var TAB_ORDER = ['운영체제', '데이터베이스', '미들웨어', '가상화', '보안S/W', '고가용성'];
            var TYPE_ORDER = {
                '운영체제': ['유닉스', '리눅스', '윈도우', '임베디드'],
                '데이터베이스': ['RDBMS', 'NoSQL'],
                '미들웨어': ['WEB', 'WAS', 'API', 'APM', 'FRAMEWORK'],
                '가상화': ['하이퍼바이저', '컨테이너', '쿠버네티스'],
                '보안S/W': ['백신', '취약점', '서버 접근통제', '서버 통합계정', '서버 모니터링', '서버 보안통제', 'DB 접근통제', '기타'],
                '고가용성': ['Active-Active', 'Active-Passive']
            };

            function renderTabStrip(catMap) {
                if (!tabStrip) return [];
                var all = Object.keys(catMap);
                var cats = [];
                TAB_ORDER.forEach(function (t) { if (all.indexOf(t) >= 0) cats.push(t); });
                all.forEach(function (t) { if (cats.indexOf(t) < 0) cats.push(t); });
                var html = '';
                cats.forEach(function (c, i) {
                    html += '<button class="va-tab' + (i === 0 ? ' active' : '') + '" data-cat="' + c + '">' + c + ' <span class="va-tab-count">' + catMap[c].count + '</span></button>';
                });
                tabStrip.innerHTML = html;
                return cats;
            }

            /* 스택바 색상 팔레트 */
            var SB_COLORS = ['#6366F1', '#3b82f6', '#0ea5e9', '#14b8a6', '#22c55e', '#eab308', '#f97316', '#ef4444', '#a855f7', '#94a3b8'];

            /* 플로팅 툴팁 (한 번만 생성) */
            var sbTip = document.createElement('div');
            sbTip.className = 'va-sb-tooltip';
            sbTip.style.display = 'none';
            document.body.appendChild(sbTip);

            function renderCatContent(catData, catName) {
                if (!tabContent) return;
                var allTypes = Object.keys(catData.types);
                var order = TYPE_ORDER[catName] || [];
                var types = [];
                order.forEach(function (t) { if (allTypes.indexOf(t) >= 0) types.push(t); });
                allTypes.forEach(function (t) { if (types.indexOf(t) < 0) types.push(t); });
                var html = '';
                types.forEach(function (type) {
                    var td = catData.types[type];
                    html += '<div class="va-type-section">';
                    html += '<div class="va-type-header"><span class="va-type-name">' + type + '</span><span class="va-type-count">' + td.count + '건</span></div>';
                    var groups = Object.keys(td.groups).sort(function (a, b) { return td.groups[b] - td.groups[a]; });
                    var segs = [];
                    var etcCount = 0;
                    groups.forEach(function (g, i) {
                        if (i < 9) { segs.push({ name: g, count: td.groups[g] }); }
                        else { etcCount += td.groups[g]; }
                    });
                    if (etcCount > 0) segs.push({ name: '기타 (' + (groups.length - 9) + '종)', count: etcCount });
                    /* 스택바 */
                    html += '<div class="va-sb-bar">';
                    segs.forEach(function (seg, si) {
                        var pct = td.count > 0 ? (seg.count / td.count * 100) : 0;
                        var pctStr = pct.toFixed(1);
                        var col = SB_COLORS[si % SB_COLORS.length];
                        html += '<span class="va-sb-seg" style="width:' + pctStr + '%;background:' + col + '"'
                            + ' data-name="' + seg.name.replace(/"/g, '&quot;') + '"'
                            + ' data-count="' + seg.count + '"'
                            + ' data-pct="' + pctStr + '"'
                            + ' data-color="' + col + '"'
                            + '></span>';
                    });
                    html += '</div>';
                    /* 범례 칩 */
                    html += '<div class="va-sb-legend">';
                    segs.forEach(function (seg, si) {
                        var col = SB_COLORS[si % SB_COLORS.length];
                        html += '<span class="va-sb-chip"><span class="va-sb-dot" style="background:' + col + '"></span>' + seg.name + ' <b>' + seg.count + '</b></span>';
                    });
                    html += '</div>';
                    html += '</div>';
                });
                tabContent.innerHTML = html;
            }

            /* 툴팁 이벤트 위임 — tabContent 에 한 번만 등록 */
            if (tabContent) {
                tabContent.addEventListener('mouseover', function (e) {
                    var seg = e.target.closest('.va-sb-seg');
                    if (!seg) return;
                    sbTip.innerHTML = '<span class="va-sb-tip-dot" style="background:' + seg.getAttribute('data-color') + '"></span>'
                        + '<span class="va-sb-tip-name">' + seg.getAttribute('data-name') + '</span>'
                        + '<span class="va-sb-tip-val">' + seg.getAttribute('data-count') + '건 (' + seg.getAttribute('data-pct') + '%)</span>';
                    sbTip.style.display = '';
                });
                tabContent.addEventListener('mousemove', function (e) {
                    if (sbTip.style.display === 'none') return;
                    sbTip.style.left = (e.clientX + 12) + 'px';
                    sbTip.style.top = (e.clientY - 36) + 'px';
                });
                tabContent.addEventListener('mouseout', function (e) {
                    var seg = e.target.closest('.va-sb-seg');
                    if (seg) sbTip.style.display = 'none';
                });
            }

            function renderAnalytics() {
                var items = lastLoadedItems;
                if (!items.length) {
                    if (analyticsEmpty) analyticsEmpty.style.display = '';
                    if (tabStrip) tabStrip.innerHTML = '';
                    if (tabContent) tabContent.innerHTML = '';
                    return;
                }
                if (analyticsEmpty) analyticsEmpty.style.display = 'none';
                var catMap = buildCatMap(items);
                var cats = renderTabStrip(catMap);
                if (cats.length > 0) renderCatContent(catMap[cats[0]], cats[0]);
                if (tabStrip) tabStrip.onclick = function (e) {
                    var btn = e.target.closest('.va-tab');
                    if (!btn) return;
                    var tabBtns = tabStrip.querySelectorAll('.va-tab');
                    Array.prototype.forEach.call(tabBtns, function (t) { t.classList.remove('active'); });
                    btn.classList.add('active');
                    var cat = btn.getAttribute('data-cat');
                    if (catMap[cat]) renderCatContent(catMap[cat], cat);
                };
            }

            if (analyticsBtn) analyticsBtn.addEventListener('click', function () {
                renderAnalytics();
                openModal('sw-analytics-modal');
            });
            if (analyticsClose) analyticsClose.addEventListener('click', function () { closeModal('sw-analytics-modal'); });
            if (analyticsModal) analyticsModal.addEventListener('click', function (e) { if (e.target === analyticsModal) closeModal('sw-analytics-modal'); });
        }
    }

    ready(initTab94);

    /* SPA 재진입 — initTab94 바깥에 등록하여 항상 활성 */
    document.addEventListener('blossom:pageLoaded', function () {
        initTab94();
    });
})();

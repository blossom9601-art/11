/*
 * tab91-system-shared.js  v1.0
 * ────────────────────────────────────────────────────────
 * 시스템/자산 탭 공통 컨트롤러.
 *
 * 모든 도메인(업무그룹, 제조사, 소프트웨어, 컴포넌트 등)의
 * 시스템/하드웨어/소프트웨어/컴포넌트 탭을 단일 JS로 구동한다.
 *
 * ★ 설정 전달 방식
 *   <main class="tab91-system-root"
 *         data-preset="workgroup-system"
 *         data-api-base="/api/work-groups"
 *         data-api-suffix="/systems"
 *         data-entity-id="42"
 *         data-file-prefix="workgroup_system_"
 *         data-storage-key="wg:system:pageSize"
 *         data-section-title="시스템"
 *         ...>
 *
 * ★ 지원 프리셋
 *   - workgroup-system   : 업무 그룹 → 시스템 목록 (13컬럼, 도넛 차트)
 *   - vendor-hardware    : 제조사/유지보수 → 하드웨어 (7컬럼, 막대 차트)
 *   - vendor-software    : 제조사/유지보수/소프트웨어 → 소프트웨어 (7컬럼, 막대 차트)
 *   - vendor-component   : 제조사/유지보수/컴포넌트 → 컴포넌트 (6컬럼, 도넛 차트)
 *   - hw-server-system   : 하드웨어 카테고리 → 시스템 (기본 7컬럼)
 *
 * ★ 이 파일을 페이지별로 복사하지 마세요.
 *   컬럼/API를 추가하려면 PRESETS 에 프리셋을 등록하세요.
 */
(function () {
'use strict';

/* ======================================================================
   Utilities
   ====================================================================== */
function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
}
function dash(v) { var s = String(v == null ? '' : v).trim(); return s || '-'; }
function escapeHtml(v) {
    return String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeCSV(val) { return '"' + String(val == null ? '' : val).replace(/"/g, '""') + '"'; }
function toInt(v) { var n = parseInt(v, 10); return isNaN(n) || !isFinite(n) ? 0 : n; }
function toast(msg, level) {
    try { if (window.showToast) window.showToast(String(msg || ''), level || 'error'); } catch (_) {}
}

/* ======================================================================
   API helper
   ====================================================================== */
/* @param {string} url  @param {object?} opts  @returns {Promise<object>} */
async function api(url, opts) {
    var o = Object.assign({ method: 'GET', credentials: 'same-origin' }, opts || {});
    o.headers = Object.assign({ 'Accept': 'application/json' }, o.headers || {});
    if (o.body && !(o.headers && o.headers['Content-Type']))
        o.headers['Content-Type'] = 'application/json';
    var res = await fetch(url, o);
    var text = await res.text();
    if (res.redirected && /\/login\b/i.test(String(res.url)))
        throw new Error('로그인이 필요합니다.');
    var ct = String(res.headers.get('content-type') || '');
    if (/text\/html/i.test(ct) || /^\s*<!doctype/i.test(text))
        throw new Error('API 응답이 JSON이 아닙니다 (' + res.status + ')');
    var json;
    try { json = text ? JSON.parse(text) : {}; } catch (_) { json = { success: false, message: text }; }
    if (!res.ok) throw new Error((json && (json.message || json.error)) || ('HTTP ' + res.status));
    return json;
}
function norm(res) {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    if (Array.isArray(res.items)) return res.items;
    if (Array.isArray(res.rows)) return res.rows;
    return [];
}

/* ======================================================================
   Entity ID resolvers (source: sessionStorage / query / data attr)
   ====================================================================== */
function getQueryParamInt(keys) {
    try {
        var qs = new URLSearchParams(location.search || '');
        for (var i = 0; i < keys.length; i++) {
            var n = toInt(qs.get(keys[i]));
            if (n > 0) return n;
        }
    } catch (_) {}
    return 0;
}
function getFromSession(key) {
    try {
        var raw = sessionStorage.getItem(key);
        if (!raw) return 0;
        var o = JSON.parse(raw);
        return toInt(o && o.id);
    } catch (_) { return 0; }
}

/* ======================================================================
   Column Presets
   각 프리셋은 { columns, unitMap, statusCol, composites, chartType, tabOrder } 구조.
     columns  : [{key, label, sortable?, numeric?}]
     unitMap  : { colKey: '단위' }
     statusCol: 상태 점을 표시할 컬럼 key (없으면 null)
     statusColorCol: 각 행에서 색상값을 읽을 필드 (없으면 statusDotCls 사용)
     composites: { colKey: [part1, part2, ...] }  결합 컬럼
     chartType: 'donut' | 'stacked-bar'
     tabOrder : 도넛/막대 구분 탭 순서
     catKey   : 차트 구분 기준 필드명 (기본: asset_category_name)
     typeKey  : 차트 유형 기준 필드명 (기본: asset_type_name)
   ====================================================================== */
var PRESETS = {
    /* ── 업무 그룹 > 시스템 ── */
    'workgroup-system': {
        columns: [
            { key: 'asset_category_name',  label: '구분',        sortable: true },
            { key: 'asset_type_name',      label: '유형',        sortable: true },
            { key: 'work_status_name',     label: '업무 상태',   sortable: true },
            { key: 'work_operation_name',  label: '업무 운영',   sortable: true },
            { key: 'work_name',            label: '업무 이름',   sortable: true },
            { key: 'system_name',          label: '시스템 이름', sortable: true },
            { key: 'system_ip',            label: '시스템 IP',   sortable: true },
            { key: 'virtualization_type',  label: '시스템 가상화', sortable: true },
            { key: 'hardware',             label: '하드웨어',    sortable: true },
            { key: 'cpu_size',             label: 'CPU 용량',    sortable: true },
            { key: 'memory_size',          label: '메모리 용량', sortable: true },
            { key: 'os_type',              label: '운영체제',    sortable: true }
        ],
        unitMap: { cpu_size: 'Core', memory_size: 'GB' },
        statusCol: 'work_status_name',
        composites: { hardware: ['manufacturer_name', 'server_model_name'] },
        chartType: 'donut',
        tabOrder: ['서버', '스토리지', 'SAN', '네트워크', '보안장비'],
        catKey: 'asset_category_name',
        typeKey: 'asset_type_name',
        /* ID 해석: 업무 그룹은 body data-attr / query / sessionStorage */
        resolveId: function (root) {
            return toInt(root.dataset.entityId)
                || getQueryParamInt(['id', 'group_id', 'groupId'])
                || getFromSession('work_group_selected_row')
                || 0;
        },
        apiBase: '/api/work-groups',
        apiSuffix: '/systems',
        storageKey: 'wg:system:pageSize',
        filePrefix: 'workgroup_system_'
    },

    /* ── 제조사/유지보수 > 하드웨어 ── */
    'vendor-hardware': {
        columns: [
            { key: 'category',     label: '구분',     sortable: true },
            { key: 'type',         label: '유형',     sortable: true },
            { key: 'model',        label: '모델명',   sortable: true },
            { key: 'work_name',    label: '업무명',   sortable: true },
            { key: 'system_name',  label: '시스템명', sortable: true },
            { key: 'qty',          label: '할당수량', sortable: true, numeric: true }
        ],
        unitMap: {},
        statusCol: 'work_name',
        statusColorCol: 'work_status_color',
        composites: {},
        chartType: 'stacked-bar',
        tabOrder: ['서버', '스토리지', 'SAN', '네트워크', '보안장비'],
        catKey: 'category',
        typeKey: 'type',
        resolveId: function () {
            return getFromSession('manufacturer:context') || getFromSession('maintenance:context') || 0;
        },
        apiBase: '/api/vendor-manufacturers',
        apiSuffix: '/hw-assets',
        storageKey: 'vendor:hw-assets:pageSize',
        filePrefix: 'vendor_hardware_'
    },

    /* ── 제조사/유지보수 > 소프트웨어 ── */
    'vendor-software': {
        columns: [
            { key: 'category',     label: '구분',     sortable: true },
            { key: 'type',         label: '유형',     sortable: true },
            { key: 'model',        label: '모델명',   sortable: true },
            { key: 'work_name',    label: '업무명',   sortable: true },
            { key: 'system_name',  label: '시스템명', sortable: true },
            { key: 'qty',          label: '할당수량', sortable: true, numeric: true }
        ],
        unitMap: {},
        statusCol: 'work_name',
        statusColorCol: 'work_status_color',
        composites: {},
        chartType: 'stacked-bar',
        tabOrder: ['운영체제', '데이터베이스', '미들웨어', '가상화', '보안S/W', '고가용성'],
        catKey: 'category',
        typeKey: 'type',
        resolveId: function () {
            return getFromSession('manufacturer:context') || getFromSession('maintenance:context') || 0;
        },
        apiBase: '/api/vendor-manufacturers',
        apiSuffix: '/sw-assets',
        storageKey: 'vendor:sw-assets:pageSize',
        filePrefix: 'vendor_software_'
    },

    /* ── 제조사/유지보수/컴포넌트 > 컴포넌트 ── */
    'vendor-component': {
        columns: [
            { key: 'category',     label: '구분',     sortable: true },
            { key: 'model',        label: '모델명',   sortable: true },
            { key: 'work_name',    label: '업무명',   sortable: true },
            { key: 'system_name',  label: '시스템명', sortable: true },
            { key: 'qty',          label: '할당수량', sortable: true, numeric: true }
        ],
        unitMap: {},
        statusCol: 'work_name',
        statusColorCol: 'work_status_color',
        composites: {},
        chartType: 'donut',
        tabOrder: ['CPU', 'GPU', 'MEMORY', 'DISK', 'NIC', 'HBA', 'ETC'],
        catKey: 'category',
        typeKey: 'model',
        resolveId: function () {
            return getFromSession('manufacturer:context') || getFromSession('maintenance:context') || 0;
        },
        apiBase: '/api/vendor-manufacturers',
        apiSuffix: '/comp-assets',
        storageKey: 'vendor:comp-assets:pageSize',
        filePrefix: 'vendor_component_'
    },

    /* ── 하드웨어 카테고리(서버 등) > 시스템 ── */
    'hw-category-system': {
        columns: [
            { key: 'category',     label: '구분',     sortable: true },
            { key: 'type',         label: '유형',     sortable: true },
            { key: 'model',        label: '모델명',   sortable: true },
            { key: 'work_name',    label: '업무명',   sortable: true },
            { key: 'system_name',  label: '시스템명', sortable: true },
            { key: 'qty',          label: '할당수량', sortable: true, numeric: true }
        ],
        unitMap: {},
        statusCol: 'work_name',
        statusColorCol: 'work_status_color',
        composites: {},
        chartType: 'stacked-bar',
        tabOrder: ['서버', '스토리지', 'SAN', '네트워크', '보안장비'],
        catKey: 'category',
        typeKey: 'type',
        resolveId: function () { return 0; },
        apiBase: '',
        apiSuffix: '',
        storageKey: 'hw-cat:system:pageSize',
        filePrefix: 'hw_category_system_'
    }
};

/* ======================================================================
   Modal helpers
   ====================================================================== */
function openModal(id) {
    var el = document.getElementById(id);
    if (!el) return;
    document.body.classList.add('modal-open');
    el.classList.add('show');
    el.setAttribute('aria-hidden', 'false');
}
function closeModal(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('show');
    el.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.modal-overlay-full.show'))
        document.body.classList.remove('modal-open');
}

/* ======================================================================
   Chart colors (공통)
   ====================================================================== */
var CHART_COLORS = [
    '#6366F1', '#3b82f6', '#0ea5e9', '#14b8a6', '#22c55e',
    '#eab308', '#f97316', '#ef4444', '#a855f7', '#94a3b8'
];

/* 상태 점 클래스 (workgroup-system 프리셋 전용 폴백) */
function statusDotCls(item) {
    var lvl = String(item && item.work_status_level || '').trim();
    if (lvl) return lvl;
    var nm = String(item && item.work_status_name || '').trim();
    if (nm === '가동' || nm === '운영' || nm === '정상') return 'ws-run';
    if (nm === '유휴') return 'ws-idle';
    return 'ws-wait';
}

/* ======================================================================
   Main initializer
   ====================================================================== */
ready(function () {
    var root = document.querySelector('.tab91-system-root');
    if (!root) return;

    /* ── 설정 읽기 ── */
    var presetKey = root.dataset.preset || 'workgroup-system';
    var preset = PRESETS[presetKey];
    if (!preset) { console.warn('[tab91] unknown preset:', presetKey); return; }

    /* data-* 오버라이드 (pages.py에서 주입한 값 우선) */
    var cfg = {
        columns:    preset.columns,
        unitMap:    preset.unitMap || {},
        statusCol:  preset.statusCol,
        statusColorCol: preset.statusColorCol || null,
        composites: preset.composites || {},
        chartType:  preset.chartType || 'donut',
        tabOrder:   preset.tabOrder || [],
        catKey:     preset.catKey || 'category',
        typeKey:    preset.typeKey || 'type',
        apiBase:    root.dataset.apiBase  || preset.apiBase  || '',
        apiSuffix:  root.dataset.apiSuffix || preset.apiSuffix || '',
        entityId:   toInt(root.dataset.entityId) || (preset.resolveId ? preset.resolveId(root) : 0),
        filePrefix: root.dataset.filePrefix || preset.filePrefix || 'export_',
        storageKey: root.dataset.storageKey || preset.storageKey || 't91:pageSize',
        sectionTitle: root.dataset.sectionTitle || '시스템'
    };

    /* ── DOM 참조 ── */
    var table     = document.getElementById('t91-table');
    var colgroup  = document.getElementById('t91-colgroup');
    var thead     = document.getElementById('t91-thead');
    var tbody     = document.getElementById('t91-tbody');
    var emptyEl   = document.getElementById('t91-empty');
    var pageSizeSel = document.getElementById('t91-page-size');
    var csvBtn    = document.getElementById('t91-download-btn');
    var analyticsBtn = document.getElementById('t91-analytics-btn');

    if (!table || !tbody) return;

    /* ── 테이블 헤더/colgroup 동적 생성 ── */
    (function buildTableHead() {
        /* colgroup */
        var cgHtml = '<col style="width:36px">';
        cfg.columns.forEach(function () { cgHtml += '<col class="equal-col">'; });
        colgroup.innerHTML = cgHtml;

        /* thead */
        var thHtml = '<tr><th class="col-chk"><input type="checkbox" id="t91-select-all" aria-label="전체 선택"></th>';
        cfg.columns.forEach(function (col) {
            thHtml += '<th' +
                (col.sortable ? ' class="sortable" data-sort-col="' + col.key + '"' : '') +
                '>' + escapeHtml(col.label) + '</th>';
        });
        thHtml += '</tr>';
        thead.innerHTML = thHtml;
    })();

    var selectAll = document.getElementById('t91-select-all');

    /* ── 페이지 상태 ── */
    var state = { page: 1, pageSize: 10 };
    (function restorePageSize() {
        try {
            var saved = localStorage.getItem(cfg.storageKey);
            if (pageSizeSel && saved && ['10', '20', '50', '100'].indexOf(saved) > -1) {
                state.pageSize = parseInt(saved, 10);
                pageSizeSel.value = saved;
            }
            if (pageSizeSel) {
                pageSizeSel.addEventListener('change', function () {
                    var v = parseInt(pageSizeSel.value, 10);
                    if (!isNaN(v)) {
                        state.page = 1;
                        state.pageSize = v;
                        try { localStorage.setItem(cfg.storageKey, String(v)); } catch (_) {}
                        renderPage();
                    }
                });
            }
        } catch (_) {}
    })();

    /* ── 행 유틸 ── */
    function allRows() { return Array.from(tbody.querySelectorAll('tr')); }
    function totalRows() { return allRows().length; }
    function totalPages() { return Math.max(1, Math.ceil(totalRows() / Math.max(1, state.pageSize))); }
    function clamp() { if (state.page > totalPages()) state.page = totalPages(); if (state.page < 1) state.page = 1; }

    /* ── 페이지네이션 렌더 ── */
    var pgnInfo    = document.getElementById('t91-pagination-info');
    var pgnFirst   = document.getElementById('t91-first');
    var pgnPrev    = document.getElementById('t91-prev');
    var pgnNext    = document.getElementById('t91-next');
    var pgnLast    = document.getElementById('t91-last');
    var pgnNumbers = document.getElementById('t91-page-numbers');

    function renderPagination() {
        var t = totalRows(), tp = totalPages();
        if (pgnInfo) {
            if (t === 0) pgnInfo.textContent = '0개 항목';
            else {
                var s = (state.page - 1) * state.pageSize + 1;
                var e = Math.min(state.page * state.pageSize, t);
                pgnInfo.textContent = s + '-' + e + ' / ' + t + '개';
            }
        }
        var dp = state.page <= 1, dn = state.page >= tp;
        if (pgnFirst) { pgnFirst.disabled = dp; }
        if (pgnPrev)  { pgnPrev.disabled  = dp; }
        if (pgnNext)  { pgnNext.disabled  = dn; }
        if (pgnLast)  { pgnLast.disabled  = dn; }
        if (pgnNumbers) {
            var ws = 7, start = Math.max(1, state.page - Math.floor(ws / 2));
            var end = Math.min(tp, start + ws - 1);
            start = Math.max(1, end - ws + 1);
            var html = '';
            for (var p = start; p <= end; p++) {
                html += '<button class="page-btn' + (p === state.page ? ' active' : '') +
                    '" data-page="' + p + '" type="button">' + p + '</button>';
            }
            pgnNumbers.innerHTML = html;
        }
    }

    function renderPage() {
        clamp();
        var list = allRows(), s = (state.page - 1) * state.pageSize, e = s + state.pageSize - 1;
        list.forEach(function (tr, idx) {
            var vis = idx >= s && idx <= e;
            tr.style.display = vis ? '' : 'none';
            if (vis) tr.removeAttribute('data-hidden');
            else tr.setAttribute('data-hidden', '1');
            var cb = tr.querySelector('.t91-row-check');
            if (cb) tr.classList.toggle('selected', !!cb.checked && vis);
        });
        if (selectAll) {
            var vc = table.querySelectorAll('tbody tr:not([data-hidden]) .t91-row-check');
            selectAll.checked = vc.length ? Array.prototype.every.call(vc, function (c) { return c.checked; }) : false;
        }
        renderPagination();
    }

    function go(p) { state.page = p; renderPage(); }
    if (pgnNumbers) pgnNumbers.addEventListener('click', function (e) {
        var btn = e.target.closest('button.page-btn');
        if (btn) go(parseInt(btn.dataset.page, 10));
    });
    if (pgnFirst) pgnFirst.addEventListener('click', function () { go(1); });
    if (pgnPrev)  pgnPrev.addEventListener('click', function () { go(state.page - 1); });
    if (pgnNext)  pgnNext.addEventListener('click', function () { go(state.page + 1); });
    if (pgnLast)  pgnLast.addEventListener('click', function () { go(totalPages()); });

    function updateEmpty() {
        var has = !!tbody.querySelector('tr');
        if (emptyEl) { emptyEl.hidden = has; emptyEl.style.display = has ? 'none' : ''; }
        if (csvBtn) { csvBtn.disabled = !has; csvBtn.title = has ? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.'; }
        renderPage();
    }

    /* ── 전체 선택 ── */
    if (selectAll) {
        selectAll.addEventListener('change', function () {
            table.querySelectorAll('tbody tr:not([data-hidden]) .t91-row-check:not([disabled])')
                .forEach(function (c) {
                    c.checked = !!selectAll.checked;
                    var tr = c.closest('tr');
                    if (tr) tr.classList.toggle('selected', !!c.checked);
                });
        });
    }
    table.addEventListener('click', function (ev) {
        var onCb = ev.target.closest('input[type="checkbox"].t91-row-check');
        if (onCb) {
            var tr0 = onCb.closest('tr');
            if (tr0) tr0.classList.toggle('selected', !!onCb.checked);
            syncSelectAll();
            return;
        }
        if (ev.target.closest('button, a, input, select, textarea, label')) return;
        var tr = ev.target.closest('tr');
        if (!tr || !tr.parentNode || tr.parentNode.tagName.toLowerCase() !== 'tbody') return;
        if (tr.hasAttribute('data-hidden') || tr.style.display === 'none') return;
        var cb = tr.querySelector('.t91-row-check');
        if (!cb || cb.disabled) return;
        cb.checked = !cb.checked;
        tr.classList.toggle('selected', cb.checked);
        syncSelectAll();
    });

    function syncSelectAll() {
        if (!selectAll) return;
        var vc = table.querySelectorAll('tbody tr:not([data-hidden]) .t91-row-check');
        selectAll.checked = vc.length ? Array.prototype.every.call(vc, function (c) { return c.checked; }) : false;
    }

    /* ── 정렬 ── */
    var sortState = { col: null, dir: 'asc' };

    function sortRows() {
        var col = sortState.col;
        if (!col) return;
        var colDef = cfg.columns.filter(function (c) { return c.key === col; })[0];
        var isNumeric = colDef && colDef.numeric;
        var rows = allRows();
        rows.sort(function (a, b) {
            var aEl = a.querySelector('[data-col="' + col + '"]');
            var bEl = b.querySelector('[data-col="' + col + '"]');
            var aVal = aEl ? (aEl.textContent || '').trim() : '';
            var bVal = bEl ? (bEl.textContent || '').trim() : '';
            if (isNumeric) {
                var aN = parseFloat(aVal) || 0, bN = parseFloat(bVal) || 0;
                return sortState.dir === 'asc' ? aN - bN : bN - aN;
            }
            var cmp = aVal.localeCompare(bVal, 'ko');
            return sortState.dir === 'asc' ? cmp : -cmp;
        });
        rows.forEach(function (tr) { tbody.appendChild(tr); });
        go(1);
    }

    function updateSortIndicators() {
        table.querySelectorAll('thead th.sortable').forEach(function (th) {
            th.classList.remove('sort-asc', 'sort-desc');
            if (th.getAttribute('data-sort-col') === sortState.col) {
                th.classList.add(sortState.dir === 'asc' ? 'sort-asc' : 'sort-desc');
            }
        });
    }

    thead.addEventListener('click', function (e) {
        var th = e.target.closest('th.sortable');
        if (!th) return;
        var col = th.getAttribute('data-sort-col');
        if (sortState.col === col) {
            sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
        } else {
            sortState.col = col;
            sortState.dir = 'asc';
        }
        updateSortIndicators();
        sortRows();
    });

    /* ── 셀 값 계산 ── */
    function cellVal(item, col) {
        /* 결합 컬럼 */
        if (cfg.composites[col.key]) {
            var parts = cfg.composites[col.key]
                .map(function (k) { var v = dash(item && item[k]); return v === '-' ? '' : v; })
                .filter(Boolean);
            return parts.join(' ') || '-';
        }
        var s = dash(item && item[col.key]);
        var unit = cfg.unitMap[col.key];
        if (unit && s !== '-') s = s + ' ' + unit;
        return s;
    }

    /* ── 행 렌더링 ── */
    function renderRow(item) {
        var tr = document.createElement('tr');
        tr.setAttribute('data-id', String(item.id || ''));
        var html = '<td><input type="checkbox" class="t91-row-check" aria-label="행 선택"></td>';
        cfg.columns.forEach(function (col) {
            var val = cellVal(item, col);
            if (col.key === cfg.statusCol) {
                /* 상태 점 표시 */
                var dotStyle = '';
                if (cfg.statusColorCol && item[cfg.statusColorCol]) {
                    dotStyle = 'background:' + escapeHtml(item[cfg.statusColorCol]);
                } else {
                    var cls = statusDotCls(item);
                    dotStyle = '';
                    html += '<td data-col="' + col.key + '"><span class="t91-status-pill">' +
                        '<span class="t91-status-dot status-dot ' + cls + '" aria-hidden="true"></span>' +
                        '<span>' + escapeHtml(val) + '</span></span></td>';
                    return;
                }
                html += '<td data-col="' + col.key + '"><span class="t91-status-pill">' +
                    '<span class="t91-status-dot" style="' + dotStyle + '" aria-hidden="true"></span>' +
                    '<span>' + escapeHtml(val) + '</span></span></td>';
            } else {
                html += '<td data-col="' + col.key + '">' + escapeHtml(val) + '</td>';
            }
        });
        tr.innerHTML = html;
        return tr;
    }

    /* ── 데이터 로드 ── */
    var lastLoadedItems = [];

    function listUrl() {
        return cfg.apiBase + '/' + encodeURIComponent(String(cfg.entityId)) + cfg.apiSuffix;
    }

    async function loadRows() {
        if (!cfg.entityId) { tbody.innerHTML = ''; lastLoadedItems = []; updateEmpty(); return; }
        try {
            var res = await api(listUrl());
            var items = norm(res);
            lastLoadedItems = items;
            tbody.innerHTML = '';
            items.forEach(function (it) { tbody.appendChild(renderRow(it)); });
            updateEmpty();
        } catch (e) {
            console.error('[tab91] loadRows failed', e);
            toast(cfg.sectionTitle + ' 목록을 불러오지 못했습니다.', 'error');
            lastLoadedItems = [];
            tbody.innerHTML = '';
            updateEmpty();
        }
    }

    /* ── CSV 내보내기 ── */
    function visibleRows() { return allRows().filter(function (tr) { return !tr.hasAttribute('data-hidden') && tr.style.display !== 'none'; }); }

    function exportCSV(onlySel) {
        var headers = cfg.columns.map(function (c) { return c.label; });
        var trs = visibleRows();
        if (onlySel) trs = trs.filter(function (tr) { var cb = tr.querySelector('.t91-row-check'); return cb && cb.checked; });
        if (!trs.length) return;
        function text(tr, col) { var td = tr.querySelector('[data-col="' + col + '"]'); return td ? String(td.textContent || '').trim() : ''; }
        var dataRows = trs.map(function (tr) { return cfg.columns.map(function (c) { return text(tr, c.key); }); });
        var lines = [headers].concat(dataRows).map(function (arr) { return arr.map(escapeCSV).join(','); });
        var csv = '\uFEFF' + lines.join('\r\n');
        var d = new Date();
        var fn = cfg.filePrefix + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.csv';
        try {
            var b = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            var u = URL.createObjectURL(b);
            var a = document.createElement('a');
            a.href = u; a.download = fn;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(u);
        } catch (_) {}
    }

    /* CSV 모달 배선 */
    (function wireCsv() {
        var modal = document.getElementById('t91-download-modal');
        var closeBtn = document.getElementById('t91-download-close');
        var confirmBtn = document.getElementById('t91-download-confirm');
        function open() { openModal('t91-download-modal'); }
        function close() { closeModal('t91-download-modal'); }
        if (csvBtn) csvBtn.addEventListener('click', function () {
            if (csvBtn.disabled) return;
            var saved = visibleRows();
            var sel = saved.filter(function (tr) { var cb = tr.querySelector('.t91-row-check'); return cb && cb.checked; });
            if (!saved.length) return;
            var sub = document.getElementById('t91-download-subtitle');
            if (sub) sub.textContent = sel.length > 0
                ? ('선택된 ' + sel.length + '개 또는 전체 ' + saved.length + '개 중 범위를 선택하세요.')
                : ('현재 결과 ' + saved.length + '개 항목을 CSV로 내보냅니다.');
            var rowSel = document.getElementById('t91-csv-range-row-selected');
            var optSel = document.getElementById('t91-csv-range-selected');
            var optAll = document.getElementById('t91-csv-range-all');
            if (rowSel) rowSel.hidden = !(sel.length > 0);
            if (optSel) { optSel.disabled = !(sel.length > 0); optSel.checked = (sel.length > 0); }
            if (optAll) optAll.checked = !(sel.length > 0);
            open();
        });
        if (closeBtn) closeBtn.addEventListener('click', close);
        if (modal) {
            modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
            document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape' && modal.classList.contains('show')) close();
            });
        }
        if (confirmBtn) confirmBtn.addEventListener('click', function () {
            var optSelEl = document.getElementById('t91-csv-range-selected');
            var onlySel = !!(optSelEl && optSelEl.checked);
            exportCSV(onlySel);
            close();
        });
    })();

    /* ── 통계 분석 ── */
    var analyticsModal = document.getElementById('t91-analytics-modal');
    var analyticsClose = document.getElementById('t91-analytics-close');
    var analyticsEmpty = document.getElementById('t91-analytics-empty');
    var tabStrip   = document.getElementById('t91-tab-strip');
    var tabContent = document.getElementById('t91-tab-content');

    /* 도넛 / 막대 차트 공통 tooltip */
    var chartTip = document.createElement('div');
    chartTip.className = 'va-sb-tooltip';
    chartTip.style.display = 'none';
    document.body.appendChild(chartTip);

    function buildCatMap(items) {
        var map = {};
        (items || []).forEach(function (it) {
            var cat = (it[cfg.catKey] || '').trim() || '-';
            var type = (it[cfg.typeKey] || '').trim() || '-';
            if (!map[cat]) map[cat] = { count: 0, models: {} };
            map[cat].count++;
            map[cat].models[type] = (map[cat].models[type] || 0) + 1;
        });
        return map;
    }

    function renderTabStrip(catMap) {
        if (!tabStrip) return [];
        var all = Object.keys(catMap);
        var cats = [];
        cfg.tabOrder.forEach(function (t) { if (all.indexOf(t) >= 0) cats.push(t); });
        all.forEach(function (t) { if (cats.indexOf(t) < 0) cats.push(t); });
        var html = '';
        cats.forEach(function (c, i) {
            html += '<button class="va-tab' + (i === 0 ? ' active' : '') + '" data-cat="' + escapeHtml(c) + '">'
                + escapeHtml(c) + ' <span class="va-tab-count">' + catMap[c].count + '</span></button>';
        });
        tabStrip.innerHTML = html;
        return cats;
    }

    /* ── 도넛 차트 ── */
    function renderDonut(catData) {
        if (!tabContent) return;
        var models = Object.keys(catData.models).sort(function (a, b) { return catData.models[b] - catData.models[a]; });
        var segs = [], etcCount = 0;
        models.forEach(function (m, i) {
            if (i < 9) segs.push({ name: m, count: catData.models[m] });
            else etcCount += catData.models[m];
        });
        if (etcCount > 0) segs.push({ name: '기타 (' + (models.length - 9) + '종)', count: etcCount });

        var total = catData.count, R = 120, r = 76, cx = 140, cy = 140, svgSize = 280;
        var paths = '', angle = -90;
        segs.forEach(function (seg, si) {
            var pct = total > 0 ? (seg.count / total) : 0;
            var sweep = pct * 360;
            if (sweep <= 0) return;
            var col = CHART_COLORS[si % CHART_COLORS.length];
            var pctStr = (pct * 100).toFixed(1);
            if (sweep >= 359.99) {
                paths += '<path d="M' + cx + ',' + (cy - R) + ' A' + R + ',' + R + ' 0 1,1 ' + cx + ',' + (cy + R)
                    + ' A' + R + ',' + R + ' 0 1,1 ' + cx + ',' + (cy - R)
                    + ' M' + cx + ',' + (cy - r) + ' A' + r + ',' + r + ' 0 1,0 ' + cx + ',' + (cy + r)
                    + ' A' + r + ',' + r + ' 0 1,0 ' + cx + ',' + (cy - r)
                    + 'Z" fill="' + col + '" class="va-donut-seg" data-name="' + seg.name.replace(/"/g, '&quot;')
                    + '" data-count="' + seg.count + '" data-pct="' + pctStr + '" data-color="' + col + '"/>';
            } else {
                var a1 = angle * Math.PI / 180, a2 = (angle + sweep) * Math.PI / 180;
                var large = sweep > 180 ? 1 : 0;
                var ox1 = cx + R * Math.cos(a1), oy1 = cy + R * Math.sin(a1);
                var ox2 = cx + R * Math.cos(a2), oy2 = cy + R * Math.sin(a2);
                var ix2 = cx + r * Math.cos(a2), iy2 = cy + r * Math.sin(a2);
                var ix1 = cx + r * Math.cos(a1), iy1 = cy + r * Math.sin(a1);
                paths += '<path d="M' + ox1.toFixed(2) + ',' + oy1.toFixed(2)
                    + ' A' + R + ',' + R + ' 0 ' + large + ',1 ' + ox2.toFixed(2) + ',' + oy2.toFixed(2)
                    + ' L' + ix2.toFixed(2) + ',' + iy2.toFixed(2)
                    + ' A' + r + ',' + r + ' 0 ' + large + ',0 ' + ix1.toFixed(2) + ',' + iy1.toFixed(2)
                    + 'Z" fill="' + col + '" class="va-donut-seg" data-name="' + seg.name.replace(/"/g, '&quot;')
                    + '" data-count="' + seg.count + '" data-pct="' + pctStr + '" data-color="' + col + '"/>';
            }
            angle += sweep;
        });

        var html = '<div class="va-donut-wrap">';
        html += '<div class="va-donut-chart">';
        html += '<svg viewBox="0 0 ' + svgSize + ' ' + svgSize + '">' + paths + '</svg>';
        html += '<div class="va-donut-center"><span class="va-donut-total">' + total + '</span><span class="va-donut-label">건</span></div>';
        html += '</div><div class="va-donut-legend">';
        segs.forEach(function (seg, si) {
            var col = CHART_COLORS[si % CHART_COLORS.length];
            var pct = total > 0 ? (seg.count / total * 100).toFixed(1) : '0.0';
            html += '<div class="va-donut-legend-item" data-name="' + seg.name.replace(/"/g, '&quot;')
                + '" data-count="' + seg.count + '" data-pct="' + pct + '" data-color="' + col + '">'
                + '<span class="va-donut-ldot" style="background:' + col + '"></span>'
                + '<span class="va-donut-lname">' + escapeHtml(seg.name) + '</span>'
                + '<span class="va-donut-lval">' + seg.count + '</span>'
                + '<span class="va-donut-lpct">' + pct + '%</span></div>';
        });
        html += '</div></div>';
        tabContent.innerHTML = html;
        wireChartTooltip();
    }

    /* ── 막대 차트 ── */
    function renderStackedBar(catData) {
        if (!tabContent) return;
        var models = Object.keys(catData.models).sort(function (a, b) { return catData.models[b] - catData.models[a]; });
        var total = catData.count;
        var html = '';
        models.forEach(function (m, i) {
            var pct = total > 0 ? (catData.models[m] / total * 100) : 0;
            var col = CHART_COLORS[i % CHART_COLORS.length];
            html += '<div class="va-sb-label">' + escapeHtml(m) + '  (' + catData.models[m] + '건, ' + pct.toFixed(1) + '%)</div>';
            html += '<div class="va-sb-bar-wrap">';
            html += '<div class="va-sb-seg" style="width:' + pct.toFixed(2) + '%;background:' + col
                + '" data-name="' + m.replace(/"/g, '&quot;') + '" data-count="' + catData.models[m]
                + '" data-pct="' + pct.toFixed(1) + '" data-color="' + col + '"></div>';
            html += '</div>';
        });
        if (!models.length) html = '<div class="empty-text">항목이 없습니다.</div>';
        tabContent.innerHTML = html;
        wireChartTooltip();
    }

    function wireChartTooltip() {
        tabContent.addEventListener('mouseover', function (e) {
            var seg = e.target.closest('.va-donut-seg, .va-sb-seg');
            if (!seg) return;
            chartTip.innerHTML = '<span class="va-sb-tip-dot" style="background:' + seg.dataset.color + '"></span>'
                + '<span class="va-sb-tip-name">' + (seg.dataset.name || '') + '</span>'
                + '<span class="va-sb-tip-val">' + (seg.dataset.count || 0) + '건 (' + (seg.dataset.pct || 0) + '%)</span>';
            chartTip.style.display = '';
        });
        tabContent.addEventListener('mousemove', function (e) {
            if (chartTip.style.display === 'none') return;
            chartTip.style.left = (e.clientX + 12) + 'px';
            chartTip.style.top = (e.clientY - 36) + 'px';
        });
        tabContent.addEventListener('mouseout', function (e) {
            if (e.target.closest('.va-donut-seg, .va-sb-seg')) chartTip.style.display = 'none';
        });
    }

    function renderChart(catData) {
        if (cfg.chartType === 'stacked-bar') renderStackedBar(catData);
        else renderDonut(catData);
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
        if (cats.length > 0) renderChart(catMap[cats[0]]);
        if (tabStrip) tabStrip.onclick = function (e) {
            var btn = e.target.closest('.va-tab');
            if (!btn) return;
            tabStrip.querySelectorAll('.va-tab').forEach(function (t) { t.classList.remove('active'); });
            btn.classList.add('active');
            var cat = btn.getAttribute('data-cat');
            if (catMap[cat]) renderChart(catMap[cat]);
        };
    }

    if (analyticsBtn) analyticsBtn.addEventListener('click', function () { renderAnalytics(); openModal('t91-analytics-modal'); });
    if (analyticsClose) analyticsClose.addEventListener('click', function () { closeModal('t91-analytics-modal'); });
    if (analyticsModal) analyticsModal.addEventListener('click', function (e) { if (e.target === analyticsModal) closeModal('t91-analytics-modal'); });

    /* ── 초기화 ── */
    updateEmpty();
    loadRows();

    /* SPA 재진입 지원 */
    document.addEventListener('blossom:pageLoaded', function () {
        /* 재진입 시 엔터티 ID 재해석 */
        if (preset.resolveId) {
            var newId = preset.resolveId(root);
            if (newId && newId !== cfg.entityId) {
                cfg.entityId = newId;
                loadRows();
            }
        }
    });
});
})();

/*
 * tab11-task-shared.js  v1.0
 * ─────────────────────────────────────────────────────────────
 * 모든 상세 페이지의 "작업이력" 탭을 위한 단일 JS 컨트롤러.
 * tab11-task-shared.html 전용.
 *
 * 두 가지 모드를 지원한다.
 *   ① project  — /api/wrk/reports/by-system  (읽기 전용, 통계 모달)
 *   ② local    — /api/ui/task-history         (CRUD, CSV 다운로드)
 *
 * 페이지별 차이는 <main> 태그의 data-* 속성에서 읽는다.
 *   data-task-mode         : 'project' | 'local'  (기본 'local')
 *   data-scope-type        : Pattern B API scope_type
 *   data-scope-id          : Pattern B API scope_id
 *   data-scope-ref         : Pattern B API scope_ref
 *   data-storage-prefix    : Pattern A sessionStorage prefix
 *   data-user-role         : 'ADMIN' 이면 삭제/관리 열 노출
 *
 * ★ 수정 시 hw/sw/category/governance 모든 작업이력 탭에 영향.
 *   tab11-task.css 와 함께 사용한다.
 *
 * 버전: 1.0 (2026-03-19)
 */
(function () {
    'use strict';

    /* ── 중복 초기화 방지 ── */
    if (window.__BLS_TAB11_SHARED_INIT) return;
    window.__BLS_TAB11_SHARED_INIT = true;

    /* ══════════════════════════════════════════════════════════
       공통 유틸리티
       ══════════════════════════════════════════════════════════ */

    var ROOT = document.querySelector('main.tab11-task-root');
    if (!ROOT) return;

    var MODE = (ROOT.getAttribute('data-task-mode') || 'local').toLowerCase();

    var _isAdmin = (function () {
        var role = (ROOT.getAttribute('data-user-role') || '').toUpperCase();
        return role === 'ADMIN' || role === '관리자';
    })();

    /* ── 모달 헬퍼 ── */
    function openModal(id) {
        if (typeof window.openModal === 'function') { window.openModal(id); return; }
        var el = document.getElementById(id);
        if (!el) return;
        document.body.classList.add('modal-open');
        el.classList.add('show');
        el.setAttribute('aria-hidden', 'false');
    }
    function closeModal(id) {
        if (typeof window.closeModal === 'function') { window.closeModal(id); return; }
        var el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('show');
        el.setAttribute('aria-hidden', 'true');
        if (!document.querySelector('.modal-overlay-full.show'))
            document.body.classList.remove('modal-open');
    }

    function apiFetch(url, options) {
        var opts = Object.assign(
            { credentials: 'same-origin', headers: { Accept: 'application/json' } },
            options || {}
        );
        if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
            opts.body = JSON.stringify(opts.body);
            opts.headers = Object.assign({}, opts.headers, { 'Content-Type': 'application/json' });
        }
        return fetch(url, opts).then(function (res) {
            return res.json().then(
                function (json) { return { ok: res.ok, status: res.status, json: json }; },
                function ()     { return { ok: res.ok, status: res.status, json: null }; }
            );
        });
    }

    function toDisplayDT(v) {
        if (!v) return '-';
        var s = String(v);
        if (s.indexOf('T') >= 0) { s = s.replace('T', ' ').replace(/\.\d+.*/, ''); }
        return s.substring(0, 16) || '-';
    }

    function _norm(v) {
        var s = String(v == null ? '' : v).trim();
        return (s && s !== '-') ? s : '';
    }

    function _td(text) {
        var cell = document.createElement('td');
        cell.textContent = (!text || String(text).trim() === '') ? '-' : String(text);
        return cell;
    }

    /* ══════════════════════════════════════════════════════════
       삭제 확인 모달 (두 모드 공통)
       ══════════════════════════════════════════════════════════ */
    var _pendingDeleteIds = [];
    var _pendingDeleteCallback = null;
    var delModal   = document.getElementById('tk-delete-modal');
    var delConfirm = document.getElementById('tk-delete-confirm');
    var delCancel  = document.getElementById('tk-delete-cancel');
    var delCloseX  = document.getElementById('tk-delete-close');
    var delMsg     = document.getElementById('tk-delete-msg');

    function openDeleteModal(ids, cb) {
        _pendingDeleteIds = ids || [];
        _pendingDeleteCallback = cb || null;
        if (delMsg) {
            delMsg.textContent = _pendingDeleteIds.length > 1
                ? '선택한 ' + _pendingDeleteIds.length + '건의 작업이력을 삭제하시겠습니까?'
                : '이 작업이력을 삭제하시겠습니까?';
        }
        openModal('tk-delete-modal');
    }
    function closeDeleteModal() {
        var cb = _pendingDeleteCallback;
        var ids = _pendingDeleteIds;
        _pendingDeleteIds = [];
        _pendingDeleteCallback = null;
        closeModal('tk-delete-modal');
        return { ids: ids, cb: cb };
    }

    if (delConfirm) delConfirm.addEventListener('click', function () {
        var info = closeDeleteModal();
        if (info.cb) info.cb(info.ids);
    });
    if (delCancel) delCancel.addEventListener('click', function () { closeDeleteModal(); });
    if (delCloseX) delCloseX.addEventListener('click', function () { closeDeleteModal(); });
    if (delModal) {
        delModal.addEventListener('click', function (e) { if (e.target === delModal) closeDeleteModal(); });
    }

    /* ══════════════════════════════════════════════════════════
       MODE: project — 프로젝트 작업 현황 (읽기 전용)
       ══════════════════════════════════════════════════════════ */
    if (MODE === 'project') {
        (function initProjectMode() {

            var prjTable  = document.getElementById('prj-task-table');
            var prjEmpty  = document.getElementById('prj-task-empty');
            var prjInfo   = document.getElementById('prj-task-pagination-info');
            if (!prjTable) return;

            var prjTbody    = prjTable.querySelector('tbody');
            if (!prjTbody) return;

            var allItems    = [];
            var pageSize    = 10;
            var currentPage = 1;

            var pageSizeEl  = document.getElementById('prj-task-page-size');
            var pageNumsEl  = document.getElementById('prj-task-page-numbers');
            var btnFirst    = document.getElementById('prj-task-first');
            var btnPrev     = document.getElementById('prj-task-prev');
            var btnNext     = document.getElementById('prj-task-next');
            var btnLast     = document.getElementById('prj-task-last');
            var selectAllEl = document.getElementById('prj-select-all');



            /* ── status pill ── */
            function statusDotClass(code) {
                var c = String(code || '').toUpperCase();
                if (c === 'IN_PROGRESS' || c === 'ARCHIVED') return 'ws-run';
                return 'ws-wait';
            }

            function resultDotClass(v) {
                var s = String(v || '').trim();
                if (s === '정상완료') return 'rs-ok';
                if (s === '일부완료') return 'rs-partial';
                if (s === '미완료')   return 'rs-fail';
                if (s === '롤백')     return 'rs-rollback';
                return 'rs-none';
            }

            /* ── 작업보고서 팝업 ── */
            function openReportPopup(id) {
                var url = '/p/2.task_detail.html?id=' + encodeURIComponent(id);
                var w = 960, h = 800;
                var left = Math.max(0, Math.round((screen.width - w) / 2));
                var top  = Math.max(0, Math.round((screen.height - h) / 2));
                var features = 'width=' + w + ',height=' + h + ',left=' + left + ',top=' + top
                    + ',scrollbars=yes,resizable=yes,menubar=no,toolbar=no,location=no,status=no';
                window.open(url, 'wrk_report_' + id, features);
            }

            /* ── row builder ── */
            function makeProjectRow(item) {
                var tr = document.createElement('tr');
                var isArchived = String(item.status || '').toUpperCase() === 'ARCHIVED';

                /* checkbox */
                var tdCb = document.createElement('td');
                var cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.className = 'prj-row-check';
                if (item.id) cb.dataset.id = item.id;
                cb.addEventListener('change', syncSelectAll);
                tdCb.appendChild(cb);
                tr.appendChild(tdCb);

                /* status pill */
                var tdStatus = document.createElement('td');
                var pill = document.createElement('span');
                pill.className = 'status-pill';
                var dot = document.createElement('span');
                dot.className = 'status-dot ' + statusDotClass(item.status);
                dot.setAttribute('aria-hidden', 'true');
                var txt = document.createElement('span');
                txt.className = 'status-text';
                txt.textContent = item.status_label || item.status || '-';
                pill.appendChild(dot);
                pill.appendChild(txt);
                tdStatus.appendChild(pill);
                tr.appendChild(tdStatus);

                /* task name (link) */
                var tdName = document.createElement('td');
                if (item.id) {
                    var a = document.createElement('a');
                    a.href = '#';
                    a.className = 'prj-task-link';
                    a.textContent = item.task_name || '-';
                    a.title = '작업보고서 보기';
                    a.addEventListener('click', function (e) {
                        e.preventDefault();
                        openReportPopup(item.id);
                    });
                    tdName.appendChild(a);
                } else {
                    tdName.textContent = item.task_name || '-';
                }
                tr.appendChild(tdName);

                tr.appendChild(_td(item.work_type));

                /* dates */
                var startVal, endVal;
                if (isArchived) {
                    startVal = toDisplayDT(item.actual_start_time || item.start_datetime);
                    endVal   = toDisplayDT(item.actual_end_time   || item.end_datetime);
                } else {
                    startVal = toDisplayDT(item.start_datetime);
                    endVal   = toDisplayDT(item.end_datetime);
                }
                tr.appendChild(_td(startVal));
                tr.appendChild(_td(endVal));

                /* result type */
                var tdResult = document.createElement('td');
                var resText = (item.result_type && String(item.result_type).trim()) || '';
                if (resText) {
                    var resWrap = document.createElement('span');
                    resWrap.className = 'result-inline';
                    var resDot = document.createElement('span');
                    resDot.className = 'result-dot ' + resultDotClass(resText);
                    resDot.setAttribute('aria-hidden', 'true');
                    var resTxt = document.createElement('span');
                    resTxt.textContent = resText;
                    resWrap.appendChild(resDot);
                    resWrap.appendChild(resTxt);
                    tdResult.appendChild(resWrap);
                } else {
                    tdResult.textContent = '-';
                }
                tr.appendChild(tdResult);

                if (item.id) tr.setAttribute('data-report-id', String(item.id));
                return tr;
            }

            /* ── select-all ── */
            function syncSelectAll() {
                if (!selectAllEl) return;
                var cbs = prjTbody.querySelectorAll('.prj-row-check');
                if (!cbs.length) { selectAllEl.checked = false; selectAllEl.indeterminate = false; return; }
                var checked = 0;
                for (var i = 0; i < cbs.length; i++) { if (cbs[i].checked) checked++; }
                selectAllEl.checked = checked === cbs.length;
                selectAllEl.indeterminate = checked > 0 && checked < cbs.length;
            }
            if (selectAllEl) {
                selectAllEl.addEventListener('change', function () {
                    var cbs = prjTbody.querySelectorAll('.prj-row-check');
                    var val = selectAllEl.checked;
                    for (var i = 0; i < cbs.length; i++) cbs[i].checked = val;
                });
            }

            /* ── 테이블 클릭 (삭제/체크박스) ── */
            prjTable.addEventListener('click', function (ev) {
                var delBtn = ev.target.closest('.js-tk-del');
                if (delBtn) {
                    var trDel = delBtn.closest('tr');
                    var delId = trDel ? trDel.getAttribute('data-report-id') : null;
                    if (delId) openDeleteModal([delId], deleteReports);
                    return;
                }
                var row = ev.target.closest('tr');
                if (!row || row.parentNode !== prjTbody) return;
                if (ev.target.closest('button, a, input, select, textarea')) return;
                var cb2 = row.querySelector('.prj-row-check');
                if (cb2) {
                    cb2.checked = !cb2.checked;
                    row.classList.toggle('selected', cb2.checked);
                    syncSelectAll();
                }
            });

            /* ── 삭제 API ── */
            function deleteReports(ids) {
                if (!Array.isArray(ids)) ids = [ids];
                var promises = ids.map(function (id) {
                    return fetch('/api/wrk/reports/' + encodeURIComponent(id), {
                        method: 'DELETE',
                        credentials: 'same-origin',
                        headers: { 'Content-Type': 'application/json' }
                    }).then(function (r) { return r.json(); });
                });
                Promise.all(promises).then(function (results) {
                    var any = results.some(function (d) { return d && d.success; });
                    if (any) loadProjectTasks();
                }).catch(function (err) {
                    console.error('[tab11] delete error', err);
                });
            }

            /* ── pagination ── */
            function totalPages() { return Math.max(1, Math.ceil(allItems.length / pageSize)); }

            function renderPage() {
                prjTbody.innerHTML = '';
                if (!allItems.length) { updateEmpty(0); renderPagination(); return; }
                var start = (currentPage - 1) * pageSize;
                var slice = allItems.slice(start, start + pageSize);
                for (var i = 0; i < slice.length; i++) prjTbody.appendChild(makeProjectRow(slice[i]));
                updateEmpty(allItems.length);
                renderPagination();
                if (selectAllEl) { selectAllEl.checked = false; selectAllEl.indeterminate = false; }
            }

            function renderPagination() {
                var tp = totalPages();
                if (btnFirst) btnFirst.disabled = currentPage <= 1;
                if (btnPrev)  btnPrev.disabled  = currentPage <= 1;
                if (btnNext)  btnNext.disabled  = currentPage >= tp;
                if (btnLast)  btnLast.disabled  = currentPage >= tp;
                if (!pageNumsEl) return;
                pageNumsEl.innerHTML = '';
                if (!allItems.length) return;
                var maxVis = 5, half = Math.floor(maxVis / 2);
                var startP = Math.max(1, currentPage - half);
                var endP   = Math.min(tp, startP + maxVis - 1);
                if (endP - startP + 1 < maxVis) startP = Math.max(1, endP - maxVis + 1);
                for (var p = startP; p <= endP; p++) {
                    var btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'page-btn' + (p === currentPage ? ' active' : '');
                    btn.textContent = p;
                    btn.dataset.page = p;
                    btn.addEventListener('click', function () {
                        currentPage = parseInt(this.dataset.page, 10);
                        renderPage();
                    });
                    pageNumsEl.appendChild(btn);
                }
            }

            if (btnFirst) btnFirst.addEventListener('click', function () { currentPage = 1; renderPage(); });
            if (btnPrev)  btnPrev.addEventListener('click',  function () { if (currentPage > 1) { currentPage--; renderPage(); } });
            if (btnNext)  btnNext.addEventListener('click',  function () { if (currentPage < totalPages()) { currentPage++; renderPage(); } });
            if (btnLast)  btnLast.addEventListener('click',  function () { currentPage = totalPages(); renderPage(); });
            if (pageSizeEl) {
                pageSizeEl.addEventListener('change', function () {
                    pageSize = parseInt(this.value, 10) || 10;
                    currentPage = 1;
                    renderPage();
                });
            }

            function updateEmpty(count) {
                if (prjEmpty) {
                    prjEmpty.hidden = count > 0;
                    prjEmpty.style.display = count > 0 ? 'none' : '';
                }
                if (prjInfo) {
                    if (count > 0) {
                        var s = (currentPage - 1) * pageSize + 1;
                        var e = Math.min(count, currentPage * pageSize);
                        prjInfo.textContent = s + '-' + e + ' / ' + count + '개 항목';
                    } else {
                        prjInfo.textContent = '0개 항목';
                    }
                }
            }

            /* ── resolve work/system name ── */
            function resolveNames() {
                var h1 = document.querySelector('.page-header h1');
                var p  = document.querySelector('.page-header p');
                var wk = _norm(h1 ? h1.textContent : '');
                var sy = _norm(p  ? p.textContent  : '');
                if (wk || sy) return { work: wk, sys: sy };

                try {
                    var params = new URLSearchParams(window.location.search || '');
                    wk = _norm(params.get('work'));
                    sy = _norm(params.get('system'));
                    if (wk || sy) return { work: wk, sys: sy };
                } catch (_) {}

                var pfx = ROOT.getAttribute('data-storage-prefix') || '';
                var prefixes = [];
                if (pfx) prefixes.push(pfx);
                try {
                    var pk = (window.location.pathname || '').replace(/^\/p\//, '').replace(/\.html$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
                    if (pk) { prefixes.push(pk); var pts = pk.split('_'); if (pts.length > 1) { pts.pop(); prefixes.push(pts.join('_')); } }
                } catch (_) {}
                var common = ['onpremise','cloud','frame','workstation','storage','backup','director','sansw','l2','l4','l7','ap','dedicateline','firewall','vpn','ids','ips','hsm','kms','wips','etc'];
                for (var ci = 0; ci < common.length; ci++) prefixes.push(common[ci]);

                for (var pi = 0; pi < prefixes.length; pi++) {
                    var pf2 = prefixes[pi];
                    if (!pf2) continue;
                    var stores = [];
                    try { stores.push(sessionStorage); } catch (_) {}
                    try { stores.push(localStorage); } catch (_) {}
                    for (var si = 0; si < stores.length; si++) {
                        try {
                            var w2 = _norm(stores[si].getItem(pf2 + ':selected:work')) || _norm(stores[si].getItem(pf2 + ':selected:work_name'));
                            var s2 = _norm(stores[si].getItem(pf2 + ':selected:system')) || _norm(stores[si].getItem(pf2 + ':selected:system_name'));
                            if (w2 || s2) return { work: w2, sys: s2 };
                        } catch (_) {}
                    }
                }
                return { work: '', sys: '' };
            }

            /* ── data loader ── */
            function loadProjectTasks() {
                var names = resolveNames();
                if (!names.work && !names.sys) { allItems = []; renderPage(); return; }
                var qp = [];
                if (names.work) qp.push('work_name='   + encodeURIComponent(names.work));
                if (names.sys)  qp.push('system_name=' + encodeURIComponent(names.sys));
                apiFetch('/api/wrk/reports/by-system?' + qp.join('&'), { method: 'GET' }).then(function (r) {
                    allItems = (r.json && r.json.success && r.json.items) ? r.json.items : [];
                    currentPage = 1;
                    renderPage();
                }).catch(function () { allItems = []; renderPage(); });
            }

            /* ═══ 통계 모달 ═══ */
            var statsModal     = document.getElementById('prj-stats-modal');
            var statsOpenBtn   = document.getElementById('prj-stats-open');
            var statsCloseBtn  = document.getElementById('prj-stats-close');
            var statsYearBar   = document.getElementById('prj-stats-year-bar');
            var statsCanvas    = document.getElementById('prj-stats-chart');
            var statsToggle    = document.getElementById('prj-stats-chart-toggle');
            var statsChart     = null;
            var statsYear      = new Date().getFullYear();
            var statsChartType = 'bar';
            var statsLastData  = null;

            var WT_COLORS = {
                '점검': '#6366f1', '테스트': '#f59e0b', '개선': '#10b981',
                '변경': '#3b82f6', '장애대응': '#ef4444', '구축': '#8b5cf6',
                '복구': '#ec4899', '지원': '#14b8a6', '교육': '#f97316', '기타': '#94a3b8'
            };
            function wtColor(wt) { return WT_COLORS[wt] || '#64748b'; }

            function openStatsModal() {
                if (!statsModal) return;
                statsModal.classList.add('show');
                document.body.classList.add('modal-open', 'stats-modal-open');
                statsModal.setAttribute('aria-hidden', 'false');
                loadStats(statsYear);
            }
            function closeStatsModal() {
                if (!statsModal) return;
                statsModal.classList.remove('show');
                document.body.classList.remove('modal-open', 'stats-modal-open');
                statsModal.setAttribute('aria-hidden', 'true');
            }

            if (statsOpenBtn)  statsOpenBtn.addEventListener('click', openStatsModal);
            if (statsCloseBtn) statsCloseBtn.addEventListener('click', closeStatsModal);
            if (statsModal) {
                statsModal.addEventListener('click', function (e) { if (e.target === statsModal) closeStatsModal(); });
            }

            function renderYearButtons(available, selected) {
                if (!statsYearBar) return;
                statsYearBar.innerHTML = '';
                for (var i = 0; i < available.length; i++) {
                    (function (y) {
                        var btn = document.createElement('button');
                        btn.type = 'button';
                        btn.className = 'prj-stats-year-btn' + (y === selected ? ' active' : '');
                        btn.textContent = y + '년';
                        btn.addEventListener('click', function () { statsYear = y; loadStats(y); });
                        statsYearBar.appendChild(btn);
                    })(available[i]);
                }
            }

            function buildChart(data) {
                statsLastData = data;
                if (statsChartType === 'doughnut') { buildDoughnut(data); return; }
                buildBarChart(data);
            }

            function buildBarChart(data) {
                if (!statsCanvas || typeof Chart === 'undefined') return;
                var ctx = statsCanvas.getContext('2d');
                if (statsChart) { statsChart.destroy(); statsChart = null; }
                var labels = data.months.map(function (m) { return m + '월'; });
                var datasets = data.work_types.map(function (wt) {
                    return {
                        label: wt,
                        data: data.series[wt],
                        backgroundColor: wtColor(wt),
                        borderRadius: 4,
                        borderSkipped: false,
                        maxBarThickness: 40
                    };
                });
                statsChart = new Chart(ctx, {
                    type: 'bar',
                    data: { labels: labels, datasets: datasets },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: {
                            legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', padding: 16, font: { size: 12 } } },
                            tooltip: { mode: 'index',
                                callbacks: {
                                    title: function (items) { return items.length ? items[0].label : ''; },
                                    label: function (item) { return ' ' + item.dataset.label + ': ' + item.formattedValue + '건'; }
                                }
                            }
                        },
                        scales: {
                            x: { stacked: true, grid: { display: false } },
                            y: { stacked: true, beginAtZero: true,
                                ticks: { stepSize: 1, callback: function (v) { return Number.isInteger(v) ? v : ''; } },
                                title: { display: true, text: '건수', font: { size: 12 } }
                            }
                        }
                    }
                });
            }

            function buildDoughnut(data) {
                if (!statsCanvas || typeof Chart === 'undefined') return;
                var ctx = statsCanvas.getContext('2d');
                if (statsChart) { statsChart.destroy(); statsChart = null; }
                var totals = {};
                data.work_types.forEach(function (wt) {
                    var sum = 0;
                    data.series[wt].forEach(function (v) { sum += v; });
                    if (sum > 0) totals[wt] = sum;
                });
                var labels = Object.keys(totals);
                var values = labels.map(function (k) { return totals[k]; });
                var colors = labels.map(function (k) { return wtColor(k); });
                statsChart = new Chart(ctx, {
                    type: 'doughnut',
                    data: { labels: labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#fff', hoverOffset: 8 }] },
                    options: {
                        responsive: true, maintainAspectRatio: false, cutout: '55%',
                        plugins: {
                            legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', padding: 16, font: { size: 12 } } },
                            tooltip: { callbacks: {
                                label: function (item) {
                                    var total = item.dataset.data.reduce(function (a, b) { return a + b; }, 0);
                                    var pct = total ? Math.round(item.raw / total * 100) : 0;
                                    return ' ' + item.label + ': ' + item.formattedValue + '건 (' + pct + '%)';
                                }
                            } }
                        }
                    }
                });
            }

            if (statsToggle) {
                statsToggle.addEventListener('click', function (e) {
                    var btn = e.target.closest('.prj-chart-type-btn');
                    if (!btn) return;
                    var type = btn.getAttribute('data-chart');
                    if (type === statsChartType) return;
                    statsChartType = type;
                    var btns = statsToggle.querySelectorAll('.prj-chart-type-btn');
                    for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
                    btn.classList.add('active');
                    if (statsLastData) buildChart(statsLastData);
                });
            }

            function loadStats(year) {
                var names = resolveNames();
                var qp = [];
                if (names.work) qp.push('work_name=' + encodeURIComponent(names.work));
                if (names.sys)  qp.push('system_name=' + encodeURIComponent(names.sys));
                qp.push('year=' + encodeURIComponent(year));
                apiFetch('/api/wrk/reports/stats-by-system?' + qp.join('&')).then(function (r) {
                    var d = r.json;
                    if (d && d.success) {
                        renderYearButtons(d.available_years, d.year);
                        buildChart(d);
                    }
                }).catch(function () {});
            }

            /* ── 타이틀 대기 후 로드 ── */
            var attempts = 0;
            function tryLoad() {
                var names = resolveNames();
                if ((names.work || names.sys) || attempts >= 30) {
                    loadProjectTasks();
                } else {
                    attempts++;
                    setTimeout(tryLoad, 300);
                }
            }
            tryLoad();

        })();
        return; /* project mode exits */
    }

    /* ══════════════════════════════════════════════════════════
       MODE: local — 로컬 작업이력 CRUD
       ══════════════════════════════════════════════════════════ */
    (function initLocalMode() {

        var scopeType = ROOT.getAttribute('data-scope-type') || '';
        var scopeId   = ROOT.getAttribute('data-scope-id')   || '';
        var scopeRef  = ROOT.getAttribute('data-scope-ref')  || '';

        var tkTable   = document.getElementById('tk-spec-table');
        var tkEmpty   = document.getElementById('tk-empty');
        var tkInfo    = document.getElementById('tk-pagination-info');
        if (!tkTable) return;

        var tkTbody   = tkTable.querySelector('tbody');
        if (!tkTbody) return;

        var allItems    = [];
        var pageSize    = 10;
        var currentPage = 1;

        var pageSizeEl  = document.getElementById('tk-page-size');
        var pageNumsEl  = document.getElementById('tk-page-numbers');
        var btnFirst    = document.getElementById('tk-first');
        var btnPrev     = document.getElementById('tk-prev');
        var btnNext     = document.getElementById('tk-next');
        var btnLast     = document.getElementById('tk-last');
        var selectAllEl = document.getElementById('tk-select-all');
        var addBtn      = document.getElementById('tk-row-add');
        var dlBtn       = document.getElementById('tk-download-btn');

        /* ── 드롭다운 옵션 ── */
        var STATUS_OPTIONS = [
            { value: '대기', label: '대기' },
            { value: '진행중', label: '진행중' },
            { value: '완료', label: '완료' },
            { value: '보류', label: '보류' }
        ];
        var TYPE_OPTIONS = [
            { value: '점검', label: '점검' },
            { value: '테스트', label: '테스트' },
            { value: '개선', label: '개선' },
            { value: '변경', label: '변경' },
            { value: '장애대응', label: '장애대응' },
            { value: '구축', label: '구축' },
            { value: '복구', label: '복구' },
            { value: '지원', label: '지원' },
            { value: '교육', label: '교육' },
            { value: '기타', label: '기타' }
        ];
        var CATEGORY_OPTIONS = [
            { value: '정기', label: '정기' },
            { value: '비정기', label: '비정기' },
            { value: '긴급', label: '긴급' }
        ];

        /* ── API 기본 쿼리 ── */
        function baseQS() {
            var qp = [];
            if (scopeType) qp.push('scope_type=' + encodeURIComponent(scopeType));
            if (scopeId)   qp.push('scope_id='   + encodeURIComponent(scopeId));
            if (scopeRef)  qp.push('scope_ref='  + encodeURIComponent(scopeRef));
            return qp.join('&');
        }

        /* ── status dot class ── */
        function tkStatusDotClass(v) {
            var s = String(v || '').trim();
            if (s === '진행중') return 'ws-run';
            if (s === '대기')   return 'ws-wait';
            if (s === '완료')   return 'ws-idle';
            return 'ws-wait';
        }

        /* ── select builder ── */
        function makeSelect(opts, selected) {
            var sel = document.createElement('select');
            for (var i = 0; i < opts.length; i++) {
                var o = document.createElement('option');
                o.value = opts[i].value;
                o.textContent = opts[i].label;
                if (opts[i].value === selected) o.selected = true;
                sel.appendChild(o);
            }
            return sel;
        }

        /* ── row builder (CRUD editable) ── */
        function makeLocalRow(item) {
            var tr = document.createElement('tr');
            if (item.id) tr.setAttribute('data-task-id', String(item.id));
            if (item._isNew) tr.classList.add('new-row');

            /* checkbox */
            var tdCb = document.createElement('td');
            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'tk-row-check';
            cb.addEventListener('change', syncSelectAll);
            tdCb.appendChild(cb);
            tr.appendChild(tdCb);

            /* status (select) */
            var tdSt = document.createElement('td');
            var stSel = makeSelect(STATUS_OPTIONS, item.status || '대기');
            stSel.name = 'status';
            tdSt.appendChild(stSel);
            tr.appendChild(tdSt);

            /* task_no (readonly number text) */
            var tdNo = document.createElement('td');
            var noInput = document.createElement('input');
            noInput.type = 'text';
            noInput.name = 'task_no';
            noInput.value = item.task_no || '';
            noInput.placeholder = '자동';
            noInput.readOnly = true;
            noInput.style.background = '#f8fafc';
            noInput.style.color = '#94a3b8';
            tdNo.appendChild(noInput);
            tr.appendChild(tdNo);

            /* name */
            var tdName = document.createElement('td');
            var nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.name = 'name';
            nameInput.value = item.name || '';
            nameInput.placeholder = '작업 이름';
            tdName.appendChild(nameInput);
            tr.appendChild(tdName);

            /* type (select) */
            var tdType = document.createElement('td');
            var typeSel = makeSelect(TYPE_OPTIONS, item.type || '점검');
            typeSel.name = 'type';
            tdType.appendChild(typeSel);
            tr.appendChild(tdType);

            /* category (select) */
            var tdCat = document.createElement('td');
            var catSel = makeSelect(CATEGORY_OPTIONS, item.category || '정기');
            catSel.name = 'category';
            tdCat.appendChild(catSel);
            tr.appendChild(tdCat);

            /* start datetime */
            var tdStart = document.createElement('td');
            var startInput = document.createElement('input');
            startInput.type = 'datetime-local';
            startInput.name = 'start';
            startInput.value = item.start ? String(item.start).substring(0, 16) : '';
            tdStart.appendChild(startInput);
            tr.appendChild(tdStart);

            /* end datetime */
            var tdEnd = document.createElement('td');
            var endInput = document.createElement('input');
            endInput.type = 'datetime-local';
            endInput.name = 'end';
            endInput.value = item.end ? String(item.end).substring(0, 16) : '';
            tdEnd.appendChild(endInput);
            tr.appendChild(tdEnd);

            /* actions (save / delete) */
            var tdAc = document.createElement('td');
            tdAc.className = 'system-actions table-actions';

            var saveBtn = document.createElement('button');
            saveBtn.type = 'button';
            saveBtn.className = 'action-btn primary js-tk-save';
            saveBtn.title = '저장';
            saveBtn.setAttribute('aria-label', '저장');
            saveBtn.innerHTML = '<img src="/static/image/svg/list/free-icon-check.svg" alt="저장" class="action-icon">';
            tdAc.appendChild(saveBtn);

            var delBtnEl = document.createElement('button');
            delBtnEl.type = 'button';
            delBtnEl.className = 'action-btn danger js-tk-del';
            delBtnEl.title = '삭제';
            delBtnEl.setAttribute('aria-label', '삭제');
            delBtnEl.innerHTML = '<img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon">';
            tdAc.appendChild(delBtnEl);

            tr.appendChild(tdAc);
            return tr;
        }

        /* ── read row values ── */
        function readRowValues(tr) {
            var data = {};
            var inputs = tr.querySelectorAll('input, select');
            for (var i = 0; i < inputs.length; i++) {
                var el = inputs[i];
                if (el.name) data[el.name] = el.value;
            }
            return data;
        }

        /* ── validate ── */
        function validateRow(data) {
            if (!data.status) return '상태를 선택해주세요.';
            if (!data.name || !data.name.trim()) return '작업 이름을 입력해주세요.';
            if (!data.type) return '작업 유형을 선택해주세요.';
            if (!data.category) return '작업 구분을 선택해주세요.';
            if (!data.start) return '시작일시를 입력해주세요.';
            return null;
        }

        /* ── select-all ── */
        function syncSelectAll() {
            if (!selectAllEl) return;
            var cbs = tkTbody.querySelectorAll('.tk-row-check');
            if (!cbs.length) { selectAllEl.checked = false; selectAllEl.indeterminate = false; return; }
            var checked = 0;
            for (var i = 0; i < cbs.length; i++) { if (cbs[i].checked) checked++; }
            selectAllEl.checked = checked === cbs.length;
            selectAllEl.indeterminate = checked > 0 && checked < cbs.length;
        }
        if (selectAllEl) {
            selectAllEl.addEventListener('change', function () {
                var cbs = tkTbody.querySelectorAll('.tk-row-check');
                var val = selectAllEl.checked;
                for (var i = 0; i < cbs.length; i++) cbs[i].checked = val;
            });
        }

        /* ── table click delegation ── */
        tkTable.addEventListener('click', function (ev) {
            /* save */
            var saveBtn2 = ev.target.closest('.js-tk-save');
            if (saveBtn2) {
                var trSave = saveBtn2.closest('tr');
                if (trSave) saveRow(trSave);
                return;
            }
            /* delete */
            var delBtn2 = ev.target.closest('.js-tk-del');
            if (delBtn2) {
                var trDel2 = delBtn2.closest('tr');
                var delId2 = trDel2 ? trDel2.getAttribute('data-task-id') : null;
                if (trDel2 && !delId2) {
                    /* 저장 전 새 행: DOM에서 바로 제거 */
                    trDel2.remove();
                    return;
                }
                if (delId2) openDeleteModal([delId2], function (ids) { deleteLocalTasks(ids); });
                return;
            }
            /* row checkbox toggle */
            var row2 = ev.target.closest('tr');
            if (!row2 || row2.parentNode !== tkTbody) return;
            if (ev.target.closest('button, a, input, select, textarea')) return;
            var cb3 = row2.querySelector('.tk-row-check');
            if (cb3) {
                cb3.checked = !cb3.checked;
                row2.classList.toggle('selected', cb3.checked);
                syncSelectAll();
            }
        });

        /* ── 행 추가 ── */
        if (addBtn) {
            addBtn.addEventListener('click', function () {
                var newRow = makeLocalRow({ _isNew: true, status: '대기', type: '점검', category: '정기' });
                if (tkTbody.firstChild) {
                    tkTbody.insertBefore(newRow, tkTbody.firstChild);
                } else {
                    tkTbody.appendChild(newRow);
                }
                updateEmpty(1);
                var nameInput2 = newRow.querySelector('input[name="name"]');
                if (nameInput2) nameInput2.focus();
            });
        }

        /* ── save row ── */
        function saveRow(tr) {
            var data = readRowValues(tr);
            var err = validateRow(data);
            if (err) { alert(err); return; }

            var taskId = tr.getAttribute('data-task-id');
            var isNew  = !taskId;
            var url  = isNew
                ? ('/api/ui/task-history?' + baseQS())
                : ('/api/ui/task-history/' + encodeURIComponent(taskId) + '?' + baseQS());
            var method = isNew ? 'POST' : 'PUT';

            apiFetch(url, { method: method, body: data }).then(function (r) {
                if (r.json && r.json.success) {
                    loadLocalTasks();
                } else {
                    alert((r.json && r.json.message) || '저장에 실패했습니다.');
                }
            }).catch(function () { alert('저장 중 오류가 발생했습니다.'); });
        }

        /* ── 삭제 ── */
        function deleteLocalTasks(ids) {
            if (!Array.isArray(ids)) ids = [ids];
            var promises = ids.map(function (id) {
                return apiFetch('/api/ui/task-history/' + encodeURIComponent(id) + '?' + baseQS(), { method: 'DELETE' });
            });
            Promise.all(promises).then(function () { loadLocalTasks(); }).catch(function () { loadLocalTasks(); });
        }

        /* ── pagination ── */
        function totalPages() { return Math.max(1, Math.ceil(allItems.length / pageSize)); }

        function renderPage() {
            tkTbody.innerHTML = '';
            if (!allItems.length) { updateEmpty(0); renderPagination(); return; }
            var start = (currentPage - 1) * pageSize;
            var slice = allItems.slice(start, start + pageSize);
            for (var i = 0; i < slice.length; i++) tkTbody.appendChild(makeLocalRow(slice[i]));
            updateEmpty(allItems.length);
            renderPagination();
            if (selectAllEl) { selectAllEl.checked = false; selectAllEl.indeterminate = false; }
        }

        function renderPagination() {
            var tp = totalPages();
            if (btnFirst) btnFirst.disabled = currentPage <= 1;
            if (btnPrev)  btnPrev.disabled  = currentPage <= 1;
            if (btnNext)  btnNext.disabled  = currentPage >= tp;
            if (btnLast)  btnLast.disabled  = currentPage >= tp;
            if (!pageNumsEl) return;
            pageNumsEl.innerHTML = '';
            if (!allItems.length) return;
            var maxVis = 5, half = Math.floor(maxVis / 2);
            var startP = Math.max(1, currentPage - half);
            var endP   = Math.min(tp, startP + maxVis - 1);
            if (endP - startP + 1 < maxVis) startP = Math.max(1, endP - maxVis + 1);
            for (var p = startP; p <= endP; p++) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'page-btn' + (p === currentPage ? ' active' : '');
                btn.textContent = p;
                btn.dataset.page = p;
                btn.addEventListener('click', function () {
                    currentPage = parseInt(this.dataset.page, 10);
                    renderPage();
                });
                pageNumsEl.appendChild(btn);
            }
        }

        if (btnFirst) btnFirst.addEventListener('click', function () { currentPage = 1; renderPage(); });
        if (btnPrev)  btnPrev.addEventListener('click',  function () { if (currentPage > 1) { currentPage--; renderPage(); } });
        if (btnNext)  btnNext.addEventListener('click',  function () { if (currentPage < totalPages()) { currentPage++; renderPage(); } });
        if (btnLast)  btnLast.addEventListener('click',  function () { currentPage = totalPages(); renderPage(); });
        if (pageSizeEl) {
            pageSizeEl.addEventListener('change', function () {
                pageSize = parseInt(this.value, 10) || 10;
                currentPage = 1;
                renderPage();
            });
        }

        function updateEmpty(count) {
            if (tkEmpty) {
                tkEmpty.hidden = count > 0;
                tkEmpty.style.display = count > 0 ? 'none' : '';
            }
            if (tkInfo) {
                if (count > 0) {
                    var s = (currentPage - 1) * pageSize + 1;
                    var e = Math.min(count, currentPage * pageSize);
                    tkInfo.textContent = s + '-' + e + ' / ' + count + '개 항목';
                } else {
                    tkInfo.textContent = '0개 항목';
                }
            }
        }

        /* ── CSV 다운로드 ── */
        var dlModal   = document.getElementById('tk-download-modal');
        var dlConfirm = document.getElementById('tk-download-confirm');
        var dlClose   = document.getElementById('tk-download-close');

        if (dlBtn) {
            dlBtn.addEventListener('click', function () { openModal('tk-download-modal'); });
        }
        if (dlClose) {
            dlClose.addEventListener('click', function () { closeModal('tk-download-modal'); });
        }
        if (dlModal) {
            dlModal.addEventListener('click', function (e) { if (e.target === dlModal) closeModal('tk-download-modal'); });
        }
        if (dlConfirm) {
            dlConfirm.addEventListener('click', function () {
                closeModal('tk-download-modal');
                var rangeEl = document.querySelector('input[name="tk-csv-range"]:checked');
                var range = rangeEl ? rangeEl.value : 'all';
                var rows = [];
                if (range === 'selected') {
                    var cbs = tkTbody.querySelectorAll('.tk-row-check:checked');
                    for (var i = 0; i < cbs.length; i++) {
                        var tr = cbs[i].closest('tr');
                        if (tr) rows.push(readRowValues(tr));
                    }
                }
                if (!rows.length) rows = allItems;
                downloadCSV(rows);
            });
        }

        function downloadCSV(rows) {
            var header = ['상태', '작업 번호', '작업 이름', '작업 유형', '작업 구분', '시작일시', '종료일시'];
            var lines = [header.join(',')];
            for (var i = 0; i < rows.length; i++) {
                var r = rows[i];
                lines.push([
                    csvEsc(r.status), csvEsc(r.task_no), csvEsc(r.name),
                    csvEsc(r.type), csvEsc(r.category),
                    csvEsc(r.start), csvEsc(r.end)
                ].join(','));
            }
            var bom = '\uFEFF';
            var blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = '작업이력_' + new Date().toISOString().substring(0, 10) + '.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        function csvEsc(v) {
            if (v == null) return '';
            var s = String(v);
            if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
                return '"' + s.replace(/"/g, '""') + '"';
            }
            return s;
        }

        /* ── data loader ── */
        function loadLocalTasks() {
            if (!scopeType) { allItems = []; renderPage(); return; }
            apiFetch('/api/ui/task-history?' + baseQS(), { method: 'GET' }).then(function (r) {
                allItems = (r.json && r.json.success && r.json.items) ? r.json.items : [];
                currentPage = 1;
                renderPage();
            }).catch(function () { allItems = []; renderPage(); });
        }

        loadLocalTasks();

    })();

})();

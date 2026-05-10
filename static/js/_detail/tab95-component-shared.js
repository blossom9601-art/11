/*
 * tab95-component-shared.js  v1.1
 * ──────────────────────────────────────────────────────────────
 * 컴포넌트 탭 공통 컴포넌트 — tab93/tab94와 같은 설정 기반 UI/UX 제공
 */
(function () {
    'use strict';

    function ready(fn) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
        else fn();
    }
    function dash(v) { var s = String(v == null ? '' : v).trim(); return s || '-'; }
    function toInt(v) { var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }
    function pad2(n) { return n < 10 ? '0' + n : '' + n; }
    function escapeHTML(v) {
        return String(v == null ? '' : v).replace(/[&<>"']/g, function (ch) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
        });
    }
    function statusDotHTML(color) {
        var bg = color || '#6b7280';
        return '<span class="t95-dot" style="background:' + bg + '" aria-hidden="true"></span>';
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

    var STRATEGIES = {
        'comp-model-assets': {
            getApiUrl: function (table) {
                var titleEl = document.getElementById('page-header-title');
                var model = titleEl ? (titleEl.textContent || '').trim() : '';
                if (!model || model === '컴포넌트' || model === '모델명') return '';
                var endpoint = table.getAttribute('data-api-endpoint') || '';
                if (endpoint) return endpoint.replace('{id}', encodeURIComponent(model));
                return '/api/category/comp-model-assets?model=' + encodeURIComponent(model);
            },
            pageSizeKey: 'comp-model:pageSize'
        },
        'vendor-comp-assets': {
            getApiUrl: function (table) {
                var sessKey = table.getAttribute('data-session-key') || 'manufacturer:context';
                try {
                    var raw = sessionStorage.getItem(sessKey);
                    if (raw) {
                        var id = toInt(JSON.parse(raw).id);
                        if (id) {
                            var endpoint = table.getAttribute('data-api-endpoint') || '';
                            return endpoint ? endpoint.replace('{id}', id) : '/api/vendor-manufacturers/' + id + '/comp-assets';
                        }
                    }
                } catch (_) { }
                return '';
            },
            pageSizeKey: 'vendor:co-assets:pageSize'
        },
        'maint-comp-assets': {
            getApiUrl: function (table) {
                var sessKey = table.getAttribute('data-session-key') || 'maintenance:context';
                try {
                    var raw = sessionStorage.getItem(sessKey);
                    if (raw) {
                        var id = toInt(JSON.parse(raw).id);
                        if (id) {
                            var endpoint = table.getAttribute('data-api-endpoint') || '';
                            return endpoint ? endpoint.replace('{id}', id) : '/api/vendor-maintenance/' + id + '/comp-assets';
                        }
                    }
                } catch (_) { }
                return '';
            },
            pageSizeKey: 'maint:comp-assets:pageSize'
        }
    };

    function initTab95() {
        var table = document.getElementById('t95-table');
        if (!table) return;
        var ctx = (table.getAttribute('data-context') || '').toLowerCase();
        var strategy = STRATEGIES[ctx];
        if (!strategy) return;

        if (table.getAttribute('data-tab95-init') === '1') {
            table.dispatchEvent(new CustomEvent('tab95:reload'));
            return;
        }
        table.setAttribute('data-tab95-init', '1');

        var columns = [];
        try { columns = JSON.parse(table.getAttribute('data-columns') || '[]'); } catch (_) { columns = []; }
        var showAnalytics = table.getAttribute('data-show-analytics') === 'true';
        var analyticsGroup = table.getAttribute('data-analytics-group') || '';
        var csvFilename = table.getAttribute('data-csv-filename') || 'component_assets';

        var tbody = table.querySelector('tbody') || table.appendChild(document.createElement('tbody'));
        var emptyEl = document.getElementById('t95-empty');
        var selectAll = document.getElementById('t95-select-all');
        var csvBtn = document.getElementById('t95-download-btn');
        var pageSizeSel = document.getElementById('t95-page-size');
        var infoEl = document.getElementById('t95-pagination-info');
        var numsWrap = document.getElementById('t95-page-numbers');
        var btnFirst = document.getElementById('t95-first');
        var btnPrev = document.getElementById('t95-prev');
        var btnNext = document.getElementById('t95-next');
        var btnLast = document.getElementById('t95-last');
        var state = { page: 1, pageSize: 10 };

        (function () {
            try {
                var pageSizeKey = table.getAttribute('data-storage-key') || strategy.pageSizeKey;
                var saved = localStorage.getItem(pageSizeKey);
                if (pageSizeSel && saved && ['10', '20', '50', '100'].indexOf(saved) > -1) {
                    state.pageSize = parseInt(saved, 10); pageSizeSel.value = saved;
                }
                if (pageSizeSel) pageSizeSel.addEventListener('change', function () {
                    var v = parseInt(pageSizeSel.value, 10);
                    if (!isNaN(v)) { state.page = 1; state.pageSize = v; localStorage.setItem(pageSizeKey, String(v)); renderPage(); }
                });
            } catch (_) { }
        })();

        function allRows() { return Array.prototype.slice.call(tbody.querySelectorAll('tr')); }
        function totalRows() { return allRows().length; }
        function totalPages() { return Math.max(1, Math.ceil(totalRows() / Math.max(1, state.pageSize))); }
        function clamp() { if (state.page > totalPages()) state.page = totalPages(); if (state.page < 1) state.page = 1; }

        function syncSelectAll() {
            if (!selectAll) return;
            var vc = table.querySelectorAll('tbody tr:not([data-hidden]) .t95-row-check');
            selectAll.checked = vc.length ? Array.prototype.every.call(vc, function (c) { return c.checked; }) : false;
        }

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
            syncSelectAll();
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

        if (selectAll) selectAll.addEventListener('change', function () {
            var checks = table.querySelectorAll('tbody tr:not([data-hidden]) .t95-row-check:not([disabled])');
            Array.prototype.forEach.call(checks, function (c) { c.checked = !!selectAll.checked; c.closest('tr').classList.toggle('selected', !!c.checked); });
        });
        table.addEventListener('click', function (ev) {
            var onCb = ev.target.closest('input[type="checkbox"].t95-row-check');
            if (onCb) {
                var tr0 = onCb.closest('tr'); if (tr0) tr0.classList.toggle('selected', !!onCb.checked);
                syncSelectAll();
                return;
            }
            if (ev.target.closest('button, a, input, select, textarea, label')) return;
            var tr = ev.target.closest('tr');
            if (!tr || !tr.parentNode || tr.parentNode.tagName.toLowerCase() !== 'tbody') return;
            if (tr.hasAttribute('data-hidden') || tr.style.display === 'none') return;
            var cb = tr.querySelector('.t95-row-check'); if (!cb || cb.disabled) return;
            cb.checked = !cb.checked; tr.classList.toggle('selected', !!cb.checked);
            syncSelectAll();
        });

        var sortState = { col: null, dir: 'asc' };

        function sortRows() {
            var col = sortState.col; if (!col) return;
            var isNumeric = columns.some(function (c) { return c.key === col && c.numeric; });
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
            Array.prototype.forEach.call(table.querySelectorAll('thead th.sortable'), function (th) {
                th.classList.remove('sort-asc', 'sort-desc');
                if (th.getAttribute('data-sort-col') === sortState.col) th.classList.add(sortState.dir === 'asc' ? 'sort-asc' : 'sort-desc');
            });
        }

        var thead = table.querySelector('thead');
        if (thead) thead.addEventListener('click', function (ev) {
            var th = ev.target.closest('th[data-sort-col]'); if (!th) return;
            var col = th.getAttribute('data-sort-col');
            if (sortState.col === col) sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
            else { sortState.col = col; sortState.dir = 'asc'; }
            updateSortIndicators(); sortRows();
        });

        function renderRows(items) {
            tbody.innerHTML = '';
            (items || []).forEach(function (it) {
                var tr = document.createElement('tr');
                var html = '<td><input type="checkbox" class="t95-row-check" aria-label="행 선택"></td>';
                columns.forEach(function (col) {
                    var val = it[col.key];
                    var display = col.numeric ? (val != null ? String(val) : '-') : dash(val);
                    var dotHtml = '';
                    if (col.statusDot) dotHtml = statusDotHTML(it.work_status_color);
                    if (col.contractDot) dotHtml = statusDotHTML(it.contract_status_color);
                    html += '<td data-col="' + escapeHTML(col.key) + '">' + dotHtml + escapeHTML(display) + '</td>';
                });
                tr.innerHTML = html;
                tbody.appendChild(tr);
            });
            if (sortState.col) { sortRows(); } else { go(1); }
            updateEmpty();
        }

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

        table.addEventListener('tab95:reload', function () {
            sortState.col = null; sortState.dir = 'asc';
            updateSortIndicators();
            loadData();
        });

        if (csvBtn) csvBtn.addEventListener('click', function () { openModal('t95-download-modal'); });
        var csvClose = document.getElementById('t95-download-close');
        var csvModal = document.getElementById('t95-download-modal');
        if (csvClose) csvClose.addEventListener('click', function () { closeModal('t95-download-modal'); });
        if (csvModal) csvModal.addEventListener('click', function (e) { if (e.target === csvModal) closeModal('t95-download-modal'); });

        var csvConfirm = document.getElementById('t95-download-confirm');
        if (csvConfirm) csvConfirm.addEventListener('click', function () {
            var rangeAll = document.getElementById('t95-csv-range-all');
            var all = !rangeAll || rangeAll.checked;
            var list = allRows();
            if (!all) list = list.filter(function (tr) { var cb = tr.querySelector('.t95-row-check'); return cb && cb.checked; });
            if (!list.length) { toast('내보낼 행이 없습니다.', 'warning'); return; }

            var header = columns.map(function (c) { return escapeCSV(c.label); }).join(',');
            var lines = [header];
            list.forEach(function (tr) {
                lines.push(columns.map(function (c) {
                    var td = tr.querySelector('[data-col="' + c.key + '"]');
                    return escapeCSV(td ? (td.textContent || '').trim() : '');
                }).join(','));
            });

            var fname = csvFilename;
            if (ctx === 'maint-comp-assets') {
                var d = new Date();
                fname = csvFilename + '_' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());
            }
            downloadCSV(fname + '.csv', lines);
            closeModal('t95-download-modal');
            toast('CSV 다운로드가 완료되었습니다.', 'success');
        });

        if (showAnalytics) {
            var analyticsBtn = document.getElementById('t95-analytics-btn');
            var analyticsModal = document.getElementById('t95-analytics-modal');
            var analyticsClose = document.getElementById('t95-analytics-close');
            var analyticsEmpty = document.getElementById('t95-analytics-empty');
            var tabStrip = document.getElementById('t95-tab-strip');
            var tabContent = document.getElementById('t95-tab-content');
            var TAB_ORDER = ctx === 'comp-model-assets'
                ? ['서버', '스토리지', 'SAN', '네트워크', '보안장비']
                : ['CPU', 'GPU', 'MEMORY', 'DISK', 'NIC', 'HBA', 'ETC'];
            var TYPE_ORDER = {
                '서버': ['온프레미스', '클라우드', '프레임', '워크스테이션'],
                '스토리지': ['스토리지', '백업장치'],
                'SAN': ['SAN 디렉터', 'SAN 스위치'],
                '네트워크': ['L2', 'L3', 'L4', 'L7', '무선장비', '회선장비'],
                '보안장비': ['방화벽', 'VPN', 'IDS', 'IPS', 'HSM', 'KMS', 'WIPS', '기타']
            };
            var SB_COLORS = ['#6366F1', '#3b82f6', '#0ea5e9', '#14b8a6', '#22c55e', '#eab308', '#f97316', '#ef4444', '#a855f7', '#94a3b8'];
            var sbTip = document.createElement('div');
            sbTip.className = 'va-sb-tooltip';
            sbTip.style.display = 'none';
            document.body.appendChild(sbTip);

            function buildCatMap(items) {
                var map = {};
                (items || []).forEach(function (it) {
                    var cat = dash(it.category);
                    var type = dash(it.type);
                    var grp = dash(it[analyticsGroup] || it.model || it.type);
                    if (!map[cat]) map[cat] = { count: 0, types: {} };
                    map[cat].count++;
                    if (!map[cat].types[type]) map[cat].types[type] = { count: 0, groups: {} };
                    map[cat].types[type].count++;
                    map[cat].types[type].groups[grp] = (map[cat].types[type].groups[grp] || 0) + 1;
                });
                return map;
            }

            function renderTabStrip(catMap) {
                if (!tabStrip) return [];
                var all = Object.keys(catMap);
                var cats = [];
                TAB_ORDER.forEach(function (t) { if (all.indexOf(t) >= 0) cats.push(t); });
                all.forEach(function (t) { if (cats.indexOf(t) < 0) cats.push(t); });
                var html = '';
                cats.forEach(function (c, i) {
                    html += '<button class="va-tab' + (i === 0 ? ' active' : '') + '" data-cat="' + escapeHTML(c) + '">' + escapeHTML(c) + ' <span class="va-tab-count">' + catMap[c].count + '</span></button>';
                });
                tabStrip.innerHTML = html;
                return cats;
            }

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
                    html += '<div class="va-type-header"><span class="va-type-name">' + escapeHTML(type) + '</span><span class="va-type-count">' + td.count + '건</span></div>';
                    var groups = Object.keys(td.groups).sort(function (a, b) { return td.groups[b] - td.groups[a]; });
                    var segs = [], etcCount = 0;
                    groups.forEach(function (g, i) {
                        if (i < 9) segs.push({ name: g, count: td.groups[g] });
                        else etcCount += td.groups[g];
                    });
                    if (etcCount > 0) segs.push({ name: '기타 (' + (groups.length - 9) + '종)', count: etcCount });

                    html += '<div class="va-sb-bar">';
                    segs.forEach(function (seg, si) {
                        var pct = td.count > 0 ? (seg.count / td.count * 100) : 0;
                        var pctStr = pct.toFixed(1);
                        var col = SB_COLORS[si % SB_COLORS.length];
                        html += '<span class="va-sb-seg" style="width:' + pctStr + '%;background:' + col + '"'
                            + ' data-name="' + escapeHTML(seg.name) + '"'
                            + ' data-count="' + seg.count + '"'
                            + ' data-pct="' + pctStr + '"'
                            + ' data-color="' + col + '"></span>';
                    });
                    html += '</div>';
                    html += '<div class="va-sb-legend">';
                    segs.forEach(function (seg, si) {
                        var col = SB_COLORS[si % SB_COLORS.length];
                        html += '<span class="va-sb-chip"><span class="va-sb-dot" style="background:' + col + '"></span>' + escapeHTML(seg.name) + ' <b>' + seg.count + '</b></span>';
                    });
                    html += '</div></div>';
                });
                tabContent.innerHTML = html;
            }

            if (tabContent) {
                tabContent.addEventListener('mouseover', function (e) {
                    var seg = e.target.closest('.va-sb-seg');
                    if (!seg) return;
                    sbTip.innerHTML = '<span class="va-sb-tip-dot" style="background:' + seg.getAttribute('data-color') + '"></span>'
                        + '<span class="va-sb-tip-name">' + escapeHTML(seg.getAttribute('data-name')) + '</span>'
                        + '<span class="va-sb-tip-val">' + seg.getAttribute('data-count') + '건 (' + seg.getAttribute('data-pct') + '%)</span>';
                    sbTip.style.display = '';
                });
                tabContent.addEventListener('mousemove', function (e) {
                    if (sbTip.style.display === 'none') return;
                    sbTip.style.left = (e.clientX + 12) + 'px';
                    sbTip.style.top = (e.clientY - 36) + 'px';
                });
                tabContent.addEventListener('mouseout', function (e) {
                    if (e.target.closest('.va-sb-seg')) sbTip.style.display = 'none';
                });
            }

            function renderAnalytics() {
                var items = lastLoadedItems;
                if (!items.length) {
                    if (analyticsEmpty) { analyticsEmpty.hidden = false; analyticsEmpty.style.display = ''; }
                    if (tabStrip) tabStrip.innerHTML = '';
                    if (tabContent) tabContent.innerHTML = '';
                    return;
                }
                if (analyticsEmpty) { analyticsEmpty.hidden = true; analyticsEmpty.style.display = 'none'; }
                var catMap = buildCatMap(items);
                var cats = renderTabStrip(catMap);
                if (cats.length > 0) renderCatContent(catMap[cats[0]], cats[0]);
                if (tabStrip) tabStrip.onclick = function (e) {
                    var btn = e.target.closest('.va-tab');
                    if (!btn) return;
                    Array.prototype.forEach.call(tabStrip.querySelectorAll('.va-tab'), function (t) { t.classList.remove('active'); });
                    btn.classList.add('active');
                    var cat = btn.getAttribute('data-cat');
                    if (catMap[cat]) renderCatContent(catMap[cat], cat);
                };
            }

            if (analyticsBtn) analyticsBtn.addEventListener('click', function () {
                renderAnalytics();
                openModal('t95-analytics-modal');
            });
            if (analyticsClose) analyticsClose.addEventListener('click', function () { closeModal('t95-analytics-modal'); });
            if (analyticsModal) analyticsModal.addEventListener('click', function (e) { if (e.target === analyticsModal) closeModal('t95-analytics-modal'); });
        }
    }

    ready(initTab95);

    if (!window.__blsTab95PageLoadedBound) {
        window.__blsTab95PageLoadedBound = true;
        document.addEventListener('blossom:pageLoaded', function () {
            initTab95();
        });
    }
})();

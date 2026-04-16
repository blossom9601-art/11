/*
 * tab43-hw-model.js  v1.5
 * 하드웨어 상세 – 하드웨어 탭 (read-only model-based lookup).
 * hardware 테이블에서 동일 server_code(모델)를 가진 자산 조회.
 * Columns: 유형, 업무운영, 업무그룹, 업무명, 시스템명, 일련번호, 펌웨어, 할당수량
 */
(function () {
	'use strict';

	function ready(fn) {
		if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
		else fn();
	}
	function dash(v) { var s = String(v == null ? '' : v).trim(); return s || '-'; }
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

	/* Resolve server_code from the table data attribute, URL, or sessionStorage */
	function getServerCode() {
		var table = document.getElementById('hw-spec-table');
		if (table) {
			var sc = (table.getAttribute('data-server-code') || '').trim();
			if (sc && sc !== 'None') return sc;
		}
		/* URL query param */
		try {
			var qs = new URLSearchParams(window.location.search || '');
			var sc2 = (qs.get('server_code') || '').trim();
			if (sc2) return sc2;
		} catch (_) { }
		/* sessionStorage (set by list page) */
		var STORAGE_KEYS = ['server_selected_row', 'storage_selected_row', 'san_selected_row', 'network_selected_row', 'security_selected_row'];
		for (var i = 0; i < STORAGE_KEYS.length; i++) {
			try {
				var raw = sessionStorage.getItem(STORAGE_KEYS[i]);
				if (raw) { var obj = JSON.parse(raw); if (obj && obj.server_code) return String(obj.server_code); }
			} catch (_) { }
		}
		return '';
	}

	/* Fallback: resolve model name from page title for model-based query */
	function getModelName() {
		var titleEl = document.getElementById('page-header-title');
		if (titleEl) {
			var t = (titleEl.textContent || '').trim();
			if (t && t !== '서버' && t !== '스토리지' && t !== 'SAN' && t !== '네트워크' && t !== '보안장비' && t !== '모델명') return t;
		}
		return '';
	}

	function initTab43() {
		var table = document.getElementById('hw-spec-table');
		if (!table) { console.log('[tab43-hw-model] table #hw-spec-table not found'); return; }
		var ctx = (table.getAttribute('data-context') || '').toLowerCase();
		if (ctx !== 'hw-model-assets') { console.log('[tab43-hw-model] data-context mismatch:', ctx); return; }

		/* Guard: if already initialized on this exact table element, just reload data */
		if (table.dataset && table.dataset.tab43Init === '1') {
			console.log('[tab43-hw-model] already initialized, reloading data only');
			var evt = new CustomEvent('tab43:reload');
			table.dispatchEvent(evt);
			return;
		}
		try { if (table.dataset) table.dataset.tab43Init = '1'; } catch (_) { }

		var modelName = getModelName();
		var serverCode = getServerCode();
		console.log('[tab43-hw-model] init: serverCode=' + serverCode + ', modelName=' + modelName + ', data-server-code=' + (table.getAttribute('data-server-code') || ''));
		var tbody = table.querySelector('tbody') || table.appendChild(document.createElement('tbody'));
		var emptyEl = document.getElementById('hw-empty');
		var selectAll = document.getElementById('hw-select-all');
		var csvBtn = document.getElementById('hw-download-btn');
		var pageSizeSel = document.getElementById('hw-page-size');
		var infoEl = document.getElementById('hw-pagination-info');
		var numsWrap = document.getElementById('hw-page-numbers');
		var btnFirst = document.getElementById('hw-first');
		var btnPrev = document.getElementById('hw-prev');
		var btnNext = document.getElementById('hw-next');
		var btnLast = document.getElementById('hw-last');
		var state = { page: 1, pageSize: 10 };

		/* page-size persistence */
		(function () {
			try {
				var saved = localStorage.getItem('hw-model:pageSize');
				if (pageSizeSel && saved && ['10', '20', '50', '100'].indexOf(saved) > -1) { state.pageSize = parseInt(saved, 10); pageSizeSel.value = saved; }
				if (pageSizeSel) pageSizeSel.addEventListener('change', function () { var v = parseInt(pageSizeSel.value, 10); if (!isNaN(v)) { state.page = 1; state.pageSize = v; localStorage.setItem('hw-model:pageSize', String(v)); renderPage(); } });
			} catch (_) { }
		})();

		function allRows() { return Array.from(tbody.querySelectorAll('tr')); }
		function totalRows() { return allRows().length; }
		function totalPages() { return Math.max(1, Math.ceil(totalRows() / Math.max(1, state.pageSize))); }
		function clamp() { if (state.page > totalPages()) state.page = totalPages(); if (state.page < 1) state.page = 1; }

		function updatePagination() {
			if (infoEl) { var t = totalRows(), s = t ? (state.page - 1) * state.pageSize + 1 : 0, e = Math.min(t, state.page * state.pageSize); infoEl.textContent = s + '-' + e + ' / ' + t + '개 항목'; }
			if (numsWrap) { var p = totalPages(); numsWrap.innerHTML = ''; for (var i = 1; i <= p && i <= 50; i++) { var b = document.createElement('button'); b.className = 'page-btn' + (i === state.page ? ' active' : ''); b.textContent = String(i); b.dataset.page = String(i); numsWrap.appendChild(b); } }
			if (btnFirst) btnFirst.disabled = (state.page === 1);
			if (btnPrev) btnPrev.disabled = (state.page === 1);
			if (btnNext) btnNext.disabled = (state.page === totalPages());
			if (btnLast) btnLast.disabled = (state.page === totalPages());
		}

		function renderPage() {
			clamp();
			var list = allRows(), s = (state.page - 1) * state.pageSize, e = s + state.pageSize - 1;
			list.forEach(function (tr, idx) { var vis = idx >= s && idx <= e; tr.style.display = vis ? '' : 'none'; if (vis) tr.removeAttribute('data-hidden'); else tr.setAttribute('data-hidden', '1'); });
			updatePagination();
			if (selectAll) { var vc = table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check'); selectAll.checked = vc.length ? Array.prototype.every.call(vc, function (c) { return c.checked; }) : false; }
		}

		function go(p) { state.page = p; renderPage(); }
		if (numsWrap) numsWrap.addEventListener('click', function (e) { var b = e.target.closest('button.page-btn'); if (b) go(parseInt(b.dataset.page, 10)); });
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

		/* checkbox */
		if (selectAll) selectAll.addEventListener('change', function () {
			table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check:not([disabled])').forEach(function (c) { c.checked = !!selectAll.checked; c.closest('tr').classList.toggle('selected', !!c.checked); });
		});
		table.addEventListener('click', function (ev) {
			var onCb = ev.target.closest('input[type="checkbox"].hw-row-check');
			if (onCb) { var tr0 = onCb.closest('tr'); if (tr0) tr0.classList.toggle('selected', !!onCb.checked); if (selectAll) { var vc = table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check'); selectAll.checked = vc.length ? Array.prototype.every.call(vc, function (c) { return c.checked; }) : false; } return; }
			if (ev.target.closest('button, a, input, select, textarea, label')) return;
			var tr = ev.target.closest('tr');
			if (!tr || !tr.parentNode || tr.parentNode.tagName.toLowerCase() !== 'tbody') return;
			if (tr.hasAttribute('data-hidden') || tr.style.display === 'none') return;
			var cb = tr.querySelector('.hw-row-check'); if (!cb || cb.disabled) return;
			cb.checked = !cb.checked; tr.classList.toggle('selected', !!cb.checked);
			if (selectAll) { var vc2 = table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check'); selectAll.checked = vc2.length ? Array.prototype.every.call(vc2, function (c) { return c.checked; }) : false; }
		});

		/* sort state */
		var sortState = { col: null, dir: 'asc' };

		function sortRows() {
			var col = sortState.col;
			if (!col) return;
			var rows = allRows();
			rows.sort(function (a, b) {
				var aEl = a.querySelector('[data-col="' + col + '"]');
				var bEl = b.querySelector('[data-col="' + col + '"]');
				var aVal = aEl ? (aEl.textContent || '').trim() : '';
				var bVal = bEl ? (bEl.textContent || '').trim() : '';
				if (col === 'qty') {
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

		table.querySelector('thead').addEventListener('click', function (ev) {
			var th = ev.target.closest('th[data-sort-col]');
			if (!th) return;
			var col = th.getAttribute('data-sort-col');
			if (sortState.col === col) { sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc'; }
			else { sortState.col = col; sortState.dir = 'asc'; }
			updateSortIndicators();
			sortRows();
		});

		/* render rows */
		function renderRows(items) {
			tbody.innerHTML = '';
			(items || []).forEach(function (it) {
				var tr = document.createElement('tr');
				tr.innerHTML =
					'<td><input type="checkbox" class="hw-row-check" aria-label="행 선택"></td>' +
					'<td data-col="category">' + dash(it.category) + '</td>' +
					'<td data-col="type">' + dash(it.type) + '</td>' +
					'<td data-col="work_operation">' + dash(it.work_operation) + '</td>' +
					'<td data-col="work_group">' + dash(it.work_group) + '</td>' +
					'<td data-col="work_name">' + statusDotHTML(it.work_status_color) + ' ' + dash(it.work_name) + '</td>' +
					'<td data-col="system_name">' + dash(it.system_name) + '</td>' +
					'<td data-col="serial_number">' + dash(it.serial_number) + '</td>' +
					'<td data-col="firmware">' + dash(it.firmware) + '</td>' +
					'<td data-col="qty">' + (it.qty != null ? String(it.qty) : '-') + '</td>';
				tbody.appendChild(tr);
			});
			if (sortState.col) { sortRows(); } else { go(1); }
			updateEmpty();
		}

		var lastLoadedItems = [];

		/* fetch */
		function loadData() {
			serverCode = getServerCode();
			modelName = getModelName();
			var params = [];
			if (serverCode) params.push('server_code=' + encodeURIComponent(serverCode));
			else if (modelName) params.push('model=' + encodeURIComponent(modelName));
			var param = params.join('&');
			console.log('[tab43-hw-model] loadData: serverCode=' + serverCode + ', modelName=' + modelName + ', param=' + param);
			if (!param) { console.log('[tab43-hw-model] loadData: no param, showing empty'); lastLoadedItems = []; updateEmpty(); return; }
			fetch('/api/hardware/model-assets?' + param, { credentials: 'same-origin' })
				.then(function (r) { return r.json(); })
				.then(function (data) { if (data && data.success) { lastLoadedItems = data.items || []; renderRows(lastLoadedItems); } else { lastLoadedItems = []; updateEmpty(); } })
				.catch(function () { lastLoadedItems = []; updateEmpty(); });
		}
		loadData();

		/* Allow SPA re-entry to trigger data reload via custom event */
		table.addEventListener('tab43:reload', function () {
			console.log('[tab43-hw-model] tab43:reload event received');
			loadData();
		});

		/* CSV */
		if (csvBtn) csvBtn.addEventListener('click', function () { openModal('hw-download-modal'); });
		var csvClose = document.getElementById('hw-download-close');
		var csvModal = document.getElementById('hw-download-modal');
		if (csvClose) csvClose.addEventListener('click', function () { closeModal('hw-download-modal'); });
		if (csvModal) csvModal.addEventListener('click', function (e) { if (e.target === csvModal) closeModal('hw-download-modal'); });

		var csvConfirm = document.getElementById('hw-download-confirm');
		if (csvConfirm) csvConfirm.addEventListener('click', function () {
			var rangeAll = document.getElementById('hw-csv-range-all');
			var all = !rangeAll || rangeAll.checked;
			var list = allRows();
			if (!all) list = list.filter(function (tr) { var cb = tr.querySelector('.hw-row-check'); return cb && cb.checked; });
			if (!list.length) { toast('내보낼 행이 없습니다.', 'warning'); return; }
			var header = [escapeCSV('구분'), escapeCSV('유형'), escapeCSV('업무운영'), escapeCSV('업무그룹'), escapeCSV('업무명'), escapeCSV('시스템명'), escapeCSV('일련번호'), escapeCSV('펌웨어'), escapeCSV('할당수량')].join(',');
			var lines = [header];
			list.forEach(function (tr) {
				function cell(col) { var td = tr.querySelector('[data-col="' + col + '"]'); return td ? (td.textContent || '').trim() : ''; }
				lines.push([escapeCSV(cell('category')), escapeCSV(cell('type')), escapeCSV(cell('work_operation')), escapeCSV(cell('work_group')), escapeCSV(cell('work_name')), escapeCSV(cell('system_name')), escapeCSV(cell('serial_number')), escapeCSV(cell('firmware')), escapeCSV(cell('qty'))].join(','));
			});
			downloadCSV('hardware_model_assets.csv', lines);
			closeModal('hw-download-modal');
			toast('CSV 다운로드가 완료되었습니다.', 'success');
		});

		/* ===== 통계 분석 모달 (구분 탭 + 유형별 모델 차트) ===== */
		var analyticsBtn = document.getElementById('hw-analytics-btn');
		var analyticsModal = document.getElementById('hw-analytics-modal');
		var analyticsClose = document.getElementById('hw-analytics-close');
		var analyticsEmpty = document.getElementById('hw-analytics-empty');
		var tabStrip = document.getElementById('hw-tab-strip');
		var tabContent = document.getElementById('hw-tab-content');

		function buildCatMap(items) {
			var map = {};
			(items || []).forEach(function (it) {
				var cat = (it.category || '').trim() || '-';
				var type = (it.type || '').trim() || '-';
				var wg = (it.work_group || '').trim() || '-';
				if (!map[cat]) map[cat] = { count: 0, types: {} };
				map[cat].count++;
				if (!map[cat].types[type]) map[cat].types[type] = { count: 0, groups: {} };
				map[cat].types[type].count++;
				map[cat].types[type].groups[wg] = (map[cat].types[type].groups[wg] || 0) + 1;
			});
			return map;
		}

		/* fixed display orders */
		var TAB_ORDER = ['서버','스토리지','SAN','네트워크','보안장비'];
		var TYPE_ORDER = {
			'서버': ['온프레미스','클라우드','프레임','워크스테이션'],
			'스토리지': ['스토리지','백업장치'],
			'SAN': ['SAN 디렉터','SAN 스위치'],
			'네트워크': ['L2','L3','L4','L7','무선장비','회선장비'],
			'보안장비': ['방화벽','VPN','IDS','IPS','HSM','KMS','WIPS','기타']
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

		/* stacked bar colour palette (muted, 10 colours) */
		var SB_COLORS = ['#6366F1','#3b82f6','#0ea5e9','#14b8a6','#22c55e','#eab308','#f97316','#ef4444','#a855f7','#94a3b8'];

		/* floating tooltip element (shared) */
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
				/* Top 9 + 기타 */
				var groups = Object.keys(td.groups).sort(function (a, b) { return td.groups[b] - td.groups[a]; });
				var segs = [];
				var etcCount = 0;
				groups.forEach(function (g, i) {
					if (i < 9) { segs.push({ name: g, count: td.groups[g] }); }
					else { etcCount += td.groups[g]; }
				});
				if (etcCount > 0) segs.push({ name: '기타 (' + (groups.length - 9) + '종)', count: etcCount });
				/* stacked bar */
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
				/* legend chips */
				html += '<div class="va-sb-legend">';
				segs.forEach(function (seg, si) {
					var col = SB_COLORS[si % SB_COLORS.length];
					html += '<span class="va-sb-chip"><span class="va-sb-dot" style="background:' + col + '"></span>' + seg.name + ' <b>' + seg.count + '</b></span>';
				});
				html += '</div>';
				html += '</div>';
			});
			tabContent.innerHTML = html;

			/* tooltip handlers via delegation */
			tabContent.addEventListener('mouseover', function (e) {
				var seg = e.target.closest('.va-sb-seg');
				if (!seg) return;
				sbTip.innerHTML = '<span class="va-sb-tip-dot" style="background:' + seg.dataset.color + '"></span>'
					+ '<span class="va-sb-tip-name">' + seg.dataset.name + '</span>'
					+ '<span class="va-sb-tip-val">' + seg.dataset.count + '건 (' + seg.dataset.pct + '%)</span>';
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
			var total = items.length;
			if (!total) {
				if (analyticsEmpty) analyticsEmpty.style.display = '';
				if (tabStrip) tabStrip.innerHTML = '';
				if (tabContent) tabContent.innerHTML = '';
				return;
			}
			if (analyticsEmpty) analyticsEmpty.style.display = 'none';
			var catMap = buildCatMap(items);
			var cats = renderTabStrip(catMap);
			if (cats.length > 0) renderCatContent(catMap[cats[0]], cats[0]);
			/* tab click */
			if (tabStrip) tabStrip.onclick = function (e) {
				var btn = e.target.closest('.va-tab');
				if (!btn) return;
				tabStrip.querySelectorAll('.va-tab').forEach(function (t) { t.classList.remove('active'); });
				btn.classList.add('active');
				var cat = btn.getAttribute('data-cat');
				if (catMap[cat]) renderCatContent(catMap[cat], cat);
			};
		}

		if (analyticsBtn) analyticsBtn.addEventListener('click', function () {
			renderAnalytics();
			openModal('hw-analytics-modal');
		});
		if (analyticsClose) analyticsClose.addEventListener('click', function () { closeModal('hw-analytics-modal'); });
		if (analyticsModal) analyticsModal.addEventListener('click', function (e) { if (e.target === analyticsModal) closeModal('hw-analytics-modal'); });
	}

	ready(initTab43);

	/* SPA re-entry — must live OUTSIDE initTab43 so it is always registered */
	if (!window.__blsTab43PageLoadedBound) {
		window.__blsTab43PageLoadedBound = true;
		document.addEventListener('blossom:pageLoaded', function () {
			console.log('[tab43-hw-model] blossom:pageLoaded fired, re-running initTab43');
			initTab43();
		});
	}
})();

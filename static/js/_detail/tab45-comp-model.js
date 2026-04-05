/*
 * tab45-comp-model.js  v1.0
 * 카테고리 > 컴포넌트 상세 – 컴포넌트 탭 (read-only model-based lookup).
 * server_hw_component 테이블에서 동일 모델명(model)을 가진 자산 조회.
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

	/* Resolve model name from page title */
	function getModelName() {
		var titleEl = document.getElementById('page-header-title');
		if (titleEl) {
			var t = (titleEl.textContent || '').trim();
			if (t && t !== '모델명') return t;
		}
		return '';
	}

	function initTab45() {
		var table = document.getElementById('comp-spec-table');
		if (!table) { console.log('[tab45-comp-model] table #comp-spec-table not found'); return; }
		var ctx = (table.getAttribute('data-context') || '').toLowerCase();
		if (ctx !== 'comp-model-assets') { console.log('[tab45-comp-model] data-context mismatch:', ctx); return; }

		if (table.dataset && table.dataset.tab45Init === '1') {
			console.log('[tab45-comp-model] already initialized, reloading data only');
			var evt = new CustomEvent('tab45:reload');
			table.dispatchEvent(evt);
			return;
		}
		try { if (table.dataset) table.dataset.tab45Init = '1'; } catch (_) { }

		var modelName = getModelName();
		console.log('[tab45-comp-model] init: modelName=' + modelName);
		var tbody = table.querySelector('tbody') || table.appendChild(document.createElement('tbody'));
		var emptyEl = document.getElementById('comp-empty');
		var selectAll = document.getElementById('comp-select-all');
		var csvBtn = document.getElementById('comp-download-btn');
		var pageSizeSel = document.getElementById('comp-page-size');
		var infoEl = document.getElementById('comp-pagination-info');
		var numsWrap = document.getElementById('comp-page-numbers');
		var btnFirst = document.getElementById('comp-first');
		var btnPrev = document.getElementById('comp-prev');
		var btnNext = document.getElementById('comp-next');
		var btnLast = document.getElementById('comp-last');
		var state = { page: 1, pageSize: 10 };

		/* page-size persistence */
		(function () {
			try {
				var saved = localStorage.getItem('comp-model:pageSize');
				if (pageSizeSel && saved && ['10', '20', '50', '100'].indexOf(saved) > -1) { state.pageSize = parseInt(saved, 10); pageSizeSel.value = saved; }
				if (pageSizeSel) pageSizeSel.addEventListener('change', function () { var v = parseInt(pageSizeSel.value, 10); if (!isNaN(v)) { state.page = 1; state.pageSize = v; localStorage.setItem('comp-model:pageSize', String(v)); renderPage(); } });
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
			if (selectAll) { var vc = table.querySelectorAll('tbody tr:not([data-hidden]) .comp-row-check'); selectAll.checked = vc.length ? Array.prototype.every.call(vc, function (c) { return c.checked; }) : false; }
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
			table.querySelectorAll('tbody tr:not([data-hidden]) .comp-row-check:not([disabled])').forEach(function (c) { c.checked = !!selectAll.checked; c.closest('tr').classList.toggle('selected', !!c.checked); });
		});
		table.addEventListener('click', function (ev) {
			var onCb = ev.target.closest('input[type="checkbox"].comp-row-check');
			if (onCb) { var tr0 = onCb.closest('tr'); if (tr0) tr0.classList.toggle('selected', !!onCb.checked); if (selectAll) { var vc = table.querySelectorAll('tbody tr:not([data-hidden]) .comp-row-check'); selectAll.checked = vc.length ? Array.prototype.every.call(vc, function (c) { return c.checked; }) : false; } return; }
			if (ev.target.closest('button, a, input, select, textarea, label')) return;
			var tr = ev.target.closest('tr');
			if (!tr || !tr.parentNode || tr.parentNode.tagName.toLowerCase() !== 'tbody') return;
			if (tr.hasAttribute('data-hidden') || tr.style.display === 'none') return;
			var cb = tr.querySelector('.comp-row-check'); if (!cb || cb.disabled) return;
			cb.checked = !cb.checked; tr.classList.toggle('selected', !!cb.checked);
			if (selectAll) { var vc2 = table.querySelectorAll('tbody tr:not([data-hidden]) .comp-row-check'); selectAll.checked = vc2.length ? Array.prototype.every.call(vc2, function (c) { return c.checked; }) : false; }
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
					'<td><input type="checkbox" class="comp-row-check" aria-label="행 선택"></td>' +
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
			modelName = getModelName();
			console.log('[tab45-comp-model] loadData: modelName=' + modelName);
			if (!modelName) { console.log('[tab45-comp-model] loadData: no model, showing empty'); lastLoadedItems = []; updateEmpty(); return; }
			fetch('/api/category/comp-model-assets?model=' + encodeURIComponent(modelName), { credentials: 'same-origin' })
				.then(function (r) { return r.json(); })
				.then(function (data) { if (data && data.success) { lastLoadedItems = data.items || []; renderRows(lastLoadedItems); } else { lastLoadedItems = []; updateEmpty(); } })
				.catch(function () { lastLoadedItems = []; updateEmpty(); });
		}
		loadData();

		/* Allow SPA re-entry to trigger data reload via custom event */
		table.addEventListener('tab45:reload', function () {
			console.log('[tab45-comp-model] tab45:reload event received');
			loadData();
		});

		/* CSV */
		if (csvBtn) csvBtn.addEventListener('click', function () { openModal('comp-download-modal'); });
		var csvClose = document.getElementById('comp-download-close');
		var csvModal = document.getElementById('comp-download-modal');
		if (csvClose) csvClose.addEventListener('click', function () { closeModal('comp-download-modal'); });
		if (csvModal) csvModal.addEventListener('click', function (e) { if (e.target === csvModal) closeModal('comp-download-modal'); });

		var csvConfirm = document.getElementById('comp-download-confirm');
		if (csvConfirm) csvConfirm.addEventListener('click', function () {
			var rangeAll = document.getElementById('comp-csv-range-all');
			var all = !rangeAll || rangeAll.checked;
			var list = allRows();
			if (!all) list = list.filter(function (tr) { var cb = tr.querySelector('.comp-row-check'); return cb && cb.checked; });
			if (!list.length) { toast('내보낼 행이 없습니다.', 'warning'); return; }
			var header = [escapeCSV('구분'), escapeCSV('유형'), escapeCSV('업무운영'), escapeCSV('업무그룹'), escapeCSV('업무명'), escapeCSV('시스템명'), escapeCSV('일련번호'), escapeCSV('펌웨어'), escapeCSV('할당수량')].join(',');
			var lines = [header];
			list.forEach(function (tr) {
				function cell(col) { var td = tr.querySelector('[data-col="' + col + '"]'); return td ? (td.textContent || '').trim() : ''; }
				lines.push([escapeCSV(cell('category')), escapeCSV(cell('type')), escapeCSV(cell('work_operation')), escapeCSV(cell('work_group')), escapeCSV(cell('work_name')), escapeCSV(cell('system_name')), escapeCSV(cell('serial_number')), escapeCSV(cell('firmware')), escapeCSV(cell('qty'))].join(','));
			});
			downloadCSV('컴포넌트_자산_' + (modelName || 'export') + '.csv', lines);
			closeModal('comp-download-modal');
			toast('CSV 다운로드가 완료되었습니다.', 'success');
		});

		/* ===== 통계 분석 모달 (구분 탭 + 유형별 업무그룹 차트) ===== */
		var analyticsBtn = document.getElementById('comp-analytics-btn');
		var analyticsModal = document.getElementById('comp-analytics-modal');
		var analyticsClose = document.getElementById('comp-analytics-close');
		var analyticsEmpty = document.getElementById('comp-analytics-empty');
		var tabStrip = document.getElementById('comp-tab-strip');
		var tabContent = document.getElementById('comp-tab-content');

		function buildCatMap(items) {
			var map = {};
			(items || []).forEach(function (it) {
				var cat = (it.category || '').trim() || '-';
				var type = (it.type || '').trim() || '-';
				if (!map[cat]) map[cat] = { count: 0, models: {} };
				map[cat].count++;
				map[cat].models[type] = (map[cat].models[type] || 0) + 1;
			});
			return map;
		}

		var TAB_ORDER = ['서버','스토리지','SAN','네트워크','보안장비'];

		function renderTabStrip2(catMap) {
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

		var DONUT_COLORS = ['#6366F1','#3b82f6','#0ea5e9','#14b8a6','#22c55e','#eab308','#f97316','#ef4444','#a855f7','#94a3b8'];

		var donutTip = document.createElement('div');
		donutTip.className = 'va-sb-tooltip';
		donutTip.style.display = 'none';
		document.body.appendChild(donutTip);

		function renderCatContent2(catData) {
			if (!tabContent) return;
			var models = Object.keys(catData.models).sort(function (a, b) { return catData.models[b] - catData.models[a]; });
			var segs = [], etcCount = 0;
			models.forEach(function (m, i) {
				if (i < 9) { segs.push({ name: m, count: catData.models[m] }); }
				else { etcCount += catData.models[m]; }
			});
			if (etcCount > 0) segs.push({ name: '기타 (' + (models.length - 9) + '종)', count: etcCount });

			var total = catData.count, R = 120, r = 76, cx = 140, cy = 140, svgSize = 280;
			var paths = '', angle = -90;
			segs.forEach(function (seg, si) {
				var pct = total > 0 ? (seg.count / total) : 0;
				var sweep = pct * 360;
				if (sweep <= 0) return;
				var col = DONUT_COLORS[si % DONUT_COLORS.length];
				var pctStr = (pct * 100).toFixed(1);
				if (sweep >= 359.99) {
					paths += '<path d="M' + cx + ',' + (cy - R)
						+ ' A' + R + ',' + R + ' 0 1,1 ' + cx + ',' + (cy + R)
						+ ' A' + R + ',' + R + ' 0 1,1 ' + cx + ',' + (cy - R)
						+ ' M' + cx + ',' + (cy - r)
						+ ' A' + r + ',' + r + ' 0 1,0 ' + cx + ',' + (cy + r)
						+ ' A' + r + ',' + r + ' 0 1,0 ' + cx + ',' + (cy - r)
						+ 'Z" fill="' + col + '" class="va-donut-seg"'
						+ ' data-name="' + seg.name.replace(/"/g, '&quot;') + '"'
						+ ' data-count="' + seg.count + '" data-pct="' + pctStr + '" data-color="' + col + '"/>';
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
						+ 'Z" fill="' + col + '" class="va-donut-seg"'
						+ ' data-name="' + seg.name.replace(/"/g, '&quot;') + '"'
						+ ' data-count="' + seg.count + '" data-pct="' + pctStr + '" data-color="' + col + '"/>';
				}
				angle += sweep;
			});

			var html = '<div class="va-donut-wrap">';
			html += '<div class="va-donut-chart">';
			html += '<svg viewBox="0 0 ' + svgSize + ' ' + svgSize + '">' + paths + '</svg>';
			html += '<div class="va-donut-center"><span class="va-donut-total">' + total + '</span><span class="va-donut-label">건</span></div>';
			html += '</div>';
			html += '<div class="va-donut-legend">';
			segs.forEach(function (seg, si) {
				var col = DONUT_COLORS[si % DONUT_COLORS.length];
				var pct = total > 0 ? (seg.count / total * 100).toFixed(1) : '0.0';
				html += '<div class="va-donut-legend-item" data-name="' + seg.name.replace(/"/g, '&quot;') + '" data-count="' + seg.count + '" data-pct="' + pct + '" data-color="' + col + '">';
				html += '<span class="va-donut-ldot" style="background:' + col + '"></span>';
				html += '<span class="va-donut-lname">' + seg.name + '</span>';
				html += '<span class="va-donut-lval">' + seg.count + '</span>';
				html += '<span class="va-donut-lpct">' + pct + '%</span>';
				html += '</div>';
			});
			html += '</div></div>';
			tabContent.innerHTML = html;

			tabContent.addEventListener('mouseover', function (e) {
				var seg = e.target.closest('.va-donut-seg');
				if (!seg) return;
				donutTip.innerHTML = '<span class="va-sb-tip-dot" style="background:' + seg.dataset.color + '"></span>'
					+ '<span class="va-sb-tip-name">' + seg.dataset.name + '</span>'
					+ '<span class="va-sb-tip-val">' + seg.dataset.count + '건 (' + seg.dataset.pct + '%)</span>';
				donutTip.style.display = '';
			});
			tabContent.addEventListener('mousemove', function (e) {
				if (donutTip.style.display === 'none') return;
				donutTip.style.left = (e.clientX + 12) + 'px';
				donutTip.style.top = (e.clientY - 36) + 'px';
			});
			tabContent.addEventListener('mouseout', function (e) {
				var seg = e.target.closest('.va-donut-seg');
				if (seg) donutTip.style.display = 'none';
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
			var cats = renderTabStrip2(catMap);
			if (cats.length > 0) renderCatContent2(catMap[cats[0]]);
			if (tabStrip) tabStrip.onclick = function (e) {
				var btn = e.target.closest('.va-tab');
				if (!btn) return;
				tabStrip.querySelectorAll('.va-tab').forEach(function (t) { t.classList.remove('active'); });
				btn.classList.add('active');
				var cat = btn.getAttribute('data-cat');
				if (catMap[cat]) renderCatContent2(catMap[cat]);
			};
		}

		if (analyticsBtn) analyticsBtn.addEventListener('click', function () {
			renderAnalytics();
			openModal('comp-analytics-modal');
		});
		if (analyticsClose) analyticsClose.addEventListener('click', function () { closeModal('comp-analytics-modal'); });
		if (analyticsModal) analyticsModal.addEventListener('click', function (e) { if (e.target === analyticsModal) closeModal('comp-analytics-modal'); });
	}

	ready(initTab45);
	// SPA 라우팅/탭 이동 시에도 항상 데이터가 새로 로드되도록 보강
	document.addEventListener('blossom:pageLoaded', function() {
		// 컴포넌트 탭이 활성화된 경우에만 실행
		var tab = document.querySelector('.server-detail-tab-btn.active');
		if (tab && tab.textContent && tab.textContent.includes('컴포넌트')) {
			setTimeout(function() { try { initTab45(); } catch (e) {} }, 0);
		}
	});
})();

/*
 * maint-vendor-assets.js  v1.1
 * Maintenance vendor – 하드웨어 / 소프트웨어 / 컴포넌트 탭 (read-only OPEX lookup).
 * Columns: 구분, 유형, 모델명, 일련번호, 업무 이름, 시스템 이름, 관리번호, 할당수량
 */
(function () {
	'use strict';

	function ready(fn) {
		if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
		else fn();
	}
	function dash(v) { var s = String(v == null ? '' : v).trim(); return s || '-'; }
	function statusDot(color) {
		var bg = color || '#6b7280';
		return '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;vertical-align:middle;margin-right:6px;background:' + bg + '" aria-hidden="true"></span>';
	}
	function toInt(v) { var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }
	function toast(msg, level) {
		try { if (window.showToast) window.showToast(String(msg || ''), level || 'error'); else alert(String(msg || '')); } catch (_) { }
	}
	function getVendorId() {
		try { var raw = sessionStorage.getItem('maintenance:context'); if (!raw) return 0; return toInt(JSON.parse(raw).id); } catch (_) { return 0; }
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

	/* context → API path segment mapping */
	var CTX_MAP = {
		'maint-hw-assets': { api: 'hw-assets', label: '하드웨어', file: 'maintenance_hw' },
		'maint-sw-assets': { api: 'sw-assets', label: '소프트웨어', file: 'maintenance_sw' },
		'maint-co-assets': { api: 'comp-assets', label: '컴포넌트', file: 'maintenance_comp' }
	};

	function init() {
		var table = document.getElementById('hw-spec-table');
		if (!table) return;
		var ctx = (table.getAttribute('data-context') || '').toLowerCase();
		var cfg = CTX_MAP[ctx];
		if (!cfg) return;

		var vendorId = getVendorId();
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
				var storeKey = 'maint:' + cfg.api + ':pageSize';
				var saved = localStorage.getItem(storeKey);
				if (pageSizeSel && saved && ['10', '20', '50', '100'].indexOf(saved) > -1) { state.pageSize = parseInt(saved, 10); pageSizeSel.value = saved; }
				if (pageSizeSel) pageSizeSel.addEventListener('change', function () {
					var v = parseInt(pageSizeSel.value, 10);
					if (!isNaN(v)) { state.page = 1; state.pageSize = v; localStorage.setItem(storeKey, String(v)); renderPage(); }
				});
			} catch (_) { }
		})();

		function allRows() { return Array.from(tbody.querySelectorAll('tr')); }
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
					var b = document.createElement('button'); b.className = 'page-btn' + (i === state.page ? ' active' : '');
					b.textContent = String(i); b.dataset.page = String(i); numsWrap.appendChild(b);
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
				var vc = table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check');
				selectAll.checked = vc.length ? Array.prototype.every.call(vc, function (c) { return c.checked; }) : false;
			}
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
			table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check:not([disabled])').forEach(function (c) {
				c.checked = !!selectAll.checked; c.closest('tr').classList.toggle('selected', !!c.checked);
			});
		});
		table.addEventListener('click', function (ev) {
			var onCb = ev.target.closest('input[type="checkbox"].hw-row-check');
			if (onCb) {
				var tr0 = onCb.closest('tr'); if (tr0) tr0.classList.toggle('selected', !!onCb.checked);
				if (selectAll) { var vc = table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check'); selectAll.checked = vc.length ? Array.prototype.every.call(vc, function (c) { return c.checked; }) : false; }
				return;
			}
			if (ev.target.closest('button, a, input, select, textarea, label')) return;
			var tr = ev.target.closest('tr');
			if (!tr || !tr.parentNode || tr.parentNode.tagName.toLowerCase() !== 'tbody') return;
			if (tr.hasAttribute('data-hidden') || tr.style.display === 'none') return;
			var cb = tr.querySelector('.hw-row-check'); if (!cb || cb.disabled) return;
			cb.checked = !cb.checked; tr.classList.toggle('selected', !!cb.checked);
			if (selectAll) { var vc2 = table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check'); selectAll.checked = vc2.length ? Array.prototype.every.call(vc2, function (c) { return c.checked; }) : false; }
		});

		/* sort */
		var sortState = { col: null, dir: 'asc' };
		function sortRows() {
			var col = sortState.col; if (!col) return;
			var rows = allRows();
			rows.sort(function (a, b) {
				var aEl = a.querySelector('[data-col="' + col + '"]');
				var bEl = b.querySelector('[data-col="' + col + '"]');
				var aVal = aEl ? (aEl.textContent || '').trim() : '';
				var bVal = bEl ? (bEl.textContent || '').trim() : '';
				if (col === 'qty') { var aN = parseFloat(aVal) || 0, bN = parseFloat(bVal) || 0; return sortState.dir === 'asc' ? aN - bN : bN - aN; }
				var cmp = aVal.localeCompare(bVal, 'ko');
				return sortState.dir === 'asc' ? cmp : -cmp;
			});
			rows.forEach(function (tr) { tbody.appendChild(tr); });
			go(1);
		}
		function updateSortIndicators() {
			table.querySelectorAll('thead th.sortable').forEach(function (th) {
				th.classList.remove('sort-asc', 'sort-desc');
				if (th.getAttribute('data-sort-col') === sortState.col) th.classList.add(sortState.dir === 'asc' ? 'sort-asc' : 'sort-desc');
			});
		}
		table.querySelector('thead').addEventListener('click', function (ev) {
			var th = ev.target.closest('th[data-sort-col]'); if (!th) return;
			var col = th.getAttribute('data-sort-col');
			if (sortState.col === col) { sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc'; }
			else { sortState.col = col; sortState.dir = 'asc'; }
			updateSortIndicators(); sortRows();
		});

		/* render */
		function renderRows(items) {
			tbody.innerHTML = '';
			(items || []).forEach(function (it) {
				var tr = document.createElement('tr');
				tr.innerHTML =
					'<td><input type="checkbox" class="hw-row-check" aria-label="행 선택"></td>' +
					'<td data-col="category">' + dash(it.category) + '</td>' +
					'<td data-col="type">' + dash(it.type) + '</td>' +
					'<td data-col="model">' + dash(it.model) + '</td>' +
					'<td data-col="serial">' + dash(it.serial) + '</td>' +
					'<td data-col="work_name">' + statusDot(it.work_status_color) + dash(it.work_name) + '</td>' +
					'<td data-col="system_name">' + dash(it.system_name) + '</td>' +
					'<td data-col="manage_no">' + statusDot(it.contract_status_color) + dash(it.manage_no) + '</td>' +
					'<td data-col="qty">' + (it.qty != null ? String(it.qty) : '-') + '</td>';
				tbody.appendChild(tr);
			});
			if (sortState.col) { sortRows(); } else { go(1); }
			updateEmpty();
		}

		/* fetch */
		function loadData() {
			if (!vendorId) { updateEmpty(); return; }
			fetch('/api/vendor-maintenance/' + vendorId + '/' + cfg.api, { credentials: 'same-origin' })
				.then(function (r) { return r.json(); })
				.then(function (data) { if (data && data.success) { renderRows(data.items || []); } else { updateEmpty(); } })
				.catch(function () { updateEmpty(); });
		}
		loadData();

		/* SPA re-entry */
		document.addEventListener('blossom:pageLoaded', function () {
			var t2 = document.getElementById('hw-spec-table'); if (!t2) return;
			var c2 = (t2.getAttribute('data-context') || '').toLowerCase();
			if (!CTX_MAP[c2]) return;
			vendorId = getVendorId();
			sortState.col = null; sortState.dir = 'asc'; updateSortIndicators();
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
			var header = [escapeCSV('구분'), escapeCSV('유형'), escapeCSV('모델명'), escapeCSV('일련번호'), escapeCSV('업무 이름'), escapeCSV('시스템 이름'), escapeCSV('관리번호'), escapeCSV('할당수량')].join(',');
			var lines = [header];
			var cols = ['category', 'type', 'model', 'serial', 'work_name', 'system_name', 'manage_no', 'qty'];
			list.forEach(function (tr) {
				lines.push(cols.map(function (c) { var td = tr.querySelector('[data-col="' + c + '"]'); return escapeCSV(td ? (td.textContent || '').trim() : ''); }).join(','));
			});
			var d = new Date();
			downloadCSV(cfg.file + '_' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.csv', lines);
			closeModal('hw-download-modal');
			toast('CSV 다운로드가 완료되었습니다.', 'success');
		});
	}

	ready(init);
})();

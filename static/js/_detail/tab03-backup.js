/*
 * tab03-backup.js
 * Backup detail tab behavior.
 */

(function (global) {
	'use strict';

	

	

	

	// Utilities

	function $(id) {
		return document.getElementById(id);
	}

	function parsePositiveInt(value) {
		var n = parseInt(String(value), 10);
		return !isNaN(n) && n > 0 ? n : null;
	}

	function getStoragePrefix(storageKey) {
		try {
			var s = String(storageKey || '');
			var idx = s.indexOf(':');
			return idx > 0 ? s.slice(0, idx) : s;
		} catch (_e) {
			return '';
		}
	}

	// Modal

	

	

	

	function openModalLocal(id) {
		try {
			if (global.openModal) return global.openModal(id);
			var m = $(id);
			if (m) {
				m.classList.add('show');
				m.setAttribute('aria-hidden', 'false');
				document.body.classList.add('modal-open');
			}
		} catch (_e) {}
	}

	function closeModalLocal(id) {
		try {
			if (global.closeModal) return global.closeModal(id);
			var m = $(id);
			if (m) {
				m.classList.remove('show');
				m.setAttribute('aria-hidden', 'true');
				document.body.classList.remove('modal-open');
			}
		} catch (_e) {}
	}

	// API

	

	

	

	function apiJson(url, opts) {
		var o = opts || {};
		o.headers = Object.assign({ 'Content-Type': 'application/json' }, o.headers || {});
		return fetch(url, o).then(function (res) {
			return res
				.json()
				.catch(function () {
					return { success: false, message: 'Invalid JSON response' };
				})
				.then(function (body) {
					if (!res.ok) {
						body = body || {};
						body.success = false;
						body.httpStatus = res.status;
					}
					return body;
				});
		});
	}

	function textOrDash(val) {
		var v = val == null ? '' : String(val).trim();
		return v ? v : '-';
	}

	function escapeHTML(s) {
		return String(s == null ? '' : s)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function normalizeOX(raw) {
		try {
			var s = raw == null ? '' : String(raw);
			s = s.replace(/^\s+|\s+$/g, '').toUpperCase();
			if (!s) return '';
			if (s === 'O' || s === 'Y' || s === 'YES' || s === 'TRUE' || s === '1') return 'O';
			if (s === 'X' || s === 'N' || s === 'NO' || s === 'FALSE' || s === '0') return 'X';
			// keep legacy values if already O/X
			if (s.indexOf('O') === 0) return 'O';
			if (s.indexOf('X') === 0) return 'X';
			return '';
		} catch (_e) {
			return '';
		}
	}

	function renderOXBadge(raw) {
		var rawStr = raw == null ? '' : String(raw);
		var v = rawStr.replace(/^\s+|\s+$/g, '').toUpperCase();
		if (!v) {
			return '<span class="cell-ox with-badge">'
				+ '<span class="ox-badge" aria-label="미입력">-</span>'
				+ '</span>';
		}

		var ox = normalizeOX(v);
		if (!ox) return escapeHTML(rawStr);
		var on = ox === 'O';
		return '<span class="cell-ox with-badge">'
			+ '<span class="ox-badge ' + (on ? 'on' : 'off') + '" aria-label="' + (on ? '예' : '아니오') + '">' + ox + '</span>'
			+ '</span>';
	}

	function escapeCSV(val) {
		return '"' + String(val).replace(/"/g, '""') + '"';
	}

	function normalizeSystemName(raw) {
		try {
			var s = raw == null ? '' : String(raw);
			s = s.replace(/^\s+|\s+$/g, '');
			if (!s || s === '-' || s === '—') return '';
			// Some pages format subtitle as "업무 / 시스템"; use the last segment.
			if (s.indexOf('/') > -1) {
				var parts = s.split('/');
				s = String(parts[parts.length - 1] || '').replace(/^\s+|\s+$/g, '');
			}
			return s;
		} catch (_e) {
			return '';
		}
	}

	function getSystemNameFromSubtitle() {
		try {
			var el = document.getElementById('page-subtitle') || document.querySelector('.page-header p');
			return normalizeSystemName(el ? el.textContent : '');
		} catch (_e) {
			return '';
		}
	}

	function formatRetention(item) {
		try {
			var v = item && item.retention_value != null ? String(item.retention_value).trim() : '';
			var u = item && item.retention_unit != null ? String(item.retention_unit).trim() : '';
			if (!v && !u) return '-';
			if (v && u) return v + u;
			return (v || u) ? (v || u) : '-';
		} catch (_e) {
			return '-';
		}
	}

	function downloadCSV(filename, csvUtf8WithBom) {
		try {
			var blob = new Blob([csvUtf8WithBom], { type: 'text/csv;charset=utf-8;' });
			var url = URL.createObjectURL(blob);
			var a = document.createElement('a');
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		} catch (_e) {
			var a2 = document.createElement('a');
			a2.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvUtf8WithBom);
			a2.download = filename;
			document.body.appendChild(a2);
			a2.click();
			document.body.removeChild(a2);
		}
	}

	function defaultAssetIdGetter(storageKey) {
		try {
			var raw = sessionStorage.getItem(storageKey) || localStorage.getItem(storageKey);
			if (raw) {
				var row = JSON.parse(raw);
				var id = row && (row.id != null ? row.id : row.asset_id);
				var n = parsePositiveInt(id);
				if (n) return n;
			}
		} catch (_e) {}
		try {
			var params = new URLSearchParams(global.location.search || '');
			var rawId = params.get('id') || params.get('asset_id') || params.get('assetId');
			var n2 = parsePositiveInt(rawId);
			if (n2) return n2;
		} catch (_e2) {}
		return null;
	}

	function createViewRow(item) {
		var tr = document.createElement('tr');
		if (item && item.id != null) tr.setAttribute('data-policy-id', String(item.id));
		tr.innerHTML =
			'<td><input type="checkbox" class="bk-row-check" aria-label="행 선택"></td>' +
			'<td data-col="backup_scope">' +
			textOrDash(item && item.backup_scope) +
			'</td>' +
			'<td data-col="backup_policy_name">' +
			textOrDash(item && item.backup_policy_name) +
			'</td>' +
			'<td data-col="backup_directory">' +
			textOrDash(item && item.backup_directory) +
			'</td>' +
			'<td data-col="data_type">' +
			textOrDash(item && item.data_type) +
			'</td>' +
			'<td data-col="backup_grade">' +
			textOrDash(item && item.backup_grade) +
			'</td>' +
			'<td data-col="retention">' +
			formatRetention(item) +
			'</td>' +
			'<td data-col="storage_pool">' +
			textOrDash(item && item.storage_pool_name) +
			'</td>' +
			'<td data-col="offsite">' +
			renderOXBadge(item && item.offsite_yn) +
			'</td>' +
			'<td data-col="media_type">' +
			textOrDash(item && item.media_type) +
			'</td>' +
			'<td data-col="schedule_period">' +
			textOrDash(item && item.schedule_period) +
			'</td>' +
			'<td data-col="schedule_weekday">' +
			textOrDash(item && item.schedule_weekday) +
			'</td>' +
			'<td data-col="schedule_day">' +
			textOrDash(item && item.schedule_day) +
			'</td>' +
			'<td data-col="start_time">' +
			textOrDash(item && item.start_time) +
			'</td>';
		return tr;
	}

	// Init

	

	

	

	function init(options) {
		var opt = options || {};
		var table = $('bk-spec-table');
		if (!table) return;
		if (table.dataset && table.dataset.bkInited === '1') return;
		if (table.dataset) table.dataset.bkInited = '1';

		var empty = $('bk-empty');

			var storageKey = opt.storageKey;
			var storagePrefix = opt.storagePrefix || getStoragePrefix(storageKey);

	// Pagination

	
			var pageSizeStorageKey = opt.pageSizeStorageKey || (storagePrefix ? (storagePrefix + ':bk:pageSize') : 'bk:pageSize');

		function updateEmptyState() {
			try {
				var hasRows = table.querySelector('tbody tr') != null;
				if (empty) {
					empty.hidden = !!hasRows;
					empty.style.display = hasRows ? 'none' : '';
				}
			} catch (_e) {
				if (empty) {
					empty.hidden = false;
					empty.style.display = '';
				}
			}
		}

		var systemName = opt.systemName || getSystemNameFromSubtitle();

		function rowsAll() {
			var tbody = table.querySelector('tbody');
			if (!tbody) return [];
			return Array.from(tbody.querySelectorAll('tr'));
		}

		function totalRows() {
			return rowsAll().length;
		}

		
		function rowSaved(tr) {
			var t = tr.querySelector('.js-bk-toggle');
			var inEdit = t && t.getAttribute('data-action') === 'save';
			if (inEdit) return false;
			return !tr.querySelector('td[data-col] input, td[data-col] select, td[data-col] textarea');
		}

		function visibleRows() {
			return rowsAll().filter(function (tr) {
				return !(tr.hasAttribute('data-hidden') || tr.style.display === 'none');
			});
		}

		function savedVisibleRows() {
			return visibleRows().filter(rowSaved);
		}

	// CSV

	

	

		function exportCSV(onlySelected) {
			var headers = ['백업 구분', '백업 정책', '백업 디렉터리', '데이터 유형', '백업 등급', '보관 기간', '스토리지 풀', '소산여부', '미디어 구분', '주기', '요일', '일자', '시작시간'];
			var trs = savedVisibleRows();
			if (onlySelected) {
				trs = trs.filter(function (tr) {
					var cb = tr.querySelector('.bk-row-check');
					return cb && cb.checked;
				});
			}
			if (trs.length === 0) return;

			var rows = trs.map(function (tr) {
				function cellText(col) {
					var td = tr.querySelector('[data-col="' + col + '"]');
					if (!td) return '';
					return (td.textContent || '').trim();
				}
				return [
					'backup_scope',
					'backup_policy_name',
					'backup_directory',
					'data_type',
					'backup_grade',
					'retention',
					'storage_pool',
					'offsite',
					'media_type',
					'schedule_period',
					'schedule_weekday',
					'schedule_day',
					'start_time',
				].map(cellText);
			});

			var lines = [headers].concat(rows).map(function (arr) {
				return arr.map(escapeCSV).join(',');
			});

			var csv = '\uFEFF' + lines.join('\r\n');
			var d = new Date();
			var yyyy = d.getFullYear();
			var mm = String(d.getMonth() + 1).padStart(2, '0');
			var dd = String(d.getDate()).padStart(2, '0');
			var filename = 'backup_policies_' + yyyy + mm + dd + '.csv';
			downloadCSV(filename, csv);
		}

		
		var state = { page: 1, pageSize: 10 };
		(function initPageSize() {
			try {
				var saved = localStorage.getItem(pageSizeStorageKey);
				var sel = $('bk-page-size');
				if (sel) {
					if (saved && ['10', '20', '50', '100'].indexOf(saved) > -1) {
						state.pageSize = parseInt(saved, 10);
						sel.value = saved;
					}
					sel.addEventListener('change', function () {
						var v = parseInt(sel.value, 10);
						if (!isNaN(v)) {
							state.page = 1;
							state.pageSize = v;
							localStorage.setItem(pageSizeStorageKey, String(v));
							renderPage();
						}
					});
				}
			} catch (_e) {}
		})();

		var infoEl = $('bk-pagination-info');
		var numWrap = $('bk-page-numbers');
		var btnFirst = $('bk-first');
		var btnPrev = $('bk-prev');
		var btnNext = $('bk-next');
		var btnLast = $('bk-last');

		function pages() {
			var total = totalRows();
			return total ? Math.ceil(total / Math.max(1, state.pageSize)) : 1;
		}

		function clampPage() {
			var max = pages();
			if (state.page < 1) state.page = 1;
			if (state.page > max) state.page = max;
		}

		function updatePaginationUI() {
			var total = totalRows();
			var ps = Math.max(1, state.pageSize);
			var pg = pages();
			var page = state.page;

			if (infoEl) {
				var start = total ? (page - 1) * ps + 1 : 0;
				var end = total ? Math.min(total, page * ps) : 0;
				infoEl.textContent = total ? start + '-' + end + ' / ' + total + '개 항목' : '0개 항목';
			}

			if (numWrap) {
				numWrap.innerHTML = '';
				var windowSize = 5;
				var startPage = Math.max(1, page - Math.floor(windowSize / 2));
				var endPage = Math.min(pg, startPage + windowSize - 1);
				if (endPage - startPage < windowSize - 1) startPage = Math.max(1, endPage - windowSize + 1);

				for (var p = startPage; p <= endPage; p++) {
					var b = document.createElement('button');
					b.className = 'page-btn' + (p === page ? ' active' : '');
					b.textContent = String(p);
					(function (pp) {
						b.addEventListener('click', function () {
							state.page = pp;
							renderPage();
						});
					})(p);
					numWrap.appendChild(b);
				}
			}

			if (btnFirst) btnFirst.disabled = page <= 1;
			if (btnPrev) btnPrev.disabled = page <= 1;
			if (btnNext) btnNext.disabled = page >= pg || pg <= 1;
			if (btnLast) btnLast.disabled = page >= pg || pg <= 1;

			var sizeSel = $('bk-page-size');
			if (sizeSel) {
				var none = totalRows() === 0;
				sizeSel.disabled = none;
				if (none) {
					try {
						sizeSel.value = '10';
						state.pageSize = 10;
					} catch (_e) {}
				}
			}

			var csvBtn = $('bk-download-btn');
			if (csvBtn) {
				csvBtn.disabled = totalRows() === 0;
				csvBtn.setAttribute('aria-disabled', csvBtn.disabled ? 'true' : 'false');
				csvBtn.style.opacity = csvBtn.disabled ? '.5' : '1';
			}

			var addBtn = $('bk-row-add');
			if (addBtn) {
				addBtn.disabled = true;
				addBtn.setAttribute('aria-disabled', 'true');
				addBtn.style.opacity = '.5';
			}

			var sa = $('bk-select-all');
			if (sa) {
				var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .bk-row-check');
				if (visChecks.length) sa.checked = Array.prototype.every.call(visChecks, function (c) { return c.checked; });
				else sa.checked = false;
			}

			updateEmptyState();
		}

		function renderPage() {
			var rows = rowsAll();
			var total = rows.length;
			var ps = Math.max(1, state.pageSize);
			if (total === 0) {
				rows.forEach(function (tr) {
					tr.style.display = 'none';
					tr.setAttribute('data-hidden', '1');
					tr.classList.remove('selected');
					var cb = tr.querySelector('.bk-row-check');
					if (cb) cb.checked = false;
				});
				state.page = 1;
			}
			clampPage();
			var startIdx = (state.page - 1) * ps;
			var endIdx = Math.min(total - 1, startIdx + ps - 1);

			rows.forEach(function (tr, idx) {
				var visible = idx >= startIdx && idx <= endIdx;
				tr.style.display = visible ? '' : 'none';
				if (visible) tr.removeAttribute('data-hidden');
				else tr.setAttribute('data-hidden', '1');
				var cb = tr.querySelector('.bk-row-check');
				if (cb) tr.classList.toggle('selected', !!cb.checked && visible);
			});

			updatePaginationUI();
		}

		if (btnFirst) btnFirst.addEventListener('click', function () { state.page = 1; renderPage(); });
		if (btnPrev) btnPrev.addEventListener('click', function () { state.page = Math.max(1, state.page - 1); renderPage(); });
		if (btnNext) btnNext.addEventListener('click', function () { state.page = Math.min(pages(), state.page + 1); renderPage(); });
		if (btnLast) btnLast.addEventListener('click', function () { state.page = pages(); renderPage(); });

		
		var selectAll = $('bk-select-all');
		if (selectAll) {
			selectAll.addEventListener('change', function () {
				var checks = table.querySelectorAll('tbody tr:not([data-hidden]) .bk-row-check:not([disabled])');
				checks.forEach(function (c) {
					c.checked = !!selectAll.checked;
					var tr = c.closest('tr');
					if (tr) tr.classList.toggle('selected', !!c.checked);
				});
			});
		}

		
		table.addEventListener('click', function (ev) {
			var onControl = ev.target.closest('input, select, button, a, textarea');
			var onCheckbox = ev.target.closest('input[type="checkbox"].bk-row-check');
			if (onCheckbox) {
				var tr = onCheckbox.closest('tr');
				if (tr) {
					var hidden = tr.hasAttribute('data-hidden') || tr.style.display === 'none';
					tr.classList.toggle('selected', !!onCheckbox.checked && !hidden);
				}
				var sa = $('bk-select-all');
				if (sa) {
					var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .bk-row-check');
					if (visChecks.length) sa.checked = Array.prototype.every.call(visChecks, function (c) { return c.checked; });
					else sa.checked = false;
				}
				return;
			}
			if (!onControl) {
				var tr2 = ev.target.closest('tr');
				if (!tr2) return;
				if (tr2.hasAttribute('data-hidden') || tr2.style.display === 'none') return;
				var cb2 = tr2.querySelector('.bk-row-check');
				if (!cb2) return;
				cb2.checked = !cb2.checked;
				tr2.classList.toggle('selected', !!cb2.checked);
				var sa2 = $('bk-select-all');
				if (sa2) {
					var visChecks2 = table.querySelectorAll('tbody tr:not([data-hidden]) .bk-row-check');
					if (visChecks2.length) sa2.checked = Array.prototype.every.call(visChecks2, function (c) { return c.checked; });
					else sa2.checked = false;
				}
			}
		});
		table.addEventListener('change', function (ev) {
			var cb = ev.target.closest('.bk-row-check');
			if (!cb) return;
			var tr = cb.closest('tr');
			if (tr) {
				var hidden = tr.hasAttribute('data-hidden') || tr.style.display === 'none';
				tr.classList.toggle('selected', !!cb.checked && !hidden);
			}
			var sa = $('bk-select-all');
			if (sa) {
				var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .bk-row-check');
				if (visChecks.length) sa.checked = Array.prototype.every.call(visChecks, function (c) { return c.checked; });
				else sa.checked = false;
			}
		});

		
		(function () {
			var btn = $('bk-download-btn');
			var modalId = 'bk-download-modal';
			var closeBtn = $('bk-download-close');
			var confirmBtn = $('bk-download-confirm');
			if (btn) {
				btn.addEventListener('click', function () {
					if (btn.disabled) return;
					var saved = savedVisibleRows();
					var total = saved.length;
					if (total <= 0) return;
					var selectedCount = saved.filter(function (tr) {
						var cb = tr.querySelector('.bk-row-check');
						return cb && cb.checked;
					}).length;

					var subtitle = $('bk-download-subtitle');
					if (subtitle) {
						subtitle.textContent =
							selectedCount > 0
								? '선택된 ' + selectedCount + '개 또는 전체 ' + total + '개 결과 중 범위를 선택하세요.'
								: '현재 결과 ' + total + '개 항목을 CSV로 내보냅니다.';
					}

					var rowSelectedWrap = $('bk-csv-range-row-selected');
					var optSelected = $('bk-csv-range-selected');
					var optAll = $('bk-csv-range-all');
					if (rowSelectedWrap) rowSelectedWrap.hidden = !(selectedCount > 0);
					if (optSelected) {
						optSelected.disabled = !(selectedCount > 0);
						optSelected.checked = selectedCount > 0;
					}
					if (optAll) optAll.checked = !(selectedCount > 0);

					openModalLocal(modalId);
				});
			}
			if (closeBtn) closeBtn.addEventListener('click', function () { closeModalLocal(modalId); });
			if (confirmBtn) {
				confirmBtn.addEventListener('click', function () {
					var onlySel = !!($('bk-csv-range-selected') && $('bk-csv-range-selected').checked);
					exportCSV(onlySel);
					closeModalLocal(modalId);
				});
			}
		})();

		
		function loadFromApi() {
			if (!systemName) {
				updateEmptyState();
				renderPage();
				return;
			}
			var url = '/api/governance/backup/target-policies?system_name=' + encodeURIComponent(systemName);
			apiJson(url, { method: 'GET' })
				.then(function (resp) {
					if (!resp || resp.success !== true) return;
					var tbody = table.querySelector('tbody');
					if (!tbody) return;
					tbody.innerHTML = '';
					(resp.items || []).forEach(function (item) {
						tbody.appendChild(createViewRow(item));
					});
					state.page = 1;
					renderPage();
				})
				.catch(function (_e) {
					updateEmptyState();
				});
		}

		updateEmptyState();
		loadFromApi();
		renderPage();

		// Subtitle may be populated asynchronously by other bundles.
		if (!systemName) {
			try {
				var tries = 0;
				var timer = setInterval(function () {
					tries += 1;
					var sn = getSystemNameFromSubtitle();
					if (sn) {
						systemName = sn;
						clearInterval(timer);
						loadFromApi();
						return;
					}
					if (tries >= 20) {
						clearInterval(timer);
					}
				}, 250);
			} catch (_e) {}
		}
	}

	global.BlossomTab03Backup = {
		init: init,
	};

	// Auto-init for server backup policy tab pages
	try {
		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', function () {
				init({});
			});
		} else {
			init({});
		}
	} catch (_e) {}
})(window);


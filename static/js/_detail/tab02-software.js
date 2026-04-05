/*
 * tab02-software.js
 * Software detail tab behavior.
 */

(function (global) {
	'use strict';

	

	

	

	// Utilities

	function $(id) {
		return document.getElementById(id);
	}

	function coerceInt(val) {
		if (val === null || val === undefined || val === '') return null;
		var n = parseInt(String(val), 10);
		return isNaN(n) ? null : n;
	}

	function safeJsonParse(raw) {
		try {
			return JSON.parse(raw);
		} catch (_e) {
			return null;
		}
	}

	function guessScopeFallback() {
		try {
			var hay = (String(global.location.pathname || '') + ' ' + String(global.location.search || '')).toLowerCase();
			if (hay.indexOf('onpremise') > -1) return 'onpremise';
			if (hay.indexOf('workstation') > -1) return 'workstation';
			if (hay.indexOf('cloud') > -1) return 'cloud';
		} catch (_e) {
			
		}
		return '';
	}

	function getAssetIdFromSelectedRow(prefix) {
		if (!prefix) return null;
		var key = prefix + ':selected:row';
		try {
			var raw = sessionStorage.getItem(key) || localStorage.getItem(key);
			if (!raw) return null;
			var row = safeJsonParse(raw);
			if (!row || typeof row !== 'object') return null;
			var id = null;
			if (row.id != null) id = row.id;
			else if (row.asset_id != null) id = row.asset_id;
			else if (row.assetId != null) id = row.assetId;
			else if (row.assetID != null) id = row.assetID;
			else if (row.server_id != null) id = row.server_id;
			var n = coerceInt(id);
			return n != null && n > 0 ? n : null;
		} catch (_e2) {
			return null;
		}
	}

	function inferPrefixFromStorage(preferPrefix) {
		function scan(storage) {
			try {
				for (var i = 0; i < storage.length; i++) {
					var k = storage.key(i);
					if (!k) continue;
					var m = String(k).match(/^([A-Za-z0-9_\-]+):selected:row$/);
					if (!m) continue;
					var prefix = m[1];
					if (preferPrefix && String(prefix) !== String(preferPrefix)) continue;
					var id = getAssetIdFromSelectedRow(prefix);
					if (id) return prefix;
				}
			} catch (_e) {
				
			}
			return '';
		}

		var p1 = scan(sessionStorage);
		if (p1) return p1;
		var p2 = scan(localStorage);
		if (p2) return p2;
		return '';
	}

	function getAssetId(prefix) {
		var fromSelected = getAssetIdFromSelectedRow(prefix);
		if (fromSelected) return fromSelected;
		try {
			var params = new URLSearchParams(global.location.search || '');
			var rawId = params.get('id') || params.get('asset_id') || params.get('assetId') || params.get('server_id');
			var n = coerceInt(rawId);
			return n != null && n > 0 ? n : null;
		} catch (_e) {
			return null;
		}
	}

	// API

	

	

	

	function apiBase(assetId) {
		return assetId ? '/api/hardware/assets/' + assetId + '/software' : null;
	}

	function apiFetchJson(url, opts) {
		return fetch(url, Object.assign({ headers: { Accept: 'application/json' } }, opts || {})).then(function (res) {
			return res
				.json()
				.catch(function () {
					return { success: false, message: 'Invalid JSON response' };
				})
				.then(function (json) {
					return { status: res.status, ok: res.ok, json: json };
				});
		});
	}

	function escapeCSV(val) {
		return '"' + String(val).replace(/"/g, '""') + '"';
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

	// ── Delete-confirmation modal (tab14 style) ──
	var _swPendingDeleteTr = null;
	var _swDeleteCallback = null;

	function swOpenDeleteModal(tr, onConfirm) {
		_swPendingDeleteTr = tr;
		_swDeleteCallback = onConfirm || null;
		var msgEl = $('sw-delete-msg');
		if (msgEl) msgEl.textContent = '이 소프트웨어를 삭제하시겠습니까?';
		openModalLocal('sw-delete-modal');
	}

	function swCloseDeleteModal() {
		_swPendingDeleteTr = null;
		_swDeleteCallback = null;
		closeModalLocal('sw-delete-modal');
	}

	function swPerformDelete() {
		var tr = _swPendingDeleteTr;
		var cb = _swDeleteCallback;
		swCloseDeleteModal();
		if (cb) { cb(tr); }
	}

	var _swDeleteModalWired = false;
	function wireSwDeleteModal() {
		if (_swDeleteModalWired) return;
		var modal = $('sw-delete-modal');
		if (!modal) return;
		_swDeleteModalWired = true;
		var confirmBtn = $('sw-delete-confirm');
		var cancelBtn  = $('sw-delete-cancel');
		var closeBtn   = $('sw-delete-close');
		if (confirmBtn) confirmBtn.addEventListener('click', swPerformDelete);
		if (cancelBtn)  cancelBtn.addEventListener('click', swCloseDeleteModal);
		if (closeBtn)   closeBtn.addEventListener('click', swCloseDeleteModal);
		modal.addEventListener('click', function (e) { if (e.target === modal) swCloseDeleteModal(); });
		document.addEventListener('keydown', function (e) {
			try {
				if (e.key === 'Escape' && (modal.classList.contains('show') || modal.classList.contains('open'))) {
					swCloseDeleteModal();
				}
			} catch (_) {}
		});
	}

	// Init

	

	

	

	function initTab02Software(options) {
		wireSwDeleteModal();
		var opts = options || {};
		var table = $('sw-spec-table');
		if (!table) return false;
		try {
			if (table.dataset && table.dataset.blsTab02SoftwareBound === '1') return true;
			if (table.dataset) table.dataset.blsTab02SoftwareBound = '1';
		} catch (_e) {
			
		}

		var empty = $('sw-empty');
		// Schema detection (template may not have data-col cells until JS renders rows).
		var headerText = '';
		try {
			headerText = String((table.querySelector('thead') ? table.querySelector('thead').textContent : '') || '');
		} catch (_eH) {
			headerText = '';
		}
		var hasMaintenanceCol = /\uC720\uC9C0\uBCF4\uC218/.test(headerText);
		var hasSerialCol = /\uC77C\uB828\uBC88\uD638/.test(headerText);
		var hasRemarkCol = /\uBE44\uACE0/.test(headerText);
		var noteCol = hasMaintenanceCol ? 'maintenance' : 'remark';
		var noteHeaderLabel = hasMaintenanceCol ? '유지보수' : '비고';
		var notePlaceholder = noteHeaderLabel;
		var prefix = String(opts.storagePrefix || '') || guessScopeFallback() || inferPrefixFromStorage('');
		if (!prefix) prefix = inferPrefixFromStorage(guessScopeFallback());
		var assetId = getAssetId(prefix);

		// Searchable select async sources (model catalog)
		try {
			global.BlossomSearchableSelectSources = global.BlossomSearchableSelectSources || {};
			if (typeof global.BlossomSearchableSelectSources.serverSoftwareModels !== 'function') {
				global.BlossomSearchableSelectSources.serverSoftwareModels = function (ctx) {
					ctx = ctx || {};
					var q = String(ctx.query || '').trim();
					var sel = ctx.select;
					var tr = sel && sel.closest ? sel.closest('tr') : null;
					var typeSel = tr ? tr.querySelector('td[data-col="type"] select') : null;
					var typeVal = String(typeSel ? typeSel.value : '').trim();
					function categoryFromUi(v) {
						var s = String(v || '').trim();
						if (!s) return '';
						// UI values are Korean labels; the software asset catalog uses category codes.
						if (s === '운영체제') return 'OS';
						if (s === '데이터베이스') return 'DATABASE';
						if (s === '미들웨어') return 'MIDDLEWARE';
						if (s === '가상화') return 'VIRTUALIZATION';
						if (s === '보안' || s === '보안S/W' || s === '보안SW' || s === '보안 S/W' || s === '보안 S/W ') return 'SECURITY';
						if (s === '고가용성') return 'HIGH_AVAILABILITY';
						return s;
					}
					var category = categoryFromUi(typeVal);
					if (!category) {
						return { items: [], emptyMessage: '유형을 먼저 선택해 주세요.' };
					}
					var url = '/api/hardware/software-catalog/models?limit=50';
					url += '&type=' + encodeURIComponent(category);
					if (q) url += '&q=' + encodeURIComponent(q);
					return fetch(url, { headers: { Accept: 'application/json' } })
						.then(function (r) { return r.json().catch(function () { return null; }); })
						.then(function (json) {
							if (!json || json.success === false) return [];
							var items = Array.isArray(json.items) ? json.items : [];
							return items
								.map(function (it) {
									var name = (it && it.name != null) ? String(it.name).trim() : '';
									if (!name) return null;
									var vendor = (it && it.vendor != null) ? String(it.vendor).trim() : '';
									var listLabel = vendor ? (name + ' · ' + vendor) : name;
									return {
										value: name,
										label: listLabel,
										displayLabel: name,
										vendor: vendor || null,
										searchText: vendor ? (name + ' ' + vendor) : name,
									};
								})
								.filter(function (x) { return !!x; });
						});
				};
			}
		} catch (_eSrc) {
			// ignore
		}

		function enhanceRowSearchSelects(scope) {
			try {
				if (!global.BlossomSearchableSelect || typeof global.BlossomSearchableSelect.enhance !== 'function') return;
				var root = scope || table;
				var sels = root.querySelectorAll ? root.querySelectorAll('select.search-select') : [];
				Array.prototype.forEach.call(sels, function (s) {
					try { global.BlossomSearchableSelect.enhance(s); } catch (_e) {}
				});
			} catch (_e2) {
				// ignore
			}
		}

		function setBusy(isBusy) {
			try {
				var btnAdd = $('sw-row-add');
				if (btnAdd) btnAdd.disabled = !!isBusy;
			} catch (_e) {
				
			}
		}

		function alertMsg(msg) {
			try {
				global.alert(msg);
			} catch (_e) {
				
			}
		}

		function textOrDash(v) {
			var s = v == null ? '' : String(v).trim();
			return s ? s : '-';
		}

		function firstNonEmpty(list) {
			for (var i = 0; i < (list || []).length; i++) {
				var v = list[i];
				if (v != null && String(v).trim() !== '') return String(v).trim();
			}
			return '';
		}

		// --- Server software tab: maintenance is derived from tab61 (OPEX>SW) ---

		function swTrim(v) {
			return (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();
		}

		function swEscapeHtml(s) {
			return String(s == null ? '' : s)
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#39;');
		}

		function swNormMatchText(v) {
			var s = swTrim(v || '');
			if (!s || s === '-') return '';
			return s.toUpperCase();
		}

		function swNormSoftwareType(v) {
			var s = swTrim(v || '');
			if (!s || s === '-') return '';
			// UI values are Korean labels; tab61 may contain either the label or category code.
			if (s === '운영체제') return 'OS';
			if (s === '데이터베이스') return 'DATABASE';
			if (s === '미들웨어') return 'MIDDLEWARE';
			if (s === '가상화') return 'VIRTUALIZATION';
			if (s === '보안' || s === '보안S/W' || s === '보안SW' || s === '보안 S/W') return 'SECURITY';
			if (s === '고가용성') return 'HIGH_AVAILABILITY';
			return s.toUpperCase();
		}

		var SUBTYPE_MAP = {
			'운영체제': ['유닉스','리눅스','윈도우','임베디드'],
			'데이터베이스': ['RDBMS','NoSQL'],
			'미들웨어': ['WEB','WAS','API','APM','FRAMEWORK'],
			'가상화': ['하이퍼바이저','컨테이너','쿠버네티스'],
			'보안S/W': ['백신','취약점','서버 접근통제','서버 통합계정','서버 모니터링','서버 보안통제','DB 접근통제','기타'],
			'보안': ['백신','취약점','서버 접근통제','서버 통합계정','서버 모니터링','서버 보안통제','DB 접근통제','기타'],
			'고가용성': ['Active-Active','Active-Passive']
		};

		function buildSubtypeSelect(typeVal, current) {
			var list = SUBTYPE_MAP[typeVal] || [];
			var disabled = !typeVal || !list.length;
			var opts = ['<option value=""' + (current ? '' : ' selected') + '>선택</option>'].concat(
				list.map(function (o) { return '<option value="' + o + '"' + (o === current ? ' selected' : '') + '>' + o + '</option>'; })
			).join('');
			return '<select class="search-select" data-searchable-scope="page" data-placeholder="선택" data-allow-clear="true"' + (disabled ? ' disabled' : '') + '>' + opts + '</select>';
		}

		function wireSubtypeDependency(tr) {
			try {
				var typeSel = tr.querySelector('td[data-col="type"] select');
				var subtypeTd = tr.querySelector('td[data-col="subtype"]');
				if (!typeSel || !subtypeTd) return;
				typeSel.addEventListener('change', function () {
					var cat = typeSel.value || '';
					subtypeTd.innerHTML = buildSubtypeSelect(cat, '');
					enhanceRowSearchSelects(subtypeTd);
				});
			} catch (_) {}
		}

		function swContractStatusRank(statusText) {
			var s = swTrim(statusText || '');
			if (!s) return 0;
			if (/계약|유지/.test(s)) return 4;
			if (/예정/.test(s)) return 3;
			if (/만료|종료/.test(s)) return 2;
			if (/해지|취소/.test(s)) return 1;
			return 0;
		}

		function swContractStatusClass(statusText) {
			var s = swTrim(statusText || '');
			if (!s) return 'is-unknown';
			if (/예정/.test(s)) return 'is-planned';
			if (/만료|종료/.test(s)) return 'is-expired';
			if (/해지|취소/.test(s)) return 'is-canceled';
			if (/계약|유지/.test(s)) return 'is-active';
			return 'is-unknown';
		}

		function swGetRowColValue(tr, col) {
			try {
				var td = tr.querySelector('[data-col="' + col + '"]');
				if (!td) return '';
				var input = td.querySelector('input, textarea');
				if (input) return input.value;
				var sel = td.querySelector('select');
				if (sel) return sel.value;
				return td.textContent;
			} catch (_e) {
				return '';
			}
		}

		function swSetMaintenanceCellText(tr, text, contractStatus) {
			try {
				if (!tr) return;
				var td = tr.querySelector('[data-col="maintenance"]');
				if (!td) return;
				var t = swTrim(text || '');
				var finalText = t ? t : '-';
				if (finalText === '-') {
					td.textContent = '-';
					try { td.setAttribute('data-readonly', '1'); } catch (_e0) {}
					return;
				}
				var statusText = swTrim(contractStatus || '');
				var cls = swContractStatusClass(statusText);
				var dot =
					'<span class="hw-maint-status-dot ' +
					cls +
					'" aria-hidden="true"' +
					(statusText ? ' title="' + swEscapeHtml(statusText) + '"' : '') +
					'></span>';
				var html =
					'<span class="hw-maint-status">' +
					dot +
					'<span class="hw-maint-code">' +
					swEscapeHtml(finalText) +
					'</span></span>';
				td.innerHTML = html;
				try { td.setAttribute('data-readonly', '1'); } catch (_e1) {}
			} catch (_e) {}
		}

		function swApplyTab61MaintenanceToRows(tab61Lines) {
			try {
				var tbody = table.querySelector('tbody');
				if (!tbody) return;
				var rows = tbody.querySelectorAll('tr');
				if (!Array.isArray(tab61Lines)) {
					Array.prototype.forEach.call(rows, function (tr) {
						try {
							swSetMaintenanceCellText(tr, '-');
						} catch (_eR0) {}
					});
					return;
				}

				Array.prototype.forEach.call(rows, function (tr) {
					try {
						var rowTypeRaw = swGetRowColValue(tr, 'type');
						var rowType = swNormSoftwareType(rowTypeRaw);
						var rowVendor = swNormMatchText(swGetRowColValue(tr, 'vendor'));
						var rowModel = swNormMatchText(swGetRowColValue(tr, 'name'));
						var rowSerial = swNormMatchText(swGetRowColValue(tr, 'serial'));

						var best = null;
						var bestRank = -1;
						for (var i = 0; i < tab61Lines.length; i++) {
							var ln = tab61Lines[i] || {};
							// Strict match: contract_type/vendor/model/serial must all equal.
							var lnTypeA = swNormSoftwareType(ln.contract_type);
							var lnTypeB = swNormMatchText(ln.contract_type);
							if (!(lnTypeA === rowType || lnTypeB === swNormMatchText(rowTypeRaw))) continue;
							if (swNormMatchText(ln.contract_vendor) !== rowVendor) continue;
							if (swNormMatchText(ln.contract_model) !== rowModel) continue;
							if (swNormMatchText(ln.contract_serial) !== rowSerial) continue;
							var r = swContractStatusRank(ln.contract_status);
							if (r > bestRank) {
								bestRank = r;
								best = ln;
							}
						}

						if (best && swTrim(best.manage_no)) {
							swSetMaintenanceCellText(tr, best.manage_no, best.contract_status || '');
						} else {
							swSetMaintenanceCellText(tr, '-');
						}
					} catch (_eR) {}
				});
			} catch (_e) {}
		}

		var _swTab61Cache = { key: '', ts: 0, lines: null };
		function swRefreshMaintenanceFromTab61() {
			try {
				if (!assetId) return;
				if (!hasMaintenanceCol) return;
				var now = Date.now ? Date.now() : new Date().getTime();
				var cacheKey = String(assetId) + '|OPEX|SW';
				if (_swTab61Cache.key === cacheKey && _swTab61Cache.lines && now - _swTab61Cache.ts < 5 * 60 * 1000) {
					swApplyTab61MaintenanceToRows(_swTab61Cache.lines);
					return;
				}
				var url =
					'/api/hardware/assets/' +
					encodeURIComponent(String(assetId)) +
					'/tab61-maintenance?scope=OPEX&cost_type=SW';
				fetch(url, { headers: { Accept: 'application/json' } })
					.then(function (r) {
						return r.json().catch(function () {
							return null;
						});
					})
					.then(function (json) {
						var lines = json && Array.isArray(json.lines) ? json.lines : null;
						if (lines && lines.length > 0) {
							_swTab61Cache = { key: cacheKey, ts: now, lines: lines };
						}
						swApplyTab61MaintenanceToRows(lines || []);
					})
					.catch(function () {
						swApplyTab61MaintenanceToRows([]);
					});
			} catch (_e) {}
		}

		function makeSavedRow(item) {
			var tr = document.createElement('tr');
			if (item && item.id != null) tr.setAttribute('data-id', String(item.id));
			function td(col, text) {
				var tdEl = document.createElement('td');
				tdEl.setAttribute('data-col', col);
				tdEl.textContent = textOrDash(text);
				return tdEl;
			}
			var tdCheck = document.createElement('td');
			tdCheck.innerHTML = '<input type="checkbox" class="sw-row-check" aria-label="행 선택">';
			tr.appendChild(tdCheck);
			tr.appendChild(td('type', item && item.type));
			tr.appendChild(td('subtype', item && item.subtype));
			tr.appendChild(td('name', item && item.name));
			tr.appendChild(td('vendor', item && item.vendor));
			tr.appendChild(td('version', item && item.version));
			tr.appendChild(td('qty', item && item.qty));
			if (hasSerialCol) tr.appendChild(td('serial', item && item.serial));
			if (hasMaintenanceCol) tr.appendChild(td('maintenance', '-'));
			else tr.appendChild(td('remark', firstNonEmpty([item && item.remark, item && item.maintenance])));
			var actions = document.createElement('td');
			actions.className = 'system-actions table-actions';
			actions.innerHTML =
				'<button class="action-btn js-sw-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button> ' +
				'<button class="action-btn danger js-sw-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>';
			tr.appendChild(actions);
			return tr;
		}

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

		function rowSaved(tr) {
			var t = tr.querySelector('.js-sw-toggle');
			var inEdit = t && t.getAttribute('data-action') === 'save';
			if (inEdit) return false;
			return !tr.querySelector('td[data-col] input, td[data-col] select, td[data-col] textarea');
		}

		function visibleRows() {
			var tbody = table.querySelector('tbody');
			if (!tbody) return [];
			return Array.from(tbody.querySelectorAll('tr')).filter(function (tr) {
				return !(tr.hasAttribute('data-hidden') || tr.style.display === 'none');
			});
		}

		function savedVisibleRows() {
			return visibleRows().filter(rowSaved);
		}

	// CSV

	

	

		function exportCSV(onlySelected) {
			var headers = ['유형', '하위유형', '모델명', '제조사', '상세버전', '수량'];
			if (hasSerialCol) headers.push('일련번호');
			headers.push(noteHeaderLabel);
			var trs = savedVisibleRows();
			if (onlySelected) {
				trs = trs.filter(function (tr) {
					var cb = tr.querySelector('.sw-row-check');
					return cb && cb.checked;
				});
			}
			if (trs.length === 0) return;

			var rows = trs.map(function (tr) {
				function text(col) {
					var td = tr.querySelector('[data-col="' + col + '"]');
					return td ? String(td.textContent || '').trim() : '';
				}
				var cols = ['type', 'subtype', 'name', 'vendor', 'version', 'qty'];
				if (hasSerialCol) cols.push('serial');
				cols.push(noteCol);
				return cols.map(function (c) {
					return text(c);
				});
			});
			var lines = [headers].concat(rows).map(function (arr) {
				return arr.map(escapeCSV).join(',');
			});
			var csv = '\uFEFF' + lines.join('\r\n');
			var d = new Date();
			var yyyy = d.getFullYear();
			var mm = String(d.getMonth() + 1).padStart(2, '0');
			var dd = String(d.getDate()).padStart(2, '0');
			downloadCSV('software_' + yyyy + mm + dd + '.csv', csv);
		}

		
		var state = { page: 1, 
	

	
pageSize: 10 };

	// Pagination

	
		var pageSizeKey = (prefix ? prefix : 'tab02') + ':sw:pageSize';
		(function initPageSize() {
			try {
				var saved = localStorage.getItem(pageSizeKey);
				var sel = $('sw-page-size');
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
							try {
								localStorage.setItem(pageSizeKey, String(v));
							} catch (_e) {}
							renderPage();
						}
					});
				}
			} catch (_e2) {
				
			}
		})();

		var infoEl = $('sw-pagination-info');
		var numWrap = $('sw-page-numbers');
		var btnFirst = $('sw-first');
		var btnPrev = $('sw-prev');
		var btnNext = $('sw-next');
		var btnLast = $('sw-last');

		function allRows() {
			var tbody = table.querySelector('tbody');
			if (!tbody) return [];
			return Array.from(tbody.querySelectorAll('tr'));
		}

		function total() {
			return allRows().length;
		}

		function pages() {
			var t = total();
			return t ? Math.ceil(t / Math.max(1, state.pageSize)) : 1;
		}

		function clampPage() {
			var max = pages();
			if (state.page < 1) state.page = 1;
			if (state.page > max) state.page = max;
		}

		function updatePaginationUI() {
			var t = total();
			var ps = Math.max(1, state.pageSize);
			var pgs = pages();
			var p = state.page;

			if (infoEl) {
				var start = t ? (p - 1) * ps + 1 : 0;
				var end = t ? Math.min(t, p * ps) : 0;
				infoEl.textContent = t ? start + '-' + end + ' / ' + t + '개 항목' : '0개 항목';
			}

			if (numWrap) {
				numWrap.innerHTML = '';
				var windowSize = 5;
				var startPage = Math.max(1, p - Math.floor(windowSize / 2));
				var endPage = Math.min(pgs, startPage + windowSize - 1);
				if (endPage - startPage < windowSize - 1) {
					startPage = Math.max(1, endPage - windowSize + 1);
				}
				for (var pp = startPage; pp <= endPage; pp++) {
					var b = document.createElement('button');
					b.className = 'page-btn' + (pp === p ? ' active' : '');
					b.textContent = String(pp);
					(function (pageNum) {
						b.addEventListener('click', function () {
							state.page = pageNum;
							renderPage();
						});
					})(pp);
					numWrap.appendChild(b);
				}
			}

			if (btnFirst) btnFirst.disabled = p <= 1;
			if (btnPrev) btnPrev.disabled = p <= 1;
			if (btnNext) btnNext.disabled = p >= pgs || pgs <= 1;
			if (btnLast) btnLast.disabled = p >= pgs || pgs <= 1;

			var sizeSel = $('sw-page-size');
			if (sizeSel) {
				var none = total() === 0;
				sizeSel.disabled = none;
				if (none) {
					try {
						sizeSel.value = '10';
						state.pageSize = 10;
					} catch (_e) {}
				}
			}

			var csvBtn = $('sw-download-btn');
			if (csvBtn) {
				csvBtn.disabled = total() === 0;
				csvBtn.setAttribute('aria-disabled', csvBtn.disabled ? 'true' : 'false');
				csvBtn.style.opacity = csvBtn.disabled ? '.5' : '1';
			}

			var sa = $('sw-select-all');
			if (sa) {
				var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .sw-row-check');
				if (visChecks.length) {
					sa.checked = Array.prototype.every.call(visChecks, function (c) {
						return c.checked;
					});
				} else {
					sa.checked = false;
				}
			}

			updateEmptyState();
		}

		function renderPage() {
			var rows = allRows();
			var t = rows.length;
			var ps = Math.max(1, state.pageSize);

			if (t === 0) {
				rows.forEach(function (tr) {
					tr.style.display = 'none';
					tr.setAttribute('data-hidden', '1');
					tr.classList.remove('selected');
					var cb = tr.querySelector('.sw-row-check');
					if (cb) cb.checked = false;
				});
				state.page = 1;
			}

			clampPage();
			var startIdx = (state.page - 1) * ps;
			var endIdx = Math.min(t - 1, startIdx + ps - 1);
			rows.forEach(function (tr, idx) {
				var visible = idx >= startIdx && idx <= endIdx;
				tr.style.display = visible ? '' : 'none';
				if (visible) tr.removeAttribute('data-hidden');
				else tr.setAttribute('data-hidden', '1');
				var cb = tr.querySelector('.sw-row-check');
				if (cb) tr.classList.toggle('selected', !!cb.checked && visible);
			});
			updatePaginationUI();
		}

		if (btnFirst) btnFirst.addEventListener('click', function () { state.page = 1; renderPage(); });
		if (btnPrev) btnPrev.addEventListener('click', function () { state.page = Math.max(1, state.page - 1); renderPage(); });
		if (btnNext) btnNext.addEventListener('click', function () { state.page = Math.min(pages(), state.page + 1); renderPage(); });
		if (btnLast) btnLast.addEventListener('click', function () { state.page = pages(); renderPage(); });

		
		var selectAll = $('sw-select-all');
		if (selectAll) {
			selectAll.addEventListener('change', function () {
				var checks = table.querySelectorAll('tbody tr:not([data-hidden]) .sw-row-check:not([disabled])');
				checks.forEach(function (c) {
					c.checked = !!selectAll.checked;
					var tr = c.closest('tr');
					if (tr) tr.classList.toggle('selected', !!c.checked);
				});
			});
		}

		
		table.addEventListener('click', function (ev) {
			var onControl = ev.target.closest('input, select, button, a, textarea');
			var onCheckbox = ev.target.closest('input[type="checkbox"].sw-row-check');
			if (onCheckbox) {
				var trCb = onCheckbox.closest('tr');
				if (trCb) {
					var hidden = trCb.hasAttribute('data-hidden') || trCb.style.display === 'none';
					trCb.classList.toggle('selected', !!onCheckbox.checked && !hidden);
				}
				updatePaginationUI();
				return;
			}
			if (!onControl) {
				var tr = ev.target.closest('tr');
				if (!tr) return;
				if (tr.hasAttribute('data-hidden') || tr.style.display === 'none') return;
				var cb = tr.querySelector('.sw-row-check');
				if (!cb) return;
				cb.checked = !cb.checked;
				tr.classList.toggle('selected', !!cb.checked);
				updatePaginationUI();
			}
		});
		table.addEventListener('change', function (ev) {
			var cb = ev.target.closest('.sw-row-check');
			if (!cb) return;
			var tr = cb.closest('tr');
			if (tr) {
				var hidden = tr.hasAttribute('data-hidden') || tr.style.display === 'none';
				tr.classList.toggle('selected', !!cb.checked && !hidden);
			}
			updatePaginationUI();
		});

		
		(function bindCsvModal() {
			var btn = $('sw-download-btn');
			var modalId = 'sw-download-modal';
			var closeBtn = $('sw-download-close');
			var confirmBtn = $('sw-download-confirm');

			if (btn) {
				btn.addEventListener('click', function () {
					if (btn.disabled) return;
					var saved = savedVisibleRows();
					var t = saved.length;
					if (t <= 0) return;
					var selectedCount = saved.filter(function (tr) {
						var cb = tr.querySelector('.sw-row-check');
						return cb && cb.checked;
					}).length;
					var subtitle = $('sw-download-subtitle');
					if (subtitle) {
						subtitle.textContent =
							selectedCount > 0
								? '선택된 ' + selectedCount + '개 또는 전체 ' + t + '개 결과 중 범위를 선택하세요.'
								: '현재 결과 ' + t + '개 항목을 CSV로 내보냅니다.';
					}
					var rowSelectedWrap = $('sw-csv-range-row-selected');
					var optSelected = $('sw-csv-range-selected');
					var optAll = $('sw-csv-range-all');
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
					var onlySel = !!($('sw-csv-range-selected') && $('sw-csv-range-selected').checked);
					exportCSV(onlySel);
					closeModalLocal(modalId);
				});
			}
		})();

		
		var addBtn = $('sw-row-add');
		if (addBtn) {
			addBtn.addEventListener('click', function () {
				var tbody = table.querySelector('tbody');
				if (!tbody) return;
				var tr = document.createElement('tr');
				var serialTdHtml = (hasSerialCol
					? '<td data-col="serial"><input type="text" value="-" placeholder="일련번호"></td>'
					: '');
				var noteTdHtml = (hasMaintenanceCol
					? '<td data-col="maintenance" data-readonly="1">-</td>'
					: '<td data-col="remark"><input type="text" value="-" placeholder="' + notePlaceholder + '"></td>');
				tr.innerHTML =
					'<td><input type="checkbox" class="sw-row-check" aria-label="행 선택"></td>' +
					'<td data-col="type">' +
					'  <select class="search-select" data-searchable-scope="page" data-placeholder="선택" data-allow-clear="false" required>' +
					'    <option value="" selected>선택</option>' +
					'    <option value="운영체제">운영체제</option>' +
					'    <option value="데이터베이스">데이터베이스</option>' +
					'    <option value="미들웨어">미들웨어</option>' +
					'    <option value="가상화">가상화</option>' +
					'    <option value="보안S/W">보안S/W</option>' +
					'    <option value="고가용성">고가용성</option>' +
					'  </select>' +
					'</td>' +
					'<td data-col="subtype">' + buildSubtypeSelect('', '') + '</td>' +
					'<td data-col="name">' +
					'  <select class="search-select" data-searchable-scope="page" data-search-source="serverSoftwareModels" data-placeholder="-" data-allow-clear="true" required>' +
					'    <option value="" selected>-</option>' +
					'  </select>' +
					'</td>' +
					'<td data-col="vendor"><input type="text" value="-" placeholder="(자동)" readonly></td>' +
					'<td data-col="version"><input type="text" value="-" placeholder="상세버전"></td>' +
					'<td data-col="qty"><input type="number" min="1" step="1" placeholder="1" value="1"></td>' +
					serialTdHtml +
					noteTdHtml +
					'<td class="system-actions table-actions">' +
					'  <button class="action-btn js-sw-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button>' +
					'  <button class="action-btn danger js-sw-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>' +
					'</td>';
				tbody.appendChild(tr);
				wireSubtypeDependency(tr);
				enhanceRowSearchSelects(tr);
				renderPage();
			});
		}

		function baseUrl() {
			return apiBase(assetId);
		}

		function readCellInput(tr, name) {
			var td = tr.querySelector('[data-col="' + name + '"]');
			if (!td) return null;
			return td.querySelector('input, textarea');
		}

		function toEditMode(tr) {
			function toInput(name) {
				var td = tr.querySelector('[data-col="' + name + '"]');
				if (!td) return;
				var current = String(td.textContent || '').trim();
					if (name === 'maintenance') {
						// 유지보수는 비용관리(tab61)의 관리번호로 자동 매핑되며 이 페이지에서는 수정 불가.
						try { td.setAttribute('data-readonly', '1'); } catch (_eRO) {}
						return;
					}
				if (name === 'type') {
						if (current === '-') current = '';
					var opts = ['운영체제', '데이터베이스', '미들웨어', '가상화', '보안S/W', '고가용성'];
					var optionsHtml =
							['<option value=""' + (current ? '' : ' selected') + '>선택</option>']
							.concat(
								opts.map(function (o) {
									return '<option value="' + o + '"' + (o === current ? ' selected' : '') + '>' + o + '</option>';
								})
							)
							.join('');
					td.innerHTML =
						'<select class="search-select" data-searchable-scope="page" data-placeholder="선택" data-allow-clear="false" required>' +
						optionsHtml +
						'</select>';
					return;
				}
				if (name === 'subtype') {
					if (current === '-') current = '';
					var typeTd = tr.querySelector('[data-col="type"]');
					var typeText = typeTd ? String(typeTd.textContent || '').trim() : '';
					var typeSel2 = typeTd ? typeTd.querySelector('select') : null;
					var typeVal2 = typeSel2 ? String(typeSel2.value || '').trim() : typeText;
					if (typeVal2 === '-') typeVal2 = '';
					td.innerHTML = buildSubtypeSelect(typeVal2, current);
					return;
				}
				if (name === 'name') {
					var typeSel = tr.querySelector('[data-col="type"] select');
						var hasType = !!(typeSel && String(typeSel.value || '').trim());
					var vendorTd = tr.querySelector('[data-col="vendor"]');
					var vendorNow = vendorTd ? String(vendorTd.textContent || '').trim() : '';
						if (current === '-') current = '';
						if (vendorNow === '-') vendorNow = '';
						var optCur = current
						? '<option value="' + current.replace(/"/g, '&quot;') + '" selected data-vendor="' + vendorNow.replace(/"/g, '&quot;') + '">' + current + '</option>'
							: '<option value="" selected>-</option>';
					td.innerHTML =
						'<select class="search-select" data-searchable-scope="page" data-search-source="serverSoftwareModels" data-placeholder="-" data-allow-clear="true" required>' +
						optCur +
						'</select>';
					return;
				}
					if (name === 'vendor') {
						if (current === '-') current = '';
						td.innerHTML = '<input type="text" value="' + (current || '-') + '" placeholder="(자동)" readonly>';
						return;
					}
				if (name === 'qty') {
					td.innerHTML = '<input type="number" min="1" step="1" value="' + (current || 1) + '">';
					return;
				}
				td.innerHTML = '<input type="text" value="' + current + '">';
			}
			['type', 'subtype', 'name', 'vendor', 'version', 'qty'].forEach(toInput);
			if (hasSerialCol) toInput('serial');
				if (noteCol !== 'maintenance') toInput(noteCol);
			var toggleBtn = tr.querySelector('.js-sw-toggle');
			if (toggleBtn) {
				toggleBtn.setAttribute('data-action', 'save');
				toggleBtn.title = '저장';
				toggleBtn.setAttribute('aria-label', '저장');
				toggleBtn.innerHTML = '<img src="/static/image/svg/save.svg" alt="저장" class="action-icon">';
			}
			wireSubtypeDependency(tr);
			enhanceRowSearchSelects(tr);
		}

		function applySavedState(tr, savedItem) {
			function commit(name, val) {
				var td = tr.querySelector('[data-col="' + name + '"]');
				if (!td) return;
				td.textContent = textOrDash(val);
			}
			commit('type', savedItem.type);
			commit('subtype', savedItem.subtype);
			commit('vendor', savedItem.vendor);
			commit('name', savedItem.name);
			commit('version', savedItem.version);
			commit('qty', savedItem.qty);
			if (hasSerialCol) commit('serial', savedItem.serial);
				if (hasMaintenanceCol) {
					commit('maintenance', '-');
				} else {
					var noteVal = firstNonEmpty([savedItem.remark, savedItem.maintenance]);
					commit(noteCol, noteVal);
				}
			if (savedItem && savedItem.id != null) tr.setAttribute('data-id', String(savedItem.id));
			var toggleBtn = tr.querySelector('.js-sw-toggle');
			if (toggleBtn) {
				toggleBtn.setAttribute('data-action', 'edit');
				toggleBtn.title = '편집';
				toggleBtn.setAttribute('aria-label', '편집');
				toggleBtn.innerHTML = '<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon">';
			}
		}

		function collectPayload(tr) {
			var nameSel = tr.querySelector('[data-col="name"] select');
			var nameInput = readCellInput(tr, 'name');
			var nameVal = String(nameSel ? nameSel.value : (nameInput ? nameInput.value : '')).trim();
			var typeSel = tr.querySelector('[data-col="type"] select');
			var typeVal = String(typeSel ? typeSel.value : '').trim();
			var qtyInput = readCellInput(tr, 'qty');
			var qtyRaw = String(qtyInput ? qtyInput.value : '').trim();
			var qtyNum = parseInt(qtyRaw, 10);

			function setError(el, on) {
				if (!el) return;
				try {
					var wrap = el.closest ? el.closest('.fk-searchable-control') : null;
					if (wrap) wrap.classList.toggle('is-invalid', !!on);
				} catch (_eW) {}
				if (on) {
					el.classList.add('input-error');
					el.setAttribute('aria-invalid', 'true');
				} else {
					el.classList.remove('input-error');
					el.removeAttribute('aria-invalid');
				}
			}

			var firstInvalid = null;
			if (!nameVal) {
				setError(nameSel || nameInput, true);
				firstInvalid = firstInvalid || (nameSel || nameInput);
			} else {
				setError(nameSel || nameInput, false);
			}
			if (!typeVal) {
				setError(typeSel, true);
				firstInvalid = firstInvalid || typeSel;
			} else {
				setError(typeSel, false);
			}
			if (!qtyRaw || isNaN(qtyNum) || qtyNum < 1) {
				setError(qtyInput, true);
				firstInvalid = firstInvalid || qtyInput;
			} else {
				setError(qtyInput, false);
			}
			if (firstInvalid) {
				try { firstInvalid.focus(); } catch (_e) {}
				return null;
			}

			function readText(name) {
				var inp = readCellInput(tr, name);
				var v = String(inp ? inp.value : '').trim();
				return v === '-' ? '' : v;
			}

			var subtypeSel = tr.querySelector('[data-col="subtype"] select');
			var subtypeVal = String(subtypeSel ? subtypeSel.value : '').trim();

			return {
				type: typeVal,
				subtype: subtypeVal || undefined,
				name: nameVal,
				version: readText('version'),
				vendor: readText('vendor'),
				qty: qtyNum,
				serial: hasSerialCol ? readText('serial') : undefined,
				remark: (!hasMaintenanceCol && hasRemarkCol) ? readText('remark') : undefined,
			};
		}

		// Vendor auto-fill + model reset/enable when type changes
		table.addEventListener('change', function (ev) {
			var sel = ev.target;
			if (!(sel && sel.tagName && String(sel.tagName).toLowerCase() === 'select')) return;
			var td = sel.closest ? sel.closest('td[data-col]') : null;
			if (!td) return;
			var col = td.getAttribute('data-col');
			var tr = sel.closest ? sel.closest('tr') : null;
			if (!tr) return;

			if (col === 'type') {
				var modelSel = tr.querySelector('td[data-col="name"] select');
				var vendorInp = tr.querySelector('td[data-col="vendor"] input');
				var typeVal = String(sel.value || '').trim();
				if (vendorInp) vendorInp.value = '-';
				if (modelSel) {
					try { modelSel.disabled = false; } catch (_eDis) {}
					try {
						modelSel.value = '';
						modelSel.dispatchEvent(new Event('change', { bubbles: true }));
					} catch (_e) {}
					try {
						if (global.BlossomSearchableSelect && typeof global.BlossomSearchableSelect.syncAll === 'function') {
							global.BlossomSearchableSelect.syncAll(modelSel);
						}
					} catch (_e2) {}
				}
				return;
			}

			if (col === 'name') {
				var opt = sel.selectedOptions && sel.selectedOptions[0];
				if (!opt) return;
				var v = '';
				try {
					v = (opt.getAttribute('data-vendor') || (opt.dataset ? opt.dataset.vendor : '') || '').trim();
				} catch (_e3) {}
				var vendorInp2 = tr.querySelector('td[data-col="vendor"] input');
				if (vendorInp2) vendorInp2.value = v || '-';
				return;
			}
		});

		
		table.addEventListener('click', function (ev) {
			var target = ev.target.closest('.js-sw-del, .js-sw-toggle');
			if (!target) return;
			var tr = ev.target.closest('tr');
			if (!tr) return;

			if (target.classList.contains('js-sw-del')) {
				swOpenDeleteModal(tr, function (delTr) {
					if (!delTr) return;
					var swId = delTr.getAttribute('data-id');
					var base = baseUrl();
					if (swId && base) {
						setBusy(true);
						apiFetchJson(base + '/' + encodeURIComponent(swId), { method: 'DELETE' })
							.then(function (res) {
								if (!res.ok || !res.json || res.json.success === false) {
									throw new Error((res.json && res.json.message) || '삭제 중 오류가 발생했습니다.');
								}
								if (delTr && delTr.parentNode) delTr.parentNode.removeChild(delTr);
								renderPage();
							})
							.catch(function (err) {
								alertMsg(err && err.message ? err.message : '삭제 중 오류가 발생했습니다.');
							})
							.finally(function () {
								setBusy(false);
							});
						return;
					}
					if (delTr && delTr.parentNode) delTr.parentNode.removeChild(delTr);
					renderPage();
				});
				return;
			}

			var action = target.getAttribute('data-action');
			if (action === 'edit') {
				toEditMode(tr);
				return;
			}
			if (action === 'save') {
				var payload = collectPayload(tr);
				if (!payload) return;

				var base2 = baseUrl();
				if (!base2) {
					applySavedState(tr, payload);
					renderPage();
					return;
				}

				var swId2 = tr.getAttribute('data-id');
				var url = base2 + (swId2 ? '/' + encodeURIComponent(swId2) : '');
				var method = swId2 ? 'PUT' : 'POST';
				setBusy(true);
				apiFetchJson(url, {
					method: method,
					headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
					body: JSON.stringify(payload),
				})
					.then(function (res) {
						if (!res.ok || !res.json || res.json.success === false) {
							throw new Error((res.json && res.json.message) || '저장 중 오류가 발생했습니다.');
						}
						var item = res.json.item;
						applySavedState(tr, item || payload);
						renderPage();
						try { swRefreshMaintenanceFromTab61(); } catch (_eMtSave) {}
					})
					.catch(function (err) {
						alertMsg(err && err.message ? err.message : '저장 중 오류가 발생했습니다.');
					})
					.finally(function () {
						setBusy(false);
					});
				return;
			}
		});

		function loadInitial() {
			var base = baseUrl();
			var tbody = table.querySelector('tbody');
			if (!tbody) {
				renderPage();
				return;
			}
			if (!base) {
				renderPage();
				return;
			}
			setBusy(true);
			apiFetchJson(base, { method: 'GET' })
				.then(function (res) {
					if (!res.ok || !res.json || res.json.success === false) {
						throw new Error((res.json && res.json.message) || '목록 조회 중 오류가 발생했습니다.');
					}
					tbody.innerHTML = '';
					(res.json.items || []).forEach(function (item) {
						tbody.appendChild(makeSavedRow(item));
					});
					renderPage();
					try { swRefreshMaintenanceFromTab61(); } catch (_eMtInit) {}
				})
				.catch(function (err) {
					alertMsg(err && err.message ? err.message : '목록 조회 중 오류가 발생했습니다.');
					renderPage();
				})
				.finally(function () {
					setBusy(false);
				});
		}

		updateEmptyState();
		loadInitial();
		return true;
	}

	global.BlossomTab02Software = global.BlossomTab02Software || {};
	global.BlossomTab02Software.init = initTab02Software;
	global.BlossomTab02Software.initFromPage = function (options) {
		return initTab02Software(options);
	};

	
	try {
		if (document.readyState === 'loading') {
			document.addEventListener(
				'DOMContentLoaded',
				function () {
					initTab02Software();
				},
				{ once: true }
			);
		} else {
			initTab02Software();
		}
	} catch (_e) {
		
	}
})(window);


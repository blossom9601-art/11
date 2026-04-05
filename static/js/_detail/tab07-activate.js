/*
 * tab07-activate.js
 * Activate procedure tab behavior.
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

	function escapeHTML(s) {
		return String(s == null ? '' : s)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function escapeAttr(s) {
		return String(s == null ? '' : s).replace(/"/g, '&quot;');
	}

	function normalizeCellText(v) {
		var s = String(v == null ? '' : v).trim();
		return s === '-' ? '' : s;
	}

	// Modal

	

	

	

	function openModalLocal(id) {
		try {
			if (global.openModal) return global.openModal(id);
			var el = $(id);
			if (!el) return;
			document.body.classList.add('modal-open');
			el.classList.add('show');
			el.setAttribute('aria-hidden', 'false');
		} catch (_e) {}
	}

	function closeModalLocal(id) {
		try {
			if (global.closeModal) return global.closeModal(id);
			var el = $(id);
			if (!el) return;
			el.classList.remove('show');
			el.setAttribute('aria-hidden', 'true');
			if (!document.querySelector('.modal-overlay-full.show')) {
				document.body.classList.remove('modal-open');
			}
		} catch (_e) {}
	}

	function fetchJsonOrThrow(url, opts) {
		return fetch(url, opts || {}).then(function (res) {
			return res
				.json()
				.catch(function () {
					return null;
				})
				.then(function (body) {
					if (!res.ok) {
						var msg = body && body.error ? body.error : 'HTTP ' + res.status;
						throw new Error(msg);
					}
					return body;
				});
		});
	}

	function getPageKeyFromPath() {
		try {
			var m = String(global.location.pathname || '').match(/\/p\/([^\/\?#]+)/);
			return m && m[1] ? decodeURIComponent(m[1]) : '';
		} catch (_e) {
			return '';
		}
	}

	function defaultAssetIdGetter(storagePrefix) {
		try {
			var raw =
				sessionStorage.getItem(storagePrefix + ':selected:row') ||
				localStorage.getItem(storagePrefix + ':selected:row');
			if (raw) {
				var row = JSON.parse(raw);
				var id = row && (row.id != null ? row.id : row.asset_id);
				var n = parsePositiveInt(id);
				if (n) return n;
			}
		} catch (_e) {}
		try {
			var qs = new URLSearchParams(global.location.search || '');
			var cand = qs.get('asset_id') || qs.get('assetId') || qs.get('id');
			return parsePositiveInt(cand);
		} catch (_e2) {}
		return null;
	}

	// Init

	

	

	

	function init(options) {
		var opt = options || {};
		var tableId = opt.tableId || 'ac-spec-table';
		var table = $(tableId);
		if (!table) return;
		if (table.dataset && table.dataset.acInited === '1') return;
		if (table.dataset) table.dataset.acInited = '1';

		var ownerSearchSourceKey = opt.ownerSearchSourceKey || 'hwActivateOwnerNames';

		var empty = $(opt.emptyId || 'ac-empty');
		var storagePrefix =
			opt.storagePrefix ||
			(typeof global.STORAGE_PREFIX !== 'undefined' && global.STORAGE_PREFIX ? global.STORAGE_PREFIX : 'onpremise');
		var apiBase = opt.apiBase || '/api/hw-activates';
		var apiEnabled = opt.apiEnabled !== false;
		var csvSavedOnly = opt.csvSavedOnly !== false; 
		var pageSizeStorageKey = opt.pageSizeStorageKey || storagePrefix + ':ac:pageSize';
		var legacyPageSizeStorageKey = opt.legacyPageSizeStorageKey || 'onpremise:ac:pageSize';
		var serviceSearchSourceKey = opt.serviceSearchSourceKey || 'hwActivateServiceNames';
		var serviceCatalogCache = { key: '', assetId: null, items: null };
		var EDIT_MODAL_ID = opt.editModalId || 'system-edit-modal';
		var EDIT_FORM_ID = opt.editFormId || 'system-edit-form';
		var EDIT_SAVE_ID = opt.editSaveId || 'system-edit-save';
		var EDIT_CLOSE_ID = opt.editCloseId || 'system-edit-close';
		var EDIT_TITLE_ID = opt.editTitleId || 'ac-editor-title';
		var EDIT_SUBTITLE_ID = opt.editSubtitleId || 'ac-editor-subtitle';
		var editorState = { row: null };

		// Searchable select async sources (owner directory)
		try {
			global.BlossomSearchableSelectSources = global.BlossomSearchableSelectSources || {};
			if (typeof global.BlossomSearchableSelectSources[serviceSearchSourceKey] !== 'function') {
				global.BlossomSearchableSelectSources[serviceSearchSourceKey] = function (ctx) {
					ctx = ctx || {};
					var query = String(ctx.query || '').trim().toLowerCase();
					return loadServiceCatalog().then(function (items) {
						var list = Array.isArray(items) ? items.slice() : [];
						if (query) {
							list = list.filter(function (item) {
								var hay = [item.name, item.type, item.vendor, item.subtype].join(' ').toLowerCase();
								return hay.indexOf(query) > -1;
							});
						}
						return list.map(function (item) {
							var label = item.vendor ? item.name + ' · ' + item.vendor : item.name;
							return {
								value: item.name,
								label: label,
								displayLabel: item.name,
								searchText: [item.name, item.type, item.vendor, item.subtype].join(' '),
							};
						});
					});
				};
			}
			if (typeof global.BlossomSearchableSelectSources[ownerSearchSourceKey] !== 'function') {
				global.BlossomSearchableSelectSources[ownerSearchSourceKey] = function (ctx) {
					ctx = ctx || {};
					var q = String(ctx.query || '').trim();
					var url = '/api/user-profiles?limit=50';
					if (q) url += '&q=' + encodeURIComponent(q);
					url += '&_=' + Date.now();
					return fetch(url, { headers: { Accept: 'application/json' } })
						.then(function (r) {
							return r.json().catch(function () {
								return null;
							});
						})
						.then(function (json) {
							if (!json || json.success === false) return [];
							var items = Array.isArray(json.items) ? json.items : [];
							return items
								.map(function (it) {
									var name = it && it.name != null ? String(it.name).trim() : '';
									if (!name) return null;
									var dept = it && it.department != null ? String(it.department).trim() : '';
									var label = dept ? name + ' (' + dept + ')' : name;
									return { value: label, label: label, displayLabel: label, searchText: dept ? (name + ' ' + dept) : name };
								})
								.filter(function (x) {
									return !!x;
								});
						})
						.catch(function () {
							return [];
						});
				};
			}
		} catch (_eSrc) {
			// ignore
		}

		function enhanceRowSearchSelects(scope) {
			try {
				var retryKey = '__acEnhRetryCount';
				if (!global.BlossomSearchableSelect || typeof global.BlossomSearchableSelect.enhance !== 'function') {
					var n = (table.dataset && table.dataset[retryKey]) ? parseInt(table.dataset[retryKey], 10) : 0;
					if (!isNaN(n) && n < 10) {
						if (table.dataset) table.dataset[retryKey] = String(n + 1);
						setTimeout(function () {
							enhanceRowSearchSelects(scope);
						}, 80);
					}
					return;
				}
				var root = scope || table;
				var sels = root.querySelectorAll ? root.querySelectorAll('select.search-select') : [];
				Array.prototype.forEach.call(sels, function (s) {
					try {
						global.BlossomSearchableSelect.enhance(s);
					} catch (_e) {}
				});
			} catch (_e2) {}
		}

		function ownerSelectHtml(current) {
			var cur = String(current || '').trim();
			if (cur === '-') cur = '';
			var optCur = cur
				? '<option value="' + escapeAttr(cur) + '" selected>' + escapeHTML(cur) + '</option>'
				: '<option value="" selected>-</option>';
			return (
				'<select class="search-select" data-searchable-scope="page" data-search-source="' +
				ownerSearchSourceKey +
				'" data-placeholder="-" data-allow-clear="true" required>' +
				optCur +
				'</select>'
			);
		}

		function serviceSelectHtml(current) {
			var cur = String(current || '').trim();
			if (cur === '-') cur = '';
			var optCur = cur
				? '<option value="' + escapeAttr(cur) + '" selected>' + escapeHTML(cur) + '</option>'
				: '<option value="" selected>-</option>';
			return (
				'<select class="search-select" id="ac-form-svc-name" data-searchable-scope="page" data-search-source="' +
				serviceSearchSourceKey +
				'" data-placeholder="-" data-allow-clear="true" required>' +
				optCur +
				'</select>'
			);
		}

		function getStoredProcedure(tr, key) {
			if (!tr) return '';
			var dsKey = key === 'start' ? 'acStart' : key === 'stop' ? 'acStop' : 'acCheck';
			if (tr.dataset && typeof tr.dataset[dsKey] === 'string') return normalizeCellText(tr.dataset[dsKey]);
			return '';
		}

		function setStoredProcedure(tr, key, value) {
			if (!tr || !tr.dataset) return;
			var dsKey = key === 'start' ? 'acStart' : key === 'stop' ? 'acStop' : 'acCheck';
			tr.dataset[dsKey] = String(value == null ? '' : value);
		}

		function getServiceCatalogCacheKey() {
			var assetId = getAssetId();
			var scopeKey = getScopeKey();
			return String(scopeKey || '') + '|' + String(assetId || '');
		}

		function loadServiceCatalog() {
			var assetId = getAssetId();
			var cacheKey = getServiceCatalogCacheKey();
			if (serviceCatalogCache.key === cacheKey && Array.isArray(serviceCatalogCache.items)) {
				return Promise.resolve(serviceCatalogCache.items);
			}
			if (!assetId) {
				serviceCatalogCache = { key: cacheKey, assetId: assetId, items: [] };
				return Promise.resolve([]);
			}
			return fetchJsonOrThrow('/api/hardware/assets/' + encodeURIComponent(String(assetId)) + '/software', {
				method: 'GET',
				headers: { Accept: 'application/json' },
			})
				.then(function (data) {
					var items = data && Array.isArray(data.items) ? data.items : [];
					var mapped = items
						.map(function (item) {
							var name = String(item && item.name != null ? item.name : '').trim();
							if (!name) return null;
							return {
								name: name,
								type: String(item && item.type != null ? item.type : '').trim(),
								subtype: String(item && item.subtype != null ? item.subtype : '').trim(),
								vendor: String(item && item.vendor != null ? item.vendor : '').trim(),
							};
						})
						.filter(function (item) { return !!item; });
					serviceCatalogCache = { key: cacheKey, assetId: assetId, items: mapped };
					return mapped;
				})
				.catch(function () {
					serviceCatalogCache = { key: cacheKey, assetId: assetId, items: [] };
					return [];
				});
		}

		function findServiceMetaByName(name) {
			var items = Array.isArray(serviceCatalogCache.items) ? serviceCatalogCache.items : [];
			var target = String(name || '').trim();
			for (var i = 0; i < items.length; i++) {
				if (String(items[i].name || '').trim() === target) return items[i];
			}
			return null;
		}

		function getScopeKey() {
			var pageKey = getPageKeyFromPath();
			return pageKey || storagePrefix;
		}

		var getAssetId = opt.getAssetId || function () {
			return defaultAssetIdGetter(storagePrefix);
		};

		function getRowId(tr) {
			if (!tr) return null;
			var v =
				(tr.dataset && (tr.dataset.activateId || tr.dataset.acId)) ||
				tr.getAttribute('data-activate-id') ||
				tr.getAttribute('data-ac-id');
			return parsePositiveInt(v);
		}

		function setRowId(tr, id) {
			try {
				var n = parsePositiveInt(id);
				if (!n) return;
				tr.dataset.activateId = String(n);
				tr.setAttribute('data-activate-id', String(n));
			} catch (_e) {}
		}

		function readCell(tr, col) {
			try {
				if (col === 'start' || col === 'stop' || col === 'check') {
					var stored = getStoredProcedure(tr, col);
					if (stored) return stored;
				}
				var td = tr.querySelector('[data-col="' + col + '"]');
				if (!td) return '';
				if (col === 'start' || col === 'stop' || col === 'check') {
					var full = td.dataset && td.dataset.full ? td.dataset.full : '';
					if (full) return normalizeCellText(full);
					var inp2 = td.querySelector('input, textarea');
					if (inp2 && typeof inp2.value === 'string') return normalizeCellText(inp2.value);
					var pv = td.querySelector('.procedure-preview');
					if (pv) {
						return normalizeCellText(pv.getAttribute('title') || pv.dataset.full || pv.textContent);
					}
				}
				var inp = td.querySelector('input, textarea, select');
				var val = inp ? inp.value : td.textContent || '';
				return normalizeCellText(val);
			} catch (_e) {
				return '';
			}
		}


		enhanceRowSearchSelects(table);

		function ensurePreviewLabel(td) {
			try {
				if (!td) return;
				var el = td.querySelector('.procedure-preview');
				if (!el) return;
				var full = (td.dataset && td.dataset.full) ? td.dataset.full : el.getAttribute('title') || '';
				if (!full) return;
				if (el.scrollWidth > el.clientWidth) {
					el.textContent = '세부내용 참조';
					return;
				}
				setTimeout(function () {
					try {
						var el2 = td.querySelector('.procedure-preview');
						if (!el2) return;
						if (el2.scrollWidth > el2.clientWidth) el2.textContent = '세부내용 참조';
					} catch (_e2) {}
				}, 0);
			} catch (_e) {}
		}

		function renderSavedRow(item) {
			var tr = document.createElement('tr');
			if (item && item.id != null) setRowId(tr, item.id);
			setStoredProcedure(tr, 'start', item && item.start ? item.start : '');
			setStoredProcedure(tr, 'stop', item && item.stop ? item.stop : '');
			setStoredProcedure(tr, 'check', item && item.check ? item.check : '');

			tr.innerHTML =
				'<td><input type="checkbox" class="ac-row-check" aria-label="행 선택"></td>' +
				'<td data-col="svc_type">' +
				escapeHTML(item && item.svc_type ? item.svc_type : '-') +
				'</td>' +
				'<td data-col="svc_name" style="cursor:pointer;color:var(--primary-color,#6366f1);">' +
				escapeHTML(item && item.svc_name ? item.svc_name : '-') +
				'</td>' +
				'<td data-col="account">' +
				escapeHTML(item && item.account ? item.account : '-') +
				'</td>' +
				'<td data-col="owner">' +
				escapeHTML(item && item.owner ? item.owner : '-') +
				'</td>' +
				'<td class="system-actions table-actions">' +
				'<button class="action-btn js-ac-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button>' +
				'<button class="action-btn danger js-ac-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>' +
				'</td>';

			return tr;
		}

	// API

	

	

	

		function apiList(scopeKey, assetId) {
			var url =
				apiBase +
				'?scope_key=' +
				encodeURIComponent(scopeKey) +
				'&asset_id=' +
				encodeURIComponent(String(assetId)) +
				'&page=1&page_size=5000';
			return fetchJsonOrThrow(url, { method: 'GET', headers: { Accept: 'application/json' } });
		}

		function apiCreate(payload) {
			return fetchJsonOrThrow(apiBase, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
				body: JSON.stringify(payload || {}),
			});
		}

		function apiUpdate(id, payload) {
			return fetchJsonOrThrow(apiBase + '/' + encodeURIComponent(String(id)), {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
				body: JSON.stringify(payload || {}),
			});
		}

		function apiDelete(id) {
			return fetchJsonOrThrow(apiBase + '/' + encodeURIComponent(String(id)), {
				method: 'DELETE',
				headers: { Accept: 'application/json' },
			});
		}

		function loadFromApi() {
			if (!apiEnabled) return;
			var assetId = getAssetId();
			var scopeKey = getScopeKey();
			if (!assetId || !scopeKey) return;
			apiList(scopeKey, assetId)
				.then(function (data) {
					var items = data && data.items ? data.items : [];
					var tbody = table.querySelector('tbody');
					if (!tbody) return;
					tbody.innerHTML = '';
					items.forEach(function (it) {
						tbody.appendChild(renderSavedRow(it));
					});
					updateEmptyState();
				})
				.catch(function (err) {
					try {
						console.error('[tab07-activate] load failed', err);
					} catch (_e) {}
				});
		}

		function persistRow(tr) {
			if (!apiEnabled) return;
			var assetId = getAssetId();
			var scopeKey = getScopeKey();
			if (!assetId || !scopeKey) return;
			var payload = {
				scope_key: scopeKey,
				asset_id: assetId,
				svc_type: readCell(tr, 'svc_type'),
				svc_name: readCell(tr, 'svc_name'),
				account: readCell(tr, 'account'),
				start: readCell(tr, 'start'),
				stop: readCell(tr, 'stop'),
				check: readCell(tr, 'check'),
				owner: readCell(tr, 'owner'),
			};
			var id = getRowId(tr);
			var p = id ? apiUpdate(id, payload) : apiCreate(payload);
			p.then(function (saved) {
				if (saved && saved.id != null) setRowId(tr, saved.id);
			}).catch(function (err) {
				try {
					console.error('[tab07-activate] save failed', err);
				} catch (_e) {}
			});
		}

		function rowsAll() {
			var tbody = table.querySelector('tbody');
			if (!tbody) return [];
			return Array.from(tbody.querySelectorAll('tr'));
		}

		function rowSaved(tr) {
			var t = tr.querySelector('.js-ac-toggle');
			var inEdit = t && t.getAttribute('data-action') === 'save';
			if (inEdit) return false;
			return !tr.querySelector('td[data-col] input, td[data-col] select, td[data-col] textarea');
		}

		function visibleRows() {
			return rowsAll().filter(function (tr) {
				return !(tr.hasAttribute('data-hidden') || tr.style.display === 'none');
			});
		}

		function exportableRows() {
			var trs = visibleRows();
			return csvSavedOnly ? trs.filter(rowSaved) : trs;
		}

	// CSV

	

	

	

		function acEscapeCSV(val) {
			return '"' + String(val).replace(/"/g, '""') + '"';
		}

		function acReadText(td) {
			if (!td) return '';
			try {
				var full = td.dataset && td.dataset.full ? td.dataset.full : '';
				if (full) return full;
				var pv = td.querySelector('.procedure-preview');
				if (pv) return pv.getAttribute('title') || pv.dataset.full || pv.textContent.trim();
				var input = td.querySelector('input, textarea');
				if (input) return input.value || '';
				return (td.textContent || '').trim();
			} catch (_e) {
				return (td.textContent || '').trim();
			}
		}

		function acExportCSV(onlySelected) {
			var trs = exportableRows();
			if (onlySelected) {
				trs = trs.filter(function (tr) {
					var cb = tr.querySelector('.ac-row-check');
					return cb && cb.checked;
				});
			}
			if (!trs.length) return;
			var headers = ['서비스 구분', '서비스 이름', '계정', '기동절차', '중지절차', '확인방법', '담당자'];
			var rows = trs.map(function (tr) {
				function textCol(name) {
					var td = tr.querySelector('[data-col="' + name + '"]');
					return td ? String(td.textContent || '').trim() : '';
				}
				function procCol(name) {
					return getStoredProcedure(tr, name);
				}
				return [
					textCol('svc_type'),
					textCol('svc_name'),
					textCol('account'),
					procCol('start'),
					procCol('stop'),
					procCol('check'),
					textCol('owner'),
				];
			});
			var lines = [headers]
				.concat(rows)
				.map(function (arr) {
					return arr.map(acEscapeCSV).join(',');
				});
			var csv = '\uFEFF' + lines.join('\r\n');
			var d = new Date();
			var yyyy = d.getFullYear();
			var mm = String(d.getMonth() + 1).padStart(2, '0');
			var dd = String(d.getDate()).padStart(2, '0');
			var filename = 'activate_' + yyyy + mm + dd + '.csv';
			try {
				var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
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
				a2.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
				a2.download = filename;
				document.body.appendChild(a2);
				a2.click();
				document.body.removeChild(a2);
			}
		}

	// Pagination

	

		
		var acState = { page: 1, pageSize: 10 };
		var infoEl = $(opt.paginationInfoId || 'ac-pagination-info');
		var numWrap = $(opt.pageNumbersId || 'ac-page-numbers');
		var btnFirst = $(opt.firstBtnId || 'ac-first');
		var btnPrev = $(opt.prevBtnId || 'ac-prev');
		var btnNext = $(opt.nextBtnId || 'ac-next');
		var btnLast = $(opt.lastBtnId || 'ac-last');

		function acTotal() {
			return rowsAll().length;
		}

		function acPages() {
			var total = acTotal();
			return Math.max(1, Math.ceil(total / acState.pageSize));
		}

		function acClampPage() {
			var pages = acPages();
			if (acState.page > pages) acState.page = pages;
			if (acState.page < 1) acState.page = 1;
		}

		function acUpdatePaginationUI() {
			try {
				if (infoEl) {
					var total = acTotal();
					var start = total ? (acState.page - 1) * acState.pageSize + 1 : 0;
					var end = Math.min(total, acState.page * acState.pageSize);
					infoEl.textContent = start + '-' + end + ' / ' + total + '개 항목';
				}
				if (numWrap) {
					var pages = acPages();
					numWrap.innerHTML = '';
					for (var p = 1; p <= pages && p <= 50; p++) {
						var b = document.createElement('button');
						b.className = 'page-btn' + (p === acState.page ? ' active' : '');
						b.textContent = String(p);
						b.dataset.page = String(p);
						numWrap.appendChild(b);
					}
				}
				var pages2 = acPages();
				if (btnFirst) btnFirst.disabled = acState.page === 1;
				if (btnPrev) btnPrev.disabled = acState.page === 1;
				if (btnNext) btnNext.disabled = acState.page === pages2;
				if (btnLast) btnLast.disabled = acState.page === pages2;

				var sizeSel = $(opt.pageSizeSelectId || 'ac-page-size');
				if (sizeSel) {
					var none = acTotal() === 0;
					sizeSel.disabled = none;
					if (none) {
						try {
							sizeSel.value = '10';
							acState.pageSize = 10;
						} catch (_e) {}
					}
				}
			} catch (_e) {}
		}

		function acRenderPage() {
			acClampPage();
			var rows = rowsAll();
			var startIdx = (acState.page - 1) * acState.pageSize;
			var endIdx = startIdx + acState.pageSize - 1;
			rows.forEach(function (tr, idx) {
				var visible = idx >= startIdx && idx <= endIdx;
				tr.style.display = visible ? '' : 'none';
				if (visible) tr.removeAttribute('data-hidden');
				else tr.setAttribute('data-hidden', '1');
				var cb = tr.querySelector('.ac-row-check');
				if (cb) tr.classList.toggle('selected', !!cb.checked && visible);
			});
			acUpdatePaginationUI();
			var sa = $(opt.selectAllId || 'ac-select-all');
			if (sa) {
				var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .ac-row-check');
				if (visChecks.length) {
					sa.checked = Array.prototype.every.call(visChecks, function (c) {
						return c.checked;
					});
				} else {
					sa.checked = false;
				}
			}
		}

		function acGo(p) {
			acState.page = p;
			acRenderPage();
		}

		function acGoDelta(d) {
			acGo(acState.page + d);
		}

		function acGoFirst() {
			acGo(1);
		}

		function acGoLast() {
			acGo(acPages());
		}

		(function initPageSize() {
			try {
				var saved = localStorage.getItem(pageSizeStorageKey) || localStorage.getItem(legacyPageSizeStorageKey);
				var sel = $(opt.pageSizeSelectId || 'ac-page-size');
				if (sel) {
					if (saved && ['10', '20', '50', '100'].indexOf(saved) > -1) {
						acState.pageSize = parseInt(saved, 10);
						sel.value = saved;
					}
					sel.addEventListener('change', function () {
						var v = parseInt(sel.value, 10);
						if (!isNaN(v)) {
							acState.page = 1;
							acState.pageSize = v;
							try {
								localStorage.setItem(pageSizeStorageKey, String(v));
								
								localStorage.setItem(legacyPageSizeStorageKey, String(v));
							} catch (_e) {}
							acRenderPage();
						}
					});
				}
			} catch (_e) {}
		})();

		if (numWrap) {
			numWrap.addEventListener('click', function (e) {
				var b = e.target.closest('button.page-btn');
				if (!b) return;
				var p = parseInt(b.dataset.page, 10);
				if (!isNaN(p)) acGo(p);
			});
		}
		if (btnFirst) btnFirst.addEventListener('click', acGoFirst);
		if (btnPrev)
			btnPrev.addEventListener('click', function () {
				acGoDelta(-1);
			});
		if (btnNext)
			btnNext.addEventListener('click', function () {
				acGoDelta(1);
			});
		if (btnLast) btnLast.addEventListener('click', acGoLast);

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
			var csvBtn = $(opt.downloadBtnId || 'ac-download-btn');
			if (csvBtn) {
				var has = !!table.querySelector('tbody tr');
				csvBtn.disabled = !has;
				csvBtn.setAttribute('aria-disabled', (!has).toString());
				csvBtn.title = has ? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.';
			}
			acRenderPage();
		}

		updateEmptyState();
		loadFromApi();

		
		var selectAll = $(opt.selectAllId || 'ac-select-all');
		if (selectAll) {
			selectAll.addEventListener('change', function () {
				var checks = table.querySelectorAll('.ac-row-check:not([disabled])');
				checks.forEach(function (c) {
					var tr = c.closest('tr');
					var hidden = tr && (tr.hasAttribute('data-hidden') || tr.style.display === 'none');
					if (!hidden) c.checked = !!selectAll.checked;
					if (tr) tr.classList.toggle('selected', !!c.checked && !hidden);
				});
			});
		}

		table.addEventListener('click', function (ev) {
			var tr = ev.target.closest('tr');
			if (!tr || !tr.parentNode || tr.parentNode.tagName.toLowerCase() !== 'tbody') return;
			var isControl = ev.target.closest('button, a, input, select, textarea, label');
			var onCheckbox = ev.target.closest('input[type="checkbox"].ac-row-check');
			if (isControl && !onCheckbox) return;
			if (onCheckbox) return;
			var cb = tr.querySelector('.ac-row-check');
			if (!cb) return;
			var hidden = tr.hasAttribute('data-hidden') || tr.style.display === 'none';
			if (hidden) return;
			cb.checked = !cb.checked;
			tr.classList.toggle('selected', cb.checked);
			var sa = $(opt.selectAllId || 'ac-select-all');
			if (sa) {
				var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .ac-row-check');
				sa.checked = visChecks.length
					? Array.prototype.every.call(visChecks, function (c) {
						return c.checked;
					})
					: false;
			}
		});

		table.addEventListener('change', function (ev) {
			var cb = ev.target.closest('.ac-row-check');
			if (!cb) return;
			var tr = cb.closest('tr');
			if (tr) {
				var hidden = tr.hasAttribute('data-hidden') || tr.style.display === 'none';
				tr.classList.toggle('selected', !!cb.checked && !hidden);
			}
			var sa = $(opt.selectAllId || 'ac-select-all');
			if (sa) {
				var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .ac-row-check');
				sa.checked = visChecks.length
					? Array.prototype.every.call(visChecks, function (c) {
						return c.checked;
					})
					: false;
			}
		});

		
		(function () {
			var btn = $(opt.downloadBtnId || 'ac-download-btn');
			var modalId = opt.downloadModalId || 'ac-download-modal';
			var closeBtn = $(opt.downloadCloseId || 'ac-download-close');
			var confirmBtn = $(opt.downloadConfirmId || 'ac-download-confirm');
			var modalEl = $(modalId);
			if (btn) {
				btn.addEventListener('click', function () {
					if (btn.disabled) return;
					var saved = exportableRows();
					var total = saved.length;
					if (total <= 0) return;
					var selectedCount = saved.filter(function (tr) {
						var cb = tr.querySelector('.ac-row-check');
						return cb && cb.checked;
					}).length;
					var subtitle = $(opt.downloadSubtitleId || 'ac-download-subtitle');
					if (subtitle) {
						subtitle.textContent =
							selectedCount > 0
								? '선택된 ' + selectedCount + '개 또는 전체 ' + total + '개 결과 중 범위를 선택하세요.'
								: '현재 결과 ' + total + '개 항목을 CSV로 내보냅니다.';
					}
					var rowSelectedWrap = $(opt.csvRangeRowSelectedId || 'ac-csv-range-row-selected');
					var optSelected = $(opt.csvRangeSelectedId || 'ac-csv-range-selected');
					var optAll = $(opt.csvRangeAllId || 'ac-csv-range-all');
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
			if (modalEl) {
				modalEl.addEventListener('click', function (e) {
					if (e.target === modalEl) closeModalLocal(modalId);
				});
				document.addEventListener('keydown', function (e) {
					if (e.key === 'Escape' && modalEl.classList.contains('show')) closeModalLocal(modalId);
				});
			}
			if (confirmBtn) {
				confirmBtn.addEventListener('click', function () {
					var onlySel = !!($(opt.csvRangeSelectedId || 'ac-csv-range-selected') && $(opt.csvRangeSelectedId || 'ac-csv-range-selected').checked);
					acExportCSV(onlySel);
					closeModalLocal(modalId);
				});
			}
		})();

		
		function extractRowData(tr) {
			return {
				svc_type: readCell(tr, 'svc_type'),
				svc_name: readCell(tr, 'svc_name'),
				account: readCell(tr, 'account'),
				start: getStoredProcedure(tr, 'start'),
				stop: getStoredProcedure(tr, 'stop'),
				check: getStoredProcedure(tr, 'check'),
				owner: readCell(tr, 'owner'),
			};
		}

		function ensureActionButtons(tr) {
			var actions = tr.querySelector('.table-actions');
			if (!actions) return;
			actions.classList.add('system-actions');
			actions.innerHTML =
				'<button class="action-btn js-ac-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button>' +
				'<button class="action-btn danger js-ac-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>';
		}

		function applyRowData(tr, data) {
			function writeText(col, value) {
				var td = tr.querySelector('[data-col="' + col + '"]');
				if (td) td.textContent = value ? String(value) : '-';
			}
			writeText('svc_type', data.svc_type);
			writeText('svc_name', data.svc_name);
			writeText('account', data.account);
			writeText('owner', data.owner);
			setStoredProcedure(tr, 'start', data.start);
			setStoredProcedure(tr, 'stop', data.stop);
			setStoredProcedure(tr, 'check', data.check);
			ensureActionButtons(tr);
		}

		function editorForm() {
			return $(EDIT_FORM_ID);
		}

		function setEditorMode(isNew) {
			var titleEl = $(EDIT_TITLE_ID);
			var subtitleEl = $(EDIT_SUBTITLE_ID);
			if (titleEl) titleEl.textContent = isNew ? '기동절차 추가' : '기동절차 수정';
			if (subtitleEl) subtitleEl.textContent = isNew ? '새 기동절차 정보를 등록합니다.' : '선택한 기동절차 정보를 수정합니다.';
		}

		function toggleEditorFields(form) {
			if (!form) return;
			var svcNameSel = form.querySelector('#ac-form-svc-name');
			var hasName = !!(svcNameSel && String(svcNameSel.value || '').trim());
			Array.prototype.forEach.call(form.querySelectorAll('[data-ac-dependent="service"]'), function (row) {
				row.hidden = !hasName;
			});
		}

		function syncEditorServiceMeta(form) {
			if (!form) return;
			var svcNameSel = form.querySelector('#ac-form-svc-name');
			var svcTypeInput = form.querySelector('#ac-form-svc-type');
			if (!(svcNameSel && svcTypeInput)) return;
			var meta = findServiceMetaByName(String(svcNameSel.value || '').trim());
			if (meta && meta.type) svcTypeInput.value = meta.type;
			else if (!String(svcNameSel.value || '').trim()) svcTypeInput.value = '';
		}

		function buildEditorFormHtml(data) {
			var item = data || {};
			return (
				'<div class="form-section">' +
				'  <div class="section-header"><h4>기동 절차 정보</h4></div>' +
				'  <div class="form-grid">' +
				'    <div class="form-row">' +
				'      <label for="ac-form-svc-name">서비스 이름 <span class="req-star" aria-hidden="true">*</span></label>' +
				'      <input id="ac-form-svc-name" class="form-input" type="text" value="' + escapeAttr(item.svc_name || '') + '" placeholder="서비스 이름">' +
				'    </div>' +
				'    <div class="form-row">' +
				'      <label for="ac-form-svc-type">서비스 구분 <span class="req-star" aria-hidden="true">*</span></label>' +
				'      <input id="ac-form-svc-type" class="form-input" type="text" value="' + escapeAttr(item.svc_type || '') + '" placeholder="서비스 구분">' +
				'    </div>' +
				'    <div class="form-row">' +
				'      <label for="ac-form-account">계정</label>' +
				'      <input id="ac-form-account" class="form-input" type="text" value="' + escapeAttr(item.account || '') + '" placeholder="계정">' +
				'    </div>' +
				'    <div class="form-row">' +
				'      <label for="ac-form-owner">담당자 <span class="req-star" aria-hidden="true">*</span></label>' +
				       ownerSelectHtml(item.owner || '') +
				'    </div>' +
				'    <div class="form-row" style="grid-column: 1 / -1;">' +
				'      <label for="ac-form-start">기동절차</label>' +
				'      <textarea id="ac-form-start" class="form-input" style="min-height: 120px; resize: vertical;" placeholder="기동 절차를 입력하세요">' + escapeHTML(item.start || '') + '</textarea>' +
				'    </div>' +
				'    <div class="form-row" style="grid-column: 1 / -1;">' +
				'      <label for="ac-form-stop">중지절차</label>' +
				'      <textarea id="ac-form-stop" class="form-input" style="min-height: 120px; resize: vertical;" placeholder="중지 절차를 입력하세요">' + escapeHTML(item.stop || '') + '</textarea>' +
				'    </div>' +
				'    <div class="form-row" style="grid-column: 1 / -1;">' +
				'      <label for="ac-form-check">확인방법</label>' +
				'      <textarea id="ac-form-check" class="form-input" style="min-height: 120px; resize: vertical;" placeholder="확인 방법을 입력하세요">' + escapeHTML(item.check || '') + '</textarea>' +
				'    </div>' +
				'  </div>' +
				'</div>'
			);
		}

		function buildViewFormHtml(data) {
			var item = data || {};
			var RO = 'border:none;background:transparent;height:auto;overflow:visible;padding:8px 0;color:#374151;font-size:13px;';
			var RO_ML = 'border:none;background:var(--bg-secondary,#f9fafb);border-radius:8px;height:auto;overflow:visible;padding:12px 14px;color:#374151;font-size:13px;';
			function val(v) { var s = String(v == null ? '' : v).trim(); return s || '-'; }
			function multiline(v) {
				var s = String(v == null ? '' : v).trim();
				if (!s) return '<span style="color:var(--text-quaternary,#9ca3af)">-</span>';
				return '<pre style="white-space:pre-wrap;word-break:break-word;margin:0;line-height:1.6;font-family:inherit;">' + escapeHTML(s) + '</pre>';
			}
			return (
				'<div class="form-section">' +
				'  <div class="section-header"><h4>기동 절차 정보</h4></div>' +
				'  <div class="form-grid">' +
				'    <div class="form-row"><label>서비스 이름</label><div class="form-input-static" style="' + RO + '">' + escapeHTML(val(item.svc_name)) + '</div></div>' +
				'    <div class="form-row"><label>서비스 구분</label><div class="form-input-static" style="' + RO + '">' + escapeHTML(val(item.svc_type)) + '</div></div>' +
				'    <div class="form-row"><label>계정</label><div class="form-input-static" style="' + RO + '">' + escapeHTML(val(item.account)) + '</div></div>' +
				'    <div class="form-row"><label>담당자</label><div class="form-input-static" style="' + RO + '">' + escapeHTML(val(item.owner)) + '</div></div>' +
				'    <div class="form-row" style="grid-column: 1 / -1;"><label>기동절차</label><div class="form-input-static" style="' + RO_ML + '">' + multiline(item.start) + '</div></div>' +
				'    <div class="form-row" style="grid-column: 1 / -1;"><label>중지절차</label><div class="form-input-static" style="' + RO_ML + '">' + multiline(item.stop) + '</div></div>' +
				'    <div class="form-row" style="grid-column: 1 / -1;"><label>확인방법</label><div class="form-input-static" style="' + RO_ML + '">' + multiline(item.check) + '</div></div>' +
				'  </div>' +
				'</div>'
			);
		}

		var VIEW_MODAL_ID = 'ac-view-modal';

		function openViewModal(tr) {
			if (!tr) return;
			var body = $('ac-view-body');
			if (!body) return;
			var data = extractRowData(tr);
			var titleEl = $('ac-view-title');
			if (titleEl) titleEl.textContent = data.svc_name || '기동절차 상세';
			body.innerHTML = buildViewFormHtml(data);
			openModalLocal(VIEW_MODAL_ID);
		}

		function closeViewModal() {
			closeModalLocal(VIEW_MODAL_ID);
		}

		(function wireViewModal() {
			var closeBtn = $('ac-view-close');
			var closeBtn2 = $('ac-view-close-btn');
			var modal = $(VIEW_MODAL_ID);
			if (closeBtn) closeBtn.addEventListener('click', closeViewModal);
			if (closeBtn2) closeBtn2.addEventListener('click', closeViewModal);
			if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) closeViewModal(); });
			document.addEventListener('keydown', function (e) {
				if (e.key === 'Escape' && modal && modal.classList.contains('show')) closeViewModal();
			});
		})();

		function openEditorModal(tr) {
			var form = editorForm();
			if (!form) return;
			setEditorMode(!tr);
			editorState.row = tr || null;
			form.innerHTML = buildEditorFormHtml(tr ? extractRowData(tr) : {});
			enhanceRowSearchSelects(form);
			openModalLocal(EDIT_MODAL_ID);
		}

		function closeEditorModal() {
			closeModalLocal(EDIT_MODAL_ID);
			editorState.row = null;
		}

		function readEditorPayload(form) {
			var ownerSel = form.querySelector('select[data-search-source="' + ownerSearchSourceKey + '"]');
			return {
				svc_type: String((form.querySelector('#ac-form-svc-type') || {}).value || '').trim(),
				svc_name: String((form.querySelector('#ac-form-svc-name') || {}).value || '').trim(),
				account: String((form.querySelector('#ac-form-account') || {}).value || '').trim(),
				start: String((form.querySelector('#ac-form-start') || {}).value || '').trim(),
				stop: String((form.querySelector('#ac-form-stop') || {}).value || '').trim(),
				check: String((form.querySelector('#ac-form-check') || {}).value || '').trim(),
				owner: String((ownerSel || {}).value || '').trim(),
			};
		}

		function validateEditorForm(form) {
			var payload = readEditorPayload(form);
			var firstInvalid = null;
			function mark(el, invalid) {
				if (!el) return;
				var targetEl = el;
				try {
					if (el.tagName === 'SELECT' && el.classList.contains('search-select')) {
						var wrap = el.closest('.fk-searchable-control');
						if (wrap) {
							var disp = wrap.querySelector('.fk-searchable-display');
							if (disp) targetEl = disp;
						}
					}
				} catch (_e) {}
				if (invalid) {
					targetEl.classList.add('input-error');
					targetEl.setAttribute('aria-invalid', 'true');
					if (!firstInvalid) firstInvalid = targetEl;
				} else {
					targetEl.classList.remove('input-error');
					targetEl.removeAttribute('aria-invalid');
				}
			}
			mark(form.querySelector('#ac-form-svc-name'), !payload.svc_name);
			mark(form.querySelector('#ac-form-svc-type'), !payload.svc_type);
			mark(form.querySelector('select[data-search-source="' + ownerSearchSourceKey + '"]'), !payload.owner);
			if (firstInvalid) {
				try { firstInvalid.focus(); } catch (_e2) {}
				return null;
			}
			return payload;
		}

		(function wireEditorModal() {
			var closeBtn = $(EDIT_CLOSE_ID);
			var saveBtn = $(EDIT_SAVE_ID);
			var modal = $(EDIT_MODAL_ID);
			if (closeBtn) closeBtn.addEventListener('click', closeEditorModal);
			if (modal) {
				modal.addEventListener('click', function (e) {
					if (e.target === modal) closeEditorModal();
				});
			}
			if (saveBtn) {
				saveBtn.addEventListener('click', function () {
					var form = editorForm();
					if (!form) return;
					var payload = validateEditorForm(form);
					if (!payload) return;
					var row = editorState.row;
					if (!row) {
						var tbody = table.querySelector('tbody');
						if (!tbody) return;
						row = renderSavedRow(payload);
						tbody.appendChild(row);
						applyRowData(row, payload);
						try { acGoLast(); } catch (_e) {}
					} else {
						applyRowData(row, payload);
					}
					updateEmptyState();
					persistRow(row);
					closeEditorModal();
				});
			}
		})();

		var addBtn = $(opt.addBtnId || 'ac-row-add');
		if (addBtn) {
			addBtn.addEventListener('click', function () {
				openEditorModal(null);
			});
		}

		
		var detailModal = $(opt.detailModalId || 'ac-detail-modal');
		var detailText = $(opt.detailTextId || 'ac-detail-text');
		var detailLabel = $(opt.detailLabelId || 'ac-detail-label');
		var detailClose = $(opt.detailCloseId || 'ac-detail-close');
		var detailSave = $(opt.detailSaveId || 'ac-detail-save');
		var activeDetailTarget = null; 

		function openDetail(labelText, currentVal) {
			if (!detailModal) return;
			document.body.classList.add('modal-open');
			if (detailLabel) detailLabel.textContent = labelText || '세부내용';
			if (detailText) detailText.value = currentVal || '';
			detailModal.classList.add('show');
			detailModal.setAttribute('aria-hidden', 'false');
			if (detailText) {
				try {
					detailText.focus();
				} catch (_e) {}
			}
		}

		function closeDetail() {
			if (!detailModal) return;
			detailModal.classList.remove('show');
			detailModal.setAttribute('aria-hidden', 'true');
			if (!document.querySelector('.modal-overlay-full.show')) {
				document.body.classList.remove('modal-open');
			}
		}

		if (detailClose) detailClose.addEventListener('click', closeDetail);
		if (detailSave) {
			detailSave.addEventListener('click', function () {
				if (!activeDetailTarget || !detailText) {
					closeDetail();
					return;
				}
				var td = activeDetailTarget.tr.querySelector('[data-col="' + activeDetailTarget.col + '"]');
				if (!td) {
					closeDetail();
					return;
				}
				var ta = td.querySelector('textarea, input');
				if (ta) {
					ta.value = detailText.value;
					td.dataset.full = detailText.value || '';
				} else {
					var full = detailText.value || '';
					td.dataset.full = full;
					var isMultiline = /\r?\n/.test(full);
					var isLong = full.length > 80;
					var preview = isMultiline || isLong ? '세부내용 참조' : full || '-';
					var btn = td.querySelector('.js-ac-detail');
					td.innerHTML =
						'<div class="cell-flex"><div class="form-input-static procedure-preview" title="' +
						full.replace(/"/g, '&quot;') +
						'">' +
						preview +
						'</div></div>';
					if (btn) {
						var img = btn.querySelector('img');
						if (img) img.src = '/static/image/svg/free-icon-assessment.svg';
						td.querySelector('.cell-flex').appendChild(btn);
					}
					ensurePreviewLabel(td);
				}
				closeDetail();
			});
		}

		document.addEventListener('keydown', function (e) {
			if (e.key === 'Escape' && detailModal && detailModal.classList.contains('show')) closeDetail();
		});

		
		table.addEventListener('click', function (ev) {
			var detailBtn = ev.target.closest('.js-ac-detail');
			if (detailBtn) {
				var tr = ev.target.closest('tr');
				if (!tr) return;
				var col = detailBtn.getAttribute('data-target');
				var label = col === 'start' ? '기동절차' : col === 'stop' ? '중지절차' : '확인방법';
				var td = tr.querySelector('[data-col="' + col + '"]');
				var current = '';
				if (td) {
					current = td.dataset.full || '';
					if (!current) {
						var ta = td.querySelector('textarea, input');
						if (ta) current = ta.value;
						else {
							var pv = td.querySelector('.procedure-preview');
							if (pv) current = pv.getAttribute('title') || pv.dataset.full || pv.textContent.trim();
							else current = td.textContent.trim();
						}
					}
				}
				activeDetailTarget = { tr: tr, col: col };
				openDetail(label, current);
				return;
			}

			var svcNameTd = ev.target.closest('td[data-col="svc_name"]');
			if (svcNameTd) {
				var trView = svcNameTd.closest('tr');
				if (trView) { openViewModal(trView); return; }
			}

			var target = ev.target.closest('.js-ac-del, .js-ac-edit, .js-ac-commit, .js-ac-toggle');
			if (!target) return;
			var tr2 = ev.target.closest('tr');
			if (!tr2) return;

			if (target.classList.contains('js-ac-del')) {
				var id = getRowId(tr2);
				if (id && apiEnabled) {
					apiDelete(id)
						.then(function () {
							if (tr2 && tr2.parentNode) tr2.parentNode.removeChild(tr2);
							updateEmptyState();
						})
						.catch(function (err) {
							try {
								console.error('[tab07-activate] delete failed', err);
							} catch (_e) {}
						});
					return;
				}
				if (tr2 && tr2.parentNode) tr2.parentNode.removeChild(tr2);
				updateEmptyState();
				return;
			}

			
			if (target.classList.contains('js-ac-edit') || (target.classList.contains('js-ac-toggle') && target.getAttribute('data-action') === 'edit')) {
				openEditorModal(tr2);
				return;
			}
		});
	}

	global.BlossomTab07Activate = Object.assign(global.BlossomTab07Activate || {}, { init: init });

	try {
		if (document.readyState === 'loading') {
			document.addEventListener(
				'DOMContentLoaded',
				function () {
					init();
				},
				{ once: true }
			);
		} else {
			init();
		}
	} catch (_e) {}
})(window);


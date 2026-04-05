/*
 * tab06-authority.js
 * Authority management tab behavior.
 */

(function () {
	'use strict';

	var _auDeleteModalWired = false;
	var _auDeleteCallback = null;

	function auOpenDeleteModal(tr, onConfirm) {
		var modal = document.getElementById('au-delete-modal');
		if (!modal) { if (onConfirm) onConfirm(); return; }
		_auDeleteCallback = onConfirm || null;
		var msg = document.getElementById('au-delete-msg');
		if (msg) {
			var targetTd = tr ? tr.querySelector('[data-col="target"]') : null;
			var label = targetTd ? (targetTd.textContent || '').trim() : '';
			msg.textContent = label && label !== '-'
				? '"' + label + '" 권한을 삭제하시겠습니까?'
				: '이 권한을 삭제하시겠습니까?';
		}
		modal.classList.add('show');
		modal.setAttribute('aria-hidden', 'false');
		document.body.classList.add('modal-open');
	}

	function auCloseDeleteModal() {
		var modal = document.getElementById('au-delete-modal');
		if (modal) {
			modal.classList.remove('show');
			modal.setAttribute('aria-hidden', 'true');
		}
		document.body.classList.remove('modal-open');
		_auDeleteCallback = null;
	}

	function auPerformDelete() {
		var cb = _auDeleteCallback;
		auCloseDeleteModal();
		if (cb) cb();
	}

	function wireAuDeleteModal() {
		if (_auDeleteModalWired) return;
		_auDeleteModalWired = true;
		var modal = document.getElementById('au-delete-modal');
		var confirmBtn = document.getElementById('au-delete-confirm');
		var cancelBtn = document.getElementById('au-delete-cancel');
		var closeBtn = document.getElementById('au-delete-close');
		if (confirmBtn) confirmBtn.addEventListener('click', auPerformDelete);
		if (cancelBtn) cancelBtn.addEventListener('click', auCloseDeleteModal);
		if (closeBtn) closeBtn.addEventListener('click', auCloseDeleteModal);
		if (modal) {
			modal.addEventListener('click', function (e) { if (e.target === modal) auCloseDeleteModal(); });
		}
		document.addEventListener('keydown', function (e) {
			if (e.key === 'Escape' && modal && modal.classList.contains('show')) auCloseDeleteModal();
		});
	}

	

	

	

	// Utilities

	function qs(id) {
		return document.getElementById(id);
	}

	function safeText(el) {
		try {
			return (el && el.textContent ? String(el.textContent) : '').trim();
		} catch (_) {
			return '';
		}
	}

	function coerceInt(val) {
		if (val === null || val === undefined || val === '') return null;
		var n = parseInt(String(val), 10);
		return isNaN(n) ? null : n;
	}

	function parseJSONSafe(raw) {
		if (!raw) return null;
		try {
			return JSON.parse(raw);
		} catch (_) {
			return null;
		}
	}

	function getPageKey() {
		try {
			var m = String(window.location.pathname || '').match(/\/p\/([^\/?#]+)/);
			return m && m[1] ? decodeURIComponent(m[1]) : '';
		} catch (_) {
			return '';
		}
	}

	function guessScopeFallback() {
		try {
			var key = getPageKey();
			var hay = ((key || '') + ' ' + String(window.location.pathname || '')).toLowerCase();
			if (hay.indexOf('onpremise') > -1) return 'onpremise';
			if (hay.indexOf('workstation') > -1) return 'workstation';
			if (hay.indexOf('cloud') > -1) return 'cloud';
		} catch (_) {
			
		}
		return '';
	}

	function getAssetIdFromPrefix(prefix) {
		if (!prefix) return null;

		try {
			var candidates = [
				prefix + ':selected:asset_id',
				prefix + ':selected:assetId',
				prefix + ':selected:row',
				prefix + ':selectedRow',
				prefix + '_selected_row'
			];
			for (var i = 0; i < candidates.length; i++) {
				var k = candidates[i];
				var raw = null;
				try { raw = sessionStorage.getItem(k) || localStorage.getItem(k); } catch (_) { raw = null; }
				if (!raw) continue;
				if (k.indexOf(':selected:asset_') > -1 || k.indexOf(':selected:assetId') > -1) {
					var direct = coerceInt(raw);
					if (direct != null && direct > 0) return direct;
					continue;
				}
				var row = parseJSONSafe(raw);
				if (row && typeof row === 'object') {
					var id = null;
					if (row.id != null) id = row.id;
					else if (row.asset_id != null) id = row.asset_id;
					else if (row.assetId != null) id = row.assetId;
					else if (row.assetID != null) id = row.assetID;
					else if (row.server_id != null) id = row.server_id;
					else if (row[prefix + '_id'] != null) id = row[prefix + '_id'];
					var n = coerceInt(id);
					if (n != null && n > 0) return n;
				}
			}
		} catch (_) {
			
		}

		
		try {
			var qs = new URLSearchParams(window.location.search || '');
			var keys = ['asset_id', 'assetId', 'id', 'server_id'];
			for (var i = 0; i < keys.length; i++) {
				var cand = qs.get(keys[i]);
				var nn = coerceInt(cand);
				if (nn != null && nn > 0) return nn;
			}
		} catch (_) {
			
		}
		return null;
	}

	function inferContextFromStorage(preferScope) {

		function scan(storage) {
			try {
				for (var i = 0; i < storage.length; i++) {
					var k = storage.key(i);
					if (!k) continue;
					if (/dispose_selected_rows/i.test(k)) continue;

					var scope = null;
					var m = String(k).match(/^([A-Za-z0-9_\-]+):selected:(row|asset_id|assetId)$/);
					if (m) scope = m[1];
					if (!scope) {
						var m2 = String(k).match(/^([A-Za-z0-9_\-]+):(selectedRow)$/);
						if (m2) scope = m2[1];
					}
					if (!scope) {
						var m3 = String(k).match(/^([A-Za-z0-9_\-]+)_selected_row$/);
						if (m3) scope = m3[1];
					}
					if (!scope) continue;

					if (preferScope && String(preferScope) && String(scope) !== String(preferScope)) continue;
					var raw = storage.getItem(k);
					if (!raw) continue;

					// direct asset id key
					if (String(k).indexOf(':selected:asset_') > -1 || String(k).indexOf(':selected:assetId') > -1) {
						var direct = coerceInt(raw);
						if (direct != null) return { scope: scope, assetId: direct };
						continue;
					}

					var row = parseJSONSafe(raw);
					if (!row || typeof row !== 'object') continue;
					var id = null;
					if (row.id !== undefined) id = coerceInt(row.id);
					if (id == null && row.asset_id !== undefined) id = coerceInt(row.asset_id);
					if (id == null && row.assetId !== undefined) id = coerceInt(row.assetId);
					if (id == null && row.assetID !== undefined) id = coerceInt(row.assetID);
					if (id == null && row.server_id !== undefined) id = coerceInt(row.server_id);
					if (id == null && row[scope + '_id'] !== undefined) id = coerceInt(row[scope + '_id']);
					if (id != null) return { scope: scope, assetId: id };
				}
			} catch (_) {
				
			}
			return null;
		}

		return scan(sessionStorage) || scan(localStorage);
	}

	// CSV

	

	

	

	function auEscapeCSV(val) {
		return '"' + String(val == null ? '' : val).replace(/"/g, '""') + '"';
	}

	// Modal

	

	

	

	function openModalLocal(id) {
		var el = qs(id);
		if (!el) return;
		document.body.classList.add('modal-open');
		el.classList.add('show');
		el.setAttribute('aria-hidden', 'false');
	}

	function closeModalLocal(id) {
		var el = qs(id);
		if (!el) return;
		el.classList.remove('show');
		el.setAttribute('aria-hidden', 'true');
		if (!document.querySelector('.modal-overlay-full.show')) {
			document.body.classList.remove('modal-open');
		}
	}

	// Init

	

	

	

	function initTab06Authority(options) {
		wireAuDeleteModal();
		var table = qs('au-spec-table');
		if (!table) return false;
		try {
			if (table.dataset && table.dataset.auInited === '1') return true;
			if (table.dataset) table.dataset.auInited = '1';
		} catch (_) {
			
		}

		var empty = qs('au-empty');
		var opt = (options && typeof options === 'object') ? options : {};
		var prefer = (opt.storagePrefix || opt.scope || '').toString().trim();
		var scope = (opt.scope || opt.storagePrefix || '').toString().trim();
		if (!scope) scope = guessScopeFallback();
		var assetId = coerceInt(opt.assetId);
		if (assetId == null) assetId = getAssetIdFromPrefix(prefer || scope);
		var ctx = null;
		if (!scope || assetId == null) ctx = inferContextFromStorage(prefer || scope);
		if (!scope && ctx && ctx.scope) scope = String(ctx.scope);
		if (assetId == null && ctx && ctx.assetId != null) assetId = ctx.assetId;

		var apiBase = null;
		if (scope && assetId != null) {
			apiBase = '/api/hardware/' + encodeURIComponent(scope) + '/assets/' + encodeURIComponent(String(assetId)) + '/authorities';
		}

		// flatpickr loader + init (for expires_at)
		var FLATPICKR_CSS = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css';
		var FLATPICKR_THEME_NAME = 'airbnb';
		var FLATPICKR_THEME_HREF = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/themes/' + FLATPICKR_THEME_NAME + '.css';
		var FLATPICKR_JS = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.js';
		var FLATPICKR_KO = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/l10n/ko.js';

		function ensureCss(href, id) {
			try {
				var existing = document.getElementById(id);
				if (existing && existing.tagName && existing.tagName.toLowerCase() === 'link') {
					if (existing.getAttribute('href') !== href) existing.setAttribute('href', href);
					return;
				}
				var l = document.createElement('link');
				l.rel = 'stylesheet';
				l.href = href;
				l.id = id;
				document.head.appendChild(l);
			} catch (_e) {}
		}

		function loadScript(src) {
			return new Promise(function (resolve, reject) {
				try {
					var s = document.createElement('script');
					s.src = src;
					s.async = true;
					s.onload = function () { resolve(); };
					s.onerror = function () { reject(new Error('Script load failed: ' + src)); };
					document.head.appendChild(s);
				} catch (e) {
					reject(e);
				}
			});
		}

		var __auFlatpickrLoading = null;
		function ensureFlatpickr() {
			ensureCss(FLATPICKR_CSS, 'flatpickr-css');
			ensureCss(FLATPICKR_THEME_HREF, 'flatpickr-theme-css');
			if (window.flatpickr) return Promise.resolve();
			if (__auFlatpickrLoading) return __auFlatpickrLoading;
			__auFlatpickrLoading = loadScript(FLATPICKR_JS)
				.then(function () {
					return loadScript(FLATPICKR_KO).catch(function () { return null; });
				})
				.then(function () { return null; });
			return __auFlatpickrLoading;
		}

		function initExpiresPicker(input) {
			if (!input) return;
			try {
				if (input._auFlatpickr) return;
			} catch (_) {}
			ensureFlatpickr().then(function () {
				try {
					if (!window.flatpickr) return;
					var opts = {
						dateFormat: 'Y-m-d',
						allowInput: true
					};
					if (window.flatpickr && window.flatpickr.l10ns && window.flatpickr.l10ns.ko) {
						opts.locale = window.flatpickr.l10ns.ko;
					}
					input._auFlatpickr = window.flatpickr(input, opts);
				} catch (_) {}
			}).catch(function () {  });
		}

		// searchable select loader + enhance (for status/type/action)
		function ensureAuSearchableSelectSources() {
			try {
				if (window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function') return Promise.resolve();
			} catch (_) { }
			try {
				if (window.__auSearchableSelectLoading) return window.__auSearchableSelectLoading;
				window.__auSearchableSelectLoading = loadScript('/static/js/ui/searchable_select.js?v=20260124-au1');
				return window.__auSearchableSelectLoading;
			} catch (e) {
				return Promise.reject(e);
			}
		}

		function enhanceAuSearchableSelects(root) {
			try {
				ensureAuSearchableSelectSources().then(function () {
					try {
						if (window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function') {
							window.BlossomSearchableSelect.enhance(root || document);
						}
					} catch (_) { }
				}).catch(function () {  });
			} catch (_) { }
		}

		function setError(input, on) {
			if (!input) return;
			if (on) {
				input.classList.add('input-error');
				input.setAttribute('aria-invalid', 'true');
			} else {
				input.classList.remove('input-error');
				input.removeAttribute('aria-invalid');
			}
			// If this is an enhanced searchable <select>, also mark the visible display button.
			try {
				if (
					input.tagName === 'SELECT' &&
					input.classList &&
					input.classList.contains('fk-search-native-hidden')
				) {
					var wrap = input.closest ? input.closest('.fk-searchable-control') : null;
					var btn = wrap ? wrap.querySelector('.fk-searchable-display') : null;
					if (btn) {
						if (on) {
							btn.classList.add('input-error');
							btn.setAttribute('aria-invalid', 'true');
						} else {
							btn.classList.remove('input-error');
							btn.removeAttribute('aria-invalid');
						}
					}
				}
			} catch (_) { }
		}

		function focusBest(input) {
			try {
				if (
					input &&
					input.tagName === 'SELECT' &&
					input.classList &&
					input.classList.contains('fk-search-native-hidden')
				) {
					var wrap = input.closest ? input.closest('.fk-searchable-control') : null;
					var btn = wrap ? wrap.querySelector('.fk-searchable-display') : null;
					if (btn && btn.focus) { btn.focus(); return; }
				}
			} catch (_) { }
			try { if (input && input.focus) input.focus(); } catch (_) { }
		}

		function getInput(tr, name) {
			var td = tr.querySelector('[data-col="' + name + '"]');
			if (!td) return null;
			return td.querySelector('input, select, textarea');
		}

		function readValue(tr, name) {
			var el = getInput(tr, name);
			if (el) return String(el.value || '').trim();
			var td = tr.querySelector('[data-col="' + name + '"]');
			return td ? safeText(td) : '';
		}

		function commitText(tr, name, val) {
			var td = tr.querySelector('[data-col="' + name + '"]');
			if (!td) return;
			if (name === 'status') {
				var sv = (val === '' || val == null) ? '-' : String(val);
				if (sv === 'ENABLE') sv = '활성';
				if (sv === 'DISABLED') sv = '비활성';
				var dotCls = (sv === '활성') ? 'ws-run' : (sv === '비활성') ? 'ws-wait' : '';
				if (dotCls) {
					td.innerHTML = '<span class="status-pill"><span class="status-dot ' + dotCls + '"></span><span class="status-text">' + sv + '</span></span>';
				} else {
					td.textContent = sv;
				}
				return;
			}
			td.textContent = (val === '' || val == null) ? '-' : String(val);
		}

		function setToggleToEdit(tr) {
			var toggleBtn = tr.querySelector('.js-au-toggle');
			if (!toggleBtn) return;
			toggleBtn.setAttribute('data-action', 'edit');
			toggleBtn.title = '편집';
			toggleBtn.setAttribute('aria-label', '편집');
			toggleBtn.innerHTML = '<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon">';
		}

		function setToggleToSave(tr) {
			var toggleBtn = tr.querySelector('.js-au-toggle');
			if (!toggleBtn) return;
			toggleBtn.setAttribute('data-action', 'save');
			toggleBtn.title = '저장';
			toggleBtn.setAttribute('aria-label', '저장');
			toggleBtn.innerHTML = '<img src="/static/image/svg/save.svg" alt="저장" class="action-icon">';
		}

		function renderRowView(tbody, item) {
			var tr = document.createElement('tr');
			tr.setAttribute('data-id', String((item && item.id) || ''));
			var commandScope = (item && (item.command_scope || item.command)) ? String(item.command_scope || item.command) : '';
			tr.innerHTML = ''
				+ '<td><input type="checkbox" class="au-row-check" aria-label="행 선택"></td>'
				+ '<td data-col="status">' + (function(s){ if(!s||s==='-') return '-'; if(s==='ENABLE') s='활성'; if(s==='DISABLED') s='비활성'; var c=(s==='활성')?'ws-run':(s==='비활성')?'ws-wait':''; return c ? '<span class="status-pill"><span class="status-dot '+c+'"></span><span class="status-text">'+s+'</span></span>' : s; })((item && item.status) ? String(item.status) : '') + '</td>'
				+ '<td data-col="type">' + ((item && item.type) ? String(item.type) : '-') + '</td>'
				+ '<td data-col="target">' + ((item && item.target) ? String(item.target) : '-') + '</td>'
				+ '<td data-col="action">' + ((item && item.action) ? String(item.action) : '-') + '</td>'
				+ '<td data-col="command_scope">' + (commandScope && commandScope.trim() ? commandScope : '-') + '</td>'
				+ '<td data-col="options">' + ((item && item.options && String(item.options).trim()) ? String(item.options) : '-') + '</td>'
				+ '<td data-col="expires_at">' + ((item && item.expires_at && String(item.expires_at).trim()) ? String(item.expires_at) : '-') + '</td>'
				+ '<td data-col="remark">' + ((item && item.remark && String(item.remark).trim()) ? String(item.remark) : '-') + '</td>'
				+ '<td class="system-actions table-actions">'
				+ '  <button class="action-btn js-au-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button>'
				+ '  <button class="action-btn danger js-au-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'
				+ '</td>';
			tbody.appendChild(tr);
		}

		function auRowSaved(tr) {
			var t = tr.querySelector('.js-au-toggle');
			var inEdit = t && t.getAttribute('data-action') === 'save';
			if (inEdit) return false;
			return !tr.querySelector('td[data-col] input, td[data-col] select, td[data-col] textarea');
		}

		function auVisibleRows() {
			var tbody = table.querySelector('tbody');
			if (!tbody) return [];
			return Array.prototype.filter.call(tbody.querySelectorAll('tr'), function (tr) {
				return !(tr.hasAttribute('data-hidden') || tr.style.display === 'none');
			});
		}

		function auSavedVisibleRows() {
			return auVisibleRows().filter(auRowSaved);
		}

		function auExportCSV(onlySelected) {
			var tbody = table.querySelector('tbody');
			if (!tbody) return;

			var headers = ['상태', '구분', '대상', '동작', '명령·범위', '옵션', '만료일', '비고'];
			var trs = auSavedVisibleRows();
			if (onlySelected) {
				trs = trs.filter(function (tr) {
					var cb = tr.querySelector('.au-row-check');
					return cb && cb.checked;
				});
			}
			if (!trs.length) return;

			function text(tr, col) {
				var td = tr.querySelector('[data-col="' + col + '"]');
				return td ? safeText(td) : '';
			}
			var rows = trs.map(function (tr) {
				return ['status', 'type', 'target', 'action', 'command_scope', 'options', 'expires_at', 'remark'].map(function (c) {
					return text(tr, c);
				});
			});
			var lines = [headers].concat(rows).map(function (arr) {
				return arr.map(auEscapeCSV).join(',');
			});
			var csv = '\uFEFF' + lines.join('\r\n');
			var d = new Date();
			var yyyy = d.getFullYear();
			var mm = String(d.getMonth() + 1).padStart(2, '0');
			var dd = String(d.getDate()).padStart(2, '0');
			var filename = 'authority_' + yyyy + mm + dd + '.csv';
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
			} catch (_) {
				var a2 = document.createElement('a');
				a2.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
				a2.download = filename;
				document.body.appendChild(a2);
				a2.click();
				document.body.removeChild(a2);
			}
		}

		function wireTypeDependencies(root) {
			try {
				var typeSel = root.querySelector('td[data-col="type"] select');
				var cmdInp = root.querySelector('td[data-col="command_scope"] input');
				var optInp = root.querySelector('td[data-col="options"] input');
				if (!typeSel) return;
				function apply() {
					var t = String(typeSel.value || '').toLowerCase();
					if (cmdInp) {
						var ph = '명령/범위';
						if (t === 'sudo') ph = '예: ALL, /usr/bin/systemctl';
						else if (t === 'cron') ph = '예: /etc/cron.allow (또는 규칙 범위)';
						else if (t === 'at') ph = '예: /etc/at.allow (또는 규칙 범위)';
						else if (t === 'ssh') ph = '예: AllowUsers / AllowGroups 범위';
						cmdInp.placeholder = ph;
					}
					if (optInp) {
						optInp.placeholder = '옵션';
					}
				}
				typeSel.addEventListener('change', apply);
				apply();
			} catch (_) { }
		}

	// Pagination

	

		
		var auState = { page: 1, 
	

	
pageSize: 10 };
		var pageSizeKey = (scope ? (scope + ':au:pageSize') : 'au:pageSize');
		(function initPageSize() {
			try {
				var saved = localStorage.getItem(pageSizeKey);
				var sel = qs('au-page-size');
				if (sel) {
					if (saved && ['10', '20', '50', '100'].indexOf(saved) > -1) {
						auState.pageSize = parseInt(saved, 10);
						sel.value = saved;
					}
					sel.addEventListener('change', function () {
						var v = parseInt(sel.value, 10);
						if (!isNaN(v)) {
							auState.page = 1;
							auState.pageSize = v;
							localStorage.setItem(pageSizeKey, String(v));
							auRenderPage();
						}
					});
				}
			} catch (_) {
				
			}
		})();

		var infoEl = qs('au-pagination-info');
		var numWrap = qs('au-page-numbers');
		var btnFirst = qs('au-first');
		var btnPrev = qs('au-prev');
		var btnNext = qs('au-next');
		var btnLast = qs('au-last');

		function auRows() {
			var tbody = table.querySelector('tbody');
			return tbody ? Array.prototype.slice.call(tbody.querySelectorAll('tr')) : [];
		}
		function auTotal() {
			return auRows().length;
		}
		function auPages() {
			var total = auTotal();
			return Math.max(1, Math.ceil(total / auState.pageSize));
		}
		function auClampPage() {
			var pages = auPages();
			if (auState.page > pages) auState.page = pages;
			if (auState.page < 1) auState.page = 1;
		}
		function auUpdatePaginationUI() {
			if (infoEl) {
				var total = auTotal();
				var start = total ? (auState.page - 1) * auState.pageSize + 1 : 0;
				var end = Math.min(total, auState.page * auState.pageSize);
				infoEl.textContent = start + '-' + end + ' / ' + total + '개 항목';
			}
			if (numWrap) {
				var pages = auPages();
				numWrap.innerHTML = '';
				for (var p = 1; p <= pages && p <= 50; p++) {
					var b = document.createElement('button');
					b.className = 'page-btn' + (p === auState.page ? ' active' : '');
					b.textContent = String(p);
					b.dataset.page = String(p);
					numWrap.appendChild(b);
				}
			}
			var pages2 = auPages();
			if (btnFirst) btnFirst.disabled = (auState.page === 1);
			if (btnPrev) btnPrev.disabled = (auState.page === 1);
			if (btnNext) btnNext.disabled = (auState.page === pages2);
			if (btnLast) btnLast.disabled = (auState.page === pages2);
			var sizeSel = qs('au-page-size');
			if (sizeSel) {
				var none = (auTotal() === 0);
				sizeSel.disabled = none;
				if (none) {
					try {
						sizeSel.value = '10';
						auState.pageSize = 10;
					} catch (_) {
						
					}
				}
			}
		}
		function auRenderPage() {
			auClampPage();
			var rows = auRows();
			var startIdx = (auState.page - 1) * auState.pageSize;
			var endIdx = startIdx + auState.pageSize - 1;
			rows.forEach(function (tr, idx) {
				var visible = idx >= startIdx && idx <= endIdx;
				tr.style.display = visible ? '' : 'none';
				if (visible) tr.removeAttribute('data-hidden');
				else tr.setAttribute('data-hidden', '1');
				var cb = tr.querySelector('.au-row-check');
				if (cb) tr.classList.toggle('selected', !!cb.checked && visible);
			});
			auUpdatePaginationUI();
			var sa = qs('au-select-all');
			if (sa) {
				var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .au-row-check');
				if (visChecks.length) {
					sa.checked = Array.prototype.every.call(visChecks, function (c) { return c.checked; });
				} else {
					sa.checked = false;
				}
			}
		}
		function auGo(p) {
			auState.page = p;
			auRenderPage();
		}
		function auGoDelta(d) {
			auGo(auState.page + d);
		}
		function auGoFirst() {
			auGo(1);
		}
		function auGoLast() {
			auGo(auPages());
		}

		if (numWrap) {
			numWrap.addEventListener('click', function (e) {
				var b = e.target.closest('button.page-btn');
				if (!b) return;
				var p = parseInt(b.dataset.page, 10);
				if (!isNaN(p)) auGo(p);
			});
		}
		if (btnFirst) btnFirst.addEventListener('click', auGoFirst);
		if (btnPrev) btnPrev.addEventListener('click', function () { auGoDelta(-1); });
		if (btnNext) btnNext.addEventListener('click', function () { auGoDelta(1); });
		if (btnLast) btnLast.addEventListener('click', auGoLast);

		function updateEmptyState() {
			try {
				var hasRows = table.querySelector('tbody tr') != null;
				if (empty) {
					empty.hidden = !!hasRows;
					empty.style.display = hasRows ? 'none' : '';
				}
			} catch (_) {
				if (empty) {
					empty.hidden = false;
					empty.style.display = '';
				}
			}
			var csvBtn = qs('au-download-btn');
			if (csvBtn) {
				var has = !!table.querySelector('tbody tr');
				csvBtn.disabled = !has;
				csvBtn.setAttribute('aria-disabled', (!has).toString());
				csvBtn.title = has ? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.';
			}
			auRenderPage();
		}

		updateEmptyState();

		
		(function loadFromApi() {
			if (!apiBase) return;
			var tbody = table.querySelector('tbody');
			if (!tbody) return;
			fetch(apiBase, { headers: { 'Accept': 'application/json' } })
				.then(function (r) {
					return r.text().then(function (t) {
						var j = null;
						try { j = JSON.parse(t); } catch (_) { j = null; }
						return { status: r.status, ok: r.ok, json: j, text: t };
					});
				})
				.then(function (res) {
					if (!res.ok) {
						try { console.warn('[tab06-authority] API error:', res.status, res.json && res.json.message); } catch (_) { }
						updateEmptyState();
						return;
					}
					if (!res.json || !res.json.success) {
						try { console.warn('[tab06-authority] API responded with success=false:', res.json && res.json.message); } catch (_) { }
						updateEmptyState();
						return;
					}
					tbody.innerHTML = '';
					(res.json.items || []).forEach(function (item) { renderRowView(tbody, item); });
					try { auState.page = 1; } catch (_) { }
					updateEmptyState();
				})
				.catch(function () {
					try { console.warn('[tab06-authority] Failed to load authority list'); } catch (_) { }
					updateEmptyState();
				});
		})();

		
		var selectAll = qs('au-select-all');
		if (selectAll) {
			selectAll.addEventListener('change', function () {
				var checks = table.querySelectorAll('.au-row-check:not([disabled])');
				Array.prototype.forEach.call(checks, function (c) {
					var tr = c.closest('tr');
					var hidden = tr && (tr.hasAttribute('data-hidden') || tr.style.display === 'none');
					if (!hidden) c.checked = !!selectAll.checked;
					if (tr) tr.classList.toggle('selected', !!c.checked && !hidden);
				});
			});
		}

		
		table.addEventListener('click', function (ev) {
			(function () {
				var tr = ev.target.closest('tr');
				if (!tr || !tr.parentNode || tr.parentNode.tagName.toLowerCase() !== 'tbody') return;
				var isControl = ev.target.closest('button, a, input, select, textarea, label');
				var onCheckbox = ev.target.closest('input[type="checkbox"].au-row-check');
				if (isControl && !onCheckbox) return;
				if (onCheckbox) return;
				var cb = tr.querySelector('.au-row-check');
				if (!cb) return;
				var hidden = tr.hasAttribute('data-hidden') || tr.style.display === 'none';
				if (hidden) return;
				cb.checked = !cb.checked;
				tr.classList.toggle('selected', cb.checked);
				var sa = qs('au-select-all');
				if (sa) {
					var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .au-row-check');
					if (visChecks.length) sa.checked = Array.prototype.every.call(visChecks, function (c) { return c.checked; });
					else sa.checked = false;
				}
			})();
		});
		table.addEventListener('change', function (ev) {
			var cb = ev.target.closest('.au-row-check');
			if (!cb) return;
			var tr = cb.closest('tr');
			if (tr) {
				var hidden = tr.hasAttribute('data-hidden') || tr.style.display === 'none';
				tr.classList.toggle('selected', !!cb.checked && !hidden);
			}
			var sa = qs('au-select-all');
			if (sa) {
				var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .au-row-check');
				if (visChecks.length) sa.checked = Array.prototype.every.call(visChecks, function (c) { return c.checked; });
				else sa.checked = false;
			}
		});

		
		(function () {
			var btn = qs('au-download-btn');
			var modalId = 'au-download-modal';
			var closeBtn = qs('au-download-close');
			var confirmBtn = qs('au-download-confirm');

			if (btn) {
				btn.addEventListener('click', function () {
					if (btn.disabled) return;
					var saved = auSavedVisibleRows();
					var total = saved.length;
					if (total <= 0) return;
					var selectedCount = saved.filter(function (tr) {
						var cb = tr.querySelector('.au-row-check');
						return cb && cb.checked;
					}).length;
					var subtitle = qs('au-download-subtitle');
					if (subtitle) {
						subtitle.textContent = selectedCount > 0
							? ('선택된 ' + selectedCount + '개 또는 전체 ' + total + '개 결과 중 범위를 선택하세요.')
							: ('현재 결과 ' + total + '개 항목을 CSV로 내보냅니다.');
					}
					var rowSelectedWrap = qs('au-csv-range-row-selected');
					var optSelected = qs('au-csv-range-selected');
					var optAll = qs('au-csv-range-all');
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
			var modalEl = qs(modalId);
			if (modalEl) {
				modalEl.addEventListener('click', function (e) { if (e.target === modalEl) closeModalLocal(modalId); });
				document.addEventListener('keydown', function (e) {
					if (e.key === 'Escape' && modalEl.classList.contains('show')) closeModalLocal(modalId);
				});
			}
			if (confirmBtn) {
				confirmBtn.addEventListener('click', function () {
					var onlySel = !!(qs('au-csv-range-selected') && qs('au-csv-range-selected').checked);
					auExportCSV(onlySel);
					closeModalLocal(modalId);
				});
			}
		})();

		
		var addBtn = qs('au-row-add');
		if (addBtn) {
			addBtn.addEventListener('click', function () {
				var tbody = table.querySelector('tbody');
				if (!tbody) return;
				var tr = document.createElement('tr');
				tr.innerHTML = [
					'<td><input type="checkbox" class="au-row-check" aria-label="행 선택"></td>',
					'<td data-col="status">',
					'  <select class="search-select" data-searchable-scope="page" data-allow-clear="false" data-placeholder="상태">',
					'    <option value="" disabled>선택</option>',
					'    <option value="활성" selected>활성</option>',
					'    <option value="비활성">비활성</option>',
					'  </select>',
					'</td>',
					'<td data-col="type">',
					'  <select class="search-select" data-searchable-scope="page" data-allow-clear="false" data-placeholder="구분">',
					'    <option value="" selected disabled>선택</option>',
					'    <option value="sudo">sudo</option>',
					'    <option value="cron">cron</option>',
					'    <option value="at">at</option>',
					'    <option value="ssh">ssh</option>',
					'  </select>',
					'</td>',
					'<td data-col="target"><input type="text" placeholder="예: user01, %wheel, %admin"></td>',
					'<td data-col="action">',
					'  <select class="search-select" data-searchable-scope="page" data-allow-clear="false" data-placeholder="동작">',
					'    <option value="" selected disabled>선택</option>',
					'    <option value="ALLOW">ALLOW</option>',
					'    <option value="DENY">DENY</option>',
					'  </select>',
					'</td>',
					'<td data-col="command_scope"><input type="text" placeholder="명령/범위"></td>',
					'<td data-col="options"><input type="text" placeholder="옵션"></td>',
					'<td data-col="expires_at"><input type="text" class="js-au-expires" placeholder="YYYY-MM-DD"></td>',
					'<td data-col="remark"><input type="text" placeholder="비고"></td>',
					'<td class="system-actions table-actions">',
					'  <button class="action-btn js-au-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button>',
					'  <button class="action-btn danger js-au-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>',
					'</td>'
				].join('');
				tbody.appendChild(tr);
				try { auGoLast(); } catch (_) { }
				updateEmptyState();
				wireTypeDependencies(tr);
				initExpiresPicker(tr.querySelector('input.js-au-expires'));
				enhanceAuSearchableSelects(tr);
			});
		}

		
		table.addEventListener('click', function (ev) {
			var target = ev.target.closest('.js-au-del, .js-au-edit, .js-au-commit, .js-au-toggle');
			if (!target) return;
			var tr = ev.target.closest('tr');
			if (!tr) return;

			
			if (target.classList.contains('js-au-del')) {
				auOpenDeleteModal(tr, function () {
					var rid = coerceInt(tr.getAttribute('data-id') || '');
					if (apiBase && rid != null) {
						fetch(apiBase + '/' + rid, { method: 'DELETE', headers: { 'Accept': 'application/json' } })
							.then(function () {
								if (tr.parentNode) tr.parentNode.removeChild(tr);
								try { auClampPage(); } catch (_) { }
								updateEmptyState();
							})
							.catch(function () {  });
						return;
					}
					if (tr.parentNode) tr.parentNode.removeChild(tr);
					try { auClampPage(); } catch (_) { }
					updateEmptyState();
				});
				return;
			}

			
			if (target.classList.contains('js-au-edit') || (target.classList.contains('js-au-toggle') && target.getAttribute('data-action') === 'edit')) {
				function toInput(name, placeholder) {
					var td = tr.querySelector('[data-col="' + name + '"]');
					if (!td) return;
					var current = safeText(td);
					if (name === 'status') {
						var sv = current === '-' ? '' : current;
						var sopts = [
							'<option value=""' + (sv ? '' : ' selected') + ' disabled>선택</option>',
							'<option value="활성"' + (sv === '활성' ? ' selected' : '') + '>활성</option>',
							'<option value="비활성"' + (sv === '비활성' ? ' selected' : '') + '>비활성</option>'
						].join('');
						td.innerHTML = '<select class="search-select" data-searchable-scope="page" data-allow-clear="false" data-placeholder="상태">' + sopts + '</select>';
						return;
					}
					if (name === 'type') {
						var tv = current === '-' ? '' : current;
						var topts = [
							'<option value=""' + (tv ? '' : ' selected') + ' disabled>선택</option>',
							'<option value="sudo"' + (tv === 'sudo' ? ' selected' : '') + '>sudo</option>',
							'<option value="cron"' + (tv === 'cron' ? ' selected' : '') + '>cron</option>',
							'<option value="at"' + (tv === 'at' ? ' selected' : '') + '>at</option>',
							'<option value="ssh"' + (tv === 'ssh' ? ' selected' : '') + '>ssh</option>'
						].join('');
						td.innerHTML = '<select class="search-select" data-searchable-scope="page" data-allow-clear="false" data-placeholder="구분">' + topts + '</select>';
						return;
					}
					if (name === 'action') {
						var av = current === '-' ? '' : current;
						var aopts = [
							'<option value=""' + (av ? '' : ' selected') + ' disabled>선택</option>',
							'<option value="ALLOW"' + (av === 'ALLOW' ? ' selected' : '') + '>ALLOW</option>',
							'<option value="DENY"' + (av === 'DENY' ? ' selected' : '') + '>DENY</option>'
						].join('');
						td.innerHTML = '<select class="search-select" data-searchable-scope="page" data-allow-clear="false" data-placeholder="동작">' + aopts + '</select>';
						return;
					}
					var v = current === '-' ? '' : current;
					if (name === 'expires_at') {
						td.innerHTML = '<input type="text" class="js-au-expires" value="' + String(v).replace(/"/g, '&quot;') + '" placeholder="YYYY-MM-DD">';
						return;
					}
					td.innerHTML = '<input type="text" value="' + String(v).replace(/"/g, '&quot;') + '" placeholder="' + (placeholder || '') + '">';
				}

				['status', 'type', 'target', 'action', 'command_scope', 'options', 'expires_at', 'remark'].forEach(function (n) { toInput(n); });
				wireTypeDependencies(tr);
				initExpiresPicker(tr.querySelector('input.js-au-expires'));
				enhanceAuSearchableSelects(tr);
				var toggleBtn = tr.querySelector('.js-au-toggle');
				if (toggleBtn) {
					setToggleToSave(tr);
				} else {
					var actions = tr.querySelector('.table-actions');
					if (actions) {
						actions.classList.add('system-actions');
						actions.innerHTML = '<button class="action-btn js-au-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button> <button class="action-btn danger js-au-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>';
					}
				}
				return;
			}

			
			if (target.classList.contains('js-au-toggle') && target.getAttribute('data-action') === 'save') {
				var statusSel = getInput(tr, 'status');
				var typeSel = getInput(tr, 'type');
				var targetInp = getInput(tr, 'target');
				var actionSel = getInput(tr, 'action');

				var statusVal = readValue(tr, 'status');
				var typeVal = readValue(tr, 'type');
				var targetVal = readValue(tr, 'target');
				var actionVal = readValue(tr, 'action');
				var commandScopeVal = readValue(tr, 'command_scope');
				var optionsVal = readValue(tr, 'options');
				var expiresVal = readValue(tr, 'expires_at');
				var remarkVal = readValue(tr, 'remark');

				var firstInvalid = null;
				if (!statusVal) { setError(statusSel, true); firstInvalid = firstInvalid || statusSel; } else { setError(statusSel, false); }
				if (!typeVal) { setError(typeSel, true); firstInvalid = firstInvalid || typeSel; } else { setError(typeSel, false); }
				if (!targetVal) { setError(targetInp, true); firstInvalid = firstInvalid || targetInp; } else { setError(targetInp, false); }
				if (!actionVal) { setError(actionSel, true); firstInvalid = firstInvalid || actionSel; } else { setError(actionSel, false); }
				if (firstInvalid) { focusBest(firstInvalid); return; }

				var payload = {
					status: statusVal,
					type: typeVal,
					target: targetVal,
					action: actionVal,
					command_scope: commandScopeVal,
					options: optionsVal,
					expires_at: expiresVal,
					remark: remarkVal
				};

				function applyView(item) {
					var it = item || {};
					if (it && it.id) tr.setAttribute('data-id', String(it.id));
					commitText(tr, 'status', (it.status != null ? it.status : statusVal));
					commitText(tr, 'type', (it.type != null ? it.type : typeVal));
					commitText(tr, 'target', (it.target != null ? it.target : targetVal));
					commitText(tr, 'action', (it.action != null ? it.action : actionVal));
					commitText(tr, 'command_scope', (it.command_scope != null ? it.command_scope : commandScopeVal));
					commitText(tr, 'options', (it.options != null ? it.options : optionsVal));
					commitText(tr, 'expires_at', (it.expires_at != null ? it.expires_at : expiresVal));
					commitText(tr, 'remark', (it.remark != null ? it.remark : remarkVal));
					setToggleToEdit(tr);
					updateEmptyState();
				}

				if (!apiBase) {
					try { if (window.showToast) window.showToast('자산 선택 정보가 없어 저장할 수 없습니다.', 'error'); else console.warn('[authority] apiBase empty – cannot save'); } catch (_) { }
					return;
				}
				var rid2 = coerceInt(tr.getAttribute('data-id') || '');
				var isUpdate = rid2 != null;
				var url = isUpdate ? (apiBase + '/' + rid2) : apiBase;
				var method = isUpdate ? 'PUT' : 'POST';
				fetch(url, {
					method: method,
					headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
					body: JSON.stringify(payload)
				})
					.then(function (r) {
						return r.text().then(function (t) {
							var j = null;
							try { j = JSON.parse(t); } catch (_) { j = null; }
							return { status: r.status, ok: r.ok, json: j, text: t };
						});
					})
					.then(function (res) {
						if (!res.ok) {
							var msg = (res.json && res.json.message) ? res.json.message : ('저장 중 오류가 발생했습니다. (HTTP ' + res.status + ')');
							if (res.status === 401 || res.status === 403) msg = '로그인이 필요합니다.';
							console.warn('[authority] save error:', res.status, msg);
							try { if (window.showToast) window.showToast(msg, 'error'); } catch (_) { }
							return;
						}
						if (!res.json || !res.json.success) {
							var msg2 = (res.json && res.json.message) ? res.json.message : '저장하지 못했습니다. 입력값을 확인해 주세요.';
							console.warn('[authority] save failed:', msg2);
							try { if (window.showToast) window.showToast(msg2, 'error'); } catch (_) { }
							return;
						}
						applyView(res.json.item || null);
						try { if (window.showToast) window.showToast('저장되었습니다.', 'success'); } catch (_) { }
					})
					.catch(function (err) {
						console.warn('[authority] save fetch error:', err);
						try { if (window.showToast) window.showToast('저장 중 오류가 발생했습니다.', 'error'); } catch (_) { }
					});
				return;
			}
		});

		return true;
	}

	function initFromPage(options) {
		return initTab06Authority(options);
	}

	window.BlossomTab06Authority = window.BlossomTab06Authority || {};
	window.BlossomTab06Authority.init = initTab06Authority;
	window.BlossomTab06Authority.initFromPage = initFromPage;

	
	try {
		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', function () {
				initTab06Authority();
			}, { once: true });
		} else {
			initTab06Authority();
		}
	} catch (_) {
		
	}
})();


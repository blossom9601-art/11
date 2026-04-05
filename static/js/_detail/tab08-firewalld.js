/*
 * tab08-firewalld.js
 * Firewall (firewalld) tab behavior.
 */

// NOTE: This file previously became corrupted (broken function boundaries / missing helpers),
// causing the entire script to fail to initialize (e.g., the “Add row” button did nothing).
// The implementation below is the active one. The old broken code is left commented out
// at the bottom for reference.

(function (global) {
	'use strict';

	function $(id) {
		return document.getElementById(id);
	}

	function parsePositiveInt(value) {
		var n = parseInt(String(value), 10);
		return !isNaN(n) && n > 0 ? n : null;
	}

	function escHtml(s) {
		return String(s == null ? '' : s)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function normalizeCellText(v) {
		var s = String(v == null ? '' : v).trim();
		return s === '-' ? '' : s;
	}

	function showNoticeSafe(message) {
		try {
			var modal = $('fw-notice-modal');
			var textEl = $('fw-notice-text');
			if (modal && textEl) {
				textEl.textContent = message;
				modal.setAttribute('aria-hidden', 'false');
				modal.style.display = '';
				return;
			}
		} catch (_e) {}
		try {
			global.alert(message);
		} catch (_e2) {}
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

	function getStoragePrefix(prefixFallback) {
		try {
			if (prefixFallback) return String(prefixFallback);
			if (typeof global.STORAGE_PREFIX !== 'undefined' && global.STORAGE_PREFIX) return String(global.STORAGE_PREFIX);
		} catch (_e) {}
		return 'onpremise';
	}

	function getAssetId(storagePrefix) {
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
		} catch (_e1) {}
		try {
			var qs = new URLSearchParams(global.location.search || '');
			var cand = qs.get('asset_id') || qs.get('assetId') || qs.get('id');
			return parsePositiveInt(cand);
		} catch (_e2) {}
		return null;
	}

	function ensureUrlHasAssetId(assetId) {
		try {
			if (!assetId) return;
			var url = new URL(global.location.href);
			if (!url.searchParams.get('asset_id')) {
				url.searchParams.set('asset_id', String(assetId));
				global.history.replaceState(null, '', url.toString());
			}
		} catch (_e) {}
	}

	function ensureTabLinksCarryAssetId(assetId) {
		try {
			if (!assetId) return;
			var links = document.querySelectorAll('a.server-detail-tab-btn');
			Array.prototype.forEach.call(links, function (a) {
				try {
					var href = a.getAttribute('href');
					if (!href || href.indexOf('javascript:') === 0) return;
					var u = new URL(href, global.location.origin);
					if (!u.searchParams.get('asset_id')) {
						u.searchParams.set('asset_id', String(assetId));
						a.setAttribute('href', u.pathname + u.search + u.hash);
					}
				} catch (_e2) {}
			});
		} catch (_e) {}
	}

	function openModalLocal(id) {
		var el = $(id);
		if (!el) return;
		try {
			el.hidden = false;
		} catch (_e) {}
		document.body.classList.add('modal-open');
		el.classList.add('show');
		el.setAttribute('aria-hidden', 'false');
	}

	function closeModalLocal(id) {
		var el = $(id);
		if (!el) return;
		el.classList.remove('show');
		el.setAttribute('aria-hidden', 'true');
		try {
			el.hidden = true;
		} catch (_e) {}
		if (!document.querySelector('.modal-overlay-full.show')) {
			document.body.classList.remove('modal-open');
		}
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
				s.onload = function () {
					resolve();
				};
				s.onerror = function () {
					reject(new Error('Script load failed: ' + src));
				};
				document.head.appendChild(s);
			} catch (e) {
				reject(e);
			}
		});
	}

	var __fwFlatpickrLoading = null;
	function ensureFlatpickr() {
		ensureCss(FLATPICKR_CSS, 'flatpickr-css');
		ensureCss(FLATPICKR_THEME_HREF, 'flatpickr-theme-css');
		if (global.flatpickr) return Promise.resolve();
		if (__fwFlatpickrLoading) return __fwFlatpickrLoading;
		__fwFlatpickrLoading = loadScript(FLATPICKR_JS)
			.then(function () {
				return loadScript(FLATPICKR_KO).catch(function () {
					return null;
				});
			})
			.then(function () {
				return null;
			});
		return __fwFlatpickrLoading;
	}

	function ensureTodayButton(fp) {
		try {
			var cal = fp && fp.calendarContainer ? fp.calendarContainer : null;
			if (!cal) return;
			if (cal.querySelector && cal.querySelector('.fp-today-btn')) return;
			var btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'fp-today-btn';
			btn.textContent = '오늘';
			btn.addEventListener('click', function () {
				try {
					fp.setDate(new Date(), true);
				} catch (_e) {}
			});
			cal.appendChild(btn);
		} catch (_e2) {}
	}

	function initFwDatePickers(root) {
		root = root || document;
		var inputs;
		try {
			inputs = root.querySelectorAll('input.fw-expires-date');
		} catch (_e) {
			inputs = [];
		}
		if (!inputs || inputs.length === 0) return;

		ensureFlatpickr()
			.then(function () {
				try {
					if (global.flatpickr && global.flatpickr.l10ns && global.flatpickr.l10ns.ko) {
						global.flatpickr.localize(global.flatpickr.l10ns.ko);
					}
				} catch (_e) {}
				if (!global.flatpickr) return;
				Array.prototype.forEach.call(inputs, function (el) {
					try {
						if (el._flatpickr) el._flatpickr.destroy();
					} catch (_e) {}
					try {
						global.flatpickr(el, {
							dateFormat: 'Y-m-d',
							allowInput: true,
							disableMobile: true,
							onReady: function (_selectedDates, _dateStr, instance) { ensureTodayButton(instance); },
							onOpen: function (_selectedDates, _dateStr, instance) { ensureTodayButton(instance); },
						});
					} catch (_e2) {}
				});
			})
			.catch(function () {
				// ignore
			});
	}

	function enhanceSearchSelect(scope) {
		try {
			if (global.BlossomSearchableSelect && typeof global.BlossomSearchableSelect.enhance === 'function') {
				global.BlossomSearchableSelect.enhance(scope || document);
			}
		} catch (_e) {}
	}

	function getRowId(tr) {
		try {
			var v = tr.getAttribute('data-id');
			return v ? parsePositiveInt(v) : null;
		} catch (_e) {
			return null;
		}
	}

	function renderSavedRow(item) {
		var tr = document.createElement('tr');
		if (item && item.id != null) tr.setAttribute('data-id', String(item.id));
		function pick(obj, keys, fallback) {
			try {
				for (var i = 0; i < keys.length; i++) {
					var k = keys[i];
					if (obj && Object.prototype.hasOwnProperty.call(obj, k)) {
						var v = obj[k];
						if (v != null && String(v).trim() !== '') return v;
					}
				}
			} catch (_e) {}
			return fallback;
		}
		function td(col, val) {
			var cell = document.createElement('td');
			cell.setAttribute('data-col', col);
			var v = String(val == null ? '' : val).trim();
			cell.textContent = v ? v : '-';
			return cell;
		}
		function tdStatus(rawVal) {
			var cell = document.createElement('td');
			cell.setAttribute('data-col', 'status');
			var upper = String(rawVal == null ? '' : rawVal).trim().toUpperCase();
			var label = upper === 'ENABLED' ? '활성' : upper === 'DISABLED' ? '비활성' : (rawVal || '-');
			var dotCls = upper === 'ENABLED' ? 'fw-dot-active' : upper === 'DISABLED' ? 'fw-dot-inactive' : '';
			if (dotCls) {
				cell.innerHTML = '<span class="fw-status-pill"><span class="fw-status-dot ' + dotCls + '" aria-hidden="true"></span>' + escHtml(label) + '</span>';
			} else {
				cell.textContent = label;
			}
			return cell;
		}
		var tdCheck = document.createElement('td');
		tdCheck.innerHTML = '<input type="checkbox" class="fw-row-check" aria-label="행 선택">';
		tr.appendChild(tdCheck);
		tr.appendChild(td('priority', pick(item, ['priority'], '9999')));
		tr.appendChild(tdStatus(pick(item, ['status', 'fw_status'], '')));
		tr.appendChild(td('direction', pick(item, ['direction'], '')));
		tr.appendChild(td('name', pick(item, ['name', 'policy_name'], '')));
		tr.appendChild(td('source', pick(item, ['source'], '')));
		tr.appendChild(td('destination', pick(item, ['destination'], '')));
		tr.appendChild(td('protocol', pick(item, ['protocol', 'proto'], '')));
		tr.appendChild(td('port', pick(item, ['port'], '')));
		tr.appendChild(td('action', pick(item, ['action'], '')));
		tr.appendChild(td('log', pick(item, ['log', 'fw_log'], '')));
		tr.appendChild(td('expires_at', pick(item, ['expires_at'], '')));
		tr.appendChild(td('remark', pick(item, ['remark'], '')));
		var actions = document.createElement('td');
		actions.className = 'system-actions table-actions';
		actions.innerHTML =
			'<button class="action-btn js-fw-toggle" data-action="edit" type="button" title="편집" aria-label="편집">'
			+ '<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon">'
			+ '</button>'
			+ '<button class="action-btn danger js-fw-del" data-action="delete" type="button" title="삭제" aria-label="삭제">'
			+ '<img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon">'
			+ '</button>';
		tr.appendChild(actions);
		return tr;
	}

	function buildSelectHtml(options, currentValue, placeholder) {
		var cur = String(currentValue || '').toUpperCase();
		var opts = ['<option value=""' + (cur ? '' : ' selected') + ' disabled>선택</option>'];
		for (var i = 0; i < options.length; i++) {
			var item = options[i];
			var v = (typeof item === 'object') ? item.v : item;
			var label = (typeof item === 'object') ? item.l : item;
			opts.push('<option value="' + v + '"' + (cur === v.toUpperCase() ? ' selected' : '') + '>' + label + '</option>');
		}
		return (
			'<select class="search-select" data-searchable-scope="page" data-allow-clear="false" data-placeholder="'
			+ escHtml(placeholder || '')
			+ '">'
			+ opts.join('')
			+ '</select>'
		);
	}

	function wireRowBehaviors(root) {
		if (!root) return;
		try {
			var pr = root.querySelector('td[data-col="priority"] input');
			if (pr) {
				pr.addEventListener('input', function () {
					var v = pr.value || '';
					var filtered = v.replace(/[^0-9]/g, '');
					if (filtered.length > 4) filtered = filtered.slice(0, 4);
					if (filtered !== v) pr.value = filtered;
				});
			}
		} catch (_e1) {}
		try {
			var port = root.querySelector('td[data-col="port"] input');
			if (port) {
				port.addEventListener('input', function () {
					var v = port.value || '';
					var filtered = v.replace(/[^0-9]/g, '');
					if (filtered.length > 5) filtered = filtered.slice(0, 5);
					if (filtered !== v) port.value = filtered;
				});
			}
		} catch (_e2) {}

		function applyDirection() {
			try {
				var dir = root.querySelector('td[data-col="direction"] select');
				var dst = root.querySelector('td[data-col="destination"] input');
				if (!dir || !dst) return;
				if (String(dir.value || '').toUpperCase() === 'IN') {
					dst.value = 'THIS_HOST';
					dst.disabled = true;
				} else {
					if (String(dst.value || '').toUpperCase() === 'THIS_HOST') dst.value = '';
					dst.disabled = false;
				}
			} catch (_e) {}
		}

		function applyProtocol() {
			try {
				var proto = root.querySelector('td[data-col="protocol"] select');
				var port = root.querySelector('td[data-col="port"] input');
				if (!proto || !port) return;
				var pv = String(proto.value || '').toUpperCase();
				var needsPort = pv === 'TCP' || pv === 'UDP';
				port.disabled = !needsPort;
				if (!needsPort) port.value = '';
			} catch (_e) {}
		}

		try {
			var dirSel = root.querySelector('td[data-col="direction"] select');
			if (dirSel) dirSel.addEventListener('change', applyDirection);
			applyDirection();
		} catch (_e3) {}
		try {
			var protoSel = root.querySelector('td[data-col="protocol"] select');
			if (protoSel) protoSel.addEventListener('change', applyProtocol);
			applyProtocol();
		} catch (_e4) {}
	}

	function toEditorRow(tr) {
		if (!tr || tr.classList.contains('fw-row-editor')) return;
		function cellText(col) {
			var td = tr.querySelector('td[data-col="' + col + '"]');
			return td ? normalizeCellText(td.textContent) : '';
		}
		var priority = cellText('priority');
		var status = cellText('status');
		var direction = cellText('direction');
		var name = cellText('name');
		var source = cellText('source');
		var destination = cellText('destination');
		var protocol = cellText('protocol');
		var port = cellText('port');
		var action = cellText('action');
		var log = cellText('log');
		var expiresAt = cellText('expires_at');
		var remark = cellText('remark');

		var tdp = tr.querySelector('td[data-col="priority"]');
		if (tdp) tdp.innerHTML = '<input type="text" inputmode="numeric" value="' + escHtml(priority) + '" placeholder="1~9999">';
		var tds = tr.querySelector('td[data-col="status"]');
		if (tds) tds.innerHTML = buildSelectHtml([{v:'ENABLED',l:'활성'},{v:'DISABLED',l:'비활성'}], status, '상태');
		var tdd = tr.querySelector('td[data-col="direction"]');
		if (tdd) tdd.innerHTML = buildSelectHtml(['IN', 'OUT'], direction, '방향');
		var tdn = tr.querySelector('td[data-col="name"]');
		if (tdn) tdn.innerHTML = '<input type="text" value="' + escHtml(name) + '" placeholder="정책명 (필수)">';
		var tdsr = tr.querySelector('td[data-col="source"]');
		if (tdsr) tdsr.innerHTML = '<input type="text" value="' + escHtml(source) + '" placeholder="출발지">';
		var tdds = tr.querySelector('td[data-col="destination"]');
		if (tdds) tdds.innerHTML = '<input type="text" value="' + escHtml(destination) + '" placeholder="목적지">';
		var tdp2 = tr.querySelector('td[data-col="protocol"]');
		if (tdp2) tdp2.innerHTML = buildSelectHtml(['TCP', 'UDP', 'ICMP', 'ANY'], protocol, '프로토콜');
		var tdport = tr.querySelector('td[data-col="port"]');
		if (tdport) tdport.innerHTML = '<input type="text" inputmode="numeric" value="' + escHtml(port) + '" placeholder="1~65535">';
		var tda = tr.querySelector('td[data-col="action"]');
		if (tda) tda.innerHTML = buildSelectHtml(['ALLOW', 'DENY', 'REJECT', 'DROP'], action, '동작');
		var tdl = tr.querySelector('td[data-col="log"]');
		if (tdl) tdl.innerHTML = buildSelectHtml(['ON', 'OFF'], log, '로그');
		var tde = tr.querySelector('td[data-col="expires_at"]');
		if (tde) tde.innerHTML = '<input type="text" class="date-input fw-expires-date" value="' + escHtml(expiresAt) + '" placeholder="YYYY-MM-DD">';
		var tdr = tr.querySelector('td[data-col="remark"]');
		if (tdr) tdr.innerHTML = '<input type="text" value="' + escHtml(remark) + '" placeholder="비고">';
		tr.classList.add('fw-row-editor');
		enhanceSearchSelect(tr);
		initFwDatePickers(tr);
		wireRowBehaviors(tr);
	}

	function makeNewEditorRow() {
		var tr = document.createElement('tr');
		tr.classList.add('fw-row-editor');
		tr.innerHTML =
			'<td><input type="checkbox" class="fw-row-check" aria-label="행 선택"></td>'
			+ '<td data-col="priority"><input type="text" inputmode="numeric" placeholder="1~9999"></td>'
			+ '<td data-col="status">' + buildSelectHtml([{v:'ENABLED',l:'활성'},{v:'DISABLED',l:'비활성'}], '', '상태') + '</td>'
			+ '<td data-col="direction">' + buildSelectHtml(['IN', 'OUT'], '', '방향') + '</td>'
			+ '<td data-col="name"><input type="text" placeholder="정책명 (필수)"></td>'
			+ '<td data-col="source"><input type="text" placeholder="출발지"></td>'
			+ '<td data-col="destination"><input type="text" placeholder="목적지"></td>'
			+ '<td data-col="protocol">' + buildSelectHtml(['TCP', 'UDP', 'ICMP', 'ANY'], '', '프로토콜') + '</td>'
			+ '<td data-col="port"><input type="text" inputmode="numeric" placeholder="1~65535"></td>'
			+ '<td data-col="action">' + buildSelectHtml(['ALLOW', 'DENY', 'REJECT', 'DROP'], '', '동작') + '</td>'
			+ '<td data-col="log">' + buildSelectHtml(['ON', 'OFF'], '', '로그') + '</td>'
			+ '<td data-col="expires_at"><input type="text" class="date-input fw-expires-date" placeholder="YYYY-MM-DD"></td>'
			+ '<td data-col="remark"><input type="text" placeholder="비고"></td>'
			+ '<td class="system-actions table-actions">'
			+ '<button class="action-btn js-fw-toggle" data-action="save" type="button" title="저장" aria-label="저장">'
			+ '<img src="/static/image/svg/save.svg" alt="저장" class="action-icon">'
			+ '</button>'
			+ '<button class="action-btn danger js-fw-del" data-action="delete" type="button" title="삭제" aria-label="삭제">'
			+ '<img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon">'
			+ '</button>'
			+ '</td>';
		enhanceSearchSelect(tr);
		initFwDatePickers(tr);
		wireRowBehaviors(tr);
		return tr;
	}

	function collectPayload(tr, scopeKey, assetId) {
		function getInput(name) {
			var td = tr.querySelector('td[data-col="' + name + '"]');
			return td ? td.querySelector('input, select, textarea') : null;
		}
		function read(name) {
			var inp = getInput(name);
			return String(inp && inp.value != null ? inp.value : '').trim();
		}

		var nameVal = read('name');
		if (!nameVal) throw new Error('정책명은 필수입니다.');
		var statusVal = read('status');
		if (!statusVal) throw new Error('상태는 필수입니다.');
		var directionVal = read('direction');
		if (!directionVal) throw new Error('방향은 필수입니다.');
		var protoVal = read('protocol').toUpperCase();
		if (!protoVal) throw new Error('프로토콜은 필수입니다.');

		var portVal = read('port');
		if (protoVal === 'TCP' || protoVal === 'UDP') {
			if (!portVal || !/^\d+$/.test(portVal)) throw new Error('포트는 1~65535 숫자만 입력 가능합니다.');
			var portN = parseInt(portVal, 10);
			if (isNaN(portN) || portN < 1 || portN > 65535) throw new Error('포트는 1~65535 범위여야 합니다.');
			portVal = String(portN);
		} else {
			portVal = '';
		}

		var prVal = String(read('priority') || '').replace(/[^0-9]/g, '');
		if (prVal) {
			var pn = parseInt(prVal, 10);
			if (isNaN(pn) || pn < 1 || pn > 9999) throw new Error('우선순위는 1~9999 범위여야 합니다.');
			prVal = String(pn);
		} else {
			prVal = '9999';
		}

		var actionVal = read('action');
		if (!actionVal) throw new Error('동작은 필수입니다.');
		var logVal = read('log');
		if (!logVal) throw new Error('로그는 필수입니다.');
		var expiresVal = read('expires_at');
		if (expiresVal && !/^\d{4}-\d{2}-\d{2}$/.test(expiresVal)) throw new Error('만료일 형식이 올바르지 않습니다. (YYYY-MM-DD)');

		var dst = read('destination');
		if (String(directionVal || '').toUpperCase() === 'IN') dst = 'THIS_HOST';

		return {
			scope_key: scopeKey,
			asset_id: assetId,
			priority: prVal,
			status: statusVal,
			fw_status: statusVal,
			direction: directionVal,
			name: nameVal,
			policy_name: nameVal,
			source: read('source'),
			destination: dst,
			protocol: protoVal,
			proto: protoVal,
			port: portVal,
			action: actionVal,
			log: logVal,
			fw_log: logVal,
			expires_at: expiresVal,
			remark: read('remark'),
		};
	}

	function fwEscapeCSV(val) {
		return '"' + String(val == null ? '' : val).replace(/"/g, '""') + '"';
	}

	function fwRowSaved(tr) {
		try {
			if (tr.classList.contains('fw-row-editor')) return false;
			return !tr.querySelector('td[data-col] input, td[data-col] select, td[data-col] textarea');
		} catch (_e) {
			return false;
		}
	}

	function init(opts) {
		opts = opts || {};
		var table = $('fw-spec-table');
		if (!table) return;
		if (table.dataset && table.dataset.fwInited === '1') return;
		if (table.dataset) table.dataset.fwInited = '1';
		var empty = $('fw-empty');

		var storagePrefix = getStoragePrefix(opts.storagePrefix || opts.storagePrefixFallback);
		var scopeKey = opts.scopeKey || getPageKeyFromPath() || storagePrefix;
		var apiBase = opts.apiBase || '/api/hw-firewallds';
		var pageSizeKey = storagePrefix + ':fw:pageSize';

		function apiList(scopeKey2, assetId2) {
			var url =
				apiBase
				+ '?scope_key='
				+ encodeURIComponent(scopeKey2)
				+ '&asset_id='
				+ encodeURIComponent(String(assetId2))
				+ '&page=1&page_size=2000&_='
				+ Date.now();
			return fetchJsonOrThrow(url, { headers: { Accept: 'application/json' } });
		}

		function apiCreate(payload) {
			return fetchJsonOrThrow(apiBase + '?_=' + Date.now(), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
				body: JSON.stringify(payload),
			});
		}

		function apiUpdate(id, payload) {
			return fetchJsonOrThrow(apiBase + '/' + encodeURIComponent(String(id)) + '?_=' + Date.now(), {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
				body: JSON.stringify(payload),
			});
		}

		function apiDelete(id) {
			return fetchJsonOrThrow(apiBase + '/' + encodeURIComponent(String(id)) + '?_=' + Date.now(), {
				method: 'DELETE',
				headers: { Accept: 'application/json' },
			});
		}

		var fwState = { page: 1, pageSize: 10 };
		function fwRows() {
			var tbody = table.querySelector('tbody');
			return tbody ? Array.from(tbody.querySelectorAll('tr')) : [];
		}
		function fwTotal() {
			return fwRows().length;
		}
		function fwPages() {
			var total = fwTotal();
			return Math.max(1, Math.ceil(total / fwState.pageSize));
		}
		function fwClampPage() {
			var pages = fwPages();
			if (fwState.page > pages) fwState.page = pages;
			if (fwState.page < 1) fwState.page = 1;
		}

		var infoEl = $('fw-pagination-info');
		var numWrap = $('fw-page-numbers');
		var btnFirst = $('fw-first');
		var btnPrev = $('fw-prev');
		var btnNext = $('fw-next');
		var btnLast = $('fw-last');

		function fwUpdatePaginationUI() {
			if (infoEl) {
				var total = fwTotal();
				var start = total ? (fwState.page - 1) * fwState.pageSize + 1 : 0;
				var end = Math.min(total, fwState.page * fwState.pageSize);
				infoEl.textContent = start + '-' + end + ' / ' + total + '개 항목';
			}
			if (numWrap) {
				var pages = fwPages();
				numWrap.innerHTML = '';
				for (var p = 1; p <= pages && p <= 50; p++) {
					var b = document.createElement('button');
					b.className = 'page-btn' + (p === fwState.page ? ' active' : '');
					b.textContent = String(p);
					b.dataset.page = String(p);
					numWrap.appendChild(b);
				}
			}
			var pages2 = fwPages();
			if (btnFirst) btnFirst.disabled = fwState.page === 1;
			if (btnPrev) btnPrev.disabled = fwState.page === 1;
			if (btnNext) btnNext.disabled = fwState.page === pages2;
			if (btnLast) btnLast.disabled = fwState.page === pages2;
			var sizeSel = $('fw-page-size');
			if (sizeSel) {
				var none = fwTotal() === 0;
				sizeSel.disabled = none;
				if (none) {
					try {
						sizeSel.value = '10';
						fwState.pageSize = 10;
					} catch (_e) {}
				}
			}
		}

		function fwRenderPage() {
			fwClampPage();
			var rows = fwRows();
			var startIdx = (fwState.page - 1) * fwState.pageSize;
			var endIdx = startIdx + fwState.pageSize - 1;
			rows.forEach(function (tr, idx) {
				var visible = idx >= startIdx && idx <= endIdx;
				tr.style.display = visible ? '' : 'none';
				if (visible) tr.removeAttribute('data-hidden');
				else tr.setAttribute('data-hidden', '1');
				var cb = tr.querySelector('.fw-row-check');
				if (cb) tr.classList.toggle('selected', !!cb.checked && visible);
			});
			fwUpdatePaginationUI();
			var selectAll = $('fw-select-all');
			if (selectAll) {
				var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .fw-row-check');
				if (visChecks.length) {
					selectAll.checked = Array.prototype.every.call(visChecks, function (c) {
						return c.checked;
					});
				} else {
					selectAll.checked = false;
				}
			}
		}

		function fwGo(p) {
			fwState.page = p;
			fwRenderPage();
		}
		function fwGoDelta(d) {
			fwGo(fwState.page + d);
		}
		function fwGoFirst() {
			fwGo(1);
		}
		function fwGoLast() {
			fwGo(fwPages());
		}

		if (numWrap) {
			numWrap.addEventListener('click', function (e) {
				var b = e.target.closest('button.page-btn');
				if (!b) return;
				var p = parseInt(b.dataset.page, 10);
				if (!isNaN(p)) fwGo(p);
			});
		}
		if (btnFirst) btnFirst.addEventListener('click', fwGoFirst);
		if (btnPrev) btnPrev.addEventListener('click', function () {
			fwGoDelta(-1);
		});
		if (btnNext) btnNext.addEventListener('click', function () {
			fwGoDelta(1);
		});
		if (btnLast) btnLast.addEventListener('click', fwGoLast);

		(function initPageSize() {
			try {
				var saved = localStorage.getItem(pageSizeKey);
				var sel = $('fw-page-size');
				if (sel) {
					if (saved && ['10', '20', '50', '100'].indexOf(saved) > -1) {
						fwState.pageSize = parseInt(saved, 10);
						sel.value = saved;
					}
					sel.addEventListener('change', function () {
						var v = parseInt(sel.value, 10);
						if (!isNaN(v)) {
							fwState.page = 1;
							fwState.pageSize = v;
							try {
								localStorage.setItem(pageSizeKey, String(v));
							} catch (_e) {}
							fwRenderPage();
						}
					});
				}
			} catch (_e) {}
		})();

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
			var csvBtn = $('fw-download-btn');
			if (csvBtn) {
				var has = !!table.querySelector('tbody tr');
				csvBtn.disabled = !has;
				csvBtn.setAttribute('aria-disabled', (!has).toString());
				csvBtn.title = has ? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.';
			}
			fwRenderPage();
		}

		function fwVisibleRows() {
			var tbody = table.querySelector('tbody');
			if (!tbody) return [];
			return Array.from(tbody.querySelectorAll('tr')).filter(function (tr) {
				return !(tr.hasAttribute('data-hidden') || tr.style.display === 'none');
			});
		}
		function fwSavedVisibleRows() {
			return fwVisibleRows().filter(fwRowSaved);
		}

		function fwExportCSV(onlySelected) {
			var headers = ['우선순위', '상태', '방향', '정책명', '출발지', '목적지', '프로토콜', '포트', '동작', '로그', '만료일', '비고'];
			var trs = fwSavedVisibleRows();
			if (onlySelected) {
				trs = trs.filter(function (tr) {
					var cb = tr.querySelector('.fw-row-check');
					return cb && cb.checked;
				});
			}
			if (trs.length === 0) return;
			var rows = trs.map(function (tr) {
				function text(col) {
					var td = tr.querySelector('td[data-col="' + col + '"]');
					return td ? (td.textContent || '').trim() : '';
				}
				return ['priority', 'status', 'direction', 'name', 'source', 'destination', 'protocol', 'port', 'action', 'log', 'expires_at', 'remark'].map(text);
			});
			var lines = [headers].concat(rows).map(function (arr) {
				return arr.map(fwEscapeCSV).join(',');
			});
			var csv = '\uFEFF' + lines.join('\r\n');
			var d = new Date();
			var yyyy = d.getFullYear();
			var mm = String(d.getMonth() + 1).padStart(2, '0');
			var dd = String(d.getDate()).padStart(2, '0');
			var filename = 'firewalld_' + yyyy + mm + dd + '.csv';
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
			} catch (_e2) {
				var a2 = document.createElement('a');
				a2.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
				a2.download = filename;
				document.body.appendChild(a2);
				a2.click();
				document.body.removeChild(a2);
			}
		}

		var selectAll = $('fw-select-all');
		if (selectAll) {
			selectAll.addEventListener('change', function () {
				var checks = table.querySelectorAll('.fw-row-check:not([disabled])');
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
			var onCheckbox = ev.target.closest('input[type="checkbox"].fw-row-check');
			if (isControl && !onCheckbox) return;
			if (onCheckbox) return;
			var cb = tr.querySelector('.fw-row-check');
			if (!cb) return;
			var hidden = tr.hasAttribute('data-hidden') || tr.style.display === 'none';
			if (hidden) return;
			cb.checked = !cb.checked;
			tr.classList.toggle('selected', cb.checked);
			var sa = $('fw-select-all');
			if (sa) {
				var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .fw-row-check');
				if (visChecks.length) {
					sa.checked = Array.prototype.every.call(visChecks, function (c) {
						return c.checked;
					});
				} else {
					sa.checked = false;
				}
			}
		});

		table.addEventListener('change', function (ev) {
			var cb = ev.target.closest('.fw-row-check');
			if (!cb) return;
			var tr = cb.closest('tr');
			if (tr) {
				var hidden = tr.hasAttribute('data-hidden') || tr.style.display === 'none';
				tr.classList.toggle('selected', !!cb.checked && !hidden);
			}
			var sa = $('fw-select-all');
			if (sa) {
				var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .fw-row-check');
				if (visChecks.length) {
					sa.checked = Array.prototype.every.call(visChecks, function (c) {
						return c.checked;
					});
				} else {
					sa.checked = false;
				}
			}
		});

		(function wireCsvModal() {
			var btn = $('fw-download-btn');
			var modalId = 'fw-download-modal';
			var closeBtn = $('fw-download-close');
			var confirmBtn = $('fw-download-confirm');
			var modalEl = $(modalId);
			if (btn) {
				btn.addEventListener('click', function () {
					if (btn.disabled) return;
					var saved = fwSavedVisibleRows();
					var total = saved.length;
					if (total <= 0) return;
					var selectedCount = saved.filter(function (tr) {
						var cb = tr.querySelector('.fw-row-check');
						return cb && cb.checked;
					}).length;
					var subtitle = $('fw-download-subtitle');
					if (subtitle) {
						subtitle.textContent =
							selectedCount > 0
								? '선택된 ' + selectedCount + '개 또는 전체 ' + total + '개 결과 중 범위를 선택하세요.'
								: '현재 결과 ' + total + '개 항목을 CSV로 내보냅니다.';
					}
					var rowSelectedWrap = $('fw-csv-range-row-selected');
					var optSelected = $('fw-csv-range-selected');
					var optAll = $('fw-csv-range-all');
					if (rowSelectedWrap) rowSelectedWrap.hidden = !(selectedCount > 0);
					if (optSelected) {
						optSelected.disabled = !(selectedCount > 0);
						optSelected.checked = selectedCount > 0;
					}
					if (optAll) optAll.checked = !(selectedCount > 0);
					if (modalEl) openModalLocal(modalId);
					else fwExportCSV(false);
				});
			}
			if (closeBtn) closeBtn.addEventListener('click', function () {
				closeModalLocal(modalId);
			});
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
					var onlySel = !!($('fw-csv-range-selected') && $('fw-csv-range-selected').checked);
					fwExportCSV(onlySel);
					closeModalLocal(modalId);
				});
			}
		})();

		var addBtn = $('fw-row-add');
		if (addBtn) {
			addBtn.addEventListener('click', function () {
				var tbody = table.querySelector('tbody');
				if (!tbody) return;
				var tr = makeNewEditorRow();
				tbody.appendChild(tr);
				updateEmptyState();
				try {
					fwGoLast();
				} catch (_e) {}
			});
		}

		/* ── 삭제 확인 모달 ── */
		var _fwDeleteTarget = null;
		(function wireFwDeleteModal(){
			var modal   = $('fw-delete-modal');
			var closeB  = $('fw-delete-close');
			var cancelB = $('fw-delete-cancel');
			var confirmB= $('fw-delete-confirm');
			function close(){ if(modal){ modal.classList.remove('show'); modal.setAttribute('aria-hidden','true'); } _fwDeleteTarget = null; }
			if(closeB)  closeB.addEventListener('click', close);
			if(cancelB) cancelB.addEventListener('click', close);
			if(modal) modal.addEventListener('click', function(e){ if(e.target === modal) close(); });
			if(confirmB) confirmB.addEventListener('click', function(){
				var tr = _fwDeleteTarget;
				close();
				if(!tr) return;
				var rowId = getRowId(tr);
				if(rowId){
					apiDelete(rowId).then(function(){
						if(tr && tr.parentNode) tr.parentNode.removeChild(tr);
						fwClampPage();
						updateEmptyState();
					}).catch(function(err){
						showNoticeSafe('삭제 실패: ' + (err && err.message ? err.message : String(err)));
					});
				} else {
					if(tr && tr.parentNode) tr.parentNode.removeChild(tr);
					fwClampPage();
					updateEmptyState();
				}
			});
		})();

		/* ── 알림 모달 닫기 ── */
		(function wireFwNoticeModal(){
			var modal  = $('fw-notice-modal');
			var closeB = $('fw-notice-close');
			var okB    = $('fw-notice-ok');
			function close(){ if(modal){ modal.setAttribute('aria-hidden','true'); modal.style.display='none'; } }
			if(closeB) closeB.addEventListener('click', close);
			if(okB)    okB.addEventListener('click', close);
			if(modal)  modal.addEventListener('click', function(e){ if(e.target === modal) close(); });
		})();

		table.addEventListener('click', function (ev) {
			var target = ev.target.closest('.js-fw-del, .js-fw-toggle');
			if (!target) return;
			var tr = target.closest('tr');
			if (!tr) return;

			if (target.classList.contains('js-fw-del')) {
				var modal = $('fw-delete-modal');
				if (modal) {
					_fwDeleteTarget = tr;
					modal.classList.add('show');
					modal.setAttribute('aria-hidden', 'false');
				} else {
					var rowId = getRowId(tr);
					if (rowId) {
						apiDelete(rowId)
							.then(function () {
								if (tr && tr.parentNode) tr.parentNode.removeChild(tr);
								fwClampPage();
								updateEmptyState();
							})
							.catch(function (err) {
								showNoticeSafe('삭제 실패: ' + (err && err.message ? err.message : String(err)));
							});
					} else {
						if (tr && tr.parentNode) tr.parentNode.removeChild(tr);
						fwClampPage();
						updateEmptyState();
					}
				}
				return;
			}

			var action = target.getAttribute('data-action') || '';
			if (action === 'edit') {
				toEditorRow(tr);
				target.setAttribute('data-action', 'save');
				target.title = '저장';
				target.setAttribute('aria-label', '저장');
				target.innerHTML = '<img src="/static/image/svg/save.svg" alt="저장" class="action-icon">';
				return;
			}

			if (action === 'save') {
				var assetId = getAssetId(storagePrefix);
				if (!assetId || !scopeKey) {
					showNoticeSafe('저장 실패: 자산 정보(asset_id)를 찾을 수 없습니다.');
					return;
				}
				ensureUrlHasAssetId(assetId);
				ensureTabLinksCarryAssetId(assetId);
				var payload;
				try {
					payload = collectPayload(tr, scopeKey, assetId);
				} catch (e) {
					showNoticeSafe('저장 실패: ' + (e && e.message ? e.message : String(e)));
					return;
				}
				var id = getRowId(tr);
				target.disabled = true;
				(id ? apiUpdate(id, payload) : apiCreate(payload))
					.then(function (saved) {
						var tbody = tr.parentNode;
						var wasChecked = false;
						try {
							var cb = tr.querySelector('.fw-row-check');
							wasChecked = !!(cb && cb.checked);
						} catch (_e) {}
						var newTr = renderSavedRow(saved);
						if (wasChecked) {
							try {
								var cb2 = newTr.querySelector('.fw-row-check');
								if (cb2) {
									cb2.checked = true;
									newTr.classList.add('selected');
								}
							} catch (_e2) {}
						}
						if (tbody) tbody.replaceChild(newTr, tr);
						updateEmptyState();
					})
					.catch(function (err) {
						showNoticeSafe('저장 실패: ' + (err && err.message ? err.message : String(err)));
					})
					.finally(function () {
						target.disabled = false;
					});
				return;
			}
		});

		async function loadFromApi() {
			var assetId = getAssetId(storagePrefix);
			if (!assetId || !scopeKey) {
				updateEmptyState();
				return;
			}
			ensureUrlHasAssetId(assetId);
			ensureTabLinksCarryAssetId(assetId);
			var tbody = table.querySelector('tbody');
			if (!tbody) return;

			var preserved = [];
			try {
				preserved = Array.from(tbody.querySelectorAll('tr.fw-row-editor')).filter(function (r) {
					return !getRowId(r);
				});
			} catch (_e) {
				preserved = [];
			}

			var data = await apiList(scopeKey, assetId);
			var items = data && data.items ? data.items : [];
			tbody.innerHTML = '';
			items.forEach(function (it) {
				tbody.appendChild(renderSavedRow(it));
			});
			preserved.forEach(function (r) {
				tbody.appendChild(r);
			});
			updateEmptyState();
		}

		try {
			loadFromApi();
		} catch (_e) {
			updateEmptyState();
		}
	}

	function autoInit() {
		try {
			if (!document.getElementById('fw-spec-table')) return;
			/* 공유 템플릿(.tab08-fw-root)이면 data-* 속성에서 설정값을 읽는다 */
			var root = document.querySelector('.tab08-fw-root');
			var opts = {};
			if (root) {
				if (root.dataset.storagePrefix) opts.storagePrefix = root.dataset.storagePrefix;
				if (root.dataset.apiBase) opts.apiBase = root.dataset.apiBase;
			}
			init(opts);
		} catch (_e) {}
	}

	global.BlossomTab08Firewalld = { init: init, autoInit: autoInit };
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', autoInit);
	} else {
		autoInit();
	}
})(window);

/*
 * Legacy broken implementation (disabled)
 */

/*
(function(){
	// Utilities

	// Flatpickr (calendar) loader and initializer (match server modal EOSL UX)
	var FLATPICKR_CSS = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css';
	var FLATPICKR_THEME_NAME = 'airbnb';
	var FLATPICKR_THEME_HREF = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/themes/' + FLATPICKR_THEME_NAME + '.css';
	var FLATPICKR_JS = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.js';
	var FLATPICKR_KO = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/l10n/ko.js';

	function ensureCss(href, id){
		try{
			var existing = document.getElementById(id);
			if(existing && existing.tagName && existing.tagName.toLowerCase() === 'link'){
				if(existing.getAttribute('href') !== href) existing.setAttribute('href', href);
				return;
			}
			var l = document.createElement('link');
			l.rel = 'stylesheet';
			l.href = href;
			l.id = id;
			document.head.appendChild(l);
		}catch(_){ }
	}

	function loadScript(src){
		return new Promise(function(resolve, reject){
			try{
				var s = document.createElement('script');
				s.src = src;
				s.async = true;
				s.onload = function(){ resolve(); };
				s.onerror = function(){ reject(new Error('Script load failed: ' + src)); };
				document.head.appendChild(s);
			}catch(e){ reject(e); }
		});
	}

	var __fwFlatpickrLoading = null;
	function ensureFlatpickr(){
		ensureCss(FLATPICKR_CSS, 'flatpickr-css');
		ensureCss(FLATPICKR_THEME_HREF, 'flatpickr-theme-css');
		if(window.flatpickr) return Promise.resolve();
		if(__fwFlatpickrLoading) return __fwFlatpickrLoading;
		__fwFlatpickrLoading = loadScript(FLATPICKR_JS)
		
		table.addEventListener('click', function(ev){
			var target = ev.target.closest('.js-fw-del, .js-fw-toggle');
			if(!target) return;
			var tr = target.closest('tr');
			if(!tr) return;

			if(target.classList.contains('js-fw-del')){
				var rowId = getRowId(tr);
				if(rowId){
					apiDelete(rowId).then(function(){
						if(tr && tr.parentNode){ tr.parentNode.removeChild(tr); }
						try{ fwClampPage(); }catch(_){ }
						updateEmptyState();
					}).catch(function(err){
						try{ if(typeof showNotice === 'function') showNotice('삭제 실패: ' + (err && err.message ? err.message : String(err))); }catch(_){ }
					});
				}else{
					if(tr && tr.parentNode){ tr.parentNode.removeChild(tr); }
					try{ fwClampPage(); }catch(_){ }
					updateEmptyState();
				}
				return;
			}

			var action = target.getAttribute('data-action') || '';
			if(action === 'edit'){
				function toInput(name){
					var td = tr.querySelector('[data-col="'+name+'"]');
					if(!td) return;
					var current = (td.textContent||'').trim();
					if(name==='priority'){
						var pv0=current; if(pv0==='-') pv0='';
						td.innerHTML = '<input type="text" inputmode="numeric" value="'+escHtml(pv0)+'" placeholder="1~9999">';
						return;
					}
					if(name==='status'){
						var sv=current; if(sv==='-') sv='';
						var sopts=[
							'<option value=""'+(sv?'':' selected')+' disabled>선택</option>',
							'<option value="ENABLED"'+(sv.toUpperCase()==='ENABLED'?' selected':'')+'>ENABLED</option>',
							'<option value="DISABLED"'+(sv.toUpperCase()==='DISABLED'?' selected':'')+'>DISABLED</option>'
						].join('');
						td.innerHTML = '<select class="search-select" data-searchable-scope="page" data-allow-clear="false" data-placeholder="상태">'+sopts+'</select>';
						return;
					}
					if(name==='direction'){
						var dv=current; if(dv==='-') dv='';
						var d2=[
							'<option value=""'+(dv?'':' selected')+' disabled>선택</option>',
							'<option value="IN"'+(dv.toUpperCase()==='IN'?' selected':'')+'>IN</option>',
							'<option value="OUT"'+(dv.toUpperCase()==='OUT'?' selected':'')+'>OUT</option>'
						].join('');
						td.innerHTML = '<select class="search-select" data-searchable-scope="page" data-allow-clear="false" data-placeholder="방향">'+d2+'</select>';
						return;
					}
					if(name==='protocol'){
						var pv=current; if(pv==='-') pv='';
						var p2=[
							'<option value=""'+(pv?'':' selected')+' disabled>선택</option>',
							'<option value="TCP"'+(pv.toUpperCase()==='TCP'?' selected':'')+'>TCP</option>',
							'<option value="UDP"'+(pv.toUpperCase()==='UDP'?' selected':'')+'>UDP</option>',
							'<option value="ICMP"'+(pv.toUpperCase()==='ICMP'?' selected':'')+'>ICMP</option>',
							'<option value="ANY"'+(pv.toUpperCase()==='ANY'?' selected':'')+'>ANY</option>'
						].join('');
						td.innerHTML = '<select class="search-select" data-searchable-scope="page" data-allow-clear="false" data-placeholder="프로토콜">'+p2+'</select>';
						return;
					}
					if(name==='action'){
						var av=current; if(av==='-') av='';
						var a2=[
							'<option value=""'+(av?'':' selected')+' disabled>선택</option>',
							'<option value="ALLOW"'+(av.toUpperCase()==='ALLOW'?' selected':'')+'>ALLOW</option>',
							'<option value="DENY"'+(av.toUpperCase()==='DENY'?' selected':'')+'>DENY</option>',
							'<option value="REJECT"'+(av.toUpperCase()==='REJECT'?' selected':'')+'>REJECT</option>',
							'<option value="DROP"'+(av.toUpperCase()==='DROP'?' selected':'')+'>DROP</option>'
						].join('');
						td.innerHTML = '<select class="search-select" data-searchable-scope="page" data-allow-clear="false" data-placeholder="동작">'+a2+'</select>';
						return;
					}
					if(name==='log'){
						var lv=current; if(lv==='-') lv='';
						var l2=[
							'<option value=""'+(lv?'':' selected')+' disabled>선택</option>',
							'<option value="ON"'+(lv.toUpperCase()==='ON'?' selected':'')+'>ON</option>',
							'<option value="OFF"'+(lv.toUpperCase()==='OFF'?' selected':'')+'>OFF</option>'
						].join('');
						td.innerHTML = '<select class="search-select" data-searchable-scope="page" data-allow-clear="false" data-placeholder="로그">'+l2+'</select>';
						return;
					}
					if(name==='port'){
						td.innerHTML = '<input type="text" inputmode="numeric" value="'+escHtml(current==='-'?'':current)+'" placeholder="1~65535">';
						return;
					}
					if(name==='expires_at'){
						var dv2=current; if(dv2==='-') dv2='';
						td.innerHTML = '<input type="text" class="date-input fw-expires-date" value="'+escHtml(dv2)+'" placeholder="YYYY-MM-DD">';
						return;
					}
					td.innerHTML = '<input type="text" value="'+escHtml(current==='-'?'':current)+'">';
				}

				['priority','status','direction','name','source','destination','protocol','port','action','log','expires_at','remark'].forEach(function(n){ toInput(n); });
				try{ tr.classList.add('fw-row-editor'); }catch(_){ }
				wireFwRowBehaviors(tr);
				try{ initFwDatePickers(tr); }catch(_){ }
				try{
					if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function'){
						window.BlossomSearchableSelect.enhance(tr);
					}
				}catch(_){ }
				target.setAttribute('data-action','save');
				target.title = '저장';
				target.setAttribute('aria-label','저장');
				target.innerHTML = '<img src="/static/image/svg/save.svg" alt="저장" class="action-icon">';
				return;
			}

			if(action === 'save'){
				function getInput(name){ var td = tr.querySelector('[data-col="'+name+'"]'); return td ? td.querySelector('input, select') : null; }
				function setError(input, on){
					if(!input) return;
					if(on){ input.classList.add('input-error'); input.setAttribute('aria-invalid','true'); }
					else { input.classList.remove('input-error'); input.removeAttribute('aria-invalid'); }
				}
				function read(name){ var inp = getInput(name); var v = inp ? inp.value : ''; return String(v||'').trim(); }

				var nameInp = getInput('name');
				var nameVal = (nameInp ? nameInp.value : '').trim();
				if(!nameVal){ setError(nameInp,true); try{ nameInp.focus(); }catch(_){} return; }
				setError(nameInp,false);

				var prInp = getInput('priority');
				var prVal = read('priority');
				if(prVal && !/^\d+$/.test(prVal)){ setError(prInp,true); try{ prInp.focus(); }catch(_){} return; }
				if(prVal){
					var pn = parseInt(prVal, 10);
					if(isNaN(pn) || pn < 1 || pn > 9999){ setError(prInp,true); try{ prInp.focus(); }catch(_){} return; }
				}
				setError(prInp,false);

				var statusInp = getInput('status');
				if(!read('status')){ setError(statusInp,true); try{ statusInp.focus(); }catch(_){} return; }
				setError(statusInp,false);

				var dirInp = getInput('direction');
				if(!read('direction')){ setError(dirInp,true); try{ dirInp.focus(); }catch(_){} return; }
				setError(dirInp,false);

				var protoInp = getInput('protocol');
				var protoVal = read('protocol').toUpperCase();
				if(!protoVal){ setError(protoInp,true); try{ protoInp.focus(); }catch(_){} return; }
				setError(protoInp,false);

				var portInp = getInput('port');
				var portVal = read('port');
				if(protoVal === 'TCP' || protoVal === 'UDP'){
					if(!portVal || !/^\d+$/.test(portVal)){ setError(portInp,true); try{ portInp.focus(); }catch(_){} return; }
					var portN = parseInt(portVal, 10);
					if(isNaN(portN) || portN < 1 || portN > 65535){ setError(portInp,true); try{ portInp.focus(); }catch(_){} return; }
					setError(portInp,false);
				}else{
					setError(portInp,false);
				}

				var actionInp = getInput('action');
				if(!read('action')){ setError(actionInp,true); try{ actionInp.focus(); }catch(_){} return; }
				setError(actionInp,false);

				var logInp = getInput('log');
				if(!read('log')){ setError(logInp,true); try{ logInp.focus(); }catch(_){} return; }
				setError(logInp,false);

				var expInp = getInput('expires_at');
				var expVal = read('expires_at');
				if(expVal && !/^\d{4}-\d{2}-\d{2}$/.test(expVal)){
					setError(expInp, true);
					try{ expInp.focus(); }catch(_){ }
					return;
				}
				setError(expInp,false);

				var assetId = getAssetId(storagePrefix);
				if(!assetId || !scopeKey){
					try{ if(typeof showNotice === 'function') showNotice('저장 실패: 자산 정보(asset_id)를 찾을 수 없습니다.'); }catch(_){ }
					return;
				}
				ensureUrlHasAssetId(assetId);
				ensureTabLinksCarryAssetId(assetId);

				var cleanPriority = String(prVal||'').replace(/[^0-9]/g,'');
				if(!cleanPriority) cleanPriority = '9999';
				var cleanPort = String(portVal||'').replace(/[^0-9]/g,'');
				if(!(protoVal === 'TCP' || protoVal === 'UDP')) cleanPort = '';

				var payload = {
					scope_key: scopeKey,
					asset_id: assetId,
					priority: cleanPriority,
					status: read('status'),
					direction: read('direction'),
					name: nameVal,
					source: read('source'),
					destination: read('destination'),
					protocol: protoVal,
					port: cleanPort,
					action: read('action'),
					log: read('log'),
					expires_at: expVal,
					remark: read('remark')
				};

				var id = getRowId(tr);
				target.disabled = true;
				(id ? apiUpdate(id, payload) : apiCreate(payload))
					.then(function(saved){
						var tbody = tr.parentNode;
						var wasChecked = false;
						try{ var cb = tr.querySelector('.fw-row-check'); wasChecked = !!(cb && cb.checked); }catch(_){ }
						var newTr = renderSavedRow(saved);
						if(wasChecked){
							try{
								var cb2 = newTr.querySelector('.fw-row-check');
								if(cb2){ cb2.checked = true; newTr.classList.add('selected'); }
							}catch(_){ }
						}
						if(tbody){ tbody.replaceChild(newTr, tr); }
						updateEmptyState();
					})
					.catch(function(err){
						try{ if(typeof showNotice === 'function') showNotice('저장 실패: ' + (err && err.message ? err.message : String(err))); }catch(_){ }
					})
					.finally(function(){ target.disabled = false; });
				return;
			}
		});

		async function loadFromApi(){
			var assetId = getAssetId(storagePrefix);
			if(!assetId || !scopeKey){
				updateEmptyState();
				return;
			}
			ensureUrlHasAssetId(assetId);
			ensureTabLinksCarryAssetId(assetId);
			var tbody = table.querySelector('tbody');
			if(!tbody) return;
			var preserved = [];
			try{
				preserved = Array.from(tbody.querySelectorAll('tr.fw-row-editor')).filter(function(r){ return !getRowId(r); });
			}catch(_){ preserved = []; }
			var data = await apiList(scopeKey, assetId);
			var items = (data && data.items) ? data.items : [];
			tbody.innerHTML = '';
			items.forEach(function(item){ tbody.appendChild(renderSavedRow(item)); });
			preserved.forEach(function(r){ tbody.appendChild(r); });
			updateEmptyState();
		}

		try{ loadFromApi(); }catch(_){ updateEmptyState(); }
	}
			'<td><input type="checkbox" class="fw-row-check" aria-label="행 선택"></td>',
			'<td data-col="priority">'+escHtml((item && item.priority != null) ? String(item.priority) : '9999')+'</td>',
			'<td data-col="status">'+escHtml(item && item.status ? item.status : '-')+'</td>',
			'<td data-col="direction">'+escHtml(item && item.direction ? item.direction : '-')+'</td>',
			'<td data-col="name">'+escHtml(item && item.name ? item.name : '-')+'</td>',
			'<td data-col="source">'+escHtml(item && item.source ? item.source : '-')+'</td>',
			'<td data-col="destination">'+escHtml(item && item.destination ? item.destination : '-')+'</td>',
			'<td data-col="protocol">'+escHtml(item && item.protocol ? item.protocol : '-')+'</td>',
			'<td data-col="port">'+escHtml(item && item.port ? item.port : '-')+'</td>',
			'<td data-col="action">'+escHtml(item && item.action ? item.action : '-')+'</td>',
			'<td data-col="log">'+escHtml(item && item.log ? item.log : '-')+'</td>',
			'<td data-col="expires_at">'+escHtml(item && item.expires_at ? item.expires_at : '-')+'</td>',
			'<td data-col="remark">'+escHtml(item && item.remark ? item.remark : '-')+'</td>',
			'<td class="system-actions table-actions">'
				+'<button class="action-btn js-fw-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button>'
				+'<button class="action-btn danger js-fw-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'
			+'</td>'
		].join('');
		return tr;
	}

	// CSV

	

	

	

	function fwEscapeCSV(val){ return '"' + String(val).replace(/"/g,'""') + '"'; }
	function fwRowSaved(tr){
		var t = tr.querySelector('.js-fw-toggle');
		var inEdit = t && t.getAttribute('data-action') === 'save';
		if(inEdit) return false;
		return !tr.querySelector('td[data-col] input, td[data-col] select, td[data-col] textarea');
	}

	// Modal

	

	

	

	function openModalLocal(id){
		var el = document.getElementById(id);
		if(!el) return;
		try{ el.hidden = false; }catch(_){ }
		document.body.classList.add('modal-open');
		el.classList.add('show');
		el.setAttribute('aria-hidden','false');
	}

	function closeModalLocal(id){
		var el = document.getElementById(id);
		if(!el) return;
		el.classList.remove('show');
		el.setAttribute('aria-hidden','true');
		try{ el.hidden = true; }catch(_){ }
		if(!document.querySelector('.modal-overlay-full.show')){
			document.body.classList.remove('modal-open');
		}
	}

	function wireFwRowBehaviors(root){
		if(!root) return;
		try{ ensureFwSearchableSelectSources(); }catch(_){ }
		try{
			if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function'){
				window.BlossomSearchableSelect.enhance(root);
			}
		}catch(_){ }
		try{
			var pr = root.querySelector('td[data-col="priority"] input');
			if(pr){
				pr.addEventListener('input', function(){
					var v = pr.value || '';
					var filtered = v.replace(/[^0-9]/g,'');
					if(filtered.length > 4) filtered = filtered.slice(0, 4);
					if(filtered !== v) pr.value = filtered;
				});
			}
		}catch(_){ }
		try{
			var port = root.querySelector('td[data-col="port"] input');
			if(port){
				port.addEventListener('input', function(){
					var v = port.value || '';
					var filtered = v.replace(/[^0-9]/g,'');
					if(filtered.length > 5) filtered = filtered.slice(0, 5);
					if(filtered !== v) port.value = filtered;
				});
			}
		}catch(_){ }

		function applyDirection(){
			try{
				var dir = root.querySelector('td[data-col="direction"] select');
				var dst = root.querySelector('td[data-col="destination"] input');
				if(!dir || !dst) return;
				if(String(dir.value||'').toUpperCase() === 'IN'){
					dst.value = 'THIS_HOST';
					dst.disabled = true;
				}else{
					if(String(dst.value||'').toUpperCase() === 'THIS_HOST') dst.value = '';
					dst.disabled = false;
				}
			}catch(_){ }
		}

		function applyProtocol(){
			try{
				var proto = root.querySelector('td[data-col="protocol"] select');
				var port = root.querySelector('td[data-col="port"] select') || root.querySelector('td[data-col="port"] input');
				if(!proto || !port) return;
				var pv = String(proto.value || '').toUpperCase();
				var needsPort = (pv === 'TCP' || pv === 'UDP');
				port.disabled = !needsPort;
				if(!needsPort) port.value = '';
				try{
					if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function'){
						window.BlossomSearchableSelect.enhance(port);
					}
				}catch(_e){ }
			}catch(_){ }
		}

		try{
			var dirSel = root.querySelector('td[data-col="direction"] select');
			if(dirSel){ dirSel.addEventListener('change', applyDirection); }
			applyDirection();
		}catch(_){ }
		try{
			var protoSel = root.querySelector('td[data-col="protocol"] select');
			if(protoSel){ protoSel.addEventListener('change', applyProtocol); }
			applyProtocol();
		}catch(_){ }

		// Attach EOSL-style calendar to expires_at field
		try{ initFwDatePickers(root); }catch(_){ }
	}

	// Init

	

	

	

	function init(opts){
		opts = opts || {};
		var table = document.getElementById('fw-spec-table');
		if(!table) return;
		if(table.dataset && table.dataset.fwInited === '1') return;
		try{ if(table.dataset) table.dataset.fwInited = '1'; }catch(_){ }
		var empty = document.getElementById('fw-empty');

		var storagePrefix = getStoragePrefix(opts.storagePrefix || opts.storagePrefixFallback || guessStoragePrefixFallback());
		var scopeKey = opts.scopeKey || getPageKey() || storagePrefix;
		var pageSizeKey = storagePrefix + ':fw:pageSize';

	// Pagination

	

		var fwState = { page:1, pageSize:10 };

		function fwRows(){ var tbody = table.querySelector('tbody'); return tbody ? Array.from(tbody.querySelectorAll('tr')) : []; }
		function fwTotal(){ return fwRows().length; }
		function fwPages(){ var total = fwTotal(); return Math.max(1, Math.ceil(total / fwState.pageSize)); }
		function fwClampPage(){ var pages = fwPages(); if(fwState.page > pages) fwState.page = pages; if(fwState.page < 1) fwState.page = 1; }

		var infoEl = document.getElementById('fw-pagination-info');
		var numWrap = document.getElementById('fw-page-numbers');
		var btnFirst = document.getElementById('fw-first');
		var btnPrev = document.getElementById('fw-prev');
		var btnNext = document.getElementById('fw-next');
		var btnLast = document.getElementById('fw-last');

		function fwUpdatePaginationUI(){
			if(infoEl){
				var total = fwTotal();
				var start = total ? (fwState.page-1)*fwState.pageSize+1 : 0;
				var end = Math.min(total, fwState.page*fwState.pageSize);
				infoEl.textContent = start + '-' + end + ' / ' + total + '개 항목';
			}
			if(numWrap){
				var pages = fwPages();
				numWrap.innerHTML = '';
				for(var p=1;p<=pages && p<=50;p++){
					var b = document.createElement('button');
					b.className = 'page-btn' + (p===fwState.page ? ' active' : '');
					b.textContent = String(p);
					b.dataset.page = String(p);
					numWrap.appendChild(b);
				}
			}
			var pages2 = fwPages();
			if(btnFirst) btnFirst.disabled = (fwState.page === 1);
			if(btnPrev) btnPrev.disabled = (fwState.page === 1);
			if(btnNext) btnNext.disabled = (fwState.page === pages2);
			if(btnLast) btnLast.disabled = (fwState.page === pages2);
			var sizeSel = document.getElementById('fw-page-size');
			if(sizeSel){
				var none = (fwTotal() === 0);
				sizeSel.disabled = none;
				if(none){
					try{ sizeSel.value = '10'; fwState.pageSize = 10; }catch(_){ }
				}
			}
		}

		function fwRenderPage(){
			fwClampPage();
			var rows = fwRows();
			var startIdx = (fwState.page-1)*fwState.pageSize;
			var endIdx = startIdx + fwState.pageSize - 1;
			rows.forEach(function(tr, idx){
				var visible = idx >= startIdx && idx <= endIdx;
				tr.style.display = visible ? '' : 'none';
				if(visible){ tr.removeAttribute('data-hidden'); } else { tr.setAttribute('data-hidden','1'); }
				var cb = tr.querySelector('.fw-row-check');
				if(cb){ tr.classList.toggle('selected', !!cb.checked && visible); }
			});
			fwUpdatePaginationUI();
			var selectAll = document.getElementById('fw-select-all');
			if(selectAll){
				var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .fw-row-check');
				if(visChecks.length){
					selectAll.checked = Array.prototype.every.call(visChecks, function(c){ return c.checked; });
				}else{
					selectAll.checked = false;
				}
			}
		}

		function fwGo(p){ fwState.page = p; fwRenderPage(); }
		function fwGoDelta(d){ fwGo(fwState.page + d); }
		function fwGoFirst(){ fwGo(1); }
		function fwGoLast(){ fwGo(fwPages()); }

		if(numWrap){ numWrap.addEventListener('click', function(e){ var b=e.target.closest('button.page-btn'); if(!b) return; var p=parseInt(b.dataset.page,10); if(!isNaN(p)) fwGo(p); }); }
		if(btnFirst) btnFirst.addEventListener('click', fwGoFirst);
		if(btnPrev) btnPrev.addEventListener('click', function(){ fwGoDelta(-1); });
		if(btnNext) btnNext.addEventListener('click', function(){ fwGoDelta(1); });
		if(btnLast) btnLast.addEventListener('click', fwGoLast);

		(function initPageSize(){
			try{
				var saved = localStorage.getItem(pageSizeKey);
				var sel = document.getElementById('fw-page-size');
				if(sel){
					if(saved && ['10','20','50','100'].indexOf(saved)>-1){ fwState.pageSize = parseInt(saved,10); sel.value = saved; }
					sel.addEventListener('change', function(){
						var v = parseInt(sel.value,10);
						if(!isNaN(v)){
							fwState.page = 1;
							fwState.pageSize = v;
							try{ localStorage.setItem(pageSizeKey, String(v)); }catch(_){ }
							fwRenderPage();
						}
					});
				}
			}catch(_){ }
		})();

		function updateEmptyState(){
			try{
				var hasRows = table.querySelector('tbody tr') != null;
				if(empty){ empty.hidden = !!hasRows; empty.style.display = hasRows ? 'none' : ''; }
			}catch(_){ if(empty){ empty.hidden = false; empty.style.display = ''; } }

			var csvBtn = document.getElementById('fw-download-btn');
			if(csvBtn){
				var has = !!table.querySelector('tbody tr');
				csvBtn.disabled = !has;
				csvBtn.setAttribute('aria-disabled', (!has).toString());
				csvBtn.title = has ? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.';
			}

			fwRenderPage();
		}

		function fwVisibleRows(){
			var tbody = table.querySelector('tbody');
			if(!tbody) return [];
			return Array.from(tbody.querySelectorAll('tr')).filter(function(tr){ return !(tr.hasAttribute('data-hidden') || tr.style.display==='none'); });
		}

		function fwSavedVisibleRows(){ return fwVisibleRows().filter(fwRowSaved); }

		function fwExportCSV(onlySelected){
			var headers = ['우선순위','상태','방향','정책명','출발지','목적지','프로토콜','포트','동작','로그','만료일','비고'];
			var trs = fwSavedVisibleRows();
			if(onlySelected){
				trs = trs.filter(function(tr){ var cb = tr.querySelector('.fw-row-check'); return cb && cb.checked; });
			}
			if(trs.length===0) return;
			var rows = trs.map(function(tr){
				function text(col){ var td=tr.querySelector('[data-col="'+col+'"]'); return td ? (td.textContent||'').trim() : ''; }
				return ['priority','status','direction','name','source','destination','protocol','port','action','log','expires_at','remark'].map(function(c){ return text(c); });
			});
			var lines = [headers].concat(rows).map(function(arr){ return arr.map(fwEscapeCSV).join(','); });
			var csv = '\uFEFF' + lines.join('\r\n');
			var d = new Date();
			var yyyy = d.getFullYear();
			var mm = String(d.getMonth()+1).padStart(2,'0');
			var dd = String(d.getDate()).padStart(2,'0');
			var filename = 'firewalld_' + yyyy + mm + dd + '.csv';
			try{
				var blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
				var url = URL.createObjectURL(blob);
				var a = document.createElement('a');
				a.href = url;
				a.download = filename;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
			}catch(_){
				var a2 = document.createElement('a');
				a2.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
				a2.download = filename;
				document.body.appendChild(a2);
				a2.click();
				document.body.removeChild(a2);
			}
		}

		
		var selectAll = document.getElementById('fw-select-all');
		if(selectAll){
			selectAll.addEventListener('change', function(){
				var checks = table.querySelectorAll('.fw-row-check:not([disabled])');
				checks.forEach(function(c){
					var tr = c.closest('tr');
					var hidden = tr && (tr.hasAttribute('data-hidden') || tr.style.display==='none');
					if(!hidden){ c.checked = !!selectAll.checked; }
					if(tr){ tr.classList.toggle('selected', !!c.checked && !hidden); }
				});
			});
		}

		
		table.addEventListener('click', function(ev){
			var tr = ev.target.closest('tr');
			if(!tr || !tr.parentNode || tr.parentNode.tagName.toLowerCase()!=='tbody') return;
			var isControl = ev.target.closest('button, a, input, select, textarea, label');
			var onCheckbox = ev.target.closest('input[type="checkbox"].fw-row-check');
			if(isControl && !onCheckbox) return;
			if(onCheckbox) return;
			var cb = tr.querySelector('.fw-row-check');
			if(!cb) return;
			var hidden = tr.hasAttribute('data-hidden') || tr.style.display==='none';
			if(hidden) return;
			cb.checked = !cb.checked;
			tr.classList.toggle('selected', cb.checked);
			var sa = document.getElementById('fw-select-all');
			if(sa){
				var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .fw-row-check');
				if(visChecks.length){
					sa.checked = Array.prototype.every.call(visChecks, function(c){ return c.checked; });
				}else{
					sa.checked = false;
				}
			}
		});

		table.addEventListener('change', function(ev){
			var cb = ev.target.closest('.fw-row-check');
			if(!cb) return;
			var tr = cb.closest('tr');
			if(tr){
				var hidden = tr.hasAttribute('data-hidden') || tr.style.display==='none';
				tr.classList.toggle('selected', !!cb.checked && !hidden);
			}
			var sa = document.getElementById('fw-select-all');
			if(sa){
				var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .fw-row-check');
				if(visChecks.length){
					sa.checked = Array.prototype.every.call(visChecks, function(c){ return c.checked; });
				}else{
					sa.checked = false;
				}
			}
		});

		
		(function(){
			var btn = document.getElementById('fw-download-btn');
			var modalId = 'fw-download-modal';
			var closeBtn = document.getElementById('fw-download-close');
			var confirmBtn = document.getElementById('fw-download-confirm');
			var modalEl = document.getElementById(modalId);

			if(btn){
				btn.addEventListener('click', function(){
					if(btn.disabled) return;
					var saved = fwSavedVisibleRows();
					var total = saved.length;
					if(total <= 0) return;
					var selectedCount = saved.filter(function(tr){ var cb=tr.querySelector('.fw-row-check'); return cb && cb.checked; }).length;
					var subtitle = document.getElementById('fw-download-subtitle');
					if(subtitle){
						subtitle.textContent = selectedCount>0
							? ('선택된 ' + selectedCount + '개 또는 전체 ' + total + '개 결과 중 범위를 선택하세요.')
							: ('현재 결과 ' + total + '개 항목을 CSV로 내보냅니다.');
					}
					var rowSelectedWrap = document.getElementById('fw-csv-range-row-selected');
					var optSelected = document.getElementById('fw-csv-range-selected');
					var optAll = document.getElementById('fw-csv-range-all');
					if(rowSelectedWrap) rowSelectedWrap.hidden = !(selectedCount>0);
					if(optSelected){ optSelected.disabled = !(selectedCount>0); optSelected.checked = (selectedCount>0); }
					if(optAll){ optAll.checked = !(selectedCount>0); }
					if(modalEl) openModalLocal(modalId);
					else fwExportCSV(false);
				});
			}

			if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalLocal(modalId); }); }

			if(modalEl){
				modalEl.addEventListener('click', function(e){ if(e.target===modalEl) closeModalLocal(modalId); });
				document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(modalId); });
			}

			if(confirmBtn){
				confirmBtn.addEventListener('click', function(){
					var onlySel = !!(document.getElementById('fw-csv-range-selected') && document.getElementById('fw-csv-range-selected').checked);
					fwExportCSV(onlySel);
					closeModalLocal(modalId);
				});
			}
		})();

		
		var addBtn = document.getElementById('fw-row-add');
		if(addBtn){
			addBtn.addEventListener('click', function(){
				var tbody = table.querySelector('tbody');
				if(!tbody) return;
				var tr = document.createElement('tr');
				tr.classList.add('fw-row-editor');
				tr.innerHTML = `
					<td><input type="checkbox" class="fw-row-check" aria-label="행 선택"></td>
					<td data-col="priority"><input type="text" inputmode="numeric" placeholder="1~9999"></td>
					<td data-col="status">
						<select class="search-select" data-searchable-scope="page" data-allow-clear="false" data-placeholder="상태">
							<option value="" selected disabled>선택</option>
							<option value="ENABLED">ENABLED</option>
							<option value="DISABLED">DISABLED</option>
						</select>
					</td>
					<td data-col="direction">
						<select class="search-select" data-searchable-scope="page" data-allow-clear="false" data-placeholder="방향">
							<option value="" selected disabled>선택</option>
							<option value="IN">IN</option>
							<option value="OUT">OUT</option>
						</select>
					</td>
					<td data-col="name"><input type="text" placeholder="정책명 (필수)"></td>
					<td data-col="source"><input type="text" placeholder="ANY, 단일 IP, CIDR, IP 리스트"></td>
					<td data-col="destination"><input type="text" placeholder="IN: THIS_HOST / OUT: 입력"></td>
					<td data-col="protocol">
						<select class="search-select" data-searchable-scope="page" data-allow-clear="false" data-placeholder="프로토콜">
							<option value="" selected disabled>선택</option>
							<option value="TCP">TCP</option>
							<option value="UDP">UDP</option>
							<option value="ICMP">ICMP</option>
							<option value="ANY">ANY</option>
						</select>
					</td>
					<td data-col="port"><input type="text" inputmode="numeric" placeholder="1~65535"></td>
					<td data-col="action">
						<select class="search-select" data-searchable-scope="page" data-allow-clear="false" data-placeholder="동작">
							<option value="" selected disabled>선택</option>
							<option value="ALLOW">ALLOW</option>
							<option value="DENY">DENY</option>
							<option value="REJECT">REJECT</option>
							<option value="DROP">DROP</option>
						</select>
					</td>
					<td data-col="log">
						<select class="search-select" data-searchable-scope="page" data-allow-clear="false" data-placeholder="로그">
							<option value="" selected disabled>선택</option>
							<option value="ON">ON</option>
							<option value="OFF">OFF</option>
						</select>
					</td>
					<td data-col="expires_at"><input type="text" class="date-input fw-expires-date" placeholder="YYYY-MM-DD"></td>
					<td data-col="remark"><input type="text" placeholder="비고"></td>
					<td class="system-actions table-actions">
						<button class="action-btn js-fw-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button>
						<button class="action-btn danger js-fw-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>
					</td>`;
				tbody.appendChild(tr);
				updateEmptyState();
				wireFwRowBehaviors(tr);
				try{ initFwDatePickers(tr); }catch(_){ }
				try{
					if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function'){
						window.BlossomSearchableSelect.enhance(tr);
					}
				}catch(_){ }
				try{ fwGoLast(); }catch(_){ }
			});
		}

		
		table.addEventListener('click', function(ev){
			var target = ev.target.closest('.js-fw-del, .js-fw-toggle');
			if(!target) return;
			var tr = ev.target.closest('tr');
			if(!tr) return;

			if(target.classList.contains('js-fw-del')){
				var rowId = getRowId(tr);
				if(rowId){
					apiDelete(rowId).then(function(){
						if(tr && tr.parentNode){ tr.parentNode.removeChild(tr); }
						try{ fwClampPage(); }catch(_){ }
						updateEmptyState();
					}).catch(function(err){
						try{ if(typeof showNotice === 'function') showNotice('삭제 실패: ' + (err && err.message ? err.message : String(err))); }catch(_){ }
					});
				}else{
					if(tr && tr.parentNode){ tr.parentNode.removeChild(tr); }
					try{ fwClampPage(); }catch(_){ }
					updateEmptyState();
				}
				return;
			}

			var action = target.getAttribute('data-action') || '';

			
			if(action === 'edit'){
				function toInput(name){
					var td = tr.querySelector('[data-col="'+name+'"]');
					if(!td) return;
					var current = (td.textContent||'').trim();
					if(name==='priority'){
						var pv0=current; if(pv0==='-') pv0='';
						td.innerHTML = '<input type="text" inputmode="numeric" value="'+escHtml(pv0)+'" placeholder="1~9999">';
						return;
					}
					if(name==='status'){
						var sv=current; if(sv==='-') sv='';
						var sopts=[
							'<option value=""'+(sv?'':' selected')+' disabled>선택</option>',
							'<option value="ENABLED"'+(sv.toUpperCase()==='ENABLED'?' selected':'')+'>ENABLED</option>',
							'<option value="DISABLED"'+(sv.toUpperCase()==='DISABLED'?' selected':'')+'>DISABLED</option>'
						].join('');
						td.innerHTML = '<select class="search-select" data-searchable-scope="page" data-allow-clear="false" data-placeholder="상태">'+sopts+'</select>';
						return;
					}
					if(name==='direction'){
						var dv=current; if(dv==='-') dv='';
						var d2=[
							'<option value=""'+(dv?'':' selected')+' disabled>선택</option>',
							'<option value="IN"'+(dv.toUpperCase()==='IN'?' selected':'')+'>IN</option>',
							'<option value="OUT"'+(dv.toUpperCase()==='OUT'?' selected':'')+'>OUT</option>'
						].join('');
						td.innerHTML = '<select class="search-select" data-searchable-scope="page" data-allow-clear="false" data-placeholder="방향">'+d2+'</select>';
						return;
					}
					if(name==='protocol'){
						var pv=current; if(pv==='-') pv='';
						var p2=[
							'<option value=""'+(pv?'':' selected')+' disabled>선택</option>',
							'<option value="TCP"'+(pv.toUpperCase()==='TCP'?' selected':'')+'>TCP</option>',
							'<option value="UDP"'+(pv.toUpperCase()==='UDP'?' selected':'')+'>UDP</option>',
							'<option value="ICMP"'+(pv.toUpperCase()==='ICMP'?' selected':'')+'>ICMP</option>',
							'<option value="ANY"'+(pv.toUpperCase()==='ANY'?' selected':'')+'>ANY</option>'
						].join('');
						td.innerHTML = '<select class="search-select" data-searchable-scope="page" data-allow-clear="false" data-placeholder="프로토콜">'+p2+'</select>';
						return;
					}
					if(name==='action'){
						var av=current; if(av==='-') av='';
						var a2=[
							'<option value=""'+(av?'':' selected')+' disabled>선택</option>',
							'<option value="ALLOW"'+(av.toUpperCase()==='ALLOW'?' selected':'')+'>ALLOW</option>',
							'<option value="DENY"'+(av.toUpperCase()==='DENY'?' selected':'')+'>DENY</option>',
							'<option value="REJECT"'+(av.toUpperCase()==='REJECT'?' selected':'')+'>REJECT</option>',
							'<option value="DROP"'+(av.toUpperCase()==='DROP'?' selected':'')+'>DROP</option>'
						].join('');
						td.innerHTML = '<select class="search-select" data-searchable-scope="page" data-allow-clear="false" data-placeholder="동작">'+a2+'</select>';
						return;
					}
					if(name==='log'){
						var lv=current; if(lv==='-') lv='';
						var l2=[
							'<option value=""'+(lv?'':' selected')+' disabled>선택</option>',
							'<option value="ON"'+(lv.toUpperCase()==='ON'?' selected':'')+'>ON</option>',
							'<option value="OFF"'+(lv.toUpperCase()==='OFF'?' selected':'')+'>OFF</option>'
						].join('');
						td.innerHTML = '<select class="search-select" data-searchable-scope="page" data-allow-clear="false" data-placeholder="로그">'+l2+'</select>';
						return;
					}
					if(name==='port'){
						td.innerHTML = '<input type="text" inputmode="numeric" value="'+escHtml(current==='-'?'':current)+'" placeholder="1~65535">';
						return;
					}
					if(name==='expires_at'){
						var dv2=current; if(dv2==='-') dv2='';
						td.innerHTML = '<input type="text" class="date-input fw-expires-date" value="'+escHtml(dv2)+'" placeholder="YYYY-MM-DD">';
						return;
					}
					td.innerHTML = '<input type="text" value="'+escHtml(current)+'">';
				}

				['priority','status','direction','name','source','destination','protocol','port','action','log','expires_at','remark'].forEach(function(n){ toInput(n); });
				try{ tr.classList.add('fw-row-editor'); }catch(_){ }
				wireFwRowBehaviors(tr);
				try{ initFwDatePickers(tr); }catch(_){ }
				try{
					if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function'){
						window.BlossomSearchableSelect.enhance(tr);
					}
				}catch(_){ }
				target.setAttribute('data-action','save');
				target.title = '저장';
				target.setAttribute('aria-label','저장');
				target.innerHTML = '<img src="/static/image/svg/save.svg" alt="저장" class="action-icon">';
				return;
			}

			
			if(action === 'save'){
				function getInput(name){ var td = tr.querySelector('[data-col="'+name+'"]'); return td ? td.querySelector('input, select') : null; }
				function setError(input, on){
					if(!input) return;
					if(on){ input.classList.add('input-error'); input.setAttribute('aria-invalid','true'); }
					else { input.classList.remove('input-error'); input.removeAttribute('aria-invalid'); }
				}
				function read(name){ var inp = getInput(name); var v = inp ? inp.value : (tr.querySelector('[data-col="'+name+'"]') ? tr.querySelector('[data-col="'+name+'"]').textContent : ''); return String(v||'').trim(); }
				function commit(name, val){
					var td = tr.querySelector('[data-col="'+name+'"]');
					if(!td) return;
					td.textContent = (val === '' || val == null) ? '-' : String(val);
				}
				function applySavedRowData(saved){
					if(!saved) return;
					commit('priority', (saved.priority != null ? String(saved.priority) : '') || '9999');
					commit('status', saved.status || '');
					commit('direction', saved.direction || '');
					commit('name', saved.name || '');
					commit('source', saved.source || '');
					commit('destination', saved.destination || '');
					commit('protocol', saved.protocol || '');
					commit('port', saved.port || '');
					commit('action', saved.action || '');
					commit('log', saved.log || '');
					commit('expires_at', saved.expires_at || '');
					commit('remark', saved.remark || '');
				}

				var nameInp = getInput('name');
				var nameVal = (nameInp ? nameInp.value : '').trim();
				if(!nameVal){ setError(nameInp,true); try{ nameInp.focus(); }catch(_){} return; }
				setError(nameInp,false);

				var prInp = getInput('priority');
				var prVal = read('priority');
				if(prVal && !/^\d+$/.test(prVal)){ setError(prInp,true); try{ prInp.focus(); }catch(_){} return; }
				if(prVal){
					var pn = parseInt(prVal, 10);
					if(isNaN(pn) || pn < 1 || pn > 9999){ setError(prInp,true); try{ prInp.focus(); }catch(_){} return; }
				}
				setError(prInp,false);

				var statusInp = getInput('status');
				if(!read('status')){ setError(statusInp,true); try{ statusInp.focus(); }catch(_){} return; }
				setError(statusInp,false);

				var dirInp = getInput('direction');
				if(!read('direction')){ setError(dirInp,true); try{ dirInp.focus(); }catch(_){} return; }
				setError(dirInp,false);

				var protoInp = getInput('protocol');
				var protoVal = read('protocol').toUpperCase();
				if(!protoVal){ setError(protoInp,true); try{ protoInp.focus(); }catch(_){} return; }
				setError(protoInp,false);

				var portInp = getInput('port');
				var portVal = read('port');
				if(protoVal === 'TCP' || protoVal === 'UDP'){
					if(!portVal || !/^\d+$/.test(portVal)){ setError(portInp,true); try{ portInp.focus(); }catch(_){} return; }
					var portN = parseInt(portVal, 10);
					if(isNaN(portN) || portN < 1 || portN > 65535){ setError(portInp,true); try{ portInp.focus(); }catch(_){} return; }
					setError(portInp,false);
				}else{
					setError(portInp,false);
				}

				var actionInp = getInput('action');
				if(!read('action')){ setError(actionInp,true); try{ actionInp.focus(); }catch(_){} return; }
				setError(actionInp,false);

				var logInp = getInput('log');
				if(!read('log')){ setError(logInp,true); try{ logInp.focus(); }catch(_){} return; }
				setError(logInp,false);

				var expInp = getInput('expires_at');
				var expVal = read('expires_at');
				if(expVal && !/^\d{4}-\d{2}-\d{2}$/.test(expVal)){
					setError(expInp, true);
					try{ expInp.focus(); }catch(_){}
					return;
				}
				setError(expInp,false);

				function commit(name, val){ var td = tr.querySelector('[data-col="'+name+'"]'); if(!td) return; td.textContent = (val === '' || val == null) ? '-' : String(val); }

				commit('priority', read('priority') || '9999');
				commit('status', read('status'));
				commit('direction', read('direction'));
				commit('name', nameVal);
				commit('source', read('source'));
				commit('destination', read('destination'));
				commit('protocol', read('protocol'));
				(function(){ var pv = read('port'); var clean = String(pv||'').replace(/[^0-9]/g,''); commit('port', clean); })();
				commit('action', read('action'));
				commit('log', read('log'));
				commit('expires_at', read('expires_at'));
				commit('remark', read('remark'));

				try{ tr.classList.remove('fw-row-editor'); }catch(_){ }

				target.setAttribute('data-action','edit');
				target.title='편집';
				target.setAttribute('aria-label','편집');

				var assetId = getAssetId(storagePrefix);
				if(!assetId || !scopeKey){
					try{ if(typeof showNotice === 'function') showNotice('저장 실패: 자산 정보(asset_id)를 찾을 수 없습니다.'); }catch(_){ }
					return;
				}
				ensureUrlHasAssetId(assetId);
				ensureTabLinksCarryAssetId(assetId);

				var cleanPriority = read('priority');
				cleanPriority = String(cleanPriority||'').replace(/[^0-9]/g,'');
				if(!cleanPriority) cleanPriority = '9999';

				var cleanPort = String(read('port')||'').replace(/[^0-9]/g,'');
				if(!(protoVal === 'TCP' || protoVal === 'UDP')) cleanPort = '';

				var payload = {
					scope_key: scopeKey,
					asset_id: assetId,
					priority: cleanPriority,
					status: read('status'),
					direction: read('direction'),
					name: nameVal,
					source: read('source'),
					destination: read('destination'),
					protocol: protoVal,
					port: cleanPort,
					action: read('action'),
					log: read('log'),
					expires_at: read('expires_at'),
					remark: read('remark')
				};

				var id = getRowId(tr);
				target.disabled = true;
				(id ? apiUpdate(id, payload) : apiCreate(payload))
					.then(function(saved){
						try{ if(saved && saved.id != null) setRowId(tr, saved.id); }catch(_){ }
						try{ applySavedRowData(saved); }catch(_){ }
						try{ tr.classList.remove('fw-row-editor'); }catch(_){ }

						target.setAttribute('data-action','edit');
						target.title='편집';
						target.setAttribute('aria-label','편집');
						target.innerHTML = '<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon">';

						updateEmptyState();
						var cb = tr.querySelector('.fw-row-check');
						if(cb){ var hidden = tr.hasAttribute('data-hidden') || tr.style.display==='none'; tr.classList.toggle('selected', !!cb.checked && !hidden); }

						// Refresh ordering/normalization from server (optional but keeps sort stable)
						try{ loadFromApi(); }catch(_){ }
					})
					.catch(function(err){
						try{ if(typeof showNotice === 'function') showNotice('저장 실패: ' + (err && err.message ? err.message : String(err))); }catch(_){ }
					})
					.finally(function(){ target.disabled = false; });
		loadFromApi();
	}

	function autoInit(){
		try{ if(document.getElementById('fw-spec-table')) init({}); }catch(_){ }
	}

	window.BlossomTab08Firewalld = { init: init, autoInit: autoInit };

	if(document.readyState === 'loading'){
		document.addEventListener('DOMContentLoaded', autoInit);
	}else{
		autoInit();
	}
})();

*/

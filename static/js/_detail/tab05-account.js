/*
 * tab05-account.js
 * Account management tab behavior.
 */

(function () {
	'use strict';

	// If this file is included multiple times (or init is called twice),
	// duplicated event bindings can cause double POST/PUT and create duplicate rows.
	if (window.__TAB05_ACCOUNT_DETAIL_INIT__ === true) return;
	window.__TAB05_ACCOUNT_DETAIL_INIT__ = true;

	

	

	

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

	function amSanitizeAlnum(v) {
		return String(v || '').replace(/[^A-Za-z0-9]/g, '');
	}

	function amBindAlnumOnly(inputEl) {
		if (!inputEl || inputEl.__amAlnumBound) return;
		inputEl.__amAlnumBound = true;
		try { inputEl.setAttribute('inputmode', 'latin'); } catch (_) { }
		inputEl.addEventListener('input', function () {
			var before = String(inputEl.value || '');
			var after = amSanitizeAlnum(before);
			if (before !== after) inputEl.value = after;
		});
	}

	function applyAlnumOnlyInputs(scopeEl) {
		try {
			var root = scopeEl || document;
			var inputs = root.querySelectorAll('#am-spec-table td[data-col="account"] input, #am-spec-table td[data-col="group"] input');
			Array.prototype.forEach.call(inputs, function (inp) {
				amBindAlnumOnly(inp);
			});
		} catch (_) {
			// ignore
		}
	}

	function detectSchema(table) {
		try {
			var ths = Array.prototype.slice.call(table.querySelectorAll('thead th'));
			var labels = ths.map(function (th) { return safeText(th); }).join(' ');
			if (/\bUID\b/i.test(labels) || /\bGID\b/i.test(labels) || /로그인\s*권한/.test(labels) || /SU\s*권한/i.test(labels)) {
				return 'os';
			}
		} catch (_) {
			
		}
		return 'generic';
	}

	function normalizeAccountContext(raw) {
		if (!raw || typeof raw !== 'object') return null;
		var scope = raw.asset_scope || raw.scope || raw.assetScope || raw.asset_scope_name;
		var id = raw.asset_id || raw.assetId || raw.asset_id_value || raw.assetIdValue;
		if (id == null && raw.id != null) id = raw.id;
		scope = scope != null ? String(scope).trim() : '';
		id = coerceInt(id);
		if (!scope || id == null) return null;
		return { asset_scope: scope, asset_id: id };
	}

	function parseJSONSafe(raw) {
		if (!raw) return null;
		try {
			return JSON.parse(raw);
		} catch (_) {
			return null;
		}
	}

	function extractIdFromRow(row, scope) {
		if (!row || typeof row !== 'object') return null;
		var id = null;
		if (row.id !== undefined) id = coerceInt(row.id);
		if (id == null && row.asset_id !== undefined) id = coerceInt(row.asset_id);
		if (id == null && row.assetId !== undefined) id = coerceInt(row.assetId);
		if (id == null && scope && row[scope + '_id'] !== undefined) id = coerceInt(row[scope + '_id']);
		if (id != null) return id;

		// Last resort: if the row has exactly one *_id field, use it.
		try {
			var candidates = [];
			for (var k in row) {
				if (!Object.prototype.hasOwnProperty.call(row, k)) continue;
				if (!/_id$/i.test(k)) continue;
				var v = coerceInt(row[k]);
				if (v != null) candidates.push(v);
			}
			if (candidates.length === 1) return candidates[0];
		} catch (_) {
			// ignore
		}
		return null;
	}

	function rememberContext(ctx) {
		var norm = normalizeAccountContext(ctx);
		if (!norm) return;
		try {
			localStorage.setItem('tab05:lastContext', JSON.stringify(norm));
			localStorage.setItem('tab05:lastContext:' + norm.asset_scope, JSON.stringify(norm));
		} catch (_) {
			// ignore
		}
	}

	function readRememberedContext(preferredScopes) {
		try {
			if (preferredScopes && preferredScopes.length) {
				for (var i = 0; i < preferredScopes.length; i++) {
					var s = preferredScopes[i];
					var raw = localStorage.getItem('tab05:lastContext:' + s);
					var obj = parseJSONSafe(raw);
					var norm = normalizeAccountContext(obj);
					if (norm && norm.asset_scope === s) return norm;
				}
			}
			var raw2 = localStorage.getItem('tab05:lastContext');
			var obj2 = parseJSONSafe(raw2);
			var norm2 = normalizeAccountContext(obj2);
			if (!norm2) return null;
			if (preferredScopes && preferredScopes.length) {
				for (var j = 0; j < preferredScopes.length; j++) {
					if (preferredScopes[j] === norm2.asset_scope) return norm2;
				}
				return null;
			}
			return norm2;
		} catch (_) {
			return null;
		}
	}

	function inferPreferredScopesFromQuery() {
		try {
			var params = new URLSearchParams(window.location.search || '');
			var s = (params.get('asset_scope') || params.get('scope') || '').trim();
			return s ? [s] : [];
		} catch (_) {
			return [];
		}
	}

	function inferPreferredScopesFromPage() {
		var out = [];
		function push(s) {
			s = String(s || '').trim();
			if (!s) return;
			for (var i = 0; i < out.length; i++) if (out[i] === s) return;
			out.push(s);
		}
		try {
			var p = String((window.location && window.location.pathname) ? window.location.pathname : '').toLowerCase();
			if (p.indexOf('onpremise') > -1) push('onpremise');
			if (p.indexOf('workstation') > -1) push('workstation');
			if (p.indexOf('cloud') > -1) push('cloud');

			// Extract scope from page-key pattern: /p/hw_{category}_{type}_account
			// e.g. /p/hw_security_firewall_account -> 'firewall'
			//      /p/hw_network_l2_account -> 'l2'
			//      /p/sw_os_unix_account -> 'unix'
			var m = p.match(/\/p\/(?:hw|sw)_[a-z0-9]+_([a-z0-9]+)_/);
			if (m && m[1]) push(m[1]);
		} catch (_) {
			// ignore
		}
		try {
			var scripts = document.querySelectorAll('script[src]');
			for (var i2 = 0; i2 < scripts.length; i2++) {
				var src = String(scripts[i2].getAttribute('src') || '').toLowerCase();
				if (!src) continue;
				if (src.indexOf('onpremise') > -1) push('onpremise');
				if (src.indexOf('workstation') > -1) push('workstation');
				if (src.indexOf('cloud') > -1) push('cloud');
			}
		} catch (_) {
			// ignore
		}
		return out;
	}

	function inferContextFromQuery() {
		try {
			var params = new URLSearchParams(window.location.search || '');
			var id2 = coerceInt(params.get('asset_id') || params.get('assetId') || params.get('id'));
			if (id2 != null) {
				var scope2 = (params.get('asset_scope') || params.get('scope') || '').trim();
				if (!scope2) {
					// If no explicit scope, try to infer from any *_id query param.
					var iter = params.keys();
					var k;
					while (!(k = iter.next()).done) {
						var name = k.value;
						if (!name || !/_id$/i.test(name)) continue;
						var v = coerceInt(params.get(name));
						if (v == null) continue;
						scope2 = String(name).replace(/_id$/i, '');
						break;
					}
				}
				return { asset_scope: scope2 || 'unknown', asset_id: id2 };
			}

			// search for any *_id
			var iter2 = params.keys();
			var k2;
			while (!(k2 = iter2.next()).done) {
				var name2 = k2.value;
				if (!name2 || !/_id$/i.test(name2)) continue;
				var val2 = coerceInt(params.get(name2));
				if (val2 != null) {
					var scope3 = String(name2).replace(/_id$/i, '');
					return { asset_scope: scope3 || 'unknown', asset_id: val2 };
				}
			}
		} catch (_) {
			// ignore
		}
		return null;
	}

	function inferContextFromDom() {
		try {
			// Common patterns across templates: hidden inputs like onpremise_id, cloud_id, asset_id.
			var scope = '';
			var id = null;
			var scopeEl = document.querySelector('input[name="asset_scope"], input#asset_scope, [data-asset-scope]');
			if (scopeEl) {
				var s = '';
				try {
					s = (scopeEl.getAttribute('data-asset-scope') || scopeEl.value || scopeEl.textContent || '').trim();
				} catch (_) {
					s = '';
				}
				if (s) scope = s;
			}

			// Prefer explicit asset_id if present.
			var idEl = document.querySelector('input[name="asset_id"], input#asset_id, [data-asset-id]');
			if (idEl) {
				var raw = '';
				try { raw = (idEl.getAttribute('data-asset-id') || idEl.value || idEl.textContent || '').trim(); } catch (_) { raw = ''; }
				id = coerceInt(raw);
				if (id != null) {
					return { asset_scope: scope || 'unknown', asset_id: id };
				}
			}

			// Otherwise find the first *_id hidden input.
			var inputs = document.querySelectorAll('input[type="hidden"][name$="_id"], input[type="hidden"][id$="_id"], input[name$="_id"], input[id$="_id"]');
			for (var i = 0; i < inputs.length; i++) {
				var el = inputs[i];
				if (!el) continue;
				var name = (el.getAttribute('name') || el.getAttribute('id') || '').trim();
				if (!name || !/_id$/i.test(name)) continue;
				var v = coerceInt(el.value);
				if (v == null) continue;
				var s2 = name.replace(/_id$/i, '');
				return { asset_scope: scope || s2 || 'unknown', asset_id: v };
			}
		} catch (_) {
			// ignore
		}
		return null;
	}

	function inferContextFromStorage() {
		// Newer detail pages store selection under "<scope>:selected:row" and/or "<scope>:selected:asset_id".
		// Prefer these when present so refresh keeps the same asset context.
		try {
			var preferred = inferPreferredScopesFromQuery();
			if (!preferred || !preferred.length) preferred = inferPreferredScopesFromPage();
			if (preferred && preferred.length) {
				for (var pi = 0; pi < preferred.length; pi++) {
					var pScope = preferred[pi];
					if (!pScope) continue;
					var rawRowP = null;
					try { rawRowP = sessionStorage.getItem(pScope + ':selected:row'); } catch (_) { rawRowP = null; }
					if (!rawRowP) { try { rawRowP = localStorage.getItem(pScope + ':selected:row'); } catch (_) { rawRowP = null; } }
					if (rawRowP) {
						var rowObjP = parseJSONSafe(rawRowP);
						var idRowP = extractIdFromRow(rowObjP, pScope);
						if (idRowP != null) return { asset_scope: pScope, asset_id: idRowP };
					}
					var rawIdP = null;
					try { rawIdP = sessionStorage.getItem(pScope + ':selected:asset_id') || sessionStorage.getItem(pScope + ':selected:assetId'); } catch (_) { rawIdP = null; }
					if (!rawIdP) {
						try { rawIdP = localStorage.getItem(pScope + ':selected:asset_id') || localStorage.getItem(pScope + ':selected:assetId'); } catch (_) { rawIdP = null; }
					}
					var idP = coerceInt(rawIdP);
					if (idP != null) return { asset_scope: pScope, asset_id: idP };
				}
			}

			var scopes = [];
			for (var i0 = 0; i0 < sessionStorage.length; i0++) {
				var k00 = sessionStorage.key(i0);
				if (!k00) continue;
				var m00 = String(k00).match(/^([A-Za-z0-9_\-]+):selected:(row|asset_id|assetId)$/);
				if (m00 && m00[1]) scopes.push(m00[1]);
			}
			for (var j0 = 0; j0 < localStorage.length; j0++) {
				var k01 = localStorage.key(j0);
				if (!k01) continue;
				var m01 = String(k01).match(/^([A-Za-z0-9_\-]+):selected:(row|asset_id|assetId)$/);
				if (m01 && m01[1]) scopes.push(m01[1]);
			}
			// de-dup while preserving order
			var uniq = [];
			for (var u0 = 0; u0 < scopes.length; u0++) {
				var s0 = scopes[u0];
				if (!s0) continue;
				var exists = false;
				for (var u1 = 0; u1 < uniq.length; u1++) {
					if (uniq[u1] === s0) { exists = true; break; }
				}
				if (!exists) uniq.push(s0);
			}
			for (var u2 = 0; u2 < uniq.length; u2++) {
				var scope0 = uniq[u2];
				// 1) selected row object
				var rawRow = null;
				try { rawRow = sessionStorage.getItem(scope0 + ':selected:row'); } catch (_) { rawRow = null; }
				if (!rawRow) { try { rawRow = localStorage.getItem(scope0 + ':selected:row'); } catch (_) { rawRow = null; } }
				if (rawRow) {
					var rowObj = parseJSONSafe(rawRow);
					var idRow = extractIdFromRow(rowObj, scope0);
					if (idRow != null) return { asset_scope: scope0, asset_id: idRow };
				}
				// 2) selected asset id
				var rawId = null;
				try { rawId = sessionStorage.getItem(scope0 + ':selected:asset_id') || sessionStorage.getItem(scope0 + ':selected:assetId'); } catch (_) { rawId = null; }
				if (!rawId) {
					try { rawId = localStorage.getItem(scope0 + ':selected:asset_id') || localStorage.getItem(scope0 + ':selected:assetId'); } catch (_) { rawId = null; }
				}
				var idDirect = coerceInt(rawId);
				if (idDirect != null) return { asset_scope: scope0, asset_id: idDirect };
			}
		} catch (_) {
			// ignore
		}

		try {
			var preferredScopes = inferPreferredScopesFromQuery();
			if (preferredScopes && preferredScopes.length) {
				for (var ps = 0; ps < preferredScopes.length; ps++) {
					var s = preferredScopes[ps];
					var keys = [s + ':selectedRow', s + ':selected:row', s + '_selected_row'];
					for (var kk = 0; kk < keys.length; kk++) {
						var k0 = keys[kk];
						var raw0 = sessionStorage.getItem(k0);
						if (!raw0) continue;
						var row0 = parseJSONSafe(raw0);
						var id0 = extractIdFromRow(row0, s);
						if (id0 != null) return { asset_scope: s, asset_id: id0 };
					}
				}
			}
		} catch (_) {
			// ignore
		}

		try {
			for (var i = 0; i < sessionStorage.length; i++) {
				var k = sessionStorage.key(i);
				if (!k) continue;

				// Skip bulk-selection / unrelated keys.
				if (/dispose_selected_rows/i.test(k)) continue;

				var scope = null;
				var m = k.match(/^([A-Za-z0-9_\-]+):(selected:row|selectedRow)$/);
				if (m) scope = m[1];
				if (!scope) {
					var m2 = k.match(/^([A-Za-z0-9_\-]+)_selected_row$/);
					if (m2) scope = m2[1];
				}
				if (!scope) continue;

				var raw = sessionStorage.getItem(k);
				if (!raw) continue;
				var row = parseJSONSafe(raw);
				var id = extractIdFromRow(row, scope);
				if (id != null) return { asset_scope: scope, asset_id: id };
			}
		} catch (_) {
			// ignore
		}

		return null;
	}

	function inferAccountContext() {
		var explicit = null;
		try {
			explicit = normalizeAccountContext(window.__TAB05_ACCOUNT_CONTEXT__);
		} catch (_) {
			explicit = null;
		}
		if (explicit) {
			rememberContext(explicit);
			return explicit;
		}

		// If the URL explicitly contains an id/scope, trust it first.
		var fromQuery = inferContextFromQuery();
		if (fromQuery) {
			rememberContext(fromQuery);
			return fromQuery;
		}

		// If the page contains hidden inputs with the current asset id, use them.
		var fromDom = inferContextFromDom();
		if (fromDom) {
			rememberContext(fromDom);
			return fromDom;
		}

		// Try session/localStorage — the preferred-scope gate is removed so
		// non-server hardware (network, security, storage, SAN) can also find
		// their context via the broad key-scan inside inferContextFromStorage().
		var fromStorage = inferContextFromStorage();
		if (fromStorage) {
			rememberContext(fromStorage);
			return fromStorage;
		}

		// Last resort: the most recently used context saved in localStorage.
		var remembered = readRememberedContext(null);
		if (remembered) return remembered;
		return null;
	}

	function buildAssetAccountsCollectionUrl(ctx) {
		if (!ctx || !ctx.asset_scope || ctx.asset_id == null) return null;
		var sk = (ctx.system_key || inferSystemKeyFromPage() || '').trim();
		if (!sk) return null;
		return (
			'/api/asset-accounts' +
			'?asset_scope=' + encodeURIComponent(String(ctx.asset_scope)) +
			'&asset_id=' + encodeURIComponent(String(ctx.asset_id)) +
			'&system_key=' + encodeURIComponent(sk)
		);
	}

	function buildAssetAccountsItemUrl(ctx, accountId, systemKey) {
		if (!ctx || !ctx.asset_scope || ctx.asset_id == null) return null;
		if (accountId == null || accountId === '') return null;
		var sys = (systemKey == null || systemKey === '') ? inferSystemKeyFromPage() : String(systemKey);
		return (
			'/api/asset-accounts/' + encodeURIComponent(String(accountId)) +
			'?asset_scope=' + encodeURIComponent(String(ctx.asset_scope)) +
			'&asset_id=' + encodeURIComponent(String(ctx.asset_id)) +
			'&system_key=' + encodeURIComponent(String(sys))
		);
	}

	function inferSystemKeyFromPage() {
		// Prefer subtitle hostname/system label displayed in the UI.
		// Fallback to pathname to ensure a stable, non-empty key.
		var candidates = [
			'page-subtitle',
			'page-header-subtitle',
			'pageSubtitle',
			'pageHeaderSubtitle'
		];
		var s = '';
		for (var i = 0; i < candidates.length; i++) {
			var el = qs(candidates[i]);
			s = safeText(el);
			if (s && s !== '-') break;
		}
		if (!s || s === '-') {
			try {
				s = String((window.location && window.location.pathname) ? window.location.pathname : '').trim();
			} catch (_) {
				s = '';
			}
		}
		s = String(s || '').trim();
		if (!s) s = 'unknown';
		if (s.length > 255) s = s.slice(0, 255);
		return s;
	}

	// CSV

	

	

	

	function amEscapeCSV(val) {
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

	function amBoolFromOX(val) {
		return String(val || '').trim().toUpperCase() === 'O';
	}

	function amOXFromBool(flag) {
		return flag ? 'O' : 'X';
	}

	function amBadgeHTML(flag) {
		var on = !!flag;
		return '<span class="ox-badge ' + (on ? 'on' : 'off') + '" aria-label="' + (on ? '예' : '아니오') + '">' + (on ? 'O' : 'X') + '</span>';
	}

	function amStatusMeta(status) {
		var s = String(status || '').trim();
		if (!s || s === '-') return null;
		if (s === '활성') return { key: 'active', label: '활성' };
		if (s === '비활성') return { key: 'inactive', label: '비활성' };
		if (s === '고스트') return { key: 'ghost', label: '고스트' };
		if (s === '예외') return { key: 'exception', label: '예외' };
		return { key: 'unknown', label: s };
	}

	function amEscapeHTML(str) {
		return String(str == null ? '' : str)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function amStatusHTML(status) {
		var meta = amStatusMeta(status);
		if (!meta) return '-';
		var label = amEscapeHTML(meta.label);
		return '<span class="am-status am-status--' + amEscapeHTML(meta.key) + '">' +
			'<span class="am-status-dot" aria-hidden="true"></span>' +
			'<span class="am-status-text">' + label + '</span>' +
		'</span>';
	}

	function decorateStatusCells(scopeEl) {
		try {
			var root = scopeEl || document;
			var cells = root.querySelectorAll('#am-spec-table tbody td[data-col="status"]');
			Array.prototype.forEach.call(cells, function (td) {
				if (!td) return;
				if (td.querySelector('select, input, textarea')) return;
				if (td.querySelector('.am-status')) return;
				var raw = (td.textContent || '').trim();
				if (!raw || raw === '-') return;
				td.innerHTML = amStatusHTML(raw);
			});
		} catch (_) {
			// ignore
		}
	}

	function convertLegacyOXBadges(table) {
		try {
			var cells = table.querySelectorAll('td[data-col="login"], td[data-col="admin"]');
			Array.prototype.forEach.call(cells, function (td) {
				var img = td.querySelector('img.ox-img');
				if (img) {
					var alt = (img.getAttribute('alt') || '').trim().toUpperCase();
					td.innerHTML = amBadgeHTML(alt === 'O');
					return;
				}
				var badge = td.querySelector('.ox-badge');
				if (badge) return;
				var raw = (td.textContent || '').trim();
				var txt = raw.toUpperCase();
				if (txt === '0') txt = 'O';
				if (raw === '×') txt = 'X';
				if (txt === 'O' || txt === 'X') {
					td.innerHTML = amBadgeHTML(txt === 'O');
				}
			});
		} catch (_) {
			
		}
	}

	function injectTab05AccountStyles() {
		try {
			if (document.getElementById('tab05-account-style')) return;
			var style = document.createElement('style');
			style.id = 'tab05-account-style';
			style.type = 'text/css';
			style.textContent = [
				'#am-spec-table td[data-col="status"] .am-status {',
				'  display: inline-flex;',
				'  align-items: center;',
				'  gap: 8px;',
				'  font-weight: 600;',
				'  color: #111827;',
				'}',
				'#am-spec-table td[data-col="status"] .am-status-dot {',
				'  width: 8px;',
				'  height: 8px;',
				'  border-radius: 999px;',
				'  flex: 0 0 8px;',
				'}',
				'#am-spec-table td[data-col="status"] .am-status--active .am-status-dot { background: #6366F1; }',
				'#am-spec-table td[data-col="status"] .am-status--inactive .am-status-dot { background: #9ca3af; }',
				'#am-spec-table td[data-col="status"] .am-status--ghost .am-status-dot { background: #8b5cf6; }',
				'#am-spec-table td[data-col="status"] .am-status--exception .am-status-dot { background: #f59e0b; }',
				'#am-spec-table td[data-col="status"] .am-status--unknown .am-status-dot { background: #60a5fa; }',
				'#am-spec-table td[data-col] input.am-control,',
				'#am-spec-table td[data-col] select.am-control,',
				'#am-spec-table td[data-col] textarea.am-control {',
				'  width: 100%;',
				'  box-sizing: border-box;',
				'  min-width: 0;',
				'  height: 34px;',
				'  padding: 6px 10px;',
				'  border: 1px solid #e5e7eb;',
				'  background: #fff;',
				'  border-radius: 6px;',
				'  box-shadow: none;',
				'}',
				'#am-spec-table td[data-col] input.am-control:focus,',
				'#am-spec-table td[data-col] select.am-control:focus,',
				'#am-spec-table td[data-col] textarea.am-control:focus {',
				'  outline: none;',
				'  border-color: #6366f1;',
				'  box-shadow: 0 0 0 3px rgba(99,102,241,0.12);',
				'}',
				'#am-spec-table td[data-col] textarea.am-control {',
				'  height: auto;',
				'  min-height: 34px;',
				'  resize: vertical;',
				'}',
				'#am-spec-table td[data-col] select.am-control {',
				'  appearance: none !important;',
				'  -webkit-appearance: none !important;',
				'  -moz-appearance: none !important;',
				'  background-color: #fff;',
				'  background-image: url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%236b7280\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6 9 12 15 18 9\'/%3e%3c/svg%3e");',
				'  background-position: right 10px center;',
				'  background-size: 14px 14px;',
				'  background-repeat: no-repeat;',
				'  padding-right: 32px;',
				'}',
				'#am-spec-table td[data-col] select.am-control::-ms-expand { display: none; }',
				'#am-spec-table .fk-searchable-control {',
				'  display: block !important;',
				'  width: 100% !important;',
				'  min-width: 0 !important;',
				'  max-width: 100% !important;',
				'  box-sizing: border-box;',
				'}',
				'#am-spec-table .fk-searchable-control .fk-searchable-display {',
				'  display: block !important;',
				'  width: 100% !important;',
				'  max-width: 100% !important;',
				'  height: 34px;',
				'  padding: 6px 32px 6px 10px;',
				'  border: 1px solid #e5e7eb;',
				'  background-color: #fff;',
				'  background-image: url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%236b7280\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6 9 12 15 18 9\'/%3e%3c/svg%3e") !important;',
				'  background-repeat: no-repeat !important;',
				'  background-position: right 10px center !important;',
				'  background-size: 14px 14px !important;',
				'  border-radius: 6px;',
				'  box-sizing: border-box;',
				'  box-shadow: none;',
				'  min-height: auto;',
				'}',
				'#am-spec-table .fk-searchable-control .fk-searchable-display::after { content: none !important; display: none !important; }',
				'#am-spec-table .fk-searchable-control .fk-searchable-display:focus {',
				'  outline: none;',
				'  border-color: #6366f1;',
				'  box-shadow: 0 0 0 3px rgba(99,102,241,0.12);',
				'}',
				'#am-spec-table .fk-searchable-control .fk-searchable-clear {',
				'  height: 34px;',
				'  border-radius: 6px;',
				'}'
			].join('\n');
			document.head.appendChild(style);
		} catch (_) {
			// ignore
		}
	}

	function applyControlClasses(scopeEl) {
		try {
			var root = scopeEl || document;
			var controls = root.querySelectorAll('#am-spec-table td[data-col] input, #am-spec-table td[data-col] select, #am-spec-table td[data-col] textarea');
			Array.prototype.forEach.call(controls, function (el) {
				if (!el.classList.contains('am-control')) el.classList.add('am-control');
				if (el.tagName && el.tagName.toLowerCase() === 'select') {
					if (!el.classList.contains('form-select')) el.classList.add('form-select');
				} else {
					if (!el.classList.contains('form-input')) el.classList.add('form-input');
				}
			});
		} catch (_) {
			// ignore
		}
	}

	function ensureStandardAccountTable(table) {
		if (!table) return;
		var thead = table.querySelector('thead');
		if (!thead) {
			thead = document.createElement('thead');
			table.insertBefore(thead, table.firstChild);
		}
		// Normalize headers regardless of what the template has.
		thead.innerHTML =
			'<tr>' +
			'  <th><input type="checkbox" id="am-select-all" aria-label="전체 선택"></th>' +
			'  <th>상태<span class="req-star" aria-hidden="true">*</span></th>' +
			'  <th>계정 구분<span class="req-star" aria-hidden="true">*</span></th>' +
			'  <th>계정명<span class="req-star" aria-hidden="true">*</span></th>' +
			'  <th>그룹명</th>' +
			'  <th>사용자<span class="req-star" aria-hidden="true">*</span></th>' +
			'  <th>로그인 권한<span class="req-star" aria-hidden="true">*</span></th>' +
			'  <th>관리자 권한<span class="req-star" aria-hidden="true">*</span></th>' +
			'  <th>목적</th>' +
			'  <th>관리</th>' +
			'</tr>';

		var colgroup = table.querySelector('colgroup');
		if (!colgroup) {
			colgroup = document.createElement('colgroup');
			table.insertBefore(colgroup, thead);
		}
		colgroup.innerHTML =
			'<col style="width:60px"><!-- checkbox -->' +
			'<col style="width:calc((100% - 180px) / 8)"><!-- 상태 -->' +
			'<col style="width:calc((100% - 180px) / 8)"><!-- 계정 구분 -->' +
			'<col style="width:calc((100% - 180px) / 8)"><!-- 계정명 -->' +
			'<col style="width:calc((100% - 180px) / 8)"><!-- 그룹명 -->' +
			'<col style="width:calc((100% - 180px) / 8)"><!-- 사용자 -->' +
			'<col style="width:calc((100% - 180px) / 8)"><!-- 로그인 권한 -->' +
			'<col style="width:calc((100% - 180px) / 8)"><!-- 관리자 권한 -->' +
			'<col style="width:calc((100% - 180px) / 8)"><!-- 목적 -->' +
			'<col class="actions-col" style="width:120px"><!-- 관리 -->';

		var tbody = table.querySelector('tbody');
		if (!tbody) {
			tbody = document.createElement('tbody');
			table.appendChild(tbody);
		}
	}

	function enhanceSearchSelects(scopeEl) {
		try {
			if (window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function') {
				window.BlossomSearchableSelect.enhance(scopeEl || document);
			}
		} catch (_) {
			// ignore
		}
	}

	function syncSearchSelects(scopeEl) {
		try {
			if (window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function') {
				window.BlossomSearchableSelect.syncAll(scopeEl || document);
			}
		} catch (_) {
			// ignore
		}
	}

	function ensureOrgUserSearchSource() {
		try {
			window.BlossomSearchableSelectSources = window.BlossomSearchableSelectSources || {};
			if (typeof window.BlossomSearchableSelectSources.org_user_name === 'function') return;
			window.BlossomSearchableSelectSources.org_user_name = function (ctx) {
				var q = (ctx && ctx.query) ? String(ctx.query).trim() : '';
				try {
					var url = '/api/chat/directory?limit=50' + (q ? ('&q=' + encodeURIComponent(q)) : '');
					return fetch(url, {
						method: 'GET',
						credentials: 'same-origin'
					})
						.then(function (r) { return r.json(); })
						.then(function (items) {
							if (!Array.isArray(items)) return [];
							var out = [];
							for (var i = 0; i < items.length; i++) {
								var u = items[i] || {};
								var name = (u.name || u.nickname || '');
								if (!name) continue;
								var dept = u.department || '';
								var label = dept ? (name + ' (' + dept + ')') : name;
								out.push({ value: String(label), label: String(label), displayLabel: String(name) });
							}
							return out;
						})
						.catch(function () { return []; });
				} catch (_) {
					return Promise.resolve([]);
				}
			};
		} catch (_) {
			// ignore
		}
	}

	// ── Delete-confirmation modal (tab04 interface style) ──
	var _amPendingDeleteTr = null;
	var _amDeleteCallback = null;

	function amOpenDeleteModal(tr, onConfirm){
		_amPendingDeleteTr = tr;
		_amDeleteCallback = onConfirm || null;
		var msgEl = document.getElementById('am-delete-msg');
		if(msgEl) msgEl.textContent = '이 계정을 삭제하시겠습니까?';
		var modal = document.getElementById('am-delete-modal');
		if(modal){ document.body.classList.add('modal-open'); modal.classList.add('show'); modal.setAttribute('aria-hidden','false'); }
	}

	function amCloseDeleteModal(){
		_amPendingDeleteTr = null;
		_amDeleteCallback = null;
		var modal = document.getElementById('am-delete-modal');
		if(modal){ modal.classList.remove('show'); modal.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } }
	}

	function amPerformDelete(){
		var tr = _amPendingDeleteTr;
		var cb = _amDeleteCallback;
		amCloseDeleteModal();
		if(cb){ cb(tr); }
	}

	var _amDeleteModalWired = false;
	function wireAmDeleteModal(){
		if(_amDeleteModalWired) return;
		var modal = document.getElementById('am-delete-modal');
		if(!modal) return;
		_amDeleteModalWired = true;
		var confirmBtn = document.getElementById('am-delete-confirm');
		var cancelBtn  = document.getElementById('am-delete-cancel');
		var closeBtn   = document.getElementById('am-delete-close');
		if(confirmBtn) confirmBtn.addEventListener('click', amPerformDelete);
		if(cancelBtn)  cancelBtn.addEventListener('click', amCloseDeleteModal);
		if(closeBtn)   closeBtn.addEventListener('click', amCloseDeleteModal);
		modal.addEventListener('click', function(e){ if(e.target === modal) amCloseDeleteModal(); });
		document.addEventListener('keydown', function(e){
			try{ if(e.key === 'Escape' && modal.classList.contains('show')) amCloseDeleteModal(); }catch(_){ }
		});
	}

	// Init

	function initTab05Account() {
		// Per-table guard (some templates can call init again).
		var tableGuard = qs('am-spec-table');
		if (tableGuard && tableGuard.__amBound) return;
		if (tableGuard) tableGuard.__amBound = true;

		var table = qs('am-spec-table');
		if (!table) return;
		injectTab05AccountStyles();
		wireAmDeleteModal();

		ensureStandardAccountTable(table);
		ensureOrgUserSearchSource();
		enhanceSearchSelects(table);
		syncSearchSelects(table);
		applyControlClasses(table);
		applyAlnumOnlyInputs(table);

		
		window.__TAB05_ACCOUNT_API_HANDLED__ = true;

		var schema = 'standard';
		var empty = qs('am-empty');

		var ctx = inferAccountContext();
		var collectionUrl = buildAssetAccountsCollectionUrl(ctx);

		
		function amRowSaved(tr) {
			var t = tr.querySelector('.js-am-toggle');
			var inEdit = t && t.getAttribute('data-action') === 'save';
			if (inEdit) return false;
			return !tr.querySelector('td[data-col] input, td[data-col] select, td[data-col] textarea');
		}

		function amVisibleRows() {
			var tbody = table.querySelector('tbody');
			if (!tbody) return [];
			return Array.prototype.filter.call(tbody.querySelectorAll('tr'), function (tr) {
				return !(tr.hasAttribute('data-hidden') || tr.style.display === 'none');
			});
		}

		function amSavedVisibleRows() {
			return amVisibleRows().filter(amRowSaved);
		}

		function readCellText(td) {
			if (!td) return '';
			try {
				var badge = td.querySelector('.ox-badge');
				if (badge) return (badge.textContent || '').trim();
			} catch (_) {
				
			}
			return safeText(td);
		}

		function amExportCSV(onlySelected) {
			var tbody = table.querySelector('tbody');
			if (!tbody) return;

			var headers = ['상태', '계정 구분', '계정명', '그룹명', '사용자', '로그인 권한', '관리자 권한', '목적'];
			var cols = ['status', 'type', 'account', 'group', 'user', 'login', 'admin', 'purpose'];

			var trs = amSavedVisibleRows();
			if (onlySelected) {
				trs = trs.filter(function (tr) {
					var cb = tr.querySelector('.am-row-check');
					return cb && cb.checked;
				});
			}
			if (!trs.length) return;

			var rows = trs.map(function (tr) {
				return cols.map(function (col) {
					return readCellText(tr.querySelector('[data-col="' + col + '"]'));
				});
			});
			var lines = [headers].concat(rows).map(function (arr) {
				return arr.map(amEscapeCSV).join(',');
			});
			var csv = '\uFEFF' + lines.join('\r\n');
			var d = new Date();
			var yyyy = d.getFullYear();
			var mm = String(d.getMonth() + 1).padStart(2, '0');
			var dd = String(d.getDate()).padStart(2, '0');
			var filename = 'account_' + yyyy + mm + dd + '.csv';

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

	// Pagination

	

		
		var amState = { page: 1, 
	

	
pageSize: 10 };
		(function initPageSize() {
			try {
				var saved = localStorage.getItem('tab05:am:pageSize');
				var sel = qs('am-page-size');
				if (sel) {
					if (saved && ['10', '20', '50', '100'].indexOf(saved) > -1) {
						amState.pageSize = parseInt(saved, 10);
						sel.value = saved;
					}
					sel.addEventListener('change', function () {
						var v = parseInt(sel.value, 10);
						if (!isNaN(v)) {
							amState.page = 1;
							amState.pageSize = v;
							localStorage.setItem('tab05:am:pageSize', String(v));
							amRenderPage();
						}
					});
				}
			} catch (_) {
				
			}
		})();

		var infoEl = qs('am-pagination-info');
		var numWrap = qs('am-page-numbers');
		var btnFirst = qs('am-first');
		var btnPrev = qs('am-prev');
		var btnNext = qs('am-next');
		var btnLast = qs('am-last');

		function amRows() {
			var tbody = table.querySelector('tbody');
			return tbody ? Array.prototype.slice.call(tbody.querySelectorAll('tr')) : [];
		}
		function amTotal() {
			return amRows().length;
		}
		function amPages() {
			var total = amTotal();
			return Math.max(1, Math.ceil(total / amState.pageSize));
		}
		function amClampPage() {
			var pages = amPages();
			if (amState.page > pages) amState.page = pages;
			if (amState.page < 1) amState.page = 1;
		}

		function amUpdatePaginationUI() {
			var total = amTotal();
			if (infoEl) {
				var start = total ? (amState.page - 1) * amState.pageSize + 1 : 0;
				var end = Math.min(total, amState.page * amState.pageSize);
				infoEl.textContent = start + '-' + end + ' / ' + total + '개 항목';
			}
			if (numWrap) {
				var pages = amPages();
				numWrap.innerHTML = '';
				for (var p = 1; p <= pages && p <= 50; p++) {
					var b = document.createElement('button');
					b.className = 'page-btn' + (p === amState.page ? ' active' : '');
					b.textContent = String(p);
					b.dataset.page = String(p);
					numWrap.appendChild(b);
				}
			}
			var pages2 = amPages();
			if (btnFirst) btnFirst.disabled = (amState.page === 1);
			if (btnPrev) btnPrev.disabled = (amState.page === 1);
			if (btnNext) btnNext.disabled = (amState.page === pages2);
			if (btnLast) btnLast.disabled = (amState.page === pages2);

			var sizeSel = qs('am-page-size');
			if (sizeSel) {
				var none = (amTotal() === 0);
				sizeSel.disabled = none;
				if (none) {
					try {
						sizeSel.value = '10';
						amState.pageSize = 10;
					} catch (_) {
						
					}
				}
			}
		}

		function amRenderPage() {
			amClampPage();
			var rows = amRows();
			var startIdx = (amState.page - 1) * amState.pageSize;
			var endIdx = startIdx + amState.pageSize - 1;
			rows.forEach(function (tr, idx) {
				var visible = idx >= startIdx && idx <= endIdx;
				tr.style.display = visible ? '' : 'none';
				if (visible) tr.removeAttribute('data-hidden');
				else tr.setAttribute('data-hidden', '1');

				var cb = tr.querySelector('.am-row-check');
				if (cb) tr.classList.toggle('selected', !!cb.checked && visible);
			});
			amUpdatePaginationUI();

			var sa = qs('am-select-all');
			if (sa) {
				var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .am-row-check');
				if (visChecks.length) {
					sa.checked = Array.prototype.every.call(visChecks, function (c) { return c.checked; });
				} else {
					sa.checked = false;
				}
			}
		}

		function amGo(p) {
			amState.page = p;
			amRenderPage();
		}
		function amGoDelta(d) {
			amGo(amState.page + d);
		}
		function amGoFirst() {
			amGo(1);
		}
		function amGoLast() {
			amGo(amPages());
		}

		if (numWrap) {
			numWrap.addEventListener('click', function (e) {
				var b = e.target.closest('button.page-btn');
				if (!b) return;
				var p = parseInt(b.dataset.page, 10);
				if (!isNaN(p)) amGo(p);
			});
		}
		if (btnFirst) btnFirst.addEventListener('click', amGoFirst);
		if (btnPrev) btnPrev.addEventListener('click', function () { amGoDelta(-1); });
		if (btnNext) btnNext.addEventListener('click', function () { amGoDelta(1); });
		if (btnLast) btnLast.addEventListener('click', amGoLast);

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
			var csvBtn = qs('am-download-btn');
			if (csvBtn) {
				var has = !!table.querySelector('tbody tr');
				csvBtn.disabled = !has;
				csvBtn.setAttribute('aria-disabled', (!has).toString());
				csvBtn.title = has ? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.';
			}
			amRenderPage();
		}

		updateEmptyState();

		convertLegacyOXBadges(table);
		decorateStatusCells(table);

		
		var selectAll = qs('am-select-all');
		if (selectAll) {
			selectAll.addEventListener('change', function () {
				var checks = table.querySelectorAll('.am-row-check:not([disabled])');
				Array.prototype.forEach.call(checks, function (c) {
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
			var onCheckbox = ev.target.closest('input[type="checkbox"].am-row-check');
			if (isControl && !onCheckbox) return;
			if (onCheckbox) return;
			var cb = tr.querySelector('.am-row-check');
			if (!cb) return;
			var hidden = tr.hasAttribute('data-hidden') || tr.style.display === 'none';
			if (hidden) return;
			cb.checked = !cb.checked;
			tr.classList.toggle('selected', cb.checked);
			var sa = qs('am-select-all');
			if (sa) {
				var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .am-row-check');
				if (visChecks.length) {
					sa.checked = Array.prototype.every.call(visChecks, function (c) { return c.checked; });
				} else {
					sa.checked = false;
				}
			}
		});

		table.addEventListener('change', function (ev) {
			var cb = ev.target.closest('.am-row-check');
			if (!cb) return;
			var tr = cb.closest('tr');
			if (tr) {
				var hidden = tr.hasAttribute('data-hidden') || tr.style.display === 'none';
				tr.classList.toggle('selected', !!cb.checked && !hidden);
			}
			var sa = qs('am-select-all');
			if (sa) {
				var visChecks2 = table.querySelectorAll('tbody tr:not([data-hidden]) .am-row-check');
				if (visChecks2.length) {
					sa.checked = Array.prototype.every.call(visChecks2, function (c) { return c.checked; });
				} else {
					sa.checked = false;
				}
			}
		});

		
		(function wireCsvModal() {
			var btn = qs('am-download-btn');
			var modalId = 'am-download-modal';
			var closeBtn = qs('am-download-close');
			var confirmBtn = qs('am-download-confirm');
			var modalEl = qs(modalId);

			if (btn) {
				btn.addEventListener('click', function () {
					if (btn.disabled) return;
					var saved = amSavedVisibleRows();
					var total = saved.length;
					if (total <= 0) return;
					var selectedCount = saved.filter(function (tr) {
						var cb = tr.querySelector('.am-row-check');
						return cb && cb.checked;
					}).length;

					var subtitle = qs('am-download-subtitle');
					if (subtitle) {
						subtitle.textContent = selectedCount > 0
							? ('선택된 ' + selectedCount + '개 또는 전체 ' + total + '개 결과 중 범위를 선택하세요.')
							: ('현재 결과 ' + total + '개 항목을 CSV로 내보냅니다.');
					}

					var rowSelectedWrap = qs('am-csv-range-row-selected');
					var optSelected = qs('am-csv-range-selected');
					var optAll = qs('am-csv-range-all');
					if (rowSelectedWrap) rowSelectedWrap.hidden = !(selectedCount > 0);
					if (optSelected) {
						optSelected.disabled = !(selectedCount > 0);
						optSelected.checked = (selectedCount > 0);
					}
					if (optAll) {
						optAll.checked = !(selectedCount > 0);
					}

					openModalLocal(modalId);
				});
			}

			if (closeBtn) {
				closeBtn.addEventListener('click', function () { closeModalLocal(modalId); });
			}
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
					var opt = qs('am-csv-range-selected');
					var onlySel = !!(opt && opt.checked);
					amExportCSV(onlySel);
					closeModalLocal(modalId);
				});
			}
		})();

		
		var addBtn = qs('am-row-add');
		if (addBtn && !addBtn.__amRowAddBound) {
			addBtn.__amRowAddBound = true;
			addBtn.addEventListener('click', function (ev) {
				// Guard against duplicate handlers from global/tab scripts.
				try {
					if (ev && ev.__amRowAddHandled) return;
					if (ev) ev.__amRowAddHandled = true;
				} catch (_) { }
				try { if (ev) { ev.preventDefault(); ev.stopImmediatePropagation(); } } catch (_) { }
				var tbody = table.querySelector('tbody');
				if (!tbody) return;
				var tr = document.createElement('tr');

						tr.innerHTML =
							'<td><input type="checkbox" class="am-row-check" aria-label="행 선택"></td>' +
							'<td data-col="status"><select class="search-select am-control" data-searchable-scope="page" data-placeholder="상태"><option value="">선택</option><option value="활성">활성</option><option value="비활성">비활성</option><option value="고스트">고스트</option><option value="예외">예외</option></select></td>' +
							'<td data-col="type"><select class="search-select am-control" data-searchable-scope="page" data-placeholder="계정 구분"><option value="">선택</option><option value="관리자">관리자</option><option value="사용자">사용자</option></select></td>' +
							'<td data-col="account"><input type="text" class="form-input am-control" placeholder="계정명"></td>' +
							'<td data-col="group"><input type="text" class="form-input am-control" placeholder="그룹명"></td>' +
							'<td data-col="user"><select class="search-select am-control" data-searchable-scope="page" data-search-source="org_user_name" data-placeholder="사용자" data-allow-clear="true"><option value="">사용자</option></select></td>' +
							'<td data-col="login"><select class="search-select am-control" data-searchable-scope="page" data-placeholder="로그인 권한"><option value="">선택</option><option value="O">O</option><option value="X">X</option></select></td>' +
							'<td data-col="admin"><select class="search-select am-control" data-searchable-scope="page" data-placeholder="관리자 권한"><option value="">선택</option><option value="O">O</option><option value="X">X</option></select></td>' +
							'<td data-col="purpose"><input type="text" class="form-input am-control" placeholder="목적"></td>' +
							'<td class="system-actions table-actions">' +
							'  <button class="action-btn js-am-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button>' +
							'  <button class="action-btn danger js-am-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>' +
							'</td>';

				tbody.appendChild(tr);
				try { enhanceSearchSelects(tr); } catch (_) { }
					try { syncSearchSelects(tr); } catch (_) { }
				try { applyControlClasses(tr); } catch (_) { }
				try { applyAlnumOnlyInputs(tr); } catch (_) { }
				try { amGoLast(); } catch (_) { }
				updateEmptyState();
			});
		}

		function amFetchJSON(url, opts) {
			opts = opts || {};
			opts.credentials = opts.credentials || 'same-origin';
			return fetch(url, opts).then(function (r) {
				return r.json();
			});
		}

		function renderRowFromItem(item) {
			var tr = document.createElement('tr');
			tr.setAttribute('data-account-id', String(item.id));
			try {
				if (item.system_key) tr.setAttribute('data-system-key', String(item.system_key));
			} catch (_) { }
			var t = (item.account_type || item.accountType || item.type || item.role || '');
			var adminAllowed = (item.admin_allowed !== undefined) ? !!item.admin_allowed : !!item.su_allowed;
			tr.innerHTML =
				'<td><input type="checkbox" class="am-row-check" aria-label="행 선택"></td>' +
				'<td data-col="status">' + amStatusHTML(item.status) + '</td>' +
				'<td data-col="type">' + (t ? String(t) : '-') + '</td>' +
				'<td data-col="account">' + (item.account_name ? String(item.account_name) : '-') + '</td>' +
				'<td data-col="group">' + (item.group_name ? String(item.group_name) : '-') + '</td>' +
				'<td data-col="user">' + (item.user_name ? String(item.user_name) : '-') + '</td>' +
				'<td data-col="login">' + amBadgeHTML(!!item.login_allowed) + '</td>' +
				'<td data-col="admin">' + amBadgeHTML(adminAllowed) + '</td>' +
				'<td data-col="purpose">' + (item.purpose ? String(item.purpose) : '-') + '</td>' +
				'<td class="system-actions table-actions">' +
				'  <button class="action-btn js-am-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button> ' +
				'  <button class="action-btn danger js-am-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>' +
				'</td>';
			return tr;
		}

	// API

	

	

	

		function loadFromApi() {
			if (!collectionUrl) return;
			var tbody = table.querySelector('tbody');
			if (!tbody) return;

			amFetchJSON(collectionUrl)
				.then(function (resp) {
					if (!resp || resp.success !== true || !Array.isArray(resp.items)) return;
					tbody.innerHTML = '';
					resp.items.forEach(function (it) {
						tbody.appendChild(renderRowFromItem(it));
					});
					decorateStatusCells(table);
					updateEmptyState();
				})
				.catch(function () {
					
				});
		}

		
		loadFromApi();

		
		table.addEventListener('click', function (ev) {
			var target = ev.target.closest('.js-am-del, .js-am-edit, .js-am-commit, .js-am-toggle');
			if (!target) return;
			var tr = ev.target.closest('tr');
			if (!tr) return;

			function getInput(name) {
				var td = tr.querySelector('[data-col="' + name + '"]');
				return td ? td.querySelector('input, select') : null;
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
			}

			function read(name) {
				var inp = getInput(name);
				var v = inp ? inp.value : safeText(tr.querySelector('[data-col="' + name + '"]'));
				return String(v || '').trim();
			}

			function readSelectDisplayFallback(name, placeholderText) {
				var v = read(name);
				if (v) return v;
				try {
					var td = tr.querySelector('[data-col="' + name + '"]');
					var btn = td ? td.querySelector('.fk-searchable-display') : null;
					var t = btn ? String(btn.textContent || '').trim() : '';
					if (!t) return '';
					if (placeholderText && t === placeholderText) return '';
					if (t === '선택') return '';
					return t;
				} catch (_) {
					return '';
				}
			}

			function commitText(name, val) {
				var td = tr.querySelector('[data-col="' + name + '"]');
				if (!td) return;
				if (name === 'status') {
					td.innerHTML = (val === '' || val == null) ? '-' : amStatusHTML(String(val));
					return;
				}
				td.textContent = (val === '' || val == null) ? '-' : String(val);
			}

			
			if (target.classList.contains('js-am-del')) {
				amOpenDeleteModal(tr, function(delTr){
					if (!delTr) return;
					// In-flight guard to prevent double-delete.
					if (delTr.__amDeleting) return;
					delTr.__amDeleting = true;

					var rowId = (delTr.getAttribute('data-account-id') || '').trim();
					var rowSystemKey = (delTr.getAttribute('data-system-key') || '').trim();
					var deleteUrl = buildAssetAccountsItemUrl(ctx, rowId, rowSystemKey);
					if (deleteUrl) {
						amFetchJSON(deleteUrl, { method: 'DELETE' })
							.then(function (resp) {
								delTr.__amDeleting = false;
								if (!resp || resp.success !== true) {
									alert((resp && resp.message) ? resp.message : '계정을 삭제하지 못했습니다.');
									return;
								}
								if (delTr.parentNode) delTr.parentNode.removeChild(delTr);
								try { amClampPage(); } catch (_) { }
								updateEmptyState();
							})
							.catch(function () {
								delTr.__amDeleting = false;
								alert('계정을 삭제하지 못했습니다.');
							});
						return;
					}

					if (delTr.parentNode) delTr.parentNode.removeChild(delTr);
					delTr.__amDeleting = false;
					try { amClampPage(); } catch (_) { }
					updateEmptyState();
				});
				return;
			}

			
			if (target.classList.contains('js-am-edit') || (target.classList.contains('js-am-toggle') && target.getAttribute('data-action') === 'edit')) {
				function toInput(name) {
					var td = tr.querySelector('[data-col="' + name + '"]');
					if (!td) return;

					var current = '';
					try {
						var badge = td.querySelector('.ox-badge');
						if (badge) current = (badge.textContent || '').trim();
						else current = safeText(td);
					} catch (_) {
						current = safeText(td);
					}
					if (current === '-') current = '';

					if (name === 'status') {
						var sv = current;
						var sopts = [
							'<option value=""' + (sv ? '' : ' selected') + '>선택</option>',
							'<option value="활성"' + (sv === '활성' ? ' selected' : '') + '>활성</option>',
							'<option value="비활성"' + (sv === '비활성' ? ' selected' : '') + '>비활성</option>',
							'<option value="고스트"' + (sv === '고스트' ? ' selected' : '') + '>고스트</option>',
							'<option value="예외"' + (sv === '예외' ? ' selected' : '') + '>예외</option>'
						].join('');
						td.innerHTML = '<select class="search-select am-control" data-searchable-scope="page" data-placeholder="상태">' + sopts + '</select>';
						return;
					}

					if (name === 'type') {
						var rv = current;
						var ropts = [
							'<option value=""' + (rv ? '' : ' selected') + '>선택</option>',
							'<option value="관리자"' + (rv === '관리자' ? ' selected' : '') + '>관리자</option>',
							'<option value="사용자"' + (rv === '사용자' ? ' selected' : '') + '>사용자</option>'
						].join('');
						td.innerHTML = '<select class="search-select am-control" data-searchable-scope="page" data-placeholder="계정 구분">' + ropts + '</select>';
						return;
					}

					if (name === 'login' || name === 'admin') {
						var val = current;
						var o = [
							'<option value=""' + (val ? '' : ' selected') + '>선택</option>',
							'<option value="O"' + (val === 'O' ? ' selected' : '') + '>O</option>',
							'<option value="X"' + (val === 'X' ? ' selected' : '') + '>X</option>'
						].join('');
						var ph = (name === 'login') ? '로그인 권한' : '관리자 권한';
						td.innerHTML = '<select class="search-select am-control" data-searchable-scope="page" data-placeholder="' + ph + '">' + o + '</select>';
						return;
					}

					if (name === 'user') {
						var u = current || '';
						var uValue = u.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
						var uLabel = u.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
						var uOpt = '<option value="">사용자</option>' + (u ? ('<option value="' + uValue + '" selected>' + uLabel + '</option>') : '');
						td.innerHTML = '<select class="search-select am-control" data-searchable-scope="page" data-search-source="org_user_name" data-placeholder="사용자" data-allow-clear="true">' + uOpt + '</select>';
						return;
					}

					var ph = '';
					if (name === 'account') ph = '계정명';
					else if (name === 'group') ph = '그룹명';
					else if (name === 'purpose') ph = '목적';
					td.innerHTML = '<input type="text" class="form-input am-control" value="' + current.replace(/"/g, '&quot;') + '"' + (ph ? (' placeholder="' + ph + '"') : '') + '>';
				}

				['status', 'type', 'account', 'group', 'user', 'login', 'admin', 'purpose'].forEach(toInput);
				try { enhanceSearchSelects(tr); } catch (_) { }
				try { syncSearchSelects(tr); } catch (_) { }
				try { applyControlClasses(tr); } catch (_) { }
				try { applyAlnumOnlyInputs(tr); } catch (_) { }

				var toggleBtn = tr.querySelector('.js-am-toggle');
				if (toggleBtn) {
					toggleBtn.setAttribute('data-action', 'save');
					toggleBtn.title = '저장';
					toggleBtn.setAttribute('aria-label', '저장');
					toggleBtn.innerHTML = '<img src="/static/image/svg/save.svg" alt="저장" class="action-icon">';
				}
				return;
			}

			
			if (target.classList.contains('js-am-commit') || (target.classList.contains('js-am-toggle') && target.getAttribute('data-action') === 'save')) {
				// In-flight guard to prevent double-save.
				if (tr.__amSaving) return;
				tr.__amSaving = true;
				try { target.disabled = true; } catch (_) { }
				try { target.setAttribute('aria-busy', 'true'); } catch (_) { }

				var firstInvalid = null;

				function requireField(name) {
					var input = getInput(name);
					var value = read(name);
					if (!value) {
						setError(input, true);
						if (!firstInvalid) firstInvalid = input;
						return false;
					}
					setError(input, false);
					return true;
				}

				function requireFieldSelect(name, placeholderText) {
					var input = getInput(name);
					var value = readSelectDisplayFallback(name, placeholderText);
					if (!value) {
						setError(input, true);
						if (!firstInvalid) firstInvalid = input;
						return false;
					}
					setError(input, false);
					return true;
				}

				requireFieldSelect('status', '상태');
				requireFieldSelect('type', '계정 구분');
				requireField('account');
				requireFieldSelect('user', '사용자');
				requireFieldSelect('login', '로그인 권한');
				requireFieldSelect('admin', '관리자 권한');

				if (firstInvalid) {
					tr.__amSaving = false;
					try { target.disabled = false; } catch (_) { }
					try { target.removeAttribute('aria-busy'); } catch (_) { }
					try { firstInvalid.focus(); } catch (_) { }
					return;
				}

				var existingId = (tr.getAttribute('data-account-id') || '').trim();

				// Enforce "영문/숫자" only for 계정명/그룹명.
				var accountVal = read('account');
				var groupVal = read('group');
				if (accountVal !== amSanitizeAlnum(accountVal)) {
					alert('계정명은 영문/숫자만 입력 가능합니다.');
					setError(getInput('account'), true);
					tr.__amSaving = false;
					try { target.disabled = false; } catch (_) { }
					try { target.removeAttribute('aria-busy'); } catch (_) { }
					try { getInput('account').focus(); } catch (_) { }
					return;
				}
				if (groupVal && groupVal !== amSanitizeAlnum(groupVal)) {
					alert('그룹명은 영문/숫자만 입력 가능합니다.');
					setError(getInput('group'), true);
					tr.__amSaving = false;
					try { target.disabled = false; } catch (_) { }
					try { target.removeAttribute('aria-busy'); } catch (_) { }
					try { getInput('group').focus(); } catch (_) { }
					return;
				}

				var payload = {
					asset_scope: (ctx && ctx.asset_scope) ? String(ctx.asset_scope) : '',
					asset_id: (ctx && ctx.asset_id != null) ? ctx.asset_id : null,
					system_key: (existingId && (tr.getAttribute('data-system-key') || '').trim()) ? (tr.getAttribute('data-system-key') || '').trim() : inferSystemKeyFromPage(),
					status: readSelectDisplayFallback('status', '상태'),
					account_type: readSelectDisplayFallback('type', '계정 구분'),
					account_name: accountVal,
					group_name: groupVal,
					user_name: (function(){
						var td = tr.querySelector('[data-col="user"]');
						var btn = td ? td.querySelector('.fk-searchable-display') : null;
						if (btn && btn.classList.contains('has-value')) {
							var t = (btn.textContent || '').trim();
							if (t && t !== '사용자' && t !== '선택') return t;
						}
						return readSelectDisplayFallback('user', '사용자');
					})(),
					login_allowed: amBoolFromOX(readSelectDisplayFallback('login', '로그인 권한')),
					admin_allowed: amBoolFromOX(readSelectDisplayFallback('admin', '관리자 권한')),
					purpose: read('purpose')
				};

				if (collectionUrl) {
					var url = existingId ? buildAssetAccountsItemUrl(ctx, existingId, payload.system_key) : collectionUrl;
					if (!url) {
						alert('계정 저장에 필요한 컨텍스트를 찾지 못했습니다.');
						tr.__amSaving = false;
						try { target.disabled = false; } catch (_) { }
						try { target.removeAttribute('aria-busy'); } catch (_) { }
						return;
					}
					var method = existingId ? 'PUT' : 'POST';
					amFetchJSON(url, {
						method: method,
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(payload)
					})
						.then(function (resp) {
							tr.__amSaving = false;
							try { target.disabled = false; } catch (_) { }
							try { target.removeAttribute('aria-busy'); } catch (_) { }
							if (!resp || resp.success !== true) {
								alert((resp && resp.message) ? resp.message : '계정을 저장하지 못했습니다.');
								return;
							}
							var item = resp.item || {};
							if (item.id != null) tr.setAttribute('data-account-id', String(item.id));
							try {
								if (item.system_key) tr.setAttribute('data-system-key', String(item.system_key));
								else if (payload.system_key) tr.setAttribute('data-system-key', String(payload.system_key));
							} catch (_) { }

							
							commitText('status', item.status || payload.status);
							commitText('type', item.account_type || item.accountType || item.type || item.role || payload.account_type);
							commitText('account', item.account_name || payload.account_name);
							commitText('group', item.group_name || payload.group_name);
							commitText('user', item.user_name || payload.user_name);
							var tdLogin = tr.querySelector('[data-col="login"]');
							if (tdLogin) tdLogin.innerHTML = amBadgeHTML(!!item.login_allowed);
							var tdAdmin = tr.querySelector('[data-col="admin"]');
							var adminAllowed = (item.admin_allowed !== undefined) ? !!item.admin_allowed : !!item.su_allowed;
							if (tdAdmin) tdAdmin.innerHTML = amBadgeHTML(adminAllowed);
							commitText('purpose', item.purpose || payload.purpose);

							var toggleBtn = tr.querySelector('.js-am-toggle');
							if (toggleBtn) {
								toggleBtn.setAttribute('data-action', 'edit');
								toggleBtn.title = '편집';
								toggleBtn.setAttribute('aria-label', '편집');
								toggleBtn.innerHTML = '<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon">';
							}
							updateEmptyState();
						})
						.catch(function () {
							tr.__amSaving = false;
							try { target.disabled = false; } catch (_) { }
							try { target.removeAttribute('aria-busy'); } catch (_) { }
							alert('계정을 저장하지 못했습니다.');
						});
					return;
				}

				
						tr.__amSaving = false;
						try { target.disabled = false; } catch (_) { }
						try { target.removeAttribute('aria-busy'); } catch (_) { }
						commitText('status', payload.status);
						commitText('type', payload.account_type);
						commitText('account', payload.account_name);
						commitText('group', payload.group_name);
						commitText('user', payload.user_name);
						var tdLogin2 = tr.querySelector('[data-col="login"]');
						if (tdLogin2) tdLogin2.innerHTML = amBadgeHTML(payload.login_allowed);
						var tdAdmin2 = tr.querySelector('[data-col="admin"]');
						if (tdAdmin2) tdAdmin2.innerHTML = amBadgeHTML(payload.admin_allowed);
						commitText('purpose', payload.purpose);

				var toggleBtn2 = tr.querySelector('.js-am-toggle');
				if (toggleBtn2) {
					toggleBtn2.setAttribute('data-action', 'edit');
					toggleBtn2.title = '편집';
					toggleBtn2.setAttribute('aria-label', '편집');
					toggleBtn2.innerHTML = '<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon">';
				}
				updateEmptyState();
			}
		});
	}

	window.BlossomTab05Account = window.BlossomTab05Account || {};
	window.BlossomTab05Account.init = initTab05Account;

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initTab05Account);
	} else {
		initTab05Account();
	}
})();


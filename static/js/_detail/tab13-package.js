/*
 * tab13-package.js
 * Package tab behavior.
 */

(function () {
	'use strict';

	

	

	

	// Utilities

	if (window.BlossomTab13Package && typeof window.BlossomTab13Package.init === 'function') return;

	function safeJsonFetch(url, options) {
		var opt = options || {};
		opt.credentials = opt.credentials || 'same-origin';
		opt.headers = Object.assign({ Accept: 'application/json' }, opt.headers || {});
		return fetch(url, opt).then(function (r) {
			return r
				.json()
				.catch(function () {
					return { success: false, message: '응답 파싱에 실패했습니다.' };
				});
		});
	}

	function getScopeStoragePrefixes(scope) {
		var s = String(scope || '').trim();
		if (!s) return [];
		if (s === 'storage_san') return ['storage_san', 'san_storage', 'san'];
		if (s === 'san_director') return ['san_director'];
		if (s === 'san_switch') return ['san_switch', 'sansw'];
		if (s === 'network_l2') return ['network_l2', 'l2'];
		if (s === 'network_l4') return ['network_l4', 'l4'];
		if (s === 'network_l7') return ['network_l7', 'l7'];
		if (s === 'network_ap') return ['network_ap', 'ap'];
		if (s === 'network_circuit') return ['network_circuit', 'dedicateline'];
		if (s === 'firewall') return ['firewall', 'SECURITY_FIREWALL', 'hw_security_firewall'];
		if (s === 'vpn') return ['vpn', 'SECURITY_VPN', 'hw_security_vpn'];
		if (s === 'ids') return ['ids', 'SECURITY_IDS', 'hw_security_ids'];
		if (s === 'ips') return ['ips', 'SECURITY_IPS', 'hw_security_ips'];
		if (s === 'hsm') return ['hsm', 'SECURITY_HSM', 'hw_security_hsm'];
		if (s === 'kms') return ['kms', 'SECURITY_KMS', 'hw_security_kms'];
		if (s === 'wips') return ['wips', 'SECURITY_WIPS', 'hw_security_wips'];
		if (s === 'security-etc') return ['security-etc', 'etc', 'SECURITY_ETC', 'hw_security_etc'];
		return [s];
	}

	function resolveSelectedAssetId(scope) {
		var prefixes = getScopeStoragePrefixes(scope);
		var i;
		for (i = 0; i < prefixes.length; i++) {
			try {
				var raw = sessionStorage.getItem(prefixes[i] + ':selected:row') || localStorage.getItem(prefixes[i] + ':selected:row');
				if (!raw) continue;
				var row = JSON.parse(raw);
				if (row && row.id != null && String(row.id).trim() !== '') return parseInt(row.id, 10);
			} catch (_) {
				
			}
		}
		return null;
	}

	// Init

	

	

	

	function init(options) {
		var opts = options || {};
		var table = document.getElementById(opts.tableId || 'pk-spec-table');
		if (!table) return;

		if (table.__blsTab13PackageInit) return;
		table.__blsTab13PackageInit = true;

		var empty = document.getElementById(opts.emptyId || 'pk-empty');

		var scope = opts.scope;
		if (!scope) scope = window.__BLOSSOM_PK_SCOPE;
		if (!scope) scope = 'onpremise';

		var pkAssetId = (opts.assetId != null) ? opts.assetId : resolveSelectedAssetId(scope);

		// Searchable select source: package type
		function ensurePackageTypeSearchSource() {
			try {
				window.BlossomSearchableSelectSources = window.BlossomSearchableSelectSources || {};
				if (typeof window.BlossomSearchableSelectSources.pk_package_type === 'function') return;
				window.BlossomSearchableSelectSources.pk_package_type = function (ctx) {
					var q = (ctx && ctx.query) ? String(ctx.query).trim() : '';
					var items = [
						{ value: 'RPM', label: 'RPM', displayLabel: 'RPM' },
						{ value: 'DEB', label: 'DEB', displayLabel: 'DEB' },
						{ value: 'YUM', label: 'YUM', displayLabel: 'YUM' },
						{ value: 'APK', label: 'APK', displayLabel: 'APK' },
						{ value: 'PIP', label: 'PIP', displayLabel: 'PIP' },
						{ value: 'NPM', label: 'NPM', displayLabel: 'NPM' },
						{ value: 'GEM', label: 'GEM', displayLabel: 'GEM' },
						{ value: 'BREW', label: 'BREW', displayLabel: 'BREW' },
						{ value: 'MSI', label: 'MSI', displayLabel: 'MSI' },
						{ value: 'EXE', label: 'EXE', displayLabel: 'EXE' },
						{ value: 'JAR', label: 'JAR', displayLabel: 'JAR' },
						{ value: 'WAR', label: 'WAR', displayLabel: 'WAR' },
						{ value: 'TAR', label: 'TAR', displayLabel: 'TAR' },
						{ value: 'ZIP', label: 'ZIP', displayLabel: 'ZIP' },
						{ value: 'DOCKER', label: 'DOCKER', displayLabel: 'DOCKER' },
						{ value: '기타', label: '기타', displayLabel: '기타' }
					];
					if (!q) return Promise.resolve(items);
					var qq = q.toLowerCase();
					return Promise.resolve(items.filter(function (it) {
						return String(it.label || '').toLowerCase().indexOf(qq) > -1;
					}));
				};
			} catch (_) {
				// ignore
			}
		}
		function enhanceSearchSelects(scopeEl) {
			try {
				if (window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function') {
					window.BlossomSearchableSelect.enhance(scopeEl || document);
				}
			} catch (_) { }
		}
		function syncSearchSelects(scopeEl) {
			try {
				if (window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function') {
					window.BlossomSearchableSelect.syncAll(scopeEl || document);
				}
			} catch (_) { }
		}
		function pkPackageTypeSelectHtml(selectedValue) {
			var cur = (selectedValue == null ? '' : String(selectedValue)).trim();
			var list = ['RPM', 'DEB', 'YUM', 'APK', 'PIP', 'NPM', 'GEM', 'BREW', 'MSI', 'EXE', 'JAR', 'WAR', 'TAR', 'ZIP', 'DOCKER', '기타'];
			var optsHtml = '<option value=""></option>';
			var seen = {};
			list.forEach(function (v) {
				if (!v) return;
				seen[v] = true;
				optsHtml += '<option value="' + String(v).replace(/"/g, '&quot;') + '"' + (cur === v ? ' selected' : '') + '>' + v + '</option>';
			});
			if (cur && !seen[cur]) {
				optsHtml += '<option value="' + String(cur).replace(/"/g, '&quot;') + '" selected>' + cur + '</option>';
			}
			return ''
				+ '<select class="search-select" data-searchable-scope="page" data-search-source="pk_package_type" data-placeholder="유형" data-allow-clear="true">'
				+ optsHtml
				+ '</select>';
		}

		ensurePackageTypeSearchSource();

	// API

	

	

	
		function pkApiBase() {
			if (!pkAssetId) return null;
			return '/api/hardware/' + scope + '/assets/' + pkAssetId + '/packages';
		}
		function pkEnsureAssetId() {
			if (pkAssetId) return true;
			try {
				alert('자산 선택 정보가 없습니다. (asset_id)');
			} catch (_) {
				
			}
			return false;
		}

		function pkText(v) {
			var s = (v == null ? '' : String(v)).trim();
			return s ? s : '-';
		}
		function pkEscHtml(v) {
			return String(v == null ? '' : v)
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#39;');
		}
		function pkGetVulnFullFromCell(td) {
			if (!td) return '';
			var full = (td.getAttribute('data-full') || '').trim();
			return full;
		}
		function pkCountVulnFromText(fullText) {
			var full = (fullText == null ? '' : String(fullText));
			var t = full.trim();
			if (!t) return 0;
			// Count CVE IDs only. (No CVE => treat as no structured vulnerabilities.)
			var m = t.match(/CVE-\d{4}-\d{4,7}/ig);
			if (!m || !m.length) return 0;
			// Unique count (avoid double-counts in repeated strings)
			var seen = {};
			var i;
			var c = 0;
			for (i = 0; i < m.length; i++) {
				var k = String(m[i]).toUpperCase();
				if (!seen[k]) {
					seen[k] = 1;
					c++;
				}
			}
			return c;
		}
		function pkExtractCveList(fullText) {
			var full = (fullText == null ? '' : String(fullText));
			var t = full.trim();
			if (!t) return [];
			var m = t.match(/CVE-\d{4}-\d{4,7}/ig);
			if (!m || !m.length) return [];
			var seen = {};
			var out = [];
			var i;
			for (i = 0; i < m.length; i++) {
				var k = String(m[i]).toUpperCase();
				if (!seen[k]) {
					seen[k] = 1;
					out.push(k);
				}
			}
			out.sort();
			return out;
		}
		function pkParseVulnRowsFromText(fullText) {
			var full = (fullText == null ? '' : String(fullText));
			var t = full.trim();
			if (!t) return [];

			var severityMap = { critical: 'CRITICAL', high: 'HIGH', medium: 'MEDIUM', low: 'LOW' };
			var statusSet = {
				OPEN: 1,
				CLOSED: 1,
				FIXED: 1,
				UNFIXED: 1,
				PATCHED: 1,
				REMEDIATED: 1,
				INVESTIGATING: 1,
				UNKNOWN: 1
			};

			var rows = [];
			var lines = String(full).split(/\r?\n/);
			var li;
			for (li = 0; li < lines.length; li++) {
				var line = lines[li];
				if (!line || !/CVE-\d{4}-\d{4,7}/i.test(line)) continue;
				var mm = line.match(/CVE-\d{4}-\d{4,7}/i);
				var cve = mm ? String(mm[0]).toUpperCase() : '';
				if (!cve) continue;

				var severity = '-';
				var cvss = '-';
				var status = '-';
				var affectedVersions = '-';
				var publishedAt = '-';

				var tokens = line
					.replace(cve, ' ')
					.split(/[\t|,]+/)
					.join(' ')
					.split(/\s+/)
					.map(function (x) { return String(x || '').trim(); })
					.filter(Boolean);

				var ti;
				for (ti = 0; ti < tokens.length; ti++) {
					var token = tokens[ti];
					var lower = token.toLowerCase();
					if (severity === '-' && severityMap[lower]) severity = severityMap[lower];

					if (cvss === '-') {
						var cm = token.match(/(\d{1,2}(?:\.\d+)?)/);
						if (cm) {
							var n = Number(cm[1]);
							if (isFinite(n) && n >= 0 && n <= 10) cvss = String(n);
						}
					}

					if (status === '-') {
						var up = token.toUpperCase();
						if (statusSet[up]) status = up;
					}

					if (publishedAt === '-') {
						var dm = token.match(/(\d{4})[\/-](\d{2})[\/-](\d{2})/);
						if (dm) publishedAt = dm[1] + '-' + dm[2] + '-' + dm[3];
					}

					if (affectedVersions === '-') {
						if (/^(?:>=|<=|=|>|<)\s*\d/.test(token) || /^[<>]=?\d/.test(token)) {
							affectedVersions = token;
						} else if (/\d+\.\d+/.test(token) && /[<>]=?|\*|x|\./.test(token)) {
							affectedVersions = token;
						}
					}
				}

				rows.push({
					cve: cve,
					severity: severity,
					cvss: cvss,
					status: status,
					affectedVersions: affectedVersions,
					publishedAt: publishedAt
				});
			}

			if (!rows.length) {
				var list = pkExtractCveList(t);
				for (li = 0; li < list.length; li++) {
					rows.push({
						cve: list[li],
						severity: '-',
						cvss: '-',
						status: '-',
						affectedVersions: '-',
						publishedAt: '-'
					});
				}
			}

			var seen = {};
			return rows.filter(function (r) {
				if (!r || !r.cve) return false;
				if (seen[r.cve]) return false;
				seen[r.cve] = 1;
				return true;
			});
		}
		function pkSetVulnCell(td, fullText) {
			if (!td) return;
			var full = (fullText == null ? '' : String(fullText));
			var hasText = (full.trim().length > 0);
			td.setAttribute('data-full', full);
			if (!hasText) {
				td.innerHTML = '-';
				return;
			}
			var vulnCount = pkCountVulnFromText(full);
			if (!vulnCount) {
				td.innerHTML = '-';
				return;
			}
			var countText = vulnCount >= 3 ? '3+' : String(vulnCount);
			var toneClass = vulnCount >= 3 ? 'tone-3' : (vulnCount === 2 ? 'tone-2' : 'tone-1');
			td.innerHTML = ''
				+ '<span class="cell-num">'
				+ '<span class="num-badge ' + toneClass + '" aria-label="취약점 수">' + countText + '</span>'
				+ '<button class="action-btn js-pk-vuln" type="button" title="취약점 ' + vulnCount + '건 보기" aria-label="취약점 보기">'
				+ '<img src="/static/image/svg/list/free-icon-search.svg" alt="보기" class="action-icon">'
				+ '</button>'
				+ '</span>';
		}
		function pkBuildIdentifier(packageType, packageName, version) {
			var t = (packageType == null ? '' : String(packageType)).trim().toLowerCase();
			var p = (packageName == null ? '' : String(packageName)).trim();
			var v = (version == null ? '' : String(version)).trim();
			if (!t || !p) return '';
			return v ? ('pkg:' + t + '/' + p + '@' + v) : ('pkg:' + t + '/' + p);
		}
		function pkWireIdentifierAutoSync(tr) {
			if (!tr || tr.__pkIdAutoSyncWired) return;
			tr.__pkIdAutoSyncWired = true;

			function tdInput(name) {
				var td = tr.querySelector('[data-col="' + name + '"]');
				if (!td) return null;
				return td.querySelector('input, select');
			}
			var pkgInp = tdInput('package');
			var verInp = tdInput('version');
			var typeInp = tdInput('package_type');
			var idInp = tdInput('identifier');
			if (!idInp) return;

			// Only auto-fill until user edits identifier manually.
			idInp.dataset.userEdited = '0';
			idInp.addEventListener('input', function () {
				idInp.dataset.userEdited = '1';
			});

			function recompute() {
				if (!idInp || idInp.dataset.userEdited === '1') return;
				var pkg = pkgInp ? pkgInp.value : '';
				var ver = verInp ? verInp.value : '';
				var typ = typeInp ? typeInp.value : '';
				var next = pkBuildIdentifier(typ, pkg, ver);
				if (!next) return;
				idInp.value = next;
			}

			if (pkgInp) pkgInp.addEventListener('input', recompute);
			if (verInp) verInp.addEventListener('input', recompute);
			if (typeInp) typeInp.addEventListener('change', recompute);

			// initial fill
			try { recompute(); } catch (_) { }
		}
		function pkRenderRowFromItem(item) {
			var tr = document.createElement('tr');
			tr.setAttribute('data-package-id', String(item.id));
			var vulnFull = (item && item.vulnerability != null) ? String(item.vulnerability) : '';
			var manufacturer = (item && item.manufacturer != null) ? String(item.manufacturer) : ((item && item.vendor != null) ? String(item.vendor) : '');
			tr.innerHTML = ''
				+ '<td><input type="checkbox" class="pk-row-check" aria-label="행 선택"></td>'
				+ '<td data-col="package">' + pkText(item.package) + '</td>'
				+ '<td data-col="version">' + pkText(item.version) + '</td>'
				+ '<td data-col="package_type">' + pkText(item.package_type) + '</td>'
				+ '<td data-col="identifier">' + pkText(item.identifier) + '</td>'
				+ '<td data-col="manufacturer">' + pkText(manufacturer) + '</td>'
				+ '<td data-col="license">' + pkText(item.license) + '</td>'
				+ '<td data-col="vulnerability" data-full=""></td>'
				+ '<td class="system-actions table-actions">'
				+ '<button class="action-btn js-pk-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button>'
				+ '<button class="action-btn danger js-pk-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'
				+ '</td>';
			try {
				var vulnTd = tr.querySelector('td[data-col="vulnerability"]');
				pkSetVulnCell(vulnTd, vulnFull);
			} catch (_) {
				
			}
			return tr;
		}

		function pkHasEditingRows() {
			try {
				return !!table.querySelector('tbody td[data-col] input, tbody td[data-col] select, tbody td[data-col] textarea');
			} catch (_) {
				return false;
			}
		}
		function pkNormalizeTextForSort(s) {
			var t = (s == null ? '' : String(s)).trim();
			if (!t || t === '-') return '';
			return t;
		}
		function pkCompareVersionLike(a, b) {
			var as = pkNormalizeTextForSort(a);
			var bs = pkNormalizeTextForSort(b);
			if (as === bs) return 0;
			if (!as) return -1;
			if (!bs) return 1;

			// Split into numeric/non-numeric chunks for a rough natural/version compare.
			function chunks(x) {
				return String(x).toLowerCase().split(/(\d+)/).filter(function (p) { return p !== ''; });
			}
			var ac = chunks(as);
			var bc = chunks(bs);
			var n = Math.max(ac.length, bc.length);
			for (var i = 0; i < n; i++) {
				var ap = (i < ac.length) ? ac[i] : '';
				var bp = (i < bc.length) ? bc[i] : '';
				if (ap === bp) continue;
				var an = /^\d+$/.test(ap);
				var bn = /^\d+$/.test(bp);
				if (an && bn) {
					var ai = parseInt(ap, 10);
					var bi = parseInt(bp, 10);
					if (ai !== bi) return ai < bi ? -1 : 1;
					// fallthrough
				} else if (an && !bn) {
					// numeric chunks come after text chunks for readability
					return 1;
				} else if (!an && bn) {
					return -1;
				} else {
					return ap < bp ? -1 : 1;
				}
			}
			return as < bs ? -1 : 1;
		}
		function pkGetSortValue(tr, key) {
			if (!tr) return '';
			if (key === 'vulnerability') {
				var tdv = tr.querySelector('td[data-col="vulnerability"]');
				var full = pkGetVulnFullFromCell(tdv);
				return pkCountVulnFromText(full);
			}
			var td = tr.querySelector('td[data-col="' + key + '"]');
			return td ? (td.textContent || '') : '';
		}
		function pkApplySort(key, dir) {
			var tbody = table.querySelector('tbody');
			if (!tbody) return;
			var rows = Array.from(tbody.querySelectorAll('tr'));
			if (!rows.length) return;

			var direction = (dir === 'desc') ? -1 : 1;
			var decorated = rows.map(function (tr, idx) {
				return { tr: tr, idx: idx, v: pkGetSortValue(tr, key) };
			});

			decorated.sort(function (a, b) {
				var av = a.v;
				var bv = b.v;
				var cmp = 0;
				if (key === 'vulnerability') {
					av = Number(av || 0);
					bv = Number(bv || 0);
					cmp = (av === bv) ? 0 : (av < bv ? -1 : 1);
				} else if (key === 'version') {
					cmp = pkCompareVersionLike(av, bv);
				} else {
					var at = pkNormalizeTextForSort(av).toLowerCase();
					var bt = pkNormalizeTextForSort(bv).toLowerCase();
					cmp = (at === bt) ? 0 : (at < bt ? -1 : 1);
				}
				if (cmp === 0) return a.idx - b.idx; // stable
				return cmp * direction;
			});

			// Re-append in sorted order
			decorated.forEach(function (d) {
				tbody.appendChild(d.tr);
			});
		}

		function pkLoad() {
			var tbody = table.querySelector('tbody');
			if (!tbody) return;
			tbody.innerHTML = '';
			var base = pkApiBase();
			if (!base) {
				updateEmptyState();
				var addBtn2 = document.getElementById('pk-row-add');
				if (addBtn2) addBtn2.disabled = true;
				return;
			}
			safeJsonFetch(base, { method: 'GET' })
				.then(function (resp) {
					if (resp && resp.success && Array.isArray(resp.items)) {
						resp.items.forEach(function (item) {
							tbody.appendChild(pkRenderRowFromItem(item));
						});
					} else {
						try { console.warn('pkLoad failed', resp); } catch (_) { }
					}
					// Apply persisted sort after data load
					try {
						if (pkState && pkState.sortKey) pkApplySort(pkState.sortKey, pkState.sortDir || 'asc');
					} catch (_) { }
					updateEmptyState();
				})
				.catch(function (err) {
					try { console.warn('pkLoad error', err); } catch (_) { }
					updateEmptyState();
				});
		}

	// CSV

	

	

	

		
		function pkEscapeCSV(val) { return '"' + String(val).replace(/"/g, '""') + '"'; }
		function pkRowSaved(tr) {
			var t = tr.querySelector('.js-pk-toggle');
			var inEdit = t && t.getAttribute('data-action') === 'save';
			if (inEdit) return false;
			return !tr.querySelector('td[data-col] input, td[data-col] select, td[data-col] textarea');
		}
		function pkVisibleRows() {
			var tbody = table.querySelector('tbody');
			if (!tbody) return [];
			return Array.from(tbody.querySelectorAll('tr')).filter(function (tr) {
				return !(tr.hasAttribute('data-hidden') || tr.style.display === 'none');
			});
		}
		function pkSavedVisibleRows() {
			return pkVisibleRows().filter(pkRowSaved);
		}
		function pkExportCSV(onlySelected) {
			var tbody = table.querySelector('tbody');
			if (!tbody) return;
			var headers = ['패키지 이름', '버전', '유형', '식별자', '제조사', '라이선스', '취약점'];
			var trs = pkSavedVisibleRows();
			if (onlySelected) {
				trs = trs.filter(function (tr) {
					var cb = tr.querySelector('.pk-row-check');
					return cb && cb.checked;
				});
			}
			if (trs.length === 0) return;
			var rows = trs.map(function (tr) {
				function text(sel) {
					var td = tr.querySelector('[data-col="' + sel + '"][data-col]');
					if (!td) return '';
					if (sel === 'vulnerability') return pkGetVulnFullFromCell(td);
					return (td.textContent || '').trim();
				}
				return ['package', 'version', 'package_type', 'identifier', 'manufacturer', 'license', 'vulnerability'].map(function (c) { return text(c); });
			});
			var lines = [headers].concat(rows).map(function (arr) {
				return arr.map(pkEscapeCSV).join(',');
			});
			var csv = '\uFEFF' + lines.join('\r\n');
			var d = new Date();
			var yyyy = d.getFullYear();
			var mm = String(d.getMonth() + 1).padStart(2, '0');
			var dd = String(d.getDate()).padStart(2, '0');
			var filename = 'packages_' + yyyy + mm + dd + '.csv';
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

	

		
		var pkState = { page: 1, pageSize: 10, sortKey: null, sortDir: 'asc' };

		(function initSorting() {
			var thead = table.querySelector('thead');
			if (!thead) return;
			var ths = Array.from(thead.querySelectorAll('th'));
			if (!ths.length) return;

			// Map header index to data-col key (skip checkbox + actions)
			var keyByIndex = {
				1: 'package',
				2: 'version',
				3: 'package_type',
				4: 'identifier',
				5: 'manufacturer',
				6: 'license',
				7: 'vulnerability'
			};

			function clearIndicators() {
				ths.forEach(function (th) {
					th.classList.remove('pk-sorted-asc');
					th.classList.remove('pk-sorted-desc');
					th.removeAttribute('aria-sort');
				});
			}
			function setIndicator(th, dir) {
				clearIndicators();
				if (!th) return;
				th.classList.add(dir === 'desc' ? 'pk-sorted-desc' : 'pk-sorted-asc');
				th.setAttribute('aria-sort', dir === 'desc' ? 'descending' : 'ascending');
			}

			ths.forEach(function (th, idx) {
				var key = keyByIndex[idx];
				if (!key) return;
				th.classList.add('pk-sortable');
				th.setAttribute('role', 'button');
				th.tabIndex = 0;
				th.dataset.sortKey = key;
			});

			function doSort(th) {
				if (!th) return;
				var key = th.dataset.sortKey;
				if (!key) return;
				if (pkHasEditingRows()) {
					try { alert('편집 중에는 정렬할 수 없습니다. (저장 후 다시 시도하세요)'); } catch (_) { }
					return;
				}
				var nextDir = 'asc';
				if (pkState.sortKey === key) nextDir = (pkState.sortDir === 'asc') ? 'desc' : 'asc';
				pkState.sortKey = key;
				pkState.sortDir = nextDir;
				pkState.page = 1;
				pkApplySort(key, nextDir);
				pkRenderPage();
				setIndicator(th, nextDir);
			}

			thead.addEventListener('click', function (e) {
				// ignore select-all checkbox
				if (e.target && (e.target.tagName || '').toLowerCase() === 'input') return;
				var th = e.target.closest('th.pk-sortable');
				doSort(th);
			});
			thead.addEventListener('keydown', function (e) {
				if (e.key !== 'Enter' && e.key !== ' ') return;
				var th = e.target.closest('th.pk-sortable');
				if (!th) return;
				e.preventDefault();
				doSort(th);
			});
		})();
		var pageSizeKey = opts.pageSizeKey || (scope + ':pk:pageSize');
		(function initPageSize() {
			try {
				var saved = localStorage.getItem(pageSizeKey);
				var sel = document.getElementById('pk-page-size');
				if (sel) {
					if (saved && ['10', '20', '50', '100'].indexOf(saved) > -1) {
						pkState.pageSize = parseInt(saved, 10);
						sel.value = saved;
					}
					sel.addEventListener('change', function () {
						var v = parseInt(sel.value, 10);
						if (!isNaN(v)) {
							pkState.page = 1;
							pkState.pageSize = v;
							localStorage.setItem(pageSizeKey, String(v));
							pkRenderPage();
						}
					});
				}
			} catch (_) {
				
			}
		})();

		var infoEl = document.getElementById('pk-pagination-info');
		var numWrap = document.getElementById('pk-page-numbers');
		var btnFirst = document.getElementById('pk-first');
		var btnPrev = document.getElementById('pk-prev');
		var btnNext = document.getElementById('pk-next');
		var btnLast = document.getElementById('pk-last');

		function pkRows() {
			var tbody = table.querySelector('tbody');
			return tbody ? Array.from(tbody.querySelectorAll('tr')) : [];
		}
		function pkTotal() { return pkRows().length; }
		function pkPages() {
			var total = pkTotal();
			return Math.max(1, Math.ceil(total / pkState.pageSize));
		}
		function pkClampPage() {
			var pages = pkPages();
			if (pkState.page > pages) pkState.page = pages;
			if (pkState.page < 1) pkState.page = 1;
		}
		function pkUpdatePaginationUI() {
			if (infoEl) {
				var total = pkTotal();
				var start = total ? (pkState.page - 1) * pkState.pageSize + 1 : 0;
				var end = Math.min(total, pkState.page * pkState.pageSize);
				infoEl.textContent = start + '-' + end + ' / ' + total + '개 항목';
			}
			if (numWrap) {
				var pages = pkPages();
				numWrap.innerHTML = '';
				for (var p = 1; p <= pages && p <= 50; p++) {
					var b = document.createElement('button');
					b.className = 'page-btn' + (p === pkState.page ? ' active' : '');
					b.textContent = String(p);
					b.dataset.page = String(p);
					numWrap.appendChild(b);
				}
			}
			var pages2 = pkPages();
			if (btnFirst) btnFirst.disabled = (pkState.page === 1);
			if (btnPrev) btnPrev.disabled = (pkState.page === 1);
			if (btnNext) btnNext.disabled = (pkState.page === pages2);
			if (btnLast) btnLast.disabled = (pkState.page === pages2);
			var sizeSel = document.getElementById('pk-page-size');
			if (sizeSel) {
				var none = (pkTotal() === 0);
				sizeSel.disabled = none;
				if (none) {
					try {
						sizeSel.value = '10';
						pkState.pageSize = 10;
					} catch (_) { }
				}
			}
		}
		function pkRenderPage() {
			pkClampPage();
			var rows = pkRows();
			var startIdx = (pkState.page - 1) * pkState.pageSize;
			var endIdx = startIdx + pkState.pageSize - 1;
			rows.forEach(function (tr, idx) {
				var visible = idx >= startIdx && idx <= endIdx;
				tr.style.display = visible ? '' : 'none';
				if (visible) tr.removeAttribute('data-hidden');
				else tr.setAttribute('data-hidden', '1');
				var cb = tr.querySelector('.pk-row-check');
				if (cb) tr.classList.toggle('selected', !!cb.checked && visible);
			});
			pkUpdatePaginationUI();
			var selectAll = document.getElementById('pk-select-all');
			if (selectAll) {
				var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .pk-row-check');
				if (visChecks.length) {
					selectAll.checked = Array.prototype.every.call(visChecks, function (cb) { return cb.checked; });
				} else {
					selectAll.checked = false;
				}
			}
		}
		function pkGo(page) { pkState.page = page; pkRenderPage(); }
		function pkGoDelta(d) { pkGo(pkState.page + d); }
		function pkGoFirst() { pkGo(1); }
		function pkGoLast() { pkGo(pkPages()); }

		if (numWrap) {
			numWrap.addEventListener('click', function (e) {
				var b = e.target.closest('button.page-btn');
				if (!b) return;
				var p = parseInt(b.dataset.page, 10);
				if (!isNaN(p)) pkGo(p);
			});
		}
		if (btnFirst) btnFirst.addEventListener('click', pkGoFirst);
		if (btnPrev) btnPrev.addEventListener('click', function () { pkGoDelta(-1); });
		if (btnNext) btnNext.addEventListener('click', function () { pkGoDelta(1); });
		if (btnLast) btnLast.addEventListener('click', pkGoLast);

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

			var apiBase = pkApiBase();
			var hasAsset = !!apiBase;
			var addBtn = document.getElementById('pk-row-add');
			var uploadBtn = document.getElementById('pk-upload-btn');
			var dlBtn = document.getElementById('pk-download-btn');
			if (addBtn) {
				addBtn.disabled = !hasAsset;
				addBtn.setAttribute('aria-disabled', String(!hasAsset));
				addBtn.title = hasAsset ? '행 추가' : '자산 선택 정보가 없습니다. (asset_id)';
			}
			if (uploadBtn) {
				uploadBtn.disabled = !hasAsset;
				uploadBtn.setAttribute('aria-disabled', String(!hasAsset));
				uploadBtn.title = hasAsset ? 'CSV 업로드' : '자산 선택 정보가 없습니다. (asset_id)';
			}
			var csvBtn = document.getElementById('pk-download-btn');
			if (csvBtn) {
				var any = !!table.querySelector('tbody tr');
				csvBtn.disabled = (!hasAsset) || (!any);
				csvBtn.setAttribute('aria-disabled', String(!any));
				csvBtn.title = !hasAsset ? '자산 선택 정보가 없습니다. (asset_id)' : (any ? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.');
			}
			pkRenderPage();
		}

		updateEmptyState();
		pkLoad();

		
		(function () {
			var btn = document.getElementById('pk-download-btn');
			var modalId = 'pk-download-modal';
			var closeBtn = document.getElementById('pk-download-close');
			var confirmBtn = document.getElementById('pk-download-confirm');

	// Modal

	

	

	
			function openModalLocal(id) {
				var el = document.getElementById(id);
				if (!el) return;
				document.body.classList.add('modal-open');
				el.classList.add('show');
				el.setAttribute('aria-hidden', 'false');
			}
			function closeModalLocal(id) {
				var el = document.getElementById(id);
				if (!el) return;
				el.classList.remove('show');
				el.setAttribute('aria-hidden', 'true');
				if (!document.querySelector('.modal-overlay-full.show')) {
					document.body.classList.remove('modal-open');
				}
			}
			if (btn) {
				btn.addEventListener('click', function () {
					if (btn.disabled) return;
					var saved = pkSavedVisibleRows();
					var total = saved.length;
					if (total <= 0) return;
					var selectedCount = saved.filter(function (tr) {
						var cb = tr.querySelector('.pk-row-check');
						return cb && cb.checked;
					}).length;
					var subtitle = document.getElementById('pk-download-subtitle');
					if (subtitle) {
						subtitle.textContent = selectedCount > 0
							? ('선택된 ' + selectedCount + '개 또는 전체 ' + total + '개 결과 중 범위를 선택하세요.')
							: ('현재 결과 ' + total + '개 항목을 CSV로 내보냅니다.');
					}
					var rowSelectedWrap = document.getElementById('pk-csv-range-row-selected');
					var optSelected = document.getElementById('pk-csv-range-selected');
					var optAll = document.getElementById('pk-csv-range-all');
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
			var modalEl = document.getElementById(modalId);
			if (modalEl) {
				modalEl.addEventListener('click', function (e) { if (e.target === modalEl) closeModalLocal(modalId); });
				document.addEventListener('keydown', function (e) {
					if (e.key === 'Escape' && modalEl.classList.contains('show')) closeModalLocal(modalId);
				});
			}
			if (confirmBtn) {
				confirmBtn.addEventListener('click', function () {
					var onlySel = !!(document.getElementById('pk-csv-range-selected')
						&& document.getElementById('pk-csv-range-selected').checked);
					pkExportCSV(onlySel);
					closeModalLocal(modalId);
				});
			}
		})();

		
		var selectAll = document.getElementById('pk-select-all');
		if (selectAll) {
			selectAll.addEventListener('change', function () {
				var checks = table.querySelectorAll('.pk-row-check:not([disabled])');
				checks.forEach(function (c) {
					var tr = c.closest('tr');
					var isHidden = tr && (tr.hasAttribute('data-hidden') || tr.style.display === 'none');
					if (!isHidden) c.checked = !!selectAll.checked;
					if (tr) tr.classList.toggle('selected', !!c.checked && !isHidden);
				});
			});
		}

		var pkVulnEditingTr = null;
		function openModalLocal(id) {
			var el = document.getElementById(id);
			if (!el) return;
			document.body.classList.add('modal-open');
			el.classList.add('show');
			el.setAttribute('aria-hidden', 'false');
		}
		function closeModalLocal(id) {
			var el = document.getElementById(id);
			if (!el) return;
			el.classList.remove('show');
			el.setAttribute('aria-hidden', 'true');
			if (!document.querySelector('.modal-overlay-full.show')) {
				document.body.classList.remove('modal-open');
			}
		}
		(function initVulnModal() {
			var modalId = 'pk-vuln-modal';
			var modalEl = document.getElementById(modalId);
			var closeBtn = document.getElementById('pk-vuln-close');
			var saveBtn = document.getElementById('pk-vuln-save');
			var ta = document.getElementById('pk-vuln-text');
			var subtitleEl = document.getElementById('pk-vuln-subtitle');
			if (!modalEl || !ta) return;
			var summaryEl = document.getElementById('pk-vuln-summary');
			if (!summaryEl) {
				summaryEl = document.createElement('div');
				summaryEl.id = 'pk-vuln-summary';
				summaryEl.className = 'pk-vuln-summary';
				try {
					if (ta.parentNode) ta.parentNode.insertBefore(summaryEl, ta);
				} catch (_) { }
			}
			try { ta.readOnly = true; } catch (_) { }
			if (closeBtn) closeBtn.addEventListener('click', function () { closeModalLocal(modalId); });
			modalEl.addEventListener('click', function (e) { if (e.target === modalEl) closeModalLocal(modalId); });
			document.addEventListener('keydown', function (e) {
				if (e.key === 'Escape' && modalEl.classList.contains('show')) closeModalLocal(modalId);
			});
			if (saveBtn) {
				saveBtn.addEventListener('click', function () {
					closeModalLocal(modalId);
				});
			}
			window.__blsOpenPkVulnModal = function (tr) {
				pkVulnEditingTr = tr || null;
				var td = tr ? tr.querySelector('td[data-col="vulnerability"]') : null;
				var v = pkGetVulnFullFromCell(td);
				ta.value = v;

				var pkg = '-';
				var ver = '-';
				try {
					if (tr) {
						var pkgTd = tr.querySelector('td[data-col="package"]');
						var verTd = tr.querySelector('td[data-col="version"]');
						pkg = pkgTd ? (pkgTd.textContent || '-').trim() : pkg;
						ver = verTd ? (verTd.textContent || '-').trim() : ver;
					}
				} catch (_) { }
				if (subtitleEl) {
					var pv = ((pkg && pkg !== '-' ? pkg : '') + ' ' + (ver && ver !== '-' ? ver : '')).trim();
					subtitleEl.textContent = '· ' + (pv || '-');
				}

				if (summaryEl) {
					var parsed = pkParseVulnRowsFromText(v);
					var bodyRows = '';
					if (parsed && parsed.length) {
						bodyRows = parsed.map(function (r) {
							return ''
								+ '<tr>'
								+ '<td class="pk-vuln-col-cve">' + pkEscHtml(r.cve) + '</td>'
								+ '<td class="pk-vuln-col-sev">' + pkEscHtml(r.severity) + '</td>'
								+ '<td class="pk-vuln-col-cvss">' + pkEscHtml(r.cvss) + '</td>'
								+ '<td class="pk-vuln-col-status">' + pkEscHtml(r.status) + '</td>'
								+ '<td class="pk-vuln-col-aff">' + pkEscHtml(r.affectedVersions) + '</td>'
								+ '<td class="pk-vuln-col-date">' + pkEscHtml(r.publishedAt) + '</td>'
								+ '</tr>';
						}).join('');
					} else {
						bodyRows = '<tr><td class="pk-vuln-empty" colspan="6">(취약점 정보 없음)</td></tr>';
					}
					summaryEl.innerHTML = ''
						+ '<div class="pk-vuln-table-wrap server-table-container" role="region" aria-label="취약점 요약">'
						+ '<table class="pk-vuln-sum-table">'
						+ '<thead><tr>'
						+ '<th style="min-width: 180px;">CVE</th>'
						+ '<th style="min-width: 90px;">심각도</th>'
						+ '<th style="min-width: 70px;">CVSS</th>'
						+ '<th style="min-width: 90px;">상태</th>'
						+ '<th style="min-width: 180px;">영향버전</th>'
						+ '<th style="min-width: 110px;">공개일</th>'
						+ '</tr></thead>'
						+ '<tbody>' + bodyRows + '</tbody>'
						+ '</table>'
						+ '</div>';
				}

				// Default: hide raw text; user can expand.
				try { ta.style.display = 'none'; ta.hidden = true; } catch (_) { }
				openModalLocal(modalId);
				try { ta.focus(); } catch (_) { }
			};
		})();

		(function initUploadModal() {
			var btn = document.getElementById('pk-upload-btn');
			var modalId = 'pk-upload-modal';
			var modalEl = document.getElementById(modalId);
			var closeBtn = document.getElementById('pk-upload-close');
			var confirmBtn = document.getElementById('pk-upload-confirm');
			var fileInp = document.getElementById('pk-upload-file');
			var statusEl = document.getElementById('pk-upload-status');
			var dropzone = document.getElementById('pk-upload-dropzone');
			var metaEl = document.getElementById('pk-upload-meta');
			var chipEl = document.getElementById('pk-upload-file-chip');
			var templateBtn = document.getElementById('pk-upload-template-download');
			var animEl = document.getElementById('pk-upload-anim');
			if (!btn || !modalEl || !confirmBtn || !fileInp) return;

			var selectedFile = null;
			var uploadAnim = null;

			function setStatus(msg, isError) {
				if (!statusEl) return;
				statusEl.style.whiteSpace = 'pre-wrap';
				statusEl.style.color = isError ? '#b91c1c' : '#374151';
				statusEl.textContent = msg || '';
			}

			function formatBytes(bytes) {
				var n = Number(bytes || 0);
				if (!isFinite(n) || n <= 0) return '0 B';
				var units = ['B', 'KB', 'MB', 'GB'];
				var i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
				var v = n / Math.pow(1024, i);
				var s = (v >= 10 || i === 0) ? v.toFixed(0) : v.toFixed(1);
				return s + ' ' + units[i];
			}

			function applySelectedFile(file) {
				selectedFile = file || null;
				if (metaEl) metaEl.hidden = !selectedFile;
				if (chipEl) {
					chipEl.textContent = selectedFile ? (selectedFile.name + ' (' + formatBytes(selectedFile.size) + ')') : '';
				}
				confirmBtn.disabled = !selectedFile;
			}

			function downloadCsvTemplate() {
				var header = ['패키지 이름', '버전', '유형', '식별자', '제조사', '라이선스', '취약점'];
				var csv = '\uFEFF' + header.map(function (h) { return '"' + String(h).replace(/"/g, '""') + '"'; }).join(',') + '\r\n';
				var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
				var url = URL.createObjectURL(blob);
				var a = document.createElement('a');
				a.href = url;
				a.download = '패키지_업로드_양식.csv';
				document.body.appendChild(a);
				a.click();
				a.remove();
				setTimeout(function () { try { URL.revokeObjectURL(url); } catch (_) { } }, 500);
			}

			function ensureLottie(cb) {
				try {
					if (window.lottie) { cb && cb(); return; }
					var s = document.createElement('script');
					s.src = 'https://unpkg.com/lottie-web@5.12.2/build/player/lottie.min.js';
					s.async = true;
					s.onload = function () { try { cb && cb(); } catch (_) { } };
					document.head.appendChild(s);
				} catch (_) {
					// ignore
				}
			}
			function initUploadAnim() {
				if (!animEl) return;
				ensureLottie(function () {
					try {
						if (uploadAnim && typeof uploadAnim.destroy === 'function') uploadAnim.destroy();
						animEl.innerHTML = '';
						uploadAnim = window.lottie.loadAnimation({
							container: animEl,
							renderer: 'svg',
							loop: true,
							autoplay: true,
							path: '/static/image/svg/list/free-animated-upload.json',
							rendererSettings: { preserveAspectRatio: 'xMidYMid meet', progressiveLoad: true }
						});
					} catch (_) {
						// ignore
					}
				});
			}

			function readFileAsText(file) {
				if (file && typeof file.text === 'function') {
					return file.text();
				}
				return new Promise(function (resolve, reject) {
					try {
						var reader = new FileReader();
						reader.onload = function () { resolve(reader.result || ''); };
						reader.onerror = function () { reject(new Error('file read error')); };
						reader.readAsText(file);
					} catch (e) {
						reject(e);
					}
				});
			}

			function parseCSV(text) {
				// Be tolerant: accept comma/semicolon/tab/pipe separated files.
				// Also normalize common unicode punctuation variants and BOM.
				var s = String(text || '');
				if (s.charAt(0) === '\uFEFF') s = s.slice(1);
				// Normalize comma/semicolon variants to ASCII.
				s = s
					.replace(/[\uFF0C\u060C\u066B\uFE10\uFE11\uFE50\uFE51\uFF64]/g, ',')
					.replace(/[\uFF1B\u037E]/g, ';');

				// Fast path: no quotes at all (most exported files) -> delimiter detection + split.
				if (s.indexOf('"') === -1) {
					var rawLines = s.split(/\r\n|\n|\r/);
					var lines = [];
					for (var li = 0; li < rawLines.length; li++) {
						var line = rawLines[li];
						if (line == null) continue;
						if (String(line).trim() === '') continue;
						lines.push(String(line));
					}
					if (!lines.length) return [];
					function countChar(str, ch) {
						var n = 0;
						for (var i = 0; i < str.length; i++) if (str.charAt(i) === ch) n++;
						return n;
					}
					var probe = lines[0];
					var candidates = [',', ';', '\t', '|'];
					var best = ',';
					var bestCount = -1;
					for (var ci = 0; ci < candidates.length; ci++) {
						var c = candidates[ci];
						var ct = countChar(probe, c);
						if (ct > bestCount) {
							bestCount = ct;
							best = c;
						}
					}
					if (bestCount <= 0) best = ',';
					var out = [];
					for (var lj = 0; lj < lines.length; lj++) {
						out.push((best === '\t') ? lines[lj].split('\t') : lines[lj].split(best));
					}
					return out;
				}

				var rows = [];
				var row = [];
				var cell = '';
				var inQuotes = false;
				function pushCell() {
					row.push(cell);
					cell = '';
				}
				function pushRow() {
					pushCell();
					var isAllEmpty = row.every(function (c) { return String(c || '').trim() === ''; });
					if (!isAllEmpty) rows.push(row);
					row = [];
				}
				for (var i = 0; i < s.length; i++) {
					var ch = s.charAt(i);
					if (inQuotes) {
						if (ch === '"') {
							var next = s.charAt(i + 1);
							if (next === '"') {
								cell += '"';
								i++;
							} else {
								inQuotes = false;
							}
						} else {
							cell += ch;
						}
						continue;
					}
					if (ch === '"') {
						inQuotes = true;
						continue;
					}
					// Treat comma/semicolon/tab/pipe as delimiters when not quoted.
					if (ch === ',' || ch === ';' || ch === '\t' || ch === '|') {
						pushCell();
						continue;
					}
					if (ch === '\n' || ch === '\r') {
						if (ch === '\r' && s.charAt(i + 1) === '\n') i++;
						pushRow();
						continue;
					}
					cell += ch;
				}
				// last row
				var hadAny = (cell.length > 0) || row.some(function (c) { return String(c || '').trim() !== ''; });
				if (hadAny) pushRow();
				return rows;
			}

			function normalizeHeader(h) {
				return String(h || '')
					.replace(/\s+/g, '')
					.replace(/[\*\:]/g, '')
					.replace(/[\[\]\(\)\{\}\-_/]/g, '')
					.toLowerCase();
			}
			function normalizePackageType(v) {
				var s = String(v == null ? '' : v).trim();
				if (!s) return '';
				var k = s.toLowerCase();
				// normalize common variants
				if (k === 'rpm' || k === 'rpms') return 'rpm';
				if (k === 'deb' || k === 'debian') return 'deb';
				if (k === 'pip' || k === 'pypi' || k === 'python') return 'pip';
				if (k === 'npm' || k === 'node' || k === 'nodejs') return 'npm';
				if (k === 'jar' || k === 'maven') return 'jar';
				if (k === 'tar' || k === 'tgz' || k === 'tar.gz' || k === 'targz') return 'tar';
				if (k === 'bin' || k === 'binary') return 'bin';
				return k;
			}
			function headerToField(h) {
				var k = normalizeHeader(h);
				if (!k) return null;
				if (k === '패키지이름' || k === '패키지' || k === 'package' || k === 'packagename') return 'package';
				if (k === '버전' || k === 'version') return 'version';
				if (k === '유형' || k === 'type' || k === 'packagetype') return 'package_type';
				if (k === '식별자' || k === 'identifier') return 'identifier';
				if (k === '제조사' || k === '제조' || k === 'manufacturer' || k === 'vendor') return 'manufacturer';
				if (k === '라이선스' || k === 'license') return 'license';
				if (k === '취약점' || k === 'vulnerability') return 'vulnerability';
				return null;
			}

			btn.addEventListener('click', function () {
				if (btn.disabled) return;
				setStatus('');
				applySelectedFile(null);
				try { fileInp.value = ''; } catch (_) { }
				if (closeBtn) closeBtn.disabled = false;
				openModalLocal(modalId);
				setTimeout(function () { try { initUploadAnim(); } catch (_) { } }, 0);
			});
			if (closeBtn) closeBtn.addEventListener('click', function () { closeModalLocal(modalId); });
			modalEl.addEventListener('click', function (e) { if (e.target === modalEl) closeModalLocal(modalId); });
			document.addEventListener('keydown', function (e) {
				if (e.key === 'Escape' && modalEl.classList.contains('show')) closeModalLocal(modalId);
			});

			if (templateBtn) {
				templateBtn.addEventListener('click', function () {
					downloadCsvTemplate();
				});
			}

			if (dropzone) {
				dropzone.addEventListener('click', function () { try { fileInp.click(); } catch (_) { } });
				dropzone.addEventListener('keydown', function (e) {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						try { fileInp.click(); } catch (_) { }
					}
				});
				dropzone.addEventListener('dragover', function (e) {
					e.preventDefault();
					try { dropzone.classList.add('is-dragover'); } catch (_) { }
				});
				dropzone.addEventListener('dragleave', function () {
					try { dropzone.classList.remove('is-dragover'); } catch (_) { }
				});
				dropzone.addEventListener('drop', function (e) {
					e.preventDefault();
					try { dropzone.classList.remove('is-dragover'); } catch (_) { }
					var f = (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) ? e.dataTransfer.files[0] : null;
					if (!f) return;
					var name = String(f.name || '').toLowerCase();
					if (name && name.indexOf('.csv') === -1) {
						setStatus('CSV 파일만 업로드할 수 있습니다.', true);
						return;
					}
					setStatus('');
					applySelectedFile(f);
				});
			}

			fileInp.addEventListener('change', function () {
				var f = (fileInp.files && fileInp.files[0]) ? fileInp.files[0] : null;
				setStatus('');
				applySelectedFile(f);
			});

			confirmBtn.addEventListener('click', function () {
				if (!pkEnsureAssetId()) return;
				var base = pkApiBase();
				if (!base) return;
				var f = selectedFile || ((fileInp.files && fileInp.files[0]) ? fileInp.files[0] : null);
				if (!f) {
					setStatus('CSV 파일을 선택하세요.', true);
					return;
				}

				confirmBtn.disabled = true;
				if (closeBtn) closeBtn.disabled = true;
				setStatus('파일 읽는 중...');

				readFileAsText(f)
					.then(function (text) {
						var rows = parseCSV(text);
						if (!rows || rows.length === 0) throw new Error('empty');

						// Guardrail: prevent silent imports when delimiter/columns are wrong.
						var maxCols = 0;
						for (var mi = 0; mi < rows.length && mi < 5; mi++) {
							maxCols = Math.max(maxCols, (rows[mi] ? rows[mi].length : 0));
						}
						if (maxCols < 7) {
							setStatus('CSV 컬럼 수가 부족합니다. (감지: ' + maxCols + '개)\n\n양식 그대로 저장했는지(구분자/인코딩) 확인 후 다시 업로드해 주세요.', true);
							throw new Error('cols');
						}

						var fieldOrder = ['package', 'version', 'package_type', 'identifier', 'manufacturer', 'license', 'vulnerability'];
						var first = rows[0] || [];
						var hasHeader = false;
						for (var i = 0; i < first.length; i++) {
							if (headerToField(first[i])) { hasHeader = true; break; }
						}

						var headerMap = null;
						var startIdx = 0;
						if (hasHeader) {
							headerMap = {};
							for (var h = 0; h < first.length; h++) {
								var field = headerToField(first[h]);
								if (field) headerMap[field] = h;
							}
							startIdx = 1;
						}

						var items = [];
						for (var r = startIdx; r < rows.length; r++) {
							var cols = rows[r] || [];
							function colByField(field, pos) {
								var idx = headerMap && headerMap[field] != null ? headerMap[field] : pos;
								var v = (idx != null && idx < cols.length) ? cols[idx] : '';
								return String(v == null ? '' : v).trim();
							}
							var obj = {
								package: colByField('package', 0),
								version: colByField('version', 1),
								package_type: normalizePackageType(colByField('package_type', 2)),
								identifier: colByField('identifier', 3),
								manufacturer: colByField('manufacturer', 4),
								license: colByField('license', 5),
								vulnerability: colByField('vulnerability', 6)
							};
							var allEmpty = fieldOrder.every(function (k) { return String(obj[k] || '').trim() === ''; });
							if (allEmpty) continue;
							items.push({ rowNo: (r + 1), data: obj });
						}
						if (items.length === 0) throw new Error('no-rows');
						return items;
					})
					.then(function (items) {
						// Upsert behavior: if a row for (package, version) already exists, update it
						// so re-upload can fill missing fields without creating duplicates.
						return safeJsonFetch(base, { method: 'GET' })
							.then(function (resp) {
								var idxMap = {};
								if (resp && resp.success && Array.isArray(resp.items)) {
									resp.items.forEach(function (it) {
										var p = String((it && it.package) ? it.package : '').trim().toLowerCase();
										var v = String((it && it.version) ? it.version : '').trim();
										if (!p) return;
										var key = p + '|' + v;
										if (!idxMap[key]) idxMap[key] = it;
									});
								}
								return { items: items, idxMap: idxMap };
							})
							.catch(function () {
								return { items: items, idxMap: {} };
							});
					})
					.then(function (ctx) {
						var items = ctx.items || [];
						var idxMap = ctx.idxMap || {};
						var total = items.length;
						var ok = 0;
						var fail = 0;
						var failLines = [];

						function nextAt(idx) {
							if (idx >= total) {
								var msg = '완료: 성공 ' + ok + ' / 실패 ' + fail;
								if (failLines.length) {
									msg += '\n\n실패 상세(최대 10개):\n' + failLines.slice(0, 10).join('\n');
								}
								setStatus(msg, fail > 0);
								confirmBtn.disabled = !selectedFile;
								if (closeBtn) closeBtn.disabled = false;
								try { pkLoad(); } catch (_) { }
								return;
							}

							setStatus('업로드 중... ' + (idx + 1) + ' / ' + total);
							var item = items[idx];
							var payload = item.data || {};
							if (!payload.package) {
								fail++;
								failLines.push('Row ' + item.rowNo + ': 패키지 이름이 비어있습니다.');
								return nextAt(idx + 1);
							}
							var key = String(payload.package || '').trim().toLowerCase() + '|' + String(payload.version || '').trim();
							var existing = idxMap[key];
							var url = base;
							var method = 'POST';
							if (existing && existing.id != null) {
								url = base + '/' + encodeURIComponent(existing.id);
								method = 'PUT';
							}

							return safeJsonFetch(url, {
								method: method,
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify(payload)
							})
								.then(function (resp) {
									if (resp && resp.success) {
										ok++;
										try {
											var saved = resp.item;
											if (saved && saved.id != null) idxMap[key] = saved;
										} catch (_) { }
									} else {
										fail++;
										failLines.push('Row ' + item.rowNo + ': ' + ((resp && resp.message) ? resp.message : '저장 실패'));
									}
									return nextAt(idx + 1);
								})
								.catch(function () {
									fail++;
									failLines.push('Row ' + item.rowNo + ': 네트워크/서버 오류');
									return nextAt(idx + 1);
								});
						}

						return nextAt(0);
					})
					.catch(function (e) {
						try { console.warn('pk upload error', e); } catch (_) { }
						setStatus('업로드 처리 중 오류가 발생했습니다.', true);
						confirmBtn.disabled = !selectedFile;
						if (closeBtn) closeBtn.disabled = false;
					});
			});
		})();

		
		var addBtn = document.getElementById('pk-row-add');
		if (addBtn) {
			addBtn.addEventListener('click', function () {
				var tbody = table.querySelector('tbody');
				if (!tbody) return;
				var tr = document.createElement('tr');
				tr.innerHTML = (
					'<td><input type="checkbox" class="pk-row-check" aria-label="행 선택"></td>'
					+ '<td data-col="package"><input type="text" placeholder="패키지 이름 (필수)"></td>'
					+ '<td data-col="version"><input type="text" placeholder="버전"></td>'
					+ '<td data-col="package_type">' + pkPackageTypeSelectHtml('') + '</td>'
					+ '<td data-col="identifier"><input type="text" placeholder="식별자"></td>'
					+ '<td data-col="manufacturer"><input type="text" placeholder="제조사"></td>'
					+ '<td data-col="license"><input type="text" placeholder="라이선스"></td>'
					+ '<td data-col="vulnerability" data-full=""></td>'
					+ '<td class="system-actions table-actions">'
					+ '<button class="action-btn js-pk-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button>'
					+ '<button class="action-btn danger js-pk-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'
					+ '</td>'
				);
				tbody.insertBefore(tr, tbody.firstChild);
				try { enhanceSearchSelects(tr); syncSearchSelects(tr); } catch (_) { }
				try { pkWireIdentifierAutoSync(tr); } catch (_) { }
				try { pkSetVulnCell(tr.querySelector('td[data-col="vulnerability"]'), ''); } catch (_) { }
				pkState.page = 1;
				updateEmptyState();
			});
		}

		
		table.addEventListener('click', function (ev) {
			var vulnBtn = ev.target.closest('.js-pk-vuln');
			if (vulnBtn) {
				var trv = ev.target.closest('tr');
				if (trv && window.__blsOpenPkVulnModal) window.__blsOpenPkVulnModal(trv);
				return;
			}

			(function () {
				var tr = ev.target.closest('tr');
				if (!tr || !tr.parentNode || tr.parentNode.tagName.toLowerCase() !== 'tbody') return;
				var isControl = ev.target.closest('button, a, input, select, textarea, label');
				var onCheckbox = ev.target.closest('input[type="checkbox"].pk-row-check');
				if (isControl && !onCheckbox) return;
				if (onCheckbox) return;
				var cb = tr.querySelector('.pk-row-check');
				if (!cb) return;
				var hidden = tr.hasAttribute('data-hidden') || tr.style.display === 'none';
				if (hidden) return;
				cb.checked = !cb.checked;
				tr.classList.toggle('selected', cb.checked);
				var sa = document.getElementById('pk-select-all');
				if (sa) {
					var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .pk-row-check');
					if (visChecks.length) {
						sa.checked = Array.prototype.every.call(visChecks, function (c) { return c.checked; });
					} else {
						sa.checked = false;
					}
				}
			})();

			var target = ev.target.closest('.js-pk-del, .js-pk-edit, .js-pk-commit, .js-pk-toggle');
			if (!target) return;
			var tr = ev.target.closest('tr');
			if (!tr) return;

			
			if (target.classList.contains('js-pk-del')) {
				var pkgId = tr.getAttribute('data-package-id');
				if (pkgId && pkApiBase()) {
					safeJsonFetch(pkApiBase() + '/' + encodeURIComponent(pkgId), { method: 'DELETE' })
						.then(function (resp) {
							if (resp && resp.success) {
								if (tr && tr.parentNode) tr.parentNode.removeChild(tr);
								updateEmptyState();
							} else {
								alert((resp && resp.message) ? resp.message : '삭제 중 오류가 발생했습니다.');
							}
						})
						.catch(function () { alert('삭제 중 오류가 발생했습니다.'); });
				} else {
					if (tr && tr.parentNode) tr.parentNode.removeChild(tr);
					updateEmptyState();
				}
				return;
			}

			
			if (target.classList.contains('js-pk-edit') || (target.classList.contains('js-pk-toggle') && target.getAttribute('data-action') === 'edit')) {
				function toInput(name) {
					var td = tr.querySelector('[data-col="' + name + '"]');
					if (!td) return;
					var current = (td.textContent || '').trim();
					if (name === 'package_type') {
						td.innerHTML = pkPackageTypeSelectHtml(current);
						try { enhanceSearchSelects(td); syncSearchSelects(td); } catch (_) { }
						return;
					}
					td.innerHTML = '<input type="text" value="' + current + '">';
				}
				['package', 'version', 'package_type', 'identifier', 'manufacturer', 'license'].forEach(function (n) { toInput(n); });
				try { pkWireIdentifierAutoSync(tr); } catch (_) { }
				try {
					var vulnTd = tr.querySelector('td[data-col="vulnerability"]');
					pkSetVulnCell(vulnTd, pkGetVulnFullFromCell(vulnTd));
				} catch (_) {
					
				}
				var toggleBtn = tr.querySelector('.js-pk-toggle');
				if (toggleBtn) {
					toggleBtn.setAttribute('data-action', 'save');
					toggleBtn.title = '저장';
					toggleBtn.setAttribute('aria-label', '저장');
					toggleBtn.innerHTML = '<img src="/static/image/svg/save.svg" alt="저장" class="action-icon">';
				} else {
					var actions = tr.querySelector('.table-actions');
					if (actions) {
						actions.classList.add('system-actions');
						actions.innerHTML = '<button class="action-btn js-pk-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button> <button class="action-btn danger js-pk-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>';
					}
				}
				return;
			}

			
			if (target.classList.contains('js-pk-commit') || (target.classList.contains('js-pk-toggle') && target.getAttribute('data-action') === 'save')) {
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
				var firstInvalid = null;
				var pkgInp = getInput('package');
				var pkgVal = (pkgInp ? pkgInp.value : (tr.querySelector('[data-col="package"]').textContent || '')).trim();
				if (!pkgVal) { setError(pkgInp, true); if (!firstInvalid) firstInvalid = pkgInp; } else { setError(pkgInp, false); }
				if (firstInvalid) { try { firstInvalid.focus(); } catch (_) { } return; }

				function commit(name, val) {
					var td = tr.querySelector('[data-col="' + name + '"]');
					if (!td) return;
					if (name === 'vulnerability') {
						pkSetVulnCell(td, (val || ''));
						return;
					}
					td.textContent = (val === '' || val == null) ? '-' : String(val);
				}
				function read(name) {
					var td = tr.querySelector('[data-col="' + name + '"]');
					if (!td) return '';
					if (name === 'vulnerability') return pkGetVulnFullFromCell(td);
					var inp = getInput(name);
					var v = (inp ? inp.value : (td.textContent || ''));
					return String(v).trim();
				}

				var payload = {
					package: pkgVal,
					version: read('version'),
					package_type: read('package_type'),
					identifier: read('identifier'),
					manufacturer: read('manufacturer'),
					license: read('license'),
					vulnerability: read('vulnerability')
				};
				var pkgId2 = tr.getAttribute('data-package-id');

				if (!pkApiBase()) {
					commit('package', payload.package);
					commit('version', payload.version);
					commit('package_type', payload.package_type);
					commit('identifier', payload.identifier);
					commit('manufacturer', payload.manufacturer);
					commit('license', payload.license);
					commit('vulnerability', payload.vulnerability);
					var toggleBtn0 = tr.querySelector('.js-pk-toggle');
					if (toggleBtn0) {
						toggleBtn0.setAttribute('data-action', 'edit');
						toggleBtn0.title = '편집';
						toggleBtn0.setAttribute('aria-label', '편집');
						toggleBtn0.innerHTML = '<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon">';
					}
					updateEmptyState();
					return;
				}
				if (!pkEnsureAssetId()) return;

				var toggleBtn = tr.querySelector('.js-pk-toggle');
				if (toggleBtn) toggleBtn.disabled = true;
				var url = pkApiBase() + (pkgId2 ? ('/' + encodeURIComponent(pkgId2)) : '');
				var method = pkgId2 ? 'PUT' : 'POST';
				safeJsonFetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
					.then(function (resp) {
						if (toggleBtn) toggleBtn.disabled = false;
						if (resp && resp.success && resp.item) {
							var item = resp.item;
							if (item.id != null) tr.setAttribute('data-package-id', String(item.id));
							commit('package', item.package);
							commit('version', item.version);
							commit('package_type', item.package_type);
							commit('identifier', item.identifier);
							commit('manufacturer', item.manufacturer);
							commit('license', item.license);
							commit('vulnerability', item.vulnerability);
							if (toggleBtn) {
								toggleBtn.setAttribute('data-action', 'edit');
								toggleBtn.title = '편집';
								toggleBtn.setAttribute('aria-label', '편집');
								toggleBtn.innerHTML = '<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon">';
							} else {
								var actions = tr.querySelector('.table-actions');
								if (actions) {
									actions.classList.add('system-actions');
									actions.innerHTML = '<button class="action-btn js-pk-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button> <button class="action-btn danger js-pk-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>';
								}
							}
							updateEmptyState();
						} else {
							alert((resp && resp.message) ? resp.message : '저장 중 오류가 발생했습니다.');
						}
					})
					.catch(function () {
						if (toggleBtn) toggleBtn.disabled = false;
						alert('저장 중 오류가 발생했습니다.');
					});
				return;
			}
		});

		table.addEventListener('change', function (ev) {
			var cb = ev.target.closest('.pk-row-check');
			if (!cb) return;
			var sa = document.getElementById('pk-select-all');
			if (!sa) return;
			var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .pk-row-check');
			if (visChecks.length) sa.checked = Array.prototype.every.call(visChecks, function (c) { return c.checked; });
			else sa.checked = false;
			var trr = cb.closest('tr');
			if (trr) {
				var hidden = trr.hasAttribute('data-hidden') || trr.style.display === 'none';
				trr.classList.toggle('selected', !!cb.checked && !hidden);
			}
		});
	}

	window.BlossomTab13Package = { init: init };

	function autoInit() {
		try {
			var table = document.getElementById('pk-spec-table');
			if (!table) return;
			if (table.__blossomPkInited) return;

			var scope = (table.getAttribute('data-scope') || (table.dataset && table.dataset.scope) || '').trim();
			if (!scope) scope = (window.__BLOSSOM_PK_SCOPE || '').trim();
			if (!scope) {
				var href = String(window.location && window.location.href ? window.location.href : '').toLowerCase();
				if (href.indexOf('onpremise') > -1) scope = 'onpremise';
				else if (href.indexOf('workstation') > -1) scope = 'workstation';
				else if (href.indexOf('cloud') > -1) scope = 'cloud';
			}
			if (!scope) scope = 'onpremise';

			table.__blossomPkInited = true;
			init({
				scope: scope,
				pageSizeKey: scope + ':pk:pageSize'
			});
		} catch (_) { }
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', autoInit);
	} else {
		setTimeout(autoInit, 0);
	}
})();


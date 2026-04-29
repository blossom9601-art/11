(function () {
	'use strict';

	var state = {
		all: [],
		filtered: [],
		selected: new Set(),
		page: 1,
		pageSize: 10,
		editingId: null,
		category: ''
	};

	function qs(id) { return document.getElementById(id); }
	function esc(value) {
		if (value === null || value === undefined) return '';
		return String(value).replace(/[&<>"']/g, function (ch) {
			return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
		});
	}
	function csrfHeader() {
		var meta = document.querySelector('meta[name="csrf-token"]');
		var token = meta ? meta.getAttribute('content') : '';
		return token ? { 'X-CSRFToken': token } : {};
	}
	function fetchJson(url, options) {
		var opts = options || {};
		opts.credentials = opts.credentials || 'same-origin';
		opts.headers = Object.assign({ 'Accept': 'application/json' }, csrfHeader(), opts.headers || {});
		return fetch(url, opts).then(function (res) {
			return res.json().catch(function () { return {}; }).then(function (data) {
				if (!res.ok || data.success === false) {
					var msg = (data && (data.message || data.error)) || ('HTTP ' + res.status);
					var err = new Error(msg); err.status = res.status; throw err;
				}
				return data;
			});
		});
	}
	function sendJson(url, method, body) {
		return fetchJson(url, {
			method: method,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body || {})
		});
	}

	function applyFilters() {
		var search = (qs('status-search').value || '').trim().toLowerCase();
		var type = (qs('status-type-filter').value || '').trim();
		var stateValue = (qs('status-state-filter').value || '').trim();
		var category = state.category || '';
		state.filtered = state.all.filter(function (row) {
			var eps = row.endpoints || [];
			if (category) {
				var rowCat = (row.category_name || '').trim();
				if (rowCat !== category) return false;
			}
			if (type) {
				var hasKind = eps.some(function (ep) { return (ep.kind || '') === type; });
				if (!hasKind) return false;
			}
			if (stateValue) {
				var label = row.active_flag ? '사용 가능' : '차단';
				if (label !== stateValue) return false;
			}
			if (search) {
				var stateLbl = row.active_flag ? '사용 가능' : '차단';
				var hay = [row.resource_name, row.description, row.primary_url, row.category_name, stateLbl];
				eps.forEach(function (ep) {
					hay.push(ep.label, ep.host, ep.url, ep.kind, ep.protocol);
				});
				var hayStr = hay.map(function (v) { return (v || '').toString().toLowerCase(); }).join(' ');
				if (hayStr.indexOf(search) === -1) return false;
			}
			return true;
		});
		state.page = 1;
	}

	function totalPages() {
		return Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
	}

	function setCount(value) {
		var el = qs('status-count');
		var prev = parseInt(el.getAttribute('data-count') || '0', 10);
		el.textContent = String(value);
		el.setAttribute('data-count', String(value));
		el.classList.remove('large-number', 'very-large-number');
		if (value >= 1000) el.classList.add('very-large-number');
		else if (value >= 100) el.classList.add('large-number');
		if (prev !== value) {
			el.classList.remove('is-updating');
			void el.offsetWidth;
			el.classList.add('is-updating');
		}
	}

	function renderRows() {
		var body = qs('status-table-body');
		var empty = qs('status-empty');
		var tableContainer = document.querySelector('.system-table-container');
		body.innerHTML = '';
		setCount(state.filtered.length);

		if (!state.filtered.length) {
			tableContainer.style.display = 'none';
			empty.hidden = false;
			renderPagination();
			updateSelectAll();
			return;
		}
		tableContainer.style.display = '';
		empty.hidden = true;

		var start = (state.page - 1) * state.pageSize;
		var slice = state.filtered.slice(start, start + state.pageSize);
		var html = slice.map(function (row) {
			var eps = row.endpoints || [];
			var primary = row.primary_endpoint || eps[0] || null;
			var summary = '-';
			if (primary) {
				var url = primary.url || (primary.host || '-');
				summary = '<span class="endpoint-kind-tag kind-' + esc(primary.kind || '') + '">' + esc(primary.kind || '') + '</span>' +
					'<span class="endpoint-url-text">' + esc(url) + '</span>';
				if (eps.length > 1) {
					summary += '<span class="endpoint-extra-badge">+' + (eps.length - 1) + '</span>';
				}
			}
			var stateLabel = row.active_flag ? '사용 가능' : '차단';
			var dotCls = row.active_flag ? 'ws-run' : 'ws-c1';
			var checked = state.selected.has(row.id) ? ' checked' : '';
			return '' +
				'<tr data-id="' + esc(row.id) + '"' + (state.selected.has(row.id) ? ' class="selected"' : '') + '>' +
					'<td data-col="select" class="status-col-check"><input type="checkbox" class="row-check" data-id="' + esc(row.id) + '"' + checked + ' aria-label="선택"></td>' +
					'<td data-col="resource_name" data-label="자원명"><strong>' + esc(row.resource_name || '-') + '</strong></td>' +
					'<td data-col="category" data-label="분류">' + esc(row.category_name || '-') + '</td>' +
					'<td data-col="endpoint_summary" data-label="접속점" class="status-col-endpoint">' + summary + '</td>' +
					'<td data-col="endpoint_count" data-label="접속점 수">' + esc(eps.length) + '</td>' +
					'<td data-col="active_flag" data-label="상태"><span class="status-pill"><span class="status-dot ' + dotCls + '" aria-hidden="true"></span><span class="status-text">' + esc(stateLabel) + '</span></span></td>' +
					'<td data-col="actions" data-label="관리" class="system-actions">' +
						'<button type="button" class="action-btn" data-action="edit" data-id="' + esc(row.id) + '" title="수정" aria-label="수정">' +
							'<img src="/static/image/svg/list/free-icon-pencil.svg" alt="수정" class="action-icon">' +
						'</button>' +
					'</td>' +
				'</tr>';
		}).join('');
		body.innerHTML = html;
		renderPagination();
		updateSelectAll();
	}

	function renderPagination() {
		var info = qs('status-pagination-info');
		var pages = totalPages();
		if (state.filtered.length === 0) {
			info.textContent = '0개 항목';
		} else {
			var s = (state.page - 1) * state.pageSize + 1;
			var e = Math.min(state.filtered.length, state.page * state.pageSize);
			info.textContent = s + '-' + e + ' / ' + state.filtered.length + '개 항목';
		}
		var container = qs('status-page-numbers');
		container.innerHTML = '';
		for (var p = 1; p <= pages && p <= 50; p++) {
			var btn = document.createElement('button');
			btn.className = 'page-btn' + (p === state.page ? ' active' : '');
			btn.textContent = p;
			btn.setAttribute('data-page', p);
			container.appendChild(btn);
		}
		qs('status-first').disabled = state.page === 1;
		qs('status-prev').disabled = state.page === 1;
		qs('status-next').disabled = state.page === pages;
		qs('status-last').disabled = state.page === pages;
	}

	function updateSelectAll() {
		var all = qs('status-select-all');
		var pageIds = currentPageIds();
		if (!pageIds.length) { all.checked = false; all.indeterminate = false; return; }
		var selectedOnPage = pageIds.filter(function (id) { return state.selected.has(id); }).length;
		all.checked = selectedOnPage === pageIds.length;
		all.indeterminate = selectedOnPage > 0 && selectedOnPage < pageIds.length;
	}
	function currentPageIds() {
		var start = (state.page - 1) * state.pageSize;
		return state.filtered.slice(start, start + state.pageSize).map(function (r) { return r.id; });
	}

	function loadRows() {
		return fetchJson('/api/access-control/resources')
			.then(function (data) {
				state.all = data.rows || [];
				state.selected = new Set();
				applyFilters();
				renderRows();
			})
			.catch(function (err) {
				state.all = [];
				state.filtered = [];
				renderRows();
				var t = qs('status-empty-title');
				if (t) t.textContent = err.message || '자원 목록을 불러오지 못했습니다.';
			});
	}

	function getModal() { return qs('status-add-modal'); }

	// ===== 접속점 repeater =====
	var ENDPOINT_PROTOCOLS = { WEB: ['HTTPS', 'HTTP'], SSH: ['SSH'] };
	var ENDPOINT_DEFAULT_PORT = { HTTPS: 443, HTTP: 80, SSH: 22 };

	function fillProtocolOptions(selectEl, kind, current) {
		var opts = ENDPOINT_PROTOCOLS[kind] || ENDPOINT_PROTOCOLS.WEB;
		selectEl.innerHTML = '';
		opts.forEach(function (p) {
			var o = document.createElement('option');
			o.value = p; o.textContent = p;
			if (p === current) o.selected = true;
			selectEl.appendChild(o);
		});
		if (!current || opts.indexOf(current) === -1) selectEl.value = opts[0];
	}

	function buildPreview(rowEl) {
		var kind = rowEl.querySelector('[data-role="kind"]').value;
		var protocol = rowEl.querySelector('[data-role="protocol"]').value;
		var host = (rowEl.querySelector('[data-role="host"]').value || '').trim();
		var port = (rowEl.querySelector('[data-role="port"]').value || '').trim();
		var path = (rowEl.querySelector('[data-role="url_path"]').value || '').trim();
		if (!host) return '';
		var defaultPort = ENDPOINT_DEFAULT_PORT[protocol] || '';
		var portPart = port && Number(port) !== defaultPort ? (':' + port) : '';
		if (kind === 'WEB') {
			var scheme = protocol === 'HTTP' ? 'http://' : 'https://';
			var p = path ? (path.charAt(0) === '/' ? path : '/' + path) : '';
			return scheme + host + portPart + p;
		}
		return 'ssh://' + host + portPart;
	}

	function refreshEndpointPreview(rowEl) {
		var preview = rowEl.querySelector('[data-role="preview"]');
		if (preview) preview.textContent = buildPreview(rowEl);
	}

	function applyKindToRow(rowEl) {
		var kind = rowEl.querySelector('[data-role="kind"]').value;
		var protocolSel = rowEl.querySelector('[data-role="protocol"]');
		var current = protocolSel.value;
		fillProtocolOptions(protocolSel, kind, current);
		var pathWrap = rowEl.querySelector('[data-role="path-wrap"]');
		if (pathWrap) pathWrap.style.display = (kind === 'WEB') ? '' : 'none';
		// 포트가 비어 있거나 이전 기본값이라면 새 기본값으로 자동 채움
		var portInput = rowEl.querySelector('[data-role="port"]');
		var newProto = protocolSel.value;
		var defPort = ENDPOINT_DEFAULT_PORT[newProto];
		if (defPort && (!portInput.value || Number(portInput.value) === ENDPOINT_DEFAULT_PORT.HTTPS || Number(portInput.value) === ENDPOINT_DEFAULT_PORT.HTTP || Number(portInput.value) === ENDPOINT_DEFAULT_PORT.SSH)) {
			portInput.placeholder = '기본 ' + defPort;
		}
		refreshEndpointPreview(rowEl);
	}

	function updateEndpointEmptyMsg() {
		var msg = qs('endpoint-empty-msg');
		var hasRows = document.querySelectorAll('#endpoint-list .endpoint-row').length > 0;
		if (msg) msg.hidden = hasRows;
	}

	function buildEndpointRowEl() {
		// SPA 전환 시 <template>이 main 밖에 있어 사라지는 문제를 피하기 위해
		// JS에서 직접 DOM을 생성한다.
		var wrap = document.createElement('div');
		wrap.innerHTML = ''
			+ '<div class="endpoint-row" data-endpoint>'
			+   '<div class="endpoint-row-head">'
			+     '<input type="text" class="form-input endpoint-label" data-role="label" maxlength="50" placeholder="라벨 (예: 관리 콘솔, 원격 SSH)">'
			+     '<select class="form-input endpoint-kind" data-role="kind">'
			+       '<option value="WEB">WEB</option>'
			+       '<option value="SSH">SSH</option>'
			+     '</select>'
			+     '<select class="form-input endpoint-protocol" data-role="protocol"></select>'
			+     '<button type="button" class="endpoint-remove-btn" data-role="remove" title="이 접속점 삭제">'
			+       '<img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="endpoint-remove-icon">'
			+     '</button>'
			+   '</div>'
			+   '<div class="endpoint-row-body">'
			+     '<div class="endpoint-field">'
			+       '<label>호스트<span class="required">*</span></label>'
			+       '<input type="text" class="form-input endpoint-host" data-role="host" maxlength="200" placeholder="IP 또는 도메인 (예: 10.0.0.5)">'
			+     '</div>'
			+     '<div class="endpoint-field endpoint-field-port">'
			+       '<label>포트</label>'
			+       '<input type="number" class="form-input endpoint-port" data-role="port" min="1" max="65535" placeholder="기본 포트 자동">'
			+     '</div>'
			+     '<div class="endpoint-field endpoint-field-path" data-role="path-wrap">'
			+       '<label>경로 <span class="endpoint-optional">(선택)</span></label>'
			+       '<input type="text" class="form-input endpoint-path" data-role="url_path" maxlength="200" placeholder="/login">'
			+     '</div>'
			+   '</div>'
			+   '<div class="endpoint-preview" data-role="preview"></div>'
			+ '</div>';
		return wrap.firstChild;
	}

	function addEndpointRow(ep) {
		var rowEl = buildEndpointRowEl();
		var data = ep || {};
		var kind = (data.kind === 'SSH') ? 'SSH' : 'WEB';
		rowEl.querySelector('[data-role="label"]').value = data.label || '';
		rowEl.querySelector('[data-role="kind"]').value = kind;
		fillProtocolOptions(rowEl.querySelector('[data-role="protocol"]'), kind, data.protocol || (kind === 'WEB' ? 'HTTPS' : 'SSH'));
		rowEl.querySelector('[data-role="host"]').value = data.host || '';
		rowEl.querySelector('[data-role="port"]').value = data.port || '';
		rowEl.querySelector('[data-role="url_path"]').value = data.url_path || '';
		var pathWrap = rowEl.querySelector('[data-role="path-wrap"]');
		if (pathWrap) pathWrap.style.display = (kind === 'WEB') ? '' : 'none';

		rowEl.addEventListener('change', function (e) {
			var role = e.target.getAttribute('data-role');
			if (role === 'kind') applyKindToRow(rowEl);
			else if (role === 'protocol' || role === 'port' || role === 'host' || role === 'url_path') refreshEndpointPreview(rowEl);
		});
		rowEl.addEventListener('input', function (e) {
			var role = e.target.getAttribute('data-role');
			if (role === 'host' || role === 'port' || role === 'url_path') refreshEndpointPreview(rowEl);
		});
		rowEl.querySelector('[data-role="remove"]').addEventListener('click', function () {
			rowEl.parentNode.removeChild(rowEl);
			updateEndpointEmptyMsg();
		});
		qs('endpoint-list').appendChild(rowEl);
		refreshEndpointPreview(rowEl);
		updateEndpointEmptyMsg();
	}

	function clearEndpoints() {
		var list = qs('endpoint-list');
		if (list) list.innerHTML = '';
		updateEndpointEmptyMsg();
	}

	function collectEndpoints() {
		var rows = document.querySelectorAll('#endpoint-list .endpoint-row');
		var result = [];
		for (var i = 0; i < rows.length; i++) {
			var r = rows[i];
			var ep = {
				label: (r.querySelector('[data-role="label"]').value || '').trim(),
				kind: r.querySelector('[data-role="kind"]').value,
				protocol: r.querySelector('[data-role="protocol"]').value,
				host: (r.querySelector('[data-role="host"]').value || '').trim(),
				port: (r.querySelector('[data-role="port"]').value || '').trim(),
				url_path: (r.querySelector('[data-role="url_path"]').value || '').trim()
			};
			ep.port = ep.port === '' ? null : Number(ep.port);
			if (ep.kind !== 'WEB') ep.url_path = '';
			result.push(ep);
		}
		return result;
	}

	function openModal(row) {
		state.editingId = row ? row.id : null;
		qs('status-modal-title').textContent = row ? '자원 수정' : '자원 등록';
		qs('status-form-submit').textContent = row ? '수정' : '등록';
		qs('form-id').value = row ? row.id : '';
		qs('form-resource-name').value = row ? (row.resource_name || '') : '';
		qs('form-category').value = (row && row.category_name) ? row.category_name : '기타';
		qs('form-active-flag').value = row && row.active_flag === 0 ? '0' : '1';
		qs('form-tags').value = row ? (row.tags || '') : '';
		qs('form-description').value = row ? (row.description || '') : '';
		qs('status-form-message').textContent = '';
		qs('status-form-delete').hidden = !row;

		clearEndpoints();
		var eps = (row && row.endpoints) || [];
		if (!eps.length) {
			addEndpointRow({ kind: 'WEB', protocol: 'HTTPS' });
		} else {
			eps.forEach(function (ep) { addEndpointRow(ep); });
		}

		var modal = getModal();
		modal.classList.add('show');
		modal.setAttribute('aria-hidden', 'false');
		// CSS 겹합 변화로 .show 규칙이 사라져도 동작하도록 인라인으로 강제 표시
		modal.style.display = 'flex';
		modal.style.position = 'fixed';
		modal.style.inset = '0';
		modal.style.alignItems = 'center';
		modal.style.justifyContent = 'center';
		modal.style.zIndex = '2000';
		modal.style.background = 'rgba(17,24,39,0.55)';
		document.body.classList.add('modal-open');
		setTimeout(function () { qs('form-resource-name').focus(); }, 60);
	}
	function closeModal() {
		var modal = getModal();
		modal.classList.remove('show');
		modal.setAttribute('aria-hidden', 'true');
		modal.style.display = '';
		document.body.classList.remove('modal-open');
		state.editingId = null;
	}

	function collectPayload() {
		return {
			resource_name: qs('form-resource-name').value.trim(),
			category: qs('form-category').value,
			active_flag: qs('form-active-flag').value === '1' ? 1 : 0,
			tags: qs('form-tags').value.trim(),
			description: qs('form-description').value.trim(),
			endpoints: collectEndpoints()
		};
	}

	function submitForm() {
		var payload = collectPayload();
		if (!payload.resource_name) {
			qs('status-form-message').textContent = '자원명은 필수 항목입니다.';
			return;
		}
		// 클라이언트 사전 검증: host 필수
		for (var i = 0; i < payload.endpoints.length; i++) {
			var ep = payload.endpoints[i];
			if (!ep.host) {
				qs('status-form-message').textContent = '접속점 ' + (i + 1) + '번의 호스트를 입력하세요.';
				return;
			}
		}
		var url = '/api/access-control/resources';
		var method = 'POST';
		if (state.editingId) {
			url = '/api/access-control/resources/' + state.editingId;
			method = 'PUT';
		}
		var btn = qs('status-form-submit');
		btn.disabled = true;
		sendJson(url, method, payload)
			.then(function () { closeModal(); return loadRows(); })
			.catch(function (err) { qs('status-form-message').textContent = err.message || '저장 실패'; })
			.finally(function () { btn.disabled = false; });
	}

	function deleteCurrent() {
		if (!state.editingId) return;
		if (!window.confirm('이 자원을 삭제하시겠습니까?')) return;
		fetchJson('/api/access-control/resources/' + state.editingId, { method: 'DELETE' })
			.then(function () { closeModal(); return loadRows(); })
			.catch(function (err) { qs('status-form-message').textContent = err.message || '삭제 실패'; });
	}

	function openBulkDeleteModal() {
		if (state.selected.size === 0) {
			window.alert('삭제할 자원을 먼저 선택하세요.');
			return;
		}
		qs('status-delete-subtitle').textContent = '선택된 ' + state.selected.size + '개의 자원을 정말 삭제하시겠습니까?';
		var m = qs('status-delete-modal');
		m.classList.add('show');
		m.setAttribute('aria-hidden', 'false');
		m.style.display = 'flex';
		m.style.position = 'fixed';
		m.style.inset = '0';
		m.style.alignItems = 'center';
		m.style.justifyContent = 'center';
		m.style.zIndex = '2000';
		m.style.background = 'rgba(17,24,39,0.55)';
		document.body.classList.add('modal-open');
	}
	function closeBulkDeleteModal() {
		var m = qs('status-delete-modal');
		m.classList.remove('show');
		m.setAttribute('aria-hidden', 'true');
		m.style.display = '';
		document.body.classList.remove('modal-open');
	}
	function performBulkDelete() {
		var ids = Array.from(state.selected);
		if (!ids.length) { closeBulkDeleteModal(); return; }
		var btn = qs('status-delete-confirm');
		btn.disabled = true;
		var promises = ids.map(function (id) {
			return fetchJson('/api/access-control/resources/' + id, { method: 'DELETE' }).catch(function () { return null; });
		});
		Promise.all(promises).then(function () {
			btn.disabled = false;
			closeBulkDeleteModal();
			loadRows();
		});
	}

	function downloadCsv() {
		var rows = state.filtered;
		if (!rows.length) { window.alert('내려받을 데이터가 없습니다.'); return; }
		var headers = ['자원명', '상태', '접속점 라벨', '유형', '프로토콜', '호스트', '포트', '경로', 'URL', '대표', '설명'];
		function csvCell(v) {
			if (v === null || v === undefined) return '';
			var s = String(v).replace(/"/g, '""');
			return /[",\r\n]/.test(s) ? '"' + s + '"' : s;
		}
		var lines = [headers.join(',')];
		rows.forEach(function (r) {
			var stateLbl = r.active_flag ? '사용 가능' : '차단';
			var eps = r.endpoints || [];
			if (!eps.length) {
				lines.push([r.resource_name, stateLbl, '', '', '', '', '', '', '', '', r.description].map(csvCell).join(','));
				return;
			}
			eps.forEach(function (ep) {
				lines.push([
					r.resource_name, stateLbl,
					ep.label, ep.kind, ep.protocol, ep.host, ep.port, ep.url_path, ep.url,
					ep.is_primary ? '대표' : '',
					r.description
				].map(csvCell).join(','));
			});
		});
		var csv = '\ufeff' + lines.join('\r\n');
		var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
		var url = URL.createObjectURL(blob);
		var a = document.createElement('a');
		var ts = new Date();
		var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
		var fname = 'access_control_resources_' + ts.getFullYear() + pad(ts.getMonth() + 1) + pad(ts.getDate()) + '_' + pad(ts.getHours()) + pad(ts.getMinutes()) + '.csv';
		a.href = url; a.download = fname;
		document.body.appendChild(a); a.click(); document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	var _eventsBound = false;
	function bindEvents() {
		if (_eventsBound) return;
		_eventsBound = true;
		var debounceTimer = null;
		// 분류 탭
		var tabs = document.querySelectorAll('.system-tabs .system-tab-btn[data-category]');
		var categorySelect = qs('status-category-filter');
		function syncCategoryUI(cat) {
			Array.prototype.forEach.call(tabs, function (b) {
				var on = (b.getAttribute('data-category') || '') === cat;
				b.classList.toggle('active', on);
				b.setAttribute('aria-selected', on ? 'true' : 'false');
			});
			if (categorySelect && categorySelect.value !== cat) categorySelect.value = cat;
		}
		Array.prototype.forEach.call(tabs, function (btn) {
			btn.addEventListener('click', function () {
				var cat = btn.getAttribute('data-category') || '';
				state.category = cat;
				syncCategoryUI(cat);
				applyFilters();
				renderRows();
			});
		});
		if (categorySelect) {
			categorySelect.addEventListener('change', function () {
				state.category = categorySelect.value || '';
				syncCategoryUI(state.category);
				applyFilters();
				renderRows();
			});
		}
		qs('status-search').addEventListener('input', function () {
			window.clearTimeout(debounceTimer);
			debounceTimer = window.setTimeout(function () { applyFilters(); renderRows(); }, 200);
		});
		qs('status-search-clear').addEventListener('click', function () {
			qs('status-search').value = '';
			applyFilters(); renderRows();
		});
		qs('status-type-filter').addEventListener('change', function () { applyFilters(); renderRows(); });
		qs('status-state-filter').addEventListener('change', function () { applyFilters(); renderRows(); });
		qs('status-page-size').addEventListener('change', function (e) {
			state.pageSize = parseInt(e.target.value, 10) || 10;
			state.page = 1;
			renderRows();
		});
		qs('status-add-btn').addEventListener('click', function () { openModal(null); });
		qs('status-delete-btn').addEventListener('click', openBulkDeleteModal);
		qs('status-download-btn').addEventListener('click', downloadCsv);

		qs('status-first').addEventListener('click', function () { state.page = 1; renderRows(); });
		qs('status-prev').addEventListener('click', function () { if (state.page > 1) { state.page--; renderRows(); } });
		qs('status-next').addEventListener('click', function () { if (state.page < totalPages()) { state.page++; renderRows(); } });
		qs('status-last').addEventListener('click', function () { state.page = totalPages(); renderRows(); });
		qs('status-page-numbers').addEventListener('click', function (e) {
			if (e.target.classList && e.target.classList.contains('page-btn')) {
				state.page = parseInt(e.target.getAttribute('data-page'), 10) || 1;
				renderRows();
			}
		});

		qs('status-select-all').addEventListener('change', function (e) {
			var ids = currentPageIds();
			if (e.target.checked) ids.forEach(function (id) { state.selected.add(id); });
			else ids.forEach(function (id) { state.selected.delete(id); });
			renderRows();
		});

		qs('status-table-body').addEventListener('click', function (event) {
			var check = event.target.closest('input.row-check');
			if (check) {
				var id = parseInt(check.getAttribute('data-id'), 10);
				if (check.checked) state.selected.add(id); else state.selected.delete(id);
				var tr = check.closest('tr');
				if (tr) tr.classList.toggle('selected', check.checked);
				updateSelectAll();
				return;
			}
			var btn = event.target.closest('button[data-action="edit"]');
			if (btn) {
				var bid = btn.getAttribute('data-id');
				var hit = state.all.filter(function (item) { return String(item.id) === String(bid); })[0];
				if (hit) openModal(hit);
				return;
			}
			// 행 어디든 클릭 시 체크박스 토글
			var row = event.target.closest('tr[data-id]');
			if (row) {
				var rid = parseInt(row.getAttribute('data-id'), 10);
				if (!rid) return;
				var rowCheck = row.querySelector('input.row-check');
				var nowChecked = !state.selected.has(rid);
				if (nowChecked) state.selected.add(rid); else state.selected.delete(rid);
				if (rowCheck) rowCheck.checked = nowChecked;
				row.classList.toggle('selected', nowChecked);
				updateSelectAll();
			}
		});

		var modal = getModal();
		modal.addEventListener('click', function (event) {
			var target = event.target;
			if (target.closest && target.closest('[data-modal-close="1"]')) { closeModal(); return; }
			if (target === modal) closeModal();
		});
		qs('status-form-submit').addEventListener('click', submitForm);
		qs('status-form-delete').addEventListener('click', deleteCurrent);

		var addEpBtn = qs('endpoint-add-btn');
		if (addEpBtn) addEpBtn.addEventListener('click', function () {
			addEndpointRow({ kind: 'WEB', protocol: 'HTTPS' });
			ensurePrimary();
		});

		var dm = qs('status-delete-modal');
		dm.addEventListener('click', function (event) {
			var target = event.target;
			if (target.closest && target.closest('[data-modal-close="1"]')) { closeBulkDeleteModal(); return; }
			if (target === dm) closeBulkDeleteModal();
		});
		qs('status-delete-confirm').addEventListener('click', performBulkDelete);

		document.addEventListener('keydown', function (event) {
			if (event.key !== 'Escape') return;
			if (getModal().classList.contains('show')) closeModal();
			else if (qs('status-delete-modal').classList.contains('show')) closeBulkDeleteModal();
		});
	}

	function initSearchableFilters() {
		// th 안 .search-select 를 BlossomSearchableSelect 로 enhance
		var BSS = window.BlossomSearchableSelect;
		if (BSS && typeof BSS.syncAll === 'function') {
			BSS.syncAll(document);
		} else {
			// searchable_select.js 가 아직 로드되지 않았으면 로드 완료 후 재시도
			var retries = 0;
			var timer = window.setInterval(function () {
				retries++;
				var b = window.BlossomSearchableSelect;
				if (b && typeof b.syncAll === 'function') {
					window.clearInterval(timer);
					b.syncAll(document);
				} else if (retries > 20) {
					window.clearInterval(timer);
				}
			}, 150);
		}
	}

	document.addEventListener('DOMContentLoaded', function () {
		bindEvents();
		loadRows();
		initSearchableFilters();
	});
	// SPA 전환으로 이미 DOMContentLoaded가 끝난 경우 즉시 실행
	if (document.readyState === 'interactive' || document.readyState === 'complete') {
		try { bindEvents(); loadRows(); initSearchableFilters(); } catch (e) { console.error('[status_list init]', e); }
	}
	// 디버그: 콘솔에서 window.__statusDebug.openModal() 로 직접 호출 가능
	try {
		window.__statusDebug = {
			openModal: function () { try { openModal(null); console.log('[status] openModal called manually'); } catch (e) { console.error(e); } },
			getModal: function () { return getModal(); },
			state: state
		};
		console.log('[status_list] script loaded v=20260424i');
	} catch (_e) {}
})();

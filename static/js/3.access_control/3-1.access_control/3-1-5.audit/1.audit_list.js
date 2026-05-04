(function () {
	'use strict';

	var state = {
		rows: [],
		total: 0,
		scope: 'access',
		page: 1,
		pageSize: 10,
		agents: [],
		agentTotal: 0,
		agentPage: 1,
		agentPageSize: 10,
		agentLoaded: false,
		selectedAgent: null,
		selectedUser: null,
		userResults: [],
		bulkAgentIds: [],
		lastAgentExportRows: [],
		exportAgentRowsAll: [],
		agentSortKey: '',
		agentSortDir: 'asc'
	};
	var PAGE_SIZE_LIMIT = 200;
	var searchTimer = null;
	var agentSearchTimer = null;
	var userSearchTimer = null;
	var agentMappingSelectSyncTimer = null;
	var DEFAULT_ACTOR_AVATAR = '/static/image/svg/profil/free-icon-bussiness-man.svg';

	function qs(id) { return document.getElementById(id); }
	function esc(value) {
		return String(value == null ? '' : value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}
	function csrfHeader() {
		var meta = document.querySelector('meta[name="csrf-token"]');
		var token = meta ? meta.getAttribute('content') : '';
		return token ? { 'X-CSRFToken': token } : {};
	}
	function fetchJson(url, options) {
		var opts = options || {};
		var errorDefault = opts.errorDefault != null ? opts.errorDefault : '감사 기록을 불러오지 못했습니다.';
		opts.credentials = opts.credentials || 'same-origin';
		opts.cache = opts.cache || 'no-store';
		opts.headers = Object.assign({ 'Accept': 'application/json' }, csrfHeader(), opts.headers || {});
		return fetch(url, opts).then(function (res) {
			return res.json().catch(function () { return {}; }).then(function (data) {
				if (!res.ok || data.success === false) {
					throw new Error((data && (data.message || data.error)) || errorDefault);
				}
				return data;
			});
		});
	}
	function formatDateTime(value) {
		if (!value) return '-';
		return String(value).replace('T', ' ').slice(0, 19);
	}
	function showAuditMessage(message, title) {
		var titleEl = qs('message-title');
		var contentEl = qs('message-content');
		var el = qs('system-message-modal');
		if (titleEl) titleEl.textContent = title || '안내';
		if (contentEl) contentEl.textContent = String(message || '');
		if (!el) {
			window.alert(String(message || ''));
			return;
		}
		document.body.classList.add('modal-open');
		el.classList.add('show');
		el.setAttribute('aria-hidden', 'false');
	}
	function auditModalsPreventBodyUnlock() {
		return !!(document.querySelector('#system-message-modal.show') ||
			document.querySelector('#system-delete-modal.show') ||
			document.querySelector('#agent-map-modal.show') ||
			document.querySelector('#agent-pc-download-modal.show'));
	}
	function closeAuditMessageModal() {
		var el = qs('system-message-modal');
		if (!el) return;
		el.classList.remove('show');
		el.setAttribute('aria-hidden', 'true');
		if (!auditModalsPreventBodyUnlock()) document.body.classList.remove('modal-open');
		else document.body.classList.add('modal-open');
	}
	function actionClass(value) {
		if (value === '접속') return 'audit-action-access';
		if (value === '신청') return 'audit-action-request';
		if (value === '승인') return 'audit-action-approve';
		if (value === '반려') return 'audit-action-reject';
		if (value === '신청취소') return 'audit-action-cancel';
		if (value === '권한회수') return 'audit-action-revoke';
		if (value === '대무자지정') return 'audit-action-delegate';
		return '';
	}
	function resultClass(value) {
		if (value === '성공') return 'audit-result-success';
		if (value === '진행중') return 'audit-result-pending';
		return 'audit-result-fail';
	}
	function scopeTitle(scope) {
		return scope === 'agent' ? 'PC 에이전트' : '접속 기록';
	}
	function normalizeKind(row) {
		var kind = String((row && (row.endpoint_kind || row.access_type || row.primary_kind || row.resource_kind)) || '').trim().toUpperCase();
		var type = String((row && row.resource_type) || '').trim().toUpperCase();
		var url = String((row && row.resource_url) || '').trim().toLowerCase();
		if (kind === 'WEB' || kind === 'SSH') return kind;
		if (type === 'SSH' || type === '서버' || type === 'DB' || url.indexOf('ssh://') === 0) return 'SSH';
		if (row && (row.resource_name || row.resource_url || row.target_resource_id)) return 'WEB';
		return '';
	}
	function kindCell(row) {
		var kind = normalizeKind(row);
		if (!kind) return '-';
		return '<span class="endpoint-kind-tag kind-' + esc(kind) + '">' + esc(kind) + '</span>';
	}
	function accessInfo(row) {
		return row.access_info || row.primary_access_info || row.resource_url || row.host_address || '-';
	}
	function actorDeptText(row) {
		var d = (row && row.actor_department != null ? String(row.actor_department) : '').trim();
		return d || '부서 미지정';
	}
	function actorEmpText(row) {
		var e = (row && (row.actor_display_emp_no != null || row.actor_emp_no != null) ? String(row.actor_display_emp_no || row.actor_emp_no) : '').trim();
		return e || '-';
	}
	function actorNameText(row) {
		var n = (row && (row.actor_display_name != null || row.actor_name != null) ? String(row.actor_display_name || row.actor_name) : '').trim();
		return n || '-';
	}
	function actorAvatarSrc(row) {
		var u = (row && row.actor_profile_image != null ? String(row.actor_profile_image).trim() : '');
		if (!u) return DEFAULT_ACTOR_AVATAR;
		if (/^https?:\/\//i.test(u)) return u;
		if (u.charAt(0) === '/') return u;
		return '/' + u.replace(/^\.\//, '');
	}
	function actorUserCell(row) {
		var name = esc(actorNameText(row));
		var img = esc(actorAvatarSrc(row));
		return '<td class="audit-col-user-name"><div class="audit-user-cell">' +
			'<span class="audit-user-avatar"><img src="' + img + '" alt="" loading="lazy"></span>' +
			('<div class="audit-user-info"><strong>' + name + '</strong></div>') +
			'</div></td>';
	}
	function syncSelectAll() {
		var selectAll = qs('audit-select-all');
		var checks = document.querySelectorAll('.audit-row-check');
		var checked = document.querySelectorAll('.audit-row-check:checked');
		if (!selectAll) return;
		selectAll.checked = checks.length > 0 && checked.length === checks.length;
		selectAll.indeterminate = checked.length > 0 && checked.length < checks.length;
	}
	function safePageSize(value) {
		var size = parseInt(value, 10);
		if (!size || size < 1) return 10;
		return Math.min(size, PAGE_SIZE_LIMIT);
	}
	function formatNumber(value) {
		var number = parseInt(value, 10);
		if (!isFinite(number) || number < 0) number = 0;
		try { return number.toLocaleString('ko-KR'); }
		catch (_) { return String(number); }
	}
	function csvCell(value) {
		if (value === null || value === undefined) return '';
		var text = String(value).replace(/"/g, '""');
		return /[",\r\n]/.test(text) ? '"' + text + '"' : text;
	}
	function buildQuery() {
		var params = new URLSearchParams();
		[
			['audit_scope', 'access'],
			['keyword', qs('audit-keyword-filter').value],
			['from_date', qs('audit-from-date').value],
			['to_date', qs('audit-to-date').value]
		].forEach(function (pair) {
			var value = String(pair[1] || '').trim();
			if (value) params.set(pair[0], value);
		});
		params.set('page', String(state.page));
		params.set('page_size', String(state.pageSize));
		return params.toString();
	}
	function buildExportQuery() {
		var params = new URLSearchParams();
		[
			['audit_scope', 'access'],
			['keyword', qs('audit-keyword-filter').value],
			['from_date', qs('audit-from-date').value],
			['to_date', qs('audit-to-date').value]
		].forEach(function (pair) {
			var value = String(pair[1] || '').trim();
			if (value) params.set(pair[0], value);
		});
		params.set('export', '1');
		params.set('page', '1');
		params.set('page_size', '5000');
		return params.toString();
	}
	function downloadCsv() {
		var query = buildExportQuery();
		var selected = [];
		Array.prototype.forEach.call(document.querySelectorAll('.audit-row-check:checked'), function (c) {
			var v = String(c.value || '').trim();
			if (v) selected.push(v);
		});
		window.fetch('/api/access-control/audit-logs' + (query ? '?' + query : ''), {
			credentials: 'same-origin',
			cache: 'no-store',
			headers: Object.assign({ 'Accept': 'application/json' }, csrfHeader())
		}).then(function (res) {
			return res.json().catch(function () { return {}; }).then(function (data) {
				if (!res.ok || data.success === false) {
					throw new Error((data && (data.message || data.error)) || 'CSV용 데이터를 불러오지 못했습니다.');
				}
				return data;
			});
		}).then(function (data) {
			var rows = data.rows || [];
			var selSet;
			if (selected.length) {
				selSet = {};
				selected.forEach(function (id) { selSet[id] = true; });
				rows = rows.filter(function (r) { return selSet[String(r.id)]; });
			}
			if (!rows.length) {
				showAuditMessage(selected.length ? '선택한 항목이 내려받을 데이터에 없습니다. (다른 페이지에 있을 수 있습니다.)' : '내려받을 데이터가 없습니다.', '안내');
				return;
			}
			if (data.export_truncated) {
				showAuditMessage('조건에 맞는 기록이 많아 최대 ' + (data.export_max || 5000) + '건만 포함합니다.', '안내');
			}
			function csvCell(v) {
				if (v === null || v === undefined) return '';
				var s = String(v).replace(/"/g, '""');
				return /[",\r\n]/.test(s) ? '"' + s + '"' : s;
			}
			var headers = ['접속 일시', '종료 일시', '유형', '작업', '결과', '실패 사유', '부서', '사번', '사용자', '자원 이름', '접속 계정', '접속 URL/IP', '접속 IP'];
			var lines = [headers.join(',')];
			rows.forEach(function (row) {
				var resource = row.resource_name || (row.target_resource_id ? ('자원 #' + row.target_resource_id) : '-');
				lines.push([
					formatDateTime(row.occurred_at),
					formatDateTime(row.session_ended_at),
					normalizeKind(row) || '',
					row.action_type || '',
					row.action_result || '',
					row.note || '',
					actorDeptText(row),
					actorEmpText(row),
					actorNameText(row),
					resource,
					row.connect_account || '',
					accessInfo(row),
					row.ip_address || ''
				].map(csvCell).join(','));
			});
			var csv = '\ufeff' + lines.join('\r\n');
			var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
			var url = URL.createObjectURL(blob);
			var a = document.createElement('a');
			var ts = new Date();
			var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
			var fname = 'access_control_audit_' + ts.getFullYear() + pad(ts.getMonth() + 1) + pad(ts.getDate()) + '_' + pad(ts.getHours()) + pad(ts.getMinutes()) + '.csv';
			a.href = url;
			a.download = fname;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		}).catch(function (err) {
			showAuditMessage(err.message || 'CSV 다운로드에 실패했습니다.', '안내');
		});
	}
	function pageRows() {
		return state.rows;
	}
	function totalPages() {
		return Math.max(1, Math.ceil(state.total / state.pageSize));
	}
	function setCount() {
		var countEl = qs('audit-count');
		var titleEl = qs('audit-current-title');
		var next = state.total || 0;
		var prev;
		if (titleEl) titleEl.textContent = scopeTitle(state.scope);
		if (!countEl) return;
		prev = parseInt(countEl.getAttribute('data-count') || countEl.textContent || '0', 10) || 0;
		countEl.textContent = String(next);
		countEl.setAttribute('data-count', String(next));
		countEl.classList.remove('large-number', 'very-large-number');
		if (next >= 1000) countEl.classList.add('very-large-number');
		else if (next >= 100) countEl.classList.add('large-number');
		if (prev !== next) {
			countEl.classList.remove('is-updating');
			void countEl.offsetWidth;
			countEl.classList.add('is-updating');
		}
	}
	function pageNumberList(pages, current) {
		var out = [];
		var start;
		var end;
		var i;
		if (pages <= 7) {
			for (i = 1; i <= pages; i++) out.push(i);
			return out;
		}
		out.push(1);
		start = Math.max(2, current - 2);
		end = Math.min(pages - 1, current + 2);
		if (start > 2) out.push('...');
		for (i = start; i <= end; i++) out.push(i);
		if (end < pages - 1) out.push('...');
		out.push(pages);
		return out;
	}
	function renderPageNumbers(pages) {
		var box = qs('audit-page-numbers');
		if (!box) return;
		box.innerHTML = pageNumberList(pages, state.page).map(function (page) {
			if (page === '...') return '<span class="page-ellipsis" aria-hidden="true">...</span>';
			return '<button type="button" class="page-btn' + (page === state.page ? ' active' : '') + '" data-page="' + page + '">' + page + '</button>';
		}).join('');
	}
	function renderPagination() {
		var pages = totalPages();
		if (!state.total) qs('audit-page-info').textContent = '0개 항목';
		else {
			var start = (state.page - 1) * state.pageSize + 1;
			var end = Math.min(state.total, state.page * state.pageSize);
			qs('audit-page-info').textContent = start + '-' + end + ' / ' + state.total + '개 항목';
		}
		renderPageNumbers(pages);
		qs('audit-first').disabled = state.page <= 1;
		qs('audit-prev').disabled = state.page <= 1;
		qs('audit-next').disabled = state.page >= pages;
		qs('audit-last').disabled = state.page >= pages;
	}
	function renderRows() {
		var body = qs('audit-table-body');
		var tableWrap = qs('audit-table-wrap');
		var empty = qs('audit-empty');
		setCount();
		if (!state.rows.length) {
			body.innerHTML = '';
			tableWrap.hidden = true;
			empty.hidden = false;
			setEmptyState('감사 기록이 없습니다.', '조건을 변경해 다시 조회하세요.');
			renderPagination();
			return;
		}
		tableWrap.hidden = false;
		empty.hidden = true;
		body.innerHTML = pageRows().map(function (row) {
			var resource = row.resource_name || (row.target_resource_id ? ('자원 #' + row.target_resource_id) : '-');
			return '<tr>' +
				'<td class="audit-col-check"><input type="checkbox" class="audit-row-check" value="' + esc(row.id || '') + '" aria-label="감사 기록 선택"></td>' +
				'<td class="audit-col-access-start">' + esc(formatDateTime(row.occurred_at)) + '</td>' +
				'<td class="audit-col-session-end">' + esc(formatDateTime(row.session_ended_at)) + '</td>' +
				'<td class="audit-col-kind">' + kindCell(row) + '</td>' +
				'<td class="audit-col-action"><span class="audit-dot-label ' + actionClass(row.action_type) + '">' + esc(row.action_type || '-') + '</span></td>' +
				'<td class="audit-col-result"><span class="audit-dot-label ' + resultClass(row.action_result) + '">' + esc(row.action_result || '-') + '</span></td>' +
				'<td class="audit-col-fail-reason"><span class="audit-cell-ellipsis" title="' + esc(row.note || '') + '">' + esc(row.note || '-') + '</span></td>' +
				'<td class="audit-col-dept"><span class="audit-cell-ellipsis">' + esc(actorDeptText(row)) + '</span></td>' +
				'<td class="audit-col-emp-no"><span class="audit-resource-name">' + esc(actorEmpText(row)) + '</span></td>' +
				actorUserCell(row) +
				'<td class="audit-col-resource"><span class="audit-resource-name">' + esc(resource) + '</span></td>' +
				'<td class="audit-col-connect-account"><span class="audit-mono">' + esc(row.connect_account || '-') + '</span></td>' +
				'<td class="audit-col-access-info"><span class="audit-access-info">' + esc(accessInfo(row)) + '</span></td>' +
				'<td class="audit-col-ip">' + esc(row.ip_address || '-') + '</td>' +
			'</tr>';
		}).join('');
		syncSelectAll();
		renderPagination();
	}
	function setEmptyState(title, desc) {
		var titleEl = qs('audit-empty-title');
		var descEl = qs('audit-empty-desc');
		if (titleEl) titleEl.textContent = title || '감사 기록이 없습니다.';
		if (descEl) descEl.textContent = desc || '';
	}
	function setSearchLoading(isLoading) {
		var wrapper = qs('audit-search-wrapper');
		if (!wrapper) return;
		if (isLoading) wrapper.classList.add('active-searching');
		else wrapper.classList.remove('active-searching');
	}
	function setSearchClearVisible() {
		var input = qs('audit-keyword-filter');
		var clear = qs('audit-search-clear');
		if (!input || !clear) return;
		if (String(input.value || '').trim()) clear.classList.add('visible');
		else clear.classList.remove('visible');
	}
	function setLoading(message) {
		qs('audit-table-body').innerHTML = '';
		qs('audit-table-wrap').hidden = true;
		qs('audit-empty').hidden = false;
		setEmptyState(message, '잠시만 기다려 주세요.');
	}
	function loadRows(resetPage) {
		if (resetPage) state.page = 1;
		var query = buildQuery();
		setLoading('감사 기록을 불러오는 중입니다.');
		setSearchLoading(true);
		return fetchJson('/api/access-control/audit-logs' + (query ? '?' + query : '')).then(function (data) {
			state.rows = data.rows || [];
			state.total = data.total || 0;
			state.page = data.page || state.page;
			state.pageSize = safePageSize(data.page_size || state.pageSize);
			if (qs('audit-page-size')) qs('audit-page-size').value = String(state.pageSize);
			setSearchLoading(false);
			renderRows();
		}).catch(function (err) {
			state.rows = [];
			state.total = 0;
			setSearchLoading(false);
			setCount();
			setEmptyState(err.message || '감사 기록을 불러오지 못했습니다.', '잠시 후 다시 시도하세요.');
			renderPagination();
		});
	}
	function loadRowsDebounced() {
		if (searchTimer) window.clearTimeout(searchTimer);
		searchTimer = window.setTimeout(function () { loadRows(true); }, 220);
	}
	function buildAgentQuery() {
		var params = new URLSearchParams();
		var keyword = qs('agent-keyword-filter');
		var mapping = qs('agent-mapping-filter');
		if (keyword && String(keyword.value || '').trim()) params.set('keyword', String(keyword.value || '').trim());
		if (mapping && String(mapping.value || '').trim()) params.set('mapping_state', String(mapping.value || '').trim());
		if (state.agentSortKey) {
			params.set('sort', state.agentSortKey);
			params.set('order', state.agentSortDir === 'desc' ? 'desc' : 'asc');
		}
		params.set('page', String(state.agentPage));
		params.set('page_size', String(state.agentPageSize));
		return params.toString();
	}
	function buildAgentExportQuery() {
		var params = new URLSearchParams();
		var keyword = qs('agent-keyword-filter');
		var mapping = qs('agent-mapping-filter');
		if (keyword && String(keyword.value || '').trim()) params.set('keyword', String(keyword.value || '').trim());
		if (mapping && String(mapping.value || '').trim()) params.set('mapping_state', String(mapping.value || '').trim());
		if (state.agentSortKey) {
			params.set('sort', state.agentSortKey);
			params.set('order', state.agentSortDir === 'desc' ? 'desc' : 'asc');
		}
		params.set('export', '1');
		params.set('page', '1');
		params.set('page_size', '5000');
		return params.toString();
	}
	function downloadAgentCsv(onlySelected) {
		var query = buildAgentExportQuery();
		var onlySel = onlySelected === true;
		var sel = [];
		Array.prototype.forEach.call(document.querySelectorAll('.agent-row-check:checked'), function (c) {
			var v = String(c.value || '').trim();
			if (v) sel.push(v);
		});
		if (onlySel && !sel.length) {
			showAuditMessage('선택된 PC 에이전트가 없습니다.', '안내');
			return;
		}

		function processRows(rows) {
			state.lastAgentExportRows = rows.slice();
			if (!rows.length) {
				showAuditMessage(onlySel ? '선택한 항목이 내려받을 데이터에 없습니다.' : '내려받을 PC 에이전트 데이터가 없습니다.', '안내');
				return;
			}
			if (state.exportAgentRowsAll && state.exportAgentRowsAll.export_truncated) {
				showAuditMessage('조건에 맞는 PC 에이전트가 많아 최대 ' + formatNumber(state.exportAgentRowsAll.export_max || 5000) + '건만 포함합니다.', '안내');
			}
			var headers = [
				'연동 상태', 'PC 이름', '에이전트 ID', 'PC 사용자', '에이전트 상태', '에이전트 버전',
				'부서', '사번', '이름', '마지막 하트비트', 'IP 주소', 'MAC 주소',
				'등록 일시', '수정 일시', '매핑 메모'
			];
			var lines = [headers.map(csvCell).join(',')];
			rows.forEach(function (row) {
				var user = row.mapped_user || {};
				var version = row.agent_version_display != null ? String(row.agent_version_display) : (row.agent_version || '-');
				lines.push([
					row.sync_status || '',
					row.hostname || '',
					row.agent_id || '',
					row.current_user || '',
					row.operation_status || '',
					version,
					user.department || row.mapped_department || '',
					user.emp_no || row.mapped_emp_no || '',
					user.name || row.mapped_name || '',
					formatDateTime(row.last_seen_at),
					row.ip_address || '',
					row.mac_address || '',
					formatDateTime(row.created_at),
					formatDateTime(row.updated_at),
					row.mapping_note || ''
				].map(csvCell).join(','));
			});
			var csv = '\ufeff' + lines.join('\r\n');
			var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
			var url = URL.createObjectURL(blob);
			var anchor = document.createElement('a');
			var now = new Date();
			var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
			anchor.href = url;
			anchor.download = 'pc_agent_' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '_' + pad(now.getHours()) + pad(now.getMinutes()) + '.csv';
			document.body.appendChild(anchor);
			anchor.click();
			document.body.removeChild(anchor);
			URL.revokeObjectURL(url);
		}

		fetchJson('/api/access-control/pc-agents' + (query ? '?' + query : ''), { errorDefault: 'PC 에이전트 CSV를 내려받지 못했습니다.' })
			.then(function (data) {
				state.exportAgentRowsAll = data;
				var rows = data.rows || [];
				var selSet;
				if (onlySel) {
					selSet = {};
					sel.forEach(function (id) { selSet[String(id)] = true; });
					rows = rows.filter(function (r) { return selSet[String(r.id)]; });
				}
				processRows(rows);
			})
			.catch(function (err) {
				showAuditMessage(err.message || 'PC 에이전트 CSV 다운로드에 실패했습니다.', '안내');
			});
	}
	function agentTotalPages() {
		return Math.max(1, Math.ceil(state.agentTotal / state.agentPageSize));
	}
	function setAgentEmptyState(mode) {
		var titleEl = qs('agent-empty-title');
		var lead = qs('agent-empty-lead');
		var hint = "에이전트 리스트가 나타나면 '연동'을 진행해주세요.";
		if (!titleEl || !lead) return;
		if (mode === 'loading' || mode === 'error' || mode === 'empty') {
			titleEl.textContent = 'PC 에이전트 내역이 없습니다.';
			lead.textContent = hint;
			return;
		}
		titleEl.textContent = 'PC 에이전트';
		lead.textContent = '';
	}
	function setAgentSearchLoading(isLoading) {
		var wrapper = qs('agent-search-wrapper');
		if (!wrapper) return;
		if (isLoading) wrapper.classList.add('active-searching');
		else wrapper.classList.remove('active-searching');
	}
	function setAgentSearchClearVisible() {
		var input = qs('agent-keyword-filter');
		var clear = qs('agent-search-clear');
		if (!input || !clear) return;
		if (String(input.value || '').trim()) clear.classList.add('visible');
		else clear.classList.remove('visible');
	}
	function setAgentCount(total) {
		var count = qs('agent-count');
		var next = parseInt(total, 10) || 0;
		var prev;
		if (!count) return;
		prev = parseInt(count.getAttribute('data-count') || count.textContent || '0', 10) || 0;
		count.textContent = formatNumber(next);
		count.setAttribute('data-count', String(next));
		count.classList.remove('large-number', 'very-large-number');
		if (next >= 1000) count.classList.add('very-large-number');
		else if (next >= 100) count.classList.add('large-number');
		if (prev !== next) {
			count.classList.remove('is-updating');
			void count.offsetWidth;
			count.classList.add('is-updating');
		}
	}
	function agentStatusClass(status) {
		if (status === '정상') return 'agent-status-normal';
		if (status === '지연') return 'agent-status-delay';
		if (status === '끊김') return 'agent-status-offline';
		if (status === '미연동') return 'agent-status-empty';
		if (status === '오류') return 'agent-status-error';
		return 'agent-status-unknown';
	}
	function agentStatusCell(row) {
		var status = row.sync_status || '확인필요';
		var cls = agentStatusClass(status);
		var t = esc(status);
		return '<span class="agent-status-with-dot">' +
			'<span class="agent-status-dot ' + cls + '" aria-hidden="true"></span>' +
			'<span class="agent-status-text">' + t + '</span></span>';
	}
	function operationStatusClass(label) {
		if (label === '활성') return 'agent-op-active';
		if (label === '오류') return 'agent-op-error';
		return 'agent-op-inactive';
	}
	function operationStatusCell(row) {
		var v = row.operation_status || '비활성';
		var cls = operationStatusClass(v);
		var t = esc(v);
		return '<span class="agent-op-with-dot">' +
			'<span class="agent-op-dot ' + cls + '" aria-hidden="true"></span>' +
			'<span class="agent-op-text">' + t + '</span></span>';
	}
	function mappedDeptEmpName(row) {
		var user = row.mapped_user || null;
		var dept = (user && user.department ? String(user.department).trim() : '') || '';
		var emp = (user && user.emp_no ? String(user.emp_no).trim() : '') || '';
		var name = (user && user.name ? String(user.name).trim() : '') || '';
		if (!user || !user.id) {
			dept = '';
			emp = '';
			name = '';
		}
		return {
			dept: dept || '-',
			emp_no: emp || '-',
			name: name || '-'
		};
	}
	function getSelectedAgentIds() {
		var out = [];
		var seen = {};
		function push(id) {
			var v = String(id || '').trim();
			if (v && !seen[v]) { seen[v] = 1; out.push(v); }
		}
		Array.prototype.forEach.call(document.querySelectorAll('.agent-row-check:checked'), function (c) {
			push(c.value);
		});
		if (!out.length) {
			Array.prototype.forEach.call(document.querySelectorAll('#agent-table-body tr.selected[data-id]'), function (tr) {
				push(tr.getAttribute('data-id'));
			});
		}
		return out;
	}
	function syncAgentSelectAll() {
		var selAll = qs('agent-select-all');
		var checks = document.querySelectorAll('.agent-row-check');
		var checked = document.querySelectorAll('.agent-row-check:checked');
		if (!selAll) return;
		selAll.checked = checks.length > 0 && checked.length === checks.length;
		selAll.indeterminate = checked.length > 0 && checked.length < checks.length;
	}
	function handleAgentSortHeaderActivate(sortKey) {
		if (!sortKey) return;
		if (state.agentSortKey === sortKey) {
			state.agentSortDir = state.agentSortDir === 'asc' ? 'desc' : 'asc';
		} else {
			state.agentSortKey = sortKey;
			state.agentSortDir = 'asc';
		}
		updateAgentSortIndicators();
		loadAgents(true);
	}
	function updateAgentSortIndicators() {
		var table = qs('agent-table');
		if (!table) return;
		Array.prototype.forEach.call(table.querySelectorAll('.agent-th-sortable[data-agent-sort]'), function (cell) {
			cell.classList.remove('sort-active-asc', 'sort-active-desc');
			var ind = cell.querySelector('.agent-sort-ind');
			if (ind) ind.textContent = '';
			if (state.agentSortKey && cell.getAttribute('data-agent-sort') === state.agentSortKey) {
				cell.classList.add(state.agentSortDir === 'asc' ? 'sort-active-asc' : 'sort-active-desc');
				if (ind) ind.textContent = state.agentSortDir === 'asc' ? '↑' : '↓';
			}
		});
	}
	function renderAgentPageNumbers(pages) {
		var box = qs('agent-page-numbers');
		if (!box) return;
		box.innerHTML = pageNumberList(pages, state.agentPage).map(function (page) {
			if (page === '...') return '<span class="page-ellipsis" aria-hidden="true">...</span>';
			return '<button type="button" class="page-btn' + (page === state.agentPage ? ' active' : '') + '" data-page="' + page + '">' + page + '</button>';
		}).join('');
	}
	function renderAgentPagination() {
		var pages = agentTotalPages();
		var info = qs('agent-page-info');
		if (info) {
			if (!state.agentTotal) info.textContent = '0개 항목';
			else {
				var start = (state.agentPage - 1) * state.agentPageSize + 1;
				var end = Math.min(state.agentTotal, state.agentPage * state.agentPageSize);
				info.textContent = start + '-' + end + ' / ' + state.agentTotal + '개 항목';
			}
		}
		renderAgentPageNumbers(pages);
		if (qs('agent-first')) qs('agent-first').disabled = state.agentPage <= 1;
		if (qs('agent-prev')) qs('agent-prev').disabled = state.agentPage <= 1;
		if (qs('agent-next')) qs('agent-next').disabled = state.agentPage >= pages;
		if (qs('agent-last')) qs('agent-last').disabled = state.agentPage >= pages;
	}
	function renderAgentRows() {
		var body = qs('agent-table-body');
		var tableWrap = qs('agent-table-wrap');
		var empty = qs('agent-empty');
		if (!body || !tableWrap || !empty) return;
		updateAgentSortIndicators();
		setAgentCount(state.agentTotal || 0);
		if (!state.agents.length) {
			body.innerHTML = '';
			tableWrap.hidden = true;
			empty.hidden = false;
			renderAgentPagination();
			if (state.scope === 'agent') scheduleAgentMappingSelectWidthSync();
			return;
		}
		tableWrap.hidden = false;
		empty.hidden = true;
		body.innerHTML = state.agents.map(function (row) {
			var m = mappedDeptEmpName(row);
			var version = row.agent_version_display != null ? String(row.agent_version_display) : (row.agent_version || '-');
			var currentUser = row.current_user || '-';
			return '<tr data-id="' + esc(row.id || '') + '">' +
				'<td class="agent-col-check"><input type="checkbox" class="agent-row-check" value="' + esc(row.id || '') + '" data-id="' + esc(row.id || '') + '" aria-label="PC 에이전트 선택"></td>' +
				'<td class="agent-col-status">' + agentStatusCell(row) + '</td>' +
				'<td class="agent-col-hostname"><span class="audit-cell-ellipsis">' + esc(row.hostname || '-') + '</span></td>' +
				'<td class="agent-col-agent-id"><span class="audit-cell-ellipsis">' + esc(row.agent_id || '-') + '</span></td>' +
				'<td class="agent-col-current-user"><span class="audit-cell-ellipsis" title="' + esc(currentUser) + '">' + esc(currentUser) + '</span></td>' +
				'<td class="agent-col-op-status">' + operationStatusCell(row) + '</td>' +
				'<td class="agent-col-version"><span class="audit-cell-ellipsis">' + esc(version) + '</span></td>' +
				'<td class="agent-col-dept"><span class="audit-cell-ellipsis">' + esc(m.dept) + '</span></td>' +
				'<td class="agent-col-emp-no"><span class="audit-resource-name">' + esc(m.emp_no) + '</span></td>' +
				'<td class="agent-col-user-name"><span class="audit-cell-ellipsis">' + esc(m.name) + '</span></td>' +
				'<td class="agent-col-last-seen"><span class="audit-cell-ellipsis">' + esc(formatDateTime(row.last_seen_at)) + '</span></td>' +
				'<td class="agent-col-ip"><span class="audit-cell-ellipsis">' + esc(row.ip_address || '-') + '</span></td>' +
				'<td class="agent-col-mac"><span class="audit-cell-ellipsis">' + esc(row.mac_address || '-') + '</span></td>' +
			'</tr>';
		}).join('');
		syncAgentSelectAll();
		renderAgentPagination();
		if (state.scope === 'agent') scheduleAgentMappingSelectWidthSync();
	}
	function loadAgents(resetPage) {
		if (resetPage) state.agentPage = 1;
		var query = buildAgentQuery();
		var body = qs('agent-table-body');
		var wrap = qs('agent-table-wrap');
		var empty = qs('agent-empty');
		if (body) body.innerHTML = '';
		if (wrap) wrap.hidden = true;
		if (empty) empty.hidden = false;
		setAgentEmptyState('loading');
		setAgentSearchLoading(true);
		return fetchJson('/api/access-control/pc-agents' + (query ? '?' + query : ''), {
			errorDefault: 'PC 에이전트 목록을 불러오지 못했습니다.'
		}).then(function (data) {
			state.agents = data.rows || [];
			state.agentTotal = data.total || 0;
			state.agentPage = data.page || state.agentPage;
			state.agentPageSize = safePageSize(data.page_size || state.agentPageSize);
			state.agentLoaded = true;
			if (qs('agent-page-size')) qs('agent-page-size').value = String(state.agentPageSize);
			if (!state.agents.length) {
				setAgentEmptyState('empty');
			}
			setAgentSearchLoading(false);
			renderAgentRows();
		}).catch(function (err) {
			state.agents = [];
			state.agentTotal = 0;
			setAgentSearchLoading(false);
			setAgentCount(0);
			setAgentEmptyState('error');
			renderAgentRows();
		});
	}
	function loadAgentsDebounced() {
		if (agentSearchTimer) window.clearTimeout(agentSearchTimer);
		agentSearchTimer = window.setTimeout(function () { loadAgents(true); }, 220);
	}
	function findAgent(agentId) {
		var id = String(agentId || '');
		var found = null;
		state.agents.forEach(function (row) {
			if (String(row.id || '') === id) found = row;
		});
		return found;
	}
	function updateAgentInState(item) {
		if (!item || !item.id) return;
		state.agents = state.agents.map(function (row) {
			return String(row.id || '') === String(item.id || '') ? item : row;
		});
		renderAgentRows();
	}
	function renderUserResults(emptyHintOnly) {
		var box = qs('agent-user-results');
		if (!box) return;
		if (emptyHintOnly) {
			box.innerHTML = '<div class="agent-user-empty agent-user-results-hint">검색어를 입력하면 부서·사번·이름 결과가 표 형태로 표시됩니다.</div>';
			return;
		}
		if (!state.userResults.length) {
			box.innerHTML = '<div class="agent-user-empty">검색 결과가 없습니다.</div>';
			return;
		}
		var rows = state.userResults.map(function (user) {
			var selected = state.selectedUser && String(state.selectedUser.id) === String(user.id);
			return '<tr class="agent-user-result-row' + (selected ? ' selected' : '') + '" data-user-id="' + esc(String(user.id || '')) + '" tabindex="0" role="button" aria-pressed="' + (selected ? 'true' : 'false') + '">' +
				'<td title="' + esc(user.department || '') + '">' + esc(user.department || '-') + '</td>' +
				'<td title="' + esc(user.emp_no || '') + '">' + esc(user.emp_no || '-') + '</td>' +
				'<td title="' + esc(user.name || '') + '">' + esc(user.name || '-') + '</td>' +
				'</tr>';
		}).join('');
		box.innerHTML = '<div class="agent-user-results-scroll">' +
			'<table class="agent-user-results-table">' +
			'<thead><tr><th scope="col">부서</th><th scope="col">사번</th><th scope="col">이름</th></tr></thead>' +
			'<tbody>' + rows + '</tbody></table></div>';
	}
	function setUserSearchLoading(isLoading) {
		var box = qs('agent-user-search');
		var wrap = box ? box.parentNode : null;
		if (!wrap) return;
		if (isLoading) wrap.classList.add('active-searching');
		else wrap.classList.remove('active-searching');
	}
	function loadMappingUsers() {
		var input = qs('agent-user-search');
		var keyword = input ? String(input.value || '').trim() : '';
		if (!keyword) {
			state.userResults = [];
			if (state.selectedUser && state.selectedUser.id) {
				state.userResults = [state.selectedUser];
				renderUserResults();
			} else {
				renderUserResults(true);
			}
			return;
		}
		setUserSearchLoading(true);
		fetchJson('/api/user-profiles?q=' + encodeURIComponent(keyword) + '&limit=50').then(function (data) {
			state.userResults = data.items || data.rows || [];
			setUserSearchLoading(false);
			renderUserResults();
		}).catch(function (err) {
			state.userResults = [];
			setUserSearchLoading(false);
			if (qs('agent-user-results')) qs('agent-user-results').innerHTML = '<div class="agent-user-empty">' + esc(err.message || '사용자를 조회하지 못했습니다.') + '</div>';
		});
	}
	function loadMappingUsersDebounced() {
		if (userSearchTimer) window.clearTimeout(userSearchTimer);
		userSearchTimer = window.setTimeout(loadMappingUsers, 220);
	}
	function selectMappingUser(userId) {
		var id = String(userId || '');
		var found = null;
		state.userResults.forEach(function (user) {
			if (String(user.id || '') === id) found = user;
		});
		if (!found) return;
		state.selectedUser = found;
		renderUserResults();
	}
	function renderAgentMapTargetPanel() {
		var box = qs('agent-map-target');
		if (!box) return;
		var ids = state.bulkAgentIds || [];
		if (ids.length === 1 && state.selectedAgent) {
			var agent = state.selectedAgent;
			box.innerHTML = [
				['PC 이름', agent.hostname || '-'],
				['에이전트 ID', agent.agent_id || '-'],
				['현재 로그인', agent.current_user || '-'],
				['마지막 하트비트', formatDateTime(agent.last_seen_at)]
			].map(function (item) {
				return '<div class="agent-target-field"><span>' + esc(item[0]) + '</span><span class="agent-target-value">' + esc(item[1]) + '</span></div>';
			}).join('');
			return;
		}
		if (!ids.length) {
			box.innerHTML = '';
			return;
		}
		var labels = ids.map(function (id) {
			var r = findAgent(id);
			return r ? (r.hostname || r.agent_id || id) : id;
		});
		var parts = labels.slice(0, 10).map(function (t) { return esc(String(t)); });
		var suffix = ids.length > 10 ? ' 외 ' + (ids.length - 10) + '대' : '';
		box.innerHTML = '<div class="agent-target-field agent-target-summary"><span>선택된 PC</span><span class="agent-target-value">' + esc(String(ids.length)) + '대</span></div>' +
			'<div class="agent-target-summary-names">' + parts.join(', ') + suffix + '</div>';
	}
	function refreshAgentMapModalChrome() {
		var sub = qs('agent-map-subtitle');
		if (sub) {
			sub.textContent = (state.bulkAgentIds && state.bulkAgentIds.length > 1) ?
				('선택한 ' + state.bulkAgentIds.length + '대의 PC 에이전트에 동일한 조직 사용자를 연결합니다.') :
				'PC 에이전트와 조직 사용자를 연결합니다.';
		}
		var clearBtn = qs('agent-map-clear');
		if (clearBtn) {
			var one = state.bulkAgentIds && state.bulkAgentIds.length === 1;
			var first = one ? findAgent(state.bulkAgentIds[0]) : null;
			var mapped = !!(first && first.mapped_user && first.mapped_user.id);
			clearBtn.hidden = !mapped;
		}
	}
	function openAgentMapForSelection(ids) {
		var modal = qs('agent-map-modal');
		var search = qs('agent-user-search');
		if (!modal || !ids || !ids.length) return;
		state.bulkAgentIds = ids.map(function (x) { return String(x); });
		state.selectedAgent = state.bulkAgentIds.length === 1 ? findAgent(state.bulkAgentIds[0]) : null;
		var ag = state.selectedAgent;
		state.selectedUser = (ag && ag.mapped_user && ag.mapped_user.id) ? ag.mapped_user : null;
		state.userResults = [];
		renderAgentMapTargetPanel();
		refreshAgentMapModalChrome();
		if (search) search.value = '';
		if (qs('agent-map-note')) qs('agent-map-note').value = (ag && ag.mapping_note) ? ag.mapping_note : '';
		if (state.selectedUser && state.selectedUser.id) {
			state.userResults = [state.selectedUser];
		}
		if (state.userResults.length) {
			renderUserResults();
		} else {
			renderUserResults(true);
		}
		document.body.classList.add('modal-open');
		modal.classList.add('show');
		modal.setAttribute('aria-hidden', 'false');
		modal.style.display = 'flex';
		window.setTimeout(function () { if (search) search.focus(); }, 30);
	}
	function closeAgentMap() {
		var modal = qs('agent-map-modal');
		if (!modal) return;
		modal.classList.remove('show');
		modal.setAttribute('aria-hidden', 'true');
		modal.style.display = '';
		state.selectedAgent = null;
		state.selectedUser = null;
		state.userResults = [];
		state.bulkAgentIds = [];
		if (!auditModalsPreventBodyUnlock()) document.body.classList.remove('modal-open');
		else document.body.classList.add('modal-open');
	}
	function saveAgentMapping() {
		var button = qs('agent-map-save');
		var note = qs('agent-map-note');
		var ids = (state.bulkAgentIds && state.bulkAgentIds.length) ? state.bulkAgentIds.slice() : [];
		if (!ids.length) return;
		if (!state.selectedUser || !state.selectedUser.id) {
			showAuditMessage('연결할 사용자를 선택하세요.', '안내');
			return;
		}
		var noteBody = note ? String(note.value || '') : '';
		var uid = state.selectedUser.id;
		if (button) button.disabled = true;
		function chain(i) {
			if (i >= ids.length) {
				if (button) button.disabled = false;
				closeAgentMap();
				loadAgents(false);
				return;
			}
			fetchJson('/api/access-control/pc-agents/' + encodeURIComponent(ids[i]) + '/user', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ user_id: uid, mapping_note: noteBody }),
				errorDefault: '사용자 연결을 등록하지 못했습니다.'
			}).then(function () {
				chain(i + 1);
			}).catch(function (err) {
				if (button) button.disabled = false;
				showAuditMessage(err.message || '사용자 연결을 등록하지 못했습니다.', '안내');
			});
		}
		chain(0);
	}
	function clearAgentMapping(agent) {
		var target = agent || state.selectedAgent;
		if (!target || !target.id) return;
		if (!window.confirm('사용자 연결을 해제할까요?')) return;
		fetchJson('/api/access-control/pc-agents/' + encodeURIComponent(target.id) + '/user', {
			method: 'DELETE',
			errorDefault: '사용자 연결을 해제하지 못했습니다.'
		}).then(function (data) {
			updateAgentInState(data.item);
			closeAgentMap();
		}).catch(function (err) {
			showAuditMessage(err.message || '사용자 연결을 해제하지 못했습니다.', '안내');
		});
	}
	function openAgentPcDownloadModal() {
		var sub = qs('agent-pc-download-subtitle');
		var total = state.agentTotal || 0;
		var selectedCount = getSelectedAgentIds().length;
		if (sub) {
			sub.textContent = selectedCount > 0 ?
				('선택된 ' + formatNumber(selectedCount) + '개 또는 전체 ' + formatNumber(total) + '개 결과 중 범위를 선택하세요.') :
				('현재 결과 ' + formatNumber(total) + '개 항목을 CSV로 내보냅니다.');
		}
		var rowSelected = qs('agent-pc-csv-range-row-selected');
		var optSelected = qs('agent-pc-csv-range-selected');
		var optAll = qs('agent-pc-csv-range-all');
		if (rowSelected) rowSelected.hidden = !(selectedCount > 0);
		if (optSelected) {
			optSelected.disabled = !(selectedCount > 0);
			optSelected.checked = selectedCount > 0;
		}
		if (optAll) optAll.checked = !(selectedCount > 0);
		var dm = qs('agent-pc-download-modal');
		if (!dm) return;
		document.body.classList.add('modal-open');
		dm.classList.add('show');
		dm.setAttribute('aria-hidden', 'false');
		dm.style.display = 'flex';
	}
	function closeAgentPcDownloadModal() {
		var dm = qs('agent-pc-download-modal');
		if (!dm) return;
		dm.classList.remove('show');
		dm.setAttribute('aria-hidden', 'true');
		dm.style.display = '';
		if (!auditModalsPreventBodyUnlock()) document.body.classList.remove('modal-open');
		else document.body.classList.add('modal-open');
	}
	function openAgentBulkDeleteModal() {
		var ids = getSelectedAgentIds();
		if (!ids.length) {
			showAuditMessage('삭제처리할 행을 먼저 선택하세요.', '안내');
			return;
		}
		var sub = qs('delete-subtitle');
		if (sub) sub.textContent = '선택된 ' + ids.length + '대의 PC 에이전트를 정말 삭제처리하시겠습니까?';
		var m = qs('system-delete-modal');
		if (!m) return;
		document.body.classList.add('modal-open');
		m.classList.add('show');
		m.setAttribute('aria-hidden', 'false');
		m.style.display = 'flex';
	}
	function closeAgentBulkDeleteModal() {
		var m = qs('system-delete-modal');
		if (!m) return;
		m.classList.remove('show');
		m.setAttribute('aria-hidden', 'true');
		m.style.display = '';
		if (!auditModalsPreventBodyUnlock()) document.body.classList.remove('modal-open');
		else document.body.classList.add('modal-open');
	}
	function performAgentBulkDelete() {
		var ids = getSelectedAgentIds();
		if (!ids.length) { closeAgentBulkDeleteModal(); return; }
		var btn = qs('system-delete-confirm');
		if (btn) btn.disabled = true;
		var body = {
			agent_ids: ids.map(function (x) { return parseInt(x, 10); }).filter(function (n) { return !isNaN(n) && n > 0; })
		};
		fetchJson('/api/access-control/pc-agents/delete', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			errorDefault: '삭제 처리에 실패했습니다.'
		}).then(function () {
			if (btn) btn.disabled = false;
			closeAgentBulkDeleteModal();
			loadAgents(false);
		}).catch(function (err) {
			if (btn) btn.disabled = false;
			showAuditMessage(err.message || '삭제 처리에 실패했습니다.', '안내');
		});
	}
	function resetAgentMappingFilterSelectWidth() {
		var mf = qs('agent-mapping-filter');
		var mapWrap = mf ? mf.closest('.audit-page-size-selector') : null;
		if (!mapWrap) return;
		mapWrap.style.width = '';
		mapWrap.style.maxWidth = '';
		mapWrap.style.minWidth = '';
		mapWrap.style.flex = '';
		mapWrap.style.boxSizing = '';
	}
	function scheduleAgentMappingSelectWidthSync() {
		if (agentMappingSelectSyncTimer) window.clearTimeout(agentMappingSelectSyncTimer);
		agentMappingSelectSyncTimer = window.setTimeout(function () {
			agentMappingSelectSyncTimer = null;
			syncAgentMappingFilterToPageSizeSelect();
		}, 48);
	}
	function syncAgentMappingFilterToPageSizeSelect() {
		var pageSel = qs('agent-page-size');
		var mapSel = qs('agent-mapping-filter');
		var pgWrap = pageSel ? pageSel.closest('.audit-page-size-selector') : null;
		var mapWrap = mapSel ? mapSel.closest('.audit-page-size-selector') : null;
		var agentPane = qs('agent-list-pane');
		if (!pageSel || !mapSel || !pgWrap || !mapWrap || !agentPane || agentPane.hidden || state.scope !== 'agent') {
			resetAgentMappingFilterSelectWidth();
			return;
		}
		if (!mapWrap.classList.contains('agent-filter-selector')) return;
		pgWrap.style.width = '';
		mapWrap.style.flex = '0 0 auto';
		var w = pgWrap.offsetWidth;
		if (!w) {
			scheduleAgentMappingSelectWidthSync();
			return;
		}
		mapWrap.style.width = w + 'px';
		mapWrap.style.maxWidth = w + 'px';
		mapWrap.style.boxSizing = 'border-box';
	}
	function resetAgentFilters() {
		var kw = qs('agent-keyword-filter');
		var mf = qs('agent-mapping-filter');
		if (kw) kw.value = '';
		if (mf) mf.value = '';
		setAgentSearchClearVisible();
		loadAgents(true);
	}
	function showScope(scope) {
		var nextScope = scope === 'agent' ? 'agent' : 'access';
		var accessPane = qs('audit-list-pane');
		var agentPane = qs('agent-list-pane');
		if (nextScope === state.scope) return;
		state.scope = nextScope;
		Array.prototype.forEach.call(document.querySelectorAll('.audit-tabs [data-audit-scope]'), function (tab) {
			var active = tab.getAttribute('data-audit-scope') === state.scope;
			tab.classList.toggle('active', active);
			tab.setAttribute('aria-selected', active ? 'true' : 'false');
		});
		if (accessPane) accessPane.hidden = state.scope !== 'access';
		if (agentPane) agentPane.hidden = state.scope !== 'agent';
		if (state.scope === 'agent') {
			if (!state.agentLoaded) loadAgents(true);
			else renderAgentRows();
			window.requestAnimationFrame(function () {
				window.requestAnimationFrame(syncAgentMappingFilterToPageSizeSelect);
			});
		} else {
			resetAgentMappingFilterSelectWidth();
			setCount();
		}
	}
	function syncDateConstraints() {
		var start = qs('audit-from-date');
		var end = qs('audit-to-date');
		if (start && start._flatpickr) start._flatpickr.set('maxDate', (end && end.value) || null);
		if (end && end._flatpickr) end._flatpickr.set('minDate', (start && start.value) || null);
	}
	function clearDateField(input) {
		if (!input) return;
		if (input._flatpickr) input._flatpickr.clear();
		input.value = '';
		syncDateConstraints();
	}
	function ensureTodayButton(instance) {
		var container = instance && instance.calendarContainer;
		var button;
		if (!container || container.querySelector('.fp-today-btn')) return;
		container.classList.add('access-request-calendar');
		button = document.createElement('button');
		button.type = 'button';
		button.className = 'fp-today-btn';
		button.textContent = '오늘';
		button.addEventListener('click', function () { instance.setDate(new Date(), true); });
		container.appendChild(button);
	}
	function initAuditDatePickers() {
		var start = qs('audit-from-date');
		var end = qs('audit-to-date');
		var locale;
		var opts;
		if (!window.flatpickr || !start || !end) return;
		try { window.flatpickr.localize(window.flatpickr.l10ns.ko); } catch (_) {}
		locale = (window.flatpickr.l10ns && window.flatpickr.l10ns.ko) || 'ko';
		opts = {
			locale: locale,
			dateFormat: 'Y-m-d',
			allowInput: false,
			disableMobile: true,
			monthSelectorType: 'static',
			onReady: function (_, __, instance) { ensureTodayButton(instance); },
			onOpen: function (_, __, instance) { ensureTodayButton(instance); },
			onChange: function () {
				syncDateConstraints();
				loadRows(true);
			}
		};
		window.flatpickr(start, opts);
		window.flatpickr(end, opts);
	}
	function resetFilters() {
		qs('audit-keyword-filter').value = '';
		setSearchClearVisible();
		clearDateField(qs('audit-from-date'));
		clearDateField(qs('audit-to-date'));
		loadRows(true);
	}
	function bindEvents() {
		var pageSize = qs('audit-page-size');
		var selectAll = qs('audit-select-all');
		var keyword = qs('audit-keyword-filter');
		var clear = qs('audit-search-clear');
		var agentPageSize = qs('agent-page-size');
		var agentKeyword = qs('agent-keyword-filter');
		var agentClear = qs('agent-search-clear');
		var agentMapping = qs('agent-mapping-filter');
		var agentReset = qs('agent-reset-btn');
		var agentBody = qs('agent-table-body');
		var modal = qs('agent-map-modal');
		var userSearch = qs('agent-user-search');
		var userResults = qs('agent-user-results');
		var agentTable = qs('agent-table');
		if (agentTable) {
			Array.prototype.forEach.call(agentTable.querySelectorAll('.agent-th-sortable[data-agent-sort]'), function (th) {
				th.setAttribute('tabindex', '0');
			});
			agentTable.addEventListener('click', function (event) {
				if (event.target.closest('#agent-select-all') || event.target.closest('input[type="checkbox"]')) return;
				var th = event.target.closest('.agent-th-sortable[data-agent-sort]');
				if (!th || !agentTable.contains(th)) return;
				handleAgentSortHeaderActivate(th.getAttribute('data-agent-sort'));
			});
			agentTable.addEventListener('keydown', function (event) {
				if (event.key !== 'Enter' && event.key !== ' ') return;
				var th = event.target.closest('.agent-th-sortable[data-agent-sort]');
				if (!th || !agentTable.contains(th)) return;
				event.preventDefault();
				handleAgentSortHeaderActivate(th.getAttribute('data-agent-sort'));
			});
		}
		qs('audit-reset-btn').addEventListener('click', resetFilters);
		if (qs('audit-download-btn')) qs('audit-download-btn').addEventListener('click', downloadCsv);
		if (keyword) {
			keyword.addEventListener('input', function () {
				setSearchClearVisible();
				loadRowsDebounced();
			});
			keyword.addEventListener('keydown', function (event) {
				if (event.key === 'Escape') resetFilters();
			});
		}
		if (clear) {
			clear.addEventListener('click', function () {
				qs('audit-keyword-filter').value = '';
				setSearchClearVisible();
				loadRows(true);
			});
		}
		Array.prototype.forEach.call(document.querySelectorAll('.audit-tabs [data-audit-scope]'), function (button) {
			button.addEventListener('click', function () {
				var nextScope = button.getAttribute('data-audit-scope') || 'access';
				showScope(nextScope);
			});
		});
		if (agentKeyword) {
			agentKeyword.addEventListener('input', function () {
				setAgentSearchClearVisible();
				loadAgentsDebounced();
			});
			agentKeyword.addEventListener('keydown', function (event) {
				if (event.key === 'Escape') {
					agentKeyword.value = '';
					setAgentSearchClearVisible();
					loadAgents(true);
				}
			});
		}
		if (agentClear) {
			agentClear.addEventListener('click', function () {
				if (agentKeyword) agentKeyword.value = '';
				setAgentSearchClearVisible();
				loadAgents(true);
			});
		}
		if (agentMapping) agentMapping.addEventListener('change', function () { loadAgents(true); });
		if (agentPageSize) {
			agentPageSize.addEventListener('change', function () {
				state.agentPageSize = safePageSize(agentPageSize.value);
				loadAgents(true).finally(function () { scheduleAgentMappingSelectWidthSync(); });
			});
		}
		window.addEventListener('resize', scheduleAgentMappingSelectWidthSync);
		if (agentReset) agentReset.addEventListener('click', resetAgentFilters);
		if (qs('agent-first')) qs('agent-first').addEventListener('click', function () {
			if (state.agentPage > 1) { state.agentPage = 1; loadAgents(false); }
		});
		if (qs('agent-prev')) qs('agent-prev').addEventListener('click', function () {
			if (state.agentPage > 1) { state.agentPage--; loadAgents(false); }
		});
		if (qs('agent-next')) qs('agent-next').addEventListener('click', function () {
			if (state.agentPage < agentTotalPages()) { state.agentPage++; loadAgents(false); }
		});
		if (qs('agent-last')) qs('agent-last').addEventListener('click', function () {
			var pages = agentTotalPages();
			if (state.agentPage < pages) { state.agentPage = pages; loadAgents(false); }
		});
		if (qs('agent-page-numbers')) {
			qs('agent-page-numbers').addEventListener('click', function (event) {
				var button = event.target.closest('.page-btn[data-page]');
				var page;
				if (!button) return;
				page = parseInt(button.getAttribute('data-page'), 10);
				if (page && page !== state.agentPage) { state.agentPage = page; loadAgents(false); }
			});
		}
		if (agentBody) {
			agentBody.addEventListener('change', function (event) {
				var cb = event.target.closest('.agent-row-check');
				if (!cb) return;
				var tr = cb.closest('tr');
				if (tr) tr.classList.toggle('selected', cb.checked);
				syncAgentSelectAll();
			});
			agentBody.addEventListener('click', function (event) {
				if (event.target.closest('.agent-row-check')) return;
				var tr = event.target.closest('tr[data-id]');
				if (!tr) return;
				var cbox = tr.querySelector('.agent-row-check');
				if (!cbox) return;
				cbox.checked = !cbox.checked;
				tr.classList.toggle('selected', cbox.checked);
				syncAgentSelectAll();
			});
		}
		if (qs('agent-map-close')) qs('agent-map-close').addEventListener('click', closeAgentMap);
		if (qs('agent-map-save')) qs('agent-map-save').addEventListener('click', saveAgentMapping);
		if (qs('agent-map-clear')) qs('agent-map-clear').addEventListener('click', function () { clearAgentMapping(); });
		if (modal) {
			modal.addEventListener('click', function (event) {
				if (event.target === modal) closeAgentMap();
			});
		}
		if (userSearch) {
			userSearch.addEventListener('input', loadMappingUsersDebounced);
			userSearch.addEventListener('keydown', function (event) {
				if (event.key === 'Enter') {
					event.preventDefault();
					loadMappingUsers();
				} else if (event.key === 'Escape') {
					closeAgentMap();
				}
			});
		}
		if (userResults) {
			userResults.addEventListener('click', function (event) {
				var row = event.target.closest('.agent-user-result-row[data-user-id]');
				if (!row) return;
				selectMappingUser(row.getAttribute('data-user-id'));
			});
			userResults.addEventListener('keydown', function (event) {
				if (event.key !== 'Enter' && event.key !== ' ') return;
				var row = event.target.closest('.agent-user-result-row[data-user-id]');
				if (!row) return;
				event.preventDefault();
				selectMappingUser(row.getAttribute('data-user-id'));
			});
		}
		var agentSelectAll = qs('agent-select-all');
		if (agentSelectAll) {
			agentSelectAll.addEventListener('change', function () {
				var checked = agentSelectAll.checked;
				Array.prototype.forEach.call(document.querySelectorAll('#agent-table-body tr[data-id]'), function (tr) {
					var cb = tr.querySelector('.agent-row-check');
					if (!cb) return;
					cb.checked = checked;
					tr.classList.toggle('selected', checked);
				});
				syncAgentSelectAll();
			});
		}
		var delModal = qs('system-delete-modal');
		if (delModal) {
			delModal.addEventListener('click', function (event) {
				var t = event.target;
				if (t.closest && t.closest('[data-modal-close="1"]')) { closeAgentBulkDeleteModal(); return; }
				if (t === delModal) closeAgentBulkDeleteModal();
			});
		}
		var delConfirm = qs('system-delete-confirm');
		if (delConfirm) delConfirm.addEventListener('click', performAgentBulkDelete);
		var pcDl = qs('agent-pc-download-modal');
		if (pcDl) {
			pcDl.addEventListener('click', function (event) {
				if (event.target === pcDl) closeAgentPcDownloadModal();
			});
		}
		if (qs('agent-pc-download-close')) qs('agent-pc-download-close').addEventListener('click', closeAgentPcDownloadModal);
		if (qs('agent-pc-download-confirm')) qs('agent-pc-download-confirm').addEventListener('click', function () {
			var selOpt = qs('agent-pc-csv-range-selected');
			var onlySel = !!(selOpt && selOpt.checked);
			closeAgentPcDownloadModal();
			downloadAgentCsv(onlySel);
		});
		if (qs('system-message-close')) qs('system-message-close').addEventListener('click', closeAuditMessageModal);
		if (qs('system-message-ok')) qs('system-message-ok').addEventListener('click', closeAuditMessageModal);
		var msgModal = qs('system-message-modal');
		if (msgModal) {
			msgModal.addEventListener('click', function (event) {
				if (event.target === msgModal) closeAuditMessageModal();
			});
		}
		document.addEventListener('keydown', function (event) {
			if (event.key !== 'Escape') return;
			var msgEl = qs('system-message-modal');
			if (msgEl && msgEl.classList.contains('show')) {
				closeAuditMessageModal();
				return;
			}
			var pcm = qs('agent-pc-download-modal');
			if (pcm && pcm.classList.contains('show')) {
				closeAgentPcDownloadModal();
				return;
			}
			var adm = qs('system-delete-modal');
			if (adm && adm.classList.contains('show')) {
				closeAgentBulkDeleteModal();
				return;
			}
			var gmap = qs('agent-map-modal');
			if (gmap && gmap.classList.contains('show')) closeAgentMap();
		});
		if (pageSize) {
			pageSize.addEventListener('change', function () {
				state.pageSize = safePageSize(pageSize.value);
				loadRows(true);
			});
		}
		qs('audit-first').addEventListener('click', function () {
			if (state.page > 1) { state.page = 1; loadRows(false); }
		});
		qs('audit-prev').addEventListener('click', function () {
			if (state.page > 1) { state.page--; loadRows(false); }
		});
		qs('audit-next').addEventListener('click', function () {
			if (state.page < totalPages()) { state.page++; loadRows(false); }
		});
		qs('audit-last').addEventListener('click', function () {
			var pages = totalPages();
			if (state.page < pages) { state.page = pages; loadRows(false); }
		});
		qs('audit-page-numbers').addEventListener('click', function (event) {
			var button = event.target.closest('.page-btn[data-page]');
			var page;
			if (!button) return;
			page = parseInt(button.getAttribute('data-page'), 10);
			if (page && page !== state.page) { state.page = page; loadRows(false); }
		});
		if (selectAll) {
			selectAll.addEventListener('change', function () {
				Array.prototype.forEach.call(document.querySelectorAll('.audit-row-check'), function (check) {
					check.checked = selectAll.checked;
				});
				syncSelectAll();
			});
		}
		qs('audit-table-body').addEventListener('change', function (event) {
			if (event.target && event.target.classList.contains('audit-row-check')) syncSelectAll();
		});
		document.body.addEventListener('click', function (event) {
			var pane = qs('agent-list-pane');
			if (!pane || pane.hidden) return;
			var tgt = event.target;
			if (!tgt || !tgt.closest) return;
			if (tgt.closest('#agent-download-btn')) {
				event.preventDefault();
				openAgentPcDownloadModal();
				return;
			}
			if (tgt.closest('#agent-delete-btn')) {
				openAgentBulkDeleteModal();
				return;
			}
			if (tgt.closest('#agent-map-toolbar-btn')) {
				var ids = getSelectedAgentIds();
				if (!ids.length) {
					showAuditMessage('PC 에이전트를 선택하세요.', '안내');
					return;
				}
				openAgentMapForSelection(ids);
			}
		});
	}
	document.addEventListener('DOMContentLoaded', function () {
		initAuditDatePickers();
		bindEvents();
		loadRows(true);
	});
})();
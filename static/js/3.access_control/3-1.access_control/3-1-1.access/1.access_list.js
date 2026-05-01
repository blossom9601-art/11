(function () {
	'use strict';

	var state = {
		rows: [],
		filtered: [],
		selectedId: null,
		detail: null,
		page: 1,
		pageSize: 8,
		category: '',
		activeEndpointIndex: 0,
		sshPanelOpen: false,
		revealedSecret: false
	};
	var initialized = false;

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
		opts.credentials = opts.credentials || 'same-origin';
		opts.cache = opts.cache || 'no-store';
		opts.headers = Object.assign({ 'Accept': 'application/json' }, csrfHeader(), opts.headers || {});
		return fetch(url, opts).then(function (res) {
			return res.json().catch(function () { return {}; }).then(function (data) {
				if (!res.ok || data.success === false) {
					throw new Error((data && (data.message || data.error)) || '요청 처리 중 오류가 발생했습니다.');
				}
				return data;
			});
		});
	}
	function postJson(url, data) {
		return fetchJson(url, {
			method: 'POST',
			headers: Object.assign({ 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, csrfHeader()),
			body: JSON.stringify(data || {})
		});
	}
	function requestUrl() { return '/p/access_control_request'; }
	function firstEndpoint(row) {
		var eps = row && row.endpoints ? row.endpoints : [];
		var i;
		if (!eps.length) return null;
		for (i = 0; i < eps.length; i++) if (eps[i].is_primary) return eps[i];
		return eps[0];
	}
	function endpointLabel(ep) {
		if (!ep) return '-';
		return ep.label || (ep.kind === 'SSH' ? 'SSH' : 'WEB');
	}
	function endpointTarget(ep) {
		if (!ep) return '-';
		if (ep.kind === 'WEB') return ep.url || ep.host || '-';
		return ep.host || ep.url || '-';
	}
	function endpointPort(ep) {
		if (!ep) return '';
		return ep.port || (ep.kind === 'SSH' ? 22 : (ep.protocol === 'HTTP' ? 80 : 443));
	}
	function uniqueKinds(row) {
		var seen = {};
		var out = [];
		(row.endpoints || []).forEach(function (ep) {
			var kind = ep.kind || '';
			if (kind && !seen[kind]) { seen[kind] = true; out.push(kind); }
		});
		return out;
	}
	function normalizeCategory(value) {
		return String(value || '').replace(/\s+/g, '').toLowerCase();
	}
	function categoryLabel(row) {
		var raw = normalizeCategory(row.category_name || row.category || '');
		if (raw === '내부서비스' || raw === 'internal' || raw.indexOf('내부') >= 0) return '내부 서비스';
		if (raw === '외부서비스' || raw === 'external' || raw === '웹' || raw === 'web' || raw.indexOf('외부') >= 0) return '외부 서비스';
		if (raw === '관리콘솔' || raw === 'adminconsole' || raw === 'console' || raw.indexOf('관리콘솔') >= 0 || raw.indexOf('콘솔') >= 0) return '관리 콘솔';
		if (raw === '기타' || raw === 'etc') return '기타';
		return '기타';
	}
	function kindChips(row) {
		var kinds = uniqueKinds(row);
		if (!kinds.length && row.primary_kind) kinds = [row.primary_kind];
		return kinds.map(function (kind) {
			return '<span class="endpoint-kind-tag kind-' + esc(kind) + '">' + esc(kind) + '</span>';
		}).join('');
	}
	function formatDate(value) { return value ? String(value).slice(0, 10) : '-'; }
	function formatDateTime(value) {
		if (!value) return '-';
		return String(value).replace('T', ' ').slice(0, 16);
	}
	function statusLabel(row) {
		var status = row.access_status || '';
		if (status === '만료') return '만료됨';
		return status || (row.can_access ? '사용 가능' : '만료됨');
	}
	function statusClass(row) {
		var status = statusLabel(row);
		if (status === '만료 예정') return 'status-badge ac-status-due';
		if (status === '만료됨') return 'status-badge ac-status-expired';
		if (status === '사용 가능') return 'status-badge ac-status-usable';
		return 'status-badge status-blocked';
	}
	function cardClass(row) {
		var cls = 'access-resource-card';
		if (String(row.id) === String(state.selectedId)) cls += ' is-selected';
		if (statusLabel(row) === '만료 예정') cls += ' is-due';
		if (statusLabel(row) === '만료됨' || !row.can_access) cls += ' is-expired';
		return cls;
	}
	function getSearchText(row) {
		var parts = [row.resource_name, row.description, row.resource_url, row.host_address, row.primary_url, row.category_name];
		(row.endpoints || []).forEach(function (ep) { parts.push(ep.label, ep.kind, ep.protocol, ep.host, ep.url, ep.url_path); });
		return parts.join(' ').toLowerCase();
	}
	function applyFilters() {
		var search = (qs('access-search-name').value || '').trim().toLowerCase();
		var kind = (qs('access-type-filter').value || '').trim();
		var status = (qs('access-status-filter').value || '').trim();
		var category = state.category || '';
		state.filtered = state.rows.filter(function (row) {
			if (search && getSearchText(row).indexOf(search) === -1) return false;
			if (category && categoryLabel(row) !== category) return false;
			if (kind && uniqueKinds(row).indexOf(kind) === -1 && row.primary_kind !== kind) return false;
			if (status && statusLabel(row) !== status) return false;
			return true;
		});
		state.page = 1;
	}
	function totalPages() { return Math.max(1, Math.ceil(state.filtered.length / state.pageSize)); }
	function currentRows() {
		var start = (state.page - 1) * state.pageSize;
		return state.filtered.slice(start, start + state.pageSize);
	}
	function setStateMessage(html) {
		var box = qs('access-state');
		box.innerHTML = html;
		box.hidden = false;
		qs('access-resource-list').innerHTML = '';
		qs('access-pagination').hidden = true;
	}
	function renderPagination() {
		var wrap = qs('access-pagination');
		var pages = totalPages();
		wrap.hidden = state.filtered.length <= state.pageSize;
		qs('access-prev').disabled = state.page <= 1;
		qs('access-next').disabled = state.page >= pages;
		if (!state.filtered.length) qs('access-pagination-info').textContent = '0개 항목';
		else {
			var start = (state.page - 1) * state.pageSize + 1;
			var end = Math.min(state.filtered.length, state.page * state.pageSize);
			qs('access-pagination-info').textContent = start + '-' + end + ' / ' + state.filtered.length + '개 항목';
		}
	}
	function syncCategoryTabs() {
		var tabs = document.querySelectorAll('.access-category-tabs .system-tab-btn[data-category]');
		Array.prototype.forEach.call(tabs, function (button) {
			var active = (button.getAttribute('data-category') || '') === (state.category || '');
			button.classList.toggle('active', active);
			button.setAttribute('aria-selected', active ? 'true' : 'false');
		});
	}
	function renderList() {
		var countEl = qs('access-total');
		var prev;
		var next = state.filtered.length;
		if (countEl) {
			prev = parseInt(countEl.getAttribute('data-count') || (countEl.textContent || '0').replace(/,/g, ''), 10) || 0;
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
		if (!state.filtered.length) {
			setStateMessage('<strong>접속 가능한 자원이 없습니다</strong><span>필요한 자원이 보이지 않으면 접근 권한을 신청하세요.</span><a class="action-chip action-primary" href="' + requestUrl() + '">접근 권한 신청하기</a>');
			return;
		}
		qs('access-state').hidden = true;
		qs('access-resource-list').innerHTML = currentRows().map(function (row) {
			var ep = firstEndpoint(row);
			var epIndex = Math.max(0, (row.endpoints || []).indexOf(ep));
			var disabled = !row.can_access || statusLabel(row) === '만료됨' || !ep;
			return '' +
				'<article class="' + cardClass(row) + '" data-id="' + esc(row.id) + '" role="listitem" tabindex="0">' +
					'<div class="access-card-main">' +
						'<div class="access-card-titleline">' +
							'<h3>' + esc(row.resource_name || '-') + '</h3>' +
						'</div>' +
						'<div class="access-card-endpoint">' +
							'<span class="access-kind-stack">' + kindChips(row) + '</span>' +
							'<span class="access-endpoint-target">' + esc(endpointTarget(ep)) + '</span>' +
						'</div>' +
						'<div class="access-card-meta">' +
							'<span>만료일 ' + esc(formatDate(row.grant_end_date)) + '</span>' +
							'<span>최근 접속 ' + esc(formatDateTime(row.last_accessed_at)) + '</span>' +
						'</div>' +
					'</div>' +
					'<div class="access-card-side">' +
						'<div class="access-card-actions">' +
							'<button type="button" class="action-chip action-primary" data-action="connect" data-id="' + esc(row.id) + '" data-ep-idx="' + epIndex + '"' + (disabled ? ' disabled' : '') + '>' +
								'<img src="/static/image/svg/control/free-icon-font-door-open.svg" alt="" class="ac-action-icon" aria-hidden="true"><span>접속</span>' +
							'</button>' +
							'<button type="button" class="action-chip action-muted" data-action="detail" data-id="' + esc(row.id) + '">상세 보기</button>' +
						'</div>' +
					'</div>' +
				'</article>';
		}).join('');
		renderPagination();
	}
	function renderLoadingDetail() {
		qs('access-detail-panel').innerHTML = '<div class="access-empty-state access-empty-state--compact"><strong>상세 정보를 불러오는 중입니다.</strong><span>접속 권한과 최근 로그를 확인하고 있습니다.</span></div>';
	}
	function renderNoSelection() {
		qs('access-detail-panel').innerHTML = '<div class="access-empty-state access-empty-state--compact"><strong>접속할 자원을 선택하세요.</strong><span>왼쪽 목록에서 행을 클릭하면 접속 액션과 권한 정보가 표시됩니다.</span></div>';
	}
	function detailRow(label, value) {
		return '<div class="ac-info-row"><span>' + esc(label) + '</span><strong>' + value + '</strong></div>';
	}
	function parseConnectionOptions(raw) {
		var text = String(raw || '').trim();
		var out = {};
		if (!text) return out;
		try {
			var parsed = JSON.parse(text);
			if (parsed && typeof parsed === 'object') return parsed;
		} catch (_) {}
		text.split(/[;\n,]+/).forEach(function (part) {
			var pair = part.split('=');
			if (pair.length >= 2) out[pair.shift().trim()] = pair.join('=').trim();
		});
		return out;
	}
	function credentialInfo(item) {
		var opts = parseConnectionOptions(item.connection_options);
		var authRaw = opts.auth_method || opts.authMethod || opts.authentication || opts.auth || '';
		var password = opts.password || opts.secret || opts.pass || '';
		var keyName = opts.key_name || opts.keyName || opts.key_path || opts.keyPath || opts.private_key_name || '';
		return {
			username: opts.username || opts.user || opts.login_account || item.login_account || '',
			authMethod: authRaw || (keyName ? '키' : (password ? '비밀번호' : '관리자 지정')),
			password: password,
			keyName: keyName
		};
	}
	function sshCommand(item, ep) {
		var cred = credentialInfo(item);
		var userPart = cred.username ? (cred.username + '@') : '';
		var port = endpointPort(ep);
		return 'ssh ' + userPart + (ep.host || '') + (port && Number(port) !== 22 ? ' -p ' + port : '');
	}
	function sshUrl(ep) {
		var port = endpointPort(ep);
		return ep.url || ('ssh://' + (ep.host || '') + (port && Number(port) !== 22 ? ':' + port : ''));
	}
	function renderEndpointButtons(item) {
		var eps = item.endpoints || [];
		if (!eps.length) return '<div class="ac-muted-box">등록된 접속점이 없습니다.</div>';
		return '<div class="access-endpoint-tabs">' + eps.map(function (ep, idx) {
			return '<button type="button" class="access-endpoint-tab' + (idx === state.activeEndpointIndex ? ' active' : '') + '" data-action="select-endpoint" data-ep-idx="' + idx + '">' +
				'<span class="endpoint-kind-tag kind-' + esc(ep.kind || '') + '">' + esc(ep.kind || '-') + '</span>' +
				'<span>' + esc(endpointLabel(ep)) + '</span>' +
			'</button>';
		}).join('') + '</div>';
	}
	function renderAccessAction(item, ep, idx) {
		var cred, hasSecret, secretText;
		if (!ep) return '<div class="ac-action-box is-disabled"><strong>접속점이 없습니다.</strong><p>관리자에게 자원 접속점을 등록해 달라고 요청하세요.</p></div>';
		if (!item.can_access || statusLabel(item) === '만료됨') {
			return '<div class="ac-action-box is-disabled"><strong>권한이 만료되었습니다.</strong><p>다시 접속하려면 접근 권한을 신청하세요.</p><a class="action-chip action-primary" href="' + requestUrl() + '?resource_id=' + esc(item.id) + '">접근 권한 신청하기</a></div>';
		}
		if (ep.kind === 'WEB') {
			return '<div class="ac-action-box ac-action-box--web">' +
				'<div><strong>WEB 접속</strong><span class="access-target-text">' + esc(ep.url || endpointTarget(ep)) + '</span></div>' +
				'<button type="button" class="action-chip action-primary action-chip-lg" data-action="connect" data-id="' + esc(item.id) + '" data-ep-idx="' + idx + '">' +
					'<img src="/static/image/svg/control/free-icon-font-door-open.svg" alt="" class="ac-action-icon" aria-hidden="true"><span>접속</span>' +
				'</button>' +
			'</div>';
		}
		if (!state.sshPanelOpen) {
			return '<div class="ac-action-box ac-action-box--ssh">' +
				'<div><strong>SSH 접속</strong><p>접속 버튼을 누르면 IP, 포트, 계정, 인증 방식이 표시되고 접속 로그가 기록됩니다.</p><span class="access-target-text">' + esc(ep.host || '-') + ':' + esc(endpointPort(ep) || '-') + '</span></div>' +
				'<button type="button" class="action-chip action-primary action-chip-lg" data-action="connect" data-id="' + esc(item.id) + '" data-ep-idx="' + idx + '">' +
					'<img src="/static/image/svg/control/free-icon-font-door-open.svg" alt="" class="ac-action-icon" aria-hidden="true"><span>접속</span>' +
				'</button>' +
			'</div>';
		}
		cred = credentialInfo(item);
		hasSecret = !!cred.password;
		secretText = hasSecret ? (state.revealedSecret ? cred.password : '••••••••') : '등록된 비밀번호 없음';
		return '<div class="ac-ssh-panel">' +
			'<div class="ac-ssh-panel-head"><strong>SSH 접속 정보</strong><span>로그 기록 완료</span></div>' +
			'<div class="ac-ssh-grid">' +
				detailRow('IP', esc(ep.host || '-')) +
				detailRow('Port', esc(endpointPort(ep) || '-')) +
				detailRow('ID', esc(cred.username || '-')) +
				detailRow('인증 방식', esc(cred.authMethod || '-')) +
				detailRow('비밀번호', '<span class="ac-secret-value">' + esc(secretText) + '</span> <button type="button" class="ac-inline-btn" data-action="toggle-secret"' + (hasSecret ? '' : ' disabled') + '>' + (state.revealedSecret ? '숨김' : '보기') + '</button>') +
			'</div>' +
			'<div class="ac-ssh-actions">' +
				'<button type="button" class="action-chip action-primary" data-action="execute-ssh"><img src="/static/image/svg/agent/free-icon-font-play.svg" alt="" class="ac-action-icon" aria-hidden="true"><span>접속 실행</span></button>' +
				'<button type="button" class="action-chip action-secondary" data-action="copy-ssh"><img src="/static/image/svg/list/free-icon-copy.svg" alt="" class="ac-action-icon ac-action-icon-dark" aria-hidden="true"><span>복사</span></button>' +
			'</div>' +
		'</div>';
	}
	function renderLogs(item) {
		var summary = item.access_log_summary || {};
		var logs = summary.recent_logs || [];
		if (!logs.length) return '<div class="ac-muted-box">아직 접속 로그가 없습니다.</div>';
		return '<div class="ac-log-list">' + logs.map(function (log) {
			return '<div class="ac-log-row"><span>' + esc(formatDateTime(log.occurred_at)) + '</span><strong>' + esc(log.ip_address || '-') + '</strong></div>';
		}).join('') + '</div>';
	}
	function renderDetail(item) {
		var eps, ep, epIdx, summary, description, caution, approver, html;
		if (!item || !item.id) { renderNoSelection(); return; }
		eps = item.endpoints || [];
		if (state.activeEndpointIndex >= eps.length) state.activeEndpointIndex = 0;
		ep = eps[state.activeEndpointIndex] || firstEndpoint(item);
		epIdx = Math.max(0, eps.indexOf(ep));
		summary = item.access_log_summary || {};
		description = item.description || '등록된 설명이 없습니다.';
		caution = item.caution_text || '업무 목적에 맞는 범위에서만 접속하세요.';
		approver = item.granted_by_name || item.granted_by_emp_no || '-';
		html = '' +
			'<div class="access-detail-hero">' +
				'<div><h3>' + esc(item.resource_name || '-') + '</h3><p>' + esc(description) + '</p></div>' +
			'</div>' +
			renderEndpointButtons(item) +
			renderAccessAction(item, ep, epIdx) +
			'<section class="ac-detail-section"><h4>자원 기본 정보</h4><div class="ac-info-grid">' +
				detailRow('자원명', esc(item.resource_name || '-')) +
				detailRow('유형', kindChips(item) || '-') +
				detailRow('URL / IP', esc(endpointTarget(ep))) +
				detailRow('설명', esc(description)) +
			'</div></section>' +
			'<section class="ac-detail-section"><h4>접속 정보</h4><div class="ac-info-grid">' +
				detailRow('접속 방법', esc(ep && ep.kind === 'SSH' ? 'SSH 클라이언트 사용' : '브라우저 새 탭')) +
				detailRow('계정 정보', esc(credentialInfo(item).username || '자원 정책에 따름')) +
				detailRow('주의사항', esc(caution)) +
			'</div></section>' +
			'<section class="ac-detail-section"><h4>권한 정보</h4><div class="ac-info-grid">' +
				detailRow('승인일', esc(formatDate(item.approved_at || item.grant_start_date))) +
				detailRow('만료일', esc(formatDate(item.grant_end_date))) +
				detailRow('승인자', esc(approver)) +
			'</div></section>' +
			'<section class="ac-detail-section"><h4>접속 로그</h4><div class="ac-info-grid ac-log-summary">' +
				detailRow('최근 접속 시간', esc(formatDateTime(summary.recent_accessed_at || item.last_accessed_at))) +
				detailRow('접속 횟수', esc(summary.access_count || 0) + '회') +
			'</div>' + renderLogs(item) + '</section>';
		qs('access-detail-panel').innerHTML = html;
	}
	function selectResource(id, endpointIndex, sshOpen) {
		state.selectedId = id;
		state.activeEndpointIndex = endpointIndex || 0;
		state.sshPanelOpen = !!sshOpen;
		state.revealedSecret = false;
		renderList();
		renderLoadingDetail();
		fetchJson('/api/access-control/resources/' + encodeURIComponent(id) + '?scope=accessible')
			.then(function (data) {
				state.detail = data.item || {};
				renderDetail(state.detail);
			})
			.catch(function (err) {
				qs('access-detail-panel').innerHTML = '<div class="access-empty-state access-empty-state--compact"><strong>상세 정보를 불러오지 못했습니다.</strong><span>' + esc(err.message) + '</span></div>';
			});
	}
	function recordAccess(id, ep) {
		return postJson('/api/access-control/resources/' + encodeURIComponent(id) + '/access', { endpoint_id: ep && ep.id });
	}
	function connectEndpoint(id, epIdx) {
		var row = state.rows.filter(function (item) { return String(item.id) === String(id); })[0] || state.detail;
		var eps, ep;
		if (!row) return;
		eps = row.endpoints || [];
		ep = eps[epIdx] || firstEndpoint(row);
		if (!ep) { window.alert('등록된 접속점이 없습니다.'); return; }
		if (!row.can_access || statusLabel(row) === '만료됨') { selectResource(id, epIdx, false); return; }
		recordAccess(id, ep).then(function () {
			if (ep.kind === 'WEB') {
				window.open(ep.url || endpointTarget(ep), '_blank', 'noopener');
				loadRows(true);
				return;
			}
			selectResource(id, epIdx, true);
			loadRows(true);
		}).catch(function (err) { window.alert(err.message); });
	}
	function loadRows(keepSelection) {
		return fetchJson('/api/access-control/resources?scope=accessible')
			.then(function (data) {
				var keep, hit;
				state.rows = data.rows || [];
				applyFilters();
				keep = keepSelection ? state.selectedId : null;
				hit = keep && state.filtered.filter(function (row) { return String(row.id) === String(keep); })[0];
				renderList();
				if (hit) return;
				if (state.filtered.length) selectResource(state.filtered[0].id, 0, false);
				else { state.selectedId = null; state.detail = null; renderNoSelection(); }
			})
			.catch(function (err) {
				setStateMessage('<strong>자원 목록을 불러오지 못했습니다.</strong><span>' + esc(err.message) + '</span>');
				renderNoSelection();
			});
	}
	function copyText(text) {
		if (navigator.clipboard && navigator.clipboard.writeText) {
			return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; });
		}
		window.prompt('아래 내용을 복사하세요.', text);
		return Promise.resolve(true);
	}
	function handleDetailAction(event) {
		var btn = event.target.closest('[data-action]');
		var action, ep;
		if (!btn || !state.detail) return;
		action = btn.getAttribute('data-action');
		if (action === 'select-endpoint') {
			state.activeEndpointIndex = parseInt(btn.getAttribute('data-ep-idx'), 10) || 0;
			state.sshPanelOpen = false;
			state.revealedSecret = false;
			renderDetail(state.detail);
			return;
		}
		if (action === 'connect') {
			connectEndpoint(btn.getAttribute('data-id'), parseInt(btn.getAttribute('data-ep-idx'), 10) || 0);
			return;
		}
		if (action === 'toggle-secret') {
			state.revealedSecret = !state.revealedSecret;
			renderDetail(state.detail);
			return;
		}
		ep = (state.detail.endpoints || [])[state.activeEndpointIndex] || firstEndpoint(state.detail);
		if (!ep) return;
		if (action === 'copy-ssh') {
			copyText(sshCommand(state.detail, ep)).then(function () { btn.classList.add('is-copied'); window.setTimeout(function () { btn.classList.remove('is-copied'); }, 900); });
			return;
		}
		if (action === 'execute-ssh') window.open(sshUrl(ep), '_blank', 'noopener');
	}
	function syncFilterSelection() {
		applyFilters();
		renderList();
		if (state.filtered.length && !state.filtered.some(function (row) { return String(row.id) === String(state.selectedId); })) selectResource(state.filtered[0].id, 0, false);
		if (!state.filtered.length) { state.selectedId = null; renderNoSelection(); }
	}
	function bindEvents() {
		var filter = qs('access-filter-form');
		if (filter.dataset.bound === '1') return;
		filter.dataset.bound = '1';
		filter.addEventListener('input', syncFilterSelection);
		filter.addEventListener('change', syncFilterSelection);
		Array.prototype.forEach.call(document.querySelectorAll('.access-category-tabs .system-tab-btn[data-category]'), function (button) {
			button.addEventListener('click', function () {
				state.category = button.getAttribute('data-category') || '';
				syncCategoryTabs();
				syncFilterSelection();
			});
		});
		qs('access-resource-list').addEventListener('click', function (event) {
			var btn = event.target.closest('[data-action]');
			var card;
			if (btn) {
				event.stopPropagation();
				if (btn.getAttribute('data-action') === 'connect') connectEndpoint(btn.getAttribute('data-id'), parseInt(btn.getAttribute('data-ep-idx'), 10) || 0);
				else selectResource(btn.getAttribute('data-id'), 0, false);
				return;
			}
			card = event.target.closest('.access-resource-card[data-id]');
			if (card) selectResource(card.getAttribute('data-id'), 0, false);
		});
		qs('access-resource-list').addEventListener('keydown', function (event) {
			var card;
			if (event.key !== 'Enter' && event.key !== ' ') return;
			card = event.target.closest('.access-resource-card[data-id]');
			if (!card) return;
			event.preventDefault();
			selectResource(card.getAttribute('data-id'), 0, false);
		});
		qs('access-detail-panel').addEventListener('click', handleDetailAction);
		qs('access-prev').addEventListener('click', function () { if (state.page > 1) { state.page--; renderList(); } });
		qs('access-next').addEventListener('click', function () { if (state.page < totalPages()) { state.page++; renderList(); } });
	}
	function init() {
		if (initialized) return;
		initialized = true;
		bindEvents();
		syncCategoryTabs();
		loadRows(false);
	}
	document.addEventListener('DOMContentLoaded', init);
	if (document.readyState === 'interactive' || document.readyState === 'complete') {
		try { init(); } catch (e) { console.error('[access_list init]', e); }
	}
})();
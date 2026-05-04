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
		sshCredentialsUnlocked: false,
		pendingSshAuditId: null,
		webAuditPollers: [],
		webAuditOrphans: [],
		browsePolicy: null,
		browsePolicyLoaded: false,
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
	function stripWrappingQuotes(s) {
		s = String(s == null ? '' : s).trim();
		if (s.length >= 2 && s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') return s.slice(1, -1).trim();
		if (s.length >= 2 && s.charAt(0) === "'" && s.charAt(s.length - 1) === "'") return s.slice(1, -1).trim();
		return s;
	}
	function normalizeSshUser(raw) {
		var s = raw == null ? '' : String(raw).trim();
		if (!s) return '';
		var prev = '';
		while (s !== prev) {
			prev = s;
			s = stripWrappingQuotes(s);
			if (s.length >= 2 && s.charAt(0) === '\u201c' && s.charAt(s.length - 1) === '\u201d') s = s.slice(1, -1).trim();
			if (s.length >= 2 && s.charAt(0) === '\u2018' && s.charAt(s.length - 1) === '\u2019') s = s.slice(1, -1).trim();
		}
		return s;
	}
	function normalizeSshPassword(raw) {
		var s = raw == null ? '' : String(raw).trim();
		if (!s) return '';
		var prev = '';
		while (s !== prev) {
			prev = s;
			s = stripWrappingQuotes(s);
			if (s.length >= 2 && s.charAt(0) === '\u201c' && s.charAt(s.length - 1) === '\u201d') s = s.slice(1, -1).trim();
			if (s.length >= 2 && s.charAt(0) === '\u2018' && s.charAt(s.length - 1) === '\u2019') s = s.slice(1, -1).trim();
		}
		return s;
	}
	/** 브라우저 → blossom-ssh URL에만 사용(브라우저 기록·프록시 노출 가능). 데스크톱 IPC 경로에서는 쓰지 않음. */
	function utf8ToBase64Url(s) {
		var utf8 = new TextEncoder().encode(String(s));
		var bin = '';
		var i;
		for (i = 0; i < utf8.length; i++) bin += String.fromCharCode(utf8[i]);
		var b64 = btoa(bin);
		return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
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
	function formatCounter(value) {
		var n = Number(value) || 0;
		try { return n.toLocaleString('ko-KR'); }
		catch (_) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
	}
	function statusLabel(row) {
		var status = row.access_status || '';
		if (status === '만료') return '만료됨';
		if (status === '시작 전') return '시작 전';
		return status || (row.can_access ? '사용 가능' : '만료됨');
	}
	function statusClass(row) {
		var status = statusLabel(row);
		if (status === '만료 예정') return 'status-badge ac-status-due';
		if (status === '시작 전') return 'status-badge ac-status-scheduled';
		if (status === '만료됨') return 'status-badge ac-status-expired';
		if (status === '사용 가능') return 'status-badge ac-status-usable';
		return 'status-badge status-blocked';
	}
	function cardClass(row) {
		var cls = 'access-resource-card';
		var st = statusLabel(row);
		if (String(row.id) === String(state.selectedId)) cls += ' is-selected';
		if (st === '만료 예정') cls += ' is-due';
		if (st === '시작 전') cls += ' is-scheduled';
		if (st === '만료됨' || (!row.can_access && st !== '시작 전')) cls += ' is-expired';
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
		box.style.display = '';
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
		var displayCount;
		if (countEl) {
			prev = parseInt(countEl.getAttribute('data-count') || (countEl.textContent || '0').replace(/,/g, ''), 10) || 0;
			displayCount = formatCounter(next);
			countEl.textContent = displayCount;
			countEl.setAttribute('data-count', String(next));
			countEl.setAttribute('aria-label', displayCount + '개');
			countEl.classList.remove('large-number', 'very-large-number', 'huge-number');
			if (next >= 100000) countEl.classList.add('huge-number');
			else if (next >= 1000) countEl.classList.add('very-large-number');
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
		qs('access-state').style.display = 'none';
		qs('access-resource-list').innerHTML = currentRows().map(function (row) {
			var ep = firstEndpoint(row);
			var epIndex = Math.max(0, (row.endpoints || []).indexOf(ep));
			var disabled = !row.can_access || statusLabel(row) === '만료됨' || statusLabel(row) === '시작 전' || !ep;
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
		qs('access-detail-panel').innerHTML = '<div class="access-empty-state access-empty-state--compact"><strong>상세 정보를 불러오는 중입니다.</strong><span>접속 권한과 상세 정보를 확인하고 있습니다.</span></div>';
	}
	function renderNoSelection() {
		qs('access-detail-panel').innerHTML = '<div class="access-empty-state access-empty-state--compact"><strong>접속할 자원을 선택하세요.</strong><span>왼쪽 목록에서 행을 클릭하면 접속 액션과 권한 정보가 표시됩니다.</span></div>';
	}
	function detailRow(label, value) {
		return '<div class="ac-info-row"><span>' + esc(label) + '</span><div class="ac-info-value">' + value + '</div></div>';
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
		var password = opts.password || opts.secret || opts.pass || '';
		var username = opts.username || opts.user || opts.login_account || item.login_account || '';
		return {
			username: normalizeSshUser(username),
			password: normalizeSshPassword(password),
		};
	}
	function sshUrl(ep) {
		var port = endpointPort(ep);
		return ep.url || ('ssh://' + (ep.host || '') + (port && Number(port) !== 22 ? ':' + port : ''));
	}
	function endpointTabCaption(ep) {
		if (!ep) return '-';
		var lbl = String(ep.label || '').trim();
		if (lbl && lbl !== '-') return lbl;
		var kind = String(ep.kind || '').toUpperCase();
		if (kind === 'SSH') {
			var p = endpointPort(ep);
			var h = ep.host || '-';
			return h + (p && Number(p) !== 22 ? ':' + p : '');
		}
		return ep.url || ep.host || kind || '-';
	}
	function renderEndpointButtons(item) {
		var eps = item.endpoints || [];
		if (!eps.length) return '<div class="ac-muted-box">등록된 접속점이 없습니다.</div>';
		if (eps.length === 1) return '';
		return '<div class="access-endpoint-tabs">' + eps.map(function (ep, idx) {
			return '<button type="button" class="access-endpoint-tab' + (idx === state.activeEndpointIndex ? ' active' : '') + '" data-action="select-endpoint" data-ep-idx="' + idx + '">' +
				'<span class="access-endpoint-tab-caption">' + esc(endpointTabCaption(ep)) + '</span>' +
			'</button>';
		}).join('') + '</div>';
	}
	function renderAccessAction(item, ep, idx) {
		var cred, credFields, sshHeadStatus, sshPrimaryBtn;
		if (!ep) return '<div class="ac-action-box is-disabled"><strong>접속점이 없습니다.</strong><p>관리자에게 자원 접속점을 등록해 달라고 요청하세요.</p></div>';
		if (statusLabel(item) === '시작 전') {
			return '<div class="ac-action-box is-disabled"><strong>아직 접속 시작일 전입니다.</strong><p>권한의 <strong>사용 시작일</strong>(' + esc(formatDate(item.grant_start_date)) + ') 이후부터 접속할 수 있습니다. (기준: 한국 시간)</p><a class="action-chip action-muted" href="' + requestUrl() + '">신청 내역 보기</a></div>';
		}
		if (!item.can_access || statusLabel(item) === '만료됨') {
			return '<div class="ac-action-box is-disabled"><strong>권한이 만료되었습니다.</strong><p>다시 접속하려면 접근 권한을 신청하세요.</p><a class="action-chip action-primary" href="' + requestUrl() + '?resource_id=' + esc(item.id) + '">접근 권한 신청하기</a></div>';
		}
		if (ep.kind === 'WEB') {
			return '<div class="ac-action-box ac-action-box--web">' +
				'<div class="ac-web-action-main">' +
					'<div><strong>WEB 접속</strong><span class="access-target-text">' + esc(ep.url || endpointTarget(ep)) + '</span></div>' +
				'</div>' +
				'<button type="button" class="action-chip action-primary action-chip-lg" data-action="connect" data-id="' + esc(item.id) + '" data-ep-idx="' + idx + '">' +
					'<img src="/static/image/svg/control/free-icon-font-door-open.svg" alt="" class="ac-action-icon" aria-hidden="true"><span>접속</span>' +
				'</button>' +
			'</div>';
		}
		cred = credentialInfo(item);
		credFields = '';
		if (state.sshCredentialsUnlocked) {
			credFields =
				detailRow('Username', '<input type="text" class="ac-ssh-input" data-ssh-field="user" name="ssh-user" autocomplete="username" value="' + esc(cred.username || '') + '">') +
				detailRow('Password', '<div class="ac-ssh-input-row"><input type="password" class="ac-ssh-input" data-ssh-field="password" name="ssh-password" autocomplete="current-password" value="' + esc(cred.password || '') + '"><button type="button" class="ac-inline-btn" data-action="toggle-ssh-password-vis">보기</button></div>');
		}
		sshHeadStatus = state.pendingSshAuditId
			? '<span class="ac-ssh-status-done">로그 기록 완료</span>'
			: '<span class="ac-ssh-status-pending">접속을 눌러 감사 로그를 남깁니다</span>';
		sshPrimaryBtn =
			'<button type="button" class="action-chip action-primary action-chip-lg" data-action="' +
			(state.pendingSshAuditId ? 'execute-ssh' : 'connect') +
			'" data-id="' + esc(item.id) + '" data-ep-idx="' + idx + '">' +
			'<img src="/static/image/svg/control/free-icon-font-door-open.svg" alt="" class="ac-action-icon" aria-hidden="true"><span>접속</span>' +
			'</button>';
		return '<div class="ac-ssh-panel">' +
			'<div class="ac-ssh-panel-head"><strong>SSH 접속 정보</strong>' + sshHeadStatus + '</div>' +
			'<div class="ac-ssh-grid">' +
				detailRow('IP', esc(ep.host || '-')) +
				detailRow('Port', esc(endpointPort(ep) || '-')) +
				credFields +
			'</div>' +
			'<div class="ac-ssh-cred-toolbar">' +
				'<span class="ac-ssh-cred-hint">변경이 필요할 때만 편집을 누르세요.</span>' +
				'<button type="button" class="action-chip action-muted" data-action="unlock-ssh-credentials"' + (state.sshCredentialsUnlocked ? ' disabled' : '') + '>계정·비밀번호 편집</button>' +
			'</div>' +
			'<div class="ac-ssh-actions">' +
				sshPrimaryBtn +
			'</div>' +
		'</div>';
	}
	function renderDetail(item) {
		var eps, ep, epIdx, description, approver, html;
		if (!item || !item.id) { renderNoSelection(); return; }
		eps = item.endpoints || [];
		if (state.activeEndpointIndex >= eps.length) state.activeEndpointIndex = 0;
		ep = eps[state.activeEndpointIndex] || firstEndpoint(item);
		epIdx = Math.max(0, eps.indexOf(ep));
		description = item.description || '등록된 설명이 없습니다.';
		approver = item.granted_by_name || item.granted_by_emp_no || '-';
		html = '' +
			'<div class="access-detail-hero">' +
				'<div><h3>' + esc(item.resource_name || '-') + '</h3><p>' + esc(description) + '</p></div>' +
			'</div>' +
			renderEndpointButtons(item) +
			renderAccessAction(item, ep, epIdx) +
			'<section class="ac-detail-section"><h4>권한 정보</h4><div class="ac-info-grid">' +
				detailRow('승인일', esc(formatDate(item.approved_at))) +
				detailRow('사용 시작일', esc(formatDate(item.grant_start_date))) +
				detailRow('만료일', esc(formatDate(item.grant_end_date))) +
				detailRow('승인자', esc(approver)) +
			'</div></section>';
		qs('access-detail-panel').innerHTML = html;
	}
	function postSshSessionEnd(auditId, keepalive) {
		if (!auditId) return;
		return fetch('/api/access-control/audit-logs/' + encodeURIComponent(auditId) + '/session-end', {
			method: 'POST',
			credentials: 'same-origin',
			headers: Object.assign({ 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, csrfHeader()),
			body: '{}',
			keepalive: !!keepalive
		}).catch(function () {});
	}
	function removeWebAuditPoller(auditId) {
		state.webAuditPollers = state.webAuditPollers.filter(function (p) {
			return String(p.auditId) !== String(auditId);
		});
	}
	function clearAllWebAccessSessions(keepalive) {
		state.webAuditPollers.forEach(function (p) {
			try { clearInterval(p.timerId); } catch (_) {}
			postSshSessionEnd(p.auditId, keepalive);
		});
		state.webAuditPollers = [];
		state.webAuditOrphans.forEach(function (id) {
			postSshSessionEnd(id, keepalive);
		});
		state.webAuditOrphans = [];
	}
	function registerWebTabSessionEnd(auditId, win) {
		if (!auditId) return;
		if (!win || typeof win.closed !== 'boolean') {
			state.webAuditOrphans.push(auditId);
			return;
		}
		var timerId = setInterval(function () {
			try {
				if (win.closed) {
					clearInterval(timerId);
					removeWebAuditPoller(auditId);
					postSshSessionEnd(auditId, false);
				}
			} catch (_) {
				clearInterval(timerId);
				removeWebAuditPoller(auditId);
				postSshSessionEnd(auditId, false);
			}
		}, 1200);
		state.webAuditPollers.push({ auditId: auditId, timerId: timerId });
	}
	function postAuditConnectionOutcome(auditId, ok, reason) {
		if (!auditId) return Promise.resolve();
		return postJson('/api/access-control/audit-logs/' + encodeURIComponent(auditId) + '/connection-outcome', {
			ok: !!ok,
			reason: reason != null ? String(reason).slice(0, 512) : ''
		}).catch(function () {});
	}
	/** Windows SSH: Blossom Chat preload가 있으면 IPC(openSsh) 우선 — 없으면 OS의 blossom-ssh:// 로 PuTTY (Lumina Gate PC 에이전트 또는 Blossom 설치 프로그램이 등록). */
	function launchSshSession(item, ep, auditId) {
		if (!item || !ep || String(ep.kind || '').toUpperCase() !== 'SSH') return;
		var aid = auditId != null ? auditId : state.pendingSshAuditId;
		if (!/Windows/i.test(navigator.userAgent || '')) {
			window.location.href = sshUrl(ep);
			return;
		}
		var form;
		var panelEl = qs('access-detail-panel');
		var panel = panelEl && panelEl.querySelector('.ac-ssh-panel');
		var detailMatches = state.detail && item.id != null && String(state.detail.id) === String(item.id);
		if (state.sshCredentialsUnlocked && panel && detailMatches) {
			form = readSshFormFromPanel(panel);
		} else {
			var stored = credentialInfo(item);
			form = {
				user: normalizeSshUser((stored.username || '').trim()),
				password: normalizeSshPassword((stored.password || '').trim()),
			};
		}
		var chain = Promise.resolve();
		if (aid && form.user) {
			chain = postJson('/api/access-control/audit-logs/' + encodeURIComponent(aid) + '/connect-account', { connect_account: form.user }).catch(function () { return null; });
		}
		chain.then(function () {
			function reportOutcome(ok, reason) {
				return postAuditConnectionOutcome(aid, ok, reason || '');
			}
			function afterDesktopTry(r) {
				if (r && r.ok) {
					if (r.plinkAuthFailed && r.openedInteractive) {
						reportOutcome(false, 'SSH 자동 인증에 실패했습니다. PuTTY에서 계정·비밀번호를 확인하세요.');
					} else {
						reportOutcome(true);
					}
					return;
				}
				var err = r && r.error ? String(r.error) : '';
				if (err === 'ssh_auth_failed' || err === 'invalid_password' || err === 'invalid_host') {
					var msg = 'SSH 인증에 실패했습니다. 계정·비밀번호를 확인하세요.';
					if (err === 'invalid_password') msg = '비밀번호 형식이 올바르지 않습니다.';
					if (err === 'invalid_host') msg = '호스트 정보가 올바르지 않습니다.';
					if (err === 'ssh_auth_failed') msg = 'SSH 자동 인증에 실패했습니다.';
					reportOutcome(false, msg);
					window.alert(msg);
					return;
				}
				blossomSshOpenUrl(item, ep, form.user, form.password);
				reportOutcome(true);
			}
			if (window.blossom && window.blossom.app && typeof window.blossom.app.openSsh === 'function') {
				window.blossom.app.openSsh({
					host: (ep.host || '').trim(),
					port: endpointPort(ep) || 22,
					user: form.user,
					password: form.password,
				}).then(afterDesktopTry).catch(function () {
					blossomSshOpenUrl(item, ep, form.user, form.password);
					reportOutcome(true);
				});
			} else {
				blossomSshOpenUrl(item, ep, form.user, form.password);
				reportOutcome(true);
			}
		});
	}
	function selectResource(id, endpointIndex, sshOpen) {
		if (!sshOpen) {
			if (state.pendingSshAuditId) {
				postSshSessionEnd(state.pendingSshAuditId, false);
				state.pendingSshAuditId = null;
			}
			clearAllWebAccessSessions(false);
		}
		state.selectedId = id;
		state.activeEndpointIndex = endpointIndex || 0;
		state.sshPanelOpen = !!sshOpen;
		state.sshCredentialsUnlocked = false;
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
	function recordAccess(id, ep, connectAccount) {
		var body = { endpoint_id: ep && ep.id };
		if (connectAccount != null && String(connectAccount).trim() !== '') {
			body.connect_account = String(connectAccount).trim().slice(0, 128);
		}
		return postJson('/api/access-control/resources/' + encodeURIComponent(id) + '/access', body);
	}
	function ensureBrowsePolicy() {
		if (state.browsePolicyLoaded && state.browsePolicy) return Promise.resolve(state.browsePolicy);
		return fetchJson('/api/access-control/browse-policy').then(function (data) {
			state.browsePolicy = data.item || {};
			state.browsePolicyLoaded = true;
			return state.browsePolicy;
		}).catch(function () {
			state.browsePolicy = { web_open_mode: 'new_tab', web_host_gate_patterns: [], web_iframe_allow_patterns: [] };
			state.browsePolicyLoaded = true;
			return state.browsePolicy;
		});
	}
	function webUrlHostname(url) {
		try {
			return String(new URL(url, window.location.href).hostname || '').toLowerCase();
		} catch (_e) {
			return '';
		}
	}
	function hostMatchesAnyPattern(hostname, patterns) {
		var h = String(hostname || '').toLowerCase();
		if (!h) return false;
		var i;
		for (i = 0; i < patterns.length; i++) {
			var p = String(patterns[i] || '').toLowerCase().trim();
			if (!p) continue;
			if (h === p || h.indexOf(p) !== -1) return true;
		}
		return false;
	}
	function webHostAllowedByGate(hostname, patterns) {
		if (!patterns || !patterns.length) return true;
		return hostMatchesAnyPattern(hostname, patterns);
	}
	function webHostAllowedForIframe(hostname, patterns) {
		if (!patterns || !patterns.length) return false;
		return hostMatchesAnyPattern(hostname, patterns);
	}
	function openWebIframeModal(url, auditId) {
		var modal = qs('ac-web-iframe-modal');
		var frame = qs('ac-web-iframe-frame');
		var closeBtn = qs('ac-web-iframe-close');
		if (!modal || !frame) {
			var w = window.open(url, '_blank');
			if (w) { try { w.opener = null; } catch (_e) {} }
			registerWebTabSessionEnd(auditId, w);
			return;
		}
		if (!closeBtn) {
			frame.src = url;
			modal.hidden = false;
			return;
		}
		function cleanup() {
			modal.hidden = true;
			frame.removeAttribute('src');
			try { document.body.style.overflow = ''; } catch (_e) {}
			if (auditId) postSshSessionEnd(auditId, false);
			closeBtn.removeEventListener('click', cleanup);
			modal.removeEventListener('click', onModalClick);
		}
		function onModalClick(ev) {
			if (ev.target === modal) cleanup();
		}
		frame.src = url;
		modal.hidden = false;
		try { document.body.style.overflow = 'hidden'; } catch (_e2) {}
		closeBtn.addEventListener('click', cleanup);
		modal.addEventListener('click', onModalClick);
	}
	function handleWebAfterRecord(data, id, epIdx, row, ep, webUrl, pol) {
		var touchPayload = (data && data.item) || {};
		var aid = touchPayload.audit_log_id;
		if (state.pendingSshAuditId) {
			postSshSessionEnd(state.pendingSshAuditId, false);
			state.pendingSshAuditId = null;
		}
		var hostname = webUrlHostname(webUrl);
		var useIframe = pol.web_open_mode === 'iframe_embed' && webHostAllowedForIframe(hostname, pol.web_iframe_allow_patterns || []);
		if (useIframe) {
			openWebIframeModal(webUrl, aid);
		} else {
			var w = window.open(webUrl, '_blank');
			if (w) {
				try { w.opener = null; } catch (_) {}
			}
			registerWebTabSessionEnd(aid, w);
		}
		loadRows(true);
	}
	function connectEndpoint(id, epIdx) {
		var row = state.rows.filter(function (item) { return String(item.id) === String(id); })[0] || state.detail;
		var eps, ep;
		if (!row) return;
		eps = row.endpoints || [];
		ep = eps[epIdx] || firstEndpoint(row);
		if (!ep) { window.alert('등록된 접속점이 없습니다.'); return; }
		if (!row.can_access || statusLabel(row) === '만료됨' || statusLabel(row) === '시작 전') { selectResource(id, epIdx, false); return; }
		var epKind = String(ep.kind || '').toUpperCase();
		if (epKind === 'WEB') {
			var webUrl = ep.url || endpointTarget(ep);
			if (!webUrl || webUrl === '-') {
				window.alert('표시할 WEB URL이 없습니다.');
				return;
			}
			ensureBrowsePolicy().then(function (pol) {
				var hostname = webUrlHostname(webUrl);
				if (!webHostAllowedByGate(hostname, pol.web_host_gate_patterns || [])) {
					window.alert('WEB 접속이 허용되지 않습니다.\n호스트가 관리자·보안 정책(설정 > 접근제어 > 허용 호스트 패턴)과 맞지 않습니다.');
					return;
				}
				return recordAccess(id, ep).then(function (data) {
					handleWebAfterRecord(data, id, epIdx, row, ep, webUrl, pol);
				});
			}).catch(function (err) { window.alert(err.message); });
			return;
		}
		recordAccess(id, ep).then(function (data) {
			var touchPayload = (data && data.item) || {};
			var aid = touchPayload.audit_log_id;
			var epKind = String(ep.kind || '').toUpperCase();
			var touchResource = touchPayload.resource && typeof touchPayload.resource === 'object' ? touchPayload.resource : {};
			clearAllWebAccessSessions(false);
			if (epKind === 'SSH' && state.pendingSshAuditId && String(state.pendingSshAuditId) !== String(aid || '')) {
				postSshSessionEnd(state.pendingSshAuditId, false);
			}
			state.pendingSshAuditId = epKind === 'SSH' ? (aid || null) : null;
			selectResource(id, epIdx, true);
			loadRows(true);
			if (epKind === 'SSH' && aid) {
				// 왼쪽 카드 "접속": 목록 row만으로는 connection_options 등이 부족할 수 있음. 패널과 동일하게 상세 API로 맞춘 뒤 PuTTY 실행.
				fetchJson('/api/access-control/resources/' + encodeURIComponent(id) + '?scope=accessible')
					.then(function (detailRes) {
						var detailItem = (detailRes && detailRes.item) || {};
						var merged = Object.assign({}, row, touchResource, detailItem);
						var epFresh = (detailItem.endpoints || []).filter(function (e) { return String(e.id) === String(ep.id); })[0] || ep;
						launchSshSession(merged, epFresh, aid);
					})
					.catch(function () {
						launchSshSession(Object.assign({}, row, touchResource), ep, aid);
					});
			}
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
	function readSshFormFromPanel(panel) {
		var uIn, pIn;
		if (!panel) return { user: '', password: '' };
		uIn = panel.querySelector('[data-ssh-field="user"]');
		pIn = panel.querySelector('[data-ssh-field="password"]');
		return {
			user: normalizeSshUser(uIn ? String(uIn.value || '').trim() : ''),
			password: normalizeSshPassword(pIn ? String(pIn.value || '').trim() : ''),
		};
	}
	function blossomSshOpenUrl(item, ep, userOverride, passwordPlain) {
		var cred = credentialInfo(item);
		var host = (ep.host || '').trim();
		var port = String(endpointPort(ep) || 22);
		var user = userOverride != null && String(userOverride).trim() !== '' ? normalizeSshUser(String(userOverride)) : normalizeSshUser((cred.username || '').trim());
		var q = 'host=' + encodeURIComponent(host) + '&port=' + encodeURIComponent(port);
		if (user) q += '&user=' + encodeURIComponent(user);
		if (passwordPlain != null && String(passwordPlain).trim() !== '') {
			q += '&pw=' + encodeURIComponent(utf8ToBase64Url(normalizeSshPassword(String(passwordPlain))));
		}
		var href = 'blossom-ssh://open?' + q;
		var a = document.createElement('a');
		a.href = href;
		a.rel = 'noopener';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}
	function handleDetailAction(event) {
		var btn = event.target.closest('[data-action]');
		var action, ep;
		if (!btn || !state.detail) return;
		action = btn.getAttribute('data-action');
		if (action === 'select-endpoint') {
			if (state.pendingSshAuditId) {
				postSshSessionEnd(state.pendingSshAuditId, false);
				state.pendingSshAuditId = null;
			}
			state.activeEndpointIndex = parseInt(btn.getAttribute('data-ep-idx'), 10) || 0;
			state.sshPanelOpen = false;
			state.sshCredentialsUnlocked = false;
			renderDetail(state.detail);
			return;
		}
		if (action === 'connect') {
			connectEndpoint(btn.getAttribute('data-id'), parseInt(btn.getAttribute('data-ep-idx'), 10) || 0);
			return;
		}
		if (action === 'unlock-ssh-credentials') {
			state.sshCredentialsUnlocked = true;
			renderDetail(state.detail);
			return;
		}
		if (action === 'toggle-ssh-password-vis') {
			if (!state.sshCredentialsUnlocked) return;
			var inp = btn.closest('.ac-ssh-panel');
			inp = inp && inp.querySelector('[data-ssh-field="password"]');
			if (!inp) return;
			if (inp.type === 'password') {
				inp.type = 'text';
				btn.textContent = '숨김';
			} else {
				inp.type = 'password';
				btn.textContent = '보기';
			}
			return;
		}
		ep = (state.detail.endpoints || [])[state.activeEndpointIndex] || firstEndpoint(state.detail);
		if (!ep) return;
		if (action === 'execute-ssh') {
			launchSshSession(state.detail, ep, state.pendingSshAuditId);
		}
	}
	function syncFilterSelection() {
		applyFilters();
		renderList();
		if (state.filtered.length && !state.filtered.some(function (row) { return String(row.id) === String(state.selectedId); })) selectResource(state.filtered[0].id, 0, false);
		if (!state.filtered.length) { state.selectedId = null; renderNoSelection(); }
	}
	function bindSshAuditLifecycle() {
		if (window.__blossomAccessAuditLifecycle) return;
		window.__blossomAccessAuditLifecycle = true;
		window.addEventListener('pagehide', function () {
			if (state.pendingSshAuditId) postSshSessionEnd(state.pendingSshAuditId, true);
			clearAllWebAccessSessions(true);
		});
		// SPA 사이드바/탭 전환은 문서 언로드 없이 main만 바뀌어 pagehide가 없다. blossom.js가 네비 후 blossom:pageLoaded를 낸다.
		document.addEventListener('blossom:pageLoaded', function () {
			if (state.pendingSshAuditId) postSshSessionEnd(state.pendingSshAuditId, false);
			clearAllWebAccessSessions(false);
		});
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
		bindSshAuditLifecycle();
		bindEvents();
		syncCategoryTabs();
		ensureBrowsePolicy().catch(function () {});
		loadRows(false);
	}
	document.addEventListener('DOMContentLoaded', init);
	if (document.readyState === 'interactive' || document.readyState === 'complete') {
		try { init(); } catch (e) { console.error('[access_list init]', e); }
	}
})();
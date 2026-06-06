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
		workOperations: [],
		selectedAgent: null,
		selectedUser: null,
		userResults: [],
		bulkAgentIds: [],
		lastAgentExportRows: [],
		exportAgentRowsAll: [],
		agentSortKey: '',
		agentSortDir: 'asc',
		payments: [],
		paymentRows: [],
		paymentTotal: 0,
		paymentPage: 1,
		paymentPageSize: 10,
		paymentLoaded: false,
		assets: [],
		assetRows: [],
		assetTotal: 0,
		assetPage: 1,
		assetPageSize: 10,
		assetLoaded: false,
		riskType: '',
		riskIpBlocklist: [],
		riskPolicyTab: 'overseas',
		riskPolicies: {},
		riskPolicyRows: []
	};
	var PAGE_SIZE_LIMIT = 200;
	var searchTimer = null;
	var agentSearchTimer = null;
	var paymentSearchTimer = null;
	var assetSearchTimer = null;
	var userSearchTimer = null;
	var agentMappingSelectSyncTimer = null;
	var DEFAULT_ACTOR_AVATAR = '/static/image/svg/profil/free-icon-bussiness-man.svg';
	var CATEGORY_ALIASES = {
		'시스템': '시스템', system: '시스템', os: '시스템', linux: '시스템', windows: '시스템', unix: '시스템', vm: '시스템', '서버': '시스템', server: '시스템', ssh: '시스템', db: '시스템', '기타': '시스템', etc: '시스템',
		'서비스': '서비스', service: '서비스', webservice: '서비스', '웹서비스': '서비스', '내부서비스': '서비스', '외부서비스': '서비스', internal: '서비스', external: '서비스', '웹': '서비스', web: '서비스',
		'컨테이너': '컨테이너', container: '컨테이너', kubernetes: '컨테이너', k8s: '컨테이너', '쿠버네티스': '컨테이너', openshift: '컨테이너', rancher: '컨테이너', portainer: '컨테이너',
		'관리콘솔': '관리콘솔', adminconsole: '관리콘솔', managementconsole: '관리콘솔', console: '관리콘솔'
	};
	var CONSOLE_GROUP_ALIASES = {
		'서버': '서버', server: '서버', ilo: '서버', idrac: '서버', cimc: '서버', imm: '서버',
		'스토리지': '스토리지', storage: '스토리지', netapp: '스토리지', emc: '스토리지', hpestorage: '스토리지',
		san: 'SAN', brocade: 'SAN', ciscosan: 'SAN',
		'네트워크': '네트워크', network: '네트워크', cisco: '네트워크', juniper: '네트워크', arista: '네트워크', l4l7: '네트워크',
		'보안장비': '보안장비', security: '보안장비', firewall: '보안장비', vpn: '보안장비', waf: '보안장비', ips: '보안장비'
	};

	function qs(id) { return document.getElementById(id); }
	function syncSearchSelect(el) {
		if (window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function') {
			window.BlossomSearchableSelect.syncAll(el || document);
		}
	}
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
	function categoryKey(value) { return String(value || '').replace(/[\s\/_-]+/g, '').toLowerCase(); }
	function categoryLabel(row) { return CATEGORY_ALIASES[categoryKey(row && (row.category_name || row.category_label || row.category))] || (String(row && (row.category_name || row.category_label || row.category) || '').trim() || '시스템'); }
	function categoryDetail(row) { return categoryLabel(row) === '관리콘솔' ? (CONSOLE_GROUP_ALIASES[categoryKey(row && (row.category_detail || row.console_group))] || '') : ''; }
	function categoryPath(row) {
		var category = categoryLabel(row);
		var detail = categoryDetail(row);
		return category === '관리콘솔' && detail ? category + ' / ' + detail : category;
	}
	function workOperationNameByCode(code) {
		code = String(code || '').trim();
		if (!code) return '';
		var found = (state.workOperations || []).find(function (item) {
			return String(item.operation_code || item.code || item.value || '').trim() === code;
		});
		if (found) return String(found.wc_name || found.operation_name || found.name || found.label || '').trim();
		return /^OPERATION_\d+$/i.test(code) ? '' : code;
	}
	function workOperationLabel(row) {
		if (categoryLabel(row) === '관리콘솔') return '';
		var direct = String(row && (row.work_operation_name || row.work_operation) || '').trim();
		if (direct && !/^OPERATION_\d+$/i.test(direct)) return direct;
		return workOperationNameByCode(row && (row.work_operation_code || direct));
	}
	function riskReasonLabel(row) {
		var label = String(row && (row.risk_label || row.risk_type) || '').trim();
		if (!label) label = '위험 기준 매칭';
		return label;
	}
	function operationOptionsHtml() {
		var html = '<option value="">운영 전체</option>';
		state.workOperations.forEach(function (item) {
			var code = item.operation_code || '';
			var name = item.wc_name || item.operation_name || code;
			if (code) html += '<option value="' + esc(code) + '">' + esc(name) + '</option>';
		});
		return html;
	}
	function syncAuditCategoryDetailFilter() {
		var category = qs('audit-category-filter');
		var detail = qs('audit-category-detail-filter');
		var wrapper = qs('audit-category-detail-wrapper');
		var op = qs('audit-work-operation-filter');
		var opWrapper = qs('audit-work-operation-wrapper');
		var isConsole = !!category && category.value === '관리콘솔';
		var canUseOperation = state.scope !== 'risk' && !!category && category.value !== '관리콘솔';
		if (wrapper) wrapper.hidden = !isConsole;
		if (detail) {
			detail.disabled = !isConsole;
			if (!isConsole) detail.value = '';
			syncSearchSelect(detail);
		}
		if (opWrapper) opWrapper.hidden = !canUseOperation;
		if (op) {
			op.disabled = !canUseOperation;
			if (!canUseOperation) op.value = '';
			syncSearchSelect(op);
		}
	}
	function populateAuditWorkOperations() {
		var select = qs('audit-work-operation-filter');
		if (!select) return;
		select.innerHTML = operationOptionsHtml();
		syncSearchSelect(select);
	}
	function loadWorkOperations() {
		return fetchJson('/api/work-operations', { errorDefault: '업무 운영 목록을 불러오지 못했습니다.' })
			.then(function (data) {
				state.workOperations = data.items || data.rows || [];
				populateAuditWorkOperations();
			})
			.catch(function () {
				state.workOperations = [];
				populateAuditWorkOperations();
			});
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
			document.querySelector('#audit-activity-modal.show') ||
			document.querySelector('#audit-risk-policy-modal.show') ||
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
	function auditDate(row) {
		var value = row && (row.occurred_at || row.created_at || row.accessed_at || row.started_at || row.event_time || row.updated_at);
		var date = value ? new Date(value) : null;
		return date && !isNaN(date.getTime()) ? date : null;
	}
	function loadRiskIpBlocklist() { return []; }
	function saveRiskIpBlocklist() {}
	function groupRiskPolicies(rows) {
		var grouped = { overseas: [], night: [], blocked: [], privilege: [], unauthorized: [], blacklist: [] };
		(rows || []).forEach(function (row) {
			var type = row.policy_type || row.type || '';
			if (!grouped[type]) grouped[type] = [];
			grouped[type].push(row);
		});
		return grouped;
	}
	function loadRiskPolicies() {
		return fetchJson('/api/access-control/risk-policies')
			.then(function (data) {
				state.riskPolicyRows = data.rows || [];
				state.riskPolicies = groupRiskPolicies(state.riskPolicyRows);
				state.riskIpBlocklist = (state.riskPolicies.blacklist || []).map(function (row) { return row.match_value || ''; }).filter(Boolean);
				return state.riskPolicies;
			});
	}
	function createRiskPolicy(payload) {
		return fetchJson('/api/access-control/risk-policies', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload || {})
		});
	}
	function updateRiskPolicy(id, payload) {
		return fetchJson('/api/access-control/risk-policies/' + encodeURIComponent(id), {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload || {})
		});
	}
	function deleteRiskPolicy(id) {
		return fetchJson('/api/access-control/risk-policies/' + encodeURIComponent(id) + '/delete', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{}'
		});
	}
	function ipMatchesPolicy(ip, policy) {
		ip = String(ip || '').trim();
		policy = String(policy || '').trim();
		if (!ip || !policy) return false;
		if (policy.indexOf('*') >= 0) return ip.indexOf(policy.replace(/\*/g, '')) === 0;
		if (policy.indexOf('/') >= 0) return ip.indexOf(policy.split('/')[0].replace(/\.\d+$/, '.')) === 0;
		return ip === policy;
	}
	function riskInfo(row) {
		if (row && (row.risk_type || row.risk_label)) {
			return { type: row.risk_type || '', label: row.risk_label || '' };
		}
		var text = [
			row && row.risk_reason,
			row && row.reason,
			row && row.description,
			row && row.details,
			row && row.note,
			row && row.ip_address,
			row && row.country
		].join(' ').toLowerCase();
		var result = String(row && (row.action_result || row.result || row.connection_result || row.outcome || row.status) || '').toLowerCase();
		var hourDate = auditDate(row);
		var hour = hourDate ? hourDate.getHours() : -1;
		var ip = String(row && row.ip_address || '').trim();
		var matchedPolicy = (state.riskIpBlocklist || []).some(function (policy) { return ipMatchesPolicy(ip, policy); });
		var policies = state.riskPolicies || loadRiskPolicies();
		function hasPolicy(type) {
			return (policies[type] || []).some(function (item) {
				item = String(item || '').trim().toLowerCase();
				return item && text.indexOf(item) >= 0;
			});
		}
		if (matchedPolicy) return { type: 'blacklist', label: '차단 IP' };
		if (hasPolicy('overseas') || text.indexOf('foreign') >= 0 || text.indexOf('oversea') >= 0 || text.indexOf('국외') >= 0 || text.indexOf('해외') >= 0) return { type: 'overseas', label: '해외 접속' };
		if (hasPolicy('night') || (hour >= 0 && hour < 6)) return { type: 'night', label: '새벽 접속' };
		if (hasPolicy('blocked') || result.indexOf('fail') >= 0 || result.indexOf('block') >= 0 || result.indexOf('deny') >= 0 || result.indexOf('실패') >= 0 || result.indexOf('차단') >= 0) return { type: 'blocked', label: '차단/실패' };
		if (hasPolicy('privilege') || text.indexOf('privilege') >= 0 || text.indexOf('admin') >= 0 || text.indexOf('권한') >= 0 || text.indexOf('관리자') >= 0) return { type: 'privilege', label: '관리자/권한 상승' };
		if (hasPolicy('unauthorized') || text.indexOf('unauthorized') >= 0 || text.indexOf('비인가') >= 0) return { type: 'unauthorized', label: '비인가 접근' };
		return null;
	}
	function riskFilteredRows(rows) {
		return (rows || []).map(function (row) {
			var info = riskInfo(row);
			return info ? Object.assign({}, row, { _risk_type: info.type, _risk_label: info.label }) : null;
		}).filter(function (row) {
			return row && (!state.riskType || row._risk_type === state.riskType);
		});
	}
	function renderRiskIpList() {
		var box = qs('audit-risk-ip-list');
		if (!box) return;
		if (!state.riskIpBlocklist.length) {
			box.innerHTML = '<span class="audit-risk-ip-empty">등록된 차단 IP가 없습니다.</span>';
			return;
		}
		box.innerHTML = state.riskIpBlocklist.map(function (ip) {
			return '<button type="button" class="audit-risk-ip-chip" data-risk-ip="' + esc(ip) + '">' + esc(ip) + '<span aria-hidden="true">×</span></button>';
		}).join('');
	}
	function riskPolicyLabel(type) {
		return ({
			overseas: '해외 접속',
			night: '새벽 접속',
			blocked: '차단/실패',
			privilege: '관리자/권한 상승',
			unauthorized: '비인가 접근',
			blacklist: '차단 IP'
		})[type] || '해외 접속';
	}
	function riskPolicyPlaceholder(type) {
		return ({
			overseas: '국가 코드 또는 국가명 입력',
			night: '예: 00:00-06:00',
			blocked: '차단/실패 판단 키워드 입력',
			privilege: '관리자/권한 상승 키워드 입력',
			unauthorized: '비인가 접근 키워드 입력',
			blacklist: 'IP 또는 CIDR 대역 입력'
		})[type] || '기준 입력';
	}
	function riskPolicyGuide(type) {
		return ({
			overseas: '국가 코드 2자리(CN, RU 등) 또는 국가명을 등록합니다. 감사 로그의 국가/국가코드 필드와 매칭됩니다.',
			night: '00:00-06:00 형식으로 등록합니다. 감사 로그 발생 시간 기준으로 탐지합니다.',
			blocked: '실패, 차단, 거부 등 2자 이상 키워드를 등록합니다. 결과/사유/메모 텍스트와 매칭됩니다.',
			privilege: '관리자, root, sudo 등 2자 이상 키워드를 등록합니다. 사용자/사유/메모 텍스트와 매칭됩니다.',
			unauthorized: '비인가, 미승인, 권한 없음 등 2자 이상 키워드를 등록합니다.',
			blacklist: 'IP 또는 CIDR 형식으로 등록합니다. 예: 192.0.2.10, 192.0.2.0/24'
		})[type] || '탭 유형에 맞는 기준 값을 등록합니다.';
	}
	function riskPolicyMatchMode(type) {
		return ({
			overseas: 'country',
			night: 'time_range',
			blacklist: 'ip_cidr'
		})[type] || 'keyword';
	}
	function validateRiskPolicyValue(type, value) {
		value = String(value || '').trim();
		if (!value) return { ok: false, message: '기준 값을 입력하세요.' };
		if (type === 'overseas') {
			if (/^[A-Za-z]{2}$/.test(value)) return { ok: true, value: value.toUpperCase() };
			if (/^[A-Za-z가-힣][A-Za-z가-힣 ._-]{1,49}$/.test(value)) return { ok: true, value: value };
			return { ok: false, message: '해외 접속 기준은 CN, RU 같은 국가 코드 2자리 또는 국가명을 입력하세요.' };
		}
		if (type === 'night') {
			if (/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]|24):[0-5]\d$/.test(value)) return { ok: true, value: value };
			return { ok: false, message: '새벽 접속 기준은 00:00-06:00 형식으로 입력하세요.' };
		}
		if (type === 'blacklist') {
			var ip = '(25[0-5]|2[0-4]\\d|1?\\d?\\d)';
			var cidr = new RegExp('^' + ip + '\\.' + ip + '\\.' + ip + '\\.' + ip + '(\\/(3[0-2]|[12]?\\d))?$');
			if (cidr.test(value)) return { ok: true, value: value };
			return { ok: false, message: '차단 IP는 192.0.2.10 또는 192.0.2.0/24 형식으로 입력하세요.' };
		}
		if (value.length < 2) return { ok: false, message: '키워드는 2자 이상 입력하세요.' };
		if (value.length > 100) return { ok: false, message: '기준 값은 100자 이하로 입력하세요.' };
		return { ok: true, value: value };
	}
	function setRiskPolicyHelp(message, isError) {
		var form = document.querySelector('.audit-risk-policy-form');
		if (!form) return;
		var help = qs('audit-risk-policy-help');
		if (!help) {
			help = document.createElement('div');
			help.id = 'audit-risk-policy-help';
			help.className = 'audit-risk-policy-help';
			form.insertAdjacentElement('afterend', help);
		}
		help.textContent = message || '';
		help.classList.toggle('is-error', !!isError);
	}
	function riskPolicyEditorHtml(type) {
		var addButton = '<button type="button" id="audit-risk-policy-add" class="header-btn audit-risk-policy-add" title="등록" aria-label="등록" onclick="window.__accessAuditRiskAddPolicyItem && window.__accessAuditRiskAddPolicyItem()"><img src="/static/image/svg/list/free-icon-plus.svg" alt="" class="header-icon" aria-hidden="true"></button>';
		if (type === 'night') {
			return '<select id="audit-risk-policy-input" class="audit-risk-policy-select audit-risk-policy-time-select" aria-label="새벽 접속 시간 범위 선택">' +
				'<option value="00:00-06:00">00:00 - 06:00</option>' +
				'<option value="22:00-06:00">22:00 - 06:00</option>' +
				'<option value="23:00-05:00">23:00 - 05:00</option>' +
				'<option value="01:00-05:00">01:00 - 05:00</option>' +
				'<option value="02:00-06:00">02:00 - 06:00</option>' +
			'</select>' + addButton;
		}
		if (type === 'overseas') {
			return '<select id="audit-risk-policy-input" class="audit-risk-policy-select" aria-label="해외 접속 국가 선택">' +
				'<option value="CN">중국 (CN)</option>' +
				'<option value="RU">러시아 (RU)</option>' +
				'<option value="KP">북한 (KP)</option>' +
				'<option value="IR">이란 (IR)</option>' +
				'<option value="VN">베트남 (VN)</option>' +
				'<option value="US">미국 (US)</option>' +
				'<option value="JP">일본 (JP)</option>' +
			'</select>' + addButton;
		}
		if (type === 'blocked') {
			return '<select id="audit-risk-policy-input" class="audit-risk-policy-select" aria-label="차단 실패 기준 선택">' +
				'<option value="실패">실패</option>' +
				'<option value="차단">차단</option>' +
				'<option value="거부">거부</option>' +
				'<option value="접속 실패">접속 실패</option>' +
				'<option value="정책 차단">정책 차단</option>' +
			'</select>' + addButton;
		}
		if (type === 'privilege') {
			return '<select id="audit-risk-policy-input" class="audit-risk-policy-select" aria-label="관리자 권한 상승 기준 선택">' +
				'<option value="관리자">관리자</option>' +
				'<option value="권한 상승">권한 상승</option>' +
				'<option value="root">root</option>' +
				'<option value="sudo">sudo</option>' +
				'<option value="admin">admin</option>' +
			'</select>' + addButton;
		}
		if (type === 'unauthorized') {
			return '<select id="audit-risk-policy-input" class="audit-risk-policy-select" aria-label="비인가 접근 기준 선택">' +
				'<option value="비인가">비인가</option>' +
				'<option value="미승인">미승인</option>' +
				'<option value="권한 없음">권한 없음</option>' +
				'<option value="비인가 자산">비인가 자산</option>' +
				'<option value="unauthorized">unauthorized</option>' +
			'</select>' + addButton;
		}
		return '<input type="text" id="audit-risk-policy-input" autocomplete="off" placeholder="예: 192.0.2.10 또는 192.0.2.0/24">' + addButton;
	}
	function riskPolicyEditorValue(type) {
		var input = qs('audit-risk-policy-input');
		return input ? String(input.value || '').trim() : '';
	}
	function riskMatchModeLabel(mode) {
		return ({
			keyword: '키워드',
			country: '국가',
			time_range: '시간 범위',
			ip_cidr: 'IP/CIDR',
			exact: '정확 일치'
		})[mode] || '키워드';
	}
	function listRiskPolicyLoading() {
		var list = qs('audit-risk-policy-items');
		if (list) list.innerHTML = '<div class="audit-risk-policy-loading">기준 목록을 불러오는 중입니다.</div>';
	}
	function renderRiskPolicyModal() {
		var modal = qs('audit-risk-policy-modal');
		var tabs = qs('audit-risk-policy-tabs');
		var list = qs('audit-risk-policy-items');
		var input = qs('audit-risk-policy-input');
		var types = ['night', 'blacklist'];
		var tab = types.indexOf(state.riskPolicyTab) >= 0 ? state.riskPolicyTab : 'night';
		state.riskPolicyTab = tab;
		if (!modal || !tabs || !list || !input) return;
		tabs.innerHTML = types.map(function (type) {
			return '<button type="button" class="' + (type === tab ? 'active' : '') + '" data-risk-policy-tab="' + type + '">' + riskPolicyLabel(type) + '</button>';
		}).join('');
		input.placeholder = riskPolicyPlaceholder(tab);
		var items = (state.riskPolicies && state.riskPolicies[tab]) || [];
		list.innerHTML =
			'<table class="audit-risk-policy-table">' +
				'<thead><tr><th>유형</th><th>기준 값</th><th>판정 방식</th><th>상태</th><th></th></tr></thead>' +
				'<tbody>' +
					(items.length ? items.map(function (item) {
						return '<tr>' +
							'<td>' + esc(item.policy_label || riskPolicyLabel(item.policy_type || tab)) + '</td>' +
							'<td><span class="audit-risk-policy-value">' + esc(item.match_value || '') + '</span></td>' +
							'<td>' + esc(riskMatchModeLabel(item.match_mode || 'keyword')) + '</td>' +
							'<td><span class="audit-risk-policy-state ' + (item.active ? 'active' : '') + '">' + (item.active ? '사용' : '중지') + '</span></td>' +
							'<td><button type="button" class="audit-risk-policy-delete" data-risk-policy-id="' + esc(item.id || '') + '">삭제</button></td>' +
						'</tr>';
					}).join('') : '<tr><td colspan="5" class="audit-risk-policy-empty">등록된 기준이 없습니다.</td></tr>') +
				'</tbody>' +
			'</table>';
	}
	function renderRiskPolicyModal() {
		var modal = qs('audit-risk-policy-modal');
		var tabs = qs('audit-risk-policy-tabs');
		var list = qs('audit-risk-policy-items');
		var input = qs('audit-risk-policy-input');
		var types = ['night', 'blacklist'];
		var tab = types.indexOf(state.riskPolicyTab) >= 0 ? state.riskPolicyTab : 'night';
		state.riskPolicyTab = tab;
		if (!modal || !tabs || !list || !input) return;
		tabs.innerHTML = types.map(function (type) {
			return '<button type="button" class="' + (type === tab ? 'active' : '') + '" data-risk-policy-tab="' + type + '">' + riskPolicyLabel(type) + '</button>';
		}).join('');
		input.placeholder = riskPolicyPlaceholder(tab);
		var items = (state.riskPolicies && state.riskPolicies[tab]) || [];
		list.innerHTML =
			'<table class="audit-risk-policy-table">' +
				'<thead><tr>' +
					'<th class="audit-risk-policy-check"><input type="checkbox" id="audit-risk-policy-check-all" aria-label="전체 선택"></th>' +
					'<th>유형</th><th>기준 값</th><th>판정 방식</th><th>상태</th><th></th>' +
				'</tr></thead>' +
				'<tbody>' +
					(items.length ? items.map(function (item) {
						var active = item.active !== false;
						return '<tr>' +
							'<td class="audit-risk-policy-check"><input type="checkbox" class="audit-risk-policy-row-check" data-risk-policy-check="' + esc(item.id || '') + '" aria-label="기준 선택"></td>' +
							'<td>' + esc(item.policy_label || riskPolicyLabel(item.policy_type || tab)) + '</td>' +
							'<td><span class="audit-risk-policy-value">' + esc(item.match_value || '') + '</span></td>' +
							'<td>' + esc(riskMatchModeLabel(item.match_mode || 'keyword')) + '</td>' +
							'<td><button type="button" class="audit-risk-policy-state ' + (active ? 'active' : '') + '" data-risk-policy-toggle="' + esc(item.id || '') + '" data-risk-policy-active="' + (active ? '1' : '0') + '" aria-label="상태 변경"><span class="audit-risk-policy-state-dot"></span><span>' + (active ? '사용' : '중지') + '</span></button></td>' +
							'<td><button type="button" class="audit-risk-policy-delete" data-risk-policy-id="' + esc(item.id || '') + '" aria-label="삭제"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 8v7h2v-7h-2Zm4 0v7h2v-7h-2ZM7 9h10l-.7 11H7.7L7 9Z"/></svg></button></td>' +
						'</tr>';
					}).join('') : '<tr><td colspan="6" class="audit-risk-policy-empty">등록된 기준이 없습니다.</td></tr>') +
				'</tbody>' +
			'</table>';
	}
	function renderRiskPolicyModal() {
		var modal = qs('audit-risk-policy-modal');
		var tabs = qs('audit-risk-policy-tabs');
		var list = qs('audit-risk-policy-items');
		var form = document.querySelector('.audit-risk-policy-form');
		var types = ['night', 'blacklist'];
		var tab = types.indexOf(state.riskPolicyTab) >= 0 ? state.riskPolicyTab : 'night';
		state.riskPolicyTab = tab;
		if (!modal || !tabs || !list || !form) return;
		tabs.innerHTML = types.map(function (type) {
			return '<button type="button" class="' + (type === tab ? 'active' : '') + '" data-risk-policy-tab="' + type + '">' + riskPolicyLabel(type) + '</button>';
		}).join('');
		form.innerHTML = riskPolicyEditorHtml(tab);
		setRiskPolicyHelp(riskPolicyGuide(tab), false);
		var items = (state.riskPolicies && state.riskPolicies[tab]) || [];
		list.innerHTML =
			'<table class="audit-risk-policy-table">' +
				'<thead><tr>' +
					'<th class="audit-risk-policy-check"><input type="checkbox" id="audit-risk-policy-check-all" aria-label="전체 선택"></th>' +
					'<th>유형</th><th>기준 값</th><th>판정 방식</th><th>상태</th><th></th>' +
				'</tr></thead>' +
				'<tbody>' +
					(items.length ? items.map(function (item) {
						var active = item.active !== false;
						return '<tr>' +
							'<td class="audit-risk-policy-check"><input type="checkbox" class="audit-risk-policy-row-check" data-risk-policy-check="' + esc(item.id || '') + '" aria-label="기준 선택"></td>' +
							'<td>' + esc(item.policy_label || riskPolicyLabel(item.policy_type || tab)) + '</td>' +
							'<td><span class="audit-risk-policy-value">' + esc(item.match_value || '') + '</span></td>' +
							'<td>' + esc(riskMatchModeLabel(item.match_mode || 'keyword')) + '</td>' +
							'<td><button type="button" class="audit-risk-policy-state status-pill" data-risk-policy-toggle="' + esc(item.id || '') + '" data-risk-policy-active="' + (active ? '1' : '0') + '" aria-label="상태 변경"><span class="status-dot ' + (active ? 'ws-run' : 'ws-wait') + '" aria-hidden="true"></span><span class="status-text">' + (active ? '사용' : '중지') + '</span></button></td>' +
							'<td><button type="button" class="action-btn audit-risk-policy-delete" data-action="delete" data-risk-policy-id="' + esc(item.id || '') + '" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="" class="action-icon" aria-hidden="true"></button></td>' +
						'</tr>';
					}).join('') : '<tr><td colspan="6" class="audit-risk-policy-empty">등록된 기준이 없습니다.</td></tr>') +
				'</tbody>' +
			'</table>';
	}
	function openRiskPolicyModal() {
		var modal = qs('audit-risk-policy-modal');
		if (!modal) return;
		document.body.classList.add('modal-open');
		modal.classList.add('show');
		modal.setAttribute('aria-hidden', 'false');
		listRiskPolicyLoading();
		loadRiskPolicies().then(function () {
			renderRiskPolicyModal();
		}).catch(function (err) {
			showAuditMessage(err.message || '위험 접근 기준을 불러오지 못했습니다.', '안내');
		});
	}
	function closeRiskPolicyModal() {
		var modal = qs('audit-risk-policy-modal');
		if (!modal) return;
		modal.classList.remove('show');
		modal.setAttribute('aria-hidden', 'true');
		if (!auditModalsPreventBodyUnlock()) document.body.classList.remove('modal-open');
	}
	function addRiskPolicyItem() {
		var tab = state.riskPolicyTab || 'overseas';
		var input = qs('audit-risk-policy-input') || qs('audit-risk-policy-start-time');
		var value = riskPolicyEditorValue(tab);
		var checked = validateRiskPolicyValue(tab, value);
		if (!checked.ok) {
			if (input) input.classList.add('is-invalid');
			setRiskPolicyHelp(checked.message, true);
			return;
		}
		if (input) input.classList.remove('is-invalid');
		createRiskPolicy({ policy_type: tab, match_value: checked.value, match_mode: riskPolicyMatchMode(tab) }).then(function () {
			if (tab === 'blacklist' && qs('audit-risk-policy-input')) qs('audit-risk-policy-input').value = '';
			return loadRiskPolicies();
		}).then(function () {
			renderRiskPolicyModal();
			if (state.scope === 'risk') loadRows(true);
		}).catch(function (err) {
			if (input) input.classList.add('is-invalid');
			setRiskPolicyHelp(err.message || '위험 접근 기준을 등록하지 못했습니다.', true);
		});
	}
	window.__accessAuditRiskAddPolicyItem = addRiskPolicyItem;
	function addRiskIpPolicy() {
		var input = qs('audit-risk-ip-input');
		var value = input ? String(input.value || '').trim() : '';
		if (!value) return;
		if (state.riskIpBlocklist.indexOf(value) < 0) state.riskIpBlocklist.push(value);
		if (input) input.value = '';
		saveRiskIpBlocklist();
		renderRiskIpList();
		if (state.scope === 'risk') loadRows(true);
	}
	window.__accessAuditRiskAddIp = addRiskIpPolicy;
	function ensureRiskAuditUi() {
		var tabs = document.querySelector('.audit-tabs');
		var agentTab = qs('audit-tab-agent');
		if (tabs && !qs('audit-tab-risk')) {
			var riskTab = document.createElement('button');
			riskTab.type = 'button';
			riskTab.className = 'system-tab-btn';
			riskTab.setAttribute('role', 'tab');
			riskTab.setAttribute('aria-selected', 'false');
			riskTab.id = 'audit-tab-risk';
			riskTab.setAttribute('data-audit-scope', 'risk');
			riskTab.setAttribute('aria-controls', 'audit-list-pane');
			riskTab.textContent = '위험 접근';
			tabs.insertBefore(riskTab, agentTab || null);
		}
		var pane = qs('audit-list-pane');
		var tableWrap = qs('audit-table-wrap');
		if (pane && tableWrap && !qs('audit-risk-policy')) {
			var policy = document.createElement('div');
			policy.className = 'audit-risk-policy';
			policy.id = 'audit-risk-policy';
			policy.hidden = true;
			policy.innerHTML =
				'<button type="button" class="audit-risk-policy-open" id="audit-risk-policy-open">위험 접근 기준</button>';
			pane.insertBefore(policy, tableWrap);
		}
		var toolbar = document.querySelector('.audit-toolbar');
		var resetBtn = qs('audit-reset-btn');
		if (toolbar && !qs('audit-risk-policy-toolbar-open')) {
			var policyBtn = document.createElement('button');
			policyBtn.type = 'button';
			policyBtn.className = 'header-btn audit-risk-policy-toolbar-open';
			policyBtn.id = 'audit-risk-policy-toolbar-open';
			policyBtn.hidden = state.scope !== 'risk';
			policyBtn.title = '위험 접근 기준';
			policyBtn.setAttribute('aria-label', '위험 접근 기준');
			policyBtn.innerHTML = '<img src="/static/image/svg/free-icon-font-insurance.svg" alt="" class="header-icon" aria-hidden="true">';
			toolbar.insertBefore(policyBtn, resetBtn || null);
		}
		if (!qs('audit-risk-policy-modal')) {
			var modal = document.createElement('div');
			modal.className = 'modal-overlay-full audit-risk-policy-modal';
			modal.id = 'audit-risk-policy-modal';
			modal.setAttribute('aria-hidden', 'true');
			modal.setAttribute('role', 'dialog');
			modal.setAttribute('aria-modal', 'true');
			modal.innerHTML =
				'<div class="audit-risk-policy-dialog" role="document">' +
					'<div class="audit-risk-policy-header"><div><h2>위험 접근 기준</h2><p>유형별 탐지 기준과 차단 IP를 등록합니다.</p></div><button type="button" id="audit-risk-policy-close" aria-label="닫기">×</button></div>' +
					'<div class="audit-risk-policy-tabs" id="audit-risk-policy-tabs"></div>' +
					'<div class="audit-risk-policy-form"><input type="text" id="audit-risk-policy-input" autocomplete="off"><button type="button" id="audit-risk-policy-add" onclick="window.__accessAuditRiskAddPolicyItem && window.__accessAuditRiskAddPolicyItem()">등록</button></div>' +
					'<div class="audit-risk-policy-items" id="audit-risk-policy-items"></div>' +
				'</div>';
			document.body.appendChild(modal);
		}
		state.riskPolicies = {};
		state.riskIpBlocklist = [];
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
	function activityHistoryCell(row) {
		var kind = normalizeKind(row);
		var count = parseInt(row && row.activity_count, 10) || 0;
		if (kind !== 'SSH' || row.action_type !== '접속') {
			return '<td class="audit-col-activity-history"><span class="audit-activity-none">-</span></td>';
		}
		return '<td class="audit-col-activity-history">' +
			'<button type="button" class="audit-activity-btn' + (count ? '' : ' is-empty') + '" data-audit-id="' + esc(row.id || '') + '" title="행위 이력 보기" aria-label="행위 이력 보기">' +
			'<img src="/static/image/svg/free-icon-font-analytics-magnifying-glass.svg" alt="" aria-hidden="true">' +
			'</button></td>';
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
		var baseFilters = [
			['keyword', qs('audit-keyword-filter').value],
			['category', qs('audit-category-filter') ? qs('audit-category-filter').value : ''],
			['category_detail', qs('audit-category-detail-filter') ? qs('audit-category-detail-filter').value : ''],
			['work_operation_code', state.scope === 'risk' ? '' : (qs('audit-work-operation-filter') ? qs('audit-work-operation-filter').value : '')],
			['from_date', qs('audit-from-date').value],
			['to_date', qs('audit-to-date').value]
		];
		if (state.scope !== 'risk') baseFilters.unshift(['audit_scope', 'access']);
		baseFilters.forEach(function (pair) {
			var value = String(pair[1] || '').trim();
			if (value) params.set(pair[0], value);
		});
		params.set('page', String(state.page));
		params.set('page_size', String(state.pageSize));
		if (state.scope === 'risk') {
			params.set('risk', '1');
			if (state.riskType) params.set('risk_type', state.riskType);
		}
		return params.toString();
	}
	function buildExportQuery() {
		var params = new URLSearchParams();
		var baseFilters = [
			['keyword', qs('audit-keyword-filter').value],
			['category', qs('audit-category-filter') ? qs('audit-category-filter').value : ''],
			['category_detail', qs('audit-category-detail-filter') ? qs('audit-category-detail-filter').value : ''],
			['work_operation_code', state.scope === 'risk' ? '' : (qs('audit-work-operation-filter') ? qs('audit-work-operation-filter').value : '')],
			['from_date', qs('audit-from-date').value],
			['to_date', qs('audit-to-date').value]
		];
		if (state.scope !== 'risk') baseFilters.unshift(['audit_scope', 'access']);
		baseFilters.forEach(function (pair) {
			var value = String(pair[1] || '').trim();
			if (value) params.set(pair[0], value);
		});
		if (state.scope === 'risk') {
			params.set('risk', '1');
			if (state.riskType) params.set('risk_type', state.riskType);
		}
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
			var headers = ['접속 일시', '종료 일시', '유형', '분류', '업무 운영', '작업', '결과', '실패 사유', '부서', '사번', '사용자', '자원 이름', '접속 계정', '행위 이력', '접속 URL/IP', '접속 IP'];
			var lines = [headers.join(',')];
			rows.forEach(function (row) {
				var resource = row.resource_name || (row.target_resource_id ? ('자원 #' + row.target_resource_id) : '-');
				lines.push([
					formatDateTime(row.occurred_at),
					formatDateTime(row.session_ended_at),
					normalizeKind(row) || '',
					categoryPath(row),
					workOperationLabel(row),
					row.action_type || '',
					row.action_result || '',
					row.note || '',
					actorDeptText(row),
					actorEmpText(row),
					actorNameText(row),
					resource,
					row.connect_account || '',
					row.activity_count || 0,
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
		if (titleEl) titleEl.textContent = state.scope === 'risk' ? '위험 접근' : scopeTitle(state.scope);
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
		if (!state.total) qs('audit-page-info').textContent = '0-0 / 0개 항목';
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
		var table = qs('audit-table');
		if (table) table.classList.toggle('audit-table-risk-mode', state.scope === 'risk');
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
				'<td class="audit-col-category"><span class="audit-cell-ellipsis">' + esc(categoryPath(row)) + '</span></td>' +
				'<td class="audit-col-operation"><span class="audit-cell-ellipsis">' + esc(workOperationLabel(row) || '-') + '</span></td>' +
				'<td class="audit-col-risk-reason"><span class="audit-risk-reason">' + esc(riskReasonLabel(row)) + '</span></td>' +
				'<td class="audit-col-action"><span class="audit-dot-label ' + actionClass(row.action_type) + '">' + esc(row.action_type || '-') + '</span></td>' +
				'<td class="audit-col-result"><span class="audit-dot-label ' + resultClass(row.action_result) + '">' + esc(row.action_result || '-') + '</span></td>' +
				'<td class="audit-col-fail-reason"><span class="audit-cell-ellipsis" title="' + esc(row.note || '') + '">' + esc(row.note || '-') + '</span></td>' +
				'<td class="audit-col-dept"><span class="audit-cell-ellipsis">' + esc(actorDeptText(row)) + '</span></td>' +
				'<td class="audit-col-emp-no"><span class="audit-resource-name">' + esc(actorEmpText(row)) + '</span></td>' +
				actorUserCell(row) +
				'<td class="audit-col-resource"><span class="audit-resource-name">' + esc(resource) + '</span></td>' +
				'<td class="audit-col-connect-account"><span class="audit-mono">' + esc(row.connect_account || '-') + '</span></td>' +
				activityHistoryCell(row) +
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
			var rows = data.rows || [];
			if (state.scope === 'risk') {
				state.rows = rows;
				state.total = data.total || 0;
				state.page = data.page || state.page;
			} else {
				state.rows = rows;
				state.total = data.total || 0;
				state.page = data.page || state.page;
			}
			if (state.scope !== 'risk') state.pageSize = safePageSize(data.page_size || state.pageSize);
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
			if (!state.agentTotal) info.textContent = '0-0 / 0개 항목';
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
	function findAuditRow(auditId) {
		var id = String(auditId || '');
		var found = null;
		state.rows.forEach(function (row) {
			if (String(row.id || '') === id) found = row;
		});
		return found;
	}
	function setActivityModalLoading(message) {
		var empty = qs('audit-activity-empty');
		var wrap = qs('audit-activity-table-wrap');
		var body = qs('audit-activity-table-body');
		if (body) body.innerHTML = '';
		if (wrap) wrap.hidden = true;
		if (empty) {
			empty.hidden = false;
			empty.textContent = message || '행위 이력을 불러오는 중입니다.';
		}
	}
	function renderActivityHistoryRows(rows) {
		var empty = qs('audit-activity-empty');
		var wrap = qs('audit-activity-table-wrap');
		var body = qs('audit-activity-table-body');
		if (!body || !wrap || !empty) return;
		if (!rows || !rows.length) {
			body.innerHTML = '';
			wrap.hidden = true;
			empty.hidden = false;
			empty.textContent = '기록된 명령어가 없습니다.';
			return;
		}
		empty.hidden = true;
		wrap.hidden = false;
		body.innerHTML = rows.map(function (row) {
			var command = row.command_text || row.command || '';
			return '<tr>' +
				'<td class="audit-activity-time">' + esc(formatDateTime(row.occurred_at)) + '</td>' +
				'<td class="audit-activity-command" title="' + esc(command) + '">' + esc(command || '-') + '</td>' +
			'</tr>';
		}).join('');
	}
	function openActivityHistoryModal(auditId) {
		var modal = qs('audit-activity-modal');
		var subtitle = qs('audit-activity-subtitle');
		var row = findAuditRow(auditId) || {};
		var resource = row.resource_name || (row.target_resource_id ? ('자원 #' + row.target_resource_id) : 'SSH 접속');
		if (!modal || !auditId) return;
		if (subtitle) {
			subtitle.textContent = resource + ' · ' + actorNameText(row) + (row.connect_account ? (' · ' + row.connect_account) : '');
		}
		document.body.classList.add('modal-open');
		modal.classList.add('show');
		modal.setAttribute('aria-hidden', 'false');
		modal.style.display = 'flex';
		setActivityModalLoading('행위 이력을 불러오는 중입니다.');
		fetchJson('/api/access-control/audit-logs/' + encodeURIComponent(auditId) + '/activity-history', {
			errorDefault: '행위 이력을 불러오지 못했습니다.'
		}).then(function (data) {
			renderActivityHistoryRows(data.rows || []);
		}).catch(function (err) {
			setActivityModalLoading(err.message || '행위 이력을 불러오지 못했습니다.');
		});
	}
	function closeActivityHistoryModal() {
		var modal = qs('audit-activity-modal');
		if (!modal) return;
		modal.classList.remove('show');
		modal.setAttribute('aria-hidden', 'true');
		modal.style.display = '';
		if (!auditModalsPreventBodyUnlock()) document.body.classList.remove('modal-open');
		else document.body.classList.add('modal-open');
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
		var w = Math.max(pgWrap.offsetWidth || 0, 112);
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
		syncSearchSelect(mf);
		setAgentSearchClearVisible();
		loadAgents(true);
	}
	function requestMeta(item) {
		var reason = String((item && item.reason) || '');
		var idMatch = reason.match(/\[신청 ID\]\s*([^\n]+)/);
		var typeMatch = reason.match(/\[신청 유형\]\s*([^\n]+)/);
		return {
			requestedId: idMatch ? idMatch[1].trim().replace(/\s+/g, '_') : '',
			systemAction: typeMatch ? typeMatch[1].trim() : ''
		};
	}
	function paymentCategoryAndAction(item) {
		var meta = requestMeta(item);
		var action = meta.systemAction || '';
		var parts = action.split(/\s*-\s*/);
		if (parts.length >= 2) {
			return {
				category: parts.shift().trim() || '-',
				action: parts.join(' - ').trim() || '-'
			};
		}
		return {
			category: item.request_type_label || (item.request_type === '삭제' ? '삭제 신청' : '사용 신청'),
			action: action || '-'
		};
	}
	function paymentStageText(row) {
		var phase = row.current_approval_phase || {};
		return phase.phase_name || row.current_approval_phase_name || row.approval_status || '-';
	}
	function paymentSearchText(row) {
		var ca = paymentCategoryAndAction(row);
		return [
			row.request_no,
			row.request_status,
			row.approval_status,
			row.requester_name,
			row.requester_emp_no,
			row.approver_name,
			row.approver_emp_no,
			ca.category,
			ca.action,
			(row.items || []).map(function (item) { return item.resource_name || item.resource_url || ''; }).join(' ')
		].join(' ').toLowerCase();
	}
	function paymentFilteredRows() {
		var keyword = String((qs('payment-keyword-filter') || {}).value || '').trim().toLowerCase();
		var status = String((qs('payment-status-filter') || {}).value || '').trim();
		var from = String((qs('payment-from-date') || {}).value || '').trim();
		var to = String((qs('payment-to-date') || {}).value || '').trim();
		return (state.payments || []).filter(function (row) {
			var date = String(row.submitted_at || row.created_at || '').slice(0, 10);
			if (keyword && paymentSearchText(row).indexOf(keyword) < 0) return false;
			if (status && row.request_status !== status && row.approval_status !== status) return false;
			if (from && date && date < from) return false;
			if (to && date && date > to) return false;
			return true;
		});
	}
	function paymentTotalPages() {
		return Math.max(1, Math.ceil((state.paymentTotal || 0) / state.paymentPageSize));
	}
	function renderPaymentPagination() {
		var pages = paymentTotalPages();
		var info = qs('payment-page-info');
		var box = qs('payment-page-numbers');
		if (info) {
			if (!state.paymentTotal) info.textContent = '0-0 / 0개 항목';
			else {
				var start = (state.paymentPage - 1) * state.paymentPageSize + 1;
				var end = Math.min(state.paymentTotal, state.paymentPage * state.paymentPageSize);
				info.textContent = start + '-' + end + ' / ' + state.paymentTotal + '개 항목';
			}
		}
		if (box) {
			box.innerHTML = pageNumberList(pages, state.paymentPage).map(function (page) {
				if (page === '...') return '<span class="page-ellipsis" aria-hidden="true">...</span>';
				return '<button type="button" class="page-btn' + (page === state.paymentPage ? ' active' : '') + '" data-page="' + page + '">' + page + '</button>';
			}).join('');
		}
		if (qs('payment-first')) qs('payment-first').disabled = state.paymentPage <= 1;
		if (qs('payment-prev')) qs('payment-prev').disabled = state.paymentPage <= 1;
		if (qs('payment-next')) qs('payment-next').disabled = state.paymentPage >= pages;
		if (qs('payment-last')) qs('payment-last').disabled = state.paymentPage >= pages;
	}
	function paymentStatusCell(value) {
		var status = value || '-';
		var cls = 'payment-status-neutral';
		if (status === '승인' || status === '부분 승인') cls = 'payment-status-approved';
		else if (status === '승인대기' || status === '제출') cls = 'payment-status-pending';
		else if (status === '반려' || status === '취소') cls = 'payment-status-rejected';
		return '<span class="payment-status ' + cls + '"><span></span>' + esc(status) + '</span>';
	}
	function renderPaymentRows() {
		var body = qs('payment-table-body');
		var wrap = qs('payment-table-wrap');
		var empty = qs('payment-empty');
		var count = qs('payment-count');
		var rows = paymentFilteredRows();
		state.paymentRows = rows;
		state.paymentTotal = rows.length;
		if (state.paymentPage > paymentTotalPages()) state.paymentPage = paymentTotalPages();
		if (count) count.textContent = formatNumber(state.paymentTotal);
		if (!body) return;
		if (!rows.length) {
			body.innerHTML = '';
			if (wrap) wrap.hidden = true;
			if (empty) empty.hidden = false;
			renderPaymentPagination();
			return;
		}
		if (wrap) wrap.hidden = false;
		if (empty) empty.hidden = true;
		var start = (state.paymentPage - 1) * state.paymentPageSize;
		body.innerHTML = rows.slice(start, start + state.paymentPageSize).map(function (row) {
			var ca = paymentCategoryAndAction(row);
			var resourceCount = row.resource_count || (row.items || []).length || 0;
			return '<tr>' +
				'<td class="payment-col-date">' + esc(formatDateTime(row.submitted_at || row.created_at)) + '</td>' +
				'<td class="payment-col-no"><strong>' + esc(row.request_no || '-') + '</strong><span class="ac-meta">' + esc((row.request_start_date || '-') + ' ~ ' + (row.request_end_date || '-')) + '</span></td>' +
				'<td class="payment-col-category">' + esc(ca.category) + '</td>' +
				'<td class="payment-col-action"><span class="audit-cell-ellipsis">' + esc(ca.action) + '</span></td>' +
				'<td class="payment-col-resource"><strong>' + esc(resourceCount) + '개</strong></td>' +
				'<td class="payment-col-status">' + paymentStatusCell(row.request_status || row.approval_status || '-') + '</td>' +
				'<td class="payment-col-stage"><strong>' + esc(paymentStageText(row)) + '</strong></td>' +
				'<td class="payment-col-requester">' + esc(row.requester_name || '-') + '<span class="ac-meta">' + esc(row.requester_emp_no || '-') + '</span></td>' +
				'<td class="payment-col-approver">' + esc(row.approver_name || '-') + '<span class="ac-meta">' + esc(row.approver_emp_no || '-') + '</span></td>' +
				'<td class="payment-col-emergency">' + esc(Number(row.emergency_flag || 0) ? '긴급' : '일반') + '</td>' +
			'</tr>';
		}).join('');
		renderPaymentPagination();
	}
	function setPaymentSearchClearVisible() {
		var input = qs('payment-keyword-filter');
		var clear = qs('payment-search-clear');
		if (!input || !clear) return;
		clear.classList.toggle('visible', !!String(input.value || '').trim());
	}
	function loadPayments(resetPage) {
		if (resetPage) state.paymentPage = 1;
		var body = qs('payment-table-body');
		if (body) body.innerHTML = '';
		if (qs('payment-table-wrap')) qs('payment-table-wrap').hidden = true;
		if (qs('payment-empty')) qs('payment-empty').hidden = false;
		if (qs('payment-empty-title')) qs('payment-empty-title').textContent = '결제 기록을 불러오는 중입니다.';
		return fetchJson('/api/access-control/requests?scope=all', { errorDefault: '결제 기록을 불러오지 못했습니다.' })
			.then(function (data) {
				state.payments = data.rows || [];
				state.paymentLoaded = true;
				renderPaymentRows();
			})
			.catch(function (err) {
				state.payments = [];
				state.paymentLoaded = true;
				if (qs('payment-empty-title')) qs('payment-empty-title').textContent = err.message || '결제 기록을 불러오지 못했습니다.';
				renderPaymentRows();
			});
	}
	function loadPaymentsDebounced() {
		if (paymentSearchTimer) window.clearTimeout(paymentSearchTimer);
		paymentSearchTimer = window.setTimeout(function () {
			state.paymentPage = 1;
			renderPaymentRows();
		}, 180);
	}
	function resetPaymentFilters() {
		if (qs('payment-keyword-filter')) qs('payment-keyword-filter').value = '';
		if (qs('payment-status-filter')) qs('payment-status-filter').value = '';
		clearDateField(qs('payment-from-date'));
		clearDateField(qs('payment-to-date'));
		setPaymentSearchClearVisible();
		syncSearchSelect(document);
		state.paymentPage = 1;
		renderPaymentRows();
	}
	function downloadPaymentCsv() {
		var rows = state.paymentRows && state.paymentRows.length ? state.paymentRows : paymentFilteredRows();
		if (!rows.length) {
			showAuditMessage('내려받을 결제 기록이 없습니다.', '안내');
			return;
		}
		var headers = ['신청일', '신청번호', '신청 구분', '신청 작업', '자원 개수', '상태', '승인 단계', '신청자', '신청자 사번', '승인자', '승인자 사번', '긴급'];
		var lines = [headers.map(csvCell).join(',')];
		rows.forEach(function (row) {
			var ca = paymentCategoryAndAction(row);
			lines.push([
				formatDateTime(row.submitted_at || row.created_at),
				row.request_no || '',
				ca.category,
				ca.action,
				row.resource_count || (row.items || []).length || 0,
				row.request_status || row.approval_status || '',
				paymentStageText(row),
				row.requester_name || '',
				row.requester_emp_no || '',
				row.approver_name || '',
				row.approver_emp_no || '',
				Number(row.emergency_flag || 0) ? '긴급' : '일반'
			].map(csvCell).join(','));
		});
		var blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
		var url = URL.createObjectURL(blob);
		var a = document.createElement('a');
		var ts = new Date();
		function pad(n) { return String(n).padStart(2, '0'); }
		a.href = url;
		a.download = 'access_control_payment_' + ts.getFullYear() + pad(ts.getMonth() + 1) + pad(ts.getDate()) + '_' + pad(ts.getHours()) + pad(ts.getMinutes()) + '.csv';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}
	function assetAccessInfo(row) {
		return row.access_info || row.primary_access_info || row.resource_url || row.host_address || row.primary_url || '-';
	}
	function assetCategoryPath(row) {
		return row.category_path || categoryPath(row);
	}
	function assetOperationText(row) {
		if ((row.category_name || row.category_label || row.category) === '관리콘솔') return row.category_detail || row.console_group || '-';
		return row.work_operation_name || row.work_operation || row.work_operation_code || '-';
	}
	function assetStatusText(row) {
		return Number(row.active_flag || 0) ? '사용' : '차단';
	}
	function assetSearchText(row) {
		return [
			row.resource_name,
			row.resource_url,
			row.host_address,
			row.resource_type,
			assetCategoryPath(row),
			assetOperationText(row),
			assetStatusText(row),
			row.created_by,
			row.description
		].join(' ').toLowerCase();
	}
	function assetFilteredRows() {
		var keyword = String((qs('asset-keyword-filter') || {}).value || '').trim().toLowerCase();
		var category = String((qs('asset-category-filter') || {}).value || '').trim();
		var status = String((qs('asset-status-filter') || {}).value || '').trim();
		return (state.assets || []).filter(function (row) {
			var active = Number(row.active_flag || 0) ? 'active' : 'blocked';
			if (keyword && assetSearchText(row).indexOf(keyword) < 0) return false;
			if (category && (row.category_name || row.category_label || row.category) !== category) return false;
			if (status && active !== status) return false;
			return true;
		});
	}
	function assetTotalPages() {
		return Math.max(1, Math.ceil((state.assetTotal || 0) / state.assetPageSize));
	}
	function renderAssetPagination() {
		var pages = assetTotalPages();
		var info = qs('asset-page-info');
		var box = qs('asset-page-numbers');
		if (info) {
			if (!state.assetTotal) info.textContent = '0-0 / 0개 항목';
			else {
				var start = (state.assetPage - 1) * state.assetPageSize + 1;
				var end = Math.min(state.assetTotal, state.assetPage * state.assetPageSize);
				info.textContent = start + '-' + end + ' / ' + state.assetTotal + '개 항목';
			}
		}
		if (box) {
			box.innerHTML = pageNumberList(pages, state.assetPage).map(function (page) {
				if (page === '...') return '<span class="page-ellipsis" aria-hidden="true">...</span>';
				return '<button type="button" class="page-btn' + (page === state.assetPage ? ' active' : '') + '" data-page="' + page + '">' + page + '</button>';
			}).join('');
		}
		if (qs('asset-first')) qs('asset-first').disabled = state.assetPage <= 1;
		if (qs('asset-prev')) qs('asset-prev').disabled = state.assetPage <= 1;
		if (qs('asset-next')) qs('asset-next').disabled = state.assetPage >= pages;
		if (qs('asset-last')) qs('asset-last').disabled = state.assetPage >= pages;
	}
	function renderAssetRows() {
		var body = qs('asset-table-body');
		var wrap = qs('asset-table-wrap');
		var empty = qs('asset-empty');
		var count = qs('asset-count');
		var rows = assetFilteredRows();
		state.assetRows = rows;
		state.assetTotal = rows.length;
		if (state.assetPage > assetTotalPages()) state.assetPage = assetTotalPages();
		if (count) count.textContent = formatNumber(state.assetTotal);
		if (!body) return;
		if (!rows.length) {
			body.innerHTML = '';
			if (wrap) wrap.hidden = true;
			if (empty) empty.hidden = false;
			renderAssetPagination();
			return;
		}
		if (wrap) wrap.hidden = false;
		if (empty) empty.hidden = true;
		var start = (state.assetPage - 1) * state.assetPageSize;
		body.innerHTML = rows.slice(start, start + state.assetPageSize).map(function (row) {
			return '<tr>' +
				'<td class="asset-col-date">' + esc(formatDateTime(row.created_at)) + '</td>' +
				'<td class="asset-col-category">' + esc(assetCategoryPath(row)) + '</td>' +
				'<td class="asset-col-kind">' + kindCell(row) + '</td>' +
				'<td class="asset-col-name"><strong>' + esc(row.resource_name || '-') + '</strong></td>' +
				'<td class="asset-col-operation"><span class="audit-cell-ellipsis">' + esc(assetOperationText(row)) + '</span></td>' +
				'<td class="asset-col-access"><span class="audit-access-info">' + esc(assetAccessInfo(row)) + '</span></td>' +
				'<td class="asset-col-status">' + paymentStatusCell(assetStatusText(row)) + '</td>' +
				'<td class="asset-col-period">' + esc(row.default_period_days || '-') + '일</td>' +
				'<td class="asset-col-approval">' + esc(Number(row.approval_required || 0) ? '필요' : '불필요') + '</td>' +
				'<td class="asset-col-owner">' + esc(row.created_by || '-') + '</td>' +
			'</tr>';
		}).join('');
		renderAssetPagination();
	}
	function setAssetSearchClearVisible() {
		var input = qs('asset-keyword-filter');
		var clear = qs('asset-search-clear');
		if (!input || !clear) return;
		clear.classList.toggle('visible', !!String(input.value || '').trim());
	}
	function loadAssets(resetPage) {
		if (resetPage) state.assetPage = 1;
		var body = qs('asset-table-body');
		if (body) body.innerHTML = '';
		if (qs('asset-table-wrap')) qs('asset-table-wrap').hidden = true;
		if (qs('asset-empty')) qs('asset-empty').hidden = false;
		if (qs('asset-empty-title')) qs('asset-empty-title').textContent = '자산 기록을 불러오는 중입니다.';
		return fetchJson('/api/access-control/resources', { errorDefault: '자산 기록을 불러오지 못했습니다.' })
			.then(function (data) {
				state.assets = data.rows || [];
				state.assetLoaded = true;
				renderAssetRows();
			})
			.catch(function (err) {
				state.assets = [];
				state.assetLoaded = true;
				if (qs('asset-empty-title')) qs('asset-empty-title').textContent = err.message || '자산 기록을 불러오지 못했습니다.';
				renderAssetRows();
			});
	}
	function loadAssetsDebounced() {
		if (assetSearchTimer) window.clearTimeout(assetSearchTimer);
		assetSearchTimer = window.setTimeout(function () {
			state.assetPage = 1;
			renderAssetRows();
		}, 180);
	}
	function resetAssetFilters() {
		if (qs('asset-keyword-filter')) qs('asset-keyword-filter').value = '';
		if (qs('asset-category-filter')) qs('asset-category-filter').value = '';
		if (qs('asset-status-filter')) qs('asset-status-filter').value = '';
		setAssetSearchClearVisible();
		syncSearchSelect(document);
		state.assetPage = 1;
		renderAssetRows();
	}
	function downloadAssetCsv() {
		var rows = state.assetRows && state.assetRows.length ? state.assetRows : assetFilteredRows();
		if (!rows.length) {
			showAuditMessage('내려받을 자산 기록이 없습니다.', '안내');
			return;
		}
		var headers = ['등록일', '분류', '유형', '자원명', '업무 운영/장비군', '접속정보', '상태', '기본 기간', '승인', '등록자'];
		var lines = [headers.map(csvCell).join(',')];
		rows.forEach(function (row) {
			lines.push([
				formatDateTime(row.created_at),
				assetCategoryPath(row),
				normalizeKind(row) || row.resource_type || '',
				row.resource_name || '',
				assetOperationText(row),
				assetAccessInfo(row),
				assetStatusText(row),
				(row.default_period_days || '') + '일',
				Number(row.approval_required || 0) ? '필요' : '불필요',
				row.created_by || ''
			].map(csvCell).join(','));
		});
		var blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
		var url = URL.createObjectURL(blob);
		var a = document.createElement('a');
		var ts = new Date();
		function pad(n) { return String(n).padStart(2, '0'); }
		a.href = url;
		a.download = 'access_control_asset_' + ts.getFullYear() + pad(ts.getMonth() + 1) + pad(ts.getDate()) + '_' + pad(ts.getHours()) + pad(ts.getMinutes()) + '.csv';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}
	function showScope(scope) {
		var nextScope = scope === 'agent' ? 'agent' : (scope === 'payment' ? 'payment' : (scope === 'asset' ? 'asset' : (scope === 'risk' ? 'risk' : 'access')));
		var accessPane = qs('audit-list-pane');
		var agentPane = qs('agent-list-pane');
		var paymentPane = qs('payment-list-pane');
		var assetPane = qs('asset-list-pane');
		var opWrapper = qs('audit-work-operation-wrapper');
		if (nextScope === state.scope) return;
		state.scope = nextScope;
		var riskPolicy = qs('audit-risk-policy');
		if (riskPolicy) riskPolicy.hidden = true;
		var riskPolicyToolbar = qs('audit-risk-policy-toolbar-open');
		if (riskPolicyToolbar) riskPolicyToolbar.hidden = state.scope !== 'risk';
		Array.prototype.forEach.call(document.querySelectorAll('.audit-tabs [data-audit-scope]'), function (tab) {
			var active = tab.getAttribute('data-audit-scope') === state.scope;
			tab.classList.toggle('active', active);
			tab.setAttribute('aria-selected', active ? 'true' : 'false');
		});
		if (accessPane) accessPane.hidden = !(state.scope === 'access' || state.scope === 'risk');
		if (agentPane) agentPane.hidden = state.scope !== 'agent';
		if (paymentPane) paymentPane.hidden = state.scope !== 'payment';
		if (assetPane) assetPane.hidden = state.scope !== 'asset';
		syncAuditCategoryDetailFilter();
		if (opWrapper && state.scope === 'risk') opWrapper.hidden = true;
		if (state.scope === 'agent') {
			if (!state.agentLoaded) loadAgents(true);
			else renderAgentRows();
			window.requestAnimationFrame(function () {
				window.requestAnimationFrame(syncAgentMappingFilterToPageSizeSelect);
			});
		} else if (state.scope === 'payment') {
			resetAgentMappingFilterSelectWidth();
			if (!state.paymentLoaded) loadPayments(true);
			else renderPaymentRows();
		} else if (state.scope === 'asset') {
			resetAgentMappingFilterSelectWidth();
			if (!state.assetLoaded) loadAssets(true);
			else renderAssetRows();
		} else if (state.scope === 'risk') {
			resetAgentMappingFilterSelectWidth();
			var riskPolicy = qs('audit-risk-policy');
			if (riskPolicy) riskPolicy.hidden = true;
			loadRows(true);
		} else {
			resetAgentMappingFilterSelectWidth();
			var accessRiskPolicy = qs('audit-risk-policy');
			if (accessRiskPolicy) accessRiskPolicy.hidden = true;
			syncAuditCategoryDetailFilter();
			setCount();
		}
	}
	function syncDateConstraints() {
		var start = qs('audit-from-date');
		var end = qs('audit-to-date');
		var paymentStart = qs('payment-from-date');
		var paymentEnd = qs('payment-to-date');
		if (start && start._flatpickr) start._flatpickr.set('maxDate', (end && end.value) || null);
		if (end && end._flatpickr) end._flatpickr.set('minDate', (start && start.value) || null);
		if (paymentStart && paymentStart._flatpickr) paymentStart._flatpickr.set('maxDate', (paymentEnd && paymentEnd.value) || null);
		if (paymentEnd && paymentEnd._flatpickr) paymentEnd._flatpickr.set('minDate', (paymentStart && paymentStart.value) || null);
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
		if (qs('payment-from-date') && qs('payment-to-date')) {
			window.flatpickr(qs('payment-from-date'), Object.assign({}, opts, {
				onChange: function () {
					syncDateConstraints();
					state.paymentPage = 1;
					renderPaymentRows();
				}
			}));
			window.flatpickr(qs('payment-to-date'), Object.assign({}, opts, {
				onChange: function () {
					syncDateConstraints();
					state.paymentPage = 1;
					renderPaymentRows();
				}
			}));
		}
	}
	function resetFilters() {
		qs('audit-keyword-filter').value = '';
		setSearchClearVisible();
		if (qs('audit-category-filter')) qs('audit-category-filter').value = '';
		if (qs('audit-category-detail-filter')) qs('audit-category-detail-filter').value = '';
		if (qs('audit-work-operation-filter')) qs('audit-work-operation-filter').value = '';
		syncAuditCategoryDetailFilter();
		syncSearchSelect(document);
		clearDateField(qs('audit-from-date'));
		clearDateField(qs('audit-to-date'));
		loadRows(true);
	}
	function bindEvents() {
		ensureRiskAuditUi();
		var pageSize = qs('audit-page-size');
		var selectAll = qs('audit-select-all');
		var keyword = qs('audit-keyword-filter');
		var clear = qs('audit-search-clear');
		var auditCategory = qs('audit-category-filter');
		var auditCategoryDetail = qs('audit-category-detail-filter');
		var auditWorkOperation = qs('audit-work-operation-filter');
		var agentPageSize = qs('agent-page-size');
		var agentKeyword = qs('agent-keyword-filter');
		var agentClear = qs('agent-search-clear');
		var agentMapping = qs('agent-mapping-filter');
		var agentReset = qs('agent-reset-btn');
		var agentBody = qs('agent-table-body');
		var paymentKeyword = qs('payment-keyword-filter');
		var paymentClear = qs('payment-search-clear');
		var paymentStatus = qs('payment-status-filter');
		var paymentPageSize = qs('payment-page-size');
		var paymentReset = qs('payment-reset-btn');
		var assetKeyword = qs('asset-keyword-filter');
		var assetClear = qs('asset-search-clear');
		var assetCategory = qs('asset-category-filter');
		var assetStatus = qs('asset-status-filter');
		var assetPageSize = qs('asset-page-size');
		var assetReset = qs('asset-reset-btn');
		var modal = qs('agent-map-modal');
		var userSearch = qs('agent-user-search');
		var userResults = qs('agent-user-results');
		var agentTable = qs('agent-table');
		var auditBody = qs('audit-table-body');
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
		if (auditCategory) {
			auditCategory.addEventListener('change', function () {
				syncAuditCategoryDetailFilter();
				loadRows(true);
			});
		}
		if (auditCategoryDetail) {
			auditCategoryDetail.addEventListener('change', function () { loadRows(true); });
		}
		if (auditWorkOperation) {
			auditWorkOperation.addEventListener('change', function () { loadRows(true); });
		}
		if (qs('audit-risk-policy-open')) qs('audit-risk-policy-open').addEventListener('click', openRiskPolicyModal);
		if (qs('audit-risk-policy-toolbar-open')) qs('audit-risk-policy-toolbar-open').addEventListener('click', openRiskPolicyModal);
		if (qs('audit-risk-policy-close')) qs('audit-risk-policy-close').addEventListener('click', closeRiskPolicyModal);
		if (qs('audit-risk-policy-add')) qs('audit-risk-policy-add').addEventListener('click', addRiskPolicyItem);
		if (qs('audit-risk-policy-input')) {
			qs('audit-risk-policy-input').addEventListener('keydown', function (event) {
				if (event.key === 'Enter') {
					event.preventDefault();
					addRiskPolicyItem();
				}
			});
		}
		if (qs('audit-risk-policy-tabs')) {
			qs('audit-risk-policy-tabs').addEventListener('click', function (event) {
				var tab = event.target.closest('[data-risk-policy-tab]');
				if (!tab) return;
				state.riskPolicyTab = tab.getAttribute('data-risk-policy-tab') || 'overseas';
				renderRiskPolicyModal();
			});
		}
		if (qs('audit-risk-policy-items')) {
			qs('audit-risk-policy-items').addEventListener('click', function (event) {
				var button = event.target.closest('[data-risk-policy-id]');
				var id = button ? button.getAttribute('data-risk-policy-id') : '';
				if (!button || !id) return;
				deleteRiskPolicy(id).then(loadRiskPolicies).then(function () {
					renderRiskPolicyModal();
					if (state.scope === 'risk') loadRows(true);
				}).catch(function (err) {
					showAuditMessage(err.message || '위험 접근 기준을 삭제하지 못했습니다.', '안내');
				});
			});
		}
		if (qs('audit-risk-policy-items')) {
			qs('audit-risk-policy-items').addEventListener('click', function (event) {
				var toggle = event.target.closest('[data-risk-policy-toggle]');
				if (!toggle) return;
				var id = toggle.getAttribute('data-risk-policy-toggle') || '';
				var nextActive = toggle.getAttribute('data-risk-policy-active') !== '1';
				if (!id) return;
				toggle.disabled = true;
				updateRiskPolicy(id, { active: nextActive }).then(loadRiskPolicies).then(function () {
					renderRiskPolicyModal();
					if (state.scope === 'risk') loadRows(true);
				}).catch(function (err) {
					showAuditMessage(err.message || '위험 접근 기준 상태를 변경하지 못했습니다.', '안내');
				});
			});
			qs('audit-risk-policy-items').addEventListener('change', function (event) {
				var all = event.target.closest('#audit-risk-policy-check-all');
				if (!all) return;
				Array.prototype.forEach.call(document.querySelectorAll('.audit-risk-policy-row-check'), function (checkbox) {
					checkbox.checked = all.checked;
					var row = checkbox.closest('tr');
					if (row) row.classList.toggle('selected', checkbox.checked);
				});
			});
			qs('audit-risk-policy-items').addEventListener('change', function (event) {
				var checkbox = event.target.closest('.audit-risk-policy-row-check');
				if (!checkbox) return;
				var row = checkbox.closest('tr');
				if (row) row.classList.toggle('selected', checkbox.checked);
				var checks = Array.prototype.slice.call(document.querySelectorAll('.audit-risk-policy-row-check'));
				var all = qs('audit-risk-policy-check-all');
				if (all && checks.length) all.checked = checks.every(function (item) { return item.checked; });
			});
			qs('audit-risk-policy-items').addEventListener('click', function (event) {
				if (event.target.closest('button, input, select, label, a')) return;
				var row = event.target.closest('.audit-risk-policy-table tbody tr');
				if (!row) return;
				var checkbox = row.querySelector('.audit-risk-policy-row-check');
				if (!checkbox) return;
				checkbox.checked = !checkbox.checked;
				row.classList.toggle('selected', checkbox.checked);
				var checks = Array.prototype.slice.call(document.querySelectorAll('.audit-risk-policy-row-check'));
				var all = qs('audit-risk-policy-check-all');
				if (all && checks.length) all.checked = checks.every(function (item) { return item.checked; });
			});
		}
		if (qs('audit-risk-type-filter')) {
			qs('audit-risk-type-filter').addEventListener('change', function () {
				state.riskType = qs('audit-risk-type-filter').value || '';
				if (state.scope === 'risk') loadRows(true);
			});
		}
		if (qs('audit-risk-ip-add')) {
			qs('audit-risk-ip-add').addEventListener('click', function () {
				var input = qs('audit-risk-ip-input');
				var value = input ? String(input.value || '').trim() : '';
				if (!value) return;
				if (state.riskIpBlocklist.indexOf(value) < 0) state.riskIpBlocklist.push(value);
				if (input) input.value = '';
				saveRiskIpBlocklist();
				renderRiskIpList();
				if (state.scope === 'risk') loadRows(true);
			});
		}
		if (qs('audit-risk-ip-list')) {
			qs('audit-risk-ip-list').addEventListener('click', function (event) {
				var chip = event.target.closest('[data-risk-ip]');
				if (!chip) return;
				var value = chip.getAttribute('data-risk-ip') || '';
				state.riskIpBlocklist = state.riskIpBlocklist.filter(function (item) { return item !== value; });
				saveRiskIpBlocklist();
				renderRiskIpList();
				if (state.scope === 'risk') loadRows(true);
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
		if (paymentKeyword) {
			paymentKeyword.addEventListener('input', function () {
				setPaymentSearchClearVisible();
				loadPaymentsDebounced();
			});
			paymentKeyword.addEventListener('keydown', function (event) {
				if (event.key === 'Escape') {
					paymentKeyword.value = '';
					setPaymentSearchClearVisible();
					state.paymentPage = 1;
					renderPaymentRows();
				}
			});
		}
		if (paymentClear) {
			paymentClear.addEventListener('click', function () {
				if (paymentKeyword) paymentKeyword.value = '';
				setPaymentSearchClearVisible();
				state.paymentPage = 1;
				renderPaymentRows();
			});
		}
		if (paymentStatus) paymentStatus.addEventListener('change', function () { state.paymentPage = 1; renderPaymentRows(); });
		if (paymentReset) paymentReset.addEventListener('click', resetPaymentFilters);
		if (qs('payment-download-btn')) qs('payment-download-btn').addEventListener('click', downloadPaymentCsv);
		if (paymentPageSize) {
			paymentPageSize.addEventListener('change', function () {
				state.paymentPageSize = safePageSize(paymentPageSize.value);
				state.paymentPage = 1;
				renderPaymentRows();
			});
		}
		if (assetKeyword) {
			assetKeyword.addEventListener('input', function () {
				setAssetSearchClearVisible();
				loadAssetsDebounced();
			});
			assetKeyword.addEventListener('keydown', function (event) {
				if (event.key === 'Escape') {
					assetKeyword.value = '';
					setAssetSearchClearVisible();
					state.assetPage = 1;
					renderAssetRows();
				}
			});
		}
		if (assetClear) {
			assetClear.addEventListener('click', function () {
				if (assetKeyword) assetKeyword.value = '';
				setAssetSearchClearVisible();
				state.assetPage = 1;
				renderAssetRows();
			});
		}
		if (assetCategory) assetCategory.addEventListener('change', function () { state.assetPage = 1; renderAssetRows(); });
		if (assetStatus) assetStatus.addEventListener('change', function () { state.assetPage = 1; renderAssetRows(); });
		if (assetReset) assetReset.addEventListener('click', resetAssetFilters);
		if (qs('asset-download-btn')) qs('asset-download-btn').addEventListener('click', downloadAssetCsv);
		if (assetPageSize) {
			assetPageSize.addEventListener('change', function () {
				state.assetPageSize = safePageSize(assetPageSize.value);
				state.assetPage = 1;
				renderAssetRows();
			});
		}
		if (qs('asset-first')) qs('asset-first').addEventListener('click', function () {
			if (state.assetPage > 1) { state.assetPage = 1; renderAssetRows(); }
		});
		if (qs('asset-prev')) qs('asset-prev').addEventListener('click', function () {
			if (state.assetPage > 1) { state.assetPage--; renderAssetRows(); }
		});
		if (qs('asset-next')) qs('asset-next').addEventListener('click', function () {
			if (state.assetPage < assetTotalPages()) { state.assetPage++; renderAssetRows(); }
		});
		if (qs('asset-last')) qs('asset-last').addEventListener('click', function () {
			var pages = assetTotalPages();
			if (state.assetPage < pages) { state.assetPage = pages; renderAssetRows(); }
		});
		if (qs('asset-page-numbers')) {
			qs('asset-page-numbers').addEventListener('click', function (event) {
				var button = event.target.closest('.page-btn[data-page]');
				var page;
				if (!button) return;
				page = parseInt(button.getAttribute('data-page'), 10);
				if (page && page !== state.assetPage) { state.assetPage = page; renderAssetRows(); }
			});
		}
		if (qs('payment-first')) qs('payment-first').addEventListener('click', function () {
			if (state.paymentPage > 1) { state.paymentPage = 1; renderPaymentRows(); }
		});
		if (qs('payment-prev')) qs('payment-prev').addEventListener('click', function () {
			if (state.paymentPage > 1) { state.paymentPage--; renderPaymentRows(); }
		});
		if (qs('payment-next')) qs('payment-next').addEventListener('click', function () {
			if (state.paymentPage < paymentTotalPages()) { state.paymentPage++; renderPaymentRows(); }
		});
		if (qs('payment-last')) qs('payment-last').addEventListener('click', function () {
			var pages = paymentTotalPages();
			if (state.paymentPage < pages) { state.paymentPage = pages; renderPaymentRows(); }
		});
		if (qs('payment-page-numbers')) {
			qs('payment-page-numbers').addEventListener('click', function (event) {
				var button = event.target.closest('.page-btn[data-page]');
				var page;
				if (!button) return;
				page = parseInt(button.getAttribute('data-page'), 10);
				if (page && page !== state.paymentPage) { state.paymentPage = page; renderPaymentRows(); }
			});
		}
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
		if (qs('audit-activity-close')) qs('audit-activity-close').addEventListener('click', closeActivityHistoryModal);
		var activityModal = qs('audit-activity-modal');
		if (activityModal) {
			activityModal.addEventListener('click', function (event) {
				if (event.target === activityModal) closeActivityHistoryModal();
			});
		}
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
			var ahm = qs('audit-activity-modal');
			if (ahm && ahm.classList.contains('show')) {
				closeActivityHistoryModal();
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
		if (auditBody) {
			auditBody.addEventListener('change', function (event) {
				if (event.target && event.target.classList.contains('audit-row-check')) syncSelectAll();
			});
			auditBody.addEventListener('click', function (event) {
				var button = event.target.closest('.audit-activity-btn[data-audit-id]');
				if (!button) return;
				event.preventDefault();
				openActivityHistoryModal(button.getAttribute('data-audit-id'));
			});
		}
		document.body.addEventListener('click', function (event) {
			if (event.target && event.target.closest && event.target.closest('#audit-risk-policy-toolbar-open')) {
				event.preventDefault();
				openRiskPolicyModal();
				return;
			}
			if (event.target && event.target.closest && event.target.closest('#audit-risk-ip-add')) {
				var input = qs('audit-risk-ip-input');
				var value = input ? String(input.value || '').trim() : '';
				if (!value) return;
				if (state.riskIpBlocklist.indexOf(value) < 0) state.riskIpBlocklist.push(value);
				if (input) input.value = '';
				saveRiskIpBlocklist();
				renderRiskIpList();
				if (state.scope === 'risk') loadRows(true);
				return;
			}
			if (event.target && event.target.closest && event.target.closest('[data-risk-ip]')) {
				var chip = event.target.closest('[data-risk-ip]');
				var ipValue = chip ? chip.getAttribute('data-risk-ip') : '';
				state.riskIpBlocklist = state.riskIpBlocklist.filter(function (item) { return item !== ipValue; });
				saveRiskIpBlocklist();
				renderRiskIpList();
				if (state.scope === 'risk') loadRows(true);
				return;
			}
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
		syncAuditCategoryDetailFilter();
		loadWorkOperations().then(function () {
			var params = new URLSearchParams(window.location.search || '');
			if (params.get('scope') === 'risk' || params.get('risk') === '1') {
				showScope('risk');
				return null;
			}
			return loadRows(true);
		});
	});
})();

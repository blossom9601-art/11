(function () {
	'use strict';

	var state = {
		bootstrap: {
			admins: [], users: [], system_types: [],
			integration_types: [], sample_operations_personal_integrated: [],
			access_methods: [],
			integrated_agents: [],
			integrated_operations_need_agent: [],
		},
		rows: [],
		page: 1,
		pageSize: 10,
		wizardStep: 1,
		uploadTargetId: null,
	};

	function qs(id) { return document.getElementById(id); }
	function esc(value) {
		return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
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
		opts.cache = opts.cache || 'no-store';
		opts.headers = Object.assign({ 'Accept': 'application/json' }, csrfHeader(), opts.headers || {});
		return fetch(url, opts).then(function (res) {
			return res.json().catch(function () { return {}; }).then(function (data) {
				if (!res.ok || data.success === false) throw new Error((data && (data.message || data.error)) || ('HTTP ' + res.status));
				return data;
			});
		});
	}
	function sendJson(url, method, payload) {
		return fetchJson(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}) });
	}
	function postEmpty(url) {
		return fetchJson(url, { method: 'POST' });
	}
	function showMessage(message) { window.alert(String(message || '')); }
	function integrationLabel(code) {
		var c = String(code || 'INTEGRATED').toUpperCase();
		var map = { INTEGRATED: '연동', NON_INTEGRATED: '미연동', AD: 'AD' };
		return map[c] || c;
	}
	function statusPill(status) {
		var cls = status === '승인' ? 'active' : (status === '반려' ? 'error' : (status === '처리중' ? 'pending' : 'pending'));
		return '<span class="identity-status-pill ' + cls + '">' + esc(status || '-') + '</span>';
	}
	function workflowMini(row) {
		var wf = row.workflow_status || '';
		var label = row.workflow_label_ko || wf || '-';
		return '<span class="identity-workflow-pill">' + esc(label) + '</span>';
	}
	function accountTypeLabel(type) { return type === 'SERVICE' ? '서비스 계정' : '개인 계정'; }
	function badgeType(type) {
		return '<span class="identity-badge ' + (type === 'SERVICE' ? 'service' : 'personal') + '">' + esc(accountTypeLabel(type)) + '</span>';
	}
	function systemTag(type) { return '<span class="identity-tag system-' + esc(String(type || '').toLowerCase()) + '">' + esc(type || '-') + '</span>'; }
	function formatDate(value) { return value ? String(value).replace('T', ' ').slice(0, 19) : '-'; }

	function luminaJobCell(row) {
		var lj = row.lumina_account_job;
		if (!lj) return '<span class="identity-muted">-</span>';
		var st = String(lj.status || '-');
		var raw = st.toUpperCase();
		var cls = (raw === 'SUCCEEDED' || raw === 'APPROVED') ? 'active' : (raw === 'FAILED' ? 'error' : 'pending');
		var host = lj.hostname ? esc(String(lj.hostname)) : '';
		var ec = lj.errorCode != null && String(lj.errorCode) !== '' ? esc(String(lj.errorCode)) : '';
		var tid = lj.requestId ? esc(String(lj.requestId)) : '';
		var tipParts = [];
		if (tid) tipParts.push('requestId: ' + tid);
		if (host) tipParts.push('호스트: ' + host);
		if (ec) tipParts.push('오류코드: ' + ec);
		if (lj.resultTail) tipParts.push(esc(String(lj.resultTail).replace(/\s+/g, ' ').slice(0, 200)));
		var titleAttr = tipParts.length ? ' title="' + tipParts.join(' · ').replace(/"/g, '&quot;') + '"' : '';
		var sub = [host ? ('호스트 ' + host) : '', ec ? ('코드 ' + ec) : ''].filter(Boolean).join(' · ');
		return '<div class="identity-job-cell"' + titleAttr + '><span class="identity-status-pill ' + cls + '">' + esc(st) + '</span>' +
			(sub ? '<div class="identity-muted identity-job-sub">' + sub + '</div>' : '') + '</div>';
	}

	function fillSelect(selectEl, rows, labelFn, valueFn) {
		selectEl.innerHTML = '';
		rows.forEach(function (row) {
			var opt = document.createElement('option');
			opt.value = valueFn ? String(valueFn(row)) : String(row.id != null ? row.id : row);
			opt.textContent = labelFn ? labelFn(row) : String(row);
			selectEl.appendChild(opt);
		});
	}

	function integrationRadiosMounted() {
		var holder = qs('integration-type-radios');
		var metaMap = {
			INTEGRATED: '운영 승인 후 선택한 에이전트가 계정 작업(Job)을 처리합니다.',
			NON_INTEGRATED: 'Agent 자동 반영 없음 · 증적 업로드·최종 완료까지 수동 절차가 있습니다.',
			AD: 'Active Directory 계정 요청입니다. 안내에 따라 처리됩니다.'
		};
		var types = state.bootstrap.integration_types && state.bootstrap.integration_types.length
			? state.bootstrap.integration_types
			: [
				{ code: 'INTEGRATED', label: '연동 시스템', desc: metaMap.INTEGRATED },
				{ code: 'NON_INTEGRATED', label: '미연동 · 수동 처리', desc: metaMap.NON_INTEGRATED },
				{ code: 'AD', label: 'AD 계정', desc: metaMap.AD }
			];
		holder.innerHTML = types.map(function (t, idx) {
			var code = t.code || t;
			var label = t.label || code;
			var codeU = String(code).toUpperCase();
			var desc = esc(t.desc || metaMap[codeU] || '');
			var checked = idx === 0 ? 'checked' : '';
			return '<label class="identity-option-card">' +
				'<input type="radio" name="integration_type" value="' + esc(code) + '" ' + checked + '>' +
				'<span class="identity-option-card-body">' +
				'<span class="identity-option-card-title">' + esc(label) + '</span>' +
				'<span class="identity-option-card-desc">' + desc + '</span>' +
				'</span></label>';
		}).join('');
		Array.prototype.forEach.call(holder.querySelectorAll('input[name="integration_type"]'), function (r) {
			r.addEventListener('change', updateIntegratedUi);
		});
	}

	function getSelectedIntegration() {
		var el = document.querySelector('input[name="integration_type"]:checked');
		return el ? String(el.value).toUpperCase() : 'INTEGRATED';
	}

	function operationNeedsAgent(opRaw) {
		var op = String(opRaw || '').trim().toUpperCase();
		var codes = state.bootstrap.integrated_operations_need_agent || [];
		for (var i = 0; i < codes.length; i++) {
			if (String(codes[i] || '').toUpperCase() === op) return true;
		}
		return false;
	}

	function fillOperationDatalist() {
		var dl = qs('datalist-integration-ops');
		if (!dl) return;
		dl.innerHTML = '';
		var seen = {};
		['INTEGRATED_ACCOUNT_BIND'].concat(state.bootstrap.integrated_operations_need_agent || []).forEach(function (c) {
			var k = String(c || '').trim().toUpperCase();
			if (!k || seen[k]) return;
			seen[k] = true;
			var opt = document.createElement('option');
			opt.value = k;
			dl.appendChild(opt);
		});
	}

	function fillIntegratedAgents() {
		var sel = qs('request-agent-pending-id');
		if (!sel) return;
		var cur = sel.value;
		sel.innerHTML = '';
		var def = document.createElement('option');
		def.value = '';
		def.textContent = '(미선택 — 통합 매핑 전용 신청)';
		sel.appendChild(def);
		var rows = (state.bootstrap.integrated_agents || []).slice();
		rows.sort(function (a, b) {
			var ea = a.enabled ? 1 : 0;
			var eb = b.enabled ? 1 : 0;
			if (ea !== eb) return eb - ea;
			return String(a.hostname || '').localeCompare(String(b.hostname || ''));
		});
		rows.forEach(function (r) {
			var opt = document.createElement('option');
			opt.value = String(r.id);
			var label = '#' + r.id + ' · ' + (r.hostname || '-') + ' · ' + (r.ip_address || r.fqdn || r.status || '');
			if (!r.enabled) label += ' (비활성)';
			if (r.linked) label += ' · 자산연동';
			opt.textContent = label;
			sel.appendChild(opt);
		});
		if (cur) {
			sel.value = cur;
			if (sel.value !== cur) sel.value = '';
		}
	}

	function updateAgentGuidance() {
		var gh = qs('request-agent-guidance');
		var sel = qs('request-agent-pending-id');
		var opWrap = qs('identity-integrated-agent-wrap');
		if (!opWrap || opWrap.hidden) return;
		if (!gh || !sel) return;
		var op = (qs('request-operation-type').value || '').trim().toUpperCase();
		if (operationNeedsAgent(op)) {
			gh.textContent = '현재 작업 유형은 Agent Root Worker 처리가 필요합니다. 에이전트를 선택해야 신청 저장 및 승인 시 Job 큐가 생성됩니다.';
		} else {
			gh.textContent = 'INTEGRATED_ACCOUNT_BIND 등 에이전트 없이 처리되는 신청이라면 선택하지 않아도 됩니다.';
		}
	}

	function updateIntegratedUi() {
		var integ = getSelectedIntegration();
		var banner = qs('identity-wizard-banner');
		var manualWrap = qs('identity-manual-fields');
		var integratedWrap = qs('identity-integrated-agent-wrap');
		var showManual = integ === 'NON_INTEGRATED';
		var showBanner = showManual || integ === 'AD';
		if (banner) banner.classList.toggle('visible', showBanner);
		if (manualWrap) manualWrap.hidden = !showManual;
		if (integratedWrap) integratedWrap.hidden = integ !== 'INTEGRATED';
		updateAgentGuidance();
	}
	function showWizardStep(n) {
		state.wizardStep = Math.max(1, Math.min(3, n));
		var panels = document.querySelectorAll('[data-wizard-panel]');
		Array.prototype.forEach.call(panels, function (panel) {
			var stepNum = parseInt(panel.getAttribute('data-wizard-panel'), 10);
			panel.classList.toggle('active', stepNum === state.wizardStep);
		});
		for (var i = 1; i <= 3; i += 1) {
			var dot = qs('identity-step-dot-' + i);
			if (!dot) continue;
			dot.classList.remove('active', 'done');
			if (i < state.wizardStep) dot.classList.add('done');
			else if (i === state.wizardStep) dot.classList.add('active');
		}
	}

	function loadBootstrap() {
		return fetchJson('/api/identity-governance/bootstrap').then(function (data) {
			state.bootstrap = data;
			fillSelect(qs('request-system-type'), data.system_types || [], null, null);
			if (qs('request-system-type')) qs('request-system-type').value = 'SERVER';
			fillAssignees();
			renderOwnerSelect();
			integrationRadiosMounted();
			fillOperationDatalist();
			fillIntegratedAgents();
			updateIntegratedUi();
			var op = qs('request-operation-type');
			if (op && !op.value && (data.sample_operations_personal_integrated || [])[0]) {
				op.placeholder = String(data.sample_operations_personal_integrated[0]);
				op.value = 'INTEGRATED_ACCOUNT_BIND';
			}
			showWizardStep(1);
		});
	}

	function fillAssignees() {
		var sel = qs('request-operator-org-user');
		if (!sel) return;
		sel.innerHTML = '<option value="">(선택)</option>';
		(state.bootstrap.users || []).forEach(function (row) {
			var opt = document.createElement('option');
			opt.value = row.org_user_id != null ? String(row.org_user_id) : String(row.id);
			opt.textContent = (row.name || '-') + ' · org_user #' + opt.value;
			sel.appendChild(opt);
		});
	}

	function renderOwnerSelect() {
		var type = qs('request-account-type').value;
		var rows = type === 'SERVICE' ? (state.bootstrap.admins || []) : (state.bootstrap.users || []);
		if (qs('request-owner-label')) qs('request-owner-label').textContent = type === 'SERVICE' ? '대상 관리자' : '대상 사용자';
		fillSelect(qs('request-owner'), rows, function (row) {
			return (row.name || '-') + ' · ' + (row.department || '-') + ' · ' + (row.email || '-');
		}, function (row) {
			return String(row.id != null ? row.id : '');
		});
	}

	function maxPage(total) { return Math.max(1, Math.ceil(total / state.pageSize)); }
	function clampPage() {
		var last = maxPage(state.rows.length);
		if (state.page < 1) state.page = 1;
		if (state.page > last) state.page = last;
		return last;
	}
	function pageButtons(current, last) {
		var out = [];
		var start = Math.max(1, current - 2);
		var end = Math.min(last, current + 2);
		if (start > 1) {
			out.push('<button type="button" class="resource-page-number" data-page="1">1</button>');
			if (start > 2) out.push('<span class="resource-page-ellipsis">...</span>');
		}
		for (var i = start; i <= end; i += 1) {
			out.push('<button type="button" class="resource-page-number ' + (i === current ? 'active' : '') + '" data-page="' + i + '">' + i + '</button>');
		}
		if (end < last) {
			if (end < last - 1) out.push('<span class="resource-page-ellipsis">...</span>');
			out.push('<button type="button" class="resource-page-number" data-page="' + last + '">' + last + '</button>');
		}
		return out.join('');
	}
	function renderPagination() {
		var info = qs('identity-request-page-info');
		var numbers = qs('identity-request-page-numbers');
		var prev = qs('identity-request-prev');
		var next = qs('identity-request-next');
		if (!info || !numbers || !prev || !next) return;
		var total = state.rows.length;
		var last = clampPage();
		var startRow = total ? ((state.page - 1) * state.pageSize) + 1 : 0;
		var endRow = total ? Math.min(total, state.page * state.pageSize) : 0;
		info.textContent = total ? (startRow + '-' + endRow + ' / ' + total + '개 항목') : '0-0 / 0개 항목';
		if (!total) {
			numbers.innerHTML = '';
			prev.disabled = true;
			next.disabled = true;
			return;
		}
		numbers.innerHTML = pageButtons(state.page, last);
		prev.disabled = state.page <= 1;
		next.disabled = state.page >= last;
	}

	function buildQuery() {
		var params = new URLSearchParams();
		var keyword = String(qs('identity-request-search').value || '').trim();
		var status = String(qs('identity-request-status').value || '').trim();
		if (keyword) params.set('keyword', keyword);
		if (status) params.set('status', status);
		return params.toString();
	}
	function loadRows() {
		var query = buildQuery();
		return fetchJson('/api/identity-governance/requests' + (query ? '?' + query : '')).then(function (data) {
			state.rows = data.rows || [];
			renderRows();
		});
	}

	function buildManualToolbar(row) {
		var wf = String(row.workflow_status || '');
		var sid = esc(row.id);
		var btns = [];
		if (row.status !== '반려') {
			if (wf === 'ASSIGNED') {
				btns.push('<button type="button" class="identity-secondary-btn tiny" data-action="mstart" data-id="' + sid + '">작업시작</button>');
				btns.push('<button type="button" class="identity-secondary-btn tiny" data-action="mupload" data-id="' + sid + '">증적업로드</button>');
			}
			if (wf === 'IN_PROGRESS') {
				btns.push('<button type="button" class="identity-secondary-btn tiny" data-action="mupload" data-id="' + sid + '">증적업로드</button>');
				btns.push('<button type="button" class="identity-secondary-btn tiny" data-action="mevidence" data-id="' + sid + '">증적제출</button>');
			}
			if (wf === 'EVIDENCE_UPLOADED') {
				btns.push('<button type="button" class="identity-secondary-btn tiny" data-action="mfinalize" data-id="' + sid + '">최종완료</button>');
			}
		}
		return btns.length ? ('<div class="identity-mini-actions">' + btns.join(' ') + '</div>') : '';
	}

	function renderRows() {
		var body = qs('identity-request-body');
		var empty = qs('identity-request-empty');
		var countBadge = qs('identity-request-count');
		if (!body || !countBadge) return;
		countBadge.textContent = String(state.rows.length);
		clampPage();
		body.innerHTML = '';
		if (!state.rows.length) {
			if (empty) empty.hidden = false;
			renderPagination();
			return;
		}
		if (empty) empty.hidden = true;
		body.innerHTML = state.rows.slice((state.page - 1) * state.pageSize, state.page * state.pageSize).map(function (row) {
			var integ = String(row.integration_type || 'INTEGRATED').toUpperCase();
			var manual = integ === 'NON_INTEGRATED' || integ === 'AD';
			var done = row.status === '승인' || row.status === '반려';
			var canApproveLine = row.status !== '승인' && row.status !== '반려' && row.status !== '처리중';
			var lineButtons = '';
			if (manual && row.status === '처리중') {
				lineButtons = buildManualToolbar(row);
			} else if (canApproveLine) {
				lineButtons = '<button type="button" class="identity-action-btn" data-action="approve" data-id="' + esc(row.id) + '">승인</button>' +
					'<button type="button" class="identity-action-btn" data-action="reject" data-id="' + esc(row.id) + '">반려</button>';
			} else {
				lineButtons = '<span class="identity-muted">-</span>';
			}
			return '<tr data-id="' + esc(row.id) + '">' +
				'<td><strong>' + esc(row.account_name || '-') + '</strong></td>' +
				'<td>' + esc(integrationLabel(integ)) + '</td>' +
				'<td>' + badgeType(row.account_type) + '</td>' +
				'<td>' + workflowMini(row) + '</td>' +
				'<td><strong>' + esc(row.target_owner_name || '-') + '</strong><div class="identity-muted">' + esc(row.target_owner_type || '-') + '</div></td>' +
				'<td>' + systemTag(row.system_type) + '</td>' +
				'<td>' + esc(row.account_id || '-') + '</td>' +
				'<td>' + esc(row.privilege || '-') + '</td>' +
				'<td>' + statusPill(row.status) + '</td>' +
				'<td>' + luminaJobCell(row) + '</td>' +
				'<td>' + esc(formatDate(row.created_at)) + '</td>' +
				'<td>' + lineButtons + '</td>' +
				'</tr>';
		}).join('');
		renderPagination();
	}

	function setRequestTab(tabName) {
		var tabs = document.querySelectorAll('[data-identity-request-tab]');
		var panels = document.querySelectorAll('.identity-request-page .request-tab-panel');
		Array.prototype.forEach.call(tabs, function (tab) {
			var active = tab.getAttribute('data-identity-request-tab') === tabName;
			tab.classList.toggle('active', active);
			tab.setAttribute('aria-selected', active ? 'true' : 'false');
		});
		Array.prototype.forEach.call(panels, function (panel) {
			var active = panel.id === 'identity-request-panel-' + tabName;
			panel.classList.toggle('active', active);
			panel.hidden = !active;
		});
	}

	function submitForm(event) {
		event.preventDefault();
		var form = event.target;
		var integ = getSelectedIntegration();
		var payload = {
			integration_type: integ,
			operation_type: (qs('request-operation-type').value || '').trim() || 'INTEGRATED_ACCOUNT_BIND',
			account_name: form.account_name.value,
			account_type: form.account_type.value,
			target_owner_id: form.target_owner_id.value,
			system_type: form.system_type.value,
			account_id: form.account_id.value,
			privilege: form.privilege.value,
			request_reason: form.request_reason.value,
			valid_until: qs('request-valid-until').value || '',
			is_emergency: qs('request-emergency').checked ? 1 : 0,
		};
		if (integ === 'NON_INTEGRATED') {
			payload.manual_system_name = qs('request-manual-system-name').value;
			payload.access_method = qs('request-access-method').value;
			payload.location_detail = qs('request-location-detail').value;
			payload.manual_guide = qs('request-manual-guide').value;
			var opSel = qs('request-operator-org-user');
			payload.operator_org_user_id = opSel && opSel.value ? opSel.value : '';
		}
		if (integ === 'INTEGRATED') {
			var opUpper = (payload.operation_type || '').trim().toUpperCase();
			var agEl = qs('request-agent-pending-id');
			if (operationNeedsAgent(opUpper)) {
				if (!agEl || !agEl.value) {
					showMessage('연동 자동(Account Job) 작업에는 에이전트를 선택해야 합니다.');
					return;
				}
				payload.agent_pending_id = agEl.value;
			} else if (agEl && agEl.value) {
				payload.agent_pending_id = agEl.value;
			}
		}
		sendJson('/api/identity-governance/requests', 'POST', payload).then(function () {
			form.reset();
			qs('request-account-type').value = 'SERVICE';
			if (qs('request-system-type')) qs('request-system-type').value = 'SERVER';
			var firstRadio = document.querySelector('input[name="integration_type"]');
			if (firstRadio) firstRadio.checked = true;
			updateIntegratedUi();
			fillOperationDatalist();
			fillIntegratedAgents();
			if (qs('request-operation-type')) qs('request-operation-type').value = 'INTEGRATED_ACCOUNT_BIND';
			renderOwnerSelect();
			showWizardStep(1);
			state.page = 1;
			return loadRows();
		}).catch(function (err) { showMessage(err.message); });
	}

	function approveRequest(id) {
		sendJson('/api/identity-governance/requests/' + encodeURIComponent(id) + '/approve', 'POST', {}).then(function () {
			return loadRows();
		}).catch(function (err) { showMessage(err.message); });
	}

	function rejectRequest(id) {
		var reason = window.prompt('반려 사유', '');
		if (reason === null) return;
		sendJson('/api/identity-governance/requests/' + encodeURIComponent(id) + '/reject', 'POST', { reason: reason }).then(function () {
			return loadRows();
		}).catch(function (err) { showMessage(err.message); });
	}

	function triggerUpload(id) {
		state.uploadTargetId = id;
		var fin = qs('identity-attachment-helper');
		if (fin) {
			fin.value = '';
			fin.click();
		}
	}

	function bindEvents() {
		document.querySelector('.identity-request-page .request-main-tabs').addEventListener('click', function (event) {
			var tab = event.target.closest('[data-identity-request-tab]');
			if (!tab) return;
			setRequestTab(tab.getAttribute('data-identity-request-tab'));
		});
		var formWrap = qs('identity-request-form');
		if (formWrap) {
			formWrap.addEventListener('click', function (event) {
				var nextBtn = event.target.closest('[data-wizard-next]');
				var prevBtn = event.target.closest('[data-wizard-prev]');
				if (nextBtn) {
					event.preventDefault();
					showWizardStep(state.wizardStep + 1);
				}
				if (prevBtn) {
					event.preventDefault();
					showWizardStep(state.wizardStep - 1);
				}
			});
		}
		qs('request-account-type').addEventListener('change', renderOwnerSelect);
		var opTy = qs('request-operation-type');
		if (opTy) {
			opTy.addEventListener('change', updateAgentGuidance);
			opTy.addEventListener('input', updateAgentGuidance);
		}
		qs('identity-request-form').addEventListener('submit', submitForm);

		var fileInput = qs('identity-attachment-helper');
		if (fileInput) {
			fileInput.addEventListener('change', function () {
				var id = state.uploadTargetId;
				var f = fileInput.files && fileInput.files[0];
				state.uploadTargetId = null;
				if (!id || !f) return;
				var fd = new FormData();
				fd.append('file', f);
				fd.append('kind', 'EVIDENCE_AFTER');
				fetch('/api/identity-governance/requests/' + encodeURIComponent(id) + '/attachments', {
					method: 'POST',
					credentials: 'same-origin',
					headers: csrfHeader(),
					body: fd,
				}).then(function (res) {
					return res.json().then(function (data) {
						if (!res.ok || data.success === false) throw new Error((data && data.message) || 'upload failed');
					});
				}).then(function () { loadRows(); }).catch(function (err) { showMessage(err.message); });
			});
		}

		qs('identity-request-refresh').addEventListener('click', function () { loadRows().catch(function (err) { showMessage(err.message); }); });
		qs('identity-request-status').addEventListener('change', function () { state.page = 1; loadRows().catch(function (err) { showMessage(err.message); }); });
		qs('identity-request-search').addEventListener('input', function () { state.page = 1; loadRows().catch(function (err) { showMessage(err.message); }); });
		qs('identity-request-prev').addEventListener('click', function () { state.page -= 1; renderRows(); });
		qs('identity-request-next').addEventListener('click', function () { state.page += 1; renderRows(); });
		qs('identity-request-page-numbers').addEventListener('click', function (event) {
			var btn = event.target.closest('[data-page]');
			if (!btn) return;
			state.page = parseInt(btn.getAttribute('data-page'), 10) || 1;
			renderRows();
		});
		qs('identity-request-body').addEventListener('click', function (event) {
			var btn = event.target.closest('[data-action]');
			if (!btn) return;
			var id = btn.getAttribute('data-id');
			var act = btn.getAttribute('data-action');
			if (act === 'approve') approveRequest(id);
			else if (act === 'reject') rejectRequest(id);
			else if (act === 'mstart') postEmpty('/api/identity-governance/requests/' + encodeURIComponent(id) + '/manual/start').then(loadRows).catch(function (e) { showMessage(e.message); });
			else if (act === 'mupload') triggerUpload(id);
			else if (act === 'mevidence') postEmpty('/api/identity-governance/requests/' + encodeURIComponent(id) + '/manual/evidence').then(loadRows).catch(function (e) { showMessage(e.message); });
			else if (act === 'mfinalize') postEmpty('/api/identity-governance/requests/' + encodeURIComponent(id) + '/manual/finalize').then(loadRows).catch(function (e) { showMessage(e.message); });
		});
	}

	function init() {
		if (!qs('identity-request-form')) return;
		bindEvents();
		setRequestTab('form');
		loadBootstrap().then(loadRows).catch(function (err) { showMessage(err.message); });
	}
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
	else init();
})();

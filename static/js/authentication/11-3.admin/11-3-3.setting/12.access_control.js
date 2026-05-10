(function () {
	'use strict';

	function qs(id) { return document.getElementById(id); }
	function ensureSearchableHelper() {
		var script;
		if (window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function') return;
		if (document.querySelector('script[src*="/static/js/ui/searchable_select.js"]')) return;
		script = document.createElement('script');
		script.src = '/static/js/ui/searchable_select.js?v=1.2.0';
		script.defer = true;
		document.head.appendChild(script);
	}
	function decorateSearchableSelects() {
		var root = document.querySelector('.admin-settings-wrapper');
		var selects, i, select, label;
		if (!root) return;
		selects = root.querySelectorAll('select.form-input');
		for (i = 0; i < selects.length; i++) {
			select = selects[i];
			select.classList.add('search-select');
			select.setAttribute('data-searchable-scope', 'page');
			if (!select.getAttribute('data-placeholder')) {
				label = root.querySelector('label[for="' + select.id + '"]');
				select.setAttribute('data-placeholder', label ? label.textContent.replace(/\s+/g, ' ').trim() : '선택');
			}
		}
	}
	function syncSearchSelect(scope, attempt) {
		attempt = attempt || 0;
		if (window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function') {
			window.BlossomSearchableSelect.syncAll(scope || document);
			return;
		}
		if (attempt < 20) {
			window.setTimeout(function () { syncSearchSelect(scope, attempt + 1); }, 100);
		}
	}

	function fetchJson(url, options) {
		return fetch(url, Object.assign({ credentials: 'same-origin', cache: 'no-store' }, options || {})).then(function (res) {
			return res.json().then(function (data) {
				if (!res.ok || data.success === false) throw new Error(data.message || data.error || '요청 처리 중 오류가 발생했습니다.');
				return data;
			});
		});
	}
	function sendJson(url, method, data) {
		return fetchJson(url, {
			method: method,
			headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
			body: JSON.stringify(data || {})
		});
	}
	function setValue(id, value, fallback) {
		var el = qs(id);
		var next, exists, i;
		if (!el) return;
		next = String(value !== undefined && value !== null && value !== '' ? value : fallback);
		if (String(el.tagName || '').toUpperCase() === 'SELECT') {
			exists = false;
			for (i = 0; i < el.options.length; i++) {
				if (String(el.options[i].value) === next) {
					exists = true;
					break;
				}
			}
			if (!exists) next = String(fallback);
		}
		el.value = next;
	}
	function fieldValue(id) {
		var el = qs(id);
		return el ? el.value : '';
	}
	function setStatus(id, text) {
		var el = qs(id);
		if (el) el.textContent = text || '';
	}
	function savePolicy(payload, statusId) {
		return sendJson('/api/access-control/policy', 'PUT', payload).then(function () {
			setStatus(statusId, '저장되었습니다 · ' + new Date().toLocaleTimeString());
		}).catch(function (err) {
			setStatus(statusId, '');
			window.alert(err.message);
		});
	}

	function loadPolicy() {
		setStatus('admin-policy-status-approval', '불러오는 중…');
		setStatus('admin-policy-status-gate', '불러오는 중…');
		setStatus('admin-policy-status-audit', '불러오는 중…');
		return fetchJson('/api/access-control/policy').then(function (data) {
			var item = data.item || {};
			setValue('policy-team-lead', String(item.team_lead_approval_required || 0), '1');
			setValue('policy-admin-approval', String(item.admin_approval_required || 0), '0');
			setValue('policy-default-days', item.default_period_days, 30);
			setValue('policy-max-days', item.max_period_days, 90);
			setValue('policy-notify-days', item.notify_before_days, 7);
			setValue('policy-emergency', String(item.emergency_allowed || 0), '1');
			setValue('policy-duplicate', String(item.duplicate_request_blocked || 0), '1');
			setValue('policy-lumina-gate-enabled', String(item.lumina_gate_enabled !== undefined ? item.lumina_gate_enabled : 1), '1');
			setValue('policy-lumina-gate-auto-push', String(item.lumina_gate_auto_push_enabled !== undefined ? item.lumina_gate_auto_push_enabled : 1), '1');
			setValue('policy-pc-agent-auto-register', String(item.pc_agent_auto_register_enabled !== undefined ? item.pc_agent_auto_register_enabled : 1), '1');
			setValue('policy-pc-agent-require-mapping', String(item.pc_agent_require_user_mapping !== undefined ? item.pc_agent_require_user_mapping : 1), '1');
			setValue('policy-pc-agent-inactive-days', item.pc_agent_inactive_days, 7);
			setValue('policy-ssh-launch-enabled', String(item.ssh_launch_enabled !== undefined ? item.ssh_launch_enabled : 1), '1');
			setValue('policy-ssh-connect-account-required', String(item.ssh_connect_account_required !== undefined ? item.ssh_connect_account_required : 0), '0');
			setValue('policy-access-click-cooldown', item.access_click_cooldown_seconds, 3);
			setValue('policy-access-rate-window', item.access_rate_limit_window_seconds, 60);
			setValue('policy-access-rate-count', item.access_rate_limit_max_count, 5);
			setValue('policy-audit-retention-days', item.audit_log_retention_days, 365);
			setValue('policy-agent-retention-days', item.pc_agent_retention_days, 365);
			setValue('policy-audit-export-max', item.audit_export_max_rows, 5000);
			setStatus('admin-policy-status-approval', '저장된 정책을 불러왔습니다.');
			setStatus('admin-policy-status-gate', '저장된 정책을 불러왔습니다.');
			setStatus('admin-policy-status-audit', '저장된 정책을 불러왔습니다.');
			syncSearchSelect(qs('admin-policy-form'));
		}).catch(function (err) {
			var errMsg = '정책을 불러오지 못했습니다: ' + err.message;
			setStatus('admin-policy-status-approval', errMsg);
			setStatus('admin-policy-status-gate', errMsg);
			setStatus('admin-policy-status-audit', errMsg);
		});
	}

	function submitApprovalPolicy() {
		var payload = {
			team_lead_approval_required: fieldValue('policy-team-lead'),
			admin_approval_required: fieldValue('policy-admin-approval'),
			default_period_days: fieldValue('policy-default-days'),
			max_period_days: fieldValue('policy-max-days'),
			notify_before_days: fieldValue('policy-notify-days'),
			emergency_allowed: fieldValue('policy-emergency'),
			duplicate_request_blocked: fieldValue('policy-duplicate')
		};
		savePolicy(payload, 'admin-policy-status-approval');
	}

	function submitGatePolicy() {
		var payload = {
			lumina_gate_enabled: fieldValue('policy-lumina-gate-enabled'),
			lumina_gate_auto_push_enabled: fieldValue('policy-lumina-gate-auto-push'),
			pc_agent_auto_register_enabled: fieldValue('policy-pc-agent-auto-register'),
			pc_agent_require_user_mapping: fieldValue('policy-pc-agent-require-mapping'),
			pc_agent_inactive_days: fieldValue('policy-pc-agent-inactive-days')
		};
		savePolicy(payload, 'admin-policy-status-gate');
	}

	function submitAuditPolicy() {
		var payload = {
			ssh_launch_enabled: fieldValue('policy-ssh-launch-enabled'),
			ssh_connect_account_required: fieldValue('policy-ssh-connect-account-required'),
			access_click_cooldown_seconds: fieldValue('policy-access-click-cooldown'),
			access_rate_limit_window_seconds: fieldValue('policy-access-rate-window'),
			access_rate_limit_max_count: fieldValue('policy-access-rate-count'),
			audit_log_retention_days: fieldValue('policy-audit-retention-days'),
			pc_agent_retention_days: fieldValue('policy-agent-retention-days'),
			audit_export_max_rows: fieldValue('policy-audit-export-max')
		};
		savePolicy(payload, 'admin-policy-status-audit');
	}

	function bindEvents() {
		var saveAp = qs('admin-save-approval');
		if (saveAp) saveAp.addEventListener('click', submitApprovalPolicy);
		var saveGate = qs('admin-save-gate');
		if (saveGate) saveGate.addEventListener('click', submitGatePolicy);
		var saveAudit = qs('admin-save-audit');
		if (saveAudit) saveAudit.addEventListener('click', submitAuditPolicy);
		var notifyBtn = qs('admin-notify-run');
		if (notifyBtn) {
			notifyBtn.addEventListener('click', function () {
				sendJson('/api/access-control/notifications/run', 'POST', {})
					.then(function (data) {
						var item = (data && data.item) || {};
						window.alert('만료 임박 알림 실행 완료\n신규 알림: ' + (item.created || 0) + '건\n만료 처리: ' + (item.expired_grants || 0) + '건');
					})
					.catch(function (err) { window.alert(err.message); });
			});
		}
	}

	document.addEventListener('DOMContentLoaded', function () {
		ensureSearchableHelper();
		decorateSearchableSelects();
		bindEvents();
		syncSearchSelect(qs('admin-policy-form'));
		loadPolicy().catch(function (err) { window.alert(err.message); });
	});
})();

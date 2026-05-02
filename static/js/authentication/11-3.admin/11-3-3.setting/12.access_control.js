(function () {
	'use strict';

	function qs(id) { return document.getElementById(id); }

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

	function loadPolicy() {
		var sa = qs('admin-policy-status-approval');
		var sw = qs('admin-policy-status-web');
		if (sa) sa.textContent = '불러오는 중…';
		if (sw) sw.textContent = '불러오는 중…';
		return fetchJson('/api/access-control/policy').then(function (data) {
			var item = data.item || {};
			qs('policy-team-lead').value = String(item.team_lead_approval_required || 0);
			qs('policy-admin-approval').value = String(item.admin_approval_required || 0);
			qs('policy-default-days').value = item.default_period_days || 30;
			qs('policy-max-days').value = item.max_period_days || 90;
			qs('policy-notify-days').value = item.notify_before_days || 7;
			qs('policy-emergency').value = String(item.emergency_allowed || 0);
			qs('policy-duplicate').value = String(item.duplicate_request_blocked || 0);
			var mode = String(item.web_open_mode || 'new_tab').trim().toLowerCase().replace(/-/g, '_');
			qs('policy-web-open-mode').value = mode === 'iframe_embed' ? 'iframe_embed' : 'new_tab';
			qs('policy-web-host-gate').value = item.web_host_gate_patterns || '';
			qs('policy-web-iframe-allow').value = item.web_iframe_allow_patterns || '';
			qs('policy-web-infra-runbook').value = item.web_infra_runbook || '';
			var msg = '저장된 정책을 불러왔습니다.';
			if (sa) sa.textContent = msg;
			if (sw) sw.textContent = msg;
		}).catch(function (err) {
			var errMsg = '정책을 불러오지 못했습니다: ' + err.message;
			if (sa) sa.textContent = errMsg;
			if (sw) sw.textContent = errMsg;
		});
	}

	function submitPolicySection(section) {
		var sa = qs('admin-policy-status-approval');
		var sw = qs('admin-policy-status-web');
		var statusEl = section === 'web' ? sw : sa;
		var payload = {};
		if (section === 'approval') {
			payload = {
				team_lead_approval_required: qs('policy-team-lead').value,
				admin_approval_required: qs('policy-admin-approval').value,
				default_period_days: qs('policy-default-days').value,
				max_period_days: qs('policy-max-days').value,
				notify_before_days: qs('policy-notify-days').value,
				emergency_allowed: qs('policy-emergency').value,
				duplicate_request_blocked: qs('policy-duplicate').value
			};
		} else {
			payload = {
				web_open_mode: qs('policy-web-open-mode').value,
				web_host_gate_patterns: qs('policy-web-host-gate').value,
				web_iframe_allow_patterns: qs('policy-web-iframe-allow').value,
				web_infra_runbook: qs('policy-web-infra-runbook').value
			};
		}
		sendJson('/api/access-control/policy', 'PUT', payload).then(function () {
			if (statusEl) statusEl.textContent = '저장되었습니다 · ' + new Date().toLocaleTimeString();
		}).catch(function (err) {
			if (statusEl) statusEl.textContent = '';
			window.alert(err.message);
		});
	}

	function bindEvents() {
		var saveAp = qs('admin-save-approval');
		if (saveAp) saveAp.addEventListener('click', function () { submitPolicySection('approval'); });
		var saveWeb = qs('admin-save-web');
		if (saveWeb) saveWeb.addEventListener('click', function () { submitPolicySection('web'); });
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
		bindEvents();
		loadPolicy().catch(function (err) { window.alert(err.message); });
	});
})();

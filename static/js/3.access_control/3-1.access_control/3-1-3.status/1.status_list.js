(function () {
	'use strict';

	var state = {
		all: [],
		filtered: [],
		view: 'dashboard',
		dashboard: {
			requests: [],
			auditLogs: [],
			grants: [],
			notifications: []
		},
		liveRange: 24,
		approvalRange: 30,
		dashboardRefreshTimer: null,
		liveAuditRefreshTimer: null,
		selected: new Set(),
		page: 1,
		pageSize: 10,
		editingId: null,
		category: '시스템',
		categoryDetail: '',
		workOperationCode: '',
		workOperations: [],
		workOperationNames: {},
		systemResources: [],
		systemResourcePageSize: 50,
		systemResourceTotal: 0,
		systemResourceKeyword: '',
		systemResourceSearchTimer: null,
		agentResources: [],
		agentResourcePage: 1,
		agentResourcePageSize: 10,
		agentResourceTotal: 0,
		agentResourceTotalPages: 1,
		agentResourceKeyword: '',
		agentResourceSearchTimer: null,
		selectedAgent: null
	};
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
	function categoryKey(value) { return String(value || '').replace(/[\s\/_-]+/g, '').toLowerCase(); }
	function normalizeCategory(value) { return CATEGORY_ALIASES[categoryKey(value)] || (String(value || '').trim() || '시스템'); }
	function normalizeConsoleGroup(value) { return CONSOLE_GROUP_ALIASES[categoryKey(value)] || ''; }
	function rowCategory(row) { return normalizeCategory(row && (row.category_name || row.category_label || row.category)); }
	function rowCategoryDetail(row) { return rowCategory(row) === '관리콘솔' ? normalizeConsoleGroup(row && (row.category_detail || row.console_group)) : ''; }
	function rowWorkOperationCode(row) { return rowCategory(row) === '관리콘솔' ? '' : String(row && (row.work_operation_code || '') || '').trim(); }
	function workOperationName(code) {
		var key = String(code || '').trim();
		return key ? (state.workOperationNames[key] || '') : '';
	}
	function rowWorkOperation(row) {
		if (rowCategory(row) === '관리콘솔') return '';
		var code = rowWorkOperationCode(row);
		var value = String(row && (row.work_operation_name || workOperationName(code) || row.work_operation || code || '') || '').trim();
		return value;
	}
	function categoryDisplay(row) {
		var category = rowCategory(row);
		var detail = rowCategoryDetail(row);
		return category === '관리콘솔' && detail ? category + ' / ' + detail : category;
	}
	function agentBusinessName(row) {
		return String((row && (row.mapped_department || row.user_department || row.mapped_name || row.current_user)) || '업무 미지정').trim();
	}
	function agentSystemName(row) {
		return String((row && (row.hostname || row.agent_id || row.ip_address)) || '시스템 미지정').trim();
	}
	function agentResourceName(row) {
		return agentBusinessName(row) + ', ' + agentSystemName(row);
	}
	function agentDisplayName(row) {
		return String((row && (row.hostname || row.agent_id || row.current_user)) || '에이전트 미지정').trim();
	}
	function agentIp(row) {
		return String((row && row.ip_address) || '-').trim();
	}
	function agentStatus(row) {
		return String((row && (row.sync_status || row.service_status || row.operation_status)) || '-').trim();
	}
	function agentStatusClass(row) {
		var status = agentStatus(row);
		return status === '정상' || status.toUpperCase() === 'RUNNING' ? ' normal' : '';
	}
	function systemResourceBusinessName(row) {
		return String((row && (row.work_name || row.business_name || row.workName || row.businessName)) || '').trim();
	}
	function systemResourceSystemName(row) {
		return String((row && (row.system_name || row.systemName || row.asset_name || row.assetName)) || '').trim();
	}
	function splitAgentResourceName(value) {
		var parts = String(value || '').split(',');
		return {
			business: (parts.shift() || '').trim(),
			system: parts.join(',').trim()
		};
	}
	function updateResourceNameHidden() {
		var category = normalizeCategory(qs('form-category').value);
		var value = '';
		if (category === '시스템') {
			var business = (qs('form-business-name').value || '').trim();
			var system = (qs('form-system-name').value || '').trim();
			value = business && system ? business + ', ' + system : (business || system);
		} else {
			value = (qs('form-resource-name-manual').value || '').trim();
		}
		qs('form-resource-name').value = value;
		return value;
	}
	function operationOptionsHtml(placeholder) {
		var html = '<option value="">' + esc(placeholder || '운영 전체') + '</option>';
		state.workOperations.forEach(function (item) {
			var code = item.operation_code || '';
			var name = item.wc_name || item.operation_name || code;
			if (code) html += '<option value="' + esc(code) + '">' + esc(name) + '</option>';
		});
		return html;
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
	function endpointAccessType(endpoint) {
		var type = String((endpoint && (endpoint.protocol || endpoint.access_type || endpoint.kind)) || '').trim().toUpperCase();
		return type === '웹' ? 'WEB' : (type || '-');
	}
	function endpointAccessInfo(endpoint) {
		if (!endpoint) return '';
		var type = endpointAccessType(endpoint);
		var host = String(endpoint.host || '').trim();
		var port = String(endpoint.port || '').trim();
		if (endpoint.access_info) return endpoint.access_info;
		if (type === 'WEB' || type === 'HTTP' || type === 'HTTPS' || type === 'API') return endpoint.url || endpoint.primary_url || host;
		if (type === 'SSH' || type === 'SFTP' || type === 'RDP') return host + (port && port !== String(ENDPOINT_DEFAULT_PORT[type] || 22) ? ':' + port : '');
		return endpoint.url || host;
	}
	function accessEndpoints(row) {
		var endpoints = row.endpoints || [];
		if (endpoints.length) return endpoints;
		return [{
			access_type: row.access_type || row.primary_access_type || row.primary_kind || row.resource_type,
			access_info: row.access_info || row.primary_access_info || row.primary_url || row.resource_url || row.host_address,
			host: row.host_address,
			port: row.port_number,
			url: row.primary_url || row.resource_url
		}];
	}
	function renderAccessTypeCell(row) {
		var seen = {};
		var tags = [];
		accessEndpoints(row).forEach(function (endpoint) {
			var type = endpointAccessType(endpoint);
			if (!type || type === '-' || seen[type]) return;
			seen[type] = true;
			tags.push('<span class="endpoint-kind-tag kind-' + esc(type) + '">' + esc(type) + '</span>');
		});
		return tags.length ? tags.join('') : '-';
	}
	function renderAccessInfoCell(row) {
		var values = [];
		accessEndpoints(row).forEach(function (endpoint) {
			var info = endpointAccessInfo(endpoint);
			if (info) values.push('<span class="access-info-text">' + esc(info) + '</span>');
		});
		return values.length ? '<div class="access-info-stack">' + values.join('') + '</div>' : '-';
	}

	function formatNumber(value) {
		return Number(value || 0).toLocaleString('ko-KR');
	}
	function setDashText(id, value) {
		var el = qs(id);
		if (el) el.textContent = formatNumber(value);
	}
	function setDashRawText(id, value) {
		var el = qs(id);
		if (el) el.textContent = value;
	}
	function dashboardCategories() {
		var values = [];
		document.querySelectorAll('.system-tabs .system-tab-btn[data-category]').forEach(function (btn) {
			var value = btn.getAttribute('data-category') || '';
			if (value && value !== 'dashboard') values.push(value);
		});
		return values.length ? values : ['시스템', '서비스', '컨테이너', '관리콘솔'];
	}
	function incrementCount(map, key) {
		var name = String(key || '').trim() || '미지정';
		map[name] = (map[name] || 0) + 1;
	}
	function topEntries(map, limit) {
		return Object.keys(map).map(function (key) {
			return { label: key, count: map[key] };
		}).sort(function (a, b) {
			return b.count - a.count || a.label.localeCompare(b.label, 'ko-KR');
		}).slice(0, limit || 5);
	}
	function renderNoData(target, message) {
		if (target) target.innerHTML = '<div class="access-dash-empty">' + esc(message || '데이터 없음') + '</div>';
	}
	function renderRankList(id, entries, total, emptyMessage) {
		var target = qs(id);
		if (!target) return;
		if (!entries.length) {
			renderNoData(target, emptyMessage);
			return;
		}
		target.innerHTML = entries.map(function (item, index) {
			var pct = total ? Math.round((item.count / total) * 100) : 0;
			return '' +
				'<div class="access-rank-item">' +
					'<span class="access-rank-no">' + (index + 1) + '</span>' +
					'<div class="access-rank-main">' +
						'<div class="access-rank-label">' + esc(item.label) + '</div>' +
						'<div class="access-rank-bar"><span style="width:' + pct + '%"></span></div>' +
					'</div>' +
					'<strong>' + formatNumber(item.count) + '</strong>' +
			'</div>';
		}).join('');
	}

	function dashRows(name) {
		return (state.dashboard && state.dashboard[name]) || [];
	}
	function asDate(value) {
		if (!value) return null;
		var date = new Date(value);
		return isNaN(date.getTime()) ? null : date;
	}
	function isTodayValue(value) {
		var date = asDate(value);
		if (!date) return false;
		var now = new Date();
		return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
	}
	function daysUntil(value) {
		var date = asDate(value);
		if (!date) return null;
		var start = new Date();
		start.setHours(0, 0, 0, 0);
		date.setHours(0, 0, 0, 0);
		return Math.round((date.getTime() - start.getTime()) / 86400000);
	}
	function dateKey(value) {
		if (!value) return '';
		var str = String(value).trim();
		if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
		var date = asDate(str);
		if (!date) return '';
		var month = String(date.getMonth() + 1).padStart(2, '0');
		var day = String(date.getDate()).padStart(2, '0');
		return date.getFullYear() + '-' + month + '-' + day;
	}
	function todayKey() {
		return dateKey(new Date());
	}
	function isActiveGrant(row) {
		if (!row) return false;
		if (row.is_deleted === 1 || row.is_deleted === true || String(row.is_deleted || '') === '1') return false;
		var status = String(row.grant_status || row.status || row.approval_status || '').trim().toLowerCase();
		if (!(status === '승인' || status === 'active' || status === 'approved')) return false;
		var start = dateKey(row.grant_start_date || row.start_date || row.request_start_date);
		var end = dateKey(row.grant_end_date || row.expires_at || row.expired_at || row.end_date || row.request_end_date);
		var today = todayKey();
		if (!start || !end || !today) return false;
		return start <= today && today <= end;
	}
	function requestStatus(row) {
		return String(row && (row.request_status || row.approval_status || row.status) || '').toLowerCase();
	}
	function requestTime(row) {
		return row && (row.created_at || row.requested_at || row.request_date || row.updated_at);
	}
	function auditTime(row) {
		return row && (row.occurred_at || row.created_at || row.accessed_at || row.started_at || row.event_time || row.updated_at);
	}
	function auditUser(row) {
		return String(row && (row.user_name || row.actor_name || row.emp_name || row.requester_name || row.emp_no || row.actor_emp_no) || '-').trim();
	}
	function auditResource(row) {
		return String(row && (row.resource_name || row.target_resource_name || row.asset_name || row.resource_url) || '-').trim();
	}
	function auditMethod(row) {
		return String(row && (row.access_type || row.endpoint_kind || row.protocol || row.access_method || row.channel) || '-').trim().toUpperCase();
	}
	function auditResult(row) {
		var value = String(row && (row.result || row.connection_result || row.outcome || row.status || row.action_result) || '').toLowerCase();
		if (value.indexOf('fail') >= 0 || value.indexOf('실패') >= 0) return '실패';
		if (value.indexOf('block') >= 0 || value.indexOf('차단') >= 0 || value.indexOf('deny') >= 0) return '차단';
		return '성공';
	}
	function riskReason(row) {
		var hay = [
			row && row.risk_reason,
			row && row.reason,
			row && row.description,
			row && row.details,
			row && row.ip_address,
			row && row.country
		].join(' ').toLowerCase();
		var hour = (asDate(auditTime(row)) || new Date()).getHours();
		if (hay.indexOf('privilege') >= 0 || hay.indexOf('권한') >= 0 || hay.indexOf('admin') >= 0) return '권한 상승';
		if (hay.indexOf('foreign') >= 0 || hay.indexOf('국외') >= 0 || hay.indexOf('oversea') >= 0) return '국외 IP 접속';
		if (hay.indexOf('unauthorized') >= 0 || hay.indexOf('비인가') >= 0 || auditResult(row) === '차단') return '비인가 자산 접근';
		if (hay.indexOf('unused') >= 0 || hay.indexOf('휴면') >= 0 || hay.indexOf('장기') >= 0) return '장기 미사용 계정 로그인';
		if (hour >= 0 && hour < 6) return '새벽 접속';
		return '';
	}
	function liveAuditResult(row) {
		var value = String(row && (row.result || row.connection_result || row.outcome || row.status || row.action_result) || '').toLowerCase();
		if (value.indexOf('fail') >= 0 || value.indexOf('실패') >= 0 || value.indexOf('오류') >= 0) return 'failed';
		if (value.indexOf('block') >= 0 || value.indexOf('차단') >= 0 || value.indexOf('deny') >= 0 || value.indexOf('denied') >= 0) return 'blocked';
		return 'success';
	}
	function severityForCount(count, warn, danger) {
		return count >= danger ? 'danger' : (count >= warn ? 'warning' : 'normal');
	}
	function severityLabel(sev) {
		return sev === 'danger' ? '위험' : (sev === 'warning' ? '주의' : '정상');
	}
	function renderSeverityBadge(sev, text) {
		return '<span class="access-severity access-severity--' + esc(sev) + '">' + esc(text || severityLabel(sev)) + '</span>';
	}
	function renderDonut(targetId, legendId, totalId, entries) {
		var target = qs(targetId);
		var legend = qs(legendId);
		var total = entries.reduce(function (sum, item) { return sum + item.count; }, 0);
		setDashText(totalId, total);
		if (!target || !legend) return;
		var colors = ['#2563eb', '#0891b2', '#7c3aed', '#f59e0b', '#ef4444', '#10b981'];
		var acc = 0;
		var stops = entries.map(function (item, index) {
			var start = total ? (acc / total) * 100 : 0;
			acc += item.count;
			var end = total ? (acc / total) * 100 : 0;
			return colors[index % colors.length] + ' ' + start + '% ' + end + '%';
		});
		target.style.background = total ? 'conic-gradient(' + stops.join(', ') + ')' : '#e2e8f0';
		target.removeAttribute('title');
		legend.innerHTML = entries.map(function (item, index) {
			var pct = total ? Math.round((item.count / total) * 100) : 0;
			return '<span><i style="background:' + colors[index % colors.length] + '"></i>' + esc(item.label) + '<strong>' + formatNumber(item.count) + ' · ' + pct + '%</strong></span>';
		}).join('');
	}
	function renderBarList(id, entries, total) {
		var target = qs(id);
		if (!target) return;
		target.innerHTML = entries.map(function (item) {
			var pct = total ? Math.round((item.count / total) * 100) : 0;
			return '<div class="access-expiry-row"><div><span>' + esc(item.label) + '</span><strong>' + formatNumber(item.count) + '</strong></div><b><i style="width:' + pct + '%"></i></b></div>';
		}).join('');
	}
	function renderMethodBars(id, entries) {
		var target = qs(id);
		if (!target) return;
		var total = entries.reduce(function (sum, item) { return sum + item.count; }, 0);
		target.innerHTML = entries.map(function (item) {
			var pct = total ? Math.round((item.count / total) * 100) : 0;
			var width = Math.max(item.count ? 8 : 3, pct);
			return '<div class="access-method-bar" title="' + esc(item.label) + ': ' + formatNumber(item.count) + '">' +
				'<span>' + esc(item.label) + '</span>' +
				'<div class="access-method-bar-track"><i style="width:' + width + '%"></i></div>' +
				'<strong>' + formatNumber(item.count) + '</strong>' +
			'</div>';
		}).join('');
	}
	function renderEmptyRow(colspan, message) {
		return '<tr><td colspan="' + colspan + '" class="access-dash-empty-cell">' + esc(message) + '</td></tr>';
	}
	function renderApprovalTrend(rows) {
		var target = qs('dash-approval-trend');
		if (!target) return;
		var labels = [];
		for (var i = 6; i >= 0; i--) {
			var d = new Date();
			d.setDate(d.getDate() - i);
			labels.push(d.toISOString().slice(0, 10));
		}
		var series = {
			requested: labels.map(function () { return 0; }),
			approved: labels.map(function () { return 0; }),
			rejected: labels.map(function () { return 0; }),
			revoked: labels.map(function () { return 0; })
		};
		rows.forEach(function (row) {
			var date = (row.created_at || row.requested_at || row.updated_at || '').slice(0, 10);
			var idx = labels.indexOf(date);
			if (idx < 0) return;
			var st = requestStatus(row);
			series.requested[idx] += 1;
			if (st.indexOf('approved') >= 0 || st.indexOf('승인') >= 0) series.approved[idx] += 1;
			if (st.indexOf('rejected') >= 0 || st.indexOf('반려') >= 0) series.rejected[idx] += 1;
			if (st.indexOf('revoked') >= 0 || st.indexOf('회수') >= 0 || st.indexOf('cancel') >= 0) series.revoked[idx] += 1;
		});
		var rawMax = Math.max.apply(null, [].concat(series.requested, series.approved, series.rejected, series.revoked));
		var max = Math.max(1, rawMax);
		var yTicks = [max, Math.round(max / 2), 0].filter(function (value, index, arr) {
			return arr.indexOf(value) === index;
		});
		var colors = { requested: '#2563eb', approved: '#10b981', rejected: '#ef4444', revoked: '#64748b' };
		function points(arr) {
			return arr.map(function (v, i) {
				var x = 8 + i * 14;
				var y = 88 - (v / max) * 70;
				return x + ',' + y;
			}).join(' ');
		}
		function pointNodes(key, label) {
			return series[key].map(function (v, i) {
				var x = 8 + i * 14;
				var y = 88 - (v / max) * 70;
				return '<circle class="access-line-hit" cx="' + x + '" cy="' + y + '" r="2.8" fill="' + colors[key] + '"><title>' + label + ' ' + labels[i].slice(5).replace('-', '/') + ': ' + formatNumber(v) + '</title></circle>';
			}).join('');
		}
		var gridLines = [18, 36, 54, 72, 88].map(function (y) {
			return '<line class="access-line-grid-stroke" x1="8" y1="' + y + '" x2="98" y2="' + y + '"></line>';
		}).join('') + [8, 22, 36, 50, 64, 78, 92].map(function (x) {
			return '<line class="access-line-grid-stroke" x1="' + x + '" y1="8" x2="' + x + '" y2="88"></line>';
		}).join('');
		var yLabelHtml = yTicks.map(function (value) {
			var y = 88 - (value / max) * 70;
			return '<span style="top:' + y + '%">' + formatNumber(value) + '</span>';
		}).join('');
		target.innerHTML =
			'<div class="access-line-plot">' +
				'<div class="access-line-ylabels">' + yLabelHtml + '</div>' +
				'<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
					gridLines +
					'<line class="access-line-axis-stroke" x1="8" y1="8" x2="8" y2="88"></line>' +
					'<line class="access-line-axis-stroke" x1="8" y1="88" x2="98" y2="88"></line>' +
					Object.keys(series).map(function (key) { return '<polyline fill="none" stroke="' + colors[key] + '" stroke-width="1.8" points="' + points(series[key]) + '"/>'; }).join('') +
					pointNodes('requested', '신청') + pointNodes('approved', '승인') + pointNodes('rejected', '반려') + pointNodes('revoked', '회수') +
				'</svg>' +
			'</div>' +
			'<div class="access-line-axis">' + labels.map(function (l) { return '<span>' + l.slice(5).replace('-', '/') + '</span>'; }).join('') + '</div>';
	}
	function renderApprovalTrend(rows) {
		var target = qs('dash-approval-trend');
		if (!target) return;
		var counts = { requested: 0, approved: 0, rejected: 0, revoked: 0 };
		rows.forEach(function (row) {
			var st = requestStatus(row);
			counts.requested += 1;
			if (st.indexOf('approved') >= 0 || st.indexOf('승인') >= 0 || st.indexOf('?뱀씤') >= 0) counts.approved += 1;
			if (st.indexOf('rejected') >= 0 || st.indexOf('반려') >= 0 || st.indexOf('諛섎젮') >= 0) counts.rejected += 1;
			if (st.indexOf('revoked') >= 0 || st.indexOf('회수') >= 0 || st.indexOf('?뚯닔') >= 0 || st.indexOf('cancel') >= 0) counts.revoked += 1;
		});
		var entries = [
			{ label: '신청', count: counts.requested, color: '#2563eb' },
			{ label: '승인', count: counts.approved, color: '#10b981' },
			{ label: '반려', count: counts.rejected, color: '#ef4444' },
			{ label: '회수', count: counts.revoked, color: '#64748b' }
		];
		var total = entries.reduce(function (sum, item) { return sum + item.count; }, 0);
		var acc = 0;
		var stops = entries.map(function (item) {
			var start = total ? (acc / total) * 100 : 0;
			acc += item.count;
			var end = total ? (acc / total) * 100 : 0;
			return item.color + ' ' + start + '% ' + end + '%';
		});
		target.innerHTML =
			'<div class="access-approval-pie" style="background:' + (total ? 'conic-gradient(' + stops.join(',') + ')' : '#e2e8f0') + '" title="' + entries.map(function (item) { return item.label + ': ' + formatNumber(item.count); }).join('\n') + '">' +
				'<span>' + formatNumber(total) + '</span><em>전체</em>' +
			'</div>' +
			'<div class="access-approval-list">' + entries.map(function (item) {
				return '<span><i style="background:' + item.color + '"></i><b>' + item.label + '</b><strong>' + formatNumber(item.count) + '</strong></span>';
			}).join('') + '</div>';
	}
	function renderApprovalTrend(rows) {
		var target = qs('dash-approval-trend');
		if (!target) return;
		var rangeDays = Number(state.approvalRange || 30);
		var floor = new Date();
		floor.setHours(0, 0, 0, 0);
		floor.setDate(floor.getDate() - rangeDays + 1);
		var scopedRows = (rows || []).filter(function (row) {
			var date = asDate(requestTime(row));
			return date ? date >= floor : true;
		});
		var counts = { requested: 0, approved: 0, rejected: 0, revoked: 0 };
		scopedRows.forEach(function (row) {
			var st = requestStatus(row);
			counts.requested += 1;
			if (st.indexOf('approved') >= 0 || st.indexOf('승인') >= 0) counts.approved += 1;
			if (st.indexOf('rejected') >= 0 || st.indexOf('반려') >= 0) counts.rejected += 1;
			if (st.indexOf('revoked') >= 0 || st.indexOf('회수') >= 0 || st.indexOf('cancel') >= 0) counts.revoked += 1;
		});
		var entries = [
			{ label: '신청', count: counts.requested, color: '#2563eb' },
			{ label: '승인', count: counts.approved, color: '#10b981' },
			{ label: '반려', count: counts.rejected, color: '#ef4444' },
			{ label: '회수', count: counts.revoked, color: '#64748b' }
		];
		var total = entries.reduce(function (sum, item) { return sum + item.count; }, 0);
		var acc = 0;
		var stops = entries.map(function (item) {
			var start = total ? (acc / total) * 100 : 0;
			acc += item.count;
			var end = total ? (acc / total) * 100 : 0;
			return item.color + ' ' + start + '% ' + end + '%';
		});
		var ranges = [
			{ label: '1개월', days: 30 },
			{ label: '1분기', days: 90 },
			{ label: '1년', days: 365 }
		];
		target.innerHTML =
			'<label class="access-approval-range" aria-label="승인 현황 기간">' +
				'<select id="dash-approval-range-select">' + ranges.map(function (item) {
					return '<option value="' + item.days + '"' + (rangeDays === item.days ? ' selected' : '') + '>' + item.label + '</option>';
				}).join('') + '</select>' +
			'</label>' +
			'<div class="access-approval-pie" style="background:' + (total ? 'conic-gradient(' + stops.join(',') + ')' : '#e2e8f0') + '">' +
				'<span>' + formatNumber(total) + '</span>' +
			'</div>' +
			'<div class="access-approval-list">' + entries.map(function (item) {
				return '<span><i style="background:' + item.color + '"></i><b>' + item.label + '</b><strong>' + formatNumber(item.count) + '</strong></span>';
			}).join('') + '</div>';
		var select = qs('dash-approval-range-select');
		if (select) {
			select.addEventListener('change', function () {
				state.approvalRange = Number(select.value || 30);
				renderApprovalTrend(rows || []);
			});
		}
	}

	function renderLiveMonitor(logs) {
		var chart = qs('dash-live-chart');
		var summary = qs('dash-live-summary');
		if (!chart || !summary) return;
		var rangeHours = Number(state.liveRange || 24);
		var now = new Date();
		var floor = new Date(now.getTime() - rangeHours * 60 * 60 * 1000);
		var liveLogs = (logs || []).filter(function (row) {
			var date = asDate(auditTime(row));
			return date ? date >= floor : true;
		});
		var buckets = [];
		for (var i = 0; i < 12; i += 1) {
			var bucketStart = new Date(floor.getTime() + (rangeHours / 12) * i * 60 * 60 * 1000);
			var label = rangeHours <= 24
				? bucketStart.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
				: (bucketStart.getMonth() + 1) + '/' + bucketStart.getDate();
			buckets.push({ label: label, success: 0, failed: 0, blocked: 0 });
		}
		liveLogs.forEach(function (row, index) {
			var date = asDate(auditTime(row));
			var bucketIndex = date ? Math.min(11, Math.max(0, Math.floor((date.getTime() - floor.getTime()) / (rangeHours * 60 * 60 * 1000) * 12))) : (index % 12);
			var result = auditResult(row);
			if (result === '차단' || result === '李⑤떒') buckets[bucketIndex].blocked += 1;
			else if (result === '실패' || result === '?ㅽ뙣') buckets[bucketIndex].failed += 1;
			else buckets[bucketIndex].success += 1;
		});
		var totals = buckets.reduce(function (acc, item) {
			acc.success += item.success;
			acc.failed += item.failed;
			acc.blocked += item.blocked;
			return acc;
		}, { success: 0, failed: 0, blocked: 0 });
		var total = Math.max(1, totals.success + totals.failed + totals.blocked);
		var maxValue = Math.max(1, buckets.reduce(function (max, item) {
			return Math.max(max, item.success + item.failed + item.blocked);
		}, 0));
		var areaPoints = buckets.map(function (item, index) {
			return [42 + (index * 62), Math.round(178 - ((item.success + item.failed) / maxValue) * 128)];
		});
		var failedPoints = buckets.map(function (item, index) {
			return [42 + (index * 62), Math.round(178 - (item.failed / maxValue) * 128)];
		});
		var blockedPoints = buckets.map(function (item, index) {
			return [42 + (index * 62), Math.round(178 - (item.blocked / maxValue) * 128)];
		});
		function toPath(points) {
			if (!points.length) return '';
			if (points.length === 1) return 'M' + points[0][0] + ' ' + points[0][1];
			var d = 'M' + points[0][0] + ' ' + points[0][1];
			for (var i = 1; i < points.length; i += 1) {
				var prev = points[i - 1];
				var curr = points[i];
				var midX = (prev[0] + curr[0]) / 2;
				d += ' C' + midX + ' ' + prev[1] + ' ' + midX + ' ' + curr[1] + ' ' + curr[0] + ' ' + curr[1];
			}
			return d;
		}
		var labels = buckets.map(function (item, index) {
			if (index % 2) return '';
			var x = 42 + (index * 62);
			return '<text x="' + x + '" y="190" text-anchor="middle">' + esc(item.label) + '</text>';
		}).join('');
		var hitAreas = buckets.map(function (item, index) {
			var x = 21 + (index * 62);
			var title = item.label + '\n성공: ' + formatNumber(item.success) + '\n실패: ' + formatNumber(item.failed) + '\n차단: ' + formatNumber(item.blocked);
			return '<rect class="access-live-hit" x="' + x + '" y="35" width="42" height="152"><title>' + esc(title) + '</title></rect>';
		}).join('');
		chart.innerHTML =
			'<div class="access-live-legend"><span class="is-ok">성공</span><span class="is-fail">실패</span><span class="is-block">차단</span></div>' +
			'<svg viewBox="0 0 760 228" role="img">' +
				'<line x1="38" y1="54" x2="730" y2="54" class="grid"/><line x1="38" y1="116" x2="730" y2="116" class="grid"/><line x1="38" y1="178" x2="730" y2="178" class="axis"/>' +
				'<text x="8" y="58">2</text><text x="8" y="120">1</text><text x="8" y="182">0</text>' +
				'<path class="area-ok" d="' + toPath(areaPoints) + ' L' + areaPoints[areaPoints.length - 1][0] + ' 178 L42 178 Z"></path>' +
				'<path class="line-fail" d="' + toPath(failedPoints) + '"></path>' +
				'<path class="line-block" d="' + toPath(blockedPoints) + '"></path>' +
				labels + hitAreas +
			'</svg>';
		var summaryItems = [
			{ label: '성공', value: totals.success, cls: 'ok' },
			{ label: '실패', value: totals.failed, cls: 'fail' },
			{ label: '차단', value: totals.blocked, cls: 'block' }
		];
		summary.innerHTML = summaryItems.map(function (item) {
			var pct = Math.round((item.value / total) * 1000) / 10;
			var deg = Math.max(0, Math.min(360, pct * 3.6));
			return '<div class="access-live-summary-row access-live-summary-row--' + item.cls + '">' +
				'<div><span>' + item.label + '</span><strong>' + formatNumber(item.value) + '</strong><em>(' + pct + '%)</em></div>' +
				'<i style="--value:' + deg + 'deg"></i>' +
			'</div>';
		}).join('');
	}

	function renderLiveMonitor(logs) {
		var chart = qs('dash-live-chart');
		var summary = qs('dash-live-summary');
		if (!chart || !summary) return;
		var rangeHours = Number(state.liveRange || 24);
		var now = new Date();
		var floor = new Date(now.getTime() - rangeHours * 60 * 60 * 1000);
		if (rangeHours === 24) floor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
		var end = rangeHours === 24 ? new Date(floor.getTime() + 24 * 60 * 60 * 1000) : now;
		var liveLogs = (logs || []).filter(function (row) {
			var date = asDate(auditTime(row));
			return date ? date >= floor && date < end : true;
		});
		var bucketCount = rangeHours === 24 ? 24 : 12;
		var buckets = [];
		for (var i = 0; i < bucketCount; i += 1) {
			var bucketStart = new Date(floor.getTime() + ((end.getTime() - floor.getTime()) / bucketCount) * i);
			var label = rangeHours === 24 ? String(i).padStart(2, '0') + ':00' : (bucketStart.getMonth() + 1) + '/' + bucketStart.getDate();
			buckets.push({ label: label, success: 0, failed: 0, blocked: 0 });
		}
		liveLogs.forEach(function (row, index) {
			var date = asDate(auditTime(row));
			var bucketIndex = date ? Math.min(bucketCount - 1, Math.max(0, Math.floor((date.getTime() - floor.getTime()) / (end.getTime() - floor.getTime()) * bucketCount))) : (index % bucketCount);
			var result = liveAuditResult(row);
			if (result === 'blocked') buckets[bucketIndex].blocked += 1;
			else if (result === 'failed') buckets[bucketIndex].failed += 1;
			else buckets[bucketIndex].success += 1;
		});
		var totals = buckets.reduce(function (acc, item) {
			acc.success += item.success;
			acc.failed += item.failed;
			acc.blocked += item.blocked;
			return acc;
		}, { success: 0, failed: 0, blocked: 0 });
		var total = Math.max(1, totals.success + totals.failed + totals.blocked);
		var maxValue = Math.max(1, buckets.reduce(function (max, item) {
			return Math.max(max, item.success, item.failed, item.blocked);
		}, 0));
		var left = 42;
		var right = 730;
		var width = right - left;
		function xForIndex(index) {
			return left + (bucketCount === 1 ? 0 : (index / (bucketCount - 1)) * width);
		}
		function yForValue(value) {
			return Math.round(178 - (value / maxValue) * 128);
		}
		var successPoints = buckets.map(function (item, index) { return [xForIndex(index), yForValue(item.success)]; });
		var failedPoints = buckets.map(function (item, index) { return [xForIndex(index), yForValue(item.failed)]; });
		var blockedPoints = buckets.map(function (item, index) { return [xForIndex(index), yForValue(item.blocked)]; });
		function toPath(points) {
			if (!points.length) return '';
			if (points.length === 1) return 'M' + points[0][0] + ' ' + points[0][1];
			var d = 'M' + points[0][0] + ' ' + points[0][1];
			for (var i = 1; i < points.length; i += 1) {
				var prev = points[i - 1];
				var curr = points[i];
				var midX = (prev[0] + curr[0]) / 2;
				d += ' C' + midX + ' ' + prev[1] + ' ' + midX + ' ' + curr[1] + ' ' + curr[0] + ' ' + curr[1];
			}
			return d;
		}
		var labels = buckets.map(function (item, index) {
			if (rangeHours === 24) {
				if ([0, 6, 12, 18, 23].indexOf(index) < 0) return '';
				var fixedLabel = index === 23 ? '24:00' : String(index).padStart(2, '0') + ':00';
				return '<text x="' + xForIndex(index) + '" y="190" text-anchor="middle">' + fixedLabel + '</text>';
			}
			if (index % 2) return '';
			return '<text x="' + xForIndex(index) + '" y="190" text-anchor="middle">' + esc(item.label) + '</text>';
		}).join('');
		var hitWidth = Math.max(18, width / bucketCount);
		var hitAreas = buckets.map(function (item, index) {
			var x = xForIndex(index);
			var title = item.label + '\n성공: ' + formatNumber(item.success) + '\n실패: ' + formatNumber(item.failed) + '\n차단: ' + formatNumber(item.blocked);
			return '<g class="access-live-hover">' +
				'<rect class="access-live-hit" x="' + (x - hitWidth / 2) + '" y="35" width="' + hitWidth + '" height="152"><title>' + esc(title) + '</title></rect>' +
				'<circle class="access-live-dot access-live-dot--ok" cx="' + x + '" cy="' + successPoints[index][1] + '" r="4"><title>' + esc(title) + '</title></circle>' +
				'<circle class="access-live-dot access-live-dot--fail" cx="' + x + '" cy="' + failedPoints[index][1] + '" r="4"><title>' + esc(title) + '</title></circle>' +
				'<circle class="access-live-dot access-live-dot--block" cx="' + x + '" cy="' + blockedPoints[index][1] + '" r="4"><title>' + esc(title) + '</title></circle>' +
			'</g>';
		}).join('');
		chart.innerHTML =
			'<div class="access-live-legend"><span class="is-ok">성공</span><span class="is-fail">실패</span><span class="is-block">차단</span></div>' +
			'<svg viewBox="0 0 760 228" role="img">' +
				'<line x1="38" y1="54" x2="730" y2="54" class="grid"/><line x1="38" y1="116" x2="730" y2="116" class="grid"/><line x1="38" y1="178" x2="730" y2="178" class="axis"/>' +
				'<text x="8" y="58">2</text><text x="8" y="120">1</text><text x="8" y="182">0</text>' +
				'<path class="area-ok" d="' + toPath(successPoints) + ' L' + successPoints[successPoints.length - 1][0] + ' 178 L42 178 Z"></path>' +
				'<path class="line-fail" d="' + toPath(failedPoints) + '"></path>' +
				'<path class="line-block" d="' + toPath(blockedPoints) + '"></path>' +
				labels + hitAreas +
			'</svg>';
		var summaryItems = [
			{ label: '성공', value: totals.success, cls: 'ok' },
			{ label: '실패', value: totals.failed, cls: 'fail' },
			{ label: '차단', value: totals.blocked, cls: 'block' }
		];
		summary.innerHTML = summaryItems.map(function (item) {
			var pct = Math.round((item.value / total) * 1000) / 10;
			var deg = Math.max(0, Math.min(360, pct * 3.6));
			return '<div class="access-live-summary-row access-live-summary-row--' + item.cls + '">' +
				'<div><span>' + item.label + '</span><strong>' + formatNumber(item.value) + '</strong><em>(' + pct + '%)</em></div>' +
				'<i style="--value:' + deg + 'deg"></i>' +
			'</div>';
		}).join('');
	}

	function renderDashboard() {
		var rows = state.all || [];
		var requests = dashRows('requests');
		var auditLogs = dashRows('auditLogs');
		var grants = dashRows('grants');
		var notifications = dashRows('notifications');
		var categories = dashboardCategories();
		var total = rows.length;
		var active = rows.filter(function (row) { return !!row.active_flag; }).length;
		var blocked = total - active;
		var endpointTotal = rows.reduce(function (sum, row) { return sum + accessEndpoints(row).length; }, 0);
		var pendingApprovals = requests.filter(function (row) {
			var st = requestStatus(row);
			return st.indexOf('pending') >= 0 || st.indexOf('대기') >= 0 || st === '';
		}).length;
		var todayAccess = auditLogs.filter(function (row) { return isTodayValue(auditTime(row)); }).length;
		var activeGrants = grants.filter(isActiveGrant).length;
		var expiring30 = grants.filter(function (row) {
			var d = daysUntil(row.expires_at || row.expired_at || row.end_date || row.request_end_date || row.grant_end_date);
			return d !== null && d >= 0 && d <= 30;
		}).length;
		var riskyLogs = dashRows('riskAuditLogs').map(function (row) {
			return Object.assign({}, row, {
				_risk_reason: row.risk_label || row.risk_reason || riskReason(row),
				_severity: row.risk_severity === 'danger' ? 'danger' : (row.risk_severity === 'normal' ? 'normal' : 'warning')
			});
		});
		setDashText('dash-total-resources', total);
		setDashText('dash-active-grants', activeGrants);
		setDashText('dash-pending-approvals', pendingApprovals);
		setDashText('dash-today-access', todayAccess);
		setDashText('dash-expiring-grants', expiring30);
		setDashText('dash-risky-access', riskyLogs.length);
		var riskMetric = qs('dash-risky-access');
		if (riskMetric && riskMetric.closest('.access-ops-metric')) {
			riskMetric.closest('.access-ops-metric').onclick = function () {
				window.location.href = '/b/access_control_audit?scope=risk';
			};
		}

		var categoryCounts = {};
		categories.forEach(function (category) { categoryCounts[category] = 0; });
		var endpointCounts = {};
		var operationCounts = {};
		var consoleCounts = {};
		var statusCounts = { '사용 가능': active, '점검 중': 0, '사용 중지': blocked, '폐기 예정': 0 };
		rows.forEach(function (row) {
			var category = rowCategory(row);
			if (Object.prototype.hasOwnProperty.call(categoryCounts, category)) categoryCounts[category] += 1;
			accessEndpoints(row).forEach(function (endpoint) {
				incrementCount(endpointCounts, endpointAccessType(endpoint));
			});
			if (category === '관리콘솔') incrementCount(consoleCounts, rowCategoryDetail(row));
			else incrementCount(operationCounts, rowWorkOperation(row));
		});
		var usedCategories = categories.filter(function (category) { return categoryCounts[category] > 0; }).length;
		var activeRate = total ? Math.round((active / total) * 100) : 0;
		var blockedRate = total ? Math.round((blocked / total) * 100) : 0;
		var healthScore = total ? Math.max(0, Math.min(100, Math.round(100 - (blockedRate * 0.45) - Math.min(40, riskyLogs.length * 8) - Math.min(20, pendingApprovals * 1.5)))) : 0;
		var healthLabel = total ? (healthScore >= 85 ? '정상 운영' : (healthScore >= 65 ? '주의 관찰' : '개선 필요')) : '데이터 없음';
		var topEndpoint = topEntries(endpointCounts, 1)[0];
		setDashRawText('dash-coverage-summary',
			total ?
				'승인 대기 ' + formatNumber(pendingApprovals) + '건, 오늘 접속 ' + formatNumber(todayAccess) + '건, 위험 접근 ' + formatNumber(riskyLogs.length) + '건을 추적 중입니다.' :
				'등록된 접근 통제 자원이 없습니다.'
		);
		setDashText('dash-health-score', healthScore);
		setDashText('dash-ai-score', healthScore);
		setDashRawText('dash-health-label', healthLabel);
		setDashRawText('dash-ai-level', healthLabel);
		setDashRawText('dash-service-footprint', '분류 기준 ' + formatNumber(usedCategories) + '개 영역');
		setDashRawText('dash-active-grants-note', activeGrants ? '현재 유효 권한' : '유효 권한 없음');
		setDashRawText('dash-pending-note', pendingApprovals ? '즉시 처리 필요' : '대기 없음');
		setDashRawText('dash-today-access-note', todayAccess ? '오늘 발생 이벤트' : '오늘 접속 없음');
		setDashRawText('dash-expiring-note', '30일 이내 만료');
		setDashRawText('dash-risk-note', riskyLogs.length ? '우선 확인 필요' : '위험 없음');
		setDashRawText('dash-primary-risk', topEndpoint ? topEndpoint.label + ' 중심 노출' : '접속 유형 없음');
		setDashRawText('dash-live-sessions', '실시간 접속 ' + formatNumber(auditLogs.filter(function (row) {
			return !row.session_ended_at && auditResult(row) === '성공';
		}).length));
		setDashRawText('dash-last-updated', new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) + ' 갱신');
		var healthRing = qs('dash-health-ring');
		if (healthRing) {
			healthRing.style.setProperty('--health-score', String(healthScore));
			healthRing.setAttribute('data-level', healthScore >= 90 ? 'good' : (healthScore >= 70 ? 'watch' : 'risk'));
		}

		var endpointEntries = topEntries(endpointCounts, 8);
		var assetLegendCategories = [categories[0], categories[2], categories[1], categories[3]].filter(Boolean);
		renderDonut('dash-asset-donut', 'dash-asset-legend', 'dash-asset-donut-total', assetLegendCategories.map(function (category) {
			return { label: category, count: categoryCounts[category] || 0 };
		}));
		renderMethodBars('dash-method-legend', ['SSH', 'WEB', 'RDP', 'DB', 'Kubernetes'].map(function (type) {
			var count = endpointEntries.reduce(function (sum, item) {
				var label = item.label.toUpperCase();
				if ((type === 'WEB' && (label === 'HTTPS' || label === 'HTTP' || label === 'WEB')) || label === type.toUpperCase()) return sum + item.count;
				return sum;
			}, 0);
			return { label: type, count: count };
		}));
		renderApprovalTrend(requests);

		var todayExpired = grants.filter(function (row) { return daysUntil(row.expires_at || row.end_date || row.request_end_date) === 0; }).length;
		var unusedAccounts = auditLogs.filter(function (row) { return riskReason(row) === '장기 미사용 계정 로그인'; }).length;
		var policyViolations = riskyLogs.filter(function (row) { return row._severity === 'danger'; }).length;
		var taskTarget = qs('dash-today-work');
		if (taskTarget) {
			var tasks = [
				{ label: '승인 요청', desc: '검토 대기 중인 접근 신청', count: pendingApprovals, severity: severityForCount(pendingApprovals, 1, 10), href: '/b/access_control_request' },
				{ label: '오늘 만료 권한', desc: '오늘 회수 또는 연장 확인', count: todayExpired, severity: severityForCount(todayExpired, 1, 5), href: '/b/access_control_request' },
				{ label: '장기 미사용 계정', desc: '휴면성 로그인 재점검 대상', count: unusedAccounts, severity: severityForCount(unusedAccounts, 1, 3), href: '/b/access_control_audit' },
				{ label: '정책 위반 건수', desc: '즉시 확인이 필요한 차단/위반', count: policyViolations, severity: severityForCount(policyViolations, 1, 3), href: '/b/access_control_audit' }
			];
			var totalTasks = tasks.reduce(function (sum, item) { return sum + item.count; }, 0);
			taskTarget.innerHTML =
				'<div class="access-task-summary"><span>오늘 처리</span><strong>' + formatNumber(totalTasks) + '</strong><em>확인 필요</em></div>' +
				'<div class="access-task-list">' + tasks.map(function (item) {
					return '<a class="access-task-card access-task-card--' + item.severity + '" href="' + esc(item.href) + '">' +
						'<span class="access-task-icon" aria-hidden="true"></span>' +
						'<span class="access-task-copy"><b>' + esc(item.label) + '</b><em>' + esc(item.desc) + '</em></span>' +
						'<strong>' + formatNumber(item.count) + '</strong>' +
						renderSeverityBadge(item.severity) +
					'</a>';
				}).join('') + '</div>';
		}

		var findings = [
			{ title: '평소 대비 접속 증가', count: Math.max(0, todayAccess - 10), severity: severityForCount(todayAccess, 20, 50) },
			{ title: '관리자 권한 상승 감지', count: riskyLogs.filter(function (r) { return r._risk_reason === '권한 상승'; }).length, severity: 'danger' },
			{ title: '비인가 서버 접근 시도', count: riskyLogs.filter(function (r) { return r._risk_reason === '비인가 자산 접근'; }).length, severity: 'danger' },
			{ title: '해외 접속 탐지', count: riskyLogs.filter(function (r) { return r._risk_reason === '국외 IP 접속'; }).length, severity: 'warning' },
			{ title: '비정상 세션 패턴 탐지', count: riskyLogs.filter(function (r) { return r._risk_reason === '새벽 접속'; }).length, severity: 'warning' },
			{ title: '장기 미사용 계정 사용 감지', count: unusedAccounts, severity: 'warning' }
		].sort(function (a, b) { return b.count - a.count; });
		var aiFindings = qs('dash-ai-findings');
		if (aiFindings) {
			aiFindings.innerHTML = findings.map(function (item) {
				return '<div class="access-ai-finding access-ai-finding--' + item.severity + '"><div><strong>' + esc(item.title) + '</strong><span>' + formatNumber(item.count) + '건 탐지</span></div>' + renderSeverityBadge(item.count ? item.severity : 'normal', item.count ? null : '정상') + '</div>';
			}).join('');
		}

		var riskBody = qs('dash-risk-table');
		if (riskBody) {
			riskBody.innerHTML = riskyLogs.slice(0, 10).map(function (row) {
				return '<tr><td>' + esc(auditUser(row)) + '</td><td>' + esc(auditResource(row)) + '</td><td>' + esc(auditMethod(row)) + '</td><td>' + esc(row._risk_reason || '정책 위반') + '</td><td>' + renderSeverityBadge(row._severity) + '</td></tr>';
			}).join('') || renderEmptyRow(5, '위험 접근 이벤트가 없습니다.');
		}
		var realtimeBody = qs('dash-realtime-table');
		if (realtimeBody) {
			realtimeBody.innerHTML = auditLogs.slice(0, 10).map(function (row) {
				var result = auditResult(row);
				var sev = result === '차단' ? 'danger' : (result === '실패' ? 'warning' : 'normal');
				var date = asDate(auditTime(row));
				return '<tr><td>' + esc(date ? date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-') + '</td><td>' + esc(auditUser(row)) + '</td><td>' + esc(auditResource(row)) + '</td><td>' + esc(auditMethod(row)) + '</td><td>' + renderSeverityBadge(sev, result) + '</td></tr>';
			}).join('') || renderEmptyRow(5, '접속 이력이 없습니다.');
		}

		renderLiveMonitor(auditLogs);

		renderBarList('dash-expiry-bars', [
			{ label: '오늘', count: grants.filter(function (row) { return daysUntil(row.expires_at || row.end_date || row.request_end_date) === 0; }).length },
			{ label: '7일 이내', count: grants.filter(function (row) { var d = daysUntil(row.expires_at || row.end_date || row.request_end_date); return d !== null && d >= 0 && d <= 7; }).length },
			{ label: '30일 이내', count: expiring30 },
			{ label: '90일 이내', count: grants.filter(function (row) { var d = daysUntil(row.expires_at || row.end_date || row.request_end_date); return d !== null && d >= 0 && d <= 90; }).length }
		], Math.max(1, grants.length));

		var orgCounts = {};
		requests.forEach(function (row) {
			var org = String(row.requester_department || row.department || row.organization || '미지정').trim() || '미지정';
			if (!orgCounts[org]) orgCounts[org] = { users: {}, grants: 0, access: 0, approvals: 0 };
			orgCounts[org].users[row.requester_emp_no || row.requester_name || org] = true;
			orgCounts[org].approvals += 1;
		});
		grants.forEach(function (row) {
			var org = String(row.department || row.user_department || row.requester_department || '미지정').trim() || '미지정';
			if (!orgCounts[org]) orgCounts[org] = { users: {}, grants: 0, access: 0, approvals: 0 };
			orgCounts[org].grants += 1;
		});
		auditLogs.forEach(function (row) {
			var org = String(row.department || row.user_department || row.requester_department || '미지정').trim() || '미지정';
			if (!orgCounts[org]) orgCounts[org] = { users: {}, grants: 0, access: 0, approvals: 0 };
			orgCounts[org].access += 1;
		});
		var orgBody = qs('dash-org-table');
		if (orgBody) {
			orgBody.innerHTML = Object.keys(orgCounts).map(function (org) {
				var item = orgCounts[org];
				return { org: org, users: Object.keys(item.users).length, grants: item.grants, access: item.access, approvals: item.approvals };
			}).sort(function (a, b) { return (b.access + b.approvals + b.grants) - (a.access + a.approvals + a.grants); }).slice(0, 10).map(function (item) {
				return '<tr><td>' + esc(item.org) + '</td><td>' + formatNumber(item.users) + '</td><td>' + formatNumber(item.grants) + '</td><td>' + formatNumber(item.access) + '</td><td>' + formatNumber(item.approvals) + '</td></tr>';
			}).join('') || renderEmptyRow(5, '조직별 이용 데이터가 없습니다.');
		}

		var assetStatus = qs('dash-asset-status');
		if (assetStatus) {
			assetStatus.innerHTML = Object.keys(statusCounts).map(function (label) {
				var sev = label === '사용 가능' ? 'normal' : (label === '점검 중' ? 'warning' : 'danger');
				return '<div class="access-status-tile access-status-tile--' + sev + '"><span>' + esc(label) + '</span><strong>' + formatNumber(statusCounts[label]) + '</strong></div>';
			}).join('');
		}
		var notice = qs('dash-notice-list');
		if (notice) {
			var items = notifications.slice(0, 6);
			if (!items.length) {
				items = [
					{ title: '접근제어 정책 변경 없음', type: '정책', created_at: new Date().toISOString() },
					{ title: '예정된 점검 일정 없음', type: '점검', created_at: new Date().toISOString() },
					{ title: '신규 공지사항 없음', type: '공지', created_at: new Date().toISOString() }
				];
			}
			notice.innerHTML = items.map(function (item) {
				return '<div class="access-notice-item"><span>' + esc(item.type || item.channel || '공지') + '</span><strong>' + esc(item.title || item.message || item.description || '정책 알림') + '</strong><em>' + esc((item.created_at || '').slice(0, 10) || '-') + '</em></div>';
			}).join('');
		}
		renderRankList('dash-operation-rank', topEntries(operationCounts, 5), rows.length, '업무 운영 데이터가 없습니다.');
		renderRankList('dash-console-rank', topEntries(consoleCounts, 5), rows.length, '관리콘솔 데이터가 없습니다.');
	}

	function syncStatusView(view) {
		state.view = view === 'dashboard' ? 'dashboard' : 'list';
		var dashboard = qs('status-dashboard');
		var list = qs('status-list-content');
		if (dashboard) dashboard.hidden = state.view !== 'dashboard';
		if (list) list.hidden = state.view === 'dashboard';
	}

	function applyFilters() {
		var search = (qs('status-search').value || '').trim().toLowerCase();
		var stateValue = (qs('status-state-filter').value || '').trim();
		var category = state.category || '';
		var categoryDetail = state.categoryDetail || '';
		var workOperationCode = state.workOperationCode || '';
		state.filtered = state.all.filter(function (row) {
			var eps = accessEndpoints(row);
			if (category) {
				var rowCat = rowCategory(row);
				if (rowCat !== category) return false;
			}
			if (category === '관리콘솔' && categoryDetail && rowCategoryDetail(row) !== categoryDetail) return false;
			if (category !== '관리콘솔' && workOperationCode && rowWorkOperationCode(row) !== workOperationCode) return false;
			if (stateValue) {
				var label = row.active_flag ? '사용 가능' : '차단';
				if (label !== stateValue) return false;
			}
			if (search) {
				var stateLbl = row.active_flag ? '사용 가능' : '차단';
				var hay = [row.resource_name, row.description, row.primary_url, row.primary_access_info, row.access_info, row.category_name, row.category_detail, row.work_operation_code, rowWorkOperation(row), categoryDisplay(row), stateLbl];
				eps.forEach(function (endpoint) {
					hay.push(endpoint.label, endpoint.host, endpoint.url, endpointAccessType(endpoint), endpointAccessInfo(endpoint), endpoint.protocol);
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
			var stateLabel = row.active_flag ? '사용 가능' : '차단';
			var dotCls = row.active_flag ? 'ws-run' : 'ws-c1';
			var checked = state.selected.has(row.id) ? ' checked' : '';
			return '' +
				'<tr data-id="' + esc(row.id) + '"' + (state.selected.has(row.id) ? ' class="selected"' : '') + '>' +
					'<td data-col="select" class="status-col-check"><input type="checkbox" class="row-check" data-id="' + esc(row.id) + '"' + checked + ' aria-label="선택"></td>' +
					'<td data-col="resource_name" data-label="자원명"><strong>' + esc(row.resource_name || '-') + '</strong></td>' +
					'<td data-col="category" data-label="분류">' + esc(categoryDisplay(row) || '-') + '</td>' +
					'<td data-col="work_operation" data-label="업무 운영">' + esc(rowWorkOperation(row) || '-') + '</td>' +
					'<td data-col="access_type" data-label="유형" class="status-col-access-type">' + renderAccessTypeCell(row) + '</td>' +
					'<td data-col="access_info" data-label="접속정보" class="status-col-access-info">' + renderAccessInfoCell(row) + '</td>' +
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
			info.textContent = '0-0 / 0개 항목';
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

	function extractRows(data) {
		if (!data) return [];
		if (Array.isArray(data)) return data;
		return data.rows || data.items || data.notifications || data.logs || data.data || [];
	}
	function loadDashboardData() {
		var calls = [
			fetchJson('/api/access-control/requests?scope=all').then(function (data) { state.dashboard.requests = extractRows(data); }).catch(function () { state.dashboard.requests = []; }),
			fetchJson('/api/access-control/audit-logs?page=1&page_size=50').then(function (data) { state.dashboard.auditLogs = extractRows(data); }).catch(function () { state.dashboard.auditLogs = []; }),
			fetchJson('/api/access-control/audit-logs?risk=1&page=1&page_size=50').then(function (data) { state.dashboard.riskAuditLogs = extractRows(data); }).catch(function () { state.dashboard.riskAuditLogs = []; }),
			fetchJson('/api/access-control/grants').then(function (data) { state.dashboard.grants = extractRows(data); }).catch(function () { state.dashboard.grants = []; }),
			fetchJson('/api/access-control/notifications').then(function (data) { state.dashboard.notifications = extractRows(data); }).catch(function () { state.dashboard.notifications = []; })
		];
		return Promise.all(calls).then(function () { renderDashboard(); });
	}
	function startDashboardLiveRefresh() {
		if (state.dashboardRefreshTimer) return;
		state.dashboardRefreshTimer = window.setInterval(function () {
			if (state.view !== 'dashboard') return;
			loadDashboardData();
		}, 30000);
	}
	function refreshLiveAccessData() {
		if (state.view !== 'dashboard') return Promise.resolve();
		return fetchJson('/api/access-control/audit-logs?page=1&page_size=200&_=' + Date.now())
			.then(function (data) {
				state.dashboard.auditLogs = extractRows(data);
				renderLiveMonitor(state.dashboard.auditLogs || []);
			})
			.catch(function () { return null; });
	}
	function startLiveAccessRefresh() {
		if (state.liveAuditRefreshTimer) return;
		state.liveAuditRefreshTimer = window.setInterval(refreshLiveAccessData, 5000);
	}

	function loadRows() {
		return fetchJson('/api/access-control/resources')
			.then(function (data) {
				state.all = data.rows || [];
				state.selected = new Set();
				applyFilters();
				renderDashboard();
				renderRows();
				loadDashboardData();
			})
			.catch(function (err) {
				state.all = [];
				state.filtered = [];
				renderDashboard();
				renderRows();
				loadDashboardData();
				var t = qs('status-empty-title');
				if (t) t.textContent = err.message || '자원 목록을 불러오지 못했습니다.';
			});
	}
	function loadWorkOperations() {
		return fetchJson('/api/work-operations')
			.then(function (data) {
				state.workOperations = data.items || data.rows || [];
				state.workOperationNames = {};
				state.workOperations.forEach(function (item) {
					var code = String(item.operation_code || '').trim();
					var name = String(item.wc_name || item.operation_name || '').trim();
					if (code && name) state.workOperationNames[code] = name;
				});
				populateWorkOperationSelects();
			})
			.catch(function () {
				state.workOperations = [];
				state.workOperationNames = {};
				populateWorkOperationSelects();
			});
	}
	function populateWorkOperationSelects() {
		var filter = qs('status-work-operation-filter');
		var form = qs('form-work-operation');
		if (filter) {
			filter.innerHTML = operationOptionsHtml('운영 전체');
			filter.value = state.workOperationCode || '';
			syncSearchSelect(filter);
		}
		if (form) {
			form.innerHTML = operationOptionsHtml('업무 운영 선택');
			syncSearchSelect(form);
		}
	}

	function syncResourceNameMode() {
		var category = normalizeCategory(qs('form-category').value);
		var isSystem = category === '시스템';
		var standardRow = qs('form-resource-name-standard-row');
		var businessRow = qs('form-business-name-row');
		var systemRow = qs('form-system-name-row');
		var systemPanel = qs('system-resource-panel');
		var agentPanel = qs('resource-agent-panel');
		var agentSection = qs('agent-mapping-section');
		if (standardRow) standardRow.hidden = isSystem;
		if (businessRow) businessRow.hidden = !isSystem;
		if (systemRow) systemRow.hidden = !isSystem;
		if (agentSection) agentSection.hidden = !isSystem;
		if (!isSystem && systemPanel) systemPanel.hidden = true;
		if (!isSystem && agentPanel) agentPanel.hidden = true;
		updateResourceNameHidden();
	}

	function renderSystemResources(rows, message) {
		var list = qs('system-resource-list');
		var summary = qs('system-resource-summary');
		var pageInfo = qs('system-resource-page-info');
		var prev = qs('system-resource-prev');
		var next = qs('system-resource-next');
		if (!list) return;
		if (summary) {
			summary.textContent = state.systemResourceTotal ?
				'총 ' + state.systemResourceTotal + '개 중 ' + rows.length + '개 표시' :
				'업무명과 시스템명을 선택하세요.';
		}
		if (pageInfo) pageInfo.textContent = '1 / 1';
		if (prev) prev.disabled = true;
		if (next) next.disabled = true;
		if (message) {
			list.innerHTML = '<div class="resource-picker-empty">' + esc(message) + '</div>';
			return;
		}
		if (!rows.length) {
			list.innerHTML = '<div class="resource-picker-empty">선택 가능한 시스템 &gt; 서버 자원이 없습니다.</div>';
			return;
		}
		list.innerHTML = rows.map(function (row, index) {
			var business = systemResourceBusinessName(row);
			var system = systemResourceSystemName(row);
			return '<button type="button" class="resource-picker-item" data-system-resource-index="' + index + '">' +
				'<span class="resource-picker-name">' + esc(business || '업무 미지정') + '</span>' +
				'<span class="resource-picker-meta">' + esc(system || '시스템 미지정') + '</span>' +
			'</button>';
		}).join('');
	}

	function loadSystemResources() {
		renderSystemResources([], '시스템 > 서버 목록을 불러오는 중입니다.');
		var params = new URLSearchParams({
			q: state.systemResourceKeyword || '',
			limit: String(state.systemResourcePageSize),
			asset_category: 'SERVER'
		});
		return fetchJson('/api/hardware-assets/suggest-work-systems?' + params.toString())
			.then(function (data) {
				state.systemResources = data.items || data.rows || [];
				state.systemResourceTotal = state.systemResources.length;
				renderSystemResources(state.systemResources);
				return state.systemResources;
			})
			.catch(function (err) {
				renderSystemResources([], err.message || '시스템 > 서버 목록을 불러오지 못했습니다.');
				return [];
			});
	}

	function toggleSystemResourcePanel() {
		var panel = qs('system-resource-panel');
		var agentPanel = qs('resource-agent-panel');
		if (!panel) return;
		if (agentPanel) agentPanel.hidden = true;
		panel.hidden = !panel.hidden;
		if (!panel.hidden) {
			var input = qs('system-resource-search-input');
			if (input) input.focus();
			loadSystemResources();
		}
	}

	function renderAgentResources(rows, message) {
		var list = qs('resource-agent-list');
		var summary = qs('resource-agent-summary');
		var pageInfo = qs('resource-agent-page-info');
		var prev = qs('resource-agent-prev');
		var next = qs('resource-agent-next');
		if (!list) return;
		if (summary) {
			summary.textContent = state.agentResourceTotal ?
				'총 ' + state.agentResourceTotal + '개 중 ' + rows.length + '개 표시' :
				'검색어를 입력해 에이전트를 좁혀보세요.';
		}
		if (pageInfo) pageInfo.textContent = state.agentResourcePage + ' / ' + state.agentResourceTotalPages;
		if (prev) prev.disabled = state.agentResourcePage <= 1;
		if (next) next.disabled = state.agentResourcePage >= state.agentResourceTotalPages;
		if (message) {
			list.innerHTML = '<div class="resource-picker-empty">' + esc(message) + '</div>';
			return;
		}
		if (!rows.length) {
			list.innerHTML = '<div class="resource-picker-empty">선택 가능한 승인 에이전트가 없습니다.</div>';
			return;
		}
		list.innerHTML = '<table class="agent-picker-table">' +
			'<thead><tr><th>에이전트 이름</th><th>에이전트 IP</th><th>에이전트 상태</th></tr></thead>' +
			'<tbody>' + rows.map(function (row, index) {
				return '<tr class="agent-picker-row" data-agent-index="' + index + '" tabindex="0">' +
					'<td>' + esc(agentDisplayName(row)) + '</td>' +
					'<td>' + esc(agentIp(row)) + '</td>' +
					'<td><span class="agent-status-text' + agentStatusClass(row) + '">' + esc(agentStatus(row)) + '</span></td>' +
				'</tr>';
			}).join('') + '</tbody></table>';
	}

	function loadAgentResources(page) {
		state.agentResourcePage = Math.max(1, parseInt(page || state.agentResourcePage || 1, 10));
		renderAgentResources([], '승인 에이전트 목록을 불러오는 중입니다.');
		var params = new URLSearchParams({
			page: String(state.agentResourcePage),
			page_size: String(state.agentResourcePageSize),
			keyword: state.agentResourceKeyword || '',
			resource_unmapped: '1',
			exclude_resource_id: state.editingId ? String(state.editingId) : ''
		});
		return fetchJson('/api/access-control/pc-agents?' + params.toString())
			.then(function (data) {
				state.agentResources = data.rows || data.items || [];
				state.agentResourceTotal = parseInt(data.total || state.agentResources.length || 0, 10);
				state.agentResourceTotalPages = Math.max(1, parseInt(data.total_pages || Math.ceil(state.agentResourceTotal / state.agentResourcePageSize) || 1, 10));
				state.agentResourcePage = Math.min(state.agentResourcePage, state.agentResourceTotalPages);
				renderAgentResources(state.agentResources);
				return state.agentResources;
			})
			.catch(function (err) {
				renderAgentResources([], err.message || '승인 에이전트 목록을 불러오지 못했습니다.');
				return [];
			});
	}

	function toggleAgentResourcePanel() {
		var panel = qs('resource-agent-panel');
		var systemPanel = qs('system-resource-panel');
		if (!panel) return;
		if (systemPanel) systemPanel.hidden = true;
		panel.hidden = !panel.hidden;
		if (!panel.hidden) {
			var input = qs('resource-agent-search-input');
			if (input) input.focus();
			loadAgentResources(1);
		}
	}

	function renderSelectedAgent() {
		var display = qs('agent-map-selected');
		var hidden = qs('form-agent-id');
		if (!display) {
			if (hidden) hidden.value = state.selectedAgent ? (state.selectedAgent.agent_id || '') : '';
			return;
		}
		if (!state.selectedAgent) {
			display.textContent = '선택된 에이전트가 없습니다.';
			display.classList.add('empty');
			if (hidden) hidden.value = '';
			return;
		}
		var row = state.selectedAgent;
		display.innerHTML = '<span class="agent-selected-name">' + esc(agentDisplayName(row)) + '</span>' +
			'<span class="agent-selected-meta">' + esc(agentIp(row)) + ' · ' + esc(agentStatus(row)) + '</span>';
		display.classList.remove('empty');
		if (hidden) hidden.value = row.agent_id || '';
	}

	function getModal() { return qs('status-add-modal'); }

	// ===== 접속점 repeater =====
var ENDPOINT_PROTOCOLS = {
	'시스템': ['SSH', 'SFTP', 'RDP', 'HTTPS'],
	'서비스': ['HTTP', 'HTTPS'],
	'컨테이너': ['HTTPS', 'API'],
	'관리콘솔': ['HTTP', 'HTTPS', 'SSH', 'SFTP']
};
	var ENDPOINT_DEFAULT_PORT = { HTTPS: 443, HTTP: 80, API: 443, SSH: 22, SFTP: 22, RDP: 3389 };
	var ENDPOINT_REMOTE_PROTOCOLS = { SSH: 1, SFTP: 1, RDP: 1 };

	function currentEndpointProtocols() {
		var category = normalizeCategory(qs('form-category').value);
		return ENDPOINT_PROTOCOLS[category] || ENDPOINT_PROTOCOLS['시스템'];
	}

	function endpointKindForProtocol(protocol) {
		var value = String(protocol || '').toUpperCase();
		return ENDPOINT_DEFAULT_PORT[value] ? value : 'HTTPS';
	}

	function protocolForKind(kind, current) {
		var protocols = currentEndpointProtocols();
		var selected = String(kind || current || '').toUpperCase();
		if (protocols.indexOf(selected) >= 0) return selected;
		return protocols[0] || 'HTTPS';
	}

	function fillProtocolOptions(selectEl, kind, current) {
		var opts = currentEndpointProtocols();
		var selected = protocolForKind(kind, current);
		if (!selectEl) return selected;
		if (selectEl.tagName && selectEl.tagName.toLowerCase() === 'input') {
			selectEl.value = selected;
			return selected;
		}
		selectEl.innerHTML = '';
		opts.forEach(function (p) {
			var o = document.createElement('option');
			o.value = p; o.textContent = p;
			if (p === selected) o.selected = true;
			selectEl.appendChild(o);
		});
		selectEl.value = selected;
		syncSearchSelect(selectEl);
	}

	function fillKindOptions(selectEl, currentKind) {
		var protocols = currentEndpointProtocols();
		var selected = protocolForKind(currentKind);
		selectEl.innerHTML = '';
		protocols.forEach(function (p) {
			selectEl.appendChild(new Option(p, p));
		});
		selectEl.value = selected;
		syncSearchSelect(selectEl);
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
		if (!ENDPOINT_REMOTE_PROTOCOLS[kind]) {
			var scheme = protocol === 'HTTP' ? 'http://' : 'https://';
			var p = path ? (path.charAt(0) === '/' ? path : '/' + path) : '';
			if (protocol === 'API') return 'API · ' + scheme + host + portPart + p;
			return scheme + host + portPart + p;
		}
		if (protocol === 'SFTP') return 'FileZilla · sftp://' + host + portPart;
		if (protocol === 'RDP') return 'RDP · ' + host + portPart;
		return 'ssh://' + host + portPart;
	}

	function refreshEndpointPreview(rowEl) {
		var preview = rowEl.querySelector('[data-role="preview"]');
		if (preview) preview.textContent = buildPreview(rowEl);
	}

	function applyKindToRow(rowEl) {
		var kind = rowEl.querySelector('[data-role="kind"]').value;
		var protocolSel = rowEl.querySelector('[data-role="protocol"]');
		fillProtocolOptions(protocolSel, kind, kind);
		var pathWrap = rowEl.querySelector('[data-role="path-wrap"]');
		if (pathWrap) pathWrap.style.display = ENDPOINT_REMOTE_PROTOCOLS[kind] ? 'none' : '';
		// 포트가 비어 있거나 이전 기본값이라면 새 기본값으로 자동 채움
		var portInput = rowEl.querySelector('[data-role="port"]');
		var newProto = protocolSel.value;
		var defPort = ENDPOINT_DEFAULT_PORT[newProto];
		if (defPort && (!portInput.value || Object.keys(ENDPOINT_DEFAULT_PORT).some(function (key) { return Number(portInput.value) === ENDPOINT_DEFAULT_PORT[key]; }))) {
			portInput.placeholder = '기본 ' + defPort;
		}
		refreshEndpointPreview(rowEl);
	}

	function refreshEndpointRowsForCategory() {
		document.querySelectorAll('#endpoint-list .endpoint-row').forEach(function (rowEl) {
			var protocolSel = rowEl.querySelector('[data-role="protocol"]');
			var kindSel = rowEl.querySelector('[data-role="kind"]');
			var currentProtocol = kindSel.value || protocolSel.value;
			fillKindOptions(kindSel, currentProtocol);
			fillProtocolOptions(protocolSel, kindSel.value, kindSel.value);
			applyKindToRow(rowEl);
		});
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
			+     '<select class="form-input endpoint-kind search-select" data-role="kind" data-placeholder="유형">'
			+     '</select>'
			+     '<input type="hidden" data-role="protocol">'
			+     '<button type="button" class="endpoint-remove-btn" data-role="remove" title="이 접속점 삭제" aria-label="이 접속점 삭제">'
			+       '<img src="/static/image/svg/list/free-icon-trash.svg" alt="" class="endpoint-remove-icon" aria-hidden="true">'
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
		var protocol = endpointKindForProtocol(data.kind || data.protocol);
		var kind = protocolForKind(protocol);
		rowEl.querySelector('[data-role="label"]').value = data.label || '';
		fillKindOptions(rowEl.querySelector('[data-role="kind"]'), kind);
		fillProtocolOptions(rowEl.querySelector('[data-role="protocol"]'), kind, kind);
		rowEl.querySelector('[data-role="host"]').value = data.host || '';
		rowEl.querySelector('[data-role="port"]').value = data.port || '';
		rowEl.querySelector('[data-role="url_path"]').value = data.url_path || '';
		var pathWrap = rowEl.querySelector('[data-role="path-wrap"]');
		if (pathWrap) pathWrap.style.display = ENDPOINT_REMOTE_PROTOCOLS[kind] ? 'none' : '';

		rowEl.addEventListener('change', function (e) {
			var role = e.target.getAttribute('data-role');
			if (role === 'kind') {
				fillProtocolOptions(rowEl.querySelector('[data-role="protocol"]'), e.target.value, e.target.value);
				applyKindToRow(rowEl);
			}
			else if (role === 'port' || role === 'host' || role === 'url_path') refreshEndpointPreview(rowEl);
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
		syncSearchSelect(rowEl);
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
				protocol: r.querySelector('[data-role="kind"]').value,
				host: (r.querySelector('[data-role="host"]').value || '').trim(),
				port: (r.querySelector('[data-role="port"]').value || '').trim(),
				url_path: (r.querySelector('[data-role="url_path"]').value || '').trim()
			};
			ep.kind = endpointKindForProtocol(ep.protocol);
			ep.port = ep.port === '' ? null : Number(ep.port);
			if (ENDPOINT_REMOTE_PROTOCOLS[ep.kind]) ep.url_path = '';
			result.push(ep);
		}
		return result;
	}

	function syncFormCategoryDetail() {
		var category = normalizeCategory(qs('form-category').value);
		var row = qs('form-category-detail-row');
		var select = qs('form-category-detail');
		var opRow = qs('form-work-operation-row');
		var opSelect = qs('form-work-operation');
		var isConsole = category === '관리콘솔';
		if (row) row.hidden = !isConsole;
		if (select) {
			select.disabled = !isConsole;
			if (!isConsole) select.value = '';
			else if (!select.value) select.value = '서버';
			syncSearchSelect(select);
		}
		if (opRow) opRow.hidden = isConsole;
		if (opSelect) {
			opSelect.disabled = isConsole;
			if (isConsole) opSelect.value = '';
			syncSearchSelect(opSelect);
		}
		syncResourceNameMode();
		refreshEndpointRowsForCategory();
	}

	function openModal(row) {
		state.editingId = row ? row.id : null;
		qs('status-modal-title').textContent = row ? '자원 수정' : '자원 등록';
		qs('status-form-submit').textContent = row ? '수정' : '등록';
		qs('form-id').value = row ? row.id : '';
		var resourceName = row ? (row.resource_name || '') : '';
		var splitName = splitAgentResourceName(resourceName);
		qs('form-resource-name').value = resourceName;
		qs('form-resource-name-manual').value = resourceName;
		qs('form-business-name').value = splitName.business;
		qs('form-system-name').value = splitName.system;
		qs('form-category').value = row ? rowCategory(row) : normalizeCategory(state.category || '시스템');
		qs('form-category-detail').value = row ? rowCategoryDetail(row) : '';
		qs('form-work-operation').value = row ? rowWorkOperationCode(row) : '';
		syncFormCategoryDetail();
		qs('form-active-flag').value = row && row.active_flag === 0 ? '0' : '1';
		qs('form-tags').value = row ? (row.tags || '') : '';
		qs('form-description').value = row ? (row.description || '') : '';
		qs('status-form-message').textContent = '';
		qs('status-form-delete').hidden = !row;
		var agentPanel = qs('resource-agent-panel');
		if (agentPanel) agentPanel.hidden = true;
		var systemPanel = qs('system-resource-panel');
		if (systemPanel) systemPanel.hidden = true;
		var agentSearch = qs('resource-agent-search-input');
		if (agentSearch) agentSearch.value = '';
		var systemSearch = qs('system-resource-search-input');
		if (systemSearch) systemSearch.value = '';
		state.agentResourceKeyword = '';
		state.agentResourcePage = 1;
		state.systemResourceKeyword = '';
		state.selectedAgent = null;
		if (row && row.agent_id) {
			state.selectedAgent = {
				agent_id: row.agent_id,
				hostname: row.agent_hostname || row.agent_name || row.agent_id,
				ip_address: row.agent_ip || '',
				sync_status: row.agent_status || ''
			};
		}
		renderSelectedAgent();

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
		modal.style.background = 'var(--modal-overlay, rgba(15,23,42,.28))';
		modal.style.backdropFilter = 'blur(var(--modal-blur, 5px))';
		modal.style.webkitBackdropFilter = 'blur(var(--modal-blur, 5px))';
		document.body.classList.add('modal-open');
		setTimeout(function () {
			var btn = qs('form-resource-select-btn');
			if (btn && !btn.hidden) btn.focus();
			else qs('form-resource-name-manual').focus();
		}, 60);
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
		var resourceName = updateResourceNameHidden();
		return {
			resource_name: resourceName,
			category: normalizeCategory(qs('form-category').value),
			category_detail: normalizeCategory(qs('form-category').value) === '관리콘솔' ? normalizeConsoleGroup(qs('form-category-detail').value) : '',
			work_operation_code: normalizeCategory(qs('form-category').value) === '관리콘솔' ? '' : (qs('form-work-operation').value || '').trim(),
			agent_id: normalizeCategory(qs('form-category').value) === '시스템' ? (qs('form-agent-id').value || '').trim() : '',
			active_flag: qs('form-active-flag').value === '1' ? 1 : 0,
			tags: qs('form-tags').value.trim(),
			description: qs('form-description').value.trim(),
			endpoints: collectEndpoints()
		};
	}

	function submitForm() {
		var payload = collectPayload();
		if (!payload.resource_name) {
			qs('status-form-message').textContent = payload.category === '시스템' ? '업무명과 시스템명을 선택하세요.' : '자원명은 필수 항목입니다.';
			return;
		}
		if (payload.category === '관리콘솔' && !payload.category_detail) {
			qs('status-form-message').textContent = '관리콘솔 장비군을 선택하세요.';
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
		qs('delete-subtitle').textContent = '선택된 ' + state.selected.size + '개의 자원을 정말 삭제처리하시겠습니까?';
		var m = qs('system-delete-modal');
		m.classList.add('show');
		m.setAttribute('aria-hidden', 'false');
		m.style.display = 'flex';
		m.style.position = 'fixed';
		m.style.inset = '0';
		m.style.alignItems = 'center';
		m.style.justifyContent = 'center';
		m.style.zIndex = '2000';
		m.style.background = 'var(--modal-overlay, rgba(15,23,42,.28))';
		m.style.backdropFilter = 'blur(var(--modal-blur, 5px))';
		m.style.webkitBackdropFilter = 'blur(var(--modal-blur, 5px))';
		document.body.classList.add('modal-open');
	}
	function closeBulkDeleteModal() {
		var m = qs('system-delete-modal');
		m.classList.remove('show');
		m.setAttribute('aria-hidden', 'true');
		m.style.display = '';
		document.body.classList.remove('modal-open');
	}
	function performBulkDelete() {
		var ids = Array.from(state.selected);
		if (!ids.length) { closeBulkDeleteModal(); return; }
		var btn = qs('system-delete-confirm');
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
		var headers = ['자원명', '분류', '상태', '유형', '접속정보', '프로토콜', '호스트', '포트', '설명'];
		function csvCell(v) {
			if (v === null || v === undefined) return '';
			var s = String(v).replace(/"/g, '""');
			return /[",\r\n]/.test(s) ? '"' + s + '"' : s;
		}
		var lines = [headers.join(',')];
		rows.forEach(function (r) {
			var stateLbl = r.active_flag ? '사용 가능' : '차단';
			var eps = accessEndpoints(r);
			if (!eps.length) {
				lines.push([r.resource_name, categoryDisplay(r), stateLbl, '', '', '', '', '', r.description].map(csvCell).join(','));
				return;
			}
			eps.forEach(function (endpoint) {
				lines.push([
					r.resource_name,
					categoryDisplay(r),
					stateLbl,
					endpointAccessType(endpoint),
					endpointAccessInfo(endpoint),
					endpoint.protocol,
					endpoint.host,
					endpoint.port,
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
		var categoryDetailSelect = qs('status-category-detail-filter');
		var workOperationSelect = qs('status-work-operation-filter');
		function syncCategoryUI(cat) {
			var isDashboard = cat === 'dashboard';
			var isConsole = cat === '관리콘솔';
			Array.prototype.forEach.call(tabs, function (b) {
				var on = (b.getAttribute('data-category') || '') === cat;
				b.classList.toggle('active', on);
				b.setAttribute('aria-selected', on ? 'true' : 'false');
			});
			if (categoryDetailSelect) {
				categoryDetailSelect.hidden = isDashboard || !isConsole;
				categoryDetailSelect.disabled = isDashboard || !isConsole;
				if (isDashboard || !isConsole) {
					state.categoryDetail = '';
					categoryDetailSelect.value = '';
				}
				syncSearchSelect(categoryDetailSelect);
			}
			if (workOperationSelect) {
				workOperationSelect.hidden = isDashboard || isConsole;
				workOperationSelect.disabled = isDashboard || isConsole;
				if (isDashboard || isConsole) {
					state.workOperationCode = '';
					workOperationSelect.value = '';
				}
				syncSearchSelect(workOperationSelect);
			}
		}
		Array.prototype.forEach.call(tabs, function (btn) {
			btn.addEventListener('click', function () {
				var cat = btn.getAttribute('data-category') || '';
				if (cat === 'dashboard') {
					syncStatusView('dashboard');
					syncCategoryUI(cat);
					renderDashboard();
					return;
				}
				syncStatusView('list');
				state.category = cat;
				if (cat !== '관리콘솔') state.categoryDetail = '';
				else state.workOperationCode = '';
				syncCategoryUI(cat);
				applyFilters();
				renderRows();
			});
		});
		if (categoryDetailSelect) {
			categoryDetailSelect.addEventListener('change', function () {
				state.categoryDetail = normalizeConsoleGroup(categoryDetailSelect.value || '');
				applyFilters();
				renderRows();
			});
		}
		if (workOperationSelect) {
			workOperationSelect.addEventListener('change', function () {
				state.workOperationCode = workOperationSelect.value || '';
				applyFilters();
				renderRows();
			});
		}
		Array.prototype.forEach.call(document.querySelectorAll('.access-live-tabs button'), function (btn, index) {
			var ranges = [24, 168, 720];
			btn.addEventListener('click', function () {
				state.liveRange = ranges[index] || 24;
				Array.prototype.forEach.call(document.querySelectorAll('.access-live-tabs button'), function (b) {
					b.classList.toggle('active', b === btn);
				});
				renderLiveMonitor(state.dashboard.auditLogs || []);
			});
		});
		syncStatusView(state.view);
		syncCategoryUI(state.view === 'dashboard' ? 'dashboard' : state.category);
		qs('status-search').addEventListener('input', function () {
			window.clearTimeout(debounceTimer);
			debounceTimer = window.setTimeout(function () { applyFilters(); renderRows(); }, 200);
		});
		qs('status-search-clear').addEventListener('click', function () {
			qs('status-search').value = '';
			applyFilters(); renderRows();
		});
		qs('status-state-filter').addEventListener('change', function () { applyFilters(); renderRows(); });
		qs('form-category').addEventListener('change', syncFormCategoryDetail);
		qs('form-resource-name-manual').addEventListener('input', updateResourceNameHidden);
		qs('form-resource-select-btn').addEventListener('click', toggleSystemResourcePanel);
		qs('system-resource-search-input').addEventListener('input', function (event) {
			state.systemResourceKeyword = (event.target.value || '').trim();
			if (state.systemResourceSearchTimer) window.clearTimeout(state.systemResourceSearchTimer);
			state.systemResourceSearchTimer = window.setTimeout(function () { loadSystemResources(); }, 250);
		});
		qs('system-resource-list').addEventListener('click', function (event) {
			var item = event.target.closest('.resource-picker-item');
			if (!item) return;
			var index = parseInt(item.getAttribute('data-system-resource-index'), 10);
			var row = state.systemResources[index];
			if (!row) return;
			qs('form-business-name').value = systemResourceBusinessName(row);
			qs('form-system-name').value = systemResourceSystemName(row);
			updateResourceNameHidden();
			qs('system-resource-panel').hidden = true;
		});
		var agentMapSelectBtn = qs('agent-map-select-btn');
		if (agentMapSelectBtn) agentMapSelectBtn.addEventListener('click', toggleAgentResourcePanel);
		var agentSearchInput = qs('resource-agent-search-input');
		if (agentSearchInput) {
			agentSearchInput.addEventListener('input', function (event) {
				state.agentResourceKeyword = (event.target.value || '').trim();
				if (state.agentResourceSearchTimer) window.clearTimeout(state.agentResourceSearchTimer);
				state.agentResourceSearchTimer = window.setTimeout(function () { loadAgentResources(1); }, 250);
			});
		}
		var agentPrev = qs('resource-agent-prev');
		if (agentPrev) {
			agentPrev.addEventListener('click', function () {
				if (state.agentResourcePage > 1) loadAgentResources(state.agentResourcePage - 1);
			});
		}
		var agentNext = qs('resource-agent-next');
		if (agentNext) {
			agentNext.addEventListener('click', function () {
				if (state.agentResourcePage < state.agentResourceTotalPages) loadAgentResources(state.agentResourcePage + 1);
			});
		}
		var agentList = qs('resource-agent-list');
		if (agentList) {
			agentList.addEventListener('click', function (event) {
				var item = event.target.closest('.agent-picker-row, .resource-picker-item');
				if (!item) return;
				var index = parseInt(item.getAttribute('data-agent-index'), 10);
				var row = state.agentResources[index];
				if (!row) return;
				state.selectedAgent = row;
				renderSelectedAgent();
				var panel = qs('resource-agent-panel');
				if (panel) panel.hidden = true;
			});
			agentList.addEventListener('keydown', function (event) {
				if (event.key !== 'Enter' && event.key !== ' ') return;
				var item = event.target.closest('.agent-picker-row');
				if (!item) return;
				event.preventDefault();
				item.click();
			});
		}
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
			var proto = currentEndpointProtocols()[0] || 'HTTPS';
			addEndpointRow({ kind: endpointKindForProtocol(proto), protocol: proto });
		});

		var dm = qs('system-delete-modal');
		dm.addEventListener('click', function (event) {
			var target = event.target;
			if (target.closest && target.closest('[data-modal-close="1"]')) { closeBulkDeleteModal(); return; }
			if (target === dm) closeBulkDeleteModal();
		});
		qs('system-delete-confirm').addEventListener('click', performBulkDelete);

		document.addEventListener('keydown', function (event) {
			if (event.key !== 'Escape') return;
			if (getModal().classList.contains('show')) closeModal();
			else if (qs('system-delete-modal').classList.contains('show')) closeBulkDeleteModal();
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
		loadWorkOperations().then(loadRows);
		startDashboardLiveRefresh();
		startLiveAccessRefresh();
		initSearchableFilters();
	});
	// SPA 전환으로 이미 DOMContentLoaded가 끝난 경우 즉시 실행
	if (document.readyState === 'interactive' || document.readyState === 'complete') {
		try { bindEvents(); loadWorkOperations().then(loadRows); startDashboardLiveRefresh(); startLiveAccessRefresh(); initSearchableFilters(); } catch (e) { console.error('[status_list init]', e); }
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

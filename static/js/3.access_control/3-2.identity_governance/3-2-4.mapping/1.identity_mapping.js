(function () {
	'use strict';

	var state = {
		ctx: { admins: [], users: [], admin_users: [], service_accounts: [], integrated_accounts: [], unmapped_sources: [] },
		adGroups: [],
		reviews: [],
		selectedAdminId: null,
		selectedAccountId: null,
		adminPage: 1,
		adminUserPage: 1,
		accountPage: 1,
		adGroupPage: 1,
		reviewPage: 1,
		pageSize: 10
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
	function showMessage(message) { window.alert(String(message || '')); }
	function accountTypeLabel(type) { return type === 'SERVICE' ? '서비스 계정' : '개인 계정'; }
	function badgeType(type) { return '<span class="identity-badge ' + (type === 'SERVICE' ? 'service' : 'personal') + '">' + esc(accountTypeLabel(type)) + '</span>'; }
	function statusPill(status) {
		var cls = status === 'ACTIVE' || status === '완료' || status === '유지' ? 'active' : (status === '제거' || status === 'INACTIVE' ? 'error' : 'pending');
		return '<span class="identity-status-pill ' + cls + '">' + esc(status || '-') + '</span>';
	}
	function systemTag(type) { return '<span class="identity-tag system-' + esc(String(type || '').toLowerCase()) + '">' + esc(type || '-') + '</span>'; }
	function fillSelect(selectEl, rows, labelFn, emptyLabel) {
		if (!selectEl) return;
		selectEl.innerHTML = '';
		if (emptyLabel) {
			var empty = document.createElement('option');
			empty.value = '';
			empty.textContent = emptyLabel;
			selectEl.appendChild(empty);
		}
		(rows || []).forEach(function (row) {
			var opt = document.createElement('option');
			opt.value = row.id;
			opt.textContent = labelFn ? labelFn(row) : String(row.id);
			selectEl.appendChild(opt);
		});
	}
	function maxPage(total) { return Math.max(1, Math.ceil(total / state.pageSize)); }
	function clampPage(pageKey, total) {
		var last = maxPage(total);
		if (state[pageKey] < 1) state[pageKey] = 1;
		if (state[pageKey] > last) state[pageKey] = last;
		return last;
	}
	function pageRows(rows, pageKey) {
		clampPage(pageKey, rows.length);
		return rows.slice((state[pageKey] - 1) * state.pageSize, state[pageKey] * state.pageSize);
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
	function renderPagination(prefix, rows, pageKey) {
		var info = qs(prefix + '-page-info');
		var numbers = qs(prefix + '-page-numbers');
		var prev = qs(prefix + '-prev');
		var next = qs(prefix + '-next');
		if (!info || !numbers || !prev || !next) return;
		var total = rows.length;
		var last = clampPage(pageKey, total);
		var start = total ? ((state[pageKey] - 1) * state.pageSize) + 1 : 0;
		var end = total ? Math.min(total, state[pageKey] * state.pageSize) : 0;
		info.textContent = total ? (start + '-' + end + ' / ' + total + '개') : '0개 항목';
		if (!total) {
			numbers.innerHTML = '';
			prev.disabled = true;
			next.disabled = true;
			return;
		}
		numbers.innerHTML = pageButtons(state[pageKey], last);
		prev.disabled = state[pageKey] <= 1;
		next.disabled = state[pageKey] >= last;
	}
	function loadContext(adminId) {
		var query = adminId ? ('?admin_id=' + encodeURIComponent(adminId)) : '';
		return fetchJson('/api/identity-governance/mapping-context' + query).then(function (data) {
			state.ctx = data;
			state.selectedAdminId = data.selected_admin_id || (data.admins && data.admins[0] ? data.admins[0].id : null);
			if (!state.selectedAccountId && data.service_accounts && data.service_accounts[0]) state.selectedAccountId = data.service_accounts[0].id;
			renderContext();
		});
	}
	function loadAdGroups() {
		return fetchJson('/api/identity-governance/ad-groups').then(function (data) {
			state.adGroups = data.rows || [];
			renderAdGroups();
		});
	}
	function loadReviews() {
		return fetchJson('/api/identity-governance/access-reviews').then(function (data) {
			state.reviews = data.rows || [];
			renderReviews();
		});
	}
	function adminUserIds() {
		var out = {};
		(state.ctx.admin_users || []).forEach(function (user) { out[String(user.id)] = true; });
		return out;
	}
	function visibleAccounts() {
		var users = adminUserIds();
		var accounts = [];
		(state.ctx.integrated_accounts || []).forEach(function (account) {
			if (account.account_type === 'SERVICE' && account.owner_type === 'ADMIN' && String(account.owner_id) === String(state.selectedAdminId)) accounts.push(account);
			else if (account.account_type === 'PERSONAL' && account.owner_type === 'USER' && users[String(account.owner_id)]) accounts.push(account);
		});
		return accounts;
	}
	function selectedAccount() {
		var accounts = visibleAccounts();
		for (var i = 0; i < accounts.length; i++) if (String(accounts[i].id) === String(state.selectedAccountId)) return accounts[i];
		return accounts[0] || null;
	}
	function renderContext() {
		renderAdmins();
		renderAdminUsers();
		renderAccountPane();
		fillSelect(qs('identity-ad-manager'), state.ctx.admins || [], function (row) { return (row.name || '-') + ' · ' + (row.department || '-'); }, '관리자 선택');
		fillSelect(qs('identity-review-admin'), state.ctx.admins || [], function (row) { return (row.name || '-') + ' · ' + (row.department || '-'); }, '전체 관리자');
		if (state.selectedAdminId) qs('identity-review-admin').value = state.selectedAdminId;
		fillSelect(qs('identity-ad-map-account'), state.ctx.integrated_accounts || [], function (row) { return row.account_name + ' · ' + row.account_type; }, '통합계정 선택');
	}
	function renderAdmins() {
		var box = qs('identity-admin-list');
		var rows = state.ctx.admins || [];
		if (qs('identity-admin-count')) qs('identity-admin-count').textContent = String(rows.length);
		box.innerHTML = pageRows(rows, 'adminPage').map(function (admin) {
			return '<button type="button" class="identity-list-item ' + (String(admin.id) === String(state.selectedAdminId) ? 'active' : '') + '" data-admin-id="' + esc(admin.id) + '">' +
				'<span><strong>' + esc(admin.name || '-') + '</strong><span>' + esc(admin.department || '-') + ' · 사용자 ' + esc(admin.user_count || 0) + '</span></span>' +
			'</button>';
		}).join('') || '<div class="identity-empty">관리자가 없습니다.</div>';
		renderPagination('identity-admin', rows, 'adminPage');
	}
	function renderAdminUsers() {
		var box = qs('identity-admin-user-list');
		var mapped = adminUserIds();
		var addable = (state.ctx.users || []).filter(function (user) { return !mapped[String(user.id)]; });
		var rows = state.ctx.admin_users || [];
		if (qs('identity-admin-user-count')) qs('identity-admin-user-count').textContent = String(rows.length);
		fillSelect(qs('identity-user-add-select'), addable, function (row) { return (row.name || '-') + ' · ' + (row.department || '-') + ' · ' + (row.email || '-'); }, '추가할 사용자');
		box.innerHTML = pageRows(rows, 'adminUserPage').map(function (user) {
			return '<div class="identity-list-item">' +
				'<span><strong>' + esc(user.name || '-') + '</strong><span>' + esc(user.department || '-') + ' · ' + esc(user.email || '-') + '</span></span>' +
				'<button type="button" class="identity-action-btn" data-remove-user-id="' + esc(user.id) + '">제거</button>' +
			'</div>';
		}).join('') || '<div class="identity-empty">연결된 사용자가 없습니다.</div>';
		renderPagination('identity-admin-user', rows, 'adminUserPage');
	}
	function renderAccountPane() {
		var box = qs('identity-service-account-list');
		var accounts = visibleAccounts();
		if (qs('identity-service-account-count')) qs('identity-service-account-count').textContent = String(accounts.length);
		var hasSelected = false;
		accounts.forEach(function (account) {
			if (String(account.id) === String(state.selectedAccountId)) hasSelected = true;
		});
		if (accounts.length && !hasSelected) state.selectedAccountId = accounts[0].id;
		var assignable = (state.ctx.integrated_accounts || []).filter(function (account) { return account.account_type === 'SERVICE'; });
		fillSelect(qs('identity-service-assign-select'), assignable, function (row) { return row.account_name + ' · ' + (row.owner_name || '-'); }, '서비스 계정 선택');
		fillSelect(qs('identity-source-connect-select'), state.ctx.unmapped_sources || [], function (row) { return row.system_type + ' · ' + row.system_name + ' · ' + row.account_id; }, '연결할 SourceAccount');
		box.innerHTML = pageRows(accounts, 'accountPage').map(function (account) {
			var sources = (account.source_accounts || []).map(function (source) {
				return '<div class="identity-muted">' + systemTag(source.system_type) + ' ' + esc(source.system_name || '-') + ' · ' + esc(source.account_id || '-') +
					' <button type="button" class="identity-action-btn" data-unmap-source-id="' + esc(source.id) + '">해제</button></div>';
			}).join('') || '<div class="identity-muted">연결된 SourceAccount 없음</div>';
			return '<div class="identity-list-item ' + (String(account.id) === String(state.selectedAccountId) ? 'active' : '') + '" data-account-id="' + esc(account.id) + '" role="button" tabindex="0">' +
				'<span><strong>' + esc(account.account_name || '-') + '</strong><span>' + badgeType(account.account_type) + ' ' + esc(account.owner_name || '-') + '</span>' + sources + '</span>' +
			'</div>';
		}).join('') || '<div class="identity-empty">선택된 관리자의 계정이 없습니다.</div>';
		renderPagination('identity-service-account', accounts, 'accountPage');
	}
	function renderAdGroups() {
		fillSelect(qs('identity-ad-group-map-select'), state.adGroups, function (row) { return (row.domain_name || '-') + ' · ' + row.group_name; }, 'AD 그룹 선택');
		if (qs('identity-ad-group-count')) qs('identity-ad-group-count').textContent = String(state.adGroups.length);
		qs('identity-ad-group-body').innerHTML = pageRows(state.adGroups, 'adGroupPage').map(function (row) {
			return '<tr>' +
				'<td>' + esc(row.domain_name || '-') + '</td>' +
				'<td><strong>' + esc(row.group_name || '-') + '</strong></td>' +
				'<td>' + esc(row.manager_name || '-') + '</td>' +
				'<td>' + esc(row.mapped_account_count || 0) + '</td>' +
				'<td>' + esc(row.sync_state || '-') + '</td>' +
				'<td>' + statusPill(row.status || '-') + '</td>' +
			'</tr>';
		}).join('') || '<tr><td colspan="6" class="identity-empty">AD 그룹이 없습니다.</td></tr>';
		renderPagination('identity-ad-group', state.adGroups, 'adGroupPage');
	}
	function renderReviews() {
		if (qs('identity-review-count')) qs('identity-review-count').textContent = String(state.reviews.length);
		qs('identity-review-body').innerHTML = pageRows(state.reviews, 'reviewPage').map(function (row) {
			var done = row.status === '완료';
			return '<tr>' +
				'<td><strong>' + esc(row.review_name || '-') + '</strong></td>' +
				'<td>' + esc(row.admin_name || '전체') + '</td>' +
				'<td>' + esc(row.item_count || 0) + '</td>' +
				'<td>' + esc(row.due_date || '-') + '</td>' +
				'<td>' + statusPill(row.status || '-') + '</td>' +
				'<td>' + esc(row.result || '-') + '</td>' +
				'<td><div class="identity-mini-actions">' + (done ? '<span class="identity-muted">-</span>' :
					'<button type="button" class="identity-action-btn" data-review-id="' + esc(row.id) + '" data-result="유지">유지</button>' +
					'<button type="button" class="identity-action-btn" data-review-id="' + esc(row.id) + '" data-result="제거">제거</button>' +
					'<button type="button" class="identity-action-btn" data-review-id="' + esc(row.id) + '" data-result="변경">변경</button>') +
				'</div></td>' +
			'</tr>';
		}).join('') || '<tr><td colspan="7" class="identity-empty">권한 검토 내역이 없습니다.</td></tr>';
		renderPagination('identity-review', state.reviews, 'reviewPage');
	}
	function refreshAll() {
		return loadContext(state.selectedAdminId).then(loadAdGroups).then(loadReviews).catch(function (err) { showMessage(err.message); });
	}
	function bindEvents() {
		qs('identity-admin-list').addEventListener('click', function (event) {
			var btn = event.target.closest('[data-admin-id]');
			if (!btn) return;
			state.selectedAdminId = btn.getAttribute('data-admin-id');
			state.selectedAccountId = null;
			state.adminUserPage = 1;
			state.accountPage = 1;
			loadContext(state.selectedAdminId).catch(function (err) { showMessage(err.message); });
		});
		[
			['identity-admin', 'adminPage', renderAdmins],
			['identity-admin-user', 'adminUserPage', renderAdminUsers],
			['identity-service-account', 'accountPage', renderAccountPane],
			['identity-ad-group', 'adGroupPage', renderAdGroups],
			['identity-review', 'reviewPage', renderReviews]
		].forEach(function (config) {
			var prefix = config[0];
			var pageKey = config[1];
			var renderFn = config[2];
			qs(prefix + '-prev').addEventListener('click', function () { state[pageKey] -= 1; renderFn(); });
			qs(prefix + '-next').addEventListener('click', function () { state[pageKey] += 1; renderFn(); });
			qs(prefix + '-page-numbers').addEventListener('click', function (event) {
				var btn = event.target.closest('[data-page]');
				if (!btn) return;
				state[pageKey] = parseInt(btn.getAttribute('data-page'), 10) || 1;
				renderFn();
			});
		});
		qs('identity-admin-user-list').addEventListener('click', function (event) {
			var btn = event.target.closest('[data-remove-user-id]');
			if (!btn) return;
			sendJson('/api/identity-governance/admin-users', 'DELETE', { admin_id: state.selectedAdminId, user_id: btn.getAttribute('data-remove-user-id') }).then(function () {
				return loadContext(state.selectedAdminId);
			}).catch(function (err) { showMessage(err.message); });
		});
		qs('identity-user-add-btn').addEventListener('click', function () {
			var userId = qs('identity-user-add-select').value;
			if (!state.selectedAdminId || !userId) return;
			sendJson('/api/identity-governance/admin-users', 'POST', { admin_id: state.selectedAdminId, user_id: userId }).then(function () {
				return loadContext(state.selectedAdminId);
			}).catch(function (err) { showMessage(err.message); });
		});
		qs('identity-service-assign-btn').addEventListener('click', function () {
			var accountId = qs('identity-service-assign-select').value;
			if (!state.selectedAdminId || !accountId) return;
			sendJson('/api/identity-governance/service-account-admin', 'POST', { admin_id: state.selectedAdminId, integrated_account_id: accountId }).then(function () {
				state.selectedAccountId = accountId;
				return loadContext(state.selectedAdminId);
			}).catch(function (err) { showMessage(err.message); });
		});
		qs('identity-service-account-list').addEventListener('click', function (event) {
			var unmap = event.target.closest('[data-unmap-source-id]');
			if (unmap) {
				event.preventDefault();
				event.stopPropagation();
				fetchJson('/api/identity-governance/mappings/source/' + encodeURIComponent(unmap.getAttribute('data-unmap-source-id')), { method: 'DELETE' }).then(function () {
					return loadContext(state.selectedAdminId);
				}).catch(function (err) { showMessage(err.message); });
				return;
			}
			var btn = event.target.closest('[data-account-id]');
			if (!btn) return;
			state.selectedAccountId = btn.getAttribute('data-account-id');
			renderAccountPane();
		});
		qs('identity-service-account-list').addEventListener('keydown', function (event) {
			if (event.key !== 'Enter' && event.key !== ' ') return;
			var item = event.target.closest('[data-account-id]');
			if (!item) return;
			event.preventDefault();
			state.selectedAccountId = item.getAttribute('data-account-id');
			renderAccountPane();
		});
		qs('identity-source-connect-btn').addEventListener('click', function () {
			var sourceId = qs('identity-source-connect-select').value;
			var account = selectedAccount();
			if (!sourceId || !account) {
				showMessage('연결할 통합계정과 SourceAccount를 선택하세요.');
				return;
			}
			sendJson('/api/identity-governance/mappings', 'POST', { integrated_account_id: account.id, source_account_id: sourceId }).then(function () {
				return loadContext(state.selectedAdminId);
			}).catch(function (err) { showMessage(err.message); });
		});
		qs('identity-ad-sync-btn').addEventListener('click', function () {
			sendJson('/api/identity-governance/ad-groups/sync', 'POST', {}).then(function () { return loadAdGroups(); }).catch(function (err) { showMessage(err.message); });
		});
		qs('identity-ad-group-form').addEventListener('submit', function (event) {
			event.preventDefault();
			var form = event.target;
			sendJson('/api/identity-governance/ad-groups', 'POST', {
				group_name: form.group_name.value,
				domain_name: form.domain_name.value,
				manager_admin_id: form.manager_admin_id.value
			}).then(function () {
				form.reset();
				return loadAdGroups();
			}).catch(function (err) { showMessage(err.message); });
		});
		qs('identity-ad-map-btn').addEventListener('click', function () {
			var groupId = qs('identity-ad-group-map-select').value;
			var accountId = qs('identity-ad-map-account').value;
			if (!groupId || !accountId) return;
			sendJson('/api/identity-governance/ad-groups/map', 'POST', { group_id: groupId, integrated_account_id: accountId, permission_level: qs('identity-ad-permission').value }).then(function () {
				return loadAdGroups();
			}).catch(function (err) { showMessage(err.message); });
		});
		qs('identity-review-create-btn').addEventListener('click', function () {
			sendJson('/api/identity-governance/access-reviews', 'POST', {
				review_name: qs('identity-review-name').value,
				admin_id: qs('identity-review-admin').value
			}).then(function () {
				qs('identity-review-name').value = '';
				return loadReviews();
			}).catch(function (err) { showMessage(err.message); });
		});
		qs('identity-review-body').addEventListener('click', function (event) {
			var btn = event.target.closest('[data-review-id]');
			if (!btn) return;
			sendJson('/api/identity-governance/access-reviews/' + encodeURIComponent(btn.getAttribute('data-review-id')) + '/result', 'POST', { result: btn.getAttribute('data-result') }).then(function () {
				return loadReviews();
			}).catch(function (err) { showMessage(err.message); });
		});
	}
	function init() {
		if (!qs('identity-admin-list')) return;
		bindEvents();
		refreshAll();
	}
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
	else init();
})();
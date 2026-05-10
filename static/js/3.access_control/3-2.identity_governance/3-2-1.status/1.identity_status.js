(function () {
	'use strict';

	var state = {
		bootstrap: { admins: [], users: [], system_types: [] },
		accounts: [],
		unmapped: [],
		accountPage: 1,
		unmappedPage: 1,
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
				if (!res.ok || data.success === false) {
					throw new Error((data && (data.message || data.error)) || ('HTTP ' + res.status));
				}
				return data;
			});
		});
	}
	function sendJson(url, method, payload) {
		return fetchJson(url, {
			method: method,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload || {})
		});
	}
	function showMessage(message) { window.alert(String(message || '')); }
	function accountTypeLabel(type) { return type === 'SERVICE' ? '서비스 계정' : '개인 계정'; }
	function badgeType(type) {
		var cls = type === 'SERVICE' ? 'service' : 'personal';
		return '<span class="identity-badge ' + cls + '">' + esc(accountTypeLabel(type)) + '</span>';
	}
	function statusPill(status) {
		var raw = String(status || '').toUpperCase();
		var cls = raw === 'ACTIVE' ? 'active' : (raw === 'INACTIVE' ? 'error' : 'pending');
		return '<span class="identity-status-pill ' + cls + '">' + esc(status || '-') + '</span>';
	}
	function systemTag(type) {
		var raw = String(type || '').toUpperCase();
		var cls = raw === 'SERVER' ? 'system-server' : (raw === 'AD' ? 'system-ad' : (raw === 'WEB' ? 'system-web' : (raw === 'VPN' ? 'system-vpn' : '')));
		return '<span class="identity-tag ' + cls + '">' + esc(type || '-') + '</span>';
	}
	function collectionTag(value) {
		return '<span class="identity-tag">' + esc(value || '-') + '</span>';
	}
	function formatDate(value) {
		return value ? String(value).replace('T', ' ').slice(0, 19) : '-';
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
	function fillSystemSelect(selectEl) {
		if (!selectEl) return;
		var current = selectEl.value || '';
		var first = selectEl.querySelector('option[value=""]');
		selectEl.innerHTML = '';
		if (first) selectEl.appendChild(first.cloneNode(true));
		else {
			var all = document.createElement('option');
			all.value = '';
			all.textContent = '시스템 전체';
			selectEl.appendChild(all);
		}
		(state.bootstrap.system_types || []).forEach(function (type) {
			var opt = document.createElement('option');
			opt.value = type;
			opt.textContent = type;
			selectEl.appendChild(opt);
		});
		selectEl.value = current;
	}
	function loadBootstrap() {
		return fetchJson('/api/identity-governance/bootstrap').then(function (data) {
			state.bootstrap = data;
			fillSystemSelect(qs('identity-system-filter'));
			fillSystemSelect(qs('identity-unmapped-system-filter'));
			fillSystemSelect(qs('source-system-type'));
			if (qs('source-system-type')) qs('source-system-type').value = 'WEB';
		});
	}
	function buildAccountQuery() {
		var params = new URLSearchParams();
		[['keyword', qs('identity-search').value], ['account_type', qs('identity-type-filter').value], ['system_type', qs('identity-system-filter').value], ['status', qs('identity-status-filter').value]].forEach(function (pair) {
			var value = String(pair[1] || '').trim();
			if (value) params.set(pair[0], value);
		});
		return params.toString();
	}
	function loadAccounts() {
		var query = buildAccountQuery();
		return fetchJson('/api/identity-governance/integrated-accounts' + (query ? '?' + query : '')).then(function (data) {
			state.accounts = data.rows || [];
			renderAccounts();
		});
	}
	function loadUnmapped() {
		var params = new URLSearchParams();
		params.set('unmapped', '1');
		var system = qs('identity-unmapped-system-filter').value;
		if (system) params.set('system_type', system);
		return fetchJson('/api/identity-governance/source-accounts?' + params.toString()).then(function (data) {
			state.unmapped = data.rows || [];
			renderUnmapped();
		});
	}
	function renderKpis() {
		var personal = 0;
		var service = 0;
		state.accounts.forEach(function (row) {
			if (row.account_type === 'SERVICE') service += 1;
			else personal += 1;
		});
		qs('identity-kpi-total').textContent = String(state.accounts.length);
		qs('identity-kpi-personal').textContent = String(personal);
		qs('identity-kpi-service').textContent = String(service);
		qs('identity-kpi-unmapped').textContent = String(state.unmapped.length);
	}
	function renderAccounts() {
		var body = qs('identity-account-body');
		var empty = qs('identity-account-empty');
		qs('identity-account-count').textContent = String(state.accounts.length);
		body.innerHTML = '';
		if (!state.accounts.length) {
			empty.hidden = false;
			renderKpis();
			renderPagination('identity-account', state.accounts, 'accountPage');
			return;
		}
		empty.hidden = true;
		body.innerHTML = pageRows(state.accounts, 'accountPage').map(function (row) {
			var systems = (row.system_types || []).map(systemTag).join('') || '<span class="identity-muted">-</span>';
			return '<tr data-id="' + esc(row.id) + '">' +
				'<td><strong>' + esc(row.account_name || '-') + '</strong><div class="identity-muted">' + systems + '</div></td>' +
				'<td>' + badgeType(row.account_type) + '</td>' +
				'<td><strong>' + esc(row.owner_name || '-') + '</strong><div class="identity-muted">' + esc(row.owner_type || '-') + ' · ' + esc(row.department || '-') + '</div></td>' +
				'<td>' + esc(row.source_count || 0) + '</td>' +
				'<td>' + esc(row.privilege_summary || '-') + '</td>' +
				'<td>' + statusPill(row.status) + '</td>' +
				'<td>' + (row.ad_sync_state ? statusPill('ACTIVE') : '<span class="identity-muted">-</span>') + '</td>' +
				'<td><button type="button" class="identity-action-btn" data-action="detail" data-id="' + esc(row.id) + '">상세</button></td>' +
			'</tr>';
		}).join('');
		renderKpis();
		renderPagination('identity-account', state.accounts, 'accountPage');
	}
	function renderUnmapped() {
		var body = qs('identity-unmapped-body');
		var empty = qs('identity-unmapped-empty');
		qs('identity-unmapped-count').textContent = String(state.unmapped.length);
		body.innerHTML = '';
		if (!state.unmapped.length) {
			empty.hidden = false;
			renderKpis();
			renderPagination('identity-unmapped', state.unmapped, 'unmappedPage');
			return;
		}
		empty.hidden = true;
		body.innerHTML = pageRows(state.unmapped, 'unmappedPage').map(function (row) {
			return '<tr data-source-id="' + esc(row.id) + '">' +
				'<td>' + systemTag(row.system_type) + '</td>' +
				'<td><strong>' + esc(row.system_name || '-') + '</strong></td>' +
				'<td>' + esc(row.account_id || '-') + '</td>' +
				'<td>' + esc(row.access_info || '-') + '</td>' +
				'<td>' + esc(row.privilege || '-') + '</td>' +
				'<td>' + collectionTag(row.collection_type) + '</td>' +
				'<td><div class="identity-mini-actions">' +
					'<button type="button" class="identity-action-btn" data-action="match" data-id="' + esc(row.id) + '">제안</button>' +
					'<button type="button" class="identity-action-btn" data-action="create-integrated" data-id="' + esc(row.id) + '">신규</button>' +
				'</div></td>' +
			'</tr>';
		}).join('');
		renderKpis();
		renderPagination('identity-unmapped', state.unmapped, 'unmappedPage');
	}
	function accountById(id) {
		for (var i = 0; i < state.accounts.length; i++) if (String(state.accounts[i].id) === String(id)) return state.accounts[i];
		return null;
	}
	function sourceById(id) {
		for (var i = 0; i < state.unmapped.length; i++) if (String(state.unmapped[i].id) === String(id)) return state.unmapped[i];
		return null;
	}
	function openModal(id) {
		var modal = qs(id);
		if (!modal) return;
		modal.classList.add('show');
		modal.setAttribute('aria-hidden', 'false');
		document.body.classList.add('modal-open');
	}
	function closeModal(id) {
		var modal = qs(id);
		if (!modal) return;
		modal.classList.remove('show');
		modal.setAttribute('aria-hidden', 'true');
		if (!document.querySelector('.identity-modal.show')) document.body.classList.remove('modal-open');
	}
	function openDetail(id) {
		var row = accountById(id);
		if (!row) return;
		qs('identity-detail-title').textContent = row.account_name || '통합계정 상세';
		qs('identity-detail-summary').innerHTML = [
			['계정유형', row.account_type],
			['소유자', (row.owner_name || '-') + ' / ' + (row.owner_type || '-')],
			['부서', row.department || '-'],
			['상태', row.status || '-'],
			['연결 시스템 수', row.source_count || 0],
			['권한 요약', row.privilege_summary || '-']
		].map(function (pair) { return '<div><span>' + esc(pair[0]) + '</span><strong>' + esc(pair[1]) + '</strong></div>'; }).join('');
		qs('identity-detail-source-body').innerHTML = (row.source_accounts || []).map(function (source) {
			return '<tr>' +
				'<td>' + systemTag(source.system_type) + '</td>' +
				'<td><strong>' + esc(source.system_name || '-') + '</strong></td>' +
				'<td>' + esc(source.account_id || '-') + '</td>' +
				'<td>' + esc(source.access_info || '-') + '</td>' +
				'<td>' + esc(source.privilege || '-') + '</td>' +
				'<td>' + collectionTag(source.collection_type) + '</td>' +
				'<td>' + statusPill(source.status) + '</td>' +
			'</tr>';
		}).join('') || '<tr><td colspan="7" class="identity-empty">연결된 SourceAccount가 없습니다.</td></tr>';
		openModal('identity-detail-modal');
	}
	function loadAll() {
		return loadAccounts().then(loadUnmapped).catch(function (err) { showMessage(err.message); });
	}
	function suggestMatch(id) {
		fetchJson('/api/identity-governance/source-accounts/' + encodeURIComponent(id) + '/match').then(function (data) {
			var suggestions = (data.item && data.item.suggestions) || [];
			if (!suggestions.length) {
				showMessage('자동 매칭 제안이 없습니다.');
				return;
			}
			showMessage(suggestions.map(function (item) {
				return item.owner_type + ' · ' + item.name + ' · ' + item.email + ' · 점수 ' + item.score;
			}).join('\n'));
		}).catch(function (err) { showMessage(err.message); });
	}
	function inferAccountType(source) {
		var accountId = String((source && source.account_id) || '').toLowerCase();
		return (/root|admin|svc|service|daemon/.test(accountId)) ? 'SERVICE' : 'PERSONAL';
	}
	function createIntegratedFromSource(id) {
		var source = sourceById(id);
		if (!source) return;
		var accountType = inferAccountType(source);
		var ownerList = accountType === 'SERVICE' ? state.bootstrap.admins : state.bootstrap.users;
		if (!ownerList || !ownerList.length) {
			showMessage(accountType === 'SERVICE' ? '등록된 ADMIN이 없습니다.' : '등록된 USER가 없습니다.');
			return;
		}
		var name = window.prompt('통합계정명', source.account_id || '');
		if (!name) return;
		sendJson('/api/identity-governance/integrated-accounts', 'POST', {
			account_name: name,
			account_type: accountType,
			owner_type: accountType === 'SERVICE' ? 'ADMIN' : 'USER',
			owner_id: ownerList[0].id,
			source_account_ids: [source.id]
		}).then(function () {
			return loadAll();
		}).catch(function (err) { showMessage(err.message); });
	}
	function submitSourceForm(event) {
		event.preventDefault();
		var form = event.target;
		var payload = {
			system_type: form.system_type.value,
			system_name: form.system_name.value,
			account_id: form.account_id.value,
			privilege: form.privilege.value,
			access_info: form.access_info.value,
			collection_type: 'MANUAL'
		};
		sendJson('/api/identity-governance/source-accounts', 'POST', payload).then(function () {
			form.reset();
			if (qs('source-system-type')) qs('source-system-type').value = 'WEB';
			closeModal('identity-source-modal');
			return loadUnmapped();
		}).catch(function (err) { showMessage(err.message); });
	}
	function bindEvents() {
		['identity-search', 'identity-type-filter', 'identity-system-filter', 'identity-status-filter'].forEach(function (id) {
			var el = qs(id);
			if (!el) return;
			el.addEventListener(id === 'identity-search' ? 'input' : 'change', function () { state.accountPage = 1; loadAccounts().catch(function (err) { showMessage(err.message); }); });
		});
		qs('identity-unmapped-system-filter').addEventListener('change', function () { state.unmappedPage = 1; loadUnmapped().catch(function (err) { showMessage(err.message); }); });
		qs('identity-reset-btn').addEventListener('click', function () {
			qs('identity-search').value = '';
			qs('identity-type-filter').value = '';
			qs('identity-system-filter').value = '';
			qs('identity-status-filter').value = '';
			state.accountPage = 1;
			loadAccounts().catch(function (err) { showMessage(err.message); });
		});
		[['identity-account', 'accountPage', renderAccounts], ['identity-unmapped', 'unmappedPage', renderUnmapped]].forEach(function (config) {
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
		qs('identity-sync-btn').addEventListener('click', function () {
			sendJson('/api/identity-governance/source-accounts/sync', 'POST', {}).then(function (data) {
				showMessage('동기화 완료: ' + JSON.stringify(data.item || {}));
				return loadAll();
			}).catch(function (err) { showMessage(err.message); });
		});
		qs('identity-source-add-btn').addEventListener('click', function () { openModal('identity-source-modal'); });
		qs('identity-account-body').addEventListener('click', function (event) {
			var btn = event.target.closest('[data-action="detail"]');
			if (btn) openDetail(btn.getAttribute('data-id'));
		});
		qs('identity-unmapped-body').addEventListener('click', function (event) {
			var btn = event.target.closest('[data-action]');
			if (!btn) return;
			var action = btn.getAttribute('data-action');
			var id = btn.getAttribute('data-id');
			if (action === 'match') suggestMatch(id);
			else if (action === 'create-integrated') createIntegratedFromSource(id);
		});
		document.addEventListener('click', function (event) {
			var closeBtn = event.target.closest('[data-identity-close]');
			if (closeBtn) closeModal(closeBtn.getAttribute('data-identity-close'));
		});
		qs('identity-source-form').addEventListener('submit', submitSourceForm);
	}
	function init() {
		if (!qs('identity-account-body')) return;
		bindEvents();
		loadBootstrap().then(loadAll).catch(function (err) { showMessage(err.message); });
	}
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
	else init();
})();
(function () {
	'use strict';

	var rows = [];
	var page = 1;
	var pageSize = 10;
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
	function fetchJson(url) {
		return fetch(url, { credentials: 'same-origin', cache: 'no-store', headers: Object.assign({ 'Accept': 'application/json' }, csrfHeader()) }).then(function (res) {
			return res.json().catch(function () { return {}; }).then(function (data) {
				if (!res.ok || data.success === false) throw new Error((data && (data.message || data.error)) || ('HTTP ' + res.status));
				return data;
			});
		});
	}
	function showMessage(message) { window.alert(String(message || '')); }
	function statusForAction(action) {
		if (action === '생성' || action === 'AD동기화') return 'active';
		if (action === '삭제') return 'error';
		return 'pending';
	}
	function maxPage() { return Math.max(1, Math.ceil(rows.length / pageSize)); }
	function clampPage() {
		var last = maxPage();
		if (page < 1) page = 1;
		if (page > last) page = last;
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
		var info = qs('identity-audit-page-info');
		var numbers = qs('identity-audit-page-numbers');
		var prev = qs('identity-audit-prev');
		var next = qs('identity-audit-next');
		if (!info || !numbers || !prev || !next) return;
		var total = rows.length;
		var last = clampPage();
		var start = total ? ((page - 1) * pageSize) + 1 : 0;
		var end = total ? Math.min(total, page * pageSize) : 0;
		info.textContent = total ? (start + '-' + end + ' / ' + total + '개') : '0개 항목';
		if (!total) {
			numbers.innerHTML = '';
			prev.disabled = true;
			next.disabled = true;
			return;
		}
		numbers.innerHTML = pageButtons(page, last);
		prev.disabled = page <= 1;
		next.disabled = page >= last;
	}
	function buildQuery() {
		var params = new URLSearchParams();
		var keyword = String(qs('identity-audit-search').value || '').trim();
		var action = String(qs('identity-audit-action').value || '').trim();
		if (keyword) params.set('keyword', keyword);
		if (action) params.set('action_type', action);
		return params.toString();
	}
	function loadRows() {
		var query = buildQuery();
		return fetchJson('/api/identity-governance/audit-logs' + (query ? '?' + query : '')).then(function (data) {
			rows = data.rows || [];
			renderRows();
		});
	}
	function renderRows() {
		var body = qs('identity-audit-body');
		var empty = qs('identity-audit-empty');
		qs('identity-audit-count').textContent = String(rows.length);
		clampPage();
		body.innerHTML = '';
		if (!rows.length) {
			empty.hidden = false;
			renderPagination();
			return;
		}
		empty.hidden = true;
		body.innerHTML = rows.slice((page - 1) * pageSize, page * pageSize).map(function (row) {
			return '<tr>' +
				'<td><span class="identity-status-pill ' + statusForAction(row.action_type) + '">' + esc(row.action_type || '-') + '</span></td>' +
				'<td><strong>' + esc(row.target_account || '-') + '</strong></td>' +
				'<td>' + esc(row.actor || '-') + '</td>' +
				'<td>' + esc(row.change_summary || '-') + '</td>' +
				'<td>' + esc(String(row.created_at || '').replace('T', ' ').slice(0, 19) || '-') + '</td>' +
			'</tr>';
		}).join('');
		renderPagination();
	}
	function bindEvents() {
		qs('identity-audit-refresh').addEventListener('click', function () { loadRows().catch(function (err) { showMessage(err.message); }); });
		qs('identity-audit-search').addEventListener('input', function () { page = 1; loadRows().catch(function (err) { showMessage(err.message); }); });
		qs('identity-audit-action').addEventListener('change', function () { page = 1; loadRows().catch(function (err) { showMessage(err.message); }); });
		qs('identity-audit-prev').addEventListener('click', function () { page -= 1; renderRows(); });
		qs('identity-audit-next').addEventListener('click', function () { page += 1; renderRows(); });
		qs('identity-audit-page-numbers').addEventListener('click', function (event) {
			var btn = event.target.closest('[data-page]');
			if (!btn) return;
			page = parseInt(btn.getAttribute('data-page'), 10) || 1;
			renderRows();
		});
	}
	function init() {
		if (!qs('identity-audit-body')) return;
		bindEvents();
		loadRows().catch(function (err) { showMessage(err.message); });
	}
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
	else init();
})();
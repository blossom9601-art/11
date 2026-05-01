(function () {
	'use strict';

	var state = {
		rows: [],
		total: 0,
		scope: 'access',
		page: 1,
		pageSize: 20
	};
	var PAGE_SIZE_LIMIT = 200;
	var searchTimer = null;

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
					throw new Error((data && (data.message || data.error)) || '감사 기록을 불러오지 못했습니다.');
				}
				return data;
			});
		});
	}
	function formatDateTime(value) {
		if (!value) return '-';
		return String(value).replace('T', ' ').slice(0, 19);
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
		return value === '성공' ? 'audit-result-success' : 'audit-result-fail';
	}
	function scopeTitle(scope) {
		return scope === 'fail' ? '실패 감사' : '접속 감사';
	}
	function normalizeKind(row) {
		var kind = String((row && (row.endpoint_kind || row.primary_kind || row.resource_kind)) || '').trim().toUpperCase();
		var type = String((row && row.resource_type) || '').trim().toUpperCase();
		var url = String((row && row.resource_url) || '').trim().toLowerCase();
		if (kind === 'WEB' || kind === 'SSH') return kind;
		if (type === 'SSH' || type === '서버' || type === 'DB' || url.indexOf('ssh://') === 0) return 'SSH';
		if (row && (row.resource_name || row.resource_url || row.target_resource_id)) return 'WEB';
		return '';
	}
	function kindCell(row) {
		var kind = normalizeKind(row);
		if (!kind) return '<span class="audit-kind-badge audit-kind-empty">-</span>';
		return '<span class="audit-kind-badge audit-kind-' + esc(kind) + '">' + esc(kind) + '</span>';
	}
	function avatarInitial(name, empNo) {
		var source = String(name || empNo || '?').trim();
		return source ? source.charAt(0).toUpperCase() : '?';
	}
	function actorCell(row) {
		var name = row.actor_display_name || row.actor_name || row.actor_emp_no || '-';
		var empNo = row.actor_display_emp_no || row.actor_emp_no || '-';
		var department = row.actor_department || '부서 미지정';
		var image = row.actor_profile_image || '';
		var avatar = image ? '<img src="' + esc(image) + '" alt="">' : '<span>' + esc(avatarInitial(name, empNo)) + '</span>';
		return '<div class="audit-user-cell">' +
			'<span class="audit-user-avatar">' + avatar + '</span>' +
			'<span class="audit-user-info">' +
				'<strong>' + esc(name) + '</strong>' +
				'<span class="audit-user-emp">' + esc(empNo) + '</span>' +
				'<span class="audit-user-dept">' + esc(department) + '</span>' +
			'</span>' +
		'</div>';
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
		if (!size || size < 1) return 20;
		return Math.min(size, PAGE_SIZE_LIMIT);
	}
	function buildQuery() {
		var params = new URLSearchParams();
		[
			['audit_scope', state.scope],
			['keyword', qs('audit-keyword-filter').value],
			['from_date', qs('audit-from-date').value],
			['to_date', qs('audit-to-date').value]
		].forEach(function (pair) {
			var value = String(pair[1] || '').trim();
			if (value) params.set(pair[0], value);
		});
		params.set('page', String(state.page));
		params.set('page_size', String(state.pageSize));
		return params.toString();
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
		if (titleEl) titleEl.textContent = scopeTitle(state.scope);
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
		if (!state.total) qs('audit-page-info').textContent = '0개 항목';
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
				'<td class="audit-col-time">' + esc(formatDateTime(row.occurred_at)) + '</td>' +
				'<td class="audit-col-kind">' + kindCell(row) + '</td>' +
				'<td class="audit-col-action"><span class="audit-dot-label ' + actionClass(row.action_type) + '">' + esc(row.action_type || '-') + '</span></td>' +
				'<td class="audit-col-result"><span class="audit-dot-label ' + resultClass(row.action_result) + '">' + esc(row.action_result || '-') + '</span></td>' +
				'<td class="audit-col-actor">' + actorCell(row) + '</td>' +
				'<td class="audit-col-resource"><strong>' + esc(resource) + '</strong><span class="ac-meta">' + esc(row.resource_url || '-') + '</span></td>' +
				'<td class="audit-col-ip">' + esc(row.ip_address || '-') + '</td>' +
				'<td class="audit-col-note">' + esc(row.note || '-') + '</td>' +
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
			state.rows = data.rows || [];
			state.total = data.total || 0;
			state.page = data.page || state.page;
			state.pageSize = safePageSize(data.page_size || state.pageSize);
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
	function syncDateConstraints() {
		var start = qs('audit-from-date');
		var end = qs('audit-to-date');
		if (start && start._flatpickr) start._flatpickr.set('maxDate', (end && end.value) || null);
		if (end && end._flatpickr) end._flatpickr.set('minDate', (start && start.value) || null);
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
	}
	function resetFilters() {
		qs('audit-keyword-filter').value = '';
		setSearchClearVisible();
		clearDateField(qs('audit-from-date'));
		clearDateField(qs('audit-to-date'));
		loadRows(true);
	}
	function bindEvents() {
		var pageSize = qs('audit-page-size');
		var selectAll = qs('audit-select-all');
		var keyword = qs('audit-keyword-filter');
		var clear = qs('audit-search-clear');
		qs('audit-reset-btn').addEventListener('click', resetFilters);
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
		Array.prototype.forEach.call(document.querySelectorAll('.audit-tabs [data-audit-scope]'), function (button) {
			button.addEventListener('click', function () {
				var nextScope = button.getAttribute('data-audit-scope') || 'access';
				if (nextScope === state.scope) return;
				state.scope = nextScope;
				Array.prototype.forEach.call(document.querySelectorAll('.audit-tabs [data-audit-scope]'), function (tab) {
					var active = tab.getAttribute('data-audit-scope') === state.scope;
					tab.classList.toggle('active', active);
					tab.setAttribute('aria-selected', active ? 'true' : 'false');
				});
				loadRows(true);
			});
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
		qs('audit-table-body').addEventListener('change', function (event) {
			if (event.target && event.target.classList.contains('audit-row-check')) syncSelectAll();
		});
	}
	document.addEventListener('DOMContentLoaded', function () {
		initAuditDatePickers();
		bindEvents();
		loadRows(true);
	});
})();
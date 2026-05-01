(function () {
	'use strict';

	var state = {
		rows: [],
		total: 0,
		summary: {},
		page: 1,
		pageSize: 20
	};
	var PAGE_SIZE_LIMIT = 200;

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
		if (value === '승인') return 'audit-action-approve';
		if (value === '반려') return 'audit-action-reject';
		return '';
	}
	function resultClass(value) {
		return value === '성공' ? 'audit-result-success' : 'audit-result-fail';
	}
	function safePageSize(value) {
		var size = parseInt(value, 10);
		if (!size || size < 1) return 20;
		return Math.min(size, PAGE_SIZE_LIMIT);
	}
	function buildQuery() {
		var params = new URLSearchParams();
		[
			['actor_name', qs('audit-actor-filter').value],
			['resource_name', qs('audit-resource-filter').value],
			['action_type', qs('audit-action-filter').value],
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
	function setSummary() {
		var summary = state.summary || {};
		qs('audit-total-count').textContent = summary.total || state.total || 0;
		qs('audit-access-count').textContent = summary.access_count || 0;
		qs('audit-decision-count').textContent = summary.decision_count || 0;
		qs('audit-fail-count').textContent = summary.fail_count || 0;
		qs('audit-visible-count').textContent = (state.total || 0) + '건';
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
		setSummary();
		if (!state.rows.length) {
			body.innerHTML = '';
			tableWrap.hidden = true;
			empty.hidden = false;
			empty.textContent = '조회된 감사 기록이 없습니다.';
			renderPagination();
			return;
		}
		tableWrap.hidden = false;
		empty.hidden = true;
		body.innerHTML = pageRows().map(function (row) {
			var actor = row.actor_name || row.actor_emp_no || '-';
			var resource = row.resource_name || (row.target_resource_id ? ('자원 #' + row.target_resource_id) : '-');
			return '<tr>' +
				'<td class="audit-col-time">' + esc(formatDateTime(row.occurred_at)) + '</td>' +
				'<td class="audit-col-action"><span class="audit-action-pill ' + actionClass(row.action_type) + '">' + esc(row.action_type || '-') + '</span></td>' +
				'<td class="audit-col-result"><span class="audit-result-pill ' + resultClass(row.action_result) + '">' + esc(row.action_result || '-') + '</span></td>' +
				'<td class="audit-col-actor"><strong>' + esc(actor) + '</strong><span class="ac-meta">' + esc(row.actor_emp_no || '-') + '</span></td>' +
				'<td class="audit-col-resource"><strong>' + esc(resource) + '</strong><span class="ac-meta">' + esc(row.resource_url || '-') + '</span></td>' +
				'<td class="audit-col-ip">' + esc(row.ip_address || '-') + '</td>' +
				'<td class="audit-col-note">' + esc(row.note || '-') + '</td>' +
			'</tr>';
		}).join('');
		renderPagination();
	}
	function setLoading(message) {
		qs('audit-table-body').innerHTML = '';
		qs('audit-table-wrap').hidden = true;
		qs('audit-empty').hidden = false;
		qs('audit-empty').textContent = message;
	}
	function loadRows(resetPage) {
		if (resetPage) state.page = 1;
		var query = buildQuery();
		setLoading('감사 기록을 불러오는 중입니다.');
		return fetchJson('/api/access-control/audit-logs' + (query ? '?' + query : '')).then(function (data) {
			state.rows = data.rows || [];
			state.total = data.total || 0;
			state.summary = data.summary || {};
			state.page = data.page || state.page;
			state.pageSize = safePageSize(data.page_size || state.pageSize);
			if (qs('audit-page-size')) qs('audit-page-size').value = String(state.pageSize);
			renderRows();
		}).catch(function (err) {
			state.rows = [];
			state.total = 0;
			state.summary = {};
			setSummary();
			qs('audit-empty').textContent = err.message || '감사 기록을 불러오지 못했습니다.';
			renderPagination();
		});
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
			onChange: syncDateConstraints
		};
		window.flatpickr(start, opts);
		window.flatpickr(end, opts);
	}
	function resetFilters() {
		qs('audit-actor-filter').value = '';
		qs('audit-resource-filter').value = '';
		qs('audit-action-filter').value = '';
		clearDateField(qs('audit-from-date'));
		clearDateField(qs('audit-to-date'));
		loadRows(true);
	}
	function bindEvents() {
		var pageSize = qs('audit-page-size');
		qs('audit-filter-form').addEventListener('submit', function (event) {
			event.preventDefault();
			loadRows(true);
		});
		qs('audit-reset-btn').addEventListener('click', resetFilters);
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
	}
	document.addEventListener('DOMContentLoaded', function () {
		initAuditDatePickers();
		bindEvents();
		loadRows(true);
	});
})();
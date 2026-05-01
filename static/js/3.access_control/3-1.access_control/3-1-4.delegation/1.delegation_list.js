(function () {
    'use strict';

    var state = {
        rows: [],
        delegate: null,
        searchResults: [],
        searchTimer: null
    };

    function qs(id) { return document.getElementById(id); }
    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function fetchJson(url, options) {
        return fetch(url, Object.assign({ credentials: 'same-origin', cache: 'no-store' }, options || {})).then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (data) {
                if (!res.ok || data.success === false) {
                    throw new Error(data.message || data.error || '요청 처리 중 오류가 발생했습니다.');
                }
                return data;
            });
        });
    }
    function postJson(url, payload) {
        return fetchJson(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            body: JSON.stringify(payload || {})
        });
    }
    function todayString() {
        var d = new Date();
        var m = String(d.getMonth() + 1); if (m.length < 2) m = '0' + m;
        var day = String(d.getDate()); if (day.length < 2) day = '0' + day;
        return d.getFullYear() + '-' + m + '-' + day;
    }
    function setDateField(input, value) {
        if (!input) return;
        input.value = value || '';
        if (input._flatpickr) input._flatpickr.setDate(input.value, false, 'Y-m-d');
        syncDateConstraints();
    }
    function syncDateConstraints() {
        var start = qs('delegation-start-date');
        var end = qs('delegation-end-date');
        if (start && start._flatpickr) start._flatpickr.set('maxDate', (end && end.value) || null);
        if (end && end._flatpickr) end._flatpickr.set('minDate', (start && start.value) || null);
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
    function initDelegationDatePickers() {
        var start = qs('delegation-start-date');
        var end = qs('delegation-end-date');
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
        setDateField(start, start.value || '');
        setDateField(end, end.value || '');
    }
    function statusBadge(row) {
        var today = todayString();
        var active = row.status === '활성' && row.start_date <= today && row.end_date >= today;
        var text = active ? '활성' : (row.status || '비활성');
        var cls = active ? 'delegation-status-active' : 'delegation-status-inactive';
        return '<span class="status-badge ' + cls + '">' + esc(text) + '</span>';
    }
    function setMessage(text, kind) {
        var el = qs('delegation-form-message');
        el.textContent = text || '';
        el.classList.toggle('is-error', kind === 'error');
        el.classList.toggle('is-success', kind === 'success');
    }
    function setTableState(text) {
        qs('delegation-table-state').textContent = text;
        qs('delegation-table-state').hidden = false;
        qs('delegation-table').hidden = true;
    }
    function renderCurrent() {
        var today = todayString();
        var active = state.rows.filter(function (row) {
            return row.status === '활성' && row.start_date <= today && row.end_date >= today;
        })[0];
        var box = qs('delegation-current');
        if (!active) {
            box.textContent = '현재 활성 대무자 지정이 없습니다.';
            return;
        }
        box.innerHTML = '<strong>' + esc(active.delegate_name || '-') + '</strong>님이 ' + esc(active.start_date) + ' ~ ' + esc(active.end_date) + ' 기간 동안 승인 업무를 대무 처리합니다.';
    }
    function renderTable() {
        renderCurrent();
        if (!state.rows.length) {
            setTableState('등록된 대무자 이력이 없습니다.');
            return;
        }
        qs('delegation-table-body').innerHTML = state.rows.map(function (row) {
            return '<tr>' +
                '<td><strong>' + esc(row.delegate_name || '-') + '</strong><span class="ac-meta">' + esc(row.delegate_emp_no || '-') + '</span></td>' +
                '<td>' + esc(row.start_date || '-') + ' ~ ' + esc(row.end_date || '-') + '</td>' +
                '<td>' + esc(row.reason || '-') + '</td>' +
                '<td>' + statusBadge(row) + '</td>' +
                '<td>' + esc(row.created_at || '-') + '</td>' +
                '</tr>';
        }).join('');
        qs('delegation-table-state').hidden = true;
        qs('delegation-table').hidden = false;
    }
    function loadDelegations() {
        setTableState('대무자 이력을 불러오는 중입니다.');
        return fetchJson('/api/access-control/approver-delegations?scope=mine').then(function (data) {
            state.rows = data.rows || [];
            renderTable();
        }).catch(function (err) { setTableState(err.message); });
    }
    function renderSelectedDelegate() {
        var box = qs('delegation-selected');
        if (!state.delegate) {
            box.textContent = '선택된 대무자가 없습니다.';
            return;
        }
        box.innerHTML = '<strong>' + esc(state.delegate.name || state.delegate.nickname || '-') + '</strong>' +
            '<span class="ac-meta">' + esc(state.delegate.department || '-') + ' · ' + esc(state.delegate.emp_no || '-') + ' · ' + esc(state.delegate.email || '-') + '</span>';
    }
    function renderSearchResults(rows) {
        var box = qs('delegation-search-results');
        state.searchResults = rows || [];
        if (!rows.length) {
            box.innerHTML = '<div class="delegate-result-row"><span>검색 결과가 없습니다.</span></div>';
            box.hidden = false;
            return;
        }
        box.innerHTML = rows.map(function (row) {
            return '<button type="button" class="delegate-result-row" data-user-id="' + esc(row.id) + '">' +
                '<strong>' + esc(row.name || row.nickname || '-') + '</strong>' +
                '<span>' + esc(row.department || '-') + ' · ' + esc(row.emp_no || '-') + '</span>' +
                '</button>';
        }).join('');
        box.hidden = false;
    }
    function searchUsers() {
        var keyword = (qs('delegation-delegate-search').value || '').trim();
        if (!keyword) { qs('delegation-search-results').hidden = true; return; }
        fetchJson('/api/chat/directory?q=' + encodeURIComponent(keyword) + '&limit=20').then(function (rows) {
            renderSearchResults(Array.isArray(rows) ? rows : []);
        }).catch(function () { renderSearchResults([]); });
    }
    function submitDelegation(event) {
        event.preventDefault();
        var startDate = qs('delegation-start-date').value;
        var endDate = qs('delegation-end-date').value;
        var reason = (qs('delegation-reason').value || '').trim();
        if (!state.delegate) { setMessage('대무자를 선택하세요.', 'error'); return; }
        if (!startDate || !endDate) { setMessage('부재 시작일과 종료일을 입력하세요.', 'error'); return; }
        if (startDate > endDate) { setMessage('부재 시작일은 종료일보다 늦을 수 없습니다.', 'error'); return; }
        if (!reason) { setMessage('부재 사유를 입력하세요.', 'error'); return; }
        postJson('/api/access-control/approver-delegations', {
            delegate_id: state.delegate.id,
            start_date: startDate,
            end_date: endDate,
            reason: reason
        }).then(function () {
            setMessage('대무자가 지정되었습니다.', 'success');
            qs('delegation-form').reset();
            setDateField(qs('delegation-start-date'), '');
            setDateField(qs('delegation-end-date'), '');
            state.delegate = null;
            renderSelectedDelegate();
            qs('delegation-search-results').hidden = true;
            return loadDelegations();
        }).catch(function (err) { setMessage(err.message, 'error'); });
    }
    function bindEvents() {
        qs('delegation-form').addEventListener('submit', submitDelegation);
        qs('delegation-refresh-btn').addEventListener('click', loadDelegations);
        qs('delegation-delegate-search').addEventListener('input', function () {
            window.clearTimeout(state.searchTimer);
            state.searchTimer = window.setTimeout(searchUsers, 180);
        });
        qs('delegation-search-results').addEventListener('click', function (event) {
            var button = event.target.closest('button[data-user-id]');
            if (!button) return;
            var userId = button.getAttribute('data-user-id');
            var user = state.searchResults.filter(function (row) { return String(row.id) === String(userId); })[0];
            if (!user) return;
            state.delegate = user;
            qs('delegation-delegate-id').value = user.id;
            qs('delegation-delegate-search').value = user.name || user.nickname || '';
            qs('delegation-search-results').hidden = true;
            renderSelectedDelegate();
        });
        document.addEventListener('click', function (event) {
            if (!event.target.closest('.delegate-search-wrap')) qs('delegation-search-results').hidden = true;
        });
    }
    document.addEventListener('DOMContentLoaded', function () {
        bindEvents();
        initDelegationDatePickers();
        renderSelectedDelegate();
        loadDelegations();
    });
})();

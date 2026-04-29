(function () {
    'use strict';

    var state = { audits: [], resources: null };

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

    /* ───── 정책 ───── */
    function loadPolicy() {
        var statusEl = qs('admin-policy-status');
        return fetchJson('/api/access-control/policy').then(function (data) {
            var item = data.item || {};
            qs('policy-team-lead').value = String(item.team_lead_approval_required || 0);
            qs('policy-admin-approval').value = String(item.admin_approval_required || 0);
            qs('policy-default-days').value = item.default_period_days || 30;
            qs('policy-max-days').value = item.max_period_days || 90;
            qs('policy-notify-days').value = item.notify_before_days || 7;
            qs('policy-emergency').value = String(item.emergency_allowed || 0);
            qs('policy-duplicate').value = String(item.duplicate_request_blocked || 0);
            if (statusEl) statusEl.textContent = '저장된 정책을 불러왔습니다.';
        }).catch(function (err) {
            if (statusEl) statusEl.textContent = '정책을 불러오지 못했습니다: ' + err.message;
        });
    }
    function submitPolicy(event) {
        event.preventDefault();
        var statusEl = qs('admin-policy-status');
        sendJson('/api/access-control/policy', 'PUT', {
            team_lead_approval_required: qs('policy-team-lead').value,
            admin_approval_required: qs('policy-admin-approval').value,
            default_period_days: qs('policy-default-days').value,
            max_period_days: qs('policy-max-days').value,
            notify_before_days: qs('policy-notify-days').value,
            emergency_allowed: qs('policy-emergency').value,
            duplicate_request_blocked: qs('policy-duplicate').value
        }).then(function () {
            if (statusEl) statusEl.textContent = '저장되었습니다 · ' + new Date().toLocaleTimeString();
        }).catch(function (err) {
            if (statusEl) statusEl.textContent = '저장 실패: ' + err.message;
            window.alert(err.message);
        });
    }

    /* ───── 감사 로그 ───── */
    function setAuditEmpty(message) {
        var stateEl = qs('admin-audit-state'), tableEl = qs('admin-audit-table');
        if (!stateEl || !tableEl) return;
        stateEl.textContent = message;
        stateEl.hidden = false;
        tableEl.hidden = true;
    }
    function renderAudits() {
        if (!state.audits.length) { setAuditEmpty('조건에 맞는 감사 로그가 없습니다.'); return; }
        qs('admin-audit-body').innerHTML = state.audits.map(function (row) {
            return '<tr>' +
                '<td>' + esc(row.occurred_at || '-') + '</td>' +
                '<td>' + esc(row.actor_name || row.actor_emp_no || '-') + '</td>' +
                '<td>' + esc(row.resource_name || row.resource_url || '-') + '</td>' +
                '<td>' + esc(row.action_type || '-') + '</td>' +
                '<td>' + esc(row.action_result || '-') + '</td>' +
                '<td>' + esc(row.ip_address || '-') + '</td>' +
                '<td>' + esc(row.note || '-') + '</td>' +
                '</tr>';
        }).join('');
        qs('admin-audit-state').hidden = true;
        qs('admin-audit-table').hidden = false;
    }
    function loadAudits() {
        setAuditEmpty('감사 로그를 불러오는 중입니다.');
        var params = new URLSearchParams();
        ['actor-name', 'resource-name', 'action-type', 'from-date', 'to-date'].forEach(function (name) {
            var key = name.replace(/-([a-z])/g, function (_, chr) { return chr.toUpperCase(); });
            var el = qs('audit-' + name);
            var value = el ? el.value : '';
            if (value) params.set(key, value);
        });
        return fetchJson('/api/access-control/audit-logs' + (params.toString() ? ('?' + params.toString()) : ''))
            .then(function (data) { state.audits = data.rows || []; renderAudits(); })
            .catch(function (err) { setAuditEmpty('감사 로그를 불러오지 못했습니다: ' + err.message); });
    }

    /* ───── 검색 콤보박스 ───── */
    function setupCombo(opts) {
        var input = qs(opts.inputId);
        var menu = qs(opts.menuId);
        var clearBtn = document.querySelector('[data-combo-clear="' + opts.key + '"]');
        if (!input || !menu) return;
        var lastQ = '';
        var debounceT = null;
        var blurT = null;

        function close() { menu.hidden = true; menu.innerHTML = ''; }
        function showItems(items) {
            if (!items.length) {
                menu.innerHTML = '<li class="ac-combo-empty">검색 결과가 없습니다.</li>';
                menu.hidden = false;
                return;
            }
            menu.innerHTML = items.map(function (it) {
                return '<li class="ac-combo-item" role="option" data-value="' + esc(it.value) + '">' +
                    '<span class="ac-combo-primary">' + esc(it.label) + '</span>' +
                    (it.sub ? '<span class="ac-combo-sub">' + esc(it.sub) + '</span>' : '') +
                    '</li>';
            }).join('');
            menu.hidden = false;
        }
        function refresh() {
            var q = (input.value || '').trim();
            lastQ = q;
            if (clearBtn) clearBtn.hidden = !q;
            if (q.length < (opts.minChars || 1)) { close(); return; }
            opts.search(q).then(function (items) {
                if (q !== lastQ) return;
                showItems(items.slice(0, 30));
            }).catch(function () { close(); });
        }

        input.addEventListener('input', function () {
            window.clearTimeout(debounceT);
            debounceT = window.setTimeout(refresh, 180);
        });
        input.addEventListener('focus', refresh);
        input.addEventListener('blur', function () {
            blurT = window.setTimeout(close, 150);
        });
        menu.addEventListener('mousedown', function (e) {
            var li = e.target.closest('.ac-combo-item');
            if (!li) return;
            e.preventDefault();
            window.clearTimeout(blurT);
            input.value = li.getAttribute('data-value') || '';
            if (clearBtn) clearBtn.hidden = !input.value;
            close();
            loadAudits();
        });
        if (clearBtn) clearBtn.addEventListener('click', function () {
            input.value = '';
            clearBtn.hidden = true;
            close();
            loadAudits();
            input.focus();
        });
    }

    function searchUsers(q) {
        return fetch('/admin/auth/users/search?query=' + encodeURIComponent(q), { credentials: 'same-origin', cache: 'no-store' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                return (data.users || []).map(function (u) {
                    return { value: u.name || '', label: u.name || '-', sub: (u.department || '-') + ' · ' + (u.emp_no || '-') };
                });
            });
    }
    function searchResources(q) {
        var promise = state.resources
            ? Promise.resolve(state.resources)
            : fetchJson('/api/access-control/resources').then(function (data) {
                state.resources = data.rows || [];
                return state.resources;
            });
        return promise.then(function (rows) {
            var lower = q.toLowerCase();
            return rows.filter(function (r) {
                return String(r.resource_name || '').toLowerCase().indexOf(lower) !== -1;
            }).map(function (r) {
                return { value: r.resource_name || '', label: r.resource_name || '-', sub: (r.resource_type || '-') + ' · ' + (r.category_name || '-') };
            });
        });
    }

    /* ───── flatpickr ───── */
    function initDatePickers() {
        if (!window.flatpickr) return;
        try { window.flatpickr.localize(window.flatpickr.l10ns.ko); } catch (_) { }
        function addTodayBtn(cal) {
            if (!cal || cal.querySelector('.fp-today-btn')) return;
            var btn = document.createElement('button');
            btn.type = 'button'; btn.className = 'fp-today-btn'; btn.textContent = '오늘';
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                var inst = cal._flatpickr || null;
                if (inst) inst.setDate(new Date(), true);
            });
            cal.appendChild(btn);
        }
        var opts = {
            dateFormat: 'Y-m-d',
            allowInput: false,
            disableMobile: true,
            locale: window.flatpickr.l10ns.ko || 'ko',
            onReady: function (_, __, inst) { addTodayBtn(inst.calendarContainer); inst.calendarContainer.classList.add('blossom-date-popup'); },
            onChange: function () { loadAudits(); }
        };
        var fromEl = qs('audit-from-date'); if (fromEl) window.flatpickr(fromEl, opts);
        var toEl = qs('audit-to-date'); if (toEl) window.flatpickr(toEl, opts);
    }

    /* ───── 바인딩 ───── */
    function bindEvents() {
        var pf = qs('admin-policy-form'); if (pf) pf.addEventListener('submit', submitPolicy);
        var typeEl = qs('audit-action-type'); if (typeEl) typeEl.addEventListener('change', loadAudits);
        var notifyBtn = qs('admin-notify-run');
        if (notifyBtn) notifyBtn.addEventListener('click', function () {
            sendJson('/api/access-control/notifications/run', 'POST', {})
                .then(function (data) {
                    var item = (data && data.item) || {};
                    window.alert('만료 임박 알림 실행 완료\n신규 알림: ' + (item.created || 0) + '건\n만료 처리: ' + (item.expired_grants || 0) + '건');
                    return loadAudits();
                })
                .catch(function (err) { window.alert(err.message); });
        });
        setupCombo({ key: 'actor', inputId: 'audit-actor-name', menuId: 'audit-actor-menu', search: searchUsers, minChars: 1 });
        setupCombo({ key: 'resource', inputId: 'audit-resource-name', menuId: 'audit-resource-menu', search: searchResources, minChars: 0 });
    }

    document.addEventListener('DOMContentLoaded', function () {
        bindEvents();
        initDatePickers();
        Promise.all([loadPolicy(), loadAudits()]).catch(function (err) { window.alert(err.message); });
    });
})();

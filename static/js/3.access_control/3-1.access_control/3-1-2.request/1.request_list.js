(function () {
    'use strict';

    var PERMANENT_END_DATE = '9999-12-31';
    var REASON_MIN_LENGTH = 10;

    var state = {
        mainTab: 'form',
        segment: 'mine',
        resources: [],
        filteredResources: [],
        selectedIds: [],
        resourcePage: 1,
        resourcePageSize: 12,
        selectedCollapsed: false,
        periodMode: 'range',
        seededFromNavigation: false,
        myRequests: [],
        approvalRequests: [],
        sessionUser: null,
        selectedRequest: null,
        pendingPayload: null
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
                    var err = new Error(data.message || data.error || '요청 처리 중 오류가 발생했습니다.');
                    err.payload = data;
                    err.status = res.status;
                    throw err;
                }
                return data;
            });
        });
    }
    function postJson(url, data) {
        return fetchJson(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            body: JSON.stringify(data || {})
        });
    }
    function badgeClass(status) {
        if (status === '승인') return 'status-badge status-approved';
        if (status === '부분 승인') return 'status-badge status-draft';
        if (status === '승인대기' || status === '승인 대기') return 'status-badge status-pending';
        if (status === '반려' || status === '취소') return 'status-badge status-rejected';
        if (status === '만료') return 'status-badge status-expired';
        return 'status-badge status-draft';
    }
    function formatStatus(status, variant) {
        var cls = badgeClass(status);
        if (variant) cls += ' status-badge--' + variant;
        return '<span class="' + cls + '">' + esc(status || '-') + '</span>';
    }
    function byId(list, id) {
        for (var i = 0; i < list.length; i++) if (String(list[i].id) === String(id)) return list[i];
        return null;
    }
    function selectedResources() {
        return state.selectedIds.map(function (id) { return byId(state.resources, id); }).filter(function (row) { return !!row; });
    }
    function primaryUrl(row) {
        if (!row) return '';
        if (row.primary_url) return row.primary_url;
        if (row.resource_url) return row.resource_url;
        var eps = row.endpoints || [];
        return eps[0] ? (eps[0].url || eps[0].host || '') : '';
    }
    function normalizeKindLabel(value) {
        var text = String(value || '').trim();
        var upper = text.toUpperCase();
        if (!text) return '';
        if (text === '웹' || upper === 'WEB') return 'WEB';
        if (upper === 'SSH') return 'SSH';
        return upper || text;
    }
    function resourceKinds(row) {
        var map = {}, result = [];
        function addKind(value) {
            var kind = normalizeKindLabel(value);
            if (kind && !map[kind]) { map[kind] = true; result.push(kind); }
        }
        (row.endpoints || []).forEach(function (ep) {
            addKind(ep.kind || row.primary_kind || '');
        });
        addKind(row.primary_kind);
        addKind(row.resource_type);
        return result;
    }
    function isAdminUser() {
        var user = state.sessionUser || {};
        var role = String(user.role || '').trim().toUpperCase();
        return user.is_admin === true || user.admin === true || role === 'ADMIN' || role === '관리자';
    }
    function canApproveRequest(row) {
        if (!row || row.request_status !== '승인대기') return false;
        return state.segment === 'approvals' || isAdminUser();
    }
    function isPermanentEndDate(value) {
        return String(value || '') === PERMANENT_END_DATE;
    }
    function formatPeriod(startDate, endDate) {
        if (isPermanentEndDate(endDate)) return (startDate || '-') + ' ~ 영구 접근';
        return (startDate || '-') + ' ~ ' + (endDate || '-');
    }
    function approvalStageLabel(row) {
        if (!row) return '-';
        return row.current_approval_phase_name || row.current_phase_name || row.phase_name || row.approval_status || row.approver_name || '-';
    }
    function resourceStatus(row) {
        if (!row) return { code: 'blocked', label: '확인 필요', badge: 'status-blocked', reason: '자원 정보를 확인할 수 없습니다.' };
        if (!(row.active_flag === 1 || row.active_flag === '1' || row.active_flag === true)) {
            return { code: 'inactive', label: '비활성', badge: 'status-blocked', reason: '비활성화된 자원입니다.' };
        }
        if (row.can_access) {
            return { code: 'accessible', label: '권한 보유', badge: 'status-usable', reason: '이미 유효한 승인 권한이 있습니다.' };
        }
        if (row.request_pending) {
            return { code: 'pending', label: '승인 대기', badge: 'status-pending', reason: '승인 대기 중인 동일 자원이 있습니다.' };
        }
        if (row.can_request === false) {
            return { code: 'blocked', label: row.access_status || '신청 불가', badge: 'status-blocked', reason: '신청할 수 없는 자원입니다.' };
        }
        if (row.access_status === '만료됨' || row.grant_status === '만료') {
            return { code: 'expired', label: '재신청 가능', badge: 'status-expired', reason: '' };
        }
        return { code: 'available', label: '신청 가능', badge: 'status-approved', reason: '' };
    }
    function disabledReason(row) {
        return resourceStatus(row).reason || '';
    }
    function setMessage(text, kind) {
        var el = qs('request-form-message');
        if (!el) return;
        el.textContent = text || '';
        el.classList.toggle('is-error', kind === 'error');
        el.classList.toggle('is-success', kind === 'success');
    }
    function switchMainTab(tab) {
        state.mainTab = tab === 'status' ? 'status' : 'form';
        Array.prototype.slice.call(document.querySelectorAll('.request-main-tab')).forEach(function (button) {
            var active = button.getAttribute('data-request-tab') === state.mainTab;
            button.classList.toggle('active', active);
            button.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        Array.prototype.slice.call(document.querySelectorAll('.request-tab-panel')).forEach(function (panel) {
            var active = panel.id === 'request-tab-' + state.mainTab;
            panel.classList.toggle('active', active);
            panel.hidden = !active;
        });
        if (state.mainTab === 'status') renderTable();
    }
    function switchSegment(segment) {
        state.segment = segment === 'approvals' ? 'approvals' : 'mine';
        Array.prototype.slice.call(document.querySelectorAll('.segment-btn')).forEach(function (button) {
            button.classList.toggle('active', button.getAttribute('data-segment') === state.segment);
        });
        renderTable();
    }
    function updatePendingBadges() {
        var count = (state.approvalRequests || []).filter(function (row) {
            return row.request_status === '승인대기' || row.request_status === '제출';
        }).length;
        ['request-main-pending-badge', 'request-approval-badge'].forEach(function (id) {
            var badge = qs(id);
            if (!badge) return;
            badge.textContent = String(count);
            badge.classList.toggle('is-zero', count === 0);
        });
    }
    function formatDate(date) {
        var y = date.getFullYear();
        var m = String(date.getMonth() + 1); if (m.length < 2) m = '0' + m;
        var d = String(date.getDate()); if (d.length < 2) d = '0' + d;
        return y + '-' + m + '-' + d;
    }
    function setDateField(input, value) {
        if (!input) return;
        input.value = value || '';
        if (input._flatpickr) input._flatpickr.setDate(input.value, false, 'Y-m-d');
        syncDateConstraints();
    }
    function syncDateConstraints() {
        var start = qs('request-start-date');
        var end = qs('request-end-date');
        if (start && start._flatpickr) start._flatpickr.set('maxDate', (end && end.value) || null);
        if (end && end._flatpickr) end._flatpickr.set('minDate', (start && start.value) || null);
    }
    function isPermanentMode() {
        return state.periodMode === 'permanent';
    }
    function updateApproverLabel() {
        var approver = qs('request-approver');
        if (!approver) return;
        if (isPermanentMode()) {
            approver.value = '관리자/보안 담당자 자동 지정';
            return;
        }
        approver.value = (state.sessionUser && (state.sessionUser.dept_name || state.sessionUser.department)) ? (((state.sessionUser.dept_name || state.sessionUser.department)) + ' 팀장 자동 지정') : '부서 팀장 자동 지정';
    }
    function syncPeriodMode() {
        var form = qs('request-form');
        var end = qs('request-end-date');
        var note = qs('request-permanent-note');
        var permanent = isPermanentMode();
        if (form) form.classList.toggle('is-permanent', permanent);
        if (end) {
            end.disabled = permanent;
            if (permanent && end._flatpickr) end._flatpickr.clear();
        }
        Array.prototype.slice.call(document.querySelectorAll('.period-mode-card')).forEach(function (card) {
            var input = card.querySelector('input[type="radio"]');
            card.classList.toggle('is-active', !!input && input.checked);
        });
        Array.prototype.slice.call(document.querySelectorAll('[data-period-days]')).forEach(function (button) { button.disabled = permanent; });
        if (note) note.hidden = !permanent;
        updateApproverLabel();
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
    function initRequestDatePickers() {
        var start = qs('request-start-date');
        var end = qs('request-end-date');
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
    function applyQuickPeriod(days) {
        var start = new Date();
        var end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + Math.max(1, days) - 1);
        setDateField(qs('request-start-date'), formatDate(start));
        setDateField(qs('request-end-date'), formatDate(end));
    }
    function addSelected(id) {
        var numericId = Number(id);
        var row = byId(state.resources, numericId);
        var reason = disabledReason(row);
        if (reason) { setMessage(reason, 'error'); return; }
        if (state.selectedIds.indexOf(numericId) >= 0) return;
        state.selectedIds.push(numericId);
        renderSelected();
        renderResources();
        setMessage('');
    }
    function removeSelected(id) {
        state.selectedIds = state.selectedIds.filter(function (item) { return String(item) !== String(id); });
        renderSelected();
        renderResources();
    }
    function renderSelected() {
        var count = state.selectedIds.length;
        var countEl = qs('request-selected-count');
        var summaryEl = qs('request-selected-summary');
        var clearButton = qs('request-clear-selected');
        var kinds = { WEB: 0, SSH: 0 };
        var selected = selectedResources();
        selected.forEach(function (row) {
            resourceKinds(row).forEach(function (kind) {
                kind = String(kind || '').toUpperCase();
                if (kinds[kind] != null) kinds[kind] += 1;
            });
        });
        if (countEl) {
            countEl.textContent = count + '개';
            countEl.classList.toggle('has-items', count > 0);
        }
        if (summaryEl) summaryEl.textContent = count ? ('WEB ' + kinds.WEB + ' / SSH ' + kinds.SSH) : '선택 없음';
        if (clearButton) clearButton.disabled = !count;
        var list = qs('request-selected-list');
        list.classList.toggle('is-collapsed', state.selectedCollapsed);
        qs('request-selected-toggle').textContent = state.selectedCollapsed ? '펼치기' : '접기';
        if (!count) {
            list.innerHTML = '<div class="selected-empty">선택된 자원이 없습니다.</div>';
            return;
        }
        list.innerHTML = selected.map(function (row) {
            var kinds = resourceKinds(row).join('/');
            return '<div class="selected-resource-item" data-id="' + esc(row.id) + '">' +
                '<div><strong>' + esc(row.resource_name || '-') + '</strong>' +
                '<span>' + esc(kinds || '-') + ' · ' + esc(row.category_name || '-') + ' · ' + esc(primaryUrl(row) || '-') + '</span></div>' +
                '<button type="button" class="action-chip action-danger" data-remove-selected="' + esc(row.id) + '">삭제</button>' +
                '</div>';
        }).join('');
    }
    function populateCategoryFilter() {
        var select = qs('request-category-filter');
        var previous = select.value || '';
        var map = {};
        state.resources.forEach(function (row) { var c = (row.category_name || '').trim(); if (c) map[c] = true; });
        select.innerHTML = '<option value="">전체</option>' + Object.keys(map).sort().map(function (name) {
            return '<option value="' + esc(name) + '">' + esc(name) + '</option>';
        }).join('');
        if (previous && map[previous]) select.value = previous;
    }
    function applyResourceFilters() {
        var keyword = (qs('request-resource-search').value || '').trim().toLowerCase();
        var kind = (qs('request-kind-filter').value || '').trim();
        var category = (qs('request-category-filter').value || '').trim();
        var status = (qs('request-status-filter').value || '').trim();
        var hideOwned = !!(qs('request-hide-owned') && qs('request-hide-owned').checked);
        state.filteredResources = state.resources.filter(function (row) {
            var kinds = resourceKinds(row);
            var rowStatus = resourceStatus(row);
            if (hideOwned && rowStatus.code === 'accessible') return false;
            if (kind && kinds.indexOf(kind) < 0) return false;
            if (category && (row.category_name || '') !== category) return false;
            if (status === 'selectable' && rowStatus.reason) return false;
            if (status && status !== 'selectable' && rowStatus.code !== status) return false;
            if (keyword) {
                var hay = [row.resource_name, row.resource_url, row.primary_url, row.category_name, row.description, row.host_address, row.protocol, row.port_number, row.login_account, row.tags, row.access_status].concat(kinds);
                (row.endpoints || []).forEach(function (ep) { hay.push(ep.url, ep.host, ep.protocol, ep.kind, ep.label, ep.port, ep.url_path); });
                if (hay.join(' ').toLowerCase().indexOf(keyword) < 0) return false;
            }
            return true;
        });
        state.resourcePage = 1;
    }
    function pageRows() {
        var total = state.filteredResources.length;
        var pages = Math.max(1, Math.ceil(total / state.resourcePageSize));
        if (state.resourcePage > pages) state.resourcePage = pages;
        var start = (state.resourcePage - 1) * state.resourcePageSize;
        return state.filteredResources.slice(start, start + state.resourcePageSize);
    }
    function selectableRows(rows) {
        return (rows || []).filter(function (row) { return !disabledReason(row); });
    }
    function renderKindTags(row) {
        var kinds = resourceKinds(row);
        if (!kinds.length) return '<span class="ac-meta">-</span>';
        return kinds.map(function (kind) {
            kind = String(kind || '').toUpperCase();
            return '<span class="endpoint-kind-tag kind-' + esc(kind) + '">' + esc(kind) + '</span>';
        }).join(' ');
    }
    function selectRows(rows, label) {
        var added = 0;
        var skipped = 0;
        selectableRows(rows).forEach(function (row) {
            var numericId = Number(row.id);
            if (state.selectedIds.indexOf(numericId) < 0) {
                state.selectedIds.push(numericId);
                added += 1;
            } else {
                skipped += 1;
            }
        });
        renderSelected();
        renderResources();
        if (added) setMessage((label || '자원') + ' ' + added + '개를 선택했습니다.' + (skipped ? ' 이미 선택된 ' + skipped + '개는 유지했습니다.' : ''), 'success');
        else setMessage((label || '선택 대상') + ' 중 새로 선택할 수 있는 자원이 없습니다.', 'error');
    }
    function removeRows(rows) {
        var ids = (rows || []).map(function (row) { return Number(row.id); });
        state.selectedIds = state.selectedIds.filter(function (id) { return ids.indexOf(Number(id)) < 0; });
        renderSelected();
        renderResources();
    }
    function recentRequestRows() {
        var ids = [];
        state.myRequests.slice().sort(function (a, b) { return String(b.created_at || b.submitted_at || '').localeCompare(String(a.created_at || a.submitted_at || '')); }).forEach(function (item) {
            (item.resource_ids || [item.resource_id]).forEach(function (id) {
                id = Number(id);
                if (id && ids.indexOf(id) < 0) ids.push(id);
            });
        });
        return ids.map(function (id) { return byId(state.resources, id); }).filter(function (row) { return !!row; });
    }
    function frequentRows() {
        return state.resources.filter(function (row) { return row.last_accessed_at || row.approved_at; }).sort(function (a, b) {
            return String(b.last_accessed_at || b.approved_at || '').localeCompare(String(a.last_accessed_at || a.approved_at || ''));
        });
    }
    function renderResources() {
        var list = qs('request-resource-list');
        var total = state.filteredResources.length;
        var pages = Math.max(1, Math.ceil(total / state.resourcePageSize));
        if (state.resourcePage > pages) state.resourcePage = pages;
        var start = (state.resourcePage - 1) * state.resourcePageSize;
        var rows = pageRows();
        var available = selectableRows(state.filteredResources).length;
        var pageSelectable = selectableRows(rows);
        var pageSelected = pageSelectable.filter(function (row) { return state.selectedIds.indexOf(Number(row.id)) >= 0; }).length;
        var headerCheck = qs('request-select-page-check');
        qs('request-resource-page-info').textContent = total ? ((start + 1) + '-' + Math.min(total, start + rows.length) + ' / ' + total + '개') : '0개 항목';
        qs('request-available-count').textContent = available + '개';
        qs('request-filtered-count').textContent = '필터 결과 ' + total + '개';
        qs('request-resource-prev').disabled = state.resourcePage <= 1;
        qs('request-resource-next').disabled = state.resourcePage >= pages;
        if (headerCheck) {
            headerCheck.checked = !!pageSelectable.length && pageSelected === pageSelectable.length;
            headerCheck.indeterminate = pageSelected > 0 && pageSelected < pageSelectable.length;
            headerCheck.disabled = !pageSelectable.length;
        }
        qs('request-select-page').disabled = !pageSelectable.length;
        qs('request-select-filtered').disabled = !available;
        if (!rows.length) { list.innerHTML = '<tr><td colspan="7"><div class="resource-picker-empty">검색 결과가 없습니다.</div></td></tr>'; return; }
        list.innerHTML = rows.map(function (row) {
            var selected = state.selectedIds.indexOf(Number(row.id)) >= 0;
            var status = resourceStatus(row);
            var reason = status.reason;
            var disabled = !!reason;
            var rowClass = disabled ? ' is-disabled' : (selected ? ' is-selected' : '');
            return '<tr class="resource-picker-row' + rowClass + '" data-id="' + esc(row.id) + '">' +
                '<td class="resource-check-col"><input type="checkbox" class="request-resource-check" value="' + esc(row.id) + '"' + (selected ? ' checked' : '') + (disabled ? ' disabled' : '') + ' aria-label="' + esc(row.resource_name || '자원') + ' 선택"></td>' +
                '<td class="resource-picker-main"><strong>' + esc(row.resource_name || '-') + '</strong><span>' + esc(row.description || '-') + '</span></td>' +
                '<td>' + renderKindTags(row) + '</td>' +
                '<td>' + esc(row.category_name || '-') + '</td>' +
                '<td><span class="ac-meta resource-url-cell">' + esc(primaryUrl(row) || row.host_address || '-') + '</span></td>' +
                '<td><span class="status-badge ' + esc(status.badge) + '">' + esc(status.label) + '</span></td>' +
                '<td class="resource-reason-cell">' + esc(reason || '-') + '</td>' +
                '</tr>';
        }).join('');
    }
    function setResourceErrors(errors) {
        var box = qs('request-resource-errors');
        errors = errors || [];
        box.hidden = !errors.length;
        box.innerHTML = errors.map(function (err) {
            return '<div>' + esc(err.resource_name || ('자원 #' + err.resource_id)) + ': ' + esc(err.message || '-') + '</div>';
        }).join('');
    }
    function seedSelectedFromNavigation() {
        if (state.seededFromNavigation) return;
        state.seededFromNavigation = true;
        var values = [];
        var params = new URLSearchParams(window.location.search);
        function addRaw(raw) {
            try {
                var parsed = JSON.parse(raw || 'null');
                if (Array.isArray(parsed)) {
                    parsed.forEach(addRaw);
                    return;
                }
            } catch (_) {}
            String(raw || '').split(',').forEach(function (part) {
                var n = parseInt(part, 10);
                if (n && values.indexOf(n) < 0) values.push(n);
            });
        }
        addRaw(params.get('resource_ids'));
        addRaw(params.get('resource_id'));
        try { addRaw(localStorage.getItem('accessControlRequestResourceIds') || localStorage.getItem('accessControlRequestResourceId') || ''); } catch (_) {}
        values.forEach(addSelected);
        try {
            localStorage.removeItem('accessControlRequestResourceIds');
            localStorage.removeItem('accessControlRequestResourceId');
        } catch (_) {}
    }
    function renderResourceKindTags(row) {
        var kinds = resourceKinds(row);
        if (!kinds.length) return '<span class="request-resource-tag"><b>유형</b>-</span>';
        return kinds.map(function (kind) {
            return '<span class="request-resource-tag request-resource-tag-kind"><b>유형</b>' + esc(kind) + '</span>';
        }).join('');
    }
    function resourceCategory(row) {
        return row.category_name || '기타';
    }
    function resourceTarget(row) {
        return primaryUrl(row) || row.resource_url || row.host_address || '-';
    }
    function renderResourceStatusTable(items, canAct) {
        if (!items.length) return '<div class="empty-state compact">자원 항목이 없습니다.</div>';
        return '<div class="request-item-table-wrap"><table class="request-item-table">' +
            '<thead><tr>' +
                '<th class="request-item-check-cell" aria-label="선택"></th>' +
                '<th class="request-item-name-cell">자원</th>' +
                '<th class="request-item-kind-cell">유형</th>' +
                '<th class="request-item-category-cell">구분</th>' +
                '<th class="request-item-target-cell">대상</th>' +
                '<th class="request-item-status-cell">상태</th>' +
                '<th class="request-item-reason-cell">반려 사유</th>' +
            '</tr></thead><tbody>' + items.map(function (row) {
                var canCheck = canAct && row.item_status === '승인대기';
                return '<tr data-item-id="' + esc(row.id) + '">' +
                    '<td class="request-item-check-cell">' + (canCheck ? '<input type="checkbox" class="request-item-check" value="' + esc(row.id) + '" aria-label="' + esc(row.resource_name || '자원') + ' 선택">' : '') + '</td>' +
                    '<td class="request-item-name-cell"><strong>' + esc(row.resource_name || '-') + '</strong></td>' +
                    '<td class="request-item-kind-cell"><span class="request-resource-tags">' + renderResourceKindTags(row) + '</span></td>' +
                    '<td class="request-item-category-cell"><span class="request-resource-tag request-resource-tag-category">' + esc(resourceCategory(row)) + '</span></td>' +
                    '<td class="request-item-target-cell"><span class="request-item-target">' + esc(resourceTarget(row)) + '</span></td>' +
                    '<td class="request-item-status-cell">' + formatStatus(row.item_status || '-') + '</td>' +
                    '<td class="request-item-reason-cell">' + (row.reject_reason ? esc(row.reject_reason) : '<span class="request-item-empty">-</span>') + '</td>' +
                    '</tr>';
            }).join('') + '</tbody></table></div>';
    }
    function detailHtml(item) {
        if (!item) {
            return '<div class="empty-state"><div class="empty-state-content"><strong>신청을 선택하면 상세 정보가 표시됩니다.</strong><span>신청 정보, 자원별 상태, 승인 타임라인을 한 곳에서 확인합니다.</span></div></div>';
        }
        var approvals = item.approvals || [];
        var items = item.items || [];
        var canAct = canApproveRequest(item);
        var pendingItems = items.filter(function (row) { return row.item_status === '승인대기'; });
        var resourceCount = item.resource_count || items.length || 0;
        var approverText = esc(item.approver_name || item.approver_emp_no || '-');
        if (item.delegated) approverText += ' <span class="delegation-chip">대무 승인</span>';
        return '' +
            '<div class="request-detail-summary">' +
                '<div>' +
                    '<span class="detail-kicker">신청 정보</span>' +
                    '<strong class="detail-title">' + esc(item.request_no || '-') + '</strong>' +
                    '<span class="detail-subtitle">' + esc(formatPeriod(item.request_start_date, item.request_end_date)) + '</span>' +
                '</div>' +
                '<div class="detail-summary-status">' + formatStatus(item.request_status || '-') + '</div>' +
            '</div>' +
            '<div class="detail-box detail-box-main">' +
                '<div class="detail-box-title"><strong>기본 정보</strong><span>' + esc(resourceCount) + '개 자원</span></div>' +
                '<div class="detail-kv-grid">' +
                    '<div class="detail-kv"><span>신청자</span><strong>' + esc(item.requester_name || '-') + '</strong></div>' +
                    '<div class="detail-kv"><span>승인자</span><strong>' + approverText + '</strong></div>' +
                    '<div class="detail-kv"><span>긴급 여부</span><strong>' + esc(Number(item.emergency_flag || 0) ? '긴급' : '일반') + '</strong></div>' +
                    '<div class="detail-kv"><span>제출일</span><strong>' + esc(item.submitted_at || item.created_at || '-') + '</strong></div>' +
                    (item.delegated ? '<div class="detail-kv"><span>원 승인자</span><strong>' + esc(item.delegated_from_name || '-') + '</strong></div>' : '') +
                '</div>' +
                '<div class="detail-reason"><span>신청 사유</span><p>' + esc(item.reason || '-') + '</p></div>' +
            '</div>' +
            '<div class="detail-box"><div class="detail-box-title"><strong>자원별 상태</strong><span>' + esc(items.length) + '건</span></div>' +
            renderResourceStatusTable(items, canAct) +
            (canAct && pendingItems.length ? '<div class="detail-actions"><button type="button" class="action-chip action-primary" data-detail-action="approve-all" data-id="' + esc(item.id) + '">전체 승인</button><button type="button" class="action-chip action-danger" data-detail-action="reject-all" data-id="' + esc(item.id) + '">전체 반려</button><span class="detail-actions-divider"></span><button type="button" class="action-chip action-primary" data-detail-action="approve-selected" data-id="' + esc(item.id) + '">선택 승인</button><button type="button" class="action-chip action-danger" data-detail-action="reject-selected" data-id="' + esc(item.id) + '">선택 반려</button></div>' : '') +
            '</div>' +
            '<div class="detail-box"><div class="detail-box-title"><strong>승인 타임라인</strong><span>' + esc(approvals.length) + '단계</span></div>' + (approvals.length ? approvals.map(function (row) {
                return '<div class="approval-line"><div><strong>' + esc(row.phase_name || row.phase_code || '-') + '</strong><span>' + esc(row.approver_name || row.approver_emp_no || '-') + '</span></div>' + formatStatus(row.approval_status || '-') + '<p>' + esc(row.opinion || row.rejected_reason || '등록된 의견이 없습니다.') + '</p></div>';
            }).join('') : '<div>승인 이력이 없습니다.</div>') + '</div>';
    }
    function renderDetail(item) {
        var panel = qs('request-detail-panel');
        if (panel) panel.innerHTML = detailHtml(item);
    }
    function openDetailModal(item) {
        var modal = qs('request-detail-modal');
        qs('request-detail-modal-body').innerHTML = detailHtml(item);
        modal.classList.add('show');
        modal.setAttribute('aria-hidden', 'false');
        modal.style.display = 'flex';
        document.body.classList.add('modal-open');
    }
    function closeDetailModal() {
        var modal = qs('request-detail-modal');
        modal.classList.remove('show');
        modal.setAttribute('aria-hidden', 'true');
        modal.style.display = '';
        qs('request-detail-modal-body').innerHTML = '';
        document.body.classList.remove('modal-open');
    }
    function setTableState(message, actionText) {
        var html = '<div class="empty-state-content"><strong>' + esc(message) + '</strong>';
        if (actionText) html += '<button type="button" class="action-chip action-primary" data-switch-main-tab="form">' + esc(actionText) + '</button>';
        html += '</div>';
        qs('request-table-state').innerHTML = html;
        qs('request-table-state').hidden = false;
        qs('request-table').hidden = true;
    }
    function renderTable() {
        var rows = state.segment === 'approvals' ? state.approvalRequests : state.myRequests;
        var body = qs('request-table-body');
        if (!rows.length) {
            setTableState(state.segment === 'approvals' ? '팀 승인 대기 신청이 없습니다.' : '아직 등록된 신청 이력이 없습니다.', state.segment === 'mine' ? '신청서 작성하기' : '신청 탭으로 이동');
            state.selectedRequest = null;
            return;
        }
        body.innerHTML = rows.map(function (row) {
            var actions = ['<button class="action-chip action-muted" data-action="detail" data-id="' + row.id + '">상세</button>'];
            if (state.segment === 'mine' && (row.request_status === '승인대기' || row.request_status === '제출')) actions.push('<button class="action-chip action-danger" data-action="cancel" data-id="' + row.id + '">취소</button>');
            if (state.segment === 'mine' && (row.request_status === '반려' || row.request_status === '만료')) actions.push('<button class="action-chip action-primary" data-action="reapply" data-id="' + row.id + '">재신청</button>');
            if (canApproveRequest(row)) {
                actions.push('<button class="action-chip action-primary" data-action="approve" data-id="' + row.id + '">전체 승인</button>');
                actions.push('<button class="action-chip action-danger" data-action="reject" data-id="' + row.id + '">전체 반려</button>');
            }
            var emergency = Number(row.emergency_flag || 0) ? '긴급' : '일반';
            return '<tr>' +
                '<td>' + esc(row.submitted_at || row.created_at || '-') + '</td>' +
                '<td><strong>' + esc(row.request_no || '-') + '</strong><span class="ac-meta">' + esc(formatPeriod(row.request_start_date, row.request_end_date)) + '</span></td>' +
                '<td><strong>' + esc(row.resource_count || 0) + '개</strong><span class="ac-meta">' + esc(row.resource_name || '-') + '</span></td>' +
                '<td>' + formatStatus(row.request_status || '-') + '</td>' +
                '<td><strong>' + esc(approvalStageLabel(row)) + '</strong><span class="ac-meta">' + esc(row.approver_name || '-') + (row.delegated ? ' / 대무' : '') + '</span></td>' +
                '<td>' + esc(row.requester_name || '-') + '</td>' +
                '<td>' + esc(emergency) + '</td>' +
                '<td><span class="action-stack">' + actions.join(' ') + '</span></td>' +
                '</tr>';
        }).join('');
        qs('request-table-state').hidden = true;
        qs('request-table').hidden = false;
        state.selectedRequest = null;
    }
    function loadRequests() {
        setTableState('신청 목록을 불러오는 중입니다.');
        return Promise.all([
            fetchJson('/api/access-control/requests?scope=mine'),
            fetchJson('/api/access-control/requests?scope=approvals')
        ]).then(function (results) {
            state.myRequests = results[0].rows || [];
            state.approvalRequests = results[1].rows || [];
            updatePendingBadges();
            renderTable();
        }).catch(function (err) { setTableState(err.message); });
    }
    function loadBaseData() {
        return Promise.all([fetchJson('/api/access-control/resources'), fetchJson('/api/session/me')]).then(function (results) {
            state.resources = results[0].rows || [];
            state.sessionUser = (results[1].user || {});
            populateCategoryFilter();
            applyResourceFilters();
            renderResources();
            renderSelected();
            seedSelectedFromNavigation();
            updateApproverLabel();
        });
    }
    function validateForm() {
        var reason = qs('request-reason').value.trim();
        setResourceErrors([]);
        if (!state.selectedIds.length) return '신청 대상 자원을 선택하세요.';
        if (!reason) return '신청 사유를 입력하세요.';
        if (reason.length < REASON_MIN_LENGTH) return '신청 사유는 10자 이상 입력하세요.';
        if (!qs('request-start-date').value) return '사용 시작일을 입력하세요.';
        if (!isPermanentMode() && !qs('request-end-date').value) return '사용 종료일을 입력하세요.';
        if (!isPermanentMode() && qs('request-start-date').value > qs('request-end-date').value) return '시작일은 종료일보다 늦을 수 없습니다.';
        return '';
    }
    function openConfirm(payload) {
        var period = formatPeriod(payload.request_start_date, payload.request_end_date);
        var approver = qs('request-approver').value || '-알 수 없음-';
        var emergency = payload.emergency_flag ? '긴급' : '일반';
        var reason = payload.reason || '-';
        if (reason.length > 120) reason = reason.slice(0, 120) + '...';
        state.pendingPayload = payload;
        qs('request-confirm-body').innerHTML = '' +
            '<div class="confirm-summary-card">' +
                '<div class="confirm-metric"><span>신청 자원</span><strong>' + esc(payload.resource_ids.length) + '개</strong></div>' +
                '<div class="confirm-state"><span class="confirm-state-dot"></span>승인 대기 생성</div>' +
            '</div>' +
            '<div class="confirm-detail-grid">' +
                '<div class="confirm-row"><span>사용 기간</span><strong>' + esc(period) + '</strong></div>' +
                '<div class="confirm-row"><span>승인자</span><strong>' + esc(approver) + '</strong></div>' +
                '<div class="confirm-row"><span>긴급 여부</span><strong>' + esc(emergency) + '</strong></div>' +
                '<div class="confirm-row confirm-row-wide"><span>신청 사유</span><strong>' + esc(reason) + '</strong></div>' +
            '</div>';
        var modal = qs('request-confirm-modal');
        modal.classList.add('show');
        modal.setAttribute('aria-hidden', 'false');
        modal.style.display = 'flex';
        document.body.classList.add('modal-open');
    }
    function closeConfirm() {
        var modal = qs('request-confirm-modal');
        modal.classList.remove('show');
        modal.setAttribute('aria-hidden', 'true');
        modal.style.display = '';
        document.body.classList.remove('modal-open');
        state.pendingPayload = null;
    }
    function submitRequest(event) {
        event.preventDefault();
        var message = validateForm();
        if (message) { setMessage(message, 'error'); return; }
        openConfirm({
            resource_ids: state.selectedIds.slice(),
            reason: qs('request-reason').value.trim(),
            request_start_date: qs('request-start-date').value,
            request_end_date: isPermanentMode() ? PERMANENT_END_DATE : qs('request-end-date').value,
            request_period_type: isPermanentMode() ? 'permanent' : 'range',
            permanent_access: isPermanentMode() ? 1 : 0,
            emergency_flag: qs('request-emergency-flag').value === '1' ? 1 : 0
        });
    }
    function performSubmit() {
        if (!state.pendingPayload) return;
        var btn = qs('request-confirm-submit');
        var originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '제출 중...';
        postJson('/api/access-control/requests', state.pendingPayload)
            .then(function () {
                closeConfirm();
                state.selectedIds = [];
                qs('request-reason').value = '';
                renderSelected();
                renderResources();
                switchSegment('mine');
                switchMainTab('status');
                setTableState('신청 목록을 불러오는 중입니다.');
                setMessage('신청이 제출되었습니다.', 'success');
                return Promise.all([
                    loadBaseData().catch(function () {}),
                    loadRequests().then(function () {
                        switchSegment('mine');
                        switchMainTab('status');
                    })
                ]);
            })
            .catch(function (err) {
                if (state.mainTab === 'status') {
                    setTableState(err.message || '신청 목록을 새로고침하지 못했습니다.', '신청서 작성하기');
                    return;
                }
                closeConfirm();
                setResourceErrors((err.payload && err.payload.item_errors) || []);
                setMessage(err.message, 'error');
            })
            .finally(function () {
                btn.disabled = false;
                btn.textContent = originalText;
            });
    }
    function selectedDetailItemIds() {
        return Array.prototype.slice.call(document.querySelectorAll('#request-detail-modal-body .request-item-check:checked')).map(function (el) { return el.value; });
    }
    function actOnRequest(id, action, itemIds) {
        if (action === 'approve') {
            var opinion = window.prompt('승인 의견을 입력하세요.', '업무 필요성이 확인되어 승인합니다.') || '';
            return postJson('/api/access-control/requests/' + id + '/approve', { opinion: opinion, item_ids: itemIds || [] }).then(loadRequests).catch(function (err) { window.alert(err.message); });
        }
        var reason = window.prompt('반려 사유를 입력하세요.');
        if (!reason) return Promise.resolve();
        return postJson('/api/access-control/requests/' + id + '/reject', { rejected_reason: reason, item_ids: itemIds || [] }).then(loadRequests).catch(function (err) { window.alert(err.message); });
    }
    function handleTableAction(event) {
        var button = event.target.closest('button[data-action]');
        if (!button) return;
        var action = button.getAttribute('data-action');
        var id = button.getAttribute('data-id');
        var rows = state.segment === 'approvals' ? state.approvalRequests : state.myRequests;
        var item = rows.filter(function (row) { return String(row.id) === String(id); })[0];
        if (!item) return;
        if (action === 'detail') { fetchJson('/api/access-control/requests/' + id).then(function (data) { state.selectedRequest = data.item; openDetailModal(data.item); }).catch(function (err) { window.alert(err.message); }); return; }
        if (action === 'cancel') { postJson('/api/access-control/requests/' + id + '/cancel', {}).then(loadRequests).catch(function (err) { window.alert(err.message); }); return; }
        if (action === 'reapply') {
            state.selectedIds = [];
            (item.resource_ids || [item.resource_id]).forEach(addSelected);
            qs('request-reason').value = item.reason || '';
            state.periodMode = isPermanentEndDate(item.request_end_date) ? 'permanent' : 'range';
            var periodRadio = qs(state.periodMode === 'permanent' ? 'request-period-permanent' : 'request-period-range');
            if (periodRadio) periodRadio.checked = true;
            setDateField(qs('request-start-date'), item.request_start_date || '');
            setDateField(qs('request-end-date'), item.request_end_date || '');
            syncPeriodMode();
            switchMainTab('form');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
        if (action === 'approve') { actOnRequest(id, 'approve'); return; }
        if (action === 'reject') { actOnRequest(id, 'reject'); }
    }
    function bindEvents() {
        Array.prototype.slice.call(document.querySelectorAll('.request-main-tab')).forEach(function (button) {
            button.addEventListener('click', function () { switchMainTab(button.getAttribute('data-request-tab')); });
        });
        qs('request-form').addEventListener('submit', submitRequest);
        qs('request-table-body').addEventListener('click', handleTableAction);
        qs('request-table-state').addEventListener('click', function (event) {
            var button = event.target.closest('button[data-switch-main-tab]');
            if (button) switchMainTab(button.getAttribute('data-switch-main-tab'));
        });
        qs('request-resource-search').addEventListener('input', function () { applyResourceFilters(); renderResources(); });
        qs('request-kind-filter').addEventListener('change', function () { applyResourceFilters(); renderResources(); });
        qs('request-category-filter').addEventListener('change', function () { applyResourceFilters(); renderResources(); });
        qs('request-status-filter').addEventListener('change', function () { applyResourceFilters(); renderResources(); });
        qs('request-hide-owned').addEventListener('change', function () { applyResourceFilters(); renderResources(); });
        qs('request-resource-prev').addEventListener('click', function () { if (state.resourcePage > 1) { state.resourcePage--; renderResources(); } });
        qs('request-resource-next').addEventListener('click', function () { state.resourcePage++; renderResources(); });
        qs('request-select-page-check').addEventListener('change', function (event) { event.target.checked ? selectRows(pageRows(), '현재 페이지') : removeRows(pageRows()); });
        qs('request-select-page').addEventListener('click', function () { selectRows(pageRows(), '현재 페이지'); });
        qs('request-select-filtered').addEventListener('click', function () { selectRows(state.filteredResources, '필터 결과'); });
        qs('request-select-recent').addEventListener('click', function () { selectRows(recentRequestRows(), '최근 신청 자원'); });
        qs('request-select-frequent').addEventListener('click', function () { selectRows(frequentRows(), '최근 사용 자원'); });
        qs('request-reset-filters').addEventListener('click', function () {
            qs('request-resource-search').value = '';
            qs('request-kind-filter').value = '';
            qs('request-category-filter').value = '';
            qs('request-status-filter').value = '';
            qs('request-hide-owned').checked = false;
            applyResourceFilters();
            renderResources();
            setMessage('필터를 초기화했습니다.', 'success');
        });
        qs('request-resource-list').addEventListener('change', function (event) {
            var input = event.target.closest('.request-resource-check');
            if (!input) return;
            input.checked ? addSelected(input.value) : removeSelected(input.value);
        });
        qs('request-resource-list').addEventListener('click', function (event) {
            var row = event.target.closest('tr[data-id]');
            var input;
            if (!row || event.target.tagName === 'INPUT') return;
            input = row.querySelector('.request-resource-check');
            if (!input || input.disabled) return;
            input.checked ? removeSelected(input.value) : addSelected(input.value);
        });
        qs('request-selected-list').addEventListener('click', function (event) { var btn = event.target.closest('button[data-remove-selected]'); if (btn) removeSelected(btn.getAttribute('data-remove-selected')); });
        qs('request-selected-toggle').addEventListener('click', function () { state.selectedCollapsed = !state.selectedCollapsed; renderSelected(); });
        qs('request-clear-selected').addEventListener('click', function () { state.selectedIds = []; renderSelected(); renderResources(); setMessage('선택된 자원을 모두 제거했습니다.', 'success'); });
        Array.prototype.slice.call(document.querySelectorAll('[data-period-days]')).forEach(function (button) { button.addEventListener('click', function () { applyQuickPeriod(parseInt(button.getAttribute('data-period-days'), 10)); }); });
        Array.prototype.slice.call(document.querySelectorAll('input[name="requestPeriodType"]')).forEach(function (input) {
            input.addEventListener('change', function () {
                state.periodMode = input.value === 'permanent' ? 'permanent' : 'range';
                syncPeriodMode();
            });
        });
        Array.prototype.slice.call(document.querySelectorAll('.segment-btn')).forEach(function (button) {
            button.addEventListener('click', function () {
                switchSegment(button.getAttribute('data-segment'));
            });
        });
        qs('request-detail-modal').addEventListener('click', function (event) {
            if (event.target === qs('request-detail-modal')) { closeDetailModal(); return; }
            var tableRow = event.target.closest('tr[data-item-id]');
            if (tableRow && event.target.tagName !== 'INPUT' && !event.target.closest('button')) {
                var input = tableRow.querySelector('.request-item-check');
                if (input) {
                    input.checked = !input.checked;
                    tableRow.classList.toggle('is-selected', input.checked);
                }
                return;
            }
            var btn = event.target.closest('button[data-detail-action]');
            if (!btn) return;
            var detailAction = btn.getAttribute('data-detail-action');
            var ids = [];
            if (detailAction.indexOf('selected') > -1) {
                ids = selectedDetailItemIds();
                if (!ids.length) { window.alert('처리할 자원을 선택하세요.'); return; }
            }
            var action = detailAction.indexOf('approve') === 0 ? 'approve' : 'reject';
            actOnRequest(btn.getAttribute('data-id'), action, ids).then(closeDetailModal);
        });
        qs('request-detail-close').addEventListener('click', closeDetailModal);
        qs('request-detail-dismiss').addEventListener('click', closeDetailModal);
        qs('request-confirm-close').addEventListener('click', closeConfirm);
        qs('request-confirm-cancel').addEventListener('click', closeConfirm);
        qs('request-confirm-submit').addEventListener('click', performSubmit);
    }
    document.addEventListener('DOMContentLoaded', function () {
        bindEvents();
        initRequestDatePickers();
        applyQuickPeriod(7);
        syncPeriodMode();
        loadBaseData().then(loadRequests).catch(function (err) { setTableState(err.message); });
    });
})();
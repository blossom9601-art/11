(function () {
    'use strict';

    var state = { segment: 'mine', resources: [], myRequests: [], approvalRequests: [], sessionUser: null, selectedRequest: null };

    function qs(id) { return document.getElementById(id); }
    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function badgeClass(status) {
        if (status === '승인') return 'status-badge status-approved';
        if (status === '승인대기' || status === '승인 대기') return 'status-badge status-pending';
        if (status === '반려' || status === '취소') return 'status-badge status-rejected';
        if (status === '만료') return 'status-badge status-expired';
        return 'status-badge status-draft';
    }
    function fetchJson(url, options) {
        return fetch(url, Object.assign({ credentials: 'same-origin', cache: 'no-store' }, options || {})).then(function (res) {
            return res.json().then(function (data) {
                if (!res.ok || data.success === false) throw new Error(data.message || data.error || '요청 처리 중 오류가 발생했습니다.');
                return data;
            });
        });
    }
    function postJson(url, data) {
        return fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: JSON.stringify(data || {}) });
    }
    function formatStatus(status) {
        return '<span class="' + badgeClass(status) + '">' + esc(status) + '</span>';
    }
    function setTableState(message) {
        qs('request-table-state').textContent = message;
        qs('request-table-state').hidden = false;
        qs('request-table').hidden = true;
    }
    function selectedResource() {
        var resourceId = qs('request-resource-id').value;
        var list = state.resources.filter(function (item) { return String(item.id) === String(resourceId); });
        return list.length ? list[0] : null;
    }
    function syncResourceFields() {
        var item = selectedResource();
        qs('request-resource-url').value = item ? (item.resource_url || '') : '';
    }
    function renderResourceOptions() {
        qs('request-resource-id').innerHTML = state.resources.map(function (row) {
            return '<option value="' + row.id + '">' + esc(row.resource_name) + ' (' + esc(row.resource_url) + ')</option>';
        }).join('');
        var params = new URLSearchParams(window.location.search);
        var preset = params.get('resource_id');
        var fromStorage = '';
        try { fromStorage = localStorage.getItem('accessControlRequestResourceId') || ''; } catch (_) {}
        var target = preset || fromStorage || (state.resources[0] ? String(state.resources[0].id) : '');
        if (target) qs('request-resource-id').value = target;
        syncResourceFields();
    }
    function renderDetail(item) {
        if (!item) {
            qs('request-detail-panel').innerHTML = '<div class="empty-state">상세를 선택하면 신청 정보, 과거 이력, 승인 의견이 표시됩니다.</div>';
            return;
        }
        var approvals = item.approvals || [];
        var history = item.request_history || [];
        qs('request-detail-panel').innerHTML = '' +
            '<div class="detail-box"><strong>신청 정보</strong><div style="margin-top:6px;">' + esc(item.request_no || '-') + ' / ' + esc(item.resource_name || '-') + '</div><div style="margin-top:6px;">사유: ' + esc(item.reason || '-') + '</div><div style="margin-top:6px;">기간: ' + esc(item.request_start_date || '-') + ' ~ ' + esc(item.request_end_date || '-') + '</div><div style="margin-top:6px;">상태: ' + formatStatus(item.request_status || '-') + '</div></div>' +
            '<div class="detail-box"><strong>승인 검토</strong>' + (approvals.length ? approvals.map(function (row) {
                return '<div style="margin-top:8px;">' + esc(row.phase_name || row.phase_code || '-') + ' / ' + formatStatus(row.approval_status || '-') + '<div style="margin-top:4px;">의견: ' + esc(row.opinion || row.rejected_reason || '-') + '</div></div>';
            }).join('') : '<div style="margin-top:8px;">승인 이력이 없습니다.</div>') + '</div>' +
            '<div class="detail-box"><strong>과거 신청 이력</strong>' + (history.length ? history.map(function (row) {
                return '<div style="margin-top:8px;">' + esc(row.request_no || '-') + ' / ' + formatStatus(row.request_status || '-') + ' / ' + esc(row.request_start_date || '-') + ' ~ ' + esc(row.request_end_date || '-') + '</div>';
            }).join('') : '<div style="margin-top:8px;">과거 신청 이력이 없습니다.</div>') + '</div>';
    }
    function renderTable() {
        var rows = state.segment === 'approvals' ? state.approvalRequests : state.myRequests;
        var body = qs('request-table-body');
        if (!rows.length) {
            setTableState(state.segment === 'approvals' ? '처리할 승인 대기 신청이 없습니다.' : '등록된 신청 이력이 없습니다.');
            renderDetail(null);
            return;
        }
        body.innerHTML = rows.map(function (row) {
            var actions = ['<button class="action-chip action-muted" data-action="detail" data-id="' + row.id + '">상세</button>'];
            if (state.segment === 'mine' && (row.request_status === '승인대기' || row.request_status === '제출')) {
                actions.push('<button class="action-chip action-danger" data-action="cancel" data-id="' + row.id + '">취소</button>');
            }
            if (state.segment === 'mine' && (row.request_status === '반려' || row.request_status === '만료')) {
                actions.push('<button class="action-chip action-primary" data-action="reapply" data-id="' + row.id + '">재신청</button>');
            }
            if (state.segment === 'approvals') {
                actions.push('<button class="action-chip action-primary" data-action="approve" data-id="' + row.id + '">승인</button>');
                actions.push('<button class="action-chip action-danger" data-action="reject" data-id="' + row.id + '">반려</button>');
            }
            return '<tr>' +
                '<td>' + esc(row.request_no || '-') + '</td>' +
                '<td>' + esc(row.resource_name || '-') + '</td>' +
                '<td>' + esc(row.resource_url || '-') + '</td>' +
                '<td>' + esc(row.requester_name || '-') + '</td>' +
                '<td>' + esc(row.submitted_at || row.created_at || '-') + '</td>' +
                '<td>' + esc(row.approver_name || '-') + '</td>' +
                '<td>' + formatStatus(row.request_status || '-') + '</td>' +
                '<td>' + esc(row.rejected_reason || '-') + '</td>' +
                '<td>' + actions.join(' ') + '</td>' +
                '</tr>';
        }).join('');
        qs('request-table-state').hidden = true;
        qs('request-table').hidden = false;
        renderDetail(rows[0]);
        state.selectedRequest = rows[0];
    }
    function loadRequests() {
        setTableState('신청 목록을 불러오는 중입니다.');
        return Promise.all([
            fetchJson('/api/access-control/requests?scope=mine'),
            fetchJson('/api/access-control/requests?scope=approvals')
        ]).then(function (results) {
            state.myRequests = results[0].rows || [];
            state.approvalRequests = results[1].rows || [];
            renderTable();
        }).catch(function (err) { setTableState(err.message); });
    }
    function loadBaseData() {
        return Promise.all([
            fetchJson('/api/access-control/resources'),
            fetchJson('/api/session/me')
        ]).then(function (results) {
            state.resources = (results[0].rows || []).filter(function (row) { return row.active_flag === 1 || row.active_flag === '1' || row.active_flag === true; });
            state.sessionUser = (results[1].user || {});
            renderResourceOptions();
            qs('request-approver').value = (state.sessionUser.dept_name || '') ? (state.sessionUser.dept_name + ' 팀장 자동 지정') : '부서 팀장 자동 지정';
        });
    }
    function submitRequest(event) {
        event.preventDefault();
        var payload = {
            resource_id: qs('request-resource-id').value,
            reason: qs('request-reason').value,
            request_start_date: qs('request-start-date').value,
            request_end_date: qs('request-end-date').value,
            emergency_flag: qs('request-emergency-flag').value
        };
        postJson('/api/access-control/requests', payload)
            .then(function () {
                qs('request-form-message').textContent = '신청이 제출되었습니다.';
                qs('request-reason').value = '';
                loadRequests();
                try { localStorage.removeItem('accessControlRequestResourceId'); } catch (_) {}
            })
            .catch(function (err) { qs('request-form-message').textContent = err.message; });
    }
    function handleTableAction(event) {
        var button = event.target.closest('button[data-action]');
        if (!button) return;
        var action = button.getAttribute('data-action');
        var id = button.getAttribute('data-id');
        var rows = state.segment === 'approvals' ? state.approvalRequests : state.myRequests;
        var item = rows.filter(function (row) { return String(row.id) === String(id); })[0];
        if (!item) return;
        if (action === 'detail') {
            fetchJson('/api/access-control/requests/' + id).then(function (data) { state.selectedRequest = data.item; renderDetail(data.item); }).catch(function (err) { window.alert(err.message); });
            return;
        }
        if (action === 'cancel') {
            postJson('/api/access-control/requests/' + id + '/cancel', {}).then(loadRequests).catch(function (err) { window.alert(err.message); });
            return;
        }
        if (action === 'reapply') {
            qs('request-resource-id').value = String(item.resource_id || '');
            syncResourceFields();
            qs('request-reason').value = item.reason || '';
            qs('request-start-date').value = item.request_start_date || '';
            qs('request-end-date').value = item.request_end_date || '';
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
        if (action === 'approve') {
            var opinion = window.prompt('승인 의견을 입력하세요.', '업무 필요성이 확인되어 승인합니다.') || '';
            postJson('/api/access-control/requests/' + id + '/approve', { opinion: opinion }).then(loadRequests).catch(function (err) { window.alert(err.message); });
            return;
        }
        if (action === 'reject') {
            var reason = window.prompt('반려 사유를 입력하세요.');
            if (!reason) return;
            postJson('/api/access-control/requests/' + id + '/reject', { rejected_reason: reason }).then(loadRequests).catch(function (err) { window.alert(err.message); });
        }
    }
    function bindEvents() {
        qs('request-form').addEventListener('submit', submitRequest);
        qs('request-resource-id').addEventListener('change', syncResourceFields);
        qs('request-table-body').addEventListener('click', handleTableAction);
        Array.prototype.slice.call(document.querySelectorAll('.segment-btn')).forEach(function (button) {
            button.addEventListener('click', function () {
                Array.prototype.slice.call(document.querySelectorAll('.segment-btn')).forEach(function (item) { item.classList.remove('active'); });
                button.classList.add('active');
                state.segment = button.getAttribute('data-segment');
                renderTable();
            });
        });
    }
    document.addEventListener('DOMContentLoaded', function () {
        bindEvents();
        loadBaseData().then(loadRequests).catch(function (err) { setTableState(err.message); });
    });
})();
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
        pendingPayload: null,
        requestType: '',
        currentStep: 1,
        systemAction: '',
        systemActionFlow: '',
        actionLocked: false,
        requestedUserId: '',
        userIdChecked: '',
        userIdAvailable: false,
        category: '시스템',
        categoryDetail: '',
        workOperationCode: '',
        workOperations: []
    };

    var SYSTEM_ACTION_FLOWS = {
        'id-request': {
            desc: '최초 1회 내 기본 사용자 ID를 생성하는 신청입니다.',
            help: '자원 선택 없이 사용자 ID 중복 점검 후 신청 사유와 승인자 단계만 진행합니다.',
            reason: '사용자 ID가 필요한 업무 목적을 입력하세요.',
            selected: '사용자 ID 신청',
            noResource: true,
            noPeriod: true
        },
        'account-create': {
            desc: '대상 시스템에 새 계정을 생성하는 신청입니다.',
            help: '선택한 시스템에 계정 신규 생성을 요청합니다. 신청 사유에는 계정 용도, 담당자, 필요한 권한 범위를 적어주세요.',
            reason: '계정 용도, 담당자, 필요한 권한 범위를 입력하세요.',
            selected: '선택된 계정 생성 대상'
        },
        'account-extend': {
            desc: '기존 계정의 사용 기간을 연장하는 신청입니다.',
            help: '선택한 시스템 계정의 사용 기간 연장을 요청합니다. 연장 사유와 희망 기간을 함께 적어주세요.',
            reason: '연장 사유와 희망 기간을 입력하세요.',
            selected: '선택된 연장 대상'
        },
        'account-delete': {
            desc: '더 이상 사용하지 않는 계정을 삭제하는 신청입니다.',
            help: '선택한 시스템 계정의 삭제를 요청합니다. 삭제 대상 계정과 회수 사유를 적어주세요.',
            reason: '삭제 대상 계정과 회수 사유를 입력하세요.',
            selected: '선택된 계정 삭제 대상',
            noPeriod: true
        },
        unlock: {
            desc: '잠긴 시스템 계정의 잠금 해제를 요청합니다.',
            help: '선택한 시스템 계정의 잠금 해제를 요청합니다. 대상 계정과 잠금 발생 상황을 적어주세요.',
            reason: '잠금 해제 대상 계정과 발생 상황을 입력하세요.',
            selected: '선택된 잠금 해제 대상',
            noPeriod: true
        },
        'password-change': {
            desc: '시스템 계정의 패스워드 변경을 요청합니다.',
            help: '선택한 시스템 계정의 패스워드 변경을 요청합니다. 대상 계정과 변경 사유를 적어주세요.',
            reason: '패스워드 변경 대상 계정과 변경 사유를 입력하세요.',
            selected: '선택된 패스워드 변경 대상',
            noPeriod: true
        },
        'group-create': {
            desc: '그룹을 새로 생성하는 신청입니다.',
            help: '선택한 시스템에 그룹 생성을 요청합니다. 그룹명, 용도, 소유자, 기본 권한 범위를 적어주세요.',
            reason: '생성할 그룹명, 용도, 소유자, 권한 범위를 입력하세요.',
            selected: '선택된 그룹 생성 대상',
            noPeriod: true
        },
        'group-add': {
            desc: '계정에 그룹을 추가하는 신청입니다.',
            help: '선택한 시스템 계정에 그룹 추가를 요청합니다. 대상 계정과 추가할 그룹명을 적어주세요.',
            reason: '대상 계정과 추가할 그룹명, 업무 목적을 입력하세요.',
            selected: '선택된 그룹 추가 대상'
        },
        'group-delete': {
            desc: '계정에서 그룹을 삭제하는 신청입니다.',
            help: '선택한 시스템 계정에서 그룹 삭제를 요청합니다. 대상 계정과 삭제할 그룹명을 적어주세요.',
            reason: '대상 계정과 삭제할 그룹명, 회수 사유를 입력하세요.',
            selected: '선택된 그룹 삭제 대상',
            noPeriod: true
        },
        'owner-change': {
            desc: '서비스 계정의 관리자를 변경하는 신청입니다.',
            help: '선택한 서비스 계정의 관리자 변경을 요청합니다. 현재 관리자와 변경할 관리자를 적어주세요.',
            reason: '현재 관리자, 변경할 관리자, 변경 사유를 입력하세요.',
            selected: '선택된 관리자 변경 대상',
            noPeriod: true
        },
        'user-change': {
            desc: '서비스 계정의 사용자를 변경하는 신청입니다.',
            help: '선택한 서비스 계정의 사용자 변경을 요청합니다. 추가 또는 제외할 사용자와 사유를 적어주세요.',
            reason: '변경할 사용자와 변경 사유를 입력하세요.',
            selected: '선택된 사용자 변경 대상',
            noPeriod: true
        },
        sftp: {
            desc: '시스템 계정의 SFTP 권한을 요청합니다.',
            help: '선택한 시스템 계정에 SFTP 권한을 요청합니다. 대상 경로, 계정, 권한 범위를 적어주세요.',
            reason: '대상 계정, SFTP 경로, 필요한 권한 범위를 입력하세요.',
            selected: '선택된 SFTP 권한 대상'
        }
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
    function statusStateClass(status) {
        if (status === '승인') return 'status-approved';
        if (status === '부분 승인') return 'status-draft';
        if (status === '승인대기' || status === '승인 대기') return 'status-pending';
        if (status === '반려' || status === '취소') return 'status-rejected';
        if (status === '만료') return 'status-expired';
        return 'status-blocked';
    }
    function formatStatusPlain(status) {
        return '<span class="request-item-status-plain ' + statusStateClass(status) + '"><span class="request-item-status-dot"></span>' + esc(status || '-') + '</span>';
    }
    function byId(list, id) {
        for (var i = 0; i < list.length; i++) if (String(list[i].id) === String(id)) return list[i];
        return null;
    }

    function categoryKey(value) { return String(value || '').replace(/[\s\/_-]+/g, '').toLowerCase(); }
    function normalizeCategoryValue(value) { return CATEGORY_ALIASES[categoryKey(value)] || (String(value || '').trim() || '시스템'); }
    function normalizeConsoleGroup(value) { return CONSOLE_GROUP_ALIASES[categoryKey(value)] || ''; }
    function selectedResources() {
        return state.selectedIds.map(function (id) { return byId(state.resources, id); }).filter(function (row) { return !!row; });
    }
    function requestTypeLabel(type) {
        return (type || state.requestType) === 'delete' ? '삭제 신청' : '사용 신청';
    }
    function requestTypeValue(type) {
        return (type || state.requestType) === 'delete' ? 'delete' : 'use';
    }
    function isDeleteRequestMode() {
        return state.requestType === 'delete';
    }
    function isSystemRequestMode() {
        return (state.category || '') === '시스템';
    }
    function requestDisplayLabel(payload) {
        if (payload && payload.system_action) return payload.system_action;
        if (!payload && isSystemRequestMode() && state.systemAction) return state.systemAction;
        return requestTypeLabel(payload && payload.request_type);
    }
    function hasSelectedRequestAction() {
        return isSystemRequestMode() ? !!state.systemAction : !!state.requestType;
    }
    function activeSystemFlow() {
        return SYSTEM_ACTION_FLOWS[state.systemActionFlow] || {};
    }
    function actionReady() {
        return state.actionLocked && hasSelectedRequestAction();
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
    function normalizeProtocolLabel(value, url) {
        var text = String(value || '').trim();
        var upper = text.toUpperCase();
        var target = String(url || '').trim().toLowerCase();
        if (upper === 'HTTP' || upper === 'HTTPS' || upper === 'SSH') return upper;
        if (target.indexOf('https://') === 0) return 'HTTPS';
        if (target.indexOf('http://') === 0) return 'HTTP';
        if (target.indexOf(':443') >= 0) return 'HTTPS';
        if (target.indexOf(':80') >= 0) return 'HTTP';
        return upper || '';
    }
    function protocolKindPairs(row) {
        var map = {}, result = [];
        function addPair(protocol, kind, url) {
            protocol = normalizeProtocolLabel(protocol, url);
            kind = normalizeKindLabel(kind);
            if (!protocol && (kind === 'HTTP' || kind === 'HTTPS')) { protocol = kind; kind = 'WEB'; }
            if (protocol && (kind === 'HTTP' || kind === 'HTTPS')) kind = 'WEB';
            if (!kind && (protocol === 'HTTP' || protocol === 'HTTPS')) kind = 'WEB';
            if (!protocol && kind === 'WEB') protocol = normalizeProtocolLabel('', url) || 'HTTPS';
            if (!protocol && kind === 'SSH') protocol = 'SSH';
            if (!protocol && !kind) return;
            var label = protocol && kind && protocol !== kind ? protocol + ', ' + kind : (protocol || kind);
            if (!map[label]) { map[label] = true; result.push(label); }
        }
        (row.endpoints || []).forEach(function (ep) {
            addPair(ep.protocol || ep.scheme || ep.type, ep.kind || row.primary_kind || row.resource_type, ep.url || ep.host || row.primary_url || row.resource_url);
        });
        if (!result.length) {
            addPair(row.protocol || row.scheme || row.primary_kind || row.resource_type, row.primary_kind || row.resource_type, primaryUrl(row));
        }
        return result;
    }
    function categoryLabel(row) {
        return normalizeCategoryValue(row && (row.category_name || row.category_label || row.category));
    }
    function categoryDetail(row) {
        return categoryLabel(row) === '관리콘솔' ? normalizeConsoleGroup(row && (row.category_detail || row.console_group)) : '';
    }
    function workOperationCode(row) { return categoryLabel(row) === '관리콘솔' ? '' : String(row && (row.work_operation_code || '') || '').trim(); }
    function workOperationLabel(row) { return categoryLabel(row) === '관리콘솔' ? '' : String(row && (row.work_operation_name || row.work_operation || row.work_operation_code || '') || '').trim(); }
    function categoryPath(row) {
        var category = categoryLabel(row);
        var detail = categoryDetail(row);
        return category === '관리콘솔' && detail ? category + ' / ' + detail : category;
    }
    function operationOptionsHtml() {
        var html = '<option value="">전체</option>';
        state.workOperations.forEach(function (item) {
            var code = item.operation_code || '';
            var name = item.wc_name || item.operation_name || code;
            if (code) html += '<option value="' + esc(code) + '">' + esc(name) + '</option>';
        });
        return html;
    }
    function endpointTarget(ep) {
        if (!ep) return '-';
        if (ep.kind === 'WEB') return ep.url || ep.host || '-';
        return (ep.host || ep.url || '-') + (ep.port ? ':' + ep.port : '');
    }
    function endpointSummary(row) {
        var eps = row.endpoints || [];
        if (!eps.length) return '<span class="ac-meta resource-url-cell">' + esc(primaryUrl(row) || row.host_address || '-') + '</span>';
        return '<div class="request-endpoint-stack">' + eps.map(function (ep) {
            return '<span class="request-endpoint-chip"><strong>' + esc(endpointTarget(ep)) + '</strong></span>';
        }).join('') + '</div>';
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
    function requestPeriodText(row) {
        if (row && row.request_type === '삭제') return '삭제 승인 후 권한 회수';
        return formatPeriod(row && row.request_start_date, row && row.request_end_date);
    }
    function approvalStageLabel(row) {
        if (!row) return '-';
        return row.current_approval_phase_name || row.current_phase_name || row.phase_name || row.approval_status || row.approver_name || '-';
    }
    /** API의 can_access 또는 access_status(사용 가능·만료 예정)로 실제 접근 허용 상태 판별 */
    function rowHasActiveAccess(row) {
        if (!row) return false;
        var v = row.can_access;
        if (v === true || v === 1 || v === '1') return true;
        var st = row.access_status || '';
        if (st === '사용 가능' || st === '만료 예정' || st === '삭제 승인 대기') return true;
        return false;
    }
    function resourceStatus(row) {
        if (!row) return { code: 'blocked', label: '확인 필요', badge: 'status-blocked', reason: '자원 정보를 확인할 수 없습니다.' };
        if (isDeleteRequestMode()) {
            if (row.delete_request_pending) {
                return { code: 'pending', label: '삭제 승인 대기', badge: 'status-pending', reason: '삭제 승인 대기 중인 동일 자원이 있습니다.' };
            }
            if (row.can_delete_request || rowHasActiveAccess(row)) {
                return { code: 'available', label: '삭제 신청 가능', badge: 'status-approved', reason: '' };
            }
            if (row.request_pending && !rowHasActiveAccess(row)) {
                return { code: 'pending', label: '승인 대기', badge: 'status-pending', reason: '사용 승인 대기 중인 자원은 삭제 신청할 수 없습니다.' };
            }
            return { code: 'blocked', label: '권한 없음', badge: 'status-blocked', reason: '유효한 접근 권한이 있는 자원만 삭제 신청할 수 있습니다.' };
        }
        if (!(row.active_flag === 1 || row.active_flag === '1' || row.active_flag === true)) {
            return { code: 'inactive', label: '비활성', badge: 'status-blocked', reason: '비활성화된 자원입니다.' };
        }
        if (row.delete_request_pending) {
            return { code: 'pending', label: '삭제 승인 대기', badge: 'status-pending', reason: '삭제 승인 대기 중인 자원은 사용 신청할 수 없습니다.' };
        }
        if (row.access_status === '시작 전') {
            return {
                code: 'scheduled',
                label: '사용 시작 전',
                badge: 'status-pending',
                reason: '승인은 되었으나 사용 시작일(한국 시간) 이전입니다. 시작일 이후에는 접속 메뉴에서 이용할 수 있습니다.'
            };
        }
        if (rowHasActiveAccess(row)) {
            return { code: 'accessible', label: '권한 보유', badge: 'status-usable', reason: '이미 유효한 승인 권한이 있습니다.' };
        }
        if (row.use_request_pending || row.request_pending) {
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
    function requiresPeriod() {
        return !isDeleteRequestMode() && !activeSystemFlow().noPeriod;
    }
    function requiresResourceSelection() {
        return !activeSystemFlow().noResource;
    }
    function isUserIdRequestFlow() {
        return state.systemActionFlow === 'id-request';
    }
    function setUserIdStatus(message, kind) {
        var el = qs('request-user-id-status');
        if (!el) return;
        el.textContent = message || '';
        el.classList.toggle('is-ok', kind === 'ok');
        el.classList.toggle('is-error', kind === 'error');
    }
    function resetUserIdCheck() {
        state.userIdChecked = '';
        state.userIdAvailable = false;
        setUserIdStatus('사용할 ID를 입력한 뒤 중복 점검을 진행하세요.', '');
    }
    function normalizeRequestedUserId(value) {
        return String(value || '').trim();
    }
    function validateRequestedUserId(value) {
        var id = normalizeRequestedUserId(value);
        if (!id) return '신청할 사용자 ID를 입력하세요.';
        if (!/^[A-Za-z0-9._-]{3,32}$/.test(id)) return '사용자 ID는 영문, 숫자, 점, 밑줄, 하이픈 3~32자로 입력하세요.';
        return '';
    }
    function checkRequestedUserId() {
        var input = qs('request-user-id');
        var id = normalizeRequestedUserId(input && input.value);
        var message = validateRequestedUserId(id);
        if (message) {
            state.userIdAvailable = false;
            state.userIdChecked = '';
            setUserIdStatus(message, 'error');
            return;
        }
        setUserIdStatus('중복 점검 중입니다...', '');
        fetchJson('/api/access-control/user-id/check?user_id=' + encodeURIComponent(id))
            .then(function (data) {
                state.requestedUserId = id;
                state.userIdChecked = id;
                state.userIdAvailable = !!data.available;
                setUserIdStatus(data.message || (data.available ? '사용 가능한 ID입니다.' : '이미 사용 중인 ID입니다.'), data.available ? 'ok' : 'error');
            })
            .catch(function (err) {
                state.userIdAvailable = false;
                state.userIdChecked = '';
                setUserIdStatus(err.message || '중복 점검에 실패했습니다.', 'error');
            });
    }
    function updateApproverLabel() {
        var approver = qs('request-approver');
        if (!approver) return;
        if (!isPermanentMode() && isAdminUser()) {
            approver.value = '관리자 본인 승인';
            return;
        }
        if (isDeleteRequestMode()) {
            approver.value = (state.sessionUser && (state.sessionUser.dept_name || state.sessionUser.department)) ? (((state.sessionUser.dept_name || state.sessionUser.department)) + ' 팀장 자동 지정') : '부서 팀장 자동 지정';
            return;
        }
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
        var periodPanel = qs('request-period-mode-panel');
        var dateGrid = qs('request-period-date-grid');
        var quickPeriods = qs('request-quick-periods');
        var needsPeriod = requiresPeriod();
        var permanent = isPermanentMode() && needsPeriod;
        var periodStepActive = (state.currentStep || 1) === 2;
        if (form) form.classList.toggle('is-permanent', permanent);
        if (form) form.classList.toggle('is-delete-request', isDeleteRequestMode());
        if (periodPanel) periodPanel.hidden = !needsPeriod || !periodStepActive;
        if (dateGrid) dateGrid.hidden = !needsPeriod || !periodStepActive;
        if (quickPeriods) quickPeriods.hidden = !needsPeriod || !periodStepActive;
        if (end) {
            end.disabled = permanent;
            if (permanent && end._flatpickr) end._flatpickr.clear();
        }
        Array.prototype.slice.call(document.querySelectorAll('.period-mode-card')).forEach(function (card) {
            var input = card.querySelector('input[type="radio"]');
            card.classList.toggle('is-active', !!input && input.checked);
        });
        Array.prototype.slice.call(document.querySelectorAll('[data-period-days]')).forEach(function (button) { button.disabled = permanent; });
        if (note) note.hidden = !permanent || !periodStepActive;
        updateApproverLabel();
        syncDateConstraints();
    }

    function syncRequestTypeUI() {
        var isDelete = isDeleteRequestMode();
        var title = qs('request-form-title');
        var desc = qs('request-form-desc');
        var reason = qs('request-reason');
        var submit = qs('request-submit-button');
        var hideOwnedLabel = document.querySelector('label[for="request-hide-owned"] span');
        Array.prototype.slice.call(document.querySelectorAll('.request-type-card')).forEach(function (card) {
            var input = card.querySelector('input[type="radio"]');
            card.classList.toggle('is-active', !!input && input.checked);
        });
        if (title) title.textContent = isDelete ? '삭제 신청서 작성' : '사용 신청서 작성';
        if (desc) desc.textContent = isDelete ? '보유 중인 접근 권한 삭제를 요청합니다.' : '여러 자원을 선택해 하나의 신청서로 제출합니다.';
        if (reason) reason.placeholder = isDelete ? '삭제 사유와 회수 필요성을 구체적으로 입력하세요.' : '업무 목적과 필요 기간을 구체적으로 입력하세요.';
        if (submit) submit.textContent = isDelete ? '삭제 신청 제출' : '사용 신청 제출';
        if (hideOwnedLabel) hideOwnedLabel.textContent = isDelete ? '권한 없는 자원 숨김' : '이미 승인된 자원 숨김';
        syncPeriodMode();
    }
    function updateActionSummary() {
        var summary = qs('request-action-summary');
        var title = qs('request-action-summary-title');
        var desc = qs('request-action-summary-desc');
        var help = qs('request-action-help');
        var userIdPanel = qs('user-id-request-panel');
        var resourcePicker = document.querySelector('.resource-picker');
        var selectedPanel = document.querySelector('.selected-resource-panel');
        var selectedTitle = document.querySelector('.selected-resource-head strong');
        var firstStep = document.querySelector('.request-step[data-request-step="1"]');
        var firstStepLabel = document.querySelector('.request-step[data-request-step="1"] strong');
        var secondStep = document.querySelector('.request-step[data-request-step="2"] strong');
        var label = requestDisplayLabel();
        var flow = activeSystemFlow();
        var visible = actionReady();
        if (summary) summary.hidden = !visible;
        if (title) title.textContent = visible ? label : '-';
        if (desc) desc.textContent = isSystemRequestMode() && flow.desc ? flow.desc : '자원을 선택해 신청서를 계속 작성합니다.';
        if (help) {
            help.textContent = isSystemRequestMode() && flow.help ? flow.help : '';
            help.hidden = !visible || !isSystemRequestMode() || !flow.help || state.currentStep !== 1;
        }
        if (userIdPanel) userIdPanel.hidden = !visible || !isUserIdRequestFlow() || state.currentStep !== 1;
        if (resourcePicker && visible && isUserIdRequestFlow()) resourcePicker.hidden = true;
        if (selectedPanel && visible && isUserIdRequestFlow()) selectedPanel.hidden = true;
        if (selectedTitle) selectedTitle.textContent = isSystemRequestMode() && flow.selected ? flow.selected : '선택된 자원';
        if (firstStep) firstStep.hidden = false;
        if (firstStepLabel) firstStepLabel.textContent = isUserIdRequestFlow() ? 'ID 추가' : '자원 선택';
        if (secondStep) secondStep.textContent = isSystemRequestMode() && flow.noPeriod ? '사유/정보' : '사유/기간';
    }
    function setFormStep(step) {
        var hasAction = actionReady();
        var nextStep = Math.max(1, Math.min(3, Number(step) || 1));
        state.currentStep = nextStep;
        var stepper = document.querySelector('.request-stepper');
        if (stepper) stepper.hidden = !hasAction;
        Array.prototype.slice.call(document.querySelectorAll('.request-step')).forEach(function (button) {
            var active = Number(button.getAttribute('data-request-step')) === nextStep;
            button.classList.toggle('is-active', active);
            button.classList.toggle('is-complete', Number(button.getAttribute('data-request-step')) < nextStep);
        });
        Array.prototype.slice.call(document.querySelectorAll('.request-step-block')).forEach(function (block) {
            block.hidden = !hasAction || !block.classList.contains('request-step-block-' + nextStep);
        });
        var prev = qs('request-step-prev');
        var next = qs('request-step-next');
        if (prev) prev.hidden = !hasAction || nextStep === 1;
        if (next) next.hidden = !hasAction || nextStep === 3;
        updateActionSummary();
        syncPeriodMode();
    }
    function validateStep(step) {
        if (step === 1 && isUserIdRequestFlow()) {
            var id = normalizeRequestedUserId(qs('request-user-id') && qs('request-user-id').value);
            var idMessage = validateRequestedUserId(id);
            if (idMessage) return idMessage;
            if (!state.userIdAvailable || state.userIdChecked !== id) return '사용자 ID 중복 점검을 완료하세요.';
        }
        if (step === 1 && requiresResourceSelection() && !state.selectedIds.length) return '신청 대상 자원을 선택하세요.';
        if (step === 2) {
            var reason = qs('request-reason').value.trim();
            if (!reason) return '신청 사유를 입력하세요.';
            if (reason.length < REASON_MIN_LENGTH) return (isDeleteRequestMode() ? '삭제 사유' : '신청 사유') + '는 10자 이상 입력하세요.';
            if (requiresPeriod()) {
                if (!qs('request-start-date').value) return '사용 시작일을 입력하세요.';
                if (!isPermanentMode() && !qs('request-end-date').value) return '사용 종료일을 입력하세요.';
                if (!isPermanentMode() && qs('request-start-date').value > qs('request-end-date').value) return '시작일은 종료일보다 늦을 수 없습니다.';
            }
        }
        return '';
    }
    function updateSystemActionText() {
        var label = requestDisplayLabel();
        var flow = activeSystemFlow();
        var title = qs('request-form-title');
        var desc = qs('request-form-desc');
        var reason = qs('request-reason');
        var submit = qs('request-submit-button');
        var hidden = qs('request-system-action');
        if (hidden) hidden.value = state.systemAction || '';
        if (!isSystemRequestMode()) return;
        if (title) title.textContent = label + ' 신청서 작성';
        if (desc) desc.textContent = flow.desc || '시스템 자원을 선택한 뒤 계정 작업 정보를 단계별로 입력합니다.';
        if (reason) reason.placeholder = flow.reason || (label + '이 필요한 업무 목적과 기간을 구체적으로 입력하세요.');
        if (submit) submit.textContent = label + ' 제출';
        updateActionSummary();
    }
    function setSystemAction(action, requestType, flow) {
        state.systemAction = action || '공통 - 사용자 ID 신청';
        state.systemActionFlow = flow || '';
        state.actionLocked = true;
        if (activeSystemFlow().noResource) state.selectedIds = [];
        if (flow === 'id-request') resetUserIdCheck();
        if (requestType) state.requestType = requestType === 'delete' ? 'delete' : 'use';
        Array.prototype.slice.call(document.querySelectorAll('.system-request-option')).forEach(function (button) {
            button.classList.toggle('is-active', button.getAttribute('data-system-action') === state.systemAction);
        });
        var radio = qs(state.requestType === 'delete' ? 'request-type-delete' : 'request-type-use');
        if (radio) radio.checked = true;
        syncRequestTypeUI();
        updateSystemActionText();
        syncSystemRequestPanel();
        applyResourceFilters();
        renderResources();
        renderSelected();
        setFormStep(1);
    }
    function syncSystemRequestPanel() {
        var system = isSystemRequestMode();
        var panel = qs('system-request-panel');
        var typePanel = qs('request-type-panel');
        var categoryTabs = document.querySelector('.request-category-tabs');
        if (panel) panel.hidden = !system || state.actionLocked;
        if (typePanel) typePanel.hidden = system || state.actionLocked;
        if (categoryTabs) categoryTabs.hidden = state.actionLocked;
        if (system) updateSystemActionText();
        else syncRequestTypeUI();
        updateActionSummary();
        setFormStep(state.currentStep || 1);
    }
    function clearRequestAction() {
        state.requestType = '';
        state.systemAction = '';
        state.systemActionFlow = '';
        state.actionLocked = false;
        state.requestedUserId = '';
        resetUserIdCheck();
        state.selectedIds = [];
        setResourceErrors([]);
        Array.prototype.slice.call(document.querySelectorAll('input[name="requestType"]')).forEach(function (input) { input.checked = false; });
        Array.prototype.slice.call(document.querySelectorAll('.request-type-card')).forEach(function (card) { card.classList.remove('is-active'); });
        Array.prototype.slice.call(document.querySelectorAll('.system-request-option')).forEach(function (button) { button.classList.remove('is-active'); });
        var hidden = qs('request-system-action');
        if (hidden) hidden.value = '';
        renderSelected();
        renderResources();
        syncSystemRequestPanel();
        setFormStep(1);
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
                '<span>' + esc(kinds || '-') + ' · ' + esc(categoryPath(row)) + ' · ' + esc((row.endpoints || []).length ? ((row.endpoints || []).length + '개 접속점') : (primaryUrl(row) || '-')) + '</span></div>' +
                '<button type="button" class="action-chip action-danger" data-remove-selected="' + esc(row.id) + '">삭제</button>' +
                '</div>';
        }).join('');
    }
    function populateCategoryFilter() {
        var select = qs('request-category-filter');
        var previous = select.value || '';
        var fixed = ['', '시스템', '서비스', '컨테이너', '관리콘솔'];
        select.innerHTML = fixed.map(function (name) {
            return '<option value="' + esc(name) + '">' + esc(name || '전체') + '</option>';
        }).join('');
        if (fixed.indexOf(previous) >= 0) select.value = previous;
        syncSearchSelect(select);
    }
    function syncCategoryTabs() {
        Array.prototype.slice.call(document.querySelectorAll('.request-category-tabs .system-tab-btn[data-category]')).forEach(function (button) {
            var active = (button.getAttribute('data-category') || '') === (state.category || '');
            button.classList.toggle('active', active);
            button.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        if (qs('request-category-filter') && qs('request-category-filter').value !== (state.category || '')) {
            qs('request-category-filter').value = state.category || '';
            syncSearchSelect(qs('request-category-filter'));
        }
        syncCategoryDetailFilter();
        syncSystemRequestPanel();
    }
    function syncCategoryDetailFilter() {
        var wrap = qs('request-category-detail-wrap');
        var select = qs('request-category-detail-filter');
        var opWrap = qs('request-work-operation-wrap');
        var opSelect = qs('request-work-operation-filter');
        var isConsole = (state.category || '') === '관리콘솔';
        if (wrap) wrap.hidden = !isConsole;
        if (select) {
            select.disabled = !isConsole;
            if (!isConsole) {
                state.categoryDetail = '';
                select.value = '';
            }
            syncSearchSelect(select);
        }
        if (opWrap) opWrap.hidden = isConsole;
        if (opSelect) {
            opSelect.disabled = isConsole;
            if (isConsole) {
                state.workOperationCode = '';
                opSelect.value = '';
            }
            syncSearchSelect(opSelect);
        }
    }
    function populateWorkOperationFilter() {
        var select = qs('request-work-operation-filter');
        if (!select) return;
        select.innerHTML = operationOptionsHtml();
        select.value = state.workOperationCode || '';
        syncSearchSelect(select);
    }
    function applyResourceFilters() {
        var keyword = (qs('request-resource-search').value || '').trim().toLowerCase();
        var kind = (qs('request-kind-filter').value || '').trim();
        var category = (state.category || qs('request-category-filter').value || '').trim();
        var detail = state.categoryDetail || '';
        var operation = state.workOperationCode || '';
        var status = (qs('request-status-filter').value || '').trim();
        var hideOwned = !!(qs('request-hide-owned') && qs('request-hide-owned').checked);
        state.filteredResources = state.resources.filter(function (row) {
            var kinds = resourceKinds(row);
            var rowStatus = resourceStatus(row);
            if (hideOwned && !isDeleteRequestMode() && (rowStatus.code === 'accessible' || rowStatus.code === 'scheduled')) return false;
            if (hideOwned && isDeleteRequestMode() && rowStatus.code !== 'available') return false;
            if (kind && kinds.indexOf(kind) < 0) return false;
            if (category && categoryLabel(row) !== category) return false;
            if (category === '관리콘솔' && detail && categoryDetail(row) !== detail) return false;
            if (category !== '관리콘솔' && operation && workOperationCode(row) !== operation) return false;
            if (status === 'selectable' && rowStatus.reason) return false;
            if (status && status !== 'selectable') {
                if (!(isDeleteRequestMode() && status === 'accessible' && rowStatus.code === 'available') && rowStatus.code !== status) return false;
            }
            if (keyword) {
                var hay = [row.resource_name, row.resource_url, row.primary_url, row.category_name, row.category_detail, row.work_operation_code, workOperationLabel(row), categoryPath(row), row.description, row.host_address, row.protocol, row.port_number, row.login_account, row.tags, row.access_status].concat(kinds);
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
        var pairs = protocolKindPairs(row);
        if (!pairs.length) return '<span class="ac-meta">-</span>';
        return pairs.map(function (label) {
            return '<span class="request-protocol-kind-tag">' + esc(label) + '</span>';
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
    function pageNumberItems(current, totalPages) {
        var items = [];
        var page;
        var start = Math.max(2, current - 1);
        var end = Math.min(totalPages - 1, current + 1);
        items.push(1);
        if (start > 2) items.push('ellipsis-left');
        for (page = start; page <= end; page++) items.push(page);
        if (end < totalPages - 1) items.push('ellipsis-right');
        if (totalPages > 1) items.push(totalPages);
        return items;
    }
    function renderResourcePageNumbers(pages) {
        var box = qs('request-resource-page-numbers');
        if (!box) return;
        box.innerHTML = pageNumberItems(state.resourcePage, pages).map(function (item) {
            if (typeof item !== 'number') return '<span class="resource-page-ellipsis">...</span>';
            return '<button type="button" class="resource-page-number' + (item === state.resourcePage ? ' active' : '') + '" data-resource-page="' + item + '" aria-current="' + (item === state.resourcePage ? 'page' : 'false') + '">' + item + '</button>';
        }).join('');
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
        qs('request-resource-page-info').textContent = total ? ((start + 1) + '-' + Math.min(total, start + rows.length) + ' / ' + total + '개 항목') : '0-0 / 0개 항목';
        qs('request-available-count').textContent = available + '개';
        qs('request-filtered-count').textContent = '필터 결과 ' + total + '개';
        qs('request-resource-prev').disabled = state.resourcePage <= 1;
        qs('request-resource-next').disabled = state.resourcePage >= pages;
        renderResourcePageNumbers(pages);
        if (headerCheck) {
            headerCheck.checked = !!pageSelectable.length && pageSelected === pageSelectable.length;
            headerCheck.indeterminate = pageSelected > 0 && pageSelected < pageSelectable.length;
            headerCheck.disabled = !pageSelectable.length;
        }
        if (!rows.length) { list.innerHTML = '<tr><td colspan="8"><div class="resource-picker-empty">검색 결과가 없습니다.</div></td></tr>'; return; }
        list.innerHTML = rows.map(function (row) {
            var selected = state.selectedIds.indexOf(Number(row.id)) >= 0;
            var status = resourceStatus(row);
            var reason = status.reason;
            var disabled = !!reason;
            var rowClass = disabled ? ' is-disabled' : (selected ? ' is-selected' : '');
            return '<tr class="resource-picker-row' + rowClass + '" data-id="' + esc(row.id) + '">' +
                '<td class="resource-check-col"><input type="checkbox" class="request-resource-check" value="' + esc(row.id) + '"' + (selected ? ' checked' : '') + (disabled ? ' disabled' : '') + ' aria-label="' + esc(row.resource_name || '자원') + ' 선택"></td>' +
                '<td class="resource-picker-main"><strong>' + esc(row.resource_name || '-') + '</strong></td>' +
                '<td>' + renderKindTags(row) + '</td>' +
                '<td>' + esc(categoryPath(row)) + '</td>' +
                '<td>' + esc(workOperationLabel(row) || '-') + '</td>' +
                '<td>' + endpointSummary(row) + '</td>' +
                '<td class="request-resource-status-cell"><span class="request-resource-status ' + esc(status.badge) + '"><span class="request-resource-status-dot" aria-hidden="true"></span><span class="request-resource-status-text">' + esc(status.label) + '</span></span></td>' +
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
    function setRequestType(type, clearSelection) {
        var nextType = requestTypeValue(type);
        if (state.requestType === nextType && !clearSelection && state.actionLocked) return;
        state.requestType = nextType;
        state.systemAction = '';
        state.systemActionFlow = '';
        state.actionLocked = true;
        if (clearSelection) {
            state.selectedIds = [];
            setResourceErrors([]);
        }
        Array.prototype.slice.call(document.querySelectorAll('input[name="requestType"]')).forEach(function (input) {
            input.checked = requestTypeValue(input.value) === state.requestType;
        });
        applyResourceFilters();
        renderResources();
        renderSelected();
        syncRequestTypeUI();
        syncSystemRequestPanel();
        setFormStep(1);
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
    function renderResourceKindText(row) {
        var kinds = resourceKinds(row);
        if (!kinds.length) return '<span class="request-item-empty">-</span>';
        return esc(kinds.join(' / '));
    }
    function resourceCategory(row) {
        return categoryPath(row);
    }
    function resourceTarget(row) {
        return primaryUrl(row) || row.resource_url || row.host_address || '-';
    }
    function reasonMeta(item) {
        var reason = String((item && item.reason) || '');
        var idMatch = reason.match(/\[신청 ID\]\s*([^\n]+)/);
        var typeMatch = reason.match(/\[신청 유형\]\s*([^\n]+)/);
        var requestedId = idMatch ? idMatch[1].trim().replace(/\s+/g, '_') : '';
        return {
            requestedId: requestedId,
            systemAction: typeMatch ? typeMatch[1].trim() : '',
            cleanReason: reason
                .replace(/\[신청 ID\]\s*[^\n]*\n?/g, '')
                .replace(/\[신청 유형\]\s*[^\n]*\n?/g, '')
                .trim()
        };
    }
    function requestCategoryAndAction(item) {
        var meta = reasonMeta(item);
        var action = meta.systemAction || '';
        var parts = action.split(/\s*-\s*/);
        if (parts.length >= 2) {
            return {
                category: parts.shift().trim() || '-',
                action: parts.join(' - ').trim() || '-'
            };
        }
        return {
            category: item.request_type_label || requestTypeLabel(item.request_type === '삭제' ? 'delete' : 'use'),
            action: action || '-'
        };
    }
    function isInternalRequestResource(row) {
        return String((row && (row.resource_url || row.primary_url || row.host_address)) || '').trim() === '__internal_user_id_request__';
    }
    function detailResourceTarget(row, item) {
        var meta = reasonMeta(item);
        if (isInternalRequestResource(row)) return meta.requestedId || meta.systemAction || row.resource_name || '-';
        return resourceTarget(row);
    }
    function timelineDate(value) {
        return value ? String(value).replace('T', ' ').slice(0, 16) : '';
    }
    function renderApprovalTimeline(item, approvals) {
        var steps = [{
            role: '기안',
            actor: item.requester_name || item.requester_emp_no || '신청자',
            status: '기안',
            time: timelineDate(item.submitted_at || item.created_at),
            note: item.request_no || ''
        }];
        (approvals || []).forEach(function (row) {
            var status = row.approval_status || '-';
            var actedAt = timelineDate(row.acted_at || row.approved_at || row.rejected_at || row.updated_at);
            steps.push({
                role: row.phase_name || row.phase_code || '승인',
                actor: row.approver_name || row.approver_emp_no || '승인자',
                status: status,
                time: actedAt || (status === '승인대기' || status === '승인 대기' ? '대기 중' : ''),
                note: row.opinion || row.rejected_reason || ''
            });
        });
        return '<div class="approval-stepper">' + steps.map(function (step, idx) {
            var label = step.actor + ' ' + step.status;
            if (step.role === '기안') label = step.actor + ' 기안';
            return '' +
                '<div class="approval-step approval-step-' + esc(statusStateClass(step.status)) + '">' +
                    '<div class="approval-step-marker">' + esc(String(idx + 1)) + '</div>' +
                    '<div class="approval-step-body">' +
                        '<strong>' + esc(label) + '</strong>' +
                        '<span>' + esc(step.role) + (step.time ? ' · ' + esc(step.time) : '') + '</span>' +
                        (step.note ? '<p>' + esc(step.note) + '</p>' : '') +
                    '</div>' +
                '</div>' +
                (idx < steps.length - 1 ? '<div class="approval-step-arrow" aria-hidden="true">→</div>' : '');
        }).join('') + '</div>';
    }
    function renderResourceStatusTable(items, canAct, item) {
        if (!items.length) return '<div class="empty-state compact">자원 항목이 없습니다.</div>';
        var hasCheck = canAct && items.some(function (row) { return row.item_status === '승인대기'; });
        return '<div class="request-item-table-wrap"><table class="request-item-table">' +
            '<thead><tr>' +
                (hasCheck ? '<th class="request-item-check-cell" aria-label="선택"></th>' : '') +
                '<th class="request-item-name-cell">자원</th>' +
                '<th class="request-item-target-cell">대상</th>' +
                '<th class="request-item-status-cell">상태</th>' +
                '<th class="request-item-reason-cell">반려 사유</th>' +
            '</tr></thead><tbody>' + items.map(function (row) {
                var canCheck = canAct && row.item_status === '승인대기';
                return '<tr data-item-id="' + esc(row.id) + '">' +
                    (hasCheck ? '<td class="request-item-check-cell">' + (canCheck ? '<input type="checkbox" class="request-item-check" value="' + esc(row.id) + '" aria-label="' + esc(row.resource_name || '자원') + ' 선택">' : '') + '</td>' : '') +
                    '<td class="request-item-name-cell"><strong>' + esc(row.resource_name || '-') + '</strong></td>' +
                    '<td class="request-item-target-cell"><span class="request-item-target">' + esc(detailResourceTarget(row, item)) + '</span></td>' +
                    '<td class="request-item-status-cell">' + formatStatusPlain(row.item_status || '-') + '</td>' +
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
        var meta = reasonMeta(item);
        if (item.delegated) approverText += ' <span class="delegation-chip">대무 승인</span>';
        var categoryAction = requestCategoryAndAction(item);
        return '' +
            '<div class="request-detail-summary">' +
                '<div>' +
                    '<span class="detail-kicker">신청 정보</span>' +
                    '<strong class="detail-title">' + esc(item.request_no || '-') + '</strong>' +
                    '<span class="detail-subtitle">' + esc(requestPeriodText(item)) + '</span>' +
                '</div>' +
                '<div class="detail-summary-status">' + formatStatus(item.request_status || '-') + '</div>' +
            '</div>' +
            '<div class="detail-box detail-box-main">' +
                '<div class="detail-box-title"><strong>기본 정보</strong><span>' + esc(resourceCount) + '개 자원</span></div>' +
                '<div class="detail-kv-grid">' +
                    '<div class="detail-kv"><span>신청 구분</span><strong>' + esc(categoryAction.category) + '</strong></div>' +
                    '<div class="detail-kv"><span>신청 작업</span><strong>' + esc(categoryAction.action) + '</strong></div>' +
                    '<div class="detail-kv"><span>신청 유형</span><strong>' + esc(item.request_type_label || requestTypeLabel(item.request_type === '삭제' ? 'delete' : 'use')) + '</strong></div>' +
                    '<div class="detail-kv"><span>신청자</span><strong>' + esc(item.requester_name || '-') + '</strong></div>' +
                    '<div class="detail-kv"><span>승인자</span><strong>' + approverText + '</strong></div>' +
                    '<div class="detail-kv"><span>긴급 여부</span><strong>' + esc(Number(item.emergency_flag || 0) ? '긴급' : '일반') + '</strong></div>' +
                    '<div class="detail-kv"><span>제출일</span><strong>' + esc(item.submitted_at || item.created_at || '-') + '</strong></div>' +
                    (meta.systemAction ? '<div class="detail-kv"><span>신청 작업</span><strong>' + esc(meta.systemAction) + '</strong></div>' : '') +
                    (meta.requestedId ? '<div class="detail-kv"><span>신청 ID</span><strong>' + esc(meta.requestedId) + '</strong></div>' : '') +
                    (item.delegated ? '<div class="detail-kv"><span>원 승인자</span><strong>' + esc(item.delegated_from_name || '-') + '</strong></div>' : '') +
                '</div>' +
                '<div class="detail-reason"><span>신청 사유</span><p>' + esc(meta.cleanReason || '-') + '</p></div>' +
            '</div>' +
            '<div class="detail-box"><div class="detail-box-title"><strong>자원별 상태</strong><span>' + esc(items.length) + '건</span></div>' +
            renderResourceStatusTable(items, canAct, item) +
            (canAct && pendingItems.length ? '<div class="detail-actions"><button type="button" class="action-chip action-primary" data-detail-action="approve-all" data-id="' + esc(item.id) + '">전체 승인</button><button type="button" class="action-chip action-danger" data-detail-action="reject-all" data-id="' + esc(item.id) + '">전체 반려</button><span class="detail-actions-divider"></span><button type="button" class="action-chip action-primary" data-detail-action="approve-selected" data-id="' + esc(item.id) + '">선택 승인</button><button type="button" class="action-chip action-danger" data-detail-action="reject-selected" data-id="' + esc(item.id) + '">선택 반려</button></div>' : '') +
            '</div>' +
            '<div class="detail-box"><div class="detail-box-title"><strong>승인 타임라인</strong><span>' + esc(approvals.length + 1) + '단계</span></div>' + renderApprovalTimeline(item, approvals) + '</div>';
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
            var actions = ['<button class="action-chip action-muted request-detail-icon-button" data-action="detail" data-id="' + row.id + '" aria-label="상세" title="상세"><img src="/static/image/svg/free-icon-font-summary-check.svg" alt="" aria-hidden="true"></button>'];
            if (state.segment === 'mine' && (row.request_status === '승인대기' || row.request_status === '제출')) actions.push('<button class="action-chip action-danger" data-action="cancel" data-id="' + row.id + '">취소</button>');
            if (state.segment === 'mine' && (row.request_status === '반려' || row.request_status === '만료')) actions.push('<button class="action-chip action-primary" data-action="reapply" data-id="' + row.id + '">재신청</button>');
            if (canApproveRequest(row)) {
                actions.push('<button class="action-chip action-primary" data-action="approve" data-id="' + row.id + '">전체 승인</button>');
                actions.push('<button class="action-chip action-danger" data-action="reject" data-id="' + row.id + '">전체 반려</button>');
            }
            var emergency = Number(row.emergency_flag || 0) ? '긴급' : '일반';
            return '<tr>' +
                '<td>' + esc(row.submitted_at || row.created_at || '-') + '</td>' +
                '<td><strong>' + esc(row.request_no || '-') + '</strong><span class="ac-meta">' + esc(requestPeriodText(row)) + '</span></td>' +
                '<td>' + esc(row.request_type_label || requestTypeLabel(row.request_type === '삭제' ? 'delete' : 'use')) + '</td>' +
                '<td class="request-count-cell"><strong>' + esc(row.resource_count || 0) + '개</strong></td>' +
                '<td class="request-status-cell">' + formatStatus(row.request_status || '-') + '</td>' +
                '<td><strong>' + esc(approvalStageLabel(row)) + '</strong><span class="ac-meta">' + esc(row.approver_name || '-') + (row.delegated ? ' / 대무' : '') + '</span></td>' +
                '<td>' + esc(row.requester_name || '-') + '</td>' +
                '<td>' + esc(emergency) + '</td>' +
                '<td><span class="action-stack">' + actions.join(' ') + '</span></td>' +
                '</tr>';
        }).join('');
        Array.prototype.slice.call(body.querySelectorAll('tr')).forEach(function (tr, index) {
            var categoryAction = requestCategoryAndAction(rows[index] || {});
            if (tr.children[2]) tr.children[2].textContent = categoryAction.category;
            var actionCell = document.createElement('td');
            actionCell.textContent = categoryAction.action;
            tr.insertBefore(actionCell, tr.children[3] || null);
        });
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
        return Promise.all([fetchJson('/api/access-control/resources'), fetchJson('/api/session/me'), fetchJson('/api/work-operations')]).then(function (results) {
            state.resources = results[0].rows || [];
            state.sessionUser = (results[1].user || {});
            state.workOperations = results[2].items || results[2].rows || [];
            populateWorkOperationFilter();
            populateCategoryFilter();
            syncCategoryTabs();
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
        if (!actionReady()) return '신청 유형을 먼저 선택하세요.';
        if (isUserIdRequestFlow()) {
            var id = normalizeRequestedUserId(qs('request-user-id') && qs('request-user-id').value);
            var idMessage = validateRequestedUserId(id);
            if (idMessage) return idMessage;
            if (!state.userIdAvailable || state.userIdChecked !== id) return '사용자 ID 중복 점검을 완료하세요.';
        }
        if (requiresResourceSelection() && !state.selectedIds.length) return '신청 대상 자원을 선택하세요.';
        if (!reason) return '신청 사유를 입력하세요.';
        if (reason.length < REASON_MIN_LENGTH) return (isDeleteRequestMode() ? '삭제 사유' : '신청 사유') + '는 10자 이상 입력하세요.';
        if (!requiresPeriod()) return '';
        if (!qs('request-start-date').value) return '사용 시작일을 입력하세요.';
        if (!isPermanentMode() && !qs('request-end-date').value) return '사용 종료일을 입력하세요.';
        if (!isPermanentMode() && qs('request-start-date').value > qs('request-end-date').value) return '시작일은 종료일보다 늦을 수 없습니다.';
        return '';
    }
    function openConfirm(payload) {
        var isDelete = payload.request_type === 'delete';
        var period = payload.request_period_type === 'user_id_request' ? '사용자 ID 중복 점검 후 처리' : (payload.request_period_type === 'system_action' ? '계정 작업 승인 후 처리' : (isDelete ? '삭제 승인 후 권한 회수' : formatPeriod(payload.request_start_date, payload.request_end_date)));
        var approver = qs('request-approver').value || '-알 수 없음-';
        var emergency = payload.emergency_flag ? '긴급' : '일반';
        var displayLabel = requestDisplayLabel(payload);
        var reason = payload.reason || '-';
        if (reason.length > 120) reason = reason.slice(0, 120) + '...';
        state.pendingPayload = payload;
        qs('request-confirm-title').textContent = isDelete ? '접근 삭제 신청 확인' : '접근 사용 신청 확인';
        qs('request-confirm-body').innerHTML = '' +
            '<div class="confirm-summary-card">' +
                '<div class="confirm-metric"><span>' + esc(payload.resource_ids.length ? '신청 자원' : '신청 대상') + '</span><strong>' + esc(payload.resource_ids.length ? (payload.resource_ids.length + '개') : '내 사용자 ID') + '</strong></div>' +
                '<div class="confirm-state"><span class="confirm-state-dot"></span>' + esc(displayLabel) + ' 승인 대기 생성</div>' +
            '</div>' +
            '<div class="confirm-detail-grid">' +
                '<div class="confirm-row"><span>신청 유형</span><strong>' + esc(displayLabel) + '</strong></div>' +
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
        var today = formatDate(new Date());
        var reason = qs('request-reason').value.trim();
        var systemAction = isSystemRequestMode() ? (state.systemAction || '') : '';
        var requestedUserId = isUserIdRequestFlow() ? normalizeRequestedUserId(qs('request-user-id') && qs('request-user-id').value) : '';
        if (message) { setMessage(message, 'error'); return; }
        if (systemAction && reason.indexOf('[신청 유형]') !== 0) {
            reason = '[신청 유형] ' + systemAction + '\n\n' + reason;
        }
        if (requestedUserId && reason.indexOf('[신청 ID]') < 0) {
            reason = '[신청 ID] ' + requestedUserId + '\n' + reason;
        }
        var needsPeriod = requiresPeriod();
        var needsResource = requiresResourceSelection();
        openConfirm({
            request_type: state.requestType,
            resource_ids: needsResource ? state.selectedIds.slice() : [],
            reason: reason,
            system_action: systemAction,
            requested_user_id: requestedUserId,
            request_start_date: needsPeriod ? qs('request-start-date').value : today,
            request_end_date: needsPeriod ? (isPermanentMode() ? PERMANENT_END_DATE : qs('request-end-date').value) : today,
            request_period_type: needsPeriod ? (isPermanentMode() ? 'permanent' : 'range') : (!needsResource ? 'user_id_request' : (isDeleteRequestMode() ? 'delete' : 'system_action')),
            permanent_access: (needsPeriod && isPermanentMode()) ? 1 : 0,
            emergency_flag: qs('request-emergency-flag').value === '1' ? 1 : 0
        });
    }
    function performSubmit() {
        if (!state.pendingPayload) return;
        var btn = qs('request-confirm-submit');
        var originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '제출 중...';
        var submittedLabel = requestDisplayLabel(state.pendingPayload);
        postJson('/api/access-control/requests', state.pendingPayload)
            .then(function () {
                closeConfirm();
                state.selectedIds = [];
                qs('request-reason').value = '';
                setFormStep(1);
                renderSelected();
                renderResources();
                switchSegment('mine');
                switchMainTab('status');
                setTableState('신청 목록을 불러오는 중입니다.');
                setMessage(submittedLabel + '이 제출되었습니다.', 'success');
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
            setRequestType(item.request_type === '삭제' ? 'delete' : 'use', false);
            (item.resource_ids || [item.resource_id]).forEach(addSelected);
            qs('request-reason').value = item.reason || '';
            state.periodMode = item.request_type === '삭제' ? 'range' : (isPermanentEndDate(item.request_end_date) ? 'permanent' : 'range');
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
        var form = qs('request-form');
        Array.prototype.slice.call(document.querySelectorAll('.request-main-tab')).forEach(function (button) {
            button.addEventListener('click', function () { switchMainTab(button.getAttribute('data-request-tab')); });
        });
        form.noValidate = true;
        form.addEventListener('submit', submitRequest);
        Array.prototype.slice.call(document.querySelectorAll('.request-step')).forEach(function (button) {
            button.addEventListener('click', function () {
                var target = Number(button.getAttribute('data-request-step')) || 1;
                var current = state.currentStep || 1;
                var message;
                if (target > current) {
                    message = validateStep(current);
                    if (message) { setMessage(message, 'error'); return; }
                    if (target > current + 1) {
                        message = validateStep(current + 1);
                        if (message) { setMessage(message, 'error'); return; }
                    }
                }
                setFormStep(target);
                setMessage('');
            });
        });
        qs('request-step-next').addEventListener('click', function () {
            var message = validateStep(state.currentStep || 1);
            if (message) { setMessage(message, 'error'); return; }
            setFormStep((state.currentStep || 1) + 1);
            setMessage('');
        });
        qs('request-step-prev').addEventListener('click', function () {
            setFormStep((state.currentStep || 1) - 1);
            setMessage('');
        });
        Array.prototype.slice.call(document.querySelectorAll('.system-request-option')).forEach(function (button) {
            button.addEventListener('click', function () {
                setSystemAction(button.getAttribute('data-system-action'), button.getAttribute('data-request-type'), button.getAttribute('data-flow'));
                setMessage('');
            });
        });
        if (qs('request-user-id')) {
            qs('request-user-id').addEventListener('input', function () {
                state.requestedUserId = normalizeRequestedUserId(qs('request-user-id').value);
                resetUserIdCheck();
            });
        }
        if (qs('request-user-id-check')) {
            qs('request-user-id-check').addEventListener('click', checkRequestedUserId);
        }
        if (qs('request-action-change')) {
            qs('request-action-change').addEventListener('click', function () {
                clearRequestAction();
                setMessage('신청 유형을 다시 선택하세요.', 'success');
            });
        }
        qs('request-table-body').addEventListener('click', handleTableAction);
        qs('request-table-state').addEventListener('click', function (event) {
            var button = event.target.closest('button[data-switch-main-tab]');
            if (button) switchMainTab(button.getAttribute('data-switch-main-tab'));
        });
        qs('request-resource-search').addEventListener('input', function () { applyResourceFilters(); renderResources(); });
        qs('request-kind-filter').addEventListener('change', function () { applyResourceFilters(); renderResources(); });
        qs('request-category-filter').addEventListener('change', function () {
            state.category = qs('request-category-filter').value || '';
            if (state.category !== '관리콘솔') state.categoryDetail = '';
            else state.workOperationCode = '';
            syncCategoryTabs();
            applyResourceFilters();
            renderResources();
        });
        if (qs('request-category-detail-filter')) {
            qs('request-category-detail-filter').addEventListener('change', function () {
                state.categoryDetail = normalizeConsoleGroup(qs('request-category-detail-filter').value || '');
                applyResourceFilters();
                renderResources();
            });
        }
        if (qs('request-work-operation-filter')) {
            qs('request-work-operation-filter').addEventListener('change', function () {
                state.workOperationCode = qs('request-work-operation-filter').value || '';
                applyResourceFilters();
                renderResources();
            });
        }
        qs('request-status-filter').addEventListener('change', function () { applyResourceFilters(); renderResources(); });
        qs('request-hide-owned').addEventListener('change', function () { applyResourceFilters(); renderResources(); });
        Array.prototype.slice.call(document.querySelectorAll('input[name="requestType"]')).forEach(function (input) {
            input.addEventListener('change', function () {
                setRequestType(input.value, true);
                setMessage('');
            });
        });
        Array.prototype.slice.call(document.querySelectorAll('.request-category-tabs .system-tab-btn[data-category]')).forEach(function (button) {
            button.addEventListener('click', function () {
                state.category = button.getAttribute('data-category') || '';
                if (state.category !== '관리콘솔') state.categoryDetail = '';
                else state.workOperationCode = '';
                clearRequestAction();
                syncCategoryTabs();
                applyResourceFilters();
                renderResources();
            });
        });
        qs('request-resource-prev').addEventListener('click', function () { if (state.resourcePage > 1) { state.resourcePage--; renderResources(); } });
        qs('request-resource-next').addEventListener('click', function () { state.resourcePage++; renderResources(); });
        qs('request-resource-page-numbers').addEventListener('click', function (event) {
            var button = event.target.closest('button[data-resource-page]');
            var page;
            if (!button) return;
            page = parseInt(button.getAttribute('data-resource-page'), 10);
            if (!page || page === state.resourcePage) return;
            state.resourcePage = page;
            renderResources();
        });
        qs('request-select-page-check').addEventListener('change', function (event) { event.target.checked ? selectRows(pageRows(), '현재 페이지') : removeRows(pageRows()); });
        qs('request-reset-filters').addEventListener('click', function () {
            qs('request-resource-search').value = '';
            qs('request-kind-filter').value = '';
            state.categoryDetail = '';
            state.workOperationCode = '';
            if (qs('request-category-detail-filter')) qs('request-category-detail-filter').value = '';
            if (qs('request-work-operation-filter')) qs('request-work-operation-filter').value = '';
            syncCategoryTabs();
            qs('request-status-filter').value = '';
            syncSearchSelect(document);
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
        syncRequestTypeUI();
        syncPeriodMode();
        setFormStep(1);
        loadBaseData().then(loadRequests).catch(function (err) { setTableState(err.message); });
    });
})();

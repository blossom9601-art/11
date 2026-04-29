(function(){
    'use strict';

    var API = '/admin/auth/chat-policy';
    var statusEl = document.getElementById('chat-policy-status');
    var badgeEl = document.getElementById('chat-policy-badge');
    var formEl = document.getElementById('chat-policy-form');
    var saveBtn = document.getElementById('chat-policy-save');
    var reloadBtn = document.getElementById('chat-policy-reload');
    var defaultsBtn = document.getElementById('chat-policy-defaults');

    function byId(id){ return document.getElementById(id); }
    function setStatus(text, isError){
        if (!statusEl) return;
        statusEl.textContent = text || '';
        statusEl.style.color = isError ? '#b91c1c' : '#6b7280';
    }
    function setBadge(state){
        if (!badgeEl) return;
        if (state === 'ok') {
            badgeEl.textContent = '활성';
            badgeEl.classList.add('configured');
            badgeEl.classList.remove('not-configured');
        } else {
            badgeEl.textContent = '미설정';
            badgeEl.classList.add('not-configured');
            badgeEl.classList.remove('configured');
        }
    }

    function getBool(policy, fallback){
        if (!policy || typeof policy.enabled === 'undefined') return !!fallback;
        return !!policy.enabled;
    }

    function getValue(policy, fallback){
        if (!policy || typeof policy.value === 'undefined') return fallback;
        return policy.value;
    }

    function flatten(items){
        var map = {};
        (items || []).forEach(function(item){ map[item.policyKey] = item.value || {}; });
        return map;
    }

    function fillForm(policies){
        byId('policy-chat-enabled').checked = getBool(policies['basic.chat_enabled'], true);
        byId('policy-dm-enabled').checked = getBool(policies['basic.dm_enabled'], true);
        byId('policy-channel-enabled').checked = getBool(policies['basic.channel_enabled'], true);
        byId('policy-channel-creation-scope').value = getValue(policies['channel.creation_scope'], 'all_users');
        byId('policy-channel-private').checked = getBool(policies['channel.allow_private_channel'], true);
        byId('policy-channel-external').checked = getBool(policies['channel.allow_external_invite'], false);
        byId('policy-message-edit-window').value = getValue(policies['message.edit_window_minutes'], 30);
        byId('policy-message-delete').checked = getBool(policies['message.allow_delete'], true);
        byId('policy-message-read').checked = getBool(policies['message.read_receipt_enabled'], true);
        byId('policy-file-max-upload').value = getValue(policies['file.max_upload_mb'], 50);
        byId('policy-file-extensions').value = (getValue(policies['file.allowed_extensions'], []) || []).join(', ');
        byId('policy-file-preview').checked = getBool(policies['file.preview_enabled'], true);
        byId('policy-notification-mention').checked = getBool(policies['notification.mention_enabled'], true);
        byId('policy-notification-broadcast-limit').value = getValue(policies['notification.channel_broadcast_limit'], 'admins_only');
        byId('policy-notification-quiet-enabled').checked = getBool(policies['notification.quiet_hours'], false);
        byId('policy-notification-quiet-start').value = (policies['notification.quiet_hours'] || {}).start || '22:00';
        byId('policy-notification-quiet-end').value = (policies['notification.quiet_hours'] || {}).end || '07:00';
        byId('policy-retention-message-days').value = getValue(policies['retention.message_days'], 365);
        byId('policy-retention-file-days').value = getValue(policies['retention.file_days'], 180);
        byId('policy-audit-message-delete').checked = getBool(policies['audit.message_delete_log'], true);
        byId('policy-audit-file-upload').checked = getBool(policies['audit.file_upload_log'], true);
        byId('policy-audit-admin-view').value = getValue(policies['audit.admin_view_permission'], 'chat.system.admin');
    }

    function collectPolicies(){
        return {
            'basic.chat_enabled': { enabled: byId('policy-chat-enabled').checked },
            'basic.dm_enabled': { enabled: byId('policy-dm-enabled').checked },
            'basic.channel_enabled': { enabled: byId('policy-channel-enabled').checked },
            'channel.creation_scope': { value: byId('policy-channel-creation-scope').value },
            'channel.allow_private_channel': { enabled: byId('policy-channel-private').checked },
            'channel.allow_external_invite': { enabled: byId('policy-channel-external').checked },
            'message.edit_window_minutes': { value: parseInt(byId('policy-message-edit-window').value, 10) || 0 },
            'message.allow_delete': { enabled: byId('policy-message-delete').checked },
            'message.read_receipt_enabled': { enabled: byId('policy-message-read').checked },
            'file.max_upload_mb': { value: parseInt(byId('policy-file-max-upload').value, 10) || 0 },
            'file.allowed_extensions': { value: (byId('policy-file-extensions').value || '').split(',').map(function(v){ return v.trim().toLowerCase(); }).filter(Boolean) },
            'file.preview_enabled': { enabled: byId('policy-file-preview').checked },
            'notification.mention_enabled': { enabled: byId('policy-notification-mention').checked },
            'notification.channel_broadcast_limit': { value: byId('policy-notification-broadcast-limit').value },
            'notification.quiet_hours': { enabled: byId('policy-notification-quiet-enabled').checked, start: byId('policy-notification-quiet-start').value || '22:00', end: byId('policy-notification-quiet-end').value || '07:00' },
            'retention.message_days': { value: parseInt(byId('policy-retention-message-days').value, 10) || 0 },
            'retention.file_days': { value: parseInt(byId('policy-retention-file-days').value, 10) || 0 },
            'audit.message_delete_log': { enabled: byId('policy-audit-message-delete').checked },
            'audit.file_upload_log': { enabled: byId('policy-audit-file-upload').checked },
            'audit.admin_view_permission': { value: byId('policy-audit-admin-view').value || '' }
        };
    }

    function loadPolicies(){
        setStatus('정책을 불러오는 중입니다.', false);
        fetch(API, { credentials: 'same-origin' })
            .then(function(r){ return r.json(); })
            .then(function(data){
                if (data.error) throw new Error(data.error);
                var items = data.items || [];
                fillForm(flatten(items));
                setBadge(items.length ? 'ok' : 'none');
                setStatus('채팅 정책을 불러왔습니다.', false);
            })
            .catch(function(err){
                setStatus('정책 조회 실패: ' + err.message, true);
            });
    }

    function savePolicies(restoreDefaults){
        setStatus(restoreDefaults ? '기본값을 복원하는 중입니다.' : '정책을 저장하는 중입니다.', false);
        saveBtn.disabled = true;
        fetch(API, {
            method: 'PUT',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ policies: collectPolicies(), restoreDefaults: !!restoreDefaults })
        })
            .then(function(r){ return r.json(); })
            .then(function(data){
                if (!data.success) throw new Error(data.message || '저장 실패');
                setStatus(restoreDefaults ? '기본값을 복원했습니다.' : '채팅 정책을 저장했습니다.', false);
                loadPolicies();
            })
            .catch(function(err){
                setStatus('저장 실패: ' + err.message, true);
            })
            .finally(function(){
                saveBtn.disabled = false;
            });
    }

    function init(){
        if (!formEl) return;
        formEl.addEventListener('submit', function(e){ e.preventDefault(); savePolicies(false); });
        if (saveBtn) saveBtn.addEventListener('click', function(){ savePolicies(false); });
        if (reloadBtn) reloadBtn.addEventListener('click', loadPolicies);
        if (defaultsBtn) defaultsBtn.addEventListener('click', function(){ savePolicies(true); });
        // Per-section save buttons
        var sectionBtns = document.querySelectorAll('.btn-save-sm[data-cp-section]');
        for (var i = 0; i < sectionBtns.length; i++) {
            sectionBtns[i].addEventListener('click', function(){ savePolicies(false); });
        }
        loadPolicies();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
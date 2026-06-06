(function(){
'use strict';

var API = '/api/security/account-policy';
var policy = null;
var categoryEditing = false;
var groupEditing = false;
var linuxShellEditing = true;
var linuxProtectionEditing = true;
var linuxValidationEditing = true;
var windowsTypeEditing = false;
var windowsRuleEditing = false;
var windowsTemplateEditing = false;
var groupExpanded = {};
var activeOs = 'common';
var DELETE_PROTECTED_DEFAULTS = [
    'root','bin','daemon','adm','lp','sync','shutdown','halt','mail','operator',
    'games','ftp','nobody','dbus','sshd','chrony','polkitd','sssd',
    'systemd-resolve','systemd-coredump'
];

function $(sel, root){ return (root || document).querySelector(sel); }
function $all(sel, root){ return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(s){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]); }); }
function clean(v){ return String(v == null ? '' : v).trim(); }
function toast(msg, type){
    if (window.showSettingsAlert) {
        window.showSettingsAlert(msg, type);
        return;
    }
    if (window.showToast) {
        window.showToast(msg, type);
        return;
    }
    showPolicyAlert(msg, type);
}

function defaultWindowsPolicy(){
    return {
        account_types: [
            {name:'서비스 계정', prefix:'svc_', example:'svc_oracle01', template:'ServiceLogonOnly', description:'서비스 실행 계정', required:'만료일, 소유부서, 담당자, 승인 이력'},
            {name:'운영자 계정', prefix:'adm_', example:'adm_win001', template:'RDPAllowed', description:'운영자 원격 접속', required:'소유부서, 담당자, 승인 이력'},
            {name:'벤더 계정', prefix:'vnd_', example:'vnd_company001', template:'NoInteractiveLogin', description:'외주/벤더 작업 계정', required:'만료일, 소유부서, 담당자, 승인 이력'},
            {name:'임시 계정', prefix:'tmp_', example:'tmp_work001', template:'NoInteractiveLogin', description:'기간제 임시 작업 계정', required:'만료일, 소유부서, 담당자, 승인 이력'}
        ],
        group_rules: [
            {category:'DB', group:'Oracle', local_group:'LUM-DB-Oracle', ad_group:'LUM-DB-Oracle', template:'ServiceLogonOnly'},
            {category:'DB', group:'PostgreSQL', local_group:'LUM-DB-PostgreSQL', ad_group:'LUM-DB-PostgreSQL', template:'ServiceLogonOnly'},
            {category:'WEB/WAS', group:'IIS', local_group:'LUM-WEB-IIS', ad_group:'LUM-WEB-IIS', template:'ServiceLogonOnly'},
            {category:'WEB/WAS', group:'Tomcat', local_group:'LUM-WEB-Tomcat', ad_group:'LUM-WEB-Tomcat', template:'ServiceLogonOnly'},
            {category:'보안', group:'Wazuh', local_group:'LUM-SEC-Wazuh', ad_group:'LUM-SEC-Wazuh', template:'NoInteractiveLogin'},
            {category:'운영자/사용자', group:'Windows Admin', local_group:'LUM-OPS-WindowsAdmin', ad_group:'LUM-OPS-WindowsAdmin', template:'RDPAllowed'}
        ],
        rights_templates: [
            {name:'ServiceLogonOnly', rights:'Log on as a service, Deny log on locally, Deny log on through Remote Desktop Services'},
            {name:'BatchLogonOnly', rights:'Log on as a batch job, Deny log on locally, Deny log on through Remote Desktop Services'},
            {name:'RDPAllowed', rights:'Allow Remote Desktop Services, No direct account permissions'},
            {name:'LocalAdmin', rights:'Local Administrators group membership by approval only'},
            {name:'ReadOnlyOperator', rights:'Read-only operator group membership'},
            {name:'NoInteractiveLogin', rights:'Deny log on locally, Deny log on through Remote Desktop Services, Deny access from the network'}
        ]
    };
}

function defaultCommonPolicy(){
    return {
        communication: {
            ap_server:'https://192.168.56.106',
            secondary_ap_server:'',
            port:443,
            tls_mode:'required',
            verify_certificate:true,
            interval_seconds:60,
            connect_timeout_seconds:10,
            request_timeout_seconds:30,
            reconnect_backoff_seconds:60,
            agent_key_rotation_days:90
        },
        collection: {
            interfaces:true,
            accounts:true,
            permissions:true,
            firewall:true,
            performance:true,
            vulnerabilities:true,
            packages:true,
            processes:true,
            retry_count:3,
            delay_tolerance_minutes:10,
            retention_days:30,
            quiet_hours:''
        },
        collection_intervals: {interfaces:720, accounts:720, permissions:720, firewall:720, performance:1, vulnerabilities:720, packages:720, processes:720},
        performance: {cpu_limit_percent:10, memory_limit_mb:256, disk_io_limit_mb:20, network_limit_mb:20, max_cpu_seconds:30, concurrent_jobs:2, batch_size:100, sampling_seconds:60, transfer_compression:true},
        security: {
            agent_auth:true,
            command_verify:true,
            mask_secrets:true,
            integrity_check:true,
            auth_mode:'token_tls',
            command_policy:'signed_only',
            secret_masking_level:'strict',
            integrity_action:'block',
            failure_action:'retry_then_block'
        },
        log: {level:'INFO', retention_days:30, compress:true, max_size_mb:100, audit_forwarding:true, local_encryption:true, masking_patterns:'password, secret, token', forward_retry_limit:5},
        offline: {enabled:true, local_cache:true, retry_count:5, retry_interval_seconds:60, max_offline_minutes:1440, cache_encryption:true, offline_alert_minutes:30, sync_mode:'delta'}
    };
}

var POLICY_ACTION_OPTIONS = [
    {value:'warn', label:'경고'},
    {value:'approval', label:'승인 요청'},
    {value:'auto_lock', label:'자동 잠금'},
    {value:'auto_disable', label:'자동 비활성화'},
    {value:'auto_revoke', label:'자동 권한 회수'},
    {value:'auto_rollback', label:'자동 원복'}
];

var POLICY_APPLY_OPTIONS = [
    {value:'immediate', label:'즉시 적용'},
    {value:'scheduled', label:'스케줄 적용'}
];

var POLICY_CONTROL_DEFS = {
    common: [
        {title:'비밀번호 정책', desc:'비밀번호 수명, 복잡도, 잠금 임계값을 공통 기준으로 점검합니다.', items:[
            {key:'password_min_length', name:'최소 비밀번호 길이', fields:[{key:'min_length', label:'길이', type:'number', value:12, unit:'자'}]},
            {key:'password_complexity', name:'비밀번호 복잡도 사용', fields:[{key:'level', label:'기준', type:'select', value:'upper_lower_number_special', options:[
                {value:'upper_lower_number_special', label:'대/소문자+숫자+특수문자'},
                {value:'upper_lower_number', label:'대/소문자+숫자'},
                {value:'letter_number_special', label:'문자+숫자+특수문자'},
                {value:'letter_number', label:'문자+숫자'},
                {value:'number_special', label:'숫자+특수문자'}
            ]}]},
            {key:'password_max_age', name:'비밀번호 최대 사용기간', fields:[{key:'days', label:'기간', type:'number', value:90, unit:'일'}]},
            {key:'password_min_age', name:'비밀번호 최소 사용기간', fields:[{key:'days', label:'기간', type:'number', value:1, unit:'일'}]},
            {key:'password_history', name:'이전 비밀번호 재사용 금지 개수', fields:[{key:'count', label:'개수', type:'number', value:5, unit:'개'}]},
            {key:'lock_threshold', name:'계정 잠금 임계값', fields:[{key:'count', label:'실패', type:'number', value:5, unit:'회'}]},
            {key:'lock_duration', name:'계정 잠금 유지시간', fields:[{key:'minutes', label:'시간', type:'number', value:30, unit:'분'}]},
            {key:'lock_counter_reset', name:'잠금 카운터 초기화 시간', fields:[{key:'minutes', label:'시간', type:'number', value:30, unit:'분'}]}
        ]},
        {title:'휴면 계정 정책', desc:'미접속 계정을 탐지하고 단계별 조치합니다.', items:[
            {key:'idle_detect', name:'N일 미접속 계정 탐지', fields:[{key:'days', label:'미접속', type:'number', value:90, unit:'일'}]},
            {key:'idle_lock', name:'N일 미접속 계정 잠금', fields:[{key:'days', label:'미접속', type:'number', value:120, unit:'일'}]},
            {key:'idle_disable', name:'N일 미접속 계정 비활성화', fields:[{key:'days', label:'미접속', type:'number', value:150, unit:'일'}]},
            {key:'idle_delete_candidate', name:'N일 미접속 계정 삭제 후보 등록', fields:[{key:'days', label:'미접속', type:'number', value:180, unit:'일'}]},
            {key:'idle_notice', name:'휴면 예정 알림 발송', fields:[{key:'days_before', label:'사전 알림', type:'number', value:7, unit:'일 전'}]}
        ]},
        {title:'계정 생성 정책', desc:'계정 생성 시 승인과 필수 메타데이터를 강제합니다.', items:[
            {key:'create_approval', name:'계정 생성 승인 필수'},
            {key:'comment_required', name:'계정 설명(Comment) 필수'},
            {key:'manager_required', name:'담당자 정보 필수'},
            {key:'department_required', name:'부서 정보 필수'},
            {key:'expiration_required', name:'만료일 필수'},
            {key:'first_login_password_change', name:'생성 후 최초 로그인 시 비밀번호 변경'}
        ]},
        {title:'권한 정책', desc:'관리자 권한과 긴급 계정 사용을 승인 기반으로 통제합니다.', items:[
            {key:'admin_approval', name:'관리자 권한 승인 필수'},
            {key:'temporary_privilege', name:'기간제 권한 부여'},
            {key:'privilege_auto_revoke', name:'만료 시 자동 권한 회수', defaultAction:'auto_revoke'},
            {key:'break_glass', name:'긴급 계정(Break Glass) 관리'},
            {key:'admin_usage_trace', name:'관리자 권한 사용 이력 추적'}
        ]},
        {title:'그룹 정책', desc:'그룹 생성, 삭제, 변경과 중요 그룹 변경 알림을 관리합니다.', items:[
            {key:'group_create_approval', name:'그룹 생성 승인'},
            {key:'group_delete_approval', name:'그룹 삭제 승인'},
            {key:'group_change_approval', name:'그룹 변경 승인'},
            {key:'critical_group_notice', name:'중요 그룹 변경 시 알림'}
        ]},
        {title:'감사 정책', desc:'계정과 권한 변경 이력을 감사로그로 보관합니다.', items:[
            {key:'audit_account_create', name:'계정 생성 이력'},
            {key:'audit_account_delete', name:'계정 삭제 이력'},
            {key:'audit_account_lock', name:'계정 잠금 이력'},
            {key:'audit_account_unlock', name:'계정 해제 이력'},
            {key:'audit_group_change', name:'그룹 변경 이력'},
            {key:'audit_admin_change', name:'관리자 권한 변경 이력'},
            {key:'audit_login_success', name:'로그인 성공 이력'},
            {key:'audit_login_failure', name:'로그인 실패 이력'}
        ]}
    ],
    linux: [
        {title:'계정 정책', desc:'Linux/Unix 계정 상태와 UID/Shell 기준을 점검합니다.', items:[
            {key:'root_login', name:'root 로그인 허용 여부'},
            {key:'ssh_root_login', name:'SSH root 로그인 허용 여부'},
            {key:'uid0_detect', name:'UID 0 계정 탐지'},
            {key:'uid_duplicate_detect', name:'UID 중복 계정 탐지'},
            {key:'expiration_enforce', name:'계정 만료일 강제'},
            {key:'shell_login_audit', name:'shell 사용 가능 계정 점검'},
            {key:'nologin_account_manage', name:'로그인 불가 계정 관리'}
        ]},
        {title:'그룹 정책', desc:'wheel/sudo 그룹과 관리자 그룹 변경을 통제합니다.', items:[
            {key:'wheel_group', name:'wheel 그룹 관리'},
            {key:'sudo_group', name:'sudo 그룹 관리'},
            {key:'admin_group_approval', name:'관리자 그룹 변경 승인'},
            {key:'group_history', name:'그룹 추가/삭제 이력 관리'}
        ]},
        {title:'SSH 정책', desc:'SSH 접속 계정과 공개키 변경을 승인 기반으로 관리합니다.', items:[
            {key:'ssh_allow_accounts', name:'SSH 로그인 허용 계정'},
            {key:'ssh_deny_accounts', name:'SSH 로그인 차단 계정'},
            {key:'server_login_allow', name:'서버별 로그인 허용 계정'},
            {key:'ssh_key_approval', name:'SSH 공개키 등록 승인'},
            {key:'ssh_key_change_detect', name:'SSH 공개키 변경 감지'},
            {key:'ssh_key_expiration', name:'SSH 공개키 만료 정책', fields:[{key:'days', label:'만료', type:'number', value:365, unit:'일'}]}
        ]},
        {title:'권한상승 정책', desc:'sudo, sudoers, su, root 전환 이력을 수집하고 승인 기반으로 반영합니다.', items:[
            {key:'sudo_approval', name:'sudo 사용 승인'},
            {key:'sudo_log_collect', name:'sudo 사용 로그 수집'},
            {key:'sudoers_change_detect', name:'sudoers 변경 감지'},
            {key:'sudoers_approval_apply', name:'sudoers 승인 기반 반영'},
            {key:'su_history', name:'su 사용 이력 추적'},
            {key:'root_switch_history', name:'root 전환 이력 추적'}
        ]},
        {title:'시스템 계정 보호', desc:'삭제 금지 계정의 삭제, 잠금, 그룹/Shell/UID 변경을 감지합니다.', items:[
            {key:'protected_delete_block', name:'삭제 금지', defaultAction:'auto_rollback'},
            {key:'protected_lock_block', name:'잠금 금지', defaultAction:'approval'},
            {key:'protected_group_change', name:'그룹 변경 감지'},
            {key:'protected_shell_change', name:'shell 변경 감지'},
            {key:'protected_uid_change', name:'UID 변경 감지'}
        ]},
        {title:'파일 정책', desc:'계정/그룹/권한 핵심 파일 변경을 탐지합니다.', items:[
            {key:'passwd_change', name:'/etc/passwd 변경 감지'},
            {key:'shadow_change', name:'/etc/shadow 변경 감지'},
            {key:'group_change', name:'/etc/group 변경 감지'},
            {key:'gshadow_change', name:'/etc/gshadow 변경 감지'},
            {key:'sudoers_change', name:'/etc/sudoers 변경 감지'},
            {key:'ssh_key_file_change', name:'SSH Key 변경 감지'}
        ]}
    ],
    windows: [
        {title:'로컬 계정 정책', desc:'기본 로컬 계정과 로컬 관리자 계정 생성을 관리합니다.', items:[
            {key:'administrator_enabled', name:'Administrator 계정 사용 여부'},
            {key:'guest_enabled', name:'Guest 계정 사용 여부'},
            {key:'admin_rename_enforce', name:'관리자 계정 이름 변경 강제'},
            {key:'local_admin_create_approval', name:'로컬 관리자 계정 생성 승인'},
            {key:'account_expiration_enforce', name:'계정 만료일 강제'}
        ]},
        {title:'로그인 정책', desc:'Windows Logon Rights를 기준으로 로그인 경로를 통제합니다.', items:[
            {key:'local_logon', name:'로컬 로그인 허용'},
            {key:'rdp_logon', name:'원격 데스크톱 로그인 허용'},
            {key:'network_logon', name:'네트워크 로그인 허용'},
            {key:'service_logon', name:'서비스 로그인 허용'},
            {key:'batch_logon', name:'배치 작업 로그인 허용'}
        ]},
        {title:'로컬 그룹 정책', desc:'권한이 높은 로컬 그룹 멤버십을 점검합니다.', items:[
            {key:'administrators_group', name:'Administrators 그룹 관리'},
            {key:'rdp_users_group', name:'Remote Desktop Users 그룹 관리'},
            {key:'backup_operators_group', name:'Backup Operators 그룹 관리'},
            {key:'event_log_readers_group', name:'Event Log Readers 그룹 관리'},
            {key:'power_users_group', name:'Power Users 그룹 관리'}
        ]},
        {title:'권한상승 정책', desc:'관리자 권한 부여와 회수, 변경 감지를 관리합니다.', items:[
            {key:'admin_privilege_approval', name:'관리자 권한 승인'},
            {key:'admin_privilege_temporary', name:'관리자 권한 기간제 부여'},
            {key:'admin_privilege_auto_revoke', name:'만료 시 자동 회수', defaultAction:'auto_revoke'},
            {key:'admin_group_change_detect', name:'관리자 그룹 변경 감지'},
            {key:'privilege_escalation_audit', name:'권한 상승 이력 수집'}
        ]},
        {title:'도메인 정책', desc:'AD 중요 그룹과 도메인 계정 상태를 점검합니다.', items:[
            {key:'domain_admins_detect', name:'Domain Admins 탐지'},
            {key:'enterprise_admins_detect', name:'Enterprise Admins 탐지'},
            {key:'domain_users_detect', name:'Domain Users 탐지'},
            {key:'domain_account_status', name:'도메인 계정 상태 점검'},
            {key:'domain_account_expiration', name:'도메인 계정 만료 점검'}
        ]},
        {title:'계정 보호 정책', desc:'Windows 기본 보호 계정의 삭제와 권한 변경을 감지합니다.', items:[
            {key:'protected_delete_block', name:'삭제 금지', defaultAction:'auto_rollback'},
            {key:'protected_rename_detect', name:'이름 변경 감지'},
            {key:'protected_privilege_change', name:'권한 변경 감지'},
            {key:'protected_group_change', name:'그룹 변경 감지'}
        ]},
        {title:'감사 정책', desc:'Windows 계정과 RDP 이벤트를 감사 대상으로 수집합니다.', items:[
            {key:'audit_login_success', name:'로그인 성공'},
            {key:'audit_login_failure', name:'로그인 실패'},
            {key:'audit_account_create', name:'계정 생성'},
            {key:'audit_account_delete', name:'계정 삭제'},
            {key:'audit_account_lock', name:'계정 잠금'},
            {key:'audit_account_unlock', name:'계정 해제'},
            {key:'audit_group_change', name:'그룹 변경'},
            {key:'audit_admin_escalation', name:'관리자 권한 상승'},
            {key:'audit_rdp_login', name:'RDP 로그인'},
            {key:'audit_rdp_logoff', name:'RDP 로그오프'}
        ]}
    ],
    exception: [
        {title:'예외 계정 정책', desc:'정책 예외가 필요한 계정 유형을 승인 기반으로 관리합니다.', items:[
            {key:'exception_account_register', name:'예외 계정 등록'},
            {key:'service_account_register', name:'서비스 계정 등록'},
            {key:'system_account_register', name:'시스템 계정 등록'},
            {key:'break_glass_register', name:'긴급 계정 등록'},
            {key:'excluded_server_register', name:'정책 제외 서버 등록'}
        ]}
    ],
    approval: [
        {title:'승인 정책', desc:'계정 생성, 변경, 삭제, 권한 변경의 승인 흐름을 관리합니다.', items:[
            {key:'create_approval_flow', name:'계정 생성 신청 → 승인 → 생성'},
            {key:'change_approval_flow', name:'계정 변경 신청 → 승인 → 변경'},
            {key:'delete_approval_flow', name:'계정 삭제 신청 → 승인 → 삭제'},
            {key:'privilege_approval_flow', name:'관리자 권한 부여 승인'},
            {key:'emergency_approval_flow', name:'긴급 계정 사후 승인'}
        ]}
    ],
    audit: [
        {title:'감사 정책', desc:'정책 변경과 계정 작업 이력을 삭제 불가 감사로그로 보관합니다.', items:[
            {key:'policy_change_history', name:'정책 변경 이력 보관'},
            {key:'operator_history', name:'작업자/승인자 기록'},
            {key:'before_after_history', name:'변경 전/후 기록'},
            {key:'server_account_history', name:'서버명/계정명/UID/GID 기록'},
            {key:'ip_reason_history', name:'IP 주소/작업사유 기록'},
            {key:'immutable_audit_log', name:'감사 로그 삭제 금지'}
        ]}
    ]
};

POLICY_CONTROL_DEFS.common = POLICY_CONTROL_DEFS.common.filter(function(group){
    return !group.items.some(function(item){
        return ['create_approval','admin_approval','group_create_approval','audit_account_create'].indexOf(item.key) >= 0;
    });
}).map(function(group){
    if(group.items.some(function(item){ return ['password_min_length','idle_detect'].indexOf(item.key) >= 0; })) {
        group.hideAction = true;
    }
    return group;
});

POLICY_CONTROL_DEFS.linux = [];
POLICY_CONTROL_DEFS.windows = [];
POLICY_CONTROL_DEFS.exception = [];
POLICY_CONTROL_DEFS.approval = [];
POLICY_CONTROL_DEFS.audit = [];

function defaultPolicyControls(){
    var result = {};
    Object.keys(POLICY_CONTROL_DEFS).forEach(function(page){
        result[page] = {};
        POLICY_CONTROL_DEFS[page].forEach(function(group){
            group.items.forEach(function(item){
                var settings = {};
                (item.fields || []).forEach(function(field){ settings[field.key] = field.value; });
                result[page][item.key] = {
                    enabled: true,
                    action: item.defaultAction || 'warn',
                    target: 'all',
                    exceptions: '',
                    apply_mode: 'scheduled',
                    settings: settings
                };
            });
        });
    });
    return result;
}

function mergePolicyControls(base, incoming){
    var result = JSON.parse(JSON.stringify(base || {}));
    Object.keys(incoming || {}).forEach(function(page){
        result[page] = result[page] || {};
        Object.keys(incoming[page] || {}).forEach(function(key){
            result[page][key] = Object.assign({}, result[page][key] || {}, incoming[page][key] || {});
            result[page][key].settings = Object.assign({}, ((result[page][key] || {}).settings || {}), (((incoming[page] || {})[key] || {}).settings || {}));
        });
    });
    return result;
}

function defaultPolicy(){
    return {
        categories: [
            {name:'DB', uid_start:1000, uid_end:1999, home_template:'/app/dbuser/{account}'},
            {name:'WEB/WAS', uid_start:2000, uid_end:2999, home_template:'/app/webuser/{account}'},
            {name:'보안', uid_start:3000, uid_end:3999, home_template:'/home/{account}'},
            {name:'미들웨어', uid_start:4000, uid_end:4999, home_template:'/home/{account}'},
            {name:'배치', uid_start:5000, uid_end:5999, home_template:'/home/{account}'},
            {name:'모니터링/백업', uid_start:6000, uid_end:6999, home_template:'/home/{account}'},
            {name:'운영자/사용자', uid_start:7000, uid_end:7999, home_template:'/home/{account}'},
            {name:'외주/벤더', uid_start:8000, uid_end:8999, home_template:'/home/{account}'},
            {name:'임시계정', uid_start:9000, uid_end:9999, home_template:'/home/{account}'}
        ],
        groups: [
            {category:'DB', name:'Oracle', gid:1010}, {category:'DB', name:'PostgreSQL', gid:1020},
            {category:'DB', name:'MySQL', gid:1030}, {category:'DB', name:'MariaDB', gid:1040},
            {category:'DB', name:'Tibero', gid:1050}, {category:'DB', name:'Altibase', gid:1060},
            {category:'DB', name:'MongoDB', gid:1070}, {category:'DB', name:'Redis', gid:1080},
            {category:'WEB/WAS', name:'Apache', gid:2010}, {category:'WEB/WAS', name:'Nginx', gid:2020},
            {category:'WEB/WAS', name:'Tomcat', gid:2030}, {category:'WEB/WAS', name:'WebLogic', gid:2040},
            {category:'WEB/WAS', name:'JEUS', gid:2050}, {category:'WEB/WAS', name:'JBoss', gid:2060},
            {category:'WEB/WAS', name:'WildFly', gid:2070}, {category:'WEB/WAS', name:'NodeJS', gid:2080},
            {category:'보안', name:'Wazuh', gid:3010}, {category:'보안', name:'SIEM', gid:3020},
            {category:'보안', name:'PAM', gid:3030}, {category:'보안', name:'EDR', gid:3040},
            {category:'보안', name:'NAC', gid:3050}, {category:'보안', name:'DLP', gid:3060}, {category:'보안', name:'IAM', gid:3070},
            {category:'미들웨어', name:'Kafka', gid:4010}, {category:'미들웨어', name:'RabbitMQ', gid:4020},
            {category:'미들웨어', name:'ActiveMQ', gid:4030}, {category:'미들웨어', name:'MQ', gid:4040},
            {category:'미들웨어', name:'Redis Cluster', gid:4050},
            {category:'배치', name:'Scheduler', gid:5010}, {category:'배치', name:'Cron', gid:5020}, {category:'배치', name:'ETL', gid:5030},
            {category:'모니터링/백업', name:'Prometheus', gid:6010}, {category:'모니터링/백업', name:'Grafana', gid:6020},
            {category:'모니터링/백업', name:'Zabbix', gid:6030}, {category:'모니터링/백업', name:'Backup', gid:6040},
            {category:'모니터링/백업', name:'Monitoring Agent', gid:6050},
            {category:'운영자/사용자', name:'Linux Admin', gid:7010}, {category:'운영자/사용자', name:'Unix Admin', gid:7020},
            {category:'운영자/사용자', name:'DB Admin', gid:7030}, {category:'운영자/사용자', name:'Security Admin', gid:7040},
            {category:'운영자/사용자', name:'Network Admin', gid:7050}
        ],
        reserved_accounts: ['adm','bin','daemon','lp','mail','nobody','operator','root','sys'],
        service_shell: '/sbin/nologin',
        operator_shell: '/bin/bash',
        common: defaultCommonPolicy(),
        windows: defaultWindowsPolicy(),
        policy_controls: defaultPolicyControls()
    };
}

function normalizePolicy(item){
    var base = defaultPolicy();
    item = item || {};
    var merged = Object.assign({}, base, item);
    merged.categories = Array.isArray(item.categories) ? item.categories : base.categories;
    merged.groups = Array.isArray(item.groups) ? item.groups : base.groups;
    merged.common = Object.assign({}, base.common, item.common || {});
    Object.keys(base.common).forEach(function(key){
        merged.common[key] = Object.assign({}, base.common[key], (item.common && item.common[key]) || {});
    });
    merged.reserved_accounts = Array.isArray(merged.reserved_accounts) ? merged.reserved_accounts : base.reserved_accounts;
    merged.protected_delete_accounts = Array.isArray(merged.protected_delete_accounts) ? merged.protected_delete_accounts : DELETE_PROTECTED_DEFAULTS.slice();
    merged.service_shell = merged.service_shell || '/sbin/nologin';
    merged.operator_shell = merged.operator_shell || '/bin/bash';
    merged.linux_validation = Object.assign({
        uid_unique:true,
        gid_exists:true,
        account_unique:true,
        reserved_block:true,
        special_char_policy:true,
        uid_range:true,
        expiration_policy:true
    }, base.linux_validation || {}, item.linux_validation || {});
    merged.windows = Object.assign({}, base.windows, item.windows || {});
    merged.windows.account_types = Array.isArray(merged.windows.account_types) ? merged.windows.account_types : base.windows.account_types;
    merged.windows.group_rules = Array.isArray(merged.windows.group_rules) ? merged.windows.group_rules : base.windows.group_rules;
    merged.windows.rights_templates = Array.isArray(merged.windows.rights_templates) ? merged.windows.rights_templates : base.windows.rights_templates;
    merged.policy_controls = mergePolicyControls(base.policy_controls, item.policy_controls || {});
    return merged;
}

async function api(url, opts){
    var o = Object.assign({method:'GET', credentials:'same-origin'}, opts || {});
    o.headers = Object.assign({'Accept':'application/json','X-Requested-With':'XMLHttpRequest'}, o.headers || {});
    if(o.body && !o.headers['Content-Type']) o.headers['Content-Type'] = 'application/json';
    var res = await fetch(url, o);
    var text = await res.text();
    var json = {};
    try { json = text ? JSON.parse(text) : {}; } catch(_) { json = {success:false, message:text}; }
    if(!res.ok || json.success === false) throw new Error(json.message || ('HTTP ' + res.status));
    return json;
}

function ensureStyle(){
    var oldStyle = $('#account-policy-page-style');
    if(oldStyle) oldStyle.parentNode.removeChild(oldStyle);
    var style = document.createElement('style');
    style.id = 'account-policy-page-style';
    style.textContent = [
        '.account-policy-panel{display:none}.account-policy-panel.is-active{display:grid}',
        '.account-policy-page{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}',
        '.account-policy-page[data-policy-page="common"]{grid-template-columns:1fr}',
        '.account-policy-page[data-policy-page="linux"]{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:16px;row-gap:24px}',
        '.account-policy-page[data-policy-page="windows"]{grid-template-columns:1fr}',
        '.account-policy-summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:18px}',
        '.account-policy-summary-grid div{border:1px solid #e2e8f0;border-radius:8px;background:#fff;padding:14px 16px}',
        '.account-policy-summary-grid strong{display:block;margin-bottom:7px;color:#0f172a;font-size:13px;font-weight:700}',
        '.account-policy-summary-grid span{display:block;color:#475569;font-size:13px;line-height:1.5}',
        '.account-policy-control-board{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;align-items:start}',
        '.account-policy-page[data-policy-page="common"] .account-policy-control-board{order:2;grid-template-columns:repeat(2,minmax(0,1fr))}',
        '.account-policy-control-card{border:1px solid #d9e2ef;border-radius:8px;background:#fff;box-shadow:0 1px 2px rgba(15,23,42,.025);overflow:hidden}',
        '.account-policy-control-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 18px;background:#fff;border-bottom:1px solid #e5eaf2}',
        '.account-policy-control-head h3{margin:0;color:#0f172a;font-size:15px;font-weight:800;letter-spacing:0}',
        '.account-policy-control-head p{margin:4px 0 0;color:#64748b;font-size:12.5px;line-height:1.35}',
        '.account-policy-control-save{height:32px;min-width:72px;border:1px solid #5661e8;border-radius:7px;background:#6366F1;color:#fff;font-size:13px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;box-shadow:none}',
        '.account-policy-control-save svg{width:14px;height:14px}.account-policy-control-save:hover{background:#4f46e5}',
        '.account-policy-control-list{display:flex;flex-direction:column}',
        '.account-policy-control-table-head{display:grid;grid-template-columns:34px minmax(180px,1fr) minmax(150px,.8fr) 128px;gap:8px;align-items:center;height:36px;padding:0 14px;background:#f8fafc;border-bottom:1px solid #e5eaf2;color:#475569;font-size:12px;font-weight:800}',
        '.account-policy-control-row{display:grid;grid-template-columns:34px minmax(180px,1fr) minmax(150px,.8fr) 128px;gap:8px;align-items:center;min-height:48px;padding:8px 14px;border-bottom:1px solid #edf2f7}',
        '.account-policy-control-card.is-simple .account-policy-control-table-head{grid-template-columns:34px minmax(180px,1fr) 128px}',
        '.account-policy-control-card.is-simple .account-policy-control-row{grid-template-columns:34px minmax(180px,1fr) 128px}',
        '.account-policy-control-card.is-no-action .account-policy-control-table-head{grid-template-columns:34px minmax(180px,1fr) minmax(150px,.8fr)}',
        '.account-policy-control-card.is-no-action .account-policy-control-row{grid-template-columns:34px minmax(180px,1fr) minmax(150px,.8fr)}',
        '.account-policy-control-row:last-child{border-bottom:0}',
        '.account-policy-control-switch{display:flex;align-items:center;justify-content:center}.account-policy-control-switch input{accent-color:#6366F1;width:16px;height:16px}',
        '.account-policy-control-name{color:#0f172a;font-size:13px;font-weight:700;line-height:1.35}',
        '.account-policy-control-sub{display:block;margin-top:3px;color:#64748b;font-size:11.5px;font-weight:500;line-height:1.35}',
        '.account-policy-control-fieldset{display:flex;gap:6px;align-items:center;flex-wrap:wrap;min-width:0}',
        '.account-policy-control-field{display:flex;align-items:center;gap:5px;color:#64748b;font-size:12px;font-weight:700;min-width:0;flex-wrap:nowrap}',
        '.account-policy-control-field>span:first-child{white-space:nowrap}',
        '.account-policy-control-field input,.account-policy-control-field select,.account-policy-control-row select,.account-policy-control-row input[type="text"]{height:30px;border:1px solid #d5deea;border-radius:6px;padding:0 9px;color:#1f2937;font-size:12.5px;box-sizing:border-box;background:#fff;box-shadow:none}',
        '.account-policy-control-field input{width:66px;text-align:right}.account-policy-control-field select{min-width:180px}',
        '.account-policy-control-row select{width:100%;appearance:none;-webkit-appearance:none;padding-right:28px;background-image:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2714%27 height=%2714%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%2364758b%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 9px center;background-size:14px}',
        '.account-policy-control-row input[type="text"]{width:100%}',
        '.account-policy-control-target{display:grid;grid-template-columns:1fr;gap:6px}',
        '.account-policy-control-row input:focus,.account-policy-control-row select:focus{outline:none;border-color:#cbd5e1;box-shadow:0 0 0 2px rgba(148,163,184,.12)}',
        '.account-policy-control-empty{grid-column:1/-1;border:1px dashed #d9e2ef;border-radius:8px;padding:20px;color:#64748b;font-size:13px;text-align:center;background:#fbfdff}',
        '.account-policy-common-form{grid-column:1/-1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;align-items:start;padding:0;background:transparent;border:0;width:100%}',
        '.account-policy-page[data-policy-page="common"] .account-policy-common-form{order:1}',
        '.account-policy-common-column{display:flex;flex-direction:column;gap:16px;min-width:0}',
        '.account-policy-form-card{width:100%;border:1px solid #d9e2ef;border-radius:8px;background:#fff;padding:0;box-shadow:0 1px 2px rgba(15,23,42,.035);overflow:hidden;vertical-align:top}',
        '.account-policy-form-card-head{display:flex;align-items:center;justify-content:flex-start;gap:12px;padding:14px 18px;background:#f8fafc;border-bottom:1px solid #e5eaf2}',
        '.account-policy-form-card h3{margin:0;color:#0f172a;font-size:15px;font-weight:800;letter-spacing:0}',
        '.account-policy-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 14px;padding:16px 18px 14px}',
        '.account-policy-form-grid label{display:flex;flex-direction:column;gap:6px;color:#334155;font-size:12.5px;font-weight:700}',
        '.account-policy-form-grid .field-full{grid-column:1/-1}',
        '.account-policy-form-grid input,.account-policy-form-grid select{width:100%;height:34px;border:1px solid #d5deea;border-radius:6px;padding:0 10px;color:#1f2937;font-family:inherit;font-size:13px;font-weight:400;box-sizing:border-box;background:#fff}',
        '.account-policy-form-grid textarea{width:100%;min-height:76px;border:1px solid #d5deea;border-radius:6px;padding:10px 12px;color:#1f2937;font-family:inherit;font-size:13px;font-weight:400;line-height:1.55;letter-spacing:0;box-sizing:border-box;background:#fff;resize:vertical;outline:none;box-shadow:none}',
        '.account-policy-form-grid input:disabled,.account-policy-form-grid select:disabled,.account-policy-form-grid textarea:disabled{background:#f8fafc;color:#334155;opacity:1}',
        '.account-policy-form-grid select{appearance:none;-webkit-appearance:none;padding-right:28px;background-color:#fff;background-image:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2714%27 height=%2714%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%2364758b%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 9px center;background-size:14px}',
        '.account-policy-form-grid input:focus,.account-policy-form-grid select:focus,.account-policy-form-grid textarea:focus{outline:none;border-color:#cbd5e1;box-shadow:0 0 0 2px rgba(148,163,184,.12)}',
        '.account-policy-check-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 16px;padding:16px 18px 10px}',
        '.account-policy-check-grid label,.account-policy-check{display:flex!important;flex-direction:row!important;align-items:center;gap:8px;min-height:28px;border:0;border-radius:0;background:transparent;padding:0;color:#334155;font-size:13px;font-weight:700;box-sizing:border-box}',
        '.account-policy-check-grid input,.account-policy-check input{width:15px!important;height:15px!important;accent-color:#6366F1}',
        '.account-policy-security-rules{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 14px;padding:6px 18px 14px}',
        '.account-policy-security-rules label{display:flex;flex-direction:column;gap:6px;color:#334155;font-size:12.5px;font-weight:700}',
        '.account-policy-security-rules select{width:100%;height:34px;border:1px solid #d5deea;border-radius:6px;padding:0 28px 0 10px;color:#1f2937;font-size:13px;box-sizing:border-box;background-color:#fff;appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2714%27 height=%2714%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%2364758b%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 9px center;background-size:14px}',
        '.account-policy-security-rules select:focus{outline:none;border-color:#cbd5e1;box-shadow:0 0 0 2px rgba(148,163,184,.12)}',
        '.account-policy-form-card-foot{display:flex;justify-content:flex-start;align-items:center;gap:8px;padding:0 18px 16px;background:#fff;border-top:0}',
        '.account-policy-collection-intervals{grid-column:1/-1;margin:4px 18px 14px;padding:12px 14px;border:1px solid #d9e2ef;border-radius:7px;background:#fbfdff}',
        '.account-policy-collection-intervals h4{margin:0 0 10px;color:#0f172a;font-size:13px;font-weight:800}',
        '.account-policy-interval-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 18px}',
        '.account-policy-interval-grid label{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:34px;border-top:1px solid #edf2f7;color:#334155;font-size:12.5px;font-weight:700}',
        '.account-policy-interval-grid input{width:76px;height:28px;border:1px solid #d5deea;border-radius:6px;padding:0 8px;color:#1f2937;font-size:13px;box-sizing:border-box;background:#fff;text-align:right}',
        '.account-policy-extra-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px;margin:4px 18px 14px;padding:12px 14px;border:1px solid #d9e2ef;border-radius:7px;background:#fbfdff}',
        '.account-policy-extra-fields h4{grid-column:1/-1;margin:0 0 2px;color:#0f172a;font-size:13px;font-weight:800}',
        '.account-policy-extra-fields label{display:flex;flex-direction:column;gap:6px;min-width:0;color:#334155;font-size:12.5px;font-weight:700}',
        '.account-policy-extra-fields .field-full{grid-column:1/-1}',
        '.account-policy-extra-fields input:not([type="checkbox"]):not([type="hidden"]),.account-policy-extra-fields select{width:100%;height:34px;border:1px solid #d5deea;border-radius:6px;padding:0 10px;color:#1f2937;font-size:13px;box-sizing:border-box;background:#fff;outline:none;box-shadow:none}',
        '.account-policy-extra-fields select{appearance:none;-webkit-appearance:none;padding-right:28px;background-color:#fff;background-image:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2714%27 height=%2714%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%2364758b%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 9px center;background-size:14px}',
        '.account-policy-extra-fields input:not([type="checkbox"]):not([type="hidden"]):focus,.account-policy-extra-fields select:focus{border-color:#cbd5e1;box-shadow:0 0 0 2px rgba(148,163,184,.12)}',
        '.account-policy-extra-fields .account-policy-check{min-height:34px}',
        '.account-policy-mask-patterns{grid-column:1/-1;display:flex;flex-direction:column;gap:8px;color:#334155;font-size:12.5px;font-weight:700}',
        '.account-policy-mask-chip-row{display:flex;flex-wrap:wrap;gap:7px}',
        '.account-policy-mask-chip{height:28px;padding:0 10px;border:1px solid #d8e1ee;border-radius:999px;background:#fff;color:#475569;font-size:12.5px;font-weight:700;cursor:pointer}',
        '.account-policy-mask-chip.is-active{border-color:#6366F1;background:#eef2ff;color:#4f46e5}',
        '.account-policy-mask-custom{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}',
        '.account-policy-mask-custom input{height:34px;border:1px solid #d5deea;border-radius:6px;padding:0 10px;color:#1f2937;font-size:13px;box-sizing:border-box;background:#fff}',
        '.account-policy-mask-add{height:34px;padding:0 12px;border:1px solid #d7dee9;border-radius:7px;background:#fff;color:#334155;font-size:13px;font-weight:700;cursor:pointer}',
        '.account-policy-mask-help{color:#64748b;font-size:12px;font-weight:400;line-height:1.45}',
        '.account-policy-common-section-save{height:34px;min-width:76px;border:0!important;border-radius:7px!important;background:#6366F1!important;color:#fff!important;box-shadow:none!important;font-weight:800!important}',
        '.account-policy-common-section-save:hover{background:#4f46e5!important;color:#fff!important}',
        '.account-policy-head-actions{display:flex;align-items:center;gap:8px}',
        '.account-policy-count{background:#6366F1!important;color:#fff!important;border-color:#6366F1!important;box-shadow:0 8px 16px rgba(99,102,241,.18)}',
        '.account-policy-section-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;min-width:62px;padding:0 12px;border:1px solid #d7dee9;border-radius:7px;background:#fff;color:#334155;font-size:13px;font-weight:700;box-shadow:none;cursor:pointer}',
        '.account-policy-section-btn:hover{background:#f8fafc;border-color:#cbd5e1;color:#1e293b}',
        '.account-policy-section-btn svg{width:15px;height:15px;display:block}',
        '.account-policy-add-btn{display:none}.account-policy-add-btn.is-visible{display:inline-flex}',
        '.account-policy-page[data-policy-page="linux"]>.setting-card{display:flex;flex-direction:column;align-self:stretch}',
        '.account-policy-page[data-policy-page="linux"]>.setting-card .account-policy-table-wrap{flex:0 0 auto}',
        '.account-policy-page[data-policy-page="linux"]>.setting-card .account-policy-form-card-foot{margin-top:auto}',
        '.account-policy-table-wrap{overflow:auto;border-top:1px solid #e5e7eb}',
        '.account-policy-table{width:100%;border-collapse:collapse;table-layout:fixed}',
        '.account-policy-table th{height:34px;padding:0 12px;background:#f8fafc;color:#334155;font-size:12.5px;font-weight:800;text-align:left;border-bottom:1px solid #e5e7eb}',
        '.account-policy-table td{height:36px;padding:5px 12px;border-bottom:1px solid #eef2f7;vertical-align:middle}',
        '.account-policy-table th.account-policy-manage-head{width:42px}.account-policy-delete-cell{width:42px;text-align:left}',
        '.account-policy-value{display:block;min-height:28px;padding:5px 2px;color:#1f2937;font-size:13px;font-weight:400;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '.account-policy-value.is-muted{color:#64748b;font-weight:400}',
        '.account-policy-category-table th:nth-child(1){width:18%}.account-policy-category-table th:nth-child(2){width:16%}.account-policy-category-table th:nth-child(3){width:16%}.account-policy-category-table th:nth-child(4){width:auto}',
        '.account-policy-windows-policy-list{display:flex;flex-direction:column;gap:8px;padding:14px 18px 18px;border-top:0;background:#fff}',
        '.account-policy-windows-policy-row{display:grid;grid-template-columns:minmax(210px,1fr) minmax(210px,1fr) minmax(330px,1.7fr) 32px;gap:12px;align-items:stretch;border:1px solid #dfe7f1;border-radius:8px;background:#fff;padding:12px;box-shadow:0 1px 1px rgba(15,23,42,.02)}',
        '.account-policy-windows-policy-row.is-editing{background:#fbfdff}',
        '.account-policy-policy-block{display:flex;flex-direction:column;justify-content:center;gap:5px;min-width:0}',
        '.account-policy-policy-label{color:#64748b;font-size:11px;font-weight:800;letter-spacing:.01em}',
        '.account-policy-policy-title{color:#0f172a;font-size:13.5px;font-weight:800;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '.account-policy-policy-sub{color:#64748b;font-size:12.5px;font-weight:500;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '.account-policy-policy-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 10px;align-items:end}',
        '.account-policy-policy-fields-wide{grid-template-columns:minmax(180px,.7fr) minmax(240px,1.3fr)}',
        '.account-policy-policy-fields label{display:flex;flex-direction:column;gap:5px;color:#334155;font-size:11.5px;font-weight:800;min-width:0}',
        '.account-policy-policy-field{display:flex;flex-direction:column;gap:5px;color:#334155;font-size:11.5px;font-weight:800;min-width:0}',
        '.account-policy-policy-fields input,.account-policy-policy-fields select{width:100%;height:32px;border:1px solid #d5deea;border-radius:6px;padding:0 10px;color:#1f2937;font-size:12.5px;box-sizing:border-box;background:#fff}',
        '.account-policy-windows-type-main input,.account-policy-windows-type-main select{font-size:13.2px!important}',
        '.account-policy-policy-fields select{appearance:none;-webkit-appearance:none;padding-right:28px;background-color:#fff;background-image:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2714%27 height=%2714%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%2364758b%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 9px center;background-size:14px}',
        '.account-policy-policy-fields input:focus,.account-policy-policy-fields select:focus{outline:none;border-color:#cbd5e1;box-shadow:0 0 0 2px rgba(148,163,184,.12)}',
        '.account-policy-policy-pill{display:inline-flex;align-items:center;max-width:100%;height:24px;padding:0 9px;border-radius:999px;background:#eef2ff;color:#4338ca;font-size:12px;font-weight:800;line-height:1;white-space:nowrap}',
        '.account-policy-policy-pill.is-neutral{background:#f1f5f9;color:#475569}',
        '.account-policy-policy-summary{display:flex;flex-wrap:wrap;gap:6px;align-content:center;min-width:0}',
        '.account-policy-policy-actions{display:flex;align-items:center;justify-content:flex-end}',
        '.account-policy-page[data-policy-page="windows"] .setting-card{box-shadow:0 8px 24px rgba(15,23,42,.04);border-color:#dbe3ef}',
        '.account-policy-page[data-policy-page="windows"] .setting-card-header{padding:18px 22px;border-bottom:1px solid #e5e7eb}',
        '.account-policy-page[data-policy-page="windows"] .setting-card{display:flex;flex-direction:column}',
        '.account-policy-template-list{display:flex;flex-direction:column;gap:10px;padding:14px 18px 18px;border-top:0}',
        '.account-policy-template-card{display:grid;grid-template-columns:220px 260px minmax(0,1fr) 36px;gap:12px;align-items:start;border:1px solid #dfe7f1;border-radius:8px;background:#fff;padding:12px 12px}',
        '.account-policy-template-card.is-editing{background:#fbfdff}',
        '.account-policy-windows-type-card{grid-template-columns:repeat(4,minmax(0,1fr)) minmax(360px,1.2fr) 36px;gap:8px}',
        '.account-policy-windows-type-card.is-editing{grid-template-columns:minmax(760px,1fr) minmax(430px,.5fr) 32px;align-items:start;padding:10px 12px;border-color:#dbe3ef;background:#fff}',
        '.account-policy-windows-type-main{display:grid;grid-template-columns:repeat(2,minmax(340px,1fr));gap:8px 18px;min-width:0;width:100%;padding-left:10px;box-sizing:border-box}',
        '.account-policy-windows-type-main>.account-policy-policy-fields{display:block}',
        '.account-policy-windows-type-main>.account-policy-policy-fields label{display:flex;flex-direction:column;gap:5px;font-size:12.5px}',
        '.account-policy-select-wrap{position:relative;display:block;width:100%}',
        '.account-policy-select-wrap:after{content:"";position:absolute;right:12px;top:50%;z-index:2;width:0;height:0;transform:translateY(-35%);pointer-events:none;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid #334155}',
        '.account-policy-select-wrap select{appearance:none!important;-webkit-appearance:none!important;padding-right:32px!important;background-color:#fff!important;background-image:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2714%27 height=%2714%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%23334155%27 stroke-width=%272.3%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E")!important;background-repeat:no-repeat!important;background-position:right 10px center!important;background-size:14px!important}',
        '.account-policy-windows-type-main select{appearance:none!important;-webkit-appearance:none!important;padding-right:32px!important;background-color:#fff!important;background-image:none!important}',
        '.account-policy-windows-type-required{display:flex;flex-direction:column;gap:7px;min-width:0}',
        '.account-policy-windows-type-required>span{color:#334155;font-size:12.5px;font-weight:800}',
        '.account-policy-template-meta{display:flex;flex-direction:column;gap:7px;min-width:0}',
        '.account-policy-template-name{color:#0f172a;font-size:13px;font-weight:700;line-height:1.35}',
        '.account-policy-template-purpose{color:#64748b;font-size:12.5px;font-weight:500;line-height:1.4}',
        '.account-policy-template-meta input{width:100%;height:32px;border:1px solid #d5deea;border-radius:6px;padding:0 10px;color:#1f2937;font-size:13px;box-sizing:border-box;background:#fff}',
        '.account-policy-template-meta input:focus{outline:none;border-color:#cbd5e1;box-shadow:0 0 0 2px rgba(148,163,184,.12)}',
        '.account-policy-right-summary{display:flex;flex-wrap:wrap;gap:6px;align-items:flex-start}',
        '.account-policy-right-chip{display:inline-flex;align-items:center;min-height:24px;padding:0 8px;border-radius:999px;background:#eef2ff;color:#4338ca;font-size:12px;font-weight:700;line-height:1.2}',
        '.account-policy-right-chip.is-deny{background:#fff1f2;color:#e11d48}',
        '.account-policy-rights-select{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 10px;align-items:start;border:1px solid #e4ebf5;border-radius:7px;background:#f8fafc;padding:10px}',
        '.account-policy-rights-select label{display:flex;align-items:center;gap:7px;min-width:0;color:#334155;font-size:12.5px;font-weight:600;line-height:1.35}',
        '.account-policy-rights-select input{width:14px!important;height:14px!important;accent-color:#6366F1;flex:0 0 auto}',
        '.account-policy-template-delete{display:flex;justify-content:center;padding-top:4px}',
        '.account-policy-table td:has(.account-policy-required-select){padding-top:7px!important;padding-bottom:7px!important}',
        '.account-policy-required-summary{display:flex;flex-wrap:wrap;gap:5px;align-items:center;max-width:360px}',
        '.account-policy-required-chip{display:inline-flex;align-items:center;height:22px;padding:0 8px;border:1px solid #dbe4f0;border-radius:999px;background:#f8fafc;color:#334155;font-size:11.5px;font-weight:700;line-height:1}',
        '.account-policy-required-select{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 12px;align-items:start;max-width:none;padding:10px;border:1px solid #e4ebf5;border-radius:7px;background:#f8fafc}',
        '.account-policy-required-select label{display:inline-flex;align-items:center;gap:7px;min-height:20px;padding:0;border:0;border-radius:0;background:transparent;color:#334155;font-size:12px;font-weight:700;line-height:1.25;white-space:nowrap}',
        '.account-policy-required-select label:has(input:checked){border-color:transparent;background:transparent;color:#334155}',
        '.account-policy-required-select input{width:14px!important;height:14px!important;accent-color:#6366F1;flex:0 0 auto}',
        '.account-policy-group-head{cursor:pointer}',
        '.account-policy-group-head td{height:32px;padding:7px 12px!important;background:#f8fafc!important;color:#334155!important;font-size:13px;font-weight:400;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb}',
        '.account-policy-group-count{display:inline-flex;align-items:center;height:20px;margin-left:8px;padding:0 7px;border-radius:999px;background:#eef2ff;color:#6366F1;font-size:12px;font-weight:700}',
        '.account-policy-group-toggle{display:inline-flex;align-items:center;gap:8px;border:0;background:transparent;color:#334155;font-size:13px;font-weight:400;cursor:pointer;padding:0}',
        '.account-policy-group-toggle-icon{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;color:#64748b;font-size:12px;transition:transform .15s ease}.account-policy-group-toggle-icon.is-open{transform:rotate(90deg)}',
        '.account-policy-delete-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:1px solid #fff;border-radius:7px;background:#fff;color:#cbd5e1;cursor:pointer}',
        '.account-policy-delete-btn:hover{background:#f8fafc;border-color:#fff;color:#94a3b8}.account-policy-delete-btn img{width:14px;height:14px;display:block;opacity:.42;filter:grayscale(1)}',
        '.account-policy-table input,.account-policy-table select{width:100%;height:30px;border:1px solid #d5deea;border-radius:6px;padding:0 9px;color:#1f2937;font-size:12.5px;box-sizing:border-box;background:#fff}',
        '.account-policy-table select{appearance:none;-webkit-appearance:none;padding-right:28px;background-color:#fff;background-image:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2714%27 height=%2714%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%2364758b%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 9px center;background-size:14px}',
        '.account-policy-table input:focus,.account-policy-table select:focus{outline:none;border-color:#cbd5e1;box-shadow:0 0 0 2px rgba(148,163,184,.12)}',
        '.account-policy-alert{position:fixed;inset:0;z-index:10050;display:none;align-items:center;justify-content:center;background:rgba(15,23,42,.45)}.account-policy-alert.is-open{display:flex}',
        '.account-policy-alert-dialog{width:min(520px,calc(100vw - 48px));border-radius:14px;background:#fff;box-shadow:0 24px 60px rgba(15,23,42,.24);overflow:hidden}',
        '.account-policy-alert-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:24px 28px 18px;background:#f8fafc;border-bottom:1px solid #e5e7eb}',
        '.account-policy-alert-title{margin:0;color:#111827;font-size:20px;font-weight:700}.account-policy-alert-body{padding:26px 28px;color:#475569;font-size:14px;line-height:1.65;white-space:pre-line}',
        '.account-policy-alert-actions{display:flex;justify-content:flex-end;padding:18px 28px;background:#f8fafc;border-top:1px solid #e5e7eb}',
        '.account-policy-alert-close{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border:1px solid #dbe3ef;border-radius:999px;background:#fff;color:#64748b;cursor:pointer;box-shadow:0 2px 6px rgba(15,23,42,.08)}',
        '.account-policy-alert-ok{height:40px;min-width:72px;border:0;border-radius:8px;background:#6366F1;color:#fff;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 10px 18px rgba(99,102,241,.22)}',
        '@media (max-width:1700px){.account-policy-control-board{grid-template-columns:repeat(2,minmax(0,1fr))}}',
        '@media (max-width:1500px){.account-policy-control-board{grid-template-columns:1fr}.account-policy-control-table-head{grid-template-columns:42px minmax(220px,1.1fr) minmax(210px,.9fr) 150px}.account-policy-control-row{grid-template-columns:42px minmax(220px,1.1fr) minmax(210px,.9fr) 150px}.account-policy-control-card.is-simple .account-policy-control-table-head{grid-template-columns:42px minmax(220px,1fr) 150px}.account-policy-control-card.is-simple .account-policy-control-row{grid-template-columns:42px minmax(220px,1fr) 150px}}',
        '@media (max-width:1200px){.account-policy-control-table-head{display:none}.account-policy-control-row{grid-template-columns:36px minmax(180px,1fr) minmax(160px,1fr) minmax(130px,1fr)}.account-policy-control-target,.account-policy-control-apply{grid-column:2/-1}}',
        '@media (max-width:1200px){.account-policy-page,.account-policy-summary-grid,.account-policy-common-form,.account-policy-form-grid,.account-policy-check-grid{grid-template-columns:1fr}}'
    ].join('');
    document.head.appendChild(style);
}

function closePolicyAlert(){
    var modal = $('#account-policy-alert');
    if(!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
}

function ensurePolicyAlert(){
    var modal = $('#account-policy-alert');
    if(modal) return modal;
    modal = document.createElement('div');
    modal.id = 'account-policy-alert';
    modal.className = 'account-policy-alert';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = '<div class="account-policy-alert-dialog" role="dialog" aria-modal="true" aria-labelledby="account-policy-alert-title"><div class="account-policy-alert-head"><h3 class="account-policy-alert-title" id="account-policy-alert-title">알림</h3><button type="button" class="account-policy-alert-close" aria-label="닫기">×</button></div><div class="account-policy-alert-body" id="account-policy-alert-message"></div><div class="account-policy-alert-actions"><button type="button" class="account-policy-alert-ok">확인</button></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function(e){ if(e.target === modal) closePolicyAlert(); });
    $('.account-policy-alert-close', modal).addEventListener('click', closePolicyAlert);
    $('.account-policy-alert-ok', modal).addEventListener('click', closePolicyAlert);
    return modal;
}

function showPolicyAlert(message, type){
    var modal = ensurePolicyAlert();
    $('#account-policy-alert-title', modal).textContent = type === 'error' ? '알림' : '안내';
    $('#account-policy-alert-message', modal).textContent = message || '';
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
}

function saveIconHtml(){ return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M17 21v-8H7v8M7 3v5h8" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg><span>저장</span>'; }
function plusIconHtml(){ return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>추가</span>'; }
function editIconHtml(){ return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M12 20h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg><span>수정</span>'; }
function renderSectionButton(btn, editing){ if(btn){ btn.className = 'account-policy-section-btn account-policy-section-save'; btn.innerHTML = editing ? saveIconHtml() : editIconHtml(); } }
function renderAddButton(btn, visible){ if(btn){ btn.className = 'account-policy-section-btn account-policy-add-btn' + (visible ? ' is-visible' : ''); btn.innerHTML = plusIconHtml(); } }
function removeDeprecatedCommonCards(){
    $all('[data-common-field^="update."],[data-common-field^="tags."]').forEach(function(input){
        var card = input.closest('.account-policy-form-card');
        if(card && card.parentNode) card.parentNode.removeChild(card);
    });
    $all('[data-common-field^="rollout."],[data-common-field="collection.immediate_collection"],[data-common-collection="immediate_collection"]').forEach(function(input){
        var row = input.closest('label') || input.closest('.account-policy-extra-fields') || input;
        if(row && row.parentNode) row.parentNode.removeChild(row);
    });
    $all('.account-policy-form-card,label,button').forEach(function(el){
        var text = (el.textContent || '').replace(/\s+/g, ' ');
        if(text.indexOf('정책 적용') >= 0 || text.indexOf('즉시 수집') >= 0) {
            if(el.classList && el.classList.contains('account-policy-form-card')) el.parentNode && el.parentNode.removeChild(el);
            else if(el.tagName === 'LABEL' || el.tagName === 'BUTTON') el.parentNode && el.parentNode.removeChild(el);
        }
    });
}
function ensureCollectionIntervalBox(){
    var collectionInput = $('[data-common-collection]');
    if(!collectionInput) return;
    var card = collectionInput.closest('.account-policy-form-card');
    if(!card || card.querySelector('.account-policy-collection-intervals')) return;
    var box = document.createElement('div');
    box.className = 'account-policy-collection-intervals';
    box.innerHTML = [
        '<h4>모듈별 수집 주기(분)</h4>',
        '<div class="account-policy-interval-grid">',
        '<label><span>인터페이스</span><input data-common-interval="interfaces" type="number" min="1"></label>',
        '<label><span>계정</span><input data-common-interval="accounts" type="number" min="1"></label>',
        '<label><span>권한</span><input data-common-interval="permissions" type="number" min="1"></label>',
        '<label><span>방화벽</span><input data-common-interval="firewall" type="number" min="1"></label>',
        '<label><span>성능</span><input data-common-interval="performance" type="number" min="1"></label>',
        '<label><span>취약점</span><input data-common-interval="vulnerabilities" type="number" min="1"></label>',
        '<label><span>패키지</span><input data-common-interval="packages" type="number" min="1"></label>',
        '</div>'
    ].join('');
    var grid = card.querySelector('.account-policy-check-grid');
    if(grid && grid.nextSibling) card.insertBefore(box, grid.nextSibling);
    else card.appendChild(box);
}
function ensureSecurityRuleBox(){
    var securityInput = $('[data-common-security]');
    if(!securityInput) return;
    var card = securityInput.closest('.account-policy-form-card');
    if(!card || card.querySelector('.account-policy-security-rules')) return;
    var box = document.createElement('div');
    box.className = 'account-policy-security-rules';
    box.innerHTML = [
        '<label><span>에이전트 인증 방식</span><select data-common-security-option="auth_mode"><option value="token_tls">토큰 + TLS</option><option value="cert_tls">클라이언트 인증서 + TLS</option><option value="token">토큰</option></select></label>',
        '<label><span>명령 검증 기준</span><select data-common-security-option="command_policy"><option value="signed_only">서명된 명령만 허용</option><option value="approved_only">승인된 명령만 허용</option><option value="audit_only">감사 로그만 기록</option></select></label>',
        '<label><span>민감정보 마스킹</span><select data-common-security-option="secret_masking_level"><option value="strict">엄격</option><option value="standard">표준</option><option value="audit">로그 마스킹만</option></select></label>',
        '<label><span>무결성 실패 처리</span><select data-common-security-option="integrity_action"><option value="block">차단</option><option value="quarantine">격리</option><option value="alert">알림만</option></select></label>',
        '<label><span>보안 실패 공통 처리</span><select data-common-security-option="failure_action"><option value="retry_then_block">재시도 후 차단</option><option value="block">즉시 차단</option><option value="alert">알림만</option></select></label>'
    ].join('');
    var grid = card.querySelector('.account-policy-check-grid');
    if(grid && grid.nextSibling) card.insertBefore(box, grid.nextSibling);
    else card.appendChild(box);
}
function appendExtraGrid(card, marker, title, html){
    if(!card || card.querySelector('[data-common-extra="' + marker + '"]')) return;
    var grid = document.createElement('div');
    grid.className = 'account-policy-form-grid account-policy-extra-fields';
    grid.setAttribute('data-common-extra', marker);
    grid.innerHTML = '<h4>' + title + '</h4>' + html;
    var foot = card.querySelector('.account-policy-form-card-foot');
    if(foot) card.insertBefore(grid, foot);
    else card.appendChild(grid);
}
function cardFrom(selector){
    var el = $(selector);
    return el ? el.closest('.account-policy-form-card') : null;
}
function ensureCommonAdvancedFields(){
    if($('.account-policy-common-form .account-policy-extra-fields')) return;
    appendExtraGrid(cardFrom('#common-ap-server'), 'communication-advanced', '통신 운영 기준', [
        '<label>AP 서버 이중화 주소<input data-common-field="communication.secondary_ap_server" type="text" placeholder="https://192.168.56.106"></label>',
        '<label>연결 타임아웃(초)<input data-common-field="communication.connect_timeout_seconds" type="number" min="1"></label>',
        '<label>요청 타임아웃(초)<input data-common-field="communication.request_timeout_seconds" type="number" min="1"></label>',
        '<label>재접속 백오프(초)<input data-common-field="communication.reconnect_backoff_seconds" type="number" min="1"></label>',
        '<label>식별키 회전 주기(일)<input data-common-field="communication.agent_key_rotation_days" type="number" min="1"></label>'
    ].join(''));
    appendExtraGrid(cardFrom('[data-common-collection]'), 'collection-advanced', '수집 운영 기준', [
        '<label>수집 실패 재시도 횟수<input data-common-field="collection.retry_count" type="number" min="0"></label>',
        '<label>수집 지연 허용 시간(분)<input data-common-field="collection.delay_tolerance_minutes" type="number" min="0"></label>',
        '<label>부하 제한 시간대<select data-common-field="collection.quiet_hours"><option value="">제한 없음</option><option value="09:00-18:00">업무 시간대(09:00-18:00)</option><option value="18:00-22:00">저녁 시간대(18:00-22:00)</option><option value="22:00-06:00">야간 시간대(22:00-06:00)</option><option value="00:00-06:00">심야 시간대(00:00-06:00)</option></select></label>',
        '<label>수집 결과 보관 기간(일)<input data-common-field="collection.retention_days" type="number" min="1"></label>'
    ].join(''));
    appendExtraGrid(cardFrom('[data-common-field="performance.cpu_limit_percent"]'), 'performance-advanced', '성능 운영 기준', [
        '<label>최대 CPU 사용 시간(초)<input data-common-field="performance.max_cpu_seconds" type="number" min="1"></label>',
        '<label>동시 작업 수<input data-common-field="performance.concurrent_jobs" type="number" min="1"></label>',
        '<label>수집 배치 크기<input data-common-field="performance.batch_size" type="number" min="1"></label>',
        '<label>샘플링 간격(초)<input data-common-field="performance.sampling_seconds" type="number" min="1"></label>',
        '<label class="account-policy-check"><input data-common-field="performance.transfer_compression" type="checkbox"> 전송 압축 사용</label>'
    ].join(''));
    appendExtraGrid(cardFrom('[data-common-field="log.level"]'), 'log-advanced', '로그 운영 기준', [
        '<label class="account-policy-check"><input data-common-field="log.audit_forwarding" type="checkbox"> 감사 로그 전송</label>',
        '<label class="account-policy-check"><input data-common-field="log.local_encryption" type="checkbox"> 로컬 로그 암호화</label>',
        '<div class="account-policy-mask-patterns"><span>마스킹 대상 키워드</span><input data-common-field="log.masking_patterns" type="hidden"><div class="account-policy-mask-chip-row" data-mask-chip-row></div><div class="account-policy-mask-custom"><input data-mask-custom type="text" placeholder="예: client_secret"><button type="button" class="account-policy-mask-add" data-mask-add>추가</button></div><div class="account-policy-mask-help">로그 값 전체가 아니라 지정한 키워드가 포함된 항목의 값을 마스킹합니다.</div></div>',
        '<label>로그 전송 재시도 횟수<input data-common-field="log.forward_retry_limit" type="number" min="0"></label>'
    ].join(''));
    appendExtraGrid(cardFrom('[data-common-field="offline.enabled"]'), 'offline-advanced', '오프라인 운영 기준', [
        '<label>오프라인 허용 최대 시간(분)<input data-common-field="offline.max_offline_minutes" type="number" min="1"></label>',
        '<label>오프라인 알림 기준(분)<input data-common-field="offline.offline_alert_minutes" type="number" min="1"></label>',
        '<label>재연결 동기화 방식<select data-common-field="offline.sync_mode"><option value="delta">변경분만 동기화</option><option value="full">전체 동기화</option><option value="manual">수동 확인 후 동기화</option></select></label>',
        '<label class="account-policy-check"><input data-common-field="offline.cache_encryption" type="checkbox"> 로컬 캐시 암호화</label>'
    ].join(''));
}
function arrangeCommonSaveButtons(){
    removeDeprecatedCommonCards();
    ensureCollectionIntervalBox();
    ensureSecurityRuleBox();
    ensureCommonAdvancedFields();
    $all('.account-policy-form-card').forEach(function(card){
        var btn = card.querySelector('.account-policy-common-section-save');
        if(!btn) return;
        var foot = card.querySelector('.account-policy-form-card-foot');
        if(!foot) {
            foot = document.createElement('div');
            foot.className = 'account-policy-form-card-foot';
            card.appendChild(foot);
        }
        btn.innerHTML = saveIconHtml();
        foot.appendChild(btn);
    });
    balanceCommonCards();
}

function arrangeLinuxSaveButtons(){
    [
        ['account-policy-category-save', 'account-policy-category-add'],
        ['account-policy-group-save', 'account-policy-group-add'],
        ['account-policy-linux-shell-save', null],
        ['account-policy-linux-protection-save', null],
        ['account-policy-linux-validation-save', null]
    ].forEach(function(pair){
        var btn = document.getElementById(pair[0]);
        if(!btn) return;
        var card = btn.closest('.setting-card');
        if(!card) return;
        var foot = card.querySelector('.account-policy-form-card-foot');
        if(!foot) {
            foot = document.createElement('div');
            foot.className = 'account-policy-form-card-foot';
            card.appendChild(foot);
        }
        btn.classList.add('account-policy-common-section-save');
        foot.appendChild(btn);
        if(pair[1]) {
            var addBtn = document.getElementById(pair[1]);
            if(addBtn) foot.appendChild(addBtn);
        }
    });
}

function arrangeWindowsSaveButtons(){
    [
        ['account-policy-windows-type-save', 'account-policy-windows-type-add'],
        ['account-policy-windows-rule-save', 'account-policy-windows-rule-add'],
        ['account-policy-windows-template-save', 'account-policy-windows-template-add']
    ].forEach(function(pair){
        var btn = document.getElementById(pair[0]);
        if(!btn) return;
        var card = btn.closest('.setting-card');
        if(!card) return;
        var foot = card.querySelector('.account-policy-form-card-foot');
        if(!foot) {
            foot = document.createElement('div');
            foot.className = 'account-policy-form-card-foot';
            card.appendChild(foot);
        }
        btn.classList.add('account-policy-common-section-save');
        foot.appendChild(btn);
        if(pair[1]) {
            var addBtn = document.getElementById(pair[1]);
            if(addBtn) foot.appendChild(addBtn);
        }
    });
}

function balanceCommonCards(){
    var form = $('.account-policy-common-form');
    if(!form) return;
    var cards = $all('.account-policy-form-card', form);
    if(!cards.length) return;
    var left = form.querySelector('.account-policy-common-column.is-left');
    var right = form.querySelector('.account-policy-common-column.is-right');
    if(!left || !right) {
        left = document.createElement('div');
        right = document.createElement('div');
        left.className = 'account-policy-common-column is-left';
        right.className = 'account-policy-common-column is-right';
        form.innerHTML = '';
        form.appendChild(left);
        form.appendChild(right);
    }
    var ordered = cards.slice().sort(function(a, b){
        var av = a.dataset.commonCardSlot;
        var bv = b.dataset.commonCardSlot;
        if(av == null || bv == null) return 0;
        return parseInt(av, 10) - parseInt(bv, 10);
    });
    var leftIndexes = {0:true, 2:true, 4:true};
    ordered.forEach(function(card, idx){
        if(card.dataset.commonCardSlot == null) card.dataset.commonCardSlot = String(idx);
        (leftIndexes[idx] ? left : right).appendChild(card);
    });
}
function deleteButtonHtml(type, value){ return '<button type="button" class="account-policy-delete-btn" data-policy-delete-' + type + '="' + esc(value || '') + '" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt=""></button>'; }
function categoryOptionsHtml(selected){ return (policy.categories || []).map(function(cat){ var n = clean(cat.name); return '<option value="' + esc(n) + '"' + (n === selected ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join(''); }
function templateOptionsHtml(selected){ return (policy.windows.rights_templates || []).map(function(row){ var n = clean(row.name); return '<option value="' + esc(n) + '"' + (n === selected ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join(''); }
var WINDOWS_REQUIRED_OPTIONS = [
    {code:'expiration_date', label:'만료일'},
    {code:'owner_department', label:'소유부서'},
    {code:'manager', label:'담당자'},
    {code:'approval_history', label:'승인 이력'},
    {code:'reason', label:'생성/변경 사유'},
    {code:'ticket_id', label:'신청 번호'},
    {code:'service_binding', label:'서비스 바인딩'},
    {code:'access_review', label:'정기 접근 검토'}
];
var WINDOWS_RIGHT_OPTIONS = [
    {code:'SeServiceLogonRight', label:'Log on as a service'},
    {code:'SeBatchLogonRight', label:'Log on as a batch job'},
    {code:'SeRemoteInteractiveLogonRight', label:'Allow log on through Remote Desktop Services'},
    {code:'SeDenyInteractiveLogonRight', label:'Deny log on locally'},
    {code:'SeDenyRemoteInteractiveLogonRight', label:'Deny log on through Remote Desktop Services'},
    {code:'SeDenyNetworkLogonRight', label:'Deny access to this computer from the network'},
    {code:'LocalAdministrators', label:'Local Administrators 그룹 포함'},
    {code:'RemoteDesktopUsers', label:'Remote Desktop Users 그룹 포함'},
    {code:'BackupOperators', label:'Backup Operators 그룹 포함'},
    {code:'ReadOnlyOperators', label:'Read-only Operator 그룹 포함'}
];
function windowsTemplatePurpose(name){
    return ({
        ServiceLogonOnly:'서비스 실행 계정',
        BatchLogonOnly:'배치 작업 계정',
        RDPAllowed:'운영자 원격 접속',
        LocalAdmin:'로컬 관리자 승인',
        ReadOnlyOperator:'읽기 전용 운영자',
        NoInteractiveLogin:'대화형 로그인 차단'
    })[name] || '권한 기준';
}

function normalizeTemplateRights(row){
    if(Array.isArray(row.right_codes)) return row.right_codes.map(clean).filter(Boolean);
    if(Array.isArray(row.rights)) return row.rights.map(clean).filter(Boolean);
    var text = String(row.rights || '');
    var found = [];
    WINDOWS_RIGHT_OPTIONS.forEach(function(opt){
        if(text.indexOf(opt.code) >= 0 || text.indexOf(opt.label) >= 0) found.push(opt.code);
    });
    if(found.length) return found;
    var lower = text.toLowerCase();
    if(lower.indexOf('service') >= 0) found.push('SeServiceLogonRight');
    if(lower.indexOf('batch') >= 0) found.push('SeBatchLogonRight');
    if(lower.indexOf('remote desktop') >= 0 && lower.indexOf('deny') < 0) found.push('SeRemoteInteractiveLogonRight');
    if(lower.indexOf('deny log on locally') >= 0) found.push('SeDenyInteractiveLogonRight');
    if(lower.indexOf('deny log on through remote desktop') >= 0) found.push('SeDenyRemoteInteractiveLogonRight');
    if(lower.indexOf('deny access') >= 0 || lower.indexOf('network') >= 0) found.push('SeDenyNetworkLogonRight');
    if(lower.indexOf('administrators') >= 0) found.push('LocalAdministrators');
    if(lower.indexOf('read-only') >= 0) found.push('ReadOnlyOperators');
    return found;
}

function rightsLabelList(codes){
    var map = {};
    WINDOWS_RIGHT_OPTIONS.forEach(function(opt){ map[opt.code] = opt.label; });
    return (codes || []).map(function(code){ return map[code] || code; });
}

function rightChipHtml(code){
    var label = rightsLabelList([code])[0] || code;
    var deny = code.indexOf('Deny') >= 0;
    return '<span class="account-policy-right-chip' + (deny ? ' is-deny' : '') + '">' + esc(label) + '</span>';
}

function rightsCheckboxHtml(rowIndex, selectedCodes){
    selectedCodes = selectedCodes || [];
    return '<div class="account-policy-rights-select">' + WINDOWS_RIGHT_OPTIONS.map(function(opt){
        var checked = selectedCodes.indexOf(opt.code) >= 0 ? ' checked' : '';
        return '<label><input type="checkbox" data-template-right="' + esc(opt.code) + '" data-template-row="' + rowIndex + '"' + checked + '> ' + esc(opt.label) + '</label>';
    }).join('') + '</div>';
}

function normalizeRequiredPolicy(row){
    if(Array.isArray(row.required_codes)) return row.required_codes.map(clean).filter(Boolean);
    if(Array.isArray(row.required)) return row.required.map(clean).filter(Boolean);
    var text = String(row.required || '');
    var found = [];
    WINDOWS_REQUIRED_OPTIONS.forEach(function(opt){
        if(text.indexOf(opt.code) >= 0 || text.indexOf(opt.label) >= 0) found.push(opt.code);
    });
    return found;
}

function requiredLabelList(codes){
    var map = {};
    WINDOWS_REQUIRED_OPTIONS.forEach(function(opt){ map[opt.code] = opt.label; });
    return (codes || []).map(function(code){ return map[code] || code; });
}

function requiredChipHtml(code){
    return '<span class="account-policy-required-chip">' + esc(requiredLabelList([code])[0] || code) + '</span>';
}

function requiredCheckboxHtml(rowIndex, selectedCodes){
    selectedCodes = selectedCodes || [];
    return '<div class="account-policy-required-select">' + WINDOWS_REQUIRED_OPTIONS.map(function(opt){
        var checked = selectedCodes.indexOf(opt.code) >= 0 ? ' checked' : '';
        return '<label><input type="checkbox" data-required-policy="' + esc(opt.code) + '" data-required-row="' + rowIndex + '"' + checked + '> ' + esc(opt.label) + '</label>';
    }).join('') + '</div>';
}

function policyOptionHtml(options, selected){
    return (options || []).map(function(opt){
        return '<option value="' + esc(opt.value) + '"' + (String(opt.value) === String(selected) ? ' selected' : '') + '>' + esc(opt.label) + '</option>';
    }).join('');
}

function policyControlValue(page, key){
    var defaults = defaultPolicyControls();
    var pageDefaults = (defaults[page] || {});
    var savedPage = (((policy || {}).policy_controls || {})[page] || {});
    var base = pageDefaults[key] || {};
    var saved = savedPage[key] || {};
    return Object.assign({}, base, saved, {settings:Object.assign({}, base.settings || {}, saved.settings || {})});
}

function policyFieldControlHtml(item, field, saved){
    var settings = saved.settings || {};
    var value = settings[field.key] != null ? settings[field.key] : field.value;
    var label = '<span>' + esc(field.label) + '</span>';
    if(field.type === 'select') {
        return '<span class="account-policy-control-field">' + label + '<select data-policy-setting="' + esc(field.key) + '">' + policyOptionHtml(field.options || [], value) + '</select></span>';
    }
    return '<span class="account-policy-control-field">' + label + '<input data-policy-setting="' + esc(field.key) + '" type="' + esc(field.type || 'text') + '" value="' + esc(value == null ? '' : value) + '"' + (field.type === 'number' ? ' min="0"' : '') + '>' + (field.unit ? '<span>' + esc(field.unit) + '</span>' : '') + '</span>';
}

function renderPolicyControlItem(page, item, group, groupHasValueFields){
    var saved = policyControlValue(page, item.key);
    var fieldList = item.fields || [];
    var fields = fieldList.map(function(field){ return policyFieldControlHtml(item, field, saved); }).join('');
    var html = [
        '<div class="account-policy-control-row" data-policy-control-item="' + esc(item.key) + '">',
        '<label class="account-policy-control-switch" title="사용 여부"><input type="checkbox" data-policy-enabled' + (saved.enabled !== false ? ' checked' : '') + '></label>',
        '<div class="account-policy-control-name">' + esc(item.name) + (item.desc ? '<span class="account-policy-control-sub">' + esc(item.desc) + '</span>' : '') + '</div>'
    ];
    if(fieldList.length || groupHasValueFields) html.push('<div class="account-policy-control-fieldset">' + fields + '</div>');
    if(!group.hideAction) html.push('<select data-policy-action>' + policyOptionHtml(POLICY_ACTION_OPTIONS, saved.action || 'warn') + '</select>');
    html.push('</div>');
    return html.join('');
}

function renderPolicyControlGroup(page, group){
    var hasValueFields = (group.items || []).some(function(item){ return (item.fields || []).length; });
    var tableHead = hasValueFields
        ? '<div class="account-policy-control-table-head"><span>사용</span><span>정책</span><span>기준값</span>' + (group.hideAction ? '' : '<span>위반 처리</span>') + '</div>'
        : '<div class="account-policy-control-table-head"><span>사용</span><span>정책</span>' + (group.hideAction ? '' : '<span>위반 처리</span>') + '</div>';
    return [
        '<section class="account-policy-control-card' + (hasValueFields ? '' : ' is-simple') + (group.hideAction ? ' is-no-action' : '') + '">',
        '<div class="account-policy-control-head"><div><h3>' + esc(group.title) + '</h3><p>' + esc(group.desc || '') + '</p></div><button type="button" class="account-policy-control-save" data-policy-control-save="' + esc(page) + '">' + saveIconHtml() + '</button></div>',
        '<div class="account-policy-control-list">',
        tableHead,
        (group.items || []).map(function(item){ return renderPolicyControlItem(page, item, group, hasValueFields); }).join('') || '<div class="account-policy-control-empty">정책 항목이 없습니다.</div>',
        '</div>',
        '</section>'
    ].join('');
}

function renderPolicyControlBoards(){
    $all('[data-policy-control-board]').forEach(function(board){
        var page = board.getAttribute('data-policy-control-board') || 'common';
        var groups = POLICY_CONTROL_DEFS[page] || [];
        board.innerHTML = groups.map(function(group){ return renderPolicyControlGroup(page, group); }).join('');
    });
}

function render(item){
    policy = normalizePolicy(item || policy || defaultPolicy());
    renderPolicyControlBoards();
    renderCommon();
    renderLinux();
    arrangeLinuxSaveButtons();
    renderWindows();
    arrangeWindowsSaveButtons();
}

function valueAt(obj, path){
    return path.split('.').reduce(function(cur, key){ return cur && cur[key]; }, obj);
}

function setValueAt(obj, path, value){
    var parts = path.split('.');
    var cur = obj;
    parts.slice(0, -1).forEach(function(key){
        if(!cur[key] || typeof cur[key] !== 'object') cur[key] = {};
        cur = cur[key];
    });
    cur[parts[parts.length - 1]] = value;
}

function renderCommon(){
    var common = policy.common || defaultCommonPolicy();
    $all('[data-common-field]').forEach(function(input){
        var val = valueAt(common, input.getAttribute('data-common-field'));
        if(input.type === 'checkbox') input.checked = !!val;
        else input.value = val == null ? '' : String(val);
    });
    syncMaskPatternControl();
    $all('[data-common-collection]').forEach(function(input){
        input.checked = !!((common.collection || {})[input.getAttribute('data-common-collection')]);
    });
    $all('[data-common-interval]').forEach(function(input){
        var key = input.getAttribute('data-common-interval');
        var val = (common.collection_intervals || {})[key];
        input.value = val == null ? '' : String(val);
    });
    $all('[data-common-security]').forEach(function(input){
        input.checked = !!((common.security || {})[input.getAttribute('data-common-security')]);
    });
    $all('[data-common-security-option]').forEach(function(input){
        var key = input.getAttribute('data-common-security-option');
        var val = (common.security || {})[key];
        input.value = val == null ? '' : String(val);
    });
}

var DEFAULT_MASK_PATTERNS = ['password', 'passwd', 'secret', 'token', 'api_key', 'access_key', 'private_key', 'authorization', 'cookie'];

function parseMaskPatterns(value){
    var seen = {};
    return String(value || '').split(',').map(function(v){ return clean(v); }).filter(function(v){
        if(!v || seen[v.toLowerCase()]) return false;
        seen[v.toLowerCase()] = true;
        return true;
    });
}

function writeMaskPatterns(values){
    var hidden = $('[data-common-field="log.masking_patterns"]');
    if(hidden) hidden.value = values.join(', ');
}

function syncMaskPatternControl(){
    var hidden = $('[data-common-field="log.masking_patterns"]');
    var row = $('[data-mask-chip-row]');
    if(!hidden || !row) return;
    var values = parseMaskPatterns(hidden.value);
    var all = DEFAULT_MASK_PATTERNS.slice();
    values.forEach(function(v){ if(all.map(function(x){ return x.toLowerCase(); }).indexOf(v.toLowerCase()) < 0) all.push(v); });
    row.innerHTML = all.map(function(v){
        var active = values.map(function(x){ return x.toLowerCase(); }).indexOf(v.toLowerCase()) >= 0;
        return '<button type="button" class="account-policy-mask-chip' + (active ? ' is-active' : '') + '" data-mask-token="' + esc(v) + '">' + esc(v) + '</button>';
    }).join('');
}

function toggleMaskPattern(token){
    var hidden = $('[data-common-field="log.masking_patterns"]');
    if(!hidden || !token) return;
    var values = parseMaskPatterns(hidden.value);
    var idx = values.map(function(v){ return v.toLowerCase(); }).indexOf(token.toLowerCase());
    if(idx >= 0) values.splice(idx, 1);
    else values.push(token);
    writeMaskPatterns(values);
    syncMaskPatternControl();
}

function addCustomMaskPattern(){
    var input = $('[data-mask-custom]');
    if(!input) return;
    var token = clean(input.value).replace(/[^A-Za-z0-9_.-]/g, '');
    if(!token) return;
    var hidden = $('[data-common-field="log.masking_patterns"]');
    var values = parseMaskPatterns(hidden ? hidden.value : '');
    if(values.map(function(v){ return v.toLowerCase(); }).indexOf(token.toLowerCase()) < 0) values.push(token);
    writeMaskPatterns(values);
    input.value = '';
    syncMaskPatternControl();
}

function renderLinuxRules(){
    var target = $('#account-policy-linux-rules');
    if(!target) return;
    var groups = policy.groups || [];
    target.innerHTML = (policy.categories || []).map(function(cat){
        var catName = clean(cat.name);
        var gids = groups.filter(function(row){ return clean(row.category) === catName; }).map(function(row){ return row.gid; }).filter(Boolean);
        var gidText = gids.length ? String(Math.min.apply(Math, gids)) + '부터 10 단위' : '-';
        return '<tr><td><span class="account-policy-value">' + esc(catName || '-') + '</span></td><td><span class="account-policy-value">' + esc((cat.uid_start || '-') + ' ~ ' + (cat.uid_end || '-')) + '</span></td><td><span class="account-policy-value is-muted">' + esc(gidText) + '</span></td><td><span class="account-policy-value is-muted">' + esc(cat.home_template || '/home/{account}') + '</span></td></tr>';
    }).join('');
}

function setFormReadOnly(root, editing){
    if(!root) return;
    $all('input,textarea,select', root).forEach(function(el){
        el.disabled = !editing;
    });
}

function renderLinuxShell(){
    var card = $('#account-policy-linux-shell-card');
    if(!card) return;
    var serviceShell = $('#account-policy-service-shell');
    var operatorShell = $('#account-policy-operator-shell');
    if(serviceShell) serviceShell.value = policy.service_shell || '/sbin/nologin';
    if(operatorShell) operatorShell.value = policy.operator_shell || '/bin/bash';
    renderSectionButton($('#account-policy-linux-shell-save'), linuxShellEditing);
    setFormReadOnly(card, linuxShellEditing);
}

function renderLinuxProtection(){
    var card = $('#account-policy-linux-protection-card');
    if(!card) return;
    var reserved = $('#account-policy-reserved-accounts');
    var protectedAccounts = $('#account-policy-protected-accounts');
    if(reserved) reserved.value = (policy.reserved_accounts || []).join(', ');
    if(protectedAccounts) protectedAccounts.value = (policy.protected_delete_accounts || DELETE_PROTECTED_DEFAULTS).join(', ');
    renderSectionButton($('#account-policy-linux-protection-save'), linuxProtectionEditing);
    setFormReadOnly(card, linuxProtectionEditing);
}

function renderLinuxValidation(){
    var card = $('#account-policy-linux-validation-card');
    if(!card) return;
    var validation = policy.linux_validation || {};
    $all('[data-linux-validation]', card).forEach(function(input){
        var key = input.getAttribute('data-linux-validation');
        input.checked = validation[key] !== false;
    });
    renderSectionButton($('#account-policy-linux-validation-save'), linuxValidationEditing);
    setFormReadOnly(card, linuxValidationEditing);
}

function renderLinux(){
    var cats = policy.categories || [];
    var groups = policy.groups || [];
    $('#account-policy-category-count').textContent = String(cats.length);
    $('#account-policy-group-count').textContent = String(groups.length);
    renderSectionButton($('#account-policy-category-save'), categoryEditing);
    renderSectionButton($('#account-policy-group-save'), groupEditing);
    renderAddButton($('#account-policy-category-add'), categoryEditing);
    renderAddButton($('#account-policy-group-add'), groupEditing);
    $('#account-policy-categories').innerHTML = cats.map(function(row){
        if(!categoryEditing) {
            return '<tr><td><span class="account-policy-value">' + esc(row.name || '-') + '</span></td><td><span class="account-policy-value">' + esc(row.uid_start || '-') + '</span></td><td><span class="account-policy-value">' + esc(row.uid_end || '-') + '</span></td><td><span class="account-policy-value is-muted">' + esc(row.home_template || '/home/{account}') + '</span></td><td class="account-policy-delete-cell"></td></tr>';
        }
        return '<tr><td><input data-field="name" value="' + esc(row.name || '') + '"></td><td><input data-field="uid_start" type="number" value="' + esc(row.uid_start || '') + '"></td><td><input data-field="uid_end" type="number" value="' + esc(row.uid_end || '') + '"></td><td><input data-field="home_template" value="' + esc(row.home_template || '/home/{account}') + '"></td><td class="account-policy-delete-cell">' + deleteButtonHtml('category', row.name || '') + '</td></tr>';
    }).join('');
    var grouped = {};
    var order = [];
    cats.forEach(function(cat){ var n = clean(cat.name); if(n && !grouped[n]){ grouped[n] = []; order.push(n); } });
    groups.forEach(function(row){ var c = clean(row.category) || '미분류'; if(!grouped[c]){ grouped[c] = []; order.push(c); } grouped[c].push(row); });
    var rows = [];
    order.forEach(function(category){
        var list = grouped[category] || [];
        var expanded = !!groupExpanded[category];
        rows.push('<tr class="account-policy-group-head" data-policy-group-head="' + esc(category) + '"><td colspan="4"><button type="button" class="account-policy-group-toggle"><span class="account-policy-group-toggle-icon' + (expanded ? ' is-open' : '') + '">›</span><span>' + esc(category) + '</span><span class="account-policy-group-count">' + list.length + '</span></button></td></tr>');
        if(!expanded) return;
        list.forEach(function(row){
            if(!groupEditing) {
                rows.push('<tr><td><span class="account-policy-value is-muted">' + esc(row.category || '-') + '</span></td><td><span class="account-policy-value">' + esc(row.name || '-') + '</span></td><td><span class="account-policy-value">' + esc(row.gid || '-') + '</span></td><td class="account-policy-delete-cell"></td></tr>');
            } else {
                rows.push('<tr><td><select data-field="category">' + categoryOptionsHtml(clean(row.category || category)) + '</select></td><td><input data-field="name" value="' + esc(row.name || '') + '"></td><td><input data-field="gid" type="number" step="10" value="' + esc(row.gid || '') + '"></td><td class="account-policy-delete-cell">' + deleteButtonHtml('group', row.name || '') + '</td></tr>');
            }
        });
    });
    $('#account-policy-groups').innerHTML = rows.join('');
    renderLinuxRules();
    renderLinuxShell();
    renderLinuxProtection();
    renderLinuxValidation();
}

function policyField(label, html){
    return '<label><span>' + esc(label) + '</span>' + html + '</label>';
}

function windowsTypeDescription(row){
    var value = clean(row.description);
    if(value) return value;
    var name = clean(row.name);
    var map = {
        '서비스 계정':'서비스 실행 계정',
        '운영자 계정':'운영자 원격 접속',
        '벤더 계정':'외주/벤더 작업 계정',
        '임시 계정':'기간제 임시 작업 계정'
    };
    return map[name] || '';
}

function windowsTypeRowHtml(row, idx){
    var requiredCodes = normalizeRequiredPolicy(row);
    var name = clean(row.name);
    var prefix = clean(row.prefix);
    var example = clean(row.example);
    var template = clean(row.template);
    if(!windowsTypeEditing) {
        return [
            '<div class="account-policy-template-card account-policy-windows-type-card" data-windows-type-row="' + idx + '">',
            '<div class="account-policy-template-meta"><span class="account-policy-policy-label">계정 유형</span><span class="account-policy-template-name">' + esc(name || '-') + '</span></div>',
            '<div class="account-policy-template-meta"><span class="account-policy-policy-label">접두어</span><span class="account-policy-template-purpose">' + esc(prefix || '-') + '</span></div>',
            '<div class="account-policy-template-meta"><span class="account-policy-policy-label">생성 예시</span><span class="account-policy-template-purpose">' + esc(example || '-') + '</span></div>',
            '<div class="account-policy-template-meta"><span class="account-policy-policy-label">기본 템플릿</span><div class="account-policy-policy-summary"><span class="account-policy-policy-pill">' + esc(template || '-') + '</span></div></div>',
            '<div class="account-policy-template-meta"><span class="account-policy-policy-label">필수 정책</span><div class="account-policy-policy-summary">' + (requiredCodes.length ? requiredCodes.map(requiredChipHtml).join('') : '<span class="account-policy-policy-pill is-neutral">필수 정책 없음</span>') + '</div></div>',
            '<div></div>',
            '</div>'
        ].join('');
    }
    return [
        '<div class="account-policy-template-card account-policy-windows-type-card is-editing" data-windows-type-row="' + idx + '">',
        '<div class="account-policy-windows-type-main">',
        '<div class="account-policy-policy-fields">',
        policyField('계정 유형', '<input data-field="name" value="' + esc(name) + '">'),
        '</div>',
        '<div class="account-policy-policy-fields">',
        policyField('접두어', '<input data-field="prefix" value="' + esc(prefix) + '">'),
        '</div>',
        '<div class="account-policy-policy-fields">',
        policyField('생성 예시', '<input data-field="example" value="' + esc(example) + '">'),
        '</div>',
        '<div class="account-policy-policy-fields account-policy-policy-fields-wide">',
        policyField('기본 템플릿', '<span class="account-policy-select-wrap"><select data-field="template">' + templateOptionsHtml(template) + '</select></span>'),
        '</div>',
        '</div>',
        '<div class="account-policy-windows-type-required"><span>필수 정책</span>' + requiredCheckboxHtml(idx, requiredCodes) + '</div>',
        '<div class="account-policy-policy-actions">' + deleteButtonHtml('windows-type', name || '') + '</div>',
        '</div>'
    ].join('');
}

function windowsRuleRowHtml(row, idx){
    var category = clean(row.category);
    var group = clean(row.group);
    var localGroup = clean(row.local_group);
    var adGroup = clean(row.ad_group);
    var template = clean(row.template);
    if(!windowsRuleEditing) {
        return [
            '<div class="account-policy-windows-policy-row" data-windows-rule-row="' + idx + '">',
            '<div class="account-policy-policy-block"><span class="account-policy-policy-label">업무 / 세부그룹</span><span class="account-policy-policy-title">' + esc(category || '-') + '</span><span class="account-policy-policy-sub">' + esc(group || '-') + '</span></div>',
            '<div class="account-policy-policy-block"><span class="account-policy-policy-label">그룹 매핑</span><span class="account-policy-policy-title">' + esc(localGroup || '-') + '</span><span class="account-policy-policy-sub">AD ' + esc(adGroup || '-') + '</span></div>',
            '<div class="account-policy-policy-block"><span class="account-policy-policy-label">권한 템플릿</span><div class="account-policy-policy-summary"><span class="account-policy-policy-pill">' + esc(template || '-') + '</span></div></div>',
            '<div class="account-policy-policy-actions"></div>',
            '</div>'
        ].join('');
    }
    return [
        '<div class="account-policy-windows-policy-row is-editing" data-windows-rule-row="' + idx + '">',
        '<div class="account-policy-policy-fields">',
        policyField('업무분류', '<span class="account-policy-select-wrap"><select data-field="category">' + categoryOptionsHtml(category) + '</select></span>'),
        policyField('세부그룹', '<input data-field="group" value="' + esc(group) + '">'),
        '</div>',
        '<div class="account-policy-policy-fields">',
        policyField('Local Group', '<input data-field="local_group" value="' + esc(localGroup) + '">'),
        policyField('AD Group', '<input data-field="ad_group" value="' + esc(adGroup) + '">'),
        '</div>',
        '<div class="account-policy-policy-fields">',
        policyField('권한 템플릿', '<span class="account-policy-select-wrap"><select data-field="template">' + templateOptionsHtml(template) + '</select></span>'),
        '</div>',
        '<div class="account-policy-policy-actions">' + deleteButtonHtml('windows-rule', group || '') + '</div>',
        '</div>'
    ].join('');
}

function renderWindows(){
    var types = policy.windows.account_types || [];
    var rules = policy.windows.group_rules || [];
    var templates = policy.windows.rights_templates || [];
    $('#account-policy-windows-type-count').textContent = String(types.length);
    $('#account-policy-windows-rule-count').textContent = String(rules.length);
    if($('#account-policy-windows-template-count')) $('#account-policy-windows-template-count').textContent = String(templates.length);
    renderSectionButton($('#account-policy-windows-type-save'), windowsTypeEditing);
    renderSectionButton($('#account-policy-windows-rule-save'), windowsRuleEditing);
    renderSectionButton($('#account-policy-windows-template-save'), windowsTemplateEditing);
    renderAddButton($('#account-policy-windows-type-add'), windowsTypeEditing);
    renderAddButton($('#account-policy-windows-rule-add'), windowsRuleEditing);
    renderAddButton($('#account-policy-windows-template-add'), windowsTemplateEditing);
    $('#account-policy-windows-types').innerHTML = types.map(windowsTypeRowHtml).join('');
    $('#account-policy-windows-rules').innerHTML = rules.map(windowsRuleRowHtml).join('');
    if($('#account-policy-windows-templates')) {
        $('#account-policy-windows-templates').innerHTML = templates.map(function(row, idx){
            var name = clean(row.name);
            var purpose = clean(row.purpose) || windowsTemplatePurpose(name);
            var codes = normalizeTemplateRights(row);
            if(!windowsTemplateEditing) {
                return '<div class="account-policy-template-card"><div class="account-policy-template-meta"><span class="account-policy-template-name">' + esc(name || '-') + '</span></div><div class="account-policy-template-meta"><span class="account-policy-template-purpose">' + esc(purpose || '-') + '</span></div><div class="account-policy-right-summary">' + (codes.length ? codes.map(rightChipHtml).join('') : '<span class="account-policy-value is-muted">-</span>') + '</div><div></div></div>';
            }
            return '<div class="account-policy-template-card is-editing" data-template-row="' + idx + '"><div class="account-policy-template-meta"><input data-field="name" value="' + esc(name || '') + '" placeholder="템플릿명"></div><div class="account-policy-template-meta"><input data-field="purpose" value="' + esc(purpose || '') + '" placeholder="사용 목적"></div><div>' + rightsCheckboxHtml(idx, codes) + '</div><div class="account-policy-template-delete">' + deleteButtonHtml('windows-template', name || '') + '</div></div>';
        }).join('');
    }
}

function readTableRows(selector, numericFields){
    var rows = [];
    $all(selector + ' tr').forEach(function(tr){
        if(tr.classList.contains('account-policy-group-head')) return;
        var row = {};
        $all('[data-field]', tr).forEach(function(input){
            var key = input.dataset.field;
            row[key] = numericFields.indexOf(key) >= 0 ? parseInt(input.value || '0', 10) : clean(input.value);
        });
        if(Object.keys(row).some(function(k){ return row[k]; })) rows.push(row);
    });
    return rows;
}

function readCategories(){ return categoryEditing ? readTableRows('#account-policy-categories', ['uid_start','uid_end']).filter(function(r){ return r.name; }) : policy.categories.slice(); }
function readGroups(){
    if(!groupEditing) return policy.groups.slice();
    var rows = readTableRows('#account-policy-groups', ['gid']).filter(function(r){ return r.category && r.name && r.gid; });
    var seen = {};
    rows.forEach(function(row){ seen[clean(row.category) + '::' + clean(row.name)] = true; });
    (policy.groups || []).forEach(function(row){
        var category = clean(row.category);
        if(groupExpanded[category]) return;
        var key = category + '::' + clean(row.name);
        if(!seen[key]) rows.push(row);
    });
    return rows;
}
function readWindowsTypes(){
    if(!windowsTypeEditing) return policy.windows.account_types.slice();
    var rows = [];
    $all('#account-policy-windows-types [data-windows-type-row]').forEach(function(tr){
        var row = {};
        $all('[data-field]', tr).forEach(function(input){
            row[input.dataset.field] = clean(input.value);
        });
        if(!row.name) return;
        row.required_codes = $all('[data-required-policy]:checked', tr).map(function(input){ return input.getAttribute('data-required-policy'); }).filter(Boolean);
        rows.push(row);
    });
    return rows;
}
function readWindowsRules(){
    if(!windowsRuleEditing) return policy.windows.group_rules.slice();
    var rows = [];
    $all('#account-policy-windows-rules [data-windows-rule-row]').forEach(function(tr){
        var row = {};
        $all('[data-field]', tr).forEach(function(input){
            row[input.dataset.field] = clean(input.value);
        });
        if(row.category && row.group) rows.push(row);
    });
    return rows;
}
function readWindowsTemplates(){
    if(!windowsTemplateEditing) return (policy.windows.rights_templates || []).slice();
    var rows = [];
    $all('#account-policy-windows-templates [data-template-row]').forEach(function(tr){
        var nameEl = $('[data-field="name"]', tr);
        var purposeEl = $('[data-field="purpose"]', tr);
        var name = clean(nameEl && nameEl.value);
        if(!name) return;
        var codes = $all('[data-template-right]:checked', tr).map(function(input){ return input.getAttribute('data-template-right'); }).filter(Boolean);
        rows.push({name:name, purpose:clean(purposeEl && purposeEl.value) || windowsTemplatePurpose(name), right_codes:codes});
    });
    return rows;
}

function splitAccountList(value){
    return String(value || '').split(/[\n,]/).map(function(v){ return clean(v); }).filter(Boolean);
}

function readLinuxShell(){
    return {
        service_shell: clean(($('#account-policy-service-shell') || {}).value) || '/sbin/nologin',
        operator_shell: clean(($('#account-policy-operator-shell') || {}).value) || '/bin/bash'
    };
}

function readLinuxProtection(){
    return {
        reserved_accounts: splitAccountList(($('#account-policy-reserved-accounts') || {}).value),
        protected_delete_accounts: splitAccountList(($('#account-policy-protected-accounts') || {}).value)
    };
}

function readLinuxValidation(){
    var result = {};
    $all('[data-linux-validation]').forEach(function(input){
        result[input.getAttribute('data-linux-validation')] = input.checked;
    });
    return {linux_validation: result};
}

function readCommon(){
    var common = JSON.parse(JSON.stringify((policy && policy.common) || defaultCommonPolicy()));
    $all('[data-common-field]').forEach(function(input){
        var key = input.getAttribute('data-common-field');
        var value = input.type === 'checkbox' ? input.checked : input.value;
        if(input.type === 'number') value = parseInt(input.value || '0', 10);
        setValueAt(common, key, value);
    });
    common.collection = common.collection || {};
    $all('[data-common-collection]').forEach(function(input){
        common.collection[input.getAttribute('data-common-collection')] = input.checked;
    });
    common.collection_intervals = common.collection_intervals || {};
    $all('[data-common-interval]').forEach(function(input){
        common.collection_intervals[input.getAttribute('data-common-interval')] = parseInt(input.value || '0', 10);
    });
    delete common.update;
    delete common.tags;
    delete common.rollout;
    if(common.collection) delete common.collection.immediate_collection;
    common.security = common.security || {};
    $all('[data-common-security]').forEach(function(input){
        common.security[input.getAttribute('data-common-security')] = input.checked;
    });
    $all('[data-common-security-option]').forEach(function(input){
        common.security[input.getAttribute('data-common-security-option')] = input.value;
    });
    return common;
}

function validateCategories(cats){
    var ranges = (cats || []).map(function(row){ return {name:clean(row.name), start:parseInt(row.uid_start || '0', 10), end:parseInt(row.uid_end || '0', 10)}; }).filter(function(row){ return row.name; });
    for(var i = 0; i < ranges.length; i += 1) {
        if(!ranges[i].start || !ranges[i].end || ranges[i].start > ranges[i].end) throw new Error(ranges[i].name + ' UID 범위를 확인하세요.');
    }
    ranges.sort(function(a, b){ return a.start - b.start; });
    for(var j = 1; j < ranges.length; j += 1) {
        if(ranges[j - 1].end >= ranges[j].start) throw new Error(ranges[j - 1].name + ' 범위와 ' + ranges[j].name + ' 범위가 겹칩니다.');
    }
}

function buildPayload(partial){
    var base = normalizePolicy(policy);
    var payload = Object.assign({}, base, partial || {});
    payload.windows = Object.assign({}, base.windows, (partial && partial.windows) || {});
    return payload;
}

async function savePayload(payload){
    var res = await api(API, {method:'PUT', body:JSON.stringify({item:payload})});
    policy = normalizePolicy(res.item || payload);
    render(policy);
}

function readPolicyControlPage(page){
    var result = {};
    $all('[data-policy-control-board="' + page + '"] [data-policy-control-item]').forEach(function(row){
        var key = row.getAttribute('data-policy-control-item');
        var settings = {};
        $all('[data-policy-setting]', row).forEach(function(input){
            var settingKey = input.getAttribute('data-policy-setting');
            var value = input.type === 'checkbox' ? input.checked : input.value;
            if(input.type === 'number') value = parseInt(input.value || '0', 10);
            settings[settingKey] = value;
        });
        result[key] = {
            enabled: !!($('[data-policy-enabled]', row) && $('[data-policy-enabled]', row).checked),
            action: ($('[data-policy-action]', row) || {}).value || 'warn',
            target: 'all',
            exceptions: '',
            apply_mode: 'immediate',
            settings: settings
        };
    });
    return result;
}

async function savePolicyControlPage(page){
    try {
        var controls = Object.assign({}, (policy && policy.policy_controls) || {});
        controls[page] = readPolicyControlPage(page);
        await savePayload(buildPayload({policy_controls: controls}));
        var labels = {common:'공통 정책', linux:'Linux 정책', windows:'Windows 정책'};
        toast((labels[page] || '정책') + '이 저장되었습니다.', 'success');
    } catch(e) {
        toast(e.message || '정책 저장 중 오류가 발생했습니다.', 'error');
    }
}

async function saveSection(section){
    try {
        if(section === 'common') {
            await savePayload(buildPayload({common: readCommon()}));
            toast('에이전트 공통 정책이 저장되었습니다.', 'success');
            return;
        }
        if(section === 'categories' && !categoryEditing){ categoryEditing = true; render(policy); return; }
        if(section === 'groups' && !groupEditing){ groupEditing = true; render(policy); return; }
        if(section === 'linux-shell' && !linuxShellEditing){ linuxShellEditing = true; render(policy); return; }
        if(section === 'linux-protection' && !linuxProtectionEditing){ linuxProtectionEditing = true; render(policy); return; }
        if(section === 'linux-validation' && !linuxValidationEditing){ linuxValidationEditing = true; render(policy); return; }
        if(section === 'windows-types' && !windowsTypeEditing){ windowsTypeEditing = true; render(policy); return; }
        if(section === 'windows-rules' && !windowsRuleEditing){ windowsRuleEditing = true; render(policy); return; }
        if(section === 'windows-templates' && !windowsTemplateEditing){ windowsTemplateEditing = true; render(policy); return; }
        var payload;
        if(section === 'categories') {
            var cats = readCategories();
            validateCategories(cats);
            payload = buildPayload({categories: cats});
            categoryEditing = false;
        } else if(section === 'groups') {
            payload = buildPayload({groups: readGroups()});
            Object.keys(groupExpanded).forEach(function(key){ groupExpanded[key] = true; });
            groupEditing = false;
        } else if(section === 'linux-shell') {
            payload = buildPayload(readLinuxShell());
            linuxShellEditing = true;
        } else if(section === 'linux-protection') {
            payload = buildPayload(readLinuxProtection());
            linuxProtectionEditing = true;
        } else if(section === 'linux-validation') {
            payload = buildPayload(readLinuxValidation());
            linuxValidationEditing = true;
        } else if(section === 'windows-types') {
            payload = buildPayload({windows: {account_types: readWindowsTypes()}});
            windowsTypeEditing = false;
        } else if(section === 'windows-rules') {
            payload = buildPayload({windows: {group_rules: readWindowsRules()}});
            windowsRuleEditing = false;
        } else if(section === 'windows-templates') {
            payload = buildPayload({windows: {rights_templates: readWindowsTemplates()}});
            windowsTemplateEditing = false;
        }
        await savePayload(payload);
    } catch(e) {
        toast(e.message || '정책 저장 중 오류가 발생했습니다.', 'error');
    }
}

function addCategoryRow(){
    if(!categoryEditing) return;
    $('#account-policy-categories').insertAdjacentHTML('beforeend', '<tr><td><input data-field="name" value=""></td><td><input data-field="uid_start" type="number" value=""></td><td><input data-field="uid_end" type="number" value=""></td><td><input data-field="home_template" value="/home/{account}"></td><td class="account-policy-delete-cell">' + deleteButtonHtml('category', '') + '</td></tr>');
}
function addGroupRow(){
    if(!groupEditing) return;
    var category = clean((policy.categories[0] || {}).name);
    $('#account-policy-groups').insertAdjacentHTML('beforeend', '<tr><td><select data-field="category">' + categoryOptionsHtml(category) + '</select></td><td><input data-field="name" value=""></td><td><input data-field="gid" type="number" step="10" value=""></td><td class="account-policy-delete-cell">' + deleteButtonHtml('group', '') + '</td></tr>');
}
function addWindowsTypeRow(){
    if(!windowsTypeEditing) return;
    var row = {name:'', prefix:'', example:'', template:'NoInteractiveLogin', description:'', required_codes:['expiration_date','owner_department','manager','approval_history']};
    var idx = $all('#account-policy-windows-types [data-windows-type-row]').length;
    $('#account-policy-windows-types').insertAdjacentHTML('beforeend', windowsTypeRowHtml(row, idx));
}
function addWindowsRuleRow(){
    if(!windowsRuleEditing) return;
    var category = clean((policy.categories[0] || {}).name);
    var row = {category:category, group:'', local_group:'LUM-', ad_group:'LUM-', template:'NoInteractiveLogin'};
    var idx = $all('#account-policy-windows-rules [data-windows-rule-row]').length;
    $('#account-policy-windows-rules').insertAdjacentHTML('beforeend', windowsRuleRowHtml(row, idx));
}
function addWindowsTemplateRow(){
    if(!windowsTemplateEditing) return;
    var idx = $all('#account-policy-windows-templates [data-template-row]').length;
    $('#account-policy-windows-templates').insertAdjacentHTML('beforeend', '<div class="account-policy-template-card is-editing" data-template-row="' + idx + '"><div class="account-policy-template-meta"><input data-field="name" value="" placeholder="템플릿명"></div><div class="account-policy-template-meta"><input data-field="purpose" value="" placeholder="사용 목적"></div><div>' + rightsCheckboxHtml(idx, []) + '</div><div class="account-policy-template-delete">' + deleteButtonHtml('windows-template', '') + '</div></div>');
}

async function load(){
    try {
        var res = await api(API);
        render(res.item || defaultPolicy());
    } catch(e) {
        render(defaultPolicy());
        toast(e.message || '계정정책을 불러오지 못했습니다.', 'error');
    }
}

function bindTabs(){
    $all('[data-policy-os-tab]').forEach(function(btn){
        btn.addEventListener('click', function(){
            activeOs = btn.getAttribute('data-policy-os-tab') || 'linux';
            $all('[data-policy-os-tab]').forEach(function(el){ el.classList.toggle('is-active', el === btn); el.setAttribute('aria-selected', el === btn ? 'true' : 'false'); });
            $all('[data-policy-os-panel]').forEach(function(panel){ panel.classList.toggle('is-active', panel.getAttribute('data-policy-os-panel') === activeOs); });
        });
    });
}

function activatePolicyPage(){
    var root = $('#account-policy-root');
    var path = (window.location && window.location.pathname) || '';
    var pathMode = '';
    ['common','linux','windows'].some(function(mode){
        if(path.indexOf('/account-policy/' + mode) >= 0) {
            pathMode = mode;
            return true;
        }
        return false;
    });
    activeOs = pathMode || (root && root.getAttribute('data-policy-page-mode')) || 'common';
    if(root) root.setAttribute('data-policy-page-mode', activeOs);
    $all('[data-policy-page]').forEach(function(panel){
        panel.classList.toggle('is-active', panel.getAttribute('data-policy-page') === activeOs);
    });
}

function init(){
    var root = $('#account-policy-root');
    if(!root) return;
    ensureStyle();
    arrangeCommonSaveButtons();
    activatePolicyPage();
    if(root.getAttribute('data-account-policy-bound') === '1') {
        render(policy || defaultPolicy());
        return;
    }
    root.setAttribute('data-account-policy-bound', '1');
    bindTabs();
    $all('.account-policy-common-section-save').forEach(function(btn){
        btn.addEventListener('click', function(){ saveSection('common'); });
    });
    [
        ['#account-policy-category-save', function(){ saveSection('categories'); }],
        ['#account-policy-group-save', function(){ saveSection('groups'); }],
        ['#account-policy-linux-shell-save', function(){ saveSection('linux-shell'); }],
        ['#account-policy-linux-protection-save', function(){ saveSection('linux-protection'); }],
        ['#account-policy-linux-validation-save', function(){ saveSection('linux-validation'); }],
        ['#account-policy-windows-type-save', function(){ saveSection('windows-types'); }],
        ['#account-policy-windows-rule-save', function(){ saveSection('windows-rules'); }],
        ['#account-policy-windows-template-save', function(){ saveSection('windows-templates'); }],
        ['#account-policy-category-add', addCategoryRow],
        ['#account-policy-group-add', addGroupRow],
        ['#account-policy-windows-type-add', addWindowsTypeRow],
        ['#account-policy-windows-rule-add', addWindowsRuleRow],
        ['#account-policy-windows-template-add', addWindowsTemplateRow]
    ].forEach(function(pair){
        var el = $(pair[0]);
        if(el) el.addEventListener('click', pair[1]);
    });
    document.addEventListener('click', function(e){
        var policySave = e.target.closest('[data-policy-control-save]');
        if(policySave) {
            savePolicyControlPage(policySave.getAttribute('data-policy-control-save') || 'common');
            return;
        }
        var chip = e.target.closest('[data-mask-token]');
        if(chip) {
            toggleMaskPattern(chip.getAttribute('data-mask-token'));
            return;
        }
        if(e.target.closest('[data-mask-add]')) {
            addCustomMaskPattern();
            return;
        }
        var del = e.target.closest('[data-policy-delete-category],[data-policy-delete-group],[data-policy-delete-windows-type],[data-policy-delete-windows-rule],[data-policy-delete-windows-template]');
        if(del) {
            var tr = del.closest('tr') || del.closest('[data-windows-type-row]') || del.closest('[data-windows-rule-row]') || del.closest('[data-template-row]');
            if(tr) tr.parentNode.removeChild(tr);
            return;
        }
        var head = e.target.closest('[data-policy-group-head]');
        if(head) {
            var key = head.getAttribute('data-policy-group-head') || '';
            groupExpanded[key] = !groupExpanded[key];
            render(policy);
        }
    });
    document.addEventListener('keydown', function(e){
        if(e.key === 'Enter' && e.target && e.target.matches('[data-mask-custom]')) {
            e.preventDefault();
            addCustomMaskPattern();
        }
    });
    load();
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
document.addEventListener('blossom:pageLoaded', init);
})();


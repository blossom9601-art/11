import os
import sqlite3
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from flask import current_app


RESOURCE_TABLE = 'web_access_resource'
ENDPOINT_TABLE = 'web_access_resource_endpoint'
POLICY_TABLE = 'web_access_policy'
REQUEST_TABLE = 'web_access_request'
APPROVAL_TABLE = 'web_access_approval'
GRANT_TABLE = 'web_access_grant'
AUDIT_TABLE = 'web_access_audit_log'
ATTACHMENT_TABLE = 'web_access_request_attachment'
NOTIFICATION_TABLE = 'web_access_notification'

RESOURCE_STATUS_ACTIVE = '사용 가능'
RESOURCE_STATUS_BLOCKED = '차단'

# 단순화된 자원 유형: WEB / SSH 두 가지만
ENDPOINT_KIND_WEB = 'WEB'
ENDPOINT_KIND_SSH = 'SSH'
ENDPOINT_KINDS = (ENDPOINT_KIND_WEB, ENDPOINT_KIND_SSH)

# 유형별 허용 프로토콜과 기본 포트
ENDPOINT_PROTOCOLS = {
    ENDPOINT_KIND_WEB: ('HTTPS', 'HTTP'),
    ENDPOINT_KIND_SSH: ('SSH',),
}
ENDPOINT_DEFAULT_PORT = {
    'HTTPS': 443,
    'HTTP': 80,
    'SSH': 22,
}

# 호환용 (기존 코드 의존성)
RESOURCE_TYPES = ('웹', '서버', 'DB', 'SSH', '기타')
RESOURCE_DEFAULT_PORTS = {'SSH': 22, 'DB': 0, '서버': 22}
RESOURCE_DEFAULT_PROTOCOLS = {'웹': 'HTTPS', 'SSH': 'SSH', '서버': 'SSH', 'DB': 'TCP'}

REQUEST_STATUS_DRAFT = '임시저장'
REQUEST_STATUS_SUBMITTED = '제출'
REQUEST_STATUS_PENDING = '승인대기'
REQUEST_STATUS_APPROVED = '승인'
REQUEST_STATUS_REJECTED = '반려'
REQUEST_STATUS_CANCELLED = '취소'
REQUEST_STATUS_EXPIRED = '만료'

APPROVAL_STATUS_PENDING = '승인대기'
APPROVAL_STATUS_APPROVED = '승인'
APPROVAL_STATUS_REJECTED = '반려'

GRANT_STATUS_ACTIVE = '승인'
GRANT_STATUS_PENDING = '승인대기'
GRANT_STATUS_EXPIRED = '만료'
GRANT_STATUS_BLOCKED = '차단'


def _resolve_db_path(app=None) -> str:
    _app = app or current_app._get_current_object()
    uri = _app.config.get('SQLALCHEMY_DATABASE_URI', '')
    if uri.startswith('sqlite:///'):
        return uri.replace('sqlite:///', '', 1)
    return os.path.join(_app.instance_path, 'blossom.db')


def _get_connection(app=None) -> sqlite3.Connection:
    db_path = _resolve_db_path(app)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    conn.execute('PRAGMA journal_mode=WAL')
    return conn


def _dict(row) -> Optional[Dict[str, Any]]:
    return dict(row) if row is not None else None


def _now() -> str:
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S')


def _today() -> str:
    return date.today().isoformat()


def _to_bool(value: Any) -> int:
    return 1 if str(value).strip().lower() in ('1', 'true', 'y', 'yes', 'on') else 0


def _to_int_or_none(value: Any) -> Optional[int]:
    if value is None or value == '':
        return None
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def _ensure_resource_extra_columns(conn: sqlite3.Connection) -> None:
    """기존 배포본에 누락된 자원 확장 컬럼을 안전하게 추가."""
    rows = conn.execute(f"PRAGMA table_info({RESOURCE_TABLE})").fetchall()
    existing = {row[1] for row in rows}
    spec = (
        ('host_address', "TEXT NOT NULL DEFAULT ''"),
        ('port_number', 'INTEGER'),
        ('protocol', "TEXT NOT NULL DEFAULT ''"),
        ('login_account', "TEXT NOT NULL DEFAULT ''"),
        ('connection_options', "TEXT NOT NULL DEFAULT ''"),
        ('tags', "TEXT NOT NULL DEFAULT ''"),
    )
    for col, decl in spec:
        if col not in existing:
            conn.execute(f"ALTER TABLE {RESOURCE_TABLE} ADD COLUMN {col} {decl}")


def _validate_resource_payload(resource_type: str, host_address: str, port_number: Optional[int], login_account: str) -> None:
    """자원 유형별 필수 필드 검증."""
    rtype = (resource_type or '').strip() or '웹'
    if rtype not in RESOURCE_TYPES:
        raise ValueError('지원하지 않는 자원 유형입니다.')
    if rtype == '웹':
        return
    if not host_address.strip():
        raise ValueError(f'{rtype} 유형은 호스트 주소가 필요합니다.')
    if rtype in ('SSH', '서버', 'DB') and (port_number is None or port_number <= 0 or port_number > 65535):
        raise ValueError(f'{rtype} 유형은 1~65535 범위의 포트 번호가 필요합니다.')
    if rtype in ('SSH', '서버') and not login_account.strip():
        raise ValueError(f'{rtype} 유형은 로그인 계정이 필요합니다.')


def init_web_access_control_tables(app=None) -> None:
    with _get_connection(app) as conn:
        conn.execute(
            f'''
            CREATE TABLE IF NOT EXISTS {RESOURCE_TABLE} (
                id                      INTEGER PRIMARY KEY AUTOINCREMENT,
                resource_name           TEXT NOT NULL,
                resource_url            TEXT NOT NULL,
                resource_type           TEXT NOT NULL DEFAULT '웹',
                description             TEXT NOT NULL DEFAULT '',
                category_name           TEXT NOT NULL DEFAULT '웹',
                active_flag             INTEGER NOT NULL DEFAULT 1,
                approval_required       INTEGER NOT NULL DEFAULT 1,
                default_period_days     INTEGER NOT NULL DEFAULT 30,
                security_level          TEXT NOT NULL DEFAULT '중',
                launch_mode             TEXT NOT NULL DEFAULT '새 창',
                owner_department_id     INTEGER,
                owner_user_id           INTEGER,
                caution_text            TEXT NOT NULL DEFAULT '',
                host_address            TEXT NOT NULL DEFAULT '',
                port_number             INTEGER,
                protocol                TEXT NOT NULL DEFAULT '',
                login_account           TEXT NOT NULL DEFAULT '',
                connection_options      TEXT NOT NULL DEFAULT '',
                created_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at              TEXT,
                created_by              TEXT,
                updated_by              TEXT,
                is_deleted              INTEGER NOT NULL DEFAULT 0
            )
            '''
        )
        conn.execute(
            f'''CREATE UNIQUE INDEX IF NOT EXISTS idx_{RESOURCE_TABLE}_url_deleted
                ON {RESOURCE_TABLE}(resource_url, is_deleted)'''
        )
        conn.execute(
            f'''CREATE INDEX IF NOT EXISTS idx_{RESOURCE_TABLE}_type
                ON {RESOURCE_TABLE}(resource_type)'''
        )
        _ensure_resource_extra_columns(conn)
        conn.execute(
            f'''
            CREATE TABLE IF NOT EXISTS {POLICY_TABLE} (
                id                          INTEGER PRIMARY KEY AUTOINCREMENT,
                policy_name                 TEXT NOT NULL DEFAULT '기본 정책',
                team_lead_approval_required INTEGER NOT NULL DEFAULT 1,
                admin_approval_required     INTEGER NOT NULL DEFAULT 0,
                max_period_days             INTEGER NOT NULL DEFAULT 90,
                emergency_allowed           INTEGER NOT NULL DEFAULT 1,
                notify_before_days          INTEGER NOT NULL DEFAULT 7,
                duplicate_request_blocked   INTEGER NOT NULL DEFAULT 1,
                default_period_days         INTEGER NOT NULL DEFAULT 30,
                active_flag                 INTEGER NOT NULL DEFAULT 1,
                created_at                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at                  TEXT,
                created_by                  TEXT,
                updated_by                  TEXT
            )
            '''
        )
        conn.execute(
            f'''
            CREATE TABLE IF NOT EXISTS {REQUEST_TABLE} (
                id                      INTEGER PRIMARY KEY AUTOINCREMENT,
                request_no              TEXT NOT NULL UNIQUE,
                resource_id             INTEGER NOT NULL,
                requester_user_id       INTEGER NOT NULL,
                requester_emp_no        TEXT NOT NULL DEFAULT '',
                requester_name          TEXT NOT NULL DEFAULT '',
                requester_department_id INTEGER,
                requester_department    TEXT NOT NULL DEFAULT '',
                approver_user_id        INTEGER,
                approver_emp_no         TEXT NOT NULL DEFAULT '',
                approver_name           TEXT NOT NULL DEFAULT '',
                reason                  TEXT NOT NULL DEFAULT '',
                request_status          TEXT NOT NULL DEFAULT '{REQUEST_STATUS_DRAFT}',
                approval_status         TEXT NOT NULL DEFAULT '{APPROVAL_STATUS_PENDING}',
                request_start_date      TEXT NOT NULL,
                request_end_date        TEXT NOT NULL,
                emergency_flag          INTEGER NOT NULL DEFAULT 0,
                submitted_at            TEXT,
                approved_at             TEXT,
                rejected_at             TEXT,
                cancelled_at            TEXT,
                rejected_reason         TEXT NOT NULL DEFAULT '',
                current_policy_id       INTEGER,
                created_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at              TEXT,
                created_by              TEXT,
                updated_by              TEXT,
                is_deleted              INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY(resource_id) REFERENCES {RESOURCE_TABLE}(id)
            )
            '''
        )
        conn.execute(
            f'''CREATE INDEX IF NOT EXISTS idx_{REQUEST_TABLE}_user_status
                ON {REQUEST_TABLE}(requester_user_id, request_status)'''
        )
        conn.execute(
            f'''CREATE INDEX IF NOT EXISTS idx_{REQUEST_TABLE}_resource_status
                ON {REQUEST_TABLE}(resource_id, request_status)'''
        )
        conn.execute(
            f'''
            CREATE TABLE IF NOT EXISTS {APPROVAL_TABLE} (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id          INTEGER NOT NULL,
                phase_code          TEXT NOT NULL DEFAULT 'TEAM_LEAD',
                phase_name          TEXT NOT NULL DEFAULT '팀장 승인',
                approver_user_id    INTEGER,
                approver_emp_no     TEXT NOT NULL DEFAULT '',
                approver_name       TEXT NOT NULL DEFAULT '',
                approval_status     TEXT NOT NULL DEFAULT '{APPROVAL_STATUS_PENDING}',
                opinion             TEXT NOT NULL DEFAULT '',
                rejected_reason     TEXT NOT NULL DEFAULT '',
                acted_at            TEXT,
                created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at          TEXT,
                FOREIGN KEY(request_id) REFERENCES {REQUEST_TABLE}(id) ON DELETE CASCADE
            )
            '''
        )
        conn.execute(
            f'''CREATE INDEX IF NOT EXISTS idx_{APPROVAL_TABLE}_request
                ON {APPROVAL_TABLE}(request_id, approval_status)'''
        )
        conn.execute(
            f'''
            CREATE TABLE IF NOT EXISTS {GRANT_TABLE} (
                id                      INTEGER PRIMARY KEY AUTOINCREMENT,
                resource_id             INTEGER NOT NULL,
                user_id                 INTEGER,
                department_id           INTEGER,
                source_request_id       INTEGER,
                grant_status            TEXT NOT NULL DEFAULT '{GRANT_STATUS_ACTIVE}',
                grant_start_date        TEXT NOT NULL,
                grant_end_date          TEXT NOT NULL,
                last_accessed_at        TEXT,
                granted_by_user_id      INTEGER,
                granted_by_emp_no       TEXT NOT NULL DEFAULT '',
                granted_by_name         TEXT NOT NULL DEFAULT '',
                approval_required       INTEGER NOT NULL DEFAULT 1,
                created_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at              TEXT,
                created_by              TEXT,
                updated_by              TEXT,
                is_deleted              INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY(resource_id) REFERENCES {RESOURCE_TABLE}(id),
                FOREIGN KEY(source_request_id) REFERENCES {REQUEST_TABLE}(id)
            )
            '''
        )
        conn.execute(
            f'''CREATE INDEX IF NOT EXISTS idx_{GRANT_TABLE}_principal
                ON {GRANT_TABLE}(user_id, department_id, grant_status)'''
        )
        conn.execute(
            f'''
            CREATE TABLE IF NOT EXISTS {ATTACHMENT_TABLE} (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id          INTEGER NOT NULL,
                original_name       TEXT NOT NULL DEFAULT '',
                stored_name         TEXT NOT NULL DEFAULT '',
                file_path           TEXT NOT NULL DEFAULT '',
                created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(request_id) REFERENCES {REQUEST_TABLE}(id) ON DELETE CASCADE
            )
            '''
        )
        conn.execute(
            f'''
            CREATE TABLE IF NOT EXISTS {AUDIT_TABLE} (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                occurred_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                actor_user_id       INTEGER,
                actor_emp_no        TEXT NOT NULL DEFAULT '',
                actor_name          TEXT NOT NULL DEFAULT '',
                target_resource_id  INTEGER,
                target_request_id   INTEGER,
                action_type         TEXT NOT NULL,
                action_result       TEXT NOT NULL DEFAULT '성공',
                ip_address          TEXT NOT NULL DEFAULT '',
                note                TEXT NOT NULL DEFAULT '',
                extra_json          TEXT NOT NULL DEFAULT '{{}}'
            )
            '''
        )
        conn.execute(
            f'''CREATE INDEX IF NOT EXISTS idx_{AUDIT_TABLE}_action_time
                ON {AUDIT_TABLE}(occurred_at DESC)'''
        )
        conn.execute(
            f'''
            CREATE TABLE IF NOT EXISTS {NOTIFICATION_TABLE} (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                grant_id            INTEGER NOT NULL,
                resource_id         INTEGER NOT NULL,
                user_id             INTEGER,
                days_remaining      INTEGER NOT NULL,
                grant_end_date      TEXT NOT NULL,
                channel             TEXT NOT NULL DEFAULT 'audit',
                sent_at             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                note                TEXT NOT NULL DEFAULT '',
                FOREIGN KEY(grant_id) REFERENCES {GRANT_TABLE}(id) ON DELETE CASCADE,
                FOREIGN KEY(resource_id) REFERENCES {RESOURCE_TABLE}(id)
            )
            '''
        )
        conn.execute(
            f'''CREATE UNIQUE INDEX IF NOT EXISTS idx_{NOTIFICATION_TABLE}_dedup
                ON {NOTIFICATION_TABLE}(grant_id, days_remaining)'''
        )
        _seed_policy(conn)
        _seed_default_resource(conn)
        _create_endpoint_table(conn)
        _migrate_endpoints_from_resource(conn)
        conn.commit()


def _seed_policy(conn: sqlite3.Connection) -> None:
    row = conn.execute(f'SELECT id FROM {POLICY_TABLE} ORDER BY id LIMIT 1').fetchone()
    if row:
        return
    conn.execute(
        f'''
        INSERT INTO {POLICY_TABLE}
            (policy_name, team_lead_approval_required, admin_approval_required,
             max_period_days, emergency_allowed, notify_before_days,
             duplicate_request_blocked, default_period_days, active_flag,
             created_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''',
        ('기본 접근제어 정책', 1, 0, 90, 1, 7, 1, 30, 1, _now(), 'system')
    )


def _seed_default_resource(conn: sqlite3.Connection) -> None:
    row = conn.execute(
        f'''SELECT id FROM {RESOURCE_TABLE}
            WHERE resource_url = ? AND is_deleted = 0''',
        ('https://www.naver.com',)
    ).fetchone()
    if row:
        return
    conn.execute(
        f'''
        INSERT INTO {RESOURCE_TABLE}
            (resource_name, resource_url, resource_type, description, category_name,
             active_flag, approval_required, default_period_days, security_level,
             launch_mode, caution_text, created_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''',
        (
            'NAVER',
            'https://www.naver.com',
            '웹',
            '기본 예시 외부 웹 자원',
            '웹',
            1,
            1,
            30,
            '중',
            '새 창',
            '업무 목적 범위 내에서만 접속할 수 있습니다.',
            _now(),
            'system',
        )
    )


# =====================================================================
# 자원 접속점(endpoint) 관리 — 한 자원에 여러 접속 수단(WEB/SSH)을 등록.
# =====================================================================

def _create_endpoint_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        f'''
        CREATE TABLE IF NOT EXISTS {ENDPOINT_TABLE} (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            resource_id     INTEGER NOT NULL,
            label           TEXT NOT NULL DEFAULT '',
            kind            TEXT NOT NULL DEFAULT 'WEB',
            protocol        TEXT NOT NULL DEFAULT '',
            host            TEXT NOT NULL DEFAULT '',
            port            INTEGER,
            url_path        TEXT NOT NULL DEFAULT '',
            is_primary      INTEGER NOT NULL DEFAULT 0,
            sort_order      INTEGER NOT NULL DEFAULT 0,
            created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at      TEXT,
            FOREIGN KEY(resource_id) REFERENCES {RESOURCE_TABLE}(id) ON DELETE CASCADE
        )
        '''
    )
    conn.execute(
        f'''CREATE INDEX IF NOT EXISTS idx_{ENDPOINT_TABLE}_resource
            ON {ENDPOINT_TABLE}(resource_id, sort_order)'''
    )


def _parse_url_for_endpoint(url: str) -> Optional[Dict[str, Any]]:
    """기존 resource_url(http/https URL)을 endpoint 컴포넌트로 분해."""
    if not url:
        return None
    text = url.strip()
    if not text:
        return None
    lower = text.lower()
    if lower.startswith('https://'):
        scheme = 'HTTPS'
        rest = text[8:]
    elif lower.startswith('http://'):
        scheme = 'HTTP'
        rest = text[7:]
    else:
        return None
    # rest = host[:port][/path]
    path_idx = rest.find('/')
    host_port = rest if path_idx < 0 else rest[:path_idx]
    url_path = '' if path_idx < 0 else rest[path_idx:]
    if ':' in host_port:
        host_part, port_part = host_port.rsplit(':', 1)
        try:
            port = int(port_part)
        except ValueError:
            host_part = host_port
            port = ENDPOINT_DEFAULT_PORT[scheme]
    else:
        host_part = host_port
        port = ENDPOINT_DEFAULT_PORT[scheme]
    return {
        'kind': ENDPOINT_KIND_WEB,
        'protocol': scheme,
        'host': host_part.strip(),
        'port': port,
        'url_path': url_path,
    }


def _migrate_endpoints_from_resource(conn: sqlite3.Connection) -> None:
    """기존 web_access_resource 1행 = 1 endpoint(is_primary=1)로 변환.
    이미 endpoint가 1건 이상 있는 자원은 건너뜀.
    """
    rows = conn.execute(
        f'SELECT * FROM {RESOURCE_TABLE} WHERE is_deleted = 0'
    ).fetchall()
    for row in rows:
        existing = conn.execute(
            f'SELECT 1 FROM {ENDPOINT_TABLE} WHERE resource_id = ? LIMIT 1',
            (row['id'],)
        ).fetchone()
        if existing:
            continue
        url = (row['resource_url'] or '').strip() if 'resource_url' in row.keys() else ''
        host = (row['host_address'] or '').strip() if 'host_address' in row.keys() else ''
        port = row['port_number'] if 'port_number' in row.keys() else None
        protocol = (row['protocol'] or '').strip().upper() if 'protocol' in row.keys() else ''
        endpoint = None
        # URL이 있으면 우선 파싱 시도
        if url:
            endpoint = _parse_url_for_endpoint(url)
        if not endpoint and host:
            # host가 있으면 protocol에 따라 분류
            if protocol in ('HTTP', 'HTTPS'):
                endpoint = {
                    'kind': ENDPOINT_KIND_WEB,
                    'protocol': protocol,
                    'host': host,
                    'port': int(port) if port else ENDPOINT_DEFAULT_PORT[protocol],
                    'url_path': '',
                }
            else:
                # SSH/그 외는 SSH로 매핑 (TELNET 등은 SSH로 통합)
                endpoint = {
                    'kind': ENDPOINT_KIND_SSH,
                    'protocol': 'SSH',
                    'host': host,
                    'port': int(port) if port else 22,
                    'url_path': '',
                }
        if not endpoint:
            # 데이터 부족 → endpoint 생성 생략 (자원은 남되 접속점 없는 상태)
            continue
        conn.execute(
            f'''INSERT INTO {ENDPOINT_TABLE}
                (resource_id, label, kind, protocol, host, port, url_path,
                 is_primary, sort_order, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?)''',
            (
                row['id'],
                '기본',
                endpoint['kind'],
                endpoint['protocol'],
                endpoint['host'],
                endpoint['port'],
                endpoint['url_path'],
                _now(),
            )
        )


def _endpoint_url(ep: Dict[str, Any]) -> str:
    """endpoint dict → 사람이 읽는 URL 문자열."""
    kind = (ep.get('kind') or '').upper()
    protocol = (ep.get('protocol') or '').upper()
    host = (ep.get('host') or '').strip()
    port = ep.get('port')
    path = (ep.get('url_path') or '').strip()
    if not host:
        return ''
    if kind == ENDPOINT_KIND_WEB:
        scheme = 'https' if protocol == 'HTTPS' else 'http'
        default_port = ENDPOINT_DEFAULT_PORT.get(protocol, 0)
        port_part = '' if not port or int(port) == default_port else f':{int(port)}'
        path_part = path if (path and path.startswith('/')) else (f'/{path}' if path else '')
        return f'{scheme}://{host}{port_part}{path_part}'
    if kind == ENDPOINT_KIND_SSH:
        port_part = '' if not port or int(port) == 22 else f':{int(port)}'
        return f'ssh://{host}{port_part}'
    return host


def _validate_endpoint_payload(ep: Dict[str, Any]) -> Dict[str, Any]:
    kind = (ep.get('kind') or '').strip().upper() or ENDPOINT_KIND_WEB
    if kind not in ENDPOINT_KINDS:
        raise ValueError('지원하지 않는 접속점 유형입니다. (WEB / SSH)')
    protocol = (ep.get('protocol') or '').strip().upper()
    allowed = ENDPOINT_PROTOCOLS[kind]
    if not protocol:
        protocol = allowed[0]
    if protocol not in allowed:
        raise ValueError(f'{kind} 유형은 {", ".join(allowed)} 프로토콜만 사용할 수 있습니다.')
    host = (ep.get('host') or '').strip()
    if not host:
        raise ValueError('호스트(IP/도메인)를 입력하세요.')
    port = _to_int_or_none(ep.get('port'))
    if port is None:
        port = ENDPOINT_DEFAULT_PORT.get(protocol)
    if port is None or port < 1 or port > 65535:
        raise ValueError('포트는 1~65535 범위여야 합니다.')
    url_path = (ep.get('url_path') or '').strip()
    if kind == ENDPOINT_KIND_SSH:
        url_path = ''
    elif url_path and not url_path.startswith('/'):
        url_path = '/' + url_path
    label = (ep.get('label') or '').strip()
    return {
        'label': label,
        'kind': kind,
        'protocol': protocol,
        'host': host,
        'port': port,
        'url_path': url_path,
        'is_primary': 1 if _to_bool(ep.get('is_primary')) else 0,
        'sort_order': int(ep.get('sort_order') or 0),
    }


def list_endpoints(resource_id: int, conn: Optional[sqlite3.Connection] = None, app=None) -> List[Dict[str, Any]]:
    own_conn = conn is None
    if own_conn:
        conn = _get_connection(app)
    try:
        rows = conn.execute(
            f'''SELECT * FROM {ENDPOINT_TABLE}
                 WHERE resource_id = ?
                 ORDER BY is_primary DESC, sort_order ASC, id ASC''',
            (resource_id,)
        ).fetchall()
    finally:
        if own_conn:
            conn.close()
    items = []
    for row in rows:
        d = dict(row)
        d['url'] = _endpoint_url(d)
        items.append(d)
    return items


def _replace_endpoints(conn: sqlite3.Connection, resource_id: int, endpoints: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """endpoints[] 전체 교체 (단순 delete + insert). 최소 1개 권장이지만 0개도 허용."""
    cleaned: List[Dict[str, Any]] = []
    for raw in endpoints or []:
        cleaned.append(_validate_endpoint_payload(raw))
    # 대표(primary) 정리: 명시 없으면 첫 endpoint를 대표로
    if cleaned:
        if not any(ep['is_primary'] for ep in cleaned):
            cleaned[0]['is_primary'] = 1
        else:
            seen = False
            for ep in cleaned:
                if ep['is_primary'] and not seen:
                    seen = True
                else:
                    ep['is_primary'] = 0
    conn.execute(f'DELETE FROM {ENDPOINT_TABLE} WHERE resource_id = ?', (resource_id,))
    now = _now()
    for idx, ep in enumerate(cleaned):
        conn.execute(
            f'''INSERT INTO {ENDPOINT_TABLE}
                (resource_id, label, kind, protocol, host, port, url_path,
                 is_primary, sort_order, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (
                resource_id,
                ep['label'],
                ep['kind'],
                ep['protocol'],
                ep['host'],
                ep['port'],
                ep['url_path'],
                ep['is_primary'],
                idx,
                now,
            )
        )
    return cleaned


def _sync_legacy_columns_from_endpoints(conn: sqlite3.Connection, resource_id: int, endpoints: List[Dict[str, Any]]) -> None:
    """대표 endpoint 값을 기존 web_access_resource 컬럼(resource_url/host_address/port_number/protocol/resource_type)에 반영.
    기존 신청/승인 로직 호환을 위해 유지.
    """
    primary = next((ep for ep in endpoints if ep.get('is_primary')), None)
    if not primary and endpoints:
        primary = endpoints[0]
    if not primary:
        # endpoint 없음 — 빈 값 유지
        return
    kind = primary['kind']
    if kind == ENDPOINT_KIND_WEB:
        url = _endpoint_url(primary)
        legacy_type = '웹'
    else:
        url = ''
        legacy_type = 'SSH'
    conn.execute(
        f'''UPDATE {RESOURCE_TABLE}
               SET resource_url = ?,
                   resource_type = ?,
                   host_address = ?,
                   port_number = ?,
                   protocol = ?,
                   updated_at = ?
             WHERE id = ?''',
        (
            url,
            legacy_type,
            primary['host'],
            primary['port'],
            primary['protocol'],
            _now(),
            resource_id,
        )
    )


def expire_due_grants(app=None) -> int:
    today = _today()
    with _get_connection(app) as conn:
        cur = conn.execute(
            f'''
            UPDATE {GRANT_TABLE}
               SET grant_status = ?,
                   updated_at = ?
             WHERE is_deleted = 0
               AND grant_status = ?
               AND COALESCE(grant_end_date, '') <> ''
               AND grant_end_date < ?
            ''',
            (GRANT_STATUS_EXPIRED, _now(), GRANT_STATUS_ACTIVE, today)
        )
        updated = cur.rowcount or 0
        if updated:
            conn.execute(
                f'''
                UPDATE {REQUEST_TABLE}
                   SET request_status = ?,
                       updated_at = ?
                 WHERE id IN (
                        SELECT DISTINCT source_request_id
                          FROM {GRANT_TABLE}
                         WHERE grant_status = ?
                           AND source_request_id IS NOT NULL
                   )
                ''',
                (REQUEST_STATUS_EXPIRED, _now(), GRANT_STATUS_EXPIRED)
            )
        conn.commit()
        return updated


def get_default_policy(app=None) -> Dict[str, Any]:
    with _get_connection(app) as conn:
        row = conn.execute(f'SELECT * FROM {POLICY_TABLE} ORDER BY id LIMIT 1').fetchone()
    return _dict(row) or {}


def update_default_policy(payload: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    current = get_default_policy(app)
    if not current:
        init_web_access_control_tables(app)
        current = get_default_policy(app)
    updates = {
        'team_lead_approval_required': _to_bool(payload.get('team_lead_approval_required', current.get('team_lead_approval_required', 1))),
        'admin_approval_required': _to_bool(payload.get('admin_approval_required', current.get('admin_approval_required', 0))),
        'max_period_days': int(payload.get('max_period_days', current.get('max_period_days', 90)) or 90),
        'emergency_allowed': _to_bool(payload.get('emergency_allowed', current.get('emergency_allowed', 1))),
        'notify_before_days': int(payload.get('notify_before_days', current.get('notify_before_days', 7)) or 7),
        'duplicate_request_blocked': _to_bool(payload.get('duplicate_request_blocked', current.get('duplicate_request_blocked', 1))),
        'default_period_days': int(payload.get('default_period_days', current.get('default_period_days', 30)) or 30),
        'updated_at': _now(),
        'updated_by': actor,
    }
    with _get_connection(app) as conn:
        conn.execute(
            f'''
            UPDATE {POLICY_TABLE}
               SET team_lead_approval_required = ?,
                   admin_approval_required = ?,
                   max_period_days = ?,
                   emergency_allowed = ?,
                   notify_before_days = ?,
                   duplicate_request_blocked = ?,
                   default_period_days = ?,
                   updated_at = ?,
                   updated_by = ?
             WHERE id = ?
            ''',
            (
                updates['team_lead_approval_required'],
                updates['admin_approval_required'],
                updates['max_period_days'],
                updates['emergency_allowed'],
                updates['notify_before_days'],
                updates['duplicate_request_blocked'],
                updates['default_period_days'],
                updates['updated_at'],
                updates['updated_by'],
                current['id'],
            )
        )
        conn.commit()
    return get_default_policy(app)


def list_resources(search: str = '', status: str = '', resource_type: str = '', app=None) -> List[Dict[str, Any]]:
    expire_due_grants(app)
    sql = f'''
        SELECT *
          FROM {RESOURCE_TABLE}
         WHERE is_deleted = 0
    '''
    params: List[Any] = []
    if search:
        sql += ' AND (resource_name LIKE ? OR resource_url LIKE ? OR description LIKE ? OR host_address LIKE ?)'
        like = f'%{search.strip()}%'
        params.extend([like, like, like, like])
    if resource_type:
        sql += ' AND resource_type = ?'
        params.append(resource_type)
    if status == RESOURCE_STATUS_ACTIVE:
        sql += ' AND active_flag = 1'
    elif status == RESOURCE_STATUS_BLOCKED:
        sql += ' AND active_flag = 0'
    sql += ' ORDER BY resource_name COLLATE NOCASE ASC, id ASC'
    items: List[Dict[str, Any]] = []
    with _get_connection(app) as conn:
        rows = conn.execute(sql, params).fetchall()
        for row in rows:
            d = dict(row)
            endpoints = list_endpoints(d['id'], conn=conn)
            d['endpoints'] = endpoints
            d['endpoint_count'] = len(endpoints)
            primary = next((ep for ep in endpoints if ep.get('is_primary')), endpoints[0] if endpoints else None)
            d['primary_endpoint'] = primary
            d['primary_url'] = (primary or {}).get('url', '') if primary else ''
            d['primary_kind'] = (primary or {}).get('kind', '') if primary else ''
            items.append(d)
    return items


def get_resource(resource_id: int, app=None) -> Optional[Dict[str, Any]]:
    with _get_connection(app) as conn:
        row = conn.execute(
            f'SELECT * FROM {RESOURCE_TABLE} WHERE id = ? AND is_deleted = 0',
            (resource_id,)
        ).fetchone()
        if not row:
            return None
        d = dict(row)
        endpoints = list_endpoints(resource_id, conn=conn)
        d['endpoints'] = endpoints
        d['endpoint_count'] = len(endpoints)
        primary = next((ep for ep in endpoints if ep.get('is_primary')), endpoints[0] if endpoints else None)
        d['primary_endpoint'] = primary
        d['primary_url'] = (primary or {}).get('url', '') if primary else ''
        d['primary_kind'] = (primary or {}).get('kind', '') if primary else ''
    return d


def create_resource(payload: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    now = _now()
    name = (payload.get('resource_name') or '').strip()
    if not name:
        raise ValueError('자원명을 입력하세요.')
    description = (payload.get('description') or '').strip()
    tags = (payload.get('tags') or '').strip()
    category = (payload.get('category') or '').strip() or '기타'
    active_flag = _to_bool(payload.get('active_flag', 1))
    approval_required = _to_bool(payload.get('approval_required', 1))
    default_period_days = int(payload.get('default_period_days') or 30)
    security_level = (payload.get('security_level') or '중').strip() or '중'
    launch_mode = (payload.get('launch_mode') or '새 창').strip() or '새 창'
    caution_text = (payload.get('caution_text') or '').strip()
    raw_endpoints = payload.get('endpoints') or []
    if not isinstance(raw_endpoints, list):
        raise ValueError('endpoints는 배열이어야 합니다.')
    # endpoint를 미리 검증해 두면 INSERT 실패 시 정합성 보장
    cleaned = [_validate_endpoint_payload(ep) for ep in raw_endpoints]
    if cleaned and not any(ep['is_primary'] for ep in cleaned):
        cleaned[0]['is_primary'] = 1
    primary = next((ep for ep in cleaned if ep.get('is_primary')), cleaned[0] if cleaned else None)
    legacy_url = _endpoint_url(primary) if (primary and primary['kind'] == ENDPOINT_KIND_WEB) else ''
    legacy_type = '웹' if (primary and primary['kind'] == ENDPOINT_KIND_WEB) else ('SSH' if primary else '웹')
    legacy_host = primary['host'] if primary else ''
    legacy_port = primary['port'] if primary else None
    legacy_protocol = primary['protocol'] if primary else ''
    with _get_connection(app) as conn:
        cur = conn.execute(
            f'''
            INSERT INTO {RESOURCE_TABLE}
                (resource_name, resource_url, resource_type, description, tags, category_name,
                 active_flag, approval_required, default_period_days, security_level,
                 launch_mode, owner_department_id, owner_user_id, caution_text,
                 host_address, port_number, protocol, login_account, connection_options,
                 created_at, updated_at, created_by, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''',
            (
                name,
                legacy_url,
                legacy_type,
                description,
                tags,
                category,
                active_flag,
                approval_required,
                default_period_days,
                security_level,
                launch_mode,
                payload.get('owner_department_id'),
                payload.get('owner_user_id'),
                caution_text,
                legacy_host,
                legacy_port,
                legacy_protocol,
                '',
                '',
                now,
                now,
                actor,
                actor,
            )
        )
        resource_id = cur.lastrowid
        _replace_endpoints(conn, resource_id, raw_endpoints)
        conn.commit()
    return get_resource(resource_id, app) or {}


def update_resource(resource_id: int, payload: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    current = get_resource(resource_id, app)
    if not current:
        return None
    name = (payload.get('resource_name', current['resource_name']) or '').strip()
    if not name:
        raise ValueError('자원명을 입력하세요.')
    raw_endpoints = payload.get('endpoints')
    if raw_endpoints is None:
        # endpoints 미전달 → 기존 endpoints 유지
        cleaned = [
            {k: v for k, v in ep.items() if k != 'url'}
            for ep in (current.get('endpoints') or [])
        ]
    else:
        if not isinstance(raw_endpoints, list):
            raise ValueError('endpoints는 배열이어야 합니다.')
        cleaned = [_validate_endpoint_payload(ep) for ep in raw_endpoints]
    if cleaned and not any(ep.get('is_primary') for ep in cleaned):
        cleaned[0]['is_primary'] = 1
    primary = next((ep for ep in cleaned if ep.get('is_primary')), cleaned[0] if cleaned else None)
    legacy_url = _endpoint_url(primary) if (primary and primary.get('kind') == ENDPOINT_KIND_WEB) else ''
    legacy_type = '웹' if (primary and primary.get('kind') == ENDPOINT_KIND_WEB) else ('SSH' if primary else (current.get('resource_type') or '웹'))
    legacy_host = (primary or {}).get('host', '') if primary else ''
    legacy_port = (primary or {}).get('port') if primary else None
    legacy_protocol = (primary or {}).get('protocol', '') if primary else ''
    merged = {
        'resource_name': name,
        'resource_url': legacy_url,
        'resource_type': legacy_type,
        'description': (payload.get('description', current.get('description', '')) or '').strip(),
        'category_name': (payload.get('category', current.get('category_name', '기타')) or '기타').strip(),
        'active_flag': _to_bool(payload.get('active_flag', current.get('active_flag', 1))),
        'approval_required': _to_bool(payload.get('approval_required', current.get('approval_required', 1))),
        'default_period_days': int(payload.get('default_period_days', current.get('default_period_days', 30)) or 30),
        'security_level': (payload.get('security_level', current.get('security_level', '중')) or '중').strip(),
        'launch_mode': (payload.get('launch_mode', current.get('launch_mode', '새 창')) or '새 창').strip(),
        'owner_department_id': payload.get('owner_department_id', current.get('owner_department_id')),
        'owner_user_id': payload.get('owner_user_id', current.get('owner_user_id')),
        'caution_text': (payload.get('caution_text', current.get('caution_text', '')) or '').strip(),
        'tags': (payload.get('tags', current.get('tags', '')) or '').strip(),
        'host_address': legacy_host,
        'port_number': legacy_port,
        'protocol': legacy_protocol,
        'login_account': '',
        'connection_options': '',
    }
    with _get_connection(app) as conn:
        conn.execute(
            f'''
            UPDATE {RESOURCE_TABLE}
               SET resource_name = ?,
                   resource_url = ?,
                   resource_type = ?,
                   description = ?,
                   tags = ?,
                   category_name = ?,
                   active_flag = ?,
                   approval_required = ?,
                   default_period_days = ?,
                   security_level = ?,
                   launch_mode = ?,
                   owner_department_id = ?,
                   owner_user_id = ?,
                   caution_text = ?,
                   host_address = ?,
                   port_number = ?,
                   protocol = ?,
                   login_account = ?,
                   connection_options = ?,
                   updated_at = ?,
                   updated_by = ?
             WHERE id = ?
            ''',
            (
                merged['resource_name'],
                merged['resource_url'],
                merged['resource_type'],
                merged['description'],
                merged['tags'],
                merged['category_name'],
                merged['active_flag'],
                merged['approval_required'],
                merged['default_period_days'],
                merged['security_level'],
                merged['launch_mode'],
                merged['owner_department_id'],
                merged['owner_user_id'],
                merged['caution_text'],
                merged['host_address'],
                merged['port_number'],
                merged['protocol'],
                merged['login_account'],
                merged['connection_options'],
                _now(),
                actor,
                resource_id,
            )
        )
        if raw_endpoints is not None:
            _replace_endpoints(conn, resource_id, raw_endpoints)
        conn.commit()
    return get_resource(resource_id, app)


def soft_delete_resource(resource_id: int, actor: str, app=None) -> bool:
    with _get_connection(app) as conn:
        cur = conn.execute(
            f'''
            UPDATE {RESOURCE_TABLE}
               SET is_deleted = 1,
                   updated_at = ?,
                   updated_by = ?
             WHERE id = ? AND is_deleted = 0
            ''',
            (_now(), actor, resource_id)
        )
        conn.commit()
        return (cur.rowcount or 0) > 0


def _next_request_no(conn: sqlite3.Connection) -> str:
    today = datetime.now().strftime('%Y%m%d')
    prefix = f'AC-{today}-'
    row = conn.execute(
        f'''SELECT request_no FROM {REQUEST_TABLE}
            WHERE request_no LIKE ?
            ORDER BY request_no DESC LIMIT 1''',
        (prefix + '%',)
    ).fetchone()
    if not row:
        return prefix + '0001'
    last = str(row['request_no']).rsplit('-', 1)[-1]
    try:
        seq = int(last) + 1
    except Exception:
        seq = 1
    return prefix + str(seq).zfill(4)


def has_active_grant(user_id: int, resource_id: int, app=None) -> bool:
    expire_due_grants(app)
    today = _today()
    with _get_connection(app) as conn:
        row = conn.execute(
            f'''
            SELECT id
              FROM {GRANT_TABLE}
             WHERE is_deleted = 0
               AND user_id = ?
               AND resource_id = ?
               AND grant_status = ?
               AND grant_start_date <= ?
               AND grant_end_date >= ?
             LIMIT 1
            ''',
            (user_id, resource_id, GRANT_STATUS_ACTIVE, today, today)
        ).fetchone()
    return row is not None


def has_pending_request(user_id: int, resource_id: int, app=None) -> bool:
    with _get_connection(app) as conn:
        row = conn.execute(
            f'''
            SELECT id
              FROM {REQUEST_TABLE}
             WHERE is_deleted = 0
               AND requester_user_id = ?
               AND resource_id = ?
               AND request_status IN (?, ?)
             LIMIT 1
            ''',
            (user_id, resource_id, REQUEST_STATUS_SUBMITTED, REQUEST_STATUS_PENDING)
        ).fetchone()
    return row is not None


def create_request(payload: Dict[str, Any], actor: Dict[str, Any], app=None) -> Dict[str, Any]:
    user_id = int(actor['user_id'])
    resource_id = int(payload.get('resource_id') or 0)
    if not resource_id:
        raise ValueError('resource_id는 필수입니다.')
    if has_active_grant(user_id, resource_id, app):
        raise ValueError('이미 유효한 승인 권한이 있어 신청할 수 없습니다.')
    if has_pending_request(user_id, resource_id, app):
        raise ValueError('동일 자원에 대한 승인 대기 신청이 이미 존재합니다.')
    start_date = str(payload.get('request_start_date') or '').strip()
    end_date = str(payload.get('request_end_date') or '').strip()
    if not start_date or not end_date:
        raise ValueError('사용 시작일과 종료일은 필수입니다.')
    if start_date > end_date:
        raise ValueError('시작일은 종료일보다 늦을 수 없습니다.')

    policy = get_default_policy(app)
    approver_user_id = payload.get('approver_user_id')
    approver_emp_no = (payload.get('approver_emp_no') or actor.get('manager_emp_no') or '').strip()
    approver_name = (payload.get('approver_name') or actor.get('manager_name') or '').strip()
    now = _now()
    with _get_connection(app) as conn:
        request_no = _next_request_no(conn)
        cur = conn.execute(
            f'''
            INSERT INTO {REQUEST_TABLE}
                (request_no, resource_id, requester_user_id, requester_emp_no,
                 requester_name, requester_department_id, requester_department,
                 approver_user_id, approver_emp_no, approver_name, reason,
                 request_status, approval_status, request_start_date, request_end_date,
                 emergency_flag, submitted_at, current_policy_id, created_at, updated_at,
                 created_by, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''',
            (
                request_no,
                resource_id,
                user_id,
                actor.get('emp_no', ''),
                actor.get('name', ''),
                actor.get('department_id'),
                actor.get('department_name', ''),
                approver_user_id,
                approver_emp_no,
                approver_name,
                (payload.get('reason') or '').strip(),
                REQUEST_STATUS_PENDING,
                APPROVAL_STATUS_PENDING,
                start_date,
                end_date,
                _to_bool(payload.get('emergency_flag', 0)),
                now,
                policy.get('id'),
                now,
                now,
                actor.get('emp_no', ''),
                actor.get('emp_no', ''),
            )
        )
        request_id = cur.lastrowid
        conn.execute(
            f'''
            INSERT INTO {APPROVAL_TABLE}
                (request_id, phase_code, phase_name, approver_user_id,
                 approver_emp_no, approver_name, approval_status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''',
            (
                request_id,
                'TEAM_LEAD',
                '팀장 승인',
                approver_user_id,
                approver_emp_no,
                approver_name,
                APPROVAL_STATUS_PENDING,
                now,
                now,
            )
        )
        _insert_audit(conn, actor, resource_id, request_id, '신청', '성공', (payload.get('reason') or '').strip(), {'request_status': REQUEST_STATUS_PENDING})
        conn.commit()
    return get_request(request_id, app) or {}


def get_request(request_id: int, app=None) -> Optional[Dict[str, Any]]:
    with _get_connection(app) as conn:
        row = conn.execute(
            f'''
            SELECT r.*, s.resource_name, s.resource_url, s.resource_type, s.description,
                   s.caution_text, s.approval_required
              FROM {REQUEST_TABLE} r
              JOIN {RESOURCE_TABLE} s ON s.id = r.resource_id
             WHERE r.id = ? AND r.is_deleted = 0
            ''',
            (request_id,)
        ).fetchone()
        if not row:
            return None
        data = _dict(row) or {}
        approvals = conn.execute(
            f'''SELECT * FROM {APPROVAL_TABLE} WHERE request_id = ? ORDER BY id ASC''',
            (request_id,)
        ).fetchall()
        data['approvals'] = [_dict(item) for item in approvals]
        history = conn.execute(
            f'''
            SELECT id, request_no, request_status, approval_status, request_start_date, request_end_date,
                   created_at, submitted_at, approved_at, rejected_at, rejected_reason
              FROM {REQUEST_TABLE}
             WHERE requester_user_id = ? AND resource_id = ? AND is_deleted = 0
             ORDER BY id DESC
            ''',
            (data['requester_user_id'], data['resource_id'])
        ).fetchall()
        data['request_history'] = [_dict(item) for item in history]
        return data


def list_requests(user_id: Optional[int] = None, approver_emp_no: str = '', status: str = '', app=None) -> List[Dict[str, Any]]:
    expire_due_grants(app)
    sql = f'''
        SELECT r.*, s.resource_name, s.resource_url, s.resource_type,
               s.description, s.caution_text
          FROM {REQUEST_TABLE} r
          JOIN {RESOURCE_TABLE} s ON s.id = r.resource_id
         WHERE r.is_deleted = 0
    '''
    params: List[Any] = []
    if user_id:
        sql += ' AND r.requester_user_id = ?'
        params.append(user_id)
    if approver_emp_no:
        sql += " AND UPPER(COALESCE(r.approver_emp_no, '')) = UPPER(?)"
        params.append(approver_emp_no)
    if status:
        sql += ' AND r.request_status = ?'
        params.append(status)
    sql += ' ORDER BY r.id DESC'
    with _get_connection(app) as conn:
        rows = conn.execute(sql, params).fetchall()
    return [_dict(row) for row in rows]


def cancel_request(request_id: int, actor: Dict[str, Any], app=None) -> Optional[Dict[str, Any]]:
    current = get_request(request_id, app)
    if not current:
        return None
    if int(current['requester_user_id']) != int(actor['user_id']):
        raise ValueError('본인 신청만 취소할 수 있습니다.')
    if current['request_status'] not in (REQUEST_STATUS_PENDING, REQUEST_STATUS_SUBMITTED, REQUEST_STATUS_DRAFT):
        raise ValueError('현재 상태에서는 취소할 수 없습니다.')
    now = _now()
    with _get_connection(app) as conn:
        conn.execute(
            f'''
            UPDATE {REQUEST_TABLE}
               SET request_status = ?,
                   approval_status = ?,
                   cancelled_at = ?,
                   updated_at = ?,
                   updated_by = ?
             WHERE id = ?
            ''',
            (REQUEST_STATUS_CANCELLED, APPROVAL_STATUS_REJECTED, now, now, actor.get('emp_no', ''), request_id)
        )
        conn.execute(
            f'''
            UPDATE {APPROVAL_TABLE}
               SET approval_status = ?,
                   updated_at = ?
             WHERE request_id = ? AND approval_status = ?
            ''',
            (APPROVAL_STATUS_REJECTED, now, request_id, APPROVAL_STATUS_PENDING)
        )
        _insert_audit(conn, actor, current['resource_id'], request_id, '신청취소', '성공', '', {'request_status': REQUEST_STATUS_CANCELLED})
        conn.commit()
    return get_request(request_id, app)


def approve_request(request_id: int, actor: Dict[str, Any], opinion: str = '', app=None) -> Optional[Dict[str, Any]]:
    current = get_request(request_id, app)
    if not current:
        return None
    if current['request_status'] != REQUEST_STATUS_PENDING:
        raise ValueError('승인 대기 상태만 승인할 수 있습니다.')
    approver_emp_no = (current.get('approver_emp_no') or '').strip().upper()
    actor_emp_no = str(actor.get('emp_no') or '').strip().upper()
    if approver_emp_no and approver_emp_no != actor_emp_no:
        raise ValueError('지정된 팀장만 승인할 수 있습니다.')
    now = _now()
    with _get_connection(app) as conn:
        conn.execute(
            f'''
            UPDATE {REQUEST_TABLE}
               SET request_status = ?,
                   approval_status = ?,
                   approved_at = ?,
                   updated_at = ?,
                   updated_by = ?
             WHERE id = ?
            ''',
            (REQUEST_STATUS_APPROVED, APPROVAL_STATUS_APPROVED, now, now, actor.get('emp_no', ''), request_id)
        )
        conn.execute(
            f'''
            UPDATE {APPROVAL_TABLE}
               SET approval_status = ?,
                   opinion = ?,
                   approver_user_id = ?,
                   approver_emp_no = ?,
                   approver_name = ?,
                   acted_at = ?,
                   updated_at = ?
             WHERE request_id = ?
            ''',
            (
                APPROVAL_STATUS_APPROVED,
                opinion.strip(),
                actor.get('user_id'),
                actor.get('emp_no', ''),
                actor.get('name', ''),
                now,
                now,
                request_id,
            )
        )
        conn.execute(
            f'''
            INSERT INTO {GRANT_TABLE}
                (resource_id, user_id, department_id, source_request_id, grant_status,
                 grant_start_date, grant_end_date, granted_by_user_id, granted_by_emp_no,
                 granted_by_name, approval_required, created_at, updated_at, created_by, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''',
            (
                current['resource_id'],
                current['requester_user_id'],
                current.get('requester_department_id'),
                request_id,
                GRANT_STATUS_ACTIVE,
                current['request_start_date'],
                current['request_end_date'],
                actor.get('user_id'),
                actor.get('emp_no', ''),
                actor.get('name', ''),
                int(current.get('approval_required') or 1),
                now,
                now,
                actor.get('emp_no', ''),
                actor.get('emp_no', ''),
            )
        )
        _insert_audit(conn, actor, current['resource_id'], request_id, '승인', '성공', opinion.strip(), {'grant_end_date': current['request_end_date']})
        conn.commit()
    return get_request(request_id, app)


def reject_request(request_id: int, actor: Dict[str, Any], rejected_reason: str, app=None) -> Optional[Dict[str, Any]]:
    current = get_request(request_id, app)
    if not current:
        return None
    if current['request_status'] != REQUEST_STATUS_PENDING:
        raise ValueError('승인 대기 상태만 반려할 수 있습니다.')
    if not str(rejected_reason or '').strip():
        raise ValueError('반려 사유는 필수입니다.')
    approver_emp_no = (current.get('approver_emp_no') or '').strip().upper()
    actor_emp_no = str(actor.get('emp_no') or '').strip().upper()
    if approver_emp_no and approver_emp_no != actor_emp_no:
        raise ValueError('지정된 팀장만 반려할 수 있습니다.')
    now = _now()
    with _get_connection(app) as conn:
        conn.execute(
            f'''
            UPDATE {REQUEST_TABLE}
               SET request_status = ?,
                   approval_status = ?,
                   rejected_at = ?,
                   rejected_reason = ?,
                   updated_at = ?,
                   updated_by = ?
             WHERE id = ?
            ''',
            (REQUEST_STATUS_REJECTED, APPROVAL_STATUS_REJECTED, now, rejected_reason.strip(), now, actor.get('emp_no', ''), request_id)
        )
        conn.execute(
            f'''
            UPDATE {APPROVAL_TABLE}
               SET approval_status = ?,
                   rejected_reason = ?,
                   approver_user_id = ?,
                   approver_emp_no = ?,
                   approver_name = ?,
                   acted_at = ?,
                   updated_at = ?
             WHERE request_id = ?
            ''',
            (
                APPROVAL_STATUS_REJECTED,
                rejected_reason.strip(),
                actor.get('user_id'),
                actor.get('emp_no', ''),
                actor.get('name', ''),
                now,
                now,
                request_id,
            )
        )
        _insert_audit(conn, actor, current['resource_id'], request_id, '반려', '성공', rejected_reason.strip(), {})
        conn.commit()
    return get_request(request_id, app)


def list_grants(user_id: Optional[int] = None, department_id: Optional[int] = None, resource_id: Optional[int] = None, app=None) -> List[Dict[str, Any]]:
    expire_due_grants(app)
    sql = f'''
        SELECT g.*, r.resource_name, r.resource_url, r.resource_type, r.description
          FROM {GRANT_TABLE} g
          JOIN {RESOURCE_TABLE} r ON r.id = g.resource_id
         WHERE g.is_deleted = 0
    '''
    params: List[Any] = []
    if user_id:
        sql += ' AND g.user_id = ?'
        params.append(user_id)
    if department_id:
        sql += ' AND g.department_id = ?'
        params.append(department_id)
    if resource_id:
        sql += ' AND g.resource_id = ?'
        params.append(resource_id)
    sql += ' ORDER BY g.id DESC'
    with _get_connection(app) as conn:
        rows = conn.execute(sql, params).fetchall()
    return [_dict(row) for row in rows]


def revoke_grant(grant_id: int, actor: Dict[str, Any], app=None) -> bool:
    with _get_connection(app) as conn:
        row = conn.execute(
            f'SELECT resource_id, source_request_id FROM {GRANT_TABLE} WHERE id = ? AND is_deleted = 0',
            (grant_id,)
        ).fetchone()
        if not row:
            return False
        cur = conn.execute(
            f'''
            UPDATE {GRANT_TABLE}
               SET is_deleted = 1,
                   grant_status = ?,
                   updated_at = ?,
                   updated_by = ?
             WHERE id = ?
            ''',
            (GRANT_STATUS_BLOCKED, _now(), actor.get('emp_no', ''), grant_id)
        )
        _insert_audit(conn, actor, row['resource_id'], row['source_request_id'], '권한회수', '성공', '', {})
        conn.commit()
        return (cur.rowcount or 0) > 0


def touch_access(resource_id: int, user_id: int, actor: Dict[str, Any], ip_address: str = '', app=None) -> Dict[str, Any]:
    expire_due_grants(app)
    today = _today()
    with _get_connection(app) as conn:
        grant = conn.execute(
            f'''
            SELECT * FROM {GRANT_TABLE}
             WHERE is_deleted = 0
               AND resource_id = ?
               AND user_id = ?
               AND grant_status = ?
               AND grant_start_date <= ?
               AND grant_end_date >= ?
             ORDER BY id DESC
             LIMIT 1
            ''',
            (resource_id, user_id, GRANT_STATUS_ACTIVE, today, today)
        ).fetchone()
        if not grant:
            raise ValueError('접속 가능한 권한이 없습니다.')
        conn.execute(
            f'UPDATE {GRANT_TABLE} SET last_accessed_at = ?, updated_at = ? WHERE id = ?',
            (_now(), _now(), grant['id'])
        )
        _insert_audit(conn, actor, resource_id, grant['source_request_id'], '접속', '성공', '', {'ip_address': ip_address})
        conn.commit()
        resource = conn.execute(f'SELECT * FROM {RESOURCE_TABLE} WHERE id = ?', (resource_id,)).fetchone()
    return {'grant_id': grant['id'], 'resource': _dict(resource), 'grant': _dict(grant)}


def list_audit_logs(filters: Optional[Dict[str, Any]] = None, app=None) -> List[Dict[str, Any]]:
    filters = filters or {}
    sql = f'''
        SELECT l.*, r.resource_name, r.resource_url
          FROM {AUDIT_TABLE} l
          LEFT JOIN {RESOURCE_TABLE} r ON r.id = l.target_resource_id
         WHERE 1 = 1
    '''
    params: List[Any] = []
    if filters.get('actor_name'):
        sql += ' AND l.actor_name LIKE ?'
        params.append(f"%{str(filters['actor_name']).strip()}%")
    if filters.get('resource_name'):
        sql += ' AND r.resource_name LIKE ?'
        params.append(f"%{str(filters['resource_name']).strip()}%")
    if filters.get('action_type'):
        sql += ' AND l.action_type = ?'
        params.append(filters['action_type'])
    if filters.get('from_date'):
        sql += ' AND substr(l.occurred_at, 1, 10) >= ?'
        params.append(filters['from_date'])
    if filters.get('to_date'):
        sql += ' AND substr(l.occurred_at, 1, 10) <= ?'
        params.append(filters['to_date'])
    sql += ' ORDER BY l.id DESC'
    with _get_connection(app) as conn:
        rows = conn.execute(sql, params).fetchall()
    return [_dict(row) for row in rows]


def _insert_audit(
    conn: sqlite3.Connection,
    actor: Dict[str, Any],
    target_resource_id: Optional[int],
    target_request_id: Optional[int],
    action_type: str,
    action_result: str,
    note: str,
    extra: Dict[str, Any],
) -> None:
    conn.execute(
        f'''
        INSERT INTO {AUDIT_TABLE}
            (occurred_at, actor_user_id, actor_emp_no, actor_name,
             target_resource_id, target_request_id, action_type, action_result,
             ip_address, note, extra_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''',
        (
            _now(),
            actor.get('user_id'),
            actor.get('emp_no', ''),
            actor.get('name', ''),
            target_resource_id,
            target_request_id,
            action_type,
            action_result,
            actor.get('ip_address', ''),
            note,
            str(extra or {}),
        )
    )


def run_expiry_notifications(app=None) -> Dict[str, Any]:
    """정책의 만료 임박 일수 내 grant를 찾아 알림 + 감사 로그를 적재.

    동일 grant_id × days_remaining 조합은 UNIQUE 인덱스로 중복 방지.
    반환: {'checked_at', 'notify_before_days', 'created', 'expired_grants'}
    """
    expired = expire_due_grants(app)
    policy = get_default_policy(app) or {}
    notify_days = int(policy.get('notify_before_days') or 7)
    today = date.today()
    today_iso = today.isoformat()
    created = 0
    with _get_connection(app) as conn:
        rows = conn.execute(
            f'''
            SELECT g.id, g.resource_id, g.user_id, g.grant_end_date,
                   r.resource_name, r.resource_url, r.resource_type
              FROM {GRANT_TABLE} g
              JOIN {RESOURCE_TABLE} r ON r.id = g.resource_id
             WHERE g.is_deleted = 0
               AND g.grant_status = ?
               AND g.grant_end_date >= ?
            ''',
            (GRANT_STATUS_ACTIVE, today_iso)
        ).fetchall()
        for row in rows:
            try:
                end_dt = date.fromisoformat(str(row['grant_end_date']))
            except Exception:
                continue
            remaining = (end_dt - today).days
            if remaining < 0 or remaining > notify_days:
                continue
            note = (
                f"자원 '{row['resource_name']}' 권한이 {remaining}일 후({row['grant_end_date']}) 만료됩니다."
                if remaining > 0 else
                f"자원 '{row['resource_name']}' 권한이 오늘({row['grant_end_date']}) 만료됩니다."
            )
            try:
                conn.execute(
                    f'''
                    INSERT INTO {NOTIFICATION_TABLE}
                        (grant_id, resource_id, user_id, days_remaining,
                         grant_end_date, channel, sent_at, note)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ''',
                    (row['id'], row['resource_id'], row['user_id'],
                     remaining, row['grant_end_date'], 'audit', _now(), note)
                )
            except sqlite3.IntegrityError:
                continue
            actor = {
                'user_id': row['user_id'],
                'emp_no': 'system',
                'name': '접근제어 스케줄러',
                'ip_address': '',
            }
            _insert_audit(
                conn, actor, row['resource_id'], None,
                '만료임박알림', '성공', note,
                {'grant_id': row['id'], 'days_remaining': remaining,
                 'grant_end_date': row['grant_end_date']}
            )
            created += 1
        conn.commit()
    return {
        'checked_at': _now(),
        'notify_before_days': notify_days,
        'created': created,
        'expired_grants': expired,
    }


def list_notifications(user_id: Optional[int] = None, app=None) -> List[Dict[str, Any]]:
    sql = f'''
        SELECT n.*, r.resource_name, r.resource_url, r.resource_type
          FROM {NOTIFICATION_TABLE} n
          JOIN {RESOURCE_TABLE} r ON r.id = n.resource_id
         WHERE 1 = 1
    '''
    params: List[Any] = []
    if user_id:
        sql += ' AND n.user_id = ?'
        params.append(user_id)
    sql += ' ORDER BY n.id DESC LIMIT 200'
    with _get_connection(app) as conn:
        rows = conn.execute(sql, params).fetchall()
    return [_dict(row) for row in rows]
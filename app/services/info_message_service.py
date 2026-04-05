# -*- coding: utf-8 -*-
"""
인포메이션 문구 관리 서비스 (info_message_service.py)
=====================================================
페이지별 안내 문구를 DB 기반으로 관리하는 CRUD + 감사로그 서비스.
menu_key(대분류.중분류) 기준으로 각 페이지에 표시할 문구를 등록/수정/조회한다.
"""

import sqlite3
import os
import datetime
from typing import Optional, List, Dict, Any

from flask import current_app

# ---------------------------------------------------------------------------
# DB 연결 헬퍼
# ---------------------------------------------------------------------------
TABLE_NAME = 'sys_info_message'
AUDIT_TABLE_NAME = 'sys_info_message_audit'


def _resolve_db_path(app=None) -> str:
    """앱의 SQLite DB 경로를 결정한다."""
    _app = app or current_app._get_current_object()
    uri = _app.config.get('SQLALCHEMY_DATABASE_URI', '')
    if uri.startswith('sqlite:///'):
        return uri.replace('sqlite:///', '', 1)
    return os.path.join(_app.instance_path, 'blossom.db')


def _get_connection(app=None) -> sqlite3.Connection:
    db_path = _resolve_db_path(app)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    return conn


def _row_to_dict(row) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    return dict(row)


def _now_iso() -> str:
    return datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')


# ---------------------------------------------------------------------------
# 테이블 초기화
# ---------------------------------------------------------------------------
def init_info_message_table(app=None) -> None:
    """sys_info_message 및 sys_info_message_audit 테이블 생성."""
    with _get_connection(app) as conn:
        # 메인 테이블
        conn.execute(f"""
            CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                menu_key            TEXT    NOT NULL UNIQUE,
                main_category_code  TEXT    NOT NULL,
                main_category_name  TEXT    NOT NULL,
                sub_category_code   TEXT    NOT NULL,
                sub_category_name   TEXT    NOT NULL,
                info_title          TEXT    NOT NULL DEFAULT '',
                info_content        TEXT    NOT NULL DEFAULT '',
                is_enabled          INTEGER NOT NULL DEFAULT 1,
                sort_order          INTEGER NOT NULL DEFAULT 0,
                created_at          TEXT,
                updated_at          TEXT,
                created_by          TEXT,
                updated_by          TEXT
            )
        """)
        conn.execute(f"""
            CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_main_cat
            ON {TABLE_NAME}(main_category_code)
        """)
        # 감사로그 테이블
        conn.execute(f"""
            CREATE TABLE IF NOT EXISTS {AUDIT_TABLE_NAME} (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                action_type     TEXT    NOT NULL,
                menu_key        TEXT    NOT NULL,
                before_title    TEXT,
                before_content  TEXT,
                before_enabled  INTEGER,
                after_title     TEXT,
                after_content   TEXT,
                after_enabled   INTEGER,
                changed_by      TEXT,
                changed_at      TEXT
            )
        """)
        conn.execute(f"""
            CREATE INDEX IF NOT EXISTS idx_{AUDIT_TABLE_NAME}_menu_key
            ON {AUDIT_TABLE_NAME}(menu_key)
        """)
        conn.commit()
    print(f'[info-message] {TABLE_NAME} / {AUDIT_TABLE_NAME} ready', flush=True)


# ---------------------------------------------------------------------------
# 감사로그 기록
# ---------------------------------------------------------------------------
def _write_audit(conn, action_type: str, menu_key: str,
                 before: Optional[Dict] = None, after: Optional[Dict] = None,
                 actor: str = '') -> None:
    """감사로그 1건 기록."""
    conn.execute(f"""
        INSERT INTO {AUDIT_TABLE_NAME}
            (action_type, menu_key, before_title, before_content, before_enabled,
             after_title, after_content, after_enabled, changed_by, changed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        action_type,
        menu_key,
        (before or {}).get('info_title'),
        (before or {}).get('info_content'),
        (before or {}).get('is_enabled'),
        (after or {}).get('info_title'),
        (after or {}).get('info_content'),
        (after or {}).get('is_enabled'),
        actor,
        _now_iso(),
    ))


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------
def list_info_messages(app=None, search: str = None,
                       main_category: str = None,
                       is_enabled: Optional[int] = None) -> List[Dict]:
    """인포메이션 문구 전체 목록 조회. 필터 지원."""
    sql = f'SELECT * FROM {TABLE_NAME} WHERE 1=1'
    params: list = []
    if main_category:
        sql += ' AND main_category_code = ?'
        params.append(main_category)
    if is_enabled is not None:
        sql += ' AND is_enabled = ?'
        params.append(int(is_enabled))
    if search:
        like = f'%{search}%'
        sql += ' AND (menu_key LIKE ? OR sub_category_name LIKE ? OR info_title LIKE ?)'
        params.extend([like, like, like])
    sql += ' ORDER BY sort_order, main_category_code, sub_category_code'
    with _get_connection(app) as conn:
        rows = conn.execute(sql, params).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_info_message_by_key(menu_key: str, app=None) -> Optional[Dict]:
    """menu_key 기준 단건 조회. 값이 없으면 None 반환."""
    with _get_connection(app) as conn:
        row = conn.execute(
            f'SELECT * FROM {TABLE_NAME} WHERE menu_key = ?', (menu_key,)
        ).fetchone()
    return _row_to_dict(row)


def create_info_message(data: Dict, actor: str, app=None) -> Dict:
    """인포메이션 문구 신규 등록."""
    now = _now_iso()
    menu_key = (data.get('menu_key') or '').strip()
    if not menu_key:
        raise ValueError('menu_key는 필수입니다.')

    row_data = {
        'menu_key': menu_key,
        'main_category_code': (data.get('main_category_code') or '').strip(),
        'main_category_name': (data.get('main_category_name') or '').strip(),
        'sub_category_code': (data.get('sub_category_code') or '').strip(),
        'sub_category_name': (data.get('sub_category_name') or '').strip(),
        'info_title': (data.get('info_title') or '').strip(),
        'info_content': (data.get('info_content') or '').strip(),
        'is_enabled': int(data.get('is_enabled', 1)),
        'sort_order': int(data.get('sort_order', 0)),
        'created_at': now,
        'updated_at': now,
        'created_by': actor,
        'updated_by': actor,
    }

    with _get_connection(app) as conn:
        cursor = conn.execute(f"""
            INSERT INTO {TABLE_NAME}
                (menu_key, main_category_code, main_category_name,
                 sub_category_code, sub_category_name,
                 info_title, info_content, is_enabled, sort_order,
                 created_at, updated_at, created_by, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            row_data['menu_key'], row_data['main_category_code'],
            row_data['main_category_name'], row_data['sub_category_code'],
            row_data['sub_category_name'], row_data['info_title'],
            row_data['info_content'], row_data['is_enabled'],
            row_data['sort_order'], row_data['created_at'],
            row_data['updated_at'], row_data['created_by'],
            row_data['updated_by'],
        ))
        row_data['id'] = cursor.lastrowid
        _write_audit(conn, 'CREATE', menu_key, before=None, after=row_data, actor=actor)
        conn.commit()
    return row_data


def update_info_message(msg_id: int, data: Dict, actor: str, app=None) -> Optional[Dict]:
    """인포메이션 문구 수정."""
    now = _now_iso()
    with _get_connection(app) as conn:
        before_row = conn.execute(
            f'SELECT * FROM {TABLE_NAME} WHERE id = ?', (msg_id,)
        ).fetchone()
        if not before_row:
            return None
        before = _row_to_dict(before_row)

        fields = {}
        for key in ('info_title', 'info_content', 'main_category_code',
                     'main_category_name', 'sub_category_code',
                     'sub_category_name', 'sort_order'):
            if key in data:
                fields[key] = data[key]
        if 'is_enabled' in data:
            fields['is_enabled'] = int(data['is_enabled'])
        fields['updated_at'] = now
        fields['updated_by'] = actor

        set_clause = ', '.join(f'{k} = ?' for k in fields)
        vals = list(fields.values()) + [msg_id]
        conn.execute(f'UPDATE {TABLE_NAME} SET {set_clause} WHERE id = ?', vals)

        after_row = conn.execute(
            f'SELECT * FROM {TABLE_NAME} WHERE id = ?', (msg_id,)
        ).fetchone()
        after = _row_to_dict(after_row)
        _write_audit(conn, 'UPDATE', before['menu_key'],
                     before=before, after=after, actor=actor)
        conn.commit()
    return after


def toggle_info_message(msg_id: int, is_enabled: int, actor: str, app=None) -> Optional[Dict]:
    """활성/비활성 토글."""
    now = _now_iso()
    with _get_connection(app) as conn:
        before_row = conn.execute(
            f'SELECT * FROM {TABLE_NAME} WHERE id = ?', (msg_id,)
        ).fetchone()
        if not before_row:
            return None
        before = _row_to_dict(before_row)

        conn.execute(
            f'UPDATE {TABLE_NAME} SET is_enabled = ?, updated_at = ?, updated_by = ? WHERE id = ?',
            (int(is_enabled), now, actor, msg_id)
        )
        after_row = conn.execute(
            f'SELECT * FROM {TABLE_NAME} WHERE id = ?', (msg_id,)
        ).fetchone()
        after = _row_to_dict(after_row)
        action = 'ENABLE' if is_enabled else 'DISABLE'
        _write_audit(conn, action, before['menu_key'],
                     before=before, after=after, actor=actor)
        conn.commit()
    return after


def bulk_delete_info_messages(ids: List[int], actor: str, app=None) -> int:
    """복수 건 삭제. 삭제된 건수를 반환한다."""
    if not ids:
        return 0
    placeholders = ','.join('?' for _ in ids)
    with _get_connection(app) as conn:
        rows = conn.execute(
            f'SELECT * FROM {TABLE_NAME} WHERE id IN ({placeholders})', ids
        ).fetchall()
        for row in rows:
            before = _row_to_dict(row)
            _write_audit(conn, 'DELETE', before['menu_key'],
                         before=before, after=None, actor=actor)
        conn.execute(
            f'DELETE FROM {TABLE_NAME} WHERE id IN ({placeholders})', ids
        )
        conn.commit()
    return len(rows)


# ---------------------------------------------------------------------------
# 시드 데이터
# ---------------------------------------------------------------------------
_SEED_DATA = [
    # 시스템
    ('system.server',       'system', '시스템', 'server',       '서버',          1, 10),
    ('system.storage',      'system', '시스템', 'storage',      '스토리지',      1, 20),
    ('system.san',          'system', '시스템', 'san',          'SAN',           1, 30),
    ('system.network',      'system', '시스템', 'network',      '네트워크',      1, 40),
    ('system.security',     'system', '시스템', 'security',     '보안장비',      1, 50),
    # 거버넌스
    ('governance.backup_policy',        'governance', '거버넌스', 'backup_policy',        '백업 정책',      1, 110),
    ('governance.package_management',   'governance', '거버넌스', 'package_management',   '패키지 관리',    1, 120),
    ('governance.vulnerability',        'governance', '거버넌스', 'vulnerability',        '취약점 분석',    1, 130),
    ('governance.ip_policy',            'governance', '거버넌스', 'ip_policy',            'IP 정책',        1, 140),
    ('governance.vpn_policy',           'governance', '거버넌스', 'vpn_policy',           'VPN 정책',       1, 150),
    ('governance.dedicated_line_policy','governance', '거버넌스', 'dedicated_line_policy','전용회선 정책',  1, 160),
    ('governance.disposal_asset',       'governance', '거버넌스', 'disposal_asset',       '불용자산 관리',  1, 170),
    # 데이터센터
    ('datacenter.access_control',       'datacenter', '데이터센터', 'access_control',       '출입 관리',        1, 210),
    ('datacenter.data_deletion',        'datacenter', '데이터센터', 'data_deletion',        '데이터 삭제 관리', 1, 220),
    ('datacenter.rack',                 'datacenter', '데이터센터', 'rack',                 'RACK 관리',        1, 230),
    ('datacenter.temperature_humidity', 'datacenter', '데이터센터', 'temperature_humidity', '온/습도 관리',     1, 240),
    ('datacenter.cctv',                 'datacenter', '데이터센터', 'cctv',                 'CCTV 관리',        1, 250),
    # 비용관리
    ('cost.opex',  'cost', '비용관리', 'opex',  'OPEX', 1, 310),
    ('cost.capex', 'cost', '비용관리', 'capex', 'CAPEX', 1, 320),
    # 프로젝트
    ('project.project_status',   'project', '프로젝트', 'project_status',   '프로젝트 현황',   1, 410),
    ('project.work_status',      'project', '프로젝트', 'work_status',      '작업 현황',       1, 420),
    ('project.ticket_status',    'project', '프로젝트', 'ticket_status',    '티켓 현황',       1, 430),
    ('project.workflow_builder', 'project', '프로젝트', 'workflow_builder', '워크플로우 제작', 1, 440),
    # 인사이트
    ('insight.tech_docs', 'insight', '인사이트', 'tech_docs', '기술자료', 1, 510),
    ('insight.blog',      'insight', '인사이트', 'blog',      '블로그',   1, 520),
    # 카테고리
    ('category.business',  'category', '카테고리', 'business',  '비즈니스',     1, 610),
    ('category.hardware',  'category', '카테고리', 'hardware',  '하드웨어',     1, 620),
    ('category.software',  'category', '카테고리', 'software',  '소프트웨어',   1, 630),
    ('category.component', 'category', '카테고리', 'component', '컴포넌트',     1, 640),
    ('category.company',   'category', '카테고리', 'company',   '회사',         1, 650),
    ('category.customer',  'category', '카테고리', 'customer',  '고객',         1, 660),
    ('category.vendor',    'category', '카테고리', 'vendor',    '벤더',         1, 670),
]

# 기본 안내 문구 (모든 시드가 동일한 초기 문구 사용)
_DEFAULT_TITLE = '시스템 자산관리 보안'
_DEFAULT_CONTENT = (
    '개인정보 보호법 제29조(안전조치의무) 및 시행령 제30조에 따라 '
    '하드웨어 자산에 대한 접근 통제·권한 부여·취득·변경·말소 기록을 관리해야 합니다.\n'
    '전자금융감독규정 제14조(전산자원의 관리)에서는 금융기관이 보유한 서버·네트워크 등 '
    '전산 자원의 등록·변경·폐기 관리와 재해 복구 계획 수립을 의무화하고 있습니다.\n'
    '국제표준 정보보호 관리체계(ISO/IEC 27001) 부속서 A.8.1.1(자산목록 작성)과 '
    'A.8.1.2(자산책임자 지정)는 모든 하드웨어 자산의 식별·목록화와 소유자 지정, '
    '보호조치 수립을 요구합니다.'
)


def seed_info_messages(app=None) -> int:
    """시드 데이터 삽입 (이미 존재하는 menu_key는 스킵)."""
    now = _now_iso()
    inserted = 0
    with _get_connection(app) as conn:
        for (mk, mc, mcn, sc, scn, enabled, sorder) in _SEED_DATA:
            existing = conn.execute(
                f'SELECT id FROM {TABLE_NAME} WHERE menu_key = ?', (mk,)
            ).fetchone()
            if existing:
                continue
            conn.execute(f"""
                INSERT INTO {TABLE_NAME}
                    (menu_key, main_category_code, main_category_name,
                     sub_category_code, sub_category_name,
                     info_title, info_content, is_enabled, sort_order,
                     created_at, updated_at, created_by, updated_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (mk, mc, mcn, sc, scn, _DEFAULT_TITLE, _DEFAULT_CONTENT,
                  enabled, sorder, now, now, 'system', 'system'))
            inserted += 1
        conn.commit()
    print(f'[info-message] seeded {inserted} rows (skipped {len(_SEED_DATA) - inserted})', flush=True)
    return inserted

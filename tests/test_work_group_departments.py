import os
import sqlite3
from datetime import datetime

from app.services.work_group_service import _resolve_db_path, list_work_group_departments


def _insert_department(conn, code, name, is_deleted=0):
    timestamp = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
    conn.execute(
        """
        INSERT INTO org_department (
            dept_code, dept_name, created_at, created_by, updated_at, updated_by, is_deleted
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (code, name, timestamp, 'test', timestamp, 'test', is_deleted),
    )


def test_work_group_departments_deduplicate_same_display_name(app, tmp_path):
    app.instance_path = str(tmp_path)

    with sqlite3.connect(_resolve_db_path(app)) as conn:
        conn.execute('DELETE FROM org_department')
        _insert_department(conn, 'DEPT_001', 'MSS팀')
        _insert_department(conn, 'DEPT_002', 'MSS팀')
        _insert_department(conn, 'DEPT_003', '삭제팀', is_deleted=1)
        _insert_department(conn, 'DEPT_004', '삭제팀')
        _insert_department(conn, 'default', '기본 부서')
        conn.commit()

    aux_path = os.path.join(app.instance_path, 'org_department.db')
    with sqlite3.connect(aux_path) as conn:
        conn.execute(
            """
            CREATE TABLE org_department (
                dept_code TEXT PRIMARY KEY,
                dept_name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                created_by TEXT NOT NULL,
                updated_at TEXT,
                updated_by TEXT,
                is_deleted INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        _insert_department(conn, 'AUX_001', 'MSS팀')
        _insert_department(conn, 'AUX_002', '백업팀')
        conn.commit()

    rows = list_work_group_departments(app)
    names = [row['dept_name'] for row in rows]
    by_name = {row['dept_name']: row['dept_code'] for row in rows}

    assert names.count('MSS팀') == 1
    assert by_name['MSS팀'] == 'DEPT_001'
    assert by_name['삭제팀'] == 'DEPT_004'
    assert by_name['백업팀'] == 'AUX_002'
    assert '기본 부서' not in names
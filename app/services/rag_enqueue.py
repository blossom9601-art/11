"""rag_enqueue.py — RAG 인덱스 잡 큐 등록 헬퍼

업로드/수정 이벤트 발생 시 best-effort로 rag_index_jobs 테이블에 잡을 삽입합니다.
실패해도 예외를 전파하지 않아 메인 응답에 영향을 주지 않습니다.
"""
from __future__ import annotations

import json
import logging
import os
import sqlite3

logger = logging.getLogger(__name__)

_RAG_DB_FILENAME = 'rag_index.db'

_CREATE_JOBS_SQL = """
CREATE TABLE IF NOT EXISTS rag_index_jobs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type   TEXT    NOT NULL,
    source_domain TEXT    NOT NULL,
    source_id     TEXT    NOT NULL,
    source_sub_id TEXT    DEFAULT '',
    action        TEXT    NOT NULL DEFAULT 'upsert',
    status        TEXT    NOT NULL DEFAULT 'pending',
    priority      INTEGER NOT NULL DEFAULT 5,
    retry_count   INTEGER NOT NULL DEFAULT 0,
    error_message TEXT    DEFAULT '',
    payload_json  TEXT    DEFAULT '{}',
    queued_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    started_at    TEXT    DEFAULT NULL,
    finished_at   TEXT    DEFAULT NULL
);
"""

_INSERT_JOB_SQL = """
INSERT INTO rag_index_jobs
    (source_type, source_domain, source_id, source_sub_id, action, status, priority, payload_json)
VALUES (?, ?, ?, '', 'upsert', 'pending', ?, ?)
"""


def _rag_db_path(instance_path: str) -> str:
    return os.path.join(instance_path, _RAG_DB_FILENAME)


def enqueue_attachment_job(
    instance_path: str,
    abs_paths: list[str],
    source_domain: str,
    source_id: str,
    route_hint: str = '',
    menu_code: str = '',
    page_key: str = '',
    priority: int = 5,
) -> bool:
    """첨부파일 RAG 인덱스 잡을 등록합니다.

    Args:
        instance_path: Flask current_app.instance_path
        abs_paths:     저장된 파일의 절대 경로 목록
        source_domain: 도메인 레이블 (예: '인사이트')
        source_id:     원천 식별자 (예: 'blog:42', 'tech:7')
        route_hint:    프론트엔드 페이지 경로
        menu_code:     메뉴 코드
        page_key:      페이지 키
        priority:      우선순위 (낮을수록 먼저 처리)

    Returns:
        True if enqueued successfully, False on any error.
    """
    if not abs_paths:
        return False

    try:
        db_path = _rag_db_path(instance_path)
        payload = json.dumps(
            {
                'attachment_paths': [str(p) for p in abs_paths],
                'route_hint': route_hint,
                'menu_code': menu_code,
                'page_key': page_key,
            },
            ensure_ascii=False,
        )
        with sqlite3.connect(db_path, timeout=10) as conn:
            conn.execute(_CREATE_JOBS_SQL)
            conn.execute(_INSERT_JOB_SQL, ('attachment', source_domain, source_id, priority, payload))
            conn.commit()
        logger.debug('rag_enqueue: enqueued attachment job source_id=%s paths=%s', source_id, abs_paths)
        return True
    except Exception:
        logger.exception('rag_enqueue: failed to enqueue source_id=%s', source_id)
        return False


def enqueue_delete_job(
    instance_path: str,
    source_domain: str,
    source_id: str,
    priority: int = 5,
) -> bool:
    """삭제된 원천에 대한 RAG 인덱스 삭제 잡을 등록합니다."""
    try:
        db_path = _rag_db_path(instance_path)
        payload = json.dumps({'source_id': source_id}, ensure_ascii=False)
        with sqlite3.connect(db_path, timeout=10) as conn:
            conn.execute(_CREATE_JOBS_SQL)
            conn.execute(_INSERT_JOB_SQL, ('db_row', source_domain, source_id, priority, payload))
            conn.commit()
        return True
    except Exception:
        logger.exception('rag_enqueue: failed to enqueue delete job source_id=%s', source_id)
        return False

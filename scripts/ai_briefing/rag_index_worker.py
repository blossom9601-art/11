"""RAG 인덱스 잡 실행기 (MVP)

- SQLite 기반 rag_index_jobs 큐 처리
- 첨부파일/일반 문서 upsert 및 chunk 갱신
- 실패 시 retry_count 증가 + error_message 기록
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path
from typing import Iterable, List

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from rag_ingest_pipeline import (  # type: ignore
    ChunkRecord,
    DocumentRecord,
    build_document_record,
    chunk_text,
    iter_attachment_documents_from_paths,
)


def _read_schema_sql() -> str:
    schema_path = Path(__file__).resolve().parents[1] / "sql" / "rag_metadata_schema.sql"
    return schema_path.read_text(encoding="utf-8")


class RagIndexWorker:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row

    def close(self) -> None:
        self.conn.close()

    def bootstrap_schema(self) -> None:
        self.conn.executescript(_read_schema_sql())
        self.conn.commit()

    def enqueue_job(self, job: dict) -> int:
        payload_json = job.get("payload_json", "{}")
        if isinstance(payload_json, dict):
            payload_json = json.dumps(payload_json, ensure_ascii=False)

        cur = self.conn.execute(
            """
            INSERT INTO rag_index_jobs (
                source_type, source_domain, source_id, source_sub_id,
                action, status, priority, payload_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                job.get("source_type", "db_row"),
                job.get("source_domain", ""),
                job.get("source_id", ""),
                job.get("source_sub_id", ""),
                job.get("action", "upsert"),
                job.get("status", "pending"),
                int(job.get("priority", 100)),
                payload_json,
            ),
        )
        self.conn.commit()
        return int(cur.lastrowid)

    def _next_job(self):
        return self.conn.execute(
            """
            SELECT *
            FROM rag_index_jobs
            WHERE status = 'pending'
            ORDER BY priority ASC, queued_at ASC, id ASC
            LIMIT 1
            """
        ).fetchone()

    def _mark_job_running(self, job_id: int) -> None:
        self.conn.execute(
            """
            UPDATE rag_index_jobs
            SET status = 'running', started_at = datetime('now')
            WHERE id = ?
            """,
            (job_id,),
        )
        self.conn.commit()

    def _mark_job_done(self, job_id: int) -> None:
        self.conn.execute(
            """
            UPDATE rag_index_jobs
            SET status = 'done', finished_at = datetime('now'), error_message = ''
            WHERE id = ?
            """,
            (job_id,),
        )
        self.conn.commit()

    def _mark_job_failed(self, job_id: int, message: str) -> None:
        self.conn.execute(
            """
            UPDATE rag_index_jobs
            SET status = 'failed',
                retry_count = retry_count + 1,
                error_message = ?,
                finished_at = datetime('now')
            WHERE id = ?
            """,
            (message[:1000], job_id),
        )
        self.conn.commit()

    def _upsert_document(self, doc: DocumentRecord) -> int:
        self.conn.execute(
            """
            INSERT INTO rag_documents (
                source_type, source_domain, source_id, source_sub_id,
                title, body_text, summary_text, route_hint,
                menu_code, page_key, entity_type,
                owner_dept, security_level, permission_scope,
                tags_json, metadata_json, content_hash,
                status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
            ON CONFLICT(source_type, source_domain, source_id, source_sub_id)
            DO UPDATE SET
                title=excluded.title,
                body_text=excluded.body_text,
                summary_text=excluded.summary_text,
                route_hint=excluded.route_hint,
                menu_code=excluded.menu_code,
                page_key=excluded.page_key,
                entity_type=excluded.entity_type,
                owner_dept=excluded.owner_dept,
                security_level=excluded.security_level,
                permission_scope=excluded.permission_scope,
                tags_json=excluded.tags_json,
                metadata_json=excluded.metadata_json,
                content_hash=excluded.content_hash,
                status='active',
                updated_at=datetime('now')
            """,
            (
                doc.source_type,
                doc.source_domain,
                doc.source_id,
                doc.source_sub_id,
                doc.title,
                doc.body_text,
                doc.summary_text,
                doc.route_hint,
                doc.menu_code,
                doc.page_key,
                doc.entity_type,
                doc.owner_dept,
                doc.security_level,
                doc.permission_scope,
                doc.tags_json,
                doc.metadata_json,
                doc.content_hash,
            ),
        )
        row = self.conn.execute(
            """
            SELECT id FROM rag_documents
            WHERE source_type=? AND source_domain=? AND source_id=? AND source_sub_id=?
            """,
            (doc.source_type, doc.source_domain, doc.source_id, doc.source_sub_id),
        ).fetchone()
        self.conn.commit()
        return int(row["id"])

    def _replace_chunks(self, document_id: int, chunks: Iterable[ChunkRecord]) -> None:
        self.conn.execute("DELETE FROM rag_chunks WHERE document_id = ?", (document_id,))
        for chunk in chunks:
            self.conn.execute(
                """
                INSERT INTO rag_chunks (
                    document_id, chunk_index, chunk_text, chunk_hash, token_count,
                    embedding_model, embedding_vector, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, '', '', datetime('now'), datetime('now'))
                """,
                (
                    document_id,
                    chunk.chunk_index,
                    chunk.chunk_text,
                    chunk.chunk_hash,
                    chunk.token_count,
                ),
            )
        self.conn.commit()

    def _build_documents_from_job(self, job_row) -> List[DocumentRecord]:
        source_type = str(job_row["source_type"] or "db_row")
        source_domain = str(job_row["source_domain"] or "")
        source_id = str(job_row["source_id"] or "")
        payload = json.loads(job_row["payload_json"] or "{}")

        if source_type == "attachment":
            return list(
                iter_attachment_documents_from_paths(
                    payload.get("attachment_paths", []),
                    source_domain=source_domain,
                    source_id_prefix=source_id or "attachment",
                    route_hint=str(payload.get("route_hint", "")),
                    menu_code=str(payload.get("menu_code", "")),
                    page_key=str(payload.get("page_key", "")),
                    entity_type=str(payload.get("entity_type", "attachment")),
                )
            )

        # db_row / page_detail 등은 payload를 통해 본문을 받아 MVP 인덱싱
        title = str(payload.get("title", source_id))
        body = str(payload.get("body_text", ""))
        route_hint = str(payload.get("route_hint", ""))
        menu_code = str(payload.get("menu_code", ""))
        page_key = str(payload.get("page_key", ""))
        entity_type = str(payload.get("entity_type", source_type))
        if not body.strip():
            return []

        doc = build_document_record(
            source_domain=source_domain,
            source_name=source_type,
            source_type=source_type,
            source_id=source_id,
            title_parts=[title],
            body_parts=[body],
            route_hint=route_hint,
            menu_code=menu_code,
            page_key=page_key,
            entity_type=entity_type,
            metadata={"from_job": True},
        )
        return [doc]

    def process_next(self) -> bool:
        row = self._next_job()
        if not row:
            return False

        job_id = int(row["id"])
        self._mark_job_running(job_id)

        try:
            action = str(row["action"] or "upsert")
            if action == "delete":
                self.conn.execute(
                    """
                    UPDATE rag_documents
                    SET status='deleted', updated_at=datetime('now')
                    WHERE source_type=? AND source_domain=? AND source_id=? AND source_sub_id=?
                    """,
                    (
                        row["source_type"],
                        row["source_domain"],
                        row["source_id"],
                        row["source_sub_id"],
                    ),
                )
                self.conn.commit()
            else:
                docs = self._build_documents_from_job(row)
                for doc in docs:
                    doc_id = self._upsert_document(doc)
                    chunks = chunk_text(doc.body_text)
                    self._replace_chunks(doc_id, chunks)

            self._mark_job_done(job_id)
            return True
        except Exception as exc:
            self._mark_job_failed(job_id, str(exc))
            return True

    def run_until_empty(self, max_jobs: int = 100) -> int:
        handled = 0
        while handled < max_jobs and self.process_next():
            handled += 1
        return handled


def main() -> int:
    parser = argparse.ArgumentParser(description="RAG 인덱스 잡 실행기")
    parser.add_argument("--db", required=True, help="SQLite DB 경로")
    parser.add_argument("--bootstrap", action="store_true", help="스키마를 먼저 생성")
    parser.add_argument("--max-jobs", type=int, default=100, help="최대 처리 잡 수")
    args = parser.parse_args()

    worker = RagIndexWorker(args.db)
    try:
        if args.bootstrap:
            worker.bootstrap_schema()
        count = worker.run_until_empty(max_jobs=args.max_jobs)
        print(f"processed_jobs={count}")
    finally:
        worker.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

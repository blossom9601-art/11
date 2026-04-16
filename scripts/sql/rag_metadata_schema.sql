-- RAG 메타데이터 스키마 (SQLite 우선)
-- 목적: 전 도메인 DB/문서/첨부파일을 단일 메타 모델로 인덱싱

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS rag_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT NOT NULL,              -- db_row | page_detail | attachment
    source_domain TEXT NOT NULL,            -- 시스템 | 거버넌스 | 데이터센터 | 비용관리 | 프로젝트 | 인사이트
    source_id TEXT NOT NULL,                -- 원본 고유 식별자 (예: blog:12, project:44)
    source_sub_id TEXT DEFAULT '',          -- 첨부/상세 조각 식별자 (예: file:3, sheet:1)
    title TEXT NOT NULL,
    body_text TEXT NOT NULL,
    summary_text TEXT DEFAULT '',
    route_hint TEXT DEFAULT '',             -- UI 이동 경로 힌트
    menu_code TEXT DEFAULT '',
    page_key TEXT DEFAULT '',
    entity_type TEXT DEFAULT '',            -- blog, project, server, policy 등
    owner_dept TEXT DEFAULT '',
    security_level TEXT DEFAULT 'internal', -- public | internal | confidential
    permission_scope TEXT DEFAULT '',       -- role/dept 스코프 직렬화
    tags_json TEXT DEFAULT '[]',
    metadata_json TEXT DEFAULT '{}',
    content_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',  -- active | deleted
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(source_type, source_domain, source_id, source_sub_id)
);

CREATE INDEX IF NOT EXISTS idx_rag_documents_domain_status
    ON rag_documents(source_domain, status);

CREATE INDEX IF NOT EXISTS idx_rag_documents_updated_at
    ON rag_documents(updated_at);

CREATE INDEX IF NOT EXISTS idx_rag_documents_hash
    ON rag_documents(content_hash);

CREATE TABLE IF NOT EXISTS rag_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    chunk_hash TEXT NOT NULL,
    token_count INTEGER NOT NULL DEFAULT 0,
    embedding_model TEXT DEFAULT '',
    embedding_vector TEXT DEFAULT '',       -- JSON 직렬화 벡터 (MVP)
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (document_id) REFERENCES rag_documents(id) ON DELETE CASCADE,
    UNIQUE(document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_rag_chunks_document
    ON rag_chunks(document_id);

CREATE INDEX IF NOT EXISTS idx_rag_chunks_hash
    ON rag_chunks(chunk_hash);

CREATE TABLE IF NOT EXISTS rag_index_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT NOT NULL,
    source_domain TEXT NOT NULL,
    source_id TEXT NOT NULL,
    source_sub_id TEXT DEFAULT '',
    action TEXT NOT NULL DEFAULT 'upsert',  -- upsert | delete
    status TEXT NOT NULL DEFAULT 'pending', -- pending | running | done | failed
    priority INTEGER NOT NULL DEFAULT 100,
    retry_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT DEFAULT '',
    payload_json TEXT DEFAULT '{}',
    queued_at TEXT NOT NULL DEFAULT (datetime('now')),
    started_at TEXT DEFAULT NULL,
    finished_at TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_rag_jobs_status_priority
    ON rag_index_jobs(status, priority, queued_at);

CREATE INDEX IF NOT EXISTS idx_rag_jobs_source
    ON rag_index_jobs(source_domain, source_id, source_sub_id);

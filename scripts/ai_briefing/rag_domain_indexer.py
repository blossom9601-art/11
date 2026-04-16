"""rag_domain_indexer.py — 전 도메인 DB 행 배치 인덱서

Flask 앱 컨텍스트에서 각 도메인 모델/서비스를 읽어
rag_index.db의 rag_documents/rag_chunks 테이블에 직접 upsert합니다.

사용법:
    python scripts/ai_briefing/rag_domain_indexer.py [--domain DOMAIN] [--db DB_PATH]

    --domain : blog | project | server | dr_training | rack | cost  (생략 시 전체)
    --db     : rag_index.db 경로 (기본: instance/rag_index.db)
"""

from __future__ import annotations

import argparse
import os
import re
import sqlite3
import sys
from pathlib import Path
from typing import Generator, List

# --- 경로 설정 ----------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = Path(__file__).resolve().parent

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from rag_ingest_pipeline import (  # type: ignore
    DocumentRecord,
    build_document_record,
    chunk_text,
)
from rag_index_worker import RagIndexWorker  # type: ignore


# ─────────────────────────────────────────────────────────────────────────────
# HTML 제거 헬퍼
# ─────────────────────────────────────────────────────────────────────────────

_TAGS_RE = re.compile(r'<[^>]+>')


def _strip_html(text: str) -> str:
    return _TAGS_RE.sub(' ', text or '').strip()


def _coalesce(*args) -> str:
    for v in args:
        if v is not None:
            s = str(v).strip()
            if s:
                return s
    return ''


# ─────────────────────────────────────────────────────────────────────────────
# 도메인별 문서 생성기
# ─────────────────────────────────────────────────────────────────────────────


def _iter_blog_docs(app) -> Generator[DocumentRecord, None, None]:
    """인사이트 > 블로그 IT Blog 게시글"""
    from app.models import Blog

    with app.app_context():
        for row in Blog.query.all():
            body = _strip_html(row.content_html or '')
            parts = [body]
            if row.tags:
                parts.append(f"태그: {row.tags}")
            if row.author:
                parts.append(f"작성자: {row.author}")
            yield build_document_record(
                source_domain='인사이트',
                source_name='insight_blog',
                source_type='db_row',
                source_id=f'blog:{row.id}',
                title_parts=[row.title or '(제목 없음)'],
                body_parts=parts,
                route_hint=f'/p/insight_blog_it_detail?id={row.id}',
                menu_code='insight',
                page_key='insight_blog_it',
                entity_type='blog',
                metadata={'author': row.author, 'tags': row.tags},
            )


def _iter_project_docs(app) -> Generator[DocumentRecord, None, None]:
    """프로젝트"""
    from app.models import PrjProject

    with app.app_context():
        for row in PrjProject.query.filter(PrjProject.is_deleted == 0).all():
            parts = []
            if row.description:
                parts.append(row.description)
            if row.project_type:
                parts.append(f"유형: {row.project_type}")
            if row.status:
                parts.append(f"상태: {row.status}")
            if row.gorf_goal:
                parts.append(f"목표: {row.gorf_goal}")
            if row.gorf_research:
                parts.append(f"연구: {row.gorf_research}")
            yield build_document_record(
                source_domain='프로젝트',
                source_name='project',
                source_type='db_row',
                source_id=f'project:{row.id}',
                title_parts=[row.project_name or f'프로젝트 {row.id}'],
                body_parts=parts or [row.project_name or ''],
                route_hint=f'/p/proj_completed_detail?project_id={row.id}',
                menu_code='project',
                page_key='proj_completed_detail',
                entity_type='project',
                metadata={
                    'project_number': row.project_number,
                    'status': row.status,
                    'priority': row.priority,
                },
            )


def _iter_server_docs(instance_path: str) -> Generator[DocumentRecord, None, None]:
    """시스템 > 하드웨어 서버 (별도 hardware_asset.db)"""
    db_path = os.path.join(instance_path, 'hardware_asset.db')
    if not os.path.exists(db_path):
        print(f'  [skip] hardware_asset.db 없음: {db_path}')
        return

    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        try:
            rows = conn.execute(
                """
                SELECT id, asset_code, asset_name, hostname, ip_address,
                       location, manufacturer_code, model_name, serial_number,
                       status, note
                FROM hardware_asset
                WHERE COALESCE(is_deleted, 0) = 0
                """
            ).fetchall()
        except sqlite3.OperationalError:
            # 테이블/컬럼 미존재 시 조용히 넘김
            conn.close()
            return
        conn.close()
    except Exception as exc:
        print(f'  [error] hardware_asset 읽기 실패: {exc}')
        return

    for row in rows:
        name = _coalesce(row['asset_name'], row['hostname'], row['asset_code'], f'서버 {row["id"]}')
        parts = []
        if row['hostname']:
            parts.append(f"호스트명: {row['hostname']}")
        if row['ip_address']:
            parts.append(f"IP: {row['ip_address']}")
        if row['location']:
            parts.append(f"위치: {row['location']}")
        if row['model_name']:
            parts.append(f"모델: {row['model_name']}")
        if row['serial_number']:
            parts.append(f"S/N: {row['serial_number']}")
        if row['note']:
            parts.append(row['note'])
        if not parts:
            parts = [name]

        yield build_document_record(
            source_domain='시스템',
            source_name='server',
            source_type='db_row',
            source_id=f'server:{row["id"]}',
            title_parts=[name],
            body_parts=parts,
            route_hint=f'/p/hw_server_onpremise_detail?asset_id={row["id"]}',
            menu_code='system.server',
            page_key='hw_server_onpremise_detail',
            entity_type='server',
            metadata={
                'asset_code': row['asset_code'],
                'status': row['status'],
            },
        )


def _iter_dr_training_docs(app) -> Generator[DocumentRecord, None, None]:
    """거버넌스 > DR 모의훈련"""
    from app.models import DrTraining

    with app.app_context():
        for row in DrTraining.query.filter(DrTraining.is_deleted == 0).all():
            parts = [
                f"유형: {row.training_type}" if row.training_type else '',
                f"결과: {row.training_result}" if row.training_result else '',
                f"참여기관: {row.participant_org}" if row.participant_org else '',
                f"날짜: {row.training_date}" if row.training_date else '',
            ]
            parts = [p for p in parts if p]
            if hasattr(row, 'training_remark') and row.training_remark:
                parts.append(row.training_remark)
            yield build_document_record(
                source_domain='거버넌스',
                source_name='dr_training',
                source_type='db_row',
                source_id=f'dr_training:{row.training_id}',
                title_parts=[row.training_name or f'DR훈련 {row.training_id}'],
                body_parts=parts or [row.training_name or ''],
                route_hint=f'/p/gov_dr_training?training_id={row.training_id}',
                menu_code='governance',
                page_key='gov_dr_training',
                entity_type='policy_training',
                metadata={
                    'training_type': row.training_type,
                    'training_result': row.training_result,
                    'training_year': row.training_year,
                },
            )


def _iter_rack_docs(app) -> Generator[DocumentRecord, None, None]:
    """데이터센터 > 랙 레이아웃"""
    from app.models import RackLayout

    with app.app_context():
        for row in RackLayout.query.all():
            yield build_document_record(
                source_domain='데이터센터',
                source_name='rack_layout',
                source_type='db_row',
                source_id=f'rack:{row.id}',
                title_parts=[f'상면도 {row.floor_key}'],
                body_parts=[f'층: {row.floor_key}', f'최종수정: {row.updated_by or ""}'],
                route_hint=f'/p/dc_rack_list?rack_id={row.id}',
                menu_code='datacenter',
                page_key='dc_rack_list',
                entity_type='rack',
                metadata={'floor_key': row.floor_key, 'updated_by': row.updated_by},
            )


def _iter_cost_docs(instance_path: str) -> Generator[DocumentRecord, None, None]:
    """비용관리 > OPEX 계약"""
    db_path = os.path.join(instance_path, 'opex_contract.db')
    if not os.path.exists(db_path):
        print(f'  [skip] opex_contract.db 없음: {db_path}')
        return

    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        try:
            rows = conn.execute(
                "SELECT id, content, vendor, amount, cost_type, contract_year FROM opex_contract LIMIT 2000"
            ).fetchall()
        except sqlite3.OperationalError:
            conn.close()
            return
        conn.close()
    except Exception as exc:
        print(f'  [error] opex_contract 읽기 실패: {exc}')
        return

    for row in rows:
        title = _coalesce(row['content'], f'OPEX {row["id"]}')
        parts = []
        if row['vendor']:
            parts.append(f"벤더: {row['vendor']}")
        if row['cost_type']:
            parts.append(f"유형: {row['cost_type']}")
        if row['amount']:
            parts.append(f"금액: {row['amount']}")
        if row['contract_year']:
            parts.append(f"계약연도: {row['contract_year']}")
        yield build_document_record(
            source_domain='비용관리',
            source_name='cost_detail',
            source_type='db_row',
            source_id=f'cost_opex:{row["id"]}',
            title_parts=[title],
            body_parts=parts or [title],
            route_hint='/p/cost_opex_dashboard',
            menu_code='cost',
            page_key='cost_opex_dashboard',
            entity_type='cost_item',
            metadata={'cost_type': row['cost_type'], 'contract_year': str(row['contract_year'] or '')},
        )


# ─────────────────────────────────────────────────────────────────────────────
# 메인 인덱서
# ─────────────────────────────────────────────────────────────────────────────

DOMAIN_MAP = {
    'blog': ('인사이트 > 블로그', None),
    'project': ('프로젝트', None),
    'server': ('시스템 > 서버', None),
    'dr_training': ('거버넌스 > DR훈련', None),
    'rack': ('데이터센터 > 랙', None),
    'cost': ('비용관리 > OPEX', None),
}


def _index_domain(worker: RagIndexWorker, docs, domain_label: str) -> int:
    count = 0
    for doc in docs:
        try:
            doc_id = worker._upsert_document(doc)
            chunks = list(chunk_text(doc.body_text))
            worker._replace_chunks(doc_id, chunks)
            count += 1
        except Exception as exc:
            print(f'  [error] upsert 실패 source_id={doc.source_id}: {exc}')
    return count


def run_indexer(
    app,
    rag_db_path: str,
    domains: List[str],
) -> None:
    worker = RagIndexWorker(rag_db_path)
    worker.bootstrap_schema()
    instance_path = app.instance_path

    domain_funcs = {
        'blog': lambda: _iter_blog_docs(app),
        'project': lambda: _iter_project_docs(app),
        'server': lambda: _iter_server_docs(instance_path),
        'dr_training': lambda: _iter_dr_training_docs(app),
        'rack': lambda: _iter_rack_docs(app),
        'cost': lambda: _iter_cost_docs(instance_path),
    }

    selected = [d for d in domains if d in domain_funcs]
    if not selected:
        selected = list(domain_funcs.keys())

    total = 0
    for domain in selected:
        label = DOMAIN_MAP.get(domain, (domain, None))[0]
        print(f'\n[{domain}] {label} 인덱싱 중...')
        try:
            docs = domain_funcs[domain]()
            count = _index_domain(worker, docs, label)
            print(f'  → {count}건 완료')
            total += count
        except Exception as exc:
            print(f'  [error] {domain} 실패: {exc}')

    worker.close()
    print(f'\n전체 {total}건 인덱싱 완료 → {rag_db_path}')


def main() -> None:
    parser = argparse.ArgumentParser(description='전 도메인 RAG 배치 인덱서')
    parser.add_argument(
        '--domain',
        nargs='*',
        default=list(DOMAIN_MAP.keys()),
        choices=list(DOMAIN_MAP.keys()),
        help='인덱싱할 도메인 (기본: 전체)',
    )
    parser.add_argument(
        '--db',
        default=str(PROJECT_ROOT / 'instance' / 'rag_index.db'),
        help='rag_index.db 경로',
    )
    args = parser.parse_args()

    from app import create_app

    app = create_app()
    run_indexer(app, args.db, args.domain)


if __name__ == '__main__':
    main()

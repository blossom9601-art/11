"""
거버넌스 API 레퍼런스 모듈 (api_governance_ref.py)
====================================================
api.py 로부터 거버넌스(DR훈련, 백업, 취약점 등) 도메인을
분리하는 **목표 구조 레퍼런스** 이다.

실제 마이그레이션 시 이 파일의 패턴을 따라
api.py 에서 해당 라우트를 이동한다.

사용법 (__init__.py 에서):
    from app.routes.api_governance_ref import governance_ref_bp
    app.register_blueprint(governance_ref_bp)

참고: 이 파일은 레퍼런스 예시이며, 실제 서비스에서는
api.py 의 기존 엔드포인트가 우선 사용된다.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Optional

from flask import Blueprint, request
from app.models import db, DrTraining
from app.routes.common import (
    require_login,
    require_tables,
    db_transaction,
    api_response,
    api_error,
    api_not_found,
    api_bad_request,
    parse_bool_arg,
    coerce_positive_int,
    resolve_actor_user_id,
    safe_strip,
)

logger = logging.getLogger(__name__)

governance_ref_bp = Blueprint('governance_ref', __name__)

# ─────────────────────────────────────────────
# DR 훈련 상수
# ─────────────────────────────────────────────
_DR_ALLOWED_STATUS = frozenset(['예정', '진행중', '완료', '취소'])
_DR_ALLOWED_TYPES = frozenset(['자체 모의훈련', '합동 모의훈련', '외부 모의훈련'])
_DR_ALLOWED_RESULTS = frozenset(['성공', '부분 성공', '실패', '취소', ''])


# ─────────────────────────────────────────────
# 직렬화 헬퍼
# ─────────────────────────────────────────────
def _dr_to_dict(row: DrTraining) -> dict:
    """DrTraining ORM 인스턴스를 API 응답용 dict 로 변환한다."""
    return {
        'id': row.training_id,
        'status': row.training_status,
        'train_date': row.training_date,
        'train_name': row.training_name,
        'train_type': row.training_type,
        'target_systems': int(row.target_system_count or 0),
        'participant_count': int(row.participant_count or 0),
        'orgs': row.participant_org or '',
        'recovery_time': row.recovery_time_text or '',
        'result': row.training_result,
        'note': row.training_remark or '',
        'training_year': int(row.training_year or 0),
        'created_by_user_id': row.created_by_user_id,
        'created_at': row.created_at,
        'updated_by_user_id': row.updated_by_user_id,
        'updated_at': row.updated_at,
        'is_deleted': int(row.is_deleted or 0),
    }


# ─────────────────────────────────────────────
# 필드 적용 헬퍼
# ─────────────────────────────────────────────
def _apply_dr_payload(row: DrTraining, payload: dict, *, strict: bool) -> None:
    """페이로드를 ORM 행에 적용한다. strict=True 면 필수값 검증."""
    status = safe_strip(payload, 'status') or safe_strip(payload, 'training_status')
    train_date = safe_strip(payload, 'train_date') or safe_strip(payload, 'training_date')
    train_name = safe_strip(payload, 'train_name') or safe_strip(payload, 'training_name')
    train_type = safe_strip(payload, 'train_type') or safe_strip(payload, 'training_type')

    if strict:
        if not status:
            raise ValueError('status is required')
        if not train_date:
            raise ValueError('train_date is required')
        if not train_name:
            raise ValueError('train_name is required')

    if status:
        if status not in _DR_ALLOWED_STATUS:
            raise ValueError('invalid status')
        row.training_status = status

    if train_date:
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', train_date):
            raise ValueError('invalid date format')
        row.training_date = train_date
        row.training_year = int(train_date[:4])

    if train_name:
        row.training_name = train_name

    if train_type:
        if train_type not in _DR_ALLOWED_TYPES:
            raise ValueError('invalid train_type')
        row.training_type = train_type


# ─────────────────────────────────────────────
# ✅ 패턴 예시: 데코레이터 기반 라우트
#    기존 api.py 의 인라인 가드 패턴 대비
#    코드량 ~40% 감소, 일관성 향상
# ─────────────────────────────────────────────

@governance_ref_bp.route('/api/_ref/governance/dr-trainings', methods=['GET'])
@require_tables('dr_training')
def ref_list_dr_trainings():
    """DR 훈련 목록 조회.
    
    기존 api.py 대비 변경점:
    - @require_tables 데코레이터로 테이블 존재 확인 (인라인 가드 제거)
    - api_response() 로 통일된 응답 형식
    - parse_bool_arg() 공통 유틸리티 사용
    """
    include_deleted = parse_bool_arg(
        request.args.get('include_deleted') or request.args.get('includeDeleted')
    )
    q = (request.args.get('q') or '').strip() or None
    year = (request.args.get('year') or '').strip() or None

    try:
        query = DrTraining.query
        if not include_deleted:
            query = query.filter(
                (DrTraining.is_deleted == 0) | (DrTraining.is_deleted.is_(None))
            )
        if year and re.fullmatch(r'\d{4}', year):
            query = query.filter(DrTraining.training_year == int(year))
        if q:
            like = f"%{q}%"
            query = query.filter(
                db.or_(
                    DrTraining.training_name.ilike(like),
                    DrTraining.training_type.ilike(like),
                    DrTraining.training_status.ilike(like),
                )
            )
        rows = query.order_by(
            DrTraining.training_date.desc(),
            DrTraining.training_id.desc(),
        ).all()

        items = [_dr_to_dict(r) for r in rows]
        # ✅ api_response 사용 — 항상 {"success": true, ...} 형태 보장
        return api_response(items=items, total=len(items))

    except Exception:
        logger.exception('DR 훈련 목록 조회 실패')
        return api_error('모의훈련 목록 조회 중 오류가 발생했습니다.')


@governance_ref_bp.route('/api/_ref/governance/dr-trainings', methods=['POST'])
@require_login                                   # ✅ 인라인 auth 가드 제거
@require_tables('dr_training')                   # ✅ 인라인 table_ready 가드 제거
@db_transaction('모의훈련 등록 중 오류가 발생했습니다.')  # ✅ try/except 자동화
def ref_create_dr_training():
    """DR 훈련 생성.

    기존 api.py 대비 변경점:
    - @require_login → 인라인 _require_login_for_write() 제거
    - @require_tables → 인라인 _dr_training_table_ready() 제거
    - @db_transaction → try/except + rollback 보일러플레이트 제거
    - ValueError 는 400, 기타 Exception 은 500 으로 자동 변환
    """
    actor_id = coerce_positive_int(resolve_actor_user_id())
    if not actor_id:
        return api_unauthorized('사용자 세션이 만료되었습니다.')

    payload = request.get_json(silent=True) or {}
    now = datetime.utcnow().isoformat(timespec='seconds')

    row = DrTraining(
        training_year=2000,
        training_date='2000-01-01',
        training_name='TEMP',
        training_type='자체 모의훈련',
        training_status='예정',
        training_result='성공',
        target_system_count=0,
        participant_count=0,
        created_by_user_id=actor_id,
        created_at=now,
        is_deleted=0,
    )
    _apply_dr_payload(row, payload, strict=True)
    row.created_at = now
    row.created_by_user_id = actor_id

    db.session.add(row)
    db.session.commit()

    return api_response(item=_dr_to_dict(row), status=201)


@governance_ref_bp.route('/api/_ref/governance/dr-trainings/<int:tid>', methods=['PUT'])
@require_login
@require_tables('dr_training')
@db_transaction('모의훈련 수정 중 오류가 발생했습니다.')
def ref_update_dr_training(tid):
    """DR 훈련 수정."""
    row = DrTraining.query.get(tid)
    if not row or row.is_deleted:
        return api_not_found('대상 훈련을 찾을 수 없습니다.')

    actor_id = coerce_positive_int(resolve_actor_user_id())
    payload = request.get_json(silent=True) or {}

    _apply_dr_payload(row, payload, strict=False)
    row.updated_at = datetime.utcnow().isoformat(timespec='seconds')
    row.updated_by_user_id = actor_id

    db.session.commit()
    return api_response(item=_dr_to_dict(row))


@governance_ref_bp.route('/api/_ref/governance/dr-trainings/bulk-delete', methods=['POST'])
@require_login
@require_tables('dr_training')
@db_transaction('모의훈련 삭제 중 오류가 발생했습니다.')
def ref_bulk_delete_dr_trainings():
    """DR 훈련 소프트 삭제 (bulk)."""
    payload = request.get_json(silent=True) or {}
    ids = payload.get('ids', [])
    if not ids:
        return api_bad_request('삭제할 항목을 선택해 주세요.')

    now = datetime.utcnow().isoformat(timespec='seconds')
    actor_id = coerce_positive_int(resolve_actor_user_id())
    count = 0

    for tid in ids:
        row = DrTraining.query.get(tid)
        if row and not row.is_deleted:
            row.is_deleted = 1
            row.updated_at = now
            row.updated_by_user_id = actor_id
            count += 1

    db.session.commit()
    return api_response(deleted=count)

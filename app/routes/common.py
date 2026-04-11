"""
공통 라우트 유틸리티 모듈
========================
API 라우트에서 반복되는 패턴을 데코레이터와 헬퍼 함수로 추출하여
코드 중복을 줄이고 일관성을 확보한다.

사용 예시:
    from app.routes.common import (
        require_login, require_tables, api_response,
        resolve_actor, table_ready, parse_bool_arg,
    )

    @api_bp.route('/api/items', methods=['POST'])
    @require_login
    @require_tables('item')
    def create_item():
        ...
        return api_response(item=row_to_dict(row))
"""
from __future__ import annotations

import functools
import logging
from typing import Any, Dict, List, Optional, Sequence, Union

from flask import jsonify, request, session
from app.models import db, UserProfile

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────
# 1) 테이블 존재 확인 (캐시 포함)
# ─────────────────────────────────────────────

_table_cache: Dict[str, bool] = {}


def table_ready(*table_names: str) -> bool:
    """주어진 테이블이 모두 DB에 존재하는지 확인한다.

    한 번 True 가 된 테이블은 프로세스 수명 동안 캐시하여
    반복적인 DB Inspector 호출을 방지한다.
    """
    unchecked = [t for t in table_names if not _table_cache.get(t)]
    if not unchecked:
        return True
    try:
        insp = db.inspect(db.engine)
        for t in unchecked:
            exists = insp.has_table(t)
            if exists:
                _table_cache[t] = True
            else:
                return False
        return True
    except Exception:
        logger.exception('테이블 존재 확인 실패: %s', table_names)
        return False


def clear_table_cache():
    """테스트용 — 테이블 캐시 초기화."""
    _table_cache.clear()


# ─────────────────────────────────────────────
# 2) 표준 API 응답 빌더
# ─────────────────────────────────────────────

def api_response(
    success: bool = True,
    status: int = 200,
    **kwargs,
):
    """프로젝트 표준 JSON 응답을 생성한다.

    항상 ``{"success": bool, ...추가 키}`` 형태를 반환한다.

    >>> return api_response(item={'id': 1})           # 200
    >>> return api_response(items=rows, total=len(rows))
    >>> return api_response(success=False, message='에러', status=400)
    """
    body: Dict[str, Any] = {'success': success}
    body.update(kwargs)
    return jsonify(body), status


def api_error(message: str, status: int = 500, **kwargs):
    """실패 응답 단축 함수."""
    return api_response(success=False, message=message, status=status, **kwargs)


def api_not_found(message: str = '대상을 찾을 수 없습니다.'):
    return api_error(message, status=404)


def api_bad_request(message: str):
    return api_error(message, status=400)


def api_unauthorized(message: str = '로그인이 필요합니다.'):
    return api_error(message, status=401)


# ─────────────────────────────────────────────
# 3) 데코레이터: 로그인 필수
# ─────────────────────────────────────────────

def require_login(fn):
    """세션에 인증 정보가 없으면 401 을 반환하는 데코레이터.

    기존 ``_require_login_for_write()`` 인라인 패턴을 대체한다.

    사용법::

        @api_bp.route('/api/foo', methods=['POST'])
        @require_login
        def create_foo():
            ...
    """
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        if not (
            session.get('emp_no')
            or session.get('user_id')
            or session.get('user_profile_id')
            or session.get('profile_user_id')
        ):
            return api_unauthorized()
        return fn(*args, **kwargs)
    return wrapper


# ─────────────────────────────────────────────
# 4) 데코레이터: 테이블 존재 확인
# ─────────────────────────────────────────────

def require_tables(*tables: str):
    """지정된 DB 테이블이 모두 존재해야 진행하는 데코레이터.

    기존 ``if not _xxx_table_ready(): return ...`` 패턴을 대체한다.

    사용법::

        @api_bp.route('/api/dr-trainings', methods=['GET'])
        @require_tables('dr_training')
        def list_dr_trainings():
            ...
    """
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            if not table_ready(*tables):
                names = ', '.join(tables)
                return api_error(
                    f'DB 마이그레이션이 필요합니다. ({names})',
                    status=500,
                )
            return fn(*args, **kwargs)
        return wrapper
    return decorator


# ─────────────────────────────────────────────
# 5) 데코레이터: DB 트랜잭션 래퍼
# ─────────────────────────────────────────────

def db_transaction(error_message: str = '처리 중 오류가 발생했습니다.'):
    """뷰 함수 실행 후 예외 시 자동 rollback + 표준 에러 응답 반환.

    성공 시에는 뷰 함수가 직접 commit 한다고 가정한다.
    ValueError 는 400, 그 외 Exception 은 500 으로 변환된다.

    사용법::

        @api_bp.route('/api/foo', methods=['POST'])
        @require_login
        @db_transaction('항목 생성 중 오류가 발생했습니다.')
        def create_foo():
            row = Foo(...)
            db.session.add(row)
            db.session.commit()
            return api_response(item=row_to_dict(row))
    """
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            try:
                return fn(*args, **kwargs)
            except ValueError as exc:
                db.session.rollback()
                return api_bad_request(str(exc))
            except Exception:
                db.session.rollback()
                logger.exception('%s — %s', error_message, fn.__name__)
                return api_error(error_message)
        return wrapper
    return decorator


# ─────────────────────────────────────────────
# 6) 사용자(actor) 확인 헬퍼
# ─────────────────────────────────────────────

def resolve_actor_user_id(default: Optional[int] = 0) -> Optional[int]:
    """세션에서 현재 사용자의 UserProfile.id 를 추출한다.

    ``session['user_profile_id']``, ``session['emp_no']``,
    ``session['user_id']`` 순서로 시도한다.
    """
    for key in ('user_profile_id', 'profile_user_id'):
        raw = session.get(key)
        if raw is None:
            continue
        try:
            return int(raw)
        except (TypeError, ValueError):
            continue

    emp_no = session.get('emp_no')
    if emp_no:
        try:
            profile = UserProfile.query.filter_by(emp_no=emp_no).first()
        except Exception:
            logger.exception('UserProfile 조회 실패: emp_no=%s', emp_no)
        else:
            if profile:
                return profile.id

    raw_user_id = session.get('user_id')
    if raw_user_id is not None:
        try:
            as_int = int(raw_user_id)
        except (TypeError, ValueError):
            as_int = None
        if as_int is not None:
            try:
                profile = UserProfile.query.get(as_int)
            except Exception:
                profile = None
            if profile:
                return profile.id

    return default


def resolve_actor_display(request_obj=None) -> str:
    """세션에서 현재 사용자의 표시명(이름 또는 사번)을 반환한다."""
    if request_obj is None:
        request_obj = request

    for key in ('user_name', 'profile_name', 'emp_name'):
        val = session.get(key)
        if val:
            return str(val).strip()

    raw_user_id = session.get('user_id') or session.get('user_profile_id')
    if raw_user_id:
        try:
            profile = UserProfile.query.get(int(raw_user_id))
            if profile and getattr(profile, 'name', None):
                return profile.name
        except Exception:
            pass

    emp_no = session.get('emp_no')
    if emp_no:
        try:
            profile = UserProfile.query.filter_by(emp_no=emp_no).first()
            if profile and getattr(profile, 'name', None):
                return profile.name
        except Exception:
            pass

    hdr_actor = (
        request_obj.headers.get('X-Actor')
        or request_obj.headers.get('X-User')
        or ''
    ).strip()
    return hdr_actor or 'system'


# ─────────────────────────────────────────────
# 7) 파라미터 파싱 유틸리티
# ─────────────────────────────────────────────

def parse_bool_arg(value) -> bool:
    """문자열 '1', 'true', 'yes' 등을 bool 로 변환한다."""
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ('1', 'true', 'yes', 'on')


def parse_int(value, default: int = 0) -> int:
    """안전하게 int 변환. 실패 시 default 반환."""
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def coerce_positive_int(value, default=None):
    """양의 정수로 변환. 0 이하 또는 변환 실패 시 default 반환."""
    try:
        n = int(value)
        return n if n > 0 else default
    except (TypeError, ValueError):
        return default


def safe_strip(payload: dict, key: str, default: str = '') -> str:
    """dict 에서 키를 꺼내 strip 한 문자열을 반환한다."""
    val = payload.get(key)
    if val is None:
        return default
    return str(val).strip()


def get_pagination_args(
    default_page: int = 1,
    default_size: int = 20,
    max_size: int = 500,
):
    """request.args 에서 page, size(per_page) 를 추출한다."""
    page = parse_int(request.args.get('page'), default_page)
    size = parse_int(
        request.args.get('size') or request.args.get('per_page'),
        default_size,
    )
    if page < 1:
        page = 1
    if size < 1:
        size = default_size
    if size > max_size:
        size = max_size
    return page, size


def paginate_query(query, default_size: int = 50, max_size: int = 500):
    """SQLAlchemy 쿼리에 페이지네이션을 적용하고 표준 메타데이터를 반환한다.

    query params:
      - page (int, default 1)
      - size / per_page (int, default ``default_size``)
      - limit / offset 도 대체 파라미터로 지원

    Returns dict:
      ``{ 'items': [...], 'page': int, 'size': int, 'total': int, 'pages': int }``
      items 는 SQLAlchemy 모델 리스트이므로 호출자가 직렬화해야 한다.
    """
    # limit/offset 스타일 지원
    raw_limit = request.args.get('limit')
    raw_offset = request.args.get('offset')
    if raw_limit is not None or raw_offset is not None:
        limit = parse_int(raw_limit, default_size)
        if limit < 1:
            limit = default_size
        if limit > max_size:
            limit = max_size
        offset = max(parse_int(raw_offset, 0), 0)
        total = query.count()
        items = query.offset(offset).limit(limit).all()
        return {
            'items': items,
            'offset': offset,
            'limit': limit,
            'total': total,
            'has_more': (offset + len(items)) < total,
        }

    # page/size 스타일
    page, size = get_pagination_args(default_size=default_size, max_size=max_size)
    pagination = query.paginate(page=page, per_page=size, error_out=False)
    return {
        'items': pagination.items,
        'page': page,
        'size': size,
        'total': pagination.total,
        'pages': pagination.pages,
    }

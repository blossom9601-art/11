"""워크플로우 디자이너 서비스 - CRUD + 버전 관리

Tables: wf_design, wf_design_version (SQLAlchemy ORM)
"""
import json
import uuid
from datetime import datetime
from sqlalchemy import func as sa_func

from app.models import db, WfDesign, WfDesignVersion


# ── helpers ──────────────────────────────────────────────────────

def _now():
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S')


def _validate_definition(definition_json: dict) -> list[str]:
    """definition_json 에 대해 기본 검증을 수행한다."""
    errors = []
    nodes = definition_json.get('nodes', [])
    edges = definition_json.get('edges', [])

    if not isinstance(nodes, list):
        errors.append('nodes 는 배열이어야 합니다.')
    if not isinstance(edges, list):
        errors.append('edges 는 배열이어야 합니다.')

    if isinstance(nodes, list):
        types = [n.get('data', {}).get('type') or n.get('type', '') for n in nodes]
        if 'start' not in types:
            errors.append('Start 노드가 필요합니다.')
        if 'end' not in types:
            errors.append('End 노드가 필요합니다.')

    return errors


# ── 워크플로우 목록 ─────────────────────────────────────────────

def list_workflows(*, status=None, owner_user_id=None, page=1, per_page=20, search=None, shared=None):
    """워크플로우 목록 조회. 페이징 지원."""
    # 저장(버전 생성) 전 임시 드래프트(latest_version=0)는 목록에서 숨긴다.
    q = WfDesign.query.filter(WfDesign.is_deleted == 0, WfDesign.latest_version > 0)
    if status:
        q = q.filter(WfDesign.status == status)
    if owner_user_id:
        q = q.filter(WfDesign.owner_user_id == owner_user_id)
    if shared is not None:
        q = q.filter(WfDesign.shared == int(shared))
    if search:
        q = q.filter(WfDesign.name.ilike(f'%{search}%'))
    # SQLite는 NULLS LAST 문법을 지원하지 않으므로 coalesce로 정렬 키를 통일한다.
    q = q.order_by(sa_func.coalesce(WfDesign.updated_at, WfDesign.created_at).desc(), WfDesign.created_at.desc())
    total = q.count()
    items = q.offset((page - 1) * per_page).limit(per_page).all()
    return items, total


def get_workflow(workflow_id: str):
    """워크플로우 단건 조회 (소프트 삭제 제외)."""
    return WfDesign.query.filter_by(id=workflow_id, is_deleted=0).first()


# ── 생성 ────────────────────────────────────────────────────────

def create_workflow(*, name: str, description: str = '', owner_user_id: int,
                    definition_json: dict = None):
    """새 워크플로우 생성. 초기 definition_json 이 있으면 v1 버전도 함께 생성."""
    wf = WfDesign(
        id=str(uuid.uuid4()),
        name=name,
        description=description or '',
        owner_user_id=owner_user_id,
        status='draft',
        latest_version=0,
        created_at=_now(),
    )
    db.session.add(wf)

    if definition_json:
        errs = _validate_definition(definition_json)
        ver = WfDesignVersion(
            id=str(uuid.uuid4()),
            workflow_id=wf.id,
            version=1,
            definition_json=json.dumps(definition_json, ensure_ascii=False),
            created_by=owner_user_id,
            created_at=_now(),
        )
        db.session.add(ver)
        wf.latest_version = 1

    db.session.commit()
    return wf


# ── 수정 ────────────────────────────────────────────────────────

def update_workflow(workflow_id: str, *, name: str = None, description: str = None,
                    status: str = None, shared: int = None, updated_by: int = None):
    """워크플로우 메타 정보 업데이트."""
    wf = get_workflow(workflow_id)
    if not wf:
        return None
    if name is not None:
        wf.name = name
    if description is not None:
        wf.description = description
    if status is not None:
        wf.status = status
    if shared is not None:
        wf.shared = int(shared)
    wf.updated_at = _now()
    db.session.commit()
    return wf


# ── 삭제 (소프트) ───────────────────────────────────────────────

def delete_workflows(workflow_ids: list[str]):
    """워크플로우 소프트 삭제."""
    count = 0
    for wid in workflow_ids:
        wf = WfDesign.query.filter_by(id=wid, is_deleted=0).first()
        if wf:
            wf.is_deleted = 1
            wf.updated_at = _now()
            count += 1
    db.session.commit()
    return count


# ── 버전 저장 ───────────────────────────────────────────────────

def save_version(workflow_id: str, *, definition_json: dict, created_by: int, save_type: str = 'manual'):
    """새 버전 저장. definition_json 에 nodes/edges/viewport 포함."""
    wf = get_workflow(workflow_id)
    if not wf:
        return None, ['워크플로우를 찾을 수 없습니다.']

    errs = _validate_definition(definition_json)
    # 경고만 반환, 저장은 진행 (드래프트 허용)

    new_ver = wf.latest_version + 1
    ver = WfDesignVersion(
        id=str(uuid.uuid4()),
        workflow_id=workflow_id,
        version=new_ver,
        definition_json=json.dumps(definition_json, ensure_ascii=False),
        created_by=created_by,
        created_at=_now(),
        save_type=save_type if save_type in ('manual', 'auto') else 'manual',
    )
    db.session.add(ver)
    wf.latest_version = new_ver
    wf.updated_at = _now()
    db.session.commit()
    return ver, errs


def get_version(workflow_id: str, version: int = None):
    """특정 버전 또는 최신 버전 조회."""
    if version:
        return WfDesignVersion.query.filter_by(
            workflow_id=workflow_id, version=version
        ).first()
    # 최신 버전
    return WfDesignVersion.query.filter_by(
        workflow_id=workflow_id
    ).order_by(WfDesignVersion.version.desc()).first()


def list_versions(workflow_id: str):
    """워크플로우의 전체 버전 목록."""
    return WfDesignVersion.query.filter_by(
        workflow_id=workflow_id
    ).order_by(WfDesignVersion.version.desc()).all()

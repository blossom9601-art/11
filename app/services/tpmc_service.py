"""TPMC (Transaction Processing Performance Council Measure) calculation service.

Calculates TPMC for hardware assets based on their CPU component allocations.

Formula:
  per_core_tpmc = reference_tpmc / reference_core_count
  component_tpmc = qty (allocated cores) × per_core_tpmc
  raw_tpmc = sum(component_tpmc for all CPU components)
  calculated_tpmc = raw_tpmc × role_factor × virtualization_factor
  managed_tpmc = calculated_tpmc × safety_factor

Correction factors:
  virtualization: 0.9 (when virtualization_type is not '물리' / 'Physical')
  role: DB=0.95, WAS=1.0, WEB=1.05 (based on work_category_code)
  safety: 0.8
"""

from __future__ import annotations

import logging
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

# ── Correction factor constants ──────────────────────────────────────────────
FACTOR_VIRTUALIZATION = 0.9
FACTOR_ROLE_DB = 0.95
FACTOR_ROLE_WAS = 1.0
FACTOR_ROLE_WEB = 1.05
FACTOR_ROLE_DEFAULT = 1.0
FACTOR_SAFETY = 0.8

# Role keyword mapping (Korean and English)
_ROLE_MAP = {
    'DB': FACTOR_ROLE_DB,
    'WAS': FACTOR_ROLE_WAS,
    'WEB': FACTOR_ROLE_WEB,
    '데이터베이스': FACTOR_ROLE_DB,
    '웹서버': FACTOR_ROLE_WEB,
    '웹': FACTOR_ROLE_WEB,
}


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        return os.path.join(app.instance_path, 'dev_blossom.db')
    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'dev_blossom.db')
    if netloc not in ('', 'localhost'):
        path = f"//{netloc}{path}"
    # sqlite:///file.db -> path='/file.db' (single leading / = relative)
    # sqlite:////abs.db  -> path='//abs.db' (double leading / = absolute)
    if path.startswith('/') and not path.startswith('//'):
        path = path.lstrip('/')
    if os.path.isabs(path):
        return os.path.abspath(path)
    relative = path.lstrip('/')
    instance_candidate = os.path.abspath(os.path.join(app.instance_path, relative))
    project_candidate = os.path.abspath(os.path.join(_project_root(app), relative))
    if os.path.exists(instance_candidate):
        return instance_candidate
    if os.path.exists(project_candidate):
        return project_candidate
    return instance_candidate


def _connect(app=None) -> sqlite3.Connection:
    app = app or current_app
    db_path = os.path.abspath(_resolve_db_path(app))
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _resolve_role_factor(work_category_code: Optional[str]) -> float:
    """Determine role factor from work_category_code.

    Checks if the code or its human-readable name contains known role keywords.
    """
    if not work_category_code:
        return FACTOR_ROLE_DEFAULT
    token = work_category_code.strip().upper()
    for keyword, factor in _ROLE_MAP.items():
        if keyword.upper() in token:
            return factor
    return FACTOR_ROLE_DEFAULT


def _is_virtual(virtualization_type: Optional[str]) -> bool:
    """Return True if the hardware asset is virtualised."""
    if not virtualization_type:
        return False
    vt = virtualization_type.strip().upper()
    # 'PHYSICAL', '물리' → not virtual; anything else (VM, VIRTUAL, 가상 …) → virtual
    if vt in ('PHYSICAL', '물리', '물리서버', 'BARE_METAL', 'BARE-METAL', ''):
        return False
    return True


def calculate_tpmc(hardware_id: int, app=None) -> Dict[str, Any]:
    """Calculate TPMC for a hardware asset.

    Returns a dict with:
      - cpu_components: list of per-CPU calculation details
      - raw_tpmc: sum of per-component TPMC (before system-level factors)
      - role_factor, virtualization_factor, safety_factor: applied factors
      - tpmc_total: fully factored TPMC
      - tpmc_managed: tpmc_total × safety_factor
      - calculable: whether calculation was possible
      - error: error message if not calculable
    """
    app = app or current_app
    result: Dict[str, Any] = {
        'hardware_id': hardware_id,
        'cpu_components': [],
        'raw_tpmc': None,
        'role_factor': FACTOR_ROLE_DEFAULT,
        'virtualization_factor': 1.0,
        'safety_factor': FACTOR_SAFETY,
        'tpmc_total': None,
        'tpmc_managed': None,
        'calculable': False,
        'error': None,
    }

    with _connect(app) as conn:
        # 1) Fetch hardware asset info for role/virtualization
        hw_row = conn.execute(
            "SELECT work_category_code, virtualization_type FROM hardware "
            "WHERE id = ? AND is_deleted = 0",
            (hardware_id,),
        ).fetchone()
        if not hw_row:
            result['error'] = '하드웨어 자산을 찾을 수 없습니다.'
            return result

        work_cat = hw_row['work_category_code']
        virt_type = hw_row['virtualization_type']

        role_factor = _resolve_role_factor(work_cat)
        virt_is_virtual = _is_virtual(virt_type)
        virt_factor = FACTOR_VIRTUALIZATION if virt_is_virtual else 1.0

        result['role_factor'] = role_factor
        result['virtualization_factor'] = virt_factor

        # 2) Fetch CPU components for this hardware
        cpu_rows = conn.execute(
            "SELECT id, model, qty, active_capacity FROM server_hw_component "
            "WHERE hardware_id = ? AND UPPER(type) = 'CPU'",
            (hardware_id,),
        ).fetchall()

        if not cpu_rows:
            result['error'] = 'CPU 컴포넌트가 할당되지 않았습니다.'
            return result

        # 3) For each CPU component, look up TPMC reference from catalog
        cpu_details = []
        raw_tpmc_sum = 0.0
        all_calculable = True

        for cpu_row in cpu_rows:
            model_name = (cpu_row['model'] or '').strip()
            qty = int(cpu_row['qty'] or 0)
            # active_capacity = 활성용량 (실제 활성 코어 수)
            active_raw = cpu_row['active_capacity']
            try:
                import re as _re_ac
                _m_ac = _re_ac.search(r'(\d+)', str(active_raw or ''))
                active_capacity = int(_m_ac.group(1)) if _m_ac else qty
            except (ValueError, TypeError):
                active_capacity = qty
            comp_id = cpu_row['id']

            detail: Dict[str, Any] = {
                'component_id': comp_id,
                'model': model_name,
                'qty': qty,
                'active_capacity': active_capacity,
                'reference_core_count': None,
                'reference_tpmc': None,
                'per_core_tpmc': None,
                'component_tpmc': None,
                'calculable': False,
                'error': None,
            }

            if not model_name:
                detail['error'] = '모델명 없음'
                all_calculable = False
                cpu_details.append(detail)
                continue

            # Look up CPU type reference values (case-insensitive)
            # spec_summary = 용량 = 기준 코어 수
            # cmp_cpu_type lives in a separate SQLite DB managed by cmp_cpu_type_service
            cat_row = None
            try:
                from app.services.cmp_cpu_type_service import _get_connection as _cpu_conn
                with _cpu_conn(app) as cpu_db:
                    cat_row = cpu_db.execute(
                        "SELECT spec_summary, reference_core_count, reference_tpmc FROM cmp_cpu_type "
                        "WHERE LOWER(model_name) = LOWER(?) AND is_deleted = 0 LIMIT 1",
                        (model_name,),
                    ).fetchone()
            except Exception:
                # Fallback: try main DB in case tables were co-located
                try:
                    cat_row = conn.execute(
                        "SELECT spec_summary, reference_core_count, reference_tpmc FROM cmp_cpu_type "
                        "WHERE LOWER(model_name) = LOWER(?) AND is_deleted = 0 LIMIT 1",
                        (model_name,),
                    ).fetchone()
                except Exception:
                    cat_row = None

            if not cat_row:
                detail['error'] = 'CPU 카탈로그에서 모델을 찾을 수 없습니다.'
                all_calculable = False
                cpu_details.append(detail)
                continue

            ref_core_raw = cat_row['spec_summary']
            try:
                ref_core = int(float(ref_core_raw)) if ref_core_raw else None
            except (ValueError, TypeError):
                # spec_summary may contain units like "11 Core"; extract leading digits
                import re as _re
                m = _re.search(r'(\d+)', str(ref_core_raw or ''))
                ref_core = int(m.group(1)) if m else None
            # Prefer explicit reference_core_count column when available
            try:
                rcc = cat_row['reference_core_count']
                if rcc is not None and int(float(rcc)) > 0:
                    ref_core = int(float(rcc))
            except (ValueError, TypeError, KeyError, IndexError):
                pass
            ref_tpmc = cat_row['reference_tpmc']
            detail['reference_core_count'] = ref_core
            detail['reference_tpmc'] = ref_tpmc

            if not ref_core or not ref_tpmc or ref_core <= 0:
                detail['error'] = 'TPMC 참조값이 등록되지 않았습니다.'
                all_calculable = False
                cpu_details.append(detail)
                continue

            per_core = ref_tpmc / ref_core
            component_tpmc = active_capacity * per_core
            detail['per_core_tpmc'] = round(per_core, 4)
            detail['component_tpmc'] = round(component_tpmc, 4)
            detail['calculable'] = True

            raw_tpmc_sum += component_tpmc
            cpu_details.append(detail)

        result['cpu_components'] = cpu_details
        result['raw_tpmc'] = round(raw_tpmc_sum, 4) if cpu_details else None

        if not all_calculable:
            result['error'] = '일부 CPU의 TPMC 참조값이 누락되어 있습니다.'
            # Still compute partial result
            if raw_tpmc_sum > 0:
                total = raw_tpmc_sum * role_factor * virt_factor
                managed = total * FACTOR_SAFETY
                result['tpmc_total'] = round(total, 2)
                result['tpmc_managed'] = round(managed, 2)
                result['calculable'] = True  # partially calculable
            return result

        if raw_tpmc_sum <= 0:
            result['error'] = '계산 가능한 TPMC가 0입니다.'
            return result

        # Apply system-level factors
        total = raw_tpmc_sum * role_factor * virt_factor
        managed = total * FACTOR_SAFETY

        result['tpmc_total'] = round(total, 2)
        result['tpmc_managed'] = round(managed, 2)
        result['calculable'] = True
        result['error'] = None

    return result


def recalculate_and_store(hardware_id: int, app=None) -> Dict[str, Any]:
    """Calculate TPMC and persist the snapshot to the hardware table."""
    app = app or current_app
    calc = calculate_tpmc(hardware_id, app=app)

    tpmc_total = calc.get('tpmc_total')
    tpmc_managed = calc.get('tpmc_managed')
    timestamp = _now()

    with _connect(app) as conn:
        conn.execute(
            "UPDATE hardware SET tpmc_total = ?, tpmc_managed = ?, tpmc_updated_at = ? "
            "WHERE id = ? AND is_deleted = 0",
            (tpmc_total, tpmc_managed, timestamp, hardware_id),
        )
        conn.commit()

    calc['tpmc_updated_at'] = timestamp
    return calc


def get_tpmc_factors() -> Dict[str, Any]:
    """Return the current TPMC correction factor configuration."""
    return {
        'virtualization': FACTOR_VIRTUALIZATION,
        'role_db': FACTOR_ROLE_DB,
        'role_was': FACTOR_ROLE_WAS,
        'role_web': FACTOR_ROLE_WEB,
        'role_default': FACTOR_ROLE_DEFAULT,
        'safety': FACTOR_SAFETY,
    }

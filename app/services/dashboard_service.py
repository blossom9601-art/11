"""
대시보드 서비스 — 메인 대시보드 통계 데이터 조회
"""
import os
import sqlite3
import logging
from datetime import datetime, timedelta, date
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# DB helpers (동일 패턴: hardware/software service와 동일)
# ---------------------------------------------------------------------------

def _project_root(app=None):
    app = app or current_app
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_main_db(app=None):
    """메인 SQLite DB 경로 해석 (hardware/software와 동일 로직)"""
    app = app or current_app
    uri = app.config.get("SQLALCHEMY_DATABASE_URI", "sqlite:///dev_blossom.db")
    if not uri.startswith("sqlite"):
        return None
    parsed = urlparse(uri)
    path = parsed.path or ""
    netloc = parsed.netloc or ""
    if path in (":memory:", "/:memory:"):
        return None
    if netloc not in ("", "localhost"):
        path = f"//{netloc}{path}"
    if os.name == 'nt' and path.startswith('/') and not path.startswith('//'):
        if len(path) >= 4 and path[1].isalpha() and path[2] == ':' and path[3] == '/':
            path = path[1:]
    if os.path.isabs(path):
        return os.path.abspath(path)
    relative = path.lstrip("/")
    inst = os.path.abspath(os.path.join(app.instance_path, relative))
    proj = os.path.abspath(os.path.join(_project_root(app), relative))
    if os.path.exists(inst):
        return inst
    if os.path.exists(proj):
        return proj
    return inst


def _sqlite_conn(db_path):
    """Create a read-only sqlite3 connection"""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _safe_count(conn, sql, params=()):
    try:
        row = conn.execute(sql, params).fetchone()
        return row[0] if row else 0
    except Exception:
        return 0


def _safe_rows(conn, sql, params=()):
    try:
        return conn.execute(sql, params).fetchall()
    except Exception:
        return []


# ---------------------------------------------------------------------------
# 기간 계산 유틸리티
# ---------------------------------------------------------------------------

def _range_dates(range_code):
    """기간 코드에 따라 (current_start, current_end, prev_start, prev_end) 반환
    range_code: '1d','1w','1m','3m','1y'
    """
    today = date.today()
    end = today

    if range_code == '1d':
        start = today
        delta = timedelta(days=1)
    elif range_code == '1w':
        start = today - timedelta(days=7)
        delta = timedelta(days=7)
    elif range_code == '3m':
        start = today - timedelta(days=90)
        delta = timedelta(days=90)
    elif range_code == '1y':
        start = today - timedelta(days=365)
        delta = timedelta(days=365)
    else:  # default '1m'
        start = today - timedelta(days=30)
        delta = timedelta(days=30)

    prev_end = start - timedelta(days=1)
    prev_start = prev_end - (end - start)

    return (
        start.isoformat(),
        end.isoformat(),
        prev_start.isoformat(),
        prev_end.isoformat(),
    )


# ---------------------------------------------------------------------------
# 메인 대시보드 통계
# ---------------------------------------------------------------------------

def compute_dashboard_stats(range_code='1m'):
    """대시보드 KPI + 차트 데이터 반환"""
    from app.models import PrjProject, WrkReport, Task, Maintenance, db as sa_db

    cur_start, cur_end, prev_start, prev_end = _range_dates(range_code)

    result = {
        'kpi': {},
        'charts': {},
        'range': range_code,
        'period': {'start': cur_start, 'end': cur_end},
    }

    # ===== 1. Hardware KPI + 구성 차트 =====
    hw_data = _get_hardware_stats(cur_start, cur_end, prev_start, prev_end)
    result['kpi']['hardware'] = hw_data['kpi']
    result['charts']['hardware'] = hw_data['breakdown']

    # ===== 2. Software KPI + 구성 차트 =====
    sw_data = _get_software_stats(cur_start, cur_end, prev_start, prev_end)
    result['kpi']['software'] = sw_data['kpi']
    result['charts']['software'] = sw_data['breakdown']

    # ===== 3. 작업(WrkReport) KPI + 시계열 =====
    wrk_data = _get_work_stats(sa_db, cur_start, cur_end, prev_start, prev_end)
    result['kpi']['task'] = wrk_data['kpi']
    result['charts']['task'] = wrk_data['monthly']

    # ===== 4. 프로젝트 구성 차트 =====
    prj_data = _get_project_stats(sa_db)
    result['charts']['project'] = prj_data['breakdown']
    result['kpi']['project'] = prj_data['kpi']

    # ===== 5. 유지보수 KPI + 시계열 =====
    mtce_data = _get_maintenance_stats(cur_start, cur_end, prev_start, prev_end, range_code)
    result['kpi']['maintenance'] = mtce_data['kpi']
    result['charts']['maintenance'] = mtce_data['monthly']
    result['charts']['maintenance_by_type'] = mtce_data.get('by_type', [])

    return result


# ---------------------------------------------------------------------------
# Hardware (카테고리 > 하드웨어 type 테이블)
# ---------------------------------------------------------------------------

_HW_TYPE_SOURCES = [
    ('app.services.hw_server_type_service',   'hw_server_type',   'SERVER',   '서버'),
    ('app.services.hw_storage_type_service',  'hw_storage_type',  'STORAGE',  '스토리지'),
    ('app.services.hw_san_type_service',      'hw_san_type',      'SAN',      'SAN'),
    ('app.services.hw_network_type_service',  'hw_network_type',  'NETWORK',  '네트워크'),
    ('app.services.hw_security_type_service', 'hw_security_type', 'SECURITY', '보안장비'),
]

def _get_hardware_stats(cur_start, cur_end, prev_start, prev_end):
    total = 0
    current_total = 0
    prev_total = 0
    breakdown = []

    for mod_path, table, key, label in _HW_TYPE_SOURCES:
        try:
            mod = __import__(mod_path, fromlist=['_get_connection'])
            conn = mod._get_connection()
        except Exception:
            continue
        try:
            cnt = _safe_count(conn, "SELECT COUNT(1) FROM {} WHERE is_deleted = 0".format(table))
            cur_cnt = _safe_count(
                conn,
                "SELECT COUNT(1) FROM {} WHERE is_deleted = 0 AND created_at >= ? AND created_at <= ?".format(table),
                (cur_start, cur_end + 'T23:59:59'),
            )
            prev_cnt = _safe_count(
                conn,
                "SELECT COUNT(1) FROM {} WHERE is_deleted = 0 AND created_at >= ? AND created_at <= ?".format(table),
                (prev_start, prev_end + 'T23:59:59'),
            )
            total += cnt
            current_total += cur_cnt
            prev_total += prev_cnt
            if cnt > 0:
                breakdown.append({'key': key, 'label': label, 'value': cnt})
        except Exception:
            logger.exception("hardware category [%s] 통계 조회 실패", table)
        finally:
            conn.close()

    breakdown.sort(key=lambda x: x['value'], reverse=True)
    return {
        'kpi': {'total': total, 'current': current_total, 'prev': prev_total},
        'breakdown': breakdown,
    }


# ---------------------------------------------------------------------------
# Software (카테고리 > 소프트웨어 type 테이블)
# ---------------------------------------------------------------------------

_SW_TYPE_SOURCES = [
    ('app.services.sw_os_type_service',                'sw_os_type',          'OS',               '운영체제'),
    ('app.services.sw_db_type_service',                'sw_db_type',          'DATABASE',          '데이터베이스'),
    ('app.services.sw_middleware_type_service',         'sw_middleware_type',  'MIDDLEWARE',         '미들웨어'),
    ('app.services.sw_virtual_type_service',            'sw_virtual_type',     'VIRTUALIZATION',     '가상화'),
    ('app.services.sw_security_type_service',           'sw_security_sw_type', 'SECURITY',          '보안S/W'),
    ('app.services.sw_high_availability_type_service',  'sw_ha_type',          'HIGH_AVAILABILITY', '고가용성'),
]

def _get_software_stats(cur_start, cur_end, prev_start, prev_end):
    total = 0
    current_total = 0
    prev_total = 0
    breakdown = []

    for mod_path, table, key, label in _SW_TYPE_SOURCES:
        try:
            mod = __import__(mod_path, fromlist=['_get_connection'])
            conn = mod._get_connection()
        except Exception:
            continue
        try:
            cnt = _safe_count(conn, "SELECT COUNT(1) FROM {} WHERE is_deleted = 0".format(table))
            cur_cnt = _safe_count(
                conn,
                "SELECT COUNT(1) FROM {} WHERE is_deleted = 0 AND created_at >= ? AND created_at <= ?".format(table),
                (cur_start, cur_end + 'T23:59:59'),
            )
            prev_cnt = _safe_count(
                conn,
                "SELECT COUNT(1) FROM {} WHERE is_deleted = 0 AND created_at >= ? AND created_at <= ?".format(table),
                (prev_start, prev_end + 'T23:59:59'),
            )
            total += cnt
            current_total += cur_cnt
            prev_total += prev_cnt
            if cnt > 0:
                breakdown.append({'key': key, 'label': label, 'value': cnt})
        except Exception:
            logger.exception("software category [%s] 통계 조회 실패", table)
        finally:
            conn.close()

    breakdown.sort(key=lambda x: x['value'], reverse=True)
    return {
        'kpi': {'total': total, 'current': current_total, 'prev': prev_total},
        'breakdown': breakdown,
    }


# ---------------------------------------------------------------------------
# Work Reports (SQLAlchemy: wrk_report)
# ---------------------------------------------------------------------------

def _get_work_stats(sa_db, cur_start, cur_end, prev_start, prev_end):
    """완료 작업 기준 통계 — 작업 유형(점검/테스트 등)별 집계."""
    try:
        from app.models import WrkReport
        from sqlalchemy import func, text

        completed_statuses = ('COMPLETED', 'ARCHIVED')

        base = sa_db.session.query(WrkReport).filter(
            WrkReport.is_deleted == 0,
            WrkReport.status.in_(completed_statuses),
        )
        total = base.count()

        # 현재 기간
        current_count = base.filter(
            WrkReport.created_at >= cur_start,
            WrkReport.created_at <= cur_end + 'T23:59:59'
        ).count()
        prev_count = base.filter(
            WrkReport.created_at >= prev_start,
            WrkReport.created_at <= prev_end + 'T23:59:59'
        ).count()

        # 월별 × 작업유형 시계열 (최근 12개월, 완료/보관만)
        today = date.today()

        try:
            monthly_raw = sa_db.session.execute(text("""
                SELECT strftime('%Y-%m', r.created_at) AS m,
                       COALESCE(wt.value, '기타')       AS work_type,
                       COUNT(1)                         AS cnt
                FROM wrk_report r
                LEFT JOIN wrk_report_worktype wt ON wt.report_id = r.id
                WHERE r.is_deleted = 0
                  AND r.status IN ('COMPLETED', 'ARCHIVED')
                  AND r.created_at >= :start
                GROUP BY m, work_type
                ORDER BY m
            """), {'start': (today - timedelta(days=365)).isoformat()}).fetchall()

            monthly = {}
            for row in monthly_raw:
                m = row[0]
                wt = row[1] or '기타'
                cnt = row[2]
                if m not in monthly:
                    monthly[m] = {}
                monthly[m][wt] = monthly[m].get(wt, 0) + cnt

        except Exception:
            logger.exception("월별 작업 통계 실패")
            monthly = {}

        return {
            'kpi': {'total': total, 'current': current_count, 'prev': prev_count},
            'monthly': monthly,
        }
    except Exception:
        logger.exception("작업 통계 조회 실패")
        return {'kpi': {'total': 0, 'prev': 0}, 'monthly': {}}


# ---------------------------------------------------------------------------
# Project (SQLAlchemy: prj_project)
# ---------------------------------------------------------------------------

def _get_project_stats(sa_db):
    try:
        from app.models import PrjProject
        from sqlalchemy import func, text

        base = sa_db.session.query(PrjProject).filter(PrjProject.is_deleted == 0)
        total = base.count()

        # 프로젝트 유형별 breakdown
        rows = sa_db.session.execute(text("""
            SELECT project_type, COUNT(1) as cnt
            FROM prj_project
            WHERE is_deleted = 0
            GROUP BY project_type
            ORDER BY cnt DESC
        """)).fetchall()

        type_labels = {
            '신규 구축': '신규 구축',
            '개선/고도화': '개선/고도화',
            '유지보수': '유지보수',
            '운영지원': '운영지원',
        }
        breakdown = []
        for r in rows:
            pt = r[0] or '기타'
            breakdown.append({
                'key': pt,
                'label': type_labels.get(pt, pt),
                'value': r[1],
            })

        return {
            'kpi': {'total': total},
            'breakdown': breakdown,
        }
    except Exception:
        logger.exception("프로젝트 통계 조회 실패")
        return {'kpi': {'total': 0}, 'breakdown': []}


# ---------------------------------------------------------------------------
# Maintenance / OPEX contracts (sqlite: opex_contract)
# ---------------------------------------------------------------------------

def _get_maintenance_stats(cur_start, cur_end, prev_start, prev_end, range_code='1m'):
    empty = {'kpi': {'period_cost': 0, 'count': 0, 'period_label': ''}, 'monthly': {}, 'by_type': []}
    try:
        from app.services.opex_contract_service import _get_connection
        conn = _get_connection()
    except Exception:
        logger.exception("OPEX DB 연결 실패")
        return empty

    try:
        today = date.today()

        # 기준 라벨 계산
        if range_code == '1y':
            period_label = str(today.year)
        elif range_code == '3m':
            m_start = today - timedelta(days=90)
            if m_start.year == today.year:
                period_label = '{}/{:02d}-{:02d}'.format(today.year, m_start.month, today.month)
            else:
                period_label = '{}/{:02d}-{}/{:02d}'.format(m_start.year, m_start.month, today.year, today.month)
        else:  # 1m (default)
            period_label = '{}/{:02d}'.format(today.year, today.month)

        # 해당 기간 유지보수 비용 (maintenance_start_date ~ maintenance_end_date 가 기간과 겹치는 계약)
        period_cost = _safe_count(
            conn,
            """SELECT COALESCE(SUM(maintenance_amount), 0) FROM opex_contract
               WHERE is_deleted = 0
                 AND maintenance_end_date >= ?
                 AND maintenance_start_date <= ?""",
            (cur_start, cur_end + 'T23:59:59'),
        )
        count = _safe_count(
            conn,
            """SELECT COUNT(1) FROM opex_contract
               WHERE is_deleted = 0
                 AND maintenance_end_date >= ?
                 AND maintenance_start_date <= ?""",
            (cur_start, cur_end + 'T23:59:59'),
        )

        # 타입(HW/SW/ETC)별 집계 (현재 기간)
        type_rows = _safe_rows(
            conn,
            """SELECT opex_type, COUNT(1) as cnt, COALESCE(SUM(maintenance_amount), 0) as total
               FROM opex_contract
               WHERE is_deleted = 0
                 AND maintenance_end_date >= ?
                 AND maintenance_start_date <= ?
               GROUP BY opex_type ORDER BY opex_type""",
            (cur_start, cur_end + 'T23:59:59'),
        )
        type_labels = {'HW': '하드웨어', 'SW': '소프트웨어', 'ETC': '기타 사용료'}
        by_type = []
        for r in type_rows:
            by_type.append({
                'key': r['opex_type'],
                'label': type_labels.get(r['opex_type'], r['opex_type']),
                'count': r['cnt'],
                'cost': r['total'],
            })

        # 월별 유지보수 타입별 시계열 (created_at 기반, 최근 12개월)
        monthly_raw = _safe_rows(
            conn,
            """SELECT strftime('%Y-%m', created_at) as m, opex_type,
                      COUNT(1) as cnt, COALESCE(SUM(maintenance_amount), 0) as total
               FROM opex_contract
               WHERE is_deleted = 0 AND created_at >= ?
               GROUP BY m, opex_type ORDER BY m""",
            ((today - timedelta(days=365)).isoformat(),)
        )
        monthly = {}
        for r in monthly_raw:
            m = r['m']
            if m not in monthly:
                monthly[m] = {}
            monthly[m][r['opex_type']] = {'count': r['cnt'], 'cost': r['total']}

        return {
            'kpi': {
                'period_cost': period_cost,
                'count': count,
                'period_label': period_label,
            },
            'monthly': monthly,
            'by_type': by_type,
        }
    except Exception:
        logger.exception("유지보수 통계 조회 실패")
        return empty
    finally:
        conn.close()

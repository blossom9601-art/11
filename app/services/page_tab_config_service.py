# -*- coding: utf-8 -*-
"""page_tab_config 테이블 초기화 + CRUD 서비스."""

import logging
from datetime import datetime

from app.models import db, PageTabConfig

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
# 테이블 초기화 (CREATE IF NOT EXISTS + 시드)
# ──────────────────────────────────────────────

_SEED_ROWS = [
    # ── 거버넌스 > VPN 정책 (초기 1개 탭) ─────
    {'page_code': 'GOV_VPN_POLICY', 'tab_code': 'VPN1', 'tab_name': 'VPN',
     'tab_order': 1, 'route_key': 'gov_vpn_policy'},
    # ── 거버넌스 > 전용회선 정책 (초기 1개 탭) ─
    {'page_code': 'GOV_DEDICATED_LINE_POLICY', 'tab_code': 'MEMBER', 'tab_name': '전용회선',
     'tab_order': 1, 'route_key': 'gov_dedicatedline_member'},
    # ── 카테고리 > 고객 ──────────────────────
    {'page_code': 'CATEGORY_CUSTOMER', 'tab_code': 'CLIENT1', 'tab_name': '고객',
     'tab_order': 1, 'route_key': 'cat_customer_client1'},
    # ── 데이터센터 > RACK 관리 (초기 1개 탭) ───
    {'page_code': 'DC_RACK', 'tab_code': 'LAB1', 'tab_name': 'Sample Datacenter',
     'tab_order': 1, 'route_key': 'dc_rack_lab1'},
    {'page_code': 'DC_RACK', 'tab_code': 'LIST', 'tab_name': 'RACK 관리',
     'tab_order': 2, 'route_key': 'dc_rack_list'},
    # ── 데이터센터 > 온/습도 관리 (초기 1개 탭) ─
    {'page_code': 'DC_THERMOMETER', 'tab_code': 'LAB1', 'tab_name': 'Sample Datacenter',
     'tab_order': 1, 'route_key': 'dc_thermo_lab1'},
    {'page_code': 'DC_THERMOMETER', 'tab_code': 'LIST', 'tab_name': '온/습도 관리',
     'tab_order': 2, 'route_key': 'dc_thermometer_list'},
    {'page_code': 'DC_THERMOMETER', 'tab_code': 'LOG', 'tab_name': '온/습도 로그',
     'tab_order': 3, 'route_key': 'dc_thermometer_log'},
    # ── 데이터센터 > CCTV 관리 (초기 1개 탭) ───
    {'page_code': 'DC_CCTV', 'tab_code': 'LAB1', 'tab_name': 'Sample Datacenter',
     'tab_order': 1, 'route_key': 'dc_cctv_lab1'},
    {'page_code': 'DC_CCTV', 'tab_code': 'LIST', 'tab_name': 'CCTV 관리',
     'tab_order': 2, 'route_key': 'dc_cctv_list'},
]


_REQUIRED_ROWS = [
    {'page_code': 'DC_RACK', 'tab_code': 'LAB1', 'tab_name': 'RACK1',
     'tab_order': 1, 'route_key': 'dc_rack_lab1'},
    {'page_code': 'DC_RACK', 'tab_code': 'LIST', 'tab_name': 'RACK 관리',
     'tab_order': 2, 'route_key': 'dc_rack_list'},
    {'page_code': 'DC_THERMOMETER', 'tab_code': 'LAB1', 'tab_name': '온/습도1',
     'tab_order': 1, 'route_key': 'dc_thermo_lab1'},
    {'page_code': 'DC_THERMOMETER', 'tab_code': 'LIST', 'tab_name': '온/습도 관리',
     'tab_order': 2, 'route_key': 'dc_thermometer_list'},
    {'page_code': 'DC_THERMOMETER', 'tab_code': 'LOG', 'tab_name': '온/습도 로그',
     'tab_order': 3, 'route_key': 'dc_thermometer_log'},
    {'page_code': 'DC_CCTV', 'tab_code': 'LAB1', 'tab_name': 'CCTV1',
     'tab_order': 1, 'route_key': 'dc_cctv_lab1'},
    {'page_code': 'DC_CCTV', 'tab_code': 'LIST', 'tab_name': 'CCTV 관리',
     'tab_order': 2, 'route_key': 'dc_cctv_list'},
]


def init_page_tab_config_table(app):
    """page_tab_config 테이블 생성 + 기본 시드 데이터 삽입."""
    try:
        with app.app_context():
            db.session.execute(db.text("""
                CREATE TABLE IF NOT EXISTS page_tab_config (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    page_code       VARCHAR(64)  NOT NULL,
                    tab_code        VARCHAR(64)  NOT NULL,
                    tab_name        VARCHAR(128) NOT NULL,
                    tab_order       INTEGER      NOT NULL DEFAULT 0,
                    is_active       INTEGER      NOT NULL DEFAULT 1,
                    description     TEXT,
                    created_by      VARCHAR(64),
                    updated_by      VARCHAR(64),
                    tab_color       VARCHAR(32),
                    permission_code VARCHAR(64),
                    route_key       VARCHAR(128),
                    extra_options   TEXT,
                    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at      TEXT,
                    is_deleted      INTEGER NOT NULL DEFAULT 0,
                    UNIQUE(page_code, tab_code)
                )
            """))
            db.session.commit()

            # 시드: 행이 하나도 없을 때만 삽입
            cnt = db.session.execute(
                db.text("SELECT COUNT(*) FROM page_tab_config WHERE is_deleted=0")
            ).scalar()
            if cnt == 0:
                for row in _SEED_ROWS:
                    db.session.execute(db.text("""
                        INSERT INTO page_tab_config
                            (page_code, tab_code, tab_name, tab_order, is_active, route_key)
                        VALUES (:page_code, :tab_code, :tab_name, :tab_order, 1, :route_key)
                    """), row)
                db.session.commit()
                print('[page-tab-config] seeded', len(_SEED_ROWS), 'rows', flush=True)

            # 필수 LIST/LOG 탭은 기존 데이터가 있더라도 누락 시 자동 복구한다.
            # UNIQUE(page_code, tab_code) 제약이 있어 soft-delete 행이 남아 있으면
            # 신규 INSERT가 실패하므로, 우선 기존 행을 복구/정규화한다.
            for row in _REQUIRED_ROWS:
                existing = db.session.execute(db.text("""
                    SELECT id
                      FROM page_tab_config
                     WHERE page_code=:page_code
                       AND tab_code=:tab_code
                     LIMIT 1
                """), {
                    'page_code': row['page_code'],
                    'tab_code': row['tab_code'],
                }).first()

                if existing:
                    db.session.execute(db.text("""
                        UPDATE page_tab_config
                           SET tab_name=:tab_name,
                               tab_order=:tab_order,
                               route_key=:route_key,
                               is_active=1,
                               is_deleted=0,
                               updated_at=CURRENT_TIMESTAMP
                         WHERE id=:id
                    """), {
                        'id': existing[0],
                        'tab_name': row['tab_name'],
                        'tab_order': row['tab_order'],
                        'route_key': row['route_key'],
                    })
                    continue

                db.session.execute(db.text("""
                    INSERT INTO page_tab_config
                        (page_code, tab_code, tab_name, tab_order, is_active, route_key)
                    VALUES (:page_code, :tab_code, :tab_name, :tab_order, 1, :route_key)
                """), row)
            db.session.commit()
    except Exception as e:
        db.session.rollback()
        logger.warning('page_tab_config init: %s', e)

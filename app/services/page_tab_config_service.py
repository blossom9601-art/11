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
    # ── 거버넌스 > VPN 정책 ───────────────────
    {'page_code': 'GOV_VPN_POLICY', 'tab_code': 'VPN1', 'tab_name': '대외계',
     'tab_order': 1, 'route_key': 'gov_vpn_policy'},
    {'page_code': 'GOV_VPN_POLICY', 'tab_code': 'VPN2', 'tab_name': '대외온라인',
     'tab_order': 2, 'route_key': 'gov_vpn_policy2'},
    {'page_code': 'GOV_VPN_POLICY', 'tab_code': 'VPN3', 'tab_name': '우리카드',
     'tab_order': 3, 'route_key': 'gov_vpn_policy3'},
    {'page_code': 'GOV_VPN_POLICY', 'tab_code': 'VPN4', 'tab_name': '직승인',
     'tab_order': 4, 'route_key': 'gov_vpn_policy4'},
    {'page_code': 'GOV_VPN_POLICY', 'tab_code': 'VPN5', 'tab_name': '공중망',
     'tab_order': 5, 'route_key': 'gov_vpn_policy5'},
    # ── 거버넌스 > 전용회선 정책 ──────────────
    {'page_code': 'GOV_DEDICATED_LINE_POLICY', 'tab_code': 'MEMBER', 'tab_name': '회원사',
     'tab_order': 1, 'route_key': 'gov_dedicatedline_member'},
    {'page_code': 'GOV_DEDICATED_LINE_POLICY', 'tab_code': 'CUSTOMER', 'tab_name': '고객사',
     'tab_order': 2, 'route_key': 'gov_dedicatedline_customer'},
    {'page_code': 'GOV_DEDICATED_LINE_POLICY', 'tab_code': 'VAN', 'tab_name': 'VAN사',
     'tab_order': 3, 'route_key': 'gov_dedicatedline_van'},
    {'page_code': 'GOV_DEDICATED_LINE_POLICY', 'tab_code': 'AFFILIATE', 'tab_name': '제휴사',
     'tab_order': 4, 'route_key': 'gov_dedicatedline_affiliate'},
    {'page_code': 'GOV_DEDICATED_LINE_POLICY', 'tab_code': 'INTRANET', 'tab_name': '사내망',
     'tab_order': 5, 'route_key': 'gov_dedicatedline_intranet'},
    # ── 카테고리 > 고객 ──────────────────────
    {'page_code': 'CATEGORY_CUSTOMER', 'tab_code': 'CLIENT1', 'tab_name': '고객',
     'tab_order': 1, 'route_key': 'cat_customer_client1'},
    # ── 데이터센터 > RACK 관리 ────────────────
    {'page_code': 'DC_RACK', 'tab_code': 'LAB1', 'tab_name': '퓨처센터5층',
     'tab_order': 1, 'route_key': 'dc_rack_lab1'},
    {'page_code': 'DC_RACK', 'tab_code': 'LAB2', 'tab_name': '퓨처센터6층',
     'tab_order': 2, 'route_key': 'dc_rack_lab2'},
    {'page_code': 'DC_RACK', 'tab_code': 'LAB3', 'tab_name': '을지트윈타워15층',
     'tab_order': 3, 'route_key': 'dc_rack_lab3'},
    {'page_code': 'DC_RACK', 'tab_code': 'LAB4', 'tab_name': '재해복구센터4층',
     'tab_order': 4, 'route_key': 'dc_rack_lab4'},
    {'page_code': 'DC_RACK', 'tab_code': 'LIST', 'tab_name': 'RACK 관리',
     'tab_order': 5, 'route_key': 'dc_rack_list'},
    # ── 데이터센터 > 온/습도 관리 ─────────────
    {'page_code': 'DC_THERMOMETER', 'tab_code': 'LAB1', 'tab_name': '퓨처센터5층',
     'tab_order': 1, 'route_key': 'dc_thermo_lab1'},
    {'page_code': 'DC_THERMOMETER', 'tab_code': 'LAB2', 'tab_name': '퓨처센터6층',
     'tab_order': 2, 'route_key': 'dc_thermo_lab2'},
    {'page_code': 'DC_THERMOMETER', 'tab_code': 'LAB3', 'tab_name': '을지트윈타워15층',
     'tab_order': 3, 'route_key': 'dc_thermo_lab3'},
    {'page_code': 'DC_THERMOMETER', 'tab_code': 'LAB4', 'tab_name': '재해복구센터4층',
     'tab_order': 4, 'route_key': 'dc_thermo_lab4'},
    {'page_code': 'DC_THERMOMETER', 'tab_code': 'LIST', 'tab_name': '온/습도 관리',
     'tab_order': 5, 'route_key': 'dc_thermometer_list'},
    {'page_code': 'DC_THERMOMETER', 'tab_code': 'LOG', 'tab_name': '온/습도 로그',
     'tab_order': 6, 'route_key': 'dc_thermometer_log'},
    # ── 데이터센터 > CCTV 관리 ────────────────
    {'page_code': 'DC_CCTV', 'tab_code': 'LAB1', 'tab_name': '퓨처센터5층',
     'tab_order': 1, 'route_key': 'dc_cctv_lab1'},
    {'page_code': 'DC_CCTV', 'tab_code': 'LAB2', 'tab_name': '퓨처센터6층',
     'tab_order': 2, 'route_key': 'dc_cctv_lab2'},
    {'page_code': 'DC_CCTV', 'tab_code': 'LAB3', 'tab_name': '을지트윈타워15층',
     'tab_order': 3, 'route_key': 'dc_cctv_lab3'},
    {'page_code': 'DC_CCTV', 'tab_code': 'LAB4', 'tab_name': '재해복구센터4층',
     'tab_order': 4, 'route_key': 'dc_cctv_lab4'},
    {'page_code': 'DC_CCTV', 'tab_code': 'LIST', 'tab_name': 'CCTV 관리',
     'tab_order': 5, 'route_key': 'dc_cctv_list'},
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
                    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
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
    except Exception as e:
        db.session.rollback()
        logger.warning('page_tab_config init: %s', e)

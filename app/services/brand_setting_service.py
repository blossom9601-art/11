# -*- coding: utf-8 -*-
"""brand_setting 테이블 초기화 + CRUD 서비스."""

import logging
from datetime import datetime

from app.models import db

logger = logging.getLogger(__name__)

# ── 기본(시드) 데이터 ──────────────────────────────────────────
_SEED_ROWS = [
    # 헤더
    {'category': 'header', 'key': 'brand.headerIcon',
     'value': '/static/image/logo/blossom_logo.png', 'value_type': 'image'},
    {'category': 'header', 'key': 'brand.name',
     'value': 'blossom', 'value_type': 'text'},
    {'category': 'header', 'key': 'brand.subtitle',
     'value': '', 'value_type': 'text'},
    # 로그인 배경
    {'category': 'login', 'key': 'login.backgroundImage',
     'value': '/static/image/login/bada.png', 'value_type': 'image'},
    # 대시보드 카드 로고
    {'category': 'dashboard', 'key': 'dashboard.cardLogos.maintenance_cost_card',
     'value': '/static/image/logo/bccard_logo.jpg', 'value_type': 'image'},
]


# ── 테이블 생성 + 시드 ────────────────────────────────────────
def init_brand_setting_table(app):
    """brand_setting 테이블 생성 + 기본 시드 데이터 삽입."""
    try:
        with app.app_context():
            db.session.execute(db.text("""
                CREATE TABLE IF NOT EXISTS brand_setting (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    category    VARCHAR(64)  NOT NULL,
                    `key`       VARCHAR(128) NOT NULL UNIQUE,
                    value       TEXT,
                    value_type  VARCHAR(20)  NOT NULL DEFAULT 'text',
                    updated_by  VARCHAR(64),
                    created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at  TEXT,
                    is_deleted  INTEGER NOT NULL DEFAULT 0
                )
            """))
            db.session.execute(db.text(
                "CREATE INDEX IF NOT EXISTS ix_brand_setting_category ON brand_setting(category)"
            ))
            db.session.commit()

            cnt = db.session.execute(
                db.text("SELECT COUNT(*) FROM brand_setting WHERE is_deleted=0")
            ).scalar()
            if cnt == 0:
                for row in _SEED_ROWS:
                    db.session.execute(db.text("""
                        INSERT INTO brand_setting (category, `key`, value, value_type)
                        VALUES (:category, :key, :value, :value_type)
                    """), row)
                db.session.commit()
                print('[brand-setting] seeded', len(_SEED_ROWS), 'rows', flush=True)
    except Exception as e:
        db.session.rollback()
        logger.warning('brand_setting init: %s', e)


# ── 조회 ──────────────────────────────────────────────────────
def get_all_brand_settings():
    """삭제되지 않은 모든 브랜드 설정을 dict 리스트로 반환."""
    rows = db.session.execute(
        db.text("SELECT id, category, `key`, value, value_type, updated_by, updated_at "
                "FROM brand_setting WHERE is_deleted=0 ORDER BY category, id")
    ).fetchall()
    return [dict(r._mapping) for r in rows]


def get_brand_setting(key):
    """단일 키 조회. 없으면 None."""
    row = db.session.execute(
        db.text("SELECT id, category, `key`, value, value_type, updated_by, updated_at "
                "FROM brand_setting WHERE `key`=:k AND is_deleted=0"),
        {'k': key}
    ).fetchone()
    return dict(row._mapping) if row else None


def get_brand_settings_by_category(category):
    """카테고리별 조회."""
    rows = db.session.execute(
        db.text("SELECT id, category, `key`, value, value_type, updated_by, updated_at "
                "FROM brand_setting WHERE category=:c AND is_deleted=0 ORDER BY id"),
        {'c': category}
    ).fetchall()
    return [dict(r._mapping) for r in rows]


# ── 저장(upsert) ─────────────────────────────────────────────
def upsert_brand_setting(key, value, category='header', value_type='text', updated_by=None):
    """키가 있으면 업데이트, 없으면 삽입."""
    now = datetime.utcnow().isoformat()
    existing = db.session.execute(
        db.text("SELECT id FROM brand_setting WHERE `key`=:k"),
        {'k': key}
    ).fetchone()
    if existing:
        db.session.execute(db.text("""
            UPDATE brand_setting
               SET value=:v, value_type=:vt, category=:c,
                   updated_by=:u, updated_at=:now, is_deleted=0
             WHERE `key`=:k
        """), {'v': value, 'vt': value_type, 'c': category, 'u': updated_by, 'now': now, 'k': key})
    else:
        db.session.execute(db.text("""
            INSERT INTO brand_setting (category, `key`, value, value_type, updated_by, updated_at)
            VALUES (:c, :k, :v, :vt, :u, :now)
        """), {'c': category, 'k': key, 'v': value, 'vt': value_type, 'u': updated_by, 'now': now})
    db.session.commit()


# ── 삭제 (소프트) ─────────────────────────────────────────────
def delete_brand_setting(key, updated_by=None):
    """키를 소프트 삭제."""
    now = datetime.utcnow().isoformat()
    db.session.execute(db.text("""
        UPDATE brand_setting SET is_deleted=1, updated_by=:u, updated_at=:now WHERE `key`=:k
    """), {'u': updated_by, 'now': now, 'k': key})
    db.session.commit()


# ── 초기화 (기본값 복원) ──────────────────────────────────────
def reset_brand_settings(updated_by=None):
    """모든 브랜드 설정을 시드 기본값으로 복원."""
    now = datetime.utcnow().isoformat()
    # 전체 소프트 삭제
    db.session.execute(db.text(
        "UPDATE brand_setting SET is_deleted=1, updated_by=:u, updated_at=:now WHERE is_deleted=0"
    ), {'u': updated_by, 'now': now})
    # 시드 재삽입 (기존 행이 있으면 UPDATE, 없으면 INSERT)
    for row in _SEED_ROWS:
        existing = db.session.execute(db.text(
            "SELECT id FROM brand_setting WHERE `key`=:key"
        ), {'key': row['key']}).fetchone()
        if existing:
            db.session.execute(db.text("""
                UPDATE brand_setting
                SET category=:category, value=:value, value_type=:value_type,
                    is_deleted=0, updated_by=:u, updated_at=:now
                WHERE `key`=:key
            """), {**row, 'u': updated_by, 'now': now})
        else:
            db.session.execute(db.text("""
                INSERT INTO brand_setting (category, `key`, value, value_type, updated_by, updated_at)
                VALUES (:category, :key, :value, :value_type, :u, :now)
            """), {**row, 'u': updated_by, 'now': now})
    db.session.commit()


def reset_single_brand_setting(key, updated_by=None):
    """단일 키를 시드 기본값으로 복원. 시드에 없으면 소프트 삭제."""
    seed = next((r for r in _SEED_ROWS if r['key'] == key), None)
    if seed:
        upsert_brand_setting(key, seed['value'], seed['category'], seed['value_type'], updated_by)
    else:
        delete_brand_setting(key, updated_by)

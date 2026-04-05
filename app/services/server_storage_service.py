"""Server detail-page storage table persistence (sqlite3).

This backs the "tab10-storage" tables on server detail pages.

We intentionally store this in the same SQLite DB file as the other
instance-local data (typically instance/dev_blossom.db) by resolving the
path from SQLALCHEMY_DATABASE_URI, with an optional override.
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = "server_storage"

SERVER_STORAGE_TABLE_SQL = f"""
CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    hardware_id  INTEGER NOT NULL,
    type         TEXT NOT NULL DEFAULT '로컬',
    storage      TEXT,
    uuid         TEXT,
    p_capacity   TEXT,
    disk         TEXT,
    l_capacity   TEXT,
    mount        TEXT,
    stripe_size  TEXT,
    stripe_cnt   INTEGER,
    phys_disk    TEXT,
    disk_capacity TEXT,
    phys_qty     TEXT,
    raid         TEXT,
    vol_group    TEXT,
    vol_type     TEXT,
    remark       TEXT,
    volumes      TEXT,
    encrypted    TEXT,
    source_group_id   INTEGER,
    source_volume_id  INTEGER,
    created_at   TEXT NOT NULL,
    created_by   TEXT NOT NULL,
    updated_at   TEXT,
    updated_by   TEXT
);
CREATE INDEX IF NOT EXISTS idx_server_storage_hardware_id ON {TABLE_NAME}(hardware_id);
"""

_INITIALIZED_DBS: set[str] = set()


def _now() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    override = app.config.get("SERVER_STORAGE_SQLITE_PATH")
    if override:
        return os.path.abspath(override)

    uri = app.config.get("SQLALCHEMY_DATABASE_URI", "sqlite:///dev_blossom.db")
    if uri.startswith("sqlite"):
        parsed = urlparse(uri)
        path = parsed.path or ""
        netloc = parsed.netloc or ""
        if path in (":memory:", "/:memory:"):
            return os.path.join(app.instance_path, "dev_blossom.db")
        if netloc not in ("", "localhost"):
            path = f"//{netloc}{path}"

        # Windows: urlparse('sqlite:///dev_blossom.db').path -> '/dev_blossom.db'
        if os.name == "nt" and path.startswith("/") and not path.startswith("//"):
            # '/C:/...' -> 'C:/...'
            if len(path) >= 4 and path[1].isalpha() and path[2] == ":" and path[3] == "/":
                path = path[1:]

        if os.path.isabs(path):
            return os.path.abspath(path)

        relative = path.lstrip("/")
        instance_candidate = os.path.abspath(os.path.join(app.instance_path, relative))
        project_candidate = os.path.abspath(os.path.join(_project_root(app), relative))
        if os.path.exists(instance_candidate):
            return instance_candidate
        if os.path.exists(project_candidate):
            return project_candidate
        return instance_candidate

    return os.path.join(app.instance_path, "dev_blossom.db")


def _ensure_parent(path: str) -> None:
    folder = os.path.dirname(path)
    if folder and not os.path.exists(folder):
        os.makedirs(folder, exist_ok=True)


def _ensure_schema(conn: sqlite3.Connection, db_path: str) -> None:
    if db_path in _INITIALIZED_DBS:
        return
    conn.executescript(SERVER_STORAGE_TABLE_SQL)
    # Auto-migrate: add columns if missing on older DBs
    try:
        cols = [r[1] for r in conn.execute(f"PRAGMA table_info({TABLE_NAME})").fetchall()]
        if 'type' not in cols:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN type TEXT NOT NULL DEFAULT '로컬'")
        if 'source_group_id' not in cols:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN source_group_id INTEGER")
        if 'source_volume_id' not in cols:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN source_volume_id INTEGER")
        if 'vol_group' not in cols:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN vol_group TEXT")
        if 'phys_disk' not in cols:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN phys_disk TEXT")
        if 'phys_qty' not in cols:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN phys_qty TEXT")
        if 'raid' not in cols:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN raid TEXT")
        if 'disk_capacity' not in cols:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN disk_capacity TEXT")
        if 'volumes' not in cols:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN volumes TEXT")
        if 'encrypted' not in cols:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN encrypted TEXT")
        conn.commit()
    except Exception:
        pass
    # Create type index after migration ensures the column exists
    try:
        conn.execute(f"CREATE INDEX IF NOT EXISTS idx_server_storage_type ON {TABLE_NAME}(hardware_id, type)")
        conn.commit()
    except Exception:
        pass
    _INITIALIZED_DBS.add(db_path)


def init_server_storage_table(app=None) -> str:
    """Create server_storage table in the resolved SQLite DB."""
    app = app or current_app
    db_path = os.path.abspath(_resolve_db_path(app))
    _ensure_parent(db_path)
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        _ensure_schema(conn, db_path)
        conn.commit()
    return db_path


def _connect(app=None) -> sqlite3.Connection:
    app = app or current_app
    db_path = os.path.abspath(_resolve_db_path(app))
    _ensure_parent(db_path)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    _ensure_schema(conn, db_path)
    return conn


def list_server_storages(hardware_id: int, storage_type: Optional[str] = None) -> List[Dict[str, Any]]:
    with _connect() as conn:
        where = "hardware_id = ?"
        params: list = [hardware_id]
        if storage_type:
            where += " AND type = ?"
            params.append(storage_type)
        rows = conn.execute(
            f"""
            SELECT id, hardware_id, type, storage, uuid, p_capacity, disk, l_capacity, mount,
                   stripe_size, stripe_cnt, phys_disk, disk_capacity, phys_qty, raid, vol_group, vol_type, remark,
                   volumes, encrypted, source_group_id, source_volume_id,
                   created_at, created_by, updated_at, updated_by
              FROM {TABLE_NAME}
             WHERE {where}
             ORDER BY id ASC
            """,
            params,
        ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            # volumes JSON 파싱 + 레거시 폴백
            vols_raw = d.get("volumes")
            if vols_raw:
                try:
                    d["volumes"] = json.loads(vols_raw)
                except (json.JSONDecodeError, TypeError):
                    d["volumes"] = []
            if not d.get("volumes"):
                # 레거시: l_capacity/mount/vol_type/remark 에서 단일 볼륨 구성
                if d.get("l_capacity") or d.get("mount") or d.get("vol_type") or d.get("remark"):
                    d["volumes"] = [{"l_capacity": d.get("l_capacity") or "", "mount": d.get("mount") or "", "vol_type": d.get("vol_type") or "", "remark": d.get("remark") or ""}]
                else:
                    d["volumes"] = []
            result.append(d)
        return result


def get_server_storage(hardware_id: int, storage_id: int) -> Optional[Dict[str, Any]]:
    with _connect() as conn:
        row = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE hardware_id = ? AND id = ?",
            (hardware_id, storage_id),
        ).fetchone()
        if not row:
            return None
        d = dict(row)
        vols_raw = d.get("volumes")
        if vols_raw:
            try:
                d["volumes"] = json.loads(vols_raw)
            except (json.JSONDecodeError, TypeError):
                d["volumes"] = []
        if not d.get("volumes"):
            if d.get("l_capacity") or d.get("mount") or d.get("vol_type") or d.get("remark"):
                d["volumes"] = [{"l_capacity": d.get("l_capacity") or "", "mount": d.get("mount") or "", "vol_type": d.get("vol_type") or "", "remark": d.get("remark") or ""}]
            else:
                d["volumes"] = []
        return d


def create_server_storage(hardware_id: int, payload: Dict[str, Any], actor: str) -> Dict[str, Any]:
    storage_type = (payload.get("type") or "로컬").strip()
    if storage_type not in ("로컬", "외장"):
        storage_type = "로컬"

    storage = (payload.get("storage") or "").strip() or None
    uuid = (payload.get("uuid") or "").strip()
    disk = (payload.get("disk") or "").strip()
    l_capacity = (payload.get("l_capacity") or payload.get("lcap") or "").strip()

    # 로컬 타입은 disk 필수
    if storage_type == "로컬":
        if not disk:
            raise ValueError("디스크명은 필수입니다.")

    p_capacity = (payload.get("p_capacity") or "").strip() or None
    mount = (payload.get("mount") or "").strip() or None
    stripe_size = (payload.get("stripe_size") or "").strip() or None
    phys_disk = (payload.get("phys_disk") or "").strip() or None
    disk_capacity = (payload.get("disk_capacity") or "").strip() or None
    phys_qty = (payload.get("phys_qty") or "").strip() or None
    raid = (payload.get("raid") or "").strip() or None
    vol_group = (payload.get("vol_group") or "").strip() or None
    vol_type = (payload.get("vol_type") or "").strip() or None
    remark = (payload.get("remark") or "").strip() or None
    encrypted = (payload.get("encrypted") or "").strip() or None

    # volumes JSON 처리
    volumes_raw = payload.get("volumes")
    if isinstance(volumes_raw, list):
        volumes = json.dumps(volumes_raw, ensure_ascii=False) if volumes_raw else None
    elif isinstance(volumes_raw, str):
        volumes = volumes_raw.strip() or None
    else:
        volumes = None

    stripe_cnt = payload.get("stripe_cnt")
    if stripe_cnt is not None and str(stripe_cnt).strip() != "":
        try:
            stripe_cnt = int(stripe_cnt)
        except Exception:
            stripe_cnt = None
    else:
        stripe_cnt = None
    if stripe_cnt is not None and stripe_cnt < 0:
        raise ValueError("스트라이프 갯수는 0 이상이어야 합니다.")

    source_group_id = payload.get("source_group_id")
    source_volume_id = payload.get("source_volume_id")
    try:
        source_group_id = int(source_group_id) if source_group_id else None
    except (TypeError, ValueError):
        source_group_id = None
    try:
        source_volume_id = int(source_volume_id) if source_volume_id else None
    except (TypeError, ValueError):
        source_volume_id = None

    now = _now()

    with _connect() as conn:
        cur = conn.execute(
            f"""
            INSERT INTO {TABLE_NAME} (
                hardware_id, type, storage, uuid, p_capacity, disk, l_capacity, mount,
                stripe_size, stripe_cnt, phys_disk, disk_capacity, phys_qty, raid, vol_group, vol_type, remark,
                volumes, encrypted, source_group_id, source_volume_id,
                created_at, created_by, updated_at, updated_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                hardware_id,
                storage_type,
                storage,
                uuid,
                p_capacity,
                disk,
                l_capacity,
                mount,
                stripe_size,
                stripe_cnt,
                phys_disk,
                disk_capacity,
                phys_qty,
                raid,
                vol_group,
                vol_type,
                remark,
                volumes,
                encrypted,
                source_group_id,
                source_volume_id,
                now,
                actor,
                now,
                actor,
            ),
        )
        conn.commit()
        new_id = int(cur.lastrowid)

    item = get_server_storage(hardware_id, new_id)
    if not item:
        raise RuntimeError("생성된 항목을 다시 조회할 수 없습니다.")
    return item


def update_server_storage(
    hardware_id: int,
    storage_id: int,
    payload: Dict[str, Any],
    actor: str,
) -> Optional[Dict[str, Any]]:
    existing = get_server_storage(hardware_id, storage_id)
    if not existing:
        return None

    def _text(key: str) -> Optional[str]:
        if key not in payload:
            return existing.get(key)
        val = (payload.get(key) or "").strip()
        return val or None

    storage = _text("storage")

    uuid = (payload.get("uuid") if "uuid" in payload else existing.get("uuid") or "").strip()
    disk = (payload.get("disk") if "disk" in payload else existing.get("disk") or "").strip()
    l_capacity = (
        (payload.get("l_capacity") if "l_capacity" in payload else existing.get("l_capacity") or "").strip()
    )

    existing_type = existing.get("type") or "로컬"
    # 로컬 타입은 disk 필수
    if existing_type == "로컬":
        if not disk:
            raise ValueError("디스크명은 필수입니다.")

    p_capacity = _text("p_capacity")
    mount = _text("mount")
    stripe_size = _text("stripe_size")
    phys_disk = _text("phys_disk")
    disk_capacity = _text("disk_capacity")
    phys_qty = _text("phys_qty")
    raid = _text("raid")
    vol_group = _text("vol_group")
    vol_type = _text("vol_type")
    remark = _text("remark")
    encrypted = _text("encrypted")

    # volumes JSON 처리
    if "volumes" in payload:
        volumes_raw = payload.get("volumes")
        if isinstance(volumes_raw, list):
            volumes = json.dumps(volumes_raw, ensure_ascii=False) if volumes_raw else None
        elif isinstance(volumes_raw, str):
            volumes = volumes_raw.strip() or None
        else:
            volumes = None
    else:
        # existing["volumes"] is already parsed as a list; serialize back to JSON
        ex_vols = existing.get("volumes")
        if isinstance(ex_vols, list):
            volumes = json.dumps(ex_vols, ensure_ascii=False) if ex_vols else None
        else:
            volumes = ex_vols

    stripe_cnt = existing.get("stripe_cnt")
    if "stripe_cnt" in payload:
        raw = payload.get("stripe_cnt")
        if raw is None or str(raw).strip() == "":
            stripe_cnt = None
        else:
            try:
                stripe_cnt = int(raw)
            except Exception:
                stripe_cnt = None
    if stripe_cnt is not None and int(stripe_cnt) < 0:
        raise ValueError("스트라이프 갯수는 0 이상이어야 합니다.")

    now = _now()

    with _connect() as conn:
        conn.execute(
            f"""
            UPDATE {TABLE_NAME}
               SET storage = ?,
                   uuid = ?,
                   p_capacity = ?,
                   disk = ?,
                   l_capacity = ?,
                   mount = ?,
                   stripe_size = ?,
                   stripe_cnt = ?,
                   phys_disk = ?,
                   disk_capacity = ?,
                   phys_qty = ?,
                   raid = ?,
                   vol_group = ?,
                   vol_type = ?,
                   remark = ?,
                   volumes = ?,
                   encrypted = ?,
                   updated_at = ?,
                   updated_by = ?
             WHERE hardware_id = ? AND id = ?
            """,
            (
                storage,
                uuid,
                p_capacity,
                disk,
                l_capacity,
                mount,
                stripe_size,
                stripe_cnt,
                phys_disk,
                disk_capacity,
                phys_qty,
                raid,
                vol_group,
                vol_type,
                remark,
                volumes,
                encrypted,
                now,
                actor,
                hardware_id,
                storage_id,
            ),
        )
        conn.commit()

    return get_server_storage(hardware_id, storage_id)


def delete_server_storage(hardware_id: int, storage_id: int) -> int:
    with _connect() as conn:
        cur = conn.execute(
            f"DELETE FROM {TABLE_NAME} WHERE hardware_id = ? AND id = ?",
            (hardware_id, storage_id),
        )
        conn.commit()
        return int(cur.rowcount or 0)


# ── 외장 스토리지: tab32 할당정보 데이터 조회 ──────────────────────────

def fetch_external_storage_sources(hardware_id: int) -> List[Dict[str, Any]]:
    """현재 서버에 할당된 외장 스토리지 볼륨을 tab32 할당정보에서 조회.

    매칭 기준: tab32_assign_group_host.work_name == 현재 서버의 work_name
    반환: [{storage_name, group_name, volume_name, uuid, p_capacity, source_group_id, source_volume_id}, ...]
    """
    from app.services import hardware_asset_service
    from app.services.tab32_assign_group_service import (
        TABLE_GROUP as T32_GROUP,
        TABLE_HOST as T32_HOST,
        TABLE_VOLUME as T32_VOLUME,
    )

    # 1) 현재 서버의 work_name 조회
    with hardware_asset_service._get_connection() as ha_conn:
        srv_row = ha_conn.execute(
            f"SELECT work_name, system_name FROM {hardware_asset_service.TABLE_NAME} WHERE id = ? AND is_deleted = 0",
            (hardware_id,),
        ).fetchone()
        if not srv_row:
            return []
        server_work_name = (srv_row['work_name'] or '').strip()
        if not server_work_name:
            return []

    # 2) tab32 에서 해당 서버가 호스트로 등록된 그룹 & 볼륨 조회
    with _connect() as conn:
        # tab32 tables live in the same DB
        try:
            conn.execute(f"SELECT 1 FROM {T32_HOST} LIMIT 1")
        except Exception:
            return []

        sql = f"""
            SELECT
                g.id            AS group_id,
                g.scope_key     AS scope_key,
                g.asset_id      AS storage_asset_id,
                g.group_name    AS group_name,
                v.id            AS volume_id,
                v.volume_name   AS volume_name,
                v.uuid          AS uuid,
                v.capacity      AS capacity,
                v.thin_thick    AS thin_thick,
                v.assigned_date AS vol_remark
            FROM {T32_HOST} h
            JOIN {T32_GROUP} g ON g.id = h.group_id
            JOIN {T32_VOLUME} v ON v.group_id = g.id
            WHERE LOWER(TRIM(COALESCE(h.work_name, ''))) = LOWER(?)
            ORDER BY g.id ASC, v.id ASC
        """
        rows = conn.execute(sql, (server_work_name,)).fetchall()

    if not rows:
        return []

    # 3) 스토리지 장비 이름 조회 (asset_id → work_name)
    asset_ids = list({r['storage_asset_id'] for r in rows if r['storage_asset_id']})
    asset_name_map: Dict[int, str] = {}
    if asset_ids:
        with hardware_asset_service._get_connection() as ha_conn2:
            placeholders = ','.join(['?'] * len(asset_ids))
            name_rows = ha_conn2.execute(
                f"SELECT id, work_name FROM {hardware_asset_service.TABLE_NAME} WHERE id IN ({placeholders})",
                asset_ids,
            ).fetchall()
            for nr in name_rows:
                asset_name_map[nr['id']] = (nr['work_name'] or '').strip()

    items = []
    for r in rows:
        items.append({
            'storage_name': asset_name_map.get(r['storage_asset_id'], ''),
            'group_name': r['group_name'] or '',
            'volume_name': r['volume_name'] or '',
            'uuid': r['uuid'] or '',
            'p_capacity': r['capacity'] or '',
            'thin_thick': r['thin_thick'] or '',
            'vol_remark': r['vol_remark'] or '',
            'source_group_id': r['group_id'],
            'source_volume_id': r['volume_id'],
        })
    return items


def import_external_storages(hardware_id: int, actor: str) -> Dict[str, Any]:
    """tab32 할당정보에서 외장 스토리지를 가져와 server_storage에 저장.

    이미 동일 source_volume_id 로 등록된 항목은 건너뛴다.
    반환: {'imported': N, 'skipped': M, 'items': [...]}
    """
    sources = fetch_external_storage_sources(hardware_id)
    if not sources:
        return {'imported': 0, 'skipped': 0, 'items': []}

    # 기존 외장 레코드의 source_volume_id 집합
    existing = list_server_storages(hardware_id, storage_type='외장')
    existing_vol_ids = {r.get('source_volume_id') for r in existing if r.get('source_volume_id')}

    imported = 0
    skipped = 0
    new_items = []

    for src in sources:
        vol_id = src.get('source_volume_id')
        if vol_id and vol_id in existing_vol_ids:
            skipped += 1
            continue

        payload = {
            'type': '외장',
            'storage': src.get('storage_name') or src.get('group_name') or '',
            'uuid': src.get('uuid') or '',
            'p_capacity': src.get('p_capacity') or '',
            'disk': '',
            'l_capacity': '',
            'source_group_id': src.get('source_group_id'),
            'source_volume_id': vol_id,
        }
        item = create_server_storage(hardware_id, payload, actor)
        new_items.append(item)
        imported += 1

    return {'imported': imported, 'skipped': skipped, 'items': new_items}

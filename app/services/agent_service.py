"""에이전트 업로드 처리 서비스

에이전트가 수집한 JSON 파일을 파싱하여
hw_interface, asset_account, asset_package 테이블에 upsert 한다.
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

ACTOR = "agent"


def _now() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    uri = app.config.get("SQLALCHEMY_DATABASE_URI", "sqlite:///dev_blossom.db")
    if not uri.startswith("sqlite"):
        return os.path.join(app.instance_path, "dev_blossom.db")
    parsed = urlparse(uri)
    path = parsed.path or ""
    netloc = parsed.netloc or ""
    if path in (":memory:", "/:memory:"):
        return os.path.join(app.instance_path, "dev_blossom.db")
    if netloc and netloc not in ("", "localhost"):
        path = f"//{netloc}{path}"
    path = path.lstrip("/")
    if os.path.isabs(path):
        return path
    # Flask-SQLAlchemy resolves relative paths against instance_path
    return os.path.abspath(os.path.join(app.instance_path, path))


def _get_connection(app=None) -> sqlite3.Connection:
    app = app or current_app
    db_path = _resolve_db_path(app)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_tables(conn: sqlite3.Connection) -> None:
    """에이전트가 사용하는 테이블이 없으면 생성"""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS hw_interface (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scope_key TEXT NOT NULL,
            asset_id INTEGER NOT NULL,
            system_name TEXT,
            if_type TEXT,
            slot TEXT,
            port TEXT,
            iface TEXT,
            serial TEXT,
            assign_value TEXT,
            peer_system TEXT,
            peer_port TEXT,
            remark TEXT,
            created_at TEXT,
            created_by TEXT,
            updated_at TEXT,
            updated_by TEXT
        );
        CREATE TABLE IF NOT EXISTS asset_account (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            asset_scope TEXT NOT NULL,
            asset_id INTEGER NOT NULL,
            system_key TEXT NOT NULL DEFAULT '',
            status TEXT,
            account_type TEXT,
            account_name TEXT NOT NULL,
            uid INTEGER,
            group_name TEXT,
            gid INTEGER,
            admin TEXT,
            role TEXT,
            user_name TEXT,
            privilege_level TEXT,
            purpose TEXT,
            login_allowed INTEGER NOT NULL DEFAULT 0,
            su_allowed INTEGER NOT NULL DEFAULT 0,
            admin_allowed INTEGER NOT NULL DEFAULT 0,
            remark TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT,
            is_deleted INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS asset_package (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            asset_scope TEXT NOT NULL,
            asset_id INTEGER NOT NULL,
            package_name TEXT NOT NULL,
            version TEXT,
            release TEXT,
            vendor TEXT,
            installed TEXT,
            package_type TEXT,
            identifier TEXT,
            license TEXT,
            vulnerability TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT,
            is_deleted INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS agent_pending (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hostname TEXT NOT NULL,
            ip_address TEXT,
            os_type TEXT,
            os_version TEXT,
            payload TEXT NOT NULL,
            received_at TEXT NOT NULL,
            is_linked INTEGER NOT NULL DEFAULT 0,
            linked_asset_id INTEGER,
            linked_at TEXT
        );
    """)


def _extract_ip(payload: Dict[str, Any]) -> str:
    """페이로드의 interfaces에서 첫 번째 비-루프백 IPv4를 추출"""
    for iface in (payload.get("interfaces") or []):
        # ip_addresses 배열 (Windows collector)
        for addr in (iface.get("ip_addresses") or []):
            ip = (addr.get("ip_address") or "").strip()
            if ip and ip not in ("127.0.0.1", "::1", "0.0.0.0") and ":" not in ip:
                return ip
        # 단일 필드 (Linux collector / assign_value)
        ip = (iface.get("ip_address") or iface.get("assign_value") or "").strip()
        if ip and ip not in ("127.0.0.1", "::1", "0.0.0.0") and ":" not in ip:
            return ip
    return ""


def _find_asset_by_hostname(conn: sqlite3.Connection, hostname: str) -> Optional[Dict[str, Any]]:
    """system_name 또는 asset_name 으로 hardware asset 검색"""
    # 테이블명: hardware (정규) 또는 hardware_asset (레거시 뷰)
    for table in ("hardware", "hardware_asset"):
        try:
            # is_disposed 컬럼 존재 여부 확인
            cols = {r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}
            where = "is_deleted = 0"
            if "is_disposed" in cols:
                where += " AND is_disposed = 0"

            row = conn.execute(
                f"""
                SELECT id, asset_category, asset_type, system_name, asset_name
                FROM {table}
                WHERE {where}
                  AND (LOWER(TRIM(system_name)) = LOWER(?) OR LOWER(TRIM(asset_name)) = LOWER(?))
                ORDER BY id ASC
                LIMIT 1
                """,
                (hostname.strip(), hostname.strip()),
            ).fetchone()
            if row:
                return {
                    "id": row["id"],
                    "asset_category": row["asset_category"],
                    "asset_type": row["asset_type"],
                    "system_name": row["system_name"],
                    "asset_name": row["asset_name"],
                }
            return None
        except Exception:
            continue
    return None


def _scope_from_category(asset_category: str) -> str:
    """asset_category → scope 매핑"""
    mapping = {
        "서버": "onpremise",
        "클라우드": "cloud",
        "워크스테이션": "workstation",
        "네트워크": "network",
        "보안": "security",
    }
    return mapping.get(asset_category, "onpremise")


def _page_key_prefix(asset_category: str, asset_type: str) -> str:
    """(asset_category, asset_type) → 프론트엔드 페이지 키 prefix 매핑

    예: ('SERVER', 'ON_PREMISE') → 'hw_server_onpremise'
    """
    cat = (asset_category or "").upper()
    atype = (asset_type or "").upper()
    mapping = {
        # Server
        ("SERVER", "ON_PREMISE"): "hw_server_onpremise",
        ("SERVER", "CLOUD"): "hw_server_cloud",
        ("SERVER", "FRAME"): "hw_server_frame",
        ("SERVER", "WORKSTATION"): "hw_server_workstation",
        # Storage
        ("STORAGE", "STORAGE"): "hw_storage_san",
        ("STORAGE", "SAN"): "hw_storage_san",
        ("STORAGE", "BACKUP"): "hw_storage_backup",
        ("STORAGE", "PTL"): "hw_storage_ptl",
        # SAN
        ("SAN", "DIRECTOR"): "hw_san_director",
        ("SAN", "SAN_SWITCH"): "hw_san_sansw",
        # Network
        ("NETWORK", "L2"): "hw_network_l2",
        ("NETWORK", "L4"): "hw_network_l4",
        ("NETWORK", "L7"): "hw_network_l7",
        ("NETWORK", "AP"): "hw_network_ap",
        ("NETWORK", "DEDICATELINE"): "hw_network_dedicateline",
        # Security
        ("SECURITY", "FIREWALL"): "hw_security_firewall",
        ("SECURITY", "VPN"): "hw_security_vpn",
        ("SECURITY", "IDS"): "hw_security_ids",
        ("SECURITY", "IPS"): "hw_security_ips",
        ("SECURITY", "HSM"): "hw_security_hsm",
        ("SECURITY", "KMS"): "hw_security_kms",
        ("SECURITY", "WIPS"): "hw_security_wips",
        ("SECURITY", "ETC"): "hw_security_etc",
    }
    return mapping.get((cat, atype), f"hw_server_{atype.lower() or 'onpremise'}")


# ── 인터페이스 upsert ────────────────────────────────────

def _upsert_interfaces(
    conn: sqlite3.Connection,
    asset_id: int,
    scope_key: str,
    system_name: str,
    items: List[Dict[str, Any]],
) -> Dict[str, int]:
    """기존 인터페이스를 soft-delete 후 새로 삽입 (detail 포함)"""
    now = _now()
    stats = {"inserted": 0, "deleted": 0, "details_inserted": 0}

    # ── 1) 기존 에이전트 인터페이스 ID 수집 ──
    old_rows = conn.execute(
        "SELECT id, iface FROM hw_interface "
        "WHERE asset_id = ? AND scope_key = ? AND created_by = ?",
        (asset_id, scope_key, ACTOR),
    ).fetchall()
    old_ids = [r["id"] for r in old_rows]
    old_iface_map = {r["id"]: r["iface"] for r in old_rows}

    # ── 2) 기존 detail 에서 사용자 편집 데이터 보존 ──
    #   key = (iface_name, ip_address, protocol, port)
    #   value = {category, service_name, description, is_excluded}
    preserved_edits: Dict[tuple, Dict[str, Any]] = {}
    detail_table_exists = True
    if old_ids:
        placeholders = ",".join("?" * len(old_ids))
        try:
            detail_rows = conn.execute(
                f"SELECT * FROM hw_interface_detail WHERE interface_id IN ({placeholders})",
                old_ids,
            ).fetchall()
        except sqlite3.OperationalError:
            detail_rows = []
            detail_table_exists = False
        for dr in detail_rows:
            iface_name = old_iface_map.get(dr["interface_id"], "")
            key = (
                iface_name,
                dr["ip_address"] or "",
                dr["protocol"] or "",
                dr["port"] or "",
            )
            user_data = {}
            cat = dr["category"] or "Primary"
            if cat != "Primary":
                user_data["category"] = cat
            if dr["service_name"]:
                user_data["service_name"] = dr["service_name"]
            if dr["description"]:
                user_data["description"] = dr["description"]
            try:
                if dr["is_excluded"]:
                    user_data["is_excluded"] = 1
            except (IndexError, KeyError):
                pass
            if user_data:
                preserved_edits[key] = user_data

        # ── 3) 기존 detail 삭제 ──
        if detail_table_exists:
            try:
                conn.execute(
                    f"DELETE FROM hw_interface_detail WHERE interface_id IN ({placeholders})",
                    old_ids,
                )
            except sqlite3.OperationalError:
                detail_table_exists = False

    # ── 4) 기존 에이전트 인터페이스 삭제 ──
    cur = conn.execute(
        "DELETE FROM hw_interface WHERE asset_id = ? AND scope_key = ? AND created_by = ?",
        (asset_id, scope_key, ACTOR),
    )
    stats["deleted"] = cur.rowcount

    # ── 5) 새 인터페이스 + detail 삽입 ──
    for item in items:
        # assign_value: 명시적 값이 없으면 ip_addresses에서 첫 IPv4 추출
        assign_val = item.get("assign_value", "")
        if not assign_val:
            for addr in (item.get("ip_addresses") or []):
                ip = (addr.get("ip_address") or "").strip()
                if ip and ":" not in ip and ip not in ("127.0.0.1", "0.0.0.0"):
                    assign_val = ip
                    break

        cur = conn.execute(
            """
            INSERT INTO hw_interface (
                scope_key, asset_id, system_name,
                if_type, slot, port, iface, serial, assign_value,
                peer_system, peer_port, remark,
                created_at, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                scope_key,
                asset_id,
                system_name,
                item.get("if_type", ""),
                item.get("slot", ""),
                item.get("port", ""),
                item.get("iface", ""),
                item.get("serial", ""),
                assign_val,
                item.get("peer_system", ""),
                item.get("peer_port", ""),
                item.get("remark", ""),
                now,
                ACTOR,
            ),
        )
        new_iface_id = cur.lastrowid
        stats["inserted"] += 1

        # detail 삽입 (에이전트가 수집한 netstat/port 정보 또는 ip_addresses)
        iface_name = item.get("iface", "")
        details = item.get("details", [])
        # Windows agent: ip_addresses 배열을 details로 사용
        if not details:
            details = item.get("ip_addresses", [])
        if detail_table_exists and details:
            for det in details:
                ip_addr = det.get("ip_address", "")
                proto = det.get("protocol", "")
                d_port = det.get("port", "")

                # 이전 사용자 편집 데이터 복원
                edit_key = (iface_name, ip_addr, proto, d_port)
                saved = preserved_edits.get(edit_key, {})

                try:
                    conn.execute(
                        """
                        INSERT INTO hw_interface_detail (
                            interface_id, category, ip_address, protocol, port,
                            pid, service_name, process, status, description,
                            is_excluded, created_at, created_by
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            new_iface_id,
                            saved.get("category", det.get("category", "Primary")),
                            ip_addr,
                            proto,
                            d_port,
                            det.get("pid", ""),
                            saved.get("service_name", det.get("service_name", "")),
                            det.get("process", ""),
                            det.get("status", ""),
                            saved.get("description", det.get("description", "")),
                            saved.get("is_excluded", 0),
                            now,
                            ACTOR,
                        ),
                    )
                    stats["details_inserted"] += 1
                except sqlite3.OperationalError:
                    detail_table_exists = False
                    break

    return stats


# ── 계정 upsert ──────────────────────────────────────────

def _upsert_accounts(
    conn: sqlite3.Connection,
    asset_id: int,
    scope: str,
    items: List[Dict[str, Any]],
    system_key: str = "",
) -> Dict[str, int]:
    """account_name 기준 upsert (존재하면 업데이트, 없으면 삽입)"""
    now = _now()
    stats = {"inserted": 0, "updated": 0}

    for item in items:
        account_name = item.get("account_name", "")
        if not account_name:
            continue

        existing = conn.execute(
            "SELECT id FROM asset_account WHERE asset_scope = ? AND asset_id = ? "
            "AND account_name = ? AND is_deleted = 0",
            (scope, asset_id, account_name),
        ).fetchone()

        if existing:
            conn.execute(
                """
                UPDATE asset_account SET
                    status = ?, account_type = ?, uid = ?, group_name = ?, gid = ?,
                    login_allowed = ?, admin_allowed = ?, su_allowed = ?,
                    purpose = ?, remark = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    item.get("status", ""),
                    item.get("account_type", ""),
                    item.get("uid"),
                    item.get("group_name", ""),
                    item.get("gid"),
                    1 if item.get("login_allowed") else 0,
                    1 if item.get("admin_allowed") else 0,
                    1 if item.get("admin_allowed") else 0,
                    item.get("purpose", ""),
                    item.get("remark", ""),
                    now,
                    existing["id"],
                ),
            )
            stats["updated"] += 1
        else:
            conn.execute(
                """
                INSERT INTO asset_account (
                    asset_scope, asset_id, system_key,
                    status, account_type, account_name,
                    uid, group_name, gid, admin, role,
                    user_name, privilege_level, purpose,
                    login_allowed, su_allowed, admin_allowed,
                    remark, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    scope,
                    asset_id,
                    system_key,
                    item.get("status", ""),
                    item.get("account_type", ""),
                    account_name,
                    item.get("uid"),
                    item.get("group_name", ""),
                    item.get("gid"),
                    "",
                    "",
                    "",
                    "",
                    item.get("purpose", ""),
                    1 if item.get("login_allowed") else 0,
                    1 if item.get("admin_allowed") else 0,
                    1 if item.get("admin_allowed") else 0,
                    item.get("remark", ""),
                    now,
                ),
            )
            stats["inserted"] += 1

    return stats


# ── 패키지 upsert ────────────────────────────────────────

def _upsert_packages(
    conn: sqlite3.Connection,
    asset_id: int,
    scope: str,
    items: List[Dict[str, Any]],
) -> Dict[str, int]:
    """package_name + version 기준 upsert"""
    now = _now()
    stats = {"inserted": 0, "updated": 0}

    for item in items:
        pkg_name = item.get("package_name", "")
        version = item.get("version", "")
        if not pkg_name:
            continue

        # identifier 생성: type:name@version
        pkg_type = item.get("package_type", "")
        identifier = f"{pkg_type}:{pkg_name}@{version}" if pkg_type else f"{pkg_name}@{version}"

        existing = conn.execute(
            "SELECT id FROM asset_package WHERE asset_scope = ? AND asset_id = ? "
            "AND package_name = ? AND is_deleted = 0",
            (scope, asset_id, pkg_name),
        ).fetchone()

        if existing:
            conn.execute(
                """
                UPDATE asset_package SET
                    version = ?, package_type = ?, identifier = ?,
                    vendor = ?, installed = ?, license = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    version,
                    pkg_type,
                    identifier,
                    item.get("vendor", ""),
                    item.get("installed", ""),
                    item.get("license", ""),
                    now,
                    existing["id"],
                ),
            )
            stats["updated"] += 1
        else:
            conn.execute(
                """
                INSERT INTO asset_package (
                    asset_scope, asset_id,
                    package_name, version, package_type, identifier,
                    vendor, installed, license, vulnerability,
                    created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    scope,
                    asset_id,
                    pkg_name,
                    version,
                    pkg_type,
                    identifier,
                    item.get("vendor", ""),
                    item.get("installed", ""),
                    item.get("license", ""),
                    "",
                    now,
                ),
            )
            stats["inserted"] += 1

    return stats


# ── 메인 처리 함수 ────────────────────────────────────────

def process_agent_payload(payload: Dict[str, Any], *, app=None) -> Dict[str, Any]:
    """에이전트 JSON 페이로드를 처리하여 DB에 upsert

    Returns:
        {
            "success": True/False,
            "hostname": "...",
            "asset_id": N,
            "results": {
                "interfaces": {"inserted": N, "deleted": N},
                "accounts": {"inserted": N, "updated": N},
                "packages": {"inserted": N, "updated": N},
            },
            "error": "..."
        }
    """
    hostname = (payload.get("hostname") or "").strip()
    if not hostname:
        return {"success": False, "error": "hostname이 누락되었습니다."}

    app = app or current_app

    with _get_connection(app) as conn:
        _ensure_tables(conn)
        asset = _find_asset_by_hostname(conn, hostname)
        if not asset:
            # 미매칭 → agent_pending 에 upsert (같은 hostname은 최신으로 갱신)
            ip_addr = _extract_ip(payload)
            os_type = payload.get("os_type") or ""
            os_version = payload.get("os_version") or ""
            payload_json = json.dumps(payload, ensure_ascii=False)
            now = _now()

            # os_version 컬럼이 없는 기존 DB 대응
            try:
                conn.execute("SELECT os_version FROM agent_pending LIMIT 0")
            except sqlite3.OperationalError:
                try:
                    conn.execute("ALTER TABLE agent_pending ADD COLUMN os_version TEXT")
                except Exception:
                    pass

            existing = conn.execute(
                "SELECT id FROM agent_pending WHERE hostname = ? AND is_linked = 0",
                (hostname,),
            ).fetchone()
            if existing:
                conn.execute(
                    """UPDATE agent_pending
                       SET ip_address=?, os_type=?, os_version=?, payload=?, received_at=?
                       WHERE id=?""",
                    (ip_addr, os_type, os_version, payload_json, now, existing["id"]),
                )
            else:
                conn.execute(
                    """INSERT INTO agent_pending
                       (hostname, ip_address, os_type, os_version, payload, received_at)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (hostname, ip_addr, os_type, os_version, payload_json, now),
                )
            conn.commit()
            return {
                "success": True,
                "pending": True,
                "hostname": hostname,
                "message": f"hostname '{hostname}'에 해당하는 자산이 없어 대기열에 저장되었습니다.",
            }

        asset_id = asset["id"]
        scope = _scope_from_category(asset.get("asset_category", ""))
        page_prefix = _page_key_prefix(asset.get("asset_category", ""), asset.get("asset_type", ""))
        system_name = asset.get("system_name") or asset.get("asset_name") or hostname

        results = {}

        # 인터페이스
        ifaces = payload.get("interfaces", [])
        if ifaces:
            scope_key = f"{page_prefix}_if"
            results["interfaces"] = _upsert_interfaces(conn, asset_id, scope_key, system_name, ifaces)

        # 계정
        accounts = payload.get("accounts", [])
        if accounts:
            results["accounts"] = _upsert_accounts(conn, asset_id, scope, accounts, system_key=system_name)

        # 패키지
        packages = payload.get("packages", [])
        if packages:
            results["packages"] = _upsert_packages(conn, asset_id, scope, packages)

        conn.commit()

    return {
        "success": True,
        "hostname": hostname,
        "asset_id": asset_id,
        "results": results,
    }


# ── 에이전트 연동 상태 조회 ───────────────────────────────

def is_agent_synced(asset_id: int, *, app=None) -> bool:
    """해당 자산에 에이전트가 업로드한 레코드가 존재하면 True"""
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            for table in ("hw_interface", "asset_account", "asset_package"):
                try:
                    col_name = "created_by" if table == "hw_interface" else "created_at"
                    # hw_interface uses created_by='agent', others check by asset_id existence
                    if table == "hw_interface":
                        row = conn.execute(
                            "SELECT 1 FROM hw_interface WHERE asset_id = ? AND created_by = ? LIMIT 1",
                            (asset_id, ACTOR),
                        ).fetchone()
                    else:
                        scope_col = "asset_scope" if table != "hw_interface" else "scope_key"
                        row = conn.execute(
                            f"SELECT 1 FROM {table} WHERE asset_id = ? AND is_deleted = 0 LIMIT 1",
                            (asset_id,),
                        ).fetchone()
                    if row:
                        return True
                except Exception:
                    continue
    except Exception:
        pass
    return False


# ── 대기중 에이전트 목록 / 연동 ────────────────────────────

def get_pending_agents(*, app=None) -> List[Dict[str, Any]]:
    """아직 연동되지 않은 에이전트 대기 목록 반환"""
    app = app or current_app
    rows = []
    try:
        with _get_connection(app) as conn:
            _ensure_tables(conn)
            # os_version 컬럼이 없는 기존 DB 대응
            has_os_ver = False
            try:
                conn.execute("SELECT os_version FROM agent_pending LIMIT 0")
                has_os_ver = True
            except sqlite3.OperationalError:
                pass

            if has_os_ver:
                cur = conn.execute(
                    """SELECT id, hostname, ip_address, os_type, os_version, received_at
                       FROM agent_pending
                       WHERE is_linked = 0
                       ORDER BY received_at DESC"""
                )
            else:
                cur = conn.execute(
                    """SELECT id, hostname, ip_address, os_type, received_at
                       FROM agent_pending
                       WHERE is_linked = 0
                       ORDER BY received_at DESC"""
                )
            for r in cur.fetchall():
                rows.append({
                    "id": r["id"],
                    "hostname": r["hostname"],
                    "ip_address": r["ip_address"] or "",
                    "os_type": r["os_type"] or "",
                    "os_version": (r["os_version"] if has_os_ver else "") or "",
                    "received_at": r["received_at"],
                })
    except Exception:
        logger.exception("get_pending_agents 오류")
    return rows


def link_agent_to_asset(pending_id: int, asset_id: int, *, app=None) -> Dict[str, Any]:
    """대기중 에이전트를 특정 자산에 연동(링크)

    저장된 payload를 asset_id 기준으로 upsert 한 뒤 pending 레코드를 연동 완료 처리.
    """
    app = app or current_app

    with _get_connection(app) as conn:
        _ensure_tables(conn)

        pending = conn.execute(
            "SELECT * FROM agent_pending WHERE id = ? AND is_linked = 0",
            (pending_id,),
        ).fetchone()
        if not pending:
            return {"success": False, "error": "대기중 에이전트를 찾을 수 없습니다."}

        # 자산 존재 확인
        asset = None
        for table in ("hardware", "hardware_asset"):
            try:
                cols = {r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}
                where = "is_deleted = 0"
                if "is_disposed" in cols:
                    where += " AND is_disposed = 0"
                asset = conn.execute(
                    f"SELECT id, asset_category, asset_type, system_name, asset_name FROM {table} WHERE id = ? AND {where}",
                    (asset_id,),
                ).fetchone()
                if asset:
                    break
            except Exception:
                continue

        if not asset:
            return {"success": False, "error": "자산을 찾을 수 없습니다."}

        # payload 복원 후 upsert
        payload = json.loads(pending["payload"])
        scope = _scope_from_category(asset["asset_category"] or "")
        page_prefix = _page_key_prefix(asset["asset_category"] or "", asset["asset_type"] or "")
        system_name = asset["system_name"] or asset["asset_name"] or pending["hostname"]

        results = {}

        ifaces = payload.get("interfaces", [])
        if ifaces:
            scope_key = f"{page_prefix}_if"
            results["interfaces"] = _upsert_interfaces(conn, asset_id, scope_key, system_name, ifaces)

        accounts = payload.get("accounts", [])
        if accounts:
            results["accounts"] = _upsert_accounts(conn, asset_id, scope, accounts, system_key=system_name)

        packages = payload.get("packages", [])
        if packages:
            results["packages"] = _upsert_packages(conn, asset_id, scope, packages)

        # pending 연동 완료 처리
        conn.execute(
            "UPDATE agent_pending SET is_linked = 1, linked_asset_id = ?, linked_at = ? WHERE id = ?",
            (asset_id, _now(), pending_id),
        )
        conn.commit()

    return {
        "success": True,
        "hostname": pending["hostname"],
        "asset_id": asset_id,
        "results": results,
    }


def get_linked_agent(asset_id: int, *, app=None) -> Optional[Dict[str, Any]]:
    """자산에 연동된 에이전트 정보 반환. 없으면 None."""
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            _ensure_tables(conn)
            has_os_ver = False
            try:
                conn.execute("SELECT os_version FROM agent_pending LIMIT 0")
                has_os_ver = True
            except sqlite3.OperationalError:
                pass

            if has_os_ver:
                row = conn.execute(
                    """SELECT id, hostname, ip_address, os_type, os_version,
                              received_at, linked_at
                       FROM agent_pending
                       WHERE linked_asset_id = ? AND is_linked = 1
                       ORDER BY linked_at DESC LIMIT 1""",
                    (asset_id,),
                ).fetchone()
            else:
                row = conn.execute(
                    """SELECT id, hostname, ip_address, os_type,
                              received_at, linked_at
                       FROM agent_pending
                       WHERE linked_asset_id = ? AND is_linked = 1
                       ORDER BY linked_at DESC LIMIT 1""",
                    (asset_id,),
                ).fetchone()

            if not row:
                return None
            return {
                "id": row["id"],
                "hostname": row["hostname"],
                "ip_address": row["ip_address"] or "",
                "os_type": row["os_type"] or "",
                "os_version": (row["os_version"] if has_os_ver else "") or "",
                "received_at": row["received_at"],
                "linked_at": row["linked_at"],
            }
    except Exception:
        logger.exception("get_linked_agent 오류")
    return None


def unlink_agent(asset_id: int, *, app=None) -> Dict[str, Any]:
    """자산에서 에이전트 연동 해제. pending 레코드를 미연동 상태로 되돌린다."""
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            _ensure_tables(conn)
            row = conn.execute(
                "SELECT id, hostname FROM agent_pending WHERE linked_asset_id = ? AND is_linked = 1",
                (asset_id,),
            ).fetchone()
            if not row:
                return {"success": False, "error": "연동된 에이전트가 없습니다."}

            conn.execute(
                "UPDATE agent_pending SET is_linked = 0, linked_asset_id = NULL, linked_at = NULL WHERE id = ?",
                (row["id"],),
            )
            conn.commit()

        return {"success": True, "hostname": row["hostname"]}
    except Exception:
        logger.exception("unlink_agent 오류")
        return {"success": False, "error": "서버 내부 오류"}

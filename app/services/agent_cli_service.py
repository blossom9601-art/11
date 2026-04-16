"""에이전트 CLI 서비스 — lumina CLI API 백엔드 로직

CLI → REST API → 이 서비스 → SQLite DB
DB 직접 접근은 이 서비스 레이어에서만 수행한다.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from flask import current_app

from app.services.agent_service import (
    _get_connection,
    _ensure_tables,
)

logger = logging.getLogger(__name__)

_KST = timezone(timedelta(hours=9))

# ── 상태 판정 임계값 (초) ────────────────────────────────
ONLINE_THRESHOLD = 300       # 5분
STALE_THRESHOLD = 3600       # 1시간

# ── 민감 필드 (RBAC 마스킹 대상) ──────────────────────────
_SENSITIVE_FIELDS = {
    "mgmt_ip", "system_owner_display", "service_owner_display",
    "system_dept_code", "service_dept_code",
    "system_owner_emp_no", "service_owner_emp_no",
}

_SECTION_ALIASES = {
    "hw": "hardware",
    "hardware": "hardware",
    "if": "interface",
    "iface": "interface",
    "interface": "interface",
    "interfaces": "interface",
    "account": "account",
    "accounts": "account",
    "authority": "authority",
    "authorities": "authority",
    "firewalld": "firewalld",
    "firewall": "firewalld",
    "storage": "storage",
    "package": "package",
    "packages": "package",
}

_PAYLOAD_SECTION_KEYS = {
    "interface": "interfaces",
    "account": "accounts",
    "authority": "authorities",
    "firewalld": "firewalld",
    "storage": "storage",
    "package": "packages",
}


def _now() -> str:
    return datetime.now(_KST).strftime("%Y-%m-%d %H:%M:%S")


def normalize_agent_section(section: str) -> Optional[str]:
    if not section:
        return None
    return _SECTION_ALIASES.get(str(section).strip().lower())


def _load_agent_payload(raw_payload: Any) -> Dict[str, Any]:
    if not raw_payload:
        return {}
    if isinstance(raw_payload, dict):
        return raw_payload
    try:
        payload = json.loads(raw_payload)
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def _build_hardware_section(agent_row: Dict[str, Any], app=None) -> Dict[str, Any]:
    section = {
        "hostname": agent_row.get("hostname") or "",
        "fqdn": agent_row.get("fqdn") or "",
        "ip_address": agent_row.get("ip_address") or "",
        "os_type": agent_row.get("os_type") or "",
        "os_version": agent_row.get("os_version") or "",
        "linked_asset_id": agent_row.get("linked_asset_id") or "",
        "linked": bool(agent_row.get("is_linked")),
        "status": agent_row.get("status") or compute_agent_status(agent_row),
        "last_heartbeat": agent_row.get("last_heartbeat") or "",
    }

    inventory_result = get_agent_inventory(int(agent_row["id"]), app=app)
    inventory = (inventory_result or {}).get("inventory") or {}
    meta = inventory.get("meta") or {}
    business = inventory.get("business") or {}
    system = inventory.get("system") or {}

    section.update({
        "asset_name": meta.get("Name") or "",
        "asset_category": meta.get("Category") or "",
        "asset_type": meta.get("Type") or "",
        "asset_code": meta.get("Code") or "",
        "system_name": business.get("System Name") or "",
        "system_ip": business.get("System IP") or "",
        "mgmt_ip": business.get("Mgmt IP") or "",
        "manufacturer": system.get("Manufacturer") or "",
        "model": system.get("Model") or "",
        "serial_number": system.get("Serial Number") or "",
        "rack": system.get("Rack") or "",
        "slot": system.get("Slot") or "",
    })
    return section


# ── 스키마 마이그레이션 ──────────────────────────────────

def _ensure_cli_columns(conn: sqlite3.Connection) -> None:
    """CLI에 필요한 컬럼을 agent_pending 테이블에 추가 (이미 있으면 무시)"""
    migrations = [
        ("fqdn", "TEXT"),
        ("is_enabled", "INTEGER DEFAULT 1"),
        ("last_collect", "TEXT"),
        ("last_send", "TEXT"),
        ("queue_depth", "INTEGER DEFAULT 0"),
        ("error_count", "INTEGER DEFAULT 0"),
        ("error_message", "TEXT"),
        ("pending_command", "TEXT"),
    ]
    for col_name, col_type in migrations:
        try:
            conn.execute(
                f"ALTER TABLE agent_pending ADD COLUMN {col_name} {col_type}"
            )
        except Exception:
            pass

    # 감사 로그 테이블
    conn.execute("""
        CREATE TABLE IF NOT EXISTS cli_audit_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            emp_no      TEXT NOT NULL,
            role        TEXT,
            command     TEXT NOT NULL,
            target_id   INTEGER,
            ip_address  TEXT,
            detail      TEXT,
            created_at  TEXT NOT NULL
        )
    """)
    conn.commit()


def _init_conn(app=None) -> sqlite3.Connection:
    """DB 연결 + 스키마 보장"""
    conn = _get_connection(app)
    _ensure_tables(conn)
    _ensure_cli_columns(conn)
    return conn


# ── 상태 판정 ────────────────────────────────────────────

def compute_agent_status(row: Dict[str, Any]) -> str:
    """에이전트 상태를 서버 측에서 계산한다.

    Returns: 'online' | 'stale' | 'offline' | 'error' | 'disabled'
    """
    if not row.get("is_enabled", 1):
        return "disabled"
    if (row.get("error_count") or 0) >= 3:
        return "error"

    last_hb = row.get("last_heartbeat")
    if not last_hb:
        return "offline"
    try:
        hb_time = datetime.strptime(last_hb, "%Y-%m-%d %H:%M:%S")
        hb_time = hb_time.replace(tzinfo=_KST)
        diff = (datetime.now(_KST) - hb_time).total_seconds()
        if diff <= ONLINE_THRESHOLD:
            return "online"
        elif diff <= STALE_THRESHOLD:
            return "stale"
        return "offline"
    except (ValueError, TypeError):
        return "offline"


# ── 에이전트 조회 ────────────────────────────────────────

def list_all_agents(app=None) -> List[Dict[str, Any]]:
    """모든 에이전트 목록 조회"""
    conn = _init_conn(app)
    try:
        rows = conn.execute("""
            SELECT id, hostname, fqdn, ip_address, os_type, os_version,
                   last_heartbeat, is_linked, linked_asset_id, is_enabled,
                   error_count, received_at
            FROM agent_pending
            ORDER BY id ASC
        """).fetchall()
        result = []
        for row in rows:
            d = dict(row)
            d["status"] = compute_agent_status(d)
            d["linked"] = bool(d.get("is_linked"))
            result.append(d)
        return result
    finally:
        conn.close()


def get_agent_detail(agent_id: int, app=None) -> Optional[Dict[str, Any]]:
    """에이전트 상세 조회"""
    conn = _init_conn(app)
    try:
        row = conn.execute(
            "SELECT * FROM agent_pending WHERE id = ?", (agent_id,)
        ).fetchone()
        if not row:
            return None
        d = dict(row)
        d["status"] = compute_agent_status(d)
        d["linked"] = bool(d.get("is_linked"))
        return d
    finally:
        conn.close()


def get_agent_section(agent_id: int, section: str, app=None) -> Optional[Dict[str, Any]]:
    """에이전트 상세의 섹션별 조회"""
    normalized = normalize_agent_section(section)
    if not normalized:
        return None

    agent = get_agent_detail(agent_id, app=app)
    if not agent:
        return None

    payload = _load_agent_payload(agent.get("payload"))
    result: Dict[str, Any] = {
        "agent": {
            "id": agent.get("id"),
            "hostname": agent.get("hostname"),
            "ip_address": agent.get("ip_address"),
            "os_type": agent.get("os_type"),
            "status": agent.get("status"),
            "linked_asset_id": agent.get("linked_asset_id"),
        },
        "section": normalized,
        "available_sections": [
            "hardware",
            "interface",
            "account",
            "authority",
            "firewalld",
            "storage",
            "package",
        ],
    }

    if normalized == "hardware":
        result["item"] = _build_hardware_section(agent, app=app)
        result["total"] = 1
        return result

    payload_key = _PAYLOAD_SECTION_KEYS.get(normalized)
    if payload_key:
        rows = payload.get(payload_key)
        if not isinstance(rows, list):
            rows = []
        result["rows"] = rows
        result["total"] = len(rows)
        return result

    # 향후 collector 확장을 위한 빈 섹션 응답
    result["rows"] = []
    result["total"] = 0
    result["message"] = "수집된 데이터가 없습니다."
    return result


def get_agent_status(agent_id: int, app=None) -> Optional[Dict[str, Any]]:
    """에이전트 상태 요약 조회"""
    conn = _init_conn(app)
    try:
        row = conn.execute("""
            SELECT id, hostname, ip_address, last_heartbeat,
                   is_linked, linked_asset_id, is_enabled,
                   error_count, error_message
            FROM agent_pending WHERE id = ?
        """, (agent_id,)).fetchone()
        if not row:
            return None
        d = dict(row)
        d["status"] = compute_agent_status(d)
        return d
    finally:
        conn.close()


def get_agent_health(agent_id: int, app=None) -> Optional[Dict[str, Any]]:
    """에이전트 헬스체크 상세"""
    conn = _init_conn(app)
    try:
        row = conn.execute("""
            SELECT id, hostname, last_heartbeat, last_collect, last_send,
                   queue_depth, error_count, error_message, is_enabled
            FROM agent_pending WHERE id = ?
        """, (agent_id,)).fetchone()
        if not row:
            return None
        d = dict(row)
        d["status"] = compute_agent_status(d)
        return d
    finally:
        conn.close()


def get_agent_inventory(agent_id: int, app=None) -> Optional[Dict[str, Any]]:
    """에이전트에 연동된 자산의 상세 인벤토리 조회"""
    conn = _init_conn(app)
    try:
        agent = conn.execute(
            "SELECT id, hostname, is_linked, linked_asset_id "
            "FROM agent_pending WHERE id = ?",
            (agent_id,),
        ).fetchone()
        if not agent:
            return None

        d = dict(agent)
        if not d.get("is_linked") or not d.get("linked_asset_id"):
            return {"agent": d, "inventory": None, "message": "No linked asset."}

        asset_id = d["linked_asset_id"]

        # hardware 테이블에서 자산 상세 조회
        hw = conn.execute(
            "SELECT * FROM hardware WHERE id = ? AND is_deleted = 0",
            (asset_id,),
        ).fetchone()
        # fallback: legacy view
        if not hw:
            try:
                hw = conn.execute(
                    "SELECT * FROM hardware_asset WHERE id = ? AND is_deleted = 0",
                    (asset_id,),
                ).fetchone()
            except Exception:
                pass

        if not hw:
            return {"agent": d, "inventory": None, "message": "Linked asset not found."}

        hw_dict = dict(hw)

        inventory = {
            "business": {
                "Work Status": hw_dict.get("work_status_code", ""),
                "Work Category": hw_dict.get("work_category_code", ""),
                "Work Division": hw_dict.get("work_division_code", ""),
                "Work Operation": hw_dict.get("work_operation_code", ""),
                "Work Group": hw_dict.get("work_group_code", ""),
                "Work Name": hw_dict.get("work_name", ""),
                "System Name": hw_dict.get("system_name", ""),
                "System IP": hw_dict.get("system_ip", ""),
                "Mgmt IP": hw_dict.get("mgmt_ip", ""),
            },
            "system": {
                "Manufacturer": hw_dict.get("manufacturer_code", ""),
                "Model": hw_dict.get("server_code", ""),
                "Serial Number": hw_dict.get("serial_number", ""),
                "Virtualization": hw_dict.get("virtualization_type", ""),
                "Center": hw_dict.get("center_code", ""),
                "Rack": hw_dict.get("rack_code", ""),
                "Slot": hw_dict.get("system_slot", ""),
                "Size": hw_dict.get("system_size", ""),
                "Rack Face": hw_dict.get("rack_face", ""),
            },
            "owner": {
                "System Dept": hw_dict.get("system_dept_code", ""),
                "System Owner": hw_dict.get("system_owner_display", ""),
                "Service Dept": hw_dict.get("service_dept_code", ""),
                "Service Owner": hw_dict.get("service_owner_display", ""),
            },
            "inspection": {
                "Confidentiality": hw_dict.get("cia_confidentiality", ""),
                "Integrity": hw_dict.get("cia_integrity", ""),
                "Availability": hw_dict.get("cia_availability", ""),
                "Security Score": hw_dict.get("security_score", ""),
                "System Grade": hw_dict.get("system_grade", ""),
                "Core System": "Yes" if hw_dict.get("is_core_system") else "No",
                "DR Site": "Yes" if hw_dict.get("has_dr_site") else "No",
                "Service HA": "Yes" if hw_dict.get("has_service_ha") else "No",
            },
            "meta": {
                "Asset ID": hw_dict.get("id"),
                "Category": hw_dict.get("asset_category", ""),
                "Type": hw_dict.get("asset_type", ""),
                "Code": hw_dict.get("asset_code", ""),
                "Name": hw_dict.get("asset_name", ""),
            },
        }
        return {"agent": d, "inventory": inventory}
    finally:
        conn.close()


def search_agents(
    hostname: Optional[str] = None,
    ip: Optional[str] = None,
    app=None,
) -> List[Dict[str, Any]]:
    """호스트네임 또는 IP로 에이전트 검색"""
    conn = _init_conn(app)
    try:
        conditions = []
        params = []
        if hostname:
            conditions.append("LOWER(hostname) LIKE LOWER(?)")
            params.append(f"%{hostname}%")
        if ip:
            conditions.append("ip_address LIKE ?")
            params.append(f"%{ip}%")
        if not conditions:
            return []

        where = " OR ".join(conditions)
        rows = conn.execute(
            f"""
            SELECT id, hostname, fqdn, ip_address, os_type, os_version,
                   last_heartbeat, is_linked, linked_asset_id, is_enabled,
                   error_count, received_at
            FROM agent_pending
            WHERE {where}
            ORDER BY id ASC
            """,
            params,
        ).fetchall()

        result = []
        for row in rows:
            d = dict(row)
            d["status"] = compute_agent_status(d)
            d["linked"] = bool(d.get("is_linked"))
            result.append(d)
        return result
    finally:
        conn.close()


# ── 관리 명령 ────────────────────────────────────────────

def enable_agent(agent_id: int, app=None) -> bool:
    conn = _init_conn(app)
    try:
        cur = conn.execute(
            "UPDATE agent_pending SET is_enabled = 1 WHERE id = ?",
            (agent_id,),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def disable_agent(agent_id: int, app=None) -> bool:
    conn = _init_conn(app)
    try:
        cur = conn.execute(
            "UPDATE agent_pending SET is_enabled = 0 WHERE id = ?",
            (agent_id,),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def set_pending_command(agent_id: int, command: str, app=None) -> bool:
    """에이전트에 대기 명령 설정 (resend / collect)"""
    if command not in ("resend", "collect"):
        return False
    conn = _init_conn(app)
    try:
        cur = conn.execute(
            "UPDATE agent_pending SET pending_command = ? WHERE id = ?",
            (command, agent_id),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def get_pending_commands(hostname: str, app=None) -> List[str]:
    """heartbeat 시 해당 에이전트의 대기 명령을 반환하고 소비한다."""
    conn = _init_conn(app)
    try:
        rows = conn.execute(
            "SELECT id, pending_command FROM agent_pending "
            "WHERE LOWER(hostname) = LOWER(?) AND pending_command IS NOT NULL "
            "AND pending_command != ''",
            (hostname.strip(),),
        ).fetchall()
        commands = []
        for row in rows:
            if row["pending_command"]:
                commands.append(row["pending_command"])
                conn.execute(
                    "UPDATE agent_pending SET pending_command = NULL WHERE id = ?",
                    (row["id"],),
                )
        conn.commit()
        return commands
    finally:
        conn.close()


# ── RBAC 마스킹 ──────────────────────────────────────────

def mask_sensitive_data(
    data: Dict[str, Any], role: str
) -> Dict[str, Any]:
    """역할에 따라 민감 필드를 마스킹한다.

    admin  → 마스킹 없음
    user   → 마스킹 없음 (operator 수준)
    auditor → 민감 필드 마스킹
    """
    if role.lower() in ("admin", "user"):
        return data
    masked = dict(data)
    for key in _SENSITIVE_FIELDS:
        if key in masked and masked[key]:
            val = str(masked[key])
            if len(val) > 4:
                masked[key] = val[:2] + "*" * (len(val) - 2)
            else:
                masked[key] = "****"
    # inventory 하위 딕셔너리 마스킹
    if "inventory" in masked and isinstance(masked["inventory"], dict):
        for section_key, section in masked["inventory"].items():
            if isinstance(section, dict):
                for field_label, field_val in section.items():
                    # 한국어 라벨 → 영문 키 매핑
                    if field_label in ("관리 IP", "시스템 담당부서", "시스템 담당자",
                                       "서비스 담당부서", "서비스 담당자"):
                        if field_val:
                            v = str(field_val)
                            section[field_label] = v[:2] + "*" * max(len(v) - 2, 2)
    return masked


# ── 감사 로그 ────────────────────────────────────────────

def create_audit_log(
    emp_no: str,
    role: str,
    command: str,
    target_id: Optional[int] = None,
    ip_address: Optional[str] = None,
    detail: Optional[str] = None,
    app=None,
) -> None:
    """CLI 감사 로그 기록"""
    conn = _init_conn(app)
    try:
        conn.execute(
            """
            INSERT INTO cli_audit_log
                (emp_no, role, command, target_id, ip_address, detail, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (emp_no, role, command, target_id, ip_address, detail, _now()),
        )
        conn.commit()
    except Exception:
        logger.exception("감사 로그 기록 실패")
    finally:
        conn.close()

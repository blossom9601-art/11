"""Initialize hardware_asset SQLite database with schema and seed data."""

from __future__ import annotations

import logging
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

ROOT_DIR = Path(__file__).resolve().parent.parent
SCHEMA_FILE = ROOT_DIR / "scripts" / "sql" / "hardware_asset_schema.sql"
DB_PATH = ROOT_DIR / "instance" / "hardware_asset.db"
SERVICE_USER = "system_seed"

META_COLUMNS = ("created_at", "created_by", "updated_at", "updated_by", "is_deleted")

REFERENCE_SEED: Dict[str, List[Dict[str, object]]] = {
    "biz_work_category": [
        {"category_code": "CAT_CORE", "category_name": "핵심 업무"},
        {"category_code": "CAT_SUPPORT", "category_name": "지원 업무"},
    ],
    "biz_work_division": [
        {"division_code": "DIV_B2C", "division_name": "B2C"},
        {"division_code": "DIV_B2B", "division_name": "B2B"},
    ],
    "biz_work_status": [
        {"status_code": "STAT_RUN", "status_name": "운영"},
        {"status_code": "STAT_DEV", "status_name": "개발"},
    ],
    "biz_work_operation": [
        {"operation_code": "OP_INHOUSE", "operation_name": "내부 운영"},
        {"operation_code": "OP_OUTSOURCED", "operation_name": "외부 위탁"},
    ],
    "biz_work_group": [
        {"group_code": "GRP_FIN", "group_name": "금융 시스템"},
        {"group_code": "GRP_COMM", "group_name": "커뮤니케이션"},
    ],
    "biz_vendor_manufacturer": [
        {"manufacturer_code": "VEN_HPE", "manufacturer_name": "HPE"},
        {"manufacturer_code": "VEN_DELL", "manufacturer_name": "Dell"},
    ],
    "hw_server_type": [
        {"server_code": "SRV_DL360", "model_name": "ProLiant DL360 Gen10"},
        {"server_code": "SRV_R750", "model_name": "PowerEdge R750"},
    ],
    "org_center": [
        {"center_code": "CTR_MAIN", "center_name": "본사 데이터센터"},
        {"center_code": "CTR_DR", "center_name": "DR 센터"},
    ],
    "org_rack": [
        {
            "rack_code": "RACK_MAIN_A01",
            "business_status_code": "STAT_RUN",
            "business_name": "본사 핵심 시스템",
            "manufacturer_code": "VEN_HPE",
            "system_model_code": "SRV_DL360",
            "serial_number": "SN-MAIN-A01",
            "center_code": "CTR_MAIN",
            "rack_position": "MAIN-A01",
            "system_height_u": 4,
            "system_dept_code": "DEPT_INFRA",
            "system_manager_id": 1001,
            "service_dept_code": "DEPT_DEV",
            "service_manager_id": 2001,
            "remark": "seed",
        },
        {
            "rack_code": "RACK_DR_B02",
            "business_status_code": "STAT_RUN",
            "business_name": "DR 백업 시스템",
            "manufacturer_code": "VEN_DELL",
            "system_model_code": "SRV_R750",
            "serial_number": "SN-DR-B02",
            "center_code": "CTR_DR",
            "rack_position": "DR-B02",
            "system_height_u": 6,
            "system_dept_code": "DEPT_INFRA",
            "system_manager_id": 1002,
            "service_dept_code": "DEPT_DEV",
            "service_manager_id": 2002,
            "remark": "seed",
        },
    ],
    "org_department": [
        {"dept_code": "DEPT_INFRA", "dept_name": "인프라팀"},
        {"dept_code": "DEPT_DEV", "dept_name": "개발실"},
    ],
    '"user"': [
        {"emp_no": "2024001", "name": "홍길동", "email": "hong@example.com", "role": "admin"},
        {"emp_no": "2024002", "name": "김블룸", "email": "bloom@example.com", "role": "operator"},
    ],
}

ASSET_SEED = [
    {
        "asset_category": "SERVER",
        "asset_type": "ON_PREMISE",
        "asset_code": "SRV-ONP-0001",
        "asset_name": "전사미들웨어-1",
        "work_category_code": "CAT_CORE",
        "work_division_code": "DIV_B2C",
        "work_status_code": "STAT_RUN",
        "work_operation_code": "OP_INHOUSE",
        "work_group_code": "GRP_FIN",
        "work_name": "전사 미들웨어",
        "system_name": "MW-SERVER-01",
        "system_ip": "10.0.0.10",
        "mgmt_ip": "10.0.0.110",
        "manufacturer_code": "VEN_HPE",
        "server_code": "SRV_DL360",
        "center_code": "CTR_MAIN",
        "rack_code": "RACK_MAIN_A01",
        "system_dept_code": "DEPT_INFRA",
        "system_owner_emp_no": "2024001",
        "service_dept_code": "DEPT_DEV",
        "service_owner_emp_no": "2024002",
        "virtualization_type": "Physical",
        "cia_confidentiality": 3,
        "cia_integrity": 3,
        "cia_availability": 2,
        "security_score": 8,
        "system_grade": "1등급",
        "is_core_system": 1,
        "has_dr_site": 1,
        "has_service_ha": 1,
        "service_ha_type": "Active-Standby",
    }
]


def utc_now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds")


def ensure_schema(conn: sqlite3.Connection) -> None:
    logging.info("Applying schema from %s", SCHEMA_FILE)
    with SCHEMA_FILE.open("r", encoding="utf-8") as fh:
        conn.executescript(fh.read())


def seed_reference_tables(conn: sqlite3.Connection) -> None:
    now = utc_now()
    for table, rows in REFERENCE_SEED.items():
        if not rows:
            continue
        payloads = []
        for row in rows:
            record = dict(row)
            record.setdefault("created_at", now)
            record.setdefault("created_by", SERVICE_USER)
            record.setdefault("updated_at", None)
            record.setdefault("updated_by", None)
            record.setdefault("is_deleted", 0)
            payloads.append(record)
        columns = list(payloads[0].keys())
        placeholders = ", ".join(["?"] * len(columns))
        sql = f"INSERT OR IGNORE INTO {table} ({', '.join(columns)}) VALUES ({placeholders})"
        conn.executemany(sql, [tuple(p[col] for col in columns) for p in payloads])
        logging.info("Seeded %s (%d rows)", table, len(payloads))


def seed_assets(conn: sqlite3.Connection) -> None:
    if not ASSET_SEED:
        return
    now = utc_now()
    rows = []
    for data in ASSET_SEED:
        record = dict(data)
        record.setdefault("created_at", now)
        record.setdefault("created_by", SERVICE_USER)
        record.setdefault("updated_at", None)
        record.setdefault("updated_by", None)
        record.setdefault("is_deleted", 0)
        rows.append(record)
    columns = list(rows[0].keys())
    placeholders = ", ".join(["?"] * len(columns))
    sql = f"""
        INSERT OR IGNORE INTO hardware_asset ({', '.join(columns)})
        VALUES ({placeholders})
    """
    conn.executemany(sql, [tuple(r[col] for col in columns) for r in rows])
    logging.info("Seeded hardware_asset (%d rows)", len(rows))


def main() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    logging.info("Using database file %s", DB_PATH)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("PRAGMA foreign_keys = ON;")
        ensure_schema(conn)
        conn.execute("BEGIN")
        try:
            seed_reference_tables(conn)
            seed_assets(conn)
        except Exception:
            conn.rollback()
            logging.exception("Failed to seed database")
            raise
        else:
            conn.commit()
            logging.info("hardware_asset seed complete")


if __name__ == "__main__":
    main()

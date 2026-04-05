"""Seed demo VPN policy rows per scope (VPN1~VPN5).

Idempotent: re-running won't create duplicates.

Creates:
- One partner + one line(+one device) per scope (VPN1~VPN5)

This is meant for local/dev UI verification of tab-scoped data.
"""

from __future__ import annotations

from datetime import datetime
import os
import sys

# Ensure repo root is on sys.path when running as a script
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from app import create_app
from app.models import db, OrgDepartment, UserProfile, NetVpnPartner, NetVpnLine, NetVpnLineDevice


def _get_or_create_demo_user() -> int:
    user = UserProfile.query.order_by(UserProfile.id.asc()).first()
    if user:
        return int(user.id)

    dept = OrgDepartment.query.filter_by(dept_code="DEMO").first()
    if not dept:
        dept = OrgDepartment(dept_code="DEMO", dept_name="DEMO", created_by="seed")
        db.session.add(dept)
        db.session.flush()

    user = UserProfile(emp_no="DEMO001", name="Demo User", department_id=dept.id, department=dept.dept_name)
    db.session.add(user)
    db.session.flush()
    return int(user.id)


def _get_or_create_partner(org_name: str, created_by_user_id: int) -> NetVpnPartner:
    p = NetVpnPartner.query.filter(
        NetVpnPartner.org_name == org_name,
        (NetVpnPartner.is_deleted == 0) | (NetVpnPartner.is_deleted.is_(None)),
    ).first()
    if p:
        return p

    p = NetVpnPartner(
        partner_type="DEFAULT",
        org_name=org_name,
        note="demo partner",
        created_by_user_id=created_by_user_id,
        updated_by_user_id=created_by_user_id,
        updated_at=datetime.utcnow(),
        is_deleted=0,
    )
    db.session.add(p)
    db.session.flush()
    return p


def _get_or_create_line(partner_id: int, scope: str, created_by_user_id: int, **fields) -> NetVpnLine:
    # Idempotency key: partner_id + scope + upper/lower + speed + protocol
    q = NetVpnLine.query.filter(
        NetVpnLine.vpn_partner_id == partner_id,
        NetVpnLine.scope == scope,
        (NetVpnLine.is_deleted == 0) | (NetVpnLine.is_deleted.is_(None)),
    )
    if fields.get("upper_country"):
        q = q.filter(NetVpnLine.upper_country == fields.get("upper_country"))
    if fields.get("lower_country"):
        q = q.filter(NetVpnLine.lower_country == fields.get("lower_country"))
    existing = q.first()
    if existing:
        return existing

    line = NetVpnLine(
        vpn_partner_id=partner_id,
        scope=scope,
        status=fields.get("status"),
        line_speed=fields.get("line_speed"),
        line_count=fields.get("line_count"),
        protocol=fields.get("protocol"),
        manager=fields.get("manager"),
        cipher=fields.get("cipher"),
        upper_country=fields.get("upper_country"),
        upper_country_address=fields.get("upper_country_address"),
        lower_country=fields.get("lower_country"),
        lower_country_address=fields.get("lower_country_address"),
        note=fields.get("note"),
        created_by_user_id=created_by_user_id,
        updated_by_user_id=created_by_user_id,
        updated_at=datetime.utcnow(),
        is_deleted=0,
    )
    db.session.add(line)
    db.session.flush()
    return line


def _get_or_create_device(line_id: int, device_name: str, created_by_user_id: int) -> NetVpnLineDevice:
    d = NetVpnLineDevice.query.filter(
        NetVpnLineDevice.vpn_line_id == line_id,
        NetVpnLineDevice.device_name == device_name,
        (NetVpnLineDevice.is_deleted == 0) | (NetVpnLineDevice.is_deleted.is_(None)),
    ).first()
    if d:
        return d

    d = NetVpnLineDevice(
        vpn_line_id=line_id,
        device_name=device_name,
        note="demo device",
        created_by_user_id=created_by_user_id,
        updated_by_user_id=created_by_user_id,
        updated_at=datetime.utcnow(),
        is_deleted=0,
    )
    db.session.add(d)
    db.session.flush()
    return d


def main() -> None:
    app = create_app()
    with app.app_context():
        user_id = _get_or_create_demo_user()

        specs = [
            {
                "scope": "VPN1",
                "org_name": "샘플기관-VPN1",
                "device_name": "FW-DEMO-1",
                "fields": {
                    "status": "운용",
                    "line_speed": "100M",
                    "line_count": 1,
                    "protocol": "TCP",
                    "manager": "운영팀",
                    "cipher": "AES-256",
                    "upper_country": "서울본사",
                    "upper_country_address": "서울특별시",
                    "lower_country": "판교지사",
                    "lower_country_address": "경기도",
                    "note": "VPN1 demo",
                },
            },
            {
                "scope": "VPN2",
                "org_name": "샘플기관-VPN2",
                "device_name": "FW-DEMO-2",
                "fields": {
                    "status": "운용",
                    "line_speed": "1G",
                    "line_count": 2,
                    "protocol": "UDP",
                    "manager": "네트워크팀",
                    "cipher": "CHACHA20",
                    "upper_country": "부산DC",
                    "upper_country_address": "부산광역시",
                    "lower_country": "광주센터",
                    "lower_country_address": "광주광역시",
                    "note": "VPN2 demo",
                },
            },
            {
                "scope": "VPN3",
                "org_name": "샘플기관-VPN3",
                "device_name": "FW-DEMO-3",
                "fields": {
                    "status": "운용",
                    "line_speed": "500M",
                    "line_count": 1,
                    "protocol": "TCP",
                    "manager": "보안팀",
                    "cipher": "AES-128",
                    "upper_country": "대전센터",
                    "upper_country_address": "대전광역시",
                    "lower_country": "세종센터",
                    "lower_country_address": "세종특별자치시",
                    "note": "VPN3 demo",
                },
            },
            {
                "scope": "VPN4",
                "org_name": "샘플기관-VPN4",
                "device_name": "FW-DEMO-4",
                "fields": {
                    "status": "운용",
                    "line_speed": "200M",
                    "line_count": 1,
                    "protocol": "UDP",
                    "manager": "인프라팀",
                    "cipher": "AES-256",
                    "upper_country": "인천센터",
                    "upper_country_address": "인천광역시",
                    "lower_country": "김포센터",
                    "lower_country_address": "경기도",
                    "note": "VPN4 demo",
                },
            },
            {
                "scope": "VPN5",
                "org_name": "샘플기관-VPN5",
                "device_name": "FW-DEMO-5",
                "fields": {
                    "status": "운용",
                    "line_speed": "10G",
                    "line_count": 1,
                    "protocol": "TCP",
                    "manager": "네트워크팀",
                    "cipher": "CHACHA20",
                    "upper_country": "제주센터",
                    "upper_country_address": "제주특별자치도",
                    "lower_country": "서울DR",
                    "lower_country_address": "서울특별시",
                    "note": "VPN5 demo",
                },
            },
        ]

        seeded = []
        for spec in specs:
            scope = spec["scope"]
            partner = _get_or_create_partner(spec["org_name"], user_id)
            line = _get_or_create_line(partner.id, scope, user_id, **spec["fields"])
            _get_or_create_device(line.id, spec["device_name"], user_id)
            seeded.append((scope, int(partner.id), int(line.id)))

        db.session.commit()

        print("[ok] seeded demo vpn policy rows")
        print(f"- actor_user_id: {user_id}")
        for scope, partner_id, line_id in seeded:
            print(f"- {scope}: partner_id={partner_id}, line_id={line_id}")


if __name__ == "__main__":
    main()

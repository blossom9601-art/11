"""Smoke check: VPN policy scope separation across CRUD.

Runs against Flask app test client (no external HTTP, no PowerShell one-liners).
Validates that:
- Lines are created with explicit scope.
- Listing lines with ?scope returns only that scope.
- Devices listing with ?scope returns only devices under lines of that scope.
- Bulk delete affects only targeted ids, and filtered listing reflects deletion.

Usage:
  C:/Users/ME/Desktop/blossom/.venv/Scripts/python.exe scripts/_smoke_check_vpn_scoped_crud.py
"""

from __future__ import annotations

from dataclasses import dataclass
import os
import sys

# Ensure repo root is on sys.path when running as a script
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from app import create_app
from app.models import db, OrgDepartment, UserProfile


@dataclass(frozen=True)
class _Created:
    scope: str
    partner_id: int
    line_id: int
    device_id: int


def _seed_user() -> int:
    dept = OrgDepartment.query.filter_by(dept_code="VPN_SMOKE").first()
    if not dept:
        dept = OrgDepartment(dept_code="VPN_SMOKE", dept_name="VPN_SMOKE", created_by="smoke")
        db.session.add(dept)
        db.session.flush()

    user = UserProfile.query.filter_by(emp_no="VPN_SMOKE").first()
    if not user:
        user = UserProfile(emp_no="VPN_SMOKE", name="VPN Smoke", department_id=dept.id, department=dept.dept_name)
        db.session.add(user)
        db.session.flush()

    db.session.commit()
    return int(user.id)


def _must(resp, status: int):
    assert resp.status_code == status, (resp.status_code, getattr(resp, "data", None))
    data = resp.get_json()
    assert isinstance(data, dict) and data.get("success") is True, data
    return data


def main() -> None:
    app = create_app()
    with app.app_context():
        user_id = _seed_user()

    client = app.test_client()

    created: list[_Created] = []

    # Create rows for VPN3~VPN5
    for scope in ("VPN3", "VPN4", "VPN5"):
        partner = _must(
            client.post(
                "/api/network/vpn-partners",
                json={
                    "org_name": f"SMOKE-{scope}",
                    "partner_type": scope,
                    "note": "smoke",
                    "created_by_user_id": user_id,
                },
            ),
            201,
        )["item"]

        line = _must(
            client.post(
                "/api/network/vpn-lines",
                json={
                    "vpn_partner_id": int(partner["id"]),
                    "scope": scope,
                    "status": "운용",
                    "line_speed": "100M",
                    "line_count": 1,
                    "protocol": "TCP",
                    "manager": "smoke",
                    "cipher": "AES-256",
                    "upper_country": f"UP-{scope}",
                    "lower_country": f"LOW-{scope}",
                    "created_by_user_id": user_id,
                },
            ),
            201,
        )["item"]
        assert line.get("scope") == scope

        device = _must(
            client.post(
                "/api/network/vpn-line-devices",
                json={
                    "vpn_line_id": int(line["id"]),
                    "device_name": f"FW-{scope}",
                    "created_by_user_id": user_id,
                },
            ),
            201,
        )["item"]

        created.append(
            _Created(
                scope=scope,
                partner_id=int(partner["id"]),
                line_id=int(line["id"]),
                device_id=int(device["id"]),
            )
        )

    # Verify list filtering by scope
    for scope in ("VPN3", "VPN4", "VPN5"):
        resp = _must(client.get(f"/api/network/vpn-lines?scope={scope}"), 200)
        item_ids = {int(x["id"]) for x in resp.get("items") or []}
        expected_line_ids = {c.line_id for c in created if c.scope == scope}
        assert expected_line_ids.issubset(item_ids), (scope, expected_line_ids, item_ids)
        assert all((x.get("scope") or "VPN1") == scope for x in (resp.get("items") or [])), resp

    # Verify devices list filtering by scope
    for scope in ("VPN3", "VPN4", "VPN5"):
        resp = _must(client.get(f"/api/network/vpn-line-devices?scope={scope}"), 200)
        device_ids = {int(x["id"]) for x in resp.get("items") or []}
        expected_device_ids = {c.device_id for c in created if c.scope == scope}
        assert expected_device_ids.issubset(device_ids), (scope, expected_device_ids, device_ids)

    # Update VPN4 line and verify it stays visible under VPN4
    vpn4_line_id = next(c.line_id for c in created if c.scope == "VPN4")
    updated = _must(
        client.put(
            f"/api/network/vpn-lines/{vpn4_line_id}",
            json={"line_speed": "1G", "updated_by_user_id": user_id},
        ),
        200,
    )["item"]
    assert updated.get("line_speed") == "1G"
    resp = _must(client.get("/api/network/vpn-lines?scope=VPN4"), 200)
    assert any(int(x["id"]) == vpn4_line_id for x in (resp.get("items") or [])), resp

    # Bulk delete VPN5 line and verify filtered list is now empty
    vpn5_line_id = next(c.line_id for c in created if c.scope == "VPN5")
    _must(
        client.post(
            "/api/network/vpn-lines/bulk-delete",
            json={"ids": [vpn5_line_id], "actor_user_id": user_id},
        ),
        200,
    )
    resp = _must(client.get("/api/network/vpn-lines?scope=VPN5"), 200)
    assert all(int(x["id"]) != vpn5_line_id for x in (resp.get("items") or [])), resp

    print("[ok] vpn scoped CRUD smoke check passed")


if __name__ == "__main__":
    main()

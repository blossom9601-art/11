"""Seed a few ADMIN-owned projects for local UI smoke checks.

Creates 3 projects (예정/진행/완료) owned by the ADMIN user profile.
Safe to re-run: it only creates missing projects by project_name.

Usage (PowerShell):
  C:/Users/ME/Desktop/blossom/.venv/Scripts/python.exe scripts/seed_prj_projects_admin_owned.py
"""

from __future__ import annotations

import os
import sys
from datetime import date

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.append(ROOT)

from app import create_app
from app.models import db, UserProfile, OrgDepartment, PrjProject


def _today_yyyy_mm_dd() -> str:
    return date.today().isoformat()


def seed() -> int:
    app = create_app()
    with app.app_context():
        admin_profile = UserProfile.query.filter_by(emp_no="ADMIN").first()
        if not admin_profile:
            print("ERROR: org_user(UserProfile) emp_no=ADMIN not found. Run scripts/force_admin_db.py first.")
            return 1

        dept = OrgDepartment.query.filter(OrgDepartment.is_deleted.is_(False)).order_by(OrgDepartment.id.asc()).first()
        if not dept:
            dept = OrgDepartment(
                dept_code="DEV",
                dept_name="개발(DEV)",
                description="Local dev seeded department",
                manager_name="ADMIN",
                manager_emp_no="ADMIN",
                remark="seed_prj_projects_admin_owned",
                is_deleted=False,
            )
            db.session.add(dept)
            db.session.commit()
            print(f"Created OrgDepartment id={dept.id} code={dept.dept_code}")

        templates = [
            {
                "project_name": "[seed] 담당 프로젝트(예정)",
                "project_type": "운영",
                "status": "예정",
                "priority": "일반",
                "start_date": _today_yyyy_mm_dd(),
                "expected_end_date": "2026-01-31",
                "budget_amount": 10000000,
                "task_count_cached": 3,
                "progress_percent": 0,
                "description": "UI 스모크 체크용(ADMIN owned)",
            },
            {
                "project_name": "[seed] 담당 프로젝트(진행)",
                "project_type": "개발",
                "status": "진행",
                "priority": "긴급",
                "start_date": "2025-12-01",
                "expected_end_date": "2026-03-15",
                "budget_amount": 25000000,
                "task_count_cached": 12,
                "progress_percent": 45,
                "description": "UI 스모크 체크용(ADMIN owned)",
            },
            {
                "project_name": "[seed] 담당 프로젝트(완료)",
                "project_type": "인프라",
                "status": "완료",
                "priority": "낮음",
                "start_date": "2025-10-01",
                "expected_end_date": "2025-11-15",
                "budget_amount": 5000000,
                "task_count_cached": 7,
                "progress_percent": 100,
                "description": "UI 스모크 체크용(ADMIN owned) - 완료",
            },
        ]

        created = 0
        for t in templates:
            exists = (
                PrjProject.query
                .filter(PrjProject.is_deleted == 0)
                .filter(PrjProject.project_name == t["project_name"])
                .first()
            )
            if exists:
                continue
            row = PrjProject(
                project_name=t["project_name"],
                project_type=t["project_type"],
                owner_dept_id=int(dept.id),
                manager_user_id=int(admin_profile.id),
                priority=t.get("priority"),
                description=t.get("description"),
                status=t["status"],
                budget_amount=t.get("budget_amount"),
                start_date=t.get("start_date"),
                expected_end_date=t.get("expected_end_date"),
                task_count_cached=int(t.get("task_count_cached") or 0),
                progress_percent=int(t.get("progress_percent") or 0),
                created_by_user_id=int(admin_profile.id),
                updated_by_user_id=int(admin_profile.id),
                is_deleted=0,
            )
            db.session.add(row)
            created += 1

        db.session.commit()
        total = PrjProject.query.filter(PrjProject.is_deleted == 0).count()
        print(f"Seeded projects created={created} total_non_deleted={total}")
        return 0


if __name__ == "__main__":
    raise SystemExit(seed())

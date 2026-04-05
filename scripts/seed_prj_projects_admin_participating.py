"""Seed a few ADMIN-participating projects for local UI smoke checks.

Creates projects owned by non-ADMIN managers, then adds ADMIN as MEMBER via
`prj_project_member`, so `/api/prj/projects?scope=participating` returns items.

Safe to re-run:
- Only creates missing projects by `project_name`
- Upserts membership rows by (project_id, user_id)

Usage (PowerShell):
  C:/Users/ME/Desktop/blossom/.venv/Scripts/python.exe scripts/seed_prj_projects_admin_participating.py
"""

from __future__ import annotations

import os
import sys
from datetime import date

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.append(ROOT)

from app import create_app
from app.models import db, UserProfile, OrgDepartment, PrjProject, PrjProjectMember


def _today_yyyy_mm_dd() -> str:
    return date.today().isoformat()


def _ensure_user(emp_no: str, *, name: str, dept: OrgDepartment) -> UserProfile:
    row = UserProfile.query.filter_by(emp_no=emp_no).first()
    if row:
        if not row.name:
            row.name = name
        if not row.department_id:
            row.department_id = dept.id
        if not row.department:
            row.department = dept.dept_name
        if not row.allowed_ip:
            row.allowed_ip = "*"
        db.session.add(row)
        return row

    row = UserProfile(
        emp_no=emp_no,
        name=name,
        nickname=name,
        company="blossom",
        department_id=dept.id,
        department=dept.dept_name,
        role="USER",
        allowed_ip="*",
    )
    db.session.add(row)
    db.session.flush()  # assign id
    return row


def _ensure_member(*, project_id: int, user_id: int, created_by_user_id: int) -> bool:
    existing = (
        PrjProjectMember.query.filter(PrjProjectMember.project_id == project_id)
        .filter(PrjProjectMember.user_id == user_id)
        .first()
    )
    if existing:
        changed = False
        if (existing.is_deleted or 0) != 0:
            existing.is_deleted = 0
            changed = True
        if (existing.member_role or "").upper() != "MEMBER":
            existing.member_role = "MEMBER"
            changed = True
        if not existing.created_by_user_id:
            existing.created_by_user_id = int(created_by_user_id)
            changed = True
        if changed:
            db.session.add(existing)
        return changed

    row = PrjProjectMember(
        project_id=int(project_id),
        user_id=int(user_id),
        member_role="MEMBER",
        created_by_user_id=int(created_by_user_id),
        is_deleted=0,
    )
    db.session.add(row)
    return True


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
                remark="seed_prj_projects_admin_participating",
                is_deleted=False,
            )
            db.session.add(dept)
            db.session.commit()
            print(f"Created OrgDepartment id={dept.id} code={dept.dept_code}")

        # Create two non-ADMIN users to own projects.
        mgr1 = _ensure_user("DEV001", name="개발자1", dept=dept)
        mgr2 = _ensure_user("DEV002", name="개발자2", dept=dept)
        # An additional participant to make the participants string non-trivial.
        extra = _ensure_user("DEV003", name="개발자3", dept=dept)

        templates = [
            {
                "project_name": "[seed] 참여 프로젝트(A)",
                "project_type": "개발",
                "status": "진행",
                "priority": "일반",
                "start_date": "2025-12-05",
                "expected_end_date": "2026-02-28",
                "budget_amount": 12000000,
                "task_count_cached": 9,
                "progress_percent": 30,
                "description": "UI 스모크 체크용(ADMIN participating) - manager DEV001",
                "manager_user_id": int(mgr1.id),
            },
            {
                "project_name": "[seed] 참여 프로젝트(B)",
                "project_type": "운영",
                "status": "예정",
                "priority": "낮음",
                "start_date": _today_yyyy_mm_dd(),
                "expected_end_date": "2026-01-15",
                "budget_amount": 8000000,
                "task_count_cached": 4,
                "progress_percent": 0,
                "description": "UI 스모크 체크용(ADMIN participating) - manager DEV002",
                "manager_user_id": int(mgr2.id),
            },
        ]

        created_projects = 0
        ensured_memberships = 0

        for t in templates:
            row = (
                PrjProject.query.filter(PrjProject.is_deleted == 0)
                .filter(PrjProject.project_name == t["project_name"])
                .first()
            )
            if not row:
                row = PrjProject(
                    project_name=t["project_name"],
                    project_type=t["project_type"],
                    owner_dept_id=int(dept.id),
                    manager_user_id=int(t["manager_user_id"]),
                    priority=t.get("priority"),
                    description=t.get("description"),
                    status=t["status"],
                    budget_amount=t.get("budget_amount"),
                    start_date=t.get("start_date"),
                    expected_end_date=t.get("expected_end_date"),
                    task_count_cached=int(t.get("task_count_cached") or 0),
                    progress_percent=int(t.get("progress_percent") or 0),
                    created_by_user_id=int(t["manager_user_id"]),
                    updated_by_user_id=int(t["manager_user_id"]),
                    is_deleted=0,
                )
                db.session.add(row)
                db.session.flush()  # assign id for membership inserts
                created_projects += 1

            # ADMIN must be MEMBER, and project must not be owned by ADMIN (API enforces this).
            if row.manager_user_id == int(admin_profile.id):
                continue

            if _ensure_member(project_id=int(row.id), user_id=int(admin_profile.id), created_by_user_id=int(admin_profile.id)):
                ensured_memberships += 1

            # Add another MEMBER so the UI can show multiple participants.
            if _ensure_member(project_id=int(row.id), user_id=int(extra.id), created_by_user_id=int(admin_profile.id)):
                ensured_memberships += 1

        db.session.commit()

        total_projects = PrjProject.query.filter(PrjProject.is_deleted == 0).count()
        total_members = PrjProjectMember.query.filter(PrjProjectMember.is_deleted == 0).count()
        print(
            "Seeded participating projects "
            f"created_projects={created_projects} ensured_memberships={ensured_memberships} "
            f"total_projects_non_deleted={total_projects} total_members_non_deleted={total_members}"
        )
        return 0


if __name__ == "__main__":
    raise SystemExit(seed())

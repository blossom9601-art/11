import argparse
import os
import re
import sys

# Ensure project root is on sys.path when executed as a script (e.g. `python scripts/...`).
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from app import create_app, db
from app.models import OrgDepartment, UserProfile


def _norm(value: str) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"\s+", " ", value)
    return value


def _token_variants(raw: str) -> list[str]:
    raw = (raw or "").strip()
    if not raw:
        return []

    variants: list[str] = []

    # original
    variants.append(raw)

    # Collapse whitespace
    variants.append(re.sub(r"\s+", " ", raw))

    # If like "NAME (CODE)" or "NAME(CODE)", try both pieces
    m = re.match(r"^(.*?)\s*\((.*?)\)\s*$", raw)
    if m:
        left = (m.group(1) or "").strip()
        inner = (m.group(2) or "").strip()
        if left:
            variants.append(left)
        if inner:
            variants.append(inner)

    # De-dup normalized
    out: list[str] = []
    seen: set[str] = set()
    for v in variants:
        nv = _norm(v)
        if not nv or nv in seen:
            continue
        seen.add(nv)
        out.append(nv)
    return out


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Backfill org_user.department_id by matching org_user.department to org_department (dept_name/dept_code)."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually write updates to the DB (default is dry-run).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Optional max number of rows to update (0 = no limit).",
    )
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        depts = (
            OrgDepartment.query
            .filter(OrgDepartment.is_deleted.is_(False))
            .with_entities(OrgDepartment.id, OrgDepartment.dept_code, OrgDepartment.dept_name)
            .all()
        )

        by_code: dict[str, int] = {}
        by_name: dict[str, int] = {}
        for dept_id, dept_code, dept_name in depts:
            if dept_id is None:
                continue
            if dept_code:
                by_code[_norm(dept_code)] = int(dept_id)
            if dept_name:
                by_name[_norm(dept_name)] = int(dept_id)

        q = (
            UserProfile.query
            .filter(UserProfile.department_id.is_(None))
            .filter(UserProfile.department.isnot(None))
        )

        candidates = []
        for prof in q.all():
            dept_raw = (prof.department or "").strip()
            if not dept_raw or dept_raw == "-":
                continue
            candidates.append(prof)

        total = len(candidates)
        updated = 0
        unmatched = 0
        planned = []  # (emp_no, dept_raw, matched_id)

        for prof in candidates:
            dept_raw = (prof.department or "").strip()
            matched_id = None
            for tok in _token_variants(dept_raw):
                matched_id = by_code.get(tok) or by_name.get(tok)
                if matched_id:
                    break

            if not matched_id:
                unmatched += 1
                continue

            planned.append((prof, matched_id))

        if args.limit and args.limit > 0:
            planned = planned[: args.limit]

        print(f"[backfill] candidates (dept_id is NULL, dept string set): {total}")
        print(f"[backfill] matched: {len(planned)}")
        print(f"[backfill] unmatched: {unmatched}")

        if not args.apply:
            print("[backfill] dry-run (no changes). Re-run with --apply to write updates.")
            return 0

        for prof, matched_id in planned:
            prof.department_id = int(matched_id)
            db.session.add(prof)
            updated += 1

        db.session.commit()
        print(f"[backfill] updated rows: {updated}")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())

import os
import sys
from datetime import datetime

# Ensure app import works when running as a script
sys.path.append(os.path.dirname(os.path.abspath(__file__)) + "/..")

from app import create_app
from app.models import db, OrgDepartment, UserProfile


def _login(client, *, user_id: int, emp_no: str) -> None:
    with client.session_transaction() as sess:
        sess["user_id"] = user_id
        sess["emp_no"] = emp_no


def main() -> int:
    app = create_app("development")

    stamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    dept_code = f"SMK{stamp}"
    emp_no = f"SMK{stamp}"

    with app.app_context():
        # Seed a dedicated dept + user for this smoke run
        dept = OrgDepartment(dept_code=dept_code, dept_name=f"SmokeDept-{stamp}", created_by="smoke")
        db.session.add(dept)
        db.session.flush()

        user = UserProfile(emp_no=emp_no, name=f"SmokeUser-{stamp}", department_id=dept.id, department=dept.dept_name)
        db.session.add(user)
        db.session.commit()

        with app.test_client() as client:
            _login(client, user_id=user.id, emp_no=user.emp_no)

            # 1) Create a project
            res_create = client.post(
                "/api/prj/projects",
                json={
                    "project_name": f"Smoke FMEA Project {stamp}",
                    "project_type": "SW",
                    "owner_dept_id": dept.id,
                    "manager_user_id": user.id,
                    "status": "ACTIVE",
                },
            )
            if res_create.status_code != 201:
                print("[FAIL] create project", res_create.status_code, res_create.data[:500])
                return 1
            project_id = res_create.get_json()["item"]["id"]

            # 2) Create a risk(tab78) payload that matches frontend structure
            sample_rows = [
                {
                    "process": "배포",
                    "failure": "배포 실패",
                    "effect": "서비스 다운",
                    "s": "8",
                    "o": "3",
                    "d": "4",
                    "rpn": "96",
                    "owner": "PM",
                    "status": "진행",
                }
            ]

            res_post = client.post(
                f"/api/prj/projects/{project_id}/tabs/risk",
                json={"payload": {"risk": {"fmea_rows": sample_rows}}},
            )
            if res_post.status_code != 201:
                print("[FAIL] create tab item", res_post.status_code, res_post.data[:500])
                return 1
            created = res_post.get_json()["item"]
            item_id = created["id"]

            # 3) List and verify roundtrip
            res_list = client.get(f"/api/prj/projects/{project_id}/tabs/risk")
            if res_list.status_code != 200:
                print("[FAIL] list tab items", res_list.status_code, res_list.data[:500])
                return 1
            payload = res_list.get_json()
            if payload.get("total") != 1:
                print("[FAIL] expected total=1 got", payload.get("total"))
                return 1
            got_rows = payload["items"][0]["payload"].get("risk", {}).get("fmea_rows")
            if got_rows != sample_rows:
                print("[FAIL] payload mismatch")
                print("expected:", sample_rows)
                print("got:", got_rows)
                return 1

            # 4) Soft delete and ensure list hides it
            res_del = client.delete(f"/api/prj/projects/{project_id}/tabs/risk/{item_id}")
            if res_del.status_code != 200:
                print("[FAIL] delete tab item", res_del.status_code, res_del.data[:500])
                return 1

            res_list2 = client.get(f"/api/prj/projects/{project_id}/tabs/risk")
            if res_list2.status_code != 200:
                print("[FAIL] list after delete", res_list2.status_code, res_list2.data[:500])
                return 1
            if res_list2.get_json().get("total") != 0:
                print("[FAIL] expected total=0 after delete")
                return 1

            res_list3 = client.get(f"/api/prj/projects/{project_id}/tabs/risk?include_deleted=1")
            if res_list3.status_code != 200:
                print("[FAIL] list include_deleted", res_list3.status_code, res_list3.data[:500])
                return 1
            j3 = res_list3.get_json()
            if j3.get("total") != 1 or j3["items"][0].get("is_deleted") != 1:
                print("[FAIL] expected deleted item visible with include_deleted=1")
                return 1

            print("[OK] tab78(risk/FMEA) API persistence roundtrip")
            print("      project_id=", project_id, "item_id=", item_id)

            # Optional cleanup: soft-delete project (keeps DB tidy)
            try:
                client.delete(f"/api/prj/projects/{project_id}")
            except Exception:
                pass

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

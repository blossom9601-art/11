"""지정 사용자 삭제 스크립트 (ADM001, T9999999)
AuthUser + UserProfile 모두 제거. 존재하지 않으면 skipped.
실행:
  C:/Users/ME/Desktop/blossom/.venv/Scripts/python.exe scripts/delete_specific_users.py
"""
import os, sys, json
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if ROOT not in sys.path:
    sys.path.append(ROOT)
from app import create_app
from app.models import db, AuthUser, UserProfile

TARGETS = ["ADM001", "T9999999"]

app = create_app()

out = {"deleted": [], "skipped": [], "errors": []}
with app.app_context():
    for emp in TARGETS:
        if emp.upper() == 'ADMIN':
            out['skipped'].append(emp)
            continue
        user = AuthUser.query.filter_by(emp_no=emp).first()
        profile = UserProfile.query.filter_by(emp_no=emp).first()
        if not user and not profile:
            out['skipped'].append(emp)
            continue
        try:
            if profile:
                db.session.delete(profile)
            if user:
                db.session.delete(user)
            out['deleted'].append(emp)
        except Exception as e:
            out['errors'].append(f"{emp}:{e}")
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        out['errors'].append(f"commit:{e}")
print(json.dumps(out, ensure_ascii=False))

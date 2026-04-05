import argparse
import os
import secrets
import string
import sys


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from app import create_app
from app.models import AuthPasswordHistory, AuthUser, db


def _classify_sets(pw: str) -> int:
    sets = 0
    if any("a" <= ch <= "z" for ch in pw):
        sets += 1
    if any("A" <= ch <= "Z" for ch in pw):
        sets += 1
    if any(ch.isdigit() for ch in pw):
        sets += 1
    if any((not ch.isalnum()) for ch in pw):
        sets += 1
    return sets


def _meets_password_policy(pw: str) -> bool:
    # Matches the /account/password policy in app/routes/auth.py:
    # - >=2 char sets and len>=10 OR >=3 char sets and len>=8
    sets = _classify_sets(pw)
    return (sets >= 2 and len(pw) >= 10) or (sets >= 3 and len(pw) >= 8)


def _generate_strong_password(length: int = 16) -> str:
    if length < 12:
        length = 12

    # Avoid whitespace/quotes/backslashes for fewer login/form edge cases.
    specials = "!@#$%^&*_-+="
    alphabet = string.ascii_letters + string.digits + specials

    for _ in range(1000):
        pw = "".join(secrets.choice(alphabet) for _ in range(length))
        if _meets_password_policy(pw) and _classify_sets(pw) >= 3:
            return pw
    raise RuntimeError("Failed to generate a password that meets policy")


def main() -> int:
    parser = argparse.ArgumentParser(description="Reset Blossom ADMIN password (AuthUser.emp_no=ADMIN)")
    parser.add_argument("--emp-no", default="ADMIN", help="Target emp_no (default: ADMIN)")
    parser.add_argument(
        "--password",
        default=None,
        help="New password. If omitted, uses BLOSSOM_ADMIN_PASSWORD or generates a strong one.",
    )
    parser.add_argument(
        "--length",
        type=int,
        default=16,
        help="Generated password length (default: 16). Minimum enforced to 12.",
    )
    parser.add_argument(
        "--no-history",
        action="store_true",
        help="Do not insert a row into auth_password_history.",
    )
    args = parser.parse_args()

    emp_no = (args.emp_no or "").strip() or "ADMIN"
    new_password = args.password or os.environ.get("BLOSSOM_ADMIN_PASSWORD")
    if not new_password:
        new_password = _generate_strong_password(args.length)

    if not _meets_password_policy(new_password):
        print("INVALID_PASSWORD: Does not meet policy (need 2 sets+len>=10 OR 3 sets+len>=8)")
        return 2

    app = create_app()
    with app.app_context():
        user = AuthUser.query.filter_by(emp_no=emp_no).first()
        if not user:
            print(f"NOT_FOUND: {emp_no} 계정을 찾을 수 없습니다. 필요하면 scripts/force_admin_db.py를 먼저 실행하세요.")
            return 1

        user.set_password(new_password)

        # Lockout / failed attempts reset
        try:
            user.reset_fail_count()
        except Exception:
            pass

        # Ensure admin role isn't accidentally downgraded.
        try:
            if not user.role or str(user.role).upper() != "ADMIN":
                user.role = "ADMIN"
        except Exception:
            pass

        if not args.no_history:
            try:
                hist = AuthPasswordHistory(
                    emp_no=user.emp_no,
                    password_hash=user.password_hash,
                    changed_by="SYSTEM",
                )
                db.session.add(hist)
            except Exception:
                pass

        db.session.commit()

    print("OK: ADMIN 비밀번호가 초기화되었습니다.")
    print(f"EMP_NO={emp_no}")
    print(f"NEW_PASSWORD={new_password}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

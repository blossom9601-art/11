import argparse
from app import create_app
from app.models import db, AuthRole, AuthUser

"""역할(AuthRole) 레코드 삭제 스크립트.
기본(옵션 미지정) 동작: 샘플 역할 ADMIN, USER 삭제.
옵션:
  --all                    모든 역할 삭제.
  --roles=R1,R2            지정한 역할만 삭제(쉼표 구분, 대소문자 무시 후 대문자 처리).
  --normalize-users        삭제된 역할을 가지고 있던 사용자(AuthUser)의 role 값을 USER 로 통일.
  --dry-run                실제 삭제하지 않고 대상 목록만 출력.

예:
  python scripts/purge_roles.py              # ADMIN, USER 삭제
  python scripts/purge_roles.py --all        # 모든 역할 삭제
  python scripts/purge_roles.py --roles=DEV,OPS --normalize-users
  python scripts/purge_roles.py --all --dry-run
"""

def main():
    parser = argparse.ArgumentParser(description='AuthRole 역할 샘플/지정 데이터 삭제')
    parser.add_argument('--all', action='store_true', help='모든 역할 삭제')
    parser.add_argument('--roles', help='삭제할 역할명 쉼표 목록 (예: ADMIN,USER,AUDITOR)')
    parser.add_argument('--normalize-users', action='store_true', help='삭제된 역할을 가진 사용자 role 을 USER 로 변경')
    parser.add_argument('--dry-run', action='store_true', help='대상만 출력하고 커밋하지 않음')
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        # 대상 역할 결정
        if args.all:
            target_roles = {r.role for r in AuthRole.query.all() if r.role}
        elif args.roles:
            target_roles = {x.strip().upper() for x in args.roles.split(',') if x.strip()}
        else:
            target_roles = {'ADMIN', 'USER'}  # 기본: 샘플 역할

        if not target_roles:
            print('삭제할 역할이 없습니다.')
            return

        role_rows = AuthRole.query.filter(AuthRole.role.in_(target_roles)).all()
        if not role_rows:
            print(f'대상 역할 없음: {",".join(sorted(target_roles))}')
            return

        print(f'삭제 대상 {len(role_rows)}개: {", ".join(r.role for r in role_rows)}')
        if args.dry_run:
            print('DRY-RUN: 삭제하지 않고 종료합니다.')
            return

        deleted = 0
        for r in role_rows:
            db.session.delete(r)
            deleted += 1

        normalized_cnt = 0
        if args.normalize_users and target_roles:
            affected_users = AuthUser.query.filter(AuthUser.role.in_(target_roles)).all()
            for u in affected_users:
                u.role = 'USER'
            normalized_cnt = len(affected_users)

        db.session.commit()
        print(f'역할 삭제 완료: {deleted}개')
        if args.normalize_users:
            print(f'사용자 role USER 로 통일: {normalized_cnt}명')

if __name__ == '__main__':
    main()

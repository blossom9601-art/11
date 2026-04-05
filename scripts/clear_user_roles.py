from app import create_app
from app.models import db, AuthUser

def main():
    app = create_app()
    with app.app_context():
        users = AuthUser.query.all()
        for u in users:
            u.role = ''
        db.session.commit()
        print('cleared_user_roles', len(users))
        # Show distinct remaining role values
        distinct = sorted({(u.role or '') for u in AuthUser.query.all()})
        print('distinct_roles_after', distinct)

if __name__ == '__main__':
    main()

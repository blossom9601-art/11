import os, sys, json
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if ROOT not in sys.path:
    sys.path.append(ROOT)
from app import create_app
from app.models import db, AuthRole

def main():
    app = create_app()
    with app.app_context():
        rows = AuthRole.query.all()
        data = []
        for r in rows:
            try:
                perms = json.loads(r.permissions) if r.permissions else {}
            except Exception:
                perms = {'_parse_error': r.permissions}
            data.append({'role': r.role, 'description': r.description, 'permissions': perms})
        print(json.dumps({'count': len(data), 'roles': data}, ensure_ascii=False))

if __name__ == '__main__':
    main()

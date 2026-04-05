import sys, os
sys.path.append(os.path.dirname(os.path.abspath(__file__)) + '/..')
from app import create_app

def main():
    app = create_app('development')
    with app.app_context():
        with app.test_client() as c:
            resp = c.post('/admin/auth/create', data={
                'emp_no': 'U9999',
                'name': '테스트사용자',
                'email': 'u9999@test.local',
                'role': 'USER'
            })
            print('STATUS', resp.status_code)
            print('RAW', resp.data.decode()[:300])

if __name__ == '__main__':
    main()

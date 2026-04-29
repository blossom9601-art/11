from datetime import datetime

from app import create_app

app = create_app()

with app.test_client() as c:
    with c.session_transaction() as s:
        now = datetime.utcnow().isoformat()
        s['user_id'] = 1
        s['emp_no'] = 'admin'
        s['role'] = 'ADMIN'
        s['_login_at'] = now
        s['_last_active'] = now

    r = c.get('/p/cat_business_group', headers={'X-Requested-With': 'blossom-spa'}, follow_redirects=False)
    html = r.get_data(as_text=True)

    print('status', r.status_code)
    print('location', r.headers.get('Location'))
    print('contains_work_status_name', 'name="work_status"' in html)
    print('contains_syncfix_ver', 'wg_status_syncfix1' in html)
    print('contains_option_normal', 'value="정상"' in html)
    print('contains_option_hold', 'value="보류"' in html)
    print('contains_option_dispose', 'value="폐기"' in html)

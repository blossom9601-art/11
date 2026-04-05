"""Diagnose TPMC API responses for hardware assets."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('FLASK_APP', 'run.py')

from app import create_app
app = create_app('testing')

with app.test_client() as c:
    c.post('/login', data={'username': 'admin', 'password': 'admin'})
    for hid in range(1, 20):
        r = c.get(f'/api/hardware/assets/{hid}/tpmc')
        j = r.get_json()
        if j:
            print(f"hid={hid} status={r.status_code} success={j.get('success')} "
                  f"calculable={j.get('calculable')} "
                  f"error={j.get('error', j.get('message', ''))}")

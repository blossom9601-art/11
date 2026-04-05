"""Test TPMC API endpoint after fix."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('FLASK_APP', 'run.py')

from app import create_app
app = create_app('testing')

with app.test_client() as c:
    c.post('/login', data={'username': 'admin', 'password': 'admin'})
    r = c.get('/api/hardware/assets/27/tpmc')
    j = r.get_json()
    print(f"status={r.status_code}")
    print(f"success={j.get('success')}")
    print(f"calculable={j.get('calculable')}")
    print(f"tpmc_total={j.get('tpmc_total')}")
    print(f"tpmc_managed={j.get('tpmc_managed')}")
    print(f"role_factor={j.get('role_factor')}")
    print(f"virtualization_factor={j.get('virtualization_factor')}")
    print(f"safety_factor={j.get('safety_factor')}")
    comps = j.get('cpu_components', [])
    for c2 in comps:
        print(f"  CPU: model={c2['model']} qty={c2['qty']} "
              f"per_core_tpmc={c2['per_core_tpmc']} component_tpmc={c2['component_tpmc']}")

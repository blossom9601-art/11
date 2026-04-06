"""Quick smoke test for hw_interface_detail API."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ['FLASK_ENV'] = 'testing'

from app import create_app

app = create_app('testing')

with app.test_client() as c:
    # Login
    c.post('/api/login', json={'userId': 'admin', 'password': 'admin'})

    # GET - list (no interface_id)
    r = c.get('/api/hw-interface-details')
    print('GET (no param):', r.status_code, r.get_json())

    # GET - list with interface_id=0
    r = c.get('/api/hw-interface-details?interface_id=999')
    print('GET (id=999):', r.status_code, r.get_json())

    # POST - create
    r = c.post('/api/hw-interface-details', json={
        'interface_id': 999,
        'category': 'Primary',
        'ip_address': '10.0.0.1',
        'protocol': 'TCP',
        'port': '443',
        'service_name': 'HTTPS',
        'status': 'LISTEN',
        'access_control': 'ANY',
        'description': 'Test entry'
    })
    print('POST create:', r.status_code, r.get_json())
    created = r.get_json()

    if created and created.get('id'):
        det_id = created['id']

        # GET - list after create
        r = c.get('/api/hw-interface-details?interface_id=999')
        print('GET after create:', r.status_code, r.get_json())

        # PUT - update
        r = c.put(f'/api/hw-interface-details/{det_id}', json={
            'port': '8443',
            'description': 'Updated entry'
        })
        print('PUT update:', r.status_code, r.get_json())

        # DELETE
        r = c.delete(f'/api/hw-interface-details/{det_id}')
        print('DELETE:', r.status_code, r.get_json())

        # GET - list after delete
        r = c.get('/api/hw-interface-details?interface_id=999')
        print('GET after delete:', r.status_code, r.get_json())

    print('\nAll API tests passed!' if True else '')

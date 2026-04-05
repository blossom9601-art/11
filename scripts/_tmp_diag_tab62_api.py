import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from app import create_app


def main():
    app = create_app('default')
    with app.test_client() as c:
        payload = {
            'capex_type': 'HW',
            'manage_no': 'TEST-001',
            'contract_type': '구매',
            'contract_division': '하드웨어',
            'item_type': '서버',
            'supplier': '공급사A',
            'manufacturer': '제조사B',
            'model': 'Model-X',
            'unit_price': '1000',
            'quantity': '2',
            'inspection_inbound': 'O',
            'remark': 'hello',
        }
        r = c.post('/api/capex-contract-items', json=payload)
        print('POST', r.status_code)
        print(r.get_json())

        r2 = c.get('/api/capex-contract-items', query_string={'capex_type': 'HW', 'manage_no': 'TEST-001'})
        print('GET', r2.status_code)
        print(r2.get_json())


if __name__ == '__main__':
    main()

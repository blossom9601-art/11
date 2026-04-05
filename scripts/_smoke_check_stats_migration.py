"""빠른 smoke test: 마이그레이션 후 페이지 렌더링 확인"""
import sys, os, traceback
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app import create_app

app = create_app('testing')
out_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '_smoke_out.txt')

# 테스트할 페이지 키: 각 카테고리에서 대표 1개씩
test_keys = [
    'hw_server_onpremise',    # 2.hardware
    'hw_storage_backup',      # 2.hardware storage
    'hw_security_firewall',   # 2.hardware security
    'gov_dr_training',        # 4.governance
    'dc_access_control',      # 6.datacenter
    'cost_opex_hardware',     # 7.cost
    'cat_hw_server',          # 9.category hardware
    'cat_sw_os',              # 9.category software
    'cat_component_cpu',      # 9.category component
    'cat_company_center',     # 9.category company
    'cat_vendor_manufacturer',# 9.category vendor
]

with open(out_path, 'w', encoding='utf-8') as fout:
    with app.test_client() as client:
        client.post('/api/login', json={'user_id': 'admin', 'password': 'admin'})

        ok = 0
        fail = 0
        for key in test_keys:
            try:
                resp = client.get(f'/p/{key}')
                status = resp.status_code
                has_modal = b'system-stats-modal' in resp.data
                has_korean = '통계'.encode('utf-8') in resp.data
                if status == 200 and has_modal and has_korean:
                    ok += 1
                    fout.write(f"  [OK] {key} ({status})\n")
                else:
                    fail += 1
                    fout.write(f"  [FAIL] {key} (status={status}, modal={has_modal}, kr={has_korean})\n")
            except Exception as e:
                fail += 1
                fout.write(f"  [ERROR] {key}: {e}\n")

        summary = f"\n결과: {ok} 통과, {fail} 실패 / 총 {len(test_keys)}"
        fout.write(summary + "\n")
        print(summary)
        sys.exit(1 if fail else 0)

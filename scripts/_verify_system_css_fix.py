"""
수정된 15개 상세 페이지의 렌더링 및 인코딩을 검증합니다.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('FLASK_ENV', 'testing')

from app import create_app

app = create_app('testing')

DETAIL_PAGES = [
    'hw_storage_backup',
    'hw_san_director',
    'hw_san_sansw',
    'hw_network_l2',
    'hw_network_l4',
    'hw_network_l7',
    'hw_network_ap',
    'hw_network_dedicateline',
    'hw_security_firewall',
    'hw_security_vpn',
    'hw_security_ids',
    'hw_security_hsm',
    'hw_security_kms',
    'hw_security_wips',
    'hw_security_etc',
]

# 이미 system.css가 있던 페이지 (대조군)
CONTROL_PAGES = [
    'hw_server_onpremise',
    'hw_server_cloud',
    'hw_san_director',  # list page check
]

with app.test_client() as c:
    # 로그인
    with c.session_transaction() as sess:
        sess['user_id'] = 1
        sess['emp_no'] = 'ACTOR001'
        sess['login_id'] = 'admin'
        sess['role'] = 'ADMIN'

    print("=== 수정된 상세 페이지 검증 ===\n")
    
    all_ok = True
    for key in DETAIL_PAGES:
        # 목록 페이지에서 detail URL 패턴으로 접근
        url = f'/pages/{key}_detail?id=1'
        resp = c.get(url)
        status = resp.status_code
        
        body = resp.data.decode('utf-8', errors='replace')
        has_system_css = 'system.css' in body
        has_korean = '하드웨어' in body or '기본정보' in body or '서버' in body or '상세' in body or '뒤로' in body
        has_mojibake = '\ufffd' in body
        
        ok = status == 200 and has_system_css and has_korean and not has_mojibake
        icon = '✅' if ok else '❌'
        
        if not ok:
            all_ok = False
        
        detail = []
        if status != 200: detail.append(f'status={status}')
        if not has_system_css: detail.append('system.css 누락')
        if not has_korean: detail.append('한국어 없음')
        if has_mojibake: detail.append('인코딩 깨짐')
        
        extra = f' ({", ".join(detail)})' if detail else ''
        print(f"  {icon} {key}{extra}")
    
    print(f"\n{'모두 정상!' if all_ok else '일부 문제 발견'}")

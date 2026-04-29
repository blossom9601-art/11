#!/usr/bin/env python3
"""렌더링된 HTML의 바이트 검증"""
import sys
from datetime import datetime
from app import create_app

app = create_app()
now = datetime.utcnow().isoformat()

with app.test_client() as c:
    with c.session_transaction() as s:
        s['user_id'] = 1
        s['emp_no'] = 'admin'
        s['role'] = 'ADMIN'
        s['_login_at'] = now
        s['_last_active'] = now
    
    r = c.get('/p/cat_business_group', headers={'X-Requested-With':'blossom-spa'})
    html_bytes = r.get_data()  # 바이트 그대로
    html_str = r.get_data(as_text=True)  # 문자열
    
    print('=== Response Headers ===')
    print(f'Content-Type: {r.headers.get("Content-Type")}')
    print(f'Status: {r.status_code}')
    
    # 정상 한국어 바이트 패턴
    target_bytes_utf8 = '정상'.encode('utf-8')
    print(f'\n=== 한국어 "정상" 패턴 ===')
    print(f'UTF-8 bytes: {target_bytes_utf8.hex(" ")}')
    print(f'In response bytes: {target_bytes_utf8 in html_bytes}')
    print(f'In response str: {"정상" in html_str}')
    
    # work_status select 섹션 찾기
    ws_idx = html_str.find('name="work_status"')
    if ws_idx != -1:
        select_start = html_str.rfind('<select', 0, ws_idx)
        select_end = html_str.find('</select>', ws_idx) + len('</select>')
        select_text = html_str[select_start:select_end]
        
        print(f'\n=== SELECT in STRING ===')
        print(select_text[:500])
        
        # 같은 부분의 바이트
        select_bytes = html_bytes[select_start:select_end]
        print(f'\n=== SELECT in BYTES (hex) ===')
        print(select_bytes[:200].hex(' '))
        
        # 정상이 나타나는지 확인
        if '정상' in select_text:
            print('\n✓ 정상 is in select_text')
        else:
            print('\n✗ 정상 NOT in select_text')
            # 대신 뭐가 있는지 확인
            print('First 600 chars:', select_text[:600])

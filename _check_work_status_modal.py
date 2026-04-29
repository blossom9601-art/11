#!/usr/bin/env python3
"""원격 서버 work_status 모달 검증"""
import sys
from datetime import datetime
from pathlib import Path

# 로컬에서 실행될 때는 실행하지 말고 원격으로만 실행
if __name__ == '__main__':
    try:
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
            html = r.get_data(as_text=True)
            
            # 1. work_status select 찾기
            ws_idx = html.find('name="work_status"')
            if ws_idx == -1:
                print("ERROR_NO_WORK_STATUS_FIELD")
                sys.exit(1)
            
            # 2. select 태그 추출 (work_status를 포함한 section, 다음 </select>까지)
            select_start = html.rfind('<select', 0, ws_idx)
            select_end = html.find('</select>', ws_idx) + len('</select>')
            
            if select_start == -1 or select_end < select_start:
                print("ERROR_NO_SELECT_TAG")
                sys.exit(1)
            
            select_html = html[select_start:select_end]
            
            # 3. 검증
            has_search_class = 'class="search-select"' in select_html or 'searchable-select' in select_html
            has_form_input = 'class="form-input"' in select_html
            has_option_normal = 'value="정상"' in select_html
            has_option_hold = 'value="보류"' in select_html
            has_option_dispose = 'value="폐기"' in select_html
            has_required = 'required' in select_html
            
            # 4. 결과 출력
            print("=== WORK_STATUS SELECT HTML ===")
            print(select_html[:2000])  # 처음 2000자만
            print("\n=== VALIDATION ===")
            print(f"has_search_class: {has_search_class}")
            print(f"has_form_input: {has_form_input}")
            print(f"has_option_normal: {has_option_normal}")
            print(f"has_option_hold: {has_option_hold}")
            print(f"has_option_dispose: {has_option_dispose}")
            print(f"has_required: {has_required}")
            
            # 5. 실패 판단
            if has_search_class:
                print("\nERROR: still has search-select class!")
                sys.exit(1)
            if not (has_form_input and has_option_normal and has_option_hold and has_option_dispose):
                print("\nERROR: missing required form-input or option values!")
                sys.exit(1)
            
            print("\n✓ work_status is a plain form-input select with 정상/보류/폐기")
            
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

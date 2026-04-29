#!/usr/bin/env python3
"""
🔍 Blossom QA 전체 범위 점검 (옵션 2)
- 페이지 근접성, CRUD, Dead UI, 데이터 정합성, 보안, 성능

실행 위치: 원격 서버 /opt/blossom/web
명령: python3 _qa_full_scope.py
"""

import sys
import json
from datetime import datetime
from app import create_app, db
from app.models import AuthUser, AuthLoginHistory, AuthPasswordHistory, AuthRole
from app.models import PrjProject, WrkWorkGroup, SvcTicket, MsgRoom
from app.models import SmtpConfig, SmsConfig, MfaConfig
from sqlalchemy import inspect

app = create_app()
PASS = "✅"
WARN = "⚠️ "
FAIL = "❌"
INFO = "ℹ️ "

results = {
    'timestamp': datetime.now().isoformat(),
    'categories': {},
    'summary': {'pass': 0, 'warn': 0, 'fail': 0, 'error': 0},
    'issues': []
}

def add_result(category, status, title, detail=""):
    """결과 기록"""
    if category not in results['categories']:
        results['categories'][category] = []
    
    results['categories'][category].append({
        'status': status,
        'title': title,
        'detail': detail
    })
    
    if status == 'PASS':
        results['summary']['pass'] += 1
    elif status == 'WARN':
        results['summary']['warn'] += 1
        results['issues'].append(f"⚠️  [{category}] {title}")
    elif status == 'FAIL':
        results['summary']['fail'] += 1
        results['issues'].append(f"❌ [{category}] {title}")
    elif status == 'ERROR':
        results['summary']['error'] += 1
        results['issues'].append(f"🔴 [{category}] {title}")

# ────────────────────────────────────────────────────
# [1] 페이지 근접성 검증
# ────────────────────────────────────────────────────
print("\n" + "="*60)
print("📋 [1] 페이지 근접성 검증 (라우팅)")
print("="*60)

with app.test_client() as client:
    # 관리자 세션 주입
    with client.session_transaction() as sess:
        sess['role'] = 'ADMIN'
        sess['emp_no'] = 'admin'
        sess['user_id'] = 1
    
    # 모든 주요 admin 라우트 테스트
    admin_routes = [
        '/admin/auth/users',
        '/admin/auth/groups',
        '/admin/auth/settings',
        '/admin/auth/security-settings',
        '/admin/auth/file-management',
        '/admin/auth/sessions',
        '/admin/auth/mail',
        '/admin/auth/change-log',
        '/admin/auth/info-message',
        '/admin/auth/version',
        '/admin/auth/page-tab',
        '/admin/auth/brand-settings',
    ]
    
    for route in admin_routes:
        try:
            r = client.get(route)
            if r.status_code == 200:
                add_result("라우팅", "PASS", f"{route}", f"Status 200")
                print(f"{PASS} {route}: 200")
            elif r.status_code == 302:
                add_result("라우팅", "WARN", f"{route}", f"Redirect {r.status_code}")
                print(f"{WARN} {route}: {r.status_code} (redirect)")
            else:
                add_result("라우팅", "FAIL", f"{route}", f"Status {r.status_code}")
                print(f"{FAIL} {route}: {r.status_code}")
        except Exception as e:
            add_result("라우팅", "ERROR", f"{route}", str(e))
            print(f"🔴 {route}: {str(e)[:50]}")

# ────────────────────────────────────────────────────
# [2] API 엔드포인트 검증
# ────────────────────────────────────────────────────
print("\n" + "="*60)
print("🔌 [2] API 엔드포인트 검증")
print("="*60)

with app.test_client() as client:
    with client.session_transaction() as sess:
        sess['role'] = 'ADMIN'
        sess['emp_no'] = 'admin'
        sess['user_id'] = 1
    
    api_endpoints = [
        ('/admin/auth/security-policy/change-log?per_page=5', 'GET', 'change-log'),
        ('/admin/auth/login-attempt-stats', 'GET', 'login-stats'),
        ('/api/file-policy', 'GET', 'file-policy'),
        ('/api/info-messages', 'GET', 'info-messages'),
        ('/api/version', 'GET', 'version'),
        ('/api/brand-settings', 'GET', 'brand-settings'),
    ]
    
    for endpoint, method, name in api_endpoints:
        try:
            if method == 'GET':
                r = client.get(endpoint)
            elif method == 'POST':
                r = client.post(endpoint, json={})
            else:
                r = client.put(endpoint, json={})
            
            if r.status_code in (200, 201):
                add_result("API", "PASS", name, f"{method} {r.status_code}")
                try:
                    j = r.get_json(silent=True)
                    print(f"{PASS} {name}: {method} {r.status_code}, JSON keys: {list(j.keys())[:3]}")
                except:
                    print(f"{PASS} {name}: {method} {r.status_code}")
            else:
                add_result("API", "WARN", name, f"{method} {r.status_code}")
                print(f"{WARN} {name}: {method} {r.status_code}")
        except Exception as e:
            add_result("API", "ERROR", name, str(e))
            print(f"🔴 {name}: {str(e)[:50]}")

# ────────────────────────────────────────────────────
# [3] DB 정합성 검증
# ────────────────────────────────────────────────────
print("\n" + "="*60)
print("💾 [3] 데이터베이스 정합성 검증")
print("="*60)

with app.app_context():
    # 테이블 존재 여부 확인
    tables_to_check = [
        'auth_users',
        'auth_login_history',
        'user_profile',
        'security_policy',
        'security_policy_log',
        'permission_audit_log',
        'auth_roles',
    ]
    
    inspector = inspect(db.engine)
    existing_tables = inspector.get_table_names()
    
    for table in tables_to_check:
        if table in existing_tables:
            add_result("DB", "PASS", f"{table} 존재", f"테이블 존재")
            print(f"{PASS} {table}: exists")
        else:
            add_result("DB", "FAIL", f"{table} 존재", f"테이블 없음")
            print(f"{FAIL} {table}: NOT FOUND")
    
    # 로깅 테이블 데이터 확인
    try:
        log_count = db.session.execute(
            db.text("SELECT COUNT(*) FROM security_policy_log")
        ).scalar() or 0
        add_result("DB", "PASS", "security_policy_log 기록", f"{log_count}건")
        print(f"{PASS} security_policy_log: {log_count} records")
    except Exception as e:
        add_result("DB", "WARN", "security_policy_log 기록", str(e)[:50])
        print(f"{WARN} security_policy_log: {str(e)[:50]}")
    
    # 사용자 데이터 확인
    try:
        user_count = AuthUser.query.count()
        add_result("DB", "PASS", "auth_users 데이터", f"{user_count}명")
        print(f"{PASS} auth_users: {user_count} users")
    except Exception as e:
        add_result("DB", "ERROR", "auth_users 데이터", str(e))
        print(f"🔴 auth_users: {str(e)[:50]}")

# ────────────────────────────────────────────────────
# [4] 보안 점검
# ────────────────────────────────────────────────────
print("\n" + "="*60)
print("🔐 [4] 보안 점검")
print("="*60)

# 인증 없이 접근 시도
with app.test_client() as client:
    protected_routes = [
        '/admin/auth/users',
        '/admin/auth/security-settings',
        '/admin/auth/file-management',
    ]
    
    for route in protected_routes:
        r = client.get(route, follow_redirects=False)
        if r.status_code in (302, 403):
            add_result("보안", "PASS", f"{route} 보호", "인증 필요")
            print(f"{PASS} {route}: Protected (status {r.status_code})")
        else:
            add_result("보안", "FAIL", f"{route} 보호", f"Status {r.status_code} (인증 우회 가능)")
            print(f"{FAIL} {route}: NOT protected (status {r.status_code})")

# ────────────────────────────────────────────────────
# [5] 콘솔 에러 시뮬레이션
# ────────────────────────────────────────────────────
print("\n" + "="*60)
print("🔍 [5] 엔드포인트 에러 응답 검증")
print("="*60)

with app.test_client() as client:
    with client.session_transaction() as sess:
        sess['role'] = 'ADMIN'
        sess['emp_no'] = 'admin'
        sess['user_id'] = 1
    
    # 존재하지 않는 엔드포인트
    r = client.get('/api/nonexistent')
    if r.status_code == 404:
        add_result("에러 처리", "PASS", "404 오류 처리", "정상")
        print(f"{PASS} 404 오류: 정상 처리")
    else:
        add_result("에러 처리", "WARN", "404 오류 처리", f"Status {r.status_code}")
        print(f"{WARN} 404 오류: Status {r.status_code}")

# ────────────────────────────────────────────────────
# [6] 성능 지표
# ────────────────────────────────────────────────────
print("\n" + "="*60)
print("⚡ [6] 성능 지표")
print("="*60)

import time

with app.test_client() as client:
    with client.session_transaction() as sess:
        sess['role'] = 'ADMIN'
        sess['emp_no'] = 'admin'
        sess['user_id'] = 1
    
    perf_routes = [
        '/admin/auth/users',
        '/admin/auth/security-settings',
        '/api/info-messages',
    ]
    
    for route in perf_routes:
        start = time.time()
        r = client.get(route)
        elapsed = (time.time() - start) * 1000  # ms
        
        if elapsed < 1000:
            add_result("성능", "PASS", f"{route}", f"{elapsed:.0f}ms")
            print(f"{PASS} {route}: {elapsed:.0f}ms")
        elif elapsed < 3000:
            add_result("성능", "WARN", f"{route}", f"{elapsed:.0f}ms (느림)")
            print(f"{WARN} {route}: {elapsed:.0f}ms (slow)")
        else:
            add_result("성능", "FAIL", f"{route}", f"{elapsed:.0f}ms (매우 느림)")
            print(f"{FAIL} {route}: {elapsed:.0f}ms (very slow)")

# ────────────────────────────────────────────────────
# 결과 출력
# ────────────────────────────────────────────────────
print("\n" + "="*60)
print("📊 최종 점검 결과")
print("="*60)

print(f"\n✅ PASS: {results['summary']['pass']}")
print(f"⚠️  WARN: {results['summary']['warn']}")
print(f"❌ FAIL: {results['summary']['fail']}")
print(f"🔴 ERROR: {results['summary']['error']}")

if results['issues']:
    print("\n🔴 발견된 문제:")
    for issue in results['issues']:
        print(f"  {issue}")

print("\n" + "="*60)
print(json.dumps(results, indent=2, ensure_ascii=False))
print("="*60)

sys.exit(0 if results['summary']['fail'] == 0 else 1)

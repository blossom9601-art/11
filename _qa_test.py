#!/usr/bin/env python3
"""
🔍 Blossom QA 전체 범위 점검 - 단순화 버전
직접 Flask test_client 사용
"""

import sys
import json
from datetime import datetime, timezone

# 로컬 프로젝트 import
sys.path.insert(0, '.')
from app import create_app, db
from app.models import AuthUser

app = create_app()


def seed_admin_session(client):
    """테스트 클라이언트에 유효한 관리자 세션을 주입한다."""
    sid = 'qa-admin-session'
    now_iso = datetime.now(timezone.utc).isoformat()

    with client.session_transaction() as sess:
        sess['role'] = 'ADMIN'
        sess['emp_no'] = 'admin'
        sess['user_id'] = 1
        sess['_session_id'] = sid
        sess['_login_at'] = now_iso
        sess['_last_active'] = now_iso

    # active_sessions 기반 검증을 통과하도록 세션 레코드 보정
    try:
        with app.app_context():
            db.session.execute(
                db.text("DELETE FROM active_sessions WHERE session_id = :sid"),
                {'sid': sid}
            )
            db.session.execute(
                db.text(
                    "INSERT INTO active_sessions "
                    "(session_id, emp_no, user_name, ip_address, user_agent, browser, os, created_at, last_active) "
                    "VALUES (:sid, :emp, :name, :ip, :ua, :br, :os, datetime('now'), datetime('now'))"
                ),
                {
                    'sid': sid,
                    'emp': 'admin',
                    'name': '관리자',
                    'ip': '127.0.0.1',
                    'ua': 'qa-test-client',
                    'br': 'qa',
                    'os': 'qa'
                }
            )
            db.session.commit()
    except Exception:
        db.session.rollback()

results = {
    'timestamp': datetime.now().isoformat(),
    'summary': {'PASS': 0, 'WARN': 0, 'FAIL': 0},
    'details': []
}

def log_result(status, category, title, detail=''):
    """결과 기록"""
    results['details'].append({
        'status': status,
        'category': category,
        'title': title,
        'detail': detail
    })
    results['summary'][status] += 1
    mark = '✅' if status == 'PASS' else '⚠️ ' if status == 'WARN' else '❌'
    print(f"{mark} [{category}] {title}: {detail}")

print("\n" + "="*70)
print("🔍 BLOSSOM QA 전체 범위 점검 (옵션 2)")
print("="*70)

# ─────────────────────────────────────────────────────
# [1] 라우팅 / 페이지 근접성
# ─────────────────────────────────────────────────────
print("\n📋 [1] 라우팅 및 페이지 근접성 검증")
print("-" * 70)

with app.test_client() as client:
    seed_admin_session(client)
    
    routes = {
        '사용자': '/admin/auth/settings',
        '화면권한': '/admin/auth/groups',
        '인증관리': '/admin/auth/settings',
        '보안관리': '/admin/auth/security-policy',
        '파일관리': '/admin/auth/file-management',
        '세션관리': '/admin/auth/sessions',
        '메일관리': '/admin/auth/mail',
        '통합로그': '/admin/auth/change-log',
        '문구관리': '/admin/auth/info-message',
        '버전관리': '/admin/auth/version',
        '페이지관리': '/admin/auth/page-tab',
        '브랜드관리': '/admin/auth/brand',
    }
    
    for cat, url in routes.items():
        try:
            r = client.get(url, follow_redirects=False)
            if r.status_code == 200:
                log_result('PASS', '라우팅', cat, f'Status {r.status_code}')
            elif r.status_code == 302:
                loc = r.headers.get('Location', '')
                if '/login' in loc:
                    log_result('FAIL', '라우팅', cat, f'Redirect to login ({r.status_code})')
                else:
                    log_result('WARN', '라우팅', cat, f'Redirect {r.status_code} -> {loc}')
            else:
                log_result('FAIL', '라우팅', cat, f'Status {r.status_code}')
        except Exception as e:
            log_result('FAIL', '라우팅', cat, str(e)[:50])

# ─────────────────────────────────────────────────────
# [2] API 엔드포인트
# ─────────────────────────────────────────────────────
print("\n🔌 [2] API 엔드포인트 검증")
print("-" * 70)

with app.test_client() as client:
    seed_admin_session(client)
    
    apis = {
        '변경로그': '/admin/auth/security-policy/change-log?per_page=5',
        '로그인시도통계': '/admin/auth/login-attempt-stats',
        '파일정책': '/api/file-policy',
        '문구': '/api/info-messages',
        '버전': '/api/version',
        '브랜드': '/api/brand-settings',
    }
    
    for name, url in apis.items():
        try:
            r = client.get(url, follow_redirects=False)
            if r.status_code in (200, 201):
                try:
                    j = r.get_json(silent=True)
                    keys = ', '.join(list(j.keys())[:3]) if j else 'empty'
                    log_result('PASS', 'API', name, f'{r.status_code} - keys: {keys}')
                except:
                    log_result('PASS', 'API', name, f'{r.status_code}')
            elif r.status_code in (302, 401, 403):
                log_result('FAIL', 'API', name, f'{r.status_code} (auth/session 문제)')
            else:
                log_result('WARN', 'API', name, f'{r.status_code}')
        except Exception as e:
            log_result('FAIL', 'API', name, str(e)[:50])

# ─────────────────────────────────────────────────────
# [3] 데이터베이스 정합성
# ─────────────────────────────────────────────────────
print("\n💾 [3] 데이터베이스 정합성 검증")
print("-" * 70)

with app.app_context():
    try:
        user_count = AuthUser.query.count()
        log_result('PASS', 'DB', 'auth_users 테이블', f'{user_count}명 존재')
    except Exception as e:
        log_result('FAIL', 'DB', 'auth_users', str(e)[:50])
    
    try:
        log_count = db.session.execute(
            db.text("SELECT COUNT(*) FROM security_policy_log")
        ).scalar() or 0
        log_result('PASS', 'DB', 'security_policy_log', f'{log_count}건 기록')
    except Exception as e:
        log_result('WARN', 'DB', 'security_policy_log', str(e)[:50])
    
    try:
        perm_count = db.session.execute(
            db.text("SELECT COUNT(*) FROM permission_audit_log")
        ).scalar() or 0
        log_result('PASS', 'DB', 'permission_audit_log', f'{perm_count}건 기록')
    except Exception as e:
        log_result('WARN', 'DB', 'permission_audit_log', str(e)[:50])

# ─────────────────────────────────────────────────────
# [4] 보안 (인증 검증)
# ─────────────────────────────────────────────────────
print("\n🔐 [4] 보안 점검 (인증 검증)")
print("-" * 70)

protected_routes = {
    '사용자관리': '/admin/auth/settings',
    '보안설정': '/admin/auth/security-policy',
    '파일관리': '/admin/auth/file-management',
}

with app.test_client() as client:
    # 인증 없이 접근 시도
    for name, url in protected_routes.items():
        try:
            r = client.get(url, follow_redirects=False)
            if r.status_code in (302, 403):
                log_result('PASS', '보안', f'{name} 보호', f'Status {r.status_code}')
            else:
                log_result('FAIL', '보안', f'{name} 보호', f'Status {r.status_code} (우회 가능)')
        except Exception as e:
            log_result('FAIL', '보안', name, str(e)[:50])

# ─────────────────────────────────────────────────────
# [5] 성능
# ─────────────────────────────────────────────────────
print("\n⚡ [5] 성능 점검")
print("-" * 70)

import time

with app.test_client() as client:
    seed_admin_session(client)
    
    perf_routes = {
        '사용자목록': '/admin/auth/settings',
        '보안설정': '/admin/auth/security-policy',
        '문구목록': '/api/info-messages',
    }
    
    for name, url in perf_routes.items():
        try:
            start = time.time()
            r = client.get(url)
            elapsed_ms = (time.time() - start) * 1000
            
            if elapsed_ms < 500:
                log_result('PASS', '성능', name, f'{elapsed_ms:.0f}ms ✓')
            elif elapsed_ms < 1000:
                log_result('WARN', '성능', name, f'{elapsed_ms:.0f}ms (약간 느림)')
            else:
                log_result('FAIL', '성능', name, f'{elapsed_ms:.0f}ms (느림)')
        except Exception as e:
            log_result('FAIL', '성능', name, str(e)[:50])

# ─────────────────────────────────────────────────────
# [6] 404 에러 처리
# ─────────────────────────────────────────────────────
print("\n🔍 [6] 에러 처리")
print("-" * 70)

with app.test_client() as client:
    r = client.get('/nonexistent')
    if r.status_code == 404:
        log_result('PASS', '에러처리', '404 응답', '정상')
    else:
        log_result('WARN', '에러처리', '404 응답', f'Status {r.status_code}')

# ─────────────────────────────────────────────────────
# 최종 보고서
# ─────────────────────────────────────────────────────
print("\n" + "="*70)
print("📊 최종 점검 결과")
print("="*70)

total = sum(results['summary'].values())
print(f"""
✅ PASS:  {results['summary']['PASS']:3d} / {total}
⚠️  WARN:  {results['summary']['WARN']:3d} / {total}
❌ FAIL:  {results['summary']['FAIL']:3d} / {total}

배포 준비도: {'✅ 승인 가능' if results['summary']['FAIL'] == 0 else '❌ 수정 필요'}
""")

print("\n" + "="*70)
print(json.dumps(results, indent=2, ensure_ascii=False))
print("="*70)
print("\n✨ QA 점검 완료\n")

sys.exit(0 if results['summary']['FAIL'] == 0 else 1)

"""Diagnose MFA login flow - full test with correct password."""
import sys, os
sys.path.insert(0, '.')
os.environ.setdefault('FLASK_ENV', 'development')

results = []

from app import create_app
app = create_app()

# Set a known password for ADMIN
with app.app_context():
    from app.models import AuthUser, db
    u = AuthUser.query.filter_by(emp_no='ADMIN').first()
    if u:
        u.set_password('TestMFA1!')
        db.session.commit()
        results.append('PW_SET: TestMFA1!')
    else:
        results.append('ADMIN_NOT_FOUND')

with app.test_client() as c:
    # Step 1: Login via AJAX
    r1 = c.post('/login',
                data={'employee_id': 'ADMIN', 'password': 'TestMFA1!'},
                headers={'X-Requested-With': 'XMLHttpRequest'})
    ct1 = r1.content_type or ''
    body1 = r1.data.decode('utf-8', 'replace')
    results.append(f'S1_STATUS: {r1.status_code}')
    results.append(f'S1_CT: {ct1}')
    results.append(f'S1_JSON: {"json" in ct1}')
    if 'json' in ct1:
        import json
        d1 = json.loads(body1)
        results.append(f'S1_BODY: {d1}')
    else:
        results.append(f'S1_HTML_LEN: {len(body1)}')
        if 'data-required="true"' in body1:
            results.append('S1_MFA_REQUIRED_IN_HTML')
        if '비밀번호' in body1:
            results.append('S1_HAS_PW_ERROR')
    
    # Step 2: Get MFA status (same session)
    r2 = c.get('/api/mfa/status')
    body2 = r2.data.decode('utf-8', 'replace')
    results.append(f'S2_STATUS: {r2.status_code}')
    results.append(f'S2_CT: {r2.content_type}')
    results.append(f'S2_BODY: {body2[:200]}')

    # Step 3: Send MFA code (same session)
    r3 = c.post('/api/mfa/send-code',
                json={'emp_no': 'ADMIN', 'mfa_type': 'email'},
                headers={'Content-Type': 'application/json'})
    body3 = r3.data.decode('utf-8', 'replace')
    results.append(f'S3_STATUS: {r3.status_code}')
    results.append(f'S3_CT: {r3.content_type}')
    if 'json' in (r3.content_type or ''):
        results.append(f'S3_BODY: {body3[:300]}')
    else:
        results.append(f'S3_HTML_FRAG: {body3[:200]}')

with open('_diag_mfa_out.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(results))
print('DONE')

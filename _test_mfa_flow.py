import sys, os, traceback
sys.path.insert(0, '.')
os.environ.setdefault('FLASK_ENV', 'development')
from app import create_app
app = create_app()

try:
    with app.test_client() as c:
        # Login + MFA
        c.post('/login', data={'employee_id':'ADMIN','password':'Admin1234!'},
               headers={'X-Requested-With':'XMLHttpRequest'})
        c.post('/api/mfa/send-code', json={'emp_no':'ADMIN','mfa_type':'email'})
        with app.app_context():
            from app.models import MfaPendingCode
            p = MfaPendingCode.query.filter_by(emp_no='ADMIN', used=False).order_by(MfaPendingCode.created_at.desc()).first()
            code = p.code if p else None
        if code:
            c.post('/api/mfa/verify', json={'emp_no':'ADMIN','code':code,'mfa_type':'email'})
        
        # Step 1: Initial dashboard GET (browser navigate)
        r1 = c.get('/dashboard')
        print('SHELL status:', r1.status_code)
        h1 = r1.data.decode('utf-8', errors='replace')
        print('SHELL has main[data-spa-boot]:', 'data-spa-boot' in h1)
        
        # Step 2: SPA fetch (blossom.js boot)
        r2 = c.get('/dashboard', headers={'X-Requested-With': 'blossom-spa'})
        print('SPA status:', r2.status_code)
        h2 = r2.data.decode('utf-8', errors='replace')
        print('SPA has <main class="main-content">:', '<main class="main-content">' in h2)
        print('SPA has dashboard-sections:', 'dashboard-sections' in h2)
        print('SPA has login-form:', 'login-form' in h2)
        print('SPA has redirect:', r2.status_code == 302)
        
        # Check if content-type is correct
        print('SPA content-type:', r2.content_type)
        
        # Show first 300 chars of SPA body
        print('SPA preview:', h2[:300])
except Exception as e:
    print('ERROR:', e)
    traceback.print_exc()

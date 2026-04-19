#!/usr/bin/env python3
"""Verify deployed auth code-policy on production server"""
import sys, os
sys.path.insert(0, '/opt/blossom/web')
os.chdir('/opt/blossom/web')
from app import create_app
app = create_app()

with app.test_client() as c:
    rv = c.post('/login', data={'employee_id':'admin','password':'admin1234!'}, follow_redirects=True)
    html0 = rv.data.decode('utf-8','replace')
    logged = 'dashboard' in html0.lower() or 'blossom' in html0.lower()
    print('LOGIN:', 'OK' if logged else 'CHECK')

    r = c.get('/admin/settings')
    if r.status_code == 302:
        r = c.get(r.headers.get('Location',''), follow_redirects=True)
    html = r.data.decode('utf-8','replace')
    print('PAGE:', r.status_code)
    print('CODE_POLICY_CARD:', 'id="code-policy-card"' in html)
    print('COL_STACK:', 'settings-col-stack' in html)
    print('SMS_CARD:', 'id="sms-settings-card"' in html)
    print('OTP_CARD:', 'id="company-otp-settings-card"' in html)

    ix_sms = html.find('id="sms-settings-card"')
    ix_cp = html.find('id="code-policy-card"')
    ix_otp = html.find('id="company-otp-settings-card"')
    print('ORDER: sms=%d cp=%d otp=%d' % (ix_sms, ix_cp, ix_otp))

    r2 = c.get('/admin/auth/mfa/config')
    print('MFA_GET:', r2.status_code)
    if r2.status_code == 200:
        d = r2.get_json()
        if d:
            for k in ['code_length','code_ttl_seconds','resend_wait_seconds','max_daily_attempts','max_fail_count']:
                print('  %s=%s' % (k, d.get(k)))

    r3 = c.put('/admin/auth/mfa/config', json={'resend_wait_seconds':90,'max_daily_attempts':15,'max_fail_count':3})
    print('MFA_PUT:', r3.status_code)

    r4 = c.get('/admin/auth/mfa/config')
    if r4.status_code == 200:
        d4 = r4.get_json()
        if d4:
            print('AFTER:')
            for k in ['resend_wait_seconds','max_daily_attempts','max_fail_count']:
                print('  %s=%s' % (k, d4.get(k)))
print('DONE')

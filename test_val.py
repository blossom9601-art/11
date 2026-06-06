import os, sys
print("--- JS Syntax Check ---")
js = ["static/js/modules/software/pages/software.page.js", "static/js/modules/hardware/pages/hardware.page.js", "static/js/modules/vendor/pages/vendor.page.js", "static/js/modules/customer/pages/customer.page.js", "static/js/modules/company/pages/company.page.js", "static/js/modules/facility-security/pages/facility-security.page.js", "static/js/shared/components/management-page.js"]
hw = "static/js/modules/hardware"
if os.path.exists(hw):
    for r, d, fs in os.walk(hw):
        for f in fs:
            if f.endswith(".js"): js.append(os.path.join(r, f))
for f in set(js):
    if os.path.exists(f):
        if os.system(f"node --check {f}") != 0: print(f"FAIL Syntax: {f}")
    else: print(f"SKIP: {f}")
print("\n--- U+FFFD Check ---")
t = ["app/templates/9.category/9-4.component/9-4-8.facility_security/1.facility_security_list.html", "app/templates/9.category/9-5.company/9-5-1.company/1.company_list.html"]
for p in (js[:7] + t):
    if os.path.exists(p):
        with open(p, 'r', encoding='utf-8', errors='replace') as f:
            if '\ufffd' in f.read(): print(f"FAIL U+FFFD: {p}")
            else: print(f"PASS: {p}")
print("\n--- Flask Route Check ---")
try:
    from app import create_app
    app = create_app(); client = app.test_client()
    with client.session_transaction() as s:
        s['user_id']=1; s['role']='ADMIN'; s['_fresh']=True
    targets = [("/b/cat_sw_os", "software-management-root", "20260517_sw_bootfix1"), ("/b/cat_hw_server", "hardware-management-root", "20260517_hw_bootfix1"), ("/b/cat_vendor_manufacturer", "vendor-management-root", "20260517_vendor_bootfix1"), ("/b/cat_customer_client1", "customer-management-root", "20260517_customer_bootfix1"), ("/b/cat_company_company", "company-management-root", "20260517_company_bootfix1"), ("/b/cat_facility_security", "facility-security-management-root", "20260517_facility_security_bootfix1")]
    for u, r, v in targets:
        res = client.get(u)
        if res.status_code == 404: print(f"URL {u}: 404")
        else:
            txt = res.get_data(as_text=True)
            ok = "PASS" if (r in txt and v in txt) else "FAIL"
            print(f"URL {u}: {ok} ({res.status_code}, Root:{r in txt}, Ver:{v in txt})")
except Exception as e: print(f"Error: {e}")

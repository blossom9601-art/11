import re
import sys

text = open("app/routes/api.py", encoding="utf-8").read()
routes = re.findall(r"@\w+\.route\([\"'](.*?)[\"']", text)

hw_kw = ["onpremis","cloud","storage","san","/l2","/l4","/l7","/ap","firewall","/ids","/ips","/hsm","/kms","wips","dedicat"]
hw = [r for r in routes if any(k in r for k in hw_kw)]
print("=== HW routes in api.py ===")
for r in hw:
    print(" ", r)

gov_kw = ["ip-polic","vpn-line","leased","unused","data-delet","backup","vulnerability","package-vuln"]
gov = [r for r in routes if any(k in r for k in gov_kw)]
print("\n=== Gov/Backup routes in api.py ===")
for r in gov:
    print(" ", r)

cost_kw = ["cost","opex","capex","cmp-cpu"]
cost = [r for r in routes if any(k in r for k in cost_kw)]
print("\n=== Cost/CMP routes in api.py ===")
for r in cost:
    print(" ", r)

prj_kw = ["prj","ticket","project"]
prj = [r for r in routes if any(k in r for k in prj_kw)]
print("\n=== Project/Ticket routes ===")
for r in prj:
    print(" ", r)

access_kw = ["access","permission"]
acc = [r for r in routes if any(k in r for k in access_kw)]
print("\n=== Access/Permission routes ===")
for r in acc:
    print(" ", r)

print(f"\nTotal routes: {len(routes)}")

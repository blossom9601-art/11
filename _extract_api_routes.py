import re

content = open("app/routes/api.py", encoding="utf-8").read()

# Extract all @api_bp.route(...) paths
routes = re.findall(r"@api_bp\.route\s*\(\s*['\"]([^'\"]+)['\"]", content)

print(f"Total routes: {len(routes)}")

# Categorize
cats = {
    'hw': [r for r in routes if '/hw' in r or 'onpremise' in r or 'firewall' in r
           or 'security-' in r or '/san' in r or '/l2' in r or '/l4' in r],
    'backup': [r for r in routes if 'backup' in r],
    'cost': [r for r in routes if '/cost' in r or 'opex' in r or 'capex' in r],
    'ip': [r for r in routes if '/ip' in r],
    'vpn': [r for r in routes if '/vpn' in r or 'leased' in r],
    'project': [r for r in routes if '/prj' in r or '/project' in r or '/ticket' in r],
    'dc': [r for r in routes if '/dc' in r or '/rack' in r or 'access' in r or 'thermom' in r or 'erasure' in r or 'deletion' in r],
    'vendor': [r for r in routes if 'vendor' in r or 'manufactur' in r or 'maintenan' in r],
    'org': [r for r in routes if '/org' in r],
    'auth': [r for r in routes if '/auth' in r or '/login' in r],
}

for cat, rlist in cats.items():
    print(f"\n=== {cat.upper()} ({len(rlist)}) ===")
    for r in sorted(set(rlist))[:40]:
        print(f"  {r}")

# All unique routes sorted
print(f"\n\n=== ALL ROUTES ({len(routes)}) ===")
for r in sorted(set(routes)):
    print(r)

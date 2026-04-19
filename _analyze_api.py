import re

with open('app/routes/api.py', encoding='utf-8') as f:
    text = f.read()

routes = re.findall(r"@api_bp\.route\('(/api/[^']+)',\s*methods=\['(\w+)'\]\)", text)
print(f'Total route decorators in api.py: {len(routes)}')

# group by base path
bases = {}
for path, method in routes:
    base = re.sub(r'/bulk-delete$|/bulk-update$|/bulk-create$|/bulk-duplicate$|/batch-clear$|/batch-restore$', '', path)
    base = re.sub(r'/<[^>]+>.*$', '', base)
    base = base.rstrip('/')
    if base not in bases:
        bases[base] = set()
    bases[base].add(method)

full_crud = []
partial = []
get_only = []
for base in sorted(bases):
    m = bases[base]
    if 'GET' in m and 'POST' in m and 'PUT' in m:
        full_crud.append(f'  {base} [{",".join(sorted(m))}]')
    elif m == {'GET'}:
        get_only.append(base)
    else:
        partial.append(f'  {base} [{",".join(sorted(m))}]')

print(f'\n=== FULL CRUD (GET+POST+PUT) ({len(full_crud)}) ===')
for x in full_crud:
    print(x)
print(f'\n=== PARTIAL (not GET-only, missing ops) ({len(partial)}) ===')
for x in partial:
    print(x)
print(f'\n=== GET-ONLY ({len(get_only)}) ===')
for x in get_only:
    print(f'  {x}')

# Count bulk-delete endpoints
bd = [p for p, m in routes if 'bulk-delete' in p]
print(f'\n=== BULK-DELETE endpoints: {len(bd)} ===')

# Method distribution
from collections import Counter
mc = Counter(m for _, m in routes)
print(f'\n=== METHOD DISTRIBUTION ===')
for m, c in mc.most_common():
    print(f'  {m}: {c}')

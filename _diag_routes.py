import re

with open('app/routes/api.py', encoding='utf-8') as f:
    content = f.read()

routes = re.findall(r"@api_bp\.route\('([^']+)'", content)

targets = [
    ('governance/vpn-lines', '거버넌스>VPN정책'),
    ('datacenter/rack/list', '데이터센터>RACK'),
    ('cost/opex', '비용>OPEX'),
    ('cost/capex', '비용>CAPEX'),
    ('opex-dashboard', 'OPEX대시보드'),
    ('capex-dashboard', 'CAPEX대시보드'),
    ('workflow/tickets', '워크플로우 티켓'),
    ('workflow/templates', '워크플로우 템플릿'),
    ('insight/info-items', '기술자료'),
    ('category/business/divisions', '카테고리>비즈니스'),
    ('category/hw/network-types', '카테고리>하드웨어'),
    ('category/sw/os-types', '카테고리>소프트웨어'),
    ('category/components/cpu-types', '카테고리>컴포넌트'),
    ('org/centers', '카테고리>회사'),
    ('category/customers', '카테고리>고객'),
    ('vendor-maintenance', '벤더유지보수'),
    ('session/me', '세션me'),
    ('session/permissions', '세션권한'),
]

for path, label in targets:
    matched = [r for r in routes if path in r]
    if matched:
        print(f"OK  [{label}] -> {matched[:2]}")
    else:
        print(f"404 [{label}] *** NOT FOUND *** (searched: {path})")

print()
print("=== 실제 등록된 유사 경로 ===")
# 비슷한 경로 찾기
keywords = ['rack', 'opex', 'capex', 'workflow', 'info-item', 'division', 'network-type', 'os-type', 'cpu-type', 'center', 'customer', 'vendor', 'session']
for kw in keywords:
    matched = [r for r in routes if kw in r]
    if matched:
        print(f"[{kw}]: {matched[:3]}")

"""Windows 인터페이스 수집기 테스트 스크립트"""
import sys
import os
import json

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'agents'))
os.chdir(os.path.join(os.path.dirname(__file__), '..', 'agents'))

from windows.collectors.interface import InterfaceCollector

col = InterfaceCollector()
results = col.collect()

print(f"=== 수집된 인터페이스: {len(results)}건 ===\n")
for i, r in enumerate(results):
    iface = r.get("iface", "")
    serial = r.get("serial", "")
    slot = r.get("slot", "")
    port = r.get("port", "")
    remark = r.get("remark", "")
    ips = r.get("ip_addresses", [])

    print(f"[{i+1}] 인터페이스(iface): {iface}")
    print(f"    UUID(serial):       {serial}")
    print(f"    슬롯(slot):         {slot}")
    print(f"    포트(port):         {port}")
    print(f"    비고(remark):       {remark}")
    for ip in ips:
        print(f"    IP: {ip.get('ip_address', '')} ({ip.get('protocol', '')})")
    print()

# UUID 채워짐 여부 확인
empty_uuid = [r for r in results if not r.get("serial")]
if empty_uuid:
    print(f"[경고] UUID 미수집 NIC {len(empty_uuid)}건:")
    for r in empty_uuid:
        print(f"  - {r.get('iface', '?')}")
else:
    print("[OK] 모든 인터페이스에 UUID 수집 완료")

empty_iface = [r for r in results if not r.get("iface")]
if empty_iface:
    print(f"[경고] 인터페이스명 미수집 {len(empty_iface)}건")
else:
    print("[OK] 모든 인터페이스에 이름 수집 완료")

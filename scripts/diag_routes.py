"""Standalone route enumeration to verify which Flask app code is loaded.

Usage (PowerShell):
  python scripts/diag_routes.py

It does NOT start the server; it just imports create_app and dumps url_map.
If the diagnostic routes (/__diag__ping, /__routes, /debug/routes) are missing here,
the source code on disk is different from what the running server uses.
"""

import sys
from pathlib import Path
import os

# Ensure project root is on sys.path (robust against working dir issues)
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

try:
    from app import create_app  # type: ignore
except Exception as e:
    print("[diag] create_app import 실패:", e)
    print("[diag] sys.path=", sys.path)
    print("[diag] ROOT exists=", ROOT.exists(), "content sample=", list(ROOT.iterdir())[:10])
    sys.exit(2)

app = create_app()

rules_info = []
for r in app.url_map.iter_rules():
    rules_info.append((str(r), r.endpoint, sorted(list(r.methods))))

print("[diag] 총 라우트 수:", len(rules_info))
print("[diag] 상위 50개:")
for i, item in enumerate(rules_info[:50], 1):
    print(f"  {i:02d}. {item[0]} -> {item[1]} methods={item[2]}")

needed = {"/__diag__ping", "/__routes", "/debug/routes", "/login"}
present = {r[0] for r in rules_info}
missing = needed - present
if missing:
    print("[diag][WARN] 필수 진단 라우트 누락:", missing)
else:
    print("[diag][OK] 모든 필수 진단 라우트 존재:", needed)

print("[diag] 완료")
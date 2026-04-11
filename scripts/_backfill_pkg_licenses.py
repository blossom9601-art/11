"""기존 asset_package 레코드에 라이선스 정보를 일괄 채우기 (반복 실행 가능)"""
import json, os, sqlite3

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(SCRIPT_DIR, "..")
DB_PATH = os.path.join(ROOT, "instance", "dev_blossom.db")
MAP_PATH = os.path.join(ROOT, "sbom", "package_licenses.json")

# sbom/package_licenses.json 로드
with open(MAP_PATH, encoding="utf-8") as f:
    _map = json.load(f)
pkg_map = {k.lower(): v for k, v in _map.get("packages", {}).items()}
vendor_list = [(k.lower(), v) for k, v in _map.get("vendors", {}).items()]


def infer(pkg_name, vendor):
    low = pkg_name.lower().strip()
    if low in pkg_map:
        return pkg_map[low]
    for key, lic in pkg_map.items():
        if low.startswith(key):
            return lic
    low_v = (vendor or "").lower().strip()
    if low_v:
        for pat, lic in vendor_list:
            if pat in low_v:
                return lic
    return ""

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row

rows = conn.execute(
    "SELECT id, package_name, vendor, license FROM asset_package "
    "WHERE is_deleted = 0 AND (license IS NULL OR license = '')"
).fetchall()

print(f"라이선스 없는 패키지: {len(rows)}개")
updated = 0

for r in rows:
    pkg_name = r["package_name"] or ""
    vendor = r["vendor"] or ""
    lic = infer(pkg_name, vendor)
    if lic:
        conn.execute(
            "UPDATE asset_package SET license = ?, updated_at = datetime('now') WHERE id = ?",
            (lic, r["id"]),
        )
        updated += 1
        print(f"  [OK] {pkg_name:50s} → {lic}")
    else:
        print(f"  [--] {pkg_name:50s}   (매핑 없음)")

conn.commit()
conn.close()

print(f"\n완료: {updated}/{len(rows)}개 업데이트")

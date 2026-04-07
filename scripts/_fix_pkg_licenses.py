"""기존 PIP 패키지의 라이선스 정보를 importlib.metadata + SPDX로 채우기"""
import json
import os
import sqlite3
from importlib.metadata import distributions

# SPDX 매핑 로드
spdx_path = os.path.join(os.path.dirname(__file__), "..", "static", "licenses.json")
spdx_map = {}
with open(spdx_path, encoding="utf-8") as f:
    data = json.load(f)
for lic in data.get("licenses", []):
    lid = lic.get("licenseId", "")
    name = lic.get("name", "")
    if lid:
        spdx_map[lid.lower()] = lid
    if name:
        spdx_map[name.lower()] = lid

_aliases = {
    "bsd": "BSD-2-Clause", "bsd license": "BSD-2-Clause",
    "bsd-2": "BSD-2-Clause", "bsd-3": "BSD-3-Clause",
    "mit license": "MIT", "apache 2.0": "Apache-2.0",
    "apache license 2.0": "Apache-2.0", "apache license, version 2.0": "Apache-2.0",
    "apache software license": "Apache-2.0",
    "gpl": "GPL-2.0-only", "gplv2": "GPL-2.0-only", "gplv3": "GPL-3.0-only",
    "lgpl": "LGPL-2.1-only", "public domain": "Unlicense",
    "isc license": "ISC", "isc": "ISC",
    "psf": "PSF-2.0", "python software foundation license": "PSF-2.0",
    "mpl 2.0": "MPL-2.0", "mpl-2.0": "MPL-2.0",
    "mozilla public license 2.0": "MPL-2.0",
}

def normalize(raw):
    s = raw.strip()
    if not s or s.upper() == "UNKNOWN":
        return ""
    low = s.lower()
    if low in spdx_map:
        return spdx_map[low]
    if low in _aliases:
        return _aliases[low]
    return s

# importlib.metadata에서 라이선스 매핑 수집
license_map = {}
for dist in distributions():
    name = dist.metadata.get("Name", "")
    lic = dist.metadata.get("License", "") or ""
    if name and lic and lic.upper() != "UNKNOWN":
        normalized = normalize(lic.strip())
        if normalized:
            license_map[name.lower()] = normalized

print(f"Found {len(license_map)} packages with license info from importlib.metadata")

# DB 업데이트
conn = sqlite3.connect("instance/dev_blossom.db")
conn.row_factory = sqlite3.Row

rows = conn.execute(
    "SELECT id, package_name, package_type, license FROM asset_package WHERE is_deleted = 0"
).fetchall()

updated = 0
for r in rows:
    pkg_name = r["package_name"]
    current_lic = r["license"] or ""
    pkg_type = r["package_type"] or ""
    
    # PIP 패키지면 importlib.metadata에서 가져오기
    if pkg_type == "PIP" and not current_lic:
        new_lic = license_map.get(pkg_name.lower(), "")
        if new_lic:
            conn.execute("UPDATE asset_package SET license = ? WHERE id = ?", (new_lic, r["id"]))
            print(f"  {pkg_name}: '' -> '{new_lic}'")
            updated += 1
    # 기존 라이선스가 있으면 SPDX 정규화
    elif current_lic:
        new_lic = normalize(current_lic)
        if new_lic != current_lic:
            conn.execute("UPDATE asset_package SET license = ? WHERE id = ?", (new_lic, r["id"]))
            print(f"  {pkg_name}: '{current_lic}' -> '{new_lic}'")
            updated += 1

conn.commit()
conn.close()
print(f"Updated {updated} rows")

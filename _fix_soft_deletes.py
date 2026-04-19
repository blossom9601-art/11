"""soft_delete 함수에서 DELETE FROM을 UPDATE is_deleted=1로 일괄 교체합니다."""
import re
from pathlib import Path

SERVICE_DIR = Path("app/services")

# 수정 대상 파일 목록 (이미 수정된 것 제외)
already_fixed = {
    "cmp_disk_type_service.py",
    "cmp_etc_type_service.py",
    "cmp_gpu_type_service.py",
    "cmp_hba_type_service.py",
    "cmp_memory_type_service.py",
    "cmp_nic_type_service.py",
    "cmp_cpu_type_service.py",
    "sw_db_type_service.py",
    "sw_high_availability_type_service.py",
    "sw_middleware_type_service.py",
    "sw_os_type_service.py",
    "sw_security_type_service.py",
    "sw_virtual_type_service.py",
    "org_center_service.py",
}

# 패턴: soft_delete 함수 내의 DELETE FROM ... WHERE id IN
# 4-space indent 버전
PATTERN_SPACES = re.compile(
    r'(    )with _get_connection\(app\) as conn:\n'
    r'(    )(    )cur = conn\.execute\(\n'
    r'(    )(    )(    )f"DELETE FROM \{TABLE_NAME\} WHERE id IN \(\{placeholders\}\)",\n'
    r'(    )(    )(    )safe_ids,\n'
    r'(    )(    )\)\n'
    r'(    )(    )conn\.commit\(\)\n'
    r'(    )(    )return cur\.rowcount',
    re.MULTILINE,
)

REPLACEMENT_SPACES = (
    '    now = _now()\n'
    '    with _get_connection(app) as conn:\n'
    '        cur = conn.execute(\n'
    '            f"UPDATE {TABLE_NAME} SET is_deleted = 1, updated_at = ?, updated_by = ? WHERE id IN ({placeholders})",\n'
    '            [now, actor] + safe_ids,\n'
    '        )\n'
    '        conn.commit()\n'
    '        return cur.rowcount'
)

# Tab indent 버전
PATTERN_TABS = re.compile(
    r'(\t)with _get_connection\(app\) as conn:\n'
    r'(\t)(\t)cur = conn\.execute\(\n'
    r'(\t)(\t)(\t)f"DELETE FROM \{TABLE_NAME\} WHERE id IN \(\{placeholders\}\)",\n'
    r'(\t)(\t)(\t)safe_ids,\n'
    r'(\t)(\t)\)\n'
    r'(\t)(\t)conn\.commit\(\)\n'
    r'(\t)(\t)return cur\.rowcount',
    re.MULTILINE,
)

REPLACEMENT_TABS = (
    '\tnow = _now()\n'
    '\twith _get_connection(app) as conn:\n'
    '\t\tcur = conn.execute(\n'
    '\t\t\tf"UPDATE {TABLE_NAME} SET is_deleted = 1, updated_at = ?, updated_by = ? WHERE id IN ({placeholders})",\n'
    '\t\t\t[now, actor] + safe_ids,\n'
    '\t\t)\n'
    '\t\tconn.commit()\n'
    '\t\treturn cur.rowcount'
)

fixed = []
skipped = []
no_match = []

for pyfile in sorted(SERVICE_DIR.glob("*.py")):
    if pyfile.name in already_fixed:
        continue
    
    content = pyfile.read_text(encoding="utf-8")
    
    if 'DELETE FROM {TABLE_NAME} WHERE id IN' not in content:
        continue
    
    # Check if it's in a soft_delete function
    if 'def soft_delete' not in content:
        skipped.append(pyfile.name)
        continue
    
    new_content = content
    count = 0
    
    # Try space indent first
    if PATTERN_SPACES.search(new_content):
        new_content, n = PATTERN_SPACES.subn(REPLACEMENT_SPACES, new_content)
        count += n
    
    # Try tab indent
    if PATTERN_TABS.search(new_content):
        new_content, n = PATTERN_TABS.subn(REPLACEMENT_TABS, new_content)
        count += n
    
    if count > 0:
        pyfile.write_text(new_content, encoding="utf-8")
        fixed.append(f"{pyfile.name} ({count} replacements)")
    else:
        no_match.append(pyfile.name)

print(f"Fixed: {len(fixed)}")
for f in fixed:
    print(f"  {f}")

if skipped:
    print(f"\nSkipped (DELETE but no soft_delete func): {len(skipped)}")
    for s in skipped:
        print(f"  {s}")

if no_match:
    print(f"\nPattern not matched (may need manual fix): {len(no_match)}")
    for n in no_match:
        print(n)

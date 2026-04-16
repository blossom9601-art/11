"""원격 서버(192.168.56.108)에 CRUD 정상화 파일 배포 + 검증"""
import paramiko
from pathlib import Path

ROOT = Path(r"c:\Users\ME\Desktop\blossom")
HOST = "192.168.56.108"
USER = "root"
PASSWORD = "123456"
REMOTE_BASE = "/opt/blossom/web"

# 배포 대상 파일 (로컬 상대경로)
DEPLOY_FILES = [
    "app/services/cmp_etc_type_service.py",
    "app/services/hw_security_type_service.py",
    "app/services/hw_san_type_service.py",
    "app/services/hw_network_type_service.py",
    "app/services/hw_storage_type_service.py",
    # 이전 세션에서 hard delete로 전환한 모든 서비스 파일
    "app/services/hw_server_type_service.py",
    "app/services/sw_os_type_service.py",
    "app/services/sw_db_type_service.py",
    "app/services/sw_middleware_type_service.py",
    "app/services/sw_virtual_type_service.py",
    "app/services/sw_security_type_service.py",
    "app/services/sw_high_availability_type_service.py",
    "app/services/cmp_cpu_type_service.py",
    "app/services/cmp_gpu_type_service.py",
    "app/services/cmp_memory_type_service.py",
    "app/services/cmp_disk_type_service.py",
    "app/services/cmp_nic_type_service.py",
    "app/services/cmp_hba_type_service.py",
    "app/services/work_category_service.py",
    "app/services/work_division_service.py",
    "app/services/work_status_service.py",
    "app/services/work_operation_service.py",
    "app/services/work_group_service.py",
    "app/services/org_company_service.py",
    "app/services/org_department_service.py",
    "app/services/org_center_service.py",
    "app/services/org_rack_service.py",
    "app/services/org_thermometer_service.py",
    "app/services/org_cctv_service.py",
    "app/services/customer_member_service.py",
    "app/services/customer_associate_service.py",
    "app/services/customer_client_service.py",
    "app/services/vendor_manufacturer_service.py",
    "app/services/vendor_maintenance_service.py",
    "app/services/vendor_manufacturer_software_service.py",
    "app/services/vendor_maintenance_software_service.py",
    # 대시보드 서비스
    "app/services/category_dashboard_service.py",
]

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD, timeout=20)

# 1) 파일 업로드
sftp = ssh.open_sftp()
uploaded = 0
for rel in DEPLOY_FILES:
    local = ROOT / rel
    remote = f"{REMOTE_BASE}/{rel}"
    try:
        sftp.put(str(local), remote)
        print(f"  PUT {rel}")
        uploaded += 1
    except Exception as e:
        print(f"  FAIL {rel}: {e}")
sftp.close()
print(f"\n업로드 완료: {uploaded}/{len(DEPLOY_FILES)} 파일")

# 2) 서비스 재시작
print("\n서비스 재시작...")
for cmd in [
    "systemctl restart blossom-web",
    "sleep 3",
    "systemctl is-active blossom-web",
]:
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=60)
    out = stdout.read().decode("utf-8", "ignore").strip()
    err = stderr.read().decode("utf-8", "ignore").strip()
    if out:
        print(f"  {cmd} -> {out}")
    if err:
        print(f"  {cmd} ERR: {err}")

# 3) 원격 DB 잔여 테스트 데이터 정리
print("\n원격 DB 잔여 데이터 정리...")
CLEANUP_CMD = r"""python3 -c "
import sqlite3
db = '/opt/blossom/web/instance/dev_blossom.db'
conn = sqlite3.connect(db)
tables = ['hw_server_type','hw_storage_type','hw_san_type','hw_network_type','hw_security_type']
for t in tables:
    try:
        n = conn.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]
        if n > 0:
            conn.execute(f'DELETE FROM {t}')
            print(f'{t}: {n} -> 0')
        else:
            print(f'{t}: 0 (clean)')
    except Exception as e:
        print(f'{t}: ERROR {e}')
conn.commit()
conn.close()
"
"""
stdin, stdout, stderr = ssh.exec_command(CLEANUP_CMD, timeout=30)
print(stdout.read().decode("utf-8", "ignore").strip())
err = stderr.read().decode("utf-8", "ignore").strip()
if err:
    print(f"CLEANUP ERR: {err}")

# 4) 대시보드 API 검증
print("\n대시보드 API 검증...")
API_CMD = r"""curl -k -s https://127.0.0.1/api/category/hw-dashboard | python3 -c "
import sys, json
data = json.load(sys.stdin)
s = data.get('summary', {})
print(f'summary_total={s.get(\"total\",\"?\")}')
for k, v in data.get('sections', {}).items():
    print(f'  {k}: total={v.get(\"total\",\"?\")}')
"
"""
stdin, stdout, stderr = ssh.exec_command(API_CMD, timeout=30)
out = stdout.read().decode("utf-8", "ignore").strip()
print(out)
err = stderr.read().decode("utf-8", "ignore").strip()
if err:
    print(f"API ERR: {err}")

ssh.close()
print("\n배포 완료!")

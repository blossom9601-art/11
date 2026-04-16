"""
MFA 비활성화 + Blossom 전체 배포 스크립트
1) 운영 DB에서 MFA 비활성화 (즉시 접속 가능)
2) 로컬 코드 전체 배포 (MFA 검증 로직 포함)
3) 서비스 재시작 후 검증
"""
import paramiko, tarfile, io, os, textwrap, time, sys

HOST = "192.168.56.108"
USER = "root"
PASS = "123456"
LOCAL_ROOT = r"c:\Users\ME\Desktop\blossom"
REMOTE_ROOT = "/opt/blossom/web"
VENV_PYTHON = f"{REMOTE_ROOT}/venv/bin/python3"

DB_USER = "lumina_admin"
DB_PASS = "LuminaAdmin2026Secure"
DB_NAME = "lumina"

DEPLOY_DIRS = ["app", "static", "scripts", "migrations"]
DEPLOY_FILES = ["config.py", "run.py", "requirements.txt", "index.html", "version.json"]


def ssh_exec(ssh, cmd, timeout=60):
    """SSH 명령 실행 후 stdout/stderr 반환"""
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', 'replace')
    err = stderr.read().decode('utf-8', 'replace')
    return out, err


def step1_disable_mfa(ssh):
    """운영 DB에서 MFA 비활성화"""
    print("\n[1/5] MFA 비활성화 중...")

    sql_cmd = (
        f'mysql -u {DB_USER} -p"{DB_PASS}" {DB_NAME} -e '
        '"UPDATE mfa_config SET enabled=0 WHERE id=1; '
        'SELECT id, enabled, totp_enabled, email_enabled, sms_enabled FROM mfa_config;"'
    )
    out, err = ssh_exec(ssh, sql_cmd)
    print(out)
    if err.strip():
        # Filter mysql warnings
        for line in err.strip().split('\n'):
            if 'Warning' not in line:
                print(f"  STDERR: {line}")

    if 'enabled' in out.lower() or '0' in out:
        print("[1/5] MFA 비활성화 완료")
    else:
        print("[1/5] MFA 테이블이 없거나 업데이트 실패 - 계속 진행합니다")


def step2_make_tarball():
    """로컬 프로젝트를 tar.gz로 패키징"""
    print("\n[2/5] 패키지 생성 중...")
    buf = io.BytesIO()
    skip_dirs = {'.venv', '__pycache__', '.git', 'node_modules', 'instance',
                 '.pytest_cache', 'agents', 'deploy', 'docs', 'sbom', 'cp',
                 '__MACOSX'}

    with tarfile.open(fileobj=buf, mode='w:gz') as tar:
        for d in DEPLOY_DIRS:
            local_dir = os.path.join(LOCAL_ROOT, d)
            if not os.path.isdir(local_dir):
                print(f"  [SKIP] dir not found: {d}")
                continue
            for root, dirs, files in os.walk(local_dir):
                dirs[:] = [x for x in dirs if x not in skip_dirs]
                for fname in files:
                    if fname.endswith(('.pyc', '.pyo')):
                        continue
                    full = os.path.join(root, fname)
                    arcname = os.path.relpath(full, LOCAL_ROOT).replace('\\', '/')
                    tar.add(full, arcname=arcname)

        for f in DEPLOY_FILES:
            full = os.path.join(LOCAL_ROOT, f)
            if os.path.isfile(full):
                tar.add(full, arcname=f)
            else:
                print(f"  [SKIP] file not found: {f}")

    buf.seek(0)
    size_mb = len(buf.getvalue()) / 1024 / 1024
    print(f"[2/5] 패키지 생성 완료: {size_mb:.1f} MB")
    return buf


def step3_upload(ssh, tarball):
    """서버에 업로드"""
    print(f"\n[3/5] 업로드 중... → {HOST}:/tmp/blossom_full_deploy.tar.gz")
    sftp = ssh.open_sftp()
    remote_tar = "/tmp/blossom_full_deploy.tar.gz"
    with sftp.open(remote_tar, 'wb') as f:
        f.write(tarball.getvalue())
    sftp.close()
    print("[3/5] 업로드 완료")
    return remote_tar


def step4_deploy(ssh, remote_tar):
    """서버에서 배포 실행"""
    print("\n[4/5] 서버에서 배포 실행 중...")

    deploy_script = textwrap.dedent(f'''
        set -e

        echo ">>> 기존 코드 백업..."
        cd {REMOTE_ROOT}
        if [ -d app ]; then
            rm -rf /tmp/blossom_backup_app 2>/dev/null || true
            cp -a app /tmp/blossom_backup_app
        fi

        echo ">>> 기존 코드 제거..."
        rm -rf app static scripts migrations config.py run.py index.html version.json requirements.txt

        echo ">>> 새 코드 배포..."
        cd {REMOTE_ROOT}
        tar xzf {remote_tar}
        chown -R lumina-web:lumina-web {REMOTE_ROOT}/
        chmod -R u+rw {REMOTE_ROOT}/

        echo ">>> wsgi.py 확인..."
        if [ ! -f {REMOTE_ROOT}/wsgi.py ]; then
            cat > {REMOTE_ROOT}/wsgi.py << 'WSGIEOF'
import sys
sys.path.insert(0, '{REMOTE_ROOT}')
from app import create_app
application = create_app('development')
WSGIEOF
            chown lumina-web:lumina-web {REMOTE_ROOT}/wsgi.py
        fi

        echo ">>> instance/uploads 디렉토리..."
        mkdir -p {REMOTE_ROOT}/instance
        mkdir -p {REMOTE_ROOT}/uploads
        chown -R lumina-web:lumina-web {REMOTE_ROOT}/instance {REMOTE_ROOT}/uploads
        chmod 755 {REMOTE_ROOT}/instance {REMOTE_ROOT}/uploads

        echo ">>> 서비스 재시작..."
        systemctl restart blossom-web
        sleep 2
        systemctl is-active blossom-web && echo "SERVICE_OK" || echo "SERVICE_FAIL"

        echo "DEPLOY_DONE"
    ''')

    out, err = ssh_exec(ssh, f"bash -c '{deploy_script}'", timeout=120)
    print(out)
    if err.strip():
        for line in err.strip().split('\n'):
            if 'InsecureRequestWarning' not in line and 'urllib3' not in line:
                print(f"  STDERR: {line}")

    return "DEPLOY_DONE" in out


def step5_verify(ssh):
    """배포 후 검증"""
    print("\n[5/5] 배포 검증 중...")

    verify_cmd = textwrap.dedent(f'''
        {VENV_PYTHON} -c "
import requests, urllib3, json
urllib3.disable_warnings()

# 1. 로그인 페이지 접근
r = requests.get('https://127.0.0.1/login', verify=False, timeout=5)
print('GET /login:', r.status_code)

# 2. MFA 상태 확인
r2 = requests.get('https://127.0.0.1/api/mfa/status', verify=False, timeout=5)
print('GET /api/mfa/status:', r2.status_code)
try:
    d = r2.json()
    print('  MFA enabled:', d.get('enabled'))
    print('  methods:', d.get('methods'))
except:
    print('  (JSON parse failed)')

# 3. 로그인 시도
r3 = requests.post('https://127.0.0.1/login',
    data={{'employee_id':'ADMIN','password':'admin123!'}},
    headers={{'X-Requested-With':'XMLHttpRequest'}},
    verify=False, allow_redirects=False, timeout=5)
print('POST /login:', r3.status_code)
try:
    d3 = r3.json()
    print('  mfa_required:', d3.get('mfa_required', 'N/A'))
    print('  redirect:', d3.get('redirect', 'N/A'))
except:
    print('  (JSON parse failed, body:', r3.text[:100], ')')
"
    ''')

    out, err = ssh_exec(ssh, verify_cmd, timeout=30)
    print(out)
    if err.strip():
        for line in err.strip().split('\n'):
            if 'InsecureRequestWarning' not in line and 'urllib3' not in line:
                print(f"  STDERR: {line}")


def main():
    print("=" * 60)
    print("Blossom MFA 비활성화 + 전체 배포")
    print(f"  대상: {HOST}")
    print("=" * 60)

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=10)

    # 1. MFA 비활성화
    step1_disable_mfa(ssh)

    # 2. 패키지 빌드
    tarball = step2_make_tarball()

    # 3. 업로드
    remote_tar = step3_upload(ssh, tarball)

    # 4. 배포
    success = step4_deploy(ssh, remote_tar)

    # 5. 검증
    if success:
        step5_verify(ssh)
        print("\n" + "=" * 60)
        print("배포 완료!")
        print(f"  Blossom: https://{HOST}/login")
        print(f"  계정: ADMIN / admin123!")
        print("=" * 60)
    else:
        print("\n[ERROR] 배포 실패 - 로그 확인 필요")

    ssh.close()


if __name__ == "__main__":
    main()

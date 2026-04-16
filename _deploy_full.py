"""
Blossom 전체 배포 스크립트
로컬 localhost:8080의 모든 것을 192.168.56.108:443으로 완전 배포
"""
import paramiko, tarfile, io, os, textwrap, time

HOST = "192.168.56.108"
USER = "root"
PASS = "123456"
LOCAL_ROOT = r"c:\Users\ME\Desktop\blossom"
REMOTE_ROOT = "/opt/blossom/web"
VENV_PYTHON = f"{REMOTE_ROOT}/venv/bin/python3"

# ─── 배포 대상 디렉토리/파일 ───
DEPLOY_DIRS = [
    "app",
    "static",
    "scripts",
    "migrations",
]
DEPLOY_FILES = [
    "config.py",
    "run.py",
    "requirements.txt",
    "index.html",
    "version.json",
]

def make_tarball():
    """로컬 프로젝트를 tar.gz로 패키징"""
    buf = io.BytesIO()
    skips = {'.venv', '__pycache__', '.git', 'node_modules', 'instance',
             '.pytest_cache', 'agents', 'deploy', 'docs', 'sbom', 'cp',
             '_build', '_deploy', '_diag', '_fix', '_init', '_patch',
             '_test', '_verify', '_setup', '_check', '_copy', '_diff',
             '_gap', '_insert', '_rebuild', '_start', '_r3', '_r4',
             '_spa', '_tab', '_js_check'}
    skip_ext = {'.sh', '.txt', '.pyc', '.pyo'}

    with tarfile.open(fileobj=buf, mode='w:gz') as tar:
        # 디렉토리
        for d in DEPLOY_DIRS:
            local_dir = os.path.join(LOCAL_ROOT, d)
            if not os.path.isdir(local_dir):
                print(f"  [SKIP] dir not found: {d}")
                continue
            for root, dirs, files in os.walk(local_dir):
                # Skip unwanted dirs
                dirs[:] = [x for x in dirs if x not in {'.git', '__pycache__',
                           '.pytest_cache', 'node_modules', '__MACOSX'}]
                for fname in files:
                    if fname.endswith(('.pyc', '.pyo')):
                        continue
                    full = os.path.join(root, fname)
                    arcname = os.path.relpath(full, LOCAL_ROOT).replace('\\', '/')
                    tar.add(full, arcname=arcname)

        # 개별 파일
        for f in DEPLOY_FILES:
            full = os.path.join(LOCAL_ROOT, f)
            if os.path.isfile(full):
                tar.add(full, arcname=f)
            else:
                print(f"  [SKIP] file not found: {f}")

    buf.seek(0)
    size_mb = len(buf.getvalue()) / 1024 / 1024
    print(f"[1/5] 패키지 생성 완료: {size_mb:.1f} MB")
    return buf


def deploy():
    print("=" * 60)
    print("Blossom 전체 배포 시작")
    print("=" * 60)

    # 1. 패키징
    tarball = make_tarball()

    # 2. SSH 연결
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS)
    sftp = ssh.open_sftp()

    # 3. 업로드
    remote_tar = "/tmp/blossom_full_deploy.tar.gz"
    print(f"[2/5] 업로드 중... → {HOST}:{remote_tar}")
    with sftp.open(remote_tar, 'wb') as f:
        f.write(tarball.getvalue())
    print(f"[2/5] 업로드 완료")

    # 4. 서버에서 압축 해제 + 서비스 재시작
    deploy_script = textwrap.dedent(f'''
        set -e

        echo "[3/5] 기존 코드 백업..."
        cd {REMOTE_ROOT}
        # app, static만 백업 (공간 절약)
        if [ -d app ]; then
            rm -rf /tmp/blossom_backup_app 2>/dev/null || true
            cp -a app /tmp/blossom_backup_app
        fi

        echo "[3/5] 기존 코드 제거..."
        rm -rf app static scripts migrations config.py run.py index.html version.json requirements.txt

        echo "[4/5] 새 코드 배포..."
        cd {REMOTE_ROOT}
        tar xzf {remote_tar}
        chown -R lumina-web:lumina-web {REMOTE_ROOT}/
        chmod -R u+rw {REMOTE_ROOT}/

        echo "[4/5] wsgi.py 확인..."
        if [ ! -f {REMOTE_ROOT}/wsgi.py ]; then
            cat > {REMOTE_ROOT}/wsgi.py << 'WSGIEOF'
import sys
sys.path.insert(0, '{REMOTE_ROOT}')
from app import create_app
application = create_app('development')
WSGIEOF
            chown lumina-web:lumina-web {REMOTE_ROOT}/wsgi.py
        fi

        echo "[4/5] instance 디렉토리 권한..."
        mkdir -p {REMOTE_ROOT}/instance
        mkdir -p {REMOTE_ROOT}/uploads
        chown -R lumina-web:lumina-web {REMOTE_ROOT}/instance {REMOTE_ROOT}/uploads
        chmod 755 {REMOTE_ROOT}/instance {REMOTE_ROOT}/uploads

        echo "[5/5] 서비스 재시작..."
        systemctl restart blossom-web
        sleep 2
        systemctl is-active blossom-web && echo "SERVICE_OK" || echo "SERVICE_FAIL"

        # 빠른 검증
        {VENV_PYTHON} -c "
import requests, urllib3
urllib3.disable_warnings()
r = requests.get('https://127.0.0.1/login', verify=False, timeout=5)
print('GET /login:', r.status_code)
r2 = requests.post('https://127.0.0.1/login',
    data={{'employee_id':'admin','password':'admin1234!'}},
    verify=False, allow_redirects=False, timeout=5)
print('POST /login:', r2.status_code, 'Loc:', r2.headers.get('Location',''))
"
        echo "DEPLOY_DONE"
    ''')

    print("[3/5] 서버에서 배포 실행 중...")
    _, stdout, stderr = ssh.exec_command(f"bash -c '{deploy_script}'", timeout=120)
    out = stdout.read().decode()
    err = stderr.read().decode()
    print(out)
    if err.strip():
        # filter noise
        for line in err.strip().split('\n'):
            if 'InsecureRequestWarning' not in line and 'urllib3' not in line:
                print(f"STDERR: {line}")

    if "DEPLOY_DONE" in out:
        print("\n" + "=" * 60)
        print("배포 완료!")
        print(f"  Blossom: https://{HOST}/login")
        print(f"  Lumina:  https://{HOST}:9601/login")
        print(f"  계정: admin / admin1234!")
        print("=" * 60)
    else:
        print("\n[ERROR] 배포 실패 - 로그 확인 필요")

    sftp.close()
    ssh.close()


if __name__ == "__main__":
    deploy()

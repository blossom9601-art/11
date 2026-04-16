"""사이드바 이벤트 위임 수정 배포"""
import paramiko, tarfile, io, os, time

HOST = "192.168.56.108"
USER = "root"
PASS = "123456"
LOCAL_ROOT = r"c:\Users\ME\Desktop\blossom"
REMOTE_ROOT = "/opt/blossom/web"

DEPLOY_DIRS = ["app", "static"]
DEPLOY_FILES = ["config.py", "run.py"]


def ssh_exec(ssh, cmd, timeout=60):
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    return stdout.read().decode('utf-8', 'replace'), stderr.read().decode('utf-8', 'replace')


def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=10)

    # 1. 패키징
    print("[1/3] 패키징...")
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode='w:gz') as tar:
        for d in DEPLOY_DIRS:
            local = os.path.join(LOCAL_ROOT, d)
            if os.path.isdir(local):
                tar.add(local, arcname=d)
        for f in DEPLOY_FILES:
            local = os.path.join(LOCAL_ROOT, f)
            if os.path.isfile(local):
                tar.add(local, arcname=f)
    pkg = buf.getvalue()
    print(f"  패키지 크기: {len(pkg) / 1024 / 1024:.1f} MB")

    # 2. 업로드 & 배포
    print("[2/3] 업로드 & 배포...")
    sftp = ssh.open_sftp()
    with sftp.open("/tmp/blossom_deploy.tar.gz", "wb") as f:
        f.write(pkg)
    sftp.close()

    out, err = ssh_exec(ssh,
        f"cd {REMOTE_ROOT} && "
        "tar xzf /tmp/blossom_deploy.tar.gz && "
        "rm -f /tmp/blossom_deploy.tar.gz && "
        "echo DEPLOY_OK",
        timeout=120)
    print(f"  {out.strip()}")

    # 3. 서비스 재시작
    print("[3/3] 서비스 재시작...")
    out, err = ssh_exec(ssh,
        "systemctl restart blossom-web && sleep 3 && systemctl is-active blossom-web",
        timeout=30)
    print(f"  서비스: {out.strip()}")

    # 검증: blossom.js 버전 확인
    out, _ = ssh_exec(ssh, f"grep 'blossom.js' {REMOTE_ROOT}/app/templates/layouts/spa_shell.html")
    print(f"  spa_shell 버전: {out.strip()}")

    out, _ = ssh_exec(ssh, f"grep -c 'submenu-trigger' {REMOTE_ROOT}/static/js/blossom.js")
    print(f"  submenu-trigger 참조 수: {out.strip()}")

    out, _ = ssh_exec(ssh, f"grep -c 'sidebar_deleg' {REMOTE_ROOT}/static/js/blossom.js")
    print(f"  sidebar_deleg 태그: {out.strip()}")

    # 이벤트 위임 신규 코드 확인
    out, _ = ssh_exec(ssh, f"grep -n 'a.menu-link, a.submenu-link' {REMOTE_ROOT}/static/js/blossom.js | head -5")
    print(f"  이벤트 위임 확인:\n{out.strip()}")

    ssh.close()
    print("\n완료!")

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""lumina-web RPM만 빌드 + ttt3에 배포하는 스크립트."""

import os
import sys
import tempfile
import shutil

if sys.stdout.encoding and sys.stdout.encoding.lower().replace("-", "") != "utf8":
    sys.stdout = open(sys.stdout.fileno(), mode="w", encoding="utf-8", errors="replace", buffering=1)
    sys.stderr = open(sys.stderr.fileno(), mode="w", encoding="utf-8", errors="replace", buffering=1)

import paramiko

SERVERS = {
    "ttt2": {"ip": "192.168.56.106", "user": "root", "pw": "123456"},
    "ttt3": {"ip": "192.168.56.108", "user": "root", "pw": "123456"},
}

PROJECT = os.path.dirname(os.path.abspath(__file__))
DEPLOY_DIR = os.path.join(PROJECT, "deploy")
BUILD_HOST = "ttt2"
BUILD_ROOT = "/tmp/lumina-rpmbuild"


def ssh(hostname):
    info = SERVERS[hostname]
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(info["ip"], username=info["user"], password=info["pw"], timeout=10)
    return c


def run(c, cmd, label="", check=True):
    stdin, stdout, stderr = c.exec_command(cmd, timeout=300)
    out = stdout.read().decode("utf-8", errors="replace").strip()
    err = stderr.read().decode("utf-8", errors="replace").strip()
    rc = stdout.channel.recv_exit_status()
    if out:
        for line in out.splitlines():
            print(f"  [{label}] {line}")
    if err and rc != 0:
        for line in err.splitlines():
            print(f"  [{label}] ERR: {line}")
    if check and rc != 0:
        print(f"  [{label}] WARNING: exit code {rc}")
    return out, err, rc


def put_str(c, content, path, mode=0o644):
    sftp = c.open_sftp()
    with sftp.file(path, "w") as f:
        f.write(content)
    sftp.chmod(path, mode)
    sftp.close()


def put_file(c, local, remote):
    sftp = c.open_sftp()
    sftp.put(local, remote)
    sftp.close()


def get_str(c, path):
    sftp = c.open_sftp()
    with sftp.file(path, "r") as f:
        data = f.read().decode("utf-8", errors="replace")
    sftp.close()
    return data


def get_file(c, remote, local):
    sftp = c.open_sftp()
    sftp.get(remote, local)
    sftp.close()


def main():
    print("=" * 60)
    print(" lumina-web RPM 빌드 + ttt3 배포")
    print("=" * 60)

    c = ssh(BUILD_HOST)

    # rpmbuild 확인
    run(c, "rpm --version | head -1", BUILD_HOST, check=False)

    # 기존 빌드 트리 재활용, web 소스만 업데이트
    run(c, f"mkdir -p {BUILD_ROOT}/{{SPECS,SOURCES/web/app,BUILD,RPMS,SRPMS}}", BUILD_HOST)

    # ── web/__init__.py (로컬 app_factory.py) ──
    app_factory_path = os.path.join(PROJECT, "agents", "web", "app_factory.py")
    put_file(c, app_factory_path, f"{BUILD_ROOT}/SOURCES/web/app/__init__.py")
    print(f"  [{BUILD_HOST}] web/app/__init__.py 업로드 완료")

    # ── web/cli_api.py ──
    cli_api_path = os.path.join(PROJECT, "agents", "web", "cli_api.py")
    if os.path.isfile(cli_api_path):
        put_file(c, cli_api_path, f"{BUILD_ROOT}/SOURCES/web/app/cli_api.py")

    # ── wsgi.py, gunicorn.conf.py (ttt3에서 가져옴) ──
    c3 = ssh("ttt3")
    web_wsgi = get_str(c3, "/opt/blossom/lumina/web/wsgi.py")
    web_gunicorn = get_str(c3, "/opt/blossom/lumina/web/gunicorn.conf.py")
    c3.close()
    put_str(c, web_wsgi, f"{BUILD_ROOT}/SOURCES/web/wsgi.py")
    put_str(c, web_gunicorn, f"{BUILD_ROOT}/SOURCES/web/gunicorn.conf.py")
    print(f"  [{BUILD_HOST}] wsgi.py, gunicorn.conf.py 업로드 완료")

    # ── conf/ (web.conf) ──
    run(c, f"mkdir -p {BUILD_ROOT}/SOURCES/conf", BUILD_HOST)
    conf_dir = os.path.join(DEPLOY_DIR, "conf")
    for f in os.listdir(conf_dir):
        fp = os.path.join(conf_dir, f)
        if os.path.isfile(fp):
            put_file(c, fp, f"{BUILD_ROOT}/SOURCES/conf/{f}")

    # ── nginx/ ──
    run(c, f"mkdir -p {BUILD_ROOT}/SOURCES/nginx", BUILD_HOST)
    nginx_dir = os.path.join(DEPLOY_DIR, "nginx")
    if os.path.isdir(nginx_dir):
        for f in os.listdir(nginx_dir):
            fp = os.path.join(nginx_dir, f)
            if os.path.isfile(fp):
                put_file(c, fp, f"{BUILD_ROOT}/SOURCES/nginx/{f}")

    # ── systemd/ ──
    run(c, f"mkdir -p {BUILD_ROOT}/SOURCES/systemd", BUILD_HOST)
    svc_dir = os.path.join(DEPLOY_DIR, "systemd")
    for f in os.listdir(svc_dir):
        fp = os.path.join(svc_dir, f)
        if os.path.isfile(fp):
            put_file(c, fp, f"{BUILD_ROOT}/SOURCES/systemd/{f}")

    # ── SPEC 파일 ──
    spec_file = os.path.join(DEPLOY_DIR, "rpm", "blossom-lumina-web.spec")
    put_file(c, spec_file, f"{BUILD_ROOT}/SPECS/blossom-lumina-web.spec")

    # ── CRLF → LF ──
    run(c, f"""
find {BUILD_ROOT}/SOURCES -type f \\( -name '*.py' -o -name '*.conf' -o -name '*.service' \\) \
    -exec sed -i 's/\\r$//' {{}} \\;
find {BUILD_ROOT}/SPECS -name '*.spec' -exec sed -i 's/\\r$//' {{}} \\;
""", BUILD_HOST)

    # ── RPM 빌드 ──
    print(f"\n  === lumina-web RPM 빌드 ===")
    out, err, rc = run(c, f"""
rpmbuild --define "_topdir {BUILD_ROOT}" \
         --define "_sourcedir {BUILD_ROOT}/SOURCES" \
         -bb {BUILD_ROOT}/SPECS/blossom-lumina-web.spec 2>&1 | tail -15
""", BUILD_HOST, check=False)

    if rc != 0:
        print(f"  *** 빌드 실패! ***")
        c.close()
        return

    # 빌드 결과
    rpm_path_out, _, _ = run(c, f"find {BUILD_ROOT}/RPMS -name 'lumina-web*.rpm' -type f | head -1", BUILD_HOST)
    if not rpm_path_out:
        print("  *** RPM 파일을 찾을 수 없습니다 ***")
        c.close()
        return

    rpm_remote = rpm_path_out.strip().split("\n")[0].replace(f"  [{BUILD_HOST}] ", "")
    # Clean the path - remove label prefix if present
    if "] " in rpm_remote:
        rpm_remote = rpm_remote.split("] ", 1)[1]
    print(f"  빌드 완료: {rpm_remote}")

    # ── 로컬로 다운로드 ──
    tmpdir = tempfile.mkdtemp(prefix="lumina_web_rpm_")
    rpm_fname = os.path.basename(rpm_remote)
    local_rpm = os.path.join(tmpdir, rpm_fname)
    get_file(c, rpm_remote, local_rpm)
    print(f"  다운로드: {rpm_fname}")

    # 로컬 deploy/rpm/RPMS/ 에도 복사
    local_rpms_dir = os.path.join(DEPLOY_DIR, "rpm", "RPMS")
    os.makedirs(local_rpms_dir, exist_ok=True)
    shutil.copy2(local_rpm, os.path.join(local_rpms_dir, rpm_fname))
    print(f"  로컬 저장: deploy/rpm/RPMS/{rpm_fname}")

    c.close()

    # ── ttt3에 설치 ──
    print(f"\n  === ttt3에 RPM 설치 ===")
    c3 = ssh("ttt3")
    remote_tmp = f"/tmp/{rpm_fname}"
    put_file(c3, local_rpm, remote_tmp)
    run(c3, f"rpm -Uvh --force --nodeps {remote_tmp} 2>&1", "ttt3", check=False)
    run(c3, f"rm -f {remote_tmp}", "ttt3")

    # __init__.py 직접 덮어쓰기 (RPM이 이전 버전 복원하는 경우 대비)
    put_file(c3, os.path.join(PROJECT, "agents", "web", "app_factory.py"),
             "/opt/blossom/lumina/web/app/__init__.py")

    # pycache 정리 + 서비스 재시작
    run(c3, """
find /opt/blossom/lumina/web -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null
systemctl restart lumina-web
""", "ttt3")

    # 상태 확인
    import time
    time.sleep(2)
    run(c3, "systemctl is-active lumina-web", "ttt3")
    run(c3, "curl -sk https://localhost:9601/health 2>/dev/null || curl -sk http://localhost:8000/health 2>/dev/null", "ttt3")

    c3.close()
    shutil.rmtree(tmpdir, ignore_errors=True)

    print(f"\n{'=' * 60}")
    print(" lumina-web RPM 빌드 + 배포 완료!")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()

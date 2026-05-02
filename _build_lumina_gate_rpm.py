#!/usr/bin/env python3
"""Build lumina-gate RPM on ttt5 and install it.

Environment variables:
    LUMINA_GATE_HOST      default: 192.168.56.110
  LUMINA_GATE_USER      default: root
  LUMINA_GATE_PASSWORD  required unless SSH key auth is available
  LUMINA_GATE_BUILD_ONLY=1 skips remote RPM installation
"""

from __future__ import annotations

import os
import posixpath
import sys
from pathlib import Path

import paramiko


ROOT = Path(__file__).resolve().parent
BUILD_ROOT = "/tmp/lumina-gate-rpmbuild"
REMOTE_RPM = f"{BUILD_ROOT}/RPMS/x86_64/lumina-gate-1.0.0-1.x86_64.rpm"
LOCAL_RPM = ROOT / "deploy" / "rpm" / "RPMS" / "lumina-gate-1.0.0-1.x86_64.rpm"

SOURCES = [
    (ROOT / "agents" / "gate" / "linux" / "lumina-gate", f"{BUILD_ROOT}/SOURCES/lumina-gate", 0o755),
    (ROOT / "agents" / "gate" / "linux" / "config.yaml", f"{BUILD_ROOT}/SOURCES/config.yaml", 0o640),
    (ROOT / "agents" / "gate" / "linux" / "lumina-gate.service", f"{BUILD_ROOT}/SOURCES/lumina-gate.service", 0o644),
    (ROOT / "deploy" / "rpm" / "lumina-gate.spec", f"{BUILD_ROOT}/SPECS/lumina-gate.spec", 0o644),
]


def connect() -> paramiko.SSHClient:
    host = os.environ.get("LUMINA_GATE_HOST", "192.168.56.110")
    user = os.environ.get("LUMINA_GATE_USER", "root")
    password = os.environ.get("LUMINA_GATE_PASSWORD") or None
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username=user, password=password, timeout=20)
    return client


def run(client: paramiko.SSHClient, command: str, check: bool = True) -> str:
    stdin, stdout, stderr = client.exec_command(command, timeout=600)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    rc = stdout.channel.recv_exit_status()
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(err.rstrip(), file=sys.stderr)
    if check and rc != 0:
        raise RuntimeError(f"remote command failed rc={rc}: {command}")
    return out


def mkdir_p(sftp: paramiko.SFTPClient, path: str) -> None:
    parts = []
    current = path
    while current and current != "/":
        parts.append(current)
        current = posixpath.dirname(current)
    for part in reversed(parts):
        try:
            sftp.stat(part)
        except FileNotFoundError:
            sftp.mkdir(part)


def upload_sources(client: paramiko.SSHClient) -> None:
    run(client, f"rm -rf {BUILD_ROOT}; mkdir -p {BUILD_ROOT}/{{BUILD,RPMS,SOURCES,SPECS,SRPMS,BUILDROOT}}")
    sftp = client.open_sftp()
    try:
        for local, remote, mode in SOURCES:
            if not local.is_file():
                raise FileNotFoundError(local)
            mkdir_p(sftp, posixpath.dirname(remote))
            data = local.read_bytes().replace(b"\r\n", b"\n")
            with sftp.file(remote, "wb") as remote_file:
                remote_file.write(data)
            sftp.chmod(remote, mode)
            print(f"uploaded {local.relative_to(ROOT)} -> {remote}")
    finally:
        sftp.close()


def build_and_install(client: paramiko.SSHClient) -> None:
    run(client, "command -v rpmbuild >/dev/null 2>&1 || dnf install -y rpm-build")
    run(client, f"rpmbuild --define '_topdir {BUILD_ROOT}' -bb {BUILD_ROOT}/SPECS/lumina-gate.spec")
    run(client, f"test -f {REMOTE_RPM}; rpm -qpi {REMOTE_RPM}")
    LOCAL_RPM.parent.mkdir(parents=True, exist_ok=True)
    sftp = client.open_sftp()
    try:
        sftp.get(REMOTE_RPM, str(LOCAL_RPM))
    finally:
        sftp.close()
    print(f"downloaded {LOCAL_RPM}")
    if os.environ.get("LUMINA_GATE_BUILD_ONLY") == "1":
        return
    run(client, f"rpm -Uvh --replacepkgs --replacefiles {REMOTE_RPM}")
    run(
        client,
        "systemctl is-enabled lumina-gate; "
        "systemctl is-active lumina-gate; "
        "rpm -q lumina-gate; "
        "curl -s --max-time 5 http://127.0.0.1:8443/health",
    )


def main() -> int:
    client = connect()
    try:
        upload_sources(client)
        build_and_install(client)
    finally:
        client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
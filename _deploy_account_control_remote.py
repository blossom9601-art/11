#!/usr/bin/env python3
"""Hotfix deploy: account job API (WEB ttt3) + Lumina agent (ttt4, Python 3.6)."""
from __future__ import annotations

import os
import posixpath
import sys

import paramiko

ROOT = os.path.dirname(os.path.abspath(__file__))

WEB = {"host": "192.168.56.108", "user": "root", "pw": "123456"}
AGENT = {"host": "192.168.56.109", "user": "root", "pw": "123456"}


def connect(info):
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(info["host"], username=info["user"], password=info["pw"], timeout=25)
    return c


def run(c, cmd: str, timeout=180):
    stdin, stdout, stderr = c.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    rc = stdout.channel.recv_exit_status()
    return rc, out, err


def put(c, local: str, remote: str, mode=0o644):
    s = c.open_sftp()
    try:
        s.put(local, remote)
        s.chmod(remote, mode)
    finally:
        s.close()


def put_tree(c, local_dir: str, remote_root: str):
    """Recursive upload; remote_root must use / separators."""
    s = c.open_sftp()

    def ensure_dir(rdir: str):
        parts = [p for p in rdir.split("/") if p]
        cur = ""
        for p in parts:
            cur = cur + "/" + p
            try:
                s.stat(cur)
            except FileNotFoundError:
                s.mkdir(cur)

    for root, dirs, files in os.walk(local_dir):
        rel = os.path.relpath(root, local_dir).replace(os.sep, "/")
        if rel == ".":
            rdir = remote_root
        else:
            rdir = posixpath.join(remote_root, rel)
        ensure_dir(rdir)
        for f in files:
            if f.endswith(".pyc"):
                continue
            lp = os.path.join(root, f)
            rp = posixpath.join(rdir, f)
            s.put(lp, rp)
            is_exec = f in ("agent.py", "main.py")
            s.chmod(rp, 0o755 if is_exec else 0o644)
    s.close()


def main():
    ls = os.path.join(ROOT, "agents", "lumina_server_agent")

    c3 = connect(WEB)
    run(
        c3,
        "rm -f /opt/blossom/web/app/'services\\account_job_service.py' 2>/dev/null; "
        "rm -f '/opt/blossom/web/app/services\\account_job_service.py' 2>/dev/null; true",
    )
    rc, out, err = run(
        c3,
        "find /opt/blossom -path '*/app/routes/agent_api.py' -type f 2>/dev/null | head -n 1",
    )
    agent_api_remote = (out.strip().splitlines() or [""])[0].strip()
    if not agent_api_remote:
        print("ERROR: agent_api.py not found", out, err, file=sys.stderr)
        return 1
    routes_dir = posixpath.dirname(agent_api_remote)
    services_dir = posixpath.join(posixpath.dirname(routes_dir), "services")
    remote_job = posixpath.join(services_dir, "account_job_service.py")
    print("[WEB] agent_api:", agent_api_remote)
    print("[WEB] account_job_service:", remote_job)

    put(c3, os.path.join(ROOT, "app", "routes", "agent_api.py"), agent_api_remote)
    put(
        c3,
        os.path.join(ROOT, "app", "services", "account_job_service.py"),
        remote_job,
    )
    rc, out, err = run(
        c3,
        "systemctl restart lumina-web.service && systemctl is-active lumina-web.service",
    )
    print("[WEB] lumina-web:", rc, out.strip())
    c3.close()

    c4 = connect(AGENT)
    base = "/opt/blossom/lumina"
    put_tree(c4, os.path.join(ls, "common"), posixpath.join(base, "common"))
    put_tree(c4, os.path.join(ls, "linux"), posixpath.join(base, "linux"))
    unit = """[Unit]
Description=Blossom Lumina Agent (Asset Discovery)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=lumina
Group=lumina
ExecStart=/usr/bin/python3 /opt/blossom/lumina/linux/agent.py --conf /etc/blossom/lumina/agent.conf
Restart=on-failure
RestartSec=30
StandardOutput=journal
StandardError=journal
SyslogIdentifier=lumina-agent
ProtectSystem=full
NoNewPrivileges=yes

[Install]
WantedBy=multi-user.target
"""
    s = c4.open_sftp()
    with s.file("/etc/systemd/system/lumina-agent.service", "w") as f:
        f.write(unit)
    s.close()
    ul = os.path.join(ls, "linux", "lumina-account-worker.service")
    if os.path.isfile(ul):
        put(c4, ul, "/etc/systemd/system/lumina-account-worker.service", 0o644)
    run(c4, "systemctl daemon-reload")
    run(c4, "chown -R lumina:lumina /opt/blossom/lumina/linux /opt/blossom/lumina/common")
    rc, out, err = run(
        c4,
        "systemctl restart lumina-agent.service && sleep 2 && systemctl is-active lumina-agent",
    )
    print("[AGENT] lumina-agent:", rc, out.strip(), err[:300] if err else "")
    _, slog, _ = run(c4, "journalctl -u lumina-agent -n 6 --no-pager -o cat 2>/dev/null || true")
    print("[AGENT] log:", slog[-800:] if slog else "")
    c4.close()
    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)

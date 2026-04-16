#!/usr/bin/env python3
"""Blossom Lumina WEB — Agent approval management dashboard.

ttt3 (:443) — Agent approve/reject, status monitoring
"""

import os
import sys
import json
import logging
import re
import subprocess
from datetime import datetime
from functools import wraps

sys.path.insert(0, "/opt/blossom/lumina")

from flask import Flask, render_template_string, jsonify, request, session, redirect, url_for

logger = logging.getLogger("lumina.web")

# ═══════════════════════════════════════════════════════════
# Lumina Server Configuration (DB / AP / WEB)
# ═══════════════════════════════════════════════════════════
LUMINA_SERVERS = [
    {"hostname": "ttt1", "purpose": "Lumina DB",  "ip": "192.168.56.107", "account": "root", "password": "123456"},
    {"hostname": "ttt2", "purpose": "Lumina AP",  "ip": "192.168.56.106", "account": "root", "password": "123456"},
    {"hostname": "ttt3", "purpose": "Lumina WEB", "ip": "192.168.56.108", "account": "root", "password": "123456"},
]


def _ssh_run(ip, account, password, command, timeout=10):
    """Execute a command on a remote server via SSH (paramiko)."""
    try:
        import paramiko
    except ImportError:
        return {"ok": False, "error": "paramiko not installed"}
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(ip, port=22, username=account, password=password,
                       timeout=timeout, allow_agent=False, look_for_keys=False)
        stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
        exit_code = stdout.channel.recv_exit_status()
        out = stdout.read().decode("utf-8", errors="replace").strip()
        err = stderr.read().decode("utf-8", errors="replace").strip()
        return {"ok": exit_code == 0, "stdout": out, "stderr": err, "exit_code": exit_code}
    except Exception as e:
        return {"ok": False, "error": str(e)}
    finally:
        client.close()


def _apply_ntp_to_server(server, ntp_servers, timezone):
    """Apply NTP servers + timezone to a single remote (or local) server."""
    ip = server["ip"]
    results = []

    # Build chrony.conf update script
    server_lines = "\\n".join("server %s iburst" % s for s in ntp_servers)
    # Remove old server/pool lines, prepend new ones
    script = (
        "sed -i '/^server /d;/^pool /d' /etc/chrony.conf 2>/dev/null || true; "
        "sed -i '1i\\%s' /etc/chrony.conf 2>/dev/null || true; "
        "systemctl restart chronyd 2>/dev/null || systemctl restart chrony 2>/dev/null || true"
    ) % server_lines

    if timezone:
        script += "; timedatectl set-timezone '%s' 2>/dev/null || true" % timezone.replace("'", "")

    # Check if this is the local server
    local_ips = _get_local_ips()
    if ip in local_ips:
        # Local execution (already handled by existing code, skip)
        return {"server": server, "status": "local", "msg": "Applied locally"}

    # Remote SSH execution
    r = _ssh_run(ip, server["account"], server["password"], script)
    if r.get("ok"):
        return {"server": server, "status": "ok", "msg": "NTP applied successfully"}
    else:
        return {"server": server, "status": "error", "msg": r.get("error") or r.get("stderr", "Unknown error")}


def _get_local_ips():
    """Get local IP addresses for detecting local server."""
    ips = {"127.0.0.1", "::1"}
    try:
        import socket
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None):
            ips.add(info[4][0])
    except Exception:
        pass
    try:
        r = subprocess.run(["hostname", "-I"], stdout=subprocess.PIPE,
                           stderr=subprocess.PIPE, universal_newlines=True, timeout=3)
        if r.returncode == 0:
            for ip in r.stdout.split():
                ips.add(ip.strip())
    except Exception:
        pass
    return ips


def _remote_ntp_status(server):
    """Get NTP sync status from a remote server via SSH."""
    ip = server["ip"]
    local_ips = _get_local_ips()

    cmd = (
        "echo '---SYNCED---'; "
        "timedatectl show 2>/dev/null | grep -E '^(NTPSynchronized|Timezone)=' || true; "
        "echo '---CHRONY---'; "
        "chronyc tracking 2>/dev/null || true; "
        "echo '---SERVERS---'; "
        "grep -E '^(server|pool) ' /etc/chrony.conf 2>/dev/null || "
        "grep -E '^(server|pool) ' /etc/chrony/chrony.conf 2>/dev/null || true; "
        "echo '---TIME---'; "
        "date '+%Y-%m-%d %H:%M:%S' 2>/dev/null || true"
    )

    if ip in local_ips:
        # Local execution
        try:
            r = subprocess.run(["bash", "-c", cmd], stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, universal_newlines=True, timeout=10)
            output = r.stdout
        except Exception as e:
            return {"synced": None, "source": None, "timezone": "", "servers": [],
                    "server_time": "", "error": str(e)}
    else:
        r = _ssh_run(ip, server["account"], server["password"], cmd)
        if not r.get("ok") and r.get("error"):
            return {"synced": None, "source": None, "timezone": "", "servers": [],
                    "server_time": "", "error": r.get("error")}
        output = r.get("stdout", "")

    info = {"synced": None, "source": None, "timezone": "", "servers": [],
            "server_time": "", "error": None}

    for line in output.splitlines():
        if line.startswith("NTPSynchronized="):
            info["synced"] = line.split("=", 1)[1].strip().lower() == "yes"
        if line.startswith("Timezone="):
            info["timezone"] = line.split("=", 1)[1].strip()
        if "Reference ID" in line:
            parts = line.split("(")
            if len(parts) > 1:
                info["source"] = parts[1].rstrip(")")
        if line.startswith(("server ", "pool ")):
            parts = line.split()
            if len(parts) >= 2:
                info["servers"].append(parts[1])

    # Extract time (last line after ---TIME---)
    time_section = output.split("---TIME---")
    if len(time_section) > 1:
        time_str = time_section[1].strip().splitlines()
        if time_str:
            info["server_time"] = time_str[0].strip()

    return info

DB_CONFIG = {
    "host": os.environ.get("LUMINA_DB_HOST", "192.168.56.107"),
    "port": int(os.environ.get("LUMINA_DB_PORT", 3306)),
    "user": os.environ.get("LUMINA_DB_WEB_USER", "lumina_web_reader"),
    "password": os.environ.get("LUMINA_DB_WEB_PASSWORD", "Lumina_WEB_2026!"),
    "database": "lumina",
    "charset": "utf8mb4",
}

_PW_FILE = "/var/lib/blossom/lumina/web/admin_pw"

def _get_admin_password():
    if os.path.isfile(_PW_FILE):
        try:
            with open(_PW_FILE) as f:
                pw = f.read().strip()
            if pw:
                return pw
        except Exception:
            pass
    return os.environ.get("LUMINA_CLI_ADMIN_PASSWORD", "admin1234!")

def _set_admin_password(new_pw):
    d = os.path.dirname(_PW_FILE)
    if not os.path.isdir(d):
        os.makedirs(d, mode=0o750, exist_ok=True)
    with open(_PW_FILE, "w") as f:
        f.write(new_pw)
    os.chmod(_PW_FILE, 0o600)


def get_db():
    import pymysql
    return pymysql.connect(**DB_CONFIG, cursorclass=pymysql.cursors.DictCursor)


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get("logged_in"):
            return redirect(url_for("login_page"))
        return f(*args, **kwargs)
    return wrapper


# ═══════════════════════════════════════════════════════════
# HTML Templates
# ═══════════════════════════════════════════════════════════

LOGIN_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lumina — Login</title>
<link rel="icon" type="image/svg+xml" href="/static/image/svg/lumina/free-icon-letter-L.svg">
<style>
*{margin:0;padding:0;box-sizing:border-box}
::-webkit-scrollbar{width:6px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:#94a3b8}
*{scrollbar-width:thin;scrollbar-color:#cbd5e1 transparent}
body{background:#0b1120;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
     display:flex;min-height:100vh}
.login-left{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
            background:linear-gradient(135deg,#0f1729 0%,#162038 50%,#1a2744 100%);
            padding:60px}
.login-left .logo img{height:64px;margin-bottom:32px}
.login-left h2{color:#fff;font-size:16px;font-weight:400;letter-spacing:2px;text-transform:uppercase;
               opacity:0.5}
.login-right{width:440px;display:flex;flex-direction:column;align-items:center;justify-content:center;
             background:#fff;padding:60px 48px}
.login-right h1{color:#1e293b;font-size:24px;font-weight:700;margin-bottom:6px}
.login-right .sub{color:#94a3b8;font-size:13px;margin-bottom:36px}
.field{margin-bottom:20px;text-align:left;width:100%}
.field label{display:block;font-size:12px;color:#64748b;margin-bottom:6px;text-transform:uppercase;
             letter-spacing:0.5px;font-weight:600}
.field input{width:100%;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;
             border-radius:6px;color:#1e293b;font-size:14px;outline:none}
.field input:focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,0.1)}
.btn{width:100%;padding:13px;background:#1e293b;
     border:none;border-radius:6px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;
     margin-top:8px;letter-spacing:0.5px;text-transform:uppercase}
.btn:hover{background:#334155}
.err{background:#fef2f2;color:#dc2626;border:1px solid #fecaca;padding:10px;border-radius:6px;
     margin-bottom:16px;font-size:13px;width:100%;text-align:center}
.footer{color:#cbd5e1;font-size:10px;margin-top:40px;letter-spacing:1px}
@media(max-width:768px){.login-left{display:none}.login-right{width:100%}}
</style>
</head>
<body>
<div class="login-left">
    <div class="logo"><img src="/static/image/logo/lumina_black.png" alt="Lumina"></div>
    <h2>Agent Management Console</h2>
</div>
<div class="login-right">
    <h1>Sign In</h1>
    <p class="sub">Administrator authentication required</p>
    {% if error %}<div class="err">{{ error }}</div>{% endif %}
    <form method="POST" action="/login" style="width:100%">
        <div class="field"><label>Employee ID</label>
            <input type="text" name="emp_no" value="admin" placeholder="Enter employee ID" required></div>
        <div class="field"><label>Password</label>
            <input type="password" name="password" placeholder="Enter password" required></div>
        <button type="submit" class="btn">LOGIN</button>
    </form>
    <p class="footer">&copy; 2026 BLOSSOM PROJECT</p>
</div>
</body>
</html>"""


DASHBOARD_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lumina — Agent Management</title>
<link rel="icon" type="image/svg+xml" href="/static/image/svg/lumina/free-icon-letter-L.svg">
<style>
*{margin:0;padding:0;box-sizing:border-box}
::-webkit-scrollbar{width:6px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:#94a3b8}
*{scrollbar-width:thin;scrollbar-color:#cbd5e1 transparent}
body{background:#f4f6f9;color:#1e293b;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
     display:flex;min-height:100vh}
.sidebar{width:220px;background:#0f1729;color:#94a3b8;display:flex;flex-direction:column;
         padding:0;position:fixed;top:0;left:0;bottom:0;z-index:10}
.sidebar .brand{padding:24px 20px;border-bottom:1px solid rgba(255,255,255,0.06)}
.sidebar .brand img{height:28px}
.sidebar nav{flex:1;padding:16px 0}
.sidebar nav a{display:flex;align-items:center;padding:10px 20px;color:#94a3b8;text-decoration:none;
               font-size:13px;letter-spacing:0.3px;border-left:3px solid transparent}
.sidebar nav a.active{color:#fff;background:rgba(255,255,255,0.06);border-left-color:#3b82f6}
.sidebar nav a:hover{color:#e2e8f0;background:rgba(255,255,255,0.03)}
.sidebar nav a svg{width:16px;height:16px;margin-right:10px;opacity:0.6}
.sidebar .sb-footer{padding:16px 20px;border-top:1px solid rgba(255,255,255,0.06);
                    font-size:11px;color:#475569}
.main{margin-left:220px;flex:1;display:flex;flex-direction:column;min-height:100vh}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:0 32px;
        height:56px;background:#fff;border-bottom:1px solid #e5e7eb}
.topbar h1{font-size:15px;font-weight:600;color:#1e293b;letter-spacing:-0.2px}
.topbar-right{display:flex;align-items:center;gap:16px}
.topbar-right .user{font-size:12px;color:#64748b;background:#f1f5f9;padding:5px 12px;
                    border-radius:4px;cursor:pointer;transition:background 0.15s}
.topbar-right .user:hover{background:#e2e8f0;color:#1e293b}
.btn-logout{padding:5px 14px;background:transparent;border:1px solid #e5e7eb;border-radius:4px;
            color:#64748b;font-size:11px;cursor:pointer;text-decoration:none;text-transform:uppercase;
            letter-spacing:0.5px;font-weight:600}
.btn-logout:hover{background:#f8fafc;border-color:#cbd5e1}
.pw-overlay{display:none;position:fixed;inset:0;background:rgba(15,23,42,0.5);z-index:9000;align-items:center;justify-content:center}
.pw-overlay.open{display:flex}
.pw-modal{background:#fff;border-radius:10px;padding:28px 32px;width:380px;box-shadow:0 8px 32px rgba(0,0,0,0.2)}
.pw-modal h3{font-size:15px;font-weight:700;color:#1e293b;margin-bottom:20px}
.pw-modal label{display:block;font-size:12px;color:#64748b;font-weight:600;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.3px}
.pw-modal input{width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;color:#1e293b;outline:none;margin-bottom:14px;box-sizing:border-box}
.pw-modal input:focus{border-color:#3b82f6}
.pw-modal .pw-btns{display:flex;gap:10px;margin-top:6px}
.pw-modal .pw-btns button{flex:1;padding:10px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;text-transform:uppercase;letter-spacing:0.5px}
.pw-modal .pw-save{background:#1e293b;color:#fff;border:none}
.pw-modal .pw-save:hover{background:#334155}
.pw-modal .pw-cancel{background:#fff;color:#64748b;border:1px solid #e2e8f0}
.pw-modal .pw-cancel:hover{background:#f8fafc}
.content{flex:1;padding:28px 32px}
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px}
.card{background:#fff;border-radius:8px;padding:20px 22px;border:1px solid #e5e7eb;cursor:pointer;
      transition:all 0.15s ease;-webkit-user-select:none;user-select:none}
.card:hover{border-color:#cbd5e1;box-shadow:0 2px 8px rgba(0,0,0,0.06)}
.card.active{border-color:#1e293b;box-shadow:0 2px 12px rgba(30,41,59,0.15)}
.card .card-label{font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;
                  font-weight:600;margin-bottom:10px}
.card .card-value{font-size:28px;font-weight:700;line-height:1}
.card .card-value.v-total{color:#1e293b}
.card .card-value.v-pending{color:#d97706}
.card .card-value.v-approved{color:#059669}
.card .card-value.v-rejected{color:#dc2626}
.toolbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.toolbar .info{color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:0.5px}
.btn-refresh{height:30px;padding:0 14px;background:#1e293b;border:none;border-radius:5px;
             color:#e2e8f0;font-size:10px;cursor:pointer;text-decoration:none;font-weight:700;
             text-transform:uppercase;letter-spacing:0.6px;display:inline-flex;align-items:center;
             justify-content:center;box-sizing:border-box;transition:all 0.15s ease}
.btn-refresh:hover{background:#334155;color:#fff}
.tbl-wrap{background:#fff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden}
table{width:100%;border-collapse:collapse}
th{text-align:left;padding:11px 16px;background:#f9fafb;color:#6b7280;font-size:10px;
   text-transform:uppercase;letter-spacing:0.8px;font-weight:700;border-bottom:1px solid #e5e7eb;
   cursor:pointer;-webkit-user-select:none;user-select:none;white-space:nowrap;position:relative}
th:hover{color:#1e293b;background:#f1f5f9}
th .sort-arrow{display:inline-block;margin-left:4px;font-size:8px;color:#cbd5e1;vertical-align:middle}
th.sort-asc .sort-arrow{color:#1e293b}
th.sort-desc .sort-arrow{color:#1e293b}
th:last-child{cursor:default}
th:last-child:hover{color:#6b7280;background:#f9fafb}
td{padding:11px 16px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#374151}
tr:hover td{background:#f9fafb}
tr:last-child td{border-bottom:none}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;
       text-transform:uppercase;letter-spacing:0.5px}
.badge-online{background:#ecfdf5;color:#059669}
.badge-offline{background:#f3f4f6;color:#9ca3af}
.badge-stale{background:#fffbeb;color:#d97706}
.badge-disabled{background:#fef2f2;color:#dc2626}
.badge-pending{background:#fef3c7;color:#92400e}
.badge-approved{background:#d1fae5;color:#065f46}
.badge-rejected{background:#fee2e2;color:#991b1b}
.badge-none{background:#f3f4f6;color:#9ca3af}
.btn-action{display:inline-block;padding:4px 12px;border:1px solid;border-radius:4px;font-size:11px;
            font-weight:600;cursor:pointer;margin-right:4px;text-decoration:none;text-align:center;
            text-transform:uppercase;letter-spacing:0.3px}
.btn-approve{background:#f0fdf4;color:#15803d;border-color:#86efac;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0}
.btn-approve:hover{background:#dcfce7}
.btn-approve img{width:14px;height:14px;filter:brightness(0) saturate(100%) invert(30%) sepia(90%) saturate(500%) hue-rotate(100deg)}
.btn-reject{background:#fef2f2;color:#b91c1c;border-color:#fca5a5;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0}
.btn-reject:hover{background:#fee2e2}
.btn-reject img{width:14px;height:14px;filter:brightness(0) saturate(100%) invert(20%) sepia(90%) saturate(2000%) hue-rotate(345deg)}
.btn-remove{background:#fefce8;color:#92400e;border-color:#fcd34d;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0}
.btn-remove:hover{background:#fef9c3}
.btn-remove img{width:14px;height:14px;filter:brightness(0) saturate(100%) invert(25%) sepia(60%) saturate(1500%) hue-rotate(15deg)}
.integration-icon{width:16px;height:16px;vertical-align:middle;opacity:0.4}
.integration-icon.linked{opacity:1;filter:brightness(0) saturate(100%) invert(36%) sepia(96%) saturate(2000%) hue-rotate(224deg) brightness(98%)}
.toolbar-controls{display:flex;align-items:center;gap:6px}
.per-page-select{width:72px;height:30px;padding:0 8px;border:1px solid #d1d5db;border-radius:5px;font-size:11px;color:#1e293b;
    background:#f8fafc;cursor:pointer;outline:none;font-weight:600;letter-spacing:0.3px;box-sizing:border-box;
    text-align:center;-webkit-appearance:none;appearance:none;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2364748b'/%3E%3C/svg%3E");
    background-repeat:no-repeat;background-position:right 8px center;padding-right:22px}
.per-page-select:hover{border-color:#94a3b8;background:#f1f5f9}
.per-page-select:focus{border-color:#3b82f6;box-shadow:0 0 0 2px rgba(59,130,246,0.12)}
.btn-toolbar{width:80px;height:30px;padding:0;background:#1e293b;border:none;border-radius:5px;
    color:#e2e8f0;font-size:10px;cursor:pointer;font-weight:700;text-transform:uppercase;
    letter-spacing:0.6px;display:inline-flex;align-items:center;justify-content:center;gap:5px;
    box-sizing:border-box;transition:all 0.15s ease;text-decoration:none}
.btn-toolbar:hover{background:#334155;color:#fff}
.btn-toolbar svg{width:13px;height:13px;stroke-width:2.2}
.paging-info{font-size:11px;color:#9ca3af;letter-spacing:0.3px}
.msg{position:fixed;bottom:32px;left:50%;transform:translateX(-50%);padding:12px 24px;border-radius:8px;
    font-size:13px;font-weight:500;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.15);
    animation:toastIn .3s ease,toastOut .4s ease 2.6s forwards;pointer-events:none}
.msg-ok{background:#f0fdf4;color:#15803d;border:1px solid #86efac}
.msg-err{background:#fef2f2;color:#b91c1c;border:1px solid #fca5a5}
@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
@keyframes toastOut{from{opacity:1}to{opacity:0}}
</style>
</head>
<body>
<div class="sidebar">
    <div class="brand"><img src="/static/image/logo/lumina_black.png" alt="Lumina"></div>
    <nav>
        <a href="/" class="{{ 'active' if active_page == 'agents' else '' }}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            Agents
        </a>
    </nav>
    <div style="padding:8px 0;border-top:1px solid rgba(255,255,255,0.06)">
        <a href="/settings" class="{{ 'active' if active_page == 'settings' else '' }}" style="display:flex;align-items:center;padding:10px 20px;color:#94a3b8;text-decoration:none;font-size:13px;letter-spacing:0.3px;border-left:3px solid {{ '#3b82f6' if active_page == 'settings' else 'transparent' }}{% if active_page == 'settings' %};color:#fff;background:rgba(255,255,255,0.06){% endif %}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;margin-right:10px;opacity:0.6"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
            Settings
        </a>
    </div>
    <div class="sb-footer">&copy; 2026 Blossom</div>
</div>
<div class="main">
    <div class="topbar">
        <h1>Agent Management</h1>
        <div class="topbar-right">
            <span class="user" onclick="document.getElementById('pwModal').classList.add('open')">{{ user }}</span>
            <a href="/logout" class="btn-logout">Logout</a>
        </div>
    </div>
    <div class="content">
        
        <div class="cards">
            <div class="card" onclick="filterByCard('all')"><div class="card-label">Total Agents</div><div class="card-value v-total">{{ total }}</div></div>
            <div class="card" onclick="filterByCard('pending')"><div class="card-label">Pending</div><div class="card-value v-pending">{{ cnt_pending }}</div></div>
            <div class="card" onclick="filterByCard('approved')"><div class="card-label">Approved</div><div class="card-value v-approved">{{ cnt_approved }}</div></div>
            <div class="card" onclick="filterByCard('rejected')"><div class="card-label">Rejected</div><div class="card-value v-rejected">{{ cnt_rejected }}</div></div>
        </div>
        <div class="toolbar">
            <span class="info" id="clock"></span>
            <div class="toolbar-controls">
                <select class="per-page-select" id="perPage" onchange="applyPerPage()">
                    <option value="10">10</option>
                    <option value="50" selected>50</option>
                    <option value="100">100</option>
                    <option value="500">500</option>
                    <option value="1000">1000</option>
                </select>
                <button class="btn-toolbar" onclick="downloadCSV()" title="CSV Download">
                    <img src="/static/image/svg/lumina/free-icon-font-file-csv.svg" style="width:14px;height:14px;filter:invert(1)">
                </button>
                <a href="/" class="btn-toolbar" title="Refresh">
                    <img src="/static/image/svg/lumina/free-icon-font-refresh.svg" style="width:14px;height:14px;filter:invert(1)">
                </a>
            </div>
        </div>
        <script>
        function pad(n){return n<10?'0'+n:n}
        (function(){
            function tick(){
                var d=new Date();
                document.getElementById('clock').textContent=
                    'Last updated: '+d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+
                    pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());
            }
            tick();setInterval(tick,1000);
        })();

        function applyPerPage(){
            var n=parseInt(document.getElementById('perPage').value);
            var rows=document.querySelectorAll('.tbl-wrap tbody tr');
            var shown=0,total=0;
            for(var i=0;i<rows.length;i++){
                if(rows[i].querySelector('td[colspan]')){rows[i].style.display='';continue;}
                var cells=rows[i].querySelectorAll('td');
                var approval=cells[7]?cells[7].textContent.trim().toLowerCase():'';
                if(_cardFilter!=='all' && approval!==_cardFilter){rows[i].style.display='none';continue;}
                total++;
                if(shown<n){rows[i].style.display='';shown++;}else{rows[i].style.display='none';}
            }
        }

        function downloadCSV(){
            var rows=document.querySelectorAll('.tbl-wrap table tr');
            var csv=[];
            for(var i=0;i<rows.length;i++){
                var cells=rows[i].querySelectorAll('th,td');
                var row=[];
                for(var j=0;j<cells.length;j++){
                    var t=cells[j].textContent.replace(/\s+/g,' ').trim();
                    row.push('"'+t.replace(/"/g,'""')+'"');
                }
                csv.push(row.join(','));
            }
            var blob=new Blob(['\\uFEFF'+csv.join('\\n')],{type:'text/csv;charset=utf-8;'});
            var a=document.createElement('a');
            a.href=URL.createObjectURL(blob);
            var d=new Date();
            a.download='agents_'+d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate())+'_'+pad(d.getHours())+pad(d.getMinutes())+pad(d.getSeconds())+'.csv';
            a.click();
            URL.revokeObjectURL(a.href);
        }

        var _cardFilter='all';
        function filterByCard(type){
            _cardFilter=type;
            var cards=document.querySelectorAll('.card');
            cards[0].classList.toggle('active',type==='all');
            cards[1].classList.toggle('active',type==='pending');
            cards[2].classList.toggle('active',type==='approved');
            cards[3].classList.toggle('active',type==='rejected');
            applyPerPage();
        }

        var _sortCol=-1,_sortAsc=true;
        function sortTable(col){
            var table=document.querySelector('.tbl-wrap table');
            var tbody=table.querySelector('tbody');
            var rows=Array.prototype.slice.call(tbody.querySelectorAll('tr'));
            if(rows.length<2 || rows[0].querySelector('td[colspan]'))return;
            var ths=table.querySelectorAll('thead th');
            if(_sortCol===col){_sortAsc=!_sortAsc;}else{_sortCol=col;_sortAsc=true;}
            for(var i=0;i<ths.length;i++){
                ths[i].classList.remove('sort-asc','sort-desc');
                var ar=ths[i].querySelector('.sort-arrow');
                if(ar)ar.innerHTML='\u21C5';
            }
            ths[col].classList.add(_sortAsc?'sort-asc':'sort-desc');
            var ar2=ths[col].querySelector('.sort-arrow');
            if(ar2)ar2.innerHTML=_sortAsc?'\u25B2':'\u25BC';
            rows.sort(function(a,b){
                var ca=a.querySelectorAll('td')[col];
                var cb=b.querySelectorAll('td')[col];
                if(!ca||!cb)return 0;
                var va=ca.textContent.trim(),vb=cb.textContent.trim();
                var na=parseFloat(va),nb=parseFloat(vb);
                if(!isNaN(na)&&!isNaN(nb)){return _sortAsc?na-nb:nb-na;}
                return _sortAsc?va.localeCompare(vb):vb.localeCompare(va);
            });
            for(var j=0;j<rows.length;j++){tbody.appendChild(rows[j]);}
            applyPerPage();
        }

        applyPerPage();
        </script>
        <div class="tbl-wrap">
            <table>
                <thead>
                    <tr>
                        <th onclick="sortTable(0)">ID<span class="sort-arrow">&udarr;</span></th><th onclick="sortTable(1)">Hostname<span class="sort-arrow">&udarr;</span></th><th onclick="sortTable(2)">OS<span class="sort-arrow">&udarr;</span></th><th onclick="sortTable(3)">IP Address<span class="sort-arrow">&udarr;</span></th>
                        <th onclick="sortTable(4)">Last Seen<span class="sort-arrow">&udarr;</span></th><th onclick="sortTable(5)">Status<span class="sort-arrow">&udarr;</span></th><th onclick="sortTable(6)">Integration<span class="sort-arrow">&udarr;</span></th><th onclick="sortTable(7)">Approval<span class="sort-arrow">&udarr;</span></th>
                        <th onclick="sortTable(8)">Approved At<span class="sort-arrow">&udarr;</span></th><th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                {% if agents %}
                    {% for a in agents %}
                    <tr>
                        <td style="color:#9ca3af;font-size:12px">{{ a.id }}</td>
                        <td style="color:#1e293b;font-weight:600">{{ a.hostname }}</td>
                        <td>{{ a.os_type }}</td>
                        <td style="font-family:inherit;color:#3b82f6">{{ a.ip or '—' }}</td>
                        <td style="font-size:12px;color:#6b7280">{{ a.last_seen }}</td>
                        <td><span class="badge badge-{{ a.status }}">{{ a.status }}</span></td>
                        <td><img src="/static/image/svg/lumina/free-icon-font-handshake.svg" class="integration-icon {{ 'linked' if a.integration == 'linked' else '' }}" title="{{ 'Linked' if a.integration == 'linked' else 'None' }}"></td>
                        <td><span class="badge badge-{{ a.approval }}">{{ a.approval_label }}</span></td>
                        <td style="color:#6b7280;font-size:12px">{{ a.approved_at or '—' }}</td>
                        <td>
                            {% if a.approval != 'approved' %}
                            <a href="/action/{{ a.id }}/approve" class="btn-action btn-approve"
                               onclick="return confirm('Approve agent {{ a.hostname }}?')" title="Approve"><img src="/static/image/svg/lumina/free-icon-font-map-marker-check.svg"></a>
                            {% endif %}
                            {% if a.approval != 'rejected' %}
                            <a href="/action/{{ a.id }}/reject" class="btn-action btn-reject"
                               onclick="return confirm('Reject agent {{ a.hostname }}?')" title="Reject"><img src="/static/image/svg/lumina/free-icon-font-comment-xmark.svg"></a>
                            {% endif %}
                            <a href="/action/{{ a.id }}/delete" class="btn-action btn-remove"
                               onclick="return confirm('Remove agent {{ a.hostname }}? This cannot be undone.')" title="Remove"><img src="/static/image/svg/lumina/free-icon-font-trash.svg"></a>
                        </td>
                    </tr>
                    {% endfor %}
                {% else %}
                    <tr><td colspan="10" style="text-align:center;color:#9ca3af;padding:48px;
                        font-size:13px">No registered agents</td></tr>
                {% endif %}
                </tbody>
            </table>
        </div>
    </div>
</div>
<div class="pw-overlay" id="pwModal">
<div class="pw-modal">
<h3>Change Password</h3>
<form method="POST" action="/settings/password">
<label>Current Password</label>
<input type="password" name="current" required autocomplete="current-password">
<label>New Password</label>
<input type="password" name="new_pw" required minlength="6" autocomplete="new-password">
<label>Confirm New Password</label>
<input type="password" name="confirm" required minlength="6" autocomplete="new-password">
<div class="pw-btns">
<button type="button" class="pw-cancel" onclick="document.getElementById('pwModal').classList.remove('open')">Cancel</button>
<button type="submit" class="pw-save">Save</button>
</div>
</form>
</div>
</div>
{% if msg %}<div class="msg {{ msg_cls }}">{{ msg }}</div>{% endif %}
</body>
</html>"""


# ═══════════════════════════════════════════════════════════
# Settings (NTP) Template
# ═══════════════════════════════════════════════════════════

SETTINGS_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lumina — Settings</title>
<link rel="icon" type="image/svg+xml" href="/static/image/svg/lumina/free-icon-letter-L.svg">
<style>
*{margin:0;padding:0;box-sizing:border-box}
::-webkit-scrollbar{width:6px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:#94a3b8}
*{scrollbar-width:thin;scrollbar-color:#cbd5e1 transparent}
body{background:#f4f6f9;color:#1e293b;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
     display:flex;min-height:100vh}
.sidebar{width:220px;background:#0f1729;color:#94a3b8;display:flex;flex-direction:column;
         padding:0;position:fixed;top:0;left:0;bottom:0;z-index:10}
.sidebar .brand{padding:24px 20px;border-bottom:1px solid rgba(255,255,255,0.06)}
.sidebar .brand img{height:28px}
.sidebar nav{flex:1;padding:16px 0}
.sidebar nav a{display:flex;align-items:center;padding:10px 20px;color:#94a3b8;text-decoration:none;
               font-size:13px;letter-spacing:0.3px;border-left:3px solid transparent}
.sidebar nav a.active{color:#fff;background:rgba(255,255,255,0.06);border-left-color:#3b82f6}
.sidebar nav a:hover{color:#e2e8f0;background:rgba(255,255,255,0.03)}
.sidebar nav a svg{width:16px;height:16px;margin-right:10px;opacity:0.6}
.sidebar .sb-footer{padding:16px 20px;border-top:1px solid rgba(255,255,255,0.06);
                    font-size:11px;color:#475569}
.main{margin-left:220px;flex:1;display:flex;flex-direction:column;min-height:100vh}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:0 32px;
        height:56px;background:#fff;border-bottom:1px solid #e5e7eb}
.topbar h1{font-size:15px;font-weight:600;color:#1e293b;letter-spacing:-0.2px}
.topbar-right{display:flex;align-items:center;gap:16px}
.topbar-right .user{font-size:12px;color:#64748b;background:#f1f5f9;padding:5px 12px;border-radius:4px;cursor:pointer;transition:background 0.15s}
.topbar-right .user:hover{background:#e2e8f0;color:#1e293b}
.btn-logout{padding:5px 14px;background:transparent;border:1px solid #e5e7eb;border-radius:4px;
            color:#64748b;font-size:11px;cursor:pointer;text-decoration:none;text-transform:uppercase;
            letter-spacing:0.5px;font-weight:600}
.btn-logout:hover{background:#f8fafc;border-color:#cbd5e1}
.pw-overlay{display:none;position:fixed;inset:0;background:rgba(15,23,42,0.5);z-index:9000;align-items:center;justify-content:center}
.pw-overlay.open{display:flex}
.pw-modal{background:#fff;border-radius:10px;padding:28px 32px;width:380px;box-shadow:0 8px 32px rgba(0,0,0,0.2)}
.pw-modal h3{font-size:15px;font-weight:700;color:#1e293b;margin-bottom:20px}
.pw-modal label{display:block;font-size:12px;color:#64748b;font-weight:600;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.3px}
.pw-modal input{width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;color:#1e293b;outline:none;margin-bottom:14px;box-sizing:border-box}
.pw-modal input:focus{border-color:#3b82f6}
.pw-modal .pw-btns{display:flex;gap:10px;margin-top:6px}
.pw-modal .pw-btns button{flex:1;padding:10px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;text-transform:uppercase;letter-spacing:0.5px}
.pw-modal .pw-save{background:#1e293b;color:#fff;border:none}
.pw-modal .pw-save:hover{background:#334155}
.pw-modal .pw-cancel{background:#fff;color:#64748b;border:1px solid #e2e8f0}
.pw-modal .pw-cancel:hover{background:#f8fafc}
.content{flex:1;padding:28px 32px}
.section{background:#fff;border-radius:8px;border:1px solid #e5e7eb;padding:28px 32px;margin-bottom:20px}
.section h2{font-size:14px;font-weight:700;color:#1e293b;margin-bottom:4px;text-transform:uppercase;
            letter-spacing:0.5px}
.section .desc{font-size:12px;color:#9ca3af;margin-bottom:20px}
.form-row{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.form-row label{width:140px;font-size:12px;color:#64748b;font-weight:600;text-transform:uppercase;
                letter-spacing:0.5px;flex-shrink:0}
.form-row input,.form-row select{flex:1;max-width:400px;padding:10px 14px;background:#f8fafc;
     border:1px solid #e2e8f0;border-radius:6px;color:#1e293b;font-size:13px;outline:none}
.form-row input:focus,.form-row select:focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,0.1)}
.btn-primary{padding:9px 24px;background:#1e293b;border:none;border-radius:6px;color:#fff;
             font-size:12px;font-weight:600;cursor:pointer;text-transform:uppercase;letter-spacing:0.5px}
.btn-primary:hover{background:#334155}
.btn-secondary{padding:9px 24px;background:#fff;border:1px solid #e5e7eb;border-radius:6px;color:#374151;
               font-size:12px;font-weight:600;cursor:pointer;text-transform:uppercase;letter-spacing:0.5px}
.btn-secondary:hover{background:#f9fafb;border-color:#d1d5db}
.btn-group{display:flex;gap:8px;margin-top:8px}
.ntp-status{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:4px;
            font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px}
.ntp-synced{background:#ecfdf5;color:#059669}
.ntp-unsynced{background:#fef2f2;color:#dc2626}
.ntp-unknown{background:#f3f4f6;color:#9ca3af}
.info-row{display:flex;align-items:center;gap:12px;margin-bottom:10px}
.info-row .lbl{width:140px;font-size:12px;color:#64748b;font-weight:600;text-transform:uppercase;
               letter-spacing:0.5px;flex-shrink:0}
.info-row .val{font-size:13px;color:#1e293b}
.msg{position:fixed;bottom:32px;left:50%;transform:translateX(-50%);padding:12px 24px;border-radius:8px;
    font-size:13px;font-weight:500;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.15);
    animation:toastIn .3s ease,toastOut .4s ease 2.6s forwards;pointer-events:none}
.msg-ok{background:#f0fdf4;color:#15803d;border:1px solid #86efac}
.msg-err{background:#fef2f2;color:#b91c1c;border:1px solid #fca5a5}
@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
@keyframes toastOut{from{opacity:1}to{opacity:0}}
.dot{width:6px;height:6px;border-radius:50%;display:inline-block}
.dot-green{background:#059669}
.dot-red{background:#dc2626}
.dot-gray{background:#9ca3af}
.server-list{margin-top:8px}
.server-item{display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px;color:#374151;
             border-bottom:1px solid #f3f4f6}
.server-item:last-child{border-bottom:none}
.server-item .idx{color:#9ca3af;font-size:11px;width:20px}
.remove-btn{background:none;border:none;color:#dc2626;font-size:16px;cursor:pointer;padding:0 4px;
            opacity:0.5}
.remove-btn:hover{opacity:1}
.add-row{display:flex;gap:8px;margin-top:12px}
.add-row input{flex:1;max-width:300px;padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;
               border-radius:6px;color:#1e293b;font-size:13px;outline:none}
.add-row input:focus{border-color:#3b82f6}
.btn-add{width:34px;height:34px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:50%;color:#64748b;
         font-size:18px;font-weight:400;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;line-height:1}
.btn-add:hover{background:#e2e8f0;color:#1e293b}
.content-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:stretch}
@media(max-width:1200px){.content-grid{grid-template-columns:1fr}}
.panel-box{background:#fff;border-radius:10px;border:1px solid #e2e8f0;overflow:hidden;
    box-shadow:0 2px 8px rgba(15,23,42,0.06);display:flex;flex-direction:column}
.panel-title{display:flex;align-items:center;gap:10px;padding:16px 24px;
    background:linear-gradient(135deg,#0f1729 0%,#1e293b 100%);
    font-size:13px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.8px}
.panel-title svg{width:18px;height:18px;opacity:0.7}
.panel-body{padding:28px 24px;flex:1;display:flex;flex-direction:column}
.panel-body hr{margin:24px 0!important}
.panel-body .desc{margin-bottom:16px}
.panel-body .btn-group{margin-top:auto;padding-top:16px}
/* ── Calendar Widget ── */
.cal-wrap{background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:16px;
    box-shadow:0 2px 8px rgba(15,23,42,0.06);flex:1;display:flex;flex-direction:column}
.cal-header{display:flex;align-items:center;justify-content:center;gap:8px;padding:16px 18px;
    background:linear-gradient(135deg,#0f1729 0%,#1e293b 100%);border-bottom:none}
.cal-nav{width:34px;height:34px;display:flex;align-items:center;justify-content:center;
    background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.15);border-radius:6px;
    cursor:pointer;color:rgba(255,255,255,0.7);font-size:18px;font-weight:700;
    transition:all 0.15s ease;-webkit-user-select:none;user-select:none;flex-shrink:0}
.cal-nav:hover{background:rgba(255,255,255,0.2);color:#fff}
.cal-sel{background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.18);border-radius:6px;
    color:#fff;font-size:13px;font-weight:600;padding:8px 12px;cursor:pointer;outline:none;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    -webkit-appearance:none;appearance:none;text-align:center;transition:all 0.15s ease;
    height:36px;box-sizing:border-box}
.cal-sel:hover,.cal-sel:focus{background:rgba(255,255,255,0.22);border-color:rgba(255,255,255,0.3)}
.cal-sel option{background:#1e293b;color:#fff;font-size:13px}
.cal-today-btn{background:rgba(59,130,246,0.2);border:1px solid rgba(59,130,246,0.3);border-radius:6px;
    color:#93c5fd;font-size:13px;font-weight:700;padding:8px 12px;cursor:pointer;
    text-transform:uppercase;letter-spacing:0.5px;transition:all 0.15s ease;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    height:36px;box-sizing:border-box}
.cal-today-btn:hover{background:rgba(59,130,246,0.35);color:#fff}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);grid-template-rows:auto repeat(7,1fr);padding:14px 16px 16px;flex:1}
.cal-dow{text-align:center;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;
    letter-spacing:0.5px;padding:10px 0 8px}
.cal-day{text-align:center;padding:0;font-size:14px;color:#374151;cursor:pointer;
    border-radius:50%;transition:all 0.12s ease;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    font-weight:500;line-height:1;display:flex;align-items:center;justify-content:center;
    width:36px;height:36px;margin:2px auto}
.cal-day:hover{background:#eff6ff;color:#2563eb}
.cal-day.other{color:#d1d5db;cursor:default}
.cal-day.other:hover{background:transparent;color:#d1d5db}
.cal-day.today{background:#eff6ff;color:#2563eb;font-weight:700;box-shadow:inset 0 0 0 1.5px #93c5fd}
.cal-day.selected{background:#1e293b;color:#fff;font-weight:700;box-shadow:0 2px 6px rgba(30,41,59,0.3)}
.cal-day.selected:hover{background:#334155}
/* ── Time Spinner ── */
.time-wrap{background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;
    box-shadow:0 2px 8px rgba(15,23,42,0.06)}
.time-header{padding:14px 18px;background:linear-gradient(135deg,#0f1729 0%,#1e293b 100%);
    font-size:11px;font-weight:700;color:rgba(255,255,255,0.8);text-transform:uppercase;letter-spacing:0.8px}
.time-body{display:flex;align-items:center;justify-content:center;padding:24px 16px 20px;gap:6px}
.time-col{display:flex;flex-direction:column;align-items:center;gap:6px}
.time-spin{width:40px;height:28px;display:flex;align-items:center;justify-content:center;
    background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;cursor:pointer;color:#64748b;
    font-size:10px;transition:all 0.12s ease;-webkit-user-select:none;user-select:none}
.time-spin:hover{background:#eff6ff;border-color:#93c5fd;color:#2563eb}
.time-spin:active{background:#dbeafe;transform:scale(0.95)}
.time-val{width:64px;height:56px;display:flex;align-items:center;justify-content:center;
    background:#f8fafc;border:2px solid #e2e8f0;border-radius:10px;font-size:26px;font-weight:700;
    color:#1e293b;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    letter-spacing:-0.5px;transition:all 0.15s ease}
.time-val:hover{border-color:#93c5fd;background:#fff;box-shadow:0 0 0 3px rgba(59,130,246,0.08)}
.time-sep{font-size:26px;font-weight:700;color:#cbd5e1;padding:0 2px;align-self:center;margin-bottom:20px;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.time-unit{font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;font-weight:600}
/* ── DT misc ── */
.dt-warning{display:flex;align-items:flex-start;gap:8px;padding:10px 14px;background:#fffbeb;border:1px solid #fde68a;
    border-radius:6px;margin-top:12px;font-size:11px;color:#92400e;line-height:1.5}
.dt-warning svg{flex-shrink:0;margin-top:1px}
.dt-selected{display:flex;align-items:center;gap:10px;padding:14px 18px;background:linear-gradient(135deg,#eff6ff,#f0f9ff);
    border:1px solid #bae6fd;border-radius:10px;margin-top:14px;font-size:13px;color:#0369a1;
    box-shadow:0 1px 4px rgba(14,165,233,0.08)}
.dt-selected .dt-val{font-size:18px;font-weight:700;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    color:#0c4a6e;letter-spacing:-0.3px}
</style>
</head>
<body>
<div class="sidebar">
    <div class="brand"><img src="/static/image/logo/lumina_black.png" alt="Lumina"></div>
    <nav>
        <a href="/" class="{{ 'active' if active_page == 'agents' else '' }}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            Agents
        </a>
    </nav>
    <div style="padding:8px 0;border-top:1px solid rgba(255,255,255,0.06)">
        <a href="/settings" class="{{ 'active' if active_page == 'settings' else '' }}" style="display:flex;align-items:center;padding:10px 20px;color:#94a3b8;text-decoration:none;font-size:13px;letter-spacing:0.3px;border-left:3px solid {{ '#3b82f6' if active_page == 'settings' else 'transparent' }}{% if active_page == 'settings' %};color:#fff;background:rgba(255,255,255,0.06){% endif %}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;margin-right:10px;opacity:0.6"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
            Settings
        </a>
    </div>
    <div class="sb-footer">&copy; 2026 Blossom</div>
</div>
<div class="main">
    <div class="topbar">
        <h1>Settings</h1>
        <div class="topbar-right">
            <span class="user" onclick="document.getElementById('pwModal').classList.add('open')">{{ user }}</span>
            <a href="/logout" class="btn-logout">Logout</a>
        </div>
    </div>
    <div class="content">
        
        <div class="content-grid">

        <!-- ═══ LEFT: NTP & TIMEZONE ═══ -->
        <div class="panel-box">
            <div class="panel-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                NTP &amp; Timezone
            </div>
            <div class="panel-body">

            <h2 style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px">NTP Status</h2>
            <p class="desc">Current synchronization state.</p>

            <div class="info-row">
                <span class="lbl">Sync Status</span>
                <span class="val">
                    {% if ntp_synced == True %}
                    <span class="ntp-status ntp-synced"><span class="dot dot-green"></span> Synchronized</span>
                    {% elif ntp_synced == False %}
                    <span class="ntp-status ntp-unsynced"><span class="dot dot-red"></span> Not Synchronized</span>
                    {% else %}
                    <span class="ntp-status ntp-unknown"><span class="dot dot-gray"></span> Unknown</span>
                    {% endif %}
                </span>
            </div>
            {% if ntp_source %}
            <div class="info-row">
                <span class="lbl">Current Source</span>
                <span class="val">{{ ntp_source }}</span>
            </div>
            {% endif %}
            {% if ntp_offset %}
            <div class="info-row">
                <span class="lbl">Time Offset</span>
                <span class="val">{{ ntp_offset }}</span>
            </div>
            {% endif %}
            <div class="info-row">
                <span class="lbl">Server Time</span>
                <span class="val" id="serverClock">{{ server_time }}</span>
            </div>

            <hr style="border:none;border-top:1px solid #f1f5f9;margin:20px 0">

            <form method="POST" action="/settings/ntp">
            <h2 style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px">NTP Servers</h2>
            <p class="desc">Manage the list of NTP servers.</p>

            <div class="server-list" id="serverList">
                {% for srv in ntp_servers %}
                <div class="server-item">
                    <span class="idx">{{ loop.index }}</span>
                    <span>{{ srv }}</span>
                    <button type="button" class="remove-btn" onclick="removeServer(this)" title="Remove">&times;</button>
                    <input type="hidden" name="servers" value="{{ srv }}">
                </div>
                {% endfor %}
                {% if not ntp_servers %}
                <div style="color:#9ca3af;font-size:13px;padding:12px 0">No NTP servers configured</div>
                {% endif %}
            </div>

            <div class="add-row">
                <input type="text" id="newServer" placeholder="e.g. time.google.com or 0.pool.ntp.org">
                <button type="button" class="btn-add" onclick="addServer()" title="Add server">+</button>
            </div>

            <hr style="border:none;border-top:1px solid #f1f5f9;margin:20px 0">

            <h2 style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px">Timezone</h2>
            <p class="desc">Current system timezone setting.</p>
            <div class="form-row">
                <label>Timezone</label>
                <select name="timezone" style="flex:1;max-width:400px;padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;color:#1e293b;font-size:13px;outline:none">
                {% for tz in timezones %}
                    <option value="{{ tz }}"{{ ' selected' if tz == timezone else '' }}>{{ tz }}</option>
                {% endfor %}
                </select>
            </div>

            <div class="btn-group" style="margin-top:16px">
                <button type="submit" class="btn-primary">Save &amp; Apply</button>
                <button type="button" class="btn-secondary" onclick="location.href='/settings/ntp/sync'">Sync System Time</button>
            </div>
            </form>

            </div>
        </div>

        <!-- ═══ RIGHT: DATE & TIME ═══ -->
        <div class="panel-box">
            <div class="panel-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                Date
            </div>
            <div class="panel-body">

            <div class="cal-wrap">
                <div class="cal-header">
                    <span class="cal-nav" onclick="calNav(-1)">&#8249;</span>
                    <select class="cal-sel" id="calYear" onchange="calSetY(this.value)" style="width:100px"></select>
                    <select class="cal-sel" id="calMonth" onchange="calSetM(this.value)" style="width:100px"></select>
                    <span class="cal-nav" onclick="calNav(1)">&#8250;</span>
                </div>
                <div class="cal-grid" id="calGrid"></div>
            </div>

            <form method="POST" action="/settings/datetime" id="dtForm" style="margin-top:auto" onsubmit="var n=new Date();document.getElementById('hdTime').value=pad2(n.getHours())+':'+pad2(n.getMinutes())+':'+pad2(n.getSeconds());">
                <input type="hidden" name="date" id="hdDate" value="{{ current_date }}">
                <input type="hidden" name="time" id="hdTime" value="{{ current_time }}">
                <div class="btn-group" style="padding-top:16px">
                    <button type="submit" class="btn-primary">Set Date</button>
                    <button type="button" class="btn-secondary" onclick="goToday()">Today</button>
                </div>
            </form>

            </div>
        </div>

        </div>

        <!-- ═══ BOTTOM: Server NTP Status ═══ -->
        <div style="margin-top:24px">
        <div class="panel-box">
            <div class="panel-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><circle cx="6" cy="6" r="1"/><circle cx="6" cy="18" r="1"/></svg>
                Server NTP Status (DB / AP / WEB)
            </div>
            <div class="panel-body" style="padding:0">
                <table style="width:100%;border-collapse:collapse;font-size:13px">
                <thead>
                    <tr style="background:#f8fafc;border-bottom:2px solid #e5e7eb">
                        <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">Server</th>
                        <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">IP</th>
                        <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">Purpose</th>
                        <th style="padding:12px 16px;text-align:center;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">Sync</th>
                        <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">Source</th>
                        <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">Timezone</th>
                        <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">NTP Servers</th>
                        <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">Server Time</th>
                    </tr>
                </thead>
                <tbody>
                {% for s in server_ntp_list %}
                    <tr style="border-bottom:1px solid #f1f5f9{% if loop.last %};border-bottom:none{% endif %}">
                        <td style="padding:12px 16px;font-weight:600;color:#1e293b">{{ s.hostname }}</td>
                        <td style="padding:12px 16px;color:#64748b;font-family:inherit">{{ s.ip }}</td>
                        <td style="padding:12px 16px;color:#374151">{{ s.purpose }}</td>
                        <td style="padding:12px 16px;text-align:center">
                            {% if s.error %}
                            <span class="ntp-status ntp-unknown"><span class="dot dot-gray"></span> Error</span>
                            {% elif s.synced == True %}
                            <span class="ntp-status ntp-synced"><span class="dot dot-green"></span> Synced</span>
                            {% elif s.synced == False %}
                            <span class="ntp-status ntp-unsynced"><span class="dot dot-red"></span> Not Synced</span>
                            {% else %}
                            <span class="ntp-status ntp-unknown"><span class="dot dot-gray"></span> Unknown</span>
                            {% endif %}
                        </td>
                        <td style="padding:12px 16px;color:#374151">{{ s.source or '—' }}</td>
                        <td style="padding:12px 16px;color:#374151">{{ s.timezone or '—' }}</td>
                        <td style="padding:12px 16px;color:#374151;font-size:12px">{{ s.servers | join(', ') if s.servers else '—' }}</td>
                        <td style="padding:12px 16px;color:#374151;font-family:inherit">{{ s.server_time or '—' }}</td>
                    </tr>
                {% endfor %}
                </tbody>
                </table>
                {% if server_ntp_list %}
                {% set has_error = server_ntp_list | selectattr('error') | list %}
                {% if has_error %}
                <div style="padding:12px 16px;background:#fef2f2;border-top:1px solid #fca5a5;font-size:12px;color:#991b1b">
                    {% for s in has_error %}
                    <div><strong>{{ s.hostname }}</strong> ({{ s.ip }}): {{ s.error }}</div>
                    {% endfor %}
                </div>
                {% endif %}
                {% endif %}
            </div>
        </div>
        </div>

    </div>
</div>
<script>
function addServer(){
    var inp=document.getElementById('newServer');
    var v=inp.value.trim();
    if(!v)return;
    var list=document.getElementById('serverList');
    var empty=list.querySelector('div[style]');
    if(empty&&empty.textContent.indexOf('No NTP')>=0)empty.remove();
    var idx=list.querySelectorAll('.server-item').length+1;
    var d=document.createElement('div');
    d.className='server-item';
    d.innerHTML='<span class="idx">'+idx+'</span><span>'+v.replace(/</g,'&lt;')+'</span>'+
        '<button type="button" class="remove-btn" onclick="removeServer(this)" title="Remove">&times;</button>'+
        '<input type="hidden" name="servers" value="'+v.replace(/"/g,'&quot;')+'">';
    list.appendChild(d);
    inp.value='';
    inp.focus();
}
function removeServer(btn){
    var f=btn.closest('form');
    btn.parentElement.remove();
    var items=document.querySelectorAll('#serverList .server-item');
    for(var i=0;i<items.length;i++)items[i].querySelector('.idx').textContent=i+1;
    /* auto-submit to persist removal */
    if(f)f.submit();
}

/* ── Custom Calendar ── */
var MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
var calY,calM,calSelY,calSelM,calSelD;
function pad2(n){return n<10?'0'+n:''+n;}
function buildSelects(){
    var ySel=document.getElementById('calYear');
    var mSel=document.getElementById('calMonth');
    ySel.innerHTML='';mSel.innerHTML='';
    for(var y=2000;y<=2040;y++){var o=document.createElement('option');o.value=y;o.textContent=y;if(y===calY)o.selected=true;ySel.appendChild(o);}
    for(var m=0;m<12;m++){var o=document.createElement('option');o.value=m+1;o.textContent=MONTHS[m];if(m+1===calM)o.selected=true;mSel.appendChild(o);}
}
function calSetY(v){calY=parseInt(v,10);renderCal();}
function calSetM(v){calM=parseInt(v,10);renderCal();}
function renderCal(){
    buildSelects();
    var g=document.getElementById('calGrid');
    g.innerHTML='';
    var dows=['SUN','MON','TUE','WED','THU','FRI','SAT'];
    for(var i=0;i<7;i++){var h=document.createElement('div');h.className='cal-dow';h.textContent=dows[i];g.appendChild(h);}
    var first=new Date(calY,calM-1,1).getDay();
    var days=new Date(calY,calM,0).getDate();
    var prevDays=new Date(calY,calM-1,0).getDate();
    for(var i=0;i<first;i++){var c=document.createElement('div');c.className='cal-day other';c.textContent=prevDays-first+1+i;g.appendChild(c);}
    var today=new Date();var tY=today.getFullYear(),tM=today.getMonth()+1,tD=today.getDate();
    for(var d=1;d<=days;d++){
        var c=document.createElement('div');c.className='cal-day';c.textContent=d;
        if(calY===tY&&calM===tM&&d===tD)c.className+=' today';
        if(calY===calSelY&&calM===calSelM&&d===calSelD)c.className+=' selected';
        c.setAttribute('data-d',d);
        c.onclick=function(){calSelY=calY;calSelM=calM;calSelD=parseInt(this.getAttribute('data-d'),10);renderCal();syncHidden();};
        g.appendChild(c);
    }
    var rem=42-first-days;
    for(var i=1;i<=rem;i++){var c=document.createElement('div');c.className='cal-day other';c.textContent=i;g.appendChild(c);}
}
function calNav(dir){calM+=dir;if(calM<1){calM=12;calY--;}if(calM>12){calM=1;calY++;}renderCal();}
function goToday(){var t=new Date();calY=calSelY=t.getFullYear();calM=calSelM=t.getMonth()+1;calSelD=t.getDate();renderCal();syncHidden();}
function syncHidden(){
    var ds=calSelY+'-'+pad2(calSelM)+'-'+pad2(calSelD);
    document.getElementById('hdDate').value=ds;
}
(function(){
    var p='{{ current_date }}'.split('-');
    calY=calSelY=parseInt(p[0],10);
    calM=calSelM=parseInt(p[1],10);
    calSelD=parseInt(p[2],10);
    renderCal();
    syncHidden();
})();
/* ── Live Server Clock ── */
(function(){
    var el=document.getElementById('serverClock');
    if(!el)return;
    var parts=el.textContent.trim().split(/[\s-:]/);
    var t=new Date(parseInt(parts[0]),parseInt(parts[1])-1,parseInt(parts[2]),parseInt(parts[3]),parseInt(parts[4]),parseInt(parts[5]));
    setInterval(function(){
        t=new Date(t.getTime()+1000);
        el.textContent=t.getFullYear()+'-'+pad2(t.getMonth()+1)+'-'+pad2(t.getDate())+' '+pad2(t.getHours())+':'+pad2(t.getMinutes())+':'+pad2(t.getSeconds());
    },1000);
})();
</script>
<div class="pw-overlay" id="pwModal">
<div class="pw-modal">
<h3>Change Password</h3>
<form method="POST" action="/settings/password">
<label>Current Password</label>
<input type="password" name="current" required autocomplete="current-password">
<label>New Password</label>
<input type="password" name="new_pw" required minlength="6" autocomplete="new-password">
<label>Confirm New Password</label>
<input type="password" name="confirm" required minlength="6" autocomplete="new-password">
<div class="pw-btns">
<button type="button" class="pw-cancel" onclick="document.getElementById('pwModal').classList.remove('open')">Cancel</button>
<button type="submit" class="pw-save">Save</button>
</div>
</form>
</div>
</div>
{% if msg %}<div class="msg {{ msg_cls }}">{{ msg }}</div>{% endif %}
</body>
</html>"""


def create_app():
    app = Flask(__name__)
    app.config["SECRET_KEY"] = os.environ.get("LUMINA_SECRET_KEY", "lumina-web-secret-key-change-me")
    app.config["DEBUG"] = False

    # ── Agent status calculation ────────────────────────────
    def _compute_status(row, db_now):
        if not row.get("is_active"):
            return "disabled"
        last = row.get("last_seen")
        if not last:
            return "offline"
        if isinstance(last, str):
            try:
                last = datetime.strptime(last, "%Y-%m-%d %H:%M:%S")
            except ValueError:
                return "offline"
        if isinstance(db_now, str):
            try:
                db_now = datetime.strptime(db_now, "%Y-%m-%d %H:%M:%S")
            except ValueError:
                db_now = datetime.now()
        age = (db_now - last).total_seconds()
        if age < 300:
            return "online"
        elif age < 3600:
            return "stale"
        return "offline"

    def _get_agents():
        """Fetch agent list for server-side rendering."""
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT NOW() as db_now")
        db_now = cur.fetchone()["db_now"]
        cur.execute("""
            SELECT h.*,
                   (SELECT i.ip_address
                    FROM collected_interfaces i
                    WHERE i.host_id = h.id AND i.ip_address IS NOT NULL
                    ORDER BY i.id ASC LIMIT 1) AS ip_address
            FROM collected_hosts h
            ORDER BY h.last_seen DESC
        """)
        rows = cur.fetchall()
        conn.close()

        agents = []
        for r in rows:
            approval = r.get("approval_status") or "pending"
            label_map = {"pending": "Pending", "approved": "Approved", "rejected": "Rejected"}
            agents.append({
                "id": r["id"],
                "hostname": r.get("hostname", ""),
                "os_type": r.get("os_type", ""),
                "ip": r.get("ip_address") or "",
                "last_seen": str(r["last_seen"]) if r.get("last_seen") else "",
                "status": _compute_status(r, db_now),
                "approval": approval,
                "approval_label": label_map.get(approval, approval),
                "approved_at": str(r["approved_at"]) if r.get("approved_at") else None,
                "integration": "none",
            })
        return agents

    # ── Login ────────────────────────────────────────────
    @app.route("/login", methods=["GET", "POST"])
    def login_page():
        error = None
        if request.method == "POST":
            emp_no = (request.form.get("emp_no") or "").strip()
            password = (request.form.get("password") or "").strip()
            if emp_no == "admin" and password == _get_admin_password():
                session["logged_in"] = True
                session["user"] = emp_no
                return redirect(url_for("dashboard"))
            else:
                error = "Invalid employee ID or password."
        return render_template_string(LOGIN_HTML, error=error)

    @app.route("/logout")
    def logout():
        session.clear()
        return redirect(url_for("login_page"))

    # ── Dashboard (server-side rendering) ─────────────
    @app.route("/")
    @login_required
    def dashboard():
        msg = session.pop("msg", None)
        msg_cls = session.pop("msg_cls", "msg-ok")
        try:
            agents = _get_agents()
        except Exception as e:
            agents = []
            msg = "DB Error: %s" % str(e)
            msg_cls = "msg-err"

        total = len(agents)
        cnt_pending = sum(1 for a in agents if a["approval"] == "pending")
        cnt_approved = sum(1 for a in agents if a["approval"] == "approved")
        cnt_rejected = sum(1 for a in agents if a["approval"] == "rejected")

        return render_template_string(
            DASHBOARD_HTML,
            user=session.get("user", "admin"),
            agents=agents,
            total=total,
            cnt_pending=cnt_pending,
            cnt_approved=cnt_approved,
            cnt_rejected=cnt_rejected,
            render_time=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            msg=msg,
            msg_cls=msg_cls,
            active_page="agents",
        )

    # ── Approve/Reject action (GET link → redirect) ───
    @app.route("/action/<int:agent_id>/<action>")
    @login_required
    def agent_action(agent_id, action):
        if action not in ("approve", "reject", "delete"):
            session["msg"] = "Invalid request."
            session["msg_cls"] = "msg-err"
            return redirect(url_for("dashboard"))

        try:
            conn = get_db()
            cur = conn.cursor()
            user = session.get("user", "admin")
            if action == "delete":
                cur.execute("SELECT id FROM collected_hosts WHERE id=%s", (agent_id,))
                if not cur.fetchone():
                    session["msg"] = "Agent not found. (ID=%d)" % agent_id
                    session["msg_cls"] = "msg-err"
                else:
                    cur.execute("DELETE FROM collected_interfaces WHERE host_id=%s", (agent_id,))
                    cur.execute("DELETE FROM collected_accounts WHERE host_id=%s", (agent_id,))
                    cur.execute("DELETE FROM collected_packages WHERE host_id=%s", (agent_id,))
                    cur.execute("DELETE FROM collected_hosts WHERE id=%s", (agent_id,))
                    conn.commit()
                    session["msg"] = "Agent ID=%d deleted" % agent_id
                    session["msg_cls"] = "msg-ok"
            else:
                status_val = "approved" if action == "approve" else "rejected"
                cur.execute(
                    "UPDATE collected_hosts SET approval_status=%s, "
                    "approved_by=%s, approved_at=NOW() WHERE id=%s",
                    (status_val, user, agent_id)
                )
                if cur.rowcount == 0:
                    session["msg"] = "Agent not found. (ID=%d)" % agent_id
                    session["msg_cls"] = "msg-err"
                else:
                    conn.commit()
                    label = "approved" if action == "approve" else "rejected"
                    session["msg"] = "Agent ID=%d %s" % (agent_id, label)
                    session["msg_cls"] = "msg-ok"
            conn.close()
        except Exception as e:
            session["msg"] = "Error: %s" % str(e)
            session["msg_cls"] = "msg-err"

        return redirect(url_for("dashboard"))

    # ── Settings / NTP ───────────────────────────────────
    import shlex

    def _run_cmd(cmd, timeout=5):
        """Python 3.6 compatible subprocess.run wrapper."""
        return subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              universal_newlines=True, timeout=timeout)

    def _ntp_status():
        """Query chrony/ntpd status on the server."""
        info = {"synced": None, "source": None, "offset": None, "servers": [], "timezone": ""}
        try:
            r = _run_cmd(["timedatectl", "show"])
            for line in r.stdout.splitlines():
                if line.startswith("NTP="):
                    info["ntp_enabled"] = line.split("=", 1)[1].strip().lower() == "yes"
                if line.startswith("NTPSynchronized="):
                    info["synced"] = line.split("=", 1)[1].strip().lower() == "yes"
                if line.startswith("Timezone="):
                    info["timezone"] = line.split("=", 1)[1].strip()
        except Exception:
            pass

        # Try chronyc first, fall back to ntpq
        try:
            r = _run_cmd(["chronyc", "tracking"])
            if r.returncode == 0:
                for line in r.stdout.splitlines():
                    if line.startswith("Reference ID"):
                        parts = line.split("(")
                        if len(parts) > 1:
                            info["source"] = parts[1].rstrip(")")
                    if "System time" in line:
                        info["offset"] = line.split(":", 1)[1].strip()
        except FileNotFoundError:
            try:
                r = _run_cmd(["ntpq", "-p"])
                if r.returncode == 0:
                    for line in r.stdout.splitlines():
                        if line.startswith("*"):
                            parts = line.split()
                            if parts:
                                info["source"] = parts[0].lstrip("*")
                                if len(parts) > 8:
                                    info["offset"] = parts[8] + " ms"
            except FileNotFoundError:
                pass

        # Read configured NTP servers from chrony.conf or ntp.conf
        for conf_path in ["/etc/chrony.conf", "/etc/chrony/chrony.conf", "/etc/ntp.conf"]:
            try:
                with open(conf_path) as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith(("server ", "pool ")):
                            parts = line.split()
                            if len(parts) >= 2:
                                info["servers"].append(parts[1])
                break
            except FileNotFoundError:
                continue

        if not info["timezone"]:
            try:
                info["timezone"] = os.path.realpath("/etc/localtime").split("zoneinfo/", 1)[1]
            except Exception:
                info["timezone"] = "Unknown"

        return info

    def _available_timezones():
        """List available timezones from the system zoneinfo database."""
        tz_list = []
        zoneinfo_dir = "/usr/share/zoneinfo"
        try:
            r = _run_cmd(["timedatectl", "list-timezones"])
            if r.returncode == 0 and r.stdout.strip():
                tz_list = [line.strip() for line in r.stdout.splitlines() if line.strip()]
        except Exception:
            pass
        if not tz_list:
            # Fallback: common timezones
            tz_list = [
                "Africa/Cairo", "Africa/Johannesburg", "Africa/Lagos",
                "America/Anchorage", "America/Chicago", "America/Denver",
                "America/Los_Angeles", "America/New_York", "America/Sao_Paulo",
                "America/Toronto",
                "Asia/Bangkok", "Asia/Colombo", "Asia/Dubai", "Asia/Hong_Kong",
                "Asia/Jakarta", "Asia/Kolkata", "Asia/Manila", "Asia/Seoul",
                "Asia/Shanghai", "Asia/Singapore", "Asia/Taipei", "Asia/Tokyo",
                "Australia/Melbourne", "Australia/Sydney",
                "Europe/Amsterdam", "Europe/Berlin", "Europe/Istanbul",
                "Europe/London", "Europe/Moscow", "Europe/Paris", "Europe/Rome",
                "Pacific/Auckland", "Pacific/Honolulu",
                "UTC",
            ]
        return tz_list

    @app.route("/settings")
    @login_required
    def settings_page():
        msg = session.pop("msg", None)
        msg_cls = session.pop("msg_cls", "msg-ok")
        ntp = _ntp_status()
        tz_list = _available_timezones()
        current_tz = ntp.get("timezone", "")
        if current_tz and current_tz not in tz_list:
            tz_list.insert(0, current_tz)
        now = datetime.now()

        # Gather NTP status from all Lumina servers
        server_ntp_list = []
        for srv in LUMINA_SERVERS:
            st = _remote_ntp_status(srv)
            server_ntp_list.append({
                "hostname": srv["hostname"],
                "purpose": srv["purpose"],
                "ip": srv["ip"],
                "synced": st.get("synced"),
                "source": st.get("source", ""),
                "timezone": st.get("timezone", ""),
                "servers": st.get("servers", []),
                "server_time": st.get("server_time", ""),
                "error": st.get("error"),
            })

        return render_template_string(
            SETTINGS_HTML,
            user=session.get("user", "admin"),
            active_page="settings",
            ntp_synced=ntp.get("synced"),
            ntp_source=ntp.get("source"),
            ntp_offset=ntp.get("offset"),
            ntp_servers=ntp.get("servers", []),
            timezone=current_tz,
            timezones=tz_list,
            server_time=now.strftime("%Y-%m-%d %H:%M:%S"),
            current_date=now.strftime("%Y-%m-%d"),
            current_time=now.strftime("%H:%M:%S"),
            msg=msg,
            msg_cls=msg_cls,
            server_ntp_list=server_ntp_list,
        )

    @app.route("/settings/password", methods=["POST"])
    @login_required
    def settings_password():
        current = (request.form.get("current") or "").strip()
        new_pw = (request.form.get("new_pw") or "").strip()
        confirm = (request.form.get("confirm") or "").strip()

        if current != _get_admin_password():
            session["msg"] = "Current password is incorrect."
            session["msg_cls"] = "msg-err"
        elif len(new_pw) < 6:
            session["msg"] = "New password must be at least 6 characters."
            session["msg_cls"] = "msg-err"
        elif new_pw != confirm:
            session["msg"] = "New passwords do not match."
            session["msg_cls"] = "msg-err"
        else:
            try:
                _set_admin_password(new_pw)
                session["msg"] = "Password changed successfully."
                session["msg_cls"] = "msg-ok"
            except Exception as e:
                session["msg"] = "Failed to change password: %s" % str(e)
                session["msg_cls"] = "msg-err"

        # Redirect back to referrer page
        ref = request.referrer or url_for("dashboard")
        return redirect(ref)

    @app.route("/settings/ntp", methods=["POST"])
    @login_required
    def settings_ntp_save():
        servers = request.form.getlist("servers")
        timezone = (request.form.get("timezone") or "").strip()

        # Validate server entries (hostname or IP only, no shell injection)
        valid_pattern = re.compile(r'^[a-zA-Z0-9._-]+$')
        clean_servers = [s.strip() for s in servers if s.strip() and valid_pattern.match(s.strip())]

        local_ok = False
        try:
            # Update chrony.conf (local)
            conf_path = "/etc/chrony.conf"
            if not os.path.exists(conf_path):
                conf_path = "/etc/chrony/chrony.conf"

            if os.path.exists(conf_path):
                with open(conf_path) as f:
                    lines = f.readlines()
                # Remove existing server/pool lines
                new_lines = [l for l in lines if not l.strip().startswith(("server ", "pool "))]
                # Insert new servers at the top
                for srv in clean_servers:
                    new_lines.insert(0, "server %s iburst\n" % srv)
                with open(conf_path, "w") as f:
                    f.writelines(new_lines)

                # Restart chronyd
                subprocess.run(["systemctl", "restart", "chronyd"], timeout=10)

            # Set timezone if provided
            if timezone and valid_pattern.match(timezone.replace("/", "").replace("-", "")):
                subprocess.run(["timedatectl", "set-timezone", timezone], timeout=5)

            local_ok = True
        except Exception as e:
            session["msg"] = "Failed to apply local NTP settings: %s" % str(e)
            session["msg_cls"] = "msg-err"
            return redirect(url_for("settings_page"))

        # Apply to remote DB/AP servers via SSH
        remote_results = []
        for srv in LUMINA_SERVERS:
            r = _apply_ntp_to_server(srv, clean_servers, timezone)
            remote_results.append(r)
            logger.info("NTP apply [%s/%s]: %s — %s",
                        srv["hostname"], srv["ip"], r["status"], r["msg"])

        # Build result message
        failed = [r for r in remote_results if r["status"] == "error"]
        if failed:
            fail_msgs = "; ".join("%s(%s): %s" % (r["server"]["hostname"], r["server"]["ip"], r["msg"])
                                  for r in failed)
            session["msg"] = "NTP saved locally. Remote errors: %s" % fail_msgs
            session["msg_cls"] = "msg-err"
        else:
            session["msg"] = "NTP configuration saved and applied to all servers (DB/AP/WEB)."
            session["msg_cls"] = "msg-ok"

        return redirect(url_for("settings_page"))

    @app.route("/settings/ntp/sync")
    @login_required
    def settings_ntp_force_sync():
        # Force sync local
        local_ok = False
        try:
            r = _run_cmd(["chronyc", "makestep"], timeout=10)
            if r.returncode == 0:
                local_ok = True
            else:
                session["msg"] = "Sync command returned: %s" % (r.stderr or r.stdout).strip()
                session["msg_cls"] = "msg-err"
        except FileNotFoundError:
            try:
                _run_cmd(["ntpdate", "-u", "pool.ntp.org"], timeout=10)
                local_ok = True
            except Exception as e:
                session["msg"] = "Force sync failed: %s" % str(e)
                session["msg_cls"] = "msg-err"
        except Exception as e:
            session["msg"] = "Force sync failed: %s" % str(e)
            session["msg_cls"] = "msg-err"

        # Force sync remote servers
        sync_cmd = "chronyc makestep 2>/dev/null || ntpdate -u pool.ntp.org 2>/dev/null || true"
        failed = []
        local_ips = _get_local_ips()
        for srv in LUMINA_SERVERS:
            if srv["ip"] in local_ips:
                continue  # Already synced locally
            r = _ssh_run(srv["ip"], srv["account"], srv["password"], sync_cmd)
            if not r.get("ok"):
                failed.append("%s(%s)" % (srv["hostname"], srv["ip"]))

        if local_ok and not failed:
            session["msg"] = "Time synchronization forced on all servers (DB/AP/WEB)."
            session["msg_cls"] = "msg-ok"
        elif local_ok and failed:
            session["msg"] = "Local sync OK. Failed on: %s" % ", ".join(failed)
            session["msg_cls"] = "msg-err"

        return redirect(url_for("settings_page"))

    @app.route("/settings/datetime", methods=["POST"])
    @login_required
    def settings_datetime_set():
        date_str = (request.form.get("date") or "").strip()
        time_str = (request.form.get("time") or "").strip()

        if not date_str or not time_str:
            session["msg"] = "Both date and time are required."
            session["msg_cls"] = "msg-err"
            return redirect(url_for("settings_page"))

        if not re.match(r'^\d{4}-\d{2}-\d{2}$', date_str):
            session["msg"] = "Invalid date format."
            session["msg_cls"] = "msg-err"
            return redirect(url_for("settings_page"))
        if not re.match(r'^\d{2}:\d{2}(:\d{2})?$', time_str):
            session["msg"] = "Invalid time format."
            session["msg_cls"] = "msg-err"
            return redirect(url_for("settings_page"))

        try:
            # Disable NTP before setting time manually
            subprocess.run(["timedatectl", "set-ntp", "false"], timeout=5)
            # Set the date and time
            dt_value = "%s %s" % (date_str, time_str)
            r = subprocess.run(["timedatectl", "set-time", dt_value], timeout=5)
            if r.returncode == 0:
                session["msg"] = "System time set to %s. NTP synchronization has been disabled." % dt_value
                session["msg_cls"] = "msg-ok"
            else:
                session["msg"] = "Failed to set system time."
                session["msg_cls"] = "msg-err"
        except Exception as e:
            session["msg"] = "Failed to set date/time: %s" % str(e)
            session["msg_cls"] = "msg-err"

        return redirect(url_for("settings_page"))

    # ── Health check ─────────────────────────────────────
    @app.route("/health")
    def health():
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT 1")
            conn.close()
            return jsonify({"status": "ok"}), 200
        except Exception as e:
            return jsonify({"status": "error", "detail": str(e)}), 503

    # ── API Summary (no auth) ─────────────────────────────────
    @app.route("/api/dashboard/summary")
    def api_summary():
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) AS cnt FROM collected_hosts WHERE is_active=1")
            active = cur.fetchone()["cnt"]
            cur.execute("SELECT COUNT(*) AS cnt FROM collected_interfaces")
            ifaces = cur.fetchone()["cnt"]
            cur.execute("SELECT COUNT(*) AS cnt FROM collected_accounts")
            accts = cur.fetchone()["cnt"]
            cur.execute("SELECT COUNT(*) AS cnt FROM collected_packages")
            pkgs = cur.fetchone()["cnt"]
            conn.close()
            return jsonify({"active_hosts": active, "interfaces": ifaces,
                           "accounts": accts, "packages": pkgs})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    # ── CLI Management API ───────────────────────────────────
    try:
        from app.cli_api import cli_bp
    except ModuleNotFoundError:
        from cli_api import cli_bp
    app.register_blueprint(cli_bp)

    return app

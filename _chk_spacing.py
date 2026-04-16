#!/usr/bin/env python3
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456', timeout=10)

cmds = [
    ("CSS version in HTML",
     "grep -n 'insight.css' /opt/blossom/web/app/templates/5.insight/5-1.insight/5-1-1.trend/1.trend_list.html"),
    ("blog-view-field[hidden] in CSS",
     r"grep -n -A6 'blog-view-field\[hidden\]' /opt/blossom/web/static/css/insight.css"),
    ("JS version in HTML",
     "grep -n 'insight_list_common' /opt/blossom/web/app/templates/5.insight/5-1.insight/5-1-1.trend/1.trend_list.html"),
    ("style.display in JS",
     "grep -n 'style.display' /opt/blossom/web/static/js/5.insight/5-1.insight/insight_list_common.js"),
    ("All blog-view-field rules in CSS",
     "grep -n 'blog-view-field' /opt/blossom/web/static/css/insight.css"),
    ("blog-add-field gap/flex",
     "grep -n -A3 'blog-add-field' /opt/blossom/web/static/css/insight.css | head -30"),
    ("titleViewEl creation in JS",
     "grep -n -B2 -A5 'titleViewEl' /opt/blossom/web/static/js/5.insight/5-1.insight/insight_list_common.js | head -40"),
    ("modal form novalidate",
     "grep -n 'novalidate' /opt/blossom/web/app/templates/5.insight/5-1.insight/_shared/_content_editor_modal.html"),
]

for label, cmd in cmds:
    _, so, se = ssh.exec_command(cmd, timeout=10)
    out = so.read().decode().strip()
    err = se.read().decode().strip()
    print(f"=== {label} ===")
    print(out or err or "(empty)")
    print()

ssh.close()

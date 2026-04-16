#!/usr/bin/env python3
"""Verify enterprise dashboard."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.56.108", username="root", password="123456", timeout=10)

def run(cmd):
    _, o, _ = c.exec_command(cmd, timeout=30)
    o.channel.recv_exit_status()
    return o.read().decode(errors="replace").strip()

run("curl -sk -c /tmp/e_c.txt -d 'emp_no=admin&password=admin1234!' https://127.0.0.1:9601/login -o /dev/null")
run("curl -sk -b /tmp/e_c.txt https://127.0.0.1:9601/ -o /tmp/e_dash.html")

print("size:", run("wc -c /tmp/e_dash.html"))
print("sidebar:", run("grep -c 'sidebar' /tmp/e_dash.html"))
print("hostnames:", run("grep -oP 'font-weight:600\">[^<]+' /tmp/e_dash.html"))
print("cards:", run("grep -oP 'card-value[^>]+>[^<]+' /tmp/e_dash.html"))
print("IP:", run("grep -oP '3b82f6\">[^<]+' /tmp/e_dash.html"))
print("badge:", run("grep -c 'badge-' /tmp/e_dash.html"))

c.close()

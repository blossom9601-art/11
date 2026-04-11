#!/bin/bash
set -e
SERVER=192.168.56.104
PASS=123456
RPM=/mnt/c/Users/ME/Desktop/blossom/agents/linux/dist/lumina-agent-1.0.3-1.noarch.rpm

sshpass -p "$PASS" scp -o StrictHostKeyChecking=no "$RPM" root@$SERVER:/tmp/

sshpass -p "$PASS" ssh -o StrictHostKeyChecking=no root@$SERVER bash -s <<'REMOTE'
systemctl stop lumina-agent 2>/dev/null || true
rpm -e lumina-agent 2>/dev/null || true
rpm -ivh /tmp/lumina-agent-1.0.3-1.noarch.rpm
sed -i 's/^host =$/host = 192.168.56.104/' /etc/lumina/lumina.conf
sed -i 's/^port = 443$/port = 8080/' /etc/lumina/lumina.conf
sed -i 's/^protocol = https$/protocol = http/' /etc/lumina/lumina.conf
# verify_ssl = true 유지 (운영환경 보안 강제)
systemctl daemon-reload
systemctl restart lumina-agent
sleep 3
systemctl status lumina-agent --no-pager -l
REMOTE

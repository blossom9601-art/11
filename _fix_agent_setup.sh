#!/bin/bash
# Fix lumina-server agent IP and deploy agent on both 105 (self) and 104
set -e

# 1) Fix agent IP in DB: lumina-server should be 192.168.56.105
echo "=== Fixing lumina-server IP in agent_pending ==="
sqlite3 /opt/blossom/lumina/web/instance/dev_blossom.db \
  "UPDATE agent_pending SET ip_address='192.168.56.105' WHERE hostname='lumina-server';"
echo "Updated. Current agents:"
sqlite3 -header -column /opt/blossom/lumina/web/instance/dev_blossom.db \
  "SELECT id, hostname, ip_address, last_heartbeat FROM agent_pending;"

# 2) Install agent locally on 105 (self-monitoring)
echo ""
echo "=== Installing agent on lumina-server (self) ==="

# Create agent directories
mkdir -p /opt/lumina/linux/collectors
mkdir -p /opt/lumina/common
mkdir -p /etc/lumina
mkdir -p /var/log/lumina
mkdir -p /var/lib/lumina

# Copy agent files (from web deployment package)
cp /opt/blossom/lumina/cli/lumina_cli/../../../agents/common/*.py /opt/lumina/common/ 2>/dev/null || true
cp /opt/blossom/lumina/cli/lumina_cli/../../../agents/linux/*.py /opt/lumina/linux/ 2>/dev/null || true
cp /opt/blossom/lumina/cli/lumina_cli/../../../agents/linux/collectors/*.py /opt/lumina/linux/collectors/ 2>/dev/null || true

echo "Agent files installed to /opt/lumina/"

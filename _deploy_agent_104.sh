#!/bin/bash
# Deploy and start Lumina agent on pcoodb01 (192.168.56.104)
# Manager server: 192.168.56.105
set -e

INSTALL_DIR="/opt/lumina"
CONF_DIR="/etc/lumina"
DATA_DIR="/var/lib/lumina"
LOG_DIR="/var/log/lumina"

echo "=== Lumina Agent Installation (pcoodb01) ==="

# 1) Create lumina user if not exists
id -u lumina &>/dev/null || {
    useradd -r -s /sbin/nologin -d /var/lib/lumina lumina
    echo "  Created lumina user"
}

# 2) Create directories
mkdir -p "$INSTALL_DIR/common" "$INSTALL_DIR/linux/collectors"
mkdir -p "$CONF_DIR" "$DATA_DIR" "$LOG_DIR"

# 3) Copy agent files
cp /tmp/agent_deploy/common/__init__.py   "$INSTALL_DIR/common/"
cp /tmp/agent_deploy/common/config.py     "$INSTALL_DIR/common/"
cp /tmp/agent_deploy/common/collector.py  "$INSTALL_DIR/common/"
cp /tmp/agent_deploy/linux/__init__.py    "$INSTALL_DIR/linux/"
cp /tmp/agent_deploy/linux/agent.py       "$INSTALL_DIR/linux/"
cp /tmp/agent_deploy/linux/collectors/__init__.py    "$INSTALL_DIR/linux/collectors/"
cp /tmp/agent_deploy/linux/collectors/interface.py   "$INSTALL_DIR/linux/collectors/"
cp /tmp/agent_deploy/linux/collectors/account.py     "$INSTALL_DIR/linux/collectors/"
cp /tmp/agent_deploy/linux/collectors/package.py     "$INSTALL_DIR/linux/collectors/"

# 4) Create HTTPS-only config (pointing to manager 192.168.56.105)
cat > "$CONF_DIR/lumina.conf" << 'EOF'
[server]
host = 192.168.56.105
port = 443
protocol = https
verify_ssl = false
ca_cert =
client_cert =
client_key =
connect_timeout = 10
read_timeout = 30

[agent]
interval = 3600
auto_start = true
output_dir = /var/lib/lumina
collectors = interface, account, package
agent_id = auto
site =
env = prod
retry_interval = 60
max_retry_interval = 3600
max_queue_size_mb = 100

[logging]
level = info
file = /var/log/lumina/lumina.log
max_size_mb = 50
backup_count = 5

[security]
enrollment_token =
auth_token =
mask_sensitive = true
run_as = lumina

[network]
proxy =
no_proxy =
dns_timeout = 5
EOF

# 5) Set permissions
chown -R lumina:lumina "$INSTALL_DIR" "$DATA_DIR" "$LOG_DIR"
chmod 640 "$CONF_DIR/lumina.conf"

# 6) Register systemd service
cat > /etc/systemd/system/lumina-agent.service << 'EOF'
[Unit]
Description=Lumina Asset Discovery Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
Group=root
ExecStart=/usr/bin/python3 /opt/lumina/linux/agent.py --conf /etc/lumina/lumina.conf
Restart=on-failure
RestartSec=30
StandardOutput=journal
StandardError=journal
ProtectSystem=full
NoNewPrivileges=yes

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable lumina-agent
systemctl restart lumina-agent

echo ""
echo "=== Agent installed and started ==="
systemctl status lumina-agent --no-pager -l | head -10

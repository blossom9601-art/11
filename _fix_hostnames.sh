#!/bin/bash
# Fix agent hostnames in production DB
sqlite3 /opt/blossom/lumina/web/instance/dev_blossom.db <<'SQL'
UPDATE agent_pending SET hostname='pcoodb01', fqdn='pcoodb01' WHERE id=1;
UPDATE agent_pending SET hostname='lumina-server', fqdn='lumina-server' WHERE id=2;
SQL
echo "Updated. Current data:"
sqlite3 -header -column /opt/blossom/lumina/web/instance/dev_blossom.db "SELECT id, hostname, ip_address, last_heartbeat FROM agent_pending"

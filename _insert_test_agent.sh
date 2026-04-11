#!/bin/bash
# Insert test agents into production for CLI testing
sshpass -p "123456" ssh -o StrictHostKeyChecking=no root@192.168.56.105 << 'REMOTE'
sqlite3 /opt/blossom/lumina/web/instance/dev_blossom.db <<'SQL'
INSERT INTO agent_pending(hostname,ip_address,os_type,os_version,payload,received_at,last_heartbeat,is_linked,linked_asset_id,fqdn,is_enabled)
VALUES('pcoodb01','192.168.56.104','linux','Rocky Linux 8.10','{"cpu":4,"mem":8192}',datetime('now'),datetime('now'),0,NULL,'pcoodb01',1);

INSERT INTO agent_pending(hostname,ip_address,os_type,os_version,payload,received_at,last_heartbeat,is_linked,linked_asset_id,fqdn,is_enabled)
VALUES('lumina-server','192.168.56.105','linux','Rocky Linux 8.10','{"cpu":2,"mem":4096}',datetime('now','-2 hours'),datetime('now','-2 hours'),0,NULL,'lumina-server',1);
SQL

echo "Inserted agents. Count:"
sqlite3 /opt/blossom/lumina/web/instance/dev_blossom.db "SELECT count(1) FROM agent_pending"
REMOTE

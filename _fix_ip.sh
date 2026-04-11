#!/bin/bash
# Fix IP and deploy agent
sqlite3 /opt/blossom/lumina/web/instance/dev_blossom.db "UPDATE agent_pending SET ip_address='192.168.56.105' WHERE hostname='lumina-server';"
echo "DB updated:"
sqlite3 -header -column /opt/blossom/lumina/web/instance/dev_blossom.db "SELECT id, hostname, ip_address FROM agent_pending;"

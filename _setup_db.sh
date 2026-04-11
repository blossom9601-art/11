#!/bin/bash
set -e

echo "=== [1] lumina-security.cnf 임시 백업 ==="
if [ -f /etc/my.cnf.d/lumina-security.cnf ]; then
    mv /etc/my.cnf.d/lumina-security.cnf /etc/my.cnf.d/lumina-security.cnf.bak
    echo "  백업 완료"
elif [ -f /etc/my.cnf.d/lumina-security.cnf.bak ]; then
    echo "  이미 백업됨"
fi

echo ""
echo "=== [2] MariaDB 재초기화 ==="
rm -rf /var/lib/mysql/*
mysql_install_db --user=mysql 2>&1 | tail -3
echo "  DB 초기화 완료"

echo ""
echo "=== [3] MariaDB 시작 ==="
systemctl start mariadb
echo "  MariaDB 상태: $(systemctl is-active mariadb)"

echo ""
echo "=== [4] DB 초기화 SQL 실행 ==="
cp /opt/blossom/lumina/sql/init.sql /tmp/lumina_init.sql
sed -i "s/CHANGE_ME_AP_WRITER_PASSWORD/LuminaAP2026!Secure/g" /tmp/lumina_init.sql
sed -i "s/CHANGE_ME_WEB_READER_PASSWORD/LuminaWEB2026!Secure/g" /tmp/lumina_init.sql
sed -i "s/CHANGE_ME_ADMIN_PASSWORD/LuminaAdmin2026!Secure/g" /tmp/lumina_init.sql
sed -i 's/REQUIRE SSL//g' /tmp/lumina_init.sql
mysql -u root < /tmp/lumina_init.sql 2>&1
echo "  SQL 실행 완료"

echo ""
echo "=== [5] DB 검증 ==="
echo "--- Databases ---"
mysql -u root -e "SHOW DATABASES LIKE 'lumina';"
echo "--- Users ---"
mysql -u root -e "SELECT User, Host FROM mysql.user WHERE User LIKE 'lumina%';"
echo "--- Tables ---"
mysql -u root -e "USE lumina; SHOW TABLES;"

echo ""
echo "=== [6] lumina-security.cnf 호환 버전 복원 ==="
cat > /etc/my.cnf.d/lumina-security.cnf << 'CNFEOF'
[mysqld]
# 문자셋
character_set_server = utf8mb4
collation_server = utf8mb4_unicode_ci

# 네트워크
bind-address = 0.0.0.0
skip_name_resolve = ON

# 연결 제한
max_connections = 200
wait_timeout = 300
interactive_timeout = 300
connect_timeout = 10

# InnoDB
innodb_buffer_pool_size = 128M
innodb_flush_log_at_trx_commit = 2
innodb_flush_method = O_DIRECT
innodb_file_per_table = ON

# 슬로우 쿼리
slow_query_log = ON
slow_query_log_file = /var/log/mariadb/lumina-slow.log
long_query_time = 2

# 보안
local_infile = OFF
symbolic_links = OFF
event_scheduler = ON

[client]
default_character_set = utf8mb4

[mysql]
default_character_set = utf8mb4
CNFEOF

systemctl restart mariadb
echo "  MariaDB 재시작 상태: $(systemctl is-active mariadb)"

echo ""
echo "=== [7] DB 접속 테스트 (lumina_ap_writer) ==="
mysql -u lumina_ap_writer -p'LuminaAP2026!Secure' -e "SELECT COUNT(*) AS tables_count FROM information_schema.tables WHERE table_schema='lumina';" 2>&1

echo ""
echo "=== [8] DB 접속 테스트 (lumina_web_reader) ==="
mysql -u lumina_web_reader -p'LuminaWEB2026!Secure' -e "SELECT COUNT(*) AS tables_count FROM information_schema.tables WHERE table_schema='lumina';" 2>&1

echo ""
echo "=== DB 설정 완료 ==="

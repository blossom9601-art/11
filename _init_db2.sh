#!/bin/bash
set -e

# MariaDB에 TCP로 접속 (-h 127.0.0.1 사용, 소켓 파일 미생성 환경 대응)
MYSQL="mysql -h 127.0.0.1"

echo "=== [1] MariaDB 접속 테스트 ==="
$MYSQL -u root -e "SELECT 'MariaDB OK' AS status;"

echo ""
echo "=== [2] DB 초기화 SQL 실행 ==="
cp /opt/blossom/lumina/sql/init.sql /tmp/lumina_init.sql
sed -i "s/CHANGE_ME_AP_WRITER_PASSWORD/LuminaAP2026\!Secure/g" /tmp/lumina_init.sql
sed -i "s/CHANGE_ME_WEB_READER_PASSWORD/LuminaWEB2026\!Secure/g" /tmp/lumina_init.sql
sed -i "s/CHANGE_ME_ADMIN_PASSWORD/LuminaAdmin2026\!Secure/g" /tmp/lumina_init.sql
sed -i "s/REQUIRE SSL//g" /tmp/lumina_init.sql
# localhost 한정 admin 계정을 % 로 변경 (TCP 접속 지원)
sed -i "s/'lumina_admin'@'localhost'/'lumina_admin'@'%'/g" /tmp/lumina_init.sql
$MYSQL -u root < /tmp/lumina_init.sql 2>&1
echo "  SQL 실행 완료"

echo ""
echo "=== [3] DB 검증 ==="
echo "--- Databases ---"
$MYSQL -u root -e "SHOW DATABASES LIKE 'lumina';"
echo "--- Users ---"
$MYSQL -u root -e "SELECT User, Host FROM mysql.user WHERE User LIKE 'lumina%';"
echo "--- Tables ---"
$MYSQL -u root -e "USE lumina; SHOW TABLES;"

echo ""
echo "=== [4] lumina_ap_writer 접속 테스트 ==="
$MYSQL -u lumina_ap_writer -p'LuminaAP2026!Secure' -e "SELECT COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema='lumina';" 2>&1

echo ""
echo "=== [5] lumina_web_reader 접속 테스트 ==="
$MYSQL -u lumina_web_reader -p'LuminaWEB2026!Secure' -e "SELECT COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema='lumina';" 2>&1

echo ""
echo "=== [6] lumina-security.cnf 호환 버전 생성 + 소켓 경로 수정 ==="
cat > /etc/my.cnf.d/lumina-security.cnf << 'CNFEOF'
[mysqld]
# 소켓 경로 명시
socket = /var/lib/mysql/mysql.sock

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
socket = /var/lib/mysql/mysql.sock

[mysql]
default_character_set = utf8mb4
socket = /var/lib/mysql/mysql.sock
CNFEOF
echo "  lumina-security.cnf 생성 완료"

echo ""
echo "=== [7] MariaDB 재시작 (소켓 경로 적용) ==="
systemctl restart mariadb
echo "  MariaDB 상태: $(systemctl is-active mariadb)"

echo ""
echo "=== [8] 소켓 접속 확인 ==="
sleep 2
ls -la /var/lib/mysql/mysql.sock 2>&1
mysql -u root -e "SELECT 'socket OK' AS test;" 2>&1

echo ""
echo "=== DB 설정 완료 ==="

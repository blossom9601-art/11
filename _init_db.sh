#!/bin/bash
set -e

echo "=== [1] MariaDB 접속 테스트 ==="
mysql -u root -e "SELECT 'MariaDB OK' AS status;"

echo ""
echo "=== [2] DB 초기화 SQL 실행 ==="
cp /opt/blossom/lumina/sql/init.sql /tmp/lumina_init.sql
sed -i "s/CHANGE_ME_AP_WRITER_PASSWORD/LuminaAP2026\!Secure/g" /tmp/lumina_init.sql
sed -i "s/CHANGE_ME_WEB_READER_PASSWORD/LuminaWEB2026\!Secure/g" /tmp/lumina_init.sql
sed -i "s/CHANGE_ME_ADMIN_PASSWORD/LuminaAdmin2026\!Secure/g" /tmp/lumina_init.sql
sed -i "s/REQUIRE SSL//g" /tmp/lumina_init.sql
mysql -u root < /tmp/lumina_init.sql 2>&1
echo "  SQL 실행 완료"

echo ""
echo "=== [3] DB 검증 ==="
mysql -u root -e "SHOW DATABASES LIKE 'lumina';"
mysql -u root -e "SELECT User, Host FROM mysql.user WHERE User LIKE 'lumina%';"
mysql -u root -e "USE lumina; SHOW TABLES;"

echo ""
echo "=== [4] lumina_ap_writer 접속 테스트 ==="
mysql -u lumina_ap_writer -p'LuminaAP2026!Secure' -e "SELECT COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema='lumina';" 2>&1

echo ""
echo "=== [5] lumina_web_reader 접속 테스트 ==="
mysql -u lumina_web_reader -p'LuminaWEB2026!Secure' -e "SELECT COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema='lumina';" 2>&1

echo ""
echo "=== DB 설정 완료 ==="

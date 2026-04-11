#!/bin/bash
set -e

MYSQL="mysql -h 127.0.0.1"

echo "=== 비밀번호 재설정 ==="
$MYSQL -u root << 'SQLEOF'
ALTER USER 'lumina_ap_writer'@'%' IDENTIFIED BY 'LuminaAP2026Secure';
ALTER USER 'lumina_web_reader'@'%' IDENTIFIED BY 'LuminaWEB2026Secure';
ALTER USER 'lumina_admin'@'%' IDENTIFIED BY 'LuminaAdmin2026Secure';
FLUSH PRIVILEGES;
SQLEOF
echo "  비밀번호 재설정 완료"

echo ""
echo "=== secure.env 비밀번호도 업데이트 ==="
sed -i 's/LUMINA_DB_AP_PASSWORD=.*/LUMINA_DB_AP_PASSWORD=LuminaAP2026Secure/' /etc/blossom/lumina/secure.env
sed -i 's/LUMINA_DB_WEB_PASSWORD=.*/LUMINA_DB_WEB_PASSWORD=LuminaWEB2026Secure/' /etc/blossom/lumina/secure.env
sed -i 's/LUMINA_DB_ADMIN_PASSWORD=.*/LUMINA_DB_ADMIN_PASSWORD=LuminaAdmin2026Secure/' /etc/blossom/lumina/secure.env
echo "  secure.env 업데이트 완료"

echo ""
echo "=== lumina_ap_writer 접속 테스트 ==="
$MYSQL -u lumina_ap_writer -p'LuminaAP2026Secure' -e "SELECT COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema='lumina';" 2>&1

echo ""
echo "=== lumina_web_reader 접속 테스트 ==="
$MYSQL -u lumina_web_reader -p'LuminaWEB2026Secure' -e "SELECT COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema='lumina';" 2>&1

echo ""
echo "=== lumina_ap_writer INSERT 테스트 ==="
$MYSQL -u lumina_ap_writer -p'LuminaAP2026Secure' lumina -e "INSERT INTO audit_log (event_type, actor, target, action, result) VALUES ('TEST', 'setup_script', 'lumina', 'AP writer INSERT test', 'success'); SELECT 'INSERT OK' AS test;" 2>&1

echo ""
echo "=== lumina_web_reader READ 테스트 ==="
$MYSQL -u lumina_web_reader -p'LuminaWEB2026Secure' lumina -e "SELECT event_type, actor, action FROM audit_log ORDER BY id DESC LIMIT 3;" 2>&1

echo ""
echo "=== MariaDB 재시작 (소켓 + 보안 설정 적용) ==="
systemctl restart mariadb
sleep 2
echo "  MariaDB 상태: $(systemctl is-active mariadb)"
echo "  소켓 확인: $(ls -la /var/lib/mysql/mysql.sock 2>&1)"

echo ""
echo "=== 소켓으로 접속 테스트 ==="
mysql -u root -e "SELECT 'socket connection OK' AS test;" 2>&1

echo ""
echo "=== DB 설정 완료 ==="

#!/bin/bash
set -e

MYSQL="mysql -h 127.0.0.1"

echo "=== localhost 계정 추가 생성 ==="
$MYSQL -u root << 'SQLEOF'
CREATE USER IF NOT EXISTS 'lumina_ap_writer'@'localhost' IDENTIFIED BY 'LuminaAP2026Secure';
CREATE USER IF NOT EXISTS 'lumina_web_reader'@'localhost' IDENTIFIED BY 'LuminaWEB2026Secure';
CREATE USER IF NOT EXISTS 'lumina_admin'@'localhost' IDENTIFIED BY 'LuminaAdmin2026Secure';

GRANT SELECT, INSERT, UPDATE, DELETE ON lumina.* TO 'lumina_ap_writer'@'localhost';
GRANT SELECT ON lumina.* TO 'lumina_web_reader'@'localhost';
GRANT ALL PRIVILEGES ON lumina.* TO 'lumina_admin'@'localhost';

CREATE USER IF NOT EXISTS 'lumina_ap_writer'@'127.0.0.1' IDENTIFIED BY 'LuminaAP2026Secure';
CREATE USER IF NOT EXISTS 'lumina_web_reader'@'127.0.0.1' IDENTIFIED BY 'LuminaWEB2026Secure';

GRANT SELECT, INSERT, UPDATE, DELETE ON lumina.* TO 'lumina_ap_writer'@'127.0.0.1';
GRANT SELECT ON lumina.* TO 'lumina_web_reader'@'127.0.0.1';

FLUSH PRIVILEGES;
SQLEOF
echo "  계정 추가 완료"

echo ""
echo "=== 계정 목록 확인 ==="
$MYSQL -u root -e "SELECT User, Host FROM mysql.user WHERE User LIKE 'lumina%' ORDER BY User, Host;"

echo ""
echo "=== lumina_ap_writer 접속 테스트 (TCP) ==="
$MYSQL -u lumina_ap_writer -p'LuminaAP2026Secure' -e "SELECT 'AP writer TCP OK' AS test;" 2>&1

echo ""
echo "=== lumina_web_reader 접속 테스트 (TCP) ==="
$MYSQL -u lumina_web_reader -p'LuminaWEB2026Secure' -e "SELECT 'WEB reader TCP OK' AS test;" 2>&1

echo ""
echo "=== lumina_ap_writer INSERT 테스트 ==="
$MYSQL -u lumina_ap_writer -p'LuminaAP2026Secure' lumina -e "INSERT INTO audit_log (event_type, actor, target, action, result) VALUES ('TEST', 'setup_script', 'lumina', 'AP writer INSERT test', 'success'); SELECT 'INSERT OK' AS result;" 2>&1

echo ""
echo "=== lumina_web_reader READ-ONLY 테스트 ==="
$MYSQL -u lumina_web_reader -p'LuminaWEB2026Secure' lumina -e "SELECT event_type, actor, action FROM audit_log ORDER BY id DESC LIMIT 3;" 2>&1

echo ""
echo "=== lumina_web_reader WRITE 차단 확인 ==="
$MYSQL -u lumina_web_reader -p'LuminaWEB2026Secure' lumina -e "INSERT INTO audit_log (event_type, actor, action, result) VALUES ('MUST_FAIL', 'test', 'should be denied', 'failure');" 2>&1 && echo "ERROR: 쓰기가 허용됨!" || echo "  정상: 쓰기 차단됨 (READ-ONLY)"

echo ""
echo "=== MariaDB 재시작 (최종 설정 적용) ==="
systemctl restart mariadb
sleep 2
echo "  MariaDB: $(systemctl is-active mariadb)"

echo ""
echo "=== 소켓 접속 테스트 ==="
mysql -u root -e "SELECT 'socket OK' AS test;" 2>&1
mysql -u lumina_ap_writer -p'LuminaAP2026Secure' -e "SELECT 'socket AP OK' AS test;" 2>&1
mysql -u lumina_web_reader -p'LuminaWEB2026Secure' -e "SELECT 'socket WEB OK' AS test;" 2>&1

echo ""
echo "=== DB 완전 설정 완료 ==="

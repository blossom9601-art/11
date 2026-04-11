#!/bin/bash
echo "=== DB Users ==="
mysql -h 127.0.0.1 -u root -e "SELECT User, Host FROM mysql.user WHERE User LIKE 'lumina%'"

echo ""
echo "=== Grants lumina_ap_writer ==="
mysql -h 127.0.0.1 -u root -e "SHOW GRANTS FOR 'lumina_ap_writer'@'%'" 2>&1 || true
mysql -h 127.0.0.1 -u root -e "SHOW GRANTS FOR 'lumina_ap_writer'@'localhost'" 2>&1 || true

echo ""
echo "=== Grants lumina_web_reader ==="
mysql -h 127.0.0.1 -u root -e "SHOW GRANTS FOR 'lumina_web_reader'@'%'" 2>&1 || true
mysql -h 127.0.0.1 -u root -e "SHOW GRANTS FOR 'lumina_web_reader'@'localhost'" 2>&1 || true

echo ""
echo "=== Fix: Create localhost users ==="
mysql -h 127.0.0.1 -u root << 'SQL'
CREATE USER IF NOT EXISTS 'lumina_ap_writer'@'localhost' IDENTIFIED BY 'LuminaAP2026Secure';
CREATE USER IF NOT EXISTS 'lumina_web_reader'@'localhost' IDENTIFIED BY 'LuminaWEB2026Secure';
CREATE USER IF NOT EXISTS 'lumina_admin'@'localhost' IDENTIFIED BY 'LuminaAdmin2026Secure';
GRANT ALL PRIVILEGES ON lumina.* TO 'lumina_ap_writer'@'localhost';
GRANT SELECT ON lumina.* TO 'lumina_web_reader'@'localhost';
GRANT ALL PRIVILEGES ON lumina.* TO 'lumina_admin'@'localhost';

-- Also reset passwords for % hosts
ALTER USER 'lumina_ap_writer'@'%' IDENTIFIED BY 'LuminaAP2026Secure';
ALTER USER 'lumina_web_reader'@'%' IDENTIFIED BY 'LuminaWEB2026Secure';
ALTER USER 'lumina_admin'@'%' IDENTIFIED BY 'LuminaAdmin2026Secure';
FLUSH PRIVILEGES;
SELECT 'DB users fixed' AS status;
SQL

echo ""
echo "=== Test connections ==="
echo -n "  AP writer: "
mysql -h 127.0.0.1 -u lumina_ap_writer -pLuminaAP2026Secure lumina -e "SELECT 'OK' AS ap_conn" 2>&1 | grep -q OK && echo "✓" || echo "✗"
echo -n "  WEB reader: "
mysql -h 127.0.0.1 -u lumina_web_reader -pLuminaWEB2026Secure lumina -e "SELECT 'OK' AS web_conn" 2>&1 | grep -q OK && echo "✓" || echo "✗"
echo -n "  Admin: "
mysql -h 127.0.0.1 -u lumina_admin -pLuminaAdmin2026Secure lumina -e "SELECT 'OK' AS admin_conn" 2>&1 | grep -q OK && echo "✓" || echo "✗"

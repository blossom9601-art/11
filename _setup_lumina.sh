#!/bin/bash
set -e

echo "=== [1] TLS 자체서명 인증서 생성 (테스트용) ==="
TLSDIR="/etc/blossom/lumina/tls"
mkdir -p "$TLSDIR"

# CA 키/인증서
openssl genrsa -out "$TLSDIR/ca.key" 2048 2>/dev/null
openssl req -x509 -new -nodes -key "$TLSDIR/ca.key" \
    -sha256 -days 3650 \
    -subj "/C=KR/ST=Seoul/O=Blossom/CN=Blossom Lumina CA" \
    -out "$TLSDIR/ca.crt" 2>/dev/null

# 서버 키/CSR/인증서
openssl genrsa -out "$TLSDIR/server.key" 2048 2>/dev/null
openssl req -new -key "$TLSDIR/server.key" \
    -subj "/C=KR/ST=Seoul/O=Blossom/CN=192.168.56.105" \
    -out "$TLSDIR/server.csr" 2>/dev/null

cat > /tmp/san.ext << 'SANEOF'
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage=digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName=@alt_names
[alt_names]
IP.1=192.168.56.105
DNS.1=localhost
SANEOF

openssl x509 -req -in "$TLSDIR/server.csr" \
    -CA "$TLSDIR/ca.crt" -CAkey "$TLSDIR/ca.key" -CAcreateserial \
    -out "$TLSDIR/server.crt" -days 3650 -sha256 \
    -extfile /tmp/san.ext 2>/dev/null

chmod 0600 "$TLSDIR/server.key" "$TLSDIR/ca.key"
chmod 0644 "$TLSDIR/ca.crt" "$TLSDIR/server.crt"
echo "  TLS 인증서 생성 완료"
ls -la "$TLSDIR/"

echo ""
echo "=== [2] secure.env 실제 비밀값 설정 ==="
SECRET_KEY=$(python3 -c "import os; print(os.urandom(32).hex())")
AP_TOKEN=$(python3 -c "import os; print(os.urandom(32).hex())")
COL_KEY=$(python3 -c "import os; print(os.urandom(32).hex())")

cat > /etc/blossom/lumina/secure.env << ENVEOF
LUMINA_SECRET_KEY=${SECRET_KEY}
LUMINA_DB_AP_USER=lumina_ap_writer
LUMINA_DB_AP_PASSWORD=LuminaAP2026!Secure
LUMINA_DB_WEB_USER=lumina_web_reader
LUMINA_DB_WEB_PASSWORD=LuminaWEB2026!Secure
LUMINA_DB_ADMIN_USER=lumina_admin
LUMINA_DB_ADMIN_PASSWORD=LuminaAdmin2026!Secure
LUMINA_AP_AUTH_TOKEN=${AP_TOKEN}
LUMINA_COLUMN_ENCRYPT_KEY=${COL_KEY}
LUMINA_BACKUP_PASSPHRASE=BackupPass2026!Secure
ENVEOF
chmod 0600 /etc/blossom/lumina/secure.env
echo "  secure.env 설정 완료"

echo ""
echo "=== [3] db.conf — host를 localhost로 설정 ==="
sed -i 's/^host = db.example.com/host = localhost/' /etc/blossom/lumina/db.conf
echo "  db.conf host -> localhost"

echo ""
echo "=== [4] MariaDB 시작 및 TLS 비활성화 (테스트서버 단일노드) ==="
# 테스트 환경에서 TLS 관련 에러 방지: TLS 강제 비활성화
if [ -f /etc/my.cnf.d/lumina-security.cnf ]; then
    sed -i 's/^require_secure_transport = ON/# require_secure_transport = ON/' /etc/my.cnf.d/lumina-security.cnf
    sed -i 's|^ssl_ca |# ssl_ca |' /etc/my.cnf.d/lumina-security.cnf
    sed -i 's|^ssl_cert |# ssl_cert |' /etc/my.cnf.d/lumina-security.cnf
    sed -i 's|^ssl_key |# ssl_key |' /etc/my.cnf.d/lumina-security.cnf
    echo "  lumina-security.cnf TLS 강제 비활성화 (테스트)"
fi

systemctl start mariadb 2>&1 || true
systemctl enable mariadb 2>&1 || true
echo "  MariaDB 상태: $(systemctl is-active mariadb)"

echo ""
echo "=== [5] DB 초기화 SQL 실행 ==="
# init.sql의 비밀번호를 실제 값으로 변경
cp /opt/blossom/lumina/sql/init.sql /tmp/lumina_init.sql
sed -i "s/CHANGE_ME_AP_WRITER_PASSWORD/LuminaAP2026!Secure/g" /tmp/lumina_init.sql
sed -i "s/CHANGE_ME_WEB_READER_PASSWORD/LuminaWEB2026!Secure/g" /tmp/lumina_init.sql
sed -i "s/CHANGE_ME_ADMIN_PASSWORD/LuminaAdmin2026!Secure/g" /tmp/lumina_init.sql

# REQUIRE SSL 제거 (테스트 환경 — 로컬 접속)
sed -i 's/REQUIRE SSL//g' /tmp/lumina_init.sql

mysql -u root < /tmp/lumina_init.sql 2>&1
echo "  DB 초기화 완료"

echo ""
echo "=== [6] DB 검증 ==="
mysql -u root -e "SHOW DATABASES LIKE 'lumina';"
mysql -u root -e "SELECT User, Host FROM mysql.user WHERE User LIKE 'lumina%';"
mysql -u root -e "USE lumina; SHOW TABLES;"

echo ""
echo "=== 설정 완료 ==="

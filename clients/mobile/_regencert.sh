#!/bin/bash
set -e
D=/etc/blossom/lumina/tls
TS=$(date +%s)
[ -f "$D/server.crt" ] && cp "$D/server.crt" "$D/server.crt.bak.$TS"
[ -f "$D/server.key" ] && cp "$D/server.key" "$D/server.key.bak.$TS"
cat > /tmp/blossom_san.cnf <<EOF
[req]
distinguished_name=dn
x509_extensions=v3
prompt=no
[dn]
C=KR
O=Blossom
CN=blossom.local
[v3]
subjectAltName=@alt
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
basicConstraints=CA:FALSE
[alt]
IP.1=192.168.56.108
IP.2=172.30.1.45
IP.3=127.0.0.1
DNS.1=blossom.local
DNS.2=lumina.local
DNS.3=localhost
EOF
openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout "$D/server.key" -out "$D/server.crt" \
  -days 825 -config /tmp/blossom_san.cnf -extensions v3
chmod 600 "$D/server.key"
chmod 644 "$D/server.crt"
nginx -t && systemctl reload nginx
echo "===NEW CERT==="
openssl x509 -in "$D/server.crt" -noout -subject -issuer
openssl x509 -in "$D/server.crt" -noout -ext subjectAltName

#!/bin/bash
echo "=== RPM file lists ==="
for pkg in lumina-common lumina-db lumina-ap lumina-web; do
    echo "--- $pkg ---"
    rpm -ql "$pkg" 2>&1
    echo ""
done

echo "=== /opt/blossom structure ==="
find /opt/blossom -type f 2>/dev/null | head -80 || echo "(/opt/blossom not found)"

echo ""
echo "=== /etc/blossom structure ==="
find /etc/blossom -type f 2>/dev/null | head -40 || echo "(/etc/blossom not found)"

echo ""
echo "=== /var/lib/blossom structure ==="
find /var/lib/blossom -type f 2>/dev/null | head -20 || echo "(/var/lib/blossom not found)"

echo ""
echo "=== /var/log/blossom structure ==="
find /var/log/blossom 2>/dev/null | head -20 || echo "(/var/log/blossom not found)"

echo ""
echo "=== systemd overrides ==="
find /etc/systemd/system -name 'lumina*' 2>/dev/null
for svc in lumina-ap lumina-web; do
    echo "--- $svc override ---"
    cat /etc/systemd/system/${svc}.service.d/override.conf 2>&1 || echo "(none)"
done

echo ""
echo "=== AP wsgi.py content ==="
cat /opt/blossom/lumina/ap/wsgi.py 2>&1 || echo "(not found)"

echo ""
echo "=== AP directory listing ==="
ls -laR /opt/blossom/lumina/ap/ 2>&1 | head -40 || echo "(not found)"

echo ""
echo "=== WEB directory listing ==="
ls -laR /opt/blossom/lumina/web/ 2>&1 | head -40 || echo "(not found)"

echo ""
echo "=== WEB gunicorn.conf.py ==="
cat /opt/blossom/lumina/web/gunicorn.conf.py 2>&1 || echo "(not found)"

echo ""
echo "=== WEB wsgi.py ==="
cat /opt/blossom/lumina/web/wsgi.py 2>&1 || echo "(not found)"

echo ""
echo "=== secure.env ==="
cat /etc/blossom/lumina/secure.env 2>&1 || echo "(not found)"

echo ""
echo "=== ap.conf ==="
cat /etc/blossom/lumina/ap.conf 2>&1 || echo "(not found)"

echo ""
echo "=== existing users ==="
grep -E 'lumina|blossom' /etc/passwd 2>&1 || echo "(none)"

echo ""
echo "=== gunicorn location ==="
which gunicorn 2>&1
gunicorn --version 2>&1
python3 -c "import flask; print('flask', flask.__version__)" 2>&1

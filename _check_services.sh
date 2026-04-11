#!/bin/bash
set -e

echo "=== systemd unit files ==="
systemctl list-unit-files | grep lumina || echo "(no lumina units found)"

echo ""
echo "=== lumina-db (MariaDB) status ==="
systemctl status mariadb 2>&1 | head -15 || true

echo ""
echo "=== lumina-ap status ==="
systemctl status lumina-ap 2>&1 | head -15 || true

echo ""
echo "=== lumina-web status ==="
systemctl status lumina-web 2>&1 | head -15 || true

echo ""
echo "=== nginx status ==="
systemctl status nginx 2>&1 | head -15 || true

echo ""
echo "=== lumina user ==="
id lumina 2>&1 || echo "(lumina user not found)"

echo ""
echo "=== running processes ==="
ps -ef | grep -E 'lumina|gunicorn|mariadb|mysql|nginx' | grep -v grep || echo "(no matching processes)"

echo ""
echo "=== listening ports ==="
ss -tlnp | grep -E '3306|8000|8080|443|80' || echo "(no matching ports)"

echo ""
echo "=== installed RPMs ==="
rpm -qa | grep lumina || echo "(no lumina RPMs)"

echo ""
echo "=== /opt/lumina structure ==="
ls -la /opt/lumina/ 2>&1 || echo "(/opt/lumina not found)"
ls -la /opt/lumina/ap/ 2>&1 | head -10 || true
ls -la /opt/lumina/web/ 2>&1 | head -10 || true

echo ""
echo "=== config files ==="
cat /etc/lumina/ap.env 2>&1 || echo "(ap.env not found)"
echo "---"
cat /etc/lumina/web.env 2>&1 || echo "(web.env not found)"

echo ""
echo "=== systemd unit contents ==="
echo "--- lumina-ap.service ---"
cat /usr/lib/systemd/system/lumina-ap.service 2>&1 || echo "(not found)"
echo "--- lumina-web.service ---"
cat /usr/lib/systemd/system/lumina-web.service 2>&1 || echo "(not found)"

echo ""
echo "=== gunicorn check ==="
which gunicorn 2>&1 || echo "(gunicorn not in PATH)"
/opt/lumina/ap/venv/bin/gunicorn --version 2>&1 || echo "(ap venv gunicorn not found)"
/opt/lumina/web/venv/bin/gunicorn --version 2>&1 || echo "(web venv gunicorn not found)"

echo ""
echo "=== journal logs ==="
echo "--- lumina-ap ---"
journalctl -u lumina-ap --no-pager -n 20 2>&1 || true
echo "--- lumina-web ---"
journalctl -u lumina-web --no-pager -n 20 2>&1 || true

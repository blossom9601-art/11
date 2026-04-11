#!/bin/bash
echo "=== 1. Gunicorn error log (last 50) ==="
tail -50 /var/log/blossom/lumina/web/gunicorn_error.log 2>/dev/null || tail -50 /var/log/blossom/lumina/web/error.log 2>/dev/null

echo ""
echo "=== 2. App stderr (journalctl) ==="
journalctl -u lumina-web --no-pager -n 80 2>/dev/null | grep -i "error\|traceback\|exception\|500\|login\|fail\|Internal" | tail -40

echo ""
echo "=== 3. Test login POST with wrong password ==="
curl -s --max-time 5 -o /tmp/_login_resp.html -w "HTTP %{http_code}" \
  -X POST http://127.0.0.1:8000/login \
  -d "emp_no=admin&password=wrongpass" \
  -H "Content-Type: application/x-www-form-urlencoded"
echo ""
echo "--- Response body (first 30 lines) ---"
head -30 /tmp/_login_resp.html

echo ""
echo "=== 4. Test login POST with correct password ==="
curl -s --max-time 5 -o /tmp/_login_ok.html -w "HTTP %{http_code}" \
  -X POST http://127.0.0.1:8000/login \
  -d "emp_no=admin&password=admin1234!" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -c /tmp/_cookies.txt
echo ""
echo "--- Response headers ---"
curl -s --max-time 5 -D- -o /dev/null \
  -X POST http://127.0.0.1:8000/login \
  -d "emp_no=admin&password=admin1234!" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -c /tmp/_cookies2.txt | head -20

echo ""
echo "=== 5. Dashboard with session ==="
curl -s --max-time 5 -o /tmp/_dash.html -w "HTTP %{http_code}" \
  -b /tmp/_cookies2.txt \
  http://127.0.0.1:8000/dashboard
echo ""
head -20 /tmp/_dash.html

echo ""
echo "=== 6. Journalctl last 30 lines ==="
journalctl -u lumina-web --no-pager -n 30 2>/dev/null | tail -30

cd /tmp
rm -f cj_real
echo "=== login ==="
curl -sk -c cj_real -b cj_real -X POST -L \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "employee_id=admin&password=admin1234" \
  -o /dev/null -w "login=%{http_code}\n" \
  https://localhost/login

echo "=== check session ==="
curl -sk -b cj_real https://localhost/api/auth/session-check -H "X-Requested-With: XMLHttpRequest" | head -c 300
echo

echo "=== POST channel (mimicking browser) ==="
curl -sk -b cj_real \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" \
  -X POST \
  -d '{"name":"diag-channel-real","type":"public"}' \
  -w "\nstatus=%{http_code}\n" \
  https://localhost/api/chat/v2/channels

echo "=== fetch latest logs ==="
journalctl -u blossom-web --no-pager --since "30 seconds ago" | grep -B 2 -A 50 "Traceback\|chat/v2/channels\|create_chat_v2_channel" | tail -100

#!/bin/bash
curl -s -c /tmp/c.txt -d 'employee_id=admin&password=admin123' http://127.0.0.1:8001/login -o /dev/null -w 'login:%{http_code}\n'
echo "session:"
curl -s -b /tmp/c.txt 'http://127.0.0.1:8001/api/auth/session-check'
echo
for r in 1 2 3; do
  echo "=== room $r ==="
  curl -s -b /tmp/c.txt "http://127.0.0.1:8001/api/chat/rooms/$r/messages?include_files=1&order=asc&per_page=80"
  echo
done

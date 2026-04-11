#!/bin/bash
###############################################################################
# Lumina 서비스 최종 검증
###############################################################################

echo "============================================"
echo "  Lumina 서비스 최종 검증"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================"

echo ""
echo "━━━ 1. 서비스 상태 ━━━"
for svc in mariadb lumina-ap lumina-web nginx; do
    status=$(systemctl is-active "$svc" 2>/dev/null || echo "inactive")
    enabled=$(systemctl is-enabled "$svc" 2>/dev/null || echo "disabled")
    if [ "$status" = "active" ]; then
        mark="✓"
    else
        mark="✗"
    fi
    printf "  %s %-15s : %-10s (enabled: %s)\n" "$mark" "$svc" "$status" "$enabled"
done

echo ""
echo "━━━ 2. 프로세스 사용자 확인 (lumina 계정 동작 여부) ━━━"
ps -eo user,pid,ppid,comm | grep -E 'lumina|gunicorn|mysql|nginx' | grep -v grep

echo ""
echo "━━━ 3. 포트 리스닝 상태 ━━━"
printf "  %-8s %-25s %s\n" "PORT" "PID/PROG" "DESCRIPTION"
echo "  -------  -----------------------  -----------"
ss -tlnp | grep -E '3306|5100|8000|80|443' | awk '{
    split($4, a, ":");
    port = a[length(a)];
    desc = "";
    if (port == 3306) desc = "MariaDB";
    else if (port == 5100) desc = "lumina-ap (gunicorn)";
    else if (port == 8000) desc = "lumina-web (gunicorn)";
    else if (port == 80)   desc = "nginx (HTTP redirect)";
    else if (port == 443)  desc = "nginx (HTTPS proxy)";
    printf "  %-8s %-25s %s\n", port, $6, desc;
}'

echo ""
echo "━━━ 4. 연결 테스트 ━━━"

# AP Health
echo -n "  [AP] http://127.0.0.1:5100/health → "
resp=$(curl -s --max-time 5 http://127.0.0.1:5100/health 2>&1)
if echo "$resp" | grep -q '"ok"'; then
    echo "✓ $resp"
else
    echo "✗ $resp"
fi

# AP Upload endpoint
echo -n "  [AP] POST /api/agent/upload    → "
resp=$(curl -s --max-time 5 -X POST http://127.0.0.1:5100/api/agent/upload 2>&1)
if echo "$resp" | grep -q '"accepted"'; then
    echo "✓ $resp"
else
    echo "✗ $resp"
fi

# WEB Direct (gunicorn)
echo -n "  [WEB] http://127.0.0.1:8000/   → "
resp=$(curl -s --max-time 5 -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/ 2>&1)
echo "HTTP $resp"

# NGINX HTTPS
echo -n "  [NGX] https://127.0.0.1/       → "
resp=$(curl -sk --max-time 5 -o /dev/null -w "%{http_code}" https://127.0.0.1/ 2>&1)
echo "HTTP $resp"

# NGINX HTTP→HTTPS redirect
echo -n "  [NGX] http://127.0.0.1/ (redir)→ "
resp=$(curl -s --max-time 5 -o /dev/null -w "%{http_code}" http://127.0.0.1/ 2>&1)
echo "HTTP $resp"

# DB 연결
echo -n "  [DB] MariaDB TCP 127.0.0.1:3306 → "
mysql -h 127.0.0.1 -u lumina_web_reader -pLuminaWEB2026Secure -e "SELECT 'connected' AS status" lumina 2>&1 | grep -q 'connected' && echo "✓ 연결 성공" || echo "✗ 연결 실패"

echo ""
echo "━━━ 5. lumina 계정 확인 ━━━"
echo "  계정 정보: $(id lumina 2>&1)"
echo "  프로세스 수: $(ps -u lumina --no-header 2>/dev/null | wc -l)"
ps -u lumina -o user,pid,ppid,%cpu,%mem,comm --no-header 2>/dev/null | head -20

echo ""
echo "━━━ 6. 최근 서비스 로그 ━━━"
for svc in lumina-ap lumina-web nginx; do
    echo "  --- $svc (최근 3줄) ---"
    journalctl -u $svc --no-pager -n 3 2>&1 | grep -v '^--'
done

echo ""
echo "━━━ 7. 부팅 시 자동시작 설정 ━━━"
systemctl enable lumina-ap 2>/dev/null
systemctl enable lumina-web 2>/dev/null
systemctl enable nginx 2>/dev/null
systemctl enable mariadb 2>/dev/null
for svc in mariadb lumina-ap lumina-web nginx; do
    printf "  %-15s : %s\n" "$svc" "$(systemctl is-enabled $svc 2>/dev/null)"
done

echo ""
echo "============================================"
echo "  검증 완료"
echo "============================================"

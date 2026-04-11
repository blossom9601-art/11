#!/bin/bash
sshpass -p '123456' ssh -o StrictHostKeyChecking=no root@192.168.56.105 << 'ENDSSH'

echo "=== 서버 blossom.css page-header 스타일 ==="
sed -n '/\.page-header/,/^}/p' /opt/blossom/lumina/web/static/css/blossom.css | head -20

echo ""
echo "=== alarm-page 관련 CSS 확인 ==="
grep -rn 'alarm-page\|\.alarm' /opt/blossom/lumina/web/static/css/ 2>/dev/null | head -10

echo ""
echo "=== 서버 css 파일 목록 ==="  
ls -la /opt/blossom/lumina/web/static/css/blossom.css
echo ""
echo "=== 로컬과 서버 blossom.css 크기 비교 ==="
wc -l /opt/blossom/lumina/web/static/css/blossom.css
wc -c /opt/blossom/lumina/web/static/css/blossom.css

echo ""
echo "=== alarm.html 템플릿에 로드되는 CSS ==="
grep 'stylesheet\|\.css' /opt/blossom/lumina/web/app/templates/addon_application/2.alarm.html 2>/dev/null | head -5

echo ""
echo "=== page-header h1 스타일 in blossom.css (서버) ==="
grep -A5 '\.page-header h1' /opt/blossom/lumina/web/static/css/blossom.css | head -15

echo ""
echo "=== alarm-page 전용 CSS 파일 있는지 ==="
find /opt/blossom/lumina/web/static/css/ -name '*alarm*' -o -name '*notification*' -o -name '*addon*' 2>/dev/null
ENDSSH

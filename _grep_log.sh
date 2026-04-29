journalctl -u blossom-web --no-pager --since "5 minutes ago" > /tmp/_blog.txt
grep -n "POST /api/chat\|MsgChannel\|MsgConversation\|IntegrityError\|UNIQUE\|create_chat_v2\|Traceback" /tmp/_blog.txt | tail -80
echo ---FULL TRACE---
grep -n "Traceback" /tmp/_blog.txt | tail -3 | while read line; do
  ln=${line%%:*}
  end=$((ln+50))
  sed -n "${ln},${end}p" /tmp/_blog.txt
  echo "==="
done

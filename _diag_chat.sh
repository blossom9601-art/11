curl -sk https://localhost/addon/chat -H 'X-Requested-With: blossom-spa' 2>/dev/null > /tmp/_chat.html
echo "--- chat-config div ---"
grep -oE '<div[^>]*id="chat-config"[^>]*>' /tmp/_chat.html
echo "--- 3.chat.js script tag ---"
grep -oE '<script[^>]*3\.chat\.js[^>]*>' /tmp/_chat.html
echo "--- size ---"
wc -c /tmp/_chat.html

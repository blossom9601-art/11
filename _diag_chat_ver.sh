curl -sk https://localhost/addon/chat -H "X-Requested-With: blossom-spa" | grep -oE "3\.chat\.js[^\"]*" | head -3
echo ---
stat -c "%Y" /opt/blossom/web/static/js/addon_application/3.chat.js
echo ---
md5sum /opt/blossom/web/static/js/addon_application/3.chat.js

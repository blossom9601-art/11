try { new Function(require('fs').readFileSync('/opt/blossom/web/static/js/addon_application/3.chat.js','utf8')); console.log('PARSE OK'); } catch(e){ console.error('PARSE FAIL:', e.message); }

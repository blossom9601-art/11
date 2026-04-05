(function(){
  'use strict';
  // Hard cache-bust: load the latest log renderer without inline scripts in HTML.
  var s = document.createElement('script');
  s.src = '/static/js/4.governance/4-3.network_policy/4-3-1.ip/tab14-ip_log.js?t=' + Date.now();
  s.defer = true;
  document.head.appendChild(s);
})();

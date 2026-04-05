(function(){
  try{
    var qs = '' + (window.location && window.location.search ? window.location.search : '');
    if(qs && qs.charAt(0) === '?') qs = qs.slice(1);

    var prefix = '';
    if(qs){
      var parts = qs.split('&');
      for(var i=0; i<parts.length; i++){
        var kv = parts[i].split('=');
        var k = decodeURIComponent(kv[0] || '');
        if(k === 'p' || k === 'prefix'){
          prefix = decodeURIComponent(kv.slice(1).join('=') || '');
          break;
        }
      }
    }

    if(prefix){
      window.STORAGE_PREFIX = window.STORAGE_PREFIX || prefix;
    }
  }catch(_e){ }
})();

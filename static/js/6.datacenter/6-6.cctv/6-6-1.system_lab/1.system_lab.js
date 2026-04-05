(function(){
    var configEl = document.getElementById('system-lab-config');
    if (!configEl) return;

    var CONFIG = {
        pageClass: configEl.dataset.pageClass || '',
        centerName: configEl.dataset.centerName || '',
        overlayStoreKey: configEl.dataset.overlayStoreKey || '',
        legacyOverlayKeys: [],
        apiBase: configEl.dataset.apiBase || ''
    };
    try { CONFIG.legacyOverlayKeys = JSON.parse(configEl.dataset.legacyOverlayKeys || '[]'); } catch(_e){}

    if (!document.body || !document.body.classList.contains(CONFIG.pageClass)) {
        return;
    }

    try { delete window.__SYSTEM_LAB_CONFIG; } catch(_e){}
    window.__SYSTEM_LAB_CONFIG = CONFIG;

    if (document.querySelector('script[data-system-lab-shared="true"]')) {
        return;
    }
    var script = document.createElement('script');
    script.src = '/static/js/6.datacenter/6-6.cctv/system_lab_page.js';
    script.async = true;
    script.dataset.systemLabShared = 'true';
    script.onerror = function(err) { console.error('[cctv] shared page script failed to load', err); };
    document.head.appendChild(script);
})();

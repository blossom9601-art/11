(function(root){
  'use strict';

  function navigateTo(href){
    if(root.blsSpaNavigate) root.blsSpaNavigate(href);
    else root.location.href = href;
  }

  function numberValue(value){
    var parsed = Number(value);
    return isFinite(parsed) ? parsed : 0;
  }

  function bindDetailNavigation(rootEl, context){
    rootEl.addEventListener('click', function(event){
      var link = event.target.closest('.vendor-detail-link');
      if(!link) return;
      event.preventDefault();
      var href = link.getAttribute('href') || context.detailUrl;
      var vendorId = link.getAttribute('data-id') || '';
      var data = {
        id: vendorId,
        vendor_id: vendorId,
        vendor: link.getAttribute('data-vendor') || '',
        logo: link.getAttribute('data-logo') || '',
        logo_url: link.getAttribute('data-logo') || '',
        address: link.getAttribute('data-address') || '',
        business_number: link.getAttribute('data-business-number') || '',
        call_center: link.getAttribute('data-call-center') || '',
        hardware_qty: numberValue(link.getAttribute('data-hardware-qty')),
        software_qty: numberValue(link.getAttribute('data-software-qty')),
        component_qty: numberValue(link.getAttribute('data-component-qty')),
        note: link.getAttribute('data-note') || ''
      };
      try { root.sessionStorage.setItem(context.storageKey, JSON.stringify(data)); } catch(_ignore) {}
      fetch('/api/vendor/detail-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ key: context.detailKey, vendor_id: vendorId })
      }).then(function(){ navigateTo(href); }).catch(function(){ navigateTo(href); });
    }, true);
  }

  function retryBoot(attempt){
    if(attempt >= 80) return;
    root.setTimeout(function(){ boot(attempt + 1); }, 50);
  }

  function boot(attempt){
    attempt = attempt || 0;
    var rootEl = document.getElementById('vendor-management-root');
    if(!rootEl){ retryBoot(attempt); return; }
    if(rootEl.getAttribute('data-bls-mounted') === '1') return;
    var Modules = root.BlossomModules || {};
    var Shared = root.BlossomShared || {};
    if(!Shared.ManagementPage || !Modules.useVendor){ retryBoot(attempt); return; }

    rootEl.setAttribute('data-bls-mounted', '1');
    var module = Modules.useVendor(root.__VENDOR_MODULE_CONTEXT__ || {});
    bindDetailNavigation(rootEl, module.context);
    Shared.ManagementPage.mount({
      root: rootEl,
      config: module.config,
      schema: module.schema,
      api: module.api,
      context: module.context,
      sources: module.sources
    });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})(window);
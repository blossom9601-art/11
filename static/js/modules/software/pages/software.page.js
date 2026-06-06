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
      var link = event.target.closest('.software-detail-link');
      if(!link) return;
      event.preventDefault();
      var href = link.getAttribute('href') || context.detailUrl;
      var softwareId = link.getAttribute('data-id') || '';
      var data = {
        id: softwareId,
        model: link.getAttribute('data-model') || '',
        vendor: link.getAttribute('data-vendor') || '',
        vendor_code: link.getAttribute('data-vendor-code') || '',
        hw_type: link.getAttribute('data-hw-type') || '',
        release_date: link.getAttribute('data-release-date') || '',
        eosl: link.getAttribute('data-eosl') || '',
        qty: numberValue(link.getAttribute('data-qty')),
        note: link.getAttribute('data-note') || ''
      };
      data[context.idField || 'id'] = softwareId;
      try { root.sessionStorage.setItem(context.storageKey, JSON.stringify(data)); } catch(_ignore) {}
      try { root.sessionStorage.setItem('unix:selectedRow', JSON.stringify(data)); } catch(_ignoreLegacy) {}
      var body = {
        key: context.detailKey,
        id: softwareId,
        title: data.model,
        subtitle: data.vendor,
        hw_type: data.hw_type,
        release_date: data.release_date,
        eosl: data.eosl,
        qty: data.qty,
        note: data.note
      };
      body[context.idField || 'id'] = softwareId;
      fetch('/api/category/detail-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body)
      }).then(function(){ navigateTo(href); }).catch(function(){ navigateTo(href); });
    }, true);
  }

  function retryBoot(attempt){
    if(attempt >= 80) return;
    root.setTimeout(function(){ boot(attempt + 1); }, 50);
  }

  function boot(attempt){
    attempt = attempt || 0;
    var rootEl = document.getElementById('software-management-root');
    if(!rootEl){ retryBoot(attempt); return; }
    if(rootEl.getAttribute('data-bls-mounted') === '1') return;

    var Modules = root.BlossomModules || {};
    var Shared = root.BlossomShared || {};
    if(!Shared.ManagementPage || !Modules.useSoftware){ retryBoot(attempt); return; }

    rootEl.setAttribute('data-bls-mounted', '1');
    var module = Modules.useSoftware(root.__SOFTWARE_MODULE_CONTEXT__ || { kind: 'os' });
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
(function(root){
  'use strict';

  function retryBoot(attempt){
    if(attempt >= 80) return;
    root.setTimeout(function(){ boot(attempt + 1); }, 50);
  }

  function boot(attempt){
    attempt = attempt || 0;
    var rootEl = document.getElementById('company-management-root');
    if(!rootEl){ retryBoot(attempt); return; }
    if(rootEl.getAttribute('data-bls-mounted') === '1') return;

    var Modules = root.BlossomModules || {};
    var Shared = root.BlossomShared || {};
    if(!Shared.ManagementPage || !Modules.companyConfig || !Modules.companySchema || !Modules.useCompany){ retryBoot(attempt); return; }

    rootEl.setAttribute('data-bls-mounted', '1');
    var module = Modules.useCompany();
    Shared.ManagementPage.mount({
      root: rootEl,
      config: Modules.companyConfig,
      schema: Modules.companySchema,
      api: module.api,
      context: module.context,
      sources: module.sources
    });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})(window);

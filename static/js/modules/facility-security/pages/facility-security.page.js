(function(root){
  'use strict';

  function closestGroup(node){
    while(node && node !== document){
      if(node.classList && node.classList.contains('facility-security-group')) return node;
      node = node.parentNode;
    }
    return null;
  }

  function closeGroups(exceptGroup){
    var groups = document.querySelectorAll('.facility-security-group.open');
    Array.prototype.forEach.call(groups, function(group){
      if(group === exceptGroup) return;
      group.classList.remove('open');
      var button = group.querySelector('.facility-security-group-btn');
      if(button) button.setAttribute('aria-expanded', 'false');
    });
  }

  function initGroupDropdowns(){
    var groups = document.querySelectorAll('.facility-security-group');
    Array.prototype.forEach.call(groups, function(group){
      var button = group.querySelector('.facility-security-group-btn');
      if(!button) return;
      button.addEventListener('click', function(event){
        event.preventDefault();
        var shouldOpen = !group.classList.contains('open');
        closeGroups(group);
        group.classList.toggle('open', shouldOpen);
        button.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
      });
    });
    document.addEventListener('click', function(event){
      if(!closestGroup(event.target)) closeGroups(null);
    });
    document.addEventListener('keydown', function(event){
      if(event.key === 'Escape') closeGroups(null);
    });
  }

  function retryBoot(attempt){
    if(attempt >= 80) return;
    root.setTimeout(function(){ boot(attempt + 1); }, 50);
  }

  function boot(attempt){
    attempt = attempt || 0;
    var rootEl = document.getElementById('facility-security-management-root');
    if(!rootEl){ retryBoot(attempt); return; }
    if(rootEl.getAttribute('data-bls-mounted') === '1') return;

    var Modules = root.BlossomModules || {};
    var Shared = root.BlossomShared || {};
    if(!Shared.ManagementPage || !Modules.facilitySecurityConfig || !Modules.facilitySecuritySchema || !Modules.useFacilitySecurity){ retryBoot(attempt); return; }

    rootEl.setAttribute('data-bls-mounted', '1');
    var context = {
      resource: String(root.__FACILITY_SECURITY_RESOURCE__ || 'access'),
      label: String(root.__FACILITY_SECURITY_LABEL__ || '출입관리'),
      manual: !!root.__FACILITY_SECURITY_MANUAL__
    };
    var module = Modules.useFacilitySecurity(context);
    var config = Object.assign({}, Modules.facilitySecurityConfig, {
      exportName: module.makeExportName().replace(/\.csv$/i, '')
    });

    Shared.ManagementPage.mount({
      root: rootEl,
      config: config,
      schema: Modules.facilitySecuritySchema,
      api: module.api,
      context: context,
      sources: module.sources
    });
    initGroupDropdowns();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})(window);

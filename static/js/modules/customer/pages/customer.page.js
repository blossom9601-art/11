(function(root){
  'use strict';

  function navigateTo(href){
    if(root.blsSpaNavigate) root.blsSpaNavigate(href);
    else root.location.href = href;
  }

  function numeric(value){
    var parsed = Number(value);
    return isFinite(parsed) ? parsed : 0;
  }

  function bindDetailNavigation(rootEl){
    rootEl.addEventListener('click', function(event){
      var link = event.target.closest('.customer-detail-link');
      if(!link) return;
      event.preventDefault();
      var href = link.getAttribute('href') || root.__CAT_CUSTOMER_CLIENT1_DETAIL_URL || '/b/cat_customer_client1_detail';
      var id = link.getAttribute('data-id') || '';
      var name = link.getAttribute('data-name') || '';
      var address = link.getAttribute('data-address') || '';
      var context = {
        id: id,
        customer_name: name,
        address: address,
        manager_count: numeric(link.getAttribute('data-manager-count')),
        line_count: numeric(link.getAttribute('data-line-qty')),
        remark: link.getAttribute('data-note') || ''
      };
      try {
        root.sessionStorage.setItem('client1:context', JSON.stringify(context));
      } catch(_ignore) {}
      fetch('/api/category/detail-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ key: 'cat_customer_client1_detail', id: id, title: name, subtitle: address })
      }).then(function(){
        navigateTo(href);
      }).catch(function(){
        navigateTo(href);
      });
    }, true);
  }

  function retryBoot(attempt){
    if(attempt >= 80) return;
    root.setTimeout(function(){ boot(attempt + 1); }, 50);
  }

  function boot(attempt){
    attempt = attempt || 0;
    var rootEl = document.getElementById('customer-management-root');
    if(!rootEl){ retryBoot(attempt); return; }
    if(rootEl.getAttribute('data-bls-mounted') === '1') return;

    var Modules = root.BlossomModules || {};
    var Shared = root.BlossomShared || {};
    if(!Shared.ManagementPage || !Modules.customerConfig || !Modules.customerSchema || !Modules.useCustomer){ retryBoot(attempt); return; }

    rootEl.setAttribute('data-bls-mounted', '1');
    bindDetailNavigation(rootEl);
    var module = Modules.useCustomer();
    Shared.ManagementPage.mount({
      root: rootEl,
      config: Modules.customerConfig,
      schema: Modules.customerSchema,
      api: module.api,
      context: module.context,
      sources: module.sources
    });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})(window);
(function(root){
  'use strict';

  var Modules = root.BlossomModules = root.BlossomModules || {};

  Modules.useCustomer = function(){
    return {
      context: { label: '고객' },
      api: Modules.createCustomerApi(),
      sources: {}
    };
  };

})(window);
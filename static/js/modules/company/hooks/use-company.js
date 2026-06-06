(function(root){
  'use strict';

  var Modules = root.BlossomModules = root.BlossomModules || {};

  Modules.useCompany = function(){
    return {
      api: Modules.createCompanyApi(),
      sources: {},
      context: { label: '회사' }
    };
  };

})(window);

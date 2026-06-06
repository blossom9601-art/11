(function(root){
  'use strict';

  var Modules = root.BlossomModules = root.BlossomModules || {};

  Modules.vendorContextDefaults = {
    manufacturer: {
      kind: 'manufacturer',
      label: '제조사',
      apiBase: '/api/vendor-manufacturers',
      detailKey: 'cat_vendor_manufacturer_detail',
      detailUrl: '/b/cat_vendor_manufacturer_detail',
      storageKey: 'manufacturer:context'
    },
    maintenance: {
      kind: 'maintenance',
      label: '유지보수사',
      apiBase: '/api/vendor-maintenance',
      detailKey: 'cat_vendor_maintenance_detail',
      detailUrl: '/b/cat_vendor_maintenance_detail',
      storageKey: 'maintenance:context'
    }
  };

  Modules.useVendor = function(rawContext){
    rawContext = rawContext || {};
    var base = Modules.vendorContextDefaults[rawContext.kind] || Modules.vendorContextDefaults.manufacturer;
    var context = {};
    Object.keys(base).forEach(function(key){ context[key] = base[key]; });
    Object.keys(rawContext).forEach(function(key){ if(rawContext[key] != null && rawContext[key] !== '') context[key] = rawContext[key]; });
    return {
      context: context,
      config: Modules.createVendorConfig(context),
      schema: Modules.createVendorSchema(context),
      api: Modules.createVendorApi(context),
      sources: {}
    };
  };

})(window);
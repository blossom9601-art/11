(function(root){
  'use strict';

  var Modules = root.BlossomModules = root.BlossomModules || {};

  Modules.useFacilitySecurity = function(context){
    context = context || {};
    var api = Modules.createFacilitySecurityApi(context);

    return {
      context: context,
      api: api,
      sources: api.sources,
      makeExportName: function(){
        return '시설보안인프라_' + String(context.label || context.resource || '목록') + '.csv';
      }
    };
  };

})(window);

(function(root){
  'use strict';

  var Modules = root.BlossomModules = root.BlossomModules || {};
  var Shared = root.BlossomShared = root.BlossomShared || {};

  Modules.createCustomerApi = function(){
    var crud = Shared.createCrudApi('/api/customer-associates');

    function prepare(payload){
      var validation = Modules.customerValidation;
      var normalized = validation ? validation.normalizePayload(payload) : payload;
      var errors = validation ? validation.validatePayload(normalized) : [];
      if(errors.length) return { error: errors[0] };
      return { payload: normalized };
    }

    return {
      list: crud.list,
      get: crud.get,
      create: function(payload){
        var next = prepare(payload);
        if(next.error) return Promise.reject(new Error(next.error));
        return crud.create(next.payload);
      },
      update: function(id, payload){
        var next = prepare(payload);
        if(next.error) return Promise.reject(new Error(next.error));
        return crud.update(id, next.payload);
      },
      bulkDelete: crud.bulkDelete
    };
  };

})(window);
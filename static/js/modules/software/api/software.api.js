(function(root){
  'use strict';

  var Modules = root.BlossomModules = root.BlossomModules || {};
  var Shared = root.BlossomShared = root.BlossomShared || {};

  Modules.createSoftwareApi = function(context){
    context = context || {};
    var crud = Shared.createCrudApi(context.apiBase || '/api/sw-os-types');

    function prepare(raw){
      var validation = Modules.softwareValidation;
      var normalized = validation ? validation.normalizePayload(raw, context) : raw;
      var errors = validation ? validation.validatePayload(normalized, context) : [];
      if(errors.length) return { error: errors[0] };
      return { payload: normalized };
    }

    function save(method, id, payload){
      var next = prepare(payload || {});
      if(next.error) throw new Error(next.error);
      return method === 'create' ? crud.create(next.payload) : crud.update(id, next.payload);
    }

    return {
      list: crud.list,
      get: crud.get,
      create: function(payload){ return save('create', null, payload); },
      update: function(id, payload){ return save('update', id, payload); },
      bulkDelete: crud.bulkDelete
    };
  };

})(window);
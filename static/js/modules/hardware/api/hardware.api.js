(function(root){
  'use strict';

  var Modules = root.BlossomModules = root.BlossomModules || {};
  var Shared = root.BlossomShared = root.BlossomShared || {};

  Modules.createHardwareApi = function(context){
    context = context || {};
    var crud = Shared.createCrudApi(context.apiBase || '/api/hw-server-types');

    function prepare(raw, options){
      options = options || {};
      var validation = Modules.hardwareValidation;
      var normalized = validation ? validation.normalizePayload(raw, context, { partial: options.partial === true }) : raw;
      var errors = validation ? validation.validatePayload(normalized, context, { partial: options.partial === true }) : [];
      if(errors.length) return { error: errors[0] };
      return { payload: normalized };
    }

    function save(method, id, payload){
      var next = prepare(payload || {}, { partial: method === 'update' });
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
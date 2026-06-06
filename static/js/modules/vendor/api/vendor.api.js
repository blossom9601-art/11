(function(root){
  'use strict';

  var Modules = root.BlossomModules = root.BlossomModules || {};
  var Shared = root.BlossomShared = root.BlossomShared || {};

  function isFile(value){
    return value && typeof value === 'object' && typeof value.name === 'string' && typeof value.size === 'number';
  }

  function uploadLogo(file, context){
    if(!isFile(file)) return Promise.resolve('');
    var formData = new FormData();
    formData.append('file', file);
    formData.append('scope', context.kind === 'maintenance' ? 'maintenance' : 'manufacturer');
    return fetch('/api/vendor-logo/upload', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      body: formData
    }).then(function(response){
      return response.json().catch(function(){ return {}; }).then(function(payload){
        if(!response.ok || payload.success === false){
          throw new Error(payload.message || payload.error || '로고 업로드 중 오류가 발생했습니다.');
        }
        return payload.url || '';
      });
    });
  }

  Modules.createVendorApi = function(context){
    context = context || {};
    var crud = Shared.createCrudApi(context.apiBase || '/api/vendor-manufacturers');

    function prepare(raw){
      var validation = Modules.vendorValidation;
      var normalized = validation ? validation.normalizePayload(raw, context) : raw;
      var errors = validation ? validation.validatePayload(normalized, context) : [];
      if(errors.length) return { error: errors[0] };
      return { payload: normalized };
    }

    function withLogo(raw){
      raw = raw || {};
      var next = {};
      Object.keys(raw).forEach(function(key){ next[key] = raw[key]; });
      var file = next.logo_file;
      delete next.logo_file;
      if(!isFile(file)) return Promise.resolve(next);
      return uploadLogo(file, context).then(function(url){
        if(url){
          next.logo_url = url;
          next.logo = url;
        }
        return next;
      });
    }

    function save(method, id, payload){
      return withLogo(payload).then(function(nextPayload){
        var next = prepare(nextPayload);
        if(next.error) throw new Error(next.error);
        return method === 'create' ? crud.create(next.payload) : crud.update(id, next.payload);
      });
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
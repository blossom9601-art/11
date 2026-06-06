(function(root){
  'use strict';

  var Modules = root.BlossomModules = root.BlossomModules || {};
  var Shared = root.BlossomShared = root.BlossomShared || {};

  function normalizeManufacturers(items){
    var seen = {};
    var out = [];
    (Array.isArray(items) ? items : []).forEach(function(item){
      var name = String((item && (item.name || item.manufacturer_name || item.vendor || item.label)) || '').trim();
      if(!name || seen[name]) return;
      seen[name] = true;
      out.push({ value: name, label: name, name: name });
    });
    out.sort(function(a, b){ return a.label.localeCompare(b.label, 'ko-KR'); });
    return out;
  }

  Modules.createFacilitySecurityApi = function(context){
    context = context || {};
    var resource = encodeURIComponent(context.resource || 'access');
    var crud = Shared.createCrudApi('/api/facility-security-infra/' + resource);

    return {
      list: crud.list,
      get: crud.get,
      create: function(payload){
        var validation = Modules.facilitySecurityValidation;
        var normalized = validation ? validation.normalizePayload(payload) : payload;
        var errors = validation ? validation.validatePayload(normalized) : [];
        if(errors.length) return Promise.reject(new Error(errors[0]));
        return crud.create(normalized);
      },
      update: function(id, payload){
        var validation = Modules.facilitySecurityValidation;
        var normalized = validation ? validation.normalizePayload(payload) : payload;
        var errors = validation ? validation.validatePayload(normalized) : [];
        if(errors.length) return Promise.reject(new Error(errors[0]));
        return crud.update(id, normalized);
      },
      bulkDelete: crud.bulkDelete,
      sources: {
        manufacturers: function(){
          return (root.BlossomAPI ? root.BlossomAPI.get('/api/vendor-manufacturers') : fetch('/api/vendor-manufacturers', { credentials: 'same-origin' }).then(function(res){ return res.json(); }))
            .then(function(payload){ return normalizeManufacturers(payload.items || payload.rows || []); })
            .catch(function(){ return []; });
        }
      }
    };
  };

})(window);

(function(root){
  'use strict';

  var Modules = root.BlossomModules = root.BlossomModules || {};

  Modules.facilitySecurityValidation = {
    validatePayload: function(payload){
      var errors = [];
      payload = payload || {};
      if(!String(payload.model_name || '').trim()) errors.push('모델명을 입력하세요.');
      if(String(payload.part_number || '').length > 100) errors.push('부품번호는 100자 이하로 입력하세요.');
      return errors;
    },
    normalizePayload: function(payload){
      payload = payload || {};
      return {
        model_name: String(payload.model_name || '').trim(),
        capacity: String(payload.capacity || '').trim(),
        manufacturer_name: String(payload.manufacturer_name || '').trim(),
        part_number: String(payload.part_number || '').trim(),
        remark: String(payload.remark || '').trim()
      };
    }
  };

})(window);

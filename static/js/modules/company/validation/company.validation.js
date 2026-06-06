(function(root){
  'use strict';

  var Modules = root.BlossomModules = root.BlossomModules || {};

  Modules.companyValidation = {
    normalizePayload: function(payload){
      payload = payload || {};
      return {
        company_name: String(payload.company_name || '').trim(),
        description: String(payload.description || '').trim(),
        note: String(payload.note || '').trim()
      };
    },
    validatePayload: function(payload){
      var errors = [];
      payload = payload || {};
      if(!String(payload.company_name || '').trim()) errors.push('회사명을 입력하세요.');
      if(String(payload.company_name || '').length > 120) errors.push('회사명은 120자 이하로 입력하세요.');
      return errors;
    }
  };

})(window);

(function(root){
  'use strict';

  var Modules = root.BlossomModules = root.BlossomModules || {};

  function sanitizeString(value){
    return String(value == null ? '' : value).trim();
  }

  function sanitizeQuantity(value){
    if(value == null || String(value).trim() === '') return 0;
    var parsed = parseInt(value, 10);
    return isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }

  Modules.customerValidation = {
    normalizePayload: function(data){
      data = data || {};
      var memberName = sanitizeString(data.member_name || data.customer_name || data.associate_name);
      var code = sanitizeString(data.customer_code || data.associate_code || data.member_code);
      var note = sanitizeString(data.note || data.remark);
      var lineQty = sanitizeQuantity(data.line_qty || data.line_count);
      return {
        associate_name: memberName || undefined,
        customer_name: memberName || undefined,
        member_name: memberName || undefined,
        associate_code: code || undefined,
        customer_code: code || undefined,
        phone: sanitizeString(data.phone),
        address: sanitizeString(data.address),
        manager_count: sanitizeQuantity(data.manager_count),
        line_count: lineQty,
        line_qty: lineQty,
        remark: note,
        note: note
      };
    },
    validatePayload: function(payload){
      var errors = [];
      payload = payload || {};
      if(!sanitizeString(payload.member_name || payload.customer_name || payload.associate_name)){
        errors.push('고객을 입력하세요.');
      }
      if(sanitizeString(payload.customer_code).length > 60){
        errors.push('고객코드는 60자 이내로 입력하세요.');
      }
      return errors;
    }
  };

})(window);
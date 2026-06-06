(function(root){
  'use strict';

  var Modules = root.BlossomModules = root.BlossomModules || {};

  function text(value){
    return String(value == null ? '' : value).trim();
  }

  function qty(value){
    if(value == null || String(value).trim() === '') return 0;
    var parsed = parseInt(value, 10);
    return isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }

  Modules.vendorValidation = {
    normalizePayload: function(data, context){
      data = data || {};
      context = context || {};
      var isMaintenance = context.kind === 'maintenance';
      var vendorName = text(data.vendor || data.manufacturer_name || data.maintenance_name);
      var code = text(data.manufacturer_code || data.maintenance_code || data.code);
      var note = text(data.note || data.remark);
      var logoUrl = text(data.logo_url || data.logo);
      var payload = {
        vendor: vendorName || undefined,
        logo_url: logoUrl,
        logo: logoUrl,
        address: text(data.address),
        business_number: text(data.business_number || data.business_no),
        business_no: text(data.business_no || data.business_number),
        call_center: text(data.call_center),
        note: note,
        remark: note,
        hardware_qty: qty(data.hardware_qty),
        software_qty: qty(data.software_qty),
        component_qty: qty(data.component_qty)
      };
      if(isMaintenance){
        payload.maintenance_name = vendorName || undefined;
        payload.maintenance_code = code || undefined;
        payload.manager_count = qty(data.manager_count);
      } else {
        payload.manufacturer_name = vendorName || undefined;
        payload.manufacturer_code = code || undefined;
      }
      return payload;
    },
    validatePayload: function(payload, context){
      payload = payload || {};
      context = context || {};
      var label = context.label || '벤더';
      var name = text(payload.vendor || payload.manufacturer_name || payload.maintenance_name);
      var errors = [];
      if(!name) errors.push(label + '를 입력하세요.');
      if(text(payload.business_number).length > 60) errors.push('사업자번호는 60자 이내로 입력하세요.');
      return errors;
    }
  };

})(window);
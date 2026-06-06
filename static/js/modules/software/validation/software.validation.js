(function(root){
  'use strict';

  var Modules = root.BlossomModules = root.BlossomModules || {};

  function text(value){
    return String(value == null ? '' : value).trim();
  }

  function quantity(value){
    if(value == null || String(value).trim() === '') return 0;
    var parsed = parseInt(value, 10);
    return isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }

  function firstText(data, keys){
    data = data || {};
    keys = keys || [];
    for(var i = 0; i < keys.length; i += 1){
      var key = keys[i];
      if(key && data[key] != null && text(data[key]) !== '') return text(data[key]);
    }
    return '';
  }

  Modules.softwareValidation = {
    normalizePayload: function(data, context){
      data = data || {};
      context = context || {};
      var nameKey = context.nameKey || 'model_name';
      var typeKey = context.typeKey || 'os_type';
      var codeKey = context.codeKey || 'os_code';
      var countKey = context.countKey || 'license_count';
      var modelName = firstText(data, [nameKey, 'model_name', 'model', 'name', 'db_name', 'virtual_name', 'secsw_name', 'ha_name', 'os_name']);
      var vendorName = text(data.manufacturer_name || data.vendor || data.manufacturer);
      var vendorCode = text(data.manufacturer_code || data.vendor_code);
      var softwareType = firstText(data, [typeKey, 'os_type', 'db_family', 'middleware_type', 'virtual_family', 'secsw_family', 'ha_mode', 'hw_type', 'type', 'category', 'mode']);
      var eoslDate = text(data.eosl_date || data.eosl);
      var note = text(data.remark || data.note || data.description);
      var payload = {
        release_date: text(data.release_date),
        eosl_date: eoslDate,
        remark: note
      };
      payload[nameKey] = modelName || undefined;
      payload[typeKey] = softwareType || undefined;
      if(data[countKey] != null || data.license_count != null || data.qty != null){
        payload[countKey] = quantity(data[countKey] != null ? data[countKey] : (data.license_count != null ? data.license_count : data.qty));
      }
      if(codeKey && firstText(data, [codeKey, 'code'])) payload[codeKey] = firstText(data, [codeKey, 'code']);
      if(vendorCode) payload.manufacturer_code = vendorCode;
      if(vendorName) payload.manufacturer_name = vendorName;
      return payload;
    },
    validatePayload: function(payload, context){
      payload = payload || {};
      context = context || {};
      var label = context.label || '소프트웨어';
      var nameKey = context.nameKey || 'model_name';
      var typeKey = context.typeKey || 'os_type';
      var errors = [];
      if(!text(payload[nameKey])) errors.push(label + ' 모델명을 입력하세요.');
      if(!text(payload.manufacturer_name || payload.manufacturer_code)) errors.push('제조사를 선택하세요.');
      if(!text(payload[typeKey])) errors.push('유형을 선택하세요.');
      if(text(payload[nameKey]).length > 160) errors.push('모델명은 160자 이내로 입력하세요.');
      return errors;
    }
  };

})(window);
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

  Modules.hardwareValidation = {
    normalizePayload: function(data, context, options){
      data = data || {};
      context = context || {};
      options = options || {};
      var partial = options.partial === true;
      var nameKey = context.nameKey || 'model_name';
      var typeKey = context.typeKey || 'form_factor';
      var codeKey = context.codeKey || 'server_code';
      var countKey = context.countKey || 'server_count';
      var modelName = firstText(data, [nameKey, 'model_name', 'model', 'name']);
      var hardwareType = firstText(data, [typeKey, 'hw_type', 'form_factor', 'storage_type', 'san_type', 'network_type', 'security_type', 'type']);
      var vendorName = text(data.manufacturer_name || data.vendor || data.manufacturer);
      var vendorCode = text(data.manufacturer_code || data.vendor_code);
      var payload = {};
      if(!partial || Object.prototype.hasOwnProperty.call(data, 'release_date')) payload.release_date = text(data.release_date);
      if(!partial || Object.prototype.hasOwnProperty.call(data, 'eosl_date') || Object.prototype.hasOwnProperty.call(data, 'eosl')) payload.eosl_date = text(data.eosl_date || data.eosl);
      if(!partial || Object.prototype.hasOwnProperty.call(data, 'remark') || Object.prototype.hasOwnProperty.call(data, 'note') || Object.prototype.hasOwnProperty.call(data, 'description')) payload.remark = text(data.remark || data.note || data.description);
      if(modelName || !partial) payload[nameKey] = modelName || undefined;
      if(hardwareType || !partial) payload[typeKey] = hardwareType || undefined;
      if(codeKey && firstText(data, [codeKey, 'code', 'server_code'])) payload[codeKey] = firstText(data, [codeKey, 'code', 'server_code']);
      if(data[countKey] != null || data.qty != null){
        payload[countKey] = quantity(data[countKey] != null ? data[countKey] : data.qty);
      }
      if(vendorCode) payload.manufacturer_code = vendorCode;
      if(vendorName) payload.manufacturer_name = vendorName;
      return payload;
    },
    validatePayload: function(payload, context, options){
      payload = payload || {};
      context = context || {};
      options = options || {};
      var label = context.label || '하드웨어';
      var nameKey = context.nameKey || 'model_name';
      var typeKey = context.typeKey || 'form_factor';
      var errors = [];
      if(!options.partial && !text(payload[nameKey])) errors.push(label + ' 모델명을 입력하세요.');
      if(!options.partial && !text(payload.manufacturer_name || payload.manufacturer_code)) errors.push('제조사를 선택하세요.');
      if(!options.partial && !text(payload[typeKey])) errors.push('유형을 선택하세요.');
      if(text(payload[nameKey]).length > 160) errors.push('모델명은 160자 이내로 입력하세요.');
      return errors;
    }
  };

})(window);
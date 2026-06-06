(function(root){
  'use strict';

  var Modules = root.BlossomModules = root.BlossomModules || {};

  function text(value){
    return String(value == null ? '' : value).trim();
  }

  function requestJson(url){
    if(root.BlossomAPI && typeof root.BlossomAPI.get === 'function'){
      return root.BlossomAPI.get(url);
    }
    return fetch(url, {
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
    }).then(function(response){
      return response.json().catch(function(){ return {}; }).then(function(payload){
        if(!response.ok || payload.success === false){
          throw new Error(payload.message || payload.error || '목록을 불러오지 못했습니다.');
        }
        return payload;
      });
    });
  }

  function listItems(payload){
    payload = payload || {};
    var rows = payload.items || payload.rows || payload.data || [];
    return Array.isArray(rows) ? rows : [];
  }

  function manufacturerOptions(rows, context){
    var seen = {};
    var options = [];
    var byCode = context.manufacturerNameByCode || {};
    (rows || []).forEach(function(row){
      var code = text(row.manufacturer_code || row.vendor_code || row.code);
      var name = text(row.manufacturer_name || row.vendor || row.name);
      if(code && name) byCode[code] = name;
      if(!name || seen[name]) return;
      seen[name] = true;
      options.push({ value: name, label: name });
    });
    options.sort(function(left, right){ return left.label.localeCompare(right.label, 'ko'); });
    context.manufacturerNameByCode = byCode;
    return options;
  }

  Modules.hardwareContextDefaults = {
    server: {
      kind: 'server', label: '서버', listTitle: '서버 유형', apiBase: '/api/hw-server-types',
      detailKey: 'cat_hw_server_detail', detailUrl: '/b/cat_hw_server_detail', storageKey: 'server_selected_row',
      nameKey: 'model_name', typeKey: 'form_factor', codeKey: 'server_code', countKey: 'server_count',
      typeOptions: ['서버', '클라우드', '프레임', '워크스테이션'], analyticsTabOrder: ['서버', '클라우드', '프레임', '워크스테이션']
    },
    storage: {
      kind: 'storage', label: '스토리지', listTitle: '스토리지 유형', apiBase: '/api/hw-storage-types',
      detailKey: 'cat_hw_storage_detail', detailUrl: '/b/cat_hw_storage_detail', storageKey: 'storage_selected_row',
      nameKey: 'model_name', typeKey: 'storage_type', codeKey: 'storage_code', countKey: 'storage_count',
      typeOptions: ['스토리지', '백업장치'], analyticsTabOrder: ['스토리지', '백업장치']
    },
    san: {
      kind: 'san', label: 'SAN', listTitle: 'SAN 유형', apiBase: '/api/hw-san-types',
      detailKey: 'cat_hw_san_detail', detailUrl: '/b/cat_hw_san_detail', storageKey: 'san_selected_row',
      nameKey: 'model_name', typeKey: 'san_type', codeKey: 'san_code', countKey: 'san_count',
      typeOptions: ['SAN 디렉터', 'SAN 스위치'], analyticsTabOrder: ['SAN 디렉터', 'SAN 스위치']
    },
    network: {
      kind: 'network', label: '네트워크', listTitle: '네트워크 유형', apiBase: '/api/hw-network-types',
      detailKey: 'cat_hw_network_detail', detailUrl: '/b/cat_hw_network_detail', storageKey: 'network_selected_row',
      nameKey: 'model_name', typeKey: 'network_type', codeKey: 'network_code', countKey: 'device_count',
      typeOptions: ['L2', 'L3', 'L4', 'L7', '무선장비', '회선장비'], analyticsTabOrder: ['L2', 'L3', 'L4', 'L7', '무선장비', '회선장비']
    },
    security: {
      kind: 'security', label: '보안장비', listTitle: '보안장비 유형', apiBase: '/api/hw-security-types',
      detailKey: 'cat_hw_security_detail', detailUrl: '/b/cat_hw_security_detail', storageKey: 'security_selected_row',
      nameKey: 'model_name', typeKey: 'security_type', codeKey: 'security_code', countKey: 'device_count',
      typeOptions: ['방화벽', 'VPN', 'IDS', 'IPS', 'HSM', 'KMS', 'WIPS', '기타장비'], analyticsTabOrder: ['방화벽', 'VPN', 'IDS', 'IPS', 'HSM', 'KMS', 'WIPS', '기타장비']
    }
  };

  Modules.useHardware = function(rawContext){
    rawContext = rawContext || {};
    var base = Modules.hardwareContextDefaults[rawContext.kind] || Modules.hardwareContextDefaults.server;
    var context = {};
    Object.keys(base).forEach(function(key){ context[key] = base[key]; });
    Object.keys(rawContext).forEach(function(key){
      if(rawContext[key] != null && rawContext[key] !== '') context[key] = rawContext[key];
    });
    return {
      context: context,
      config: Modules.createHardwareConfig(context),
      schema: Modules.createHardwareSchema(context),
      api: Modules.createHardwareApi(context),
      sources: {
        manufacturers: function(){
          return Promise.all([
            requestJson('/api/vendor-manufacturers?include_deleted=1'),
            requestJson('/api/vendor-manufacturers?include_deleted=0')
          ]).then(function(payloads){
            manufacturerOptions(listItems(payloads[0]), context);
            return manufacturerOptions(listItems(payloads[1]), context);
          });
        }
      }
    };
  };

})(window);
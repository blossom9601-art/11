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
    var byCode = {};
    (rows || []).forEach(function(row){
      var code = text(row.manufacturer_code || row.vendor_code || row.code);
      var name = text(row.manufacturer_name || row.vendor || row.name);
      if(code && name) byCode[code] = name;
      if(!name || seen[name]) return;
      seen[name] = true;
      options.push({ value: name, label: name });
    });
    options.sort(function(left, right){ return left.label.localeCompare(right.label, 'ko'); });
    if(context) context.manufacturerNameByCode = byCode;
    return options;
  }

  Modules.softwareContextDefaults = {
    os: {
      kind: 'os',
      label: '운영체제',
      listTitle: '운영체제 유형',
      apiBase: '/api/sw-os-types',
      detailKey: 'cat_sw_os_detail',
      detailUrl: '/b/cat_sw_os_detail',
      storageKey: 'os_selected_row',
      idField: 'os_id',
      nameKey: 'model_name',
      typeKey: 'os_type',
      codeKey: 'os_code',
      countKey: 'license_count',
      typeOptions: ['유닉스', '리눅스', '윈도우', '임베디드']
    },
    database: {
      kind: 'database',
      label: '데이터베이스',
      listTitle: '데이터베이스 유형',
      apiBase: '/api/sw-db-types',
      detailKey: 'cat_sw_database_detail',
      detailUrl: '/b/cat_sw_database_detail',
      storageKey: 'db_selected_row',
      idField: 'db_id',
      nameKey: 'db_name',
      typeKey: 'db_family',
      codeKey: 'db_code',
      countKey: 'db_count',
      typeOptions: ['RDBMS', 'NoSQL']
    },
    middleware: {
      kind: 'middleware',
      label: '미들웨어',
      listTitle: '미들웨어 유형',
      apiBase: '/api/sw-middleware-types',
      detailKey: 'cat_sw_middleware_detail',
      detailUrl: '/b/cat_sw_middleware_detail',
      storageKey: 'middleware_selected_row',
      idField: 'middleware_id',
      nameKey: 'model_name',
      typeKey: 'middleware_type',
      codeKey: 'middleware_code',
      countKey: 'middleware_count',
      typeOptions: ['WEB', 'WAS', 'API', 'APM', 'FRAMEWORK']
    },
    virtualization: {
      kind: 'virtualization',
      label: '가상화',
      listTitle: '가상화 유형',
      apiBase: '/api/sw-virtual-types',
      detailKey: 'cat_sw_virtualization_detail',
      detailUrl: '/b/cat_sw_virtualization_detail',
      storageKey: 'virtualization_selected_row',
      idField: 'virtual_id',
      nameKey: 'virtual_name',
      typeKey: 'virtual_family',
      codeKey: 'virtual_code',
      countKey: 'virtual_count',
      typeOptions: ['하이퍼바이저', '컨테이너', '쿠버네티스']
    },
    security: {
      kind: 'security',
      label: '보안 소프트웨어',
      listTitle: '보안 소프트웨어 유형',
      apiBase: '/api/sw-security-types',
      detailKey: 'cat_sw_security_detail',
      detailUrl: '/b/cat_sw_security_detail',
      storageKey: 'security_selected_row',
      idField: 'security_id',
      nameKey: 'secsw_name',
      typeKey: 'secsw_family',
      codeKey: 'secsw_code',
      countKey: 'secsw_count',
      typeOptions: ['백신', '취약점 분석', '서버 접근제어', '서버 통합계정', '서버 모니터링', '서버 보안관리', 'DB 접근제어', '기타S/W']
    },
    high_availability: {
      kind: 'high_availability',
      label: '고가용성',
      listTitle: '고가용성 유형',
      apiBase: '/api/sw-ha-types',
      detailKey: 'cat_sw_high_availability_detail',
      detailUrl: '/b/cat_sw_high_availability_detail',
      storageKey: 'ha_selected_row',
      idField: 'ha_id',
      nameKey: 'ha_name',
      typeKey: 'ha_mode',
      codeKey: 'ha_code',
      countKey: 'ha_count',
      typeOptions: ['Active-Active', 'Active-Passive', 'Active-Standby', 'Cluster', 'Geo-Cluster', '기타']
    }
  };

  Modules.useSoftware = function(rawContext){
    rawContext = rawContext || {};
    var base = Modules.softwareContextDefaults[rawContext.kind] || Modules.softwareContextDefaults.os;
    var context = {};
    Object.keys(base).forEach(function(key){ context[key] = base[key]; });
    Object.keys(rawContext).forEach(function(key){
      if(rawContext[key] != null && rawContext[key] !== '') context[key] = rawContext[key];
    });
    return {
      context: context,
      config: Modules.createSoftwareConfig(context),
      schema: Modules.createSoftwareSchema(context),
      api: Modules.createSoftwareApi(context),
      sources: {
        manufacturers: function(){
          return requestJson('/api/vendor-manufacturers?include_deleted=0').then(function(payload){
            return manufacturerOptions(listItems(payload), context);
          });
        }
      }
    };
  };

})(window);
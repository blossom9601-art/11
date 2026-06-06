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

  function firstValue(row, keys){
    row = row || {};
    keys = keys || [];
    for(var i = 0; i < keys.length; i += 1){
      var key = keys[i];
      if(key && row[key] != null && text(row[key]) !== '') return row[key];
    }
    return '';
  }

  function textCell(row, helpers, key){
    return helpers.escape(helpers.text(row[key]));
  }

  function detailLink(row, helpers, context){
    var label = helpers.text(row.model);
    var href = row.public_id ? '/b/' + encodeURIComponent(row.public_id) : context.detailUrl;
    if(label === '-') return helpers.escape(label);
    return '<a href="' + helpers.escape(href) + '" class="work-name-link software-detail-link" data-id="' + helpers.escape(row.id) + '" data-public-id="' + helpers.escape(row.public_id || '') + '" data-model="' + helpers.escape(row.model || '') + '" data-vendor="' + helpers.escape(row.vendor || '') + '" data-vendor-code="' + helpers.escape(row.vendor_code || '') + '" data-hw-type="' + helpers.escape(row.hw_type || '') + '" data-release-date="' + helpers.escape(row.release_date || '') + '" data-eosl="' + helpers.escape(row.eosl || '') + '" data-qty="' + helpers.escape(row.qty || 0) + '" data-note="' + helpers.escape(row.note || '') + '" title="' + helpers.escape(context.label || '소프트웨어') + ' 상세로 이동">' + helpers.escape(label) + '</a>';
  }

  Modules.createSoftwareConfig = function(context){
    context = context || {};
    return {
      id: 'software-' + (context.kind || 'os'),
      pageClass: 'software-page software-' + (context.kind || 'os') + '-page',
      showHeader: false,
      rowKey: 'id',
      title: '소프트웨어 관리',
      description: '소프트웨어 유형 중 ' + (context.label || '소프트웨어') + '를 관리합니다.',
      listTitle: context.listTitle || ((context.label || '소프트웨어') + ' 유형'),
      pageSize: 10,
      exportName: (context.label || '소프트웨어') + '목록',
      analyticsButtonId: 'system-analytics-btn',
      actions: {
        create: true,
        update: true,
        delete: true,
        bulk: true,
        export: true,
        statistics: true,
        analytics: true
      },
      columns: [
        { key: 'model', label: '모델명', searchable: true, render: function(row, helpers){ return detailLink(row, helpers, context); } },
        { key: 'vendor', label: '제조사', searchable: true, render: function(row, helpers){ return textCell(row, helpers, 'vendor'); } },
        { key: 'hw_type', label: '유형', searchable: true, render: function(row, helpers){ return textCell(row, helpers, 'hw_type'); } },
        { key: 'release_date', label: '릴리즈 일자', searchable: true, render: function(row, helpers){ return textCell(row, helpers, 'release_date'); } },
        { key: 'eosl', label: 'EOSL 일자', searchable: true, render: function(row, helpers){ return textCell(row, helpers, 'eosl'); } },
        { key: 'qty', label: '수량', searchable: false, render: function(row, helpers){ return helpers.escape(String(quantity(row.qty))); } },
        { key: 'note', label: '비고', searchable: true, hidden: true, render: function(row, helpers){ return textCell(row, helpers, 'note'); } }
      ],
      normalizeRows: function(rows){
        var nameKey = context.nameKey || 'model_name';
        var typeKey = context.typeKey || 'os_type';
        var codeKey = context.codeKey || 'os_code';
        var countKey = context.countKey || 'license_count';
        var manufacturerNameByCode = context.manufacturerNameByCode || {};
        return (Array.isArray(rows) ? rows : []).map(function(row){
          row = row || {};
          var vendorCode = text(row.manufacturer_code || row.vendor_code);
          var vendorName = text(row.manufacturer_name || row.vendor || row.manufacturer || manufacturerNameByCode[vendorCode] || vendorCode);
          var model = text(firstValue(row, [nameKey, 'model', 'model_name', 'db_name', 'virtual_name', 'secsw_name', 'ha_name', 'os_name']));
          var softwareType = text(firstValue(row, [typeKey, 'hw_type', 'os_type', 'db_family', 'middleware_type', 'virtual_family', 'secsw_family', 'ha_mode', 'type', 'category', 'mode']));
          return {
            id: Number(row.id),
            public_id: text(row.public_id),
            code: text(firstValue(row, [codeKey, 'code'])),
            os_code: text(row.os_code),
            db_code: text(row.db_code),
            middleware_code: text(row.middleware_code),
            virtual_code: text(row.virtual_code),
            secsw_code: text(row.secsw_code),
            ha_code: text(row.ha_code),
            model: model,
            vendor: vendorName,
            vendor_code: vendorCode,
            manufacturer_name: vendorName,
            manufacturer_code: vendorCode,
            hw_type: softwareType,
            release_date: text(row.release_date),
            eosl: text(row.eosl_date || row.eosl),
            qty: quantity(row.usage_count != null ? row.usage_count : firstValue(row, [countKey, 'license_count', 'db_count', 'middleware_count', 'virtual_count', 'secsw_count', 'ha_count', 'qty'])),
            note: text(row.remark != null ? row.remark : row.note)
          };
        }).filter(function(row){ return isFinite(row.id); });
      },
      openStats: function(rows){
        if(!root.blsStats) return;
        var body = document.getElementById('system-stats-body');
        if(body) body.innerHTML = '';
        root.blsStats.defineSections({
          'stats-software': context.label || '소프트웨어',
          'stats-versions': '제조사',
          'stats-check': '유형'
        });
        root.blsStats.renderCard('stats-software', context.label || '소프트웨어', root.blsStats.countBy(rows, 'model'));
        root.blsStats.renderCard('stats-versions', '제조사', root.blsStats.countBy(rows, 'vendor'));
        root.blsStats.renderCard('stats-check', '유형', root.blsStats.countBy(rows, 'hw_type'));
        root.blsStats.open('system-stats-modal');
      }
    };
  };

})(window);
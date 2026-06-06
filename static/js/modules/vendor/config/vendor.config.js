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

  function textCell(row, helpers, key){
    return helpers.escape(helpers.text(row[key]));
  }

  function logoCell(row, helpers, context){
    var src = text(row.logo_url || row.logo);
    var alt = text(row.vendor) || context.label || '벤더 로고';
    if(!src) return '-';
    return '<img src="' + helpers.escape(src) + '" alt="' + helpers.escape(alt) + '" title="' + helpers.escape(alt) + '" class="vendor-logo-img" loading="lazy" onerror="this.style.display=\'none\';">';
  }

  function detailLink(row, helpers, context){
    var label = helpers.text(row.vendor);
    var href = row.public_id ? '/b/' + encodeURIComponent(row.public_id) : context.detailUrl;
    if(label === '-') return helpers.escape(label);
    return '<a href="' + helpers.escape(href) + '" class="work-name-link vendor-detail-link" data-id="' + helpers.escape(row.id) + '" data-public-id="' + helpers.escape(row.public_id || '') + '" data-vendor="' + helpers.escape(row.vendor || '') + '" data-logo="' + helpers.escape(row.logo_url || row.logo || '') + '" data-address="' + helpers.escape(row.address || '') + '" data-business-number="' + helpers.escape(row.business_number || '') + '" data-call-center="' + helpers.escape(row.call_center || '') + '" data-hardware-qty="' + helpers.escape(row.hardware_qty || 0) + '" data-software-qty="' + helpers.escape(row.software_qty || 0) + '" data-component-qty="' + helpers.escape(row.component_qty || 0) + '" data-note="' + helpers.escape(row.note || '') + '" title="' + helpers.escape(context.label || '벤더') + ' 상세로 이동">' + helpers.escape(label) + '</a>';
  }

  function patchManufacturerCounts(rows, state, helpers, context){
    if(context.kind !== 'manufacturer') return;
    state.__vendorLiveGeneration = (state.__vendorLiveGeneration || 0) + 1;
    var generation = state.__vendorLiveGeneration;
    rows.forEach(function(row){
      if(!row || !row.id) return;
      var id = row.id;
      var base = context.apiBase + '/' + encodeURIComponent(id);
      var counts = { hardware_qty: 0, software_qty: 0, component_qty: 0 };
      var done = 0;

      function apply(){
        done += 1;
        if(done < 3 || state.__vendorLiveGeneration !== generation) return;
        ['hardware_qty', 'software_qty', 'component_qty'].forEach(function(key){ row[key] = counts[key]; });
        state.rows.forEach(function(item){
          if(String(item.id) === String(id)){
            item.hardware_qty = counts.hardware_qty;
            item.software_qty = counts.software_qty;
            item.component_qty = counts.component_qty;
          }
        });
        var tr = helpers.root.querySelector('tr[data-id="' + String(id).replace(/"/g, '\\"') + '"]');
        if(!tr) return;
        var map = { hardware_qty: counts.hardware_qty, software_qty: counts.software_qty, component_qty: counts.component_qty };
        Object.keys(map).forEach(function(key){
          var cell = tr.querySelector('td[data-col="' + key + '"]');
          if(cell) cell.textContent = map[key] ? String(map[key]) : '-';
        });
      }

      fetch(base + '/hw-assets', { credentials: 'same-origin' }).then(function(res){ return res.json(); }).then(function(data){ if(data && data.success) counts.hardware_qty = data.total || (data.items || []).length || 0; }).catch(function(){}).then(apply);
      fetch(base + '/sw-assets', { credentials: 'same-origin' }).then(function(res){ return res.json(); }).then(function(data){ if(data && data.success) counts.software_qty = data.total || (data.items || []).length || 0; }).catch(function(){}).then(apply);
      fetch(base + '/comp-assets', { credentials: 'same-origin' }).then(function(res){ return res.json(); }).then(function(data){ if(data && data.success) counts.component_qty = data.total || (data.items || []).length || 0; }).catch(function(){}).then(apply);
    });
  }

  Modules.createVendorConfig = function(context){
    context = context || {};
    return {
      id: 'vendor-' + (context.kind || 'manufacturer'),
      pageClass: 'vendor-page vendor-' + (context.kind || 'manufacturer') + '-page',
      showHeader: false,
      rowKey: 'id',
      title: '벤더 관리',
      description: '벤더 중 ' + (context.label || '벤더') + '를 관리합니다.',
      listTitle: context.label || '벤더',
      pageSize: 10,
      exportName: (context.label || '벤더') + '목록',
      actions: {
        create: true,
        update: true,
        delete: true,
        bulk: true,
        export: true,
        statistics: true
      },
      columns: [
        { key: 'logo', label: '로고', searchable: false, render: function(row, helpers){ return logoCell(row, helpers, context); } },
        { key: 'vendor', label: context.label || '벤더', searchable: true, render: function(row, helpers){ return detailLink(row, helpers, context); } },
        { key: 'address', label: '주소', searchable: true, hidden: true, render: function(row, helpers){ return textCell(row, helpers, 'address'); } },
        { key: 'business_number', label: '사업자번호', searchable: true, render: function(row, helpers){ return textCell(row, helpers, 'business_number'); } },
        { key: 'call_center', label: '고객센터', searchable: true, render: function(row, helpers){ return textCell(row, helpers, 'call_center'); } },
        { key: 'hardware_qty', label: '하드웨어(수량)', searchable: false, render: function(row, helpers){ return helpers.escape(String(row.hardware_qty || 0)); } },
        { key: 'software_qty', label: '소프트웨어(수량)', searchable: false, render: function(row, helpers){ return helpers.escape(String(row.software_qty || 0)); } },
        { key: 'component_qty', label: '컴포넌트(수량)', searchable: false, render: function(row, helpers){ return helpers.escape(String(row.component_qty || 0)); } },
        { key: 'note', label: '비고', searchable: true, hidden: true, render: function(row, helpers){ return textCell(row, helpers, 'note'); } }
      ],
      normalizeRows: function(rows){
        return (Array.isArray(rows) ? rows : []).map(function(row){
          row = row || {};
          var vendorName = text(row.vendor || row.manufacturer_name || row.maintenance_name);
          return {
            id: Number(row.id || row.vendor_id || row.manufacturer_id),
            public_id: text(row.public_id),
            vendor: vendorName,
            manufacturer_name: text(row.manufacturer_name || vendorName),
            maintenance_name: text(row.maintenance_name || vendorName),
            logo: text(row.logo || row.logo_url),
            logo_url: text(row.logo_url || row.logo),
            address: text(row.address),
            business_number: text(row.business_number || row.business_no),
            call_center: text(row.call_center),
            manager_count: qty(row.manager_count),
            hardware_qty: qty(row.hardware_qty != null ? row.hardware_qty : row.hw_count),
            software_qty: qty(row.software_qty != null ? row.software_qty : row.sw_count),
            component_qty: qty(row.component_qty != null ? row.component_qty : row.component_count),
            note: text(row.note != null ? row.note : row.remark)
          };
        }).filter(function(row){ return isFinite(row.id); });
      },
      afterRender: function(rows, state, helpers){
        patchManufacturerCounts(rows, state, helpers, context);
      },
      openStats: function(rows){
        if(!root.blsStats) return;
        var body = document.getElementById('system-stats-body');
        if(body) body.innerHTML = '';
        root.blsStats.defineSections({
          'stats-software': context.label || '벤더',
          'stats-versions': '사업자번호',
          'stats-check': '수량'
        });
        root.blsStats.renderCard('stats-software', context.label || '벤더', root.blsStats.countBy(rows, 'vendor'));
        root.blsStats.renderCard('stats-versions', '사업자번호', root.blsStats.countBy(rows, 'business_number'));
        root.blsStats.renderCard('stats-check', '하드웨어 수량', root.blsStats.countBy(rows, 'hardware_qty'));
        root.blsStats.open('system-stats-modal');
      }
    };
  };

})(window);
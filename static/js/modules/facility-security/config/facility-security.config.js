(function(root){
  'use strict';

  var Modules = root.BlossomModules = root.BlossomModules || {};

  function textCell(row, helpers, key){
    return helpers.escape(helpers.text(row[key]));
  }

  Modules.facilitySecurityConfig = {
    id: 'facility-security',
    pageClass: 'facility-security-page',
    showHeader: false,
    rowKey: 'id',
    title: '시설·보안 관리',
    description: '시설·보안 유형 중 {label} 모델을 관리합니다.',
    listTitle: '시설·보안',
    pageSize: 10,
    exportName: '시설보안인프라',
    actions: {
      create: true,
      update: true,
      delete: true,
      bulk: true,
      export: true,
      statistics: true
    },
    tabs: [
      { label: '보안설비', value: 'security' },
      { label: '전력설비', value: 'power' },
      { label: '환경설비', value: 'environment' },
      { label: '안전설비', value: 'safety' }
    ],
    columns: [
      {
        key: 'model_name',
        label: '모델명',
        searchable: true,
        render: function(row, helpers){
          var href = row.public_id ? '/b/' + encodeURIComponent(row.public_id) : '#';
          return '<a class="work-name-link" href="' + helpers.escape(href) + '">' + helpers.escape(helpers.text(row.model_name)) + '</a>';
        }
      },
      { key: 'capacity', label: '용량', searchable: true, render: function(row, helpers){ return textCell(row, helpers, 'capacity'); } },
      { key: 'manufacturer_name', label: '제조사', searchable: true, render: function(row, helpers){ return textCell(row, helpers, 'manufacturer_name'); } },
      { key: 'part_number', label: '부품번호', searchable: true, render: function(row, helpers){ return textCell(row, helpers, 'part_number'); } },
      { key: 'remark', label: '비고', searchable: true, render: function(row, helpers){ return textCell(row, helpers, 'remark'); } }
    ],
    statistics: [
      { title: '제조사', key: 'manufacturer_name' },
      { title: '용량', key: 'capacity' },
      { title: '부품번호', key: 'part_number' }
    ],
    normalizeRows: function(rows){
      return (Array.isArray(rows) ? rows : []).map(function(row){
        row = row || {};
        return {
          id: Number(row.id),
          public_id: row.public_id || '',
          model_name: row.model_name || row.model || '',
          capacity: row.capacity || '',
          manufacturer_name: row.manufacturer_name || row.vendor || '',
          part_number: row.part_number || row.part_no || '',
          remark: row.remark || row.note || ''
        };
      }).filter(function(row){ return isFinite(row.id); });
    },
    openStats: function(rows){
      if(!root.blsStats) return;
      var body = document.getElementById('system-stats-body');
      if(body) body.innerHTML = '';
      root.blsStats.defineSections({
        'stats-software': '시설·보안',
        'stats-versions': '모델',
        'stats-check': '부품번호'
      });
      root.blsStats.renderCard('stats-software', '제조사', root.blsStats.countBy(rows, 'manufacturer_name'));
      root.blsStats.renderCard('stats-versions', '용량', root.blsStats.countBy(rows, 'capacity'));
      root.blsStats.renderCard('stats-check', '부품번호', root.blsStats.countBy(rows, 'part_number'));
      root.blsStats.open('system-stats-modal');
    }
  };

})(window);

(function(root){
  'use strict';

  var Modules = root.BlossomModules = root.BlossomModules || {};

  function textCell(row, helpers, key){
    return helpers.escape(helpers.text(row[key]));
  }

  Modules.companyConfig = {
    id: 'company',
    pageClass: 'company-page',
    showHeader: false,
    rowKey: 'id',
    title: '조직 관리',
    description: '조직 관리 중 회사를 관리합니다.',
    listTitle: '회사',
    pageSize: 10,
    exportName: '회사목록',
    actions: {
      create: true,
      update: true,
      delete: true,
      bulk: true,
      export: true,
      statistics: true
    },
    columns: [
      { key: 'company_name', label: '회사명', searchable: true, render: function(row, helpers){ return textCell(row, helpers, 'company_name'); } },
      { key: 'description', label: '설명', searchable: true, render: function(row, helpers){ return textCell(row, helpers, 'description'); } },
      { key: 'user_count', label: '사용자(수)', searchable: false, render: function(row, helpers){ return helpers.escape(String(row.user_count || 0)); } },
      { key: 'note', label: '비고', searchable: true, render: function(row, helpers){ return textCell(row, helpers, 'note'); } }
    ],
    normalizeRows: function(rows){
      return (Array.isArray(rows) ? rows : []).map(function(row){
        row = row || {};
        return {
          id: Number(row.id),
          company_code: row.company_code || '',
          company_name: row.company_name || '',
          description: row.description || '',
          user_count: Number(row.user_count || 0) || 0,
          note: row.note || ''
        };
      }).filter(function(row){ return isFinite(row.id); });
    },
    openStats: function(rows){
      if(!root.blsStats) return;
      var body = document.getElementById('system-stats-body');
      if(body) body.innerHTML = '';
      root.blsStats.defineSections({
        'stats-software': '회사',
        'stats-versions': '설명',
        'stats-check': '사용자 수'
      });
      root.blsStats.renderCard('stats-software', '회사명', root.blsStats.countBy(rows, 'company_name'));
      root.blsStats.renderCard('stats-versions', '설명', root.blsStats.countBy(rows, 'description'));
      root.blsStats.renderCard('stats-check', '사용자 수', root.blsStats.countBy(rows, 'user_count'));
      root.blsStats.open('system-stats-modal');
    }
  };

})(window);

(function(root){
  'use strict';

  var Modules = root.BlossomModules = root.BlossomModules || {};

  Modules.companySchema = [
    {
      section: '회사',
      fields: [
        { key: 'company_name', label: '회사명', type: 'text', required: true },
        { key: 'description', label: '설명', type: 'text' },
        { key: 'note', label: '비고', type: 'textarea', rows: 6, full: true }
      ]
    }
  ];

})(window);

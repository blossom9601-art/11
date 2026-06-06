(function(root){
  'use strict';

  var Modules = root.BlossomModules = root.BlossomModules || {};

  Modules.createSoftwareSchema = function(context){
    context = context || {};
    return [{
      section: '소프트웨어',
      fields: [
        { key: 'model', label: '모델명', type: 'text', required: true },
        { key: 'vendor', label: '제조사', type: 'select', required: true, searchable: true, optionsSource: 'manufacturers' },
        { key: 'hw_type', label: '유형', type: 'select', required: true, searchable: true, options: context.typeOptions || [] },
        { key: 'release_date', label: '릴리즈 일자', type: 'date' },
        { key: 'eosl', label: 'EOSL 일자', type: 'date' },
        { key: 'note', label: '비고', type: 'textarea', rows: 6, full: true }
      ]
    }];
  };

})(window);
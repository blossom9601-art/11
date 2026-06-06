(function(root){
  'use strict';

  var Modules = root.BlossomModules = root.BlossomModules || {};

  Modules.facilitySecuritySchema = [
    {
      section: '시설·보안',
      fields: [
        { key: 'model_name', label: '모델명', type: 'text', required: true },
        { key: 'capacity', label: '용량', type: 'text' },
        { key: 'manufacturer_name', label: '제조사', type: 'select', searchable: true, optionsSource: 'manufacturers' },
        { key: 'part_number', label: '부품번호', type: 'text' },
        { key: 'remark', label: '비고', type: 'textarea', rows: 6, full: true }
      ]
    }
  ];

})(window);

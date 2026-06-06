(function(root){
  'use strict';

  var Modules = root.BlossomModules = root.BlossomModules || {};

  Modules.customerSchema = [
    {
      section: '고객',
      fields: [
        { key: 'member_name', label: '고객', type: 'text', required: true },
        { key: 'customer_code', label: '고객코드', type: 'text' },
        { key: 'phone', label: '대표번호', type: 'text' },
        { key: 'address', label: '주소', type: 'text' },
        { key: 'manager_count', label: '담당자 수', type: 'hidden', defaultValue: '0' },
        { key: 'line_qty', label: '회선 수량', type: 'hidden', defaultValue: '0' },
        { key: 'note', label: '비고', type: 'textarea', rows: 6, full: true }
      ]
    }
  ];

})(window);
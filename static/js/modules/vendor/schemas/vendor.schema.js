(function(root){
  'use strict';

  var Modules = root.BlossomModules = root.BlossomModules || {};

  Modules.createVendorSchema = function(context){
    context = context || {};
    var fields = [
      {
        key: 'logo_file',
        hiddenKey: 'logo_url',
        label: '로고',
        type: 'file',
        accept: '.png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml',
        fieldClass: 'vendor-logo-field',
        previewClass: 'vendor-logo-preview',
        buttonClass: 'vendor-logo-upload-btn',
        inputClass: 'vendor-logo-file-input',
        iconClass: 'vendor-logo-upload-icon',
        nameClass: 'vendor-logo-file-name',
        icon: '/static/image/svg/free-icon-font-folder-open.svg',
        buttonTitle: '로고 첨부',
        previewAlt: '로고 미리보기'
      },
      { key: 'vendor', label: context.label || '벤더', type: 'text', required: true },
      { key: 'address', label: '주소', type: 'text' },
      { key: 'business_number', label: '사업자번호', type: 'text' },
      { key: 'call_center', label: '고객센터', type: 'text' }
    ];
    if(context.kind === 'maintenance'){
      fields.push({ key: 'manager_count', label: '담당자 수', type: 'hidden', defaultValue: '0' });
    }
    fields = fields.concat([
      { key: 'hardware_qty', label: '하드웨어 수량', type: 'hidden', defaultValue: '0' },
      { key: 'software_qty', label: '소프트웨어 수량', type: 'hidden', defaultValue: '0' },
      { key: 'component_qty', label: '컴포넌트 수량', type: 'hidden', defaultValue: '0' },
      { key: 'note', label: '비고', type: 'textarea', rows: 6, full: true }
    ]);
    return [{ section: context.label || '벤더', fields: fields }];
  };

})(window);
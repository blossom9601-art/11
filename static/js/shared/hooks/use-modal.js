(function(root){
  'use strict';

  var Shared = root.BlossomShared = root.BlossomShared || {};

  Shared.useModal = function(){
    function open(modal){
      if(root.BlossomModal) root.BlossomModal.open(modal);
      else if(modal){ modal.classList.add('show'); modal.setAttribute('aria-hidden', 'false'); }
    }

    function close(modal){
      if(root.BlossomModal) root.BlossomModal.close(modal);
      else if(modal){ modal.classList.remove('show'); modal.setAttribute('aria-hidden', 'true'); }
    }

    function confirm(message, options){
      if(root.BlossomModal) return root.BlossomModal.confirm(message, options || {});
      return Promise.resolve(root.confirm(message));
    }

    return { open: open, close: close, confirm: confirm };
  };

})(window);

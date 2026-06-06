(function(root){
  'use strict';

  var Shared = root.BlossomShared = root.BlossomShared || {};

  Shared.usePermission = function(menuCode){
    var guard = root.BlossomPermissionGuard || root.BlossomPermissions || null;

    function can(action){
      if(!guard) return true;
      if(typeof guard.can === 'function') return !!guard.can(menuCode, action);
      if(typeof guard.has === 'function') return !!guard.has(menuCode + ':' + action);
      return true;
    }

    function filterActions(actions){
      var next = {};
      actions = actions || {};
      Object.keys(actions).forEach(function(key){
        next[key] = actions[key] !== false && can(key);
      });
      return next;
    }

    return { can: can, filterActions: filterActions };
  };

})(window);

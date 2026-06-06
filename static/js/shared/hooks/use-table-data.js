(function(root){
  'use strict';

  var Shared = root.BlossomShared = root.BlossomShared || {};

  Shared.useTableData = function(options){
    options = options || {};
    var state = {
      rows: [],
      filtered: [],
      page: 1,
      pageSize: options.pageSize || 10,
      search: '',
      selected: {}
    };

    function filter(){
      var q = String(state.search || '').trim().toLowerCase();
      var columns = options.columns || [];
      state.filtered = state.rows.filter(function(row){
        if(!q) return true;
        return columns.some(function(column){
          if(column.searchable === false) return false;
          return String(row[column.key] || '').toLowerCase().indexOf(q) >= 0;
        });
      });
      var maxPage = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
      if(state.page > maxPage) state.page = maxPage;
    }

    function pageRows(){
      var start = (state.page - 1) * state.pageSize;
      return state.filtered.slice(start, start + state.pageSize);
    }

    function selectedIds(){
      return Object.keys(state.selected).filter(function(id){ return state.selected[id]; });
    }

    return {
      state: state,
      setRows: function(rows){ state.rows = Array.isArray(rows) ? rows : []; filter(); },
      setSearch: function(value){ state.search = value || ''; state.page = 1; filter(); },
      setPage: function(page){ state.page = Math.max(1, Number(page || 1)); filter(); },
      setPageSize: function(size){ state.pageSize = Number(size || options.pageSize || 10); state.page = 1; filter(); },
      pageRows: pageRows,
      selectedIds: selectedIds,
      clearSelection: function(){ state.selected = {}; }
    };
  };

})(window);

(function(root){
  'use strict';

  var Shared = root.BlossomShared = root.BlossomShared || {};

  function toCsv(rows, columns){
    rows = Array.isArray(rows) ? rows : [];
    columns = Array.isArray(columns) ? columns : [];
    var lines = [columns.map(function(column){ return column.label || column.key; })];
    rows.forEach(function(row){
      lines.push(columns.map(function(column){ return row[column.key] == null ? '' : row[column.key]; }));
    });
    return lines.map(function(line){
      return line.map(function(value){ return '"' + String(value).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\r\n');
  }

  function download(filename, rows, columns){
    var blob = new Blob(['\ufeff' + toCsv(rows, columns)], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename || 'download.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function(){ URL.revokeObjectURL(link.href); }, 1000);
  }

  Shared.csv = { toCsv: toCsv, download: download };

})(window);

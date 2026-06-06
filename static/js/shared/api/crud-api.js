(function(root){
  'use strict';

  var Shared = root.BlossomShared = root.BlossomShared || {};

  function encodeQuery(params){
    var pairs = [];
    params = params || {};
    Object.keys(params).forEach(function(key){
      var value = params[key];
      if(value === undefined || value === null || value === '') return;
      pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
    });
    return pairs.length ? '?' + pairs.join('&') : '';
  }

  function fallbackRequest(url, options){
    var opts = options || {};
    opts.credentials = opts.credentials || 'same-origin';
    opts.headers = opts.headers || { 'Accept': 'application/json', 'Content-Type': 'application/json' };
    return fetch(url, opts).then(function(response){
      return response.json().catch(function(){ return {}; }).then(function(payload){
        if(!response.ok || payload.success === false){
          throw new Error(payload.message || payload.error || ('요청 실패 (HTTP ' + response.status + ')'));
        }
        return payload;
      });
    });
  }

  function request(method, url, body){
    if(root.BlossomAPI){
      if(method === 'GET') return root.BlossomAPI.get(url);
      if(method === 'POST') return root.BlossomAPI.post(url, body || {});
      if(method === 'PUT') return root.BlossomAPI.put(url, body || {});
      if(method === 'DELETE') return root.BlossomAPI.del(url, body || {});
    }
    var options = { method: method };
    if(method !== 'GET' && body !== undefined){
      options.body = JSON.stringify(body || {});
    }
    return fallbackRequest(url, options);
  }

  function normalizeList(payload){
    payload = payload || {};
    var rows = payload.items || payload.rows || payload.data || [];
    return {
      rows: Array.isArray(rows) ? rows : [],
      total: Number(payload.total != null ? payload.total : rows.length) || 0,
      raw: payload
    };
  }

  Shared.createCrudApi = function(options){
    options = typeof options === 'string' ? { baseUrl: options } : (options || {});
    var baseUrl = options.baseUrl || '';

    return {
      list: function(params){
        return request('GET', baseUrl + encodeQuery(params)).then(normalizeList);
      },
      get: function(id){
        return request('GET', baseUrl + '/' + encodeURIComponent(id));
      },
      create: function(payload){
        return request('POST', baseUrl, payload);
      },
      update: function(id, payload){
        return request('PUT', baseUrl + '/' + encodeURIComponent(id), payload);
      },
      remove: function(id){
        return request('DELETE', baseUrl + '/' + encodeURIComponent(id));
      },
      bulkDelete: function(ids){
        var safeIds = (ids || []).map(function(id){
          var numeric = Number(id);
          return isFinite(numeric) ? numeric : id;
        });
        return request('POST', baseUrl + '/bulk-delete', { ids: safeIds });
      }
    };
  };

})(window);

(function(global){
  'use strict';

  if(global.DcFacilityFk) return;

  var cache = {};
  var ALIASES = {
    access: 'access',
    data_delete: 'data_delete',
    data_deletion: 'data_delete',
    rack: 'rack',
    thermometer: 'thermometer',
    cctv: 'cctv',
    transformer: 'transformer',
    generator: 'generator',
    ups: 'ups',
    battery: 'battery',
    hvac: 'hvac',
    leak_detector: 'leak_detector',
    detection: 'detection',
    fire_extinguishing: 'fire_extinguishing',
    evacuation: 'evacuation'
  };

  function text(value){
    return String(value == null ? '' : value).trim();
  }

  function resourceKey(resource){
    var key = text(resource).toLowerCase().replace(/-/g, '_');
    return ALIASES[key] || key;
  }

  function escapeHtml(value){
    return text(value).replace(/[&<>"']/g, function(ch){
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch];
    });
  }

  function requestRows(resource){
    var key = resourceKey(resource);
    if(!key) return Promise.resolve([]);
    if(cache[key]) return cache[key];
    cache[key] = fetch('/api/facility-security-infra/' + encodeURIComponent(key), {
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' }
    }).then(function(response){
      return response.json().catch(function(){ return {}; }).then(function(payload){
        if(!response.ok || payload.success === false){
          throw new Error(payload.message || payload.error || '시설·보안 모델 목록을 불러오지 못했습니다.');
        }
        var rows = Array.isArray(payload.items) ? payload.items : (Array.isArray(payload.rows) ? payload.rows : []);
        return rows.map(function(row){
          return {
            manufacturer: text(row.manufacturer_name || row.vendor || row.manufacturer),
            model: text(row.model_name || row.model || row.source_model_name),
            partNumber: text(row.part_number || row.part_no),
            capacity: text(row.capacity),
            raw: row
          };
        }).filter(function(row){ return row.manufacturer || row.model; });
      });
    }).catch(function(err){
      try { console.warn('[DcFacilityFk] ' + key + ' load failed', err); } catch(_e){}
      return [];
    });
    return cache[key];
  }

  function uniqueSorted(rows, getter){
    var seen = {};
    var output = [];
    (rows || []).forEach(function(row){
      var value = text(getter(row));
      if(!value || seen[value]) return;
      seen[value] = true;
      output.push(value);
    });
    output.sort(function(a, b){ return a.localeCompare(b, 'ko-KR'); });
    return output;
  }

  function replaceFieldWithSelect(field, placeholder){
    if(!field) return null;
    if(field.tagName && field.tagName.toLowerCase() === 'select'){
      field.classList.add('search-select');
      field.classList.remove('fk-select');
      field.setAttribute('data-searchable', 'true');
      field.setAttribute('data-placeholder', field.getAttribute('data-placeholder') || placeholder || '검색 선택');
      field.setAttribute('data-allow-clear', 'true');
      field.setAttribute('data-fk-ignore', '1');
      field.removeAttribute('data-search-source');
      field.removeAttribute('data-source');
      field.removeAttribute('data-fk');
      if(field.value) field.dataset.facilityFkCurrent = text(field.value);
      return field;
    }
    var select = document.createElement('select');
    select.name = field.name || '';
    select.className = field.className || 'form-input';
    select.classList.add('search-select');
    select.classList.remove('fk-select');
    select.setAttribute('data-searchable', 'true');
    select.setAttribute('data-placeholder', field.getAttribute('data-placeholder') || placeholder || field.getAttribute('placeholder') || '검색 선택');
    select.setAttribute('data-allow-clear', 'true');
    select.setAttribute('data-fk-ignore', '1');
    if(field.required) select.required = true;
    if(field.disabled) select.disabled = true;
    if(field.id) select.id = field.id;
    select.dataset.facilityFkCurrent = text(field.value || (field.dataset && field.dataset.value));
    field.parentNode.replaceChild(select, field);
    return select;
  }

  function hasOption(options, current){
    var value = text(current);
    if(!value) return false;
    return (options || []).some(function(option){ return option === value; });
  }

  function renderOptions(select, values, current, placeholder){
    if(!select) return;
    var items = values || [];
    var selected = text(current || select.value || select.dataset.facilityFkCurrent);
    if(selected && !hasOption(items, selected)) selected = '';
    var html = '<option value="">' + escapeHtml(placeholder || select.getAttribute('data-placeholder') || '검색 선택') + '</option>';
    items.forEach(function(value){
      html += '<option value="' + escapeHtml(value) + '"' + (value === selected ? ' selected' : '') + '>' + escapeHtml(value) + '</option>';
    });
    select.innerHTML = html;
    select.value = selected;
    select.dataset.facilityFkCurrent = selected;
  }

  function syncSearchable(scope){
    function run(){
      try {
        if(global.BlossomSearchableSelect && typeof global.BlossomSearchableSelect.syncAll === 'function'){
          global.BlossomSearchableSelect.syncAll(scope || document);
          return true;
        }
      } catch(_e){}
      return false;
    }
    if(!run()){
      setTimeout(run, 0);
      setTimeout(run, 120);
    }
  }

  function findModel(rows, model, manufacturer){
    var wantedModel = text(model);
    var wantedManufacturer = text(manufacturer);
    if(!wantedModel) return null;
    var exact = null;
    (rows || []).some(function(row){
      if(row.model !== wantedModel) return false;
      if(wantedManufacturer && row.manufacturer === wantedManufacturer){
        exact = row;
        return true;
      }
      if(!exact) exact = row;
      return false;
    });
    return exact;
  }

  function wireForm(form, options){
    options = options || {};
    if(!form) return Promise.resolve([]);
    var resource = resourceKey(options.resource || (global.__DC_FACILITY_CONFIG__ && global.__DC_FACILITY_CONFIG__.resource));
    if(!resource) return Promise.resolve([]);
    var manufacturerName = options.manufacturerName || options.vendorName || 'vendor';
    var modelName = options.modelName || 'model';
    var manufacturerField = replaceFieldWithSelect(form.querySelector('[name="' + manufacturerName + '"]'), '제조사 검색');
    var modelField = replaceFieldWithSelect(form.querySelector('[name="' + modelName + '"]'), '모델명 검색');
    if(!manufacturerField || !modelField) return Promise.resolve([]);
    form.setAttribute('data-fk-ignore', '1');
    manufacturerField.dataset.facilityFkRole = 'manufacturer';
    modelField.dataset.facilityFkRole = 'model';
    manufacturerField.dataset.facilityFkResource = resource;
    modelField.dataset.facilityFkResource = resource;

    return requestRows(resource).then(function(rows){
      function modelValues(){
        var selectedManufacturer = text(manufacturerField.value);
        return uniqueSorted(rows.filter(function(row){
          return !selectedManufacturer || row.manufacturer === selectedManufacturer;
        }), function(row){ return row.model; });
      }
      function refreshModels(keepCurrent){
        var current = keepCurrent ? modelField.value : '';
        renderOptions(modelField, modelValues(), current, '모델명 검색');
      }
      renderOptions(manufacturerField, uniqueSorted(rows, function(row){ return row.manufacturer; }), manufacturerField.value, '제조사 검색');
      if(!text(manufacturerField.value) && text(modelField.value)){
        var initialMatch = findModel(rows, modelField.value, '');
        if(initialMatch && initialMatch.manufacturer){
          renderOptions(manufacturerField, uniqueSorted(rows, function(row){ return row.manufacturer; }), initialMatch.manufacturer, '제조사 검색');
        }
      }
      refreshModels(true);

      if(manufacturerField.dataset.facilityFkBound !== '1'){
        manufacturerField.addEventListener('change', function(event){
          if(event && typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
          var selectedModel = findModel(rows, modelField.value, '');
          var selectedManufacturer = text(manufacturerField.value);
          var keep = selectedModel && (!selectedManufacturer || selectedModel.manufacturer === selectedManufacturer);
          refreshModels(keep);
          syncSearchable(form);
        }, true);
        manufacturerField.dataset.facilityFkBound = '1';
      }
      if(modelField.dataset.facilityFkBound !== '1'){
        modelField.addEventListener('change', function(event){
          if(event && typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
          var match = findModel(rows, modelField.value, manufacturerField.value);
          if(match && match.manufacturer && manufacturerField.value !== match.manufacturer){
            renderOptions(manufacturerField, uniqueSorted(rows, function(row){ return row.manufacturer; }), match.manufacturer, '제조사 검색');
            refreshModels(true);
          }
          syncSearchable(form);
        }, true);
        modelField.dataset.facilityFkBound = '1';
      }
      syncSearchable(form);
      return rows;
    });
  }

  global.DcFacilityFk = {
    load: requestRows,
    wireForm: wireForm,
    sync: syncSearchable,
    resourceKey: resourceKey
  };
})(window);
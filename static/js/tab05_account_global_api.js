/* Global DB/API wiring for tab05-account tables.

This project has many duplicated detail JS files that implement tab05-account
interactions purely in the DOM. This file adds persistence via the generic
`/api/asset-accounts` endpoints without requiring per-page JS edits.

It is intentionally defensive:
- If it cannot infer asset_scope + asset_id, it does nothing.
- If a page declares `window.__TAB05_ACCOUNT_API_HANDLED__ = true`, it does nothing.
*/

(function () {
  'use strict';

  if (window.__TAB05_ACCOUNT_API_HANDLED__ === true) return;

  var STATUS_OPTIONS = ['활성', '비활성', '고스트', '예외'];

  function ensureSearchableSelectSource() {
    try {
      window.BlossomSearchableSelectSources = window.BlossomSearchableSelectSources || {};
      if (typeof window.BlossomSearchableSelectSources.org_user_name === 'function') return;

      window.BlossomSearchableSelectSources.org_user_name = function (ctx) {
        var q = (ctx && ctx.query) ? String(ctx.query).trim() : '';
        try {
          var url = '/api/chat/directory?limit=50' + (q ? ('&q=' + encodeURIComponent(q)) : '');
          return fetch(url, {
            method: 'GET',
            credentials: 'same-origin'
          })
            .then(function (r) { return r.json(); })
            .then(function (items) {
              if (!Array.isArray(items)) return [];
              var out = [];
              for (var i = 0; i < items.length; i++) {
                var u = items[i] || {};
                var name = (u.name || u.nickname || '');
                if (!name) continue;
                var dept = u.department || '';
                var label = dept ? (name + ' (' + dept + ')') : name;
                out.push({ value: String(name), label: String(label), displayLabel: String(name) });
              }
              return out;
            })
            .catch(function () { return []; });
        } catch (_) {
          return Promise.resolve([]);
        }
      };
    } catch (_) {
      // ignore
    }
  }

  function enhanceSearchSelects(scopeEl) {
    try {
      if (window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function') {
        window.BlossomSearchableSelect.enhance(scopeEl || document);
      }
    } catch (_) {
      // ignore
    }
  }

  function qs(id) {
    return document.getElementById(id);
  }

  function text(el) {
    try {
      return (el && el.textContent ? String(el.textContent) : '').trim();
    } catch (_) {
      return '';
    }
  }

  function inferSystemKeyFromPage() {
    // Prefer subtitle hostname/system label displayed in the UI.
    // Fallback to pathname to ensure a stable, non-empty key.
    var ids = ['page-subtitle', 'page-header-subtitle', 'pageSubtitle', 'pageHeaderSubtitle'];
    var s = '';
    for (var i = 0; i < ids.length; i++) {
      s = text(qs(ids[i]));
      if (s && s !== '-') break;
    }
    if (!s || s === '-') {
      try {
        s = String((window.location && window.location.pathname) ? window.location.pathname : '').trim();
      } catch (_) {
        s = '';
      }
    }
    s = String(s || '').trim();
    if (!s) s = 'unknown';
    if (s.length > 255) s = s.slice(0, 255);
    return s;
  }

  function coerceInt(val) {
    if (val === null || val === undefined || val === '') return null;
    var n = parseInt(String(val), 10);
    return isNaN(n) ? null : n;
  }

  function uniqPush(arr, val) {
    if (!val) return;
    var s = String(val).trim();
    if (!s) return;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] === s) return;
    }
    arr.push(s);
  }

  function extractTokensFromString(str) {
    var out = [];
    if (!str) return out;
    var s = String(str);
    // Keep only alnum/_/- as separators; then split.
    var parts = s.split(/[^A-Za-z0-9_-]+/g);
    for (var i = 0; i < parts.length; i++) {
      var p = (parts[i] || '').trim();
      if (!p) continue;
      // Avoid noisy numeric-only segments.
      if (/^\d+$/.test(p)) continue;
      // Prefer reasonably short scope-like tokens.
      if (p.length < 2 || p.length > 40) continue;
      out.push(p);
    }
    return out;
  }

  function guessPreferredScopes() {
    var scopes = [];

    // 1) From pathname and querystring (common detail URLs: /p/<key>).
    try {
      var path = String(window.location.pathname || '');
      extractTokensFromString(path).forEach(function (t) {
        uniqPush(scopes, t);
      });
    } catch (_) {
      // ignore
    }

    // 2) From known tab links (server-detail-tabs).
    try {
      var links = document.querySelectorAll('.server-detail-tab-btn[href]');
      for (var i = 0; i < links.length; i++) {
        var href = links[i].getAttribute('href');
        extractTokensFromString(href).forEach(function (t) {
          uniqPush(scopes, t);
        });
      }
    } catch (_) {
      // ignore
    }

    // 3) From loaded script paths (detail pages usually load *.<scope>_detail.js and/or folder like 3-1-1.unix).
    try {
      var scripts = document.querySelectorAll('script[src]');
      for (var j = 0; j < scripts.length; j++) {
        var src = scripts[j].getAttribute('src') || '';
        if (!src) continue;

        // Extract scope from folder segments like "3-1-1.unix".
        var segs = src.split('/');
        for (var k = 0; k < segs.length; k++) {
          var seg = segs[k];
          if (!seg) continue;
          var dotIdx = seg.lastIndexOf('.');
          if (dotIdx > 0 && dotIdx < seg.length - 1) {
            var tail = seg.slice(dotIdx + 1);
            if (/^[A-Za-z][A-Za-z0-9_-]{1,39}$/.test(tail)) {
              uniqPush(scopes, tail);
            }
          }
        }

        // Extract scope from filename like "2.unix_detail.js" or "2.workstation_detail.js".
        var file = segs.length ? segs[segs.length - 1] : '';
        var m = file.match(/\.([A-Za-z][A-Za-z0-9_-]{1,39})_(?:detail|list)\.js/i);
        if (m && m[1]) uniqPush(scopes, m[1]);
      }
    } catch (_) {
      // ignore
    }

    return scopes;
  }

  function parseSelectedRow(raw) {
    if (!raw) return null;
    try {
      var obj = JSON.parse(raw);
      return obj && typeof obj === 'object' ? obj : null;
    } catch (_) {
      return null;
    }
  }

  function extractIdFromRow(row, scopeHint) {
    if (!row || typeof row !== 'object') return null;

    var id = null;
    if (row.id !== undefined) id = coerceInt(row.id);
    if (id == null && row.asset_id !== undefined) id = coerceInt(row.asset_id);
    if (id == null && row.assetId !== undefined) id = coerceInt(row.assetId);

    if (id == null && scopeHint) {
      var k1 = scopeHint + '_id';
      if (row[k1] !== undefined) id = coerceInt(row[k1]);
      var k2 = scopeHint + 'Id';
      if (id == null && row[k2] !== undefined) id = coerceInt(row[k2]);
    }

    // Generic fallback: if there is exactly one numeric *_id field, use it.
    if (id == null) {
      var candidates = [];
      for (var key in row) {
        if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
        if (!/_id$/i.test(key)) continue;
        var v = coerceInt(row[key]);
        if (v != null) candidates.push(v);
      }
      if (candidates.length === 1) id = candidates[0];
    }

    return id;
  }

  function normalizeContext(ctx) {
    if (!ctx || typeof ctx !== 'object') return null;
    var scope = (ctx.asset_scope == null ? '' : String(ctx.asset_scope)).trim();
    var id = coerceInt(ctx.asset_id);
    if (!scope || id == null) return null;
    return { asset_scope: scope, asset_id: id };
  }

  function rememberContext(ctx) {
    var norm = normalizeContext(ctx);
    if (!norm) return;
    try {
      localStorage.setItem('tab05:lastContext', JSON.stringify(norm));
      localStorage.setItem('tab05:lastContext:' + norm.asset_scope, JSON.stringify(norm));
    } catch (_) {
      // ignore
    }
  }

  function readRememberedContext(preferredScopes) {
    try {
      // Prefer per-scope remembered context when we can infer a likely scope for this page.
      if (preferredScopes && preferredScopes.length) {
        for (var i = 0; i < preferredScopes.length; i++) {
          var s = preferredScopes[i];
          var raw = localStorage.getItem('tab05:lastContext:' + s);
          var obj = parseSelectedRow(raw);
          var norm = normalizeContext(obj);
          if (norm && norm.asset_scope === s) return norm;
        }
      }

      // Fallback: global last context (only if it matches one of our preferred scopes when available).
      var raw2 = localStorage.getItem('tab05:lastContext');
      var obj2 = parseSelectedRow(raw2);
      var norm2 = normalizeContext(obj2);
      if (!norm2) return null;
      if (preferredScopes && preferredScopes.length) {
        for (var j = 0; j < preferredScopes.length; j++) {
          if (preferredScopes[j] === norm2.asset_scope) return norm2;
        }
        return null;
      }
      return norm2;
    } catch (_) {
      return null;
    }
  }

  function inferContext() {
    // 0) Explicit override from a page-specific script (strongest signal).
    try {
      var explicit = normalizeContext(window.__TAB05_ACCOUNT_CONTEXT__);
      if (explicit) return explicit;
    } catch (_) {
      // ignore
    }

    // 1) sessionStorage: prefer current-page scopes first (prevents picking unrelated selections).
    try {
      var preferredScopes = guessPreferredScopes();
      for (var ps = 0; ps < preferredScopes.length; ps++) {
        var s = preferredScopes[ps];
        var keys = [s + ':selectedRow', s + ':selected:row', s + '_selected_row'];
        for (var kk = 0; kk < keys.length; kk++) {
          var k = keys[kk];
          var raw = sessionStorage.getItem(k);
          if (!raw) continue;
          var row = parseSelectedRow(raw);
          var id = extractIdFromRow(row, s);
          if (id != null) return { asset_scope: s, asset_id: id };
        }
      }
    } catch (_) {
      // ignore
    }

    // 2) sessionStorage: fallback scan for any *:selectedRow / *:selected:row / *_selected_row
    try {
      for (var i = 0; i < sessionStorage.length; i++) {
        var key = sessionStorage.key(i);
        if (!key) continue;

        // Skip bulk-selection / unrelated keys.
        if (/dispose_selected_rows/i.test(key)) continue;
        if (/:(selected:(work_name|system_name|workgroup|group|name))$/i.test(key)) continue;

        var m = key.match(/^([A-Za-z0-9_\-]+):(selected:row|selectedRow)$/);
        var scope = m ? m[1] : null;
        if (!scope) {
          var m2 = key.match(/^([A-Za-z0-9_\-]+)_selected_row$/);
          scope = m2 ? m2[1] : null;
        }
        if (!scope) continue;

        var raw2 = sessionStorage.getItem(key);
        if (!raw2) continue;
        var row2 = parseSelectedRow(raw2);
        var id2 = extractIdFromRow(row2, scope);
        if (scope && id2 != null) return { asset_scope: scope, asset_id: id2 };
      }
    } catch (_) {
      // ignore
    }

    // 3) querystring: asset_id/id or any *_id
    try {
      var params = new URLSearchParams(window.location.search || '');
      var id2 = coerceInt(params.get('asset_id') || params.get('assetId') || params.get('id'));
      if (id2 != null) {
        var scope2 = (params.get('scope') || params.get('asset_scope') || '').trim();
        if (!scope2) {
          // Fall back to a stable-ish scope from pathname
          scope2 = String(window.location.pathname || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        }
        return { asset_scope: scope2 || 'unknown', asset_id: id2 };
      }

      // search for any *_id
      var iter = params.keys();
      var k;
      while (!(k = iter.next()).done) {
        var name = k.value;
        if (!name || !/_id$/i.test(name)) continue;
        var val = coerceInt(params.get(name));
        if (val != null) {
          var scope3 = String(name).replace(/_id$/i, '');
          return { asset_scope: scope3 || 'unknown', asset_id: val };
        }
      }
    } catch (_) {
      // ignore
    }

    // 4) localStorage: last known context (helps refresh/bookmark flows).
    try {
      var preferred2 = guessPreferredScopes();
      var remembered = readRememberedContext(preferred2);
      if (remembered) return remembered;
    } catch (_) {
      // ignore
    }

    return null;
  }

  // (legacy datalist-based autocomplete was removed; replaced with search-select)

  function ensureStandardTable(table) {
    if (!table) return;

    // Normalize header to the required unified column set.
    var thead = table.querySelector('thead');
    if (!thead) {
      thead = document.createElement('thead');
      table.insertBefore(thead, table.firstChild);
    }

    thead.innerHTML =
      '<tr>' +
      '  <th><input type="checkbox" id="am-select-all" aria-label="전체 선택"></th>' +
      '  <th>상태<span class="req-star" aria-hidden="true">*</span></th>' +
      '  <th>계정명<span class="req-star" aria-hidden="true">*</span></th>' +
      '  <th>그룹명</th>' +
      '  <th>관리자</th>' +
      '  <th>사용자</th>' +
      '  <th>용도</th>' +
      '  <th>관리</th>' +
      '</tr>';

    // Normalize colgroup so widths roughly match across pages.
    var colgroup = table.querySelector('colgroup');
    if (!colgroup) {
      colgroup = document.createElement('colgroup');
      table.insertBefore(colgroup, thead);
    }
    colgroup.innerHTML =
      '<col><!-- checkbox -->' +
      '<col style="width: 10%"><!-- 상태 -->' +
      '<col style="width: 16%"><!-- 계정명 -->' +
      '<col style="width: 14%"><!-- 그룹명 -->' +
      '<col style="width: 14%"><!-- 관리자 -->' +
      '<col style="width: 18%"><!-- 사용자 -->' +
      '<col style="width: 20%"><!-- 용도 -->' +
      '<col class="actions-col"><!-- 관리 -->';

    var tbody = table.querySelector('tbody');
    if (!tbody) {
      tbody = document.createElement('tbody');
      table.appendChild(tbody);
    }
  }

  function escHtml(s) {
    var str = String(s == null ? '' : s);
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderRows(table, items) {
    var tbody = table.querySelector('tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    (items || []).forEach(function (item) {
      var tr = document.createElement('tr');
      tr.setAttribute('data-account-id', String(item.id));
      try {
        // Preserve hidden fields even if the UI doesn't expose them anymore.
        tr.dataset.remark = String(item.remark || '');
      } catch (_) {
        // ignore
      }

      tr.innerHTML =
        '<td><input type="checkbox" class="am-row-check" aria-label="행 선택"></td>' +
        '<td data-col="status">' + escHtml(item.status || '-') + '</td>' +
        '<td data-col="account">' + escHtml(item.account_name || '-') + '</td>' +
        '<td data-col="group_name">' + escHtml(item.group_name || '-') + '</td>' +
        '<td data-col="admin">' + escHtml(item.admin || '-') + '</td>' +
        '<td data-col="user">' + escHtml(item.user_name || '-') + '</td>' +
        '<td data-col="purpose">' + escHtml(item.purpose || '-') + '</td>' +
        '<td class="system-actions table-actions">' +
        '  <button class="action-btn js-am-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button>' +
        '  <button class="action-btn danger js-am-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>' +
        '</td>';

      tbody.appendChild(tr);
    });
  }

  function refreshPaginationUI(table) {
    // Mirror the common tab05 pagination behavior once after rows are inserted.
    try {
      var rows = Array.prototype.slice.call(table.querySelectorAll('tbody tr'));
      var total = rows.length;
      var sel = qs('am-page-size');
      var pageSize = coerceInt(sel && sel.value) || 10;
      var page = 1;
      var startIdx = (page - 1) * pageSize;
      var endIdx = startIdx + pageSize - 1;

      rows.forEach(function (tr, idx) {
        var visible = idx >= startIdx && idx <= endIdx;
        tr.style.display = visible ? '' : 'none';
        if (visible) tr.removeAttribute('data-hidden');
        else tr.setAttribute('data-hidden', '1');
      });

      var empty = qs('am-empty');
      if (empty) {
        var has = total > 0;
        empty.hidden = has;
        empty.style.display = has ? 'none' : '';
      }

      var csvBtn = qs('am-download-btn');
      if (csvBtn) {
        var has2 = total > 0;
        csvBtn.disabled = !has2;
        csvBtn.setAttribute('aria-disabled', (!has2).toString());
      }

      var pages = Math.max(1, Math.ceil(total / pageSize));
      var infoEl = qs('am-pagination-info');
      if (infoEl) {
        var start = total ? 1 : 0;
        var end = Math.min(total, pageSize);
        infoEl.textContent = start + '-' + end + ' / ' + total + '개 항목';
      }

      var numWrap = qs('am-page-numbers');
      if (numWrap) {
        numWrap.innerHTML = '';
        for (var p = 1; p <= pages && p <= 50; p++) {
          var b = document.createElement('button');
          b.className = 'page-btn' + (p === 1 ? ' active' : '');
          b.textContent = String(p);
          b.dataset.page = String(p);
          numWrap.appendChild(b);
        }
      }

      var btnFirst = qs('am-first');
      var btnPrev = qs('am-prev');
      var btnNext = qs('am-next');
      var btnLast = qs('am-last');
      if (btnFirst) btnFirst.disabled = true;
      if (btnPrev) btnPrev.disabled = true;
      if (btnNext) btnNext.disabled = pages <= 1;
      if (btnLast) btnLast.disabled = pages <= 1;
    } catch (_) {
      // ignore
    }
  }

  function readCellValue(tr, col) {
    var td = tr.querySelector('[data-col="' + col + '"]');
    if (!td) return '';
    var multi = td.querySelector('input[data-am-multi]');
    if (multi) return String(multi.value || '').trim();
    var inp = td.querySelector('input, select, textarea');
    if (inp) return String(inp.value || '').trim();
    return text(td);
  }

  function setCellText(tr, col, val) {
    var td = tr.querySelector('[data-col="' + col + '"]');
    if (!td) return;
    td.textContent = (val === '' || val == null) ? '-' : String(val);
  }

  function setToggleToEdit(tr) {
    var btn = tr.querySelector('.js-am-toggle');
    if (!btn) return;
    btn.setAttribute('data-action', 'edit');
    btn.title = '편집';
    btn.setAttribute('aria-label', '편집');
    btn.innerHTML = '<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon">';
  }

  function setToggleToSave(tr) {
    var btn = tr.querySelector('.js-am-toggle');
    if (!btn) return;
    btn.setAttribute('data-action', 'save');
    btn.title = '저장';
    btn.setAttribute('aria-label', '저장');
    btn.innerHTML = '<img src="/static/image/svg/save.svg" alt="저장" class="action-icon">';
  }

  function replaceCellWithInput(tr, col, opts) {
    var td = tr.querySelector('[data-col="' + col + '"]');
    if (!td) return null;
    var current = readCellValue(tr, col);
    if (current === '-') current = '';

    var input = document.createElement('input');
    input.type = 'text';
    input.value = current;
    input.placeholder = (opts && opts.placeholder) ? String(opts.placeholder) : '';
    if (opts && opts.listId) input.setAttribute('list', opts.listId);
    if (opts && opts.required) input.setAttribute('required', 'required');
    td.innerHTML = '';
    td.appendChild(input);
    return input;
  }

  function replaceCellWithSearchSelect(tr, col, opts) {
    var td = tr.querySelector('[data-col="' + col + '"]');
    if (!td) return null;
    var current = readCellValue(tr, col);
    if (current === '-') current = '';

    var select = document.createElement('select');
    select.className = 'search-select';
    select.setAttribute('data-searchable-scope', 'page');
    select.setAttribute('data-allow-clear', 'true');
    if (opts && opts.placeholder) select.setAttribute('data-placeholder', String(opts.placeholder));
    if (opts && opts.required) select.required = true;
    if (opts && opts.searchSource) select.setAttribute('data-search-source', String(opts.searchSource));

    var opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = (opts && opts.placeholder) ? String(opts.placeholder) : '선택';
    select.appendChild(opt0);

    if (opts && Array.isArray(opts.options)) {
      opts.options.forEach(function (o) {
        var v = (o && o.value != null) ? String(o.value) : String(o || '');
        var l = (o && o.label != null) ? String(o.label) : v;
        if (!v) return;
        var opt = document.createElement('option');
        opt.value = v;
        opt.textContent = l;
        select.appendChild(opt);
      });
    }

    if (current) {
      var exists = Array.prototype.some.call(select.options, function (o) { return (o.value || '') === current; });
      if (!exists) {
        var optX = document.createElement('option');
        optX.value = current;
        optX.textContent = current;
        select.appendChild(optX);
      }
      select.value = current;
    }

    td.innerHTML = '';
    td.appendChild(select);
    return select;
  }

  function splitMultiNames(str) {
    var out = [];
    if (!str) return out;
    var parts = String(str).split(/[,;\n\r\t]+/g);
    for (var i = 0; i < parts.length; i++) {
      var p = String(parts[i] || '').trim();
      if (!p) continue;
      if (out.indexOf(p) >= 0) continue;
      out.push(p);
    }
    return out;
  }

  function joinMultiNames(arr) {
    if (!arr || !arr.length) return '';
    return arr.map(function (s) { return String(s || '').trim(); }).filter(Boolean).join(', ');
  }

  function replaceCellWithUserMultiSelect(tr, col, opts) {
    var td = tr.querySelector('[data-col="' + col + '"]');
    if (!td) return null;
    var current = readCellValue(tr, col);
    if (current === '-') current = '';

    var wrapper = document.createElement('div');
    wrapper.className = 'am-user-multi';

    var hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.value = joinMultiNames(splitMultiNames(current));
    hidden.setAttribute('data-am-multi', 'user');

    var chips = document.createElement('div');
    chips.className = 'am-user-chips';

    function syncHiddenFromChips() {
      var names = [];
      var items = chips.querySelectorAll('.am-user-chip');
      for (var i = 0; i < items.length; i++) {
        var nm = items[i].getAttribute('data-name') || '';
        nm = String(nm || '').trim();
        if (!nm) continue;
        if (names.indexOf(nm) >= 0) continue;
        names.push(nm);
      }
      hidden.value = joinMultiNames(names);
    }

    function addChip(name) {
      var nm = String(name || '').trim();
      if (!nm) return;
      if (Array.prototype.some.call(chips.querySelectorAll('.am-user-chip'), function (el) {
        return String(el.getAttribute('data-name') || '') === nm;
      })) return;

      var chip = document.createElement('span');
      chip.className = 'am-user-chip';
      chip.setAttribute('data-name', nm);
      chip.innerHTML =
        '<span class="am-user-chip__name">' + escHtml(nm) + '</span>' +
        '<button type="button" class="am-user-chip__remove" aria-label="사용자 제거" title="제거">×</button>';
      chip.querySelector('.am-user-chip__remove').addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (chip && chip.parentNode) chip.parentNode.removeChild(chip);
        syncHiddenFromChips();
      });
      chips.appendChild(chip);
      syncHiddenFromChips();
    }

    splitMultiNames(current).forEach(addChip);

    var select = document.createElement('select');
    select.className = 'search-select';
    select.setAttribute('data-searchable-scope', 'page');
    select.setAttribute('data-allow-clear', 'true');
    select.setAttribute('data-search-source', (opts && opts.searchSource) ? String(opts.searchSource) : 'org_user_name');
    if (opts && opts.placeholder) select.setAttribute('data-placeholder', String(opts.placeholder));

    var opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = (opts && opts.placeholder) ? String(opts.placeholder) : '사용자 추가';
    select.appendChild(opt0);

    select.addEventListener('change', function () {
      var v = String(select.value || '').trim();
      if (!v) return;
      addChip(v);
      try {
        select.value = '';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (_) {
        // ignore
      }
    });

    wrapper.appendChild(chips);
    wrapper.appendChild(select);
    wrapper.appendChild(hidden);

    td.innerHTML = '';
    td.appendChild(wrapper);
    return hidden;
  }

  function enterEditMode(tr) {
    if (!tr) return;
    ensureSearchableSelectSource();
    var statusSel = replaceCellWithSearchSelect(tr, 'status', {
      placeholder: '상태 선택 (필수)',
      required: true,
      options: STATUS_OPTIONS.map(function (v) { return { value: v, label: v }; })
    });
    var accountInp = replaceCellWithInput(tr, 'account', { placeholder: '계정명', required: true });
    replaceCellWithInput(tr, 'group_name', { placeholder: '그룹명' });
    replaceCellWithSearchSelect(tr, 'admin', { placeholder: '관리자 선택', searchSource: 'org_user_name' });
    replaceCellWithUserMultiSelect(tr, 'user', { placeholder: '사용자 추가', searchSource: 'org_user_name' });
    replaceCellWithInput(tr, 'purpose', { placeholder: '용도' });

    enhanceSearchSelects(tr);
    if (statusSel && !statusSel.value) statusSel.value = STATUS_OPTIONS[0];
    setToggleToSave(tr);
    try {
      (accountInp || statusSel || tr).focus();
    } catch (_) {
      // ignore
    }
  }

  function validation(tr) {
    // Return first invalid input/select or null.
    function mark(col, ok) {
      var td = tr.querySelector('[data-col="' + col + '"]');
      if (!td) return null;
      var inp = td.querySelector('input, select');
      if (!inp) return null;
      var display = td.querySelector('.fk-searchable-display');
      if (ok) {
        inp.classList.remove('input-error');
        inp.removeAttribute('aria-invalid');
        if (display) display.classList.remove('input-error');
      } else {
        inp.classList.add('input-error');
        inp.setAttribute('aria-invalid', 'true');
        if (display) display.classList.add('input-error');
      }
      return inp;
    }

    var req = ['status', 'account'];

    var first = null;
    req.forEach(function (col) {
      var v = readCellValue(tr, col);
      var ok = !!v && v !== '-';
      var inp = mark(col, ok);
      if (!ok && !first && inp) first = inp;
    });

    // Enforce the fixed status set.
    var statusVal = readCellValue(tr, 'status');
    if (statusVal && statusVal !== '-' && STATUS_OPTIONS.indexOf(statusVal) < 0) {
      var sInp = mark('status', false);
      if (!first && sInp) first = sInp;
    }
    return first;
  }

  function payload(ctx, tr) {
    var p = {
      asset_scope: ctx.asset_scope,
      asset_id: ctx.asset_id,
      system_key: inferSystemKeyFromPage(),
      status: readCellValue(tr, 'status'),
      account_name: readCellValue(tr, 'account')
    };

    p.group_name = readCellValue(tr, 'group_name');
    p.admin = readCellValue(tr, 'admin');
    p.user_name = readCellValue(tr, 'user');
    p.purpose = readCellValue(tr, 'purpose');
    // Preserve existing remark in DB even though the UI hides it.
    try {
      p.remark = String((tr.dataset && tr.dataset.remark) ? tr.dataset.remark : '');
    } catch (_) {
      p.remark = '';
    }

    // Keep backward-compatible fields present (API accepts them; defaults are ok)
    p.uid = null;
    p.gid = null;
    p.role = '';
    p.privilege_level = '';
    p.login_allowed = false;
    p.su_allowed = false;

    return p;
  }

  function applyViewMode(tr, item, fallbackPayload) {
    // Convert edited row to view cells.
    setCellText(tr, 'status', item.status || fallbackPayload.status);
    setCellText(tr, 'account', item.account_name || fallbackPayload.account_name);

    setCellText(tr, 'group_name', item.group_name || fallbackPayload.group_name);
    setCellText(tr, 'admin', item.admin || fallbackPayload.admin);
    setCellText(tr, 'user', item.user_name || fallbackPayload.user_name);
    setCellText(tr, 'purpose', item.purpose || fallbackPayload.purpose);
    try {
      tr.dataset.remark = String(item.remark || fallbackPayload.remark || '');
    } catch (_) {
      // ignore
    }

    setToggleToEdit(tr);
  }

  function wire() {
    if (window.__TAB05_ACCOUNT_API_HANDLED__ === true) return;

    // If the page-specific tab05 controller is present, do not attach the global CRUD wiring.
    // Running both causes duplicate network requests (double insert) on Save.
    if (window.__TAB05_ACCOUNT_DETAIL_INIT__ === true) return;

    // Extra safety: if the dedicated tab05 script is included (even if cached/older),
    // skip global wiring so Add/Save don't double-fire.
    try {
      if (document.querySelector('script[src*="/static/js/_detail/tab05-account.js"]')) return;
    } catch (_) { }

    var table = qs('am-spec-table');
    if (!table) return;

    // Skip if a page-specific integration already owns this tab.
    if (window.__TAB05_ACCOUNT_API_HANDLED__ === true) return;

    var ctx = inferContext();
    if (!ctx) return;

    // Idempotent bind (prevents duplicate listeners if this script is included twice).
    if (table.__amGlobalApiBound) return;
    table.__amGlobalApiBound = true;

    // Persist for refresh/direct URL use.
    rememberContext(ctx);

    ensureSearchableSelectSource();
    ensureStandardTable(table);
    enhanceSearchSelects(table);

    var addBtn = qs('am-row-add');
    if (addBtn && !addBtn.__amBound) {
      addBtn.__amBound = true;
      addBtn.addEventListener('click', function (ev) {
        // If the dedicated tab05 controller becomes active later (e.g., via dynamic tab script load),
        // don't let the legacy global handler create a duplicate row.
        if (window.__TAB05_ACCOUNT_DETAIL_INIT__ === true) return;
        if (window.__TAB05_ACCOUNT_API_HANDLED__ === true) return;
        try {
          if (document.querySelector('script[src*="/static/js/_detail/tab05-account.js"]')) return;
        } catch (_) { }

        // Shared per-event guard (prevents double insert when multiple handlers exist).
        try {
          if (ev && ev.__amRowAddHandled) return;
          if (ev) ev.__amRowAddHandled = true;
        } catch (_) { }

        ev.preventDefault();
        ev.stopImmediatePropagation();

        var tbody = table.querySelector('tbody');
        if (!tbody) return;
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td><input type="checkbox" class="am-row-check" aria-label="행 선택"></td>' +
          '<td data-col="status">' + escHtml(STATUS_OPTIONS[0]) + '</td>' +
          '<td data-col="account">-</td>' +
          '<td data-col="group_name">-</td>' +
          '<td data-col="admin">-</td>' +
          '<td data-col="user">-</td>' +
          '<td data-col="purpose">-</td>' +
          '<td class="system-actions table-actions">' +
          '  <button class="action-btn js-am-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button>' +
          '  <button class="action-btn danger js-am-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>' +
          '</td>';
        try { tr.dataset.remark = ''; } catch (_) {}
        tbody.insertBefore(tr, tbody.firstChild);
        enterEditMode(tr);
        refreshPaginationUI(table);
      }, true);
    }

    // Load initial rows
    try {
      fetch(
        '/api/asset-accounts?asset_scope=' + encodeURIComponent(ctx.asset_scope) +
        '&asset_id=' + encodeURIComponent(String(ctx.asset_id)) +
        '&system_key=' + encodeURIComponent(String(inferSystemKeyFromPage())),
        {
        method: 'GET',
        credentials: 'same-origin'
        }
      )
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data || data.success !== true) return;
          renderRows(table, data.items || []);
          refreshPaginationUI(table);
        })
        .catch(function () { /* ignore */ });
    } catch (_) {
      // ignore
    }

    // Capture-phase interception for Save/Delete so we don't need to edit dozens of duplicated listeners.
    table.addEventListener('click', function (ev) {
      if (window.__TAB05_ACCOUNT_API_HANDLED__ === true) return;
      if (window.__TAB05_ACCOUNT_DETAIL_INIT__ === true) return;
      var btn = ev.target.closest('.js-am-del, .js-am-toggle');
      if (!btn) return;
      var tr = ev.target.closest('tr');
      if (!tr) return;

      // Delete
      if (btn.classList.contains('js-am-del')) {
        var accountId = coerceInt(tr.getAttribute('data-account-id'));
        ev.preventDefault();
        ev.stopImmediatePropagation();

        if (tr.__amDeleting) return;
        tr.__amDeleting = true;
        try { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); } catch (_) {}

        if (accountId == null) {
          if (tr.parentNode) tr.parentNode.removeChild(tr);
          refreshPaginationUI(table);
          return;
        }

        try {
          fetch(
            '/api/asset-accounts/' + encodeURIComponent(String(accountId)) +
            '?asset_scope=' + encodeURIComponent(ctx.asset_scope) +
            '&asset_id=' + encodeURIComponent(String(ctx.asset_id)) +
            '&system_key=' + encodeURIComponent(String(inferSystemKeyFromPage())),
            {
            method: 'DELETE',
            credentials: 'same-origin'
            }
          )
            .then(function (r) {
              if (r.status === 401) return { success: false, message: '로그인이 필요합니다.' };
              return r.json();
            })
            .then(function (data) {
              if (data && data.success === true) {
                if (tr.parentNode) tr.parentNode.removeChild(tr);
                refreshPaginationUI(table);
              }
            })
            .catch(function () { /* ignore */ })
            .finally(function () {
              tr.__amDeleting = false;
              try { btn.disabled = false; btn.removeAttribute('aria-busy'); } catch (_) {}
            });
        } catch (_) {
          tr.__amDeleting = false;
          try { btn.disabled = false; btn.removeAttribute('aria-busy'); } catch (_) {}
          // ignore
        }
        return;
      }

      // Edit
      if (btn.classList.contains('js-am-toggle') && btn.getAttribute('data-action') === 'edit') {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        enterEditMode(tr);
        return;
      }

      // Save (only when the toggle is in save mode)
      if (btn.classList.contains('js-am-toggle') && btn.getAttribute('data-action') === 'save') {
        ev.preventDefault();
        ev.stopImmediatePropagation();

        if (tr.__amSaving) return;
        tr.__amSaving = true;
        try { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); } catch (_) {}

        var firstInvalid = validation(tr);
        if (firstInvalid) {
          try { firstInvalid.focus(); } catch (_) { }
          return;
        }

        var pl = payload(ctx, tr);
        var accountId2 = coerceInt(tr.getAttribute('data-account-id'));
        var url = accountId2 == null
          ? '/api/asset-accounts'
          : '/api/asset-accounts/' + encodeURIComponent(String(accountId2));
        var method = accountId2 == null ? 'POST' : 'PUT';

        try {
          fetch(url, {
            method: method,
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pl)
          })
            .then(function (r) {
              if (r.status === 401) return { success: false, message: '로그인이 필요합니다.' };
              return r.json();
            })
            .then(function (data) {
              if (!data || data.success !== true || !data.item) return;
              tr.setAttribute('data-account-id', String(data.item.id));
              applyViewMode(tr, data.item, pl);
              refreshPaginationUI(table);
            })
            .catch(function () { /* ignore */ })
            .finally(function () {
              tr.__amSaving = false;
              try { btn.disabled = false; btn.removeAttribute('aria-busy'); } catch (_) {}
            });
        } catch (_) {
          tr.__amSaving = false;
          try { btn.disabled = false; btn.removeAttribute('aria-busy'); } catch (_) {}
          // ignore
        }
      }
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();

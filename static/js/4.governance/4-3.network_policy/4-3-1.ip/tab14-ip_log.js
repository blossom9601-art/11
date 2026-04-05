(function(){
  'use strict';

  function ready(fn){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function qs(name){
    try{ return new URLSearchParams(window.location.search).get(name); }catch(_e){ return null; }
  }

  function govDetailId(){
    try{ return (document.body.dataset.govDetailId || '').trim() || null; }
    catch(_e){ return null; }
  }

  async function apiRequest(path, options){
    const res = await fetch(path, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options && options.headers ? options.headers : {}) },
      ...options,
    });
    let body = null;
    try{ body = await res.json(); }catch(_e){ body = null; }
    if(!res.ok || (body && body.success === false)){
      const msg = (body && body.message) ? body.message : `요청 실패 (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body;
  }

  function setText(id, value){
    const el = document.getElementById(id);
    if(!el) return;
    const v = (value == null || String(value).trim() === '') ? '-' : String(value);
    el.textContent = v;
  }

  function openModal(id){
    const modal = document.getElementById(id);
    if(!modal) return;
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }

  function closeModal(id){
    const modal = document.getElementById(id);
    if(!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  function escapeHtml(s){
    return String(s ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function isPlainObject(v){
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  function tryParseJson(text){
    const s = String(text ?? '').trim();
    if(s === '') return null;
    if(!(s.startsWith('{') || s.startsWith('['))) return null;
    try{ return JSON.parse(s); }catch(_e){ return null; }
  }

  function normalizeToObject(v){
    if(isPlainObject(v)) return v;
    if(typeof v === 'string'){
      const parsed = tryParseJson(v);
      if(isPlainObject(parsed)) return parsed;
    }
    return null;
  }

  function extractBeforeAfter(root){
    // Handles common shapes:
    // 1) { before: {...}, after: {...} }
    // 2) { diff: { before: {...}, after: {...} } }
    // 3) { before: "{...}", after: "{...}" }
    // 4) root is a JSON string of any of the above
    let obj = root;
    if(typeof obj === 'string') obj = tryParseJson(obj);
    if(!obj) return null;

    if(isPlainObject(obj) && isPlainObject(obj.diff)) obj = obj.diff;

    if(!isPlainObject(obj)) return null;

    // Support alternative key names if they ever appear.
    const beforeRaw = (obj.before !== undefined) ? obj.before : (obj.before_value !== undefined ? obj.before_value : obj.old);
    const afterRaw = (obj.after !== undefined) ? obj.after : (obj.after_value !== undefined ? obj.after_value : obj.new);

    const beforeObj = normalizeToObject(beforeRaw);
    const afterObj = normalizeToObject(afterRaw);
    if(!(beforeObj && afterObj)) return null;

    return { beforeObj, afterObj };
  }

  function extractChangesEntries(root){
    // Handles common shapes used by this backend:
    // - { changes: { field: { before: X, after: Y }, ... } }
    // - { changed: { field: { before: X, after: Y }, ... } }
    // - { diff: { changes: ... } }
    let obj = root;
    if(typeof obj === 'string') obj = tryParseJson(obj);
    if(!obj) return null;
    if(isPlainObject(obj) && isPlainObject(obj.diff)) obj = obj.diff;
    if(!isPlainObject(obj)) return null;

    const map = isPlainObject(obj.changes)
      ? obj.changes
      : (isPlainObject(obj.changed) ? obj.changed : null);
    if(!isPlainObject(map)) return null;

    const entries = [];
    for(const key of Object.keys(map)){
      const entry = map[key];
      if(isPlainObject(entry)){
        const beforeVal = (entry.before !== undefined) ? entry.before
          : ((entry.before_value !== undefined) ? entry.before_value
            : ((entry.old !== undefined) ? entry.old
              : (entry.from !== undefined ? entry.from : undefined)));
        const afterVal = (entry.after !== undefined) ? entry.after
          : ((entry.after_value !== undefined) ? entry.after_value
            : ((entry.new !== undefined) ? entry.new
              : (entry.to !== undefined ? entry.to : undefined)));
        if(beforeVal !== undefined || afterVal !== undefined){
          entries.push({ path: [key], beforeVal, afterVal });
        }
      }
    }
    if(entries.length === 0) return null;

    entries.sort(function(a, b){
      return a.path.join('.').localeCompare(b.path.join('.'));
    });
    return entries;
  }

  function extractAfterOnly(root){
    // { after: {...} } or { created: {...} }
    let obj = root;
    if(typeof obj === 'string') obj = tryParseJson(obj);
    if(!obj) return null;
    if(isPlainObject(obj) && isPlainObject(obj.diff)) obj = obj.diff;
    if(!isPlainObject(obj)) return null;
    const afterRaw = (obj.after !== undefined) ? obj.after : (obj.created !== undefined ? obj.created : null);
    const afterObj = normalizeToObject(afterRaw);
    if(!afterObj) return null;
    return afterObj;
  }

  function extractBeforeOnly(root){
    // { before: {...} } or { deleted: {...} }
    let obj = root;
    if(typeof obj === 'string') obj = tryParseJson(obj);
    if(!obj) return null;
    if(isPlainObject(obj) && isPlainObject(obj.diff)) obj = obj.diff;
    if(!isPlainObject(obj)) return null;
    const beforeRaw = (obj.before !== undefined) ? obj.before : (obj.deleted !== undefined ? obj.deleted : null);
    const beforeObj = normalizeToObject(beforeRaw);
    if(!beforeObj) return null;
    return beforeObj;
  }

  function extractChangedArrayEntries(root){
    // Handles: { changed: [ { ip_address, before:{...}, after:{...} }, ... ] }
    // Used by IP range save logs.
    let obj = root;
    if(typeof obj === 'string') obj = tryParseJson(obj);
    if(!obj) return null;
    if(isPlainObject(obj) && isPlainObject(obj.diff)) obj = obj.diff;
    if(!isPlainObject(obj)) return null;

    const arr = obj.changed;
    if(!Array.isArray(arr) || arr.length === 0) return null;

    const entries = [];
    for(let i = 0; i < arr.length; i++){
      const row = arr[i];
      if(!isPlainObject(row)) continue;
      const ip = String(row.ip_address || row.ip || row.address || row.id || (i + 1));
      const beforeObj = normalizeToObject(row.before) || {};
      const afterObj = normalizeToObject(row.after) || {};

      // If before/after aren't both objects, show a single line.
      if(!isPlainObject(beforeObj) || !isPlainObject(afterObj)){
        entries.push({ path: [ip], beforeVal: row.before, afterVal: row.after });
        continue;
      }

      const rowChanges = diffBeforeAfter(beforeObj, afterObj)
        .filter(function(c){ return Array.isArray(c.path) && c.path.length > 0; });
      for(const c of rowChanges){
        // Keep path segments to allow label mapping without exposing raw keys.
        entries.push({ path: [ip].concat(c.path), beforeVal: c.beforeVal, afterVal: c.afterVal });
      }
    }

    if(entries.length === 0) return null;
    entries.sort(function(a, b){ return a.path.join('.').localeCompare(b.path.join('.')); });
    return entries;
  }

  function extractDeletedArrayEntries(root){
    // Handles: { deleted: [ {...}, ... ] } by rendering each item as before -> null.
    let obj = root;
    if(typeof obj === 'string') obj = tryParseJson(obj);
    if(!obj) return null;
    if(isPlainObject(obj) && isPlainObject(obj.diff)) obj = obj.diff;
    if(!isPlainObject(obj)) return null;

    const arr = obj.deleted;
    if(!Array.isArray(arr) || arr.length === 0) return null;

    const entries = [];
    for(let i = 0; i < arr.length; i++){
      const item = arr[i];
      if(!isPlainObject(item)) continue;
      const prefix = String(item.ip_address || item.file_name || item.id || (i + 1));
      for(const k of Object.keys(item).sort()){
        entries.push({ path: [prefix, k], beforeVal: item[k], afterVal: null });
      }
    }

    if(entries.length === 0) return null;
    return entries;
  }

  function valuesEqual(a, b){
    if(a === b) return true;
    const aObj = (a && typeof a === 'object');
    const bObj = (b && typeof b === 'object');
    if(aObj !== bObj) return false;
    if(!aObj || !bObj) return false;
    if(Array.isArray(a) || Array.isArray(b)){
      if(!Array.isArray(a) || !Array.isArray(b)) return false;
      if(a.length !== b.length) return false;
      for(let i = 0; i < a.length; i++){
        if(!valuesEqual(a[i], b[i])) return false;
      }
      return true;
    }
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if(aKeys.length !== bKeys.length) return false;
    for(const k of aKeys){
      if(!(k in b)) return false;
      if(!valuesEqual(a[k], b[k])) return false;
    }
    return true;
  }

  function diffBeforeAfter(beforeObj, afterObj){
    const changes = [];

    function walk(path, beforeVal, afterVal){
      if(valuesEqual(beforeVal, afterVal)) return;

      const beforeIsObj = isPlainObject(beforeVal);
      const afterIsObj = isPlainObject(afterVal);
      if(beforeIsObj && afterIsObj){
        const keys = new Set([...Object.keys(beforeVal), ...Object.keys(afterVal)]);
        for(const k of keys){
          walk(path.concat([k]), beforeVal[k], afterVal[k]);
        }
        return;
      }

      // Arrays or primitives: treat as a single change at this path.
      changes.push({
        path,
        beforeVal,
        afterVal,
      });
    }

    walk([], beforeObj, afterObj);
    return changes;
  }

  function formatValue(v){
    if(v === undefined) return 'null';
    if(v === null) return 'null';
    try{ return JSON.stringify(v); }catch(_e){ return String(v); }
  }

  const FIELD_LABELS = {
    // IP policy (기본정보)
    status: '상태',
    ip_version: 'IP 버전',
    start_ip: '시작주소',
    end_ip: '종료주소',
    ip_range: 'IP 범위',
    ip_count: 'IP 개수',
    utilization_rate: '할당률',
    allocation_rate: '할당률',
    center_code: '위치',
    location: '위치',
    role: '역할',
    description: '비고',
    note: '비고',
    policy_name: '정책명',
    policy_code: '정책코드',
    created_at: '생성일시',
    updated_at: '수정일시',
    created_by: '생성자',
    updated_by: '수정자',
    // IP range (IP 범위)
    ip_address: '주소',
    address: '주소',
    dns: 'DNS',
    dns_name: 'DNS',
    dns_domain: 'DNS',
    system: '시스템',
    system_name: '시스템',
    port: '포트',
    rol: '역할',
    note: '비고',
    // File tab (구성/파일)
    entry_type: '구분',
    file_name: '파일명',
    title: '제목',
    kind: '분류',
    mime_type: 'MIME',
    is_primary: '대표 여부',
    sort_order: '정렬',
  };

  function toSnakeCase(s){
    const raw = String(s || '').trim();
    if(!raw) return '';
    // Convert camelCase/PascalCase to snake_case
    return raw
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[-\s]+/g, '_')
      .toLowerCase();
  }

  function looksLikeIp(s){
    const v = String(s || '').trim();
    if(v === '') return false;
    // Simple IPv4/IPv6 heuristics; good enough for labeling.
    if(/^\d{1,3}(?:\.\d{1,3}){3}$/.test(v)) return true;
    if(/^[0-9a-fA-F:]+$/.test(v) && v.includes(':')) return true;
    return false;
  }

  function labelForKey(key){
    const k = String(key || '').trim();
    if(!k) return '';
    if(Object.prototype.hasOwnProperty.call(FIELD_LABELS, k)) return FIELD_LABELS[k];
    const sn = toSnakeCase(k);
    if(sn && Object.prototype.hasOwnProperty.call(FIELD_LABELS, sn)) return FIELD_LABELS[sn];

    // Common aliases
    if(sn === 'startip' && Object.prototype.hasOwnProperty.call(FIELD_LABELS, 'start_ip')) return FIELD_LABELS.start_ip;
    if(sn === 'endip' && Object.prototype.hasOwnProperty.call(FIELD_LABELS, 'end_ip')) return FIELD_LABELS.end_ip;
    if(sn === 'ipversion' && Object.prototype.hasOwnProperty.call(FIELD_LABELS, 'ip_version')) return FIELD_LABELS.ip_version;
    if(sn === 'utilizationrate' && Object.prototype.hasOwnProperty.call(FIELD_LABELS, 'utilization_rate')) return FIELD_LABELS.utilization_rate;
    if(sn === 'allocationrate' && Object.prototype.hasOwnProperty.call(FIELD_LABELS, 'allocation_rate')) return FIELD_LABELS.allocation_rate;
    if(sn === 'dnsdomain' && Object.prototype.hasOwnProperty.call(FIELD_LABELS, 'dns_domain')) return FIELD_LABELS.dns_domain;
    if(sn === 'systemname' && Object.prototype.hasOwnProperty.call(FIELD_LABELS, 'system_name')) return FIELD_LABELS.system_name;
    return '';
  }

  function displayPath(tabKey, pathArr){
    const parts = Array.isArray(pathArr) ? pathArr.map(function(p){ return String(p); }) : [String(pathArr || '')];
    if(parts.length === 0) return '항목';

    // IP range changes often look like: [ip, field]
    if(parts.length >= 2 && looksLikeIp(parts[0])){
      const fieldLabel = labelForKey(parts[parts.length - 1]) || '항목';
      return `${parts[0]} / ${fieldLabel}`;
    }

    // Generic: use label mapping for last segment.
    const last = parts[parts.length - 1];
    const lbl = labelForKey(last);
    if(lbl) return lbl;

    // Do not leak raw column keys; fall back.
    return '항목';
  }

  function extractFileNames(value){
    if(value == null) return [];
    if(typeof value === 'string'){
      const t = value.trim();
      return t ? [t] : [];
    }
    if(Array.isArray(value)){
      const out = [];
      for(const item of value){
        if(isPlainObject(item)){
          const n = item.file_name || item.fileName || item.original_filename || item.name || item.title;
          if(n) out.push(String(n));
        }else if(typeof item === 'string'){
          const t = item.trim();
          if(t) out.push(t);
        }
      }
      return out;
    }
    if(isPlainObject(value)){
      const n = value.file_name || value.fileName || value.original_filename || value.name || value.title;
      return n ? [String(n)] : [];
    }
    return [];
  }

  function formatValueForContext(tabKey, fieldKey, v){
    const tk = String(tabKey || '').trim();
    const fk = String(fieldKey || '').trim();

    // 구성/파일: 보안상 메타데이터(경로/토큰 등) 대신 파일명만 노출
    if(tk === 'gov_ip_policy_file'){
      if(fk === 'file_name') return String(v ?? '');
      const names = extractFileNames(v);
      if(names.length > 0) return names.join(', ');
      // Anything else: suppress details
      return '';
    }

    return formatValue(v);
  }

  function filterEntriesForContext(tabKey, action, entries){
    const tk = String(tabKey || '').trim();
    if(!Array.isArray(entries) || entries.length === 0) return entries;

    if(tk === 'gov_ip_policy_file'){
      // Only show filename-related info to avoid exposing internal fields.
      const filtered = entries.filter(function(e){
        const p = Array.isArray(e.path) ? e.path : [];
        const last = p.length ? String(p[p.length - 1]) : '';
        return last === 'file_name';
      });

      // If file_name itself didn't change (e.g., title/description updated), still show a minimal filename line.
      if(filtered.length > 0) return filtered;
      const anyName = entries.map(function(e){
        return extractFileNames(e.afterVal).concat(extractFileNames(e.beforeVal));
      }).flat().filter(Boolean);
      const name = anyName.length ? anyName[0] : '';
      return [{ path: ['file_name'], beforeVal: null, afterVal: name }];
    }

    return entries;
  }

  function renderDiffHtml(obj, ctx){
    const tabKey = ctx && ctx.tabKey ? ctx.tabKey : '';
    const action = ctx && ctx.action ? ctx.action : '';
    // 0) IP-range shape: { changed: [ {ip_address,before,after}, ... ] }
    const changedArrayEntries = extractChangedArrayEntries(obj);
    if(changedArrayEntries){
      const entries = filterEntriesForContext(tabKey, action, changedArrayEntries);
      return entries.map(function(c){
        const key = escapeHtml(displayPath(tabKey, c.path));
        const fieldKey = Array.isArray(c.path) && c.path.length ? String(c.path[c.path.length - 1]) : '';
        const beforeText = escapeHtml(formatValueForContext(tabKey, fieldKey, c.beforeVal));
        const afterText = escapeHtml(formatValueForContext(tabKey, fieldKey, c.afterVal));
        return `${key}: <span class="diff-before">${beforeText}</span> <span class="diff-arrow">→</span> <span class="diff-after">${afterText}</span>`;
      }).join('\n');
    }

    // 0.5) Deleted-list shape: { deleted: [ {...}, ... ] }
    const deletedArrayEntries = extractDeletedArrayEntries(obj);
    if(deletedArrayEntries){
      const entries = filterEntriesForContext(tabKey, action, deletedArrayEntries);
      return entries.map(function(c){
        const key = escapeHtml(displayPath(tabKey, c.path));
        const fieldKey = Array.isArray(c.path) && c.path.length ? String(c.path[c.path.length - 1]) : '';
        const beforeText = escapeHtml(formatValueForContext(tabKey, fieldKey, c.beforeVal));
        const afterText = escapeHtml(formatValueForContext(tabKey, fieldKey, c.afterVal));
        return `${key}: <span class="diff-before">${beforeText}</span> <span class="diff-arrow">→</span> <span class="diff-after">${afterText}</span>`;
      }).join('\n');
    }

    // 1) Preferred backend shape: { changes: { field: {before,after} } }
    const changeEntries = extractChangesEntries(obj);
    if(changeEntries){
      const entries = filterEntriesForContext(tabKey, action, changeEntries);
      return entries.map(function(c){
        const key = escapeHtml(displayPath(tabKey, c.path));
        const fieldKey = Array.isArray(c.path) && c.path.length ? String(c.path[c.path.length - 1]) : '';
        const beforeText = escapeHtml(formatValueForContext(tabKey, fieldKey, c.beforeVal));
        const afterText = escapeHtml(formatValueForContext(tabKey, fieldKey, c.afterVal));
        return `${key}: <span class="diff-before">${beforeText}</span> <span class="diff-arrow">→</span> <span class="diff-after">${afterText}</span>`;
      }).join('\n');
    }

    // 2) Full object before/after
    const extracted = extractBeforeAfter(obj);
    if(extracted){
      const beforeObj = extracted.beforeObj;
      const afterObj = extracted.afterObj;
      const changes = diffBeforeAfter(beforeObj, afterObj)
        .filter(function(c){
          // Only show leaf-level changes (path length >= 1) to avoid dumping whole objects.
          return Array.isArray(c.path) && c.path.length > 0;
        });

      if(changes.length === 0){
        try{ return escapeHtml(JSON.stringify({ before: beforeObj, after: afterObj }, null, 2)); }
        catch(_e){ return escapeHtml(String(obj)); }
      }

      // Stable ordering: alphabetical by path.
      changes.sort(function(a, b){
        const pa = a.path.join('.');
        const pb = b.path.join('.');
        return pa.localeCompare(pb);
      });

      return changes.map(function(c){
        const key = escapeHtml(displayPath(tabKey, c.path));
        const fieldKey = Array.isArray(c.path) && c.path.length ? String(c.path[c.path.length - 1]) : '';
        const beforeText = escapeHtml(formatValueForContext(tabKey, fieldKey, c.beforeVal));
        const afterText = escapeHtml(formatValueForContext(tabKey, fieldKey, c.afterVal));
        return `${key}: <span class="diff-before">${beforeText}</span> <span class="diff-arrow">→</span> <span class="diff-after">${afterText}</span>`;
      }).join('\n');
    }

    // 3) CREATE-like: after only
    const afterOnly = extractAfterOnly(obj);
    if(afterOnly){
      const entries = Object.keys(afterOnly).sort().map(function(k){
        return { path: [k], beforeVal: null, afterVal: afterOnly[k] };
      });
      const filtered = filterEntriesForContext(tabKey, action, entries);
      return filtered.map(function(c){
        const key = escapeHtml(displayPath(tabKey, c.path));
        const fieldKey = Array.isArray(c.path) && c.path.length ? String(c.path[c.path.length - 1]) : '';
        const beforeText = escapeHtml(formatValueForContext(tabKey, fieldKey, c.beforeVal));
        const afterText = escapeHtml(formatValueForContext(tabKey, fieldKey, c.afterVal));
        return `${key}: <span class="diff-before">${beforeText}</span> <span class="diff-arrow">→</span> <span class="diff-after">${afterText}</span>`;
      }).join('\n');
    }

    // 4) DELETE-like: before only
    const beforeOnly = extractBeforeOnly(obj);
    if(beforeOnly){
      const entries = Object.keys(beforeOnly).sort().map(function(k){
        return { path: [k], beforeVal: beforeOnly[k], afterVal: null };
      });
      const filtered = filterEntriesForContext(tabKey, action, entries);
      return filtered.map(function(c){
        const key = escapeHtml(displayPath(tabKey, c.path));
        const fieldKey = Array.isArray(c.path) && c.path.length ? String(c.path[c.path.length - 1]) : '';
        const beforeText = escapeHtml(formatValueForContext(tabKey, fieldKey, c.beforeVal));
        const afterText = escapeHtml(formatValueForContext(tabKey, fieldKey, c.afterVal));
        return `${key}: <span class="diff-before">${beforeText}</span> <span class="diff-arrow">→</span> <span class="diff-after">${afterText}</span>`;
      }).join('\n');
    }

    return null;
  }

  function renderDetailHtml(raw, ctx){
    // Prefer passing structured diff objects (no JSON.parse needed).
    if(raw && typeof raw === 'object'){
      const diffHtml = renderDiffHtml(raw, ctx);
      if(diffHtml != null) return diffHtml;
      try{ return escapeHtml(JSON.stringify(raw, null, 2)); }
      catch(_e){ return escapeHtml(String(raw)); }
    }

    const text = String(raw ?? '');
    if(text.trim() === '') return '';

    // Prefer structured JSON diff rendering when we have { before: ..., after: ... }
    const parsed = tryParseJson(text);
    if(parsed){
      const diffHtml = renderDiffHtml(parsed, ctx);
      if(diffHtml != null) return diffHtml;
    }

    // Line-based highlighting that works for:
    // - JSON pretty printed diffs (keys like after/new/to)
    // - unified diff-style (+ added/changed)
    // - simple arrow notation (before -> after)
    const highlightKeyLine = /^\s*"?(after|new|to|after_value|value_after|new_value)"?\s*:/i;

    return text.split('\n').map(function(line){
      const trimmed = line.trimStart();

      // Arrow notation: highlight RHS only.
      const arrowMatch = line.match(/^(.*?)(\s*(?:->|=>|→)\s*)(.*)$/);
      if(arrowMatch){
        const left = escapeHtml(arrowMatch[1]);
        const sep = escapeHtml(arrowMatch[2]);
        const right = escapeHtml(arrowMatch[3]);
        return `${left}${sep}<span class="diff-changed">${right}</span>`;
      }

      // Unified diff: highlight + lines (but not file markers like +++).
      if(trimmed.startsWith('+') && !trimmed.startsWith('+++')){
        return `<span class="diff-changed">${escapeHtml(line)}</span>`;
      }

      // JSON-style: highlight value part for known "after" keys.
      if(highlightKeyLine.test(trimmed)){
        const idx = line.indexOf(':');
        if(idx >= 0){
          const head = escapeHtml(line.slice(0, idx + 1));
          const rawTail = String(line.slice(idx + 1));
          // Avoid highlighting structural braces like `{` for "after": {
          if(rawTail.trim().startsWith('{') || rawTail.trim().startsWith('[')){
            return `${head}${escapeHtml(rawTail)}`;
          }
          const tail = escapeHtml(rawTail);
          return `${head}<span class="diff-changed">${tail}</span>`;
        }
        return `<span class="diff-changed">${escapeHtml(line)}</span>`;
      }

      return escapeHtml(line);
    }).join('\n');
  }

  function setDetailContent(el, raw, ctx){
    if(!el) return;
    const html = renderDetailHtml(raw, ctx);
    // If a textarea/input sneaks back in later, keep compatibility.
    if('value' in el){
      el.value = String(raw ?? '');
      return;
    }
    el.innerHTML = html;
  }

  function tabLabel(tabKey){
    const k = String(tabKey || '').trim();
    if(k === 'gov_ip_policy_detail') return '기본정보';
    if(k === 'gov_ip_policy_ip_range') return 'IP 범위';
    if(k === 'gov_ip_policy_file') return '구성/파일';
    if(k === 'gov_ip_policy_log') return '변경이력';
    return k || '-';
  }

  ready(async function(){
    const idRaw = qs('id') || qs('policy_id') || qs('policyId') || govDetailId();
    const policyId = idRaw ? parseInt(idRaw, 10) : NaN;

    const emptyEl = document.getElementById('lg-empty');
    const table = document.getElementById('lg-spec-table');
    const tbody = table ? table.querySelector('tbody') : null;
    const pageSizeSel = document.getElementById('lg-page-size');
    const addBtn = document.getElementById('lg-row-add');

    const paginationInfo = document.getElementById('lg-pagination-info');
    const pageNumbers = document.getElementById('lg-page-numbers');
    const btnFirst = document.getElementById('lg-first');
    const btnPrev = document.getElementById('lg-prev');
    const btnNext = document.getElementById('lg-next');
    const btnLast = document.getElementById('lg-last');

    const detailModalClose = document.getElementById('lg-detail-close');
    const detailText = document.getElementById('lg-detail-text');
    const detailReason = document.getElementById('lg-detail-reason');
    const detailReasonSave = document.getElementById('lg-detail-reason-save');
    const detailSave = document.getElementById('lg-detail-save');

    let activeLogId = null;
    const detailByLogId = new Map();

    if(addBtn){
      addBtn.disabled = true;
      addBtn.style.opacity = '0.5';
      addBtn.title = '변경이력은 자동으로 기록됩니다.';
      addBtn.setAttribute('aria-label', '변경이력은 자동으로 기록됩니다.');
    }

    if(detailModalClose){
      detailModalClose.addEventListener('click', function(){ closeModal('lg-detail-modal'); });
    }
    if(detailSave){
      detailSave.addEventListener('click', function(){ closeModal('lg-detail-modal'); });
    }

    async function saveReason(){
      if(!Number.isFinite(policyId)) return;
      const logId = Number(activeLogId);
      if(!Number.isFinite(logId)) return;
      const reason = detailReason ? String(detailReason.value || '') : '';
      const res = await apiRequest(`/api/network/ip-policies/${encodeURIComponent(policyId)}/logs/${encodeURIComponent(logId)}/reason`, {
        method: 'PUT',
        body: JSON.stringify({ reason }),
      });
      const item = res && (res.item || res);
      const reasonSaved = item && typeof item.reason === 'string' ? item.reason : reason;
      // Reflect in table row so reopening shows the saved value.
      try{
        const row = tbody ? tbody.querySelector(`tr[data-log-id="${String(logId)}"]`) : null;
        if(row) row.dataset.reason = reasonSaved || '';
      }catch(_e){ }
      return reasonSaved;
    }

    if(detailReasonSave){
      detailReasonSave.addEventListener('click', function(e){
        e.preventDefault();
        saveReason().catch(function(err){
          console.error(err);
          try{ alert(err && err.message ? err.message : '변경 사유 저장 중 오류가 발생했습니다.'); }catch(_e){}
        });
      });
    }
    if(detailReason){
      detailReason.addEventListener('keydown', function(e){
        if(e.key === 'Enter'){
          e.preventDefault();
          saveReason().catch(function(err){
            console.error(err);
            try{ alert(err && err.message ? err.message : '변경 사유 저장 중 오류가 발생했습니다.'); }catch(_e){}
          });
        }
      });
    }

    let pageSize = 10;
    let currentPage = 1;
    let totalItems = 0;
    if(pageSizeSel){
      pageSize = parseInt(pageSizeSel.value, 10) || 10;
      pageSizeSel.addEventListener('change', function(){
        pageSize = parseInt(pageSizeSel.value, 10) || 10;
        currentPage = 1;
        refreshLogs().catch(function(){});
      });
    }

    function totalPages(){
      return Math.max(1, Math.ceil((totalItems || 0) / (pageSize || 1)));
    }

    function setDisabled(el, disabled){
      if(!el) return;
      el.disabled = !!disabled;
      if(disabled) el.setAttribute('aria-disabled', 'true');
      else el.removeAttribute('aria-disabled');
    }

    function renderPageButtons(){
      if(!pageNumbers) return;
      pageNumbers.innerHTML = '';

      const tp = totalPages();
      const max = 7;
      let start = Math.max(1, currentPage - Math.floor(max / 2));
      let end = start + max - 1;
      if(end > tp){
        end = tp;
        start = Math.max(1, end - max + 1);
      }

      for(let p = start; p <= end; p++){
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'page-btn' + (p === currentPage ? ' active' : '');
        b.textContent = String(p);
        b.addEventListener('click', function(){
          if(p === currentPage) return;
          currentPage = p;
          refreshLogs().catch(function(){});
        });
        pageNumbers.appendChild(b);
      }
    }

    function updatePaginationUI(itemsOnPage){
      const tp = totalPages();
      if(currentPage > tp) currentPage = tp;

      setDisabled(btnFirst, currentPage <= 1 || totalItems <= 0);
      setDisabled(btnPrev, currentPage <= 1 || totalItems <= 0);
      setDisabled(btnNext, currentPage >= tp || totalItems <= 0);
      setDisabled(btnLast, currentPage >= tp || totalItems <= 0);

      if(paginationInfo){
        const start = totalItems ? ((currentPage - 1) * pageSize + 1) : 0;
        const end = totalItems ? Math.min((currentPage - 1) * pageSize + (itemsOnPage || 0), totalItems) : 0;
        paginationInfo.textContent = `${start}-${end} / ${totalItems}개 항목`;
      }

      renderPageButtons();
    }

    if(btnFirst){
      btnFirst.addEventListener('click', function(){
        if(currentPage <= 1) return;
        currentPage = 1;
        refreshLogs().catch(function(){});
      });
    }
    if(btnPrev){
      btnPrev.addEventListener('click', function(){
        if(currentPage <= 1) return;
        currentPage = Math.max(1, currentPage - 1);
        refreshLogs().catch(function(){});
      });
    }
    if(btnNext){
      btnNext.addEventListener('click', function(){
        const tp = totalPages();
        if(currentPage >= tp) return;
        currentPage = Math.min(tp, currentPage + 1);
        refreshLogs().catch(function(){});
      });
    }
    if(btnLast){
      btnLast.addEventListener('click', function(){
        const tp = totalPages();
        if(currentPage >= tp) return;
        currentPage = tp;
        refreshLogs().catch(function(){});
      });
    }

    async function refreshHeader(){
      if(!Number.isFinite(policyId)){
        setText('page-header-title', 'IP POLICY');
        setText('page-header-subtitle', '대상 ID가 없습니다. 목록에서 항목을 선택하세요.');
        return;
      }
      try{
        const data = await apiRequest(`/api/network/ip-policies/${encodeURIComponent(policyId)}`, { method: 'GET' });
        const record = data && data.item ? data.item : data;
        const title = (record && record.start_ip)
          ? `${record.start_ip} ~ ${record.end_ip || ''}`.trim()
          : 'IP POLICY';
        const subtitle = (record && (record.location || record.center_code))
          ? (record.location || record.center_code)
          : (record && record.role ? record.role : '-');
        setText('page-header-title', title);
        setText('page-header-subtitle', subtitle);
      }catch(err){
        setText('page-header-title', 'IP POLICY');
        setText('page-header-subtitle', err && err.message ? err.message : 'IP 조회 실패');
      }
    }

    function render(items){
      if(!tbody) return;
      tbody.innerHTML = '';
      detailByLogId.clear();

      if(!items || items.length === 0){
        if(emptyEl) emptyEl.style.display = '';
        return;
      }
      if(emptyEl) emptyEl.style.display = 'none';

      for(const it of items){
        const diffText = it.diff ? JSON.stringify(it.diff, null, 2) : '';
        const msg = it.message || '-';
        const tr = document.createElement('tr');
        tr.dataset.logId = String(it.log_id);
        tr.dataset.reason = String(it.reason || '');
        tr.dataset.tabKey = String(it.tab_key || '');
        tr.dataset.action = String(it.action || '');
        tr.innerHTML = `
          <td><input type="checkbox" class="lg-row" data-id="${escapeHtml(it.log_id)}" aria-label="선택"></td>
          <td>${escapeHtml(it.created_at || '-')}</td>
          <td>${escapeHtml(it.action || '-')}</td>
          <td>${escapeHtml(it.actor || '-')}</td>
          <td>${escapeHtml(tabLabel(it.tab_key))}</td>
          <td>${escapeHtml(msg)}</td>
          <td class="system-actions">
            <button type="button" class="action-btn" data-action="edit" data-id="${escapeHtml(it.log_id)}" title="보기" aria-label="보기">
              <img src="/static/image/svg/free-icon-assessment.svg" alt="보기" class="action-icon">
            </button>
          </td>
        `;
        // Keep the raw diff object in-memory to avoid any dataset normalization/truncation.
        detailByLogId.set(String(it.log_id), it && it.diff ? it.diff : (diffText || msg));
        tr.dataset.detail = diffText || msg;
        tbody.appendChild(tr);
      }
    }

    async function refreshLogs(){
      if(!Number.isFinite(policyId)){
        render([]);
        totalItems = 0;
        currentPage = 1;
        updatePaginationUI(0);
        return;
      }
      const data = await apiRequest(`/api/network/ip-policies/${encodeURIComponent(policyId)}/logs?page=${encodeURIComponent(currentPage)}&page_size=${encodeURIComponent(pageSize)}`, { method: 'GET' });
      const items = Array.isArray(data.items) ? data.items : [];
      totalItems = (data && Number.isFinite(parseInt(data.total, 10))) ? parseInt(data.total, 10) : 0;
      const serverPage = (data && Number.isFinite(parseInt(data.page, 10))) ? parseInt(data.page, 10) : currentPage;
      const tp = Math.max(1, Math.ceil((totalItems || 0) / (pageSize || 1)));
      currentPage = Math.min(Math.max(1, serverPage), tp);
      render(items);
      updatePaginationUI(items.length);
    }

    if(tbody){
      tbody.addEventListener('click', function(e){
        const btn = e.target && e.target.closest ? e.target.closest('button[data-action="edit"]') : null;
        if(!btn) return;
        const row = btn.closest('tr');
        activeLogId = btn.getAttribute('data-id') || (row ? row.dataset.logId : null);
        const logId = activeLogId != null ? String(activeLogId) : '';
        const detail = detailByLogId.has(logId)
          ? detailByLogId.get(logId)
          : (row ? (row.dataset.detail || '') : '');
        const ctx = {
          tabKey: row ? (row.dataset.tabKey || '') : '',
          action: row ? (row.dataset.action || '') : '',
        };
        setDetailContent(detailText, detail, ctx);
        if(detailReason) detailReason.value = row ? (row.dataset.reason || '') : '';
        openModal('lg-detail-modal');
      });
    }

    await refreshHeader();
    await refreshLogs();
  });
})();

/*
 * tab53-vpn-policy.js
 * VPN 상세설정 (IPSEC SA / ISAKMP SA / CID / IP) — DB-backed inline editing.
 *
 * 사용처:  tab53-vpn-policy.html  (VPN1 ~ VPN5 공용)
 * API:    GET/PUT  /api/network/vpn-lines/<line_id>/policy
 *
 * data-field="<base>:<side>"  형태의 <td> 셀을 인식하여
 *  - 조회 시 API 값을 렌더링
 *  - 편집 모드에서 <input> 으로 전환
 *  - 저장 시 PUT 으로 전송
 */
(function () {
  'use strict';

  // ---------- guard: only run on vpn-policy tab ----------
  var table = document.getElementById('vp-policy-table');
  if (!table) return;
  var ctx = (table.getAttribute('data-context') || '').toLowerCase();
  if (ctx !== 'vpn-policy') return;

  // 26 base field keys (must match DB column prefixes & HTML data-field keys)
  var FIELDS = [
    'model', 'fw',
    'ipsec_life', 'mode', 'method', 'pfs', 'retrans', 'cipher_proto', 'cipher_algo', 'auth_algo',
    'isakmp_life', 'isakmp_mode', 'ike_auth', 'ike_time', 'psk', 'dpd',
    'isakmp_cipher', 'hash_algo', 'dh_group', 'local_id_type', 'local_id_active', 'local_id_standby',
    'cid_active', 'cid_standby',
    'peer_ip',
    'note'
  ];
  var SIDES = ['self', 'org'];

  // ---------- searchable dropdown option maps ----------
  var DROPDOWN_OPTIONS = {
    mode: ['Tunnel Mode', 'Transport Mode'],
    method: ['IPSec', 'SSL/TLS'],
    ike_auth: [
      'PSK (Pre-Shared Key)',
      'RSA Signature',
      'Digital Certificate (X.509)',
      'EAP (EAP-TLS, EAP-TTLS, EAP-PEAP, EAP-MSCHAPv2)',
      'Hybrid Authentication'
    ],
    pfs: ['Enable', 'Disable'],
    retrans: ['ON', 'OFF'],
    cipher_proto: [
      'IPSec(IKEv1, IKEv2, AH, ESP)',
      'SSL/TLS(SSL-VPN, TLS-VPN)'
    ],
    cipher_algo: [
      'DES-56', '3DES-168',
      'AES-128', 'AES-192', 'AES-256',
      'AES-CBC-128', 'AES-CBC-192', 'AES-CBC-256',
      'AES-GCM-128', 'AES-GCM-192', 'AES-GCM-256',
      'AES-CTR-128', 'AES-CTR-192', 'AES-CTR-256',
      'Camellia-128', 'Camellia-192', 'Camellia-256',
      'ChaCha20-Poly1305'
    ],
    auth_algo: [
      'HMAC-MD5-96', 'HMAC-SHA1-96',
      'HMAC-SHA2-224-128', 'HMAC-SHA2-256-128', 'HMAC-SHA2-384-192', 'HMAC-SHA2-512-256',
      'AES-XCBC-96', 'AES-CMAC-96'
    ],
    hash_algo: [
      'SHA-224', 'SHA-256', 'SHA-384', 'SHA-512',
      'SHA3-224', 'SHA3-256', 'SHA3-384', 'SHA3-512'
    ],
    dh_group: [
      'Group 2 (MODP 1024)', 'Group 5 (MODP 1536)',
      'Group 14 (MODP 2048)', 'Group 15 (MODP 3072)',
      'Group 16 (MODP 4096)', 'Group 17 (MODP 6144)', 'Group 18 (MODP 8192)',
      'Group 19 (ECP 256)', 'Group 20 (ECP 384)', 'Group 21 (ECP 521)',
      'Group 24 (BrainpoolP512r1)', 'Group 25 (Curve25519)'
    ],
    local_id_type: [
      'IP Address', 'FQDN', 'User FQDN', 'ASN.1 DN', 'Key ID', 'DER ASN.1 DN'
    ]
  };
  // ISAKMP SA 암호 알고리즘 shares cipher_algo options
  DROPDOWN_OPTIONS.isakmp_cipher = DROPDOWN_OPTIONS.cipher_algo;

  // ---------- resolve vpn_line_id ----------
  var lineId = (function () {
    try { var bid = (document.body.getAttribute('data-gov-detail-id') || '').trim(); if (bid) return parseInt(bid, 10) || null; } catch (_) { }
    try { var params = new URLSearchParams(location.search); var v = params.get('vpn_line_id'); if (v) return parseInt(v, 10) || null; } catch (_) { }
    try { var raw = sessionStorage.getItem('vpn_selected_row'); if (raw) { var p = JSON.parse(raw); if (p && p.vpn_line_id) return parseInt(p.vpn_line_id, 10) || null; } } catch (_) { }
    return null;
  })();

  var API_URL = lineId ? ('/api/network/vpn-lines/' + lineId + '/policy') : null;

  // ---------- helpers ----------
  function cell(field, side) {
    return table.querySelector('td[data-field="' + field + ':' + side + '"]');
  }

  function setText(field, side, val) {
    var td = cell(field, side);
    if (td) td.textContent = val || '-';
  }

  function resolveActorUserId() {
    try { var raw = sessionStorage.getItem('vpn_selected_row'); if (raw) { var p = JSON.parse(raw); if (p && p.actor_user_id) return parseInt(p.actor_user_id, 10) || null; } } catch (_) { }
    try { return parseInt(document.body.getAttribute('data-actor-user-id'), 10) || null; } catch (_) { }
    return null;
  }

  // ---------- load data from API ----------
  function loadData() {
    if (!API_URL) return;
    fetch(API_URL, { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.success) return;
        var item = data.item || {};
        FIELDS.forEach(function (f) {
          SIDES.forEach(function (s) {
            setText(f, s, item[f + '_' + s] || '');
          });
        });
      })
      .catch(function () { /* silent */ });
  }

  // ---------- editing state ----------
  var editing = false;
  var editBtn = document.getElementById('vp-edit-btn');

  /** Build a searchable <select> for a dropdown field */
  function buildSearchSelect(field, currentValue) {
    var options = DROPDOWN_OPTIONS[field];
    if (!options) return null;
    var sel = document.createElement('select');
    sel.className = 'search-select';
    sel.setAttribute('data-searchable-scope', 'page');
    sel.setAttribute('data-placeholder', '선택');
    // empty placeholder option
    var ph = document.createElement('option');
    ph.value = '';
    ph.textContent = '선택';
    sel.appendChild(ph);
    options.forEach(function (label) {
      var opt = document.createElement('option');
      opt.value = label;
      opt.textContent = label;
      if (label === currentValue) opt.selected = true;
      sel.appendChild(opt);
    });
    if (currentValue) sel.value = currentValue;
    return sel;
  }

  function enterEditMode() {
    editing = true;
    FIELDS.forEach(function (f) {
      SIDES.forEach(function (s) {
        var td = cell(f, s);
        if (!td) return;
        var curVal = (td.textContent || '').trim();
        if (curVal === '-') curVal = '';
        td.textContent = '';

        if (DROPDOWN_OPTIONS[f]) {
          // searchable select
          var sel = buildSearchSelect(f, curVal);
          sel.setAttribute('data-field-input', f + ':' + s);
          td.appendChild(sel);
        } else {
          // plain text input
          var input = document.createElement('input');
          input.type = 'text';
          input.className = 'hw-inline-input';
          input.value = curVal;
          input.setAttribute('data-field-input', f + ':' + s);
          td.appendChild(input);
        }
      });
    });
    // enhance all searchable selects in the table
    if (window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function') {
      window.BlossomSearchableSelect.enhance(table);
    }
    // switch button to save icon
    if (editBtn) {
      editBtn.title = '저장';
      editBtn.setAttribute('aria-label', '저장');
      editBtn.innerHTML = '<img src="/static/image/svg/save.svg" alt="저장">';
    }
  }

  function exitEditMode(item) {
    editing = false;
    // close any open search panels before clearing DOM
    if (window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.close === 'function') {
      window.BlossomSearchableSelect.close();
    }
    FIELDS.forEach(function (f) {
      SIDES.forEach(function (s) {
        var td = cell(f, s);
        if (!td) return;
        var val = item ? (item[f + '_' + s] || '') : '';
        td.innerHTML = '';
        td.textContent = val || '-';
      });
    });
    // switch button back to pencil
    if (editBtn) {
      editBtn.title = '편집';
      editBtn.setAttribute('aria-label', '편집');
      editBtn.innerHTML = '<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집">';
    }
  }

  function collectPayload() {
    var payload = {};
    FIELDS.forEach(function (f) {
      SIDES.forEach(function (s) {
        var td = cell(f, s);
        if (!td) return;
        var input = td.querySelector('input') || td.querySelector('select');
        payload[f + '_' + s] = input ? input.value.trim() : (td.textContent || '').trim();
      });
    });
    return payload;
  }

  function saveData() {
    if (!API_URL) { alert('VPN 회선 정보가 없습니다.'); return; }
    var payload = collectPayload();
    var actor = resolveActorUserId();
    if (actor) payload.actor_user_id = actor;

    fetch(API_URL, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.success) {
          exitEditMode(data.item);
        } else {
          alert(data.message || '저장에 실패했습니다.');
        }
      })
      .catch(function () { alert('서버 통신 중 오류가 발생했습니다.'); });
  }

  // ---------- edit button handler ----------
  if (editBtn) {
    editBtn.addEventListener('click', function () {
      if (!editing) {
        enterEditMode();
      } else {
        saveData();
      }
    });
  }

  // ---------- CSV download ----------
  var dlBtn = document.getElementById('vp-download-btn');
  if (dlBtn) {
    dlBtn.addEventListener('click', function () {
      var tbody = table.querySelector('tbody');
      if (!tbody) return;
      var rows = Array.from(tbody.querySelectorAll('tr'));
      if (!rows.length) return;

      function esc(v) {
        var s = String(v == null ? '' : v);
        if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
        return s;
      }

      var header = ['구분', '항목', '자사', '기관'];
      var group = '';
      var lines = [header.map(esc).join(',')];
      rows.forEach(function (tr) {
        var tds = Array.from(tr.querySelectorAll('td'));
        if (!tds.length) return;
        var offset = 0;
        if (tr.classList.contains('group-row')) {
          group = (tds[0].textContent || '').trim();
          offset = 1;
        }
        var label = (tds[offset] && tds[offset].textContent || '').trim();
        var selfVal = (tds[offset + 1] && tds[offset + 1].textContent || '').trim();
        var orgVal = (tds[offset + 2] && tds[offset + 2].textContent || '').trim();
        if (selfVal === '-') selfVal = '';
        if (orgVal === '-') orgVal = '';
        lines.push([group, label, selfVal, orgVal].map(esc).join(','));
      });

      var csv = '\uFEFF' + lines.join('\r\n');
      var d = new Date();
      var yyyy = d.getFullYear();
      var mm = String(d.getMonth() + 1).padStart(2, '0');
      var dd = String(d.getDate()).padStart(2, '0');
      var filename = 'vpn_policy_' + yyyy + mm + dd + '.csv';
      try {
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (_) {
        var a2 = document.createElement('a');
        a2.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
        a2.download = filename;
        document.body.appendChild(a2); a2.click(); document.body.removeChild(a2);
      }
    });
  }

  // ---------- init ----------
  loadData();
})();

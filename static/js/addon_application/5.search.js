(function () {
  var API_URL = '/api/search/unified';
  var QUERY_STORE_KEY = 'bls_unified_search_q';
  var DOMAIN_STORE_KEY = 'bls_unified_search_domains';

  var headerInput = document.getElementById('header-search-input');
  var headerForm = document.getElementById('header-search-form');
  var briefing = document.getElementById('search-briefing');
  var ragEvidence = document.getElementById('search-rag-evidence');
  var activeFilterBar = document.getElementById('search-active-filters');
  var summary = document.getElementById('search-summary');
  var results = document.getElementById('search-results');
  var empty = document.getElementById('search-empty');
  var emptySticker = document.getElementById('search-empty-sticker');
  var emptyTitle = document.getElementById('search-empty-title');
  var emptyDescription = document.getElementById('search-empty-description');
  var searchStickers = Array.isArray(window.BLOSSOM_SEARCH_STICKERS) ? window.BLOSSOM_SEARCH_STICKERS : [];
  var activeDomains = [];

  function ensureSearchCriticalStyles() {
    if (document.getElementById('search-critical-style')) {
      return;
    }
    var style = document.createElement('style');
    style.id = 'search-critical-style';
    style.textContent = '' +
      '.search-page .content-wrapper{width:calc(100% - 48px)!important;max-width:1240px!important;margin:0 auto;}' +
      '.search-page .search-results{width:100%;max-width:100%;}' +
      '.search-page .search-domain-group-head{display:flex;align-items:center;justify-content:space-between;gap:10px;}' +
      '.search-page .search-domain-group-title{margin:0;}' +
      '.search-page .search-domain-group-count{white-space:nowrap;}';
    document.head.appendChild(style);
  }

  if (!summary || !results || !empty) {
    return;
  }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setSummary(text) {
    summary.textContent = text;
  }

  function renderActiveFilters() {
    if (!activeFilterBar) {
      return;
    }

    if (!activeDomains.length) {
      activeFilterBar.hidden = true;
      activeFilterBar.innerHTML = '';
      return;
    }

    activeFilterBar.innerHTML = '' +
      '<div class="search-active-filters-card">' +
        '<div class="search-active-filters-label">현재 적용된 범위</div>' +
        '<div class="search-active-filters-chips">' +
          activeDomains.map(function (domain) {
            return '<button type="button" class="search-active-filter-chip" data-domain-value="' + esc(domain) + '">' + esc(domain) + '<span class="search-active-filter-chip-remove">닫기</span></button>';
          }).join('') +
        '</div>' +
        '<button type="button" class="search-active-filters-clear" id="search-active-filters-clear">전체 보기</button>' +
      '</div>';
    activeFilterBar.hidden = false;
  }

  function setBriefingHidden() {
    if (!briefing) {
      return;
    }
    briefing.hidden = true;
    briefing.innerHTML = '';
  }

  function setRagEvidenceHidden() {
    if (!ragEvidence) { return; }
    ragEvidence.hidden = true;
    ragEvidence.innerHTML = '';
  }

  function renderRagEvidence(items) {
    if (!ragEvidence) { return; }
    if (!items || !items.length) {
      setRagEvidenceHidden();
      return;
    }
    var html = '<div class="search-rag-evidence-card">';
    html += '<div class="search-rag-evidence-head">';
    html += '<span class="search-rag-evidence-label">관련 문서</span>';
    html += '<span class="search-rag-evidence-count">' + items.length + '건</span>';
    html += '</div>';
    html += '<ul class="search-rag-evidence-list">';
    for (var i = 0; i < items.length; i += 1) {
      var it = items[i] || {};
      var title = esc(it.title || '-');
      var domain = esc(it.domain || '');
      var snippet = esc(it.snippet || '');
      var route = esc(it.route_hint || '#');
      html += '<li class="search-rag-evidence-item">';
      if (domain) {
        html += '<span class="search-rag-evidence-domain">' + domain + '</span>';
      }
      html += '<a class="search-rag-evidence-title" href="' + route + '">' + title + '</a>';
      if (snippet) {
        html += '<p class="search-rag-evidence-snippet">' + snippet + '</p>';
      }
      html += '</li>';
    }
    html += '</ul>';
    html += '</div>';
    ragEvidence.innerHTML = html;
    ragEvidence.hidden = false;
  }

  function renderBriefing(data) {
    if (!briefing) {
      return;
    }

    if (!data || data.enabled === false) {
      setBriefingHidden();
      return;
    }

    var summaryLines = Array.isArray(data.summary_lines) ? data.summary_lines : [];
    var filters = Array.isArray(data.recommended_filters) ? data.recommended_filters : [];
    var titleText = esc(data.title || '검색 안내');
    var html = '';
    var i;

    html += '<div class="search-briefing-card' + (data.fallback_used ? ' is-fallback' : '') + '">';
    html += '<div class="search-briefing-head">';
    html += '<div class="search-briefing-title-wrap">';
    html += '<div class="search-briefing-eyebrow">검색 안내</div>';
    html += '<h2 class="search-briefing-title">' + titleText + '</h2>';
    html += '</div>';
    html += '</div>';

    if (summaryLines.length) {
      html += '<div class="search-briefing-summary">';
      for (i = 0; i < summaryLines.length; i += 1) {
        html += '<p class="search-briefing-summary-line">' + esc(summaryLines[i]) + '</p>';
      }
      html += '</div>';
    }

    if (filters.length) {
      html += '<div class="search-briefing-section">';
      html += '<div class="search-briefing-section-title">추천 필터</div>';
      html += '<div class="search-briefing-filters">';
      for (i = 0; i < filters.length; i += 1) {
        html += '<button type="button" class="search-briefing-filter' + (filters[i].type === 'domain_filter' && filters[i].value ? ' is-actionable' : '') + ((filters[i].type === 'domain_filter' && activeDomains.indexOf(filters[i].value) >= 0) ? ' is-selected' : '') + '" data-filter-type="' + esc(filters[i].type || '') + '" data-filter-value="' + esc(filters[i].value || '') + '" title="' + esc(filters[i].reason || '') + '">' + esc(filters[i].label || filters[i].value || '') + '</button>';
      }
      html += '</div>';
      html += '</div>';
    }

    // 참고 결과/내부 설명 문구는 화면 밀도를 높여 가독성을 떨어뜨려 기본 렌더에서 제외한다.

    html += '</div>';

    briefing.innerHTML = html;
    briefing.hidden = false;
  }

  function pickSticker(query) {
    if (!searchStickers.length) {
      return '';
    }

    var seed = String(query || '') + String(Date.now());
    var acc = 0;
    for (var i = 0; i < seed.length; i += 1) {
      acc += seed.charCodeAt(i);
    }
    return searchStickers[acc % searchStickers.length];
  }

  function renderEmpty(query) {
    results.innerHTML = '';
    setBriefingHidden();
    renderActiveFilters();
    empty.hidden = false;

    if (emptySticker) {
      var sticker = pickSticker(query);
      if (sticker) {
        emptySticker.src = sticker;
        emptySticker.hidden = false;
      } else {
        emptySticker.hidden = true;
      }
    }

    if (query) {
      if (emptyTitle) {
        emptyTitle.innerHTML = '<span class="search-empty-query">\'' + esc(query) + '\'</span>에 대한 검색 결과가 없습니다.';
      }
      if (emptyDescription) {
        emptyDescription.textContent = '시스템, 프로젝트, 부서, 블로그 제목처럼 더 일반적인 키워드로 다시 검색해 보세요.';
      }
    } else {
      if (emptyTitle) {
        emptyTitle.textContent = '검색어를 입력해 주세요.';
      }
      if (emptyDescription) {
        emptyDescription.textContent = '헤더 검색창에서 키워드를 입력하면 통합 검색 결과가 표시됩니다.';
      }
    }
  }

  function currentQuery() {
    if (headerInput) return (headerInput.value || '').trim();
    try {
      return (sessionStorage.getItem(QUERY_STORE_KEY) || '').trim();
    } catch (_ignore) {
      return '';
    }
  }

  function currentDomains() {
    return Array.isArray(activeDomains) ? activeDomains.slice() : [];
  }

  function setActiveDomains(domains) {
    activeDomains = Array.isArray(domains)
      ? domains.filter(function (value) { return !!String(value || '').trim(); })
      : [];
  }

  function toggleActiveDomain(domain) {
    var normalized = String(domain || '').trim();
    var nextDomains;
    if (!normalized) {
      return;
    }

    if (activeDomains.indexOf(normalized) >= 0) {
      nextDomains = activeDomains.filter(function (value) {
        return value !== normalized;
      });
    } else {
      nextDomains = activeDomains.concat([normalized]);
    }
    setActiveDomains(nextDomains);
  }

  function persistState(q) {
    try {
      if (q) sessionStorage.setItem(QUERY_STORE_KEY, q);
      else sessionStorage.removeItem(QUERY_STORE_KEY);
      if (activeDomains.length) sessionStorage.setItem(DOMAIN_STORE_KEY, activeDomains.join(','));
      else sessionStorage.removeItem(DOMAIN_STORE_KEY);
    } catch (_ignore) {}
  }

  function renderRows(rows, query) {
    if (!rows || !rows.length) {
      renderEmpty(query);
      return;
    }

    empty.hidden = true;
    var grouped = {};
    var domainOrder = [];
    var html = '';
    var i;

    for (i = 0; i < rows.length; i += 1) {
      var item = rows[i] || {};
      var itemDomain = String(item.domain || '기타');
      if (!grouped[itemDomain]) {
        grouped[itemDomain] = [];
        domainOrder.push(itemDomain);
      }
      grouped[itemDomain].push(item);
    }

    for (i = 0; i < domainOrder.length; i += 1) {
      var domainKey = domainOrder[i];
      var domainRows = grouped[domainKey] || [];

      html += '' +
        '<section class="search-domain-group">' +
          '<div class="search-domain-group-head">' +
            '<h3 class="search-domain-group-title">' + esc(domainKey) + '</h3>' +
            '<span class="search-domain-group-count">' + esc(domainRows.length) + '건</span>' +
          '</div>';

      for (var j = 0; j < domainRows.length; j += 1) {
        var row = domainRows[j] || {};
        var title = esc(row.title || row.key || '-');
        var subtitle = '';
        var route = esc(row.route || '#');
        var domain = esc(row.domain || '');
        var type = esc(row.type || '');
        var meta = '';
        if (domain && type) {
          meta = domain + ' > ' + type;
        } else {
          meta = domain || type;
        }

        html += '' +
          '<article class="search-item">' +
            '<div class="search-item-title"><a href="' + route + '" class="search-result-link" data-id="' + esc(row.id || '') + '" data-domain="' + domain + '" data-type="' + type + '">' + title + '</a></div>' +
            (subtitle ? ('<div class="search-item-subtitle">' + subtitle + '</div>') : '') +
            (meta ? ('<div class="search-item-meta">' + meta + '</div>') : '') +
          '</article>';
      }

      html += '</section>';
    }
    results.innerHTML = html;
  }

  function sanitizeAddressBar() {
    if (!window.location || !window.location.pathname) return;
    if (window.location.search) {
      history.replaceState({}, '', window.location.pathname);
    }
  }

  function search() {
    var q = currentQuery();
    persistState(q);

    if (!q) {
      results.innerHTML = '';
      setBriefingHidden();
      setRagEvidenceHidden();
      renderActiveFilters();
      renderEmpty('');
      setSummary('헤더 검색창에 키워드를 입력하면 결과가 표시됩니다.');
      return;
    }

    setSummary('검색 중...');
    setRagEvidenceHidden();

    var payload = {
      q: q,
      limit: 60
    };

    if (activeDomains.length) {
      payload.domains = currentDomains();
    }

    fetch(API_URL, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (!data || data.success !== true) {
          setBriefingHidden();
          renderRows([], q);
          setSummary('검색 중 오류가 발생했습니다.');
          return;
        }
        var rows = Array.isArray(data.rows) ? data.rows : [];
        var total = (data.total || rows.length || 0);
        renderActiveFilters();
        renderRows(rows, q);
        if (total > 0) {
          renderBriefing(data.briefing || null);
        } else {
          setBriefingHidden();
        }
        setSummary('총 ' + total + '건 검색되었습니다.' + (activeDomains.length ? ' [' + activeDomains.join(', ') + ']' : ''));
      })
      .catch(function () {
        setBriefingHidden();
        renderRows([], q);
        setSummary('검색 중 오류가 발생했습니다.');
      });
  }

  results.addEventListener('click', function (e) {
    var link = e.target.closest('.search-result-link');
    if (!link) return;
    var href = link.getAttribute('href') || '';
    if (!href) return;

    try {
      fetch('/api/search/unified/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          id: link.getAttribute('data-id') || '',
          domain: link.getAttribute('data-domain') || '',
          type: link.getAttribute('data-type') || '',
          route: href,
          query: currentQuery()
        })
      }).catch(function () {});
    } catch (_ignore) {}

    if (typeof window.blsSpaNavigate === 'function' && href.charAt(0) === '/') {
      e.preventDefault();
      window.blsSpaNavigate(href);
    }
  });

  if (briefing) {
    briefing.addEventListener('click', function (e) {
      var button = e.target.closest('.search-briefing-filter');
      if (!button) return;

      var filterType = button.getAttribute('data-filter-type') || '';
      var filterValue = (button.getAttribute('data-filter-value') || '').trim();
      if (filterType !== 'domain_filter' || !filterValue) {
        return;
      }

      toggleActiveDomain(filterValue);
      persistState(currentQuery());
      renderActiveFilters();
      search();
    });
  }

  if (activeFilterBar) {
    activeFilterBar.addEventListener('click', function (e) {
      var chipButton = e.target.closest('.search-active-filter-chip');
      var clearButton = e.target.closest('#search-active-filters-clear');
      if (chipButton) {
        toggleActiveDomain(chipButton.getAttribute('data-domain-value') || '');
        persistState(currentQuery());
        renderActiveFilters();
        search();
        return;
      }
      if (!clearButton) {
        return;
      }

      setActiveDomains([]);
      persistState(currentQuery());
      renderActiveFilters();
      search();
    });
  }

  (function initFromState() {
    ensureSearchCriticalStyles();
    sanitizeAddressBar();

    var params = new URLSearchParams(window.location.search || '');
    var q = '';

    try {
      q = (sessionStorage.getItem(QUERY_STORE_KEY) || '').trim();
    } catch (_ignoreA) {}
    try {
      setActiveDomains(((sessionStorage.getItem(DOMAIN_STORE_KEY) || '').trim() || '').split(',').filter(function (value) { return !!value; }));
    } catch (_ignoreB) {}
    if (!q) q = (params.get('q') || '').trim();
    if (!activeDomains.length) {
      setActiveDomains(((params.get('domains') || '').trim() || '').split(',').filter(function (value) { return !!value; }));
    }

    if (headerInput && q) headerInput.value = q;
    renderActiveFilters();

    if (headerForm) {
      headerForm.addEventListener('submit', function () {
        setTimeout(function () {
          search();
        }, 0);
      });
    }

    window.addEventListener('bls:search-submit', function () {
      search();
    });

    search();
  })();
})();

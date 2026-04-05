/*
  Shared searchable <select> enhancer
  - Matches the “2.hardware” searchable dropdown UX.
  - Enhances only <select class="search-select"> elements.
  - Safe to load globally; skips already-enhanced selects.
  - Clear button: shown only when the select supports clearing
    (has an empty option `option[value=""]`), or when explicitly allowed via
    `data-allow-clear="true"`.
*/

(function () {
  if (window.BlossomSearchableSelect) return;

  const searchableSelectMeta = new WeakMap();
  let activeSearchPanel = null;
  const asyncSourceState = new WeakMap();

  function resetAsyncLastQuery(select) {
    try {
      const st = asyncSourceState.get(select);
      if (st) st.lastQuery = null;
    } catch (_) {
      // ignore
    }
  }

  function getAsyncSourceKey(select) {
    if (!(select instanceof HTMLSelectElement)) return '';
    const src = (select.dataset && (select.dataset.searchSource || select.dataset.source)) || select.getAttribute('data-search-source') || '';
    return String(src || '').trim();
  }

  function getAsyncProvider(sourceKey) {
    try {
      const registry = window.BlossomSearchableSelectSources;
      if (!registry || typeof registry !== 'object') return null;
      const fn = registry[sourceKey];
      return typeof fn === 'function' ? fn : null;
    } catch (_) {
      return null;
    }
  }

  function setSelectOptions(select, placeholder, items) {
    if (!(select instanceof HTMLSelectElement)) return;

    const current = select.value || '';
    let currentLabel = '';
    try {
      const selectedOption = select.selectedOptions && select.selectedOptions[0];
      currentLabel = (selectedOption && selectedOption.textContent ? String(selectedOption.textContent) : '').trim();
    } catch (_) {
      currentLabel = '';
    }
    const allowClearAttr = select.getAttribute('data-allow-clear');
    const hasEmpty = !!select.querySelector('option[value=""]');
    const allowClear = allowClearAttr === 'true' || allowClearAttr === '1' || hasEmpty;

    const frag = document.createDocumentFragment();
    if (allowClear) {
      const opt0 = document.createElement('option');
      opt0.value = '';
      opt0.textContent = placeholder || '선택';
      frag.appendChild(opt0);
    }

    // Preserve current selection even if it's not present in the fetched result set.
    // This avoids losing values when the async source returns only a limited slice.
    if (current) {
      const existsInItems = (items || []).some((it) => {
        if (!it) return false;
        const value = (it.value == null ? '' : String(it.value));
        return value === current;
      });
      if (!existsInItems) {
        const optKeep = document.createElement('option');
        optKeep.value = current;
        optKeep.textContent = currentLabel || current;
        optKeep.selected = true;
        frag.appendChild(optKeep);
      }
    }

    (items || []).forEach((it) => {
      if (!it) return;
      const value = (it.value == null ? '' : String(it.value));
      const label = (it.label == null ? '' : String(it.label));
      if (!value && !label) return;
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label || value;

      // Optional metadata for downstream UI logic (e.g., auto-fill vendor).
      // Keep this intentionally narrow to avoid unexpected DOM bloat.
      try {
        const vendor = (it.vendor != null ? String(it.vendor) : '').trim();
        if (vendor) opt.setAttribute('data-vendor', vendor);
      } catch (_) {
        // ignore
      }
      try {
        const searchText = (it.searchText != null ? String(it.searchText) : (it.search_text != null ? String(it.search_text) : '')).trim();
        if (searchText) opt.setAttribute('data-search-text', searchText);
      } catch (_) {
        // ignore
      }

      // Allows separating the dropdown list label from the selected display label.
      // Example: list shows "이름 (부서)", selected shows "이름".
      try {
        const displayLabel = (it.displayLabel != null ? String(it.displayLabel) : (it.display_label != null ? String(it.display_label) : '')).trim();
        if (displayLabel) opt.setAttribute('data-display-label', displayLabel);
      } catch (_) {
        // ignore
      }
      frag.appendChild(opt);
    });

    select.innerHTML = '';
    select.appendChild(frag);

    // Try to preserve selection when still present.
    if (current && Array.from(select.options || []).some((o) => (o.value || '') === current)) {
      select.value = current;
    }
  }

  function scheduleAsyncOptionsFetch(state) {
    const sourceKey = getAsyncSourceKey(state.select);
    if (!sourceKey) return;

    const provider = getAsyncProvider(sourceKey);
    if (!provider) return;

    const q = (state.input && state.input.value) ? String(state.input.value).trim() : '';

    let st = asyncSourceState.get(state.select);
    if (!st) {
      // Use `null` so an initial open with empty query still triggers a fetch.
      st = { timer: null, lastQuery: null, inFlight: 0 };
      asyncSourceState.set(state.select, st);
    }

    if (st.lastQuery !== null && q === st.lastQuery) return;
    st.lastQuery = q;
    if (st.timer) {
      clearTimeout(st.timer);
      st.timer = null;
    }

    st.timer = setTimeout(async () => {
      const token = ++st.inFlight;
      try {
        const placeholder = state.placeholder || getSearchablePlaceholder(state.select);
        const result = await provider({ query: q, select: state.select, placeholder });
        if (token !== st.inFlight) return;
        let items = null;
        let emptyMessage = '';
        if (Array.isArray(result)) {
          items = result;
        } else if (result && typeof result === 'object') {
          if (Array.isArray(result.items)) items = result.items;
          emptyMessage = (result.emptyMessage || result.empty_message || '') ? String(result.emptyMessage || result.empty_message) : '';
        }
        if (!Array.isArray(items)) return;
        if (emptyMessage) {
          try { state.empty.textContent = emptyMessage; } catch (_) {}
        }
        setSelectOptions(state.select, placeholder, items);

        // Rebuild and re-render using the *updated* select options.
        state.options = buildSearchPanelOptions(state.select, placeholder);
        state.filtered = state.options.slice();
        filterSearchPanelOptions(state);
        positionSearchPanel(state);
      } catch (_) {
        // ignore
      }
    }, 220);
  }

  function isSearchableSelect(select) {
    if (!(select instanceof HTMLSelectElement)) return false;
    if (!select.classList.contains('search-select')) return false;
    const explicit = (select.dataset && Object.prototype.hasOwnProperty.call(select.dataset, 'searchable'))
      ? select.dataset.searchable
      : select.getAttribute('data-searchable');
    if (explicit === 'false') return false;
    return true;
  }

  function allowOutsideModal(select) {
    if (!(select instanceof HTMLSelectElement)) return false;
    const scope = (select.dataset && (select.dataset.searchableScope || select.dataset.searchScope)) || select.getAttribute('data-searchable-scope') || '';
    if (String(scope).toLowerCase() === 'page') return true;
    const explicit = (select.dataset && (select.dataset.enhanceOutsideModal || select.dataset.outsideModal)) || select.getAttribute('data-enhance-outside-modal') || '';
    return String(explicit).toLowerCase() === '1' || String(explicit).toLowerCase() === 'true';
  }

  function getSearchablePlaceholder(select) {
    return (
      select.getAttribute('data-placeholder') ||
      (select.dataset ? select.dataset.placeholder : '') ||
      '선택'
    );
  }

  function setupSearchableSelect(select) {
    if (!isSearchableSelect(select) || select.dataset.searchEnhanced === '1') return;

    // Defensive: if the select is already inside a wrapper, skip creation.
    try {
      if (select.parentNode && select.parentNode.classList &&
          select.parentNode.classList.contains('fk-searchable-control')) {
        select.dataset.searchEnhanced = '1';
        select.classList.add('fk-search-native-hidden');
        if (!searchableSelectMeta.has(select)) {
          const w = select.parentNode;
          const db = w.querySelector('.fk-searchable-display');
          const cb = w.querySelector('.fk-searchable-clear');
          if (db) searchableSelectMeta.set(select, { wrapper: w, displayBtn: db, clearBtn: cb });
        }
        return;
      }
    } catch (_) {}

    const wrapper = document.createElement('div');
    wrapper.className = 'fk-searchable-control';

    const displayBtn = document.createElement('button');
    displayBtn.type = 'button';
    displayBtn.className = 'fk-searchable-display';
    displayBtn.setAttribute('aria-haspopup', 'dialog');
    displayBtn.setAttribute('aria-expanded', 'false');
    displayBtn.dataset.placeholder = getSearchablePlaceholder(select);

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'fk-searchable-clear';
    clearBtn.setAttribute('aria-label', '선택 해제');
    clearBtn.title = '선택 해제';
    clearBtn.textContent = '\u00D7';
    clearBtn.hidden = true;

    clearBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeSearchDropdown(select);
      try {
        // Persist intent: user explicitly cleared this field.
        // Page scripts can use this to send explicit nulls on save.
        select.dataset.userCleared = '1';
      } catch (_) {}
      select.value = '';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      syncSearchableSelect(select);
    });

    displayBtn.addEventListener('click', (event) => {
      event.preventDefault();
      if (select.disabled) return;
      openSearchDropdown(select);
    });

    const parent = select.parentNode;
    if (parent) {
      parent.insertBefore(wrapper, select);
    }

    wrapper.appendChild(displayBtn);
    wrapper.appendChild(clearBtn);
    wrapper.appendChild(select);

    select.classList.add('fk-search-native-hidden');
    select.dataset.searchEnhanced = '1';
    select.addEventListener('change', () => syncSearchableSelect(select));

    searchableSelectMeta.set(select, { wrapper, displayBtn, clearBtn });
  }

  function syncSearchableSelect(select) {
    if (!isSearchableSelect(select)) return;

    let meta = searchableSelectMeta.get(select);
    if (!meta) {
      setupSearchableSelect(select);
      meta = searchableSelectMeta.get(select);
      if (!meta) return;
    }

    const placeholder = getSearchablePlaceholder(select);
    const selectedOption = select.selectedOptions && select.selectedOptions[0];
    const optionLabel = (selectedOption && selectedOption.textContent ? selectedOption.textContent : '').trim();
    const displayOverride = (
      selectedOption && (selectedOption.getAttribute('data-display-label') || (selectedOption.dataset ? selectedOption.dataset.displayLabel : ''))
        ? String(selectedOption.getAttribute('data-display-label') || (selectedOption.dataset ? selectedOption.dataset.displayLabel : '')).trim()
        : ''
    );
    const value = select.value || '';
    const label = (displayOverride || optionLabel || value || placeholder).trim();

    meta.displayBtn.textContent = label;
    meta.displayBtn.title = label;
    meta.displayBtn.dataset.placeholder = placeholder;

    const hasValue = !!value;
    meta.displayBtn.classList.toggle('has-value', hasValue);
    const hasEmptyOption = !!(select.querySelector && select.querySelector('option[value=""]'));
    const allowClearAttr = select.getAttribute('data-allow-clear');
    const disallowClear = allowClearAttr === 'false' || allowClearAttr === '0';
    const canClear = !disallowClear && (hasEmptyOption || allowClearAttr === 'true');
    meta.clearBtn.hidden = !(hasValue && canClear);

    const disabled = !!select.disabled;
    meta.wrapper.classList.toggle('is-disabled', disabled);
    meta.displayBtn.disabled = disabled;
    meta.clearBtn.disabled = disabled;

    // Required-field error state (when the containing form is showing required errors).
    // This keeps the searchable dropdown visually consistent with native :invalid styling.
    const form = (select.closest && select.closest('form')) ? select.closest('form') : null;
    const showErrors = !!(form && form.classList && form.classList.contains('show-required-errors'));
    const invalid = showErrors && !disabled && (typeof select.checkValidity === 'function') && !select.checkValidity();
    meta.wrapper.classList.toggle('is-invalid', !!invalid);
    try {
      meta.displayBtn.setAttribute('aria-invalid', invalid ? 'true' : 'false');
    } catch (_) {}

    if (disabled) closeSearchDropdown(select);
  }

  function buildSearchPanelOptions(select, placeholder) {
    const options = [];
    Array.from(select.options || []).forEach((opt) => {
      const rawLabel = (opt.textContent || '').trim();
      const value = opt.value || '';
      // Don't show the placeholder/empty option as a selectable row in the panel.
      // Clearing (when allowed) is handled via the "지움" button.
      if (!value) return;
      // Dropdown list always shows the full rawLabel (e.g. "이름 (부서)").
      // data-display-label is reserved for the *selected* button display only.
      const label = (rawLabel || value || placeholder).trim();
      const extraSearch = (
        opt.getAttribute('data-search-text') ||
        (opt.dataset ? opt.dataset.searchText : '') ||
        ''
      ).trim();
      const searchBlob = (rawLabel + ' ' + extraSearch).trim();
      options.push({
        value,
        label,
        searchLabel: searchBlob.toLowerCase(),
        valueLower: value.toLowerCase(),
      });
    });
    return options;
  }

  function positionSearchPanel(state) {
    const panel = state.panel;
    const margin = 6;

    // Inline mode: keep the dropdown panel anchored to the control inside a scrollable modal.
    // This avoids the "panel appears elsewhere" effect when the control is near the bottom
    // and the fixed panel chooses to flip above.
    if (state.inline) {
      const w = state.anchor;
      const preferredWidth = Math.max(260, w.offsetWidth || 0);
      panel.style.left = '0px';

      const placement = String(state.inlinePlacement || '').toLowerCase();
      if (placement === 'top') {
        panel.style.top = 'auto';
        panel.style.bottom = (Math.max(0, (w.offsetHeight || 0)) + margin) + 'px';
      } else {
        // default: bottom
        panel.style.bottom = 'auto';
        panel.style.top = (Math.max(0, (w.offsetHeight || 0)) + margin) + 'px';
      }

      panel.style.minWidth = preferredWidth + 'px';
      panel.style.maxWidth = preferredWidth + 'px';
      return;
    }

    const rect = state.anchor.getBoundingClientRect();
    const preferredLeft = Math.max(margin, Math.min(rect.left, window.innerWidth - margin));
    const preferredWidth = Math.max(260, rect.width);

    // Measure with width applied.
    panel.style.left = preferredLeft + 'px';
    panel.style.minWidth = preferredWidth + 'px';
    panel.style.maxWidth = Math.max(preferredWidth, 260) + 'px';

    const panelRect = panel.getBoundingClientRect();
    let top = rect.bottom + margin;

    // If overflowing bottom, try placing above.
    if (top + panelRect.height > window.innerHeight - margin) {
      const aboveTop = rect.top - margin - panelRect.height;
      if (aboveTop >= margin) {
        top = aboveTop;
      }
    }

    // Clamp horizontally.
    const maxLeft = window.innerWidth - margin - panelRect.width;
    const left = Math.max(margin, Math.min(preferredLeft, maxLeft));

    panel.style.top = Math.round(top) + 'px';
    panel.style.left = Math.round(left) + 'px';
  }

  function renderSearchPanelOptions(state) {
    state.list.innerHTML = '';
    state.itemButtons = [];

    const currentValue = state.select.value || '';

    if (!state.filtered.length) {
      state.empty.hidden = false;
      state.focusIndex = -1;
      return;
    }

    state.empty.hidden = true;

    state.filtered.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      // Keep both class names for backwards compatibility.
      // system.css / onpremise UX uses __item + (active/selected)
      // while some pages may rely on __option + (is-active/is-selected).
      btn.className = 'fk-search-panel__item fk-search-panel__option';
      btn.setAttribute('role', 'option');
      btn.dataset.index = String(idx);
      btn.dataset.value = opt.value;
      btn.textContent = opt.label;

      const selected = opt.value === currentValue;
      btn.setAttribute('aria-selected', selected ? 'true' : 'false');
      if (selected) btn.classList.add('selected', 'is-selected');

      btn.addEventListener('click', (event) => {
        event.preventDefault();
        selectSearchOption(state, idx);
      });

      state.list.appendChild(btn);
      state.itemButtons.push(btn);
    });
  }

  function setFocusIndex(state, nextIndex) {
    const max = state.filtered.length - 1;
    if (max < 0) {
      state.focusIndex = -1;
      return;
    }
    const clamped = Math.max(0, Math.min(nextIndex, max));
    state.focusIndex = clamped;
    state.itemButtons.forEach((btn, idx) => {
      const isActive = idx === clamped;
      btn.classList.toggle('active', isActive);
      btn.classList.toggle('is-active', isActive);
    });
    const activeBtn = state.itemButtons[clamped];
    if (activeBtn) {
      activeBtn.scrollIntoView({ block: 'nearest' });
    }
  }

  function filterSearchPanelOptions(state) {
    const q = (state.input.value || '').trim().toLowerCase();
    if (!q) {
      state.filtered = state.options.slice();
    } else {
      state.filtered = state.options.filter((opt) => opt.searchLabel.includes(q) || opt.valueLower.includes(q));
    }
    state.focusIndex = -1;
    renderSearchPanelOptions(state);
  }

  function handleSearchInputKeydown(event, state) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (state.filtered.length) {
        setFocusIndex(state, state.focusIndex < 0 ? 0 : state.focusIndex + 1);
      }
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (state.filtered.length) {
        setFocusIndex(state, state.focusIndex < 0 ? state.filtered.length - 1 : state.focusIndex - 1);
      }
      return;
    }
    if (event.key === 'Enter') {
      if (state.focusIndex >= 0 && state.focusIndex < state.filtered.length) {
        event.preventDefault();
        selectSearchOption(state, state.focusIndex);
      }
      return;
    }
  }

  function handleSearchListKeydown(event, state) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setFocusIndex(state, state.focusIndex < 0 ? 0 : state.focusIndex + 1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setFocusIndex(state, state.focusIndex < 0 ? state.filtered.length - 1 : state.focusIndex - 1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (state.focusIndex >= 0) selectSearchOption(state, state.focusIndex);
      return;
    }
  }

  function selectSearchOption(state, filteredIndex) {
    const opt = state.filtered[filteredIndex];
    if (!opt) return;

    state.select.value = opt.value;
    state.select.dispatchEvent(new Event('change', { bubbles: true }));
    syncSearchableSelect(state.select);
    closeSearchDropdown();
  }

  function closeSearchDropdown(select) {
    if (!activeSearchPanel) return;
    if (select && activeSearchPanel.select !== select) return;

    const state = activeSearchPanel;
    activeSearchPanel = null;

    try {
      state.trigger.setAttribute('aria-expanded', 'false');
    } catch (_) {}

    try {
      if (state.handleOutside) document.removeEventListener('pointerdown', state.handleOutside, true);
      if (state.handleKeydown) document.removeEventListener('keydown', state.handleKeydown, true);
      if (state.handleFocus) document.removeEventListener('focusin', state.handleFocus, true);
      if (state.handleScroll) window.removeEventListener('scroll', state.handleScroll, true);
      if (state.handleResize) window.removeEventListener('resize', state.handleResize);
    } catch (_) {}

    try {
      if (state.panel && state.panel.parentNode) state.panel.parentNode.removeChild(state.panel);
    } catch (_) {}
  }

  function openSearchDropdown(select) {
    if (!isSearchableSelect(select) || select.disabled) return;

    const meta = searchableSelectMeta.get(select);
    if (!meta) return;

    closeSearchDropdown();

    const placeholder = getSearchablePlaceholder(select);

    const panel = document.createElement('div');
    panel.className = 'fk-search-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', `${placeholder} 검색`);

    // Optional: allow multi-line labels in the panel list for specific selects.
    // Usage: <select ... data-option-multiline="true"> ...</select>
    try {
      const ml = select.getAttribute('data-option-multiline') || (select.dataset ? select.dataset.optionMultiline : '') || '';
      const want = String(ml).toLowerCase();
      if (want === 'true' || want === '1') panel.classList.add('is-multiline');
    } catch (_) {}

    // Optional: async option sources (e.g. remote search)
    try {
      const srcKey = getAsyncSourceKey(select);
      if (srcKey) panel.dataset.source = String(srcKey);
    } catch (_) {}

    const header = document.createElement('div');
    header.className = 'fk-search-panel__header';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'fk-search-panel__input';
    input.placeholder = '검색어 입력';
    input.setAttribute('aria-label', '검색어 입력');
    input.autocomplete = 'off';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'fk-search-panel__close';
    closeBtn.textContent = '닫기';
    closeBtn.setAttribute('aria-label', '닫기');

    header.appendChild(input);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    const list = document.createElement('div');
    list.className = 'fk-search-panel__list';
    list.setAttribute('role', 'listbox');
    panel.appendChild(list);

    const empty = document.createElement('div');
    empty.className = 'fk-search-panel__empty';
    // Allow per-select empty-message override (used for dependent selects like "유형을 먼저 선택해 주세요.").
    const emptyMsgAttr = select.getAttribute('data-empty-message') || (select.dataset ? select.dataset.emptyMessage : '') || '';
    empty.textContent = String(emptyMsgAttr || '검색 결과가 없습니다.');
    empty.hidden = true;
    panel.appendChild(empty);

    const panelMode = (
      select.getAttribute('data-panel-mode') ||
      (select.dataset ? select.dataset.panelMode : '') ||
      ''
    );
    const inline = String(panelMode || '').toLowerCase() === 'inline';

    const panelPlacement = (
      select.getAttribute('data-panel-placement') ||
      (select.dataset ? select.dataset.panelPlacement : '') ||
      ''
    );

    if (inline) {
      // Render the panel within the wrapper so it scrolls with the modal body.
      panel.style.position = 'absolute';
      panel.style.zIndex = '5000';
      meta.wrapper.appendChild(panel);
    } else {
      document.body.appendChild(panel);
    }

    const options = buildSearchPanelOptions(select, placeholder);

    const state = {
      select,
      panel,
      trigger: meta.displayBtn,
      anchor: meta.wrapper,
      inline,
      inlinePlacement: panelPlacement,
      input,
      closeBtn,
      list,
      empty,
      placeholder,
      options,
      filtered: options.slice(),
      focusIndex: -1,
      itemButtons: [],
      handleOutside: null,
      handleKeydown: null,
      handleResize: null,
      handleScroll: null,
      handleFocus: null,
    };

    activeSearchPanel = state;

    meta.displayBtn.setAttribute('aria-expanded', 'true');

    renderSearchPanelOptions(state);
    positionSearchPanel(state);

    setTimeout(() => input.focus(), 0);

    closeBtn.addEventListener('click', (event) => {
      event.preventDefault();
      closeSearchDropdown();
    });

    input.addEventListener('keydown', (event) => handleSearchInputKeydown(event, state));
    input.addEventListener('input', () => {
      filterSearchPanelOptions(state);
      scheduleAsyncOptionsFetch(state);
    });

    list.addEventListener('keydown', (event) => handleSearchListKeydown(event, state));

    state.handleOutside = (event) => {
      if (panel.contains(event.target) || meta.wrapper.contains(event.target)) return;
      closeSearchDropdown();
    };
    document.addEventListener('pointerdown', state.handleOutside, true);

    state.handleKeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeSearchDropdown();
      }
    };
    document.addEventListener('keydown', state.handleKeydown, true);

    state.handleResize = () => closeSearchDropdown();
    window.addEventListener('resize', state.handleResize);

    state.handleScroll = (event) => {
      // NOTE: We subscribe on window with capture=true, so we receive scroll events
      // from *any* scrollable element.
      // - If scroll happens inside the dropdown panel (or its anchor), keep it open.
      // - If scroll happens anywhere inside the same modal overlay, keep it open and
      //   re-position it (common when the user wheel-scrolls over the dropdown but the
      //   modal container actually scrolls).
      // - Otherwise (page scroll), close.
      const target = event && event.target;
      if (target && (panel.contains(target) || meta.wrapper.contains(target))) return;

      const modalRoot = meta.wrapper && meta.wrapper.closest ? meta.wrapper.closest('.modal-overlay-full') : null;
      if (modalRoot && target && modalRoot.contains(target)) {
        positionSearchPanel(state);
        return;
      }

      closeSearchDropdown();
    };
    window.addEventListener('scroll', state.handleScroll, true);

    state.handleFocus = (event) => {
      if (panel.contains(event.target) || meta.wrapper.contains(event.target)) return;
      closeSearchDropdown();
    };
    document.addEventListener('focusin', state.handleFocus, true);

    // Kick an initial fetch when a source is configured.
    // NOTE: Some pages expect a remote list even when the query is empty, and
    // some sources depend on other fields (e.g. a "type" select). Reset the
    // cached query so opening the dropdown always fetches fresh data.
    resetAsyncLastQuery(select);
    scheduleAsyncOptionsFetch(state);
  }

  function enhanceSearchableSelects(root) {
    const scope = root || document;

    const selects = [];
    if (scope instanceof HTMLSelectElement) {
      // Explicit call site (code passes a <select>): always enhance+sync it.
      // This keeps UI in sync when code toggles `select.disabled`.
      selects.push(scope);
    } else if (scope === document) {
      // Default: only modal overlays (keeps list-page filters unaffected).
      document.querySelectorAll('.modal-overlay-full select.search-select').forEach((el) => selects.push(el));
      // Opt-in: allow outside modal when explicitly flagged.
      document.querySelectorAll('select.search-select').forEach((el) => {
        if (!el.closest || el.closest('.modal-overlay-full')) return;
        if (allowOutsideModal(el)) selects.push(el);
      });
    } else {
      // Scoped enhancement.
      scope.querySelectorAll('select.search-select').forEach((el) => {
        if ((el.closest && el.closest('.modal-overlay-full')) || allowOutsideModal(el)) {
          selects.push(el);
        }
      });
    }

    selects.forEach((select) => {
      if (!isSearchableSelect(select)) return;
      setupSearchableSelect(select);
      syncSearchableSelect(select);
    });
  }

  function observeDomForSearchSelects() {
    if (!document.body || observeDomForSearchSelects._started) return;
    observeDomForSearchSelects._started = true;

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'childList') {
          m.addedNodes.forEach((node) => {
            if (!(node instanceof Element)) return;

            // Only enhance selects that are inside modal overlays.
            const inModal = (el) => !!(el && el.closest && el.closest('.modal-overlay-full'));

            if (node.matches && node.matches('select.search-select') && (inModal(node) || allowOutsideModal(node))) {
              enhanceSearchableSelects(node);
              return;
            }

            if (node.matches && node.matches('.modal-overlay-full')) {
              enhanceSearchableSelects(node);
              return;
            }

            if (node.querySelectorAll) {
              const found = node.querySelectorAll('select.search-select');
              if (found && found.length) {
                // Enhance just within the nearest modal container.
                const modalRoot = node.closest && node.closest('.modal-overlay-full');
                enhanceSearchableSelects(modalRoot || node);
              }
            }
          });
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  window.BlossomSearchableSelect = {
    enhance: enhanceSearchableSelects,
    syncAll: enhanceSearchableSelects,
    close: closeSearchDropdown,
  };

  function initSearchableSelects() {
    enhanceSearchableSelects(document);
    observeDomForSearchSelects();
  }

  // This helper can be injected dynamically after DOMContentLoaded.
  // In that case, the DOMContentLoaded handler would never fire, so we must
  // initialize immediately when the document is already ready.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSearchableSelects);
  } else {
    initSearchableSelects();
  }
})();

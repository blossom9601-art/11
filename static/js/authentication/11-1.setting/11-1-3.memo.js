// Memo board (11-1-3): DB-backed memo groups + memos.
(function(){
  const empNoForAvatar = (document.querySelector('#btn-account')?.getAttribute('data-emp-no') || '').trim();
  const LS_IMG_GLOBAL = 'blossom.profileImageSrc';
  const LS_IMG = empNoForAvatar ? `blossom.profileImageSrc.${empNoForAvatar}` : LS_IMG_GLOBAL;
  // NOTE: motto(message) is server-backed now; do not use localStorage override here.

  const LS_ACTIVE_GROUP = 'blossom.memo.activeGroupId';
  const LS_VIEW_MODE = 'blossom.memo.viewMode'; // 'partial' | 'full'
  const DEFAULT_PAGE_SIZE = 9;
  const FULL_PAGE_SIZE = 10000;
  const state = {
    groups: [],
    activeGroupId: null,
    memos: [],
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    total: 0,
    search: '',
    viewMode: 'partial',
  };

  // Reuse a single hidden image picker input to avoid duplicated click/change handlers
  let _memoImagePicker = null;

  function applyViewModePolicy(){
    // Policy: partial = 9 items only; full = all items (single page)
    state.page = 1;
    state.pageSize = (state.viewMode === 'full') ? FULL_PAGE_SIZE : DEFAULT_PAGE_SIZE;
  }

  function setHidden(el, hidden){
    if (!el) return;
    if (hidden) el.setAttribute('hidden', '');
    else el.removeAttribute('hidden');
  }

  function clampPage(page, totalPages){
    const safeTotal = Math.max(1, Number(totalPages) || 1);
    const p = Number(page);
    if (!Number.isFinite(p)) return 1;
    return Math.min(Math.max(1, p), safeTotal);
  }

  function nowIso(){ return new Date().toISOString(); }

  function decodeHtmlEntities(s){
    const str = String(s ?? '');
    if (!str.includes('&')) return str;
    const t = document.createElement('textarea');
    t.innerHTML = str;
    return t.value;
  }

  function stripMarkdownImagesForList(text){
    const s = String(text ?? '');

    const hasMarkdownImage = /!\[[^\]]*\]\([^\)]+\)/.test(s);
    const hasHtmlImage = /<img\b/i.test(s);
    const hasImage = hasMarkdownImage || hasHtmlImage;

    // Remove images from preview text
    let withoutImages = s.replace(/!\[[^\]]*\]\([^\)]*\)/g, '');
    withoutImages = withoutImages.replace(/<img\b[^>]*>/gi, '');

    // Clean up excessive blank lines introduced by removal
    const cleaned = withoutImages
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd();

    if (!hasImage) return cleaned;

    // If the memo is image-only (or preview becomes empty), show marker text
    if (cleaned.replace(/\s+/g, '').length === 0) return '(그림)';
    return `${cleaned} (그림)`;
  }

  function safeLocalStorageGet(key){
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function safeLocalStorageSet(key, value){
    try { localStorage.setItem(key, value); } catch {}
  }

  function ensureMemoEditorShell(){
    if (document.getElementById('memo-editor')) return;

    const shell = document.createElement('div');
    shell.innerHTML = '' +
      '<div id="memo-editor" class="memo-editor-modal" aria-hidden="true" role="dialog" aria-modal="true">' +
      '  <div class="editor-backdrop" data-editor-close></div>' +
      '  <div class="editor-dialog" role="document">' +
      '    <div class="editor-header">' +
      '      <div class="left">' +
      '        <button class="action-btn primary" id="editor-save" title="저장" aria-label="저장">' +
      '          <img class="action-icon" src="/static/image/svg/save.svg" alt="저장">' +
      '        </button>' +
      '      </div>' +
      '      <div class="center"><span class="editor-location">내 메모</span></div>' +
      '      <div class="right">' +
      '        <button class="action-btn" id="editor-delete" title="삭제" aria-label="삭제">' +
      '          <img class="action-icon" src="/static/image/svg/delete.svg" alt="삭제">' +
      '        </button>' +
      '        <button class="action-btn" id="editor-star" title="중요" aria-label="중요">' +
      '          <img class="action-icon" src="/static/image/svg/memo/free-icon-star.svg" alt="중요">' +
      '        </button>' +
      '        <button class="action-btn close-ghost" id="editor-cancel" title="취소" aria-label="취소">' +
      '          <img class="action-icon" src="/static/image/svg/cancel.svg" alt="취소">' +
      '        </button>' +
      '      </div>' +
      '    </div>' +
      '    <div class="editor-toolbar" role="toolbar" aria-label="편집 도구">' +
      '      <div class="toolbar-group">' +
      '        <button type="button" class="action-btn toolbar-btn" id="tb-bold" title="굵게" aria-label="굵게">' +
      '          <img class="action-icon" src="/static/image/svg/memo/free-icon-bold.svg" alt="굵게">' +
      '        </button>' +
      '        <button type="button" class="action-btn toolbar-btn" id="tb-underline" title="밑줄" aria-label="밑줄">' +
      '          <img class="action-icon" src="/static/image/svg/memo/free-icon-underline.svg" alt="밑줄">' +
      '        </button>' +
      '        <button type="button" class="action-btn toolbar-btn" id="tb-strike" title="취소선" aria-label="취소선">' +
      '          <img class="action-icon" src="/static/image/svg/memo/free-icon-strikethrough.svg" alt="취소선">' +
      '        </button>' +
      '        <button type="button" class="action-btn toolbar-btn" id="tb-highlight" title="형광펜" aria-label="형광펜">' +
      '          <img class="action-icon" src="/static/image/svg/memo/free-icon-highlighter.svg" alt="형광펜">' +
      '        </button>' +
      '        <button type="button" class="action-btn toolbar-btn" id="tb-checkbox" title="체크박스" aria-label="체크박스">' +
      '          <img class="action-icon" src="/static/image/svg/memo/free-icon-checkbox.svg" alt="체크박스">' +
      '        </button>' +
      '        <button type="button" class="action-btn toolbar-btn" id="tb-picture" title="사진첨부" aria-label="사진첨부">' +
      '          <img class="action-icon" src="/static/image/svg/memo/free-icon-picture.svg" alt="사진첨부">' +
      '        </button>' +
      '      </div>' +
      '    </div>' +
      '    <div class="editor-body">' +
      '      <input id="editor-title" type="text" class="editor-title" placeholder="제목" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off">' +
      '      <div id="editor-rich" class="editor-text rich" contenteditable="true" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" data-placeholder="메모를 입력하세요."></div>' +
      '      <textarea id="editor-body-input" class="editor-text" placeholder="메모를 입력하세요." spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" hidden></textarea>' +
      '      <div id="editor-preview" class="editor-preview" aria-live="polite" aria-label="체크리스트 미리보기"></div>' +
      '    </div>' +
      '  </div>' +
      '</div>';

    const root = shell.firstElementChild;
    if (root) document.body.appendChild(root);
  }

  function isMemoEditorReady(){
    ensureMemoEditorShell();
    const requiredIds = [
      'memo-editor',
      'editor-title',
      'editor-body-input',
      'editor-rich',
      'editor-save',
      'editor-cancel',
      'editor-delete',
      'editor-star',
    ];
    return !requiredIds.some((id) => !document.getElementById(id));
  }

  // System message modal (same look as /p/cat_business_work)
  let _memoWarningModalBound = false;
  let _memoWarningLastFocused = null;
  function openMemoWarningModal(message, variant){
    const modal = document.getElementById('memo-warning-modal');
    const titleEl = document.getElementById('memo-warning-title');
    const msgEl = document.getElementById('memo-warning-message');
    const illustEl = document.getElementById('memo-warning-illustration');
    if (!modal || !msgEl) {
      alert(String(message || '알림'));
      return;
    }

    if (!_memoWarningModalBound){
      _memoWarningModalBound = true;
      const closeEls = modal.querySelectorAll('[data-modal-close]');
      const isAnyStandardModalOpen = () => !!document.querySelector('.modal-overlay-base.show, .server-add-modal.show, .server-edit-modal.show, .server-column-modal.show');
      const close = () => {
        modal.classList.remove('show');
        modal.setAttribute('aria-hidden', 'true');
        if (!isAnyStandardModalOpen()) document.body.classList.remove('modal-open');
        try { _memoWarningLastFocused?.focus?.(); } catch {}
      };
      closeEls.forEach(el => el.addEventListener('click', close));
      document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape' && modal.classList.contains('show')) close(); });
      modal.addEventListener('click', (e)=>{ if (e.target === modal) close(); });
    }

    _memoWarningLastFocused = document.activeElement;
    const v = String(variant || 'info');
    const isError = (v === 'error' || v === 'warning');
    if (titleEl) titleEl.textContent = isError ? '경고' : '완료';
    msgEl.textContent = String(message || '');
    if (illustEl){
      illustEl.src = isError ? '/static/image/svg/free-sticker-message.svg' : '/static/image/svg/free-sticker-approved.svg';
      illustEl.alt = isError ? '경고' : '완료';
    }
    document.body.classList.add('modal-open');
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    modal.querySelector('[data-modal-close]')?.focus();
  }

  async function apiJson(url, opts){
    const res = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', ...(opts?.headers||{}) },
      ...opts,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.success !== true){
      const msg = (data && data.message) ? data.message : `요청 실패 (${res.status})`;
      throw new Error(msg);
    }
    return data;
  }

  function normalizeGroup(item){
    return {
      id: Number(item?.id),
      name: String(item?.name || '').trim(),
      memoCount: Number(item?.memo_count || 0),
    };
  }
  function normalizeMemo(item){
    const createdAt = item?.created_at || '';
    const updatedAt = item?.updated_at || createdAt || nowIso();
    return {
      id: Number(item?.id),
      groupId: Number(item?.group_id),
      sortOrder: Number(item?.sort_order || 0),
      title: String(item?.title || ''),
      body: String(item?.body || ''),
      starred: !!item?.starred,
      pinned: !!item?.pinned,
      createdAt,
      updatedAt,
    };
  }

  function setActiveGroup(id){
    const asNum = Number(id);
    state.activeGroupId = Number.isFinite(asNum) ? asNum : null;
    if (state.activeGroupId) safeLocalStorageSet(LS_ACTIVE_GROUP, String(state.activeGroupId));
  }

  async function refreshGroups(){
    const data = await apiJson('/api/memo/groups', { method: 'GET' });
    state.groups = (data.items || []).map(normalizeGroup);

    const stored = safeLocalStorageGet(LS_ACTIVE_GROUP);
    const storedId = stored ? Number(stored) : null;
    const hasStored = storedId && state.groups.some(g => g.id === storedId);
    const defaultGroup = state.groups.find(g => (g.name || '').trim() === '기본보기');
    if (hasStored){
      setActiveGroup(storedId);
    } else if (defaultGroup && defaultGroup.id) {
      setActiveGroup(defaultGroup.id);
    } else {
      setActiveGroup(state.groups[0]?.id || null);
    }

    renderGroups();
    updateActiveGroupLabel();
  }

  async function refreshMemos(){
    const grid = document.getElementById('memo-grid');
    if (!grid) return;
    if (!state.activeGroupId){
      state.memos = [];
      state.total = 0;
      grid.innerHTML = '';
      updateEmptyState();
      renderPagination();
      return;
    }

    const params = new URLSearchParams();
    params.set('page', String(state.page || 1));
    params.set('page_size', String(state.pageSize || DEFAULT_PAGE_SIZE));
    if ((state.search || '').trim()) {
      params.set('q', String(state.search || '').trim());
      // When searching, keep backend default (updated-desc)
    } else {
      // Default: honor manual arrangement
      params.set('sort', 'custom');
    }

    const data = await apiJson(`/api/memo/groups/${state.activeGroupId}/memos?${params.toString()}`, { method: 'GET' });
    state.memos = (data.items || []).map(normalizeMemo);
    state.total = Number(data.total || 0);
    renderMemos();
    updateEmptyState();
    renderPagination();
  }

  function updateEmptyState(){
    const gridEl = document.getElementById('memo-grid');
    const paginationEl = document.getElementById('memo-pagination');
    // 요청사항: 큰 empty-state 박스는 제거. (내용이 없으면 그냥 비워둠)
    const memoCount = Array.isArray(state.memos) ? state.memos.length : 0;
    const isEmpty = memoCount === 0;
    // Keep the grid visible so the user sees a blank memo area.
    setHidden(gridEl, false);
    if (gridEl) {
      gridEl.classList.toggle('is-empty', isEmpty);
      applyEmptyMemoGridMinHeight(gridEl, { memoCount, pageSize: state.pageSize });
    }
    // Pagination should be visible even in full view, and even when empty.
    setHidden(paginationEl, false);
    if (paginationEl) paginationEl.classList.toggle('is-empty', isEmpty);
  }

  function updateActiveGroupLabel(){
    const container = document.getElementById('memo-active-group');
    if (!container) return;
    const g = state.groups.find(x => x.id === state.activeGroupId);
    const name = g ? g.name : '';

    const nameEl = document.getElementById('memo-active-group-name');
    const countEl = document.getElementById('memo-active-group-count');
    if (nameEl) nameEl.textContent = name;
    if (countEl) countEl.textContent = g ? String(g.memoCount || 0) : '0';
    // Fallback for older markup (only if spans are not present)
    if (!nameEl && !countEl) container.textContent = name;
  }

  function renderGroups(){
    const listEl = document.getElementById('memo-group-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    state.groups.forEach(g => {
      const isDefault = String(g.name || '').trim() === '기본보기';
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'memo-group-item' + (g.id === state.activeGroupId ? ' active' : '');
      item.setAttribute('role', 'listitem');
      item.dataset.groupId = String(g.id || '');
      item.dataset.groupName = String(g.name || '');
      if (!isDefault){
        item.draggable = true;
        item.addEventListener('dragstart', (e) => {
          const gid = Number(item.dataset.groupId);
          const gname = String(item.dataset.groupName || '').trim();
          if (!gid || gname === '기본보기') return;
          window.__memoGroupDragging = { groupId: gid };
          try {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/x-blossom-memo-group', String(gid));
          } catch (_) {}
        });
        item.addEventListener('dragend', () => {
          window.__memoGroupDragging = null;
          document.querySelectorAll('.memo-group-item.drop-target').forEach(x => x.classList.remove('drop-target'));
        });
      }
      const name = document.createElement('span');
      name.textContent = g.name || '-';
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = String(g.memoCount || 0);
      item.appendChild(name);
      item.appendChild(badge);
      item.addEventListener('click', async ()=>{
        if (g.id === state.activeGroupId) return;
        setActiveGroup(g.id);
        state.page = 1;
        renderGroups();
        updateActiveGroupLabel();
        await refreshMemos();
      });
      listEl.appendChild(item);
    });
  }

  // Memo group delete (context menu + confirm modal)
  function bindMemoGroupDeleteUI(){
    if (window.__memoGroupDeleteBound) return;
    window.__memoGroupDeleteBound = true;

    const menu = document.createElement('div');
    menu.id = 'memo-group-context-menu';
    menu.className = 'memo-group-context-menu';
    menu.setAttribute('hidden', '');
    menu.innerHTML = [
      '<button type="button" class="memo-group-context-rename">그룹 이름변경</button>',
      '<button type="button" class="memo-group-context-delete">그룹 삭제</button>',
    ].join('');
    document.body.appendChild(menu);

    const delModal = document.getElementById('memo-group-delete-modal');
    const delClose = document.getElementById('memo-group-delete-close');
    const delCancel = document.getElementById('memo-group-delete-cancel');
    const delConfirm = document.getElementById('memo-group-delete-confirm');
    const delSubtitle = document.getElementById('memo-group-delete-subtitle');

    const renameModal = document.getElementById('memo-group-rename-modal');
    const renameClose = document.getElementById('memo-group-rename-close');
    const renameCancel = document.getElementById('memo-group-rename-cancel');
    const renameConfirm = document.getElementById('memo-group-rename-confirm');
    const renameInput = document.getElementById('memo-group-rename-name');

    const isAnyStandardModalOpen = () => !!document.querySelector('.modal-overlay-base.show, .server-add-modal.show, .server-edit-modal.show, .server-column-modal.show');

    let pendingGroup = null; // { id, name }

    const hideMenu = () => {
      menu.setAttribute('hidden', '');
      menu.style.display = 'none';
      menu.style.left = '';
      menu.style.top = '';
      // Don't clear pending group while a modal is open (e.g., rename confirm click)
      if (!isAnyStandardModalOpen()) pendingGroup = null;
    };

    const showMenu = (x, y, group) => {
      pendingGroup = group;
      menu.style.position = 'fixed';
      menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - 160))}px`;
      menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - 120))}px`;
      menu.style.display = 'block';
      menu.removeAttribute('hidden');
    };

    const openDeleteModal = (group) => {
      if (!delModal || !delConfirm || !delSubtitle) {
        if (confirm('정말 삭제하시겠습니까?')) proceedDelete(group).catch(()=>{});
        return;
      }
      pendingGroup = group;
      delSubtitle.textContent = `"${group.name}" 그룹을 정말 삭제하시겠습니까?`;
      document.body.classList.add('modal-open');
      delModal.classList.add('show');
      delModal.setAttribute('aria-hidden', 'false');
      delModal.style.display = 'flex';
      setTimeout(() => delConfirm.focus(), 0);
    };

    const closeDeleteModal = () => {
      if (!delModal) return;
      delModal.classList.remove('show');
      delModal.setAttribute('aria-hidden', 'true');
      delModal.style.display = 'none';
      if (!isAnyStandardModalOpen()) document.body.classList.remove('modal-open');
    };

    const proceedDelete = async (group) => {
      if (!group?.id) return;
      delConfirm?.setAttribute?.('disabled', 'disabled');
      try {
        await deleteGroup(group.id);
        await refreshGroups();
        state.page = 1;
        await refreshMemos();
        closeDeleteModal();
      } catch (err) {
        alert(err?.message || '그룹 삭제에 실패했습니다.');
      } finally {
        delConfirm?.removeAttribute?.('disabled');
      }
    };

    const openRenameModal = (group) => {
      if (!renameModal || !renameInput || !renameConfirm) return;
      pendingGroup = group;
      renameInput.value = String(group?.name || '').trim();
      document.body.classList.add('modal-open');
      renameModal.classList.add('show');
      renameModal.setAttribute('aria-hidden', 'false');
      renameModal.style.display = 'flex';
      setTimeout(() => renameInput.focus(), 0);
    };

    const closeRenameModal = () => {
      if (!renameModal) return;
      renameModal.classList.remove('show');
      renameModal.setAttribute('aria-hidden', 'true');
      renameModal.style.display = 'none';
      if (!isAnyStandardModalOpen()) document.body.classList.remove('modal-open');
    };

    const proceedRename = async (group) => {
      if (!group?.id || !renameInput) return;
      const trimmed = String(renameInput.value || '').trim();
      if (!trimmed) { renameInput.focus(); return; }
      renameConfirm?.setAttribute?.('disabled', 'disabled');
      try {
        await renameGroup(group.id, trimmed);
        await refreshGroups();
        updateActiveGroupLabel();
        closeRenameModal();
      } catch (err) {
        alert(err?.message || '그룹 이름 변경에 실패했습니다.');
      } finally {
        renameConfirm?.removeAttribute?.('disabled');
      }
    };

    // Right-click on a group: show delete menu (except default group)
    document.addEventListener('contextmenu', (e) => {
      const btn = e.target?.closest?.('.memo-group-item');
      if (!btn) return;
      const id = Number(btn.dataset.groupId);
      const name = String(btn.dataset.groupName || '').trim();
      if (!id || name === '기본보기') return;
      e.preventDefault();
      showMenu(e.clientX, e.clientY, { id, name });
    }, true);

    // Menu action
    menu.addEventListener('click', (e) => {
      const t = e.target;
      if (t?.closest?.('.memo-group-context-rename') && pendingGroup){
        const group = pendingGroup;
        hideMenu();
        openRenameModal(group);
        return;
      }
      if (t?.closest?.('.memo-group-context-delete') && pendingGroup){
        const group = pendingGroup;
        hideMenu();
        openDeleteModal(group);
      }
    });

    // Close menu on outside interactions
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (t?.closest?.('#memo-group-context-menu')) return;
      if (t?.closest?.('.server-add-modal')) return;
      hideMenu();
    }, true);
    document.addEventListener('scroll', hideMenu, true);
    window.addEventListener('resize', hideMenu);

    // Modal buttons
    delClose?.addEventListener('click', (e) => { e.preventDefault(); closeDeleteModal(); });
    delCancel?.addEventListener('click', (e) => { e.preventDefault(); closeDeleteModal(); });
    delConfirm?.addEventListener('click', (e) => {
      e.preventDefault();
      const group = pendingGroup;
      if (!group) return;
      proceedDelete(group);
    });

    renameClose?.addEventListener('click', (e) => { e.preventDefault(); closeRenameModal(); });
    renameCancel?.addEventListener('click', (e) => { e.preventDefault(); closeRenameModal(); });
    renameConfirm?.addEventListener('click', (e) => {
      e.preventDefault();
      const group = pendingGroup;
      if (!group) return;
      proceedRename(group);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (!renameModal?.classList?.contains('show')) return;
      if (document.activeElement !== renameInput) return;
      e.preventDefault();
      const group = pendingGroup;
      if (!group) return;
      proceedRename(group);
    }, true);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape'){
        hideMenu();
        if (delModal?.classList?.contains('show')) closeDeleteModal();
        if (renameModal?.classList?.contains('show')) closeRenameModal();
      }
    }, true);
  }

  // Memo drag & drop: move memo to a group
  function bindMemoDragDropMove(){
    if (window.__memoDragDropMoveBound) return;
    window.__memoDragDropMoveBound = true;

    const canDropOn = (btn) => {
      if (!btn) return false;
      const id = Number(btn.dataset.groupId);
      const name = String(btn.dataset.groupName || '').trim();
      if (!id) return false;
      if (name === '기본보기') return false;
      return true;
    };

    document.addEventListener('dragover', (e) => {
      const btn = e.target?.closest?.('.memo-group-item');
      if (!btn) return;
      if (!canDropOn(btn)) return;
      if (!window.__memoDragging?.memoId) return;
      e.preventDefault();
      btn.classList.add('drop-target');
      try { e.dataTransfer.dropEffect = 'move'; } catch (_) {}
    }, true);

    document.addEventListener('dragleave', (e) => {
      const btn = e.target?.closest?.('.memo-group-item');
      if (!btn) return;
      btn.classList.remove('drop-target');
    }, true);

    document.addEventListener('drop', async (e) => {
      const btn = e.target?.closest?.('.memo-group-item');
      if (!btn) return;
      if (!canDropOn(btn)) return;
      const dragging = window.__memoDragging;
      if (!dragging?.memoId) return;

      e.preventDefault();
      document.querySelectorAll('.memo-group-item.drop-target').forEach(x => x.classList.remove('drop-target'));

      const targetGroupId = Number(btn.dataset.groupId);
      if (!targetGroupId) return;
      if (Number(dragging.fromGroupId) === targetGroupId) return;

      try {
        await updateMemo(Number(dragging.memoId), { group_id: targetGroupId });
        await refreshGroups();
        await refreshMemos();
      } catch (err) {
        alert(err?.message || '그룹 이동에 실패했습니다.');
      }
    }, true);
  }

  // Group drag & drop: reorder groups
  function bindMemoGroupDragDropReorder(){
    if (window.__memoGroupDragDropReorderBound) return;
    window.__memoGroupDragDropReorderBound = true;

    const canDropOn = (btn) => {
      if (!btn) return false;
      const id = Number(btn.dataset.groupId);
      const name = String(btn.dataset.groupName || '').trim();
      if (!id) return false;
      if (name === '기본보기') return false;
      return true;
    };

    document.addEventListener('dragover', (e) => {
      const btn = e.target?.closest?.('.memo-group-item');
      if (!btn) return;
      if (!canDropOn(btn)) return;
      const dragging = window.__memoGroupDragging;
      if (!dragging?.groupId) return;
      if (Number(btn.dataset.groupId) === Number(dragging.groupId)) return;
      e.preventDefault();
      btn.classList.add('drop-target');
      try { e.dataTransfer.dropEffect = 'move'; } catch (_) {}
    }, true);

    document.addEventListener('dragleave', (e) => {
      const btn = e.target?.closest?.('.memo-group-item');
      if (!btn) return;
      btn.classList.remove('drop-target');
    }, true);

    document.addEventListener('drop', async (e) => {
      const btn = e.target?.closest?.('.memo-group-item');
      if (!btn) return;
      if (!canDropOn(btn)) return;
      const dragging = window.__memoGroupDragging;
      if (!dragging?.groupId) return;

      e.preventDefault();
      document.querySelectorAll('.memo-group-item.drop-target').forEach(x => x.classList.remove('drop-target'));

      const sourceId = Number(dragging.groupId);
      const targetId = Number(btn.dataset.groupId);
      if (!sourceId || !targetId) return;
      if (sourceId === targetId) return;

      try {
        await apiJson('/api/memo/groups/reorder', {
          method: 'POST',
          body: JSON.stringify({ source_id: sourceId, target_id: targetId, position: 'before' }),
        });
        await refreshGroups();
      } catch (err) {
        alert(err?.message || '그룹 순서 변경에 실패했습니다.');
      } finally {
        window.__memoGroupDragging = null;
      }
    }, true);
  }

  function renderMemos(){
    const grid = document.getElementById('memo-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const memos = Array.isArray(state.memos) ? state.memos : [];
    memos.forEach(n => grid.appendChild(card(n)));
  }

  function applyEmptyMemoGridMinHeight(gridEl, opts){
    if (!gridEl) return;

    const memoCount = Number(opts?.memoCount || 0);
    const pageSize = Number(opts?.pageSize || DEFAULT_PAGE_SIZE);

    // Requirement: 0~9개(부분보기)에서도 "하얀 그리드 외곽 영역"이 9개가 찬 것처럼 보이도록 높이를 유지한다.
    // NOTE: placeholder 박스는 만들지 않고 min-height만 적용한다.
    const keepNineSlotOuterBox = (pageSize === DEFAULT_PAGE_SIZE) && (memoCount <= DEFAULT_PAGE_SIZE);
    if (!keepNineSlotOuterBox){
      gridEl.style.minHeight = '';
      return;
    }

    // Requested: keep white memo area roughly equal to 9 memo cards,
    // without rendering 9 placeholder boxes.
    try {
      const cs = window.getComputedStyle(gridEl);
      const cols = Math.max(1, String(cs.gridTemplateColumns || '').trim().split(/\s+/).filter(Boolean).length);
      const rows = Math.max(1, Math.ceil(DEFAULT_PAGE_SIZE / cols));
      const gap = parseFloat(cs.rowGap || cs.gap || '0') || 0;

      // Measure one card's height without affecting layout.
      const probe = document.createElement('article');
      probe.className = 'memo-card';
      probe.style.position = 'absolute';
      probe.style.visibility = 'hidden';
      probe.style.pointerEvents = 'none';
      probe.style.left = '-99999px';
      probe.style.top = '0';

      const t = document.createElement('h4'); t.className = 'memo-title'; t.textContent = '\u00A0';
      const b = document.createElement('p'); b.className = 'memo-body'; b.textContent = '\u00A0';
      const f = document.createElement('div'); f.className = 'memo-footer';
      const m = document.createElement('span'); m.textContent = '\u00A0';
      const a = document.createElement('div'); a.className = 'memo-actions';
      f.appendChild(m); f.appendChild(a);
      probe.appendChild(t); probe.appendChild(b); probe.appendChild(f);

      gridEl.appendChild(probe);
      const cardH = probe.getBoundingClientRect().height || 0;
      probe.remove();

      if (cardH > 0){
        const target = Math.round(rows * cardH + Math.max(0, rows - 1) * gap);
        gridEl.style.minHeight = `${target}px`;
      }
    } catch (_) {
      // fallback: keep existing CSS min-height
    }
  }

  function applyViewModeClass(){
    const grid = document.getElementById('memo-grid');
    if (!grid) return;
    // Policy changed: view mode controls count, not card/body expansion.
    grid.classList.remove('view-full');
  }

  function bindMemoViewModeUI(){
    if (window.__memoViewModeBound) return;
    window.__memoViewModeBound = true;

    const stored = String(safeLocalStorageGet(LS_VIEW_MODE) || '').trim();
    if (stored === 'full' || stored === 'partial') state.viewMode = stored;
    applyViewModePolicy();

    const sel = document.getElementById('memo-view-mode');
    if (sel){
      sel.value = state.viewMode === 'full' ? 'full' : 'partial';
      sel.addEventListener('change', () => {
        const v = String(sel.value || 'partial');
        state.viewMode = (v === 'full') ? 'full' : 'partial';
        safeLocalStorageSet(LS_VIEW_MODE, state.viewMode);
        applyViewModePolicy();
        applyViewModeClass();
        refreshMemos().catch(()=>{});
      });
    }
    applyViewModeClass();
  }

  function bindMemoCardMoveUI(){
    if (window.__memoCardMoveBound) return;
    window.__memoCardMoveBound = true;

    const menu = document.createElement('div');
    menu.id = 'memo-card-context-menu';
    menu.className = 'memo-card-context-menu';
    menu.setAttribute('hidden', '');
    menu.innerHTML = [
      '<button type="button" class="memo-card-context-move">그룹이동</button>',
      '<button type="button" class="memo-card-context-delete">메모 삭제</button>',
    ].join('');
    document.body.appendChild(menu);

    const modal = document.getElementById('memo-move-modal');
    const closeBtn = document.getElementById('memo-move-close');
    const cancelBtn = document.getElementById('memo-move-cancel');
    const confirmBtn = document.getElementById('memo-move-confirm');
    const selectEl = document.getElementById('memo-move-group-select');

    const isAnyStandardModalOpen = () => !!document.querySelector('.modal-overlay-base.show, .server-add-modal.show, .server-edit-modal.show, .server-column-modal.show');

    let pendingMemo = null; // { id, groupId, title }

    const hideMenu = () => {
      menu.setAttribute('hidden', '');
      menu.style.display = 'none';
      menu.style.left = '';
      menu.style.top = '';
      pendingMemo = null;
    };

    const showMenu = (x, y, memo) => {
      pendingMemo = memo;
      menu.style.position = 'fixed';
      menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - 160))}px`;
      menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - 120))}px`;
      menu.style.display = 'block';
      menu.removeAttribute('hidden');
    };

    const closeModal = () => {
      if (!modal) return;
      modal.classList.remove('show');
      modal.setAttribute('aria-hidden', 'true');
      modal.style.display = 'none';
      if (!isAnyStandardModalOpen()) document.body.classList.remove('modal-open');
    };

    const openModal = (memo) => {
      if (!modal || !selectEl || !confirmBtn) {
        // Fallback: no modal markup
        return;
      }
      pendingMemo = memo;

      const choices = (state.groups || [])
        .filter(g => (g && g.id))
        .filter(g => String(g.name || '').trim() !== '기본보기')
        .filter(g => Number(g.id) !== Number(memo?.groupId));

      selectEl.innerHTML = '';
      if (choices.length === 0){
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '이동할 그룹이 없습니다.';
        selectEl.appendChild(opt);
        selectEl.setAttribute('disabled', 'disabled');
        confirmBtn.setAttribute('disabled', 'disabled');
      } else {
        choices.forEach(g => {
          const opt = document.createElement('option');
          opt.value = String(g.id);
          opt.textContent = String(g.name || '-');
          selectEl.appendChild(opt);
        });
        selectEl.removeAttribute('disabled');
        confirmBtn.removeAttribute('disabled');
      }

      document.body.classList.add('modal-open');
      modal.classList.add('show');
      modal.setAttribute('aria-hidden', 'false');
      modal.style.display = 'flex';
      setTimeout(() => selectEl.focus(), 0);
    };

    const proceedMove = async () => {
      if (!pendingMemo?.id || !selectEl) return;
      const targetId = Number(selectEl.value);
      if (!targetId) return;
      confirmBtn?.setAttribute?.('disabled', 'disabled');
      try {
        await updateMemo(Number(pendingMemo.id), { group_id: targetId });
        await refreshGroups();
        await refreshMemos();
        closeModal();
      } catch (err) {
        alert(err?.message || '그룹 이동에 실패했습니다.');
      } finally {
        confirmBtn?.removeAttribute?.('disabled');
      }
    };

    document.addEventListener('contextmenu', (e) => {
      const cardEl = e.target?.closest?.('.memo-card');
      if (!cardEl) return;
      const memoId = Number(cardEl.dataset.memoId);
      if (!memoId) return;
      const memo = state.memos.find(m => Number(m.id) === memoId) || { id: memoId, groupId: Number(cardEl.dataset.groupId), title: '' };
      e.preventDefault();
      showMenu(e.clientX, e.clientY, { id: Number(memo.id), groupId: Number(memo.groupId), title: String(memo.title || '') });
    }, true);

    menu.addEventListener('click', (e) => {
      const t = e.target;
      if (t?.closest?.('.memo-card-context-move') && pendingMemo){
        const memo = pendingMemo;
        hideMenu();
        openModal(memo);
      }
      if (t?.closest?.('.memo-card-context-delete') && pendingMemo){
        const memo = pendingMemo;
        hideMenu();
        (async ()=>{
          if (!memo?.id) return;
          if (!confirm('메모를 삭제하시겠습니까?')) return;
          try {
            await deleteMemo(Number(memo.id));
            await refreshGroups();
            await refreshMemos();
          } catch (err) {
            alert(err?.message || '메모 삭제에 실패했습니다.');
          }
        })();
      }
    });

    document.addEventListener('click', (e) => {
      const t = e.target;
      if (t?.closest?.('#memo-card-context-menu')) return;
      hideMenu();
    }, true);
    document.addEventListener('scroll', hideMenu, true);
    window.addEventListener('resize', hideMenu);

    closeBtn?.addEventListener('click', (e) => { e.preventDefault(); closeModal(); });
    cancelBtn?.addEventListener('click', (e) => { e.preventDefault(); closeModal(); });
    confirmBtn?.addEventListener('click', (e) => { e.preventDefault(); proceedMove(); });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape'){
        hideMenu();
        if (modal?.classList?.contains('show')) closeModal();
      }
    }, true);
  }

  function renderPagination(){
    const el = document.getElementById('memo-pagination');
    if (!el) return;

    // Always show pagination (even in full view, and even when empty).
    setHidden(el, false);

    const pageNumbersEl = document.getElementById('memo-page-list');
    const infoEl = document.getElementById('memo-pagination-info');
    const firstBtn = document.getElementById('memo-first');
    const prevBtn = document.getElementById('memo-prev');
    const nextBtn = document.getElementById('memo-next-btn');
    const lastBtn = document.getElementById('memo-last');

    const totalPages = Math.max(1, Math.ceil((state.total || 0) / (state.pageSize || DEFAULT_PAGE_SIZE)));
    state.page = clampPage(state.page, totalPages);

    // Modern pagination markup present
    if (pageNumbersEl && firstBtn && prevBtn && nextBtn && lastBtn){
      if (infoEl){
        if ((state.total || 0) === 0) infoEl.textContent = '0-0 / 0개 항목';
        else {
          const start = (state.page - 1) * (state.pageSize || DEFAULT_PAGE_SIZE) + 1;
          const end = Math.min(state.page * (state.pageSize || DEFAULT_PAGE_SIZE), state.total);
          infoEl.textContent = `${start}-${end} / ${state.total}개 항목`;
        }
      }

      if ((state.total || 0) === 0){
        firstBtn.disabled = true;
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        lastBtn.disabled = true;
        // Requested: show page number 1 even when empty.
        pageNumbersEl.innerHTML = '';
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'page-btn active';
        b.textContent = '1';
        b.disabled = true;
        pageNumbersEl.appendChild(b);
        return;
      }

      const isFirst = state.page <= 1;
      const isLast = state.page >= totalPages;
      firstBtn.disabled = isFirst;
      prevBtn.disabled = isFirst;
      nextBtn.disabled = isLast;
      lastBtn.disabled = isLast;

      // bind nav once
      if (!firstBtn.dataset.bound){
        firstBtn.dataset.bound = '1';
        firstBtn.addEventListener('click', async ()=>{ state.page = 1; await refreshMemos(); });
      }
      if (!prevBtn.dataset.bound){
        prevBtn.dataset.bound = '1';
        prevBtn.addEventListener('click', async ()=>{ state.page = Math.max(1, state.page - 1); await refreshMemos(); });
      }
      if (!nextBtn.dataset.bound){
        nextBtn.dataset.bound = '1';
        nextBtn.addEventListener('click', async ()=>{ state.page = Math.min(totalPages, state.page + 1); await refreshMemos(); });
      }
      if (!lastBtn.dataset.bound){
        lastBtn.dataset.bound = '1';
        lastBtn.addEventListener('click', async ()=>{ state.page = totalPages; await refreshMemos(); });
      }

      // 페이지네이션 숫자 버튼 렌더
      pageNumbersEl.innerHTML = '';
      const windowSize = 5;
      const half = Math.floor(windowSize / 2);
      let startPage = Math.max(1, state.page - half);
      let endPage = Math.min(totalPages, startPage + windowSize - 1);
      startPage = Math.max(1, endPage - windowSize + 1);
      for (let p = startPage; p <= endPage; p++){
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'page-btn' + (p === state.page ? ' active' : '');
        b.textContent = String(p);
        b.disabled = p === state.page;
        b.addEventListener('click', async ()=>{ state.page = p; await refreshMemos(); });
        pageNumbersEl.appendChild(b);
      }
      return;
    }

    // Fallback: legacy simple pagination (for older markup)
    const page = state.page;
    el.innerHTML = '';
    if (totalPages <= 1){
      // Requested: show page number 1 even when empty.
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'memo-page-btn active';
      b.textContent = '1';
      b.disabled = true;
      el.appendChild(b);
      return;
    }

    const mkBtn = (label, targetPage, disabled, active=false)=>{
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'memo-page-btn' + (active ? ' active' : '');
      b.textContent = label;
      if (disabled) b.disabled = true;
      b.addEventListener('click', async ()=>{
        if (disabled) return;
        state.page = targetPage;
        await refreshMemos();
      });
      return b;
    };

    el.appendChild(mkBtn('‹', page - 1, page <= 1));
    const windowSize = 5;
    const half = Math.floor(windowSize / 2);
    let start = Math.max(1, page - half);
    let end = Math.min(totalPages, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);
    for (let p = start; p <= end; p++) el.appendChild(mkBtn(String(p), p, false, p === page));
    el.appendChild(mkBtn('›', page + 1, page >= totalPages));
  }

  async function createGroup(name){
    const data = await apiJson('/api/memo/groups', { method: 'POST', body: JSON.stringify({ name }) });
    return normalizeGroup(data.item);
  }

  async function deleteGroup(groupId){
    await apiJson(`/api/memo/groups/${Number(groupId)}`, { method: 'DELETE' });
  }

  async function renameGroup(groupId, name){
    const data = await apiJson(`/api/memo/groups/${Number(groupId)}`, { method: 'PUT', body: JSON.stringify({ name }) });
    return normalizeGroup(data.item);
  }

  async function createMemo(payload){
    const data = await apiJson(`/api/memo/groups/${state.activeGroupId}/memos`, { method: 'POST', body: JSON.stringify(payload || {}) });
    return normalizeMemo(data.item);
  }
  async function updateMemo(id, payload){
    const data = await apiJson(`/api/memo/memos/${id}`, { method: 'PUT', body: JSON.stringify(payload || {}) });
    return normalizeMemo(data.item);
  }
  async function deleteMemo(id){
    await apiJson(`/api/memo/memos/${id}`, { method: 'DELETE' });
  }

  function card(note){
    const el = document.createElement('article');
    el.className = 'memo-card';
    el.draggable = true;
    el.dataset.memoId = String(note?.id || '');
    el.dataset.groupId = String(note?.groupId || '');
    const title = document.createElement('h4'); title.className = 'memo-title'; title.textContent = decodeHtmlEntities(note.title || '(제목 없음)');
    const bodyText = stripMarkdownImagesForList(decodeHtmlEntities(note.body || ''));
    const body = document.createElement('p'); body.className = 'memo-body'; body.textContent = bodyText;
  const footer = document.createElement('div'); footer.className = 'memo-footer';
  const dateText = (note.updatedAt || note.createdAt || '').slice(0,10);
  const meta = document.createElement('span'); meta.textContent = `${dateText}`;
    const actions = document.createElement('div'); actions.className = 'memo-actions';
    // top-right star overlay
    const starOverlay = document.createElement('button'); starOverlay.className='action-btn star-overlay'+(note.starred?' editing':''); starOverlay.title='중요'; starOverlay.setAttribute('aria-label','중요'); starOverlay.setAttribute('aria-pressed', String(!!note.starred));
  const starIcon = document.createElement('img'); starIcon.src='/static/image/svg/memo/free-icon-star.svg'; starIcon.alt='중요'; starIcon.className='action-icon';
    starOverlay.appendChild(starIcon);
  // 핀 고정은 메인 카드에서 표시하지 않음 (모달에서만)
  // footer edit button removed on main cards; click card to edit in modal
    // listeners
    starOverlay.addEventListener('click', async (e)=>{
      e.stopPropagation();
      const next = !note.starred;
      starOverlay.setAttribute('aria-pressed', String(!!next));
      starOverlay.classList.toggle('editing', !!next);
      try {
        const updated = await updateMemo(note.id, { starred: next });
        note.starred = !!updated.starred;
        starOverlay.setAttribute('aria-pressed', String(!!note.starred));
        starOverlay.classList.toggle('editing', !!note.starred);
        // Important toggle should affect ordering immediately.
        await refreshMemos();
      } catch (err) {
        // revert
        starOverlay.setAttribute('aria-pressed', String(!!note.starred));
        starOverlay.classList.toggle('editing', !!note.starred);
        alert(err?.message || '중요 표시 변경에 실패했습니다.');
      }
    });

    el.addEventListener('dragstart', (e) => {
      try {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(note?.id || ''));
      } catch (_) {}
      el.classList.add('dragging');
      window.__memoDragging = { memoId: Number(note?.id), fromGroupId: Number(note?.groupId), starred: !!note?.starred };
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      window.__memoDragging = null;
      document.querySelectorAll('.memo-group-item.drop-target').forEach(x => x.classList.remove('drop-target'));
    });

    el.addEventListener('dragover', (e) => {
      if (!window.__memoDragging?.memoId) return;
      const srcId = Number(window.__memoDragging.memoId);
      const tgtId = Number(note?.id);
      if (!srcId || !tgtId || srcId === tgtId) return;
      if (Number(window.__memoDragging.fromGroupId) !== Number(state.activeGroupId)) return;
      if (!!window.__memoDragging.starred !== !!note?.starred) return;
      e.preventDefault();
      el.classList.add('drop-target');
      try { e.dataTransfer.dropEffect = 'move'; } catch (_) {}
    });
    el.addEventListener('dragleave', () => {
      el.classList.remove('drop-target');
    });
    el.addEventListener('drop', async (e) => {
      const dragging = window.__memoDragging;
      if (!dragging?.memoId) return;
      const srcId = Number(dragging.memoId);
      const tgtId = Number(note?.id);
      if (!srcId || !tgtId || srcId === tgtId) return;
      if (Number(dragging.fromGroupId) !== Number(state.activeGroupId)) return;
      if (!!dragging.starred !== !!note?.starred) return;
      e.preventDefault();

      const rect = el.getBoundingClientRect();
      const isAfter = (e.clientY - rect.top) > (rect.height / 2);
      const position = isAfter ? 'after' : 'before';

      document.querySelectorAll('.memo-card.drop-target').forEach(x => x.classList.remove('drop-target'));
      try {
        await apiJson(`/api/memo/groups/${state.activeGroupId}/memos/reorder`, {
          method: 'POST',
          body: JSON.stringify({ source_id: srcId, target_id: tgtId, position }),
        });
        await refreshGroups();
        await refreshMemos();
      } catch (err) {
        alert(err?.message || '메모 순서 변경에 실패했습니다.');
      }
    });
  // no explicit edit button on main cards
    footer.appendChild(meta); footer.appendChild(actions);
    el.appendChild(title); el.appendChild(body); el.appendChild(footer);
  el.appendChild(starOverlay);
    el.addEventListener('click', (e)=>{
  if (e.target.closest && (e.target.closest('.star-overlay') || e.target.closest('.action-btn'))) return; // 액션 버튼은 자체 처리
      openModalEditor(note); // 카드 선택 시 모달 편집기 열기
    });
    return el;
  }

  // Quick compose removed: use + button to open modal editor.

  // Modal editor
  function openModalEditor(note){
    const modal = document.getElementById('memo-editor');
    if (!modal) return;
    // Remember opener to restore focus on close
    const previouslyFocused = document.activeElement;
    const titleEl = document.getElementById('editor-title');
  const bodyEl = document.getElementById('editor-body-input');
  const richEl = document.getElementById('editor-rich');
  const saveBtn = document.getElementById('editor-save');
  const cancelBtn = document.getElementById('editor-cancel');
  const deleteBtn = document.getElementById('editor-delete');
    const starBtn = document.getElementById('editor-star');
    // Pin UI removed: only "중요" is supported.
  const closeEls = modal.querySelectorAll('[data-editor-close]');
    const isNew = !note || !note.id;
  let working = note ? { ...note } : { id: null, title:'', body:'', starred:false, createdAt: nowIso(), updatedAt: nowIso() };
  titleEl.value = working.title || '';
  bodyEl.value = working.body || '';
    starBtn.classList.toggle('editing', !!working.starred);
    async function saveWorking(){
      if (!state.activeGroupId){
        throw new Error('그룹을 선택하세요.');
      }
  working.title = (titleEl.value || '').trim();
  working.body = getPlainFromRich();

      // Policy: memo content must be <= 10MB (UTF-8 bytes)
      try {
        const bodyBytes = new Blob([String(working.body || '')]).size;
        if (bodyBytes > (10 * 1024 * 1024)) {
          throw new Error('메모는 10MB 이하만 저장할 수 있습니다.');
        }
      } catch (e) {
        if (String(e?.message || '').includes('10MB')) throw e;
        throw new Error('메모 내용을 확인할 수 없습니다.');
      }

      const payload = {
        title: working.title,
        body: working.body,
        starred: !!working.starred,
      };
      if (isNew){
        const created = await createMemo(payload);
        working = { ...created };
      } else {
        const updated = await updateMemo(working.id, payload);
        working = { ...updated };
      }
      // refresh list + groups (counts)
      await refreshGroups();
      await refreshMemos();
    }
    // placeholders for cleanup of editor-specific handlers
    let onEnterKeydown = null;
  let onBeforeInput = null;
    let onDocKeydown = null;
  let onRichMouseDown = null;
    function close(){
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden','true');
      // Remove focus trap listeners
      modal.removeEventListener('keydown', onKeydown);
      document.removeEventListener('keydown', onGlobalEsc);
      // Remove editor listeners to avoid duplicates
      if (richEl && onEnterKeydown) richEl.removeEventListener('keydown', onEnterKeydown, true);
      if (richEl && onBeforeInput) richEl.removeEventListener('beforeinput', onBeforeInput, true);
  if (richEl && onRichMouseDown) richEl.removeEventListener('mousedown', onRichMouseDown);
      if (onDocKeydown) document.removeEventListener('keydown', onDocKeydown, true);
      // Restore focus
      if (previouslyFocused && previouslyFocused.focus) setTimeout(()=> previouslyFocused.focus(), 0);
    }
    saveBtn.onclick = async ()=>{
      saveBtn.setAttribute('disabled','disabled');
      try {
        await saveWorking();
        close();
      } catch (err) {
        const msg = err?.message || '저장에 실패했습니다.';
        if (String(msg).includes('메모는 그룹당 최대 50개')) openMemoWarningModal(msg, 'warning');
        else if (String(msg).includes('10MB')) openMemoWarningModal(msg, 'warning');
        else if (String(msg).includes('이미지') && String(msg).includes('첨부')) openMemoWarningModal(msg, 'warning');
        else alert(msg);
      } finally {
        saveBtn.removeAttribute('disabled');
      }
    };
  starBtn.setAttribute('aria-pressed', String(!!working.starred));
  starBtn.onclick = ()=>{ working.starred = !working.starred; starBtn.classList.toggle('editing', !!working.starred); starBtn.setAttribute('aria-pressed', String(!!working.starred)); };
    if (cancelBtn) cancelBtn.onclick = ()=>{ close(); };
    if (deleteBtn) deleteBtn.onclick = async ()=>{
      if (isNew || !working.id) { close(); return; }
      deleteBtn.setAttribute('disabled','disabled');
      try {
        await deleteMemo(working.id);
        await refreshGroups();
        await refreshMemos();
        close();
      } catch (err) {
        alert(err?.message || '삭제에 실패했습니다.');
      } finally {
        deleteBtn.removeAttribute('disabled');
      }
    };
  closeEls.forEach(el=> el.addEventListener('click', close));
  // reflect current states
  starBtn.classList.toggle('editing', !!working.starred);
  modal.classList.add('open'); modal.setAttribute('aria-hidden','false');
  // Focus management: focus title on open
  setTimeout(()=> titleEl?.focus(), 0);
  // Focus trap (basic): keep focus within dialog
  const focusableSelectors = 'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])';
  function getFocusable(){ return Array.from(modal.querySelectorAll(focusableSelectors)).filter(el=> !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true'); }
  function onKeydown(e){
    if (e.key === 'Tab'){
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey){
        if (document.activeElement === first){ e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last){ e.preventDefault(); first.focus(); }
      }
    }
  }
  function onGlobalEsc(e){ if (e.key === 'Escape' && modal.classList.contains('open')) close(); }
  modal.addEventListener('keydown', onKeydown);
  document.addEventListener('keydown', onGlobalEsc);
  // Toolbar wiring for textarea (plain text transforms)
  const tbBold = document.getElementById('tb-bold');
  const tbUnderline = document.getElementById('tb-underline');
  const tbStrike = document.getElementById('tb-strike');
  const tbHighlight = document.getElementById('tb-highlight');
  const tbCheckbox = document.getElementById('tb-checkbox');
  const tbPicture = document.getElementById('tb-picture');

  function surroundSelection(left, right){
    const el = bodyEl; if(!el) return;
    const start = el.selectionStart ?? 0; const end = el.selectionEnd ?? 0;
    const val = el.value || '';
    const sel = val.slice(start, end);
    const before = val.slice(0, start);
    const after = val.slice(end);
    const newVal = before + left + sel + right + after;
    el.value = newVal;
    const cursor = start + left.length + sel.length + right.length;
    el.focus();
    el.setSelectionRange(cursor, cursor);
  }
  function insertAtCursor(text){
    const el = bodyEl; if(!el) return;
    const start = el.selectionStart ?? 0; const end = el.selectionEnd ?? 0;
    const val = el.value || '';
    const before = val.slice(0, start);
    const after = val.slice(end);
    el.value = before + text + after;
    const cursor = start + text.length;
    el.focus();
    el.setSelectionRange(cursor, cursor);
  }
  function ensureCheckboxAtLineStart(){
    const el = bodyEl; if(!el) return;
    const pos = el.selectionStart ?? 0;
    const val = el.value || '';
    const lineStart = val.lastIndexOf('\n', Math.max(0, pos - 1)) + 1; // 0 if not found
    const lineEndIdx = val.indexOf('\n', pos);
    const lineEnd = lineEndIdx === -1 ? val.length : lineEndIdx;
    const line = val.slice(lineStart, lineEnd);
    // if already has a checkbox at start, do nothing
    if (/^\s*- \[( |x|X)\]\s/.test(line)) { el.focus(); return; }
    const indent = (line.match(/^\s*/)||[''])[0];
    const prefix = '- [ ] ';
    const newLine = indent + prefix + line.slice(indent.length);
    const newVal = val.slice(0, lineStart) + newLine + val.slice(lineEnd);
    el.value = newVal;
    const caret = lineStart + indent.length + prefix.length;
    el.focus();
    el.setSelectionRange(caret, caret);
    // update preview
    if (typeof renderPreview === 'function') renderPreview();
  }
  // Rich editor inline formatting helpers (operate on #editor-rich)
  function getActiveLineText(){
    if (!richEl) return null;
    const top = getTopLevelLineFromSelection();
    if (!top){ return null; }
    if (top.nodeType === Node.TEXT_NODE){
      // Wrap stray text node into a line-text
  const wrap = document.createElement('div'); wrap.className='line-text'; wrap.setAttribute('spellcheck','false'); wrap.setAttribute('autocomplete','off'); wrap.setAttribute('autocorrect','off'); wrap.setAttribute('autocapitalize','off');
      wrap.textContent = top.textContent || '';
      richEl.replaceChild(wrap, top);
      return wrap;
    }
    if (top.classList && top.classList.contains('checklist-line')){
      const lt = top.querySelector('.line-text');
      return lt || null;
    }
    if (top.classList && top.classList.contains('line-text')) return top;
    // If it's some other element directly under rich, treat as a line-text
    return top;
  }
  function placeCaret(el, offset){
    if (!el) return;
    const range = document.createRange();
    range.setStart(el.firstChild || el, Math.min(offset, (el.firstChild?.length)||0));
    range.collapse(true);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
  }
  function surroundInRich(left, right){
    if (!richEl) return;
    if (!richEl.contains(document.activeElement)) richEl.focus();
  const target = getActiveLineText() || (()=>{ const p=document.createElement('div'); p.className='line-text'; p.setAttribute('spellcheck','false'); p.setAttribute('autocomplete','off'); p.setAttribute('autocorrect','off'); p.setAttribute('autocapitalize','off'); p.textContent=''; richEl.appendChild(p); return p; })();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount===0){
      // Insert empty marker pair
      target.appendChild(document.createTextNode(left+right));
      syncPlainFromRich(); renderPreview();
      // Caret between markers
      placeCaret(target, left.length);
      return;
    }
    let range = sel.getRangeAt(0);
    // Ensure range is inside target; otherwise, move caret to end of target
    if (!target.contains(range.commonAncestorContainer)){
      placeCaretAtEnd(target);
      const newSel = window.getSelection();
      range = newSel.getRangeAt(0);
    }
    const collapsed = range.collapsed;
    const selectedText = collapsed ? '' : range.cloneContents().textContent || '';
    // Replace selection with markers
    range.deleteContents();
    const node = document.createTextNode(left + selectedText + right);
    range.insertNode(node);
    // Move caret: if collapsed, between markers; else after inserted node
    const caretOffset = collapsed ? left.length : (left + selectedText + right).length;
    const r = document.createRange();
    r.setStart(node, Math.min(caretOffset, node.length)); r.collapse(true);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    syncPlainFromRich(); renderPreview();
  }
  function insertMarkdownInRich(text){
    if (!richEl) return;
    if (!richEl.contains(document.activeElement)) richEl.focus();
  const target = getActiveLineText() || (()=>{ const p=document.createElement('div'); p.className='line-text'; p.setAttribute('spellcheck','false'); p.setAttribute('autocomplete','off'); p.setAttribute('autocorrect','off'); p.setAttribute('autocapitalize','off'); p.textContent=''; richEl.appendChild(p); return p; })();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount===0){
      target.appendChild(document.createTextNode(text));
      syncPlainFromRich(); renderPreview();
      placeCaretAtEnd(target);
      return;
    }
    let range = sel.getRangeAt(0);
    if (!target.contains(range.commonAncestorContainer)){
      placeCaretAtEnd(target);
      const newSel = window.getSelection();
      range = newSel.getRangeAt(0);
    }
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    const r = document.createRange(); r.setStart(node, node.length); r.collapse(true);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    syncPlainFromRich(); renderPreview();
  }
  // Prevent toolbar focus-steal (use on* assignment to avoid duplicated listeners across modal opens)
  if (tbBold) tbBold.onmousedown = (e)=> e.preventDefault();
  if (tbUnderline) tbUnderline.onmousedown = (e)=> e.preventDefault();
  if (tbStrike) tbStrike.onmousedown = (e)=> e.preventDefault();
  if (tbHighlight) tbHighlight.onmousedown = (e)=> e.preventDefault();
  if (tbPicture) tbPicture.onmousedown = (e)=> e.preventDefault();

  // Image attach: reuse a single hidden file input
  const imagePicker = _memoImagePicker || (()=>{
    const ip = document.createElement('input');
    ip.type = 'file';
    ip.accept = 'image/*';
    ip.multiple = true;
    ip.style.display = 'none';
    ip.id = 'memo-image-picker';
    document.body.appendChild(ip);
    _memoImagePicker = ip;
    return ip;
  })();
  function readBlobAsDataURL(blob){
    return new Promise((resolve, reject)=>{
      const fr = new FileReader();
      fr.onload = ()=> resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }

  async function fileToOptimizedDataURL(file, opts){
    const maxDim = Number(opts?.maxDim || 1280);
    const quality = Number(opts?.quality || 0.78);
    const maxDataUrlLength = Number(opts?.maxDataUrlLength || 1_200_000); // ~0.9MB payload-ish

    // Use object URL to avoid loading the original file into JS strings.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.loading = 'eager';
      const loaded = new Promise((resolve, reject)=>{
        img.onload = resolve;
        img.onerror = reject;
      });
      img.src = url;
      await loaded;

      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      if (!w || !h) throw new Error('이미지 크기를 확인할 수 없습니다.');

      const scale = Math.min(1, maxDim / Math.max(w, h));
      const targetW = Math.max(1, Math.round(w * scale));
      const targetH = Math.max(1, Math.round(h * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('캔버스를 생성할 수 없습니다.');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, targetW, targetH);

      const blob = await new Promise((resolve)=> canvas.toBlob(resolve, 'image/jpeg', quality));
      if (!blob) throw new Error('이미지 변환에 실패했습니다.');
      const dataUrl = await readBlobAsDataURL(blob);
      const s = String(dataUrl || '');
      if (s.length > maxDataUrlLength) {
        throw new Error('이미지 용량이 너무 큽니다. (자동 압축 후에도 큼)');
      }
      return s;
    } finally {
      try { URL.revokeObjectURL(url); } catch (_) {}
    }
  }
  function insertImageInRich(src, alt){
    if (!richEl) return;
    if (!richEl.contains(document.activeElement)) richEl.focus();
    // Ensure we have a target line
    const target = getActiveLineText() || (()=>{ const p=document.createElement('div'); p.className='line-text'; p.setAttribute('spellcheck','false'); p.setAttribute('autocomplete','off'); p.setAttribute('autocorrect','off'); p.setAttribute('autocapitalize','off'); p.textContent=''; richEl.appendChild(p); return p; })();
    const img = document.createElement('img');
    img.src = src || '';
    img.alt = (alt || '이미지');
    img.className = 'inline-img';
    const sel = window.getSelection();
    if (sel && sel.rangeCount>0 && target.contains(sel.getRangeAt(0).commonAncestorContainer)){
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(img);
      // Place caret after the image
      const r = document.createRange();
      r.setStartAfter(img); r.collapse(true);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    } else {
      target.appendChild(img);
      placeCaretAtEnd(target);
    }
    syncPlainFromRich(); renderPreview();
  }
  // Wire rich formatting using execCommand for immediate visual styling
  function execAndSync(cmd, value=null){
    if (!richEl) return;
    // Preserve existing selection inside editor; only focus if no valid selection is present
    const sel = window.getSelection();
    const hasRangeInEditor = sel && sel.rangeCount > 0 && (richEl.contains(sel.anchorNode) || richEl.contains(sel.focusNode));
    if (!hasRangeInEditor && !richEl.contains(document.activeElement)) {
      richEl.focus();
    }
    document.execCommand(cmd, false, value);
    // ensure content remains inside a line container
    // if richEl has direct text nodes, wrap them
    Array.from(richEl.childNodes).forEach(n=>{
      if (n.nodeType === Node.TEXT_NODE && (n.textContent||'').length){
    const wrap = document.createElement('div'); wrap.className='line-text'; wrap.setAttribute('spellcheck','false'); wrap.setAttribute('autocomplete','off'); wrap.setAttribute('autocorrect','off'); wrap.setAttribute('autocapitalize','off');
        wrap.textContent = n.textContent || '';
        richEl.replaceChild(wrap, n);
      }
    });
    syncPlainFromRich(); renderPreview();
  }
  function toggleBoldRich(){
    if (!richEl) return;
    if (!richEl.contains(document.activeElement)) richEl.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount===0){ return; }
    // If selection spans multiple top-level lines, toggle bold per line
    const getTopChild = (node)=>{
      if (!node) return null;
      if (node === richEl) return richEl.firstChild || null;
      if (node.nodeType === Node.TEXT_NODE && node.parentNode === richEl) return node;
      let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      while (el && el.parentElement && el.parentElement !== richEl){ el = el.parentElement; }
      return (el && el.parentElement === richEl) ? el : null;
    };
    if (!sel.isCollapsed){
      const kids = Array.from(richEl.childNodes);
      const startTop = getTopChild(sel.anchorNode);
      const endTop = getTopChild(sel.focusNode);
      const si = kids.indexOf(startTop);
      const ei = kids.indexOf(endTop);
      if (si !== -1 && ei !== -1 && si !== ei){
        const from = Math.min(si, ei);
        const to = Math.max(si, ei);
        const lines = [];
        for (let i=from; i<=to; i++){
          let node = kids[i];
          let lt = null;
          if (!node) continue;
          if (node.nodeType === Node.TEXT_NODE){
            const wrap = document.createElement('div'); wrap.className='line-text'; wrap.textContent = node.textContent || '';
            richEl.replaceChild(wrap, node); lt = wrap; kids[i] = wrap;
          } else if (node.classList && node.classList.contains('checklist-line')){
            lt = node.querySelector('.line-text');
          } else if (node.classList && node.classList.contains('line-text')){
            lt = node;
          } else if (node.nodeType === Node.ELEMENT_NODE){
            const wrap = document.createElement('div'); wrap.className='line-text';
            while (node.firstChild){ wrap.appendChild(node.firstChild); }
            richEl.replaceChild(wrap, node); lt = wrap; kids[i] = wrap;
          }
          if (lt) lines.push(lt);
        }
        const isFullyBold = (lt)=> lt && lt.childNodes.length===1 && lt.firstChild.nodeType===Node.ELEMENT_NODE && (/^(STRONG|B)$/i).test(lt.firstChild.tagName);
        const allFully = lines.length>0 && lines.every(isFullyBold);
        if (allFully){
          lines.forEach(lt=>{ lt.querySelectorAll('strong,b').forEach(n=> unwrapElement(n)); });
        } else {
          lines.forEach(lt=>{ const strong=document.createElement('strong'); while (lt.firstChild){ strong.appendChild(lt.firstChild); } lt.appendChild(strong); });
        }
        syncPlainFromRich(); renderPreview();
        const last = lines[lines.length-1]; if (last && last.focus){ last.focus(); placeCaretAtEnd(last); }
        return;
      }
    }
    // Fallback: normal toggle within a single line/partial selection
    execAndSync('bold');
  }
  if (tbBold) tbBold.onclick = toggleBoldRich;
  if (tbUnderline) tbUnderline.onclick = ()=> execAndSync('underline');
  if (tbStrike) tbStrike.onclick = ()=> execAndSync('strikeThrough');
  function findAncestorWithClass(node, cls){
    let el = node && node.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    while (el){ if (el.classList && el.classList.contains(cls)) return el; el = el.parentElement; }
    return null;
  }
  function unwrapElement(el){
    if (!el || !el.parentNode) return;
    const parent = el.parentNode;
    while (el.firstChild){ parent.insertBefore(el.firstChild, el); }
    parent.removeChild(el);
  }
  function normalizeInlineHighlightToClass(root){
    if (!root) return;
    const nodes = root.querySelectorAll('[style]');
    nodes.forEach(n=>{
      const bg = n.style && (n.style.backgroundColor || n.style.background || '');
      if (!bg) return;
      const isYellow = /rgb\(\s*255\s*,\s*255\s*,\s*0\s*\)|#?ff0|yellow/i.test(bg);
      // Don't convert top-level line containers; only inline elements
      const isLineContainer = n.classList && (n.classList.contains('line-text') || n.classList.contains('checklist-line'));
      if (isYellow && !isLineContainer){
        const span = document.createElement('span'); span.className='hl';
        // move children
        while (n.firstChild){ span.appendChild(n.firstChild); }
        n.replaceWith(span);
      }
    });
  }
  function toggleHighlightRich(){
    if (!richEl) return;
    if (!richEl.contains(document.activeElement)) richEl.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount===0){ return; }
    // If selection spans multiple top-level lines, toggle per line
    const getTopChild = (node)=>{
      if (!node) return null;
      if (node === richEl) return richEl.firstChild || null;
      if (node.nodeType === Node.TEXT_NODE && node.parentNode === richEl) return node;
      let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      while (el && el.parentElement && el.parentElement !== richEl){ el = el.parentElement; }
      return (el && el.parentElement === richEl) ? el : null;
    };
    if (!sel.isCollapsed){
      const kids = Array.from(richEl.childNodes);
      const startTop = getTopChild(sel.anchorNode);
      const endTop = getTopChild(sel.focusNode);
      const si = kids.indexOf(startTop);
      const ei = kids.indexOf(endTop);
      if (si !== -1 && ei !== -1 && si !== ei){
        const from = Math.min(si, ei);
        const to = Math.max(si, ei);
        const lines = [];
        for (let i=from; i<=to; i++){
          let node = kids[i];
          let lt = null;
          if (node.nodeType === Node.TEXT_NODE){
            const wrap = document.createElement('div'); wrap.className='line-text'; wrap.textContent = node.textContent || '';
            richEl.replaceChild(wrap, node); lt = wrap; kids[i] = wrap;
          } else if (node.classList && node.classList.contains('checklist-line')){
            lt = node.querySelector('.line-text');
          } else if (node.classList && node.classList.contains('line-text')){
            lt = node;
          } else if (node.nodeType === Node.ELEMENT_NODE){
            const wrap = document.createElement('div'); wrap.className='line-text';
            while (node.firstChild){ wrap.appendChild(node.firstChild); }
            richEl.replaceChild(wrap, node); lt = wrap; kids[i] = wrap;
          }
          if (lt) lines.push(lt);
        }
        const isFullyHL = (lt)=> lt && lt.childNodes.length===1 && lt.firstChild.nodeType===Node.ELEMENT_NODE && lt.firstChild.classList.contains('hl');
        const allFully = lines.length>0 && lines.every(isFullyHL);
        if (allFully){
          lines.forEach(lt=>{ lt.querySelectorAll('span.hl').forEach(n=> unwrapElement(n)); });
        } else {
          lines.forEach(lt=>{ const span=document.createElement('span'); span.className='hl'; while (lt.firstChild){ span.appendChild(lt.firstChild); } lt.appendChild(span); });
        }
        syncPlainFromRich(); renderPreview();
        const last = lines[lines.length-1]; if (last && last.focus){ last.focus(); placeCaretAtEnd(last); }
        return;
      }
    }
    if (sel.isCollapsed){ return; }
    // If selection is inside an existing highlighted span, unwrap it
    const anchorHL = findAncestorWithClass(sel.anchorNode, 'hl');
    const focusHL = findAncestorWithClass(sel.focusNode, 'hl');
    if (anchorHL && anchorHL === focusHL){
      unwrapElement(anchorHL);
      syncPlainFromRich(); renderPreview();
      return;
    }
    // Else apply highlight via execCommand, then normalize to class
    const cmd = document.queryCommandSupported && document.queryCommandSupported('hiliteColor') ? 'hiliteColor' : 'backColor';
    document.execCommand(cmd, false, 'yellow');
    normalizeInlineHighlightToClass(richEl);
    syncPlainFromRich(); renderPreview();
  }
  if (tbHighlight) tbHighlight.onclick = toggleHighlightRich;
  function getTopLevelLineFromSelection(){
    if (!richEl) return null;
    const sel = window.getSelection();
    const node = sel && sel.anchorNode ? sel.anchorNode : null;
    if (!node) return null;
    // If selection is on the editor itself, use its first child if any
    if (node === richEl) return richEl.firstChild || null;
    // If a text node is directly under the editor, return that text node
    if (node.nodeType === Node.TEXT_NODE && node.parentNode === richEl) return node;
    // Otherwise, walk up to the direct child under richEl
    let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    while (el && el.parentElement && el.parentElement !== richEl){ el = el.parentElement; }
    if (!el) return null;
    // Only return if this is actually a direct child of richEl
    return (el.parentElement === richEl) ? el : null; // could be checklist-line or line-text or null
  }
  function placeCaretAtEnd(el){
    if (!el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(range);
  }
  function placeCaretAtStart(el){
    if (!el) return;
    const range = document.createRange();
    if (el.firstChild) {
      range.setStart(el.firstChild, 0);
    } else {
      range.setStart(el, 0);
    }
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(range);
  }
  function createLineText(){
    const p = document.createElement('div');
    p.className = 'line-text';
    p.setAttribute('spellcheck','false');
    p.setAttribute('autocomplete','off');
    p.setAttribute('autocorrect','off');
    p.setAttribute('autocapitalize','off');
    return p;
  }
  function createChecklistLine(){
    const row = document.createElement('div'); row.className='checklist-line';
    const box = document.createElement('span'); box.className='checkbox';
  const txt = createLineText();
  if (!txt.firstChild) txt.appendChild(document.createTextNode('\u00A0'));
    row.appendChild(box); row.appendChild(txt);
    box.addEventListener('click', ()=>{ box.classList.toggle('checked'); syncPlainFromRich(); /*renderPreview();*/ });
    return { row, txt };
  }
  // Ensure there is a caret and a valid line inside the editor
  function ensureCaretInEditor(){
    if (!richEl) return;
    const sel = window.getSelection();
    const hasRange = sel && sel.rangeCount > 0;
    const inside = hasRange && richEl.contains(sel.anchorNode);
    if (inside) return; // nothing to do
    // If no lines exist, create one
    if (!richEl.firstChild){
      const p = createLineText(); p.textContent=''; richEl.appendChild(p); p.focus(); placeCaretAtStart(p); return;
    }
    // Focus the last editable line
    let last = richEl.lastChild;
    if (last.classList && last.classList.contains('checklist-line')){
      const txt = last.querySelector('.line-text');
      if (txt){ txt.focus(); placeCaretAtEnd(txt); return; }
    }
    if (last.classList && last.classList.contains('line-text')){
      last.focus(); placeCaretAtEnd(last); return;
    }
    // Wrap stray element/text as a line
    if (last.nodeType === Node.TEXT_NODE || (last.nodeType === Node.ELEMENT_NODE && !(last.classList.contains('line-text')||last.classList.contains('checklist-line')))){
      const wrap = createLineText();
      while (last.firstChild){ wrap.appendChild(last.firstChild); }
      if (last.nodeType === Node.TEXT_NODE) wrap.textContent = last.textContent || '';
      richEl.replaceChild(wrap, last); wrap.focus(); placeCaretAtEnd(wrap); return;
    }
  }
  function splitAtCaret(){
  const sel = window.getSelection();
  if (!sel || sel.rangeCount===0) return false;
    let range = sel.getRangeAt(0);
    // If caret is on the container (#editor-rich), move it into the proper child line
    if (range.startContainer === richEl){
      let idx = Math.max(0, Math.min(range.startOffset, (richEl.childNodes.length ? richEl.childNodes.length - 1 : 0)));
      let child = richEl.childNodes[idx] || richEl.lastChild;
      if (child){
        if (child.nodeType === Node.TEXT_NODE){
          const wrap = createLineText(); wrap.textContent = child.textContent || '';
          richEl.replaceChild(wrap, child); child = wrap;
        }
        let targetLT = null;
        if (child.nodeType === Node.ELEMENT_NODE){
          if (child.classList.contains('checklist-line')) targetLT = child.querySelector('.line-text');
          else if (child.classList.contains('line-text')) targetLT = child;
          else {
            const wrap = createLineText(); while (child.firstChild){ wrap.appendChild(child.firstChild); }
            richEl.replaceChild(wrap, child); targetLT = wrap;
          }
        }
        if (targetLT){ placeCaretAtStart(targetLT); range = window.getSelection().getRangeAt(0); }
      }
    }
    // If selection is not collapsed, delete contents first
    if (!sel.isCollapsed){ range.deleteContents(); sel.removeAllRanges(); sel.addRange(range); }
    // Find the current line-text container
    const getClosestLineText = (node)=>{
      const el = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
      return el ? el.closest('.line-text') : null;
    };
    let lineText = getClosestLineText(range.startContainer);
    if (!lineText){
      // Fallback: normalize the top child under richEl
      let top = getTopLevelLineFromSelection();
      if (top && top.nodeType === Node.TEXT_NODE){
        const wrap = createLineText(); wrap.textContent = top.textContent || '';
        richEl.replaceChild(wrap, top); lineText = wrap;
        // restore caret in the new wrapper
        placeCaret(wrap, range.startOffset || 0);
        range = window.getSelection().getRangeAt(0);
      } else if (top && top.nodeType === Node.ELEMENT_NODE){
        if (top.classList.contains('checklist-line')){
          lineText = top.querySelector('.line-text');
        } else if (top.classList.contains('line-text')){
          lineText = top;
        } else {
          const wrap = createLineText();
          while (top.firstChild){ wrap.appendChild(top.firstChild); }
          richEl.replaceChild(wrap, top); lineText = wrap;
          placeCaretAtEnd(lineText); range = window.getSelection().getRangeAt(0);
        }
      } else {
        const p = createLineText(); p.textContent = '';
        richEl.appendChild(p); lineText = p; placeCaretAtStart(p); syncPlainFromRich(); return true;
      }
    }
    if (!lineText.contains(range.startContainer)){
      // ensure range inside current lineText
      placeCaretAtEnd(lineText); range = window.getSelection().getRangeAt(0);
    }
    const isChecklistLine = lineText.parentElement && lineText.parentElement.classList.contains('checklist-line');
    const r2 = document.createRange(); r2.selectNodeContents(lineText);
    r2.setStart(range.startContainer, range.startOffset);
    const rightFrag = r2.extractContents();
    let newContainer, newText;
    if (isChecklistLine){
      const pair = createChecklistLine(); newContainer = pair.row; newText = pair.txt;
    } else {
      newText = createLineText(); newContainer = newText;
    }
    const containerNode = isChecklistLine ? lineText.parentElement : lineText;
    const after = containerNode.nextSibling; if (after) richEl.insertBefore(newContainer, after); else richEl.appendChild(newContainer);
    if (rightFrag && rightFrag.childNodes.length){ newText.appendChild(rightFrag); }
    newText.focus(); placeCaretAtStart(newText);
    syncPlainFromRich();
    return true;
  }
  // Fallback: force a new paragraph under current top-level line
  function forceParagraphBreak(){
    let top = getTopLevelLineFromSelection();
    // If nothing, create first empty line
    if (!top){ const p = createLineText(); richEl.appendChild(p); p.focus(); placeCaretAtStart(p); syncPlainFromRich(); return; }
  // Even if current is a checklist-line, fallback 줄바꿈은 항상 일반 줄로 생성
    // Ensure line-text
    let line = top;
    if (!(line.classList && line.classList.contains('line-text'))){
      const wrap = createLineText(); while (line.firstChild){ wrap.appendChild(line.firstChild); }
      richEl.replaceChild(wrap, line); line = wrap;
    }
    const newLine = createLineText();
    const after = line.nextSibling; if (after) richEl.insertBefore(newLine, after); else richEl.appendChild(newLine);
    newLine.focus(); placeCaretAtStart(newLine); syncPlainFromRich();
  }
  function ensureCheckboxAtLineStartRich(){
    if (!richEl) return;
    // Keep caret in editor if toolbar button steals focus
    if (!richEl.contains(document.activeElement)) {
      richEl.focus();
    }
    // Ensure caret actually exists within editor
    ensureCaretInEditor();
    const sel = window.getSelection();
    // Helper: climb up to a direct child of richEl
    const getTopChild = (node)=>{
      if (!node) return null;
      if (node === richEl) return richEl.firstChild || null;
      if (node.nodeType === Node.TEXT_NODE && node.parentNode === richEl) return node;
      let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      while (el && el.parentElement && el.parentElement !== richEl){ el = el.parentElement; }
      return el && el.parentElement === richEl ? el : null;
    };
    // If multi-line selection, toggle across all spanned lines
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed){
      const kids = Array.from(richEl.childNodes);
      const startTop = getTopChild(sel.anchorNode);
      const endTop = getTopChild(sel.focusNode);
      const si = Math.max(0, kids.indexOf(startTop));
      const ei = Math.max(0, kids.indexOf(endTop));
      if (si !== -1 && ei !== -1){
        const from = Math.min(si, ei);
        const to = Math.max(si, ei);
        // Collect stable references to nodes to avoid index issues during replace
        const targets = [];
        for (let i = from; i <= to; i++) targets.push(richEl.childNodes[i]);
        // First normalize each to either .line-text or .checklist-line as a direct child
        for (let i = 0; i < targets.length; i++){
          let node = targets[i];
          if (!node) continue;
          if (node.nodeType === Node.TEXT_NODE){
            const wrap = document.createElement('div'); wrap.className='line-text';
            wrap.setAttribute('spellcheck','false'); wrap.setAttribute('autocomplete','off'); wrap.setAttribute('autocorrect','off'); wrap.setAttribute('autocapitalize','off');
            wrap.textContent = node.textContent || '';
            richEl.replaceChild(wrap, node); targets[i] = wrap; continue;
          }
          if (node.nodeType === Node.ELEMENT_NODE && !(node.classList.contains('line-text') || node.classList.contains('checklist-line'))){
            const wrap = document.createElement('div'); wrap.className='line-text';
            wrap.setAttribute('spellcheck','false'); wrap.setAttribute('autocomplete','off'); wrap.setAttribute('autocorrect','off'); wrap.setAttribute('autocapitalize','off');
            while (node.firstChild){ wrap.appendChild(node.firstChild); }
            richEl.replaceChild(wrap, node); targets[i] = wrap; continue;
          }
        }
        // Determine if all selected are already checklists
        const allChecklist = targets.length>0 && targets.every(n => n && n.nodeType===Node.ELEMENT_NODE && n.classList.contains('checklist-line'));
        let lastTextEl = null;
        if (allChecklist){
          // Unwrap all selected checklist lines back to plain .line-text
          targets.forEach(node => {
            if (!node || !node.classList || !node.classList.contains('checklist-line')) return;
            let txt = node.querySelector('.line-text');
            if (!txt){ txt = document.createElement('div'); txt.className='line-text'; }
            txt.setAttribute('spellcheck','false');
            txt.setAttribute('autocomplete','off');
            txt.setAttribute('autocorrect','off');
            txt.setAttribute('autocapitalize','off');
            node.replaceWith(txt);
            lastTextEl = txt;
          });
        } else {
          // Convert any non-checklist .line-text into checklist-line; keep existing checklists
          targets.forEach(node => {
            if (!node) return;
            if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('line-text')){
              const row = document.createElement('div'); row.className='checklist-line';
              const box = document.createElement('span'); box.className='checkbox';
              richEl.replaceChild(row, node);
              row.appendChild(box);
              row.appendChild(node);
              box.addEventListener('click', ()=>{ box.classList.toggle('checked'); syncPlainFromRich(); /*renderPreview();*/ });
              lastTextEl = node;
            }
          });
        }
        syncPlainFromRich(); /*renderPreview();*/
        if (lastTextEl && lastTextEl.focus){ lastTextEl.focus(); placeCaretAtEnd(lastTextEl); }
        return;
      }
    }
    // Single-line (collapsed) selection: toggle on/off
    let line = getTopLevelLineFromSelection();
    // If selection is a text node directly under richEl, wrap it into a line-text
    if (line && line.nodeType === Node.TEXT_NODE){
  const wrap = document.createElement('div'); wrap.className='line-text';
      wrap.textContent = line.textContent || '';
      richEl.replaceChild(wrap, line);
      line = wrap;
    }
    if (!line){
      // If editor has a stray text node as firstChild, wrap it
      if (richEl.firstChild && richEl.firstChild.nodeType === Node.TEXT_NODE && (richEl.firstChild.textContent||'').length){
        const wrap = document.createElement('div'); wrap.className='line-text'; wrap.contentEditable='true';
        wrap.textContent = richEl.firstChild.textContent || '';
        richEl.replaceChild(wrap, richEl.firstChild);
        line = wrap;
      } else {
        // create a new empty line
  const p = document.createElement('div'); p.className='line-text'; p.setAttribute('spellcheck','false'); p.setAttribute('autocomplete','off'); p.setAttribute('autocorrect','off'); p.setAttribute('autocapitalize','off'); p.textContent='';
        richEl.appendChild(p); line = p;
      }
    }
    // If the target is not a .line-text yet (e.g., a <strong> directly under rich), wrap it
    if (line.nodeType === Node.ELEMENT_NODE && !(line.classList && (line.classList.contains('line-text') || line.classList.contains('checklist-line')))){
  const wrapper = document.createElement('div'); wrapper.className='line-text'; wrapper.setAttribute('spellcheck','false'); wrapper.setAttribute('autocomplete','off'); wrapper.setAttribute('autocorrect','off'); wrapper.setAttribute('autocapitalize','off');
      while (line.firstChild){ wrapper.appendChild(line.firstChild); }
      richEl.replaceChild(wrapper, line);
      line = wrapper;
    }
    if (line.classList && line.classList.contains('checklist-line')){
      // Toggle off: unwrap checklist back to a plain line
      let txt = line.querySelector('.line-text');
      if (!txt){
        txt = document.createElement('div');
        txt.className = 'line-text';
      }
      txt.setAttribute('spellcheck','false');
      txt.setAttribute('autocomplete','off');
      txt.setAttribute('autocorrect','off');
      txt.setAttribute('autocapitalize','off');
      line.replaceWith(txt);
      syncPlainFromRich(); renderPreview();
      if (txt.focus) txt.focus();
      placeCaretAtEnd(txt);
      return;
    }
  // Wrap line-text into checklist-line with a checkbox
  const row = document.createElement('div'); row.className='checklist-line';
  const box = document.createElement('span'); box.className='checkbox';
  // Replace first, then move the line inside row to avoid detaching issues
  richEl.replaceChild(row, line);
  row.appendChild(box);
  row.appendChild(line);
  box.addEventListener('click', ()=>{ box.classList.toggle('checked'); syncPlainFromRich(); /*renderPreview();*/ });
  syncPlainFromRich(); /*renderPreview();*/
    // restore caret inside the text segment
  if (line.focus) line.focus();
  placeCaretAtEnd(line);
  }
  // Prevent toolbar button from stealing focus so selection stays in editor
  if (tbCheckbox) tbCheckbox.onmousedown = (e)=> e.preventDefault();
  if (tbCheckbox) tbCheckbox.onclick = ensureCheckboxAtLineStartRich;
  if (richEl) richEl.oninput = ()=>{ syncPlainFromRich(); renderPreview(); };
  // Handle Enter to split into a new paragraph (always split; checklist-aware)
  onEnterKeydown = (e)=>{
    const isEnterKey = (e.key === 'Enter' || e.code === 'Enter' || e.keyCode === 13 || e.which === 13);
    // IME 조합 중에는 건드리지 않음
    if (e.isComposing) return;
    if (!isEnterKey || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
    e.preventDefault(); e.stopPropagation();
    ensureCaretInEditor();
    try{
      const ok = splitAtCaret();
      if (!ok) forceParagraphBreak();
    } catch { forceParagraphBreak(); }
  };
  richEl?.addEventListener('keydown', onEnterKeydown, true);
  // Safari/Chrome beforeinput for insertParagraph
  onBeforeInput = (e)=>{
    // IME 조합 중에는 기본 동작 유지
    if (e.isComposing) return;
    if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak'){
      e.preventDefault();
      ensureCaretInEditor();
      try{
        const ok = splitAtCaret();
        if (!ok) forceParagraphBreak();
      } catch { forceParagraphBreak(); }
    }
  };
  richEl?.addEventListener('beforeinput', onBeforeInput, true);
  // Document-level capture to catch any missed Enter events inside the editor
  onDocKeydown = (e)=>{
    if (!richEl) return;
    if (!richEl.contains(e.target)) return;
    if (e.isComposing) return;
    const isEnter = (e.key === 'Enter' || e.code === 'Enter' || e.keyCode === 13 || e.which === 13);
    if (!isEnter || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
    e.preventDefault(); e.stopImmediatePropagation();
    ensureCaretInEditor();
    try{
      const ok = splitAtCaret();
      if (!ok) forceParagraphBreak();
    } catch { forceParagraphBreak(); }
  };
  document.addEventListener('keydown', onDocKeydown, true);
  if (tbPicture) tbPicture.onclick = ()=>{
    imagePicker.value = '';
    imagePicker.click();
  };
  imagePicker.onchange = async ()=>{
    const files = Array.from(imagePicker.files || []);
    for (const f of files){
      try{
        if (!String(f?.type || '').toLowerCase().startsWith('image/')) {
          openMemoWarningModal('이미지 파일만 첨부할 수 있습니다.', 'warning');
          continue;
        }
        const dataUrl = await fileToOptimizedDataURL(f, { maxDim: 1280, quality: 0.78, maxDataUrlLength: 1_200_000 });
        insertImageInRich(dataUrl, f.name);
      } catch (err) {
        const msg = err?.message || '이미지 첨부에 실패했습니다.';
        if (String(msg).includes('이미지')) openMemoWarningModal(msg, 'warning');
        else alert(msg);
      }
    }
  };

  // Checklist preview: parse and render interactive items
  const preview = document.getElementById('editor-preview');
  function parseChecklist(text){
    const lines = (text||'').split(/\r?\n/);
    return lines.map((line, idx)=>{
      const m = /^\s*- \[( |x|X)\]\s?(.*)$/.exec(line);
      if (!m) return null;
      return { index: idx, checked: m[1].toLowerCase()==='x', text: m[2]||'' };
    }).filter(Boolean);
  }
  function renderPreview(){
    if (!preview) return;
    const items = parseChecklist(bodyEl.value);
    if (items.length===0){ preview.innerHTML=''; return; }
    preview.innerHTML = '';
    items.forEach(item=>{
      const row = document.createElement('div'); row.className='checklist-item';
      const box = document.createElement('span'); box.className='checkbox'+(item.checked?' checked':'');
      const txt = document.createElement('span'); txt.className='item-text'; txt.textContent = item.text;
      box.addEventListener('click', ()=>{
        // toggle source line and re-render
        const lines = (bodyEl.value||'').split(/\r?\n/);
        const line = lines[item.index]||'';
        if (item.checked){
          lines[item.index] = line.replace(/^- \[(x|X)\]/,'- [ ]');
        } else {
          lines[item.index] = line.replace(/^- \[ \]/,'- [x]');
        }
        bodyEl.value = lines.join('\n');
        renderPreview();
      });
      row.appendChild(box); row.appendChild(txt);
      preview.appendChild(row);
    });
  }
  // Inline rich editor helpers
  function setRichFromPlain(text){
    if (!richEl) return;
    const decoded = decodeHtmlEntities(text || '');
    const lines = decoded.split(/\r?\n/);
    richEl.innerHTML = '';
    lines.forEach(line=>{
      const m = /^\s*- \[( |x|X)\]\s?(.*)$/.exec(line);
      if (m){
        const row = document.createElement('div'); row.className='checklist-line';
        const box = document.createElement('span'); box.className='checkbox'+(m[1].toLowerCase()==='x'?' checked':'');
  const txt = document.createElement('div'); txt.className='line-text'; txt.setAttribute('spellcheck','false'); txt.setAttribute('autocomplete','off'); txt.setAttribute('autocorrect','off'); txt.setAttribute('autocapitalize','off');
        // Render inline markdown markers as styled HTML for visual editing
        txt.innerHTML = renderInlineMarkdownToHTML(m[2]||'');
        box.addEventListener('click', ()=>{ box.classList.toggle('checked'); syncPlainFromRich(); renderPreview(); });
        row.appendChild(box); row.appendChild(txt); richEl.appendChild(row);
      } else {
  const p = document.createElement('div'); p.className='line-text'; p.setAttribute('spellcheck','false'); p.setAttribute('autocomplete','off'); p.setAttribute('autocorrect','off'); p.setAttribute('autocapitalize','off');
        p.innerHTML = renderInlineMarkdownToHTML(line);
        richEl.appendChild(p);
      }
    });
  }
  function getPlainFromRich(){
    if (!richEl) return bodyEl.value || '';
    const parts = [];
    Array.from(richEl.childNodes).forEach(node=>{
      if (node.nodeType === Node.ELEMENT_NODE){
        const el = node;
        if (el.classList.contains('checklist-line')){
          const checked = !!el.querySelector('.checkbox.checked');
          const text = extractInlineMarkdownFromHTML(el.querySelector('.line-text'));
          const oneLine = decodeHtmlEntities(text || '').replace(/\r?\n+/g, ' ').trim();
          parts.push(`- [${checked?'x':' '}] ${oneLine}`);
        } else {
          const text = decodeHtmlEntities(extractInlineMarkdownFromHTML(el));
          // If paste inserted <br>/<div> inside a single line, preserve by splitting into true memo lines
          const splitLines = String(text || '').split(/\r?\n/);
          splitLines.forEach(l => parts.push(l));
        }
      } else if (node.nodeType === Node.TEXT_NODE){
        const t = decodeHtmlEntities(node.textContent || '');
        String(t).split(/\r?\n/).forEach(l => parts.push(l));
      }
    });
    return parts.join('\n');
  }
  // Convert inline markdown to simple HTML tags for rich display
  function renderInlineMarkdownToHTML(src){
    let s = src || '';
    // Escape basic HTML to avoid injection, then unescape our formatting later
    s = s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    // Images ![alt](src) -> <img>
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, url)=>{
      const a = (alt||'').replace(/"/g,'&quot;');
      const u = (url||'').replace(/"/g,'&quot;');
      return `<img src="${u}" alt="${a}" class="inline-img">`;
    });
    // Bold **text**
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1<\/strong>');
    // Underline __text__
    s = s.replace(/__(.+?)__/g, '<u>$1<\/u>');
    // Strike ~~text~~
    s = s.replace(/~~(.+?)~~/g, '<s>$1<\/s>');
    // Highlight ==text== -> span with background
    s = s.replace(/==(.+?)==/g, '<span class="hl">$1<\/span>');
    return s;
  }
  // Extract markdown markers from styled HTML
  function extractInlineMarkdownFromHTML(el){
    if (!el) return '';
    // Clone to avoid live edits
    const clone = el.cloneNode(true);
    // Replace formatting elements with text nodes so entities remain decoded
    clone.querySelectorAll('img').forEach(n=>{
      const alt = (n.getAttribute('alt')||'').replace(/\]/g,'');
      const src = n.getAttribute('src')||'';
      n.replaceWith(document.createTextNode(`![${alt}](${src})`));
    });
    clone.querySelectorAll('span.hl').forEach(n=>{ n.replaceWith(document.createTextNode('==' + (n.textContent||'') + '==')); });
    clone.querySelectorAll('strong, b').forEach(n=>{ n.replaceWith(document.createTextNode('**' + (n.textContent||'') + '**')); });
    clone.querySelectorAll('u').forEach(n=>{ n.replaceWith(document.createTextNode('__' + (n.textContent||'') + '__')); });
    clone.querySelectorAll('s, strike, del').forEach(n=>{ n.replaceWith(document.createTextNode('~~' + (n.textContent||'') + '~~')); });

    // Extract text preserving explicit line breaks from paste (<br>, nested <div>/<p>, etc.)
    const extractTextWithNewlines = (node)=>{
      let out = '';
      Array.from(node.childNodes || []).forEach(child=>{
        if (child.nodeType === Node.TEXT_NODE){
          out += child.nodeValue || '';
          return;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) return;
        const tag = (child.tagName || '').toUpperCase();
        if (tag === 'BR'){
          out += '\n';
          return;
        }
        out += extractTextWithNewlines(child);
        if (tag === 'DIV' || tag === 'P' || tag === 'LI') out += '\n';
      });
      return out;
    };

    let text = extractTextWithNewlines(clone);
    text = String(text || '').replace(/\r/g,'').replace(/\u00A0/g,' ');
    text = text.replace(/\n+$/,'');
    // Decode legacy entity-escaped text (&gt; etc.) back to real characters
    text = decodeHtmlEntities(text);
    // Preserve leading spaces (indentation) while still removing trailing whitespace
    return text.trimEnd();
  }
  function syncPlainFromRich(){ bodyEl.value = getPlainFromRich(); }
  function insertAtCursorToRich(text){
    // naive: append a new line with the text
    if (!richEl) return;
  const el = document.createElement('div'); el.className='line-text'; el.setAttribute('spellcheck','false'); el.setAttribute('autocomplete','off'); el.setAttribute('autocorrect','off'); el.setAttribute('autocapitalize','off'); el.textContent = text;
    richEl.appendChild(el);
    syncPlainFromRich(); renderPreview();
  }
  // initialize rich from plain (컨테이너는 contenteditable 유지해 다중 줄 드래그 허용)
  setRichFromPlain(bodyEl.value);
  syncPlainFromRich();
  renderPreview();
  }

  document.addEventListener('DOMContentLoaded', function(){
  // Sync avatar + bio and enable edits (same pattern as member/password pages)
  const avatar = document.querySelector('.admin-page .avatar');
  const headerIcon = document.querySelector('#btn-account .header-icon');
  const empNo = (document.querySelector('#btn-account')?.getAttribute('data-emp-no') || '').trim();
  const bioP = document.querySelector('.admin-page .bio');
  const picker = document.getElementById('profile-picker');
  const pickerGrid = picker?.querySelector('.picker-grid');
  const MAX_BIO = 80;
  const names = ['001-boy','002-girl','003-boy','004-girl','005-man','006-girl','007-boy','008-girl','009-boy','010-girl','011-man','012-girl','013-man','014-girl','015-boy','016-girl','017-boy','018-girl','019-boy','020-girl'];
  const profileImages = names.map(n => `/static/image/svg/profil/${n}.svg`);
  function applyProfileImage(src){ if (avatar && src) avatar.style.backgroundImage = `url('${src}')`; if (headerIcon&&src){ headerIcon.src=src; headerIcon.classList.add('header-avatar-icon'); } }
  try{ const s=localStorage.getItem(LS_IMG) || localStorage.getItem(LS_IMG_GLOBAL); if(s) applyProfileImage(s);}catch{}
  // Bio editing is handled on /settings/profile only.
  function openPicker(){ if(!picker||!pickerGrid) return; if(!pickerGrid.hasChildNodes()){ profileImages.forEach(src=>{ const btn=document.createElement('button'); btn.type='button'; btn.className='picker-item'; const img=document.createElement('img'); img.src=src; img.alt='프로필 이미지'; btn.appendChild(img); btn.addEventListener('click', async ()=>{ applyProfileImage(src); try{ localStorage.setItem(LS_IMG_GLOBAL,src); if(empNoForAvatar) localStorage.setItem(LS_IMG,src); }catch{} try{ await updateMeProfile({ profile_image: src }); window.dispatchEvent(new CustomEvent('blossom:avatarChanged', { detail: { src, empNo: empNoForAvatar } })); }catch(err){ alert(err?.message || '이미지 저장에 실패했습니다.'); } closePicker(); }); pickerGrid.appendChild(btn); }); } picker.classList.add('open'); picker.setAttribute('aria-hidden','false'); }
  function closePicker(){ picker?.classList.remove('open'); picker?.setAttribute('aria-hidden','true'); }
  avatar?.addEventListener('click', openPicker);
  document.querySelector('[data-picker-close]')?.addEventListener('click', closePicker);
  picker?.addEventListener('click', (e)=>{ if (e.target && e.target.hasAttribute('data-picker-close')) closePicker(); });
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && picker?.classList.contains('open')) closePicker(); });


  async function updateMeProfile(payload) {
    const res = await fetch('/api/me/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload || {}),
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.success !== true) {
      const msg = (data && data.message) ? data.message : '저장에 실패했습니다.';
      throw new Error(msg);
    }
    return data.item || {};
  }

  const bioOpenBtn = document.getElementById('btn-edit-bio');
  const bioRow = document.querySelector('.admin-page .bio-row');
  let bioEditorState = null;

  function createBioEditor(initialText) {
    const wrap = document.createElement('div');
    wrap.className = 'bio-inline-editor';
    const input = document.createElement('input');
    input.type = 'text';
    let init = (initialText || '').replace(/\r?\n+/g, ' ').trim();
    if (init.length > MAX_BIO) init = init.slice(0, MAX_BIO);
    input.value = init;
    input.setAttribute('aria-label', '메시지 입력');
    input.setAttribute('maxlength', String(MAX_BIO));
    input.className = 'bio-input';
    function syncSize(){ input.size = Math.max(10, (input.value || '').length); }
    syncSize();
    input.addEventListener('input', () => {
      if (input.value.length > MAX_BIO) input.value = input.value.slice(0, MAX_BIO);
      syncSize();
    });
    wrap.append(input);
    return { wrap, input };
  }

  function restoreBioEditBtn() {
    if (!bioOpenBtn) return;
    const icon = bioOpenBtn.querySelector('img');
    if (icon) {
      icon.src = '/static/image/svg/admin/free-icon-pen-square.svg';
      icon.alt = '메시지 수정';
    }
    bioOpenBtn.title = '메시지 수정';
    bioOpenBtn.setAttribute('aria-label', '메시지 수정');
    delete bioOpenBtn.dataset.mode;
    document.getElementById('btn-cancel-bio')?.remove();
  }

  function openInlineBioEditor() {
    if (!bioRow || !bioP || !bioOpenBtn) return;
    if (bioRow.querySelector('.bio-inline-editor')) return;

    const { wrap, input } = createBioEditor(bioP.textContent?.trim() || '');
    bioP.style.display = 'none';
    bioRow.insertBefore(wrap, bioOpenBtn);
    setTimeout(() => input.focus(), 0);

    const icon = bioOpenBtn.querySelector('img');
    if (icon) { icon.src = '/static/image/svg/save.svg'; icon.alt = '저장'; }
    bioOpenBtn.title = '저장';
    bioOpenBtn.setAttribute('aria-label', '저장');
    bioOpenBtn.dataset.mode = 'save';

    let cancelBtn = document.getElementById('btn-cancel-bio');
    if (!cancelBtn) {
      cancelBtn = document.createElement('button');
      cancelBtn.id = 'btn-cancel-bio';
      cancelBtn.type = 'button';
      cancelBtn.className = 'cancel-inline-btn';
      cancelBtn.title = '취소';
      cancelBtn.setAttribute('aria-label', '취소');
      const img = document.createElement('img');
      img.src = '/static/image/svg/admin/free-icon-undo.svg';
      img.alt = '취소';
      img.className = 'cancel-icon';
      cancelBtn.appendChild(img);
      bioRow.appendChild(cancelBtn);
    }

    async function applySave() {
      if (!bioP) return;
      let oneLine = (input.value || '').replace(/\r?\n+/g, ' ').trim();
      if (oneLine.length > MAX_BIO) oneLine = oneLine.slice(0, MAX_BIO);
      bioOpenBtn.setAttribute('disabled', 'disabled');
      try {
        await updateMeProfile({ motto: oneLine });
        bioP.textContent = oneLine;
        bioP.style.display = '';
        wrap.remove();
        restoreBioEditBtn();
        bioOpenBtn.focus();
        bioEditorState = null;
      } catch (err) {
        alert(err?.message || '저장에 실패했습니다.');
      } finally {
        bioOpenBtn.removeAttribute('disabled');
      }
    }

    function applyCancel() {
      bioP.style.display = '';
      wrap.remove();
      restoreBioEditBtn();
      bioOpenBtn.focus();
      bioEditorState = null;
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') applyCancel();
      else if (e.key === 'Enter') { e.preventDefault(); applySave(); }
    });
    cancelBtn.addEventListener('click', applyCancel);
    bioEditorState = { applySave, applyCancel };
  }

  bioOpenBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    if (bioOpenBtn.dataset.mode === 'save' && bioEditorState?.applySave) bioEditorState.applySave();
    else openInlineBioEditor();
  });
  // Memo: groups + memos
  document.getElementById('memo-new')?.addEventListener('click', ()=> openModalEditor(null));

  // Memo search (header)
  const memoSearch = document.getElementById('memo-search');
  const memoSearchWrapper = document.getElementById('memo-search-wrapper');
  let memoSearchTimer = null;

  function setSearching(on){
    if (!memoSearchWrapper) return;
    memoSearchWrapper.classList.toggle('active-searching', !!on);
  }

  async function applyMemoSearch(next){
    state.search = String(next || '').trim();
    state.page = 1;
    setSearching(true);
    try {
      await refreshMemos();
    } finally {
      setSearching(false);
    }
  }

  memoSearch?.addEventListener('input', ()=>{
    const v = memoSearch.value;
    if (memoSearchTimer) clearTimeout(memoSearchTimer);
    memoSearchTimer = setTimeout(()=>{ applyMemoSearch(v).catch(()=>{}); }, 180);
  });

  // Group create modal (memo)
  // NOTE: Binding is also bootstrapped outside this DOMContentLoaded handler.
  // Keeping this call here is harmless due to the global one-time guard.
  try { bindMemoViewModeUI(); } catch (_) {}
  try { bindMemoCardMoveUI(); } catch (_) {}
  try { bindMemoGroupCreateModal(); } catch (_) {}
  try { bindMemoGroupDeleteUI(); } catch (_) {}
  try { bindMemoDragDropMove(); } catch (_) {}
  try { bindMemoGroupDragDropReorder(); } catch (_) {}

  (async ()=>{
    try {
      await refreshGroups();
      await refreshMemos();
    } catch (err) {
      console.error(err);
    }
  })();
  });

  // Bootstrap group-create modal binding outside the large DOMContentLoaded handler.
  // This prevents other DOMContentLoaded errors from stopping the modal from working.
  function bindMemoNewButton(){
    // Replace stale listeners from older SPA script instances.
    if (window.__memoNewButtonHandlerRef) {
      try { document.removeEventListener('click', window.__memoNewButtonHandlerRef, true); } catch (_) {}
    }
    if (window.__memoNewButtonDirectRef?.el && window.__memoNewButtonDirectRef?.fn) {
      try { window.__memoNewButtonDirectRef.el.removeEventListener('click', window.__memoNewButtonDirectRef.fn, true); } catch (_) {}
    }

    const handler = (e) => {
      const t = e.target;
      if (!t?.closest?.('#memo-new')) return;
      e.preventDefault();
      if (!isMemoEditorReady()) return;
      try { openModalEditor(null); } catch (_) {}
    };

    window.__memoNewButtonHandlerRef = handler;
    document.addEventListener('click', handler, true);

    // Also bind directly to the button element to avoid propagation conflicts.
    const newBtn = document.getElementById('memo-new');
    if (newBtn) {
      const directHandler = (e) => {
        e.preventDefault();
        if (!isMemoEditorReady()) return;
        try { openModalEditor(null); } catch (_) {}
      };
      window.__memoNewButtonDirectRef = { el: newBtn, fn: directHandler };
      newBtn.addEventListener('click', directHandler, true);
    } else {
      window.__memoNewButtonDirectRef = null;
    }
  }

  function bindMemoGroupCreateModal(){
    if (window.__memoGroupCreateModalBound) return;
    const modal = document.getElementById('memo-group-modal');
    const input = document.getElementById('memo-group-name');
    const createBtn = document.getElementById('memo-group-create');
    if (!modal || !input || !createBtn) return;
    window.__memoGroupCreateModalBound = true;

    const isAnyStandardModalOpen = () => !!document.querySelector('.modal-overlay-base.show, .server-add-modal.show, .server-edit-modal.show, .server-column-modal.show');

    const ensureOnBody = () => {
      try {
        if (modal.parentElement !== document.body) document.body.appendChild(modal);
      } catch (_) {}
    };

    const open = () => {
      ensureOnBody();
      document.body.classList.add('modal-open');
      modal.classList.add('show');
      modal.setAttribute('aria-hidden', 'false');
      modal.style.display = 'flex';
      input.value = '';
      setTimeout(() => input.focus(), 0);
    };
    const close = () => {
      modal.classList.remove('show');
      modal.setAttribute('aria-hidden', 'true');
      modal.style.display = 'none';
      if (!isAnyStandardModalOpen()) document.body.classList.remove('modal-open');
    };

    const submit = async () => {
      const trimmed = String(input.value || '').trim();
      if (!trimmed) { input.focus(); return; }
      createBtn.setAttribute('disabled', 'disabled');
      try {
        const created = await createGroup(trimmed);
        if (created?.id) setActiveGroup(created.id);
        state.page = 1;
        state.search = '';
        const memoSearchEl = document.getElementById('memo-search');
        if (memoSearchEl) memoSearchEl.value = '';
        await refreshGroups();
        await refreshMemos();
        close();
      } catch (err) {
        const msg = err?.message || '그룹 생성에 실패했습니다.';
        if (String(msg).includes('그룹은 최대 11개')) openMemoWarningModal(msg, 'warning');
        else alert(msg);
      } finally {
        createBtn.removeAttribute('disabled');
      }
    };

    // Delegated handlers: robust even if other init code fails.
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (t?.closest?.('#memo-group-add')) { e.preventDefault(); open(); return; }
      if (t?.closest?.('#memo-group-close') || t?.closest?.('#memo-group-cancel')) { e.preventDefault(); close(); return; }
      if (t?.closest?.('#memo-group-create')) { e.preventDefault(); submit(); return; }
      if (t === modal) close();
    }, true);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('show')) close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (!modal.classList.contains('show')) return;
      if (document.activeElement !== input) return;
      e.preventDefault();
      submit();
    }, true);
  }

  (function bootstrapMemoGroupCreateModal(){
    const run = () => {
      try { bindMemoNewButton(); } catch (_) {}
      try { bindMemoViewModeUI(); } catch (_) {}
      try { bindMemoCardMoveUI(); } catch (_) {}
      try { bindMemoGroupCreateModal(); } catch (_) {}
      try { bindMemoGroupDeleteUI(); } catch (_) {}
      try { bindMemoDragDropMove(); } catch (_) {}
      try { bindMemoGroupDragDropReorder(); } catch (_) {}
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
    else run();
  })();
})();
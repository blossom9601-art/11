(function(){
  'use strict';

  function $(sel, root){ return (root||document).querySelector(sel); }
  function $all(sel, root){ return Array.from((root||document).querySelectorAll(sel)); }

  function pad2(n){ return String(n).padStart(2,'0'); }
  function todayYmd(){ const d=new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }

  function csvCell(v){
    if(v==null) return '';
    const s = String(v).replace(/"/g,'""');
    return /[\",\n\r]/.test(s) ? `"${s}"` : s;
  }

  function downloadRowsAsCsv(filename, headers, rows){
    const lines = [];
    lines.push(headers.map(csvCell).join(','));
    rows.forEach(r => {
      lines.push(headers.map(h => csvCell(r[h])).join(','));
    });
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    try{
      if(typeof showToast === 'function') showToast('CSV 파일이 다운로드되었습니다.', 'success');
    }catch(_e){}
  }

  function setModalOpen(modalEl, open){
    if(!modalEl) return;
    if(open){
      modalEl.classList.add('show');
      modalEl.setAttribute('aria-hidden','false');
      document.body.classList.add('modal-open');
    }else{
      modalEl.classList.remove('show');
      modalEl.setAttribute('aria-hidden','true');
      // Only clear body lock if there are no other open modals.
      const anyOpen = !!document.querySelector('.modal-overlay-full.show, .server-add-modal.show');
      if(!anyOpen) document.body.classList.remove('modal-open');
    }
  }

  function openModal(id){
    const el = document.getElementById(id);
    if(!el) return;
    setModalOpen(el, true);
  }

  function closeModal(id){
    const el = document.getElementById(id);
    if(!el) return;
    setModalOpen(el, false);
  }

  async function apiJson(url, options){
    const res = await fetch(url, options);
    let data = null;
    try{ data = await res.json(); }catch(_e){ data = null; }
    if(!res.ok || (data && data.success === false)){
      const msg = (data && data.message) ? data.message : `요청 실패 (${res.status})`;
      throw new Error(msg);
    }
    return data;
  }

  function formatDate(val){
    const s = String(val||'').trim();
    if(!s) return '';
    // expected: YYYY-MM-DD HH:mm:ss
    if(s.length >= 10) return s.slice(0,10);
    return s;
  }

  function initInsightListPage(opts){
    try{ document.body.dataset.blossomListEmptyManaged = '1'; }catch(_e){}
    const category = (opts && opts.category) ? String(opts.category) : '';
    const label = (opts && opts.label) ? String(opts.label) : '인사이트';

    const tableBody = document.getElementById('insight-table-body');
    const countEl = document.getElementById('insight-count');
    const emptyEl = document.getElementById('system-empty');
    const paginationEl = document.getElementById('insight-pagination');
    const infoEl = document.getElementById('insight-pagination-info');
    const pageNumbersEl = document.getElementById('insight-page-numbers');

    const searchInput = document.getElementById('insight-search');
    const searchClear = document.getElementById('insight-search-clear');
    const searchWrapper = document.getElementById('insight-search-wrapper');

    const pageSizeSel = document.getElementById('insight-page-size');

    const btnDownload = document.getElementById('insight-download-btn');
    const btnDelete = document.getElementById('insight-delete-btn');
    const btnAdd = document.getElementById('insight-add-btn');

    const selectAll = document.getElementById('insight-select-all');

    const modalEl = document.getElementById('insight-add-modal');
    const modalClose = document.getElementById('insight-add-close');
    const modalForm = document.getElementById('insight-add-form');
    const modalTitleInput = document.getElementById('insight-add-title-input');
    const modalAuthorInput = document.getElementById('insight-add-author-input');
    const modalTitleText = document.getElementById('insight-add-title');
    const modalSubtitleText = document.getElementById('insight-add-subtitle');
    const modalSubmitBtn = document.getElementById('insight-add-submit');
    const modalCancelBtn = document.getElementById('insight-add-cancel');

    // Blog-style editor fields (reused by Insight)
    const editorEl = document.getElementById('insight-add-editor');
    const tagsInputEl = document.getElementById('insight-add-tags');
    const toolbarEl = document.getElementById('insight-editor-toolbar');
    const editorImageInputEl = document.getElementById('insight-editor-image-input');
    const fontSelectEl = document.getElementById('insight-editor-font');
    const sizeSelectEl = document.getElementById('insight-editor-size');
    const colorEl = document.getElementById('insight-editor-color');
    const highlightEl = document.getElementById('insight-editor-highlight');
    const trackingEl = document.getElementById('insight-editor-tracking');
    const attachDropEl = document.getElementById('insight-attach-drop');
    const attachmentsInputEl = document.getElementById('insight-add-attachments');
    const attachListEl = document.getElementById('insight-attach-list');

    // Edit-mode existing attachments (download + delete)
    const editAttachmentsWrapEl = document.getElementById('insight-edit-attachments');
    const editAttachmentsListEl = document.getElementById('insight-edit-attachments-list');

    // View-only (detail modal) UI
    const viewBottomEl = document.getElementById('insight-detail-bottom');
    const viewAttachmentsWrapEl = document.getElementById('insight-view-attachments');
    const viewAttachmentsListEl = document.getElementById('insight-view-attachments-list');
    const viewLikeRowEl = document.getElementById('insight-detail-like-row');
    const viewLikeBtnEl = document.getElementById('insight-detail-like-btn');
    const viewLikeCountEl = document.getElementById('insight-detail-like-count');

    // Sections (for view-only detail modal)
    const titleSectionEl = modalTitleInput ? modalTitleInput.closest('.blog-add-section') : null;
    const editorSectionEl = editorEl ? editorEl.closest('.blog-add-section') : null;
    const tagsSectionEl = tagsInputEl ? tagsInputEl.closest('.blog-add-section') : null;
    const attachSectionEl = attachDropEl ? attachDropEl.closest('.blog-add-section') : null;

    // "내용" section title element (hide in view-mode to match spec)
    const editorSectionTitleEl = editorSectionEl ? editorSectionEl.querySelector('.blog-add-section-title') : null;

    const titleFieldEl = modalTitleInput ? modalTitleInput.closest('.blog-add-field') : null;
    const tagsFieldEl = tagsInputEl ? tagsInputEl.closest('.blog-add-field') : null;

    const titleViewEl = titleFieldEl ? (function(){
      const el = document.createElement('div');
      el.className = 'blog-view-field';
      el.hidden = true;
      titleFieldEl.appendChild(el);
      return el;
    })() : null;

    const tagsViewEl = tagsFieldEl ? (function(){
      const el = document.createElement('div');
      el.className = 'blog-view-field blog-view-tags';
      el.hidden = true;
      tagsFieldEl.appendChild(el);
      return el;
    })() : null;

    function refreshViewFields(){
      if(titleViewEl) titleViewEl.textContent = String(modalTitleInput && modalTitleInput.value ? modalTitleInput.value : '').trim();
      if(tagsViewEl) tagsViewEl.textContent = String(tagsInputEl && tagsInputEl.value ? tagsInputEl.value : '').trim();
    }

    function setViewLikeCount(value){
      if(!viewLikeCountEl) return;
      const v = parseInt(String(value ?? '0'), 10);
      viewLikeCountEl.textContent = String(Number.isFinite(v) ? Math.max(0, v) : 0);
    }

    function setViewLikePressed(pressed){
      if(!viewLikeBtnEl) return;
      const on = !!pressed;
      viewLikeBtnEl.setAttribute('aria-pressed', on ? 'true' : 'false');
      viewLikeBtnEl.classList.toggle('is-liked', on);
    }

    function renderViewAttachments(attachments){
      if(!viewAttachmentsWrapEl || !viewAttachmentsListEl) return;
      viewAttachmentsListEl.innerHTML = '';

      const items = Array.isArray(attachments) ? attachments : [];
      if(items.length === 0){
        viewAttachmentsWrapEl.hidden = true;
        return;
      }

      const sizeLabel = (n) => {
        const num = Number(n);
        if(!Number.isFinite(num) || num <= 0) return '';
        return bytesToLabel(num);
      };

      for(const a of items){
        const li = document.createElement('li');
        const name = String((a && (a.original_name || a.name)) || '첨부파일');
        const url = String((a && a.download_url) || '').trim();
        const sizeText = sizeLabel(a && (a.size_bytes ?? a.file_size ?? a.size ?? a.bytes));

        if(url){
          const link = document.createElement('a');
          link.className = 'blog-post-attachment-link';
          link.href = url;
          link.setAttribute('download','');
          link.setAttribute('rel','noopener');
          link.setAttribute('aria-label', `첨부파일 다운로드: ${name}`);

          const nameEl = document.createElement('span');
          nameEl.className = 'blog-post-attachment-name';
          nameEl.textContent = name;

          const metaEl = document.createElement('span');
          metaEl.className = 'blog-post-attachment-meta';
          metaEl.textContent = sizeText ? `${sizeText} · 다운로드` : '다운로드';

          link.appendChild(nameEl);
          link.appendChild(metaEl);
          li.appendChild(link);
        }else{
          const row = document.createElement('div');
          row.className = 'blog-post-attachment-link';

          const nameEl = document.createElement('span');
          nameEl.className = 'blog-post-attachment-name';
          nameEl.textContent = name;

          const metaEl = document.createElement('span');
          metaEl.className = 'blog-post-attachment-meta';
          metaEl.textContent = sizeText ? `${sizeText} · 다운로드 불가` : '다운로드 불가';

          row.appendChild(nameEl);
          row.appendChild(metaEl);
          li.appendChild(row);
        }

        viewAttachmentsListEl.appendChild(li);
      }

      viewAttachmentsWrapEl.hidden = false;
    }

    function renderEditExistingAttachments(attachments){
      if(!editAttachmentsWrapEl || !editAttachmentsListEl) return;
      editAttachmentsListEl.innerHTML = '';

      const items = Array.isArray(attachments) ? attachments : [];
      if(items.length === 0){
        editAttachmentsWrapEl.hidden = true;
        return;
      }

      const sizeLabel = (n) => {
        const num = Number(n);
        if(!Number.isFinite(num) || num <= 0) return '';
        return bytesToLabel(num);
      };

      for(const a of items){
        const li = document.createElement('li');
        const aid = a && (a.id ?? a.attachment_id);
        const name = String((a && (a.original_name || a.name)) || '첨부파일');
        const url = String((a && a.download_url) || '').trim();
        const sizeText = sizeLabel(a && (a.size_bytes ?? a.file_size ?? a.size ?? a.bytes));

        if(url){
          const link = document.createElement('a');
          link.className = 'blog-post-attachment-link';
          link.href = url;
          link.setAttribute('download','');
          link.setAttribute('rel','noopener');
          link.setAttribute('aria-label', `첨부파일 다운로드: ${name}`);

          const nameEl = document.createElement('span');
          nameEl.className = 'blog-post-attachment-name';
          nameEl.textContent = name;

          const metaEl = document.createElement('span');
          metaEl.className = 'blog-post-attachment-meta';
          metaEl.textContent = sizeText ? `${sizeText} · 다운로드` : '다운로드';

          link.appendChild(nameEl);
          link.appendChild(metaEl);
          li.appendChild(link);
        }else{
          const row = document.createElement('div');
          row.className = 'blog-post-attachment-link';

          const nameEl = document.createElement('span');
          nameEl.className = 'blog-post-attachment-name';
          nameEl.textContent = name;

          const metaEl = document.createElement('span');
          metaEl.className = 'blog-post-attachment-meta';
          metaEl.textContent = sizeText ? `${sizeText} · 다운로드 불가` : '다운로드 불가';

          row.appendChild(nameEl);
          row.appendChild(metaEl);
          li.appendChild(row);
        }

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'blog-post-attachment-delete';
        delBtn.textContent = '삭제';
        if(typeof aid !== 'undefined' && aid !== null) delBtn.setAttribute('data-attachment-id', String(aid));
        delBtn.setAttribute('aria-label', `첨부파일 삭제: ${name}`);
        li.appendChild(delBtn);

        editAttachmentsListEl.appendChild(li);
      }

      editAttachmentsWrapEl.hidden = false;
    }

    const deleteModalEl = document.getElementById('insight-delete-modal');
    const deleteSubtitleEl = document.getElementById('insight-delete-subtitle');
    const deleteClose = document.getElementById('insight-delete-close');
    const deleteConfirm = document.getElementById('insight-delete-confirm');

    const downloadModalEl = document.getElementById('insight-download-modal');
    const downloadSubtitleEl = document.getElementById('insight-download-subtitle');
    const downloadClose = document.getElementById('insight-download-close');
    const downloadConfirm = document.getElementById('insight-download-confirm');
    const csvRowSelected = document.getElementById('insight-csv-range-row-selected');
    const csvOptAll = document.getElementById('insight-csv-range-all');
    const csvOptSelected = document.getElementById('insight-csv-range-selected');

    const currentUserName = (document.body && document.body.getAttribute('data-current-user-name')) || '';

    // Match blog list editor UX
    if(tagsInputEl) tagsInputEl.placeholder = '예시: #AI, #보안';

    // Match blog list attachment dropzone icon (Lottie)
    let attachUploadLottieInitDone = false;
    let attachUploadLottieLoading = false;
    const ensureLottieScript = () => new Promise((resolve) => {
      if(typeof window.lottie !== 'undefined') return resolve(true);
      if(attachUploadLottieLoading) return resolve(false);
      attachUploadLottieLoading = true;
      const s = document.createElement('script');
      s.src = '/static/vendor/lottie/lottie.min.5.12.2.js';
      s.async = true;
      s.onload = () => {
        attachUploadLottieLoading = false;
        resolve(typeof window.lottie !== 'undefined');
      };
      s.onerror = () => {
        attachUploadLottieLoading = false;
        resolve(false);
      };
      document.head.appendChild(s);
      return null;
    });

    const ensureAttachUploadLottie = () => {
      if(!attachDropEl) return;
      const iconEl = attachDropEl.querySelector('.blog-dropzone-icon');
      if(!iconEl) return;
      // Avoid double-initializing
      if(iconEl.dataset && iconEl.dataset.lottieBound === '1') return;
      if(attachUploadLottieInitDone) return;

      if(typeof window.lottie === 'undefined'){
        ensureLottieScript().then((ok) => {
          if(!ok) return;
          setTimeout(ensureAttachUploadLottie, 0);
        });
        return;
      }

      let container = iconEl;
      if(iconEl.tagName && iconEl.tagName.toLowerCase() === 'img'){
        const cs = window.getComputedStyle(iconEl);
        const w = (cs && cs.width) ? cs.width : '34px';
        const h = (cs && cs.height) ? cs.height : '34px';
        const span = document.createElement('span');
        span.className = iconEl.className;
        span.setAttribute('aria-hidden','true');
        span.dataset.lottieBound = '1';
        span.style.display = 'inline-block';
        span.style.width = w;
        span.style.height = h;
        iconEl.replaceWith(span);
        container = span;
      }else{
        container.dataset.lottieBound = '1';
      }

      try{
        window.lottie.loadAnimation({
          container,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          path: '/static/image/svg/free-animated-icon-upload.json',
        });
        attachUploadLottieInitDone = true;
      }catch(e){
        console.warn(e);
      }
    };

    // Initialize attachment dropzone icon animation (match Blog)
    ensureAttachUploadLottie();

    const state = {
      q: '',
      page: 1,
      pageSize: parseInt(pageSizeSel && pageSizeSel.value, 10) || 10,
      total: 0,
      items: [],
      isLoading: false,
      editingId: null,
      pendingDeleteIds: [],
      viewingId: null,
    };

    let isViewMode = false;
    function applyModalViewMode(on){
      isViewMode = !!on;
      if(modalEl) modalEl.classList.toggle('is-view-mode', isViewMode);

      // Hide red area (content header + tags line) in view mode.
      if(editorSectionTitleEl) editorSectionTitleEl.hidden = isViewMode;

      // For detail modal: title is shown in header; hide title section.
      if(titleSectionEl) titleSectionEl.hidden = isViewMode;
      // Tags are shown as plain text in subtitle; hide tags section.
      if(tagsSectionEl) tagsSectionEl.hidden = isViewMode;
      // In detail view mode, attachments are rendered in the bottom (blog style);
      // hide the upload section (including the "첨부파일" section title).
      if(attachSectionEl) attachSectionEl.hidden = isViewMode;

      // Inputs
      if(modalTitleInput){
        modalTitleInput.readOnly = isViewMode;
        modalTitleInput.tabIndex = isViewMode ? -1 : 0;
        modalTitleInput.hidden = isViewMode;
      }
      if(tagsInputEl){
        tagsInputEl.readOnly = isViewMode;
        tagsInputEl.tabIndex = isViewMode ? -1 : 0;
        tagsInputEl.hidden = isViewMode;
      }
      if(editorEl){
        editorEl.setAttribute('contenteditable', isViewMode ? 'false' : 'true');
      }

      // View-only fields are not used anymore (title/tags sections hidden).
      if(titleViewEl) titleViewEl.hidden = true;
      if(tagsViewEl) tagsViewEl.hidden = true;

      // View-only sections
      if(viewBottomEl) viewBottomEl.hidden = !isViewMode;
      if(viewLikeRowEl) viewLikeRowEl.hidden = !isViewMode;
      if(viewAttachmentsWrapEl && !isViewMode) viewAttachmentsWrapEl.hidden = true;
      if(attachListEl) attachListEl.hidden = isViewMode;

      // Toolbar (keep layout; just disable interaction)
      if(toolbarEl){
        // Hide completely in detail mode per requirement
        toolbarEl.hidden = isViewMode;
        toolbarEl.style.pointerEvents = isViewMode ? 'none' : '';
        toolbarEl.style.opacity = isViewMode ? '0.65' : '';
      }

      // Attachments: keep block visible but disable upload interactions
      if(attachDropEl){
        attachDropEl.hidden = isViewMode;
        attachDropEl.style.pointerEvents = '';
        attachDropEl.style.opacity = '';
        attachDropEl.setAttribute('aria-disabled', isViewMode ? 'true' : 'false');
      }
      if(attachmentsInputEl) attachmentsInputEl.disabled = isViewMode;

      // Actions
      if(modalSubmitBtn) modalSubmitBtn.hidden = isViewMode;
      if(modalCancelBtn) modalCancelBtn.textContent = isViewMode ? '닫기' : '취소';
    }

    let attachmentFiles = [];
    let existingAttachments = [];

    function setDragState(el, on){
      if(!el) return;
      el.classList.toggle('dragover', !!on);
    }

    function bytesToLabel(n){
      const v = Number(n||0);
      if(!v) return '';
      const kb = 1024;
      const mb = kb*1024;
      if(v >= mb) return `${(v/mb).toFixed(2)} MB`;
      if(v >= kb) return `${Math.max(1, Math.round(v/kb))} KB`;
      return '1 KB';
    }

    function clearEditorFields(){
      if(editorEl) editorEl.innerHTML = '';
      if(tagsInputEl) tagsInputEl.value = '';
      attachmentFiles = [];
      existingAttachments = [];
      renderEditExistingAttachments(existingAttachments);
      renderAttachmentList();
    }

    function renderAttachmentList(){
      if(!attachListEl) return;
      attachListEl.innerHTML = '';

      // Newly selected files (client-side) — match blog list markup
      if(!isViewMode){
        for(let idx = 0; idx < attachmentFiles.length; idx += 1){
          const f = attachmentFiles[idx];
          const li = document.createElement('li');
          li.innerHTML = `
            <span class="blog-attach-name"></span>
            <button type="button" class="blog-attach-remove" aria-label="첨부 삭제" data-index="${idx}">
              <span aria-hidden="true">×</span>
            </button>
          `;
          const nameEl = li.querySelector('.blog-attach-name');
          if(nameEl) nameEl.textContent = f && f.name ? String(f.name) : '';
          attachListEl.appendChild(li);
        }
      }
    }

    async function deleteExistingAttachment(attachmentId){
      const iid = state && state.editingId ? String(state.editingId) : '';
      const aid = String(attachmentId || '').trim();
      if(!iid || !aid) return;
      const ok = confirm('첨부파일을 삭제하시겠습니까?');
      if(!ok) return;
      try{
        await apiJson(`/api/insight/items/${encodeURIComponent(iid)}/attachments/${encodeURIComponent(aid)}`, {
          method: 'DELETE',
          headers: { 'Accept': 'application/json' },
        });
        existingAttachments = (existingAttachments || []).filter(a => String(a && (a.id ?? a.attachment_id)) !== aid);
        renderEditExistingAttachments(existingAttachments);
        try{ if(typeof showToast === 'function') showToast('첨부파일이 삭제되었습니다.', 'success'); }catch(_e){}
      }catch(err){
        try{ if(typeof showToast === 'function') showToast(err.message || '첨부파일 삭제 실패', 'error'); }catch(_e){ alert(err.message || '첨부파일 삭제 실패'); }
      }
    }

    function addAttachmentFiles(files){
      const list = Array.from(files || []).filter(Boolean);
      if(!list.length) return;

      const maxFiles = 10;
      const maxBytes = 20 * 1024 * 1024;

      for(const f of list){
        if(attachmentFiles.length >= maxFiles) break;
        if(f.size && f.size > maxBytes){
          try{ if(typeof showToast === 'function') showToast('첨부파일은 20MB 이하만 업로드할 수 있습니다.', 'warning'); }catch(_e){}
          continue;
        }
        attachmentFiles.push(f);
      }
      renderAttachmentList();
    }

    // Simple rich editor helper (upgradeable to blog toolbar v2)
    let savedRange = null;
    function saveSelection(){
      try{
        const sel = window.getSelection();
        if(!sel || sel.rangeCount === 0) return;
        savedRange = sel.getRangeAt(0);
      }catch(_e){
        savedRange = null;
      }
    }
    function restoreSelection(){
      try{
        const sel = window.getSelection();
        if(!sel || !savedRange) return;
        sel.removeAllRanges();
        sel.addRange(savedRange);
      }catch(_e){}
    }
    function exec(cmd, value){
      if(!editorEl) return;
      editorEl.focus();
      restoreSelection();
      try{ document.execCommand(cmd, false, value); }catch(_e){}
      saveSelection();
    }

    const FONT_SIZE_PX_OPTIONS = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
    const TOOLBAR_ICON_MAP = {
      bold: { icon: '/static/image/svg/insight/free-icon-bold.svg', label: '굵은 글씨' },
      underline: { icon: '/static/image/svg/insight/free-icon-underline.svg', label: '밑줄' },
      strikeThrough: { icon: '/static/image/svg/insight/free-icon-strikethrough.svg', label: '취소선' },
      indent: { icon: '/static/image/svg/insight/free-icon-indent.svg', label: '들여쓰기' },
      outdent: { icon: '/static/image/svg/insight/free-icon-outdent.svg', label: '내어쓰기' },
      insertUnorderedList: { icon: '/static/image/svg/insight/free-icon-chart-bullet.svg', label: '글머리 기호' },
      insertOrderedList: { icon: '/static/image/svg/insight/free-icon-sort-numeric.svg', label: '번호 매기기' },
      justifyLeft: { icon: '/static/image/svg/insight/free-icon-align-left.svg', label: '왼쪽 정렬' },
      justifyCenter: { icon: '/static/image/svg/insight/free-icon-align-center.svg', label: '가운데 정렬' },
      justifyRight: { icon: '/static/image/svg/insight/free-icon-align-right.svg', label: '오른쪽 정렬' },
      justifyFull: { icon: '/static/image/svg/insight/free-icon-align-justify.svg', label: '양쪽 맞춤' },
    };

    const COLOR_PALETTE = [
      '#000000', '#1F2937', '#374151', '#6B7280', '#9CA3AF', '#D1D5DB', '#E5E7EB', '#F3F4F6', '#FFFFFF',
      '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16', '#22C55E', '#14B8A6', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899',
    ];

    const DEFAULT_HILITE = '#fff59d';
    let colorPopoverEl = null;
    let colorMode = 'fore';
    let colorTriggerEl = null;
    let highlightTriggerEl = null;
    let tableColTriggerEl = null;
    let tableColColorLast = '#e5e7eb';
    let tableColColorPending = null;

    function getSelectionFocusCellInEditor(){
      if(!editorEl) return null;
      try{
        const sel = window.getSelection();
        if(!sel || sel.rangeCount === 0) return null;
        const node = sel.anchorNode || sel.focusNode;
        if(!node) return null;
        const el = (node.nodeType === 1) ? node : node.parentElement;
        if(!el) return null;
        const cell = el.closest && el.closest('td,th');
        if(!cell) return null;
        if(!editorEl.contains(cell)) return null;
        return cell;
      }catch(_e){
        return null;
      }
    }

    function setTableColColorPending(shell, cell){
      if(!shell) return;
      const table = shell.querySelector && shell.querySelector('table');
      if(!table) return;
      const focus = cell || getSelectionFocusCellInEditor() || shell.querySelector('td,th');
      if(!focus) return;
      const colIndex = Number.isFinite(focus.cellIndex) ? focus.cellIndex : -1;
      if(colIndex < 0) return;
      tableColColorPending = { shell, colIndex };
    }

    function applyTableColColorFromPending(color){
      const pending = tableColColorPending;
      if(!pending) return;
      const c = String(color || '').trim();
      if(!c) return;
      const { shell, colIndex } = pending;
      const table = shell && shell.querySelector && shell.querySelector('table');
      if(!table) return;
      const rows = Array.from(table.querySelectorAll('tr'));
      for(const tr of rows){
        const cells = Array.from(tr.children || []).filter(x => x && (x.tagName === 'TD' || x.tagName === 'TH'));
        const cell = cells[colIndex];
        if(cell) cell.style.backgroundColor = c;
      }
      tableColColorLast = c;
      tableColColorPending = null;
    }

    function insertStyledZeroWidthSpan(styleText){
      if(!editorEl) return;
      editorEl.focus();
      restoreSelection();
      const sel = window.getSelection();
      if(!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const span = document.createElement('span');
      span.setAttribute('style', styleText);
      const zw = document.createTextNode('\u200b');
      span.appendChild(zw);
      range.insertNode(span);
      const nextRange = document.createRange();
      nextRange.setStart(zw, 1);
      nextRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(nextRange);
      saveSelection();
    }

    function applyFontSizePx(px){
      const sizePx = Number(px);
      if(!Number.isFinite(sizePx) || sizePx <= 0) return;
      if(!editorEl) return;
      editorEl.focus();
      restoreSelection();
      const sel = window.getSelection();
      if(!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if(range.collapsed){
        insertStyledZeroWidthSpan(`font-size:${sizePx}px;`);
        return;
      }
      try{
        document.execCommand('fontSize', false, '7');
        const fonts = editorEl.querySelectorAll('font[size="7"]');
        for(const f of fonts){
          const span = document.createElement('span');
          span.style.fontSize = `${sizePx}px`;
          while(f.firstChild) span.appendChild(f.firstChild);
          f.parentNode && f.parentNode.replaceChild(span, f);
        }
      }catch(_e){}
      saveSelection();
    }

    function stripInlineFontSizes(rootEl){
      if(!rootEl) return;
      // Convert <font> tags to <span> while preserving non-size attrs.
      for(const f of Array.from(rootEl.querySelectorAll('font'))){
        const span = document.createElement('span');
        try{
          if(f.getAttribute('color')) span.style.color = String(f.getAttribute('color'));
          if(f.getAttribute('face')) span.style.fontFamily = String(f.getAttribute('face'));
          // Preserve any existing inline style except font-size.
          const cssText = String(f.style && f.style.cssText ? f.style.cssText : '');
          if(cssText) span.style.cssText = cssText;
          span.style.fontSize = '';
        }catch(_e){}
        while(f.firstChild) span.appendChild(f.firstChild);
        if(f.parentNode) f.parentNode.replaceChild(span, f);
      }

      // Remove any inline font-size on descendants.
      const all = rootEl.querySelectorAll('*');
      for(const el of Array.from(all)){
        try{
          if(el && el.style && el.style.fontSize){
            el.style.fontSize = '';
            const styleAttr = String(el.getAttribute('style') || '').trim();
            // If the style attribute is now empty (or only whitespace/;), remove it.
            if(!styleAttr || styleAttr === ';') el.removeAttribute('style');
          }
        }catch(_e){}
        try{
          if(el && el.tagName === 'FONT' && el.getAttribute('size')) el.removeAttribute('size');
        }catch(_e){}
      }
    }

    function enforceFixedFontSize16(){
      // Keep UI in sync.
      if(sizeSelectEl) sizeSelectEl.value = '16';
      // Ensure root editor is 16px.
      if(editorEl) editorEl.style.fontSize = '16px';
      // Remove any inline font-size that can override the base.
      if(editorEl) stripInlineFontSizes(editorEl);
    }

    function buildColorPopover(){
      if(colorPopoverEl) return colorPopoverEl;
      if(!toolbarEl) return null;
      const pop = document.createElement('div');
      pop.className = 'blog-color-popover';
      pop.hidden = true;
      pop.setAttribute('role','dialog');
      pop.setAttribute('aria-label','색상 선택');

      const title = document.createElement('div');
      title.className = 'blog-color-popover-title';
      title.textContent = '색상';

      const grid = document.createElement('div');
      grid.className = 'blog-color-grid';
      for(const c of COLOR_PALETTE){
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'blog-color-swatch';
        b.style.backgroundColor = c;
        b.dataset.color = c;
        b.setAttribute('aria-label', c);
        grid.appendChild(b);
      }
      pop.appendChild(title);
      pop.appendChild(grid);
      toolbarEl.appendChild(pop);
      colorPopoverEl = pop;
      return pop;
    }

    function closeColorPopover(){
      if(!colorPopoverEl) return;
      colorPopoverEl.hidden = true;
    }

    function openColorPopover(mode, anchorBtn){
      if(!toolbarEl) return;
      colorMode = mode;
      const pop = buildColorPopover();
      if(!pop) return;
      pop.dataset.mode = mode;
      const titleEl = pop.querySelector('.blog-color-popover-title');
      if(titleEl){
        if(mode === 'hilite') titleEl.textContent = '형광펜 색상';
        else if(mode === 'table-col') titleEl.textContent = '표 컬럼색';
        else titleEl.textContent = '글자색';
      }
      pop.hidden = false;
      try{
        const r = anchorBtn.getBoundingClientRect();
        const tr = toolbarEl.getBoundingClientRect();
        pop.style.left = `${Math.max(0, r.left - tr.left)}px`;
        pop.style.top = `${Math.max(0, r.bottom - tr.top + 8)}px`;
      }catch(_e){}
    }

    function setIconButton(btn, iconUrl, ariaLabel){
      btn.classList.add('blog-editor-btn-icon');
      btn.innerHTML = `<img src="${iconUrl}" alt="" aria-hidden="true">`;
      btn.setAttribute('aria-label', ariaLabel);
      btn.title = ariaLabel;
    }

    function ensureButton(formatBarEl, cmd, iconUrl, label){
      if(!formatBarEl) return null;
      let btn = formatBarEl.querySelector(`button[data-cmd="${cmd}"]`);
      if(!btn){
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'blog-editor-btn';
        btn.dataset.cmd = cmd;
        formatBarEl.appendChild(btn);
      }
      setIconButton(btn, iconUrl, label);
      return btn;
    }

    function ensureActionButton(formatBarEl, action, iconUrl, label){
      if(!formatBarEl) return null;
      let btn = formatBarEl.querySelector(`button[data-action="${action}"]`);
      if(!btn){
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'blog-editor-btn';
        btn.dataset.action = action;
        formatBarEl.appendChild(btn);
      }
      setIconButton(btn, iconUrl, label);
      return btn;
    }

    function upgradeToolbarUi(){
      if(!toolbarEl) return;
      if(toolbarEl.classList.contains('blog-editor-toolbar-v2')) return;
      const formatBarEl = toolbarEl.querySelector('.blog-editor-formatbar');
      if(!formatBarEl) return;

      toolbarEl.classList.add('blog-editor-toolbar-v2');

      // Swap sticker icon (insert bar)
      const stickerImg = toolbarEl.querySelector('button[data-action="insert-sticker"] img');
      if(stickerImg) stickerImg.src = '/static/image/svg/insight/free-icon-smile.svg';

      // Hide non-requested controls (font family, tracking, italic)
      if(fontSelectEl) fontSelectEl.hidden = true;
      if(trackingEl) trackingEl.hidden = true;
      const italicBtn = formatBarEl.querySelector('button[data-cmd="italic"]');
      if(italicBtn) italicBtn.hidden = true;

      // Replace existing command buttons with icons where specified
      for(const btn of Array.from(formatBarEl.querySelectorAll('button.blog-editor-btn'))){
        const cmd = btn.getAttribute('data-cmd');
        if(!cmd) continue;
        const meta = TOOLBAR_ICON_MAP[cmd];
        if(!meta) continue;
        setIconButton(btn, meta.icon, meta.label);
      }

      const btnBold = ensureButton(formatBarEl, 'bold', TOOLBAR_ICON_MAP.bold.icon, TOOLBAR_ICON_MAP.bold.label);
      const btnUnderline = ensureButton(formatBarEl, 'underline', TOOLBAR_ICON_MAP.underline.icon, TOOLBAR_ICON_MAP.underline.label);
      const btnStrike = ensureButton(formatBarEl, 'strikeThrough', TOOLBAR_ICON_MAP.strikeThrough.icon, TOOLBAR_ICON_MAP.strikeThrough.label);
      const btnCheckbox = ensureActionButton(formatBarEl, 'insert-checkbox', '/static/image/svg/insight/free-icon-checkbox.svg', '체크박스');
      const btnJustifyLeft = ensureButton(formatBarEl, 'justifyLeft', TOOLBAR_ICON_MAP.justifyLeft.icon, TOOLBAR_ICON_MAP.justifyLeft.label);
      const btnJustifyCenter = ensureButton(formatBarEl, 'justifyCenter', TOOLBAR_ICON_MAP.justifyCenter.icon, TOOLBAR_ICON_MAP.justifyCenter.label);
      const btnJustifyRight = ensureButton(formatBarEl, 'justifyRight', TOOLBAR_ICON_MAP.justifyRight.icon, TOOLBAR_ICON_MAP.justifyRight.label);
      const btnJustifyFull = ensureButton(formatBarEl, 'justifyFull', TOOLBAR_ICON_MAP.justifyFull.icon, TOOLBAR_ICON_MAP.justifyFull.label);
      const btnOutdent = ensureButton(formatBarEl, 'outdent', TOOLBAR_ICON_MAP.outdent.icon, TOOLBAR_ICON_MAP.outdent.label);
      const btnIndent = ensureButton(formatBarEl, 'indent', TOOLBAR_ICON_MAP.indent.icon, TOOLBAR_ICON_MAP.indent.label);
      const btnBullet = ensureButton(formatBarEl, 'insertUnorderedList', TOOLBAR_ICON_MAP.insertUnorderedList.icon, TOOLBAR_ICON_MAP.insertUnorderedList.label);
      const btnNumber = ensureButton(formatBarEl, 'insertOrderedList', TOOLBAR_ICON_MAP.insertOrderedList.icon, TOOLBAR_ICON_MAP.insertOrderedList.label);

      // Normalize size options to px list
      if(sizeSelectEl){
        sizeSelectEl.innerHTML = '';
        const opt0 = document.createElement('option');
        opt0.value = '';
        opt0.textContent = '글자크기';
        sizeSelectEl.appendChild(opt0);
        for(const v of FONT_SIZE_PX_OPTIONS){
          const opt = document.createElement('option');
          opt.value = String(v);
          opt.textContent = `${v}px`;
          sizeSelectEl.appendChild(opt);
        }
        if(!sizeSelectEl.value) sizeSelectEl.value = '16';
      }

      // Hide native color labels, replace with palette UI
      for(const lbl of Array.from(formatBarEl.querySelectorAll('.blog-editor-color'))){
        lbl.hidden = true;
      }

      const colorUi = document.createElement('div');
      colorUi.className = 'blog-color-ui';

      colorTriggerEl = document.createElement('button');
      colorTriggerEl.type = 'button';
      colorTriggerEl.className = 'blog-color-trigger';
      colorTriggerEl.dataset.action = 'toggle-fore-palette';
      colorTriggerEl.innerHTML = `<img class="blog-color-icon" src="/static/image/svg/insight/free-icon-palette.svg" alt="" aria-hidden="true"><span class="blog-color-sample" data-kind="fore"></span>`;
      colorTriggerEl.setAttribute('aria-label','글자색');
      colorTriggerEl.title = '글자색';

      tableColTriggerEl = document.createElement('button');
      tableColTriggerEl.type = 'button';
      tableColTriggerEl.className = 'blog-color-trigger';
      tableColTriggerEl.dataset.action = 'table-col-color';
      tableColTriggerEl.innerHTML = `<img class="blog-color-icon" src="/static/image/svg/insight/free-icon-palette2.svg" alt="" aria-hidden="true"><span class="blog-color-sample" data-kind="table-col"></span>`;
      tableColTriggerEl.setAttribute('aria-label','표 컬럼색');
      tableColTriggerEl.title = '표 컬럼색';

      highlightTriggerEl = document.createElement('button');
      highlightTriggerEl.type = 'button';
      highlightTriggerEl.className = 'blog-color-trigger';
      highlightTriggerEl.dataset.action = 'toggle-hilite-palette';
      highlightTriggerEl.innerHTML = `<img class="blog-color-icon" src="/static/image/svg/insight/free-icon-highlighter.svg" alt="" aria-hidden="true"><span class="blog-color-sample" data-kind="hilite"></span>`;
      highlightTriggerEl.setAttribute('aria-label','형광펜');
      highlightTriggerEl.title = '형광펜';

      // Put table column color immediately to the right of text color (match blog).
      colorUi.appendChild(colorTriggerEl);
      colorUi.appendChild(tableColTriggerEl);
      colorUi.appendChild(highlightTriggerEl);

      if(sizeSelectEl && sizeSelectEl.parentNode === formatBarEl){
        formatBarEl.insertBefore(colorUi, sizeSelectEl.nextSibling);
      }else{
        formatBarEl.prepend(colorUi);
      }

      const foreSample = colorUi.querySelector('.blog-color-sample[data-kind="fore"]');
      const hiliteSample = colorUi.querySelector('.blog-color-sample[data-kind="hilite"]');
      const tableColSample = colorUi.querySelector('.blog-color-sample[data-kind="table-col"]');
      if(foreSample) foreSample.style.backgroundColor = String(colorEl && colorEl.value ? colorEl.value : '#111827');
      if(highlightEl && !String(highlightEl.value || '').trim()) highlightEl.value = DEFAULT_HILITE;
      if(hiliteSample) hiliteSample.style.backgroundColor = String(highlightEl && highlightEl.value ? highlightEl.value : DEFAULT_HILITE);
      if(tableColSample) tableColSample.style.backgroundColor = String(tableColColorLast || '#e5e7eb');

      // Reorder controls to match icon layout
      const ordered = [
        sizeSelectEl,
        colorUi,
        btnBold,
        btnUnderline,
        btnStrike,
        btnCheckbox,
        btnJustifyLeft,
        btnJustifyCenter,
        btnJustifyRight,
        btnJustifyFull,
        btnOutdent,
        btnIndent,
        btnBullet,
        btnNumber,
      ];
      for(const el of ordered){
        if(!el) continue;
        if(el.hidden) continue;
        formatBarEl.appendChild(el);
      }
    }

    function insertTable(){
      const rows = 3;
      const cols = 3;
      let html = '<div class="blog-table-shell" data-blog-table="1">';
      html += '<button type="button" class="blog-table-add blog-table-add-col" contenteditable="false" aria-label="열 추가" data-table-action="add-col">+</button>';
      html += '<button type="button" class="blog-table-add blog-table-add-row" contenteditable="false" aria-label="행 추가" data-table-action="add-row">+</button>';
      html += '<button type="button" class="blog-table-remove" contenteditable="false" aria-label="표 삭제">';
      html += '<img src="/static/image/svg/insight/free-icon-trash.svg" alt="" aria-hidden="true">';
      html += '</button>';
      html += '<table><tbody>';
      for(let r=0; r<rows; r+=1){
        html += '<tr>';
        for(let c=0; c<cols; c+=1){
          html += '<td>&nbsp;</td>';
        }
        html += '</tr>';
      }
      html += '</tbody></table></div><p><br></p>';
      exec('insertHTML', html);
    }

    function updateCount(n){
      if(!countEl) return;
      countEl.textContent = String(n||0);
      countEl.classList.toggle('large-number', (n||0) >= 100);
      countEl.classList.toggle('very-large-number', (n||0) >= 1000);
    }

    function setEmptyVisible(visible){
      if(!emptyEl) return;
      emptyEl.hidden = !visible;
      // Defensive: ensure visibility even if CSS overrides [hidden]
      emptyEl.style.display = visible ? '' : 'none';
    }

    function setTableVisible(visible){
      const container = document.getElementById('insight-table-container');
      if(!container) return;
      container.hidden = !visible;
      // Defensive: ensure visibility even if CSS overrides [hidden]
      container.style.display = visible ? '' : 'none';
    }

    function setPaginationVisible(visible){
      if(!paginationEl) return;
      paginationEl.hidden = !visible;
      // Defensive: ensure visibility even if CSS overrides [hidden]
      paginationEl.style.display = visible ? '' : 'none';
    }

    function totalPages(){
      return Math.max(1, Math.ceil(state.total / state.pageSize));
    }

    function togglePageButtons(){
      const firstBtn = document.getElementById('insight-first');
      const prevBtn = document.getElementById('insight-prev');
      const nextBtn = document.getElementById('insight-next');
      const lastBtn = document.getElementById('insight-last');
      const pages = totalPages();
      if(firstBtn) firstBtn.disabled = state.page === 1;
      if(prevBtn) prevBtn.disabled = state.page === 1;
      if(nextBtn) nextBtn.disabled = state.page === pages;
      if(lastBtn) lastBtn.disabled = state.page === pages;
    }

    function renderPagination(){
      if(infoEl){
        const start = state.total ? (state.page - 1) * state.pageSize + 1 : 0;
        const end = Math.min(state.total, state.page * state.pageSize);
        infoEl.textContent = `${start}-${end} / ${state.total}개 항목`;
      }
      if(pageNumbersEl){
        const pages = totalPages();
        pageNumbersEl.innerHTML = '';
        for(let p=1; p<=pages && p<=50; p++){
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'page-btn' + (p === state.page ? ' active' : '');
          btn.textContent = String(p);
          btn.dataset.page = String(p);
          pageNumbersEl.appendChild(btn);
        }
      }
      togglePageButtons();
    }

    function renderRows(){
      if(!tableBody) return;

      if(state.isLoading){
        setEmptyVisible(false);
        setTableVisible(true);
        setPaginationVisible(false);
        return;
      }

      tableBody.innerHTML = '';

      state.items.forEach(item => {
        const tr = document.createElement('tr');
        const title = String(item.title || '');
        tr.innerHTML = `
          <td style="width:46px"><input type="checkbox" class="row-checkbox" data-id="${item.id}" aria-label="선택"></td>
          <td class="insight-title-cell">
            <a href="#" class="insight-title-link work-name-link" data-action="view" data-id="${item.id}" title="${escapeHtml(title)}">${escapeHtml(title)}</a>
          </td>
          <td style="width:140px">${escapeHtml(item.author||'')}</td>
          <td style="width:120px">${escapeHtml(formatDate(item.created_at))}</td>
          <td style="width:90px">${escapeHtml(String(item.views ?? 0))}</td>
          <td style="width:90px">${escapeHtml(String(item.likes ?? 0))}</td>
          <td style="width:100px">
            <div class="action-buttons">
              <button type="button" class="action-btn" data-action="edit" data-id="${item.id}" title="수정" aria-label="수정">
                <img src="/static/image/svg/list/free-icon-pencil.svg" alt="수정" class="action-icon">
              </button>
            </div>
          </td>
        `;
        tableBody.appendChild(tr);
      });

      syncSelectAll();
      syncRowSelectedClasses();

      // Keep empty/table/pagination visibility consistent even when callers
      // update rows without going through load().
      const hasRows = Array.isArray(state.items) && state.items.length > 0;
      setEmptyVisible(!hasRows);
      setTableVisible(hasRows);
      setPaginationVisible(hasRows);
    }

    function getSelectedIds(){
      const checked = document.querySelectorAll('#insight-table-body .row-checkbox:checked');
      return Array.from(checked)
        .map(el => el.getAttribute('data-id'))
        .filter(Boolean);
    }

    function syncSelectAll(){
      if(!selectAll) return;
      const boxes = document.querySelectorAll('#insight-table-body .row-checkbox');
      const checked = document.querySelectorAll('#insight-table-body .row-checkbox:checked');
      if(!boxes.length){
        selectAll.checked = false;
        selectAll.indeterminate = false;
        return;
      }
      selectAll.checked = checked.length === boxes.length;
      selectAll.indeterminate = checked.length > 0 && checked.length < boxes.length;
    }

    function syncRowSelectedClasses(){
      if(!tableBody) return;
      const rows = tableBody.querySelectorAll('tr');
      rows.forEach(row => {
        const cb = row.querySelector('input.row-checkbox');
        row.classList.toggle('selected', !!(cb && cb.checked));
      });
    }

    function escapeHtml(s){
      const str = String(s ?? '');
      return str
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;')
        .replace(/'/g,'&#39;');
    }

    function bindPaginationButtons(){
      const firstBtn = document.getElementById('insight-first');
      const prevBtn = document.getElementById('insight-prev');
      const nextBtn = document.getElementById('insight-next');
      const lastBtn = document.getElementById('insight-last');

      if(firstBtn) firstBtn.addEventListener('click', ()=>{ if(state.page !== 1){ state.page = 1; load(); } });
      if(prevBtn) prevBtn.addEventListener('click', ()=>{ if(state.page > 1){ state.page -= 1; load(); } });
      if(nextBtn) nextBtn.addEventListener('click', ()=>{ const pages = totalPages(); if(state.page < pages){ state.page += 1; load(); } });
      if(lastBtn) lastBtn.addEventListener('click', ()=>{ const pages = totalPages(); if(state.page !== pages){ state.page = pages; load(); } });

      if(pageNumbersEl){
        pageNumbersEl.addEventListener('click', (e)=>{
          const t = e.target;
          if(!t || !t.classList || !t.classList.contains('page-btn')) return;
          const p = parseInt(t.dataset.page || '', 10);
          if(!p || p === state.page) return;
          state.page = p;
          load();
        });
      }
    }

    let searchTimer = null;
    function setSearching(on){
      if(!searchWrapper) return;
      searchWrapper.classList.toggle('active-searching', !!on);
    }

    function setClearVisible(){
      if(!searchClear || !searchInput) return;
      const has = !!searchInput.value.trim();
      searchClear.classList.toggle('visible', has);
    }

    async function load(){
      const offset = (state.page - 1) * state.pageSize;
      const url = `/api/insight/items?category=${encodeURIComponent(category)}&q=${encodeURIComponent(state.q||'')}&limit=${state.pageSize}&offset=${offset}`;
      try{
        state.isLoading = true;
        setEmptyVisible(false);
        setTableVisible(true);
        setPaginationVisible(false);
        setSearching(true);
        const data = await apiJson(url, { method:'GET', headers:{'Accept':'application/json'} });
        state.items = (data && data.items) ? data.items : [];
        state.total = (data && (data.totalCount != null)) ? data.totalCount : state.items.length;

        state.isLoading = false;

        updateCount(state.total);
        renderRows();
        renderPagination();

        const hasAny = Array.isArray(state.items) && state.items.length > 0;
        setEmptyVisible(!hasAny);
        setTableVisible(hasAny);
        setPaginationVisible(hasAny);
      }catch(err){
        state.isLoading = false;
        updateCount(0);
        if(tableBody) tableBody.innerHTML = '';
        setEmptyVisible(true);
        setTableVisible(false);
        setPaginationVisible(false);
        try{
          if(typeof showToast === 'function') showToast(err.message || '오류가 발생했습니다.', 'error');
        }catch(_e){
          alert(err.message || '오류가 발생했습니다.');
        }
      }finally{
        state.isLoading = false;
        setSearching(false);
      }
    }

    async function handleDelete(id){
      if(!id) return;
      try{
        await apiJson(`/api/insight/items/${id}`, { method:'DELETE', headers:{'Accept':'application/json'} });
        try{ if(typeof showToast === 'function') showToast('삭제되었습니다.', 'success'); }catch(_e){}
        // If last item on page was deleted, go back a page when appropriate.
        const totalPages = Math.max(1, Math.ceil(Math.max(0, state.total - 1) / state.pageSize));
        if(state.page > totalPages) state.page = totalPages;
        await load();
      }catch(err){
        try{ if(typeof showToast === 'function') showToast(err.message || '삭제 중 오류', 'error'); }catch(_e){ alert(err.message || '삭제 중 오류'); }
      }
    }

    async function performBulkDelete(ids){
      const list = Array.isArray(ids) ? ids : [];
      const count = list.length;
      if(count === 0){
        try{ if(typeof showToast === 'function') showToast('삭제처리할 행을 먼저 선택하세요.', 'info'); }catch(_e){ alert('삭제처리할 행을 먼저 선택하세요.'); }
        return;
      }

      let ok = 0;
      for(const id of list){
        try{
          await apiJson(`/api/insight/items/${id}`, { method:'DELETE', headers:{'Accept':'application/json'} });
          ok += 1;
        }catch(_e){
          // keep going
        }
      }

      try{ if(typeof showToast === 'function') showToast(`${ok}개 항목이 삭제처리되었습니다.`, 'success'); }catch(_e){}
      if(selectAll){ selectAll.checked = false; selectAll.indeterminate = false; }
      await load();
    }

    async function handleLikeToggle(id, shouldLike){
      if(!id) return false;
      const method = shouldLike ? 'POST' : 'DELETE';
      try{
        const data = await apiJson(`/api/insight/items/${id}/likes`, { method, headers:{'Accept':'application/json'} });
        const updated = data && data.item;
        if(updated){
          const idx = state.items.findIndex(x => x.id === updated.id);
          if(idx >= 0){ state.items[idx] = updated; renderRows(); }
          if(state.viewingId && String(state.viewingId) === String(updated.id)){
            setViewLikeCount(updated.likes ?? 0);
          }
        }
        if(data && typeof data.likedByMe !== 'undefined'){
          setViewLikePressed(!!data.likedByMe);
        }else{
          setViewLikePressed(!!shouldLike);
        }
        return true;
      }catch(err){
        try{ if(typeof showToast === 'function') showToast(err.message || (shouldLike ? '좋아요 반영 실패' : '좋아요 취소 실패'), 'error'); }catch(_e){}
        return false;
      }
    }

    async function openViewModalById(id){
      const iid = String(id||'').trim();
      if(!iid) return;
      try{
        const data = await apiJson(`/api/insight/items/${encodeURIComponent(iid)}`, { method:'GET', headers:{'Accept':'application/json'} });
        const item = data && data.item;
        if(!item){
          try{ if(typeof showToast === 'function') showToast('상세 항목을 찾을 수 없습니다.', 'error'); }catch(_e){}
          return;
        }

        // bump views async (best-effort)
        apiJson(`/api/insight/items/${encodeURIComponent(iid)}/views`, { method:'POST', headers:{'Accept':'application/json'} })
          .then(vdata => {
            const updated = vdata && vdata.item;
            if(updated){
              const idx = state.items.findIndex(x => x.id === updated.id);
              if(idx >= 0){ state.items[idx] = updated; renderRows(); }
            }
          })
          .catch(()=>{});

        state.editingId = null;
        state.viewingId = item.id;
        applyModalViewMode(true);

        if(modalTitleText) modalTitleText.textContent = String(item.title || `기술자료 ${label} 상세`);
        const author = String(item.author || '').trim();
        const date = formatDate(item.created_at);
        if(modalSubtitleText) modalSubtitleText.textContent = `작성자: ${author} · 작성일: ${date}`;

        if(modalForm) modalForm.reset();
        if(sizeSelectEl) sizeSelectEl.value = '16';

        // Keep input boxes hidden in view mode, but still set values defensively.
        if(modalTitleInput) modalTitleInput.value = String(item.title || '');
        if(modalAuthorInput) modalAuthorInput.value = String(item.author || '');
        if(editorEl) editorEl.innerHTML = String(item.content_html || '');
        enforceFixedFontSize16();
        if(tagsInputEl) tagsInputEl.value = String(item.tags || '');

        existingAttachments = Array.isArray(item.attachments) ? item.attachments : [];
        attachmentFiles = [];
        renderEditExistingAttachments([]);
        renderAttachmentList();

        // View-only attachment rendering (blog style)
        renderViewAttachments(existingAttachments);

        // View-only like count/button
        setViewLikeCount(item.likes ?? 0);
        setViewLikePressed(false);

        // Fetch my like state (best-effort) so that the button color persists per-user.
        apiJson(`/api/insight/items/${encodeURIComponent(iid)}/likes/me`, { method:'GET', headers:{'Accept':'application/json'} })
          .then((ldata) => {
            if(ldata && ldata.success !== false && typeof ldata.likedByMe !== 'undefined'){
              setViewLikePressed(!!ldata.likedByMe);
            }
          })
          .catch(()=>{});

        setModalOpen(modalEl, true);
      }catch(err){
        try{ if(typeof showToast === 'function') showToast(err.message || '상세 불러오기 실패', 'error'); }catch(_e){ alert(err.message || '상세 불러오기 실패'); }
      }
    }

    // Like button inside detail modal
    if(viewLikeBtnEl){
      viewLikeBtnEl.addEventListener('click', async () => {
        if(!state.viewingId) return;
        // Toggle based on current pressed state. Optimistic UI, revert on failure.
        const prevPressed = String(viewLikeBtnEl.getAttribute('aria-pressed') || 'false') === 'true';
        const nextPressed = !prevPressed;
        setViewLikePressed(nextPressed);
        const ok = await handleLikeToggle(state.viewingId, nextPressed);
        if(!ok){
          setViewLikePressed(prevPressed);
        }
      });
    }

    async function exportCsv(onlySelected){
      const headers = ['제목','작성자','작성일','조회수','좋아요'];

      // Selected rows are only from currently loaded page.
      const selectedIds = new Set(getSelectedIds().map(String));

      let itemsForCsv = [];
      if(onlySelected === true){
        if(!selectedIds.size){
          try{ if(typeof showToast === 'function') showToast('선택된 행이 없습니다.', 'info'); }catch(_e){}
          return;
        }
        itemsForCsv = state.items.filter(it => selectedIds.has(String(it.id)));
      }else{
        // Fetch all matching results (category + search) in chunks.
        const total = state.total || 0;
        if(total === 0){
          try{ if(typeof showToast === 'function') showToast('다운로드할 데이터가 없습니다.', 'info'); }catch(_e){}
          return;
        }
        const chunk = 1000;
        const all = [];
        for(let offset = 0; offset < total; offset += chunk){
          const url = `/api/insight/items?category=${encodeURIComponent(category)}&q=${encodeURIComponent(state.q||'')}&limit=${chunk}&offset=${offset}`;
          const data = await apiJson(url, { method:'GET', headers:{'Accept':'application/json'} });
          const part = (data && data.items) ? data.items : [];
          part.forEach(x => all.push(x));
          if(part.length < chunk) break;
        }
        itemsForCsv = all;
      }

      const rows = itemsForCsv.map(it => ({
        '제목': it.title || '',
        '작성자': it.author || '',
        '작성일': formatDate(it.created_at),
        '조회수': it.views ?? 0,
        '좋아요': it.likes ?? 0,
      }));
      downloadRowsAsCsv(`insight_${category}_${todayYmd()}.csv`, headers, rows);
    }

    function openDeleteConfirmModal(){
      const ids = getSelectedIds();
      const count = ids.length;
      if(count === 0){
        try{ if(typeof showToast === 'function') showToast('삭제처리할 행을 먼저 선택하세요.', 'info'); }catch(_e){ alert('삭제처리할 행을 먼저 선택하세요.'); }
        return;
      }
      state.pendingDeleteIds = ids;
      if(deleteSubtitleEl){
        deleteSubtitleEl.textContent = `선택된 ${count}개의 항목을 정말 삭제처리하시겠습니까?`;
      }
      if(deleteModalEl) openModal('insight-delete-modal');
    }

    function openDownloadConfirmModal(){
      const total = state.total || 0;
      const selectedCount = getSelectedIds().length;
      if(downloadSubtitleEl){
        downloadSubtitleEl.textContent = selectedCount > 0
          ? `선택된 ${selectedCount}개 또는 전체 ${total}개 결과 중 범위를 선택하세요.`
          : `현재 결과 ${total}개 항목을 CSV로 내보냅니다.`;
      }
      if(csvRowSelected){
        csvRowSelected.hidden = !(selectedCount > 0);
      }
      if(csvOptSelected){
        csvOptSelected.disabled = !(selectedCount > 0);
        csvOptSelected.checked = selectedCount > 0;
      }
      if(csvOptAll){
        csvOptAll.checked = !(selectedCount > 0);
      }
      if(downloadModalEl) openModal('insight-download-modal');
    }

    function openAddModal(){
      state.editingId = null;
      state.viewingId = null;
      applyModalViewMode(false);
      if(modalTitleText) modalTitleText.textContent = `기술자료 ${label} 추가`;
      if(modalSubtitleText) modalSubtitleText.textContent = `${label} 기술자료를 등록합니다.`;
      if(modalSubmitBtn) modalSubmitBtn.textContent = '등록';
      if(modalSubmitBtn) modalSubmitBtn.hidden = false;
      if(modalForm) modalForm.reset();
      // Keep default font size locked to 16px (form.reset() resets selects).
      if(sizeSelectEl) sizeSelectEl.value = '16';
      if(modalAuthorInput && !modalAuthorInput.value.trim()){
        if(currentUserName) modalAuthorInput.value = currentUserName;
      }
      clearEditorFields();
      if(modalTitleInput) modalTitleInput.focus();
      setModalOpen(modalEl, true);
    }

    async function openEditModalById(id){
      const iid = String(id||'').trim();
      if(!iid) return;
      try{
        const data = await apiJson(`/api/insight/items/${encodeURIComponent(iid)}`, { method:'GET', headers:{'Accept':'application/json'} });
        const item = data && data.item;
        if(!item){
          try{ if(typeof showToast === 'function') showToast('수정할 항목을 찾을 수 없습니다.', 'error'); }catch(_e){}
          return;
        }
        state.editingId = item.id;
        state.viewingId = null;
        applyModalViewMode(false);
        if(modalTitleText) modalTitleText.textContent = `기술자료 ${label} 수정`;
        if(modalSubtitleText) modalSubtitleText.textContent = `${label} 기술자료를 수정합니다.`;
        if(modalSubmitBtn) modalSubmitBtn.textContent = '수정';
        if(modalSubmitBtn) modalSubmitBtn.hidden = false;
        if(modalForm) modalForm.reset();
        // Keep default font size locked to 16px (form.reset() resets selects).
        if(sizeSelectEl) sizeSelectEl.value = '16';
        if(modalTitleInput) modalTitleInput.value = String(item.title || '');
        if(modalAuthorInput) modalAuthorInput.value = String(item.author || '');
        if(editorEl) editorEl.innerHTML = String(item.content_html || '');
        // Force 16px (strip any stored inline font-size).
        enforceFixedFontSize16();
        if(tagsInputEl) tagsInputEl.value = String(item.tags || '');
        existingAttachments = Array.isArray(item.attachments) ? item.attachments : [];
        attachmentFiles = [];
        renderEditExistingAttachments(existingAttachments);
        renderAttachmentList();
        if(modalTitleInput) modalTitleInput.focus();
        setModalOpen(modalEl, true);
      }catch(err){
        try{ if(typeof showToast === 'function') showToast(err.message || '불러오기 실패', 'error'); }catch(_e){ alert(err.message || '불러오기 실패'); }
      }
    }

    function closeAddModal(){
      setModalOpen(modalEl, false);
      if(modalForm) modalForm.reset();
      // Keep default font size locked to 16px (form.reset() resets selects).
      if(sizeSelectEl) sizeSelectEl.value = '16';
      state.editingId = null;
      state.viewingId = null;
      applyModalViewMode(false);
      if(modalTitleText) modalTitleText.textContent = `기술자료 ${label} 추가`;
      if(modalSubtitleText) modalSubtitleText.textContent = `${label} 기술자료를 등록합니다.`;
      if(modalSubmitBtn) modalSubmitBtn.textContent = '등록';
      if(modalSubmitBtn) modalSubmitBtn.hidden = false;
      if(modalAuthorInput && currentUserName) modalAuthorInput.value = currentUserName;
      clearEditorFields();
    }

    async function submitAdd(evt){
      evt.preventDefault();
      if(isViewMode){
        closeAddModal();
        return;
      }
      if(!modalTitleInput) return;
      const title = modalTitleInput.value.trim();
      const author = modalAuthorInput ? modalAuthorInput.value.trim() : '';
      // Before reading HTML, enforce 16px and strip any inline font-size markup.
      enforceFixedFontSize16();
      const content_html = editorEl ? editorEl.innerHTML.trim() : '';
      const tags = tagsInputEl ? tagsInputEl.value.trim() : '';
      const wasEdit = !!state.editingId;
      if(!title){
        try{ if(typeof showToast === 'function') showToast('제목을 입력하세요.', 'warning'); }catch(_e){ alert('제목을 입력하세요.'); }
        modalTitleInput.focus();
        return;
      }
      try{
        let savedId = state.editingId;
        if(state.editingId){
          const resp = await apiJson(`/api/insight/items/${state.editingId}`, {
            method:'PATCH',
            headers:{'Content-Type':'application/json','Accept':'application/json'},
            body: JSON.stringify({ title, author, content_html, tags }),
          });
          savedId = (resp && resp.item && resp.item.id) ? resp.item.id : savedId;
        }else{
          const resp = await apiJson('/api/insight/items', {
            method:'POST',
            headers:{'Content-Type':'application/json','Accept':'application/json'},
            body: JSON.stringify({ category, title, author, content_html, tags }),
          });
          savedId = (resp && resp.item && resp.item.id) ? resp.item.id : savedId;
        }

        // Upload attachments after create/update
        if(savedId && attachmentFiles.length){
          const fd = new FormData();
          attachmentFiles.slice(0,10).forEach(f => fd.append('attachments', f, f.name));
          const up = await fetch(`/api/insight/items/${encodeURIComponent(String(savedId))}/attachments`, {
            method:'POST',
            body: fd,
            credentials: 'same-origin',
          });
          if(!up.ok){
            let msg = `첨부파일 업로드 실패 (${up.status})`;
            try{
              const j = await up.json();
              if(j && j.message) msg = j.message;
            }catch(_e){}
            throw new Error(msg);
          }
        }

        closeAddModal();
        if(!wasEdit) state.page = 1;
        await load();
        try{ if(typeof showToast === 'function') showToast(wasEdit ? '수정되었습니다.' : '등록되었습니다.', 'success'); }catch(_e){}
      }catch(err){
        try{ if(typeof showToast === 'function') showToast(err.message || '등록 실패', 'error'); }catch(_e){ alert(err.message || '등록 실패'); }
      }
    }

    // Bind events
    if(searchInput){
      searchInput.addEventListener('input', ()=>{
        setClearVisible();
        const v = searchInput.value.trim();
        if(searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(()=>{
          state.q = v;
          state.page = 1;
          load();
        }, 150);
      });
    }

    if(searchClear && searchInput){
      searchClear.addEventListener('click', ()=>{
        searchInput.value = '';
        setClearVisible();
        state.q = '';
        state.page = 1;
        load();
        searchInput.focus();
      });
    }

    if(pageSizeSel){
      pageSizeSel.addEventListener('change', ()=>{
        state.pageSize = parseInt(pageSizeSel.value, 10) || 10;
        state.page = 1;
        load();
      });
    }

    if(btnDownload) btnDownload.addEventListener('click', openDownloadConfirmModal);
    if(btnDelete) btnDelete.addEventListener('click', openDeleteConfirmModal);
    if(btnAdd) btnAdd.addEventListener('click', openAddModal);

    if(modalClose) modalClose.addEventListener('click', closeAddModal);
    if(modalCancelBtn) modalCancelBtn.addEventListener('click', closeAddModal);
    if(modalEl){
      modalEl.addEventListener('click', (e)=>{
        if(e.target === modalEl) closeAddModal();
      });
    }

    if(deleteClose) deleteClose.addEventListener('click', ()=> closeModal('insight-delete-modal'));
    if(deleteModalEl){
      deleteModalEl.addEventListener('click', (e)=>{
        if(e.target === deleteModalEl) closeModal('insight-delete-modal');
      });
    }
    if(deleteConfirm) deleteConfirm.addEventListener('click', async ()=>{
      const ids = Array.isArray(state.pendingDeleteIds) ? state.pendingDeleteIds : getSelectedIds();
      closeModal('insight-delete-modal');
      await performBulkDelete(ids);
      state.pendingDeleteIds = [];
    });

    if(downloadClose) downloadClose.addEventListener('click', ()=> closeModal('insight-download-modal'));
    if(downloadModalEl){
      downloadModalEl.addEventListener('click', (e)=>{
        if(e.target === downloadModalEl) closeModal('insight-download-modal');
      });
    }
    if(downloadConfirm) downloadConfirm.addEventListener('click', async ()=>{
      const onlySelected = !!(csvOptSelected && csvOptSelected.checked);
      closeModal('insight-download-modal');
      try{
        await exportCsv(onlySelected);
      }catch(err){
        try{ if(typeof showToast === 'function') showToast(err.message || 'CSV 다운로드 실패', 'error'); }catch(_e){ alert(err.message || 'CSV 다운로드 실패'); }
      }
    });

    window.addEventListener('keydown', (e)=>{
      if(e.key !== 'Escape') return;
      if(modalEl && modalEl.classList.contains('show')) closeAddModal();
      if(deleteModalEl && deleteModalEl.classList.contains('show')) closeModal('insight-delete-modal');
      if(downloadModalEl && downloadModalEl.classList.contains('show')) closeModal('insight-download-modal');
    });

    if(modalForm) modalForm.addEventListener('submit', submitAdd);

    // Attachment UI
    if(attachDropEl && attachmentsInputEl){
      attachDropEl.addEventListener('click', ()=> attachmentsInputEl.click());
      attachDropEl.addEventListener('keydown', (e)=>{
        if(e.key === 'Enter' || e.key === ' '){
          e.preventDefault();
          attachmentsInputEl.click();
        }
      });
      attachDropEl.addEventListener('dragover', (e)=>{ e.preventDefault(); setDragState(attachDropEl, true); });
      attachDropEl.addEventListener('dragleave', ()=> setDragState(attachDropEl, false));
      attachDropEl.addEventListener('drop', (e)=>{
        e.preventDefault();
        setDragState(attachDropEl, false);
        const dt = e.dataTransfer;
        if(dt && dt.files) addAttachmentFiles(dt.files);
      });
      attachmentsInputEl.addEventListener('change', ()=>{
        addAttachmentFiles(attachmentsInputEl.files);
        attachmentsInputEl.value = '';
      });
    }

    if(attachListEl){
      attachListEl.addEventListener('click', (e)=>{
        const btn = e.target && e.target.closest && e.target.closest('.blog-attach-remove');
        if(!btn) return;
        const idx = parseInt(btn.getAttribute('data-index') || '-1', 10);
        if(!Number.isFinite(idx) || idx < 0 || idx >= attachmentFiles.length) return;
        attachmentFiles.splice(idx, 1);
        renderAttachmentList();
      });
    }

    if(editAttachmentsListEl){
      editAttachmentsListEl.addEventListener('click', (e)=>{
        const btn = e.target && e.target.closest && e.target.closest('.blog-post-attachment-delete');
        if(!btn) return;
        const aid = btn.getAttribute('data-attachment-id') || '';
        if(!aid) return;
        deleteExistingAttachment(aid);
      });
    }

    // Editor toolbar
    if(editorEl){
      editorEl.addEventListener('keyup', saveSelection);
      editorEl.addEventListener('mouseup', saveSelection);
      editorEl.addEventListener('focus', ()=>{
        // When the caret enters the editor, ensure new typing stays at 16px.
        enforceFixedFontSize16();
        // If the caret is collapsed, seed a 16px ZW span for subsequent typing.
        try{ applyFontSizePx(16); }catch(_e){}
      });
      editorEl.addEventListener('paste', ()=>{
        // Normalize pasted content (often carries font-size spans).
        setTimeout(()=>{
          enforceFixedFontSize16();
        }, 0);
      });
    }
    if(toolbarEl){
      upgradeToolbarUi();

      toolbarEl.addEventListener('mousedown', (e)=>{
        const interactive = e.target && e.target.closest && e.target.closest('select, option, input, textarea, label');
        if(interactive) return;
        const isButton = e.target && e.target.closest && e.target.closest('button');
        if(!isButton) return;
        e.preventDefault();
      });
      toolbarEl.addEventListener('click', (e)=>{
        const sw = e.target && e.target.closest && e.target.closest('.blog-color-swatch');
        if(sw){
          const c = String(sw.getAttribute('data-color') || sw.dataset && sw.dataset.color || '').trim();
          if(!c) return;
          if(colorMode === 'fore'){
            if(colorEl) colorEl.value = c;
            exec('foreColor', c);
            const sample = toolbarEl.querySelector('.blog-color-sample[data-kind="fore"]');
            if(sample) sample.style.backgroundColor = c;
          }else if(colorMode === 'table-col'){
            applyTableColColorFromPending(c);
            const sample = toolbarEl.querySelector('.blog-color-sample[data-kind="table-col"]');
            if(sample) sample.style.backgroundColor = c;
          }else{
            if(highlightEl) highlightEl.value = c;
            exec('hiliteColor', c);
            const sample = toolbarEl.querySelector('.blog-color-sample[data-kind="hilite"]');
            if(sample) sample.style.backgroundColor = c;
          }
          closeColorPopover();
          return;
        }

        const btn = e.target && e.target.closest && e.target.closest('button');
        if(!btn) return;
        const cmd = btn.getAttribute('data-cmd');
        const action = btn.getAttribute('data-action');
        if(cmd) exec(cmd);
        if(action === 'insert-table') insertTable();
        if(action === 'insert-image'){
          if(editorImageInputEl) editorImageInputEl.click();
        }
        if(action === 'insert-sticker'){
          exec('insertText', '🙂');
        }
        if(action === 'insert-checkbox'){
          exec('insertText', '☐ ');
        }
        if(action === 'toggle-fore-palette'){
          const pop = buildColorPopover();
          if(pop && !pop.hidden && colorMode === 'fore'){
            closeColorPopover();
            return;
          }
          openColorPopover('fore', btn);
        }

        if(action === 'table-col-color'){
          if(!editorEl) return;
          const focusCell = getSelectionFocusCellInEditor();
          const activeShell = focusCell ? focusCell.closest && focusCell.closest('.blog-table-shell') : null;
          if(!activeShell) return;
          setTableColColorPending(activeShell, focusCell);
          const pop = buildColorPopover();
          if(pop && !pop.hidden && colorMode === 'table-col'){
            closeColorPopover();
            return;
          }
          openColorPopover('table-col', btn);
        }
        if(action === 'toggle-hilite-palette'){
          // Apply current highlight first (default: yellow) when selection exists
          const c = String(highlightEl && highlightEl.value ? highlightEl.value : DEFAULT_HILITE).trim() || DEFAULT_HILITE;
          try{
            const sel = window.getSelection();
            if(sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed){
              exec('hiliteColor', c);
              const sample = toolbarEl.querySelector('.blog-color-sample[data-kind="hilite"]');
              if(sample) sample.style.backgroundColor = c;
              if(highlightEl) highlightEl.value = c;
            }
          }catch(_e){}
          const pop = buildColorPopover();
          if(pop && !pop.hidden && colorMode === 'hilite'){
            closeColorPopover();
            return;
          }
          openColorPopover('hilite', btn);
        }
      });

      document.addEventListener('click', (e)=>{
        if(!colorPopoverEl || colorPopoverEl.hidden) return;
        if(toolbarEl.contains(e.target)) return;
        closeColorPopover();
      });
    }
    if(editorImageInputEl){
      editorImageInputEl.addEventListener('change', ()=>{
        const f = editorImageInputEl.files && editorImageInputEl.files[0];
        if(!f) return;
        const reader = new FileReader();
        reader.onload = ()=>{
          const url = String(reader.result || '');
          if(url) exec('insertHTML', `<img src="${url}" alt="" style="max-width:100%; height:auto;" /><p><br></p>`);
        };
        reader.readAsDataURL(f);
        editorImageInputEl.value = '';
      });
    }

    if(fontSelectEl){
      fontSelectEl.addEventListener('change', ()=>{
        const v = String(fontSelectEl.value||'').trim();
        if(v) exec('fontName', v);
      });
    }
    if(sizeSelectEl){
      sizeSelectEl.addEventListener('change', ()=>{
        // Lock font size to 16px regardless of user selection.
        sizeSelectEl.value = '16';
        enforceFixedFontSize16();
        try{ applyFontSizePx(16); }catch(_e){}
      });
    }
    if(trackingEl){
      trackingEl.addEventListener('change', ()=>{
        const v = String(trackingEl.value||'').trim();
        if(!v) return;
        // Use insertHTML wrapper for letter-spacing
        try{
          const sel = window.getSelection();
          if(sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed){
            exec('insertHTML', `<span style="letter-spacing:${v}px">${sel.toString()}</span>`);
          }
        }catch(_e){}
      });
    }
    if(colorEl){
      colorEl.addEventListener('input', ()=>{
        const v = String(colorEl.value||'').trim();
        if(v) exec('foreColor', v);
      });
    }
    if(highlightEl){
      highlightEl.addEventListener('input', ()=>{
        const v = String(highlightEl.value||'').trim();
        if(v) exec('hiliteColor', v);
      });
    }

    bindPaginationButtons();

    document.addEventListener('click', (e)=>{
      const btn = e.target.closest('[data-action]');
      if(!btn) return;
      const action = btn.getAttribute('data-action');
      const id = btn.getAttribute('data-id');
      if(action === 'edit'){
        e.preventDefault();
        openEditModalById(id);
      }else if(action === 'view'){
        e.preventDefault();
        openViewModalById(id);
      }
    });

    if(selectAll){
      selectAll.addEventListener('change', ()=>{
        const boxes = document.querySelectorAll('#insight-table-body .row-checkbox');
        boxes.forEach(b => { b.checked = !!selectAll.checked; });
        syncRowSelectedClasses();
        syncSelectAll();
      });
    }

    if(tableBody){
      tableBody.addEventListener('click', (e)=>{
        const t = e.target;
        if(!t) return;

        // Ignore interactive elements (view/edit controls, checkbox itself, etc.)
        if(t.closest('a, button, input, select, textarea, label, [data-action]')) return;

        const tr = t.closest('tr');
        if(!tr) return;
        const cb = tr.querySelector('input.row-checkbox');
        if(!cb) return;

        cb.checked = !cb.checked;
        tr.classList.toggle('selected', cb.checked);
        syncSelectAll();
      });
    }

    document.addEventListener('change', (e)=>{
      const t = e.target;
      if(!t) return;
      if(t.classList && t.classList.contains('row-checkbox')){
        const tr = t.closest('tr');
        if(tr) tr.classList.toggle('selected', !!t.checked);
        syncSelectAll();
      }
    });

    setClearVisible();
    if(modalAuthorInput && currentUserName) modalAuthorInput.value = currentUserName;
    renderAttachmentList();

    // initial load
    load();
  }

  window.BlossomInsightList = {
    initInsightListPage,
  };
})();

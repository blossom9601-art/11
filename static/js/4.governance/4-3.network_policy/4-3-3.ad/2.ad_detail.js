(function(){
  'use strict';

  function ready(fn){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  const API_BASE = '/api/network/ad';

  /* ── Lottie no-data animation helper ── */
  function showNoDataImage(container, altText){
    try{
      if(!container) return;
      container.innerHTML = '';
      var wrap = document.createElement('span');
      wrap.style.display = 'flex'; wrap.style.alignItems = 'center'; wrap.style.justifyContent = 'center';
      wrap.style.padding = '12px 0'; wrap.style.minHeight = '140px'; wrap.style.width = '100%';
      wrap.style.boxSizing = 'border-box'; wrap.style.flexDirection = 'column';
      var jsonPath = '/static/image/svg/free-animated-no-data.json';
      function renderLottie(){
        try{
          if(!window.lottie) return false;
          var animBox = document.createElement('span');
          animBox.style.display = 'inline-block'; animBox.style.width = '240px'; animBox.style.maxWidth = '100%';
          animBox.style.height = '180px'; animBox.style.pointerEvents = 'none';
          var altMsg = altText || '데이터 없음';
          animBox.setAttribute('aria-label', (altMsg+'').split('\n')[0]);
          wrap.appendChild(animBox);
          try{
            window.lottie.loadAnimation({ container: animBox, renderer: 'svg', loop: true, autoplay: true, path: jsonPath });
            var capWrap = document.createElement('span'); capWrap.style.display='block'; capWrap.style.marginTop='8px'; capWrap.style.textAlign='center';
            (altMsg+'').split('\n').forEach(function(line, idx){ var cap=document.createElement('span'); cap.textContent=line; cap.style.display='block'; cap.style.fontSize = idx===0 ? '14px' : '13px'; cap.style.color = '#64748b'; capWrap.appendChild(cap); });
            wrap.appendChild(capWrap); container.appendChild(wrap); return true;
          }catch(_a){ return false; }
        }catch(_){ return false; }
      }
      function loadLottieAndRender(){
        try{
          var script = document.createElement('script'); script.src='https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js'; script.async=true;
          script.onload=function(){ if(!renderLottie()) renderImageFallback(); }; script.onerror=function(){ renderImageFallback(); }; document.head.appendChild(script);
        }catch(_){ renderImageFallback(); }
      }
      function renderImageFallback(){
        try{
          var img = document.createElement('img'); var altMsg = altText || '데이터 없음'; img.alt = (altMsg+'').split('\n')[0]; img.style.maxWidth='240px'; img.style.width='100%'; img.style.height='auto';
          var candidates = [
            '/static/image/svg/free-animated-no-data/no-data.svg','/static/image/svg/free-animated-no-data.svg',
            '/static/image/svg/free-animated-no-data/no-data.gif','/static/image/svg/free-animated-no-data.gif'
          ];
          var idx=0; function setNext(){ if(idx>=candidates.length) return; img.src=candidates[idx++]; }
          img.onerror=function(){ setNext(); }; setNext(); wrap.appendChild(img);
          var capWrap=document.createElement('span'); capWrap.style.display='block'; capWrap.style.marginTop='8px'; capWrap.style.textAlign='center';
          (altMsg+'').split('\n').forEach(function(line, i){ var cap=document.createElement('span'); cap.textContent=line; cap.style.display='block'; cap.style.fontSize = i===0 ? '14px' : '13px'; cap.style.color='#64748b'; capWrap.appendChild(cap); });
          wrap.appendChild(capWrap); container.appendChild(wrap);
        }catch(_f){ }
      }
      if(!renderLottie()){ if(!window.lottie){ loadLottieAndRender(); } else { renderImageFallback(); } }
    }catch(_){ }
  }

  function qs(name){
    try{
      return new URLSearchParams(window.location.search).get(name);
    }catch(_e){
      return null;
    }
  }

  function govDetailId(){
    try{ return (document.body.dataset.govDetailId || '').trim() || null; }
    catch(_e){ return null; }
  }

  // ------------------------------------------------------------
  // CSV helpers
  // ------------------------------------------------------------

  function escapeCsv(val){
    return '"' + String(val == null ? '' : val).replace(/"/g, '""') + '"';
  }

  function yyyymmdd(){
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return { yyyy, mm, dd };
  }

  function downloadCsvFile(filename, lines){
    const csv = '\uFEFF' + lines.join('\r\n');
    try{
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }catch(_e){
      const a2 = document.createElement('a');
      a2.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
      a2.download = filename;
      document.body.appendChild(a2);
      a2.click();
      document.body.removeChild(a2);
    }
  }

  // ------------------------------------------------------------
  // Message modal (on-premise parity)
  // ------------------------------------------------------------

  function ensureMessageModal(){
    let modal = document.getElementById('blossom-message-modal');
    if(modal && document.body.contains(modal)) return modal;

    modal = document.createElement('div');
    modal.id = 'blossom-message-modal';
    modal.className = 'server-add-modal modal-overlay-full blossom-message-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    modal.innerHTML = `
      <div class="server-add-content" role="document">
        <div class="server-add-header">
          <div class="server-add-title">
            <h3 id="blossom-message-modal-title">알림</h3>
            <p class="server-add-subtitle" id="blossom-message-modal-subtitle"></p>
          </div>
          <button class="close-btn" type="button" data-message-modal="close" aria-label="닫기">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
        <div class="server-add-body">
          <div class="dispose-content">
            <div class="dispose-text">
              <p id="blossom-message-modal-body"></p>
            </div>
            <div class="dispose-illust" aria-hidden="true">
              <img id="blossom-message-modal-illust" src="/static/image/svg/free-sticker-message.svg" alt="안내" loading="lazy" />
            </div>
          </div>
        </div>
        <div class="server-add-actions align-right">
          <div class="action-buttons right">
            <button type="button" class="btn-primary" data-message-modal="ok">확인</button>
          </div>
        </div>
      </div>`;

    document.body.appendChild(modal);

    const close = () => closeMessageModal();
    modal.addEventListener('click', (e) => { if(e.target === modal) close(); });
    const btnClose = modal.querySelector('[data-message-modal="close"]');
    const btnOk = modal.querySelector('[data-message-modal="ok"]');
    if(btnClose) btnClose.addEventListener('click', close);
    if(btnOk) btnOk.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if(e.key === 'Escape' && modal.classList.contains('show')) close();
    });

    return modal;
  }

  function closeMessageModal(){
    const modal = document.getElementById('blossom-message-modal');
    if(!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  function openMessageModal(message, title, options){
    const modal = ensureMessageModal();
    if(!modal) return;
    try{ window.BlossomSearchableSelect?.closeAll?.(); }catch(_e){}

    const titleEl = modal.querySelector('#blossom-message-modal-title');
    const subtitleEl = modal.querySelector('#blossom-message-modal-subtitle');
    const bodyEl = modal.querySelector('#blossom-message-modal-body');
    const illustEl = modal.querySelector('#blossom-message-modal-illust');

    const t = (title != null && String(title).trim()) ? String(title).trim() : '알림';
    const m = (message != null) ? String(message) : '';

    const opts = options && typeof options === 'object' ? options : {};
    const kind = (opts.kind ? String(opts.kind).toLowerCase() : 'info');
    const subtitleText = (opts.subtitle != null) ? String(opts.subtitle) : '';
    const illustSrc = opts.illustrationSrc
      ? String(opts.illustrationSrc)
      : (kind === 'success')
        ? '/static/image/svg/free-sticker-approved.svg'
        : (kind === 'error')
          ? '/static/image/svg/error/free-sticker-report.svg'
          : '/static/image/svg/free-sticker-message.svg';

    if(titleEl) titleEl.textContent = t;
    if(subtitleEl) subtitleEl.textContent = subtitleText;
    if(bodyEl) bodyEl.textContent = m;
    if(illustEl){
      illustEl.src = illustSrc;
      illustEl.alt = kind === 'success' ? '완료' : (kind === 'error' ? '오류' : '안내');
    }

    modal.classList.add('show');
    modal.removeAttribute('aria-hidden');
    document.body.classList.add('modal-open');

    const okBtn = modal.querySelector('[data-message-modal="ok"]');
    requestAnimationFrame(() => { try{ okBtn && okBtn.focus(); }catch(_e){} });
  }

  function notifyMessage(message, title, options){
    const m = (message != null) ? String(message) : '';
    const t = (title != null && String(title).trim()) ? String(title).trim() : '알림';
    const opts = options && typeof options === 'object' ? options : {};
    try{ openMessageModal(m, t, opts); }
    catch(_e){ try{ alert(m); }catch(_e2){} }
  }

  // ------------------------------------------------------------
  // Confirm modal (on-premise parity)
  // ------------------------------------------------------------

  let _activeConfirmResolver = null;

  function ensureConfirmModal(){
    let modal = document.getElementById('blossom-confirm-modal');
    if(modal && document.body.contains(modal)) return modal;

    modal = document.createElement('div');
    modal.id = 'blossom-confirm-modal';
    modal.className = 'server-add-modal modal-overlay-full blossom-confirm-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    modal.innerHTML = `
      <div class="server-add-content" role="document">
        <div class="server-add-header">
          <div class="server-add-title">
            <h3 id="blossom-confirm-modal-title">확인</h3>
            <p class="server-add-subtitle" id="blossom-confirm-modal-subtitle"></p>
          </div>
          <button class="close-btn" type="button" data-confirm-modal="close" aria-label="닫기">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
        <div class="server-add-body">
          <div class="dispose-content">
            <div class="dispose-text">
              <p id="blossom-confirm-modal-body"></p>
            </div>
            <div class="dispose-illust" aria-hidden="true">
              <img id="blossom-confirm-modal-illust" src="/static/image/svg/free-sticker-message.svg" alt="확인" loading="lazy" />
            </div>
          </div>
        </div>
        <div class="server-add-actions align-right">
          <div class="action-buttons right">
            <button type="button" class="btn-secondary" data-confirm-modal="cancel">취소</button>
            <button type="button" class="btn-primary" data-confirm-modal="ok">확인</button>
          </div>
        </div>
      </div>`;

    document.body.appendChild(modal);

    const finalize = (result) => {
      try{ closeConfirmModal(); }catch(_e){}
      const resolver = _activeConfirmResolver;
      _activeConfirmResolver = null;
      if(typeof resolver === 'function'){
        try{ resolver(!!result); }catch(_e){}
      }
    };

    modal.addEventListener('click', (e) => {
      if(e.target === modal) finalize(false);
    });

    const btnClose = modal.querySelector('[data-confirm-modal="close"]');
    const btnCancel = modal.querySelector('[data-confirm-modal="cancel"]');
    const btnOk = modal.querySelector('[data-confirm-modal="ok"]');
    if(btnClose) btnClose.addEventListener('click', ()=> finalize(false));
    if(btnCancel) btnCancel.addEventListener('click', ()=> finalize(false));
    if(btnOk) btnOk.addEventListener('click', ()=> finalize(true));

    document.addEventListener('keydown', (e) => {
      if(e.key === 'Escape' && modal.classList.contains('show')) finalize(false);
    });

    return modal;
  }

  function closeConfirmModal(){
    const modal = document.getElementById('blossom-confirm-modal');
    if(!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  function openConfirmModal(message, title, options){
    const modal = ensureConfirmModal();
    if(!modal){
      try{ return Promise.resolve(!!confirm(String(message ?? ''))); }catch(_e){ return Promise.resolve(false); }
    }
    try{ window.BlossomSearchableSelect?.closeAll?.(); }catch(_e){}

    const titleEl = modal.querySelector('#blossom-confirm-modal-title');
    const subtitleEl = modal.querySelector('#blossom-confirm-modal-subtitle');
    const bodyEl = modal.querySelector('#blossom-confirm-modal-body');
    const illustEl = modal.querySelector('#blossom-confirm-modal-illust');
    const btnCancel = modal.querySelector('[data-confirm-modal="cancel"]');
    const btnOk = modal.querySelector('[data-confirm-modal="ok"]');

    const t = (title != null && String(title).trim()) ? String(title).trim() : '확인';
    const m = (message != null) ? String(message) : '';
    const opts = options && typeof options === 'object' ? options : {};
    const kind = (opts.kind ? String(opts.kind).toLowerCase() : 'info');
    const subtitleText = (opts.subtitle != null) ? String(opts.subtitle) : '';
    const okText = (opts.okText != null) ? String(opts.okText) : '확인';
    const cancelText = (opts.cancelText != null) ? String(opts.cancelText) : '취소';
    const illustSrc = opts.illustrationSrc
      ? String(opts.illustrationSrc)
      : (kind === 'error')
        ? '/static/image/svg/error/free-sticker-report.svg'
        : '/static/image/svg/free-sticker-message.svg';

    if(titleEl) titleEl.textContent = t;
    if(subtitleEl) subtitleEl.textContent = subtitleText;
    if(bodyEl) bodyEl.textContent = m;
    if(btnOk) btnOk.textContent = okText;
    if(btnCancel) btnCancel.textContent = cancelText;
    if(illustEl){
      illustEl.src = illustSrc;
      illustEl.alt = kind === 'error' ? '주의' : '확인';
    }

    if(typeof _activeConfirmResolver === 'function'){
      try{ _activeConfirmResolver(false); }catch(_e){}
      _activeConfirmResolver = null;
    }

    modal.classList.add('show');
    modal.removeAttribute('aria-hidden');
    document.body.classList.add('modal-open');

    return new Promise((resolve) => {
      _activeConfirmResolver = resolve;
      requestAnimationFrame(() => { try{ btnOk && btnOk.focus(); }catch(_e){} });
    });
  }

  async function confirmMessage(message, title, options){
    try{ return await openConfirmModal(message, title, options); }
    catch(_e){ try{ return !!confirm(String(message ?? '')); }catch(_e2){ return false; } }
  }

  // ------------------------------------------------------------
  // File tab (gov_ad_policy_file): diagram + attachments
  // Mirrors IP policy file tab behavior.
  // ------------------------------------------------------------

  function initAdPolicyFileTab(adId){
    const diagramBox = document.getElementById('fi-diagram-box');
    const diagramInput = document.getElementById('fi-diagram-input');
    const diagramImg = document.getElementById('fi-diagram-img');
    const diagramEmpty = document.getElementById('fi-diagram-empty');
    const diagramClear = document.getElementById('fi-diagram-clear');

    const attachInput = document.getElementById('fi-attach-input');
    const attachDrop = document.getElementById('fi-attach-drop');
    const attachList = document.getElementById('fi-attach-list');
    const attachCount = document.getElementById('fi-attach-count');

    const noticeModal = document.getElementById('file-notice-modal');
    const noticeText = document.getElementById('file-notice-text');
    const noticeOk = document.getElementById('file-notice-ok');
    const noticeClose = document.getElementById('file-notice-close');

    const replaceModal = document.getElementById('diagram-replace-modal');
    const replaceText = document.getElementById('diagram-replace-text');
    const replaceOk = document.getElementById('diagram-replace-ok');
    const replaceCancel = document.getElementById('diagram-replace-cancel');
    const replaceClose = document.getElementById('diagram-replace-close');

    if(!diagramBox && !attachDrop && !attachList) return;

    function showNotice(msg){
      const text = (msg == null) ? '' : String(msg);
      if(noticeText) noticeText.textContent = text;
      if(noticeModal){
        noticeModal.classList.add('show');
        noticeModal.setAttribute('aria-hidden','false');
        document.body.classList.add('modal-open');
      } else {
        try{ notifyMessage(text, '알림'); }catch(_e){ console.warn(text); }
      }
    }
    function hideNotice(){
      if(noticeModal){
        noticeModal.classList.remove('show');
        noticeModal.setAttribute('aria-hidden','true');
        document.body.classList.remove('modal-open');
      }
    }
    noticeOk && noticeOk.addEventListener('click', function(e){ e.preventDefault(); hideNotice(); });
    noticeClose && noticeClose.addEventListener('click', function(e){ e.preventDefault(); hideNotice(); });
    noticeModal && noticeModal.addEventListener('click', function(e){ if(e.target === noticeModal) hideNotice(); });
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && noticeModal && noticeModal.classList.contains('show')) hideNotice(); });

    function setDiagramPreviewFromUrl(url){
      if(!diagramImg || !diagramEmpty) return;
      if(!url){
        diagramImg.removeAttribute('src');
        diagramImg.hidden = true;
        diagramEmpty.hidden = false;
        if(diagramBox) diagramBox.classList.remove('has-image');
        return;
      }
      diagramImg.src = url;
      diagramImg.hidden = false;
      diagramEmpty.hidden = true;
      if(diagramBox) diagramBox.classList.add('has-image');
    }
    diagramImg && diagramImg.addEventListener('error', function(){
      try{ diagramImg.removeAttribute('src'); }catch(_e){}
      try{ diagramImg.hidden = true; }catch(_e){}
      try{ if(diagramEmpty) diagramEmpty.hidden = false; }catch(_e){}
      try{ if(diagramBox) diagramBox.classList.remove('has-image'); }catch(_e){}
    });

    function downloadUrlFromToken(token){
      if(!token) return '';
      return '/api/uploads/' + encodeURIComponent(token) + '/download';
    }

    function humanSize(bytes){
      try{
        if(bytes == null || bytes === '') return '-';
        const b = Number(bytes);
        if(!Number.isFinite(b)) return String(bytes);
        if(b < 1024) return b + ' B';
        const units = ['KB','MB','GB','TB'];
        let v = b;
        let i = -1;
        while(v >= 1024 && i < units.length - 1){ v /= 1024; i += 1; }
        return v.toFixed(1) + ' ' + units[i];
      }catch(_e){
        return String(bytes || '-');
      }
    }

    function updateAttachCount(){
      if(!attachCount) return;
      const n = attachList ? attachList.querySelectorAll('li').length : 0;
      attachCount.textContent = String(n);
      attachCount.classList.remove('large-number','very-large-number');
      if(n >= 100) attachCount.classList.add('very-large-number');
      else if(n >= 10) attachCount.classList.add('large-number');
    }

    async function apiJson(url, options){
      const res = await fetch(url, {
        credentials: 'same-origin',
        headers: { ...(options && options.headers ? options.headers : {}) },
        ...options,
      });
      let body = null;
      try{ body = await res.json(); }catch(_e){ body = null; }
      if(!res.ok || (body && body.success === false)){
        const msg = (body && (body.message || body.error)) ? (body.message || body.error) : ('요청 실패 (' + res.status + ')');
        const err = new Error(msg);
        err.status = res.status;
        err.body = body;
        throw err;
      }
      return body;
    }

    async function uploadFileToServer(file){
      const fd = new FormData();
      fd.append('file', file);
      const rec = await apiJson('/api/uploads', { method: 'POST', body: fd });
      return {
        uploadToken: rec.id,
        fileName: rec.name,
        fileSize: rec.size,
        downloadUrl: downloadUrlFromToken(rec.id),
      };
    }

    async function createDiagramRecord(payload){
      const res = await apiJson('/api/network/ad-diagrams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return res.item;
    }

    async function deleteDiagramRecord(diagramId){
      const res = await apiJson('/api/network/ad-diagrams/' + encodeURIComponent(String(diagramId)), { method: 'DELETE' });
      return res.deleted;
    }

    async function deleteUploadToken(token){
      if(!token) return;
      try{ await apiJson('/api/uploads/' + encodeURIComponent(token), { method: 'DELETE' }); }
      catch(_e){ }
    }

    function isImageFile(file){
      const mime = ((file && file.type) || '').toLowerCase();
      const name = ((file && file.name) || '').toLowerCase();
      return mime.startsWith('image/') && (
        name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.gif') || name.endsWith('.webp')
      );
    }

    let currentPrimaryDiagram = null;
    let loading = false;
    let pendingDiagramFile = null;

    function hideReplaceConfirm(){
      pendingDiagramFile = null;
      if(replaceModal){
        replaceModal.classList.remove('show');
        replaceModal.setAttribute('aria-hidden','true');
        document.body.classList.remove('modal-open');
      }
    }

    function showReplaceConfirm(file){
      pendingDiagramFile = file || null;
      if(replaceText){
        const name = file && file.name ? String(file.name) : '';
        replaceText.textContent = name ? ('기존 구성도를 "' + name + '" 파일로 교체하시겠습니까?') : '기존 구성도를 교체하시겠습니까?';
      }
      if(replaceModal){
        replaceModal.classList.add('show');
        replaceModal.setAttribute('aria-hidden','false');
        document.body.classList.add('modal-open');
      } else {
        const ok = confirm('기존 구성도를 교체하시겠습니까?');
        if(ok) handleConfirmedReplace();
        else pendingDiagramFile = null;
      }
    }

    async function handleConfirmedReplace(){
      const file = pendingDiagramFile;
      hideReplaceConfirm();
      if(!file) return;

      if(currentPrimaryDiagram && currentPrimaryDiagram.id){
        if(loading) return;
        loading = true;
        try{
          const token = currentPrimaryDiagram.upload_token;
          await deleteDiagramRecord(currentPrimaryDiagram.id);
          await deleteUploadToken(token);
          currentPrimaryDiagram = null;
        }catch(err){
          console.error(err);
          showNotice((err && err.message) ? err.message : '기존 구성도 삭제 중 오류가 발생했습니다.');
          try{ await loadState(); }catch(_e){}
          loading = false;
          return;
        }finally{
          loading = false;
        }
      }

      await handleDiagramFile(file);
    }

    replaceOk && replaceOk.addEventListener('click', function(e){ e.preventDefault(); handleConfirmedReplace().catch(function(err){ console.error(err); showNotice((err && err.message) ? err.message : '구성도 교체 중 오류가 발생했습니다.'); }); });
    replaceCancel && replaceCancel.addEventListener('click', function(e){ e.preventDefault(); hideReplaceConfirm(); });
    replaceClose && replaceClose.addEventListener('click', function(e){ e.preventDefault(); hideReplaceConfirm(); });
    replaceModal && replaceModal.addEventListener('click', function(e){ if(e.target === replaceModal) hideReplaceConfirm(); });
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && replaceModal && replaceModal.classList.contains('show')) hideReplaceConfirm(); });

    function renderAttachments(items){
      if(!attachList) return;
      attachList.innerHTML = '';
      (items || []).forEach(function(it){
        const li = document.createElement('li');
        li.className = 'attach-item';
        li.dataset.id = String(it.id);
        li.dataset.uploadToken = String(it.upload_token || '');
        const fileName = it.file_name || it.title || '파일';
        const sizeText = humanSize(it.file_size);
        const token = it.upload_token || '';
        const href = it.file_path || (token ? downloadUrlFromToken(token) : '');
        const ext = (String(fileName).split('.').pop() || '').slice(0, 6).toUpperCase();
        li.innerHTML =
          '<div class="file-chip"><span class="file-badge">' + (ext || 'FILE') + '</span><span class="name">' + String(fileName).replace(/</g,'&lt;') + '</span><span class="size">' + sizeText + '</span></div>' +
          '<div class="chip-actions">' +
            '<button class="icon-btn js-att-dl" type="button" title="다운로드" aria-label="다운로드" ' + (href ? '' : 'disabled') + '>' +
              '<img src="/static/image/svg/list/free-icon-download.svg" alt="다운" class="action-icon">' +
            '</button>' +
            '<button class="icon-btn danger js-att-del" type="button" title="삭제" aria-label="삭제">' +
              '<img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon">' +
            '</button>' +
          '</div>';
        li.dataset.href = href;
        attachList.appendChild(li);
      });
      updateAttachCount();
    }

    async function loadState(){
      if(!adId){
        showNotice('ad id가 없습니다. 목록에서 다시 진입해주세요.');
        return;
      }
      const data = await apiJson('/api/network/ad-diagrams?ad_id=' + encodeURIComponent(String(adId)));
      const items = Array.isArray(data.items) ? data.items : [];
      const diagrams = items.filter(function(it){ return String(it.entry_type || '').toUpperCase() === 'DIAGRAM'; });
      const primary = diagrams.find(function(it){ return !!it.is_primary; }) || diagrams[0] || null;
      currentPrimaryDiagram = primary;

      const primaryUrl = primary ? (primary.file_path || (primary.upload_token ? downloadUrlFromToken(primary.upload_token) : '')) : '';
      setDiagramPreviewFromUrl(primaryUrl);

      const attachments = items.filter(function(it){ return String(it.entry_type || '').toUpperCase() !== 'DIAGRAM'; });
      renderAttachments(attachments);
    }

    async function handleDiagramFile(file){
      if(loading) return;
      if(!file) return;
      if(!isImageFile(file)){
        showNotice('이미지 파일만 업로드 가능합니다.');
        return;
      }
      if(!adId){
        showNotice('ad id가 없습니다.');
        return;
      }

      loading = true;
      try{
        const localUrl = URL.createObjectURL(file);
        setDiagramPreviewFromUrl(localUrl);

        const uploaded = await uploadFileToServer(file);
        const created = await createDiagramRecord({
          ad_id: adId,
          entry_type: 'DIAGRAM',
          file_name: uploaded.fileName,
          file_size: uploaded.fileSize,
          mime_type: file.type || 'application/octet-stream',
          upload_token: uploaded.uploadToken,
          file_path: uploaded.downloadUrl,
          is_primary: true,
          title: uploaded.fileName,
        });
        currentPrimaryDiagram = created;
        setDiagramPreviewFromUrl(created.file_path || uploaded.downloadUrl);
      }catch(err){
        console.error(err);
        showNotice((err && err.message) ? err.message : '구성도 업로드 중 오류가 발생했습니다.');
        try{ await loadState(); }catch(_e){}
      }finally{
        loading = false;
      }
    }

    async function clearDiagram(){
      if(loading) return;
      if(!currentPrimaryDiagram || !currentPrimaryDiagram.id){
        setDiagramPreviewFromUrl('');
        return;
      }
      loading = true;
      try{
        const token = currentPrimaryDiagram.upload_token;
        await deleteDiagramRecord(currentPrimaryDiagram.id);
        await deleteUploadToken(token);
        currentPrimaryDiagram = null;
        setDiagramPreviewFromUrl('');
      }catch(err){
        console.error(err);
        showNotice((err && err.message) ? err.message : '구성도 삭제 중 오류가 발생했습니다.');
      }finally{
        loading = false;
      }
    }

    async function handleAttachmentFiles(files){
      if(loading) return;
      if(!adId){
        showNotice('ad id가 없습니다.');
        return;
      }
      const list = Array.from(files || []).filter(Boolean);
      if(!list.length) return;

      loading = true;
      try{
        for(const f of list){
          const uploaded = await uploadFileToServer(f);
          await createDiagramRecord({
            ad_id: adId,
            entry_type: 'ATTACHMENT',
            file_name: uploaded.fileName,
            file_size: uploaded.fileSize,
            mime_type: f.type || 'application/octet-stream',
            upload_token: uploaded.uploadToken,
            file_path: uploaded.downloadUrl,
            title: uploaded.fileName,
          });
        }
        await loadState();
      }catch(err){
        console.error(err);
        showNotice((err && err.message) ? err.message : '첨부파일 업로드 중 오류가 발생했습니다.');
        try{ await loadState(); }catch(_e){}
      }finally{
        loading = false;
      }
    }

    function pickDiagram(){ if(diagramInput) diagramInput.click(); }
    diagramBox && diagramBox.addEventListener('click', pickDiagram);
    diagramBox && diagramBox.addEventListener('keypress', function(e){ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); pickDiagram(); } });
    ;['dragenter','dragover'].forEach(function(ev){ diagramBox && diagramBox.addEventListener(ev, function(e){ e.preventDefault(); e.stopPropagation(); diagramBox.classList.add('dragover'); }); });
    ;['dragleave','drop'].forEach(function(ev){ diagramBox && diagramBox.addEventListener(ev, function(e){
      e.preventDefault(); e.stopPropagation();
      diagramBox.classList.remove('dragover');
      if(ev === 'drop'){
        const dt = e.dataTransfer;
        const file = dt && dt.files && dt.files[0];
        if(file){
          const hasExisting = !!(currentPrimaryDiagram && currentPrimaryDiagram.id);
          if(hasExisting) showReplaceConfirm(file);
          else handleDiagramFile(file);
        }
      }
    }); });
    diagramInput && diagramInput.addEventListener('change', function(){
      const file = diagramInput.files && diagramInput.files[0];
      if(file){
        const hasExisting = !!(currentPrimaryDiagram && currentPrimaryDiagram.id);
        if(hasExisting) showReplaceConfirm(file);
        else handleDiagramFile(file);
      }
      diagramInput.value = '';
    });
    diagramClear && diagramClear.addEventListener('click', function(e){ e.preventDefault(); clearDiagram(); });

    function pickAttachments(){ if(attachInput) attachInput.click(); }
    attachDrop && attachDrop.addEventListener('click', pickAttachments);
    attachDrop && attachDrop.addEventListener('keypress', function(e){ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); pickAttachments(); } });
    ;['dragenter','dragover'].forEach(function(ev){ attachDrop && attachDrop.addEventListener(ev, function(e){ e.preventDefault(); e.stopPropagation(); attachDrop.classList.add('dragover'); }); });
    ;['dragleave','drop'].forEach(function(ev){ attachDrop && attachDrop.addEventListener(ev, function(e){
      e.preventDefault(); e.stopPropagation();
      attachDrop.classList.remove('dragover');
      if(ev === 'drop'){
        const dt = e.dataTransfer;
        if(dt && dt.files && dt.files.length) handleAttachmentFiles(dt.files);
      }
    }); });
    attachInput && attachInput.addEventListener('change', function(){
      const files = attachInput.files;
      if(files && files.length) handleAttachmentFiles(files);
      attachInput.value = '';
    });

    attachList && attachList.addEventListener('click', async function(e){
      const delBtn = e.target.closest('.js-att-del');
      const dlBtn = e.target.closest('.js-att-dl');
      const li = e.target.closest('li.attach-item');
      if(!li) return;
      const id = parseInt(li.dataset.id || '', 10);
      const token = li.dataset.uploadToken || '';
      const href = li.dataset.href || '';
      if(dlBtn){
        e.preventDefault();
        if(href) window.open(href, '_blank');
        return;
      }
      if(delBtn){
        e.preventDefault();
        if(!Number.isFinite(id)) return;
        if(loading) return;
        loading = true;
        try{
          await deleteDiagramRecord(id);
          await deleteUploadToken(token);
          li.remove();
          updateAttachCount();
        }catch(err){
          console.error(err);
          showNotice((err && err.message) ? err.message : '첨부파일 삭제 중 오류가 발생했습니다.');
          try{ await loadState(); }catch(_e){}
        }finally{
          loading = false;
        }
      }
    });

    loadState().catch(function(err){
      console.error(err);
      showNotice((err && err.message) ? err.message : '구성/파일 정보를 불러오지 못했습니다.');
    });
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

  function setStatusBadge(id, value){
    const el = document.getElementById(id);
    if(!el) return;
    const raw = (value == null || String(value).trim() === '') ? '-' : String(value);
    const normalizedUpper = raw.trim().toUpperCase();
    const map = {
      // Korean
      '활성': 'ws-run',
      '예약': 'ws-idle',
      '비활성': 'ws-wait',
      // Uppercase enum-ish
      'ACTIVE': 'ws-run',
      'RESERVED': 'ws-idle',
      'INACTIVE': 'ws-wait',
    };
    const cls = map[raw] || map[normalizedUpper] || 'ws-wait';

    el.classList.add('status-pill');
    el.innerHTML = `<span class="status-dot ${cls}" aria-hidden="true"></span><span class="status-text">${escapeHtml(raw)}</span>`;
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

  function tabLabel(tabKey){
    const k = String(tabKey || '').trim();
    if(k === 'gov_ad_policy_detail') return '기본정보';
    if(k === 'gov_ad_policy_domain') return '도메인 관리';
    if(k === 'gov_ad_policy_account') return '계정 관리';
    if(k === 'gov_ad_policy_file') return '구성/파일';
    if(k === 'gov_ad_policy_log') return '변경이력';
    return k || '-';
  }

  function normalizeDateLabel(s){
    const v = String(s ?? '').trim();
    return v === '' ? '-' : v;
  }

  function buildEditForm(record){
    const form = document.getElementById('system-edit-form');
    if(!form) return;

    const val = (k) => (record && record[k] != null) ? String(record[k]) : '';

    form.innerHTML = `
      <div class="form-section">
        <div class="section-header"><h4>AD</h4></div>
        <div class="form-grid">
          <div class="form-row"><label>상태</label>
            <select name="status" class="form-input">
              <option value="" ${!val('status') ? 'selected' : ''}>선택</option>
              <option value="활성" ${val('status')==='활성' ? 'selected' : ''}>활성</option>
              <option value="예약" ${val('status')==='예약' ? 'selected' : ''}>예약</option>
              <option value="비활성" ${val('status')==='비활성' ? 'selected' : ''}>비활성</option>
            </select>
          </div>
          <div class="form-row"><label>도메인명</label><input name="domain" class="form-input" value="${val('domain')}" placeholder="corp.local"></div>
          <div class="form-row"><label>FQDN 수</label><input name="fqdn_count" type="text" class="form-input locked-input" placeholder="-" readonly disabled></div>
          <div class="form-row"><label>계정 수</label><input name="account_count" type="text" class="form-input locked-input" placeholder="-" readonly disabled></div>
          <div class="form-row"><label>역할</label><input name="role" class="form-input" value="${val('role')}" placeholder="예: 도메인 컨트롤러"></div>
          <div class="form-row form-row-wide"><label>비고</label><textarea name="note" class="form-input textarea-large" rows="6">${val('note')}</textarea></div>
        </div>
      </div>
    `;
  }

  function formToPayload(form){
    const fd = new FormData(form);
    const payload = {};
    for(const [k, v] of fd.entries()){
      payload[k] = typeof v === 'string' ? v.trim() : v;
    }
    return payload;
  }

  function showInlineError(message){
    notifyMessage(message, '오류', {kind: 'error'});
  }

  async function fetchAdFqdnsForStats(adId){
    const data = await apiRequest(`${API_BASE}/${encodeURIComponent(adId)}/fqdns`, { method: 'GET' });
    return Array.isArray(data.items) ? data.items : [];
  }

  async function fetchAdAccountsForStats(adId){
    const data = await apiRequest(`${API_BASE}/${encodeURIComponent(adId)}/accounts`, { method: 'GET' });
    return Array.isArray(data.items) ? data.items : [];
  }

  function normalizeActiveKey(raw){
    const s = (raw == null) ? '' : String(raw).trim();
    if(!s) return 'INACTIVE';
    const u = s.toUpperCase();
    // common variants
    if(u === 'ACTIVE' || u === 'ENABLED' || u === 'TRUE' || u === 'Y' || s === '활성') return 'ACTIVE';
    if(u === 'INACTIVE' || u === 'DISABLED' || u === 'FALSE' || u === 'N' || s === '비활성') return 'INACTIVE';
    // default: treat unknown as INACTIVE to avoid inflating active counts
    return 'INACTIVE';
  }

  function initDonutStats(opts){
    const statsWrap = document.getElementById(opts.wrapId);
    const pie = document.getElementById(opts.pieId);
    const legend = document.getElementById(opts.legendId);
    const totalEl = document.getElementById(opts.totalId);
    const emptyEl = document.getElementById(opts.emptyId);
    if(!statsWrap || !pie || !legend) return;

    const statuses = [
      { key: 'ACTIVE', label: '활성', seg: 'seg1' },
      { key: 'INACTIVE', label: '비활성', seg: 'seg3' },
    ];

    const getColor = (seg, fallback) => {
      try{
        const v = getComputedStyle(statsWrap).getPropertyValue(`--${seg}`).trim();
        return v || fallback;
      }catch(_e){
        return fallback;
      }
    };

    const colors = {
      seg1: getColor('seg1', '#6366F1'),
      seg3: getColor('seg3', '#6b7280'),
    };

    const pctText = (count, total) => {
      if(!total) return '0%';
      const p = Math.round((count / total) * 100);
      return `${p}%`;
    };

    const renderLegend = (counts, total) => {
      legend.innerHTML = '';
      statuses.forEach((s) => {
        const count = counts[s.key] || 0;
        const li = document.createElement('li');
        li.className = 'legend-item';

        const dot = document.createElement('span');
        dot.className = `legend-dot ${s.seg}`;
        dot.setAttribute('aria-hidden', 'true');

        const host = document.createElement('span');
        host.className = 'legend-host';
        host.textContent = s.label;

        const size = document.createElement('span');
        size.className = 'legend-size';
        size.textContent = `${count} (${pctText(count, total)})`;

        li.appendChild(dot);
        li.appendChild(host);
        li.appendChild(size);
        legend.appendChild(li);
      });
    };

    const renderPie = (counts, total) => {
      if(totalEl) totalEl.textContent = String(total || 0);
      if(!total){
        statsWrap.style.display = 'none';
        if(emptyEl){ emptyEl.hidden = false; try{ showNoDataImage(emptyEl, opts.emptyText || '상태 데이터가 없습니다.'); }catch(_e){} }
        return;
      }

      statsWrap.style.display = '';
      if(emptyEl){ emptyEl.hidden = true; }

      let start = 0;
      const parts = [];
      statuses.forEach((s, idx) => {
        const count = counts[s.key] || 0;
        const isLast = idx === statuses.length - 1;
        const raw = (count / total) * 360;
        const end = isLast ? 360 : (start + raw);
        const color = (s.seg === 'seg1') ? colors.seg1 : colors.seg3;
        parts.push(`${color} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`);
        start = end;
      });
      pie.style.background = `conic-gradient(${parts.join(', ')})`;
      renderLegend(counts, total);
    };

    pie.style.background = 'conic-gradient(#e5e7eb 0 360deg)';
    legend.innerHTML = '';
    if(emptyEl) emptyEl.hidden = true;
    if(totalEl) totalEl.textContent = '...';

    Promise.resolve()
      .then(() => opts.fetchItems())
      .then((items) => {
        const counts = { ACTIVE: 0, INACTIVE: 0 };
        (items || []).forEach((it) => {
          const key = normalizeActiveKey(it && it.status);
          counts[key] += 1;
        });
        const total = (counts.ACTIVE || 0) + (counts.INACTIVE || 0);
        renderPie(counts, total);
      })
      .catch(() => {
        statsWrap.style.display = 'none';
        if(emptyEl){ emptyEl.hidden = false; try{ showNoDataImage(emptyEl, opts.emptyText || '상태 데이터가 없습니다.'); }catch(_e){} }
        if(totalEl) totalEl.textContent = '0';
      });
  }

  function initAdDomainStatsCard(adId){
    initDonutStats({
      wrapId: 'ad-domain-stats',
      pieId: 'ad-domain-pie',
      legendId: 'ad-domain-legend',
      totalId: 'ad-domain-total',
      emptyId: 'ad-domain-empty',
      emptyText: '도메인 상태 데이터가 없습니다.',
      fetchItems: () => fetchAdFqdnsForStats(adId),
    });
  }

  function initAdAccountStatsCard(adId){
    initDonutStats({
      wrapId: 'ad-account-stats',
      pieId: 'ad-account-pie',
      legendId: 'ad-account-legend',
      totalId: 'ad-account-total',
      emptyId: 'ad-account-empty',
      emptyText: '계정 상태 데이터가 없습니다.',
      fetchItems: () => fetchAdAccountsForStats(adId),
    });
  }

  // ------------------------------------------------------------
  // Domain tab (gov_ad_policy_domain): FQDN CRUD
  // ------------------------------------------------------------

  async function initAdPolicyFqdnTab(adId){
    const table = document.getElementById('ad-fqdn-table');
    const tbody = document.getElementById('ad-fqdn-table-body');
    const addBtn = document.getElementById('ad-fqdn-row-add-btn');
    const downloadBtn = document.getElementById('ad-fqdn-download-btn');
    const emptyEl = document.getElementById('ad-fqdn-empty');
    const pageSizeSel = document.getElementById('ad-fqdn-page-size');

    const paginationInfo = document.getElementById('ad-fqdn-pagination-info');
    const btnFirst = document.getElementById('ad-fqdn-first');
    const btnPrev = document.getElementById('ad-fqdn-prev');
    const btnNext = document.getElementById('ad-fqdn-next');
    const btnLast = document.getElementById('ad-fqdn-last');
    const pageNumbers = document.getElementById('ad-fqdn-page-numbers');

    const selectAll = document.getElementById('ad-fqdn-select-all');
    const ipDatalist = document.getElementById('ad-fqdn-ip-datalist');

    if(!tbody || !pageSizeSel) return;

    const EDIT_ICON_SRC = '/static/image/svg/list/free-icon-pencil.svg';
    const SAVE_ICON_SRC = '/static/image/svg/save.svg';

    let state = {
      page: 1,
      pageSize: parseInt(pageSizeSel.value, 10) || 10,
      total: 0,
      allItems: [],
      items: [],
      selected: new Set(),
    };

    let inlineEditor = { active:false, mode:'', fqdnId:0, originalRowHtml:'' };

    let adDomainSuffix = '';
    try{
      const adRec = await apiRequest(`${API_BASE}/${encodeURIComponent(adId)}`, { method: 'GET' });
      adDomainSuffix = String((adRec && (adRec.domain || adRec.domain_name)) || '').trim();
    }catch(_e){
      adDomainSuffix = '';
    }

    // Reduce confirm fatigue (DNS record tab parity): once confirmed, skip re-prompting
    // for the rest of this page session.
    let skipDeleteConfirm = false;

    // Lookup caches (loaded lazily once per tab session)
    let lookupLoaded = false;
    let deptItems = [];
    let userItems = [];

    function setEmptyHidden(hidden){
      if(!emptyEl) return;
      emptyEl.hidden = !!hidden;
    }

    function statusPillHtml(statusLabel){
      const raw = String(statusLabel == null ? '' : statusLabel).trim() || '-';
      const u = raw.toUpperCase();
      const label = (u === 'ACTIVE' || raw === '활성') ? '활성'
        : (u === 'INACTIVE' || raw === '비활성') ? '비활성'
        : (u === 'RESERVED' || raw === '예약') ? '예약'
        : raw;
      const cls = (u === 'ACTIVE' || raw === '활성') ? 'ws-run'
        : (u === 'RESERVED' || raw === '예약') ? 'ws-idle'
        : 'ws-wait';
      return `<span class="status-pill"><span class="status-dot ${cls}" aria-hidden="true"></span><span class="status-text">${escapeHtml(label)}</span></span>`;
    }

    function statusValueFromAny(v){
      const raw = String(v == null ? '' : v).trim();
      if(!raw) return 'ACTIVE';
      const u = raw.toUpperCase();
      if(u === 'ACTIVE' || raw === '활성') return 'ACTIVE';
      if(u === 'INACTIVE' || raw === '비활성') return 'INACTIVE';
      if(u === 'RESERVED' || raw === '예약') return 'RESERVED';
      return u;
    }

    function statusLabelFromAny(v){
      const u = statusValueFromAny(v);
      if(u === 'ACTIVE') return '활성';
      if(u === 'INACTIVE') return '비활성';
      if(u === 'RESERVED') return '예약';
      return String(v == null ? '' : v).trim();
    }

    function hostFromFqdn(fqdn){
      const s = String(fqdn == null ? '' : fqdn).trim();
      if(!s) return '';
      const i = s.indexOf('.');
      return i > 0 ? s.slice(0, i) : s;
    }

    function suffixFromFqdn(fqdn){
      const s = String(fqdn == null ? '' : fqdn).trim();
      const i = s.indexOf('.');
      return i > 0 ? s.slice(i + 1) : '';
    }

    function exportCsv(){
      const rows = Array.isArray(state.allItems) ? state.allItems : [];
      if(rows.length === 0){
        try{ notifyMessage('다운로드할 데이터가 없습니다.', '알림'); }catch(_e){}
        return;
      }
      const headers = ['상태','유형','호스트','FQDN','IP','서비스','비고'];
      const dataRows = rows.map((r)=>{
        const fqdn = (r && r.fqdn) || '';
        return [
          statusLabelFromAny(r && r.status),
          (r && r.role) || '',
          (r && r.host) || hostFromFqdn(fqdn),
          fqdn,
          (r && r.ip_address) || '',
          (r && r.purpose) || '',
          (r && r.remark) || '',
        ];
      });
      const lines = [headers].concat(dataRows).map(arr => arr.map(escapeCsv).join(','));
      const { yyyy, mm, dd } = yyyymmdd();
      downloadCsvFile(`AD_도메인관리_${yyyy}${mm}${dd}.csv`, lines);
    }

    function totalPages(){
      return Math.max(1, Math.ceil((state.total || 0) / (state.pageSize || 10)));
    }

    function renderPagination(){
      const total = state.total || 0;
      const page = state.page;
      const pages = totalPages();

      if(paginationInfo){
        if(total <= 0) paginationInfo.textContent = `0-0 / 0개 항목`;
        else {
          const start = ((page - 1) * state.pageSize) + 1;
          const end = Math.min(total, page * state.pageSize);
          paginationInfo.textContent = `${start}-${end} / ${total}개 항목`;
        }
      }

      if(btnFirst) btnFirst.disabled = page <= 1;
      if(btnPrev) btnPrev.disabled = page <= 1;
      if(btnNext) btnNext.disabled = page >= pages;
      if(btnLast) btnLast.disabled = page >= pages;

      if(pageNumbers){
        pageNumbers.innerHTML = '';
        const totalPagesSafe = Math.max(1, pages || 1);
        const max = 7;
        let start = Math.max(1, page - Math.floor(max / 2));
        let end = start + max - 1;
        if(end > totalPagesSafe){
          end = totalPagesSafe;
          start = Math.max(1, end - max + 1);
        }
        const parts = [];
        for(let p=start; p<=end; p++){
          parts.push(`<button type="button" class="page-btn${p===page?' active':''}" data-page="${p}">${p}</button>`);
        }
        pageNumbers.innerHTML = parts.join('');
      }
    }

    function updateSelectAll(){
      if(!selectAll) return;
      const boxes = tbody.querySelectorAll('.ad-fqdn-row-select');
      if(!boxes.length){ selectAll.checked = false; return; }
      selectAll.checked = [...boxes].every(b => b.checked);
    }

    function buildRow(r){
      const id = r && r.fqdn_id != null ? String(r.fqdn_id) : '';
      const numId = parseInt(id || '0', 10) || 0;
      const checked = numId && state.selected.has(numId) ? 'checked' : '';
      const selectedClass = numId && state.selected.has(numId) ? 'selected' : '';
      const fqdn = (r && r.fqdn) || '';
      const host = ((r && r.host) || hostFromFqdn(fqdn) || '').trim() || '-';
      return `
        <tr data-id="${escapeHtml(id)}" class="${selectedClass}">
          <td><input type="checkbox" class="ad-fqdn-row-select" data-id="${escapeHtml(id)}" ${checked} aria-label="선택"></td>
          <td>${statusPillHtml(r && r.status)}</td>
          <td>${escapeHtml((r && r.role) || '-')}</td>
          <td>${escapeHtml(host)}</td>
          <td>${escapeHtml(fqdn || '-')}</td>
          <td>${escapeHtml((r && r.ip_address) || '-')}</td>
          <td>${escapeHtml((r && r.purpose) || '-')}</td>
          <td>${escapeHtml((r && r.remark) || '-')}</td>
          <td class="system-actions">
            <button type="button" class="action-btn" data-action="edit" data-id="${escapeHtml(id)}" title="수정" aria-label="수정">
              <img src="${EDIT_ICON_SRC}" alt="수정" class="action-icon">
            </button>
            <button type="button" class="action-btn" data-action="delete" data-id="${escapeHtml(id)}" title="삭제" aria-label="삭제">
              <img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon">
            </button>
          </td>
        </tr>
      `;
    }

    function editorRowHtml({ mode, record }){
      const r = record || {};
      const fqdnId = r.fqdn_id ? parseInt(r.fqdn_id, 10) : 0;
      const status = statusValueFromAny(r.status);
      const fqdn = String(r.fqdn || '').trim();
      const host = String(r.host || '').trim() || hostFromFqdn(fqdn);
      const role = String(r.role || '').trim();
      const isEdit = mode === 'edit';
      return `
        <tr class="ad-fqdn-editor" data-mode="${escapeHtml(mode)}" data-id="${fqdnId}">
          <td><input type="checkbox" disabled aria-label="선택" /></td>
          <td>
            <select name="status" class="form-input search-select fk-select" data-placeholder="상태 선택" data-searchable-scope="page" aria-label="상태">
              <option value="ACTIVE" ${status === 'ACTIVE' ? 'selected' : ''}>활성</option>
              <option value="INACTIVE" ${status === 'INACTIVE' ? 'selected' : ''}>비활성</option>
              <option value="RESERVED" ${status === 'RESERVED' ? 'selected' : ''}>예약</option>
            </select>
          </td>
          <td>
            <select name="role" class="form-input search-select fk-select" data-placeholder="유형 선택" data-searchable-scope="page" aria-label="유형">
              <option value="" ${!role ? 'selected' : ''}>-</option>
              <option value="PDC" ${role === 'PDC' ? 'selected' : ''}>PDC</option>
              <option value="BDC" ${role === 'BDC' ? 'selected' : ''}>BDC</option>
              <option value="GC" ${role === 'GC' ? 'selected' : ''}>GC</option>
              <option value="RODC" ${role === 'RODC' ? 'selected' : ''}>RODC</option>
              <option value="MEMBER" ${role === 'MEMBER' ? 'selected' : ''}>MEMBER</option>
              <option value="Test" ${role === 'Test' ? 'selected' : ''}>Test</option>
              <option value="Standalone" ${role === 'Standalone' ? 'selected' : ''}>Standalone</option>
            </select>
          </td>
          <td><input type="text" name="host" class="form-input" value="${escapeHtml(host || '')}" placeholder="예: dc01" aria-label="호스트"></td>
          <td><input type="text" name="fqdn" class="form-input" value="${escapeHtml(fqdn || '')}" placeholder="예: dc01.${escapeHtml(adDomainSuffix || 'corp.local')}" aria-label="FQDN" ${isEdit ? 'readonly disabled' : ''}></td>
          <td><input type="text" name="ip_address" class="form-input" value="${escapeHtml(r.ip_address || '')}" placeholder="10.0.0.10" list="ad-fqdn-ip-datalist" aria-label="IP"></td>
          <td><input type="text" name="purpose" class="form-input" value="${escapeHtml(r.purpose || '')}" placeholder="예: 인증/동기화" aria-label="서비스"></td>
          <td><input type="text" name="remark" class="form-input" value="${escapeHtml(r.remark || '')}" placeholder="비고" aria-label="비고"></td>
          <td class="system-actions">
            <button type="button" class="action-btn" data-action="save" title="저장" aria-label="저장">
              <img src="${SAVE_ICON_SRC}" alt="저장" class="action-icon">
            </button>
            <span class="action-btn-spacer" aria-hidden="true"></span>
          </td>
        </tr>
      `;
    }

    function closeInlineEditor({ restore } = { restore:true }){
      const row = tbody.querySelector('tr.ad-fqdn-editor');
      if(!row) return;

      if(inlineEditor.active && inlineEditor.mode === 'edit' && restore && inlineEditor.originalRowHtml){
        const tmp = document.createElement('tbody');
        tmp.innerHTML = inlineEditor.originalRowHtml;
        const restored = tmp.firstElementChild;
        if(restored) row.replaceWith(restored);
        else row.remove();
      }else{
        row.remove();
      }
      inlineEditor = { active:false, mode:'', fqdnId:0, originalRowHtml:'' };
      setEmptyHidden((state.total || 0) !== 0);
    }

    async function ensureNoInlineEditor(){
      const row = tbody.querySelector('tr.ad-fqdn-editor');
      if(!row) return true;
      const ok = await confirmMessage('편집 중인 행이 있습니다. 취소하고 진행할까요?', '확인');
      if(!ok) return false;
      closeInlineEditor({ restore:true });
      return true;
    }

    function collectInlinePayload(row, base){
      const get = (sel)=>{
        const el = row.querySelector(sel);
        return el ? String(el.value == null ? '' : el.value).trim() : '';
      };

      const host = get('input[name="host"]');
      const inputFqdn = get('input[name="fqdn"]');
      const fqdn = inputFqdn || (host && adDomainSuffix ? `${host}.${adDomainSuffix}` : '') || (base && base.fqdn) || '';
      const domainName = adDomainSuffix || suffixFromFqdn(fqdn) || (base && base.domain_name) || '';

      const payload = {
        status: statusValueFromAny(get('select[name="status"]') || (base && base.status) || 'ACTIVE'),
        host: host || hostFromFqdn(fqdn) || (base && base.host) || '',
        domain_name: domainName,
        fqdn,
        ip_address: get('input[name="ip_address"]') || (base && base.ip_address) || '',
        role: get('select[name="role"]') || (base && base.role) || '',
        purpose: get('input[name="purpose"]') || (base && base.purpose) || '',
        remark: get('input[name="remark"]') || (base && base.remark) || '',
      };
      return payload;
    }

    async function openInlineCreate(){
      if(!await ensureNoInlineEditor()) return;
      tbody.insertAdjacentHTML('afterbegin', editorRowHtml({ mode:'create', record:null }));
      inlineEditor = { active:true, mode:'create', fqdnId:0, originalRowHtml:'' };
      setEmptyHidden(true);
      const row = tbody.querySelector('tr.ad-fqdn-editor');
      if(row){
        const focusEl = row.querySelector('input[name="domain_name"], input[name="fqdn"], input, select');
        try{ focusEl && focusEl.focus && focusEl.focus(); }catch(_e){}
      }
    }

    async function openInlineEdit(record){
      if(!record || !record.fqdn_id) return;
      if(!await ensureNoInlineEditor()) return;
      const tr = tbody.querySelector(`tr[data-id="${record.fqdn_id}"]`);
      if(!tr) return;
      const original = tr.outerHTML;
      tr.insertAdjacentHTML('afterend', editorRowHtml({ mode:'edit', record }));
      const editorRow = tr.nextElementSibling;
      tr.remove();
      inlineEditor = { active:true, mode:'edit', fqdnId:parseInt(record.fqdn_id,10)||0, originalRowHtml:original };
      setEmptyHidden(true);
      if(editorRow){
        const focusEl = editorRow.querySelector('input[name="domain_name"], input[name="fqdn"], input, select');
        try{ focusEl && focusEl.focus && focusEl.focus(); }catch(_e){}
      }
    }

    function applyPagination(){
      const start = (state.page - 1) * state.pageSize;
      const end = start + state.pageSize;
      state.items = (state.allItems || []).slice(start, end);
    }

    async function refresh(){
      const data = await apiRequest(`${API_BASE}/${encodeURIComponent(adId)}/fqdns`, { method: 'GET' });
      state.allItems = Array.isArray(data.items) ? data.items : [];
      state.total = state.allItems.length;

      const pages = totalPages();
      if(state.page > pages) state.page = pages;

      applyPagination();
      tbody.innerHTML = state.items.map(buildRow).join('');
      inlineEditor = { active:false, mode:'', fqdnId:0, originalRowHtml:'' };

      setEmptyHidden((state.total || 0) !== 0);
      renderPagination();
      updateSelectAll();
    }

    async function handleDelete(fqdnId){
      const item = (state.allItems || []).find(x => String(x.fqdn_id) === String(fqdnId));
      const name = item ? (item.fqdn || '') : '';
      if(!skipDeleteConfirm){
        const confirmed = await confirmMessage(`삭제하시겠습니까?${name ? `\n- ${name}` : ''}`, '삭제 확인');
        if(!confirmed) return;
        skipDeleteConfirm = true;
      }
      try{
        await apiRequest(`${API_BASE}/fqdns/${encodeURIComponent(fqdnId)}`, { method: 'DELETE' });
        state.selected.delete(parseInt(String(fqdnId||'0'),10)||0);
        await refresh();
      }catch(err){
        showInlineError(err && err.message ? err.message : '삭제 실패');
      }
    }

    // Row click toggles selection (DNS record tab parity)
    table?.addEventListener('click', (ev) => {
      const tr = ev.target && ev.target.closest ? ev.target.closest('tr[data-id]') : null;
      if(!tr || !tr.parentNode || tr.parentNode !== tbody) return;
      if(tr.classList && tr.classList.contains('ad-fqdn-editor')) return;

      const onCheckbox = ev.target && ev.target.closest ? ev.target.closest('input.ad-fqdn-row-select') : null;
      const onActionBtn = ev.target && ev.target.closest ? ev.target.closest('button.action-btn') : null;
      const isControl = ev.target && ev.target.closest
        ? ev.target.closest('button, a, input, select, textarea, label, .fk-searchable-display')
        : null;

      if(onActionBtn) return;
      if(isControl && !onCheckbox) return;
      if(onCheckbox) return;

      const cb = tr.querySelector('input.ad-fqdn-row-select');
      if(!cb) return;
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event('change', { bubbles:true }));
    });

    tbody.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('button[data-action]') : null;
      if(!btn) return;
      const action = btn.getAttribute('data-action');

      if(action === 'save'){
        const row = btn.closest('tr.ad-fqdn-editor');
        if(!row) return;
        (async ()=>{
          try{
            const mode = row.getAttribute('data-mode') || 'create';
            const fqdnId = parseInt(row.getAttribute('data-id') || '0', 10) || 0;
            const base = fqdnId ? (state.allItems || []).find(x => String(x.fqdn_id) === String(fqdnId)) : null;
            const payload = collectInlinePayload(row, base);
            if(!payload.fqdn){
              showInlineError('FQDN은 필수입니다. (호스트 입력 시 자동 생성됩니다)');
              return;
            }
            if(!payload.domain_name){
              showInlineError('AD 기본정보의 도메인명 또는 FQDN(도메인 포함)이 필요합니다.');
              return;
            }

            btn.disabled = true;
            if(mode === 'edit' && fqdnId){
              await apiRequest(`${API_BASE}/fqdns/${encodeURIComponent(fqdnId)}`, {
                method: 'PUT',
                body: JSON.stringify(payload),
              });
            }else{
              await apiRequest(`${API_BASE}/${encodeURIComponent(adId)}/fqdns`, {
                method: 'POST',
                body: JSON.stringify(payload),
              });
            }
            await refresh();
          }catch(err){
            btn.disabled = false;
            showInlineError(err && err.message ? err.message : '저장 실패');
          }
        })();
        return;
      }

      const id = btn.getAttribute('data-id');
      if(!id) return;
      const rec = (state.items || []).find(x => String(x.fqdn_id) === String(id));
      if(action === 'edit') openInlineEdit(rec);
      if(action === 'delete') handleDelete(id);
    });

    tbody.addEventListener('change', (e) => {
      const cb = e.target;
      if(!cb || !cb.classList || !cb.classList.contains('ad-fqdn-row-select')) return;
      const id = parseInt(cb.getAttribute('data-id') || '0', 10) || 0;
      if(!id) return;
      if(cb.checked) state.selected.add(id);
      else state.selected.delete(id);
      try{
        const tr = cb.closest && cb.closest('tr');
        if(tr) tr.classList.toggle('selected', !!cb.checked);
      }catch(_e){}
      updateSelectAll();
    });

    selectAll?.addEventListener('change', ()=>{
      const boxes = tbody.querySelectorAll('.ad-fqdn-row-select');
      state.selected.clear();
      boxes.forEach((b)=>{
        b.checked = selectAll.checked;
        const id = parseInt(b.getAttribute('data-id') || '0', 10) || 0;
        if(selectAll.checked && id) state.selected.add(id);
        try{
          const tr = b.closest && b.closest('tr');
          if(tr) tr.classList.toggle('selected', !!selectAll.checked);
        }catch(_e){}
      });
    });

    pageNumbers?.addEventListener('click', (e)=>{
      const btn = e.target && e.target.closest ? e.target.closest('button[data-page]') : null;
      if(!btn) return;
      state.page = parseInt(btn.getAttribute('data-page') || '0', 10) || 1;
      applyPagination();
      tbody.innerHTML = state.items.map(buildRow).join('');
      renderPagination();
      updateSelectAll();
    });

    btnFirst?.addEventListener('click', ()=>{ state.page = 1; refresh(); });
    btnPrev?.addEventListener('click', ()=>{ state.page = Math.max(1, state.page - 1); refresh(); });
    btnNext?.addEventListener('click', ()=>{ state.page = Math.min(totalPages(), state.page + 1); refresh(); });
    btnLast?.addEventListener('click', ()=>{ state.page = totalPages(); refresh(); });

    pageSizeSel.addEventListener('change', ()=>{
      state.pageSize = parseInt(pageSizeSel.value, 10) || 10;
      state.page = 1;
      refresh();
    });

    addBtn?.addEventListener('click', ()=>{ openInlineCreate(); });

    downloadBtn?.addEventListener('click', ()=>{ exportCsv(); });

    tbody.addEventListener('input', (e)=>{
      const row = e.target && e.target.closest ? e.target.closest('tr.ad-fqdn-editor') : null;
      if(!row) return;

      // Auto-generate FQDN from host + AD domain (if FQDN was not manually overridden)
      if(e.target && (e.target.name === 'host')){
        const host = String(e.target.value || '').trim();
        const fqdnEl = row.querySelector('input[name="fqdn"]');
        if(fqdnEl){
          const next = (host && adDomainSuffix) ? `${host}.${adDomainSuffix}` : '';
          const cur = String(fqdnEl.value || '').trim();
          const prevAuto = String(row.dataset.autoFqdn || '').trim();
          if(cur === '' || cur === prevAuto){
            fqdnEl.value = next;
            row.dataset.autoFqdn = next;
          }
        }
      }

      if(e.target && e.target.name === 'ip_address'){
        if(!ipDatalist) return;
        const q = String(e.target.value || '').trim();
        clearTimeout(row._ipSuggestTimer);
        row._ipSuggestTimer = setTimeout(async ()=>{
          try{
            if(q.length < 2){ ipDatalist.innerHTML = ''; return; }
            const res = await apiRequest(`/api/network/ip-addresses/suggest?q=${encodeURIComponent(q)}&limit=20`, { method: 'GET' });
            const items = res.items || [];
            ipDatalist.innerHTML = items.map(v=>`<option value="${escapeHtml(v)}"></option>`).join('');
          }catch(_e){}
        }, 150);
      }
    });

    document.addEventListener('keydown', (e)=>{
      if(e.key === 'Escape'){
        const row = tbody.querySelector('tr.ad-fqdn-editor');
        if(row) closeInlineEditor({ restore:true });
      }
    });

    await refresh();
  }

  // ------------------------------------------------------------
  // Account tab (gov_ad_policy_account): accounts CRUD
  // ------------------------------------------------------------

  async function initAdPolicyAccountTab(adId){
    const table = document.getElementById('ad-account-table');
    const tbody = document.getElementById('ad-account-table-body');
    const addBtn = document.getElementById('ad-account-row-add-btn');
    const downloadBtn = document.getElementById('ad-account-download-btn');
    const emptyEl = document.getElementById('ad-account-empty');
    const pageSizeSel = document.getElementById('ad-account-page-size');

    const paginationInfo = document.getElementById('ad-account-pagination-info');
    const btnFirst = document.getElementById('ad-account-first');
    const btnPrev = document.getElementById('ad-account-prev');
    const btnNext = document.getElementById('ad-account-next');
    const btnLast = document.getElementById('ad-account-last');
    const pageNumbers = document.getElementById('ad-account-page-numbers');

    const selectAll = document.getElementById('ad-account-select-all');

    if(!tbody || !pageSizeSel) return;

    const EDIT_ICON_SRC = '/static/image/svg/list/free-icon-pencil.svg';
    const SAVE_ICON_SRC = '/static/image/svg/save.svg';

    let state = {
      page: 1,
      pageSize: parseInt(pageSizeSel.value, 10) || 10,
      total: 0,
      allItems: [],
      items: [],
      selected: new Set(),
    };

    let inlineEditor = { active:false, mode:'', accountId:0, originalRowHtml:'' };

    // Reduce confirm fatigue (DNS record tab parity): once confirmed, skip re-prompting
    // for the rest of this page session.
    let skipDeleteConfirm = false;

    // Lookup caches (loaded lazily once per tab session)
    let lookupLoaded = false;
    let deptItems = [];
    let userItems = [];

    function setEmptyHidden(hidden){
      if(!emptyEl) return;
      emptyEl.hidden = !!hidden;
    }

    function statusPillHtml(statusLabel){
      const raw = String(statusLabel == null ? '' : statusLabel).trim();
      const u = raw.toUpperCase();
      const label = (u === 'ACTIVE') ? '활성'
        : (u === 'INACTIVE') ? '비활성'
        : (u === 'RESERVED') ? '예약'
        : (raw || '-');
      const cls = (u === 'ACTIVE' || label === '활성') ? 'ws-run'
        : (u === 'RESERVED' || label === '예약') ? 'ws-idle'
        : 'ws-wait';
      return `<span class="status-pill"><span class="status-dot ${cls}" aria-hidden="true"></span><span class="status-text">${escapeHtml(label)}</span></span>`;
    }

    function accountTypeLabel(v){
      const raw = String(v == null ? '' : v).trim();
      const u = raw.toUpperCase();
      if(u === 'PERSONAL') return '개인계정';
      if(u === 'SERVICE' || u === 'BIND' || u === 'READONLY') return '서비스계정';
      if(u === 'ADMIN') return '관리자계정';
      return raw || '-';
    }

    async function ensureLookupLoaded(){
      if(lookupLoaded) return;
      lookupLoaded = true;
      try{
        const deptRes = await apiRequest('/api/org-departments?include_deleted=0', { method: 'GET' });
        deptItems = Array.isArray(deptRes.items) ? deptRes.items : [];
      }catch(_e){ deptItems = []; }

      try{
        const userRes = await apiRequest('/api/user-profiles?limit=2000', { method: 'GET' });
        userItems = Array.isArray(userRes.items) ? userRes.items : [];
      }catch(_e){ userItems = []; }
    }

    function fillDeptSelect(selectEl, selectedId){
      if(!selectEl) return;
      const selectedStr = selectedId != null && String(selectedId).trim() !== '' ? String(selectedId) : '';
      const options = ['<option value="">(선택)</option>']
        .concat((deptItems || []).map((d)=>{
          const id = d && d.id != null ? String(d.id) : '';
          const name = (d && (d.dept_name || d.deptName)) ? String(d.dept_name || d.deptName) : '';
          const code = (d && (d.dept_code || d.deptCode)) ? String(d.dept_code || d.deptCode) : '';
          const label = name || code || id;
          const sel = (id && selectedStr && id === selectedStr) ? 'selected' : '';
          return `<option value="${escapeHtml(id)}" ${sel}>${escapeHtml(label)}</option>`;
        }));
      selectEl.innerHTML = options.join('');
      if(selectedStr) selectEl.value = selectedStr;
      selectEl.dispatchEvent(new Event('change', { bubbles:true }));
    }

    function fillUserSelect(selectEl, selectedId, deptIdFilter){
      if(!selectEl) return;
      const selectedStr = selectedId != null && String(selectedId).trim() !== '' ? String(selectedId) : '';
      const deptStr = deptIdFilter != null && String(deptIdFilter).trim() !== '' ? String(deptIdFilter).trim() : '';
      const list = (userItems || []).filter((u)=>{
        if(!deptStr) return true;
        try{
          const did = (u && (u.department_id != null ? u.department_id : u.departmentId))
          return String(did ?? '').trim() === deptStr;
        }catch(_e){
          return false;
        }
      });

      const options = ['<option value="">(선택)</option>']
        .concat(list.map((u)=>{
          const id = u && u.id != null ? String(u.id) : '';
          const name = (u && u.name) ? String(u.name) : '';
          const empNo = (u && (u.emp_no || u.empNo)) ? String(u.emp_no || u.empNo) : '';
          // 요구사항: 사용자 표시 = 이름만
          const label = name || empNo || id;
          const sel = (id && selectedStr && id === selectedStr) ? 'selected' : '';
          return `<option value="${escapeHtml(id)}" ${sel}>${escapeHtml(label)}</option>`;
        }));
      selectEl.innerHTML = options.join('');
      if(selectedStr) selectEl.value = selectedStr;
      selectEl.dispatchEvent(new Event('change', { bubbles:true }));
    }

    function exportCsv(){
      const rows = Array.isArray(state.allItems) ? state.allItems : [];
      if(rows.length === 0){
        try{ notifyMessage('다운로드할 데이터가 없습니다.', '알림'); }catch(_e){}
        return;
      }
      const headers = ['상태','계정이름','계정유형','부서이름','사용자','용도','비고'];
      const dataRows = rows.map((item)=>{
        const statusRaw = String(item.status || '').trim();
        const statusU = statusRaw.toUpperCase();
        const statusLabel = (statusU === 'ACTIVE') ? '활성'
          : (statusU === 'INACTIVE') ? '비활성'
          : (statusU === 'RESERVED') ? '예약'
          : statusRaw;
        const deptLabel = item.owner_dept_name || (item.owner_dept && item.owner_dept.dept_name) || item.owner_department || '';
        const userLabel = item.owner_user_name || (item.owner_user && item.owner_user.name) || '';
        return [
          (statusLabel || ''),
          (item.username || ''),
          accountTypeLabel(item.account_type),
          deptLabel,
          userLabel,
          (item.purpose || ''),
          (item.note || ''),
        ];
      });
      const lines = [headers].concat(dataRows).map(arr => arr.map(escapeCsv).join(','));
      const { yyyy, mm, dd } = yyyymmdd();
      downloadCsvFile(`AD_계정관리_${yyyy}${mm}${dd}.csv`, lines);
    }

    function totalPages(){
      return Math.max(1, Math.ceil((state.total || 0) / (state.pageSize || 10)));
    }

    function renderPagination(){
      const total = state.total || 0;
      const page = state.page;
      const pages = totalPages();

      if(paginationInfo){
        if(total <= 0) paginationInfo.textContent = `0-0 / 0개 항목`;
        else {
          const start = ((page - 1) * state.pageSize) + 1;
          const end = Math.min(total, page * state.pageSize);
          paginationInfo.textContent = `${start}-${end} / ${total}개 항목`;
        }
      }

      if(btnFirst) btnFirst.disabled = page <= 1;
      if(btnPrev) btnPrev.disabled = page <= 1;
      if(btnNext) btnNext.disabled = page >= pages;
      if(btnLast) btnLast.disabled = page >= pages;

      if(pageNumbers){
        pageNumbers.innerHTML = '';
        const totalPagesSafe = Math.max(1, pages || 1);
        const max = 7;
        let start = Math.max(1, page - Math.floor(max / 2));
        let end = start + max - 1;
        if(end > totalPagesSafe){
          end = totalPagesSafe;
          start = Math.max(1, end - max + 1);
        }
        const parts = [];
        for(let p=start; p<=end; p++){
          parts.push(`<button type="button" class="page-btn${p===page?' active':''}" data-page="${p}">${p}</button>`);
        }
        pageNumbers.innerHTML = parts.join('');
      }
    }

    function updateSelectAll(){
      if(!selectAll) return;
      const boxes = tbody.querySelectorAll('.ad-account-row-select');
      if(!boxes.length){ selectAll.checked = false; return; }
      selectAll.checked = [...boxes].every(b => b.checked);
    }

    function buildRow(item){
      const id = item && item.account_id != null ? String(item.account_id) : '';
      const numId = parseInt(id || '0', 10) || 0;
      const checked = numId && state.selected.has(numId) ? 'checked' : '';
      const selectedClass = numId && state.selected.has(numId) ? 'selected' : '';
      const deptLabel = item.owner_dept_name || (item.owner_dept && item.owner_dept.dept_name) || item.owner_department || '-';
      const userLabel = item.owner_user_name || (item.owner_user && item.owner_user.name) || '-';
      return `
        <tr data-id="${escapeHtml(id)}" class="${selectedClass}">
          <td><input type="checkbox" class="ad-account-row-select" data-id="${escapeHtml(id)}" ${checked} aria-label="선택"></td>
          <td>${statusPillHtml(item.status)}</td>
          <td>${escapeHtml(item.username || '-') }</td>
          <td>${escapeHtml(accountTypeLabel(item.account_type))}</td>
          <td>${escapeHtml(deptLabel)}</td>
          <td>${escapeHtml(userLabel)}</td>
          <td>${escapeHtml(item.purpose || '-') }</td>
          <td>${escapeHtml(item.note || '-') }</td>
          <td class="system-actions">
            <button type="button" class="action-btn" data-action="edit" data-id="${escapeHtml(id)}" title="수정" aria-label="수정">
              <img src="${EDIT_ICON_SRC}" alt="수정" class="action-icon">
            </button>
            <button type="button" class="action-btn" data-action="delete" data-id="${escapeHtml(id)}" title="삭제" aria-label="삭제">
              <img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon">
            </button>
          </td>
        </tr>
      `;
    }

    function editorRowHtml({ mode, record }){
      const m = record || {};
      const accountId = m.account_id ? parseInt(m.account_id, 10) : 0;
      const typeRaw = String(m.account_type || '').trim() || 'SERVICE';
      const type = (['PERSONAL','SERVICE','ADMIN'].includes(typeRaw.toUpperCase())) ? typeRaw.toUpperCase() : 'SERVICE';
      const statusRaw = String(m.status || '').trim() || 'ACTIVE';
      const status = (['ACTIVE','INACTIVE','RESERVED'].includes(statusRaw.toUpperCase())) ? statusRaw.toUpperCase() : 'ACTIVE';

      const deptId = m.owner_dept_id != null
        ? m.owner_dept_id
        : (m.owner_department_id != null ? m.owner_department_id : (m.owner_dept ? m.owner_dept.id : ''));
      const userId = m.owner_user_id != null
        ? m.owner_user_id
        : (m.owner_user ? m.owner_user.id : '');
      return `
        <tr class="ad-account-editor" data-mode="${escapeHtml(mode)}" data-id="${accountId}">
          <td><input type="checkbox" disabled aria-label="선택" /></td>
          <td>
            <select name="status" class="form-input search-select fk-select" data-placeholder="상태 선택" data-searchable-scope="page" aria-label="상태">
              <option value="ACTIVE" ${status === 'ACTIVE' ? 'selected' : ''}>활성</option>
              <option value="INACTIVE" ${status === 'INACTIVE' ? 'selected' : ''}>비활성</option>
              <option value="RESERVED" ${status === 'RESERVED' ? 'selected' : ''}>예약</option>
            </select>
          </td>
          <td><input type="text" name="username" class="form-input" value="${escapeHtml(m.username || '')}" placeholder="svc_ldap_bind" aria-label="계정이름"></td>
          <td>
            <select name="account_type" class="form-input search-select fk-select" data-placeholder="계정유형 선택" data-searchable-scope="page" aria-label="계정유형">
              <option value="PERSONAL" ${type === 'PERSONAL' ? 'selected' : ''}>개인계정</option>
              <option value="SERVICE" ${type === 'SERVICE' ? 'selected' : ''}>서비스계정</option>
              <option value="ADMIN" ${type === 'ADMIN' ? 'selected' : ''}>관리자계정</option>
            </select>
          </td>
          <td>
            <select name="owner_dept_id" class="form-input search-select fk-select" data-placeholder="부서 선택" data-searchable-scope="page" data-allow-clear="true" aria-label="부서이름" data-selected="${escapeHtml(deptId)}"></select>
          </td>
          <td>
            <select name="owner_user_id" class="form-input search-select fk-select" data-placeholder="사용자 선택" data-searchable-scope="page" data-allow-clear="true" aria-label="사용자" data-selected="${escapeHtml(userId)}"></select>
          </td>
          <td><input type="text" name="purpose" class="form-input" value="${escapeHtml(m.purpose || '')}" placeholder="용도" aria-label="용도"></td>
          <td><input type="text" name="note" class="form-input" value="${escapeHtml(m.note || '')}" placeholder="비고" aria-label="비고"></td>
          <td class="system-actions">
            <button type="button" class="action-btn" data-action="save" title="저장" aria-label="저장">
              <img src="${SAVE_ICON_SRC}" alt="저장" class="action-icon">
            </button>
            <span class="action-btn-spacer" aria-hidden="true"></span>
          </td>
        </tr>
      `;
    }

    function closeInlineEditor({ restore } = { restore:true }){
      const row = tbody.querySelector('tr.ad-account-editor');
      if(!row) return;

      if(inlineEditor.active && inlineEditor.mode === 'edit' && restore && inlineEditor.originalRowHtml){
        const tmp = document.createElement('tbody');
        tmp.innerHTML = inlineEditor.originalRowHtml;
        const restored = tmp.firstElementChild;
        if(restored) row.replaceWith(restored);
        else row.remove();
      }else{
        row.remove();
      }

      inlineEditor = { active:false, mode:'', accountId:0, originalRowHtml:'' };
      setEmptyHidden((state.total || 0) !== 0);
    }

    async function ensureNoInlineEditor(){
      const row = tbody.querySelector('tr.ad-account-editor');
      if(!row) return true;
      const ok = await confirmMessage('편집 중인 행이 있습니다. 취소하고 진행할까요?', '확인');
      if(!ok) return false;
      closeInlineEditor({ restore:true });
      return true;
    }

    function rowPayloadFromEditor(row, base){
      const get = (sel)=>{
        const el = row.querySelector(sel);
        return el ? String(el.value == null ? '' : el.value).trim() : '';
      };

      const payload = {
        username: get('input[name="username"]') || (base && base.username) || '',
        account_type: get('select[name="account_type"]') || (base && base.account_type) || 'SERVICE',
        status: get('select[name="status"]') || (base && base.status) || 'ACTIVE',
        owner_dept_id: get('select[name="owner_dept_id"]') || (base && (base.owner_dept_id == null ? (base.owner_department_id == null ? '' : base.owner_department_id) : base.owner_dept_id)) || '',
        owner_user_id: get('select[name="owner_user_id"]') || (base && base.owner_user_id) || '',
        purpose: get('input[name="purpose"]') || (base && base.purpose) || '',
        note: get('input[name="note"]') || (base && base.note) || '',
      };

      // Preserve fields not shown in the table to avoid unintended data loss
      if(base){
        payload.display_name = base.display_name || '';
        payload.owner = base.owner || '';
        payload.privilege = base.privilege || '';
        payload.password_rotated_at = base.password_rotated_at || '';
        payload.password_expires_at = base.password_expires_at || '';
      }else{
        payload.display_name = '';
        payload.owner = '';
        payload.privilege = '';
        payload.password_rotated_at = '';
        payload.password_expires_at = '';
      }

      return payload;
    }

    async function hydrateEditorLookups(row){
      if(!row) return;
      await ensureLookupLoaded();
      const deptSel = row.querySelector('select[name="owner_dept_id"]');
      const userSel = row.querySelector('select[name="owner_user_id"]');
      const deptSelected = deptSel ? (deptSel.getAttribute('data-selected') || '') : '';
      const userSelected = userSel ? (userSel.getAttribute('data-selected') || '') : '';
      fillDeptSelect(deptSel, deptSelected);
      const deptFilter = deptSel ? String(deptSel.value || deptSelected || '').trim() : '';
      fillUserSelect(userSel, userSelected, deptFilter);

      // When department changes, show only that department's members.
      if(deptSel && userSel && !deptSel.dataset._userFilterBind){
        deptSel.dataset._userFilterBind = '1';
        deptSel.addEventListener('change', ()=>{
          const did = String(deptSel.value || '').trim();
          const currentUser = String(userSel.value || '').trim();
          fillUserSelect(userSel, currentUser, did);
          try{
            if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
              window.BlossomSearchableSelect.syncAll(row);
            }
          }catch(_e){}
        });
      }

      // The searchable-select UI may have been enhanced before options were injected.
      // Re-sync to ensure the search panel sees the new options.
      try{
        if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
          window.BlossomSearchableSelect.syncAll(row);
        }
      }catch(_e){}

      // Optional: when user changes, auto-fill department if empty.
      if(userSel && deptSel && !userSel.dataset._deptBind){
        userSel.dataset._deptBind = '1';
        userSel.addEventListener('change', ()=>{
          const uid = String(userSel.value || '').trim();
          if(!uid) return;
          const u = (userItems || []).find(x => String(x.id) === uid);
          const did = u && u.department_id != null ? String(u.department_id) : '';
          if(did && !String(deptSel.value || '').trim()){
            deptSel.value = did;
            deptSel.dispatchEvent(new Event('change', { bubbles:true }));
          }
        });
      }
    }

    async function openInlineCreate(){
      if(!await ensureNoInlineEditor()) return;
      tbody.insertAdjacentHTML('afterbegin', editorRowHtml({ mode:'create', record:{ account_type:'SERVICE', status:'ACTIVE' } }));
      inlineEditor = { active:true, mode:'create', accountId:0, originalRowHtml:'' };
      setEmptyHidden(true);
      const row = tbody.querySelector('tr.ad-account-editor');
      if(row){
        await hydrateEditorLookups(row);
        const focusEl = row.querySelector('input[name="username"], input, select');
        try{ focusEl && focusEl.focus && focusEl.focus(); }catch(_e){}
      }
    }

    async function openInlineEdit(record){
      if(!record || !record.account_id) return;
      if(!await ensureNoInlineEditor()) return;
      const tr = tbody.querySelector(`tr[data-id="${record.account_id}"]`);
      if(!tr) return;
      const original = tr.outerHTML;
      tr.insertAdjacentHTML('afterend', editorRowHtml({ mode:'edit', record }));
      const editorRow = tr.nextElementSibling;
      tr.remove();
      inlineEditor = { active:true, mode:'edit', accountId:parseInt(record.account_id,10)||0, originalRowHtml:original };
      setEmptyHidden(true);
      if(editorRow){
        await hydrateEditorLookups(editorRow);
        const focusEl = editorRow.querySelector('input[name="username"], input, select');
        try{ focusEl && focusEl.focus && focusEl.focus(); }catch(_e){}
      }
    }

    function applyPagination(){
      const start = (state.page - 1) * state.pageSize;
      const end = start + state.pageSize;
      state.items = (state.allItems || []).slice(start, end);
    }

    async function refresh(){
      const data = await apiRequest(`${API_BASE}/${encodeURIComponent(adId)}/accounts`, { method: 'GET' });
      state.allItems = Array.isArray(data.items) ? data.items : [];
      state.total = state.allItems.length;

      const pages = totalPages();
      if(state.page > pages) state.page = pages;

      applyPagination();
      tbody.innerHTML = state.items.map(buildRow).join('');
      inlineEditor = { active:false, mode:'', accountId:0, originalRowHtml:'' };

      setEmptyHidden((state.total || 0) !== 0);
      renderPagination();
      updateSelectAll();
    }

    async function handleDelete(accountId){
      const item = (state.allItems || []).find(x => String(x.account_id) === String(accountId));
      const name = item ? item.username : '';
      if(!skipDeleteConfirm){
        const confirmed = await confirmMessage(`삭제하시겠습니까?${name ? `\n- ${name}` : ''}`, '삭제 확인');
        if(!confirmed) return;
        skipDeleteConfirm = true;
      }
      try{
        await apiRequest(`${API_BASE}/accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE' });
        state.selected.delete(parseInt(String(accountId||'0'),10)||0);
        await refresh();
      }catch(err){
        showInlineError(err && err.message ? err.message : '삭제 실패');
      }
    }

    // Row click toggles selection (DNS record tab parity)
    table?.addEventListener('click', (ev) => {
      const tr = ev.target && ev.target.closest ? ev.target.closest('tr[data-id]') : null;
      if(!tr || !tr.parentNode || tr.parentNode !== tbody) return;
      if(tr.classList && tr.classList.contains('ad-account-editor')) return;

      const onCheckbox = ev.target && ev.target.closest ? ev.target.closest('input.ad-account-row-select') : null;
      const onActionBtn = ev.target && ev.target.closest ? ev.target.closest('button.action-btn') : null;
      const isControl = ev.target && ev.target.closest
        ? ev.target.closest('button, a, input, select, textarea, label, .fk-searchable-display')
        : null;

      if(onActionBtn) return;
      if(isControl && !onCheckbox) return;
      if(onCheckbox) return;

      const cb = tr.querySelector('input.ad-account-row-select');
      if(!cb) return;
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event('change', { bubbles:true }));
    });

    tbody.addEventListener('click', (e)=>{
      const btn = e.target && e.target.closest ? e.target.closest('button[data-action]') : null;
      if(!btn) return;
      const action = btn.getAttribute('data-action');

      if(action === 'save'){
        const row = btn.closest('tr.ad-account-editor');
        if(!row) return;
        (async ()=>{
          try{
            const mode = row.getAttribute('data-mode') || 'create';
            const accountId = parseInt(row.getAttribute('data-id') || '0', 10) || 0;
            const base = accountId ? (state.allItems || []).find(x => String(x.account_id) === String(accountId)) : null;
            const payload = rowPayloadFromEditor(row, base);
            if(!payload.username){
              showInlineError('계정명은 필수입니다.');
              return;
            }

            btn.disabled = true;
            if(mode === 'edit' && accountId){
              await apiRequest(`${API_BASE}/accounts/${encodeURIComponent(accountId)}`, {
                method: 'PUT',
                body: JSON.stringify(payload),
              });
            }else{
              await apiRequest(`${API_BASE}/${encodeURIComponent(adId)}/accounts`, {
                method: 'POST',
                body: JSON.stringify(payload),
              });
            }
            await refresh();
          }catch(err){
            btn.disabled = false;
            showInlineError(err && err.message ? err.message : '저장 실패');
          }
        })();
        return;
      }

      const id = btn.getAttribute('data-id');
      if(!id) return;
      const rec = (state.items || []).find(x => String(x.account_id) === String(id));
      if(action === 'edit') openInlineEdit(rec);
      if(action === 'delete') handleDelete(id);
    });

    tbody.addEventListener('change', (e)=>{
      const cb = e.target;
      if(!cb || !cb.classList || !cb.classList.contains('ad-account-row-select')) return;
      const id = parseInt(cb.getAttribute('data-id') || '0', 10) || 0;
      if(!id) return;
      if(cb.checked) state.selected.add(id);
      else state.selected.delete(id);
      try{
        const tr = cb.closest && cb.closest('tr');
        if(tr) tr.classList.toggle('selected', !!cb.checked);
      }catch(_e){}
      updateSelectAll();
    });

    selectAll?.addEventListener('change', ()=>{
      const boxes = tbody.querySelectorAll('.ad-account-row-select');
      state.selected.clear();
      boxes.forEach((b)=>{
        b.checked = selectAll.checked;
        const id = parseInt(b.getAttribute('data-id') || '0', 10) || 0;
        if(selectAll.checked && id) state.selected.add(id);
        try{
          const tr = b.closest && b.closest('tr');
          if(tr) tr.classList.toggle('selected', !!selectAll.checked);
        }catch(_e){}
      });
    });

    pageNumbers?.addEventListener('click', (e)=>{
      const btn = e.target && e.target.closest ? e.target.closest('button[data-page]') : null;
      if(!btn) return;
      state.page = parseInt(btn.getAttribute('data-page') || '0', 10) || 1;
      applyPagination();
      tbody.innerHTML = state.items.map(buildRow).join('');
      renderPagination();
      updateSelectAll();
    });

    btnFirst?.addEventListener('click', ()=>{ state.page = 1; refresh(); });
    btnPrev?.addEventListener('click', ()=>{ state.page = Math.max(1, state.page - 1); refresh(); });
    btnNext?.addEventListener('click', ()=>{ state.page = Math.min(totalPages(), state.page + 1); refresh(); });
    btnLast?.addEventListener('click', ()=>{ state.page = totalPages(); refresh(); });

    pageSizeSel.addEventListener('change', ()=>{
      state.pageSize = parseInt(pageSizeSel.value, 10) || 10;
      state.page = 1;
      refresh();
    });

    addBtn?.addEventListener('click', ()=>{ openInlineCreate(); });

    downloadBtn?.addEventListener('click', ()=>{ exportCsv(); });

    document.addEventListener('keydown', (e)=>{
      if(e.key === 'Escape'){
        const row = tbody.querySelector('tr.ad-account-editor');
        if(row) closeInlineEditor({ restore:true });
      }
    });

    await refresh();
  }

  // ------------------------------------------------------------
  // Log tab (gov_ad_policy_log): change logs
  // ------------------------------------------------------------

  async function initAdPolicyLogTab(adId){
    const emptyEl = document.getElementById('lg-empty');
    const table = document.getElementById('lg-spec-table');
    const tbody = table ? table.querySelector('tbody') : null;
    const pageSizeSel = document.getElementById('lg-page-size');
    const addBtn = document.getElementById('lg-row-add');

    const selectAll = document.getElementById('lg-select-all');

    const paginationInfo = document.getElementById('lg-pagination-info');
    const pageNumbers = document.getElementById('lg-page-numbers');
    const btnFirst = document.getElementById('lg-first');
    const btnPrev = document.getElementById('lg-prev');
    const btnNext = document.getElementById('lg-next');
    const btnLast = document.getElementById('lg-last');

    const downloadBtn = document.getElementById('lg-download-btn');

    const detailModalClose = document.getElementById('lg-detail-close');
    const detailText = document.getElementById('lg-detail-text');
    const detailReason = document.getElementById('lg-detail-reason');
    const detailReasonSave = document.getElementById('lg-detail-reason-save');
    const detailSave = document.getElementById('lg-detail-save');

    // Only run on the log tab page.
    if(!table && !tbody && !detailText) return;

    if(!Number.isFinite(adId)){
      const idRaw = qs('id') || govDetailId();
      adId = idRaw ? parseInt(idRaw, 10) : NaN;
    }

    function csvEscape(value){
      const s = String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const needsQuotes = /[",\n]/.test(s);
      const escaped = s.replace(/"/g, '""');
      return needsQuotes ? `"${escaped}"` : escaped;
    }

    function downloadTextAsFile(filename, content, mimeType){
      const blob = new Blob([content], { type: mimeType || 'text/plain;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    function tabLabel(tabKey){
      const k = String(tabKey || '').trim();
      if(k === 'gov_ad_policy_detail') return '기본정보';
      if(k === 'gov_ad_policy_domain') return '도메인 관리';
      if(k === 'gov_ad_policy_account') return '계정 관리';
      if(k === 'gov_ad_policy_file') return '구성/파일';
      if(k === 'gov_ad_policy_log') return '변경이력';
      return k || '-';
    }

    function actionLabel(action){
      const a = String(action || '').trim().toUpperCase();
      if(a === 'CREATE' || a === 'INSERT' || a === 'ADD') return '생성';
      if(a === 'UPDATE' || a === 'EDIT' || a === 'MODIFY') return '수정';
      if(a === 'DELETE' || a === 'REMOVE') return '삭제';
      if(a === 'UPLOAD') return '업로드';
      if(a === 'DOWNLOAD') return '다운로드';
      return a || '-';
    }

    function selectedLogIdsOnPage(){
      if(!tbody) return [];
      return Array.from(tbody.querySelectorAll('input.lg-row:checked'))
        .map((el)=> (el && el.getAttribute ? el.getAttribute('data-id') : ''))
        .map((v)=> String(v || '').trim())
        .filter(Boolean);
    }

    function selectionMode(){
      if(!tbody) return 'all';
      const boxes = Array.from(tbody.querySelectorAll('input.lg-row'));
      if(!boxes.length) return 'all';
      const checked = boxes.filter((b)=> !!b.checked);
      if(checked.length === 0) return 'all';
      if(checked.length === boxes.length) return 'all';
      return 'selected';
    }

    function updateDownloadButtonState(){
      if(!downloadBtn || !tbody) return;
      const hasRows = !!tbody.querySelector('tr');
      downloadBtn.disabled = !hasRows;
      downloadBtn.setAttribute('aria-disabled', (!hasRows).toString());
      downloadBtn.title = hasRows ? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.';
    }

    function savedVisibleRows(){
      if(!tbody) return [];
      return Array.from(tbody.querySelectorAll('tr'));
    }

    function syncRowSelectedState(tr, checked){
      if(!tr) return;
      tr.classList.toggle('selected', !!checked);
    }

    function syncSelectAllState(){
      if(!selectAll || !table) return;
      const checks = Array.from(table.querySelectorAll('tbody .lg-row'));
      if(!checks.length){
        selectAll.checked = false;
        selectAll.indeterminate = false;
        return;
      }
      const checkedCount = checks.reduce((acc, cb) => acc + (cb.checked ? 1 : 0), 0);
      selectAll.checked = checkedCount === checks.length;
      selectAll.indeterminate = checkedCount > 0 && checkedCount < checks.length;
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
      if(v == null) return null;
      if(isPlainObject(v)) return v;
      if(typeof v === 'string'){
        const parsed = tryParseJson(v);
        if(isPlainObject(parsed)) return parsed;
      }
      return null;
    }

    function valuesEqual(a, b){
      if(a === b) return true;
      if(a == null && b == null) return true;
      if(typeof a !== typeof b) return false;
      if(Array.isArray(a) && Array.isArray(b)){
        if(a.length !== b.length) return false;
        for(let i = 0; i < a.length; i++) if(!valuesEqual(a[i], b[i])) return false;
        return true;
      }
      if(isPlainObject(a) && isPlainObject(b)){
        const aKeys = Object.keys(a);
        const bKeys = Object.keys(b);
        if(aKeys.length !== bKeys.length) return false;
        for(const k of aKeys){
          if(!(k in b)) return false;
          if(!valuesEqual(a[k], b[k])) return false;
        }
        return true;
      }
      return false;
    }

    function diffBeforeAfter(beforeObj, afterObj){
      const changes = [];
      function walk(path, beforeVal, afterVal){
        if(valuesEqual(beforeVal, afterVal)) return;
        const beforeIsObj = isPlainObject(beforeVal);
        const afterIsObj = isPlainObject(afterVal);
        if(beforeIsObj && afterIsObj){
          const keys = new Set([...Object.keys(beforeVal), ...Object.keys(afterVal)]);
          for(const k of keys) walk(path.concat([k]), beforeVal[k], afterVal[k]);
          return;
        }
        changes.push({ path, beforeVal, afterVal });
      }
      walk([], beforeObj, afterObj);
      return changes;
    }

    function formatValue(v){
      if(v === undefined) return 'null';
      if(v === null) return 'null';
      if(typeof v === 'string'){
        const t = v.trim();
        if(t === '' || t === '-') return 'null';
      }
      try{ return JSON.stringify(v); }catch(_e){ return String(v); }
    }

    const LG_FIELD_LABELS = {
      // Domain tab
      domain: '도메인명',
      domain_name: '도메인명',
      fqdn: 'FQDN',
      host: '호스트',
      host_name: '호스트',
      ip: 'IP',
      ip_address: 'IP',
      address: 'IP',
      role: '역할',
      status: '상태',
      note: '비고',
      description: '비고',
      remark: '비고',

      // Account tab
      username: '계정명',
      display_name: '표시명',
      account_type: '계정유형',
      owner_dept_id: '부서',
      owner_department_id: '부서',
      owner_user_id: '사용자',
      purpose: '용도',

      // File tab
      file_name: '파일명',
      fileName: '파일명',
      original_filename: '원본 파일명',
      originalFilename: '원본 파일명',
      entry_type: '구분',
      type: '유형',
      is_primary: '대표 여부',
      isPrimary: '대표 여부',
    };

    const LG_META_FIELDS = new Set([
      'id','log_id','ad_id','policy_id','domain_id','account_id','diagram_id',
      'created_at','created_by','updated_at','updated_by','deleted_at','deleted_by',
      'actor','reason','message','tab_key','tab','action','entity','entity_id','diff','detail',
    ]);

    const LG_ALLOWED_FIELDS_BY_TAB = {
      gov_ad_policy_domain: new Set([
        'domain','domain_name','fqdn','host','host_name','ip','ip_address','address','role','status','note','description','remark',
      ]),
      gov_ad_policy_account: new Set([
        'username','display_name','account_type','status','owner_dept_id','owner_department_id','owner_user_id','purpose','note','description','remark',
      ]),
      gov_ad_policy_file: new Set([
        'entry_type','type','file_name','fileName','original_filename','originalFilename','is_primary','isPrimary','note','description','remark',
      ]),
    };

    function toSnakeCase(s){
      const raw = String(s || '').trim();
      if(!raw) return '';
      return raw
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[-\s]+/g, '_')
        .toLowerCase();
    }

    function shouldShowField(tabKey, fieldKey){
      const tk = String(tabKey || '').trim();
      const raw = String(fieldKey || '').trim();
      if(!raw) return false;
      const sn = toSnakeCase(raw);
      if(LG_META_FIELDS.has(raw) || LG_META_FIELDS.has(sn)) return false;
      const allow = LG_ALLOWED_FIELDS_BY_TAB[tk];
      if(allow && allow instanceof Set){
        return allow.has(raw) || allow.has(sn);
      }
      return true;
    }

    function labelForKey(key){
      const k = String(key || '').trim();
      if(!k) return '';
      if(Object.prototype.hasOwnProperty.call(LG_FIELD_LABELS, k)) return LG_FIELD_LABELS[k];
      const sn = toSnakeCase(k);
      if(sn && Object.prototype.hasOwnProperty.call(LG_FIELD_LABELS, sn)) return LG_FIELD_LABELS[sn];
      return '';
    }

    function displayPath(_tabKey, pathArr){
      const parts = Array.isArray(pathArr) ? pathArr.map((p)=> String(p)) : [String(pathArr || '')];
      const last = parts.length ? parts[parts.length - 1] : '';
      return labelForKey(last) || last || '항목';
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
      if(tk === 'gov_ad_policy_file'){
        if(fk === 'file_name') return String(v ?? '');
        const names = extractFileNames(v);
        if(names.length > 0) return names.join(', ');
        return '';
      }
      return formatValue(v);
    }

    function extractBeforeAfter(root){
      let obj = root;
      if(typeof obj === 'string') obj = tryParseJson(obj);
      if(!obj) return null;
      if(isPlainObject(obj) && isPlainObject(obj.diff)) obj = obj.diff;
      if(!isPlainObject(obj)) return null;
      const beforeRaw = (obj.before !== undefined) ? obj.before : (obj.before_value !== undefined ? obj.before_value : obj.old);
      const afterRaw = (obj.after !== undefined) ? obj.after : (obj.after_value !== undefined ? obj.after_value : obj.new);
      const beforeObj = normalizeToObject(beforeRaw) || (isPlainObject(beforeRaw) ? beforeRaw : null);
      const afterObj = normalizeToObject(afterRaw) || (isPlainObject(afterRaw) ? afterRaw : null);
      if(!beforeObj || !afterObj) return null;
      return { beforeObj, afterObj };
    }

    function extractAfterOnly(root){
      let obj = root;
      if(typeof obj === 'string') obj = tryParseJson(obj);
      if(!obj) return null;
      if(isPlainObject(obj) && isPlainObject(obj.diff)) obj = obj.diff;
      if(!isPlainObject(obj)) return null;
      const after = (obj.after !== undefined) ? obj.after : (obj.new !== undefined ? obj.new : (obj.to !== undefined ? obj.to : (obj.payload !== undefined ? obj.payload : (obj.item !== undefined ? obj.item : null))));
      const afterObj = normalizeToObject(after) || (isPlainObject(after) ? after : null);
      if(!afterObj) return null;
      return afterObj;
    }

    function extractBeforeOnly(root){
      let obj = root;
      if(typeof obj === 'string') obj = tryParseJson(obj);
      if(!obj) return null;
      if(isPlainObject(obj) && isPlainObject(obj.diff)) obj = obj.diff;
      if(!isPlainObject(obj)) return null;
      const before = (obj.before !== undefined) ? obj.before : (obj.old !== undefined ? obj.old : (obj.from !== undefined ? obj.from : null));
      const beforeObj = normalizeToObject(before) || (isPlainObject(before) ? before : null);
      if(!beforeObj) return null;
      return beforeObj;
    }

    function isFromToChangeObject(v){
      if(!isPlainObject(v)) return false;
      const keys = Object.keys(v);
      if(keys.length === 0) return false;
      const allowed = new Set(['from','to','before','after','old','new','before_value','after_value']);
      let has = false;
      for(const k of keys){
        if(!allowed.has(k)) return false;
        has = true;
      }
      return has;
    }

    function extractFromToEntries(root){
      let obj = root;
      if(typeof obj === 'string') obj = tryParseJson(obj);
      if(!obj) return null;
      if(isPlainObject(obj) && isPlainObject(obj.diff)) obj = obj.diff;
      if(!isPlainObject(obj)) return null;

      // Unwrap common envelopes.
      for(const wrapKey of ['changes','changed','payload','item','diff']){
        if(isPlainObject(obj[wrapKey])) obj = obj[wrapKey];
      }

      const entries = [];
      for(const k of Object.keys(obj).sort()){
        const v = obj[k];
        if(!isFromToChangeObject(v)) continue;
        const beforeVal = (v.from !== undefined) ? v.from : ((v.before !== undefined) ? v.before : ((v.before_value !== undefined) ? v.before_value : v.old));
        const afterVal = (v.to !== undefined) ? v.to : ((v.after !== undefined) ? v.after : ((v.after_value !== undefined) ? v.after_value : v.new));
        entries.push({ path: [k], beforeVal, afterVal });
      }
      return entries.length ? entries : null;
    }

    function extractChangesEntries(root){
      let obj = root;
      if(typeof obj === 'string') obj = tryParseJson(obj);
      if(!obj) return null;
      if(isPlainObject(obj) && isPlainObject(obj.diff)) obj = obj.diff;
      if(!isPlainObject(obj)) return null;

      const container = isPlainObject(obj.changes) ? obj.changes : (isPlainObject(obj.changed) ? obj.changed : null);
      if(!container) return null;

      const entries = [];
      for(const k of Object.keys(container).sort()){
        const v = container[k];
        if(isFromToChangeObject(v)){
          const beforeVal = (v.from !== undefined) ? v.from : ((v.before !== undefined) ? v.before : ((v.before_value !== undefined) ? v.before_value : v.old));
          const afterVal = (v.to !== undefined) ? v.to : ((v.after !== undefined) ? v.after : ((v.after_value !== undefined) ? v.after_value : v.new));
          entries.push({ path: [k], beforeVal, afterVal });
          continue;
        }
        if(isPlainObject(v) && ('before' in v || 'after' in v || 'old' in v || 'new' in v || 'before_value' in v || 'after_value' in v)){
          const beforeVal = (v.before !== undefined) ? v.before : ((v.before_value !== undefined) ? v.before_value : v.old);
          const afterVal = (v.after !== undefined) ? v.after : ((v.after_value !== undefined) ? v.after_value : v.new);
          entries.push({ path: [k], beforeVal, afterVal });
        }
      }
      return entries.length ? entries : null;
    }

    function extractPrimaryFileNameFromDiff(diff){
      let obj = diff;
      if(typeof obj === 'string') obj = tryParseJson(obj);
      if(!obj) return '';
      if(isPlainObject(obj) && isPlainObject(obj.diff)) obj = obj.diff;
      if(isPlainObject(obj)){
        const direct = obj.file_name || obj.fileName || obj.original_filename || obj.name || obj.title;
        if(direct) return String(direct).trim();
        const changes = isPlainObject(obj.changes) ? obj.changes : (isPlainObject(obj.changed) ? obj.changed : null);
        if(isPlainObject(changes) && isPlainObject(changes.file_name)){
          const entry = changes.file_name;
          const after = entry.after ?? entry.after_value ?? entry.new ?? entry.to;
          const before = entry.before ?? entry.before_value ?? entry.old ?? entry.from;
          const afterNames = extractFileNames(after);
          if(afterNames.length) return String(afterNames[0]).trim();
          const beforeNames = extractFileNames(before);
          if(beforeNames.length) return String(beforeNames[0]).trim();
        }
        const afterWrap = obj.after ?? obj.after_value ?? obj.new ?? obj.to ?? obj.created;
        const afterNames = extractFileNames(afterWrap);
        if(afterNames.length) return String(afterNames[0]).trim();
        const beforeWrap = obj.before ?? obj.before_value ?? obj.old ?? obj.from ?? obj.deleted;
        const beforeNames = extractFileNames(beforeWrap);
        if(beforeNames.length) return String(beforeNames[0]).trim();
      }
      const any = extractFileNames(obj);
      return any.length ? String(any[0]).trim() : '';
    }

    function renderDiffHtml(obj, ctx){
      const tabKey = ctx && ctx.tabKey ? ctx.tabKey : '';
      const action = ctx && ctx.action ? ctx.action : '';
      const showArrow = String(tabKey || '').trim() !== 'gov_ad_policy_file';

      if(String(tabKey || '').trim() === 'gov_ad_policy_file'){
        const a = String(action || '').trim().toUpperCase();
        const fileName = extractPrimaryFileNameFromDiff(obj);
        if(fileName){
          if(a === 'DELETE' || a === 'REMOVE') return `파일명: <span class="diff-before">${escapeHtml(fileName)}</span>`;
          if(a === 'CREATE' || a === 'UPLOAD' || a === 'ADD' || a === 'INSERT') return `파일명: <span class="diff-after">${escapeHtml(fileName)}</span>`;
        }
      }

      const fromToEntries = extractFromToEntries(obj);
      if(fromToEntries){
        const lines = fromToEntries.map((c)=>{
          const key = escapeHtml(displayPath(tabKey, c.path));
          const fieldKey = Array.isArray(c.path) && c.path.length ? String(c.path[c.path.length - 1]) : '';
          if(!shouldShowField(tabKey, fieldKey)) return null;
          const beforeText = escapeHtml(formatValueForContext(tabKey, fieldKey, c.beforeVal));
          const afterText = escapeHtml(formatValueForContext(tabKey, fieldKey, c.afterVal));
          return showArrow
            ? `${key}: <span class="diff-before">${beforeText}</span> <span class="diff-arrow">→</span> <span class="diff-after">${afterText}</span>`
            : `${key}: <span class="diff-before">${beforeText}</span> <span class="diff-after">${afterText}</span>`;
        }).filter(Boolean);
        if(lines.length) return lines.join('\n');
      }

      const changes = extractChangesEntries(obj);
      if(changes){
        const lines = changes.map((c)=>{
          const key = escapeHtml(displayPath(tabKey, c.path));
          const fieldKey = Array.isArray(c.path) && c.path.length ? String(c.path[c.path.length - 1]) : '';
          if(!shouldShowField(tabKey, fieldKey)) return null;
          const beforeText = escapeHtml(formatValueForContext(tabKey, fieldKey, c.beforeVal));
          const afterText = escapeHtml(formatValueForContext(tabKey, fieldKey, c.afterVal));
          return showArrow
            ? `${key}: <span class="diff-before">${beforeText}</span> <span class="diff-arrow">→</span> <span class="diff-after">${afterText}</span>`
            : `${key}: <span class="diff-before">${beforeText}</span> <span class="diff-after">${afterText}</span>`;
        }).filter(Boolean);
        if(lines.length) return lines.join('\n');
      }

      const beforeAfter = extractBeforeAfter(obj);
      if(beforeAfter){
        const list = diffBeforeAfter(beforeAfter.beforeObj, beforeAfter.afterObj)
          .filter((c)=> Array.isArray(c.path) && c.path.length > 0)
          .filter((c)=>{
            const fieldKey = Array.isArray(c.path) && c.path.length ? String(c.path[c.path.length - 1]) : '';
            return shouldShowField(tabKey, fieldKey);
          })
          .sort((a, b)=> a.path.join('.').localeCompare(b.path.join('.')));
        if(list.length){
          return list.map((c)=>{
            const key = escapeHtml(displayPath(tabKey, c.path));
            const fieldKey = Array.isArray(c.path) && c.path.length ? String(c.path[c.path.length - 1]) : '';
            const beforeText = escapeHtml(formatValueForContext(tabKey, fieldKey, c.beforeVal));
            const afterText = escapeHtml(formatValueForContext(tabKey, fieldKey, c.afterVal));
            return showArrow
              ? `${key}: <span class="diff-before">${beforeText}</span> <span class="diff-arrow">→</span> <span class="diff-after">${afterText}</span>`
              : `${key}: <span class="diff-before">${beforeText}</span> <span class="diff-after">${afterText}</span>`;
          }).join('\n');
        }
      }

      const afterOnly = extractAfterOnly(obj);
      if(afterOnly){
        const keys = Object.keys(afterOnly).filter((k)=> shouldShowField(tabKey, k)).sort();
        if(keys.length){
          return keys.map((k)=>{
            const key = escapeHtml(displayPath(tabKey, [k]));
            const beforeText = escapeHtml(formatValueForContext(tabKey, k, null));
            const afterText = escapeHtml(formatValueForContext(tabKey, k, afterOnly[k]));
            return showArrow
              ? `${key}: <span class="diff-before">${beforeText}</span> <span class="diff-arrow">→</span> <span class="diff-after">${afterText}</span>`
              : `${key}: <span class="diff-before">${beforeText}</span> <span class="diff-after">${afterText}</span>`;
          }).join('\n');
        }
      }

      const beforeOnly = extractBeforeOnly(obj);
      if(beforeOnly){
        const keys = Object.keys(beforeOnly).filter((k)=> shouldShowField(tabKey, k)).sort();
        if(keys.length){
          return keys.map((k)=>{
            const key = escapeHtml(displayPath(tabKey, [k]));
            const beforeText = escapeHtml(formatValueForContext(tabKey, k, beforeOnly[k]));
            const afterText = escapeHtml(formatValueForContext(tabKey, k, null));
            return showArrow
              ? `${key}: <span class="diff-before">${beforeText}</span> <span class="diff-arrow">→</span> <span class="diff-after">${afterText}</span>`
              : `${key}: <span class="diff-before">${beforeText}</span> <span class="diff-after">${afterText}</span>`;
          }).join('\n');
        }
      }

      return null;
    }

    function renderDetailHtml(raw, ctx){
      if(raw && typeof raw === 'object'){
        const diffHtml = renderDiffHtml(raw, ctx);
        if(diffHtml != null) return diffHtml;
        try{ return escapeHtml(JSON.stringify(raw, null, 2)); }
        catch(_e){ return escapeHtml(String(raw)); }
      }

      const text = String(raw ?? '');
      if(text.trim() === '') return '';

      const parsed = tryParseJson(text);
      if(parsed){
        const diffHtml = renderDiffHtml(parsed, ctx);
        if(diffHtml != null) return diffHtml;
      }

      // Fallback: show raw text with light highlighting for arrow lines.
      const highlightKeyLine = /^\s*"?(after|new|to|after_value|value_after|new_value)"?\s*:/i;
      return text.split('\n').map((line)=>{
        const trimmed = line.trimStart();
        const ctxTabKey = ctx && ctx.tabKey ? String(ctx.tabKey).trim() : '';
        const ctxShowArrow = ctxTabKey !== 'gov_ad_policy_file';

        const arrowMatch = line.match(/^(.*?)(\s*(?:->|=>|→)\s*)(.*)$/);
        if(arrowMatch){
          const left = escapeHtml(arrowMatch[1]);
          const sep = ctxShowArrow ? escapeHtml(arrowMatch[2]) : ' ';
          const right = escapeHtml(arrowMatch[3]);
          return `${left}${sep}<span class="diff-changed">${right}</span>`;
        }
        if(trimmed.startsWith('+') && !trimmed.startsWith('+++')){
          return `<span class="diff-changed">${escapeHtml(line)}</span>`;
        }
        if(highlightKeyLine.test(trimmed)){
          const idx = line.indexOf(':');
          if(idx >= 0){
            const head = escapeHtml(line.slice(0, idx + 1));
            const rawTail = String(line.slice(idx + 1));
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
      if('value' in el){
        el.value = String(raw ?? '');
        return;
      }
      el.innerHTML = html;
    }

    let activeLogId = null;
    const detailByLogId = new Map();

    if(addBtn){
      addBtn.disabled = true;
      addBtn.style.opacity = '0.5';
      addBtn.title = '변경이력은 자동으로 기록됩니다.';
      addBtn.setAttribute('aria-label', '변경이력은 자동으로 기록됩니다.');
    }

    detailModalClose && detailModalClose.addEventListener('click', function(){ closeModal('lg-detail-modal'); });
    detailSave && detailSave.addEventListener('click', function(e){ e.preventDefault(); closeModal('lg-detail-modal'); });

    let isSavingReason = false;
    function setReasonSavingState(saving){
      isSavingReason = !!saving;
      if(detailReasonSave){
        detailReasonSave.disabled = !!saving;
        detailReasonSave.setAttribute('aria-disabled', (!!saving).toString());
        detailReasonSave.title = saving ? '저장 중...' : '저장';
      }
    }

    async function saveReason(){
      if(isSavingReason) return;
      if(!Number.isFinite(adId)){
        try{ notifyMessage('대상 ID가 없습니다.', '오류', {kind: 'error'}); }catch(_e){}
        return;
      }
      const logId = Number(activeLogId);
      if(!Number.isFinite(logId)){
        try{ notifyMessage('먼저 변경이력에서 항목을 열어주세요. (관리 > 보기)', '알림'); }catch(_e){}
        return;
      }
      setReasonSavingState(true);
      const reason = detailReason ? String(detailReason.value || '') : '';
      try{
        const res = await apiRequest(`${API_BASE}/${encodeURIComponent(adId)}/logs/${encodeURIComponent(logId)}/reason`, {
          method: 'PUT',
          body: JSON.stringify({ reason }),
        });
        const item = res && (res.item || res);
        const reasonSaved = item && typeof item.reason === 'string' ? item.reason : reason;
        if(detailReason) detailReason.value = reasonSaved || '';
        try{
          const row = tbody ? tbody.querySelector(`tr[data-log-id="${String(logId)}"]`) : null;
          if(row) row.dataset.reason = reasonSaved || '';
        }catch(_e){ }
        try{ notifyMessage('저장되었습니다.', '완료', {kind: 'success'}); }catch(_e){}
        return reasonSaved;
      }finally{
        setReasonSavingState(false);
      }
    }

    detailReasonSave && detailReasonSave.addEventListener('click', function(e){
      e.preventDefault();
      saveReason().catch(function(err){
        console.error(err);
        const msg = err && err.message ? err.message : '변경 사유 저장 중 오류가 발생했습니다.';
        try{ notifyMessage(msg, '오류', {kind: 'error'}); }catch(_e){}
      });
    });

    detailReason && detailReason.addEventListener('keydown', function(e){
      if(e.key !== 'Enter') return;
      e.preventDefault();
      saveReason().catch(function(err){
        console.error(err);
        const msg = err && err.message ? err.message : '변경 사유 저장 중 오류가 발생했습니다.';
        try{ notifyMessage(msg, '오류', {kind: 'error'}); }catch(_e){}
      });
    });

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

    btnFirst && btnFirst.addEventListener('click', function(){
      if(currentPage <= 1) return;
      currentPage = 1;
      refreshLogs().catch(function(){});
    });
    btnPrev && btnPrev.addEventListener('click', function(){
      if(currentPage <= 1) return;
      currentPage = Math.max(1, currentPage - 1);
      refreshLogs().catch(function(){});
    });
    btnNext && btnNext.addEventListener('click', function(){
      const tp = totalPages();
      if(currentPage >= tp) return;
      currentPage = Math.min(tp, currentPage + 1);
      refreshLogs().catch(function(){});
    });
    btnLast && btnLast.addEventListener('click', function(){
      const tp = totalPages();
      if(currentPage >= tp) return;
      currentPage = tp;
      refreshLogs().catch(function(){});
    });

    function buildLogsCsv(items){
      const headers = ['변경일시', '변경유형', '변경자', '변경탭', '변경 내용', '변경 사유'];
      let csv = '\uFEFF';
      csv += headers.map(csvEscape).join(',') + '\n';
      const rows = Array.isArray(items) ? items : [];
      for(const it of rows){
        const displayMessage = normalizeLogMessage(it);
        const values = [
          it && it.created_at,
          actionLabel(it && it.action),
          it && it.actor,
          tabLabel(it && it.tab_key),
          displayMessage,
          it && (it.reason || ''),
        ];
        csv += values.map(csvEscape).join(',') + '\n';
      }
      return csv;
    }

    function extractFileNameFromLogDetail(rawDetail){
      if(!rawDetail || typeof rawDetail !== 'object') return '';
      try{
        if(rawDetail.created && typeof rawDetail.created === 'object'){
          const fn = rawDetail.created.file_name || rawDetail.created.fileName;
          if(fn) return String(fn);
        }
        if(Array.isArray(rawDetail.deleted) && rawDetail.deleted.length > 0){
          const fn = rawDetail.deleted[0] && (rawDetail.deleted[0].file_name || rawDetail.deleted[0].fileName);
          if(fn) return String(fn);
        }
        if(rawDetail.changed && typeof rawDetail.changed === 'object'){
          const c = rawDetail.changed.file_name || rawDetail.changed.fileName;
          if(c && typeof c === 'object'){
            const after = c.after != null ? c.after : c.to;
            const before = c.before != null ? c.before : c.from;
            const fn = after != null ? after : before;
            if(fn) return String(fn);
          }
        }
      }catch(_e){ /* ignore */ }
      return '';
    }

    function extractAccountUsernameFromLogDetail(rawDetail){
      if(!rawDetail || typeof rawDetail !== 'object') return '';
      try{
        if(rawDetail.after && typeof rawDetail.after === 'object'){
          const u = rawDetail.after.username;
          if(u) return String(u);
        }
        if(rawDetail.before && typeof rawDetail.before === 'object'){
          const u = rawDetail.before.username;
          if(u) return String(u);
        }
        // update diff can be a plain { field: {from,to} }
        const uObj = rawDetail.username;
        if(uObj && typeof uObj === 'object'){
          const to = uObj.to != null ? uObj.to : uObj.after;
          const from = uObj.from != null ? uObj.from : uObj.before;
          const u = to != null ? to : from;
          if(u) return String(u);
        }
      }catch(_e){ /* ignore */ }
      return '';
    }

    function extractFqdnFromLogDetail(rawDetail){
      if(!rawDetail || typeof rawDetail !== 'object') return '';
      try{
        if(rawDetail.after && typeof rawDetail.after === 'object'){
          const f = rawDetail.after.fqdn;
          if(f) return String(f);
        }
        if(rawDetail.before && typeof rawDetail.before === 'object'){
          const f = rawDetail.before.fqdn;
          if(f) return String(f);
        }
        if(rawDetail.changed && typeof rawDetail.changed === 'object'){
          const c = rawDetail.changed.fqdn;
          if(c && typeof c === 'object'){
            const after = c.after != null ? c.after : c.to;
            const before = c.before != null ? c.before : c.from;
            const f = after != null ? after : before;
            if(f) return String(f);
          }
        }
      }catch(_e){ /* ignore */ }
      return '';
    }

    function extractChangedCountFromDetail(rawDetail){
      if(!rawDetail || typeof rawDetail !== 'object') return 0;
      try{
        if(rawDetail.changed && typeof rawDetail.changed === 'object' && !Array.isArray(rawDetail.changed)){
          return Object.keys(rawDetail.changed).length;
        }

        // Legacy diffs often have only { before, after }.
        // Compute field-level changes by comparing before/after objects.
        if(
          rawDetail.before && typeof rawDetail.before === 'object' && !Array.isArray(rawDetail.before) &&
          rawDetail.after && typeof rawDetail.after === 'object' && !Array.isArray(rawDetail.after)
        ){
          const before = rawDetail.before;
          const after = rawDetail.after;

          const ignoreKeys = new Set(['id', 'ad_id', 'fqdn_id', 'account_id', 'created_at', 'updated_at']);

          const keys = new Set([...
            Object.keys(before || {}),
            Object.keys(after || {}),
          ]);

          const norm = (v) => {
            if(v == null) return '';
            if(typeof v === 'string') return v;
            if(typeof v === 'number' || typeof v === 'boolean') return v;
            try{ return JSON.stringify(v); }catch(_e){ return String(v); }
          };

          let count = 0;
          for(const k of keys){
            if(ignoreKeys.has(k)) continue;
            if(norm(before[k]) !== norm(after[k])) count += 1;
          }
          return count;
        }

        // update diff can be a plain { field: {from,to} }
        const keys = Object.keys(rawDetail);
        let count = 0;
        for(const k of keys){
          const v = rawDetail[k];
          if(v && typeof v === 'object' && !Array.isArray(v) && ('from' in v || 'to' in v || 'before' in v || 'after' in v)) count += 1;
        }
        return count;
      }catch(_e){ /* ignore */ }
      return 0;
    }

    function normalizeLogMessage(it){
      const msg = (it && it.message != null) ? String(it.message) : '';
      const tabKey = it && it.tab_key != null ? String(it.tab_key) : '';
      const rawDetail = (it && it.diff != null) ? it.diff : ((it && it.detail != null) ? it.detail : null);

      const actionRaw = it && it.action != null ? String(it.action) : '';
      const actionKey = actionRaw.trim().toUpperCase();

      if(tabKey === 'gov_ad_policy_file'){
        const fileName = extractFileNameFromLogDetail(rawDetail);
        if(fileName){
          if(actionKey === 'CREATE') return `구성/파일 등록 (${fileName})`;
          if(actionKey === 'UPDATE') return `구성/파일 수정 (${fileName})`;
          if(actionKey === 'DELETE') return `구성/파일 삭제 (${fileName})`;
        }
        const legacyCreate = msg.match(/^\s*구성\/파일\s*등록\s*:\s*(.+)\s*$/);
        if(legacyCreate) return `구성/파일 등록 (${legacyCreate[1]})`;
        const legacyUpdate = msg.match(/^\s*구성\/파일\s*수정\s*:\s*(.+)\s*$/);
        if(legacyUpdate) return `구성/파일 수정 (${legacyUpdate[1]})`;
        return msg || '-';
      }

      if(tabKey === 'gov_ad_policy_account'){
        const username = extractAccountUsernameFromLogDetail(rawDetail);
        const changedCount = extractChangedCountFromDetail(rawDetail);

        if(username){
          if(actionKey === 'CREATE') return `계정 ${username} 추가`;
          if(actionKey === 'UPDATE' && changedCount > 0) return `계정 ${username} 수정 (데이터 ${changedCount}개 수정)`;
          if(actionKey === 'UPDATE') return `계정 ${username} 수정`;
          if(actionKey === 'DELETE') return `계정 ${username} 삭제`;
        }

        const legacyCreate = msg.match(/^\s*계정\s*추가\s*:\s*(.+)\s*$/);
        if(legacyCreate) return `계정 ${legacyCreate[1]} 추가`;
        const legacyUpdate = msg.match(/^\s*계정\s*수정\s*:\s*(.+)\s*$/);
        if(legacyUpdate){
          const u = legacyUpdate[1];
          return changedCount > 0 ? `계정 ${u} 수정 (데이터 ${changedCount}개 수정)` : `계정 ${u} 수정`;
        }
        const legacyDelete = msg.match(/^\s*계정\s*삭제\s*:\s*(.+)\s*$/);
        if(legacyDelete) return `계정 ${legacyDelete[1]} 삭제`;

        return msg || '-';
      }

      if(tabKey === 'gov_ad_policy_domain'){
        const fqdn = extractFqdnFromLogDetail(rawDetail);
        const changedCount = extractChangedCountFromDetail(rawDetail);

        if(fqdn){
          if(actionKey === 'CREATE') return `도메인 ${fqdn} 추가`;
          if(actionKey === 'UPDATE' && changedCount > 0) return `도메인 ${fqdn} 수정 (데이터 ${changedCount}개 수정)`;
          if(actionKey === 'UPDATE') return `도메인 ${fqdn} 수정`;
          if(actionKey === 'DELETE') return `도메인 ${fqdn} 삭제`;
        }

        // Legacy domain messages didn't carry fqdn in text.
        if(msg && msg.trim() === '도메인 항목 추가' && fqdn) return `도메인 ${fqdn} 추가`;
        if(msg && msg.trim() === '도메인 항목 수정' && fqdn){
          return changedCount > 0 ? `도메인 ${fqdn} 수정 (데이터 ${changedCount}개 수정)` : `도메인 ${fqdn} 수정`;
        }
        if(msg && msg.trim() === '도메인 항목 삭제' && fqdn) return `도메인 ${fqdn} 삭제`;

        return msg || '-';
      }

      return msg || '-';
    }

    async function fetchAllLogsForCsv(adId){
      let page = 1;
      const requestedPageSize = 200;
      const all = [];
      let lastPage = 1;
      let safety = 0;
      while(page <= lastPage){
        safety += 1;
        if(safety > 500) break;
        const data = await apiRequest(`${API_BASE}/${encodeURIComponent(adId)}/logs?page=${encodeURIComponent(page)}&page_size=${encodeURIComponent(requestedPageSize)}`, { method: 'GET' });
        const total = data && Number.isFinite(parseInt(data.total, 10)) ? parseInt(data.total, 10) : 0;
        const currentSize = data && Number.isFinite(parseInt(data.page_size, 10)) ? parseInt(data.page_size, 10) : requestedPageSize;
        const items = Array.isArray(data.items) ? data.items : [];
        for(const it of items) all.push(it);
        lastPage = Math.max(1, Math.ceil((total || 0) / (currentSize || 1)));
        page += 1;
        if(items.length === 0) break;
      }
      return all;
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
        const rawDetailCandidate = (it && it.diff != null) ? it.diff : ((it && it.detail != null) ? it.detail : null);
        const diffText = (rawDetailCandidate == null)
          ? ''
          : (typeof rawDetailCandidate === 'string'
            ? rawDetailCandidate
            : (function(){ try{ return JSON.stringify(rawDetailCandidate, null, 2); }catch(_e){ return String(rawDetailCandidate); } })());
        const msg = normalizeLogMessage(it);
        const actionRaw = String(it.action || '').trim();
        const actionKey = actionRaw ? actionRaw.toUpperCase() : '';
        const tr = document.createElement('tr');
        tr.dataset.logId = String(it.log_id);
        tr.dataset.reason = String(it.reason || '');
        tr.dataset.tabKey = String(it.tab_key || '');
        tr.dataset.action = actionKey;
        tr.innerHTML = `
          <td><input type="checkbox" class="lg-row" data-id="${escapeHtml(it.log_id)}" aria-label="선택"></td>
          <td>${escapeHtml(it.created_at || '-')}</td>
          <td class="lg-action-cell"><span class="lg-action-label">${escapeHtml(actionLabel(actionRaw))}</span></td>
          <td>${escapeHtml(it.actor || '-')}</td>
          <td>${escapeHtml(tabLabel(it.tab_key))}</td>
          <td>${escapeHtml(msg)}</td>
          <td class="system-actions">
            <button type="button" class="action-btn" data-action="edit" data-id="${escapeHtml(it.log_id)}" title="보기" aria-label="보기">
              <img src="/static/image/svg/list/free-icon-search.svg" alt="보기" class="action-icon">
            </button>
          </td>
        `;
        tr.dataset.detail = diffText || msg;
        // Prefer structured diff/detail objects for better rendering.
        try{
          const rawDetail = (it && it.diff != null) ? it.diff : ((it && it.detail != null) ? it.detail : (it && it.message != null ? it.message : ''));
          detailByLogId.set(String(it.log_id || ''), rawDetail);
        }catch(_e){
          detailByLogId.set(String(it.log_id || ''), tr.dataset.detail || '');
        }
        tbody.appendChild(tr);
      }

      savedVisibleRows().forEach(function(tr){
        const cb = tr.querySelector('input.lg-row');
        syncRowSelectedState(tr, cb && cb.checked);
      });
      syncSelectAllState();
    }

    selectAll && selectAll.addEventListener('change', function(){
      if(!table) return;
      const checks = Array.from(table.querySelectorAll('tbody .lg-row'));
      const next = !!selectAll.checked;
      for(const cb of checks){
        cb.checked = next;
        const tr = cb.closest('tr');
        syncRowSelectedState(tr, next);
      }
      syncSelectAllState();
    });

    table && table.addEventListener('click', function(ev){
      if(!tbody) return;
      const tr = ev.target && ev.target.closest ? ev.target.closest('tr') : null;
      if(!tr || !tr.parentNode || tr.parentNode !== tbody) return;
      const isControl = ev.target && ev.target.closest
        ? ev.target.closest('button, a, input, select, textarea, label')
        : null;
      const onCheckbox = ev.target && ev.target.closest ? ev.target.closest('input.lg-row') : null;
      const onActionBtn = ev.target && ev.target.closest ? ev.target.closest('button.action-btn') : null;
      if(onActionBtn) return;
      if(isControl && !onCheckbox) return;
      if(onCheckbox) return;
      const cb = tr.querySelector('input.lg-row');
      if(!cb) return;
      cb.checked = !cb.checked;
      syncRowSelectedState(tr, cb.checked);
      syncSelectAllState();
    });

    table && table.addEventListener('change', function(ev){
      const cb = ev.target && ev.target.closest ? ev.target.closest('input.lg-row') : null;
      if(!cb) return;
      const tr = cb.closest('tr');
      syncRowSelectedState(tr, cb.checked);
      syncSelectAllState();
    });

    if(tbody){
      tbody.addEventListener('click', function(e){
        const btn = e.target && e.target.closest ? e.target.closest('button.action-btn[data-action="edit"]') : null;
        if(!btn) return;
        const row = btn.closest('tr');
        const logId = row ? String(row.dataset.logId || '') : '';
        const detail = logId && detailByLogId.has(logId) ? detailByLogId.get(logId) : (row ? (row.dataset.detail || '') : '');
        activeLogId = row ? row.dataset.logId : null;
        const ctx = { tabKey: row ? (row.dataset.tabKey || '') : '', action: row ? (row.dataset.action || '') : '' };
        setDetailContent(detailText, detail, ctx);
        if(detailReason) detailReason.value = row ? (row.dataset.reason || '') : '';
        openModal('lg-detail-modal');
      });
    }

    async function refreshLogs(){
      if(!Number.isFinite(adId)){
        render([]);
        totalItems = 0;
        currentPage = 1;
        updatePaginationUI(0);
        return;
      }
      const data = await apiRequest(`${API_BASE}/${encodeURIComponent(adId)}/logs?page=${encodeURIComponent(currentPage)}&page_size=${encodeURIComponent(pageSize)}`, { method: 'GET' });
      const items = Array.isArray(data.items) ? data.items : [];
      totalItems = (data && Number.isFinite(parseInt(data.total, 10))) ? parseInt(data.total, 10) : 0;
      const serverPage = (data && Number.isFinite(parseInt(data.page, 10))) ? parseInt(data.page, 10) : currentPage;
      const tp = Math.max(1, Math.ceil((totalItems || 0) / (pageSize || 1)));
      currentPage = Math.min(Math.max(1, serverPage), tp);
      render(items);
      updatePaginationUI(items.length);
      updateDownloadButtonState();
    }

    downloadBtn && downloadBtn.addEventListener('click', async function(e){
      e.preventDefault();
      if(!Number.isFinite(adId)) return;
      if(!tbody) return;
      const mode = selectionMode();
      const pickedIds = (mode === 'selected') ? selectedLogIdsOnPage() : [];
      try{
        downloadBtn.disabled = true;
        downloadBtn.title = 'CSV를 준비 중입니다...';

        let items = await fetchAllLogsForCsv(adId);
        if(mode === 'selected' && Array.isArray(items) && pickedIds.length){
          const pickedSet = new Set(pickedIds);
          items = items.filter((it)=> pickedSet.has(String(it && it.log_id)));
        }

        if(!items || items.length === 0){
          try{ notifyMessage('CSV 내보낼 항목이 없습니다.', '알림'); }catch(_e){}
          return;
        }

        const csv = buildLogsCsv(items);
        const today = new Date().toISOString().slice(0, 10);
        downloadTextAsFile(`ad_policy_logs_${adId}_${today}.csv`, csv, 'text/csv;charset=utf-8;');
        try{ notifyMessage('CSV 파일이 다운로드되었습니다.', '완료', {kind: 'success'}); }catch(_e){}
      }catch(err){
        const msg = err && err.message ? String(err.message) : 'CSV 다운로드 중 오류가 발생했습니다.';
        try{ notifyMessage(msg, '오류', {kind: 'error'}); }catch(_e){}
      }finally{
        downloadBtn.disabled = false;
        downloadBtn.title = 'CSV 다운로드';
      }
    });

    await refreshLogs();
  }

  ready(async function(){
    const idRaw = qs('id') || govDetailId();
    const adId = idRaw ? parseInt(idRaw, 10) : NaN;

    const editOpen = document.getElementById('detail-edit-open');
    const editClose = document.getElementById('system-edit-close');
    const editSave = document.getElementById('system-edit-save');

    if(editClose){
      editClose.addEventListener('click', function(){ closeModal('system-edit-modal'); });
    }

    if(!Number.isFinite(adId)){
      setText('page-header-title', 'AD POLICY');
      setText('page-header-subtitle', '대상 ID가 없습니다. 목록에서 항목을 선택하세요.');
      if(editOpen) editOpen.disabled = true;
      if(editSave) editSave.disabled = true;
      return;
    }

    // File tab wiring (no-op unless file tab DOM exists)
    try{ initAdPolicyFileTab(adId); }catch(_e){ /* ignore */ }

    // Stats cards wiring (no-op unless stats DOM exists)
    try{ initAdDomainStatsCard(adId); }catch(_e){ /* ignore */ }
    try{ initAdAccountStatsCard(adId); }catch(_e){ /* ignore */ }

    let record = null;

    async function refresh(){
      const data = await apiRequest(`${API_BASE}/${encodeURIComponent(adId)}`, { method: 'GET' });
      record = data;

      setText('page-header-title', record.domain || record.domain_name || 'AD POLICY');
      setText('page-header-subtitle', record.role || '-');

      setStatusBadge('ad-status', record.status);
      setText('ad-domain', record.domain);
      setText('ad-role', record.role);
      setText('ad-fqdn-count', record.fqdn_count);
      setText('ad-account-count', record.account_count);
      setText('ad-note', record.note);
    }

    try{
      await refresh();
    }catch(err){
      setText('page-header-title', 'AD POLICY');
      setText('page-header-subtitle', err && err.message ? err.message : 'AD 조회 실패');
      record = null;
      if(editOpen) editOpen.disabled = true;
      if(editSave) editSave.disabled = true;
      // do not return: other tabs may still render their lists
    }

    // Tab-specific wiring (no-op unless each tab DOM exists)
    try{ await initAdPolicyFqdnTab(adId); }catch(_e){ /* ignore */ }
    try{ await initAdPolicyAccountTab(adId); }catch(_e){ /* ignore */ }
    try{ await initAdPolicyLogTab(adId); }catch(_e){ /* ignore */ }

    if(editOpen && record){
      editOpen.addEventListener('click', function(){
        try{
          buildEditForm(record);
          openModal('system-edit-modal');
        }catch(err){
          showInlineError(err && err.message ? err.message : '수정 폼 초기화 실패');
        }
      });
    }

    if(editSave && record){
      editSave.addEventListener('click', async function(){
        const form = document.getElementById('system-edit-form');
        if(!form) return;
        try{
          const payload = formToPayload(form);
          await apiRequest(`${API_BASE}/${encodeURIComponent(adId)}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          });
          closeModal('system-edit-modal');
          await refresh();
        }catch(err){
          showInlineError(err && err.message ? err.message : 'AD 수정 실패');
        }
      });
    }
  });
})();

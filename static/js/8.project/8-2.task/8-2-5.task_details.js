(function(){
  // Minimal sample data synthesizer; in a real app this would come from query or server
  // Local persistence helpers and reset controls
  function clearPersisted(){
    try{ localStorage.removeItem('task_detail_state'); }catch(_){ }
  }
  function shouldReset(){
    try{
      const u = new URL(location.href);
      return u.searchParams.get('reset') === '1' || (u.hash||'').toLowerCase().includes('reset');
    }catch(_){ return false; }
  }
  function clearPersistedAndReload(){
    try{ clearPersisted(); }catch(_){ }
    try{
      const u = new URL(location.href);
      u.searchParams.delete('reset');
      history.replaceState(null, '', u.toString());
    }catch(_){ }
    try{ location.reload(); }catch(_){ }
  }
  // Expose a tiny API for manual reset from DevTools if needed
  try {
    window.BlossomTaskDetails = Object.assign(window.BlossomTaskDetails||{}, {
      clear: clearPersisted,
      reset: clearPersistedAndReload
    });
  } catch(_) { }
  function minutes(n){ return `${n}분`; }
  function fmt(dt){ const p=n=>String(n).padStart(2,'0'); return `${dt.getFullYear()}-${p(dt.getMonth()+1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}`; }
  function diffFmt(startDt, endDt){
    try{
      const ms = Math.max(0, endDt - startDt);
      const totalMin = Math.floor(ms/60000);
      const h = Math.floor(totalMin/60);
      const m = totalMin%60;
      const p=n=>String(n).padStart(2,'0');
      return `${h}시간 ${p(m)}분`;
    }catch(_){ return ''; }
  }
  function fileBadge(name){ const ext=(name.split('.').pop()||'').toUpperCase(); return ext.length>4?ext.slice(0,4):ext; }
  // Stable ID generator for targets (avoids index-based data loss)
  let __idSeq = 0;
  function makeId(){
    try{
      if (window.crypto && crypto.getRandomValues){
        const buf = new Uint32Array(2); crypto.getRandomValues(buf);
        return 't-' + Date.now().toString(36) + '-' + buf[0].toString(36) + buf[1].toString(36) + '-' + (++__idSeq);
      }
    }catch(_){ }
    return 't-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + (++__idSeq);
  }

  // Comment time formatter: today -> 오전/오후 h:mm, same year -> MM-DD HH:mm, different year -> YYYY-MM-DD HH:mm
  function _pad2(n){ return String(n).padStart(2, '0'); }
  function _isSameDay(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
  function _isSameYear(a,b){ return a.getFullYear()===b.getFullYear(); }
  function formatCommentDisplay(now, dt){
    try{
      if (!dt) return '';
      if (_isSameDay(now, dt)){
        const h = dt.getHours(); const m = dt.getMinutes();
        const ap = h>=12 ? '오후' : '오전';
        const hh = h%12 || 12;
        return `${ap} ${hh}:${_pad2(m)}`;
      }
      const M = _pad2(dt.getMonth()+1); const D=_pad2(dt.getDate()); const HH=_pad2(dt.getHours()); const MM=_pad2(dt.getMinutes());
      if (_isSameYear(now, dt)){
        return `${M}-${D} ${HH}:${MM}`; // 월-일 시:분
      }
      return `${dt.getFullYear()}-${M}-${D} ${HH}:${MM}`; // 년-월-일 시:분
    }catch(_){ return ''; }
  }

  // Progress bar timer for "진행중" status
  let progressTimer = null;
  function parseLocalDateTime(yyyyMMddHHmm){
    try{
      if (!yyyyMMddHHmm) return null;
      // Expecting format: YYYY-MM-DD HH:mm
      const [d, t] = String(yyyyMMddHHmm).split(' ');
      const [y,m,day] = d.split('-').map(n=>parseInt(n,10));
      const [hh,mm] = (t||'0:0').split(':').map(n=>parseInt(n,10));
      return new Date(y, (m||1)-1, day||1, hh||0, mm||0, 0, 0);
    }catch(_){ return null; }
  }
  function clamp(v, min, max){ return Math.min(max, Math.max(min, v)); }
  function computeProgressPercent(){
    if (!state.started || state.ended) return null;
    const startAt = state.actualStart ? new Date(state.actualStart) : parseLocalDateTime(state.start);
    const plannedEnd = parseLocalDateTime(state.end);
    if (!startAt || !plannedEnd) return null;
    const total = Math.max(1, plannedEnd - startAt);
    const now = Date.now();
    const elapsed = clamp(now - startAt.getTime(), 0, total);
    const pct = Math.round((elapsed / total) * 100);
    return clamp(pct, 0, 100);
  }
  function updateProgressUI(){
    // Scope to duration-only progress bars (no longer rendered per request)
    const pct = computeProgressPercent();
    const bars = document.querySelectorAll('.duration-with-progress .status-progress-bar');
    const labels = document.querySelectorAll('.duration-with-progress .status-progress-pct');
    if (!bars.length && !labels.length) return; // nothing to update
    if (pct == null){
      bars.forEach(b=>{ b.style.width = '0%'; });
      labels.forEach(l=>{ l.textContent = ''; });
      return;
    }
    bars.forEach(b=>{ b.style.width = pct + '%'; });
    labels.forEach(l=>{ l.textContent = pct + '%'; });
  }
  function startProgressTimer(){
    stopProgressTimer();
    // Update immediately, then every 30s
    updateProgressUI();
    try{ progressTimer = setInterval(updateProgressUI, 30000); }catch(_){ }
  }
  function stopProgressTimer(){
    if (progressTimer){ try{ clearInterval(progressTimer); }catch(_){ } progressTimer = null; }
  }

  // Comments limits (no pagination)
  const MAX_COMMENTS = 50;
  // Targets: no pagination (scroll within card)
  // Attachments: no pagination
  // Targets sorting
  let targetsSort = { key: 'workName', dir: 'asc' }; // dir: 'asc' | 'desc'
  // Currently selected row key (workName||systemName). Highlight only when a row is clicked.
  let selectedTargetKey = null;
  // Goals feature removed
  // no comments page state (scroll only)
  // Collapsed state of replies per top-level comment id (true = collapsed)
  let collapsedReplies = {};
  const COLLAPSE_STORE_KEY = 'task_detail_reply_collapse';
  function loadCollapsedMap(){
    try{ const raw = localStorage.getItem(COLLAPSE_STORE_KEY); collapsedReplies = raw ? JSON.parse(raw) : {}; }catch(_){ collapsedReplies = {}; }
  }
  function saveCollapsedMap(){
    try{ localStorage.setItem(COLLAPSE_STORE_KEY, JSON.stringify(collapsedReplies||{})); }catch(_){ }
  }

  // ===== Targets-driven progress (for 상태 표시) =====
  function computeTargetsProgress(){
    try{
      const arr = Array.isArray(state.targets) ? state.targets : [];
      const total = arr.length || 0;
      if (!total) return 0;
      // Progress counts when a target is no longer '대기' (완료/실패/부분완료 모두 수행 처리)
      const progressed = arr.reduce((acc,t)=> acc + ((t && t.status && t.status !== '대기') ? 1 : 0), 0);
    const pct = Math.round((progressed / total) * 100) || 0;
      return clamp(pct, 0, 100);
    }catch(_){ return 0; }
  }
  function updateStatusTargetsProgressUI(){
    try{
      const pct = computeTargetsProgress();
      const bar = document.querySelector('#status .status-progress-bar');
      const label = document.querySelector('#status .status-progress-pct');
      if (bar) bar.style.width = pct + '%';
      if (label) label.textContent = pct + '%';
    }catch(_){ }
  }
  function isCollapsedTop(cm, depth){ return depth===0 && !!collapsedReplies[cm.id]; }
  function ensureCollapsedDefaults(){
    try{
      (state.comments||[]).forEach(cm=>{
        if (!cm || typeof cm.id!== 'string') return;
        if (Array.isArray(cm.replies) && cm.replies.length>0 && typeof collapsedReplies[cm.id] === 'undefined'){
          collapsedReplies[cm.id] = true; // 기본 접힘
        }
      });
      saveCollapsedMap();
    }catch(_){ }
  }

  const state = {
    id: null,
    title: '작업 1 - 기능 개선 및 테스트',
  project: '블라썸 차세대 고도화',
  workType: '하드웨어', // 하드웨어 | 소프트웨어 | 기타
  assigned: { name: '문정한' },
  participants: ['김민수','이지은'],
    vendors: ['한빛시스템','세림테크'],
    start: '2025-08-28 09:00',
    end: '2025-08-29 11:00',
    duration: '26시간 00분',
    // Structured targets for the middle table
    targets: [
      { id: makeId(), workName: '상품처리 배치 테스트 AP#1', systemName: 'Web-01', status:'대기', systemIP: '10.10.10.21', mgmtIP: '192.168.0.21', hardware: 'HPE DL380 G10 Server', os: 'RHEL 9.2' },
      { id: makeId(), workName: '상품처리 배치 테스트 AP#1', systemName: 'DB-01', status:'대기', systemIP: '10.10.10.31', mgmtIP: '192.168.0.31', hardware: 'Dell PowerEdge R740', os: 'Oracle Linux 8.8' }
    ],
  // 영향대상 제거됨
    category: '서버',
  impact: '온라인',
  status: '예정',
  description: '1) 사전 점검 내용 확인\n2) 서비스 중단 공지 확인\n3) 재기동 및 로그 확인\n4) 결과 보고',
  goals: [ '서비스 영향 범위 확인', '백업 무결성 검증', '재기동 전 점검 체크리스트 완료', '장애 대응 플랜 리허설' ],
  attachments: [
    { name: 'Hyper-admin-design.zip', size: 2411724 },
    { name: 'Dashboard-design.jpg', size: 3410000 },
    { name: 'Admin-bug-report.mp4', size: 7390000 }
  ],
    comments: [
      // Chronological order (oldest at top → newest at bottom)
  { author: '문현필', time: new Date(Date.now()-1000*60*60*26).toISOString(), text: '좋아 보입니다.' },
  { author: '김동현', time: new Date(Date.now()-1000*60*60*2).toISOString(), text: '최근 3년 문서도 같이 검토할까요?' }
    ],
  started: false,
  ended: false,
  actualStart: null, // ISO string
  actualEnd: null // ISO string
  };

  const initialSnapshot = (()=>{
    // capture a shallow snapshot of initial timing/status fields to allow reset
    return {
      start: '2025-08-28 09:00',
      end: '2025-08-29 11:00',
      duration: '26시간 00분',
      status: '예정',
      started: false,
      ended: false,
      actualStart: null,
      actualEnd: null
    };
  })();

  function loadPersisted(){
    try{
      const key = 'task_detail_state';
      const raw = localStorage.getItem(key);
      if(!raw) return;
      const obj = JSON.parse(raw);
      if (obj && typeof obj==='object') {
  // checklist removed from UI; ignore persisted checklist if any
    if (Array.isArray(obj.comments)) {
          // If previous versions stored comments in newest-first order (unshift),
          // normalize to oldest-first by reversing when no explicit order is set.
          const order = obj.commentsOrder; // 'asc' | 'desc'
          let list = obj.comments.slice();
          if (order === 'desc') { list = list.reverse(); }
          // Apply to state
          state.comments = list;

          // One-time author rename migration
          const migrations = { 'Gera Seven': '문현필', 'Arya Stark': '김동현' };
          let changed = false;
          const migrate = (arr)=>{
            (arr||[]).forEach(cm=>{
              if (cm && typeof cm.author === 'string' && migrations[cm.author]){
                cm.author = migrations[cm.author];
                changed = true;
              }
              if (Array.isArray(cm.replies) && cm.replies.length){ migrate(cm.replies); }
            });
          };
          migrate(state.comments);
          if (changed){
            try{ savePersisted(); }catch(_){ }
          }
        }
    // migrate completed -> ended
    if (typeof obj.ended==='boolean') state.ended = obj.ended;
    else if (typeof obj.completed==='boolean') state.ended = obj.completed;
        if (typeof obj.started==='boolean') state.started = obj.started;
  if (typeof obj.status==='string') state.status = obj.status;
    if (obj.actualStart) state.actualStart = obj.actualStart;
    if (obj.actualEnd) state.actualEnd = obj.actualEnd;
  if (Array.isArray(obj.goalChecks)) state.goalChecks = obj.goalChecks.slice();
  if (Array.isArray(obj.goals)) state.goals = obj.goals.slice();
  if (typeof obj.description === 'string') state.description = obj.description;
  if (Array.isArray(obj.targets)) state.targets = obj.targets.slice();
      if (typeof obj.workType === 'string') state.workType = obj.workType;
      if (typeof obj.category === 'string') state.category = obj.category;
  if (Array.isArray(obj.attachments)) state.attachments = obj.attachments.slice();
  if (obj.review && typeof obj.review === 'object') state.review = obj.review;
  }
  // Ensure target rows have stable IDs after loading
  try{ ensureTargetIds(); }catch(_){ }
    }catch(e){}
  }
  function savePersisted(){
    try{
      const key='task_detail_state';
      const data = {
        started: !!state.started,
        ended: !!state.ended,
        status: state.status || '예정',
        actualStart: state.actualStart || null,
        actualEnd: state.actualEnd || null,
        description: state.description || '',
        targets: Array.isArray(state.targets) ? state.targets : [],
        workType: state.workType || '기타',
        category: state.category || '',
        attachments: Array.isArray(state.attachments) ? state.attachments : [],
        review: state.review || null,
        comments: Array.isArray(state.comments) ? state.comments : [],
        commentsOrder: 'asc'
      };
      localStorage.setItem(key, JSON.stringify(data));
    }catch(e){}
  }
  function generateSampleTargets(total){
    const works = ['결제', '주문', '회원', '정산', '배송', '상품', '쿠폰', '포인트'];
    const systems = ['Web', 'API', 'WAS', 'DB', 'Batch', 'Auth'];
    const list = [];
    for (let i=1;i<=total;i++){
      const w = works[(i-1)%works.length];
      const s = systems[(i-1)%systems.length];
      const statuses=['대기','완료','실패','부분완료'];
      list.push({
        id: makeId(),
        workName: `${w} 서비스 작업 대상 #${i}`,
        systemName: `${s}-${String(((i-1)%12)+1).padStart(2,'0')}`,
        status: statuses[i%statuses.length]
      });
    }
    return list;
  }
  function ensureSampleTargets(){
    try{
      const need = 56;
      const cur = Array.isArray(state.targets) ? state.targets.length : 0;
      if (cur < need){
        const add = generateSampleTargets(need - cur);
        state.targets = (state.targets||[]).concat(add);
        try{ savePersisted(); }catch(_){ }
      }
    }catch(_){ }
  }
  // Assign IDs to any target missing one (migration for older saved data)
  function ensureTargetIds(){
    try{
      if (!Array.isArray(state.targets)) return;
      let changed = false;
      state.targets.forEach(t=>{ if (t && !t.id){ t.id = makeId(); changed = true; } });
      if (changed){ try{ savePersisted(); }catch(_){ } }
    }catch(_){ }
  }

  // Remove any empty target rows (no workName and no systemName) and ensure IDs
  function normalizeTargets(){
    try{
      if (!Array.isArray(state.targets)) { state.targets = []; return; }
      let changed = false;
      const cleaned = state.targets.filter(t=>{
        const wn = String(t && t.workName || '').trim();
        const sn = String(t && t.systemName || '').trim();
        const keep = !!(wn || sn);
        if (!keep) changed = true;
        return keep;
      }).map(t=>{
        if (t && !t.id){ t.id = makeId(); changed = true; }
        return t;
      });
      if (changed){ state.targets = cleaned; try{ savePersisted(); }catch(_){ } }
      else { state.targets = cleaned; }
    }catch(_){ }
  }

  // ---- Attachments sample data (10 items) ----
  function generateSampleAttachments(total){
    const names = [
      '작업계획서.pdf','변경요청서.docx','리스크평가.xlsx','시나리오.txt','로그캡처-1.png',
      '로그캡처-2.png','방화벽정책.csv','네트워크도.vsdx','릴리스노트.md','검증결과.hwp'
    ];
    const list = [];
    for (let i=0;i<total;i++){
      const n = names[i % names.length] || `첨부-${i+1}.dat`;
      const size = 100000 + Math.floor(Math.random()*3_000_000);
      list.push({ name: n, size });
    }
    return list;
  }
  function ensureSampleAttachments(){
    try{
      // Seed only on true first-run when there are no attachments at all.
      // Remember that we seeded so subsequent refreshes do not repopulate after user deletions.
      const seededKey = 'task_detail_seeded_attachments';
      const alreadySeeded = (localStorage.getItem(seededKey) === '1');
      const hasList = Array.isArray(state.attachments);
      const cur = hasList ? state.attachments.length : 0;
      if (!alreadySeeded && (!hasList || cur === 0)){
        const add = generateSampleAttachments(10);
        state.attachments = add.slice();
        try{ savePersisted(); }catch(_){ }
        try{ localStorage.setItem(seededKey, '1'); }catch(_){ }
      }
    }catch(_){ }
  }

  function resetToInitial(preserveComments=true){
    // Reset timing/status fields to initial state; optionally keep comments
    const prevActualStart = state.actualStart; // capture before reset
    state.start = initialSnapshot.start;
    state.end = initialSnapshot.end;
    state.duration = initialSnapshot.duration;
    state.status = initialSnapshot.status;
    state.started = initialSnapshot.started;
    state.ended = initialSnapshot.ended;
    state.actualStart = initialSnapshot.actualStart;
    state.actualEnd = initialSnapshot.actualEnd;
    if (!preserveComments) state.comments = [];
    // If any target is not '대기', keep the task as 진행중 after reset
    try{
      const hasProgress = Array.isArray(state.targets) && state.targets.some(t => t && t.status && t.status !== '대기');
      if (hasProgress){
        state.started = true;
        state.status = '진행중';
        // Retain previous actualStart if there was one; otherwise allow time bar to use planned start
        state.actualStart = prevActualStart || null;
        state.ended = false;
      }
    }catch(_){ }
    savePersisted();
  }

  function el(html){ const t=document.createElement('template'); t.innerHTML=html.trim(); return t.content.firstChild; }

  function renderHeader(){
    const title = document.getElementById('task-title');
    if (title) {
      // Add a small status chip to aid scanning
      const chip = state.ended ? '<span class="title-chip">종료</span>' : (state.started ? '<span class="title-chip">진행중</span>' : '<span class="title-chip">예정</span>');
      title.innerHTML = `${state.title} ${chip}`;
      title.classList.toggle('completed', !!state.ended);
    }
  }

  // renderGoals removed

  function aggregateTargetsStatus(list){
    try{
      const arr = Array.isArray(list) ? list : [];
      if (arr.length === 0) return '-';
      const vals = arr.map(t => (t && typeof t.status === 'string') ? t.status : '대기');
      const uniq = Array.from(new Set(vals));
      if (uniq.length === 1){
        const only = uniq[0];
        if (only === '완료') return '전체완료';
        if (only === '실패') return '실패';
        if (only === '대기') return '대기';
        // 모두 '부분완료' 같은 단일 상태인 경우
        return '부분완료';
      }
      // 혼용된 경우
      return '부분완료';
    }catch(_){ return '-'; }
  }
  function updateResultStatus(){
    try{
      const el = document.getElementById('result-status'); if(!el) return;
      const res = aggregateTargetsStatus(state.targets);
      let cls = 'gray';
      if (res === '전체완료') cls = 'green';
      else if (res === '실패') cls = 'orange';
      else if (res === '부분완료') cls = 'blue';
      else if (res === '대기') cls = 'gray';
      el.innerHTML = `<span class="chip ${cls}">${res}</span>`;
    }catch(_){ }
  }

  function avatarImg(name, small){
    const src = '/static/image/center/avatar-default.svg';
    const alt = name ? name : 'avatar';
    return `<img class="avatar-img${small?' small':''}" src="${src}" alt="${alt}">`;
  }

  function renderParticipants(names){
    const maxAvatars = Math.min(names.length, 3);
    const avatars = names.slice(0, maxAvatars).map(n=>avatarImg(n,true)).join('');
    const namesText = names.join(', ');
    return `<div class="people-list"><span class="avatar-stack">${avatars}</span><span class="names">${namesText}</span></div>`;
  }

  function renderMeta(){
    const setAllHTML = (id, html)=>{
      document.querySelectorAll(`[id="${id}"]`).forEach(n=>{ n.innerHTML = html; });
    };
    const setAllText = (id, text)=>{
      document.querySelectorAll(`[id="${id}"]`).forEach(n=>{ n.textContent = text; });
    };

    setAllHTML('assigned-to', `${avatarImg(state.assigned.name,false)}<span class="name">${state.assigned.name}</span>`);
    setAllHTML('participants', renderParticipants(state.participants));
    setAllText('vendors', state.vendors.join(', '));

    const aStart = state.actualStart ? new Date(state.actualStart) : null;
    const aEnd = state.actualEnd ? new Date(state.actualEnd) : null;
    const startText = state.start + (aStart ? ` / ${fmt(aStart)}` : '');
    const endText = state.end + (aEnd ? ` / ${fmt(aEnd)}` : '');
    let durationText = state.duration;
    if (aStart && aEnd) durationText += ` / ${diffFmt(aStart, aEnd)}`;
    setAllText('start', startText);
    setAllText('end', endText);
    // 소요시간에는 프로그래스바를 표시하지 않음 (항상 텍스트만)
    setAllText('duration', durationText);
    // 프로젝트 이름 표시
    setAllText('project', state.project || '');
    // 작업구분 표시 (프로젝트와 동일한 텍스트 스타일)
    const workTypeVal = state.workType || '기타';
    setAllText('work-type', workTypeVal);
    // 작업분류: 작업구분에 따라 분류 칩 제공
    const hwCats = ['서버','스토리지','SAN','네트워크','보안장비'];
    const swCats = ['운영체제','데이터베이스','미들웨어','가상화','보안','고가용성'];
    const cats = workTypeVal === '하드웨어' ? hwCats : (workTypeVal === '소프트웨어' ? swCats : ['기타']);
    const catVal = cats.includes(state.category) ? state.category : cats[0];
    state.category = catVal; // normalize
    // 작업분류 표시 (프로젝트와 동일한 텍스트 스타일)
    setAllText('category', catVal);
    // 영향도: 온라인/오프라인만, 스타일 클래스로 구분
    const impactVal = (state.impact||'').trim();
    const impactCls = impactVal === '온라인' ? 'online' : (impactVal === '오프라인' ? 'offline' : 'gray');
    setAllHTML('impact', `<span class="chip ${impactCls}">${impactVal || ''}</span>`);
    // 상태 표시: 진행중일 때 상태 옆에도 진행률 바(대상 기반)를 표시
    if (state.ended){
      const html = `
        <span class="status-with-progress">
          <span class="chip green">종료</span>
          <span class="status-progress" role="progressbar" aria-label="진행률">
            <span class="status-progress-bar" style="width:0%"></span>
          </span>
          <span class="status-progress-pct" aria-hidden="true">0%</span>
        </span>`;
      setAllHTML('status', html);
      setTimeout(updateStatusTargetsProgressUI, 0);
    } else if (state.started){
      const html = `
        <span class="status-with-progress">
          <span class="chip blue">진행중</span>
          <span class="status-progress" role="progressbar" aria-label="진행률">
            <span class="status-progress-bar" style="width:0%"></span>
          </span>
          <span class="status-progress-pct" aria-hidden="true">0%</span>
        </span>`;
      setAllHTML('status', html);
      // Apply targets-based percent
      setTimeout(updateStatusTargetsProgressUI, 0);
    } else {
      setAllHTML('status', `<span class="chip gray">예정</span>`);
    }
  }

  function renderDescription(){
    const d = document.getElementById('description');
    if (!d) return;
  // Preserve whitespace/newlines exactly as typed in Step 3
  d.textContent = state.description || '';
  }

  // Increase the current line-height of #description by 30% relative to baseline and keep it on dynamic updates
  function applyDescriptionLineHeight(){
    try{
      var FACTOR = 1.3; // +30%
      var el = document.getElementById('description');
      if(!el) return;
      function computeBaseLineHeightPx(target){
        var cs = window.getComputedStyle(target);
        var lh = cs.lineHeight;
        if(lh === 'normal'){
          var fs = parseFloat(cs.fontSize) || 16;
          return 1.2 * fs; // approximate CSS 'normal'
        }
        if(/px$/.test(lh)) return parseFloat(lh) || 0;
        var num = parseFloat(lh);
        if(!isNaN(num) && num > 0){
          var fs2 = parseFloat(cs.fontSize) || 16;
          return num * fs2;
        }
        return 0;
      }
      function doApply(){
        if(!el) return;
        el.style.setProperty('white-space', 'pre-wrap', 'important');
        var base = el.dataset.baseLhPx ? parseFloat(el.dataset.baseLhPx) : 0;
        if(!base){
          base = computeBaseLineHeightPx(el);
          if(base) el.dataset.baseLhPx = String(base);
        }
        if(base){
          var target = base * FACTOR;
          el.style.setProperty('line-height', target.toFixed(2) + 'px', 'important');
        }
      }
      doApply();
      if (!el.__lhObserved){
        try{
          var obs = new MutationObserver(function(){ doApply(); });
          obs.observe(el, { childList:true, characterData:true, subtree:true });
          el.__lhObserved = true;
        }catch(_){ }
      }
    }catch(_){ }
  }

  // Checklist UI removed

  // Helpers: convert between 'YYYY-MM-DD HH:mm' and input[type=datetime-local] value 'YYYY-MM-DDTHH:mm'
  function toDatetimeLocalValue(s){
    try{
      if (!s) return '';
      if (s.includes('T') && !s.includes(' ')){
        return s.slice(0,16);
      }
      if (s.includes(' ')){
        const v = s.replace(' ', 'T');
        return v.slice(0,16);
      }
      return s;
    }catch(_){ return ''; }
  }
  function fromDatetimeLocalValue(v){
    try{
      if (!v) return '';
      return v.replace('T',' ').slice(0,16);
    }catch(_){ return ''; }
  }

  function downloadFile(file){
    // If a URL is provided on the attachment, download it directly. Otherwise, create a dummy blob.
    try{
      if (file.url){
        const a = document.createElement('a');
        a.href = file.url;
        a.download = file.name;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }
      if (file.dataUrl){
        const a = document.createElement('a');
        a.href = file.dataUrl;
        a.download = file.name || 'download';
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }
      const blob = new Blob([`Dummy content for ${file.name}`], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }catch(e){
      try{ alert('다운로드 중 오류가 발생했습니다.'); }catch(_){ }
    }
  }

  // attachments renderer without pagination (scroll within card)
  function renderAttachments(){
    const box = document.getElementById('attachments');
    if (!box) return;
    box.innerHTML = '';
    const list = Array.isArray(state.attachments) ? state.attachments : [];
    // Update counter like comments
    try{
      const cnt = document.getElementById('attachment-count');
      if (cnt) cnt.textContent = `(${list.length})`;
    }catch(_){ }
  if (!list.length){
      box.innerHTML = '<div class="muted">첨부된 파일이 없습니다.</div>';
      return;
    }
  list.forEach((f, idx)=>{
      const extUpper = (String(f.name||'').split('.').pop()||'FILE').toUpperCase();
      const colorMap = {
        PDF: '#fee2e2', JPG: '#dbeafe', JPEG: '#dbeafe', PNG: '#dcfce7', GIF: '#fef3c7',
        MP4: '#e9d5ff', ZIP: '#f5f5f5', DOC: '#e0f2fe', DOCX: '#e0f2fe', XLS: '#f0fdf4', XLSX: '#f0fdf4',
        PPT: '#ffedd5', PPTX: '#ffedd5', CSV: '#f1f5f9', TXT: '#f3f4f6', VSD: '#e0f2fe', VSDX: '#e0f2fe'
      };
      const bg = colorMap[extUpper] || '#f8fafc';
      const sizeMB = (Number(f.size||0)/ (1024*1024));
      const sizeText = sizeMB >= 0.1 ? sizeMB.toFixed(2) + ' MB' : (Math.round((f.size||0)/1024) + ' KB');
      const item = el(`
  <div class="attach-item" data-idx="${idx}" style="display:flex; align-items:center; gap: 12px; padding: 10px; border:1px solid #e5e7eb; border-radius: 12px; background:#fff;">
          <span class="file-badge" style="background:${bg}">.${extUpper}</span>
          <div style="display:flex; flex-direction:column; gap:2px;">
            <span class="file-name">${f.name||''}</span>
            <span class="file-size">${sizeText}</span>
          </div>
          <span class="attach-spacer"></span>
          <button class="download-btn" type="button" title="다운로드">⬇</button>
        </div>`);
      const btnDl = item.querySelector('.download-btn');
      if (btnDl) btnDl.onclick = ()=> downloadFile(f);
      box.appendChild(item);
    });
  }

  // ===== 결과리뷰 (summary + textarea 저장) =====
  function renderReview(){
    try{
      const card = document.getElementById('card-review');
      if (!card) return; // not on this page
      if (!state.review || typeof state.review !== 'object') state.review = { text: '' };
      const sumEl = document.getElementById('review-summary');
      const ta = document.getElementById('review-text');
      if (sumEl){
        const pct = computeTargetsProgress();
        const agg = aggregateTargetsStatus(state.targets);
        sumEl.textContent = `진행률 ${pct}% · 작업결과 ${agg}`;
      }
      if (ta && document.activeElement !== ta){
        ta.value = state.review.text || '';
      }
    }catch(_){ }
  }
  function wireReview(){
    try{
      const btn = document.getElementById('btn-review-save');
      const ta = document.getElementById('review-text');
      if (!btn || !ta) return;
      btn.onclick = ()=>{
        try{
          if (!state.review || typeof state.review !== 'object') state.review = { text: '' };
          const txt = String(ta.value||'').trim();
          state.review.text = txt;
          savePersisted();
          // small feedback
          const old = btn.textContent;
          btn.textContent = '저장됨';
          setTimeout(()=>{ try{ btn.textContent = old; }catch(_){ } }, 1200);
        }catch(_){ }
      };
    }catch(_){ }
  }

  // Cap comments height to targets box height
  function adjustCommentsHeight(){
    try{
      const targets = document.getElementById('card-targets');
      const commentsCard = document.getElementById('card-comments');
      if (!targets || !commentsCard) return;
      const max = Math.max(200, Math.floor(targets.getBoundingClientRect().height));
      const section = commentsCard.querySelector('.section');
      const commentsList = commentsCard.querySelector('.comments');
      const title = commentsCard.querySelector('.section-title');
      const composer = commentsCard.querySelector('.comment-form');
      if (!section || !commentsList){ return; }
      const cs = window.getComputedStyle(section);
      const padTop = parseFloat(cs.paddingTop)||0; const padBottom = parseFloat(cs.paddingBottom)||0;
      const titleH = title ? title.getBoundingClientRect().height : 0;
      const composerH = composer ? composer.getBoundingClientRect().height : 0;
      const maxList = max - (padTop + padBottom + titleH + composerH + 20);
      commentsList.style.maxHeight = Math.max(140, Math.floor(maxList)) + 'px';
      commentsList.style.overflow = 'auto';
    }catch(_){ }
  }

  function renderTargetsTable(){
    const body = document.getElementById('targets-tbody');
    if (!body) return;
    body.innerHTML = '';
  // Clean up any empty placeholder rows before displaying
  try{ normalizeTargets(); }catch(_){ }
    let rows = Array.isArray(state.targets) ? state.targets.slice() : [];
    // Update targets counter
    try{
      const cnt = document.getElementById('targets-count');
      if (cnt) cnt.textContent = `(${rows.length})`;
    }catch(_){ }
    // Apply sort
    const k = targetsSort.key; const d = targetsSort.dir === 'desc' ? -1 : 1;
    rows.sort((a,b)=>{
      const av=(a&&a[k])||''; const bv=(b&&b[k])||'';
      return String(av).localeCompare(String(bv), 'ko') * d;
    });
  // Render all rows (no pagination). The wrapper scrolls.
  const slice = rows;
  const keyOf = (r)=> r && r.id ? String(r.id) : `${String(r.workName||'')}||${String(r.systemName||'')}`;
  slice.forEach(r => {
      const tr = document.createElement('tr');
      const key = keyOf(r);
      tr.dataset.key = key;
  tr.dataset.id = (r && r.id) ? String(r.id) : key;
  if ((r.status||'') === '완료') { tr.classList.add('row-done'); }
      // 업무명
      const tdWork = document.createElement('td');
      tdWork.textContent = r.workName || '';
      tr.appendChild(tdWork);
      // 시스템명
      const tdSystem = document.createElement('td');
      tdSystem.textContent = r.systemName || '';
      tr.appendChild(tdSystem);
      // 점검 (드롭다운)
      const tdStatus = document.createElement('td');
      const sel = document.createElement('select');
      sel.className = 'target-status-select';
      const options = ['대기','완료','실패','부분완료'];
      options.forEach(opt=>{
        const o = document.createElement('option');
        o.value = opt; o.textContent = opt; if ((r.status||'대기')===opt) o.selected = true; sel.appendChild(o);
      });
      // Persist on change
    sel.addEventListener('change', ()=>{
        try{
          const idx = (state.targets||[]).findIndex(t=> keyOf(t)===key);
          if (idx>=0){
            const prev = state.targets[idx].status;
            state.targets[idx].status = sel.value;
            // Toggle completed row style immediately
            try{
              if (sel.value === '완료') tr.classList.add('row-done');
              else tr.classList.remove('row-done');
            }catch(_){ }
            // Auto-start when a target moves from '대기' to a non-'대기' state
            if (!state.started && prev === '대기' && sel.value !== '대기'){
              state.started = true; state.status = '진행중';
              if (!state.actualStart){ try{ state.actualStart = new Date().toISOString(); }catch(_){ } }
              // Update header/meta immediately and kick off time progress bar
              try{ renderHeader(); renderMeta(); startProgressTimer(); }catch(_){ }
              // Toggle start/end buttons if present
              try{
                var sBtn = document.getElementById('btn-task-start'); if (sBtn) sBtn.disabled = true;
                var eBtn = document.getElementById('btn-task-end'); if (eBtn) eBtn.disabled = false;
              }catch(_){ }
            }
            // If marked as 완료, keep this row visually selected like the example
            if (sel.value === '완료'){
              selectedTargetKey = key;
            }
            savePersisted();
          }
          // Re-render to apply sorting by status if active
          renderTargetsTable();
          updateResultStatus();
          renderReview();
        }catch(_){ }
      });
      tdStatus.appendChild(sel);
      tr.appendChild(tdStatus);
      // Selection visuals removed; keep click for possible future behaviors
      tr.addEventListener('click', () => {
        selectedTargetKey = key; // retained for logic but no visual change
      });
      body.appendChild(tr);
    });

  // Update sort indicators (direction arrows)
  updateSortIndicators();
  // Remove pagination UI (hidden via CSS as well)
    const container = document.getElementById('targets-pagination');
    if (container){ container.innerHTML = ''; }
  // Re-apply row highlight after rendering visible rows
  applyRowSelectionHighlight();
  // Update aggregate result chip under 작업정보
  updateResultStatus();
  // Update 상태 진행률 바 (targets 기반)
  updateStatusTargetsProgressUI();
  // Update review summary (targets-driven)
  renderReview();
  // Adjust comments height after layout changes
  adjustCommentsHeight();
  }

  // Wire header sort clicks and show indicator
  function initTargetsSorting(){
    const table = document.querySelector('#card-targets .targets-table'); if(!table) return;
    const headers = table.querySelectorAll('thead th.sortable');
    headers.forEach(th=>{
      th.style.cursor = 'pointer';
      th.addEventListener('click', ()=>{
  const key = th.getAttribute('data-sort-key')||'workName';
        if (targetsSort.key === key){ targetsSort.dir = (targetsSort.dir==='asc'?'desc':'asc'); }
        else { targetsSort.key = key; targetsSort.dir = 'asc'; }
        renderTargetsTable();
      });
    });
  }
  function updateSortIndicators(){
    const table = document.querySelector('#card-targets .targets-table'); if(!table) return;
    table.querySelectorAll('thead th.sortable').forEach(th=>{
      const key = th.getAttribute('data-sort-key');
      th.removeAttribute('aria-sort');
      th.classList.remove('sort-asc','sort-desc'); // keep clean; icons removed in CSS
      if (key === targetsSort.key){
        th.setAttribute('aria-sort', targetsSort.dir==='asc'?'ascending':'descending');
        // No visible arrow classes needed
      }
    });
  }
  // Ensure row selection style reflects current state
  applyRowSelectionHighlight();

  // Toggle row selection visual based on the currently selected row key
  function applyRowSelectionHighlight(){
    const body = document.getElementById('targets-tbody'); if (!body) return;
    body.querySelectorAll('tr').forEach(tr => {
  // Selection no longer drives styling; ensure class is not used
  tr.classList.remove('row-selected');
    });
  }

  // 영향대상 테이블 제거됨

  // Add helpers to support nested comments and icon actions
  function ensureCommentShape(cm){
    if (!cm) return null;
    if (typeof cm.id !== 'string') cm.id = Math.random().toString(36).slice(2,10);
    if (!Array.isArray(cm.replies)) cm.replies = [];
    cm.replies = cm.replies.map(ensureCommentShape);
    return cm;
  }
  function normalizeComments(){ if (!Array.isArray(state.comments)) state.comments = []; state.comments = state.comments.map(ensureCommentShape); }
  function totalComments(list){ return (list||[]).reduce((acc,cm)=> acc + 1 + totalComments(cm.replies||[]), 0); }
  // Flatten only VISIBLE comments (preorder). Replies are included only when parent (top-level) is expanded.
  function flattenVisible(list, depth=0, out=[]){
    (list||[]).forEach(cm=>{
      out.push({ cm, depth });
      const hasChildren = Array.isArray(cm.replies) && cm.replies.length>0;
      if (!hasChildren) return;
      // For top-level, gate by collapsed state; deeper levels always included as a single block under the expanded top-level
      if (depth === 0){
        if (!isCollapsedTop(cm, depth)){
          flattenVisible(cm.replies, depth+1, out);
        }
      } else {
        flattenVisible(cm.replies, depth+1, out);
      }
    });
    return out;
  }
  // Only allow replies to top-level comments (no reply-to-reply)
  function addReplyTopLevel(parentId, reply){
    const top = (state.comments||[]).find(cm => cm.id === parentId);
    if (top){ top.replies.push(ensureCommentShape(reply)); return true; }
    return false;
  }
  function deleteCommentById(targetId){
    const walk=(arr)=>{
      for (let i=0;i<arr.length;i++){
        const cm = arr[i];
        if (cm.id===targetId){ arr.splice(i,1); return true; }
        if (walk(cm.replies)) return true;
      }
      return false;
    };
    walk(state.comments);
    try{ if (collapsedReplies && Object.prototype.hasOwnProperty.call(collapsedReplies, targetId)) { delete collapsedReplies[targetId]; saveCollapsedMap(); } }catch(_){ }
  }

  // Render comments without pagination; scroll the list within the card
  function renderComments(){
    const c = document.getElementById('comments'); if(!c) return; c.innerHTML='';
    normalizeComments();
  ensureCollapsedDefaults();
    const counter = document.getElementById('comment-count');
    const totalAll = totalComments(state.comments);
    if (counter) counter.textContent = `(${totalAll})`;

  // Flatten visible items (replies hidden when collapsed)
  const flat = flattenVisible(state.comments, 0, []);
    const totalItems = flat.length;

    // Render a single item respecting depth; reply allowed only on top-level
    const renderNodeSingle = (cm, depth=0)=>{
      const replyCount = Array.isArray(cm.replies) ? totalComments(cm.replies) : 0;
      const hasReplies = depth===0 && replyCount>0;
      const collapsed = hasReplies ? isCollapsedTop(cm, depth) : false;
      const actions = `
            <span class="comment-actions">
              ${depth===0 ? '<button class="icon-btn btn-reply" title="답글"><img src="/static/image/svg/chat.svg" alt="reply"></button>' : ''}
              ${cm.author==='You' ? '<button class="icon-btn btn-delete" title="삭제"><img src="/static/image/svg/delete.svg" alt="delete"></button>' : ''}
            </span>`;
      const hasRepliesBox = depth === 0;
      const depthClass = depth>0 ? ` is-reply depth-${Math.min(depth,3)}` : '';
  const now = new Date();
  const dt = (cm && typeof cm.time==='string' && cm.time.includes('-')) ? new Date(cm.time) : null;
  const timeText = dt ? formatCommentDisplay(now, dt) : (cm.time || '');
  const node = el(`<div class="comment${depthClass}" data-id="${cm.id}">
        <div class="body">
          <div class="comment-header">
            <span class="author">${avatarImg(cm.author, true)}<span class="name">${cm.author}</span></span>
    <span class="time">${timeText}</span>
            ${actions}
          </div>
          <div class="text">${cm.text}</div>
          ${hasReplies && hasRepliesBox ? `<button class="replies-toggle" type="button" aria-expanded="${!collapsed}" aria-controls="replies-${cm.id}">${collapsed? '답글 ' + replyCount + '개 보기' : '답글 숨기기'}</button>` : ''}
          ${hasRepliesBox ? `<div class="replies" id="replies-${cm.id}"></div>` : ''}
        </div>
      </div>`);
      // Toggle replies visibility (affects pagination next render)
      if (hasReplies){
        const btnT = node.querySelector('.replies-toggle');
        if (btnT){
          btnT.onclick = ()=>{
            collapsedReplies[cm.id] = !collapsedReplies[cm.id];
            saveCollapsedMap();
            // Re-render and keep current page clamped
            renderComments();
          };
        }
      }
      // Reply action (top-level only)
      const btnReply = node.querySelector('.btn-reply');
      if (btnReply){
        btnReply.onclick = ()=>{
          if (totalComments(state.comments) >= MAX_COMMENTS){ try{ alert('댓글 제한(50개)에 도달했습니다.'); }catch(_){ } return; }
          let form = node.querySelector('.reply-form');
          if (form){ form.remove(); return; }
          form = el('<div class="reply-form"><textarea placeholder="답글을 입력하세요…"></textarea><div class="reply-actions"><button class="icon-btn btn-send" title="등록"><img src="/static/image/svg/select_check_box.svg" alt="send"></button><button class="icon-btn btn-cancel" title="취소"><img src="/static/image/svg/exit.svg" alt="cancel"></button></div></div>');
      const repliesBox = node.querySelector('.replies');
      if (repliesBox && repliesBox.parentNode){ repliesBox.parentNode.insertBefore(form, repliesBox); }
      else { node.appendChild(form); }
          const ta = form.querySelector('textarea');
          const btnSend = form.querySelector('.btn-send');
          const btnCancel = form.querySelector('.btn-cancel');
          btnCancel.onclick = ()=> form.remove();
          btnSend.onclick = ()=>{
            const text = (ta.value||'').trim(); if(!text) return;
            if (totalComments(state.comments) >= MAX_COMMENTS){ updateComposerEnabled(); try{ alert('댓글 제한(50개)에 도달했습니다.'); }catch(_){ } return; }
            const now = new Date();
            const iso = now.toISOString();
            addReplyTopLevel(cm.id, { author: 'You', time: iso, text });
            // Expand thread after posting a reply
            collapsedReplies[cm.id] = false;
            saveCollapsedMap();
            savePersisted();
            renderComments();
          };
          try { ta.focus(); } catch(_) {}
        };
      }
      // Delete (own comments)
      const btnDel = node.querySelector('.btn-delete');
      if (btnDel){
        btnDel.onclick = ()=>{
          deleteCommentById(cm.id);
          savePersisted();
          renderComments();
        };
      }
      return node;
    };

  // Render all items (no pagination)
  flat.forEach(({cm, depth})=> c.appendChild(renderNodeSingle(cm, depth)));

    // Remove pagination UI if present
    const titleEl = document.querySelector('#card-comments .section .section-title');
    if (titleEl){
      const old = titleEl.querySelector('.comments-pagination');
      if (old) old.remove();
    }

  // Keep current scroll position; no reset to top to avoid jump
  // Recompute height constraint on re-render
  adjustCommentsHeight();

    // Update composer enabled/disabled based on limit
    updateComposerEnabled();
  }

  function updateComposerEnabled(){
    try{
      const ta = document.getElementById('comment-input');
      const btn = document.getElementById('btn-comment');
  const disabled = totalComments(state.comments) >= MAX_COMMENTS;
  if (ta) { ta.disabled = disabled; ta.placeholder = disabled ? '댓글 제한(50개)에 도달했습니다.' : '댓글을 입력하세요…'; }
      if (btn) { btn.disabled = disabled; }
    }catch(_){ }
  }

  // Update top-level comment submit to include id and replies
  function wireCommentForm(){
    const btn = document.getElementById('btn-comment');
    const ta = document.getElementById('comment-input');
    if(!btn || !ta) return;
    // Prevent multi-line: submit on Enter and block default newline
    ta.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter'){
        e.preventDefault();
        btn.click();
      }
    });
    btn.onclick = ()=>{
      const text = (ta.value || '').trim(); if(!text) return;
      if (totalComments(state.comments) >= MAX_COMMENTS){ updateComposerEnabled(); return; }
  const now = new Date();
  const iso = now.toISOString();
  state.comments.push({ id: Math.random().toString(36).slice(2,10), author: 'You', time: iso, text, replies: [] });
      ta.value='';
      savePersisted();
      // Jump to last page after adding new comment
  try{ /* no-op */ }catch(_){ }
      renderComments();
    };
  }

  document.addEventListener('DOMContentLoaded', function(){
  // Load collapsed replies map
  loadCollapsedMap();
    // Optional one-time reset via URL (?reset=1 or #reset)
    if (shouldReset()){
      try{ clearPersisted(); }catch(_){ }
      // Clean the URL so subsequent reloads don't keep clearing
      try{ const u = new URL(location.href); u.searchParams.delete('reset'); history.replaceState(null,'', u.toString()); }catch(_){ }
    }
  loadPersisted();
  // Populate sample targets to 56 if fewer
  ensureSampleTargets();
  // Populate sample attachments to 10 if fewer
  ensureSampleAttachments();
    renderHeader();
    renderMeta();
  updateStatusTargetsProgressUI();
    renderDescription();
  applyDescriptionLineHeight();
  // goals removed
  // checklist removed
  initTargetsSorting();
  renderTargetsTable();
  updateResultStatus();
  // 영향대상 렌더 제거됨
    renderComments();
    wireCommentForm();
  updateComposerEnabled();
  // Attachments UI
  renderAttachments();
  renderReview();
  wireReview();
  const addBtn = document.getElementById('btn-add-file');
  const fileInput = document.getElementById('file-input');
  if (addBtn && fileInput){
    addBtn.onclick = ()=> fileInput.click();
    fileInput.onchange = async ()=>{
      try{
        const files = Array.from(fileInput.files||[]);
        const MAX_FILES = 10; const MAX_SIZE = 100 * 1024 * 1024; // 100MB
        // Enforce max files total (existing + new)
        if ((state.attachments?.length || 0) >= MAX_FILES){ try{ alert('첨부파일은 최대 10개까지만 가능합니다.'); }catch(_){ } fileInput.value=''; return; }
        for (const f of files){
          if ((state.attachments?.length || 0) >= MAX_FILES){ try{ alert('첨부파일은 최대 10개까지만 가능합니다.'); }catch(_){ } break; }
          if (f.size > MAX_SIZE){ try{ alert(`파일 크기 제한(100MB)을 초과했습니다: ${f.name}`); }catch(_){ } continue; }
          const dataUrl = await new Promise((resolve,reject)=>{
            const reader = new FileReader();
            reader.onload = ()=> resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(f);
          });
          state.attachments.push({ name: f.name, size: f.size, dataUrl });
        }
        savePersisted();
        renderAttachments();
        fileInput.value = '';
      }catch(_){ }
    };
  }
  // Initial height adjust and on resize
  adjustCommentsHeight();
  try{ window.addEventListener('resize', adjustCommentsHeight); }catch(_){ }

  // In-card actions
    const btnStartInCard = document.getElementById('btn-task-start');
    const btnEndInCard = document.getElementById('btn-task-end');
  const btnResetInCard = document.getElementById('btn-task-reset');

    function syncToolbar(){
      const disableStart = !!state.started || !!state.ended;
      const disableEnd = !state.started || !!state.ended;
      if (btnStartInCard) btnStartInCard.disabled = disableStart;
      if (btnEndInCard) btnEndInCard.disabled = disableEnd;
    }
    syncToolbar();
    function startTask(){
      if (state.started || state.ended) return;
      state.started = true; state.status = '진행중';
      const now = new Date();
      state.actualStart = now.toISOString();
      savePersisted();
      renderMeta(); syncToolbar();
      startProgressTimer();
    }
    function endTask(){
      if (state.ended) return;
      state.ended = true; state.status = '종료';
      const now = new Date();
      state.actualEnd = now.toISOString();
      savePersisted();
    // Show only first 10 (oldest) top-level comments by default; allow expanding to show all
    let commentsExpanded = false;

  renderHeader(); renderMeta(); syncToolbar();
  // Keep status progress bar visible even after 종료
  updateStatusTargetsProgressUI();
  stopProgressTimer();
  updateResultStatus();
  renderReview();
    }
    if (btnStartInCard) btnStartInCard.onclick = startTask;
    if (btnEndInCard) btnEndInCard.onclick = endTask;
    if (btnResetInCard) btnResetInCard.onclick = function(){
      // 1) Reset all target statuses to '대기'
      try{ if (Array.isArray(state.targets)) { state.targets.forEach(t=>{ if (t) t.status = '대기'; }); } }catch(_){ }
      // 2) Reset meta/timing; since all targets are now '대기', 상태는 예정으로 복귀
      resetToInitial(true);
      // 3) Re-render UI pieces
      renderHeader();
      renderMeta();
      renderTargetsTable();
      renderComments();
      syncToolbar();
      // 4) Manage timers
      if (state.started && !state.ended){ startProgressTimer(); } else { stopProgressTimer(); }
      // 5) Summary and status progress
      updateResultStatus();
      updateStatusTargetsProgressUI();
  renderReview();
    };

    // Print button (robust multi-page print via hidden iframe: no visible new window)
    const btnPrint = document.getElementById('btn-print');
    if (btnPrint){
      btnPrint.onclick = ()=>{
        try {
          const leftInfo = document.querySelector('#card-main .split-left .left-info');
          const targets = document.querySelector('#card-main .split-middle .right-targets');
          const desc = document.querySelector('#card-main .split-right .right-description');
          if (!leftInfo || !targets || !desc){ window.print(); return; }

          const titleText = (document.getElementById('task-title')?.textContent || '작업 상세');
          const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${titleText} - 인쇄</title>
  <link rel="stylesheet" href="/static/css/blossom.css?v=1.0.2">
  <link rel="stylesheet" href="/static/css/category.css?v=1.1.0">
  <link rel="stylesheet" href="/static/css/backup.css?v=1.0.3">
  <link rel="stylesheet" href="/static/css/project.css?v=1.0.82">
  <style>
    @media print {
      body { margin: 12mm; }
      .print-section { page-break-after: always; break-after: page; }
      .print-section:last-child { page-break-after: auto; break-after: auto; }
      /* Neutralize any fixed heights/scrolling in this isolated doc */
      .print-section .section, .print-section { height: auto !important; max-height: none !important; overflow: visible !important; }
      /* Table wrapping for print readability */
      table { table-layout: auto !important; }
      th, td { white-space: normal !important; overflow: visible !important; text-overflow: clip !important; }
    }
    /* Basic body typography for print */
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans KR', Arial, sans-serif; font-size: 12pt; color: #111; }
    .print-container { display: block; }
    .print-title { font-size: 18pt; font-weight: 800; margin: 0 0 8mm; }
    .section { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; }
    .section-title { font-weight: 800; margin: 0 0 8px; }
    /* Critical card/table styles to avoid broken look if external CSS is delayed */
    .task-card { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:14px; margin: 0 0 10mm; }
    .task-card:last-child { margin-bottom: 0; }
    .targets-table { width: 100%; border-collapse: collapse; font-size: 12pt; }
    .targets-table thead th { background:#f9fafb; color:#374151; font-weight:800; text-align:left; border-bottom:1px solid #e5e7eb; padding:8px; }
    .targets-table tbody td { border-bottom:1px solid #e5e7eb; padding:8px; color:#1f2937; }
    img { max-width: 100%; height: auto; }
  </style>
  <script>document.addEventListener('DOMContentLoaded', function(){ setTimeout(function(){ window.print(); }, 80); });</script>
</head>
<body class="task-details-page">
  <div class="print-container">
    <h1 class="print-title">${titleText}</h1>
    <section class="print-section" aria-label="작업정보">
      <section class="task-card">${leftInfo.outerHTML}</section>
    </section>
    <section class="print-section" aria-label="작업대상">
      <section class="task-card">${targets.outerHTML}</section>
    </section>
    <section class="print-section" aria-label="작업설명">
      <section class="task-card">${desc.outerHTML}</section>
    </section>
  </div>
</body>
</html>`;

          // Hidden iframe approach
          const iframe = document.createElement('iframe');
          iframe.style.position = 'fixed';
          iframe.style.left = '-9999px';
          iframe.style.top = '0';
          iframe.style.width = '0';
          iframe.style.height = '0';
          iframe.style.visibility = 'hidden';
          document.body.appendChild(iframe);

          const cleanup = ()=>{
            try{ document.body.removeChild(iframe); }catch(_){ }
          };

          const writeAndPrint = ()=>{
            try{
              const doc = iframe.contentWindow.document;
              doc.open();
              doc.write(html);
              doc.close();
              // Give the browser a moment to layout before printing
              setTimeout(()=>{
                try{
                  iframe.contentWindow.focus();
                  iframe.contentWindow.print();
                }catch(_){ cleanup(); }
              }, 50);
            }catch(_){
              try{ window.print(); }catch(__){}
              cleanup();
            }
          };

          // Some browsers fire afterprint; use it to cleanup. Also fallback timer.
          try{
            iframe.contentWindow.onafterprint = cleanup;
          }catch(_){ }
          setTimeout(cleanup, 15000);

          // Kick off write/print once iframe is ready
          if (iframe.contentWindow.document.readyState === 'complete') writeAndPrint();
          else iframe.onload = writeAndPrint;
        } catch(_) {
          try { window.print(); } catch(__) {}
        }
      };
    }
    // Edit button (placeholder interaction)
    const btnEdit = document.getElementById('btn-edit-task');
  if (btnEdit){ btnEdit.onclick = openTaskEditModal; }
  try{ wireTaskEditDelegation(); }catch(_){ }

    // Resume progress if page loaded while 진행중
    if (state.started && !state.ended){
      startProgressTimer();
    }
  });

  // ========== Flatpickr binding for task edit modal ==========
  let fpStart = null;
  let fpEnd = null;

  function parseYMDHM(str){
    // 'YYYY-MM-DD HH:mm' -> Date
    try{
      if (!str) return null;
      const [d,t] = str.split(' ');
      const [y,m,day] = d.split('-').map(n=>parseInt(n,10));
      const [hh,mm] = (t||'0:0').split(':').map(n=>parseInt(n,10));
      return new Date(y,(m||1)-1,day||1,hh||0,mm||0,0,0);
    }catch(_){ return null; }
  }
  function fmtYMDHM(dt){
    try{
      const p=n=>String(n).padStart(2,'0');
      return `${dt.getFullYear()}-${p(dt.getMonth()+1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
    }catch(_){ return ''; }
  }

  // Populate Step 1 "작업구분" select according to selected "작업분류"
  function syncEditCategories(){
    try{
      const wtEl = document.getElementById('edit-work-type');
      const sel = document.getElementById('edit-category');
      if (!sel) return;
      const wtVal = (wtEl && wtEl.value) || state.workType || '기타';
      const hwCats = ['서버','스토리지','SAN','네트워크','보안장비'];
      const swCats = ['운영체제','데이터베이스','미들웨어','가상화','보안','고가용성'];
      const cats = wtVal === '하드웨어' ? hwCats : (wtVal === '소프트웨어' ? swCats : ['기타']);
      // Rebuild options
      sel.innerHTML = '';
      cats.forEach(c => {
        const o = document.createElement('option');
        o.value = c; o.textContent = c;
        sel.appendChild(o);
      });
      // Select current state.category if valid, else first
      const targetVal = (state.category && cats.includes(state.category)) ? state.category : (cats[0] || '');
      if (targetVal){ sel.value = targetVal; state.category = targetVal; }
    }catch(_){ }
  }

  function initFlatpickrForModal(){
    const modal = document.getElementById('task-edit-modal');
    if (!modal || typeof window.flatpickr !== 'function') return;
    const makeOpts = (inputEl)=>({
      enableTime: true,
      time_24hr: true,
      minuteIncrement: 1,
      dateFormat: 'Y-m-d H:i',
      altInput: false,
      allowInput: false,
      static: false,
  position: 'above',
      disableMobile: true,
      locale: (window.flatpickr && window.flatpickr.l10ns && window.flatpickr.l10ns.ko) ? window.flatpickr.l10ns.ko : undefined,
      appendTo: document.body,
      positionElement: inputEl,
      onReady: function(selectedDates, dateStr, instance){
        try{
          // Prefer above; if clipped at top, fall back to below
          instance.set('position','above');
          const cal = instance.calendarContainer;
          cal.classList.add('blossom-date-popup');
          cal.classList.add('arrowTop');
          cal.classList.remove('arrowBottom');
          instance._positionCalendar();
        }catch(_){}
      },
      onOpen: function(selectedDates, dateStr, instance){
        try{
          instance.set('position','above');
          const cal = instance.calendarContainer;
          cal.classList.add('arrowTop');
          cal.classList.remove('arrowBottom');
          instance._positionCalendar();
          // ensure visibility by nudging modal scroll if necessary
          const rect = cal.getBoundingClientRect();
          if (rect.top < 8){
            const sc = modal.querySelector('.server-edit-body') || modal;
            try{ sc.scrollTop = Math.max(0, sc.scrollTop - (8 - rect.top + 12)); }catch(_){ }
            try{ instance._positionCalendar(); }catch(_){ }
          }
        }catch(_){}
      }
    });
    const elStart = document.getElementById('edit-start');
    const elEnd = document.getElementById('edit-end');
    try{ if (fpStart) { fpStart.destroy(); fpStart = null; } }catch(_){ }
    try{ if (fpEnd) { fpEnd.destroy(); fpEnd = null; } }catch(_){ }
  if (elStart){ fpStart = window.flatpickr(elStart, makeOpts(elStart)); }
  if (elEnd){ fpEnd = window.flatpickr(elEnd, makeOpts(elEnd)); }
  }

  // ===== 작업 수정 모달 =====
  function sanitizeEditSubtitle(modal){
    try{
      const m = modal || document.getElementById('task-edit-modal');
      if (!m) return;
      const el = m.querySelector('.server-edit-subtitle');
      if (!el) return;
      const t = String(el.textContent||'');
      const cleaned = t
        .replace(/\s*\[TD\s*v\d+\]\s*/i, '')
        .replace(/\s*\(\s*세로\s*\d+\s*px\s*\)\s*/i, '')
        .trim();
      if (cleaned !== t) el.textContent = cleaned;
    }catch(_){ }
  }
  function openTaskEditModal(){
    const modal = document.getElementById('task-edit-modal'); if (!modal) return;
    // Show modal first to avoid any prefill errors blocking visibility
    try{ modal.classList.add('show'); modal.setAttribute('aria-hidden','false'); modal.removeAttribute('hidden'); }catch(_){ }
    try{ document.body.classList.add('modal-open'); }catch(_){ }
    // Ensure subtitle has no version/height suffixes regardless of external injections
    try{ sanitizeEditSubtitle(modal); }catch(_){ }
  // Force fixed modal height for all steps (user request) — give more room for Step 3
  try{ window.__taskEditForceHeight = 860; }catch(_){ }
    // Prefill fields (guarded)
    const $ = (id)=>document.getElementById(id);
    try{ const t=$('edit-title'); if(t) t.value = state.title || ''; }catch(_){ }
    try{ const wt=$('edit-work-type'); if(wt) wt.value = state.workType || '하드웨어'; }catch(_){ }
    try{ syncEditCategories(); }catch(_){ }
    try{
      const c=$('edit-category');
      if (c){
        const values = Array.from(c.options).map(o=>o.value);
        if (state.category && values.includes(state.category)) c.value = state.category;
        else if (values.length){ c.value = values[0]; state.category = values[0]; }
      }
    }catch(_){ }
    try{ const a=$('edit-assigned'); if(a) a.value = (state.assigned && state.assigned.name) || ''; }catch(_){ }
    try{ const p=$('edit-participants'); if(p) p.value = (Array.isArray(state.participants)? state.participants.join(', ') : ''); }catch(_){ }
    try{ const v=$('edit-vendors'); if(v) v.value = (Array.isArray(state.vendors)? state.vendors.join(', ') : ''); }catch(_){ }
    try{ const s=$('edit-start'); if(s) s.value = state.start || ''; }catch(_){ }
    try{ const e=$('edit-end'); if(e) e.value = state.end || ''; }catch(_){ }
    try{ rebuildTargetsTable(); }catch(_){ }
    try{ const d=$('edit-description'); if(d) d.value = state.description || ''; }catch(_){ }
    // Steps
    currentEditStep = 1; updateEditStepUI();
    // Bind Flatpickr now that fields exist
    try{ initFlatpickrForModal(); }catch(_){ }
    // Set default values into pickers precisely
    try{
      if (fpStart) { const dt = parseYMDHM(state.start); if (dt) fpStart.setDate(dt, true, 'Y-m-d H:i'); }
      if (fpEnd) { const dt2 = parseYMDHM(state.end); if (dt2) fpEnd.setDate(dt2, true, 'Y-m-d H:i'); }
    }catch(_){ }
    // Ensure action bar is interactable and above any overlays
    try{
      const actions = modal.querySelector('.server-edit-actions');
      if (actions){ actions.style.pointerEvents = 'auto'; actions.style.position = actions.style.position || 'relative'; actions.style.zIndex = '2147483650'; }
      const btns = modal.querySelectorAll('#edit-prev-btn, #edit-next-btn, #edit-save-btn');
      btns.forEach(b=>{ b.disabled = false; b.style.pointerEvents = 'auto'; b.style.position = b.style.position || 'relative'; b.style.zIndex = '2147483651'; });
    }catch(_){ }
    // Wire listeners
  try{ if (typeof wireTaskEditOnce === 'function') wireTaskEditOnce(); }catch(_){ }
  wireTaskEditDelegation();
  wireTaskEditDirectButtons();
    wireTaskEditGlobalFallback();

    // Measure Step 1 natural size and store as base (height) for Steps 2/3 after layout & fonts settle
    try{
      const content = modal.querySelector('.server-edit-content');
      if (content){
        const doMeasureStable = (attempt=0, lastH=null)=>{
          try{
            content.style.width=''; content.style.height=''; content.style.minHeight=''; content.style.maxHeight='';
            const rect = content.getBoundingClientRect();
            const h = Math.round(rect.height);
            if (lastH !== null && Math.abs(h - lastH) <= 1){
              // consider stable
              window.__taskEditModalBaseSize = { width: Math.round(rect.width), height: h };
              try{
                const header = modal.querySelector('.server-edit-header');
                const actions = modal.querySelector('.server-edit-actions');
                const headerH = header ? Math.round(header.getBoundingClientRect().height) : 0;
                const actionsH = actions ? Math.round(actions.getBoundingClientRect().height) : 0;
                const bodyH = Math.max(80, h - headerH - actionsH);
                window.__taskEditModalBodyHeight = bodyH;
                window.__taskEditModalHeaderHeight = headerH;
                window.__taskEditModalActionsHeight = actionsH;
                // Measurement logs only; do not mutate subtitle text
                try{ console.info('[TaskEdit] Step1 height:', h, 'body height:', bodyH); }catch(_){ }
                try{ requestAnimationFrame(()=> updateEditStepUI()); }catch(_){ }
              }catch(_){ window.__taskEditModalBodyHeight = undefined; }
              return;
            }
            if (attempt >= 6){
              window.__taskEditModalBaseSize = { width: Math.round(rect.width), height: h };
              try{
                const header = modal.querySelector('.server-edit-header');
                const actions = modal.querySelector('.server-edit-actions');
                const headerH = header ? Math.round(header.getBoundingClientRect().height) : 0;
                const actionsH = actions ? Math.round(actions.getBoundingClientRect().height) : 0;
                const bodyH = Math.max(80, h - headerH - actionsH);
                window.__taskEditModalBodyHeight = bodyH;
                window.__taskEditModalHeaderHeight = headerH;
                window.__taskEditModalActionsHeight = actionsH;
                // Measurement logs only; do not mutate subtitle text (fallback)
                try{ console.info('[TaskEdit] Step1 height (fallback):', h, 'body height:', bodyH); }catch(_){ }
                try{ requestAnimationFrame(()=> updateEditStepUI()); }catch(_){ }
              }catch(_){ window.__taskEditModalBodyHeight = undefined; }
              return;
            }
            requestAnimationFrame(()=> doMeasureStable(attempt+1, h));
          }catch(_){ }
        };
        const kick = ()=> requestAnimationFrame(()=> requestAnimationFrame(()=> doMeasureStable()));
        if (document.fonts && typeof document.fonts.ready?.then === 'function'){
          document.fonts.ready.then(kick).catch(kick);
        } else {
          setTimeout(kick, 40);
        }
      }
    }catch(_){ }
  }

  function closeTaskEditModal(){
    const modal = document.getElementById('task-edit-modal'); if (!modal) return;
    modal.classList.remove('show'); modal.setAttribute('aria-hidden','true');
    try{ document.body.classList.remove('modal-open'); }catch(_){ }
  // On close, clean up any blank rows created during editing
  try{ normalizeTargets(); }catch(_){ }
    // destroy pickers to avoid leaks in repeated opens
    try{ if (fpStart) { fpStart.destroy(); fpStart = null; } }catch(_){ }
    try{ if (fpEnd) { fpEnd.destroy(); fpEnd = null; } }catch(_){ }
  // clear forced sizing
    try{
  const content = modal.querySelector('.server-edit-content');
  const body = modal.querySelector('.server-edit-body');
  const header = modal.querySelector('.server-edit-header');
  const actions = modal.querySelector('.server-edit-actions');
  if (content){ content.style.width=''; content.style.height=''; content.style.minHeight=''; content.style.maxHeight=''; content.removeAttribute('data-size-retries'); }
      if (body){ body.style.height=''; }
  if (header){ header.style.height=''; }
  if (actions){ actions.style.height=''; }
  // Subtitle text was never modified; no restoration needed
  window.__taskEditModalBaseSize = null;
  window.__taskEditModalBodyHeight = null;
  window.__taskEditModalHeaderHeight = null;
  window.__taskEditModalActionsHeight = null;
  window.__taskEditForceHeight = null;
    }catch(_){ }
  }

  // Render attachments inside Step 4 edit modal
  function renderEditAttachments(){
    try{
      const box = document.getElementById('edit-attachments-list'); if (!box) return;
      const list = Array.isArray(state.attachments) ? state.attachments : [];
      box.innerHTML = '';
      if (!list.length){ box.innerHTML = '<div class="muted">첨부된 파일이 없습니다.</div>'; return; }
      list.forEach((f, idx)=>{
        const item = document.createElement('div');
        item.className = 'attach-edit-item';
        const ext = (String(f.name||'').split('.').pop()||'FILE').toUpperCase();
        const sizeKB = Math.max(1, Math.round((Number(f.size||0))/1024));
        const colorMap = {
          PDF: '#fee2e2', JPG: '#dbeafe', JPEG: '#dbeafe', PNG: '#dcfce7', GIF: '#fef3c7', MP4: '#e9d5ff', ZIP: '#f5f5f5', DOC: '#e0f2fe', DOCX: '#e0f2fe', XLS: '#f0fdf4', XLSX: '#f0fdf4', PPT: '#ffedd5', PPTX: '#ffedd5'
        };
        const bg = colorMap[ext] || '#f8fafc';
        item.innerHTML = `
          <div class="left" style="display:flex; align-items:center; gap:10px;">
            <span class="file-badge" style="background:${bg}">.${ext}</span>
            <div class="meta"><div class="file-name">${f.name||''}</div><div class="file-size" style="font-size:12px; color:#6b7280;">${sizeKB} KB</div></div>
          </div>
          <button type="button" class="action-btn" title="삭제" aria-label="첨부 삭제" data-action="remove" data-idx="${idx}"><img alt="" src="/static/image/svg/delete.svg" class="action-icon"></button>
        `;
        box.appendChild(item);
      });
      // bind remove
    box.querySelectorAll('button[data-action="remove"]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const i = parseInt(btn.getAttribute('data-idx')||'-1',10);
          if (isNaN(i) || i<0) return;
          const next = Array.isArray(state.attachments) ? state.attachments.slice() : [];
          next.splice(i,1);
          state.attachments = next;
          renderEditAttachments();
      try{ savePersisted(); }catch(_){ }
      try{ renderAttachments(); }catch(_){ }
        });
      });
    }catch(_){ }
  }

  // Ensure Step 4 attachments area uses two-column layout even if template markup is old
  function ensureEditAttachmentsTwoCol(){
    try{
      const root = document.getElementById('edit-attachments');
      if (!root) return;
      // Remove any legacy "파일 추가" button if present
      try{
        root.querySelectorAll('.attachments-actions .btn-primary').forEach(btn=> btn.remove());
      }catch(_){ }

      let wrapper = root.querySelector('.attachments-two-col');
      const list = root.querySelector('#edit-attachments-list');
      const dz = root.querySelector('#edit-attachments-dropzone');
      if (!list || !dz) return;
      if (!wrapper){
        wrapper = document.createElement('div');
        wrapper.className = 'attachments-two-col';
        const left = document.createElement('div'); left.className = 'attachments-col list-col';
        const right = document.createElement('div'); right.className = 'attachments-col drop-col';
        // Insert wrapper before first of the two nodes, then move nodes inside
        root.insertBefore(wrapper, list);
        wrapper.appendChild(left);
        wrapper.appendChild(right);
        left.appendChild(list);
        right.appendChild(dz);
      }
    }catch(_){ }
  }

  // ===== Step 2: 작업대상 (편집용 테이블) =====
  function renderEditTargets(){
    try{
      const body = document.getElementById('edit-targets-body');
      if (!body) return;
  const list = Array.isArray(state.targets) ? state.targets.slice() : [];
  // Ensure IDs exist
  try{ ensureTargetIds(); }catch(_){ }
      if (!list.length){
        // 최소 1행은 보여주기
    list.push({ id: makeId(), workName:'', systemName:'', status:'대기' });
      }
      body.innerHTML = '';
      list.forEach((row, idx)=>{
        const tr = document.createElement('tr');
    const rid = row && row.id ? String(row.id) : '';
    tr.dataset.idx = String(idx);
    tr.dataset.id = rid;
        // 업무명
        const tdWork = document.createElement('td');
        const inWork = document.createElement('input');
        inWork.type = 'text'; inWork.className = 'form-input'; inWork.value = row.workName||'';
    inWork.addEventListener('input', ()=>{ try{ const i=(state.targets||[]).findIndex(t=> String(t.id||'')===rid); if(i>=0){ state.targets[i].workName = inWork.value; savePersisted(); } }catch(_){ } });
        tdWork.appendChild(inWork);
        tr.appendChild(tdWork);
        // 시스템명
        const tdSys = document.createElement('td');
        const inSys = document.createElement('input');
        inSys.type = 'text'; inSys.className = 'form-input'; inSys.value = row.systemName||'';
    inSys.addEventListener('input', ()=>{ try{ const i=(state.targets||[]).findIndex(t=> String(t.id||'')===rid); if(i>=0){ state.targets[i].systemName = inSys.value; savePersisted(); } }catch(_){ } });
        tdSys.appendChild(inSys);
        tr.appendChild(tdSys);
  // 점검 컬럼 제거(편집 단계에서는 상태를 수정하지 않음)
  // 삭제 버튼 (backup 정책 페이지와 동일 스타일)
  const tdCtl = document.createElement('td');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'action-btn';
  btn.setAttribute('title','삭제');
  btn.setAttribute('aria-label','행 삭제');
  btn.innerHTML = '<img alt="" src="/static/image/svg/delete.svg" class="action-icon">';
  btn.addEventListener('click', ()=>{ try{ const arr = Array.isArray(state.targets)? state.targets.slice() : []; const i = arr.findIndex(t=> String(t.id||'')===rid); if(i>=0){ arr.splice(i,1); state.targets = arr; renderEditTargets(); savePersisted(); } }catch(_){ } });
  tdCtl.appendChild(btn);
        tr.appendChild(tdCtl);
        body.appendChild(tr);
      });
    }catch(_){ }
  }
  function addTargetRow(){
    try{
  const arr = Array.isArray(state.targets) ? state.targets.slice() : [];
  arr.push({ id: makeId(), workName:'', systemName:'', status:'대기' });
      state.targets = arr; savePersisted();
      renderEditTargets();
      try{ const body = document.getElementById('edit-targets-body'); body && body.lastElementChild && body.lastElementChild.scrollIntoView({block:'nearest'}); }catch(_){ }
    }catch(_){ }
  }

  // ===== Step 2: hardware search & add (no duplicates) =====
  function debounce(fn, ms){ let t=null; return function(){ const ctx=this, args=arguments; clearTimeout(t); t=setTimeout(()=>fn.apply(ctx,args), ms); }; }
  function renderSearchResults(list){
    try{
      const box = document.getElementById('edit-targets-results'); if (!box) return;
      box.innerHTML = '';
      const items = Array.isArray(list) ? list : [];
      if (!items.length){ box.innerHTML = '<div class="muted">검색 결과가 없습니다.</div>'; return; }
      const ul = document.createElement('ul');
      ul.style.listStyle = 'none'; ul.style.padding = '0'; ul.style.margin = '0';
      items.forEach(it=>{
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.alignItems = 'center';
        li.style.justifyContent = 'space-between';
        li.style.gap = '8px';
        li.style.padding = '8px 10px';
        li.style.border = '1px solid #e5e7eb';
        li.style.borderRadius = '8px';
        li.style.marginTop = '6px';
        li.style.background = '#fff';
        li.style.cursor = 'pointer';
        const left = document.createElement('div');
        left.innerHTML = `<strong>${(it.work_name||'').replace(/</g,'&lt;')}</strong> <span style="color:#6b7280;">· ${(it.system_name||'').replace(/</g,'&lt;')}</span>`;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-secondary';
        btn.textContent = '추가';
        btn.style.minWidth = '56px';
        const add = ()=>{
          try{
            const wn = String(it.work_name||'').trim();
            const sn = String(it.system_name||'').trim();
            if (!wn && !sn) return;
            const exists = (state.targets||[]).some(t=> String(t.workName||'').trim()===wn && String(t.systemName||'').trim()===sn);
            if (exists){ return; }
            const arr = Array.isArray(state.targets) ? state.targets.slice() : [];
            arr.push({ id: makeId(), workName: wn, systemName: sn, status: '대기' });
            state.targets = arr; savePersisted();
            renderEditTargets();
          }catch(_){ }
        };
        btn.addEventListener('click', add);
        li.addEventListener('click', (e)=>{ if (e.target===btn) return; add(); });
        li.appendChild(left);
        li.appendChild(btn);
        ul.appendChild(li);
      });
      box.appendChild(ul);
    }catch(_){ }
  }
  function wireTargetsSearch(){
    try{
      const input = document.getElementById('edit-targets-search');
      const doSearch = debounce(async function(){
        const q = (input.value||'').trim();
        const box = document.getElementById('edit-targets-results');
        if (!q){ if (box) box.innerHTML = ''; return; }
        try{
          const url = `/api/hardware/search?q=${encodeURIComponent(q)}&limit=30`;
          const res = await fetch(url, { credentials: 'same-origin' });
          if (!res.ok) throw new Error('http');
          const data = await res.json();
          renderSearchResults(data);
        }catch(err){ if (box) box.innerHTML = '<div class="muted">검색 중 오류가 발생했습니다.</div>'; }
      }, 250);
      if (input && !input.__bound){ input.__bound = true; input.addEventListener('input', doSearch); }
    }catch(_){ }
  }

  let currentEditStep = 1;
  function updateEditStepUI(){
    const show = (id, vis)=>{
      const el=document.getElementById(id); if(!el) return;
      el.style.display = vis ? '' : 'none'; // let CSS decide (flex layouts)
      if (vis) el.setAttribute('aria-hidden','false'); else el.setAttribute('aria-hidden','true');
    };
  for (let i=1;i<=4;i++) show(`edit-step-${i}`, i===currentEditStep);
    const prevBtn = document.getElementById('edit-prev-btn');
    const nextBtn = document.getElementById('edit-next-btn');
    const saveBtn = document.getElementById('edit-save-btn');
    if (prevBtn) prevBtn.style.display = currentEditStep>1 ? '' : 'none';
  if (nextBtn) nextBtn.style.display = currentEditStep<4 ? '' : 'none';
  if (saveBtn) saveBtn.style.display = currentEditStep===4 ? '' : 'none';

  // Step 2: 진입 시 작업대상 렌더링
  try{
  if (currentEditStep === 2){ renderEditTargets(); wireTargetsSearch(); }
  }catch(_){ }
  // Step 4: refresh attachments list when entering
  try{
    const modal = document.getElementById('task-edit-modal');
    if (modal){ modal.classList.toggle('show-step-4', currentEditStep === 4); }
    if (currentEditStep === 4) { renderEditAttachments(); ensureEditAttachmentsTwoCol(); }
  }catch(_){ }

    // Step 3: autofocus the description area and place caret at the end
    try{
      if (currentEditStep === 3){
        const ta = document.getElementById('edit-description');
        if (ta){
          requestAnimationFrame(()=>{
            try{ ta.focus(); const len = ta.value?.length||0; ta.setSelectionRange(len, len); }catch(_){ }
          });
        }
      }
    }catch(_){ }

    // Apply fixed height rules
    try{
      const modal = document.getElementById('task-edit-modal');
      const content = modal ? modal.querySelector('.server-edit-content') : null;
      const body = modal ? modal.querySelector('.server-edit-body') : null;
  const header = modal ? modal.querySelector('.server-edit-header') : null;
  const actions = modal ? modal.querySelector('.server-edit-actions') : null;
  // Always sanitize subtitle text to remove any version/height artifacts
  try{ sanitizeEditSubtitle(modal); }catch(_){ }
      const base = window.__taskEditModalBaseSize;
      if (content){
        // Hard lock height for ALL steps when force flag is set
  const desiredH = Number(window.__taskEditForceHeight) || 0;
  const maxH = Math.max(320, Math.floor((window.innerHeight||0) * 0.95) || desiredH || 860);
  const forceH = Math.min(desiredH||860, maxH);
        if (forceH > 0){
          content.style.boxSizing = 'border-box';
          content.style.height = forceH + 'px';
          content.style.minHeight = forceH + 'px';
          content.style.maxHeight = forceH + 'px';
          content.style.width = '';
          // compute inner body height each time from current header/footer to fill exactly
          const headerH = header ? Math.round(header.getBoundingClientRect().height) : 0;
          const actionsH = actions ? Math.round(actions.getBoundingClientRect().height) : 0;
          if (body){ body.style.height = Math.max(80, forceH - headerH - actionsH) + 'px'; }
          // Do not proceed further; height is fixed for all steps
          return;
        }
        if (currentEditStep === 1){
          // Ensure Step 1 uses natural CSS-driven size
          content.style.width = '';
          content.style.height = '';
          content.style.minHeight = '';
          content.style.maxHeight = '';
          content.style.boxSizing = '';
          content.removeAttribute('data-size-retries');
          if (body){ body.style.height=''; }
          if (header){ header.style.height=''; }
          if (actions){ actions.style.height=''; }
        } else {
          if (base && base.height){
            // Lock only HEIGHT to Step 1's measured height (use border-box to match rect height exactly)
            content.style.boxSizing = 'border-box';
            content.style.height = base.height + 'px';
            content.style.minHeight = base.height + 'px';
            content.style.maxHeight = base.height + 'px';
            // Width stays natural to avoid line-wrap induced height changes
            content.style.width = '';
            // Also lock inner body area height so total outer height remains constant
            const headerH = Number(window.__taskEditModalHeaderHeight) || (header ? Math.round(header.getBoundingClientRect().height) : 0);
            const actionsH = Number(window.__taskEditModalActionsHeight) || (actions ? Math.round(actions.getBoundingClientRect().height) : 0);
            if (header && headerH){ header.style.height = headerH + 'px'; }
            if (actions && actionsH){ actions.style.height = actionsH + 'px'; }
            if (body){
              const bodyH = Math.max(80, base.height - headerH - actionsH);
              body.style.height = bodyH + 'px';
            }
          } else {
            // Fallback: wait briefly for measurement to finish, then apply once ready
            const retries = Number(content.getAttribute('data-size-retries')||'0');
            if (retries < 8){
              content.setAttribute('data-size-retries', String(retries+1));
              requestAnimationFrame(()=> updateEditStepUI());
            }
          }
        }
      }
    }catch(_){ }
  }

  // Delegated modal events (prev/next/save, type change)
  function wireTaskEditDelegation(){
    const modal = document.getElementById('task-edit-modal'); if (!modal) return;
    if (modal.__delegatedBound) return; modal.__delegatedBound = true;
    modal.addEventListener('click', (e)=>{
      if (e.target === modal){ closeTaskEditModal(); return; }
      const q = (sel)=> e.target.closest(sel);
      if (q('#task-edit-close')){ e.preventDefault(); closeTaskEditModal(); return; }
    if (q('#edit-prev-btn')){ e.preventDefault(); navigatePrev(); return; }
    if (q('#edit-next-btn')){ e.preventDefault(); navigateNext(); return; }
  if (q('#edit-save-btn')){ e.preventDefault(); navigateSave(); return; }
  // removed: file-add button (use dropzone or click dropzone to open input)
      if (q('#btn-add-target-row')){ e.preventDefault(); addTargetRow(); return; }
    });
    // Ctrl+Enter saves on Step 3
    modal.addEventListener('keydown', (e)=>{
      try{
        const isEnter = (e.key === 'Enter' || e.keyCode === 13);
        if (isEnter && (e.ctrlKey || e.metaKey) && currentEditStep === 4){
          e.preventDefault();
          navigateSave();
        }
      }catch(_){ }
    });
    // file selection handler
  modal.addEventListener('change', (e)=>{
      if (e.target && e.target.id === 'edit-attachment-input'){
        const files = Array.from(e.target.files||[]);
        if (!files.length) return;
        const next = Array.isArray(state.attachments) ? state.attachments.slice() : [];
        files.forEach(f=>{
          next.push({ name: f.name, size: f.size });
        });
        state.attachments = next;
    try{ renderEditAttachments(); }catch(_){ }
    try{ renderAttachments(); }catch(_){ }
    try{ savePersisted(); }catch(_){ }
        try{ e.target.value = ''; }catch(_){ }
      }
    }, true);
    // Drag & Drop for attachments dropzone
    const dz = document.getElementById('edit-attachments-dropzone');
    if (dz && !dz.__bound){
      dz.__bound = true;
      const prevent = (ev)=>{ try{ ev.preventDefault(); ev.stopPropagation(); }catch(_){ } };
      ['dragenter','dragover','dragleave','drop'].forEach(evt=>{
        dz.addEventListener(evt, prevent);
      });
      dz.addEventListener('dragenter', ()=> dz.classList.add('dragover'));
      dz.addEventListener('dragover', ()=> dz.classList.add('dragover'));
      dz.addEventListener('dragleave', ()=> dz.classList.remove('dragover'));
    dz.addEventListener('drop', (ev)=>{
        dz.classList.remove('dragover');
        try{
          const files = Array.from(ev.dataTransfer?.files || []);
          if (!files.length) return;
          const next = Array.isArray(state.attachments) ? state.attachments.slice() : [];
          files.forEach(f=> next.push({ name: f.name, size: f.size }));
          state.attachments = next;
      renderEditAttachments();
      try{ renderAttachments(); }catch(_){ }
      savePersisted();
        }catch(_){ }
      });
      // Click/keyboard to open hidden input
      dz.addEventListener('click', ()=>{ const inp = document.getElementById('edit-attachment-input'); if (inp) inp.click(); });
      dz.addEventListener('keydown', (ev)=>{ if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); const inp = document.getElementById('edit-attachment-input'); if (inp) inp.click(); } });
    }
    modal.addEventListener('change', (e)=>{
      if (e.target && e.target.id === 'edit-work-type'){
        syncEditCategories();
        const sel = document.getElementById('edit-category');
        if (sel && sel.options.length){ sel.value = sel.options[0].value; state.category = sel.value; }
      }
    });
  }

  // Direct button handlers as a safety net (in case delegation doesn’t fire)
  function wireTaskEditDirectButtons(){
    const prev = document.getElementById('edit-prev-btn');
    const next = document.getElementById('edit-next-btn');
    const save = document.getElementById('edit-save-btn');
  // removed: const addAtt = document.getElementById('btn-add-attachment');
    const addRow = document.getElementById('btn-add-target-row');
    if (prev && !prev.__bound){
      prev.__bound = true;
  prev.addEventListener('click', (e)=>{ e.preventDefault(); navigatePrev(); });
    }
    if (next && !next.__bound){
      next.__bound = true;
  next.addEventListener('click', (e)=>{ e.preventDefault(); navigateNext(); });
    }
    if (save && !save.__bound){
      save.__bound = true;
  save.addEventListener('click', (e)=>{ e.preventDefault(); navigateSave(); });
    }
  // removed: add button binding
    if (addRow && !addRow.__bound){
      addRow.__bound = true;
      addRow.addEventListener('click', (e)=>{ e.preventDefault(); addTargetRow(); });
    }
  }

  // Global capture fallback (last resort)
  function wireTaskEditGlobalFallback(){
    if (document.__taskEditGlobalBound) return; document.__taskEditGlobalBound = true;
    document.addEventListener('click', (e)=>{
      try{
        const t = e.target;
        if (!document.getElementById('task-edit-modal')?.classList.contains('show')) return;
        if (t && (t.id === 'edit-next-btn' || t.closest && t.closest('#edit-next-btn'))){
          e.preventDefault(); navigateNext();
        } else if (t && (t.id === 'edit-prev-btn' || (t.closest && t.closest('#edit-prev-btn')))){
          e.preventDefault(); navigatePrev();
        } else if (t && (t.id === 'edit-save-btn' || (t.closest && t.closest('#edit-save-btn')))){
          e.preventDefault(); navigateSave();
        }
      }catch(_){ }
    }, true);
  }

  // Single-pass navigation to avoid multiple increments from stacked handlers
  let __editNavBusy = false;
  function withNavLock(fn){
    if (__editNavBusy) return; __editNavBusy = true;
    try{ fn(); }finally{ setTimeout(()=>{ __editNavBusy = false; }, 120); }
  }
  // Lightweight validator per step (prevents undefined errors and blocks only when critical)
  function validateCurrentStep(showAlerts){
    try{
      if (currentEditStep === 1){
        const reqIds = ['edit-title','edit-work-type','edit-category','edit-start','edit-end'];
        const missing = reqIds.filter(id=>{
          const el = document.getElementById(id);
          const v = el && typeof el.value === 'string' ? el.value.trim() : '';
          return !v;
        });
        if (missing.length){
          if (showAlerts){ try{ alert('필수 항목을 입력해 주세요. (제목/분류/구분/시작/종료)'); }catch(_){ } }
          return false;
        }
      } else if (currentEditStep === 2){
        // Drop empty rows and ensure at least one row exists (optional)
        try{ normalizeTargets(); }catch(_){ }
      }
      // Steps 3 and 4 require no blocking validation
      return true;
    }catch(_){ return true; }
  }
  function closePickersSafe(){ try{ if (fpStart && typeof fpStart.close==='function') fpStart.close(); if (fpEnd && typeof fpEnd.close==='function') fpEnd.close(); }catch(_){ } }
  function navigateNext(){ withNavLock(()=>{ closePickersSafe(); commitEditStep(currentEditStep); currentEditStep = Math.min(4, currentEditStep+1); updateEditStepUI(); }); }
  function navigatePrev(){ withNavLock(()=>{ closePickersSafe(); commitEditStep(currentEditStep); currentEditStep = Math.max(1, currentEditStep-1); updateEditStepUI(); }); }
  function navigateSave(){ withNavLock(()=>{ closePickersSafe(); commitEditStep(currentEditStep); if (validateCurrentStep(true)) { saveTaskEdits(); closeTaskEditModal(); } }); }

  // Expose ultra-robust global helpers for inline onclick fallbacks
  try{
  window.__taskEditGoNext = function(){ navigateNext(); };
  window.__taskEditGoPrev = function(){ navigatePrev(); };
  window.__taskEditSave = function(){ navigateSave(); };
  }catch(_){ }
  // Commit inputs of the current step into state without validation or alerts
  function commitEditStep(step){
    try{
      const $ = (id)=>document.getElementById(id);
      if (step === 1){
        const getVal = (id)=>{ const el=$(id); return (el && typeof el.value==='string') ? el.value : ''; };
        state.title = getVal('edit-title').trim() || state.title;
        state.workType = getVal('edit-work-type') || state.workType;
        state.category = getVal('edit-category') || state.category;
        const name = getVal('edit-assigned').trim(); if (name) state.assigned = { name };
        const participants = getVal('edit-participants'); if (participants) state.participants = participants.split(',').map(s=>s.trim()).filter(Boolean);
        const vendors = getVal('edit-vendors'); if (vendors) state.vendors = vendors.split(',').map(s=>s.trim()).filter(Boolean);
        // Read from flatpickr if available
        try{
          if (fpStart) { const d = fpStart.selectedDates && fpStart.selectedDates[0]; if (d) state.start = fmtYMDHM(d); else { const raw = getVal('edit-start').trim(); if (raw) state.start = raw; } }
          else { const raw = getVal('edit-start').trim(); if (raw) state.start = raw; }
          if (fpEnd) { const d2 = fpEnd.selectedDates && fpEnd.selectedDates[0]; if (d2) state.end = fmtYMDHM(d2); else { const raw2 = getVal('edit-end').trim(); if (raw2) state.end = raw2; } }
          else { const raw2 = getVal('edit-end').trim(); if (raw2) state.end = raw2; }
        }catch(_){ }
      } else if (step === 2){
        const body = document.getElementById('edit-targets-body');
        if (body){
          const rows = Array.from(body.querySelectorAll('tr'));
          const prev = Array.isArray(state.targets) ? state.targets.slice() : [];
          const next = rows.map((tr)=>{
            const rid = String(tr.getAttribute('data-id')||'');
            const tds = tr.querySelectorAll('td');
            const cellVal = (idx)=>{ const td = tds[idx]; const inp = td? td.querySelector('input') : null; return (inp && typeof inp.value==='string') ? inp.value.trim() : ''; };
            const old = prev.find(t=> String(t && t.id || '') === rid) || {};
            const status = (old && typeof old.status === 'string') ? old.status : '대기';
            const id = rid || (old && old.id) || makeId();
            return { id, workName: cellVal(0), systemName: cellVal(1), status };
          }).filter(r=> r.workName || r.systemName);
          if (next) state.targets = next;
        }
  } else if (step === 3){
        const ta = document.getElementById('edit-description');
        if (ta && typeof ta.value==='string'){
          state.description = ta.value; // preserve user whitespace/newlines
        }
  } else if (step === 4){
        // state.attachments already updated via UI handlers; no-op
  }
    }catch(_){ }
  }

  function saveTaskEdits(){
    try{
      const $ = (id)=>document.getElementById(id);
      const getVal = (id)=>{ const el=$(id); return (el && typeof el.value==='string') ? el.value : ''; };
      state.title = getVal('edit-title').trim();
      state.workType = getVal('edit-work-type') || '기타';
      state.category = getVal('edit-category') || '';
      state.assigned = { name: getVal('edit-assigned').trim() };
      const participants = getVal('edit-participants').split(',').map(s=>s.trim()).filter(Boolean);
      const vendors = getVal('edit-vendors').split(',').map(s=>s.trim()).filter(Boolean);
      state.participants = participants;
      state.vendors = vendors;
      // time: prefer flatpickr values
      try{
        if (fpStart && fpStart.selectedDates && fpStart.selectedDates[0]){ state.start = fmtYMDHM(fpStart.selectedDates[0]); }
        else { const raw = getVal('edit-start').trim(); if (raw) state.start = raw; }
        if (fpEnd && fpEnd.selectedDates && fpEnd.selectedDates[0]){ state.end = fmtYMDHM(fpEnd.selectedDates[0]); }
        else { const raw2 = getVal('edit-end').trim(); if (raw2) state.end = raw2; }
      }catch(_){ }
      // targets
      const body = document.getElementById('edit-targets-body');
      const rows = Array.from(body ? body.querySelectorAll('tr') : []);
      const prev = Array.isArray(state.targets) ? state.targets.slice() : [];
      state.targets = rows.map((tr)=>{
        const rid = String(tr.getAttribute('data-id')||'');
        const tds = tr ? tr.querySelectorAll('td') : [];
        const cellVal = (idx)=>{
          const td = tds && tds[idx] ? tds[idx] : null;
          const inp = td ? td.querySelector('input') : null; // step2 has only inputs
          return (inp && typeof inp.value === 'string') ? inp.value.trim() : '';
        };
        const old = prev.find(t=> String(t && t.id || '') === rid) || {};
        const status = (old && typeof old.status === 'string') ? old.status : '대기';
        const id = rid || (old && old.id) || makeId();
        return { id, workName: cellVal(0), systemName: cellVal(1), status };
      }).filter(r=> r.workName || r.systemName);
      // description
      const descEl = $('#edit-description');
      if (descEl && typeof descEl.value==='string'){
  state.description = descEl.value; // preserve whitespace
      }
  // attachments already in state
  savePersisted();
      renderHeader();
      renderMeta();
      renderDescription();
      renderTargetsTable();
      updateResultStatus();
      try{ alert('저장되었습니다.'); }catch(_){ }
    }catch(err){
      console.error('saveTaskEdits error', err);
      try{ alert('저장 중 오류가 발생했습니다.'); }catch(_){ }
    }
  }
})();

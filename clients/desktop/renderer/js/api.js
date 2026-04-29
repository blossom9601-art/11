// REST API client — /addon/chat 와 동일한 /api/chat/rooms 엔드포인트 사용
(function () {
  const Api = {
    serverUrl: '',
    setServer(url) { this.serverUrl = (url || '').replace(/\/+$/, ''); },

    // v0.4.45: 서버 시각 (UTC) — 클라이언트 시계 오프셋 보정용
    serverTime() { return this._fetch('/api/server-time'); },

    async _fetch(path, options) {
      const opts = Object.assign({ credentials: 'include', headers: {} }, options || {});
      // CSRF 우회 + 일관된 AJAX 마킹
      if (!opts.headers['X-Requested-With']) opts.headers['X-Requested-With'] = 'XMLHttpRequest';
      if (opts.body && typeof opts.body !== 'string' && !(opts.body instanceof FormData)) {
        opts.body = JSON.stringify(opts.body);
        opts.headers['Content-Type'] = 'application/json';
      }
      const url = this.serverUrl + path;
      const res = await fetch(url, opts);
      const ctype = res.headers.get('content-type') || '';
      const data = ctype.includes('application/json') ? await res.json().catch(() => null) : await res.text();
      if (!res.ok) {
        const err = new Error((data && (data.message || data.error)) || res.statusText);
        err.status = res.status;
        err.payload = data;
        throw err;
      }
      return data;
    },

    // ── Auth ─────────────────────────────────────────────
    async login(empNo, password) {
      // 사전 세션 무효화 — 이전에 다른 계정으로 로그인된 쿠키가 남아 있으면
      // /login 이 자격증명 없이도 그대로 통과되어 보일 수 있음. 항상 강제 로그아웃 후 새 인증.
      try { await fetch(this.serverUrl + '/logout', { method: 'GET', credentials: 'include', redirect: 'manual' }); } catch (_) {}
      const body = new URLSearchParams({ employee_id: empNo, password: password }).toString();
      const url = this.serverUrl + '/login';
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        redirect: 'follow',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body,
      });
      if (!res.ok) {
        const err = new Error('HTTP ' + res.status);
        err.status = res.status;
        throw err;
      }
      const sess = await this.sessionCheck().catch(() => null);
      if (!sess || !sess.valid) {
        const err = new Error('사번 또는 비밀번호가 올바르지 않습니다.');
        err.status = 401;
        throw err;
      }
      return sess;
    },
    logout() {
      return fetch(this.serverUrl + '/logout', { credentials: 'include' }).catch(() => null);
    },
    sessionCheck() { return this._fetch('/api/auth/session-check'); },

    // ── 내 프로필 ────────────────────────────────────────
    myProfile() { return this._fetch('/api/me/profile'); },
    updateMyProfile(patch) {
      return this._fetch('/api/me/profile', { method: 'POST', body: patch });
    },

    // ── 디렉터리 (조직 사용자) — /addon/chat 와 동일 ─────
    listDirectory(opts) {
      const q = new URLSearchParams();
      if (opts && opts.q) q.set('q', opts.q);
      if (opts && opts.department) q.set('department', opts.department);
      if (opts && opts.limit) q.set('limit', String(opts.limit));
      const qs = q.toString();
      return this._fetch('/api/chat/directory' + (qs ? '?' + qs : ''));
    },
    // v0.5.10: 동료(조직) 목록 — /api/chat/directory 단일 소스. 정규화된 배열 반환.
    // 동료 화면·캘린더 참석자 선택·DM 검색 모두 같은 응답을 사용한다.
    async fetchCoworkers(opts) {
      const o = opts || {};
      const rows = await this.listDirectory({
        q: o.q || '',
        department: o.department || undefined,
        limit: o.limit || 1000,
      });
      const src = Array.isArray(rows) ? rows
        : rows && Array.isArray(rows.items) ? rows.items
        : rows && Array.isArray(rows.users) ? rows.users
        : rows && Array.isArray(rows.data) ? rows.data
        : [];
      return src
        .filter(Boolean)
        .map((u, idx) => Object.assign({}, u, {
          id: u.id || u.user_id || ('row:' + idx + ':' + (u.emp_no || u.name || u.nickname || '')),
          name: u.name || u.nickname || u.user_name || u.userName || u.employeeName || '',
          nickname: u.nickname || '',
          emp_no: u.emp_no || u.employee_id || u.employeeNo || u.employee_no || u.userId || '',
          department: u.department || u.dept_name || u.deptName || u.teamName || u.team_name || '',
          email: u.email || '',
          profile_image: u.profile_image || u.avatar || '',
        }));
    },

    // ── 방 목록 (include_members=1) ──────────────────────
    listRooms() {
      return this._fetch('/api/chat/rooms?include_members=1');
    },
    getRoom(roomId) {
      return this._fetch('/api/chat/rooms/' + roomId + '?include_members=1');
    },
    createRoom(payload) {
      return this._fetch('/api/chat/rooms', { method: 'POST', body: payload });
    },
    patchRoom(roomId, patch) {
      return this._fetch('/api/chat/rooms/' + roomId, { method: 'PATCH', body: patch });
    },
    deleteRoom(roomId, actorUserId) {
      const qs = actorUserId ? ('?updated_by_user_id=' + encodeURIComponent(actorUserId)) : '';
      return this._fetch('/api/chat/rooms/' + roomId + qs, { method: 'DELETE' });
    },
    async leaveRoom(roomId, actorUserId) {
      const qs = actorUserId ? ('?actor_user_id=' + encodeURIComponent(actorUserId)) : '';
      const candidates = [
        { path: '/api/rooms/' + roomId + '/leave' + qs, method: 'POST' },
        { path: '/api/chat/rooms/' + roomId + '/leave' + qs, method: 'POST' },
        { path: '/api/chat/rooms/' + roomId + '/leave' + qs, method: 'DELETE' },
      ];
      let lastErr = null;
      for (const c of candidates) {
        try {
          return await this._fetch(c.path, { method: c.method, body: c.method === 'POST' ? {} : undefined });
        } catch (e) {
          const status = e && e.status;
          if (status === 405 || status === 404) { lastErr = e; continue; }
          throw e;
        }
      }
      throw lastErr || new Error('대화 나가기 엔드포인트를 찾을 수 없습니다.');
    },
    async hideRoom(roomId, actorUserId) {
      const qs = actorUserId ? ('?actor_user_id=' + encodeURIComponent(actorUserId)) : '';
      const candidates = [
        { path: '/api/rooms/' + roomId + '/hide' + qs, method: 'POST' },
        { path: '/api/chat/rooms/' + roomId + '/hide' + qs, method: 'POST' },
      ];
      let lastErr = null;
      for (const c of candidates) {
        try {
          return await this._fetch(c.path, { method: c.method, body: {} });
        } catch (e) {
          const status = e && e.status;
          if (status === 405 || status === 404) { lastErr = e; continue; }
          throw e;
        }
      }
      throw lastErr || new Error('대화 숨기기 엔드포인트를 찾을 수 없습니다.');
    },
    listRoomMembers(roomId) {
      return this._fetch('/api/chat/rooms/' + roomId + '/members');
    },
    addRoomMembers(roomId, userIds) {
      return this._fetch('/api/chat/rooms/' + roomId + '/members', {
        method: 'POST',
        body: { user_ids: userIds },
      });
    },
    inviteRoomMember(roomId, userId, actorUserId) {
      return this._fetch('/api/chat/rooms/' + roomId + '/members', {
        method: 'POST',
        body: { user_id: userId, invited_by_user_id: actorUserId },
      });
    },
    removeRoomMember(roomId, memberId, actorUserId) {
      const qs = actorUserId ? ('?actor_user_id=' + actorUserId) : '';
      return this._fetch('/api/chat/rooms/' + roomId + '/members/' + memberId + qs, { method: 'DELETE' });
    },
    // v0.5.8: 채널 멤버 역할 변경 (관리자 위임 등)
    updateRoomMember(roomId, memberId, patch) {
      return this._fetch('/api/chat/rooms/' + roomId + '/members/' + memberId, { method: 'PATCH', body: patch });
    },
    markRoomRead(roomId) {
      return this._fetch('/api/chat/rooms/' + roomId + '/mark-read', { method: 'POST' });
    },

    // ── 메시지 ───────────────────────────────────────────
    listMessages(roomId, opts) {
      const o = opts || {};
      const q = new URLSearchParams();
      q.set('include_files', '1');
      q.set('order', 'asc');
      q.set('per_page', String(o.perPage || 80));
      if (o.page) q.set('page', String(o.page));
      if (o.afterId) q.set('after_id', String(o.afterId));
      if (o.beforeId) q.set('before_id', String(o.beforeId));
      // v0.4.57: viewer_user_id 명시 전달 — 서버 세션 추출 실패 시에도 빈 응답이 나오지 않도록 보장
      if (o.viewerUserId) q.set('viewer_user_id', String(o.viewerUserId));
      return this._fetch('/api/chat/rooms/' + roomId + '/messages?' + q.toString());
    },
    sendMessage(roomId, senderUserId, text, opts) {
      const o = opts || {};
      const body = {
        sender_user_id: senderUserId,
        content_type: o.contentType || 'TEXT',
        content_text: text || '',
      };
      if (o.replyToMessageId) body.reply_to_message_id = o.replyToMessageId;
      return this._fetch('/api/chat/rooms/' + roomId + '/messages', {
        method: 'POST',
        body: body,
      });
    },
    deleteMessage(messageId) {
      return this._fetch('/api/chat/messages/' + messageId, { method: 'DELETE' });
    },
    // v0.4.40: 메시지 고정 (pin)
    listPinned(roomId) {
      return this._fetch('/api/chat/rooms/' + roomId + '/pins');
    },
    pinMessage(roomId, messageId, actorUserId) {
      return this._fetch('/api/chat/rooms/' + roomId + '/messages/' + messageId + '/pin', { method: 'POST', body: actorUserId ? { actor_user_id: actorUserId } : {} });
    },
    unpinMessage(roomId, messageId, actorUserId) {
      return this._fetch('/api/chat/rooms/' + roomId + '/messages/' + messageId + '/pin', { method: 'DELETE', body: actorUserId ? { actor_user_id: actorUserId } : {} });
    },

    // v0.4.41: 채팅방 파일/아이디어/업무리스트
    listRoomFiles(roomId) {
      return this._fetch('/api/chat/rooms/' + roomId + '/files');
    },
    listRoomIdeas(roomId) {
      return this._fetch('/api/chat/rooms/' + roomId + '/ideas');
    },
    createRoomIdea(roomId, payload) {
      return this._fetch('/api/chat/rooms/' + roomId + '/ideas', { method: 'POST', body: payload });
    },
    updateRoomIdea(roomId, ideaId, payload) {
      return this._fetch('/api/chat/rooms/' + roomId + '/ideas/' + ideaId, { method: 'PUT', body: payload });
    },
    deleteRoomIdea(roomId, ideaId) {
      return this._fetch('/api/chat/rooms/' + roomId + '/ideas/' + ideaId, { method: 'DELETE' });
    },
    toggleRoomIdeaLike(roomId, ideaId) {
      return this._fetch('/api/chat/rooms/' + roomId + '/ideas/' + ideaId + '/like', { method: 'POST' });
    },
    createRoomIdeaComment(roomId, ideaId, body) {
      return this._fetch('/api/chat/rooms/' + roomId + '/ideas/' + ideaId + '/comments', { method: 'POST', body: { body } });
    },
    listRoomTasks(roomId) {
      return this._fetch('/api/chat/rooms/' + roomId + '/tasks');
    },
    createRoomTask(roomId, payload) {
      return this._fetch('/api/chat/rooms/' + roomId + '/tasks', { method: 'POST', body: payload });
    },
    updateRoomTask(roomId, taskId, payload) {
      return this._fetch('/api/chat/rooms/' + roomId + '/tasks/' + taskId, { method: 'PUT', body: payload });
    },
    deleteRoomTask(roomId, taskId) {
      return this._fetch('/api/chat/rooms/' + roomId + '/tasks/' + taskId, { method: 'DELETE' });
    },

    // ── 첨부파일 ─────────────────────────────────────────
    async uploadFile(file) {
      const fd = new FormData();
      fd.append('file', file);
      return this._fetch('/api/uploads', { method: 'POST', body: fd });
    },
    attachFileToMessage(messageId, payload) {
      return this._fetch('/api/chat/messages/' + messageId + '/files', {
        method: 'POST', body: payload,
      });
    },
    deleteMessageFile(fileId) {
      return this._fetch('/api/chat/files/' + fileId, { method: 'DELETE' });
    },
    listRetentionPolicies() {
      return this._fetch('/api/admin/retention-policies');
    },
    updateRetentionPolicy(roomType, payload) {
      return this._fetch('/api/admin/retention-policies/' + encodeURIComponent(roomType), {
        method: 'PUT', body: payload,
      });
    },
    applyRetentionPoliciesToExisting() {
      return this._fetch('/api/admin/retention-policies/apply-existing', { method: 'POST', body: {} });
    },
    runRetentionCleanup() {
      return this._fetch('/api/system/retention-cleanup', { method: 'POST', body: { limit: 100 } });
    },


    // ── 달력 (웹 Blossom 동기화) ─────────────────────
    listCalendarSchedules(opts) {
      const q = new URLSearchParams();
      if (opts && opts.start) q.set('start', opts.start);
      if (opts && opts.end) q.set('end', opts.end);
      if (opts && opts.q) q.set('q', opts.q);
      if (opts && opts.limit) q.set('limit', String(opts.limit));
      const qs = q.toString();
      return this._fetch('/api/calendar/schedules' + (qs ? '?' + qs : ''));
    },
    createCalendarSchedule(payload) {
      return this._fetch('/api/calendar/schedules', { method: 'POST', body: payload });
    },
    updateCalendarSchedule(id, payload) {
      return this._fetch('/api/calendar/schedules/' + id, { method: 'PUT', body: payload });
    },
    deleteCalendarSchedule(id) {
      return this._fetch('/api/calendar/schedules/' + id, { method: 'DELETE' });
    },

    // ── 메모 (프로필>메모 동기화) ────────────────────
    listMemoGroups() {
      return this._fetch('/api/memo/groups');
    },
    createMemoGroup(name) {
      return this._fetch('/api/memo/groups', { method: 'POST', body: { name: name } });
    },
    updateMemoGroup(id, name) {
      return this._fetch('/api/memo/groups/' + id, { method: 'PUT', body: { name: name } });
    },
    deleteMemoGroup(id) {
      return this._fetch('/api/memo/groups/' + id, { method: 'DELETE' });
    },
    reorderMemoGroups(payload) {
      return this._fetch('/api/memo/groups/reorder', { method: 'POST', body: payload });
    },
    listMemos(groupId, opts) {
      const q = new URLSearchParams();
      if (opts && opts.q) q.set('q', opts.q);
      if (opts && opts.sort) q.set('sort', opts.sort);
      q.set('page', String((opts && opts.page) || 1));
      q.set('page_size', String((opts && opts.pageSize) || 200));
      return this._fetch('/api/memo/groups/' + groupId + '/memos?' + q.toString());
    },
    createMemo(groupId, payload) {
      return this._fetch('/api/memo/groups/' + groupId + '/memos', { method: 'POST', body: payload });
    },
    updateMemo(memoId, payload) {
      return this._fetch('/api/memo/memos/' + memoId, { method: 'PUT', body: payload });
    },
    deleteMemo(memoId) {
      return this._fetch('/api/memo/memos/' + memoId, { method: 'DELETE' });
    },
    reorderMemos(groupId, payload) {
      return this._fetch('/api/memo/groups/' + groupId + '/memos/reorder', { method: 'POST', body: payload });
    },

    registerDevice() { return Promise.resolve(null); },
  };
  window.Api = Api;
})();

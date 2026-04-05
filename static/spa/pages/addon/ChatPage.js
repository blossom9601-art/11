/* ChatPage — 채팅 */
import { api } from '../../shared/api-client.js';
import { esc } from '../../shared/dom-utils.js';
import { Modal } from '../../widgets/Modal.js';

export default class ChatPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._roomId = params.roomId || null;
    this._el = null;
    this._rooms = [];
    this._messages = [];
    this._me = null;
    this._pollTimer = null;
  }

  async mount(container) {
    this._el = container;
    try {
      const res = await api.get('/api/chat/whoami', { showError: false });
      this._me = res.user || res;
    } catch { this._me = {}; }
    await this._loadRooms();
  }

  unmount() {
    if (this._pollTimer) clearInterval(this._pollTimer);
  }

  async _loadRooms() {
    try {
      const res = await api.get('/api/chat/rooms', { showError: false });
      this._rooms = res.items || res.rooms || [];
    } catch {
      this._rooms = [];
    }
    if (!this._roomId && this._rooms.length > 0) {
      this._roomId = this._rooms[0].id;
    }
    this._render();
    if (this._roomId) await this._loadMessages();
  }

  _render() {
    this._el.innerHTML = `
      <div class="spa-page spa-chat-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">채팅</h2>
          <div class="spa-page-header__actions">
            <button class="spa-btn spa-btn--primary spa-btn--sm" id="chat-new-room">+ 새 채팅방</button>
          </div>
        </div>

        <div class="spa-split-layout" style="grid-template-columns:240px 1fr;min-height:500px">
          <div class="spa-split-left spa-chat-rooms">
            ${this._rooms.map(r => `
              <div class="spa-list-item ${this._roomId == r.id ? 'active' : ''}" data-room="${r.id}">
                <div class="spa-list-item__title">${esc(r.name||r.room_name||'채팅방')}</div>
                <div class="spa-list-item__sub">${r.unread ? `<span class="spa-badge spa-badge--danger">${r.unread}</span>` : ''} ${esc(r.last_message||'')}</div>
              </div>`).join('')}
            ${this._rooms.length === 0 ? '<div class="spa-empty" style="padding:1rem">채팅방이 없습니다.</div>' : ''}
          </div>
          <div class="spa-split-right spa-chat-main" id="chat-main">
            ${this._roomId ? '<div class="spa-text-muted" style="padding:2rem;text-align:center">메시지 로딩 중...</div>' : '<div class="spa-empty">채팅방을 선택하세요.</div>'}
          </div>
        </div>
      </div>`;

    this._el.querySelector('#chat-new-room')?.addEventListener('click', () => this._createRoom());
    this._el.querySelectorAll('[data-room]').forEach(el => {
      el.addEventListener('click', () => {
        this._roomId = el.dataset.room;
        this._render();
        this._loadMessages();
      });
    });
  }

  async _loadMessages() {
    const box = this._el.querySelector('#chat-main');
    if (!box || !this._roomId) return;

    try {
      const res = await api.get(`/api/chat/rooms/${this._roomId}/messages`, { showError: false });
      this._messages = res.items || res.messages || [];
      // Mark as read
      api.post(`/api/chat/rooms/${this._roomId}/mark-read`, {}).catch(() => {});
    } catch {
      this._messages = [];
    }

    box.innerHTML = `
      <div class="spa-chat-messages" id="chat-msgs" style="flex:1;overflow-y:auto;padding:1rem;max-height:400px">
        ${this._messages.length === 0 ? '<p class="spa-text-muted">메시지가 없습니다.</p>' :
          this._messages.map(m => `
            <div class="spa-chat-msg ${m.user_id === this._me?.id ? 'spa-chat-msg--mine' : ''}">
              <div class="spa-chat-msg__header">
                <b>${esc(m.sender_name||m.user_name||'')}</b>
                <span class="spa-text-muted">${esc(m.created_at||'')}</span>
              </div>
              <div class="spa-chat-msg__body">${esc(m.content||m.text||'')}</div>
            </div>`).join('')}
      </div>
      <div class="spa-chat-input" style="display:flex;gap:.5rem;padding:.75rem 1rem;border-top:1px solid rgba(99,102,241,.1)">
        <input type="text" class="spa-input" id="chat-text" placeholder="메시지 입력..." style="flex:1">
        <button class="spa-btn spa-btn--primary" id="chat-send">전송</button>
      </div>`;

    // Scroll to bottom
    const msgs = box.querySelector('#chat-msgs');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;

    box.querySelector('#chat-send')?.addEventListener('click', () => this._sendMessage());
    box.querySelector('#chat-text')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._sendMessage(); }
    });

    // Start polling
    if (this._pollTimer) clearInterval(this._pollTimer);
    this._pollTimer = setInterval(() => this._loadMessages(), 10000);
  }

  async _sendMessage() {
    const input = this._el.querySelector('#chat-text');
    const text = input?.value?.trim();
    if (!text) return;
    input.value = '';
    try {
      await api.post(`/api/chat/rooms/${this._roomId}/messages`, { content: text });
      await this._loadMessages();
    } catch { /* handled */ }
  }

  async _createRoom() {
    const modal = new Modal({
      title: '채팅방 만들기',
      content: '<div class="spa-form-group"><label class="spa-label">채팅방 이름</label><input type="text" class="spa-input" id="modal-name" placeholder="채팅방 이름" autofocus></div>',
      size: 'sm',
      confirmText: '만들기',
      onConfirm: async () => {
        const name = modal._el.querySelector('#modal-name')?.value?.trim();
        if (!name) return;
        modal.close();
        try {
          const res = await api.post('/api/chat/rooms', { name });
          if (res.item?.id || res.id) {
            this._roomId = res.item?.id || res.id;
          }
          await this._loadRooms();
        } catch { /* handled */ }
      },
    });
    modal.open();
  }
}

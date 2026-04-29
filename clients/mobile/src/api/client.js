// REST API 클라이언트 — Cookie 세션 + AsyncStorage에서 base URL 로드
import * as SecureStore from 'expo-secure-store';

let SERVER_URL = '';
let SESSION_COOKIE = '';

export function setServerUrl(url) {
  SERVER_URL = (url || '').replace(/\/+$/, '');
}
export function getServerUrl() { return SERVER_URL; }

async function loadCookie() {
  if (SESSION_COOKIE) return SESSION_COOKIE;
  SESSION_COOKIE = (await SecureStore.getItemAsync('blossom_cookie')) || '';
  return SESSION_COOKIE;
}
async function saveCookie(value) {
  SESSION_COOKIE = value || '';
  if (SESSION_COOKIE) await SecureStore.setItemAsync('blossom_cookie', SESSION_COOKIE);
  else await SecureStore.deleteItemAsync('blossom_cookie');
}

async function request(path, options = {}) {
  const cookie = await loadCookie();
  const headers = Object.assign(
    { Accept: 'application/json' },
    cookie ? { Cookie: cookie } : {},
    options.headers || {},
  );
  let body = options.body;
  if (body && typeof body !== 'string' && !(body instanceof FormData)) {
    body = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(SERVER_URL + path, { ...options, body, headers });
  // capture session cookie
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    // extract first key=value pair
    const m = /(session=[^;]+)/i.exec(setCookie) || /([^=;\s]+=[^;]+)/.exec(setCookie);
    if (m) await saveCookie(m[1]);
  }
  const ctype = res.headers.get('content-type') || '';
  const data = ctype.includes('application/json') ? await res.json().catch(() => null) : await res.text();
  if (!res.ok) {
    const err = new Error((data && data.error) || res.statusText);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

export const Api = {
  setServerUrl,
  getServerUrl,
  login: (empNo, password) => request('/api/auth/login', { method: 'POST', body: { emp_no: empNo, password } }),
  logout: async () => {
    try { await request('/api/auth/logout', { method: 'POST' }); } catch (_) {}
    await saveCookie('');
  },
  sessionCheck: () => request('/api/auth/session-check'),
  listConversations: () => request('/api/chat/v2/conversations'),
  listMessages: (conversationId) => request('/api/chat/v2/messages?conversationId=' + conversationId),
  sendMessage: (conversationId, content) =>
    request('/api/chat/v2/messages', {
      method: 'POST',
      body: { conversationId, content, messageType: 'text' },
    }),
  markRead: (messageId) => request('/api/chat/v2/messages/' + messageId + '/read', { method: 'POST' }),
  search: (q) => request('/api/chat/v2/search?q=' + encodeURIComponent(q)),
  registerDevice: (payload) => request('/api/push/devices', { method: 'POST', body: payload }),
};

// SSE wrapper — auto reconnect, dispatches custom events
(function () {
  let es = null;
  let serverUrl = '';
  let reconnectTimer = null;
  const listeners = {};

  function on(event, cb) {
    (listeners[event] = listeners[event] || []).push(cb);
  }
  function emit(event, data) {
    (listeners[event] || []).forEach((cb) => {
      try { cb(data); } catch (_e) {}
    });
  }

  function start(url) {
    serverUrl = (url || '').replace(/\/+$/, '');
    stop();
    if (!serverUrl) return;
    try {
      es = new EventSource(serverUrl + '/api/sse/events', { withCredentials: true });
    } catch (e) {
      console.warn('[SSE] open failed', e);
      scheduleReconnect();
      return;
    }
    es.addEventListener('open', () => emit('status', 'connected'));
    es.addEventListener('error', () => {
      emit('status', 'disconnected');
      scheduleReconnect();
    });
    es.addEventListener('connected', () => emit('status', 'connected'));
    es.addEventListener('chat', (e) => {
      try { emit('chat', JSON.parse(e.data)); } catch (_) {}
    });
    es.addEventListener('invalidate', (e) => {
      try { emit('invalidate', JSON.parse(e.data)); } catch (_) {}
    });
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      start(serverUrl);
    }, 5000);
  }

  function stop() {
    if (es) { try { es.close(); } catch (_) {} es = null; }
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  }

  window.SSE = { start: start, stop: stop, on: on };
})();

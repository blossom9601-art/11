"""
SSE (Server-Sent Events) 엔드포인트 — 실시간 데이터 동기화
클라이언트의 BlossomQuery SSE 모듈과 연동하여
서버에서 데이터 변경 시 연결된 모든 클라이언트에 알림 전송
"""
import json
import queue
import threading
import time

from flask import Blueprint, Response, request, stream_with_context

sse_bp = Blueprint('sse', __name__)

# ── 연결된 클라이언트 관리 ──────────────────────────────────
_clients = []          # list of queue.Queue
_clients_lock = threading.Lock()


def _add_client(q):
    with _clients_lock:
        _clients.append(q)


def _remove_client(q):
    with _clients_lock:
        try:
            _clients.remove(q)
        except ValueError:
            pass


def broadcast(event_type, data):
    """
    모든 연결된 SSE 클라이언트에 이벤트 전송

    :param event_type: 'invalidate' | 'update'
    :param data: dict   e.g. {"entity": "hardware"} 또는 {"key": [...], "data": {...}}
    """
    message = format_sse(event_type, data)
    with _clients_lock:
        dead = []
        for q in _clients:
            try:
                q.put_nowait(message)
            except queue.Full:
                dead.append(q)
        for q in dead:
            try:
                _clients.remove(q)
            except ValueError:
                pass


def notify_entity_change(entity, action='update', detail=None):
    """
    엔터티 변경 알림 — API 라우트에서 호출

    :param entity: 'hardware', 'server', 'project', ...
    :param action: 'create' | 'update' | 'delete'
    :param detail: dict (선택) — 추가 정보 (id 등)
    """
    payload = {'entity': entity, 'action': action}
    if detail:
        payload['detail'] = detail
    broadcast('invalidate', payload)


def notify_chat_event(event: str, conversation_id, data=None):
    """채팅 실시간 이벤트 브로드캐스트 (SSE).

    이벤트 종류:
      - chat.message.created  : 새 메시지 도착
      - chat.message.updated  : 메시지 수정
      - chat.message.deleted  : 메시지 삭제
      - chat.event.card       : 이벤트 카드 메시지 (Wazuh 등)
      - chat.approval.card    : 승인 요청 카드
      - chat.approval.update  : 승인 상태 변경

    클라이언트는 EventSource로 받아서 conversationId가 자기 채널이면
    화면을 갱신한다(폴링 fallback과 공존).
    """
    payload = {
        'event': event,
        'conversationId': conversation_id,
    }
    if data:
        payload['data'] = data
    broadcast('chat', payload)


def format_sse(event, data):
    """SSE 프로토콜 형식으로 포맷"""
    lines = []
    lines.append('event: %s' % event)
    lines.append('data: %s' % json.dumps(data, ensure_ascii=False))
    lines.append('')
    lines.append('')
    return '\n'.join(lines)


# ── SSE 스트림 엔드포인트 ────────────────────────────────────

@sse_bp.route('/api/sse/events')
def sse_stream():
    """SSE 이벤트 스트림 — 클라이언트가 EventSource 로 연결"""
    q = queue.Queue(maxsize=50)
    _add_client(q)

    def generate():
        # 연결 확인 메시지
        yield format_sse('connected', {'status': 'ok', 'ts': int(time.time())})

        # heartbeat + 이벤트 전달
        try:
            while True:
                try:
                    message = q.get(timeout=25)
                    yield message
                except queue.Empty:
                    # heartbeat (30초 내 keepalive)
                    yield ': heartbeat\n\n'
        except GeneratorExit:
            pass
        finally:
            _remove_client(q)

    response = Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive'
        }
    )
    return response


# ── 수동 트리거 엔드포인트 (디버그/관리용) ──────────────────

@sse_bp.route('/api/sse/trigger', methods=['POST'])
def sse_trigger():
    """관리자가 수동으로 invalidation 이벤트 트리거"""
    data = request.get_json(silent=True) or {}
    entity = data.get('entity')
    if entity:
        notify_entity_change(entity, data.get('action', 'update'))
        return {'success': True, 'clients': len(_clients)}
    return {'success': False, 'error': 'entity required'}, 400


@sse_bp.route('/api/sse/status')
def sse_status():
    """SSE 연결 상태 조회"""
    return {'success': True, 'connected_clients': len(_clients)}

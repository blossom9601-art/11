"""Lumina 계정 Root Worker — Agent 간 IPC 프로토콜 (공통).

길이 프리픽스 프레이밍: 4바이트 빅엔디언 길이 + UTF-8 JSON 한 개 객체.
"""

import json
import struct
from typing import Any, Dict, List, Optional, Tuple

PROTO_VERSION = 1

# 허용 action (요구사항과 동일)
ACTIONS = frozenset({
    "CREATE_USER",
    "DELETE_USER",
    "LOCK_USER",
    "UNLOCK_USER",
    "CHANGE_PASSWORD",
    "EXPIRE_PASSWORD",
    "ADD_GROUP_MEMBER",
    "REMOVE_GROUP_MEMBER",
    "CHANGE_LOGIN_SHELL",
    "CHANGE_HOME_DIR",
})


def frame_encode(obj: Dict[str, Any]) -> bytes:
    raw = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return struct.pack("!I", len(raw)) + raw


def frame_decode_stream(buf: bytearray) -> Tuple[Optional[Dict[str, Any]], int]:
    """buf에서 완전한 프레임 하나를 파싱. 소비한 바이트 수 반환; 불완전하면 (None, 0)."""
    if len(buf) < 4:
        return None, 0
    (length,) = struct.unpack("!I", bytes(buf[:4]))
    if length > 16 * 1024 * 1024:
        raise ValueError("frame too large")
    if len(buf) < 4 + length:
        return None, 0
    chunk = bytes(buf[4 : 4 + length])
    del buf[: 4 + length]
    return json.loads(chunk.decode("utf-8")), 4 + length


def validate_request_envelope(msg: Dict[str, Any]) -> Optional[str]:
    """구조 검증. 오류 시 영어 짧은 코드 문자열, 통과 시 None."""
    if not isinstance(msg, dict):
        return "invalid_envelope"
    if int(msg.get("protoVersion", -1)) != PROTO_VERSION:
        return "bad_proto_version"
    action = msg.get("action")
    if action not in ACTIONS:
        return "unsupported_action"
    rid = msg.get("requestId")
    if not rid or not isinstance(rid, str):
        return "missing_request_id"
    if msg.get("payload") is not None and not isinstance(msg.get("payload"), dict):
        return "bad_payload"
    return None

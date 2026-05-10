"""Agent → Root Worker UDS 클라이언트."""

import socket
import struct
from typing import Any, Dict

from common.account_worker_protocol import frame_decode_stream, frame_encode


def call_account_worker(socket_path: str, envelope: Dict[str, Any], timeout_sec: float = 120.0) -> Dict[str, Any]:
    """단일 요청/응답 프레임. 실패 시 ok=False 및 errorCode 포함 dict."""
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.settimeout(timeout_sec)
    try:
        sock.connect(socket_path)
    except OSError as e:
        return {
            "protoVersion": envelope.get("protoVersion", 1),
            "requestId": envelope.get("requestId", ""),
            "ok": False,
            "errorCode": "socket_connect_failed",
            "exitCode": -1,
            "stderrTail": str(e),
        }
    try:
        sock.sendall(frame_encode(envelope))
        buf = bytearray()
        while True:
            chunk = sock.recv(65536)
            if not chunk:
                break
            buf.extend(chunk)
            msg, _ = frame_decode_stream(buf)
            if msg is not None:
                return msg
    except OSError as e:
        return {
            "protoVersion": envelope.get("protoVersion", 1),
            "requestId": envelope.get("requestId", ""),
            "ok": False,
            "errorCode": "socket_io_failed",
            "exitCode": -1,
            "stderrTail": str(e),
        }
    finally:
        sock.close()
    return {
        "protoVersion": envelope.get("protoVersion", 1),
        "requestId": envelope.get("requestId", ""),
        "ok": False,
        "errorCode": "empty_response",
        "exitCode": -1,
    }

from __future__ import annotations

from typing import Any, Optional

from flask import current_app
from itsdangerous import BadSignature, URLSafeSerializer


_SALT = "blossom:page-token:v1"


def _serializer() -> URLSafeSerializer:
    secret = current_app.config.get("SECRET_KEY") or current_app.secret_key
    if not secret:
        raise RuntimeError("SECRET_KEY is not configured")
    return URLSafeSerializer(secret_key=secret, salt=_SALT)


def encode_manage_no(manage_no: str) -> str:
    manage_no = (manage_no or "").strip()
    if not manage_no:
        raise ValueError("manage_no is required")
    payload: dict[str, Any] = {"v": 1, "t": "manage_no", "id": manage_no}
    return _serializer().dumps(payload)


def decode_manage_no(token: str) -> Optional[str]:
    token = (token or "").strip()
    if not token:
        return None
    try:
        payload = _serializer().loads(token)
    except BadSignature:
        return None
    except Exception:
        return None

    if not isinstance(payload, dict):
        return None
    if payload.get("t") != "manage_no":
        return None

    manage_no = str(payload.get("id") or "").strip()
    return manage_no or None

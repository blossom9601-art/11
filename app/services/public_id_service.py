from __future__ import annotations

import base64
import hashlib
import hmac
import re
from typing import Optional

from flask import current_app


_TOKEN_RE = re.compile(r'^[A-Za-z0-9_-]+$')


def _secret() -> bytes:
    value = current_app.config.get('SECRET_KEY') or current_app.config.get('PUBLIC_ID_SECRET') or 'blossom-public-id-v1'
    return str(value).encode('utf-8')


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode('ascii').rstrip('=')


def _unb64(data: str) -> bytes:
    padded = data + ('=' * (-len(data) % 4))
    return base64.urlsafe_b64decode(padded.encode('ascii'))


def make_public_id(table: str, prefix: str, record_id: object) -> str:
    try:
        rid = int(record_id)
    except (TypeError, ValueError):
        return ''
    if rid <= 0:
        return ''
    payload = f'{table}:{rid}'.encode('utf-8')
    sig = hmac.new(_secret(), payload, hashlib.sha256).digest()[:8]
    token = _b64(str(rid).encode('ascii') + b'.' + sig)
    return f'{prefix}_{token}'


def resolve_public_id(table: str, prefix: str, public_id: str) -> Optional[int]:
    value = (public_id or '').strip()
    marker = f'{prefix}_'
    if not value.startswith(marker):
        return None
    token = value[len(marker):]
    if not token or not _TOKEN_RE.match(token):
        return None
    try:
        raw = _unb64(token)
        rid_raw, sig = raw.split(b'.', 1)
        rid = int(rid_raw.decode('ascii'))
    except Exception:
        return None
    if rid <= 0:
        return None
    payload = f'{table}:{rid}'.encode('utf-8')
    expected = hmac.new(_secret(), payload, hashlib.sha256).digest()[:8]
    if not hmac.compare_digest(sig, expected):
        return None
    return rid

"""Blossom Lumina — 암호화/복호화 유틸리티 (AES-256-GCM)."""

import os
import hashlib
import hmac
import base64


def generate_key():
    """32바이트 랜덤 키 생성."""
    return os.urandom(32)


def derive_key(password, salt=None):
    """PBKDF2로 패스워드 기반 키 도출."""
    if salt is None:
        salt = os.urandom(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
    return key, salt


def hmac_sign(key, data):
    """HMAC-SHA256 서명."""
    return hmac.new(key, data, hashlib.sha256).hexdigest()


def hmac_verify(key, data, signature):
    """HMAC-SHA256 서명 검증."""
    expected = hmac.new(key, data, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def safe_b64encode(data):
    """URL-safe base64 인코딩."""
    return base64.urlsafe_b64encode(data).decode("ascii")


def safe_b64decode(s):
    """URL-safe base64 디코딩."""
    return base64.urlsafe_b64decode(s.encode("ascii"))

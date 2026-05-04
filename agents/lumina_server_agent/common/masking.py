"""Blossom Lumina — 민감정보 마스킹 유틸리티."""

import re

_PATTERNS = {
    "ip": (
        re.compile(r"\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b"),
        lambda m: "%s.%s.*.*" % (m.group(1), m.group(2)),
    ),
    "email": (
        re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"),
        lambda m: m.group(0)[:2] + "***@***",
    ),
    "mac": (
        re.compile(r"([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}"),
        lambda m: m.group(0)[:8] + ":XX:XX:XX",
    ),
}


def mask_value(text, field_type=None):
    """필드 유형에 따라 민감정보 마스킹."""
    if field_type and field_type in _PATTERNS:
        pattern, replacer = _PATTERNS[field_type]
        return pattern.sub(replacer, text)
    for _, (pattern, replacer) in _PATTERNS.items():
        text = pattern.sub(replacer, text)
    return text


def mask_dict(data, sensitive_keys=None):
    """딕셔너리 내 민감 키 값 마스킹."""
    if sensitive_keys is None:
        sensitive_keys = {"password", "secret", "token", "key", "credential"}
    result = {}
    for k, v in data.items():
        if any(s in k.lower() for s in sensitive_keys):
            result[k] = "********"
        elif isinstance(v, str):
            result[k] = mask_value(v)
        elif isinstance(v, dict):
            result[k] = mask_dict(v, sensitive_keys)
        else:
            result[k] = v
    return result

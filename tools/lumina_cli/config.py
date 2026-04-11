"""Lumina CLI — 설정 관리

설정 파일 위치:
  Linux:   ~/.config/lumina/config.json
  Windows: %APPDATA%\\lumina\\config.json
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any, Dict, Optional


def _config_dir() -> str:
    if sys.platform == "win32":
        base = os.environ.get("APPDATA", os.path.expanduser("~"))
    else:
        base = os.environ.get("XDG_CONFIG_HOME", os.path.expanduser("~/.config"))
    return os.path.join(base, "lumina")


def _config_path() -> str:
    return os.path.join(_config_dir(), "config.json")


_DEFAULT_CONFIG = {
    "server_url": "https://127.0.0.1",
    "verify_ssl": False,
    "token": "",
    "emp_no": "",
    "role": "",
    "timeout": 30,
    "max_retries": 3,
}


def load_config() -> Dict[str, Any]:
    """설정 파일 로드. 없으면 기본값 반환."""
    path = _config_path()
    if not os.path.exists(path):
        return dict(_DEFAULT_CONFIG)
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        # merge with defaults
        merged = dict(_DEFAULT_CONFIG)
        merged.update(data)
        return merged
    except (json.JSONDecodeError, IOError):
        return dict(_DEFAULT_CONFIG)


def save_config(cfg: Dict[str, Any]) -> None:
    """설정 파일 저장"""
    d = _config_dir()
    os.makedirs(d, exist_ok=True)
    path = _config_path()
    # token 파일 권한 제한 (Linux)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
    if sys.platform != "win32":
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass


def get_token() -> Optional[str]:
    cfg = load_config()
    t = cfg.get("token", "")
    return t if t else None


def get_server_url() -> str:
    cfg = load_config()
    return cfg.get("server_url", "https://127.0.0.1").rstrip("/")


def update_auth(token: str, emp_no: str, role: str) -> None:
    """로그인 후 토큰 및 사용자 정보 저장"""
    cfg = load_config()
    cfg["token"] = token
    cfg["emp_no"] = emp_no
    cfg["role"] = role
    save_config(cfg)


def clear_auth() -> None:
    """로그아웃 — 토큰 삭제"""
    cfg = load_config()
    cfg["token"] = ""
    cfg["emp_no"] = ""
    cfg["role"] = ""
    save_config(cfg)

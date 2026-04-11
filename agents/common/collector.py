"""Lumina 자산 자동 탐색 에이전트 — 수집기 베이스 클래스"""

import abc
import json
import logging
import socket
import platform
from datetime import datetime, timezone
from typing import Any, Dict, List

logger = logging.getLogger("lumina")


class BaseCollector(abc.ABC):
    """개별 수집기의 베이스 클래스"""

    name: str = ""

    @abc.abstractmethod
    def collect(self) -> List[Dict[str, Any]]:
        """수집 결과를 dict 리스트로 반환"""
        ...


def build_payload(collectors: List[BaseCollector]) -> Dict[str, Any]:
    """모든 수집기의 결과를 하나의 페이로드로 병합"""
    hostname = socket.gethostname()
    os_type = platform.system()  # "Linux" or "Windows"

    payload: Dict[str, Any] = {
        "hostname": hostname,
        "os_type": os_type,
        "os_version": platform.platform(),
        "collected_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
        "interfaces": [],
        "accounts": [],
        "packages": [],
    }

    for col in collectors:
        try:
            data = col.collect()
            if col.name in payload:
                payload[col.name] = data
            logger.info("[%s] %d items collected", col.name, len(data))
        except Exception:
            logger.exception("[%s] Error during collection", col.name)

    return payload


def save_payload(payload: Dict[str, Any], path: str) -> None:
    """페이로드를 JSON 파일로 저장"""
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    logger.info("JSON saved: %s", path)

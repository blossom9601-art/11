#!/usr/bin/env python3
"""Lumina 자산 자동 탐색 에이전트 — Linux 데몬

사용법:
    python3 agent.py              # 데몬 모드 (interval 주기로 반복)
    python3 agent.py --once       # 1회 수집 후 종료
    python3 agent.py --conf /etc/lumina/lumina.conf
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import signal
import sys
import time
import urllib.request
import urllib.error

# 에이전트 루트를 sys.path에 추가
_AGENT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _AGENT_ROOT not in sys.path:
    sys.path.insert(0, _AGENT_ROOT)

from common.config import AgentConfig
from common.collector import build_payload, save_payload
from linux.collectors.interface import InterfaceCollector
from linux.collectors.account import AccountCollector
from linux.collectors.package import PackageCollector

logger = logging.getLogger("lumina")

_running = True


def _setup_logging():
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S"
    ))
    logger.setLevel(logging.INFO)
    logger.addHandler(handler)

    # 파일 로그
    log_dir = "/var/log/lumina"
    os.makedirs(log_dir, exist_ok=True)
    fh = logging.FileHandler(os.path.join(log_dir, "lumina.log"), encoding="utf-8")
    fh.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S"
    ))
    logger.addHandler(fh)


def _signal_handler(signum, frame):
    global _running
    logger.info("종료 시그널 수신 (signal=%d), 에이전트를 중지합니다.", signum)
    _running = False


def _push_to_server(config: AgentConfig, payload: dict) -> bool:
    """수집 결과를 서버로 전송. 성공 시 True, 실패 시 False (로컬 저장 fallback)."""
    if not config.server_url:
        return False
    try:
        import ssl
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            config.server_url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        ctx = ssl.create_default_context()
        if not config.verify_ssl:
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
        with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
            logger.info("서버 전송 완료 (status=%d, url=%s)", resp.status, config.server_url)
            return True
    except (urllib.error.URLError, OSError) as e:
        logger.warning("서버 전송 실패 → 로컬 저장 (error=%s)", e)
        return False


def run_once(config: AgentConfig):
    """수집 1회 실행"""
    collectors = []
    if "interface" in config.collectors:
        collectors.append(InterfaceCollector())
    if "account" in config.collectors:
        collectors.append(AccountCollector())
    if "package" in config.collectors:
        collectors.append(PackageCollector())

    logger.info("수집 시작 (hostname=%s, collectors=%s)", config.hostname, [c.name for c in collectors])
    payload = build_payload(collectors)

    # 서버 전송 시도 → 실패 시 로컬 JSON 저장
    if not _push_to_server(config, payload):
        out_path = config.output_path()
        save_payload(payload, out_path)
        logger.info("수집 완료 → %s", out_path)
    else:
        logger.info("수집 완료 → 서버 전송 성공")


def main():
    parser = argparse.ArgumentParser(description="Lumina 자산 자동 탐색 에이전트 (Linux)")
    parser.add_argument("--once", action="store_true", help="1회 수집 후 종료")
    parser.add_argument("--conf", default=None, help="설정 파일 경로")
    args = parser.parse_args()

    _setup_logging()

    config = AgentConfig(conf_path=args.conf)

    # server_host가 미설정이면 CLI로 입력받기
    if not config.server_url:
        print("\n===== Lumina 서버 연결 설정 =====")
        print("에이전트가 데이터를 전송할 서버 정보를 입력하세요.\n")
        proto = input("  프로토콜 [https]: ").strip() or "https"
        host = input("  서버 IP: ").strip()
        port = input("  포트 [8080]: ").strip() or "8080"
        verify = input("  SSL 인증서 검증 (y/N): ").strip().lower()
        if not host:
            print("서버 IP가 입력되지 않아 종료합니다.")
            sys.exit(0)
        config.server_protocol = proto
        config.server_host = host
        try:
            config.server_port = int(port)
        except ValueError:
            config.server_port = 8080
        config.verify_ssl = verify in ("y", "yes")
        config.save()
        logger.info("서버 연결 설정 저장 완료: %s", config.server_url)

    logger.info("에이전트 시작 (interval=%ds, output=%s, server=%s)",
                config.interval, config.output_dir, config.server_url or "(없음)")

    signal.signal(signal.SIGTERM, _signal_handler)
    signal.signal(signal.SIGINT, _signal_handler)

    if args.once:
        run_once(config)
        return

    # 데몬 루프
    while _running:
        try:
            run_once(config)
        except Exception:
            logger.exception("수집 사이클 중 예기치 않은 오류")

        # interval 동안 1초 간격으로 _running 체크 (graceful shutdown)
        elapsed = 0
        while _running and elapsed < config.interval:
            time.sleep(1)
            elapsed += 1

    logger.info("에이전트 종료")


if __name__ == "__main__":
    main()

"""Lumina 자산 자동 탐색 에이전트 — Windows 서비스

사용법:
    python agent.py --once              # 1회 수집 후 종료
    python agent.py install             # Windows 서비스 설치
    python agent.py start               # 서비스 시작
    python agent.py stop                # 서비스 중지
    python agent.py remove              # 서비스 제거
"""

from __future__ import annotations

import argparse
import json
import logging
import os
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
from windows.collectors.interface import InterfaceCollector
from windows.collectors.account import AccountCollector
from windows.collectors.package import PackageCollector

logger = logging.getLogger("lumina")


def _setup_logging(config: AgentConfig):
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S"
    ))
    logger.setLevel(logging.INFO)
    logger.addHandler(handler)

    # 파일 로그
    log_dir = os.path.join(config.output_dir, "logs")
    os.makedirs(log_dir, exist_ok=True)
    fh = logging.FileHandler(os.path.join(log_dir, "lumina.log"), encoding="utf-8")
    fh.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S"
    ))
    logger.addHandler(fh)


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


# ── Windows 서비스 구현 ────────────────────────────────
try:
    import servicemanager
    import win32event
    import win32service
    import win32serviceutil

    class LuminaService(win32serviceutil.ServiceFramework):
        _svc_name_ = "Lumina"
        _svc_display_name_ = "Lumina 자산 자동 탐색 에이전트"
        _svc_description_ = "호스트의 인터페이스, 계정, 패키지 정보를 자동 수집하여 서버로 전송합니다."

        def __init__(self, args):
            win32serviceutil.ServiceFramework.__init__(self, args)
            self._stop_event = win32event.CreateEvent(None, 0, 0, None)
            self._running = True

        def SvcStop(self):
            self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
            self._running = False
            win32event.SetEvent(self._stop_event)

        def SvcDoRun(self):
            servicemanager.LogMsg(
                servicemanager.EVENTLOG_INFORMATION_TYPE,
                servicemanager.PYS_SERVICE_STARTED,
                (self._svc_name_, ""),
            )
            config = AgentConfig()
            _setup_logging(config)
            logger.info("Windows 서비스 시작")

            while self._running:
                try:
                    run_once(config)
                except Exception:
                    logger.exception("수집 사이클 중 오류")

                # interval 동안 대기 (중지 이벤트 감시)
                rc = win32event.WaitForSingleObject(
                    self._stop_event, config.interval * 1000
                )
                if rc == win32event.WAIT_OBJECT_0:
                    break

            logger.info("Windows 서비스 종료")

    _HAS_WIN32 = True
except ImportError:
    _HAS_WIN32 = False


# ── 서버 연결 설정 GUI ─────────────────────────────────
def _ask_server_url(config: AgentConfig) -> bool:
    """server_host가 미설정일 때 tkinter GUI로 서버 연결 정보를 입력받고 conf에 저장.
    성공 시 True, 취소 시 False."""
    import tkinter as tk
    from tkinter import messagebox, ttk

    saved = [False]

    def _on_submit():
        host = ent_host.get().strip()
        if not host:
            messagebox.showwarning("입력 오류", "서버 IP 또는 도메인을 입력하세요.", parent=win)
            return
        try:
            port = int(ent_port.get().strip())
            if not (1 <= port <= 65535):
                raise ValueError
        except ValueError:
            messagebox.showwarning("입력 오류", "포트 번호가 올바르지 않습니다. (1–65535)", parent=win)
            return

        config.server_host = host
        config.server_port = port
        config.server_protocol = proto_var.get()
        config.verify_ssl = ssl_var.get()
        config.save()
        saved[0] = True
        win.destroy()

    def _on_cancel():
        win.destroy()

    def _on_test():
        host = ent_host.get().strip()
        if not host:
            messagebox.showwarning("입력 오류", "서버 IP를 먼저 입력하세요.", parent=win)
            return
        try:
            port = int(ent_port.get().strip())
        except ValueError:
            messagebox.showwarning("입력 오류", "포트 번호가 올바르지 않습니다.", parent=win)
            return
        proto = proto_var.get()
        url = f"{proto}://{host}:{port}/api/agent/upload"
        import urllib.request, urllib.error, ssl
        try:
            ctx = ssl.create_default_context()
            if not ssl_var.get():
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=5, context=ctx) as resp:
                messagebox.showinfo("연결 성공", f"서버 응답: {resp.status}\n{url}", parent=win)
        except Exception as e:
            messagebox.showerror("연결 실패", f"{e}\n\n{url}", parent=win)

    win = tk.Tk()
    win.title("Lumina — 서버 연결 설정")
    win.resizable(False, False)
    win.attributes("-topmost", True)

    # 아이콘
    try:
        ico_path = os.path.join(os.path.dirname(sys.executable), "lumina.ico")
        if not os.path.isfile(ico_path):
            ico_path = os.path.join(os.path.dirname(__file__), "lumina.ico")
        if os.path.isfile(ico_path):
            win.iconbitmap(ico_path)
    except Exception:
        pass

    w, h = 460, 340
    x = (win.winfo_screenwidth() - w) // 2
    y = (win.winfo_screenheight() - h) // 2
    win.geometry(f"{w}x{h}+{x}+{y}")

    BG = "#f8f9fb"
    FG = "#1e293b"
    SUB = "#64748b"
    ACCENT = "#475569"
    FONT = ("맑은 고딕", 10)
    FONT_B = ("맑은 고딕", 12, "bold")
    FONT_S = ("맑은 고딕", 9)

    win.configure(bg=BG)

    # ── Header ──
    tk.Label(win, text="Blossom 서버 연결 설정", font=FONT_B, bg=BG, fg=FG
             ).pack(pady=(20, 2))
    tk.Label(win, text="에이전트가 데이터를 전송할 서버 정보를 입력하세요.", font=FONT_S, bg=BG, fg=SUB
             ).pack(pady=(0, 16))

    # ── Form ──
    form = tk.Frame(win, bg=BG)
    form.pack(padx=36, fill="x")

    # 프로토콜
    row0 = tk.Frame(form, bg=BG)
    row0.pack(fill="x", pady=(0, 8))
    tk.Label(row0, text="프로토콜", font=FONT, bg=BG, fg=FG, width=10, anchor="w").pack(side="left")
    proto_var = tk.StringVar(value="https")
    combo_proto = ttk.Combobox(row0, textvariable=proto_var, values=["https", "http"],
                               state="readonly", width=10, font=FONT)
    combo_proto.pack(side="left", padx=(4, 0))

    # SSL 검증
    ssl_var = tk.BooleanVar(value=False)
    chk_ssl = tk.Checkbutton(row0, text="SSL 인증서 검증", variable=ssl_var,
                              font=FONT_S, bg=BG, fg=SUB, activebackground=BG)
    chk_ssl.pack(side="right")

    # 서버 IP
    row1 = tk.Frame(form, bg=BG)
    row1.pack(fill="x", pady=(0, 8))
    tk.Label(row1, text="서버 IP", font=FONT, bg=BG, fg=FG, width=10, anchor="w").pack(side="left")
    ent_host = tk.Entry(row1, font=FONT, width=28)
    ent_host.pack(side="left", padx=(4, 0), fill="x", expand=True)
    ent_host.focus_set()

    # 포트
    row2 = tk.Frame(form, bg=BG)
    row2.pack(fill="x", pady=(0, 8))
    tk.Label(row2, text="포트", font=FONT, bg=BG, fg=FG, width=10, anchor="w").pack(side="left")
    ent_port = tk.Entry(row2, font=FONT, width=8)
    ent_port.insert(0, "8080")
    ent_port.pack(side="left", padx=(4, 0))
    tk.Label(row2, text="기본: 8080", font=FONT_S, bg=BG, fg=SUB).pack(side="left", padx=(8, 0))

    # Enter로 제출
    ent_host.bind("<Return>", lambda e: _on_submit())
    ent_port.bind("<Return>", lambda e: _on_submit())

    # ── Buttons ──
    btn_frame = tk.Frame(win, bg=BG)
    btn_frame.pack(pady=(20, 0))

    tk.Button(btn_frame, text="연결 테스트", command=_on_test,
              font=FONT, width=12, relief="groove", cursor="hand2"
              ).pack(side="left", padx=4)
    tk.Button(btn_frame, text="저장", command=_on_submit,
              font=FONT, width=12, bg=ACCENT, fg="white",
              relief="flat", cursor="hand2"
              ).pack(side="left", padx=4)
    tk.Button(btn_frame, text="취소", command=_on_cancel,
              font=FONT, width=8, relief="flat", cursor="hand2"
              ).pack(side="left", padx=4)

    win.protocol("WM_DELETE_WINDOW", _on_cancel)
    win.mainloop()

    return saved[0]


def main():
    # 서비스 명령 (install, start, stop, remove)
    if len(sys.argv) > 1 and sys.argv[1] in ("install", "start", "stop", "remove", "update", "restart"):
        if not _HAS_WIN32:
            print("오류: pywin32 패키지가 필요합니다.  pip install pywin32")
            sys.exit(1)
        win32serviceutil.HandleCommandLine(LuminaService)
        return

    # --once 또는 일반 실행
    parser = argparse.ArgumentParser(description="Lumina 자산 자동 탐색 에이전트 (Windows)")
    parser.add_argument("--once", action="store_true", help="1회 수집 후 종료")
    parser.add_argument("--conf", default=None, help="설정 파일 경로")
    args = parser.parse_args()

    config = AgentConfig(conf_path=args.conf)
    _setup_logging(config)

    # server_url이 비어있으면 GUI로 입력받기
    if not config.server_url:
        if not _ask_server_url(config):
            logger.info("서버 URL 미입력 — 에이전트 종료")
            print("서버 URL이 설정되지 않아 종료합니다.")
            sys.exit(0)
        logger.info("서버 연결 설정 완료: %s", config.server_url)

    logger.info("에이전트 시작 (interval=%ds, output=%s, server=%s)",
                config.interval, config.output_dir, config.server_url or "(없음)")

    if args.once:
        run_once(config)
        return

    # 콘솔 루프 (서비스 아닌 경우)
    try:
        while True:
            try:
                run_once(config)
            except Exception:
                logger.exception("수집 사이클 중 오류")
            time.sleep(config.interval)
    except KeyboardInterrupt:
        logger.info("Ctrl+C — 에이전트 종료")


if __name__ == "__main__":
    main()

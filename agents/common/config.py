"""Lumina 자산 자동 탐색 에이전트 — 공통 설정 모듈"""

import configparser
import os
import platform
import socket

DEFAULT_INTERVAL = 3600  # 1시간
DEFAULT_COLLECTORS = ["interface", "account", "package"]
DEFAULT_PORT = 8080
DEFAULT_PROTOCOL = "https"
API_PATH = "/api/agent/upload"


def _default_output_dir():
    if platform.system() == "Windows":
        return os.path.join(os.environ.get("ProgramData", "C:\\ProgramData"), "Lumina")
    return "/var/lib/lumina"


def _default_conf_path():
    if platform.system() == "Windows":
        return os.path.join(os.environ.get("ProgramData", "C:\\ProgramData"), "Lumina", "lumina.conf")
    return "/etc/lumina/lumina.conf"


class AgentConfig:
    """에이전트 설정 관리"""

    def __init__(self, conf_path=None):
        self.conf_path = conf_path or _default_conf_path()
        self._cp = configparser.ConfigParser()

        # 기본값
        self.interval = DEFAULT_INTERVAL
        self.output_dir = _default_output_dir()
        self.collectors = list(DEFAULT_COLLECTORS)
        self.hostname = socket.gethostname()

        # 서버 연결 (분리 필드)
        self.server_host = ""
        self.server_port = DEFAULT_PORT
        self.server_protocol = DEFAULT_PROTOCOL
        self.verify_ssl = False

        # TLS / mTLS 인증서 경로
        self.ca_cert = ""       # CA 인증서 (서버 검증용)
        self.client_cert = ""   # 클라이언트 인증서 (mTLS)
        self.client_key = ""    # 클라이언트 개인키 (mTLS)

        self._load()

    @property
    def server_url(self) -> str:
        """server_host/port/protocol로부터 전체 URL 조립"""
        if not self.server_host:
            return ""
        return f"{self.server_protocol}://{self.server_host}:{self.server_port}{API_PATH}"

    @server_url.setter
    def server_url(self, url: str):
        """하위 호환 — 전체 URL을 받아 분리 필드에 파싱"""
        if not url:
            self.server_host = ""
            return
        url = url.strip()
        if "://" in url:
            proto, rest = url.split("://", 1)
            self.server_protocol = proto
        else:
            rest = url
        # 경로 제거
        rest = rest.split("/")[0]
        if ":" in rest:
            host, port_s = rest.rsplit(":", 1)
            self.server_host = host
            try:
                self.server_port = int(port_s)
            except ValueError:
                self.server_port = DEFAULT_PORT
        else:
            self.server_host = rest

    def _load(self):
        if os.path.isfile(self.conf_path):
            self._cp.read(self.conf_path, encoding="utf-8")

            # [server] 섹션 (신규 포맷)
            if self._cp.has_section("server"):
                self.server_host = self._cp.get("server", "host", fallback="").strip()
                self.server_port = self._cp.getint("server", "port", fallback=DEFAULT_PORT)
                self.server_protocol = self._cp.get("server", "protocol", fallback=DEFAULT_PROTOCOL).strip()
                self.verify_ssl = self._cp.getboolean("server", "verify_ssl", fallback=False)
                self.ca_cert = self._cp.get("server", "ca_cert", fallback="").strip()
                self.client_cert = self._cp.get("server", "client_cert", fallback="").strip()
                self.client_key = self._cp.get("server", "client_key", fallback="").strip()

            # [agent] 섹션
            if self._cp.has_section("agent"):
                self.interval = self._cp.getint("agent", "interval", fallback=DEFAULT_INTERVAL)
                self.output_dir = self._cp.get("agent", "output_dir", fallback=self.output_dir)
                raw = self._cp.get("agent", "collectors", fallback="")
                if raw.strip():
                    self.collectors = [c.strip() for c in raw.split(",") if c.strip()]
                # 하위 호환: 기존 server_url 필드
                if not self.server_host:
                    legacy = self._cp.get("agent", "server_url", fallback="").strip()
                    if legacy:
                        self.server_url = legacy  # setter로 파싱

        os.makedirs(self.output_dir, exist_ok=True)

    def save(self):
        """현재 설정을 conf 파일에 저장"""
        cp = configparser.ConfigParser()

        cp.add_section("server")
        cp.set("server", "host", self.server_host)
        cp.set("server", "port", str(self.server_port))
        cp.set("server", "protocol", self.server_protocol)
        cp.set("server", "verify_ssl", str(self.verify_ssl).lower())
        cp.set("server", "ca_cert", self.ca_cert)
        cp.set("server", "client_cert", self.client_cert)
        cp.set("server", "client_key", self.client_key)

        cp.add_section("agent")
        cp.set("agent", "interval", str(self.interval))
        cp.set("agent", "output_dir", self.output_dir)
        cp.set("agent", "collectors", ", ".join(self.collectors))

        os.makedirs(os.path.dirname(self.conf_path), exist_ok=True)
        with open(self.conf_path, "w", encoding="utf-8") as f:
            f.write("#\n")
            f.write("# Lumina Agent Configuration\n")
            f.write("# Blossom IT Asset Management — 자산 자동 탐색 에이전트\n")
            f.write("#\n\n")
            cp.write(f)

    def output_path(self):
        """JSON 출력 파일 경로"""
        return os.path.join(self.output_dir, f"{self.hostname}.json")

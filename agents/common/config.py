"""Lumina 자산 자동 탐색 에이전트 — 공통 설정 모듈"""

import configparser
import os
import platform
import socket

DEFAULT_INTERVAL = 3600  # 1시간
DEFAULT_COLLECTORS = ["interface", "account", "package"]
DEFAULT_PORT = 443
DEFAULT_PROTOCOL = "https"
_ALLOWED_PROTOCOLS = ("https",)  # HTTP is not allowed for security
API_PATH = "/api/agent/upload"

_CONF_TEMPLATE = """\
# ============================================================================
#  Lumina Agent Configuration
#  Blossom IT Asset Management  —  v1.0.2
#
#  After editing this file, restart the service to apply changes:
#    systemctl restart lumina-agent
#
#  Or run the interactive setup wizard:
#    lumina-agent --setup
# ============================================================================


# ----------------------------------------------------------------------------
#  [server]  Connection to the Blossom management server
# ----------------------------------------------------------------------------
[server]

host = {host}
port = {port}
protocol = {protocol}
verify_ssl = {verify_ssl}
ca_cert = {ca_cert}
client_cert = {client_cert}
client_key = {client_key}
connect_timeout = {connect_timeout}
read_timeout = {read_timeout}


# ----------------------------------------------------------------------------
#  [agent]  Collection behaviour and identity
# ----------------------------------------------------------------------------
[agent]

interval = {interval}
auto_start = {auto_start}
output_dir = {output_dir}
collectors = {collectors}
agent_id = {agent_id}
site = {site}
env = {env}
retry_interval = {retry_interval}
max_retry_interval = {max_retry_interval}
max_queue_size_mb = {max_queue_size_mb}


# ----------------------------------------------------------------------------
#  [logging]  Log output settings
# ----------------------------------------------------------------------------
[logging]

level = {log_level}
file = {log_file}
max_size_mb = {log_max_size_mb}
backup_count = {log_backup_count}


# ----------------------------------------------------------------------------
#  [security]  Authentication and privilege settings
# ----------------------------------------------------------------------------
[security]

enrollment_token = {enrollment_token}
auth_token = {auth_token}
mask_sensitive = {mask_sensitive}
run_as = {run_as}


# ----------------------------------------------------------------------------
#  [network]  Proxy and DNS settings
# ----------------------------------------------------------------------------
[network]

proxy = {proxy}
no_proxy = {no_proxy}
dns_timeout = {dns_timeout}
"""


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

        # 기본값 — [server]
        self.server_host = ""
        self.server_port = DEFAULT_PORT
        self.server_protocol = DEFAULT_PROTOCOL
        self.verify_ssl = True
        self.ca_cert = ""
        self.client_cert = ""
        self.client_key = ""
        self.connect_timeout = 10
        self.read_timeout = 30

        # [agent]
        self.interval = DEFAULT_INTERVAL
        self.auto_start = True
        self.output_dir = _default_output_dir()
        self.collectors = list(DEFAULT_COLLECTORS)
        self.hostname = socket.gethostname()
        self.agent_id = "auto"
        self.site = ""
        self.env = "prod"
        self.retry_interval = 60
        self.max_retry_interval = 3600
        self.max_queue_size_mb = 100

        # [logging]
        self.log_level = "info"
        self.log_file = "/var/log/lumina/lumina.log" if platform.system() != "Windows" else os.path.join(
            os.environ.get("ProgramData", "C:\\ProgramData"), "Lumina", "lumina.log")
        self.log_max_size_mb = 50
        self.log_backup_count = 5

        # [security]
        self.enrollment_token = ""
        self.auth_token = ""
        self.mask_sensitive = True
        self.run_as = "lumina"

        # [network]
        self.proxy = ""
        self.no_proxy = ""
        self.dns_timeout = 5

        self._load()

    @property
    def server_url(self):
        # type: () -> str
        """server_host/port/protocol로부터 전체 URL 조립"""
        if not self.server_host:
            return ""
        return "%s://%s:%s%s" % (self.server_protocol, self.server_host, self.server_port, API_PATH)

    @server_url.setter
    def server_url(self, url):
        # type: (str) -> None
        """하위 호환 — 전체 URL을 받아 분리 필드에 파싱"""
        if not url:
            self.server_host = ""
            return
        url = url.strip()
        if "://" in url:
            proto, rest = url.split("://", 1)
            self.server_protocol = proto if proto in _ALLOWED_PROTOCOLS else DEFAULT_PROTOCOL
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

            # [server]
            if self._cp.has_section("server"):
                s = self._cp
                self.server_host = s.get("server", "host", fallback="").strip()
                self.server_port = s.getint("server", "port", fallback=DEFAULT_PORT)
                raw_proto = s.get("server", "protocol", fallback=DEFAULT_PROTOCOL).strip().lower()
                if raw_proto not in _ALLOWED_PROTOCOLS:
                    raw_proto = DEFAULT_PROTOCOL
                self.server_protocol = raw_proto
                self.verify_ssl = s.getboolean("server", "verify_ssl", fallback=True)
                self.ca_cert = s.get("server", "ca_cert", fallback="").strip()
                self.client_cert = s.get("server", "client_cert", fallback="").strip()
                self.client_key = s.get("server", "client_key", fallback="").strip()
                self.connect_timeout = s.getint("server", "connect_timeout", fallback=10)
                self.read_timeout = s.getint("server", "read_timeout", fallback=30)

            # [agent]
            if self._cp.has_section("agent"):
                s = self._cp
                self.interval = s.getint("agent", "interval", fallback=DEFAULT_INTERVAL)
                self.auto_start = s.getboolean("agent", "auto_start", fallback=True)
                self.output_dir = s.get("agent", "output_dir", fallback=self.output_dir)
                raw = s.get("agent", "collectors", fallback="")
                if raw.strip():
                    self.collectors = [c.strip() for c in raw.split(",") if c.strip()]
                self.agent_id = s.get("agent", "agent_id", fallback="auto").strip()
                self.site = s.get("agent", "site", fallback="").strip()
                self.env = s.get("agent", "env", fallback="prod").strip()
                self.retry_interval = s.getint("agent", "retry_interval", fallback=60)
                self.max_retry_interval = s.getint("agent", "max_retry_interval", fallback=3600)
                self.max_queue_size_mb = s.getint("agent", "max_queue_size_mb", fallback=100)
                # 하위 호환: 기존 server_url 필드
                if not self.server_host:
                    legacy = s.get("agent", "server_url", fallback="").strip()
                    if legacy:
                        self.server_url = legacy  # setter로 파싱

            # [logging]
            if self._cp.has_section("logging"):
                s = self._cp
                self.log_level = s.get("logging", "level", fallback="info").strip().lower()
                self.log_file = s.get("logging", "file", fallback=self.log_file).strip()
                self.log_max_size_mb = s.getint("logging", "max_size_mb", fallback=50)
                self.log_backup_count = s.getint("logging", "backup_count", fallback=5)

            # [security]
            if self._cp.has_section("security"):
                s = self._cp
                self.enrollment_token = s.get("security", "enrollment_token", fallback="").strip()
                self.auth_token = s.get("security", "auth_token", fallback="").strip()
                self.mask_sensitive = s.getboolean("security", "mask_sensitive", fallback=True)
                self.run_as = s.get("security", "run_as", fallback="lumina").strip()

            # [network]
            if self._cp.has_section("network"):
                s = self._cp
                self.proxy = s.get("network", "proxy", fallback="").strip()
                self.no_proxy = s.get("network", "no_proxy", fallback="").strip()
                self.dns_timeout = s.getint("network", "dns_timeout", fallback=5)

        os.makedirs(self.output_dir, exist_ok=True)

    def save(self):
        """현재 설정을 conf 파일에 저장"""
        os.makedirs(os.path.dirname(self.conf_path), exist_ok=True)
        with open(self.conf_path, "w", encoding="utf-8") as f:
            f.write(_CONF_TEMPLATE.format(
                host=self.server_host,
                port=self.server_port,
                protocol=self.server_protocol,
                verify_ssl=str(self.verify_ssl).lower(),
                ca_cert=self.ca_cert,
                client_cert=self.client_cert,
                client_key=self.client_key,
                connect_timeout=self.connect_timeout,
                read_timeout=self.read_timeout,
                interval=self.interval,
                auto_start=str(self.auto_start).lower(),
                output_dir=self.output_dir,
                collectors=", ".join(self.collectors),
                agent_id=self.agent_id,
                site=self.site,
                env=self.env,
                retry_interval=self.retry_interval,
                max_retry_interval=self.max_retry_interval,
                max_queue_size_mb=self.max_queue_size_mb,
                log_level=self.log_level,
                log_file=self.log_file,
                log_max_size_mb=self.log_max_size_mb,
                log_backup_count=self.log_backup_count,
                enrollment_token=self.enrollment_token,
                auth_token=self.auth_token,
                mask_sensitive=str(self.mask_sensitive).lower(),
                run_as=self.run_as,
                proxy=self.proxy,
                no_proxy=self.no_proxy,
                dns_timeout=self.dns_timeout,
            ))

    def output_path(self):
        """JSON 출력 파일 경로"""
        return os.path.join(self.output_dir, "%s.json" % self.hostname)

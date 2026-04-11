"""Lumina CLI — API HTTP Client

All CLI commands invoke the server REST API through this client.
"""

from __future__ import annotations

import sys
import time
import logging
from typing import Any, Dict, Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from lumina_cli.config import get_server_url, get_token, load_config

logger = logging.getLogger(__name__)


class APIError(Exception):
    """API call error"""
    def __init__(self, message: str, status_code: int = 0):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class LuminaClient:
    """Server REST API client"""

    def __init__(self, server_url: str = None, token: str = None):
        cfg = load_config()
        self.server_url = (server_url or get_server_url()).rstrip("/")
        self.token = token or get_token()
        self.verify_ssl = cfg.get("verify_ssl", False)
        self.timeout = cfg.get("timeout", 30)
        self.max_retries = cfg.get("max_retries", 3)

        self.session = requests.Session()
        # 재시도 정책
        retry = Retry(
            total=self.max_retries,
            backoff_factor=1,
            status_forcelist=[502, 503, 504],
            allowed_methods=["GET", "POST"],
        )
        adapter = HTTPAdapter(max_retries=retry)
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)

        # SSL 경고 억제
        if not self.verify_ssl:
            import urllib3
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    def _headers(self) -> Dict[str, str]:
        h = {"Content-Type": "application/json", "Accept": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    def _url(self, path: str) -> str:
        return f"{self.server_url}{path}"

    def _handle_response(self, resp: requests.Response) -> Dict[str, Any]:
        if resp.status_code == 401:
            raise APIError("Authentication required. Run 'lumina login' first.", 401)
        if resp.status_code == 403:
            data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
            raise APIError(data.get("error", "Insufficient permissions."), 403)

        try:
            data = resp.json()
        except ValueError:
            raise APIError(f"Server response parse error (HTTP {resp.status_code})", resp.status_code)

        if not data.get("success") and resp.status_code >= 400:
            raise APIError(data.get("error", f"Request failed (HTTP {resp.status_code})"), resp.status_code)

        return data

    def get(self, path: str, params: Dict = None) -> Dict[str, Any]:
        try:
            resp = self.session.get(
                self._url(path),
                headers=self._headers(),
                params=params,
                verify=self.verify_ssl,
                timeout=self.timeout,
            )
            return self._handle_response(resp)
        except requests.ConnectionError:
            raise APIError(f"Connection failed: {self.server_url}")
        except requests.Timeout:
            raise APIError(f"Request timed out ({self.timeout}s)")

    def post(self, path: str, json_data: Dict = None) -> Dict[str, Any]:
        try:
            resp = self.session.post(
                self._url(path),
                headers=self._headers(),
                json=json_data or {},
                verify=self.verify_ssl,
                timeout=self.timeout,
            )
            return self._handle_response(resp)
        except requests.ConnectionError:
            raise APIError(f"Connection failed: {self.server_url}")
        except requests.Timeout:
            raise APIError(f"Request timed out ({self.timeout}s)")

    # ── Auth ──────────────────────────────────────────────

    def login(self, emp_no: str, password: str) -> Dict[str, Any]:
        return self.post("/api/cli/login", {"emp_no": emp_no, "password": password})

    # ── 에이전트 API ──────────────────────────────────────

    def agent_list(self) -> Dict[str, Any]:
        return self.get("/api/cli/agents")

    def agent_show(self, agent_id: int) -> Dict[str, Any]:
        return self.get(f"/api/cli/agents/{agent_id}")

    def agent_status(self, agent_id: int) -> Dict[str, Any]:
        return self.get(f"/api/cli/agents/{agent_id}/status")

    def agent_health(self, agent_id: int) -> Dict[str, Any]:
        return self.get(f"/api/cli/agents/{agent_id}/health")

    def agent_inventory(self, agent_id: int) -> Dict[str, Any]:
        return self.get(f"/api/cli/agents/{agent_id}/inventory")

    def agent_search(self, hostname: str = None, ip: str = None) -> Dict[str, Any]:
        params = {}
        if hostname:
            params["hostname"] = hostname
        if ip:
            params["ip"] = ip
        return self.get("/api/cli/agents/search", params=params)

    def agent_enable(self, agent_id: int) -> Dict[str, Any]:
        return self.post(f"/api/cli/agents/{agent_id}/enable")

    def agent_disable(self, agent_id: int) -> Dict[str, Any]:
        return self.post(f"/api/cli/agents/{agent_id}/disable")

    def agent_resend(self, agent_id: int) -> Dict[str, Any]:
        return self.post(f"/api/cli/agents/{agent_id}/resend")

    def agent_collect(self, agent_id: int) -> Dict[str, Any]:
        return self.post(f"/api/cli/agents/{agent_id}/collect")

"""Outbound web access control via WinDivert (WFP-backed divert driver).

WinDivert is implemented on top of the Windows Filtering Platform. Place the
official WinDivert ``WinDivert.dll`` (same folder as LuminaGateAgent.exe,
typically ``Program Files\\LuminaGateAgent\\``); the DLL installs the bundled
kernel driver on first ``WinDivertOpen``. Without the DLL, the guard disables
itself and logs once.

Policy (from lumina-gate ``policy.json`` / local ``policy-cache.json``)::

    {
      "default_action": "ALLOW",
      "rules": [{"domain": "example.com", "action": "BLOCK"}]
    }

First matching rule wins; hostnames match subdomains. Unmatched lookups fall
back to ``default_action``.
"""

from __future__ import annotations

import ctypes
import logging
import re
import socket
import struct
import threading
import time
import uuid
from ctypes import wintypes
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set, Tuple
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

WINDIVERT_LAYER_NETWORK = 0
WINDIVERT_PARAM_QUEUE_LENGTH = 0

try:
    _INVALID_HANDLE = wintypes.HANDLE(-1).value  # type: ignore[misc]
except Exception:
    _INVALID_HANDLE = ctypes.c_void_p(-1).value  # type: ignore[assignment]


def _addr_buf() -> ctypes.Array:
    return (ctypes.c_ubyte * 128)()


class _IPHLP:
    """Owning PID for an IPv4 TCP 4-tuple via GetExtendedTcpTable."""

    AF_INET = 2
    TCP_TABLE_OWNER_PID_ALL = 5

    def __init__(self) -> None:
        dll = ctypes.WinDLL("iphlpapi.dll")
        fn = dll.GetExtendedTcpTable
        fn.argtypes = [
            ctypes.c_void_p,
            ctypes.POINTER(wintypes.DWORD),
            wintypes.BOOL,
            wintypes.ULONG,
            wintypes.ULONG,
            wintypes.ULONG,
        ]
        fn.restype = wintypes.ULONG
        self._fn = fn

    def pid_for_tuple(self, local_addr: str, local_port: int, remote_addr: str, remote_port: int, buffer: bytearray) -> int:
        buf_arr = (ctypes.c_ubyte * len(buffer)).from_buffer(buffer)
        size = wintypes.DWORD(len(buffer))
        r = self._fn(ctypes.byref(buf_arr), ctypes.byref(size), False, self.AF_INET, self.TCP_TABLE_OWNER_PID_ALL, 0)
        if r != 0:
            return 0
        raw = buffer[: size.value]
        if len(raw) < 8:
            return 0
        num_rows = struct.unpack("<I", raw[:4])[0]
        off = 4
        stride = 24
        for _ in range(min(num_rows, 8192)):
            if off + stride > len(raw):
                break
            _state, loc_addr, loc_port_dw, rem_addr, rem_port_dw, pid = struct.unpack_from("<IIIIII", raw, off)
            off += stride
            la = socket.inet_ntoa(struct.pack("<I", loc_addr))
            ra = socket.inet_ntoa(struct.pack("<I", rem_addr))
            lp = socket.ntohs(loc_port_dw & 0xFFFF)
            rp = socket.ntohs(rem_port_dw & 0xFFFF)
            if la == local_addr and lp == local_port and ra == remote_addr and rp == remote_port:
                return int(pid)
            if la == local_addr and lp == local_port and ra == remote_addr and rp == 0 and pid:
                return int(pid)
        return 0


IPHLP = _IPHLP()


def _process_exe_basename(pid: int) -> str:
    if pid <= 0:
        return ""
    try:
        k32 = ctypes.WinDLL("kernel32.dll", use_last_error=True)
        OpenProcess = k32.OpenProcess
        OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        OpenProcess.restype = wintypes.HANDLE
        CloseHandle = k32.CloseHandle
        CloseHandle.argtypes = [wintypes.HANDLE]
        CloseHandle.restype = wintypes.BOOL
        Q = k32.QueryFullProcessImageNameW
        Q.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]
        Q.restype = wintypes.BOOL
        h = OpenProcess(0x1000, False, pid)  # QUERY_LIMITED_INFORMATION
        if not h:
            return ""
        try:
            buf = ctypes.create_unicode_buffer(1024)
            sz = wintypes.DWORD(len(buf))
            if Q(h, 0, buf, ctypes.byref(sz)):
                return Path(buf.value).name
        finally:
            CloseHandle(h)
    except Exception:
        return ""
    return ""


def _normalize_host(name: str) -> str:
    n = (name or "").strip().lower().rstrip(".")
    if n.startswith("*."):
        n = n[2:]
    return n


def _domain_matches(host: str, pattern: str) -> bool:
    h = _normalize_host(host)
    p = _normalize_host(pattern)
    if not h or not p:
        return False
    return h == p or h.endswith("." + p)


def policy_decision(policy: Dict[str, Any], hostname: str) -> str:
    host = _normalize_host(hostname)
    if not host:
        return str(policy.get("default_action") or "ALLOW").upper()
    rules = policy.get("rules") or []
    if not isinstance(rules, list):
        rules = []
    for rule in rules:
        if not isinstance(rule, dict):
            continue
        dom = str(rule.get("domain") or rule.get("pattern") or "").strip()
        if not dom:
            continue
        if not _domain_matches(host, dom):
            continue
        act = str(rule.get("action") or "").strip().upper()
        if act in ("ALLOW", "BLOCK"):
            return act
    return str(policy.get("default_action") or "ALLOW").upper()


def _parse_dns_name(payload: bytes, offset: int) -> Tuple[str, int]:
    parts: List[str] = []
    i = offset
    for _ in range(128):
        if i >= len(payload):
            return "", offset
        ln = payload[i]
        if ln == 0:
            i += 1
            break
        if (ln & 0xC0) == 0xC0:
            if i + 1 >= len(payload):
                break
            ptr = ((ln & 0x3F) << 8) | payload[i + 1]
            name, _ = _parse_dns_name(payload, ptr)
            parts.append(name)
            i += 2
            break
        i += 1
        parts.append(payload[i : i + ln].decode("ascii", errors="replace"))
        i += ln
    return ".".join(p for p in parts if p), i


def dns_ingest_a_records(cache: Dict[str, str], payload: bytes) -> None:
    """Map IPv4 answer addresses to queried name (responses only)."""

    if len(payload) < 12:
        return
    flags = struct.unpack_from(">H", payload, 2)[0]
    if (flags >> 15) & 1 == 0:  # not a response
        return
    qd = struct.unpack_from(">H", payload, 4)[0]
    an = struct.unpack_from(">H", payload, 6)[0]
    if qd < 1 or qd > 16:
        return
    offset = 12
    fqdn = ""
    for _ in range(qd):
        name, offset = _parse_dns_name(payload, offset)
        fqdn = fqdn or name
        if offset + 4 > len(payload):
            return
        offset += 4
    lab = _normalize_host(fqdn)
    if not lab:
        return
    for _ in range(min(an, 48)):
        if offset >= len(payload):
            break
        _nm, offset = _parse_dns_name(payload, offset)
        if offset + 10 > len(payload):
            break
        rtype, _cls, _ttl, rdlen = struct.unpack_from(">HHIH", payload, offset)
        offset += 10
        rdata = payload[offset : offset + rdlen]
        offset += rdlen
        if rtype == 1 and rdlen >= 4:  # A
            cache[socket.inet_ntoa(rdata[:4])] = lab


def extract_tls_sni(payload: bytes) -> str:
    if len(payload) < 43 or payload[0] != 1:  # ClientHello
        return ""
    sess_len = payload[38]
    p = 39 + sess_len
    if p + 2 > len(payload):
        return ""
    ciphers = struct.unpack_from(">H", payload, p)[0]
    p += 2 + ciphers
    if p + 1 > len(payload):
        return ""
    comps = payload[p]
    p += 1 + comps
    if p + 2 > len(payload):
        return ""
    ext_total = struct.unpack_from(">H", payload, p)[0]
    p += 2
    end = min(len(payload), p + ext_total)
    while p + 4 <= end:
        eid, elen = struct.unpack_from(">HH", payload, p)
        p += 4
        ed = payload[p : p + elen]
        p += elen
        if eid == 0 and len(ed) >= 7:
            nlen = struct.unpack_from(">H", ed, 3)[1]
            if 5 + nlen <= len(ed):
                return _normalize_host(ed[5 : 5 + nlen].decode("utf-8", errors="replace"))
    return ""


_http_host_re = re.compile(rb"^[Hh][Oo][Ss][Tt]:\s*([^\s\r\n]+)", re.MULTILINE)


def extract_http_host(payload: bytes) -> str:
    m = _http_host_re.search(payload[:8192])
    if not m:
        return ""
    return _normalize_host(m.group(1).decode("latin-1", errors="replace"))


class WinDivertApi:
    def __init__(self, dll_path: Path) -> None:
        dll = ctypes.WinDLL(str(dll_path))
        self._dll = dll
        dll.WinDivertOpen.argtypes = [ctypes.c_char_p, ctypes.c_int, ctypes.c_int16, ctypes.c_uint64]
        dll.WinDivertOpen.restype = wintypes.HANDLE

        dll.WinDivertRecv.argtypes = [
            wintypes.HANDLE,
            ctypes.c_void_p,
            ctypes.c_uint,
            ctypes.POINTER(ctypes.c_uint),
            ctypes.c_void_p,
        ]
        dll.WinDivertRecv.restype = wintypes.BOOL

        dll.WinDivertSend.argtypes = [
            wintypes.HANDLE,
            ctypes.c_void_p,
            ctypes.c_uint,
            ctypes.POINTER(ctypes.c_uint),
            ctypes.c_void_p,
        ]
        dll.WinDivertSend.restype = wintypes.BOOL

        dll.WinDivertClose.argtypes = [wintypes.HANDLE]
        dll.WinDivertClose.restype = wintypes.BOOL

        dll.WinDivertSetParam.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_uint64]
        dll.WinDivertSetParam.restype = wintypes.BOOL

        dll.WinDivertHelperParsePacket.argtypes = [
            ctypes.c_void_p,
            ctypes.c_uint,
            ctypes.c_void_p,
            ctypes.c_void_p,
            ctypes.POINTER(ctypes.c_uint8),
            ctypes.c_void_p,
            ctypes.c_void_p,
            ctypes.c_void_p,
            ctypes.c_void_p,
            ctypes.POINTER(ctypes.c_void_p),
            ctypes.POINTER(ctypes.c_uint),
            ctypes.c_void_p,
            ctypes.POINTER(ctypes.c_uint),
        ]
        dll.WinDivertHelperParsePacket.restype = wintypes.BOOL

        dll.WinDivertHelperCalcChecksums.argtypes = [
            ctypes.c_void_p,
            ctypes.c_uint,
            ctypes.c_void_p,
            ctypes.c_uint64,
        ]
        dll.WinDivertHelperCalcChecksums.restype = wintypes.BOOL

    def open(self, filt: bytes) -> wintypes.HANDLE:
        h = self._dll.WinDivertOpen(filt, WINDIVERT_LAYER_NETWORK, ctypes.c_int16(0), ctypes.c_uint64(0))
        if not h or h == _INVALID_HANDLE:
            raise OSError(ctypes.get_last_error() or 0, "WinDivertOpen failed")
        try:
            v = ctypes.c_uint64(8192)
            self._dll.WinDivertSetParam(h, WINDIVERT_PARAM_QUEUE_LENGTH, v.value)
        except Exception:
            pass
        return h

    def close(self, h: Optional[wintypes.HANDLE]) -> None:
        if h and h != _INVALID_HANDLE:
            self._dll.WinDivertClose(h)

    def recvinto(self, h: wintypes.HANDLE, packet: ctypes.Array, addr: ctypes.Array) -> int:
        rn = ctypes.c_uint(len(packet))
        if not self._dll.WinDivertRecv(h, ctypes.cast(packet, ctypes.c_void_p), len(packet), ctypes.byref(rn), ctypes.cast(addr, ctypes.c_void_p)):
            return 0
        return int(rn.value)

    def send(self, h: wintypes.HANDLE, packet: ctypes.Array, length: int, addr: ctypes.Array) -> bool:
        self._dll.WinDivertHelperCalcChecksums(
            ctypes.cast(packet, ctypes.c_void_p), ctypes.c_uint(length), ctypes.cast(addr, ctypes.c_void_p), ctypes.c_uint64(0)
        )
        sn = ctypes.c_uint(0)
        return bool(self._dll.WinDivertSend(h, ctypes.cast(packet, ctypes.c_void_p), ctypes.c_uint(length), ctypes.byref(sn), ctypes.cast(addr, ctypes.c_void_p)))

    def parse(self, packet: ctypes.Array, length: int) -> Tuple[int, Optional[bytes], Optional[bytes], Optional[bytes]]:
        """Return (protocol, ipv4hdr20+, tcp hdr bytes, udp payload).

        ipv4 hdr may be longer than 20 bytes; callers use slice [:20] for tuples.
        """

        ipp = ctypes.c_void_p()
        ip6 = ctypes.c_void_p()
        proto_b = ctypes.c_uint8()
        icmp = ctypes.c_void_p()
        icmpv6 = ctypes.c_void_p()
        tcp = ctypes.c_void_p()
        udp = ctypes.c_void_p()
        pdata = ctypes.c_void_p()
        plen = ctypes.c_uint()

        ok = self._dll.WinDivertHelperParsePacket(
            ctypes.cast(packet, ctypes.c_void_p),
            length,
            ctypes.byref(ipp),
            ctypes.byref(ip6),
            ctypes.byref(proto_b),
            ctypes.byref(icmp),
            ctypes.byref(icmpv6),
            ctypes.byref(tcp),
            ctypes.byref(udp),
            ctypes.byref(pdata),
            ctypes.byref(plen),
            None,
            None,
        )
        if not ok:
            return 0, None, None, None
        pdata_len = int(plen.value) if pdata.value else 0
        body = ctypes.string_at(pdata.value, pdata_len) if pdata.value and pdata_len else b""
        if proto_b.value == 6 and tcp.value:
            ihb = ctypes.string_at(ipp.value, 60) if ipp.value else None
            thdr = ctypes.string_at(tcp.value, 160)
            return 6, ihb, thdr, body
        if proto_b.value == 17 and udp.value:
            ihb = ctypes.string_at(ipp.value, 60) if ipp.value else None
            return 17, ihb, None, body
        return int(proto_b.value), None, None, None


def _ipv4_from_ip_header(ip_blob: Optional[bytes]) -> Optional[Tuple[str, str]]:
    if not ip_blob or len(ip_blob) < 20 or (ip_blob[0] >> 4) != 4:
        return None
    ihl = (ip_blob[0] & 0xF) * 4
    if len(ip_blob) < ihl:
        return None
    src = socket.inet_ntoa(ip_blob[12:16])
    dst = socket.inet_ntoa(ip_blob[16:20])
    return src, dst


def _tcp_ports(tcp_blob: Optional[bytes]) -> Optional[Tuple[int, int]]:
    if not tcp_blob or len(tcp_blob) < 4:
        return None
    return struct.unpack(">HH", tcp_blob[:4])


class LuminaWebGuard:
    def __init__(
        self,
        *,
        program_files_dir: Path,
        gate_base_url_resolver: Callable[[], str],
        policy_supplier: Callable[[], Dict[str, Any]],
        queue_event: Callable[[str, Dict[str, Any]], None],
        shutdown: threading.Event,
        exempt_gate: bool,
        dll_path_override: Optional[Path] = None,
    ) -> None:
        self.program_files_dir = program_files_dir
        self.gate_base_url_resolver = gate_base_url_resolver
        self.policy_supplier = policy_supplier
        self.queue_event = queue_event
        self.shutdown = shutdown
        self.exempt_gate = exempt_gate
        self.dns_map: Dict[str, str] = {}
        self.map_lock = threading.Lock()
        self.gate_addrs: Set[str] = set()
        self.addr_lock = threading.Lock()
        self._tcp_scratch = bytearray(262144)
        self._logged_no_dll = False

        if dll_path_override and dll_path_override.is_file():
            self._dll_path = dll_path_override
        else:
            dll = program_files_dir / "WinDivert.dll"
            if not dll.is_file():
                alt = program_files_dir / "WinDivert64.dll"
                dll = alt if alt.is_file() else dll
            self._dll_path = dll

        self._api: Optional[WinDivertApi] = None
        self._threads: List[threading.Thread] = []

    def _refresh_gate_addrs(self) -> None:
        if not self.exempt_gate:
            return
        url = self.gate_base_url_resolver() or ""
        try:
            p = urlparse(url if url.lower().startswith(("http://", "https://")) else f"https://{url}")
            host = (p.hostname or "").strip()
            if host:
                ips = set()
                for ai in socket.getaddrinfo(host, None, socket.AF_INET, socket.SOCK_STREAM):
                    ips.add(ai[4][0])
                with self.addr_lock:
                    self.gate_addrs = ips
            else:
                with self.addr_lock:
                    self.gate_addrs = set()
        except Exception:
            pass

    def _gate_refresh_loop(self) -> None:
        while not self.shutdown.is_set():
            self._refresh_gate_addrs()
            self.shutdown.wait(60.0)

    def _emit(self, allowed: bool, host: str, dst_ip: str, dst_port: int, pid: int, proc: str, reason: str) -> None:
        pol = self.policy_supplier()
        row = {
            "event_id": str(uuid.uuid4()),
            "utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "hostname": host or "?",
            "remote_ip": dst_ip,
            "remote_port": int(dst_port),
            "pid": int(pid),
            "process_name": proc,
            "verdict": "allow" if allowed else "deny",
            "policy_decision": reason,
            "policy_version": str(pol.get("policy_version") or ""),
        }
        kind = "web_access" if allowed else "block"
        try:
            self.queue_event(kind, row)
        except Exception as exc:
            logger.warning("event queue failed: %s", exc)

    def _exempt_dest(self, dst_ip: str) -> bool:
        if dst_ip.startswith("127."):
            return True
        if dst_ip.startswith("169.254."):
            return True
        if self.exempt_gate:
            with self.addr_lock:
                if dst_ip in self.gate_addrs:
                    return True
        return False

    def _decide_and_maybe_log(
        self,
        *,
        hostname: str,
        dst_ip: str,
        dst_port: int,
        src_ip: str,
        src_port: int,
        payload: bytes,
    ) -> Tuple[str, str]:
        """Return ('ALLOW'|'BLOCK', reason_note). Unknown hostname → ALLOW (still logged once)."""

        if self._exempt_dest(dst_ip):
            return "ALLOW", "exempt"

        host_input = hostname
        if not host_input:
            buf = payload
            if dst_port == 443:
                host_input = extract_tls_sni(buf)
            if not host_input and dst_port in (80, 8080):
                host_input = extract_http_host(buf)

        pol = self.policy_supplier()
        pid = IPHLP.pid_for_tuple(src_ip, src_port, dst_ip, dst_port, self._tcp_scratch)
        proc = _process_exe_basename(pid)

        if not host_input:
            act = policy_decision(pol, "")
            self._emit(act == "ALLOW", "?", dst_ip, dst_port, pid, proc, act.lower())
            return act, act.lower()

        act = policy_decision(pol, host_input)
        self._emit(act == "ALLOW", host_input, dst_ip, dst_port, pid, proc, act.lower())
        return act, act.lower()

    def _dns_worker(self, api: WinDivertApi) -> None:
        h = api.open(b"udp and (udp.SrcPort == 53 || udp.DstPort == 53)")

        pkt = (ctypes.c_ubyte * 0xFFFF)()
        addr = _addr_buf()
        try:
            while not self.shutdown.is_set():
                n = api.recvinto(h, pkt, addr)
                if not n:
                    continue
                _proto, ipb, _, body = api.parse(pkt, n)
                if _proto != 17 or not body:
                    api.send(h, pkt, n, addr)
                    continue
                with self.map_lock:
                    dns_ingest_a_records(self.dns_map, bytes(body))
                api.send(h, pkt, n, addr)
        finally:
            api.close(h)

    def _tcp_worker(self, api: WinDivertApi) -> None:
        h = api.open(b"outbound && tcp")

        pkt = (ctypes.c_ubyte * 0xFFFF)()
        addr = _addr_buf()
        flow_buf: Dict[Tuple[str, int, str, int], bytearray] = {}
        flow_logged: Set[Tuple[str, int, str, int]] = set()

        web_ports = {80, 443, 8080, 8443}
        large_fallback = 8192

        try:
            while not self.shutdown.is_set():
                n = api.recvinto(h, pkt, addr)
                if not n:
                    continue
                proto, ipblob, tcp_blob, pdata = api.parse(pkt, n)
                if proto != 6:
                    api.send(h, pkt, n, addr)
                    continue
                ipa = _ipv4_from_ip_header(ipblob[:60] if ipblob else None)
                prts = _tcp_ports(tcp_blob)
                if not ipa or not prts:
                    api.send(h, pkt, n, addr)
                    continue
                src_ip, dst_ip = ipa
                src_port, dst_port = prts
                tup = (src_ip, src_port, dst_ip, dst_port)
                tcp_body = pdata or b""

                if tcp_body:
                    buf = flow_buf.setdefault(tup, bytearray())
                    buf.extend(tcp_body)
                    if len(buf) > 65536:
                        del buf[:-65536]

                with self.map_lock:
                    host_from_dns = self.dns_map.get(dst_ip, "") if dst_port in web_ports else ""

                verdict = "ALLOW"

                if tup not in flow_logged and dst_port in web_ports:
                    merged = bytes(flow_buf.get(tup, b""))

                    hn_eff = host_from_dns
                    if not hn_eff and dst_port == 443:
                        hn_eff = extract_tls_sni(merged if merged else tcp_body)
                    if not hn_eff and dst_port in (80, 8080, 8443):
                        hn_eff = extract_http_host(merged if merged else tcp_body)

                    finalize = bool(tcp_body) and (bool(hn_eff) or len(merged) >= large_fallback)
                    if finalize:
                        verdict, _note = self._decide_and_maybe_log(
                            hostname=hn_eff,
                            dst_ip=dst_ip,
                            dst_port=dst_port,
                            src_ip=src_ip,
                            src_port=src_port,
                            payload=merged if merged else tcp_body,
                        )
                        flow_logged.add(tup)

                if verdict == "BLOCK":
                    flow_buf.pop(tup, None)
                    continue

                api.send(h, pkt, n, addr)
        finally:
            api.close(h)

    def start(self) -> bool:
        if not self._dll_path.is_file():
            if not self._logged_no_dll:
                logger.warning(
                    "web_guard: WinDivert.dll not found beside agent (%s). "
                    "Copy WinDivert.dll from the WinDivert release package (LGPL). Filtering disabled.",
                    self._dll_path,
                )
                self._logged_no_dll = True
            return False
        try:
            self._api = WinDivertApi(self._dll_path)
        except OSError as exc:
            logger.error("web_guard: failed to load WinDivert DLL: %s", exc)
            return False

        self._refresh_gate_addrs()
        t_gate = threading.Thread(target=self._gate_refresh_loop, name="lumina-web-gate-ip", daemon=True)
        self._threads.append(t_gate)

        wd = self._api
        t_dns = threading.Thread(target=self._dns_worker, args=(wd,), name="lumina-web-dns", daemon=True)
        t_tcp = threading.Thread(target=self._tcp_worker, args=(wd,), name="lumina-web-tcp", daemon=True)
        self._threads.extend([t_dns, t_tcp])
        try:
            t_gate.start()
            t_dns.start()
            t_tcp.start()
        except Exception as exc:
            logger.exception("web_guard: thread start failed: %s", exc)
            self.shutdown.set()
            return False
        logger.info("web_guard: WinDivert threads started (%s)", self._dll_path)
        return True

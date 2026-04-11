"""Lumina CLI — Output Formatter

Supports table, JSON, and detail output formats.
"""

from __future__ import annotations

import json
import re
import sys
from typing import Any, Dict, List, Optional, Sequence


# ── Status Colors (ANSI) ────────────────────────────────

_COLORS = {
    "online":   "\033[92m",   # green
    "stale":    "\033[93m",   # yellow
    "offline":  "\033[91m",   # red
    "error":    "\033[91m",   # red
    "disabled": "\033[90m",   # grey
}
_RESET = "\033[0m"
_BOLD = "\033[1m"
_DIM = "\033[2m"

_ANSI_RE = re.compile(r'\033\[[0-9;]*m')


def _use_color() -> bool:
    return hasattr(sys.stdout, "isatty") and sys.stdout.isatty()


def _colorize(text: str, status: str = "") -> str:
    if not _use_color():
        return text
    color = _COLORS.get(status, "")
    if not color:
        return text
    return f"{color}{text}{_RESET}"


def _bold(text: str) -> str:
    if not _use_color():
        return text
    return f"{_BOLD}{text}{_RESET}"


def _vlen(s: str) -> int:
    """Visible length, stripping ANSI codes."""
    return len(_ANSI_RE.sub('', s))


def _pad(s: str, width: int) -> str:
    """Left-align string to width, accounting for ANSI codes."""
    gap = width - _vlen(s)
    return s + " " * max(gap, 0)


# ── Table Output ─────────────────────────────────────────

def print_table(
    rows: List[Dict[str, Any]],
    columns: List[Dict[str, str]],
    title: str = None,
) -> None:
    """Print a well-aligned ASCII table.

    columns: [{"key": "id", "label": "ID", "width": 6}, ...]
    """
    if not rows:
        print("No results found.")
        return

    # Auto-calculate column widths
    for col in columns:
        header_len = len(col["label"])
        data_max = 0
        for row in rows:
            val = str(row.get(col["key"], "") or "")
            data_max = max(data_max, len(val))
        col["_w"] = max(col.get("width", 0), header_len, data_max)

    # Build separator line
    sep = "+" + "+".join("-" * (c["_w"] + 2) for c in columns) + "+"

    if title:
        print(f"\n  {_bold(title)}")

    # Header
    print(sep)
    hdr = "|"
    for col in columns:
        cell = " " + col["label"].center(col["_w"]) + " "
        hdr += _bold(cell) + "|"
    print(hdr)
    print(sep)

    # Data rows
    for row in rows:
        line = "|"
        for col in columns:
            raw = str(row.get(col["key"], "") or "")
            w = col["_w"]
            if len(raw) > w:
                raw = raw[: w - 1] + "…"
            if col["key"] == "status":
                cell = " " + _pad(_colorize(raw, raw.strip()), w) + " "
            else:
                cell = " " + raw.ljust(w) + " "
            line += cell + "|"
        print(line)

    print(sep)
    print(f"  Total: {len(rows)}")


# ── JSON Output ──────────────────────────────────────────

def print_json(data: Any) -> None:
    print(json.dumps(data, indent=2, ensure_ascii=False, default=str))


# ── Detail Output ────────────────────────────────────────

def print_detail(data: Dict[str, Any], title: str = None) -> None:
    if title:
        print(f"\n  {_bold(title)}")
        print("  " + "=" * 50)

    max_key_len = max(len(str(k)) for k in data.keys()) if data else 10

    for key, value in data.items():
        label = str(key).ljust(max_key_len)
        val = str(value) if value is not None else "-"
        if key.lower() == "status":
            val = _colorize(val, val)
        print(f"    {_bold(label)}  {val}")

    print()


# ── Section Output (Inventory) ───────────────────────────

_SECTION_TITLES = {
    "business": "Business",
    "system": "System",
    "owner": "Owner",
    "inspection": "Inspection",
    "meta": "Asset Meta",
}


def print_inventory(inventory: Dict[str, Any]) -> None:
    if not inventory:
        print("No inventory data available.")
        return

    for section_key, section_data in inventory.items():
        if not isinstance(section_data, dict):
            continue
        section_title = _SECTION_TITLES.get(section_key, section_key)
        print(f"\n  {_bold(f'[ {section_title} ]')}")
        print(f"  {'─' * 46}")

        max_key = max(len(str(k)) for k in section_data.keys()) if section_data else 10
        for key, val in section_data.items():
            label = str(key).ljust(max_key)
            value = str(val) if val not in (None, "") else "-"
            print(f"    {label}  {value}")


# ── Message Output ───────────────────────────────────────

def print_error(message: str) -> None:
    if _use_color():
        print(f"\033[91mError: {message}{_RESET}", file=sys.stderr)
    else:
        print(f"Error: {message}", file=sys.stderr)


def print_success(message: str) -> None:
    if _use_color():
        print(f"\033[92m{message}{_RESET}")
    else:
        print(message)


def print_warning(message: str) -> None:
    if _use_color():
        print(f"\033[93m{message}{_RESET}")
    else:
        print(message)

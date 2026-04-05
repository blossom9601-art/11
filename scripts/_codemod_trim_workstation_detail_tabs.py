"""Trim legacy inline tab behaviors from workstation detail script.

- Keeps: sidebar preload, header context propagation, Basic Info edit modal.
- Removes: legacy tab01~tab15 inline implementations (now provided by /static/js/_detail/tabXX-*.js).

Idempotent: safe to run multiple times.
"""

from __future__ import annotations

from pathlib import Path


TARGET = Path(__file__).resolve().parents[1] / "static/js/2.hardware/2-1.server/2-1-4.workstation/2.workstation_detail.js"

MARKER = "// ---------- Change Log table interactions (tab14-log) ----------"
HELPER_MARK = "// __WORKSTATION_DETAIL_HELPERS__"


def main() -> None:
    text = TARGET.read_text(encoding="utf-8")

    if MARKER not in text:
        raise SystemExit(f"Marker not found in {TARGET}: {MARKER}")

    head = text.split(MARKER, 1)[0]

    # Normalize escaping helper name: this repo uses escapeHtml() in many places.
    head = head.replace("escapeHTML(", "escapeHtml(")

    if HELPER_MARK not in head:
        needle = "document.addEventListener('DOMContentLoaded', function(){"
        idx = head.find(needle)
        if idx < 0:
            raise SystemExit("Could not find DOMContentLoaded hook to inject helpers")

        insert_at = idx + len(needle)

        helpers = (
            "\n"
            "    " + HELPER_MARK + "\n"
            "    function escapeAttr(v){\n"
            "      return String(v == null ? '' : v)\n"
            "        .replace(/&/g,'&amp;')\n"
            "        .replace(/</g,'&lt;')\n"
            "        .replace(/>/g,'&gt;')\n"
            "        .replace(/\"/g,'&quot;')\n"
            "        .replace(/'/g,'&#39;');\n"
            "    }\n"
            "    function escapeHtml(v){\n"
            "      return String(v == null ? '' : v)\n"
            "        .replace(/&/g,'&amp;')\n"
            "        .replace(/</g,'&lt;')\n"
            "        .replace(/>/g,'&gt;')\n"
            "        .replace(/\"/g,'&quot;')\n"
            "        .replace(/'/g,'&#39;');\n"
            "    }\n"
            "    function toast(msg, level){\n"
            "      try{\n"
            "        if(typeof window !== 'undefined' && typeof window.showToast === 'function'){\n"
            "          window.showToast(String(msg || ''), level || 'info');\n"
            "          return;\n"
            "        }\n"
            "      }catch(_){ }\n"
            "      try{ alert(String(msg || '')); }catch(_){ }\n"
            "    }\n"
        )

        head = head[:insert_at] + helpers + head[insert_at:]

    # Ensure we end cleanly after Basic Info modal wiring.
    # The preserved head currently ends right after the modal wiring block.
    tail = (
        "\n\n"
        "    // Tab behaviors moved to /static/js/_detail/tabXX-*.js\n"
        "    // (legacy inline implementations removed from this file).\n"
        "  });\n\n"
        "})();\n"
    )

    new_text = head.rstrip() + tail
    TARGET.write_text(new_text, encoding="utf-8")


if __name__ == "__main__":
    main()

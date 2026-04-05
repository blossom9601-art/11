"""Audit: tab11-task template wiring readiness.

Checks that every app/templates/**/tab11-task.html contains the DOM ids
and scripts required for the global tab11-task persistence initializer
(static/js/blossom.js).

Run:
  C:/Users/ME/Desktop/blossom/.venv/Scripts/python.exe scripts/diag_tab11_task_templates.py

Outputs a short summary to stdout and writes a full report to:
  tmp_tab11_task_audit.txt
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
TEMPLATES_ROOT = REPO_ROOT / "app" / "templates"
OUTFILE = REPO_ROOT / "tmp_tab11_task_audit.txt"


REQUIRED_SNIPPETS = {
    "table": 'id="tk-spec-table"',
    "blossom_js": "/static/js/blossom.js",
    "add_btn": 'id="tk-row-add"',
    "download_btn": 'id="tk-download-btn"',
    "page_size": 'id="tk-page-size"',
    "empty": 'id="tk-empty"',
    "pagination": 'id="tk-pagination"',
    "download_modal": 'id="tk-download-modal"',
    "download_confirm": 'id="tk-download-confirm"',
    "download_close": 'id="tk-download-close"',
}


@dataclass(frozen=True)
class AuditResult:
    path: str
    missing: tuple[str, ...]


def main() -> int:
    files = sorted(TEMPLATES_ROOT.glob("**/tab11-task.html"))
    results: list[AuditResult] = []

    for file_path in files:
        text = file_path.read_text(encoding="utf-8", errors="replace")
        missing = [name for name, snippet in REQUIRED_SNIPPETS.items() if snippet not in text]
        if missing:
            results.append(AuditResult(path=file_path.relative_to(REPO_ROOT).as_posix(), missing=tuple(missing)))

    ok_count = len(files) - len(results)

    lines: list[str] = []
    lines.append(f"tab11-task templates: {len(files)}")
    lines.append(f"OK: {ok_count}")
    lines.append(f"MISSING_ANY: {len(results)}")

    # Breakdown
    by_key: dict[str, int] = {k: 0 for k in REQUIRED_SNIPPETS}
    for r in results:
        for k in r.missing:
            by_key[k] = by_key.get(k, 0) + 1

    lines.append("\nMissing breakdown:")
    for k in REQUIRED_SNIPPETS:
        lines.append(f"- {k}: {by_key.get(k, 0)}")

    if results:
        lines.append("\nFirst 30 missing files:")
        for r in results[:30]:
            lines.append(f"- {r.path} :: missing={','.join(r.missing)}")
        if len(results) > 30:
            lines.append("- ... (truncated)")

    OUTFILE.write_text("\n".join(lines) + "\n", encoding="utf-8")

    # Stdout: short summary + where to look.
    print("\n".join(lines[: 3 + 1 + len(REQUIRED_SNIPPETS)]))
    print(f"\nFull report: {OUTFILE.as_posix()}")

    # Exit code is non-zero if anything is missing.
    return 0 if not results else 2


if __name__ == "__main__":
    raise SystemExit(main())

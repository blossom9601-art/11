"""Smoke-check for Project Detail empty-state DOM invariants.

This script is intentionally lightweight (stdlib-only): it validates that
project detail templates (tab71~tab80) contain the expected sticker empty blocks
and that the JS bundle references those IDs.

Run:
  .venv/Scripts/python.exe scripts/_smoke_check_project_empty_states.py
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[1]
TEMPLATES_DIR = ROOT / "app" / "templates" / "8.project" / "8-1.project" / "8-1-3.project_list"
JS_BUNDLE = (
    ROOT
    / "static"
    / "js"
    / "8.project"
    / "8-1.project"
    / "8-1-3.project_list"
    / "2.project_detail.js"
)


@dataclass(frozen=True)
class EmptySpec:
    template: str
    empty_id: str
    pagination_id: str | None = None


SPECS: list[EmptySpec] = [
    EmptySpec("tab71-integrity.html", "rq-empty", "rq-pagination"),
    EmptySpec("tab72-scope.html", "wbs-empty", "wbs-pagination"),
    # Gantt view is a chart and doesn't use the standard table pagination.
    EmptySpec("tab73-schedule.html", "gantt-empty", None),
    EmptySpec("tab74-cost.html", "eva-empty", "eva-pagination"),
    # modal empty blocks
    EmptySpec("tab74-cost.html", "eva-stats-empty", None),
    EmptySpec("tab75-quality.html", "quality-empty", "quality-pagination"),
    EmptySpec("tab76-resource.html", "raci-empty", "raci-pagination"),
    EmptySpec("tab76-resource.html", "raci-stats-empty", None),
    # tab76 may also include eva-stats-empty modal depending on template reuse
    EmptySpec("tab76-resource.html", "eva-stats-empty", None),
    EmptySpec("tab77-communication.html", "cm-empty", "cm-pagination"),
    EmptySpec("tab78-risk.html", "fmea-empty", "fmea-pagination"),
    EmptySpec("tab79-procurement.html", "tco-empty", "tco-pagination"),
    EmptySpec("tab80-stakeholder.html", "stakeholder-empty", "stakeholder-pagination"),
]


STICKER_SVG = "free-sticker-solution.svg"
# NOTE: Use a real word-boundary (\b), not a literal backslash.
RE_EMPTY_TAG = re.compile(r"<[^>]*\bid=['\"](?P<id>[^'\"]+)['\"][^>]*>", re.IGNORECASE)


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8-sig")


def find_opening_tag(html: str, element_id: str) -> str | None:
    # Find the first opening tag that contains id="element_id".
    # Keep it simple: use a regex that captures the whole opening tag.
    pattern = re.compile(
        rf"<[^>]*\bid=['\"]{re.escape(element_id)}['\"][^>]*>",
        re.IGNORECASE,
    )
    m = pattern.search(html)
    return m.group(0) if m else None


def assert_true(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def main() -> int:
    errors: list[str] = []

    assert_true(TEMPLATES_DIR.exists(), f"Templates dir not found: {TEMPLATES_DIR}", errors)
    assert_true(JS_BUNDLE.exists(), f"JS bundle not found: {JS_BUNDLE}", errors)
    if errors:
        print("[FAIL] Preflight:")
        for e in errors:
            print(" -", e)
        return 2

    js = read_text(JS_BUNDLE)

    seen_templates: set[str] = set()
    for spec in SPECS:
        tpl_path = TEMPLATES_DIR / spec.template
        seen_templates.add(spec.template)
        if not tpl_path.exists():
            errors.append(f"Missing template: {tpl_path}")
            continue

        html = read_text(tpl_path)
        tag = find_opening_tag(html, spec.empty_id)
        if not tag:
            errors.append(f"{spec.template}: missing empty block id='{spec.empty_id}'")
            continue

        tag_l = tag.lower()
        assert_true("class=" in tag_l, f"{spec.template}: #{spec.empty_id} missing class attribute", errors)
        assert_true(
            "system-empty" in tag_l,
            f"{spec.template}: #{spec.empty_id} missing 'system-empty' class",
            errors,
        )
        assert_true(
            "system-empty--sticker" in tag_l,
            f"{spec.template}: #{spec.empty_id} missing 'system-empty--sticker' class",
            errors,
        )
        assert_true(
            (" hidden" in tag_l) or tag_l.startswith("<div hidden") or ("hidden=" in tag_l),
            f"{spec.template}: #{spec.empty_id} should start hidden (missing 'hidden' attribute)",
            errors,
        )
        assert_true(
            STICKER_SVG in html,
            f"{spec.template}: expected sticker svg '{STICKER_SVG}' not found",
            errors,
        )

        # Pagination presence in template (if expected)
        if spec.pagination_id:
            assert_true(
                (f"id=\"{spec.pagination_id}\"" in html) or (f"id='{spec.pagination_id}'" in html),
                f"{spec.template}: missing pagination id='{spec.pagination_id}'",
                errors,
            )

        # Ensure JS references the IDs (guard against mismatches)
        assert_true(
            spec.empty_id in js,
            f"JS bundle: missing reference to empty id '{spec.empty_id}'",
            errors,
        )
        if spec.pagination_id:
            assert_true(
                spec.pagination_id in js,
                f"JS bundle: missing reference to pagination id '{spec.pagination_id}'",
                errors,
            )

    # Extra sanity: ensure each template has at least one sticker empty block
    for tpl in sorted(seen_templates):
        tpl_path = TEMPLATES_DIR / tpl
        if not tpl_path.exists():
            continue
        html = read_text(tpl_path)
        assert_true(
            "system-empty--sticker" in html,
            f"{tpl}: no 'system-empty--sticker' blocks found",
            errors,
        )

    if errors:
        print("[FAIL] Empty-state smoke check")
        for e in errors:
            print(" -", e)
        return 1

    print("[OK] Empty-state smoke check passed")
    print(f" - templates checked: {len(seen_templates)}")
    print(f" - specs checked: {len(SPECS)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

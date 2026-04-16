import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATES = ROOT / "app" / "templates" / "9.category"
BLOSSOM_VERSION = "20260415_cat_dup_remove2"

# Remove the duplicate header button block.
DUP_BUTTON_RE = re.compile(
    r"\n[ \t]*<button class=\"header-btn\" id=\"system-duplicate-btn\"[\s\S]*?</button>",
    re.MULTILINE,
)

# Remove the full duplicate modal block.
DUP_MODAL_RE = re.compile(
    r"\n[ \t]*<!--\s*행 복제 확인 모달\s*-->[\s\S]*?</div>\s*</div>\s*</div>\s*</div>\s*",
    re.MULTILINE,
)

# Normalize blossom.js query for category templates.
BLOSSOM_SRC_RE = re.compile(r'(/static/js/blossom\.js)(?:\?v=[^"\']+)?')

changed_files = []

for html in sorted(TEMPLATES.rglob("*.html")):
    text = html.read_text(encoding="utf-8")
    original = text

    text = DUP_BUTTON_RE.sub("", text)
    text = DUP_MODAL_RE.sub("\n\n", text)
    text = BLOSSOM_SRC_RE.sub(rf"\1?v={BLOSSOM_VERSION}", text)

    # Keep spacing stable after block removals.
    text = re.sub(r"\n{4,}", "\n\n\n", text)

    if text != original:
        html.write_text(text, encoding="utf-8", newline="\n")
        changed_files.append(str(html.relative_to(ROOT)).replace("\\", "/"))

print(f"CHANGED {len(changed_files)}")
for path in changed_files:
    print(path)

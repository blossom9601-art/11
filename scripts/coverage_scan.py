import os
import sys

ROOT = os.path.join(os.path.dirname(__file__), '..', 'app', 'templates')
ROOT = os.path.abspath(ROOT)

INC_MARKERS = ["layouts/_header.html", "layouts/_sidebar.html"]
STATIC_MARKERS = ['class="main-header"', '<nav class="sidebar"']

num = 0
den = 0
files_with_include = []
files_with_static = []

for dirpath, _, filenames in os.walk(ROOT):
    for fn in filenames:
        if not fn.endswith('.html'):
            continue
        # Skip partials that start with underscore (e.g., _header.html)
        if fn.startswith('_'):
            continue
        fpath = os.path.join(dirpath, fn)
        # Normalize relpath for reporting
        rel = os.path.relpath(fpath, ROOT)
        try:
            with open(fpath, 'r', encoding='utf-8') as f:
                content = f.read()
        except UnicodeDecodeError:
            try:
                with open(fpath, 'r', encoding='cp949') as f:
                    content = f.read()
            except Exception:
                continue
        has_include = any(marker in content for marker in INC_MARKERS)
        has_static = any(marker in content for marker in STATIC_MARKERS)
        if has_include or has_static:
            den += 1
            if has_include:
                num += 1
                files_with_include.append(rel)
            elif has_static:
                files_with_static.append(rel)

percent = (num / den * 100.0) if den else 0.0

print(f"Coverage: {num}/{den} = {percent:.2f}%")
print("\nSample remaining (still static):")
for s in files_with_static[:20]:
    print(" -", s)

# Exit with 0 always; this is informational
sys.exit(0)

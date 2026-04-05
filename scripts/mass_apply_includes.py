import os
import re
from pathlib import Path

# Directories to process (security subdomains still pending)
SUBDIRS = [
    # Security (already processed once; safe to re-run for idempotency)
    'app/templates/3.software/3-5.security/3-5-1.vaccine',
    'app/templates/3.software/3-5.security/3-5-2.vulnerability',
    'app/templates/3.software/3-5.security/3-5-3.server_access_control',
    'app/templates/3.software/3-5.security/3-5-4.server_integrity_account',
    'app/templates/3.software/3-5.security/3-5-6.server_security_control',
    'app/templates/3.software/3-5.security/3-5-7.db_access_control',
    # Virtualization
    'app/templates/3.software/3-4.virtualization',
    # Middleware
    'app/templates/3.software/3-3.middleware',
    # Network (hardware layer)
    'app/templates/2.hardware/2-4.network',
    # Storage
    'app/templates/2.hardware/2-2.storage',
    # SAN
    'app/templates/2.hardware/2-3.san',
    # Category (large taxonomy)
    'app/templates/9.category',
    # Governance (dedicated line policy + others under governance)
    'app/templates/4.governance',
    # Maintenance
    'app/templates/7.maintenance',
]

WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
HEADER_INCLUDE = "{% include 'layouts/_header.html' %}"
SIDEBAR_INCLUDE = "{% include 'layouts/_sidebar.html' %}"

HEADER_START_RE = re.compile(r'<header class="main-header"[^>]*>', re.IGNORECASE)
SIDEBAR_START_RE = re.compile(r'<nav class="sidebar" id="sidebar"[^>]*>', re.IGNORECASE)

# We will remove until corresponding closing tag
# Simple stackless approach assuming well-formed tags and no nested <header>/<nav> of same type

def remove_block(content: str, start_re: re.Pattern, end_tag: str) -> str:
    match = start_re.search(content)
    if not match:
        return content
    start_idx = match.start()
    # Find closing tag position after the start
    end_idx = content.find(end_tag, match.end())
    if end_idx == -1:
        # malformed; skip removal
        return content
    end_idx += len(end_tag)
    return content[:start_idx] + content[end_idx:]

BODY_RE = re.compile(r'<body[^>]*>', re.IGNORECASE)

def process_html(path: Path) -> bool:
    original = path.read_text(encoding='utf-8')
    content = original

    # Skip if already has both includes (avoid duplicates)
    if HEADER_INCLUDE in content and SIDEBAR_INCLUDE in content:
        return False

    # Must have body tag
    body_match = BODY_RE.search(content)
    if not body_match:
        return False

    # Remove inline header/sidebar blocks if present
    content = remove_block(content, HEADER_START_RE, '</header>')
    content = remove_block(content, SIDEBAR_START_RE, '</nav>')

    # Insert includes immediately after <body...>
    insertion_point = body_match.end()
    includes_block = f"\n        {HEADER_INCLUDE}\n        {SIDEBAR_INCLUDE}"  # preserve indentation style similar to earlier edits
    content = content[:insertion_point] + includes_block + content[insertion_point:]

    if content != original:
        path.write_text(content, encoding='utf-8')
        return True
    return False

def main():
    changed_files = []
    for rel in SUBDIRS:
        target_dir = WORKSPACE_ROOT / rel.replace('/', os.sep)
        if not target_dir.exists():
            continue
        for html_file in target_dir.rglob('*.html'):
            # Skip layout or shared partials just in case (defensive)
            if html_file.name.startswith('_'):
                continue
            if html_file.name in {'_header.html', '_sidebar.html'}:
                continue
            changed = process_html(html_file)
            if changed:
                changed_files.append(str(html_file.relative_to(WORKSPACE_ROOT)))
    print(f"Modified {len(changed_files)} files.")
    for f in changed_files:
        print(f" - {f}")

if __name__ == '__main__':
    main()

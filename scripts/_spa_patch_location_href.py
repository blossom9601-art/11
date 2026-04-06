"""Replace window.location.href = '/p/...' with blsSpaNavigate('/p/...')
in all JS files under static/js/ (excluding blossom.js itself).
Safe UTF-8 read/write. No binary files touched."""
import os, re

ROOT = os.path.join(os.path.dirname(__file__), '..', 'static', 'js')
SKIP = {'blossom.js'}  # blossom.js fallbacks should stay as-is

# Pattern 1: window.location.href = '/p/...';
#   → blsSpaNavigate('/p/...');
PAT_SINGLE = re.compile(
    r"window\.location\.href\s*=\s*('/p/[^']*')\s*;",
)
# Pattern 2: window.location.href = "/p/...";
PAT_DOUBLE = re.compile(
    r'window\.location\.href\s*=\s*("/p/[^"]*")\s*;',
)
# Pattern 3: window.location.href = `/p/...`;   (template literal)
PAT_TMPL = re.compile(
    r'window\.location\.href\s*=\s*(`/p/[^`]*`)\s*;',
)
# Pattern 4: window.location.href = href;  (variable — only in specific files)
PAT_VAR_HREF = re.compile(
    r'window\.location\.href\s*=\s*(href(?:\s*\+\s*[^;]+)?)\s*;',
)

# Files where `window.location.href = href` should be converted
# (these construct href as /p/* URLs)
VAR_HREF_FILES = {
    '1.maintenance_list.js',
    '1.manufacturer_list.js',
    '1.client1_list.js',
    '1.hardware_list.js',
    '1.role_list.js',
    'capex_contract_list.js',
    'opex_contracts.js',
}

changed_files = []

for dirpath, _dirs, files in os.walk(ROOT):
    for fname in files:
        if not fname.endswith('.js'):
            continue
        if fname in SKIP:
            continue
        fpath = os.path.join(dirpath, fname)
        try:
            text = open(fpath, encoding='utf-8').read()
        except (UnicodeDecodeError, PermissionError):
            continue

        original = text
        # Apply patterns 1-3 (universal)
        text = PAT_SINGLE.sub(r'blsSpaNavigate(\1);', text)
        text = PAT_DOUBLE.sub(r'blsSpaNavigate(\1);', text)
        text = PAT_TMPL.sub(r'blsSpaNavigate(\1);', text)

        # Apply pattern 4 (only in specific files)
        if fname in VAR_HREF_FILES:
            text = PAT_VAR_HREF.sub(r'blsSpaNavigate(\1);', text)

        if text != original:
            with open(fpath, 'w', encoding='utf-8', newline='\n') as f:
                f.write(text)
            count = sum(1 for _ in re.finditer(r'blsSpaNavigate', text)) - sum(1 for _ in re.finditer(r'blsSpaNavigate', original))
            changed_files.append((fpath, count))
            print(f'  ✓ {os.path.relpath(fpath, ROOT)}  ({count} replacements)')

print(f'\nTotal: {len(changed_files)} files modified')

"""Audit: find all remaining full-page-reload navigation to /p/ routes."""
import os, re

root = os.path.join(os.path.dirname(__file__), '..', 'static', 'js')
skip_files = {'blossom.js'}

# Patterns that cause full page reloads to /p/ routes
patterns = [
    ('window.location.href=/p/', re.compile(r'window\.location\.href\s*=.*\/p\/')),
    ('location.replace(/p/)', re.compile(r'location\.replace\s*\(.*\/p\/')),
    ('location.assign(/p/)', re.compile(r'location\.assign\s*\(.*\/p\/')),
]

found = []
for dirpath, _, files in os.walk(root):
    for fname in files:
        if not fname.endswith('.js') or fname in skip_files:
            continue
        fpath = os.path.join(dirpath, fname)
        try:
            lines = open(fpath, encoding='utf-8', errors='replace').readlines()
        except Exception:
            continue
        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            if stripped.startswith('//') or stripped.startswith('*'):
                continue
            for pname, pat in patterns:
                if pat.search(stripped):
                    found.append((pname, os.path.relpath(fpath, root), i, stripped[:140]))

if found:
    for pname, fp, ln, txt in found:
        print(f'  [{pname}] {fp}:{ln}')
        print(f'    {txt}')
    print(f'\nTotal: {len(found)} remaining')
else:
    print('OK: No remaining full-reload patterns to /p/ routes')

# Also check HTML templates for non-SPA <a href="/p/..."> links
# (These are now caught by global interceptor, but let's count them)
tmpl_root = os.path.join(os.path.dirname(__file__), '..', 'app', 'templates')
href_pat = re.compile(r'href\s*=\s*["\'][^"\']*\/p\/[^"\']*["\']')
tmpl_count = 0
for dirpath, _, files in os.walk(tmpl_root):
    for fname in files:
        if not fname.endswith('.html'):
            continue
        fpath = os.path.join(dirpath, fname)
        try:
            text = open(fpath, encoding='utf-8', errors='replace').read()
        except Exception:
            continue
        matches = href_pat.findall(text)
        tmpl_count += len(matches)
print(f'\nHTML templates: {tmpl_count} <a href="/p/..."> links (all covered by global interceptor)')

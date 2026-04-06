"""Full SPA coverage audit — find ALL remaining window.location navigations."""
import os, re

root = os.path.join(os.path.dirname(__file__), '..', 'static', 'js')
skip_files = {'blossom.js'}

# ALL patterns that cause full page navigation
PAT = re.compile(
    r'window\.location\.(href\s*=|replace\s*\(|assign\s*\()'
    r'|'
    r'window\.location\s*='  # window.location = '...'
)

categories = {
    'auth':   [],   # login/logout — should NOT be SPA
    'api':    [],   # /api/ — data endpoints, not navigation
    'static': [],   # static files
    'p_route': [],  # /p/ routes — should be caught
    'other':  [],   # other navigations
    'var':    [],   # variable href (not string literal)
}

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
            s = line.strip()
            if s.startswith('//') or s.startswith('*') or s.startswith('/*'):
                continue
            if not PAT.search(s):
                continue
            rel = os.path.relpath(fpath, root)
            entry = (rel, i, s[:150])
            if '/login' in s or '/logout' in s or '/auth/' in s:
                categories['auth'].append(entry)
            elif '/api/' in s:
                categories['api'].append(entry)
            elif '/static/' in s:
                categories['static'].append(entry)
            elif '/p/' in s:
                categories['p_route'].append(entry)
            elif "blsSpaNavigate" in s:
                continue  # already using SPA API
            elif re.search(r'=\s*(href|url|link|path|fallback)', s):
                categories['var'].append(entry)
            else:
                categories['other'].append(entry)

print("=== SPA COVERAGE AUDIT ===\n")
total_issues = 0
for cat, entries in categories.items():
    status = {
        'auth': 'OK (intentionally NOT SPA)',
        'api': 'OK (data endpoints)',
        'static': 'OK (file downloads)',
        'p_route': 'NEEDS FIX (should use blsSpaNavigate)',
        'other': 'REVIEW NEEDED',
        'var': 'REVIEW NEEDED (variable URL)',
    }[cat]
    if entries:
        print(f"[{cat}] {len(entries)} occurrences — {status}")
        for rel, ln, txt in entries[:10]:
            print(f"  {rel}:{ln}  {txt[:120]}")
        if len(entries) > 10:
            print(f"  ... and {len(entries)-10} more")
        if cat in ('p_route', 'other', 'var'):
            total_issues += len(entries)
    print()

print(f"\n{'='*50}")
print(f"Actionable issues: {total_issues}")
if total_issues == 0:
    print("SPA coverage: COMPLETE")
else:
    print(f"SPA coverage: {max(0, 100 - total_issues)}%+ (approximate)")

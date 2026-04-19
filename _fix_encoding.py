"""Find and fix HTML template files corrupted by PowerShell Set-Content (wrote as system default encoding instead of UTF-8)."""
import os

bad_files = []
template_dir = os.path.join(os.path.dirname(__file__), 'app', 'templates')

for root, dirs, files in os.walk(template_dir):
    for fname in files:
        if not fname.endswith('.html'):
            continue
        fpath = os.path.join(root, fname)
        try:
            with open(fpath, 'r', encoding='utf-8') as f:
                f.read()
        except UnicodeDecodeError:
            bad_files.append(fpath)

print(f"Found {len(bad_files)} corrupted files")
for fpath in bad_files:
    print(f"  {fpath}")

# Fix: read as cp949 (Korean Windows default), write back as UTF-8
for fpath in bad_files:
    # Try cp949 first (Korean Windows), then latin-1 as fallback
    for enc in ['cp949', 'euc-kr', 'latin-1']:
        try:
            with open(fpath, 'r', encoding=enc) as f:
                content = f.read()
            with open(fpath, 'w', encoding='utf-8', newline='\n') as f:
                f.write(content)
            print(f"  FIXED ({enc}): {fpath}")
            break
        except (UnicodeDecodeError, UnicodeEncodeError):
            continue
    else:
        print(f"  FAILED: {fpath}")

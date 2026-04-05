"""Extract inline scripts from rendered page to check for interference."""
import re, urllib.request

url = 'http://localhost:8080/p/hw_server_onpremise'
req = urllib.request.Request(url, headers={'X-Requested-With': 'blossom-spa'})
html = urllib.request.urlopen(req).read().decode('utf-8')

main_start = html.find('<main')

# Find inline scripts before <main>
inline_pat = re.compile(r'<script>(.+?)</script>', re.DOTALL)
print("=== Inline scripts BEFORE <main> ===")
for m in inline_pat.finditer(html[:main_start]):
    code = m.group(1).strip()
    # Show first 200 chars
    preview = code[:200].replace('\n', ' ')
    print(f"\n  pos={m.start()}, len={len(code)}:")
    print(f"  {preview}...")
    
    # Check if it touches col-hidden or system-table
    if 'col-hidden' in code or 'system-table' in code or 'system-data-table' in code:
        print("  *** TOUCHES TABLE/COL-HIDDEN ***")

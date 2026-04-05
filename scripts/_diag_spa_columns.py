"""Diagnose SPA column visibility issue on server list page."""
import re, urllib.request

url = 'http://localhost:8080/p/hw_server_onpremise'
req = urllib.request.Request(url, headers={'X-Requested-With': 'blossom-spa'})
html = urllib.request.urlopen(req).read().decode('utf-8')

# 1. CSS links in <head>
head_end = html.find('</head>')
head_html = html[:head_end] if head_end > 0 else html[:5000]
css_links = re.findall(r'<link[^>]+stylesheet[^>]+href="([^"]+)"', head_html)
print("=== CSS links in <head> ===")
for c in css_links:
    print(f"  {c}")

# 2. All <th> with data-col, check col-hidden
# pattern: <th data-col="xxx" class="col-hidden"> or <th data-col="xxx">
th_pattern = r'<th\b([^>]*)>'
print("\n=== <th> column visibility ===")
for m in re.finditer(th_pattern, html):
    attrs = m.group(1)
    col_m = re.search(r'data-col="(\w+)"', attrs)
    if not col_m:
        continue
    col = col_m.group(1)
    has_hidden = 'col-hidden' in attrs
    print(f"  {col:20s} col-hidden={'YES' if has_hidden else 'no'}")

# 3. Count main tags
main_count = len(re.findall(r'<main\b', html))
print(f"\n=== <main> tags: {main_count} ===")

# 4. Script tags
scripts = re.findall(r'<script\b[^>]*src="([^"]*)"', html)
print("\n=== Script tags ===")
for s in scripts:
    print(f"  {s}")

print(f"\n=== Total HTML size: {len(html)} chars ===")

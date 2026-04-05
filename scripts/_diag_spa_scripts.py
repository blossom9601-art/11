"""Check script positions in the rendered server list page HTML."""
import re, urllib.request

url = 'http://localhost:8080/p/hw_server_onpremise'
req = urllib.request.Request(url, headers={'X-Requested-With': 'blossom-spa'})
html = urllib.request.urlopen(req).read().decode('utf-8')

# Find <main> position
main_start = html.find('<main')
main_end = html.find('</main>')

# Find all script tags with positions
scripts = [(m.start(), m.group(1) or 'inline') for m in re.finditer(r'<script\b[^>]*(?:src="([^"]*)")?[^>]*>', html)]

print(f"<main> starts at position: {main_start}")
print(f"</main> ends at position: {main_end}")
print(f"\n=== Scripts relative to <main> ===")
for pos, src in scripts:
    location = "BEFORE <main>" if pos < main_start else ("INSIDE <main>" if pos < main_end else "AFTER </main>")
    label = src if src != 'inline' else f'inline: {html[pos:pos+100].strip()[:80]}...'
    print(f"  [{location:15s}] pos={pos:6d}  {label}")

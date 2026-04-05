import os
import re
import sys
import urllib.request

BASE = 'http://127.0.0.1:8080'


def _decode_body(body: bytes, content_type: str) -> str:
    ct = (content_type or '').lower()
    charset = None
    if 'charset=' in ct:
        charset = ct.split('charset=', 1)[1].split(';', 1)[0].strip() or None

    tried: list[str] = []
    for enc in [charset, 'utf-8', 'cp949']:
        if not enc:
            continue
        if enc in tried:
            continue
        tried.append(enc)
        try:
            return body.decode(enc)
        except Exception:
            continue
    return body.decode('utf-8', errors='replace')


def _extract(html: str, element_id: str) -> str | None:
    # keep it simple and robust: allow whitespace/newlines inside tag
    pattern = rf"<[^>]*id=\"{re.escape(element_id)}\"[^>]*>(.*?)</[^>]+>"
    m = re.search(pattern, html, flags=re.IGNORECASE | re.DOTALL)
    if not m:
        return None
    # strip tags inside
    inner = re.sub(r'<[^>]+>', '', m.group(1))
    return inner.strip()


def main(argv: list[str]) -> int:
    path = argv[1] if len(argv) > 1 else '/p/gov_vpn_policy3_detail?vpn_line_id=12'
    url = BASE + path

    req = urllib.request.Request(url, headers={'Accept': 'text/html, */*'})
    with urllib.request.urlopen(req, timeout=20) as resp:
        body = resp.read()
        ct = resp.headers.get('Content-Type', '')
        status = resp.status

    html = _decode_body(body, ct)

    title = _extract(html, 'page-header-title')
    subtitle = _extract(html, 'page-header-subtitle')

    lines: list[str] = []
    lines.append(f'URL: {url}')
    lines.append(f'STATUS: {status}')
    lines.append(f'Content-Type: {ct}')
    lines.append(f'Extracted title: {title!r}')
    lines.append(f'Extracted subtitle: {subtitle!r}')

    # show a small surrounding snippet for sanity
    idx = html.lower().find('page-header-title')
    if idx != -1:
        start = max(0, idx - 200)
        end = min(len(html), idx + 400)
        lines.append('')
        lines.append('--- Snippet around header ---')
        lines.append(html[start:end])

    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    out_path = os.path.join(repo_root, 'tmp_diag_vpn_header.txt')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')

    print('\n'.join(lines))

    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))

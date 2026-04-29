"""Remove the empty-listen server block (lines 25-44 area) from blossom-lumina.conf."""
import paramiko, time
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.56.108", username="root", password="123456", timeout=10, allow_agent=False, look_for_keys=False)
def run(cmd):
    print(f"\n$ {cmd[:240]}")
    _, o, e = c.exec_command(cmd, timeout=60)
    print(o.read().decode("utf-8","replace").rstrip())
    er = e.read().decode("utf-8","replace").rstrip()
    if er: print("STDERR:", er)

# Use Python to delete the block
script = r"""
python3 << 'PYEOF'
import re
path = '/etc/nginx/conf.d/blossom-lumina.conf'
with open(path) as f:
    src = f.read()
# Remove the "HTTP -> HTTPS redirect" comment header AND the server { ... } block
# that no longer has any listen directive.
pattern = re.compile(
    r'#[^\n]*HTTP[^\n]*\n#[^\n]*\n\s*server\s*\{\s*\n'
    r'(?:[^{}]*\{[^{}]*\}\s*\n?)*'  # nested location blocks
    r'[^{}]*\}\s*\n*',
    re.MULTILINE
)
new = pattern.sub('# (HTTP/80 redirect block removed - port 80 disabled by policy)\n\n', src, count=1)
if new == src:
    # fallback: simpler — remove first server { ... } that has no 'listen' directive that is not commented
    # Find blocks
    blocks = []
    i = 0
    while i < len(src):
        m = re.search(r'\nserver\s*\{', src[i:])
        if not m: break
        start = i + m.start() + 1
        # find matching }
        depth = 0
        j = start
        while j < len(src):
            if src[j] == '{': depth += 1
            elif src[j] == '}':
                depth -= 1
                if depth == 0: break
            j += 1
        block = src[start:j+1]
        # Has any non-commented listen?
        has_listen = False
        for line in block.splitlines():
            s = line.strip()
            if s.startswith('#'): continue
            if s.startswith('listen'): has_listen = True; break
        if not has_listen:
            new = src[:start] + src[j+1:]
            break
        i = j + 1
with open(path, 'w') as f:
    f.write(new)
print('OK, written. Old size:', len(src), 'New size:', len(new))
PYEOF
"""
run(script)
run("sed -n '20,55p' /etc/nginx/conf.d/blossom-lumina.conf")
run("nginx -t 2>&1")
run("systemctl restart nginx; systemctl is-active nginx")
time.sleep(2)
print("\n====== verify port 80 ======")
run(r"ss -tlnp | grep -E ':(80|443|9601)\b'")
run("curl -s -o /dev/null -w 'http://127.0.0.1:80 -> %{http_code}\\n' --max-time 3 http://127.0.0.1/ 2>&1 || echo CONN_REFUSED")
run("curl -sk -o /dev/null -w 'https://127.0.0.1     -> %{http_code}\\n' https://127.0.0.1/api/auth/session-check")
run("curl -sk -o /dev/null -w 'https://127.0.0.1:9601 -> %{http_code}\\n' https://127.0.0.1:9601/")

c.close()
print("\nDONE.")

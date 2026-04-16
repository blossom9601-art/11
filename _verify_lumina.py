"""Final E2E verification of all 4 Lumina daemons."""
import paramiko

SERVERS = {
    "ttt1": {"ip": "192.168.56.107", "user": "root", "pw": "123456"},
    "ttt2": {"ip": "192.168.56.106", "user": "root", "pw": "123456"},
    "ttt3": {"ip": "192.168.56.108", "user": "root", "pw": "123456"},
    "ttt4": {"ip": "192.168.56.109", "user": "root", "pw": "123456"},
}

def ssh(host):
    info = SERVERS[host]
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(info["ip"], username=info["user"], password=info["pw"], timeout=10)
    return c

def run(c, cmd):
    stdin, stdout, stderr = c.exec_command(cmd, timeout=30)
    return stdout.read().decode("utf-8", errors="replace").strip()

print("=" * 60)
print(" Lumina 데몬 최종 검증")
print("=" * 60)

# 1. 데몬 상태
checks = [
    ("ttt1", "lumina-db"),
    ("ttt1", "mariadb"),
    ("ttt2", "lumina-ap"),
    ("ttt3", "lumina-web"),
    ("ttt3", "nginx"),
    ("ttt4", "lumina-agent"),
]
print("\n  데몬 상태:")
for host, svc in checks:
    c = ssh(host)
    status = run(c, f"systemctl is-active {svc}")
    print(f"    {host}/{svc:20s} → {status}")
    c.close()

# 2. RPM 패키지 확인
print("\n  RPM 패키지:")
rpm_map = {
    "ttt1": ["lumina-common", "lumina-db"],
    "ttt2": ["lumina-common", "lumina-ap"],
    "ttt3": ["lumina-common", "lumina-web"],
    "ttt4": ["lumina-common", "lumina-agent"],
}
for host, pkgs in rpm_map.items():
    c = ssh(host)
    for pkg in pkgs:
        ver = run(c, f"rpm -q {pkg} 2>/dev/null || echo 'N/A'")
        print(f"    {host}/{pkg:20s} → {ver}")
    c.close()

# 3. E2E 기능 검증
print("\n  기능 검증:")
c2 = ssh("ttt2")
ap = run(c2, "curl -sk https://127.0.0.1:5100/health 2>&1")
print(f"    AP  /health → {ap}")
c2.close()

c3 = ssh("ttt3")
web = run(c3, "curl -s http://127.0.0.1/health 2>&1")
print(f"    WEB /health → {web}")
c3.close()

c1 = ssh("ttt1")
db = run(c1, "mysql -u lumina_web_reader -p'Lumina_WEB_2026!' -e 'SELECT COUNT(*) AS hosts FROM lumina.collected_hosts' 2>&1")
print(f"    DB  hosts   → {db}")
c1.close()

c4 = ssh("ttt4")
agent = run(c4, "journalctl -u lumina-agent -n 1 --no-pager --output=cat 2>&1")
print(f"    Agent last  → {agent}")
c4.close()

print("\n" + "=" * 60)
print(" 완료")
print("=" * 60)

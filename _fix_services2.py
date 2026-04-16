#!/usr/bin/env python3
"""Fix round 2: NGINX + Agent deep fixes."""
import paramiko
import time

def ssh(ip, pw="123456"):
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(ip, username="root", password=pw, timeout=10)
    return c

def run(c, cmd, label=""):
    stdin, stdout, stderr = c.exec_command(cmd, timeout=120)
    out = stdout.read().decode("utf-8", errors="replace").strip()
    err = stderr.read().decode("utf-8", errors="replace").strip()
    rc = stdout.channel.recv_exit_status()
    if out:
        for line in out.splitlines():
            print(f"  [{label}] {line}")
    if err:
        for line in err.splitlines():
            print(f"  [{label}] {'ERR: ' if rc != 0 else ''}{line}")
    return out, err, rc

def put_str(c, content, path, mode=0o644):
    sftp = c.open_sftp()
    with sftp.file(path, "w") as f:
        f.write(content)
    sftp.chmod(path, mode)
    sftp.close()


# ═══════════════════════════════════════════════════════
# Fix 1: ttt3 NGINX — nginx.conf 완전 복원
# ═══════════════════════════════════════════════════════
print("=" * 60)
print(" Fix 1: ttt3 NGINX — nginx.conf 완전 복원")
print("=" * 60)

c3 = ssh("192.168.56.108")

# nginx.conf를 기본 Rocky Linux 8 버전으로 수동 복구
NGINX_CONF = r"""# For more information on configuration, see:
#   * Official English Documentation: http://nginx.org/en/docs/
#   * Official Russian Documentation: http://nginx.org/ru/docs/

user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log;
pid /run/nginx.pid;

# Load dynamic modules. See /usr/share/doc/nginx/README.dynamic.
include /usr/share/nginx/modules/*.conf;

events {
    worker_connections 1024;
}

http {
    log_format  main  '$remote_addr - $remote_user [$time_local] "$request" '
                      '$status $body_bytes_sent "$http_referer" '
                      '"$http_user_agent" "$http_x_forwarded_for"';

    access_log  /var/log/nginx/access.log  main;

    sendfile            on;
    tcp_nopush          on;
    tcp_nodelay         on;
    keepalive_timeout   65;
    types_hash_max_size 4096;

    include             /etc/nginx/mime.types;
    default_type        application/octet-stream;

    # Load modular configuration files from the /etc/nginx/conf.d directory.
    # See http://nginx.org/en/docs/beginners_guide.html
    include /etc/nginx/conf.d/*.conf;
}
"""
put_str(c3, NGINX_CONF, "/etc/nginx/nginx.conf")

# default.conf 삭제
run(c3, "rm -f /etc/nginx/conf.d/default.conf", "ttt3")

# lumina.conf 확인
run(c3, "cat /etc/nginx/conf.d/lumina.conf", "ttt3")

# nginx 테스트
run(c3, "nginx -t 2>&1", "ttt3")

# nginx 시작
run(c3, "systemctl restart nginx && systemctl enable nginx", "ttt3")
run(c3, "systemctl is-active nginx", "ttt3")

# 헬스체크
time.sleep(1)
run(c3, "curl -s http://127.0.0.1/health 2>&1", "ttt3")

c3.close()
print("  ttt3 NGINX 수정 완료\n")


# ═══════════════════════════════════════════════════════
# Fix 2: ttt4 Agent — config.py 기본 경로 + agent.conf 키 매핑
# ═══════════════════════════════════════════════════════
print("=" * 60)
print(" Fix 2: ttt4 Agent — config 경로 + 키 매핑 수정")
print("=" * 60)

c4 = ssh("192.168.56.109")

# 1) config.py 기본 경로 패치
run(c4, r"""
cd /opt/blossom/lumina/common
# 기본 output_dir 패치
sed -i 's|return "/var/lib/lumina"|return "/var/lib/blossom/lumina/agent"|' config.py
# 기본 conf_path 패치
sed -i 's|return "/etc/lumina/lumina.conf"|return "/etc/blossom/lumina/agent.conf"|' config.py
# 기본 log_file 패치
sed -i 's|"/var/log/lumina/lumina.log"|"/var/log/blossom/lumina/agent/lumina.log"|' config.py
echo "config.py 기본 경로 패치 완료"
grep -n '/var/lib/' config.py | head -3
grep -n '/var/log/' config.py | head -3
grep -n '/etc/' config.py | head -3
""", "ttt4")

# 2) agent.conf의 키 이름을 코드에 맞게 수정
# 코드에서 읽는 키: [logging] level, file
# 현재 agent.conf의 키: log_level, log_file, log_dir
AGENT_CONF = """[server]
host = 192.168.56.106
port = 5100
protocol = https
verify_ssl = false
ca_cert = /etc/blossom/lumina/tls/ca.crt
client_cert = /etc/blossom/lumina/tls/client.crt
client_key = /etc/blossom/lumina/tls/client.key

[agent]
interval = 60
collectors = interface, account, package
output_dir = /var/lib/blossom/lumina/agent

[logging]
level = INFO
file = /var/log/blossom/lumina/agent/lumina-agent.log

[security]
auth_token = lumina-test-token-2026-changeme
mask_sensitive = true

[network]
proxy =
"""
put_str(c4, AGENT_CONF, "/etc/blossom/lumina/agent.conf", 0o640)

# 3) 디렉토리 권한 확인
run(c4, """
mkdir -p /var/lib/blossom/lumina/agent
mkdir -p /var/log/blossom/lumina/agent
chown -R lumina:lumina /var/lib/blossom/lumina /var/log/blossom/lumina
chmod 750 /var/lib/blossom/lumina/agent /var/log/blossom/lumina/agent
ls -la /var/lib/blossom/lumina/
ls -la /var/log/blossom/lumina/
""", "ttt4")

# 4) agent.py에서 config 로드 확인 테스트
run(c4, """
cd /opt/blossom/lumina
python3 -c "
import sys; sys.path.insert(0, '/opt/blossom/lumina')
from common.config import AgentConfig
c = AgentConfig('/etc/blossom/lumina/agent.conf')
print('server_url:', c.server_url)
print('output_dir:', c.output_dir)
print('log_file:', c.log_file)
print('collectors:', c.collectors)
print('auth_token:', c.auth_token[:10] + '...' if c.auth_token else 'N/A')
print('OK')
"
""", "ttt4")

# 5) Agent 재시작
run(c4, "systemctl stop lumina-agent 2>/dev/null; sleep 1", "ttt4")
run(c4, "systemctl start lumina-agent", "ttt4")
time.sleep(4)

# 6) 상태 확인
run(c4, "systemctl status lumina-agent --no-pager 2>&1 | head -15", "ttt4")
run(c4, "journalctl -u lumina-agent --no-pager -n 30 2>&1 | tail -25", "ttt4")

c4.close()

print()
print("=" * 60)
print(" Fix 2 완료")
print("=" * 60)

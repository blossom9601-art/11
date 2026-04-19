import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

CONF = '/etc/nginx/conf.d/blossom-lumina.conf'

# 1) 백업
ssh.exec_command(f'cp {CONF} {CONF}.bak4')
print('[1] 백업 완료')

# 2) 현재 설정 읽기
_, o, _ = ssh.exec_command(f'cat {CONF}')
current = o.read().decode()

# 3) 443 listen 라인 제거 (9601 서버 블록에서)
# 443은 별도 server 블록으로 분리해야 함
import re

# 443 listen 제거
current = current.replace('    listen       443 ssl http2;\n', '')
current = current.replace('    listen       [::]:443 ssl http2;\n', '')

# 4) Blossom 전용 443 서버 블록 생성 (9601 블록 앞에 삽입)
blossom_block = '''
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Blossom 서비스 (포트 443)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
server {
    listen       443 ssl http2;
    listen       [::]:443 ssl http2;
    server_name  _;

    ssl_certificate      /etc/blossom/lumina/tls/server.crt;
    ssl_certificate_key  /etc/blossom/lumina/tls/server.key;
    ssl_trusted_certificate /etc/blossom/lumina/tls/ca.crt;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
    ssl_prefer_server_ciphers on;

    ssl_session_cache    shared:BLOSSOM_SSL:10m;
    ssl_session_timeout  1d;
    ssl_session_tickets  off;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    server_tokens off;

    client_max_body_size    10m;
    client_body_timeout     30s;
    client_header_timeout   30s;
    send_timeout            30s;
    keepalive_timeout       65s;

    access_log /var/log/blossom/web/access.log combined;
    error_log  /var/log/blossom/web/error.log warn;

    autoindex off;

    # 정적 파일
    location /static/ {
        alias /opt/blossom/web/static/;
        expires 7d;
        add_header Cache-Control "public, immutable";
        add_header X-Content-Type-Options "nosniff" always;
        access_log off;
    }

    # 로그인 (rate limit)
    location /api/auth/login {
        limit_req zone=lumina_login burst=3 nodelay;
        limit_req_status 429;

        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host              $http_host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout  10s;
        proxy_read_timeout     30s;
        proxy_send_timeout     30s;
    }

    # RAG AI (SSE 스트리밍)
    location = /api/search/rag-answer {
        limit_req zone=lumina_api burst=5 nodelay;
        limit_req_status 429;

        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host              $http_host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout  10s;
        proxy_read_timeout     300s;
        proxy_send_timeout     300s;
        proxy_buffering        off;
        proxy_cache            off;
    }

    # API
    location /api/ {
        limit_req zone=lumina_api burst=20 nodelay;
        limit_req_status 429;

        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host              $http_host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout  10s;
        proxy_read_timeout     60s;
        proxy_send_timeout     30s;
        proxy_buffering        on;
        proxy_buffer_size      4k;
        proxy_buffers          8 8k;
    }

    # 기본 프록시 → Blossom (8001)
    location / {
        limit_req zone=lumina_general burst=20 nodelay;

        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host              $http_host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout  10s;
        proxy_read_timeout     30s;
        proxy_send_timeout     30s;
    }

    location ~ /\\. { deny all; access_log off; log_not_found off; }
    location = /favicon.ico { access_log off; log_not_found off; }
    location = /robots.txt { access_log off; log_not_found off; }
}

'''

# 5) 9601 블록 앞에 blossom 블록 삽입
marker = '# HTTPS 서버 (메인)'
if marker in current:
    current = current.replace(
        '# ' + chr(9473) * 23 + '\n# HTTPS',
        blossom_block + '# ' + chr(9473) * 23 + '\n# HTTPS',
        1
    )

# 마커 방식이 안 먹을 수 있으니 다른 방식 시도
# "# HTTPS 서버 (메인)" 앞에 삽입
if blossom_block not in current:
    idx = current.find('# HTTPS')
    if idx > 0:
        # 해당 줄의 섹션 구분자 시작 찾기
        line_start = current.rfind('\n', 0, idx)
        # 그 위의 구분선 찾기
        sep_start = current.rfind('# ', 0, line_start)
        sep_line_start = current.rfind('\n', 0, sep_start) + 1
        current = current[:sep_line_start] + blossom_block + current[sep_line_start:]

# 6) 임시 파일로 쓰고 적용
_, o, e = ssh.exec_command('cat > /tmp/nginx_new.conf << "BLOSSOM_EOF"\n' + current + '\nBLOSSOM_EOF')
e.read()

# 7) 복사 및 문법 검사
ssh.exec_command(f'cp /tmp/nginx_new.conf {CONF}')

_, o, e = ssh.exec_command('nginx -t 2>&1')
result = o.read().decode() + e.read().decode()
print(f'[2] nginx -t: {result}')

if 'test is successful' in result:
    ssh.exec_command('systemctl reload nginx')
    print('[3] nginx reload 완료')

    # 테스트
    _, o, _ = ssh.exec_command('curl -kI https://localhost/ 2>&1 | head -8')
    print('[4] curl :443 (Blossom):')
    print(o.read().decode())

    _, o, _ = ssh.exec_command('curl -kI https://localhost:9601/ 2>&1 | head -8')
    print('[5] curl :9601 (Lumina):')
    print(o.read().decode())
else:
    print('[ABORT] 문법 오류 — 롤백')
    ssh.exec_command(f'cp {CONF}.bak4 {CONF}')

ssh.close()

#!/bin/bash
###############################################################################
# Lumina WEB 앱 — 기본 라우트 + 대시보드 페이지 추가
###############################################################################
set -euo pipefail

echo "============================================"
echo "  Lumina WEB 앱 라우트 추가"
echo "============================================"

# ─── 1. 대시보드 HTML 템플릿 ─────────────────────────────
echo "[1/4] 대시보드 템플릿 생성..."
cat > /opt/blossom/lumina/web/app/templates/dashboard.html << 'HTML'
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lumina — IT 자산관리 대시보드</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
            color: #e0e0e0;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .header {
            background: rgba(255,255,255,0.05);
            backdrop-filter: blur(10px);
            border-bottom: 1px solid rgba(255,255,255,0.1);
            padding: 16px 32px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .header h1 {
            font-size: 22px;
            font-weight: 600;
            background: linear-gradient(90deg, #667eea, #764ba2);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .header .version {
            font-size: 12px;
            color: #888;
        }
        .main {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 40px;
        }
        .card-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 24px;
            max-width: 1200px;
            width: 100%;
        }
        .card {
            background: rgba(255,255,255,0.06);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 16px;
            padding: 28px;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .card:hover {
            transform: translateY(-4px);
            box-shadow: 0 12px 40px rgba(0,0,0,0.3);
        }
        .card .icon { font-size: 36px; margin-bottom: 16px; }
        .card h3 { font-size: 18px; margin-bottom: 8px; color: #fff; }
        .card p { font-size: 14px; color: #aaa; line-height: 1.6; }
        .card .status {
            display: inline-block;
            margin-top: 12px;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
        }
        .status.ok { background: rgba(72,199,142,0.2); color: #48c78e; }
        .status.warn { background: rgba(255,224,102,0.2); color: #ffe066; }
        .footer {
            text-align: center;
            padding: 16px;
            font-size: 12px;
            color: #555;
            border-top: 1px solid rgba(255,255,255,0.05);
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🌸 Blossom Lumina</h1>
        <span class="version">v2.0.0 — IT 자산관리 시스템</span>
    </div>
    <div class="main">
        <div class="card-grid">
            <div class="card">
                <div class="icon">🖥️</div>
                <h3>IT 자산 현황</h3>
                <p>서버, 네트워크 장비, 워크스테이션 등 전체 IT 자산을 통합 관리합니다.</p>
                <span class="status ok">● 시스템 정상</span>
            </div>
            <div class="card">
                <div class="icon">📡</div>
                <h3>에이전트 수집</h3>
                <p>Lumina Agent가 수집한 자산 정보를 AP 서버를 통해 실시간 수신합니다.</p>
                <span class="status ok">● AP 수신 정상</span>
            </div>
            <div class="card">
                <div class="icon">🗄️</div>
                <h3>데이터베이스</h3>
                <p>MariaDB 기반 자산 데이터 저장소. 안전한 권한 분리 적용.</p>
                <span class="status ok">● DB 연결 정상</span>
            </div>
            <div class="card">
                <div class="icon">🔒</div>
                <h3>보안</h3>
                <p>TLS 암호화, SELinux 적용, 계정 분리(lumina) 보안 아키텍처.</p>
                <span class="status ok">● 보안 적용됨</span>
            </div>
        </div>
    </div>
    <div class="footer">
        © 2026 Blossom Lumina. All rights reserved. | 서버: {{ hostname }}
    </div>
</body>
</html>
HTML
echo "  → dashboard.html 생성"

# ─── 2. 라우트 모듈 생성 ─────────────────────────────────
echo "[2/4] 라우트 모듈 생성..."
cat > /opt/blossom/lumina/web/app/routes/__init__.py << 'PYROUTES'
"""Lumina WEB 라우트."""
PYROUTES

cat > /opt/blossom/lumina/web/app/routes/main.py << 'PYMAIN'
"""메인 라우트 — 대시보드 / 헬스체크 / 로그인."""
import socket
from flask import Blueprint, render_template, jsonify

bp = Blueprint('main', __name__)


@bp.route('/')
def dashboard():
    """대시보드 메인 페이지."""
    hostname = socket.gethostname()
    return render_template('dashboard.html', hostname=hostname)


@bp.route('/health')
def health():
    """헬스체크 엔드포인트 (로드밸런서/모니터링용)."""
    return jsonify({
        'status': 'ok',
        'service': 'lumina-web',
        'version': '2.0.0'
    })


@bp.route('/api/status')
def api_status():
    """서비스 상태 API."""
    return jsonify({
        'success': True,
        'services': {
            'web': 'running',
            'ap': 'running',
            'db': 'running'
        }
    })
PYMAIN
echo "  → routes/main.py 생성"

# ─── 3. app factory 업데이트 (라우트 등록) ────────────────
echo "[3/4] app factory 업데이트..."
cat > /opt/blossom/lumina/web/app/__init__.py << 'PYAPP'
"""Blossom Lumina WEB — Flask 대시보드 앱 팩토리."""
from flask import Flask


def create_app(config=None):
    app = Flask(__name__)
    app.config['DEBUG'] = False
    app.config['SESSION_COOKIE_SECURE'] = True
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

    # 라우트 등록
    from app.routes.main import bp as main_bp
    app.register_blueprint(main_bp)

    return app
PYAPP
echo "  → app/__init__.py 업데이트"

# ─── 4. 소유권 + 서비스 재시작 ────────────────────────────
echo "[4/4] 소유권 변경 + lumina-web 재시작..."
chown -R lumina:lumina /opt/blossom/lumina/web/
systemctl restart lumina-web
sleep 3

echo ""
echo "=== 서비스 상태 ==="
systemctl status lumina-web --no-pager 2>&1 | head -10

echo ""
echo "=== 연결 테스트 ==="
echo -n "  GET / → "
resp=$(curl -s --max-time 5 -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/)
echo "HTTP $resp"

echo -n "  GET /health → "
curl -s --max-time 5 http://127.0.0.1:8000/health
echo ""

echo -n "  GET /api/status → "
curl -s --max-time 5 http://127.0.0.1:8000/api/status
echo ""

echo -n "  NGINX proxy / → "
resp=$(curl -sk --max-time 5 -o /dev/null -w "%{http_code}" https://127.0.0.1/)
echo "HTTP $resp"

echo ""
echo "=== 외부 접근 테스트 ==="
echo -n "  HTTP 192.168.56.105 → "
curl -s --max-time 5 -o /dev/null -w "%{http_code}" http://192.168.56.105/
echo ""
echo -n "  HTTPS 192.168.56.105 → "
curl -sk --max-time 5 -o /dev/null -w "%{http_code}" https://192.168.56.105/
echo ""

echo ""
echo "  완료"

#!/bin/bash
###############################################################################
# Blossom Lumina Agent — RPM + DEB 통합 빌드 스크립트
# 결과물:
#   - lumina-1.0.0-1.noarch.rpm   (RHEL/Rocky/Alma 8/9/10)
#   - lumina_1.0.0-1_all.deb      (Ubuntu 22.04/24.04, Debian)
###############################################################################
set -euo pipefail

AGENTS=/mnt/c/Users/ME/Desktop/blossom/agents
DEST=/mnt/c/Users/ME/Desktop/blossom/agents/linux/dist
WORKDIR=/tmp/lumina-agent-build
VERSION="1.0.3"
RELEASE="1"

rm -rf "$WORKDIR"
mkdir -p "$DEST"

###############################################################################
# 공통: 소스 복사 + CRLF → LF
###############################################################################
prepare_source() {
    local target="$1"
    mkdir -p "$target/common" "$target/linux/collectors"

    cp "$AGENTS/common/__init__.py"   "$target/common/" 2>/dev/null || touch "$target/common/__init__.py"
    cp "$AGENTS/common/config.py"     "$target/common/"
    cp "$AGENTS/common/collector.py"  "$target/common/"

    cp "$AGENTS/linux/__init__.py"               "$target/linux/" 2>/dev/null || touch "$target/linux/__init__.py"
    cp "$AGENTS/linux/agent.py"                  "$target/linux/"
    cp "$AGENTS/linux/blossom-agent.service"     "$target/linux/"
    cp "$AGENTS/linux/lumina-agent"               "$target/linux/" 2>/dev/null || true
    cp "$AGENTS/linux/collectors/__init__.py"    "$target/linux/collectors/" 2>/dev/null || touch "$target/linux/collectors/__init__.py"
    cp "$AGENTS/linux/collectors/interface.py"   "$target/linux/collectors/"
    cp "$AGENTS/linux/collectors/account.py"     "$target/linux/collectors/"
    cp "$AGENTS/linux/collectors/package.py"     "$target/linux/collectors/"
    cp "$AGENTS/linux/agent.conf.default"        "$target/" 2>/dev/null || true

    find "$target" -type f -exec dos2unix -q {} \; 2>/dev/null || true
}

###############################################################################
# 1) RPM 빌드
###############################################################################
build_rpm() {
    echo ""
    echo "========== [1/2] RPM 빌드 =========="
    local TOPDIR="$WORKDIR/rpmbuild"
    mkdir -p "$TOPDIR"/{BUILD,RPMS,SOURCES,SPECS,SRPMS}

    prepare_source "$TOPDIR/SOURCES"
    cp "$AGENTS/linux/blossom-agent.spec" "$TOPDIR/SPECS/"
    dos2unix -q "$TOPDIR/SPECS/blossom-agent.spec" 2>/dev/null || true

    rpmbuild --define "_topdir $TOPDIR" --define "dist %{nil}" \
        -bb "$TOPDIR/SPECS/blossom-agent.spec"

    cp "$TOPDIR/RPMS/noarch/"*.rpm "$DEST/"
    echo "  → RPM 빌드 완료"
}

###############################################################################
# 2) DEB 빌드
###############################################################################
build_deb() {
    echo ""
    echo "========== [2/2] DEB 빌드 =========="
    local PKGDIR="$WORKDIR/deb/lumina-agent_${VERSION}-${RELEASE}_all"

    # ── 디렉터리 구조 ────────────────────────────────────
    mkdir -p "$PKGDIR/DEBIAN"
    mkdir -p "$PKGDIR/opt/lumina/common"
    mkdir -p "$PKGDIR/opt/lumina/linux/collectors"
    mkdir -p "$PKGDIR/etc/lumina"
    mkdir -p "$PKGDIR/usr/lib/systemd/system"
    mkdir -p "$PKGDIR/var/log/lumina"
    mkdir -p "$PKGDIR/var/lib/lumina"

    # ── 소스 복사 ────────────────────────────────────────
    local SRC="$WORKDIR/deb-src"
    prepare_source "$SRC"

    cp "$SRC/common/__init__.py"   "$PKGDIR/opt/lumina/common/"
    cp "$SRC/common/config.py"     "$PKGDIR/opt/lumina/common/"
    cp "$SRC/common/collector.py"  "$PKGDIR/opt/lumina/common/"

    cp "$SRC/linux/__init__.py"               "$PKGDIR/opt/lumina/linux/"
    cp "$SRC/linux/agent.py"                  "$PKGDIR/opt/lumina/linux/"
    chmod 755 "$PKGDIR/opt/lumina/linux/agent.py"
    cp "$SRC/linux/collectors/__init__.py"    "$PKGDIR/opt/lumina/linux/collectors/"
    cp "$SRC/linux/collectors/interface.py"   "$PKGDIR/opt/lumina/linux/collectors/"
    cp "$SRC/linux/collectors/account.py"     "$PKGDIR/opt/lumina/linux/collectors/"
    cp "$SRC/linux/collectors/package.py"     "$PKGDIR/opt/lumina/linux/collectors/"

    cp "$SRC/agent.conf.default" "$PKGDIR/etc/lumina/lumina.conf" 2>/dev/null || true
    cp "$SRC/linux/blossom-agent.service" "$PKGDIR/usr/lib/systemd/system/lumina-agent.service"

    # CLI wrapper
    mkdir -p "$PKGDIR/usr/bin"
    cp "$SRC/linux/lumina-agent" "$PKGDIR/usr/bin/lumina-agent"
    chmod 755 "$PKGDIR/usr/bin/lumina-agent"

    # ── DEBIAN/control ───────────────────────────────────
    cat > "$PKGDIR/DEBIAN/control" << EOF
Package: lumina-agent
Version: ${VERSION}-${RELEASE}
Section: admin
Priority: optional
Architecture: all
Depends: python3 (>= 3.6)
Maintainer: Blossom Admin <admin@blossom.local>
Homepage: https://blossom.local
Description: Lumina Agent (Linux)
EOF

    # ── DEBIAN/conffiles ─────────────────────────────────
    cat > "$PKGDIR/DEBIAN/conffiles" << EOF
/etc/lumina/lumina.conf
EOF

    # ── DEBIAN/preinst ───────────────────────────────────
    cat > "$PKGDIR/DEBIAN/preinst" << 'EOF'
#!/bin/sh
set -e
getent passwd lumina >/dev/null 2>&1 || \
    useradd -r -s /usr/sbin/nologin -d /opt/lumina lumina
EOF
    chmod 755 "$PKGDIR/DEBIAN/preinst"

    # ── DEBIAN/postinst ──────────────────────────────────
    cat > "$PKGDIR/DEBIAN/postinst" << 'EOF'
#!/bin/sh
set -e
systemctl daemon-reload
systemctl enable lumina-agent.service 2>/dev/null || true
echo ""
echo "  lumina-agent --setup   # 서버 연결 설정"
echo "  systemctl start lumina-agent"
echo ""
EOF
    chmod 755 "$PKGDIR/DEBIAN/postinst"

    # ── DEBIAN/prerm ─────────────────────────────────────
    cat > "$PKGDIR/DEBIAN/prerm" << 'EOF'
#!/bin/sh
set -e
if [ "$1" = "remove" ]; then
    systemctl stop lumina-agent.service 2>/dev/null || true
    systemctl disable lumina-agent.service 2>/dev/null || true
fi
EOF
    chmod 755 "$PKGDIR/DEBIAN/prerm"

    # ── DEBIAN/postrm ────────────────────────────────────
    cat > "$PKGDIR/DEBIAN/postrm" << 'EOF'
#!/bin/sh
set -e
systemctl daemon-reload
EOF
    chmod 755 "$PKGDIR/DEBIAN/postrm"

    # ── dpkg-deb 빌드 ───────────────────────────────────
    dpkg-deb --build --root-owner-group "$PKGDIR"

    cp "$WORKDIR/deb/lumina-agent_${VERSION}-${RELEASE}_all.deb" "$DEST/"
    echo "  → DEB 빌드 완료"
}

###############################################################################
# 실행
###############################################################################
build_rpm
build_deb

echo ""
echo "=========================================="
echo " 에이전트 패키지 빌드 완료"
echo "=========================================="
echo ""
echo "결과물:"
ls -lh "$DEST/"
echo ""
echo "설치 명령:"
echo "  [RHEL/Rocky] rpm -ivh lumina-agent-${VERSION}-${RELEASE}.noarch.rpm"
echo "  [Ubuntu/Deb] dpkg -i  lumina-agent_${VERSION}-${RELEASE}_all.deb"

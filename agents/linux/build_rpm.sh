#!/usr/bin/env bash
#
# Lumina Agent — RPM 빌드 스크립트
#
# 사용법 (RHEL / Rocky / CentOS / Fedora):
#   chmod +x build_rpm.sh
#   ./build_rpm.sh
#
# 의존성: rpm-build, rpmdevtools
#   sudo dnf install rpm-build rpmdevtools   # RHEL 8+
#   sudo yum install rpm-build rpmdevtools   # RHEL 7
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SPEC="$SCRIPT_DIR/blossom-agent.spec"

VERSION="1.0.0"

# ── rpmbuild 디렉터리 구성 ──────────────────────────────
TOPDIR="$AGENT_ROOT/rpmbuild"
rm -rf "$TOPDIR"
mkdir -p "$TOPDIR"/{BUILD,RPMS,SOURCES,SPECS,SRPMS}

# ── SOURCES 디렉터리에 에이전트 소스 복사 ────────────────
SRC="$TOPDIR/SOURCES"

# common
mkdir -p "$SRC/common"
cp "$AGENT_ROOT/common/__init__.py"   "$SRC/common/" 2>/dev/null || touch "$SRC/common/__init__.py"
cp "$AGENT_ROOT/common/config.py"     "$SRC/common/"
cp "$AGENT_ROOT/common/collector.py"  "$SRC/common/"

# linux
mkdir -p "$SRC/linux/collectors"
cp "$AGENT_ROOT/linux/__init__.py"               "$SRC/linux/" 2>/dev/null || touch "$SRC/linux/__init__.py"
cp "$AGENT_ROOT/linux/agent.py"                  "$SRC/linux/"
cp "$AGENT_ROOT/linux/blossom-agent.service"     "$SRC/linux/"  # lumina.service로 RPM에서 복사됨
cp "$AGENT_ROOT/linux/collectors/__init__.py"    "$SRC/linux/collectors/" 2>/dev/null || touch "$SRC/linux/collectors/__init__.py"
cp "$AGENT_ROOT/linux/collectors/interface.py"   "$SRC/linux/collectors/"
cp "$AGENT_ROOT/linux/collectors/account.py"     "$SRC/linux/collectors/"
cp "$AGENT_ROOT/linux/collectors/package.py"     "$SRC/linux/collectors/"

# 기본 설정 파일
cp "$SCRIPT_DIR/agent.conf.default" "$SRC/"

# ── rpmbuild 실행 ────────────────────────────────────────
echo "===== RPM 빌드 시작 (v${VERSION}) ====="

rpmbuild --define "_topdir $TOPDIR" -bb "$SPEC"

echo ""
echo "===== RPM 빌드 완료 ====="
echo "결과물 위치:"
find "$TOPDIR/RPMS" -name "*.rpm" -exec echo "  → {}" \;

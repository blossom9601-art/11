#!/usr/bin/env bash
set -euo pipefail

AGENT_DIR=/mnt/c/Users/ME/Desktop/blossom/agents
WORKDIR=/tmp/blossom-rpm-build
rm -rf "$WORKDIR"
mkdir -p "$WORKDIR"

# 전체 agents 디렉터리 복사
cp -r "$AGENT_DIR/common" "$WORKDIR/common"
cp -r "$AGENT_DIR/linux"  "$WORKDIR/linux"

# 모든 파일 CRLF→LF 변환
find "$WORKDIR" -type f -exec dos2unix -q {} \; 2>/dev/null || true

# rpmbuild 디렉터리 구성
TOPDIR="$WORKDIR/rpmbuild"
mkdir -p "$TOPDIR"/{BUILD,RPMS,SOURCES,SPECS,SRPMS}

SRC="$TOPDIR/SOURCES"
mkdir -p "$SRC/common" "$SRC/linux/collectors"

cp "$WORKDIR/common/__init__.py"   "$SRC/common/" 2>/dev/null || touch "$SRC/common/__init__.py"
cp "$WORKDIR/common/config.py"     "$SRC/common/"
cp "$WORKDIR/common/collector.py"  "$SRC/common/"

cp "$WORKDIR/linux/__init__.py"               "$SRC/linux/" 2>/dev/null || touch "$SRC/linux/__init__.py"
cp "$WORKDIR/linux/agent.py"                  "$SRC/linux/"
cp "$WORKDIR/linux/blossom-agent.service"     "$SRC/linux/"
cp "$WORKDIR/linux/collectors/__init__.py"    "$SRC/linux/collectors/" 2>/dev/null || touch "$SRC/linux/collectors/__init__.py"
cp "$WORKDIR/linux/collectors/interface.py"   "$SRC/linux/collectors/"
cp "$WORKDIR/linux/collectors/account.py"     "$SRC/linux/collectors/"
cp "$WORKDIR/linux/collectors/package.py"     "$SRC/linux/collectors/"

# 기본 설정 파일
cp "$WORKDIR/linux/agent.conf.default" "$SRC/" 2>/dev/null || true

SPEC="$WORKDIR/linux/blossom-agent.spec"

echo "===== RPM 빌드 시작 (v1.0.0) ====="
rpmbuild --define "_topdir $TOPDIR" -bb "$SPEC"

echo ""
echo "===== RPM 빌드 완료 ====="
echo "결과물:"
find "$TOPDIR/RPMS" -name "*.rpm" -exec echo "  → {}" \;

# 결과물을 Windows 쪽으로 복사
DEST=/mnt/c/Users/ME/Desktop/blossom/agents/linux/rpmbuild/RPMS
mkdir -p "$DEST"
find "$TOPDIR/RPMS" -name "*.rpm" -exec cp {} "$DEST/" \;
echo ""
echo "Windows 경로로 복사 완료: agents/linux/rpmbuild/RPMS/"
ls -la "$DEST/"

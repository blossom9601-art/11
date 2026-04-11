#!/bin/bash
set -euo pipefail

AGENTS=/mnt/c/Users/ME/Desktop/blossom/agents
WORKDIR=/tmp/lumina-rebuild
TOPDIR="$WORKDIR/rpmbuild"

rm -rf "$WORKDIR"
mkdir -p "$TOPDIR"/{BUILD,RPMS,SOURCES,SPECS,SRPMS}

SRC="$TOPDIR/SOURCES"
mkdir -p "$SRC/common" "$SRC/linux/collectors"

# 소스 복사
cp "$AGENTS/common/__init__.py"   "$SRC/common/" 2>/dev/null || touch "$SRC/common/__init__.py"
cp "$AGENTS/common/config.py"     "$SRC/common/"
cp "$AGENTS/common/collector.py"  "$SRC/common/"
cp "$AGENTS/linux/__init__.py"               "$SRC/linux/" 2>/dev/null || touch "$SRC/linux/__init__.py"
cp "$AGENTS/linux/agent.py"                  "$SRC/linux/"
cp "$AGENTS/linux/blossom-agent.service"     "$SRC/linux/"
cp "$AGENTS/linux/collectors/__init__.py"    "$SRC/linux/collectors/" 2>/dev/null || touch "$SRC/linux/collectors/__init__.py"
cp "$AGENTS/linux/collectors/interface.py"   "$SRC/linux/collectors/"
cp "$AGENTS/linux/collectors/account.py"     "$SRC/linux/collectors/"
cp "$AGENTS/linux/collectors/package.py"     "$SRC/linux/collectors/"
cp "$AGENTS/linux/agent.conf.default"        "$SRC/" 2>/dev/null || true
cp "$AGENTS/linux/blossom-agent.spec"        "$TOPDIR/SPECS/"

# CRLF → LF
find "$WORKDIR" -type f -exec dos2unix -q {} \; 2>/dev/null || true

# dist を空にして빌드 → el8 제거
echo "===== Agent RPM 빌드 (dist 태그 제거) ====="
rpmbuild --define "_topdir $TOPDIR" --define "dist %{nil}" -bb "$TOPDIR/SPECS/blossom-agent.spec"

# 결과 복사
DEST=/mnt/c/Users/ME/Desktop/blossom/deploy/rpm/RPMS
mkdir -p "$DEST"
find "$TOPDIR/RPMS" -name "*.rpm" -exec cp {} "$DEST/" \;

echo ""
echo "===== 결과 ====="
ls -lh "$DEST/"lumina*.rpm

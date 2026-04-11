#!/bin/bash
set -euo pipefail

SRC="/tmp/agent_deploy"
TOPDIR="/tmp/lumina-agent-rpm"
rm -rf "$TOPDIR"
mkdir -p "$TOPDIR"/{BUILD,RPMS,SOURCES,SPECS,SRPMS,BUILDROOT}

SOURCES="$TOPDIR/SOURCES"
mkdir -p "$SOURCES/common" "$SOURCES/linux/collectors"

cp "$SRC/common/__init__.py"   "$SOURCES/common/"
cp "$SRC/common/config.py"     "$SOURCES/common/"
cp "$SRC/common/collector.py"  "$SOURCES/common/"

cp "$SRC/linux/__init__.py"               "$SOURCES/linux/"
cp "$SRC/linux/agent.py"                  "$SOURCES/linux/"
cp "$SRC/linux/blossom-agent.service"     "$SOURCES/linux/"
cp "$SRC/linux/lumina-agent"              "$SOURCES/linux/"
cp "$SRC/linux/collectors/__init__.py"    "$SOURCES/linux/collectors/"
cp "$SRC/linux/collectors/interface.py"   "$SOURCES/linux/collectors/"
cp "$SRC/linux/collectors/account.py"     "$SOURCES/linux/collectors/"
cp "$SRC/linux/collectors/package.py"     "$SOURCES/linux/collectors/"

cp "$SRC/linux/agent.conf.default" "$SOURCES/"

SPEC="$SRC/linux/blossom-agent.spec"

echo "===== Building lumina-agent RPM ====="
rpmbuild --define "_topdir $TOPDIR" -bb "$SPEC" 2>&1
echo ""
echo "===== Complete ====="
find "$TOPDIR/RPMS" -name "*.rpm" -exec echo "  -> {}" \;

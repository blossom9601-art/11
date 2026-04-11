#!/bin/bash
set -euo pipefail

TOPDIR=/tmp/lumina-rpm-build/rpmbuild
DEST=/mnt/c/Users/ME/Desktop/blossom/deploy/rpm/RPMS
mkdir -p "$DEST"

# Refresh nginx config source with latest fix
cp /mnt/c/Users/ME/Desktop/blossom/deploy/nginx/lumina.conf "$TOPDIR/SOURCES/nginx/lumina.conf"
dos2unix -q "$TOPDIR/SOURCES/nginx/lumina.conf" 2>/dev/null || true

echo "===== DB Init RPM ====="
rpmbuild --define "_topdir $TOPDIR" --define "dist %{nil}" \
    -bb "$TOPDIR/SPECS/blossom-lumina-db-init.spec" 2>&1

echo ""
echo "===== AP RPM ====="
rpmbuild --define "_topdir $TOPDIR" --define "dist %{nil}" \
    -bb "$TOPDIR/SPECS/blossom-lumina-ap.spec" 2>&1

echo ""
echo "===== WEB RPM ====="
rpmbuild --define "_topdir $TOPDIR" --define "dist %{nil}" \
    -bb "$TOPDIR/SPECS/blossom-lumina-web.spec" 2>&1

echo ""
echo "===== 전체 결과 ====="
ls -lh "$TOPDIR/RPMS/noarch/"

# Windows로 복사
cp "$TOPDIR/RPMS/noarch/"*.rpm "$DEST/"
cp /mnt/c/Users/ME/Desktop/blossom/agents/linux/dist/lumina-agent* "$DEST/" 2>/dev/null || true
echo ""
echo "===== deploy/rpm/RPMS/ ====="
ls -lh "$DEST/"

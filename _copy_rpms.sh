#!/bin/bash
DEST=/mnt/c/Users/ME/Desktop/blossom/deploy/rpm/RPMS
rm -rf "$DEST"
mkdir -p "$DEST"
cp /tmp/lumina-rpm-build/rpmbuild/RPMS/noarch/*.rpm "$DEST/"
cp /mnt/c/Users/ME/Desktop/blossom/agents/linux/rpmbuild/RPMS/lumina-1.0.0-1.el8.noarch.rpm "$DEST/" 2>/dev/null || true
echo "=== 전체 RPM 결과물 ==="
ls -lh "$DEST/"

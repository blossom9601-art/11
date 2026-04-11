#!/bin/bash
DEST=/mnt/c/Users/ME/Desktop/blossom/deploy/rpm/RPMS
rm -rf "$DEST"
mkdir -p "$DEST"

# 서버 RPM (Common, DB, AP, WEB)
cp /tmp/lumina-rpm-build/rpmbuild/RPMS/noarch/*.rpm "$DEST/" 2>/dev/null || true

# 에이전트 RPM + DEB
cp /mnt/c/Users/ME/Desktop/blossom/agents/linux/dist/lumina-agent-*.rpm "$DEST/" 2>/dev/null || true
cp /mnt/c/Users/ME/Desktop/blossom/agents/linux/dist/lumina-agent_*.deb "$DEST/" 2>/dev/null || true

echo "=== 전체 패키지 결과물 ==="
ls -lh "$DEST/"

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SPEC="$SCRIPT_DIR/blossom-agent.spec"
VERSION="1.2.1"

TOPDIR="$AGENT_ROOT/rpmbuild"
rm -rf "$TOPDIR"
mkdir -p "$TOPDIR"/{BUILD,RPMS,SOURCES,SPECS,SRPMS}

SRC="$TOPDIR/SOURCES"

mkdir -p "$SRC/common"
cp "$AGENT_ROOT/common/__init__.py" "$SRC/common/" 2>/dev/null || touch "$SRC/common/__init__.py"
cp "$AGENT_ROOT/common/config.py" "$SRC/common/"
cp "$AGENT_ROOT/common/collector.py" "$SRC/common/"
cp "$AGENT_ROOT/common/account_worker_protocol.py" "$SRC/common/"
cp "$AGENT_ROOT/common/account_policy.py" "$SRC/common/"

mkdir -p "$SRC/linux/collectors" "$SRC/linux/root_worker"
cp "$AGENT_ROOT/linux/__init__.py" "$SRC/linux/" 2>/dev/null || touch "$SRC/linux/__init__.py"
cp "$AGENT_ROOT/linux/agent.py" "$SRC/linux/"
cp "$AGENT_ROOT/linux/account_worker_client.py" "$SRC/linux/"
cp "$AGENT_ROOT/linux/account_dispatch.py" "$SRC/linux/"
cp "$AGENT_ROOT/linux/root_worker/__init__.py" "$SRC/linux/root_worker/"
cp "$AGENT_ROOT/linux/root_worker/executor.py" "$SRC/linux/root_worker/"
cp "$AGENT_ROOT/linux/root_worker/main.py" "$SRC/linux/root_worker/"
cp "$AGENT_ROOT/linux/blossom-agent.service" "$SRC/linux/"
cp "$AGENT_ROOT/linux/lumina-account-worker.service" "$SRC/linux/"
cp "$AGENT_ROOT/linux/lumina-agent" "$SRC/linux/"
cp "$AGENT_ROOT/linux/collectors/__init__.py" "$SRC/linux/collectors/" 2>/dev/null || touch "$SRC/linux/collectors/__init__.py"
cp "$AGENT_ROOT/linux/collectors/interface.py" "$SRC/linux/collectors/"
cp "$AGENT_ROOT/linux/collectors/account.py" "$SRC/linux/collectors/"
cp "$AGENT_ROOT/linux/collectors/authority.py" "$SRC/linux/collectors/"
cp "$AGENT_ROOT/linux/collectors/firewalld.py" "$SRC/linux/collectors/"
cp "$AGENT_ROOT/linux/collectors/storage.py" "$SRC/linux/collectors/"
cp "$AGENT_ROOT/linux/collectors/package.py" "$SRC/linux/collectors/"
cp "$AGENT_ROOT/linux/collectors/performance.py" "$SRC/linux/collectors/"

cp "$SCRIPT_DIR/agent.conf.default" "$SRC/"

echo "===== RPM build start (v${VERSION}) ====="
rpmbuild --define "_topdir $TOPDIR" -bb "$SPEC"

echo ""
echo "===== RPM build complete ====="
find "$TOPDIR/RPMS" -name "*.rpm" -exec echo "  -> {}" \;

#!/usr/bin/env bash
# Lumina 에이전트 업그레이드/롤백 스크립트 (Linux)
# 사용법:
#   sudo bash upgrade_lumina_agent.sh --source /tmp/lumina-agent
#   sudo bash upgrade_lumina_agent.sh --rollback /var/backups/lumina-agent/20260412_123000

set -euo pipefail

INSTALL_DIR="/opt/lumina"
CONF_FILE="/etc/lumina/lumina.conf"
SERVICE_NAME="lumina"
BACKUP_ROOT="/var/backups/lumina-agent"
SOURCE_DIR=""
ROLLBACK_DIR=""

detect_service_name() {
    if systemctl list-unit-files | grep -q '^lumina.service'; then
        echo "lumina"
        return
    fi
    if systemctl list-unit-files | grep -q '^lumina-agent.service'; then
        echo "lumina-agent"
        return
    fi
    echo ""
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --source)
            SOURCE_DIR="$2"
            shift 2
            ;;
        --rollback)
            ROLLBACK_DIR="$2"
            shift 2
            ;;
        *)
            echo "Unknown arg: $1"
            exit 1
            ;;
    esac
done

mkdir -p "$BACKUP_ROOT"

backup_current() {
    local stamp
    stamp="$(date +%Y%m%d_%H%M%S)"
    local bdir="$BACKUP_ROOT/$stamp"
    mkdir -p "$bdir"
    if [[ -d "$INSTALL_DIR" ]]; then
        cp -a "$INSTALL_DIR" "$bdir/"
    fi
    if [[ -f "$CONF_FILE" ]]; then
        mkdir -p "$bdir/etc/lumina"
        cp -a "$CONF_FILE" "$bdir/etc/lumina/lumina.conf"
    fi
    echo "$bdir"
}

restore_from_backup() {
    local bdir="$1"
    if [[ ! -d "$bdir" ]]; then
        echo "Backup not found: $bdir"
        exit 1
    fi

    local svc
    svc="$(detect_service_name)"
    if [[ -n "$svc" ]]; then
        systemctl stop "$svc" || true
    fi

    if [[ -d "$bdir/lumina" ]]; then
        rm -rf "$INSTALL_DIR"
        cp -a "$bdir/lumina" "$INSTALL_DIR"
    elif [[ -d "$bdir/opt/lumina" ]]; then
        rm -rf "$INSTALL_DIR"
        cp -a "$bdir/opt/lumina" "$INSTALL_DIR"
    fi

    if [[ -f "$bdir/etc/lumina/lumina.conf" ]]; then
        mkdir -p /etc/lumina
        cp -a "$bdir/etc/lumina/lumina.conf" "$CONF_FILE"
    fi

    systemctl daemon-reload
    svc="$(detect_service_name)"
    if [[ -n "$svc" ]]; then
        systemctl start "$svc"
        systemctl is-active "$svc"
    else
        echo "서비스 유닛이 없습니다. 설치 후 시작하세요."
    fi
    echo "Rollback done: $bdir"
}

upgrade_from_source() {
    local src="$1"
    if [[ -z "$src" || ! -d "$src" ]]; then
        echo "Valid --source path is required"
        exit 1
    fi

    local bdir
    bdir="$(backup_current)"
    echo "Backup saved: $bdir"

    local svc
    svc="$(detect_service_name)"
    if [[ -n "$svc" ]]; then
        systemctl stop "$svc" || true
    fi

    mkdir -p "$INSTALL_DIR"
    cp -a "$src/common" "$INSTALL_DIR/"
    cp -a "$src/linux" "$INSTALL_DIR/"

    if [[ -f "$src/linux/blossom-agent.service" ]]; then
        cp -a "$src/linux/blossom-agent.service" /etc/systemd/system/lumina.service
    fi

    systemctl daemon-reload
    svc="$(detect_service_name)"
    if [[ -n "$svc" ]]; then
        systemctl enable "$svc" >/dev/null 2>&1 || true
        systemctl start "$svc"
        systemctl is-active "$svc"
    else
        echo "서비스 유닛이 없습니다. install.sh를 먼저 실행하세요."
    fi

    echo "Upgrade done from: $src"
    echo "Rollback backup: $bdir"
}

if [[ -n "$ROLLBACK_DIR" ]]; then
    restore_from_backup "$ROLLBACK_DIR"
else
    upgrade_from_source "$SOURCE_DIR"
fi
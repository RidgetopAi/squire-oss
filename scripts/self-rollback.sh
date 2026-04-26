#!/usr/bin/env bash
# self-rollback.sh - Manual rollback to last backup
#
# Usage: sudo bash /opt/squire/scripts/self-rollback.sh
#
# Restores /opt/squire from /opt/squire-backup (created by self-deploy.sh)

set -euo pipefail

PRODUCTION="/opt/squire"
BACKUP="/opt/squire-backup"
DEPLOY_LOG="/var/log/squire-deploy.log"

log() { echo "[rollback] $(date '+%H:%M:%S') $1"; }

[ -d "$BACKUP/dist" ] || { log "ERROR: No backup found at $BACKUP"; exit 1; }

log "Rolling back to backup..."

cp -a "$BACKUP/dist/" "$PRODUCTION/dist/"
cp "$BACKUP/package.json" "$PRODUCTION/package.json"
cp "$BACKUP/tsconfig.json" "$PRODUCTION/tsconfig.json"
[ -d "$BACKUP/src" ] && cp -a "$BACKUP/src/" "$PRODUCTION/src/"

log "Restarting Squire..."
systemctl restart squire

sleep 5

if curl -sf "http://localhost:3001/api/health" > /dev/null 2>&1; then
  log "✓ Rollback successful - Squire is healthy"
  echo "$(date '+%Y-%m-%d %H:%M:%S') Manual rollback successful" >> "$DEPLOY_LOG"
else
  log "✗ Squire still unhealthy after rollback"
  log "  Check: journalctl -u squire -n 50"
  echo "$(date '+%Y-%m-%d %H:%M:%S') Manual rollback - health check failed" >> "$DEPLOY_LOG"
  exit 1
fi

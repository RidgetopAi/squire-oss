#!/usr/bin/env bash
# self-rollback.sh - Manual rollback to last backup
#
# Usage: sudo bash scripts/self-rollback.sh
#
# Restores production from backup (created by self-deploy.sh)

set -euo pipefail

PRODUCTION="${SQUIRE_PRODUCTION_DIR:-/opt/squire}"
BACKUP="${SQUIRE_BACKUP_DIR:-/opt/squire-backup}"
DEPLOY_LOG="${SQUIRE_DEPLOY_LOG:-/var/log/squire-deploy.log}"
PROD_PORT="${SQUIRE_PROD_PORT:-3001}"
SERVICE_NAME="${SQUIRE_SERVICE_NAME:-squire}"

log() { echo "[rollback] $(date '+%H:%M:%S') $1"; }

[ -d "$BACKUP/dist" ] || { log "ERROR: No backup found at $BACKUP"; exit 1; }

log "Rolling back to backup..."

cp -a "$BACKUP/dist/" "$PRODUCTION/dist/"
cp "$BACKUP/package.json" "$PRODUCTION/package.json"
cp "$BACKUP/tsconfig.json" "$PRODUCTION/tsconfig.json"
[ -d "$BACKUP/src" ] && cp -a "$BACKUP/src/" "$PRODUCTION/src/"

log "Restarting Squire..."
systemctl restart "$SERVICE_NAME"

sleep 5

if curl -sf "http://localhost:$PROD_PORT/api/health" > /dev/null 2>&1; then
  log "✓ Rollback successful - Squire is healthy"
  echo "$(date '+%Y-%m-%d %H:%M:%S') Manual rollback successful" >> "$DEPLOY_LOG"
else
  log "✗ Squire still unhealthy after rollback"
  log "  Check: journalctl -u $SERVICE_NAME -n 50"
  echo "$(date '+%Y-%m-%d %H:%M:%S') Manual rollback - health check failed" >> "$DEPLOY_LOG"
  exit 1
fi

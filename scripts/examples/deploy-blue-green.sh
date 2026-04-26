#!/usr/bin/env bash
#
# Squire — Blue-Green Deploy (Example)
#
# Pattern:
#   1. Pull latest into staging
#   2. Build TypeScript (fail fast)
#   3. Start a smoke-test instance on $SQUIRE_SMOKE_PORT
#   4. Health-check the smoke instance
#   5. Backup current production
#   6. Sync staging → production
#   7. Restart the systemd service via a one-shot unit
#   8. Health-check production; auto-rollback if unhealthy
#
# Usage:  sudo bash deploy-blue-green.sh [--dry-run] [--skip-web]
#
# Required env (set in your shell or a deploy.env file):
#   SQUIRE_PRODUCTION_DIR   default: /opt/squire
#   SQUIRE_STAGING_DIR      default: /opt/squire-staging
#   SQUIRE_BACKUP_DIR       default: /opt/squire-backup
#   SQUIRE_SERVICE_NAME     default: squire
#   SQUIRE_DEPLOY_LOG       default: /var/log/squire-deploy.log
#   SQUIRE_HEALTH_URL       default: http://localhost:3000/api/health
#   SQUIRE_SMOKE_PORT       default: 3099
#
# This is a TEMPLATE. Read it before running. Test in a non-production
# environment first.

set -euo pipefail

PROD_DIR="${SQUIRE_PRODUCTION_DIR:-/opt/squire}"
STAGE_DIR="${SQUIRE_STAGING_DIR:-/opt/squire-staging}"
BACKUP_DIR="${SQUIRE_BACKUP_DIR:-/opt/squire-backup}"
SERVICE="${SQUIRE_SERVICE_NAME:-squire}"
LOG="${SQUIRE_DEPLOY_LOG:-/var/log/squire-deploy.log}"
HEALTH_URL="${SQUIRE_HEALTH_URL:-http://localhost:3000/api/health}"
SMOKE_PORT="${SQUIRE_SMOKE_PORT:-3099}"

DRY_RUN=false
SKIP_WEB=false
for arg in "$@"; do
  case "$arg" in
    --dry-run)  DRY_RUN=true ;;
    --skip-web) SKIP_WEB=true ;;
  esac
done

log() { echo "[$(date -Iseconds)] $*" | tee -a "$LOG"; }

log "=== Squire deploy starting ==="
log "Production: $PROD_DIR  Staging: $STAGE_DIR  Service: $SERVICE"

# ---- 1. Build in staging ---------------------------------------------------
log "[1/8] Building TypeScript in staging…"
( cd "$STAGE_DIR" && npx tsc )

if [ "$SKIP_WEB" = false ] && [ -d "$STAGE_DIR/web" ]; then
  log "[2/8] Building web frontend…"
  ( cd "$STAGE_DIR/web" && pnpm build )
fi

# ---- 2. Smoke test ---------------------------------------------------------
log "[3/8] Starting smoke-test instance on port $SMOKE_PORT…"
( cd "$STAGE_DIR" && PORT="$SMOKE_PORT" node dist/api/server.js >/tmp/squire-smoke.log 2>&1 ) &
SMOKE_PID=$!
sleep 5

log "[4/8] Health-checking smoke instance…"
if ! curl -fsS "http://localhost:$SMOKE_PORT/api/health" >/dev/null; then
  log "FAIL: smoke instance failed health check"
  kill "$SMOKE_PID" || true
  tail -50 /tmp/squire-smoke.log | tee -a "$LOG"
  exit 1
fi
log "OK: smoke health passed"
kill "$SMOKE_PID" || true
wait "$SMOKE_PID" 2>/dev/null || true

if [ "$DRY_RUN" = true ]; then
  log "DRY-RUN: skipping production swap"
  exit 0
fi

# ---- 3. Backup production --------------------------------------------------
log "[5/8] Backing up production to $BACKUP_DIR…"
rm -rf "$BACKUP_DIR"
cp -a "$PROD_DIR" "$BACKUP_DIR"

# ---- 4. Sync staging → production -----------------------------------------
log "[6/8] Syncing staging → production…"
rsync -a --delete \
  --exclude='.env' \
  --exclude='node_modules/' \
  --exclude='/data/' \
  "$STAGE_DIR/" "$PROD_DIR/"

# ---- 5. Restart via independent systemd unit ------------------------------
log "[7/8] Scheduling systemd restart of $SERVICE…"
systemd-run --on-active=2s "/bin/systemctl" "restart" "$SERVICE"

# Give it time to come back up
sleep 10

# ---- 6. Production health check + rollback --------------------------------
log "[8/8] Health-checking production…"
if curl -fsS "$HEALTH_URL" >/dev/null; then
  log "SUCCESS: deploy complete and production healthy"
else
  log "FAIL: production unhealthy after restart — rolling back"
  rsync -a --delete "$BACKUP_DIR/" "$PROD_DIR/"
  systemd-run --on-active=2s "/bin/systemctl" "restart" "$SERVICE"
  log "Rollback initiated. Check logs: journalctl -u $SERVICE -n 100"
  exit 1
fi

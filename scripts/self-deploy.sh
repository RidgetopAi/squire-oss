#!/usr/bin/env bash
# self-deploy.sh - Blue-green self-deployment for Squire
#
# Usage: sudo bash scripts/self-deploy.sh [--skip-web] [--dry-run]
#
# Called by Squire's agent after making changes in staging.
#
# Workflow:
#   1. Acquire deploy lock (prevent concurrent deploys)
#   2. Build TypeScript in staging
#   3. Smoke test staging API on temp port
#   4. Backup current production dist
#   5. Sync staging → production
#   6. Schedule independent restart + verify + auto-rollback
#
# The restart runs in a separate systemd unit (survives Squire's death).
# If production doesn't come back healthy, it auto-rolls back.

set -euo pipefail

# Configurable paths — override via environment variables
STAGING="${SQUIRE_STAGING_DIR:-/opt/squire-staging}"
PRODUCTION="${SQUIRE_PRODUCTION_DIR:-/opt/squire}"
BACKUP="${SQUIRE_BACKUP_DIR:-/opt/squire-backup}"
TEST_PORT="${SQUIRE_TEST_PORT:-3099}"
HEALTH_TIMEOUT="${SQUIRE_HEALTH_TIMEOUT:-30}"
PROD_PORT="${SQUIRE_PROD_PORT:-3001}"
DEPLOY_LOG="${SQUIRE_DEPLOY_LOG:-/var/log/squire-deploy.log}"
LOCK_FILE="/tmp/squire-deploy.lock"
SERVICE_NAME="${SQUIRE_SERVICE_NAME:-squire}"
WEB_SERVICE_NAME="${SQUIRE_WEB_SERVICE_NAME:-squire-web}"

SKIP_WEB=false
DRY_RUN=false

for arg in "$@"; do
  case $arg in
    --skip-web) SKIP_WEB=true ;;
    --dry-run) DRY_RUN=true ;;
  esac
done

log() { echo "[deploy] $(date '+%H:%M:%S') $1"; }
die() { log "ERROR: $1"; exit 1; }

# --- Step 0: Deploy lock ---
# Prevent concurrent deploys. Lock auto-expires after 5 minutes (stale protection).
if [ -f "$LOCK_FILE" ]; then
  lock_age=$(( $(date +%s) - $(stat -c %Y "$LOCK_FILE") ))
  if [ "$lock_age" -lt 300 ]; then
    log "Deploy already in progress (lock age: ${lock_age}s). Skipping."
    log "If stuck, remove: rm $LOCK_FILE"
    exit 0
  else
    log "Stale lock detected (${lock_age}s old). Removing."
    rm -f "$LOCK_FILE"
  fi
fi

# Check if a deploy-restart unit is already running
if systemctl is-active ${SERVICE_NAME}-deploy-restart.service >/dev/null 2>&1; then
  log "Deploy restart already in progress (${SERVICE_NAME}-deploy-restart.service active). Skipping."
  exit 0
fi

# Acquire lock
echo "$$" > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

# Verify staging exists
[ -d "$STAGING" ] || die "Staging not found. Run: sudo bash scripts/setup-staging.sh"
[ -f "$STAGING/package.json" ] || die "Staging doesn't look like a Squire project"
[ -d "$STAGING/node_modules" ] || die "Staging missing node_modules. Run: cd $STAGING && npm install"

log "=== Squire Self-Deploy ==="

# --- Step 1: Build ---
log "[1/5] Building TypeScript in staging..."
cd "$STAGING"
npx tsc || die "TypeScript build failed"
log "✓ Build successful"

# --- Step 2: Smoke test ---
log "[2/5] Smoke test on port $TEST_PORT..."

# Ensure .env is available for smoke test (use production .env)
cp "$PRODUCTION/.env" "$STAGING/.env" 2>/dev/null || true

# Kill any leftover test server
fuser -k "$TEST_PORT/tcp" 2>/dev/null || true
sleep 1

# Start staging API on test port
PORT=$TEST_PORT node dist/api/server.js &
SMOKE_PID=$!

# Wait for healthy response
HEALTHY=false
for i in $(seq 1 $HEALTH_TIMEOUT); do
  if curl -sf "http://localhost:$TEST_PORT/api/health" > /dev/null 2>&1; then
    HEALTHY=true
    break
  fi
  sleep 1
done

# Kill smoke test server
kill $SMOKE_PID 2>/dev/null || true
wait $SMOKE_PID 2>/dev/null || true

[ "$HEALTHY" = "true" ] || die "Smoke test failed - API didn't respond healthy within ${HEALTH_TIMEOUT}s"
log "✓ Smoke test passed"

# --- Dry run exit ---
if [ "$DRY_RUN" = "true" ]; then
  log "DRY RUN complete - would sync and restart. Exiting."
  exit 0
fi

# --- Step 3: Backup production ---
log "[3/5] Backing up current production..."
rm -rf "$BACKUP"
mkdir -p "$BACKUP"
cp -a "$PRODUCTION/dist" "$BACKUP/dist"
cp "$PRODUCTION/package.json" "$BACKUP/package.json"
cp "$PRODUCTION/tsconfig.json" "$BACKUP/tsconfig.json"
[ -d "$PRODUCTION/src" ] && cp -a "$PRODUCTION/src" "$BACKUP/src"
log "✓ Backup saved to $BACKUP"

# --- Step 4: Sync to production ---
log "[4/5] Syncing staging → production..."

# Sync compiled output
rsync -a --delete "$STAGING/dist/" "$PRODUCTION/dist/"

# Sync source (for future builds from production)
rsync -a --delete "$STAGING/src/" "$PRODUCTION/src/"

# Sync project config
cp "$STAGING/package.json" "$PRODUCTION/package.json"
cp "$STAGING/tsconfig.json" "$PRODUCTION/tsconfig.json"

# If package.json dependencies changed, install
if ! diff -q "$BACKUP/package.json" "$PRODUCTION/package.json" > /dev/null 2>&1; then
  log "  package.json changed - running npm install..."
  cd "$PRODUCTION" && npm install --omit=dev
fi

# Sync web if applicable
if [ "$SKIP_WEB" = "false" ] && [ -d "$STAGING/web/src" ]; then
  STAGING_WEB_HASH=$(find "$STAGING/web/src" -type f -exec md5sum {} + 2>/dev/null | sort | md5sum | cut -d' ' -f1)
  PROD_WEB_HASH=$(find "$PRODUCTION/web/src" -type f -exec md5sum {} + 2>/dev/null | sort | md5sum | cut -d' ' -f1)

  if [ "$STAGING_WEB_HASH" != "$PROD_WEB_HASH" ]; then
    log "  Web source changed - syncing and rebuilding..."
    rsync -a --delete \
      --exclude='node_modules' \
      --exclude='.next' \
      "$STAGING/web/" "$PRODUCTION/web/"
    cd "$PRODUCTION/web"
    if [ -f "pnpm-lock.yaml" ]; then
      pnpm install && pnpm build
    else
      npm install && npm run build
    fi
  fi
fi

log "✓ Synced to production"

# --- Step 5: Schedule restart (independent of Squire's cgroup) ---
log "[5/5] Scheduling restart with health verification..."

# Stop any leftover deploy-restart unit from a previous failed deploy
systemctl stop ${SERVICE_NAME}-deploy-restart.service 2>/dev/null || true
systemctl reset-failed ${SERVICE_NAME}-deploy-restart.service 2>/dev/null || true

# The restart + verify + rollback all happen in a separate systemd transient unit.
# This survives Squire's own process being killed during restart.
if ! systemd-run --unit=${SERVICE_NAME}-deploy-restart --no-block \
  bash -c "
    sleep 2
    echo \"\$(date '+%Y-%m-%d %H:%M:%S') Starting restart...\" >> $DEPLOY_LOG

    # Force-stop squire quickly (don't wait for graceful shutdown of agent loop)
    systemctl kill -s SIGTERM $SERVICE_NAME
    sleep 3
    # If still alive after 3s, SIGKILL
    if systemctl is-active ${SERVICE_NAME}.service >/dev/null 2>&1; then
      systemctl kill -s SIGKILL $SERVICE_NAME
      sleep 1
    fi
    systemctl start $SERVICE_NAME
    systemctl restart $WEB_SERVICE_NAME

    # Wait for production to come back healthy
    HEALTHY=false
    for i in \$(seq 1 $HEALTH_TIMEOUT); do
      if curl -sf http://localhost:$PROD_PORT/api/health > /dev/null 2>&1; then
        HEALTHY=true
        break
      fi
      sleep 1
    done

    if [ \"\$HEALTHY\" = \"true\" ]; then
      echo \"\$(date '+%Y-%m-%d %H:%M:%S') ✓ Deploy verified healthy\" >> $DEPLOY_LOG

      # Auto-commit and push changes to git
      cd $PRODUCTION
      if [ -n \"\$(git status --porcelain 2>/dev/null)\" ]; then
        echo \"\$(date '+%Y-%m-%d %H:%M:%S') Git: committing deploy changes...\" >> $DEPLOY_LOG
        git add -A
        SUMMARY=\$(git diff --cached --stat | tail -1)
        git commit -m \"auto-deploy: \$(date '+%Y-%m-%d %H:%M:%S')

\$SUMMARY

Deployed by Squire self-deploy pipeline.\" 2>> $DEPLOY_LOG
        git push origin main 2>> $DEPLOY_LOG && \
          echo \"\$(date '+%Y-%m-%d %H:%M:%S') Git: pushed to origin\" >> $DEPLOY_LOG || \
          echo \"\$(date '+%Y-%m-%d %H:%M:%S') Git: push failed (non-fatal)\" >> $DEPLOY_LOG
      else
        echo \"\$(date '+%Y-%m-%d %H:%M:%S') Git: no changes to commit\" >> $DEPLOY_LOG
      fi
    else
      echo \"\$(date '+%Y-%m-%d %H:%M:%S') ✗ UNHEALTHY - rolling back\" >> $DEPLOY_LOG
      cp -a $BACKUP/dist/ $PRODUCTION/dist/
      cp $BACKUP/package.json $PRODUCTION/package.json
      [ -d $BACKUP/src ] && cp -a $BACKUP/src/ $PRODUCTION/src/
      systemctl restart $SERVICE_NAME
      sleep 10
      if curl -sf http://localhost:$PROD_PORT/api/health > /dev/null 2>&1; then
        echo \"\$(date '+%Y-%m-%d %H:%M:%S') ✓ Rollback successful\" >> $DEPLOY_LOG
      else
        echo \"\$(date '+%Y-%m-%d %H:%M:%S') ✗ Rollback FAILED - manual intervention needed\" >> $DEPLOY_LOG
      fi
    fi

    # Clean up deploy lock
    rm -f $LOCK_FILE
  "; then
  log "ERROR: Failed to schedule restart unit"
  die "systemd-run failed - check: systemctl status ${SERVICE_NAME}-deploy-restart"
fi

log "✓ Restart scheduled (fires in 2 seconds)"
log ""
log "=== Deploy initiated ==="
log "  Monitor: tail -f $DEPLOY_LOG"
log "  Status:  systemctl status $SERVICE_NAME"
log "  Backup:  $BACKUP (auto-rollback on failure)"

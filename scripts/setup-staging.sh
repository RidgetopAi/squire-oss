#!/usr/bin/env bash
# setup-staging.sh - One-time setup for Squire staging environment
#
# Usage: sudo bash scripts/setup-staging.sh
#
# Creates a staging copy of the production codebase.
# Changes are made here, then self-deploy.sh handles the swap.

set -euo pipefail

PRODUCTION="${SQUIRE_PRODUCTION_DIR:-/opt/squire}"
STAGING="${SQUIRE_STAGING_DIR:-/opt/squire-staging}"
SQUIRE_USER="${SQUIRE_RUN_USER:-$(whoami)}"

log() { echo "[setup] $1"; }

if [ -d "$STAGING" ] && [ -f "$STAGING/package.json" ]; then
  log "Staging already exists. Refreshing from production..."
else
  log "Creating staging directory..."
  mkdir -p "$STAGING"
fi

# Sync from production (excluding runtime/state files)
log "Syncing from production..."
rsync -a --delete \
  --exclude='.env' \
  --exclude='storage' \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='web/node_modules' \
  --exclude='web/.next' \
  --exclude='debug-images' \
  --exclude='*.jsonl' \
  "$PRODUCTION/" "$STAGING/"

# Copy .env for builds (smoke test needs it)
cp "$PRODUCTION/.env" "$STAGING/.env"

# Install dependencies
log "Installing dependencies..."
cd "$STAGING"
npm install

# Install web dependencies if web exists
if [ -d "$STAGING/web" ] && [ -f "$STAGING/web/package.json" ]; then
  log "Installing web dependencies..."
  cd "$STAGING/web"
  if [ -f "pnpm-lock.yaml" ]; then
    pnpm install
  else
    npm install
  fi
fi

# Set ownership
chown -R "$SQUIRE_USER:$SQUIRE_USER" "$STAGING"

log ""
log "=== Staging ready ==="
log "  Path:    $STAGING"
log "  Usage:   Make changes here, then run self-deploy.sh"
log ""
log "  To refresh staging from production:"
log "    sudo bash scripts/setup-staging.sh"

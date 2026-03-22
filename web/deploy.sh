#!/bin/bash
# Deploy Squire Web to remote server
# Syncs source files and builds on server (to pick up server-side env vars)
#
# Configure via environment variables:
#   SQUIRE_SSH_HOST - SSH host alias or address (required)
#   SQUIRE_PRODUCTION_DIR - Remote production directory (default: /opt/squire)
#   SQUIRE_WEB_SERVICE_NAME - Systemd service name (default: squire-web)

set -e

SSH_HOST="${SQUIRE_SSH_HOST:?Set SQUIRE_SSH_HOST to your server's SSH host}"
PROD_DIR="${SQUIRE_PRODUCTION_DIR:-/opt/squire}"
WEB_SERVICE="${SQUIRE_WEB_SERVICE_NAME:-squire-web}"

echo "Syncing source files to $SSH_HOST..."
rsync -avz --delete \
  --exclude='.next' \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='.env.local' \
  ./ "$SSH_HOST:$PROD_DIR/web/"

echo "Building on server..."
ssh "$SSH_HOST" "cd $PROD_DIR/web && npm run build"

echo "Restarting service..."
ssh "$SSH_HOST" "sudo systemctl restart $WEB_SERVICE"

echo "Done! Squire web deployed."

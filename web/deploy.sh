#!/bin/bash
# Deploy Squire Web to VPS
# Syncs source files and builds on server (to pick up server-side env vars)

set -e

echo "Syncing source files to VPS..."
rsync -avz --delete \
  --exclude='.next' \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='.env.local' \
  ./ hetzner:/opt/squire/web/

echo "Building on VPS..."
ssh hetzner "cd /opt/squire/web && npm run build"

echo "Restarting service..."
ssh hetzner "sudo systemctl restart squire-web"

echo "Done! Squire web deployed."

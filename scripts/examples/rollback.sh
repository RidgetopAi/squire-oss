#!/usr/bin/env bash
#
# Squire — Manual Rollback (Example)
#
# Restore the most recent backup taken by deploy-blue-green.sh.
# Usage:  sudo bash rollback.sh

set -euo pipefail

PROD_DIR="${SQUIRE_PRODUCTION_DIR:-/opt/squire}"
BACKUP_DIR="${SQUIRE_BACKUP_DIR:-/opt/squire-backup}"
SERVICE="${SQUIRE_SERVICE_NAME:-squire}"

if [ ! -d "$BACKUP_DIR" ]; then
  echo "No backup found at $BACKUP_DIR" >&2
  exit 1
fi

echo "Rolling back $PROD_DIR from $BACKUP_DIR…"
rsync -a --delete "$BACKUP_DIR/" "$PROD_DIR/"

echo "Restarting $SERVICE…"
systemctl restart "$SERVICE"

sleep 5
systemctl status "$SERVICE" --no-pager | head -20

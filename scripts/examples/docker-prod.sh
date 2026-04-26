#!/usr/bin/env bash
#
# Squire — Docker Production Deploy (Example)
#
# Pull, build, and restart the docker-compose stack. Works with the
# default docker-compose.yml after you've uncommented the api/web/ollama
# services (see docs/CONFIGURATION.md).
#
# Usage:  bash docker-prod.sh [--no-pull] [--no-cache]

set -euo pipefail

PULL=true
NO_CACHE=""
for arg in "$@"; do
  case "$arg" in
    --no-pull)  PULL=false ;;
    --no-cache) NO_CACHE="--no-cache" ;;
  esac
done

if [ "$PULL" = true ]; then
  echo "Pulling latest…"
  git pull --ff-only
fi

echo "Building images…"
docker compose build $NO_CACHE

echo "Starting/restarting stack…"
docker compose up -d

echo "Waiting for health…"
sleep 10
docker compose ps

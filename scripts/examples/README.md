# Deployment Script Examples

Templates for common Squire deployment patterns. Adapt these to your
environment — they're starting points, not production-ready scripts.

## What's here

- **`deploy-blue-green.sh`** — Build in a staging dir, smoke-test on a
  temporary port, sync to production, schedule a systemd restart, and
  auto-rollback if the production health check fails. Useful for keeping
  Squire up across deploys when you self-host on a VPS.

- **`rollback.sh`** — Restore a backup taken by the deploy script.

- **`docker-prod.sh`** — Pull, build, and restart the docker-compose
  stack for users running Squire in containers.

## Configuration

All scripts read from environment variables — no hardcoded paths or
hostnames. Set these in your shell or a `deploy.env` file:

```sh
SQUIRE_PRODUCTION_DIR=/opt/squire
SQUIRE_STAGING_DIR=/opt/squire-staging
SQUIRE_BACKUP_DIR=/opt/squire-backup
SQUIRE_SERVICE_NAME=squire             # systemd unit name
SQUIRE_DEPLOY_LOG=/var/log/squire-deploy.log
SQUIRE_HEALTH_URL=http://localhost:3000/api/health
SQUIRE_SMOKE_PORT=3099                 # temp port for smoke test
```

## Why these are examples, not the real deal

Production deployment is opinionated. Some users run on bare-metal with
systemd; others on Docker Compose; others on Kubernetes; others on a
serverless platform. Rather than ship a single rigid script, these
examples illustrate the pattern (build → smoke → swap → restart →
rollback-on-failure) that you can adapt.

If you want a fully managed deploy pipeline, look at GitHub Actions,
Fly.io, or Render — Squire is a standard Node app and works with all of
them.

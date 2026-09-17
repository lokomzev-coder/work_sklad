#!/bin/bash
# Block T deploy (2026-09-15): daily Postgres backup via the host's crontab
# (not a container itself, so it survives `docker compose down`/rebuilds).
# Keeps 30 days locally — see docs/handbook/linux-server-hardening.md
# point 9 for the "store a copy off-site too" recommendation, not yet
# automated here.
#
# Install: crontab -e, then add (adjust the worksklad path if different):
#   0 3 * * * /home/work-server/worksklad/deploy/backup-db.sh >> /home/work-server/backups/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."

BACKUP_DIR="$HOME/backups"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
STAMP=$(date +%F-%H%M)
DEST="$BACKUP_DIR/worksklad-$STAMP.sql.gz"

# Security audit (2026-09-17): a full DB dump contains client/employee PII —
# world-readable (the old default umask result) is too loose for that, even
# though nothing else on this host reads $HOME as another user.
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U worksklad worksklad \
  | gzip > "$DEST"
chmod 600 "$DEST"

find "$BACKUP_DIR" -name 'worksklad-*.sql.gz' -mtime +30 -delete

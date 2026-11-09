#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

BACKUPS_DIR=/srv/apps/matable/backups
LOCK_FILE=/run/lock/matable-postgres-backup.lock
RETENTION_MINUTES=20160

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Une sauvegarde PostgreSQL MaTable est déjà en cours ; exécution ignorée."
  exit 0
fi

mkdir -p "$BACKUPS_DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
TEMP_BACKUP=$(mktemp "$BACKUPS_DIR/.matable-postgres.XXXXXX.partial")
TEMP_TOKEN=${TEMP_BACKUP##*/}
TEMP_TOKEN=${TEMP_TOKEN#.matable-postgres.}
TEMP_TOKEN=${TEMP_TOKEN%.partial}
BACKUP="$BACKUPS_DIR/matable-postgres-$STAMP-$TEMP_TOKEN.dump"
CHECKSUM="$BACKUP.sha256"
TEMP_CHECKSUM=
BACKUP_PUBLISHED=false
cleanup() {
  rm -f -- "$TEMP_BACKUP"
  if [[ -n "$TEMP_CHECKSUM" ]]; then
    rm -f -- "$TEMP_CHECKSUM"
  fi
  if [[ "$BACKUP_PUBLISHED" != true ]]; then
    rm -f -- "$BACKUP" "$CHECKSUM"
  fi
}
trap cleanup EXIT

TEMP_CHECKSUM=$(mktemp "$BACKUPS_DIR/.matable-postgres-checksum.XXXXXX.partial")
docker exec -u postgres matable-postgres pg_dump -U postgres -d matable -Fc --no-owner --no-acl > "$TEMP_BACKUP"
test -s "$TEMP_BACKUP"
docker exec -i -u postgres matable-postgres pg_restore --list < "$TEMP_BACKUP" >/dev/null
sha256sum "$TEMP_BACKUP" | awk -v file="$(basename "$BACKUP")" '{ print $1 "  " file }' > "$TEMP_CHECKSUM"

mv -- "$TEMP_BACKUP" "$BACKUP"
mv -- "$TEMP_CHECKSUM" "$CHECKSUM"
BACKUP_PUBLISHED=true
echo "Sauvegarde PostgreSQL créée et vérifiée : $BACKUP"

find "$BACKUPS_DIR" -maxdepth 1 -type f -name 'matable-postgres-*.dump' \
  -mmin "+$RETENTION_MINUTES" -exec sh -c '
    for backup do
      rm -f -- "$backup" "$backup.sha256"
    done
  ' sh {} +

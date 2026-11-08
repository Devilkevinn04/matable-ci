#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT=/srv/apps/matable
RELEASES_DIR="$APP_ROOT/releases"
RELEASE_ENV="$APP_ROOT/shared/release.env"
MANAGE_SCRIPT="$APP_ROOT/current/infra/hostinger/manage.sh"
BACKUPS_DIR="$APP_ROOT/backups"
REPOSITORY=https://github.com/Devilkevinn04/matable-ci.git
HEALTH_TIMEOUT_SECONDS=180

exec 9>/run/lock/matable-auto-deploy.lock
if ! flock -n 9; then
  echo "Un déploiement MaTable est déjà en cours ; vérification ignorée."
  exit 0
fi

for required in git docker python3; do
  if ! command -v "$required" >/dev/null 2>&1; then
    echo "Commande requise absente : $required" >&2
    exit 1
  fi
done

if [[ ! -f "$RELEASE_ENV" || ! -f "$MANAGE_SCRIPT" ]]; then
  echo "Configuration Hostinger absente ; déploiement annulé." >&2
  exit 1
fi

REMOTE_SHA=$(git ls-remote "$REPOSITORY" refs/heads/main | awk 'NR == 1 { print $1 }')
if [[ ! "$REMOTE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Impossible de déterminer le dernier commit de main." >&2
  exit 1
fi

IMAGE="matable:${REMOTE_SHA}-hostinger"
SHORT_IMAGE="matable:${REMOTE_SHA:0:7}-hostinger"
CONFIGURED_IMAGE=$(awk -F= '$1 == "MATABLE_IMAGE" { sub(/\r$/, "", $2); print $2 }' "$RELEASE_ENV")
RUNNING_IMAGE=$(docker inspect matable-web --format '{{.Config.Image}}')

if [[ "$CONFIGURED_IMAGE" == "$IMAGE" || "$CONFIGURED_IMAGE" == "$SHORT_IMAGE" ]]; then
  if [[ "$RUNNING_IMAGE" == "$CONFIGURED_IMAGE" ]]; then
    echo "MaTable est déjà déployée sur le commit ${REMOTE_SHA:0:7}."
    exit 0
  fi
  echo "L’image configurée et l’image en service diffèrent ; déploiement annulé." >&2
  exit 1
fi

if [[ "$CONFIGURED_IMAGE" != "$RUNNING_IMAGE" ]]; then
  echo "L’image configurée et l’image en service diffèrent ; déploiement annulé." >&2
  exit 1
fi

RELEASE_DIR="$RELEASES_DIR/$REMOTE_SHA"
TEMP_DIR=
cleanup() {
  if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
    rm -rf -- "$TEMP_DIR"
  fi
}
trap cleanup EXIT

mkdir -p "$RELEASES_DIR" "$BACKUPS_DIR"
if [[ -d "$RELEASE_DIR" ]]; then
  CHECKOUT_SHA=$(git -C "$RELEASE_DIR" rev-parse HEAD)
  if [[ "$CHECKOUT_SHA" != "$REMOTE_SHA" ]]; then
    echo "Le dossier de release existe avec un commit inattendu ; déploiement annulé." >&2
    exit 1
  fi
else
  TEMP_DIR=$(mktemp -d "$RELEASES_DIR/.auto-deploy-${REMOTE_SHA}.XXXXXX")
  git clone --quiet --depth 1 --branch main --single-branch "$REPOSITORY" "$TEMP_DIR/source"
  CHECKOUT_SHA=$(git -C "$TEMP_DIR/source" rev-parse HEAD)
  if [[ "$CHECKOUT_SHA" != "$REMOTE_SHA" ]]; then
    echo "main a changé pendant le téléchargement ; réessayez au prochain passage." >&2
    exit 1
  fi
  mv "$TEMP_DIR/source" "$RELEASE_DIR"
  rm -rf -- "$TEMP_DIR"
  TEMP_DIR=
fi

DOCKERFILE="$RELEASE_DIR/infra/hostinger/Dockerfile"
if [[ ! -f "$DOCKERFILE" ]]; then
  echo "Dockerfile Hostinger absent dans le commit $REMOTE_SHA." >&2
  exit 1
fi

echo "Construction et tests de l’image pour ${REMOTE_SHA:0:7}..."
docker build -f "$DOCKERFILE" -t "$IMAGE" "$RELEASE_DIR"

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
CONFIG_BACKUP="$BACKUPS_DIR/release.env.before-auto-deploy-$STAMP"
cp -p "$RELEASE_ENV" "$CONFIG_BACKUP"

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Image candidate introuvable après la construction." >&2
  exit 1
fi

python3 - "$RELEASE_ENV" "$IMAGE" <<'PY'
import os
import sys
import tempfile
from pathlib import Path

path = Path(sys.argv[1])
image = sys.argv[2]
lines = path.read_text().splitlines()
matches = [index for index, line in enumerate(lines) if line.startswith("MATABLE_IMAGE=")]
if len(matches) != 1:
    raise SystemExit("release.env doit contenir exactement une entrée MATABLE_IMAGE.")
lines[matches[0]] = f"MATABLE_IMAGE={image}"
mode = path.stat().st_mode & 0o777
with tempfile.NamedTemporaryFile("w", dir=path.parent, delete=False) as temporary:
    temporary.write("\n".join(lines) + "\n")
    temporary_path = Path(temporary.name)
os.chmod(temporary_path, mode)
os.replace(temporary_path, path)
PY

rollback() {
  echo "Retour à l’image précédente..."
  cp -p "$CONFIG_BACKUP" "$RELEASE_ENV"
  if ! sh "$MANAGE_SCRIPT" up -d --no-deps web; then
    echo "Échec de la commande de retour arrière ; intervention requise." >&2
    return 1
  fi

  for ((attempt = 0; attempt < HEALTH_TIMEOUT_SECONDS / 2; attempt += 1)); do
    local_status=$(docker inspect matable-web \
      --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || echo missing)
    if [[ "$local_status" == healthy ]]; then
      echo "Version précédente rétablie et saine."
      return 0
    fi
    sleep 2
  done

  echo "Retour arrière lancé, mais le service précédent n’est pas encore sain." >&2
  return 1
}

if ! sh "$MANAGE_SCRIPT" config -q; then
  cp -p "$CONFIG_BACKUP" "$RELEASE_ENV"
  echo "Configuration Docker invalide ; configuration précédente restaurée." >&2
  exit 1
fi

if ! sh "$MANAGE_SCRIPT" up -d --no-deps web; then
  echo "Le lancement de la nouvelle version a échoué." >&2
  rollback
  exit 1
fi

echo "Nouvelle version démarrée ; attente de son contrôle de santé..."
for ((attempt = 0; attempt < HEALTH_TIMEOUT_SECONDS / 2; attempt += 1)); do
  STATUS=$(docker inspect matable-web \
    --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || echo missing)
  if [[ "$STATUS" == healthy ]]; then
    echo "Déploiement réussi : ${REMOTE_SHA:0:7} est en ligne et sain."
    exit 0
  fi
  if [[ "$STATUS" == exited || "$STATUS" == dead || "$STATUS" == missing ]]; then
    echo "La nouvelle version s’est arrêtée ($STATUS)." >&2
    rollback
    exit 1
  fi
  sleep 2
done

echo "La nouvelle version n’est pas devenue saine après ${HEALTH_TIMEOUT_SECONDS}s." >&2
rollback
exit 1

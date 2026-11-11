#!/usr/bin/python3
"""Reconcile MaTable production from Portainer settings and SSH-approved main."""

import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from urllib.error import URLError
from urllib.request import Request, urlopen

ROOT = Path("/srv/apps/matable")
SHARED = ROOT / "shared"
APP_ENV = SHARED / "app.env"
RELEASE_ENV = SHARED / "release.env"
APPROVED_RELEASE = SHARED / "approved-release.sha"
PENDING = SHARED / ".portainer-pending"
FAILED = SHARED / ".portainer-failed"
STATUS = Path("/var/lib/matable-deploy-status/deployment.log")
PRIVATE = ROOT / "portainer-delegate"
PORTAINER = "http://127.0.0.1:9001/api"
MANAGE = ["sh", str(ROOT / "current/infra/hostinger/manage.sh")]
REPOSITORY = "https://github.com/Devilkevinn04/matable-ci.git"
BRANCH = "refs/heads/main"
LEGACY_RELEASE_KEYS = {"MATABLE_RELEASE_SHA", "MATABLE_DEPLOY_RETRY"}
PLATFORM = {
    "APP_URL",
    "DATABASE_URL",
    "HOST",
    "MATABLE_DB_PATH",
    "NODE_ENV",
    "PORT",
    "TRUST_PROXY_HOPS",
    "port",
}
NAME = re.compile(r"[A-Z_][A-Z_0-9]{0,127}")
SHA = re.compile(r"[0-9a-f]{40}")
IMAGE = re.compile(r"matable:([0-9a-f]{7}|[0-9a-f]{40})-hostinger(?:-[0-9a-f]{12})?")


class DeploymentError(Exception):
    """A message safe to show in the production deployment log."""


def run(*args, capture=False, timeout=180, **kwargs):
    return subprocess.run(
        args,
        check=True,
        capture_output=capture,
        timeout=timeout,
        **kwargs,
    )


def report(message):
    STATUS.parent.mkdir(parents=True, exist_ok=True)
    line = f"{datetime.now(timezone.utc):%Y-%m-%d %H:%M:%S UTC}  {message}"
    with STATUS.open("a+b") as log:
        log.seek(0, os.SEEK_END)
        log.seek(max(log.tell() - 1024, 0))
        recent = log.read().decode("utf-8", errors="replace").splitlines()
        if not recent or not recent[-1].endswith(f"  {message}"):
            log.write((line + "\n").encode())
    print(message, flush=True)


def parse_entries(entries, *, reject_duplicates=True):
    result = {}
    for entry in entries:
        key, sep, value = entry.partition("=")
        if (
            not sep
            or (not NAME.fullmatch(key) and key not in PLATFORM)
            or any(character in value for character in "\x00\r\n")
        ):
            raise DeploymentError(
                "Une variable est invalide : utiliser un nom en majuscules et une valeur sur une ligne."
            )
        if key in result and reject_duplicates:
            raise DeploymentError(f"La variable {key} est présente plusieurs fois.")
        result[key] = value
    return result


def read_env(path):
    return parse_entries(
        line
        for line in path.read_text().split("\n")
        if line.strip() and not line.lstrip().startswith("#")
    )


def encode_env(entries):
    return "".join(f"{key}={value}\n" for key, value in entries.items()).encode()


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        dir=path.parent, prefix=f".{path.name}.", delete=False
    ) as handle:
        handle.write(data)
        handle.flush()
        os.fchmod(handle.fileno(), 0o600)
        temporary = Path(handle.name)
    try:
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def remote_main_sha():
    result = run(
        "git",
        "ls-remote",
        "--exit-code",
        REPOSITORY,
        BRANCH,
        capture=True,
        timeout=45,
    ).stdout.decode().split()
    if len(result) != 2 or result[1] != BRANCH or not SHA.fullmatch(result[0]):
        raise DeploymentError("Impossible de déterminer le dernier commit de main.")
    return result[0]


def approve_release(sha):
    if not SHA.fullmatch(sha):
        raise DeploymentError("Fournir le SHA complet (40 caractères hexadécimaux).")
    if remote_main_sha() != sha:
        raise DeploymentError("Le SHA demandé ne correspond pas à la tête actuelle de main.")
    atomic_write(APPROVED_RELEASE, f"{sha}\n".encode())
    FAILED.unlink(missing_ok=True)
    print(f"Révision {sha[:7]} approuvée ; le timer la déploiera.", flush=True)


def approved_release():
    try:
        sha = APPROVED_RELEASE.read_text().strip()
    except FileNotFoundError:
        return None
    if not SHA.fullmatch(sha):
        raise DeploymentError("Le fichier d’approbation du déploiement est invalide.")
    return sha


def get_portainer_stack():
    password = (PRIVATE / "admin-password").read_text().strip()
    stack_id = int((PRIVATE / "stack-id").read_text())
    login = Request(
        f"{PORTAINER}/auth",
        headers={"Content-Type": "application/json"},
        data=json.dumps({"Username": "admin", "Password": password}).encode(),
    )
    try:
        with urlopen(login, timeout=8) as response:
            token = json.load(response)["jwt"]
        request = Request(
            f"{PORTAINER}/stacks/{stack_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        with urlopen(request, timeout=8) as response:
            stack = json.load(response)
    except (URLError, TimeoutError, KeyError, ValueError):
        raise DeploymentError(
            "Paramètres indisponibles : vérifier la connexion à Portainer."
        ) from None
    if stack.get("Name") != "matable-production" or stack.get("Status") != 1:
        raise DeploymentError(
            "Paramètres indisponibles : vérifier que la stack matable-production est active."
        )
    return stack


def desired_settings(active):
    pairs = get_portainer_stack().get("Env")
    if not isinstance(pairs, list) or len(pairs) > 256:
        raise DeploymentError("Format ou taille des paramètres Portainer invalide.")
    entries = []
    for pair in pairs:
        if not isinstance(pair, dict):
            raise DeploymentError("Format des paramètres Portainer invalide.")
        key, value = pair.get("name"), pair.get("value")
        if not isinstance(key, str) or not isinstance(value, str) or not NAME.fullmatch(key):
            raise DeploymentError("Une variable Portainer a un nom invalide.")
        entries.append(f"{key}={value}")
    if sum(map(len, entries)) > 128_000:
        raise DeploymentError("Les paramètres dépassent la taille maximale.")
    supplied = parse_entries(entries)
    for key in LEGACY_RELEASE_KEYS:
        supplied.pop(key, None)
    if "PATH" in supplied:
        raise DeploymentError("PATH est une variable réservée.")
    if supplied.keys() & PLATFORM:
        raise DeploymentError("Une variable réservée au VPS a été ajoutée dans Portainer.")
    settings = {key: value for key, value in active.items() if key in PLATFORM}
    settings.update(supplied)
    if not re.fullmatch(r"[+0-9 ()-]{5,32}", settings.get("VITE_WHATSAPP_ADMIN_PHONE", "")):
        raise DeploymentError("VITE_WHATSAPP_ADMIN_PHONE doit contenir le numéro public.")
    return settings


def build_vars(entries):
    return {key: entries[key] for key in sorted(entries) if key.startswith("VITE_")}


def build_image(sha, variables):
    checkout = ROOT / "releases" / sha
    if not checkout.is_dir():
        with tempfile.TemporaryDirectory(
            dir=checkout.parent, prefix=".portainer-"
        ) as work:
            source = Path(work) / "source"
            run(
                "git",
                "clone",
                "--quiet",
                "--depth",
                "1",
                "--single-branch",
                "--branch",
                "main",
                REPOSITORY,
                str(source),
                timeout=90,
            )
            checked_out = run(
                "git", "-C", str(source), "rev-parse", "HEAD", capture=True
            ).stdout.decode().strip()
            if checked_out != sha:
                raise DeploymentError("La branche main a changé pendant le téléchargement.")
            source.rename(checkout)
    checked_out = run(
        "git", "-C", str(checkout), "rev-parse", "HEAD", capture=True
    ).stdout.decode().strip()
    if checked_out != sha:
        raise DeploymentError("Le dossier de version local ne correspond pas au SHA approuvé.")
    build_hash = hashlib.sha256(encode_env(variables)).hexdigest()[:12]
    image = f"matable:{sha}-hostinger-{build_hash}"
    args = [
        item
        for key, value in variables.items()
        for item in ("--build-arg", f"{key}={value}")
    ]
    report(f"{sha[:7]} : compilation et vérifications Makefile.")
    run(
        "docker",
        "build",
        *args,
        "-f",
        str(checkout / "infra/hostinger/Dockerfile"),
        "-t",
        image,
        str(checkout),
        timeout=1500,
    )
    return image


def backup_database(sha):
    folder = ROOT / "backups"
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    destination = folder / f"pre-release-{stamp}-{sha[:7]}.dump"
    with tempfile.NamedTemporaryFile(dir=folder, prefix=".release-db-") as dump:
        run(
            "docker",
            "exec",
            "-u",
            "postgres",
            "matable-postgres",
            "pg_dump",
            "-U",
            "postgres",
            "-d",
            "matable",
            "-Fc",
            "--no-owner",
            "--no-acl",
            stdout=dump,
            timeout=300,
        )
        dump.seek(0)
        run(
            "docker",
            "exec",
            "-i",
            "-u",
            "postgres",
            "matable-postgres",
            "pg_restore",
            "--list",
            stdin=dump,
            stdout=subprocess.DEVNULL,
            timeout=60,
        )
        shutil.copyfile(dump.name, destination)
        destination.chmod(0o600)


def restore_pending():
    if not PENDING.exists():
        return
    report("Rétablissement de la configuration et de l’image précédentes.")
    for path in (APP_ENV, RELEASE_ENV):
        atomic_write(path, (PENDING / path.name).read_bytes())
    run(
        *MANAGE,
        "up",
        "-d",
        "--no-deps",
        "--wait",
        "--wait-timeout",
        "180",
        "web",
        timeout=240,
    )
    shutil.rmtree(PENDING)
    report("Version précédente rétablie et saine.")


def apply_release(sha, image, config):
    with tempfile.TemporaryDirectory(dir=SHARED, prefix=".rollback-") as directory:
        snapshot = Path(directory) / "previous"
        snapshot.mkdir(mode=0o700)
        for path in (APP_ENV, RELEASE_ENV):
            shutil.copyfile(path, snapshot / path.name)
        snapshot.rename(PENDING)
    try:
        atomic_write(APP_ENV, encode_env(config))
        release = read_env(RELEASE_ENV)
        release["MATABLE_IMAGE"] = image
        atomic_write(RELEASE_ENV, encode_env(release))
        run(*MANAGE, "config", "-q", timeout=30)
        report(f"{sha[:7]} : application de la configuration et contrôle de santé.")
        run(
            *MANAGE,
            "up",
            "-d",
            "--no-deps",
            "--wait",
            "--wait-timeout",
            "180",
            "web",
            timeout=240,
        )
        run(
            "docker",
            "exec",
            "matable-web",
            "node",
            "/app/scripts/check-production-readiness.mjs",
            "--json",
            capture=True,
            timeout=90,
        )
    except (OSError, subprocess.SubprocessError, DeploymentError):
        restore_pending()
        raise
    shutil.rmtree(PENDING)


def reconcile():
    restore_pending()
    requested = approved_release()
    if requested is None:
        report("Publication en attente d’approbation SSH du SHA de main.")
        return
    current = read_env(APP_ENV)
    configured = read_env(RELEASE_ENV).get("MATABLE_IMAGE", "")
    active = run(
        "docker", "inspect", "--format", "{{.Config.Image}}", "matable-web", capture=True
    ).stdout.decode().strip()
    match = IMAGE.fullmatch(active)
    if configured != active or not match:
        raise DeploymentError(
            "L’image active diffère de la configuration du VPS. Intervention requise."
        )
    settings = desired_settings(current)
    same_revision = requested.startswith(match[1])
    if same_revision and settings == current:
        report(f"{requested[:7]} : version et variables à jour.")
        return
    if remote_main_sha() != requested:
        raise DeploymentError(
            f"{requested[:7]} : approuver par SSH le SHA complet actuel de main."
        )
    signature = hashlib.sha256(
        requested.encode() + b"\x00" + encode_env(dict(sorted(settings.items())))
    ).hexdigest().encode()
    if FAILED.exists() and FAILED.read_bytes() == signature:
        report(
            f"{requested[:7]} : demande en échec. Corriger la cause puis réapprouver le SHA par SSH."
        )
        return
    try:
        variables = build_vars(settings)
        image = (
            active
            if same_revision and variables == build_vars(current)
            else build_image(requested, variables)
        )
        if remote_main_sha() != requested or desired_settings(current) != settings:
            report("Une version ou configuration plus récente est disponible ; nouvelle vérification au prochain passage.")
            return
        backup_database(requested)
        apply_release(requested, image, settings)
    except (OSError, subprocess.SubprocessError, DeploymentError):
        atomic_write(FAILED, signature)
        raise
    FAILED.unlink(missing_ok=True)
    report(f"{requested[:7]} : publication réussie, MaTable est saine.")


def main(argv):
    if len(argv) == 2 and argv[0] == "--approve":
        approve_release(argv[1])
        return
    if argv:
        raise DeploymentError("Usage : matable-portainer-deploy [--approve SHA_COMPLET]")
    reconcile()


if __name__ == "__main__":
    os.umask(0o077)
    with open("/run/lock/matable-auto-deploy.lock", "a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit(0)
        try:
            main(sys.argv[1:])
        except DeploymentError as error:
            if len(sys.argv) > 1:
                print(str(error), file=sys.stderr)
            else:
                report(str(error))
            raise SystemExit(1) from None
        except (OSError, subprocess.SubprocessError, ValueError):
            message = "Échec du déploiement. Vérifier le SHA, les variables et le journal du VPS."
            if len(sys.argv) > 1:
                print(message, file=sys.stderr)
            else:
                report(message)
            raise SystemExit(1) from None

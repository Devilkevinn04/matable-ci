# Déploiement automatique sur le VPS Hostinger

Le timer a été installé et son premier déploiement automatique a réussi le
8 novembre 2026. La procédure d’installation ci-dessous sert à reconstruire le
service d’automatisation si nécessaire ; ne la relancez pas sur le VPS déjà
configuré.

Le timer systemd vérifie la branche `main` toutes les deux minutes. Quand un
nouveau commit apparaît, le VPS clone ce commit, construit l’image avec le
Dockerfile Hostinger (qui exécute lint, tests et build), puis remplace seulement
le service `web` de MaTable. Le conteneur PostgreSQL et les autres applications
du VPS ne sont pas redémarrés.

Le déploiement attend jusqu’à trois minutes que le contrôle de santé passe. En
cas d’échec, il restaure `release.env` et relance l’image précédente. Les
constructions et les opérations sont journalisées dans systemd. Il n’y a ni clé
SSH ni secret GitHub à configurer : le dépôt est cloné en lecture seule depuis
GitHub.

## Installation initiale

Après avoir poussé ces fichiers sur `main`, connectez-vous au VPS et exécutez
ce bloc. Il télécharge la révision actuelle, installe le script et le timer,
puis active la vérification périodique :

```sh
set -eu
RELEASE=/srv/apps/matable/releases/auto-deploy-setup
if [ -e "$RELEASE" ]; then
  echo "Le dossier $RELEASE existe déjà ; arrêtez-vous et demandez de l’aide."
  exit 1
fi

git clone --depth 1 --branch main \
  https://github.com/Devilkevinn04/matable-ci.git "$RELEASE"
install -o root -g root -m 0750 \
  "$RELEASE/infra/hostinger/auto-deploy.sh" \
  /usr/local/sbin/matable-auto-deploy
install -o root -g root -m 0644 \
  "$RELEASE/infra/hostinger/matable-auto-deploy.service" \
  /etc/systemd/system/matable-auto-deploy.service
install -o root -g root -m 0644 \
  "$RELEASE/infra/hostinger/matable-auto-deploy.timer" \
  /etc/systemd/system/matable-auto-deploy.timer
systemctl daemon-reload
systemctl enable --now matable-auto-deploy.timer
systemctl status --no-pager matable-auto-deploy.timer
```

Le script ne déploie pas les branches de fonctionnalité : seules les
modifications poussées sur `main` sont candidates. L’installation du timer ne
redémarre pas l’application ; le premier passage ne fait rien si l’image
actuellement déployée correspond déjà au dernier commit.

## Vérification et arrêt

```sh
systemctl list-timers matable-auto-deploy.timer
journalctl -u matable-auto-deploy.service -n 100 --no-pager
```

Pour suspendre les déploiements automatiques sans arrêter MaTable :

```sh
systemctl disable --now matable-auto-deploy.timer
```

L’image précédente et les copies de `release.env` sont conservées sur le VPS.
Un changement de schéma de base non rétrocompatible ou une opération de
maintenance nécessitant une fenêtre d’arrêt doit toujours être planifié
séparément ; le retour arrière automatique porte sur l’image applicative.

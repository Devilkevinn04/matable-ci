# Publier MaTable sur Hostinger

Le dépôt utilise un seul flux de livraison : une branche de travail courte,
une pull request vers `main`, puis une approbation SSH du SHA fusionné. Il n’y a
pas de branche de release à fusionner ensuite vers `production`. Le VPS suit
`main`, mais ne déploie que le SHA explicitement approuvé.

Après la fusion de la pull request, récupérer le SHA complet de `main`, vérifier
les changements de schéma et les variables nécessaires, puis lancer depuis le
VPS :

```sh
make -f /srv/apps/matable/Makefile production-approve VERSION=<sha-complet-de-main>
make -f /srv/apps/matable/Makefile production-status
```

Le timer lance alors le build et le déploiement ; aucune mise à jour de
`MATABLE_RELEASE_SHA` dans Portainer n’est nécessaire. Portainer reste réservé
à la configuration et aux secrets du stack, pas à la sélection du commit.

Lors de la migration initiale, `main` doit d’abord être synchronisée avec la
version déjà en production. La pull request de synchronisation peut donc
contenir les commits précédemment publiés uniquement sur `production`. Après
cette opération unique, les nouvelles pull requests ciblent `main`.

## Variables de production

Dans la pull request, ajouter les noms et exemples dans `.env.production.example`, et préciser le rôle de chaque variable, si elle est obligatoire, et si elle s’applique au serveur ou à la compilation.

L’exploitant renseigne les variables serveur dans `/srv/apps/matable/shared/app.env` avant d’approuver le SHA. Ce fichier privé contient les valeurs de production. Transmettre les secrets par un canal prévu à cet effet et garder uniquement les noms et exemples dans Git.

Pour la vérification manuelle des commerçants, ajouter dans ce fichier `R2_PRIVATE_BUCKET`, `R2_PRIVATE_ENDPOINT`, `R2_PRIVATE_ACCESS_KEY_ID` et `R2_PRIVATE_SECRET_ACCESS_KEY`. Utiliser un bucket privé distinct du bucket média public, sans domaine public, et un jeton limité à la lecture/écriture des objets de ce seul bucket. Les variables ajoutées à un autre stack Portainer ne configurent pas `matable-web` si ce service n’est pas défini dans ce stack.

Après déploiement du parcours de vérification MFA, les avis aux comptes
existants qui ont déjà une adresse e-mail peuvent être envoyés avec la commande
suivante. Elle est idempotente : les destinataires déjà traités ne reçoivent
pas de doublon.

```sh
docker exec matable-web node /app/scripts/send-email-mfa-rollout-notices.mjs
```

Les commerçants sans adresse ne peuvent pas recevoir de courriel ; ils doivent
être informés par un autre canal. Leur parcours de connexion permet ensuite
d’ajouter et de vérifier une adresse avec leur numéro et leur PIN.

Les valeurs `VITE_*` sont publiques et intégrées au navigateur à la compilation. Le script transmet `VITE_WHATSAPP_ADMIN_PHONE` à Docker. Pour ajouter une autre variable de ce type, déclarer aussi son argument dans le Dockerfile et le transmettre dans le script de déploiement.

## Compression et cache des ressources web

Le domaine de production passe par Caddy. Les ressources de build dont le nom contient une empreinte reçoivent désormais un cache navigateur d’un an (`immutable`); le HTML reste renouvelable. Pour compresser les réponses du serveur, ajouter ces directives dans le bloc du domaine du Caddyfile actif :

```caddyfile
encode zstd gzip
header /assets/* Cache-Control "public, max-age=31536000, immutable"
```

Le dépôt ne contient pas le Caddyfile chargé sur le VPS : ces directives ne prennent effet qu’après leur ajout à cette configuration active et son rechargement. Vérifier ensuite une ressource `/assets/*.js` avec `Accept-Encoding: gzip, br` : la réponse doit inclure `Content-Encoding` et un `Cache-Control` à longue durée. Ne pas modifier le proxy Portainer ou le mode de publication de l’application pour appliquer ce réglage.

Pour une migration de schéma, valider son exécution sur une copie de la base avant l’approbation. Le VPS conserve une sauvegarde PostgreSQL vérifiée avant chaque remplacement du conteneur. Le retour arrière rétablit l’image précédente. Prévoir la compatibilité du schéma avec cette image.

## Sauvegardes PostgreSQL quotidiennes

Le service `matable-postgres-backup.timer` lance chaque nuit une sauvegarde PostgreSQL dans `/srv/apps/matable/backups`. Le script valide l’archive avec `pg_restore --list`, écrit son empreinte SHA-256 et conserve 14 jours de sauvegardes programmées. Les sauvegardes pré-déploiement ne sont pas concernées par cette purge.

Après avoir revu le script et les unités du commit approuvé, l’exploitant les installe une fois sur le VPS :

```sh
install -o root -g root -m 0750 /srv/apps/matable/current/infra/hostinger/backup-postgres.sh /usr/local/sbin/matable-postgres-backup
install -o root -g root -m 0644 /srv/apps/matable/current/infra/hostinger/matable-postgres-backup.service /etc/systemd/system/matable-postgres-backup.service
install -o root -g root -m 0644 /srv/apps/matable/current/infra/hostinger/matable-postgres-backup.timer /etc/systemd/system/matable-postgres-backup.timer
systemctl daemon-reload
systemctl enable --now matable-postgres-backup.timer
systemctl start matable-postgres-backup.service
systemctl status matable-postgres-backup.service --no-pager
systemctl list-timers matable-postgres-backup.timer --no-pager
```

Consulter les exécutions avec `journalctl -u matable-postgres-backup.service`. Cette politique conserve les sauvegardes sur le VPS uniquement : elle ne protège pas contre la perte ou l’indisponibilité de ce serveur. Une copie hors site devra être configurée séparément.

## Outils du VPS

Le service systemd exécute
`/usr/local/sbin/matable-portainer-deploy`; ce script doit rester identique à
`infra/hostinger/portainer-deploy.py` dans le dépôt. Le timer regarde `main`
environ toutes les deux minutes et vérifie que le SHA approuvé par SSH est
toujours sa tête. Le build exécute `make check` dans Docker, sauvegarde et
valide PostgreSQL avant de remplacer le service Web. En cas d’échec, la
configuration et l’image précédentes sont restaurées ; une nouvelle
approbation SSH est nécessaire pour réessayer.

Après fusion de la pull request qui modifie les outils de livraison, récupérer
`main` sur le poste de travail et transférer les deux fichiers approuvés :

```sh
git switch main
git pull --ff-only origin main
scp infra/hostinger/portainer-deploy.py root@72.61.102.243:/tmp/matable-portainer-deploy.new
scp Makefile root@72.61.102.243:/tmp/matable-Makefile.new
```

Puis, sur le VPS, installer ces fichiers, approuver la tête actuelle de `main`
et vérifier le statut :

```sh
python3 -m py_compile /tmp/matable-portainer-deploy.new
install -o root -g root -m 0750 /tmp/matable-portainer-deploy.new /usr/local/sbin/matable-portainer-deploy
install -o root -g root -m 0644 /tmp/matable-Makefile.new /srv/apps/matable/Makefile
rm -- /tmp/matable-portainer-deploy.new /tmp/matable-Makefile.new
make -f /srv/apps/matable/Makefile production-approve VERSION=<sha-complet-de-main>
make -f /srv/apps/matable/Makefile production-status
```

Les chemins Compose et de déploiement restent sous
`/srv/apps/matable/current/infra/hostinger/`; les versions construites se
trouvent dans `/srv/apps/matable/releases/`. Ne modifie pas l’override systemd
Portainer : il pointe déjà vers le script actif. La prochaine publication se
fait uniquement par PR vers `main`, puis `production-approve` en SSH.

## Portainer

Sur ton poste, ouvrir le tunnel et le laisser tourner :

```sh
ssh -NT -o ExitOnForwardFailure=yes -L 127.0.0.1:19000:127.0.0.1:9000 root@72.61.102.243
```

Ouvrir `http://127.0.0.1:19000` et se connecter avec le compte `admin`. Le mot de passe initial est dans `/srv/apps/matable/portainer/admin-password` et est lisible uniquement par root. Dans l’environnement local, ouvrir `Containers`, puis `matable-web` pour voir son état ou ses logs. Le timer et Docker Compose pilotent la publication. Le compte Portainer d’administration est réservé à l’exploitant du VPS.

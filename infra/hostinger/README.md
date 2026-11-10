# Publier MaTable sur Hostinger

Kevin prépare une branche et lance `npm ci` puis `make check` avant d’ouvrir sa pull request vers `main`. Après la revue, il indique le SHA complet à publier. L’exploitant fait avancer `production` jusqu’à ce SHA après avoir vérifié les variables et les éventuelles migrations. Le déploiement tourne sur le VPS, indépendamment de GitHub Actions.

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

## Publication sur le VPS

Après avoir fait avancer la branche `production` vers le commit revu, se connecter au VPS et utiliser le Makefile installé et détenu par root :

```sh
make -f /srv/apps/matable/Makefile production-approve VERSION=<sha-complet>
make -f /srv/apps/matable/Makefile production-status
```

Le timer regarde `production` environ toutes les deux minutes et exige que sa tête corresponde au SHA approuvé sur le VPS. La construction exécute `make check`, puis le service remplace le conteneur web. En cas d’échec de démarrage, il remet l’image précédente et suspend la révision jusqu’à une nouvelle approbation. Après la publication, ouvrir le site et tester la fonctionnalité modifiée.

Le script et le Makefile installés sont entretenus par l’exploitant. Pour les actualiser, vérifier le changement dans le dépôt puis installer les fichiers approuvés aux chemins `/usr/local/sbin/matable-auto-deploy` et `/srv/apps/matable/Makefile`. La configuration Docker Compose du VPS demeure sous `/srv/apps/matable/current/infra/hostinger/` et les versions construites sous `/srv/apps/matable/releases/`.

## Portainer

Sur ton poste, ouvrir le tunnel et le laisser tourner :

```sh
ssh -NT -o ExitOnForwardFailure=yes -L 127.0.0.1:19000:127.0.0.1:9000 root@72.61.102.243
```

Ouvrir `http://127.0.0.1:19000` et se connecter avec le compte `admin`. Le mot de passe initial est dans `/srv/apps/matable/portainer/admin-password` et est lisible uniquement par root. Dans l’environnement local, ouvrir `Containers`, puis `matable-web` pour voir son état ou ses logs. Le timer et Docker Compose pilotent la publication. Le compte Portainer d’administration est réservé à l’exploitant du VPS.

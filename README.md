# MaTable.ci

Le backend Express existant reste la source de vérité métier. La fondation de
passerelle multiservice est documentée dans
[docs/MULTISERVICE_MIGRATION.md](./docs/MULTISERVICE_MIGRATION.md) ; elle ne
déplace aucune route métier pour l’instant.

Application React + Vite + Express pour la gestion de vitrines locales, de commandes WhatsApp et de tableaux de bord MaTable.ci.

## État actuel

- Les demandes de commande utilisent le click-to-chat WhatsApp (`wa.me`). Les paiements d’abonnement et de boosts sont intégrés avec KadevPay; les rappels d’échéance WhatsApp Business nécessitent une configuration fournisseur et le consentement du commerçant.
- Une commande client est enregistrée localement, puis le client ouvre manuellement un reçu prérempli vers le WhatsApp du vendeur.
- Le prix d’une commande est recalculé côté serveur à partir du catalogue et des options sélectionnées.
- La publication (`publication_status`) est distincte de l’ouverture (`is_open`). Une boutique n’est publique que si elle est publiée, éligible KYC et couverte par un essai ou un abonnement actif, ou encore dans ses deux jours de grâce après échéance. Elle est masquée ensuite sans suppression de ses données ni blocage de l’accès marchand ; `is_open` contrôle uniquement la prise de commandes.
- Le stockage local et les tests utilisent SQLite (`better-sqlite3`). En production (`NODE_ENV=production`), le serveur utilise PostgreSQL via `DATABASE_URL` (Neon recommandé). Les écritures de commandes et de stock sont transactionnelles.
- Les sessions marchand et super-admin sont sécurisées via cookies `HttpOnly` et contrôles de sécurité sur les tentatives.
- La gestion de stock est protégée contre les oversells concurrentiels.
- Les nouvelles boutiques démarrent en `not_started`. Elles peuvent commencer un essai Standard de 7 jours (2 produits maximum), ou payer directement Standard (3 000), Premium (5 000) ou Pro (8 000 FCFA/mois).
- Pendant l’essai, l’identité est vérifiée avant l’accès au dashboard. Une boutique vérifiée doit ensuite être publiée explicitement ; son ouverture commerciale reste contrôlée séparément.
- Les notifications Push navigateur sont facultatives et activées appareil par appareil dans « Plus > Paramètres > Compte > Notifications ». Elles couvrent les commandes, les passages de stock bas/épuisé, les échéances J−14/J−7/J−3/J−1, les changements Didit et les annonces envoyées depuis le centre opérationnel admin. Les rappels WhatsApp restent séparés.

## Espace commerçant

Le dashboard propose les vues Accueil, Produits, Commandes et Statistiques, avec une navigation mobile à cinq onglets ; les réglages, le partage, l’abonnement, les boosts et l’assistance sont regroupés dans « Plus ». Le catalogue, le suivi des commandes, les horaires, l’apparence, la vérification, les rappels d’échéance consentis et les statistiques sont disponibles selon l’état de la boutique et le forfait.

Les limites sont vérifiées côté serveur : Standard permet 30 produits et 2 photos par produit, Premium 100 produits et 5 photos, Pro un nombre illimité de produits et jusqu’à 6 photos. Les statistiques couvrent respectivement 7, 30 et 90 jours. L’essai reste limité à 2 produits et bénéficie des statistiques sur 7 jours.

Les fonctions suivantes ne sont pas encore disponibles dans le dashboard : comptes d’équipe, import CSV des produits, export CSV des commandes, codes promotionnels, programme de parrainage et téléchargement d’un QR code de boutique. Le partage actuel donne accès aux liens de vitrine et d’accès privé ; il ne génère pas encore de kit visuel personnalisé.

## Démarrage local

Prérequis : Node.js 22 LTS recommandé.

1. Installer les dépendances :
   `npm install`
2. Configurer le fichier `.env` à partir de `.env.example`
3. Démarrer l’application :
   `npm run dev`

L’application est disponible sur : `http://localhost:3000`
En développement, la clé KYC peut rester vide (clé fixe réservée aux données de test) ; n’y stockez pas de vrais documents d’identité.

## Configuration requise

### Variables d’environnement

```env
NODE_ENV="development"
PORT="3000"
MATABLE_DB_PATH="./data/matable.db"
DATABASE_URL="postgresql://..."
APP_URL="http://localhost:3000"
TRUST_PROXY_HOPS="0"
ADMIN_ACCESS_KEY="CHANGE_ME_ADMIN_KEY"
DIDIT_API_KEY=""
DIDIT_WORKFLOW_ID=""
DIDIT_WEBHOOK_SECRET=""
VAPID_PUBLIC_KEY=""
VAPID_PRIVATE_KEY=""
VAPID_SUBJECT="mailto:assistance@matable.ci"
GOOGLE_OAUTH_CLIENT_ID=""
GOOGLE_OAUTH_CLIENT_SECRET=""
APPLE_SERVICE_ID=""
APPLE_TEAM_ID=""
APPLE_KEY_ID=""
APPLE_PRIVATE_KEY=""

VITE_WHATSAPP_ADMIN_PHONE=""
RESEND_API_KEY=""
RESEND_FROM_EMAIL="MaTable.ci <welcome@exemple.com>"
EMAIL_FROM="MaTable.ci <welcome@exemple.com>"
KADEVPAY_PUBLIC_KEY=""
KADEVPAY_WEBHOOK_SECRET=""
```

### Production / Neon PostgreSQL

En production, `NODE_ENV=production` sélectionne PostgreSQL et `DATABASE_URL`; le fichier SQLite n’est alors pas ouvert. Au premier démarrage, le serveur crée les tables de base si nécessaire, puis applique de façon idempotente les évolutions de schéma. Le runner versionné peut aussi être exécuté explicitement après la création du schéma de base avec `npm run migrate:neon`. Les migrations sont additives : elles ne copient ni ne réécrivent les données métier existantes.

Le fil public interroge le catalogue par lots paginés côté base, au lieu de charger tous les produits à chaque visite. Le CDN peut ainsi mettre en cache les pages publiques sans que chaque rendu du fil transfère le catalogue entier depuis PostgreSQL.

Le workflow GitHub Actions « PostgreSQL integration » exécute le lint, les tests et un test de migrations/adaptateur sur un PostgreSQL temporaire. Pour valider un environnement Neon séparément, exécutez `DATABASE_URL=<URL-de-la-base-de-test> npm run test:postgres`; n’utilisez jamais l’URL de production pour ce test.

### Sauvegarde PostgreSQL et validation de restauration

`npm run db:backup` utilise `DATABASE_URL` (en production, celle configurée dans Render) et `pg_dump` au format custom. Il refuse d’écraser un fichier existant, vérifie l’archive avec `pg_restore --list` et produit un fichier SHA-256 adjacent (`.dump.sha256`). Exemple avec un chemin choisi :

```sh
npm run db:backup -- --output backups/matable-prod-2026-10-10.dump
```

Installez les outils client PostgreSQL (`pg_dump`, `pg_restore` et `psql`) dans l’environnement d’exécution, avec une version compatible avec le serveur. Le dossier local `backups/` est ignoré par Git et ne constitue pas un stockage durable. L’opérateur doit configurer séparément une planification (par exemple un ordonnanceur externe) et la copie chiffrée vers un stockage indépendant, avec rétention et contrôle d’accès adaptés. **Aucune planification ni destination de stockage externe n’est configurée par ce dépôt ; les sauvegardes ne sont donc pas déclarées opérationnelles tant que ces responsabilités externes ne sont pas mises en place et vérifiées.** Les fichiers de sauvegarde contiennent des données de production : ne les commitez pas et protégez-les comme des secrets.

Pour tester réellement une restauration, créez d’abord une base PostgreSQL jetable dont le schéma applicatif `public` est vide, distincte de la production. Le script exige la confirmation `--confirm-disposable`, vérifie le SHA-256, compare source et cible, autorise les schémas système du fournisseur mais refuse tout objet applicatif déjà présent dans `public`, restaure uniquement `public` sans supprimer d’objets existants et compare les nombres de lignes des tables métier principales avec la source. Lancez d’abord le préflight non destructif :

```sh
export DATABASE_URL='postgresql://…' # base source utilisée pour protéger la production
export RESTORE_TARGET_DATABASE_URL='postgresql://…' # base jetable vide, jamais la production
npm run db:restore:validate -- --dump backups/matable-prod-2026-10-10.dump --confirm-disposable --preflight-only
```

Après confirmation qu’il s’agit bien d’une base jetable, relancez cette commande sans `--preflight-only` pour effectuer la restauration. Alternative : passer la cible explicitement avec `--target-url '<URL-de-la-base-jetable>'`. Ne mettez jamais une URL avec identifiants dans des journaux ou scripts versionnés. La validation peuple la cible ; supprimez/recréez cette base avant un nouvel essai. Pour une vérification manuelle du checksum : `(cd backups && shasum -a 256 -c matable-prod-2026-10-10.dump.sha256)`. N’exécutez jamais cette procédure avec une cible de production.

Les commandes de sauvegarde et de validation chargent `.env` automatiquement. Pour migrer vers une autre base PostgreSQL, conserver l’URL source dans `DATABASE_URL` (ou `SOURCE_DATABASE_URL`) et placer temporairement l’URL cible dans `RESTORE_TARGET_DATABASE_URL` (ou `TARGET_DATABASE_URL`); une cible explicite peut aussi être passée à `--target-url`. Pour Supabase, copier l’URI **Session pooler** depuis **Connect** et y remplacer le marqueur `[YOUR-PASSWORD]` par le mot de passe réel de la base. Créer d’abord une archive avec `npm run db:backup`, puis lancer le préflight avec `--preflight-only`. La validation vérifie le checksum, protège la source, refuse tout objet applicatif préexistant dans `public` et ne restaure que ce schéma (jamais les schémas gérés par Supabase). Effectuer la restauration seulement dans une base jetable confirmée ; garder Neon actif jusqu’à validation complète et retour arrière prêt avant une bascule Render.

#### Migration Neon vers Supabase PostgreSQL

Supabase Free n’inclut pas de sauvegardes automatiques, met en pause les projets inactifs et offre actuellement 500 Mo de base et 5 Go de transfert réseau par mois. Une migration ne supprime donc pas à elle seule le risque de quota de transfert : limiter les réponses SQL, garder les pages publiques en cache et surveiller l’egress après bascule. La taille de la base (environ 39 Mo au moment de la migration) est distincte du transfert réseau cumulé.

1. Créer un projet Supabase dans la région proche des utilisateurs/déploiement, avec Data API désactivée si l’application n’utilise que son propre serveur PostgreSQL. Générer un mot de passe dédié et le conserver uniquement dans le gestionnaire de secrets.
2. Faire une sauvegarde locale de Neon avec `npm run db:backup -- --output backups/matable-neon-<date>.dump`.
3. Ajouter temporairement l’URL PostgreSQL Supabase, obtenue dans **Connect**, à `RESTORE_TARGET_DATABASE_URL` dans `.env`. Ne la coller ni dans le dépôt, ni dans un ticket, ni dans le chat.
4. Restaurer l’archive avec la commande de validation ci-dessus. La cible doit être neuve/vide ; ne jamais restaurer sur Neon ni sur une base avec des données.
5. Vérifier que les comptages de lignes des tables principales correspondent. Lancer les migrations si nécessaire avec `DATABASE_URL=<cible> npm run migrate:neon`, puis tester une version de préproduction contre Supabase avant la production.
6. Au créneau de bascule, arrêter les écritures applicatives, refaire une sauvegarde finale, restaurer cette dernière sur Supabase, remplacer le secret `DATABASE_URL` du service Render par l’URL Supabase, redéployer et contrôler l’état de santé, les boutiques, produits, commandes et paiements.
7. Garder Neon intact comme secours jusqu’à vérification des commandes et paiements après bascule. Ne pas supprimer Neon avant une période d’observation et une sauvegarde restaurable hors fournisseur.

Une URL de connexion PostgreSQL est un secret d’accès complet. Utiliser l’URL directe ou le pooler de session Supabase selon la connectivité réseau de Render ; un pooler transactionnel n’est pas adapté à tous les usages de session PostgreSQL. Supabase Free n’offre pas de sauvegarde gérée : planifier `db:backup`, chiffrer l’archive avant de la copier vers un stockage indépendant, et exécuter périodiquement une restauration sur une base jetable.


Exemple de configuration :

```env
NODE_ENV="production"
PORT="3000"
DATABASE_URL="postgresql://..."
APP_URL="https://matable-ci.onrender.com"
TRUST_PROXY_HOPS="1"
ADMIN_ACCESS_KEY="<cle-tres-longue-et-securisee>"
DIDIT_API_KEY="<cle-api-didit>"
DIDIT_WORKFLOW_ID="<uuid-du-workflow-didit>"
DIDIT_WEBHOOK_SECRET="<secret-webhook-didit>"
```

Dans la console Didit, configurez le webhook `https://<domaine-public>/api/webhooks/didit` pour les événements de changement de statut (`status.updated`). L’API key, l’identifiant du workflow et le secret du webhook restent dans les variables serveur Render et ne doivent jamais être exposés au navigateur. Le serveur refuse de démarrer une vérification tant que l’API key et l’identifiant de workflow ne sont pas configurés.

Tant que le domaine personnalisé `matable.ci` n’est pas résolu et configuré dans Render, utilisez `https://matable-ci.onrender.com` comme `APP_URL`. Les URL canoniques et de partage dans `index.html` doivent également correspondre à l’adresse publique active ; remettez-les à `https://matable.ci` après validation du domaine personnalisé.

#### Audience et actions super-admin

Les statistiques d’audience sont collectées uniquement après consentement analytique. Les liens `?src=tiktok`, `?utm_source=instagram` et `?utm_campaign=campagne_nom` attribuent la visite consentie à une campagne (identifiant limité à 80 caractères alphanumériques, tirets et tirets bas). L’onglet Audience présente l’origine, les campagnes, les sessions, les commandes, le volume de ventes associé et les clics WhatsApp attribués ; il ne conserve pas les URL complètes de provenance. Les boutiques créées et les clics WhatsApp sont aussi résumés sur 7 jours dans Abonnements.

Les actions super-admin de suspension/réactivation exigent un motif, une confirmation et sont consignées. La correction manuelle d’une échéance d’abonnement actif demande une date et un motif de vérification ; elle ne confirme pas un paiement et ne doit être utilisée qu’après contrôle d’un justificatif. Les corrections d’essai synchronisent uniquement l’expiration technique avec la fin d’essai enregistrée.


### Base Neon gratuite sur Render

Créer le projet Neon puis configurer `DATABASE_URL` dans Render. Le service Render Free n’a pas besoin d’un disque local persistant pour les données métier lorsque Neon est utilisé.

### Renouvellements KadevPay

KadevPay encaisse les abonnements mensuels ou annuels des commerçants ainsi que les boosts. L’annuel facture 10 mensualités pour 12 mois de service. Les commandes des clients restent payées directement aux boutiques. Configurer `KADEVPAY_PUBLIC_KEY` et le secret HMAC `KADEVPAY_WEBHOOK_SECRET` dans Render, puis déclarer l’endpoint `https://<domaine-public>/api/webhooks/kadevpay` dans le tableau de bord KadevPay. Le serveur n’active l’abonnement ou le boost qu’après un webhook signé correspondant à l’intention et au montant attendus. Commencer avec les clés de test; les paiements réels nécessitent un compte KadevPay vérifié et un compte de versement configuré.

Les échéances restent actives jusqu’à la fin de leur date civile en Côte d’Ivoire; l’écran de renouvellement apparaît le lendemain. Le statut effectif passe à `past_due` pendant le délai de grâce, puis `suspended` et la boutique est masquée publiquement. Les données et l’accès marchand sont conservés afin de permettre le renouvellement. Si les secrets WhatsApp Business sont configurés, le serveur envoie les rappels à J−14, J−7, J−3 et J−1 uniquement aux commerçants ayant activé l’opt-in dans « Mon forfait ». Chaque échéance et chaque palier sont enregistrés pour éviter les doublons; un échec fournisseur est journalisé et peut être retenté. Changer le numéro WhatsApp révoque l’accord. Configurer dans Render `WHATSAPP_CLOUD_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_SUBSCRIPTION_REMINDER_TEMPLATE` et `WHATSAPP_GRAPH_API_VERSION`. Le modèle Meta doit être approuvé comme modèle utilitaire et contenir deux paramètres de corps : le nom de la boutique et sa date d’échéance. L’envoi automatique dépend de ces identifiants secrets Meta et de l’approbation du modèle; aucune valeur secrète ne doit être placée dans le dépôt. Le code ne déclenche aucun prélèvement automatique : le commerçant doit toujours ouvrir le checkout KadevPay et confirmer le paiement.

### Notifications Push navigateur

Générez une paire VAPID dédiée au serveur, par exemple avec `npx web-push generate-vapid-keys`, puis configurez `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` et `VAPID_SUBJECT` dans les variables d’environnement de Render et en local. Le sujet doit être une URL HTTPS du service ou une adresse `mailto:` de support. La clé privée reste exclusivement côté serveur : ne la placez ni dans une variable `VITE_*`, ni dans le dépôt, ni dans un ticket ou une capture. Sans les trois variables, l’interface indique que le service n’est pas configuré et aucun abonnement Push ne peut être créé.

Chaque commerçant choisit explicitement ses appareils et peut les désabonner dans ses paramètres. Les abonnements sont liés à la boutique authentifiée ; les endpoints expirés (HTTP 404/410) sont supprimés. Les envois sont dédupliqués et les échecs sont journalisés sans annuler la commande, la modification du stock ou la vérification d’identité à l’origine de l’alerte. Les Push exigent HTTPS (Render le fournit) et l’autorisation du navigateur. Le centre opérationnel admin affiche le nombre d’appareils associés, l’état VAPID, l’historique des annonces et permet leur diffusion uniquement aux appareils abonnés.

Après confirmation d’un abonnement par un webhook KadevPay signé et vérifié, un reçu est généré et envoyé à l’adresse e-mail du propriétaire via Resend. Configurer `RESEND_API_KEY` et une adresse d’expédition vérifiée dans `RESEND_FROM_EMAIL` (ou `EMAIL_FROM`). Aucun reçu d’abonnement n’est émis à partir d’une simple déclaration de paiement côté navigateur. La validation locale ne prouve pas le fonctionnement d’un compte KadevPay ou Resend en production : un paiement réel exige les identifiants et domaines vérifiés des fournisseurs.

## Règles métier

L’essai marchand Standard reste gratuit pendant 7 jours et permet deux produits. Les tarifs mensuels sont Standard 3 000 FCFA, Premium 5 000 FCFA et Pro 8 000 FCFA; l’annuel coûte 10 mensualités pour 12 mois de service. Le délai de grâce avant masquage est de deux jours. Un boost de 24 h, 3 jours ou 7 jours coûte respectivement 1 000, 1 500 ou 2 000 FCFA; Pro donne 15 % de remise. Chaque achat choisit un seul emplacement au même tarif : accueil, haut de catégorie ou boutiques de la ville. Cinq créneaux simultanés sont disponibles sur l’accueil, par catégorie ou par ville selon l’emplacement; les réservations payées débutent au premier créneau libre. Une boutique doit être vérifiée, ouverte et présenter au moins deux produits. Le bilan d’un boost présente les visites consenties de la vitrine et les clics WhatsApp suivis sur sa période; il ne s’agit pas d’une mesure de ventes ni d’une garantie de portée. Les boosts courent pendant leur durée prévue même si la vitrine est masquée. Après activation, les paiements ne sont pas remboursables, sauf impossibilité de MaTable.ci d’activer le service payé, auquel cas le commerçant peut demander un remboursement à l’assistance.

Les valeurs initiales de catégorie (message, présentation, exemples de produits, palette et illustrations) sont centralisées dans `src/utils/categoryDefaults.ts`. Les illustrations produit sont des placeholders d’affichage : `image_url` reste vide tant qu’aucune photo réelle n’est fournie. Les anciennes valeurs génériques connues sont remplacées à l’affichage, sans migration automatique des boutiques ou produits existants.

## WhatsApp

Le projet utilise uniquement le click-to-chat `wa.me`. Le navigateur prépare le reçu de commande et le client choisit lui-même de l’envoyer au vendeur.

## Connexion Google et Apple

La connexion sociale client est facultative et reste masquée tant qu’un fournisseur n’est pas entièrement configuré. Les secrets restent uniquement dans l’environnement serveur. Déclarez dans les consoles OAuth les URL de retour exactes `https://votre-domaine/api/auth/customer-oauth/google/callback` et `https://votre-domaine/api/auth/customer-oauth/apple/callback`, puis renseignez les identifiants correspondants ci-dessus (ou dans Render). En local, utilisez l’URL et le port configurés dans `APP_URL`.

Les jetons OIDC sont vérifiés côté serveur avec issuer, audience, nonce, PKCE et e-mail vérifié. Une identité sociale dont l’e-mail vérifié correspond à un compte client existant est liée à ce compte; un nouveau compte doit fournir un téléphone ivoirien avant sa création. Les commandes et sessions restent associées au même profil client. Google/Apple ne peuvent pas être activés en production avant la configuration des identifiants et URL autorisées dans leurs consoles.

## Sécurité et vérifications

- `npm run archive:release` crée un ZIP des fichiers suivis ou non ignorés du dépôt. Il exclut les fichiers `.env` (sauf les modèles), les bases et journaux SQLite dans `data/`, ainsi que `node_modules`, `dist`, `build` et les archives précédentes. Contrôlez toujours la liste avant envoi avec `npm run archive:release -- --dry-run`.
- Si une archive contenant une clé ou une base de données a déjà été partagée, considérez ces secrets et données comme compromis : renouvelez les clés concernées via les paramètres de déploiement et n’envoyez plus cette archive.
- Les routes marchand exigent une session `HttpOnly`, son empreinte de requête et une boutique active.
- Les routes admin exigent une session admin séparée.
- Express ne fait confiance aux en-têtes proxy que si `TRUST_PROXY_HOPS` est explicitement configuré pour l’infrastructure réelle.
- La vérification d’identité des commerçants est effectuée sur le parcours hébergé de Didit après consentement explicite. Seuls l’identifiant de session, le statut fourni par Didit et les éléments techniques nécessaires au traitement idempotent des webhooks sont conservés par MaTable.ci. Le serveur authentifie les webhooks et aucune décision d’identité ne peut être saisie manuellement par un administrateur.

## Checklist de production

Avant un déploiement réel, vérifiez bien les points suivants :

1. Définir un `ADMIN_ACCESS_KEY` fort et unique.
2. Définir `APP_URL` avec l’URL publique exacte du site.
3. Définir `PORT` et `DATABASE_URL` explicitement dans l’environnement de production.
4. Vérifier qu’aucun ancien process Node n’écoute déjà sur le port cible.
5. Vérifier que `/api/admin/health` indique `postgresql` en production et que les comptes de boutiques, produits et commandes correspondent aux données attendues.
6. Ne jamais exposer la clé admin ni les secrets serveur dans le navigateur.
7. Laisser les boutiques non actives hors du directory public.
8. Tester le flux complet : création boutique → commande → ouverture du reçu WhatsApp du vendeur.
9. Vérifier le comportement de stock avec un test de surcharge sur le dernier article disponible.
10. Vérifier `npm audit` et corriger les vulnérabilités avant mise en production.
11. Configurer `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID` et `DIDIT_WEBHOOK_SECRET` dans Render, puis déclarer l’URL webhook Didit et tester le parcours hébergé ainsi que les événements signés.

## Déploiement rapide

```bash
export NODE_ENV=production
export ADMIN_ACCESS_KEY="<clé très forte>"
export APP_URL="https://votre-domaine.com"
export PORT="3000"
export MATABLE_DB_PATH="./data/matable.db" # développement/tests uniquement
```

Puis :

```bash
npm run build
npm start
```

## Déploiement recommandé

Cette version finale est un serveur Node/Express avec Neon PostgreSQL. Déployez-la sur Render, Railway, Fly.io ou un VPS et configurez `DATABASE_URL` avec une base PostgreSQL persistante.

Vercel convient au frontend statique, mais ne doit pas héberger directement ce serveur Express avec une base locale. Une base PostgreSQL externe est nécessaire.

Variables de production minimales : `NODE_ENV=production`, `APP_URL=https://votre-domaine`, `PORT` fourni par l’hébergeur, `DATABASE_URL`, `ADMIN_ACCESS_KEY` longue et unique (générée automatiquement par Render si elle n’est pas configurée manuellement), les trois variables Didit et `TRUST_PROXY_HOPS` adapté au reverse proxy.

## Build production

```bash
npm run build
npm start
```
# Fondement multiservice (phase passerelle)

Le serveur actuel reste la source de vérité métier. Une passerelle HTTP
optionnelle et un environnement Compose local permettent de la conserver
derrière un point d’entrée stable, sans déplacer prématurément les domaines.
Consultez [la stratégie de migration multiservice](./docs/MULTISERVICE_MIGRATION.md)
pour le démarrage local, les contrats actuels et les garde-fous de migration.

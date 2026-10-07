# MaTable.ci

Le backend Express existant reste la source de vérité métier. La fondation de
passerelle multiservice est documentée dans
[docs/MULTISERVICE_MIGRATION.md](./docs/MULTISERVICE_MIGRATION.md) ; elle ne
déplace aucune route métier pour l’instant.

Application React + Vite + Express pour la gestion de vitrines locales, de commandes WhatsApp et de tableaux de bord MaTable.ci.

## État actuel

- Les commandes utilisent le click-to-chat WhatsApp (`wa.me`). Les paiements intégrés et les notifications automatiques ne font pas partie de la V1.
- Une commande client est enregistrée localement, puis le client ouvre manuellement un reçu prérempli vers le WhatsApp du vendeur.
- Le prix d’une commande est recalculé côté serveur à partir du catalogue et des options sélectionnées.
- La publication (`publication_status`) est distincte de l’ouverture (`is_open`). Une boutique n’est publique que si elle est publiée, éligible KYC et couverte par un essai ou un abonnement actif. Après l’échéance, elle reste visible pendant le délai de grâce de deux jours ; `is_open` contrôle uniquement la prise de commandes.
- Le stockage local et les tests utilisent SQLite (`better-sqlite3`). En production (`NODE_ENV=production`), le serveur utilise PostgreSQL via `DATABASE_URL` (Neon recommandé). Les écritures de commandes et de stock sont transactionnelles.
- Les sessions marchand et super-admin sont sécurisées via cookies `HttpOnly` et contrôles de sécurité sur les tentatives.
- La gestion de stock est protégée contre les oversells concurrentiels.
- Les nouvelles boutiques démarrent en `not_started`. Elles peuvent commencer un essai Standard de 7 jours (2 produits maximum), ou payer directement Standard (3 000), Premium (5 000) ou Pro (8 000 FCFA/mois).
- Pendant l’essai, l’identité est vérifiée avant l’accès au dashboard. Une boutique vérifiée doit ensuite être publiée explicitement ; son ouverture commerciale reste contrôlée séparément.

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
KYC_ENCRYPTION_KEY=""
GOOGLE_OAUTH_CLIENT_ID=""
GOOGLE_OAUTH_CLIENT_SECRET=""
APPLE_SERVICE_ID=""
APPLE_TEAM_ID=""
APPLE_KEY_ID=""
APPLE_PRIVATE_KEY=""

VITE_WHATSAPP_ADMIN_PHONE=""
KADEVPAY_PUBLIC_KEY=""
KADEVPAY_WEBHOOK_SECRET=""
```

### Production / Neon PostgreSQL

En production, `NODE_ENV=production` sélectionne PostgreSQL et `DATABASE_URL`; le fichier SQLite n’est alors pas ouvert. Au premier démarrage, le serveur crée les tables de base si nécessaire, puis applique de façon idempotente les évolutions de schéma. Le runner versionné peut aussi être exécuté explicitement après la création du schéma de base avec `npm run migrate:neon`. Les migrations sont additives : elles ne copient ni ne réécrivent les données métier existantes.

Le workflow GitHub Actions « PostgreSQL integration » exécute le lint, les tests et un test de migrations/adaptateur sur un PostgreSQL temporaire. Pour valider un environnement Neon séparément, exécutez `DATABASE_URL=<URL-de-la-base-de-test> npm run test:postgres`; n’utilisez jamais l’URL de production pour ce test.


Exemple de configuration :

```env
NODE_ENV="production"
PORT="3000"
DATABASE_URL="postgresql://..."
APP_URL="https://matable.ci"
TRUST_PROXY_HOPS="1"
ADMIN_ACCESS_KEY="<cle-tres-longue-et-securisee>"
KYC_ENCRYPTION_KEY="<secret-persistant-d-au-moins-32-caracteres>"
```


### Base Neon gratuite sur Render

Créer le projet Neon puis configurer `DATABASE_URL` dans Render. Le service Render Free n’a pas besoin d’un disque local persistant pour les données métier lorsque Neon est utilisé.

### Renouvellements KadevPay

KadevPay encaisse les abonnements mensuels ou annuels des commerçants ainsi que les boosts. L’annuel facture 10 mensualités pour 12 mois de service. Les commandes des clients restent payées directement aux boutiques. Configurer `KADEVPAY_PUBLIC_KEY` et le secret HMAC `KADEVPAY_WEBHOOK_SECRET` dans Render, puis déclarer l’endpoint `https://<domaine-public>/api/webhooks/kadevpay` dans le tableau de bord KadevPay. Le serveur n’active l’abonnement ou le boost qu’après un webhook signé correspondant à l’intention et au montant attendus. Commencer avec les clés de test; les paiements réels nécessitent un compte KadevPay vérifié et un compte de versement configuré.

Les échéances restent actives jusqu’à la fin de leur date civile en Côte d’Ivoire; l’écran de renouvellement apparaît le lendemain. Le serveur vérifie les statuts toutes les 15 minutes et envoie un rappel WhatsApp Business à 48 heures de l’échéance uniquement aux commerçants ayant activé l’opt-in dans « Mon forfait ». Changer le numéro WhatsApp révoque cet accord. Pour l’envoi automatique, configurer dans Render `WHATSAPP_CLOUD_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_SUBSCRIPTION_REMINDER_TEMPLATE` et `WHATSAPP_GRAPH_API_VERSION`. Le modèle Meta doit être approuvé comme modèle utilitaire et contenir deux paramètres de corps : le nom de la boutique et sa date d’échéance. Le code ne déclenche aucun prélèvement automatique : le commerçant doit toujours ouvrir le checkout KadevPay et confirmer le paiement.

## Règles métier

L’essai marchand Standard reste gratuit pendant 7 jours et permet deux produits. Les tarifs mensuels sont Standard 3 000 FCFA, Premium 5 000 FCFA et Pro 8 000 FCFA; l’annuel coûte 10 mensualités pour 12 mois de service. Le délai de grâce avant masquage est de deux jours. Un boost de 7, 15 ou 30 jours coûte respectivement 2 000, 2 800 ou 3 000 FCFA; Pro donne 15 % de remise. Une boutique doit être vérifiée, ouverte et présenter au moins cinq produits. Cinq boosts peuvent être actifs simultanément par ville et catégorie; les réservations payées débutent au premier créneau disponible. Les boosts courent pendant leur durée prévue même si la vitrine est masquée. Après activation, les paiements ne sont pas remboursables, sauf impossibilité de MaTable.ci d’activer le service payé, auquel cas le commerçant peut demander un remboursement à l’assistance.

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
- Le prototype KYC utilise la caméra du navigateur pour capturer le recto, le verso et le selfie ; OCR et comparaison faciale sont exécutés localement. Les images et les champs extraits sont chiffrés côté serveur ; le numéro de document est indexé par HMAC. Configurez une `KYC_ENCRYPTION_KEY` persistante d’au moins 32 caractères en production et ne la faites jamais tourner sans procédure de rechiffrement.
- Les dossiers restent systématiquement en revue manuelle : les contrôles OCR/Face Match sont exécutés dans le navigateur et peuvent être falsifiés par un client modifié. Le score facial n’est pas une probabilité et aucun contrôle de liveness ou d’authenticité documentaire n’est effectué. Ce prototype n’est pas une vérification certifiée.

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
11. Configurer `KYC_ENCRYPTION_KEY`, puis tester les captures caméra recto/verso/selfie, l’acceptation locale, la revue des cas incertains et l’accès privé aux médias.

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

Variables de production minimales : `NODE_ENV=production`, `APP_URL=https://votre-domaine`, `PORT` fourni par l’hébergeur, `DATABASE_URL`, `ADMIN_ACCESS_KEY` longue et unique (générée automatiquement par Render si elle n’est pas configurée manuellement), `KYC_ENCRYPTION_KEY` persistante et `TRUST_PROXY_HOPS` adapté au reverse proxy.

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

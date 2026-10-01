# MaTable.ci

Application React + Vite + Express pour la gestion de vitrines locales, de commandes WhatsApp et de tableaux de bord MaTable.ci.

## État actuel

- Les commandes utilisent le click-to-chat WhatsApp (`wa.me`). Les paiements intégrés et les notifications automatiques ne font pas partie de la V1.
- Une commande client est enregistrée localement, puis le client ouvre manuellement un reçu prérempli vers le WhatsApp du vendeur.
- Le prix d’une commande est recalculé côté serveur à partir du catalogue et des options sélectionnées.
- La publication (`publication_status`) est distincte de l’ouverture (`is_open`). Une boutique n’est publique que si elle est publiée, éligible KYC et couverte par un essai ou un abonnement actif ; `is_open` contrôle uniquement la prise de commandes.
- Le stockage local et les tests utilisent SQLite (`better-sqlite3`). En production (`NODE_ENV=production`), le serveur utilise PostgreSQL via `DATABASE_URL` (Neon recommandé). Les écritures de commandes et de stock sont transactionnelles.
- Les sessions marchand et super-admin sont sécurisées via cookies `HttpOnly` et contrôles de sécurité sur les tentatives.
- La gestion de stock est protégée contre les oversells concurrentiels.
- Les nouvelles boutiques démarrent en `not_started`. Le propriétaire choisit Standard (3 000), Premium (4 000) ou Pro (5 000 FCFA/mois), puis déclenche son essai gratuit de 30 jours ; aucun paiement n’est demandé à ce stade.
- Pendant l’essai, l’identité est vérifiée avant l’accès au dashboard. Le catalogue d’essai est limité à 6 articles. Une boutique vérifiée doit ensuite être publiée explicitement ; son ouverture commerciale reste contrôlée séparément.

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

WHATSAPP_ADMIN_PHONE="+2250700000000"
# Les paiements intégrés et les notifications automatiques WhatsApp ne sont pas utilisés dans la V1.
```

### Production / Neon PostgreSQL

En production, `NODE_ENV=production` sélectionne PostgreSQL et `DATABASE_URL`; le fichier SQLite n’est alors pas ouvert. Au premier démarrage, le serveur crée les tables de base si nécessaire, puis applique de façon idempotente les évolutions de schéma. Le runner versionné peut aussi être exécuté explicitement après la création du schéma de base avec `npm run migrate:neon`. Les migrations sont additives : elles ne copient ni ne réécrivent les données métier existantes.


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

## Règles métier

Les prix Standard/Premium/Pro sont affichés et le choix est conservé au démarrage de l’essai. Les paiements réels, les renouvellements et la différenciation des fonctionnalités par forfait ne sont pas encore activés.

Les valeurs initiales de catégorie (message, présentation, exemples de produits, palette et illustrations) sont centralisées dans `src/utils/categoryDefaults.ts`. Les illustrations produit sont des placeholders d’affichage : `image_url` reste vide tant qu’aucune photo réelle n’est fournie. Les anciennes valeurs génériques connues sont remplacées à l’affichage, sans migration automatique des boutiques ou produits existants.

## WhatsApp

Le projet utilise uniquement le click-to-chat `wa.me`. Le navigateur prépare le reçu de commande et le client choisit lui-même de l’envoyer au vendeur.

## Sécurité et vérifications

- Les routes marchand exigent une session `HttpOnly`, son empreinte de requête et une boutique active.
- Les routes admin exigent une session admin séparée.
- Express ne fait confiance aux en-têtes proxy que si `TRUST_PROXY_HOPS` est explicitement configuré pour l’infrastructure réelle.
- Le prototype KYC utilise la caméra du navigateur pour capturer le recto, le verso et le selfie ; OCR et comparaison faciale sont exécutés localement. Les images et les champs extraits sont chiffrés côté serveur ; le numéro de document est indexé par HMAC. Configurez une `KYC_ENCRYPTION_KEY` persistante d’au moins 32 caractères en production et ne la faites jamais tourner sans procédure de rechiffrement.
- Les dossiers sont automatiquement acceptés uniquement si les contrôles locaux OCR/Face Match passent ; les cas incertains sont envoyés en revue manuelle. Le score facial n’est pas une probabilité et aucun contrôle de liveness ou d’authenticité documentaire n’est effectué. Ce prototype n’est pas une vérification certifiée et ses décisions automatiques sont falsifiables par un client modifié.

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

# MaTable.ci

Application React + Vite + Express pour la gestion de vitrines locales, de commandes WhatsApp et de tableaux de bord MaTable.ci.

## État actuel

- Les commandes utilisent le click-to-chat WhatsApp (`wa.me`). Les paiements intégrés et les notifications automatiques ne font pas partie de la V1.
- Une commande client est enregistrée localement, puis le client ouvre manuellement un reçu prérempli vers le WhatsApp du vendeur.
- Le prix d’une commande est recalculé côté serveur à partir du catalogue et des options sélectionnées.
- Le stockage local et les tests utilisent SQLite (`better-sqlite3`). En production (`NODE_ENV=production`), le serveur utilise PostgreSQL via `DATABASE_URL` (Neon recommandé). Les écritures de commandes et de stock sont transactionnelles.
- Les sessions marchand et super-admin sont sécurisées via cookies `HttpOnly` et contrôles de sécurité sur les tentatives.
- La gestion de stock est protégée contre les oversells concurrentiels.
- Les nouvelles boutiques démarrent avec un essai gratuit serveur de 30 jours (`shop.subscription`). Le paiement reste désactivé et aucune fonction principale n’est bloquée pendant cette phase.

## Démarrage local

Prérequis : Node.js 22 LTS recommandé.

1. Installer les dépendances :
   `npm install`
2. Configurer le fichier `.env` à partir de `.env.example`
3. Démarrer l’application :
   `npm run dev`

L’application est disponible sur : `http://localhost:3000`

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
```


### Base Neon gratuite sur Render

Créer le projet Neon puis configurer `DATABASE_URL` dans Render. Le service Render Free n’a pas besoin d’un disque local persistant pour les données métier lorsque Neon est utilisé.

## Règles métier

Toutes les boutiques disposent gratuitement de la même expérience : vitrine publique, catalogue, stock, commandes WhatsApp et personnalisation. Les anciennes colonnes de forfait restent conservées uniquement pour compatibilité avec les bases existantes ; elles ne différencient plus aucune fonctionnalité.

Les valeurs initiales de catégorie (message, présentation, exemples de produits, palette et illustrations) sont centralisées dans `src/utils/categoryDefaults.ts`. Les illustrations produit sont des placeholders d’affichage : `image_url` reste vide tant qu’aucune photo réelle n’est fournie. Les anciennes valeurs génériques connues sont remplacées à l’affichage, sans migration automatique des boutiques ou produits existants.

## WhatsApp

Le projet utilise uniquement le click-to-chat `wa.me`. Le navigateur prépare le reçu de commande et le client choisit lui-même de l’envoyer au vendeur.

## Sécurité et vérifications

- Les routes marchand exigent une session `HttpOnly`, son empreinte de requête et une boutique active.
- Les routes admin exigent une session admin séparée.
- Express ne fait confiance aux en-têtes proxy que si `TRUST_PROXY_HOPS` est explicitement configuré pour l’infrastructure réelle.

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

Variables de production minimales : `NODE_ENV=production`, `APP_URL=https://votre-domaine`, `PORT` fourni par l’hébergeur, `DATABASE_URL`, `ADMIN_ACCESS_KEY` longue et unique (générée automatiquement par Render si elle n’est pas configurée manuellement), et `TRUST_PROXY_HOPS` adapté au reverse proxy.

## Build production

```bash
npm run build
npm start
```

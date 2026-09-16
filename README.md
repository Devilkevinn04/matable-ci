# MaTable.ci

Application React + Vite + Express pour la gestion de vitrines locales, de commandes WhatsApp et de tableaux de bord MaTable.ci.

## État actuel

- Les paiements Paystack et les notifications WhatsApp Cloud sont désactivés et verrouillés pour une amélioration future.
- Une commande client est enregistrée localement, puis le client ouvre manuellement un reçu prérempli vers le WhatsApp du vendeur.
- Le prix d’une commande est recalculé côté serveur à partir du catalogue et des options sélectionnées.
- SQLite est initialisé dans `data/matable.db` ; boutiques, produits, stocks, commandes et abonnements restent persistants après redémarrage.
- Les sessions marchand et super-admin sont sécurisées via cookies `HttpOnly` et contrôles de sécurité sur les tentatives.
- La gestion de stock est protégée contre les oversells concurrentiels.

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
DATABASE_URL=""
APP_URL="http://localhost:3000"
TRUST_PROXY_HOPS="0"
ADMIN_ACCESS_KEY="CHANGE_ME_ADMIN_KEY"

WHATSAPP_ADMIN_PHONE="+2250700000000"
# Les variables Cloud WhatsApp et Paystack ne sont pas utilisées tant que les intégrations restent verrouillées.
```

### Production / PostgreSQL / Neon

Pour un déploiement réel en production, un stockage durable externe est requis.

- `DATABASE_URL` doit être configuré avec une URL Postgres/Neon.
- L’application ne démarre pas en production si `DATABASE_URL` est absent.
- Le code SQLite local reste compatible pour le développement local et les tests.
- La migration vers PostgreSQL doit inclure les tables `shops`, `products`, `orders`, `analytics_events` et `payment_transactions`.

Exemple de configuration Neon :

```env
NODE_ENV="production"
PORT="3000"
DATABASE_URL="postgres://user:password@host.neon.tech/neondb?sslmode=require"
APP_URL="https://matable.ci"
TRUST_PROXY_HOPS="1"
ADMIN_ACCESS_KEY="<cle-tres-longue-et-securisee>"
```

Les anciennes routes Paystack et de notification Cloud répondent `410 Gone`. Elles sont conservées comme points d’extension, mais aucun secret d’environnement ne peut les réactiver.

## Règles métier

Toutes les boutiques disposent gratuitement de la même expérience : vitrine publique, catalogue, stock, commandes WhatsApp, personnalisation complète, promotions et studio marketing. Les anciennes colonnes de forfait restent conservées uniquement pour compatibilité avec les bases existantes ; elles ne différencient plus aucune fonctionnalité.

## WhatsApp

Le projet utilise uniquement le click-to-chat `wa.me`. Le navigateur prépare le reçu de commande et le client choisit lui-même de l’envoyer au vendeur.

## Sécurité et vérifications

- Les routes marchand exigent une session `HttpOnly`, son empreinte de requête et une boutique active.
- Les routes admin exigent une session admin séparée.
- Les endpoints historiques Paystack/WhatsApp Cloud sont verrouillés et ne traitent aucune requête.
- Express ne fait confiance aux en-têtes proxy que si `TRUST_PROXY_HOPS` est explicitement configuré pour l’infrastructure réelle.

## Checklist de production

Avant un déploiement réel, vérifiez bien les points suivants :

1. Définir un `ADMIN_ACCESS_KEY` fort et unique.
2. Définir `APP_URL` avec l’URL publique exacte du site.
3. Définir `PORT` et `MATABLE_DB_PATH` explicitement dans l’environnement de production.
4. Vérifier qu’aucun ancien process Node n’écoute déjà sur le port cible.
5. Vérifier les droits d’écriture du dossier `data/`.
6. Ne jamais exposer la clé admin ni les secrets Paystack dans le navigateur.
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
export MATABLE_DB_PATH="./data/matable.db"
```

Puis :

```bash
npm run build
npm start
```

## Déploiement recommandé

Cette version finale est un serveur Node/Express avec SQLite persistant. Déployez-la sur Railway, Render, Fly.io ou un VPS avec un volume persistant monté pour `data/`. Configurez `MATABLE_DB_PATH` dans ce volume et utilisez `npm run build` puis `npm start`.

Vercel convient au frontend statique, mais ne doit pas héberger directement ce serveur avec SQLite local : le système de fichiers des fonctions est éphémère et les processus ne sont pas persistants. Pour utiliser Vercel complètement, il faudra d’abord remplacer SQLite par PostgreSQL ou un autre stockage externe, puis adapter les routes serveur aux fonctions Vercel.

Variables de production minimales : `NODE_ENV=production`, `APP_URL=https://votre-domaine`, `PORT` fourni par l’hébergeur, `MATABLE_DB_PATH` sur le volume persistant, `ADMIN_ACCESS_KEY` longue et unique, et `TRUST_PROXY_HOPS` adapté au reverse proxy.

## Build production

```bash
npm run build
npm start
```

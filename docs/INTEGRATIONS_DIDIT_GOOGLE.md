# Vérifier Didit et Google en production

État constaté le 31/10/2026 sur `https://matable-ci.onrender.com`.

## Ce qui est déjà en place

| Élément | Statut | Preuve |
|---|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` / `SECRET` | Configurés | `GET /api/auth/customer-oauth/providers` → `{"google":true}` |
| URI de retour Google | Acceptée par Google | `/start` redirige vers l’écran de connexion Google (pas de `redirect_uri_mismatch`) |
| `DIDIT_WORKFLOW_ID` | **Publié** (corrigé le 30/10/2026) | UUID `17e1d727…` = « Free KYC », statut `published`, v1 |
| `DIDIT_API_KEY` | Valide | `GET /v3/session/<uuid>/` → 404 (clé acceptée) |
| `DIDIT_WEBHOOK_SECRET` | Configuré et **identique au secret Didit** | Sonde signée le 31/10 : `POST /api/webhooks/didit` → 503 « session inconnue » (signature acceptée), et 401 avec une signature invalide |
| Destination webhook | Correcte, mais 35 % d’échecs sur 30 jours | `https://matable-ci.onrender.com/api/webhooks/didit`, v3, `status.updated`, enabled ; 24 échecs / 68 livraisons |
| Domaines de retour | Aucune restriction | `allowed_return_hosts: []` → le callback `/app?verification=complete` est accepté |
| Crédits Didit | ❌ **solde 0,00 $** | `GET /v3/billing/balance/` → `0.0000`, auto-refill désactivé (relevé du 31/10) |
| Déploiement des améliorations | ⏳ **pas encore actif** | La prod sert encore l’ancien bundle (`MerchantIdentityVerification-D6o6L99C.js`, sans « Reprendre ma vérification ») alors que `main` est à `d6d9a94` |

## Workflow Didit : résolu

Le workflow référencé dans `render.yaml` était en brouillon. Il a été publié le 30/10/2026 via l’API de management (`PATCH /v3/workflows/17e1d727…/` avec `{"status":"published"}`).

| Workflow | ID | Statut | Fonctionnalités | Prix |
|---|---|---|---|---|
| Free KYC | `17e1d727-c4db-425b-a320-eadd52105735` | **published** v1 | OCR + LIVENESS + FACE_MATCH + IP_ANALYSIS | 0,33 $ |

Aucun changement de code n’a été nécessaire. Contrôle :

```bash
DIDIT_WORKFLOW_ID=17e1d727-c4db-425b-a320-eadd52105735 npm run check:integrations
```

Attendu : `PASS Workflow Didit « Free KYC » publié`.

URI de retour Google à conserver dans Google Cloud Console :

```
https://matable-ci.onrender.com/api/auth/customer-oauth/google/callback
```

URL de webhook à conserver dans la console Didit (destinations) :

```
https://matable-ci.onrender.com/api/webhooks/didit
```

Événement à souscrire : `status.updated` (le serveur ignore les autres types).

## Confirmer `DIDIT_API_KEY`

Clé confirmée le 30/10/2026 : `PASS Clé API Didit acceptée (404 attendu sur la session sonde)`.

Pour la revalider ou la remplacer :
1. Ouvrir Render → service `matable-ci` → Environment.
2. Vérifier que `DIDIT_API_KEY` existe et n’est pas vide.
3. Récupérer la valeur depuis la console Didit : *Developers → API keys* (clé primaire de l’application).
4. La placer dans le `.env` local (ou l’exporter dans le shell), puis lancer :

```bash
node scripts/check-integrations.mjs
```

Le script ne crée aucune session : il interroge une session inexistante.
Un `404` (ou `403` pour une clé restreinte) signifie que la clé est acceptée ; un `401` signifie qu’elle est invalide.

### Variante manuelle (sans le script)

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "x-api-key: $DIDIT_API_KEY" \
  https://verification.didit.me/v3/session/00000000-0000-4000-8000-000000000000/
```

- `404` / `403` → clé valide
- `401` → clé invalide ou révoquée

## Test de bout en bout — Google (client)

1. Ouvrir `https://matable-ci.onrender.com/connexion`.
2. Cliquer sur **Continuer avec Google**, choisir un compte de test.
3. Vérifier le retour sur `/compte` (ou `return_to`), sans paramètre `oauth=error`.
4. Dans la base :
   - `SELECT * FROM users WHERE email = '<email test>';`
   - `SELECT * FROM customer_oauth_identities WHERE provider = 'google';`
5. Refaire une connexion : l’utilisateur doit être reconnu via `customer_oauth_identities` sans doublon.
6. Cas d’erreur : refuser le consentement Google → retour sur `/connexion?oauth=error`.

## Test de bout en bout — Didit marchand

> Utiliser une **boutique de test**. Lancer une vérification passe la boutique en `draft` (ou `suspended`) jusqu’au résultat.

1. Se connecter au tableau de bord marchand de la boutique de test.
2. Ouvrir **Vérification d’identité**, cocher le consentement, cliquer sur **Continuer avec Didit**.
3. Contrôler la redirection vers `https://verify.didit.me/...` (si erreur 503, la clé API manque).
4. Terminer le parcours hébergé, revenir sur `/app?verification=complete`.
5. Dans la console Didit → **Deliveries** : la livraison vers `/api/webhooks/didit` doit être en `200`.
6. Dans la base :
   - `SELECT session_id, shop_id, status, consent_version FROM didit_verification_sessions ORDER BY created_at DESC LIMIT 1;`
   - `SELECT event_id, received_at FROM didit_webhook_events ORDER BY received_at DESC LIMIT 1;`
   - `SELECT merchant_verification_status, publication_status FROM shops WHERE id = <boutique>;`
   - `SELECT actor, action, details FROM admin_audit_logs WHERE actor = 'didit_webhook' ORDER BY created_at DESC LIMIT 1;`
7. Résultat attendu : statut `verified` après webhook `Approved`, boutique republiable.

## Test de bout en bout — Didit livreur

1. Ouvrir `/livreur`, créer un compte de test, donner le consentement.
2. Vérifier `didit_available: true` dans la réponse de session (clé API + workflow résolus).
3. Terminer le parcours Didit ; le webhook signé doit passer le livreur en `active` et attribuer les zones actives.
4. Vérifier ensuite le choix des zones puis le forfait GeniusPay (hors périmètre Didit).

## Tests négatifs webhook

```bash
# Sans signature : doit répondre 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'Content-Type: application/json' -d '{}' \
  https://matable-ci.onrender.com/api/webhooks/didit

# Signature invalide : doit répondre 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'Content-Type: application/json' \
  -H 'X-Timestamp: '$(date +%s) \
  -H 'X-Signature: deadbeef' \
  -d '{"event_id":"00000000-0000-4000-8000-000000000000","session_id":"00000000-0000-4000-8000-000000000000","status":"Approved","webhook_type":"status.updated","timestamp":'$(date +%s)'}' \
  https://matable-ci.onrender.com/api/webhooks/didit
```

## Améliorations appliquées le 30/10/2026

| # | Amélioration | Comportement |
|---|---|---|
| 1 | Reprise de session | `session_url` est enregistrée et renvoyée par `GET /api/shops/:id/identity-verification`. Un bouton « Reprendre ma vérification » rouvre la session Didit. Une session sans webhook ouverte depuis plus de 30 minutes peut être relancée. |
| 2 | Limitation | `POST /identity-verification/session` est limité à 5 tentatives par fenêtre, et à 3 sessions terminées par boutique sur 30 jours (au-delà : message « contactez l’assistance »). |
| 3 | Retour Didit | `/app?verification=complete` ouvre l’onglet vérification, rafraîchit immédiatement, puis toutes les 10 s pendant 2 minutes avant de revenir à 60 s. |
| 4 | Raison du refus | Sur un webhook `Declined`, le serveur appelle `GET /v3/session/{id}/decision/` et ne conserve que les statuts de contrôle et codes de risque (`decline_reasons`), traduits en conseils français. Aucune image ni donnée personnelle n’est stockée ou renvoyée. |
| 6 | Budget | Le panneau admin affiche le nombre de sessions terminées dans le mois (marchand + livreur) et alerte à 25. |
| 7 | Préparation | Checklist affichée avant la redirection (pièce valide, originale, lisible, visage dégagé). Le diagnostic vérifie que CNI, passeport et permis ivoiriens sont acceptés par le workflow. |
| 8 | `Kyc Expired` | La boutique reste dépubliée, mais le marchand reçoit une notification explicite « session expirée, relancez la vérification » et l’écran affiche un message dédié. |

Migration à appliquer avant le déploiement :

```bash
npm run migrate:neon
```

Elle ajoute `session_url`, `decline_reasons`, `decision_fetched_at` et l’index de comptage (`migrations/043_didit_session_resume.sql`). Les colonnes sont aussi ajoutées automatiquement au démarrage via `postgresMigrations` dans `db.ts`. Tests : `tests/didit-verification-improvements.test.ts`.

La récupération des raisons de refus appelle `GET /v3/session/{id}/decision/` : la clé `DIDIT_API_KEY` doit porter le droit `read:sessions`. En cas de `403`, le statut reste correct mais les conseils détaillés ne s’affichent pas.

## Déploiement Render — action requise

Le 31/10/2026, `main` est à `d6d9a94` mais la production sert encore l’ancien bundle. Vérification : le chunk `MerchantIdentityVerification-D6o6L99C.js` ne contient pas « Reprendre ma vérification ».

- Le build de `d6d9a94` a été rejoué depuis une archive propre : `tsc`, `vite build`, `esbuild` et les 227 tests passent. Le blocage n’est donc pas dans le code.
- `render.yaml` déclare maintenant explicitement `branch: main` et `autoDeploy: true`. Si le service est piloté par un Blueprint Render, la synchronisation de ce fichier doit réactiver les déploiements.
- Sinon : Render → service `matable-ci` → **Manual Deploy → Deploy latest commit**.
- Après déploiement, vérifier que `/health` répond 200 et que le bundle contient « Reprendre ma vérification ». Les colonnes de la migration 043 sont appliquées au démarrage par `initializeDatabase()`.

## Crédits Didit — action requise

Au 31/10/2026, le solde est de **0,00 $** avec l’auto-refill désactivé. La création de session renverra une erreur 400 « not enough credits » tant que le compte n’est pas approvisionné.

Deux options :

1. **Attendre le 1er novembre 2026** : le plan gratuit inclut désormais **10 $ de crédit par mois** (pour les organisations inscrites avec un e-mail professionnel), soit environ 30 vérifications. Vérifier le solde ce jour-là.
2. **Recharger immédiatement** : ouvrir [business.didit.me](https://business.didit.me) → **Billing**, ou créer un lien de paiement Stripe sans engagement :

```bash
curl -s -X POST https://verification.didit.me/v3/billing/top-up/ \
  -H "x-api-key: $DIDIT_API_KEY" -H "Content-Type: application/json" \
  -d '{"amount_in_dollars":50,
       "success_url":"https://matable-ci.onrender.com/app?billing=success",
       "cancel_url":"https://matable-ci.onrender.com/app?billing=cancelled"}'
```

Le lien `checkout_session_url` renvoyé ne débite rien tant qu’il n’est pas payé. Vérifier ensuite :

```bash
curl -s -H "x-api-key: $DIDIT_API_KEY" \
  https://verification.didit.me/v3/billing/balance/
```

À 0,33 $ par vérification, 50 $ couvrent environ 150 sessions.

## Rotation du secret webhook

Le secret de destination doit rester identique à `DIDIT_WEBHOOK_SECRET` dans Render. Au 31/10/2026, la sonde signée prouve que les deux correspondent. Une rotation reste recommandée puisque le secret a été affiché dans un journal de diagnostic ; l’API `PATCH /v3/webhook/destinations/{uuid}/` ne fait **pas** tourner le secret, la rotation se fait uniquement dans la console.

1. Déployer d’abord la version qui accepte les en-têtes `X-Signature-V2-Previous` / `X-Signature-Previous` (ajoutée le 30/10/2026, testée dans `tests/didit-webhook-signature.test.ts`).
2. Console Didit → destination « matable.ci » → faire tourner le secret.
3. Copier le nouveau secret dans Render → `DIDIT_WEBHOOK_SECRET`, puis redéployer **dans les 24 h**.
4. Pendant l’intervalle, le serveur accepte les signatures `-Previous` signées avec l’ancien secret, donc aucune livraison n’est perdue.

## Point d’attention code

`server/services/didit.ts` vérifie `X-Signature-V2` en recanonicalisant le JSON (clés triées, Unicode préservé). En JavaScript, `1.0` est déjà sérialisé en `1`, donc aucune normalisation de flottants supplémentaire n’est nécessaire. Le repli sur `X-Signature` (HMAC des octets bruts) reste disponible car la route webhook utilise `express.raw`. Les en-têtes `-Previous` sont désormais acceptés pendant une rotation.
